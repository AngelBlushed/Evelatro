/* ===========================================================
   Comptoir d'échange — troc de skins CS entre joueurs.

   Déroulé (façon Dofus, mais asynchrone) :
     1. tu choisis un joueur et tu regardes son inventaire
     2. tu sélectionnes le skin que tu veux chez lui
     3. tu sélectionnes le skin que tu donnes + une somme de crédits
     4. tu confirmes -> une demande part vers ce joueur
     5. lui la voit tout de suite (s'il est en ligne) ou à sa
        prochaine entrée dans le Casino
     6. il clique Accepter / Refuser, avec une pop-up de confirmation
     7. si accepté : l'échange est fait côté serveur (atomique),
        les deux inventaires + les crédits se recalent tout seuls

   Le serveur (RPC cs_trade_respond) fait foi : il revérifie que
   chacun a bien son skin et assez de crédits avant d'échanger.
   =========================================================== */

const CsTrade = (() => {
  const fmt = n => Number(n || 0).toLocaleString('fr-FR');
  const seenIncoming = new Set();   // ids déjà présentés cette session
  let queue = [];
  let showingOne = false;
  let offSub = null;
  let started = false;

  function skinImg(sk) {
    if (!sk) return null;
    const e = window.CS_IMAGES && CS_IMAGES[sk.crate];
    if (!e || !e.skins) return null;
    let i = (sk.skinIdx != null) ? sk.skinIdx : -1;
    if (i < 0 && window.CS && CS.crate) {
      const cr = CS.crate(sk.crate);
      i = cr ? cr.skins.findIndex(s => s.weapon === sk.weapon && s.name === sk.name) : -1;
    }
    return (i >= 0 && e.skins[i]) || null;
  }

  function skinTile(sk, opts = {}) {
    const img = skinImg(sk);
    const node = el('button', {
      class: 'cst-tile' + (opts.selected ? ' is-sel' : '') + (opts.small ? ' is-sm' : ''),
      style: '--rc:' + (sk.color || '#4b69ff'),
      title: sk.weapon + ' | ' + sk.name,
      onClick: opts.onClick || null,
      disabled: opts.disabled || null,
    },
      img ? el('div', { class: 'cst-tile-img' }, el('img', { src: img, alt: '' }))
          : el('div', { class: 'cst-tile-art' }),
      el('div', { class: 'cst-tile-w', text: sk.weapon }),
      el('div', { class: 'cst-tile-n', text: (sk.stat ? 'ST™ ' : '') + sk.name }),
      el('div', { class: 'cst-tile-p', text: fmt(sk.price) + ' cr.' }),
    );
    return node;
  }

  /* ---------- confirmation générique ---------- */
  function confirmBox(text, okLabel, onOk, tone) {
    openModal({
      title: 'Confirmation',
      build(body, close) {
        body.append(
          el('p', { class: 'game-sub', text }),
          el('div', { class: 'controls' },
            el('button', { class: 'btn', text: 'Annuler', onClick: close }),
            el('button', {
              class: 'btn ' + (tone === 'bad' ? 'btn-danger' : 'btn-primary'),
              text: okLabel,
              onClick: () => { close(); onOk(); },
            }),
          ),
        );
      },
    });
  }

  /* ---------- côté RECEVEUR : présenter une demande ---------- */
  function showIncoming(trade) {
    if (!trade || seenIncoming.has(trade.id)) return;
    seenIncoming.add(trade.id);

    const give = trade.want_skin || {};    // ce que MOI je donne (le skin qu'il veut chez moi)
    const get  = trade.offer_skin || {};   // ce que MOI je reçois
    const cr   = Math.max(0, Math.round(trade.offer_credits || 0));

    openModal({
      title: '🤝 Demande d’échange',
      build(body, close) {
        body.append(
          el('p', { class: 'game-sub cst-inc-who',
            text: (trade.from_pseudo || 'Un joueur') + ' te propose un échange.' }),
          el('div', { class: 'cst-inc-deal' },
            el('div', { class: 'cst-inc-col' },
              el('h4', { text: 'Tu donnes' }),
              skinTile(give, { small: true }),
            ),
            el('div', { class: 'cst-inc-mid', text: '⇄' }),
            el('div', { class: 'cst-inc-col' },
              el('h4', { text: 'Tu reçois' }),
              skinTile(get, { small: true }),
              cr > 0 ? el('div', { class: 'cst-inc-cr', text: '+ ' + fmt(cr) + ' crédits' }) : null,
            ),
          ),
          el('div', { class: 'controls cst-inc-btns' },
            el('button', {
              class: 'btn btn-danger', text: 'Refuser',
              onClick: () => confirmBox(
                'Es-tu sûr de vouloir refuser cet échange ?', 'Oui, refuser',
                async () => { close(); await respond(trade, false); }, 'bad'),
            }),
            el('button', {
              class: 'btn btn-primary', text: 'Accepter',
              onClick: () => confirmBox(
                'Es-tu sûr de vouloir accepter cet échange ?', 'Oui, accepter',
                async () => { close(); await respond(trade, true); }),
            }),
          ),
        );
      },
      onClose() { nextInQueue(); },
    });
  }

  async function respond(trade, accept) {
    const res = await Multiplayer.tradeRespond(trade.id, accept);
    const st = res && res.status;
    if (!accept) {
      Toast.info('Échange refusé.');
    } else if (st === 'accepted') {
      Toast.info('🤝 Échange conclu avec ' + (trade.from_pseudo || 'ce joueur') + ' !');
      await pullMine();
    } else if (st === 'failed') {
      const why = ({
        skin_donneur_absent: 'l’autre joueur n’a plus ce skin',
        skin_receveur_absent: 'tu n’as plus ce skin',
        credits_insuffisants: 'l’autre joueur n’a plus assez de crédits',
        compte_bloque: 'un compte est bloqué',
      })[res.reason] || 'un souci est survenu';
      Toast.info('Échange annulé : ' + why + '.');
      await pullMine();
    } else {
      Toast.info('Échange impossible pour le moment.');
    }
    nextInQueue();
  }

  // recale mon inventaire + mon solde depuis le serveur
  async function pullMine() {
    try {
      const u = Multiplayer.user();
      if (!u) return;
      const row = await Multiplayer.csInvGet(u.id);
      if (row && Array.isArray(row.items) && window.Cases && Cases.replaceAll) {
        Cases.replaceAll(row.items);
      }
    } catch (e) {}
    try { window.WalletLedger && WalletLedger.reconcile(); } catch (e) {}
  }

  function nextInQueue() {
    showingOne = false;
    if (queue.length) { const t = queue.shift(); showingOne = true; showIncoming(t); }
  }

  // à l'entrée du Casino / à la connexion : montre les demandes en attente
  async function checkIncoming() {
    if (!(window.Multiplayer && Multiplayer.isConnected())) return;
    const list = await Multiplayer.tradeIncoming();
    const fresh = (list || []).filter(t => !seenIncoming.has(t.id));
    if (!fresh.length) return;
    queue.push(...fresh);
    if (!showingOne) nextInQueue();
  }

  /* ---------- côté ÉMETTEUR : choisir un joueur et proposer ---------- */
  function open() {
    if (!(window.Multiplayer && Multiplayer.isConnected())) {
      openModal({
        title: '🤝 Comptoir d’échange',
        build(body, close) {
          body.append(el('p', { class: 'game-sub',
            text: 'Connecte-toi avec Discord pour échanger des skins avec les autres joueurs.' }));
          const btn = el('button', { class: 'discord-btn' });
          btn.innerHTML = (typeof DISCORD_LOGO !== 'undefined' ? DISCORD_LOGO : '')
            + '<span>Connecte-toi avec Discord !</span>';
          btn.addEventListener('click', async () => {
            btn.disabled = true;
            try { await Multiplayer.login(); close(); } catch (e) { btn.disabled = false; }
          });
          body.append(btn);
        },
      });
      return;
    }

    let view = 'players';   // 'players' | 'offer'
    let target = null;      // { id, name, items }
    let wantSkin = null;
    let offerSkin = null;
    let offerCredits = 0;
    let traders = null;
    let incoming = [];
    let outgoing = [];

    openModal({
      title: '',
      onClose() {},
      build(body, close) {
        const modal = body.parentElement;
        modal.classList.add('modal-cst');
        const backdrop = body.closest('.modal-backdrop');
        if (backdrop) backdrop.classList.add('cst-backdrop');
        const root = el('div', { class: 'cst-screen' });
        body.append(root);

        async function refreshData() {
          traders = await Multiplayer.csTraders();
          incoming = await Multiplayer.tradeIncoming();
          outgoing = (await Multiplayer.tradeOutgoing()).filter(t => t.status === 'pending');
          render();
        }

        function head(title) {
          return el('div', { class: 'cst-head' },
            view === 'offer'
              ? el('button', { class: 'cst-close', text: '‹', title: 'Retour',
                  onClick: () => { view = 'players'; wantSkin = offerSkin = null; render(); } })
              : null,
            el('div', { class: 'cst-title', text: title }),
            el('div', { class: 'cst-purse' }, 'Solde : ',
              el('b', { text: fmt(Bank.realBalance()) + ' cr.' })),
            el('button', { class: 'cst-close', text: '✕', title: 'Fermer', onClick: close }),
          );
        }

        function renderPlayers() {
          root.append(head('🤝 Comptoir d’échange'));

          if (incoming.length) {
            root.append(el('button', { class: 'cst-inbox',
              text: '📥 ' + incoming.length + ' demande' + (incoming.length > 1 ? 's' : '') + ' reçue' + (incoming.length > 1 ? 's' : '') + ' — voir',
              onClick: () => { queue.push(...incoming.filter(t => !seenIncoming.has(t.id))); if (!showingOne) nextInQueue(); },
            }));
          }
          if (outgoing.length) {
            const box = el('div', { class: 'cst-out' },
              el('div', { class: 'cst-out-h', text: 'Tes demandes en attente' }));
            outgoing.forEach(t => box.append(el('div', { class: 'cst-out-row' },
              el('span', { text: 'À ' + (t.to_pseudo || 'joueur') + ' — '
                + (t.want_skin && t.want_skin.weapon || '?') + ' | ' + (t.want_skin && t.want_skin.name || '?') }),
              el('button', { class: 'cst-out-x', text: 'Annuler',
                onClick: async () => { await Multiplayer.tradeCancel(t.id); refreshData(); } }),
            )));
            root.append(box);
          }

          root.append(el('div', { class: 'cst-pick-h', text: 'Choisis un joueur pour voir son inventaire' }));
          const list = el('div', { class: 'cst-players' });
          if (traders === null) list.append(el('div', { class: 'cst-empty', text: 'Chargement…' }));
          else if (!traders.length) list.append(el('div', { class: 'cst-empty',
            text: 'Aucun joueur n’a d’inventaire à échanger pour l’instant.' }));
          else {
            const online = (Multiplayer.onlineIds && Multiplayer.onlineIds()) || new Set();
            traders.slice().sort((a, b) => (online.has(b.id) ? 1 : 0) - (online.has(a.id) ? 1 : 0))
              .forEach(p => {
                list.append(el('button', { class: 'cst-player', onClick: () => {
                  target = p; view = 'offer'; wantSkin = offerSkin = null; offerCredits = 0; render();
                } },
                  p.avatar ? el('img', { class: 'cst-player-av', src: p.avatar, alt: '' })
                           : el('span', { class: 'cst-player-av cst-player-av--none', text: (p.name || '?')[0] }),
                  el('span', { class: 'cst-player-n', text: p.name }),
                  online.has(p.id) ? el('span', { class: 'cst-player-on', text: '● en ligne' }) : null,
                  el('span', { class: 'cst-player-c', text: p.count + ' skin' + (p.count > 1 ? 's' : '') }),
                ));
              });
          }
          root.append(list);
        }

        function renderOffer() {
          root.append(head('Échange avec ' + (target.name || 'joueur')));

          const cols = el('div', { class: 'cst-cols' });
          root.append(cols);

          // --- son inventaire (je choisis ce que je VEUX) ---
          const theirs = el('div', { class: 'cst-pick' });
          const theirItems = (target.items || []);
          if (!theirItems.length) theirs.append(el('div', { class: 'cst-empty', text: 'Inventaire vide' }));
          theirItems.forEach(sk => theirs.append(skinTile(sk, {
            selected: wantSkin && wantSkin.id === sk.id,
            onClick: () => { wantSkin = (wantSkin && wantSkin.id === sk.id) ? null : sk; render(); },
          })));

          // --- mon inventaire (je choisis ce que je DONNE) ---
          const mine = el('div', { class: 'cst-pick' });
          const myItems = (window.Cases ? Cases.list() : []);
          if (!myItems.length) mine.append(el('div', { class: 'cst-empty', text: 'Ta collection est vide' }));
          myItems.forEach(sk => mine.append(skinTile(sk, {
            selected: offerSkin && offerSkin.id === sk.id,
            onClick: () => { offerSkin = (offerSkin && offerSkin.id === sk.id) ? null : sk; render(); },
          })));

          cols.append(
            el('div', { class: 'cst-col cst-npc' },
              el('h3', { class: 'cst-col-h', text: 'Son inventaire — ce que tu veux' }), theirs),
            el('div', { class: 'cst-col cst-mine' },
              el('h3', { class: 'cst-col-h', text: 'Ta collection — ce que tu donnes' }),
              el('label', { class: 'cst-cred' },
                el('span', { text: 'Crédits en plus' }),
                (() => {
                  const inp = el('input', { class: 'cst-cred-in', type: 'number', min: '0', step: '10',
                    value: String(offerCredits) });
                  inp.addEventListener('input', () => {
                    let v = Math.max(0, Math.floor(Number(inp.value) || 0));
                    if (v > Bank.realBalance()) v = Bank.realBalance();
                    offerCredits = v; renderFoot();
                  });
                  inp.addEventListener('change', () => { inp.value = String(offerCredits); });
                  return inp;
                })(),
              ),
              mine,
            ),
          );

          const foot = el('div', { class: 'cst-foot' });
          root.append(foot);
          function renderFoot() {
            clear(foot);
            const ready = wantSkin && offerSkin && offerCredits <= Bank.realBalance();
            foot.append(el('div', { class: 'cst-verdict' },
              el('span', {}, 'Tu donnes ', el('b', {
                text: (offerSkin ? offerSkin.weapon + ' | ' + offerSkin.name : '— aucun skin —')
                  + (offerCredits > 0 ? ' + ' + fmt(offerCredits) + ' cr.' : '') })),
              el('span', { class: 'cst-arrow', text: '→' }),
              el('span', {}, 'Tu reçois ', el('b', {
                text: wantSkin ? wantSkin.weapon + ' | ' + wantSkin.name : '— choisis un skin —' })),
            ));
            const send = el('button', { class: 'btn btn-primary cst-go', text: 'Envoyer la demande',
              onClick: () => {
                confirmBox(
                  'Envoyer cette demande d’échange à ' + (target.name || 'ce joueur') + ' ?',
                  'Envoyer', async () => {
                    const row = await Multiplayer.tradeCreate({
                      toId: target.id, toName: target.name,
                      offerSkin, offerCredits, wantSkin,
                    });
                    if (row) { Toast.info('Demande envoyée à ' + (target.name || 'ce joueur') + '.'); }
                    else { Toast.info('Impossible d’envoyer la demande.'); }
                    view = 'players'; wantSkin = offerSkin = null; offerCredits = 0;
                    refreshData();
                  });
              } });
            if (!ready) send.setAttribute('disabled', '');
            foot.append(el('div', { class: 'cst-actions' }, send));
          }
          renderFoot();
        }

        function render() {
          clear(root);
          root.dataset.view = view;
          if (view === 'offer' && target) renderOffer();
          else renderPlayers();
        }

        render();
        refreshData();
      },
    });
  }

  /* ---------- branchement temps réel ---------- */
  function start() {
    if (started || !(window.Multiplayer && Multiplayer.isConnected())) return;
    started = true;
    checkIncoming();
    try {
      offSub = Multiplayer.subscribeTrades((row, evt) => {
        const u = Multiplayer.user();
        if (!u) return;
        if (row.to_id === u.id && row.status === 'pending' && (evt === 'INSERT' || evt === 'UPDATE')) {
          if (!seenIncoming.has(row.id)) {
            if (showingOne) queue.push(row);
            else { showingOne = true; showIncoming(row); }
          }
        }
        if (row.from_id === u.id && (evt === 'UPDATE')) {
          if (row.status === 'accepted') { Toast.info('🤝 ' + (row.to_pseudo || 'Le joueur') + ' a accepté ton échange !'); pullMine(); }
          else if (row.status === 'declined') { Toast.info((row.to_pseudo || 'Le joueur') + ' a refusé ton échange.'); }
          else if (row.status === 'failed') { Toast.info('Ton échange n’a pas pu se faire.'); pullMine(); }
        }
      });
    } catch (e) {}
  }
  function stop() {
    started = false;
    if (offSub) { try { offSub(); } catch (e) {} offSub = null; }
  }

  try {
    Multiplayer.onChange(() => { Multiplayer.isConnected() ? start() : stop(); });
    setTimeout(() => { if (Multiplayer.isConnected()) start(); }, 2500);
  } catch (e) {}

  return { open, checkIncoming, start };
})();
window.CsTrade = CsTrade;

// appelé par le bouton de la collection (js/cases.js)
function openCsTrade() { CsTrade.open(); }
