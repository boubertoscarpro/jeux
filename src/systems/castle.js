// v16 — « Le Château et ses Faubourgs » (module pur, sans DOM) : zones concentriques du royaume, enceinte et son
// périmètre, raids par zone, dégâts et réparation de la muraille, flancs de défense, décorations utiles, paliers de
// silhouette, terrains vagues (bâtiments « menu » pas encore construits) et migration des anciennes parties.
// Les chiffres de défense de base restent ceux de la muraille (`wall`) et des douves (`moat`) : ce module ne fait que
// les moduler (périmètre, dégâts) par le modificateur existant `wall.pct`.
import {
  ZONES, FAUBOURG_DEPTH, MOAT_RING, KEEP_ONLY, COUNTRY_ONLY, OUTSIDE_ONLY, ZONE_RULE_TEXT, ZONE_FX, ZONE_FX_CAP, ENCEINTE, ENC_STAGES, SIEGE,
  MOAT_FLOOD, FLANKS, ASSAULT_FLANKS, FLANK_RULES, DEFENSE_TOOLS, DECO_FX, CASTLE_STAGES, WALL_STYLES, BUILDING_SCREENS, LOT_TYPES, FAMILIES, FAMILY_OF,
} from '../data/castle.js';
import { BUILDINGS } from '../data/buildings.js';
import { PLACES, SCREEN_PLACE } from '../data/places.js';

const H = 3600000;
export const fortLevel = (state, k) => state.city?.fort?.[k] || 0;
const thOf = (state) => Object.values(state.city?.buildings || {}).reduce((m, b) => (b.type === 'townhall' ? Math.max(m, b.level) : m), 0);
const blds = (state) => Object.values(state.city?.buildings || {});

// ───────── Enceinte ─────────
export function castleState(state) {
  const C = state.castle && typeof state.castle === 'object' ? state.castle : (state.castle = {});
  if (!validRect(C.rect)) C.rect = defaultRect(state);
  C.wallDmg = Math.max(0, Math.min(1, Number(C.wallDmg) || 0));
  if (!C.flanks || typeof C.flanks !== 'object') C.flanks = { left: 0.25, front: 0.25, right: 0.25, yard: 0.25 };
  if (!C.tools || typeof C.tools !== 'object') C.tools = {};
  C.stage = Number.isFinite(C.stage) ? C.stage : stageIndex(thOf(state));
  C.freeMoveUntil = Number(C.freeMoveUntil) || 0;
  C.stats ||= { enlarged: 0, breaches: 0, held: 0, repaired: 0 };
  if (!Number.isFinite(C.enc)) C.enc = encFromRect(C.rect);
  if (!Array.isArray(C.history)) C.history = [];
  return C;
}
// Palier d'enceinte correspondant à un rectangle (le plus grand palier qu'il contient)
function encFromRect(r) {
  const side = Math.min(rectW(r), rectH(r));
  let k = 0;
  ENC_STAGES.forEach((st, i) => { if (side >= st.size) k = i; });
  return k;
}
const validRect = (r) => r && [r.x0, r.y0, r.x1, r.y1].every(Number.isFinite) && r.x1 >= r.x0 && r.y1 >= r.y0;
const townhall = (state) => blds(state).find((b) => b.type === 'townhall') || { x: Math.floor((state.city?.w || 24) / 2), y: Math.floor((state.city?.h || 16) / 2) };
function clampRect(state, r) {
  const W = state.city.w, Hh = state.city.h;
  const w = Math.min(r.x1 - r.x0, W - 1), h = Math.min(r.y1 - r.y0, Hh - 1);
  let x0 = Math.max(0, Math.min(W - 1 - w, r.x0)), y0 = Math.max(0, Math.min(Hh - 1 - h, r.y0));
  return { x0, y0, x1: x0 + w, y1: y0 + h };
}
export function defaultRect(state) { return squareRect(state, ENCEINTE.start); }
// Carré de côté n centré sur l'hôtel de ville, gardé dans le domaine (avec la place des douves si possible)
export function squareRect(state, n) {
  const t = townhall(state), lo = Math.floor((n - 1) / 2);
  const W = state.city?.w || 24, Hh = state.city?.h || 16, m = MOAT_RING;
  const fit = (c, size, max) => Math.max(Math.min(m, max - size), Math.min(c, max - size - Math.min(m, max - size)));
  const x0 = fit(t.x - lo, n, W), y0 = fit(t.y - lo, n, Hh);
  return clampRect(state, { x0, y0, x1: x0 + n - 1, y1: y0 + n - 1 });
}
export const rectOf = (state) => (validRect(state.castle?.rect) ? state.castle.rect : defaultRect(state));
export const rectW = (r) => r.x1 - r.x0 + 1;
export const rectH = (r) => r.y1 - r.y0 + 1;
export const perimeter = (r) => 2 * (rectW(r) + rectH(r));
export const maxDims = (state) => { const n = ENC_STAGES[maxEncStage(state)].size; return { w: Math.min(state.city.w, n), h: Math.min(state.city.h, n) }; };
// ───────── Paliers d'agrandissement (v20) ─────────
export const encStage = (state) => (Number.isFinite(state.castle?.enc) ? state.castle.enc : encFromRect(rectOf(state)));
export function maxEncStage(state) { const th = thOf(state); let k = 0; ENC_STAGES.forEach((st, i) => { if (th >= st.th) k = i; }); return k; }
export const nextEncStage = (state) => (encStage(state) + 1 < ENC_STAGES.length ? { index: encStage(state) + 1, ...ENC_STAGES[encStage(state) + 1] } : null);
// Porte (milieu du bord sud, dans l'axe de l'hôtel de ville) et allée pavée de la porte à l'hôtel de ville (laissée libre)
export function gateOf(state, r = rectOf(state)) {
  const t = townhall(state);
  return { x: Math.max(r.x0, Math.min(r.x1, t.x)), y: r.y1 };
}
export function alleeTiles(state, r = rectOf(state)) {
  const t = townhall(state), g = gateOf(state, r), out = [];
  if (t.x !== g.x) return out;
  for (let y = t.y + 1; y <= r.y1; y++) out.push({ x: g.x, y });
  return out;
}
export const isAllee = (state, x, y, r = rectOf(state)) => alleeTiles(state, r).some((a) => a.x === x && a.y === y);
// Capacité de la cour : cases du carré, moins l'hôtel de ville et l'allée
export const keepCapacity = (n) => n * n - 1 - Math.ceil(n / 2);
export const isCityType = (type) => KEEP_ONLY.includes(type);
export const familyOf = (type) => FAMILY_OF[type] || (COUNTRY_ONLY.includes(type) ? 'economy' : 'places');

