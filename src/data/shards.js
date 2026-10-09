// Éclats Anciens & Roue des Anciens — configuration (surchargeable par l'outil d'administration)

export const SHARD_CONFIG = {
  ticketCost: 10,                 // Éclats pour 1 ticket
  freeTicketDays: 7,              // 1 ticket gratuit tous les 7 jours
  detectionCap: 0.10,             // bonus de détection plafonné à +10 % (relatif)
  heatPerDrop: 1,                 // rendements décroissants : chaleur ajoutée par trouvaille
  heatDecayPerHour: 1 / 8,        // la chaleur retombe de 1 toutes les 8 h
  heatFactor: 1.0,                // chance × 1 / (1 + chaleur × facteur)
  dailyCap: { expedition: 2, dungeon: 3, boss: 2, exploration: 2, anomaly: 3, event: 6, forbidden: 30, feat: 99, free: 99 },
  overCapFactor: 0.10,            // au-delà du plafond quotidien, chance × 0,10
  rotation: ['dungeon', 'expedition', 'boss', 'exploration'], // source favorisée, change chaque semaine
  rotationBonus: 1.5,
  droughtHours: 72,              // « Les Anciens veillent » : sans trouvaille depuis 72 h…
  droughtBonus: 2.5,             // …la prochaine chance est multipliée (aide les joueurs occasionnels)
  sources: {
    expedition:  { name: 'Expéditions rares', chance: 0.015, amount: [1, 3], desc: 'Expéditions sur des sites de danger 3+ ou de prospection.' },
    anomaly:     { name: 'Anomalies détectées', chance: 0.025, amount: [1, 2], desc: 'Une expédition détecte une énergie ancienne : il faut intervenir.' },
    dungeon:     { name: 'Donjons profonds', chance: 0, amount: [1, 2], desc: 'Boss de donjon niveau 6+ ; la chance croît avec la profondeur.' },
    boss:        { name: 'Boss mondiaux', chance: 0.25, amount: [1, 1], desc: 'Participants (≥ 3 % des dégâts) ; bonus pour les meilleurs.' },
    exploration: { name: 'Exploration', chance: 0.006, amount: [1, 1], desc: '« Fragment d’un ancien artefact » : découverte très rare.' },
    forbidden:   { name: 'Expédition interdite', chance: 1, amount: [0, 0], desc: '12 h, risque élevé : 0, 2-5 ou 10-30 Éclats.' },
    event:       { name: 'Événements', chance: 1, amount: [1, 1], desc: 'Boutiques d’événement (stock limité), récompenses rares.' },
    feat:        { name: 'Exploits', chance: 1, amount: [1, 1], desc: 'Succès extrêmement difficiles, non répétables.' },
    free:        { name: 'Ticket hebdomadaire', chance: 1, amount: [0, 0], desc: '1 ticket gratuit tous les 7 jours.' },
  },
  forbidden: { hours: 12, cooldownHours: 96, minPower: 4000, outcomes: { fail: 0.55, partial: 0.35, success: 0.1 }, partial: [2, 5], success: [10, 30] },
};

// Autres usages des Éclats (choix stratégique : tenter sa chance ou viser une récompense garantie)
export const SHARD_SHOP = [
  { id: 'ticket', label: '1 Ticket de la Roue', icon: '🎟️', cost: 10, desc: 'Tenter sa chance à la Roue des Anciens.' },
  { id: 'chest', label: 'Coffre de ressources rares', icon: '🧰', cost: 25, desc: 'Cristaux, minerai rare, gemmes, bois ancien, argent.' },
  { id: 'relic', label: 'Fragment de relique', icon: '🧩', cost: 50, desc: '3 fragments = un artefact au choix parmi ceux que vous ne possédez pas.' },
  { id: 'guaranteed', label: 'Faveur des Anciens', icon: '👑', cost: 100, desc: 'Choisissez une récompense légendaire garantie de la Roue.' },
];

export const WHEEL_CONFIG = {
  probs: { common: 0.70, rare: 0.20, epic: 0.07, legendary: 0.028, mythic: 0.002 },
  pity: { rare: 10, epic: 25, legendary: 50, mythic: 100 },
  jackpotShare: 0.25,             // part du jackpot dans les résultats mythiques
  fragmentsPerSpin: [1, 2],       // fragments de relique mythique gagnés à chaque tour
  mythicCraft: 100,               // fragments pour fabriquer un objet mythique de la Roue
  legendaryDupe: 10,              // fragments légendaires rendus par un doublon légendaire
  legendaryCraft: 30,             // fragments légendaires pour choisir une récompense légendaire
  mythicDupe: 40,                 // fragments mythiques rendus par un doublon mythique
  seasonDays: 28,
};

