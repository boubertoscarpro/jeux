// Conseil royal : cinq groupes d'influence défendent des intérêts opposés. Chacun a une faveur (0 à 100) qui tend
// vers une cible : 50, plus les pressions visibles (priorité royale, famine, impôts, campagnes, recherche) et la
// mémoire des décisions récentes (48 h). Loyal (≥ 70) : bonus ; hostile (≤ 30) : malus. Toutes les 5 h, un groupe
// présente une motion au conseil ; chaque option favorise un groupe et en mécontente souvent un autre.
export const COUNCIL_MIN_TH = 5;
export const COUNCIL = { drift: 3, loyal: 70, hostile: 30, memoryH: 48, sessionH: 5, deadlineH: 3, ignorePenalty: -8 };

export const GROUPS = {
  merchants: { name: 'Guilde des marchands', icon: '⚖️', leader: 'Maîtresse Ysolde',
    loyal: { mods: { 'caravan.gain': 0.1, 'market.fee': -0.02 }, text: 'Caravanes +10 %, frais de marché −2 %' },
    hostile: { mods: { 'caravan.gain': -0.1 }, text: 'Caravanes −10 %' } },
  army: { name: 'État-major', icon: '⚔️', leader: 'Maréchal Gaudry',
    loyal: { mods: { 'combat.atk': 0.05, 'train.speed': 0.1 }, text: 'Attaque +5 %, entraînement +10 %' },
    hostile: { mods: { 'combat.atk': -0.05 }, text: 'Attaque −5 %' } },
  peasants: { name: 'Assemblée des villages', icon: '🌾', leader: 'Mère Berthe',
    loyal: { mods: { 'prod.food': 0.08, 'prod.grain': 0.08 }, stab: 5, text: 'Nourriture et grain +8 %, stabilité des provinces +5' },
    hostile: { mods: { 'prod.food': -0.08 }, stab: -5, text: 'Nourriture −8 %, stabilité des provinces −5' } },
  scholars: { name: 'Collège des érudits', icon: '📜', leader: 'Recteur Anselme',
    loyal: { mods: { 'research.speed': 0.08 }, text: 'Recherche +8 %' },
    hostile: { mods: { 'research.speed': -0.08 }, text: 'Recherche −8 %' } },
  nobles: { name: 'Chambre des nobles', icon: '👑', leader: 'Duc Héloïn',
    loyal: { mods: { 'prod.gold': 0.08 }, text: 'Or +8 %' },
    hostile: { mods: { 'build.speed': -0.1 }, text: 'Construction −10 %' } },
};
export const GROUP_ORDER = Object.keys(GROUPS);

// Pressions de la priorité royale (points de cible)
export const POLICY_PRESSURE = {
  prosperity: { peasants: 10, nobles: -5 },
  defense: { army: 12, merchants: -5 },
  expansion: { nobles: 10, peasants: -5 },
  commerce: { merchants: 12, army: -5 },
};

