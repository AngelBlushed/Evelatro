/* ===========================================================
   Réinitialisation "triche détectée".
   Efface tout en local, coupe Discord, affiche l'écran rouge,
   puis redémarre l'application. Au retour : plus rien.
   =========================================================== */

const AntiCheat = (() => {
  let done = false;

  const REASONS = {
    reason_interdit: 'Mouvement de crédits réservé au serveur',
    gain_impossible: 'Gain impossible par rapport à la mise',
    gain_lot_impossible: 'Gains impossibles sur la session',
    flag_serveur: 'Compte signalé par le serveur',
    ratio_gains_anormal: 'Ratio gains / mises anormal',
  };
  function human(reason) {
    const key = String(reason || '').split(':')[0];
    return REASONS[key] || 'Anomalie détectée sur la progression';
  }

  const RE = /petit-casino|evelatro|cs-inv|bonus|fairplay|news-seen|skin/i;
  function wipeLocal() {
    try {
      const kill = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && RE.test(k)) kill.push(k);
      }
      kill.forEach(k => { try { localStorage.removeItem(k); } catch (e) {} });
    } catch (e) {}
    try { sessionStorage.clear(); } catch (e) {}
  }

  function screen(reason) {
    const wrap = document.createElement('div');
    wrap.id = 'anticheat-screen';
    wrap.innerHTML =
      '<div class="ac-box">'
      + '<div class="ac-title">TRICHE DÉTECTÉE</div>'
      + '<p class="ac-p">Une modification illégale de ta progression a été détectée : <b>' + human(reason) + '</b>.</p>'
      + '<p class="ac-p">Ta progression liée à ce compte Discord a été <b>remise à zéro</b> : crédits, skins de croupier, skins de caisses, cartes, classement.</p>'
      + '<p class="ac-p ac-small">Erreur ? Contacte Eve : ta fiche est conservée et ta progression peut être restaurée.</p>'
      + '<div class="ac-count">Redémarrage dans <span id="ac-n">6</span> s…</div>'
      + '</div>';
    document.body.appendChild(wrap);
    let n = 6;
    const t = setInterval(() => {
      n -= 1;
      const el = document.getElementById('ac-n');
      if (el) el.textContent = String(n);
      if (n <= 0) { clearInterval(t); location.reload(); }
    }, 1000);
  }

  async function nuke(reason) {
    if (done || window.__EVELATRO_DEV__) return;
    done = true;
    try { if (window.Music && Music.stop) Music.stop(); } catch (e) {}
    wipeLocal();
    try { await Multiplayer.logout(); } catch (e) {}
    screen(reason);
    // filet : reload même si le compte à rebours plante
    setTimeout(() => location.reload(), 8000);
  }

  return { nuke, human };
})();

window.AntiCheat = AntiCheat;
