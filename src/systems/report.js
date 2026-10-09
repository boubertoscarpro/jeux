// Bilan économique : production et consommation par heure, pénuries, chaînes bloquées, entretien et pertes.
// Module pur (sans DOM), calculé à partir des mêmes formules que la simulation (economy.js).
import { RESOURCES, RES_ORDER, isCapped } from '../data/resources.js';
import { BUILDINGS } from '../data/buildings.js';
import { UNITS } from '../data/units.js';
import { allBuildings } from './city.js';
import { computeMods } from './modifiers.js';
import { buildingRates, recipeOf, storageCap, armyUpkeep, workerUpkeep, armyTotals, roadConnected } from './economy.js';
export { recordLoss } from './losses.js';

const DAY = 86400000;

export const LOSS_LABELS = {
  raid: '🚨 Pillages', wave: '👻 Vagues de morts-vivants', caravan: '🐪 Convois attaqués', forbidden: '⛔ Expédition interdite',
  famine: '🍖 Famine (entretien non payé)', outpost: '🔥 Avant-postes pillés', event: '🎪 Événements', decision: '⚖️ Décisions',
};

export function lossSummary(state, now = Date.now()) {
  const day = Math.floor(now / DAY);
  const out = {};
  for (const [k, d] of Object.entries(state.stats.losses || {})) {
    if (+k < day - 6) continue;
    for (const [cause, res] of Object.entries(d)) {
      const o = (out[cause] ||= { res: {}, value: 0 });
      for (const [r, v] of Object.entries(res)) { o.res[r] = (o.res[r] || 0) + v; o.value += v * (RESOURCES[r]?.price || 1); }
    }
  }
  return Object.entries(out).map(([cause, o]) => ({ cause, label: LOSS_LABELS[cause] || cause, ...o })).sort((a, b) => b.value - a.value);
}

export function economicReport(state, now = Date.now()) {
  const mods = computeMods(state, now);
  const cap = storageCap(state, mods);
  const rows = {};
  const row = (r) => (rows[r] ||= { res: r, prod: 0, chainUse: 0, upkeep: 0, sources: {}, users: {} });
  const chains = [];
  const idle = [];
  const roads = roadConnected(state);
  for (const b of allBuildings(state)) {
    if (b.level <= 0) continue;
    const def = BUILDINGS[b.type];
    const rates = buildingRates(state, b, mods, roads);
    const rec = recipeOf(b);
    if (b.paused) { if (rec) chains.push({ b, name: def.name, icon: def.icon, status: 'paused', reason: 'En pause' }); continue; }
    // Une chaîne bloquée ne produit pas : on reflète l'état réel mesuré au dernier pas de simulation
    const k = rec && (b.starved || b.capped) ? (b.capped ? 0 : 0.5) : 1;
    for (const [r, v] of Object.entries(rates.out)) { const x = row(r); x.prod += v * k; x.sources[def.name] = (x.sources[def.name] || 0) + v * k; }
    for (const [r, v] of Object.entries(rates.in)) { const x = row(r); x.chainUse += v * k; x.users[def.name] = (x.users[def.name] || 0) + v * k; }
    if (rec) {
      let reason = null, status = 'ok';
      if (b.capped) { status = 'capped'; reason = b.quota ? `Quota atteint (${b.quota})` : 'Entrepôt plein pour le produit'; }
      else if (b.starved) {
        status = 'starved';
        const lacking = Object.keys(rates.in).filter((r) => (state.resources[r] || 0) - (b.reserve || 0) < rates.in[r] / 60);
        reason = lacking.length ? `Manque : ${lacking.map((r) => RESOURCES[r].name).join(', ')}${b.reserve ? ` (réserve ${b.reserve} protégée)` : ''}` : 'Approvisionnement irrégulier';
      }
      chains.push({ b, name: def.name, icon: def.icon, status, reason, damaged: !!b.damaged });
    }
    if (b.damaged) idle.push({ name: def.name, icon: def.icon, reason: 'Endommagé : production −50 %' });
  }
  const army = armyUpkeep(state, mods), workers = workerUpkeep(state, mods);
  row('food').upkeep = army + workers;
  const list = [];
  for (const r of RES_ORDER) {
    const x = rows[r];
    const stock = state.resources[r] || 0;
    if (!x && stock <= 0) continue;
    const prod = x?.prod || 0, use = (x?.chainUse || 0) + (x?.upkeep || 0);
    const net = prod - use;
    const capped = isCapped(r);
    const hoursLeft = net < -1e-6 ? stock / -net : Infinity;
    const hoursFull = capped && net > 1e-6 ? Math.max(0, (cap - stock) / net) : Infinity;
    list.push({
      res: r, name: RESOURCES[r].name, icon: RESOURCES[r].icon, stock, prod, use, net, cap: capped ? cap : null,
      hoursLeft, hoursFull, shortage: hoursLeft < 6, full: capped && stock >= cap * 0.98,
      sources: x?.sources || {}, users: { ...(x?.users || {}), ...(x?.upkeep ? { 'Entretien (armée + ouvriers)': x.upkeep } : {}) },
    });
  }
  const units = armyTotals(state);
  const byUnit = Object.entries(units).filter(([u, n]) => n > 0 && UNITS[u]).map(([u, n]) => ({ u, name: UNITS[u].name, icon: UNITS[u].icon, n, food: UNITS[u].upkeep * n * Math.max(0.3, 1 + (mods.upkeep || 0)) }))
    .sort((a, b) => b.food - a.food);
  return {
    list, chains, idle, cap, famine: !!state.famine,
    upkeep: { army, workers, total: army + workers, byUnit },
    shortages: list.filter((l) => l.shortage),
    blocked: chains.filter((c) => c.status !== 'ok'),
    losses: lossSummary(state, now),
  };
}
