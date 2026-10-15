// Les Seigneurs de la Brèche : forteresses ennemies (PNJ) qui ÉVOLUENT avec les attaques du joueur.
// Toutes les valeurs d'équilibrage sont ici (paliers, seuils, compositions, récompenses) ; les règles sont dans
// systems/breach.js.
//
// Règle d'évolution (résumé, détaillée dans docs/BRECHE.md) :
//  - chaque forteresse a un niveau (1 à 20) ; 4 paliers de 5 niveaux ;
//  - chaque attaque « méritante » (puissance ennemie ≥ 30 % de la puissance envoyée) ajoute des points de
//    progression : une victoire en donne beaucoup, une défaite un peu (la garnison tire des leçons) ;
//  - une attaque indigne (armée écrasante, ou poignée de soldats envoyés au massacre) ne fait rien évoluer ;
//  - au seuil, la forteresse monte d'un niveau : recrues, murs, formation, unités d'élite, commandant ;
//  - elle s'adapte aussi aux armes qui la battent (contre-unités, jusqu'à +25 %) ;
//  - après une victoire, elle est en ruine un moment (pas de boucle immédiate) ;
//  - au niveau 20, une victoire la fait se réorganiser au niveau 16 avec une nouvelle doctrine (cycle suivant).

export const BREACH_MAX_LEVEL = 20;
export const BREACH_MIN_MERIT = 0.3; // en dessous : attaque indigne (aucune progression, butin réduit, aucun objet rare)
export const BREACH_MAX_LOSS_MERIT = 3.4; // défaite : au-delà, l'attaque était un sacrifice (aucune progression)

export const BREACH_TIERS = [
  { n: 1, key: 'camp', name: 'Camp de pillards', short: 'Camp', from: 1, color: '#c9a36a', fort: 0, ruinsMin: 30,
    desc: 'Palissade de pieux, tentes et pillards mal équipés. Idéal pour apprendre.' },
  { n: 2, key: 'fort', name: 'Forteresse renforcée', short: 'Forteresse', from: 6, color: '#9fb0c2', fort: 0.15, ruinsMin: 60,
    desc: 'Murs de pierre, tours de guet et premiers spécialistes (lanciers montés).' },
  { n: 3, key: 'bastion', name: 'Bastion d’élite', short: 'Bastion', from: 11, color: '#d0703f', fort: 0.3, ruinsMin: 120,
    desc: 'Remparts épais, gardiens lourds et formations difficiles à contrer. Adaptez votre armée.' },
  { n: 4, key: 'citadel', name: 'Citadelle légendaire', short: 'Citadelle', from: 16, color: '#b44bd6', fort: 0.45, ruinsMin: 240,
    desc: 'Un Seigneur de la Brèche commande en personne. Unités rares, mécanismes de défense. Préparez l’assaut.' },
];
export const tierOf = (level) => BREACH_TIERS[Math.min(3, Math.floor((Math.max(1, level) - 1) / 5))];

// Points de progression nécessaires pour passer du niveau L à L+1
export const BREACH_PROGRESS = {
  need: (level) => 12 + level * 2,
  win: (merit) => (merit >= 1 ? 10 : merit >= 0.6 ? 8 : 6),
  loss: 3,
  lossCooldownMin: 30, // une défaite ne compte qu'une fois par demi-heure (pas d'évolution par attaques suicides en série)
};

// Puissance de la garnison (même mesure que armyPower) : ×1,3 par niveau
export const BREACH_POWER = { base: 450, growth: 1.3, cycleBonus: 0.05, cycleMax: 5 };

