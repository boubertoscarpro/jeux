// Quêtes du royaume : chaînes en plusieurs étapes, par catégorie, qui prolongent le parcours guidé (chapitres).
// Chaque étape est détectée à partir de l'état réel : check(s, h) → [progression, objectif]. h.d('stat') mesure
// une statistique DEPUIS l'ouverture de l'étape (rien n'est compté rétroactivement). La quête s'ouvre quand
// unlock(s, h) devient vrai ; unlockText explique comment la débloquer.
// Récompenses : { res, item, rep, relic, xp, buff } (voir systems/rewards.js), volontairement modestes.

export const QUEST_CATS = {
  story: { name: 'Histoire', icon: '📜', desc: 'Les secrets des Terres Brisées et la suite de la campagne.' },
  dev: { name: 'Développement', icon: '🏗️', desc: 'Construire, améliorer et optimiser le royaume.' },
  explore: { name: 'Exploration', icon: '🧭', desc: 'Découvrir des lieux, des ruines et des régions.' },
  military: { name: 'Militaire', icon: '⚔️', desc: 'Défendre le royaume, vaincre et conquérir.' },
  trade: { name: 'Commerce', icon: '⚖️', desc: 'Contrats, caravanes et échanges.' },
  diplo: { name: 'Diplomatie', icon: '🕊️', desc: 'Relations avec les factions et les cités.' },
  outpost: { name: 'Avant-postes', icon: '🚩', desc: 'Fonder, développer et défendre vos positions.' },
  legacy: { name: 'Héritage', icon: '🌟', desc: 'Objectifs de maîtrise et de prestige de fin de partie (facultatifs).' },
};

const DANGER_SITES = ['ruinSite', 'crypt', 'dungeon', 'lostCity', 'abandonedMine'];
const seenSite = (s, types) => Object.values(s.world.pois).some((p) => types.includes(p.type) && s.world.revealed[p.y * s.world.size + p.x]);
const outposts = (s) => Object.values(s.territories || {});

