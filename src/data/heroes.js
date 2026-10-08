// Héros : 4 caractéristiques
// force → attaque ; commandement → défense & moral ; ruse → exploration & butin ; savoir → production & recherche
export const STATS = {
  force: { name: 'Force', icon: '💪' },
  command: { name: 'Commandement', icon: '🎖️' },
  cunning: { name: 'Ruse', icon: '🦊' },
  lore: { name: 'Savoir', icon: '📜' },
};

export const RARITIES = {
  common:    { name: 'Commun',     color: '#b8b8b8', mult: 1.0,  affixes: 1, weight: 60 },
  rare:      { name: 'Rare',       color: '#4aa3ff', mult: 1.25, affixes: 2, weight: 27 },
  epic:      { name: 'Épique',     color: '#b06cff', mult: 1.55, affixes: 3, weight: 10 },
  legendary: { name: 'Légendaire', color: '#ffae2b', mult: 1.9,  affixes: 4, weight: 2.6 },
  mythic:    { name: 'Mythique',   color: '#ff4f6d', mult: 2.4,  affixes: 5, weight: 0.4 },
};
export const RARITY_ORDER = Object.keys(RARITIES);

// Secteurs que peut gérer un intendant
export const SECTORS = {
  food:     { name: 'Agriculture', icon: '🌾', mods: ['prod.food', 'prod.grain', 'prod.wool', 'prod.hides'] },
  wood:     { name: 'Forêts',      icon: '🪵', mods: ['prod.wood', 'prod.coal'] },
  stone:    { name: 'Carrières',   icon: '🪨', mods: ['prod.stone'] },
  iron:     { name: 'Mines',       icon: '⛓️', mods: ['prod.iron', 'prod.steel'] },
  industry: { name: 'Ateliers',    icon: '🏭', mods: ['prod.flour', 'prod.bread', 'prod.leather', 'prod.cloth', 'prod.herbs'] },
  treasury: { name: 'Trésor',      icon: '🪙', mods: ['prod.gold', 'market.fee'] },
  forge:    { name: 'Forge',       icon: '⚒️', mods: ['craft.quality', 'craft.speed'] },
  science:  { name: 'Savoir',      icon: '📚', mods: ['research.speed'] },
};

