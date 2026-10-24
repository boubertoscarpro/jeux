// v21 « Couleurs du Royaume » — Données des mécaniques : hospice et blessés (B1), reliques de bâtiment (B2), châtelain
// (B3), camps de brigands à niveaux et ligue (B4), garnisons alliées (B5), auras et usure des décorations (B6).
// Inspirées du genre, reliées à ce qui existe, sans monnaie nouvelle ni avantage payant. Logique : systems/realm21.js.

// B1 — Une part des pertes devient des blessés, recueillis par l'hospice (dans la limite de ses lits)
export const HOSPICE = {
  defShare: 0.3, attShare: 0.2, // part des pertes qui survit blessée (défense du château, combats en campagne)
  bedsBase: 40, bedsPerLevel: 25, // lits : 40 + 25 par niveau
  healH: 12, potionPer: 10, // 12 h de soins, une potion de soin pour 10 blessés
  earlyH: 6, vetShare: 0.35, vetCap: 0.1, vetAtk: 0.05, // soignés dans les 6 h : 35 % deviennent vétérans (≤ 10 % de l'effectif), +5 % d'attaque
  waitH: 24, // sans soins dans les 24 h, ils rentrent au village
  favorPer: 10, favorMax: 6, // −1 de faveur de l'Assemblée des villages par 10 blessés abandonnés (au plus −6)
};

// B2 — Reliques de bâtiment : effet borné sur leur bâtiment ; certaines rayonnent sur les cases voisines (même calcul
// que l'adjacence : 8 cases autour, moitié de l'effet, production seulement)
export const RELIC_SLOTS = [[5, 1], [15, 2], [25, 3]]; // [niveau du bâtiment, emplacements]
export const RELIC_MOVE_H = 6; // transport d'une relique déplacée (aucun coût)
export const RELIC_RADIATE = 0.5; // part de l'effet de production reçue par les voisins
export const RELIC_CAP = { prod: 0.15, radiate: 0.06 }; // plafonds par bâtiment
export const BUILDING_RELICS = {
  meule: { name: 'Meule des Anciens', icon: '🪨', fits: ['farm', 'mill', 'bakery', 'orchard', 'pasture'], prod: 0.06, radiate: true, desc: 'Production +6 % ; les voisins reçoivent +3 %.' },
  enclume: { name: 'Enclume de la Fracture', icon: '⚒️', fits: ['forge', 'armory', 'foundry', 'mine', 'charcoal'], prod: 0.06, radiate: true, desc: 'Production +6 % ; les voisins reçoivent +3 %.' },
  scie: { name: 'Lame du Premier Bûcheron', icon: '🪚', fits: ['sawmill', 'carpentry', 'quarry'], prod: 0.06, desc: 'Production +6 %.' },
  navette: { name: 'Navette d’argent', icon: '🧵', fits: ['weaver', 'tannery', 'hunter', 'herbalist'], prod: 0.05, radiate: true, desc: 'Production +5 % ; les voisins reçoivent +2,5 %.' },
  etendard: { name: 'Étendard des Premiers Rois', icon: '🚩', fits: ['barracks', 'stable', 'workshop'], mods: { 'train.speed': 0.08 }, desc: 'Formation −8 % de temps (vitesse +8 %).' },
  lanterne: { name: 'Lanterne du Veilleur', icon: '🏮', fits: ['watchtower'], mods: { 'raid.warning': 0.1 }, desc: 'Préavis des raids +10 %.' },
  sceau: { name: 'Sceau du Trésorier', icon: '🔏', fits: ['market', 'warehouse'], mods: { protect: 0.03 }, desc: 'Ressources protégées +3 points.' },
  grimoire: { name: 'Grimoire fêlé', icon: '📕', fits: ['library', 'laboratory', 'observatory'], mods: { 'research.speed': 0.05 }, desc: 'Recherche +5 %.' },
  source: { name: 'Fiole de la Source claire', icon: '💧', fits: ['hospice'], beds: 0.25, desc: 'Lits de l’hospice +25 %.' },
};
// Sources (déjà existantes) qui donnent une relique de bâtiment
export const RELIC_SOURCES = { archaeo: 'Fouilles : lieu retrouvé', breach: 'Butin d’une forteresse de la Brèche', fragments: '3 fragments de relique', league: 'Ligue des brigands brisée' };