export const QUESTLINES = [
  // ───────── Histoire ─────────
  {
    id: 'story_echoes', cat: 'story', icon: '🌫️', title: 'Les Échos de la Fracture',
    intro: 'Un vieux cartographe affirme que la Fracture n’a pas seulement brisé la terre : elle a réveillé quelque chose sous les ruines de l’Aube.',
    unlock: (s) => (s.campaign?.chapter || 1) >= 3, unlockText: 'Atteignez le chapitre 3 du parcours guidé.',
    steps: [
      { title: 'Le récit du cartographe', desc: 'Explorez 6 nouvelles cases de brouillard.', check: (s, h) => [h.d('explored'), 6], reward: { res: { gold: 200, food: 200 } }, view: 'world' },
      { title: 'Les pierres qui chantent', desc: 'Découvrez une ruine, une crypte, une mine abandonnée ou un donjon sur la carte.', check: (s) => [seenSite(s, DANGER_SITES) ? 1 : 0, 1], reward: { res: { stone: 300, herbs: 30 }, rep: { explorer: 10 } }, view: 'world' },
      { title: 'Ce que gardent les morts', desc: 'Remportez 2 combats sur la carte (camps, repaires, ruines…).', check: (s, h) => [h.d('battlesWon'), 2], reward: { res: { iron: 200 }, item: 'rare' }, view: 'world' },
      { title: 'L’éclat sous la cendre', desc: 'Nettoyez un site de danger 3 ou plus.', check: (s, h) => [h.d('hardClears'), 1], reward: { res: { gold: 400, crystals: 2 } }, view: 'world' },
    ],
    final: { relic: 1, rep: { explorer: 15 }, res: { gold: 300 } },
  },
  {
    id: 'story_crown', cat: 'story', icon: '👑', title: 'La Couronne de l’Aube',
    intro: 'Les échos mènent à une légende : la couronne du dernier roi de l’Aube dormirait au plus profond des donjons. Qui la portera unira les Terres Brisées.',
    unlock: (s) => !!s.questlines?.done?.story_echoes && (Object.values(s.city.buildings).find((b) => b.type === 'townhall')?.level || 0) >= 4, unlockText: 'Terminez « Les Échos de la Fracture » et atteignez l’hôtel de ville 4.',
    steps: [
      { title: 'Les archives scellées', desc: 'Terminez 6 recherches au total.', check: (s) => [Object.keys(s.techs || {}).length, 6], reward: { res: { gold: 500 }, xp: 150 }, view: 'research' },
      { title: 'Le sceau de cristal', desc: 'Réunissez 10 cristaux (fouilles, grottes, donjons, Fracture).', check: (s) => [Math.floor(s.resources.crystals || 0), 10], reward: { res: { steel: 50 } }, view: 'world' },
      { title: 'Le gardien des profondeurs', desc: 'Purgez entièrement un donjon.', check: (s, h) => [h.d('dungeons'), 1], reward: { item: 'epic' }, view: 'world' },
      { title: 'Le trône vide', desc: 'Hôtel de ville niveau 8.', check: (s, h) => [h.level(s, 'townhall'), 8], reward: { res: { gold: 2500, crystals: 8 }, rep: { lord: 20 } }, view: 'city' },
    ],
    final: { relic: 2, item: 'epic', rep: { lord: 15 } },
  },
  {
    id: 'story_rivals', cat: 'diplo', icon: '⚜️', title: 'Les Couronnes rivales',
    intro: 'Cinq maisons se disputent ce qui reste de l’Empire. Avant de choisir entre la plume et l’épée, il faut les connaître.',
    unlock: (s, h) => h.level(s, 'townhall') >= 3 && (s.campaign?.chapter || 1) >= 5, unlockText: 'Hôtel de ville 3 et chapitre 5 du parcours guidé.',
    steps: [
      { title: 'Connaître ses voisins', desc: 'Consultez l’écran des factions (Monde → Factions).', check: (s) => [s.campaign?.flags?.['view:factions'] ? 1 : 0, 1], reward: { res: { gold: 150 } }, view: 'factions' },
      { title: 'L’émissaire', desc: 'Envoyez un ambassadeur auprès d’une faction.', check: (s, h) => [h.d('envoys'), 1], reward: { res: { gold: 250 }, rep: { diplomat: 10 } }, view: 'factions' },
      { title: 'Lire dans le jeu adverse', desc: 'Espionnez la garnison d’un royaume rival (Carte → royaume → Espionner).', check: (s) => [Object.values(s.world.pois).some((p) => p.type === 'kingdom' && (p.scouted || p.garrison)) ? 1 : 0, 1], reward: { res: { iron: 200, gold: 150 } }, view: 'world' },
      { title: 'La plume ou l’épée', desc: 'Obtenez une relation de 30 avec une faction, ou un traité (trêve, pacte, alliance, tribut).', check: (s) => [(s.factions || []).some((f) => f.relation >= 30 || ['trade', 'alliance', 'truce', 'tributary'].includes(f.stance)) ? 1 : 0, 1], reward: { res: { gold: 600, silver: 4 } }, view: 'factions' },
    ],
    final: { rep: { diplomat: 15 }, res: { gold: 400 } },
  },
  // ───────── Développement ─────────
  {
    id: 'dev_wood', cat: 'dev', icon: '🪓', title: 'L’industrie du bois',
    intro: 'Charpentes, palissades, navires : tout commence par une bonne scie.',
    unlock: (s, h) => h.count(s, 'sawmill') >= 1, unlockText: 'Construisez une scierie.',
    steps: [
      { title: 'Deux scieries', desc: 'Ayez 2 scieries (près des forêts : +15 %).', check: (s, h) => [h.count(s, 'sawmill'), 2], reward: { res: { stone: 200, gold: 80 } }, view: 'city' },
      { title: 'Scie affûtée', desc: 'Améliorez une scierie au niveau 4.', check: (s, h) => [h.level(s, 'sawmill'), 4], reward: { res: { gold: 200, food: 150 } }, view: 'city' },
      { title: 'Bois d’œuvre', desc: 'Produisez 100 planches (Menuiserie, hôtel de ville 3).', check: (s, h) => [h.prod('planks'), 100], reward: { res: { wood: 500, iron: 100 } }, view: 'city' },
    ],
    final: { res: { gold: 300 }, rep: { lord: 8 } },
  },
  {
    id: 'dev_stone', cat: 'dev', icon: '🧱', title: 'Fondations de pierre',
    intro: 'Un royaume qui veut durer bâtit en pierre, et protège ses réserves.',
    unlock: (s, h) => h.count(s, 'quarry') >= 1, unlockText: 'Construisez une carrière.',
    steps: [
      { title: 'Deux carrières', desc: 'Ayez 2 carrières (près des montagnes : +15 %).', check: (s, h) => [h.count(s, 'quarry'), 2], reward: { res: { wood: 200, gold: 80 } }, view: 'city' },
      { title: 'Taille de précision', desc: 'Améliorez une carrière au niveau 4.', check: (s, h) => [h.level(s, 'quarry'), 4], reward: { res: { gold: 200, iron: 80 } }, view: 'city' },
      { title: 'Des greniers à l’abri', desc: 'Améliorez l’entrepôt au niveau 3 (capacité et protection contre les pillages).', check: (s, h) => [h.level(s, 'warehouse'), 3], reward: { res: { wood: 400, stone: 400 } }, view: 'city' },
    ],
    final: { res: { gold: 300 }, rep: { lord: 8 } },
  },
  {
    id: 'dev_roads', cat: 'dev', icon: '🛤️', title: 'Les routes du royaume',
    intro: 'Les charrettes s’embourbent : des routes pavées relieraient enfin les ateliers à l’hôtel de ville.',
    unlock: (s, h) => h.level(s, 'townhall') >= 2, unlockText: 'Hôtel de ville niveau 2.',
    steps: [
      { title: 'Paver le chemin', desc: 'Construisez 3 routes pavées.', check: (s, h) => [h.count(s, 'road'), 3], reward: { res: { stone: 150 } }, view: 'city' },
      { title: 'Un réseau utile', desc: 'Reliez 4 bâtiments au réseau de routes de l’hôtel de ville (+5 % chacun).', check: (s, h) => [h.roadLinked(), 4], reward: { res: { gold: 250, wood: 200 } }, view: 'city' },
      { title: 'Une ville qui grandit', desc: 'Hôtel de ville niveau 4.', check: (s, h) => [h.level(s, 'townhall'), 4], reward: { res: { gold: 400, stone: 300 } }, view: 'city' },
    ],
    final: { buff: { name: 'Routes fraîchement pavées', mods: { 'build.speed': 0.1 }, hours: 6 }, rep: { lord: 6 } },
  },
  {
    id: 'dev_food', cat: 'dev', icon: '🌾', title: 'Greniers de l’hiver',
    intro: 'Les anciens se souviennent de l’Hiver des Géants. Cette fois, les greniers seront pleins.',
    unlock: (s, h) => h.count(s, 'farm') >= 1, unlockText: 'Construisez une ferme.',
    steps: [
      { title: 'Champs fertiles', desc: 'Ayez 3 fermes, ou une ferme de niveau 5.', check: (s, h) => [Math.max(h.count(s, 'farm'), h.level(s, 'farm') >= 5 ? 3 : 0), 3], reward: { res: { food: 300, wood: 150 } }, view: 'city' },
      { title: 'Excédent durable', desc: 'Atteignez un bilan de nourriture de +100/h.', check: (s, h) => [Math.max(0, Math.floor(h.foodNet())), 100], reward: { res: { gold: 250, grain: 100 } }, view: 'ecoReport' },
      { title: 'Le pain des longues nuits', desc: 'Produisez 60 pains (Ferme → Moulin → Boulangerie).', check: (s, h) => [h.prod('bread'), 60], reward: { res: { gold: 300, herbs: 40 } }, view: 'chains' },
    ],
    final: { res: { food: 800 }, rep: { benefactor: 10 } },
  },
  // ───────── Exploration ─────────
  {
    id: 'ex_frontier', cat: 'explore', icon: '🗺️', title: 'Au-delà de la frontière',
    intro: 'Les éclaireurs reviennent avec des récits de cités libres et de vallées oubliées.',
    unlock: (s) => (s.stats.explored || 0) >= 1, unlockText: 'Explorez une première case (Carte → Explorer).',
    steps: [
      { title: 'Repousser le brouillard', desc: 'Explorez 10 nouvelles cases.', check: (s, h) => [h.d('explored'), 10], reward: { res: { gold: 200, food: 200 } }, view: 'world' },
      { title: 'Les cités libres', desc: 'Découvrez 2 cités libres.', check: (s) => [Object.values(s.world.pois).filter((p) => p.type === 'town' && s.world.revealed[p.y * s.world.size + p.x]).length, 2], reward: { res: { gold: 300 }, rep: { explorer: 8 } }, view: 'world' },
      { title: 'Vivre de la terre', desc: 'Ramenez 3 récoltes de sites de la carte.', check: (s, h) => [h.d('gatherDone'), 3], reward: { res: { wood: 300, stone: 300, iron: 100 } }, view: 'world' },
    ],
    final: { res: { gold: 300 }, rep: { explorer: 12 }, xp: 120 },
  },
  // ───────── Militaire ─────────
  {
    id: 'mil_guard', cat: 'military', icon: '🛡️', title: 'La garde du royaume',
    intro: 'Les raids des seigneurs voisins ne sont plus une rumeur. Le château doit tenir.',
    unlock: (s, h) => h.count(s, 'barracks') >= 1, unlockText: 'Construisez une caserne.',
    steps: [
      { title: 'Une garnison digne', desc: 'Ayez 40 soldats de combat.', check: (s, h) => [h.combatUnits(), 40], reward: { res: { food: 400, iron: 150 } }, view: 'army' },
      { title: 'Des murs solides', desc: 'Montez la muraille au niveau 2.', check: (s) => [s.city.fort?.wall || 0, 2], reward: { res: { stone: 400 } }, view: 'city' },
      { title: 'Aguerris', desc: 'Remportez 3 combats.', check: (s, h) => [h.d('battlesWon'), 3], reward: { res: { gold: 400, iron: 200 }, rep: { warrior: 10 } }, view: 'world' },
      { title: 'Le guet', desc: 'Repoussez un raid, ou montez une tour de garde au niveau 3 (elle révèle la composition des raids).', check: (s, h) => [Math.max(h.d('raidsRepelled'), h.level(s, 'watchtower') >= 3 ? 1 : 0), 1], reward: { res: { gold: 300, steel: 20 } }, view: 'city' },
    ],
    final: { item: 'rare', rep: { warrior: 12 } },
  },
  // ───────── Commerce ─────────
  {
    id: 'tr_salt', cat: 'trade', icon: '🧂', title: 'La route du sel',
    intro: 'Les cités libres paient bien ceux qui livrent à temps. Encore faut-il ouvrir la route.',
    unlock: (s, h) => h.count(s, 'market') >= 1, unlockText: 'Construisez un marché.',
    steps: [
      { title: 'Premiers échanges', desc: 'Effectuez 3 transactions au marché.', check: (s, h) => [h.d('trades'), 3], reward: { res: { gold: 200 } }, view: 'market' },
      { title: 'La caravane', desc: 'Envoyez une caravane vers une cité libre.', check: (s, h) => [h.d('caravans'), 1], reward: { res: { gold: 250, food: 200 } }, view: 'convoys' },
      { title: 'Parole tenue', desc: 'Remplissez 2 contrats de cités.', check: (s, h) => [h.d('contracts'), 2], reward: { res: { gold: 400 }, rep: { merchant: 10 } }, view: 'market' },
      { title: 'Le comptoir', desc: 'Améliorez le marché au niveau 3 (taxe réduite, caravanes).', check: (s, h) => [h.level(s, 'market'), 3], reward: { res: { gold: 300, silver: 3 } }, view: 'city' },
    ],
    final: { res: { gold: 500 }, rep: { merchant: 12 } },
  },
  // ───────── Diplomatie ─────────
  {
    id: 'di_bonds', cat: 'diplo', icon: '🤝', title: 'Liens d’encre et de sel',
    intro: 'Une cité amie vaut parfois mieux qu’une armée. Encore faut-il la mériter.',
    unlock: (s) => Object.values(s.world.pois).some((p) => p.type === 'town' && s.world.revealed[p.y * s.world.size + p.x]), unlockText: 'Découvrez une cité libre sur la carte.',
    steps: [
      { title: 'Bon voisinage', desc: 'Obtenez une relation de 10 avec une cité libre (caravanes, contrats, choix généreux).', check: (s) => [Math.max(0, ...Object.values(s.world.pois).filter((p) => p.type === 'town').map((p) => p.relation || 0)), 10], reward: { res: { gold: 250 }, rep: { diplomat: 6 } }, view: 'convoys' },
      { title: 'Une réputation qui précède', desc: 'Atteignez 40 de réputation de diplomate, de marchand ou de bienfaiteur.', check: (s) => [Math.max(s.reputation?.diplomat || 0, s.reputation?.merchant || 0, s.reputation?.benefactor || 0), 40], reward: { res: { gold: 400, herbs: 40 } }, view: 'treasury' },
      { title: 'Main tendue', desc: 'Obtenez une relation de 20 avec une faction.', check: (s) => [Math.max(0, ...(s.factions || []).map((f) => Math.round(f.relation))), 20], reward: { res: { gold: 400, silver: 3 } }, view: 'factions' },
    ],
    final: { rep: { diplomat: 12 }, res: { gold: 300 } },
  },
  // ───────── Avant-postes ─────────
  {
    id: 'op_marches', cat: 'outpost', icon: '🚩', title: 'Les marches du royaume',
    intro: 'Une bannière plantée loin du château est une promesse : il faudra la nommer, la nourrir et la défendre.',
    unlock: (s) => outposts(s).length >= 1, unlockText: 'Établissez un premier avant-poste (Carte → case explorée → Établir).',
    steps: [
      { title: 'Un nom, une bannière', desc: 'Donnez un nom de votre choix à un avant-poste (✎ Renommer).', check: (s) => [outposts(s).some((t) => t.renamed) ? 1 : 0, 1], reward: { res: { gold: 120 } }, view: 'territories' },
      { title: 'Une vraie vocation', desc: 'Spécialisez un avant-poste et donnez-lui une garnison complète.', check: (s, h) => [h.fullOutposts(), 1], reward: { res: { gold: 250, food: 250 } }, view: 'territories' },
      { title: 'La place forte', desc: 'Améliorez un avant-poste au niveau 3.', check: (s) => [Math.max(0, ...outposts(s).map((t) => t.level || 1)), 3], reward: { res: { gold: 500, stone: 300 } }, view: 'territories' },
      { title: 'Deux bannières', desc: 'Tenez 2 avant-postes.', check: (s) => [outposts(s).length, 2], reward: { res: { gold: 400, iron: 200 } }, view: 'world' },
    ],
    final: { res: { gold: 600 }, rep: { lord: 10 }, item: 'rare' },
  },
];

