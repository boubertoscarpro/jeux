// v22b « Pôles du royaume » — à la place de la longue liste « Lieux », les écrans sont rangés en quatre pôles,
// chacun ouvert par un bouton à côté du globe : Économie, Armée, Royaume, Savoir. Chaque pôle a ses rubriques.
// Tout écran-fenêtre du jeu est dans exactement un pôle (test v22b) ; la recherche de tous les écrans reste (touche L).
export const HUBS = {
  economy: { name: 'Économie', sig: 'moneybag', icon: '💰', key: 'E', blurb: 'Production, ouvriers, commerce et trésor', sections: [
    { name: 'Production', screens: ['ecoReport', 'steward', 'workers', 'chains'] },
    { name: 'Commerce', screens: ['market', 'convoys', 'shop', 'goldshop'] },
    { name: 'Trésor', screens: ['treasury'] },
  ] },
  army: { name: 'Armée', sig: 'swords', icon: '⚔️', key: null, blurb: 'Troupes, défense, héros et équipement', sections: [
    { name: 'Troupes', screens: ['army', 'campaigns', 'defense', 'chores'] },
    { name: 'Héros', screens: ['heroes', 'craft'] },
    { name: 'Gloire', screens: ['challenges'] },
  ] },
  realm: { name: 'Royaume', sig: 'crown', icon: '👑', key: 'K', blurb: 'Gouvernement, diplomatie, fêtes et saison', sections: [
    { name: 'Gouvernement', screens: ['goals', 'policy', 'council', 'projects', 'order'] },
    { name: 'Diplomatie et terres', screens: ['factions', 'guild', 'territories', 'farlands'] },
    { name: 'Fêtes et saison', screens: ['event', 'eventShop', 'calendar', 'kingdom', 'wheel', 'shards'] },
  ] },
  lore: { name: 'Savoir', sig: 'bookOpen', icon: '📖', key: 'J', blurb: 'Recherche, explorations et archives', sections: [
    { name: 'Recherche', screens: ['research', 'talents', 'legacy'] },
    { name: 'Explorations', screens: ['expeditions', 'archaeo', 'legend', 'omens'] },
    { name: 'Archives', screens: ['journal', 'history', 'accomplish', 'codex', 'stats'] },
  ] },
};
export const HUB_ORDER = ['economy', 'army', 'realm', 'lore'];
// Écrans hors pôles : les cartes (château, monde), le livre des quêtes, le profil et les réglages (affichage fixe)
export const HUB_EXEMPT = ['city', 'world', 'questbook', 'profile', 'settings', 'admin'];
export const HUB_OF = {};
for (const [k, h] of Object.entries(HUBS)) for (const sec of h.sections) for (const v of sec.screens) HUB_OF[v] ??= k;
