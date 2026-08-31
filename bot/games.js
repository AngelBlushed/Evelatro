/* ===========================================================
   Jouer à EveLatro depuis Discord (embeds + boutons).
   Mêmes règles que le jeu. Le solde et les skins sont les MÊMES
   que dans l'app (tables Supabase) — progression centralisée.

   Jeux : Blackjack · Machines (x3) · Roulette · Vidéo Poker · Caisses.
   Croupier : seulement au Blackjack et au Poker (comme dans le jeu).
   =========================================================== */

import {
  EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder,
} from 'discord.js';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { pickLine } from './croupier-lines.mjs';
import { CS } from './cs-catalog.mjs';
import { renderBlackjack, renderPoker } from './render-table.js';

const HERE = dirname(fileURLToPath(import.meta.url));

/* --- tenues des croupiers (mêmes que le jeu) --- */
const SKIN_PRICE = [0, 5000, 15000, 35000, 50000];
const SKIN_CAT = {
  men: ['Smoking rubis', 'Chef flambeur', 'Costume saphir', 'Grand magicien', 'Escale plage'],
  women: ['Robe cabaret', 'Belle du Far West', 'Salon victorien', 'Étoile du cirque', 'Plage écarlate'],
};
/* Renvoie le fichier du croupier + la référence attachment:// à utiliser.
   still = true  -> image FIXE (.webp) : pour le menu (Eve le veut immobile)
   still = false -> GIF qui flotte de haut en bas : en jeu (Blackjack / Poker) */
function croupierAsset(gender, skin, still) {
  const g = gender === 'women' ? 'women' : 'men';
  const s = Math.max(0, Math.min(4, skin | 0));
  const cands = still
    ? [['croupier.webp', `${g}-${s}.still.webp`], ['croupier.gif', `${g}-${s}.gif`]]
    : [['croupier.gif', `${g}-${s}.gif`], ['croupier.webp', `${g}-${s}.still.webp`]];
  for (const [name, file] of cands) {
    const p = join(HERE, 'croupiers', file);
    if (existsSync(p)) return { file: new AttachmentBuilder(p, { name }), ref: `attachment://${name}` };
  }
  return null;
}

const GOLD = 0xE2B458, GREEN = 0x1DB98A, RED = 0xE5595F, PINK = 0xFF3D7F, INK = 0x1D272C, BLUE = 0x4b69ff;
const START = 200;
const money = n => Number(n || 0).toLocaleString('fr-FR') + ' cr.';

/* --- panneau de mise (comme dans le jeu : jetons + montants) --- */
const CHIPS = [50, 100, 500, 1000, 5000, 25000];
function betPanelPayload(s, back) {
  const emb = new EmbedBuilder().setColor(GOLD)
    .setTitle('🪙 Ta mise')
    .setDescription(`**${money(s.stake)}**\nSolde : **${money(s.bal)}**`)
    .setFooter({ text: 'Clique les jetons pour ajouter, puis Valider.' });
  const chipRow1 = row(...CHIPS.slice(0, 3).map(v => btn('g:bet:a:' + v, '+ ' + money(v), ButtonStyle.Secondary, '🪙')));
  const chipRow2 = row(...CHIPS.slice(3).map(v => btn('g:bet:a:' + v, '+ ' + money(v), ButtonStyle.Secondary, '🪙')));
  return {
    embeds: [emb],
    components: [
      chipRow1, chipRow2,
      row(
        btn('g:bet:z', 'Remise à 0', ButtonStyle.Danger),
        btn('g:bet:m', 'Max', ButtonStyle.Primary),
        btn('g:bet:ok:' + back, 'Valider', ButtonStyle.Success, '✅'),
      ),
    ],
    attachments: [],
  };
}

/* ==========================================================
   Solde + identité partagés
   ========================================================== */
export function makeShared(db) {
  // discord_id (snowflake)  ->  { uid: uuid Supabase, pseudo, avatar }
  const cache = new Map();
  async function resolve(discordId) {
    if (cache.has(discordId)) return cache.get(discordId);
    let out = null;
    try {
      const { data } = await db.from('profiles')
        .select('user_id,pseudo,avatar_url').eq('discord_id', String(discordId)).maybeSingle();
      if (data) out = { uid: data.user_id, pseudo: data.pseudo, avatar: data.avatar_url };
    } catch (e) { console.warn('profiles resolve :', e.message); }
    cache.set(discordId, out);
    return out;
  }

  // tenue portée par le joueur (pour que le croupier dise les bonnes répliques)
  async function skinsOf(uid) {
    try {
      const { data } = await db.from('user_skins').select('worn').eq('user_id', uid).maybeSingle();
      const w = (data && data.worn) || {};
      return { men: Number(w.men) || 0, women: Number(w.women) || 0 };
    } catch (e) { return { men: 0, women: 0 }; }
  }

  async function balOf(uid) {
    try {
      const { data, error } = await db.from('wallet').select('credits').eq('user_id', uid).maybeSingle();
      if (error) throw error;
      if (data) return Number(data.credits);
      await db.from('wallet').upsert({ user_id: uid, credits: START, updated_at: new Date().toISOString() });
      return START;
    } catch (e) {
      console.warn('wallet.balOf :', e.message, '(table `wallet` créée ? supabase-setup.sql)');
      return START;
    }
  }
  async function setBal(uid, credits) {
    const c = Math.max(0, Math.round(credits));
    try { await db.from('wallet').upsert({ user_id: uid, credits: c, updated_at: new Date().toISOString() }); }
    catch (e) { console.warn('wallet.setBal :', e.message); }
    return c;
  }
  // prend une mise plafonnée au solde -> { bal, stake, recharged }
  async function take(uid, amount) {
    let bal = await balOf(uid);
    let recharged = false;
    if (bal <= 0) { bal = START; recharged = true; }
    const stake = Math.min(Math.max(1, Math.round(amount)), bal);
    bal = await setBal(uid, bal - stake);
    return { bal, stake, recharged };
  }
  async function give(uid, amount, knownBal) {
    const bal = (Number.isFinite(knownBal)) ? knownBal : await balOf(uid);
    return setBal(uid, bal + Math.max(0, Math.round(amount)));
  }

  // pousse une action dans le flux "en direct" (table activity) -> /feed, panneau du jeu
  async function feed(prof, entry) {
    if (!prof || !prof.uid) return;
    try {
      await db.from('activity').insert({
        user_id: prof.uid, pseudo: prof.pseudo || 'Joueur', avatar_url: prof.avatar || null,
        game: entry.game, detail: entry.detail || null,
        bet: entry.bet ?? null, gain: entry.gain ?? null, balance: entry.balance ?? null,
        tone: entry.gain > 0 ? 'win' : entry.gain < 0 ? 'lose' : 'push',
      });
    } catch (e) { /* pas grave */ }
  }

  async function skinsRow(uid) {
    try {
      const { data } = await db.from('user_skins').select('owned,worn').eq('user_id', uid).maybeSingle();
      return { owned: (data && data.owned) || {}, worn: (data && data.worn) || {} };
    } catch (e) { return { owned: {}, worn: {} }; }
  }
  async function skinsSave(uid, owned, worn) {
    try { await db.from('user_skins').upsert({ user_id: uid, owned, worn, updated_at: new Date().toISOString() }); }
    catch (e) { console.warn('skinsSave', e.message); }
  }

  return { resolve, skinsOf, skinsRow, skinsSave, balOf, setBal, take, give, feed };
}

