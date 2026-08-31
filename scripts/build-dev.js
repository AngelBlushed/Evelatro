/* ===========================================================
   Construit la version DEV : dev/EveLatro-DEV.exe
   (crédits infinis, hors classement — voir scripts/dev-mode.js).

     npm run build:dev

   Comment ça marche (et pourquoi le zip normal n'est JAMAIS touché) :
     1. on copie les fichiers du jeu dans une copie de travail  .dev-build/app/
     2. on y ajoute  js/dev.js  (= scripts/dev-mode.js) et on l'branche
        dans index.html, juste avant js/app.js
     3. electron-builder empaquette CETTE copie -> dev/EveLatro-DEV.exe
     4. la copie de travail est supprimée

   Le dossier js/ du projet n'est jamais modifié : `npm run build`
   continue de partir des sources propres. .dev-build/ et dev/ sont
   dans .gitignore et hors de la liste `build.files` de package.json.
   =========================================================== */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const STAGE = path.join(ROOT, '.dev-build');
const APP = path.join(STAGE, 'app');
const OUT = path.join(ROOT, 'dev');

// Fichiers du jeu à embarquer (mêmes que build.files de package.json).
const RUNTIME = [
  'main.js', 'preload.js', 'index.html', 'manifest.json',
  'evelatro.png', 'croupiere.png',
  'croupiers', 'css', 'js',
];

function rmrf(p) { fs.rmSync(p, { recursive: true, force: true }); }

console.log('· nettoyage');
rmrf(STAGE);
rmrf(OUT);
fs.mkdirSync(APP, { recursive: true });

console.log('· copie des sources du jeu');
for (const item of RUNTIME) {
  const from = path.join(ROOT, item);
  if (!fs.existsSync(from)) throw new Error('introuvable : ' + item);
  fs.cpSync(from, path.join(APP, item), { recursive: true });
}

// package.json minimal pour la copie de travail
const rootPkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
fs.writeFileSync(path.join(APP, 'package.json'), JSON.stringify({
  name: 'evelatro-dev',
  version: rootPkg.version,
  description: 'EveLatro! — version dev (crédits infinis, hors classement)',
  main: 'main.js',
  author: rootPkg.author || 'Eve',
}, null, 2));

console.log('· injection du mode dev');
fs.copyFileSync(path.join(__dirname, 'dev-mode.js'), path.join(APP, 'js', 'dev.js'));

const htmlPath = path.join(APP, 'index.html');
let html = fs.readFileSync(htmlPath, 'utf8');
const anchor = '<script src="js/app.js"></script>';
if (!html.includes(anchor)) throw new Error('index.html : ancre <script js/app.js> introuvable');
if (!html.includes('js/dev.js')) {
  html = html.replace(anchor, '<script src="js/dev.js"></script>\n  ' + anchor);
  fs.writeFileSync(htmlPath, html);
}

console.log('· electron-builder (portable)');
execSync('npx electron-builder --win portable --config electron-builder-dev.json', {
  cwd: ROOT,
  stdio: 'inherit',
});

console.log('· ménage');
if (!process.argv.includes('--keep')) rmrf(STAGE);
// dev/ ne garde que le .exe portable
rmrf(path.join(OUT, 'win-unpacked'));
rmrf(path.join(OUT, '.icon-ico'));
fs.rmSync(path.join(OUT, 'builder-debug.yml'), { force: true });

const exe = path.join(OUT, 'EveLatro-DEV.exe');
console.log(fs.existsSync(exe)
  ? '\nOK  ->  dev/EveLatro-DEV.exe'
  : '\n(!) dev/EveLatro-DEV.exe absent — voir les logs ci-dessus');