export const WHEEL_TIERS = {
  common:    { name: 'Commun', color: '#9aa0ad' },
  rare:      { name: 'Rare', color: '#4aa3ff' },
  epic:      { name: 'Épique', color: '#b06cff' },
  legendary: { name: 'Légendaire', color: '#ffae2b' },
  mythic:    { name: 'Mythique', color: '#ff4f6d' },
};
export const TIER_ORDER = ['common', 'rare', 'epic', 'legendary', 'mythic'];

// Récompenses de la Roue. k : multiplicateur selon le niveau d'hôtel de ville. weight : poids dans son palier.
export const WHEEL_REWARDS = {
  common: [
    { id: 'c_res', label: 'Sacoche de ressources', icon: '📦', weight: 4, give: { scaledRes: { wood: 1500, stone: 1500, food: 2000 } } },
    { id: 'c_gold', label: 'Bourse d’or', icon: '🪙', weight: 3, give: { scaledRes: { gold: 1200 } } },
    { id: 'c_mat', label: 'Matériaux d’artisan', icon: '🔩', weight: 3, give: { scaledRes: { steel: 60, leather: 60, cloth: 60, planks: 120 } } },
    { id: 'c_speed', label: 'Accélérateur (−45 min de chantier)', icon: '⏩', weight: 2, give: { speedup: 45 } },
    { id: 'c_food', label: 'Greniers pleins', icon: '🍖', weight: 2, give: { scaledRes: { food: 4000, bread: 200 } } },
  ],
  rare: [
    { id: 'r_item', label: 'Équipement rare', icon: '🗡️', weight: 3, give: { item: { min: 'rare' } } },
    { id: 'r_units', label: '6 Archers impériaux', icon: '🏹', weight: 2, give: { units: { imperialArcher: 6 } } },
    { id: 'r_rare', label: 'Coffret de ressources rares', icon: '💠', weight: 3, give: { res: { crystals: 6, rareOre: 4, gems: 4 } } },
    { id: 'r_bless', label: 'Bénédiction de l’Ancien (+25 % production, 2 h)', icon: '✨', weight: 2, give: { buff: { name: 'Bénédiction de l’Ancien', mods: { 'prod.all': 0.25 }, h: 2 } } },
    { id: 'r_fury', label: 'Fureur du Roi (+15 % attaque, 1 h)', icon: '🔥', weight: 1, give: { buff: { name: 'Fureur du Roi', mods: { 'combat.atk': 0.15 }, h: 1 } } },
    { id: 'r_fortune', label: 'Fortune du Marchand (+30 % commerce, 2 h)', icon: '💰', weight: 1, give: { buff: { name: 'Fortune du Marchand', mods: { 'caravan.gain': 0.3, 'prod.gold': 0.3 }, h: 2 } } },
    { id: 'r_exp', label: 'Expédition prospère (+50 % rendement, 3 h)', icon: '⛏️', weight: 1, give: { buff: { name: 'Expédition prospère', mods: { 'expedition.yield': 0.5 }, h: 3 } } },
  ],
  epic: [
    { id: 'e_hero', label: 'Héros épique', icon: '🦸', weight: 2, give: { hero: { rarity: 'epic' } } },
    { id: 'e_item', label: 'Équipement épique', icon: '⚔️', weight: 3, give: { item: { min: 'epic' } } },
    { id: 'e_res', label: 'Trésor royal', icon: '🏆', weight: 2, give: { scaledRes: { wood: 8000, stone: 8000, iron: 4000, gold: 5000 } } },
    { id: 'e_units', label: '12 Chevaliers royaux', icon: '🏇', weight: 2, give: { units: { royalChampion: 12 } } },
    { id: 'e_guard', label: '10 Gardiens ancestraux', icon: '🛡️', weight: 1, give: { units: { ancestralGuardian: 10 } } },
  ],
  legendary: [
    { id: 'l_item', label: 'Équipement légendaire', icon: '🌟', weight: 3, give: { item: { min: 'legendary' } } },
    { id: 'l_hero', label: 'Héros légendaire', icon: '👑', weight: 2, give: { hero: { rarity: 'legendary' } } },
    { id: 'l_art', label: 'Artefact ancien', icon: '🏺', weight: 1, give: { artifact: true } },
    { id: 'l_riders', label: '15 Cavaliers célestes', icon: '🐎', weight: 2, give: { units: { celestialRider: 15 } } },
    { id: 'l_steed', label: 'Destrier spectral (monture)', icon: '👻', weight: 1, give: { unique: 'spectralSteed' }, exclusive: true },
  ],
  mythic: [
    { id: 'm_king', label: 'Le Roi sans Couronne (héros mythique)', icon: '🤴', weight: 1, give: { specialHero: 'crownlessKing' }, exclusive: true, season: 1 },
    { id: 'm_blade', label: 'Brise-Royaume (arme mythique)', icon: '🗡️', weight: 1, give: { unique: 'kingdomBreaker' }, exclusive: true, season: 1 },
    { id: 'm_eye', label: 'Œil de l’Ancien (artefact unique)', icon: '👁️', weight: 1, give: { artifactKey: 'ancientEye' }, exclusive: true },
    { id: 'm_statue', label: 'Colosse de l’Ancien (décoration légendaire)', icon: '🗿', weight: 1, give: { deco: 'deco_colossus' }, exclusive: true },
    { id: 'm_queen', label: 'La Reine des Cendres (héros mythique)', icon: '👸', weight: 1, give: { specialHero: 'ashQueen' }, exclusive: true, season: 2 },
  ],
  jackpot: { id: 'jackpot', label: '👑 JACKPOT ANCESTRAL', icon: '👑', give: { jackpot: true } },
};

