const gamesGrid = document.querySelector("#gamesGrid");
const statusBox = document.querySelector("#statusBox");
const refreshBtn = document.querySelector("#refreshBtn");
const openFolderBtn = document.querySelector("#openFolderBtn");
const gamesPath = document.querySelector("#gamesPath");
const template = document.querySelector("#gameCardTemplate");

const launcherVersion = document.querySelector("#launcherVersion");
const launcherUpdateBox = document.querySelector("#launcherUpdateBox");
const checkLauncherUpdateBtn = document.querySelector("#checkLauncherUpdateBtn");
const downloadLauncherUpdateBtn = document.querySelector("#downloadLauncherUpdateBtn");
const launcherProgress = document.querySelector(".launcher-progress");
const launcherUpdateBar = document.querySelector("#launcherUpdateBar");
const launcherUpdateLabel = document.querySelector("#launcherUpdateLabel");

const statTotal = document.querySelector("#statTotal");
const statInstalled = document.querySelector("#statInstalled");
const statUpdates = document.querySelector("#statUpdates");

const gameDetailsModal = document.querySelector("#gameDetailsModal");
const detailsCloseBtn = document.querySelector("#detailsCloseBtn");
const detailsImage = document.querySelector("#detailsImage");
const detailsLogo = document.querySelector("#detailsLogo");
const detailsBadge = document.querySelector("#detailsBadge");
const detailsName = document.querySelector("#detailsName");
const detailsVersion = document.querySelector("#detailsVersion");
const detailsDescription = document.querySelector("#detailsDescription");
const detailsChangelogSection = document.querySelector("#detailsChangelogSection");
const detailsChangelog = document.querySelector("#detailsChangelog");

const detailsInstallBtn = document.querySelector("#detailsInstallBtn");
const detailsPlayBtn = document.querySelector("#detailsPlayBtn");
const detailsUpdateBtn = document.querySelector("#detailsUpdateBtn");
const detailsShortcutBtn = document.querySelector("#detailsShortcutBtn");
const detailsDeleteBtn = document.querySelector("#detailsDeleteBtn");

const discordPresenceToggle = document.querySelector("#discordPresenceToggle");
const discordServerBtn = document.querySelector("#discordServerBtn");
const discordStatus = document.querySelector("#discordStatus");
const discordLoginBtn = document.querySelector("#discordLoginBtn");
const discordLogoutBtn = document.querySelector("#discordLogoutBtn");

const reviewForm = document.querySelector("#reviewForm");
const reviewRating = document.querySelector("#reviewRating");
const reviewComment = document.querySelector("#reviewComment");
const reviewsList = document.querySelector("#reviewsList");
const reviewsSummary = document.querySelector("#reviewsSummary");

let games = [];
let pendingLauncherUpdate = null;
let selectedGame = null;
let communityFeaturesVisible = false;

function setStatus(message, isError = false) {
  if (!message) {
    statusBox.classList.add("hidden");
    statusBox.textContent = "";
    statusBox.classList.remove("error");
    return;
  }

  statusBox.classList.remove("hidden");
  statusBox.textContent = message;
  statusBox.classList.toggle("error", isError);
}

function setUpdateBox(title, text, mode = "neutral") {
  launcherUpdateBox.className = `update-box ${mode}`;
  launcherUpdateBox.innerHTML = `
    <div class="update-title">${escapeHtml(title)}</div>
    <div class="update-text">${escapeHtml(text)}</div>
  `;
}

function updateStats() {
  statTotal.textContent = String(games.length);
  statInstalled.textContent = String(games.filter(game => game.installed).length);
  statUpdates.textContent = String(games.filter(game => game.updateAvailable).length);
}

