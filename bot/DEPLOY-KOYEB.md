# Héberger le bot EveLatro sur Koyeb (gratuit, toujours allumé)

Railway (essai gratuit terminé) → on migre sur **Koyeb**. Offre gratuite : 1 service
qui reste allumé en continu, pas de carte bancaire, redéploiement auto à chaque
`git push`.

Le bot est dans le dossier `bot/` du dépôt `AngelBlushed/Evelatro`. Un `Dockerfile`
est déjà prêt : Koyeb n'a rien à deviner.

---

## 1. Relier GitHub à Koyeb

Le fait d'avoir créé le compte Koyeb avec Google **ne change rien** : GitHub se
relie séparément.

1. https://app.koyeb.com → en haut à droite, ton avatar → **Settings** → **GitHub**
   (ou, à la création du service, un bouton **Install GitHub app** apparaît).
2. **Install the Koyeb GitHub app** → choisis le compte **AngelBlushed** → autorise
   soit *tous les dépôts*, soit juste **Evelatro**.

## 2. Créer le service

1. Dashboard Koyeb → **Create Service** → **GitHub**.
2. Repository : **AngelBlushed/Evelatro** · Branch : **main**.
3. **Builder** : choisir **Dockerfile**.
   - **Work directory** (ou "Context") : `bot`
   - **Dockerfile location** : `bot/Dockerfile`  *(si un seul champ, mets `bot`)*
4. **Instance** : **Free** (Nano).
5. **Region** : **Frankfurt** (le plus proche).
6. **Ports** : `8000`, protocole `HTTP` (le bot ouvre un mini serveur "je suis
   vivant" dessus pour le health-check).
7. **Health check** : laisser par défaut (TCP sur 8000).
8. **Service name** : `evelatro-bot`.

## 3. Variables d'environnement

Dans la config du service → section **Environment variables** → ajouter :

| Nom | Valeur | Secret ? |
|-----|--------|----------|
| `DISCORD_TOKEN` | *(copier depuis Railway → evelatro-bot → Variables, ou le portail dev Discord)* | ✅ oui |
| `SUPABASE_KEY` | *(la clé **service_role** — Supabase → Project Settings → API, ou depuis Railway)* | ✅ oui |
| `SUPABASE_URL` | `https://ayptnkxkzvntijgzcatx.supabase.co` | non |
| `DISCORD_GUILD_ID` | `1499380246674407586` | non |
| `SITE_URL` | `https://evelatro.pages.dev/` | non |
| `SET_AVATAR` | `0` | non |

> Les deux valeurs "secret" sont les mêmes qu'aujourd'hui sur Railway
> (onglet **Variables**, icône œil pour révéler / copier). Ne les colle nulle part
> ailleurs.

## 4. Déployer

**Deploy**. Au premier build (~2-3 min) les logs doivent afficher :

```
health server :8000
Connecté : Evelatro! Bot#....
✔ N commandes sur "Purgatory On Cd" : /leaderboard, /directe, /crediter, ...
✔ bot_config : lecture + écriture OK.
```

Si oui → c'est bon, le bot est en ligne 24/7. Tester `/leaderboard` dans Discord.

## 5. Éteindre Railway

Une fois Koyeb OK : Railway → projet **evelatro-bot** → Settings → **Delete service**
(sinon il reste "Failed" sans rien faire).

---

## Redéploiements suivants

Plus besoin de `railway up`. Quand le code du bot change et est poussé sur `main`,
Koyeb rebuild tout seul. (Claude fera : `git push`, et Koyeb suit.)

## Dépannage

- **Build échoue sur `sharp`** : vérifier que le Builder est bien **Dockerfile**
  (pas Buildpack) et Work directory = `bot`.
- **"unhealthy" / redémarre en boucle** : le port exposé doit être **8000** en
  **HTTP**. Vérifier aussi que `DISCORD_TOKEN` est correct (le bot quitte au
  démarrage s'il manque un secret : log `Il manque DISCORD_TOKEN...`).
- **Commandes Discord absentes** : re-inviter le bot avec le scope
  `applications.commands` (lien loggé au démarrage).
