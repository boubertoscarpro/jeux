// Ouvriers, contremaîtres, expéditions automatiques.

// Professions : secteur de prédilection + type d'expédition
export const PROFESSIONS = {
  lumberjack: { name: 'Bûcheron', icon: '🪓', sector: 'wood' },
  miner:      { name: 'Mineur', icon: '⛏️', sector: 'iron' },
  quarryman:  { name: 'Carrier', icon: '🪨', sector: 'stone' },
  farmer:     { name: 'Agriculteur', icon: '🌾', sector: 'food' },
  hunter:     { name: 'Chasseur', icon: '🦌', sector: 'food' },
  prospector: { name: 'Prospecteur', icon: '💎', sector: 'iron' },
  artisan:    { name: 'Artisan', icon: '🔨', sector: 'industry' },
  porter:     { name: 'Porteur', icon: '📦', sector: 'gold' },
};

// Secteurs de travail en ville : les ouvriers affectés augmentent la production
export const WORK_SECTORS = {
  food:     { name: 'Agriculture', icon: '🌾', res: ['food', 'grain', 'wool', 'hides', 'herbs'], buildings: ['farm', 'pasture', 'fishery', 'orchard', 'hunter', 'herbalist'] },
  wood:     { name: 'Forêts', icon: '🪵', res: ['wood', 'coal'], buildings: ['sawmill', 'charcoal'] },
  stone:    { name: 'Carrières', icon: '🪨', res: ['stone'], buildings: ['quarry'] },
  iron:     { name: 'Mines', icon: '⛓️', res: ['iron'], buildings: ['mine'] },
  industry: { name: 'Ateliers', icon: '🏭', res: ['flour', 'bread', 'steel', 'leather', 'cloth', 'planks', 'frames', 'weapons', 'rations'], buildings: ['mill', 'bakery', 'foundry', 'tannery', 'weaver', 'carpentry', 'armory', 'quartermaster'] },
  gold:     { name: 'Commerce & impôts', icon: '🪙', res: ['gold'], buildings: ['house', 'market', 'townhall', 'port'] },
};

// Traits (1 à 2 par ouvrier)
export const TRAITS = {
  seasoned:  { name: 'Expérimenté', desc: '+15% rendement', mods: { yield: 0.15 } },
  lucky:     { name: 'Chanceux', desc: '+5% trouvailles rares', mods: { rare: 0.05 } },
  tireless:  { name: 'Infatigable', desc: '+20% endurance (expéditions plus longues)', mods: { stamina: 0.2 } },
  swift:     { name: 'Vif', desc: '+15% vitesse de trajet', mods: { speed: 0.15 } },
  sturdy:    { name: 'Robuste', desc: '−50% risque de blessure', mods: { injury: -0.5 } },
  leader:    { name: 'Meneur', desc: 'Peut devenir contremaître dès le niveau 3', mods: { leader: 1 } },
  cheerful:  { name: 'Jovial', desc: '+10 moral pour son équipe', mods: { teamMorale: 10 } },
  grumpy:    { name: 'Râleur', desc: '−8 moral pour son équipe, +10% rendement', mods: { teamMorale: -8, yield: 0.1 } },
  frugal:    { name: 'Frugal', desc: 'Consomme moitié moins de nourriture', mods: { upkeep: -0.5 } },
  greedy:    { name: 'Cupide', desc: '+10% butin, parfois chapardeur', mods: { yield: 0.1, theft: 0.03 } },
  cautious:  { name: 'Prudent', desc: '−30% risque d’événements dangereux', mods: { danger: -0.3 } },
  daring:    { name: 'Téméraire', desc: '+30% danger, +10% trouvailles rares', mods: { danger: 0.3, rare: 0.1 } },
};

