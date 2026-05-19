import { app, BrowserWindow, ipcMain, shell, dialog, Menu } from "electron";
import path from "node:path";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import { createWriteStream } from "node:fs";
import http from "node:http";
import https from "node:https";
import { spawn } from "node:child_process";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import extract from "extract-zip";
import Store from "electron-store";
import DiscordRPC from "discord-rpc";

import { initializeApp } from "firebase/app";
import {
  getFirestore,
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  addDoc,
  serverTimestamp
} from "firebase/firestore";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const APP_NAME = "UPA Games Launcher";

let mainWindow = null;
let firestoreDb = null;
let discordRpcClient = null;
let discordReady = false;
let currentDiscordActivityGame = null;
let currentDiscordClientId = null;

const store = new Store({
  name: "upa-games-launcher-settings",
  defaults: {
    discordPresenceEnabled: true,
    discordUser: null
  }
});

const DISCORD_INVITE_URL = "https://discord.gg/5fgAE5ShJA";
const DEFAULT_RESTRICTED_ROLE_ID = "1506147510228353084";

const appRoot = path.resolve(__dirname, "..");

// Folder aplikacji. Po zbudowaniu .exe może wskazywać na app.asar.
// Nadaje się do odczytu plików aplikacji, np. config i assets.
const projectRoot = appRoot;

// Folder danych użytkownika.
// Po zbudowaniu .exe NIE zapisujemy do app.asar ani Program Files.
const dataRoot = app.isPackaged
  ? path.join(app.getPath("appData"), "UPA Games Launcher")
  : appRoot;

const gamesDir = path.join(dataRoot, "games");
const tempDir = path.join(dataRoot, "temp");
const iconsDir = path.join(dataRoot, "icons");
const installedDbPath = path.join(dataRoot, "installed-games.json");
const windowIconPath = path.join(__dirname, "renderer", "assets", "upa-logo.png");
const packageJsonPath = path.join(projectRoot, "package.json");

function getConfigPath() {
  return path.join(projectRoot, "config", "firebase.json");
}

function getDiscordConfigPath() {
  return path.join(projectRoot, "config", "discord.json");
}

async function getDiscordConfig() {
  return readJson(getDiscordConfigPath(), {
    enabled: false,
    clientId: "",
    serverInvite: DISCORD_INVITE_URL,
    redirectUri: "http://127.0.0.1/callback"
  });
}

function getLaunchGameArg() {
  const arg = process.argv.find(value => value.startsWith("--launch-game="));
  if (!arg) return null;
  return arg.replace("--launch-game=", "").trim() || null;
}

async function getLauncherVersion() {
  // W wersji zbudowanej .exe wersja musi pochodzić z metadanych aplikacji.
  // app.getVersion() zwraca wersję wpisaną w package.json w momencie budowania instalatora.
  if (app.isPackaged) {
    return app.getVersion() || "0.0.0";
  }

  // W trybie dev czytamy package.json z folderu projektu.
  try {
    const raw = await fs.readFile(packageJsonPath, "utf8");
    const pkg = JSON.parse(raw);
    return pkg.version || app.getVersion() || "0.0.0";
  } catch {
    return app.getVersion() || "0.0.0";
  }
}

async function ensureStorage() {
  await fs.mkdir(gamesDir, { recursive: true });
  await fs.mkdir(tempDir, { recursive: true });
  await fs.mkdir(iconsDir, { recursive: true });

  if (!fsSync.existsSync(installedDbPath)) {
    await fs.writeFile(installedDbPath, JSON.stringify({ games: {} }, null, 2), "utf8");
  }
}

async function readJson(filePath, fallback) {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

async function writeJson(filePath, data) {
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), "utf8");
}

function getPlatformKey() {
  if (process.platform === "win32") return "windows";
  if (process.platform === "darwin") return "mac";
  return "linux";
}

function getPlatformLabel(platformKey = getPlatformKey()) {
  if (platformKey === "windows") return "Windows";
  if (platformKey === "mac") return "macOS";
  return "Linux";
}

function pickPlatformValue(data, baseName, platformKey = getPlatformKey()) {
  const suffixMap = {
    windows: ["Windows", "Win", "Win32"],
    linux: ["Linux"],
    mac: ["Mac", "MacOS", "Darwin"]
  };

  const suffixes = suffixMap[platformKey] || [];
  for (const suffix of suffixes) {
    const key = `${baseName}${suffix}`;
    if (data[key]) return data[key];
  }

  if (data.platforms && data.platforms[platformKey] && data.platforms[platformKey][baseName]) {
    return data.platforms[platformKey][baseName];
  }

  return data[baseName] || "";
}

function getAvailablePlatforms(data) {
  const platforms = [];

  const hasWindows = Boolean(data.downloadUrlWindows || data.downloadUrlWin || data.downloadUrlWin32 || data.downloadUrl || data.platforms?.windows?.downloadUrl);
  const hasLinux = Boolean(data.downloadUrlLinux || data.platforms?.linux?.downloadUrl);
  const hasMac = Boolean(data.downloadUrlMac || data.downloadUrlMacOS || data.downloadUrlDarwin || data.platforms?.mac?.downloadUrl);

  if (hasWindows) platforms.push("windows");
  if (hasLinux) platforms.push("linux");
  if (hasMac) platforms.push("mac");

  return platforms;
}