// Motions. fx : favor (variation immédiate ; la moitié reste en mémoire 48 h), cost, res (×niveau d'HDV),
// buff, units, stab (stabilité de toutes les provinces). Les montants « perTh » sont multipliés par le niveau d'HDV.
export const MOTIONS = {
  tolls: { group: 'merchants', title: 'Abolir les péages intérieurs', text: 'La guilde réclame la fin des péages seigneuriaux qui ralentissent les caravanes.',
    options: [
      { label: 'Abolir les péages', favor: { merchants: 14, nobles: -10 }, buff: { name: 'Routes sans péage', mods: { 'caravan.gain': 0.15 }, hours: 24 } },
      { label: 'Maintenir les péages', favor: { merchants: -10, nobles: 6 }, resPerTh: { gold: 120 } },
    ] },
  monopoly: { group: 'merchants', title: 'Monopole des guildes', text: 'Les marchands demandent l’exclusivité du commerce du drap et du sel.',
    options: [
      { label: 'Accorder le monopole', favor: { merchants: 14, peasants: -8 }, buff: { name: 'Monopole des guildes', mods: { 'prod.gold': 0.1 }, hours: 24 } },
      { label: 'Refuser', favor: { merchants: -10, peasants: 6 } },
    ] },
  pay: { group: 'army', title: 'Augmenter la solde', text: 'Le maréchal rappelle que les soldats n’ont pas été augmentés depuis la Fracture.',
    options: [
      { label: 'Augmenter la solde', costPerTh: { gold: 150 }, favor: { army: 16 }, buff: { name: 'Troupes bien payées', mods: { 'combat.atk': 0.06 }, hours: 24 } },
      { label: 'Refuser', favor: { army: -12, merchants: 5 } },
    ] },
  conscription: { group: 'army', title: 'Lever des recrues', text: 'L’état-major veut enrôler les fils de paysans pour renforcer les garnisons.',
    options: [
      { label: 'Conscription', favor: { army: 10, peasants: -14 }, units: { spearman: 4 } },
      { label: 'Volontaires seulement', favor: { army: -8, peasants: 6 } },
    ] },
  grain: { group: 'peasants', title: 'Distribuer le grain', text: 'Une mauvaise récolte menace les villages : l’Assemblée demande l’ouverture des greniers royaux.',
    options: [
      { label: 'Ouvrir les greniers', costPerTh: { food: 300 }, favor: { peasants: 16, merchants: -5 }, stab: 8 },
      { label: 'Garder les réserves', favor: { peasants: -12 } },
    ] },
  corvee: { group: 'nobles', title: 'Corvées royales', text: 'Les nobles proposent d’imposer des corvées aux villages pour accélérer les chantiers.',
    options: [
      { label: 'Imposer les corvées', favor: { nobles: 8, peasants: -14 }, buff: { name: 'Corvées royales', mods: { 'build.speed': 0.2 }, hours: 12 } },
      { label: 'Y renoncer', favor: { nobles: -6, peasants: 8 } },
    ] },
  academy: { group: 'scholars', title: 'Financer l’académie', text: 'Le recteur demande des fonds pour une nouvelle salle d’étude et des instruments.',
    options: [
      { label: 'Financer', costPerTh: { gold: 180 }, cost: { crystals: 3 }, favor: { scholars: 16 }, buff: { name: 'Académie financée', mods: { 'research.speed': 0.15 }, hours: 24 } },
      { label: 'Refuser', favor: { scholars: -12, army: 4 } },
    ] },
  pamphlets: { group: 'scholars', title: 'Les pamphlets des étudiants', text: 'Des étudiants raillent la noblesse dans des pamphlets ; le duc exige leur interdiction.',
    options: [
      { label: 'Censurer', favor: { nobles: 10, scholars: -14 } },
      { label: 'Tolérer', favor: { scholars: 10, nobles: -10 }, buff: { name: 'Libre débat', mods: { 'research.speed': 0.06 }, hours: 12 } },
    ] },
  fiefs: { group: 'nobles', title: 'Accorder des fiefs', text: 'Le duc réclame des terres pour les cadets de la noblesse, en échange d’un don au trésor.',
    options: [
      { label: 'Accorder les fiefs', favor: { nobles: 16, peasants: -10 }, resPerTh: { gold: 250 } },
      { label: 'Refuser', favor: { nobles: -12, peasants: 5 } },
    ] },
  nobleTax: { group: 'peasants', title: 'Un impôt sur la noblesse', text: 'L’Assemblée propose que les nobles paient enfin leur part de l’impôt.',
    options: [
      { label: 'Lever l’impôt', favor: { nobles: -16, peasants: 10 }, resPerTh: { gold: 350 } },
      { label: 'Y renoncer', favor: { nobles: 6, peasants: -6 } },
    ] },
  borders: { group: 'army', title: 'Fermer les frontières ?', text: 'Des espions ennemis se mêleraient aux marchands. L’armée veut fermer les routes, la guilde s’y oppose.',
    options: [
      { label: 'Fermer les frontières', favor: { army: 12, merchants: -12 }, buff: { name: 'Frontières fermées', mods: { 'city.def': 0.15 }, hours: 24 } },
      { label: 'Garder les routes ouvertes', favor: { merchants: 12, army: -10 }, buff: { name: 'Routes ouvertes', mods: { 'caravan.speed': 0.15 }, hours: 24 } },
    ] },
  fair: { group: 'merchants', title: 'Grande foire royale', text: 'Marchands et villageois proposent une foire sur la place du château.',
    options: [
      { label: 'Organiser la foire', costPerTh: { gold: 120, food: 150 }, favor: { merchants: 10, peasants: 10, nobles: -6 }, stab: 4 },
      { label: 'Remettre à plus tard', favor: { merchants: -5, peasants: -5 } },
    ] },
};