/* ==========================================================
   Cartes
   ========================================================== */
const SUITS = ['♠', '♥', '♦', '♣'];
const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
function freshDeck() {
  const d = [];
  for (const s of SUITS) for (const r of RANKS) d.push({ r, s });
  for (let i = d.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [d[i], d[j]] = [d[j], d[i]]; }
  return d;
}
const cardStr = c => `${c.r}${c.s}`;
function bjValue(cards) {
  let v = 0, aces = 0;
  for (const c of cards) {
    if (c.r === 'A') { v += 11; aces++; }
    else if (['K', 'Q', 'J'].includes(c.r)) v += 10;
    else v += Number(c.r);
  }
  while (v > 21 && aces) { v -= 10; aces--; }
  return v;
}

/* --- croupier (seulement menu + BJ + poker) ---
   En jeu : d'abord l'embed du JEU, puis un embed avec le GIF du croupier, puis un
   embed texte (nom · tenue, à la ligne la réplique). Menu : petite vignette fixe. */
function croupierName(gender, skin = 0) {
  return (gender === 'women' ? 'La croupière' : 'Le croupier') + ' · ' + (SKIN_CAT[gender] || SKIN_CAT.men)[skin];
}
function croupierLineEmbed(gender, cat, skin = 0) {
  return new EmbedBuilder().setColor(PINK)
    .setDescription(`**${croupierName(gender, skin)}**\n« ${pickLine(gender, skin, cat) || '…'} »`);
}

/* MENU seulement : petite vignette fixe du croupier sur l'embed du menu.
   (En jeu, le croupier est dessiné DANS l'image de la table — voir render-table.js.)
   mode : 'attach' = attache la vignette · 'keep' = garde celle déjà là ·
          'clear'  = enlève le croupier. */
function withCroupier(payload, gender, skin, cat, mode, opts = {}) {
  if (mode === 'clear') return { ...payload, attachments: [] };
  const asset = croupierAsset(gender, skin, true);
  const embeds = [...(payload.embeds || [])];
  if (embeds[0] && typeof embeds[0].setThumbnail === 'function') {
    embeds[0].setThumbnail(asset ? asset.ref : 'attachment://croupier.webp');
  }
  const out = { ...payload, embeds };
  if (mode === 'attach' && asset) out.files = [...(payload.files || []), asset.file];
  return out;
}

/* ==========================================================
   Machines
   ========================================================== */
const MACHINES = [
  { id: 0, name: 'Classique', symbols: [
    { g: '🍒', w: 24, three: 5 }, { g: '🍋', w: 20, three: 8 }, { g: '🔔', w: 14, three: 12 },
    { g: '⭐', w: 9, three: 20 }, { g: '7️⃣', w: 5, three: 40 }, { g: '💎', w: 3, three: 100 }] },
  { id: 1, name: 'Néon', symbols: [
    { g: '⚡', w: 24, three: 5 }, { g: '🔷', w: 20, three: 8 }, { g: '🌙', w: 14, three: 12 },
    { g: '🛸', w: 9, three: 20 }, { g: '🎯', w: 5, three: 40 }, { g: '👾', w: 3, three: 120 }] },
  { id: 2, name: 'Deluxe', symbols: [
    { g: '🍀', w: 24, three: 5 }, { g: '🔔', w: 20, three: 8 }, { g: '⭐', w: 14, three: 14 },
    { g: '💰', w: 9, three: 25 }, { g: '💎', w: 5, three: 60 }, { g: '👑', w: 3, three: 150 }] },
];
function slotRoll(m) {
  const bag = m.symbols.flatMap(s => Array(s.w).fill(s));
  const pick = () => bag[Math.floor(Math.random() * bag.length)];
  return [pick(), pick(), pick()];
}
function slotAny(m) { return [0, 1, 2].map(() => m.symbols[Math.floor(Math.random() * m.symbols.length)]); }
function slotEval(m, reels) {
  const [a, b, c] = reels;
  const special = m.symbols[0];
  if (a === b && b === c) return { mult: a.three, label: `Jackpot ${a.g}${a.g}${a.g} !` };
  const n = reels.filter(x => x === special).length;
  if (n === 2) return { mult: 2, label: `Deux ${special.g}` };
  if (n === 1) return { mult: 1, label: `Un ${special.g} — mise rendue` };
  return { mult: 0, label: 'Pas de combinaison' };
}

