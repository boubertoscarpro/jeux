// v17 — Navigation au clavier sur la carte du royaume (module pur) : depuis une case, le bâtiment le plus proche dans
// la direction demandée (flèches). On privilégie l'axe de la flèche : coût = distance sur l'axe + 2 × écart latéral.
const DIRS = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };
export const navTargets = (state) => Object.values(state.city?.buildings || {}).filter((b) => b.type !== 'road');
export function nextBuilding(state, x, y, key, targets = navTargets(state)) {
  const d = DIRS[key];
  if (!d) return null;
  let best = null, bc = Infinity;
  for (const b of targets) {
    const dx = b.x - x, dy = b.y - y;
    const along = dx * d[0] + dy * d[1];
    if (along <= 0) continue;
    const side = Math.abs(dx * d[1]) + Math.abs(dy * d[0]);
    const c = along + 2 * side + (b.x + b.y * 1e3) * 1e-7;
    if (c < bc) { bc = c; best = { x: b.x, y: b.y, id: b.id }; }
  }
  return best;
}
// Toutes les cases d'intérêt sont-elles atteignables aux flèches depuis l'hôtel de ville ? (parcours en largeur)
export function reachable(state, from) {
  const targets = navTargets(state);
  const key = (p) => p.x + ',' + p.y;
  const seen = new Set([key(from)]);
  const queue = [from];
  while (queue.length) {
    const p = queue.shift();
    for (const k of Object.keys(DIRS)) { const n = nextBuilding(state, p.x, p.y, k, targets); if (n && !seen.has(key(n))) { seen.add(key(n)); queue.push(n); } }
  }
  return seen;
}
