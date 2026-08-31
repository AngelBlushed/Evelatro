/* ===========================================================
   La Boutique (bouton "sac" du dock).

   3 onglets :
     - Tenues   : les skins des croupiers (Blackjack / Poker)
     - Boosters : à venir
     - Bonus    : bonus de confort (auto-reset machine à sous…)

   Prix tenues : 5 000 / 15 000 / 35 000 / 50 000. La tenue 0 est offerte.
   Acheter dépense les crédits (le score max n'est pas touché).
   =========================================================== */

const fmtCr = n => Number(n || 0).toLocaleString('fr-FR');

function openShop() {
  let offSkins = null, offBonus = null;

  openModal({
    title: 'Boutique',
    onClose() { if (offSkins) offSkins(); if (offBonus) offBonus(); },
    build(body) {
      body.parentElement.classList.add('modal-shop');

      let tab = 'tenues';

      const purse = el('div', { class: 'shop-purse' },
        el('span', { class: 'shop-purse-label', text: 'Tes crédits' }),
        el('b', { class: 'shop-purse-val' }),
      );

      const tabsBar = el('div', { class: 'shop-tabs' });
      const pane = el('div', { class: 'shop-pane' });

      const TABS = [
        { id: 'tenues', label: 'Tenues' },
        { id: 'boosters', label: 'Boosters' },
        { id: 'bonus', label: 'Bonus' },
      ];
      TABS.forEach(t => {
        tabsBar.append(el('button', {
          class: 'shop-tab' + (t.id === tab ? ' is-on' : ''),
          type: 'button',
          text: t.label,
          onClick: () => { tab = t.id; paintTabs(); renderPane(); },
        }));
      });
      function paintTabs() {
        [...tabsBar.children].forEach((b, i) => b.classList.toggle('is-on', TABS[i].id === tab));
      }

      body.append(purse, tabsBar, pane);

      function paintPurse() {
        purse.querySelector('.shop-purse-val').textContent = fmtCr(Bank.balance()) + ' cr.';
      }

      /* ---------------- onglet TENUES ---------------- */
      function renderTenues() {
        clear(pane);
        let focus = { gender: 'men', idx: Skins.selected('men') };

        const colMen = el('div', { class: 'shop-col' });
        const colWomen = el('div', { class: 'shop-col' });
        const detail = el('div', { class: 'shop-detail' });

        pane.append(el('div', { class: 'shop-cols' },
          el('div', { class: 'shop-side' }, el('div', { class: 'shop-side-h', text: 'Croupier' }), colMen),
          detail,
          el('div', { class: 'shop-side' }, el('div', { class: 'shop-side-h', text: 'Croupière' }), colWomen),
        ));

        const setFocus = (gender, idx) => { focus = { gender, idx }; renderAll(); };

        function renderColumn(container, gender) {
          clear(container);
          Skins.list(gender).forEach((sk) => {
            const isFocus = focus.gender === gender && focus.idx === sk.idx;
            const state = sk.selected ? 'Portée' : sk.owned ? 'Possédée' : fmtCr(sk.price) + ' cr.';
            container.append(el('button', {
              class: 'shop-skin' + (isFocus ? ' is-focus' : '') + (sk.selected ? ' is-worn' : '')
                + (sk.owned ? ' is-owned' : ' is-locked'),
              type: 'button',
              onClick: () => setFocus(gender, sk.idx),
            },
              el('img', { class: 'shop-skin-img', src: sk.src, alt: sk.name, draggable: 'false' }),
              el('div', { class: 'shop-skin-txt' },
                el('span', { class: 'shop-skin-name', text: sk.name }),
                el('span', { class: 'shop-skin-state' + (sk.owned ? '' : ' is-price'), text: state }),
              ),
            ));
          });
        }

        function renderDetail() {
          clear(detail);
          const sk = Skins.info(focus.gender, focus.idx);
          const bal = Bank.balance();

          const preview = el('div', { class: 'shop-preview' },
            el('img', { class: 'shop-preview-img', src: sk.src, alt: sk.name, draggable: 'false' }));
          const name = el('div', { class: 'shop-detail-name', text: sk.name });
          const tag = el('div', { class: 'shop-detail-tag', text: sk.tag });
          const note = el('div', { class: 'shop-detail-note' });

          function flash(msg, bad) {
            note.textContent = msg;
            note.className = 'shop-detail-note is-on' + (bad ? ' is-bad' : '');
            clearTimeout(flash._t);
            flash._t = setTimeout(() => { note.className = 'shop-detail-note'; }, 1600);
          }

          let priceLine, btn;
          if (sk.idx === 0 || sk.owned) {
            priceLine = el('div', { class: 'shop-detail-price ' + (sk.idx === 0 ? 'is-free' : 'is-owned'),
              text: sk.idx === 0 ? 'Tenue offerte' : 'Déjà débloquée' });
            btn = el('button', {
              class: 'btn shop-buy', disabled: sk.selected, text: sk.selected ? 'Portée' : 'Porter',
              onClick: () => { Skins.select(sk.gender, sk.idx); flash('Tenue changée'); },
            });
          } else {
            const canAfford = bal >= sk.price;
            priceLine = el('div', { class: 'shop-detail-price' },
              el('span', { class: 'shop-coin', text: '🪙' }),
              el('b', { text: fmtCr(sk.price) }), el('span', { text: ' cr.' }),
              canAfford ? null : el('span', { class: 'shop-missing', text: '  il te manque ' + fmtCr(sk.price - bal) }),
            );
            btn = el('button', {
              class: 'btn btn-primary shop-buy shop-buy-go', disabled: !canAfford, text: 'BUY',
              onClick: () => {
                const r = Skins.buy(sk.gender, sk.idx);
                if (r.ok) {
                  try { Sound.coins(); } catch (e) {}
                  flash('Tenue débloquée !');
                  preview.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.06)' }, { transform: 'scale(1)' }],
                    { duration: 320, easing: 'ease-out' });
                } else if (r.reason === 'poor') flash('Pas assez de crédits', true);
              },
            });
          }
          detail.append(preview, name, tag, priceLine, btn, note);
        }

        function renderAll() {
          paintPurse();
          renderColumn(colMen, 'men');
          renderColumn(colWomen, 'women');
          renderDetail();
        }
        renderAll();
        if (offSkins) offSkins();
        offSkins = Skins.onChange(() => { if (tab === 'tenues') renderAll(); });
      }

      /* ---------------- onglet BOOSTERS (placeholder) ---------------- */
      function renderBoosters() {
        clear(pane);
        pane.append(el('div', { class: 'shop-soon' },
          el('div', { class: 'shop-soon-emoji', text: '📦' }),
          el('div', { class: 'shop-soon-title', text: 'À venir' }),
          el('p', { class: 'shop-soon-p', text: 'Les boosters arrivent bientôt. Reviens jeter un œil après une prochaine mise à jour.' }),
        ));
      }

      /* ---------------- onglet BONUS ---------------- */
      function renderBonus() {
        clear(pane);
        paintPurse();
        const grid = el('div', { class: 'shop-bonus-grid' });
        pane.append(grid);

        function draw() {
          clear(grid);
          const bal = Bank.balance();
          Bonus.list().forEach(b => {
            const canAfford = bal >= b.price;
            const note = el('div', { class: 'shop-detail-note' });
            const flash = (m, bad) => {
              note.textContent = m; note.className = 'shop-detail-note is-on' + (bad ? ' is-bad' : '');
              clearTimeout(flash._t); flash._t = setTimeout(() => { note.className = 'shop-detail-note'; }, 1600);
            };
            const btn = b.owned
              ? el('div', { class: 'shop-detail-price is-owned', text: '✓ Actif' })
              : el('button', {
                class: 'btn btn-primary shop-buy shop-buy-go', disabled: !canAfford, text: 'BUY',
                onClick: () => {
                  const r = Bonus.buy(b.id);
                  if (r.ok) { try { Sound.coins(); } catch (e) {} flash('Bonus activé !'); }
                  else if (r.reason === 'poor') flash('Pas assez de crédits', true);
                },
              });
            grid.append(el('div', { class: 'shop-bonus-card' + (b.owned ? ' is-owned' : '') },
              el('div', { class: 'shop-bonus-icon', text: b.icon || '✨' }),
              el('div', { class: 'shop-bonus-name', text: b.name }),
              el('p', { class: 'shop-bonus-desc', text: b.desc }),
              el('div', { class: 'shop-bonus-foot' },
                el('div', { class: 'shop-detail-price' },
                  el('span', { class: 'shop-coin', text: '🪙' }), el('b', { text: fmtCr(b.price) }), el('span', { text: ' cr.' }),
                  (b.owned || canAfford) ? null : el('span', { class: 'shop-missing', text: '  il te manque ' + fmtCr(b.price - bal) }),
                ),
                btn,
              ),
              note,
            ));
          });
        }
        draw();
        if (offBonus) offBonus();
        offBonus = Bonus.onChange(() => { if (tab === 'bonus') draw(); });
      }

      function renderPane() {
        paintPurse();
        if (tab === 'tenues') renderTenues();
        else if (tab === 'boosters') renderBoosters();
        else renderBonus();
      }

      renderPane();
    },
  });
}
