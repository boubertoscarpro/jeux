// Artefacts : objets extrêmement rares à bonus permanents (exposés dans la Salle du trésor).
export const ARTIFACTS = {
  mountainHeart: { name: 'Cœur de la montagne', icon: '🫀', desc: '+10% extraction (pierre, fer, charbon)', mods: { 'prod.stone': 0.1, 'prod.iron': 0.1, 'prod.coal': 0.1, 'gather.iron': 0.1 }, source: 'Mines, boss souterrains' },
  merchantCrown: { name: 'Couronne du marchand', icon: '👑', desc: '+15% gains commerciaux, −2% taxe', mods: { 'caravan.gain': 0.15, 'market.fee': -0.02 }, source: 'Contrats, marchand mystérieux' },
  explorerEye: { name: 'Œil de l’explorateur', icon: '👁️', desc: '+20% chance de trésors, +1 rayon d’exploration', mods: { 'loot.rare': 0.04, 'explore.radius': 1 }, source: 'Exploration lointaine' },
  firstKingSword: { name: 'Épée du premier roi', icon: '⚔️', desc: '+15% puissance militaire', mods: { 'combat.atk': 0.15 }, source: 'Donjons, événements secrets' },
  dawnChalice: { name: 'Calice de l’Aube', icon: '🏆', desc: '+8% toute production', mods: { 'prod.all': 0.08 }, source: 'Cité perdue' },
  emberHorn: { name: 'Cor des Braises', icon: '📯', desc: '+15 moral, −10% pertes', mods: { 'combat.morale': 15, 'combat.losses': -0.1 }, source: 'Boss mondiaux' },
  seedOfAges: { name: 'Graine des âges', icon: '🌰', desc: '+20% nourriture, +30% régénération des sites', mods: { 'prod.food': 0.2, 'node.regen': 0.3 }, source: 'Bosquets anciens, saisons' },
  starIron: { name: 'Fer étoilé', icon: '☄️', desc: '+25% qualité de forge', mods: { 'craft.quality': 0.25 }, source: 'Météorites' },
  sealOfStewards: { name: 'Sceau des intendants', icon: '🔏', desc: '+10% rendement des expéditions, ouvriers +20% XP', mods: { 'expedition.yield': 0.1, 'worker.xp': 0.2 }, source: 'Événements de royaume' },
  whisperMask: { name: 'Masque des murmures', icon: '🎭', desc: '+25% réussite d’espionnage', mods: { 'spy.power': 0.25 }, source: 'Espionnage, cités perdues' },
  tideStone: { name: 'Pierre des marées', icon: '🌊', desc: '+20% vitesse des caravanes, −30% risque des convois', mods: { 'caravan.speed': 0.2, 'convoy.risk': -0.3 }, source: 'Inondations, routes' },
  kingsLedger: { name: 'Registre du roi ancien', icon: '📕', desc: '+15% vitesse de recherche', mods: { 'research.speed': 0.15 }, source: 'Ruines, bibliothèques perdues' },
};

// Ensembles de collection : bonus lorsque tout l'ensemble est réuni
export const COLLECTION_SETS = [
  { id: 'relics', name: 'Reliques de l’Aube', desc: 'Calice, Registre et Épée du premier roi', need: { artifacts: ['dawnChalice', 'kingsLedger', 'firstKingSword'] }, mods: { 'prod.all': 0.05, 'combat.atk': 0.05 } },
  { id: 'trade', name: 'Trésor des guildes marchandes', desc: 'Couronne du marchand et Pierre des marées', need: { artifacts: ['merchantCrown', 'tideStone'] }, mods: { 'caravan.gain': 0.1 } },
  { id: 'bosses', name: 'Trophées des colosses', desc: 'Vaincre les 5 boss mondiaux', need: { bosses: 5 }, mods: { 'combat.atk': 0.05, 'combat.def': 0.05 } },
  { id: 'heroes', name: 'Galerie des héros', desc: 'Avoir recruté les 6 classes de héros', need: { heroClasses: 6 }, mods: { 'hero.xp': 0.2 } },
  { id: 'rare', name: 'Cabinet de curiosités', desc: 'Posséder 100 de chaque ressource rare', need: { rareStock: 100 }, mods: { 'loot.rare': 0.03 } },
  { id: 'decor', name: 'Jardins royaux', desc: 'Posséder 4 décorations', need: { decos: 4 }, mods: { 'worker.morale': 8 } },
];