// Les Seigneurs de la Brèche (forteresses évolutives) : une grande quête militaire qui pousse à varier ses armées
QUESTLINES.push({
  id: 'mil_breach', cat: 'military', icon: '🏴', title: 'Les Seigneurs de la Brèche',
  intro: 'Des seigneurs de guerre ont relevé des forteresses dans les Terres Brisées. Chaque assaut les rend plus fortes : il faudra plus que la force brute pour faire tomber leurs citadelles.',
  unlock: (s) => (s.stats?.battlesWon || 0) >= 2 && (Object.values(s.city.buildings).find((b) => b.type === 'townhall')?.level || 0) >= 3, unlockText: 'Hôtel de ville 3 et deux victoires sur la carte.',
  steps: [
    { title: 'Connaître l’ennemi', desc: 'Espionnez une forteresse de la Brèche.', check: (s) => [Object.values(s.world.pois).some((p) => p.type === 'breachFort' && p.scouted) ? 1 : 0, 1], reward: { res: { gold: 300 } }, view: 'world' },
    { title: 'Trois bannières abattues', desc: 'Remportez une victoire méritée contre 3 forteresses différentes.', check: (s) => [Object.keys(s.breach?.defeated || {}).length, 3], reward: { res: { iron: 600, steel: 40 }, speedups: { rspeed15: 2 } }, view: 'world' },
    { title: 'Économiser le sang', desc: 'Remportez 3 victoires méritées en perdant au plus 10 % de vos troupes.', check: (s, h) => [h.d('breachCleanWins'), 3], reward: { res: { gold: 1500 }, xp: 200 }, view: 'world' },
    { title: 'Les murs de pierre', desc: 'Battez une forteresse renforcée (palier 2).', check: (s) => [Math.min(1, Math.floor((s.stats?.breachTierMax || 0) / 2)), 1], reward: { item: 'rare', speedups: { speed60: 1 } }, view: 'world' },
    { title: 'Une armée spécialisée', desc: 'Gagnez avec une armée composée à 70 % ou plus d’une seule classe (fantassins, tireurs ou cavaliers).', check: (s, h) => [h.d('breachSpecialWins'), 1], reward: { res: { steel: 150, leather: 150 } }, view: 'army' },
    { title: 'Le bastion tombe', desc: 'Battez un bastion d’élite (palier 3).', check: (s) => [Math.min(1, Math.floor((s.stats?.breachTierMax || 0) / 3)), 1], reward: { item: 'epic', relic: 1 }, view: 'world' },
    { title: 'Face au Seigneur', desc: 'Battez une citadelle légendaire (palier 4) et son seigneur.', check: (s) => [Math.min(1, Math.floor((s.stats?.breachTierMax || 0) / 4)), 1], reward: { res: { gold: 10000, rareOre: 15 }, speedups: { speed480: 1 } }, view: 'world' },
  ],
  final: { item: 'legendary', rep: { warrior: 30 } },
});

