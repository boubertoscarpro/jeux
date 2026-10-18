// v14 — Le feu et l'eau sur la carte du royaume, et les frontières contestées des provinces.
// Module pur : le placement décide où un incendie se propage et ce qu'une crue abîme ; la proximité du territoire
// d'une faction décide si une province est « frontière contestée » ou « frontière amie ».
import { FIRE, FLOOD, BORDER } from '../data/crises.js';
import { RIVALS } from '../data/world.js';
import { rng } from '../core/rng.js';
import { allBuildings, neighbors } from './city.js';
import { moatBetween, moatBank, moatOverflowChance } from './castle.js';

export const flammability = (type) => (FIRE.none.includes(type) ? 0 : FIRE.stone.includes(type) ? 0.35 : 1);
const burnable = (b) => b && b.level > 0 && !b.damaged && flammability(b.type) > 0 && b.type !== 'townhall';
const nearRiver = (state, b) => neighbors(state, b.x, b.y).some((n) => n.terrain === 'river');

// Une caserne ou une tour de garde proche : la garde accourt et maîtrise le feu après la première vague
export function guardNear(state, x, y) {
  return allBuildings(state).some((o) => o.level > 0 && (o.type === 'barracks' || o.type === 'watchtower') && Math.max(Math.abs(o.x - x), Math.abs(o.y - y)) <= FIRE.guardRange);
}

// Chance qu'un bâtiment voisin d'un foyer s'embrase
export function igniteChance(state, b) {
  if (!burnable(b)) return 0;
  return FIRE.spread * flammability(b.type) * (nearRiver(state, b) ? 1 - FIRE.water : 1);
}

// Une vague de propagation à partir des bâtiments en feu ; renvoie les nouveaux bâtiments touchés
export function spreadWave(state, fire) {
  const out = [];
  const burning = fire.burnt.map((id) => state.city.buildings[id]).filter(Boolean);
  for (const b of burning) {
    for (const n of neighbors(state, b.x, b.y)) {
      if (fire.burnt.length + out.length >= FIRE.maxBurn) return out;
      const nb = n.building;
      if (!nb || out.includes(nb) || fire.burnt.includes(nb.id)) continue;
      if (moatBetween(state, b, nb)) continue; // v16 : le feu ne traverse pas les douves
      if (rng.chance(igniteChance(state, nb))) { nb.damaged = true; out.push(nb); }
    }
  }
  fire.burnt.push(...out.map((b) => b.id));
  return out;
}

// Choix du premier foyer : un bâtiment inflammable au hasard (pondéré par l'inflammabilité)
export function pickFireStart(state) {
  const cands = allBuildings(state).filter((b) => burnable(b) && !['castle'].includes(b.type));
  if (!cands.length) return null;
  return rng.weighted(Object.fromEntries(cands.map((b) => [b.id, flammability(b.type)])));
}

// Risque d'incendie d'un bâtiment, pour l'aperçu des risques : son inflammabilité × voisins qui peuvent le lui
// transmettre, réduit par l'eau et la garde. 0 à 1 → faible / moyen / élevé.
export function fireRisk(state, b) {
  if (!burnable(b)) return 0;
  const fuel = neighbors(state, b.x, b.y).filter((n) => n.building && burnable(n.building)).reduce((a, n) => a + flammability(n.building.type), 0);
  let r = flammability(b.type) * Math.min(1, fuel / 4);
  if (nearRiver(state, b)) r *= 1 - FIRE.water;
  if (guardNear(state, b.x, b.y)) r *= 0.5;
  return Math.round(r * 100) / 100;
}
export const riskBand = (r) => (r >= 0.5 ? 'high' : r >= 0.2 ? 'mid' : r > 0 ? 'low' : 'none');

// Zone inondable : bâtiments voisins de la rivière (hors routes et décor)
// v16 : si les douves débordent pendant la crue, les bâtiments qui bordent la muraille s'y ajoutent
export const floodZone = (state, overflow = false) => {
  const z = allBuildings(state).filter((b) => b.level > 0 && !['road', 'deco'].includes(b.type) && nearRiver(state, b));
  if (overflow) for (const b of moatBank(state)) if (!z.includes(b)) z.push(b);
  return z;
};
// Les douves, alimentées par la rivière, débordent-elles ? (moins souvent avec des douves larges, jamais au niveau 10)
export const moatOverflows = (state) => rng.chance(moatOverflowChance(state));

// Dégâts d'une crue : chance FLOOD.damage par bâtiment de la zone, réduite par une préparation (sacs de sable)
export function floodDamage(state, guard = 1, overflow = false) {
  let n = 0;
  for (const b of floodZone(state, overflow)) if (!b.damaged && rng.chance(FLOOD.damage * guard)) { b.damaged = true; n++; }
  return n;
}

// Frontière d'une province : la faction dont le territoire est à moins de BORDER.range cases, et sa disposition
export function borderOf(state, t) {
  let best = null;
  for (const f of state.factions || []) {
    for (const k of f.territory || []) {
      const i = k.indexOf(',');
      const d = Math.max(Math.abs(+k.slice(0, i) - t.x), Math.abs(+k.slice(i + 1) - t.y));
      if (d <= BORDER.range && (!best || d < best.d)) best = { f, d };
    }
  }
  if (!best) return null;
  const f = best.f;
  const name = RIVALS[f.idx]?.name || 'une faction';
  if (f.stance === 'war' || f.relation <= BORDER.hostileRelation) return { kind: 'contested', f, name, stab: BORDER.hostile, label: `Frontière contestée (${name})` };
  if (f.stance === 'alliance' || f.relation >= BORDER.friendlyRelation) return { kind: 'friendly', f, name, stab: BORDER.friendly, label: `Frontière amie (${name})` };
  return { kind: 'calm', f, name, stab: 0, label: `Frontière (${name})` };
}