// B3 — Châtelain : un héros commande la défense du château, à un poste
export const CASTELLAN = {
  posts: {
    wall: { name: 'Remparts', icon: '🧱', prot: 'wall', text: 'Remparts des flancs +12 %' },
    gate: { name: 'Porte', icon: '🚪', prot: 'gate', text: 'Porte +15 %' },
    moat: { name: 'Douves', icon: '🌊', prot: 'moat', text: 'Douves +15 % (contre les fascines et les tours)' },
  },
  postBonus: { wall: 0.12, gate: 0.15, moat: 0.15 },
  def: 0.03, perLevel: 0.002, defCap: 0.1, // défense de la garnison : +3 %, +0,2 % par niveau du héros (≤ +10 %)
  classDef: { general: 0.03, blacksmith: 0.02 }, // classes martiales : un peu plus
  learnAfter: 2, // un seigneur qui l'a vu 2 raids de suite au même poste attaque ailleurs
};

// B4 — Camps de brigands à niveaux, ligue des brigands, insécurité des routes
export const BRIGANDS = {
  maxLevel: 10, growH: 24, // un camp non nettoyé gagne un niveau par jour (jusqu'à 10)
  perLevel: 0.15, // ennemis et butin +15 % par niveau au-delà du premier
  anger: { perClear: 1, sameCampH: 48, sameCamp: 2, decayPerDay: 1, warn: 6, strike: 8 },
  insecurityLevel: 5, insecurityDays: 3, insecurityMax: 3, // camps de niv. 5+ ignorés 3 jours : danger des routes +1 chacun (≤ 3)
  leagueArmy: { bandit: 40, banditArcher: 20, banditRider: 8 }, perTh: 0.12, // riposte : armée de la ligue (×(1 + 0,12 × HdV))
};

// B5 — Garnison alliée proposée à l'annonce d'un raid (refusable), avec ses exigences
export const ALLY_GARRISON = {
  minRelation: 40, // relation minimale (les alliances complètes envoient déjà leurs renforts, v13)
  perRelation: 0.4, base: 12, // soldats : 12 + 0,4 × relation
  breadPerH: 15, // rations de pain par heure tant qu'elle est là
  honor: 5, betray: -12, // relation : honorée (nourrie, aucune sortie) / déçue
  stayH: 2, // elle repart 2 h après le raid
};

// B6 — Auras de placement des décorations (bornées) et usure saisonnière
export const DECO_AURA = {
  fountain: { keys: ['deco_fountain'], icons: ['⛲'], near: ['house'], order: 4, mods: { 'worker.morale': 1 }, text: 'près des maisons : ordre +4, moral des ouvriers +1' },
  statue: { keys: ['deco_statue', 'deco_colossus', 'deco_obelisk'], icons: ['🗽', '🗿', '🗼'], near: ['barracks', 'stable', 'lists'], mods: { 'train.speed': 0.03 }, text: 'près de la caserne, de l’écurie ou de la lice : formation +3 %' },
  garden: { keys: ['deco_garden'], icons: ['🌷', '🌸'], near: ['tavern', 'hospice'], mods: { 'combat.morale': 1 }, text: 'près de la taverne ou de l’hospice : moral de la garnison +1' },
  lantern: { keys: ['deco_lantern'], icons: ['🏮'], near: ['watchtower'], mods: { 'raid.warning': 0.05 }, text: 'près de la tour de guet : préavis des raids +5 %' },
  any: { keys: [], icons: [], near: ['townhall', 'castle'], order: 2, text: 'près de l’hôtel de ville : ordre +2' },
};
export const DECO_AURA_CAP = { 'train.speed': 0.09, 'raid.warning': 0.1, 'combat.morale': 3, 'worker.morale': 3, order: 12 };
// Usure : une « saison » du calendrier ne dure que 3 h ; l'usure compte donc 48 h sans entretien (effet ×0,75)
export const DECO_WEAR = { k: 0.75, h: 48, cost: { stone: 40, wood: 40 } };
