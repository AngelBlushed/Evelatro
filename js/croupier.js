/* ===========================================================
   Les croupiers + bulle de dialogue au texte qui s'écrit lettre
   par lettre, avec une VOIX synthétisée en rythme (grave pour le
   croupier, aiguë pour la croupière — façon Undertale / Animal
   Crossing).
     createCroupier()                    -> croupier du Blackjack (skins "men")
     createCroupier({ variant:'lady' })   -> croupière du Poker  (skins "women")
   Le sprite affiché suit la tenue choisie dans la Boutique
   (voir js/skins.js). Une petite icône "cintre" à côté du sprite
   ouvre le sélecteur de tenue.
   say() accepte une chaîne OU un tableau (réplique au hasard).
   =========================================================== */

/* -----------------------------------------------------------
   Tirage des répliques SANS RÉPÉTITION.
   Un "sac" par (personnage, tenue, catégorie) : on pioche sans
   remettre ; quand le sac est vide on le re-mélange. Résultat :
   on ne revoit jamais 2× la même phrase tant que les autres ne
   sont pas toutes passées.
   ----------------------------------------------------------- */
const CroupierTalk = (() => {
  const bags = {};   // clé "gender.skin.cat" -> tableau d'index restants

  function fill(pool) {
    const a = pool.map((_, i) => i);
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function pick(gender, skin, cat) {
    const G = (window.CROUPIER_LINES && CROUPIER_LINES[gender]) || {};
    let pool = (G[skin] && G[skin][cat]) || (G[0] && G[0][cat]) || null;
    if (!pool || !pool.length) return '';
    const key = gender + '.' + skin + '.' + cat;
    if (!bags[key] || !bags[key].length) bags[key] = fill(pool);
    const idx = bags[key].pop();
    return pool[idx];
  }

  return { pick };
})();
window.CroupierTalk = CroupierTalk;

/* petite icône cintre pour changer de tenue */
const SKIN_ICON_SVG = `
<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
  <path d="M12 6.5a2 2 0 1 1 1.4 1.9c-.3.1-.4.4-.4.7v.4L21 15v3H3v-3l8-5.5"/>
</svg>`;

function createCroupier(opts = {}) {
  const lady = opts.variant === 'lady';
  const gender = lady ? 'women' : 'men';
  const voiceFreq = opts.voice || (lady ? 430 : 135);

  const img = el('img', {
    class: 'croupier-img',
    alt: lady ? 'Croupière' : 'Croupier',
    draggable: 'false',
  });
  function paintSkin() { img.src = Skins.src(gender, Skins.selected(gender)); }
  paintSkin();

  const sprite = el('div', { class: 'croupier-sprite croupier-' + gender }, img);

  const skinBtn = el('button', {
    class: 'croupier-skin-btn',
    type: 'button',
    title: 'Changer de tenue',
    'aria-label': 'Changer de tenue',
    onClick: () => openSkinPicker(gender),
  });
  skinBtn.innerHTML = SKIN_ICON_SVG;

  const figure = el('div', { class: 'croupier-figure' }, sprite, skinBtn);
  const speech = el('div', { class: 'speech' });
  const wrap = el('div', { class: 'croupier croupier-wrap-' + gender }, figure, speech);

  // le sprite se met à jour si on change de tenue pendant qu'on joue.
  // renvoie false une fois le croupier retiré du DOM -> Skins nous oublie.
  Skins.onChange(() => {
    if (!wrap.isConnected) return false;
    paintSkin();
  });

  let typer = null;
  function say(line) {
    const text = Array.isArray(line) ? line[Math.floor(Math.random() * line.length)] : line;
    clearInterval(typer);
    const full = '* ' + text;
    let i = 0;
    let voiced = 0;
    speech.textContent = '';
    sprite.classList.add('talk');
    typer = setInterval(() => {
      const ch = full[i];
      speech.textContent = full.slice(0, ++i);
      if (ch && ch !== ' ' && ch !== '*' && (voiced++ % 2 === 0)) {
        try { Sound.blip(voiceFreq); } catch (e) { /* pas de son */ }
      }
      if (i >= full.length) { clearInterval(typer); sprite.classList.remove('talk'); }
    }, 30);
  }

  // Réplique thématique selon la tenue portée, sans répétition.
  //   cat = 'launch' | 'play' | 'lose' | 'win'
  function line(cat) {
    const skin = Skins.selected(gender);
    const txt = CroupierTalk.pick(gender, skin, cat);
    if (txt) say(txt);
    return txt;
  }

  return { el: wrap, say, line };
}

/* -----------------------------------------------------------
   Sélecteur de tenue : petite pop-up avec les 5 skins.
   Les tenues non débloquées affichent "Pas débloqué" et ne sont
   pas sélectionnables. Un bouton "Confirmer" applique le choix.
   ----------------------------------------------------------- */
function openSkinPicker(gender) {
  const lady = gender === 'women';

  openModal({
    title: lady ? 'Tenue de la croupière' : 'Tenue du croupier',
    build(body, close) {
      body.parentElement.classList.add('modal-skinpick');

      let choice = Skins.selected(gender);
      const cards = [];
      const grid = el('div', { class: 'skinpick-grid' });

      Skins.list(gender).forEach((sk) => {
        const card = el('button', {
          class: 'skinpick' + (sk.idx === choice ? ' is-sel' : '') + (sk.owned ? '' : ' is-locked'),
          type: 'button',
          disabled: !sk.owned,
          title: sk.owned ? sk.name : 'Pas débloqué',
          onClick: () => {
            if (!sk.owned) return;
            choice = sk.idx;
            cards.forEach((c, i) => c.classList.toggle('is-sel', i === choice));
          },
        },
          el('div', { class: 'skinpick-thumb' },
            el('img', { class: 'skinpick-img', src: sk.src, alt: sk.name, draggable: 'false' }),
            sk.owned ? null : el('span', { class: 'skinpick-lock', text: '🔒' }),
          ),
          el('span', { class: 'skinpick-name', text: sk.name }),
          el('span', {
            class: 'skinpick-tag' + (sk.owned ? '' : ' is-locked'),
            text: sk.owned ? (sk.idx === 0 ? 'Offert' : 'Débloqué') : 'Pas débloqué',
          }),
        );
        cards.push(card);
        grid.append(card);
      });

      const confirm = el('button', {
        class: 'btn btn-primary skinpick-confirm',
        text: 'Confirmer',
        onClick: () => { Skins.select(gender, choice); close(); },
      });

      body.append(
        el('p', { class: 'game-sub', text: 'Choisis une tenue, puis confirme. Les autres s\'achètent à la Boutique.' }),
        grid,
        confirm,
      );
    },
  });
}
