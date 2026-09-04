# Image de déploiement du bot Discord EveLatro (Koyeb / Fly / n'importe quel hébergeur Docker).
# node:20-slim (Debian) : sharp installe ses binaires prébuilts sans souci.
FROM node:20-slim

WORKDIR /app

# 1) dépendances (couche cachée tant que package*.json ne bouge pas)
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# 2) code du bot
COPY . .

ENV NODE_ENV=production
# Koyeb injecte PORT ; index.js ouvre un petit serveur "je suis vivant" dessus.
EXPOSE 8000

CMD ["node", "index.js"]
