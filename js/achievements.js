/* ===========================================================
   BÊTA 1.3 — Succès.

   Deux succès pour l'instant :
     1/2  auto-reset  : acheter l'auto-reroll dans la Boutique
     2/2  all-skins   : posséder TOUTES les tenues de croupier

   État gardé en localStorage `evelatro-ach` = { id: timestamp }.
   Contrôle passif toutes les ~4 s + à la demande (Achievements.check()).
   Petit bandeau quand un succès tombe.
   =========================================================== */

const Achievements = (() => {
  const KEY = 'evelatro-ach';
  const listeners = [];

  const LIST = [
    {
      id: 'auto-reset',
      name: 'Pilote automatique',
      desc: 'Acheter l\'auto-reroll dans la Boutique.',
      icon: '🔁',
      done: () => { try { return !!(window.Bonus && Bonus.arOwned && Bonus.arOwned()); } catch (e) { return false; } },
    },
    {
      id: 'all-skins',
      name: 'Garde-robe complète',
      desc: 'Débloquer toutes les tenues des deux croupiers.',
      icon: '👗',
      done: () => {
        try {
          if (!window.Skins) return false;
          const n = Skins.COUNT || 5;
          return ['men', 'women'].every(g => {
            for (let i = 0; i < n; i++) if (!Skins.owned(g, i)) return false;
            return true;
          });
        } catch (e) { return false; }
      },
    },
  ];

  function load() {
    try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; }
    catch (e) { return {}; }
  }
  let got = load();
  function save() { try { localStorage.setItem(KEY, JSON.stringify(got)); } catch (e) {} }
  function emit() { listeners.forEach(fn => { try { fn(); } catch (e) {} }); }

  const has = id => !!got[id];

  function unlock(a) {
    if (got[a.id]) return;
    got[a.id] = Date.now();
    save();
    banner(a);
    try { window.Sound && Sound.coins && Sound.coins(); } catch (e) {}
    emit();
  }

  function check() {
    let changed = false;
    LIST.forEach(a => {
      if (!got[a.id] && a.done()) { unlock(a); changed = true; }
    });
    return changed;
  }

  /* --- bandeau "succès débloqué" --- */
  function banner(a) {
    const b = el('div', { class: 'ach-pop' },
      el('span', { class: 'ach-pop-ic', text: a.icon }),
      el('div', { class: 'ach-pop-txt' },
        el('b', { text: 'Succès débloqué' }),
        el('span', { text: a.name })),
    );
    document.body.append(b);
    requestAnimationFrame(() => b.classList.add('in'));
    setTimeout(() => { b.classList.remove('in'); setTimeout(() => b.remove(), 400); }, 3800);
  }

  /* --- panneau (bouton "Succès" du hub) --- */
  function openPanel() {
    openModal({
      title: '🏆 Succès — ' + summary().done + '/' + summary().total,
      build(body, close) {
        const wrap = el('div', { class: 'ach-list' });
        LIST.forEach(a => {
          const done = has(a.id) || a.done();
          if (done && !has(a.id)) unlock(a);
          wrap.append(el('div', { class: 'ach-row' + (done ? ' is-done' : '') },
            el('span', { class: 'ach-row-ic', text: a.icon }),
            el('div', { class: 'ach-row-txt' },
              el('b', { text: a.name }),
              el('span', { text: a.desc })),
            el('span', { class: 'ach-row-state', text: done ? '✓' : '·' }),
          ));
        });
        body.append(wrap,
          el('div', { class: 'set-actions' },
            el('button', { class: 'btn btn-primary', text: 'Fermer', onClick: close })));
      },
    });
  }

  function summary() {
    return { done: LIST.filter(a => has(a.id) || a.done()).length, total: LIST.length };
  }

  function onChange(fn) {
    listeners.push(fn);
    return () => { const i = listeners.indexOf(fn); if (i >= 0) listeners.splice(i, 1); };
  }

  // contrôle passif + branchements
  setInterval(check, 4000);
  try { window.Bonus && Bonus.onChange && Bonus.onChange(check); } catch (e) {}
  try { window.Skins && Skins.onChange && Skins.onChange(check); } catch (e) {}
  setTimeout(check, 1500);

  return { check, openPanel, summary, onChange, has, list: () => LIST.slice() };
})();

window.Achievements = Achievements;
