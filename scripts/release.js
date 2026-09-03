/* ===========================================================
   RELEASE EN UNE COMMANDE  —  node scripts/release.js
   (ou  npm run release)

   Fait, dans l'ordre :
     1. build   : www + .exe (portable) + .zip + .apk
     2. github  : crée/maj la release GitHub v<version>, y met .exe et .apk
                  -> liens de téléchargement stables et directs
     3. liens   : écrit ces liens dans site/index.html
     4. site    : déploie le site sur Cloudflare Pages
     5. bot     : déploie le bot sur Railway

   Options :
     --skip=build,github,site,bot     (n'exécute pas ces étapes)
     --only=site                      (n'exécute QUE cette étape)
     --notes="texte de la release"

   Pré-requis (une seule fois — voir GUIDE-AUTOMATISATION.md) :
     - git + un dépôt GitHub (git remote origin)
     - gh   (GitHub CLI) connecté :  gh auth login
     - wrangler connecté :           npx wrangler login
     - railway connecté :            railway login
     - JAVA_HOME / ANDROID_HOME pour l'APK (sinon --skip inclut l'apk du build)
   =========================================================== */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const pkg = require(path.join(ROOT, 'package.json'));
const VERSION = pkg.version;
const TAG = 'v' + VERSION;

const args = process.argv.slice(2);
const getArg = (k, d) => { const a = args.find(x => x.startsWith('--' + k + '=')); return a ? a.slice(k.length + 3) : d; };
const skip = new Set((getArg('skip', '') || '').split(',').filter(Boolean));
const only = getArg('only', '');
const NOTES = getArg('notes', `EveLatro! ${VERSION}`);
const doStep = (name) => only ? only === name : !skip.has(name);

const sh = (cmd, opts = {}) => {
  console.log('\n$ ' + cmd);
  execSync(cmd, { cwd: ROOT, stdio: 'inherit', ...opts });
};
const shOut = (cmd) => execSync(cmd, { cwd: ROOT, encoding: 'utf8' }).trim();
const step = (n) => console.log('\n========== ' + n + ' ==========');

