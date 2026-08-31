# Bot Discord — EveLatro!

Branché en direct sur la base du jeu (Supabase).

### Commandes pour tout le monde
| Commande | Ce que ça montre |
|---|---|
| `/leaderboard` | Le top 10 des records |
| `/directe` | Les 12 dernières actions en jeu |

### Commandes admin (permission « Gérer le serveur »)
| Commande | Effet |
|---|---|
| `/auto-leaderboard on salon:#x reset:true` | Poste le classement dans `#x` **toutes les heures pile**. `reset:true` = vide le classement après (compétition d'1h). |
| `/auto-leaderboard off` | Arrête |
| `/auto-directe on salon:#x` | Un seul message dans `#x`, **rafraîchi tout seul toutes les 5 s** |
| `/auto-directe off` | Arrête (et supprime le message) |
| `/feed on salon:#x` | Poste **chaque action** (date / jeu / main / mise / gagné-perdu) dans `#x`, en temps réel |
| `/feed off` | Arrête |
| `/news` | Ouvre un formulaire pour éditer le panneau **« Quoi de neuf ? »** qui s'affiche au lancement du jeu (titre, patch, « bientôt », images, bouton vers le site). Change la « version » pour le ré-afficher à tout le monde. |
| `/role-panel salon:#x` | (Re)poste le panneau **« eve weird shit »** : un embed avec une réaction 🎰. Cliquer la réaction donne le rôle `eve weird shit` (et débloque les salons liés) ; l'enlever retire le rôle. Posté par défaut dans `#eve-weird-shit`. Le bot doit avoir **Gérer les rôles** et son rôle au-dessus de `eve weird shit`. Config gardée dans `bot_config` (survit aux redéploiements). |

Les salons choisis sont gardés dans la table `bot_config` de Supabase → ça
**survit aux redéploiements Railway**.

Le panneau « Quoi de neuf ? » peut aussi être édité directement dans le
**Table Editor Supabase** (table `news`, une seule ligne).

---

## Installation (une fois)

### 1. Créer le bot
1. https://discord.com/developers/applications → **New Application** (ou ton appli existante `EveLatro`).
2. Onglet **Bot** → **Reset Token** → copie le token.
3. Onglet **Bot** → tu peux mettre `emilia.png` en **App Icon** ici (le plus simple),
   ou laisser le bot le faire tout seul (voir `SET_AVATAR` plus bas).
4. Onglet **OAuth2 → URL Generator** : coche `bot` **et** `applications.commands`,
   dans les permissions coche au minimum **Send Messages** + **Embed Links**,
   copie l'URL générée, ouvre-la, ajoute le bot à ton serveur.

### 2. Configurer
```
cd bot
copy .env.example .env      (ou cp sur Mac/Linux)
```
Puis ouvre `.env` et remplis :
- `DISCORD_TOKEN` — le token de l'étape 1
- `DISCORD_CLIENT_ID` — Application ID (déjà pré-rempli : 1542964139637477536)
- `DISCORD_GUILD_ID` — l'ID de ton serveur (clic droit sur le serveur → *Copier l'identifiant*,
  avec le **Mode développeur** activé dans les Réglages Discord). Optionnel mais recommandé
  (commandes visibles tout de suite au lieu de ~1h).
- `SUPABASE_KEY` — la clé **`service_role`** : Supabase → Project Settings → API →
  `service_role` `secret`. **Ne la mets nulle part d'autre, jamais.** Ici c'est côté
  serveur (le bot), donc c'est OK.
- `SITE_URL` — l'URL de ton site (sert de bouton « Mettre à jour » dans le panneau `/news`).
- `SET_AVATAR` — mets `1` **une seule fois** si tu veux que le bot prenne `emilia.png`
  comme photo de profil au démarrage, puis remets `0`.
- `LIVE_CHANNEL_ID` — (optionnel, ancien) remplacé par `/feed on salon:#x`. Laisse vide.

Sur **Railway** : mets ces mêmes variables dans l'onglet *Variables* du service,
et *Start command* = `node index.js`.

### 3. Lancer
```
npm install
node index.js
```
Toutes les commandes **s'enregistrent toutes seules** au démarrage
(instantané si `DISCORD_GUILD_ID` est rempli, sinon ~1h en global).

Regarde les logs au démarrage : tu dois voir
`✔ 6 commandes sur "<ton serveur>" : /leaderboard, /directe, ...`.
Si tu vois `✖ Échec ... Missing Access`, c'est que le bot a été invité **sans le
scope `applications.commands`** → réinvite-le avec le lien affiché juste en dessous
dans les logs (`ℹ Ré-inviter le bot : https://discord.com/api/oauth2/authorize?...`).
Pas besoin de le kick, juste ouvrir le lien et re-autoriser.

Tant que `node index.js` tourne (ou que Railway le fait tourner), le bot répond.

---

## Le laisser tourner 24/7 (gratuit)

Le bot est un simple script Node. Pour qu'il reste en ligne sans ton PC :

- **Railway** (railway.app) ou **Render** (render.com) : nouveau projet →
  connecte le dossier / ou "deploy from repo" → *Start command* : `node index.js` →
  ajoute les variables d'environnement du `.env` dans leur interface → deploy.
- Ou un petit VPS avec `pm2 start index.js`.

---

## Notes

- RLS Supabase : les policies `scores`/`activity` n'autorisent la lecture qu'aux
  utilisateurs connectés. La clé `service_role` **passe outre** — c'est pour ça
  qu'on l'utilise ici (et uniquement ici).
- Le flux ne se remplit que quand un joueur est **connecté à Discord dans le jeu**
  (sinon les actions restent locales à son appareil).
- Fichiers à ne jamais partager : `.env`, `node_modules/`.
