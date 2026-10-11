// Monument dynastique (voir data/monument.js) : orientation, modificateurs, lien avec l'héritage.
import { ORIENTS, MONUMENT_STAGES } from '../data/monument.js';
import { chronicle } from './chronicle.js';

export const monumentOf = (state) => Object.values(state.city?.buildings || {}).find((b) => b.type === 'monument') || null;

export function setOrientation(state, orient, now = Date.now()) {
  const b = monumentOf(state);
  if (!b) return { ok: false, reason: 'Aucun monument : placez-le d’abord sur la carte du royaume' };
  if (!ORIENTS[orient]) return { ok: false, reason: 'Orientation inconnue' };
  if (b.orient) return { ok: false, reason: 'L’orientation est gravée dans la pierre : elle ne change plus' };
  b.orient = orient;
  chronicle(state, `Le souverain consacre le monument de la dynastie : ce sera ${ORIENTS[orient].name}.`, now);
  return { ok: true, name: ORIENTS[orient].name };
}

export function monumentMods(state) {
  const b = monumentOf(state);
  const o = b && b.level > 0 && ORIENTS[b.orient];
  if (!o) return {};
  return Object.fromEntries(Object.entries(o.per).map(([k, v]) => [k, v * b.level]));
}

export function monumentInfo(state) {
  const b = monumentOf(state);
  if (!b) return null;
  return { b, level: b.level, orient: b.orient || null, stage: MONUMENT_STAGES[Math.max(0, b.level - 1)] || null, next: MONUMENT_STAGES[b.level] || null };
}
