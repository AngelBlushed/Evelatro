/* ===========================================================
   Les skins des croupiers.

   Deux croupiers :
     - "men"   -> le croupier du Blackjack
     - "women" -> la croupière du Poker
   Chacun a 5 tenues : l'indice 0 est la tenue de base (offerte),
   les indices 1 à 4 s'achètent dans la Boutique.

   Prix : 5 000 / 15 000 / 35 000 / 50 000 crédits.
   Les deux croupiers sont indépendants : acheter la tenue 1 de
   l'homme ne débloque PAS la tenue 1 de la femme.

   Acheter dépense les crédits via Bank.spend() -> le solde baisse
   mais le score max n'est jamais touché.

   Tout est gardé en localStorage :
     evelatro-skins-owned  = { men:[0,2], women:[0] }
     evelatro-skin-men     = "2"   (tenue portée)
     evelatro-skin-women   = "0"
   =========================================================== */

const Skins = (() => {
  const PRICES = [0, 5000, 15000, 35000, 50000];

  const CATALOG = {
    men: [
      { name: 'Smoking rubis', tag: 'La tenue maison.' },
      { name: 'Chef flambeur', tag: 'Cuillère en bois, jeton flambé.' },
      { name: 'Costume saphir', tag: 'Trois pièces, coupé sur mesure.' },
      { name: 'Grand magicien', tag: 'Cartes, étoiles et tours de passe-passe.' },
      { name: 'Escale plage', tag: 'En vacances, jamais sans son as.' },
    ],
    women: [
      { name: 'Robe cabaret', tag: 'La tenue maison.' },
      { name: 'Belle du Far West', tag: 'La roulette au bout du bâton.' },
      { name: 'Salon victorien', tag: 'Dentelle, velours et sang-froid.' },
      { name: 'Étoile du cirque', tag: 'La piste est à elle.' },
      { name: 'Plage écarlate', tag: 'Soleil, sable et tapis vert.' },
    ],
  };

  const GENDERS = ['men', 'women'];
  const COUNT = 5;
  const OWN_KEY = 'evelatro-skins-owned';
  const selKey = g => 'evelatro-skin-' + g;
  const src = (g, i) => 'croupiers/' + g + '-' + i + '.webp';

  let owned = load();

  function load() {
    const base = { men: [0], women: [0] };
    try {
      const raw = JSON.parse(localStorage.getItem(OWN_KEY) || '{}');
      for (const g of GENDERS) {
        if (Array.isArray(raw[g])) {
          const clean = raw[g].filter(n => Number.isInteger(n) && n > 0 && n < COUNT);
          base[g] = [...new Set([0, ...clean])].sort((a, b) => a - b);
        }
      }
    } catch (e) { /* défaut */ }
    return base;
  }
  function persist() {
    try { localStorage.setItem(OWN_KEY, JSON.stringify(owned)); } catch (e) { /* pas grave */ }
  }

  function isOwned(g, i) { return i === 0 || (owned[g] || []).includes(i); }

  function selected(g) {
    try {
      const n = parseInt(localStorage.getItem(selKey(g)), 10);
      if (Number.isInteger(n) && n >= 0 && n < COUNT && isOwned(g, n)) return n;
    } catch (e) { /* défaut */ }
    return 0;
  }

  // Écouteurs : si un écouteur renvoie false, on le retire (croupier retiré du DOM).
  let listeners = [];
  function emit() {
    listeners = listeners.filter(fn => {
      try { return fn() !== false; } catch (e) { return false; }
    });
  }

  function entry(g, i) {
    return {
      gender: g, idx: i,
      name: CATALOG[g][i].name,
      tag: CATALOG[g][i].tag,
      price: PRICES[i],
      src: src(g, i),
      owned: isOwned(g, i),
      selected: selected(g) === i,
    };
  }

  return {
    PRICES,
    COUNT,

    list(g) { return CATALOG[g].map((_, i) => entry(g, i)); },
    info(g, i) { return entry(g, i); },
    src,
    price(g, i) { return PRICES[i] || 0; },
    owned: isOwned,
    selected,

    /** Porter une tenue déjà possédée. */
    select(g, i) {
      if (!isOwned(g, i)) return false;
      try { localStorage.setItem(selKey(g), String(i)); } catch (e) { /* pas grave */ }
      emit();
      return true;
    },

    /**
     * Acheter une tenue. Renvoie { ok, reason?, price? }.
     * reason : 'owned' (déjà à toi) | 'poor' (pas assez de crédits).
     * En cas de succès, la tenue est aussi portée aussitôt.
     */
    buy(g, i) {
      if (isOwned(g, i)) return { ok: false, reason: 'owned' };
      const price = PRICES[i] || 0;
      if (Bank.balance() < price || !Bank.spend(price)) return { ok: false, reason: 'poor' };
      owned[g] = [...new Set([...(owned[g] || [0]), i])].sort((a, b) => a - b);
      persist();
      try { localStorage.setItem(selKey(g), String(i)); } catch (e) { /* pas grave */ }
      emit();
      return { ok: true, price };
    },

    onChange(fn) {
      listeners.push(fn);
      return () => { listeners = listeners.filter(x => x !== fn); };
    },

    /* --- synchro cloud (les skins ne se perdent jamais) --- */
    snapshot() {
      return {
        owned: { men: (owned.men || [0]).slice(), women: (owned.women || [0]).slice() },
        worn: { men: selected('men'), women: selected('women') },
      };
    },
    // applique un état venu du cloud. Renvoie true si quelque chose a changé.
    applyRemote(data) {
      if (!data) return false;
      let changed = false;
      const norm = a => [...new Set([0, ...(Array.isArray(a) ? a : []).filter(n => Number.isInteger(n) && n > 0 && n < COUNT)])].sort((x, y) => x - y);
      for (const g of GENDERS) {
        const remote = norm((data.owned && data.owned[g]) || []);
        // FUSION : on ne perd jamais un skin -> union local + cloud
        const merged = [...new Set([...(owned[g] || [0]), ...remote])].sort((x, y) => x - y);
        if (JSON.stringify(merged) !== JSON.stringify(owned[g] || [0])) { owned[g] = merged; changed = true; }
        const w = data.worn && data.worn[g];
        if (Number.isInteger(w) && w >= 0 && w < COUNT && merged.includes(w) && selected(g) !== w) {
          try { localStorage.setItem(selKey(g), String(w)); changed = true; } catch (e) {}
        }
      }
      if (changed) { persist(); emit(); }
      return changed;
    },
  };
})();

window.Skins = Skins;
