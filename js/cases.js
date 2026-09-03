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
    syncUp();
  }

  // sauvegarde serveur (filet anti faux-positif) + miroir public (comptoir d'échange)
  let syncT = null;
  function syncUp() {
    clearTimeout(syncT);
    syncT = setTimeout(() => {
      try {
        if (window.Multiplayer && Multiplayer.isConnected()) {
          const snap = inv.slice(0, 500);
          if (Multiplayer.gameSync) Multiplayer.gameSync(snap, null);
          if (Multiplayer.csInvPush) Multiplayer.csInvPush(snap);
        }
      } catch (e) {}
    }, 4000);
  }

  // remplace tout l'inventaire (échange conclu côté serveur -> on recale le local)
  function replaceAll(arr) {
    if (!Array.isArray(arr)) return;
    inv = arr.slice(0, 500);
    try { localStorage.setItem(KEY, JSON.stringify(inv)); } catch (e) {}
    emit();
  }

  // restauration après un faux positif : le local a été effacé, le serveur
  // renvoie l'inventaire de la fiche -> on le remet (jamais par-dessus un
  // inventaire local existant).
  function hydrate(arr) {
    if (!Array.isArray(arr) || !arr.length || inv.length) return;
    inv = arr.slice(0, 500);
    try { localStorage.setItem(KEY, JSON.stringify(inv)); } catch (e) {}
    emit();
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

  /* Ajoute un skin offert (commande /donner-skin du bot) — sans coût. */
  function grant(sk) {
    if (!sk || !sk.weapon || !sk.name) return null;
    const rar = CS.RARITY[sk.rarity] || CS.RARITY.bleu;
    const wr = (CS.WEARS || []).find(w => w.s === sk.wear) || (CS.WEARS || [])[2] || { s: 'FT', name: 'Testé terrain', mult: 0.55 };
    const item = {
      crate: sk.crate || 'gift', crateName: sk.crateName || 'Cadeau',
      weapon: sk.weapon, name: sk.name, rarity: rar.key || sk.rarity || 'bleu',
      wear: wr.s, wearName: wr.name, wearMult: wr.mult, stat: !!sk.stat,
      price: Math.max(1, Math.round(Number(sk.price) || 1)),
      ts: Date.now(), color: rar.color, rarityName: rar.name,
      id: 'gift:' + sk.weapon + ':' + sk.name + ':' + wr.s + ':' + Math.random().toString(36).slice(2, 7),
      gift: true,
    };
    inv.unshift(item);
    save();
    emit();
    return item;
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

  // retire un objet précis SANS créditer (utilisé par le comptoir d'échange)
  function take(id) {
    const i = inv.findIndex(x => x.id === id);
    if (i < 0) return null;
    const it = inv[i];
    inv.splice(i, 1);
    save();
    emit();
    return it;
  }

  function sellAll() {
    const total = value();
    inv = [];
    save();
    emit();
    if (total > 0) Bank.sell(total);
    return total;
  }

  // groupe l'inventaire par identité de skin (arme | nom)
  function stacks() {
    const m = new Map();
    for (const it of inv) {
      const k = it.weapon + ' | ' + it.name;
      const cur = m.get(k);
      if (!cur) m.set(k, { key: k, count: 1, items: [it], best: it });
      else { cur.count++; cur.items.push(it); if ((it.price || 0) > (cur.best.price || 0)) cur.best = it; }
    }
    return m;
  }

  // combien rapporterait la vente de tous les doublons (on garde le meilleur de chaque)
  function dupInfo() {
    let value = 0, count = 0;
    for (const s of stacks().values()) {
      if (s.count < 2) continue;
      const sorted = s.items.slice().sort((a, b) => (b.price || 0) - (a.price || 0));
      for (let i = 1; i < sorted.length; i++) { value += sorted[i].price || 0; count++; }
    }
    return { value, count };
  }

  function sellDuplicates() {
    let total = 0;
    const kept = [];
    for (const s of stacks().values()) {
      const sorted = s.items.slice().sort((a, b) => (b.price || 0) - (a.price || 0));
      kept.push(sorted[0]);
      for (let i = 1; i < sorted.length; i++) total += sorted[i].price || 0;
    }
    kept.sort((a, b) => (b.ts || 0) - (a.ts || 0));
    inv = kept;
    save();
    emit();
    if (total > 0) Bank.sell(total);
    return total;
  }

  function onChange(fn) {
    listeners.push(fn);
    return () => { const k = listeners.indexOf(fn); if (k >= 0) listeners.splice(k, 1); };
  }

  // à la connexion : on pousse l'inventaire local vers le serveur (1re sauvegarde)
  try {
    if (window.Multiplayer && Multiplayer.onChange) {
      Multiplayer.onChange(() => { if (Multiplayer.isConnected() && inv.length) syncUp(); });
    }
  } catch (e) {}

  return { list, count, value, canOpen, open, keep, grant, take, sellDrop, sellFromInventory, sellAll,
    stacks, dupInfo, sellDuplicates, hydrate, replaceAll, onChange };
})();
window.Cases = Cases;


