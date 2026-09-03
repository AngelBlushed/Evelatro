/* ===========================================================
   Copie les images CS:GO (skins + caisses) dans cs/ et
   génère js/cs-images.js (la carte skin -> fichier).

       node scripts/cs-assets.cjs

   Source : "IMAGE CS GO/" (hors dépôt de jeu). On mappe le
   catalogue d'Eve (cs-catalog.js) aux vrais skins via
   IMAGE CS GO/_data/match-result.json.
   =========================================================== */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'IMAGE CS GO', 'assets');
const MATCH = path.join(ROOT, 'IMAGE CS GO', '_data', 'match-result.json');
const OUT = path.join(ROOT, 'cs');
const MAP_JS = path.join(ROOT, 'js', 'cs-images.js');

const { CS } = require(path.join(ROOT, 'js', 'cs-catalog.js'));
const mr = JSON.parse(fs.readFileSync(MATCH, 'utf8'));

// dossiers "01 - Chroma" ... triés -> un par caisse, dans l'ordre du catalogue
const folders = fs.readdirSync(SRC)
  .filter(d => /^\d\d - /.test(d) && fs.statSync(path.join(SRC, d)).isDirectory())
  .sort();

if (folders.length !== CS.crates.length) {
  console.warn(`(!) ${folders.length} dossiers image pour ${CS.crates.length} caisses`);
}

const fileFromMatched = m => m.replace(/^★\s*/, '').replace(' | ', ' - ') + '.png';

function rmrf(p) { try { fs.rmSync(p, { recursive: true, force: true }); } catch (e) {} }
rmrf(OUT);
fs.mkdirSync(OUT, { recursive: true });

const map = {};
let copied = 0, missing = 0;

CS.crates.forEach((crate, i) => {
  const folder = folders[i];
  if (!folder) { console.warn('  pas de dossier pour', crate.id); return; }
  const caseName = folder.replace(/^\d\d - /, '');
  const srcDir = path.join(SRC, folder);
  const dstDir = path.join(OUT, crate.id);
  fs.mkdirSync(dstDir, { recursive: true });

  const entry = { case: null, skins: [] };

  // image de la caisse
  const caseSrc = path.join(srcDir, '_caisse.png');
  if (fs.existsSync(caseSrc)) {
    fs.copyFileSync(caseSrc, path.join(dstDir, 'case.png'));
    entry.case = `cs/${crate.id}/case.png`;
    copied++;
  } else { console.warn('  caisse manquante :', folder); missing++; }

  // skins (index = position dans crate.skins)
  const rows = mr.filter(x => x.type === 'SKIN' && x.case === caseName);
  crate.skins.forEach((s, idx) => {
    const raw = s.weapon + ' | ' + s.name;
    const hit = rows.find(r => r.raw === raw);
    const num = String(idx).padStart(2, '0');
    if (!hit) { console.warn(`  [${crate.id}] pas de match pour "${raw}"`); missing++; entry.skins[idx] = null; return; }
    const fsrc = path.join(srcDir, fileFromMatched(hit.matched));
    if (!fs.existsSync(fsrc)) { console.warn(`  [${crate.id}] fichier absent : ${fileFromMatched(hit.matched)}`); missing++; entry.skins[idx] = null; return; }
    fs.copyFileSync(fsrc, path.join(dstDir, num + '.png'));
    entry.skins[idx] = `cs/${crate.id}/${num}.png`;
    copied++;
  });

  map[crate.id] = entry;
});

const banner = '/* GÉNÉRÉ par scripts/cs-assets.cjs — ne pas éditer à la main.\n'
  + '   Carte : caisse -> { case, skins[] } (chemins relatifs à index.html). */\n';
fs.writeFileSync(MAP_JS, banner + 'window.CS_IMAGES = ' + JSON.stringify(map, null, 1) + ';\n');

console.log(`\nOK — ${copied} images copiées dans cs/, ${missing} manquantes.`);
console.log('   -> js/cs-images.js écrit');
