// Grands Projets du Royaume (« projets de la Couronne ») : dépenses facultatives et coûteuses qui transforment les
// excédents en avantages concrets. Ils complètent les grands projets royaux à étapes (data/projects.js) dans le même
// écran, sans les remplacer.
//
// Chaque projet :
//   family : infra | military | economy | prestige
//   th     : niveau d'hôtel de ville requis (paliers 6 / 8-11 / 13-16)
//   cost   : coût de base, payé EN UNE FOIS au lancement (jamais de paiement partiel ni de stock négatif) ;
//            il suit l'économie réelle : +12 % par niveau d'HdV au-delà du palier, ×growth à chaque répétition,
//            et ne dépasse jamais 70 % de la capacité de stockage (sinon il serait impossible à payer)
//   hours  : durée des travaux ; à la fin le projet devient « à récupérer » (récompense réclamée une seule fois)
//   repeat : absent = projet unique ; sinon { max, cooldownH, growth } (limite, délai entre deux, coût croissant)
//   req    : conditions [texte, (s, h) => bool] affichées avant d'investir
//   rare   : condition de déblocage par haut fait [texte, (s, h) => bool] (projet caché tant qu'elle manque)
//   event  : true = n'existe que pendant un événement en cours (calendrier existant), une fois par événement
//   reward : connue d'avance — mods (permanents, projets uniques seulement, modestes), buff { name, mods, hours }
//            (temporaire), res (petites quantités), speedups, title, deco, insignia, relic, eventCurrency
// Garde-fous : la valeur des ressources rendues est toujours inférieure au coût (aucune boucle infinie, vérifié par
// les tests) ; les bonus temporaires restent modestes (≤ +20 % de vitesse de formation, ≤ +8 % de production).
export const CROWN_FAMILIES = {
  infra:    { name: 'Infrastructures', icon: '🛣️', desc: 'Routes, entrepôts, convois et terres : le royaume tourne mieux.' },
  military: { name: 'Préparation militaire', icon: '⚔️', desc: 'Arsenaux et mobilisations : passe-temps de recrutement, formation plus rapide.' },
  economy:  { name: 'Développement économique', icon: '💰', desc: 'Foires, corporations et réseaux : le commerce s’emballe un temps.' },
  prestige: { name: 'Prestige', icon: '👑', desc: 'Monuments, statues et cérémonies : titres, décorations, insignes.' },
};

// Projets menés en parallèle : 2, puis 3 à l'hôtel de ville 20
export const CROWN_MIN_TH = 6;
export const crownSlots = (th) => (th >= 20 ? 3 : 2);
export const CROWN_TH_STEP = 0.12;   // +12 % de coût par niveau d'HdV au-delà du palier du projet
export const CROWN_CAP_SHARE = 0.7;  // jamais plus de 70 % de la capacité de stockage d'une ressource
export const CROWN_REFUND = 0.5;     // annulation : la moitié du coût est rendue

