/* ===========================================================
   Tous les sons du jeu, synthétisés au vol (Web Audio).
   Aucun fichier audio : marche hors ligne, rien à charger.
   =========================================================== */

const Sound = (() => {
  let ctx = null;
  let sfxBus = null;   // sons du jeu (machines, cartes, roulette, jetons)
  let voiceBus = null; // voix des croupiers

  const stored = k => {
    const v = parseFloat(localStorage.getItem('evelatro-vol-' + k));
    return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : null;
  };
  let sfxVol = stored('sfx');   if (sfxVol == null) sfxVol = 0.8;
  let voiceVol = stored('voice'); if (voiceVol == null) voiceVol = 0.9;

  function ac() {
    if (!ctx) {
      try { ctx = new (window.AudioContext || window.webkitAudioContext)(); }
      catch (e) { ctx = null; }
      if (ctx) {
        sfxBus = ctx.createGain();
        voiceBus = ctx.createGain();
        sfxBus.gain.value = sfxVol;
        voiceBus.gain.value = voiceVol;
        sfxBus.connect(ctx.destination);
        voiceBus.connect(ctx.destination);
      }
    }
    if (ctx && ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function sfx() { ac(); return sfxBus; }
  function voice() { ac(); return voiceBus; }

  function resume() { ac(); }

  function setSfxVolume(v) {
    sfxVol = Math.min(1, Math.max(0, v));
    if (sfxBus) sfxBus.gain.value = sfxVol;
    try { localStorage.setItem('evelatro-vol-sfx', String(sfxVol)); } catch (e) {}
  }
  function setVoiceVolume(v) {
    voiceVol = Math.min(1, Math.max(0, v));
    if (voiceBus) voiceBus.gain.value = voiceVol;
    try { localStorage.setItem('evelatro-vol-voice', String(voiceVol)); } catch (e) {}
  }
  function getSfxVolume() { return sfxVol; }
  function getVoiceVolume() { return voiceVol; }

  function noiseSource(dur) {
    const c = ac(); if (!c) return null;
    const n = Math.max(1, Math.floor(c.sampleRate * dur));
    const buf = c.createBuffer(1, n, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    const src = c.createBufferSource();
    src.buffer = buf;
    return src;
  }

  /* --- clic de jeton --- */
  function chip() {
    const c = ac(); if (!c) return;
    const t = c.currentTime;
    const n = noiseSource(0.06); if (!n) return;
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 2600; bp.Q.value = 1.1;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.13, t + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
    n.connect(bp).connect(g).connect(sfx());
    n.start(t); n.stop(t + 0.08);
    const o = c.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(190, t); o.frequency.exponentialRampToValueAtTime(95, t + 0.06);
    const og = c.createGain();
    og.gain.setValueAtTime(0.09, t);
    og.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
    o.connect(og).connect(sfx());
    o.start(t); o.stop(t + 0.11);
  }

  /* --- une carte qui glisse --- */
  function card(delay = 0) {
    const c = ac(); if (!c) return;
    const t = c.currentTime + delay;
    const n = noiseSource(0.14); if (!n) return;
    const hp = c.createBiquadFilter(); hp.type = 'highpass';
    hp.frequency.setValueAtTime(1400, t);
    hp.frequency.exponentialRampToValueAtTime(500, t + 0.1);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.09, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.13);
    n.connect(hp).connect(g).connect(sfx());
    n.start(t); n.stop(t + 0.15);
  }

  /* --- distribution de plusieurs cartes (petit riffle) --- */
  function deal(count) {
    for (let i = 0; i < count; i++) card(i * 0.07);
  }

  /* --- pluie de pièces : petit gain qui tombe (doux, non agressif) --- */
  function coins() {
    const c = ac(); if (!c) return;
    const t0 = c.currentTime;
    // 5 petites pièces qui tintent, notes claires façon "cha-ching"
    const notes = [1568, 2093, 1760, 2349, 2637];
    notes.forEach((f, i) => {
      const t = t0 + i * 0.055 + Math.random() * 0.01;
      const o = c.createOscillator(); o.type = 'triangle';
      o.frequency.setValueAtTime(f * (0.99 + Math.random() * 0.03), t);
      const o2 = c.createOscillator(); o2.type = 'sine';
      o2.frequency.setValueAtTime(f * 2, t);
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.05, t + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
      const g2 = c.createGain();
      g2.gain.setValueAtTime(0.0001, t);
      g2.gain.exponentialRampToValueAtTime(0.015, t + 0.004);
      g2.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
      o.connect(g).connect(sfx());
      o2.connect(g2).connect(sfx());
      o.start(t); o.stop(t + 0.2);
      o2.start(t); o2.stop(t + 0.1);
    });
  }

  /* --- bip de voix : freq grave (croupier) ou aiguë (croupière) --- */
  function blip(freq) {
    const c = ac(); if (!c) return;
    const t = c.currentTime;
    const o = c.createOscillator();
    o.type = 'square';
    o.frequency.setValueAtTime(freq * (0.93 + Math.random() * 0.14), t);
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2100;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.045, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    o.connect(lp).connect(g).connect(voice());
    o.start(t); o.stop(t + 0.06);
  }

  function tick(when, vol) {
    const c = ac(); if (!c) return;
    const o = c.createOscillator(); o.type = 'triangle';
    o.frequency.setValueAtTime(1900, when);
    o.frequency.exponentialRampToValueAtTime(950, when + 0.02);
    const g = c.createGain();
    g.gain.setValueAtTime(vol, when);
    g.gain.exponentialRampToValueAtTime(0.0001, when + 0.03);
    o.connect(g).connect(sfx());
    o.start(when); o.stop(when + 0.04);
  }

  /* --- roulette : grondement + billes qui ralentissent --- */
  function roulette(duration = 4.2) {
    const c = ac(); if (!c) return;
    const t0 = c.currentTime;
    const n = noiseSource(duration); if (!n) return;
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 300; bp.Q.value = 0.8;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(0.05, t0 + 0.3);
    g.gain.setValueAtTime(0.05, t0 + duration * 0.55);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    n.connect(bp).connect(g).connect(sfx());
    n.start(t0); n.stop(t0 + duration);

    let t = 0.15;
    let gap = 0.045;
    while (t < duration - 0.25) {
      tick(t0 + t, 0.035 + 0.02 * (t / duration));
      gap *= 1.11;
      t += gap;
    }
  }

  /* --- Machine 1 : mécanique, 3 "chunk" descendants --- */
  function slotClassic() {
    const c = ac(); if (!c) return;
    const t0 = c.currentTime;
    [0, 0.3, 0.6].forEach((dt, i) => {
      const t = t0 + dt;
      const o = c.createOscillator(); o.type = 'sawtooth';
      o.frequency.setValueAtTime(150 - i * 22, t);
      o.frequency.exponentialRampToValueAtTime(55, t + 0.12);
      const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 850;
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.1, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.17);
      o.connect(lp).connect(g).connect(sfx());
      o.start(t); o.stop(t + 0.19);
    });
  }

  /* --- Machine 2 : arcade, arpège de bips montants --- */
  function slotNeon() {
    const c = ac(); if (!c) return;
    const t0 = c.currentTime;
    [523, 659, 784, 1047, 1319].forEach((f, i) => {
      const t = t0 + i * 0.08;
      const o = c.createOscillator(); o.type = 'square';
      o.frequency.setValueAtTime(f, t);
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.045, t + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.13);
      o.connect(g).connect(sfx());
      o.start(t); o.stop(t + 0.14);
    });
  }

  /* --- Machine 3 : luxe, balayage de cloche + coups graves --- */
  function slotDeluxe() {
    const c = ac(); if (!c) return;
    const t0 = c.currentTime;
    const o = c.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(320, t0);
    o.frequency.exponentialRampToValueAtTime(1700, t0 + 0.55);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.055, t0 + 0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.75);
    o.connect(g).connect(sfx());
    o.start(t0); o.stop(t0 + 0.8);

    [0.35, 0.75, 1.15].forEach(dt => {
      const t = t0 + dt;
      const b = c.createOscillator(); b.type = 'sine';
      b.frequency.setValueAtTime(95, t);
      b.frequency.exponentialRampToValueAtTime(45, t + 0.15);
      const bg = c.createGain();
      bg.gain.setValueAtTime(0.12, t);
      bg.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
      b.connect(bg).connect(sfx());
      b.start(t); b.stop(t + 0.22);
    });
  }

  return {
    resume, chip, card, deal, blip, coins, roulette, slotClassic, slotNeon, slotDeluxe,
    setSfxVolume, setVoiceVolume, getSfxVolume, getVoiceVolume,
  };
})();

window.Sound = Sound;

// Débloque l'audio au premier contact (politique des navigateurs).
window.addEventListener('pointerdown', () => Sound.resume(), { once: true });
window.addEventListener('keydown', () => Sound.resume(), { once: true });
