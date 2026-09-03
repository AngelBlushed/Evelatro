/* ===========================================================
   Le panneau "Multi" (bouton en bas à droite du dock).
   Deux vues :
     1. Leaderboard multijoueur  -> renderFriendsPanel()  (Discord + Supabase)
     2. Actions en directe        -> renderActivityPanel()
   =========================================================== */

/* --- Vue 1 : classement entre amis --- */
function renderFriendsPanel(container) {
  const box = el('div', { class: 'game-body' });
  container.append(box);

  let alive = true;
  let drawSeq = 0;
  const off = Multiplayer.onChange(() => { if (alive) draw(); });
  // classement en direct : on rafraîchit tant que le panneau est ouvert
  const poll = setInterval(() => { if (alive && Multiplayer.isConnected()) draw(); }, 8000);
  draw();

  async function draw() {
    const my = ++drawSeq;
    clear(box);

    if (!Multiplayer.isConnected()) {
      box.append(loggedOutView());
      box.append(mpInfoBlock());
      return;
    }

    const u = Multiplayer.user();
    box.append(el('div', { class: 'mp-head' },
      el('span', {}, 'Connecté : ', el('b', { text: u.name })),
      el('span', { class: 'mp-ver on', title: 'Version de cette build', text: 'v' + (window.APP_BUILD || '?') }),
    ));

    const loading = el('p', { class: 'game-sub', text: 'Chargement du classement…' });
    box.append(loading);

    const rows = await Multiplayer.leaderboard();
    if (!alive || my !== drawSeq) return;   // un draw plus récent a pris la main
    loading.remove();

    if (rows === null) {
      box.append(el('div', { class: 'mp-info' },
        el('b', { text: 'Classement indisponible' }),
        el('p', { text: 'Impossible de joindre le serveur. Vérifie ta connexion, ou que la table « scores » existe bien sur Supabase.' }),
      ));
      box.append(el('button', { class: 'btn', text: 'Réessayer', onClick: draw }));
      return;
    }

    if (!rows.length) {
      box.append(el('p', { class: 'game-sub', text: 'Personne en jeu pour l\'instant. Joue une partie !' }));
      return;
    }

    const max = rows[0].score || 1;
    const list = el('div', { class: 'record-list' });
    rows.forEach((r, i) => {
      list.append(el('div', { class: 'record-row' + (r.me ? ' record-row-me' : '') },
        el('span', { class: 'record-rank', text: '#' + (i + 1) }),
        el('div', { class: 'record-idbox' },
          el('span', { class: 'record-name', text: r.name }),
          r.date ? el('span', { class: 'record-date', text: new Date(r.date).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: '2-digit' }) }) : null,
        ),
        el('span', { class: 'record-bar-wrap' },
          el('span', { class: 'record-bar', style: `width:${Math.max(6, Math.round(100 * r.score / max))}%` })),
        el('span', { class: 'record-score', text: r.score }),
      ));
    });
    box.append(list);
  }

  return () => { alive = false; off(); clearInterval(poll); };
}

function discordButton(onClick) {
  const btn = el('button', { class: 'discord-btn', onClick });
  btn.innerHTML = DISCORD_LOGO + '<span>Connecte-toi avec Discord !</span>';
  return btn;
}

function loggedOutView() {
  const wrap = el('div', { class: 'discord-cta' });

  const btn = discordButton(async () => {
    if (!Multiplayer.canConnect()) {
      wrap.append(el('p', { class: 'game-sub', text:
        "La connexion Discord marche dans l'app installée (EveLatro.exe ou l'APK Android), pas dans le test navigateur." }));
      return;
    }
    const label = btn.querySelector('span');
    const old = label.textContent;
    btn.disabled = true;
    label.textContent = 'Connexion…';
    try {
      await Multiplayer.login();
      Sound.chip();
      if (Multiplayer.user()) Activity.log({ game: '', detail: 'Connecté : ' + Multiplayer.user().name, tone: 'info' });
    } catch (e) {
      btn.disabled = false;
      label.textContent = old;
      if (e && e.message !== 'CANCELLED') {
        wrap.append(el('p', { class: 'mp-error', text: 'Échec de la connexion : ' + (e.message || e) }));
      }
    }
  });

  wrap.append(
    el('div', { class: 'mp-head' },
      btn,
      el('span', { class: 'mp-ver off', title: 'Version de cette build', text: 'v' + (window.APP_BUILD || '?') }),
    ),
    el('p', { class: 'game-sub', text: 'Connecte-toi pour comparer tes records avec tes amis.' }),
  );

  // si un retour de Discord vient d'échouer, on explique pourquoi
  try {
    const ae = Multiplayer.lastAuthError && Multiplayer.lastAuthError();
    if (ae) wrap.append(el('p', { class: 'mp-error', text: 'Connexion Discord : ' + ae }));
  } catch (e) { /* rien */ }

  return wrap;
}

