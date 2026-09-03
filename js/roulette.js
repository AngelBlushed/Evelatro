/* ===========================================================
   Jeu 4 — Roulette européenne (un seul zéro)
   Refonte : vraie roue vue de dessus (canvas) + vrai tapis
   de mise (0 sur 3 rangs, 12 colonnes, douzaines, chances
   simples). On choisit UNE mise, puis on lance la bille.
   =========================================================== */

Games.roulette = {
  icon: '🎡',
  name: 'Roulette',

  render(root) {
    const body = gameShell(root, 'Roulette',
      "Roulette européenne (un seul zéro). Choisis une mise, lance la bille et regarde la roue tourner.");

    let bet = 10;
    let stake = 0;
    let choice = null;      // { type, n?, pays, label }
    let spinning = false;
    let alive = true;

    const RED = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);

    // Chances simples + douzaines (chances multiples).
    const OUTSIDE = [
      { type: 'low', label: '1 – 18', pays: 1 },
      { type: 'even', label: 'PAIR', pays: 1 },
      { type: 'red', label: 'ROUGE', pays: 1 },
      { type: 'black', label: 'NOIR', pays: 1 },
      { type: 'odd', label: 'IMPAIR', pays: 1 },
      { type: 'high', label: '19 – 36', pays: 1 },
    ];
    const DOZENS = [
      { type: 'dozen1', label: '1re douzaine', pays: 2 },
      { type: 'dozen2', label: '2e douzaine', pays: 2 },
      { type: 'dozen3', label: '3e douzaine', pays: 2 },
    ];

    // Disposition du tapis : rang du haut 3,6,9… ; milieu 2,5,8… ; bas 1,4,7…
    const LAYOUT = [
      3, 6, 9, 12, 15, 18, 21, 24, 27, 30, 33, 36,
      2, 5, 8, 11, 14, 17, 20, 23, 26, 29, 32, 35,
      1, 4, 7, 10, 13, 16, 19, 22, 25, 28, 31, 34,
    ];

    // --- éléments à l'écran ---
    const wheelWrap = el('div', { class: 'roulette-wheel-wrap' });
    const canvas = el('canvas', { class: 'wheel-canvas' });
    wheelWrap.append(canvas);

    const lastLine = el('div', { class: 'wheel-last', hidden: true });
    const dozensRow = el('div', { class: 'bet-dozens' });
    const outsideRow = el('div', { class: 'bet-simple' });
    const numGrid = el('div', { class: 'num-grid' });
    const choiceLine = el('div', { class: 'roulette-choice' });
    const banner = el('div', { class: 'banner' });
    const spinBtn = el('button', { class: 'btn btn-primary btn-spin', text: 'Lancer la bille', onClick: spin });
    const controls = el('div', { class: 'controls' }, spinBtn);
    const betWrap = betBar(() => bet, v => { if (!spinning) bet = v; }, { onChange: refreshBtn });

    const wheel = createWheel(canvas, RED);

    DOZENS.forEach(opt => {
      opt._btn = el('button', { class: 'bet-opt bet-dozen', text: opt.label, onClick: () => setChoice({ ...opt }) });
      dozensRow.append(opt._btn);
    });
    OUTSIDE.forEach(opt => {
      opt._btn = el('button', { class: 'bet-opt bet-' + opt.type, text: opt.label, onClick: () => setChoice({ ...opt }) });
      outsideRow.append(opt._btn);
    });

    // case du 0 (colonne de gauche, 3 rangs)
    const zeroCell = el('button', {
      class: 'num-cell num-zero',
      text: '0',
      onClick: () => setChoice({ type: 'number', n: 0, pays: 35, label: 'Plein 0' }),
    });
    zeroCell.dataset.n = 0;
    numGrid.append(zeroCell);
    LAYOUT.forEach(n => {
      const cell = el('button', {
        class: 'num-cell ' + (RED.has(n) ? 'red' : 'black'),
        text: n,
        onClick: () => setChoice({ type: 'number', n, pays: 35, label: 'Plein ' + n }),
      });
      cell.dataset.n = n;
      numGrid.append(cell);
    });

    // mode combat "EveFight!" : uniquement les mises à chances égales.
    const inDuel = (() => {
      try { const s = window.Duel && Duel.state(); return !!(s && s.active && s.status === 'accepted' && s.game === 'roulette'); }
      catch (e) { return false; }
    })();

    if (inDuel) {
      dozensRow.hidden = true;
      numGrid.hidden = true;
      choiceLine.dataset.duel = '1';
      setChoice({ ...OUTSIDE[2] });   // Rouge par défaut
    }

    const leftCol = el('div', { class: 'roulette-left' }, wheelWrap, lastLine, banner);
    const rightCol = el('div', { class: 'roulette-right' },
      betWrap, choiceLine, controls, numGrid, dozensRow, outsideRow);
    body.append(el('div', { class: 'roulette-layout' }, leftCol, rightCol));
    refreshBtn();
    setChoiceLine();

    // --- logique ---

    function leave() {
      alive = false;
      if (spinning) Bank.payout(stake);   // bille en cours : on rend la mise
    }
    Games.roulette.leave = leave;

    function setChoice(c) {
      if (spinning) return;
      choice = c;
      DOZENS.forEach(o => o._btn.classList.toggle('is-active', c.type === o.type));
      OUTSIDE.forEach(o => o._btn.classList.toggle('is-active', c.type === o.type));
      [...numGrid.children].forEach(cell =>
        cell.classList.toggle('is-active', c.type === 'number' && Number(cell.dataset.n) === c.n));
      setChoiceLine();
      refreshBtn();
    }

    function setChoiceLine() {
      if (!choice) {
        choiceLine.textContent = inDuel
          ? 'Duel : choisis une mise à 50/50 (paie 1:1).'
          : 'Touche un numéro ou une case du tapis pour miser.';
        choiceLine.classList.remove('is-set');
        return;
      }
      choiceLine.textContent = `Ta mise : ${choice.label}  ·  paie ${choice.pays}:1`;
      choiceLine.classList.add('is-set');
    }

    function refreshBtn() {
      spinBtn.disabled = spinning || !choice;
      spinBtn.textContent = spinning ? 'La bille tourne…' : 'Lancer la bille';
    }

    function isWinner(n) {
      if (n === 0) return choice.type === 'number' && choice.n === 0;
      switch (choice.type) {
        case 'number': return choice.n === n;
        case 'red': return RED.has(n);
        case 'black': return !RED.has(n);
        case 'even': return n % 2 === 0;
        case 'odd': return n % 2 === 1;
        case 'low': return n <= 18;
        case 'high': return n >= 19;
        case 'dozen1': return n <= 12;
        case 'dozen2': return n >= 13 && n <= 24;
        case 'dozen3': return n >= 25;
        default: return false;
      }
    }

    function spin() {
      if (spinning || !choice) return;
      betWrap.syncAuto();
      stake = Bank.stake(bet);
      if (!stake) return;
      spinning = true;
      banner.textContent = '';
      banner.className = 'banner';
      refreshBtn();
      Sound.roulette(5.2);

      const result = Math.floor(Math.random() * 37);   // le tirage est décidé maintenant
      wheel.spinTo(result, () => settle(result));       // l'animation appelle settle à la fin
    }

    function settle(n) {
      if (!alive) return;                 // on a changé d'onglet pendant la bille
      const win = isWinner(n);
      const gain = win ? stake * (choice.pays + 1) : 0;
      Bank.payout(gain);

      const couleur = n === 0 ? 'vert' : RED.has(n) ? 'rouge' : 'noir';
      lastLine.hidden = false;
      lastLine.textContent = `${n} ${couleur}`;
      lastLine.className = 'wheel-last wl-' + couleur;
      banner.textContent = win ? `Gagné ! +${gain} crédits.` : `Perdu — ${n} ${couleur}.`;
      banner.className = 'banner banner-' + (win ? 'win' : 'lose');
      Activity.log({
        game: 'Roulette',
        detail: `${choice.label} → ${n} ${couleur}`,
        bet: stake,
        gain: Math.round(gain - stake),
      });
      if (win) wheel.celebrate();
      try { if (win && stake >= 500 && window.Bonus) Bonus.arNote('roulette'); } catch (e) {}

      spinning = false;
      Bank.endRound();
      betWrap.syncAuto();
      refreshBtn();
    }
  },
};


