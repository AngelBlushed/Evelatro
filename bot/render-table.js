/* Dessine la table (Blackjack / Vidéo Poker) en PNG : cartes, points, mise,
   solde, résultat ET le croupier dans la même image (zone de droite).
   100% composition d'images (sharp) : aucune police requise à l'exécution.
   Sources générées par scripts/gen-bj-assets.js -> bot/bj/  ·  croupiers -> bot/croupiers/  */

import sharp from 'sharp';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const BJ = join(HERE, 'bj');
const CRO = join(HERE, 'croupiers');
const L = JSON.parse(readFileSync(join(BJ, 'layout.json'), 'utf8'));
const SUIT_LETTER = { '♠': 'S', '♥': 'H', '♦': 'D', '♣': 'C' };

const cardFile = c =>
  (!c || c.r === '🂠' || !SUIT_LETTER[c.s])
    ? join(BJ, 'card-back.png')
    : join(BJ, `card-${c.r}${SUIT_LETTER[c.s]}.png`);

/* x de chaque carte pour n cartes, rangée calée à gauche (dans la zone table) */
function cardXs(n) {
  if (n <= 0) return [];
  const x0 = 40;
  const avail = L.tableW - x0 - 30;
  const step = n <= 1 ? 0 : Math.min(L.cardW + 14, (avail - L.cardW) / (n - 1));
  return Array.from({ length: n }, (_, i) => Math.round(x0 + i * step));
}

const frFR = n => Math.round(Number(n) || 0).toLocaleString('fr-FR').replace(/[  ]/g, ' ');

/* compose une suite de caractères (0-9 ? − + ×) depuis la bande de chiffres */
async function chars(str, x, y, gold, align = 'left') {
  const sheet = join(BJ, gold ? 'digits-gold.png' : 'digits-white.png');
  const map = { '?': 10, '−': 11, '-': 11, '+': 12, '×': 13, x: 13 };
  const { w, h, gap } = L.digit;
  const list = String(str).split('');
  const width = list.length * (w + gap) - gap;
  let sx = align === 'right' ? x - width : align === 'center' ? x - width / 2 : x;
  sx = Math.round(sx);
  const out = [];
  for (const ch of list) {
    if (ch === ' ') { sx += Math.round(w * 0.34); continue; }
    const ci = /[0-9]/.test(ch) ? Number(ch) : map[ch];
    if (ci != null) {
      out.push({
        input: await sharp(sheet).extract({ left: ci * w, top: 0, width: w, height: h }).toBuffer(),
        left: Math.max(0, sx), top: Math.max(0, Math.round(y)),
      });
    }
    sx += w + gap;
  }
  return out;
}

/* le croupier (image fixe) dans la zone de droite, calé en bas, centré */
async function croupierComposite(croupier, canvasH) {
  if (!croupier) return null;
  const g = croupier.gender === 'women' ? 'women' : 'men';
  const s = Math.max(0, Math.min(4, croupier.skin | 0));
  let file = join(CRO, `${g}-${s}.still.webp`);
  if (!existsSync(file)) file = join(CRO, `${g}-${s}.webp`);
  if (!existsSync(file)) return null;
  const zone = L.croupier;
  const maxW = zone.w - zone.pad * 2;
  const maxH = canvasH - zone.pad * 2;
  const buf = await sharp(file).resize({ width: maxW, height: maxH, fit: 'inside', withoutEnlargement: true }).toBuffer();
  const m = await sharp(buf).metadata();
  return {
    input: buf,
    left: Math.round(zone.x + (zone.w - m.width) / 2),
    top: Math.round(canvasH - zone.pad - m.height),
  };
}

export async function renderBlackjack(o) {
  const { player = [], dealer = [], pv, dv, phase, mise = 0, solde = 0, result, delta, croupier } = o;
  const c = [];

  const cro = await croupierComposite(croupier, L.H);
  if (cro) c.push(cro);

  const dShown = phase === 'done' ? dealer : dealer.map((card, i) => (i === 0 ? card : { r: '🂠', s: '' }));
  cardXs(dShown.length).forEach((x, i) => c.push({ input: cardFile(dShown[i]), left: x, top: L.dealer.cardsY }));
  cardXs(player.length).forEach((x, i) => c.push({ input: cardFile(player[i]), left: x, top: L.player.cardsY }));

  c.push(...await chars(phase === 'done' ? String(dv) : (dealer.length ? '?' : ''), L.dealer.valX, L.dealer.valY, false));
  c.push(...await chars(player.length ? String(pv) : '', L.player.valX, L.player.valY, false));

  const footTop = L.footer.y - L.digit.h + 12;
  c.push(...await chars(frFR(mise), L.footer.miseValX, footTop, true));
  c.push(...await chars(frFR(solde), L.footer.soldeValX, footTop, true));

  if (phase === 'done' && result) {
    const f = result === 'win' ? 'res-win.png' : result === 'push' ? 'res-push.png' : 'res-lose.png';
    const bx = Math.round((L.tableW - L.banner.w) / 2);
    c.push({ input: join(BJ, f), left: bx, top: L.banner.y });
    if (delta != null && result !== 'push') {
      const dy = L.banner.y + Math.round((L.banner.h - L.digit.h) / 2) + 2;
      c.push(...await chars((result === 'win' ? '+' : '−') + frFR(Math.abs(delta)), bx + L.banner.w + 12, dy, true, 'left'));
    }
  }

  return sharp(join(BJ, 'felt.png')).composite(c).png().toBuffer();
}

export async function renderPoker(o) {
  const { hand = [], held = [], phase, mise = 0, solde = 0, cat, mult = 0, gain = 0, croupier } = o;
  const P = L.poker;
  const c = [];

  const cro = await croupierComposite(croupier, P.H);
  if (cro) c.push(cro);

  const xs = cardXs(hand.length);
  hand.forEach((card, i) => {
    c.push({ input: cardFile(card), left: xs[i], top: P.cardsY });
    if (held[i]) c.push({ input: join(BJ, 'hold.png'), left: xs[i] + Math.round((L.cardW - 90) / 2), top: P.holdY });
  });

  const footTop = P.footer.y - L.digit.h + 12;
  c.push(...await chars(frFR(mise), P.footer.miseValX, footTop, true));
  c.push(...await chars(frFR(solde), P.footer.soldeValX, footTop, true));

  if (phase === 'done') {
    const f = cat ? `pk-${cat}.png` : 'pk-none.png';
    const m = await sharp(join(BJ, f)).metadata();
    c.push({ input: join(BJ, f), left: Math.round((L.tableW - m.width) / 2), top: P.comboY - 34 });
    if (cat) c.push(...await chars(`×${mult}  +${frFR(gain)}`, Math.round(L.tableW / 2), P.mulY, true, 'center'));
  }

  return sharp(join(BJ, 'felt-poker.png')).composite(c).png().toBuffer();
}