// Contremaîtres : spécialité de gestion
export const FOREMAN_TYPES = {
  forest:    { name: 'Contremaître forestier', icon: '🌲', desc: '+25% bois (secteur) ; mène les bûcherons', mods: { 'prod.wood': 0.25, 'prod.coal': 0.1 }, exp: ['lumber'] },
  mining:    { name: 'Contremaître minier', icon: '⛏️', desc: '+25% minerais (secteur) ; mène les mineurs', mods: { 'prod.iron': 0.25, 'prod.stone': 0.15 }, exp: ['mining', 'prospecting'] },
  farming:   { name: 'Contremaître agricole', icon: '🌾', desc: '+20% nourriture (secteur)', mods: { 'prod.food': 0.2, 'prod.grain': 0.2 }, exp: ['farming', 'hunting'] },
  logistics: { name: 'Contremaître logistique', icon: '🚚', desc: '−15% temps de transport et de caravane', mods: { 'march.speed': 0.15, 'caravan.speed': 0.15 }, exp: [] },
  military:  { name: 'Contremaître militaire', icon: '🎖️', desc: '+10% vitesse de recrutement', mods: { 'train.speed': 0.1 }, exp: ['mercenary'] },
  workshop:  { name: 'Maître d’atelier', icon: '🏭', desc: '+15% production des chaînes', mods: { 'prod.flour': 0.15, 'prod.bread': 0.15, 'prod.steel': 0.15, 'prod.planks': 0.15, 'prod.weapons': 0.15, 'prod.rations': 0.15, 'prod.leather': 0.15, 'prod.cloth': 0.15 }, exp: [] },
  explorer:  { name: 'Guide', icon: '🧭', desc: 'Mène les expéditions lointaines (+20% vitesse, −20% danger)', mods: { 'explore.speed': 0.1 }, exp: ['exploration', 'prospecting'] },
};

// Types d'expéditions automatiques
// node: types de sites visés ; prof: profession idéale ; per: rendement de base / ouvrier / heure
export const EXPEDITION_TYPES = {
  lumber:      { name: 'Expédition forestière', icon: '🌲', prof: 'lumberjack', nodes: ['woodNode', 'ancientGrove'], per: 90, automation: 1 },
  mining:      { name: 'Expédition minière', icon: '⛏️', prof: 'miner', nodes: ['ironNode', 'ironNodeRich', 'stoneNode', 'coalNode'], per: 55, automation: 1 },
  farming:     { name: 'Cueillette & glanage', icon: '🌿', prof: 'farmer', nodes: ['herbNode', 'foodNode'], per: 70, automation: 1 },
  hunting:     { name: 'Grande chasse', icon: '🦌', prof: 'hunter', nodes: ['foodNode'], per: 80, automation: 1 },
  prospecting: { name: 'Prospection', icon: '💎', prof: 'prospector', nodes: ['silverNode', 'gemNode', 'crystalNode', 'rareVein'], per: 10, automation: 2 },
  exploration: { name: 'Exploration lointaine', icon: '🏛️', prof: 'porter', nodes: [], per: 0, automation: 2 },
  mercenary:   { name: 'Mercenaires', icon: '⚔️', prof: null, nodes: ['banditCamp', 'monsterLair', 'ruinSite', 'crypt', 'abandonedMine'], per: 0, automation: 3 },
};

export const EXPEDITION_DURATIONS = [1, 2, 4, 8]; // heures

