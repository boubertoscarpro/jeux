import { BUILDINGS, levelProdFactor } from '../data/buildings.js';
import { RESOURCES, isCapped } from '../data/resources.js';
import { UNITS } from '../data/units.js';
import { allBuildings, adjacencyBonus } from './city.js';
import { prodMult } from './modifiers.js';

// Ordre de traitement des chaînes (les entrées d'une étape sont produites par les précédentes)
const CONVERT_ORDER = ['mill', 'charcoal', 'bakery', 'foundry', 'tannery', 'weaver'];

export function storageCap(state, mods) {
  return Math.floor((1500 + (mods.storage || 0)) * (1 + (mods['storage.pct'] || 0)));
}

export function protectedAmount(state, mods) {
  const pct = Math.min(0.8, 0.1 + (mods.protect || 0));
  return Math.floor(storageCap(state, mods) * pct);
}

// Production horaire d'un bâtiment → { out: {res: /h}, in: {res: /h}, adj }
export function buildingRates(state, b, mods) {
  const def = BUILDINGS[b.type];
  const res = { out: {}, in: {}, adj: { total: 0, details: [] } };
  if (!def || b.level <= 0) return res;
  const adj = adjacencyBonus(state, b.type, b.x, b.y, mods);
  res.adj = adj;
  const lf = levelProdFactor(b.level);
  for (const [r, v] of Object.entries(def.prod || {})) res.out[r] = v * lf * (prodMult(mods, r) + adj.total);
  if (def.convert) {
    for (const [r, v] of Object.entries(def.convert.in)) res.in[r] = v * lf;
    for (const [r, v] of Object.entries(def.convert.out)) res.out[r] = (res.out[r] || 0) + v * lf * (prodMult(mods, r) + adj.total);
  }
  return res;
}

export function armyTotals(state) {
  const tot = { ...state.army };
  for (const m of state.marches) for (const [u, n] of Object.entries(m.units || {})) tot[u] = (tot[u] || 0) + n;
  return tot;
}

export function upkeepPerHour(state, mods) {
  let u = 0;
  for (const [type, n] of Object.entries(armyTotals(state))) u += (UNITS[type]?.upkeep || 0) * n;
  return u * Math.max(0.3, 1 + (mods.upkeep || 0));
}

// Bilan théorique par heure (production - consommation à pleine capacité)
export function netRates(state, mods) {
  const net = {};
  for (const b of allBuildings(state)) {
    const r = buildingRates(state, b, mods);
    for (const [k, v] of Object.entries(r.out)) net[k] = (net[k] || 0) + v;
    for (const [k, v] of Object.entries(r.in)) net[k] = (net[k] || 0) - v;
  }
  net.food = (net.food || 0) - upkeepPerHour(state, mods);
  return net;
}

export function addResource(state, res, amount, mods, cap = null) {
  if (!RESOURCES[res] || !amount) return 0;
  const before = state.resources[res] || 0;
  let after = before + amount;
  if (amount > 0 && isCapped(res)) {
    const c = cap ?? storageCap(state, mods);
    if (before >= c) after = before; // ne détruit pas un excédent existant (récompenses)
    else after = Math.min(after, c);
  }
  state.resources[res] = Math.max(0, after);
  return state.resources[res] - before;
}

// Avance l'économie de dt secondes
export function advanceEconomy(state, dt, mods) {
  if (dt <= 0) return;
  const h = dt / 3600;
  const cap = storageCap(state, mods);
  const produced = state.stats.produced;
  const buildings = allBuildings(state).filter((b) => b.level > 0);

  // 1) Production simple
  for (const b of buildings) {
    if (BUILDINGS[b.type]?.convert) continue;
    const r = buildingRates(state, b, mods);
    for (const [k, v] of Object.entries(r.out)) {
      const got = addResource(state, k, v * h, mods, cap);
      produced[k] = (produced[k] || 0) + got;
    }
  }
  // 2) Chaînes de transformation
  for (const type of CONVERT_ORDER) {
    for (const b of buildings.filter((x) => x.type === type)) {
      if (b.paused) continue;
      const r = buildingRates(state, b, mods);
      let frac = 1;
      for (const [k, v] of Object.entries(r.in)) {
        const need = v * h;
        if (need > 0) frac = Math.min(frac, (state.resources[k] || 0) / need);
      }
      // Ne pas transformer si la sortie est déjà pleine
      for (const k of Object.keys(r.out)) if (isCapped(k) && state.resources[k] >= cap) frac = 0;
      if (frac <= 0) { b.starved = Object.keys(r.in).length > 0; continue; }
      b.starved = frac < 0.99;
      for (const [k, v] of Object.entries(r.in)) state.resources[k] = Math.max(0, state.resources[k] - v * h * frac);
      for (const [k, v] of Object.entries(r.out)) {
        const got = addResource(state, k, v * h * frac, mods, cap);
        produced[k] = (produced[k] || 0) + got;
      }
    }
  }
  // 3) Entretien de l'armée
  const upkeep = upkeepPerHour(state, mods) * h;
  if (state.resources.food >= upkeep) {
    state.resources.food -= upkeep;
    state.famine = false;
  } else {
    state.resources.food = 0;
    state.famine = upkeep > 0;
  }
}

export function canAfford(state, cost) {
  return Object.entries(cost || {}).every(([r, v]) => (state.resources[r] || 0) >= v - 1e-6);
}
export function missing(state, cost) {
  const out = {};
  for (const [r, v] of Object.entries(cost || {})) {
    const have = state.resources[r] || 0;
    if (have < v) out[r] = Math.ceil(v - have);
  }
  return out;
}
export function pay(state, cost) {
  if (!canAfford(state, cost)) return false;
  for (const [r, v] of Object.entries(cost || {})) state.resources[r] -= v;
  return true;
}
export function gain(state, rewards, mods) {
  const got = {};
  for (const [r, v] of Object.entries(rewards || {})) {
    if (!RESOURCES[r]) continue;
    if (v < 0) { state.resources[r] = Math.max(0, (state.resources[r] || 0) + v); got[r] = v; continue; }
    // Les récompenses peuvent dépasser la capacité de 50%
    got[r] = addResource(state, r, v, mods, storageCap(state, mods) * 1.5);
  }
  return got;
}
