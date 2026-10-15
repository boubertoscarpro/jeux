// Passe-temps : objets consommables qui retirent du temps à UN chantier (construction, amélioration, déblaiement).
// Ils sont rangés dans l'inventaire de consommables existant (state.inventory.consumables) : aucune monnaie nouvelle.
// Les gemmes (ressource rare déjà présente, jamais achetables au marché) offrent la même accélération, à prix dégressif.
//
// Durées retenues d'après les temps de construction réels (TIME_GROWTH 1,5) :
//  - niv. 1 à 6 : quelques secondes à quelques minutes → le sablier de 5 min suffit souvent ;
//  - niv. 8 à 12 : 10 min à 2 h → sabliers de 15 min et sceaux d'une heure ;
//  - niv. 13 et plus, hôtel de ville, monument : plusieurs heures → le parchemin de 8 h, rare.
export const SPEEDUPS = {
  speed5:   { name: 'Sablier de l’apprenti',        short: '5 min', min: 5,   rarity: 'common',    desc: 'Retire 5 minutes à un chantier.' },
  speed15:  { name: 'Sablier du maçon',             short: '15 min', min: 15, rarity: 'rare',      desc: 'Retire 15 minutes à un chantier.' },
  speed60:  { name: 'Sceau du maître d’œuvre',       short: '1 h', min: 60,    rarity: 'epic',      desc: 'Retire 1 heure à un chantier.' },
  speed480: { name: 'Parchemin de l’architecte royal', short: '8 h', min: 480, rarity: 'legendary', desc: 'Retire 8 heures à un chantier. Très rare.' },
};
export const SPEEDUP_ORDER = ['speed5', 'speed15', 'speed60', 'speed480'];
export const isSpeedup = (k) => !!SPEEDUPS[k];

// En dessous de ce temps restant, un passe-temps est refusé (il serait gaspillé : le chantier finit tout seul)
export const SPEEDUP_MIN_LEFT_S = 15;

// Prix en gemmes : 1 gemme par tranche de 15 min pour la première heure retirée, puis 1 gemme par tranche de
// 30 min. Plus on accélère d'un coup, moins l'heure coûte cher (4 gemmes la première heure, 2 les suivantes).
export const GEM_FIRST_HOUR_STEP = 15, GEM_LATER_STEP = 30;
export function gemCostForMinutes(minutes) {
  const m = Math.max(0, minutes);
  if (m <= 0) return 0;
  return Math.max(1, Math.ceil(Math.min(60, m) / GEM_FIRST_HOUR_STEP) + Math.ceil(Math.max(0, m - 60) / GEM_LATER_STEP));
}

// Récompenses de combat. « Mérite » d'un combat = puissance ennemie / puissance envoyée : une cible écrasée d'avance
// (mérite < MIN_MERIT) ne donne rien. Plafond quotidien commun à tous les combats (le reste du jeu ne doit pas
// devenir inutile) ; les boss et les forteresses de la Brèche ont leur propre table, mais comptent dans ce plafond.
export const COMBAT_SPEEDUPS = {
  minMerit: 0.3,
  dailyCap: 8,
  // Sites dangereux classiques, selon leur danger (1 à 6) : [chance, objet]
  byDanger: { 1: [0.2, 'speed5'], 2: [0.3, 'speed5'], 3: [0.35, 'speed15'], 4: [0.4, 'speed15'], 5: [0.45, 'speed60'], 6: [0.6, 'speed60'] },
  rivalCapital: [0.6, 'speed15'],
  dungeonCleared: [1, 'speed60'],
  bossKill: { speed60: 2, rare: [0.25, 'speed480'] },
};
