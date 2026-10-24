import { insecurity } from './realm21.js';
// Réseau logistique entre le château et les avant-postes.
// La production d'un avant-poste doit être acheminée jusqu'au château : chaque avant-poste est relié soit
// directement au château, soit à un autre avant-poste déjà relié par une route (transit par plusieurs territoires).
// Une partie des marchandises se perd en chemin (distance, lieux dangereux non nettoyés, territoires ennemis en
// guerre) ; les routes réduisent ces pertes et augmentent la capacité de transport, mais coûtent un entretien.
// Une garnison mal ravitaillée (acheminement < 70 %) rend la province instable, sauf convoi de rations.
import { POI_TYPES } from '../data/world.js';
import { poiAt, distCap, key } from './world.js';
import { pay, missing } from './economy.js';
import { log } from './log.js';

export const ROADS = [
  { name: 'Piste', icon: '🟫', lossMult: 1, dangerMult: 1, cap: 250, upkeep: 0, cost: null },
  { name: 'Chemin empierré', icon: '🪨', lossMult: 0.6, dangerMult: 0.9, cap: 500, upkeep: 0.4, cost: { wood: 30, stone: 40 } },
  { name: 'Route royale', icon: '🛣️', lossMult: 0.35, dangerMult: 0.75, cap: 1100, upkeep: 0.8, cost: { stone: 80, gold: 40, iron: 10 } },
  { name: 'Route pavée et gardée', icon: '🏰', lossMult: 0.2, dangerMult: 0.4, cap: 2500, upkeep: 1.6, cost: { stone: 150, gold: 90, iron: 30 } },
];
export const LOGI = { freeTiles: 3, lossPerTile: 0.015, lossPerDanger: 0.05, maxLoss: 0.6, dangerRadius: 2, warZone: 2, poorSupply: 0.7, poorSupplyStab: -8, rationsStab: 5, rationsH: 24, rationsPerSoldier: 6 };

const roadOf = (t) => Math.max(0, Math.min(ROADS.length - 1, t?.road || 0));
const unitSum = (u) => Object.values(u || {}).reduce((a, b) => a + b, 0);

// Danger le long d'un segment : lieux dangereux non nettoyés à proximité, territoires d'une faction en guerre traversés
export function segmentDanger(state, a, b, now = Date.now()) {
  const w = state.world;
  if (!w) return { danger: 0, sites: 0, war: false };
  const len = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y)));
  const seen = new Set();
  const warTiles = new Set();
  for (const f of state.factions || []) if (f.stance === 'war') for (const k of f.territory || []) warTiles.add(k);
  let war = false;
  const R = LOGI.dangerRadius;
  for (let i = 0; i <= len; i++) {
    const x = Math.round(a.x + ((b.x - a.x) * i) / len), y = Math.round(a.y + ((b.y - a.y) * i) / len);
    if (warTiles.has(key(x, y))) war = true;
    for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
      const p = poiAt(w, x + dx, y + dy);
      if (p && POI_TYPES[p.type]?.kind === 'danger' && !(p.clearedUntil > now)) seen.add(`${p.x},${p.y}`);
    }
  }
  // v21 : camps de brigands forts laissés tranquilles → insécurité des routes
  const ins = insecurity(state, now);
  return { danger: seen.size + (war ? LOGI.warZone : 0) + ins, sites: seen.size, war, insecurity: ins };
}

function segment(state, t, node, now) {
  const len = Math.hypot(t.x - node.x, t.y - node.y);
  const lv = ROADS[roadOf(t)];
  const d = segmentDanger(state, t, node, now);
  const loss = Math.min(LOGI.maxLoss, Math.max(0, len - LOGI.freeTiles) * LOGI.lossPerTile * lv.lossMult + d.danger * LOGI.lossPerDanger * lv.dangerMult);
  return { len, loss, ...d };
}

// Calcule le réseau : pour chaque avant-poste, le meilleur nœud (château ou avant-poste relié par une route) et
// l'efficacité d'acheminement cumulée jusqu'au château. Renvoie { [key]: route }.
// Cache : le réseau ne change qu'avec les avant-postes, les routes et les guerres (recalculé au moins toutes les 10 min)
let cache = null;
const netSig = (state) => Object.values(state.territories || {}).map((t) => `${t.x},${t.y},${t.road || 0},${t.roadUnpaid ? 1 : 0}`).join('|')
  + '#' + (state.factions || []).filter((f) => f.stance === 'war').map((f) => f.idx).join(',');
export function logisticsNetwork(state, now = Date.now()) {
  const sig = netSig(state);
  if (cache && cache.state === state && cache.sig === sig && Math.abs(now - cache.t) < 600000) return cache.net;
  const net = computeNetwork(state, now);
  cache = { state, sig, t: now, net };
  return net;
}
export const clearLogisticsCache = () => { cache = null; };

