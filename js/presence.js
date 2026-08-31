/* ===========================================================
   Rich Presence Discord — pousse "solde · classement · pseudo"
   vers le client Discord (uniquement sur PC, via Electron).
   Sur navigateur / Android : ne fait rien.
   =========================================================== */

const Presence = (() => {
  const bridge = () => (window.electronAuth && typeof window.electronAuth.presence === 'function')
    ? window.electronAuth.presence : null;

  let debounce = null;
  let lastSig = '';
  let rankCache = null;
  let rankAt = 0;

  async function computeRank() {
    // au plus une lecture du classement toutes les 30 s
    if (Date.now() - rankAt < 30000) return rankCache;
    rankAt = Date.now();
    try {
      if (window.Multiplayer && Multiplayer.isConnected() && Multiplayer.leaderboard) {
        const rows = await Multiplayer.leaderboard();
        if (rows && rows.length) {
          const i = rows.findIndex(r => r.me);
          rankCache = i >= 0 ? i + 1 : null;
        }
      } else {
        rankCache = null;
      }
    } catch (e) { /* on garde l'ancien */ }
    return rankCache;
  }

  function schedule() {
    const push = bridge();
    if (!push || window.__EVELATRO_DEV__) return;
    clearTimeout(debounce);
    debounce = setTimeout(async () => {
      let credits = null, pseudo = null;
      try {
        if (window.Bank && !(Bank.inFight && Bank.inFight())) credits = Bank.balance();
      } catch (e) {}
      try {
        if (window.Multiplayer && Multiplayer.isConnected()) {
          const u = Multiplayer.user(); pseudo = u && u.name;
        }
      } catch (e) {}
      const rank = await computeRank();
      const data = { credits, rank, pseudo };
      const sig = JSON.stringify(data);
      if (sig === lastSig) return;
      lastSig = sig;
      try { push(data); } catch (e) {}
    }, 3000);
  }

  try {
    if (bridge()) {
      Bank.onChange(schedule);
      if (window.Multiplayer) Multiplayer.onChange(schedule);
      setTimeout(schedule, 3500);
    }
  } catch (e) { /* rien */ }

  return { schedule };
})();

window.Presence = Presence;
