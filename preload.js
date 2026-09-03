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
  // touche F : fait défiler cadre normal -> sans barre de titre -> plein écran total.
  // on passe l'écran courant pour y revenir si la fenêtre doit être recréée.
  // renvoie le nouveau mode ('framed' | 'frameless' | 'fullscreen').
  cycleChrome: (currentScreen) => ipcRenderer.sendSync('cycle-window-chrome', currentScreen),
});
