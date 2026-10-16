// Conséquences des événements après leur fin (v13). Le calendrier, la rotation, les boutiques et les récompenses
// existants ne changent pas : ces effets s'ajoutent UNE fois, à la fin de chaque occurrence (clé unique).
// Règle :
//   - « all »     : conséquence du monde, pour tous les joueurs (participants ou non), TEMPORAIRE (≤ 48 h) et jamais
//                   pénalisante : un absent ne perd rien ;
//   - « won »     : seulement si le joueur a vraiment participé (≥ 500 de monnaie gagnée) — TEMPORAIRE (≤ 48 h) ;
//   - « lasting » : seulement si le joueur a participé — PERMANENT mais modéré (réputation, relation, fragments de
//                   relique, entrée de chronique). Aucun bonus permanent de production ou de combat.
// Un événement raté ne rend donc jamais la partie suivante plus difficile.
export const AFTERMATH_MIN_EARNED = 500;
export const AFTERMATH = {
  steppes: {
    all: { name: 'Pistes des steppes', mods: { 'caravan.speed': 0.05 }, hours: 24, text: 'Les nomades repartis, les pistes de l’est restent ouvertes : caravanes +5 % de vitesse pendant 24 h.' },
    won: { name: 'Cavaliers ralliés', mods: { 'march.speed': 0.06 }, hours: 24 },
    lasting: { rep: { warrior: 6 }, chronicle: 'Les Cavaliers des Steppes se souviennent de {kingdom}.' },
  },
  corsairs: {
    all: { name: 'Mers dégagées', mods: { 'convoy.risk': -0.05 }, hours: 24, text: 'Les corsaires dispersés, les routes côtières sont plus sûres : risque des convois −5 % pendant 24 h.' },
    won: { name: 'Prises de guerre', mods: { 'contract.reward': 0.08 }, hours: 24 },
    lasting: { rep: { merchant: 6 }, chronicle: '{kingdom} a tenu tête aux Corsaires du Sud.' },
  },
  giants: {
    all: { name: 'Dégel', mods: { 'prod.food': 0.05 }, hours: 24, text: 'Le dégel suit l’hiver des géants : nourriture +5 % pendant 24 h.' },
    won: { name: 'Greniers tenus', mods: { 'prod.all': 0.04 }, hours: 24 },
    lasting: { rep: { benefactor: 6 }, chronicle: '{kingdom} a survécu à l’Hiver des Géants.' },
  },
  ruins: {
    all: { name: 'Savoirs exhumés', mods: { 'research.speed': 0.05 }, hours: 24, text: 'Les ruines livrent leurs inscriptions : recherche +5 % pendant 24 h.' },
    won: { name: 'Archives de l’Aube', mods: { 'research.speed': 0.08 }, hours: 24 },
    lasting: { relic: 1, rep: { explorer: 6 }, chronicle: 'Les fouilles des Ruines Anciennes enrichissent le trésor de {kingdom}.' },
  },
  dragonHunt: {
    all: { name: 'Ciel apaisé', mods: { 'explore.speed': 0.05 }, hours: 24, text: 'Le dragon s’est retiré : exploration +5 % pendant 24 h.' },
    won: { name: 'Chasseurs de dragon', mods: { 'combat.atk': 0.04 }, hours: 24 },
    lasting: { rep: { warrior: 8 }, chronicle: 'Les chasseurs de {kingdom} reviennent de la Chasse au Dragon couverts de gloire.' },
  },
  kingdomWar: {
    all: { name: 'Armistice des royaumes', mods: { 'train.speed': 0.05 }, hours: 24, text: 'La guerre des royaumes s’achève : les recrues affluent (formation +5 % pendant 24 h).' },
    won: { name: 'Vétérans de la guerre', mods: { 'combat.morale': 6 }, hours: 24 },
    lasting: { rep: { warrior: 6 }, factionRelation: -4, chronicle: 'La Guerre des Royaumes laisse des rancœurs : les factions se souviennent du rôle de {kingdom}.' },
  },
  goldRush: {
    all: { name: 'Or en circulation', mods: { 'contract.reward': 0.05 }, hours: 24, text: 'L’or de la ruée circule : contrats +5 % pendant 24 h.' },
    won: { name: 'Filons connus', mods: { 'gather.all': 0.08 }, hours: 24 },
    lasting: { rep: { merchant: 6 }, chronicle: '{kingdom} a tiré son épingle de la Ruée vers l’Or.' },
  },
  volcano: {
    all: { name: 'Cendres fertiles', mods: { 'prod.food': 0.05 }, hours: 24, text: 'Les cendres du volcan fertilisent les champs : nourriture +5 % pendant 24 h.' },
    won: { name: 'Roches de feu', mods: { 'loot.rare': 0.05 }, hours: 24 },
    lasting: { relic: 1, chronicle: '{kingdom} a bravé la Colère du Volcan.' },
  },
  deadNight: {
    all: { name: 'Aube retrouvée', mods: { 'combat.morale': 4 }, hours: 24, text: 'La Nuit des Morts s’achève : le moral remonte (+4 pendant 24 h).' },
    won: { name: 'Gardiens de la nuit', mods: { 'city.def': 0.05 }, hours: 24 },
    lasting: { rep: { lord: 6 }, chronicle: '{kingdom} a repoussé la Nuit des Morts.' },
  },
  siege: {
    all: { name: 'Murailles éprouvées', mods: { 'wall.bonus': 0.05 }, hours: 24, text: 'Le siège levé, les maçons ont appris : muraille +5 % pendant 24 h.' },
    won: { name: 'Défenseurs de la Citadelle', mods: { 'city.def': 0.06 }, hours: 48 },
    lasting: { rep: { lord: 8 }, chronicle: 'Une défense réussie : la Citadelle des Anciens a tenu grâce à {kingdom}.' },
  },
  sevenMerchants: {
    all: { name: 'Marchés animés', mods: { 'market.fee': -0.005 }, hours: 24, text: 'Les Sept Marchands partis, les prix restent bas : taxe du marché −0,5 point pendant 24 h.' },
    won: { name: 'Clientèle des Sept', mods: { 'caravan.gain': 0.08 }, hours: 24 },
    lasting: { rep: { merchant: 8 }, chronicle: 'Les Sept Marchands recommandent les comptoirs de {kingdom}.' },
  },
};
