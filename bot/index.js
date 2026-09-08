/* ===========================================================
   Bot Discord EveLatro!

   Commandes publiques
     /leaderboard   -> le classement des records (table "scores")
     /directe       -> les dernieres actions en jeu (table "activity")

   Commandes admin (Gerer le serveur)
     /auto-leaderboard on  salon:#x  reset:true|false
     /auto-leaderboard off
        -> poste le classement dans le salon toutes les heures pile.
           reset:true  -> vide "scores" apres l'envoi (competition d'1h).
     /auto-directe on  salon:#x
     /auto-directe off
        -> un message dans le salon, rafraichi automatiquement toutes
           les 5 secondes avec le flux en direct.
     /feed on  salon:#x
     /feed off
        -> poste chaque action (date / jeu / main / mise / gagne-perdu)
           dans le salon, en temps reel.
     /news
        -> ouvre un formulaire pour editer le panneau "Quoi de neuf ?"
           qui s'affiche au lancement du jeu.
     /role-panel  /jeuhorreur  /jeudecul  /extensiongoogle  /towerdefense  /evekart  /evachi
        -> (re)poste un panneau "reagis = role" (voir ROLE_PANELS). Reagir
           avec l'emoji donne le role, l'enlever le retire. Ce role ouvre
           ensuite des salons via les permissions Discord classiques.
     /warn  membre:@x  raison:...
     /unwarn  membre:@x
        -> salon d'aide : +1 warn ; a 3 warns le membre passe en lecture
           seule (ni message, ni emoji, ni fichier). L'embed de rappel du
           salon est re-poste a chaque message.
     /emilia-tann
        -> poste l'embed du jeu "Emiliaaa Tann" + un 2e message avec le
           lien seul (pour l'apercu du site).
     /tag-purg
        -> embed "le tag PURG est dispo" + un 2e message @everyone.

   La config (salons choisis) est gardee dans la table Supabase
   "bot_config" -> survit aux redemarrages / redeploys Railway.

   Demarrage :
     npm install
     node index.js
   =========================================================== */
import 'dotenv/config';
import http from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

/* Petit serveur "je suis vivant" : les hébergeurs (Railway, Koyeb, Fly…) tuent
   le conteneur si rien n'écoute sur le port du health-check. Inoffensif ailleurs. */
{
  const port = process.env.PORT || 8000;
  http.createServer((req, res) => { res.writeHead(200); res.end('EveLatro bot OK'); })
    .listen(port, () => console.log('health server :' + port));
}
import {
  Client, GatewayIntentBits, Partials, EmbedBuilder, AttachmentBuilder, Events, ActivityType,
  SlashCommandBuilder, PermissionFlagsBits,
  ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder,
} from 'discord.js';
import { createClient } from '@supabase/supabase-js';
import { makeShared, menuPayload, skinsPayload, handleButton, closeIdleSession } from './games.js';
import { CS } from './cs-catalog.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));

const {
  DISCORD_TOKEN, SUPABASE_URL, SUPABASE_KEY,
  DISCORD_GUILD_ID, LIVE_CHANNEL_ID, SITE_URL, SET_AVATAR,
} = process.env;

/* ---------- panneaux "réaction = rôle" (voir ensureRolePanel plus bas) ----------
   Un panneau = un embed avec une réaction : réagir donne le rôle, enlever la
   réaction le retire. Le rôle ouvre ensuite des salons via les permissions
   Discord classiques sur ce rôle (à faire une fois dans Discord, pas ici —
   voir CLAUDE.md / PLAN-DU-CODE.md). */
const ROLE_PANELS = {
  casino: {
    cfgKey: 'role_panel',            // clé historique — ne pas renommer, le panneau est déjà posté
    roleName: 'eve weird shit',
    roleId: '1543192258101252136',   // secours si le nom du rôle change
    channelName: 'eve-weird-shit',
    channelEnvVar: 'ROLE_PANEL_CHANNEL_ID',
    emoji: '🎰',
    description: (role, emoji) => [
      `Réagis avec ${emoji} ci-dessous pour récupérer le rôle **@${role.name}**.`,
      '',
      'Ce rôle t\'ouvre les salons qui vont avec : le casino **EveLatro!**, son classement et son flux en direct.',
      '',
      `_Enlève ta réaction ${emoji} pour rendre le rôle et re-cacher ces salons._`,
    ].join('\n'),
  },
  horreur: {
    cfgKey: 'role_panel_horreur',
    roleName: 'jeu horreur',
    roleId: null,
    channelName: 'jeu-horreur',
    channelEnvVar: null,
    emoji: '🔪',
    description: (role, emoji) => [
      `Réagis avec ${emoji} ci-dessous pour récupérer le rôle **@${role.name}**.`,
      '',
      'Ce rôle t\'ouvre le salon du **jeu d\'horreur**.',
      '',
      `_Enlève ta réaction ${emoji} pour rendre le rôle et re-cacher le salon._`,
    ].join('\n'),
  },
  cul: {
    cfgKey: 'role_panel_cul',
    roleName: 'jeu cul',
    roleId: null,
    channelName: 'jeu-cul',
    channelEnvVar: null,
    emoji: '🔞',
    description: (role, emoji) => [
      '⚠️ **Contenu réservé aux adultes (18+), à caractère pornographique.**',
      '',
      `Réagis avec ${emoji} ci-dessous — **seulement si tu es majeur·e et que ça ne te dérange pas** — pour récupérer le rôle **@${role.name}**.`,
      '',
      '||Ce rôle ouvre le salon du jeu pornographique d\'Eve. Contenu explicite : ne clique pas si ça peut te choquer.||',
      '',
      `_Enlève ta réaction ${emoji} pour rendre le rôle et re-cacher le salon._`,
    ].join('\n'),
  },
  extension: {
    cfgKey: 'role_panel_extension',
    roleName: 'extensions google',
    roleId: null,
    channelName: 'extensions-google',
    channelEnvVar: null,
    emoji: '🧩',
    description: (role, emoji) => [
      `Réagis avec ${emoji} ci-dessous pour récupérer le rôle **@${role.name}**.`,
      '',
      'Ce rôle t\'ouvre le salon qui présente les **extensions Google Chrome** faites par Eve.',
      '',
      `_Enlève ta réaction ${emoji} pour rendre le rôle et re-cacher le salon._`,
    ].join('\n'),
  },
  tower: {
    cfgKey: 'role_panel_tower',
    roleName: 'tower defense',
    roleId: null,
    channelName: 'tower-defense',
    channelEnvVar: null,
    emoji: '🏰',
    description: (role, emoji) => [
      `Réagis avec ${emoji} ci-dessous pour récupérer le rôle **@${role.name}**.`,
      '',
      'Ce rôle t\'ouvre le salon du jeu **Tower Defense**.',
      '',
      `_Enlève ta réaction ${emoji} pour rendre le rôle et re-cacher le salon._`,
    ].join('\n'),
  },
  evekart: {
    cfgKey: 'role_panel_evekart',
    roleName: 'evekart',
    roleId: null,
    channelName: 'evekart',
    channelEnvVar: null,
    emoji: '🏎️',
    description: (role, emoji) => [
      `Réagis avec ${emoji} ci-dessous pour récupérer le rôle **@${role.name}**.`,
      '',
      'Ce rôle t\'ouvre le salon du jeu **EveKart**.',
      '',
      `_Enlève ta réaction ${emoji} pour rendre le rôle et re-cacher le salon._`,
    ].join('\n'),
  },
  evachi: {
    cfgKey: 'role_panel_evachi',
    roleName: 'evachi',
    roleId: null,
    channelName: 'evachi',
    channelEnvVar: null,
    emoji: '🕹️',
    description: (role, emoji) => [
      `Réagis avec ${emoji} ci-dessous pour récupérer le rôle **@${role.name}**.`,
      '',
      'Ce rôle t\'ouvre le salon de l\'émulateur **EvaChi**.',
      '',
      `_Enlève ta réaction ${emoji} pour rendre le rôle et re-cacher le salon._`,
    ].join('\n'),
  },
};

if (!DISCORD_TOKEN || !SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Il manque DISCORD_TOKEN, SUPABASE_URL ou SUPABASE_KEY dans .env');
  process.exit(1);
}

const GOLD = 0xE2B458, PINK = 0xFF3D7F, GREEN = 0x1DB98A, RED = 0xE5595F, INK = 0x1D272C;

// Lien du site (Cloudflare Pages). SITE_URL peut le surcharger via l'environnement.
const GAME_URL = SITE_URL || 'https://evelatro.pages.dev/';

const db = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });
const shared = makeShared(db);
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessageReactions, GatewayIntentBits.GuildMessages],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction],
});

// Ne jamais faire tomber le bot pour une promesse non gérée (ex: interaction déjà acquittée).
process.on('unhandledRejection', (e) => console.error('unhandledRejection :', (e && e.message) || e));
process.on('uncaughtException', (e) => console.error('uncaughtException :', (e && e.message) || e));

/* ---------- config persistante (table bot_config) ---------- */

async function cfgGet(key) {
  const { data, error } = await db.from('bot_config').select('value').eq('key', key).maybeSingle();
  if (error) {
    console.error(`bot_config LECTURE "${key}" : ${error.message}` +
      (/relation .* does not exist|Could not find the table/i.test(error.message)
        ? '  ->  la table bot_config n\'existe pas : Eve doit lancer supabase/supabase-setup.sql.' : ''));
    return null;
  }
  return data ? data.value : null;
}
async function cfgSet(key, value) {
  const { error } = await db.from('bot_config').upsert({ key, value, updated_at: new Date().toISOString() });
  if (error) {
    console.error(`bot_config ÉCRITURE "${key}" : ${error.message}`);
    throw new Error('bot_config : ' + error.message);
  }
}
async function cfgDel(key) {
  const { error } = await db.from('bot_config').delete().eq('key', key);
  if (error) console.error(`bot_config SUPPRESSION "${key}" : ${error.message}`);
}

/* ---------- helpers ---------- */

const nf = new Intl.NumberFormat('fr-FR');
const money = n => nf.format(Math.round(n || 0)) + ' cr.';
const rel = iso => iso ? `<t:${Math.floor(new Date(iso).getTime() / 1000)}:R>` : '';
const abs = iso => iso ? `<t:${Math.floor(new Date(iso).getTime() / 1000)}:f>` : '';
const medal = i => ['🥇', '🥈', '🥉'][i] || '`#' + (i + 1) + '`';

function emiliaAttachment() {
  const p = join(__dirname, 'emilia.png');
  return existsSync(p) ? new AttachmentBuilder(p, { name: 'emilia.png' }) : null;
}
function gainTag(g) {
  if (g == null) return '';
  if (g > 0) return `📈 **+${money(g)}**`;
  if (g < 0) return `📉 **${money(g)}**`;
  return '➖ nul';
}

/* ---------- payloads d'embed ---------- */

async function leaderboardPayload() {
  const { data, error } = await db.from('scores')
    .select('pseudo, best_score, updated_at')
    .order('best_score', { ascending: false }).limit(10);

  const emb = new EmbedBuilder().setColor(GOLD)
    .setAuthor({ name: 'EveLatro!', iconURL: 'attachment://emilia.png' })
    .setTitle('🏆 Classement — en direct')
    .setThumbnail('attachment://emilia.png').setTimestamp();

  if (error) { emb.setColor(RED).setDescription('Impossible de lire le classement.'); return { embeds: [emb] }; }
  if (!data || !data.length) { emb.setDescription("Personne en jeu pour l'instant. Connecte-toi à Discord dans EveLatro et joue !"); }
  else {
    emb.setDescription(data.map((r, i) => `${medal(i)}  **${r.pseudo || 'Joueur'}** — \`${money(r.best_score)}\``).join('\n'));
    emb.setFooter({ text: 'Solde en temps réel · pas besoin de tomber à 0' });
  }
  const att = emiliaAttachment();
  return { embeds: [emb], files: att ? [att] : [] };
}