// ───────── v13 : quêtes transversales à embranchements ─────────
// Étapes « choice » : le joueur choisit une voie (setsPath) ; les étapes marquées path:'x' ne concernent que cette
// voie (les autres sont ignorées). Coûts des choix : costPerTh × niveau d'HdV. Aucune voie n'est gratuite ni
// systématiquement meilleure : la diplomatie coûte de l'or, le commerce du temps et des livraisons, la guerre des
// troupes, de la nourriture et la relation avec la faction.
const thOf = (s) => Object.values(s.city.buildings).find((b) => b.type === 'townhall')?.level || 1;
const facs = (s) => (s.factions || []);
const hasLegendaryItem = (s) => (s.inventory?.items || []).some((i) => ['legendary', 'mythic'].includes(i.rarity));
const borderConflict = (s) => {
  const f = facs(s).filter((x) => x.wars?.length && x.stance !== 'alliance').sort((a, b) => a.relation - b.relation)[0]
    || facs(s).filter((x) => x.stance !== 'alliance' && x.stance !== 'tributary').sort((a, b) => a.relation - b.relation)[0];
  return f ? { faction: f.idx } : null;
};
const blockader = (s) => {
  const f = facs(s).filter((x) => (x.relation <= -10 || x.stance === 'war') && x.stance !== 'tributary').sort((a, b) => a.relation - b.relation)[0];
  return f ? { faction: f.idx } : null;
};

