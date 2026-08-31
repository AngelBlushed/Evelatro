/* ===========================================================
   Outils d'interface partagés par tous les jeux.
   =========================================================== */

// Chaque fichier de jeu s'enregistrera dans cet objet.
window.Games = {};

/**
 * Crée un élément HTML sans écrire de HTML "à la main".
 *   el('button', { class: 'btn', onClick: f }, 'Cliquer')
 */
function el(tag, attrs, ...children) {
  const node = document.createElement(tag);

  if (attrs) {
    for (const [key, value] of Object.entries(attrs)) {
      if (value === null || value === undefined) continue;
      if (key === 'class') node.className = value;
      else if (key === 'text') node.textContent = value;
      else if (key.startsWith('on') && typeof value === 'function') {
        node.addEventListener(key.slice(2).toLowerCase(), value);
      } else if (typeof value === 'boolean') {
        if (value) node.setAttribute(key, '');
      } else {
        node.setAttribute(key, value);
      }
    }
  }

  for (const child of children.flat()) {
    if (child === null || child === undefined || child === false) continue;
    node.append(child.nodeType ? child : document.createTextNode(String(child)));
  }
  return node;
}

/** Vide un élément de tout son contenu. */
function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
}

/** En-tête standard d'un jeu : titre + sous-titre. Renvoie la zone de contenu. */
function gameShell(root, title, subtitle) {
  const head = el('header', { class: 'game-head' },
    el('h1', { class: 'game-title', text: title }),
    subtitle ? el('p', { class: 'game-sub', text: subtitle }) : null,
  );
  const bodyEl = el('div', { class: 'game-body' });
  root.append(head, bodyEl);
  return bodyEl;
}

/**
 * Barre de mise réutilisable.
 *   get()  -> lit la mise actuelle
 *   set(v) -> écrit la nouvelle mise
 *   opts.onChange(v) -> appelé après chaque changement (facultatif)
 *
 * L'élément renvoyé porte une méthode .syncAuto() : si le mode
 * "toujours miser le max" (bouton ▲) est actif, elle remet la mise
 * au solde complet. Les jeux l'appellent avant chaque manche.
 */