// Doctrines (spécialisation de la garnison) : parts de chaque rôle avant adaptation
export const BREACH_DOCTRINES = {
  archers:  { name: 'Archers', icon: '🏹', desc: 'Garnison riche en arbalétriers : vos fantassins souffrent à l’approche.', shares: { raider: 0.3, arbalist: 0.5, lancer: 0.1, warden: 0.1 } },
  heavy:    { name: 'Infanterie lourde', icon: '🛡️', desc: 'Gardiens cuirassés : la cavalerie s’y brise, le siège et les tirs percent mieux.', shares: { raider: 0.3, arbalist: 0.15, lancer: 0.05, warden: 0.5 } },
  cavalry:  { name: 'Cavaliers', icon: '🐎', desc: 'Lanciers montés rapides : redoutables contre les tireurs, fragiles face aux piques.', shares: { raider: 0.25, arbalist: 0.15, lancer: 0.5, warden: 0.1 } },
  walls:    { name: 'Fortifications', icon: '🧱', desc: 'Garnison équilibrée derrière des murs renforcés (+15 % de défense des murs) : amenez des engins de siège.', shares: { raider: 0.4, arbalist: 0.3, lancer: 0.1, warden: 0.2 }, fort: 0.15 },
};
// Rôles → unités ennemies, et palier où le rôle apparaît
export const BREACH_ROLES = {
  raider: { unit: 'breachRaider', tier: 1 },
  arbalist: { unit: 'breachArbalist', tier: 1 },
  lancer: { unit: 'breachLancer', tier: 2 },
  warden: { unit: 'breachWarden', tier: 3 },
};
// Adaptation : contre-rôle de chaque classe d'armée du joueur
export const BREACH_COUNTERS = { cavalry: 'warden', ranged: 'lancer', infantry: 'arbalist', siege: 'lancer' };
export const BREACH_ADAPT_MAX = 0.25;

// Formation de la garnison selon le palier et la doctrine
export const breachFormation = (tierN, doctrine) => (tierN <= 1 ? 'balanced' : tierN === 2 ? (doctrine === 'heavy' || doctrine === 'walls' ? 'shieldwall' : 'balanced')
  : { archers: 'skirmish', heavy: 'shieldwall', cavalry: 'pincer', walls: 'shieldwall' }[doctrine] || 'balanced');

// Commandant (palier 4) : un Seigneur de la Brèche en personne + aura (attaque, moral)
export const BREACH_LORD = { unit: 'breachLord', aura: { 'combat.atk': 0.1, 'combat.morale': 10 } };

// Récompenses de victoire (multipliées par 1 + 0,12 × (niveau − 1)) ; butin courant limité par le transport
export const BREACH_REWARDS = [
  { res: { gold: 400, food: 700, wood: 500, iron: 250 }, item: [0.05, 'common'], xp: 30, speedups: [0.3, 'speed5'] },
  { res: { gold: 1200, iron: 900, steel: 60, leather: 60 }, item: [0.2, 'rare'], xp: 80, speedups: [0.4, 'speed15'] },
  { res: { gold: 3000, steel: 220, silver: 20, crystals: 3 }, item: [0.4, 'epic'], xp: 160, speedups: [0.45, 'speed60'] },
  { res: { gold: 7000, steel: 450, silver: 50, rareOre: 8, crystals: 8 }, item: [0.8, 'epic'], legendary: 0.15, relic: 0.3, xp: 300, speedups: { speed60: 1 }, rareSpeedup: [0.15, 'speed480'] },
];
// Première victoire contre un palier : récompense unique (une seule fois par partie)
export const BREACH_FIRST = [
  { res: { gold: 800 }, speedups: { speed15: 2 } },
  { res: { gold: 2500, steel: 100 }, item: 'rare', speedups: { speed60: 1 } },
  { res: { gold: 6000, crystals: 10 }, item: 'epic', speedups: { speed60: 2 } },
  { res: { gold: 15000, rareOre: 20 }, item: 'legendary', relic: 1, speedups: { speed480: 1 } },
];
// Victoire indigne (mérite < 30 %) : seulement une part du butin courant, rien d'autre
export const BREACH_UNWORTHY_LOOT = 0.25;

// Forteresses placées au début de la partie (ou à la migration d'une ancienne sauvegarde)
export const BREACH_SITES = [
  { level: 1, dist: [5, 9], reveal: true },
  { level: 2, dist: [7, 12] },
  { level: 3, dist: [10, 15] },
  { level: 5, dist: [13, 19] },
  { level: 8, dist: [17, 24] },
  { level: 12, dist: [21, 29] },
  { level: 16, dist: [26, 34] },
];

const LORDS = ['Varg le Rouge', 'Hilde Crocs-de-Fer', 'Orm le Borgne', 'Sygna la Pâle', 'Brannoc Brise-Lance', 'Edda Cendrevoile', 'Morcar le Taciturne', 'Ysolde aux Mille Clous', 'Garrick Fendlune', 'Aud la Noire'];
export const breachLordName = (i) => LORDS[((i % LORDS.length) + LORDS.length) % LORDS.length];
