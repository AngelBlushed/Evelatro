/* ===========================================================
   Point d'entrée de l'app de bureau (Electron).
   Ouvre une fenêtre et y affiche index.html. Gère aussi la
   connexion Discord dans une fenêtre séparée (voir 'oauth-discord').
   =========================================================== */

const { app, BrowserWindow, ipcMain, screen, shell } = require('electron');
const path = require('path');
const rpc = require('./rpc');

function createWindow() {
  // s'adapte à l'écran : haut comme on peut, sans dépasser la zone utile
  const workArea = screen.getPrimaryDisplay().workAreaSize;
  const win = new BrowserWindow({
    width: Math.min(480, workArea.width),
    height: Math.min(1100, workArea.height - 30),
    minWidth: 380,
    minHeight: 560,
    backgroundColor: '#0e1316',
    autoHideMenuBar: true,
    title: 'EveLatro!',
    icon: path.join(__dirname, 'evelatro.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.setMenuBarVisibility(false);
  win.loadFile(path.join(__dirname, 'index.html'));
}

/* --- Connexion Discord --- */
ipcMain.handle('oauth-discord', (event, { authUrl, redirectPrefix }) => {
  return new Promise((resolve) => {
    const authWin = new BrowserWindow({
      width: 520,
      height: 720,
      title: 'Connexion Discord',
      autoHideMenuBar: true,
      parent: BrowserWindow.fromWebContents(event.sender) || undefined,
      modal: true,
      webPreferences: { nodeIntegration: false, contextIsolation: true, partition: 'discord-auth' },
    });

    let done = false;
    const finish = (url) => {
      if (done) return;
      done = true;
      try { authWin.close(); } catch (e) { /* rien */ }
      resolve(url || null);
    };

    const check = (url) => {
      if (url && url.indexOf(redirectPrefix) === 0) { finish(url); return true; }
      return false;
    };

    authWin.webContents.on('will-redirect', (e, url) => { if (check(url)) e.preventDefault(); });
    authWin.webContents.on('will-navigate', (e, url) => { if (check(url)) e.preventDefault(); });
    // la redirection finale vise localhost:8788 qui n'existe pas -> échec de chargement,
    // mais on a déjà capté l'URL juste avant
    authWin.webContents.on('did-fail-load', (e, code, desc, url) => { check(url); });
    authWin.on('closed', () => finish(null));

    authWin.loadURL(authUrl);
  });
});

ipcMain.on('quit-app', () => app.quit());

/* --- Rich Presence (profil Discord) --- */
ipcMain.on('presence', (event, data) => { try { rpc.set(data); } catch (e) {} });

ipcMain.on('open-external', (event, url) => {
  if (typeof url === 'string' && /^https?:\/\//i.test(url)) shell.openExternal(url);
});

app.whenReady().then(() => {
  createWindow();
  try { rpc.connect(); } catch (e) {}
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
