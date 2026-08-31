/* Génère les images du Blackjack pour le bot (cartes dessinées, table, chiffres).
   Tout est rasterisé ICI (avec les polices de Windows) puis expédié en PNG :
   le bot n'a donc AUCUN besoin de police au moment de tourner (Railway).
       node scripts/gen-bj-assets.js
   Sortie : bot/bj/
   Nécessite : sharp (déjà là).  */

const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, '..', 'bot', 'bj');
fs.mkdirSync(OUT, { recursive: true });

const FONT = 'Arial, "Segoe UI Symbol", sans-serif';
const png = (svg, file) => sharp(Buffer.from(svg)).png().toFile(path.join(OUT, file));

/* ---- dimensions partagées (lues aussi par render-table.js via bj/layout.json) ---- */
const L = {
  W: 904, H: 600,           // W = zone table (600) + zone croupier (304)
  tableW: 600,
  croupier: { x: 604, w: 292, pad: 24 },
  cardW: 108, cardH: 156,
  dealer: { labelX: 34, labelY: 86, valX: 190, valY: 52, cardsY: 100 },
  player: { labelX: 34, labelY: 322, valX: 92, valY: 288, cardsY: 336 },
  footer: { y: 560, miseX: 34, miseValX: 150, soldeX: 330, soldeValX: 470 },
  banner: { y: 224, w: 300, h: 56 },
  divider: 286,
  digit: { w: 22, h: 44, gap: 0 },
  poker: {
    H: 540, titleY: 42, subY: 66,
    cardsY: 150, holdY: 120,
    comboY: 366, mulY: 400,
    footer: { y: 500, miseX: 34, miseValX: 150, soldeX: 330, soldeValX: 470 },
  },
};
fs.writeFileSync(path.join(OUT, 'layout.json'), JSON.stringify(L, null, 0));

const RED = '#c62828', BLACK = '#1b1b1b', CREAM = '#f7f3ea', GOLD = '#E2B458';
const SUIT = { S: '♠', H: '♥', D: '♦', C: '♣' };
const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

/* ---------- une carte ---------- */
function cardSVG(rank, suitLetter) {
  const s = SUIT[suitLetter];
  const col = (suitLetter === 'H' || suitLetter === 'D') ? RED : BLACK;
  const { cardW: w, cardH: h } = L;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
    <rect x="2" y="2" width="${w - 4}" height="${h - 4}" rx="12" fill="${CREAM}" stroke="#0000001a" stroke-width="2"/>
    <text x="12" y="34" font-family='${FONT}' font-size="26" font-weight="bold" fill="${col}">${rank}</text>
    <text x="13" y="60" font-family='${FONT}' font-size="24" fill="${col}">${s}</text>
    <text x="${w / 2}" y="${h / 2 + 26}" font-family='${FONT}' font-size="70" fill="${col}" text-anchor="middle">${s}</text>
  </svg>`;
}
function backSVG() {
  const { cardW: w, cardH: h } = L;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
    <rect x="2" y="2" width="${w - 4}" height="${h - 4}" rx="12" fill="#8f2d2d"/>
    <rect x="10" y="10" width="${w - 20}" height="${h - 20}" rx="8" fill="none" stroke="${GOLD}" stroke-width="3"/>
    <text x="${w / 2}" y="${h / 2 + 16}" font-family='${FONT}' font-size="44" fill="${GOLD}" text-anchor="middle" font-weight="bold">E</text>
  </svg>`;
}

/* ---------- fond commun (tapis + cadre + séparateur zone croupier) ---------- */
function feltBase(W, H, title, titleY = 42) {
  const tw = L.tableW;
  return `<defs><radialGradient id="g" cx="34%" cy="30%" r="90%">
      <stop offset="0%" stop-color="#15683f"/><stop offset="100%" stop-color="#0a3b24"/>
    </radialGradient></defs>
    <rect width="${W}" height="${H}" rx="22" fill="url(#g)"/>
    <rect x="6" y="6" width="${W - 12}" height="${H - 12}" rx="18" fill="none" stroke="${GOLD}" stroke-width="3"/>
    <line x1="${tw}" y1="20" x2="${tw}" y2="${H - 20}" stroke="#ffffff1f" stroke-width="2"/>
    <text x="${tw / 2}" y="${titleY}" font-family='${FONT}' font-size="30" font-weight="bold" fill="${GOLD}" text-anchor="middle" letter-spacing="6">${title}</text>`;
}

