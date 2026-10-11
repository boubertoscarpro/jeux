// Expéditions légendaires : rares, préparées, à plusieurs étapes. Chacune se débloque par un indice lié à un autre
// système (fouilles, boss, factions, dynastie). Le joueur prépare provisions, escorte et chef, choisit un itinéraire,
// tranche deux événements en chemin, affronte l'épreuve finale, puis décide du sort de la découverte.
// Effets d'un choix (fx) : supplies (provisions consommées), morale (moral de l'escorte), power (force, en %),
// losses (part de l'escorte perdue), delay (minutes), res (ressources), xp (expérience du chef).
// final.cal : force du gardien relative à l'escorte (calibrée par simulation : une préparation médiocre échoue,
// une préparation correcte l'emporte le plus souvent). need : condition du choix (stat du chef ≥ valeur, ressources, provisions restantes).
export const LEGEND_MIN_TH = 6;
export const PROVISIONS = {
  light: { name: 'Légères', supplies: 1, cost: { food: 400 }, desc: 'Rapide à réunir, mais peu de marge.' },
  normal: { name: 'Ordinaires', supplies: 2, cost: { food: 900, bread: 60 }, desc: 'De quoi faire face à un imprévu.' },
  abundant: { name: 'Abondantes', supplies: 3, cost: { food: 1600, bread: 140, rations: 20 }, desc: 'Le confort d’une longue route.' },
};
export const ESCORTS = { small: { name: 'Petite escorte', share: 0.15 }, medium: { name: 'Escorte solide', share: 0.3 }, large: { name: 'Grande escorte', share: 0.5 } };
export const FATES = {
  keep: { name: 'La garder au trésor royal', icon: '👑', desc: 'Un artefact rejoint vos collections.' },
  give: { name: 'L’offrir à une faction amie', icon: '🤝', desc: 'Relation +25 et souvenir durable (+30) auprès de la faction la mieux disposée.' },
  archive: { name: 'L’exposer aux archives de la dynastie', icon: '📜', desc: '+2 points d’héritage à la prochaine fondation de dynastie et une entrée aux archives.' },
  sell: { name: 'La vendre à un collectionneur', icon: '💎', desc: '+20 gemmes et 2 500 or.' },
};

const EV = {
  ford: { title: 'Le gué en crue', text: 'La rivière a débordé : le gué est noyé sous une eau boueuse.', choices: [
    { label: 'Attendre la décrue', hint: '+30 min, une ration consommée.', fx: { delay: 30, supplies: -1 } },
    { label: 'Traverser malgré tout', hint: 'Rapide, mais l’escorte risque des pertes.', fx: { losses: 0.12, morale: -5 } },
    { label: 'Bâtir un radeau (200 bois)', hint: 'Sûr et sans perte de temps.', fx: { res: { wood: -200 } }, need: { res: { wood: 200 } } },
  ] },
  ambush: { title: 'Une embuscade', text: 'Des pillards surgissent des fourrés et encerclent la colonne.', choices: [
    { label: 'Charger', hint: 'Combat rapide : pertes, mais le moral monte.', fx: { losses: 0.1, morale: 8, xp: 80 } },
    { label: 'Négocier (chef rusé)', hint: 'Ruse ≥ 25 : passage contre quelques vivres.', fx: { supplies: -1, morale: 2 }, need: { stat: ['cunning', 25] } },
    { label: 'Fuir par les crêtes', hint: '+25 min, moral en baisse.', fx: { delay: 25, morale: -6 } },
  ] },
  storm: { title: 'La tempête de neige', text: 'Une tempête cloue la colonne sur place. Le froid mord.', choices: [
    { label: 'Allumer de grands feux', hint: 'Une ration consommée ; le moral tient.', fx: { supplies: -1, morale: 3 } },
    { label: 'Avancer coûte que coûte', hint: 'Pertes et fatigue.', fx: { losses: 0.08, power: -8 } },
  ] },
  shrine: { title: 'Un sanctuaire oublié', text: 'Au détour du chemin, un sanctuaire couvert de mousse. Des offrandes y pourrissent depuis des siècles.', choices: [
    { label: 'Prier et laisser une offrande (300 or)', hint: 'Moral +10.', fx: { res: { gold: -300 }, morale: 10 }, need: { res: { gold: 300 } } },
    { label: 'Fouiller le sanctuaire (chef savant)', hint: 'Savoir ≥ 25 : un indice sur le gardien (force +12 %).', fx: { power: 12, xp: 60 }, need: { stat: ['lore', 25] } },
    { label: 'Passer son chemin', hint: 'Rien ne se passe.', fx: {} },
  ] },
  deserters: { title: 'Des déserteurs', text: 'Une poignée de soldats d’une faction voisine demandent à rejoindre la colonne.', choices: [
    { label: 'Les accueillir', hint: 'Force +8 %, mais une ration en plus à partager.', fx: { power: 8, supplies: -1 } },
    { label: 'Les renvoyer', hint: 'Aucun risque.', fx: {} },
  ] },
  sickness: { title: 'La fièvre des marais', text: 'Plusieurs hommes grelottent de fièvre.', choices: [
    { label: 'Soigner avec les herbes (80 herbes)', hint: 'Tout le monde repart.', fx: { res: { herbs: -80 } }, need: { res: { herbs: 80 } } },
    { label: 'Laisser les malades au camp', hint: 'Pertes, mais pas de retard.', fx: { losses: 0.1 } },
    { label: 'Attendre qu’ils guérissent', hint: '+40 min et une ration.', fx: { delay: 40, supplies: -1 } },
  ] },
};

