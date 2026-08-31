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

/* Petit serveur "je suis vivant" : certaines plateformes (Railway en mode
   "web service") tuent le conteneur si rien n'écoute sur un port. Inoffensif
   ailleurs. */
if (process.env.PORT) {
  http.createServer((req, res) => { res.writeHead(200); res.end('EveLatro bot OK'); })
    .listen(process.env.PORT, () => console.log('health server :' + process.env.PORT));
}
import {
  Client, GatewayIntentBits, Partials, EmbedBuilder, AttachmentBuilder, Events, ActivityType,
  SlashCommandBuilder, PermissionFlagsBits,
  ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder,
} from 'discord.js';
import { createClient } from '@supabase/supabase-js';
import { makeShared, menuPayload, skinsPayload, handleButton, closeIdleSession } from './games.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const {
  DISCORD_TOKEN, SUPABASE_URL, SUPABASE_KEY,
  DISCORD_GUILD_ID, LIVE_CHANNEL_ID, SITE_URL, SET_AVATAR,
  ROLE_PANEL_CHANNEL_ID,
} = process.env;

/* Rôle proposé par le panneau de réaction (voir ensureRolePanel / /role-panel) */
const WEIRD_ROLE_NAME = 'eve weird shit';
const WEIRD_ROLE_ID = '1543192258101252136';   // secours si le nom change
const WEIRD_CHANNEL_NAME = 'eve-weird-shit';
const WEIRD_EMOJI = '🎰';

if (!DISCORD_TOKEN || !SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Il manque DISCORD_TOKEN, SUPABASE_URL ou SUPABASE_KEY dans .env');
  process.exit(1);
}

const GOLD = 0xE2B458, PINK = 0xFF3D7F, GREEN = 0x1DB98A, RED = 0xE5595F, INK = 0x1D272C;

const db = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });
const shared = makeShared(db);
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessageReactions],
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
        ? '  ->  la table bot_config n\'existe pas : Eve doit lancer supabase-setup.sql.' : ''));
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

const jobs = { hourly: null, directe: null, feedSub: null, feedPoll: null, newsSub: null, acScan: null };

