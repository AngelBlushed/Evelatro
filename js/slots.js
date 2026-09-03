/* ===========================================================
   Jeu 2 — Machines à sous
   Trois machines au choix, chacune sa direction artistique :
     1. Classique — fruits rétro, rouleaux qui défilent
     2. Néon      — arcade sombre, bandes qui glissent à la verticale
     3. Deluxe 3D — trois tambours cylindriques dessinés au canvas
   Le calcul des gains est le même pour les trois (voir makeSlot).
   =========================================================== */

Games.slots = {
  icon: '🎰',
  name: 'Machines',

  render(root) {
    const body = gameShell(root, 'Machines à sous',
      'Trois symboles identiques = jackpot. Change de machine avec les onglets.');

    let bet = 10;
    let stake = 0;
    let busy = false;
    let current = 0;
    let alive = true;

    const MACHINES = [machineClassique(), machineNeon(), machineDeluxe()];

    const subtabs = el('div', { class: 'subtabs' });
    MACHINES.forEach((m, i) => {
      m._tab = el('button', { class: 'subtab', text: m.name, onClick: () => switchTo(i) });
      subtabs.append(m._tab);
    });

    const screen = el('div', { class: 'slot-screen' });
    const banner = el('div', { class: 'banner' });
    const spinBtn = el('button', { class: 'btn btn-primary btn-jouer', text: 'Jouer', onClick: spin });
    const paytableBox = el('div');
    const betWrap = betBar(() => bet, v => { if (!busy) bet = v; }, { onChange: () => { refreshBtn(); syncReadouts(); } });

    // console intégrée à la borne : Mise · JOUER · Solde
    const miseOut = el('b', { class: 'sc-val' });
    const soldeOut = el('b', { class: 'sc-val' });
    const consoleEl = el('div', { class: 'slot-console' },
      el('div', { class: 'sc-box' }, el('span', { class: 'sc-lbl', text: 'Mise' }), miseOut),
      spinBtn,
      el('div', { class: 'sc-box' }, el('span', { class: 'sc-lbl', text: 'Solde' }), soldeOut),
    );
    const marqueeName = el('div', { class: 'slot-marquee-name' });
    const marquee = el('div', { class: 'slot-marquee' },
      el('div', { class: 'slot-marquee-brand' },
        el('span', { text: '7' }), el('span', { class: 'sm-seven', text: '7' }), el('span', { text: '7' })),
      marqueeName);
    const leverMount = el('div', { class: 'slot-lever-mount' });
    const lever = el('div', { class: 'slot-lever' }, el('span', { class: 'slot-lever-knob' }));
    const cabinet = el('div', { class: 'slot-cabinet' },
      leverMount, lever,
      marquee, screen, consoleEl,
      el('div', { class: 'slot-tray' }),
      el('div', { class: 'slot-base' },
        el('div', { class: 'slot-base-door' }),
        el('div', { class: 'slot-base-foot slot-base-foot--l' }),
        el('div', { class: 'slot-base-foot slot-base-foot--r' })));

    function syncReadouts() {
      miseOut.textContent = bet + ' cr.';
      try { soldeOut.textContent = Bank.balance() + ' cr.'; } catch (e) { /* rien */ }
    }
    try { Bank.onChange(syncReadouts); } catch (e) { /* rien */ }

    // --- Auto-reroll (bonus boutique) ---
    const arRow = el('div', { class: 'ar-row' });
    const arBtn = el('button', { class: 'ar-btn', type: 'button' });
    const arTimer = el('span', { class: 'ar-timer' });
    const arCount = el('span', { class: 'ar-count' });   // progression toujours visible
    const arTip = el('div', { class: 'ar-tip', hidden: true });
    arRow.append(arBtn, arTimer, arCount, arTip);
    arBtn.addEventListener('click', onArClick);
    arBtn.addEventListener('mouseenter', () => { renderAR(); if (arTip.textContent) arTip.hidden = false; });
    arBtn.addEventListener('mouseleave', () => { arTip.hidden = true; });

    body.append(subtabs, cabinet, banner, betWrap, arRow, paytableBox);
    const offBonus = Bonus.onChange(renderAR);
    const arTick = setInterval(renderAR, 1000);
    switchTo(0);
    renderAR();
    syncReadouts();

    // mode combat "EveFight!" : la machine est imposée, on cache les onglets
    try {
      const ds = window.Duel && Duel.state();
      if (ds && ds.active && ds.status === 'accepted' && ds.game === 'slots') {
        switchTo(Math.max(0, Math.min(2, ds.slotMachine || 0)));
        subtabs.hidden = true;
      }
    } catch (e) { /* rien */ }

    function leave() {
      alive = false;
      clearInterval(arTick);
      if (offBonus) offBonus();
      if (busy) { Bank.payout(stake); busy = false; }   // tour en cours : on rend la mise
    }
    Games.slots.leave = leave;

    const fmtCr = n => Number(n || 0).toLocaleString('fr-FR');
    function fmtLeft(ms) {
      const s = Math.max(0, Math.round(ms / 1000));
      return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
    }

    function renderAR() {
      try { renderARInner(); } catch (e) { /* jamais casser la page des machines */ }
    }
    function renderARInner() {
      if (!alive || !window.Bonus) return;
      const state = Bonus.arState();
      if (state === 'not-owned') { arRow.hidden = true; arTip.hidden = true; arCount.hidden = true; return; }
      arRow.hidden = false;
      arBtn.className = 'ar-btn';
      arBtn.removeAttribute('aria-disabled');
      arTimer.hidden = true;
      arCount.hidden = true;
      arTip.textContent = '';

      const p = Bonus.arProgress();
      const condTxt =
        `Conditions pour relancer : blackjacks gagnés ${p.bj}/${p.need} · pokers ${p.poker}/${p.need} · `
        + `roulettes gagnées (mise ≥ 500) ${p.roulette}/${p.need}. Puis ${fmtCr(Bonus.arRearmPrice())} cr.`;

      if (state === 'active') {
        arBtn.classList.add('is-on');
        arBtn.textContent = '⏸ Mettre en pause';
        arTimer.hidden = false;
        arTimer.textContent = fmtLeft(Bonus.arMsLeft());
        maybeAutoSpin();
      } else if (state === 'paused') {
        arBtn.classList.add('is-paused');
        arBtn.textContent = '▶ Reprendre l\'auto-reroll';
        arTimer.hidden = false;
        arTimer.textContent = fmtLeft(Bonus.arMsLeft()) + ' (pause)';
      } else if (state === 'free') {
        arBtn.classList.add('is-ready');
        arBtn.textContent = '▶ Lancer l\'auto-reroll (1re fois offerte)';
      } else if (state === 'ready') {
        arBtn.classList.add('is-ready');
        arBtn.textContent = `▶ Relancer l'auto-reroll — ${fmtCr(Bonus.arRearmPrice())} cr`;
      } else { // locked
        arBtn.classList.add('is-locked');
        arBtn.setAttribute('aria-disabled', 'true');
        arBtn.textContent = '🔁 Auto-reroll — verrouillé';
        arCount.hidden = false;
        arCount.textContent = `BJ ${p.bj}/${p.need} · PK ${p.poker}/${p.need} · RL ${p.roulette}/${p.need}`;
        arTip.textContent = condTxt;
      }
    }

    function onArClick() {
      const state = Bonus.arState();
      if (state === 'locked') { renderAR(); arTip.hidden = false; return; }
      if (state === 'ready') {
        openModal({
          title: 'Auto-reroll',
          build(box, close) {
            box.append(el('p', { class: 'ar-modal-p', text:
              `Relancer l'auto-reroll pour ${fmtCr(Bonus.arRearmPrice())} cr ?` }));
            box.append(el('div', { class: 'ar-modal-actions' },
              el('button', { class: 'btn btn-primary', text: 'Confirmer', onClick: () => {
                const r = Bonus.arPayAndStart();
                close();
                if (r.ok) kickLoop();
                else if (r.reason === 'poor') banner.textContent = 'Pas assez de crédits.';
              } }),
              el('button', { class: 'btn btn-mini', text: 'Annuler', onClick: close }),
            ));
          },
        });
        return;
      }
      // 'active' -> pause · 'paused' -> reprise · 'free' -> démarre
      const r = Bonus.arToggle();
      renderAR();
      if (r.ok && (r.started || r.resumed)) kickLoop();
    }

    let autoPending = false;
    function kickLoop() { autoPending = false; maybeAutoSpin(); }
    function maybeAutoSpin() {
      if (autoPending || !alive || busy || !Bonus.arActive()) return;
      autoPending = true;
      setTimeout(() => {
        autoPending = false;
        if (alive && !busy && Bonus.arActive()) spin();
      }, 1100);
    }

    function switchTo(i) {
      if (busy) return;
      current = i;
      MACHINES.forEach((m, k) => m._tab.classList.toggle('is-active', k === i));
      clear(screen);
      clear(paytableBox);
      const m = MACHINES[i];
      cabinet.dataset.machine = String(i);
      marqueeName.textContent = m.name;
      m.mount(screen);
      paytableBox.append(m.paytable());
      banner.textContent = m.tagline;
      banner.className = 'banner';
      refreshBtn();
    }

    function refreshBtn() {
      spinBtn.disabled = busy;
      spinBtn.textContent = busy ? '…' : 'Jouer';
    }

    function spin() {
      if (busy) return;
      betWrap.syncAuto();
      stake = Bank.stake(bet);
      if (!stake) return;
      busy = true;
      cabinet.classList.add('is-pulled');
      setTimeout(() => cabinet.classList.remove('is-pulled'), 480);
      refreshBtn();
      // on NE vide PAS la bannière ici -> pas de saut de mise en page pendant le tour
      banner.textContent = 'Ça tourne…';
      banner.className = 'banner banner-push';
      const m = MACHINES[current];
      if (m.sound) { try { m.sound(); } catch (e) { /* pas de son */ } }
      const result = m.roll();
      m.animateTo(result, () => settle(m, result));
    }

    function settle(m, reels) {
      if (!alive) return;                 // on a changé d'onglet pendant l'animation
      const { mult, label } = m.evaluate(reels);
      const gain = stake * mult;
      Bank.payout(gain);
      if (mult > 0) { try { Sound.coins(); } catch (e) { /* pas de son */ } }
      banner.textContent = mult > 0
        ? `${label} — +${gain} crédits.`
        : `${label}.${stake < bet ? ` (misé : ${stake})` : ''}`;
      banner.className = 'banner banner-' + (mult > 1 ? 'win' : mult === 1 ? 'push' : 'lose');
      Activity.log({
        game: 'Machine ' + m.name,
        detail: label,
        bet: stake,
        gain: Math.round(gain - stake),
      });
      busy = false;
      Bank.endRound();
      betWrap.syncAuto();
      refreshBtn();

      // Bonus "auto-reroll" : la machine relance toute seule avec la mise.
      if (alive && window.Bonus && Bonus.arActive()) maybeAutoSpin();
      renderAR();
    }
  },
};


