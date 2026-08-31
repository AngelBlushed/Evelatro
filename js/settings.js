/* ===========================================================
   Réglages (bouton engrenage) et lecteur de musique
   (bouton note) — en haut à gauche.
   =========================================================== */

function quitApp() {
  try {
    if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.App) {
      window.Capacitor.Plugins.App.exitApp();
      return;
    }
    if (window.Capacitor && window.Capacitor.registerPlugin) {
      window.Capacitor.registerPlugin('App').exitApp();
      return;
    }
  } catch (e) { /* rien */ }
  if (window.electronAuth && window.electronAuth.quit) { window.electronAuth.quit(); return; }
  window.close();
}

/* interrupteur oui/non lié à une clé localStorage ('0' = off, sinon on) */
function settingToggle(label, key, defaultOn) {
  const on = () => { const v = localStorage.getItem(key); return v == null ? !!defaultOn : v !== '0'; };
  const sw = el('button', { class: 'set-switch' + (on() ? ' on' : ''), 'aria-label': label });
  sw.addEventListener('click', () => {
    const next = !on();
    try { localStorage.setItem(key, next ? '1' : '0'); } catch (e) {}
    sw.classList.toggle('on', next);
  });
  return el('label', { class: 'set-row' }, el('span', { class: 'set-row-label', text: label }), sw);
}

/* --- Réglages --- */
function openSettings() {
  openModal({
    title: 'Réglages',
    build(body, close) {
      body.append(
        el('div', { class: 'set-actions' },
          el('button', { class: 'btn btn-primary', text: '▸ Reprendre', onClick: close }),
          el('button', { class: 'btn btn-danger', text: 'Quitter le jeu', onClick: quitApp }),
        ),
        el('div', { class: 'set-section' },
          volumeSlider('Musique', () => Music.getVolume(), v => Music.setVolume(v)),
          volumeSlider('Sons du jeu', () => Sound.getSfxVolume(), v => Sound.setSfxVolume(v)),
          volumeSlider('Voix des croupiers', () => Sound.getVoiceVolume(), v => Sound.setVoiceVolume(v)),
        ),
        el('div', { class: 'set-section' },
          settingToggle('Pop-up des actions des autres', 'evelatro-friend-toasts', true),
          settingToggle('Aperçu des messages du chat', 'evelatro-chat-overlay', true),
        ),
        el('p', { class: 'game-sub', text: 'Les réglages sont gardés pour la prochaine fois.' }),
      );
    },
  });
}

/* --- Lecteur de musique --- */
function openMusicPanel() {
  let off = null;
  let raf = 0;
  openModal({
    title: 'Musique',
    onClose() { if (off) off(); cancelAnimationFrame(raf); },
    build(body, close) {
      const listWrap = el('div', { class: 'music-list' });
      const player = el('div', { class: 'music-player' });
      body.append(listWrap, player);

      off = Music.onChange(render);
      function tickBar() {
        const bar = player.querySelector('.mp-fill');
        if (bar) bar.style.width = (Music.progress() * 100).toFixed(1) + '%';
        raf = requestAnimationFrame(tickBar);
      }
      raf = requestAnimationFrame(tickBar);

      render();

      function render() {
        clear(listWrap);
        Music.tracks().forEach(t => {
          const row = el('div', { class: 'music-row' + (t.current ? ' is-current' : '') + (t.blacklisted ? ' is-black' : '') });
          row.append(
            el('button', {
              class: 'music-pick', text: t.name,
              title: t.blacklisted ? 'Débloquer pour pouvoir la jouer' : 'Jouer ce morceau',
              onClick: () => { if (!t.blacklisted) Music.play(t.id); },
            }),
            el('button', {
              class: 'music-ban' + (t.blacklisted ? ' on' : ''),
              text: t.blacklisted ? '🚫' : '∅',
              title: t.blacklisted ? 'Réautoriser' : 'Ne jamais jouer',
              onClick: () => Music.toggleBlacklist(t.id),
            }),
          );
          listWrap.append(row);
        });

        const s = Music.state();
        clear(player);
        player.append(
          el('div', { class: 'mp-now', text: s.currentName ? (s.playing ? '♪ ' : '⏸ ') + s.currentName : 'Aucune musique' }),
          el('div', { class: 'mp-progress' }, el('div', { class: 'mp-fill' })),
          el('div', { class: 'mp-controls' },
            el('button', { class: 'mp-btn' + (s.shuffle ? ' on' : ''), text: '🔀', title: 'Aléatoire', onClick: () => Music.setShuffle(!s.shuffle) }),
            el('button', { class: 'mp-btn', text: '⏮', title: 'Précédent', onClick: () => Music.prev() }),
            el('button', { class: 'mp-btn mp-play', text: s.playing ? '⏸' : '▶', title: 'Lecture / pause', onClick: () => Music.toggle() }),
            el('button', { class: 'mp-btn', text: '⏭', title: 'Suivant', onClick: () => Music.next() }),
            el('button', {
              class: 'mp-btn on',
              text: s.repeat === 'one' ? '🔂' : '🔁',
              title: s.repeat === 'one' ? 'Répète ce morceau' : 'Lit toute la liste puis recommence',
              onClick: () => Music.setRepeat(s.repeat === 'one' ? 'all' : 'one'),
            }),
          ),
        );
      }
    },
  });
}

/* --- Câblage des 2 boutons en haut à gauche --- */
(() => {
  const s = document.getElementById('btn-settings');
  const m = document.getElementById('btn-music');
  if (s) s.addEventListener('click', openSettings);
  if (m) m.addEventListener('click', openMusicPanel);
})();