function computeNetwork(state, now) {
  const w = state.world;
  const out = {};
  if (!w) return out;
  const castle = { x: w.capital.x, y: w.capital.y };
  const list = Object.entries(state.territories || {}).sort((a, b) => distCap(w, a[1].x, a[1].y) - distCap(w, b[1].x, b[1].y));
  for (const [k, t] of list) {
    let best = { via: null, ...segment(state, t, castle, now) };
    best.eff = 1 - best.loss;
    for (const [k2, r2] of Object.entries(out)) {
      const t2 = state.territories[k2];
      if (roadOf(t2) < 1) continue; // seuls les avant-postes desservis par une route servent de relais
      const sg = segment(state, t, t2, now);
      const eff = (1 - sg.loss) * r2.eff;
      if (eff > best.eff + 1e-9) best = { via: k2, ...sg, eff };
    }
    best.road = roadOf(t);
    best.cap = ROADS[best.road].cap * (t.roadUnpaid ? 0.5 : 1);
    if (t.roadUnpaid) best.eff *= 0.85;
    out[k] = best;
  }
  return out;
}

export function routeOf(state, k, now = Date.now()) { return logisticsNetwork(state, now)[k] || null; }

// Production réellement acheminée : efficacité et plafond de capacité (marchandises par heure)
export function deliveredProd(prodPerH, route) {
  if (!route) return prodPerH;
  const out = {};
  const total = Object.values(prodPerH).reduce((a, b) => a + b, 0) * route.eff;
  const capK = total > route.cap ? route.cap / total : 1;
  for (const [r, v] of Object.entries(prodPerH)) out[r] = v * route.eff * capK;
  return out;
}

export const supplied = (t, now = Date.now()) => t.rationsUntil > now;
// Facteur de stabilité lié au ravitaillement (utilisé par stabilityFactors)
export function supplyStab(state, k, t, now = Date.now(), route = null) {
  if (supplied(t, now)) return ['Convoi de rations reçu', LOGI.rationsStab];
  route ||= routeOf(state, k, now);
  if (route && route.eff < LOGI.poorSupply && unitSum(t.garrison)) return [`Garnison mal ravitaillée (acheminement ${Math.round(route.eff * 100)} %)`, LOGI.poorSupplyStab];
  return null;
}

export function roadUpgradeCost(state, k, now = Date.now()) {
  const t = state.territories[k];
  if (!t) return null;
  const next = roadOf(t) + 1;
  if (next >= ROADS.length) return null;
  const r = routeOf(state, k, now);
  const tiles = Math.max(2, Math.ceil(r?.len || 2));
  return Object.fromEntries(Object.entries(ROADS[next].cost).map(([res, v]) => [res, Math.round(v * tiles)]));
}

export function upgradeRoad(state, k, now = Date.now()) {
  const t = state.territories[k];
  if (!t) return { ok: false, reason: 'Territoire introuvable' };
  const cost = roadUpgradeCost(state, k, now);
  if (!cost) return { ok: false, reason: 'Route déjà au niveau maximal' };
  if (!pay(state, cost)) return { ok: false, reason: 'Ressources insuffisantes', missing: missing(state, cost) };
  t.road = roadOf(t) + 1;
  t.roadUnpaid = false;
  log(state, 'good', `🛣️ ${ROADS[t.road].name} achevée vers ${t.name}.`, now);
  return { ok: true, name: ROADS[t.road].name };
}

export function rationsCost(t) { return { food: Math.max(50, unitSum(t.garrison) * LOGI.rationsPerSoldier * LOGI.rationsH / 4) }; }
export function sendRations(state, k, now = Date.now()) {
  const t = state.territories[k];
  if (!t) return { ok: false, reason: 'Territoire introuvable' };
  if (!unitSum(t.garrison)) return { ok: false, reason: 'Aucune garnison à ravitailler' };
  if (supplied(t, now)) return { ok: false, reason: 'La garnison est déjà ravitaillée' };
  const cost = rationsCost(t);
  if (!pay(state, cost)) return { ok: false, reason: 'Ressources insuffisantes', missing: missing(state, cost) };
  t.rationsUntil = now + LOGI.rationsH * 3600000;
  return { ok: true };
}

// Entretien horaire des routes (or par case) ; impayé : capacité réduite de moitié, pertes accrues
export function roadUpkeep(state, k, route) {
  const t = state.territories[k];
  const lv = ROADS[roadOf(t)];
  return lv.upkeep ? { gold: lv.upkeep * Math.max(1, route?.len || 1) } : {};
}
export function logisticsUpkeepTick(state, network, h) {
  for (const [k, t] of Object.entries(state.territories || {})) {
    if (!roadOf(t)) { t.roadUnpaid = false; continue; }
    const g = (roadUpkeep(state, k, network[k]).gold || 0) * h;
    if ((state.resources.gold || 0) >= g) { state.resources.gold -= g; t.roadUnpaid = false; } else t.roadUnpaid = true;
  }
}
