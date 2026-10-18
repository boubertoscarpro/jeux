// v16 « Le Château » — Lieux du royaume (module pur) : pose des nouveaux lieux quand leur fonction s'ouvre, lieu d'un
// écran, bâtiment ou terrain vague qui le représente. Aucune production, aucun effet : de simples points d'accès.
import { PLACES, SCREEN_PLACE, NEW_PLACES } from '../data/places.js';
import { BUILDINGS } from '../data/buildings.js';
import { rectOf, zoneAt, zoneAllows } from './castle.js';

const blds = (s) => Object.values(s.city?.buildings || {});
const thOf = (s) => blds(s).reduce((m, b) => (b.type === 'townhall' ? Math.max(m, b.level) : m), 0);

// Une condition de pose est-elle remplie ?
export function condMet(state, c = {}) {
  if (c.any) return c.any.some((x) => condMet(state, x));
  if (c.th && thOf(state) < c.th) return false;
  if (c.automation && (state.automation?.level || 0) < c.automation) return false;
  return true;
}
export const placeUnlocked = (state, key) => condMet(state, NEW_PLACES[key]?.cond || {});

// Case libre pour un lieu : dans les faubourgs de préférence, près de la porte, jamais sur des décombres
export function freeTileFor(state, type) {
  const r = rectOf(state), W = state.city.w, H = state.city.h;
  const taken = new Set(blds(state).map((b) => b.x + ',' + b.y));
  for (const q of state.queues?.build || []) if (q.kind === 'clear') taken.add(q.x + ',' + q.y);
  const gate = { x: Math.floor((r.x0 + r.x1) / 2), y: r.y1 + 1 };
  // Les lieux s'espacent d'une case (leurs noms ne se chevauchent pas), tant que c'est possible
  const near = new Set();
  for (const b of blds(state)) if (BUILDINGS[b.type]?.isPlace) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) near.add((b.x + dx) + ',' + (b.y + dy));
  let best = null, bd = Infinity;
  for (let pass = 0; pass < 2 && !best; pass++) {
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (taken.has(x + ',' + y) || state.city.terrain[y * W + x] !== 'plain') continue;
      if (x === gate.x && y <= gate.y + 1) continue; // le chemin devant la porte reste libre
      // Première passe : second anneau des faubourgs (le premier longe la muraille et ses douves dessinées), espacés
      const ring = Math.max(r.x0 - x, x - r.x1, r.y0 - y, y - r.y1);
      if (pass === 0 && (near.has(x + ',' + y) || ring < 2)) continue; // ni contre la muraille, sous l'inscription de la porte
      const z = zoneAt(state, x, y, r);
      if (!zoneAllows(type, z) || (pass === 0 && z !== 'faubourg')) continue;
      const d = Math.hypot(x - gate.x, y - gate.y) + x * 1e-4 + y * 1e-6;
      if (d < bd) { bd = d; best = { x, y }; }
    }
  }
  return best;
}

// Pose les nouveaux lieux dont la fonction est ouverte (nouvelle partie, ancienne partie, au fil de la progression).
// Renvoie la liste des lieux posés.
export function ensurePlaces(state) {
  const out = [];
  if (!state.city?.buildings) return out;
  for (const key of Object.keys(NEW_PLACES)) {
    const type = PLACES[key].type;
    if (blds(state).some((b) => b.type === type) || !placeUnlocked(state, key)) continue;
    const t = freeTileFor(state, type);
    if (!t) continue;
    const id = `p_${type}`;
    state.city.buildings[id] = { id, type, level: 1, x: t.x, y: t.y };
    out.push({ key, type, x: t.x, y: t.y, name: BUILDINGS[type].name });
  }
  return out;
}

// Lieu d'un écran, et son bâtiment s'il existe (le plus haut niveau)
export const placeOf = (viewId) => SCREEN_PLACE[viewId] || null;
export function placeBuilding(state, placeKey) {
  const p = PLACES[placeKey];
  if (!p || p.kind !== 'building') return null;
  return blds(state).filter((b) => b.type === p.type && b.level > 0).sort((a, b) => b.level - a.level)[0] || null;
}
// Tous les lieux (bâtiments) qui mènent à un écran
export const placesOfScreen = (viewId) => Object.entries(PLACES).filter(([, p]) => p.screens.includes(viewId)).map(([k]) => k);
// Types de bâtiments qui sont le lieu PRINCIPAL d'au moins un écran (les terrains vagues ne montrent que ceux-là)
export const PRIMARY_PLACE_TYPES = [...new Set(Object.values(SCREEN_PLACE).map((k) => PLACES[k]).filter((p) => p.kind === 'building' && !BUILDINGS[p.type]?.isPlace).map((p) => p.type))];