function mpInfoBlock() {
  const b = el('div', { class: 'mp-info' });
  b.append(
    el('b', { text: 'Comment ça marche' }),
    el('p', { text:
      "Ton pseudo et ta photo Discord servent d'identité. Ton meilleur record est " +
      "envoyé automatiquement au classement partagé. Personne ne peut modifier ton score." }),
  );
  return b;
}


/* --- Vue 2 : actions en directe (partagé entre amis si connecté) --- */
function liveRow(e) {
  const money = (e.bet != null || e.gain != null) ? el('div', { class: 'live-money' },
    e.bet != null ? el('span', { class: 'live-bet', text: 'mise ' + e.bet }) : null,
    e.gain != null ? el('span', {
      class: 'live-gain ' + (e.gain > 0 ? 'up' : e.gain < 0 ? 'down' : 'flat'),
      text: (e.gain > 0 ? '+' : '') + e.gain,
    }) : null,
    e.balance != null ? el('span', { class: 'live-total', text: '= ' + e.balance }) : null,
  ) : null;
  return el('div', { class: 'live-row live-' + (e.tone || 'info') },
    el('span', { class: 'live-time', text: new Date(e.t).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) }),
    el('div', { class: 'live-main' },
      el('div', { class: 'live-head' },
        el('span', { class: 'live-who' + (e.me ? ' is-me' : ''), text: e.who }),
        e.game ? el('span', { class: 'live-game', text: e.game }) : null,
      ),
      e.detail ? el('div', { class: 'live-detail', text: e.detail }) : null,
    ),
    money,
  );
}

function fromDb(r) {
  return {
    t: new Date(r.created_at).getTime(),
    who: r.pseudo || 'Joueur',
    game: r.game || '',
    detail: r.detail || '',
    bet: r.bet,
    gain: r.gain,
    balance: r.balance,
    tone: r.tone || (r.gain > 0 ? 'win' : r.gain < 0 ? 'lose' : 'push'),
    me: Multiplayer.user() && r.user_id === Multiplayer.user().id,
  };
}

function renderActivityPanel(container) {
  const note = el('p', { class: 'game-sub' });
  const list = el('div', { class: 'live-list' });
  container.append(note, list);

  let inner = () => {};
  function setup() {
    inner();
    clear(list);
    inner = (window.Multiplayer && Multiplayer.isConnected())
      ? liveShared(list, note)
      : liveLocal(list, note);
  }
  setup();
  const off = Multiplayer.onChange(setup);
  return () => { inner(); off(); };
}

/* mode hors-ligne : seulement tes actions, en local */
function liveLocal(list, note) {
  note.textContent = 'Connecte-toi (bouton Discord) pour voir aussi l\'historique de tes potes en direct.';
  const render = () => {
    clear(list);
    Activity.list().forEach(e => list.append(liveRow(e)));
  };
  render();
  return Activity.onChange(render);
}

/* mode connecté : flux partagé (toi + amis) via Supabase Realtime */
function liveShared(list, note) {
  note.textContent = 'En direct — toi et tes amis connectés.';
  let alive = true;
  let rows = [];

  const paint = () => {
    clear(list);
    rows.slice(0, 80).forEach(r => list.append(liveRow(r)));
  };

  Multiplayer.recentActivity().then(data => {
    if (!alive) return;
    if (data === null) {
      note.textContent = 'Historique partagé indisponible — la table « activity » est-elle créée sur Supabase ?';
      return;
    }
    rows = data.map(fromDb);
    paint();
  });

  const unsub = Multiplayer.subscribeActivity(r => {
    if (!alive) return;
    rows.unshift(fromDb(r));
    if (rows.length > 120) rows = rows.slice(0, 120);
    paint();
  });

  return () => { alive = false; unsub(); };
}

