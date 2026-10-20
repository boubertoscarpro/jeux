// v20 « Ma forteresse » — Fin de la corvée (module pur). Quatre tâches répétitives réglées une fois, branchées sur
// les ordres automatiques existants mais hors quota (comme les règles de tri de la v18) :
//  1) raids en série relancés sur le meilleur camp connu, avec un préréglage (nombre d'attaques, troupes auto) ;
//  2) ravitaillement des avant-postes, sans jamais descendre sous une réserve de nourriture ;
//  3) défense conseillée appliquée dès qu'un raid est repéré (le joueur peut toujours la modifier ensuite) ;
//  4) ménage des rapports informatifs lus (les défaites et l'urgent ne sont jamais effacés).
// Chaque passage est consigné dans le journal des ordres (state.orderLog) et sur l'écran « Corvées ».
import { POI_TYPES } from '../data/world.js';
import { isRevealed, distCap } from './world.js';
import { raidState, raidStatus, startRaidOrder, raidTargetOk, maxRaidOrders, RAID, RAID_COUNTS } from './raidOrders.js';
import { sendRations, rationsCost, supplied } from './logistics.js';
import { advisedDefense, applyDefense } from './siege.js';
import { reportClass } from './notices.js';
import { thLevel } from './city.js';

const MIN = 60000, H = 3600000;
export const CHORES = {
  raids: { name: 'Raids relancés', icon: '🔁', desc: 'Relance un raid en série sur le meilleur camp connu dès qu’une place se libère.', every: 10 * MIN },
  supply: { name: 'Ravitaillement', icon: '🥫', desc: 'Ravitaille les garnisons des avant-postes, sans passer sous la réserve de nourriture.', every: 15 * MIN },
  defense: { name: 'Alerte et défense', icon: '🛡️', desc: 'Applique la défense conseillée dès qu’un raid est repéré.', every: MIN },
  cleanup: { name: 'Ménage des rapports', icon: '🧹', desc: 'Efface les rapports informatifs déjà lus, plus vieux que le délai choisi. Jamais l’urgent.', every: 30 * MIN },
};
export const CHORE_ORDER = ['raids', 'supply', 'defense', 'cleanup'];
export const CHORE_DEFAULTS = {
  raids: { on: false, count: 5, reserve: { gold: 2000, food: 3000 }, maxDanger: 3 },
  supply: { on: false, reserve: 5000 },
  defense: { on: false },
  cleanup: { on: false, days: 2 },
};
export const CHORE_LIMITS = { logMax: 40, raidCounts: RAID_COUNTS, cleanupDays: [1, 2, 7] };

export function choreState(state) {
  const C = (state.chores ||= {});
  for (const [k, d] of Object.entries(CHORE_DEFAULTS)) C[k] = { ...JSON.parse(JSON.stringify(d)), ...(C[k] || {}) };
  C.last ||= {};
  C.log ||= [];
  C.stats ||= { raids: 0, supply: 0, defense: 0, cleanup: 0 };
  return C;
}
export function setChore(state, key, patch) {
  if (!CHORES[key]) return { ok: false, reason: 'Corvée inconnue' };
  const C = choreState(state);
  const p = { ...patch };
  if (key === 'raids' && p.count != null && !RAID_COUNTS.includes(p.count)) return { ok: false, reason: 'Nombre d’attaques invalide' };
  if (key === 'cleanup' && p.days != null && !CHORE_LIMITS.cleanupDays.includes(p.days)) return { ok: false, reason: 'Délai invalide' };
  if (key === 'supply' && p.reserve != null) p.reserve = Math.max(0, Math.floor(p.reserve) || 0);
  Object.assign(C[key], p);
  return { ok: true };
}
const note = (state, key, msg, now) => {
  const C = choreState(state);
  C.log.unshift({ t: now, key, msg });
  if (C.log.length > CHORE_LIMITS.logMax) C.log.length = CHORE_LIMITS.logMax;
  C.stats[key] = (C.stats[key] || 0) + 1;
  (state.orderLog ||= []).unshift({ t: now, name: `${CHORES[key].icon} ${CHORES[key].name}`, msg });
  if (state.orderLog.length > 60) state.orderLog.length = 60;
};

