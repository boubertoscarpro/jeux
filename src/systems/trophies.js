// v20 « Ma forteresse » — Vitrine de la partie (module pur) : trophées gagnés d'après les statistiques, placement dans
// la cour (comme une décoration), et définitions communes des décorations et des trophées pour l'affichage.
import { TROPHY_KINDS, TROPHIES } from '../data/trophies.js';
import { COSMETICS } from '../data/social.js';
import { placementCheck } from './city.js';
import { zoneAt, rectOf, alleeTiles } from './castle.js';
import { uid } from '../core/util.js';

const blds = (s) => Object.values(s.city?.buildings || {});
// Compteur d'une sorte de trophée, lu dans l'état (aucun compteur nouveau sauf les sièges, comptés depuis la v20)
export function trophyCount(state, kind) {
  const st = state.stats || {};
  switch (kind) {
    case 'raids': return st.raidsRepelled || 0;
    case 'battles': return st.battlesWon || 0;
    case 'sieges': return st.siegesWon || 0;
    case 'breach': return st.breachWins || 0;
    case 'campaigns': return st.campaignsWon || 0;
    case 'projects': return Object.keys(state.projects?.done || {}).length;
    case 'sagas': return Object.keys(state.sagas?.done || {}).length;
    case 'clears': return st.hardClears || 0;
    default: return 0;
  }
}
export const trophyEarned = (state, key) => { const t = TROPHIES[key]; return !!t && trophyCount(state, t.kind) >= t.need; };
export const earnedTrophies = (state) => Object.keys(TROPHIES).filter((k) => trophyEarned(state, k));
export const placedTrophies = (state) => new Set(blds(state).filter((b) => b.type === 'deco' && TROPHIES[b.deco]).map((b) => b.deco));
export const trophiesToPlace = (state) => { const p = placedTrophies(state); return earnedTrophies(state).filter((k) => !p.has(k)); };
// Prochain trophée de chaque sorte (pour la vitrine : ce qu'il reste à accomplir)
export function nextTrophies(state) {
  return Object.entries(TROPHY_KINDS).map(([k, d]) => {
    const n = trophyCount(state, k);
    const i = d.tiers.findIndex((t) => n < t);
    return { kind: k, name: d.name, what: d.what, count: n, next: i < 0 ? null : d.tiers[i], done: i < 0 ? d.tiers.length : i, total: d.tiers.length };
  });
}
// Définition commune d'une décoration ou d'un trophée (nom, icône)
export const decoDef = (key) => TROPHIES[key] || COSMETICS[key] || null;
// Placer un trophée gagné dans la cour (comme une décoration)
export function placeTrophy(state, key, x, y) {
  if (!trophyEarned(state, key)) return { ok: false, reason: 'Trophée pas encore gagné' };
  if (placedTrophies(state).has(key)) return { ok: false, reason: 'Déjà placé' };
  const pc = placementCheck(state, 'house', x, y);
  if (!pc.ok) return pc;
  const id = uid('t');
  state.city.buildings[id] = { id, type: 'deco', deco: key, level: 1, x, y };
  return { ok: true, id };
}
// Pose d'office des trophées gagnés sur les cases libres de la cour (réorganisation d'une ancienne partie)
export function autoPlaceTrophies(state, max = Infinity) {
  const r = rectOf(state), out = [];
  const taken = new Set(blds(state).map((b) => b.x + ',' + b.y));
  for (const a of alleeTiles(state, r)) taken.add(a.x + ',' + a.y);
  const free = [];
  for (let y = r.y0; y <= r.y1; y++) for (let x = r.x0; x <= r.x1; x++) if (!taken.has(x + ',' + y) && state.city.terrain[y * state.city.w + x] === 'plain' && zoneAt(state, x, y, r) === 'keep') free.push([x, y]);
  // Les trophées entourent la place devant l'hôtel de ville (au plus près de l'allée)
  const g = alleeTiles(state, r)[0] || { x: (r.x0 + r.x1) / 2, y: (r.y0 + r.y1) / 2 };
  free.sort((a, b) => Math.hypot(a[0] - g.x, a[1] - g.y) - Math.hypot(b[0] - g.x, b[1] - g.y) || a[0] - b[0]);
  for (const key of trophiesToPlace(state)) {
    if (out.length >= max || !free.length) break;
    const [x, y] = free.shift();
    const id = uid('t');
    state.city.buildings[id] = { id, type: 'deco', deco: key, level: 1, x, y };
    out.push({ key, x, y });
  }
  return out;
}
