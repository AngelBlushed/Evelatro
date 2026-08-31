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
    const spinBtn = el('button', { class: 'btn btn-primary', text: 'Lancer', onClick: spin });
    const controls = el('div', { class: 'controls' }, spinBtn);
    const paytableBox = el('div');
    const betWrap = betBar(() => bet, v => { if (!busy) bet = v; }, { onChange: refreshBtn });

    body.append(subtabs, screen, banner, betWrap, controls, paytableBox);
    switchTo(0);

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
      if (busy) { Bank.payout(stake); busy = false; }   // tour en cours : on rend la mise
    }
    Games.slots.leave = leave;

    function switchTo(i) {
      if (busy) return;
      current = i;
      MACHINES.forEach((m, k) => m._tab.classList.toggle('is-active', k === i));
      clear(screen);
      clear(paytableBox);
      const m = MACHINES[i];
      m.mount(screen);
      paytableBox.append(m.paytable());
      banner.textContent = m.tagline;
      banner.className = 'banner';
      refreshBtn();
    }

    function refreshBtn() {
      spinBtn.disabled = busy;
      spinBtn.textContent = busy ? '…' : 'Lancer';
    }

    function spin() {
      if (busy) return;
      betWrap.syncAuto();
      stake = Bank.stake(bet);
      if (!stake) return;
      busy = true;
      refreshBtn();
      banner.textContent = '';
      banner.className = 'banner';
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
      const refilled = Bank.endRound();
      betWrap.syncAuto();
      refreshBtn();

      // Bonus "auto-reset" : la machine se recharge et relance un tour toute seule.
      if (refilled && window.Bonus && Bonus.has('slots-autoreset') && alive) {
        setTimeout(() => { if (alive && !busy) spin(); }, 1100);
      }
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
    { g: '🍋', weight: 20, three: 8 },
    { g: '🔔', weight: 14, three: 12 },
    { g: '⭐', weight: 9, three: 20 },
    { g: '7️⃣', weight: 5, three: 40 },
    { g: '💎', weight: 3, three: 100 },
  ];
  const self = makeSlot({
    name: 'Classique',
    tagline: 'Fruits rétro. Les 🍒 paient même à l\'unité.',
    symbols: S,
    special: S[0],
    sound: () => Sound.slotClassic(),
    mount(container) {
      self._reels = [0, 1, 2].map(() => el('div', { class: 'reel' }));
      const box = el('div', { class: 'reels m-classic' }, ...self._reels);
      container.append(box);
      self._reels.forEach((r, i) => { r.textContent = S[i].g; });
    },
    animateTo(result, done) {
      let ticks = 0;
      const timer = setInterval(() => {
        self._reels.forEach(r => { r.textContent = self.pick().g; });
        if (++ticks >= 16) {
          clearInterval(timer);
          self._reels.forEach((r, i) => { r.textContent = result[i].g; });
          done();
        }
      }, 55);
    },
  });
  return self;
}


/* -----------------------------------------------------------
   Machine 2 — Néon (bandes verticales qui glissent)
   ----------------------------------------------------------- */
function machineNeon() {
  const S = [
    { g: '⚡', weight: 24, three: 5 },
    { g: '🔷', weight: 20, three: 8 },
    { g: '🌙', weight: 14, three: 12 },
    { g: '🛸', weight: 9, three: 20 },
    { g: '🎯', weight: 5, three: 40 },
    { g: '👾', weight: 3, three: 120 },
  ];
  const CELL = 62;
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
        cells.push(result[i]);                 // le symbole final est tout en bas
        buildStrip(s.strip, cells);
        const dist = (cells.length - 1) * CELL;
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
    cells.forEach(sym => strip.append(el('div', { class: 'ncell', text: sym.g })));
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
    { g: '⭐', weight: 14, three: 14 },
    { g: '💰', weight: 9, three: 25 },
    { g: '💎', weight: 5, three: 60 },
    { g: '👑', weight: 3, three: 150 },
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
  const W = 320, H = 150;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  canvas.style.width = W + 'px';
  canvas.style.height = H + 'px';
  ctx.scale(dpr, dpr);

  const K = symbols.length * 2;                 // positions autour du tambour
  const wheel = [...symbols, ...symbols];       // (chaque symbole deux fois)
  const STEP = (Math.PI * 2) / K;
  const reelW = 92;
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
      roundRect(cx - reelW / 2, 6, reelW, H - 12, 10);
      ctx.fillStyle = grad;
      ctx.fill();
      ctx.strokeStyle = '#c9a24b';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // symboles autour du cylindre, de l'arrière vers l'avant
      const idxs = [...Array(K).keys()].sort(
        (a, b) => Math.cos(reel.theta + a * STEP) - Math.cos(reel.theta + b * STEP));
      for (const j of idxs) {
        const a = reel.theta + j * STEP;
        const front = Math.cos(a);
        if (front <= 0.04) continue;                   // face cachée
        const y = cy - R * Math.sin(a);
        ctx.save();
        ctx.globalAlpha = Math.min(1, front * 1.2);
        ctx.font = `${Math.round(10 + 24 * front)}px "Segoe UI Emoji", sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(wheel[j].g, cx, y);
        ctx.restore();
      }

      // ombres haut / bas pour "arrondir" le cylindre
      const shade = ctx.createLinearGradient(0, 6, 0, H - 6);
      shade.addColorStop(0, 'rgba(0,0,0,0.75)');
      shade.addColorStop(0.28, 'rgba(0,0,0,0)');
      shade.addColorStop(0.72, 'rgba(0,0,0,0)');
      shade.addColorStop(1, 'rgba(0,0,0,0.75)');
      roundRect(cx - reelW / 2, 6, reelW, H - 12, 10);
      ctx.fillStyle = shade;
      ctx.fill();
    });

    // ligne de gain au centre
    ctx.strokeStyle = 'rgba(226,180,88,0.6)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(6, cy);
    ctx.lineTo(W - 6, cy);
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