function getBadgeText(game) {
  if (game.platformSupported === false) return "NIEDOSTĘPNA";
  if (!game.launcherCompatible) return "WYMAGA UPDATE";
  if (game.restricted) return "RESTRICTED";
  if (game.updateAvailable) return "UPDATE";
  if (game.installed) return "GOTOWE";
  if (game.isNew) return "NOWE";
  return "DOSTĘPNA";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function applyInlineFormatting(text) {
  let html = text;

  html = html.replace(/`([^`]+?)`/g, "<code>$1</code>");
  html = html.replace(/\*\*([^*]+?)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/__([^_]+?)__/g, "<u>$1</u>");
  html = html.replace(/~~([^~]+?)~~/g, "<s>$1</s>");
  html = html.replace(/(?<!\*)\*([^*]+?)\*(?!\*)/g, "<em>$1</em>");

  html = html.replace(
    /(https?:\/\/[^\s<]+)/g,
    url => `<span class="formatted-link">${url}</span>`
  );

  return html;
}

function renderDiscordMarkdown(value) {
  const raw = String(value || "").trim();

  if (!raw) {
    return "<p>Brak opisu.</p>";
  }

  const codeBlocks = [];
  let text = raw.replace(/```([\s\S]*?)```/g, (_match, code) => {
    const index = codeBlocks.length;
    codeBlocks.push(`<pre><code>${escapeHtml(code.trim())}</code></pre>`);
    return `\n@@CODE_BLOCK_${index}@@\n`;
  });

  text = escapeHtml(text);

  const lines = text.split(/\r?\n/);
  const output = [];
  let listOpen = false;
  let quoteOpen = false;

  function closeList() {
    if (listOpen) {
      output.push("</ul>");
      listOpen = false;
    }
  }

  function closeQuote() {
    if (quoteOpen) {
      output.push("</blockquote>");
      quoteOpen = false;
    }
  }

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed) {
      closeList();
      closeQuote();
      continue;
    }

    const codeMatch = trimmed.match(/^@@CODE_BLOCK_(\d+)@@$/);
    if (codeMatch) {
      closeList();
      closeQuote();
      output.push(codeBlocks[Number(codeMatch[1])] || "");
      continue;
    }

    if (trimmed.startsWith("&gt;")) {
      closeList();
      if (!quoteOpen) {
        output.push("<blockquote>");
        quoteOpen = true;
      }
      const quoteText = trimmed.replace(/^&gt;\s?/, "");
      output.push(`<p>${applyInlineFormatting(quoteText)}</p>`);
      continue;
    }

    closeQuote();

    const heading3 = trimmed.match(/^###\s+(.+)/);
    const heading2 = trimmed.match(/^##\s+(.+)/);
    const heading1 = trimmed.match(/^#\s+(.+)/);

    if (heading1 || heading2 || heading3) {
      closeList();
      if (heading1) output.push(`<h1>${applyInlineFormatting(heading1[1])}</h1>`);
      if (heading2) output.push(`<h2>${applyInlineFormatting(heading2[1])}</h2>`);
      if (heading3) output.push(`<h3>${applyInlineFormatting(heading3[1])}</h3>`);
      continue;
    }

    const listItem = trimmed.match(/^[-*]\s+(.+)/);
    if (listItem) {
      if (!listOpen) {
        output.push("<ul>");
        listOpen = true;
      }
      output.push(`<li>${applyInlineFormatting(listItem[1])}</li>`);
      continue;
    }

    closeList();
    output.push(`<p>${applyInlineFormatting(trimmed)}</p>`);
  }

  closeList();
  closeQuote();

  return output.join("");
}

function updateActionButtons(card, game) {
  const installBtn = card.querySelector(".install-btn");
  const playBtn = card.querySelector(".play-btn");
  const updateBtn = card.querySelector(".update-btn");
  const shortcutBtn = card.querySelector(".shortcut-btn");
  const deleteBtn = card.querySelector(".delete-btn");

  installBtn.classList.toggle("hidden", game.installed);
  playBtn.classList.toggle("hidden", !game.installed);
  updateBtn.classList.toggle("hidden", !game.updateAvailable);
  shortcutBtn.classList.toggle("hidden", !game.installed);
  deleteBtn.classList.toggle("hidden", !game.installed);

  if (game.platformSupported === false) {
    installBtn.disabled = true;
    updateBtn.disabled = true;
    installBtn.title = `Ta gra nie jest dostępna dla systemu ${game.platformLabel || ""}`;
    updateBtn.title = `Ta gra nie jest dostępna dla systemu ${game.platformLabel || ""}`;
  } else if (!game.launcherCompatible) {
    installBtn.disabled = true;
    updateBtn.disabled = true;
    installBtn.title = `Wymaga launchera ${game.minLauncherVersion}`;
    updateBtn.title = `Wymaga launchera ${game.minLauncherVersion}`;
  }
}

function setCardBusy(card, busy) {
  card.querySelectorAll("button").forEach(button => {
    button.disabled = busy;
  });
}

function setDetailsBusy(busy) {
  gameDetailsModal.querySelectorAll("button").forEach(button => {
    button.disabled = busy;
  });
  detailsCloseBtn.disabled = false;
}

function showProgress(card, labelText, percent = null) {
  const progress = card.querySelector(".progress");
  const bar = card.querySelector(".progress-bar");
  const label = card.querySelector(".progress-label");

  progress.classList.remove("hidden");
  label.textContent = labelText;

  if (percent !== null) {
    bar.style.width = `${percent}%`;
  }
}

function showDetailsProgress(labelText, percent = null) {
  const progress = gameDetailsModal.querySelector(".details-progress");
  const bar = progress.querySelector(".progress-bar");
  const label = progress.querySelector(".progress-label");

  progress.classList.remove("hidden");
  label.textContent = labelText;

  if (percent !== null) {
    bar.style.width = `${percent}%`;
  }
}

function hideProgressLater(card) {
  const progress = card.querySelector(".progress");

  setTimeout(() => {
    progress.classList.add("hidden");
    card.querySelector(".progress-bar").style.width = "0%";
    card.querySelector(".progress-label").textContent = "";
  }, 1200);
}

function hideDetailsProgressLater() {
  const progress = gameDetailsModal.querySelector(".details-progress");

  setTimeout(() => {
    progress.classList.add("hidden");
    progress.querySelector(".progress-bar").style.width = "0%";
    progress.querySelector(".progress-label").textContent = "";
  }, 1200);
}

async function runCardAction(card, action, options = {}) {
  const { showBusyProgress = true } = options;

  try {
    setStatus("");
    setCardBusy(card, true);

    if (showBusyProgress) {
      showProgress(card, "Przygotowywanie...", 18);
    }

    await action();
  } catch (error) {
    setStatus(error.message || "Wystąpił błąd.", true);
  } finally {
    setCardBusy(card, false);
  }
}

async function runDetailsAction(action, options = {}) {
  const { showBusyProgress = true } = options;

  try {
    setStatus("");
    setDetailsBusy(true);

    if (showBusyProgress) {
      showDetailsProgress("Przygotowywanie...", 18);
    }

    await action();
  } catch (error) {
    setStatus(error.message || "Wystąpił błąd.", true);
  } finally {
    setDetailsBusy(false);
  }
}

function syncSelectedGame() {
  if (!selectedGame) return;
  const fresh = games.find(game => game.id === selectedGame.id);
  if (fresh) selectedGame = fresh;
}

function updateDetailsButtons(game) {
  detailsInstallBtn.classList.toggle("hidden", game.installed);
  detailsPlayBtn.classList.toggle("hidden", !game.installed);
  detailsUpdateBtn.classList.toggle("hidden", !game.updateAvailable);
  detailsShortcutBtn.classList.toggle("hidden", !game.installed);
  detailsDeleteBtn.classList.toggle("hidden", !game.installed);

  if (game.platformSupported === false) {
    detailsInstallBtn.disabled = true;
    detailsUpdateBtn.disabled = true;
    detailsInstallBtn.title = `Ta gra nie jest dostępna dla systemu ${game.platformLabel || ""}`;
    detailsUpdateBtn.title = `Ta gra nie jest dostępna dla systemu ${game.platformLabel || ""}`;
  } else if (!game.launcherCompatible) {
    detailsInstallBtn.disabled = true;
    detailsUpdateBtn.disabled = true;
    detailsInstallBtn.title = `Wymaga launchera ${game.minLauncherVersion}`;
    detailsUpdateBtn.title = `Wymaga launchera ${game.minLauncherVersion}`;
  }
}

function openGameDetails(game) {
  selectedGame = game;

  detailsImage.src = game.imageUrl || "./assets/upa-logo.png";
  detailsImage.alt = game.name || "Okładka gry";

  if (game.logoUrl) {
    detailsLogo.src = game.logoUrl;
    detailsLogo.alt = `${game.name || "Gra"} logo`;
    detailsLogo.classList.remove("hidden");
  } else {
    detailsLogo.removeAttribute("src");
    detailsLogo.classList.add("hidden");
  }
  detailsBadge.textContent = getBadgeText(game);
  detailsName.textContent = game.name || game.id;

  const versionParts = game.installed
    ? [`Lokalnie ${game.localVersion || "?"}`, `Serwer ${game.version || "?"}`]
    : [`Wersja ${game.version || "?"}`];

  if (game.minLauncherVersion && game.minLauncherVersion !== "0.0.0") {
    versionParts.push(`Wymaga launchera ${game.minLauncherVersion}`);
  }

  if (game.restricted) {
    versionParts.push("Wymaga roli Discord");
  }

  detailsVersion.textContent = versionParts.join(" • ");

  detailsDescription.innerHTML = renderDiscordMarkdown(game.description);

  if (game.changelog) {
    detailsChangelogSection.classList.remove("hidden");
    detailsChangelog.innerHTML = renderDiscordMarkdown(game.changelog);
  } else {
    detailsChangelogSection.classList.add("hidden");
    detailsChangelog.innerHTML = "";
  }

  updateDetailsButtons(game);

  gameDetailsModal.classList.remove("hidden");
  gameDetailsModal.setAttribute("aria-hidden", "false");
  document.body.classList.add("modal-open");
  if (communityFeaturesVisible && !document.querySelector("#detailsReviewsSection")?.classList.contains("hidden")) {
    loadReviews(game.id);
  }
}

function closeGameDetails() {
  gameDetailsModal.classList.add("hidden");
  gameDetailsModal.setAttribute("aria-hidden", "true");
  document.body.classList.remove("modal-open");
}



function applyCommunityFeatureVisibility(status) {
  communityFeaturesVisible = Boolean(status?.visible);

  const discordPanel = document.querySelector("#discordPanel");
  const reviewsSection = document.querySelector("#detailsReviewsSection");

  if (discordPanel) {
    discordPanel.classList.toggle("hidden", !communityFeaturesVisible);
  }

  if (reviewsSection) {
    reviewsSection.classList.toggle("hidden", !communityFeaturesVisible);
  }

  if (!communityFeaturesVisible && reviewsList) {
    reviewsList.innerHTML = "";
    if (reviewsSummary) reviewsSummary.textContent = "Dostępne od wersji 2.0.0";
  }
}

async function updateCommunityFeatureVisibility() {
  try {
    const status = await window.community.getFeaturesStatus();
    applyCommunityFeatureVisibility(status);
    return status;
  } catch {
    applyCommunityFeatureVisibility({ visible: false });
    return { visible: false };
  }
}

function renderStars(value) {
  const rating = Number(value) || 0;
  return Array.from({ length: 5 }, (_item, index) => index < rating ? "★" : "☆").join("");
}

async function loadDiscordSettings() {
  if (!window.discord || !discordStatus) return;

  try {
    const settings = await window.discord.getSettings();
    discordPresenceToggle.checked = Boolean(settings.presenceEnabled);

    if (settings.user) {
      discordStatus.textContent = `Discord: ${settings.user.username} (${settings.user.id})`;
      discordStatus.classList.add("online");
      discordStatus.classList.remove("offline");
    } else if (settings.configured) {
      discordStatus.textContent = "Zaloguj Discord, aby odblokować gry restricted i opinie.";
      discordStatus.classList.add("online");
      discordStatus.classList.remove("offline");
    } else {
      discordStatus.textContent = "Wymaga konfiguracji Discord";
      discordStatus.classList.add("offline");
      discordStatus.classList.remove("online");
    }
  } catch {
    discordStatus.textContent = "Discord niedostępny";
    discordStatus.classList.add("offline");
    discordStatus.classList.remove("online");
  }
}

async function loadReviews(gameId) {
  if (!gameId || !window.reviews || !reviewsList) return;

  try {
    const reviews = await window.reviews.list(gameId);

    if (!reviews.length) {
      reviewsSummary.textContent = "Brak opinii";
      reviewsList.innerHTML = "<div class='empty-reviews'>Brak opinii dla tej gry.</div>";
      return;
    }

    const avg = reviews.reduce((sum, item) => sum + (Number(item.rating) || 0), 0) / reviews.length;
    reviewsSummary.textContent = `${avg.toFixed(1)} / 5 • ${reviews.length} opinii`;

    reviewsList.innerHTML = reviews.map(review => `
      <article class="review-item">
        <div class="review-top">
          <strong>${escapeHtml(review.discordUsername || "Discord User")}</strong>
          <span>${renderStars(review.rating)}</span>
        </div>
        <p>${escapeHtml(review.comment || "Brak komentarza.")}</p>
      </article>
    `).join("");
  } catch (error) {
    reviewsSummary.textContent = "Nie udało się pobrać";
    reviewsList.innerHTML = `<div class='empty-reviews'>${escapeHtml(error.message || "Błąd pobierania opinii.")}</div>`;
  }
}

function renderGames() {
  gamesGrid.innerHTML = "";
  updateStats();

  if (games.length === 0) {
    setStatus("Brak dostępnych gier.");
    return;
  }

  setStatus("");

  for (const game of games) {
    const node = template.content.cloneNode(true);
    const card = node.querySelector(".card");

    card.dataset.gameId = game.id;

    const image = card.querySelector(".game-image");
    image.src = game.imageUrl || "./assets/upa-logo.png";
    image.alt = game.name || "Okładka gry";

    const logo = card.querySelector(".game-logo");
    if (game.logoUrl) {
      logo.src = game.logoUrl;
      logo.alt = `${game.name || "Gra"} logo`;
      logo.classList.remove("hidden");
    } else {
      logo.removeAttribute("src");
      logo.classList.add("hidden");
    }

    card.querySelector(".game-name").textContent = game.name || game.id;
    card.querySelector(".game-description").textContent = game.description ? game.description.replace(/[#*_~`>]/g, "").slice(0, 150) : "Brak opisu.";
    card.querySelector(".badge").textContent = getBadgeText(game);

    const versionText = game.installed
      ? `Lokalnie ${game.localVersion || "?"} • Serwer ${game.version || "?"}`
      : `Wersja ${game.version || "?"}`;

    card.querySelector(".version").textContent = versionText;
    const platformText = game.platformLabel ? game.platformLabel : "";
    const sizeText = game.sizeMb ? `${game.sizeMb} MB` : "Pakiet gry";
    const minLauncherText = game.minLauncherVersion && game.minLauncherVersion !== "0.0.0"
      ? `Wymaga launchera ${game.minLauncherVersion}`
      : "";
    const metaParts = [sizeText, platformText, minLauncherText].filter(Boolean);
    card.querySelector(".size").textContent = metaParts.join(" • ");

    updateActionButtons(card, game);

    card.addEventListener("click", event => {
      if (event.target.closest("button")) return;
      openGameDetails(game);
    });

    card.querySelector(".install-btn").addEventListener("click", async () => {
      await runCardAction(card, async () => {
        await window.launcher.installGame(game);
        await loadCatalog();
      });
    });

    card.querySelector(".update-btn").addEventListener("click", async () => {
      await runCardAction(card, async () => {
        await window.launcher.updateGame(game);
        await loadCatalog();
      });
    });

    card.querySelector(".play-btn").addEventListener("click", async () => {
      await runCardAction(card, async () => {
        await window.launcher.launchGame(game.id);
      }, { showBusyProgress: false });
    });

    card.querySelector(".shortcut-btn").addEventListener("click", async () => {
      await runCardAction(card, async () => {
        await window.launcher.createGameShortcut(game);
        setStatus(`Skrót dla gry "${game.name}" został utworzony.`);
      }, { showBusyProgress: false });
    });

    card.querySelector(".delete-btn").addEventListener("click", async () => {
      const confirmed = confirm(`Usunąć grę "${game.name}" z komputera?`);
      if (!confirmed) return;

      await runCardAction(card, async () => {
        await window.launcher.uninstallGame(game.id);
        await loadCatalog();
      });
    });

    gamesGrid.appendChild(node);
  }
}

