// Parcours guidé : 8 chapitres. Chaque mission est détectée automatiquement à partir de l'état réel
// (check(state, h) → [progression, objectif]) et sa récompense ne peut être réclamée qu'une fois.
// Les identifiants q_* reprennent les anciennes quêtes de l'histoire (les sauvegardes existantes gardent leurs réclamations).
// view : écran ouvert par le bouton « Y aller ». optional : mission secondaire (ne bloque pas le chapitre).
// Aucune mission ne demande une action impossible au moment où son chapitre s'ouvre : chaque chapitre ne s'ouvre
// qu'après les missions principales du précédent, qui débloquent les bâtiments nécessaires.

const flag = (s, k) => (s.campaign?.flags?.[k] ? 1 : 0);
const techs = (s) => Object.keys(s.techs || {}).length;

export const CHAPTERS = [
  {
    n: 1, title: 'Le dernier hameau', icon: '🏚️',
    intro: 'Les décombres de la Fracture encombrent encore les rues. Avant de rêver de royaume, il faut du bois, de la pierre… et de la place.',
    tip: 'Cliquez sur une case de décombres pour la déblayer, puis sur une case libre pour construire. Le placement compte : une scierie près d’une forêt produit +15 %.',
    reward: { wood: 400, stone: 400, gold: 150 },
    missions: [
      { id: 'q_clear', title: 'Déblayer le hameau', desc: 'Cliquez sur une case de décombres dans le royaume et déblayez-la.', check: (s) => [s.stats.cleared || 0, 1], reward: { wood: 150, stone: 100 }, view: 'city' },
      { id: 'q_saw', title: 'Le bruit des haches', desc: 'Construisez une Scierie à côté d’une forêt (+15 %).', check: (s, h) => [h.count(s, 'sawmill'), 1], reward: { wood: 200, stone: 100 }, view: 'city' },
      { id: 'q_quarry', title: 'Pierre sur pierre', desc: 'Construisez une Carrière à côté d’une montagne (+15 %).', check: (s, h) => [h.count(s, 'quarry'), 1], reward: { stone: 200, gold: 50 }, view: 'city' },
      { id: 'q_th2', title: 'Un vrai village', desc: 'Améliorez l’Hôtel de ville au niveau 2.', check: (s, h) => [h.level(s, 'townhall'), 2], reward: { wood: 300, stone: 300, gold: 100 }, view: 'city' },
      { id: 'c1_house', title: 'Des toits pour tous', desc: 'Améliorez les Maisons au niveau 2 : plus d’habitants, plus d’or.', check: (s, h) => [h.level(s, 'house'), 2], reward: { wood: 150, gold: 80 }, view: 'city', optional: true },
    ],
  },
  {
    n: 2, title: 'Nourrir le peuple', icon: '🌾',
    intro: 'Un royaume affamé ne tient pas une saison. Vos gens comptent sur vous pour remplir les greniers.',
    tip: 'Ferme au bord de la rivière (+10 %), moulin près de l’eau (+20 %). L’onglet Production → Bilan montre ce que vous produisez et consommez.',
    reward: { food: 600, wood: 300, gold: 200 },
    missions: [
      { id: 'q_farm', title: 'Nourrir le peuple', desc: 'Construisez une Ferme (idéalement au bord de la rivière : +10 %).', check: (s, h) => [h.count(s, 'farm'), 1], reward: { food: 200, wood: 100 }, view: 'city' },
      { id: 'c2_farm2', title: 'Des champs à perte de vue', desc: 'Ayez 2 fermes, ou une ferme de niveau 3.', check: (s, h) => [Math.max(h.count(s, 'farm'), h.level(s, 'farm') >= 3 ? 2 : 0), 2], reward: { food: 250, wood: 150 }, view: 'city' },
      { id: 'c2_report', title: 'Les comptes du royaume', desc: 'Consultez le Bilan économique (Production → Bilan) pour voir production, consommation et pertes.', check: (s) => [flag(s, 'view:ecoReport'), 1], reward: { gold: 100 }, view: 'ecoReport' },
      { id: 'c2_surplus', title: 'Greniers pleins', desc: 'Atteignez un bilan de nourriture positif et 1 000 nourriture en réserve.', check: (s, h) => [h.foodNet(s) > 0 ? Math.min(1000, Math.floor(s.resources.food || 0)) : 0, 1000], reward: { gold: 150, grain: 100 }, view: 'ecoReport' },
      { id: 'q_mill', title: 'Du blé au pain', desc: 'Construisez un Moulin (près de la rivière : +20 %) pour transformer le blé.', check: (s, h) => [h.count(s, 'mill'), 1], reward: { grain: 200, wood: 200 }, view: 'city', optional: true },
      { id: 'q_chain', title: 'Le pain des braves', desc: 'Produisez 100 pains (Ferme → Moulin → Boulangerie).', check: (s) => [Math.floor(s.stats.produced?.bread || 0), 100], reward: { gold: 400, herbs: 50 }, view: 'chains', optional: true },
    ],
  },
  {
    n: 3, title: 'Les routes des Terres Brisées', icon: '🧭',
    intro: 'Au-delà des collines, le brouillard cache des gisements, des ruines… et des dangers. Il est temps d’ouvrir les routes.',
    tip: 'Sur la Carte, envoyez des éclaireurs dans le brouillard. Les sites de ressources découverts peuvent être récoltés par vos troupes.',
    reward: { gold: 300, food: 400, herbs: 30 },
    missions: [
      { id: 'q_scouts', title: 'Des yeux sur le monde', desc: 'Ayez 3 Éclaireurs (formés à la caserne, ou ceux de départ).', check: (s) => [(s.army.scout || 0) + (s.marches || []).reduce((a, m) => a + (m.units?.scout || 0), 0), 3], reward: { food: 150, gold: 80 }, view: 'army' },
      { id: 'q_explore', title: 'Au-delà des collines', desc: 'Sur la Carte, envoyez des éclaireurs explorer une case dans le brouillard.', check: (s) => [s.stats.explored || 0, 1], reward: { gold: 150, herbs: 30 }, view: 'world' },
      { id: 'c3_explore5', title: 'Cartographier la vallée', desc: 'Explorez 5 cases.', check: (s) => [s.stats.explored || 0, 5], reward: { gold: 200, food: 200 }, view: 'world' },
      { id: 'q_gather', title: 'Exploiter les terres', desc: 'Envoyez des troupes récolter un site de ressources sur la carte.', check: (s) => [s.stats.gatherDone || 0, 1], reward: { wood: 300, iron: 100 }, view: 'world' },
      { id: 'c3_road', title: 'Paver la route', desc: 'Construisez une Route reliée à l’Hôtel de ville (les bâtiments reliés produisent davantage).', check: (s, h) => [Math.min(1, h.count(s, 'road')), 1], reward: { stone: 200 }, view: 'city', optional: true },
    ],
  },
  {
    n: 4, title: 'La première garnison', icon: '🛡️',
    intro: 'Des bandits rôdent près des ruines. Avant de les affronter, vos recrues doivent apprendre à tenir la ligne.',
    tip: 'L’exercice d’entraînement est sans risque : aucune perte. Ensuite, attaquez un camp FAIBLE avec une partie de l’armée — l’aperçu du combat indique vos chances avant d’engager.',
    reward: { iron: 300, food: 500, gold: 300 },
    missions: [
      { id: 'q_barracks', title: 'Lever une milice', desc: 'Construisez une Caserne (près de l’Hôtel de ville : bonus).', check: (s, h) => [h.count(s, 'barracks'), 1], reward: { food: 300, iron: 100 }, view: 'city' },
      { id: 'c4_training', title: 'Exercice d’entraînement', desc: 'Lancez un combat d’entraînement contre des mannequins (aucune perte possible) pour voir comment se déroule une bataille.', check: (s) => [flag(s, 'training'), 1], reward: { iron: 100, food: 200 }, action: 'cp-training' },
      { id: 'c4_stats', title: 'Connaître ses troupes', desc: 'Consultez l’écran Armée : attaque, défense, vitesse et entretien de chaque unité.', check: (s) => [flag(s, 'view:army'), 1], reward: { gold: 80 }, view: 'army' },
      { id: 'q_army', title: 'Premiers soldats', desc: 'Ayez 20 unités de combat (lanciers, épéistes, archers…).', check: (s, h) => [h.combatUnits(s), 20], reward: { food: 400, iron: 150 }, view: 'army' },
      { id: 'q_battle', title: 'Baptême du feu', desc: 'Remportez un combat contre un camp faible (danger 1) — inutile d’y envoyer toute l’armée.', check: (s) => [s.stats.battlesWon || 0, 1], reward: { gold: 300, iron: 200 }, view: 'world' },
      { id: 'q_tavern', title: 'Compagnons d’armes', desc: 'Construisez une Taverne et recrutez un second héros.', check: (s) => [s.heroes.length, 2], reward: { gold: 200 }, view: 'heroes', optional: true },
    ],
  },
  {
    n: 5, title: 'La connaissance est une arme', icon: '📚',
    intro: 'Les archives de l’Empire de l’Aube dorment sous la poussière. Celui qui les rouvrira prendra une génération d’avance.',
    tip: 'Une bibliothèque ne doit jamais rester inactive. L’Intendance (Production) automatise peu à peu le royaume.',
    reward: { gold: 500, wood: 500, stone: 500 },
    missions: [
      { id: 'q_library', title: 'Le savoir perdu', desc: 'Construisez une Bibliothèque et terminez une recherche.', check: (s) => [techs(s), 1], reward: { gold: 250, wood: 200 }, view: 'research' },
      { id: 'c5_tech3', title: 'Trois découvertes', desc: 'Terminez 3 recherches.', check: (s) => [techs(s), 3], reward: { gold: 300, stone: 200 }, view: 'research' },
      { id: 'q_th3', title: 'Bourg fortifié', desc: 'Hôtel de ville niveau 3.', check: (s, h) => [h.level(s, 'townhall'), 3], reward: { wood: 600, stone: 600, gold: 300 }, view: 'city' },
      { id: 'q_steward', title: 'Déléguer le labeur', desc: 'Production → Intendance : débloquez le palier « Ouvriers ».', check: (s) => [s.automation?.level || 0, 1], reward: { food: 400, gold: 150 }, view: 'steward' },
      { id: 'q_workers', title: 'Des bras pour le royaume', desc: 'Ayez 4 ouvriers et affectez-en à un secteur (Production → Ouvriers).', check: (s) => [Math.min(s.workers?.length || 0, (s.workers || []).filter((w) => w.job?.type === 'sector').length ? 4 : 3), 4], reward: { food: 300, wood: 300 }, view: 'workers', optional: true },
      { id: 'q_forge', title: 'L’enclume chante', desc: 'Forgez un objet à la Forge.', check: (s) => [s.stats.crafted || 0, 1], reward: { steel: 30, leather: 20 }, view: 'craft', optional: true },
      { id: 'q_equip', title: 'Armé jusqu’aux dents', desc: 'Équipez un objet sur un héros.', check: (s) => [s.heroes.some((x) => Object.values(x.equipment).some(Boolean)) ? 1 : 0, 1], reward: { gold: 200, leather: 20 }, view: 'heroes', optional: true },
    ],
  },
  {
    n: 6, title: 'Les marchés et les alliances', icon: '⚖️',
    intro: 'Les cités libres commercent avec qui sait tenir parole. Et les royaumes voisins préfèrent souvent un traité à une guerre.',
    tip: 'Les contrats des cités paient bien vos surplus. Un ambassadeur améliore la relation : un pacte commercial supprime les raids de cette faction.',
    reward: { gold: 800, silver: 5 },
    missions: [
      { id: 'q_market', title: 'Le goût de l’or', desc: 'Construisez un Marché et effectuez une transaction.', check: (s) => [s.stats.trades || 0, 1], reward: { gold: 200 }, view: 'market' },
      { id: 'c6_contract', title: 'Parole de marchand', desc: 'Remplissez un contrat d’une cité (Commerce → Marché).', check: (s) => [s.stats.contracts || 0, 1], reward: { gold: 250 }, view: 'market' },
      { id: 'c6_caravan', title: 'La première caravane', desc: 'Envoyez une caravane vers une cité découverte (Commerce → Convois).', check: (s) => [s.stats.caravans || 0, 1], reward: { gold: 200, food: 200 }, view: 'convoys' },
      { id: 'c6_envoy', title: 'L’art de la parole', desc: 'Envoyez un ambassadeur auprès d’une faction (Monde → Factions).', check: (s) => [s.stats.envoys || 0, 1], reward: { gold: 200 }, view: 'factions' },
      { id: 'q_pact', title: 'La plume plutôt que l’épée', desc: 'Signez un pacte commercial avec une faction.', check: (s) => [(s.factions || []).some((f) => ['trade', 'alliance'].includes(f.stance)) ? 1 : 0, 1], reward: { gold: 800, silver: 5 }, view: 'factions', optional: true },
      { id: 'q_guild', title: 'Frères d’armes', desc: 'Rejoignez une guilde (Maison de guilde requise).', check: (s) => [s.guild ? 1 : 0, 1], reward: { gold: 500 }, view: 'guild', optional: true },
    ],
  },
  {
    n: 7, title: 'Les secrets de la Fracture', icon: '💠',
    intro: 'Les cristaux tombés du ciel ont réveillé des lieux oubliés. Les ruines gardent des reliques… et ceux qui les gardent.',
    tip: 'Un avant-poste spécialisé et gardé produit chaque heure. Les sites de danger 3+ et les donjons demandent une armée préparée : consultez l’aperçu avant d’attaquer.',
    reward: { gold: 1000, crystals: 5, steel: 40 },
    missions: [
      { id: 'q_territory', title: 'Planter le drapeau', desc: 'Établissez un avant-poste sur la carte.', check: (s) => [Object.keys(s.territories).length, 1], reward: { gold: 500, stone: 400 }, view: 'territories' },
      { id: 'c7_spec', title: 'Un avant-poste utile', desc: 'Spécialisez un avant-poste et donnez-lui une garnison.', check: (s) => [Object.values(s.territories || {}).some((t) => t.spec && t.garrison && Object.values(t.garrison).some((n) => n > 0)) ? 1 : 0, 1], reward: { gold: 300, iron: 200 }, view: 'territories' },
      { id: 'q_danger', title: 'Là où personne ne va', desc: 'Nettoyez un site de danger 3 ou plus.', check: (s) => [s.stats.hardClears || 0, 1], reward: { gold: 600, steel: 40 }, view: 'world' },
      { id: 'q_expedition', title: 'La première expédition', desc: 'Formez une équipe et ramenez une expédition (Production → Expéditions).', check: (s) => [s.stats.expeditions || 0, 1], reward: { gold: 300, rations: 30 }, view: 'expeditions' },
      { id: 'q_dungeon', title: 'Dans les profondeurs', desc: 'Purgez entièrement un donjon.', check: (s) => [s.stats.dungeons || 0, 1], reward: { gold: 2000, crystals: 5 }, view: 'world', optional: true },
      { id: 'c7_artifact', title: 'Le premier artefact', desc: 'Obtenez un artefact (donjons, ruines, fouilles d’avant-postes, contrats…).', check: (s) => [Object.keys(s.artifacts || {}).length ? 1 : 0, 1], reward: { gold: 500 }, view: 'treasury', optional: true },
    ],
  },
  {
    n: 8, title: 'Le royaume prend son envol', icon: '👑',
    intro: 'Le hameau est devenu une puissance. Il reste à l’administrer, à le défendre et à écrire son nom dans la chronique.',
    tip: 'Les Ordres du royaume (Intendance, palier 4) automatisent les décisions répétitives. Les objectifs à long terme continuent dans l’onglet Objectifs.',
    reward: { gold: 2000, steel: 80, silver: 10 },
    missions: [
      { id: 'q_th5', title: 'Vers le royaume', desc: 'Hôtel de ville niveau 5.', check: (s, h) => [h.level(s, 'townhall'), 5], reward: { gold: 1000, steel: 50, silver: 5 }, view: 'city' },
      { id: 'c8_defense', title: 'Des remparts dignes de ce nom', desc: 'Repoussez un raid, ou montez la Muraille au niveau 3.', check: (s) => [Math.max(s.stats.raidsRepelled || 0, (s.city.fort?.wall || 0) >= 3 ? 1 : 0), 1], reward: { stone: 800, iron: 300 }, view: 'city' },
      { id: 'q_governor', title: 'Déléguer', desc: 'Nommez un héros intendant d’un secteur (écran Héros).', check: (s) => [s.heroes.some((x) => x.assignment?.type === 'governor') ? 1 : 0, 1], reward: { gold: 150, food: 200 }, view: 'heroes' },
      { id: 'q_order', title: 'Le royaume s’administre', desc: 'Créez votre premier Ordre du royaume (Intendance, palier 4).', check: (s) => [(s.orders || []).length, 1], reward: { gold: 1500, frames: 30 }, view: 'steward', optional: true },
      { id: 'q_foreman', title: 'Le contremaître', desc: 'Promouvez un ouvrier expérimenté contremaître.', check: (s) => [(s.workers || []).some((w) => w.foreman) ? 1 : 0, 1], reward: { gold: 500, planks: 100 }, view: 'workers', optional: true },
      { id: 'q_boss', title: 'Tueur de légendes', desc: 'Participez à la chute d’un boss mondial.', check: (s) => [s.stats.bossKills || 0, 1], reward: { gold: 2000, crystals: 10 }, view: 'world', optional: true },
    ],
  },
];