function sanitizeFolderName(value) {
  return String(value || "")
    .trim()
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .slice(0, 100);
}

function sanitizeDiscordAssetKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);
}

function sanitizeShortcutName(value) {
  return String(value || "Game")
    .trim()
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "_")
    .slice(0, 120);
}

function normalizeDownloadUrl(url) {
  if (!url) return url;

  try {
    const parsed = new URL(url);
    if (parsed.hostname.includes("dropbox.com")) {
      parsed.searchParams.set("dl", "1");
    }
    return parsed.toString();
  } catch {
    return url;
  }
}

function toBool(value) {
  return value === true || String(value).toLowerCase() === "true";
}

function getExtensionFromUrl(url, fallback = ".ico") {
  try {
    const parsed = new URL(url);
    const ext = path.extname(parsed.pathname).toLowerCase();
    if ([".ico", ".png", ".jpg", ".jpeg"].includes(ext)) return ext;
  } catch {}
  return fallback;
}


function pickLauncherUpdateUrl(data, platformKey = getPlatformKey()) {
  const suffixMap = {
    windows: ["Windows", "Win", "Win32"],
    linux: ["Linux"],
    mac: ["Mac", "MacOS", "Darwin"]
  };

  for (const suffix of suffixMap[platformKey] || []) {
    const key = `downloadUrl${suffix}`;
    if (data[key]) return data[key];
  }

  if (data.platforms?.[platformKey]?.downloadUrl) {
    return data.platforms[platformKey].downloadUrl;
  }

  return data.downloadUrl || "";
}

function getLauncherInstallerExtension(url, platformKey = getPlatformKey()) {
  try {
    const parsed = new URL(url);
    const ext = path.extname(parsed.pathname);
    if (ext) return ext;
  } catch {}

  if (platformKey === "windows") return ".exe";
  if (platformKey === "linux") return ".AppImage";
  if (platformKey === "mac") return ".dmg";
  return ".bin";
}

function compareVersions(a, b) {
  const left = String(a || "0.0.0").split(".").map(part => Number.parseInt(part, 10) || 0);
  const right = String(b || "0.0.0").split(".").map(part => Number.parseInt(part, 10) || 0);
  const max = Math.max(left.length, right.length);

  for (let i = 0; i < max; i += 1) {
    const x = left[i] || 0;
    const y = right[i] || 0;
    if (x > y) return 1;
    if (x < y) return -1;
  }

  return 0;
}

function assertInside(parentDir, childPath) {
  const parent = path.resolve(parentDir);
  const child = path.resolve(childPath);

  if (child !== parent && !child.startsWith(parent + path.sep)) {
    throw new Error("Niebezpieczna ścieżka poza katalogiem programu.");
  }

  return child;
}

async function initDatabase() {
  if (firestoreDb) return firestoreDb;

  const configPath = getConfigPath();
  if (!fsSync.existsSync(configPath)) {
    throw new Error(`Brak pliku konfiguracyjnego: ${configPath}`);
  }

  const appConfig = JSON.parse(await fs.readFile(configPath, "utf8"));
  const firebaseApp = initializeApp(appConfig);
  firestoreDb = getFirestore(firebaseApp);
  return firestoreDb;
}

async function getInstalledDb() {
  return readJson(installedDbPath, { games: {} });
}

async function saveInstalledDb(data) {
  await writeJson(installedDbPath, data);
}

function emitProgress(payload) {
  if (mainWindow) {
    mainWindow.webContents.send("download-progress", payload);
  }
}

function emitLauncherUpdateProgress(payload) {
  if (mainWindow) {
    mainWindow.webContents.send("launcher-update-progress", payload);
  }
}

async function listCatalogGames() {
  const db = await initDatabase();
  const installedDb = await getInstalledDb();
  const launcherVersion = await getLauncherVersion();

  const q = query(collection(db, "games"), where("active", "==", true));
  const snapshot = await getDocs(q);

  return snapshot.docs.map(docRef => {
    const data = docRef.data();
    const id = data.id || docRef.id;
    const local = installedDb.games[id] || null;
    const platformKey = getPlatformKey();
    const platformLabel = getPlatformLabel(platformKey);
    const selectedDownloadUrl = pickPlatformValue(data, "downloadUrl", platformKey);
    const selectedExecutable = pickPlatformValue(data, "executable", platformKey);
    const selectedFolderName = pickPlatformValue(data, "folderName", platformKey) || data.folderName || id;
    const selectedSizeMb = pickPlatformValue(data, "sizeMb", platformKey) || data.sizeMb || null;
    const availablePlatforms = getAvailablePlatforms(data);
    const platformSupported = Boolean(selectedDownloadUrl && selectedExecutable);
    const minLauncherVersion = data.minLauncherVersion || "0.0.0";
    const launcherCompatible = compareVersions(launcherVersion, minLauncherVersion) >= 0;

    return {
      id,
      name: data.name || id,
      description: data.description || "",
      imageUrl: data.imageUrl || "",
      logoUrl: data.logoUrl || data.gameLogoUrl || "",
      iconUrl: data.iconUrl || "",
      version: data.version || "0.0.0",
      platform: platformKey,
      platformLabel,
      platformSupported,
      availablePlatforms,
      downloadUrl: selectedDownloadUrl,
      executable: selectedExecutable,
      folderName: sanitizeFolderName(selectedFolderName),
      sizeMb: selectedSizeMb,
      changelog: data.changelog || "",
      isNew: toBool(data.isNew),
      minLauncherVersion,
      launcherCompatible,
      restricted: toBool(data.restricted),
      restrictedRoleId: data.restrictedRoleId || DEFAULT_RESTRICTED_ROLE_ID,
      installed: Boolean(local),
      localVersion: local?.version || null,
      updateAvailable: Boolean(local && compareVersions(data.version, local.version) > 0)
    };
  });
}

