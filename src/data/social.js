// Guildes (simulées pour le prototype solo), saison, cosmétiques.

export const GUILDS = {
  oak: { name: 'Ordre du Chêne', icon: '🌳', focus: 'Économie', desc: 'Guilde de bâtisseurs et de marchands.', perk: { 'prod.all': 0.03 }, members: 18 },
  ember: { name: 'Lames de Braise', icon: '🔥', focus: 'Guerre', desc: 'Guilde guerrière, spécialisée dans les boss et la conquête.', perk: { 'combat.atk': 0.04 }, members: 24 },
  compass: { name: 'Compagnie de la Boussole', icon: '🧭', focus: 'Exploration', desc: 'Explorateurs et chasseurs de reliques.', perk: { 'gather.all': 0.05, 'loot.rare': 0.01 }, members: 15 },
};

// Bonus de niveau de guilde (cumulés)
export const GUILD_LEVELS = [
  { lvl: 2, name: 'Entraide', mods: { 'build.speed': 0.05 } },
  { lvl: 3, name: 'Coffres communs', mods: { 'storage.pct': 0.1 } },
  { lvl: 4, name: 'Escortes de guilde', mods: { 'march.speed': 0.05, 'convoy.risk': -0.25 } },
  { lvl: 5, name: 'Bannière de guilde (renforts lors des raids)', mods: { 'combat.atk': 0.03, 'combat.def': 0.03 } },
  { lvl: 6, name: 'Prospection collective', mods: { 'gather.all': 0.08 } },
  { lvl: 8, name: 'Académie', mods: { 'research.speed': 0.1 } },
  { lvl: 10, name: 'Légion', mods: { 'combat.atk': 0.05, marches: 1 } },
];
export const guildXpForLevel = (lvl) => Math.round(1000 * Math.pow(lvl, 1.7));

// Objectifs de guilde (progression collective)
export const GUILD_OBJECTIVES = [
  { id: 'iron', title: 'Extraire du fer', desc: 'Livrer du fer (dons + récolte).', stat: 'iron', target: 20000, reward: { gold: 800, steel: 40 } },
  { id: 'wood', title: 'Grand chantier', desc: 'Récolter du bois sur la carte.', stat: 'wood', target: 30000, reward: { gold: 600, stone: 1500 } },
  { id: 'boss', title: 'Vaincre le boss mondial', desc: 'Infliger des dégâts aux boss mondiaux.', stat: 'bossDamage', target: 200000, reward: { crystals: 10, gems: 5 } },
  { id: 'outposts', title: 'Contrôler des mines', desc: 'Avant-postes de la guilde.', stat: 'outposts', target: 5, reward: { gold: 1500, silver: 15 } },
  { id: 'battles', title: 'Purger les Terres Brisées', desc: 'Victoires contre des sites dangereux.', stat: 'clears', target: 40, reward: { gold: 1000, rareOre: 5 } },
];

// Saison
export const SEASON = {
  id: 1,
  name: 'Saison I — L’Éveil des Cendres',
  lengthDays: 28,
  desc: 'Les cristaux se réveillent : les Terres de cendre s’ouvrent à l’est. Classement par points de saison.',
  tiers: [
    { pts: 100, reward: { gold: 500 }, label: '500 or' },
    { pts: 300, reward: { insignia: 5 }, label: '5 insignes' },
    { pts: 600, reward: { crystals: 5 }, label: '5 cristaux' },
    { pts: 1000, reward: { insignia: 10, title: 'Pionnier des Cendres' }, label: 'Titre « Pionnier des Cendres »' },
    { pts: 1600, reward: { rareOre: 10 }, label: '10 minerais rares' },
    { pts: 2500, reward: { insignia: 20, banner: 'ember' }, label: 'Bannière Braise' },
    { pts: 4000, reward: { title: 'Héritier de l’Aube', insignia: 30 }, label: 'Titre « Héritier de l’Aube »' },
  ],
  // points gagnés par action
  points: { build: 2, research: 5, battle: 4, hardClear: 12, explore: 3, gather: 1, boss: 25, craft: 3 },
};

// Boutique cosmétique (anti pay-to-win : aucune puissance)
export const COSMETICS = {
  banner_azure:  { type: 'banner', name: 'Bannière Azur', color: '#3c7dd9', cost: 5 },
  banner_crimson:{ type: 'banner', name: 'Bannière Pourpre', color: '#b0283f', cost: 5 },
  banner_forest: { type: 'banner', name: 'Bannière Sylve', color: '#2f8f4e', cost: 5 },
  banner_ember:  { type: 'banner', name: 'Bannière Braise', color: '#e0662a', cost: 25, seasonal: true },
  banner_night:  { type: 'banner', name: 'Bannière Nuit d’Étoiles', color: '#3a2b6b', cost: 15 },
  theme_autumn:  { type: 'theme', name: 'Thème Automne (ville)', cost: 12 },
  theme_winter:  { type: 'theme', name: 'Thème Hiver (ville)', cost: 12 },
  deco_statue:   { type: 'deco', name: 'Statue du fondateur', icon: '🗽', cost: 8 },
  deco_fountain: { type: 'deco', name: 'Fontaine', icon: '⛲', cost: 6 },
  deco_garden:   { type: 'deco', name: 'Jardin fleuri', icon: '🌷', cost: 4 },
  deco_colossus: { type: 'deco', name: 'Colosse de l’Ancien', icon: '🗿', cost: 0, exclusive: true },
  deco_yurt:     { type: 'deco', name: 'Yourte du Khan', icon: '⛺', cost: 0, exclusive: true },
  deco_ship:     { type: 'deco', name: 'Proue de navire corsaire', icon: '⛵', cost: 0, exclusive: true },
  deco_ice:      { type: 'deco', name: 'Sculpture de glace', icon: '🧊', cost: 0, exclusive: true },
  deco_obelisk:  { type: 'deco', name: 'Obélisque ancien', icon: '🗼', cost: 0, exclusive: true },
  deco_dragon:   { type: 'deco', name: 'Crâne de dragon', icon: '🐉', cost: 0, exclusive: true },
  deco_banner:   { type: 'deco', name: 'Bannière de conquête', icon: '🚩', cost: 0, exclusive: true },
  deco_gold:     { type: 'deco', name: 'Pépite géante', icon: '🪙', cost: 0, exclusive: true },
  deco_lava:     { type: 'deco', name: 'Brasier de lave', icon: '🌋', cost: 0, exclusive: true },
  deco_lantern:  { type: 'deco', name: 'Lanterne des morts', icon: '🏮', cost: 0, exclusive: true },
  deco_tower:    { type: 'deco', name: 'Tour des Anciens', icon: '🏯', cost: 0, exclusive: true },
  deco_bonfire:  { type: 'deco', name: 'Feu de joie', icon: '🔥', cost: 4 },
};
