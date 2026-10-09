// Unités. class: infantry | ranged | cavalry | siege | special | beast | undead | boss
// vs: multiplicateurs de dégâts contre une classe. pierce: ignore une part de la défense.
// upkeep: nourriture / heure par unité. gather: unités récoltées / minute. carry: capacité de transport.

export const UNIT_CLASSES = {
  infantry: { name: 'Infanterie', icon: '🛡️' },
  ranged: { name: 'Distance', icon: '🏹' },
  cavalry: { name: 'Cavalerie', icon: '🐎' },
  siege: { name: 'Siège', icon: '🏗️' },
  special: { name: 'Spéciale', icon: '✨' },
  beast: { name: 'Bête', icon: '🐺' },
  undead: { name: 'Mort-vivant', icon: '💀' },
  boss: { name: 'Colosse', icon: '🐉' },
};

export const UNITS = {
  // Infanterie
  spearman: {
    name: 'Lancier', icon: '🔱', class: 'infantry', building: 'barracks', bLevel: 1,
    atk: 8, def: 14, hp: 32, speed: 1.0, carry: 25, gather: 6, upkeep: 1,
    cost: { food: 30, wood: 25, iron: 5 }, time: 18,
    vs: { cavalry: 2.8, beast: 1.4 },
    desc: 'Mur de piques bon marché. Écrase la cavalerie.',
  },
  swordsman: {
    name: 'Épéiste', icon: '🗡️', class: 'infantry', building: 'barracks', bLevel: 2,
    atk: 15, def: 10, hp: 34, speed: 1.0, carry: 25, gather: 6, upkeep: 1,
    cost: { food: 40, iron: 20, wood: 10 }, time: 24,
    vs: { infantry: 1.4, siege: 1.6, undead: 1.2 },
    desc: 'Combattant polyvalent, efficace contre l’infanterie et les machines.',
  },
  heavy: {
    name: 'Soldat lourd', icon: '🛡️', class: 'infantry', building: 'barracks', bLevel: 5,
    atk: 17, def: 28, hp: 60, speed: 0.7, carry: 20, gather: 4, upkeep: 3,
    cost: { food: 70, iron: 30, steel: 8, weapons: 1 }, time: 55,
    vs: { infantry: 1.2 }, rangedResist: 0.35,
    desc: 'Encaisse les tirs (−35% dégâts à distance) mais consomme beaucoup de nourriture.',
  },
  // Distance
  archer: {
    name: 'Archer', icon: '🏹', class: 'ranged', building: 'barracks', bLevel: 1,
    atk: 15, def: 5, hp: 20, speed: 1.0, carry: 15, gather: 5, upkeep: 1,
    cost: { food: 25, wood: 45 }, time: 22,
    vs: { infantry: 1.5, beast: 1.3 },
    desc: 'Tire dès la première volée. Fort sur les collines, vulnérable à la cavalerie.',
  },
  crossbow: {
    name: 'Arbalétrier', icon: '🎯', class: 'ranged', building: 'barracks', bLevel: 4,
    atk: 22, def: 10, hp: 24, speed: 0.9, carry: 15, gather: 5, upkeep: 1.5,
    cost: { food: 35, wood: 30, iron: 15, weapons: 1 }, time: 35,
    vs: { infantry: 1.3, cavalry: 1.3 }, pierce: 0.35,
    desc: 'Carreaux perforants (ignorent 35% de la défense). Moins gêné par la pluie que l’archer.',
  },
  // Cavalerie
  lightcav: {
    name: 'Cavalier léger', icon: '🐎', class: 'cavalry', building: 'stable', bLevel: 1,
    atk: 16, def: 8, hp: 36, speed: 1.8, carry: 60, gather: 8, upkeep: 2,
    cost: { food: 60, wood: 20, iron: 15, leather: 5 }, time: 35,
    vs: { ranged: 1.8, siege: 2.0 },
    desc: 'Rapide, grande capacité de transport. Fond sur les archers.',
  },
  knight: {
    name: 'Chevalier', icon: '🏇', class: 'cavalry', building: 'stable', bLevel: 3,
    atk: 28, def: 20, hp: 62, speed: 1.4, carry: 40, gather: 6, upkeep: 3,
    cost: { food: 100, iron: 30, steel: 10, leather: 10, weapons: 1 }, time: 70,
    vs: { ranged: 1.6, infantry: 1.15 },
    desc: 'Charge dévastatrice dans les plaines.',
  },
  heavycav: {
    name: 'Cavalier lourd', icon: '🐴', class: 'cavalry', building: 'stable', bLevel: 6,
    atk: 34, def: 32, hp: 95, speed: 1.1, carry: 35, gather: 5, upkeep: 6,
    cost: { food: 160, steel: 30, leather: 20, iron: 20, weapons: 2 }, time: 120,
    vs: { infantry: 1.5, ranged: 1.5 },
    desc: 'Le marteau de l’armée. Très coûteux en nourriture.',
  },
  // Siège
  ram: {
    name: 'Bélier', icon: '🪵', class: 'siege', building: 'workshop', bLevel: 1,
    atk: 4, def: 12, hp: 90, speed: 0.5, carry: 0, gather: 0, upkeep: 2,
    cost: { wood: 120, iron: 30, frames: 2 }, time: 80, wallBreak: 0.012,
    desc: 'Réduit le bonus des murailles ennemies (−1,2% par bélier).',
  },
  catapult: {
    name: 'Catapulte', icon: '☄️', class: 'siege', building: 'workshop', bLevel: 3,
    atk: 32, def: 4, hp: 40, speed: 0.5, carry: 0, gather: 0, upkeep: 2, volley: true,
    cost: { wood: 150, stone: 150, iron: 40, frames: 4 }, time: 110, wallBreak: 0.006,
    vs: { infantry: 1.3, siege: 1.5 },
    desc: 'Tire pendant la volée initiale. Endommage les murailles.',
  },
  trebuchet: {
    name: 'Trébuchet', icon: '🏗️', class: 'siege', building: 'workshop', bLevel: 7,
    atk: 55, def: 4, hp: 55, speed: 0.4, carry: 0, gather: 0, upkeep: 3, volley: true,
    cost: { ancientWood: 4, steel: 20, stone: 200, frames: 8 }, time: 200, wallBreak: 0.01,
    vs: { infantry: 1.4, boss: 1.5 },
    desc: 'Artillerie lourde. Redoutable contre les colosses.',
  },
  // Spéciales
  scout: {
    name: 'Éclaireur', icon: '👁️', class: 'special', building: 'barracks', bLevel: 1,
    atk: 3, def: 3, hp: 14, speed: 2.6, carry: 10, gather: 2, upkeep: 0.5,
    cost: { food: 30, wood: 10, gold: 10 }, time: 15, explorer: true,
    desc: 'Explore la carte et révèle la composition ennemie.',
  },
  spy: {
    name: 'Espion', icon: '🕵️', class: 'special', building: 'barracks', bLevel: 3,
    atk: 2, def: 4, hp: 14, speed: 2.2, carry: 5, gather: 0, upkeep: 0.5,
    cost: { food: 40, gold: 60, cloth: 2 }, time: 40,
    desc: 'Missions d’espionnage contre les factions. En ville, démasque les espions ennemis.',
  },
  assassin: {
    name: 'Assassin', icon: '🥷', class: 'special', building: 'barracks', bLevel: 6,
    atk: 30, def: 4, hp: 16, speed: 1.6, carry: 10, gather: 1, upkeep: 2,
    cost: { food: 60, leather: 10, gold: 60, weapons: 1 }, time: 80,
    vs: { siege: 2.0, ranged: 1.3 }, moraleHit: 1.5,
    desc: 'Démoralise l’ennemi avant le combat (−1,5 moral par assassin, max −25).',
  },
  engineer: {
    name: 'Ingénieur', icon: '🔧', class: 'special', building: 'workshop', bLevel: 2,
    atk: 4, def: 6, hp: 22, speed: 0.9, carry: 30, gather: 10, upkeep: 1,
    cost: { food: 40, wood: 30, iron: 20, gold: 30 }, time: 45, wallBreak: 0.004,
    desc: 'Bâtit des retranchements (+0,5% défense chacun, max 20%) et renforce le siège.',
  },
  // --- Unités spéciales (Roue des Anciens, événements) : puissantes mais situationnelles, non recrutables ---
  royalChampion: {
    name: 'Chevalier royal', icon: '🏇', class: 'cavalry', building: 'stable', bLevel: 99, special: true,
    atk: 30, def: 24, hp: 66, speed: 1.4, carry: 40, gather: 4, upkeep: 3, cost: {}, time: 0,
    vs: { infantry: 1.3, cavalry: 1.2 }, desc: 'Héraut royal : polyvalent face à l’infanterie et à la cavalerie.',
  },
  imperialArcher: {
    name: 'Archer impérial', icon: '🏹', class: 'ranged', building: 'barracks', bLevel: 99, special: true,
    atk: 21, def: 9, hp: 24, speed: 1.0, carry: 15, gather: 4, upkeep: 1.5, cost: {}, time: 0,
    vs: { cavalry: 1.25, beast: 1.3 }, pierce: 0.45, desc: 'Flèches perforantes (−45 % de défense ennemie).',
  },
  celestialRider: {
    name: 'Cavalier céleste', icon: '🐎', class: 'cavalry', building: 'stable', bLevel: 99, special: true,
    atk: 24, def: 16, hp: 50, speed: 2.0, carry: 50, gather: 6, upkeep: 2.5, cost: {}, time: 0,
    vs: { ranged: 1.6, siege: 1.8 }, ignoreTerrain: true, desc: 'Ignore les malus de terrain et de météo.',
  },
  ancestralGuardian: {
    name: 'Gardien ancestral', icon: '🛡️', class: 'infantry', building: 'barracks', bLevel: 99, special: true,
    atk: 12, def: 34, hp: 80, speed: 0.7, carry: 20, gather: 3, upkeep: 2.5, cost: {}, time: 0,
    vs: { cavalry: 1.5 }, rangedResist: 0.5, desc: 'Rempart vivant : −50 % de dégâts à distance.',
  },
  steppeLancer: {
    name: 'Lancier des steppes', icon: '🐴', class: 'cavalry', building: 'stable', bLevel: 99, special: true,
    atk: 20, def: 12, hp: 42, speed: 1.9, carry: 70, gather: 8, upkeep: 2, cost: {}, time: 0,
    vs: { ranged: 1.7 }, desc: 'Cavalier nomade rallié (événement des Steppes).',
  },
};

