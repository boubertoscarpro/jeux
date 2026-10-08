// Carte du monde
export const WORLD_SIZE = 48;
export const SECONDS_PER_TILE = 18; // vitesse 1.0

export const TERRAINS = {
  plain:    { name: 'Plaine', color: '#7fa65a', char: 'p', territory: { 'prod.food': 0.04 } },
  forest:   { name: 'Forêt', color: '#3f6b3a', char: 'f', territory: { 'prod.wood': 0.05 } },
  hills:    { name: 'Collines', color: '#a39a5e', char: 'h', territory: { 'prod.stone': 0.03, 'prod.iron': 0.03 } },
  mountain: { name: 'Montagne', color: '#7c7470', char: 'm', territory: { 'prod.stone': 0.05, 'prod.iron': 0.04 } },
  river:    { name: 'Rivière', color: '#4f8fc0', char: 'r', territory: { 'prod.gold': 0.05, 'caravan.gain': 0.05 } },
  swamp:    { name: 'Marais', color: '#56684a', char: 's', territory: { 'prod.herbs': 0.08 } },
  ruins:    { name: 'Ruines', color: '#8b7a8f', char: 'u', territory: { 'loot.rare': 0.02 } },
  snow:     { name: 'Toundra', color: '#d8e2ea', char: 'n', territory: { 'prod.coal': 0.05 } },
  ash:      { name: 'Terres de cendre', color: '#5b4a4a', char: 'a', territory: { 'loot.crystal': 0.02 } },
};
export const CHAR_TO_TERRAIN = Object.fromEntries(Object.entries(TERRAINS).map(([k, v]) => [v.char, k]));

