/* ===========================================================
   EveLatro nécessite une connexion internet ET une connexion
   Discord (anti-triche : impossible de jouer hors-ligne puis de
   "rattraper" les gains). On ne peut pas se déconnecter.
   Mode DEV : tout est désactivé.
   =========================================================== */

const NetGuard = (() => {
  const dev = () => !!window.__EVELATRO_DEV__;
  let overlay = null;

  function ensureOverlay() {
    if (overlay) return overlay;
    overlay = document.createElement('div');
    overlay.id = 'netguard';
    overlay.hidden = true;
    document.body.appendChild(overlay);
    return overlay;
  }

  function hide() { if (overlay) overlay.hidden = true; }

  function showOffline() {
    const o = ensureOverlay();
    o.innerHTML =
      '<div class="ng-box">'
      + '<div class="ng-emoji">📡</div>'
      + '<div class="ng-title">Connexion internet requise</div>'
      + '<p class="ng-p">EveLatro a besoin d\'internet pour jouer (progression sécurisée côté serveur).</p>'
      + '<p class="ng-p ng-small">Le jeu reprend tout seul dès que la connexion revient.</p>'
      + '</div>';
    o.hidden = false;
  }

  function showNeedDiscord() {
    const o = ensureOverlay();
    o.innerHTML =
      '<div class="ng-box">'
      + '<div class="ng-emoji">🎮</div>'
      + '<div class="ng-title">Connecte-toi avec Discord</div>'
      + '<p class="ng-p">La connexion Discord est obligatoire : elle garde ta progression (crédits, skins, classement) et la protège.</p>'
      + '<div id="ng-btn"></div>'
      + '<p class="ng-p ng-small" id="ng-err"></p>'
      + '</div>';
    o.hidden = false;
    const holder = o.querySelector('#ng-btn');
    const btn = document.createElement('button');
    btn.className = 'discord-btn';
    btn.innerHTML = (typeof DISCORD_LOGO !== 'undefined' ? DISCORD_LOGO : '') + '<span>Connecte-toi avec Discord !</span>';
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      try { await Multiplayer.login(); }
      catch (e) {
        btn.disabled = false;
        const err = o.querySelector('#ng-err');
        if (err) err.textContent = (window.AuthFlow && AuthFlow.platform && AuthFlow.platform() === 'browser')
          ? 'Redirection Discord…' : (e && e.message === 'CANCELLED' ? 'Connexion annulée.' : 'Connexion impossible, réessaie.');
      }
    });
    holder.appendChild(btn);
    const le = Multiplayer.lastAuthError && Multiplayer.lastAuthError();
    if (le) { const err = o.querySelector('#ng-err'); if (err) err.textContent = le; }
  }

  let online = navigator.onLine;
  let bootDone = false;   // passé à true après ~12 s : on n'attend plus le serveur

  function showServerDown() {
    const o = ensureOverlay();
    o.innerHTML =
      '<div class="ng-box">'
      + '<div class="ng-emoji">🛠️</div>'
      + '<div class="ng-title">Serveur injoignable</div>'
      + '<p class="ng-p">Impossible de joindre le serveur EveLatro. Vérifie ta connexion et réessaie.</p>'
      + '<p class="ng-p ng-small">Le jeu reprend tout seul dès que le serveur répond.</p>'
      + '</div>';
    o.hidden = false;
  }

  function ready() {
    try { return !!(window.Multiplayer && Multiplayer.isReady && Multiplayer.isReady()); }
    catch (e) { return false; }
  }

  function evaluate() {
    if (dev()) { hide(); return; }
    if (!online) { showOffline(); return; }
    if (!ready()) { if (bootDone) showServerDown(); return; }
    try {
      if (!Multiplayer.isConnected()) { showNeedDiscord(); return; }
      hide();
    } catch (e) { /* rien */ }
  }

  window.addEventListener('offline', () => { online = false; evaluate(); });
  window.addEventListener('online', () => { online = true; evaluate(); });

  try { Multiplayer.onChange(evaluate); } catch (e) {}
  const beat = setInterval(evaluate, 1000);
  setTimeout(() => { bootDone = true; evaluate(); }, 12000);
  setTimeout(evaluate, 1500);
  // on garde un battement léger indéfiniment (peu coûteux, écran de garde fiable)
  window.addEventListener('beforeunload', () => clearInterval(beat));

  return { evaluate };
})();

window.NetGuard = NetGuard;
