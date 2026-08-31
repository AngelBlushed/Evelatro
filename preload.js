/* Pont sécurisé entre la page du jeu et Electron :
   sert uniquement à faire la connexion Discord dans une fenêtre à part. */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAuth', {
  // Ouvre authUrl dans une fenêtre, attend la redirection vers redirectPrefix,
  // renvoie l'URL finale (avec le code) — ou null si l'utilisateur annule.
  oauth: (authUrl, redirectPrefix) => ipcRenderer.invoke('oauth-discord', { authUrl, redirectPrefix }),
  quit: () => ipcRenderer.send('quit-app'),
  openExternal: (url) => ipcRenderer.send('open-external', url),
  presence: (data) => ipcRenderer.send('presence', data),
});