async function livePayload() {
  const { data, error } = await db.from('activity')
    .select('pseudo, game, detail, bet, gain, balance, created_at')
    .order('created_at', { ascending: false }).limit(12);

  const emb = new EmbedBuilder().setColor(PINK)
    .setAuthor({ name: 'EveLatro!', iconURL: 'attachment://emilia.png' })
    .setTitle('🎰 En direct').setTimestamp();

  if (error) { emb.setColor(RED).setDescription('Impossible de lire le flux.'); return { embeds: [emb] }; }
  if (!data || !data.length) {
    emb.setDescription("Rien pour l'instant. Le flux se remplit quand quelqu'un joue en étant connecté à Discord dans le jeu.");
  } else {
    emb.setDescription(data.map(r => {
      const bits = [];
      if (r.detail) bits.push(r.detail);
      if (r.bet != null) bits.push(`mise ${money(r.bet)}`);
      const g = gainTag(r.gain); if (g) bits.push(g);
      if (r.balance != null) bits.push(`→ ${money(r.balance)}`);
      return `${rel(r.created_at)} — **${r.pseudo || 'Joueur'}** · ${r.game || 'Casino'}\n ${bits.join(' · ')}`;
    }).join('\n'));
    emb.setFooter({ text: 'Rafraîchi en continu' });
  }
  const att = emiliaAttachment();
  return { embeds: [emb], files: att ? [att] : [] };
}

function feedEmbed(r) {
  const won = r.gain > 0, lost = r.gain < 0;
  return new EmbedBuilder()
    .setColor(won ? GREEN : lost ? RED : PINK)
    .setAuthor({ name: r.pseudo || 'Joueur' })
    .setTitle(r.game || 'Casino')
    .setDescription([
      `🕒 ${abs(r.created_at)}`,
      r.detail ? `🃏 ${r.detail}` : null,
      r.bet != null ? `🎯 Mise : **${money(r.bet)}**` : null,
      r.gain != null ? (won ? `✅ Gagné ${gainTag(r.gain)}` : lost ? `❌ Perdu ${gainTag(r.gain)}` : '➖ Nul') : null,
      r.balance != null ? `💰 Solde : ${money(r.balance)}` : null,
    ].filter(Boolean).join('\n'))
    .setTimestamp(r.created_at ? new Date(r.created_at) : new Date());
}

/* ---------- jobs ---------- */

const jobs = { hourly: null, directe: null, feedSub: null, feedPoll: null, newsSub: null, acScan: null, tgcSub: null, tgcPoll: null };

/* ---------- #evelatro-direct : journal des ouvertures de boosters TGC ----------
   Alimenté par la fonction serveur tgc_open (table tgc_openings). Poste un
   embed par ouverture dans le salon TGC_FEED_CHANNEL_ID (ou LIVE_CHANNEL_ID). */
const TGC_FEED_CHANNEL_ID = process.env.TGC_FEED_CHANNEL_ID || LIVE_CHANNEL_ID || null;
const TGC_GRADE_EMOJI = { UR: '🌈', SR: '✨', R: '🟡', UC: '⚪', C: '⚫' };
const TGC_SET_NAME = { rezero: 'Re:Zero', onepiece: 'One Piece', tolove: 'To LOVE-Ru' };

async function tgcOpeningEmbed(row) {
  let pseudo = 'Joueur', avatar = null;
  try {
    const { data } = await db.from('profiles').select('pseudo,avatar_url').eq('user_id', row.user_id).maybeSingle();
    if (data) { pseudo = data.pseudo || pseudo; avatar = data.avatar_url; }
  } catch (e) {}
  let names = {};
  try {
    const { data } = await db.from('tgc_cards').select('n,name').eq('set', row.set);
    for (const c of (data || [])) names[c.n] = c.name;
  } catch (e) {}
  const lines = (row.cards || []).map(c =>
    `${TGC_GRADE_EMOJI[c.grade] || ''} **${c.grade}** — ${names[c.n] || '#' + c.n}`);
  const best = ['UR', 'SR', 'R', 'UC', 'C'].find(g => (row.cards || []).some(c => c.grade === g)) || 'C';
  return new EmbedBuilder()
    .setColor(best === 'UR' ? GOLD : best === 'SR' ? PINK : 0x8a99a1)
    .setAuthor({ name: pseudo + (avatar ? '' : ''), iconURL: avatar || undefined })
    .setTitle('🎴 Booster ' + (TGC_SET_NAME[row.set] || row.set) + (row.pity ? '  ·  garantie UR' : ''))
    .setDescription(lines.join('\n'))
    .setTimestamp(row.created_at ? new Date(row.created_at) : new Date());
}

function stopTgcFeed() {
  if (jobs.tgcSub) { try { db.removeChannel(jobs.tgcSub); } catch (e) {} jobs.tgcSub = null; }
  clearInterval(jobs.tgcPoll); jobs.tgcPoll = null;
}

async function startTgcFeed() {
  stopTgcFeed();
  // salon choisi via /cartes-direct on  (ou, à défaut, variable d'env)
  let cfg = await cfgGet('tgc_feed');
  const chanId = (cfg && cfg.channel_id) || TGC_FEED_CHANNEL_ID;
  if (!chanId) { console.log('feed cartes : aucun salon (/cartes-direct on #salon) -> désactivé.'); return; }
  const chan = await fetchChannel(chanId);
  if (!chan) { console.warn('feed cartes : salon ' + chanId + ' introuvable (le bot y a-t-il accès ?).'); return; }
  let sinceId = 0;
  try {
    const { data } = await db.from('tgc_openings').select('id').order('id', { ascending: false }).limit(1);
    if (data && data[0]) sinceId = data[0].id;
  } catch (e) {}
  const posted = new Set();
  async function postRow(r) {
    if (!r || r.id == null || posted.has(r.id) || r.id <= sinceId) return;
    posted.add(r.id); if (posted.size > 400) posted.delete(posted.values().next().value);
    sinceId = Math.max(sinceId, r.id);
    try { await chan.send({ embeds: [await tgcOpeningEmbed(r)] }); }
    catch (e) { console.warn('feed cartes envoi KO :', e.message); }
  }
  jobs.tgcSub = db.channel('bot-tgc-' + Date.now())
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'tgc_openings' }, p => postRow(p.new))
    .subscribe((st) => console.log('feed cartes (temps réel) :', st));
  jobs.tgcPoll = setInterval(async () => {
    const { data, error } = await db.from('tgc_openings').select('*').gt('id', sinceId)
      .order('id', { ascending: true }).limit(20);
    if (error) { console.warn('feed cartes (relecture) KO :', error.message); return; }
    for (const r of (data || [])) await postRow(r);
  }, 15000);
  console.log('feed cartes -> salon ' + TGC_FEED_CHANNEL_ID + '  (ouvertures de boosters).');
}

async function runAnticheatScan() {
  try {
    const { data, error } = await db.rpc('anticheat_scan');
    if (error) { console.warn('anticheat_scan :', error.message); return; }
    if (data) console.log(`anticheat_scan : ${data} nouveau(x) compte(s) à examiner (/triche-liste).`);
  } catch (e) { /* fonction pas encore créée (supabase/supabase-anticheat.sql pas lancé) */ }
}

async function fetchChannel(id) {
  if (!id) return null;
  const c = await client.channels.fetch(id).catch(() => null);
  return (c && c.isTextBased()) ? c : null;
}

async function postLeaderboard(channelId, reset) {
  const chan = await fetchChannel(channelId);
  if (!chan) { console.warn(`auto-leaderboard : salon ${channelId} introuvable (le bot y a-t-il accès ?).`); return false; }

  // on supprime le classement précédent pour ne pas spammer le salon
  try {
    const prev = await cfgGet('auto_leaderboard');
    if (prev && prev.last_msg && prev.last_channel === chan.id) {
      const old = await chan.messages.fetch(prev.last_msg).catch(() => null);
      if (old && old.deletable) await old.delete().catch(() => {});
    }
  } catch (e) { /* pas grave */ }

  let sent;
  try {
    sent = await chan.send(await leaderboardPayload());
  } catch (e) {
    console.warn('auto-leaderboard envoi KO :', e.message,
      '  ->  le bot a-t-il "Envoyer des messages" + "Joindre des fichiers" dans ce salon ?');
    return false;
  }
  try {
    const cfg = (await cfgGet('auto_leaderboard')) || {};
    await cfgSet('auto_leaderboard', { ...cfg, last_msg: sent.id, last_channel: chan.id });
  } catch (e) { /* pas grave */ }

  if (reset) {
    const { error } = await db.from('scores').delete().gte('best_score', 0);
    console.log(error ? 'reset scores KO: ' + error.message : 'classement remis à zéro.');
  }
  return true;
}

const LB_INTERVAL = 600_000;   // 10 min (avant : 1 h)

async function startHourly() {
  clearTimeout(jobs.hourly);
  const cfg = await cfgGet('auto_leaderboard');
  if (!cfg || !cfg.channel_id) return;
  const tick = async () => {
    const fresh = await cfgGet('auto_leaderboard');   // relit à chaque fois (peut avoir changé)
    if (!fresh || !fresh.channel_id) return;          // désactivé entre-temps
    await postLeaderboard(fresh.channel_id, fresh.reset);
    jobs.hourly = setTimeout(tick, LB_INTERVAL);
  };
  const wait = LB_INTERVAL - (Date.now() % LB_INTERVAL);   // aligné :00 / :10 / :20…
  jobs.hourly = setTimeout(tick, wait);
  console.log(`auto-leaderboard -> salon ${cfg.channel_id} (reset:${!!cfg.reset}), prochain envoi dans ${Math.round(wait / 60000)} min.`);
}

async function startDirecte() {
  clearInterval(jobs.directe);
  const cfg = await cfgGet('auto_directe');
  if (!cfg || !cfg.channel_id) return;
  const chan = await fetchChannel(cfg.channel_id);
  if (!chan) { console.warn('auto-directe : salon introuvable.'); return; }

  let msg = null;
  if (cfg.message_id) msg = await chan.messages.fetch(cfg.message_id).catch(() => null);
  if (!msg) {
    msg = await chan.send(await livePayload()).catch(() => null);
    if (msg) await cfgSet('auto_directe', { channel_id: cfg.channel_id, message_id: msg.id });
  }
  if (!msg) return;

  jobs.directe = setInterval(async () => {
    try { await msg.edit(await livePayload()); }
    catch (e) { /* message supprime ? on arrete */ clearInterval(jobs.directe); jobs.directe = null; }
  }, 5000);
  console.log(`auto-directe -> salon ${cfg.channel_id}, message ${msg.id}, rafraîchi toutes les 5 s.`);
}

function stopFeed() {
  if (jobs.feedSub) { try { db.removeChannel(jobs.feedSub); } catch (e) {} jobs.feedSub = null; }
  clearInterval(jobs.feedPoll); jobs.feedPoll = null;
}

