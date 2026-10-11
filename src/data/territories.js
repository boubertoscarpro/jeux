// Spécialisations des avant-postes : chaque terrain offre deux ou trois voies de développement.
// prod : production horaire PAR NIVEAU (ressources réellement ajoutées, après garnison et entretien)
// mods : bonus PAR NIVEAU appliqués au royaume tant que l'avant-poste est tenu et approvisionné
export const OUTPOST_MAX_LEVEL = 5;
export const GARRISON_PER_LEVEL = 8;          // soldats requis par niveau
export const UPKEEP_PER_LEVEL = { gold: 12, food: 10 }; // par heure
export const outpostUpgradeCost = (lvl) => ({ wood: Math.round(500 * 1.8 ** (lvl - 1)), stone: Math.round(450 * 1.8 ** (lvl - 1)), gold: Math.round(300 * 1.9 ** (lvl - 1)) });
export const RESPEC_COST = { gold: 1500, wood: 800 };

export const TERRITORY_SPECS = {
  plain: [
    { id: 'farms', name: 'Domaines agricoles', icon: '🌾', desc: 'Champs et greniers : nourriture et grain.', prod: { food: 60, grain: 10 } },
    { id: 'stud', name: 'Haras', icon: '🐎', desc: 'Élevage de chevaux : cuir et formation plus rapide de la cavalerie.', prod: { leather: 6 }, mods: { 'train.speed': 0.02, 'class.cavalry.atk': 0.01 } },
  ],
  forest: [
    { id: 'logging', name: 'Exploitation forestière', icon: '🪓', desc: 'Bois en grande quantité.', prod: { wood: 70 } },
    { id: 'heartwood', name: 'Bois de cœur', icon: '🌳', desc: 'Coupe sélective des arbres anciens : bois ancien, très rare.', prod: { wood: 15, ancientWood: 0.4 } },
    { id: 'hunt', name: 'Réserve de chasse', icon: '🦌', desc: 'Gibier et peaux.', prod: { food: 35, hides: 8 } },
  ],
  hills: [
    { id: 'quarry', name: 'Carrières', icon: '🪨', desc: 'Pierre de taille.', prod: { stone: 65 } },
    { id: 'vineyard', name: 'Vignobles', icon: '🍇', desc: 'Vins vendus dans tout le royaume : or.', prod: { gold: 30 } },
    { id: 'watch', name: 'Tour de guet', icon: '🗼', desc: 'Surveille les routes : risque des convois réduit, défense des avant-postes.', mods: { 'convoy.risk': -0.04, 'city.def': 0.01 }, garrisonBonus: 0.25 },
  ],
  mountain: [
    { id: 'mines', name: 'Mines profondes', icon: '⛏️', desc: 'Fer et, rarement, minerai rare.', prod: { iron: 40, rareOre: 0.25 } },
    { id: 'fortress', name: 'Forteresse de montagne', icon: '🏔️', desc: 'Garnison imprenable, défense du royaume.', mods: { 'combat.def': 0.01, 'city.def': 0.02 }, garrisonBonus: 0.5 },
  ],
  river: [
    { id: 'port', name: 'Port fluvial', icon: '⚓', desc: 'Commerce : gains des caravanes.', prod: { gold: 15 }, mods: { 'caravan.gain': 0.02 } },
    { id: 'fishery', name: 'Pêcheries', icon: '🐟', desc: 'Poisson frais : nourriture.', prod: { food: 75 } },
  ],
  swamp: [
    { id: 'herbalists', name: 'Herboristes', icon: '🌿', desc: 'Plantes médicinales.', prod: { herbs: 14 } },
    { id: 'peat', name: 'Tourbières', icon: '🟫', desc: 'Tourbe séchée : combustible.', prod: { coal: 18 } },
  ],
  ruins: [
    { id: 'digs', name: 'Fouilles', icon: '🏺', desc: 'Archéologues : cristaux et chance de reliques (fragments).', prod: { crystals: 0.3 }, relicChance: 0.004 },
    { id: 'sanctuary', name: 'Sanctuaire oublié', icon: '🕯️', desc: 'Les érudits y étudient : recherche plus rapide.', mods: { 'research.speed': 0.02 } },
  ],
  snow: [
    { id: 'coal', name: 'Mines de charbon', icon: '🌑', desc: 'Charbon de toundra.', prod: { coal: 25 } },
    { id: 'furs', name: 'Comptoir de fourrures', icon: '🦊', desc: 'Peaux et laine.', prod: { hides: 8, wool: 8 } },
  ],
  ash: [
    { id: 'crystals', name: 'Champs de cristaux', icon: '🔮', desc: 'Cristaux nés de la Fracture.', prod: { crystals: 0.5 } },
    { id: 'obsidian', name: 'Forges d’obsidienne', icon: '⚒️', desc: 'Lames d’obsidienne : attaque de vos armées.', mods: { 'combat.atk': 0.01 } },
  ],
};