// Unités ennemies (non recrutables)
export const ENEMY_UNITS = {
  bandit:      { name: 'Bandit', icon: '🪓', class: 'infantry', atk: 10, def: 7, hp: 28, vs: { ranged: 1.2 } },
  banditArcher:{ name: 'Archer bandit', icon: '🏹', class: 'ranged', atk: 12, def: 4, hp: 18, vs: { infantry: 1.3 } },
  banditRider: { name: 'Pillard monté', icon: '🐎', class: 'cavalry', atk: 15, def: 7, hp: 32, vs: { ranged: 1.6 } },
  wolf:        { name: 'Loup sinistre', icon: '🐺', class: 'beast', atk: 13, def: 5, hp: 26, vs: { ranged: 1.5 } },
  troll:       { name: 'Troll', icon: '👹', class: 'beast', atk: 40, def: 25, hp: 180, vs: { infantry: 1.3 } },
  spider:      { name: 'Araignée géante', icon: '🕷️', class: 'beast', atk: 18, def: 10, hp: 40, vs: { cavalry: 1.4 } },
  skeleton:    { name: 'Squelette', icon: '💀', class: 'undead', atk: 11, def: 12, hp: 30, rangedResist: 0.5 },
  wraith:      { name: 'Spectre', icon: '👻', class: 'undead', atk: 22, def: 8, hp: 34, vs: { infantry: 1.3 } },
  golem:       { name: 'Golem de pierre', icon: '🗿', class: 'beast', atk: 30, def: 45, hp: 260, rangedResist: 0.4 },
  militia:     { name: 'Milicien', icon: '🔱', class: 'infantry', atk: 9, def: 13, hp: 30, vs: { cavalry: 1.8 } },
  guard:       { name: 'Garde royal', icon: '💂', class: 'infantry', atk: 18, def: 22, hp: 50, vs: { cavalry: 1.4 } },
  royalArcher: { name: 'Archer royal', icon: '🏹', class: 'ranged', atk: 19, def: 8, hp: 24, vs: { infantry: 1.4 } },
  royalKnight: { name: 'Chevalier royal', icon: '🏇', class: 'cavalry', atk: 28, def: 20, hp: 60, vs: { ranged: 1.6 } },
  // Événements
  nomadRider:  { name: 'Cavalier nomade', icon: '🐎', class: 'cavalry', atk: 16, def: 8, hp: 34, vs: { ranged: 1.6 } },
  horseArcher: { name: 'Archer monté', icon: '🏹', class: 'ranged', atk: 15, def: 6, hp: 26, vs: { infantry: 1.3 } },
  nomadGuard:  { name: 'Garde de yourte', icon: '🛡️', class: 'infantry', atk: 11, def: 15, hp: 36, vs: { cavalry: 1.6 } },
  corsair:     { name: 'Corsaire', icon: '🏴‍☠️', class: 'infantry', atk: 15, def: 9, hp: 32, vs: { infantry: 1.2 } },
  gunner:      { name: 'Arquebusier', icon: '🎯', class: 'ranged', atk: 20, def: 6, hp: 22, pierce: 0.3 },
  frostGiant:  { name: 'Géant du givre', icon: '🧊', class: 'beast', atk: 45, def: 30, hp: 220, vs: { infantry: 1.2 } },
  iceWolf:     { name: 'Loup des glaces', icon: '🐺', class: 'beast', atk: 15, def: 7, hp: 30, vs: { ranged: 1.5 } },
  warden:      { name: 'Gardien des ruines', icon: '🗿', class: 'beast', atk: 26, def: 40, hp: 200, rangedResist: 0.4 },
  dragonling:  { name: 'Dragonnet', icon: '🦎', class: 'beast', atk: 24, def: 14, hp: 60, vs: { cavalry: 1.3 } },
  ghoul:       { name: 'Goule', icon: '🧟', class: 'undead', atk: 14, def: 8, hp: 34 },
  deathKnight: { name: 'Chevalier de la mort', icon: '💀', class: 'undead', atk: 30, def: 26, hp: 80, vs: { infantry: 1.2 } },
  magmaling:   { name: 'Élémentaire de magma', icon: '🔥', class: 'beast', atk: 28, def: 22, hp: 90, rangedResist: 0.3 },
  prospector:  { name: 'Prospecteur armé', icon: '⛏️', class: 'infantry', atk: 12, def: 12, hp: 34 },
  ancientSoldier: { name: 'Soldat des Anciens', icon: '⚔️', class: 'infantry', atk: 18, def: 20, hp: 48, vs: { cavalry: 1.3 } },
  // Boss
  khan:        { name: 'Khan des Steppes', icon: '👑', class: 'boss', atk: 420, def: 55, hp: 1, vs: { infantry: 1.3 } },
  seaCaptain:  { name: 'Capitaine Barbe-Noire', icon: '🦜', class: 'boss', atk: 380, def: 50, hp: 1, vs: { ranged: 1.3 } },
  giantKing:   { name: 'Roi des Géants', icon: '🏔️', class: 'boss', atk: 520, def: 80, hp: 1, vs: { infantry: 1.3 } },
  ruinKeeper:  { name: 'Gardien éternel', icon: '🗿', class: 'boss', atk: 450, def: 95, hp: 1, rangedResist: 0.4 },
  elderDragon: { name: 'Vorthak l’Ancien', icon: '🐲', class: 'boss', atk: 700, def: 70, hp: 1, vs: { cavalry: 1.5 } },
  warlord:     { name: 'Seigneur de guerre', icon: '⚔️', class: 'boss', atk: 450, def: 60, hp: 1 },
  goldBaron:   { name: 'Baron de l’Or', icon: '💰', class: 'boss', atk: 360, def: 60, hp: 1 },
  magmaLord:   { name: 'Seigneur de magma', icon: '🌋', class: 'boss', atk: 600, def: 75, hp: 1, rangedResist: 0.3 },
  boneKing:    { name: 'Roi des Os', icon: '☠️', class: 'boss', atk: 550, def: 65, hp: 1, vs: { infantry: 1.3 } },
  siegeMaster: { name: 'Maître de siège', icon: '🏗️', class: 'boss', atk: 500, def: 70, hp: 1 },
  dragon:      { name: 'Dragon de Cendre', icon: '🐉', class: 'boss', atk: 900, def: 60, hp: 1, vs: { cavalry: 1.5 }, rangedResist: 0.2 },
  giant:       { name: 'Géant des Collines', icon: '🗻', class: 'boss', atk: 700, def: 80, hp: 1, vs: { infantry: 1.4 } },
  banditKing:  { name: 'Roi des Bandits', icon: '👑', class: 'boss', atk: 500, def: 50, hp: 1, vs: { ranged: 1.4 } },
  crystalGolem:{ name: 'Golem de Cristal', icon: '💠', class: 'boss', atk: 650, def: 110, hp: 1, rangedResist: 0.5 },
  lichLord:    { name: 'Seigneur Mort-vivant', icon: '☠️', class: 'boss', atk: 800, def: 70, hp: 1, vs: { infantry: 1.3 }, rangedResist: 0.3 },
};

