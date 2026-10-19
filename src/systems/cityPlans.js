// v17 « Clair comme le jour » — Plans de ville et réorganisation facultative (module pur).
// Un plan est un instantané { id du bâtiment → [x, y] }. On peut : l'enregistrer, le rappeler, prévisualiser ses effets
// (bâtiments mal placés, effets de zone, bonus de voisinage, risque d'incendie), l'appliquer, puis l'annuler.
// Rien n'est jamais supprimé : un bâtiment dont la place d'origine n'est plus valide reste où il est.
// Coût : celui des déménagements manuels (40 or × niveau, gratuit pendant le déménagement gratuit) ; l'annulation
// rembourse ce qui a été payé.
import { BUILDINGS } from '../data/buildings.js';
import { ZONE_FX } from '../data/castle.js';
import { zoneAt, zoneAllows, rectOf, freeMoveActive } from './castle.js';
import { placementCheck, adjacencyBonus } from './city.js';
import { fireRisk } from './hazards.js';
import { moveCost } from './construction.js';
import { pay, missing } from './economy.js';

export const PLAN_SLOTS = 3;
const blds = (s) => Object.values(s.city.buildings);
const movable = (s, b) => b.level > 0 && b.type !== 'townhall' && b.type !== 'road' && !s.queues?.build?.some((q) => q.bid === b.id);

export const snapshot = (state) => Object.fromEntries(blds(state).filter((b) => b.type !== 'road').map((b) => [b.id, [b.x, b.y]]));

// Copie légère pour l'aperçu (seules les positions changent)
function withLayout(state, layout) {
  const buildings = {};
  for (const [id, b] of Object.entries(state.city.buildings)) buildings[id] = layout[id] ? { ...b, x: layout[id][0], y: layout[id][1] } : b;
  return { ...state, city: { ...state.city, buildings } };
}

// Validité d'une disposition complète : chaque bâtiment déplacé tient sur sa case (terrain, zone, rivière), sans doublon
export function checkLayout(state, layout) {
  const sim = withLayout(state, layout);
  const seen = new Map();
  for (const b of blds(sim)) { const k = b.x + ',' + b.y; if (seen.has(k)) return { ok: false, reason: `Deux bâtiments sur la case (${b.x}, ${b.y})` }; seen.set(k, b.id); }
  for (const [id, [x, y]] of Object.entries(layout)) {
    const b0 = state.city.buildings[id];
    if (!b0 || (b0.x === x && b0.y === y)) continue;
    const { [id]: self, ...rest } = sim.city.buildings;
    const pc = placementCheck({ ...sim, city: { ...sim.city, buildings: rest } }, b0.type, x, y);
    if (!pc.ok) return { ok: false, reason: `${BUILDINGS[b0.type].name} : ${pc.reason}` };
  }
  return { ok: true };
}

// Déplacements réels entre l'état et une disposition (seulement les bâtiments qui bougent et peuvent bouger)
export function movesTo(state, layout) {
  const out = [];
  for (const [id, [x, y]] of Object.entries(layout)) {
    const b = state.city.buildings[id];
    if (!b || (b.x === x && b.y === y) || !movable(state, b)) continue;
    out.push({ id, type: b.type, from: [b.x, b.y], to: [x, y] });
  }
  return out;
}
export const movesCost = (state, moves) => (freeMoveActive(state) ? 0 : moves.reduce((a, m) => a + (state.city.buildings[m.id].deco ? 0 : moveCost(state.city.buildings[m.id]).gold), 0));

// Effets d'une disposition (pour l'aperçu) : mal placés, effets de zone positifs/négatifs, voisinage, risque d'incendie
export function evaluate(state, layout = null, mods = {}) {
  const s = layout ? withLayout(state, layout) : state;
  let misplaced = 0, zonePlus = 0, zoneMinus = 0, adjacency = 0, fireHigh = 0;
  for (const b of blds(s)) {
    if (!BUILDINGS[b.type] || b.type === 'road' || b.type === 'deco') continue;
    const z = zoneAt(s, b.x, b.y);
    if (b.type !== 'townhall' && !zoneAllows(b.type, z)) misplaced++;
    const fx = ZONE_FX[b.type]?.[z];
    if (fx) { if ((fx.prod || 0) < 0) zoneMinus++; else zonePlus++; }
    adjacency += adjacencyBonus(s, b.type, b.x, b.y, mods).total || 0;
    if (fireRisk(s, b) >= 0.5) fireHigh++;
  }
  return { misplaced, zonePlus, zoneMinus, adjacency: Math.round(adjacency * 100), fireHigh };
}

