import { BUILDINGS, levelProdFactor } from '../data/buildings.js';
import { RESOURCES, isCapped } from '../data/resources.js';
import { UNITS } from '../data/units.js';
import { allBuildings, adjacencyBonus } from './city.js';
import { prodMult } from './modifiers.js';
import { WORK_SECTORS } from '../data/workers.js';

// Ordre de traitement des chaînes (les entrées d'une étape sont produites par les précédentes)
const CONVERT_ORDER = ['mill', 'charcoal', 'carpentry', 'bakery', 'foundry', 'tannery', 'weaver', 'quartermaster', 'armory'];

const SECTOR_OF = {};
for (const [k, sec] of Object.entries(WORK_SECTORS)) for (const b of sec.buildings) SECTOR_OF[b] = k;
export const sectorOfBuilding = (type) => SECTOR_OF[type] || null;

export function storageCap(state, mods) {
  return Math.floor((1500 + (mods.storage || 0)) * (1 + (mods['storage.pct'] || 0)));
}

export function protectedAmount(state, mods) {
  const pct = Math.min(0.8, 0.1 + (mods.protect || 0));
  return Math.floor(storageCap(state, mods) * pct);
}

// Recette active d'un bâtiment de transformation
export function recipeOf(b) {
  const def = BUILDINGS[b.type];
  if (def?.recipes) return def.recipes[b.recipe || 0] || def.recipes[0];
  return def?.convert || null;
}

// Réseau de routes : bâtiments voisins d'une route reliée à l'hôtel de ville
const roadCache = new WeakMap();
export function roadConnected(state) {
  const bs = allBuildings(state);
  const sig = bs.reduce((a, b) => a + (b.x * 31 + b.y + 7) * (b.type.length + b.level), bs.length);
  const c = roadCache.get(state);
  if (c && c.sig === sig) return c.set;
  const at = new Map(bs.map((b) => [b.x + ',' + b.y, b]));
  const th = bs.find((b) => b.type === 'townhall');
  const set = new Set();
  if (th) {
    const seen = new Set(), queue = [];
    const nb4 = (x, y) => [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]];
    for (const [x, y] of nb4(th.x, th.y)) { const r = at.get(x + ',' + y); if (r?.type === 'road' && r.level > 0) { queue.push(r); seen.add(r.id); } }
    while (queue.length) {
      const r = queue.shift();
      for (const [x, y] of nb4(r.x, r.y)) {
        const o = at.get(x + ',' + y);
        if (!o) continue;
        if (o.type === 'road' && o.level > 0 && !seen.has(o.id)) { seen.add(o.id); queue.push(o); }
        else if (o.type !== 'road') set.add(o.id);
      }
    }
  }
  roadCache.set(state, { sig, set });
  return set;
}

// Multiplicateur global d'un bâtiment (adjacence, ouvriers, route, dégâts)
function buildingBonus(state, b, mods, adj) {
  const sector = SECTOR_OF[b.type];
  let bonus = adj.total + (sector ? mods['work.' + sector] || 0 : 0);
  if (roadConnected(state).has(b.id)) bonus += 0.05 + (mods['road.bonus'] || 0);
  return bonus;
}

// Production horaire d'un bâtiment → { out: {res: /h}, in: {res: /h}, adj }
export function buildingRates(state, b, mods) {
  const def = BUILDINGS[b.type];
  const res = { out: {}, in: {}, adj: { total: 0, details: [] }, bonus: 0 };
  if (!def || b.level <= 0) return res;
  const adj = adjacencyBonus(state, b.type, b.x, b.y, mods);
  res.adj = adj;
  const bonus = buildingBonus(state, b, mods, adj);
  res.bonus = bonus;
  res.road = roadConnected(state).has(b.id);
  const dmg = b.damaged ? 0.5 : 1;
  const lf = levelProdFactor(b.level) * dmg;
  for (const [r, v] of Object.entries(def.prod || {})) res.out[r] = v * lf * Math.max(0.1, prodMult(mods, r) + bonus);
  const rec = recipeOf(b);
  if (rec) {
    const waste = 1 - (mods['chain.efficiency'] || 0);
    for (const [r, v] of Object.entries(rec.in)) res.in[r] = v * lf * Math.max(0.5, waste);
    for (const [r, v] of Object.entries(rec.out)) res.out[r] = (res.out[r] || 0) + v * lf * Math.max(0.1, prodMult(mods, r) + bonus);
  }
  return res;
}

