/* ===========================================================
   Jeu 3 — Vidéo Poker (variante "Jacks or Better")
   On reçoit 5 cartes, on garde celles qu'on veut, on remplace
   les autres. Il faut au minimum une paire de valets pour gagner.
   =========================================================== */

/* Répliques de la croupière — plus charmeuse, un brin taquine. */
const PK_LINES = {
  open: [
    'Mise, puis je distribue, beau joueur.',
    'Alors, on tente sa chance avec moi ?',
    'Fais-moi rêver.',
  ],
  deal: [
    'Garde tes meilleures cartes.',
    'Choisis bien... je te regarde.',
    'Suspense. J\'adore.',
  ],
  allin: [
    'Tapis ? J\'aime les hommes qui osent.',
    'Tout miser pour moi ? C\'est presque touchant.',
  ],
  win: [
    '{hand} ! Tu m\'impressionnes.',
    '{hand}. Joli, vraiment joli.',
    '{hand} ! Reviens me voir, toi.',
  ],
  lose: [
    'Rien du tout. Dommage, mon chou.',
    'Même pas une paire ? Aïe.',
    'La prochaine, je croise les doigts pour toi.',
    'C\'est mignon, cette obstination.',
  ],
};

Games.poker = {
  icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round">'
    + '<rect x="3" y="8" width="8" height="12" rx="1.6" transform="rotate(-20 7 14)" fill="rgba(255,255,255,.06)"/>'
    + '<rect x="8" y="6" width="8" height="12" rx="1.6" transform="rotate(-5 12 12)" fill="rgba(255,255,255,.10)"/>'
    + '<rect x="13" y="7" width="8" height="12" rx="1.6" transform="rotate(12 17 13)" fill="rgba(255,255,255,.06)"/>'
    + '<path d="M17 10.4l1.4 2.4h-2.8z" fill="currentColor" stroke="none" transform="rotate(12 17 13)"/></svg>',
  name: 'Poker',

  render(root) {
    const body = gameShell(root, 'Vidéo Poker',
      'Garde tes meilleures cartes, remplace les autres. Paire de valets minimum.');

    let bet = 10;
    let stake = 0;
    let deck = [];
    let hand = [];
    let held = [false, false, false, false, false];
    let phase = 'idle';   // idle | draw | done
    let alive = true;

    const PAYS = [
      ['royal', 'Quinte flush royale', 250],
      ['sflush', 'Quinte flush', 50],
      ['four', 'Carré', 25],
      ['full', 'Full', 9],
      ['flush', 'Couleur', 6],
      ['straight', 'Quinte', 4],
      ['three', 'Brelan', 3],
      ['twopair', 'Deux paires', 2],
      ['jacks', 'Valets ou mieux', 1],
    ];
    const NAME = Object.fromEntries(PAYS.map(([k, n]) => [k, n]));
    const MULT = Object.fromEntries(PAYS.map(([k, , m]) => [k, m]));

    const handRow = el('div', { class: 'hand-row' });
    const holdRow = el('div', { class: 'hold-row' });
    const banner = el('div', { class: 'banner' });
    const controls = el('div', { class: 'controls' });
    const croupier = createCroupier({ variant: 'lady' });

    const canEditBet = () => phase === 'idle' || phase === 'done';
    const betWrap = betBar(() => bet, v => { if (canEditBet()) bet = v; }, { onChange: renderControls });

    // tableau des gains, avec des mini-cartes qui montrent la main aux débutants
    const ILLUS = {
      royal:    [['A', '♠'], ['K', '♠'], ['Q', '♠'], ['J', '♠'], ['10', '♠']],
      sflush:   [['9', '♥'], ['8', '♥'], ['7', '♥'], ['6', '♥'], ['5', '♥']],
      four:     [['K', '♠'], ['K', '♥'], ['K', '♦'], ['K', '♣'], '|', ['4', '♠', true]],
      full:     [['Q', '♠'], ['Q', '♥'], ['Q', '♦'], '|', ['K', '♣'], ['K', '♠']],
      flush:    [['A', '♦'], ['J', '♦'], ['8', '♦'], ['5', '♦'], ['3', '♦']],
      straight: [['9', '♣'], ['8', '♥'], ['7', '♠'], ['6', '♦'], ['5', '♣']],
      three:    [['7', '♠'], ['7', '♥'], ['7', '♦'], '|', ['K', '♣', true], ['2', '♠', true]],
      twopair:  [['A', '♠'], ['A', '♥'], '|', ['8', '♣'], ['8', '♦'], '|', ['3', '♠', true]],
      jacks:    [['J', '♠'], ['J', '♥'], '|', ['9', '♣', true], ['5', '♦', true], ['2', '♠', true]],
    };
    function miniHand(key) {
      const wrap = el('div', { class: 'pg-mini' });
      (ILLUS[key] || []).forEach(item => {
        if (item === '|') { wrap.append(el('span', { class: 'mini-sep' })); return; }
        const [r, s, dim] = item;
        const red = s === '♥' || s === '♦';
        wrap.append(el('span', {
          class: 'mini-card' + (red ? ' mini-red' : '') + (dim ? ' mini-dim' : ''),
        }, el('i', { text: r }), el('u', { text: s })));
      });
      return wrap;
    }
    const table = el('div', { class: 'paytable-grid' },
      el('div', { class: 'paytable-grid-title', text: 'Gains (× la mise)' }),
      ...PAYS.map(([key, name, mult]) =>
        el('div', { class: 'pg-row' },
          el('span', { class: 'pg-name', text: name }),
          miniHand(key),
          el('b', { text: '×' + mult }))),
    );

    body.append(betWrap, croupier.el, handRow, holdRow, banner, controls, table);
    renderHand();
    renderControls();
    croupier.line('launch');

    function leave() {
      alive = false;
      if (phase === 'draw') { Bank.payout(stake); Bank.endRound(); }
    }
    Games.poker.leave = leave;

    function renderHand() {
      clear(handRow);
      clear(holdRow);
      hand.forEach((card, i) => {
        const node = Cards.cardEl(card);
        if (phase === 'draw') {
          node.classList.add('clickable');
          if (held[i]) node.classList.add('is-held');
          node.addEventListener('click', () => { held[i] = !held[i]; renderHand(); });
        }
        handRow.append(node);
        holdRow.append(el('div', {
          class: 'hold-tag',
          text: phase === 'draw' && held[i] ? 'Gardée' : '',
        }));
      });
    }

    function renderControls() {
      clear(controls);
      if (phase === 'idle' || phase === 'done') {
        controls.append(el('button', { class: 'btn btn-primary', text: 'Distribuer', onClick: deal }));
      } else {
        controls.append(el('button', { class: 'btn btn-primary', text: 'Tirer', onClick: drawCards }));
      }
    }

    function deal() {
      betWrap.syncAuto();
      stake = Bank.stake(bet);
      if (!stake) return;
      deck = Cards.shuffle(Cards.freshDeck());
      hand = [deck.pop(), deck.pop(), deck.pop(), deck.pop(), deck.pop()];
      held = [false, false, false, false, false];
      Sound.deal(5);
      phase = 'draw';
      banner.textContent = '';
      banner.className = 'banner';
      renderHand();
      renderControls();
      croupier.line('play');
    }

    function drawCards() {
      const replaced = held.filter(h => !h).length;
      hand = hand.map((card, i) => (held[i] ? card : deck.pop()));
      if (replaced) Sound.deal(replaced);
      phase = 'done';

      const cat = evaluate(hand);
      const gain = cat ? stake * (MULT[cat] + 1) : 0;
      Bank.payout(gain);

      renderHand();
      if (cat) {
        banner.textContent = `${NAME[cat]} ! +${gain} crédits.`;
        banner.className = 'banner banner-win';
        croupier.line('win');
        try { if (window.Bonus) Bonus.arNote('poker'); } catch (e) {}
      } else {
        banner.textContent = 'Rien cette fois. Perdu.';
        banner.className = 'banner banner-lose';
        croupier.line('lose');
      }
      Activity.log({
        game: 'Vidéo Poker',
        detail: cat ? NAME[cat] : 'Rien',
        bet: stake,
        gain: Math.round((cat ? gain : 0) - stake),
      });
      Bank.endRound();
      betWrap.syncAuto();
      renderControls();
    }

    function evaluate(cards) {
      const order = { A: 14, K: 13, Q: 12, J: 11, '10': 10, '9': 9, '8': 8, '7': 7, '6': 6, '5': 5, '4': 4, '3': 3, '2': 2 };
      const vals = cards.map(c => order[c.rank]).sort((a, b) => a - b);
      const suits = cards.map(c => c.suit);

      const flush = suits.every(s => s === suits[0]);
      const distinct = [...new Set(vals)];
      let straight = distinct.length === 5 && vals[4] - vals[0] === 4;
      if (distinct.length === 5 && vals.join(',') === '2,3,4,5,14') straight = true;

      const counts = {};
      vals.forEach(v => { counts[v] = (counts[v] || 0) + 1; });
      const groups = Object.entries(counts).sort((a, b) => b[1] - a[1]);
      const topVal = Number(groups[0][0]);
      const topCount = groups[0][1];
      const secondCount = groups[1] ? groups[1][1] : 0;

      if (straight && flush && vals[0] === 10) return 'royal';
      if (straight && flush) return 'sflush';
      if (topCount === 4) return 'four';
      if (topCount === 3 && secondCount === 2) return 'full';
      if (flush) return 'flush';
      if (straight) return 'straight';
      if (topCount === 3) return 'three';
      if (topCount === 2 && secondCount === 2) return 'twopair';
      if (topCount === 2 && topVal >= 11) return 'jacks';
      return null;
    }
  },
};
