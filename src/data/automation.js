// Arbre d'automatisation (Intendance) : chaque palier débloque des capacités.
export const AUTOMATION_LEVELS = [
  { lvl: 0, name: 'Gestion manuelle', icon: '✋', desc: 'Vous faites tout vous-même.', cost: {}, th: 1, unlocks: [] },
  { lvl: 1, name: 'Ouvriers', icon: '👷', desc: 'Recrutez des ouvriers, affectez-les aux secteurs et lancez des expéditions de récolte.', cost: { food: 300, gold: 100 }, th: 2, unlocks: ['workers', 'expeditions'] },
  { lvl: 2, name: 'Contremaîtres', icon: '🦺', desc: 'Promouvez des contremaîtres : bonus de secteur, expéditions de prospection et d’exploration.', cost: { wood: 1200, stone: 800, gold: 500 }, th: 3, unlocks: ['foremen', 'prospecting'] },
  { lvl: 3, name: 'Expéditions automatiques', icon: '🔁', desc: 'Les expéditions menées par un contremaître se relancent seules. Mercenaires débloqués.', cost: { wood: 3000, iron: 1000, gold: 1500 }, th: 4, unlocks: ['repeat', 'mercenary'] },
  { lvl: 4, name: 'Gestionnaire', icon: '📋', desc: 'Priorités du royaume (réaffectation automatique des ouvriers) et 3 Ordres du royaume.', cost: { gold: 4000, steel: 100, planks: 300 }, th: 5, unlocks: ['priorities', 'orders'], orders: 3 },
  { lvl: 5, name: 'Intendant', icon: '🧾', desc: '6 ordres. Commerce, recrutement et recherche automatiques.', cost: { gold: 10000, steel: 400, cloth: 200 }, th: 7, unlocks: ['autoTrade', 'autoTrain', 'autoResearch'], orders: 6 },
  { lvl: 6, name: 'Réseau logistique', icon: '🛤️', desc: '10 ordres. Routes commerciales permanentes, convois automatiques, −15% pertes des chaînes.', cost: { gold: 25000, frames: 150, silver: 60 }, th: 9, unlocks: ['autoConvoy', 'logistics'], orders: 10 },
  { lvl: 7, name: 'Intendance royale', icon: '👑', desc: '16 ordres. Réparation et défense automatiques. Vos conseillers gèrent le quotidien.', cost: { gold: 60000, crystals: 40, rareOre: 30 }, th: 12, unlocks: ['autoRepair', 'autoDefense', 'royal'], orders: 16 },
];

// Conditions des Ordres du royaume
export const ORDER_CONDITIONS = {
  resBelow:   { label: 'SI ressource <', params: ['res', 'value'] },
  resAbove:   { label: 'SI ressource >', params: ['res', 'value'] },
  every:      { label: 'TOUTES LES N minutes', params: ['minutes'] },
  idleWorkers:{ label: 'SI ouvriers inactifs ≥', params: ['value'] },
  unitBelow:  { label: 'SI unités en ville <', params: ['unit', 'value'] },
  raid:       { label: 'SI un raid approche', params: [] },
  damaged:    { label: 'SI un bâtiment est endommagé', params: [], min: 7 },
  season:     { label: 'SI saison =', params: ['season'] },
  expIdle:    { label: 'SI une équipe d’expédition est au repos', params: [] },
};

// Actions des Ordres du royaume (min : palier d'automatisation requis)
export const ORDER_ACTIONS = {
  assign:     { label: 'affecter N ouvriers au secteur', params: ['sector', 'count'], min: 4 },
  sellAbove:  { label: 'vendre le surplus au-delà de', params: ['res', 'value'], min: 5 },
  buy:        { label: 'acheter (quantité)', params: ['res', 'count'], min: 5 },
  train:      { label: 'former N unités', params: ['unit', 'count'], min: 5 },
  relaunch:   { label: 'relancer les équipes au repos', params: [], min: 4 },
  pauseChain: { label: 'mettre en pause la chaîne', params: ['building'], min: 4 },
  resumeChain:{ label: 'relancer la chaîne', params: ['building'], min: 4 },
  brew:       { label: 'distiller des potions de soin', params: ['count'], min: 5 },
  donate:     { label: 'donner à la guilde', params: ['res', 'count'], min: 5 },
  repair:     { label: 'réparer les bâtiments', params: [], min: 7 },
  recall:     { label: 'rappeler toutes les marches', params: [], min: 7 },
  research:   { label: 'lancer la recherche prioritaire', params: [], min: 5 },
};

// Modèles prêts à l'emploi
export const ORDER_TEMPLATES = [
  { name: 'Maintenir la nourriture', cond: { type: 'resBelow', res: 'food', value: 3000 }, action: { type: 'assign', sector: 'food', count: 3 } },
  { name: 'Vendre le surplus de bois', cond: { type: 'resAbove', res: 'wood', value: 8000 }, action: { type: 'sellAbove', res: 'wood', value: 6000 } },
  { name: 'Relancer les expéditions', cond: { type: 'expIdle' }, action: { type: 'relaunch' } },
  { name: 'Garnison minimale', cond: { type: 'unitBelow', unit: 'spearman', value: 30 }, action: { type: 'train', unit: 'spearman', count: 10 } },
  { name: 'Stopper l’acier si le fer manque', cond: { type: 'resBelow', res: 'iron', value: 500 }, action: { type: 'pauseChain', building: 'foundry' } },
  { name: 'Rappel en cas de raid', cond: { type: 'raid' }, action: { type: 'recall' } },
  { name: 'Acheter du charbon', cond: { type: 'resAbove', res: 'gold', value: 20000 }, action: { type: 'buy', res: 'coal', count: 500 } },
  { name: 'Réparations', cond: { type: 'damaged' }, action: { type: 'repair' } },
];
