# Automatiser les mises en ligne d'EveLatro!

Avant, pour sortir une version tu faisais, à la main :
build → MediaFire → attendre l'upload → copier le lien → aller sur la page →
clic droit → copier l'URL → coller dans `index.html` → déposer sur Netlify →
`railway up`.

**Maintenant : une seule commande.**

```
npm run release
```

Elle fait TOUT, dans l'ordre :

| Étape | Ce qu'elle fait |
|---|---|
| 1. build | construit `www/`, le `.exe`, le `.zip` et l'`.apk` |
| 2. github | crée la "release" GitHub `v1.2` et y met le `.exe` + l'`.apk` → des **liens de téléchargement directs et permanents** (plus besoin de MediaFire) |
| 3. liens | écrit ces liens dans `site/index.html` (boutons Windows / Android) |
| 4. site | déploie le site sur **Cloudflare Pages** (`evelatro.pages.dev`) |
| 5. bot | déploie le bot sur **Railway** |

> **Pourquoi plus de MediaFire ?** MediaFire n'a pas de vraie commande, les liens
> changent, il faut cliquer partout. **GitHub Releases** donne un lien fixe du
> genre `https://github.com/toneCompte/evelatro/releases/download/v1.2/EveLatro.exe`
> — la commande le calcule toute seule et le colle dans le site. Zéro clic.

---

## Installation (UNE SEULE FOIS)

Ce sont des connexions que je (Claude) **ne peux pas faire à ta place** : elles
ouvrent ton navigateur et te demandent TES identifiants. Après, tout roule.

### 1. Mettre le projet sur GitHub

Dans `C:\Users\Eve\mon-premier-projet` :

```
git init
git add -A
git commit -m "EveLatro 1.2"
```

Puis crée un dépôt sur github.com (bouton **New** → nom `evelatro` → **Private** →
Create). GitHub t'affiche 2 lignes à copier, du genre :

```
git remote add origin https://github.com/TON-PSEUDO/evelatro.git
git push -u origin main
```

Colle-les. C'est fait.

### 2. GitHub CLI (`gh`)

Télécharge : https://cli.github.com → installe → puis :

```
gh auth login
```
(choisis : GitHub.com → HTTPS → oui pour git → Login with a web browser)

### 3. Cloudflare (le site)

```
npx wrangler login
```
→ navigateur → crée un compte Cloudflare gratuit → Autoriser.

> ⚠️ La branche de **production** du projet Pages s'appelle **`Evelatro`**
> (avec un E majuscule). Les scripts `npm run site:deploy` et `npm run release`
> l'utilisent déjà. Ne déploie jamais à la main sans `--branch=Evelatro`,
> sinon `evelatro.pages.dev` ne se met plus à jour (ça fait un "preview").

### 4. Railway (le bot)

```
railway login
```
(tu l'as sûrement déjà fait)

### 5. Android (pour construire l'`.apk`) — optionnel

Si `JAVA_HOME` / `ANDROID_HOME` ne sont pas déjà réglés, la commande saute
l'`.apk` et te le dit (le reste continue). Pour l'inclure, lance plutôt :

```
npm run apk        # construit juste l'apk quand tu veux
```

---

## Utilisation de tous les jours

### Sortir une nouvelle version

1. Ouvre `js/version.js`, change `1.2` → `1.3`
2. Ouvre `package.json`, change `"version": "1.2.0"` → `"1.3.0"`
3. Ouvre `android/app/build.gradle`, `versionName "1.2"` → `"1.3"` et `versionCode 3` → `4`
4. `npm run release`

*(je peux faire les étapes 1-3 pour toi en 10 secondes si tu me demandes)*

### Juste le site (petit changement de texte, image…)

```
npm run site:deploy
```

### Juste le bot

```
npm run bot:deploy
```

### Options de `npm run release`

```
npm run release -- --skip=bot            # tout sauf le bot
npm run release -- --only=site           # QUE le site
npm run release -- --skip=github,build   # re-déploie sans reconstruire
npm run release -- --notes="Nouveau: caisses CS:GO, anti-triche"
```

---

## Ce que MOI (Claude) je peux faire pour toi

Quand tu me le demandes dans une session, je peux :

- ✅ **lancer `npm run release`**, `npm run site:deploy`, `npm run bot:deploy`
- ✅ construire les `.exe` / `.apk`
- ✅ bumper les numéros de version partout
- ✅ modifier le site, le jeu, le bot, et redéployer
- ✅ lancer `gh release create` (une fois `gh` connecté)
- ✅ te lire les logs si un déploiement échoue et corriger

Ce que je **ne peux pas** faire (une seule fois, c'est toi) :

- ❌ me connecter à ta place à GitHub / Cloudflare / Railway (ça ouvre TON navigateur)
- ❌ cliquer dans le Dashboard Supabase (mais je te donne le SQL prêt à coller)
- ❌ créer le dépôt GitHub la première fois

Une fois les 4 connexions faites, dis-moi juste **« sors la 1.3 »** et je m'occupe
de tout.

---

## Rappel des adresses

| Quoi | Où |
|---|---|
| Site | https://evelatro.pages.dev |
| `.exe` / `.apk` | GitHub → onglet **Releases** de ton dépôt |
| Bot | Railway (dashboard) |
| Base de données | Supabase (dashboard) |
