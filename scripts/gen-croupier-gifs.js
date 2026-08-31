/* Génère les images fixes des croupiers pour le bot, à partir des .webp de `croupiers/`.
   Sortie : bot/croupiers/<gender>-<n>.still.webp  (petites, légères)
   Le bot les dessine DANS l'image de la table (blackjack / poker) et en vignette
   sur le menu — il n'y a plus de GIF animé (Discord ne sait pas garder une pièce
   jointe animée pendant qu'on met à jour les cartes -> ça clignotait).
       node scripts/gen-croupier-gifs.js
   Nécessite : sharp (déjà là).  */

const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'croupiers');
const OUT = path.join(ROOT, 'bot', 'croupiers');
fs.mkdirSync(OUT, { recursive: true });

const STILL_W = 300;   // largeur de l'image fixe (agrandie dans la table)

const files = fs.readdirSync(SRC).filter(f => /^(men|women)-\d\.webp$/.test(f));

// nettoie les anciens formats (webp source copiés à la main, gifs, anim.webp)
for (const f of fs.readdirSync(OUT)) {
  if (/^(men|women)-\d\.webp$/.test(f) || /\.(gif|anim\.webp)$/.test(f)) {
    fs.rmSync(path.join(OUT, f), { force: true });
  }
}

(async () => {
  for (const f of files) {
    const base = f.replace('.webp', '');
    await sharp(path.join(SRC, f))
      .resize({ width: STILL_W, withoutEnlargement: true })
      .webp({ quality: 84 })
      .toFile(path.join(OUT, base + '.still.webp'));
    const ks = (fs.statSync(path.join(OUT, base + '.still.webp')).size / 1024).toFixed(0);
    console.log(base + '.still.webp', ks + ' Ko');
  }
  console.log('OK — bot/croupiers/');
})().catch(e => { console.error(e); process.exit(1); });