const DISCORD_LOGO = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M20.317 4.369a19.79 19.79 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.865-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.036A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.3 12.3 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.84 19.84 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.331c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/></svg>';


/* --- Vue 3 : Joueurs (en ligne / hors ligne) --- */
function renderPlayersPanel(container) {
  const note = el('p', { class: 'game-sub' });
  const box = el('div', { class: 'game-body' });
  container.append(note, box);

  if (!(window.Multiplayer && Multiplayer.isConnected())) {
    note.textContent = 'Connecte-toi avec Discord pour voir qui est là.';
    return () => {};
  }
  note.textContent = 'Vert = en ligne, gris = hors ligne.';

  let roster = [];
  let alive = true;

  function paint() {
    const online = Multiplayer.onlineIds();
    const meId = Multiplayer.user() && Multiplayer.user().id;
    const on = roster.filter(p => online.has(p.id));
    const off2 = roster.filter(p => !online.has(p.id));
    clear(box);

    const section = (title, arr, isOn) => {
      box.append(el('div', { class: 'players-h', text: title + ' (' + arr.length + ')' }));
      if (!arr.length) { box.append(el('p', { class: 'game-sub', text: '—' })); return; }
      const list = el('div', { class: 'players-list' });
      arr.forEach(p => list.append(el('div', { class: 'player-row' },
        el('span', { class: 'player-dot ' + (isOn ? 'on' : 'off') }),
        el('span', { class: 'player-name' + (p.id === meId ? ' is-me' : ''), text: p.name + (p.id === meId ? ' (toi)' : '') }),
        el('span', { class: 'player-tag ' + (isOn ? 'on' : 'off'), text: isOn ? 'connecté' : 'non' }),
      )));
      box.append(list);
    };
    section('En ligne', on, true);
    section('Hors ligne', off2, false);
  }

  Multiplayer.roster().then(data => {
    if (!alive) return;
    if (data === null) { note.textContent = 'Liste indisponible (table scores ?).'; return; }
    roster = data;
    paint();
  });
  const stop = Multiplayer.subscribePresence(() => { if (alive) paint(); });
  return () => { alive = false; stop(); };
}