async function startFeed() {
  stopFeed();
  let cfg = await cfgGet('feed');
  if (!cfg && LIVE_CHANNEL_ID) cfg = { channel_id: LIVE_CHANNEL_ID };
  if (!cfg || !cfg.channel_id) return;
  const chan = await fetchChannel(cfg.channel_id);
  if (!chan) { console.warn('feed : salon introuvable — refais /feed on vers un salon valide.'); return; }

  // on repart d'où on s'était arrêté, sinon de maintenant (pas tout l'historique)
  let since = cfg.since || new Date().toISOString();
  const posted = new Set();     // anti-doublon (temps réel + filet de sécurité)

  async function postRow(r) {
    if (!r || r.id == null || posted.has(r.id)) return;
    posted.add(r.id);
    if (posted.size > 400) posted.delete(posted.values().next().value);
    try { await chan.send({ embeds: [feedEmbed(r)] }); }
    catch (e) { console.warn('feed envoi KO :', e.message); return; }
    if (r.created_at && r.created_at > since) {
      since = r.created_at;
      cfgSet('feed', { channel_id: cfg.channel_id, since }).catch(() => {});
    }
  }

  // 1) temps réel
  jobs.feedSub = db.channel('bot-feed-' + Date.now())
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'activity' },
      (p) => postRow(p.new))
    .subscribe((st) => console.log('feed (temps réel) :', st));

  // 2) FILET DE SÉCURITÉ : on relit la table toutes les 12 s (marche même si le
  //    "temps réel" n'est pas activé côté Supabase)
  jobs.feedPoll = setInterval(async () => {
    const { data, error } = await db.from('activity')
      .select('*').gt('created_at', since)
      .order('created_at', { ascending: true }).limit(20);
    if (error) { console.warn('feed (relecture) KO :', error.message); return; }
    for (const r of (data || [])) await postRow(r);
  }, 12000);

  console.log(`feed -> salon ${cfg.channel_id}  (temps réel + relecture 12 s).`);
}

/* ---------- news : embed + auto-post quand Eve édite la news ---------- */

const isDirectImage = u => typeof u === 'string' && /^https?:\/\/\S+\.(png|jpe?g|gif|webp)(\?\S*)?$/i.test(u.trim());

/* Découpe un texte en champs d'embed (Discord = 1024 car. max par champ).
   Coupe aux sauts de ligne. Le 1er champ garde le titre, les suivants un
   titre invisible -> on obtient plusieurs "cases noires" à la suite. */
function addLongField(emb, name, text, max = 1010) {
  const s = String(text || '').trim();
  if (!s) return;
  const chunks = [];
  let cur = '';
  for (const ln of s.split('\n')) {
    if (ln.length > max) {                       // ligne unique trop longue
      if (cur) { chunks.push(cur); cur = ''; }
      for (let i = 0; i < ln.length; i += max) chunks.push(ln.slice(i, i + max));
      continue;
    }
    if (cur && (cur.length + 1 + ln.length) > max) { chunks.push(cur); cur = ln; }
    else cur = cur ? cur + '\n' + ln : ln;
  }
  if (cur) chunks.push(cur);
  chunks.forEach((c, idx) =>
    emb.addFields({ name: idx === 0 ? name : '​', value: c || '​' }));
}

function newsEmbed(n) {
  const emb = new EmbedBuilder().setColor(GOLD)
    .setAuthor({ name: 'EveLatro! — Quoi de neuf ?', iconURL: 'attachment://emilia.png' })
    .setTitle(n.title || 'Quoi de neuf ?')
    .setTimestamp(n.updated_at ? new Date(n.updated_at) : new Date());
  addLongField(emb, '✨ Nouveautés', n.patch);
  addLongField(emb, '🔜 Bientôt', n.coming);
  const img = Array.isArray(n.images) ? n.images.find(isDirectImage) : null;
  if (img) emb.setImage(img.trim());
  else if (Array.isArray(n.images) && n.images[0]) {
    emb.addFields({ name: '🖼️ Image', value: `[voir l'image](${n.images[0]})  _(colle plutôt un lien direct .jpg/.png pour l'afficher — clic droit sur l'image → « Copier l'adresse de l'image »)_` });
  }
  if (n.cta_url) emb.setDescription(`[${n.cta_label || 'Ouvrir'}](${n.cta_url})`);
  if (n.tag) emb.setFooter({ text: 'v' + n.tag });
  return emb;
}

async function postNews(channelId) {
  const chan = await fetchChannel(channelId);
  if (!chan) return false;
  const { data: n } = await db.from('news').select('*').eq('id', 1).maybeSingle();
  if (!n || !n.tag) return false;
  const att = emiliaAttachment();
  try { await chan.send({ embeds: [newsEmbed(n)], files: att ? [att] : [] }); return true; }
  catch (e) { console.warn('postNews', e.message); return false; }
}

async function startNews() {
  if (jobs.newsSub) { try { db.removeChannel(jobs.newsSub); } catch (e) {} jobs.newsSub = null; }
  const cfg = await cfgGet('news_channel');
  if (!cfg || !cfg.channel_id) return;
  jobs.newsSub = db.channel('bot-news')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'news' },
      () => postNews(cfg.channel_id))
    .subscribe(st => console.log('news (auto) :', st));
  console.log(`news -> salon ${cfg.channel_id} (auto quand Eve édite).`);
}

/* ---------- panneaux rôle (réaction -> rôle) ---------- */

async function resolveRole(guild, panel) {
  const roles = await guild.roles.fetch();
  return roles.find(r => r.name.toLowerCase() === panel.roleName)
      || (panel.roleId ? roles.get(panel.roleId) : null)
      || null;
}

async function ensureRolePanel(panelKey) {
  const panel = ROLE_PANELS[panelKey];
  if (!panel) return;

  const guild = await client.guilds.fetch(DISCORD_GUILD_ID).catch(() => null);
  if (!guild) return;

  let cfg = await cfgGet(panel.cfgKey);

  // rôle : celui choisi via l'option role: d'une commande précédente (cfg.role_id) -> sinon recherche par nom
  let role = cfg && cfg.role_id ? await guild.roles.fetch(cfg.role_id).catch(() => null) : null;
  if (!role) role = await resolveRole(guild, panel);
  if (!role) { console.warn(`role-panel (${panelKey}) : aucun rôle (relance la commande avec l'option role:, ou nomme un rôle "${panel.roleName}").`); return; }

  const me = await guild.members.fetchMe();
  if (!me.permissions.has(PermissionFlagsBits.ManageRoles) || me.roles.highest.position <= role.position) {
    console.warn(`role-panel (${panelKey}) : le bot ne peut pas donner ce rôle (permission "Gérer les rôles" + rôle du bot au-dessus).`);
  }

  // salon : config -> env -> salon nommé d'après le panneau
  let channel = cfg && cfg.channel_id ? await fetchChannel(cfg.channel_id) : null;
  if (!channel && panel.channelEnvVar && process.env[panel.channelEnvVar]) channel = await fetchChannel(process.env[panel.channelEnvVar]);
  if (!channel) {
    const chans = await guild.channels.fetch();
    const named = chans.find(c => c && c.isTextBased?.() && c.name === panel.channelName);
    if (named) channel = named;
  }
  if (!channel) { console.warn(`role-panel (${panelKey}) : aucun salon où poster.`); return; }

  const emoji = (cfg && cfg.emoji) || panel.emoji;

  // message déjà en place ? (même salon ET même rôle — sinon on reposte avec le nouveau rôle)
  if (cfg && cfg.message_id && cfg.channel_id === channel.id && cfg.role_id === role.id) {
    const existing = await channel.messages.fetch(cfg.message_id).catch(() => null);
    if (existing) {
      if (!existing.reactions.cache.some(r => (r.emoji.id || r.emoji.name) === emoji)) {
        await existing.react(emoji).catch(() => {});
      }
      console.log(`role-panel (${panelKey}) déjà posté (#${channel.name}, msg ${existing.id}).`);
      return;
    }
  }

  const emb = new EmbedBuilder()
    .setColor(PINK)
    .setAuthor({ name: 'EveLatro!', iconURL: 'attachment://emilia.png' })
    .setThumbnail('attachment://emilia.png')
    .setTitle(`${emoji}  Rôle : ${role.name}`)
    .setDescription(panel.description(role, emoji))
    .setFooter({ text: 'Un clic sur la réaction suffit' });

  const att = emiliaAttachment();
  const msg = await channel.send({ embeds: [emb], files: att ? [att] : [] });
  await msg.react(emoji).catch(() => {});
  await cfgSet(panel.cfgKey, {
    guild_id: guild.id, channel_id: channel.id, message_id: msg.id, emoji, role_id: role.id,
  });
  console.log(`role-panel (${panelKey}) posté dans #${channel.name} (msg ${msg.id}).`);
}

/* ---------- salon d'aide : rappel + warns ----------
   - un embed de rappel, re-posté (l'ancien est supprimé) à chaque message du salon
   - /warn : +1 warn ; à 3 warns -> le membre ne peut plus écrire ici (lecture seule)
   - /unwarn : remet le compteur à zéro et rend la parole                       */
const CHAT_RULES_CHANNEL = '1543740706714030100';   // salon #aide
const WARN_LIMIT = 3;

function helpRulesEmbed() {
  return new EmbedBuilder()
    .setColor(GOLD)
    .setAuthor({ name: 'EveLatro!', iconURL: 'attachment://emilia.png' })
    .setTitle('📌  Salon d\'aide — à lire')
    .setDescription([
      '**Vérifiez de ne pas répéter** un truc déjà dit.',
      'Pour **discuter**, allez dans un autre salon.',
      '',
      `Tout bavardage, ou répéter quelque chose de déjà dit, entraîne **1 warn**.`,
      `À partir de **${WARN_LIMIT} warns**, il devient impossible d'écrire dans le salon d'aide`,
      '(ni message, ni emoji, ni image ou fichier) — vous pourrez seulement le lire.',
    ].join('\n'));
}

// Re-poste l'embed (supprime le précédent). Anti-spam : au plus 1 fois / 8 s.
let helpRepostTimer = null;
async function repostHelpRules() {
  const channel = await fetchChannel(CHAT_RULES_CHANNEL);
  if (!channel) { console.warn(`chat-rules : salon ${CHAT_RULES_CHANNEL} introuvable.`); return; }
  const cfg = await cfgGet('chat_rules');
  if (cfg && cfg.message_id) {
    const old = await channel.messages.fetch(cfg.message_id).catch(() => null);
    if (old && old.deletable) await old.delete().catch(() => {});
  }
  const att = emiliaAttachment();
  const msg = await channel.send({ embeds: [helpRulesEmbed()], files: att ? [att] : [], allowedMentions: { parse: [] } })
    .catch(e => { console.warn('chat-rules repost KO :', e.message); return null; });
  if (msg) await cfgSet('chat_rules', { channel_id: channel.id, message_id: msg.id });
}

async function ensureChatRules() {
  const channel = await fetchChannel(CHAT_RULES_CHANNEL);
  if (!channel) { console.warn(`chat-rules : salon ${CHAT_RULES_CHANNEL} introuvable.`); return; }
  const cfg = await cfgGet('chat_rules');
  if (cfg && cfg.message_id && cfg.channel_id === channel.id) {
    const existing = await channel.messages.fetch(cfg.message_id).catch(() => null);
    if (existing) { console.log(`chat-rules déjà posté (#${channel.name}).`); return; }
  }
  await repostHelpRules();
  console.log(`chat-rules posté dans #${channel.name}.`);
}

// à chaque message dans le salon d'aide -> on remet l'embed en bas (débounce 8 s)
client.on(Events.MessageCreate, (m) => {
  try {
    if (!m || m.channelId !== CHAT_RULES_CHANNEL) return;
    if (m.author && client.user && m.author.id === client.user.id) return;   // pas nos propres reposts
    if (helpRepostTimer) return;
    helpRepostTimer = setTimeout(() => { helpRepostTimer = null; repostHelpRules(); }, 8000);
  } catch (e) { console.warn('MessageCreate (chat-rules) :', e.message); }
});

/* donne / retire des warns dans le salon d'aide */
async function addWarn(member, raison) {
  const warns = (await cfgGet('help_warns')) || {};
  const n = (warns[member.id] || 0) + 1;
  warns[member.id] = n;
  await cfgSet('help_warns', warns);

  let muted = false, muteErr = null;
  if (n >= WARN_LIMIT) {
    const channel = await fetchChannel(CHAT_RULES_CHANNEL);
    if (channel) {
      try {
        await channel.permissionOverwrites.edit(member.id, {
          ViewChannel: true,
          SendMessages: false,
          SendMessagesInThreads: false,
          CreatePublicThreads: false,
          CreatePrivateThreads: false,
          AddReactions: false,
          AttachFiles: false,
          EmbedLinks: false,
          UseExternalEmojis: false,
          UseApplicationCommands: false,
        }, { reason: `${WARN_LIMIT} warns — salon d'aide${raison ? ' : ' + raison : ''}` });
        muted = true;
      } catch (e) { muteErr = e.message; }
    } else muteErr = 'salon introuvable';
  }
  return { n, muted, muteErr };
}

