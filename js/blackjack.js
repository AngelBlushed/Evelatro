/* ===========================================================
   Jeu 1 — Blackjack
   S'approcher de 21 sans dépasser. Le croupier tire jusqu'à 17.
   Blackjack (21 en 2 cartes) paie 3:2. Double et Split possibles.
   =========================================================== */

const BJ_LINES = {
  open: [
    'Place ta mise. Le tapis est à toi.',
    'Assieds-toi. On va bien rigoler.',
    'Tes jetons me font de l\'oeil.',
  ],
  deal: [
    'À toi de jouer.',
    'Montre-moi ce que tu vaux.',
    'Les jeux sont faits.',
    'Concentre-toi, pour une fois.',
  ],
  hit: [
    'Encore une ?',
    'Gourmande.',
    'Tu pousses ta chance...',
    'Courage ou inconscience ?',
  ],
  bust: [
    'Aïe... ça déborde.',
    'Trop gourmande. Perdu.',
    'Magnifique. Tu t\'es sabordée toute seule.',
    'Un enfant se serait arrêté à 16.',
    'C\'est presque impressionnant de rater ça.',
  ],
  win: [
    'Tu rafles la mise. Bien joué.',
    'Beau coup, sincèrement.',
    'La chance des débutants, sûrement.',
    'Profites-en, ça ne durera pas.',
  ],
  blackjack: [
    'Blackjack ! Chapeau.',
    '21 pile. Impressionnant.',
    'Bon, ne prends pas la grosse tête.',
  ],
  push: [
    'Égalité. On remet ça.',
    'Personne ne gagne. Frustrant, non ?',
  ],
  lose: [
    'La maison l\'emporte.',
    'Perdu. Encore.',
    'C\'est presque un talent, de perdre comme ça.',
    'Tu tiens vraiment à me donner tous tes jetons ?',
    'La malchance te colle à la peau, on dirait.',
  ],
  split: [
    'On sépare. Deux fois plus de chances de te planter.',
    'Deux mains. Deux occasions de pleurer.',
  ],
  allin: [
    'Tout ce qu\'il te reste. Courageux. Ou désespéré.',
    'Tapis. J\'adore quand ça sent la panique.',
  ],
};

