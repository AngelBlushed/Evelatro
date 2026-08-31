/* Copie le jeu (index.html + js + css + assets) dans site/play/,
   le dossier "jouer dans le navigateur" du site.
   Lancé par  npm run site:deploy .  */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DST = path.join(ROOT, 'site', 'play');

function rmrf(p) { fs.rmSync(p, { recursive: true, force: true }); }
function copy(src, dst) {
  const st = fs.statSync(src);
  if (st.isDirectory()) {
    fs.mkdirSync(dst, { recursive: true });
    for (const name of fs.readdirSync(src)) copy(path.join(src, name), path.join(dst, name));
  } else {
    fs.copyFileSync(src, dst);
  }
}

fs.mkdirSync(DST, { recursive: true });
for (const item of ['index.html', 'evelatro.png', 'croupiere.png', 'manifest.json', 'css', 'js', 'croupiers']) {
  const src = path.join(ROOT, item);
  if (!fs.existsSync(src)) continue;
  const dst = path.join(DST, item);
  if (fs.statSync(src).isDirectory()) rmrf(dst);
  copy(src, dst);
}
console.log('site/play/ synchronisé.');