async function checkLauncherUpdate() {
  const db = await initDatabase();
  const currentVersion = await getLauncherVersion();

  const latestRef = doc(db, "launcher", "latest");
  const latestSnapshot = await getDoc(latestRef);

  if (!latestSnapshot.exists()) {
    return {
      currentVersion,
      updateAvailable: false,
      latestVersion: currentVersion,
      message: "Brak informacji o aktualizacji."
    };
  }

  const data = latestSnapshot.data();
  const activeValue = data.active;
  const isDisabled = activeValue === false || String(activeValue).toLowerCase() === "false";

  if (isDisabled) {
    return {
      currentVersion,
      updateAvailable: false,
      latestVersion: data.version || currentVersion,
      message: "Aktualizacje launchera są wyłączone."
    };
  }

  const latestVersion = data.version || currentVersion;
  const updateAvailable = compareVersions(latestVersion, currentVersion) > 0;
  const platform = getPlatformKey();
  const platformLabel = getPlatformLabel(platform);
  const downloadUrl = pickLauncherUpdateUrl(data, platform);

  return {
    currentVersion,
    latestVersion,
    updateAvailable,
    downloadUrl,
    downloadUrlWindows: data.downloadUrlWindows || data.downloadUrlWin || data.downloadUrlWin32 || data.platforms?.windows?.downloadUrl || "",
    downloadUrlLinux: data.downloadUrlLinux || data.platforms?.linux?.downloadUrl || "",
    downloadUrlMac: data.downloadUrlMac || data.downloadUrlMacOS || data.downloadUrlDarwin || data.platforms?.mac?.downloadUrl || "",
    platform,
    platformLabel,
    platformSupported: Boolean(downloadUrl),
    changelog: data.changelog || "",
    mandatory: data.mandatory === true
  };
}


async function getCommunityFeaturesStatus() {
  const localVersion = await getLauncherVersion();
  const updateInfo = await checkLauncherUpdate();
  const serverVersion = updateInfo.latestVersion || updateInfo.currentVersion || "0.0.0";

  return {
    visible: localVersion === "2.0.0" && serverVersion === "2.0.0",
    localVersion,
    serverVersion,
    requiredVersion: "2.0.0"
  };
}

function downloadFile(url, destinationPath, onProgress, redirectCount = 0) {
  const MAX_REDIRECTS = 8;

  return new Promise((resolve, reject) => {
    if (redirectCount > MAX_REDIRECTS) {
      reject(new Error("Za dużo przekierowań podczas pobierania."));
      return;
    }

    let parsed;
    try {
      parsed = new URL(url);
    } catch {
      reject(new Error("Nieprawidłowy adres pobierania."));
      return;
    }

    const client = parsed.protocol === "https:" ? https : http;

    const request = client.get(parsed, response => {
      const status = response.statusCode || 0;

      if ([301, 302, 303, 307, 308].includes(status)) {
        const location = response.headers.location;
        response.resume();

        if (!location) {
          reject(new Error("Przekierowanie bez nagłówka Location."));
          return;
        }

        const nextUrl = new URL(location, parsed).toString();
        downloadFile(nextUrl, destinationPath, onProgress, redirectCount + 1)
          .then(resolve)
          .catch(reject);
        return;
      }

      if (status < 200 || status >= 300) {
        response.resume();
        reject(new Error(`Pobieranie nieudane. HTTP ${status}`));
        return;
      }

      const total = Number.parseInt(response.headers["content-length"] || "0", 10);
      let downloaded = 0;
      const file = createWriteStream(destinationPath);

      response.on("data", chunk => {
        downloaded += chunk.length;
        if (typeof onProgress === "function") {
          onProgress({
            downloaded,
            total,
            percent: total > 0 ? Math.round((downloaded / total) * 100) : null
          });
        }
      });

      response.pipe(file);

      file.on("finish", () => file.close(resolve));
      file.on("error", async error => {
        try {
          await fs.rm(destinationPath, { force: true });
        } catch {}
        reject(error);
      });
    });

    request.on("error", reject);
    request.setTimeout(300_000, () => {
      request.destroy(new Error("Timeout pobierania."));
    });
  });
}

async function downloadGameIcon(game) {
  if (!game?.iconUrl) return null;

  try {
    await fs.mkdir(iconsDir, { recursive: true });

    const iconUrl = normalizeDownloadUrl(game.iconUrl);
    const iconExt = getExtensionFromUrl(iconUrl, ".ico");
    const iconPath = assertInside(iconsDir, path.join(iconsDir, `${sanitizeFolderName(game.id)}${iconExt}`));

    await fs.rm(iconPath, { force: true });
    await downloadFile(iconUrl, iconPath);

    return iconPath;
  } catch (error) {
    console.warn("Nie udało się pobrać ikony gry:", error);
    return null;
  }
}