// ───────── Zones ─────────
export function zoneAt(state, x, y, r = rectOf(state)) {
  if (x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1) return 'keep';
  const d = Math.max(r.x0 - x, 0, x - r.x1, r.y0 - y, 0, y - r.y1);
  return d <= MOAT_RING ? 'moat' : d <= FAUBOURG_DEPTH ? 'faubourg' : 'country';
}
export const inKeep = (state, x, y, r) => zoneAt(state, x, y, r) === 'keep';
export function ruleOf(type) {
  if (KEEP_ONLY.includes(type)) return 'keep';
  if (COUNTRY_ONLY.includes(type)) return 'country';
  if (OUTSIDE_ONLY.includes(type)) return 'outside';
  return 'any';
}
export function zoneAllows(type, zone) {
  if (zone === 'moat') return false;
  const r = ruleOf(type);
  if (r === 'keep') return zone === 'keep';
  if (r === 'country') return zone === 'country';
  if (r === 'outside') return zone !== 'keep';
  return true;
}
export const ruleText = (type) => ZONE_RULE_TEXT[ruleOf(type)];
// Vérification de zone pour un placement (construction, déménagement)
export function zoneCheck(state, type, x, y) {
  if (!BUILDINGS[type] || BUILDINGS[type].grid === false || type === 'road' || type === 'townhall') return { ok: true };
  const z = zoneAt(state, x, y);
  if (z === 'keep' && isAllee(state, x, y)) return { ok: false, reason: 'L’allée de la porte reste libre.', zone: z };
  if (zoneAllows(type, z)) return { ok: true, zone: z };
  const r = ruleOf(type);
  const reason = z === 'moat' ? 'On ne bâtit pas sur les douves ni sur le glacis, au pied de la muraille.'
    : r === 'keep' ? (keepFree(state) ? 'Ce bâtiment se construit dans les murs, dans la ville fortifiée.' : `La ville fortifiée est pleine : agrandissez l’enceinte${nextEncStage(state) ? ` (hôtel de ville ${nextEncStage(state).th})` : ''}.`)
      : r === 'country' ? 'Ce bâtiment de campagne se construit hors les murs.'
        : 'Ce bâtiment se construit hors les murs.';
  return { ok: false, reason, zone: z };
}
// Cases libres et constructibles de la cour (hors allée)
export function keepFree(state, r = rectOf(state)) {
  const taken = new Set(blds(state).map((b) => b.x + ',' + b.y));
  let n = 0;
  for (let y = r.y0; y <= r.y1; y++) for (let x = r.x0; x <= r.x1; x++) if (!taken.has(x + ',' + y) && state.city.terrain[y * state.city.w + x] === 'plain' && !isAllee(state, x, y, r)) n++;
  return n;
}
// Bâtiments mal placés au regard des règles (anciennes parties) : ils restent actifs
export const misplaced = (state) => blds(state).filter((b) => b.level >= 0 && BUILDINGS[b.type] && !zoneAllows(b.type, zoneAt(state, b.x, b.y)) && b.type !== 'townhall');
export const freeMoveActive = (state, now = Date.now()) => (state.castle?.freeMoveUntil || 0) > now;

