/* ===========================================================
   Mode combat "EveFight!" — l'habillage plein écran pendant un
   duel VS. Le verrouillage sur le jeu du duel + le masquage des
   menus sont gérés par le CSS (.fight-mode) et app.js.

   Ici : le chrono en haut, la carte de l'adversaire à gauche
   (photo Discord + pseudo + manches gagnées en direct), les
   manches restantes en haut à droite, le néon rouge aux 4 coins,
   et l'écran de fin sobre.
   =========================================================== */
(() => {
  let root = null;
  let signName = null;
  let signOld = 'EveLatro!';
  let lastEndId = 0;
  let lastRoundNo = 0;

  function build() {
    if (root) return;
    root = el('div', { class: 'fight-ui', id: 'fight-ui' });
    ['tl', 'tr', 'bl', 'br'].forEach(c => root.append(el('div', { class: 'fight-corner fc-' + c })));
    const quit = el('button', {
      class: 'fight-quit', id: 'fight-quit', type: 'button', text: 'Quitter',
      onClick: () => openModal({
        title: 'Quitter le duel ?',
        build(b, close) {
          b.append(
            el('p', { class: 'game-sub', text: 'Tu abandonnes : c\'est une défaite et tu perds ta mise.' }),
            el('div', { class: 'controls' },
              el('button', { class: 'btn btn-primary', text: 'Rester', onClick: close }),
              el('button', { class: 'btn', text: 'Abandonner', onClick: () => { Duel.abandon(); close(); } }),
            ),
          );
        },
      }),
    });
    root.append(
      el('div', { class: 'fight-opp', id: 'fight-opp' }),
      el('div', { class: 'fight-timer', id: 'fight-timer' }),
      el('div', { class: 'fight-rounds', id: 'fight-rounds' }),
      el('div', { class: 'fight-status', id: 'fight-status' }),
      el('div', { class: 'fight-flash', id: 'fight-flash', hidden: true }),
      el('div', { class: 'fight-lock', id: 'fight-lock', hidden: true },
        el('div', { class: 'fight-lock-in' },
          el('div', { class: 'fight-lock-big', text: '✔ Manche jouée' }),
          el('div', { class: 'fight-lock-sub', id: 'fight-lock-sub' }),
        ),
      ),
      quit,
    );
    (document.getElementById('app') || document.body).append(root);
    signName = document.querySelector('.sign-name');
  }

  function enter() {
    build();
    root.hidden = false;
    if (signName && signName.textContent !== 'EveFight!') {
      signOld = signName.textContent || 'EveLatro!';
      signName.textContent = 'EveFight!';
    }
  }
  function leave() {
    if (root) root.hidden = true;
    if (signName) signName.textContent = signOld || 'EveLatro!';
    lastRoundNo = 0;
  }

  function flash(msg, cls) {
    build();
    const f = document.getElementById('fight-flash');
    f.textContent = msg;
    f.className = 'fight-flash ' + (cls || '');
    f.hidden = false;
    clearTimeout(flash._t);
    flash._t = setTimeout(() => { f.hidden = true; }, 1600);
  }

  function paint() {
    const s = Duel.state();

    // fin de duel
    if (s.active && s.status === 'done' && Duel.raw() && Duel.raw().id !== lastEndId) {
      lastEndId = Duel.raw().id;
      leave();
      showEnd(s);
      return;
    }
    if (!s.active || s.status !== 'accepted') { leave(); return; }

    enter();

    // changement de manche -> petit flash du résultat
    if (lastRoundNo && s.roundNo > lastRoundNo) {
      const dW = s.myWins, prevMy = dW; // approx : on annonce juste "manche X"
      flash('Manche ' + (s.roundNo - 1) + ' — ' + s.myWins + ' / ' + s.oppWins,
        s.myWins > s.oppWins ? 'ff-win' : s.oppWins > s.myWins ? 'ff-lose' : '');
    }
    lastRoundNo = s.roundNo;

    // --- adversaire (gauche) ---
    const opp = document.getElementById('fight-opp');
    clear(opp);
    const av = el('div', { class: 'fight-av' });
    if (s.otherAvatar) av.append(el('img', { src: s.otherAvatar, alt: s.other, referrerpolicy: 'no-referrer' }));
    else av.textContent = (s.other || '?').slice(0, 1).toUpperCase();
    opp.append(av, el('div', { class: 'fight-opp-txt' },
      el('div', { class: 'fight-opp-name', text: s.other }),
      el('div', { class: 'fight-opp-wins', text: '🏅 ' + s.oppWins }),
    ));

    // --- chrono (haut centre) ---
    const tm = document.getElementById('fight-timer');
    const left = s.secondsLeft;
    tm.textContent = left;
    tm.classList.toggle('hot', left <= 5 && s.myRoundTurn);
    tm.classList.toggle('idle', !s.myRoundTurn);

    // --- manches (haut droite) ---
    const rd = document.getElementById('fight-rounds');
    clear(rd);
    rd.append(
      el('div', { class: 'fight-rd-big', text: s.roundNo + ' / ' + s.roundsTarget }),
      el('div', { class: 'fight-rd-sub', text: (s.roundsLeft) + ' manche' + (s.roundsLeft > 1 ? 's' : '') + ' restante' + (s.roundsLeft > 1 ? 's' : '') }),
      el('div', { class: 'fight-rd-me', text: '🏅 toi ' + s.myWins }),
    );

    // --- ligne de statut (bas) ---
    const st = document.getElementById('fight-status');
    if (s.waitingForOpp) st.textContent = '✔ Manche jouée — en attente de ' + s.other + '…';
    else if (s.myRoundTurn) st.textContent = '⚔ À toi ! Une manche de ' + s.gameName + ' avant la fin du chrono.';
    else st.textContent = '';

    // --- verrou : quand j'ai joué, je ne peux plus toucher au jeu ---
    const lock = document.getElementById('fight-lock');
    if (s.mySubmitted) {
      lock.hidden = false;
      document.getElementById('fight-lock-sub').textContent =
        s.oppSubmitted ? 'Résultat…' : 'On attend que ' + s.other + ' joue sa manche.';
    } else {
      lock.hidden = true;
    }
  }

  function showEnd(s) {
    try { Sound[s.winnerIsMe ? 'coins' : 'chip'] && Sound[s.winnerIsMe ? 'coins' : 'chip'](); } catch (e) {}
    const won = s.winnerIsMe, draw = s.isDraw;
    openModal({
      title: draw ? 'Duel nul' : won ? 'Duel gagné' : 'Duel perdu',
      build(b) {
        b.parentElement.classList.add('fight-end');
        b.append(
          el('div', { class: 'fe-head ' + (draw ? 'fe-draw' : won ? 'fe-win' : 'fe-lose') },
            el('div', { class: 'fe-title', text: draw ? 'Égalité' : won ? '🏆 Victoire' : 'Défaite' }),
            s.iWasDQ ? el('div', { class: 'fe-note', text: 'Chrono dépassé — tu as été disqualifié.' })
              : s.oppWasDQ ? el('div', { class: 'fe-note', text: s.other + ' a dépassé le chrono.' }) : null,
          ),
          el('div', { class: 'fe-score' },
            el('div', { class: 'fe-col' + (s.myWins >= s.oppWins ? ' fe-top' : '') },
              el('div', { class: 'fe-name', text: 'Toi' }),
              el('div', { class: 'fe-num', text: s.myWins }),
              el('div', { class: 'fe-lbl', text: 'manches' }),
            ),
            el('div', { class: 'fe-vs', text: 'VS' }),
            el('div', { class: 'fe-col' + (s.oppWins > s.myWins ? ' fe-top' : '') },
              el('div', { class: 'fe-name', text: s.other }),
              el('div', { class: 'fe-num', text: s.oppWins }),
              el('div', { class: 'fe-lbl', text: 'manches' }),
            ),
          ),
          el('p', { class: 'game-sub', text:
            draw ? 'Personne ne paie sa mise.'
              : won ? 'Tu remportes la mise de ' + s.other + '.'
              : s.other + ' remporte ta mise.' }),
          el('button', {
            class: 'btn btn-primary', text: 'Retour au casino',
            onClick: () => {
              const bd = document.querySelector('.modal-backdrop');
              if (bd) bd.remove();
            },
          }),
        );
      },
    });
  }

  try { Duel.onChange(paint); } catch (e) { /* rien */ }
  if (document.readyState !== 'loading') paint();
  else document.addEventListener('DOMContentLoaded', paint);
})();
