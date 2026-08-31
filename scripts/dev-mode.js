/* ===========================================================
   MODE DEV — ce fichier n'existe QUE dans dev/EveLatro-DEV.exe.

   Il est injecté par scripts/build-dev.js dans une COPIE de travail
   (.dev-build/). Il n'est jamais dans le dossier js/ du projet, ni
   dans dist/EveLatro-*-windows.zip. Le zip de sortie n'est donc
   jamais touché, quel que soit le nombre de rebuilds.

   Effet dans la version dev :
     - crédits infinis (la banque ne descend jamais, "∞" au portefeuille)
     - la Boutique est gratuite
     - RIEN n'est envoyé au classement en ligne ni au flux partagé
       (submitScore + pushActivity neutralisés) -> invisible sur le
       leaderboard, on peut tout tester sans polluer.
     - petit badge "DEV" en bas à gauche.
   =========================================================== */
(() => {
  window.__EVELATRO_DEV__ = true;   // coupe la synchro du porte-monnaie cloud
  const FAKE = 1e9; // solde affiché à l'interne ; "∞" à l'écran

  /* --- 1. Banque : crédits infinis, boutique gratuite --- */
  try {
    Bank.balance     = () => FAKE;
    Bank.currentPeak = () => FAKE;
    Bank.canPlace    = () => true;
    Bank.place       = () => true;
    Bank.stake       = (a) => Math.max(0, Math.round(a || 0)); // "prend" la mise, ne retire rien
    Bank.spend       = () => true;                             // achats gratuits
    Bank.sell        = () => {};                               // ventes de caisses sans effet
    Bank.payout      = () => {};                               // solde figé, gains sans effet
    Bank.rescue      = () => false;
    Bank.endRound    = () => false;                            // jamais de ruine -> jamais de record
    Bank.bestScore   = () => 0;
    Bank.scores      = () => [];
    Bank.clearScores = () => {};
  } catch (e) { console.warn('[DEV] Bank', e); }

  /* --- 2. Rien ne part vers le classement / le flux en ligne --- */
  function muteMultiplayer() {
    if (!window.Multiplayer) return false;
    Multiplayer.submitScore = async () => {};
    Multiplayer.pushActivity = async () => {};
    return true;
  }
  if (!muteMultiplayer()) {
    const t = setInterval(() => { if (muteMultiplayer()) clearInterval(t); }, 50);
    setTimeout(() => clearInterval(t), 5000);
  }

  /* --- 3. Affichage : "∞" au portefeuille + badge DEV --- */
  function paintWallet() {
    const c = document.getElementById('credits');
    if (c && c.textContent !== '∞') c.textContent = '∞';
  }

  function init() {
    paintWallet();
    const c = document.getElementById('credits');
    if (c) {
      new MutationObserver(paintWallet)
        .observe(c, { childList: true, characterData: true, subtree: true });
    }

    const badge = document.createElement('div');
    badge.textContent = 'DEV · crédits ∞ · hors classement';
    badge.style.cssText = [
      'position:fixed', 'left:8px', 'bottom:64px', 'z-index:99999',
      'background:#b3123c', 'color:#fff',
      'font:700 10px/1.5 system-ui,-apple-system,sans-serif',
      'padding:3px 9px', 'border-radius:999px', 'letter-spacing:.04em',
      'pointer-events:none', 'box-shadow:0 2px 8px rgba(0,0,0,.45)',
    ].join(';');
    document.body.appendChild(badge);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  console.log('%c[EveLatro] MODE DEV actif — crédits infinis, hors classement',
    'color:#ff4d7e;font-weight:bold');
})();
