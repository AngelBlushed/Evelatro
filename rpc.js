/* ===========================================================
   Discord Rich Presence (PC uniquement).
   Se connecte au client Discord local via son "pipe" IPC et
   affiche "EveLatro! · 12 400 cr · #3" sur le profil du joueur.
   Zéro dépendance : on parle le protocole IPC directement.
   Si Discord n'est pas lancé -> ne fait rien, réessaie plus tard.
   =========================================================== */

const net = require('net');

const CLIENT_ID = '1542964139637477536';   // Application Discord d'EveLatro (public)
const startedAt = Date.now();

let sock = null;
let connected = false;
let retryT = null;
let pending = undefined;   // undefined = rien à envoyer ; null = effacer ; objet = activité

function ipcPath() {
  if (process.platform === 'win32') return '\\\\?\\pipe\\discord-ipc-0';
  const dir = process.env.XDG_RUNTIME_DIR || process.env.TMPDIR || process.env.TMP || process.env.TEMP || '/tmp';
  return dir.replace(/\/$/, '') + '/discord-ipc-0';
}

function frame(op, obj) {
  const json = Buffer.from(JSON.stringify(obj));
  const buf = Buffer.alloc(8 + json.length);
  buf.writeInt32LE(op, 0);
  buf.writeInt32LE(json.length, 4);
  json.copy(buf, 8);
  return buf;
}

function scheduleRetry() {
  clearTimeout(retryT);
  retryT = setTimeout(connect, 15000);
}

function connect() {
  if (connected || sock) return;
  try {
    sock = net.createConnection(ipcPath());
  } catch (e) { sock = null; scheduleRetry(); return; }

  sock.on('connect', () => {
    try { sock.write(frame(0, { v: 1, client_id: CLIENT_ID })); } catch (e) {}
  });

  let acc = Buffer.alloc(0);
  sock.on('data', (d) => {
    acc = Buffer.concat([acc, d]);
    while (acc.length >= 8) {
      const len = acc.readInt32LE(4);
      if (acc.length < 8 + len) break;
      let msg = {};
      try { msg = JSON.parse(acc.slice(8, 8 + len).toString()); } catch (e) {}
      acc = acc.slice(8 + len);
      if (msg.evt === 'READY') {
        connected = true;
        if (pending !== undefined) send(pending);
      }
    }
  });
  const drop = () => { connected = false; try { sock && sock.destroy(); } catch (e) {} sock = null; scheduleRetry(); };
  sock.on('close', drop);
  sock.on('error', drop);
}

function send(activity) {
  pending = activity;
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
  if (!data) { send(null); return; }
  const parts = [];
  if (Number.isFinite(data.credits)) parts.push(Number(data.credits).toLocaleString('fr-FR') + ' cr.');
  if (data.rank) parts.push('#' + data.rank);
  send({
    details: parts.join('  ·  ') || 'Au casino',
    state: data.pseudo ? ('en tant que ' + String(data.pseudo).slice(0, 60)) : 'EveLatro!',
    timestamps: { start: startedAt },
    assets: { large_image: 'evelatro', large_text: 'EveLatro! — mini-casino' },
    instance: false,
  });
}

module.exports = { connect, set };