export const ALL_UNITS = { ...UNITS, ...ENEMY_UNITS };

// Formations choisies avant un combat
export const FORMATIONS = {
  balanced:  { name: 'Ligne équilibrée', icon: '⚖️', desc: 'Aucun bonus ni malus.', mods: {} },
  assault:   { name: 'Assaut', icon: '⚡', desc: '+15% attaque, −10% défense. Pour finir vite.', mods: { atk: 0.15, def: -0.1 } },
  shieldwall:{ name: 'Mur de boucliers', icon: '🛡️', desc: 'Infanterie +25% défense, distance −30% dégâts subis, −10% attaque.', mods: { atk: -0.1, classDef: { infantry: 0.25 }, protectRanged: 0.3 } },
  pincer:    { name: 'Tenaille', icon: '🦀', desc: 'Cavalerie +30% attaque si ≥25% de cavaliers, sinon −10% attaque.', mods: { pincer: true } },
  skirmish:  { name: 'Escarmouche', icon: '🎯', desc: 'Une volée supplémentaire, distance +15%, infanterie −10% attaque.', mods: { extraVolley: true, classAtk: { ranged: 0.15, infantry: -0.1 } } },
};

// Terrain : bonus par classe (attaque)
export const TERRAIN_COMBAT = {
  plain:    { name: 'Plaine', classAtk: { cavalry: 0.25 }, note: 'La cavalerie charge librement (+25%).' },
  forest:   { name: 'Forêt', classAtk: { cavalry: -0.3, ranged: -0.15, infantry: 0.1, beast: 0.15 }, note: 'Cavalerie −30%, tirs −15%, infanterie +10%.' },
  hills:    { name: 'Collines', classAtk: { ranged: 0.3, cavalry: -0.1 }, note: 'Les archers dominent depuis les hauteurs (+30%).' },
  mountain: { name: 'Montagne', classAtk: { cavalry: -0.4, infantry: 0.1, siege: -0.3 }, note: 'Cavalerie −40%, siège −30%.' },
  swamp:    { name: 'Marais', classAtk: { cavalry: -0.35, siege: -0.4 }, classDef: { infantry: -0.15 }, note: 'Tout s’enlise : cavalerie −35%, infanterie lourde gênée.' },
  river:    { name: 'Gué', classAtk: { cavalry: -0.2, ranged: 0.1 }, note: 'Traverser à gué ralentit la cavalerie.' },
  ruins:    { name: 'Ruines', classAtk: { ranged: 0.1, cavalry: -0.2, special: 0.25 }, note: 'Couverts : assassins et éclaireurs +25%.' },
  snow:     { name: 'Toundra', classAtk: { cavalry: -0.2 }, note: 'Cavalerie gênée par la neige.' },
  city:     { name: 'Cité', classAtk: { cavalry: -0.25, siege: 0.2 }, note: 'Combat de rue : cavalerie −25%, siège +20%.' },
};

