/* ===========================================================
   BÊTA 1.3 — fond animé du menu d'accueil.

   Champ de couleur "marbré" façon Balatro : une seule nappe
   continue, 2–3 couleurs qui se déforment et s'entremêlent
   lentement (domain warping de bruit fractal). Rendu WebGL,
   donc identique navigateur / .exe. Repli 2D si WebGL absent.

   S'arrête hors du menu d'accueil et onglet caché.
   =========================================================== */

(() => {
  const canvas = document.getElementById('launch-canvas');
  if (!canvas) return;

  const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  let W = 0, H = 0, DPR = 1;
  let raf = 0, running = false, startT = 0, pausedAt = 0;

  /* ---------------- WebGL ---------------- */
  const gl = canvas.getContext('webgl', { antialias: false, alpha: false, depth: false })
         || canvas.getContext('experimental-webgl', { antialias: false, alpha: false, depth: false });

  const VERT = `
    attribute vec2 p;
    void main(){ gl_Position = vec4(p, 0.0, 1.0); }
  `;

  // domain warping (Inigo Quilez) — bruit fractal déformé deux fois
  const FRAG = `
    precision highp float;
    uniform vec2 u_res;
    uniform float u_time;

    float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
    float noise(vec2 p){
      vec2 i = floor(p), f = fract(p);
      vec2 u = f * f * (3.0 - 2.0 * f);
      return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
                 mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
    }
    float fbm(vec2 p){
      float v = 0.0, a = 0.5;
      for (int i = 0; i < 5; i++){ v += a * noise(p); p = p * 2.03 + 7.1; a *= 0.5; }
      return v;
    }

    void main(){
      vec2 uv = gl_FragCoord.xy / u_res.xy;
      vec2 p = (uv - 0.5);
      p.x *= u_res.x / u_res.y;
      p *= 2.2;
      float t = u_time * 0.045;

      vec2 q = vec2(fbm(p + vec2(0.0, t)),
                    fbm(p + vec2(5.2, 1.3 - t)));
      vec2 r = vec2(fbm(p + 3.2 * q + vec2(1.7, 9.2) + 0.45 * t),
                    fbm(p + 3.2 * q + vec2(8.3, 2.8) - 0.37 * t));
      float f = fbm(p + 3.6 * r);

      vec3 crimson = vec3(0.82, 0.08, 0.21);
      vec3 royal   = vec3(0.09, 0.16, 0.66);
      vec3 violet  = vec3(0.42, 0.11, 0.52);
      vec3 gold    = vec3(0.92, 0.66, 0.22);

      vec3 col = mix(royal, crimson, smoothstep(0.25, 0.85, f + 0.15 * q.x));
      col = mix(col, violet, smoothstep(0.15, 0.9, length(r) * 0.85));
      col += gold * smoothstep(0.72, 0.95, r.x) * 0.35;

      // relief + assombrissement des creux (donne le côté "verni")
      float shade = 0.42 + 0.72 * f;
      col *= shade;
      col = mix(col, col * col * 1.6, 0.35);

      // vignette douce
      col *= smoothstep(1.25, 0.35, length(uv - 0.5)) * 0.55 + 0.45;

      col = pow(col, vec3(0.9));
      gl_FragColor = vec4(col, 1.0);
    }
  `;

  function compile(type, src){
    const s = gl.createShader(type);
    gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { console.warn('shader', gl.getShaderInfoLog(s)); return null; }
    return s;
  }

  let prog = null, uRes = null, uTime = null, glReady = false;
  function initGL(){
    if (!gl) return false;
    const vs = compile(gl.VERTEX_SHADER, VERT);
    const fs = compile(gl.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) return false;
    prog = gl.createProgram();
    gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { console.warn('link', gl.getProgramInfoLog(prog)); return false; }
    gl.useProgram(prog);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'p');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    uRes = gl.getUniformLocation(prog, 'u_res');
    uTime = gl.getUniformLocation(prog, 'u_time');
    glReady = true;
    return true;
  }

  /* ---------------- repli 2D (WebGL indisponible) ---------------- */
  let ctx2d = null, blobs = [];
  function init2D(){
    ctx2d = canvas.getContext('2d');
    if (!ctx2d) return false;
    blobs = [
      { c: '#8a0f24', x: .3, y: .35, rx: .26, ry: .2, s: .0055, ph: 0 },
      { c: '#122a9c', x: .68, y: .4, rx: .24, ry: .26, s: -.004, ph: 2 },
      { c: '#5a1a78', x: .5, y: .7, rx: .3, ry: .18, s: .003, ph: 4 },
      { c: '#b98426', x: .8, y: .2, rx: .18, ry: .2, s: -.0035, ph: 1 },
    ];
    return true;
  }
  function draw2D(t){
    const g = ctx2d;
    g.globalCompositeOperation = 'source-over';
    g.fillStyle = '#120410';
    g.fillRect(0, 0, W, H);
    g.filter = 'blur(70px)';
    blobs.forEach(b => {
      const x = (b.x + Math.cos(b.ph + t * b.s) * b.rx) * W;
      const y = (b.y + Math.sin(b.ph * 1.4 + t * b.s) * b.ry) * H;
      const rad = Math.max(W, H) * 0.55;
      const rg = g.createRadialGradient(x, y, 0, x, y, rad);
      rg.addColorStop(0, b.c);
      rg.addColorStop(1, 'rgba(18,4,16,0)');
      g.fillStyle = rg;
      g.beginPath(); g.arc(x, y, rad, 0, Math.PI * 2); g.fill();
    });
    g.filter = 'none';
    // vignette
    const vg = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * .2, W / 2, H / 2, Math.max(W, H) * .75);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(8,3,8,.7)');
    g.fillStyle = vg; g.fillRect(0, 0, W, H);
  }

  /* ---------------- commun ---------------- */
  function resize(){
    DPR = Math.min(window.devicePixelRatio || 1, glReady ? 2 : 1.4);
    W = canvas.clientWidth || window.innerWidth;
    H = canvas.clientHeight || window.innerHeight;
    canvas.width = Math.max(1, Math.round(W * DPR));
    canvas.height = Math.max(1, Math.round(H * DPR));
    if (glReady) gl.viewport(0, 0, canvas.width, canvas.height);
    if (!running) paintOnce();
  }

  function render(now){
    if (!running) return;
    const t = (now - startT) / 1000;
    if (glReady){
      gl.uniform2f(uRes, canvas.width, canvas.height);
      gl.uniform1f(uTime, t);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    } else {
      draw2D(t * 1000);
    }
    raf = requestAnimationFrame(render);
  }

  function paintOnce(){
    startT = performance.now() - 8000;   // pose une image "à 8 s" quand on est en pause
    if (glReady){
      gl.uniform2f(uRes, canvas.width, canvas.height);
      gl.uniform1f(uTime, 8);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    } else if (ctx2d){
      draw2D(8000);
    }
  }

  function start(){
    if (running) return;
    running = true;
    startT = performance.now() - pausedAt;
    raf = requestAnimationFrame(render);
  }
  function stop(){
    if (!running) return;
    pausedAt = performance.now() - startT;
    running = false;
    cancelAnimationFrame(raf);
  }

  function onShellChange(){
    const sh = document.documentElement.dataset.shell;
    const wantOn = sh === 'launch' && !document.hidden && !reduce;
    wantOn ? start() : stop();
  }

  // init
  if (!initGL()) { if (!init2D()) return; }
  resize();
  paintOnce();
  onShellChange();
  setTimeout(onShellChange, 60);

  window.addEventListener('resize', resize);
  document.addEventListener('visibilitychange', onShellChange);
  if (window.MutationObserver){
    new MutationObserver(onShellChange).observe(document.documentElement, { attributes: true, attributeFilter: ['data-shell'] });
  }
})();