/* ---------- l'écran des caisses (plein écran, façon CS) ---------- */
function openCases() {
  const fmt = n => Number(n || 0).toLocaleString('fr-FR');
  const RO = CS.RARITY_ORDER;                      // ['bleu',...,'or']
  const RO_HI = RO.slice().reverse();              // du plus rare au plus courant
  let offInv = null;

  // --- images (js/cs-images.js, générées) ---
  const csImg = (crateId, idx) => {
    const e = window.CS_IMAGES && CS_IMAGES[crateId];
    return (e && e.skins && e.skins[idx]) || null;
  };
  const csCaseImg = crateId => {
    const e = window.CS_IMAGES && CS_IMAGES[crateId];
    return (e && e.case) || null;
  };
  const skinIdx = (crate, weapon, name) =>
    crate ? crate.skins.findIndex(s => s.weapon === weapon && s.name === name) : -1;
  const imgBox = (cls, src, alt) => el('div', { class: cls }, el('img', { src, alt: alt || '' }));

  openModal({
    title: '',
    onClose() { if (offInv) { offInv(); offInv = null; } },
    build(body, close) {
      const modal = body.parentElement;
      modal.classList.add('modal-cases');
      const backdrop = body.closest('.modal-backdrop');
      if (backdrop) backdrop.classList.add('cs-backdrop');

      let view = 'preview';       // 'preview' | 'collection' | 'open'
      let crateIdx = 0;
      let busy = false;

      const root = el('div', { class: 'cs-screen' });
      body.append(root);

      const closeBtn = el('button', { class: 'cs-x', text: '✕', title: 'Fermer', onClick: close });
      const purseVal = el('b', { class: 'cs-purse2-v' });
      const purse = el('div', { class: 'cs-purse2' },
        el('span', { class: 'cs-purse2-l', text: 'Crédits' }), purseVal);
      function refreshPurse() { purseVal.textContent = fmt(Bank.balance()) + ' cr.'; }

      offInv = Cases.onChange(() => { refreshPurse(); if (view === 'collection') render(); });

      function render() {
        if (busy) return;
        root.dataset.view = view;
        clear(root);
        root.append(closeBtn, purse);
        if (view === 'collection') renderCollection();
        else renderPreview();
        refreshPurse();
      }

      /* ===== APERÇU D'UNE CAISSE ===== */
      function renderPreview() {
        root.append(el('button', {
          class: 'cs-hot cs-hot-inv', title: 'Voir ta collection',
          onClick: () => { view = 'collection'; render(); },
        }, el('span', { class: 'cs-hot-ring' })));

        const c = CS.crates[crateIdx];
        const best = RO_HI.find(k => c.skins.some(s => s.rarity === k));
        const col = CS.RARITY[best].color;

        const box = crateIcon(c);
        box.classList.add('cs-case-box2');

        const openBtn = el('button', {
          class: 'cs-open-btn' + (Bank.balance() >= c.price ? '' : ' is-poor'),
          text: 'OUVRIR',
          onClick: () => { if (Bank.balance() >= c.price) startOpen(c.id); },
        });

        root.append(el('div', { class: 'cs-stage2' },
          el('button', { class: 'cs-nav cs-nav-prev', text: '‹', title: 'Caisse précédente',
            onClick: () => { crateIdx = (crateIdx + CS.crates.length - 1) % CS.crates.length; render(); } }),
          el('div', { class: 'cs-case2', style: '--cc:' + col },
            box,
            el('div', { class: 'cs-case2-name', text: c.name }),
            el('div', { class: 'cs-case2-idx', text: (crateIdx + 1) + ' / ' + CS.crates.length }),
            el('div', { class: 'cs-open-bar' },
              openBtn,
              el('span', { class: 'cs-open-price', text: '🪙 ' + fmt(c.price) }),
            ),
          ),
          el('button', { class: 'cs-nav cs-nav-next', text: '›', title: 'Caisse suivante',
            onClick: () => { crateIdx = (crateIdx + 1) % CS.crates.length; render(); } }),
        ));

        const odds = el('div', { class: 'cs-odds' }, el('h3', { class: 'cs-odds-h', text: 'Chances de drop' }));
        RO_HI.forEach(k => {
          const r = CS.RARITY[k];
          const pool = c.skins.filter(s => s.rarity === k);
          if (!pool.length) return;
          odds.append(el('div', { class: 'cs-odd', style: '--rc:' + r.color },
            el('div', { class: 'cs-odd-head' },
              el('span', { class: 'cs-odd-dot' }),
              el('span', { class: 'cs-odd-name', text: r.name }),
              el('span', { class: 'cs-odd-pct', text: (r.odds * 100).toFixed(2) + ' %' }),
            ),
            el('div', { class: 'cs-odd-skins' },
              ...pool.map(s => el('span', { class: 'cs-odd-skin', text: s.weapon + ' | ' + s.name })),
            ),
          ));
        });
        root.append(odds);
      }

      /* ===== COLLECTION ===== */
      function renderCollection() {
        root.append(el('button', {
          class: 'cs-hot cs-hot-back', title: 'Retour aux caisses',
          onClick: () => { view = 'preview'; render(); },
        }, el('span', { class: 'cs-hot-ring' })));
        root.append(el('button', { class: 'cs-back-btn', text: '‹ Caisses',
          onClick: () => { view = 'preview'; render(); } }));

        const stacks = Cases.stacks();
        const dup = Cases.dupInfo();

        root.append(el('div', { class: 'cs-col-head', text:
          Cases.count() + ' objet' + (Cases.count() > 1 ? 's' : '') + ' · valeur ' + fmt(Cases.value()) + ' cr.' }));

        root.append(el('button', {
          class: 'cs-trade-open', text: '⇄ Comptoir d’échange',
          onClick: () => { try { openCsTrade(); } catch (e) { console.warn('trade', e); } },
        }));

        const bodyEl = el('div', { class: 'cs-col-body' });
        CS.crates.forEach(c => {
          let got = 0;
          const grid = el('div', { class: 'cs-col-grid' });
          c.skins.forEach((s, idx) => {
            const st = stacks.get(s.weapon + ' | ' + s.name);
            if (st) got++;
            const r = CS.RARITY[s.rarity];
            const img = csImg(c.id, idx);
            const cell = el('div', {
              class: 'cs-cell ' + (st ? 'is-owned' : 'is-locked'),
              style: '--rc:' + r.color,
            },
              img ? imgBox('cs-cell-img', img, s.name) : el('div', { class: 'cs-cell-art' }),
              el('div', { class: 'cs-cell-w', text: s.weapon }),
              el('div', { class: 'cs-cell-n', text: st ? s.name : 'À débloquer' }),
            );
            if (st) {
              cell.append(el('div', { class: 'cs-cell-sub',
                text: r.name + (st.best.stat ? ' · ST™' : '') + ' · ' + st.best.wear }));
              if (st.count > 1) cell.append(el('span', { class: 'cs-cell-x', text: '×' + st.count }));
            }
            grid.append(cell);
          });
          bodyEl.append(el('div', { class: 'cs-col-crate' },
            el('div', { class: 'cs-col-crate-h' },
              el('span', { class: 'cs-col-crate-n', text: c.name }),
              el('span', { class: 'cs-col-crate-c', text: got + ' / ' + c.skins.length }),
            ),
            grid,
          ));
        });
        root.append(bodyEl);

        if (dup.value > 0) {
          root.append(el('button', { class: 'cs-sell-dupes',
            text: 'Vendre les doublons  ·  +' + fmt(dup.value) + ' cr.',
            onClick: () => openModal({
              title: 'Vendre les doublons ?',
              build(b, cl) {
                b.append(
                  el('p', { class: 'game-sub', text:
                    dup.count + ' doublon' + (dup.count > 1 ? 's' : '') + ' vendu' + (dup.count > 1 ? 's' : '')
                    + ' — tu gardes le meilleur exemplaire de chaque skin et tu récupères ' + fmt(dup.value) + ' cr.' }),
                  el('div', { class: 'controls' },
                    el('button', { class: 'btn', text: 'Annuler', onClick: cl }),
                    el('button', { class: 'btn btn-primary', text: 'Vendre', onClick: () => { Cases.sellDuplicates(); cl(); } }),
                  ),
                );
              },
            }),
          }));
        }
      }

      /* ===== OUVERTURE (animation conservée) ===== */
      function startOpen(crateId) {
        if (busy) return;
        const c = CS.crate(crateId);
        const drop = Cases.open(crateId);
        refreshPurse();
        if (!drop) return;
        busy = true;
        view = 'open';
        root.dataset.view = 'open';
        clear(root);
        root.append(closeBtn);
        const stage = el('div', { class: 'cs-open-wrap' });
        root.append(stage);

        const winner = drop;
        const reel = CS.reel(crateId, winner, 64);
        const WIN_AT = 56;
        reel[WIN_AT] = { weapon: winner.weapon, name: winner.name, rarity: winner.rarity, color: winner.color };

        const win = el('div', { class: 'cs-reel-window' },
          el('div', { class: 'cs-reel-mark' }),
        );
        const strip = el('div', { class: 'cs-reel' });
        reel.forEach(it => strip.append(reelItem(it, c)));
        win.append(strip);
        stage.append(
          el('div', { class: 'cs-open-h', text: c.name }),
          win,
        );
        try { Sound.roulette(5); } catch (e) {}

        // lance l'animation (2 rAF + reflow pour que la transition démarre bien).
        // On MESURE la position réelle de la case gagnante -> elle finit pile
        // sous le repère, quelle que soit la largeur exacte des cases.
        strip.style.transform = 'translateX(0)';
        requestAnimationFrame(() => {
          void strip.offsetHeight;
          requestAnimationFrame(() => {
            const winItem = strip.children[WIN_AT];
            const sr = strip.getBoundingClientRect();
            const wr = winItem ? winItem.getBoundingClientRect() : { left: sr.left + WIN_AT * 96, width: 88 };
            const centerInStrip = (wr.left - sr.left) + wr.width / 2;
            const jitter = (Math.random() * 2 - 1) * 16;   // petit décalage, reste sur la case
            const target = centerInStrip - win.clientWidth / 2 + jitter;
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
        clear(root);
        root.dataset.view = 'open';
        root.append(closeBtn);
        const st = drop.stat;
        const dIdx = skinIdx(CS.crate(drop.crate), drop.weapon, drop.name);
        const dImg = dIdx >= 0 ? csImg(drop.crate, dIdx) : null;
        root.append(el('div', { class: 'cs-open-wrap' },
          el('div', { class: 'cs-reveal', style: '--rc:' + drop.color },
            dImg ? imgBox('cs-reveal-img', dImg, drop.name) : null,
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
        ));
        function after() {
          busy = false;
          refreshPurse();
          view = 'preview';
          render();
        }
      }

      function reelItem(it, crate) {
        const idx = skinIdx(crate, it.weapon, it.name);
        const img = idx >= 0 ? csImg(crate.id, idx) : null;
        return el('div', { class: 'cs-item', style: '--rc:' + (it.color || '#666') },
          img ? imgBox('cs-item-img', img, '') : el('div', { class: 'cs-item-bar' }),
          el('div', { class: 'cs-item-w', text: it.weapon }),
          el('div', { class: 'cs-item-n', text: it.name }),
        );
      }
      function crateIcon(c) {
        const img = csCaseImg(c.id);
        if (img) return imgBox('cs-box cs-box-img', img, c.name);
        // repli : petite "caisse" stylisée aux couleurs de sa meilleure rareté
        const best = CS.RARITY_ORDER.slice().reverse().find(k => c.skins.some(s => s.rarity === k));
        const col = CS.RARITY[best].color;
        const d = el('div', { class: 'cs-box', style: '--bc:' + col });
        d.innerHTML = '<svg viewBox="0 0 48 48" fill="none"><path d="M6 16 24 8l18 8-18 8z" fill="var(--bc)" opacity=".85"/><path d="M6 16v16l18 8V24z" fill="var(--bc)" opacity=".45"/><path d="M42 16v16l-18 8V24z" fill="var(--bc)" opacity=".6"/><path d="M20 20h8v6h-8z" fill="#0a0d10" opacity=".5"/></svg>';
        return d;
      }

      render();
    },
  });
}