function betBar(get, set, opts = {}) {
  const steps = opts.steps || [5, 10, 25, 50, 100];
  const bar = el('div', { class: 'betbar' });
  const row1 = el('div', { class: 'betbar-row betbar-row-main' });
  const rowAdd = el('div', { class: 'betbar-row' });
  const row2 = el('div', { class: 'betbar-row token-rack' });
  const value = el('span', { class: 'betbar-value' });
  let autoMax = false;

  function refresh() { value.textContent = get() + ' cr.'; }
  function pulse() {
    value.animate(
      [{ transform: 'scale(1)' }, { transform: 'scale(1.22)' }, { transform: 'scale(1)' }],
      { duration: 220, easing: 'ease-out' });
  }

  // fromAuto = true quand le changement vient du mode auto (on ne le désactive pas).
  // La mise ne peut JAMAIS dépasser le solde : cliquer 10 fois sur un jeton
  // ne fait pas grimper le compteur au-delà de ce qu'on possède.
  function change(v, fromAuto) {
    const cap = Math.max(1, Bank.balance());
    set(Math.max(1, Math.min(Math.round(v), cap)));
    refresh();
    if (!fromAuto && autoMax) { autoMax = false; autoBtn.classList.remove('is-on'); }
    if (opts.onChange) opts.onChange(get());
  }

  const autoBtn = el('button', {
    class: 'chip chip-step chip-auto',
    text: '▲',
    title: 'Toujours miser le maximum à chaque tour',
    onClick: () => {
      autoMax = !autoMax;
      autoBtn.classList.toggle('is-on', autoMax);
      if (autoMax) change(Bank.balance(), true);
      else if (opts.onChange) opts.onChange(get());
    },
  });

  // Rangée 1 : Mise + les contrôles principaux (Max et ▲ restent ici, pas à la ligne).
  row1.append(el('span', { class: 'betbar-label', text: 'Mise' }), value);
  row1.append(el('button', { class: 'chip chip-step', text: '−1', onClick: () => change(get() - 1) }));
  row1.append(el('button', { class: 'chip chip-step', text: '+1', onClick: () => change(get() + 1) }));
  row1.append(el('button', { class: 'chip chip-step', text: 'Max', onClick: () => change(Bank.balance()) }));
  row1.append(autoBtn);

  // Rangée "+" : ajouts rapides cumulables.
  steps.forEach(s => rowAdd.append(el('button', { class: 'chip', text: '+' + s, onClick: () => change(get() + s) })));

  // Rangée 2 : les jetons de casino. Un clic AJOUTE la valeur à la mise.
  const TOKENS = [
    { v: 1, bg: '#e9edf0', fg: '#12191d' },
    { v: 5, bg: '#d84a4a', fg: '#ffffff' },
    { v: 25, bg: '#2fa36b', fg: '#04140f' },
    { v: 100, bg: '#22303a', fg: '#ffffff' },
    { v: 500, bg: '#7d5bd6', fg: '#ffffff' },
    { v: 1000, label: '1k', bg: '#e2b458', fg: '#04140f' },
    { v: 5000, label: '5k', bg: '#e0742f', fg: '#ffffff' },
    { v: 10000, label: '10k', bg: '#1c2129', fg: '#f5c451' },
  ];
  TOKENS.forEach(tok => {
    const token = el('button', { class: 'token', text: tok.label || tok.v, title: `Ajouter ${tok.v} à la mise` });
    token.style.background = tok.bg;
    token.style.color = tok.fg;
    token.addEventListener('click', () => {
      const before = get();
      change(before + tok.v);
      if (get() !== before) { pulse(); flyToken(token, value, tok.bg); }
      Sound.chip();
      token.animate(
        [{ transform: 'translateY(0)' }, { transform: 'translateY(-6px)' }, { transform: 'translateY(0)' }],
        { duration: 180, easing: 'ease-out' });
    });
    row2.append(token);
  });
  row2.append(el('button', {
    class: 'token token-clear', text: '↺', title: 'Remettre la mise à 1',
    onClick: () => { change(1); pulse(); },
  }));

  bar.append(row1, rowAdd, row2);
  // Appelé par les jeux entre deux manches : applique le mode auto
  // ou, à défaut, replafonne la mise au solde disponible.
  bar.syncAuto = () => {
    if (autoMax) change(Bank.balance(), true);
    else if (get() > Bank.balance()) change(Bank.balance(), true);
  };

  refresh();
  return bar;
}

/** Un petit jeton qui vole du bouton cliqué vers l'affichage de la mise. */
function flyToken(fromEl, toEl, color) {
  const f = fromEl.getBoundingClientRect();
  const t = toEl.getBoundingClientRect();
  const fly = el('span', { class: 'chip-fly' });
  fly.style.background = color;
  fly.style.left = (f.left + f.width / 2 - 9) + 'px';
  fly.style.top = (f.top + f.height / 2 - 9) + 'px';
  document.body.append(fly);
  const dx = (t.left + t.width / 2) - (f.left + f.width / 2);
  const dy = (t.top + t.height / 2) - (f.top + f.height / 2);
  const anim = fly.animate([
    { transform: 'translate(0,0) scale(1)', opacity: 1 },
    { transform: `translate(${dx}px, ${dy}px) scale(0.35)`, opacity: 0 },
  ], { duration: 420, easing: 'cubic-bezier(.4,0,.2,1)' });
  anim.onfinish = () => fly.remove();
}

/* Fenêtre modale simple, centrée, fond assombri.
   openModal({ title, build(bodyEl) }) -> renvoie une fonction close(). */
function openModal(opts) {
  const body = el('div', { class: 'modal-body' });
  const closeBtn = el('button', { class: 'modal-x', text: '✕', 'aria-label': 'Fermer' });
  const modal = el('div', { class: 'modal' },
    el('div', { class: 'modal-head' },
      el('span', { class: 'modal-title', text: opts.title || '' }),
      closeBtn,
    ),
    body,
  );
  const backdrop = el('div', { class: 'modal-backdrop' }, modal);

  function close() {
    document.removeEventListener('keydown', onKey);
    backdrop.remove();
    if (opts.onClose) opts.onClose();
  }
  function onKey(e) { if (e.key === 'Escape') close(); }

  closeBtn.addEventListener('click', close);
  backdrop.addEventListener('click', e => { if (e.target === backdrop) close(); });
  document.addEventListener('keydown', onKey);

  if (opts.build) opts.build(body, close);
  document.body.append(backdrop);
  return close;
}

