/* ===========================================================
   Chef d'orchestre.
   - construit le menu à partir des jeux enregistrés
   - affiche le jeu choisi
   - crédits, message de recharge, bouton d'urgence
   - panneau "Multi" (dock en bas à droite)
   =========================================================== */

(() => {
  const ORDER = ['blackjack', 'slots', 'poker', 'roulette', 'leaderboard'];

  const menu = document.getElementById('menu');
  const stage = document.getElementById('stage');
  const creditsEl = document.getElementById('credits');
  const refillEl = document.getElementById('refill');
  const walletEl = document.getElementById('wallet');
  const rescueBtn = document.getElementById('rescue');

  const tabs = {};
  let current = null;
  let refillTimer = null;

  Bank.onChange(v => { creditsEl.textContent = v; });

  Bank.onRefill(info => {
    refillEl.textContent = (info && info.isRecord)
      ? `Nouveau record : ${info.peak} crédits ! (+200 pour rejouer)`
      : '+200 crédits offerts !';
    refillEl.hidden = false;
    clearTimeout(refillTimer);
    refillTimer = setTimeout(() => { refillEl.hidden = true; }, 4500);
    Activity.log(info && info.isRecord
      ? { game: 'EveLatro', detail: `Nouveau record : ${info.peak} crédits !`, tone: 'record' }
      : { game: 'EveLatro', detail: 'Ruine — recharge de 200 crédits', tone: 'lose' });
    if (current === 'leaderboard') select('leaderboard', true);
  });

  // Bouton d'urgence.
  walletEl.addEventListener('click', () => { rescueBtn.hidden = !rescueBtn.hidden; });
  rescueBtn.addEventListener('click', () => {
    if (Bank.rescue()) Activity.log('Bouton d\'urgence : retour à 200 crédits', 'info');
    rescueBtn.hidden = true;
    if (current === 'leaderboard') select('leaderboard', true);
  });

  // Dock : les 2 premiers boutons = placeholder "Bientôt !"
  // MAIS si le panneau multi est ouvert, n'importe quel bouton du dock le ferme.
  const dockHint = document.getElementById('dock-hint');
  let dockTimer = null;
  document.querySelectorAll('.dock-btn[data-hint]').forEach(btn => {
    btn.addEventListener('click', () => {
      if (!panel.hidden) { closeMulti(); return; }
      btn.animate(
        [{ transform: 'translateY(0)' }, { transform: 'translateY(-4px)' }, { transform: 'translateY(0)' }],
        { duration: 200, easing: 'ease-out' });
      dockHint.textContent = btn.dataset.hint || 'Bientôt !';
      dockHint.hidden = false;
      clearTimeout(dockTimer);
      dockTimer = setTimeout(() => { dockHint.hidden = true; }, 1800);
    });
  });

  // Dock : bouton multijoueur -> ouvre le panneau.
  const panel = document.getElementById('multi-panel');
  const panelBody = document.getElementById('multi-body');
  const panelTabs = [...document.querySelectorAll('.multi-tab')];
  let panelCleanup = null;
  let panelView = 'leaderboard';

  const VIEWS = {
    leaderboard: renderFriendsPanel,
    live: renderActivityPanel,
    players: renderPlayersPanel,
    vs: renderVsPanel,
  };
  function showMultiView(view) {
    panelView = view;
    panelTabs.forEach(t => t.classList.toggle('is-active', t.dataset.view === view));
    if (panelCleanup) { panelCleanup(); panelCleanup = null; }
    clear(panelBody);
    panelCleanup = (VIEWS[view] || renderFriendsPanel)(panelBody);
  }
  function openMulti(view) {
    panel.hidden = false;
    document.getElementById('dock-multi').classList.add('is-active');
    showMultiView(view || panelView);
  }
  function closeMulti() {
    if (panelCleanup) { panelCleanup(); panelCleanup = null; }
    panel.hidden = true;
    document.getElementById('dock-multi').classList.remove('is-active');
  }

  document.getElementById('dock-shop').addEventListener('click', () => {
    if (!panel.hidden) { closeMulti(); return; }
    openShop();
  });
  document.getElementById('dock-cases').addEventListener('click', () => {
    if (!panel.hidden) { closeMulti(); return; }
    if (fightGame) return;   // pas de caisses en plein duel
    try { openCases(); } catch (e) { console.warn('cases', e); }
  });
  document.getElementById('dock-chat').addEventListener('click', () => {
    if (!panel.hidden) { closeMulti(); return; }
    Chat.openPanel();
  });

  document.getElementById('dock-multi').addEventListener('click', () => {
    if (panel.hidden) openMulti();
    else closeMulti();
  });
  document.getElementById('multi-close').addEventListener('click', closeMulti);
  document.getElementById('multi-back').addEventListener('click', closeMulti);
  panelTabs.forEach(t => t.addEventListener('click', () => showMultiView(t.dataset.view)));

  // Menu principal.
  ORDER.forEach(id => {
    const game = Games[id];
    const icon = el('span', { class: 'menu-icon' });
    if (typeof game.icon === 'string' && game.icon.trim().startsWith('<svg')) icon.innerHTML = game.icon;
    else icon.textContent = game.icon;
    const tab = el('button', { class: 'menu-item', onClick: () => select(id) },
      icon,
      el('span', { text: game.name }),
    );
    tabs[id] = tab;
    menu.append(tab);
  });

  let fightGame = null;   // pendant un duel VS : on est bloqué sur ce jeu

  function select(id, force) {
    if (fightGame && id !== fightGame) return;   // mode combat : pas le droit de changer de jeu
    if (current === id && !force) return;
    if (current && Games[current] && typeof Games[current].leave === 'function') {
      Games[current].leave();
    }
    current = id;
    document.body.dataset.game = id;
    try { Bank.setContext(id); } catch (e) {}
    ORDER.forEach(key => tabs[key].classList.toggle('is-active', key === id));
    clear(stage);
    const root = el('div', { class: 'game' });
    stage.append(root);
    Games[id].render(root);
  }

  // --- Multijoueur : toast quand un AMI fait une action ---
  const friendToastsOn = () => localStorage.getItem('evelatro-friend-toasts') !== '0';
  let friendSubOff = null;
  function syncFriendSub() {
    const connected = window.Multiplayer && Multiplayer.isConnected();
    if (connected && !friendSubOff) {
      friendSubOff = Multiplayer.subscribeActivity(row => {
        const me = Multiplayer.user();
        if (me && row.user_id === me.id) return;   // pas mes propres actions
        if (friendToastsOn()) Toast.friend({ who: row.pseudo, game: row.game, gain: row.gain });
      });
    } else if (!connected && friendSubOff) {
      friendSubOff();
      friendSubOff = null;
    }
  }

  // --- Duel : pop-up quand quelqu'un me défie + mode combat ---
  let lastChallengeId = 0;
  function watchDuels() {
    try {
      Duel.onChange(() => {
        const s = Duel.state();
        if (s.active && s.incoming && Duel.raw() && Duel.raw().id !== lastChallengeId) {
          lastChallengeId = Duel.raw().id;
          Toast.challenge(s.other, s.pct);
        }
        syncFightMode(s);
      });
    } catch (e) { /* rien */ }
  }

  // Verrouille l'interface sur le jeu du duel pendant un combat.
  function syncFightMode(s) {
    s = s || Duel.state();
    const inFight = s.active && s.status === 'accepted';
    if (inFight) {
      fightGame = s.game;
      if (!document.body.classList.contains('fight-mode')) {
        document.body.classList.add('fight-mode');
        closeMulti();
        try { Sound.chip(); } catch (e) {}
      }
      if (current !== s.game) { const g = fightGame; fightGame = null; select(g, true); fightGame = g; }
    } else if (fightGame) {
      fightGame = null;
      document.body.classList.remove('fight-mode');
    }
  }

  try {
    Multiplayer.onChange(() => {
      syncFriendSub();
      Chat.sync();
      Duel.sync();
      if (current === 'leaderboard') select('leaderboard', true);   // le bouton Discord dispa. une fois connectée
    });
    syncFriendSub();
    Chat.sync();
    Duel.sync();
    watchDuels();
  } catch (e) { /* rien */ }

  window.EveLatro = { go: select, openMulti };
  select('blackjack');

  // --- Avertissement fair-play (1er lancement) PUIS "Quoi de neuf ?" ---
  try {
    setTimeout(() => {
      try {
        FairPlay.gate(() => { try { News.check(); } catch (e) {} });
      } catch (e) { try { News.check(); } catch (e2) {} }
    }, 1200);
  } catch (e) { /* rien */ }
})();