// Effet de zone d'un bâtiment (texte et chiffres) ; null si aucun
export function zoneFx(state, b) {
  const fx = ZONE_FX[b.type]?.[zoneAt(state, b.x, b.y)];
  return fx || null;
}
export const zoneProdBonus = (state, b) => zoneFx(state, b)?.prod || 0;

// ───────── Périmètre et défense ─────────
export function wallFactor(state) {
  const p = perimeter(rectOf(state));
  return Math.max(ENCEINTE.factorMin, Math.min(ENCEINTE.factorMax, 1 + ENCEINTE.perPerimeter * (ENCEINTE.refPerimeter - p)));
}
// Modificateurs du château (fusionnés par computeMods) : facteur de périmètre et dégâts de la muraille sur `wall.pct`,
// effets de zone bornés, décorations utiles bornées
export function castleMods(state) {
  const m = {};
  if (fortLevel(state, 'wall') > 0 || fortLevel(state, 'moat') > 0) {
    const pct = (wallFactor(state) - 1) - SIEGE.dmgPenalty * (state.castle?.wallDmg || 0);
    if (pct) m['wall.pct'] = Math.round(pct * 1000) / 1000;
  }
  for (const b of blds(state)) {
    if (b.level <= 0) continue;
    const fx = zoneFx(state, b);
    if (fx?.mods) for (const [k, v] of Object.entries(fx.mods)) m[k] = Math.min(ZONE_FX_CAP[k] ?? Infinity, (m[k] || 0) + v);
  }
  const d = decoEffects(state);
  for (const [k, v] of Object.entries(d.mods)) m[k] = (m[k] || 0) + v;
  return m;
}

