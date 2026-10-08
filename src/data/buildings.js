// Définition des bâtiments.
// prod: production / heure au niveau 1 (évolue avec le niveau)
// convert: chaîne de transformation { in: {res: qté/h}, out: {res: qté/h} } au niveau 1
// adj: bonus d'adjacence [{ near: terrain|bâtiment, bonus, per? }] (8 voisins)
// place: contrainte de placement (ex: doit toucher la rivière)
// maxCount(th): nombre max selon le niveau de l'hôtel de ville
// grid:false → bâtiment de fortification hors grille

export const BUILDING_CATEGORIES = {
  core: 'Centre',
  resource: 'Ressources',
  food: 'Agriculture',
  industry: 'Artisanat & chaînes',
  military: 'Militaire',
  civic: 'Civil & savoir',
  unique: 'Merveilles',
};

const N = (n) => () => n;

export const BUILDINGS = {
  townhall: {
    name: 'Hôtel de ville', icon: '🏛️', cat: 'core', unique: true, maxLevel: 25,
    desc: 'Cœur du royaume. Son niveau limite celui des autres bâtiments et débloque de nouvelles constructions.',
    cost: { wood: 200, stone: 200, gold: 50 }, time: 30, prod: { gold: 30 },
    effects: (lvl) => ({ storage: lvl * 250 }),
    maxCount: N(1),
  },
  castle: {
    name: 'Donjon', icon: '🏰', cat: 'core', unique: true, maxLevel: 20, req: { townhall: 3 },
    desc: 'Siège du pouvoir militaire. Augmente le nombre de marches simultanées et la défense de la ville.',
    cost: { wood: 400, stone: 600, iron: 100 }, time: 90,
    effects: (lvl) => ({ 'city.def': lvl * 0.04, marches: Math.floor(lvl / 3) + 1, heroSlots: Math.floor(lvl / 4) }),
    maxCount: N(1),
  },

  sawmill: {
    name: 'Scierie', icon: '🪓', cat: 'resource', maxLevel: 25,
    desc: 'Produit du bois. +15% près d’une forêt.',
    cost: { wood: 50, stone: 30 }, time: 10, prod: { wood: 90 },
    adj: [{ near: 'forest', bonus: 0.15 }],
    maxCount: (th) => 2 + Math.floor(th / 3),
  },
  quarry: {
    name: 'Carrière', icon: '⛏️', cat: 'resource', maxLevel: 25,
    desc: 'Extrait de la pierre. +15% près d’une montagne.',
    cost: { wood: 60, stone: 20 }, time: 12, prod: { stone: 75 },
    adj: [{ near: 'mountain', bonus: 0.15 }],
    maxCount: (th) => 2 + Math.floor(th / 3),
  },
  mine: {
    name: 'Mine de fer', icon: '⚒️', cat: 'resource', maxLevel: 25, req: { townhall: 2 },
    desc: 'Extrait du fer. +15% près d’une montagne.',
    cost: { wood: 120, stone: 80 }, time: 20, prod: { iron: 40 },
    adj: [{ near: 'mountain', bonus: 0.15 }],
    maxCount: (th) => 1 + Math.floor(th / 3),
  },
  charcoal: {
    name: 'Charbonnière', icon: '🔥', cat: 'industry', maxLevel: 20, req: { townhall: 3 },
    desc: 'Transforme le bois en charbon. +10% près d’une forêt.',
    cost: { wood: 150, stone: 120 }, time: 30,
    convert: { in: { wood: 40 }, out: { coal: 14 } },
    adj: [{ near: 'forest', bonus: 0.1 }],
    maxCount: (th) => 1 + Math.floor(th / 5),
  },
  house: {
    name: 'Maisons', icon: '🏠', cat: 'civic', maxLevel: 25,
    desc: 'Les habitants paient l’impôt. +5% par marché ou taverne voisin.',
    cost: { wood: 80, stone: 40 }, time: 12, prod: { gold: 25 },
    adj: [{ near: 'market', bonus: 0.05, per: true }, { near: 'tavern', bonus: 0.05, per: true }],
    maxCount: (th) => 2 + Math.floor(th / 2),
  },

  farm: {
    name: 'Ferme', icon: '🌾', cat: 'food', maxLevel: 25,
    desc: 'Champs produisant nourriture et blé. +10% près de la rivière, +3% par ferme voisine (max 9%).',
    cost: { wood: 60, stone: 10 }, time: 10, prod: { food: 80, grain: 25 },
    adj: [{ near: 'river', bonus: 0.1 }, { near: 'farm', bonus: 0.03, per: true, max: 0.09 }],
    maxCount: (th) => 2 + Math.floor(th / 2),
  },
  pasture: {
    name: 'Élevage', icon: '🐑', cat: 'food', maxLevel: 20, req: { townhall: 2 },
    desc: 'Moutons et bœufs : nourriture, laine et peaux. +8% près d’une ferme.',
    cost: { wood: 120, stone: 40, food: 80 }, time: 25, prod: { food: 40, wool: 16, hides: 10 },
    adj: [{ near: 'farm', bonus: 0.08 }],
    maxCount: (th) => 1 + Math.floor(th / 4),
  },
  fishery: {
    name: 'Pêcherie', icon: '🎣', cat: 'food', maxLevel: 20, req: { townhall: 2 },
    desc: 'Doit être construite au bord de la rivière. Grosse production de nourriture.',
    cost: { wood: 100, stone: 30 }, time: 20, prod: { food: 130 },
    place: 'river',
    maxCount: (th) => 1 + Math.floor(th / 4),
  },
  orchard: {
    name: 'Verger', icon: '🍎', cat: 'food', maxLevel: 20, req: { townhall: 3 },
    desc: 'Fruits et herbes aromatiques. +10% près de la rivière.',
    cost: { wood: 150, stone: 30, food: 50 }, time: 30, prod: { food: 50, herbs: 8 },
    adj: [{ near: 'river', bonus: 0.1 }],
    maxCount: (th) => 1 + Math.floor(th / 5),
  },
  hunter: {
    name: 'Pavillon de chasse', icon: '🏹', cat: 'food', maxLevel: 20, req: { townhall: 2 },
    desc: 'Gibier et peaux. +20% près d’une forêt.',
    cost: { wood: 90, stone: 20 }, time: 18, prod: { food: 35, hides: 14 },
    adj: [{ near: 'forest', bonus: 0.2 }],
    maxCount: (th) => 1 + Math.floor(th / 4),
  },
  herbalist: {
    name: 'Herboristerie', icon: '🌿', cat: 'food', maxLevel: 20, req: { townhall: 3 },
    desc: 'Cultive des herbes médicinales. +10% près d’une forêt ou de la rivière.',
    cost: { wood: 140, stone: 60, gold: 40 }, time: 30, prod: { herbs: 18 },
    adj: [{ near: 'forest', bonus: 0.1 }, { near: 'river', bonus: 0.1 }],
    maxCount: (th) => 1 + Math.floor(th / 5),
  },

  mill: {
    name: 'Moulin', icon: '🌀', cat: 'industry', maxLevel: 20, req: { townhall: 2 },
    desc: 'Blé → farine. +20% près de la rivière (moulin à eau), +10% près d’une ferme.',
    cost: { wood: 140, stone: 80 }, time: 25,
    convert: { in: { grain: 30 }, out: { flour: 20 } },
    adj: [{ near: 'river', bonus: 0.2 }, { near: 'farm', bonus: 0.1 }],
    maxCount: (th) => 1 + Math.floor(th / 5),
  },
  bakery: {
    name: 'Boulangerie', icon: '🍞', cat: 'industry', maxLevel: 20, req: { townhall: 3 },
    desc: 'Farine → pain. Le pain ravitaille les armées (+moral). +10% près d’un moulin.',
    cost: { wood: 120, stone: 120 }, time: 30,
    convert: { in: { flour: 20, wood: 5 }, out: { bread: 14 } },
    adj: [{ near: 'mill', bonus: 0.1 }],
    maxCount: (th) => 1 + Math.floor(th / 6),
  },
  foundry: {
    name: 'Fonderie', icon: '🏭', cat: 'industry', maxLevel: 20, req: { townhall: 4 },
    desc: 'Fer + charbon → acier. +10% près d’une mine ou d’une charbonnière.',
    cost: { wood: 200, stone: 300, iron: 100 }, time: 60,
    convert: { in: { iron: 24, coal: 10 }, out: { steel: 9 } },
    adj: [{ near: 'mine', bonus: 0.1 }, { near: 'charcoal', bonus: 0.1 }],
    maxCount: (th) => 1 + Math.floor(th / 6),
  },
  tannery: {
    name: 'Tannerie', icon: '🧶', cat: 'industry', maxLevel: 20, req: { townhall: 3 },
    desc: 'Peaux → cuir. +10% près de la rivière.',
    cost: { wood: 140, stone: 60 }, time: 30,
    convert: { in: { hides: 16 }, out: { leather: 9 } },
    adj: [{ near: 'river', bonus: 0.1 }],
    maxCount: (th) => 1 + Math.floor(th / 6),
  },
  weaver: {
    name: 'Tisserand', icon: '🧵', cat: 'industry', maxLevel: 20, req: { townhall: 4 },
    desc: 'Laine → tissu. +10% près d’un élevage.',
    cost: { wood: 160, stone: 80, gold: 60 }, time: 40,
    convert: { in: { wool: 18 }, out: { cloth: 9 } },
    adj: [{ near: 'pasture', bonus: 0.1 }],
    maxCount: (th) => 1 + Math.floor(th / 6),
  },

  carpentry: {
    name: 'Menuiserie', icon: '🪚', cat: 'industry', maxLevel: 20, req: { townhall: 3 },
    desc: 'Chaîne configurable : bois → planches, ou planches + fer → charpente. +10% près d’une scierie.',
    cost: { wood: 200, stone: 100 }, time: 30,
    recipes: [
      { name: 'Planches', in: { wood: 40 }, out: { planks: 22 } },
      { name: 'Charpente', in: { planks: 24, iron: 6 }, out: { frames: 5 } },
    ],
    adj: [{ near: 'sawmill', bonus: 0.1 }],
    maxCount: (th) => 1 + Math.floor(th / 5),
  },
  armory: {
    name: 'Armurerie', icon: '🗡️', cat: 'industry', maxLevel: 20, req: { townhall: 5 },
    desc: 'Acier + planches → armes (troupes d’élite). +10% près d’une forge ou d’une fonderie.',
    cost: { wood: 300, stone: 300, iron: 200 }, time: 75,
    recipes: [
      { name: 'Armes', in: { steel: 6, planks: 4 }, out: { weapons: 4 } },
      { name: 'Armes de chasse', in: { planks: 8, leather: 3 }, out: { weapons: 3 } },
    ],
    adj: [{ near: 'forge', bonus: 0.1 }, { near: 'foundry', bonus: 0.1 }],
    maxCount: (th) => 1 + Math.floor(th / 8),
  },
  quartermaster: {
    name: 'Intendance militaire', icon: '🥫', cat: 'industry', maxLevel: 20, req: { townhall: 4 },
    desc: 'Pain + nourriture → rations (expéditions et armées). +10% près d’une boulangerie.',
    cost: { wood: 250, stone: 200, gold: 100 }, time: 50,
    recipes: [
      { name: 'Rations', in: { bread: 10, food: 20 }, out: { rations: 12 } },
      { name: 'Salaisons', in: { food: 50, hides: 4 }, out: { rations: 9 } },
    ],
    adj: [{ near: 'bakery', bonus: 0.1 }],
    maxCount: (th) => 1 + Math.floor(th / 8),
  },
  road: {
    name: 'Route pavée', icon: '🟫', cat: 'core', maxLevel: 1,
    desc: 'Les bâtiments voisins d’une route reliée à l’hôtel de ville gagnent +5% (logistique).',
    cost: { stone: 20, wood: 5 }, time: 2,
    maxCount: (th) => 8 + th * 4,
  },
  warehouse: {
    name: 'Entrepôt', icon: '📦', cat: 'core', maxLevel: 25,
    desc: 'Augmente la capacité de stockage et protège une partie des ressources des pillages.',
    cost: { wood: 100, stone: 60 }, time: 15,
    effects: (lvl) => ({ storage: Math.round(800 * lvl * Math.pow(1.22, lvl - 1)), protect: 0.05 * lvl }),
    maxCount: (th) => 1 + Math.floor(th / 4),
  },
  barracks: {
    name: 'Caserne', icon: '⚔️', cat: 'military', maxLevel: 20, req: { townhall: 2 },
    desc: 'Forme l’infanterie et les archers. Près du donjon ou de l’hôtel de ville (≤2 cases) : +10% vitesse et +3% défense.',
    cost: { wood: 150, stone: 100 }, time: 30,
    effects: (lvl) => ({ 'train.speed': 0.04 * (lvl - 1) }),
    near: { targets: ['castle', 'townhall'], range: 2, effects: { 'train.speed': 0.1, 'city.def': 0.03 } },
    maxCount: N(1),
  },
  stable: {
    name: 'Écurie', icon: '🐎', cat: 'military', maxLevel: 20, req: { townhall: 4 },
    desc: 'Forme la cavalerie. +10% vitesse de formation près d’un élevage.',
    cost: { wood: 250, stone: 150, food: 200 }, time: 60,
    effects: (lvl) => ({ 'train.speed': 0.03 * (lvl - 1) }),
    adjFx: { near: 'pasture', effects: { 'train.speed': 0.1 } },
    maxCount: N(1),
  },
  workshop: {
    name: 'Atelier', icon: '🛠️', cat: 'military', maxLevel: 20, req: { townhall: 5 },
    desc: 'Construit les machines de siège et forme les ingénieurs.',
    cost: { wood: 400, stone: 200, iron: 150 }, time: 90,
    effects: (lvl) => ({ 'train.speed': 0.03 * (lvl - 1) }),
    maxCount: N(1),
  },
  forge: {
    name: 'Forge', icon: '⚒️', cat: 'industry', maxLevel: 20, req: { townhall: 3 },
    desc: 'Fabrique et améliore l’équipement des héros. Le niveau augmente la qualité.',
    cost: { wood: 200, stone: 150, iron: 80 }, time: 45,
    maxCount: N(1),
  },
  laboratory: {
    name: 'Laboratoire', icon: '⚗️', cat: 'civic', maxLevel: 20, req: { townhall: 4 },
    desc: 'Distille des potions à partir d’herbes et de cristaux.',
    cost: { wood: 200, stone: 200, gold: 150 }, time: 60,
    maxCount: N(1),
  },
  market: {
    name: 'Marché', icon: '⚖️', cat: 'civic', maxLevel: 20, req: { townhall: 2 },
    desc: 'Achat/vente de ressources et caravanes. Chaque niveau réduit la taxe.',
    cost: { wood: 150, stone: 80, gold: 40 }, time: 30, prod: { gold: 10 },
    effects: (lvl) => ({ 'market.fee': -0.005 * lvl, caravans: 1 + Math.floor(lvl / 4) }),
    maxCount: N(1),
  },
  tavern: {
    name: 'Taverne', icon: '🍺', cat: 'civic', maxLevel: 20, req: { townhall: 2 },
    desc: 'Recrute des héros. Le niveau améliore la rareté des recrues et le nombre de héros.',
    cost: { wood: 180, stone: 60, food: 100 }, time: 30,
    effects: (lvl) => ({ heroSlots: 2 + Math.floor(lvl / 3) }),
    maxCount: N(1),
  },
  library: {
    name: 'Bibliothèque', icon: '📚', cat: 'civic', maxLevel: 20, req: { townhall: 2 },
    desc: 'Permet la recherche. Chaque niveau accélère les recherches de 5%.',
    cost: { wood: 160, stone: 140, gold: 60 }, time: 35,
    effects: (lvl) => ({ 'research.speed': 0.05 * lvl }),
    maxCount: N(1),
  },
  watchtower: {
    name: 'Tour de garde', icon: '🗼', cat: 'military', maxLevel: 20, req: { townhall: 2 },
    desc: 'Défense de la ville, vision sur la carte, alerte plus tôt des attaques.',
    cost: { wood: 120, stone: 150 }, time: 25,
    effects: (lvl) => ({ 'city.def': 0.02 * lvl, vision: 1 + Math.floor(lvl / 3) }),
    maxCount: (th) => 1 + Math.floor(th / 6),
  },
  guildhall: {
    name: 'Maison de guilde', icon: '🛡️', cat: 'civic', maxLevel: 15, req: { townhall: 4 },
    desc: 'Permet de rejoindre une guilde. Le niveau augmente l’efficacité des dons.',
    cost: { wood: 300, stone: 300, gold: 200 }, time: 60,
    maxCount: N(1),
  },
  port: {
    name: 'Port fluvial', icon: '⚓', cat: 'civic', maxLevel: 20, req: { townhall: 5 },
    desc: 'Doit toucher la rivière. Caravanes plus rapides, pêche et commerce.',
    cost: { wood: 500, stone: 250, cloth: 40 }, time: 90, prod: { food: 40, gold: 20 },
    place: 'river',
    effects: (lvl) => ({ 'caravan.speed': 0.05 * lvl, caravans: 1 }),
    maxCount: N(1),
  },

  // Fortifications (hors grille)
  wall: {
    name: 'Muraille', icon: '🧱', cat: 'military', grid: false, unique: true, maxLevel: 20, req: { townhall: 2 },
    desc: 'Bonus de défense des troupes en ville contre les raids.',
    cost: { stone: 300, wood: 100 }, time: 40,
    effects: (lvl) => ({ 'wall.bonus': 0.08 * lvl }),
    maxCount: N(1),
  },
  moat: {
    name: 'Douves', icon: '🌊', cat: 'military', grid: false, unique: true, maxLevel: 10, req: { townhall: 6 },
    desc: 'Ralentit les assaillants : réduit l’efficacité des béliers et de la cavalerie ennemie.',
    cost: { stone: 600, wood: 300, gold: 200 }, time: 120,
    effects: (lvl) => ({ 'wall.bonus': 0.04 * lvl, 'city.def': 0.02 * lvl }),
    maxCount: N(1),
  },

  // Merveilles / bâtiments uniques (endgame)
  sanctuary: {
    name: 'Sanctuaire des Cristaux', icon: '💠', cat: 'unique', unique: true, maxLevel: 10, req: { townhall: 10, tech: 'mag_resonance' },
    desc: 'Merveille. Produit des cristaux et augmente toute la production.',
    cost: { stone: 5000, crystals: 50, gems: 20, ancientWood: 30 }, time: 1800, prod: { crystals: 3 },
    effects: (lvl) => ({ 'prod.all': 0.02 * lvl }),
    maxCount: N(1),
  },
  observatory: {
    name: 'Grand Observatoire', icon: '🔭', cat: 'unique', unique: true, maxLevel: 10, req: { townhall: 8, tech: 'exp_cartography3' },
    desc: 'Merveille. Augmente la vision, la vitesse d’exploration et les trouvailles rares.',
    cost: { stone: 3000, wood: 3000, silver: 40, crystals: 20 }, time: 1200,
    effects: (lvl) => ({ vision: 2, 'explore.speed': 0.04 * lvl, 'loot.rare': 0.02 * lvl }),
    maxCount: N(1),
  },
};

export const COST_GROWTH = 1.55;
export const TIME_GROWTH = 1.5;
export const PROD_GROWTH = 1.16;

export function buildingCost(type, level) {
  const def = BUILDINGS[type];
  const mult = Math.pow(COST_GROWTH, level - 1);
  const out = {};
  for (const [r, v] of Object.entries(def.cost)) out[r] = Math.ceil(v * mult);
  // Coûts avancés à partir du niveau 6/10 (pour pousser vers les chaînes de production)
  if (level >= 6 && def.cat !== 'unique') out.iron = (out.iron || 0) + Math.ceil(20 * Math.pow(1.45, level - 6));
  if (level >= 10 && def.cat !== 'unique') out.steel = (out.steel || 0) + Math.ceil(10 * Math.pow(1.4, level - 10));
  if (level >= 15 && def.cat !== 'unique') out.rareOre = (out.rareOre || 0) + Math.ceil(2 * Math.pow(1.35, level - 15));
  return out;
}

export function buildingTime(type, level) {
  return BUILDINGS[type].time * Math.pow(TIME_GROWTH, level - 1) * 1000;
}

export function levelProdFactor(level) {
  return level <= 0 ? 0 : level * Math.pow(PROD_GROWTH, level - 1);
}
