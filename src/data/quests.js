// Quêtes du tutoriel / chapitres. check(state, h) → [progression, objectif]
// h : fonctions utilitaires fournies par le système de quêtes.
export const STORY_QUESTS = [
  { id: 'q_clear', title: 'Déblayer le hameau', desc: 'Cliquez sur une case de décombres dans le royaume et déblayez-la.', check: (s) => [s.stats.cleared || 0, 1], reward: { wood: 150, stone: 100 } },
  { id: 'q_farm', title: 'Nourrir le peuple', desc: 'Construisez une Ferme (idéalement au bord de la rivière : +10%).', check: (s, h) => [h.count(s, 'farm'), 1], reward: { food: 200, wood: 100 } },
  { id: 'q_saw', title: 'Le bruit des haches', desc: 'Construisez une Scierie à côté d’une forêt (+15%).', check: (s, h) => [h.count(s, 'sawmill'), 1], reward: { wood: 200, stone: 100 } },
  { id: 'q_quarry', title: 'Pierre sur pierre', desc: 'Construisez une Carrière à côté d’une montagne (+15%).', check: (s, h) => [h.count(s, 'quarry'), 1], reward: { stone: 200, gold: 50 } },
  { id: 'q_th2', title: 'Un vrai village', desc: 'Améliorez l’Hôtel de ville au niveau 2.', check: (s, h) => [h.level(s, 'townhall'), 2], reward: { wood: 300, stone: 300, gold: 100 } },
  { id: 'q_barracks', title: 'Lever une milice', desc: 'Construisez une Caserne (près de l’hôtel de ville : bonus).', check: (s, h) => [h.count(s, 'barracks'), 1], reward: { food: 300, iron: 100 } },
  { id: 'q_scouts', title: 'Des yeux sur le monde', desc: 'Formez 3 Éclaireurs.', check: (s) => [s.army.scout || 0, 3], reward: { food: 150, gold: 80 } },
  { id: 'q_explore', title: 'Au-delà des collines', desc: 'Sur la Carte, envoyez des éclaireurs explorer une case dans le brouillard.', check: (s) => [s.stats.explored || 0, 1], reward: { gold: 150, herbs: 30 } },
  { id: 'q_gather', title: 'Farmer les terres', desc: 'Envoyez des troupes récolter un site de ressources sur la carte.', check: (s) => [s.stats.gatherDone || 0, 1], reward: { wood: 300, iron: 100 } },
  { id: 'q_army', title: 'Premiers soldats', desc: 'Ayez 20 unités de combat (lanciers, épéistes, archers…).', check: (s, h) => [h.combatUnits(s), 20], reward: { food: 400, iron: 150 } },
  { id: 'q_battle', title: 'Baptême du feu', desc: 'Remportez un combat (camp de bandits, repaire…).', check: (s) => [s.stats.battlesWon || 0, 1], reward: { gold: 300, iron: 200 } },
  { id: 'q_tavern', title: 'Compagnons d’armes', desc: 'Construisez une Taverne et recrutez un second héros.', check: (s) => [s.heroes.length, 2], reward: { gold: 200 } },
  { id: 'q_governor', title: 'Déléguer', desc: 'Nommez un héros intendant d’un secteur (écran Héros).', check: (s) => [s.heroes.some((x) => x.assignment?.type === 'governor') ? 1 : 0, 1], reward: { gold: 150, food: 200 } },
  { id: 'q_library', title: 'Le savoir perdu', desc: 'Construisez une Bibliothèque et terminez une recherche.', check: (s) => [Object.keys(s.techs).length, 1], reward: { gold: 250, wood: 200 } },
  { id: 'q_market', title: 'Le goût de l’or', desc: 'Construisez un Marché et effectuez une transaction.', check: (s) => [s.stats.trades || 0, 1], reward: { gold: 200 } },
  { id: 'q_mill', title: 'Du blé au pain', desc: 'Construisez un Moulin (près de la rivière : +20%) pour transformer le blé.', check: (s, h) => [h.count(s, 'mill'), 1], reward: { grain: 200, wood: 200 } },
  { id: 'q_equip', title: 'Armé jusqu’aux dents', desc: 'Équipez un objet sur un héros.', check: (s) => [s.heroes.some((x) => Object.values(x.equipment).some(Boolean)) ? 1 : 0, 1], reward: { gold: 200, leather: 20 } },
  { id: 'q_th3', title: 'Bourg fortifié', desc: 'Hôtel de ville niveau 3.', check: (s, h) => [h.level(s, 'townhall'), 3], reward: { wood: 600, stone: 600, gold: 300 } },
  { id: 'q_chain', title: 'Le pain des braves', desc: 'Produisez 100 pains (Ferme → Moulin → Boulangerie).', check: (s) => [Math.floor(s.stats.produced?.bread || 0), 100], reward: { gold: 400, herbs: 50 } },
  { id: 'q_forge', title: 'L’enclume chante', desc: 'Forgez un objet à la Forge.', check: (s) => [s.stats.crafted || 0, 1], reward: { steel: 30, leather: 20 } },
  { id: 'q_territory', title: 'Planter le drapeau', desc: 'Établissez un avant-poste sur la carte.', check: (s) => [Object.keys(s.territories).length, 1], reward: { gold: 500, stone: 400 } },
  { id: 'q_danger', title: 'Là où personne ne va', desc: 'Nettoyez un site de danger 3 ou plus.', check: (s) => [s.stats.hardClears || 0, 1], reward: { gold: 600, steel: 40 } },
  { id: 'q_guild', title: 'Frères d’armes', desc: 'Rejoignez une guilde (Maison de guilde requise).', check: (s) => [s.guild ? 1 : 0, 1], reward: { gold: 500 } },
  { id: 'q_th5', title: 'Vers le royaume', desc: 'Hôtel de ville niveau 5.', check: (s, h) => [h.level(s, 'townhall'), 5], reward: { gold: 1000, steel: 50, silver: 5 } },
  { id: 'q_boss', title: 'Tueur de légendes', desc: 'Participez à la chute d’un boss mondial.', check: (s) => [s.stats.bossKills || 0, 1], reward: { gold: 2000, crystals: 10 } },
  { id: 'q_th10', title: 'Royaume de Cendrelande', desc: 'Hôtel de ville niveau 10.', check: (s, h) => [h.level(s, 'townhall'), 10], reward: { gold: 5000, rareOre: 20, crystals: 20 } },
];

