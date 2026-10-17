// v14 — Réserves royales : le surplus devient une assurance contre les crises.
// Des ressources EXISTANTES (nourriture, bois, charbon, herbes) sont mises de côté hors entrepôt, dans la limite d'une
// part de sa capacité. Elles ne rapportent rien et ne se reprennent pas librement : elles servent aux interventions
// de crise (à la main ou par le régent pendant une absence), et la nourriture peut être rendue au royaume en famine.
// Consigne facultative : ce qui déborderait de l'entrepôt est versé à la réserve au lieu d'être écoulé à 15 %.
import { RESERVE } from '../data/crises.js';
import { RESOURCES } from '../data/resources.js';
import { fmt } from '../core/util.js';
import { storageCap } from './economy.js';
import { computeMods } from './modifiers.js';
import { log } from './log.js';

export function reserveState(state) {
  const R = state.reserve && typeof state.reserve === 'object' && !Array.isArray(state.reserve) ? state.reserve : (state.reserve = {});
  if (!R.stock || typeof R.stock !== 'object' || Array.isArray(R.stock)) R.stock = {};
  for (const r of RESERVE.res) { const v = Number(R.stock[r]); R.stock[r] = Number.isFinite(v) && v > 0 ? v : 0; }
  R.overflow = !!R.overflow;
  R.regent = R.regent !== false;           // le régent puise dans la réserve pendant une crise (par défaut)
  R.used = R.used && typeof R.used === 'object' ? R.used : {};
  return R;
}

export const reserveCap = (state, r, mods = computeMods(state)) => (RESERVE.res.includes(r) ? Math.floor(storageCap(state, mods, r) * RESERVE.capShare[r]) : 0);
export const reserveOf = (state, r) => Math.max(0, state.reserve?.stock?.[r] || 0);
export const reserveRoom = (state, r, mods) => Math.max(0, reserveCap(state, r, mods) - reserveOf(state, r));

// Versement manuel : un quart du stock actuel (ou `amount`), borné par la place disponible
export function depositReserve(state, r, amount = null, now = Date.now()) {
  if (!RESERVE.res.includes(r)) return { ok: false, reason: 'Cette ressource ne se met pas en réserve' };
  const R = reserveState(state);
  const room = reserveRoom(state, r);
  const want = amount == null ? Math.floor((state.resources[r] || 0) * RESERVE.depositShare) : Math.floor(amount);
  const n = Math.min(room, want, Math.floor(state.resources[r] || 0));
  if (n <= 0) return { ok: false, reason: room <= 0 ? 'La réserve est pleine' : 'Stock insuffisant' };
  state.resources[r] -= n;
  R.stock[r] += n;
  log(state, 'info', `🏺 ${fmt(n)} ${RESOURCES[r].icon} ${RESOURCES[r].name.toLowerCase()} versés à la réserve royale.`, now);
  return { ok: true, n };
}

export function setReserveRule(state, rule, on) {
  const R = reserveState(state);
  if (rule === 'overflow') R.overflow = !!on;
  else if (rule === 'regent') R.regent = !!on;
  else return { ok: false, reason: 'Consigne inconnue' };
  return { ok: true };
}

// Débordement de l'entrepôt : appelé par l'économie avec la quantité perdue ; renvoie ce qui a été absorbé
export function absorbOverflow(state, r, lost, mods) {
  if (!state.reserve?.overflow || !RESERVE.res.includes(r) || !(lost > 0)) return 0;
  const R = reserveState(state);
  const n = Math.min(lost, reserveRoom(state, r, mods));
  if (n > 0) { R.stock[r] += n; R.absorbed = R.absorbed || {}; R.absorbed[r] = (R.absorbed[r] || 0) + n; }
  return n;
}

// Peut-on payer `cost` depuis la réserve ?
export const canDraw = (state, cost) => Object.entries(cost).every(([r, v]) => reserveOf(state, r) >= v);
export function drawReserve(state, cost) {
  if (!canDraw(state, cost)) return false;
  const R = reserveState(state);
  for (const [r, v] of Object.entries(cost)) { R.stock[r] -= v; R.used[r] = (R.used[r] || 0) + v; }
  return true;
}

// Famine : la nourriture de la réserve peut être rendue au royaume (et seulement elle, et seulement alors)
export function releaseFood(state, now = Date.now()) {
  const R = reserveState(state);
  if (!state.famine && (state.resources.food || 0) > 0) return { ok: false, reason: 'La réserve ne s’ouvre qu’en cas de famine' };
  const n = Math.floor(R.stock.food);
  if (n <= 0) return { ok: false, reason: 'Réserve de nourriture vide' };
  R.stock.food -= n;
  state.resources.food = (state.resources.food || 0) + n;
  log(state, 'good', `🏺 Famine : la réserve royale rend ${fmt(n)} 🍖 au royaume.`, now);
  return { ok: true, n };
}

export const reserveTotal = (state) => RESERVE.res.reduce((a, r) => a + reserveOf(state, r), 0);
