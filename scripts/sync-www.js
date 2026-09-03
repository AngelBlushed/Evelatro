/* Copie les fichiers web (index.html, css, js, icône) dans www/,
   le dossier que Capacitor empaquette dans l'APK.
   Lancer :  node scripts/sync-www.js   (ou  npm run www) */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const WWW = path.join(ROOT, 'www');

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

rmrf(WWW);
fs.mkdirSync(WWW);
for (const item of ['index.html', 'evelatro.png', 'croupiere.png', 'manifest.json',
  'fondcaisse.png', 'fondinventory.png', 'css', 'js', 'croupiers', 'cs']) {
  copy(path.join(ROOT, item), path.join(WWW, item));
}
console.log('www/ synchronisé.');