// Objectifs à long terme (après la campagne, et visibles dès le début)
export const LONG_TERM = [
  { id: 'q_th10', title: 'Royaume de Cendrelande', desc: 'Hôtel de ville niveau 10.', check: (s, h) => [h.level(s, 'townhall'), 10], reward: { gold: 5000, rareOre: 20, crystals: 20 }, view: 'city' },
  { id: 'l_techs20', title: 'Bibliothèque de l’Aube', desc: 'Terminez 20 recherches.', check: (s) => [techs(s), 20], reward: { gold: 3000, crystals: 10 }, view: 'research' },
  { id: 'l_territories', title: 'Marches du royaume', desc: 'Tenez 4 avant-postes.', check: (s) => [Object.keys(s.territories || {}).length, 4], reward: { gold: 3000, stone: 2000 }, view: 'territories' },
  { id: 'l_dungeon5', title: 'Plus bas que les racines', desc: 'Purgez un donjon de niveau 5 ou plus.', check: (s) => [s.stats.maxDungeonLevel || 0, 5], reward: { gold: 4000, crystals: 15 }, view: 'world' },
  { id: 'l_artifacts', title: 'Le cabinet des merveilles', desc: 'Réunissez 5 artefacts.', check: (s) => [Object.keys(s.artifacts || {}).length, 5], reward: { gold: 5000, gems: 5 }, view: 'treasury' },
];