// ───────── Agrandissements (v20) ─────────
// Le carré grandit d'une rangée et d'une colonne par palier, du côté qui a le plus de place (il contient toujours
// l'ancienne enceinte : rien de ce qui était dans les murs n'en sort)
function growRect(state, r, n) {
  const W = state.city.w, Hh = state.city.h, m = MOAT_RING;
  const out = { ...r };
  const axis = (lo, hi, max) => {
    while (out[hi] - out[lo] + 1 < n) {
      const roomLo = out[lo] - m, roomHi = max - 1 - m - out[hi];
      if (roomHi >= roomLo && out[hi] < max - 1) out[hi]++;
      else if (out[lo] > 0) out[lo]--;
      else if (out[hi] < max - 1) out[hi]++;
      else break;
    }
  };
  axis('x0', 'x1', W); axis('y0', 'y1', Hh);
  return out;
}
// Cases de l'anneau des douves autour d'un rectangle
const inRing = (r, x, y) => { const d = Math.max(r.x0 - x, 0, x - r.x1, r.y0 - y, 0, y - r.y1); return d >= 1 && d <= MOAT_RING; };
const inRect = (r, x, y) => x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1;
// Le chantier aplanit la cour et le glacis : forêt, montagne et bras de rivière deviennent des cases libres (les décombres
// restent : on les déblaie, c'est le premier geste d'une partie)
function flatten(state, r) {
  const W = state.city.w, T = state.city.terrain, changed = [];
  for (let y = Math.max(0, r.y0 - MOAT_RING); y <= Math.min(state.city.h - 1, r.y1 + MOAT_RING); y++) {
    for (let x = Math.max(0, r.x0 - MOAT_RING); x <= Math.min(W - 1, r.x1 + MOAT_RING); x++) {
      const i = y * W + x;
      if (T[i] !== 'plain' && T[i] !== 'rubble') { changed.push([i, T[i]]); T[i] = 'plain'; }
    }
  }
  return changed;
}
// Case libre la plus proche pour un bâtiment, dans la zone voulue (keep : dans les murs ; out : dehors)
function nearestFree(state, type, from, where, r, taken) {
  const W = state.city.w, Hh = state.city.h, def = BUILDINGS[type] || {};
  const allee = new Set(alleeTiles(state, r).map((a) => a.x + ',' + a.y));
  let best = null, bd = Infinity;
  for (let y = 0; y < Hh; y++) for (let x = 0; x < W; x++) {
    const k = x + ',' + y;
    if (taken.has(k) || state.city.terrain[y * W + x] !== 'plain' || allee.has(k)) continue;
    const z = zoneAt(state, x, y, r);
    if (where === 'keep' ? z !== 'keep' : (z === 'keep' || z === 'moat' || !zoneAllows(type, z))) continue;
    if (def.place === 'river') {
      let ok = false;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy; if (nx >= 0 && ny >= 0 && nx < W && ny < Hh && state.city.terrain[ny * W + nx] === 'river') ok = true; }
      if (!ok) continue;
    }
    const d = Math.hypot(x - from[0], y - from[1]) + x * 1e-4 + y * 1e-6;
    if (d < bd) { bd = d; best = [x, y]; }
  }
  return best;
}
// Fait sortir des murs, des douves et de l'allée ce qui n'y a pas sa place (bâtiments de campagne, chantiers exceptés)
function relocateOut(state, r, moves) {
  const taken = new Set(blds(state).map((b) => b.x + ',' + b.y));
  const allee = new Set(alleeTiles(state, r).map((a) => a.x + ',' + a.y));
  const busy = new Set((state.queues?.build || []).map((q) => q.bid));
  for (const b of blds(state)) {
    if (b.type === 'townhall' || busy.has(b.id)) continue;
    const z = zoneAt(state, b.x, b.y, r);
    const onAllee = allee.has(b.x + ',' + b.y);
    if (!onAllee && (z === 'keep' ? zoneAllows(b.type, 'keep') || ruleOf(b.type) === 'any' : z !== 'moat')) continue;
    const where = isCityType(b.type) || (onAllee && ruleOf(b.type) !== 'country') ? 'keep' : 'out';
    const to = nearestFree(state, b.type, [b.x, b.y], where, r, taken) || (where === 'keep' ? nearestFree(state, b.type, [b.x, b.y], 'out', r, taken) : null);
    if (!to) continue;
    taken.delete(b.x + ',' + b.y); taken.add(to.join(','));
    moves.push({ id: b.id, from: [b.x, b.y], to });
    b.x = to[0]; b.y = to[1];
  }
}
export function enlargePreview(state) {
  const nx = nextEncStage(state);
  if (!nx) return { ok: false, reason: 'Enceinte à sa taille maximale' };
  if (thOf(state) < nx.th) return { ok: false, reason: `Hôtel de ville niv. ${nx.th} requis`, next: nx };
  const r = rectOf(state), n = growRect(state, r, nx.size);
  if (rectW(n) < nx.size || rectH(n) < nx.size) return { ok: false, reason: 'Bord du domaine atteint : agrandissez le domaine' };
  const leaving = blds(state).filter((b) => b.type !== 'townhall' && !inRect(r, b.x, b.y) && (inRect(n, b.x, b.y) || inRing(n, b.x, b.y)) && !(isCityType(b.type) && inRect(n, b.x, b.y)));
  const entering = blds(state).filter((b) => isCityType(b.type) && !inRect(r, b.x, b.y) && inRect(n, b.x, b.y));
  return { ok: true, rect: n, cost: { ...nx.cost }, size: nx.size, stage: nx.index, th: nx.th, moving: leaving.length, entering: entering.length, perimeter: perimeter(n), factor: 1, trapped: [] };
}
// Agrandir l'enceinte d'un palier. pay(cost) → bool ; free : offert (agrandissement du domaine)
export function enlargeEnceinte(state, _side, pay, now = Date.now()) {
  if (typeof _side === 'function') { now = pay ?? now; pay = _side; }
  const C = castleState(state);
  const p = enlargePreview(state);
  if (!p.ok) return p;
  if (!pay(p.cost)) return { ok: false, reason: 'Ressources insuffisantes' };
  const before = { ...C.rect };
  C.rect = p.rect; C.enc = p.stage; C.stats.enlarged++;
  flatten(state, p.rect);
  const moves = [];
  relocateOut(state, p.rect, moves);
  C.history.push({ t: now, rect: { ...p.rect }, enc: p.stage });
  C.lastGrow = { t: now, from: before, to: { ...p.rect } };
  return { ok: true, rect: p.rect, stage: p.stage, size: p.size, moved: moves.length, trapped: 0, at: now };
}
export const enlargeCastle = (state, pay, now) => enlargeEnceinte(state, null, pay, now);
export function shrinkPreview() { return { ok: false, reason: 'L’enceinte ne se réduit plus : elle suit la ville' }; }
export function shrinkEnceinte() { return shrinkPreview(); }

