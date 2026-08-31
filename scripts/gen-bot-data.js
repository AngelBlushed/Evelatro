/* Génère les fichiers de données AUTONOMES du bot à partir de ceux du jeu.
   À relancer si tu modifies js/croupier-lines.js ou js/cs-catalog.js :
       node scripts/gen-bot-data.js
   (Railway ne déploie que le dossier bot/, donc il ne peut pas lire js/.)  */

const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const R = p => fs.readFileSync(path.join(ROOT, p), 'utf8');
const W = (p, c) => { fs.writeFileSync(path.join(ROOT, p), c); console.log('écrit', p, (c.length / 1024 | 0) + ' Ko'); };

/* --- répliques --- */
const CROUPIER_LINES = (new Function('module', 'window', R('js/croupier-lines.js') + ';return CROUPIER_LINES;'))({ exports: {} }, undefined);
W('bot/croupier-lines.mjs',
  `/* AUTO-GÉNÉRÉ depuis js/croupier-lines.js — ne pas éditer.\n   Régénérer : node scripts/gen-bot-data.js */\n\n` +
  `export const CROUPIER_LINES = ${JSON.stringify(CROUPIER_LINES)};\n\n` +
  `const bags = {};\n` +
  `function fill(pool){ const a = pool.map((_,i)=>i); for(let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; } return a; }\n` +
  `export function pickLine(gender, skin, cat){\n` +
  `  const G = CROUPIER_LINES[gender] || {};\n` +
  `  const pool = (G[skin] && G[skin][cat]) || (G[0] && G[0][cat]) || null;\n` +
  `  if(!pool || !pool.length) return '';\n` +
  `  const key = gender + '.' + skin + '.' + cat;\n` +
  `  if(!bags[key] || !bags[key].length) bags[key] = fill(pool);\n` +
  `  return pool[bags[key].pop()];\n` +
  `}\n`);

/* --- caisses --- */
const CS = (new Function('module', 'window', R('js/cs-catalog.js') + ';return CS;'))({ exports: {} }, undefined);
W('bot/cs-catalog.mjs',
  `/* AUTO-GÉNÉRÉ depuis js/cs-catalog.js — ne pas éditer.\n   Régénérer : node scripts/gen-bot-data.js */\n\n` +
  `const RARITY = ${JSON.stringify(CS.RARITY)};\n` +
  `const RARITY_ORDER = ${JSON.stringify(CS.RARITY_ORDER)};\n` +
  `const WEARS = ${JSON.stringify(CS.WEARS)};\n` +
  `const crates = ${JSON.stringify(CS.crates)};\n\n` +
  `function crate(id){ return crates.find(c => c.id === id) || null; }\n` +
  `function pickWear(){ const t = WEARS.reduce((s,w)=>s+w.w,0); let r=Math.random()*t; for(const w of WEARS){ r-=w.w; if(r<=0) return w; } return WEARS[2]; }\n` +
  `function pickRarity(cr){ const p = RARITY_ORDER.filter(k => cr.skins.some(s=>s.rarity===k)); const w = p.map(k=>RARITY[k].odds); const t = w.reduce((a,b)=>a+b,0); let r=Math.random()*t; for(let i=0;i<p.length;i++){ r-=w[i]; if(r<=0) return p[i]; } return p[0]; }\n` +
  `function roll(id){\n` +
  `  const cr = crate(id); if(!cr) return null;\n` +
  `  const rarity = pickRarity(cr);\n` +
  `  const pool = cr.skins.filter(s => s.rarity === rarity);\n` +
  `  const base = pool[Math.floor(Math.random()*pool.length)];\n` +
  `  const wear = pickWear();\n` +
  `  const stat = Math.random() < 0.10;\n` +
  `  const price = Math.max(1, Math.round(base.price * wear.mult * (stat ? 1.6 : 1)));\n` +
  `  return { crate: cr.id, crateName: cr.name, weapon: base.weapon, name: base.name, rarity,\n` +
  `    wear: wear.s, wearName: wear.name, stat, price, rarityName: RARITY[rarity].name, color: RARITY[rarity].color };\n` +
  `}\n` +
  `export const CS = { RARITY, RARITY_ORDER, WEARS, crates, crate, roll };\n`);

console.log('OK');
