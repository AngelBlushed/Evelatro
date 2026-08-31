/* ===========================================================
   Bonus achetés dans la Boutique (onglet "Bonus").
   Pour l'instant : "Auto-reroll" de la machine à sous.

   - Achat : 500 000 cr (une fois). Donne tout de suite 1 h d'auto-reroll.
   - Pendant l'heure : les 3 machines relancent toutes seules avec ta mise.
   - Après l'heure : bouton grisé. Pour le réarmer :
       10 mains de blackjack gagnées + 10 mains de poker gagnées
       + 10 roulettes gagnées (mise >= 500)  PUIS  payer 50 000 cr.
   État stocké en local. (Ça n'automatise que des tours de machine
   normaux — chaque mise/gain passe par l'anti-triche.)
   =========================================================== */

const Bonus = (() => {
  const KEY = 'evelatro-bonus-ar';
  const listeners = [];
  const SESSION_MS = 60 * 60 * 1000;   // 1 heure
  const NEED = 10;
  const REARM_PRICE = 50000;
  const BUY_PRICE = 500000;

  let st = load();
  function load() {
    try {
      const d = JSON.parse(localStorage.getItem(KEY) || 'null') || {};
      return {
        owned: !!d.owned,
        activeUntil: Number(d.activeUntil) || 0,
        prog: { bj: (d.prog && d.prog.bj) | 0, poker: (d.prog && d.prog.poker) | 0, roulette: (d.prog && d.prog.roulette) | 0 },
      };
    } catch (e) { return { owned: false, activeUntil: 0, prog: { bj: 0, poker: 0, roulette: 0 } }; }
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) {} }
  function emit() { save(); listeners.forEach(fn => { try { fn(); } catch (e) {} }); }

  const active = () => st.owned && Date.now() < st.activeUntil;
  const condsMet = () => st.prog.bj >= NEED && st.prog.poker >= NEED && st.prog.roulette >= NEED;

  const CATALOG = [{
    id: 'slots-autoreroll',
    name: 'Auto-reroll — Machine à sous',
    price: BUY_PRICE,
    icon: '🔁',
    desc: 'Les machines à sous relancent toutes seules avec ta mise, pendant 1 h. '
      + 'Ensuite : 10 blackjacks + 10 pokers + 10 roulettes gagnés (mise ≥ 500) puis 50 000 cr pour réarmer.',
  }];

  return {
    CATALOG,
    list() { return CATALOG.map(b => ({ ...b, owned: st.owned })); },
    has(id) { return id === 'slots-autoreroll' && st.owned; },

    buy(id) {
      if (id !== 'slots-autoreroll') return { ok: false, reason: 'unknown' };
      if (st.owned) return { ok: false, reason: 'owned' };
      if (!window.Bank || Bank.balance() < BUY_PRICE) return { ok: false, reason: 'poor' };
      if (!Bank.spend(BUY_PRICE)) return { ok: false, reason: 'poor' };
      st.owned = true;
      st.activeUntil = Date.now() + SESSION_MS;   // 1 h offerte à l'achat
      st.prog = { bj: 0, poker: 0, roulette: 0 };
      emit();
      return { ok: true };
    },

    /* --- auto-reroll --- */
    arOwned() { return st.owned; },
    arActive() { return active(); },
    arMsLeft() { return Math.max(0, st.activeUntil - Date.now()); },
    arProgress() { return { ...st.prog, need: NEED }; },
    arConditionsMet() { return condsMet(); },
    arRearmPrice() { return REARM_PRICE; },
    /** 'not-owned' | 'active' | 'ready' (conditions ok, à payer) | 'locked' */
    arState() {
      if (!st.owned) return 'not-owned';
      if (active()) return 'active';
      return condsMet() ? 'ready' : 'locked';
    },

    /** compte une réussite vers le réarmement (seulement quand c'est verrouillé). */
    arNote(kind) {
      if (!st.owned || active()) return;
      if (kind !== 'bj' && kind !== 'poker' && kind !== 'roulette') return;
      if (st.prog[kind] >= NEED) return;
      st.prog[kind] += 1;
      emit();
    },

    /** réarme : exige conditions + 50 000 cr. */
    arRearm() {
      if (!st.owned) return { ok: false, reason: 'not-owned' };
      if (active()) return { ok: false, reason: 'active' };
      if (!condsMet()) return { ok: false, reason: 'conditions' };
      if (!window.Bank || Bank.balance() < REARM_PRICE) return { ok: false, reason: 'poor' };
      if (!Bank.spend(REARM_PRICE)) return { ok: false, reason: 'poor' };
      st.activeUntil = Date.now() + SESSION_MS;
      st.prog = { bj: 0, poker: 0, roulette: 0 };
      emit();
      return { ok: true };
    },

    onChange(fn) {
      listeners.push(fn);
      return () => { const i = listeners.indexOf(fn); if (i >= 0) listeners.splice(i, 1); };
    },
  };
})();

window.Bonus = Bonus;