// ───────── Réorganisation d'une ancienne partie (v20) ─────────
// L'enceinte prend le plus petit palier qui contient la ville (+10 %), dans la limite permise par l'hôtel de ville ;
// la ville entre dans les murs par quartiers (militaire vers la porte, économie à l'est, savoir au nord, lieux à
// l'ouest) ; la campagne sort des murs et des douves. Rien n'est détruit ; tout s'annule pendant le déménagement gratuit.
export function cityCount(state) { return blds(state).filter((b) => isCityType(b.type)).length; }
export function stageFor(state, count = cityCount(state)) {
  const max = maxEncStage(state);
  for (let k = 0; k <= max; k++) if (keepCapacity(ENC_STAGES[k].size) + 1 >= Math.ceil(count * (1 + ENCEINTE.migrateMargin))) return k;
  return max;
}
export function reorganize(state, now = Date.now(), { stage = null } = {}) {
  const C = castleState(state);
  const undo = { at: now, rect: { ...C.rect }, enc: C.enc, positions: Object.fromEntries(blds(state).map((b) => [b.id, [b.x, b.y]])), terrain: null };
  const k = stage ?? stageFor(state);
  const r = squareRect(state, ENC_STAGES[k].size);
  C.rect = r; C.enc = k;
  const changed = flatten(state, r);
  undo.terrain = changed;
  const moves = [];
  // 1) La campagne quitte les murs et les douves ; ce qui bloque l'allée s'écarte
  relocateOut(state, r, moves);
  // 2) La ville entre dans les murs, par quartiers (les bâtiments déjà dans les murs restent où ils sont)
  const t = townhall(state), n = ENC_STAGES[k].size;
  const taken = new Set(blds(state).map((b) => b.x + ',' + b.y));
  const allee = new Set(alleeTiles(state, r).map((a) => a.x + ',' + a.y));
  const busy = new Set((state.queues?.build || []).map((q) => q.bid));
  const famOrder = ['core', 'military', 'economy', 'knowledge', 'places'];
  const todo = blds(state).filter((b) => isCityType(b.type) && b.type !== 'townhall' && !inRect(r, b.x, b.y) && !busy.has(b.id))
    .sort((a, b) => famOrder.indexOf(familyOf(a.type)) - famOrder.indexOf(familyOf(b.type)) || b.level - a.level || (a.id < b.id ? -1 : 1));
  let left = 0;
  for (const b of todo) {
    const dir = FAMILIES[familyOf(b.type)]?.dir || [0, 0];
    const anchor = [t.x + dir[0] * n / 3, t.y + dir[1] * n / 3];
    let best = null, bd = Infinity;
    for (let y = r.y0; y <= r.y1; y++) for (let x = r.x0; x <= r.x1; x++) {
      const kk = x + ',' + y;
      if (taken.has(kk) || allee.has(kk) || state.city.terrain[y * state.city.w + x] !== 'plain') continue;
      const d = Math.hypot(x - anchor[0], y - anchor[1]) + x * 1e-4 + y * 1e-6;
      if (d < bd) { bd = d; best = [x, y]; }
    }
    if (!best) { left++; continue; }
    taken.delete(b.x + ',' + b.y); taken.add(best.join(','));
    moves.push({ id: b.id, from: [b.x, b.y], to: best });
    b.x = best[0]; b.y = best[1];
  }
  // 3) Plans de ville enregistrés (v17) : les positions devenues invalides prennent la nouvelle place du bâtiment
  for (const p of state.cityPlans?.saved || []) {
    const lay = p?.layout || p?.plan;
    if (!lay || typeof lay !== 'object') continue;
    for (const [id, pos] of Object.entries(lay)) {
      const b = state.city.buildings[id];
      if (!b || !Array.isArray(pos)) continue;
      const z = zoneAt(state, pos[0], pos[1], r);
      if (!zoneAllows(b.type, z) || allee.has(pos.join(','))) lay[id] = [b.x, b.y];
    }
  }
  if (state.cityPlans) state.cityPlans.undo = null;
  // Rien n'a bougé (partie récente) : rien à annuler ni à annoncer
  const changedRect = undo.rect.x0 !== r.x0 || undo.rect.y0 !== r.y0 || undo.rect.x1 !== r.x1 || undo.rect.y1 !== r.y1;
  if (moves.length || changedRect || changed.length) {
    C.reorg = { ...undo, moved: moves.length, left, until: now + ENCEINTE.freeMoveDays * 24 * H };
    C.freeMoveUntil = Math.max(C.freeMoveUntil || 0, now + ENCEINTE.freeMoveDays * 24 * H);
  }
  C.history.push({ t: now, rect: { ...r }, enc: k });
  return { ok: true, rect: r, stage: k, moved: moves.length, left, moves };
}
// Annuler la réorganisation : les bâtiments reprennent leur ancienne place (si elle est encore libre), l'enceinte et le
// terrain d'avant reviennent (sauf sous un bâtiment construit depuis)
export function undoReorganize(state) {
  const C = castleState(state), u = C.reorg;
  if (!u) return { ok: false, reason: 'Rien à annuler' };
  const target = new Map();
  for (const b of blds(state)) target.set(b.id, u.positions[b.id] || [b.x, b.y]);
  const at = new Map();
  for (const [id, [x, y]] of target) { const k = x + ',' + y; if (at.has(k)) { const b = state.city.buildings[id]; target.set(id, [b.x, b.y]); } else at.set(k, id); }
  let back = 0;
  for (const [id, [x, y]] of target) { const b = state.city.buildings[id]; if (b.x !== x || b.y !== y) { b.x = x; b.y = y; back++; } }
  const occupied = new Set(blds(state).map((b) => b.y * state.city.w + b.x));
  for (const [i, ter] of u.terrain || []) if (!occupied.has(i)) state.city.terrain[i] = ter;
  C.rect = u.rect; C.enc = u.enc; C.reorg = null; C.reorgUndone = Date.now();
  return { ok: true, back };
}
// Ancienne partie : réorganisée une seule fois (v20)
export function ensureFortress(state, now = Date.now()) {
  const C = castleState(state);
  if (C.v20 || C.reorgUndone) return null;
  C.v20 = now;
  const res = reorganize(state, now);
  return res;
}