export const WEATHER = {
  clear: { name: 'Dégagé', icon: '☀️', classAtk: {}, prod: {}, note: 'Aucun effet.' },
  rain:  { name: 'Pluie', icon: '🌧️', classAtk: { ranged: -0.25 }, unitAtk: { crossbow: 0.15 }, prod: { food: 0.1 }, note: 'Tirs −25% (arbalètes moins touchées). Cultures +10%.' },
  fog:   { name: 'Brouillard', icon: '🌫️', classAtk: { ranged: -0.3, special: 0.2 }, prod: {}, note: 'Tirs −30%, assassins +20%. Embuscades plus probables.' },
  storm: { name: 'Orage', icon: '⛈️', classAtk: { ranged: -0.35, cavalry: -0.1 }, prod: { wood: -0.1 }, note: 'Tirs −35%, cavalerie −10%.' },
  snow:  { name: 'Neige', icon: '❄️', classAtk: { cavalry: -0.2 }, prod: { food: -0.2 }, upkeep: 0.2, note: 'Cavalerie −20%, nourriture −20%, entretien +20%.' },
  heat:  { name: 'Canicule', icon: '🔥', classAtk: { infantry: -0.1 }, prod: { food: -0.1 }, upkeep: 0.1, note: 'Infanterie lourde fatiguée (−10%), entretien +10%.' },
};