export const LEGENDS = {
  firstKingTomb: {
    name: 'Le Tombeau du Premier Roi', icon: '⚱️', unlock: 'mystery', unlockText: 'Un mystère archéologique résolu évoque la sépulture du premier roi de l’Aube.',
    desc: 'Au-delà des collines de cendre, la tombe du fondateur garde, dit-on, sa couronne et ses archives.',
    routes: [
      { id: 'hills', name: 'Par les collines', desc: 'Route sûre mais longue.', legMin: 35, events: ['ford', 'shrine'] },
      { id: 'ash', name: 'À travers les terres de cendre', desc: 'Plus court, plus dangereux.', legMin: 20, events: ['ambush', 'sickness'], guard: 1.15 },
    ],
    final: { name: 'Le gardien de pierre', cal: 0.8, enemies: { ancientSoldier: 14, ruinKeeper: 1 }, terrain: 'ruins' },
    reward: { res: { gold: 3000 }, relic: 2 },
  },
  dragonPeak: {
    name: 'Le Pic du Dragon endormi', icon: '🐉', unlock: 'boss', unlockText: 'Depuis la chute d’un boss mondial, des bergers parlent d’un dragon qui dort sur un trésor.',
    desc: 'Un sommet enneigé où un vieux dragon veille sur l’or des royaumes disparus.',
    routes: [
      { id: 'pass', name: 'Par le col', desc: 'Neige et tempêtes.', legMin: 30, events: ['storm', 'deserters'] },
      { id: 'forest', name: 'Par la forêt noire', desc: 'Ombres et embuscades.', legMin: 30, events: ['ambush', 'shrine'] },
    ],
    final: { name: 'Le dragon réveillé', cal: 0.47, enemies: { dragonling: 6, dragon: 1 }, terrain: 'mountain' },
    reward: { res: { gold: 5000, gems: 15 }, relic: 1 },
  },
  lostEmbassy: {
    name: 'L’Ambassade perdue', icon: '🕊️', unlock: 'faction', unlockText: 'Une faction amie vous confie la carte d’une ambassade disparue depuis la Fracture.',
    desc: 'Une ambassade de l’ancien Empire, engloutie par la forêt, qui conserverait les sceaux de tous les royaumes.',
    routes: [
      { id: 'river', name: 'Le long du fleuve', desc: 'Gués et marais.', legMin: 30, events: ['ford', 'sickness'] },
      { id: 'road', name: 'Par l’ancienne voie impériale', desc: 'Pavée, mais fréquentée.', legMin: 25, events: ['ambush', 'deserters'] },
    ],
    final: { name: 'Les gardiens de l’ambassade', cal: 1.13, enemies: { warden: 10, royalArcher: 8 }, terrain: 'forest' },
    reward: { res: { gold: 2500, silver: 25 }, relic: 1 },
  },
  ancestorVault: {
    name: 'La Crypte des Ancêtres', icon: '🕯️', unlock: 'dynasty', unlockText: 'Les archives de votre lignée (ou les fondations de votre monument) mentionnent une crypte scellée.',
    desc: 'Sous les ruines d’une forteresse oubliée, les premiers seigneurs de votre lignée auraient caché leur héritage.',
    routes: [
      { id: 'crypt', name: 'Par les catacombes', desc: 'Sombre et humide.', legMin: 25, events: ['sickness', 'shrine'] },
      { id: 'ruins', name: 'Par les ruines en surface', desc: 'Exposé aux pillards.', legMin: 25, events: ['ambush', 'storm'] },
    ],
    final: { name: 'Les spectres de la crypte', cal: 0.57, enemies: { wraith: 10, skeleton: 14, boneKing: 1 }, terrain: 'ruins' },
    reward: { res: { gold: 2000, crystals: 20 }, relic: 2 },
  },
};
export const LEGEND_EVENTS = EV;