// ───────── Raids par zone ─────────
export function breachChance(state) {
  if (fortLevel(state, 'wall') <= 0) return 1;
  const c = SIEGE.breachBase - SIEGE.breachPerWall * fortLevel(state, 'wall') - SIEGE.breachPerMoat * fortLevel(state, 'moat');
  return Math.max(SIEGE.breachMin, Math.min(SIEGE.breachMax, c));
}
// Bâtiments exposés à l'incendie des pillards : hors les murs d'abord ; la cour seulement si la muraille a cédé
export function raidTargets(state, breached) {
  const ok = (b) => b.level > 0 && !b.damaged && !['townhall', 'road', 'deco', 'warehouse'].includes(b.type) && BUILDINGS[b.type]?.cat !== 'place';
  const outside = blds(state).filter((b) => ok(b) && zoneAt(state, b.x, b.y) !== 'keep');
  if (!breached) return outside;
  return blds(state).filter(ok);
}
export const warehouseInside = (state) => blds(state).some((b) => b.type === 'warehouse' && b.level > 0 && zoneAt(state, b.x, b.y) === 'keep');
// Part pillée (sur ce qui dépasse la part protégée)
export const pillageShare = (state, breached) => (!breached && fortLevel(state, 'wall') > 0 && warehouseInside(state) ? SIEGE.heldPillage : 0.3);
// Dégâts de la muraille après un raid
export function siegeDamage(state, { win, breached }) {
  const C = castleState(state);
  if (fortLevel(state, 'wall') <= 0) return 0;
  const add = win ? SIEGE.dmgWin : breached ? SIEGE.dmgBreach : SIEGE.dmgLoss;
  C.wallDmg = Math.min(1, C.wallDmg + add);
  if (breached) C.stats.breaches++; else if (!win) C.stats.held++;
  return add;
}
export function repairCost(state) {
  const d = state.castle?.wallDmg || 0;
  return Object.fromEntries(Object.entries(SIEGE.repairCost(fortLevel(state, 'wall'))).map(([r, v]) => [r, Math.ceil(v * d)]));
}
export function repairWall(state, pay) {
  const C = castleState(state);
  if (C.wallDmg <= 0) return { ok: false, reason: 'La muraille est intacte' };
  if (!pay(repairCost(state))) return { ok: false, reason: 'Ressources insuffisantes' };
  C.wallDmg = 0; C.stats.repaired++;
  return { ok: true };
}

// ───────── Feu et eau ─────────
// Le feu ne traverse pas les douves : vrai si les douves séparent les deux cases
export const moatBetween = (state, a, b) => fortLevel(state, 'moat') > 0 && inKeep(state, a.x, a.y) !== inKeep(state, b.x, b.y);
export const moatOverflowChance = (state) => (fortLevel(state, 'moat') > 0 ? Math.max(0, MOAT_FLOOD.base - MOAT_FLOOD.perLevel * fortLevel(state, 'moat')) : 0);
// Bâtiments qui bordent la muraille (première case dedans ou dehors) : touchés si les douves débordent
export function moatBank(state) {
  const r = rectOf(state);
  return blds(state).filter((b) => {
    if (b.level <= 0 || ['road', 'deco'].includes(b.type)) return false;
    const inside = zoneAt(state, b.x, b.y, r) === 'keep';
    if (inside) return b.x === r.x0 || b.x === r.x1 || b.y === r.y0 || b.y === r.y1;
    return Math.max(r.x0 - b.x, 0, b.x - r.x1, r.y0 - b.y, 0, b.y - r.y1) === 1;
  });
}

