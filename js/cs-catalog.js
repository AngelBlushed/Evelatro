/* ===========================================================
   Catalogue des caisses "EveLatro" (inspiré CS:GO).

   Raretés (mon barème maison), du plus courant au plus rare :
     bleu   -> violet -> rose -> rouge -> or
   Chances d'ouverture (comme CS:GO) :
     bleu 79.92% · violet 15.98% · rose 3.2% · rouge 0.64% · or 0.26%

   Chaque skin : [rareté, arme, nom, prix de base en crédits]
   Le prix final au drop = prix de base × usure × (StatTrak ? 1.6).
   =========================================================== */

const CS = (() => {
  const RARITY = {
    bleu:   { key: 'bleu',   name: 'Rare',          color: '#4b69ff', odds: 0.7992 },
    violet: { key: 'violet', name: 'Mythique',      color: '#8847ff', odds: 0.1598 },
    rose:   { key: 'rose',   name: 'Légendaire',    color: '#d32ce6', odds: 0.0320 },
    rouge:  { key: 'rouge',  name: 'Ancestral',     color: '#eb4b4b', odds: 0.0064 },
    or:     { key: 'or',     name: 'Exceptionnel',  color: '#ffd700', odds: 0.0026 },
  };
  const RARITY_ORDER = ['bleu', 'violet', 'rose', 'rouge', 'or'];

  // usure : nom court, nom long, multiplicateur de prix, poids de tirage
  const WEARS = [
    { s: 'FN', name: 'Neuf',            mult: 1.00, w: 10 },
    { s: 'MW', name: 'Légères marques', mult: 0.78, w: 20 },
    { s: 'FT', name: 'Testé terrain',   mult: 0.55, w: 34 },
    { s: 'WW', name: 'Bien usé',        mult: 0.40, w: 22 },
    { s: 'BS', name: 'Vétéran',         mult: 0.28, w: 14 },
  ];
  const STATTRAK_CHANCE = 0.10;
  const STATTRAK_MULT = 1.6;

  // [rareté, arme, nom, prix]
  const CRATES = [
    { id: 'chroma', name: 'Caisse Chroma', price: 850, skins: [
      ['bleu', 'MP9', 'Poussière d\'étoiles', 90],
      ['bleu', 'SCAR-20', 'Grotto', 110],
      ['bleu', 'M249', 'Système solaire', 130],
      ['bleu', 'Sawed-Off', 'Serpent des mers', 150],
      ['bleu', 'P250', 'Muertos', 170],
      ['violet', 'MAC-10', 'Malachite', 480],
      ['violet', 'XM1014', 'Quicksilver', 620],
      ['violet', 'Desert Eagle', 'Naga', 900],
      ['rose', 'AK-47', 'Éclat de météorite', 2600],
      ['rose', 'M4A4', 'Zébrures', 2400],
      ['rouge', 'Galil AR', 'Chatoyant', 8200],
      ['or', 'Couteau papillon', 'Marbre déformé', 78000],
    ]},
    { id: 'spectrum', name: 'Caisse Spectrum', price: 1000, skins: [
      ['bleu', 'MP5-SD', 'Néon clair', 95],
      ['bleu', 'Five-SeveN', 'Capillaires', 120],
      ['bleu', 'SSG 08', 'Ombres bleues', 140],
      ['bleu', 'AUG', 'Triqueter', 160],
      ['bleu', 'Sawed-Off', 'Zander', 130],
      ['violet', 'USP-S', 'Néo-Noir', 720],
      ['violet', 'M4A1-S', 'Décimateur', 1100],
      ['violet', 'CZ75-Auto', 'Xiangliu', 520],
      ['rose', 'AK-47', 'Bloodsport', 3400],
      ['rose', 'AWP', 'Fièvre du néon', 3000],
      ['rouge', 'USP-S', 'Kill Confirmed', 12000],
      ['or', 'Karambit', 'Toile de doppler', 96000],
    ]},
    { id: 'prisma', name: 'Caisse Prisma', price: 780, skins: [
      ['bleu', 'P250', 'Verticale', 80],
      ['bleu', 'MP7', 'Impénétrable', 100],
      ['bleu', 'MAC-10', 'Ténèbres', 120],
      ['bleu', 'XM1014', 'Bruns quadrillés', 110],
      ['bleu', 'AUG', 'Momie', 150],
      ['violet', 'R8 Revolver', 'Écailles de la haine', 460],
      ['violet', 'Desert Eagle', 'Ligne de lumière', 780],
      ['violet', 'AK-47', 'L\'Empereur', 1500],
      ['rose', 'M4A4', 'La Route du Papillon', 2200],
      ['rose', 'AWP', 'Atheris', 1900],
      ['rouge', 'Vipère mortelle', 'Toxique', 7400],
      ['or', 'Couteau à lame courbe', 'Onyx noir', 62000],
    ]},
    { id: 'dangerzone', name: 'Caisse Zone de Danger', price: 720, skins: [
      ['bleu', 'MP9', 'Modest Threat', 85],
      ['bleu', 'Glock-18', 'Oxide Blaze', 130],
      ['bleu', 'Nova', 'Wild Six', 95],
      ['bleu', 'Tec-9', 'Fubar', 105],
      ['bleu', 'SG 553', 'Danger Close', 140],
      ['violet', 'P90', 'Nostalgie', 420],
      ['violet', 'MAC-10', 'Pipe Down', 500],
      ['violet', 'Desert Eagle', 'Mecha Industries', 1300],
      ['rose', 'AK-47', 'Asiimov', 4600],
      ['rose', 'MP5-SD', 'Phosphore', 900],
      ['rouge', 'AWP', 'Néo-Noir', 14000],
      ['or', 'Gants de sport', 'Pandora\'s Box', 88000],
    ]},
    { id: 'clutch', name: 'Caisse Clutch', price: 690, skins: [
      ['bleu', 'MP9', 'Black Sand', 80],
      ['bleu', 'P2000', 'Urban Hazard', 95],
      ['bleu', 'Negev', 'Lionfish', 90],
      ['bleu', 'PP-Bizon', 'Night Riot', 110],
      ['bleu', 'Five-SeveN', 'Flame Test', 120],
      ['violet', 'MP7', 'Bloodsport', 480],
      ['violet', 'UMP-45', 'Arctic Wolf', 380],
      ['violet', 'USP-S', 'Cortex', 640],
      ['rose', 'M4A4', 'Neo-Noir', 3200],
      ['rose', 'AK-47', 'Orbite Mk01', 2900],
      ['rouge', 'AWP', 'Mortis', 9800],
      ['or', 'Gants moto', 'Boom!', 72000],
    ]},
    { id: 'horizon', name: 'Caisse Horizon', price: 760, skins: [
      ['bleu', 'MAG-7', 'Monster Call', 85],
      ['bleu', 'MP7', 'Powercore', 95],
      ['bleu', 'Dual Berettas', 'Balance', 100],
      ['bleu', 'P250', 'Cyber Shell', 130],
      ['bleu', 'Nova', 'Plume', 90],
      ['violet', 'SG 553', 'Colony IV', 420],
      ['violet', 'Five-SeveN', 'Flame Test', 360],
      ['violet', 'Desert Eagle', 'Kumicho Dragon', 1400],
      ['rose', 'AK-47', 'Neon Rider', 5200],
      ['rose', 'M4A1-S', 'Nightmare', 2400],
      ['rouge', 'AWP', 'PAW', 8800],
      ['or', 'Couteau à cran d\'arrêt', 'Lore', 84000],
    ]},
    { id: 'gamma', name: 'Caisse Gamma', price: 880, skins: [
      ['bleu', 'SCAR-20', 'Bleu tempête', 90],
      ['bleu', 'P90', 'Chopper', 110],
      ['bleu', 'Tec-9', 'Bamboozle', 100],
      ['bleu', 'Sawed-Off', 'Limelight', 95],
      ['bleu', 'Five-SeveN', 'Violent Daimyo', 120],
      ['violet', 'AUG', 'Aristocrate', 440],
      ['violet', 'P250', 'Iron Clad', 380],
      ['violet', 'Glock-18', 'Wasteland Rebel', 900],
      ['rose', 'M4A1-S', 'Mécanisme', 3800],
      ['rose', 'AWP', 'Phobos', 2600],
      ['rouge', 'M4A4', 'Désolé de la mort', 11000],
      ['or', 'Bayonet', 'Doppler', 90000],
    ]},
    { id: 'glove', name: 'Caisse Glove', price: 1200, skins: [
      ['bleu', 'MP7', 'Cirrus', 95],
      ['bleu', 'Dual Berettas', 'Royal Consorts', 130],
      ['bleu', 'P2000', 'Turf', 90],
      ['bleu', 'SG 553', 'Aerial', 120],
      ['bleu', 'G3SG1', 'Stinger', 100],
      ['violet', 'USP-S', 'Cyrex', 700],
      ['violet', 'Glock-18', 'Ironwork', 520],
      ['violet', 'M4A4', 'Buzz Kill', 1600],
      ['rose', 'AWP', 'Vue éclatée', 4200],
      ['rose', 'SSG 08', 'Dragonfire', 2200],
      ['rouge', 'AK-47', 'Griffe de sorcière', 13000],
      ['or', 'Gants spécialistes', 'Crimson Kimono', 110000],
    ]},
    { id: 'huntsman', name: 'Caisse Huntsman', price: 640, skins: [
      ['bleu', 'MP9', 'Ruby Poison Dart', 85],
      ['bleu', 'P90', 'Module', 90],
      ['bleu', 'Dual Berettas', 'Retribution', 95],
      ['bleu', 'Sawed-Off', 'Highwayman', 110],
      ['bleu', 'USP-S', 'Torque', 130],
      ['violet', 'AK-47', 'Vulcan', 3600],
      ['violet', 'M4A4', 'Desert-Strike', 900],
      ['violet', 'SSG 08', 'Big Iron', 300],
      ['rose', 'M4A1-S', 'Atomic Alloy', 3000],
      ['rose', 'AWP', 'Corticera', 1400],
      ['rouge', 'AK-47', 'Feu Serpent', 22000],
      ['or', 'Couteau Huntsman', 'Tigre en cage', 68000],
    ]},
    { id: 'breakout', name: 'Caisse Breakout', price: 820, skins: [
      ['bleu', 'P90', 'Asiimov', 260],
      ['bleu', 'PP-Bizon', 'Osiris', 90],
      ['bleu', 'Negev', 'Desert-Strike', 85],
      ['bleu', 'SSG 08', 'Ghost Crusader', 130],
      ['bleu', 'CZ75-Auto', 'Tigris', 110],
      ['violet', 'Glock-18', 'Water Elemental', 700],
      ['violet', 'M4A1-S', 'Cyrex', 1100],
      ['violet', 'Five-SeveN', 'Fowl Play', 500],
      ['rose', 'M4A4', 'Griffon', 2000],
      ['rose', 'Desert Eagle', 'Conspiration', 1300],
      ['rouge', 'P90', 'Trigon', 6400],
      ['or', 'Couteau papillon', 'Poussière stellaire', 82000],
    ]},
    { id: 'phoenix', name: 'Caisse Phoenix', price: 700, skins: [
      ['bleu', 'SCAR-20', 'Crimson Web', 240],
      ['bleu', 'MAC-10', 'Heat', 110],
      ['bleu', 'Sawed-Off', 'The Kraken', 130],
      ['bleu', 'Negev', 'Terrain', 90],
      ['bleu', 'UMP-45', 'Corporal', 95],
      ['violet', 'AK-47', 'Redline', 3200],
      ['violet', 'P2000', 'Ocean Foam', 700],
      ['violet', 'Nova', 'Antique', 320],
      ['rose', 'AWP', 'Asiimov', 5800],
      ['rose', 'Five-SeveN', 'Nightshade', 900],
      ['rouge', 'USP-S', 'Serum', 15000],
      ['or', 'Karambit', 'Tigre en cage', 100000],
    ]},
    { id: 'winter', name: 'Caisse Offensive d\'Hiver', price: 750, skins: [
      ['bleu', 'M4A4', 'Faded Zebra', 100],
      ['bleu', 'PP-Bizon', 'Cobalt Halftone', 90],
      ['bleu', 'Five-SeveN', 'Kami', 110],
      ['bleu', 'Nova', 'Rising Skull', 120],
      ['bleu', 'MP9', 'Rose Iron', 95],
      ['violet', 'M4A1-S', 'Bright Water', 640],
      ['violet', 'FAMAS', 'Pulse', 500],
      ['violet', 'P90', 'Death by Kitty', 1200],
      ['rose', 'AWP', 'Redline', 4000],
      ['rose', 'M4A4', 'Asiimov', 3600],
      ['rouge', 'AWP', 'Fever Dream', 9000],
      ['or', 'Baïonnette M9', 'Marbre déformé', 92000],
    ]},
    { id: 'fracture', name: 'Caisse Fracture', price: 900, skins: [
      ['bleu', 'PP-Bizon', 'Photic Zone', 90],
      ['bleu', 'Galil AR', 'Connexion', 110],
      ['bleu', 'SSG 08', 'Perroquet mécanique', 140],
      ['bleu', 'Tec-9', 'Brother', 100],
      ['bleu', 'MP5-SD', 'Kitbash', 120],
      ['violet', 'Glock-18', 'Vogue', 620],
      ['violet', 'XM1014', 'Entombed', 400],
      ['violet', 'M4A4', 'Tooth Fairy', 900],
      ['rose', 'AK-47', 'Legion of Anubis', 3400],
      ['rose', 'Desert Eagle', 'Printstream', 4800],
      ['rouge', 'M4A4', 'Spider Lily', 6800],
      ['or', 'Gants pilote', 'Ombre marine', 74000],
    ]},
    { id: 'recoil', name: 'Caisse Recul', price: 800, skins: [
      ['bleu', 'P90', 'Vent Rush', 90],
      ['bleu', 'Dual Berettas', 'Melondrama', 110],
      ['bleu', 'SCAR-20', 'Fragments', 100],
      ['bleu', 'MAG-7', 'Insite', 95],
      ['bleu', 'MP9', 'Featherweight', 105],
      ['violet', 'USP-S', 'Printstream', 3800],
      ['violet', 'R8 Revolver', 'Crazy 8', 380],
      ['violet', 'UMP-45', 'Roadblock', 300],
      ['rose', 'AK-47', 'Ice Coaled', 2600],
      ['rose', 'M4A1-S', 'Night Terror', 2000],
      ['rouge', 'Dual Berettas', 'Flora Carnivora', 5200],
      ['or', 'Couteau à cran d\'arrêt', 'Impression fantôme', 66000],
    ]},
    { id: 'dreams', name: 'Caisse Rêves & Cauchemars', price: 950, skins: [
      ['bleu', 'MP9', 'Starlight Protector', 100],
      ['bleu', 'PP-Bizon', 'Space Cat', 110],
      ['bleu', 'MAC-10', 'Ensablé', 90],
      ['bleu', 'Five-SeveN', 'Scrawl', 105],
      ['bleu', 'G3SG1', 'Dream Glade', 95],
      ['violet', 'MP7', 'Abyssal Apparition', 520],
      ['violet', 'XM1014', 'Zombie Offensive', 440],
      ['violet', 'FAMAS', 'Rapacité', 700],
      ['rose', 'M4A1-S', 'Fantôme Assassin', 4200],
      ['rose', 'AK-47', 'Nightwish', 5600],
      ['rouge', 'AWP', 'Bulldozer des rêves', 12000],
      ['or', 'Karambit', 'Gemme bleue', 130000],
    ]},
  ];

  // met les objets sous une forme pratique { rarity, weapon, name, price }
  const crates = CRATES.map(c => ({
    id: c.id, name: c.name, price: c.price,
    skins: c.skins.map(([rarity, weapon, name, price]) => ({ rarity, weapon, name, price })),
  }));

  function crate(id) { return crates.find(c => c.id === id) || null; }

  function pickWear() {
    const total = WEARS.reduce((s, w) => s + w.w, 0);
    let r = Math.random() * total;
    for (const w of WEARS) { r -= w.w; if (r <= 0) return w; }
    return WEARS[2];
  }

  function pickRarity(cr) {
    // on ne tire que parmi les raretés présentes dans la caisse
    const present = RARITY_ORDER.filter(k => cr.skins.some(s => s.rarity === k));
    const weights = present.map(k => RARITY[k].odds);
    const total = weights.reduce((a, b) => a + b, 0);
    let r = Math.random() * total;
    for (let i = 0; i < present.length; i++) { r -= weights[i]; if (r <= 0) return present[i]; }
    return present[0];
  }

  // ouvre une caisse -> renvoie l'objet gagné
  function roll(crateId) {
    const cr = crate(crateId);
    if (!cr) return null;
    const rarity = pickRarity(cr);
    const pool = cr.skins.filter(s => s.rarity === rarity);
    const base = pool[Math.floor(Math.random() * pool.length)];
    const wear = pickWear();
    const stat = Math.random() < STATTRAK_CHANCE;
    const price = Math.max(1, Math.round(base.price * wear.mult * (stat ? STATTRAK_MULT : 1)));
    return {
      crate: cr.id, crateName: cr.name,
      weapon: base.weapon, name: base.name, rarity,
      wear: wear.s, wearName: wear.name, wearMult: wear.mult,
      stat, price, ts: Date.now(),
      color: RARITY[rarity].color,
      rarityName: RARITY[rarity].name,
      id: cr.id + ':' + base.weapon + ':' + base.name + ':' + wear.s + ':' + (stat ? 'ST' : 'x') + ':' + Math.random().toString(36).slice(2, 7),
    };
  }

  // une "bobine" d'objets aléatoires pour l'animation, avec le gagnant à la fin
  function reel(crateId, winner, length) {
    const cr = crate(crateId);
    const out = [];
    for (let i = 0; i < length; i++) {
      const rarity = pickRarity(cr);
      const pool = cr.skins.filter(s => s.rarity === rarity);
      const b = pool[Math.floor(Math.random() * pool.length)];
      out.push({ weapon: b.weapon, name: b.name, rarity, color: RARITY[rarity].color });
    }
    return out;
  }

  return { RARITY, RARITY_ORDER, WEARS, crates, crate, roll, reel };
})();

if (typeof window !== 'undefined') window.CS = CS;
if (typeof module !== 'undefined' && module.exports) module.exports = { CS };