/* -----------------------------------------------------------
   Base commune : tirage pondéré, gains, tableau des gains.
   symbols : [{ g:'🍒', weight:24, three:5 }]   (g = symbole affiché)
   special : le symbole "bonus" qui paie aussi à 1 ou 2 exemplaires
   ----------------------------------------------------------- */
function makeSlot(spec) {
  const bag = spec.symbols.flatMap(s => Array(s.weight).fill(s));
  const pick = () => bag[Math.floor(Math.random() * bag.length)];

  function roll() { return [pick(), pick(), pick()]; }

  function evaluate(reels) {
    const [a, b, c] = reels;
    if (a === b && b === c) return { mult: a.three, label: `${a.g} ${a.g} ${a.g}` };
    if (spec.special) {
      const n = reels.filter(x => x === spec.special).length;
      if (n === 2) return { mult: 2, label: `Deux ${spec.special.g}` };
      if (n === 1) return { mult: 1, label: `Un ${spec.special.g} — mise rendue` };
    }
    return { mult: 0, label: 'Pas de combinaison' };
  }

  function paytable() {
    const rows = spec.symbols.slice().sort((x, y) => y.three - x.three).map(s =>
      el('tr', {}, el('td', { text: `${s.g} ${s.g} ${s.g}` }), el('td', { text: '×' + s.three })));
    const t = el('table', { class: 'paytable' }, el('caption', { text: 'Gains (× la mise)' }), ...rows);
    if (spec.special) {
      t.append(el('tr', {}, el('td', { text: `${spec.special.g} ${spec.special.g}` }), el('td', { text: '×2' })));
      t.append(el('tr', {}, el('td', { text: `${spec.special.g}` }), el('td', { text: '×1' })));
    }
    return t;
  }

  return {
    name: spec.name,
    tagline: spec.tagline,
    symbols: spec.symbols,
    pick, roll, evaluate, paytable,
    mount: spec.mount,
    animateTo: spec.animateTo,
    sound: spec.sound,
  };
}


