/* ===========================================================
   Avertissement anti-triche — s'affiche UNE fois, au tout premier
   lancement, AVANT le panneau "Quoi de neuf ?".
   =========================================================== */

const FairPlay = (() => {
  const ACK = 'evelatro-fairplay-ack';

  function acked() { try { return localStorage.getItem(ACK) === '1'; } catch (e) { return false; } }
  function markAcked() { try { localStorage.setItem(ACK, '1'); } catch (e) {} }

  /* Affiche l'avertissement si besoin, puis appelle next(). */
  function gate(next) {
    if (acked()) { if (next) next(); return; }
    openModal({
      title: '⚠️ Fair-play',
      onClose() { markAcked(); if (next) next(); },
      build(body, close) {
        body.classList.add('fairplay-body');
        body.append(el('div', { class: 'fairplay-warn' },
          el('p', { class: 'fairplay-big', text: 'Tricher, c\'est mal.' }),
          el('p', { class: 'fairplay-p', text:
            'Toute triche (modification des fichiers, injection de crédits ou de skins, outils tiers…) '
            + 'est détectée et sanctionnée par une REMISE À ZÉRO TOTALE de la progression liée à ton compte Discord : '
            + 'crédits, skins de croupier, skins de caisses, cartes — tout.' }),
          el('p', { class: 'fairplay-p fairplay-strong', text: 'Réfléchis-y à deux fois.' }),
        ));
        const actions = el('div', { class: 'news-actions' });
        actions.append(el('button', {
          class: 'btn btn-danger',
          text: 'J\'ai compris, je joue franc-jeu',
          onClick: () => { markAcked(); close(); },
        }));
        body.append(actions);
      },
    });
  }

  return { gate, acked };
})();

window.FairPlay = FairPlay;
