// v16 — « Le Château et ses Faubourgs » : zones du royaume, enceinte, raids par zone, flancs de défense, décorations
// utiles, paliers de silhouette et correspondances bâtiment → écrans. Logique : systems/castle.js.
// Les chiffres de défense de base restent ceux de la muraille (`wall`) et des douves (`moat`) dans buildings.js.

export const ZONES = {
  keep: { name: 'Cour du donjon', short: 'intra-muros', icon: '🏰' },
  faubourg: { name: 'Faubourgs', short: 'faubourgs', icon: '🏘️' },
  country: { name: 'Campagne', short: 'campagne', icon: '🌾' },
};
// Profondeur des faubourgs : cases au-delà de l'enceinte (2 : laisse la rive de la rivière à la campagne)
export const FAUBOURG_DEPTH = 2;

// Où l'on peut bâtir
export const KEEP_ONLY = ['castle', 'library', 'laboratory', 'forge', 'armory', 'quartermaster'];
export const COUNTRY_ONLY = ['farm', 'pasture', 'orchard', 'sawmill', 'quarry', 'mine', 'charcoal', 'hunter'];
export const OUTSIDE_ONLY = ['tannery', 'fishery', 'port', 'herbalist'];
export const ZONE_RULE_TEXT = {
  keep: 'Intra-muros seulement',
  country: 'Campagne seulement',
  outside: 'Hors les murs (faubourgs ou campagne)',
  any: 'Partout',
};

// Effets selon la zone (bonus de production ajouté comme l'adjacence ; ou modificateurs bornés)
export const ZONE_FX = {
  house: { keep: { prod: -0.1, text: 'ruelles étroites : −10 %' }, faubourg: { prod: 0.05, text: 'faubourg animé : +5 %' } },
  market: { keep: { prod: -0.1, text: 'loin des passants : −10 %' }, faubourg: { prod: 0.1, text: 'sur le passage : +10 %' } },
  tavern: { keep: { prod: -0.1, text: 'loin des passants : −10 %' }, faubourg: { prod: 0.1, text: 'sur le passage : +10 %' } },
  guildhall: { keep: { prod: -0.1, text: 'loin des passants : −10 %' }, faubourg: { prod: 0.1, text: 'sur le passage : +10 %' } },
  warehouse: { keep: { mods: { protect: 0.05 }, text: 'à l’abri des murs : +5 points de protection', cap: { protect: 0.1 } } },
  barracks: { keep: { mods: { 'train.speed': 0.05 }, text: 'cour d’armes : formation +5 %' } },
  stable: { keep: { mods: { 'train.speed': 0.05 }, text: 'cour d’armes : formation +5 %' } },
  watchtower: { faubourg: { mods: { 'raid.warning': 0.1 }, text: 'voit plus loin : préavis des raids +10 %' }, country: { mods: { 'raid.warning': 0.1 }, text: 'voit plus loin : préavis des raids +10 %' } },
};
export const ZONE_FX_CAP = { protect: 0.1, 'train.speed': 0.1, 'raid.warning': 0.2 };

// Enceinte : rectangle de cases (cour), muraille sur le bord ; taille de départ et maximum selon le domaine
export const ENCEINTE = {
  start: 5,                                   // 5 × 5 cases, centrées sur l'hôtel de ville
  maxW: (domain) => 7 + 2 * domain,           // domaine 0 : 7 × 7 ; domaine 4 : 15 × 11
  maxH: (domain) => 7 + domain,
  refPerimeter: 20,                           // périmètre neutre : l'enceinte de départ (5 × 5)
  perPerimeter: 0.0125,                       // facteur de muraille par segment d'écart
  factorMin: 0.8, factorMax: 1.1,
  segmentCost: { stone: 150, wood: 60, gold: 20 }, // par nouveau segment de muraille, × (1 + 0,15 × niveau)
  levelCost: 0.15,
  freeMoveDays: 7,                            // déménagement gratuit après la migration d'une ancienne partie
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
export const DECO_FX = {
  faubourg: { mod: 'worker.morale', per: 2, max: 4, near: ['house', 'market', 'tavern'], text: 'moral des ouvriers +2 (à côté de maisons, d’un marché ou d’une taverne)' },
  keep: { mod: 'combat.morale', per: 1, max: 3, text: 'moral de la garnison +1' },
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

// La ville devient le menu : bâtiment → écrans (vues de src/ui/views)
export const BUILDING_SCREENS = {
  townhall: ['goals', 'challenges', 'policy', 'council', 'projects'],
  castle: ['army', 'campaigns'],
  barracks: ['army', 'campaigns'],
  stable: ['army'],
  market: ['market', 'convoys', 'shop'],
  port: ['convoys'],
  tavern: ['heroes'],
  forge: ['craft'],
  armory: ['craft'],
  library: ['research', 'talents', 'legacy'],
  laboratory: ['research'],
  guildhall: ['guild'],
  warehouse: ['ecoReport', 'steward', 'workers', 'expeditions', 'chains'],
  watchtower: ['journal'],
  observatory: ['goals'],
  sanctuary: ['wheel', 'shards'],
  monument: ['legacy'],
};
// Terrains vagues : bâtiments « menu » montrés sur la carte tant qu'ils ne sont pas construits (ordre d'affichage)
export const LOT_TYPES = ['castle', 'barracks', 'market', 'tavern', 'library', 'forge', 'warehouse', 'watchtower', 'guildhall', 'laboratory', 'observatory', 'sanctuary'];
