const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("launcher", {
  listCatalog: () => ipcRenderer.invoke("catalog:list"),

  installGame: game => ipcRenderer.invoke("game:install", game),
  updateGame: game => ipcRenderer.invoke("game:update", game),
  uninstallGame: gameId => ipcRenderer.invoke("game:uninstall", gameId),
  launchGame: gameId => ipcRenderer.invoke("game:launch", gameId),
  createGameShortcut: game => ipcRenderer.invoke("game:create-shortcut", game),

  getLauncherVersion: () => ipcRenderer.invoke("launcher:version"),
  getLauncherVersionInfo: () => ipcRenderer.invoke("launcher:version-info"),
  checkLauncherUpdate: () => ipcRenderer.invoke("launcher:check-update"),
  downloadLauncherUpdate: updateInfo => ipcRenderer.invoke("launcher:download-update", updateInfo),

  openGamesFolder: () => ipcRenderer.invoke("folder:open-games"),
  getGamesPath: () => ipcRenderer.invoke("folder:get-games-path"),

  onDownloadProgress: callback => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("download-progress", listener);
    return () => ipcRenderer.removeListener("download-progress", listener);
  },

  onLauncherUpdateProgress: callback => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("launcher-update-progress", listener);
    return () => ipcRenderer.removeListener("launcher-update-progress", listener);
  }
});


contextBridge.exposeInMainWorld("discord", {
  getSettings: () => ipcRenderer.invoke("discord:get-settings"),
  setPresenceEnabled: enabled => ipcRenderer.invoke("discord:set-presence-enabled", enabled),
  openServer: () => ipcRenderer.invoke("discord:open-server"),
  login: () => ipcRenderer.invoke("discord:login"),
  logoutUser: () => ipcRenderer.invoke("discord:logout-user"),
  checkRestrictedAccess: game => ipcRenderer.invoke("discord:check-restricted-access", game)
});

contextBridge.exposeInMainWorld("reviews", {
  list: gameId => ipcRenderer.invoke("reviews:list", gameId),
  add: input => ipcRenderer.invoke("reviews:add", input)
});


contextBridge.exposeInMainWorld("community", {
  getFeaturesStatus: () => ipcRenderer.invoke("community:features-status")
});
