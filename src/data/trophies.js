// v20 « Ma forteresse » — Trophées de la vitrine : gagnés par les faits d'armes et les grandes œuvres de la partie,
// jamais achetables. Chaque palier atteint donne un trophée (statue, bannière, obélisque, colonne, arc) à placer dans
// la cour ; il y porte l'ordre public (systems/order.js). Les compteurs sont ceux des statistiques existantes.
export const TROPHY_KINDS = {
  raids: { name: 'Bannière des remparts', shape: 'banner', color: '#c0392b', what: 'raids repoussés', tiers: [5, 15, 30, 60, 100] },
  battles: { name: 'Trophée d’armes', shape: 'statue', color: '#9aa4b8', what: 'victoires', tiers: [25, 100, 250, 500] },
  sieges: { name: 'Bélier brisé', shape: 'column', color: '#a8743f', what: 'places fortes prises', tiers: [1, 5, 15] },
  breach: { name: 'Statue du vainqueur de la Brèche', shape: 'statue', color: '#e2b84a', what: 'forteresses de la Brèche vaincues', tiers: [1, 5, 15] },
  campaigns: { name: 'Arc de triomphe', shape: 'arch', color: '#c99a2e', what: 'campagnes victorieuses', tiers: [1, 3, 6] },
  projects: { name: 'Obélisque de la Couronne', shape: 'obelisk', color: '#2f9c94', what: 'grands projets achevés', tiers: [1, 3, 5] },
  sagas: { name: 'Stèle des sagas', shape: 'obelisk', color: '#3f6fa3', what: 'sagas terminées', tiers: [1, 3, 6] },
  clears: { name: 'Colonne des terres sûres', shape: 'column', color: '#4e7d3a', what: 'sites difficiles nettoyés', tiers: [10, 40, 100] },
};
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI'];
// Une entrée par palier : clé « tr_<sorte>_<n> »
export const TROPHIES = Object.fromEntries(Object.entries(TROPHY_KINDS).flatMap(([k, d]) => d.tiers.map((need, i) => [`tr_${k}_${i + 1}`, { trophy: true, kind: k, tier: i + 1, need, name: `${d.name} ${ROMAN[i]}`, shape: d.shape, color: d.color, icon: '🏆', what: d.what }])));
