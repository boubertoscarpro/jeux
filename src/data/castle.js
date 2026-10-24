// v16 — « Le Château et ses Faubourgs » : zones du royaume, enceinte, raids par zone, flancs de défense, décorations
// utiles, paliers de silhouette et correspondances bâtiment → écrans. Logique : systems/castle.js.
// Les chiffres de défense de base restent ceux de la muraille (`wall`) et des douves (`moat`) dans buildings.js.

export const ZONES = {
  keep: { name: 'Ville fortifiée', short: 'intra-muros', icon: '🏰' },
  moat: { name: 'Douves et glacis', short: 'douves', icon: '🌊' },
  faubourg: { name: 'Abords', short: 'abords', icon: '🏘️' },
  country: { name: 'Campagne', short: 'campagne', icon: '🌾' },
};
// v20 « Ma forteresse » : un anneau d'une case autour de la muraille (douves et glacis, rien n'y est bâti), puis les
// abords (2 cases) et la campagne. Les faubourgs de la v16 deviennent les abords : seule la campagne productive y reste.
export const MOAT_RING = 1;
export const FAUBOURG_DEPTH = 3;

// Où l'on peut bâtir (v20) : toute la ville dans les murs ; la campagne productive dehors ; quelques bâtiments partout
export const KEEP_ONLY = ['townhall', 'castle', 'warehouse', 'house', 'market', 'tavern', 'library', 'guildhall', 'laboratory', 'bakery', 'foundry',
  'weaver', 'carpentry', 'armory', 'quartermaster', 'forge', 'barracks', 'stable', 'workshop', 'embassy', 'cartographer', 'herald', 'lists',
  'scriptorium', 'sanctuary', 'observatory', 'monument', 'hospice'];
export const COUNTRY_ONLY = ['farm', 'pasture', 'orchard', 'sawmill', 'quarry', 'mine', 'charcoal', 'hunter', 'herbalist', 'fishery', 'port'];
export const OUTSIDE_ONLY = [];
export const ZONE_RULE_TEXT = {
  keep: 'Dans les murs (ville fortifiée)',
  country: 'Hors les murs (campagne)',
  outside: 'Hors les murs',
  any: 'Partout (sauf sur les douves)',
};
// Familles de la ville : quartier préféré dans la cour et couleur des toits (repérage, jamais la couleur seule)
export const FAMILIES = {
  core: { name: 'Cœur du château', roof: '#2f9c94', dir: [0, 0] },
  military: { name: 'Militaire', roof: '#a8432f', dir: [0, 1] },
  economy: { name: 'Économie', roof: '#b0662e', dir: [1, 0] },
  knowledge: { name: 'Savoir', roof: '#3f6fa3', dir: [0, -1] },
  places: { name: 'Lieux et vitrine', roof: '#47b3a8', dir: [-1, 0] },
};
export const FAMILY_OF = {
  townhall: 'core', castle: 'core', warehouse: 'core',
  barracks: 'military', stable: 'military', workshop: 'military', watchtower: 'military', hospice: 'military', armory: 'military', quartermaster: 'military', lists: 'military',
  house: 'economy', market: 'economy', bakery: 'economy', foundry: 'economy', weaver: 'economy', carpentry: 'economy', forge: 'economy', mill: 'economy', tannery: 'economy',
  library: 'knowledge', laboratory: 'knowledge', observatory: 'knowledge', scriptorium: 'knowledge', cartographer: 'knowledge',
  tavern: 'places', guildhall: 'places', embassy: 'places', herald: 'places', sanctuary: 'places', monument: 'places', deco: 'places', trophy: 'places',
};

// Effets selon la zone (bonus de production ajouté comme l'adjacence ; ou modificateurs bornés). v20 : la ville étant
// dans les murs, les malus de la cour (maisons, marché, taverne, guilde) et le bonus de la cour d'armes disparaissent.
export const ZONE_FX = {
  warehouse: { keep: { mods: { protect: 0.05 }, text: 'à l’abri des murs : +5 points de protection', cap: { protect: 0.1 } } },
  watchtower: { faubourg: { mods: { 'raid.warning': 0.1 }, text: 'voit plus loin : préavis des raids +10 %' }, country: { mods: { 'raid.warning': 0.1 }, text: 'voit plus loin : préavis des raids +10 %' } },
};
export const ZONE_FX_CAP = { protect: 0.1, 'train.speed': 0.1, 'raid.warning': 0.2 };

// v20 : agrandissements successifs de l'enceinte, un par palier de l'hôtel de ville. Chaque palier contient au moins le
// nombre maximal de bâtiments de ville permis à l'hôtel de ville où il s'ouvre (vérifié par les tests).
export const ENC_STAGES = [
  { size: 6, th: 1, cost: {} },
  { size: 7, th: 4, cost: { stone: 1200, wood: 800, gold: 400 } },
  { size: 8, th: 8, cost: { stone: 5000, wood: 3000, gold: 2000 } },
  { size: 9, th: 12, cost: { stone: 15000, wood: 9000, gold: 6000, frames: 150 } },
  { size: 10, th: 18, cost: { stone: 40000, wood: 25000, gold: 15000, frames: 400 } },
  { size: 11, th: 24, cost: { stone: 90000, wood: 60000, gold: 40000, frames: 900 } },
];
// Enceinte : rectangle de cases (cour), muraille sur le bord
export const ENCEINTE = {
  start: ENC_STAGES[0].size,
  maxW: () => ENC_STAGES[ENC_STAGES.length - 1].size,
  maxH: () => ENC_STAGES[ENC_STAGES.length - 1].size,
  // v20 : la taille de l'enceinte n'est plus un choix (elle suit la ville) : plus de pénalité de périmètre
  refPerimeter: 20, perPerimeter: 0, factorMin: 1, factorMax: 1,
  freeMoveDays: 7,                            // déménagement gratuit après la réorganisation d'une ancienne partie
  migrateMargin: 0.1,                         // migration : 10 % de place en plus que les bâtiments de ville existants
};

