// Héritage dynastique : traditions (choisies après les grandes étapes, conservées d'une dynastie à l'autre),
// archives des dynasties passées et vestiges laissés dans le nouveau monde (forteresses abandonnées, monuments,
// anciennes alliances et rancunes), avec des défis ancestraux.
export const MAX_TRADITIONS = 5;
export const TRADITIONS = {
  builders: { name: 'Lignée de bâtisseurs', icon: '🏗️', desc: 'Construction +6 %.', mods: { 'build.speed': 0.06 } },
  warriors: { name: 'Sang des guerriers', icon: '⚔️', desc: 'Attaque +4 %, moral +3.', mods: { 'combat.atk': 0.04, 'combat.morale': 3 } },
  merchants: { name: 'Maison marchande', icon: '⚖️', desc: 'Gains des caravanes +6 %.', mods: { 'caravan.gain': 0.06 } },
  scholars: { name: 'Tradition lettrée', icon: '📜', desc: 'Recherche +5 %.', mods: { 'research.speed': 0.05 } },
  explorers: { name: 'Héritiers des explorateurs', icon: '🧭', desc: 'Exploration +8 %, portée des territoires +1.', mods: { 'explore.speed': 0.08, vision: 1 } },
  stewards: { name: 'Intendance héréditaire', icon: '🌾', desc: 'Toute production +3 %.', mods: { 'prod.all': 0.03 } },
  diplomats: { name: 'Lignée de diplomates', icon: '🤝', desc: 'Frais de marché −1 % ; chaque nouvelle dynastie commence avec +10 de relation auprès de toutes les factions.', mods: { 'market.fee': -0.01 }, relation: 10 },
  keepers: { name: 'Gardiens des remparts', icon: '🛡️', desc: 'Défense de la ville +8 %, défense des garnisons +5 %.', mods: { 'city.def': 0.08, 'garrison.def': 0.05 } },
};

// Épreuves de tradition : chaque tradition adoptée ouvre, à chaque dynastie, une épreuve dans son style.
// La réussir rapporte des points d'héritage et un titre (une fois par dynastie et par tradition) : les traditions
// orientent les choix de jeu au lieu d'empiler des bonus sans fin.
const lvl = (s, t) => Object.values(s.city.buildings).filter((b) => b.type === t).reduce((m, b) => Math.max(m, b.level), 0);
export const TRADITION_TRIALS = {
  builders: { text: 'Élever le monument dynastique à son 3e stade', check: (s) => [lvl(s, 'monument'), 3], title: 'Maître d’œuvre de la lignée' },
  warriors: { text: 'Remporter 10 victoires méritées contre les Seigneurs de la Brèche', check: (s) => [s.stats.breachWins || 0, 10], title: 'Fléau de la Brèche' },
  merchants: { text: 'Faire de deux cités libres des cités marchandes de rang 2', check: (s) => [Object.values(s.world.pois).filter((p) => p.type === 'town' && (p.rank || 0) >= 2).length, 2], title: 'Fondateur de comptoirs' },
  scholars: { text: 'Terminer 30 recherches', check: (s) => [Object.keys(s.techs || {}).length, 30], title: 'Gardien du savoir' },
  explorers: { text: 'Inscrire 15 lieux différents au codex', check: (s) => [Object.keys(s.codex?.seen?.place || {}).length, 15], title: 'Arpenteur des Terres Brisées' },
  stewards: { text: 'Faire naître 3 hameaux autour de vos avant-postes', check: (s) => [Object.values(s.territories || {}).filter((t) => t.hamlet).length, 3], title: 'Père des hameaux' },
  diplomats: { text: 'Tenir deux alliances en même temps', check: (s) => [(s.factions || []).filter((f) => f.stance === 'alliance').length, 2], title: 'Tisseur d’alliances' },
  keepers: { text: 'Repousser 10 raids', check: (s) => [s.stats.raidsRepelled || 0, 10], title: 'Rempart vivant' },
};
export const TRIAL_POINTS = 2;

// Grandes étapes donnant le choix d'une tradition (une fois par dynastie chacune)
export const MILESTONES = {
  th8: { name: 'Hôtel de ville niveau 8', icon: '🏛️' },
  feat: { name: 'Premier haut fait : grand projet achevé, campagne victorieuse ou mystère résolu', icon: '🏆' },
  th12: { name: 'Hôtel de ville niveau 12', icon: '👑' },
};

// Vestiges laissés par la dynastie précédente
export const REMNANTS = {
  fort: { name: 'Forteresse abandonnée', icon: '🏚️', restore: (lvl) => ({ stone: 400 * lvl, wood: 300 * lvl, gold: 200 * lvl }), loot: (lvl) => ({ stone: 600 * lvl, iron: 200 * lvl, gold: 300 * lvl }) },
  monument: { name: 'Monument ancestral', icon: '🗿', restore: () => ({ stone: 1200, gold: 800 }), mods: { 'prod.all': 0.02 } },
};
export const ANCESTRAL = { allyRelation: 20, grudgeRelation: -20, challengePoints: 3, surpassPoints: 2, maxForts: 4 };