QUESTLINES.push({
  id: 'saga_heirs', cat: 'story', icon: '🔱', title: 'Les Héritiers de la Fracture', chronicleKind: 'dynasty',
  intro: 'Les héritiers des maisons brisées réclament leur part des Terres Brisées. {faction} est déjà mêlée à un conflit frontalier : le royaume doit être prêt, puis choisir sa manière de peser sur l’avenir.',
  unlock: (s, h) => h.level(s, 'townhall') >= 7 && !!s.questlines?.done?.story_echoes, unlockText: 'Terminez « Les Échos de la Fracture » et atteignez l’hôtel de ville 7.',
  ctx: borderConflict,
  steps: [
    { title: 'Reconstruire l’essentiel', desc: 'Reliez 8 bâtiments au réseau de routes pavées (les routes donnent +5 %).', check: (s, h) => [h.roadLinked(), 8], reward: { res: { stone: 800, wood: 800 } }, view: 'city' },
    { title: 'Des greniers sûrs', desc: 'Bilan de nourriture positif et 5 000 nourriture en réserve.', check: (s, h) => [h.foodNet() > 0 ? Math.min(5000, Math.floor(s.resources.food || 0)) : 0, 5000], reward: { res: { gold: 600 }, speedups: { speed15: 2 } }, view: 'ecoReport' },
    { title: 'Les terres inconnues', desc: 'Explorez 10 nouvelles cases.', check: (s, h) => [h.d('explored'), 10], reward: { res: { crystals: 4 }, rep: { explorer: 10 } }, view: 'world' },
    { title: 'Le conflit de {faction}', desc: 'Obtenez un renseignement sur {faction} (mission d’espionnage réussie) ou envoyez-lui un ambassadeur.', check: (s, h) => [Math.min(1, h.intelSince() + h.d('envoys')), 1], reward: { res: { gold: 500 } }, view: 'factions' },
    { title: 'Le choix du souverain', desc: 'Comment le royaume pèsera-t-il sur le conflit de {faction} ?', choice: true, setsPath: true, chronicle: true, view: 'goals',
      options: [
        { key: 'diplo', label: 'La voie des traités', hint: 'Ambassades puis accord avec {faction}. Coûte de l’or ; relation +10.', costPerTh: { gold: 120 }, fx: { relation: 10, rep: { diplomat: 10 }, memory: 'Le souverain choisit la négociation' }, chronicle: '🕊️ Face aux héritiers de la Fracture, le souverain choisit la voie des traités avec {faction}.' },
        { key: 'trade', label: 'La voie des marchands', hint: 'Contrats et caravanes : la prospérité comme arme. Coûte de l’or ; caravanes +10 % pendant 24 h.', costPerTh: { gold: 80, food: 60 }, fx: { rep: { merchant: 10 }, buff: { name: 'Routes des héritiers', mods: { 'caravan.gain': 0.1 }, hours: 24 } }, chronicle: '⚖️ Face aux héritiers de la Fracture, le souverain mise sur le commerce.' },
        { key: 'war', label: 'L’intervention armée', hint: 'Préparer et mener une campagne. Coûte de la nourriture ; relation −15 avec {faction} ; formation +10 % pendant 12 h.', costPerTh: { food: 250 }, fx: { relation: -15, rep: { warrior: 10 }, buff: { name: 'Levée des héritiers', mods: { 'train.speed': 0.1 }, hours: 12 }, memory: 'Le souverain prépare la guerre' }, chronicle: '⚔️ Face aux héritiers de la Fracture, le souverain choisit les armes contre {faction}.' },
      ] },
    { path: 'diplo', title: 'Les ambassades', desc: 'Envoyez 2 ambassadeurs (à n’importe quelle faction).', check: (s, h) => [h.d('envoys'), 2], reward: { res: { gold: 800 }, rep: { diplomat: 8 } }, view: 'factions' },
    { path: 'diplo', title: 'Un accord avec {faction}', desc: 'Atteignez une relation de 40 avec {faction}, ou signez un pacte avec elle.', check: (s, h) => [['trade', 'alliance'].includes(h.stance()) ? 40 : Math.max(0, Math.round(h.rel())), 40], reward: { res: { gold: 1500 }, insignia: 3 }, view: 'factions' },
    { path: 'trade', title: 'Les contrats des héritiers', desc: 'Honorez 3 contrats.', check: (s, h) => [h.d('contracts'), 3], reward: { res: { gold: 900 } }, view: 'convoys' },
    { path: 'trade', title: 'Les routes de l’or', desc: 'Menez 5 caravanes à bon port.', check: (s, h) => [h.d('caravans'), 5], reward: { res: { gold: 1500 }, insignia: 3 }, view: 'convoys' },
    { path: 'war', title: 'Préparer la campagne', desc: 'Ayez 60 unités de combat et 100 rations en réserve (ravitaillement).', check: (s, h) => [Math.min(60, h.combatUnits()) / 60 * 50 + Math.min(100, Math.floor(s.resources.rations || 0)) / 100 * 50 | 0, 100], reward: { res: { iron: 800 }, speedups: { rspeed60: 1 } }, view: 'army' },
    { path: 'war', title: 'Vaincre un adversaire majeur', desc: 'Remportez une campagne militaire ou abattez un boss mondial.', check: (s, h) => [Math.min(1, h.d('campaignsWon') + h.d('bossKills')), 1], reward: { res: { gold: 1500 }, insignia: 3 }, view: 'warcampaign' },
    { title: 'Investir la paix', desc: 'Achevez un Grand Projet du Royaume ou une étape de grand projet royal.', check: (s, h) => [Math.min(1, h.d('crownProjects') + h.d('projectStages')), 1], reward: { res: { stone: 1500 }, speedups: { speed60: 1 } }, view: 'projects' },
    { title: 'Ce que retiendra la chronique', desc: 'Choisissez comment cet épisode sera inscrit dans l’histoire du royaume.', choice: true, view: 'goals',
      options: [
        { key: 'humble', label: '« Un royaume qui a tenu bon »', hint: 'Sobre : la gratitude du peuple (réputation de bienfaiteur).', fx: { rep: { benefactor: 15 } }, chronicle: '📜 Les chroniqueurs retiennent des héritiers de la Fracture un royaume qui a tenu bon.' },
        { key: 'glory', label: '« L’âge des héritiers »', hint: 'Titre « Héritier de la Fracture ».', fx: { title: 'Héritier de la Fracture' }, chronicle: '👑 Les chroniqueurs nomment cette époque « l’âge des héritiers ».' },
        { key: 'legend', label: '« La paix forgée »', hint: 'Prestige : réputation de seigneur.', fx: { rep: { lord: 15 } }, chronicle: '🔱 Les chroniqueurs célèbrent « la paix forgée » au sortir de la Fracture.' },
      ] },
  ],
  finalByPath: {
    diplo: { relic: 2, rep: { diplomat: 20 }, res: { gold: 2000 } },
    trade: { relic: 2, rep: { merchant: 20 }, res: { gold: 3000 } },
    war: { relic: 2, rep: { warrior: 20 }, item: 'epic' },
  },
  final: { relic: 2 },
});

