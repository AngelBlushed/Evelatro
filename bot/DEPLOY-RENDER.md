# Héberger le bot EveLatro sur Render (gratuit, sans carte bancaire)

Koyeb a fermé son offre d'hébergement (racheté par Mistral). Railway est devenu
payant. On migre sur **Render.com**.

- **Gratuit**, pas de carte bancaire.
- Se relie à GitHub, re-déploie tout seul à chaque `git push`.
- Utilise le `Dockerfile` déjà présent dans `bot/`.

Seule contrainte : sur l'offre gratuite, un service « s'endort » après 15 min
sans visite. On règle ça avec un petit pinger gratuit (UptimeRobot) qui réveille
le bot toutes les 5 min → il tourne 24/7.

---

## 1. Créer le service sur Render

1. https://render.com → **Get Started** → se connecter **avec GitHub**
   (compte **AngelBlushed**). Autoriser Render à voir le dépôt **Evelatro**.
2. Dashboard → **Add new** → **Web Service**.
3. Choisir le dépôt **AngelBlushed/Evelatro** → **Connect**.
4. Remplir le formulaire :
   - **Name** : `evelatro-bot`
   - **Region** : **Frankfurt**
   - **Branch** : `main`
   - **Root Directory** : `bot`
   - **Runtime / Language** : **Docker** (détecté automatiquement grâce au Dockerfile)
   - **Instance Type** : **Free**

## 2. Variables d'environnement

Plus bas dans le même formulaire, section **Environment Variables** →
**Add Environment Variable** pour chacune :

| Key | Value |
|-----|-------|
| `DISCORD_TOKEN` | *(le token du bot — voir plus bas)* |
| `SUPABASE_KEY`  | *(la clé service_role — voir plus bas)* |
| `SUPABASE_URL`  | `https://ayptnkxkzvntijgzcatx.supabase.co` |
| `DISCORD_GUILD_ID` | `1499380246674407586` |
| `SITE_URL` | `https://evelatro.pages.dev/` |
| `SET_AVATAR` | `0` |

Les deux valeurs secrètes sont dans `bot/.env` sur le PC d'Eve
(`DISCORD_TOKEN=` et `SUPABASE_KEY=`). Si le token est perdu : portail dev
Discord → l'application → **Bot** → **Reset Token**. Si la clé Supabase est
perdue : Supabase → Project Settings → **API** → **service_role**.

## 3. Déployer

**Create Web Service**. Premier build ~3-4 min. Dans l'onglet **Logs** :

```
health server :10000
Connecté : Evelatro! Bot#....
✔ N commandes sur "..." : /leaderboard, /directe, /crediter, ...
✔ bot_config : lecture + écriture OK.
```

Noter l'URL publique donnée par Render, du genre
`https://evelatro-bot.onrender.com`.

## 4. Empêcher la mise en veille (UptimeRobot)

1. https://uptimerobot.com → **Register** (gratuit, pas de carte).
2. **+ New monitor** :
   - **Monitor Type** : HTTP(s)
   - **Friendly Name** : `evelatro-bot`
   - **URL** : l'URL Render (`https://evelatro-bot.onrender.com`)
   - **Monitoring interval** : **5 minutes**
3. **Create monitor**. À partir de là, le bot ne dort plus.

## 5. Fermer Railway

Railway → projet `evelatro-bot` → **Settings** → **Delete service** (ou laisser
mourir, il ne tourne plus de toute façon).

---

## Redéploiements suivants

Rien à faire : quand le code du bot bouge et est poussé sur `main`, Render
rebuild tout seul.

## Dépannage

- **Build échoue sur `sharp`** : vérifier **Runtime = Docker** et
  **Root Directory = `bot`**.
- **Le bot redémarre en boucle / manque de mémoire** : l'offre Free donne
  512 Mo. Si ça coince, me le dire (on peut alléger le chargement de `sharp`).
- **Commandes Discord absentes** : re-inviter le bot avec le scope
  `applications.commands` (lien affiché dans les logs au démarrage).
- **Le bot répond lentement la 1re fois** : le monitor UptimeRobot n'est pas
  actif ou l'intervalle est > 15 min.
