/* ===========================================================
   Discord Rich Presence (PC uniquement).
   Se connecte au client Discord local via son "pipe" IPC et
   affiche "EveLatro! · 12 400 cr · #3" sur le profil du joueur,
   avec l'image du jeu.
   Zéro dépendance : on parle le protocole IPC directement.
   Si Discord n'est pas lancé -> ne fait rien, réessaie plus tard.

   Détails qui comptent :
   - Discord ouvre son pipe sur discord-ipc-0 ... jusqu'à -9 (selon
     ce qui est déjà pris). On essaie les 10 à la suite.
   - On ré-affiche l'activité toutes les 60 s : si Discord redémarre
     pendant une partie, la présence revient toute seule.
   - Les images sont hébergées sur le site (URL https), donc aucune
     config à faire dans le portail développeur Discord.
   =========================================================== */

const net = require('net');

const CLIENT_ID = '1542964139637477536';   // Application Discord d'EveLatro (public)
// Images hébergées sur le site (petites, < 30 Ko : Discord refuse les grosses).
const IMG_LARGE = 'https://evelatro.pages.dev/rp-large.jpg';
const IMG_SMALL = 'https://evelatro.pages.dev/rp-small.jpg';
const startedAt = Date.now();

let sock = null;
let connected = false;
let retryT = null;
let keepT = null;
let tryIndex = 0;          // quel pipe on teste (0..9)
let pending = undefined;   // undefined = rien ; null = effacer ; objet = activité
let lastActivity = null;   // pour le ré-envoi périodique

function ipcPath(i) {
  if (process.platform === 'win32') return '\\\\?\\pipe\\discord-ipc-' + i;
  const dir = process.env.XDG_RUNTIME_DIR || process.env.TMPDIR || process.env.TMP || process.env.TEMP || '/tmp';
  return dir.replace(/\/$/, '') + '/discord-ipc-' + i;
}

function frame(op, obj) {
  const json = Buffer.from(JSON.stringify(obj));
  const buf = Buffer.alloc(8 + json.length);
  buf.writeInt32LE(op, 0);
  buf.writeInt32LE(json.length, 4);
  json.copy(buf, 8);
  return buf;
}

function scheduleRetry(fast) {
  clearTimeout(retryT);
  retryT = setTimeout(connect, fast ? 4000 : 12000);
}

function connect() {
  if (connected || sock) return;
  const path = ipcPath(tryIndex);
  let s;
  try {
    s = net.createConnection(path);
  } catch (e) {
    nextPipe();
    return;
  }
  sock = s;

  s.on('connect', () => {
    try { s.write(frame(0, { v: 1, client_id: CLIENT_ID })); } catch (e) {}
  });

  let acc = Buffer.alloc(0);
  s.on('data', (d) => {
    acc = Buffer.concat([acc, d]);
    while (acc.length >= 8) {
      const len = acc.readInt32LE(4);
      if (acc.length < 8 + len) break;
      let msg = {};
      try { msg = JSON.parse(acc.slice(8, 8 + len).toString()); } catch (e) {}
      acc = acc.slice(8 + len);
      if (msg.evt === 'READY') {
        connected = true;
        tryIndex = 0;                       // on a trouvé, on repart de 0 la prochaine fois
        if (pending !== undefined) push(pending);
        else if (lastActivity) push(lastActivity);
        startKeepAlive();
      }
    }
  });

  const drop = () => {
    const wasConnected = connected;
    connected = false;
    clearInterval(keepT);
    try { s.destroy(); } catch (e) {}
    if (sock === s) sock = null;
    if (wasConnected) scheduleRetry(true);   // on était connecté -> Discord a fermé, on revient vite
    else nextPipe();                         // jamais connecté sur ce pipe -> on teste le suivant
  };
  s.on('close', drop);
  s.on('error', drop);
}

function nextPipe() {
  if (sock) { try { sock.destroy(); } catch (e) {} sock = null; }
  tryIndex += 1;
  if (tryIndex > 9) { tryIndex = 0; scheduleRetry(false); return; }  // aucun pipe -> Discord fermé, on attend
  setTimeout(connect, 250);
}

function startKeepAlive() {
  clearInterval(keepT);
  keepT = setInterval(() => {
    if (connected && lastActivity) push(lastActivity);
  }, 60000);
}

function push(activity) {
  pending = activity;
  if (activity) lastActivity = activity;
  if (!connected || !sock) { connect(); return; }
  try {
    sock.write(frame(1, {
      cmd: 'SET_ACTIVITY',
      args: { pid: process.pid, activity: activity || undefined },
      nonce: String(Date.now()) + Math.random(),
    }));
  } catch (e) { connected = false; }
}

/* data : { credits, rank, pseudo } ou null pour effacer */
function set(data) {
  if (!data) { lastActivity = null; push(null); return; }
  const parts = [];
  if (Number.isFinite(data.credits)) parts.push(Number(data.credits).toLocaleString('fr-FR') + ' cr.');
  if (data.rank) parts.push('#' + data.rank);
  push({
    details: parts.join('  ·  ') || 'Au casino',
    state: data.pseudo ? ('en tant que ' + String(data.pseudo).slice(0, 60)) : 'EveLatro!',
    timestamps: { start: startedAt },
    assets: {
      large_image: IMG_LARGE,
      large_text: 'EveLatro! — mini-casino',
      small_image: IMG_SMALL,
      small_text: data.rank ? ('Classé #' + data.rank) : 'EveLatro!',
    },
    instance: false,
  });
}

module.exports = { connect, set };
