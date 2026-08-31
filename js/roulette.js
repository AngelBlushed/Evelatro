/* ===========================================================
   Jeu 4 — Roulette européenne (un seul zéro)
   On choisit UNE mise, puis on lance la bille.
   La roue est dessinée en 2D mais "vue de biais" (ellipse +
   effet de profondeur) pour donner une impression de 3D.
   =========================================================== */

Games.roulette = {
  icon: '🎡',
  name: 'Roulette',

  render(root) {
    const body = gameShell(root, 'Roulette',
      "Roulette européenne (un seul zéro). Choisis une mise, puis lance la bille et regarde la roue tourner.");

    let bet = 10;
    let stake = 0;
    let choice = null;      // { type, n?, pays, label }
    let spinning = false;
    let alive = true;

    const RED = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);

    const OUTSIDE = [
      { type: 'red', label: 'Rouge', pays: 1 },
      { type: 'black', label: 'Noir', pays: 1 },
      { type: 'even', label: 'Pair', pays: 1 },
      { type: 'odd', label: 'Impair', pays: 1 },
      { type: 'low', label: '1–18', pays: 1 },
      { type: 'high', label: '19–36', pays: 1 },
      { type: 'dozen1', label: '1re douzaine', pays: 2 },
      { type: 'dozen2', label: '2e douzaine', pays: 2 },
      { type: 'dozen3', label: '3e douzaine', pays: 2 },
    ];

    // --- éléments à l'écran ---
    const canvas = el('canvas', { class: 'wheel-canvas' });
    const lastLine = el('div', { class: 'wheel-last', text: '' });
    const outsideGrid = el('div', { class: 'bet-grid bet-grid-3' });
    const numGrid = el('div', { class: 'num-grid' });
    const choiceLine = el('div', { class: 'banner banner-push' });
    const banner = el('div', { class: 'banner' });
    const spinBtn = el('button', { class: 'btn btn-primary', text: 'Lancer la bille', onClick: spin });
    const controls = el('div', { class: 'controls' }, spinBtn);
    const betWrap = betBar(() => bet, v => { if (!spinning) bet = v; }, { onChange: refreshBtn });

    const wheel = createWheel(canvas, RED);

    OUTSIDE.forEach(opt => {
      opt._btn = el('button', { class: 'bet-opt', text: opt.label, onClick: () => setChoice({ ...opt }) });
      outsideGrid.append(opt._btn);
    });
    for (let n = 0; n <= 36; n++) {
      const cls = n === 0 ? 'num-cell' : 'num-cell ' + (RED.has(n) ? 'red' : 'black');
      const cell = el('button', {
        class: cls,
        text: n,
        onClick: () => setChoice({ type: 'number', n, pays: 35, label: 'Plein ' + n }),
      });
      cell.dataset.n = n;
      numGrid.append(cell);
    }

    // Ordre pensé pour ne pas scroller : la roue, le résultat, la mise
    // et le bouton "Lancer" restent groupés en haut ; le tapis est dessous.
    // mode combat "EveFight!" : uniquement les mises à chances égales
    // (Rouge / Noir / Pair / Impair / 1–18 / 19–36), pas de numéro, pas de douzaine.
    const inDuel = (() => {
      try { const s = window.Duel && Duel.state(); return !!(s && s.active && s.status === 'accepted' && s.game === 'roulette'); }
      catch (e) { return false; }
    })();
    const labelTxt = inDuel
      ? 'Duel : choisis une mise à 50/50 (paie 1:1)'
      : 'Choisis ta mise  (numéro plein = paie 35:1)';

    if (inDuel) {
      OUTSIDE.forEach(o => { if (o.pays !== 1) o._btn.hidden = true; });
      numGrid.hidden = true;
      setChoice({ ...OUTSIDE[0] });   // Rouge par défaut
    }

    body.append(
      canvas,
      banner,
      lastLine,
      betWrap,
      choiceLine,
      controls,
      el('div', { class: 'hand-label', text: labelTxt }),
      outsideGrid,
      numGrid,
    );
    refreshBtn();

    // --- logique ---

    function leave() {
      alive = false;
      if (spinning) Bank.payout(stake);   // bille en cours : on rend la mise
    }
    Games.roulette.leave = leave;

    function setChoice(c) {
      if (spinning) return;
      choice = c;
      OUTSIDE.forEach(o => o._btn.classList.toggle('is-active', c.type === o.type));
      [...numGrid.children].forEach(cell =>
        cell.classList.toggle('is-active', c.type === 'number' && Number(cell.dataset.n) === c.n));
      choiceLine.textContent = `Ta mise : ${c.label} — paie ${c.pays}:1`;
      refreshBtn();
    }

    function refreshBtn() {
      spinBtn.disabled = spinning || !choice;
      spinBtn.textContent = 'Lancer la bille';
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
      Sound.roulette(4.2);

      const result = Math.floor(Math.random() * 37);   // le tirage est décidé maintenant
      wheel.spinTo(result, () => settle(result));       // l'animation appelle settle à la fin
    }

    function settle(n) {
      if (!alive) return;                 // on a changé d'onglet pendant la bille
      const win = isWinner(n);
      const gain = win ? stake * (choice.pays + 1) : 0;
      Bank.payout(gain);

      const couleur = n === 0 ? 'vert' : RED.has(n) ? 'rouge' : 'noir';
      lastLine.textContent = `Résultat : ${n} (${couleur})` + (stake < bet ? ` — misé : ${stake}` : '') + '.';
      banner.textContent = win ? `Gagné ! +${gain} crédits.` : 'Perdu.';
      banner.className = 'banner banner-' + (win ? 'win' : 'lose');
      Activity.log({
        game: 'Roulette',
        detail: `${choice.label} → ${n} ${couleur}`,
        bet: stake,
        gain: Math.round(gain - stake),
      });
      if (win) wheel.celebrate();

      spinning = false;
      Bank.endRound();
      betWrap.syncAuto();
      refreshBtn();
    }
  },
};


