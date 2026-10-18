// v14 « Répercussions » : présages, crises en cascade, réserves royales, feu et eau sur la carte du royaume.
// Toutes les valeurs d'équilibrage du lot sont ici. Les montants « perTh » sont multipliés par le niveau d'HdV.

// ───────── Présages (remplacent les rumeurs de la taverne) ─────────
// Une catastrophe ou une tension du marché est annoncée à l'avance ; une partie des présages est fausse. La fiabilité
// dépend des sources du royaume (taverne, tour de garde, observatoire) et se recoupe (astrologues ou éclaireur).
export const OMEN = {
  leadMin: [60, 120],        // délai entre l'annonce et l'échéance (minutes)
  baseReliability: 0.55,     // sans aucune source
  perTavern: 0.03, maxTavern: 5,
  perWatch: 0.02, maxWatch: 5,
  observatory: 0.08,
  maxReliability: 0.88,
  marketPerHour: 0.15,       // présages du marché (ex-rumeurs)
  verifyGoldPerTh: 30,       // « Consulter les astrologues » : réponse immédiate
  scoutMin: 30,              // « Envoyer un éclaireur » : un éclaireur absent 30 min, gratuit
  keep: 8,                   // présages conservés dans l'almanach (passés compris)
  // v15 — Signes : toutes les 20 min entre l'annonce et l'échéance, un signe peut apparaître (visible sur la carte du
  // royaume). Un présage vrai en produit plus souvent qu'un faux : la fiabilité affichée est recalculée (règle de Bayes),
  // elle reste donc une vraie probabilité.
  signEveryMin: 20,
  signLikelihood: { true: 0.55, false: 0.18 },
};
// Signes visibles par fléau (texte de l'almanach ; dessin : src/ui/atlas.js)
export const SIGNS = {
  drought: { name: 'Champs qui jaunissent', icon: '🌾', text: 'Des taches sèches apparaissent dans les champs, les puits baissent.' },
  flood: { name: 'Rivière qui gonfle', icon: '🌊', text: 'La rivière monte et lèche ses berges.' },
  blizzard: { name: 'Givre précoce', icon: '❄️', text: 'Un givre inhabituel blanchit les bords du royaume.' },
  tempest: { name: 'Ciel lourd', icon: '🌩️', text: 'De lourds nuages s’amoncellent à l’horizon.' },
  eruption: { name: 'Grondements', icon: '🌋', text: 'La terre tremble et une lueur rougit l’horizon.' },
};
export const reliabilityBand = (q) => (q >= 0.75 ? { key: 'high', name: 'Forte', icon: '🟢' } : q >= 0.62 ? { key: 'mid', name: 'Moyenne', icon: '🟡' } : { key: 'low', name: 'Faible', icon: '🟠' });

export const MARKET_OMENS = [
  { res: 'iron', text: 'On murmure qu’une grande guerre se prépare : le fer va manquer.' },
  { res: 'food', text: 'Les anciens annoncent une mauvaise récolte chez les voisins : la nourriture va renchérir.' },
  { res: 'cloth', text: 'Une caravane de soieries a été pillée : le tissu va se faire rare.' },
  { res: 'steel', text: 'Les forges de Valdor tournent au ralenti : l’acier va monter.' },
  { res: 'leather', text: 'Une épizootie frappe les troupeaux du sud : le cuir va flamber.' },
  { res: 'coal', text: 'Les charbonniers de l’est parlent d’un hiver sans fin : le charbon va manquer.' },
  { res: 'herbs', text: 'Une fièvre court dans les cités libres : les herbes vont s’arracher.' },
];
export const CATASTROPHE_OMEN_TEXT = {
  drought: 'Les puits baissent et le ciel reste blanc : une sécheresse s’annonce.',
  flood: 'La neige fond trop vite dans les montagnes : la rivière pourrait déborder.',
  blizzard: 'Les bergers rentrent leurs bêtes : un blizzard se prépare.',
  tempest: 'Les oiseaux fuient vers l’intérieur des terres : une tempête approche.',
  eruption: 'La terre gronde sous les Terres de cendre : un volcan pourrait s’éveiller.',
};