/* -----------------------------------------------------------
   La roue animée — vue de dessus, dessinée au canvas 2D.
   spinTo(numero, callback) : lance le tour, callback à l'arrêt.
   celebrate() : halo doré + secteur gagnant qui pulse.
   ----------------------------------------------------------- */
function createWheel(canvas, RED) {
  const ORDER = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23,
    10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];
  const N = ORDER.length;
  const TAU = Math.PI * 2;
  const STEP = TAU / N;
  const POINTER = -Math.PI / 2;                 // repère fixe : le haut

  const ctx = canvas.getContext('2d');
  const SIZE = 700;                             // buffer interne large -> net même en grand
  const SC = SIZE / 400;                        // facteur d'échelle des tailles fixes
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = SIZE * dpr;
  canvas.height = SIZE * dpr;
  canvas.style.width = SIZE + 'px';
  canvas.style.height = SIZE + 'px';
  ctx.scale(dpr, dpr);

  const cx = SIZE / 2, cy = SIZE / 2;
  const R = SIZE / 2 - 3;

  let wheelAngle = 0;
  let ballAngle = POINTER;
  let ballR = 0.9;
  let ballVisible = false;
  let anim = null;
  let flashUntil = 0;
  let winIndex = -1;
  let winGlowUntil = 0;

  const easeOut = t => 1 - Math.pow(1 - t, 3.6);
  const lerp = (a, b, k) => a + (b - a) * k;
  const norm = a => { while (a <= -Math.PI) a += TAU; while (a > Math.PI) a -= TAU; return a; };

  function pocketColor(n) {
    if (n === 0) return '#177a45';
    return RED.has(n) ? '#c9302b' : '#1b1714';
  }

  function spinTo(number, onDone) {
    winIndex = ORDER.indexOf(number);
    const desired = POINTER - (winIndex + 0.5) * STEP;
    const from = wheelAngle;
    let to = from + TAU * 7;
    to += norm(desired - to);
    const bFrom = ballAngle;
    let bTo = bFrom - TAU * 14;
    bTo += norm(POINTER - bTo);
    anim = { t0: performance.now(), dur: 5400, from, to, bFrom, bTo, onDone, done: false };
    ballVisible = true;
  }

  function celebrate() {
    const now = performance.now();
    flashUntil = now + 1200;
    winGlowUntil = now + 3200;
  }

  function ring(rOut, rIn, stops) {
    const lg = ctx.createLinearGradient(cx - rOut, cy - rOut, cx + rOut, cy + rOut);
    stops.forEach((s, i) => lg.addColorStop(i / (stops.length - 1), s));
    ctx.fillStyle = lg;
    ctx.beginPath();
    ctx.arc(cx, cy, rOut, 0, TAU);
    ctx.arc(cx, cy, rIn, 0, TAU, true);
    ctx.fill('evenodd');
  }

  function update(now) {
    if (anim) {
      const t = Math.min(1, (now - anim.t0) / anim.dur);
      const k = easeOut(t);
      wheelAngle = lerp(anim.from, anim.to, k);
      ballAngle = lerp(anim.bFrom, anim.bTo, k);
      if (t < 0.6) {
        ballR = 0.905;
      } else {
        const k2 = easeOut((t - 0.6) / 0.4);
        ballR = lerp(0.905, 0.74, k2) + 0.018 * Math.sin(t * 55) * (1 - t);
      }
      if (t >= 1 && !anim.done) {
        anim.done = true;
        ballR = 0.74;
        ballAngle = wheelAngle + (winIndex + 0.5) * STEP;
        const cb = anim.onDone;
        anim = null;
        if (cb) cb();
      }
    } else {
      wheelAngle += 0.0024;
      if (ballVisible) ballAngle = wheelAngle + (winIndex + 0.5) * STEP;
    }
  }

  function draw() {
    const now = performance.now();
    ctx.clearRect(0, 0, SIZE, SIZE);

    // bois extérieur
    const wood = ctx.createRadialGradient(cx, cy - R * 0.35, R * 0.4, cx, cy, R);
    wood.addColorStop(0, '#5c3c23');
    wood.addColorStop(0.72, '#3a2415');
    wood.addColorStop(1, '#1d110a');
    ctx.fillStyle = wood;
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.fill();

    // jante or
    ring(R * 0.99, R * 0.865, ['#7a5a24', '#f1d389', '#fff2c8', '#8a6529', '#f1d389']);

    // piste de la bille (creux)
    ctx.fillStyle = '#140f09';
    ctx.beginPath(); ctx.arc(cx, cy, R * 0.865, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,.55)';
    ctx.lineWidth = 6;
    ctx.beginPath(); ctx.arc(cx, cy, R * 0.83, 0, TAU); ctx.stroke();

    // secteurs numérotés (tournent)
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(wheelAngle);
    for (let i = 0; i < N; i++) {
      const a0 = i * STEP;
      const a1 = a0 + STEP;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, R * 0.82, a0, a1);
      ctx.closePath();
      ctx.fillStyle = pocketColor(ORDER[i]);
      ctx.fill();
      // fret doré
      ctx.strokeStyle = 'rgba(244,214,138,.5)';
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.moveTo(R * 0.44 * Math.cos(a0), R * 0.44 * Math.sin(a0));
      ctx.lineTo(R * 0.82 * Math.cos(a0), R * 0.82 * Math.sin(a0));
      ctx.stroke();
      // numéro
      const am = a0 + STEP / 2;
      ctx.save();
      ctx.rotate(am);
      ctx.translate(R * 0.735, 0);
      ctx.rotate(Math.PI / 2);
      ctx.fillStyle = '#f4f1e8';
      ctx.font = `700 ${13 * SC}px "Segoe UI", system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(ORDER[i]), 0, 0);
      ctx.restore();
      // secteur gagnant qui pulse
      if (i === winIndex && now < winGlowUntil) {
        ctx.save();
        ctx.globalAlpha = 0.35 + 0.35 * (Math.sin(now / 90) + 1) / 2;
        ctx.fillStyle = '#ffe8a6';
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.arc(0, 0, R * 0.82, a0, a1);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
    }
    // ombrage circulaire pour le relief
    const vig = ctx.createRadialGradient(0, -R * 0.3, R * 0.2, 0, 0, R * 0.82);
    vig.addColorStop(0, 'rgba(255,255,255,.08)');
    vig.addColorStop(0.55, 'rgba(0,0,0,0)');
    vig.addColorStop(1, 'rgba(0,0,0,.4)');
    ctx.fillStyle = vig;
    ctx.beginPath(); ctx.arc(0, 0, R * 0.82, 0, TAU); ctx.fill();
    ctx.restore();

    // cône central argent
    ring(R * 0.5, R * 0.3, ['#8b9097', '#e8ebf0', '#b7bcc4', '#6d7178', '#e8ebf0']);

    // moyeu doré + tourelle qui tourne
    ctx.save();
    ctx.translate(cx, cy);
    const hub = ctx.createRadialGradient(-R * 0.08, -R * 0.08, 2, 0, 0, R * 0.3);
    hub.addColorStop(0, '#ffe9b0');
    hub.addColorStop(1, '#7c5c28');
    ctx.fillStyle = hub;
    ctx.beginPath(); ctx.arc(0, 0, R * 0.3, 0, TAU); ctx.fill();
    ctx.rotate(wheelAngle * 1.5);
    ctx.fillStyle = '#4a3717';
    for (let k = 0; k < 4; k++) {
      ctx.save();
      ctx.rotate(k * Math.PI / 2);
      ctx.beginPath();
      ctx.moveTo(-3.5, -R * 0.27);
      ctx.lineTo(3.5, -R * 0.27);
      ctx.lineTo(7, 0);
      ctx.lineTo(-7, 0);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    ctx.fillStyle = '#241b0d';
    ctx.beginPath(); ctx.arc(0, 0, R * 0.055, 0, TAU); ctx.fill();
    ctx.restore();

    // bille
    if (ballVisible) {
      const br = R * ballR;
      const bx = cx + br * Math.cos(ballAngle);
      const by = cy + br * Math.sin(ballAngle);
      const rad = 7 * SC;
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,.5)';
      ctx.shadowBlur = 7;
      ctx.shadowOffsetY = 2;
      const bg = ctx.createRadialGradient(bx - 2.5, by - 2.5, 1, bx, by, rad);
      bg.addColorStop(0, '#ffffff');
      bg.addColorStop(1, '#c3c8ce');
      ctx.fillStyle = bg;
      ctx.beginPath(); ctx.arc(bx, by, rad, 0, TAU); ctx.fill();
      ctx.restore();
    }

    // pointeur fixe (haut)
    ctx.beginPath();
    ctx.moveTo(cx - 10 * SC, cy - R + 3 * SC);
    ctx.lineTo(cx + 10 * SC, cy - R + 3 * SC);
    ctx.lineTo(cx, cy - R + 26 * SC);
    ctx.closePath();
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,.55)';
    ctx.shadowBlur = 6;
    ctx.fillStyle = '#ffe18a';
    ctx.fill();
    ctx.restore();

    // halo de victoire
    if (now < flashUntil) {
      const p = 1 - (flashUntil - now) / 1200;
      ctx.globalAlpha = (1 - p) * 0.9;
      ctx.strokeStyle = '#ffe08a';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.arc(cx, cy, R * (0.9 + p * 0.1), 0, TAU);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }

  function frame() {
    if (!canvas.isConnected) return;
    update(performance.now());
    draw();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  return { spinTo, celebrate };
}
