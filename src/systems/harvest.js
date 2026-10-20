// v20 « Ma forteresse » — Récoltes de bonus (module pur). Un bâtiment de production met de côté 5 % de ce qu'il
// produit ; dès 4 heures de bonus, une bulle apparaît au-dessus de lui et se récolte d'un clic (ou tout d'un coup).
// Rien n'expire, rien n'est plafonné : aucune pression à revenir. Si l'entrepôt est plein, le reste attend dans la bulle.
import { buildingRates, storageCap, addResource, roadConnected } from './economy.js';
import { isCapped } from '../data/resources.js';

export const HARVEST = { share: 0.05, readyHours: 4 };
const H = 3600000;
export const harvestState = (state) => (state.harvest && typeof state.harvest === 'object' ? state.harvest : (state.harvest = { acc: {}, last: 0, collected: 0 }));
// Accumule le bonus (appelé au pas du monde ; rattrape le temps hors ligne d'un coup)
export function harvestTick(state, now, mods) {
  const S = harvestState(state);
  if (!S.last) { S.last = now; return; }
  const dtH = (now - S.last) / H;
  if (dtH < 0.25) return;
  S.last = now;
  const roads = roadConnected(state);
  for (const b of Object.values(state.city?.buildings || {})) {
    if (b.level <= 0 || b.paused || b.starved || b.capped || b.type === 'deco' || b.type === 'road') continue;
    const r = buildingRates(state, b, mods, roads);
    const out = Object.entries(r.out || {});
    if (!out.length) continue;
    const a = (S.acc[b.id] ||= { got: {}, rate: {} });
    for (const [k, v] of out) { if (!(v > 0)) continue; a.got[k] = (a.got[k] || 0) + v * HARVEST.share * dtH; a.rate[k] = v * HARVEST.share; }
  }
  for (const id of Object.keys(S.acc)) if (!state.city.buildings[id]) delete S.acc[id];
}
// Bulle prête : au moins 4 heures de bonus
export function harvestReady(state, bid) {
  const a = harvestState(state).acc[bid];
  if (!a) return false;
  return Object.entries(a.got).some(([k, v]) => v >= (a.rate[k] || Infinity) * HARVEST.readyHours * 0.999);
}
export const readyHarvests = (state) => Object.keys(harvestState(state).acc).filter((id) => harvestReady(state, id));
// Récolter : un bâtiment (bid) ou tout ce qui est prêt
export function collectHarvest(state, bid = null, mods = {}) {
  const S = harvestState(state);
  const ids = bid ? [bid] : readyHarvests(state);
  const got = {};
  for (const id of ids) {
    const a = S.acc[id];
    if (!a) continue;
    for (const [k, v] of Object.entries(a.got)) {
      const cap = isCapped(k) ? storageCap(state, mods, k) : Infinity;
      const added = addResource(state, k, v, mods, cap);
      got[k] = (got[k] || 0) + added;
      a.got[k] = v - added;
      if (a.got[k] < 1e-6) delete a.got[k];
    }
    if (!Object.keys(a.got).length) delete S.acc[id];
  }
  const n = Object.values(got).reduce((x, y) => x + y, 0);
  if (n > 0) S.collected = (S.collected || 0) + 1;
  return n > 0 ? { ok: true, got } : { ok: false, reason: bid ? 'Rien à récolter ici pour l’instant' : 'Aucune récolte prête' };
}
export const harvestTotal = (state, bid) => Object.values(harvestState(state).acc[bid]?.got || {}).reduce((a, b) => a + b, 0);