/* -----------------------------------------------------------
   Machine 1 — Classique (fruits rétro)
   ----------------------------------------------------------- */
function machineClassique() {
  const S = [
    { g: '🍒', weight: 24, three: 5 },
    { g: '🔔', weight: 20, three: 8 },
    { g: '🍇', weight: 14, three: 12 },
    { g: '⭐', weight: 9, three: 20 },
    { g: '💎', weight: 5, three: 40 },
    { g: '7', seven: true, weight: 3, three: 100 },
  ];
  const self = makeSlot({
    name: 'Classique',
    tagline: 'Fruits rétro. Les 🍒 paient même à l\'unité.',
    symbols: S,
    special: S[0],
    sound: () => Sound.slotClassic(),
    mount(container) {
      self._reels = [0, 1, 2].map(() => {
        const strip = el('div', { class: 'fr-strip' });
        const win = el('div', { class: 'fr-reel' }, strip);
        return { strip, win };
      });
      const box = el('div', { class: 'reels m-classic fruit-box' },
        ...self._reels.map(r => r.win));
      container.append(box);
      self._reels.forEach(r => {
        buildFruitStrip(r.strip, [self.pick(), self.pick(), self.pick()]);
        r.strip.style.transform = 'translateY(0)';
      });
    },
    animateTo(result, done) {
      self._reels.forEach((r, i) => {
        const n = 20 + i * 7;
        const cells = [];
        for (let k = 0; k < n; k++) cells.push(self.pick());
        cells.push(self.pick());     // rangée du haut
        cells.push(result[i]);       // rangée du milieu = ligne de gain
        cells.push(self.pick());     // rangée du bas
        buildFruitStrip(r.strip, cells);
        // hauteur de mise en page d'une case (offsetHeight ignore les transform: scale)
        const FCELL = r.strip.children[0].offsetHeight;
        const dist = (cells.length - 3) * FCELL;
        r.strip.style.transform = 'translateY(0)';
        const anim = r.strip.animate(
          [{ transform: 'translateY(0)' }, { transform: `translateY(-${dist}px)` }],
          { duration: 1200 + i * 420, easing: 'cubic-bezier(.15,.72,.18,1)' });
        anim.onfinish = () => {
          r.strip.style.transform = `translateY(-${dist}px)`;
          if (i === self._reels.length - 1) done();
        };
      });
    },
  });

  function buildFruitStrip(strip, cells) {
    clear(strip);
    cells.forEach(sym => strip.append(el('div', {
      class: 'fr-cell' + (sym.seven ? ' fr-seven' : ''),
      text: sym.g,
    })));
  }

  return self;
}