// Missions royales du jour : progression mesurée depuis le début de la journée (stats réelles)
export const DAILY_POOL = [
  { id: 'd_build', title: 'Chantiers du jour', desc: 'Terminez {n} constructions ou améliorations.', stat: 'built', n: [3, 5], view: 'city' },
  { id: 'd_explore', title: 'Éclaireurs du jour', desc: 'Explorez {n} cases.', stat: 'explored', n: [2, 4], view: 'world', need: (s) => (s.army.scout || 0) > 0 },
  { id: 'd_gather', title: 'Récoltes du jour', desc: 'Ramenez {n} récoltes de la carte.', stat: 'gatherDone', n: [1, 3], view: 'world' },
  { id: 'd_battle', title: 'Ordre de bataille', desc: 'Remportez {n} combats.', stat: 'battlesWon', n: [1, 2], view: 'world', need: (s, h) => h.count(s, 'barracks') > 0 },
  { id: 'd_trade', title: 'Jour de marché', desc: 'Effectuez {n} transactions ou caravanes.', stat: 'trades', n: [2, 4], view: 'market', need: (s, h) => h.count(s, 'market') > 0 },
  { id: 'd_contract', title: 'Livraison promise', desc: 'Remplissez {n} contrat.', stat: 'contracts', n: [1, 1], view: 'market', need: (s, h) => h.count(s, 'market') > 0 },
  { id: 'd_craft', title: 'Commande de la forge', desc: 'Forgez {n} objet.', stat: 'crafted', n: [1, 2], view: 'craft', need: (s, h) => h.count(s, 'forge') > 0 },
  { id: 'd_expedition', title: 'Expédition du jour', desc: 'Ramenez {n} expédition.', stat: 'expeditions', n: [1, 1], view: 'expeditions', need: (s) => (s.workers || []).length >= 2 },
];

