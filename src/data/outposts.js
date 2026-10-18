// v16 « Le Château » — Les avant-postes deviennent de petits châteaux : une ville à eux, une enceinte, des bâtiments
// qui ne servent que cet avant-poste, une vocation qui se dessine selon ce qu'on y bâtit.
// Tous les effets sont bornés (voir OUTPOST_LIMITS) : un avant-poste aide, il ne remplace jamais le château.

// Taille de la ville : 6 × 5 au départ, trois agrandissements (niveaux 2, 3 et 4 de l'avant-poste)
export const TOWN_SIZES = [[6, 5], [7, 6], [8, 7], [9, 8]];
export const TOWN_EXPAND_LEVEL = [2, 3, 4];
export const townExpandCost = (e) => ({ wood: Math.round(1800 * 2.2 ** e), stone: Math.round(1600 * 2.2 ** e), gold: Math.round(1200 * 2.3 ** e) });

// Bâtiments (niveau au plus égal à celui de l'avant-poste)
// fx : effet PAR NIVEAU sur l'avant-poste ; cat : vocation à laquelle le bâtiment contribue
export const OUTPOST_BUILDINGS = {
  fields: { name: 'Champs', icon: '🌾', cat: 'agricole', desc: 'Nourriture et grain produits ici +8 % par niveau.', fx: { prodRes: ['food', 'grain'], prod: 0.08 }, cost: { wood: 260, gold: 120 } },
  granary: { name: 'Grenier', icon: '🛖', cat: 'agricole', desc: 'Nourrit la garnison sur place : entretien en nourriture −8 % par niveau (au plus −40 %).', fx: { upkeepFood: 0.08 }, cost: { wood: 300, stone: 120 } },
  workshop: { name: 'Atelier', icon: '🪚', cat: 'industriel', desc: 'Scierie, taille de pierre et fonderie : bois, pierre, fer, charbon et minerai produits ici +8 % par niveau.', fx: { prodRes: ['wood', 'stone', 'iron', 'coal', 'rareOre', 'ancientWood'], prod: 0.08 }, cost: { wood: 280, stone: 200 } },
  depot: { name: 'Dépôt', icon: '📦', cat: 'industriel', desc: 'Entrepôt de l’avant-poste : toute sa production +4 % par niveau.', fx: { prodAll: 0.04 }, cost: { wood: 320, stone: 260 } },
  camp: { name: 'Camp d’entraînement', icon: '🎯', cat: 'militaire', desc: 'Chaque soldat de la garnison vaut 1 + 0,1 par niveau ; défense contre les menaces +8 % par niveau.', fx: { garrison: 0.1, def: 0.08 }, cost: { wood: 300, stone: 160, iron: 80 } },
  tower: { name: 'Tour de guet', icon: '🗼', cat: 'militaire', desc: 'Signaux vers le château : défense de la ville +0,4 % par niveau (au plus +4 % pour tous les avant-postes).', fx: { cityDef: 0.004 }, cost: { wood: 200, stone: 320 } },
  counter: { name: 'Comptoir', icon: '⚖️', cat: 'commercial', desc: 'Marchands de passage : or +6 par heure et gains des caravanes +0,3 % par niveau.', fx: { gold: 6, caravan: 0.003 }, cost: { wood: 260, gold: 220 } },
  chapel: { name: 'Chapelle', icon: '⛪', cat: 'savoir', desc: 'Le prêtre apaise la province : stabilité cible +3 par niveau.', fx: { stab: 3 }, cost: { stone: 300, gold: 160 } },
};
export const obCost = (type, lvl) => Object.fromEntries(Object.entries(OUTPOST_BUILDINGS[type].cost).map(([r, v]) => [r, Math.round(v * 1.75 ** (lvl - 1))]));
export const obTime = (lvl) => Math.round(8 * 60 * 1.8 ** (lvl - 1)); // secondes : 8 min, 14 min, 26 min, 47 min, 1 h 25

// Muraille (0 à 2 × niveau, au plus 10) et douves (0 à niveau, au plus 5) de l'avant-poste
export const TOWN_FORT = {
  wall: { name: 'Muraille', icon: '🧱', max: 10, maxPerLevel: 2, cost: (l) => ({ wood: Math.round(220 * 1.5 ** (l - 1)), stone: Math.round(320 * 1.55 ** (l - 1)) }) },
  moat: { name: 'Douves', icon: '🌊', max: 5, maxPerLevel: 1, cost: (l) => ({ stone: Math.round(260 * 1.7 ** (l - 1)), gold: Math.round(200 * 1.7 ** (l - 1)) }) },
};
// Chance qu'une menace frappe : ×(1 − 0,05 × muraille − 0,04 × douves), jamais moins de ×0,4
export const FORT_THREAT = { wall: 0.05, moat: 0.04, floor: 0.4 };

// Vocations : la catégorie qui cumule le plus de niveaux (au moins 3) ; ses bâtiments gagnent +25 %.
// Chaque vocation donne en plus un rôle propre à l'avant-poste dans le royaume.
export const VOCATIONS = {
  agricole: { name: 'Avant-poste agricole', icon: '🌾', color: '#9bbf5a', role: 'Grenier de la région : la garnison est nourrie sur place, la famine n’y fait pas fuir les colons (stabilité +5 en temps de famine).' },
  industriel: { name: 'Avant-poste industriel', icon: '⚒️', color: '#b08a5a', role: 'Scieries, carrières, mines et entrepôts. Il approvisionne les chantiers du château : vitesse de construction +1 % (au plus +3 % pour tous les avant-postes industriels).' },
  militaire: { name: 'Avant-poste militaire', icon: '🛡️', color: '#c0584a', role: 'Il couvre ses voisins : les menaces sur les autres avant-postes à 4 cases ou moins frappent 20 % moins souvent.' },
  commercial: { name: 'Avant-poste commercial', icon: '⚖️', color: '#d9b44a', role: 'Relais des caravanes : l’entretien en or de l’avant-poste est réduit de moitié.' },
  savoir: { name: 'Avant-poste du savoir', icon: '📜', color: '#8a7ad0', role: 'Il apaise la région : stabilité cible +5 pour les avant-postes à 4 cases ou moins (lui compris).' },
};
export const VOCATION_MIN = 3;
export const VOCATION_BONUS = 0.25;
export const OUTPOST_LIMITS = { prod: 0.5, upkeepFood: 0.4, cityDef: 0.04, buildSpeed: 0.03, neighbor: 4, coverThreat: 0.2, calmStab: 5 };