async function loadCatalog() {
  try {
    refreshBtn.disabled = true;
    setStatus("Ładowanie katalogu...");

    games = await window.launcher.listCatalog();
    renderGames();

    if (selectedGame && !gameDetailsModal.classList.contains("hidden")) {
      syncSelectedGame();
      if (selectedGame) openGameDetails(selectedGame);
    }
  } catch (error) {
    games = [];
    renderGames();
    setStatus(error.message || "Nie udało się pobrać katalogu.", true);
  } finally {
    refreshBtn.disabled = false;
  }
}

async function loadLauncherVersion() {
  try {
    const version = await window.launcher.getLauncherVersion();
    launcherVersion.textContent = `v${version}`;
  } catch {
    launcherVersion.textContent = "v?";
  }
}

async function checkLauncherUpdate() {
  try {
    checkLauncherUpdateBtn.disabled = true;
    downloadLauncherUpdateBtn.classList.add("hidden");
    pendingLauncherUpdate = null;

    setUpdateBox("Sprawdzanie aktualizacji", "Łączenie z serwerem...", "neutral");

    const info = await window.launcher.checkLauncherUpdate();
    await updateCommunityFeatureVisibility();

    if (info.updateAvailable) {
      pendingLauncherUpdate = info;

      const changelog = info.changelog ? ` ${info.changelog}` : "";

      if (info.platformSupported === false || !info.downloadUrl) {
        downloadLauncherUpdateBtn.classList.add("hidden");
        setUpdateBox(
          `Dostępna wersja ${info.latestVersion}`,
          `Brak instalatora dla systemu ${info.platformLabel || "tego urządzenia"}. Obecna wersja: ${info.currentVersion}.${changelog}`,
          "error"
        );
      } else {
        downloadLauncherUpdateBtn.classList.remove("hidden");
        setUpdateBox(
          `Dostępna wersja ${info.latestVersion}`,
          `Obecna wersja: ${info.currentVersion}. System: ${info.platformLabel || "?"}.${changelog}`,
          "available"
        );
      }
    } else {
      setUpdateBox(
        "Aktualna wersja",
        `Zainstalowana wersja: ${info.currentVersion || "?"}.`,
        "ok"
      );
    }
  } catch (error) {
    setUpdateBox("Nie udało się sprawdzić", error.message || "Spróbuj ponownie później.", "error");
  } finally {
    checkLauncherUpdateBtn.disabled = false;
  }
}