async function clearWarn(member) {
  const warns = (await cfgGet('help_warns')) || {};
  delete warns[member.id];
  await cfgSet('help_warns', warns);
  const channel = await fetchChannel(CHAT_RULES_CHANNEL);
  if (channel) {
    try { await channel.permissionOverwrites.delete(member.id, 'warns retirés'); }
    catch (e) { return e.message; }
  }
  return null;
}

async function handleRolePanelReaction(reaction, user, add) {
  try {
    if (user.bot) return;
    if (reaction.partial) { try { await reaction.fetch(); } catch { return; } }

    for (const panelKey of Object.keys(ROLE_PANELS)) {
      const panel = ROLE_PANELS[panelKey];
      const cfg = await cfgGet(panel.cfgKey);
      if (!cfg || !cfg.message_id || !cfg.role_id) continue;
      if (reaction.message.id !== cfg.message_id) continue;
      if ((reaction.emoji.id || reaction.emoji.name) !== cfg.emoji) continue;

      const guild = reaction.message.guild || await client.guilds.fetch(cfg.guild_id).catch(() => null);
      if (!guild) return;
      const member = await guild.members.fetch(user.id).catch(() => null);
      if (!member) return;

      if (add) await member.roles.add(cfg.role_id, `Panneau ${panelKey}`);
      else await member.roles.remove(cfg.role_id, `Panneau ${panelKey}`);
      return;
    }
  } catch (e) {
    console.warn('role-panel réaction :', e.message);
  }
}

client.on(Events.MessageReactionAdd, (r, u) => handleRolePanelReaction(r, u, true));
client.on(Events.MessageReactionRemove, (r, u) => handleRolePanelReaction(r, u, false));

/* ---------- commandes ---------- */

const ADMIN = PermissionFlagsBits.ManageGuild;

const COMMANDS = [
  new SlashCommandBuilder().setName('leaderboard').setDescription('Le classement des records EveLatro!'),
  new SlashCommandBuilder().setName('directe').setDescription('Ce qui se passe en direct dans EveLatro!')
    .setDefaultMemberPermissions(ADMIN),

  new SlashCommandBuilder().setName('auto-leaderboard')
    .setDescription('Poster le classement dans un salon toutes les heures')
    .setDefaultMemberPermissions(ADMIN)
    .addSubcommand(s => s.setName('on').setDescription('Activer')
      .addChannelOption(o => o.setName('salon').setDescription('Où poster').setRequired(true))
      .addBooleanOption(o => o.setName('reset').setDescription('Vider le classement après l\'envoi')))
    .addSubcommand(s => s.setName('off').setDescription('Désactiver')),

  new SlashCommandBuilder().setName('auto-directe')
    .setDescription('Un message auto-rafraîchi (5 s) avec le flux en direct')
    .setDefaultMemberPermissions(ADMIN)
    .addSubcommand(s => s.setName('on').setDescription('Activer')
      .addChannelOption(o => o.setName('salon').setDescription('Où poster').setRequired(true)))
    .addSubcommand(s => s.setName('off').setDescription('Désactiver')),

  new SlashCommandBuilder().setName('feed')
    .setDescription('Poster chaque action du jeu dans un salon, en temps réel')
    .setDefaultMemberPermissions(ADMIN)
    .addSubcommand(s => s.setName('on').setDescription('Activer')
      .addChannelOption(o => o.setName('salon').setDescription('Où poster').setRequired(true)))
    .addSubcommand(s => s.setName('off').setDescription('Désactiver')),

  new SlashCommandBuilder().setName('cartes-direct')
    .setDescription('Poster les ouvertures de boosters TGC dans un salon')
    .setDefaultMemberPermissions(ADMIN)
    .addSubcommand(s => s.setName('on').setDescription('Activer')
      .addChannelOption(o => o.setName('salon').setDescription('Où poster (ex : #evelatro-direct)').setRequired(true)))
    .addSubcommand(s => s.setName('off').setDescription('Désactiver')),

  new SlashCommandBuilder().setName('news')
    .setDescription('Éditer le panneau "Quoi de neuf ?" du jeu')
    .setDefaultMemberPermissions(ADMIN),

  new SlashCommandBuilder().setName('role-panel')
    .setDescription('(Re)poster le panneau du rôle "eve weird shit" (réaction = rôle)')
    .setDefaultMemberPermissions(ADMIN)
    .addRoleOption(o => o.setName('role').setDescription('Quel rôle donner (sinon : rôle "eve weird shit")'))
    .addChannelOption(o => o.setName('salon').setDescription('Où poster (défaut : #eve-weird-shit)')),

  new SlashCommandBuilder().setName('jeuhorreur')
    .setDescription('(Re)poster un panneau "jeu horreur" (réaction = rôle)')
    .setDefaultMemberPermissions(ADMIN)
    .addRoleOption(o => o.setName('role').setDescription('Quel rôle donner (sinon : cherche un rôle nommé "jeu horreur")'))
    .addChannelOption(o => o.setName('salon').setDescription('Où poster (défaut : #jeu-horreur)')),

  new SlashCommandBuilder().setName('jeudecul')
    .setDescription('(Re)poster un panneau "jeu cul" — contenu 18+ (réaction = rôle)')
    .setDefaultMemberPermissions(ADMIN)
    .addRoleOption(o => o.setName('role').setDescription('Quel rôle donner (sinon : cherche un rôle nommé "jeu cul")'))
    .addChannelOption(o => o.setName('salon').setDescription('Où poster (défaut : #jeu-cul)')),

  new SlashCommandBuilder().setName('extensiongoogle')
    .setDescription('(Re)poster un panneau "extensions google" (réaction = rôle)')
    .setDefaultMemberPermissions(ADMIN)
    .addRoleOption(o => o.setName('role').setDescription('Quel rôle donner (sinon : cherche un rôle nommé "extensions google")'))
    .addChannelOption(o => o.setName('salon').setDescription('Où poster (défaut : #extensions-google)')),

  new SlashCommandBuilder().setName('towerdefense')
    .setDescription('(Re)poster un panneau "tower defense" (réaction = rôle)')
    .setDefaultMemberPermissions(ADMIN)
    .addRoleOption(o => o.setName('role').setDescription('Quel rôle donner (sinon : cherche un rôle nommé "tower defense")'))
    .addChannelOption(o => o.setName('salon').setDescription('Où poster (défaut : #tower-defense)')),

  new SlashCommandBuilder().setName('evekart')
    .setDescription('(Re)poster un panneau "EveKart" (réaction = rôle)')
    .setDefaultMemberPermissions(ADMIN)
    .addRoleOption(o => o.setName('role').setDescription('Quel rôle donner (sinon : cherche un rôle nommé "evekart")'))
    .addChannelOption(o => o.setName('salon').setDescription('Où poster (défaut : #evekart)')),

  new SlashCommandBuilder().setName('evachi')
    .setDescription('(Re)poster un panneau "EvaChi" (réaction = rôle)')
    .setDefaultMemberPermissions(ADMIN)
    .addRoleOption(o => o.setName('role').setDescription('Quel rôle donner (sinon : cherche un rôle nommé "evachi")'))
    .addChannelOption(o => o.setName('salon').setDescription('Où poster (défaut : #evachi)')),

  new SlashCommandBuilder().setName('jouer')
    .setDescription('Jouer à EveLatro ici : Blackjack, Machines, Roulette, Poker, Caisses'),

  new SlashCommandBuilder().setName('solde')
    .setDescription('Voir ton solde EveLatro (le même que dans l\'app)'),

  new SlashCommandBuilder().setName('vestiaire')
    .setDescription('Acheter / changer la tenue des croupiers (partagé avec le jeu)'),

  new SlashCommandBuilder().setName('annonce')
    .setDescription('Poster l\'annonce du jeu (lien du site + réaction 🤍)')
    .setDefaultMemberPermissions(ADMIN)
    .addChannelOption(o => o.setName('salon').setDescription('Où poster').setRequired(true)),

  new SlashCommandBuilder().setName('news-post')
    .setDescription('Poster le panneau "Quoi de neuf ?" actuel dans un salon')
    .setDefaultMemberPermissions(ADMIN)
    .addChannelOption(o => o.setName('salon').setDescription('Où poster').setRequired(true)),

  new SlashCommandBuilder().setName('warn')
    .setDescription('Donner un warn à un membre (salon d\'aide) — 3 warns = lecture seule')
    .setDefaultMemberPermissions(ADMIN)
    .addUserOption(o => o.setName('membre').setDescription('Qui').setRequired(true))
    .addStringOption(o => o.setName('raison').setDescription('Raison (facultatif)')),

  new SlashCommandBuilder().setName('unwarn')
    .setDescription('Remettre les warns d\'un membre à zéro et lui rendre la parole (salon d\'aide)')
    .setDefaultMemberPermissions(ADMIN)
    .addUserOption(o => o.setName('membre').setDescription('Qui').setRequired(true)),

  new SlashCommandBuilder().setName('emilia-tann')
    .setDescription('Annoncer le jeu Emiliaaa Tann (embed + lien avec aperçu)')
    .setDefaultMemberPermissions(ADMIN),

  new SlashCommandBuilder().setName('tag-purg')
    .setDescription('Annoncer que le tag PURG est dispo (embed + @everyone)')
    .setDefaultMemberPermissions(ADMIN),

  new SlashCommandBuilder().setName('help')
    .setDescription('La liste des commandes joueur d\'EveLatro!'),

  new SlashCommandBuilder().setName('help-admin')
    .setDescription('La liste des commandes réservées aux admins')
    .setDefaultMemberPermissions(ADMIN),

  new SlashCommandBuilder().setName('joueur-fiche')
    .setDescription('Voir les données EveLatro d\'un joueur (à garder avant un reset)')
    .setDefaultMemberPermissions(ADMIN)
    .addStringOption(o => o.setName('discord_id').setDescription('ID Discord du joueur'))
    .addStringOption(o => o.setName('pseudo').setDescription('...ou son pseudo in-game (approximatif)')),

  new SlashCommandBuilder().setName('purge-progression')
    .setDescription('REMET À ZÉRO la progression EveLatro d\'un joueur (crédits, skins, record)')
    .setDefaultMemberPermissions(ADMIN)
    // NB Discord : les options "required" doivent venir AVANT les optionnelles.
    .addBooleanOption(o => o.setName('confirmer').setDescription('Coche pour valider — action irréversible').setRequired(true))
    .addStringOption(o => o.setName('discord_id').setDescription('ID Discord du joueur'))
    .addStringOption(o => o.setName('pseudo').setDescription('...ou son pseudo in-game (approximatif)')),

  new SlashCommandBuilder().setName('crediter')
    .setDescription('Ajouter ou retirer des crédits EveLatro à un joueur')
    .setDefaultMemberPermissions(ADMIN)
    .addIntegerOption(o => o.setName('montant').setDescription('Combien de crédits (nombre négatif = retirer)').setRequired(true))
    .addStringOption(o => o.setName('discord_id').setDescription('ID Discord du joueur (par défaut : toi)'))
    .addBooleanOption(o => o.setName('remplacer').setDescription('Mettre le solde EXACTEMENT à ce montant (au lieu d\'ajouter)')),

  new SlashCommandBuilder().setName('triche-liste')
    .setDescription('Les comptes signalés par l\'anti-triche (ouverts)')
    .setDefaultMemberPermissions(ADMIN),

  new SlashCommandBuilder().setName('triche-confirmer')
    .setDescription('Confirme une triche : reset total de la progression du compte')
    .setDefaultMemberPermissions(ADMIN)
    .addIntegerOption(o => o.setName('fiche').setDescription('N° de fiche (voir /triche-liste)'))
    .addUserOption(o => o.setName('joueur').setDescription('...ou le membre Discord'))
    .addStringOption(o => o.setName('discord_id').setDescription('...ou son ID Discord')),

  new SlashCommandBuilder().setName('triche-annuler')
    .setDescription('Faux positif : restaure la progression du compte')
    .setDefaultMemberPermissions(ADMIN)
    .addIntegerOption(o => o.setName('fiche').setDescription('N° de fiche (voir /triche-liste)'))
    .addUserOption(o => o.setName('joueur').setDescription('...ou le membre Discord'))
    .addStringOption(o => o.setName('discord_id').setDescription('...ou son ID Discord')),

  new SlashCommandBuilder().setName('donner-skin')
    .setDescription('Offrir un skin de caisse à un joueur (réservé)')
    .setDefaultMemberPermissions(ADMIN)
    .addUserOption(o => o.setName('joueur').setDescription('À qui').setRequired(true))
    .addStringOption(o => {
      o.setName('caisse').setDescription('Quelle caisse').setRequired(true);
      CS.crates.slice(0, 25).forEach(c => o.addChoices({ name: c.name, value: c.id }));
      return o;
    })
    .addStringOption(o => o.setName('rarete').setDescription('Forcer une rareté (sinon aléatoire pondérée)')
      .addChoices(
        { name: 'Bleu — Rare', value: 'bleu' },
        { name: 'Violet — Mythique', value: 'violet' },
        { name: 'Rose — Légendaire', value: 'rose' },
        { name: 'Rouge — Ancestral', value: 'rouge' },
        { name: 'Or — couteau / gants', value: 'or' },
      )),
].map(c => c.toJSON());

