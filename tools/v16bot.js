// Joueur simulé v16 : agrandit l'enceinte quand la cour du donjon n'a presque plus de place pour les bâtiments
// « intra-muros seulement » (donjon, bibliothèque, laboratoire, forge, armurerie, intendance). Il ne touche ni aux
// flancs (répartition neutre par défaut) ni aux outils de défense : la comparaison avant / après reste lisible.
import { rectOf, zoneAt, enlargePreview, enlargeEnceinte } from '../src/systems/castle.js';
import { pay, canAfford } from '../src/systems/economy.js';

export function v16Bot(s, profileKey, t) {
  if (profileKey === 'casual') return;
  const r = rectOf(s);
  const taken = new Set(Object.values(s.city.buildings).map((b) => b.x + ',' + b.y));
  let free = 0;
  for (let y = r.y0; y <= r.y1; y++) for (let x = r.x0; x <= r.x1; x++) if (!taken.has(x + ',' + y) && s.city.terrain[y * s.city.w + x] === 'plain' && zoneAt(s, x, y, r) === 'keep') free++;
  if (free >= 3) return;
  for (const side of ['s', 'e', 'n', 'w']) {
    const p = enlargePreview(s, side);
    if (!p.ok || p.trapped.length || !canAfford(s, p.cost)) continue;
    // Réserve : on ne vide pas les stocks pour la muraille
    if (Object.entries(p.cost).some(([k, v]) => v > 0.4 * (s.resources[k] || 0))) continue;
    enlargeEnceinte(s, side, (c) => pay(s, c), t);
    return;
  }
}
