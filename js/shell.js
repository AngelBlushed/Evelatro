/* ===========================================================
   BÊTA 1.3 — Coquille d'accueil.

   Trois écrans :
     launch  = menu d'accueil (néon)  -> #launch-screen
     hub     = choix du monde          -> #hub-screen
     casino  = le jeu complet (1.2)    -> #app

   Charge APRÈS app.js. app.js n'auto-démarre plus le casino :
   c'est Shell.enterCasino() qui appelle EveLatro.boot().
   =========================================================== */

window.__EVELATRO_SHELL__ = true;

const Shell = (() => {
  const launch = document.getElementById('launch-screen');
  const hub = document.getElementById('hub-screen');
  const app = document.getElementById('app');

  let screen = null;
  let casinoBooted = false;

  /* ---------- disposition : toujours en extra-large (plein écran) ---------- */
  function layout() { return 'xl'; }
  function setLayout() { document.documentElement.dataset.layout = 'xl'; }
  document.documentElement.dataset.layout = 'xl';

  /* ---------- touche F : masque le cadre de la fenêtre (appli PC) ----------
     1re pression : enlève la barre blanche (titre / réduire / fermer)
     2e pression  : enlève aussi la barre des tâches (plein écran total)
     3e pression  : revient à la fenêtre normale                         */
  window.addEventListener('keydown', (e) => {
    if ((e.key === 'f' || e.key === 'F') && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const t = e.target;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName || ''))) return;
      try {
        if (window.electronAuth && electronAuth.cycleChrome) {
          const mode = electronAuth.cycleChrome(screen || 'launch');
          const label = mode === 'frameless' ? 'Barre du haut masquée'
            : mode === 'fullscreen' ? 'Plein écran total'
            : 'Fenêtre normale';
          try { Toast.info && Toast.info(label + '  ·  F pour changer'); } catch (er) {}
        }
      } catch (er) { /* pas sur PC */ }
    }
  });

  /* ---------- musique ---------- */
  try { Music.suppressAutoStart(); } catch (e) {}
  let audioAllowed = false;
  function applyScreenMusic() {
    if (!audioAllowed) return;
    try { screen === 'casino' ? Music.exitMenu() : Music.playMenu(); } catch (e) {}
  }
  // 1er geste utilisateur n'importe où -> l'audio devient permis
  ['pointerdown', 'keydown', 'touchstart'].forEach(ev =>
    window.addEventListener(ev, () => { audioAllowed = true; applyScreenMusic(); }, { once: true, capture: true }));

  /* ---------- navigation ---------- */
  let resuming = false;   // true pendant la reprise post-touche-F (pas de patch notes)

  function show(next) {
    screen = next;
    try { sessionStorage.setItem('evelatro-shell-screen', next); } catch (e) {}
    launch.hidden = next !== 'launch';
    hub.hidden = next !== 'hub';
    app.hidden = next !== 'casino';
    document.documentElement.dataset.shell = next;

    applyScreenMusic();
    if (next !== 'casino') refreshHub();
    if (next === 'hub' && !resuming) { try { window.Patch && Patch.autoShow(); } catch (e) {} }
    try { window.NetGuard && NetGuard.evaluate(); } catch (e) {}
    try { window.scrollTo(0, 0); } catch (e) {}
  }

  function go(next) {
    if (next === 'casino') return enterCasino();
    show(next);
  }

  function enterCasino() {
    show('casino');   // on révèle #app d'abord (les jeux mesurent leur taille au rendu)
    if (!casinoBooted) {
      casinoBooted = true;
      try { window.EveLatro && EveLatro.boot(); } catch (e) { console.error('boot casino', e); }
    }
    // demandes d'échange en attente (reçues pendant qu'on était ailleurs / hors-ligne)
    try { window.CsTrade && CsTrade.checkIncoming(); } catch (e) {}
  }

  function backToHub() {
    if (document.body.classList.contains('fight-mode')) {
      try { Toast.info && Toast.info('Duel en cours — impossible de quitter maintenant.'); } catch (e) {}
      return;
    }
    try { EveLatro && EveLatro.closeMulti && EveLatro.closeMulti(); } catch (e) {}
    show('hub');
  }

  /* ---------- pop-up "à venir" ---------- */
  const SOON = {
    soleil: { emoji: '🌞', name: 'Soleil', txt: 'Un monde ensoleillé arrive bientôt.' },
    garden: { emoji: '🌿', name: 'Garden', txt: 'Le jardin est encore en travaux.' },
    cards: { emoji: '🃏', name: 'Cartes à collectionner', txt: 'Le jeu de cartes à collectionner arrive dans une prochaine mise à jour.' },
  };
  function soon(worldId) {
    const w = SOON[worldId];
    if (!w) return;
    openModal({
      title: w.emoji + '  ' + w.name,
      build(body, close) {
        body.append(
          el('p', { class: 'soon-p', text: w.txt }),
          el('p', { class: 'soon-p soon-small', text: 'À venir !' }),
          el('div', { class: 'set-actions' },
            el('button', { class: 'btn btn-primary', text: 'OK', onClick: close })),
        );
      },
    });
  }

  /* ---------- liens externes (Discord / Patreon) ---------- */
  //  Remplis ces 2 liens quand tu les as (invitation Discord + page Patreon).
  const LINKS = {
    discord: 'https://discord.gg/jgzv7pzwHM',
    google: 'https://evelatro.pages.dev/',
  };
  function openSoc(kind) {
    const url = LINKS[kind];
    if (!url) { try { Toast.info && Toast.info('Lien ' + kind + ' bientôt disponible.'); } catch (e) {} return; }
    try { window.openExternal ? openExternal(url) : window.open(url, '_blank', 'noopener'); } catch (e) {}
  }

  /* ---------- hub : compteurs (succès, chat) ---------- */
  function refreshHub() {
    try {
      if (window.Achievements) {
        const d = Achievements.summary();
        const c = document.getElementById('hub-ach-count');
        if (c) c.textContent = d.done + '/' + d.total;
        document.getElementById('hub-ach').classList.toggle('is-full', d.done >= d.total);
      }
    } catch (e) {}
    syncChatBadge();
  }

  function syncChatBadge() {
    const src = document.getElementById('chat-badge');
    const dst = document.getElementById('hub-chat-badge');
    if (!src || !dst) return;
    const n = src.hidden ? 0 : (parseInt(src.textContent, 10) || 0);
    dst.textContent = n > 9 ? '9+' : String(n);
    dst.hidden = n <= 0;
  }

  /* ---------- câblage ---------- */
  function wire() {
    // bouton "Quitter" : seulement sur l'appli PC (Electron)
    const quitBtn = launch.querySelector('.cb-quit');
    const canQuit = !!(window.electronAuth && window.electronAuth.quit)
      || !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
    if (quitBtn && canQuit) quitBtn.hidden = false;

    launch.querySelectorAll('.chunk-btn').forEach(b => {
      b.addEventListener('click', () => {
        const act = b.dataset.act;
        if (act === 'play') go('hub');
        else if (act === 'options') { try { openSettings(); } catch (e) {} }
        else if (act === 'patch') { try { Patch.open(); } catch (e) {} }
        else if (act === 'quit') { try { quitApp(); } catch (e) {} }
      });
    });

    hub.querySelectorAll('.world').forEach(w => {
      w.addEventListener('click', () => {
        const id = w.dataset.world;
        if (id === 'casino') go('casino');
        else soon(id);
      });
    });

    document.getElementById('hub-home').addEventListener('click', () => go('launch'));
    document.getElementById('hub-settings').addEventListener('click', () => { try { openSettings(); } catch (e) {} });
    document.getElementById('hub-music').addEventListener('click', () => { try { openMusicPanel(); } catch (e) {} });
    document.getElementById('hub-chat').addEventListener('click', () => { try { Chat.openPanel(); } catch (e) {} });
    document.getElementById('hub-ach').addEventListener('click', () => { try { Achievements.openPanel(); } catch (e) {} });

    launch.querySelectorAll('.soc-btn').forEach(b => {
      b.addEventListener('click', () => openSoc(b.dataset.soc));
    });

    // éventail de cartes = aperçu des mondes : on fige l'éventail pendant le survol.
    // Délégation + petite tempo à la sortie -> pas de clignotement quand la souris
    // balaie vite plusieurs cartes.
    const fan = launch.querySelector('.fan');
    if (fan) {
      let peekOff = null;
      const setPeek = on => {
        clearTimeout(peekOff);
        if (on) fan.classList.add('is-peek');
        else peekOff = setTimeout(() => fan.classList.remove('is-peek'), 130);
      };
      fan.addEventListener('pointerover', e => { if (e.target.closest('.fan-c')) setPeek(true); });
      fan.addEventListener('pointerout', e => {
        const to = e.relatedTarget;
        if (!to || !to.closest || !to.closest('.fan')) setPeek(false);
      });
    }

    const back = document.getElementById('btn-hub');
    if (back) back.addEventListener('click', backToHub);

    // le chat met à jour #chat-badge -> on reflète sur le hub
    const src = document.getElementById('chat-badge');
    if (src && window.MutationObserver) {
      new MutationObserver(syncChatBadge).observe(src, { attributes: true, childList: true, characterData: true, subtree: true });
    }
    try { window.Achievements && Achievements.onChange(refreshHub); } catch (e) {}
  }

  // #build-tag
  try {
    const bt = document.getElementById('build-tag');
    if (bt && window.APP_VERSION) bt.textContent = 'v' + window.APP_VERSION;
  } catch (e) {}

  wire();

  // reprise après un changement de cadre fenêtre (touche F recrée la fenêtre)
  let resume = null;
  try { resume = new URLSearchParams(location.search).get('resume'); } catch (e) {}
  try { if (!resume) resume = sessionStorage.getItem('evelatro-shell-screen'); } catch (e) {}
  if (resume === 'hub' || resume === 'casino') {
    resuming = true;
    show('hub');
    if (resume === 'casino') enterCasino();
    resuming = false;
  } else {
    show('launch');
  }

  return { go, enterCasino, backToHub, setLayout, layout, refreshHub, current: () => screen };
})();

window.Shell = Shell;
