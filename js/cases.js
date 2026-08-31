/* ===========================================================
   Les caisses "EveLatro" (façon CS:GO).
   Bouton du dock (icône caisse) -> openCases().

   - on achète une caisse avec ses crédits (les mêmes que partout)
   - animation : une bobine d'objets défile et ralentit
   - au drop : VENDRE au prix affiché  OU  GARDER (-> inventaire)
   - l'inventaire se revend quand on veut
   =========================================================== */

const Cases = (() => {
  const KEY = 'evelatro-cs-inv';
  let inv = load();
  const listeners = [];
  const emit = () => listeners.forEach(fn => { try { fn(); } catch (e) {} });

  function load() {
    try { const r = JSON.parse(localStorage.getItem(KEY) || '[]'); return Array.isArray(r) ? r : []; }
    catch (e) { return []; }
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(inv.slice(0, 500))); } catch (e) {}
  }

  function list() { return inv.slice(); }
  function count() { return inv.length; }
  function value() { return inv.reduce((s, it) => s + (it.price || 0), 0); }

  function canOpen(crateId) {
    const c = CS.crate(crateId);
    return c ? Bank.balance() >= c.price : false;
  }

  // débite la caisse et renvoie le drop (sans encore le mettre en inventaire)
  function open(crateId) {
    const c = CS.crate(crateId);
    if (!c) return null;
    if (Bank.balance() < c.price) return null;
    if (!Bank.spend(c.price)) return null;
    const drop = CS.roll(crateId);
    try {
      Activity.log({ game: 'Caisses', detail: 'Ouvre ' + c.name, bet: c.price, gain: 0, tone: 'info' });
    } catch (e) {}
    return drop;
  }

  function keep(drop) {
    if (!drop) return;
    inv.unshift(drop);
    save();
    emit();
  }

  function sellDrop(drop) {
    if (!drop) return 0;
    Bank.sell(drop.price);
    try {
      Activity.log({ game: 'Caisses', detail: (drop.stat ? 'StatTrak ' : '') + drop.weapon + ' | ' + drop.name, gain: drop.price, tone: 'win' });
    } catch (e) {}
    return drop.price;
  }

  function sellFromInventory(id) {
    const i = inv.findIndex(x => x.id === id);
    if (i < 0) return 0;
    const it = inv[i];
    inv.splice(i, 1);
    save();
    emit();
    Bank.sell(it.price);
    return it.price;
  }

  function sellAll() {
    const total = value();
    inv = [];
    save();
    emit();
    if (total > 0) Bank.sell(total);
    return total;
  }

  function onChange(fn) {
    listeners.push(fn);
    return () => { const k = listeners.indexOf(fn); if (k >= 0) listeners.splice(k, 1); };
  }

  return { list, count, value, canOpen, open, keep, sellDrop, sellFromInventory, sellAll, onChange };
})();
window.Cases = Cases;


