/* ===========================================================
   Porte-monnaie : le SERVEUR fait foi (anti-triche).
   - à la connexion : on lit le solde serveur (wallet_state)
   - en jeu : chaque mouvement va dans un journal (Bank), qu'on
     envoie au serveur toutes les ~3,5 s (wallet_commit). Le
     serveur valide, corrige le solde, et si un mouvement est
     IMPOSSIBLE il "flag" le compte -> AntiCheat.nuke().
   Jamais en mode DEV, ni pendant un duel VS (solde virtuel).
   =========================================================== */

const WalletLedger = (() => {
  let running = false;
  let flushing = false;
  let timer = null;
  let unsub = null;

  const dev = () => !!window.__EVELATRO_DEV__;
  function on() {
    try {
      return !dev()
        && window.Multiplayer && Multiplayer.isConnected()
        && !(window.Bank && Bank.inFight && Bank.inFight());
    } catch (e) { return false; }
  }

  function nuke(reason) {
    try {
      if (window.AntiCheat) AntiCheat.nuke(reason || 'anomalie');
      else console.warn('[wallet] compte flaggé mais AntiCheat absent :', reason);
    } catch (e) {}
  }

  async function reconcile() {
    if (!on()) return;
    const st = await Multiplayer.walletState();
    if (!st) return;
    if (st.flagged) { nuke(st.flagReason); return; }
    if (Number.isFinite(st.credits)) Bank.setCredits(st.credits);
  }

  async function flush() {
    if (flushing || !on()) return;
    const all = Bank._ledgerTake();
    if (!all.length) return;
    const entries = all.slice(0, 180);
    if (all.length > 180) Bank._ledgerRestore(all.slice(180));   // le reste au prochain tour
    flushing = true;
    try {
      const res = await Multiplayer.walletCommit(entries);
      if (!res) { Bank._ledgerRestore(entries); return; }   // réseau : on retentera
      if (res.flagged) { nuke(res.flagReason); return; }
      // si rien n'a bougé depuis l'envoi, on cale le solde sur le serveur ;
      // sinon la valeur reçue est déjà périmée -> le prochain flush réconciliera.
      if (Bank._ledgerPendingCount() === 0 && Number.isFinite(res.credits)) {
        Bank.setCredits(res.credits);
        if (res.credits <= 0) await reconcile();             // le serveur recharge à 200
      }
    } finally {
      flushing = false;
    }
  }

  function start() {
    if (running || !on()) return;
    running = true;
    reconcile();
    clearInterval(timer);
    timer = setInterval(flush, 3500);
    try {
      unsub = Multiplayer.subscribeWallet(async row => {
        if (!running) return;
        if (row && row.flagged) { nuke('flag_serveur'); return; }
        // un autre appareil a changé le solde -> on relit proprement
        await reconcile();
      });
    } catch (e) {}
  }

  function stop() {
    running = false;
    clearInterval(timer); timer = null;
    if (unsub) { try { unsub(); } catch (e) {} unsub = null; }
  }

  try {
    Multiplayer.onChange(() => { on() ? start() : stop(); });
    Bank.onRefill(() => flush());
    document.addEventListener('visibilitychange', () => { if (document.hidden) flush(); });
    window.addEventListener('beforeunload', () => { try { flush(); } catch (e) {} });
    setTimeout(() => { if (on()) start(); }, 900);
  } catch (e) { /* rien */ }

  return { start, stop, flush, reconcile };
})();

window.WalletLedger = WalletLedger;
