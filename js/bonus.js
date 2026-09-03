/* ===========================================================
   Bonus achetés dans la Boutique (onglet "Bonus").
   Pour l'instant : "Auto-reroll" de la machine à sous.

   - Achat : 500 000 cr (une fois). Débloque le bouton dans les machines.
   - 1re activation : GRATUITE. Clic -> 1 h d'auto-reroll.
   - Pendant l'heure : les 3 machines relancent toutes seules avec ta mise.
     On peut mettre en PAUSE (le temps restant est gelé) et reprendre.
   - Quand le temps restant tombe à 0, pour relancer :
       10 blackjacks + 10 pokers + 10 roulettes gagnés (mise >= 500)
       PUIS payer 50 000 cr.
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
        firstUsed: !!d.firstUsed,
        activeUntil: Number(d.activeUntil) || 0,   // en cours si > maintenant
        pausedMs: Number(d.pausedMs) || 0,         // en pause si > 0 (temps restant gelé)
        prog: { bj: (d.prog && d.prog.bj) | 0, poker: (d.prog && d.prog.poker) | 0, roulette: (d.prog && d.prog.roulette) | 0 },
      };
    } catch (e) { return { owned: false, firstUsed: false, activeUntil: 0, pausedMs: 0, prog: { bj: 0, poker: 0, roulette: 0 } }; }
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) {} }
  function emit() { save(); listeners.forEach(fn => { try { fn(); } catch (e) {} }); }

  const running = () => st.owned && Date.now() < st.activeUntil;
  const paused = () => st.owned && st.pausedMs > 0 && !running();
  const condsMet = () => st.prog.bj >= NEED && st.prog.poker >= NEED && st.prog.roulette >= NEED;

  // nettoie un état "expiré" (temps écoulé, pas en pause)
  function sweep() {
    if (st.owned && !running() && !paused() && (st.activeUntil || st.pausedMs)) {
      st.activeUntil = 0; st.pausedMs = 0; save();
    }
  }

  function startFresh() {
    st.activeUntil = Date.now() + SESSION_MS;
    st.pausedMs = 0;
    st.firstUsed = true;
    st.prog = { bj: 0, poker: 0, roulette: 0 };
    emit();
  }

  const CATALOG = [{
    id: 'slots-autoreroll',
    name: 'Auto-reroll — Machine à sous',
    price: BUY_PRICE,
    icon: '🔁',
    desc: '1re heure OFFERTE (pause/reprise possible). Ensuite : 10 blackjacks + 10 pokers '
      + '+ 10 roulettes gagnés (mise ≥ 500) puis 50 000 cr pour relancer une heure.',
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
      emit();
      try { window.Multiplayer && Multiplayer.gameSync && Multiplayer.gameSync(null, { ar: true }); } catch (e) {}
      return { ok: true };
    },

    /** restauration après un faux positif anti-triche : le serveur dit qu'on
        possédait le bonus -> on le remet (le minuteur/la progression, eux,
        repartent de zéro, ce n'est pas ce qu'on protège). */
    hydrate(b) {
      if (b && b.ar && !st.owned) { st.owned = true; emit(); }
    },

    /* --- auto-reroll --- */
    arOwned() { return st.owned; },
    arActive() { sweep(); return running(); },
    arMsLeft() { sweep(); return running() ? Math.max(0, st.activeUntil - Date.now()) : (paused() ? st.pausedMs : 0); },
    arProgress() { return { ...st.prog, need: NEED }; },
    arRearmPrice() { return REARM_PRICE; },

    /** 'not-owned' | 'active' | 'paused' | 'free' | 'ready' | 'locked' */
    arState() {
      sweep();
      if (!st.owned) return 'not-owned';
      if (running()) return 'active';
      if (paused()) return 'paused';
      if (!st.firstUsed) return 'free';
      return condsMet() ? 'ready' : 'locked';
    },

    arNote(kind) {
      sweep();
      if (!st.owned || running() || paused() || !st.firstUsed) return;
      if (kind !== 'bj' && kind !== 'poker' && kind !== 'roulette') return;
      if (st.prog[kind] >= NEED) return;
      st.prog[kind] += 1;
      emit();
    },

    /** clic sur le bouton. Renvoie {ok, started|paused|resumed} ou {ok:false, reason}. */
    arToggle() {
      sweep();
      if (!st.owned) return { ok: false, reason: 'not-owned' };
      if (running()) {                                   // -> pause
        st.pausedMs = Math.max(0, st.activeUntil - Date.now());
        st.activeUntil = 0;
        emit();
        return { ok: true, paused: true };
      }
      if (paused()) {                                    // -> reprise
        st.activeUntil = Date.now() + st.pausedMs;
        st.pausedMs = 0;
        emit();
        return { ok: true, resumed: true };
      }
      if (!st.firstUsed) { startFresh(); return { ok: true, started: true }; }
      if (!condsMet()) return { ok: false, reason: 'conditions' };
      return { ok: false, reason: 'needpay' };           // -> la pop-up 50k
    },

    /** après confirmation de la pop-up : paie 50k et démarre une heure fraîche. */
    arPayAndStart() {
      sweep();
      if (!st.owned || running() || paused() || !st.firstUsed || !condsMet()) return { ok: false, reason: 'state' };
      if (!window.Bank || Bank.balance() < REARM_PRICE) return { ok: false, reason: 'poor' };
      if (!Bank.spend(REARM_PRICE)) return { ok: false, reason: 'poor' };
      startFresh();
      return { ok: true };
    },

    onChange(fn) {
      listeners.push(fn);
      return () => { const i = listeners.indexOf(fn); if (i >= 0) listeners.splice(i, 1); };
    },
  };
})();

window.Bonus = Bonus;