/* ==========================================================
   Roulette
   ========================================================== */
const REDS = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
// ordre réel de la roue européenne (pour le "visuel" du voisinage)
const WHEEL = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];
const col = n => n === 0 ? '🟢' : REDS.has(n) ? '🔴' : '⚫';
const RL_BETS = {
  red: { label: 'Rouge', pays: 1, hit: n => n !== 0 && REDS.has(n) },
  black: { label: 'Noir', pays: 1, hit: n => n !== 0 && !REDS.has(n) },
  even: { label: 'Pair', pays: 1, hit: n => n !== 0 && n % 2 === 0 },
  odd: { label: 'Impair', pays: 1, hit: n => n % 2 === 1 },
  low: { label: '1–18', pays: 1, hit: n => n >= 1 && n <= 18 },
  high: { label: '19–36', pays: 1, hit: n => n >= 19 },
  d1: { label: '1re douz.', pays: 2, hit: n => n >= 1 && n <= 12 },
  d2: { label: '2e douz.', pays: 2, hit: n => n >= 13 && n <= 24 },
  d3: { label: '3e douz.', pays: 2, hit: n => n >= 25 },
};
function wheelView(n) {
  const i = WHEEL.indexOf(n);
  const near = k => WHEEL[(i + k + 37) % 37];
  return `${col(near(-2))}${near(-2)}  ${col(near(-1))}${near(-1)}  ▸ **${col(n)} ${n}** ◂  ${col(near(1))}${near(1)}  ${col(near(2))}${near(2)}`;
}

/* ==========================================================
   Vidéo Poker
   ========================================================== */