// Classes : stats de base, croissance par niveau, secteur de prédilection, compétences
export const HERO_CLASSES = {
  blacksmith: {
    name: 'Forgeron', icon: '🔨', sector: 'forge',
    base: { force: 8, command: 4, cunning: 3, lore: 10 }, growth: { force: 1.2, command: 0.5, cunning: 0.4, lore: 1.6 },
    desc: 'Maître de l’acier. Améliore la qualité des objets forgés et la production d’acier.',
    skills: [
      { lvl: 1, name: 'Main sûre', desc: '+10% qualité de forge', mods: { 'craft.quality': 0.1 }, ctx: 'governor' },
      { lvl: 5, name: 'Trempe parfaite', desc: '+12% production d’acier', mods: { 'prod.steel': 0.12 }, ctx: 'governor' },
      { lvl: 10, name: 'Récupération', desc: 'Recyclage +25% matériaux', mods: { 'salvage.bonus': 0.25 }, ctx: 'global' },
      { lvl: 20, name: 'Chef-d’œuvre', desc: '+15% qualité et −20% temps de forge', mods: { 'craft.quality': 0.15, 'craft.speed': 0.2 }, ctx: 'governor' },
      { lvl: 30, name: 'Lame d’héritage', desc: '+8% attaque des armées', mods: { 'combat.atk': 0.08 }, ctx: 'global' },
    ],
  },
  general: {
    name: 'Général', icon: '🎖️', sector: 'science',
    base: { force: 11, command: 12, cunning: 5, lore: 3 }, growth: { force: 1.5, command: 1.7, cunning: 0.6, lore: 0.3 },
    desc: 'Stratège aguerri. Puissance militaire et moral.',
    skills: [
      { lvl: 1, name: 'Discipline', desc: '+10 moral', mods: { 'combat.morale': 10 }, ctx: 'commander' },
      { lvl: 5, name: 'Ordres clairs', desc: '+8% attaque', mods: { 'combat.atk': 0.08 }, ctx: 'commander' },
      { lvl: 10, name: 'Tacticien', desc: '+10% défense, −10% pertes', mods: { 'combat.def': 0.1, 'combat.losses': -0.1 }, ctx: 'commander' },
      { lvl: 20, name: 'Maître de guerre', desc: '+10% vitesse de formation', mods: { 'train.speed': 0.1 }, ctx: 'global' },
      { lvl: 30, name: 'Légende vivante', desc: '+20 moral, +10% attaque', mods: { 'combat.morale': 20, 'combat.atk': 0.1 }, ctx: 'commander' },
    ],
  },
  explorer: {
    name: 'Explorateur', icon: '🧭', sector: 'science',
    base: { force: 6, command: 4, cunning: 13, lore: 6 }, growth: { force: 0.7, command: 0.5, cunning: 1.8, lore: 0.8 },
    desc: 'Trouve ce que d’autres ignorent. Ressources rares et exploration.',
    skills: [
      { lvl: 1, name: 'Œil de lynx', desc: '+15% vitesse d’exploration', mods: { 'explore.speed': 0.15 }, ctx: 'commander' },
      { lvl: 5, name: 'Flair', desc: '+5% chance de butin rare', mods: { 'loot.rare': 0.05 }, ctx: 'commander' },
      { lvl: 10, name: 'Cartographe', desc: '+1 rayon de révélation', mods: { 'explore.radius': 1 }, ctx: 'commander' },
      { lvl: 20, name: 'Pisteur', desc: '−50% risque d’embuscade', mods: { 'ambush.reduce': 0.5 }, ctx: 'commander' },
      { lvl: 30, name: 'Chasseur de reliques', desc: '+10% butin rare partout', mods: { 'loot.rare': 0.1 }, ctx: 'global' },
    ],
  },
  farmer: {
    name: 'Fermier', icon: '🧑‍🌾', sector: 'food',
    base: { force: 5, command: 5, cunning: 4, lore: 11 }, growth: { force: 0.6, command: 0.6, cunning: 0.5, lore: 1.7 },
    desc: 'Nourrit le royaume. Production alimentaire et entretien des troupes.',
    skills: [
      { lvl: 1, name: 'Terre fertile', desc: '+10% nourriture', mods: { 'prod.food': 0.1 }, ctx: 'governor' },
      { lvl: 5, name: 'Rotation des cultures', desc: '+15% blé', mods: { 'prod.grain': 0.15 }, ctx: 'governor' },
      { lvl: 10, name: 'Intendance', desc: '−10% entretien de l’armée', mods: { upkeep: -0.1 }, ctx: 'global' },
      { lvl: 20, name: 'Grenier royal', desc: '+15% nourriture, laine et peaux', mods: { 'prod.food': 0.15, 'prod.wool': 0.15, 'prod.hides': 0.15 }, ctx: 'governor' },
      { lvl: 30, name: 'Âge d’abondance', desc: '+5% toute production', mods: { 'prod.all': 0.05 }, ctx: 'global' },
    ],
  },
  merchant: {
    name: 'Marchand', icon: '💰', sector: 'treasury',
    base: { force: 4, command: 6, cunning: 10, lore: 9 }, growth: { force: 0.4, command: 0.7, cunning: 1.3, lore: 1.2 },
    desc: 'Fait fructifier l’or. Commerce, caravanes et impôts.',
    skills: [
      { lvl: 1, name: 'Bon négociant', desc: '−2% taxe du marché', mods: { 'market.fee': -0.02 }, ctx: 'global' },
      { lvl: 5, name: 'Comptoirs', desc: '+12% or', mods: { 'prod.gold': 0.12 }, ctx: 'governor' },
      { lvl: 10, name: 'Caravanier', desc: '+20% gains des caravanes', mods: { 'caravan.gain': 0.2 }, ctx: 'global' },
      { lvl: 20, name: 'Réseau', desc: '+1 caravane', mods: { caravans: 1 }, ctx: 'global' },
      { lvl: 30, name: 'Prince marchand', desc: '+20% or, −3% taxe', mods: { 'prod.gold': 0.2, 'market.fee': -0.03 }, ctx: 'governor' },
    ],
  },
  alchemist: {
    name: 'Alchimiste', icon: '⚗️', sector: 'industry',
    base: { force: 4, command: 3, cunning: 9, lore: 12 }, growth: { force: 0.4, command: 0.3, cunning: 1.0, lore: 1.8 },
    desc: 'Percer les secrets de la Fracture. Herbes, potions, cristaux.',
    skills: [
      { lvl: 1, name: 'Distillation', desc: '+15% herbes', mods: { 'prod.herbs': 0.15 }, ctx: 'governor' },
      { lvl: 5, name: 'Concentré', desc: 'Potions +25% durée', mods: { 'potion.duration': 0.25 }, ctx: 'global' },
      { lvl: 10, name: 'Transmutation', desc: '+10% recherche', mods: { 'research.speed': 0.1 }, ctx: 'global' },
      { lvl: 20, name: 'Résonance', desc: '+5% chance de cristaux en récolte', mods: { 'loot.crystal': 0.05 }, ctx: 'global' },
      { lvl: 30, name: 'Pierre philosophale', desc: '+8% toute production', mods: { 'prod.all': 0.08 }, ctx: 'governor' },
    ],
  },
};

export const HERO_NAMES = [
  'Aldric', 'Bérénice', 'Corentin', 'Daëlle', 'Évrard', 'Faustine', 'Gauvain', 'Hildegarde', 'Isaure', 'Jehan',
  'Kéridwen', 'Léonce', 'Maëlys', 'Norbert', 'Oriane', 'Perceval', 'Quitterie', 'Raoul', 'Sibylle', 'Tancrède',
  'Ursule', 'Valérian', 'Wilfried', 'Ysolde', 'Zéphyrin', 'Armance', 'Baudoin', 'Clothilde', 'Druon', 'Esclarmonde',
];
export const HERO_EPITHETS = [
  'le Hardi', 'la Sage', 'Cœur-de-Chêne', 'des Cendres', 'le Borgne', 'Main-de-Fer', 'la Rousse', 'du Gué',
  'l’Errant', 'Barbe-Grise', 'la Silencieuse', 'Sang-Vif', 'des Brumes', 'le Juste', 'Œil-d’Argent',
];

export const HERO_MAX_LEVEL = 60;
export const xpForLevel = (lvl) => Math.floor(100 * Math.pow(lvl, 1.8));