// ───────── Flancs de défense ─────────
export function setFlanks(state, w) {
  const C = castleState(state);
  const v = {};
  for (const k of Object.keys(FLANKS)) v[k] = Math.max(0, Number(w[k]) || 0);
  const tot = Object.values(v).reduce((a, b) => a + b, 0);
  if (tot <= 0) return { ok: false, reason: 'Répartition vide' };
  for (const k of Object.keys(v)) v[k] = Math.round((v[k] / tot) * 1000) / 1000;
  C.flanks = v;
  return { ok: true, flanks: v };
}
export const flankShare = (state, flank) => { const f = castleState(state).flanks; return (f[flank] || 0) + FLANK_RULES.yardWeight * (f.yard || 0); };
// Bonus (ou malus) de défense selon la part de troupes placée sur le flanc attaqué
export function flankBonus(state, flank) {
  if (!ASSAULT_FLANKS.includes(flank)) return 0;
  const eff = flankShare(state, flank);
  const b = (eff / FLANK_RULES.neutral - 1) * FLANK_RULES.maxBonus;
  return Math.round(Math.max(-FLANK_RULES.maxBonus, Math.min(FLANK_RULES.maxBonus, b)) * 1000) / 1000;
}
// Choix du flanc par les assaillants : le plus faible une fois sur deux, sinon au hasard
export function pickRaidFlank(state, rand) {
  const f = castleState(state).flanks;
  if (rand() < FLANK_RULES.weakestChance) return ASSAULT_FLANKS.slice().sort((a, b) => (f[a] || 0) - (f[b] || 0))[0];
  return ASSAULT_FLANKS[Math.min(2, Math.floor(rand() * 3))];
}
export const flankRevealed = (state) => blds(state).some((b) => b.type === 'watchtower' && b.level >= FLANK_RULES.revealWatchtower);
// Outils de défense posés sur un flanc (payés à l'usage seulement)
export function setTool(state, tool, flank) {
  const C = castleState(state);
  const d = DEFENSE_TOOLS[tool];
  if (!d) return { ok: false, reason: 'Outil inconnu' };
  if (flank && !ASSAULT_FLANKS.includes(flank)) return { ok: false, reason: 'Flanc inconnu' };
  if (flank && fortLevel(state, 'wall') < d.needWall) return { ok: false, reason: `Muraille niv. ${d.needWall} requise` };
  if (flank) C.tools[tool] = flank; else delete C.tools[tool];
  return { ok: true };
}
// Modificateurs des outils engagés sur le flanc attaqué ; pay(cost) → bool (outil utilisé seulement s'il est payé)
export function useTools(state, flank, pay) {
  const C = castleState(state), m = {}, used = [];
  const th = Math.max(1, thOf(state));
  for (const [k, f] of Object.entries(C.tools)) {
    const d = DEFENSE_TOOLS[k];
    if (!d || f !== flank || fortLevel(state, 'wall') < d.needWall) continue;
    if (!pay(d.cost(th))) continue;
    for (const [mk, v] of Object.entries(d.mods)) m[mk] = (m[mk] || 0) + v;
    used.push(k);
  }
  return { mods: m, used };
}

// ───────── Décorations utiles ─────────
export function decoEffects(state) {
  const near = (d, types) => blds(state).some((o) => o !== d && o.level > 0 && types.includes(o.type) && Math.max(Math.abs(o.x - d.x), Math.abs(o.y - d.y)) <= 1);
  const count = { faubourg: 0, keep: 0, keepNear: 0 };
  const list = [];
  for (const d of blds(state)) {
    if (d.type !== 'deco') continue;
    const z = zoneAt(state, d.x, d.y);
    // v20 : dans les murs, une décoration porte le moral de la garnison et, à côté des maisons, celui des ouvriers
    const fx = z === 'keep' ? DECO_FX.keep : null;
    const active = !!fx && count.keep < fx.max;
    if (active) count.keep++;
    const nearOk = z === 'keep' && near(d, DECO_FX.keepNear.near) && count.keepNear < DECO_FX.keepNear.max;
    if (nearOk) count.keepNear++;
    list.push({ id: d.id, zone: z, active: active || nearOk, text: z === 'keep' ? `${fx.text}${nearOk ? ` ; ${DECO_FX.keepNear.text}` : ''} ; ordre public` : 'hors les murs : aucun effet (placez-la dans la ville)' });
  }
  const mods = {};
  if (count.keepNear) mods[DECO_FX.keepNear.mod] = count.keepNear * DECO_FX.keepNear.per;
  if (count.keep) mods[DECO_FX.keep.mod] = count.keep * DECO_FX.keep.per;
  return { mods, list, count: { faubourg: count.keepNear, keep: count.keep } };
}

