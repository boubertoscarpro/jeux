// Arbre de talents du royaume (permanent, conservé lors du prestige).
// Chaque talent a jusqu'à 3 rangs ; chaque rang coûte 1 point.
export const TALENT_BRANCHES = {
  war:      { name: 'Guerre', icon: '⚔️' },
  economy:  { name: 'Économie', icon: '💰' },
  farming:  { name: 'Agriculture', icon: '🌾' },
  mining:   { name: 'Extraction', icon: '⛏️' },
  tech:     { name: 'Technologie', icon: '🔬' },
  explore:  { name: 'Exploration', icon: '🗺️' },
  build:    { name: 'Construction', icon: '🏗️' },
  trade:    { name: 'Commerce', icon: '🚚' },
};

const T = (branch, name, desc, mods, req = null) => ({ branch, name, desc, mods, req, ranks: 3 });
export const TALENTS = {
  war1: T('war', 'Vétérans', '+4% attaque / rang', { 'combat.atk': 0.04 }),
  war2: T('war', 'Discipline de fer', '+5 moral / rang', { 'combat.morale': 5 }, 'war1'),
  war3: T('war', 'Recruteurs', '+6% vitesse de formation / rang', { 'train.speed': 0.06 }, 'war1'),
  war4: T('war', 'Conquérant', '+5% défense, +1 territoire / rang', { 'combat.def': 0.05, territories: 1 }, 'war2'),
  eco1: T('economy', 'Fiscalité', '+6% or / rang', { 'prod.gold': 0.06 }),
  eco2: T('economy', 'Greniers', '+10% stockage / rang', { 'storage.pct': 0.1 }, 'eco1'),
  eco3: T('economy', 'Bonne gestion', '−5% entretien / rang', { upkeep: -0.05 }, 'eco1'),
  eco4: T('economy', 'Prospérité', '+3% toute production / rang', { 'prod.all': 0.03 }, 'eco2'),
  far1: T('farming', 'Sols riches', '+6% nourriture / rang', { 'prod.food': 0.06 }),
  far2: T('farming', 'Moissons', '+10% blé / rang', { 'prod.grain': 0.1 }, 'far1'),
  far3: T('farming', 'Fêtes paysannes', '+4 moral des ouvriers / rang', { 'worker.morale': 4 }, 'far1'),
  far4: T('farming', 'Jachère', '+15% régénération des sites / rang', { 'node.regen': 0.15 }, 'far2'),
  min1: T('mining', 'Pics trempés', '+6% fer et pierre / rang', { 'prod.iron': 0.06, 'prod.stone': 0.06 }),
  min2: T('mining', 'Galeries', '+8% rendement des expéditions / rang', { 'expedition.yield': 0.08 }, 'min1'),
  min3: T('mining', 'Hauts-fourneaux', '+8% acier et charbon / rang', { 'prod.steel': 0.08, 'prod.coal': 0.08 }, 'min1'),
  min4: T('mining', 'Veines profondes', '+2% butin rare / rang', { 'loot.rare': 0.02 }, 'min2'),
  tec1: T('tech', 'Scribes', '+6% recherche / rang', { 'research.speed': 0.06 }),
  tec2: T('tech', 'Ingénierie', '+8% chaînes de production (planches, charpente, armes) / rang', { 'prod.planks': 0.08, 'prod.frames': 0.08, 'prod.weapons': 0.08 }, 'tec1'),
  tec3: T('tech', 'Maîtres d’œuvre', '+6% vitesse de construction / rang', { 'build.speed': 0.06 }, 'tec1'),
  tec4: T('tech', 'Savoir de l’Aube', '+10% XP héros et ouvriers / rang', { 'hero.xp': 0.1, 'worker.xp': 0.1 }, 'tec2'),
  exp1: T('explore', 'Éclaireurs', '+8% vitesse d’exploration / rang', { 'explore.speed': 0.08 }),
  exp2: T('explore', 'Pisteurs', '−10% risque d’embuscade / rang', { 'ambush.reduce': 0.1 }, 'exp1'),
  exp3: T('explore', 'Récolteurs', '+6% récolte / rang', { 'gather.all': 0.06 }, 'exp1'),
  exp4: T('explore', 'Chasseurs de reliques', '+2% butin rare / rang', { 'loot.rare': 0.02 }, 'exp3'),
  bld1: T('build', 'Charpentiers', '+5% construction / rang', { 'build.speed': 0.05 }),
  bld2: T('build', 'Routes royales', '+3% bonus des routes / rang', { 'road.bonus': 0.03 }, 'bld1'),
  bld3: T('build', 'Fortifications', '+8% défense de la ville / rang', { 'city.def': 0.08 }, 'bld1'),
  bld4: T('build', 'Urbanisme', '−3% coût des bâtiments / rang', { 'build.cost': -0.03 }, 'bld2'),
  trd1: T('trade', 'Négoce', '+6% gains des caravanes / rang', { 'caravan.gain': 0.06 }),
  trd2: T('trade', 'Escortes', '−10% risque des convois / rang', { 'convoy.risk': -0.1 }, 'trd1'),
  trd3: T('trade', 'Comptoirs', '−1% taxe du marché / rang', { 'market.fee': -0.01 }, 'trd1'),
  trd4: T('trade', 'Routes de la soie', '+8% vitesse des caravanes, +1 caravane au rang 3', { 'caravan.speed': 0.08 }, 'trd2'),
};

// Modèles de builds (suggestions de spécialisation)
export const BUILD_PRESETS = {
  farmer:   { name: 'Bâtisseur-fermier', icon: '🌾', desc: 'Production, stockage, automatisation', picks: ['far1', 'far1', 'far1', 'eco1', 'eco2', 'far2', 'eco4', 'min1', 'bld1', 'far3'] },
  warrior:  { name: 'Seigneur de guerre', icon: '⚔️', desc: 'Attaque, conquête, armée', picks: ['war1', 'war1', 'war1', 'war2', 'war3', 'war2', 'war4', 'bld3', 'eco3', 'war3'] },
  merchant: { name: 'Prince marchand', icon: '💰', desc: 'Commerce, caravanes, marché', picks: ['trd1', 'trd1', 'trd1', 'trd2', 'trd3', 'trd3', 'trd4', 'eco1', 'eco1', 'trd2'] },
  explorer: { name: 'Explorateur', icon: '🧭', desc: 'Exploration, butin, ressources rares', picks: ['exp1', 'exp1', 'exp3', 'exp3', 'exp4', 'exp2', 'min1', 'min2', 'exp4', 'min4'] },
};

// Héritage dynastique (prestige)
export const DYNASTY_PERKS = {
  bounty:   { name: 'Trésor des ancêtres', desc: 'Ressources de départ +100 % par rang', max: 5, cost: 1 },
  prod:     { name: 'Sang bâtisseur', desc: '+5% toute production par rang', max: 10, cost: 1, mods: { 'prod.all': 0.05 } },
  steward:  { name: 'Intendance héréditaire', desc: 'Commence avec +1 palier d’Intendance par rang', max: 3, cost: 2 },
  talents:  { name: 'Mémoire des rois', desc: '+2 points de talent par rang', max: 5, cost: 1 },
  queue:    { name: 'Architectes royaux', desc: '+1 file de construction', max: 1, cost: 3, mods: { buildQueue: 1 } },
  army:     { name: 'Garde dynastique', desc: '+5% attaque et défense par rang', max: 5, cost: 1, mods: { 'combat.atk': 0.05, 'combat.def': 0.05 } },
};
