# CHANTIER EveLatro! — suivi des travaux

> Fichier de reprise en cas de crash PC. Mis à jour au fur et à mesure.
> Statuts : ⬜ à faire · 🟡 en cours · ✅ fait · ⏸️ bloqué (attente Eve)
> Dernière mise à jour : 2026-08-29 (soir) — round 1 : bugs + embed site

### Résumé rapide
| # | Sujet | Statut |
|---|-------|--------|
| 0 | Tracker anti-crash | ✅ |
| 1 | Embed Discord + screenshot site | ✅ **confirmé par Eve** |
| 2 | Refonte mode VS/duel | 🟡 codé (2 vagues de fixes) — ⏸️ Eve : re-run SQL + tester à 2 |
| 3 | Écran Caisses CS:GO | ✅ **FAIT** (15 caisses, anim, vendre/garder, inventaire) |
| 4 | Bug OAuth navigateur | ✅ **confirmé par Eve** |
| 4b | Duel PC vs Android bloqué à tort | ✅ **FAIT** (compare le n° de version, pas la plateforme) |
| 5 | Propager à web + APK | ✅ **FAIT** (www/ + site/play/ + APK rebuild) — ⏸️ Eve redéploie Netlify + installe l'APK |
| 6 | Solde synchro temps réel | ✅ **CODÉ** + filet 5 s + fix bot (profiles) — ⏸️ Eve teste + re-run SQL |
| 7 | Jeux jouables depuis le bot | ✅ **FAIT v2** (mise BJ, anim machines, roulette n° boutons, 15 caisses, feed) |
| 8 | Embed croupier à côté du jeu (Discord) | ✅ **FAIT** (BJ + poker seulement, skin-aware, vraies répliques) |
| 8.1 | Skins inter-version / depuis Discord | ✅ **FAIT** (`user_skins` inter-version + `/vestiaire` acheter/porter depuis Discord) |
| 9.5 | Croupier en image dans l'embed bot | ✅ **FAIT** (image de la tenue portée en thumbnail de l'embed croupier, BJ + poker) |
| 9 | Répliques croupiers (vulgaires) | ✅ **FAIT** (500 répliques, sans répétition) |
| 9.5 | Embed paroles en direct | ⬜ (lié musique, absente sur Discord — follow-up) |
| 10 / 10.5 | Annonce site + news bot | ✅ **FAIT** (`/annonce`, `/news-post` + auto) — ⏸️ Eve redéploie |
| 11 | Bug bot — flux en direct | 🟡 `/feed` refait — ⏸️ Eve redéploie + teste |
| 12 | Bug musique | ✅ **confirmé par Eve** ("miraculeux") |

## Contexte / changements de règles
- ⚠️ Le workflow « PC uniquement » est **annulé** : les points #1 et #5 demandent
  de re-synchroniser la version **web (Netlify)** et l'**APK Android**.
- Croupiers = 10 images `.webp` fournies par Eve (`croupiers/`), skins déjà livrés.
- Version DEV : `npm run build:dev` → `dev/EveLatro-DEV.exe` (crédits ∞, hors classement).

---

## 1. Embed Discord attirant pour le lien du site  ✅ code · ⏸️ Eve
- ✅ `site/og.png` généré (1200×630, screenshot du hero avec la croupière + titre + boutons).
- ✅ `site/index.html` : ajout `og:image` (+ width/height/alt/secure_url), `og:site_name`,
  `og:locale`, `twitter:card=summary_large_image`, `twitter:image/title/description`.