/* ---------- l'écran des caisses ---------- */
function openCases() {
  const fmt = n => Number(n || 0).toLocaleString('fr-FR');

  openModal({
    title: 'Caisses',
    onClose() {},
    build(body) {
      body.parentElement.classList.add('modal-cases');
      let view = 'crates';        // 'crates' | 'open' | 'inv'
      let busy = false;

      const purse = el('div', { class: 'cs-purse' },
        el('span', { class: 'cs-purse-lbl', text: 'Tes crédits' }),
        el('b', { class: 'cs-purse-val' }),
      );
      const tabs = el('div', { class: 'cs-tabs' },
        el('button', { class: 'cs-tab', text: 'Caisses', onClick: () => go('crates') }),
        el('button', { class: 'cs-tab', text: 'Inventaire', onClick: () => go('inv') }),
      );
      const stage = el('div', { class: 'cs-stage' });
      body.append(purse, tabs, stage);

      const offInv = Cases.onChange(() => { refreshPurse(); if (view === 'inv') renderInv(); });
      body.closest('.modal-backdrop').addEventListener('remove', offInv);

      function refreshPurse() {
        purse.querySelector('.cs-purse-val').textContent = fmt(Bank.balance()) + ' cr.';
        tabs.children[1].textContent = 'Inventaire (' + Cases.count() + ')';
      }
      function setTab() {
        tabs.children[0].classList.toggle('on', view === 'crates' || view === 'open');
        tabs.children[1].classList.toggle('on', view === 'inv');
      }
      function go(v) {
        if (busy) return;
        view = v; setTab();
        if (v === 'crates') renderCrates();
        else if (v === 'inv') renderInv();
      }

      /* --- liste des caisses --- */
      function renderCrates() {
        clear(stage);
        const grid = el('div', { class: 'cs-grid' });
        CS.crates.forEach(c => {
          const afford = Bank.balance() >= c.price;
          grid.append(el('button', {
            class: 'cs-crate' + (afford ? '' : ' is-poor'),
            onClick: () => afford && startOpen(c.id),
          },
            el('div', { class: 'cs-crate-box' }, crateIcon(c)),
            el('div', { class: 'cs-crate-name', text: c.name }),
            el('div', { class: 'cs-crate-price', text: '🪙 ' + fmt(c.price) }),
          ));
        });
        stage.append(grid);
      }

      /* --- ouverture --- */
      function startOpen(crateId) {
        if (busy) return;
        const c = CS.crate(crateId);
        const drop = Cases.open(crateId);
        refreshPurse();
        if (!drop) return;
        busy = true;
        view = 'open'; setTab();
        clear(stage);

        const winner = drop;
        const reel = CS.reel(crateId, winner, 60);
        const WIN_AT = 54;
        reel[WIN_AT] = { weapon: winner.weapon, name: winner.name, rarity: winner.rarity, color: winner.color };

        const win = el('div', { class: 'cs-reel-window' },
          el('div', { class: 'cs-reel-mark' }),
        );
        const strip = el('div', { class: 'cs-reel' });
        reel.forEach(it => strip.append(reelItem(it)));
        win.append(strip);
        stage.append(
          el('div', { class: 'cs-open-h', text: c.name }),
          win,
        );
        try { Sound.roulette(5); } catch (e) {}

        // lance l'animation (2 rAF + reflow pour que la transition démarre bien)
        const ITEM_W = 96;   // largeur + marge (doit matcher le CSS)
        strip.style.transform = 'translateX(0)';
        requestAnimationFrame(() => {
          void strip.offsetHeight;
          requestAnimationFrame(() => {
            const winW = win.clientWidth || 340;
            const jitter = (Math.random() * 2 - 1) * 30;
            const target = WIN_AT * ITEM_W + ITEM_W / 2 - winW / 2 + jitter;
            strip.style.transition = 'transform 5.8s cubic-bezier(.10,.80,.16,1)';
            void strip.offsetHeight;
            strip.style.transform = 'translateX(' + (-Math.max(0, target)) + 'px)';
          });
        });

        let done = false;
        const finish = () => {
          if (done) return; done = true;
          const items = strip.querySelectorAll('.cs-item');
          if (items[WIN_AT]) items[WIN_AT].classList.add('is-win');
          try { Sound.coins && Sound.coins(); } catch (e) {}
          setTimeout(() => revealDrop(winner), 550);
        };
        strip.addEventListener('transitionend', e => { if (e.propertyName === 'transform') finish(); });
        setTimeout(finish, 6600);
      }

      function revealDrop(drop) {
        clear(stage);
        const st = drop.stat;
        stage.append(
          el('div', { class: 'cs-reveal', style: '--rc:' + drop.color },
            el('div', { class: 'cs-reveal-rarity', text: (st ? 'StatTrak™ · ' : '') + drop.rarityName }),
            el('div', { class: 'cs-reveal-weapon', text: drop.weapon }),
            el('div', { class: 'cs-reveal-name', text: drop.name }),
            el('div', { class: 'cs-reveal-wear', text: 'État : ' + drop.wearName + ' (' + drop.wear + ')' }),
            el('div', { class: 'cs-reveal-price', text: '💰 valeur : ' + fmt(drop.price) + ' cr.' }),
            el('div', { class: 'cs-reveal-actions' },
              el('button', { class: 'btn btn-primary', text: 'Vendre pour ' + fmt(drop.price),
                onClick: () => { Cases.sellDrop(drop); after(); } }),
              el('button', { class: 'btn', text: 'Garder',
                onClick: () => { Cases.keep(drop); after(); } }),
            ),
          ),
        );
        function after() {
          busy = false;
          refreshPurse();
          go('crates');
        }
      }

      /* --- inventaire --- */
      function renderInv() {
        clear(stage);
        const items = Cases.list();
        stage.append(el('div', { class: 'cs-inv-head' },
          el('span', { text: items.length + ' objet' + (items.length > 1 ? 's' : '') + ' · valeur totale ' + fmt(Cases.value()) + ' cr.' }),
          items.length ? el('button', { class: 'btn btn-mini', text: 'Tout vendre',
            onClick: () => openModal({
              title: 'Tout vendre ?', build(b, close) {
                b.append(
                  el('p', { class: 'game-sub', text: 'Tu récupères ' + fmt(Cases.value()) + ' crédits.' }),
                  el('div', { class: 'controls' },
                    el('button', { class: 'btn', text: 'Annuler', onClick: close }),
                    el('button', { class: 'btn btn-primary', text: 'Tout vendre', onClick: () => { Cases.sellAll(); close(); } }),
                  ));
              },
            }) }) : null,
        ));
        if (!items.length) {
          stage.append(el('p', { class: 'game-sub', text: 'Vide. Ouvre une caisse !' }));
          return;
        }
        const list = el('div', { class: 'cs-inv-list' });
        items.forEach(it => {
          list.append(el('div', { class: 'cs-inv-row', style: '--rc:' + it.color },
            el('div', { class: 'cs-inv-dot' }),
            el('div', { class: 'cs-inv-txt' },
              el('div', { class: 'cs-inv-name', text: (it.stat ? 'ST™ ' : '') + it.weapon + ' | ' + it.name }),
              el('div', { class: 'cs-inv-sub', text: it.rarityName + ' · ' + it.wear }),
            ),
            el('button', { class: 'btn btn-mini', text: fmt(it.price) + ' cr.',
              onClick: () => Cases.sellFromInventory(it.id) }),
          ));
        });
        stage.append(list);
      }

      function reelItem(it) {
        return el('div', { class: 'cs-item', style: '--rc:' + (it.color || '#666') },
          el('div', { class: 'cs-item-bar' }),
          el('div', { class: 'cs-item-w', text: it.weapon }),
          el('div', { class: 'cs-item-n', text: it.name }),
        );
      }
      function crateIcon(c) {
        // petite "caisse" stylisée aux couleurs de sa meilleure rareté
        const best = CS.RARITY_ORDER.slice().reverse().find(k => c.skins.some(s => s.rarity === k));
        const col = CS.RARITY[best].color;
        const d = el('div', { class: 'cs-box', style: '--bc:' + col });
        d.innerHTML = '<svg viewBox="0 0 48 48" fill="none"><path d="M6 16 24 8l18 8-18 8z" fill="var(--bc)" opacity=".85"/><path d="M6 16v16l18 8V24z" fill="var(--bc)" opacity=".45"/><path d="M42 16v16l-18 8V24z" fill="var(--bc)" opacity=".6"/><path d="M20 20h8v6h-8z" fill="#0a0d10" opacity=".5"/></svg>';
        return d;
      }

      refreshPurse();
      setTab();
      renderCrates();
    },
  });
}