// Jalons infinis : objectifs qui montent en paliers
export const MILESTONES = [
  { id: 'm_levels', title: 'Bâtisseur', unit: 'niveaux de bâtiments', value: (s, h) => h.totalLevels(s), tiers: (n) => Math.round(10 * Math.pow(1.6, n)), reward: (n) => ({ gold: 200 * (n + 1), stone: 300 * (n + 1) }) },
  { id: 'm_gather', title: 'Récolteur', unit: 'ressources récoltées', value: (s) => s.stats.gathered || 0, tiers: (n) => Math.round(2000 * Math.pow(2, n)), reward: (n) => ({ gold: 250 * (n + 1), food: 400 * (n + 1) }) },
  { id: 'm_battles', title: 'Conquérant', unit: 'victoires', value: (s) => s.stats.battlesWon || 0, tiers: (n) => Math.round(3 * Math.pow(1.8, n)), reward: (n) => ({ gold: 300 * (n + 1), iron: 300 * (n + 1) }) },
  { id: 'm_explore', title: 'Cartographe', unit: 'explorations', value: (s) => s.stats.explored || 0, tiers: (n) => Math.round(5 * Math.pow(1.7, n)), reward: (n) => ({ gold: 200 * (n + 1), herbs: 40 * (n + 1) }) },
  { id: 'm_heroes', title: 'Mentor', unit: 'niveaux de héros', value: (s) => s.heroes.reduce((a, h) => a + h.level, 0), tiers: (n) => Math.round(10 * Math.pow(1.6, n)), reward: (n) => ({ gold: 300 * (n + 1), gems: n + 1 }) },
];