/* -----------------------------------------------------------
   Machine 2 — Néon (bandes verticales qui glissent)
   ----------------------------------------------------------- */
function machineNeon() {
  const S = [
    { g: '⚡', weight: 24, three: 5, tone: 'volt' },
    { g: '🔷', weight: 20, three: 8, tone: 'ice' },
    { g: '🌙', weight: 14, three: 12, tone: 'ice', big: true },
    { g: '🛸', weight: 9, three: 20, tone: 'volt', big: true },
    { g: '🎯', weight: 5, three: 40, tone: 'volt', big: true },
    { g: '👾', weight: 3, three: 120, tone: 'ufo', jackpot: true },
  ];
  const self = makeSlot({
    name: 'Néon',
    tagline: 'Arcade de nuit. Le 👾 vaut le gros lot.',
    symbols: S,
    special: S[0],
    sound: () => Sound.slotNeon(),
    mount(container) {
      self._strips = [0, 1, 2].map(() => {
        const strip = el('div', { class: 'reel-strip' });
        const win = el('div', { class: 'reel-neon' }, strip);
        return { strip, win };
      });
      const box = el('div', { class: 'reels-neon m-neon' }, ...self._strips.map(s => s.win));
      container.append(box);
      self._strips.forEach(s => {
        s.strip.style.transform = 'translateY(0)';
        buildStrip(s.strip, [self.pick(), self.pick(), self.pick()]);
      });
    },
    animateTo(result, done) {
      self._strips.forEach((s, i) => {
        const cells = [];
        const n = 22 + i * 6;
        for (let k = 0; k < n; k++) cells.push(self.pick());
        cells.push(self.pick());   // rangée du haut
        cells.push(result[i]);     // rangée du milieu = ligne de gain
        cells.push(self.pick());   // rangée du bas
        buildStrip(s.strip, cells);
        // offsetHeight ignore les transform: scale des .ncell-big / .ncell-jackpot
        const CELL = s.strip.children[0].offsetHeight;
        const dist = (cells.length - 3) * CELL;
        s.strip.style.transform = 'translateY(0)';
        const anim = s.strip.animate(
          [{ transform: 'translateY(0)' }, { transform: `translateY(-${dist}px)` }],
          { duration: 1100 + i * 380, easing: 'cubic-bezier(.16,.7,.2,1)' });
        anim.onfinish = () => {
          s.strip.style.transform = `translateY(-${dist}px)`;
          if (i === self._strips.length - 1) done();
        };
      });
    },
  });

  function buildStrip(strip, cells) {
    clear(strip);
    cells.forEach(sym => strip.append(el('div', {
      class: 'ncell ncell-' + (sym.tone || 'volt')
        + (sym.jackpot ? ' ncell-jackpot' : sym.big ? ' ncell-big' : ''),
      text: sym.g,
    })));
  }

  return self;
}


