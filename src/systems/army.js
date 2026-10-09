import { UNITS, ALL_UNITS, UNIT_CLASSES } from '../data/units.js';
import { TECHS } from '../data/techs.js';
import { BUILDINGS } from '../data/buildings.js';
import { uid, scaleObj } from '../core/util.js';
import { levelOf } from './city.js';
import { computeMods } from './modifiers.js';
import { pay, missing } from './economy.js';
import { log } from './log.js';

const UNLOCK_TECH = Object.fromEntries(Object.entries(TECHS).filter(([, t]) => t.unlock).map(([id, t]) => [t.unlock, id]));

export function unitStatus(state, type) {
  const u = UNITS[type];
  if (u.special) return { ok: false, reason: 'Unité d’élite : Roue des Anciens et événements uniquement' };
  const lvl = levelOf(state, u.building);
  if (lvl === 0) return { ok: false, reason: `${BUILDINGS[u.building].name} requise` };
  if (lvl < u.bLevel) return { ok: false, reason: `${BUILDINGS[u.building].name} niv. ${u.bLevel}` };
  const tech = UNLOCK_TECH[type];
  if (tech && !state.techs[tech]) return { ok: false, reason: `Recherche : ${TECHS[tech].name}` };
  return { ok: true };
}

export const trainTime = (type, n, mods) => (UNITS[type].time * n * 1000) / (1 + (mods['train.speed'] || 0));

export function train(state, type, n, now = Date.now()) {
  n = Math.floor(n);
  if (!(n > 0)) return { ok: false, reason: 'Quantité invalide' };
  const st = unitStatus(state, type);
  if (!st.ok) return st;
  if (state.famine) return { ok: false, reason: 'Famine : impossible de former des troupes' };
  const u = UNITS[type];
  const cost = scaleObj(u.cost, n);
  if (!pay(state, cost)) return { ok: false, reason: 'Ressources insuffisantes', missing: missing(state, cost) };
  const mods = computeMods(state, now);
  // File séquentielle par bâtiment
  const last = state.queues.train.filter((q) => q.building === u.building).reduce((m, q) => Math.max(m, q.end), now);
  const start = Math.max(now, last);
  state.queues.train.push({ id: uid('t'), unit: type, count: n, building: u.building, start, end: start + trainTime(type, n, mods), cost });
  return { ok: true };
}

export function cancelTrain(state, qid, now = Date.now()) {
  const i = state.queues.train.findIndex((q) => q.id === qid);
  if (i < 0) return { ok: false };
  const q = state.queues.train[i];
  for (const [r, v] of Object.entries(q.cost)) state.resources[r] += Math.floor(v * 0.8);
  state.queues.train.splice(i, 1);
  // Recaler les files suivantes du même bâtiment
  let t = now;
  for (const o of state.queues.train.filter((x) => x.building === q.building).sort((a, b) => a.start - b.start)) {
    const dur = o.end - o.start;
    if (o.start > t) { o.start = Math.max(t, o.start - (q.end - q.start)); o.end = o.start + dur; }
    t = o.end;
  }
  return { ok: true };
}

export function completeTrain(state, q, now) {
  state.army[q.unit] = (state.army[q.unit] || 0) + q.count;
  log(state, 'good', `${UNITS[q.unit].icon} ${q.count} ${UNITS[q.unit].name}${q.count > 1 ? 's' : ''} prêt${q.count > 1 ? 's' : ''} au combat.`, now);
}

export function dismiss(state, type, n) {
  n = Math.min(state.army[type] || 0, Math.floor(n));
  if (n <= 0) return { ok: false };
  state.army[type] -= n;
  return { ok: true };
}

export function armyPower(units) {
  let p = 0;
  for (const [t, n] of Object.entries(units || {})) {
    const u = ALL_UNITS[t];
    if (u && u.class !== 'boss') p += n * (u.atk + u.def) * Math.sqrt(u.hp / 30);
  }
  return Math.round(p);
}

export const combatUnitCount = (units) => Object.entries(units || {}).reduce((s, [t, n]) => s + (UNITS[t] && UNITS[t].class !== 'special' ? n : 0), 0);
export { UNIT_CLASSES };