/* ---------- tire un skin (pour /donner-skin) ---------- */
function rollGiftSkin(crateId, forceRar) {
  const cr = CS.crate(crateId);
  if (!cr) return null;
  let rar = forceRar;
  if (!rar || !cr.skins.some(s => s.rarity === rar)) {
    const pool = CS.RARITY_ORDER.filter(k => cr.skins.some(s => s.rarity === k));
    const w = pool.map(k => CS.RARITY[k].odds);
    let r = Math.random() * w.reduce((a, b) => a + b, 0);
    rar = pool[0];
    for (let i = 0; i < pool.length; i++) { r -= w[i]; if (r <= 0) { rar = pool[i]; break; } }
  }
  const pool = cr.skins.filter(s => s.rarity === rar);
  const base = pool[Math.floor(Math.random() * pool.length)];
  const wr = CS.WEARS[Math.floor(Math.random() * CS.WEARS.length)];
  const stat = Math.random() < 0.1;
  const price = Math.max(1, Math.round(base.price * wr.mult * (stat ? 1.6 : 1)));
  return { crate: cr.id, crateName: cr.name, weapon: base.weapon, name: base.name, rarity: rar, wear: wr.s, stat, price };
}

/* ---------- retrouver un profil par ID Discord OU par pseudo ---------- */
async function findProfile({ discordId, pseudo }) {
  if (discordId) {
    const { data } = await db.from('profiles')
      .select('user_id,pseudo,avatar_url,discord_id').eq('discord_id', String(discordId).trim()).maybeSingle();
    if (data) return { prof: data, how: 'discord_id' };
  }
  if (pseudo) {
    const { data } = await db.from('profiles')
      .select('user_id,pseudo,avatar_url,discord_id').ilike('pseudo', '%' + pseudo.trim() + '%').limit(5);
    if (data && data.length === 1) return { prof: data[0], how: 'pseudo' };
    if (data && data.length > 1) return { many: data };
  }
  return null;
}
async function linkedList() {
  const { data } = await db.from('profiles')
    .select('pseudo,discord_id,updated_at').order('updated_at', { ascending: false }).limit(20);
  return data || [];
}

/* ---------- fiche joueur (données Supabase) ---------- */
async function playerRecordFor(prof) {
  const [w, sk, sc] = await Promise.all([
    db.from('wallet').select('credits,updated_at').eq('user_id', prof.user_id).maybeSingle(),
    db.from('user_skins').select('owned,worn,updated_at').eq('user_id', prof.user_id).maybeSingle(),
    db.from('scores').select('best_score,updated_at').eq('user_id', prof.user_id).maybeSingle(),
  ]);
  return {
    discord_id: prof.discord_id || '—',
    user_id: prof.user_id,
    pseudo: prof.pseudo || null,
    credits: w.data ? Number(w.data.credits) : null,
    wallet_updated_at: w.data ? w.data.updated_at : null,
    skins_owned: sk.data ? sk.data.owned : null,
    skins_worn: sk.data ? sk.data.worn : null,
    best_score: sc.data ? Number(sc.data.best_score) : null,
    score_updated_at: sc.data ? sc.data.updated_at : null,
  };
}
function ficheEmbed(rec, title, color) {
  return new EmbedBuilder().setColor(color ?? 0x4b69ff).setTitle(title)
    .setDescription([
      `**Pseudo** : ${rec.pseudo || '—'}`,
      `**Discord ID** : \`${rec.discord_id}\``,
      `**user_id** : \`${rec.user_id}\``,
      `**Crédits** : ${rec.credits == null ? '—' : rec.credits.toLocaleString('fr-FR')}  _(maj ${rec.wallet_updated_at || '—'})_`,
      `**Record** : ${rec.best_score == null ? '—' : rec.best_score.toLocaleString('fr-FR')}  _(maj ${rec.score_updated_at || '—'})_`,
      `**Skins possédés** : \`${JSON.stringify(rec.skins_owned || {})}\``,
      `**Skins portés** : \`${JSON.stringify(rec.skins_worn || {})}\``,
    ].join('\n'));
}

/* ---------- /news : formulaire ---------- */

async function openNewsModal(i) {
  const { data } = await db.from('news').select('*').eq('id', 1).maybeSingle();
  const cur = data || {};
  const field = (id, label, style, value, ph, required = false) =>
    new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId(id).setLabel(label).setStyle(style)
        .setValue((value ?? '').toString()).setPlaceholder(ph).setRequired(required)
        .setMaxLength(style === TextInputStyle.Short ? 100 : 3800),
    );
  const modal = new ModalBuilder().setCustomId('news-modal').setTitle('Quoi de neuf ?')
    .addComponents(
      field('tag', 'Version (change-la pour ré-afficher)', TextInputStyle.Short, cur.tag, 'ex : 1.1', true),
      field('title', 'Titre', TextInputStyle.Short, cur.title || 'Quoi de neuf ?', 'Quoi de neuf ?'),
      field('patch', 'Ce qui vient de changer', TextInputStyle.Paragraph, cur.patch, '- ...\n- ...'),
      field('coming', 'Ce qui arrive', TextInputStyle.Paragraph, cur.coming, '- ...'),
      field('images', 'Image (lien DIRECT .jpg/.png)', TextInputStyle.Paragraph,
        (cur.images || []).join('\n'), 'Clic droit sur l\'image > Copier l\'adresse de l\'image (doit finir par .jpg/.png)'),
    );
  await i.showModal(modal);
}

async function submitNews(i) {
  const g = id => i.fields.getTextInputValue(id).trim();
  const images = g('images').split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  const { data: cur } = await db.from('news').select('cta_url,cta_label').eq('id', 1).maybeSingle();
  const row = {
    id: 1,
    tag: g('tag'),
    title: g('title') || 'Quoi de neuf ?',
    patch: g('patch') || null,
    coming: g('coming') || null,
    images,
    cta_label: (cur && cur.cta_label) || 'Mettre à jour',
    cta_url: (cur && cur.cta_url) || GAME_URL || null,
    updated_at: new Date().toISOString(),
  };
  const { error } = await db.from('news').upsert(row);
  await i.reply({
    ephemeral: true,
    content: error
      ? '❌ ' + error.message
      : `✅ Panneau publié (v${row.tag}). Il s'affichera au prochain lancement du jeu pour tout le monde.`,
  });
}

/* ---------- lifecycle ---------- */

client.once(Events.ClientReady, async (c) => {
  console.log(`Connecté : ${c.user.tag}  (application ${c.application.id})`);
  c.user.setPresence({ activities: [{ name: '🎰 EveLatro!', type: ActivityType.Playing }], status: 'online' });

  try {
    const g = DISCORD_GUILD_ID ? await c.guilds.fetch(DISCORD_GUILD_ID).catch(() => null) : null;
    if (DISCORD_GUILD_ID && !g) console.warn(`⚠  DISCORD_GUILD_ID=${DISCORD_GUILD_ID} : le bot n'est pas sur ce serveur.`);
    const mgr = g ? g.commands : c.application.commands;
    try {
      const set = await mgr.set(COMMANDS);
      console.log(`✔  ${set.size} commandes ${g ? 'sur "' + g.name + '"' : 'GLOBALES (~1h)'} : ${[...set.values()].map(x => '/' + x.name).join(', ')}`);
    } catch (e) {
      // le batch a échoué (souvent 1 commande invalide) -> on enregistre 1 par 1
      console.error('✖  set() en lot a échoué :', e.message, '— tentative une par une…');
      let ok = 0;
      for (const cmd of COMMANDS) {
        try { await mgr.create(cmd); ok++; }
        catch (e2) { console.error(`   ✖ /${cmd.name} : ${e2.message}`); }
      }
      console.log(`✔  ${ok}/${COMMANDS.length} commandes enregistrées une par une.`);
    }
  } catch (e) {
    console.error('✖  Enregistrement des commandes :', e.message);
    console.error('   → bot invité avec le scope "applications.commands" ? Lien ci-dessous.');
  }
  console.log(`ℹ  Ré-inviter : https://discord.com/api/oauth2/authorize?client_id=${c.application.id}&permissions=268520512&scope=bot%20applications.commands`);

  // --- Tag du serveur sur le bot ---
  //  Impossible : le "server tag" (primary_guild) est réservé aux comptes
  //  utilisateurs. Testé le 2026-09-02 via PATCH /users/@me : Discord accepte
  //  la requête mais ignore primary_guild pour un compte bot.
  //  On se contente de retirer l'ancien préfixe [PURG] du pseudo s'il traîne.
  try {
    const g = DISCORD_GUILD_ID ? await c.guilds.fetch(DISCORD_GUILD_ID).catch(() => null) : null;
    if (g) {
      const me = await g.members.fetchMe();
      if (me.nickname && /^\[PURG\]\s*/i.test(me.nickname)) {
        const clean = me.nickname.replace(/^\[PURG\]\s*/i, '').trim();
        await me.setNickname(clean || null, 'Retrait préfixe PURG')
          .then(() => console.log('✔  préfixe [PURG] retiré du pseudo du bot'))
          .catch(e => console.warn('retrait préfixe KO :', e.message));
      }
    }
  } catch (e) { console.warn('tag serveur :', e.message); }

  // --- auto-test : le bot peut-il écrire dans bot_config ? (sinon /auto-* ne mémorise rien) ---
  try {
    await db.from('bot_config').upsert({ key: '_selftest', value: { at: Date.now() }, updated_at: new Date().toISOString() });
    const { error } = await db.from('bot_config').select('value').eq('key', '_selftest').maybeSingle();
    if (error) throw error;
    await db.from('bot_config').delete().eq('key', '_selftest');
    console.log('✔  bot_config : lecture + écriture OK.');
  } catch (e) {
    console.error('✖  bot_config INACCESSIBLE :', e.message);
    console.error('   → Les commandes /auto-leaderboard, /auto-directe, /feed ne pourront rien mémoriser.');
    console.error('   → Vérifie : (1) supabase/supabase-setup.sql a bien été lancé ; (2) SUPABASE_KEY dans .env');
    console.error('     est la clé  service_role  (PAS la clé anon) — Supabase > Project Settings > API.');
  }

  if (SET_AVATAR === '1') {
    const p = join(__dirname, 'emilia.png');
    if (existsSync(p)) {
      try { await c.user.setAvatar(readFileSync(p)); console.log('Photo de profil : emilia.png'); }
      catch (e) { console.warn('setAvatar :', e.message); }
    }
  }

  await startHourly();
  await startDirecte();
  await startFeed();
  await startTgcFeed();
  await startNews();
  for (const panelKey of Object.keys(ROLE_PANELS)) await ensureRolePanel(panelKey);
  await ensureChatRules();

  // anti-triche : scan des ratios gains/mises toutes les 10 min
  clearInterval(jobs.acScan);
  jobs.acScan = setInterval(runAnticheatScan, 600_000);
  setTimeout(runAnticheatScan, 15_000);
});