/* -----------------------------------------------------------
   La roue animée (canvas 2D, allure pseudo-3D).
   spinTo(numero, callback) : lance le tour, callback à l'arrêt.
   ----------------------------------------------------------- */
function createWheel(canvas, RED) {
  const ORDER = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23,
    10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];
  const N = ORDER.length;
  const STEP = (Math.PI * 2) / N;
  const TAU = Math.PI * 2;

  const ctx = canvas.getContext('2d');
  const W = 296, H = 130;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  canvas.style.width = W + 'px';
  canvas.style.height = H + 'px';
  ctx.scale(dpr, dpr);

  const cx = W / 2;
  const cy = H / 2 + 6;
  const rx = W * 0.44;
  const ry = H * 0.40;
  const POINTER = Math.PI / 2;

  let wheelAngle = 0;
  const ball = { angle: POINTER, radius: 0.9, visible: false };
  let targetIndex = 0;
  let anim = null;
  let flashUntil = 0;

  const norm = a => { while (a <= -Math.PI) a += TAU; while (a > Math.PI) a -= TAU; return a; };
  const easeOut = t => 1 - Math.pow(1 - t, 3);
  const lerp = (a, b, k) => a + (b - a) * k;
  const P = (rr, aa) => [cx + rx * rr * Math.cos(aa), cy + ry * rr * Math.sin(aa)];

  function spinTo(number, onDone) {
    targetIndex = ORDER.indexOf(number);
    const desiredFinal = POINTER - targetIndex * STEP;
    const wheelFrom = wheelAngle;
    let wheelTo = wheelFrom + TAU * 6;
    wheelTo += norm(desiredFinal - wheelTo);
    const ballFrom = ball.angle;
    let ballTo = ballFrom - TAU * 11;
    ballTo += norm(POINTER - ballTo);
    anim = { t0: performance.now(), dur: 4200, wheelFrom, wheelTo, ballFrom, ballTo, onDone, done: false };
    ball.visible = true;
  }

  function celebrate() { flashUntil = performance.now() + 800; }

  function update(now) {
    if (anim) {
      const t = Math.min(1, (now - anim.t0) / anim.dur);
      const k = easeOut(t);
      wheelAngle = lerp(anim.wheelFrom, anim.wheelTo, k);
      ball.angle = lerp(anim.ballFrom, anim.ballTo, k);
      if (t < 0.5) ball.radius = 1.0 - 0.03 * (t / 0.5);
      else {
        const k2 = easeOut((t - 0.5) / 0.5);
        ball.radius = lerp(0.97, 0.72, k2) + 0.02 * Math.sin(t * 44) * (1 - t);
      }
      if (t >= 1 && !anim.done) {
        anim.done = true;
        ball.radius = 0.72;
        const cb = anim.onDone;
        anim = null;
        if (cb) cb();
      }
    } else {
      wheelAngle += 0.0035;
      if (ball.visible) ball.angle = wheelAngle + targetIndex * STEP;
    }
  }

  function pocketColor(n) {
    if (n === 0) return '#15794c';
    return RED.has(n) ? '#c02033' : '#161a1f';
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);

    // tapis vert
    const felt = ctx.createRadialGradient(cx, cy, 6, cx, cy, rx * 1.5);
    felt.addColorStop(0, '#12402e');
    felt.addColorStop(1, '#08221a');
    ctx.fillStyle = felt;
    ctx.beginPath(); ctx.ellipse(cx, cy, rx * 1.35, ry * 1.5, 0, 0, TAU); ctx.fill();

    // jante dorée
    const gold = ctx.createLinearGradient(cx - rx, cy - ry, cx + rx, cy + ry);
    gold.addColorStop(0, '#6b4e1c');
    gold.addColorStop(0.45, '#f0d68a');
    gold.addColorStop(0.55, '#ffe9b0');
    gold.addColorStop(1, '#7a5a22');
    ctx.fillStyle = gold;
    ctx.beginPath(); ctx.ellipse(cx, cy, rx * 1.05, ry * 1.05, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#0a1a13';
    ctx.beginPath(); ctx.ellipse(cx, cy - 1, rx * 0.9, ry * 0.9, 0, 0, TAU); ctx.fill();

    // cases, de l'arrière vers l'avant
    const order = [...Array(N).keys()].sort(
      (a, b) => Math.sin(wheelAngle + a * STEP) - Math.sin(wheelAngle + b * STEP));
    const half = STEP * 0.48;
    for (const i of order) {
      const a = wheelAngle + i * STEP;
      const depth = (Math.sin(a) + 1) / 2;
      const [x1, y1] = P(0.56, a - half);
      const [x2, y2] = P(0.88, a - half);
      const [x3, y3] = P(0.88, a + half);
      const [x4, y4] = P(0.56, a + half);
      ctx.beginPath();
      ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.lineTo(x3, y3); ctx.lineTo(x4, y4); ctx.closePath();
      ctx.fillStyle = pocketColor(ORDER[i]);
      ctx.globalAlpha = 0.4 + 0.6 * depth;
      ctx.fill();
      ctx.globalAlpha = 0.5 + 0.5 * depth;
      ctx.strokeStyle = '#d9b45e';
      ctx.lineWidth = 0.7;
      ctx.stroke();
      ctx.globalAlpha = 1;

      if (depth > 0.24) {
        const [tx, ty] = P(0.72, a);
        ctx.save();
        ctx.translate(tx, ty);
        ctx.fillStyle = '#f4f6f4';
        ctx.globalAlpha = 0.3 + 0.7 * depth;
        ctx.font = `${Math.round(5.5 + 5 * depth)}px "Segoe UI", sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(ORDER[i]), 0, 0);
        ctx.restore();
        ctx.globalAlpha = 1;
      }
    }

    // bol intérieur
    for (let i = 5; i >= 1; i--) {
      const f = i / 5;
      ctx.beginPath();
      ctx.ellipse(cx, cy - (1 - f) * 6, rx * 0.55 * f + rx * 0.03, ry * 0.55 * f + ry * 0.03, 0, 0, TAU);
      ctx.fillStyle = `rgb(${14 + i * 5}, ${20 + i * 5}, ${24 + i * 4})`;
      ctx.fill();
    }

    // moyeu doré + tourelle qui tourne
    ctx.save();
    ctx.translate(cx, cy);
    const hub = ctx.createRadialGradient(0, -2, 1, 0, 0, rx * 0.4);
    hub.addColorStop(0, '#ffe9b0');
    hub.addColorStop(1, '#8a6a2c');
    ctx.fillStyle = hub;
    ctx.beginPath(); ctx.ellipse(0, 0, rx * 0.34, ry * 0.34, 0, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#e8c874';
    ctx.lineWidth = 2;
    for (let k = 0; k < 4; k++) {
      const a = wheelAngle + k * (Math.PI / 2);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(rx * 0.5 * Math.cos(a), ry * 0.5 * Math.sin(a));
      ctx.stroke();
      const [kx, ky] = [rx * 0.5 * Math.cos(a), ry * 0.5 * Math.sin(a)];
      ctx.fillStyle = '#3a2c12';
      ctx.beginPath(); ctx.ellipse(kx, ky, 2, 1.6, 0, 0, TAU); ctx.fill();
    }
    ctx.fillStyle = '#2a2010';
    ctx.beginPath(); ctx.ellipse(0, 0, 4, 3, 0, 0, TAU); ctx.fill();
    ctx.restore();

    // bille
    if (ball.visible) {
      const [bx, by] = P(ball.radius, ball.angle);
      const depth = (Math.sin(ball.angle) + 1) / 2;
      const r = 2.4 + 2.6 * depth;
      ctx.beginPath(); ctx.arc(bx, by, r, 0, TAU);
      ctx.fillStyle = '#f7f9fa';
      ctx.shadowColor = 'rgba(0,0,0,0.55)';
      ctx.shadowBlur = 4;
      ctx.shadowOffsetY = 1;
      ctx.fill();
      ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
      ctx.beginPath(); ctx.arc(bx - r * 0.3, by - r * 0.3, r * 0.35, 0, TAU);
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.fill();
    }

    // taquet doré
    ctx.beginPath();
    ctx.moveTo(cx - 5, cy + ry * 1.02);
    ctx.lineTo(cx + 5, cy + ry * 1.02);
    ctx.lineTo(cx, cy + ry * 0.9);
    ctx.closePath();
    ctx.fillStyle = '#f0d68a';
    ctx.fill();

    // éclat de victoire
    const now = performance.now();
    if (now < flashUntil) {
      const p = 1 - (flashUntil - now) / 800;
      ctx.globalAlpha = (1 - p) * 0.8;
      ctx.strokeStyle = '#ffe08a';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx * (1.05 + p * 0.5), ry * (1.05 + p * 0.5), 0, 0, TAU);
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