// Préparations : payées sur la foi d'un présage (même s'il se révèle faux). Une catastrophe préparée frappe quand même,
// mais ne dégénère pas en crise ; la crue n'abîme presque rien. v15 : demi-mesure à moitié prix (la crise est contenue à
// sa première étape, la crue fait 60 % des dégâts), complétable ensuite en préparation entière (l'autre moitié).
export const HALF_PREP = { share: 0.5, floodGuard: 0.6 };
export const PREPARATIONS = {
  drought: { label: 'Creuser des citernes', icon: '🪣', costPerTh: { stone: 60, wood: 40 }, text: 'La sécheresse ne tournera pas à la crise.' },
  flood: { label: 'Monter des sacs de sable', icon: '🧱', costPerTh: { wood: 60, cloth: 4 }, text: 'Dégâts de la crue divisés par 4, et pas de crise.', floodGuard: 0.25 },
  blizzard: { label: 'Rentrer du bois de chauffe', icon: '🪵', costPerTh: { wood: 90 }, text: 'Le blizzard ne tournera pas à la crise.' },
};

// ───────── Crises en cascade ─────────
// Une crise naît d'une catastrophe (ou d'un incendie en ville). Chaque étape dure `hours` puis passe à la suivante ;
// la dernière, une fois écoulée, clôt la crise (« subie »). Les effets d'une étape ne valent que pendant cette étape :
//   mods (clés de modifiers.js), price (multiplicateurs du marché), council (pressions sur les groupes du conseil),
//   stab (stabilité des provinces), revolt (une province bascule en révolte en entrant dans l'étape), spread (incendie).
// Interventions : coût en stock (`costPerTh`) ou puisé dans la réserve royale (`reservePerTh`) ; `resolve` met fin à la
// crise, `delayH` repousse l'étape suivante (une fois par crise). `favor` = variation immédiate de faveur au conseil.
export const CRISIS = { minTh: 3, cooldownH: 8, historyKeep: 12 };