/* --- Vue 4 : VS (duel) --- */
function renderVsPanel(container) {
  const box = el('div', { class: 'game-body' });
  container.append(box);

  if (!(window.Multiplayer && Multiplayer.isConnected())) {
    box.append(el('p', { class: 'game-sub', text: 'Connecte-toi avec Discord pour défier un ami.' }));
    return () => {};
  }

  let alive = true;
  const stop = Duel.onChange(() => { if (alive) draw(); });
  Duel.sync();
  draw();

  function duelBar(name, bal, total, meRow) {
    const pct = Math.max(3, Math.round(100 * (bal || 0) / total));
    return el('div', { class: 'duel-row' },
      el('span', { class: 'duel-name' + (meRow ? ' is-me' : ''), text: name }),
      el('span', { class: 'duel-track' }, el('span', { class: 'duel-fill', style: 'width:' + pct + '%' })),
      el('span', { class: 'duel-val', text: (bal || 0) + '' }),
    );
  }

  function challengeForm() {
    box.append(el('div', { class: 'game-sub', text: 'Défie un joueur en ligne : un jeu, un nombre de manches, 20 s par manche. Celui qui gagne le plus de manches rafle la mise.' }));
    box.append(el('div', { class: 'game-sub mp-ver-note', text: 'Version requise pour un duel : v' + (window.verNum ? window.verNum(window.APP_BUILD) : window.APP_BUILD) + ' (PC et Android compatibles)' }));
    Multiplayer.roster().then(data => {
      if (!alive) return;
      const meId = Multiplayer.user().id;
      const info = Multiplayer.onlineInfo();
      const myV = window.APP_BUILD || ''; const vn = window.verNum || (x => String(x||''));
      const opps = (data || []).filter(p => p.id !== meId && Multiplayer.onlineIds().has(p.id))
        .map(p => ({ ...p, v: (info[p.id] && info[p.id].v) || '' }));
      if (!opps.length) {
        box.append(el('p', { class: 'game-sub', text: 'Personne d’autre en ligne pour l’instant.' }));
        return;
      }
      const sel = el('select', { class: 'pseudo-input' });
      opps.forEach(p => {
        const bad = myV && p.v && vn(p.v) !== vn(myV);
        sel.append(el('option', { value: p.id, text: p.name + (bad ? '  (v' + p.v + ' ✗)' : p.v ? '  (v' + p.v + ')' : '') }));
      });

      // % de mise
      const pctRange = el('input', { type: 'range', min: '10', max: '100', step: '5', value: '50', class: 'vol-range' });
      const pctVal = el('span', { class: 'vol-val' });
      const refreshPct = () => { pctVal.textContent = pctRange.value + ' %'; };
      pctRange.addEventListener('input', refreshPct); refreshPct();

      // choix de la machine (visible seulement si "Machines" est choisi)
      let slotMachine = 0;
      const slotSeg = el('div', { class: 'seg', hidden: true });
      [['Classique', 0], ['Néon', 1], ['Deluxe', 2]].forEach(([label, i]) => {
        const b = el('button', { class: 'seg-btn' + (i === slotMachine ? ' on' : ''), type: 'button', text: label,
          onClick: () => { slotMachine = i; [...slotSeg.children].forEach(c => c.classList.toggle('on', c === b)); } });
        slotSeg.append(b);
      });
      const slotLabel = el('div', { class: 'vol-label', text: 'Quelle machine', hidden: true });

      // choix du jeu
      let game = 'blackjack';
      const GAMES = [['blackjack', '🂡 Blackjack'], ['slots', '🎰 Machines'], ['poker', '🃏 Poker'], ['roulette', '🎡 Roulette']];
      const gameSeg = el('div', { class: 'seg' });
      GAMES.forEach(([id, label]) => {
        const b = el('button', { class: 'seg-btn' + (id === game ? ' on' : ''), type: 'button', text: label,
          onClick: () => {
            game = id;
            [...gameSeg.children].forEach(c => c.classList.toggle('on', c === b));
            const showSlot = id === 'slots';
            slotSeg.hidden = !showSlot; slotLabel.hidden = !showSlot;
          } });
        gameSeg.append(b);
      });

      // nombre de manches (1 / 5 / 10)
      let rounds = 5;
      const roundSeg = el('div', { class: 'seg' });
      [1, 5, 10].forEach(n => {
        const b = el('button', { class: 'seg-btn' + (n === rounds ? ' on' : ''), type: 'button', text: n === 1 ? '1 manche' : n + ' manches',
          onClick: () => { rounds = n; [...roundSeg.children].forEach(c => c.classList.toggle('on', c === b)); } });
        roundSeg.append(b);
      });

      box.append(
        el('label', { class: 'vol-row' }, el('span', { class: 'vol-label', text: 'Adversaire' }), sel),
        el('div', { class: 'vol-label', text: 'Jeu du duel' }), gameSeg,
        slotLabel, slotSeg,
        el('div', { class: 'vol-label', text: 'Nombre de manches' }), roundSeg,
        el('label', { class: 'vol-row' }, el('span', { class: 'vol-label', text: 'Mise (% solde)' }), pctRange, pctVal),
        el('button', {
          class: 'btn btn-primary', text: 'Lancer le défi',
          onClick: () => {
            const opp = opps.find(p => p.id === sel.value);
            if (!opp) return;
            if (myV && opp.v && vn(opp.v) !== vn(myV)) {
              openModal({
                title: 'Versions différentes',
                build(b) {
                  b.append(
                    el('p', { class: 'game-sub', text:
                      'Impossible de jouer un duel avec ' + opp.name + ' : vous n’avez pas la même version du jeu.' }),
                    el('p', { class: 'game-sub', text: 'Toi : v' + myV + '   •   ' + opp.name + ' : v' + opp.v }),
                  );
                },
              });
              return;
            }
            const gName = (Duel.GAME_NAMES && Duel.GAME_NAMES[game]) || game;
            const gTxt = gName + (game === 'slots' ? ' (' + ['Classique', 'Néon', 'Deluxe'][slotMachine] + ')' : '');
            openModal({
              title: 'Défier ' + opp.name + ' ?',
              build(b, close) {
                b.append(
                  el('p', { class: 'game-sub', text: gTxt + ' · ' + (rounds === 1 ? '1 manche' : rounds + ' manches') + ' · 20 s par manche · mise ' + pctRange.value + '% de ton solde.' }),
                  el('div', { class: 'controls' },
                    el('button', { class: 'btn', text: 'Annuler', onClick: close }),
                    el('button', {
                      class: 'btn btn-primary', text: 'Envoyer le défi',
                      onClick: async () => {
                        close();
                        const d = await Multiplayer.challenge(opp.id, opp.name, parseInt(pctRange.value, 10), game, rounds, slotMachine);
                        if (!d) {
                          openModal({ title: 'Échec', build(x) { x.append(el('p', { class: 'game-sub', text: 'Le défi n\'a pas pu être créé. As-tu bien relancé le fichier supabase-setup.sql ?' })); } });
                          return;
                        }
                        Sound.chip();
                      },
                    }),
                  ),
                );
              },
            });
          },
        }),
      );
    });
  }

  function draw() {
    clear(box);
    const s = Duel.state();

    if (!s.active) { challengeForm(); return; }

    if (s.status === 'done') {
      box.append(el('div', { class: 'mp-info' },
        el('b', { text: s.isDraw ? 'Duel nul' : s.winnerIsMe ? '🏆 Duel gagné !' : 'Duel perdu.' }),
        el('p', { text: 'Manches : toi ' + s.myWins + ' — ' + s.oppWins + ' ' + s.other + '.' }),
        el('p', { text: s.isDraw ? 'Personne ne paie sa mise.'
          : s.winnerIsMe ? ('Tu rafles la mise de ' + s.other + '.') : (s.other + ' rafle ta mise.') }),
      ));
      return;
    }

    if (s.waitingAccept) {
      box.append(
        el('div', { class: 'mp-info' }, el('b', { text: 'Défi envoyé à ' + s.other }),
          el('p', { text: s.gameName + ' · ' + s.roundsTarget + ' manches · mise ' + s.pct + '%. En attente de sa réponse…' })),
        el('button', { class: 'btn', text: 'Annuler', onClick: () => Duel.cancel() }),
      );
      return;
    }

    if (s.incoming && s.incompatible) {
      box.append(
        el('div', { class: 'mp-info' },
          el('b', { text: s.other + ' te défie… mais versions différentes' }),
          el('p', { text: 'Vous n’avez pas la même version du jeu, le duel est impossible.' }),
          el('p', { class: 'game-sub', text: 'Toi : v' + s.myVersion + '   •   ' + s.other + ' : v' + (s.otherVersion || '?') }),
        ),
        el('button', { class: 'btn', text: 'Décliner', onClick: () => Duel.decline() }),
      );
      return;
    }

    if (s.incoming) {
      box.append(
        el('div', { class: 'mp-info' }, el('b', { text: s.other + ' te défie !' }),
          el('p', { text: s.gameName + ' · ' + s.roundsTarget + ' manches · 20 s par manche.' }),
          el('p', { text: 'Mise : ' + s.pct + '% de ton solde (' + Math.floor(s.pct / 100 * (Bank.realBalance ? Bank.realBalance() : Bank.balance())) + ' cr.).' })),
        el('div', { class: 'controls' },
          el('button', { class: 'btn btn-primary', text: 'Relever le défi', onClick: () => Duel.accept() }),
          el('button', { class: 'btn', text: 'Décliner', onClick: () => Duel.decline() }),
        ),
      );
      return;
    }

    // duel en cours : le combat s'affiche en plein écran (fight.js). Ici juste un résumé.
    box.append(
      el('div', { class: 'mp-info' },
        el('b', { text: '⚔ Duel en cours contre ' + s.other }),
        el('p', { text: s.gameName + ' · manche ' + s.roundNo + ' / ' + s.roundsTarget }),
        el('p', { text: 'Manches gagnées : toi ' + s.myWins + ' — ' + s.oppWins + ' ' + s.other }),
        el('p', { class: 'game-sub', text: 'Retourne jouer une main ! Le combat est en plein écran.' }),
      ),
      el('button', {
        class: 'btn', text: 'Abandonner (défaite)',
        onClick: () => openModal({
          title: 'Abandonner le duel ?',
          build(b, close) {
            b.append(
              el('p', { class: 'game-sub', text: 'Tu perds le duel et ta mise.' }),
              el('div', { class: 'controls' },
                el('button', { class: 'btn btn-primary', text: 'Rester', onClick: close }),
                el('button', { class: 'btn', text: 'Abandonner', onClick: () => { Duel.forfeit(); close(); } }),
              ),
            );
          },
        }),
      }),
    );
  }

  return () => { alive = false; stop(); };
}