async function downloadAndRunLauncherUpdate(updateInfo, options = {}) {
  if (!updateInfo?.downloadUrl) {
    const platformLabel = updateInfo?.platformLabel || getPlatformLabel();
    throw new Error(`Brak instalatora aktualizacji launchera dla systemu ${platformLabel}.`);
  }

  const platform = updateInfo.platform || getPlatformKey();
  const url = normalizeDownloadUrl(updateInfo.downloadUrl);
  const ext = getLauncherInstallerExtension(url, platform);
  const updatePath = assertInside(tempDir, path.join(tempDir, `UPA-Games-Launcher-Update-${updateInfo.latestVersion || "latest"}${ext}`));

  await fs.mkdir(tempDir, { recursive: true });
  await fs.rm(updatePath, { force: true });

  emitLauncherUpdateProgress({
    status: "downloading",
    percent: 0
  });

  await downloadFile(url, updatePath, progress => {
    emitLauncherUpdateProgress({
      status: "downloading",
      ...progress
    });
  });

  if (platform !== "windows") {
    await fs.chmod(updatePath, 0o755).catch(() => {});
  }

  emitLauncherUpdateProgress({
    status: "ready",
    percent: 100
  });

  if (!options.skipPrompt) {
    const confirmed = await dialog.showMessageBox(mainWindow, {
      type: "info",
      title: "Aktualizacja launchera",
      message: "Aktualizacja została pobrana.",
      detail: `Instalator dla systemu ${updateInfo.platformLabel || getPlatformLabel()} zostanie teraz uruchomiony.`,
      buttons: ["Uruchom", "Anuluj"],
      defaultId: 0,
      cancelId: 1
    });

    if (confirmed.response !== 0) {
      return { ok: true, cancelled: true, updatePath };
    }
  }

  if (platform === "mac" && ext.toLowerCase() === ".dmg") {
    await shell.openPath(updatePath);

    setTimeout(() => {
      app.quit();
    }, 700);

    return { ok: true, updatePath, openedWithShell: true };
  }

  const child = spawn(updatePath, [], {
    cwd: path.dirname(updatePath),
    detached: true,
    stdio: "ignore",
    windowsHide: false
  });

  child.unref();

  setTimeout(() => {
    app.quit();
  }, 700);

  return { ok: true, updatePath };
}

function getDesktopShortcutPath(local, gameId) {
  const desktopPath = app.getPath("desktop");
  const shortcutName = sanitizeShortcutName(local?.name || gameId);
  return path.join(desktopPath, `${shortcutName}.lnk`);
}

async function removeGameShortcut(gameId, local) {
  if (process.platform !== "win32") {
    return { ok: true, skipped: true };
  }

  const pathsToTry = new Set();

  if (local?.shortcutPath) {
    pathsToTry.add(local.shortcutPath);
  }

  if (local) {
    pathsToTry.add(getDesktopShortcutPath(local, gameId));
  }

  for (const shortcutPath of pathsToTry) {
    try {
      if (shortcutPath && fsSync.existsSync(shortcutPath)) {
        await fs.rm(shortcutPath, { force: true });
      }
    } catch (error) {
      console.warn("Nie udało się usunąć skrótu:", error);
    }
  }

  return { ok: true };
}

async function createGameShortcut(gameId, gameFromServer = null) {
  if (process.platform !== "win32") {
    return { ok: false, skipped: true, reason: "Skróty pulpitu są obsługiwane tylko na Windows." };
  }

  const installedDb = await getInstalledDb();
  const local = installedDb.games[gameId];

  if (!local) {
    throw new Error("Gra nie jest zainstalowana.");
  }

  const shortcutPath = getDesktopShortcutPath(
    { ...local, name: local.name || gameFromServer?.name || gameId },
    gameId
  );

  let iconPath = local.iconPath || null;

  if (gameFromServer?.iconUrl) {
    iconPath = await downloadGameIcon(gameFromServer);
  }

  if (!iconPath || !fsSync.existsSync(iconPath)) {
    iconPath = app.isPackaged ? process.execPath : windowIconPath;
  }

  const args = app.isPackaged
    ? `--launch-game=${gameId}`
    : `"${projectRoot}" --launch-game=${gameId}`;

  const success = shell.writeShortcutLink(shortcutPath, {
    target: process.execPath,
    args,
    cwd: projectRoot,
    description: `${local.name || gameFromServer?.name || gameId} - UPA Games Launcher`,
    icon: iconPath,
    iconIndex: 0,
    appUserModelId: "UPA.Games.Launcher"
  });

  if (!success) {
    throw new Error("Nie udało się utworzyć skrótu.");
  }

  if (!installedDb.games[gameId]) {
    installedDb.games[gameId] = local;
  }

  installedDb.games[gameId].shortcutPath = shortcutPath;

  if (iconPath && iconPath !== windowIconPath && iconPath !== process.execPath) {
    installedDb.games[gameId].iconPath = iconPath;
  }

  await saveInstalledDb(installedDb);

  return { ok: true, shortcutPath, iconPath };
}


async function ensureGameCanInstall(game) {
  const launcherVersion = await getLauncherVersion();

  if (game.minLauncherVersion && compareVersions(launcherVersion, game.minLauncherVersion) < 0) {
    throw new Error(`Ta gra wymaga launchera w wersji ${game.minLauncherVersion} lub nowszej.`);
  }

  if (game.restricted) {
    const access = await checkRestrictedAccess(game);
    if (!access.allowed) {
      throw new Error(access.reason || "Ta gra wymaga uprawnień Discord.");
    }
  }
}

