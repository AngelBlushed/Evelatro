/* ===========================================================
   La banque : le seul endroit qui connaît le nombre de crédits.
   Les jeux ne touchent jamais au solde directement, ils passent
   par place() / payout() / endRound().

   Elle tient aussi le tableau des records : à chaque fois qu'on
   tombe à 0, on enregistre le SOMMET de crédits atteint pendant
   la partie qui vient de se terminer.
   =========================================================== */

const Bank = (() => {
  const START = 200;                          // solde de départ (et de recharge)
  const KEY = 'petit-casino-credits';
  const SCORE_KEY = 'petit-casino-scores';
  const MAX_SCORES = 10;

  let credits = loadCredits();
  let runPeak = credits;                      // plus haut solde atteint depuis la dernière recharge
  let scores = loadScores();                  // records passés, triés du meilleur au moins bon

  const onChangeFns = [];
  const onRefillFns = [];

  // --- JOURNAL anti-triche : chaque mouvement est mis en file, puis validé
  //     par le serveur (voir js/wallet-ledger.js). Rien en mode DEV / duel. ---
  let ctx = null;                              // jeu en cours (métadonnée)
  let pending = [];
  const isDev = () => !!window.__EVELATRO_DEV__;
  function logMove(delta, reason) {
    if (isDev() || inFight()) return;
    delta = Math.round(delta);
    if (!delta) return;
    pending.push({ delta, reason, game: ctx });
    if (pending.length > 400) pending.splice(0, pending.length - 400);  // garde-fou mémoire
  }

  // Pendant un duel VS "EveFight!", on joue en crédits VIRTUELS : la mise n'est
  // jamais retirée, on ne peut pas être à sec, et rien n'est enregistré.
  function inFight() {
    try { return !!(window.Duel && Duel.inFight && Duel.inFight()); } catch (e) { return false; }
  }

  function loadCredits() {
    try {
      const n = parseInt(localStorage.getItem(KEY), 10);
      return Number.isFinite(n) && n > 0 ? n : START;
    } catch (e) {
      return START;
    }
  }

  function loadScores() {
    try {
      const raw = JSON.parse(localStorage.getItem(SCORE_KEY) || '[]');
      if (!Array.isArray(raw)) return [];
      return raw
        .map(s => (typeof s === 'number' ? { score: s } : s))
        .filter(s => s && Number.isFinite(s.score))
        .sort((a, b) => b.score - a.score)
        .slice(0, MAX_SCORES);
    } catch (e) {
      return [];
    }
  }

  function persist() {
    try {
      localStorage.setItem(KEY, String(credits));
      localStorage.setItem(SCORE_KEY, JSON.stringify(scores));
    } catch (e) { /* pas grave */ }
  }

  function announce() {
    if (credits > runPeak) runPeak = credits;  // on suit le sommet en direct
    persist();
    onChangeFns.forEach(fn => fn(credits));
  }

  return {
    START,

    balance() { return inFight() ? 1e9 : credits; },
    currentPeak() { return runPeak; },
    inFight,
    scores() { return scores.slice(); },
    bestScore() { return scores.length ? scores[0].score : 0; },

    clearScores() { scores = []; persist(); },

    canPlace(amount) {
      if (inFight()) return Number.isFinite(amount) && amount > 0;
      return Number.isFinite(amount) && amount > 0 && amount <= credits;
    },

    place(amount) {
      if (inFight()) { if (window.Duel) Duel.markActing(); return Number.isFinite(amount) && amount > 0; }
      if (!this.canPlace(amount)) return false;
      credits -= amount;
      logMove(-amount, 'bet');
      announce();
      return true;
    },

    /**
     * Prend une mise, MAIS jamais plus que le solde disponible.
     * Renvoie le montant réellement misé (0 si le solde est à 0).
     * C'est ce qu'utilisent les jeux : ainsi on peut toujours jouer,
     * on finit toujours par tomber à 0, et la recharge se déclenche.
     */
    stake(amount) {
      const wanted = Math.max(0, Math.round(amount || 0));
      if (inFight()) { if (window.Duel) Duel.markActing(); return wanted; }  // mise virtuelle
      const real = Math.min(wanted, credits);
      if (real <= 0) return 0;
      credits -= real;
      logMove(-real, 'bet');
      announce();
      return real;
    },

    payout(amount) {
      if (inFight()) return;                 // gains virtuels pendant le duel
      const gain = Math.round(amount);
      if (gain > 0) { credits += gain; logMove(gain, 'win'); announce(); }
    },

    /**
     * Force le solde à une valeur (utilisé par la synchro cloud : quand un
     * autre appareil change le solde partagé). Ne relance PAS d'envoi cloud
     * (WalletSync s'en occupe via son garde-fou).
     */
    setCredits(n) {
      if (inFight()) return;
      const v = Math.max(0, Math.round(Number(n)));
      if (!Number.isFinite(v) || v === credits) return;
      credits = v;
      announce();
    },

    /** Contexte de jeu courant (métadonnée du journal). */
    setContext(name) { ctx = name || null; },

    /** --- accès au journal (pour js/wallet-ledger.js) --- */
    _ledgerTake() { const out = pending; pending = []; return out; },
    _ledgerRestore(entries) { if (entries && entries.length) pending = entries.concat(pending); },
    _ledgerPendingCount() { return pending.length; },

    /**
     * Dépense des crédits pour un achat (boutique).
     * Retire les crédits, met à jour l'affichage, mais NE TOUCHE PAS
     * au tableau des records : le score max reste intact.
     * Renvoie false si le solde est insuffisant.
     */
    spend(amount) {
      const cost = Math.max(0, Math.round(amount || 0));
      if (cost <= 0) return true;
      if (cost > credits) return false;
      credits -= cost;
      logMove(-cost, 'purchase');
      announce();
      return true;
    },

    /** Vente d'un skin de caisse -> crédits. */
    sell(amount) {
      const g = Math.max(0, Math.round(amount || 0));
      if (g <= 0) return;
      credits += g;
      logMove(g, 'sell');
      announce();
    },

    /** Bouton d'urgence : quand on est à sec, redemande la recharge serveur. */
    rescue() {
      if (inFight() || credits > 0) return false;
      credits = START;
      runPeak = Math.max(runPeak, START);
      announce();
      try { window.WalletLedger && WalletLedger.reconcile(); } catch (e) {}
      return true;
    },

    /**
     * Fin de manche. Si le solde est à 0 : on recharge 200 crédits.
     * On n'inscrit un record QUE si on a dépassé la mise de départ
     * (sinon le tableau se remplirait de 200 à chaque partie ratée).
     */
    endRound() {
      if (inFight()) return false;           // pas de recharge / record pendant un duel
      if (credits > 0) return false;

      const peak = runPeak;
      let isRecord = false;

      if (peak > START) {
        const prevBest = this.bestScore();
        scores.push({ score: peak, date: Date.now() });
        scores.sort((a, b) => b.score - a.score);
        scores = scores.slice(0, MAX_SCORES);
        isRecord = peak > prevBest;
      }

      credits = START;
      runPeak = START;
      announce();
      // la recharge est validée côté serveur (wallet_state) : on force une réconciliation
      try { window.WalletLedger && WalletLedger.reconcile(); } catch (e) {}
      onRefillFns.forEach(fn => fn({ peak, best: this.bestScore(), isRecord, recorded: peak > START }));
      return true;
    },

    onChange(fn) { onChangeFns.push(fn); fn(credits); },
    onRefill(fn) { onRefillFns.push(fn); },
  };
})();

window.Bank = Bank;