async function downloadLauncherUpdate() {
  if (!pendingLauncherUpdate) return;

  try {
    downloadLauncherUpdateBtn.disabled = true;
    checkLauncherUpdateBtn.disabled = true;
    launcherProgress.classList.remove("hidden");
    launcherUpdateBar.style.width = "0%";
    launcherUpdateLabel.textContent = "Pobieranie aktualizacji...";

    await window.launcher.downloadLauncherUpdate(pendingLauncherUpdate);
  } catch (error) {
    setUpdateBox("Błąd pobierania", error.message || "Nie udało się pobrać aktualizacji.", "error");
  } finally {
    downloadLauncherUpdateBtn.disabled = false;
    checkLauncherUpdateBtn.disabled = false;
  }
}

window.launcher.onDownloadProgress(payload => {
  const card = document.querySelector(`.card[data-game-id="${payload.gameId}"]`);

  if (card) {
    if (payload.status === "downloading") {
      const percent = payload.percent ?? 0;
      showProgress(card, payload.percent === null ? "Pobieranie..." : `Pobieranie... ${percent}%`, percent);
    }

    if (payload.status === "extracting") {
      showProgress(card, "Instalowanie...", 100);
    }

    if (payload.status === "done") {
      showProgress(card, "Gotowe.", 100);
      hideProgressLater(card);
    }
  }

  if (selectedGame?.id === payload.gameId && !gameDetailsModal.classList.contains("hidden")) {
    if (payload.status === "downloading") {
      const percent = payload.percent ?? 0;
      showDetailsProgress(payload.percent === null ? "Pobieranie..." : `Pobieranie... ${percent}%`, percent);
    }

    if (payload.status === "extracting") {
      showDetailsProgress("Instalowanie...", 100);
    }

    if (payload.status === "done") {
      showDetailsProgress("Gotowe.", 100);
      hideDetailsProgressLater();
    }
  }
});