// Types de sites (POI)
// kind: gather (récolte) | danger (combat) | town (neutre) | kingdom (rival) | boss | village | ruin
export const POI_TYPES = {
  // --- Sites de récolte ---
  woodNode:    { name: 'Bois dense', icon: '🌲', kind: 'gather', terrain: ['forest'], res: 'wood', amount: [1500, 4000], regen: 600, danger: [0, 1] },
  stoneNode:   { name: 'Affleurement rocheux', icon: '🪨', kind: 'gather', terrain: ['hills', 'mountain'], res: 'stone', amount: [1500, 4000], regen: 500, danger: [0, 1] },
  ironNode:    { name: 'Filon de fer', icon: '⛓️', kind: 'gather', terrain: ['hills', 'mountain'], res: 'iron', amount: [800, 2500], regen: 250, hardness: 1.3, danger: [0, 2] },
  foodNode:    { name: 'Terrain de chasse', icon: '🦌', kind: 'gather', terrain: ['plain', 'forest'], res: 'food', amount: [1500, 3500], regen: 600, danger: [0, 1], bonus: { hides: 0.15 } },
  herbNode:    { name: 'Prairie d’herbes', icon: '🌿', kind: 'gather', terrain: ['plain', 'swamp', 'forest'], res: 'herbs', amount: [300, 900], regen: 120, hardness: 1.5, danger: [0, 2] },
  coalNode:    { name: 'Veine de charbon', icon: '🌑', kind: 'gather', terrain: ['hills', 'snow'], res: 'coal', amount: [400, 1200], regen: 120, hardness: 1.5, danger: [1, 2] },
  silverNode:  { name: 'Veine d’argent', icon: '🥈', kind: 'gather', terrain: ['mountain', 'hills'], res: 'silver', amount: [40, 110], regen: 8, hardness: 3, danger: [1, 3], bonus: { gems: 0.05 } },
  crystalNode: { name: 'Grotte de cristaux', icon: '🔮', kind: 'gather', terrain: ['mountain', 'ash', 'ruins'], res: 'crystals', amount: [15, 50], regen: 3, hardness: 5, danger: [2, 4], bonus: { gems: 0.1 } },
  gemNode:     { name: 'Gisement de gemmes', icon: '💎', kind: 'gather', terrain: ['mountain'], res: 'gems', amount: [20, 60], regen: 4, hardness: 5, danger: [2, 4] },
  ancientGrove:{ name: 'Bosquet ancien', icon: '🌳', kind: 'gather', terrain: ['forest'], res: 'ancientWood', amount: [30, 90], regen: 5, hardness: 4, danger: [2, 4] },
  rareVein:    { name: 'Filon légendaire', icon: '☄️', kind: 'gather', terrain: ['mountain', 'ash'], res: 'rareOre', amount: [30, 80], regen: 3, hardness: 6, danger: [3, 5], event: true },

  // --- Sites dangereux ---
  banditCamp:  { name: 'Camp de bandits', icon: '⛺', kind: 'danger', terrain: ['plain', 'forest', 'hills'], danger: [1, 3], enemies: { bandit: 6, banditArcher: 3, banditRider: 1 },
                 loot: { gold: 300, food: 400, iron: 150 }, respawn: 3600 },
  abandonedMine:{ name: 'Mine abandonnée', icon: '🕳️', kind: 'danger', terrain: ['hills', 'mountain'], danger: [2, 4], enemies: { spider: 5, skeleton: 4, troll: 0.3 },
                 loot: { iron: 3000, coal: 300, stone: 1000 }, rare: { rareOre: [2, 6] }, becomes: 'ironNodeRich', respawn: 7200 },
  crypt:       { name: 'Crypte oubliée', icon: '⚰️', kind: 'danger', terrain: ['ruins', 'plain', 'swamp'], danger: [2, 4], enemies: { skeleton: 7, wraith: 3 },
                 loot: { gold: 800, silver: 15 }, rare: { gems: [1, 4] }, item: 0.5, respawn: 7200 },
  monsterLair: { name: 'Repaire de bêtes', icon: '🐺', kind: 'danger', terrain: ['forest', 'swamp', 'hills'], danger: [1, 4], enemies: { wolf: 8, spider: 3, troll: 0.2 },
                 loot: { food: 800, hides: 300, leather: 40 }, item: 0.15, respawn: 5400 },
  dungeon:     { name: 'Donjon des Profondeurs', icon: '🏚️', kind: 'danger', dungeon: true, terrain: ['mountain', 'ruins', 'ash'], danger: [4, 6], enemies: { skeleton: 10, wraith: 6, golem: 2, troll: 1 },
                 loot: { gold: 3000, steel: 150, silver: 40 }, rare: { rareOre: [5, 12], crystals: [3, 8] }, item: 1, itemMin: 'epic', respawn: 14400 },
  ruinSite:    { name: 'Ruines de l’Aube', icon: '🏛️', kind: 'danger', terrain: ['ruins', 'ash'], danger: [1, 3], enemies: { skeleton: 4, golem: 0.5 },
                 loot: { stone: 1500, gold: 400 }, rare: { crystals: [1, 3] }, item: 0.35, respawn: 5400 },

  // --- Autres ---
  lostCity:    { name: 'Cité perdue de l’Aube', icon: '🏯', kind: 'danger', terrain: [], danger: [6, 6], enemies: { golem: 4, wraith: 8, skeleton: 14 },
                 loot: { gold: 8000, silver: 80, stone: 5000 }, rare: { crystals: [10, 20], rareOre: [10, 20] }, item: 1, itemMin: 'legendary', respawn: 86400, dungeon: true },
  village:     { name: 'Village abandonné', icon: '🏚️', kind: 'village', terrain: ['plain', 'forest', 'hills'] },
  town:        { name: 'Cité libre', icon: '🏘️', kind: 'town', terrain: ['plain', 'river', 'hills'] },
  kingdom:     { name: 'Royaume rival', icon: '🏯', kind: 'kingdom', terrain: ['plain', 'hills', 'forest'] },
  boss:        { name: 'Boss mondial', icon: '🐉', kind: 'boss', terrain: [] },
  capital:     { name: 'Votre capitale', icon: '🏰', kind: 'capital', terrain: [] },
};

// Variante obtenue après avoir nettoyé une mine abandonnée
POI_TYPES.ironNodeRich = { name: 'Mine reconquise', icon: '⚒️', kind: 'gather', terrain: [], res: 'iron', amount: [10000, 10000], regen: 900, danger: [1, 1], bonus: { coal: 0.1, rareOre: 0.004 } };