export const CRISES = {
  drought: {
    name: 'Sécheresse', icon: '🔥', from: 'drought',
    stages: [
      { name: 'Récoltes compromises', icon: '🌾', hours: 3, text: 'Les champs jaunissent. Si rien n’est fait, le prix du pain montera.' },
      { name: 'Le pain renchérit', icon: '🥖', hours: 4, price: { food: 1.4, grain: 1.4, flour: 1.3, bread: 1.4 }, council: { peasants: -8 }, text: 'Les marchés s’affolent : nourriture et grain +40 %. Les villages s’inquiètent.' },
      { name: 'Grogne des campagnes', icon: '😠', hours: 4, price: { food: 1.4, grain: 1.4, bread: 1.4 }, council: { peasants: -18, nobles: -5 }, stab: -8, text: 'L’Assemblée des villages gronde ; les provinces s’agitent.' },
      { name: 'Jacquerie', icon: '🔥', hours: 6, council: { peasants: -25 }, stab: -12, mods: { 'prod.all': -0.05 }, revolt: true, text: 'Les paysans prennent les fourches : la province la plus instable se soulève.' },
    ],
    interventions: [
      { id: 'canals', label: 'Creuser des canaux d’irrigation', icon: '⛏️', stages: [0], costPerTh: { wood: 120, stone: 90 }, resolve: true, buff: { name: 'Canaux d’irrigation', mods: { 'prod.food': 0.05 }, hours: 12 }, text: 'Tôt et durable : la récolte est sauvée.' },
      { id: 'granary', label: 'Ouvrir les greniers royaux', icon: '🏺', stages: [0, 1, 2], reservePerTh: { food: 350 }, resolve: true, favor: { peasants: 6 }, text: 'La réserve nourrit les villages.' },
      { id: 'import', label: 'Acheter du grain aux cités libres', icon: '🪙', stages: [1, 2, 3], costPerTh: { gold: 260 }, resolve: true, favor: { merchants: 3 }, text: 'Cher, mais immédiat.' },
      { id: 'ration', label: 'Rationner la cour', icon: '🍽️', stages: [1, 2], delayH: 4, favor: { nobles: -8, peasants: 4 }, text: 'Gagne 4 h, au prix de la colère des nobles.' },
      { id: 'concede', label: 'Concessions aux villages', icon: '📜', stages: [3], costPerTh: { gold: 150 }, resolve: true, favor: { peasants: 10, nobles: -10 }, calm: 15, text: 'Apaise la jacquerie : stabilité des provinces +15.' },
    ],
  },
  flood: {
    name: 'Crue', icon: '🌊', from: 'flood',
    stages: [
      { name: 'Ponts emportés', icon: '🌉', hours: 3, mods: { 'caravan.speed': -0.2 }, text: 'Les gués sont noyés : caravanes plus lentes.' },
      { name: 'Fièvre des marais', icon: '🦟', hours: 4, mods: { 'prod.all': -0.05 }, price: { herbs: 1.6 }, council: { peasants: -8 }, text: 'Les eaux stagnantes rendent malade : production −5 %, herbes +60 %.' },
      { name: 'Épidémie', icon: '☠️', hours: 5, mods: { 'prod.all': -0.1, 'train.speed': -0.15 }, council: { peasants: -15, scholars: -5 }, stab: -6, text: 'La fièvre gagne le royaume : production −10 %, entraînement −15 %.' },
    ],
    interventions: [
      { id: 'bridges', label: 'Rebâtir les ponts', icon: '🪵', stages: [0], costPerTh: { wood: 110 }, resolve: true, text: 'Tôt et bon marché.' },
      { id: 'drain', label: 'Assécher les marais', icon: '⛏️', stages: [0, 1], costPerTh: { wood: 150, stone: 120 }, resolve: true, favor: { peasants: 4 }, text: 'Supprime la source de la fièvre.' },
      { id: 'remedies', label: 'Distribuer des remèdes', icon: '🌿', stages: [1, 2], reservePerTh: { herbs: 45 }, resolve: true, favor: { peasants: 6, scholars: 4 }, text: 'Les herbes de la réserve soignent les malades.' },
      { id: 'quarantine', label: 'Quarantaine', icon: '🚧', stages: [1, 2], resolve: true, favor: { merchants: -10 }, buff: { name: 'Quarantaine', mods: { 'caravan.gain': -0.15 }, hours: 8 }, text: 'Gratuite, mais les caravanes perdent 15 % pendant 8 h.' },
    ],
  },
  blizzard: {
    name: 'Grand hiver', icon: '🌨️', from: 'blizzard',
    stages: [
      { name: 'Routes coupées', icon: '🛷', hours: 2, mods: { 'march.speed': -0.1 }, text: 'La neige bloque les chemins.' },
      { name: 'Pénurie de charbon', icon: '🌑', hours: 4, price: { coal: 1.7, steel: 1.3 }, mods: { 'prod.steel': -0.15 }, council: { merchants: -5 }, text: 'Charbon +70 %, acier +30 % ; les fonderies tournent au ralenti.' },
      { name: 'Grand froid', icon: '🥶', hours: 5, mods: { upkeep: 0.15, 'prod.food': -0.1 }, council: { peasants: -15 }, stab: -8, text: 'Le froid tue : entretien +15 %, nourriture −10 %.' },
    ],
    interventions: [
      { id: 'clear', label: 'Dégager les routes', icon: '🧹', stages: [0], costPerTh: { gold: 60, food: 60 }, resolve: true, text: 'Des corvées de déneigement, tôt.' },
      { id: 'firewood', label: 'Distribuer le bois de chauffe', icon: '🔥', stages: [1, 2], reservePerTh: { wood: 220, coal: 20 }, resolve: true, favor: { peasants: 6 }, text: 'La réserve chauffe les foyers.' },
      { id: 'coal', label: 'Acheter du charbon', icon: '🪙', stages: [1, 2], costPerTh: { gold: 220 }, resolve: true, favor: { merchants: 3 }, text: 'Cher, mais immédiat.' },
      { id: 'shelter', label: 'Ouvrir le château aux sans-abri', icon: '🏰', stages: [2], costPerTh: { food: 200 }, resolve: true, favor: { peasants: 8, nobles: -8 }, text: 'Les nobles grincent des dents.' },
    ],
  },
  fire: {
    name: 'Incendie', icon: '🔥', from: 'fire',
    stages: [
      { name: 'Le feu prend', icon: '🔥', hours: 0.5, spread: true, text: 'Le feu menace les bâtiments voisins (le bois brûle, la pierre résiste ; routes, rivière et cases libres l’arrêtent).' },
      { name: 'Le quartier brûle', icon: '🏚️', hours: 0.5, spread: true, text: 'Les flammes gagnent du terrain.' },
      { name: 'Sans-abri', icon: '⛺', hours: 4, mods: { 'prod.all': -0.03 }, council: { peasants: -10 }, text: 'Des familles dorment dehors : l’Assemblée des villages s’impatiente.' },
    ],
    interventions: [
      { id: 'buckets', label: 'Chaîne de seaux', icon: '🪣', stages: [0, 1], costPerTh: { gold: 40 }, toStage: 2, text: 'Arrête la propagation (les sinistrés restent à reloger).' },
      { id: 'relief', label: 'Reloger les sinistrés', icon: '🏠', stages: [2], reservePerTh: { food: 120, wood: 120 }, resolve: true, favor: { peasants: 6 }, text: 'La réserve abrite et nourrit les familles.' },
      { id: 'reliefPay', label: 'Payer le relogement', icon: '🪙', stages: [2], costPerTh: { gold: 120, wood: 80 }, resolve: true, favor: { peasants: 4 }, text: 'Sur les stocks du royaume.' },
    ],
  },
};

