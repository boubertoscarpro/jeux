import { BUILDINGS, buildingCost, buildingTime } from '../data/buildings.js';
import { COSMETICS, SEASON } from '../data/social.js';
import { RESOURCES } from '../data/resources.js';
import { rng } from '../core/rng.js';
import { uid } from '../core/util.js';
import { allBuildings, countOf, levelOf, thLevel, placementCheck, terrainAt, buildingAt } from './city.js';
import { computeMods } from './modifiers.js';
import { canAfford, pay, gain, missing } from './economy.js';
import { generateItem } from './items.js';
import { log } from './log.js';

export const buildSlots = (mods) => 1 + (mods.buildQueue || 0);

// build.cost (technologies, héros…) + cost.build + cost.build.<catégorie> (spécialisation) : plancher 50 %
export function costWithMods(cost, mods, type = null) {
  const cat = type && BUILDINGS[type]?.cat;
  const k = Math.max(0.5, 1 + (mods['build.cost'] || 0) + (mods['cost.build'] || 0) + (cat ? mods['cost.build.' + cat] || 0 : 0));
  const out = {};
  for (const [r, v] of Object.entries(cost)) out[r] = Math.ceil(v * k);
  return out;
}
export const timeWithMods = (ms, mods) => ms / (1 + (mods['build.speed'] || 0));

// Producteurs de base : le premier exemplaire est offert quand le royaume n'en possède aucun.
// Sans cela, un royaume sans carrière et sans pierre ne pourrait plus jamais en construire (blocage définitif).
export const STARTER_FREE = ['sawmill', 'quarry', 'farm'];
export const isStarterFree = (state, type, nextLevel) => nextLevel === 1 && STARTER_FREE.includes(type) && countOf(state, type) === 0;

export function getUpgradeInfo(state, type, nextLevel, mods = computeMods(state)) {
  const cost = isStarterFree(state, type, nextLevel) ? {} : costWithMods(buildingCost(type, nextLevel), mods, type);
  return { cost, time: timeWithMods(buildingTime(type, nextLevel), mods) };
}

// Vérifie les prérequis d'un type de bâtiment (construction neuve)
export function buildRequirement(state, type) {
  const def = BUILDINGS[type];
  const th = thLevel(state);
  if (def.req?.townhall && th < def.req.townhall) return `Hôtel de ville niv. ${def.req.townhall} requis`;
  if (def.req?.tech && !state.techs[def.req.tech]) return 'Technologie requise';
  const max = def.maxCount(th);
  if (countOf(state, type) >= max) return def.unique || max === 1 ? 'Déjà construit' : `Maximum atteint (${max}) — améliorez l’hôtel de ville`;
  return null;
}

function queueFull(state, mods) {
  return state.queues.build.length >= buildSlots(mods);
}

export function startBuild(state, type, x, y, now = Date.now()) {
  const mods = computeMods(state, now);
  const def = BUILDINGS[type];
  if (!def) return { ok: false, reason: 'Inconnu' };
  const req = buildRequirement(state, type);
  if (req) return { ok: false, reason: req };
  if (def.grid !== false) {
    const pc = placementCheck(state, type, x, y);
    if (!pc.ok) return pc;
  }
  if (queueFull(state, mods)) return { ok: false, reason: 'File de construction pleine' };
  if (def.grid === false && state.queues.build.some((q) => q.bid === 'fort:' + type)) return { ok: false, reason: 'Déjà en construction' };
  const { cost, time } = getUpgradeInfo(state, type, 1, mods);
  if (!pay(state, cost)) return { ok: false, reason: 'Ressources insuffisantes', missing: missing(state, cost) };
  let bid;
  if (def.grid === false) {
    bid = 'fort:' + type;
  } else {
    bid = uid('b');
    state.city.buildings[bid] = { id: bid, type, level: 0, x, y };
  }
  state.queues.build.push({ id: uid('q'), kind: 'build', bid, type, level: 1, start: now, end: now + time, cost });
  return { ok: true };
}