window.launcher.onLauncherUpdateProgress(payload => {
  launcherProgress.classList.remove("hidden");

  if (payload.status === "downloading") {
    const percent = payload.percent ?? 0;
    launcherUpdateBar.style.width = `${percent}%`;
    launcherUpdateLabel.textContent = payload.percent === null
      ? "Pobieranie aktualizacji..."
      : `Pobieranie aktualizacji... ${percent}%`;
  }

  if (payload.status === "ready") {
    launcherUpdateBar.style.width = "100%";
    launcherUpdateLabel.textContent = "Aktualizacja pobrana.";
  }
});

detailsCloseBtn.addEventListener("click", closeGameDetails);
gameDetailsModal.addEventListener("click", event => {
  if (event.target.classList.contains("details-backdrop")) {
    closeGameDetails();
  }
});

document.addEventListener("keydown", event => {
  if (event.key === "Escape" && !gameDetailsModal.classList.contains("hidden")) {
    closeGameDetails();
  }
});

detailsInstallBtn.addEventListener("click", async () => {
  if (!selectedGame) return;
  await runDetailsAction(async () => {
    await window.launcher.installGame(selectedGame);
    await loadCatalog();
  });
});

detailsUpdateBtn.addEventListener("click", async () => {
  if (!selectedGame) return;
  await runDetailsAction(async () => {
    await window.launcher.updateGame(selectedGame);
    await loadCatalog();
  });
});

