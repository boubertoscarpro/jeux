// v25 « Le monde en fête et en guerre » — Géographie des événements sur la carte du monde 128 × 128.
// Les cibles d'un événement ne vivent plus sur une carte à part : elles sont posées sur le vrai monde, en anneaux
// autour de la capitale et des avant-postes, comme les camps nomades du genre : faibles près de chez soi, plus fortes
// (et plus rentables) en s'éloignant, forteresses et boss au plus loin. Ce module ne fait que de la géométrie
// déterministe (placement, distances, trajets, déplacements) ; les règles restent dans systems/liveEvents.js.
import { mulberry32 } from '../core/rng.js';
import { SECONDS_PER_TILE } from '../data/world.js';
import { key, wTerrain } from './world.js';

export const EVENT_REACH_MAX = 24;   // distance maximale d'une cible à sa base (cases)
export const EVENT_VISIBLE_MAX = 24; // cibles d'événement visibles en même temps sur la carte
export const EVENT_SPACING = 2;      // écart minimal entre deux cibles (cases, distance de Tchebychev)
export const FAR_TYPES = ['fortress', 'boss', 'lair'];
const BLOCKED = ['river', 'mountain'];

// Graine 32 bits stable à partir de plusieurs valeurs
export function hash32(...parts) {
  let h = 2166136261 >>> 0;
  for (const p of parts) for (const ch of String(p)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; }
  return h >>> 0;
}

// Points de départ : la capitale puis les avant-postes (les 4 plus proches de la capitale)
export function eventBases(state) {
  const w = state.world, c = w.capital;
  const out = [{ key: 'capital', name: 'la capitale', x: c.x, y: c.y }];
  const ts = Object.entries(state.territories || {}).map(([k, t]) => ({ key: k, name: t.name || 'Avant-poste', x: t.x, y: t.y, d: Math.hypot(t.x - c.x, t.y - c.y) }))
    .sort((a, b) => a.d - b.d).slice(0, 4);
  for (const t of ts) out.push({ key: t.key, name: t.name, x: t.x, y: t.y });
  return out;
}
export const baseByKey = (state, k) => eventBases(state).find((b) => b.key === k) || null;
export function nearestBase(state, x, y) {
  let best = null, bd = Infinity;
  for (const b of eventBases(state)) { const d = Math.hypot(b.x - x, b.y - y); if (d < bd) { bd = d; best = b; } }
  return best;
}

// Anneau d'une cible selon son type et son palier (I à VII) : 4-8 cases au palier I, 22-24 au palier VII
export function ringFor(type, tier = 1) {
  if (FAR_TYPES.includes(type)) return [18, EVENT_REACH_MAX];
  if (type === 'bastion') return [4, 7];
  if (['treasure', 'riddle', 'hearth', 'village', 'vein', 'vent', 'trace'].includes(type)) return [6, 18];
  const t = Math.max(1, Math.min(7, tier || 1));
  return [4 + (t - 1) * 3, Math.min(EVENT_REACH_MAX, 8 + (t - 1) * 3)];
}

// Une cible (non retirée) occupe-t-elle une case trop proche ?
export function tooClose(cur, x, y, exceptId = null, gap = EVENT_SPACING) {
  return (cur.map.targets || []).some((t) => !t.gone && t.id !== exceptId && Math.max(Math.abs(t.x - x), Math.abs(t.y - y)) < gap);
}

// Case utilisable par une cible : dans le monde, terrain permis, ni lieu, ni territoire, ni capitale, ni lave, à
// distance des autres cibles. o.allow : terrains autorisés (sinon tout sauf rivière et montagne) ; o.hidden : la case
// doit être encore dans le brouillard (ruines cachées) ; o.mover : cible mobile (on ignore l'écart avec elle-même).
export function tileOk(state, cur, x, y, o = {}) {
  const w = state.world, S = w.size;
  if (x < 1 || y < 1 || x >= S - 1 || y >= S - 1) return false;
  const ter = wTerrain(w, x, y);
  if (o.allow ? !o.allow.includes(ter) : BLOCKED.includes(ter)) return false;
  if (w.pois[key(x, y)] || state.territories?.[key(x, y)]) return false;
  if (x === w.capital.x && y === w.capital.y) return false;
  if (cur.map.lava?.includes(y * S + x)) return false;
  if (o.hidden && w.revealed[y * S + x]) return false;
  if (tooClose(cur, x, y, o.self || null, o.gap ?? EVENT_SPACING)) return false;
  if (o.need && !o.need(x, y)) return false;
  return true;
}

