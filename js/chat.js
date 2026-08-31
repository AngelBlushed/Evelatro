/* ===========================================================
   Chat (bouton bulle du dock).
   - panneau : historique + envoi
   - "overlay" discret : quand un message arrive, il apparaît en
     bas, en opacité réduite, 5 s, puis disparaît (désactivable)
   - pastille rouge sur l'icône : messages non lus (1..9 puis 9+)
   =========================================================== */

const Chat = (() => {
  let unread = 0;
  let subOff = null;
  let panelOpen = false;

  const overlayEnabled = () => localStorage.getItem('evelatro-chat-overlay') !== '0';

  function badgeEl() { return document.getElementById('chat-badge'); }
  function paintBadge() {
    const b = badgeEl();
    if (!b) return;
    if (unread <= 0) { b.hidden = true; return; }
    b.hidden = false;
    b.textContent = unread > 9 ? '9+' : String(unread);
  }
  function markRead() { unread = 0; paintBadge(); }

  /* --- overlay discret --- */
  let stack = null;
  function overlayStack() {
    if (!stack) { stack = el('div', { class: 'chat-overlay-stack' }); document.body.append(stack); }
    return stack;
  }
  function flash(row) {
    if (!overlayEnabled() || panelOpen) return;
    const bubble = el('div', { class: 'chat-flash' },
      el('b', { text: row.pseudo + ' ' }),
      el('span', { text: row.body }),
    );
    overlayStack().append(bubble);
    bubble.animate(
      [{ opacity: 0, transform: 'translateY(8px)' }, { opacity: .72, transform: 'translateY(0)' }],
      { duration: 300, easing: 'ease-out', fill: 'both' });
    setTimeout(() => {
      const out = bubble.animate([{ opacity: .72 }, { opacity: 0 }], { duration: 500, fill: 'both' });
      out.onfinish = () => bubble.remove();
    }, 5000);
  }

  function onIncoming(row) {
    const me = Multiplayer.user();
    if (me && row.user_id === me.id) return;   // pas mes propres messages
    if (!panelOpen) { unread++; paintBadge(); }
    flash(row);
    try { Sound.blip(560); } catch (e) {}
  }

  function sync() {
    const connected = window.Multiplayer && Multiplayer.isConnected();
    if (connected && !subOff) {
      subOff = Multiplayer.subscribeMessages(onIncoming);
    } else if (!connected && subOff) {
      subOff(); subOff = null;
    }
  }

  /* --- panneau --- */
  function openPanel() {
    if (!(window.Multiplayer && Multiplayer.isConnected())) {
      openModal({
        title: 'Chat',
        build(body) {
          body.append(el('p', { class: 'game-sub', text:
            'Connecte-toi avec Discord (bouton multi en bas à droite) pour discuter avec tes amis.' }));
        },
      });
      return;
    }

    markRead();
    panelOpen = true;
    let localOff = null;
    openModal({
      title: 'Chat',
      onClose() { panelOpen = false; if (localOff) localOff(); markRead(); },
      build(body, close) {
        body.classList.add('chat-modal-body');
        const list = el('div', { class: 'chat-list' });
        const input = el('input', { class: 'chat-input', placeholder: 'Écris un message…', maxlength: '300' });
        const sendBtn = el('button', { class: 'btn btn-primary', text: '➤', 'aria-label': 'Envoyer' });
        body.append(list, el('div', { class: 'chat-inputrow' }, input, sendBtn));

        const rows = [];
        const meId = Multiplayer.user() && Multiplayer.user().id;
        function add(r, atEnd) {
          const mine = r.user_id === meId;
          const bubble = el('div', { class: 'chat-msg' + (mine ? ' mine' : '') },
            mine ? null : el('span', { class: 'chat-from', text: r.pseudo }),
            el('span', { class: 'chat-text', text: r.body }),
          );
          if (atEnd) list.append(bubble); else list.prepend(bubble);
        }

        Multiplayer.recentMessages().then(data => {
          if (data === null) {
            list.append(el('p', { class: 'game-sub', text: 'Chat indisponible — la table « messages » est-elle créée sur Supabase ?' }));
            return;
          }
          data.slice().reverse().forEach(r => add(r, true));
          list.scrollTop = list.scrollHeight;
        });

        localOff = Multiplayer.subscribeMessages(r => {
          add(r, true);
          list.scrollTop = list.scrollHeight;
        });

        // raccourcis emoji : on tape :skull: / :heart: / :sob: / :joy:
        const EMOJI = { ':skull:': '💀', ':heart:': '❤️', ':sob:': '😭', ':joy:': '😂' };
        const emojify = s => s.replace(/:(skull|heart|sob|joy):/g, m => EMOJI[m] || m);

        function send() {
          const t = emojify(input.value.trim());
          if (!t) return;
          input.value = '';
          Multiplayer.sendMessage(t);
        }
        sendBtn.addEventListener('click', send);
        input.addEventListener('keydown', e => { if (e.key === 'Enter') send(); });
        setTimeout(() => input.focus(), 50);
      },
    });
  }

  return { sync, openPanel, markRead };
})();

window.Chat = Chat;