export function startUpgrade(state, bid, now = Date.now()) {
  const mods = computeMods(state, now);
  let type, level;
  if (bid.startsWith('fort:')) {
    type = bid.slice(5); level = state.city.fort[type] || 0;
    if (level === 0) return startBuild(state, type, 0, 0, now);
  } else {
    const b = state.city.buildings[bid];
    if (!b) return { ok: false, reason: 'Introuvable' };
    type = b.type; level = b.level;
  }
  const def = BUILDINGS[type];
  if (state.queues.build.some((q) => q.bid === bid)) return { ok: false, reason: 'Déjà en chantier' };
  if (level >= def.maxLevel) return { ok: false, reason: 'Niveau maximum' };
  if (type !== 'townhall' && level + 1 > thLevel(state)) return { ok: false, reason: `Hôtel de ville niv. ${level + 1} requis` };
  if (queueFull(state, mods)) return { ok: false, reason: 'File de construction pleine' };
  const { cost, time } = getUpgradeInfo(state, type, level + 1, mods);
  if (!pay(state, cost)) return { ok: false, reason: 'Ressources insuffisantes', missing: missing(state, cost) };
  state.queues.build.push({ id: uid('q'), kind: 'upgrade', bid, type, level: level + 1, start: now, end: now + time, cost });
  return { ok: true };
}

// ───────── Chantiers planifiés ─────────
// Quand la file est pleine, jusqu'à 3 chantiers peuvent être planifiés : ils démarrent d'eux-mêmes dès qu'une
// place se libère ET que les ressources sont disponibles (payées au démarrage, pas avant).
export const PLAN_MAX = 3;
export function planConstruction(state, item) {
  const planned = (state.queues.planned ||= []);
  if (planned.length >= PLAN_MAX) return { ok: false, reason: `Au plus ${PLAN_MAX} chantiers planifiés` };
  if (item.kind === 'upgrade' && planned.some((p) => p.kind === 'upgrade' && p.bid === item.bid)) return { ok: false, reason: 'Déjà planifié' };
  if (item.kind === 'build' && planned.some((p) => p.kind === 'build' && p.x === item.x && p.y === item.y)) return { ok: false, reason: 'Emplacement déjà réservé' };
  planned.push({ id: uid('pl'), ...item });
  return { ok: true, planned: true };
}
export function cancelPlanned(state, id) {
  const before = (state.queues.planned || []).length;
  state.queues.planned = (state.queues.planned || []).filter((p) => p.id !== id);
  return { ok: state.queues.planned.length < before };
}
export function processPlanned(state, now = Date.now()) {
  const planned = state.queues.planned || [];
  while (planned.length) {
    const p = planned[0];
    const r = p.kind === 'build' ? startBuild(state, p.type, p.x, p.y, now) : startUpgrade(state, p.bid, now);
    if (r.ok) { planned.shift(); log(state, 'info', `🏗️ Chantier planifié démarré : ${BUILDINGS[p.type || state.city.buildings[p.bid]?.type || p.bid.slice(5)]?.name || ''}.`, now); continue; }
    if (/File de construction pleine|Ressources insuffisantes/.test(r.reason || '')) { p.waiting = r.reason; break; }
    planned.shift(); // devenu impossible (niveau max, emplacement occupé…) : retiré
    log(state, 'info', `🏗️ Chantier planifié abandonné : ${r.reason || 'impossible'}.`, now);
  }
}

export const CLEAR_COST = { food: 25, gold: 10 };
export function startClear(state, x, y, now = Date.now()) {
  const mods = computeMods(state, now);
  if (terrainAt(state, x, y) !== 'rubble') return { ok: false, reason: 'Pas de décombres ici' };
  if (state.queues.build.some((q) => q.kind === 'clear' && q.x === x && q.y === y)) return { ok: false, reason: 'Déjà en cours' };
  if (queueFull(state, mods)) return { ok: false, reason: 'File de construction pleine' };
  if (!pay(state, CLEAR_COST)) return { ok: false, reason: 'Ressources insuffisantes', missing: missing(state, CLEAR_COST) };
  state.queues.build.push({ id: uid('q'), kind: 'clear', x, y, start: now, end: now + timeWithMods(8000, mods), cost: CLEAR_COST });
  return { ok: true };
}