// Réorganisation proposée : 1) les bâtiments mal placés vont sur la case valide la plus proche ; 2) maisons, marché,
// taverne et maison de guilde quittent la cour (−10 %) pour les faubourgs (+5 à +10 %) ; 3) entrepôt, caserne et
// écurie entrent dans la cour (protection, formation) s'il y a de la place. Rien d'autre ne bouge.
const TO_FAUBOURG = ['house', 'market', 'tavern', 'guildhall'];
const TO_KEEP = ['warehouse', 'barracks', 'stable'];
export function reorgPlan(state) {
  const layout = snapshot(state);
  const taken = new Set(Object.values(layout).map(([x, y]) => x + ',' + y));
  const r = rectOf(state);
  const tiles = [];
  for (let y = 0; y < state.city.h; y++) for (let x = 0; x < state.city.w; x++) if (state.city.terrain[y * state.city.w + x] === 'plain') tiles.push([x, y]);
  const free = (type, want, near) => {
    let best = null, bd = Infinity;
    for (const [x, y] of tiles) {
      if (taken.has(x + ',' + y)) continue;
      const z = zoneAt(state, x, y, r);
      if (!zoneAllows(type, z) || (want && z !== want)) continue;
      if (BUILDINGS[type].place === 'river') { const sim = { ...state, city: { ...state.city, buildings: {} } }; if (!placementCheck(sim, type, x, y).ok) continue; }
      const d = Math.hypot(x - near[0], y - near[1]);
      if (d < bd) { bd = d; best = [x, y]; }
    }
    return best;
  };
  const move = (b, to) => { taken.delete(layout[b.id].join(',')); layout[b.id] = to; taken.add(to.join(',')); };
  const list = blds(state).filter((b) => movable(state, b) && BUILDINGS[b.type]).sort((a, b) => b.level - a.level || (a.id < b.id ? -1 : 1));
  for (const b of list) if (!zoneAllows(b.type, zoneAt(state, b.x, b.y, r))) { const t = free(b.type, null, [b.x, b.y]); if (t) move(b, t); }
  for (const b of list) if (TO_FAUBOURG.includes(b.type) && zoneAt(state, ...layout[b.id], r) === 'keep') { const t = free(b.type, 'faubourg', layout[b.id]); if (t) move(b, t); }
  const center = [(r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2];
  for (const b of list) if (TO_KEEP.includes(b.type) && zoneAt(state, ...layout[b.id], r) !== 'keep') { const t = free(b.type, 'keep', center); if (t) move(b, t); }
  return layout;
}

// Application : vérifie, paie, déplace, et garde de quoi annuler
export function applyLayout(state, layout, now = Date.now(), label = 'plan') {
  const chk = checkLayout(state, layout);
  if (!chk.ok) return chk;
  const moves = movesTo(state, layout);
  if (!moves.length) return { ok: false, reason: 'Aucun bâtiment à déplacer' };
  const gold = movesCost(state, moves);
  if (gold && !pay(state, { gold })) return { ok: false, reason: 'Pas assez d’or', missing: missing(state, { gold }) };
  const before = Object.fromEntries(moves.map((m) => [m.id, m.from]));
  for (const m of moves) { const b = state.city.buildings[m.id]; b.x = m.to[0]; b.y = m.to[1]; }
  (state.cityPlans ||= { saved: [], undo: null }).undo = { at: now, layout: before, gold, label };
  return { ok: true, moved: moves.length, gold };
}
export function undoLayout(state) {
  const u = state.cityPlans?.undo;
  if (!u) return { ok: false, reason: 'Rien à annuler' };
  const target = { ...snapshot(state), ...u.layout };
  const chk = checkLayout(state, target);
  if (!chk.ok) return { ok: false, reason: `Annulation impossible : ${chk.reason}` };
  for (const [id, [x, y]] of Object.entries(u.layout)) { const b = state.city.buildings[id]; if (b) { b.x = x; b.y = y; } }
  if (u.gold) state.resources.gold = (state.resources.gold || 0) + u.gold;
  state.cityPlans.undo = null;
  return { ok: true, refunded: u.gold };
}

// Conflits (une case visée par deux bâtiments, ou occupée par un bâtiment bâti depuis) : le bâtiment déplacé reste
// à sa place actuelle, jusqu'à ce qu'il n'y ait plus de conflit (les places actuelles sont toutes distinctes)
export function settle(state, layout) {
  for (let guard = 0; guard < 200; guard++) {
    const at = new Map();
    let changed = false;
    for (const [id, [x, y]] of Object.entries(layout)) { const k = x + ',' + y; if (!at.has(k)) at.set(k, []); at.get(k).push(id); }
    for (const ids of at.values()) {
      if (ids.length < 2) continue;
      for (const id of ids) { const b = state.city.buildings[id]; if (b && (layout[id][0] !== b.x || layout[id][1] !== b.y)) { layout[id] = [b.x, b.y]; changed = true; } }
    }
    if (!changed) break;
  }
  // Une place devenue invalide (zone, terrain) : le bâtiment reste où il est
  for (const id of Object.keys(layout)) { const b = state.city.buildings[id]; if (!b || (layout[id][0] === b.x && layout[id][1] === b.y)) continue; const one = { ...snapshot(state), [id]: layout[id] }; if (!checkLayout(state, one).ok) layout[id] = [b.x, b.y]; }
  return layout;
}

// Plans enregistrés (3 emplacements)
export function savePlan(state, slot, name, now = Date.now()) {
  if (slot < 0 || slot >= PLAN_SLOTS) return { ok: false, reason: 'Emplacement inconnu' };
  const P = (state.cityPlans ||= { saved: [], undo: null });
  P.saved[slot] = { name: String(name || `Plan ${slot + 1}`).slice(0, 24), at: now, layout: snapshot(state) };
  return { ok: true };
}
// Rappel : on ne garde que les bâtiments qui existent encore ; un bâtiment bâti depuis reste à sa place
export function recallLayout(state, slot) {
  const p = state.cityPlans?.saved?.[slot];
  if (!p) return null;
  const layout = snapshot(state);
  for (const [id, pos] of Object.entries(p.layout)) if (layout[id] && state.city.buildings[id] && movable(state, state.city.buildings[id])) layout[id] = pos;
  return settle(state, layout);
}