async function initDiscordRpc(preferredClientId = "") {
  const config = await getDiscordConfig();
  const enabled = store.get("discordPresenceEnabled") !== false;
  const clientId = preferredClientId || config.clientId || "";

  if (!enabled || !config.enabled || !clientId || clientId.includes("TU_WKLEJ")) {
    return { ok: false, configured: false, enabled };
  }

  if (discordRpcClient && discordReady && currentDiscordClientId === clientId) {
    return { ok: true, configured: true, enabled, clientId };
  }

  try {
    if (discordRpcClient) {
      try {
        await discordRpcClient.destroy();
      } catch {}
    }

    discordReady = false;
    currentDiscordClientId = clientId;

    DiscordRPC.register(clientId);
    discordRpcClient = new DiscordRPC.Client({ transport: "ipc" });

    discordRpcClient.on("ready", () => {
      discordReady = true;
      if (currentDiscordActivityGame) {
        setDiscordActivity(currentDiscordActivityGame).catch(() => {});
      }
    });

    await discordRpcClient.login({ clientId });
    return { ok: true, configured: true, enabled, clientId };
  } catch (error) {
    discordReady = false;
    return { ok: false, configured: true, enabled, error: error.message };
  }
}

async function setDiscordActivity(game) {
  const enabled = store.get("discordPresenceEnabled") !== false;
  currentDiscordActivityGame = game;

  if (!enabled) {
    return { ok: false, disabled: true };
  }

  const config = await getDiscordConfig();
  const clientId = game.discordClientId || config.clientId || "";

  if (!config.enabled || !clientId || clientId.includes("TU_WKLEJ")) {
    return { ok: false, configured: false };
  }

  if (!discordRpcClient || !discordReady || currentDiscordClientId !== clientId) {
    const result = await initDiscordRpc(clientId);

    if (!result.ok) {
      return result;
    }
  }

  const gameName = game.name || "Gra";

  // Discord RPC:
  // - nazwa aplikacji widoczna na górze pochodzi z Discord Developer Portal,
  //   nie z pola details. Jeśli chcesz tam nazwę gry, użyj osobnego discordClientId dla tej gry.
  // - details = nazwa gry
  // - state = nieustawione
  // - obraz = logoUrl z bazy albo fallback asset key
  const imageSource =
    game.logoUrl ||
    game.gameLogoUrl ||
    game.discordImageUrl ||
    game.discordImageKey ||
    game.iconKey ||
    "upa_logo";

  try {
    await discordRpcClient.setActivity({
      name: gameName,
      details: gameName,
      startTimestamp: new Date(),
      largeImageKey: imageSource,
      largeImageText: gameName,
      instance: false
    });

    return {
      ok: true,
      imageSource,
      clientId
    };
  } catch (error) {
    try {
      await discordRpcClient.setActivity({
        name: gameName,
        details: gameName,
        startTimestamp: new Date(),
        largeImageKey: game.discordImageKey || game.iconKey || "upa_logo",
        largeImageText: gameName,
        instance: false
      });

      return {
        ok: true,
        fallback: true,
        imageSource: game.discordImageKey || game.iconKey || "upa_logo",
        clientId
      };
    } catch (fallbackError) {
      return {
        ok: false,
        error: fallbackError.message || error.message
      };
    }
  }
}

async function clearDiscordActivity() {
  currentDiscordActivityGame = null;
  try {
    if (discordRpcClient && discordReady) {
      await discordRpcClient.clearActivity();
    }
  } catch {}
  return { ok: true };
}

async function getDiscordSettings() {
  const config = await getDiscordConfig();
  return {
    presenceEnabled: store.get("discordPresenceEnabled") !== false,
    configured: Boolean(config.enabled && config.clientId && !config.clientId.includes("TU_WKLEJ")),
    serverInvite: config.serverInvite || DISCORD_INVITE_URL,
    redirectUri: config.redirectUri || "http://127.0.0.1/callback",
    user: store.get("discordUser") || null
  };
}

async function setDiscordPresenceEnabled(enabled) {
  store.set("discordPresenceEnabled", Boolean(enabled));
  if (!enabled) {
    await clearDiscordActivity();
  } else {
    await initDiscordRpc();
  }
  return getDiscordSettings();
}

async function openDiscordServer() {
  const config = await getDiscordConfig();
  await shell.openExternal(config.serverInvite || DISCORD_INVITE_URL);
  return { ok: true };
}