export function cancelBuild(state, qid) {
  const i = state.queues.build.findIndex((q) => q.id === qid);
  if (i < 0) return { ok: false };
  const q = state.queues.build[i];
  state.queues.build.splice(i, 1);
  for (const [r, v] of Object.entries(q.cost || {})) state.resources[r] += Math.floor(v * 0.8);
  if (q.kind === 'build' && !q.bid.startsWith('fort:')) delete state.city.buildings[q.bid];
  return { ok: true };
}

// Déplacer un bâtiment (optimisation du placement)
export const moveCost = (b) => ({ gold: 40 * b.level });
export function moveBuilding(state, bid, x, y) {
  const b = state.city.buildings[bid];
  if (!b || b.level <= 0) return { ok: false, reason: 'Impossible' };
  if (state.queues.build.some((q) => q.bid === bid)) return { ok: false, reason: 'Bâtiment en chantier' };
  const pc = placementCheck(state, b.type, x, y);
  if (!pc.ok) return pc;
  const cost = b.deco ? {} : moveCost(b);
  if (!pay(state, cost)) return { ok: false, reason: 'Pas assez d’or', missing: missing(state, cost) };
  b.x = x; b.y = y;
  return { ok: true };
}

export function demolish(state, bid) {
  const b = state.city.buildings[bid];
  if (!b || b.type === 'townhall') return { ok: false, reason: 'Impossible' };
  if (state.queues.build.some((q) => q.bid === bid)) return { ok: false, reason: 'Bâtiment en chantier' };
  delete state.city.buildings[bid];
  return { ok: true };
}

// Décoration cosmétique
export function placeDeco(state, key, x, y) {
  if (!state.meta.owned[key]) return { ok: false, reason: 'Non possédée' };
  if (allBuildings(state).some((b) => b.deco === key)) return { ok: false, reason: 'Déjà placée' };
  const pc = placementCheck(state, 'house', x, y);
  if (!pc.ok) return pc;
  const id = uid('d');
  state.city.buildings[id] = { id, type: 'deco', deco: key, level: 1, x, y, icon: COSMETICS[key].icon };
  return { ok: true };
}

export function completeBuild(state, q, now) {
  const mods = computeMods(state, now);
  if (q.kind === 'clear') {
    state.city.terrain[q.y * state.city.w + q.x] = 'plain';
    state.stats.cleared++;
    const loot = { wood: rng.int(20, 90), stone: rng.int(20, 90) };
    if (rng.chance(0.35)) loot.iron = rng.int(10, 50);
    if (rng.chance(0.25)) loot.gold = rng.int(15, 60);
    gain(state, loot, mods);
    let extra = '';
    if (rng.chance(0.07)) {
      const it = generateItem({ ilvl: 1 });
      state.inventory.items.push(it);
      extra = ` Parmi les gravats : ${it.name} !`;
    }
    log(state, 'good', `🧹 Décombres déblayés : ${Object.entries(loot).map(([r, v]) => `${v} ${RESOURCES[r].icon}`).join(' ')}.${extra}`, now);
    return;
  }
  if (q.bid.startsWith('fort:')) {
    state.city.fort[q.type] = q.level;
  } else {
    const b = state.city.buildings[q.bid];
    if (!b) return;
    b.level = q.level;
  }
  state.stats.built++;
  state.season.points += SEASON.points.build;
  log(state, 'good', `${BUILDINGS[q.type].icon} ${BUILDINGS[q.type].name} ${q.level === 1 ? 'construit' : `amélioré au niveau ${q.level}`}.`, now);
}

export { canAfford, levelOf };
export const buildingLabel = (b) => (b.type === 'deco' ? COSMETICS[b.deco]?.name : BUILDINGS[b.type]?.name);
export { buildingAt };