QUESTLINES.push({
  id: 'tr_blockade', cat: 'trade', icon: '🚧', title: 'La Route coupée', chronicleKind: 'faction',
  intro: '{faction} a dressé un péage armé sur la grande route marchande : tant qu’il tient, vos caravanes rapportent 8 % de moins.',
  unlock: (s, h) => h.level(s, 'market') >= 3 && (s.stats.caravans || 0) >= 2 && h.level(s, 'townhall') >= 5, unlockText: 'Marché niveau 3, deux caravanes menées et une faction hostile (relation ≤ −10).',
  ctx: blockader,
  whileActive: { 'caravan.gain': -0.08 },
  chronicleText: (a) => ({ treaty: '🕊️ La route marchande rouvre après un traité avec {faction}.', spy: '🕵️ Les espions du royaume font tomber le péage de {faction}.', convoys: '🐂 Escortes et route nouvelle : le péage de {faction} est contourné.', war: '⚔️ Le péage de {faction} est balayé par les armes.' }[a?.path] || '🚧 La route marchande est rouverte.'),
  steps: [
    { title: 'Le péage de {faction}', desc: 'Quatre voies possibles, chacune avec ses coûts et ses risques.', choice: true, setsPath: true, view: 'goals',
      options: [
        { key: 'treaty', label: 'Négocier un traité coûteux', hint: 'Or ; relation +12. Il faudra ensuite atteindre une relation de 20 avec {faction}.', costPerTh: { gold: 200 }, fx: { relation: 12, rep: { diplomat: 6 }, memory: 'Un traité de passage négocié' } },
        { key: 'spy', label: 'Mission d’espionnage', hint: 'Il faut 2 espions. Réussir une mission sur {faction} (échec : espions capturés, relation −12).', need: (s) => ((s.army.spy || 0) >= 2 ? null : 'Il faut au moins 2 espions (Caserne)'), fx: {} },
        { key: 'convoys', label: 'Protéger les convois et ouvrir une route alternative', hint: 'Bois et pierre ; risque des convois −10 % pendant 24 h. Il faudra ensuite mener 4 caravanes.', costPerTh: { wood: 150, stone: 150 }, fx: { buff: { name: 'Escortes de la route', mods: { 'convoy.risk': -0.1 }, hours: 24 } } },
        { key: 'war', label: 'Préparer une campagne militaire', hint: 'Nourriture ; relation −20 avec {faction}. Il faudra ensuite remporter une campagne ou 3 batailles difficiles.', costPerTh: { food: 200 }, fx: { relation: -20, rep: { warrior: 8 }, memory: 'Menaces de guerre pour un péage' } },
      ] },
    { path: 'treaty', title: 'Le traité signé', desc: 'Atteignez une relation de 20 avec {faction} (ou un pacte).', check: (s, h) => [['trade', 'alliance'].includes(h.stance()) ? 20 : Math.max(0, Math.round(h.rel())), 20], reward: { res: { gold: 700 } }, view: 'factions' },
    { path: 'spy', title: 'Les secrets du péage', desc: 'Réussissez une mission d’espionnage sur {faction}.', check: (s, h) => [Math.min(1, h.intelSince()), 1], reward: { res: { gold: 700 }, rep: { diplomat: 4 } }, view: 'factions' },
    { path: 'convoys', title: 'La route alternative', desc: 'Menez 4 caravanes à bon port.', check: (s, h) => [h.d('caravans'), 4], reward: { res: { gold: 700 } }, view: 'convoys' },
    { path: 'war', title: 'Briser le péage', desc: 'Remportez une campagne, ou 3 combats difficiles (danger 3 ou plus).', check: (s, h) => [h.d('campaignsWon') ? 3 : Math.min(3, h.d('hardClears')), 3], reward: { res: { iron: 700 } }, view: 'world' },
    { title: 'La route rouverte', desc: 'Menez 2 caravanes sur la route rouverte.', check: (s, h) => [h.d('caravans'), 2], reward: { res: { gold: 500 } }, view: 'convoys' },
  ],
  finalByPath: {
    treaty: { res: { gold: 1500 }, rep: { diplomat: 12 } },
    spy: { res: { gold: 1200 }, buff: { name: 'Réseau d’informateurs', mods: { 'convoy.risk': -0.1 }, hours: 48 } },
    convoys: { res: { gold: 1200, planks: 150 }, rep: { merchant: 12 } },
    war: { res: { gold: 1000, iron: 600 }, rep: { warrior: 12 } },
  },
  final: { res: { gold: 1000 } },
});