async function loginDiscordOAuth() {
  const config = await getDiscordConfig();

  if (!config.enabled || !config.clientId || config.clientId.includes("TU_WKLEJ")) {
    throw new Error("Discord nie jest skonfigurowany. Ustaw clientId w config/discord.json.");
  }

  const redirectUri = config.redirectUri || "http://127.0.0.1/callback";
  const state = crypto.randomBytes(16).toString("hex");

  const authUrl = new URL("https://discord.com/oauth2/authorize");
  authUrl.searchParams.set("response_type", "token");
  authUrl.searchParams.set("client_id", config.clientId);
  authUrl.searchParams.set("scope", "identify");
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("prompt", "consent");

  return new Promise((resolve, reject) => {
    const authWindow = new BrowserWindow({
      parent: mainWindow,
      modal: true,
      width: 520,
      height: 720,
      title: "Logowanie Discord",
      autoHideMenuBar: true,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true
      }
    });

    let finished = false;

    const fail = error => {
      if (finished) return;
      finished = true;
      try { authWindow.close(); } catch {}
      reject(error instanceof Error ? error : new Error(String(error)));
    };

    const finish = async urlString => {
      if (finished || !urlString.startsWith(redirectUri)) return;

      finished = true;

      try {
        const parsed = new URL(urlString);
        const hashParams = new URLSearchParams(parsed.hash.replace(/^#/, ""));
        const accessToken = hashParams.get("access_token");
        const returnedState = hashParams.get("state");
        const expiresIn = Number(hashParams.get("expires_in") || "0");

        if (returnedState !== state) {
          throw new Error("Nieprawidłowy stan logowania Discord.");
        }

        if (!accessToken) {
          throw new Error("Discord nie zwrócił tokenu dostępu.");
        }

        const userResponse = await fetch("https://discord.com/api/users/@me", {
          headers: {
            Authorization: `Bearer ${accessToken}`
          }
        });

        if (!userResponse.ok) {
          throw new Error(`Nie udało się pobrać profilu Discord. HTTP ${userResponse.status}`);
        }

        const userData = await userResponse.json();

        const user = {
          id: String(userData.id || ""),
          username: userData.global_name || userData.username || "Discord User",
          discriminator: userData.discriminator || "",
          avatar: userData.avatar || "",
          accessToken,
          tokenExpiresAt: expiresIn > 0 ? Date.now() + expiresIn * 1000 : null
        };

        store.set("discordUser", user);

        try { authWindow.close(); } catch {}
        resolve(user);
      } catch (error) {
        try { authWindow.close(); } catch {}
        reject(error);
      }
    };

    authWindow.webContents.on("will-redirect", (_event, urlString) => {
      finish(urlString);
    });

    authWindow.webContents.on("will-navigate", (_event, urlString) => {
      finish(urlString);
    });

    authWindow.on("closed", () => {
      if (!finished) {
        finished = true;
        reject(new Error("Logowanie Discord zostało anulowane."));
      }
    });

    authWindow.loadURL(authUrl.toString()).catch(fail);
  });
}

async function logoutDiscordUser() {
  store.delete("discordUser");
  return { ok: true };
}

async function checkRestrictedAccess(game) {
  if (!game?.restricted) return { allowed: true };

  const user = store.get("discordUser");

  if (!user?.id) {
    return {
      allowed: false,
      reason: "Ta gra wymaga zalogowania przez Discord."
    };
  }

  const db = await initDatabase();
  const allowedRef = doc(db, "allowedDiscordUsers", String(user.id));
  const allowedSnapshot = await getDoc(allowedRef);

  if (!allowedSnapshot.exists()) {
    return {
      allowed: false,
      reason: "To konto Discord nie ma dostępu do tej gry."
    };
  }

  const data = allowedSnapshot.data();

  if (data.active === false || String(data.active).toLowerCase() === "false") {
    return {
      allowed: false,
      reason: "Dostęp dla tego konta Discord jest wyłączony."
    };
  }

  if (Array.isArray(data.allowedGames) && data.allowedGames.length > 0 && !data.allowedGames.includes(game.id)) {
    return {
      allowed: false,
      reason: "To konto Discord nie ma dostępu do tej konkretnej gry."
    };
  }

  return { allowed: true };
}

async function listReviews(gameId) {
  const db = await initDatabase();
  const reviewsRef = collection(db, "games", gameId, "reviews");
  const q = query(reviewsRef, orderBy("createdAt", "desc"), limit(30));
  const snap = await getDocs(q);

  return snap.docs.map(docRef => ({
    id: docRef.id,
    ...docRef.data()
  }));
}

async function addReview(input) {
  const db = await initDatabase();
  const user = store.get("discordUser");

  if (!user) {
    throw new Error("Dodanie opinii wymaga połączenia z Discordem.");
  }

  const gameId = String(input.gameId || "").trim();
  const rating = Number(input.rating);

  if (!gameId) throw new Error("Brak ID gry.");
  if (!Number.isFinite(rating) || rating < 0 || rating > 5) {
    throw new Error("Ocena musi być od 0 do 5.");
  }

  const comment = String(input.comment || "").trim().slice(0, 1200);

  await addDoc(collection(db, "games", gameId, "reviews"), {
    gameId,
    rating,
    comment,
    discordUserId: user.id,
    discordUsername: user.username,
    createdAt: serverTimestamp()
  });

  return { ok: true };
}


async function installGame(game) {
  if (!game?.id) throw new Error("Brak identyfikatora gry.");
  if (game.platformSupported === false) {
    throw new Error(`Ta gra nie ma plików dla systemu ${getPlatformLabel()}.`);
  }

  if (!game.downloadUrl) throw new Error(`Brak adresu pobierania dla systemu ${getPlatformLabel()}.`);
  if (!game.executable) throw new Error(`Brak pliku startowego dla systemu ${getPlatformLabel()}.`);

  await ensureGameCanInstall(game);

  const safeFolderName = sanitizeFolderName(game.folderName || game.id);
  const targetDir = assertInside(gamesDir, path.join(gamesDir, safeFolderName));
  const zipPath = assertInside(tempDir, path.join(tempDir, `${safeFolderName}.zip`));

  await fs.mkdir(gamesDir, { recursive: true });
  await fs.mkdir(tempDir, { recursive: true });
  await fs.rm(zipPath, { force: true });
  await fs.rm(targetDir, { recursive: true, force: true });
  await fs.mkdir(targetDir, { recursive: true });

  const downloadUrl = normalizeDownloadUrl(game.downloadUrl);

  emitProgress({ gameId: game.id, status: "downloading", percent: 0 });

  await downloadFile(downloadUrl, zipPath, progress => {
    emitProgress({ gameId: game.id, status: "downloading", ...progress });
  });

  emitProgress({ gameId: game.id, status: "extracting", percent: null });

  await extract(zipPath, { dir: targetDir });
  await fs.rm(zipPath, { force: true });

  const exePath = assertInside(targetDir, path.join(targetDir, game.executable));
  if (!fsSync.existsSync(exePath)) {
    await fs.rm(targetDir, { recursive: true, force: true });
    throw new Error(`Nie znaleziono pliku startowego: ${game.executable}`);
  }

  if (process.platform !== "win32") {
    await fs.chmod(exePath, 0o755).catch(() => {});
  }

  const iconPath = await downloadGameIcon(game);

  const installedDb = await getInstalledDb();
  installedDb.games[game.id] = {
    gameId: game.id,
    name: game.name,
    version: game.version,
    platform: game.platform || getPlatformKey(),
    platformLabel: game.platformLabel || getPlatformLabel(),
    folderName: safeFolderName,
    executable: game.executable,
    installPath: targetDir,
    logoUrl: game.logoUrl || game.gameLogoUrl || "",
    gameLogoUrl: game.gameLogoUrl || game.logoUrl || "",
    logoUrl: game.logoUrl || game.gameLogoUrl || "",
    gameLogoUrl: game.gameLogoUrl || game.logoUrl || "",
    iconUrl: game.iconUrl || "",
    iconPath: iconPath || "",
    discordImageKey: game.discordImageKey || game.iconKey || sanitizeDiscordAssetKey(game.id),
    discordClientId: game.discordClientId || "",
    shortcutPath: "",
    installedAt: new Date().toISOString()
  };

  await saveInstalledDb(installedDb);

  try {
    await createGameShortcut(game.id, game);
  } catch (error) {
    console.warn("Gra została zainstalowana, ale nie udało się utworzyć skrótu:", error);
  }

  emitProgress({ gameId: game.id, status: "done", percent: 100 });
  return installedDb.games[game.id];
}

async function uninstallGame(gameId) {
  const installedDb = await getInstalledDb();
  const local = installedDb.games[gameId];

  if (!local) return { ok: true, removed: false };

  const targetDir = assertInside(gamesDir, path.join(gamesDir, local.folderName));
  await fs.rm(targetDir, { recursive: true, force: true });

  await removeGameShortcut(gameId, local);

  delete installedDb.games[gameId];
  await saveInstalledDb(installedDb);

  return { ok: true, removed: true };
}


async function getCatalogGameById(gameId) {
  const catalog = await listCatalogGames();
  return catalog.find(game => game.id === gameId) || null;
}

async function launchGame(gameId) {
  const installedDb = await getInstalledDb();
  const local = installedDb.games[gameId];

  if (!local) throw new Error("Gra nie jest zainstalowana.");

  const exePath = assertInside(local.installPath, path.join(local.installPath, local.executable));
  if (!fsSync.existsSync(exePath)) {
    throw new Error(`Nie znaleziono pliku EXE: ${local.executable}`);
  }

  const serverGame = await getCatalogGameById(gameId).catch(() => null);

  await setDiscordActivity({
    id: gameId,
    gameId,
    name: serverGame?.name || local.name,
    version: serverGame?.version || local.version,
    logoUrl: serverGame?.logoUrl || local.logoUrl || "",
    gameLogoUrl: serverGame?.gameLogoUrl || local.gameLogoUrl || local.logoUrl || "",
    discordImageUrl: serverGame?.logoUrl || serverGame?.gameLogoUrl || local.logoUrl || local.gameLogoUrl || "",
    discordImageKey: serverGame?.discordImageKey || local.discordImageKey || sanitizeDiscordAssetKey(gameId),
    iconKey: serverGame?.iconKey || local.iconKey || sanitizeDiscordAssetKey(gameId),
    discordClientId: serverGame?.discordClientId || local.discordClientId || ""
  });

  const child = spawn(exePath, [], {
    cwd: path.dirname(exePath),
    detached: false,
    stdio: "ignore",
    windowsHide: false
  });

  child.once("exit", () => {
    clearDiscordActivity().catch(() => {});
  });

  child.once("close", () => {
    clearDiscordActivity().catch(() => {});
  });

  child.once("error", () => {
    clearDiscordActivity().catch(() => {});
  });

  return { ok: true };
}

async function updateGame(game) {
  const installedDb = await getInstalledDb();
  const local = installedDb.games[game.id];

  if (!local) return installGame(game);
  if (compareVersions(game.version, local.version) <= 0) {
    return { ok: true, skipped: true, reason: "Gra jest już aktualna." };
  }

  await ensureGameCanInstall(game);

  const currentDir = assertInside(gamesDir, path.join(gamesDir, local.folderName));
  const backupDir = assertInside(tempDir, path.join(tempDir, `${local.folderName}.backup-${Date.now()}`));

  try {
    if (fsSync.existsSync(currentDir)) {
      await fs.rename(currentDir, backupDir);
    }

    const result = await installGame(game);
    await fs.rm(backupDir, { recursive: true, force: true });
    return result;
  } catch (error) {
    await fs.rm(currentDir, { recursive: true, force: true }).catch(() => {});
    if (fsSync.existsSync(backupDir)) {
      await fs.rename(backupDir, currentDir).catch(() => {});
    }
    throw error;
  }
}

async function handleShortcutLaunch(gameId) {
  if (!gameId) return;

  await new Promise(resolve => setTimeout(resolve, 900));

  try {
    const launcherUpdate = await checkLauncherUpdate();

    if (launcherUpdate.updateAvailable) {
      const answer = await dialog.showMessageBox(mainWindow, {
        type: "question",
        title: "Aktualizacja launchera",
        message: `Dostępna jest aktualizacja launchera (${launcherUpdate.latestVersion}).`,
        detail: launcherUpdate.changelog || "Możesz zainstalować ją teraz albo uruchomić grę bez aktualizacji.",
        buttons: ["Pobierz", "Pomiń"],
        defaultId: 0,
        cancelId: 1
      });

      if (answer.response === 0) {
        await downloadAndRunLauncherUpdate(launcherUpdate, { skipPrompt: true });
        return;
      }
    }
  } catch (error) {
    console.warn("Nie udało się sprawdzić aktualizacji launchera:", error);
  }

  try {
    const catalog = await listCatalogGames();
    const serverGame = catalog.find(game => game.id === gameId);

    if (serverGame?.updateAvailable) {
      const answer = await dialog.showMessageBox(mainWindow, {
        type: "question",
        title: "Aktualizacja gry",
        message: `Dostępna jest aktualizacja gry ${serverGame.name}.`,
        detail: `Lokalnie: ${serverGame.localVersion || "?"}\nNa serwerze: ${serverGame.version || "?"}\n\n${serverGame.changelog || ""}`,
        buttons: ["Pobierz", "Uruchom bez aktualizacji"],
        defaultId: 0,
        cancelId: 1
      });

      if (answer.response === 0) {
        await updateGame(serverGame);
      }
    }
  } catch (error) {
    console.warn("Nie udało się sprawdzić aktualizacji gry:", error);
  }

  try {
    await launchGame(gameId);
  } catch (error) {
    await dialog.showMessageBox(mainWindow, {
      type: "error",
      title: "Nie udało się uruchomić gry",
      message: error.message || "Wystąpił błąd."
    });
  }
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1320,
    height: 860,
    minWidth: 1120,
    minHeight: 720,
    title: APP_NAME,
    icon: windowIconPath,
    backgroundColor: "#050912",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  mainWindow.setMenuBarVisibility(false);
  await mainWindow.loadFile(path.join(__dirname, "renderer", "index.html"));
}

ipcMain.handle("catalog:list", async () => listCatalogGames());
ipcMain.handle("game:install", async (_event, game) => installGame(game));
ipcMain.handle("game:update", async (_event, game) => updateGame(game));
ipcMain.handle("game:uninstall", async (_event, gameId) => uninstallGame(gameId));
ipcMain.handle("game:launch", async (_event, gameId) => launchGame(gameId));
ipcMain.handle("game:create-shortcut", async (_event, game) => createGameShortcut(game.id || game, typeof game === "object" ? game : null));

ipcMain.handle("launcher:version", async () => getLauncherVersion());
ipcMain.handle("launcher:version-info", async () => ({
  version: await getLauncherVersion(),
  electronVersion: process.versions.electron,
  nodeVersion: process.versions.node,
  isPackaged: app.isPackaged,
  appPath: app.getAppPath()
}));
ipcMain.handle("launcher:check-update", async () => checkLauncherUpdate());
ipcMain.handle("launcher:download-update", async (_event, updateInfo) => downloadAndRunLauncherUpdate(updateInfo));

ipcMain.handle("community:features-status", async () => getCommunityFeaturesStatus());

ipcMain.handle("discord:get-settings", async () => getDiscordSettings());
ipcMain.handle("discord:set-presence-enabled", async (_event, enabled) => setDiscordPresenceEnabled(enabled));
ipcMain.handle("discord:open-server", async () => openDiscordServer());
ipcMain.handle("discord:login", async () => loginDiscordOAuth());
ipcMain.handle("discord:logout-user", async () => logoutDiscordUser());
ipcMain.handle("discord:check-restricted-access", async (_event, game) => checkRestrictedAccess(game));

ipcMain.handle("reviews:list", async (_event, gameId) => listReviews(gameId));
ipcMain.handle("reviews:add", async (_event, input) => addReview(input));

ipcMain.handle("folder:open-games", async () => {
  await shell.openPath(gamesDir);
  return { ok: true };
});
ipcMain.handle("folder:get-games-path", async () => gamesDir);

app.whenReady().then(async () => {
  app.setName(APP_NAME);
  Menu.setApplicationMenu(null);
  await ensureStorage();
  await createWindow();
  await initDiscordRpc().catch(() => {});
  await handleShortcutLaunch(getLaunchGameArg());
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", async () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    await createWindow();
  }
});
