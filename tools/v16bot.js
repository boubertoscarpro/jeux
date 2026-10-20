// Joueur simulé v16, revu en v20 « Ma forteresse » : agrandit la ville fortifiée d'un palier quand elle n'a presque
// plus de place et que l'hôtel de ville le permet (réserve gardée), et récolte les bonus prêts (v20). Il ne touche ni
// aux flancs (répartition neutre par défaut) ni aux engins : la comparaison avant / après reste lisible.
import { keepFree, enlargePreview, enlargeEnceinte } from '../src/systems/castle.js';
import { pay, canAfford } from '../src/systems/economy.js';
import { readyHarvests, collectHarvest } from '../src/systems/harvest.js';
import { computeMods } from '../src/systems/modifiers.js';

export function v16Bot(s, profileKey, t) {
  globalThis.__simState = s; // outils de diagnostic (aucun effet sur la partie)
  // v20 : récolte des bonus (un clic, toutes les bulles prêtes) — le joueur occasionnel aussi, quand il passe
  if (readyHarvests(s).length) collectHarvest(s, null, computeMods(s, t));
  if (profileKey === 'casual') return;
  if (keepFree(s) >= 3) return;
  const p = enlargePreview(s);
  if (!p.ok || !canAfford(s, p.cost)) return;
  // Réserve : on ne vide pas les stocks pour la muraille
  if (Object.entries(p.cost).some(([k, v]) => v > 0.4 * (s.resources[k] || 0))) return;
  enlargeEnceinte(s, null, (c) => pay(s, c), t);
}