/* ---------- la table de BLACKJACK (fond + libellés fixes) ---------- */
function feltSVG() {
  const { W, H } = L, tw = L.tableW;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    ${feltBase(W, H, 'BLACKJACK')}
    <text x="${L.dealer.labelX}" y="${L.dealer.labelY}" font-family='${FONT}' font-size="22" font-weight="bold" fill="#ffffff" letter-spacing="1">CROUPIER</text>
    <line x1="34" y1="${L.divider}" x2="${tw - 34}" y2="${L.divider}" stroke="#ffffff26" stroke-width="2"/>
    <text x="${L.player.labelX}" y="${L.player.labelY}" font-family='${FONT}' font-size="22" font-weight="bold" fill="#ffffff" letter-spacing="1">TOI</text>
    <text x="${L.footer.miseX}" y="${L.footer.y}" font-family='${FONT}' font-size="20" font-weight="bold" fill="${GOLD}">MISE</text>
    <text x="${L.footer.soldeX}" y="${L.footer.y}" font-family='${FONT}' font-size="20" font-weight="bold" fill="${GOLD}">SOLDE</text>
  </svg>`;
}

/* ---------- table de POKER (même D.A. que le blackjack) ---------- */
function feltPokerSVG() {
  const { W } = L, H = L.poker.H, p = L.poker, tw = L.tableW;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    ${feltBase(W, H, 'VIDÉO POKER', p.titleY)}
    <text x="${tw / 2}" y="${p.subY}" font-family='${FONT}' font-size="15" fill="#ffffffb0" text-anchor="middle" letter-spacing="2">VALETS OU MIEUX</text>
    <line x1="34" y1="${p.comboY - 26}" x2="${tw - 34}" y2="${p.comboY - 26}" stroke="#ffffff26" stroke-width="2"/>
    <text x="${p.footer.miseX}" y="${p.footer.y}" font-family='${FONT}' font-size="20" font-weight="bold" fill="${GOLD}">MISE</text>
    <text x="${p.footer.soldeX}" y="${p.footer.y}" font-family='${FONT}' font-size="20" font-weight="bold" fill="${GOLD}">SOLDE</text>
  </svg>`;
}
function holdSVG() {
  const w = 90, h = 26;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
    <rect width="${w}" height="${h}" rx="13" fill="${GOLD}"/>
    <text x="${w / 2}" y="18" font-family='${FONT}' font-size="14" font-weight="bold" fill="#1b1b1b" text-anchor="middle" letter-spacing="1">GARDÉE</text>
  </svg>`;
}
function comboSVG(text, win) {
  const w = 420, h = 44;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
    <text x="${w / 2}" y="32" font-family='${FONT}' font-size="30" font-weight="bold" fill="${win ? '#34e2a8' : '#E5595F'}" text-anchor="middle" letter-spacing="2">${text.toUpperCase()}</text>
  </svg>`;
}

/* ---------- bandes de chiffres (0-9 puis ? / − + ×) ---------- */
function digitsSVG(color) {
  const chars = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '?', '−', '+', '×'];
  const { w, h } = L.digit;
  let cells = '';
  chars.forEach((c, i) => {
    cells += `<text x="${i * w + w / 2}" y="${h - 9}" font-family='${FONT}' font-size="34" font-weight="bold" fill="${color}" text-anchor="middle">${c}</text>`;
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${chars.length * w}" height="${h}">${cells}</svg>`;
}

/* ---------- bannières de résultat ---------- */
function bannerSVG(text, bg) {
  const { w, h } = L.banner;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
    <rect width="${w}" height="${h}" rx="14" fill="${bg}"/>
    <text x="${w / 2}" y="${h / 2 + 11}" font-family='${FONT}' font-size="30" font-weight="bold" fill="#fff" text-anchor="middle" letter-spacing="3">${text}</text>
  </svg>`;
}

(async () => {
  for (const r of RANKS) for (const suit of Object.keys(SUIT)) {
    await png(cardSVG(r, suit), `card-${r}${suit}.png`);
  }
  await png(backSVG(), 'card-back.png');
  await png(feltSVG(), 'felt.png');
  await png(digitsSVG('#ffffff'), 'digits-white.png');
  await png(digitsSVG(GOLD), 'digits-gold.png');
  await png(bannerSVG('GAGNÉ', '#1DB98A'), 'res-win.png');
  await png(bannerSVG('PERDU', '#E5595F'), 'res-lose.png');
  await png(bannerSVG('ÉGALITÉ', '#33404a'), 'res-push.png');

  // --- poker ---
  await png(feltPokerSVG(), 'felt-poker.png');
  await png(holdSVG(), 'hold.png');
  const PK_NAME = {
    royal: 'Quinte flush royale', sflush: 'Quinte flush', four: 'Carré', full: 'Full',
    flush: 'Couleur', straight: 'Quinte', three: 'Brelan', twopair: 'Deux paires', jacks: 'Valets ou mieux',
  };
  for (const [k, v] of Object.entries(PK_NAME)) await png(comboSVG(v, true), `pk-${k}.png`);
  await png(comboSVG('Rien', false), 'pk-none.png');

  const n = fs.readdirSync(OUT).length;
  console.log(`OK — ${n} fichiers dans bot/bj/`);
})().catch(e => { console.error(e); process.exit(1); });