detailsPlayBtn.addEventListener("click", async () => {
  if (!selectedGame) return;
  await runDetailsAction(async () => {
    await window.launcher.launchGame(selectedGame.id);
  }, { showBusyProgress: false });
});

detailsShortcutBtn.addEventListener("click", async () => {
  if (!selectedGame) return;
  await runDetailsAction(async () => {
    await window.launcher.createGameShortcut(selectedGame);
    setStatus(`Skrót dla gry "${selectedGame.name}" został utworzony.`);
  }, { showBusyProgress: false });
});

detailsDeleteBtn.addEventListener("click", async () => {
  if (!selectedGame) return;

  const confirmed = confirm(`Usunąć grę "${selectedGame.name}" z komputera?`);
  if (!confirmed) return;

  await runDetailsAction(async () => {
    await window.launcher.uninstallGame(selectedGame.id);
    closeGameDetails();
    await loadCatalog();
  });
});

refreshBtn.addEventListener("click", loadCatalog);
checkLauncherUpdateBtn.addEventListener("click", checkLauncherUpdate);
downloadLauncherUpdateBtn.addEventListener("click", downloadLauncherUpdate);

openFolderBtn.addEventListener("click", async () => {
  try {
    await window.launcher.openGamesFolder();
  } catch (error) {
    setStatus(error.message || "Nie udało się otworzyć folderu.", true);
  }
});