// Conseils propres à chaque spécialisation, affichés avec le chapitre correspondant (tutoriel adapté)
export const KINGDOM_HINTS = {
  harvest: { 2: 'Moissons : vos fermes produisent +15 %. Deux fermes au bord de la rivière suffisent à nourrir une grande armée — vendez le surplus au marché.', 4: 'Moissons : vos unités coûtent 10 % plus cher, mais votre nourriture permet d’entretenir une armée plus nombreuse que vos voisins.' },
  iron: { 1: 'Fer : placez tôt une mine de fer près des montagnes (+15 % de fer pour vous).', 4: 'Fer : votre infanterie et votre cavalerie encaissent mieux (+5 % de défense). Surveillez la nourriture : l’entretien est 12 % plus élevé.', 5: 'Fer : la forge vous coûte 15 % moins cher. Équipez vos héros tôt.' },
  merchants: { 6: 'Marchands : vos contrats rapportent +10 % et vos caravanes +10 %. Escortez-les : elles sont plus exposées.', 2: 'Marchands : votre or de départ permet un marché rapide. Vendez les surplus plutôt que de les laisser se perdre.' },
  scholars: { 5: 'Érudits : recherches 12 % plus rapides et moins chères. Ne laissez jamais la bibliothèque inactive.', 4: 'Érudits : votre formation est plus lente (−15 %). Préparez vos troupes à l’avance et misez sur la diplomatie.' },
  pioneers: { 3: 'Pionniers : vos éclaireurs coûtent 30 % moins cher et explorent 20 % plus vite. Ouvrez largement la carte.', 7: 'Pionniers : vos expéditions sont plus rapides et consomment moins de vivres.' },
  bastions: { 4: 'Bastions : votre muraille est 30 % plus efficace. Une tour de garde niveau 3 révèle la composition des raids.', 7: 'Bastions : vos garnisons d’avant-poste défendent mieux (+25 %), mais chaque territoire coûte 25 % plus cher : choisissez-les bien.' },
  shadows: { 6: 'Ombres : vos ambassadeurs coûtent 30 % moins cher. Un pacte commercial supprime les raids de cette faction.', 4: 'Ombres : vous connaissez toujours la composition des raids. Espionnez avant d’attaquer : votre attaque est un peu plus faible.' },
  ancients: { 1: 'Anciens : le début est plus serré (ressources −25 %). Priorité au bois, à la pierre et à la nourriture.', 7: 'Anciens : +25 % de chance d’artefact dans les donjons et +50 % de fragments de relique dans les fouilles. Aucun Éclat gratuit : la Roue garde ses probabilités.' },
};

// Branche technologique conseillée par spécialisation (conseiller)
export const KINGDOM_FOCUS = { harvest: 'agriculture', iron: 'craft', merchants: 'economy', scholars: 'economy', pioneers: 'exploration', bastions: 'defense', shadows: 'military', ancients: 'magic' };
