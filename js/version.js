/* ===========================================================
   Version de cette build.
   -> Bump APP_VERSION a la main a chaque sortie (ex: '1.0', '1.1').
   -> Le suffixe plateforme (PC / Android / Web) est ajoute tout seul.
   Sert a : afficher la version dans le multi, et empecher les duels
   entre versions differentes.
   =========================================================== */
window.APP_VERSION = '1.2';

window.APP_PLATFORM = (() => {
  try {
    if (window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()) return 'Android';
    if (window.electronAuth && typeof window.electronAuth.oauth === 'function') return 'PC';
  } catch (e) { /* rien */ }
  return 'Web';
})();

// ex: "1.1 · PC"  — affiché dans le multi
window.APP_BUILD = window.APP_VERSION + ' · ' + window.APP_PLATFORM;

// Pour un duel : SEUL le numéro de version compte (1.1 vs 1.2), pas la
// plateforme. PC et Android en 1.1 peuvent jouer ensemble.
window.verNum = function (build) {
  return String(build || '').split('·')[0].trim() || String(build || '').trim();
};

// Ouvre un lien dans le VRAI navigateur, quelle que soit la plateforme.
window.openExternal = function (url) {
  if (!url || !/^https?:\/\//i.test(url)) return;
  try {
    if (window.electronAuth && typeof window.electronAuth.openExternal === 'function') {
      window.electronAuth.openExternal(url);
      return;
    }
  } catch (e) { /* rien */ }
  try { window.open(url, '_blank', 'noopener,noreferrer'); } catch (e) { /* rien */ }
};