const PK_MULT = { royal: 250, sflush: 50, four: 25, full: 9, flush: 6, straight: 4, three: 3, twopair: 2, jacks: 1 };
const PK_NAME = { royal: 'Quinte flush royale', sflush: 'Quinte flush', four: 'Carré', full: 'Full', flush: 'Couleur', straight: 'Quinte', three: 'Brelan', twopair: 'Deux paires', jacks: 'Valets ou mieux' };
const RVAL = { '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10, J: 11, Q: 12, K: 13, A: 14 };
function pokerEval(hand) {
  const vals = hand.map(c => RVAL[c.r]).sort((a, b) => a - b);
  const suits = hand.map(c => c.s);
  const counts = {}; vals.forEach(v => counts[v] = (counts[v] || 0) + 1);
  const groups = Object.entries(counts).map(([v, n]) => [Number(v), n]).sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  const isFlush = suits.every(s => s === suits[0]);
  const uniq = [...new Set(vals)];
  let isStraight = uniq.length === 5 && uniq[4] - uniq[0] === 4;
  if (!isStraight && JSON.stringify(uniq) === JSON.stringify([2, 3, 4, 5, 14])) isStraight = true;
  if (isFlush && isStraight && vals[0] === 10) return 'royal';
  if (isFlush && isStraight) return 'sflush';
  if (groups[0][1] === 4) return 'four';
  if (groups[0][1] === 3 && groups[1][1] === 2) return 'full';
  if (isFlush) return 'flush';
  if (isStraight) return 'straight';
  if (groups[0][1] === 3) return 'three';
  if (groups[0][1] === 2 && groups[1][1] === 2) return 'twopair';
  if (groups[0][1] === 2 && groups[0][0] >= 11) return 'jacks';
  return null;
}

/* ==========================================================
   Sessions + rendu
   ========================================================== */
const sessions = new Map();   // discordId -> session

/* Ferme la session d'un joueur (embed /jouer supprimé pour inactivité).
   Si une MANCHE est en cours (blackjack en jeu / poker au tirage), la mise a
   déjà été prélevée : on en rend 75 % pour ne pas laisser fuir une mauvaise main. */
export async function closeIdleSession(discordId, shared) {
  const s = sessions.get(discordId);
  if (!s) return null;
  sessions.delete(discordId);
  const midGame = (s.game === 'bj' && s.phase === 'play') || (s.game === 'poker' && s.phase === 'draw');
  let refund = 0;
  if (midGame && s.stake > 0 && shared) {
    refund = Math.floor(s.stake * 0.75);
    if (refund > 0) {
      try { const bal = await shared.balOf(s.uid); await shared.setBal(s.uid, bal + refund); }
      catch (e) { refund = 0; }
    }
  }
  return { midGame, refund, stake: s.stake || 0, uid: s.uid };
}

function row(...b) { return new ActionRowBuilder().addComponents(...b); }
function btn(id, label, style = ButtonStyle.Secondary, emoji) {
  const b = new ButtonBuilder().setCustomId(id).setLabel(String(label).slice(0, 78)).setStyle(style);
  if (emoji) { try { b.setEmoji(emoji); } catch (e) {} }
  return b;
}
const DEFAULT_BET = 50;
const clampBet = (v, bal) => Math.max(1, Math.min(Math.round(v), Math.max(1, bal | 0)));
const betBtn = (game, s) => btn('g:' + game + ':bet', 'Mise : ' + money(s.stake), ButtonStyle.Secondary, '🪙');
const menuBtn = () => btn('g:menu', 'Menu', ButtonStyle.Secondary);

/* --- MENU --- */
export function menuPayload(bal, linked, skin = 0, mode = 'attach') {
  const emb = new EmbedBuilder().setColor(GOLD)
    .setAuthor({ name: 'EveLatro! — Casino' })
    .setTitle('🎰 Choisis un jeu')
    .setDescription(linked
      ? `Ton solde : **${money(bal)}** (le même que dans l'app).`
      : `⚠️ Ton compte Discord n'est pas encore lié au jeu.\nOuvre EveLatro, connecte-toi à Discord (bouton en bas à droite), et reviens.`)
    .setFooter({ text: 'Argent fictif · 200 offerts, recharge auto à 0' });
  const c = [
    row(
      btn('g:new:bj', 'Blackjack', ButtonStyle.Success, '🎴'),
      btn('g:new:slots', 'Machines', ButtonStyle.Primary, '🎰'),
      btn('g:new:rl', 'Roulette', ButtonStyle.Primary, '🎡'),
      btn('g:new:poker', 'Poker', ButtonStyle.Primary, '🃏'),
    ),
    row(
      btn('g:new:cases', 'Caisses', ButtonStyle.Danger, '📦'),
      btn('g:new:skins', 'Vestiaire', ButtonStyle.Secondary, '👔'),
      btn('g:bal', 'Rafraîchir', ButtonStyle.Secondary, '🔄'),
    ),
  ];
  const base = { embeds: [emb], components: linked ? c : [c[1]] };
  // le croupier reste visible sur le menu (Eve aime bien) — mais IMMOBILE (image fixe)
  return linked ? withCroupier(base, 'men', skin, null, mode, { still: true }) : base;
}

/* --- VESTIAIRE (acheter / porter les tenues des croupiers) --- */
export async function skinsPayload(prof, shared) {
  const bal = await shared.balOf(prof.uid);
  const row0 = await shared.skinsRow(prof.uid);
  const ownedSet = g => new Set([0, ...((row0.owned[g] || []).filter(n => Number.isInteger(n) && n > 0 && n < 5))]);
  const worn = g => { const w = Number(row0.worn[g]); return Number.isInteger(w) && w >= 0 && w < 5 ? w : 0; };

  const block = g => {
    const own = ownedSet(g), w = worn(g);
    return SKIN_CAT[g].map((name, i) => {
      const state = i === w ? '✅ portée' : own.has(i) ? 'possédée' : `🔒 ${money(SKIN_PRICE[i])}`;
      return `\`${i + 1}.\` **${name}** — ${state}`;
    }).join('\n');
  };

  const emb = new EmbedBuilder().setColor(GOLD).setTitle('👔 Vestiaire des croupiers')
    .setDescription(`Ton solde : **${money(bal)}**\n\n**Croupier (Blackjack)**\n${block('men')}\n\n**Croupière (Poker)**\n${block('women')}`)
    .setFooter({ text: 'Clique un numéro : porter si possédée, sinon acheter.' });

  const btnsFor = g => {
    const own = ownedSet(g), w = worn(g);
    return SKIN_CAT[g].map((_, i) => btn('g:skin:' + g + ':' + i, String(i + 1),
      i === w ? ButtonStyle.Success : own.has(i) ? ButtonStyle.Secondary : ButtonStyle.Danger));
  };
  return {
    embeds: [emb],
    components: [
      row(...btnsFor('men')),
      row(...btnsFor('women')),
      row(btn('g:menu', '◀ Menu', ButtonStyle.Secondary)),
    ],
  };
}

/* --- BLACKJACK --- */
function bjEmbed(s) {
  if (s.phase === 'bet') {
    return new EmbedBuilder().setColor(GREEN).setTitle('🎴 Blackjack')
      .setDescription(`Choisis ta mise puis **Distribuer**.\nMise : **${money(s.stake)}**  ·  solde : **${money(s.bal)}**`);
  }
  const pv = bjValue(s.player), dv = bjValue(s.dealer);
  const dealerShown = s.phase === 'done' ? s.dealer : [s.dealer[0], { r: '🂠', s: '' }];
  const bigCards = arr => '## ' + arr.map(cardStr).join(' ');
  return new EmbedBuilder()
    .setColor(s.phase === 'done' ? (s.result === 'win' ? GREEN : s.result === 'push' ? INK : RED) : GREEN)
    .setTitle('🎴  B L A C K J A C K')
    .addFields(
      { name: `🧑  Toi — ${pv}${pv > 21 ? '  💥' : ''}`, value: bigCards(s.player), inline: false },
      { name: `🎩  Croupier — ${s.phase === 'done' ? dv : '?'}`, value: bigCards(dealerShown), inline: false },
    )
    .setDescription(s.phase === 'done'
      ? (s.result === 'win' ? `## ✅ Gagné !  +${money(s.payout - s.stake)}`
        : s.result === 'push' ? `### 🤝 Égalité — mise rendue` : `## ❌ Perdu.  −${money(s.stake)}`)
      : `Mise : **${money(s.stake)}**`)
    .setFooter({ text: 'Solde : ' + money(s.bal) });
}
async function bjPayload(s, mode = 'keep') {
  const skin = (s.skins && s.skins.men) || 0;
  const player = s.player || [], dealer = s.dealer || [];
  const pv = bjValue(player), dv = bjValue(dealer);
  let comps, cat = 'launch';
  if (s.phase === 'bet') {
    comps = [row(btn('g:bj:deal', 'Distribuer', ButtonStyle.Success), betBtn('bj', s), menuBtn())];
  } else if (s.phase === 'done') {
    cat = s.result === 'win' ? 'win' : s.result === 'push' ? 'play' : 'lose';
    comps = [row(btn('g:bj:again', 'Rejouer', ButtonStyle.Success), menuBtn())];
  } else {
    cat = 'play';
    comps = [row(
      btn('g:bj:hit', 'Tirer', ButtonStyle.Primary),
      btn('g:bj:stand', 'Rester', ButtonStyle.Secondary),
      ...(s.player.length === 2 && s.bal >= s.stake ? [btn('g:bj:double', 'Doubler', ButtonStyle.Danger)] : []),
    )];
  }
  const delta = s.result === 'win' ? (s.payout - s.stake) : s.result === 'lose' ? s.stake : 0;
  const img = await renderBlackjack({
    player, dealer, pv, dv, phase: s.phase,
    mise: s.stake, solde: s.bal, result: s.result, delta,
    croupier: { gender: 'men', skin },
  });
  const emb = new EmbedBuilder()
    .setColor(s.phase === 'done' ? (s.result === 'win' ? GREEN : s.result === 'push' ? INK : RED) : GREEN)
    .setImage('attachment://bj.png');
  // UNE seule image (table + croupier) -> un seul embed image, pas de pièce jointe
  // séparée qui clignote. + un embed texte pour la réplique.
  return {
    embeds: [emb, croupierLineEmbed('men', cat, skin)],
    components: comps,
    files: [new AttachmentBuilder(img, { name: 'bj.png' })],
  };
}
async function bjDeal(s, shared) {
  const t = await shared.take(s.uid, s.stake);
  s.bal = t.bal; s.stake = t.stake;
  s.deck = freshDeck();
  s.player = [s.deck.pop(), s.deck.pop()];
  s.dealer = [s.deck.pop(), s.deck.pop()];
  s.phase = 'play'; s.result = null; s.payout = 0;
  if (bjValue(s.player) === 21) await bjFinish(s, shared);
}
async function bjFinish(s, shared) {
  while (bjValue(s.dealer) < 17) s.dealer.push(s.deck.pop());
  const pv = bjValue(s.player), dv = bjValue(s.dealer);
  const pNat = s.player.length === 2 && pv === 21;
  s.phase = 'done';
  if (pv > 21) s.result = 'lose';
  else if (pNat && !(s.dealer.length === 2 && dv === 21)) { s.result = 'win'; s.payout = Math.round(s.stake * 2.5); }
  else if (dv > 21 || pv > dv) { s.result = 'win'; s.payout = s.stake * 2; }
  else if (pv === dv) { s.result = 'push'; s.payout = s.stake; }
  else s.result = 'lose';
  if (s.payout > 0) s.bal = await shared.give(s.uid, s.payout, s.bal);
  shared.feed(s.prof, { game: 'Blackjack', detail: `${pv} contre ${dv}`, bet: s.stake, gain: (s.payout || 0) - s.stake, balance: s.bal });
}

/* --- MACHINES --- */
function slotEmbed(s, reelsOverride) {
  const m = MACHINES[s.machine];
  const reels = reelsOverride || s.reels;
  const strip = reels ? reels.map(x => x.g).join('  ▏  ') : `${m.symbols[0].g}  ▏  ${m.symbols[2].g}  ▏  ${m.symbols[4].g}`;
  return new EmbedBuilder()
    .setColor(s.spun && !reelsOverride ? (s.mult > 1 ? GREEN : s.mult === 1 ? INK : RED) : PINK)
    .setTitle('🎰 Machine ' + m.name)
    .setDescription(`\`\`\`\n     ${strip}     \n\`\`\`\n` + (
      reelsOverride ? '_ça tourne…_'
        : s.spun ? (s.mult > 0 ? `**${s.label}** — ×${s.mult} → **+${money(s.gain)}**` : `**${s.label}.** −${money(s.stake)}`)
          : `Mise : **${money(s.stake)}**  ·  solde : **${money(s.bal)}**`))
    .setFooter({ text: m.symbols.map(x => `${x.g}×3=${x.three}`).join('  ') });
}
function slotPayload(s) {
  return { attachments: [], embeds: [slotEmbed(s)], components: [
    row(...MACHINES.map(mm => btn('g:slots:m:' + mm.id, mm.name, mm.id === s.machine ? ButtonStyle.Primary : ButtonStyle.Secondary))),
    row(btn('g:slots:spin', 'Lancer', ButtonStyle.Success, '🎰'), betBtn('g:slots', s), menuBtn()),
  ] };
}

/* --- ROULETTE --- */
function rlEmbed(s) {
  const b = RL_BETS[s.pick];
  const betTxt = s.pick === 'num' ? `Numéro plein **${s.pickN}** (paie 35:1)` : `**${b.label}** (paie ${b.pays}:1)`;
  return new EmbedBuilder().setColor(s.spun ? (s.won ? GREEN : RED) : PINK)
    .setTitle('🎡 Roulette')
    .setDescription(s.spun
      ? `${wheelView(s.n)}\n\n${s.won ? `**Gagné !** +${money(s.gain)}` : `**Perdu.** −${money(s.stake)}`}\nTa mise : ${betTxt}`
      : `Mise : **${money(s.stake)}** sur ${betTxt}\nSolde : **${money(s.bal)}**`)
    .setFooter({ text: 'Roulette européenne (un seul zéro)' });
}
function rlPayload(s) {
  const e = [rlEmbed(s)];
  if (s.numMode) {
    // sélecteur de numéro plein, en pages de 25
    const page = s.numPage || 0;
    const from = page === 0 ? 0 : 25;
    const to = page === 0 ? 24 : 36;
    const rows = [];
    let cur = [];
    for (let n = from; n <= to; n++) {
      cur.push(btn('g:rl:n:' + n, String(n), n === 0 ? ButtonStyle.Success : REDS.has(n) ? ButtonStyle.Danger : ButtonStyle.Secondary));
      if (cur.length === 5) { rows.push(row(...cur)); cur = []; }
    }
    if (cur.length) rows.push(row(...cur));
    rows.push(row(
      page === 0 ? btn('g:rl:np:1', '25–36 ▸', ButtonStyle.Primary) : btn('g:rl:np:0', '◂ 0–24', ButtonStyle.Primary),
      btn('g:rl:nx', 'Retour aux mises', ButtonStyle.Secondary),
    ));
    return { attachments: [], embeds: e, components: rows.slice(0, 5) };
  }
  const bb = k => btn('g:rl:p:' + k, RL_BETS[k].label, s.pick === k ? ButtonStyle.Primary : ButtonStyle.Secondary);
  return { attachments: [], embeds: e, components: [
    row(bb('red'), bb('black'), bb('even'), bb('odd')),
    row(bb('low'), bb('high'), bb('d1'), bb('d2')),
    row(bb('d3'), btn('g:rl:num', '🎯 Numéro plein', s.pick === 'num' ? ButtonStyle.Primary : ButtonStyle.Secondary)),
    row(btn('g:rl:spin', 'Lancer la bille', ButtonStyle.Success, '🎡'), betBtn('g:rl', s), menuBtn()),
  ] };
}

/* --- POKER (même D.A. que le blackjack : table dessinée) --- */
async function pkPayload(s, mode = 'keep') {
  const skin = (s.skins && s.skins.women) || 0;
  const hand = s.hand || [], held = s.held || [];
  const cat = s.phase === 'idle' ? 'launch' : s.phase === 'done' ? (s.cat ? 'win' : 'lose') : 'play';
  let comps;
  if (s.phase === 'idle' || s.phase === 'done') {
    comps = [row(btn('g:poker:deal', s.phase === 'done' ? 'Rejouer' : 'Distribuer', ButtonStyle.Success), betBtn('poker', s), menuBtn())];
  } else {
    comps = [
      row(...hand.map((c, i) => btn('g:poker:h:' + i, cardStr(c), held[i] ? ButtonStyle.Primary : ButtonStyle.Secondary))),
      row(btn('g:poker:draw', 'Tirer', ButtonStyle.Success), menuBtn()),
    ];
  }
  const img = await renderPoker({
    hand, held, phase: s.phase || 'idle',
    mise: s.stake, solde: s.bal,
    cat: s.cat, mult: s.cat ? PK_MULT[s.cat] : 0, gain: s.gain || 0,
    croupier: { gender: 'women', skin },
  });
  const emb = new EmbedBuilder()
    .setColor(s.phase === 'done' ? (s.cat ? GREEN : RED) : GOLD)
    .setImage('attachment://poker.png');
  return {
    embeds: [emb, croupierLineEmbed('women', cat, skin)],
    components: comps,
    files: [new AttachmentBuilder(img, { name: 'poker.png' })],
  };
}

/* --- CAISSES --- */
function caseListPayload(s) {
  const emb = new EmbedBuilder().setColor(PINK).setTitle('📦 Caisses EveLatro')
    .setDescription('Choisis une caisse (page ' + ((s.casePage || 0) + 1) + '/2). Au drop : **Vendre** pour les crédits.\n' +
      CS.crates.map(c => `• **${c.name.replace('Caisse ', '')}** — ${money(c.price)}`).join('\n'))
    .setFooter({ text: 'Solde : ' + money(s.bal) });
  const page = s.casePage || 0;
  const slice = CS.crates.slice(page * 8, page * 8 + 8);
  const rows = [];
  let cur = [];
  for (const c of slice) {
    cur.push(btn('g:case:o:' + c.id, c.name.replace('Caisse ', '').slice(0, 20), ButtonStyle.Danger));
    if (cur.length === 4) { rows.push(row(...cur)); cur = []; }
  }
  if (cur.length) rows.push(row(...cur));
  rows.push(row(
    btn('g:case:pg:' + (page === 0 ? 1 : 0), page === 0 ? 'Page 2 ▸' : '◂ Page 1', ButtonStyle.Primary),
    menuBtn(),
  ));
  return { attachments: [], embeds: [emb], components: rows.slice(0, 5) };
}
function caseDropPayload(s) {
  const d = s.drop;
  const emb = new EmbedBuilder()
    .setColor({ bleu: BLUE, violet: 0x8847ff, rose: 0xd32ce6, rouge: RED, or: GOLD }[d.rarity])
    .setTitle('📦 ' + s.caseName.replace('Caisse ', ''))
    .setDescription(`**${d.stat ? 'StatTrak™ ' : ''}${d.weapon} | ${d.name}**\n${d.rarityName} · ${d.wearName} (${d.wear})\n\n💰 Valeur : **${money(d.price)}**`)
    .setFooter({ text: 'Solde : ' + money(s.bal) + '  ·  caisse : ' + money(s.cost) });
  return { attachments: [], embeds: [emb], components: [row(
    btn('g:case:sell', 'Vendre ' + money(d.price), ButtonStyle.Success),
    btn('g:case:again', 'Rouvrir (' + money(s.cost) + ')', ButtonStyle.Primary),
    menuBtn(),
  )] };
}
function casePayload(s) { return s.drop ? caseDropPayload(s) : caseListPayload(s); }

async function gamePayload(s, mode = 'keep') {
  if (s.game === 'poker') return pkPayload(s, mode);
  if (s.game === 'slots') return slotPayload(s);
  if (s.game === 'rl') return rlPayload(s);
  return bjPayload(s, mode);
}

/* ==========================================================
   Routeur
   ========================================================== */
export async function handleButton(interaction, shared) {
  const id = interaction.customId;
  if (!id.startsWith('g:')) return false;
  const discordId = interaction.user.id;
  const [, domain, action, arg] = id.split(':');

  // seul celui qui a fait /jouer peut cliquer sur SES boutons
  const invoker = interaction.message?.interactionMetadata?.user?.id
    || interaction.message?.interaction?.user?.id;
  if (invoker && invoker !== discordId) {
    return interaction.reply({ ephemeral: true, content: 'Ce n\'est pas ta partie 🙃 Lance `/jouer` pour la tienne.' });
  }

  const prof = await shared.resolve(discordId);
  if (!prof && domain !== 'menu') {
    return interaction.reply({ ephemeral: true, content: 'Ton compte Discord n\'est pas lié au jeu. Ouvre EveLatro → connexion Discord (bouton en bas à droite), puis reviens.' });
  }
  const wornMen = prof ? (await shared.skinsOf(prof.uid)).men : 0;

  if (domain === 'menu') {
    sessions.delete(discordId);
    const bal = prof ? await shared.balOf(prof.uid) : 0;
    // 'attach' : on repasse à l'image FIXE (le retour de partie avait le GIF animé)
    return interaction.update(menuPayload(bal, !!prof, wornMen, 'attach'));
  }
  if (domain === 'bal') {
    return interaction.update(menuPayload(await shared.balOf(prof.uid), true, wornMen, 'attach'));
  }

  /* ---- panneau de mise ---- */
  if (domain === 'bet') {
    const s0 = sessions.get(discordId);
    if (!s0) return interaction.deferUpdate();
    if (action === 'a') s0.stake = clampBet(s0.stake + Number(arg), s0.bal);
    else if (action === 'z') s0.stake = 1;
    else if (action === 'm') s0.stake = Math.max(1, s0.bal | 0);
    else if (action === 'ok') {
      s0.stake = clampBet(s0.stake, s0.bal);
      return interaction.update(await gamePayload(s0, 'attach'));
    }
    return interaction.update(betPanelPayload(s0, s0.game));
  }

  if (domain === 'new') {
    if (action === 'skins') { sessions.delete(discordId); return interaction.update(await skinsPayload(prof, shared)); }
    const bal = await shared.balOf(prof.uid);
    const s = { game: action, ownerId: discordId, uid: prof.uid, prof, stake: DEFAULT_BET, bal, skins: await shared.skinsOf(prof.uid) };
    sessions.set(discordId, s);
    if (action === 'bj') { s.phase = 'bet'; return interaction.update(await bjPayload(s, 'attach')); }
    if (action === 'slots') { s.machine = 0; s.spun = false; return interaction.update(slotPayload(s)); }
    if (action === 'rl') { s.pick = 'red'; s.spun = false; return interaction.update(rlPayload(s)); }
    if (action === 'poker') { s.phase = 'idle'; return interaction.update(await pkPayload(s, 'attach')); }
    if (action === 'cases') { s.drop = null; s.casePage = 0; return interaction.update(casePayload(s)); }
  }

  /* ---- Vestiaire : porter / acheter une tenue ---- */
  if (domain === 'skin') {
    const gender = action === 'women' ? 'women' : 'men';
    const idx = Math.max(0, Math.min(4, Number(arg) | 0));
    const r = await shared.skinsRow(prof.uid);
    const own = new Set([0, ...((r.owned[gender] || []).filter(n => Number.isInteger(n) && n > 0 && n < 5))]);
    if (!own.has(idx)) {
      const price = SKIN_PRICE[idx];
      const bal = await shared.balOf(prof.uid);
      if (bal < price) return interaction.reply({ ephemeral: true, content: `Pas assez pour « ${SKIN_CAT[gender][idx]} » — il te manque ${money(price - bal)}.` });
      await shared.setBal(prof.uid, bal - price);
      own.add(idx);
    }
    r.owned = { ...r.owned, [gender]: [...own].sort((a, b) => a - b) };
    r.worn = { ...r.worn, [gender]: idx };
    await shared.skinsSave(prof.uid, r.owned, r.worn);
    shared.feed(prof, { game: 'Vestiaire', detail: 'Porte « ' + SKIN_CAT[gender][idx] + ' »', gain: 0 });
    return interaction.update(await skinsPayload(prof, shared));
  }

  const s = sessions.get(discordId);
  if (!s || s.ownerId !== discordId) {
    return interaction.reply({ ephemeral: true, content: 'Lance `/jouer` pour ta propre partie.' });
  }
  s.prof = prof; s.uid = prof.uid;

  /* ---- Blackjack ---- */
  if (domain === 'bj') {
    // le GIF du croupier déjà attaché au message : on le garde tel quel (pas de re-upload)
    if (action === 'bet') { return interaction.update(betPanelPayload(s, 'bj')); }
    if (action === 'deal' || action === 'again') { s.stake = clampBet(s.stake, s.bal); await bjDeal(s, shared); return interaction.update(await bjPayload(s)); }
    if (s.phase === 'done' || s.phase === 'bet') return interaction.deferUpdate();
    if (action === 'hit') { s.player.push(s.deck.pop()); if (bjValue(s.player) > 21) await bjFinish(s, shared); return interaction.update(await bjPayload(s)); }
    if (action === 'stand') { await bjFinish(s, shared); return interaction.update(await bjPayload(s)); }
    if (action === 'double') {
      const t = await shared.take(s.uid, s.stake); s.stake += t.stake; s.bal = t.bal;
      s.player.push(s.deck.pop());
      if (bjValue(s.player) <= 21) await bjFinish(s, shared);
      else { s.phase = 'done'; s.result = 'lose'; shared.feed(s.prof, { game: 'Blackjack', detail: 'Doublé raté', bet: s.stake, gain: -s.stake, balance: s.bal }); }
      return interaction.update(await bjPayload(s));
    }
  }

  /* ---- Machines (avec mini-animation) ---- */
  if (domain === 'slots') {
    if (action === 'm') { s.machine = Number(arg); s.spun = false; return interaction.update(slotPayload(s)); }
    if (action === 'bet') { return interaction.update(betPanelPayload(s, 'slots')); }
    if (action === 'spin') {
      const m = MACHINES[s.machine];
      const t = await shared.take(s.uid, s.stake); s.bal = t.bal; s.stake = t.stake;
      s.reels = slotRoll(m);
      const ev = slotEval(m, s.reels);
      s.mult = ev.mult; s.label = ev.label; s.gain = s.stake * ev.mult;
      if (s.gain > 0) s.bal = await shared.give(s.uid, s.gain, s.bal);
      s.spun = true;
      shared.feed(s.prof, { game: 'Machine ' + m.name, detail: ev.label, bet: s.stake, gain: s.gain - s.stake, balance: s.bal });
      // animation : 2 images "qui tournent" puis le résultat
      await interaction.update({ embeds: [slotEmbed(s, slotAny(m))], components: slotPayload(s).components });
      await new Promise(r => setTimeout(r, 550));
      await interaction.editReply({ embeds: [slotEmbed(s, slotAny(m))], components: slotPayload(s).components });
      await new Promise(r => setTimeout(r, 550));
      return interaction.editReply(slotPayload(s));
    }
  }

  /* ---- Roulette ---- */
  if (domain === 'rl') {
    if (action === 'p') { s.pick = arg; s.numMode = false; s.spun = false; return interaction.update(rlPayload(s)); }
    if (action === 'num') { s.numMode = true; s.numPage = 0; return interaction.update(rlPayload(s)); }
    if (action === 'np') { s.numPage = Number(arg); return interaction.update(rlPayload(s)); }
    if (action === 'nx') { s.numMode = false; return interaction.update(rlPayload(s)); }
    if (action === 'n') { s.pick = 'num'; s.pickN = Number(arg); s.numMode = false; s.spun = false; return interaction.update(rlPayload(s)); }
    if (action === 'bet') { return interaction.update(betPanelPayload(s, 'rl')); }
    if (action === 'spin') {
      const t = await shared.take(s.uid, s.stake); s.bal = t.bal; s.stake = t.stake;
      s.n = Math.floor(Math.random() * 37);
      let pays, won;
      if (s.pick === 'num') { won = s.n === s.pickN; pays = 35; }
      else { const b = RL_BETS[s.pick]; won = b.hit(s.n); pays = b.pays; }
      s.won = won; s.gain = won ? s.stake * (pays + 1) : 0;
      if (s.gain > 0) s.bal = await shared.give(s.uid, s.gain, s.bal);
      s.spun = true;
      shared.feed(s.prof, { game: 'Roulette', detail: (s.pick === 'num' ? 'Plein ' + s.pickN : RL_BETS[s.pick].label) + ` → ${s.n}`, bet: s.stake, gain: s.gain - s.stake, balance: s.bal });
      await interaction.update({ embeds: [rlEmbed({ ...s, spun: false }).setDescription('🎡 _La bille tourne…_')], components: [] });
      await new Promise(r => setTimeout(r, 1200));
      return interaction.editReply(rlPayload(s));
    }
  }

  /* ---- Poker ---- */
  if (domain === 'poker') {
    if (action === 'bet') { return interaction.update(betPanelPayload(s, 'poker')); }
    if (action === 'deal') {
      const t = await shared.take(s.uid, s.stake); s.bal = t.bal; s.stake = t.stake;
      s.deck = freshDeck(); s.hand = [s.deck.pop(), s.deck.pop(), s.deck.pop(), s.deck.pop(), s.deck.pop()];
      s.held = [false, false, false, false, false]; s.phase = 'draw'; s.cat = null; s.gain = 0;
      return interaction.update(await pkPayload(s));
    }
    if (action === 'h' && s.phase === 'draw') { s.held[Number(arg)] = !s.held[Number(arg)]; return interaction.update(await pkPayload(s)); }
    if (action === 'draw' && s.phase === 'draw') {
      s.hand = s.hand.map((c, i) => (s.held[i] ? c : s.deck.pop()));
      s.cat = pokerEval(s.hand);
      s.gain = s.cat ? s.stake * (PK_MULT[s.cat] + 1) : 0;
      if (s.gain > 0) s.bal = await shared.give(s.uid, s.gain, s.bal);
      s.phase = 'done';
      shared.feed(s.prof, { game: 'Vidéo Poker', detail: s.cat ? PK_NAME[s.cat] : 'Rien', bet: s.stake, gain: s.gain - s.stake, balance: s.bal });
      return interaction.update(await pkPayload(s));
    }
  }

  /* ---- Caisses ---- */
  if (domain === 'case') {
    if (action === 'pg') { s.casePage = Number(arg); s.drop = null; return interaction.update(casePayload(s)); }
    if (action === 'o' || (action === 'again' && s.lastCase)) {
      const cid = action === 'again' ? s.lastCase : arg;
      const c = CS.crate(cid);
      const bal = await shared.balOf(s.uid);
      if (bal < c.price) return interaction.reply({ ephemeral: true, content: `Pas assez pour ${c.name} (${money(c.price)}).` });
      s.bal = await shared.setBal(s.uid, bal - c.price);
      s.cost = c.price; s.caseName = c.name; s.lastCase = cid;
      s.drop = CS.roll(cid);
      shared.feed(s.prof, { game: 'Caisses', detail: 'Ouvre ' + c.name, bet: c.price, gain: 0, balance: s.bal });
      return interaction.update(casePayload(s));
    }
    if (action === 'sell' && s.drop) {
      s.bal = await shared.give(s.uid, s.drop.price, s.bal);
      shared.feed(s.prof, { game: 'Caisses', detail: s.drop.weapon + ' | ' + s.drop.name, gain: s.drop.price, balance: s.bal });
      s.drop = null;
      return interaction.update(casePayload(s));
    }
  }

  return interaction.deferUpdate();
}
