// v20 « Ma forteresse » — Mode architecte (module pur). Le joueur pose des silhouettes fantômes des bâtiments qu'il
// compte bâtir (sans rien payer ni réserver), et voit les paliers futurs de l'enceinte. Un fantôme se bâtit ensuite
// d'un clic (coût normal) ; il disparaît de lui-même quand la case est prise par autre chose.
import { BUILDINGS } from '../data/buildings.js';
import { ENC_STAGES } from '../data/castle.js';
import { placementCheck } from './city.js';
import { squareRect, encStage, castleState } from './castle.js';

export const ARCH = { max: 40 };
export const ghosts = (state) => state.castle?.arch || [];
export const ghostAt = (state, x, y) => ghosts(state).find((g) => g.x === x && g.y === y) || null;

export function addGhost(state, type, x, y) {
  if (!BUILDINGS[type] || type === 'road') return { ok: false, reason: 'Bâtiment inconnu' };
  const C = castleState(state);
  C.arch ||= [];
  if (C.arch.length >= ARCH.max) return { ok: false, reason: `Au plus ${ARCH.max} silhouettes planifiées` };
  if (ghostAt(state, x, y)) return { ok: false, reason: 'Une silhouette occupe déjà cette case' };
  const pc = placementCheck(state, type, x, y);
  if (!pc.ok) return { ok: false, reason: pc.reason || 'Case impossible' };
  C.arch.push({ type, x, y });
  return { ok: true };
}
export function removeGhost(state, x, y) {
  const C = castleState(state);
  const n = (C.arch || []).length;
  C.arch = (C.arch || []).filter((g) => !(g.x === x && g.y === y));
  return n !== C.arch.length ? { ok: true } : { ok: false, reason: 'Aucune silhouette ici' };
}
export function clearGhosts(state) { castleState(state).arch = []; return { ok: true }; }
// Silhouettes devenues impossibles (case prise, bâtiment posé ailleurs…) : retirées
export function pruneGhosts(state) {
  const C = state.castle;
  if (!C?.arch?.length) return 0;
  const taken = new Set(Object.values(state.city.buildings).map((b) => b.x + ',' + b.y));
  const n = C.arch.length;
  C.arch = C.arch.filter((g) => !taken.has(g.x + ',' + g.y));
  return n - C.arch.length;
}
// Paliers futurs de l'enceinte (rectangles, pour les dessiner en pointillé)
export function futureStages(state) {
  const cur = encStage(state);
  return ENC_STAGES.slice(cur + 1).map((st, i) => ({ index: cur + 1 + i, th: st.th, size: st.size, rect: squareRect(state, st.size) }));
}