/* ===========================================================
   BÊTA — traits "stonks" verts du fond du menu.
   Polylignes brisées qui montent, dispersées sur tout l'écran.
   Un segment lumineux voyage dessus, la queue s'efface.
   =========================================================== */
(() => {
  const svg = document.querySelector('.bg-lines');
  if (!svg) return;
  if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const NS = 'http://www.w3.org/2000/svg';
  const VW = 1000, VH = 500;
  const N = 13;
  const rnd = (a, b) => a + Math.random() * (b - a);
  const GREENS = ['#41e07d', '#33cf6b', '#5cec92', '#7bf0a6'];

  for (let i = 0; i < N; i++) {
    let x = rnd(-140, VW * 0.55);
    let y = rnd(VH * 0.10, VH * 0.96);
    const steps = Math.round(rnd(6, 12));
    const stepW = rnd(65, 150);
    let d = 'M ' + x.toFixed(0) + ' ' + y.toFixed(0);
    for (let s = 0; s < steps; s++) {
      x += stepW * rnd(0.7, 1.35);
      const up = Math.random() < 0.68;                 // tendance haussière
      y += up ? -rnd(16, 60) : rnd(9, 34);            // cassures nettes, marquées
      y = Math.max(6, Math.min(VH - 4, y));
      d += ' L ' + x.toFixed(0) + ' ' + y.toFixed(0);
    }
    const p = document.createElementNS(NS, 'path');
    p.setAttribute('class', 'bl');
    p.setAttribute('d', d);
    svg.appendChild(p);

    const len = p.getTotalLength() || 900;
    p.style.strokeDasharray = '116 ' + Math.round(len + 400);
    p.style.setProperty('--endoff', (-Math.round(len) - 80) + 'px');
    p.style.animationDuration = rnd(9, 17).toFixed(1) + 's';
    p.style.animationDelay = (-rnd(0, 18)).toFixed(1) + 's';     // toutes à des phases différentes
    p.style.stroke = GREENS[(Math.random() * GREENS.length) | 0];
  }
})();
