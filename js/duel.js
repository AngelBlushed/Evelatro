/* ===========================================================
   Mode VS "EveFight!" — duel best-of-N entre deux joueurs.

   Le challenger choisit : l'adversaire, la mise (% du solde),
   LE JEU (blackjack / machines / poker / roulette) et le NOMBRE
   DE MANCHES (5, 10 ou 15).

   Déroulé d'une manche :
     - les deux joueurs jouent UNE action du jeu choisi
     - 20 s max par manche ; dépassement = disqualifié = défaite
     - le meilleur gain net remporte la manche
   Fin : celui qui a gagné le plus de manches gagne le duel.
   Le perdant paie sa mise, le gagnant reçoit celle de l'autre.

   Robustesse : chaque écriture est appliquée localement tout de
   suite (sans attendre le "temps réel"), et on relit le duel
   toutes les 3 s en secours. Le chrono est local (par client).
   =========================================================== */

const Duel = (() => {
  let duel = null;
  let mine = false;
  let subOff = null;
  let settledId = 0;
  let ticker = null;
  let iDeclaredDQ = false;
  let resolving = false;
  let bothSince = 0;
  let localRoundStart = 0;      // Date.now() du début de la manche vue par CE client
  let localRoundNo = 0;
  let pollN = 0;
  let killedId = 0;             // duel qu'on a abandonné localement -> on l'ignore

  const ROUND_SECONDS = 20;
  const STALE_MS = 4 * 60 * 1000;   // un duel "accepted" plus vieux que ça = mort
  const listeners = [];
  const emit = () => listeners.forEach(fn => { try { fn(); } catch (e) {} });

  const me = () => (window.Multiplayer && Multiplayer.user()) || null;

  const GAME_NAMES = { blackjack: 'Blackjack', slots: 'Machines à sous', poker: 'Vidéo Poker', roulette: 'Roulette' };

  function gameMatches(id, activityGame) {
    if (!activityGame) return false;
    if (id === 'blackjack') return activityGame === 'Blackjack';
    if (id === 'poker') return activityGame === 'Vidéo Poker';
    if (id === 'roulette') return activityGame === 'Roulette';
    if (id === 'slots') return /^Machine /.test(activityGame);
    return false;
  }

  function ageSeconds() {
    if (!localRoundStart) return 0;
    return (Date.now() - localRoundStart) / 1000;
  }
  function timeLeft() {
    if (!duel || duel.status !== 'accepted') return ROUND_SECONDS;
    return Math.max(0, Math.ceil(ROUND_SECONDS - ageSeconds()));
  }

  const myScoreCol = () => (mine ? 'chal_score' : 'opp_score');
  const oppScoreCol = () => (mine ? 'opp_score' : 'chal_score');
  const mySubmitted = () => duel && duel[myScoreCol()] != null;
  const oppSubmitted = () => duel && duel[oppScoreCol()] != null;

  function startTicker() { if (!ticker) ticker = setInterval(tick, 1000); }
  function stopTicker() { if (ticker) { clearInterval(ticker); ticker = null; } }

  // applique la ligne renvoyée par une écriture, tout de suite
  function apply(p) {
    Promise.resolve(p).then(r => { if (r && (!duel || r.id === duel.id)) setDuel(r); }).catch(() => {});
  }

  function tick() {
    if (!duel || duel.status !== 'accepted') { stopTicker(); return; }

    // secours "temps réel" : on relit le duel toutes les 3 s
    if ((++pollN % 3) === 0) {
      Multiplayer.getDuel(duel.id).then(r => { if (r && duel && r.id === duel.id) setDuel(r); }).catch(() => {});
    }

    const age = ageSeconds();
    const both = duel.chal_score != null && duel.opp_score != null;
    if (both && !bothSince) bothSince = Date.now();
    if (!both) bothSince = 0;

    const iAmActing = Date.now() < actingUntil;   // action en cours -> pas de DQ
    if (both && !resolving && (mine || Date.now() - bothSince > 6000)) {
      resolveRound();
    } else if (!both && !mySubmitted() && !iDeclaredDQ && !iAmActing && age > ROUND_SECONDS + 1) {
      declareDQ(true);
    } else if (!both && mySubmitted() && !oppSubmitted() && !iDeclaredDQ && age > ROUND_SECONDS + 12) {
      declareDQ(false);
    }

    emit();
  }

  function declareDQ(itsMe) {
    if (!duel || iDeclaredDQ) return;
    iDeclaredDQ = true;
    const winnerId = itsMe ? (mine ? duel.opponent_id : duel.challenger_id) : me().id;
    const loserIsChal = itsMe ? mine : !mine;
    apply(Multiplayer.updateDuel(duel.id, {
      status: 'done', winner_id: winnerId,
      [loserIsChal ? 'chal_dq' : 'opp_dq']: true,
    }));
  }

  function resolveRound() {
    if (resolving || !duel) return;
    resolving = true;
    bothSince = 0;
    try {
      const cs = Number(duel.chal_score), os = Number(duel.opp_score);
      const patch = { chal_score: null, opp_score: null };
      let chalW = duel.chal_rounds || 0;
      let oppW = duel.opp_rounds || 0;
      if (cs > os) chalW++;
      else if (os > cs) oppW++;
      patch.chal_rounds = chalW;
      patch.opp_rounds = oppW;

      const nextRound = (duel.round_no || 1) + 1;
      const target = duel.rounds_target || 5;
      const clinched = Math.max(chalW, oppW) > target / 2;
      const over = nextRound > target || clinched;

      if (over) {
        patch.status = 'done';
        patch.winner_id = chalW > oppW ? duel.challenger_id
                        : oppW > chalW ? duel.opponent_id : null;
      } else {
        patch.round_no = nextRound;
        patch.round_started_at = new Date().toISOString();
      }
      apply(Multiplayer.updateDuel(duel.id, patch));
    } finally {
      setTimeout(() => { resolving = false; }, 500);
    }
  }

  function submitRoundScore(gain) {
    if (!duel || duel.status !== 'accepted') return;
    if (mySubmitted()) return;
    if (iDeclaredDQ) return;
    const val = Number(gain);
    apply(Multiplayer.updateDuel(duel.id, { [myScoreCol()]: isFinite(val) ? val : 0 }));
  }

  function isStale(d) {
    if (!d || d.status !== 'accepted') return false;
    const ts = new Date(d.updated_at || d.created_at || 0).getTime();
    return isFinite(ts) && (Date.now() - ts > STALE_MS);
  }

  function setDuel(d) {
    if (d && d.id === killedId) return;                 // duel abandonné localement
    const wasActive = duel && duel.status === 'accepted';
    const prevRound = duel ? (duel.round_no || 1) : 0;

    // un vieux duel "accepted" oublié -> on le range et on n'y touche plus
    if (isStale(d)) {
      const id = d.id;
      killedId = id;
      duel = null; stopTicker(); emit();
      Multiplayer.updateDuel(id, { status: 'cancelled' }).catch(() => {});
      return;
    }

    duel = d;
    mine = d && me() && d.challenger_id === me().id;

    if (d && d.status === 'accepted') {
      // (re)cale l'horloge locale quand la manche change
      const rn = d.round_no || 1;
      if (rn !== localRoundNo || !localRoundStart) { localRoundNo = rn; localRoundStart = Date.now(); }

      // le challenger fixe sa mise dès que l'adversaire a accepté
      // (realBalance : pendant le combat Bank.balance() renvoie 1e9 !)
      if (mine && d.chal_stake == null) {
        const stake = Math.max(1, Math.floor(d.pct / 100 * Bank.realBalance()));
        apply(Multiplayer.updateDuel(d.id, { chal_stake: stake }));
      }
    }

    // règlement final
    if (d && d.status === 'done' && d.id !== settledId) {
      settledId = d.id;
      stopTicker();
      const other = mine ? d.opponent : d.challenger;
      const myStake = (mine ? d.chal_stake : d.opp_stake) || 0;
      const oppStake = (mine ? d.opp_stake : d.chal_stake) || 0;
      const iWon = me() && d.winner_id === me().id;
      const iLost = me() && d.winner_id && d.winner_id !== me().id;
      if (iWon) {
        if (oppStake > 0) Bank.duelWin(oppStake);
        Activity.log({ game: 'Duel VS', detail: 'Duel gagné contre ' + other, gain: oppStake });
      } else if (iLost) {
        const paid = myStake > 0 ? Bank.duelLoss(myStake) : 0;
        Activity.log({ game: 'Duel VS', detail: 'Duel perdu contre ' + other, gain: -paid });
      }
      setTimeout(() => { if (duel && duel.id === settledId) { duel = null; emit(); } }, 10000);
    }

    if (!wasActive && d && d.status === 'accepted') {
      iDeclaredDQ = false; resolving = false; bothSince = 0;
      localRoundNo = d.round_no || 1; localRoundStart = Date.now();
      startTicker();
    }
    if ((prevRound && d && (d.round_no || 1) > prevRound)) {
      iDeclaredDQ = false;   // nouvelle manche -> on peut rejouer
    }
    if (!d || (d.status !== 'accepted')) stopTicker();

    emit();
  }

  function sync() {
    const connected = window.Multiplayer && Multiplayer.isConnected();
    if (connected && !subOff) {
      subOff = Multiplayer.subscribeDuels((row) => {
        if (!row || !me()) return;
        if (row.challenger_id === me().id || row.opponent_id === me().id) {
          if (['pending', 'accepted', 'done'].includes(row.status)) setDuel(row);
          else if (duel && duel.id === row.id) { duel = null; stopTicker(); emit(); }
        }
      });
      Multiplayer.currentDuel().then(d => { if (d) setDuel(d); });
    } else if (!connected && subOff) {
      subOff(); subOff = null; duel = null; stopTicker(); emit();
    }
  }

  try {
    Activity.onLog((entry) => {
      if (!duel || duel.status !== 'accepted') return;
      if (entry.gain == null || entry.game === 'Duel VS') return;
      if (!gameMatches(duel.game, entry.game)) return;
      // score de la manche = combien on a multiplié sa mise (indépendant du montant)
      // -1 = tout perdu · 0 = nul · +1 = doublé · +35 = plein numéro à la roulette
      const bet = Math.abs(Number(entry.bet)) || 1;
      const ratio = (Number(entry.gain) || 0) / bet;
      submitRoundScore(ratio);
    });
  } catch (e) { /* rien */ }

  function versionMismatch() {
    if (!duel || mine) return false;
    const vn = window.verNum || (x => String(x || ''));
    const mineV = vn(window.APP_BUILD || '');
    const theirs = vn(duel.chal_version || '');
    return !!(mineV && theirs && mineV !== theirs);   // 1.1 vs 1.2, PAS PC vs Android
  }

  function accept() {
    if (!duel || duel.status !== 'pending' || mine) return;
    if (versionMismatch()) return;
    const stake = Math.max(1, Math.floor(duel.pct / 100 * Bank.realBalance()));
    localRoundStart = Date.now(); localRoundNo = 1;
    apply(Multiplayer.updateDuel(duel.id, {
      status: 'accepted', opp_stake: stake,
      round_no: 1, chal_score: null, opp_score: null,
      round_started_at: new Date().toISOString(),
    }));
  }
  function decline() {
    if (!duel || duel.status !== 'pending') return;
    const id = duel.id; duel = null; stopTicker(); emit();
    Multiplayer.updateDuel(id, { status: 'declined' }).catch(() => {});
  }
  function cancel() {
    if (!duel || duel.status !== 'pending' || !mine) return;
    const id = duel.id; duel = null; stopTicker(); emit();
    Multiplayer.updateDuel(id, { status: 'cancelled' }).catch(() => {});
  }

  // Abandon / sortie forcée : on quitte le duel LOCALEMENT quoi qu'il arrive,
  // et on prévient le serveur au mieux (l'autre gagne).
  function abandon() {
    if (!duel) return;
    const id = duel.id;
    const winnerId = mine ? duel.opponent_id : duel.challenger_id;
    const active = duel.status === 'accepted' || duel.status === 'pending';
    killedId = id;
    iDeclaredDQ = true;
    duel = null; stopTicker(); emit();
    if (active) {
      Multiplayer.updateDuel(id, {
        status: 'done', winner_id: winnerId,
        [mine ? 'chal_dq' : 'opp_dq']: true,
      }).catch(() => {});
    }
  }
  const forfeit = abandon;

  function state() {
    if (!duel) return { active: false };
    const other = mine ? duel.opponent : duel.challenger;
    const otherId = mine ? duel.opponent_id : duel.challenger_id;
    const target = duel.rounds_target || 5;
    const roundNo = duel.round_no || 1;
    const myWins = mine ? (duel.chal_rounds || 0) : (duel.opp_rounds || 0);
    const oppWins = mine ? (duel.opp_rounds || 0) : (duel.chal_rounds || 0);

    let otherAvatar = null;
    try {
      const info = Multiplayer.onlineInfo ? Multiplayer.onlineInfo()[otherId] : null;
      otherAvatar = info && info.avatar;
    } catch (e) { /* rien */ }

    return {
      active: true,
      status: duel.status,
      mine,
      pct: duel.pct,
      game: duel.game || 'blackjack',
      gameName: GAME_NAMES[duel.game] || 'Blackjack',
      slotMachine: (duel.slot_machine != null) ? Number(duel.slot_machine) : 0,
      roundsTarget: target,
      roundNo,
      roundsLeft: Math.max(0, target - (roundNo - 1)),
      myWins, oppWins,
      other, otherId, otherAvatar,
      secondsLeft: timeLeft(),
      mySubmitted: mySubmitted(),
      oppSubmitted: oppSubmitted(),
      waitingForOpp: mySubmitted() && !oppSubmitted(),
      myRoundTurn: duel.status === 'accepted' && !mySubmitted() && !iDeclaredDQ,
      winnerIsMe: duel.status === 'done' && me() && duel.winner_id === me().id,
      isDraw: duel.status === 'done' && !duel.winner_id,
      iWasDQ: (mine ? duel.chal_dq : duel.opp_dq) || false,
      oppWasDQ: (mine ? duel.opp_dq : duel.chal_dq) || false,
      incoming: duel.status === 'pending' && !mine,
      waitingAccept: duel.status === 'pending' && mine,
      incompatible: versionMismatch(),
      otherVersion: mine ? null : (duel.chal_version || null),
      myVersion: window.APP_BUILD || '',
    };
  }

  function onChange(fn) {
    listeners.push(fn);
    return () => { const i = listeners.indexOf(fn); if (i >= 0) listeners.splice(i, 1); };
  }

  // Est-on en plein combat ? (sert à la banque : crédits virtuels)
  function inFight() { return !!(duel && duel.status === 'accepted'); }

  // Un jeu vient de commencer une action -> on repousse la disqualification
  // le temps que le résultat tombe.
  let actingUntil = 0;
  function markActing() { if (inFight()) actingUntil = Date.now() + 14000; }

  return {
    sync, accept, decline, cancel, forfeit, abandon,
    state, onChange, timeLeft, inFight, markActing,
    raw: () => duel,
    GAME_NAMES,
  };
})();

window.Duel = Duel;
