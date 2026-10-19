// v17 « Clair comme le jour » — Un seul signal par bâtiment sur la carte du royaume (module pur).
// Priorité : danger (feu, eau, raid) > récompense à réclamer > problème (manque, pause, dégâts, entrepôt plein)
// > amélioration payable maintenant > activité au repos (bibliothèque, caserne, forge, taverne, marchand).
// Les flèches d'amélioration n'apparaissent que si l'amélioration est payable tout de suite, et jamais quand le joueur
// les a masquées. Aucune donnée n'est modifiée : la carte lit seulement ce résultat.
export const SIGNAL_RANK = { danger: 4, reward: 3, problem: 2, upgrade: 1, idle: 0 };
export const SIGNAL_NAME = { danger: 'Danger', reward: 'Récompense', problem: 'Problème', upgrade: 'Amélioration possible', idle: 'Au repos' };

// bubbles : liste de systems/bubbles.js ; upgrades : Map(bid → { status }) de upgradeSummary ; scene : burning, floodIds
// Flèches d'amélioration : au plus UPGRADE_MAX sur la carte (les plus en retard sur l'hôtel de ville d'abord) ; les autres
// restent dans la liste des améliorations (compteur ⬆ du panneau Construire)
export const UPGRADE_MAX = 6;
export function buildingSignals(state, { bubbles = [], upgrades = new Map(), burning = new Set(), flooded = new Set(), showUpgrades = true } = {}) {
  const out = new Map();
  const put = (bid, sig) => { const cur = out.get(bid); if (!cur || SIGNAL_RANK[sig.kind] > SIGNAL_RANK[cur.kind]) out.set(bid, sig); };
  for (const b of Object.values(state.city?.buildings || {})) {
    if (b.type === 'road' || b.type === 'deco') continue;
    if (burning.has(b.id)) put(b.id, { kind: 'danger', icon: '🔥', text: 'En feu : il faut l’éteindre' });
    else if (flooded.has(b.id)) put(b.id, { kind: 'danger', icon: '🌊', text: 'Sous l’eau : production arrêtée' });
    if (b.damaged) put(b.id, { kind: 'problem', icon: '🛠️', text: 'Endommagé : production −50 %, à réparer' });
    else if (b.starved) put(b.id, { kind: 'problem', icon: '!', text: 'Manque de matières premières' });
    else if (b.paused) put(b.id, { kind: 'problem', icon: '⏸', text: 'Chaîne en pause' });
  }
  if (showUpgrades) {
    const ready = Object.values(state.city?.buildings || {}).filter((b) => upgrades.get(b.id)?.status === 'ready' && !out.has(b.id))
      .sort((a, b) => a.level - b.level || (a.type < b.type ? -1 : 1)).slice(0, UPGRADE_MAX);
    for (const b of ready) put(b.id, { kind: 'upgrade', icon: '⬆', text: 'Amélioration payable maintenant', action: 'tile-up' });
  }
  for (const bu of bubbles) {
    const kind = bu.id === 'raid' ? 'danger' : bu.id === 'claim' ? 'reward' : bu.id === 'full' ? 'problem' : 'idle';
    put(bu.bid, { kind, icon: bu.icon, text: bu.text, view: bu.view, mark: bu.mark });
  }
  return out;
}

// Paliers de taille du bâtiment selon son niveau (le niveau se lit sur le dessin) : 1–2, 3–5, 6–9, 10–14, 15–19, 20 et plus
export const SIZE_TIERS = [1, 3, 6, 10, 15, 20];
export const sizeTier = (level) => { let t = 0; for (let i = 0; i < SIZE_TIERS.length; i++) if (level >= SIZE_TIERS[i]) t = i; return t; };
// Variante déterministe d'une case (deux fermes voisines ne se ressemblent pas : orientation, teinte des toits)
export const variantOf = (x, y) => { let h = (x * 374761393 + y * 668265263) >>> 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) % 4; };
// Quartiers : bâtiments de production identiques et voisins (côtés partagés : n, e, s, o)
export const QUARTER_TYPES = new Set(['farm', 'pasture', 'orchard', 'sawmill', 'quarry', 'mine', 'charcoal', 'hunter', 'fishery', 'herbalist', 'house', 'mill', 'bakery', 'tannery', 'weaver', 'carpentry', 'foundry']);
export function quarterSides(at, b) {
  if (!QUARTER_TYPES.has(b.type)) return '';
  const same = (dx, dy) => at.get((b.x + dx) + ',' + (b.y + dy))?.type === b.type;
  return `${same(0, -1) ? 'n' : ''}${same(1, 0) ? 'e' : ''}${same(0, 1) ? 's' : ''}${same(-1, 0) ? 'w' : ''}`;
}