QUESTLINES.push({
  id: 'legacy_mastery', cat: 'legacy', icon: '🌟', title: 'L’Héritage du royaume', chronicleKind: 'dynasty',
  intro: 'Le royaume est devenu une grande puissance. Ce qui reste à accomplir ne se mesure plus en niveaux, mais en exploits que la dynastie racontera.',
  unlock: (s, h) => h.level(s, 'townhall') >= 16, unlockText: 'Hôtel de ville niveau 16 (ère de la Grande puissance).',
  chronicleText: () => '🌟 L’Héritage du royaume est accompli : sa légende traversera les dynasties.',
  steps: [
    { title: 'L’arme des ancêtres', desc: 'Possédez un équipement légendaire ou mythique (forge, boss, événements).', check: (s) => [hasLegendaryItem(s) ? 1 : 0, 1], reward: { relic: 1, title: 'Maître de la forge' }, view: 'craft' },
    { title: 'Au-delà des cartes', desc: 'Réussissez une expédition légendaire.', check: (s) => [Math.min(1, Object.keys(s.legendary?.done || {}).length), 1], reward: { relic: 1, title: 'Explorateur légendaire' }, view: 'legendary' },
    { title: 'Les trophées du monde', desc: 'Abattez 5 boss mondiaux au total.', check: (s) => [Math.min(5, s.stats.bossKills || 0), 5], reward: { deco: 'deco_trophies', speedups: { rspeed480: 1 } }, view: 'world' },
    { title: 'Une œuvre pour les siècles', desc: 'Achevez 3 Grands Projets du Royaume.', check: (s) => [Math.min(3, s.stats.crownProjects || 0), 3], reward: { insignia: 10, speedups: { speed480: 1 } }, view: 'projects' },
    { title: 'La mémoire du royaume', desc: 'Complétez une collection (reliques, trophées, artefacts…).', check: (s, h) => [Math.min(1, h.collectionsDone()), 1], reward: { relic: 2 }, view: 'treasury' },
  ],
  final: { title: 'Bâtisseur d’héritage', deco: 'deco_dynasty', insignia: 15 },
});

// Chaque grande quête achevée rapporte un sceau d'une heure (une seule fois : la récompense finale ne se réclame qu'une fois)
for (const q of QUESTLINES) for (const f of [q.final, ...Object.values(q.finalByPath || {})]) if (f) f.speedups ||= q.cat === 'military' ? { rspeed60: 1 } : { speed60: 1 }; // militaires : ordre du maréchal
export const QUESTLINE_BY_ID = Object.fromEntries(QUESTLINES.map((q) => [q.id, q]));