/* -----------------------------------------------------------
   Machine 3 — Deluxe 3D (tambours cylindriques au canvas)
   ----------------------------------------------------------- */
function machineDeluxe() {
  const S = [
    { g: '🍀', weight: 24, three: 5 },
    { g: '🔔', weight: 20, three: 8 },
    { g: '⭐', weight: 14, three: 14, shine: true },
    { g: '💰', weight: 9, three: 25, shine: true },
    { g: '💎', weight: 5, three: 60, shine: true },
    { g: '👑', weight: 3, three: 150, jackpot: true },
  ];
  const self = makeSlot({
    name: 'Deluxe 3D',
    tagline: 'Trois tambours dorés. La 👑 est reine.',
    symbols: S,
    special: S[0],
    sound: () => Sound.slotDeluxe(),
    mount(container) {
      const canvas = el('canvas', { class: 'slot-canvas m-deluxe' });
      container.append(canvas);
      self._drums = createDrums(canvas, S);
    },
    animateTo(result, done) {
      self._drums.spinTo(result, done);
    },
  });
  return self;
}


/* Les tambours 3D : chaque rouleau est un cylindre vertical. Les
   symboles sont répartis autour ; ils grossissent au centre (avant)
   et s'effacent en haut/bas (arrière) -> impression de relief. */