Games.blackjack = {
  icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round">'
    + '<rect x="6.5" y="4" width="11" height="15" rx="2" transform="rotate(-9 12 11.5)" fill="rgba(255,255,255,.06)"/>'
    + '<rect x="7.5" y="6" width="11" height="15" rx="2" transform="rotate(7 13 13.5)" fill="rgba(255,255,255,.10)"/>'
    + '<path d="M13 10.5c-1.4 1.6-2.6 2.5-2.6 3.9a2 2 0 0 0 4 0c0-1.4-1.2-2.3-2.6-3.9z" fill="currentColor" stroke="none"/>'
    + '<path d="M12.4 17.2h1.2" /></svg>',
  name: 'Blackjack',

  render(root) {
    const body = gameShell(root, 'Blackjack',
      "Approche-toi de 21 sans dépasser. Le croupier tire jusqu'à 17. Blackjack paie 3:2.");

    let hands = [];        // [{ cards:[], stake, done }]
    let active = 0;
    let dealer = [];
    let deck = [];
    let bet = 10;
    let splitAces = false;
    let phase = 'idle';   // idle | player | done
    let alive = true;

    const dealerLabel = el('div', { class: 'hand-label', text: 'Croupier' });
    const dealerRow = el('div', { class: 'hand-row' });
    const handsWrap = el('div', { class: 'bj-hands' });
    const banner = el('div', { class: 'banner' });
    const controls = el('div', { class: 'controls' });
    const croupier = createCroupier();

    const canEditBet = () => phase === 'idle' || phase === 'done';
    const betWrap = betBar(() => bet, v => { if (canEditBet()) bet = v; }, { onChange: renderControls });

    body.append(
      betWrap,
      el('div', {}, dealerLabel, dealerRow),
      handsWrap,
      croupier.el,
      banner,
      controls,
    );

    // --- règles ---
    function value(cards) {
      let total = 0, aces = 0;
      for (const c of cards) {
        if (c.rank === 'A') { total += 11; aces++; }
        else if (c.rank === 'K' || c.rank === 'Q' || c.rank === 'J' || c.rank === '10') total += 10;
        else total += Number(c.rank);
      }
      while (total > 21 && aces > 0) { total -= 10; aces--; }
      return total;
    }
    const isNaturalHand = h => hands.length === 1 && h.cards.length === 2 && value(h.cards) === 21;

    function paint(revealDealer) {
      clear(dealerRow);
      dealer.forEach((c, i) => dealerRow.append(Cards.cardEl(c, !revealDealer && i === 0)));
      dealerLabel.textContent = revealDealer && dealer.length ? `Croupier — ${value(dealer)}` : 'Croupier';

      clear(handsWrap);
      hands.forEach((h, i) => {
        const row = el('div', { class: 'hand-row' });
        h.cards.forEach(c => row.append(Cards.cardEl(c)));
        const label = el('div', { class: 'hand-label' },
          (hands.length > 1 ? `Main ${i + 1} — ` : 'Toi — ') + value(h.cards) +
          (h.result ? `  (${h.result})` : ''));
        const block = el('div', {
          class: 'bj-hand' + (phase === 'player' && i === active ? ' is-active' : ''),
        }, label, row);
        handsWrap.append(block);
      });
    }

    function renderControls() {
      clear(controls);
      if (phase === 'idle' || phase === 'done') {
        controls.append(el('button', {
          class: 'btn btn-primary',
          text: phase === 'done' ? 'Nouvelle main' : 'Distribuer',
          onClick: start,
        }));
        return;
      }

      const h = hands[active];
      controls.append(
        el('button', { class: 'btn', text: 'Tirer', onClick: hit }),
        el('button', { class: 'btn', text: 'Rester', onClick: stand }),
      );
      if (h.cards.length === 2 && Bank.balance() >= h.stake) {
        controls.append(el('button', { class: 'btn', text: 'Doubler', onClick: double }));
      }
      if (hands.length === 1 && h.cards.length === 2
          && h.cards[0].rank === h.cards[1].rank
          && Bank.balance() >= h.stake) {
        controls.append(el('button', { class: 'btn', text: 'Séparer', onClick: split }));
      }
    }

    // --- déroulé ---
    function start() {
      betWrap.syncAuto();
      const s = Bank.stake(bet);
      if (!s) { renderControls(); return; }
      deck = Cards.shuffle(Cards.freshDeck());
      hands = [{ cards: [deck.pop(), deck.pop()], stake: s, done: false, result: null }];
      dealer = [deck.pop(), deck.pop()];
      active = 0;
      splitAces = false;
      phase = 'player';
      banner.textContent = '';
      banner.className = 'banner';
      Sound.deal(3);
      paint(false);
      renderControls();

      if (value(hands[0].cards) === 21) finishRound();
      else if (s < bet) croupier.line('play');
      else croupier.line('play');
    }

    function hit() {
      hands[active].cards.push(deck.pop());
      Sound.card();
      paint(false);
      if (value(hands[active].cards) > 21) nextHand();
      else { renderControls(); croupier.line('play'); }
    }

    function stand() { nextHand(); }

    function double() {
      const h = hands[active];
      const extra = Bank.stake(h.stake);
      h.stake += extra;
      h.cards.push(deck.pop());
      Sound.card();
      paint(false);
      nextHand();
    }

    function split() {
      const h = hands[0];
      const extra = Bank.stake(h.stake);
      const second = { cards: [h.cards.pop()], stake: extra, done: false, result: null };
      splitAces = h.cards[0].rank === 'A';
      h.cards.push(deck.pop());
      second.cards.push(deck.pop());
      hands = [h, second];
      active = 0;
      Sound.deal(2);
      croupier.line('play');
      paint(false);

      if (splitAces) {                       // As séparés : une carte chacun, puis on arrête
        finishRound();
      } else {
        renderControls();
      }
    }

    function nextHand() {
      hands[active].done = true;
      if (active < hands.length - 1) {
        active++;
        paint(false);
        renderControls();
        croupier.say(`Main ${active + 1}.`);
      } else {
        finishRound();
      }
    }

    function finishRound() {
      phase = 'done';
      const anyAlive = hands.some(h => value(h.cards) <= 21) && !hands.every(isNaturalHand);
      if (anyAlive) {
        while (value(dealer) < 17) dealer.push(deck.pop());
      }

      const d = value(dealer);
      const dealerNat = dealer.length === 2 && d === 21;
      let totalGain = 0;
      let wins = 0, losses = 0, pushes = 0;

      for (const h of hands) {
        const p = value(h.cards);
        const nat = isNaturalHand(h);
        if (p > 21) { h.result = 'perdu'; losses++; }
        else if (nat && !dealerNat) { h.result = 'blackjack'; totalGain += h.stake * 2.5; wins++; }
        else if (nat && dealerNat) { h.result = 'égalité'; totalGain += h.stake; pushes++; }
        else if (d > 21 || p > d) { h.result = 'gagné'; totalGain += h.stake * 2; wins++; }
        else if (p === d) { h.result = 'égalité'; totalGain += h.stake; pushes++; }
        else { h.result = 'perdu'; losses++; }
      }

      Bank.payout(totalGain);
      paint(true);

      let text, tone;
      if (hands.length > 1) {
        text = `${wins} gagnée(s), ${losses} perdue(s), ${pushes} nulle(s).`;
        tone = wins > losses ? 'win' : losses > wins ? 'lose' : 'push';
      } else {
        const r = hands[0].result;
        if (r === 'blackjack') { text = 'Blackjack ! 3:2.'; tone = 'win'; }
        else if (r === 'gagné') { text = `${value(hands[0].cards)} contre ${d} — gagné !`; tone = 'win'; }
        else if (r === 'égalité') { text = `Égalité — mise rendue.`; tone = 'push'; }
        else if (value(hands[0].cards) > 21) { text = 'Tu dépasses 21. Perdu.'; tone = 'lose'; }
        else { text = `${value(hands[0].cards)} contre ${d} — perdu.`; tone = 'lose'; }
      }

      banner.textContent = text;
      banner.className = 'banner banner-' + tone;
      croupier.line(tone === 'win' ? 'win' : tone === 'lose' ? 'lose' : 'play');
      try { if (tone === 'win' && window.Bonus) Bonus.arNote('bj'); } catch (e) {}

      const totalStake = hands.reduce((sum, h) => sum + h.stake, 0);
      Activity.log({
        game: 'Blackjack',
        detail: hands.length > 1
          ? `${wins} gagnée(s) / ${losses} perdue(s)`
          : (hands[0].result === 'blackjack' ? 'Blackjack'
             : value(hands[0].cards) > 21 ? `${value(hands[0].cards)} — sauté`
             : `${value(hands[0].cards)} contre ${d}`),
        bet: totalStake,
        gain: Math.round(totalGain - totalStake),
      });

      Bank.endRound();
      betWrap.syncAuto();
      renderControls();
    }

    function leave() {
      alive = false;
      if (phase === 'player') {
        hands.forEach(h => Bank.payout(h.stake));
        Bank.endRound();
      }
    }
    Games.blackjack.leave = leave;

    paint(true);
    renderControls();
    croupier.line('launch');
  },
};
