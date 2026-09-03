/* ===========================================================
   Point d'entrée de l'app de bureau (Electron).
   Ouvre une fenêtre et y affiche index.html. Gère aussi la
   connexion Discord dans une fenêtre séparée (voir 'oauth-discord').
   =========================================================== */

const { app, BrowserWindow, ipcMain, screen, shell } = require('electron');
const path = require('path');
const rpc = require('./rpc');

/* La fenêtre est toujours en plein écran. La touche F (gérée dans le jeu)
   fait défiler 3 modes :
     'framed'     : fenêtre maximisée, barre de titre + barre des tâches
     'frameless'  : maximisée sans barre de titre (barre des tâches visible)
     'fullscreen' : plein écran total (rien autour)
   Changer la présence du cadre impose de recréer la fenêtre (Windows) ;
   le jeu retient l'écran courant (sessionStorage) et y revient. */
let mainWin = null;
let windowMode = 'framed';

function buildWindow(mode, resumeScreen) {
  const frameless = (mode === 'frameless' || mode === 'fullscreen');
  const win = new BrowserWindow({
    show: false,
    frame: !frameless,
    fullscreen: mode === 'fullscreen',
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
  win.once('ready-to-show', () => {
    if (mode === 'framed') win.maximize();
    else if (mode === 'frameless') win.setBounds(screen.getPrimaryDisplay().workArea);
    win.show();
  });
  win.on('closed', () => { if (mainWin === win) mainWin = null; });
  win.loadFile(path.join(__dirname, 'index.html'),
    resumeScreen ? { query: { resume: resumeScreen } } : undefined);
  return win;
}

function createWindow() {
  windowMode = 'framed';
  mainWin = buildWindow(windowMode);
}

function setWindowMode(mode, resumeScreen) {
  if (!mainWin || mode === windowMode) return windowMode;
  const rebuild = ((windowMode === 'framed') !== (mode === 'framed'));
  windowMode = mode;
  if (rebuild) {
    const old = mainWin;
    mainWin = buildWindow(mode, resumeScreen);
    mainWin.once('show', () => { try { old.destroy(); } catch (e) { /* rien */ } });
  } else {
    // frameless <-> fullscreen : pas besoin de recréer
    mainWin.setFullScreen(mode === 'fullscreen');
    if (mode === 'frameless') mainWin.setBounds(screen.getPrimaryDisplay().workArea);
  }
  return windowMode;
}

ipcMain.on('cycle-window-chrome', (event, currentScreen) => {
  const order = ['framed', 'frameless', 'fullscreen'];
  const next = order[(order.indexOf(windowMode) + 1) % order.length];
  event.returnValue = setWindowMode(next, currentScreen || 'launch');
});

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
