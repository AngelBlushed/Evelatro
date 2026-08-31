/* ===========================================================
   Panneau "Quoi de neuf ?" au lancement.
   - Lit UNE ligne dans la table Supabase `news` (id = 1).
   - S'affiche seulement si `tag` a change depuis la derniere fois
     vue par ce joueur (localStorage `evelatro-news-seen`).
   - Contenu 100% pilotable a chaud (Table Editor Supabase ou la
     commande /news du bot) : titre, patch, "bientot", images,
     bouton vers le site.
   =========================================================== */

const News = (() => {
  const SEEN = 'evelatro-news-seen';

  function seen() { try { return localStorage.getItem(SEEN); } catch (e) { return null; } }
  function markSeen(tag) { try { localStorage.setItem(SEEN, tag || ''); } catch (e) {} }

  async function fetchDoc() {
    if (!(window.Multiplayer && Multiplayer.client)) return null;
    try {
      const { data, error } = await Multiplayer.client
        .from('news')
        .select('tag,title,patch,coming,images,cta_label,cta_url')
        .eq('id', 1)
        .maybeSingle();
      if (error) return null;
      return data;
    } catch (e) { return null; }
  }

  async function check() {
    const n = await fetchDoc();
    if (!n || !n.tag) return;            // rien de publie -> pas de panneau
    if (seen() === n.tag) return;        // deja vu cette version -> silence
    show(n);
  }

  function paragraphs(text, cls) {
    const wrap = el('div', { class: 'news-text' });
    String(text).trim().split(/\n\s*\n/).forEach(block => {
      const p = el('p', { class: cls });
      block.split(/\n/).forEach((line, i) => {
        if (i) p.append(el('br'));
        p.append(document.createTextNode(line));
      });
      wrap.append(p);
    });
    return wrap;
  }

  function show(n) {
    openModal({
      title: n.title || 'Quoi de neuf ?',
      onClose() { markSeen(n.tag); },
      build(body, close) {
        body.classList.add('news-body');

        if (n.patch) {
          body.append(el('div', { class: 'news-tag', text: 'v' + n.tag }));
          body.append(el('h3', { class: 'news-h', text: 'Nouveautés' }));
          body.append(paragraphs(n.patch, 'news-p'));
        }

        (n.images || []).forEach(src => {
          if (!src) return;
          const img = el('img', { class: 'news-img', src, alt: '', loading: 'lazy' });
          img.addEventListener('error', () => img.remove());
          body.append(img);
        });

        if (n.coming) {
          body.append(el('h3', { class: 'news-h news-h-soon', text: 'Bientôt' }));
          body.append(paragraphs(n.coming, 'news-p news-p-soon'));
        }

        const actions = el('div', { class: 'news-actions' });
        if (n.cta_url) {
          actions.append(el('button', {
            class: 'btn btn-primary',
            text: n.cta_label || 'Mettre à jour',
            onClick: () => { markSeen(n.tag); window.openExternal(n.cta_url); },
          }));
        }
        actions.append(el('button', {
          class: 'btn btn-mini',
          text: 'Plus tard',
          onClick: () => { markSeen(n.tag); close(); },
        }));
        body.append(actions);
      },
    });
  }

  return { check };
})();

window.News = News;