const DIST = path.join(ROOT, 'dist');
const EXE = path.join(DIST, 'EveLatro.exe');
const ZIP = path.join(DIST, `EveLatro-${VERSION}-windows.zip`);
const ZIP_PUB = path.join(DIST, 'EveLatro-Windows.zip');   // nom stable pour la release / le site
const APK_SRC = path.join(ROOT, 'android', 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk');
const APK = path.join(DIST, 'EveLatro.apk');

/* ---------- 1. BUILD ---------- */
if (doStep('build')) {
  step('BUILD');
  sh('node scripts/sync-www.js');
  sh('node scripts/sync-site-play.js');
  fs.rmSync(DIST, { recursive: true, force: true });
  sh('npx electron-builder --win zip');
  sh('npx electron-builder --win portable');

  // APK (si l'environnement Android est présent)
  try {
    const env = { ...process.env };
    env.JAVA_HOME = env.JAVA_HOME || firstDir([
      'C:\\Program Files\\Eclipse Adoptium\\jdk-21.0.12.101-hotspot',
      'C:\\Program Files\\Eclipse Adoptium\\jdk-17.0.20.101-hotspot',
    ]);
    env.ANDROID_HOME = env.ANDROID_HOME || (process.env.LOCALAPPDATA ? process.env.LOCALAPPDATA + '\\Android\\Sdk' : '');
    sh('npx cap sync android', { env });
    sh(process.platform === 'win32' ? '.\\gradlew.bat assembleDebug' : './gradlew assembleDebug',
       { cwd: path.join(ROOT, 'android'), env });
    fs.copyFileSync(APK_SRC, APK);
    console.log('APK -> ' + APK);
  } catch (e) {
    console.warn('\n⚠ APK non construit (' + e.message + '). Le reste continue sans l\'APK.');
  }

  // zip Windows sous un nom stable (pour la release GitHub et le bouton du site)
  if (fs.existsSync(ZIP)) cp(ZIP, ZIP_PUB);

  // copies pratiques à la racine + dans site/
  cp(EXE, path.join(ROOT, 'EveLatro.exe'));
  // NB : pas de copie dans site/ — l'APK dépasse la limite 25 Mio de Cloudflare
  //      Pages. Le bouton « Android » du site pointe sur la release GitHub.
  if (fs.existsSync(APK)) cp(APK, path.join(ROOT, 'EveLatro.apk'));
}

/* ---------- 2. GITHUB RELEASE ---------- */
// on peut forcer les liens à la main :  --dl-win="https://..."  --dl-apk="https://..."
let urlWin = getArg('dl-win', 'EveLatro.exe');
let urlApk = getArg('dl-apk', 'EveLatro.apk');
if (doStep('github') && urlWin === 'EveLatro.exe') {
  step('GITHUB RELEASE ' + TAG);
  let slug = null;
  try {
    const remote = shOut('git remote get-url origin');
    const m = remote.match(/github\.com[:/]([^/]+\/[^/.]+)(?:\.git)?/i);
    slug = m && m[1];
  } catch (e) {}
  if (!slug) {
    console.warn('⚠ Pas de dépôt GitHub (git remote origin). Étape GitHub ignorée — le site pointera sur des fichiers locaux (KO pour le .exe sur Cloudflare).');
  } else {
    ensure('gh --version', 'GitHub CLI (gh) absent. Installe-le : https://cli.github.com puis  gh auth login');
    // le site télécharge le .ZIP (dossier complet) ; on met aussi le .exe portable en secours
    if (fs.existsSync(ZIP) && !fs.existsSync(ZIP_PUB)) cp(ZIP, ZIP_PUB);   // au cas où --skip=build
    const assets = [ZIP_PUB, EXE, fs.existsSync(APK) ? APK : null]
      .filter(p => p && fs.existsSync(p)).map(q).join(' ');
    // supprime une release existante du même tag puis recrée (idempotent)
    try { sh(`gh release delete ${TAG} --yes --cleanup-tag`); } catch (e) {}
    sh(`gh release create ${TAG} ${assets} --title ${q('EveLatro! ' + VERSION)} --notes ${q(NOTES)}`);
    urlWin = fs.existsSync(ZIP_PUB)
      ? `https://github.com/${slug}/releases/download/${TAG}/EveLatro-Windows.zip`
      : `https://github.com/${slug}/releases/download/${TAG}/EveLatro.exe`;
    if (fs.existsSync(APK)) urlApk = `https://github.com/${slug}/releases/download/${TAG}/EveLatro.apk`;
    console.log('\nWindows (.zip) -> ' + urlWin);
    console.log('.apk  -> ' + urlApk);
  }
}

/* ---------- 3. LIENS DANS LE SITE ---------- */
if (doStep('github') || doStep('links') || doStep('site')) {
  step('LIENS SITE');
  const idx = path.join(ROOT, 'site', 'index.html');
  let html = fs.readFileSync(idx, 'utf8');
  const line = `window.DL_WIN=${JSON.stringify(urlWin)};window.DL_APK=${JSON.stringify(urlApk)};window.PLAY_URL="play/";`;
  html = html.replace(/window\.DL_WIN=[^\n]*window\.PLAY_URL="play\/";/, line);
  fs.writeFileSync(idx, html);
  console.log('site/index.html mis à jour :\n  ' + line);
}

/* ---------- 4. SITE (Cloudflare Pages) ---------- */
if (doStep('site')) {
  step('DÉPLOIEMENT SITE (Cloudflare Pages)');
  sh('node scripts/sync-www.js');
  sh('node scripts/sync-site-play.js');
  // NB : la branche de PRODUCTION du projet Cloudflare Pages s'appelle "Evelatro"
  // (créée au 1er déploiement). Ne pas changer, sinon evelatro.pages.dev ne bouge plus.
  sh('npx wrangler pages deploy site --project-name=evelatro --branch=Evelatro --commit-dirty=true');
  console.log('\n-> https://evelatro.pages.dev');
}

/* ---------- 5. BOT (Railway) ---------- */
if (doStep('bot')) {
  step('DÉPLOIEMENT BOT (Railway)');
  sh('railway up', { cwd: path.join(ROOT, 'bot') });
}

console.log('\n✅ Release ' + VERSION + ' terminée.');

/* ---------- utilitaires ---------- */
function q(s) { return '"' + String(s).replace(/"/g, '\\"') + '"'; }
function cp(a, b) { try { fs.copyFileSync(a, b); console.log(path.basename(b) + ' <- ' + path.basename(a)); } catch (e) { console.warn('copie KO ' + b + ' : ' + e.message); } }
function firstDir(list) { for (const d of list) { try { if (fs.statSync(d).isDirectory()) return d; } catch (e) {} } return ''; }
function ensure(cmd, msg) { try { execSync(cmd, { stdio: 'ignore' }); } catch (e) { throw new Error(msg); } }