// Menaces régionales : bandes qui convoitent les avant-postes prospères
export const OUTPOST_THREATS = {
  plain: { name: 'Pillards des plaines', units: { bandit: 6, banditRider: 3 } },
  forest: { name: 'Meute de loups', units: { wolf: 8 } },
  hills: { name: 'Brigands des collines', units: { bandit: 6, banditArcher: 4 } },
  mountain: { name: 'Trolls des cimes', units: { troll: 1, wolf: 4 } },
  river: { name: 'Pirates de rivière', units: { bandit: 5, banditArcher: 4 } },
  swamp: { name: 'Araignées des marais', units: { spider: 7 } },
  ruins: { name: 'Squelettes errants', units: { skeleton: 8, wraith: 1 } },
  snow: { name: 'Loups des neiges', units: { wolf: 9 } },
  ash: { name: 'Golems de cendre', units: { golem: 1, skeleton: 4 } },
};

// Catégories de spécialités : un avant-poste n'est pas une copie du château, il sert une stratégie précise
export const SPEC_CATS = {
  forestier: { name: 'Avant-poste forestier', icon: '🪓', desc: 'Bois et ressources de la forêt.' },
  minier: { name: 'Avant-poste minier', icon: '⛏️', desc: 'Pierre, minerais et combustibles.' },
  agricole: { name: 'Avant-poste agricole', icon: '🌾', desc: 'Nourriture, grain, gibier et plantes.' },
  commercial: { name: 'Avant-poste commercial', icon: '⚖️', desc: 'Or, caravanes et échanges.' },
  militaire: { name: 'Avant-poste militaire', icon: '🛡️', desc: 'Défense, garnison et soutien des armées.' },
  savoir: { name: 'Avant-poste du savoir', icon: '📜', desc: 'Recherche, cristaux et reliques.' },
};

// Affinité d'une spécialité avec son environnement : chaque case voisine (rayon 2) d'un terrain favorable donne
// +4 %, chaque gisement de la bonne ressource à 3 cases ou moins +8 %, plafonné à +30 % (production ET bonus).
// Un emplacement bien choisi vaut donc mieux qu'un emplacement quelconque, sans rendre une spécialité dominante.
export const AFFINITY = { perTile: 0.04, perNode: 0.08, max: 0.3, tileRadius: 2, nodeRadius: 3 };
export const SPEC_INFO = {
  farms: { cat: 'agricole', near: ['plain', 'river'], res: ['food'] },
  stud: { cat: 'militaire', near: ['plain', 'hills'], res: ['food'] },
  logging: { cat: 'forestier', near: ['forest'], res: ['wood'] },
  heartwood: { cat: 'forestier', near: ['forest'], res: ['ancientWood', 'wood'] },
  hunt: { cat: 'agricole', near: ['forest', 'plain'], res: ['food', 'hides'] },
  quarry: { cat: 'minier', near: ['hills', 'mountain'], res: ['stone'] },
  vineyard: { cat: 'commercial', near: ['hills', 'plain'], res: [] },
  watch: { cat: 'militaire', near: ['hills', 'mountain'], res: [] },
  mines: { cat: 'minier', near: ['mountain', 'hills'], res: ['iron', 'rareOre'] },
  fortress: { cat: 'militaire', near: ['mountain'], res: [] },
  port: { cat: 'commercial', near: ['river'], res: [] },
  fishery: { cat: 'agricole', near: ['river'], res: ['food'] },
  herbalists: { cat: 'agricole', near: ['swamp', 'forest'], res: ['herbs'] },
  peat: { cat: 'minier', near: ['swamp'], res: ['coal'] },
  digs: { cat: 'savoir', near: ['ruins', 'ash'], res: ['crystals'] },
  sanctuary: { cat: 'savoir', near: ['ruins'], res: [] },
  coal: { cat: 'minier', near: ['snow', 'hills'], res: ['coal'] },
  furs: { cat: 'commercial', near: ['snow', 'forest'], res: ['hides'] },
  crystals: { cat: 'minier', near: ['ash', 'mountain'], res: ['crystals', 'gems'] },
  obsidian: { cat: 'militaire', near: ['ash'], res: [] },
};
