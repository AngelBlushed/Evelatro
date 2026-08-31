/* ===========================================================
   Bonus achetés dans la Boutique (onglet "Bonus").
   Stockés en local (localStorage). Un seul pour l'instant :
   "auto-reset" de la machine à sous.
   =========================================================== */

const Bonus = (() => {
  const KEY = 'evelatro-bonuses';
  const listeners = [];
  let owned = load();

  function load() { try { return JSON.parse(localStorage.getItem(KEY) || '[]') || []; } catch (e) { return []; } }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(owned)); } catch (e) {} }

  const CATALOG = [
    {
      id: 'slots-autoreset',
      name: 'Auto-reset — Machine à sous',
      price: 500000,
      icon: '🎰',
      desc: 'Quand tu tombes à zéro sur une machine, elle se recharge et relance un tour toute seule. Tu poses la manette, tu regardes tourner.',
    },
  ];

  return {
    CATALOG,
    list() { return CATALOG.map(b => ({ ...b, owned: owned.includes(b.id) })); },
    has(id) { return owned.includes(id); },
    buy(id) {
      if (owned.includes(id)) return { ok: false, reason: 'owned' };
      const b = CATALOG.find(x => x.id === id);
      if (!b) return { ok: false, reason: 'unknown' };
      if ((window.Bank ? Bank.balance() : 0) < b.price) return { ok: false, reason: 'poor' };
      if (!Bank.spend(b.price)) return { ok: false, reason: 'poor' };
      owned.push(id); save();
      listeners.forEach(fn => { try { fn(); } catch (e) {} });
      return { ok: true };
    },
    onChange(fn) {
      listeners.push(fn);
      return () => { const i = listeners.indexOf(fn); if (i >= 0) listeners.splice(i, 1); };
    },
  };
})();

window.Bonus = Bonus;
