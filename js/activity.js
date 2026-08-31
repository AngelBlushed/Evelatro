/* ===========================================================
   Journal "Actions en directe".
   Chaque entrée : heure, pseudo, jeu, détail (main / combo /
   sélection), mise, gain net. On voit l'appli vivre.
   Gardé dans le navigateur -> on retrouve l'historique au
   prochain lancement (ne se réinitialise plus).
   =========================================================== */

const Activity = (() => {
  const MAX = 60;
  const KEY = 'evelatro-activity';
  const listeners = [];
  const logListeners = [];

  let entries = load();

  function load() {
    try {
      const raw = JSON.parse(localStorage.getItem(KEY) || '[]');
      return Array.isArray(raw) ? raw.slice(0, MAX) : [];
    } catch (e) { return []; }
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(entries.slice(0, MAX))); } catch (e) {}
  }

  function who() {
    try {
      if (window.Multiplayer && Multiplayer.isConnected() && Multiplayer.user()) {
        return Multiplayer.user().name;
      }
    } catch (e) { /* rien */ }
    return 'Toi';
  }

  function log(e) {
    let bal = e.balance;
    if (bal == null && !e._remote) { try { bal = window.Bank ? Bank.balance() : null; } catch (er) { bal = null; } }
    const entry = {
      t: Date.now(),
      who: e.who || who(),
      game: e.game || '',
      detail: e.detail || '',
      bet: (e.bet === 0 || e.bet) ? e.bet : null,
      gain: (e.gain === 0 || e.gain) ? e.gain : null,
      balance: (bal === 0 || bal) ? bal : null,
      tone: e.tone || (e.gain > 0 ? 'win' : e.gain < 0 ? 'lose' : 'push'),
    };
    entries.unshift(entry);
    if (entries.length > MAX) entries.pop();
    save();
    listeners.forEach(fn => { try { fn(); } catch (err) { /* rien */ } });
    logListeners.forEach(fn => { try { fn(entry, e); } catch (err) { /* rien */ } });

    // si connecté : on partage l'action avec les amis (temps réel)
    try {
      if (!e._remote && window.Multiplayer && Multiplayer.isConnected()) Multiplayer.pushActivity(entry);
    } catch (err) { /* rien */ }
  }

  function list() { return entries.slice(); }

  function onChange(fn) {
    listeners.push(fn);
    return () => { const i = listeners.indexOf(fn); if (i >= 0) listeners.splice(i, 1); };
  }
  function onLog(fn) {
    logListeners.push(fn);
    return () => { const i = logListeners.indexOf(fn); if (i >= 0) logListeners.splice(i, 1); };
  }

  return { log, list, onChange, onLog };
})();

window.Activity = Activity;