// Cités libres (commerce)
export const TOWN_NAMES = ['Valbrume', 'Port-Ardoise', 'Sainte-Gemme', 'Hautegarde', 'Mirecourt', 'Bourg-aux-Saules'];
// Royaumes rivaux (IA)
export const RIVALS = [
  { name: 'Baronnie de Corbeval', lord: 'Baron Mordain', style: 'raider', personality: 'aggressive', icon: '🦅', color: '#c0392b' },
  { name: 'Comté d’Ombrelune', lord: 'Comtesse Isolde', style: 'defensive', personality: 'isolationist', icon: '🌙', color: '#5d6d9e' },
  { name: 'Clan des Crocs-Gris', lord: 'Ragnulf le Gris', style: 'raider', personality: 'military', icon: '🐺', color: '#7f8c8d' },
  { name: 'Principauté de Valdor', lord: 'Prince Aurèle', style: 'balanced', personality: 'commercial', icon: '🦁', color: '#d4a017' },
  { name: 'Ordre de la Cendre', lord: 'Grand Maître Cassien', style: 'defensive', personality: 'technological', icon: '🔥', color: '#8e44ad' },
];

// Personnalités des factions IA
export const PERSONALITIES = {
  commercial:    { name: 'Commerciale', icon: '💰', desc: 'Cherche à s’enrichir. Apprécie les marchands, accepte volontiers les pactes commerciaux.', eco: 2.0, mil: 0.7, tech: 1.0, expand: 0.08, base: 15, likes: { merchant: 0.06, diplomat: 0.04 }, dislikes: { tyrant: 0.05 }, raid: 0 },
  military:      { name: 'Militaire', icon: '⚔️', desc: 'Cherche à conquérir. Respecte la force, méprise la faiblesse.', eco: 1.0, mil: 1.7, tech: 0.8, expand: 0.25, base: -5, likes: { warrior: 0.05 }, dislikes: { merchant: 0.01 }, raid: 0.5 },
  isolationist:  { name: 'Isolationniste', icon: '🏯', desc: 'Défend son territoire. N’aime ni les guerriers ni les tyrans, mais n’attaque presque jamais.', eco: 1.1, mil: 1.2, tech: 1.0, expand: 0.04, base: 0, likes: { diplomat: 0.03, benefactor: 0.03 }, dislikes: { warrior: 0.03, tyrant: 0.06 }, raid: 0 },
  aggressive:    { name: 'Agressive', icon: '🩸', desc: 'Attaque régulièrement ses voisins, surtout les plus faibles. Craint les tyrans.', eco: 1.0, mil: 1.4, tech: 0.7, expand: 0.2, base: -25, likes: { tyrant: 0.03 }, dislikes: { benefactor: 0.01 }, raid: 1 },
  technological: { name: 'Technologique', icon: '🔬', desc: 'Accumule le savoir ancien. Ses espions sont redoutables ; apprécie les explorateurs.', eco: 1.2, mil: 0.9, tech: 2.2, expand: 0.06, base: 5, likes: { explorer: 0.05, diplomat: 0.03 }, dislikes: { tyrant: 0.03 }, raid: 0.2 },
};

export const STANCES = {
  neutral: { name: 'Neutre', icon: '⚪' }, war: { name: 'En guerre', icon: '⚔️' }, truce: { name: 'Trêve', icon: '🏳️' },
  trade: { name: 'Pacte commercial', icon: '🤝' }, alliance: { name: 'Alliance', icon: '🛡️' }, tributary: { name: 'Vous paie tribut', icon: '💰' },
};

// Boss mondiaux
export const BOSSES = {
  dragon:       { name: 'Dragon de Cendre', unit: 'dragon', hp: 400000, unique: 'dragonFang', reward: { gold: 5000, crystals: 20, rareOre: 15 } },
  giant:        { name: 'Géant des Collines', unit: 'giant', hp: 250000, unique: 'giantCrown', reward: { gold: 3000, stone: 8000, gems: 10 } },
  banditKing:   { name: 'Roi des Bandits', unit: 'banditKing', hp: 150000, unique: 'banditCloak', reward: { gold: 6000, silver: 30 } },
  crystalGolem: { name: 'Golem de Cristal', unit: 'crystalGolem', hp: 300000, unique: 'golemHeart', reward: { crystals: 40, gems: 15 } },
  lichLord:     { name: 'Seigneur Mort-vivant', unit: 'lichLord', hp: 350000, unique: 'lichRing', reward: { gold: 4000, rareOre: 20, ancientWood: 15 } },
};
