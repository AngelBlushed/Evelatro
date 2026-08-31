/* ===========================================================
   Musique de fond — morceaux générés au vol (aucun fichier).

   Chaque morceau est rendu UNE fois dans un tampon audio
   (AudioBuffer), puis joué en boucle NATIVE (source.loop = true) :
   c'est le navigateur qui gère la boucle, donc pas de minuteur,
   pas de "scheduler", pas de trou, pas de morceau qui saute.

   Un seul petit minuteur sert à enchaîner sur le morceau suivant
   en mode "tout lire".

   Contexte audio séparé des bruitages du jeu.
   Démarre au 1er contact utilisateur (les navigateurs interdisent
   le son avant).
   =========================================================== */

const Music = (() => {
  let ctx = null;
  let master = null;

  let vol = readNum('evelatro-vol-music', 0.4);
  let current = -1;
  let playing = false;
  const activeVoices = new Set();   // utilisé seulement pendant le rendu hors-ligne

  let repeat = (localStorage.getItem('evelatro-music-repeat') === 'one') ? 'one' : 'all';
  let shuffle = localStorage.getItem('evelatro-music-shuffle') === '1';
  const blacklist = new Set(JSON.parse(localStorage.getItem('evelatro-music-blacklist') || '[]'));

  const listeners = [];
  const emit = () => listeners.forEach(fn => { try { fn(); } catch (e) {} });

  function readNum(k, d) {
    const v = parseFloat(localStorage.getItem(k));
    return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : d;
  }
  function saveState() {
    try {
      localStorage.setItem('evelatro-music-state', JSON.stringify({
        id: current >= 0 ? TRACKS[current].id : null,
        playing,
      }));
    } catch (e) {}
  }

  function ensureCtx() {
    if (!ctx) {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain();
      master.gain.value = vol;
      master.connect(ctx.destination);
    }
    return ctx;
  }

  const mtof = m => 440 * Math.pow(2, (m - 69) / 12);

  function tone(o, t, dur, freq, opt) {
    opt = opt || {};
    const osc = ctx.createOscillator();
    osc.type = opt.type || 'sine';
    osc.frequency.value = freq;
    if (opt.detune) osc.detune.value = opt.detune;
    const g = ctx.createGain();
    const peak = opt.gain || 0.06;
    const a = opt.a || 0.02;
    const r = opt.r || 0.15;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.setValueAtTime(peak, t + dur);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur + r);
    let node = osc;
    if (opt.cutoff) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = opt.cutoff;
      osc.connect(f);
      node = f;
    }
    node.connect(g).connect(o);
    osc.start(t);
    osc.stop(t + dur + r + 0.05);
    activeVoices.add(osc);
    osc.onended = () => activeVoices.delete(osc);
  }

  function chord(rootMidi, kind) {
    const table = { maj7: [0, 4, 7, 11], min7: [0, 3, 7, 10], dom7: [0, 4, 7, 10], maj: [0, 4, 7], min: [0, 3, 7] };
    return (table[kind] || table.maj).map(s => mtof(rootMidi + s));
  }

  /* --- Morceaux : render(out, t0) planifie UNE boucle, renvoie sa durée --- */
  function twoPass(prog, cb, t0, bar) {
    for (let pass = 0; pass < 2; pass++) {
      prog.forEach((ch, i) => cb(ch, t0 + (pass * prog.length + i) * 2 * bar, pass, i));
    }
    return prog.length * 2 * 2 * bar;
  }

  const TRACKS = [
    {
      id: 'salon', name: 'Salon feutré', bpm: 74,
      render(out, t0) {
        const bar = 4 * (60 / this.bpm);
        return twoPass([[60, 'maj7'], [57, 'min7'], [62, 'min7'], [55, 'dom7']], ([root, kind], t, pass) => {
          const b = 60 / this.bpm;
          chord(root, kind).forEach(f => tone(out, t, 2 * 4 * b, f, { type: 'sine', gain: 0.026, cutoff: 1400, a: 0.4, r: 0.6 }));
          for (let bt = 0; bt < 8; bt += 2) tone(out, t + bt * b, b * 1.4, mtof(root - 24), { type: 'triangle', gain: 0.085, r: 0.2 });
          [1.5, 3.5, 6].forEach(bt => {
            if (Math.random() < (pass ? 0.75 : 0.5)) {
              tone(out, t + bt * b, b, mtof(root + 12 + (pass ? 12 : 0) + [0, 4, 7, 11][Math.floor(Math.random() * 4)]), { type: 'triangle', gain: 0.03, r: 0.4 });
            }
          });
        }, t0, bar);
      },
    },
    {
      id: 'neon', name: 'Néon', bpm: 108,
      render(out, t0) {
        const bar = 4 * (60 / this.bpm);
        return twoPass([[57, 'min'], [53, 'maj'], [48, 'maj'], [55, 'maj']], ([root, kind], t, pass) => {
          const b = 60 / this.bpm;
          chord(root, kind).forEach(f => tone(out, t, 2 * 4 * b, f, { type: 'sawtooth', gain: 0.018, cutoff: 900, a: 0.2, r: 0.4 }));
          for (let e = 0; e < 16; e++) tone(out, t + e * 0.5 * b, 0.35 * b, mtof(root - 12), { type: 'sawtooth', gain: 0.065, cutoff: 420, r: 0.05 });
          const notes = chord(root, kind).concat(chord(root, kind).map(f => f * 2));
          for (let s = 0; s < 16; s++) tone(out, t + s * 0.5 * b, 0.3 * b, notes[(s + (pass ? 2 : 0)) % notes.length] * (pass ? 2 : 1), { type: 'square', gain: 0.026, cutoff: 2200, r: 0.08 });
        }, t0, bar);
      },
    },
    {
      id: 'velours', name: 'Velours', bpm: 56,
      render(out, t0) {
        const b = 60 / this.bpm;
        [[62, 'maj7'], [59, 'min7'], [64, 'min7'], [57, 'maj7']].forEach(([root, kind], i) => {
          const t = t0 + i * 4 * 4 * b;
          chord(root, kind).forEach(f => {
            tone(out, t, 4 * 4 * b, f, { type: 'sawtooth', gain: 0.018, cutoff: 700, a: 1.6, r: 2, detune: -6 });
            tone(out, t, 4 * 4 * b, f, { type: 'sawtooth', gain: 0.018, cutoff: 700, a: 1.6, r: 2, detune: 6 });
          });
          if (Math.random() < 0.85) tone(out, t + (4 + Math.random() * 8) * b, 2 * b, mtof(root + 24 + [0, 7, 12][Math.floor(Math.random() * 3)]), { type: 'sine', gain: 0.022, r: 1.6 });
        });
        return 16 * 4 * b;
      },
    },
    {
      id: 'jackpot', name: 'Jackpot', bpm: 140,
      render(out, t0) {
        const bar = 4 * (60 / this.bpm);
        return twoPass([60, 55, 57, 53].map(r => [r]), ([root], t, pass) => {
          const b = 60 / this.bpm;
          const penta = [0, 2, 4, 7, 9];
          for (let bt = 0; bt < 8; bt++) tone(out, t + bt * b, 0.5 * b, mtof(root - 12), { type: 'square', gain: 0.045, cutoff: 800, r: 0.05 });
          for (let s = 0; s < 16; s++) {
            const deg = penta[(s + (pass ? 2 : 0)) % penta.length] + (s % 8 >= 4 ? 12 : 0) + (pass ? 12 : 0);
            tone(out, t + s * 0.5 * b, 0.4 * b, mtof(root + deg), { type: 'square', gain: 0.036, cutoff: 3000, r: 0.06 });
          }
        }, t0, bar);
      },
    },
    {
      id: 'minuit', name: 'Minuit', bpm: 100,
      render(out, t0) {
        const bar = 4 * (60 / this.bpm);
        return twoPass([[45, 'min7'], [50, 'min7'], [43, 'maj7'], [48, 'maj7']], ([root, kind], t, pass) => {
          const b = 60 / this.bpm;
          chord(root + 12, kind).forEach(f => tone(out, t, 2 * 4 * b, f, { type: 'sawtooth', gain: 0.016, cutoff: 1100, a: 0.5, r: 0.8 }));
          for (let bt = 0; bt < 8; bt++) tone(out, t + bt * b, 0.45 * b, mtof(root), { type: 'sine', gain: 0.08, r: 0.06 });
          [1, 3, 5, 7].forEach(bt => chord(root + 12, kind).forEach(f => tone(out, t + bt * b, 0.25 * b, f, { type: 'square', gain: 0.02, cutoff: 1600, r: 0.15 })));
          if (pass) [2.5, 6.5].forEach(bt => tone(out, t + bt * b, 0.3 * b, mtof(root + 24 + [3, 7, 10][Math.floor(Math.random() * 3)]), { type: 'triangle', gain: 0.03, r: 0.3 }));
        }, t0, bar);
      },
    },
    {
      id: 'brume', name: 'Brume', bpm: 48,
      render(out, t0) {
        const b = 60 / this.bpm;
        [[55, 'maj7'], [60, 'maj7'], [53, 'maj7'], [58, 'min7']].forEach(([root, kind], i) => {
          const t = t0 + i * 4 * 4 * b;
          chord(root, kind).forEach((f, k) => {
            tone(out, t, 4 * 4 * b, f, { type: 'triangle', gain: 0.02, cutoff: 600, a: 2, r: 2.5, detune: (k % 2 ? 5 : -5) });
          });
          for (let n = 0; n < 3; n++) {
            if (Math.random() < 0.7) tone(out, t + (2 + Math.random() * 12) * b, 3 * b, mtof(root + 24 + [0, 4, 7, 11][Math.floor(Math.random() * 4)]), { type: 'sine', gain: 0.018, a: 1, r: 2 });
          }
        });
        return 16 * 4 * b;
      },
    },
  ];

  /* ---------------------------------------------------------------
     Rendu d'un morceau en mémoire (une seule fois par morceau).
     --------------------------------------------------------------- */
  const SR = 44100;
  const buffers = {};        // id -> { buffer, loopLen }
  const bufOrder = [];       // pour ne pas garder trop de tampons en RAM

  function remember(id) {
    const k = bufOrder.indexOf(id);
    if (k >= 0) bufOrder.splice(k, 1);
    bufOrder.push(id);
    while (bufOrder.length > 4) delete buffers[bufOrder.shift()];
  }

  function renderOffline(i) {
    const id = TRACKS[i].id;
    if (buffers[id]) { remember(id); return Promise.resolve(buffers[id]); }

    const MAX = 90;    // secondes : plus long que le plus long morceau (~80 s)
    let off;
    try { off = new OfflineAudioContext(2, Math.ceil(SR * MAX), SR); }
    catch (e) { return Promise.reject(e); }

    const prevCtx = ctx;
    ctx = off;                                   // tone()/chord() lisent ctx
    let loopLen = 8;
    try {
      const n = TRACKS[i].render(off.destination, 0.001);
      if (n > 0 && isFinite(n)) loopLen = n;
    } catch (e) { /* garde 8 */ }
    ctx = prevCtx;
    activeVoices.clear();

    return off.startRendering().then(rendered => {
      const frames = Math.max(1, Math.min(rendered.length, Math.ceil(SR * loopLen)));
      const home = ensureCtx();
      const buf = home.createBuffer(2, frames, SR);
      for (let c = 0; c < 2; c++) {
        buf.copyToChannel(rendered.getChannelData(c).subarray(0, frames), c);
      }
      buffers[id] = { buffer: buf, loopLen };
      remember(id);
      return buffers[id];
    });
  }

  /* ---------------------------------------------------------------
     Lecture
     --------------------------------------------------------------- */
  let source = null;         // AudioBufferSourceNode en cours
  let advanceTimer = null;
  let startedAt = 0;         // ctx.currentTime au démarrage de la boucle
  let curLoopLen = 8;
  let frozenProg = 0;
  let genId = 0;             // pour ignorer un rendu qui revient trop tard

  const playable = () => TRACKS.map((_, i) => i).filter(i => !blacklist.has(TRACKS[i].id));

  function stopSource() {
    clearTimeout(advanceTimer);
    advanceTimer = null;
    if (source) {
      try { source.onended = null; source.stop(); } catch (e) {}
      try { source.disconnect(); } catch (e) {}
      source = null;
    }
  }

  function armAdvance(seconds) {
    clearTimeout(advanceTimer);
    advanceTimer = null;
    if (repeat === 'all') advanceTimer = setTimeout(goNextTrack, Math.max(500, seconds * 1000));
  }

  function goNextTrack() {
    if (!playing || repeat !== 'all') return;
    const list = playable();
    if (!list.length) return;
    let pos = list.indexOf(current);
    if (pos < 0) pos = 0;
    const nx = shuffle
      ? list[Math.floor(Math.random() * list.length)]
      : list[(pos + 1) % list.length];
    playIndex(nx);
  }

  function playIndex(i) {
    ensureCtx();
    const mine = ++genId;
    const resumeP = (ctx.state === 'suspended') ? ctx.resume().catch(() => {}) : Promise.resolve();
    current = i;
    playing = true;
    emit();
    saveState();

    Promise.all([renderOffline(i).catch(() => null), resumeP]).then(([entry]) => {
      if (mine !== genId || !playing) return;    // on a changé de morceau entre-temps
      if (!entry) return;
      stopSource();
      source = ctx.createBufferSource();
      source.buffer = entry.buffer;
      source.loop = true;
      source.loopStart = 0;
      source.loopEnd = entry.loopLen;
      source.connect(master);
      try { if (ctx.state === 'suspended') ctx.resume(); } catch (e) {}
      source.start();
      startedAt = ctx.currentTime;
      curLoopLen = entry.loopLen;
      frozenProg = 0;
      armAdvance(entry.loopLen);

      // pré-rend le suivant pour un enchaînement net
      const list = playable();
      const pos = list.indexOf(i);
      if (pos >= 0 && list.length > 1) renderOffline(list[(pos + 1) % list.length]).catch(() => {});
      emit();
    }).catch(() => {});
  }

  function play(id) {
    const list = playable();
    if (!list.length) return;
    let i = id ? TRACKS.findIndex(t => t.id === id) : (current >= 0 ? current : list[0]);
    if (i < 0 || blacklist.has(TRACKS[i].id)) i = list[0];
    if (i === current && playing && source) return;
    if (!id && shuffle && current < 0) i = list[Math.floor(Math.random() * list.length)];
    playIndex(i);
  }

  function pause() {
    if (!playing) return;
    playing = false;
    clearTimeout(advanceTimer);
    advanceTimer = null;
    progress();                       // fige la valeur affichée
    if (ctx) { try { ctx.suspend(); } catch (e) {} }
    emit();
    saveState();
  }

  function resume() {
    if (playing) return;
    if (current < 0 || !source) { play(); return; }
    playing = true;
    if (ctx) { try { ctx.resume(); } catch (e) {} }
    const elapsed = ((ctx.currentTime - startedAt) % curLoopLen + curLoopLen) % curLoopLen;
    armAdvance(curLoopLen - elapsed);
    emit();
    saveState();
  }

  function toggle() { playing ? pause() : resume(); }

  function stop() {
    playing = false;
    stopSource();
    if (ctx) { try { ctx.close(); } catch (e) {} ctx = null; master = null; }
    current = -1;
    frozenProg = 0;
    emit();
    saveState();
  }

  function step(dir) {
    const list = playable();
    if (!list.length) return;
    let pos = list.indexOf(current);
    if (pos < 0) pos = 0;
    const i = shuffle
      ? list[Math.floor(Math.random() * list.length)]
      : list[(pos + dir + list.length) % list.length];
    playIndex(i);
  }
  const next = () => step(1);
  const prev = () => step(-1);

  function progress() {
    if (current < 0 || !curLoopLen || !ctx) return 0;
    if (!playing) return frozenProg;
    const t = ((ctx.currentTime - startedAt) % curLoopLen + curLoopLen) % curLoopLen;
    frozenProg = Math.max(0, Math.min(0.999, t / curLoopLen));
    return frozenProg;
  }

  function setVolume(v) {
    vol = Math.min(1, Math.max(0, v));
    if (master) master.gain.value = vol;
    try { localStorage.setItem('evelatro-vol-music', String(vol)); } catch (e) {}
  }
  const getVolume = () => vol;

  function setRepeat(m) {
    repeat = (m === 'one') ? 'one' : 'all';
    try { localStorage.setItem('evelatro-music-repeat', repeat); } catch (e) {}
    if (playing && source) {
      const elapsed = ((ctx.currentTime - startedAt) % curLoopLen + curLoopLen) % curLoopLen;
      armAdvance(curLoopLen - elapsed);   // (re)pose ou enlève le minuteur d'avance
    }
    emit();
  }
  const getRepeat = () => repeat;
  function setShuffle(on) { shuffle = !!on; try { localStorage.setItem('evelatro-music-shuffle', on ? '1' : '0'); } catch (e) {} emit(); }
  const getShuffle = () => shuffle;

  function toggleBlacklist(id) {
    if (blacklist.has(id)) blacklist.delete(id);
    else { blacklist.add(id); if (current >= 0 && TRACKS[current].id === id) next(); }
    try { localStorage.setItem('evelatro-music-blacklist', JSON.stringify([...blacklist])); } catch (e) {}
    emit();
  }
  const isBlacklisted = id => blacklist.has(id);

  function tracks() {
    return TRACKS.map((t, i) => ({ id: t.id, name: t.name, bpm: t.bpm, current: i === current, blacklisted: blacklist.has(t.id) }));
  }
  function state() {
    return { playing, current, currentName: current >= 0 ? TRACKS[current].name : null, repeat, shuffle };
  }

  function onChange(fn) {
    listeners.push(fn);
    return () => { const i = listeners.indexOf(fn); if (i >= 0) listeners.splice(i, 1); };
  }

  // --- démarrage automatique au 1er contact utilisateur ---
  let autoStarted = false;
  function autoStart() {
    if (autoStarted) return;
    autoStarted = true;
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem('evelatro-music-state') || '{}'); } catch (e) {}
    try { play(saved.id || undefined); }
    catch (e) { try { play(); } catch (e2) { /* tant pis */ } }
  }
  ['pointerdown', 'keydown', 'click', 'touchstart'].forEach(ev =>
    window.addEventListener(ev, autoStart, { once: true, capture: true }));

  return {
    play, pause, resume, toggle, stop, next, prev,
    progress, setVolume, getVolume,
    setRepeat, getRepeat, setShuffle, getShuffle,
    toggleBlacklist, isBlacklisted, tracks, state, onChange,
  };
})();

window.Music = Music;
