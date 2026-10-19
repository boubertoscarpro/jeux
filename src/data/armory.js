// v18 « L'Armurerie » : données de l'équipement des héros (valeur par rôle, châsses et gemmes taillées, ensembles,
// vente, démantèlement, transmutation, réforge). La logique est dans systems/armory.js.

// ───────── Valeur par rôle ─────────
// Un « point » vaut +1 % de l'effet principal du rôle. Les poids convertissent chaque modificateur (fraction : 0,03 = 3 %,
// ou valeur brute : moral) en points. Ils servent à comparer deux pièces POUR UN RÔLE, pas à afficher une puissance.
export const COMMAND_FOCUS = {
  war: {
    name: 'Guerre', icon: '⚔️', desc: 'raids, campagnes, sièges et défense',
    weights: { 'combat.atk': 100, 'combat.def': 100, 'combat.losses': -100, 'combat.morale': 0.5, 'class.cavalry.atk': 30, 'siege.power': 30, 'march.speed': 15, 'loot.rare': 50, carry: 5 },
  },
  gather: {
    name: 'Récolte', icon: '⛏️', desc: 'marches de récolte et ravitaillement',
    weights: { 'gather.all': 100, 'gather.iron': 35, 'gather.wood': 35, 'gather.stone': 35, carry: 50, 'march.speed': 40, 'loot.rare': 100, 'combat.def': 25, 'combat.atk': 15, 'combat.losses': -25 },
  },
  explore: {
    name: 'Exploration', icon: '🧭', desc: 'exploration, donjons et butin rare',
    weights: { 'explore.speed': 100, 'loot.rare': 300, 'march.speed': 40, 'explore.radius': 10, 'ambush.reduce': 30, 'gather.all': 30, carry: 20, 'combat.def': 20, 'combat.losses': -20, 'combat.atk': 10 },
  },
};
// Vocation par défaut d'un héros libre (commandant), selon sa classe
export const DEFAULT_FOCUS = { general: 'war', blacksmith: 'war', explorer: 'explore', alchemist: 'explore', farmer: 'gather', merchant: 'gather' };

// Intendant : les clés de son secteur valent plein tarif ; les autres productions s'appliquent aussi au royaume
// (un intendant porte ses bonus d'intendance partout), à moitié prix pour départager
export const GOVERNOR_WEIGHTS = {
  sector: 100, otherProd: 50, 'prod.all': 300, 'research.speed': 60, 'craft.quality': 40, 'craft.speed': 40, 'market.fee': -400,
};
// Effets permanents (contexte « royaume ») : comptent quel que soit le rôle
export const GLOBAL_WEIGHTS = {
  'combat.atk': 100, 'combat.def': 100, 'city.def': 80, 'caravan.gain': 50, 'prod.all': 300, 'research.speed': 60, 'loot.rare': 100,
  'train.speed': 50, upkeep: -100, 'salvage.bonus': 20, 'potion.duration': 10, 'market.fee': -300, caravans: 20, 'loot.crystal': 50,
};
// L'expérience profite à tous les rôles, mais lentement
export const XP_WEIGHT = 15;

// ───────── Châsses et gemmes taillées ─────────
export const SOCKETS = { common: 0, rare: 1, epic: 2, legendary: 3, mythic: 3 };
export const GEM_QUALITIES = [
  { name: 'Éclat', short: 'I' },
  { name: 'Taillée', short: 'II' },
  { name: 'Parfaite', short: 'III' },
  { name: 'Royale', short: 'IV' },
];
// Chaque gemme a une forme (lisible sans la couleur) et une famille de bonus ; valeurs par qualité
export const GEM_TYPES = {
  ruby:     { name: 'Rubis', glyph: '▲', family: 'Attaque', mods: (q) => ({ 'combat.atk': [0.02, 0.04, 0.07, 0.11][q] }) },
  sapphire: { name: 'Saphir', glyph: '◆', family: 'Défense', mods: (q) => ({ 'combat.def': [0.02, 0.04, 0.07, 0.11][q] }) },
  emerald:  { name: 'Émeraude', glyph: '■', family: 'Production', mods: (q) => ({ 'prod.all': [0.006, 0.012, 0.02, 0.032][q] }) },
  topaz:    { name: 'Topaze', glyph: '★', family: 'Butin', mods: (q) => ({ 'gather.all': [0.02, 0.04, 0.07, 0.11][q], 'loot.rare': [0.005, 0.01, 0.017, 0.027][q] }) },
  amethyst: { name: 'Améthyste', glyph: '●', family: 'Héros', mods: (q) => { const v = [2, 4, 7, 11][q]; return { 'stat.force': v, 'stat.command': v, 'stat.cunning': v, 'stat.lore': v }; } },
};
// Tailler un éclat (qualité I) ; fusionner 3 gemmes d'une qualité en 1 de la suivante ; dessertir sans risque contre de l'or
export const CUT_COST = { gems: 3, crystals: 1, gold: 150 };
export const FUSE_N = 3;
export const fuseCost = (q) => ({ gold: 300 * (q + 1) });
export const unsetCost = (q) => ({ gold: 100 * (q + 1) * (q + 1) });

