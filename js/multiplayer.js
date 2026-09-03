/* ===========================================================
   Multijoueur — connexion Discord + classement + flux d'actions
   partagés en temps réel (Supabase Realtime).
   Tables Supabase attendues : public.scores et public.activity
   (voir supabase-setup.sql).
   =========================================================== */

const Multiplayer = (() => {
  const client = supabase.createClient(MP_CONFIG.SUPABASE_URL, MP_CONFIG.SUPABASE_ANON_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
      flowType: 'pkce',
    },
  });

  let currentUser = null;
  let ready = false;
  const listeners = [];

  function emit() { listeners.forEach(fn => { try { fn(); } catch (e) { /* rien */ } }); }

  function setFromSession(session) {
    if (session && session.user) {
      const m = session.user.user_metadata || {};
      const ident = (session.user.identities || [])[0] || {};
      currentUser = {
        id: session.user.id,
        name: m.full_name || m.name || m.global_name || m.preferred_username || 'Joueur',
        avatar: m.avatar_url || m.picture || null,
        discordId: String(m.provider_id || m.sub || ident.id || '') || null,
      };
      // enregistre le lien  discord_id <-> user_id  pour que le BOT retrouve
      // le bon solde / les bons skins
      if (currentUser.discordId) {
        client.from('profiles').upsert({
          user_id: currentUser.id, discord_id: currentUser.discordId,
          pseudo: currentUser.name, avatar_url: currentUser.avatar,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id' }).then(() => {}, e => console.warn('profiles', e && e.message));
      }
    } else {
      currentUser = null;
    }
    try { if (currentUser) ensurePresence(); else dropPresence(); } catch (e) { /* rien */ }
    emit();
  }

  let authError = null;

  // Retour d'une connexion Discord dans le navigateur (?code=...) puis session.
  (async () => {
    try {
      const r = await AuthFlow.completeBrowserRedirect(client);
      if (r && r.error) { authError = r.error; console.warn('Auth Discord :', r.error); }
    } catch (e) { authError = (e && e.message) || String(e); }
    const { data } = await client.auth.getSession();
    ready = true;
    setFromSession(data.session);
    if (data.session) { authError = null; Multiplayer.pushLiveScore(); }
    emit();
  })();
  client.auth.onAuthStateChange((_event, session) => setFromSession(session));

  async function login() {
    await AuthFlow.signIn(client);           // ouvre Discord ; setFromSession suivra
    Multiplayer.pushLiveScore();
  }

  async function logout() {
    await client.auth.signOut();
    currentUser = null;
    emit();
  }

  function isConnected() { return !!currentUser; }
  function isReady() { return ready; }
  function user() { return currentUser; }

  async function myBest() {
    if (!currentUser) return 0;
    const { data } = await client.from('scores')
      .select('best_score').eq('user_id', currentUser.id).maybeSingle();
    return (data && data.best_score) || 0;
  }

  /* Le classement est maintenant EN DIRECT : on pousse le solde courant (pas le
     pic d'une partie finie). Comme ça on voit un ami monter sans qu'il ait à
     tomber à 0. Jamais en mode DEV ni pendant un duel (solde virtuel). */
  let liveTimer = null;
  function pushLiveScore() {
    if (!currentUser || window.__EVELATRO_DEV__) return;
    try { if (window.Bank && Bank.inFight && Bank.inFight()) return; } catch (e) {}
    clearTimeout(liveTimer);
    liveTimer = setTimeout(async () => {
      liveTimer = null;
      if (!currentUser) return;
      const s = Math.max(0, Math.round((window.Bank ? Bank.balance() : 0)));
      try {
        await client.from('scores').upsert({
          user_id: currentUser.id,
          pseudo: currentUser.name,
          avatar_url: currentUser.avatar,
          best_score: s,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id' });
      } catch (e) { console.warn('pushLiveScore', e.message); }
    }, 1500);
  }
  // compat : d'anciens appels passent une valeur, on l'ignore, on pousse le solde
  function submitScore() { pushLiveScore(); }

  async function leaderboard() {
    try {
      const { data, error } = await client.from('scores')
        .select('user_id,pseudo,avatar_url,best_score,updated_at')
        .order('best_score', { ascending: false })
        .limit(50);
      if (error) throw error;
      return data.map(r => ({
        name: r.pseudo || 'Joueur',
        score: r.best_score,
        avatar: r.avatar_url,
        date: r.updated_at,
        me: currentUser && r.user_id === currentUser.id,
      }));
    } catch (e) {
      console.warn('leaderboard', e.message);
      return null;   // null = erreur de chargement (affiché à l'écran)
    }
  }

  /* --- Flux d'actions partagé (toi + tes amis, en direct) --- */

  async function pushActivity(e) {
    if (!currentUser) return;
    try {
      await client.from('activity').insert({
        user_id: currentUser.id,
        pseudo: currentUser.name,
        avatar_url: currentUser.avatar,
        game: e.game || null,
        detail: e.detail || null,
        bet: (e.bet === 0 || e.bet) ? e.bet : null,
        gain: (e.gain === 0 || e.gain) ? e.gain : null,
        balance: (e.balance === 0 || e.balance) ? e.balance : null,
        tone: e.tone || null,
      });
    } catch (err) {
      console.warn('pushActivity', err.message);
    }
  }

  async function recentActivity() {
    try {
      const { data, error } = await client.from('activity')
        .select('user_id,pseudo,game,detail,bet,gain,balance,tone,created_at')
        .order('created_at', { ascending: false })
        .limit(60);
      if (error) throw error;
      return data;
    } catch (e) {
      console.warn('recentActivity', e.message);
      return null;
    }
  }

  let liveChannel = null;
  const activitySubs = [];

  function subscribeActivity(onInsert) {
    activitySubs.push(onInsert);
    if (!liveChannel) {
      liveChannel = client
        .channel('evelatro-live')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'activity' },
          payload => activitySubs.forEach(fn => { try { fn(payload.new); } catch (e) {} }))
        .subscribe();
    }
    return () => {
      const i = activitySubs.indexOf(onInsert);
      if (i >= 0) activitySubs.splice(i, 1);
      if (!activitySubs.length && liveChannel) {
        client.removeChannel(liveChannel);
        liveChannel = null;
      }
    };
  }

  /* --- Présence : qui est en ligne --- */
  let presenceChannel = null;
  const presenceSubs = [];
  function notifyPresence() { presenceSubs.forEach(fn => { try { fn(); } catch (e) {} }); }

  function ensurePresence() {
    if (presenceChannel || !currentUser) return;
    const uid = currentUser.id;
    presenceChannel = client.channel('evelatro-presence', { config: { presence: { key: uid } } });
    presenceChannel
      .on('presence', { event: 'sync' }, notifyPresence)
      .on('presence', { event: 'join' }, notifyPresence)
      .on('presence', { event: 'leave' }, notifyPresence)
      .subscribe(async status => {
        if (status === 'SUBSCRIBED') {
          await presenceChannel.track({
            id: uid, name: currentUser.name, avatar: currentUser.avatar || null,
            at: Date.now(), v: window.APP_BUILD || '',
          });
        }
      });
  }
  function dropPresence() {
    if (presenceChannel) { try { client.removeChannel(presenceChannel); } catch (e) {} presenceChannel = null; }
  }
  function onlineIds() {
    const ids = new Set();
    if (!presenceChannel) return ids;
    try {
      const st = presenceChannel.presenceState();
      Object.values(st).forEach(arr => arr.forEach(p => p && p.id && ids.add(p.id)));
    } catch (e) { /* rien */ }
    return ids;
  }
  // id -> { name, avatar, v } pour chaque joueur en ligne
  function onlineInfo() {
    const map = {};
    if (!presenceChannel) return map;
    try {
      const st = presenceChannel.presenceState();
      Object.values(st).forEach(arr => arr.forEach(p => {
        if (p && p.id) map[p.id] = { name: p.name || 'Joueur', avatar: p.avatar || null, v: p.v || '' };
      }));
    } catch (e) { /* rien */ }
    return map;
  }
  function subscribePresence(fn) {
    presenceSubs.push(fn);
    ensurePresence();
    return () => { const i = presenceSubs.indexOf(fn); if (i >= 0) presenceSubs.splice(i, 1); };
  }
  async function roster() {
    try {
      const { data, error } = await client.from('scores').select('user_id,pseudo').limit(200);
      if (error) throw error;
      return data.map(r => ({ id: r.user_id, name: r.pseudo || 'Joueur' }));
    } catch (e) { return null; }
  }

  /* --- Chat --- */
  async function sendMessage(text) {
    if (!currentUser || !text || !text.trim()) return;
    try {
      await client.from('messages').insert({
        user_id: currentUser.id, pseudo: currentUser.name, body: text.trim().slice(0, 300),
      });
    } catch (e) { console.warn('sendMessage', e.message); }
  }
  async function recentMessages() {
    try {
      const { data, error } = await client.from('messages')
        .select('user_id,pseudo,body,created_at').order('created_at', { ascending: false }).limit(50);
      if (error) throw error;
      return data;
    } catch (e) { return null; }
  }
  let msgChannel = null;
  const msgSubs = [];
  function subscribeMessages(fn) {
    msgSubs.push(fn);
    if (!msgChannel) {
      msgChannel = client.channel('evelatro-chat')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' },
          p => msgSubs.forEach(f => { try { f(p.new); } catch (e) {} }))
        .subscribe();
    }
    return () => {
      const i = msgSubs.indexOf(fn); if (i >= 0) msgSubs.splice(i, 1);
      if (!msgSubs.length && msgChannel) { client.removeChannel(msgChannel); msgChannel = null; }
    };
  }

  /* --- Porte-monnaie : SERVEUR AUTORITAIRE (anti-triche) ---
     Le client n'écrit plus jamais le solde. Il lit (walletState), et pousse
     des mouvements validés côté serveur (walletCommit). */
  async function walletState() {
    if (!currentUser) return null;
    try {
      const { data, error } = await client.rpc('wallet_state');
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      if (!row) return null;
      return {
        credits: Number(row.credits),
        flagged: !!row.flagged,
        flagReason: row.flag_reason || null,
        csInv: row.cs_inv || null,
        bonuses: row.bonuses || null,
      };
    } catch (e) { console.warn('walletState', e.message); return null; }
  }

  /* Sauvegarde serveur (filet anti faux-positif) de l'inventaire de caisses
     et des bonus boutique. Passe null pour ne pas toucher à l'un des deux. */
  async function gameSync(csInv, bonuses) {
    if (!currentUser) return;
    try {
      await client.rpc('game_sync', {
        p_cs_inv: csInv == null ? null : csInv,
        p_bonuses: bonuses == null ? null : bonuses,
      });
    } catch (e) { console.warn('gameSync', e.message); }
  }
  async function walletCommit(entries) {
    if (!currentUser || !Array.isArray(entries) || !entries.length) return null;
    try {
      const { data, error } = await client.rpc('wallet_commit', { p_entries: entries });
      if (error) throw error;
      return {
        credits: Number(data.credits),
        flagged: !!data.flagged,
        flagReason: data.flag_reason || null,
        rejected: data.rejected || [],
      };
    } catch (e) { console.warn('walletCommit', e.message); return null; }
  }
  async function walletGet() {
    if (!currentUser) return null;
    try {
      const { data, error } = await client.from('wallet')
        .select('credits,updated_at,flagged').eq('user_id', currentUser.id).maybeSingle();
      if (error) throw error;
      return data ? { credits: Number(data.credits), updated_at: data.updated_at, flagged: !!data.flagged } : null;
    } catch (e) { console.warn('walletGet', e.message); return null; }
  }
  // compat : plus personne ne doit l'appeler (l'écriture directe est bloquée par RLS)
  async function walletPush() { return false; }
  /* --- Skins des croupiers (partagés, ne se perdent jamais) --- */
  async function skinsGet() {
    if (!currentUser) return null;
    try {
      const { data, error } = await client.from('user_skins')
        .select('owned,worn,updated_at').eq('user_id', currentUser.id).maybeSingle();
      if (error) throw error;
      return data || null;
    } catch (e) { console.warn('skinsGet', e.message); return null; }
  }
  async function skinsPush(owned, worn) {
    if (!currentUser) return false;
    try {
      const { error } = await client.from('user_skins').upsert({
        user_id: currentUser.id, owned, worn, updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' });
      if (error) throw error;
      return true;
    } catch (e) { console.warn('skinsPush', e.message); return false; }
  }
  let skinsChannel = null;
  const skinsSubs = [];
  function subscribeSkins(fn) {
    skinsSubs.push(fn);
    if (!skinsChannel && currentUser) {
      skinsChannel = client.channel('evelatro-skins-' + currentUser.id)
        .on('postgres_changes',
          { event: '*', schema: 'public', table: 'user_skins', filter: 'user_id=eq.' + currentUser.id },
          p => skinsSubs.forEach(f => { try { f(p.new); } catch (e) {} }))
        .subscribe();
    }
    return () => {
      const i = skinsSubs.indexOf(fn); if (i >= 0) skinsSubs.splice(i, 1);
      if (!skinsSubs.length && skinsChannel) { try { client.removeChannel(skinsChannel); } catch (e) {} skinsChannel = null; }
    };
  }

  let walletChannel = null;
  const walletSubs = [];
  function subscribeWallet(fn) {
    walletSubs.push(fn);
    if (!walletChannel && currentUser) {
      walletChannel = client.channel('evelatro-wallet-' + currentUser.id)
        .on('postgres_changes',
          { event: '*', schema: 'public', table: 'wallet', filter: 'user_id=eq.' + currentUser.id },
          p => walletSubs.forEach(f => { try { f(p.new); } catch (e) {} }))
        .subscribe();
    }
    return () => {
      const i = walletSubs.indexOf(fn); if (i >= 0) walletSubs.splice(i, 1);
      if (!walletSubs.length && walletChannel) {
        try { client.removeChannel(walletChannel); } catch (e) {}
        walletChannel = null;
      }
    };
  }

  /* --- Duels (VS) --- */
  async function challenge(opponentId, opponentName, pct, game, roundsTarget, slotMachine) {
    if (!currentUser) return null;
    try {
      const { data, error } = await client.from('duels').insert({
        challenger_id: currentUser.id, challenger: currentUser.name,
        opponent_id: opponentId, opponent: opponentName,
        pct, status: 'pending', chal_version: window.APP_BUILD || null,
        game: game || 'blackjack',
        rounds_target: [1, 5, 10].includes(roundsTarget) ? roundsTarget : 5,
        slot_machine: [0, 1, 2].includes(slotMachine) ? slotMachine : 0,
        round_no: 1, chal_rounds: 0, opp_rounds: 0,
        chal_score: null, opp_score: null, chal_dq: false, opp_dq: false,
      }).select().single();
      if (error) throw error;
      return data;
    } catch (e) { console.warn('challenge', e.message); return null; }
  }
  async function updateDuel(id, patch) {
    try {
      const { data, error } = await client.from('duels')
        .update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id).select().single();
      if (error) throw error;
      return data;
    } catch (e) { console.warn('updateDuel', e.message); return null; }
  }
  async function currentDuel() {
    if (!currentUser) return null;
    try {
      const { data, error } = await client.from('duels')
        .select('*').in('status', ['pending', 'accepted'])
        .order('created_at', { ascending: false }).limit(5);
      if (error) throw error;
      return (data || []).find(d =>
        d.challenger_id === currentUser.id || d.opponent_id === currentUser.id) || null;
    } catch (e) { return null; }
  }
  async function getDuel(id) {
    try {
      const { data, error } = await client.from('duels').select('*').eq('id', id).maybeSingle();
      if (error) throw error;
      return data || null;
    } catch (e) { return null; }
  }
  let duelChannel = null;
  const duelSubs = [];
  function subscribeDuels(fn) {
    duelSubs.push(fn);
    if (!duelChannel) {
      duelChannel = client.channel('evelatro-duels')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'duels' },
          p => duelSubs.forEach(f => { try { f(p.new || p.old, p.eventType); } catch (e) {} }))
        .subscribe();
    }
    return () => {
      const i = duelSubs.indexOf(fn); if (i >= 0) duelSubs.splice(i, 1);
      if (!duelSubs.length && duelChannel) { client.removeChannel(duelChannel); duelChannel = null; }
    };
  }

  /* --- Comptoir d'échange (skins CS entre joueurs) --- */

  // miroir public de MON inventaire de caisses (pour que les autres le voient)
  async function csInvPush(items) {
    if (!currentUser) return false;
    try {
      const { error } = await client.from('cs_inventories').upsert({
        user_id: currentUser.id, pseudo: currentUser.name, avatar_url: currentUser.avatar,
        items: Array.isArray(items) ? items.slice(0, 500) : [],
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' });
      if (error) throw error;
      return true;
    } catch (e) { console.warn('csInvPush', e.message); return false; }
  }
  // inventaire public d'un autre joueur
  async function csInvGet(userId) {
    if (!userId) return null;
    try {
      const { data, error } = await client.from('cs_inventories')
        .select('user_id,pseudo,avatar_url,items,updated_at').eq('user_id', userId).maybeSingle();
      if (error) throw error;
      return data || null;
    } catch (e) { console.warn('csInvGet', e.message); return null; }
  }
  // liste des joueurs qui ont un inventaire public non vide
  async function csTraders() {
    try {
      const { data, error } = await client.from('cs_inventories')
        .select('user_id,pseudo,avatar_url,items,updated_at')
        .order('updated_at', { ascending: false }).limit(200);
      if (error) throw error;
      return (data || [])
        .filter(r => r.user_id !== (currentUser && currentUser.id) && Array.isArray(r.items) && r.items.length)
        .map(r => ({ id: r.user_id, name: r.pseudo || 'Joueur', avatar: r.avatar_url || null,
          count: r.items.length, items: r.items }));
    } catch (e) { console.warn('csTraders', e.message); return null; }
  }
  // A crée une demande : je donne offerSkin + offerCredits, je veux wantSkin (à toId)
  async function tradeCreate({ toId, toName, offerSkin, offerCredits, wantSkin }) {
    if (!currentUser) return null;
    try {
      const { data, error } = await client.from('cs_trades').insert({
        from_id: currentUser.id, from_pseudo: currentUser.name,
        to_id: toId, to_pseudo: toName || null,
        offer_skin: offerSkin, offer_credits: Math.max(0, Math.round(offerCredits || 0)),
        want_skin: wantSkin, status: 'pending',
      }).select().single();
      if (error) throw error;
      return data;
    } catch (e) { console.warn('tradeCreate', e.message); return null; }
  }
  async function tradeIncoming() {
    if (!currentUser) return [];
    try {
      const { data, error } = await client.from('cs_trades')
        .select('*').eq('to_id', currentUser.id).eq('status', 'pending')
        .order('created_at', { ascending: true });
      if (error) throw error;
      return data || [];
    } catch (e) { console.warn('tradeIncoming', e.message); return []; }
  }
  async function tradeOutgoing() {
    if (!currentUser) return [];
    try {
      const { data, error } = await client.from('cs_trades')
        .select('*').eq('from_id', currentUser.id)
        .order('created_at', { ascending: false }).limit(20);
      if (error) throw error;
      return data || [];
    } catch (e) { return []; }
  }
  // B répond : accept = true/false. L'échange atomique est fait côté serveur.
  async function tradeRespond(id, accept) {
    if (!currentUser) return null;
    try {
      const { data, error } = await client.rpc('cs_trade_respond', { p_id: id, p_accept: !!accept });
      if (error) throw error;
      return data || null;
    } catch (e) { console.warn('tradeRespond', e.message); return { status: 'error', reason: e.message }; }
  }
  async function tradeCancel(id) {
    if (!currentUser) return false;
    try {
      const { error } = await client.from('cs_trades')
        .update({ status: 'cancelled', resolved_at: new Date().toISOString() })
        .eq('id', id).eq('from_id', currentUser.id).eq('status', 'pending');
      if (error) throw error;
      return true;
    } catch (e) { return false; }
  }
  let tradeChannel = null;
  const tradeSubs = [];
  function subscribeTrades(fn) {
    tradeSubs.push(fn);
    if (!tradeChannel && currentUser) {
      tradeChannel = client.channel('evelatro-trades-' + currentUser.id)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'cs_trades' },
          p => {
            const row = p.new || p.old;
            if (!row || !currentUser) return;
            if (row.from_id !== currentUser.id && row.to_id !== currentUser.id) return;
            tradeSubs.forEach(f => { try { f(row, p.eventType); } catch (e) {} });
          })
        .subscribe();
    }
    return () => {
      const i = tradeSubs.indexOf(fn); if (i >= 0) tradeSubs.splice(i, 1);
      if (!tradeSubs.length && tradeChannel) { try { client.removeChannel(tradeChannel); } catch (e) {} tradeChannel = null; }
    };
  }

  function onChange(fn) {
    listeners.push(fn);
    return () => { const i = listeners.indexOf(fn); if (i >= 0) listeners.splice(i, 1); };
  }

  return {
    login, logout, isConnected, isReady, user,
    submitScore, pushLiveScore, leaderboard, onChange,
    pushActivity, recentActivity, subscribeActivity,
    onlineIds, onlineInfo, subscribePresence, roster,
    version: () => window.APP_BUILD || '',
    sendMessage, recentMessages, subscribeMessages,
    challenge, updateDuel, currentDuel, getDuel, subscribeDuels,
    walletGet, walletPush, walletState, walletCommit, gameSync, subscribeWallet,
    skinsGet, skinsPush, subscribeSkins,
    csInvPush, csInvGet, csTraders,
    tradeCreate, tradeIncoming, tradeOutgoing, tradeRespond, tradeCancel, subscribeTrades,
    canConnect: () => true,
    lastAuthError: () => authError,
    clearAuthError: () => { authError = null; },
    client,
  };
})();

window.Multiplayer = Multiplayer;

// Classement EN DIRECT : à chaque changement de solde, on pousse le solde courant.
// + un battement toutes les 60 s pour rester au classement même si on ne joue pas
//   (le bot peut vider la table toutes les 10 min).
try {
  Bank.onChange(() => Multiplayer.pushLiveScore());
  Bank.onRefill(() => Multiplayer.pushLiveScore());
  setInterval(() => { if (Multiplayer.isConnected()) Multiplayer.pushLiveScore(); }, 60_000);
} catch (e) { /* rien */ }