// Cherche une case pour une cible : autour d'un centre (o.center, o.ring) ou d'une base tirée au sort (capitale ×3,
// chaque avant-poste ×1), à une distance de l'anneau du palier. Déterministe : même graine, même tirage.
export function placeTarget(state, cur, type, tier, o = {}) {
  const m = cur.map;
  const r = mulberry32(hash32(cur.seed, cur.key, 'place', m.spawnN = (m.spawnN || 0) + 1));
  const bases = eventBases(state);
  const weights = bases.map((b, i) => (i === 0 ? 3 : 1));
  const total = weights.reduce((a, b) => a + b, 0);
  let [dMin, dMax] = o.ring || ringFor(type, tier);
  for (let widen = 0; widen < 4; widen++) {
    for (let k = 0; k < 90; k++) {
      let c = o.center;
      if (!c) { let v = r() * total, i = 0; while ((v -= weights[i]) > 0 && i < bases.length - 1) i++; c = bases[i]; }
      const a = r() * Math.PI * 2, d = dMin + r() * (dMax - dMin);
      const x = Math.round(c.x + Math.cos(a) * d), y = Math.round(c.y + Math.sin(a) * d);
      if (tileOk(state, cur, x, y, o)) return { x, y };
    }
    dMin = Math.max(2, dMin - 2); dMax += 3; // élargit l'anneau si la région est encombrée
  }
  return null;
}

// Révèle une case et ses voisines (la cible n'a pas à être découverte pour être vue, sauf les ruines cachées)
export function revealAt(world, x, y, rad = 1) {
  for (let dy = -rad; dy <= rad; dy++) for (let dx = -rad; dx <= rad; dx++) {
    const xx = x + dx, yy = y + dy;
    if (xx >= 0 && yy >= 0 && xx < world.size && yy < world.size) world.revealed[yy * world.size + xx] = 1;
  }
}

// Longueur du trajet a → b à l'intérieur d'un disque (front de neige)
export function insideDisk(a, b, c, rad) {
  if (!c || !(rad > 0)) return 0;
  const n = 24;
  let inside = 0;
  for (let i = 0; i < n; i++) { const f = (i + 0.5) / n; if (Math.hypot(a.x + (b.x - a.x) * f - c.x, a.y + (b.y - a.y) * f - c.y) <= rad) inside++; }
  return (inside / n) * Math.hypot(b.x - a.x, b.y - a.y);
}

// Durée d'une marche d'événement (ms) : vrais trajets du monde × coefficient d'événement ; la neige ralentit de 25 %
export function eventTravelMs(cur, from, x, y, speed, mult = 4) {
  const d = Math.max(1, Math.hypot(x - from.x, y - from.y));
  const frost = cur?.map?.frost;
  const slow = frost ? insideDisk(from, { x, y }, frost, frost.r) * 0.25 : 0;
  return ((d + slow) * SECONDS_PER_TILE * 1000 * mult) / Math.max(0.1, speed);
}

// Fait avancer une cible mobile vers dest de `step` cases ; elle ne s'arrête que sur une case permise
export function stepToward(t, dest, step, ok) {
  const fx = t.fx ?? t.x, fy = t.fy ?? t.y;
  const dx = dest.x - fx, dy = dest.y - fy, d = Math.hypot(dx, dy);
  if (d <= step) { if (ok(dest.x, dest.y) || (dest.x === t.x && dest.y === t.y)) { t.x = dest.x; t.y = dest.y; t.fx = t.x; t.fy = t.y; return true; } return false; }
  const nx = fx + (dx / d) * step, ny = fy + (dy / d) * step;
  const rx = Math.round(nx), ry = Math.round(ny);
  t.fx = nx; t.fy = ny;
  if ((rx !== t.x || ry !== t.y) && ok(rx, ry)) { t.x = rx; t.y = ry; }
  return false;
}