// ───────── Réserves royales ─────────
// Des ressources existantes, mises de côté hors entrepôt. On ne peut pas les reprendre librement : elles servent aux
// interventions de crise, et la nourriture peut être rendue au royaume pendant une famine. Plafond : une part de la
// capacité de l'entrepôt pour cette ressource.
export const RESERVE = {
  res: ['food', 'wood', 'coal', 'herbs'],
  capShare: { food: 0.6, wood: 0.4, coal: 0.25, herbs: 0.25 },
  depositShare: 0.25,        // un versement manuel = 25 % du stock actuel (borné par la place)
};

// ───────── Feu et eau sur la carte du royaume ─────────
// Inflammabilité par bâtiment (1 = bois, 0,35 = pierre, 0 = ne brûle pas). Par défaut : bois.
export const FIRE = {
  spread: 0.45,              // chance de base qu'un bâtiment voisin s'embrase à chaque vague
  maxBurn: 4,                // bâtiments touchés au plus par un incendie (le premier compris)
  water: 0.5,                // protection d'un bâtiment voisin de la rivière
  guardRange: 3,             // caserne ou tour de garde à cette distance : le feu est maîtrisé après la 1re vague
  stone: ['townhall', 'castle', 'quarry', 'mine', 'foundry', 'forge', 'warehouse', 'barracks', 'watchtower', 'library', 'laboratory', 'sanctuary', 'observatory', 'guildhall', 'quartermaster', 'monument', 'armory'],
  none: ['road', 'deco', 'wall', 'moat'],
};
export const FLOOD = { damage: 0.4 };   // chance qu'un bâtiment en zone inondable soit endommagé par une crue

// ───────── Frontières contestées ─────────
export const BORDER = { range: 3, hostile: -8, friendly: 4, hostileRelation: -30, friendlyRelation: 40 };
