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

export const QUESTLINE_BY_ID = Object.fromEntries(QUESTLINES.map((q) => [q.id, q]));