// ───────── Ensembles ─────────
// Une pièce d'ensemble se reconnaît à son modèle (base) ; elle n'est « d'ensemble » que si elle est rare ou mieux, une
// fois sur quatre. Bonus à 2 et 4 pièces portées par le même héros, bornés et dans le contexte du rôle.
export const SET_CHANCE = 0.25;
export const ITEM_SETS = {
  harvest: {
    name: 'Gouverneur des moissons', icon: '🌾', role: 'intendant', bases: ['scepter', 'scholarCap', 'farmerSmock', 'goldRing', 'crystalAmulet'],
    bonus: { 2: { ctx: 'governor', mods: { 'prod.food': 0.05 } }, 4: { ctx: 'governor', mods: { 'prod.all': 0.03 } } },
  },
  warlord: {
    name: 'Seigneur de guerre', icon: '⚔️', role: 'guerre', bases: ['generalSword', 'ironHelm', 'plateArmor', 'duelGloves', 'warBoots', 'wolfRing', 'warAmulet'],
    bonus: { 2: { ctx: 'commander', mods: { 'combat.atk': 0.04 } }, 4: { ctx: 'commander', mods: { 'combat.def': 0.05, 'combat.morale': 6 } } },
  },
  pathfinder: {
    name: 'Éclaireur des confins', icon: '🧭', role: 'exploration', bases: ['huntBow', 'scoutHood', 'leatherVest', 'roadBoots', 'luckRing', 'sageAmulet'],
    bonus: { 2: { ctx: 'commander', mods: { 'explore.speed': 0.08 } }, 4: { ctx: 'commander', mods: { 'loot.rare': 0.02, 'march.speed': 0.05 } } },
  },
  prospector: {
    name: 'Prospecteur', icon: '⛏️', role: 'récolte', bases: ['minerSword', 'woodAxe', 'minerGloves', 'leatherVest', 'roadBoots', 'goldRing'],
    bonus: { 2: { ctx: 'commander', mods: { 'gather.all': 0.06 } }, 4: { ctx: 'commander', mods: { carry: 0.15, 'gather.all': 0.06 } } },
  },
};

// ───────── Démantèlement (forge) : métal et matériaux, jamais d'or ─────────
// Par emplacement, ce qui se récupère d'une pièce commune de niveau 1 (une partie de la recette de forge)
export const SCRAP = {
  weapon: { steel: 8, iron: 10 }, helmet: { steel: 5, leather: 3 }, armor: { steel: 7, leather: 5 },
  gloves: { leather: 6, iron: 4 }, boots: { leather: 6, iron: 8 }, ring: { silver: 2 }, amulet: { silver: 2 },
};
export const SCRAP_UPGRADE_SHARE = 0.3; // part des matériaux d'amélioration (+N) rendue

// ───────── Vente (Joaillier) : or, et gemmes pour les bijoux et les pièces épiques ou mieux ─────────
export const SELL_BASE_GOLD = 30;
export const JEWEL_SLOTS = ['ring', 'amulet'];
// Le Joaillier n'achète que GEM_DAILY gemmes par jour (minuit UTC) ; au-delà il paie en or, au prix de base des gemmes
export const GEM_DAILY = 6;
export const GEM_GOLD = 25;

// ───────── Transmutation et réforge ─────────
export const TRANSMUTE_SHARE = 0.7; // part du +N transférée
export const transmuteCost = (plus) => ({ gold: 250 * plus, crystals: Math.ceil(plus / 2) });
export const reforgeCost = (n, rarityIdx) => ({ crystals: 2 + 2 * n, gold: 300 * (n + 1), ...(rarityIdx >= 2 ? { gems: n + 1 } : {}) });

// ───────── Inventaire, règles et annulation ─────────
export const LOOT_RULES_MAX = 4; // règles de tri : hors quota des ordres du royaume
export const OUTFITS_MAX = 3;
export const UNDO_MS = 10 * 60000; // une action en masse s'annule pendant 10 minutes (jusqu'à la suivante)
export const SAVED_FILTERS_MAX = 3;
export const ARMY_PRESETS_MAX = 3;