async function runAnticheatScan() {
  try {
    const { data, error } = await db.rpc('anticheat_scan');
    if (error) { console.warn('anticheat_scan :', error.message); return; }
    if (data) console.log(`anticheat_scan : ${data} nouveau(x) compte(s) à examiner (/triche-liste).`);
  } catch (e) { /* fonction pas encore créée (supabase-anticheat.sql pas lancé) */ }
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

function newsEmbed(n) {
  const emb = new EmbedBuilder().setColor(GOLD)
    .setAuthor({ name: 'EveLatro! — Quoi de neuf ?', iconURL: 'attachment://emilia.png' })
    .setTitle(n.title || 'Quoi de neuf ?')
    .setTimestamp(n.updated_at ? new Date(n.updated_at) : new Date());
  if (n.patch) emb.addFields({ name: '✨ Nouveautés', value: String(n.patch).slice(0, 1000) });
  if (n.coming) emb.addFields({ name: '🔜 Bientôt', value: String(n.coming).slice(0, 1000) });
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

/* ---------- panneau rôle "eve weird shit" (réaction -> rôle) ---------- */

async function resolveWeirdRole(guild) {
  const roles = await guild.roles.fetch();
  return roles.find(r => r.name.toLowerCase() === WEIRD_ROLE_NAME)
      || roles.get(WEIRD_ROLE_ID)
      || null;
}

async function ensureRolePanel() {
  const guild = await client.guilds.fetch(DISCORD_GUILD_ID).catch(() => null);
  if (!guild) return;

  const role = await resolveWeirdRole(guild);
  if (!role) { console.warn(`role-panel : rôle "${WEIRD_ROLE_NAME}" introuvable.`); return; }

  const me = await guild.members.fetchMe();
  if (!me.permissions.has(PermissionFlagsBits.ManageRoles) || me.roles.highest.position <= role.position) {
    console.warn('role-panel : le bot ne peut pas donner ce rôle (permission "Gérer les rôles" + rôle du bot au-dessus).');
  }

  let cfg = await cfgGet('role_panel');

  // salon : config -> env -> salon nommé "eve-weird-shit"
  let channel = cfg && cfg.channel_id ? await fetchChannel(cfg.channel_id) : null;
  if (!channel && ROLE_PANEL_CHANNEL_ID) channel = await fetchChannel(ROLE_PANEL_CHANNEL_ID);
  if (!channel) {
    const chans = await guild.channels.fetch();
    const named = chans.find(c => c && c.isTextBased?.() && c.name === WEIRD_CHANNEL_NAME);
    if (named) channel = named;
  }
  if (!channel) { console.warn('role-panel : aucun salon où poster.'); return; }

  const emoji = (cfg && cfg.emoji) || WEIRD_EMOJI;

  // message déjà en place ?
  if (cfg && cfg.message_id && cfg.channel_id === channel.id) {
    const existing = await channel.messages.fetch(cfg.message_id).catch(() => null);
    if (existing) {
      if (!existing.reactions.cache.some(r => (r.emoji.id || r.emoji.name) === emoji)) {
        await existing.react(emoji).catch(() => {});
      }
      console.log(`role-panel déjà posté (#${channel.name}, msg ${existing.id}).`);
      return;
    }
  }

  const emb = new EmbedBuilder()
    .setColor(PINK)
    .setAuthor({ name: 'EveLatro!', iconURL: 'attachment://emilia.png' })
    .setThumbnail('attachment://emilia.png')
    .setTitle(`${emoji}  Rôle : ${role.name}`)
    .setDescription([
      `Réagis avec ${emoji} ci-dessous pour récupérer le rôle **@${role.name}**.`,
      '',
      'Ce rôle t\'ouvre les salons qui vont avec : le casino **EveLatro!**, son classement et son flux en direct.',
      '',
      `_Enlève ta réaction ${emoji} pour rendre le rôle et re-cacher ces salons._`,
    ].join('\n'))
    .setFooter({ text: 'Un clic sur la réaction suffit' });

  const att = emiliaAttachment();
  const msg = await channel.send({ embeds: [emb], files: att ? [att] : [] });
  await msg.react(emoji).catch(() => {});
  await cfgSet('role_panel', {
    guild_id: guild.id, channel_id: channel.id, message_id: msg.id, emoji, role_id: role.id,
  });
  console.log(`role-panel posté dans #${channel.name} (msg ${msg.id}).`);
}

async function handleRolePanelReaction(reaction, user, add) {
  try {
    if (user.bot) return;
    const cfg = await cfgGet('role_panel');
    if (!cfg || !cfg.message_id || !cfg.role_id) return;
    if (reaction.partial) { try { await reaction.fetch(); } catch { return; } }
    if (reaction.message.id !== cfg.message_id) return;
    if ((reaction.emoji.id || reaction.emoji.name) !== cfg.emoji) return;

    const guild = reaction.message.guild || await client.guilds.fetch(cfg.guild_id).catch(() => null);
    if (!guild) return;
    const member = await guild.members.fetch(user.id).catch(() => null);
    if (!member) return;

    if (add) await member.roles.add(cfg.role_id, 'Panneau eve weird shit');
    else await member.roles.remove(cfg.role_id, 'Panneau eve weird shit');
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

  new SlashCommandBuilder().setName('news')
    .setDescription('Éditer le panneau "Quoi de neuf ?" du jeu')
    .setDefaultMemberPermissions(ADMIN),

  new SlashCommandBuilder().setName('role-panel')
    .setDescription('(Re)poster le panneau du rôle "eve weird shit" (réaction = rôle)')
    .setDefaultMemberPermissions(ADMIN)
    .addChannelOption(o => o.setName('salon').setDescription('Où poster (défaut : #eve-weird-shit)')),

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
].map(c => c.toJSON());

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
    cta_url: (cur && cur.cta_url) || SITE_URL || null,
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
    console.error('   → Vérifie : (1) supabase-setup.sql a bien été lancé ; (2) SUPABASE_KEY dans .env');
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
  await startNews();
  await ensureRolePanel();

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
        return void i.editReply('Impossible d\'ouvrir le casino : ' + e.message + '\n(les tables `wallet` / `profiles` existent-elles ? relance `supabase-setup.sql`.)');
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
      catch (e) { console.error('/vestiaire', e); return void i.editReply('Souci : ' + e.message + '\n(table `user_skins` créée ? relance `supabase-setup.sql`.)'); }
    }
    if (i.commandName === 'annonce') {
      await i.deferReply({ ephemeral: true });
      const salon = i.options.getChannel('salon');
      const url = SITE_URL || 'https://evelatro.netlify.app/';
      // message texte simple : Discord déploie tout seul le grand aperçu du site
      const text = [
        '🎰 **EveLatro! est en ligne** — mon petit casino perso, venez jouer !',
        '',
        'Blackjack, machines à sous, vidéo poker, roulette, mode VS entre potes, et des caisses à ouvrir. Zéro argent réel, juste pour le fun.',
        '',
        '**Ça me ferait super plaisir que vous l\'installiez** (PC, Android, ou direct dans le navigateur) 💛',
        'Réagissez avec 🤍 si vous l\'avez fait !',
        '',
        url,
      ].join('\n');
      try {
        const msg = await salon.send({ content: text, allowedMentions: { parse: [] } });
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

    if (i.commandName === 'help') {
      return void i.reply({ ephemeral: true, embeds: [new EmbedBuilder().setColor(0xFF3D7F)
        .setTitle('EveLatro! — commandes')
        .setDescription([
          '**/jouer** — jouer ici : Blackjack, Machines, Roulette, Vidéo Poker, Caisses',
          '**/solde** — voir ton solde (le même que dans l\'app)',
          '**/vestiaire** — acheter / changer la tenue des croupiers',
          '**/leaderboard** — le classement en direct',
          '**/help** — ce message',
          '',
          '_Les admins ont aussi_ `/help-admin`_._',
        ].join('\n'))] });
    }

    if (i.commandName === 'help-admin') {
      if (!i.memberPermissions || !i.memberPermissions.has(ADMIN)) {
        return void i.reply({ ephemeral: true, content: 'Réservé aux admins (permission « Gérer le serveur »).' });
      }
      return void i.reply({ ephemeral: true, embeds: [new EmbedBuilder().setColor(0xE2B458)
        .setTitle('EveLatro! — commandes admin')
        .setDescription([
          '**/directe** — ce qui se passe en direct dans le jeu',
          '**/auto-leaderboard on|off** — poster le classement toutes les 10 min (option `reset`)',
          '**/auto-directe on|off** — un message auto-rafraîchi avec le flux en direct',
          '**/feed on|off** — poster chaque action du jeu, en temps réel',
          '**/news** — éditer le panneau « Quoi de neuf ? » du jeu',
          '**/news-post** — (re)poster ce panneau dans un salon',
          '**/annonce** — poster l\'annonce du site (+ réaction 🤍)',
          '**/role-panel** — (re)poster le panneau du rôle « eve weird shit »',
          '',
          '__Anti-triche & modération__',
          '**/joueur-fiche** — voir les données d\'un joueur (`discord_id` ou `pseudo`)',
          '**/purge-progression** — remet à zéro la progression d\'un joueur (irréversible, trace loggée)',
          '**/triche-liste** — les comptes signalés par l\'anti-triche',
          '**/triche-confirmer** — confirme une triche, reset le compte (`fiche`, `joueur` ou `discord_id`)',
          '**/triche-annuler** — faux positif : restaure la progression depuis la fiche',
          '',
          '**/help-admin** — ce message',
        ].join('\n'))] });
    }

    if (i.commandName === 'triche-liste') {
      await i.deferReply({ ephemeral: true });
      const { data, error } = await db.from('cheat_flags')
        .select('id,pseudo,discord_id,severity,reason,details,created_at')
        .eq('status', 'open').order('created_at', { ascending: false }).limit(20);
      if (error) return void i.editReply('Erreur : ' + error.message + '\n(as-tu lancé `supabase-anticheat.sql` ?)');
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
        await db.from('wallet').update({ flagged: true, flag_reason: f.reason, flagged_at: stamp.resolved_at, credits: 0 }).eq('user_id', f.user_id);
        await db.from('user_skins').delete().eq('user_id', f.user_id);
        await db.from('scores').delete().eq('user_id', f.user_id);
        await db.from('cheat_flags').update({ ...stamp, status: 'confirmed' }).eq('user_id', f.user_id).eq('status', 'open');
        console.log(`TRICHE CONFIRMÉE fiche #${fidR} par ${i.user.tag} :`, JSON.stringify(f.snapshot));
        return void i.editReply(`🔴 Fiche #${fidR} confirmée. **${f.pseudo || f.discord_id}** : progression remise à zéro. Le jeu se réinitialisera à sa prochaine ouverture. Le snapshot reste dans la fiche.`);
      }

      // triche-annuler : restaure depuis le snapshot
      const s = f.snapshot || {};
      await db.from('wallet').update({ flagged: false, flag_reason: null, credits: Number.isFinite(s.credits) ? s.credits : 200 }).eq('user_id', f.user_id);
      if (s.skins && (s.skins.owned || s.skins.worn)) {
        await db.from('user_skins').upsert({ user_id: f.user_id, owned: s.skins.owned || {}, worn: s.skins.worn || {}, updated_at: stamp.resolved_at });
      }
      if (Number.isFinite(s.score)) {
        await db.from('scores').upsert({ user_id: f.user_id, pseudo: f.pseudo || 'Joueur', best_score: s.score, updated_at: stamp.resolved_at });
      }
      await db.from('cheat_flags').update({ ...stamp, status: 'cleared' }).eq('user_id', f.user_id).eq('status', 'open');
      return void i.editReply(`🟢 Fiche #${fidR} annulée (faux positif). Progression de **${f.pseudo || f.discord_id}** restaurée : ${Number.isFinite(s.credits) ? nf.format(s.credits) : 200} cr., skins + record remis.`);
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

    if (i.commandName === 'role-panel') {
      await i.deferReply({ ephemeral: true });
      const salon = i.options.getChannel('salon');
      await cfgDel('role_panel');
      if (salon) await cfgSet('role_panel', { channel_id: salon.id });
      await ensureRolePanel();
      const cfg = await cfgGet('role_panel');
      return void i.editReply(cfg && cfg.message_id
        ? `Panneau posté dans <#${cfg.channel_id}>.`
        : 'Impossible de poster le panneau (voir les logs du bot).');
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
        return void i.editReply(`❌ Impossible d'enregistrer : ${e.message}\n(la table \`bot_config\` existe-t-elle ? Lance \`supabase-setup.sql\`.)`);
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
  } catch (e) {
    console.error(e);
    if (i.isRepliable() && !i.replied && !i.deferred) i.reply({ ephemeral: true, content: 'Oups, un souci.' }).catch(() => {});
    else if (i.deferred) i.editReply('Oups, un souci.').catch(() => {});
  }
});

client.login(DISCORD_TOKEN);