function createDrums(canvas, symbols) {
  const ctx = canvas.getContext('2d');
  // le canvas est dimensionné par le CSS (même hauteur que classique/néon)
  const W = Math.max(240, Math.round(canvas.clientWidth || 372));
  const H = Math.max(120, Math.round(canvas.clientHeight || 176));
  const SC = H / 176;                           // échelle des tailles fixes
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  ctx.scale(dpr, dpr);

  const K = symbols.length * 2;                 // positions autour du tambour
  const wheel = [...symbols, ...symbols];       // (chaque symbole deux fois)
  const STEP = (Math.PI * 2) / K;
  const reelW = Math.min(H * 0.62, (W - 24) / 3.4);
  const gap = (W - reelW * 3) / 4;
  const centers = [0, 1, 2].map(i => gap + reelW / 2 + i * (reelW + gap));
  const cy = H / 2;
  const R = H * 0.62;                           // rayon vertical du cylindre

  const reels = centers.map(() => ({ theta: Math.random() * Math.PI * 2, target: null, spin: null }));
  let running = false;

  const easeOut = t => 1 - Math.pow(1 - t, 3);

  function spinTo(result, done) {
    const now = performance.now();
    reels.forEach((reel, i) => {
      const idx = wheel.indexOf(result[i]);     // symbole visé (1re occurrence)
      const desired = -idx * STEP;              // theta pour l'amener plein centre
      const from = reel.theta;
      let to = from + Math.PI * 2 * (5 + i);    // plusieurs tours
      to += norm(desired - to);
      reel.spin = { from, to, t0: now + i * 260, dur: 1500 + i * 450, done: false };
    });
    reels[reels.length - 1].spin.onEnd = done;
    if (!running) { running = true; requestAnimationFrame(frame); }
  }

  function norm(a) {
    while (a <= -Math.PI) a += Math.PI * 2;
    while (a > Math.PI) a -= Math.PI * 2;
    return a;
  }

  function update(now) {
    let anyActive = false;
    for (const reel of reels) {
      const s = reel.spin;
      if (!s) continue;
      const t = Math.max(0, Math.min(1, (now - s.t0) / s.dur));
      reel.theta = s.from + (s.to - s.from) * easeOut(t);
      if (t < 1) anyActive = true;
      else if (!s.done) {
        s.done = true;
        reel.theta = s.to;
        if (s.onEnd) s.onEnd();
      }
    }
    if (!anyActive && reels.every(r => !r.spin || r.spin.done)) {
      reels.forEach(r => { r.spin = null; });
      running = false;
    }
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);
    reels.forEach((reel, i) => {
      const cx = centers[i];

      // corps du tambour (dégradé doré + biseaux)
      const grad = ctx.createLinearGradient(cx - reelW / 2, 0, cx + reelW / 2, 0);
      grad.addColorStop(0, '#1c150a');
      grad.addColorStop(0.5, '#3a2f16');
      grad.addColorStop(1, '#1c150a');
      roundRect(cx - reelW / 2, 6 * SC, reelW, H - 12 * SC, 10 * SC);
      ctx.fillStyle = grad;
      ctx.fill();
      ctx.strokeStyle = '#c9a24b';
      ctx.lineWidth = 1.5 * SC;
      ctx.stroke();

      // symboles autour du cylindre, de l'arrière vers l'avant
      const idxs = [...Array(K).keys()].sort(
        (a, b) => Math.cos(reel.theta + a * STEP) - Math.cos(reel.theta + b * STEP));
      for (const j of idxs) {
        const a = reel.theta + j * STEP;
        const front = Math.cos(a);
        if (front <= 0.04) continue;                   // face cachée
        const y = cy - R * Math.sin(a);
        const sym = wheel[j];
        ctx.save();
        ctx.globalAlpha = Math.min(1, front * 1.2);
        // halo doré : discret pour tous, franc pour la couronne
        if (front > 0.42) {
          ctx.shadowColor = sym.jackpot
            ? `rgba(255,224,140,${0.95 * front})`
            : sym.shine ? `rgba(255,238,196,${0.55 * front})` : 'rgba(0,0,0,0)';
          ctx.shadowBlur = (sym.jackpot ? 24 : sym.shine ? 12 : 0) * front * SC;
        }
        ctx.font = `${Math.round((10 + 24 * front) * SC)}px "Segoe UI Emoji", sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(sym.g, cx, y);
        ctx.restore();
      }

      // ombres haut / bas pour "arrondir" le cylindre
      const shade = ctx.createLinearGradient(0, 6 * SC, 0, H - 6 * SC);
      shade.addColorStop(0, 'rgba(0,0,0,0.75)');
      shade.addColorStop(0.28, 'rgba(0,0,0,0)');
      shade.addColorStop(0.72, 'rgba(0,0,0,0)');
      shade.addColorStop(1, 'rgba(0,0,0,0.75)');
      roundRect(cx - reelW / 2, 6 * SC, reelW, H - 12 * SC, 10 * SC);
      ctx.fillStyle = shade;
      ctx.fill();
    });

    // ligne de gain au centre
    ctx.strokeStyle = 'rgba(226,180,88,0.6)';
    ctx.lineWidth = 1.5 * SC;
    ctx.beginPath();
    ctx.moveTo(6 * SC, cy);
    ctx.lineTo(W - 6 * SC, cy);
    ctx.stroke();
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function frame(now) {
    if (!canvas.isConnected) { running = false; return; }
    update(now);
    draw();
    if (running) requestAnimationFrame(frame);
  }

  draw();
  return { spinTo };
}