// Événements pouvant survenir pendant une expédition
// kinds: types d'expédition concernés ; danger: pondération par danger du site
// choices: décision du joueur (sinon, défaut appliqué au bout de 20 min)
export const EXPEDITION_EVENTS = {
  bandits: {
    title: 'Attaque de bandits', icon: '🏴', kinds: ['lumber', 'mining', 'farming', 'hunting', 'prospecting', 'exploration'], weight: 8, dangerous: true,
    text: 'Des bandits fondent sur le campement !',
    choices: [
      { label: 'Défendre le camp', desc: 'Votre escorte combat. Sans escorte, les ouvriers risquent d’être blessés.', fx: { fight: true } },
      { label: 'Abandonner une partie du butin', desc: 'Perdre 30% de la récolte, personne n’est blessé.', fx: { loseYield: 0.3 } },
    ], default: 0,
  },
  collapse: {
    title: 'Effondrement', icon: '🪨', kinds: ['mining', 'prospecting'], weight: 6, dangerous: true,
    text: 'Une galerie s’effondre ! Plusieurs ouvriers sont coincés.',
    choices: [
      { label: 'Dégager les décombres', desc: 'L’expédition perd 30 min mais tout le monde est sauvé.', fx: { delay: 30 } },
      { label: 'Continuer ailleurs', desc: 'Un ouvrier risque d’être blessé, aucune perte de temps.', fx: { injure: 1 } },
      { label: 'Rentrer immédiatement', desc: 'Retour avec la récolte actuelle.', fx: { abort: true } },
    ], default: 0,
  },
  secretRoom: {
    title: 'Salle secrète', icon: '🚪', kinds: ['mining', 'exploration', 'prospecting'], weight: 3,
    text: 'Derrière une paroi effondrée, une salle oubliée de l’Empire de l’Aube…',
    choices: [
      { label: 'Fouiller la salle', desc: 'Trésor probable… ou piège.', fx: { gamble: { win: 0.65, loot: { gold: [200, 700], crystals: [1, 4] }, item: 0.35, injure: 1 } } },
      { label: 'Sceller et marquer', desc: 'Rien maintenant, mais un donjon apparaît sur la carte.', fx: { spawnDungeon: true } },
    ], default: 1,
  },
  richVein: {
    title: 'Filon exceptionnel', icon: '✨', kinds: ['mining', 'prospecting', 'lumber'], weight: 5,
    text: 'Les ouvriers tombent sur un filon d’une pureté rare.', fx: { bonusYield: 0.35, rare: { rareOre: [1, 3] } },
  },
  injury: {
    title: 'Blessure', icon: '🩹', kinds: ['lumber', 'mining', 'hunting', 'prospecting', 'farming'], weight: 6, dangerous: true,
    text: 'Un ouvrier s’est blessé.', fx: { injure: 1 },
  },
  beast: {
    title: 'Bête des Terres Brisées', icon: '🐗', kinds: ['hunting', 'lumber', 'farming', 'exploration'], weight: 4, dangerous: true,
    text: 'Une bête gigantesque rôde autour du camp.',
    choices: [
      { label: 'La chasser', desc: 'Combat : trophée et cuir si victoire.', fx: { fight: { troll: 1 }, winLoot: { hides: [80, 200], leather: [20, 50] } } },
      { label: 'Lever le camp', desc: 'Fin anticipée de l’expédition.', fx: { abort: true } },
    ], default: 1,
  },
  boss: {
    title: 'Un colosse se réveille', icon: '👹', kinds: ['mining', 'prospecting', 'exploration'], weight: 1, dangerous: true, minDanger: 2,
    text: 'Le sol tremble : un golem ancien sort des profondeurs !',
    choices: [
      { label: 'Combattre', desc: 'Très dangereux. Artefact possible.', fx: { fight: { golem: 2 }, winLoot: { crystals: [3, 8], rareOre: [2, 6] }, artifact: 0.15 } },
      { label: 'Fuir', desc: 'L’expédition rentre aussitôt.', fx: { abort: true } },
    ], default: 1,
  },
  goodMood: {
    title: 'Chants autour du feu', icon: '🔥', kinds: ['lumber', 'mining', 'farming', 'hunting', 'prospecting', 'exploration'], weight: 5,
    text: 'L’équipe chante autour du feu : le moral remonte.', fx: { morale: 15 },
  },
  lostVillage: {
    title: 'Hameau perdu', icon: '🏚️', kinds: ['exploration', 'hunting'], weight: 3,
    text: 'Des familles isolées demandent à rejoindre votre royaume.', fx: { recruits: [1, 3] },
  },
  ruins: {
    title: 'Ruines inconnues', icon: '🏛️', kinds: ['exploration'], weight: 6,
    text: 'Vos explorateurs cartographient des ruines.', fx: { reveal: 3, loot: { stone: [100, 300], gold: [50, 200] } },
  },
};

export const WORKER_NAMES = ['Anselme', 'Berthe', 'Colin', 'Denise', 'Enguerrand', 'Firmin', 'Gisèle', 'Hugon', 'Ide', 'Josse', 'Lambert', 'Mahaut', 'Nicolas', 'Odile', 'Pierrot', 'Renaud', 'Sanche', 'Thibaut', 'Ulric', 'Vivienne', 'Yves', 'Agnès', 'Bertrand', 'Clémence', 'Gautier', 'Héloïse', 'Jacquot', 'Marion', 'Roland', 'Sidonie'];
export const workerXpFor = (lvl) => Math.round(60 * Math.pow(lvl, 1.6));