// ───────── Silhouette et apparence ─────────
export const stageIndex = (th) => { let i = 0; CASTLE_STAGES.forEach((s, k) => { if (th >= s.th) i = k; }); return i; };
export const castleStage = (state) => CASTLE_STAGES[stageIndex(thOf(state))];
export const wallStyle = (level) => { let s = WALL_STYLES[0]; for (const w of WALL_STYLES) if (level >= w.from) s = w; return s; };

// ───────── Terrains vagues ─────────
const countType = (state, type) => blds(state).filter((b) => b.type === type).length;
// Emplacements stables pour les bâtiments « menu » pas encore construits ; lecture seule
export function vacantLots(state) {
  const r = rectOf(state), W = state.city.w, Hh = state.city.h;
  const taken = new Set(blds(state).map((b) => b.x + ',' + b.y));
  for (const q of state.queues?.build || []) if (q.kind === 'clear') taken.add(q.x + ',' + q.y);
  const gate = { x: gateOf(state, r).x, y: r.y1 + 1 };
  const center = { x: (r.x0 + r.x1) / 2, y: (r.y0 + r.y1) / 2 };
  const out = [];
  for (const type of LOT_TYPES) {
    if (!BUILDINGS[type] || countType(state, type) > 0) continue;
    // Seulement ce qui est à portée (débloqué, ou au prochain niveau de l'hôtel de ville) : sinon la cour d'une
    // nouvelle partie se couvre de panneaux. Les autres lieux restent dans la liste Lieux, « à bâtir ».
    if ((BUILDINGS[type].req?.townhall || 1) > thOf(state) + 1) continue;
    const prefKeep = ruleOf(type) === 'keep';
    const anchor = prefKeep ? center : gate;
    const allee = new Set(alleeTiles(state, r).map((a) => a.x + ',' + a.y));
    let best = null, bd = Infinity;
    for (let y = 0; y < Hh; y++) for (let x = 0; x < W; x++) {
      if (taken.has(x + ',' + y) || allee.has(x + ',' + y) || state.city.terrain[y * W + x] !== 'plain') continue;
      const z = zoneAt(state, x, y, r);
      if (!zoneAllows(type, z)) continue;
      if (!prefKeep && z !== 'faubourg') continue;
      const d = Math.hypot(x - anchor.x, y - anchor.y) + (x + y * 0.01) * 1e-4;
      if (d < bd) { bd = d; best = { x, y }; }
    }
    if (best) { taken.add(best.x + ',' + best.y); out.push({ type, x: best.x, y: best.y, screens: BUILDING_SCREENS[type] || [], req: BUILDINGS[type].req || null }); }
  }
  return out;
}

// ───────── Mise en place et migration ─────────
// Nouvelle partie : 5 × 5 autour de l'hôtel de ville. Ancienne partie (migrate) : enceinte tracée autour de l'hôtel
// de ville et des bâtiments les plus proches qui ont leur place dans la cour, dans la limite du domaine ; les
// bâtiments mal placés restent actifs et le déménagement est gratuit pendant 7 jours.
export function newCastle(state) {
  state.castle = null;
  const C = castleState(state);
  C.rect = squareRect(state, ENC_STAGES[0].size); C.enc = 0;
  flatten(state, C.rect);
  return C;
}
// Partie d'avant la v16 (sans enceinte) : on trace l'enceinte, puis on réorganise comme une partie v19
export function migrateCastle(state, now = Date.now()) {
  state.castle = null;
  const C = castleState(state);
  C.migrated = now;
  C.stage = stageIndex(thOf(state));
  C.freeMoveUntil = now + ENCEINTE.freeMoveDays * 24 * H;
  return { rect: C.rect, misplaced: misplaced(state).length };
}

// Tick : réparation de la muraille par les maçons, passage d'un palier de silhouette (renvoie le palier atteint)
export function castleTick(state, now, dtH) {
  const C = castleState(state);
  if (C.wallDmg > 0) C.wallDmg = Math.max(0, C.wallDmg - SIEGE.repairPerHour * dtH);
  const s = stageIndex(thOf(state));
  if (s > C.stage) { C.stage = s; return CASTLE_STAGES[s]; }
  if (s < C.stage) C.stage = s;
  return null;
}

export { ZONES, FLANKS, ASSAULT_FLANKS, DEFENSE_TOOLS, CASTLE_STAGES, BUILDING_SCREENS, ENC_STAGES, FAMILIES };