export const CROWN_PROJECTS = {
  // ───────── Infrastructures ─────────
  royalRoads: {
    family: 'infra', name: 'Routes royales', icon: '🛣️', th: 6, hours: 4,
    desc: 'Paver les routes entre la capitale, les mines et les avant-postes.',
    cost: { stone: 6000, wood: 4000, gold: 1500 },
    reward: { mods: { 'march.speed': 0.03, 'caravan.speed': 0.05 } },
  },
  fortWarehouses: {
    family: 'infra', name: 'Entrepôts fortifiés', icon: '🏚️', th: 8, hours: 6,
    desc: 'Des greniers de pierre gardés jour et nuit : on stocke davantage sans rien perdre.',
    cost: { stone: 9000, wood: 6000, iron: 1500, planks: 200 },
    req: [['Entrepôt niveau 8', (s, h) => h.level('warehouse') >= 8]],
    reward: { mods: { 'storage.pct': 0.05 } },
  },
  convoyNetwork: {
    family: 'infra', name: 'Réseau de convois', icon: '🐂', th: 11, hours: 8,
    desc: 'Relais, escortes et charrons sur toutes les routes du royaume.',
    cost: { planks: 600, frames: 120, gold: 6000, rations: 150 },
    req: [['Au moins un avant-poste', (s, h) => h.outposts() >= 1]],
    reward: { mods: { 'convoy.risk': -0.05, 'caravan.gain': 0.05 } },
  },
  landRehab: {
    family: 'infra', name: 'Réhabilitation des terres', icon: '🌾', th: 7, hours: 6,
    desc: 'Drainer, amender et replanter les terres brûlées autour de la capitale.',
    cost: { wood: 5000, food: 4000, gold: 1200 },
    repeat: { max: 3, cooldownH: 48, growth: 1.35 },
    reward: { buff: { name: 'Terres réhabilitées', mods: { 'prod.all': 0.05 }, hours: 48 }, res: { herbs: 60 } },
  },
  // ───────── Préparation militaire ─────────
  crownArsenal: {
    family: 'military', name: 'Arsenal de la Couronne', icon: '🛡️', th: 8, hours: 6,
    desc: 'Un arsenal royal où les armes et les harnais attendent les recrues.',
    cost: { iron: 6000, wood: 5000, steel: 60, gold: 2000 },
    req: [['Caserne niveau 6', (s, h) => h.level('barracks') >= 6]],
    reward: { mods: { 'train.speed': 0.04 }, speedups: { rspeed60: 2 } },
  },
  warReserve: {
    family: 'military', name: 'Réserve de guerre', icon: '🍖', th: 6, hours: 3,
    desc: 'Remplir les magasins de l’armée : les sergents forment plus vite.',
    cost: { food: 6000, iron: 2000, gold: 1000 },
    repeat: { max: 5, cooldownH: 24, growth: 1.3 },
    reward: { buff: { name: 'Réserve de guerre', mods: { 'train.speed': 0.1 }, hours: 12 }, speedups: { rspeed15: 3, rspeed5: 2 } },
  },
  royalMobilization: {
    family: 'military', name: 'Mobilisation royale', icon: '📯', th: 11, hours: 4,
    desc: 'Le ban et l’arrière-ban sont convoqués : toutes les casernes tournent à plein.',
    cost: { food: 12000, gold: 5000, weapons: 80, rations: 120 },
    repeat: { max: 4, cooldownH: 72, growth: 1.4 },
    reward: { buff: { name: 'Mobilisation royale', mods: { 'train.speed': 0.2 }, hours: 8 }, speedups: { rspeed60: 2 } },
  },
  trainingCamp: {
    family: 'military', name: 'Camp d’entraînement royal', icon: '🏕️', th: 14, hours: 12,
    desc: 'Lices, buttes de tir et maîtres d’armes au service de toute l’armée.',
    cost: { steel: 300, frames: 200, stone: 20000, gold: 10000 },
    req: [['Caserne niveau 12', (s, h) => h.level('barracks') >= 12]],
    reward: { mods: { 'train.speed': 0.05 }, speedups: { rspeed480: 1 }, res: { rareOre: 20 } },
  },
  // ───────── Développement économique ─────────
  royalFair: {
    family: 'economy', name: 'Foire royale', icon: '🎪', th: 6, hours: 3,
    desc: 'Marchands, jongleurs et changeurs : pendant un jour, tout s’échange mieux.',
    cost: { food: 5000, wood: 3000, gold: 2500 },
    repeat: { max: 6, cooldownH: 48, growth: 1.25 },
    reward: { buff: { name: 'Foire royale', mods: { 'caravan.gain': 0.15, 'contract.reward': 0.1 }, hours: 24 } },
  },
  artisanGuild: {
    family: 'economy', name: 'Corporation des artisans', icon: '🔨', th: 10, hours: 8,
    desc: 'Statuts, apprentis et maîtres jurés : les ateliers travaillent plus vite.',
    cost: { planks: 500, cloth: 150, gold: 6000, stone: 8000 },
    req: [['Menuiserie niveau 3', (s, h) => h.level('carpentry') >= 3]],
    reward: { mods: { 'craft.speed': 0.08 } },
  },
  tradeNetwork: {
    family: 'economy', name: 'Réseau commercial', icon: '⚖️', th: 13, hours: 10,
    desc: 'Comptoirs et lettres de change dans toutes les cités libres.',
    cost: { gold: 15000, cloth: 300, frames: 150, rations: 200 },
    req: [['Marché niveau 10', (s, h) => h.level('market') >= 10]],
    reward: { mods: { 'market.fee': -0.005, 'caravan.gain': 0.08 } },
  },
  // ───────── Prestige ─────────
  restoreMonument: {
    family: 'prestige', name: 'Restauration du monument ancien', icon: '🏛️', th: 9, hours: 8,
    desc: 'Relever les colonnes du vieux sanctuaire des fondateurs.',
    cost: { stone: 15000, gold: 5000, planks: 300 },
    reward: { title: 'Restaurateur des Anciens', deco: 'deco_restored', insignia: 5 },
  },
  dynasticStatue: {
    family: 'prestige', name: 'Statue dynastique', icon: '👑', th: 12, hours: 10,
    desc: 'Une statue de bronze du premier souverain, au centre de la grand-place.',
    cost: { stone: 20000, steel: 200, gold: 10000, crystals: 20 },
    reward: { title: 'Fondateur de dynastie', deco: 'deco_dynasty', insignia: 8 },
  },
  victoryFeast: {
    family: 'prestige', name: 'Célébration de victoire', icon: '🎌', th: 8, hours: 2,
    desc: 'Défilé, banquet et tournoi pour fêter les armes du royaume.',
    cost: { food: 10000, gold: 4000, wood: 3000 },
    repeat: { max: 3, cooldownH: 72, growth: 1.3 },
    req: [['20 batailles gagnées', (s) => (s.stats.battlesWon || 0) >= 20]],
    reward: { buff: { name: 'Liesse de la victoire', mods: { 'combat.morale': 8 }, hours: 24 }, insignia: 2, deco: 'deco_triumph' },
  },
  royalCeremony: {
    family: 'prestige', name: 'Cérémonie royale du sacre', icon: '🕍', th: 15, hours: 12,
    desc: 'Sacre solennel devant les seigneurs du royaume réunis.',
    cost: { gold: 25000, cloth: 500, crystals: 40, rareOre: 30 },
    reward: { title: 'Souverain consacré', insignia: 15, buff: { name: 'Sacre royal', mods: { 'prod.all': 0.08 }, hours: 72 } },
  },
  // ───────── Lié aux événements (calendrier existant) ─────────
  eventBanquet: {
    family: 'economy', name: 'Banquet de l’événement', icon: '🍷', th: 6, hours: 2, event: true,
    desc: 'Pendant un événement, un banquet attire marchands et mercenaires : monnaie d’événement et sabliers.',
    cost: { food: 8000, gold: 3000 },
    reward: { eventCurrency: 300, speedups: { rspeed15: 2 } },
  },
  // ───────── Rares (débloqués par un haut fait) ─────────
  breachTrophy: {
    family: 'military', name: 'Trophée de la Brèche', icon: '🩸', th: 10, hours: 10,
    desc: 'Exposer les étendards pris aux Seigneurs de la Brèche.',
    rare: ['3 Seigneurs de la Brèche vaincus', (s, h) => h.breachDefeated() >= 3],
    cost: { steel: 400, rareOre: 40, gold: 12000 },
    reward: { title: 'Pourfendeur de la Brèche', speedups: { rspeed480: 1, speed480: 1 }, relic: 2 },
  },
  trophyHall: {
    family: 'prestige', name: 'Salle des trophées', icon: '🏆', th: 10, hours: 8,
    desc: 'Crânes, griffes et écailles des grandes bêtes abattues par vos armées.',
    rare: ['3 boss mondiaux abattus', (s) => (s.stats.bossKills || 0) >= 3],
    cost: { stone: 18000, gold: 8000, ancientWood: 30 },
    reward: { deco: 'deco_trophies', insignia: 6, res: { crystals: 30 } },
  },
  royalAtlas: {
    family: 'infra', name: 'Atlas royal', icon: '🗺️', th: 9, hours: 6,
    desc: 'Rassembler les relevés de vos éclaireurs dans un grand atlas.',
    rare: ['150 cases explorées', (s) => (s.stats.explored || 0) >= 150],
    cost: { gold: 8000, cloth: 120, planks: 300 },
    reward: { title: 'Cartographe royal', mods: { 'explore.speed': 0.05 } },
  },
};
