// Joueur simulé — systèmes v14 (présages, crises, réserves royales). Comportement raisonnable, non omniscient :
// il ne connaît pas la vérité d'un présage, il se prépare quand la fiabilité est forte (ou après l'avoir recoupé),
// il intervient dans une crise avec l'option la moins chère qu'il peut payer, en préférant la réserve.
import { RESERVE } from '../src/data/crises.js';
import { crisesState, crisisThread, intervene } from '../src/systems/crises.js';
import { omensState, verifyOmen, prepareFor, prepCost, verifyCost } from '../src/systems/omens.js';
import { reserveState, setReserveRule, depositReserve, reserveRoom } from '../src/systems/reserve.js';
import { storageCap } from '../src/systems/economy.js';

const affordable = (s, cost, k = 1.5) => Object.entries(cost).every(([r, v]) => (s.resources[r] || 0) >= v * k);
const costSize = (c) => Object.values(c.stock).reduce((a, b) => a + b, 0);
// Consignes de réserve par profil : l'occasionnel et l'économe gardent leur débordement, les autres le vendent
const OVERFLOW = { casual: true, economy: true, diplomat: true };

export function v14Bot(s, profileKey, t, mods) {
  const R = reserveState(s);
  if (!R.botInit) { R.botInit = true; if (OVERFLOW[profileKey]) setReserveRule(s, 'overflow', true); }
  // Versements : quand l'entrepôt est presque plein, un quart du stock part en réserve (profils prévoyants)
  if (profileKey !== 'casual' && profileKey !== 'military') {
    for (const r of RESERVE.res) if ((s.resources[r] || 0) >= storageCap(s, mods, r) * 0.95 && reserveRoom(s, r, mods) > 0) depositReserve(s, r, null, t);
  }
  // Crises : intervention la moins coûteuse possible (réserve d'abord)
  for (const c of [...crisesState(s).active]) {
    const th = crisisThread(s, c);
    const ok = th.interventions.filter((iv) => iv.status.ok && (iv.reservePerTh || affordable(s, iv.cost.stock)));
    if (!ok.length) continue;
    const pick = ok.find((iv) => iv.reservePerTh) || ok.sort((a, b) => costSize(a.cost) - costSize(b.cost))[0];
    // L'occasionnel ne paie pas de sa poche : seul le régent agit pour lui (réserve)
    if (profileKey === 'casual' && !pick.reservePerTh) continue;
    intervene(s, c.id, pick.id, t);
  }
  // Présages : recouper si douteux (profils attentifs), se préparer si fort ou confirmé
  if (profileKey === 'casual') return;
  for (const o of omensState(s).list) {
    if (o.resolved || o.kind !== 'catastrophe') continue;
    if (o.checked == null && !o.checkAt && o.q < 0.75 && (profileKey === 'optimized' || profileKey === 'explorer')) {
      if ((s.army.scout || 0) > 2) verifyOmen(s, o.id, 'scout', t);
      else if (affordable(s, verifyCost(s), 3)) verifyOmen(s, o.id, 'gold', t);
    }
    const c = prepCost(s, o.key);
    if (c && !o.prepared && (o.checked === true || (o.checked == null && o.q >= 0.7)) && affordable(s, c)) prepareFor(s, o.id, t);
  }
}
