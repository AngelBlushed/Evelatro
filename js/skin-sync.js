/* ===========================================================
   Skins des croupiers partagés — ils ne se perdent JAMAIS, même
   quand tu changes de version (1.1 → 1.2 → …) ou d'appareil.

   Stockés sur ton compte Discord (table `user_skins` Supabase).
   FUSION : on ne retire jamais un skin. Si tu l'as sur PC, tu
   l'auras aussi sur Android/Web/Discord.
   =========================================================== */

const SkinSync = (() => {
  let running = false;
  let applying = false;
  let pushTimer = null;
  let unsub = null;

  const isDev = () => !!window.__EVELATRO_DEV__;
  const eligible = () => {
    try { return !isDev() && window.Multiplayer && Multiplayer.isConnected(); }
    catch (e) { return false; }
  };

  async function start() {
    if (running || !eligible()) return;
    running = true;

    const remote = await Multiplayer.skinsGet();
    if (!running) return;

    applying = true;
    if (remote) Skins.applyRemote(remote);      // fusionne cloud -> local
    applying = false;

    // renvoie l'état fusionné au cloud (au cas où le local avait des skins en plus)
    const snap = Skins.snapshot();
    await Multiplayer.skinsPush(snap.owned, snap.worn);
    log('skins synchronisés (' +
      (snap.owned.men.length - 1) + '+' + (snap.owned.women.length - 1) + ' achetés)');

    unsub = Multiplayer.subscribeSkins(row => {
      if (!row || !running || applying) return;
      applying = true;
      Skins.applyRemote({ owned: row.owned, worn: row.worn });
      applying = false;
    });
  }

  function stop() {
    running = false;
    if (unsub) { try { unsub(); } catch (e) {} unsub = null; }
    clearTimeout(pushTimer); pushTimer = null;
  }

  function schedulePush() {
    if (!running || applying || !eligible()) return;
    clearTimeout(pushTimer);
    pushTimer = setTimeout(() => {
      const s = Skins.snapshot();
      Multiplayer.skinsPush(s.owned, s.worn);
    }, 900);
  }

  function log(m) { try { console.log('[skins] ' + m); } catch (e) {} }

  try {
    Skins.onChange(() => { schedulePush(); return true; });
    Multiplayer.onChange(() => { eligible() ? start() : stop(); });
    setTimeout(() => { if (eligible()) start(); }, 900);
  } catch (e) { /* rien */ }

  return { start, stop };
})();

window.SkinSync = SkinSync;
