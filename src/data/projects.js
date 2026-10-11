// Grands projets royaux : chantiers de longue haleine en plusieurs étapes, qui relient bâtiments, chaînes de
// production, avant-postes et recherches. Un seul projet à la fois. Chaque étape :
//   cost  : ressources à apporter (contributions partielles possibles, jamais perdues)
//   req   : conditions [texte, (s, h) => bool] vérifiées au lancement des travaux
//   hours : durée des travaux une fois l'étape financée et lancée
// reward : bonus permanents (mods) et effets uniques à l'achèvement ; mark : repère sur la carte du monde.
// Les bonus restent modestes (≈ +5 à +10 %) : ce sont des objectifs de milieu et de fin de partie, pas des raccourcis.
export const PROJECT_MIN_TH = 4;

export const PROJECTS = {
  tradeRoad: {
    name: 'Route commerciale royale', icon: '🛣️', th: 4,
    desc: 'Une chaussée pavée et gardée vers les cités libres : les marchands affluent.',
    stages: [
      { name: 'Tracer la route', cost: { stone: 2500, wood: 1500, gold: 600 }, hours: 1, req: [['Marché niveau 2', (s, h) => h.level('market') >= 2]] },
      { name: 'Paver et jalonner', cost: { stone: 4000, planks: 250, iron: 300 }, hours: 2, req: [['Une cité libre découverte', (s, h) => h.townKnown()]] },
      { name: 'Relais et garnisons', cost: { gold: 2500, food: 2500, rations: 60 }, hours: 3, req: [['Un avant-poste commercial ou militaire', (s, h) => h.outpostCat(['commercial', 'militaire'])]] },
    ],
    reward: { mods: { 'caravan.gain': 0.1, 'contract.reward': 0.05, 'market.fee': -0.005, 'convoy.risk': -0.05 }, text: ['Caravanes +10 %', 'Contrats +5 %', 'Taxe du marché −0,5 point', 'Risque des convois −5 %'] },
    mark: { dx: 3, dy: 1, icon: '🛣️' },
  },
  bridge: {
    name: 'Grand Pont des Cendres', icon: '🌉', th: 5,
    desc: 'Relier les deux rives de la grande rivière pour ouvrir de nouvelles terres aux armées et aux convois.',
    stages: [
      { name: 'Préparer les matériaux', cost: { wood: 3000, stone: 2500, planks: 300 }, hours: 1, req: [['Menuiserie construite', (s, h) => h.level('carpentry') >= 1]] },
      { name: 'Construire les fondations', cost: { stone: 5000, iron: 600, steel: 40 }, hours: 3, req: [['Carrière niveau 6, ou un avant-poste minier', (s, h) => h.level('quarry') >= 6 || h.outpostCat(['minier'])]] },
      { name: 'Achever le passage', cost: { frames: 120, steel: 80, gold: 3000 }, hours: 4, req: [['Hôtel de ville niveau 6', (s, h) => h.level('townhall') >= 6]] },
    ],
    reward: { mods: { 'march.speed': 0.08, 'caravan.speed': 0.1, 'explore.speed': 0.05 }, reveal: 5, text: ['Marches +8 % plus rapides', 'Caravanes +10 % plus rapides', 'Exploration +5 %', 'Une région lointaine révélée'] },
    mark: { dx: -3, dy: 2, icon: '🌉' },
  },
  aqueduct: {
    name: 'Aqueduc royal', icon: '🏞️', th: 5,
    desc: 'Amener l’eau des collines jusqu’aux champs et aux moulins de la cité.',
    stages: [
      { name: 'Captage des sources', cost: { stone: 3000, wood: 1500, gold: 800 }, hours: 1, req: [['Deux fermes', (s, h) => h.count('farm') >= 2]] },
      { name: 'Arches de pierre', cost: { stone: 6000, iron: 500, planks: 200 }, hours: 3, req: [['Moulin construit', (s, h) => h.level('mill') >= 1]] },
      { name: 'Canaux et fontaines', cost: { stone: 3000, gold: 2500, food: 3000 }, hours: 2, req: [['Un avant-poste agricole', (s, h) => h.outpostCat(['agricole'])]] },
    ],
    reward: { mods: { 'prod.food': 0.08, 'prod.grain': 0.1, 'adj.river': 0.25 }, text: ['Nourriture +8 %', 'Blé +10 %', 'Bonus des bâtiments au bord de la rivière +25 %'] },
    mark: { dx: 1, dy: -3, icon: '🏞️' },
  },
  borderFort: {
    name: 'Forteresse frontalière', icon: '🏯', th: 6,
    desc: 'Une citadelle sur la route des envahisseurs : ils seront vus de loin et arrêtés net.',
    stages: [
      { name: 'Choisir le site', cost: { stone: 4000, wood: 2500, food: 2000 }, hours: 1, req: [['Muraille niveau 3', (s) => (s.city.fort?.wall || 0) >= 3]] },
      { name: 'Élever les remparts', cost: { stone: 8000, iron: 1000, steel: 60 }, hours: 4, req: [['Un avant-poste militaire', (s, h) => h.outpostCat(['militaire'])]] },
      { name: 'Armer la garnison', cost: { weapons: 80, rations: 100, gold: 3500 }, hours: 3, req: [['60 soldats de combat', (s, h) => h.combat() >= 60]] },
    ],
    reward: { mods: { 'city.def': 0.08, 'garrison.def': 0.2, 'raid.warning': 0.25 }, text: ['Défense de la ville +8 %', 'Garnisons d’avant-postes +20 %', 'Raids annoncés 25 % plus tôt'] },
    mark: { dx: 4, dy: -2, icon: '🏯' },
  },
  library: {
    name: 'Grande Bibliothèque de l’Aube', icon: '🏛️', th: 6,
    desc: 'Rassembler les archives dispersées de l’Empire dans un seul et immense dépôt du savoir.',
    stages: [
      { name: 'Rassembler les copistes', cost: { gold: 3000, cloth: 120, food: 2000 }, hours: 2, req: [['Bibliothèque niveau 5', (s, h) => h.level('library') >= 5]] },
      { name: 'Bâtir les salles', cost: { stone: 6000, planks: 300, frames: 60 }, hours: 3, req: [['10 technologies', (s) => Object.keys(s.techs || {}).length >= 10]] },
      { name: 'Ouvrir les archives scellées', cost: { crystals: 20, gems: 8, gold: 4000 }, hours: 3, req: [['Un avant-poste du savoir', (s, h) => h.outpostCat(['savoir'])]] },
    ],
    reward: { mods: { 'research.speed': 0.1 }, relic: 2, text: ['Recherche +10 % plus rapide', '2 fragments de relique'] },
    mark: { dx: -2, dy: -3, icon: '🏛️' },
  },
  sanctuary: {
    name: 'Sanctuaire ancestral', icon: '⛩️', th: 8,
    desc: 'Un lieu de mémoire bâti sur une faille de la Fracture, où les cristaux parlent aux érudits.',
    stages: [
      { name: 'Consacrer la faille', cost: { crystals: 25, ancientWood: 20, gold: 4000 }, hours: 2, req: [['Un donjon purgé', (s) => (s.stats.dungeons || 0) >= 1]] },
      { name: 'Ériger les pierres levées', cost: { stone: 10000, gems: 15, rareOre: 15 }, hours: 4, req: [['Deux avant-postes, dont un du savoir', (s, h) => h.outposts() >= 2 && h.outpostCat(['savoir'])]] },
      { name: 'Le chant des cristaux', cost: { crystals: 40, silver: 30, gold: 8000 }, hours: 5, req: [['Hôtel de ville niveau 9', (s, h) => h.level('townhall') >= 9]] },
    ],
    reward: { mods: { 'loot.rare': 0.03, 'relic.find': 0.2, 'prod.all': 0.03 }, relic: 3, text: ['Butin rare +3 %', 'Fragments de relique +20 %', 'Toute production +3 %', '3 fragments de relique'] },
    mark: { dx: 0, dy: 4, icon: '⛩️' },
  },
};
