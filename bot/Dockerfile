# Image de déploiement du bot Discord EveLatro (Render / n'importe quel hébergeur Docker).
# node:22-slim (Debian) : sharp installe ses binaires prébuilts sans souci, et
# @supabase/supabase-js exige Node 22+ (WebSocket natif pour realtime-js).
FROM node:22-slim

WORKDIR /app

# 1) dépendances (couche cachée tant que package*.json ne bouge pas)
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# 2) code du bot
COPY . .

ENV NODE_ENV=production
# Render injecte PORT ; index.js ouvre un petit serveur "je suis vivant" dessus.
EXPOSE 10000

CMD ["node", "index.js"]
