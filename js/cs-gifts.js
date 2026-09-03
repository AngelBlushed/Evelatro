/* ===========================================================
   Réception des skins offerts (commande /donner-skin du bot).
   À la connexion (et toutes les 60 s), on lit les cadeaux non
   réclamés, on les ajoute à l'inventaire des caisses, on marque
   claimed = true, et on affiche un petit toast.
   =========================================================== */

const CsGifts = (() => {
  let busy = false;

  async function claim() {
    if (busy || window.__EVELATRO_DEV__) return;
    try {
      if (!(window.Multiplayer && Multiplayer.isConnected() && Multiplayer.client && window.Cases)) return;
      const u = Multiplayer.user();
      if (!u) return;
      busy = true;
      const { data, error } = await Multiplayer.client.from('cs_gifts')
        .select('id,skin').eq('user_id', u.id).eq('claimed', false).limit(30);
      if (error || !data || !data.length) return;
      const ids = [];
      for (const g of data) {
        const it = Cases.grant(g.skin || {});
        if (it) {
          ids.push(g.id);
          try {
            Toast.info('🎁 Skin reçu : ' + (g.skin.weapon || '?') + ' | ' + (g.skin.name || '?'));
          } catch (e) {}
        }
      }
      if (ids.length) {
        await Multiplayer.client.from('cs_gifts').update({ claimed: true }).in('id', ids);
      }
    } catch (e) {
      console.warn('cs_gifts', e && e.message);
    } finally {
      busy = false;
    }
  }

  try {
    Multiplayer.onChange(() => { if (Multiplayer.isConnected()) claim(); });
    setTimeout(claim, 4000);
    setInterval(() => { if (Multiplayer.isConnected()) claim(); }, 60000);
  } catch (e) { /* rien */ }

  return { claim };
})();

window.CsGifts = CsGifts;