- ✅ `og:image` en chemin relatif `og.png` (Discord le résout depuis l'URL de la page).
- ⏸️ **Eve** : redéployer le dossier `site/` sur Netlify. Puis tester le lien dans Discord.
  Si l'image ne s'affiche pas → remplacer `og.png` par l'URL complète
  `https://<ton-site>.netlify.app/og.png` dans les 3 balises meta (commentaire dans le fichier).
  Pour forcer Discord à re-scanner : coller le lien dans un salon, ou attendre ~qq h.

## 2. Refonte du mode VS / duel en jeu  🟡 CODÉ (à tester à 2)

**Fait :**
- SQL : `duels` gagne `game`, `rounds_target`, `round_no`, `round_started_at`,
  `chal_score`, `opp_score`, `chal_dq`, `opp_dq` (via `alter ... add if not exists`).
  **Eve doit relancer `supabase-setup.sql`.**
- `js/duel.js` : réécrit. Mécanique best-of-N :
  - challenger choisit adversaire + **jeu** + **manches (5/10/15)** + **mise %**
  - chaque manche : les 2 jouent 1 action du jeu ; meilleur gain net = manche gagnée
  - **20 s / manche** ; dépassement = DQ = défaite (chrono `round_started_at`)
  - le challenger arbitre (résout la manche) ; l'adversaire prend le relais si
    le challenger a l'air planté (6 s)
  - fin quand `round_no > target` OU majorité acquise ; + de manches = gagnant ;
    égalité = nul (personne ne paie). Règlement : perdant paie sa mise.
  - `Duel.forfeit()` = abandon = défaite.
- `js/fight.js` (NOUVEAU) : habillage "EveFight!" plein écran — chrono centre,
  carte adversaire (photo Discord + pseudo + manches gagnées) à gauche, manches
  restantes à droite, néon rouge 4 coins, flash de résultat, écran de fin sobre.
- `js/app.js` : `fight-mode` — verrouille sur le jeu du duel, cache menu/dock,
  ferme le panneau multi ; `select()` bloqué pendant le combat.
- `js/friends.js` : formulaire de défi = 2 nouveaux sélecteurs (jeu, manches) ;
  vues pending/incoming/en-cours/fin adaptées ; bouton Abandonner.
- `js/multiplayer.js` : `challenge(opp,name,pct,game,rounds)` ; l'avatar Discord
  est diffusé dans la présence (`onlineInfo()` renvoie `avatar`).
- `css/style.css` : tout le `.fight-*` + `.seg` (sélecteurs segmentés).

**À tester par Eve (impossible en solo) :** un vrai duel avec un 2e compte Discord.

### Bugs signalés par Eve (1er test) + corrections (2026-08-30)
| Bug Eve | Cause probable | Correction |
|---|---|---|
| chrono ne marche pas | dépendait de `round_started_at` (réseau) | **horloge locale** par client (`localRoundStart`) |
| perdre ne fait pas avancer la manche | score pas soumis (garde-temps trop stricte + pas d'écriture locale) | garde-temps retirée + **`apply()`** applique chaque écriture localement tout de suite |
| seules les victoires comptent | idem (les pertes = mains + lentes → soumises après 20 s → rejetées) | idem |
| lance le défi sans demander | (probablement duel zombie) | **modale de confirmation** avant d'envoyer le défi |
| bloquée dans le défi même après relance | `currentDuel()` renvoyait un vieux duel `accepted` | **`isStale()`** : un duel `accepted` inactif > 4 min est auto-annulé ; + `Duel.abandon()` nettoie en local quoi qu'il arrive |
| pas vu l'écran final | bloquée avant | idem + bouton **« Quitter »** toujours visible dans l'overlay |
| pas vu le menu jeu/manches | (duel zombie → `challengeForm` jamais affiché) | idem |

+ secours : relecture du duel toutes les 3 s (marche même si le temps réel de
Supabase ne délivre pas).

### 2e vague de retours Eve + corrections (2026-08-30)
| Retour | Correction |
|---|---|
| 1. les défaites ne font pas avancer la manche | cause = on tombait à 0 cr → **crédits VIRTUELS pendant le duel** (`Bank.inFight()`) : mise jamais retirée, jamais à sec, rien enregistré. Score de manche = **ratio gain/mise** (indépendant du montant misé) |
| 2. on peut spam sans attendre l'autre | **verrou plein écran** (`.fight-lock`) dès qu'on a joué sa manche → aucun clic possible jusqu'à la manche suivante |
| 3. VS machines : choisir la machine | sélecteur **Classique / Néon / Deluxe** dans le formulaire (visible si "Machines") ; `slots.js` impose la machine + cache les onglets en combat. Col SQL `slot_machine` |
| 4. plus de mise, jouer à 0 cr | = crédits virtuels (cf. 1) |
| 5. roulette : mises à chances égales | en combat la roulette n'affiche que **Rouge/Noir/Pair/Impair/1–18/19–36** (toutes 1:1), pas de numéro ni douzaine ; Rouge par défaut |
| 5.1 gains roulette pas comptés | = mises virtuelles (plus de mise partielle quand on est bas) + `Duel.markActing()` (appelé par `Bank.stake`) repousse la DQ le temps que la bille s'arrête |
| 6. manches : 1 / 5 / 10 (au lieu de 15) | fait, défaut 5 ; un duel en 1 manche = mort subite |

**Eve doit relancer `supabase-setup.sql`** (nouvelle colonne `slot_machine`).

### (spec d'origine)
Avant de lancer le défi, à côté du bouton « % de mise » :
- **Bouton 2** : choix du jeu (Blackjack / Poker / Machines / Roulette).
- **Bouton 3** : nombre de manches — jauge 3 crans : **5 / 10 / 15**.
Pendant le duel :
- Impossible de **changer de jeu** ni de **quitter** le mode défi.
- Léger **néon rouge aux 4 coins** de l'écran.
- **20 s par manche** ; dépassement = disqualifié = défaite.
- **Chrono en haut de l'écran** (pour ne pas être surpris).
- Affichage **épuré** : pas de menu haut/bas, pas de sélecteur de jeu en haut,
  juste le timer + le jeu.
- Le néon du haut « EveLatro! » devient **« EveFight! »**.
- À gauche : **photo de profil Discord + pseudo** de l'adversaire + **nb de manches
  gagnées en direct**.
- En haut à droite : **nb de manches restantes**.
Fin de duel :
- **Menu sobre** : qui a gagné, combien de manches chacun (gagnant / perdant).
- Règle : **celui qui a perdu le plus de manches perd**.
- Fichiers : `js/duel.js`, `js/friends.js` (`renderVsPanel`), `js/app.js`, `css/style.css`.
- SQL : `duels` a besoin de `game`, `rounds_target` (+ avatars/pseudo déjà en présence).

## 3. Écran « Caisses » (style CS:GO) — remplace l'arbre du dock  ⬜
- Le 2e bouton du dock (arbre 🌳) → **écran ouvert** avec une **UI complètement
  différente** du reste.
- But : **ouvrir des caisses**. Skins existants (réutiliser des noms CS:GO connus).
- Au drop : **revendre au prix affiché** OU **garder**.
- **≥ 15 caisses**, **≥ 10 skins par caisse**.
- Classement de rareté + prix : **inventé maison**.
- **Crédits connectés en direct** à tout le reste du jeu (même banque).
- Fichiers : nouveau `js/cases.js` + `js/skins-cs.js` (catalogue) + CSS dédié +
  bouton dock dans `index.html` + `app.js`.

## 4. BUG — Connexion Discord navigateur  ⏸️ Eve (cause TROUVÉE)
- Image d'Eve : après "Autoriser" → redirigée vers **`localhost:3000/?code=...`** →
  "ce site est inaccessible". Donc Supabase renvoie vers `localhost:3000` au lieu
  de `https://evelatro.netlify.app/`.
- **Cause** : Supabase renvoie vers son **"Site URL"** quand le `redirectTo` n'est
  pas dans la liste blanche. Le Site URL d'Eve = `http://localhost:3000`.
- **Eve** (Supabase > Authentication > URL Configuration) :
  1. **Site URL** → `https://evelatro.netlify.app`
  2. **Redirect URLs** → ajouter `https://evelatro.netlify.app/**`
- Aucun changement de code nécessaire. `pageUrl()` renvoie déjà la bonne URL.

### (ancien détail)
## 4bis. code — messages d'erreur OAuth  ✅
- ✅ `js/mp-auth.js` : `completeBrowserRedirect` renvoie maintenant `{ok,done,error}`,
  lit le retour en `?query` OU `#hash`, gère `access_token/refresh_token`, et
  **traduit** les erreurs OAuth fréquentes en message actionnable (`humanAuthError`).
- ✅ `js/multiplayer.js` : garde `authError`, expose `lastAuthError()`.
- ✅ `js/friends.js` : affiche le message d'erreur sous le bouton Discord au retour.
- ⏸️ **Eve** — la cause est côté config, l'erreur exacte s'affichera maintenant :
  1. Supabase > Authentication > URL Configuration > **Redirect URLs** : ajouter
     `https://<ton-site>.netlify.app/**` (le `/**` couvre `/play/`).
  2. Supabase > Authentication > Providers > **Discord** : le « Client Secret » est
     peut-être périmé (Eve l'avait régénéré) → le recopier depuis le portail Discord.
  3. Portail Discord > OAuth2 > Redirects : doit contenir
     `https://ayptnkxkzvntijgzcatx.supabase.co/auth/v1/callback`.

## 5. Propager tous les changements récents à web + APK  ⬜
- `node scripts/sync-www.js` puis rebuild APK + copier dans `site/play/`.
- Inclut : skins croupiers, caisses, VS, fixes… (donc à faire **en dernier**).

## 6. Progression synchronisée en TEMPS RÉEL entre PC / APK / Web  ⬜
- Si je gagne 10 jetons sur le tel → **-10 sur le .exe en direct** (même solde).
- Le solde vit dans Supabase (table `wallet` : user_id, credits, updated_at) +
  Realtime. `Bank` lit/écrit le remote quand connecté, fusion au login.
- Attention : conflits, offline, le mode DEV ne doit jamais écrire.
- Fichiers : `js/bank.js`, `js/multiplayer.js`, SQL.

## 7. Prototype : jouer depuis le bot Discord (embeds interactifs)  ⬜
- Blackjack, 3 machines à sous, Poker, Roulette, **et les caisses CS:GO**.
- **Copier la physique du jeu** (mêmes règles/paytables), pas un truc différent.
- Fichiers : `bot/` (nouveau module `bot/games/`), boutons/`ComponentsV2`.

## 8. 2e embed « croupier » à côté de chaque embed de jeu  ⬜
- Forme différente, avec le croupier (Blackjack) ou la croupière (Poker).
### 8.1 Skins dispo depuis les embeds Discord  ⬜
- Les skins (actuels + futurs) achetables/portables **depuis Discord** →
  progression centralisée. Si verrouillé en jeu, verrouillé sur Discord.
- Dépend de #6 (solde partagé) + table `skins` distante.
### 9.5 3e embed « lyrics en temps réel »  ⬜
- À côté de la tête du croupier (2e embed), un **3e embed** avec les **paroles**
  de la musique en direct.

## 9. Répliques des croupiers — énormément, jamais de répétition  ⬜
Pour **chaque skin** (10) **+ la base**, donc par personnage/skin :
- **10** phrases de lancement
- **20** phrases pendant le jeu
- **10** phrases quand le joueur perd
- **10** phrases quand le joueur gagne
- Ton : **insultant, très vulgaire**, ou **jouissif quand tu perds**.
- **Jamais 2× la même** phrase dans une session (sac mélangé sans remise).
- Fichiers : `js/croupier-lines.js` (gros), `js/croupier.js` (tirage sans remise).

## 10. Embed d'annonce dans le salon Discord EveLatro  ⬜
- Embed avec le lien du site : « le jeu est dispo, ça me ferait plaisir que vous
  l'installiez ». Réaction **cœur blanc 🤍** (sans effet secondaire).
### 10.5 Le bot affiche les news sur le serveur  ⬜
- Commande / auto-post des news (table `news`) dans un salon.

## 11. BUG — `/auto-leaderboard`  🟡 (avance bien)
- ✅ Eve a mis la clé service_role → logs : `✔ bot_config : lecture + écriture OK`
  et `auto-leaderboard -> salon ... prochain envoi dans 52 min`. **Ça persiste.**
  → il faut juste ATTENDRE l'heure pile pour voir le 1er message auto.
- ⚠️ Logs : `auto-directe : salon introuvable` → le salon enregistré pour
  `/auto-directe` n'existe plus / bot sans accès. Eve : refaire `/auto-directe on`
  vers un salon valide.
- ⚠️ Logs Railway : `Stopping Container` + `SIGTERM` ~4 s après le démarrage.
  Soit c'est l'ancien déploiement remplacé (normal), soit Railway tue le conteneur
  car rien n'écoute sur un port. **Ajout d'un mini serveur HTTP** (`bot/index.js`,
  `process.env.PORT`) pour satisfaire Railway. Eve : redéployer, vérifier que le
  service reste "Active" (vert) et que les logs ne bouclent pas.

### (ancien détail)
## 11bis. code durci  ✅
- ✅ `bot/index.js` : `cfgGet/cfgSet` remontent les erreurs (avant : silencieux) ;
  `/auto-leaderboard on` fait un **envoi immédiat de test** + répond avec le vrai
  statut ; `startHourly` relit la config à chaque tick ; **auto-test bot_config**
  au démarrage (log clair si inaccessible).
- ⏸️ **Eve** — cause quasi certaine : la clé `SUPABASE_KEY` du bot n'est pas la
  **service_role** (table `bot_config` en RLS sans policy → seul service_role écrit).
  1. `bot/.env` (+ variables Railway) : `SUPABASE_KEY` = clé **service_role**
     (Supabase > Project Settings > API > `service_role` `secret`).
  2. Lancer `supabase-setup.sql` (crée `bot_config`).
  3. Redéployer le bot sur Railway. Au boot, chercher dans les logs :
     `✔ bot_config : lecture + écriture OK` ou `✖ bot_config INACCESSIBLE`.

## 12. BUG — La musique  🟡 (3e essai — moteur AudioBuffer)
- 2e essai KO aussi : Eve voyait "▶" (pause) + barre qui bouge + pas de changement.
  Causes : (a) `progress()` bougeait même en pause ; (b) `repeat` pouvait valoir
  `'off'` → à la fin de boucle ça se mettait en pause tout seul.
- **3e version — chaque morceau rendu 1× dans un AudioBuffer, boucle NATIVE**
  (`source.loop = true`, le navigateur gère). Un seul `setTimeout` pour passer au
  morceau suivant en mode "tout lire". `progress()` gelé quand en pause.
  `repeat` réduit à 2 états : 🔁 liste / 🔂 ce morceau (plus de "off" piège).
- `settings.js` : bouton répéter → bascule liste/morceau seulement.
- Testé headless (rendu offline OK dans Electron) : autostart, progress, pause/gel,
  resume, next, toggle repeat — tout OK. **Audio réel à confirmer par Eve.**

### (ancien) 2e essai

- 1er correctif insuffisant (Eve : ne démarre plus du tout + ne continue pas).
- **2e version — moteur réécrit en simple** (`js/music.js`) :
  - plus de `scheduler()` / `advanceAt` / `setInterval` 120 ms (source des bugs).
  - `renderLoop()` joue une boucle, arme un `setTimeout(onLoopEnd, (loopLen-0.2)s)`.
  - `onLoopEnd` : rejoue le même morceau ('one') ou passe au suivant ('all').
  - `pause` coupe le son net (`killVoices` + `ctx.suspend`), `resume` relance la boucle.
  - autostart : écoute `pointerdown/keydown/click/touchstart` en `capture:true`,
    et **ne respecte plus** un `{playing:false}` bloqué en localStorage (démarre toujours).
- Testé headless : autostart OK, enchaînement 3 morceaux OK, pause/resume OK, progress OK.
  Reste à confirmer par Eve dans le vrai .exe.

---

## 🌙 MISSION NUIT 2026-08-30 (Eve dort, autonomie totale)
Ordre demandé : **1. Caisses CS:GO → 2. Lien direct (sync solde) → 3. Dialogues → 4. Bot Discord**
Partir du principe que le mode VS marche (pas testé, amie partie dormir).
Checkpoint ce fichier à chaque sous-étape. Compte-rendu complet au réveil.
- [x] #3 Caisses CS:GO — FAIT
- [x] #6 Lien direct / solde synchro — CODÉ (à tester à 2 appareils par Eve)
- [x] #9 Dialogues croupiers — FAIT (500 répliques, 10 sets, sans répétition)
- [x] #7 Bot jeux jouables + #8 embed croupier + #10 annonce + #10.5 news — FAIT

### #7/#8/#10/#10.5 Bot Discord (FAIT 2026-08-30 nuit)
- `bot/games.js` (NOUVEAU) : Blackjack, 3 Machines, Roulette, Vidéo Poker, Caisses
  jouables via **embeds + boutons**. Mêmes règles/paytables que le jeu.
  `makeWallet(db)` = solde lu/écrit dans la table **`wallet`** → **même solde que
  l'app** (progression centralisée, base de #8.1).
- `#8` : chaque jeu renvoie 2 embeds → l'embed du jeu **+ un embed "croupier"**
  avec une réplique (`TALK`, version courte des dialogues).
- `bot/index.js` : `/jouer` (menu), `/solde`, `/annonce salon` (#10 : embed du site
  + réaction 🤍 sans effet), `/news-post salon` (#10.5 : poste la news + la
  **re-poste auto** quand Eve l'édite via `/news`, sub realtime sur `news`).
- Testé (mock) : les 5 jeux tournent, solde suivi, caisses vendre OK.
- **RESTE (follow-up, pas cette nuit)** : #9.5 embed paroles en direct (lié à la
  musique, absente sur Discord) · #8.1 acheter/porter les skins depuis Discord.
- **Eve : redéployer le bot Railway** (nouvelles commandes + games.js).

### #9 Dialogues (FAIT 2026-08-30 nuit)
- `js/croupier-lines.js` : `CROUPIER_LINES[men|women][0..4]` = { launch:10, play:20,
  lose:10, win:10 } → **500 répliques**, toutes originales, ton vulgaire/méprisant/
  jouissif-quand-tu-perds. Thème par tenue (chef, businessman, magicien, plage,
  cabaret, far west, victorien, cirque…).
- `js/croupier.js` : `CroupierTalk.pick(gender,skin,cat)` = **sac mélangé sans
  remise** → jamais 2× la même tant que le sac n'est pas vidé. `croupier.line(cat)`.
- `blackjack.js` / `poker.js` : `croupier.say(BJ_LINES.*)` → `croupier.line('launch'
  |'play'|'win'|'lose')`. (BJ_LINES/PK_LINES gardés en secours, non utilisés.)
- Testé : 10 sets × 10/20/10/10, 0 doublon sur un cycle complet.

### #6 Solde partagé (CODÉ 2026-08-30 nuit)
- SQL : table `wallet` (user_id, credits, updated_at) + RLS + realtime.
- `multiplayer.js` : `walletGet()` / `walletPush(c)` / `subscribeWallet(fn)`.
- `bank.js` : `Bank.setCredits(n)` (force le solde, sans re-push).
- `js/wallet-sync.js` (NOUVEAU) : à la connexion adopte le solde cloud (ou pousse
  le local), pousse chaque changement local après 0,9 s, applique les changements
  reçus d'un autre appareil. **Jamais** en mode DEV (`window.__EVELATRO_DEV__`)
  ni pendant un duel (`Bank.inFight()`).
- `index.html` : script ajouté. `dev-mode.js` : pose le flag DEV.
- Testé : chargement OK, `setCredits`/`onChange` OK. **Synchro réelle = à tester
  par Eve sur 2 appareils connectés au même Discord.**

### #3 Caisses — détail (FAIT 2026-08-30 nuit)
- `js/cs-catalog.js` : 15 caisses, 180 skins, mon barème de rareté
  (bleu 79.9% / violet 16% / rose 3.2% / rouge 0.64% / or 0.26%), 5 usures
  (FN→BS, ×1 à ×0.28), StatTrak 10% (×1.6). `CS.roll()` / `CS.reel()`.
- `js/cases.js` : `Cases` (inventaire localStorage `evelatro-cs-inv`, open/keep/
  sell/sellAll) + `openCases()` : grille des 15 caisses, animation de bobine qui
  ralentit, révélation, **Vendre au prix / Garder**, onglet Inventaire.
- Dock : l'arbre 🌳 devient une **caisse** (`#dock-cases`), câblé dans app.js.
- Crédits = les mêmes que partout (achat débite `Bank.spend`, vente `Bank.payout`).
- `css/style.css` : `.modal-cases`, `.cs-*`. `index.html` : 2 scripts ajoutés.
- Testé : ouverture/anim/reveal/garder/vendre/inventaire OK, odds vérifiées.

## v1.2 — gros lot demandé le 2026-08-31 (à terme = version 1.2)
Ordre demandé : le plus rapide d'abord.

| # | Sujet | Statut |
|---|-------|--------|
| Util 0 | Rich Presence Discord quand on joue (CR, classement, pseudo IG) | ✅ `rpc.js` (IPC pur, 0 dépendance) + `js/presence.js`. PC only. Client ID 1542964139637477536. Optionnel : uploader un art asset "evelatro" dans le Dev Portal pour l'icône. |
| Séc 1 | Menu rouge anti-triche au 1er lancement, AVANT patch notes | ✅ `js/fairplay.js` |
| Séc 2 | Anti-cheat : solde SERVEUR autoritaire + journal + flag + reset auto + fiche | ✅ **v1 CODÉ** (`supabase-anticheat.sql`, `js/wallet-ledger.js`, `js/anticheat.js`) ⏸️ Eve : lancer le SQL + tester |
| Séc 2.1 | Scan périodique du ratio gains/mises (10 min, bot) → flag 'à examiner' | ✅ `anticheat_scan()` + job bot |
| Séc 2.2 | Connexion internet + Discord obligatoires, pas de déconnexion | ✅ `js/net-guard.js` + bouton "Se déconnecter" retiré |
| Séc 3 | Reset progression de discord_id 1497389927166644274 (serena_the_tiny_deer) + son score leaderboard | 🟡 outil livré : `/purge-progression` (Eve lance la commande) |
| Site 1 | Boutons DL : ligne navigateur (badge DÉMO dedans) + ligne exe/apk + iOS/Linux "bientôt" | ✅ `site/index.html` |
| Site 2 | Texte aide → onglet "FAQ téléchargement + aide" + halo doré "paradis" autour du bloc | ✅ `site/index.html` (`.faq`, `.panel-heaven`) |
| Autre 1 | Emoji chat par commande : `:skull:` `:heart:` `:sob:` `:joy:` | ✅ `js/chat.js` |
| Autre 2 | Boutique : onglet Boosters ("à venir") + onglet Bonus (**auto-reroll** machine à sous, 500k) | ✅ `js/bonus.js` (machine d'état 1h + réarmement : 10 BJ + 10 poker + 10 roulettes ≥500 gagnés + 50k), UI dans `js/slots.js` (bouton + timer + tooltip + popup) |
| Autre 3 | `/donner-skin` — offrir un skin de caisse (réservé id 411114861276430337) | ✅ table `cs_gifts` + `Cases.grant()` + `js/cs-gifts.js` + bot `/donner-skin` |

**Bot 2026-08-31 :** `/joueur-fiche discord_id:` (voir les données d'un joueur) et
`/purge-progression discord_id: confirmer:true` (reset wallet + user_skins + scores,
trace la fiche dans les logs Railway AVANT). Ne touche PAS les cartes CS (localStorage
côté client). Réservé `ManageGuild`.

**Anti-cheat (Séc 2) — design à valider avant de coder :** il faut un LEDGER des
transactions légitimes (chaque gain/perte/achat signé) pour distinguer un solde
"impossible" d'un joueur multi-plateforme. Sans ça, faux positifs garantis. Ne pas
coder à la va-vite.

## Journal (le plus récent en haut)
- 2026-08-31 (auto-reroll v4 — pause/reprise + fix "page disparaît") :
  - Stop → maintenant **PAUSE** : `st.pausedMs` gèle le temps restant, reclic =
    reprise. La session n'est "consommée" que si le temps tombe à 0 en marche.
    `arState()` : + `paused`. `sweep()` nettoie un état expiré.
  - `renderAR` : wrappé en try/catch (ne casse plus jamais la page des machines).
    Nouveau `.ar-count` = progression `BJ x/10 · PK x/10 · RL x/10` **toujours
    visible** quand verrouillé (plus besoin de survoler pour voir où on en est).
    Tooltip au survol ET au clic.
  - `build-dev.js` : `rmrf` tolère EPERM (l'exe DEV ouvert). ⚠️ le rebuild DEV
    échoue quand même si `dev/EveLatro-DEV.exe` tourne → Eve doit le fermer.
  - Rebuild PC + APK + site. DEV : à refaire (exe ouvert pendant le build).
- 2026-08-31 (auto-reroll v3 — retours Eve) :
  - Bug : `let loopOn` supprimé mais encore référencé → ReferenceError → l'auto-spin
    ne marchait pas + le bouton bizarre. Réécrit sans `loopOn`.
  - L'achat ne démarre PLUS de timer. `arState()` : `free` (1re fois gratuite,
    clic = start) · `active` (clic = STOP + timer à 0) · `locked` (grisé,
    `aria-disabled` pas `disabled` → le survol marche pour la tooltip) · `ready`
    (conditions ok → clic → pop-up 50k → `arPayAndStart`). `st.firstUsed` en local.
  - `slots.js` : bouton `is-on` rouge « ⏹ Arrêter », `maybeAutoSpin` sans loopOn,
    `kickLoop()` au démarrage. Tooltip aussi au clic sur bouton verrouillé.
  - DEV : `FAKE` 1e9 → **10 000 000** fixe (l'infini faisait buguer l'affichage).
    Plus de « ∞ », badge « DEV · 10 M fixes ». `build-dev.js` : `rpc.js` ajouté
    au RUNTIME (manquait → le .exe DEV plantait au boot).
  - Rebuild DEV + PC + APK + site.
- 2026-08-31 (auto-reroll v2 + /donner-skin + fix branche Cloudflare) :
  - **Auto-reroll** (bonus 500k) refait : `js/bonus.js` = machine d'état.
    Achat → 1 h de relance auto sur les 3 machines. Après : bouton grisé,
    tooltip des conditions (10 BJ + 10 poker + 10 roulettes ≥ 500 gagnés),
    puis bouton noir → popup légère → payer 50k → nouvelle heure. Timer à côté.
    `slots.js` : bouton `.ar-btn` + `.ar-timer` + boucle `maybeAutoSpin`.
    Hooks progression : `Bonus.arNote('bj'|'poker'|'roulette')` dans les 3 jeux.
  - **`/donner-skin`** (réservé `411114861276430337`) : table `cs_gifts` (dans
    `supabase-anticheat.sql`), `Cases.grant()`, `js/cs-gifts.js` (réclame au
    lancement + toutes les 60 s, toast `Toast.info`), bot `rollGiftSkin()` +
    handler. Le destinataire doit être lié (profiles).
  - **Fix Cloudflare** : la branche de PRODUCTION du projet Pages s'appelle
    **`Evelatro`** (E majuscule, créée au 1er deploy). `--branch=main` faisait
    des déploiements PREVIEW → `evelatro.pages.dev` figé. Corrigé dans
    `package.json` + `release.js` (`--branch=Evelatro`). Prod à jour (1.2).
  - Rebuild PC + APK + site déployé. ⏸️ Eve : re-run `supabase-anticheat.sql`
    (table `cs_gifts`) + `npm run bot:deploy` (`/donner-skin`).
- 2026-08-31 (Rich Presence + automatisation + triche-annuler) :
  - **Util 0 — Rich Presence** : `rpc.js` (protocole IPC Discord en direct, aucune
    dépendance npm → pas de risque de bundling), `js/presence.js` (renderer),
    `main.js`/`preload.js` branchés. Affiche « <solde> cr · #<rang> · en tant que
    <pseudo> ». PC uniquement. `rpc.js` ajouté aux `files` d'electron-builder.
  - **Automatisation** : `npm run release` = `scripts/release.js` (build → GitHub
    Release → réécrit les liens DL dans `site/index.html` → deploy Cloudflare →
    deploy Railway). Options `--skip=`, `--only=`, `--dl-win=`, `--notes=`.
    `GUIDE-AUTOMATISATION.md` (setup 1×: git+GitHub, `gh auth login`,
    `npx wrangler login`, `railway login`). Vieux lien MediaFire retiré de
    `site/index.html` — les liens viennent du bloc `id="dl-links"` géré par release.js.
  - **`/triche-annuler` + `/triche-confirmer`** acceptent maintenant `fiche:` OU
    `joueur:@membre` OU `discord_id:` (toutes optionnelles). Ferme toutes les
    fiches ouvertes du joueur d'un coup.
  - **Site déployé** : `evelatro.pages.dev` sert la 1.2 + anti-triche (vérifié).
    Branche prod = `main`. APK dispo sur le site (8 Mo). ⚠️ **le `.exe` (76 Mo)
    ne peut PAS aller sur Pages** → bouton Windows cassé tant qu'Eve n'a pas fait
    le setup GitHub Releases (ou donné un lien via `--dl-win=`).
- 2026-08-31 (v1.2 + Netlify KO → Cloudflare Pages) :
  - Netlify a coupé les déploiements d'Eve (crédits épuisés). Bascule sur
    **Cloudflare Pages** (gratuit, illimité, CLI). Domaine → `evelatro.pages.dev`.
    OG tags de `site/index.html` mis à jour (`netlify.app` → `pages.dev`).
    `package.json` : `npm run site:deploy` (= sync-site-play + `wrangler pages
    deploy site --project-name=evelatro`), `npm run bot:deploy` (= `railway up`).
    Nouveau `scripts/sync-site-play.js`. Eve : `npx wrangler login` 1×.
  - **Version → 1.2** : `js/version.js` (1.1→1.2), `package.json` 1.2.0,
    `android/app/build.gradle` versionCode 3 / versionName "1.2".
    Le site affiche déjà `v1.2` (coin du bloc). ⚠️ duels 1.1 vs 1.2 bloqués (normal).
  - À FAIRE côté Eve après bascule : Supabase → Redirect URLs → ajouter
    `https://evelatro.pages.dev/**` ; Railway → var `SITE_URL` =
    `https://evelatro.pages.dev/`.
  - RESTE : Rich Presence Discord (Util 0) + le guide "tout automatiser".
  - (incident : `asar extract-file` a de nouveau écrasé `package.json` en cours de
    build → reconstruit depuis `package-lock.json` + relecture. Vérifié OK.
    NE PLUS jamais utiliser `asar extract-file` dans le dossier projet.)
  - Builds 1.2 : `EveLatro.exe` (racine + dossier), `EveLatro.apk` (racine +
    site/), `dist/EveLatro-1.2.0-windows.zip`. site/ + site/play/ synchro.
- 2026-08-31 (ANTI-TRICHE v1) — décisions Eve : reset auto si FLAGRANT, revue si
  douteux · connexion internet+Discord 100% obligatoire.
  - **`supabase-anticheat.sql`** (à lancer 1× dans Supabase) :
    - `wallet` : plus d'écriture client (policies insert/update retirées) +
      colonnes `flagged`/`flag_reason`. Le solde ne bouge que par RPC.
    - `wallet_ledger` (journal append-only, seules les fonctions écrivent).
    - `cheat_flags` (fiches + `snapshot` pour restaurer).
    - RPC `wallet_state()` (lecture/création/recharge 200, signale le flag 1×)
      et `wallet_commit(entries)` (valide chaque mouvement : bet ≤ solde,
      win ≤ 340×mise sinon reset auto, win > 60×mise & > 40k → fiche 'à examiner',
      reason interdit `refill`/`adjust` → reset auto, 3 gros gains/2j → reset).
    - `anticheat_scan()` : ratio gains/mises > 1.35 sur 120+ mains → fiche 'review'.
    - `_score_clamp` : le classement ne peut pas dépasser le solde réel.
    - **Interrupteur** : `bot_config` key `anticheat` = `{"anticheat_auto": false}`
      → tout passe en "signalement seul" (aucun reset auto). Filet anti-catastrophe.
  - `js/bank.js` : chaque mouvement → file `pending` (`logMove`). `Bank.sell()`
    (caisses). `rescue()` ne marche plus qu'à 0. `setContext()` (app.js `select`).
  - `js/wallet-ledger.js` (remplace wallet-sync.js, supprimé) : flush toutes les
    3,5 s → `wallet_commit`, réconcilie le solde, `flagged` → `AntiCheat.nuke`.
  - `js/anticheat.js` : `nuke()` = efface localStorage + logout Discord + écran
    rouge + reboot. `js/net-guard.js` : overlays "connexion requise" / "connecte
    Discord" / "serveur injoignable", non fermables. `friends.js` : bouton
    "Se déconnecter" retiré. `js/cases.js` : ventes via `Bank.sell`.
  - Bot : `/triche-liste`, `/triche-confirmer fiche:N`, `/triche-annuler fiche:N`
    (restaure depuis snapshot). Job `anticheat_scan` toutes les 10 min.
  - Testé : sim JS de `wallet_commit` (18/18 : légit jamais flag, triche flag),
    flow `WalletLedger` (flush + nuke + wipe localStorage), chargement des 33 JS.
  - ⏸️ **Eve** : (1) lancer `supabase-anticheat.sql` ; (2) `railway up` ;
    (3) redéployer PC/APK/site ; (4) TESTER avec un compte jetable (tricher exprès
    via console, vérifier reset ; jouer normal 10 min, vérifier PAS de flag).
- 2026-08-31 (URGENT — connexion Discord cassée partout) : `js/friends.js`
  `renderFriendsPanel` appelait `draw()` AVANT `let drawSeq = 0;` (introduit avec
  le classement en direct) → `draw()` async rejette sur `++drawSeq` (TDZ) → le
  panneau Multi ne rend RIEN → **le bouton "Connecte-toi avec Discord" n'apparaît
  plus** (web + PC + APK). Fix : `let drawSeq = 0;` remonté avant l'appel.
  Rebuild PC + www + site + APK.
- 2026-08-31 (bot — idle-delete réparé) : le menu `/jouer` ne se fermait pas.
  `armIdleDelete` : (1) `/jouer` utilise le retour de `i.editReply()` (Message)
  au lieu de `fetchReply().then()` avalé par un `.catch()` ; (2) suppression **par
  ID via `client.channels.fetch(chan).messages.delete(id)`** (pas `message.delete()`
  sur l'objet réponse d'interaction, capricieux) ; (3) **logs** (« idle-delete
  armé… », « idle delete KO … »). Bot only → `railway up`.
- 2026-08-31 (bot — salon dédié + /directe admin + idle 75%) :
  - `/jouer` `/leaderboard` `/vestiaire` : **uniquement dans #evelatro-banque**
    (`PLAY_CHANNEL_ID = 1543320266967359558`, override env possible) — sinon
    réponse éphémère qui pointe le salon.
  - `/directe` devient **admin only** (`setDefaultMemberPermissions(ADMIN)`).
  - `armIdleDelete` : à l'expiration des 5 min, si une **manche est en cours**
    (bj `play` / poker `draw`), `closeIdleSession()` (exporté de `games.js`) **rend
    75 % de la mise** (déjà prélevée) et **DM le joueur**. Empêche de fuir une
    mauvaise main en laissant l'embed mourir. Bot only → `railway up`.
- 2026-08-31 (bot — `/jouer` auto-supprimé si inactif) : `armIdleDelete(message)`
  dans `index.js` — timer 5 min par message ; toute interaction bouton (`i.message`)
  le repousse ; à l'expiration `message.delete()`. Anti-spam du salon.
- 2026-08-31 (site — hero simplifié) : en haut de page, plus que **1 bouton
  « Jouer maintenant »** qui **descend vers `#telecharger`** (choix web/PC/Android).
  Badge DÉMO du haut + bouton Télécharger retirés. (Bas de page inchangé.)
- 2026-08-31 (classement EN DIRECT) :
  - Le classement multi = **solde courant en temps réel** (plus le pic à la
    faillite). `js/multiplayer.js` : `pushLiveScore()` (debounce 1,5 s) upsert
    `scores.best_score = Bank.balance()` à chaque `Bank.onChange` + battement 60 s ;
    plus de garde `s <= best` ; jamais en DEV ni en duel. `submitScore()` = alias
    compat. `friends.js` : le panneau se rafraîchit toutes les 8 s + garde
    anti-course `drawSeq`.
  - Bot : `LB_INTERVAL = 600_000` (**10 min** au lieu d'1 h), aligné :00/:10/:20.
    `postLeaderboard` **supprime le message précédent** (`auto_leaderboard.last_msg`
    / `last_channel` en config) avant d'en poster un nouveau → pas de spam.
    Embed « Classement — en direct », footer « Solde en temps réel ».
  - Rebuild PC + www + site + APK (multiplayer.js + friends.js). Bot : `railway up`.
- 2026-08-31 (bot — commandes pas enregistrées) : `/help`, `/help-admin`, l'option
  `pseudo` n'apparaissaient pas MAIS le handler tournait (la liste "comptes liés"
  marchait). Cause : `/purge-progression` avait `confirmer` **required APRÈS** les
  options optionnelles `discord_id`/`pseudo` → Discord refuse **tout le lot** de
  commandes → il garde l'ancienne liste. Fix : `confirmer` remis en 1er ; +
  `ClientReady` : si `mgr.set()` échoue en lot, on enregistre **une par une**
  (une commande cassée ne bloque plus les autres). → `railway up`.
  Serena : PAS dans `profiles` (seuls `angel.blushed` + `liliox` liés) → elle doit
  se reconnecter à Discord dans la NOUVELLE version du jeu une fois.
- 2026-08-31 (v1.2 — build stale + /help + fiche robuste) :
  - **Eve voyait "rien de neuf"** (emoji, menu rouge, onglets boutique) car elle
    lançait de VIEUX .exe renommés à la racine (`EveLatro-A-JOUR.exe`,
    `EveLatro-DERNIERE.exe`). L'asar était pourtant à jour. → strays supprimés,
    portable rebuild → **`EveLatro.exe` à la racine** (frais). APK rebuild
    (`npm run apk`) → `EveLatro.apk` racine + `site/`.
  - `/help` (commandes joueur) et `/help-admin` (commandes admin, perm-check).
  - `/joueur-fiche` + `/purge-progression` acceptent maintenant `discord_id`
    **OU `pseudo`** ; si introuvable → **liste les 20 comptes liés** (pseudo +
    discord_id) pour diagnostiquer (ex: serena introuvable → soit pas de row
    `profiles`, soit mauvais `SUPABASE_URL` côté bot).
  - Site : boutons DL groupés `[Windows][Linux]` ⎵ `[Android][iOS]` (gap 34px) ;
    `v1.2` en petit en bas-droite du bloc `.panel-heaven`.
- 2026-08-31 (v1.2 — lot rapide) : emoji chat (`:skull:` `:heart:` `:sob:` `:joy:`),
  modal fair-play rouge au 1er lancement (`js/fairplay.js`, avant `News.check`),
  site : boutons DL en 2 lignes + iOS/Linux "bientôt" + `<details>` "FAQ
  téléchargement + aide" + halo doré animé `.panel-heaven`, boutique 3 onglets
  (Tenues / Boosters "à venir" / Bonus) + `js/bonus.js` (item `slots-autoreset`
  500k → `slots.js` relance un tour tout seul après recharge), bot
  `/joueur-fiche` + `/purge-progression`. Rebuild PC + www + site/play.
- 2026-08-31 (bot — croupier FUSIONNÉ dans l'image, fini le clignotement) :
  - Le `keptGif` (garder la pièce jointe GIF entre 2 updates) **cassait** :
    images vides + GIF en carré noir. Discord ne sait pas garder une pièce jointe
    pendant qu'on en remplace une autre via `interaction.update`.
  - **Solution** : le croupier (image FIXE) est maintenant **dessiné DANS l'image
    de la table**, à droite (zone `L.croupier`, table élargie à W=904). UNE seule
    pièce jointe (`bj.png` / `poker.png`), rechargée à chaque coup — pas d'autre
    attachment donc **rien qui clignote**. + 1 embed texte pour la réplique.
  - `render-table.js` : `croupierComposite()` colle `bot/croupiers/<g>-<n>.still.webp`.
    Plus de GIF animé sur le bot. `gen-croupier-gifs.js` ne fait plus que les
    `.still.webp` (300 px). GIFs supprimés → **bot déployable = 1,1 Mo**.
  - `withCroupier` réduit au strict minimum (vignette du menu). `bjPayload`/
    `pkPayload` : `{ embeds:[imgEmb, ligneEmb], files:[img] }`, plus de `keptGif`.
  - Testé : flux BJ + poker complets, 2 embeds / 1 fichier / pas de champ
    `attachments`, 5 jeux + menu + verrou OK.
- 2026-08-31 (bot — poker en image + anti-clignotement + solde 0→200) :
  1. **Clignotement du croupier** au clic (hit/stand/draw) : on ré-uploadait le
     GIF à chaque coup. Fix : `withCroupier(..., { keptGif })` — on passe la pièce
     jointe `croupier.gif` déjà sur le message (`interaction.message.attachments`)
     et on la GARDE via `attachments:[keptGif]` pendant qu'on ré-upload seulement
     `bj.png`/`poker.png`. Plus aucun re-upload du GIF.
  2. **Poker redessiné** comme le blackjack (même D.A.) : `renderPoker` +
     `felt-poker.png`, `hold.png` (pastille GARDÉE), `pk-<combo>.png` (10 noms de
     mains) dans `scripts/gen-bj-assets.js`. `pkPayload` async, image
     `attachment://poker.png`. `×` ajouté à la bande de chiffres.
  3. **Solde 0 → 200 qui ne revenait pas** (jeu ET bot) :
     - `js/wallet-sync.js` : le cloud à **0 n'est plus jamais adopté** (0 = état
       invalide, le jeu se recharge). Garde-fou : on n'adopte pas un solde relu
       dans les 3 s après un changement local (course entre notre push et la
       relecture). `Bank.rescue()` / `endRound()` appellent `WalletSync.forcePush()`.
     - `js/bank.js` : `rescue()` refuse en duel, force le push cloud.
     - `bot/games.js` `balOf()` : si le solde lu est **≤ 0**, on recharge à 200
       tout de suite (avant c'était seulement à la prise de mise).
  - **Rebuild jeu nécessaire** (bank.js + wallet-sync.js) : PC + www + site + APK.
  - Bot : `railway up` (dépend de `sharp`, installé par Railway).
- 2026-08-31 (bot — Blackjack redessiné en image) :
  - **Eve veut les cartes DESSINÉES.** Nouveau : `scripts/gen-bj-assets.js`
    (rasterise 52 cartes + dos + table + bandes de chiffres avec Arial local →
    `bot/bj/*.png`, ~285 Ko) + `bot/render-table.js` (compose la table en PNG
    avec **sharp**, 0 police requise à l'exécution → sûr sur Railway).
    Ajout dépendance **`sharp`** dans `bot/package.json`.
  - `bjPayload` est maintenant **async** : construit l'image (croupier=dealer en
    HAUT, mes cartes en BAS, points, mise, solde, bandeau GAGNÉ/PERDU +montant),
    embed `.setImage('attachment://bj.png')`. Ré-attache bj.png + croupier.gif à
    CHAQUE coup (l'image change). Call-sites : `await bjPayload(...)`,
    `gamePayload` async, `await gamePayload(...)`.
  - `withCroupier` (cas `cat`) : ordre = **[embed jeu] · [GIF croupier] · [texte]**.
    Le texte = `**Nom · Tenue**` puis à la ligne `« réplique »` (plus d'author).
  - `bjEmbed` : mort (gardé, inutilisé). Le bug d'affichage `## ` littéral
    disparaît (plus de champs texte).
  - Testé : flux complet BJ (new→panneau mise→valider→deal→hit→stand), rendu
    image OK (3 captures), régression 5 jeux + verrou + menu OK.
- 2026-08-31 (bot — `railway up` timeout : dossier trop lourd) :
  - `bot/croupiers/` était passé à **17 Mo** (10 GIF ~1,7 Mo) → `railway up`
    timeout à l'upload chez Eve.
  - `gen-croupier-gifs.js` réécrit : sortie = `<g>-<n>.still.webp` (image menu,
    ~25 Ko) + `<g>-<n>.gif` (anim, ~600 Ko, W=172, FPS=10, DUR=3.4, SS=3).
    Nettoie les anciens `<g>-<n>.webp` / `.anim.webp` du dossier.
  - `croupierAsset()` : `still.webp` pour le menu, `.gif` en jeu.
  - **`bot/croupiers/` = 6 Mo** (node_modules ignoré par `.gitignore`).
  - Eve : `railway upgrade` (CLI périmé) puis `railway up`.
- 2026-08-31 (bot — 3e passe : mise en page + fluidité GIF) :
  1. **En jeu** : ordre des embeds = croupier EN GRAND en haut · embed du jeu au
     milieu · réplique du croupier en bas. `withCroupier` : `embeds = [imgEmb,
     ...jeu, txtEmb]` quand `cat`. (Menu inchangé : petite vignette fixe.)
  2. **Embed Blackjack grossi** : titre espacé, mains en `## ` (gros), résultat
     en `## ✅/❌`, champs `inline:false` (empilés = plus haut).
  3. **GIF plus fluide** : `gen-croupier-gifs.js` — super-échantillonnage **3x**
     (scale lanczos ↑, crop sous-pixel, scale ↓) + **FPS 15** (avant 8).
     Position verticale précise au 1/3 px → plus de "marches". W=200, DUR=4.6
     (vitesse gardée, Eve la trouve agréable). ~1,7 Mo/gif, 16 Mo total.
- 2026-08-31 (4 retouches bot — 2e passe) :
  1. **Menu : croupier IMMOBILE** → `menuPayload` passe `still=true` à `withCroupier`
     → attache le `.webp` (fixe) au lieu du `.gif`. Le retour de partie (`g:menu`)
     force `mode:'attach'` pour repasser du gif animé à l'image fixe.
  2. **GIF ralenti + plus rognage tête/pieds** : `scripts/gen-croupier-gifs.js`
     revu — fenêtre de sortie = `H + 2*MARGIN` qui glisse de 0 à `2*AMP`
     (AMP=6, MARGIN=14, DUR=4.6 s, FPS=9). Le sprite reste TOUJOURS entier.
     GIF regénérés (~400-600 Ko). Contrôle visuel 4 frames OK.
  3. **Disposition** : Discord **ne permet PAS** de mettre des embeds côte à côte
     (pas de "carré" possible). Compromis : le croupier est sur l'embed rose
     « réplique » → 2 embeds au lieu de 3. **Menu** = petite vignette (thumbnail,
     Eve : « c'est clean »). **En jeu** = GRANDE image (`.setImage`, Eve : la
     vignette « faisait pitié »). GIF regénéré en W=224 pour l'affichage grand
     format (~1 Mo/gif, 11 Mo total). `croupierAsset(g,skin,still)` renvoie
     `{file, ref}` (nom croupier.webp OU croupier.gif selon still).
  - Testé (g3.mjs) : menu = webp fixe en vignette · BJ/poker = gif animé en
     vignette · roulette/mise = croupier retiré · verrou intrus OK · 5 jeux OK.
  - Bot uniquement — **Eve : `railway up`.**
- 2026-08-31 (4 retouches bot) :
  1. Croupier = **3e embed avec GIF qui flotte** (généré par
     `scripts/gen-croupier-gifs.js` avec ffmpeg → `bot/croupiers/*.gif` ~350 Ko).
     Retiré le thumbnail de l'embed réplique. `withCroupier(payload,g,skin,cat,mode)`
     mode attach/keep/clear (l'astuce : `interaction.update` sans `files`/`attachments`
     garde la pièce jointe existante).
  2. Croupier **reste sur le menu** (Eve aime), **disparaît** sur roulette /
     machines / caisses / vestiaire (`attachments: []`).
  3. **Verrou** : `interaction.message.interactionMetadata.user.id` — seul celui
     qui a fait `/jouer` peut cliquer.
  4. Bouton mise → **panneau de mise** (`betPanelPayload`) : jetons +50/+100/+500/
     +1k/+5k/+25k, Remise à 0, Max, Valider. `clampBet()` (jamais > solde).
  - Testé : verrou, panneau mise, croupier attach/keep/clear, les 5 jeux OK.
  - Bot uniquement — **Eve : `railway up`.**
- 2026-08-30 (2 dernières étapes) :
  - **#8.1 skins depuis Discord** : `/vestiaire` (+ bouton dans `/jouer`) — grille
    des 5 tenues par croupier, porter/acheter, débite `wallet`, écrit `user_skins`
    → le jeu se met à jour en direct (skin-sync realtime). `bot/games.js`
    `skinsPayload` + handler `g:skin:*` + `shared.skinsRow/skinsSave`.
  - **#9.5 / croupier en image** : les 10 `.webp` copiés dans `bot/croupiers/`.
    L'embed croupier (BJ + poker) affiche l'**image de la tenue portée** en
    thumbnail (= "à droite"), + le nom de la tenue dans l'auteur. La "bobbing"
    animation n'est pas possible sur une image Discord statique.
    Note : la musique du jeu est instrumentale → pas de vraies paroles à afficher.
  - Rebuild PC/dev/portable/www/site/APK (changements côté jeu : version.js,
    duel.js, friends.js, multiplayer.js, skins.js, skin-sync.js, wallet-sync.js).
  - **Eve : re-run SQL, `railway up`, re-déposer site/, réinstaller APK.**
- 2026-08-30 (bot Railway crash au déploiement) :
  - `bot/croupier-lines.mjs` et `bot/cs-catalog.mjs` lisaient `../js/*.js` → Railway
    ne déploie QUE `bot/` → `ENOENT /js/croupier-lines.js` → crash.
  - **Fix** : ces 2 fichiers sont maintenant **autonomes** (données inlinées).
    Générés par `node scripts/gen-bot-data.js` (à relancer si on modifie
    `js/croupier-lines.js` ou `js/cs-catalog.js`).
  - Aucun rebuild PC/APK nécessaire (rien changé côté jeu). **Eve : refaire
    `railway up` depuis `bot/`.**
- 2026-08-30 (2e vague de retours Eve) :
  - **Version PC↔Android** : `verNum()` dans version.js — le duel compare le NUMÉRO
    (1.1 vs 1.2), plus la plateforme. PC 1.1 et Android 1.1 peuvent jouer ensemble.
    `duel.js` + `friends.js` mis à jour.
  - **Skins inter-version** : table `user_skins` + `js/skin-sync.js` (FUSION : ne
    perd jamais un skin) + `Skins.snapshot()/applyRemote()`. Stocké sur le compte
    Discord → survit à 1.1→1.2→1.3 et suit sur tous les appareils.
  - **Solde bot pas lié au vrai** : le bot utilisait l'ID Discord, le jeu l'UUID
    Supabase → 2 soldes séparés. Fix : table `profiles` (discord_id ↔ user_id),
    le jeu l'écrit à la connexion, le bot résout via `profiles`. Plus `/solde` et
    `/jouer` disent "connecte le jeu à Discord" si pas lié.
  - **Solde sync qui marche pas sur son compte** : filet de sécurité ajouté
    (relecture cloud toutes les 5 s) dans wallet-sync.js.
  - **Bot `/jouer` refait** (`bot/games.js` v2) :
    - vraies 500 répliques (charge `js/croupier-lines.js` via `bot/croupier-lines.mjs`),
      croupier SEULEMENT au BJ + poker (retiré des machines/roulette), skin-aware.
    - BJ : sélection de la mise avant de distribuer.
    - mise plafonnée au solde correctement + cycle de mise filtré par le solde.
    - machines : mini-animation (2 images qui tournent puis résultat).
    - roulette : visuel du voisinage de la roue + sélecteur **numéro plein par
      boutons** (2 pages de 25), pas de saisie texte.
    - **15 caisses** (les vraies, via `bot/cs-catalog.mjs`), 2 pages.
    - **relié au feed** : chaque action bot → table `activity` → /feed + panneau du jeu.
  - `/annonce` : message texte simple (l'embed OG du site se déploie tout seul).
  - `/news-post` : image Pinterest → besoin d'un lien DIRECT .jpg/.png.
  - SQL : + `profiles`, + `user_skins` (+ realtime).
  - **Eve : re-run SQL, redéployer bot, re-déposer site/, réinstaller APK.**
- 2026-08-30 (matin, retours Eve) :
  - #3 caisses : "parfait, considère fini". #9 dialogues : "J'ADORE". ✅✅
  - Bot `/jouer` cassé → cause : emoji 🂡 invalide sur un bouton Discord → toute
    la réponse rejetée. Fix : 🂡→🎴 + `try/catch` sur `setEmoji` + `/jouer` en
    `deferReply` + wallet.get résilient (return 200 si table absente).
  - `/annonce` : embed remplacé par un **message texte simple + le lien** (Discord
    déploie le grand aperçu du site tout seul via les balises OG).
  - `/news-post` image Pinterest : il faut un **lien DIRECT** (.jpg/.png, clic droit
    « Copier l'adresse de l'image »). `newsEmbed` : `isDirectImage()` → sinon met un
    lien cliquable + explication. Placeholder du modal `/news` mis à jour.
  - #5 lancé : `sync-www.js` copie maintenant `croupiers/` ; `www/` + `site/play/`
    resynchronisés avec tous les nouveaux fichiers ; APK en cours de build.
  - **Eve : redéployer le bot Railway** (fix /jouer + /annonce) et **re-déposer
    `site/` sur Netlify**.
- 2026-08-30 NUIT (Eve dort) — GROSSE SESSION :
  - #3 Caisses CS:GO : FAIT (cs-catalog.js + cases.js + CSS + dock).
  - #6 Solde partagé cloud : CODÉ (wallet table + wallet-sync.js + Bank.setCredits).
  - #9 Dialogues : FAIT (croupier-lines.js, 500 répliques, CroupierTalk sac mélangé,
    blackjack/poker recâblés).
  - #7/#8/#10/#10.5 Bot : FAIT (bot/games.js — 5 jeux jouables, embed croupier,
    /jouer /solde /annonce /news-post + auto-post news).
  - SQL mis à jour : + table `wallet`, + colonne `duels.slot_machine`, wallet en realtime.
  - Tout testé en headless/mock. Builds refaits.
  - RESTE (jour) : #5 propager web+APK · #8.1 skins Discord · #9.5 lyrics · Eve
    doit : re-run SQL, redéployer le bot, tester VS à 2, tester solde partagé à 2.
- 2026-08-30 — ROUND 6 : 2e vague de retours Eve sur #2 (défaites/spam/machine/
  bet/roulette/manches). Refonte autour des **crédits virtuels en duel**
  (`Bank.inFight()`), verrou anti-spam, roulette 50/50, sélecteur de machine,
  manches 1/5/10, DQ repoussée pendant une action. SQL +`slot_machine`.
  Builds refaits (portable lockée par l'antivirus mais finit par passer).
- 2026-08-30 — ROUND 5 : 1er retour Eve sur #2 (chrono, zombie, DQ). Robustesse :
  horloge locale, `apply()` local, poll 3 s, `isStale()`, bouton Quitter.
- 2026-08-30 — ROUND 4 : #2 mode VS refait en entier (best-of-N, chrono 20 s,
  EveFight! plein écran, DQ, écran de fin).
- 2026-08-29 nuit — ROUND 3 :
  - Eve confirme : #12 musique ✅ "miraculeux", #4 ✅ (co Google OK), #1 ✅ embed OK.
  - #11 : Eve n'aime pas `/auto-directe`, elle veut `/feed`. C'est `/feed` qui merdait.
    → `startFeed` refait : temps réel + **filet de sécurité qui relit la table
    toutes les 12 s** (marche même si Realtime pas activé sur `activity`).
    `/feed on` poste maintenant un message de confirmation dans le salon + rappelle
    qu'il faut **jouer connecté à Discord** pour générer de l'activité.
  - `EveLatro-NOUVEAU.exe` fusionné dans `EveLatro.exe`. Tous les builds OK.
  - PROCHAIN : #2 refonte mode VS.
- 2026-08-29 nuit — ROUND 2 :
  - #12 musique : moteur RÉÉCRIT (AudioBuffer + boucle native). 3e version.
  - #1 : URL du site connue = https://evelatro.netlify.app/ → og:image passé en
    URL absolue. Embed marchait (titre+desc) mais sans image → devrait être bon
    après redeploy.
  - #4 : cause TROUVÉE (redirige vers localhost:3000 = "Site URL" Supabase). Steps
    donnés à Eve (Site URL + Redirect URLs).
  - #11 : la clé service_role d'Eve MARCHE (`bot_config OK`). Reste : attendre
    l'heure pile ; `/auto-directe` à refaire ; ajout mini-serveur HTTP dans le bot
    (Railway SIGTERM). 
  - Build : root `EveLatro.exe` verrouillé (Eve le testait) → copie fraîche dans
    `EveLatro-NOUVEAU.exe`. dist/ + dev/ à jour.
  - Nouvelle mémoire : [[eve-ne-sait-pas-configurer]] — plus de jargon.
- 2026-08-29 soir — ROUND 1 :
  - #0 CHANTIER créé.
  - #12 musique : bug trouvé + corrigé + testé. ✅
  - #11 auto-leaderboard : code durci (erreurs visibles, envoi test, self-check). Reste clé service_role à Eve.
  - #4 OAuth navigateur : messages d'erreur clairs ajoutés. Reste config Supabase à Eve.
  - #1 embed site : `site/og.png` + balises meta. Reste redeploy Netlify à Eve.
  - Smoke test app complète : OK, 0 erreur console.
  - PROCHAIN : #2 (refonte VS) — le plus gros morceau "jeu". Puis #9 (répliques), #3 (caisses).
- 2026-08-29 : exploration duel.js / music.js / structure.
  Ordre prévu : bugs (#12, #11, #4) → #1 → #2 → #9 → #3 → #6 → #7/#8/#9.5 → #10 → #5.

- 2026-08-31 — Auto-reroll : session forcée à 1 h PARTOUT (retrait du mode DEV 2 min
  dans js/bonus.js : `SESSION_MS = 60*60*1000`). Rebuilds : dist/EveLatro.exe +
  zip + EveLatro.apk + dev/EveLatro-DEV.exe (tous 16:16-16:18). Root EveLatro.exe +
  dossier EveLatro/ rafraîchis. Site redéployé sur Cloudflare (branche Evelatro) →
  c9565fb3.evelatro.pages.dev / evelatro.pages.dev.

- 2026-08-31 — Rich Presence v2 :
  * Image ajoutée : site/presence.png (1024²) + site/presence-croupiere.png
    (badge, photo croupière). Servies en https par Cloudflare → aucune config
    portail Discord.
  * rpc.js réécrit : essaie les pipes discord-ipc-0..9 (avant : -0 seul, d'où
    "il faut activer à la main"), reconnexion rapide, ré-affichage toutes les 60 s.
  * large_image + small_image + small_text (#classement).
  * Rebuild exe + dev.
  ! Le "Go Live / Stream" en bas de Discord = clic unique de l'utilisateur
    (Paramètres Discord > Jeux enregistrés > "Ajoutez-le !") — non forçable par
    une app (sécurité Discord). Documenté pour Eve.

- 2026-08-31 — Rich Presence v2.1 (retour Eve : image cassée = dé blanc) :
  * Cause : PNG 1024² = 1,2 Mo, Discord refuse les images externes lourdes.
  * Fix : rp-large.jpg + rp-small.jpg (512², ~25 Ko, JPEG). Anciens presence*.png
    supprimés de site/. rpc.js pointe sur les .jpg. Site redéployé.
  * Confirmé par Eve : l'activité + le bandeau "faire un clip" s'affichent bien.
  * Rebuild : dist/EveLatro.exe (portable, 16:47) → EveLatro-NOUVEAU.exe (racine
    verrouillée), dossier EveLatro/ (16:44), dev/EveLatro-DEV.exe (16:46), zip.

- 2026-08-31 — Anti-triche : DUEL VS déclenchait un faux ban + restauration incomplète.
  CAUSE du faux ban : en combat, Bank.balance() renvoie 1e9 (crédits virtuels).
  La mise du duel du challenger = pct% × 1e9 → 100 M → gain_impossible → reset auto.
  FIX :
  * js/duel.js : mises calculées sur Bank.realBalance() (nouveau, = vrai solde).
  * js/bank.js : Bank.duelWin/duelLoss → journal en reason 'duel'.
  * supabase-anticheat.sql : wallet_commit gère 'duel' (pas de ratio HARD_MULT,
    plafond DUEL_MULT=20× / 5 M plancher ; au-delà = signalement, répété = reset).
  SNAPSHOT : _wl_flag(+ p_restore_bal) enregistre 'credits_before' = solde AVANT
    l'action douteuse (l'argent buggé n'est jamais mémorisé). wallet_commit passe
    le solde propre à chaque flag auto.
  RESTAURATION élargie : wallet.cs_inv + wallet.bonuses (nouvelles colonnes),
    game_sync() RPC, client pousse via Multiplayer.gameSync (cases.js save +
    bonus.js buy), wallet_state renvoie les 2, wallet-ledger.reconcile hydrate
    Cases + Bonus. /triche-annuler restaure credits_before + skins caisses + bonus ;
    /triche-confirmer les efface aussi.
  bonus : l'inventaire de caisses + l'auto-reroll se synchronisent maintenant
    entre PC/tel/web (effet de bord du filet anti-triche).
  ! Eve doit : re-lancer supabase-anticheat.sql + npm run bot:deploy.
  BUILDS OK 17:41 : EveLatro-NOUVEAU.exe (racine verrouillee), EveLatro/, dev/EveLatro-DEV.exe, EveLatro.apk (+site/). friends.js : apercu mise duel sur realBalance.
- 2026-08-31 — 1.2 prete pour release. Versions deja a 1.2 partout (rien a bumper). Connexions OK : git origin=AngelBlushed/evelatro, gh authed (AngelBlushed, scope repo — PATH machine OK, nouveau terminal requis), wrangler OK, railway OK (Eve). ORDRE : 1) SQL supabase-anticheat.sql dans Supabase  2) npm run release (fermer le jeu avant). ~10 min.
- 2026-08-31 — Bouton "Windows" du site : passe du .exe portable au .ZIP (dossier complet). release.js upload EveLatro-Windows.zip (nom stable) sur la release GitHub + met aussi le .exe en secours ; DL_WIN -> le zip. site/index.html : bouton ".zip", FAQ "extraire puis lancer EveLatro.exe". + bot : /annonce a un encart rouge anti-triche + lien netlify mort -> evelatro.pages.dev (GAME_URL). Deploiement en cours : upload zip sur v1.2.0 + site.
- 2026-08-31 — /annonce refait : 2 embeds. #1 = annonce XXL (PINK, author+thumb emilia, titre cliquable -> GAME_URL, grande image = evelatro.pages.dev/og.png, footer). #2 = mise en garde anti-triche (RED). react 🤍 sur le message. Deploy = npm run bot:deploy (Eve).

- 2026-08-31 — GEL 1.2. Public fige (exe/apk/site/play/bot/jouer = 1.2). Dossier beta/ cree (copie jeu : js css assets croupiers index.html main.js preload.js rpc.js manifest.json images). Tout nouveau dev jeu -> beta/. Ne plus deployer sauf demande explicite : site vitrine (npm run site:deploy) ou bot (npm run bot:deploy). Jamais porter la beta dans site/play/ ni dans bot/games.js (/jouer). Voir beta/README.md.

- 2026-08-31 — BÊTA 1.3 prompt 1 (menu + hub + succès). Tout dans beta/ (non déployé). Nouveaux : beta/js/shell.js, beta/js/achievements.js, beta/css/shell.css. Modifs beta/ : index.html (2 écrans + includes + bouton maison topbar), js/app.js (boot différé), js/music.js (morceau menu), js/net-guard.js (pas de garde hors casino), js/settings.js (bascule affichage compact/xl), js/version.js (1.3). Écrans : launch néon -> hub 4 mondes (3 "à venir") -> casino 1.2. 2 succès : auto-reset, all-skins. À tester : ouvrir beta/index.html.

- 2026-08-31 — BÊTA 1.3 prompt 2 :
  * beta/js/beta.js -> window.__EVELATRO_BETA__ (isole le jeu : 0 connexion Supabase/Discord,
    pas d'anti-triche, pas d'ecran "connecte-toi"). Gardes ajoutes dans multiplayer/net-guard/
    wallet-ledger/fairplay/anticheat/presence. A RETIRER quand la beta repasse en ligne.
  * scripts/build-beta.js + electron-builder-beta.json + npm run build:beta
    -> beta/_exe/EveLatro-BETA.exe (portable, part de beta/, ne touche pas dist/dev).
    .gitignore : /.beta-build/ + /beta/_exe/.
  * Menu d'accueil refait facon Balatro (inspiration, pas copie) : fond "liquide" (nappes
    crimson/violet/or/teal floues qui derivent + stries "verni" + vignette), titre chunky
    "Eve[carte A pique]Latro!" avec ombre dure, barre de boutons chunky (Jouer/Options/
    Patch notes/Quitter) facon autocollant, v1.3 en haut a droite, chip BETA en bas a gauche.
    (js/shell.js .chunk-btn + bouton Quitter sur Electron ; css/shell.css section launch reecrite)

- 2026-08-31 — BÊTA retour Eve : menu launch refait.
  * fond = canvas 2D (beta/js/menu-bg.js) -> rendu identique Chrome/.exe (fini les
    divergences mix-blend/filter CSS). ~17-20 nappes floues additives (compositing
    'lighter' + ctx.filter blur + traînée fondu) qui s'entremêlent, lent & fluide,
    palette rouge/magenta/violet/indigo/bleu/or. Pause hors #launch-screen + onglet caché.
  * boutons chunky : gap clamp(18px,4vw,40px) (espacés).
  * musique menu : 'néon' -> 'lounge' chaud & lent (piano électrique feutré + contrebasse
    douce + vibraphone épars), 56 bpm. (js/music.js track id 'menu')
  * hub (menu 2) : inchangé (Eve adore).

- 2026-09-01 — BÊTA menu, retour Eve (musique ADORÉE, fond "à vomir") :
  * fond refait en WebGL (beta/js/menu-bg.js) : shader domain-warping FBM (Inigo Quilez),
    UNE nappe marbrée continue crimson/royal/violet + filets or, déformée 2x, très lente
    (u_time*0.045). Plus de compositing additif/rainbow. Repli 2D (4 blobs doux) si pas de WebGL.
    Retiré .liquid-sheen / .liquid-vignette (le shader fait relief + vignette).
  * musique menu : boucle native infinie — armAdvance() n'enchaîne plus jamais un
    morceau menuOnly ; dernière mesure vidée des sons à longue traîne (recollage sans clic).

- 2026-09-01 — BÊTA menu (Eve ADORE le fond) : 3 retouches.
  * "Patch notes" sorti de la barre -> bouton coin bas-droite (.corner-patch).
  * portrait/fenêtre étroite : Jouer/Options/Quitter empilés verticalement (largeur uniforme).
    paysage/plein écran/xl : boutons en ligne + bien espacés (gap jusqu'à 64px), titre remonté
    (justify-content: space-between, padding 12vh/13vh). @media (min-width:720px)+(min-aspect-ratio:1/1) ou [data-layout=xl].
  * sous-titre "mini-casino de poche" -> "dopamine dealer".

- 2026-09-01 — BÊTA menu retouches :
  * bug : les boutons launch restaient en ligne dans la fenêtre poche -> c'était
    html[data-layout=xl] (réglage "Affichage extra-large" d'Eve) qui forçait row.
    Retiré ce couplage ; le launch suit maintenant UNIQUEMENT la forme de la fenêtre
    (@media min-width:700 + min-aspect-ratio:1/1). Fenêtre poche/portrait -> boutons verticaux.
  * paysage/plein écran : boutons bien plus gros (padding 22px, font 1.15-1.7rem, bord 4px)
    et très espacés (gap 44-120px), titre plus gros (4-9.5rem), remonté.
  * hub : bouton "maison" (#hub-home) ajouté à gauche de Réglages -> retour au menu d'accueil.

- 2026-09-01 — BÊTA menu, mode large :
  * boutons plus PLATS et larges (rectangles), padding vertical réduit, font 1-1.3rem.
  * CADRE facon Balatro : .launch-bar devient un plateau (bord 4px #180a14, radius 24,
    fond rgba(11,4,10,.5), ombre dure, backdrop-blur) qui relie les 3 boutons. gap 24-58px.
  * titre 4.6-10.5rem, sous-titre 1-1.55rem, tout redescendu (padding-top 17vh).
  * "dopamine dealer" animé : keyframe sub-throb (scale/rotate/letter-spacing/couleur, 2.4s).
  * pocket : inchangé (Eve : "top").

- 2026-09-01 — BÊTA menu, gros lot :
  * POCHE : titre remonté tout en haut (#launch-screen justify flex-start, padding-top 7vh,
    gap titre/boutons 13vh). Boutons dans le PLATEAU encadré (comme le large). Boutons espacés (gap 20-32).
  * LARGE : gap boutons 40-100px (bien plus), plateau padding +, titre à 15vh.
  * corner-beta SUPPRIMÉ. corner-social ajouté (Discord + Patreon, 26px, bas-gauche).
    LIENS à remplir dans shell.js (LINKS.discord / LINKS.patreon) -> sinon toast "bientôt".
  * beta/js/patch.js (NEW) : module Patch. Patch notes = contenu + compare APP_VERSION à la
    dernière version connue (window.LATEST_VERSION > champ news.version si en ligne > APP_VERSION).
    Pas à jour -> bouton "Mettre à jour" (ouvre le site). À jour -> "Vous êtes déjà à jour".
    Patch.autoShow() = 1x/session à l'arrivée dans le hub. Bouton "Patch notes" -> Patch.open().
  * app.js boot() : plus de News.check() au lancement casino (déplacé -> hub). news.js : garde bêta.
  ! Reste : Eve doit fournir invitation Discord + URL Patreon.

- 2026-09-01 — BÊTA menu : icônes Discord/Patreon agrandies (26->38px, svg 21px).
  Pocket : titre en position absolute top ~9vh (descendu un poil), les 3 boutons
  CENTRÉS verticalement (#launch-screen justify-content:center). Large : .title-wrap
  repasse en static.

- 2026-09-01 — BÊTA menu poche, d'après maquette Eve (rectangles rouges) :
  titre descendu dans le tiers haut (.title-wrap top 17vh), GROS plateau de boutons
  (width min(86vw,440px), padding 5.5vh, gap 4vh, boutons plus gros font 1-1.35rem)
  centré dans la moitié basse (#launch-screen padding 28vh/6vh). Discord/Patreon
  bas-gauche + patch notes bas-droite + version haut-droite inchangés.
- 2026-09-01 — BÊTA menu poche (maquette Eve v2) : plateau plus SOLIDE (fond rgba(9,3,8,.74), blur 4), boutons box-sizing border-box + width 100% (fini le débordement) et plus HAUTS (padding vertical ~3vh, font 1.05-1.4rem), gap resserré 16-28px. width tray min(85vw,410px). #launch-screen padding-top 26vh. large: .chunk-btn width auto.
- 2026-09-01 — BÊTA menu poche v3 (Eve : boudin -> rectangle + titre XXL) : plateau ÉTROIT
  (width min(62vw,300px), radius 16, boutons plus hauts padding ~3.8vh) = rectangle vertical.
  Titre XXL : font min(15vw,9.5rem), nowrap, carte réduite, stroke +. .title-wrap top 15vh padding 8px.
- 2026-09-01 — BÊTA menu poche v4 (tray taille OK, boutons trop gros, titre + gros) :
  boutons FINS (padding 1.9vh), tray garde son rectangle via min-height min(52vh,384px)
  + justify-content space-evenly (boutons aérés dans le cadre fixe). Titre min(16.5vw,11rem),
  letter-spacing -.045em, carte .6em. large: min-height 0.
- 2026-09-01 — BÊTA : Eve valide le menu ! fenetre Electron elargie/raccourcie
  (beta/main.js : 480x1100 -> 740x1270) pour le cadrage voulu (moins de vide).
- 2026-09-01 — BOT (hors beta) : ensureChatRules() -> poste 1 embed "Petit rappel" (ne pas repeter, chattez ailleurs, messages inutiles supprimes 24h) dans salon 1543740706714030100 au demarrage, idempotent (bot_config key chat_rules). Deploy : npm run bot:deploy.
- 2026-09-01 — BÊTA menu 9/10 -> polish D.A. :
  * titre : remplissage DEGRADE dore + reflet qui balaie (title-shine 4.4s), relief 3D bloc
    (text-shadow empilee), "!" en accent plein orange, carte = A ROUGE + liseré or + gloss.
  * boutons : dégradé vertical + liseré clair inset (effet verre/touche), icone ▶/⚙/⏻ (data-icon),
    hover/active plus doux.
  * plein écran : fini le gros vide -> cluster centré (justify-content:center, gap 6vh, padding 6vh),
    titre + boutons + plateau plus gros.
- 2026-09-01 — BÊTA menu, retouches ciblées (Eve pilote) :
  * boutons : garde la D.A., fausse 3D (socle sombre 0 7px 0 + liseré clair discret inset
    + galbe bas), couleurs adoucies + très léger dégradé vertical.
  * titre : lettres découpées en spans, léger désaxage main (Balatro), slab dombre épais
    multi-couches, stroke + épais + paint-order. Fill reste crème plein (pas de gradient-clip).
  * plein écran : 3 cartes géantes floutées qui flottent sur les côtés (comblent le vide),
    padding landscape 13vh/11vh (un peu resserré).
- 2026-09-01 — BÊTA menu : cartes flottantes + visibles (transparence gardée, bord/fill/suit montés).
  +2 jetons à droite (fch-4/5), tous meme rotation. NOUVEAU fond : .bg-bars = 28 barres
  "bourse/stonks" (vert/rouge/or) qui montent-descendent en boucle desync, opacity .11,
  masque fondu vers le haut. reduced-motion géré.

- 2026-09-01 — BÊTA : refonte graphique du CASINO — 1re passe.
  * NOUVEAU beta/css/casino.css (chargé après style.css) — surcharge TOUT le visuel de #app :
    palette table de casino (feutrine verte, bois sombre, or, crème), topbar/menu/dock/multi-panel,
    stage = table encadrée liseré or, cartes redessinées (58x82, crème, filigrane centre via
    ::after + data-suit, dos rouge/crème), boutons unifiés (relief + or), betbar = "chip tray",
    jetons = bord pointillé façon poker, bannière résultat = plaque (or/rouge/neutre) animée.
    Animations : deal-in cartes, game-in, banner-in, refill-pop, sign-flicker.
  * beta/js/cards.js : cardEl ajoute data-suit (pour le filigrane CSS). SEULE modif JS.
  * INTACT : caisses CS, skins croupier, son/musique/répliques.
  ! 1re passe -> à valider sur Blackjack, puis étendre/affiner poker-slots-roulette.
- 2026-09-01 — BÊTA casino 2e passe : (1) mode xl = vrai plein écran (#app width 100%, .stage sans marge/radius, game-body centré max 1180). (2) machine à sous : plus de feutrine -> meuble bois/or, fronton lumineux animé, reels encadrés noir+or. (3) roulette : wheel cerclée or, bet-grid = table feutrine, bet-opt cellules vert/or (+ hooks is-red/is-black). (4) menu jeux : pilules "jeton" or au lieu des onglets texte. (5) cartes clamp(104-168px large) ~5x. (6) .speech compacte (flex 0 1 auto, max 260, .72rem).
- 2026-09-01 — BÊTA casino 3e passe : (4) bulle croupier = plaque bois+or compacte (fini Courier). (5+6) le DOCK du bas -> VOLET LATERAL droit (#dock-drawer, slide-in + scrim), ouvert par #btn-drawer (☰) place a droite de la barre menu ; menu des jeux cale a GAUCHE ; wiring dans app.js (setDrawer). (3) roulette : roue cerclee triple or, num-grid feutrine, cellules rouge/noir en relief, outside bets rouge/noir tagges (roulette.js: class bet-<type>). (7) machine a sous : meuble bois multi-degrade + levier lateral + payline doree + reflet verre. blackjack poche : cartes reduites + paddings compresses via @media max-aspect-ratio pour tenir sans scroll.
- 2026-09-01 — BÊTA casino 4e passe : (8) Discord/Google cliquables (liens fournis). (10) boutons launch : Jouer=rose Options=violet Quitter=rouge. (6) betbar refaite (ui.js) : retire +N et ±1 ; ↺ reset + bouton "inverser" (gomme SVG -> jetons retirent) en haut ; jetons 50k/100k/1M ajoutes ; betbar compacte max 620. (5) "Caisses" -> pilule dans la nav-bar (plus dans le volet), volet Machines placeholder supprime. (3) volet lateral sorti de #app (vrai plein ecran top:0 bottom:0), elargi 340, labels nowrap. (2) croupier+bulle compacts (fini le grand vide). (7) modales + section multi -> D.A. du hub (glass violet/cyan, shell-fade). (9) cartes/jetons du launch : index de coin + valeur de jeton.
  ! Roulette + machine a sous : redesign profond = prochaine passe dediee.
- 2026-09-01 — BÊTA casino 5e passe (fixes) : (3) volet = boutons flex:1 pleine hauteur (fini le vide), full width (max-width:96px de .dock-btn annule), layout colonne icone+label centre (fini le debordement). (2) blackjack+poker ecran>=640 : grid 2 colonnes, croupier ENORME sticky a droite (sprite jusqu a 290x560), bulle dessous, jeu (titre/cartes/boutons) cale a GAUCHE. (9) cartes launch : taille reduite (max 168), 4 positions distinctes marges sures, dérive sans translate horizontal (plus hors champ / plus clustered), jetons inchanges.
- 2026-09-01 — BÊTA casino fixes v2 : (3) volet parfait (Eve adore). (2) bj+poker : abandon du grid -> croupier position:absolute collé au bord DROIT (width 26vw, sprite 100%), game-body flex-column align-items:flex-start + padding-right reserve, betbar/cartes/boutons/titre collés a GAUCHE (margin-right:auto). game-body max-width:none en xl. (9) cartes launch : 4 COINS (left/right 2%, top 9% / bottom 16%), taille reduite (max 140), drift mini -> IMPOSSIBLE hors cadre. (73) nav-bar : pilules jeux flex:1 1 0 -> remplissent toute la largeur (fini le vide), Caisses + ☰ a droite.
- 2026-09-01 — BÊTA casino fixes v3 (retour #74/#75/#76) : (2) bj+poker écran large : croupier position:absolute collé au bord droit MAIS pleine hauteur (top:0 bottom:0), figure flex:1, .croupier-img object-fit:contain + object-position:bottom center -> fini la tête coupée. game-body min-height:66vh + align-items:stretch, .hand-row flex:1 (la table remplit le vide vertical), enfants width:100% collés à gauche jusqu'au croupier, cartes bj/poker agrandies clamp(76-150px). (74) nav-bar : bouton RECORD (pilule leaderboard) retiré de ORDER -> "Caisses" devient une grosse pilule flex:1 à côté de Roulette, "Records" -> petit bouton carré #nav-records (icône coupe) à gauche du ☰, wiring app.js select('leaderboard') + is-active. (76) cartes launch : les 4 cartes de base retirées, 10 cartes en 2 colonnes bord gauche/droite (.fp-1..10, marges fixes % -> jamais hors cadre), + éventail central de 5 cartes (.fan) pour le "carré noir" de la maquette. build 22:02.
- 2026-09-01 — BÊTA casino fixes v4 (retour #77/#78/#79/#80) : (A) BULLE DE DIALOGUE réparée : le conteneur .croupier héritait flex-wrap:wrap -> en colonne à hauteur contrainte la bulle passait dans une 2e colonne hors écran. Ajout flex-wrap:nowrap + speech flex:0 0 auto min-height:2.6em. (B.1) blackjack : boutons Tirer/Rester/Doubler/Nouvelle main centrés sous les cartes (.game-body align-items:center, .controls align-self:center). Taille des cartes conservée (clamp 84-132). (B.2) poker : cartes plus petites (clamp 68-112) + centrées ; bouton Tirer centré. (B.2 bis) tableau des gains ILLUSTRÉ : chaque main affiche des mini-cartes (ILLUS map + miniHand() dans poker.js), séparateur '|' entre les groupes (paires), cartes non-comptées grisées. CSS .pg-mini/.mini-card 15x21px. (C) barre de mise étirée pleine largeur jusqu'au croupier (betbar width:100% max-width:none align-self:stretch). (80) nav-bar : .menu en display:contents -> les 4 jeux + Caisses partagent le MÊME flex, toutes les pilules à taille égale (fini Caisses géant). (76) menu launch : TOUTES les cartes des côtés retirées, gardé UNIQUEMENT les jetons -> 12 jetons écartés tout autour du bord (jamais au centre), même anim ch-spin décalée. Éventail central .fan intact (Eve adore).
- 2026-09-01 — BÊTA casino fixes v5 (retour #82/#83) : (A) betbar étirée : row1 (Mise + boutons) centrée, token-rack en space-evenly nowrap -> jetons répartis sur toute la largeur. (B) croupier resserré : width clamp(160-320) + padding-right clamp(170-340) (moins de vide), min-height game-body 74vh (croupier plus haut). (C) répliques croupier : .speech font-size .92rem, padding 11/14, line-height 1.4. (D.1) blackjack : cartes clamp(104-200px), game-body justify-content:space-between (remplit haut->bas), boutons .controls .btn padding 13/26 font 1rem. (D.2) poker : cartes clamp(96-184px), paytable -> panneau compact centré (max-width 600, fond sombre, radius 16), .pg-row en flex (nom 118px | mini-cartes | ×N poussé à droite), mini-cartes agrandies 21x30 (i 9px / u 12px). build en cours.
- 2026-09-01 — BÊTA casino fixes v6 (retour #84/#85, Eve à bout) : (1+2) croupier jusqu'en bas : .stage/.game/.game-body en flex:1 chaînés -> game-body remplit la fenêtre, croupier absolute bottom:0 touche le bas. (1) blackjack : betbar margin-bottom:auto + controls margin-top:auto -> barre de mise collée en haut, boutons en bas, cartes espacées au centre (fini "on étouffe"). (2) poker : hand-row margin-top clamp(22-68) pour aérer sous la barre de mise ; cartes clamp(110-208) "grossies à mort" ; tableau des gains -> bandeau LARGE horizontal, pills en flex-wrap centrées (2 lignes) au lieu du rectangle vertical, ancré en bas (margin:auto 0 4px). (3) BARRE DE MISE redessinée : plateau à jetons = en-tête laiton (Mise + boutons centrés, radius haut) + bac feutrine verte (jetons 46px centrés, ombre interne, radius bas), max-width 1000 centré. Plus de barre plate dégueu pleine largeur.
- 2026-09-01 — BÊTA casino fixes v7 (retour #86/#87 - Eve kiffe) : (A) blackjack croupier étiré : .croupier-img height:100% width:auto (au lieu de width:100% object-fit:contain qui letterboxait) -> le perso remplit toute la hauteur, tête au niveau du logo tenue, pieds fixes en bas (.croupier-sprite align-items:flex-end). Colonne élargie clamp(170-360). (B) poker : betbar margin-bottom:auto (comme blackjack) -> cartes bien aérées sous les jetons ; boutons Distribuer/Tirer agrandis (padding 14/34 font 1.05rem, appliqué blackjack+poker). (C) barre de mise : pas touchée (validée).
- 2026-09-01 — BÊTA casino fixes v8 (retour #88/#89) : (A) croupier bj+poker : .croupier-img transform:scale(1.15) origin bottom center + overflow:visible sur figure/sprite/stage -> la tête monte jusqu'à l'icône skin, pieds ~fixes. (B) poker : .controls margin-top clamp(14-46) -> Tirer descend sous les cartes. Cartes gardées : plus de contour jaune -> translateY(-16px) + ombre (survol -22/-24). Bug "le haut de la carte disparaît au survol" corrigé : .hand-row poker en écran large passe overflow:visible (au lieu de overflow-x:auto qui rognait le survol) + padding 34px en haut pour le soulèvement.
- 2026-09-02 — BÊTA casino fixes v9 : poker validé (on n'y touche plus). blackjack : le croupier dépassait la barre du haut -> scale de son sprite ramené à 1.03 (vs 1.15 pour la croupière poker qui, elle, est OK). Stage reste overflow:visible pour ne pas rogner le bras levé de la croupière.
- 2026-09-02 — BÊTA REFONTE ROULETTE + MACHINE À SOUS.
  ROULETTE (roulette.js + casino.css) : nouvelle roue canvas vue de dessus (400px, jante or, 37 secteurs propres rouge/noir/vert, frets dorés, numéros lisibles, cône argent, moyeu+tourelle qui tournent, bille qui spirale et rebondit, pointeur fixe, halo + secteur gagnant qui pulse à la victoire). Vrai tapis feutrine : 0 sur 3 rangs + 12 colonnes dans l'ordre réel (haut 3,6,9… / milieu 2,5,8… / bas 1,4,7…), rangée douzaines, rangée chances simples (1-18 PAIR ROUGE NOIR IMPAIR 19-36) en cases feutrine relief. Pastille "dernier résultat" colorée, ligne "ta mise". Layout : colonne en poche, roue à gauche (sticky) / tapis à droite ≥900px. Gros bouton "Lancer la bille".
  MACHINE À SOUS (slots.js + casino.css) : borne d'arcade — marquee spots qui défilent, fenêtre chromée sombre + reflet verre + payline lumineuse, levier latéral, sous-onglets laiton. Rouleaux classiques agrandis (fenêtre crème ~104px, symbole ~4rem), néon 88px (CELL synchro JS), tambours deluxe canvas passés 372x176 / reelW 104. Plateau à jetons (même style que blackjack/poker) étendu à roulette + machines.
- 2026-09-02 — BÊTA roulette+slots v2 (retour Eve : "roulette INCROYABLE, machine à refaire").
  ROULETTE : design figé (validé). Ajout @media ≥900px : stage/game/game-body en flex:1 -> la roulette REMPLIT l'écran, roue min(46vw,46vh,660px), cellules/boutons/textes en clamp(vw/vh) proportionnels.
  MACHINE À SOUS refaite "vraie machine" (réf. image d'Eve) : caisson violet néon + double liseré or, halo violet qui respire, levier à boule violette. Fenêtre rouleaux = cadre or épais + barre de gain jaune + reflet verre. Machine "Classique" reconstruite : 3 rangs par rouleau (.fr-reel 324px / .fr-cell 108px, FCELL synchro JS), bande crème, cadre or, spin translateY décalé, symbole du milieu = ligne de gain (7️⃣ -> 💰). Bouton JOUER vert relief. Néon/Deluxe gardés, recolorés violet dans le même caisson.
- 2026-09-02 — BÊTA roulette+slots v3 (Eve : "toujours le même écran, où est le RESTE de la machine ?").
  ROULETTE : @media ≥900px encore agrandi -> roue min(50vw,86vh,820px), layout space-evenly full width (padding latéral), cellules min-height 7vh, boutons/textes clamp -> remplit le cadre rouge dessiné par Eve.
  MACHINE À SOUS refaite pour de vrai (slots.js restructuré) : nouvelle borne complète <div.slot-cabinet> = marquee "7 · EVELATRO · 7" avec spots qui défilent haut+bas, fenêtre rouleaux, <div.slot-console> intégrée (boîte MISE + gros bouton JOUER vert + boîte SOLDE, readouts synchro via syncReadouts/Bank.onChange), bac à jetons <div.slot-tray>, levier à boule violette sur le flanc, halo néon violet qui respire, pied posé au sol. Rouleau classique : symboles changés (🍒🔔🍇⭐💎 + "7" rouge stylé .fr-seven), .fr-cell 104px (FCELL synchro), glow radial derrière chaque symbole. betbar (jetons) reste sous la borne.