/* --- Salon où /jouer /leaderboard /vestiaire sont autorisés --- */
const PLAY_CHANNEL_ID = process.env.PLAY_CHANNEL_ID || '1543320266967359558';   // #evelatro-banque
const CHANNEL_LOCKED = new Set(['jouer', 'leaderboard', 'vestiaire']);

/* --- /jouer : on supprime l'embed après 5 min sans interaction (anti-spam) --- */
const IDLE_MS = 5 * 60_000;
const idleTimers = new Map();   // messageId -> { timeout, ownerId, channelId }
function armIdleDelete(msg, ownerId) {
  const id = msg && (msg.id || msg.messageId);
  const channelId = msg && (msg.channelId || (msg.channel && msg.channel.id));
  if (!id || !channelId) { console.warn('armIdleDelete : message/salon manquant'); return; }
  const prev = idleTimers.get(id);
  clearTimeout(prev && prev.timeout);
  const owner = ownerId || (prev && prev.ownerId) || null;
  const timeout = setTimeout(async () => {
    idleTimers.delete(id);
    let info = null;
    try { if (owner) info = await closeIdleSession(owner, shared); } catch (e) { console.warn('closeIdleSession', e.message); }
    try {
      const ch = await client.channels.fetch(channelId).catch(() => null);
      if (ch && ch.messages) await ch.messages.delete(id);
    } catch (e) { console.warn('idle delete KO', e.message); }
    if (info && info.refund > 0 && owner) {
      try {
        const u = await client.users.fetch(owner);
        await u.send(`⏳ Ta partie EveLatro a été fermée pour inactivité (5 min).\n`
          + `Une manche était en cours : **${nf.format(info.refund)} cr.** (75 % de ta mise de ${nf.format(info.stake)}) t'ont été rendus.`);
      } catch (e) { /* DM fermés */ }
    }
  }, IDLE_MS);
  idleTimers.set(id, { timeout, ownerId: owner, channelId });
  console.log(`idle-delete armé pour msg ${id} (salon ${channelId}), 5 min.`);
}