// Héros exclusifs (Roue et événements)
export const SPECIAL_HEROES = {
  crownlessKing: { name: 'Le Roi sans Couronne', cls: 'explorer', rarity: 'mythic', mods: { 'prod.all': 0.05, 'explore.speed': 0.1 }, desc: '+5 % production globale, +10 % exploration' },
  ashQueen: { name: 'La Reine des Cendres', cls: 'general', rarity: 'mythic', mods: { 'combat.def': 0.08, 'city.def': 0.1 }, desc: '+8 % défense, +10 % défense de la ville' },
  khanSon: { name: 'Temür, fils du Khan', cls: 'general', rarity: 'legendary', mods: { 'class.cavalry.atk': 0.1 }, desc: '+10 % attaque de la cavalerie' },
  saltCaptain: { name: 'Capitaine Barbe-de-Sel', cls: 'merchant', rarity: 'legendary', mods: { 'caravan.gain': 0.12 }, desc: '+12 % gains commerciaux' },
  frostJarl: { name: 'Jarl Hivernal', cls: 'farmer', rarity: 'legendary', mods: { upkeep: -0.08 }, desc: '−8 % entretien' },
  ruinScholar: { name: 'Érudite des Ruines', cls: 'alchemist', rarity: 'legendary', mods: { 'research.speed': 0.1 }, desc: '+10 % recherche' },
  dragonSlayer: { name: 'Sigrun Tue-Dragon', cls: 'general', rarity: 'legendary', mods: { 'combat.atk': 0.06 }, desc: '+6 % attaque' },
};

export const PITY_ORDER = ['rare', 'epic', 'legendary', 'mythic'];

// Exploits : récompenses ponctuelles, non répétables
export const FEATS = [
  { id: 'deepDungeon', label: 'Vaincre un donjon de niveau 15', shards: 5 },
  { id: 'edgeOfWorld', label: 'Explorer les confins du monde (à 22 cases de la capitale)', shards: 3 },
  { id: 'wonder', label: 'Bâtir une merveille', shards: 5 },
  { id: 'chapter', label: 'Achever le chapitre des quêtes du royaume', shards: 5 },
  { id: 'production', label: 'Atteindre 5 000 or par heure', shards: 3 },
  { id: 'relics5', label: 'Posséder 5 artefacts', shards: 4 },
  { id: 'bossSlayer', label: 'Vaincre les 5 boss mondiaux', shards: 5 },
  { id: 'dynasty', label: 'Fonder une nouvelle dynastie', shards: 5 },
];