export function armyTotals(state) {
  const tot = { ...state.army };
  for (const m of state.marches) for (const [u, n] of Object.entries(m.units || {})) tot[u] = (tot[u] || 0) + n;
  for (const e of state.expeditions || []) for (const [u, n] of Object.entries(e.escort || {})) tot[u] = (tot[u] || 0) + n;
  return tot;
}

export function armyUpkeep(state, mods) {
  let u = 0;
  for (const [type, n] of Object.entries(armyTotals(state))) u += (UNITS[type]?.upkeep || 0) * n;
  return u * Math.max(0.3, 1 + (mods.upkeep || 0));
}
export function workerUpkeep(state, mods) {
  let u = 0;
  for (const w of state.workers || []) u += w.traits?.includes('frugal') ? 0.6 : 1.2;
  return u * Math.max(0.3, 1 + (mods.upkeep || 0) * 0.5);
}
export function upkeepPerHour(state, mods) {
  return armyUpkeep(state, mods) + workerUpkeep(state, mods);
}

// Bilan théorique par heure (production - consommation à pleine capacité)
export function netRates(state, mods) {
  const net = {};
  for (const b of allBuildings(state)) {
    if (b.paused) continue;
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
  const spent = (state.stats.spent ||= {});
  const buildings = allBuildings(state).filter((b) => b.level > 0);

  // 1) Production simple
  for (const b of buildings) {
    if (recipeOf(b)) continue;
    const r = buildingRates(state, b, mods);
    for (const [k, v] of Object.entries(r.out)) {
      const got = addResource(state, k, v * h, mods, cap);
      produced[k] = (produced[k] || 0) + got;
    }
  }
  // 2) Chaînes de transformation (quota de sortie, réserve d'entrée)
  for (const type of CONVERT_ORDER) {
    for (const b of buildings.filter((x) => x.type === type)) {
      if (b.paused) { b.starved = false; continue; }
      const r = buildingRates(state, b, mods);
      let frac = 1;
      for (const [k, v] of Object.entries(r.in)) {
        const need = v * h;
        const avail = Math.max(0, (state.resources[k] || 0) - (b.reserve || 0));
        if (need > 0) frac = Math.min(frac, avail / need);
      }
      b.capped = false;
      for (const k of Object.keys(r.out)) {
        if ((isCapped(k) && state.resources[k] >= cap) || (b.quota && state.resources[k] >= b.quota)) { frac = 0; b.capped = true; }
      }
      if (frac <= 0) { b.starved = !b.capped && Object.keys(r.in).length > 0; continue; }
      b.starved = frac < 0.99;
      for (const [k, v] of Object.entries(r.in)) {
        const use = Math.min(state.resources[k], v * h * frac);
        state.resources[k] -= use;
        spent[k] = (spent[k] || 0) + use;
      }
      for (const [k, v] of Object.entries(r.out)) {
        const got = addResource(state, k, v * h * frac, mods, cap);
        produced[k] = (produced[k] || 0) + got;
      }
    }
  }
  // 3) Entretien de l'armée et des ouvriers
  const upkeep = upkeepPerHour(state, mods) * h;
  spent.food = (spent.food || 0) + Math.min(upkeep, state.resources.food);
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
  const spent = (state.stats.spent ||= {});
  for (const [r, v] of Object.entries(cost || {})) { state.resources[r] -= v; spent[r] = (spent[r] || 0) + v; }
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