if (discordPresenceToggle) {
  discordPresenceToggle.addEventListener("change", async () => {
    try {
      await window.discord.setPresenceEnabled(discordPresenceToggle.checked);
      await loadDiscordSettings();
    } catch (error) {
      setStatus(error.message || "Nie udało się zmienić ustawienia Discord.", true);
    }
  });
}

if (discordServerBtn) {
  discordServerBtn.addEventListener("click", async () => {
    try {
      await window.discord.openServer();
    } catch (error) {
      setStatus(error.message || "Nie udało się otworzyć Discorda.", true);
    }
  });
}

if (discordLoginBtn) {
  discordLoginBtn.addEventListener("click", async () => {
    try {
      await window.discord.login();
      await loadDiscordSettings();
      setStatus("Zalogowano przez Discord.");
    } catch (error) {
      setStatus(error.message || "Nie udało się zalogować przez Discord.", true);
    }
  });
}

if (discordLogoutBtn) {
  discordLogoutBtn.addEventListener("click", async () => {
    try {
      await window.discord.logoutUser();
      await loadDiscordSettings();
      setStatus("Wyczyszczono dane Discord.");
    } catch (error) {
      setStatus(error.message || "Nie udało się wyczyścić danych Discord.", true);
    }
  });
}

if (reviewForm) {
  reviewForm.addEventListener("submit", async event => {
    event.preventDefault();

    if (!selectedGame) return;

    if (!communityFeaturesVisible) {
      setStatus("Funkcja opinii jest dostępna od launchera 2.0.0.", true);
      return;
    }

    try {
      await window.reviews.add({
        gameId: selectedGame.id,
        rating: Number(reviewRating.value),
        comment: reviewComment.value
      });

      reviewComment.value = "";
      await loadReviews(selectedGame.id);
      setStatus("Dodano opinię.");
    } catch (error) {
      const message = String(error.message || "");
      if (message.includes("permission-denied") || message.includes("PERMISSION_DENIED")) {
        setStatus("Nie udało się dodać opinii. Sprawdź reguły Firestore dla games/{gameId}/reviews.", true);
      } else {
        setStatus(error.message || "Nie udało się dodać opinii.", true);
      }
    }
  });
}

async function init() {
  try {
    const path = await window.launcher.getGamesPath();
    gamesPath.textContent = path;
  } catch {
    gamesPath.textContent = "./games";
  }

  await loadLauncherVersion();
  await updateCommunityFeatureVisibility();

  await Promise.allSettled([
    loadCatalog(),
    checkLauncherUpdate(),
    communityFeaturesVisible ? loadDiscordSettings() : Promise.resolve()
  ]);
}

init();