client.on(Events.InteractionCreate, async (i) => {
  try {
    if (i.isModalSubmit() && i.customId === 'news-modal') return void submitNews(i);

    // --- boutons des jeux ---
    if (i.isButton() && i.customId.startsWith('g:')) {
      // toute interaction repousse la suppression ; owner = celui qui a fait /jouer
      const owner = i.message?.interactionMetadata?.user?.id || i.message?.interaction?.user?.id;
      if (i.message) armIdleDelete(i.message, owner);
      try { await handleButton(i, shared); }
      catch (e) {
        console.warn('jeu bouton :', e.message);
        if (!i.replied && !i.deferred) i.reply({ ephemeral: true, content: 'Oups, un souci de jeu.' }).catch(() => {});
      }
      return;
    }

    if (!i.isChatInputCommand()) return;

    // /jouer /leaderboard /vestiaire : uniquement dans #evelatro-banque
    if (CHANNEL_LOCKED.has(i.commandName) && i.channelId !== PLAY_CHANNEL_ID) {
      return void i.reply({ ephemeral: true, content: `👉 Cette commande s'utilise dans <#${PLAY_CHANNEL_ID}>.` });
    }

    if (i.commandName === 'jouer') {
      await i.deferReply();
      try {
        const prof = await shared.resolve(i.user.id);
        const bal = prof ? await shared.balOf(prof.uid) : 0;
        const reply = await i.editReply(menuPayload(bal, !!prof));
        const msg = reply && reply.id ? reply : await i.fetchReply().catch(e => { console.warn('fetchReply', e.message); return null; });
        armIdleDelete(msg, i.user.id);
        return;
      } catch (e) {
        console.error('/jouer :', e);
        return void i.editReply('Impossible d\'ouvrir le casino : ' + e.message + '\n(les tables `wallet` / `profiles` existent-elles ? relance `supabase/supabase-setup.sql`.)');
      }
    }
    if (i.commandName === 'solde') {
      const prof = await shared.resolve(i.user.id);
      if (!prof) return void i.reply({ ephemeral: true, content: 'Ton compte Discord n\'est pas lié au jeu. Ouvre EveLatro et connecte-toi à Discord dedans (bouton en bas à droite).' });
      const bal = await shared.balOf(prof.uid);
      return void i.reply({ ephemeral: true, content: `Ton solde EveLatro : **${nf.format(bal)} cr.** (le même que dans l'app).` });
    }
    if (i.commandName === 'vestiaire') {
      await i.deferReply({ ephemeral: true });
      const prof = await shared.resolve(i.user.id);
      if (!prof) return void i.editReply('Ton compte Discord n\'est pas lié au jeu. Connecte-toi à Discord DANS EveLatro d\'abord.');
      try { return void i.editReply(await skinsPayload(prof, shared)); }
      catch (e) { console.error('/vestiaire', e); return void i.editReply('Souci : ' + e.message + '\n(table `user_skins` créée ? relance `supabase/supabase-setup.sql`.)'); }
    }
    if (i.commandName === 'annonce') {
      await i.deferReply({ ephemeral: true });
      const salon = i.options.getChannel('salon');

      // 1er embed : l'annonce, en grand (grande image = og.png du site)
      const annonce = new EmbedBuilder()
        .setColor(PINK)
        .setAuthor({ name: 'EveLatro!', iconURL: 'attachment://emilia.png' })
        .setThumbnail('attachment://emilia.png')
        .setTitle('🎰 EveLatro! est en ligne — venez jouer !')
        .setURL(GAME_URL)
        .setDescription([
          'Mon petit casino perso : **Blackjack, machines à sous, vidéo poker, roulette**, mode **VS entre potes**, et des **caisses** à ouvrir.',
          'Zéro argent réel, juste pour le fun. 200 crédits offerts, recharge auto quand on tombe à zéro.',
          '',
          `**Jouer / installer** → ${GAME_URL}`,
          'Navigateur · Windows · Android — même code partout, solde synchronisé.',
          '',
          '**Ça me ferait super plaisir que vous l\'installiez** 💛 — réagissez avec 🤍 si c\'est fait !',
        ].join('\n'))
        .setImage('https://evelatro.pages.dev/og.png')
        .setFooter({ text: 'Multijoueur Discord · classement · duels' });

      // 2e embed : la mise en garde anti-triche
      const antiCheat = new EmbedBuilder()
        .setColor(RED)
        .setTitle('⚠️ Anti-triche strict — à lire')
        .setDescription([
          'Il est possible (rare) de perdre sa progression **en étant honnête** : l\'anti-triche est très strict. Normalement il n\'y a **aucun risque** — si ça vous arrive, **prévenez-moi**.',
          '',
          'Et ça ne sert à rien de tricher puis de venir pleurer : j\'ai **toutes les stats et tout le passif**, le serveur détecte **la moindre anomalie**.',
          '',
          '**PS :** si un faux positif arrive, je peux vous **débannir dans la minute** et vous **récupérez tout**.',
        ].join('\n'));

      const att = emiliaAttachment();
      try {
        const msg = await salon.send({
          embeds: [annonce, antiCheat],
          files: att ? [att] : [],
          allowedMentions: { parse: [] },
        });
        await msg.react('🤍').catch(() => {});
        return void i.editReply(`Annonce postée dans ${salon}.`);
      } catch (e) {
        return void i.editReply(`Impossible de poster dans ${salon} : ${e.message}`);
      }
    }
    if (i.commandName === 'news-post') {
      await i.deferReply({ ephemeral: true });
      const salon = i.options.getChannel('salon');
      try { await cfgSet('news_channel', { channel_id: salon.id }); } catch (e) {}
      await startNews();
      const ok = await postNews(salon.id);
      return void i.editReply(ok
        ? `News postée dans ${salon}. Elle se re-postera automatiquement quand tu l'édites avec \`/news\`.`
        : `Aucune news à publier — utilise \`/news\` d'abord.`);
    }

    if (i.commandName === 'leaderboard') {
      await i.deferReply(); return void i.editReply(await leaderboardPayload());
    }
    if (i.commandName === 'directe') {
      await i.deferReply(); return void i.editReply(await livePayload());
    }
    if (i.commandName === 'news') return void openNewsModal(i);

    if (i.commandName === 'donner-skin') {
      await i.deferReply({ ephemeral: true });
      if (i.user.id !== '411114861276430337') return void i.editReply('Commande réservée.');
      const target = i.options.getUser('joueur');
      const skin = rollGiftSkin(i.options.getString('caisse'), i.options.getString('rarete'));
      if (!skin) return void i.editReply('Caisse inconnue.');
      const { data: prof } = await db.from('profiles').select('user_id,pseudo').eq('discord_id', target.id).maybeSingle();
      if (!prof) return void i.editReply(`**${target.username}** n'est pas lié au jeu. Il doit se connecter à Discord dans EveLatro une fois, puis relance la commande.`);
      const { error } = await db.from('cs_gifts').insert({ user_id: prof.user_id, discord_id: target.id, skin });
      if (error) return void i.editReply('Erreur : ' + error.message + '\n(table `cs_gifts` créée ? relance `supabase/supabase-anticheat.sql`.)');
      console.log(`DONNER-SKIN par ${i.user.tag} -> ${target.tag} : ${skin.weapon} | ${skin.name}`);
      return void i.editReply(`🎁 **${skin.weapon} | ${skin.name}** — ${skin.rarity}${skin.stat ? ' · StatTrak™' : ''} · ${skin.wear} · ~${nf.format(skin.price)} cr.\nEnvoyé à ${target}. Il l'aura à sa prochaine ouverture du jeu (inventaire des caisses).`);
    }

    const HELP_PLAYER = [
      '**/jouer** — jouer ici : Blackjack, Machines, Roulette, Vidéo Poker, Caisses',
      '**/solde** — voir ton solde (le même que dans l\'app)',
      '**/vestiaire** — acheter / changer la tenue des croupiers',
      '**/leaderboard** — le classement en direct',
      '**/help** — ce message',
    ];
    const HELP_ADMIN = [
      '__Salons & annonces__',
      '**/directe** — ce qui se passe en direct dans le jeu',
      '**/auto-leaderboard on|off** — poster le classement toutes les 10 min (option `reset`)',
      '**/auto-directe on|off** — un message auto-rafraîchi avec le flux en direct',
      '**/feed on|off** — poster chaque action du jeu, en temps réel',
      '**/news** — éditer le panneau « Quoi de neuf ? » du jeu',
      '**/news-post** `salon:` — (re)poster ce panneau dans un salon',
      '**/annonce** `salon:` — poster l\'annonce du site (+ réaction 🤍)',
      '**/role-panel** `role:` `salon:` — (re)poster le panneau du rôle « eve weird shit »',
      '**/jeuhorreur** `role:` `salon:` — (re)poster un panneau "jeu horreur"',
      '**/jeudecul** `role:` `salon:` — (re)poster un panneau "jeu cul" (18+)',
      '**/extensiongoogle** `role:` `salon:` — (re)poster un panneau "extensions google"',
      '**/towerdefense** `role:` `salon:` — (re)poster un panneau "tower defense"',
      '**/evekart** `role:` `salon:` — (re)poster un panneau "EveKart"',
      '**/evachi** `role:` `salon:` — (re)poster un panneau "EvaChi"',
      '**/emilia-tann** — annoncer le jeu Emiliaaa Tann (embed + lien avec aperçu)',
      '**/tag-purg** — annoncer que le tag PURG est dispo (embed + **@everyone**)',
      '',
      '__Salon d\'aide__',
      '**/warn** `membre:` `raison:` — +1 warn ; à 3 warns le membre passe en lecture seule (il peut juste lire)',
      '**/unwarn** `membre:` — remet ses warns à zéro et lui rend la parole',
      '',
      '__Anti-triche & modération__',
      '**/crediter** `montant:` `discord_id:` `remplacer:` — ajouter/retirer des crédits (ou fixer le solde)',
      '**/joueur-fiche** — voir les données d\'un joueur (`discord_id` ou `pseudo`)',
      '**/purge-progression** — remet à zéro la progression d\'un joueur (irréversible, trace loggée)',
      '**/triche-liste** — les comptes signalés par l\'anti-triche',
      '**/triche-confirmer** — confirme une triche, reset le compte (`fiche`, `joueur` ou `discord_id`)',
      '**/triche-annuler** — faux positif : restaure la progression depuis la fiche',
      '**/donner-skin** — offrir un skin de caisse à un joueur _(réservé)_',
      '**/help-admin** — la liste admin seule',
    ];

    if (i.commandName === 'help') {
      const isAdmin = i.memberPermissions && i.memberPermissions.has(ADMIN);
      const lines = isAdmin
        ? [...HELP_PLAYER, '', '━━━━━━━━━━  **Admin**  ━━━━━━━━━━', ...HELP_ADMIN]
        : [...HELP_PLAYER, '', '_Les admins ont aussi_ `/help-admin`_._'];
      return void i.reply({ ephemeral: true, embeds: [new EmbedBuilder().setColor(0xFF3D7F)
        .setTitle('EveLatro! — commandes')
        .setDescription(lines.join('\n'))] });
    }

    if (i.commandName === 'help-admin') {
      if (!i.memberPermissions || !i.memberPermissions.has(ADMIN)) {
        return void i.reply({ ephemeral: true, content: 'Réservé aux admins (permission « Gérer le serveur »).' });
      }
      return void i.reply({ ephemeral: true, embeds: [new EmbedBuilder().setColor(0xE2B458)
        .setTitle('EveLatro! — commandes admin')
        .setDescription(HELP_ADMIN.join('\n'))] });
    }

    if (i.commandName === 'triche-liste') {
      await i.deferReply({ ephemeral: true });
      const { data, error } = await db.from('cheat_flags')
        .select('id,pseudo,discord_id,severity,reason,details,created_at')
        .eq('status', 'open').order('created_at', { ascending: false }).limit(20);
      if (error) return void i.editReply('Erreur : ' + error.message + '\n(as-tu lancé `supabase/supabase-anticheat.sql` ?)');
      if (!data || !data.length) return void i.editReply('✅ Aucun compte signalé.');
      const emb = new EmbedBuilder().setColor(0xE5595F).setTitle('🚩 Comptes signalés')
        .setDescription(data.map(f =>
          `**#${f.id}** · ${f.severity === 'auto' ? '🔴 auto (reset fait)' : '🟠 à décider'}\n`
          + `${f.pseudo || '—'} · \`${f.discord_id || '?'}\`\n`
          + `${f.reason} · \`${JSON.stringify(f.details).slice(0, 120)}\``
        ).join('\n\n'))
        .setFooter({ text: '/triche-confirmer ou /triche-annuler — avec fiche:<n>, joueur:@membre, ou discord_id:' });
      return void i.editReply({ embeds: [emb] });
    }

    if (i.commandName === 'triche-confirmer' || i.commandName === 'triche-annuler') {
      await i.deferReply({ ephemeral: true });
      const fid = i.options.getInteger('fiche');
      const usr = i.options.getUser('joueur');
      const did = (usr && usr.id) || i.options.getString('discord_id');

      let f = null;
      if (fid != null) {
        ({ data: f } = await db.from('cheat_flags').select('*').eq('id', fid).maybeSingle());
        if (!f) return void i.editReply(`Fiche #${fid} introuvable.`);
      } else if (did) {
        // dernière fiche OUVERTE de ce joueur (par ID Discord)
        const { data } = await db.from('cheat_flags').select('*')
          .eq('discord_id', String(did).trim()).eq('status', 'open')
          .order('created_at', { ascending: false }).limit(1);
        f = data && data[0];
        if (!f) {
          // pas de discord_id sur la fiche ? on tente via profiles -> user_id
          const { data: prof } = await db.from('profiles').select('user_id').eq('discord_id', String(did).trim()).maybeSingle();
          if (prof) {
            const { data: d2 } = await db.from('cheat_flags').select('*')
              .eq('user_id', prof.user_id).eq('status', 'open')
              .order('created_at', { ascending: false }).limit(1);
            f = d2 && d2[0];
          }
        }
        if (!f) return void i.editReply(`Aucune fiche ouverte pour \`${did}\`. Fais \`/triche-liste\` pour voir les fiches.`);
      } else {
        return void i.editReply('Donne `fiche:` (n°) OU `joueur:` (@membre) OU `discord_id:`.');
      }

      if (f.status !== 'open') return void i.editReply(`Fiche #${f.id} déjà traitée (${f.status}).`);
      const fidR = f.id;
      const stamp = { status: null, resolved_at: new Date().toISOString(), resolved_by: i.user.tag };

      if (i.commandName === 'triche-confirmer') {
        await db.from('wallet').update({ flagged: true, flag_reason: f.reason, flagged_at: stamp.resolved_at, credits: 0, cs_inv: null, bonuses: {} }).eq('user_id', f.user_id);
        await db.from('user_skins').delete().eq('user_id', f.user_id);
        await db.from('scores').delete().eq('user_id', f.user_id);
        await db.from('cheat_flags').update({ ...stamp, status: 'confirmed' }).eq('user_id', f.user_id).eq('status', 'open');
        console.log(`TRICHE CONFIRMÉE fiche #${fidR} par ${i.user.tag} :`, JSON.stringify(f.snapshot));
        return void i.editReply(`🔴 Fiche #${fidR} confirmée. **${f.pseudo || f.discord_id}** : progression remise à zéro (crédits, skins croupier + caisses, bonus, classement). Le jeu se réinitialisera à sa prochaine ouverture. Le snapshot reste dans la fiche.`);
      }

      // triche-annuler : restaure depuis le snapshot
      const s = f.snapshot || {};
      // solde à restaurer = celui d'AVANT l'action douteuse (jamais l'argent buggé)
      const restoreBal = Number.isFinite(s.credits_before) ? s.credits_before
        : Number.isFinite(s.credits) ? s.credits : 200;
      const skRow = Array.isArray(s.skins) ? (s.skins[0] || null) : (s.skins || null);
      await db.from('wallet').update({
        flagged: false, flag_reason: null, credits: restoreBal,
        cs_inv: s.cs_inv ?? null,
        bonuses: s.bonuses ?? {},
      }).eq('user_id', f.user_id);
      if (skRow && (skRow.owned || skRow.worn)) {
        await db.from('user_skins').upsert({ user_id: f.user_id, owned: skRow.owned || {}, worn: skRow.worn || {}, updated_at: stamp.resolved_at });
      }
      if (Number.isFinite(s.score)) {
        await db.from('scores').upsert({ user_id: f.user_id, pseudo: f.pseudo || 'Joueur', best_score: Math.min(s.score, restoreBal), updated_at: stamp.resolved_at });
      }
      await db.from('cheat_flags').update({ ...stamp, status: 'cleared' }).eq('user_id', f.user_id).eq('status', 'open');
      const nSkins = skRow && skRow.owned ? Object.values(skRow.owned).reduce((a, v) => a + (Array.isArray(v) ? v.length : 0), 0) : 0;
      const nCase = Array.isArray(s.cs_inv) ? s.cs_inv.length : 0;
      return void i.editReply(`🟢 Fiche #${fidR} annulée (faux positif). Progression de **${f.pseudo || f.discord_id}** restaurée : **${nf.format(restoreBal)} cr.** (solde d'avant l'incident)${Number.isFinite(s.credits_before) && s.credits_before !== s.credits ? ` — au lieu de ${nf.format(s.credits || 0)} cr. au moment du flag` : ''}, ${nSkins} skin(s) croupier, ${nCase} skin(s) de caisse, bonus + record remis.`);
    }

    if (i.commandName === 'crediter') {
      await i.deferReply({ ephemeral: true });
      const montant = i.options.getInteger('montant');
      const discordId = (i.options.getString('discord_id') || i.user.id).trim();
      const remplacer = i.options.getBoolean('remplacer') || false;

      const found = await findProfile({ discordId });
      if (!found || !found.prof) {
        const list = await linkedList();
        const lines = list.length
          ? list.map(p => `• ${p.pseudo || '—'} — \`${p.discord_id}\``).join('\n')
          : '_(aucun profil lié)_';
        return void i.editReply(`Aucun compte lié à l'ID \`${discordId}\` : le joueur doit ouvrir EveLatro et se connecter à Discord dedans au moins une fois.\n\n**Comptes liés (20 plus récents) :**\n${lines}`);
      }
      const uid = found.prof.user_id;
      const avant = await shared.balOf(uid);
      const apres = Math.max(0, remplacer ? montant : avant + montant);
      await shared.setBal(uid, apres);

      // trace dans le journal anti-triche (cohérence ; sans effet sur les contrôles)
      try {
        const { data: last } = await db.from('wallet_ledger')
          .select('seq').eq('user_id', uid).order('seq', { ascending: false }).limit(1).maybeSingle();
        await db.from('wallet_ledger').insert({
          user_id: uid, seq: (Number(last && last.seq) || 0) + 1,
          delta: apres - avant, reason: 'adjust', game: null, balance_after: apres,
        });
      } catch (e) { console.warn('crediter: journal', e.message); }

      console.log(`CREDITER ${new Date().toISOString()} par ${i.user.username} : ${discordId} (${uid}) ${avant} -> ${apres}`);
      const diff = apres - avant;
      return void i.editReply(
        `✅ Solde de **${found.prof.pseudo || discordId}** : ${nf.format(avant)} → **${nf.format(apres)} cr.** `
        + `(${diff >= 0 ? '+' : ''}${nf.format(diff)}).\n`
        + `_Se met à jour dans le jeu au prochain contrôle serveur (quelques secondes s'il est connecté), ou au prochain lancement._`,
      );
    }

    if (i.commandName === 'joueur-fiche' || i.commandName === 'purge-progression') {
      await i.deferReply({ ephemeral: true });
      const discordId = i.options.getString('discord_id');
      const pseudo = i.options.getString('pseudo');
      if (!discordId && !pseudo) return void i.editReply('Donne au moins `discord_id` ou `pseudo`.');

      const found = await findProfile({ discordId, pseudo });
      if (!found) {
        const list = await linkedList();
        const lines = list.length
          ? list.map(p => `• ${p.pseudo || '—'} — \`${p.discord_id}\``).join('\n')
          : '_(aucun profil lié — la table `profiles` est-elle créée ? le SUPABASE_URL du bot pointe-t-il sur le bon projet ?)_';
        return void i.editReply(`Joueur introuvable.\n\n**Comptes actuellement liés (20 plus récents) :**\n${lines}`);
      }
      if (found.many) {
        return void i.editReply('Plusieurs pseudos correspondent :\n' + found.many.map(p => `• ${p.pseudo} — \`${p.discord_id}\``).join('\n') + '\n\nRelance avec le bon `discord_id`.');
      }

      const rec = await playerRecordFor(found.prof);

      if (i.commandName === 'joueur-fiche') {
        return void i.editReply({ content: `Trouvé via **${found.how}**.`, embeds: [ficheEmbed(rec, '🗂️ Fiche joueur')] });
      }

      // purge
      if (!i.options.getBoolean('confirmer')) return void i.editReply('Annulé — coche `confirmer` pour valider.');
      console.log('PURGE-PROGRESSION ' + new Date().toISOString() + ' par ' + i.user.tag + ' :', JSON.stringify(rec));
      const r1 = await db.from('wallet').delete().eq('user_id', rec.user_id);
      const r2 = await db.from('user_skins').delete().eq('user_id', rec.user_id);
      const r3 = await db.from('scores').delete().eq('user_id', rec.user_id);
      const errs = [r1, r2, r3].map(r => r.error && r.error.message).filter(Boolean);
      return void i.editReply({
        content: errs.length
          ? `⚠️ Purge partielle. Erreurs : ${errs.join(' · ')}`
          : `✅ Progression de **${rec.pseudo || rec.discord_id}** remise à zéro (crédits, skins, record). Fiche ci-dessous, garde-la.`,
        embeds: [ficheEmbed(rec, '🗂️ Fiche AVANT purge (à conserver)', 0xE5595F)],
      });
    }

    const ROLE_PANEL_COMMANDS = {
      'role-panel': 'casino', 'jeuhorreur': 'horreur', 'jeudecul': 'cul',
      'extensiongoogle': 'extension', 'towerdefense': 'tower', 'evekart': 'evekart',
      'evachi': 'evachi',
    };
    if (ROLE_PANEL_COMMANDS[i.commandName]) {
      const panelKey = ROLE_PANEL_COMMANDS[i.commandName];
      const panel = ROLE_PANELS[panelKey];
      await i.deferReply({ ephemeral: true });
      const salon = i.options.getChannel('salon');
      const roleOpt = i.options.getRole('role');
      await cfgDel(panel.cfgKey);
      const patch = {};
      if (salon) patch.channel_id = salon.id;
      if (roleOpt) patch.role_id = roleOpt.id;
      if (Object.keys(patch).length) await cfgSet(panel.cfgKey, patch);
      await ensureRolePanel(panelKey);
      const cfg = await cfgGet(panel.cfgKey);
      if (cfg && cfg.message_id) return void i.editReply(`Panneau posté dans <#${cfg.channel_id}>.`);

      // ça n'a pas marché -> dire précisément quoi faire (Eve ne lit pas les logs du bot)
      const guild = await client.guilds.fetch(DISCORD_GUILD_ID).catch(() => null);
      const role = roleOpt || (guild ? await resolveRole(guild, panel) : null);
      if (!role) {
        return void i.editReply(`❌ Aucun rôle choisi. Relance \`/${i.commandName}\` avec l'option \`role:\` pour choisir le rôle toi-même (ou crée un rôle nommé « ${panel.roleName} »).`);
      }
      return void i.editReply(salon
        ? `❌ Impossible de poster dans ${salon} — vérifie que le bot a la permission "Envoyer des messages" dans ce salon.`
        : `❌ Aucun salon trouvé. Choisis un salon avec \`salon:\` en relançant \`/${i.commandName}\`, ou crée un salon nommé **#${panel.channelName}**.`);
    }

    if (i.commandName === 'warn') {
      await i.deferReply({ ephemeral: true });
      const membre = i.options.getUser('membre');
      const raison = i.options.getString('raison') || null;
      const { n, muted, muteErr } = await addWarn(membre, raison);

      // petit message public dans le salon d'aide
      const chan = await fetchChannel(CHAT_RULES_CHANNEL);
      if (chan) {
        const line = n >= WARN_LIMIT
          ? `⛔ <@${membre.id}> — **warn ${n}/${WARN_LIMIT}**. Tu ne peux plus écrire dans ce salon (lecture seule).`
          : `⚠️ <@${membre.id}> — **warn ${n}/${WARN_LIMIT}**${raison ? ` (${raison})` : ''}. Répéter ou bavarder ici peut te couper la parole à ${WARN_LIMIT}.`;
        await chan.send({ content: line, allowedMentions: { users: [membre.id] } }).catch(() => {});
      }

      if (n >= WARN_LIMIT && muteErr) {
        return void i.editReply(`Warn ${n}/${WARN_LIMIT} enregistré pour ${membre}, mais je n'ai pas pu couper la parole : ${muteErr}\n(le bot a-t-il « Gérer les rôles » / « Gérer les permissions » sur le salon d'aide ?)`);
      }
      return void i.editReply(muted
        ? `⛔ ${membre} est maintenant en **lecture seule** dans le salon d'aide (${n} warns). \`/unwarn\` pour annuler.`
        : `⚠️ Warn **${n}/${WARN_LIMIT}** pour ${membre}.`);
    }

    if (i.commandName === 'unwarn') {
      await i.deferReply({ ephemeral: true });
      const membre = i.options.getUser('membre');
      const err = await clearWarn(membre);
      return void i.editReply(err
        ? `Warns remis à zéro pour ${membre}, mais la parole n'a pas pu être rétablie : ${err}`
        : `✅ ${membre} : warns remis à zéro, parole rendue dans le salon d'aide.`);
    }

    if (i.commandName === 'emilia-tann') {
      const p = join(__dirname, 'emilia-tann.png');
      const att = existsSync(p) ? new AttachmentBuilder(p, { name: 'emilia-tann.png' }) : null;
      const emb = new EmbedBuilder()
        .setColor(PINK)
        .setTitle('Emiliaaa Tann---♡')
        .setDescription('Nouveau jeu purement pornographique, amusez-vous bien ! (finalement je le met quand même)');
      if (att) emb.setImage('attachment://emilia-tann.png');
      await i.reply({ embeds: [emb], files: att ? [att] : [], allowedMentions: { parse: [] } });
      // message séparé, SANS embed : Discord n'affiche l'aperçu du site que comme ça
      await i.followUp({ content: 'https://emiliaaa-tann.netlify.app/', allowedMentions: { parse: [] } });
      return;
    }

    if (i.commandName === 'tag-purg') {
      const emb = new EmbedBuilder()
        .setColor(PINK)
        .setAuthor({ name: 'EveLatro!', iconURL: 'attachment://emilia.png' })
        .setTitle('🏷️  Tag PURG')
        .setDescription("Le tag **PURG(atoire)** est disponible, n'hésitez pas à l'ajouter sur votre profil.");
      const att = emiliaAttachment();
      await i.reply({ embeds: [emb], files: att ? [att] : [], allowedMentions: { parse: [] } });
      // message séparé SANS embed : le vrai ping @everyone
      await i.followUp({ content: '@everyone', allowedMentions: { parse: ['everyone'] } });
      return;
    }

    // --- admin ---
    const sub = i.options.getSubcommand(false);

    if (i.commandName === 'auto-leaderboard') {
      await i.deferReply({ ephemeral: true });
      if (sub === 'off') {
        clearTimeout(jobs.hourly); jobs.hourly = null;
        await cfgDel('auto_leaderboard');
        return void i.editReply('Auto-classement désactivé.');
      }
      const salon = i.options.getChannel('salon');
      const reset = i.options.getBoolean('reset') || false;
      try {
        await cfgSet('auto_leaderboard', { channel_id: salon.id, reset });
      } catch (e) {
        return void i.editReply(`❌ Impossible d'enregistrer : ${e.message}\n(la table \`bot_config\` existe-t-elle ? Lance \`supabase/supabase-setup.sql\`.)`);
      }
      await startHourly();
      // envoi immédiat pour vérifier tout de suite que ça marche
      const ok = await postLeaderboard(salon.id, false);
      const mins = Math.max(1, Math.round((LB_INTERVAL - (Date.now() % LB_INTERVAL)) / 60_000));
      return void i.editReply(ok
        ? `✅ Classement posté dans ${salon}, puis **toutes les 10 min** (prochain dans ~${mins} min). L'ancien message est supprimé à chaque fois.${reset ? ' Remise à zéro du classement après chaque envoi.' : ''}`
        : `⚠️ Enregistré, mais l'envoi de test a échoué. Vérifie que le bot peut **écrire** et **joindre des fichiers** dans ${salon} (voir les logs).`);
    }

    if (i.commandName === 'auto-directe') {
      if (sub === 'off') { clearInterval(jobs.directe); jobs.directe = null; await cfgDel('auto_directe'); return void i.reply({ ephemeral: true, content: 'Auto-directe désactivé.' }); }
      const salon = i.options.getChannel('salon');
      await cfgSet('auto_directe', { channel_id: salon.id });
      await startDirecte();
      return void i.reply({ ephemeral: true, content: `Message "en direct" dans ${salon}, rafraîchi toutes les 5 s.` });
    }

    if (i.commandName === 'feed') {
      await i.deferReply({ ephemeral: true });
      if (sub === 'off') {
        stopFeed();
        await cfgDel('feed');
        return void i.editReply('Flux désactivé.');
      }
      const salon = i.options.getChannel('salon');
      try {
        await cfgSet('feed', { channel_id: salon.id });
      } catch (e) {
        return void i.editReply(`❌ Impossible d'enregistrer : ${e.message}`);
      }
      await startFeed();
      // message de confirmation dans le salon (vérifie salon + permissions)
      let sent = true;
      try {
        await salon.send({
          embeds: [new EmbedBuilder().setColor(GREEN)
            .setAuthor({ name: 'EveLatro!' })
            .setDescription('✅ **Flux branché sur ce salon.**\n\nJoue une partie **en étant connecté à Discord dans le jeu** → chaque coup s\'affichera ici en direct.')],
        });
      } catch (e) { sent = false; console.warn('feed confirmation KO :', e.message); }
      return void i.editReply(sent
        ? `✅ C'est bon. Les parties (jouées en étant connecté à Discord) s'afficheront dans ${salon}.`
        : `⚠️ Enregistré, mais je ne peux pas écrire dans ${salon}. Donne au bot les droits **Envoyer des messages** + **Intégrer des liens** dans ce salon.`);
    }

    if (i.commandName === 'cartes-direct') {
      await i.deferReply({ ephemeral: true });
      if (sub === 'off') {
        stopTgcFeed();
        await cfgDel('tgc_feed');
        return void i.editReply('Journal des ouvertures de boosters désactivé.');
      }
      const salon = i.options.getChannel('salon');
      try { await cfgSet('tgc_feed', { channel_id: salon.id }); }
      catch (e) { return void i.editReply(`❌ Impossible d'enregistrer : ${e.message}`); }
      await startTgcFeed();
      let sent = true;
      try {
        await salon.send({
          embeds: [new EmbedBuilder().setColor(GOLD)
            .setAuthor({ name: 'EveLatro! — Cartes' })
            .setDescription('🎴 **Journal des boosters branché sur ce salon.**\n\nChaque booster ouvert dans le jeu s\'affichera ici, avec les cartes tirées.')],
        });
      } catch (e) { sent = false; console.warn('cartes-direct confirmation KO :', e.message); }
      return void i.editReply(sent
        ? `✅ C'est bon. Les ouvertures de boosters s'afficheront dans ${salon}.`
        : `⚠️ Enregistré, mais je ne peux pas écrire dans ${salon}. Donne au bot les droits **Envoyer des messages** + **Intégrer des liens**.`);
    }
  } catch (e) {
    console.error(e);
    if (i.isRepliable() && !i.replied && !i.deferred) i.reply({ ephemeral: true, content: 'Oups, un souci.' }).catch(() => {});
    else if (i.deferred) i.editReply('Oups, un souci.').catch(() => {});
  }
});

client.login(DISCORD_TOKEN);
