/* ===========================================================
   Patch notes + contrôle de version.

   - S'affiche AUTO en arrivant dans le hub (1 fois par session).
   - Bouton "Patch notes" (coin bas-droite du menu d'accueil) pour
     le rouvrir.
   - Compare la version du jeu (APP_VERSION) à la DERNIÈRE version
     connue :
       * pas à jour  -> bouton "Mettre à jour" -> ouvre le site
       * à jour      -> bouton "Vous êtes déjà à jour"

   La dernière version connue vient de :
     window.LATEST_VERSION  (si défini)
     sinon la ligne `news` de Supabase (champ version), si en ligne
     sinon APP_VERSION (ex: bêta isolée -> toujours "à jour")
   =========================================================== */

const Patch = (() => {
  const CURRENT = String(window.APP_VERSION || '1.0');
  const SITE = 'https://evelatro.pages.dev/#telecharger';

  // journal des nouveautés, le plus récent en premier
  const NOTES = [
    {
      v: '1.3',
      items: [
        'Nouveau menu d\'accueil (fond liquide) + hub des mondes.',
        'Refonte visuelle du casino, musique d\'accueil dédiée, succès.',
        'Comptoir : échange de skins entre joueurs.',
        'Mondes Soleil / Garden / Cartes à collectionner : à venir.',
      ],
    },
    {
      v: '1.2',
      items: [
        'Anti-triche serveur, duels corrigés, Rich Presence Discord.',
        'Boutique : bonus auto-reroll des machines.',
        'Caisses CS, cadeaux de skins, classement en direct.',
      ],
    },
  ];

  let latestCache = null;

  function toParts(v) { return String(v).split(/[.\-\s]/).map(n => parseInt(n, 10) || 0); }
  function cmp(a, b) {                       // -1 : a<b · 0 : = · 1 : a>b
    const pa = toParts(a), pb = toParts(b);
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
      const d = (pa[i] || 0) - (pb[i] || 0);
      if (d) return d < 0 ? -1 : 1;
    }
    return 0;
  }

  async function fetchLatest() {
    if (window.LATEST_VERSION) return String(window.LATEST_VERSION);
    try {
      if (window.Multiplayer && Multiplayer.client) {
        const { data } = await Multiplayer.client.from('news').select('version').eq('id', 1).maybeSingle();
        if (data && data.version) return String(data.version);
      }
    } catch (e) { /* hors-ligne : on ne bloque pas */ }
    return CURRENT;
  }
  async function latest() {
    if (latestCache) return latestCache;
    latestCache = await fetchLatest();
    return latestCache;
  }

  function build(body, close, latestV) {
    const behind = cmp(CURRENT, latestV) < 0;

    const list = el('div', { class: 'patch-wrap' });
    NOTES.forEach(n => {
      list.append(
        el('h3', { class: 'patch-v' + (n.v === CURRENT ? ' is-cur' : '') },
          'v' + n.v + (n.label ? ' — ' + n.label : ''),
          n.v === CURRENT ? el('span', { class: 'patch-badge', text: 'ta version' }) : null),
        el('ul', { class: 'patch-list' }, ...n.items.map(t => el('li', { text: t }))),
      );
    });

    const actions = el('div', { class: 'set-actions patch-actions' });
    if (behind) {
      actions.append(el('button', {
        class: 'btn btn-primary patch-update',
        text: '⬇  Mettre à jour (v' + latestV + ')',
        onClick: () => { try { window.openExternal ? openExternal(SITE) : window.open(SITE, '_blank'); } catch (e) {} },
      }));
    } else {
      actions.append(el('button', {
        class: 'btn patch-uptodate',
        text: '✓  Vous êtes déjà à jour',
        onClick: close,
      }));
    }
    actions.append(el('button', { class: 'btn', text: 'Fermer', onClick: close }));

    if (behind) {
      body.append(el('p', { class: 'patch-head-warn',
        text: 'Une nouvelle version est disponible (v' + latestV + '). Tu es en v' + CURRENT + '.' }));
    }
    body.append(list, actions);
  }

  async function open() {
    const latestV = await latest();
    openModal({ title: '📓  Patch notes', build: (body, close) => build(body, close, latestV) });
  }

  let shownThisSession = false;
  async function autoShow() {
    if (shownThisSession) return;
    shownThisSession = true;
    open();
  }

  return { open, autoShow, current: () => CURRENT, latest, cmp };
})();

window.Patch = Patch;
