/* ===========================================================
   Onglet — Records
   Le record = le maximum de crédits atteint pendant une partie,
   juste avant de tout reperdre (et de récupérer 200 crédits).
   =========================================================== */

Games.leaderboard = {
  icon: '🏆',
  name: 'Records',

  render(root) {
    const body = gameShell(root, 'Records',
      "Ton record = le maximum de crédits atteint avant de tout reperdre.");

    const scores = Bank.scores();
    const best = Bank.bestScore();
    const peak = Bank.currentPeak();

    // Grand chiffre : le meilleur record.
    body.append(
      el('div', { class: 'record-hero' },
        el('div', { class: 'record-hero-label', text: 'Meilleur record' }),
        el('div', { class: 'record-hero-value', text: best ? best + ' cr.' : '—' }),
      ),
      el('div', { class: 'record-now' },
        'Partie en cours — sommet atteint : ',
        el('b', { text: peak + ' cr.' }),
      ),
    );

    // Invitation Discord — disparaît une fois connectée.
    if (!(window.Multiplayer && Multiplayer.isConnected())) {
      body.append(el('div', { class: 'discord-cta discord-cta-compact' },
        discordButton(() => EveLatro.openMulti('leaderboard')),
        el('span', { class: 'game-sub', text: 'Connecte-toi pour le classement entre amis' }),
      ));
    }

    if (!scores.length) {
      body.append(el('p', { class: 'game-sub', text:
        "Pas encore de record. Joue, grimpe le plus haut possible… puis reperds tout : ton sommet s'inscrira ici." }));
      return;
    }

    // Classement avec petites barres proportionnelles.
    const max = scores[0].score || 1;
    const list = el('div', { class: 'record-list' });
    scores.forEach((s, i) => {
      list.append(el('div', { class: 'record-row' },
        el('span', { class: 'record-rank', text: '#' + (i + 1) }),
        s.date ? el('span', { class: 'record-date', text: new Date(s.date).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' }) }) : null,
        el('span', { class: 'record-bar-wrap' },
          el('span', { class: 'record-bar', style: `width:${Math.max(6, Math.round(100 * s.score / max))}%` })),
        el('span', { class: 'record-score', text: s.score }),
      ));
    });
    body.append(list);

    body.append(el('div', { class: 'controls' },
      el('button', {
        class: 'btn',
        text: 'Effacer les records',
        onClick: () => {
          if (confirm('Effacer tous les records ?')) {
            Bank.clearScores();
            clear(root);
            Games.leaderboard.render(root);
          }
        },
      }),
    ));
  },
};