// Raids par zone et dégâts de la muraille
export const SIEGE = {
  breachBase: 0.65, breachPerWall: 0.025, breachPerMoat: 0.03, breachMin: 0.15, breachMax: 0.65,
  heldPillage: 0.22,                          // pillage si la muraille tient et qu'un entrepôt est intra-muros (au lieu de 0,30)
  dmgWin: 0.05, dmgLoss: 0.15, dmgBreach: 0.3,
  dmgPenalty: 0.25,                           // bonus de muraille −25 % × dégâts
  repairPerHour: 0.1,
  repairCost: (wall) => ({ stone: 80 * Math.max(1, wall) }), // pour 100 % de dégâts
};

// Douves et crue : chance de débordement selon le niveau
export const MOAT_FLOOD = { base: 0.6, perLevel: 0.06 };

// Défense par flancs
export const FLANKS = {
  left: { name: 'Flanc gauche', icon: '◧' },
  front: { name: 'Front (porte)', icon: '▣' },
  right: { name: 'Flanc droit', icon: '◨' },
  yard: { name: 'Cour (réserve)', icon: '◎' },
};
export const ASSAULT_FLANKS = ['left', 'front', 'right'];
export const FLANK_RULES = {
  yardWeight: 0.5,                            // la réserve de la cour renforce le flanc attaqué à moitié
  neutral: 0.375,                             // part effective d'une répartition égale (0,25 + 0,5 × 0,25)
  maxBonus: 0.15,                             // ±15 % de défense selon la part effective
  weakestChance: 0.5,                         // les assaillants visent le flanc le plus faible une fois sur deux
  revealWatchtower: 5,                        // tour de garde 5 : le flanc visé est connu à l'avance
};
export const DEFENSE_TOOLS = {
  stones: { name: 'Pierres', icon: '🪨', needWall: 1, cost: (th) => ({ stone: 100 * th }), mods: { 'combat.def': 0.04 }, text: 'défense +4 % sur ce flanc' },
  pitch: { name: 'Poix bouillante', icon: '🫕', needWall: 5, cost: (th) => ({ coal: 20 * th, wood: 40 * th }), mods: { 'combat.atk': 0.04 }, text: 'attaque +4 % sur ce flanc' },
  archers: { name: 'Archers sur les tours', icon: '🏹', needWall: 10, cost: (th) => ({ wood: 60 * th }), mods: { 'combat.atk': 0.04 }, text: 'attaque +4 % sur ce flanc (tours requises)' },
};

// Décorations utiles (bornées)
// v20 : la ville est dans les murs ; une décoration y porte les deux effets (bornés) et l'ordre public (systems/order.js)
export const DECO_FX = {
  faubourg: null,
  keep: { mod: 'combat.morale', per: 1, max: 3, text: 'moral de la garnison +1' },
  keepNear: { mod: 'worker.morale', per: 2, max: 4, near: ['house', 'market', 'tavern'], text: 'moral des ouvriers +2 (à côté de maisons, d’un marché ou d’une taverne)' },
  country: null,
};

// Silhouette du château selon l'hôtel de ville
export const CASTLE_STAGES = [
  { th: 1, key: 'hamlet', name: 'Hameau', text: 'Quelques maisons autour d’une halle.' },
  { th: 3, key: 'village', name: 'Village palissadé', text: 'Une palissade protège le cœur du village.' },
  { th: 6, key: 'bourg', name: 'Bourg', text: 'Le bourg s’entoure de pierre et se donne des tours.' },
  { th: 10, key: 'city', name: 'Cité fortifiée', text: 'Remparts, tours et bannières : une vraie cité.' },
  { th: 15, key: 'capital', name: 'Capitale', text: 'La capitale d’un royaume : on la voit de loin.' },
];
// Apparence de la muraille selon son niveau
export const WALL_STYLES = [
  { from: 0, key: 'stakes', name: 'Enceinte projetée' },
  { from: 1, key: 'palisade', name: 'Palissade de bois' },
  { from: 5, key: 'stone', name: 'Mur de pierre' },
  { from: 10, key: 'towers', name: 'Remparts à tours' },
  { from: 18, key: 'fortress', name: 'Forteresse' },
];

// La ville devient le menu : bâtiment → écrans (dérivé de la table des lieux, data/places.js)
import { PLACES, SCREEN_PLACE } from './places.js';
import { BUILDINGS as B_ } from './buildings.js';
export const BUILDING_SCREENS = Object.fromEntries(Object.values(PLACES).filter((p) => p.kind === 'building').map((p) => [p.type, p.screens]));
// Terrains vagues : chaque bâtiment qui est le lieu principal d'un écran et n'est pas encore construit (les nouveaux
// lieux, eux, sont posés d'office ; l'hôtel de ville et l'entrepôt existent dès le départ)
export const LOT_TYPES = [...new Set(Object.values(SCREEN_PLACE).map((k) => PLACES[k]).filter((p) => p.kind === 'building' && !B_[p.type]?.place).map((p) => p.type))];