// Meilleur camp : révélé, éligible, non nettoyé, danger ≤ réglage ; le plus proche à butin égal
export function bestRaidTarget(state, maxDanger = 3, now = Date.now()) {
  const W = state.world;
  if (!W?.pois) return null;
  const busy = new Set(raidState(state).active.map((o) => o.x + ',' + o.y));
  let best = null, bestScore = -Infinity;
  for (const p of Object.values(W.pois)) {
    if (!raidTargetOk(p) || busy.has(p.x + ',' + p.y) || !isRevealed(W, p.x, p.y)) continue;
    if ((p.danger || 0) > maxDanger || p.clearedUntil > now) continue;
    const loot = Object.values(POI_TYPES[p.type].loot || {}).reduce((a, v) => a + v, 0) * (1 + (p.danger || 0) * 0.45);
    const score = loot / (1 + distCap(W, p.x, p.y) / 6) - (p.danger || 0) * 5;
    if (score > bestScore) { bestScore = score; best = p; }
  }
  return best;
}
const keepsReserve = (state, cost, reserve) => Object.entries(cost).every(([r, v]) => (state.resources[r] || 0) - v >= (reserve[r] || 0));

function doRaids(state, c, now) {
  const R = raidState(state);
  if (thLevel(state) < RAID.minTh) return null;
  if (R.active.length >= maxRaidOrders(thLevel(state))) return null;
  const p = bestRaidTarget(state, c.maxDanger, now);
  if (!p) return null;
  const opts = { x: p.x, y: p.y, count: c.count, auto: true, units: {}, supply: false };
  const st = raidStatus(state, opts, now);
  if (!st.ok) return null;
  if (!keepsReserve(state, st.cost, c.reserve)) return null;
  const r = startRaidOrder(state, opts, now);
  return r.ok ? `Raids en série relancés sur ${r.order.name} (${c.count} attaques).` : null;
}
function doSupply(state, c, now) {
  const done = [];
  for (const [k, t] of Object.entries(state.territories || {})) {
    if (supplied(t, now) || !Object.values(t.garrison || {}).some((n) => n > 0)) continue;
    const cost = rationsCost(t);
    if ((state.resources.food || 0) - cost.food < c.reserve) break;
    if (sendRations(state, k, now).ok) done.push(t.name || k);
  }
  return done.length ? `Rations envoyées à ${done.join(', ')}.` : null;
}
function doDefense(state, c, now) {
  const raid = (state.raids || [])[0];
  if (!raid) return null;
  const id = raid.id || `${raid.name}-${raid.arrive}`;
  if (c.lastRaid === id) return null;
  c.lastRaid = id;
  const d = advisedDefense(state, raid);
  applyDefense(state, d);
  return `Raid « ${raid.name} » repéré : défense conseillée appliquée${d.why.length ? ` (${d.why[0]})` : ''}.`;
}
function doCleanup(state, c, now) {
  const before = (state.reports || []).length;
  const limit = now - c.days * 24 * H;
  state.reports = (state.reports || []).filter((r) => !(r.read && reportClass(r) === 'info' && (r.t || 0) < limit && !r.keep));
  const n = before - state.reports.length;
  return n ? `${n} rapport${n > 1 ? 's' : ''} informatif${n > 1 ? 's' : ''} lu${n > 1 ? 's' : ''} effacé${n > 1 ? 's' : ''}.` : null;
}
const RUN = { raids: doRaids, supply: doSupply, defense: doDefense, cleanup: doCleanup };

export function choresTick(state, now = Date.now()) {
  if (!state.chores) return [];
  const C = choreState(state), out = [];
  for (const k of CHORE_ORDER) {
    const c = C[k];
    if (!c.on || now - (C.last[k] || 0) < CHORES[k].every) continue;
    C.last[k] = now;
    const msg = RUN[k](state, c, now);
    if (msg) { note(state, k, msg, now); out.push({ key: k, msg }); }
  }
  return out;
}
// Clics économisés (estimation affichée, mesurée en v20 : voir docs/V20.md)
export const CLICKS_SAVED = { raids: 7, supply: 3, defense: 6, cleanup: 2 };
export function choresSummary(state) {
  const C = choreState(state);
  const clicks = Object.entries(C.stats).reduce((a, [k, n]) => a + (CLICKS_SAVED[k] || 0) * n, 0);
  return { on: CHORE_ORDER.filter((k) => C[k].on).length, runs: Object.values(C.stats).reduce((a, b) => a + b, 0), clicks };
}
export { MIN as CHORE_MIN };
