// Les quêtes de l'histoire font désormais partie du parcours guidé (src/data/campaign.js).

// Jalons infinis : objectifs qui montent en paliers
export const MILESTONES = [
  { id: 'm_levels', title: 'Bâtisseur', unit: 'niveaux de bâtiments', value: (s, h) => h.totalLevels(s), tiers: (n) => Math.round(10 * Math.pow(1.6, n)), reward: (n) => ({ gold: 200 * (n + 1), stone: 300 * (n + 1) }) },
  { id: 'm_gather', title: 'Récolteur', unit: 'ressources récoltées', value: (s) => s.stats.gathered || 0, tiers: (n) => Math.round(2000 * Math.pow(2, n)), reward: (n) => ({ gold: 250 * (n + 1), food: 400 * (n + 1) }) },
  { id: 'm_battles', title: 'Conquérant', unit: 'victoires', value: (s) => s.stats.battlesWon || 0, tiers: (n) => Math.round(3 * Math.pow(1.8, n)), reward: (n) => ({ gold: 300 * (n + 1), iron: 300 * (n + 1) }) },
  { id: 'm_explore', title: 'Cartographe', unit: 'explorations', value: (s) => s.stats.explored || 0, tiers: (n) => Math.round(5 * Math.pow(1.7, n)), reward: (n) => ({ gold: 200 * (n + 1), herbs: 40 * (n + 1) }) },
  { id: 'm_heroes', title: 'Mentor', unit: 'niveaux de héros', value: (s) => s.heroes.reduce((a, h) => a + h.level, 0), tiers: (n) => Math.round(10 * Math.pow(1.6, n)), reward: (n) => ({ gold: 300 * (n + 1), gems: n + 1 }) },
];