/* Curseur (slider) étiqueté 0–100 %. onInput reçoit une valeur 0–1. */
function volumeSlider(label, get, onInput) {
  const val = el('span', { class: 'vol-val' });
  const range = el('input', {
    type: 'range', min: '0', max: '100', value: String(Math.round(get() * 100)),
    class: 'vol-range',
  });
  const paint = () => { val.textContent = range.value + ' %'; };
  range.addEventListener('input', () => { onInput(range.value / 100); paint(); });
  paint();
  return el('label', { class: 'vol-row' },
    el('span', { class: 'vol-label', text: label }),
    range,
    val,
  );
}

/* Toasts (bas-droite). Swipe vers le bas pour fermer. */
const Toast = (() => {
  let stack = null;
  function container() {
    if (!stack) { stack = el('div', { class: 'toast-stack' }); document.body.append(stack); }
    return stack;
  }

  function dismiss(t) {
    if (t._gone) return;
    t._gone = true;
    const out = t.animate(
      [{ transform: 'translateX(0)', opacity: 1 }, { transform: 'translateX(120%)', opacity: 0 }],
      { duration: 320, easing: 'cubic-bezier(.5,0,.75,0)', fill: 'both' });
    out.onfinish = () => t.remove();
  }

  function makeSwipe(t) {
    let sy = 0, dy = 0, drag = false;
    t.addEventListener('pointerdown', e => {
      drag = true; sy = e.clientY; dy = 0;
      t.style.transition = 'none';
      t.setPointerCapture && t.setPointerCapture(e.pointerId);
    });
    t.addEventListener('pointermove', e => {
      if (!drag) return;
      dy = Math.max(0, e.clientY - sy);
      t.style.transform = 'translateY(' + dy + 'px)';
      t.style.opacity = String(Math.max(0, 1 - dy / 120));
    });
    const end = () => {
      if (!drag) return;
      drag = false;
      if (dy > 40) {
        const o = t.animate(
          [{ transform: 'translateY(' + dy + 'px)', opacity: t.style.opacity || 1 },
           { transform: 'translateY(120px)', opacity: 0 }], { duration: 200, fill: 'both' });
        o.onfinish = () => { t._gone = true; t.remove(); };
      } else {
        t.style.transition = 'transform .2s, opacity .2s';
        t.style.transform = 'translateY(0)';
        t.style.opacity = '1';
      }
    };
    t.addEventListener('pointerup', end);
    t.addEventListener('pointercancel', end);
  }

  function push(node, { hold = 3600, onClick } = {}) {
    node.classList.add('toast');
    if (onClick) {
      node.classList.add('toast-click');
      node.addEventListener('click', () => { onClick(); dismiss(node); });
    }
    container().append(node);
    node.animate(
      [{ transform: 'translateX(120%)', opacity: 0 }, { transform: 'translateX(0)', opacity: 1 }],
      { duration: 420, easing: 'cubic-bezier(.2,.9,.25,1)', fill: 'both' });
    makeSwipe(node);
    if (hold > 0) setTimeout(() => dismiss(node), hold);
    return node;
  }

  function friend(o) {
    const win = (o.gain || 0) > 0;
    const flat = !o.gain;
    push(el('div', {},
      el('span', { class: 'toast-dot ' + (flat ? 'flat' : win ? 'win' : 'lose') }),
      el('div', { class: 'toast-body' },
        el('div', { class: 'toast-line' },
          el('b', { text: o.who || 'Un ami' }),
          o.game ? el('span', { class: 'toast-game', text: o.game }) : null,
        ),
        (o.gain != null) ? el('div', {
          class: 'toast-gain ' + (win ? 'win' : flat ? 'flat' : 'lose'),
          text: (win ? '+' : '') + o.gain + ' jetons',
        }) : null,
      ),
    ));
  }

  function challenge(who, pct) {
    push(el('div', { class: 'toast-vs' },
      el('span', { class: 'toast-dot flat' }),
      el('div', { class: 'toast-body' },
        el('div', { class: 'toast-line' }, el('b', { text: (who || 'Un joueur') + ' te défie !' })),
        el('div', { class: 'toast-game', text: 'Duel ' + pct + '% · touche pour répondre' }),
      ),
    ), { hold: 20000, onClick: () => { try { EveLatro.openMulti('vs'); } catch (e) {} } });
  }

  return { friend, challenge };
})();
window.Toast = Toast;
