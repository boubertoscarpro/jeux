// v16 — « Le Château et ses Faubourgs » (module pur, sans DOM) : zones concentriques du royaume, enceinte et son
// périmètre, raids par zone, dégâts et réparation de la muraille, flancs de défense, décorations utiles, paliers de
// silhouette, terrains vagues (bâtiments « menu » pas encore construits) et migration des anciennes parties.
// Les chiffres de défense de base restent ceux de la muraille (`wall`) et des douves (`moat`) : ce module ne fait que
// les moduler (périmètre, dégâts) par le modificateur existant `wall.pct`.
import {
  ZONES, FAUBOURG_DEPTH, KEEP_ONLY, COUNTRY_ONLY, OUTSIDE_ONLY, ZONE_RULE_TEXT, ZONE_FX, ZONE_FX_CAP, ENCEINTE, SIEGE,
  MOAT_FLOOD, FLANKS, ASSAULT_FLANKS, FLANK_RULES, DEFENSE_TOOLS, DECO_FX, CASTLE_STAGES, WALL_STYLES, BUILDING_SCREENS, LOT_TYPES,
} from '../data/castle.js';
import { BUILDINGS } from '../data/buildings.js';

const H = 3600000;
const fortLevel = (state, k) => state.city?.fort?.[k] || 0;
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
  return C;
}
const validRect = (r) => r && [r.x0, r.y0, r.x1, r.y1].every(Number.isFinite) && r.x1 >= r.x0 && r.y1 >= r.y0;
const townhall = (state) => blds(state).find((b) => b.type === 'townhall') || { x: Math.floor((state.city?.w || 24) / 2), y: Math.floor((state.city?.h || 16) / 2) };
function clampRect(state, r) {
  const W = state.city.w, Hh = state.city.h;
  const w = Math.min(r.x1 - r.x0, W - 1), h = Math.min(r.y1 - r.y0, Hh - 1);
  let x0 = Math.max(0, Math.min(W - 1 - w, r.x0)), y0 = Math.max(0, Math.min(Hh - 1 - h, r.y0));
  return { x0, y0, x1: x0 + w, y1: y0 + h };
}
export function defaultRect(state) {
  const t = townhall(state), half = Math.floor(ENCEINTE.start / 2);
  return clampRect(state, { x0: t.x - half, y0: t.y - half, x1: t.x + half, y1: t.y + half });
}
export const rectOf = (state) => (validRect(state.castle?.rect) ? state.castle.rect : defaultRect(state));
export const rectW = (r) => r.x1 - r.x0 + 1;
export const rectH = (r) => r.y1 - r.y0 + 1;
export const perimeter = (r) => 2 * (rectW(r) + rectH(r));
export const maxDims = (state) => ({ w: Math.min(state.city.w, ENCEINTE.maxW(state.domain || 0)), h: Math.min(state.city.h, ENCEINTE.maxH(state.domain || 0)) });

// ───────── Zones ─────────
export function zoneAt(state, x, y, r = rectOf(state)) {
  if (x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1) return 'keep';
  const d = Math.max(r.x0 - x, 0, x - r.x1, r.y0 - y, 0, y - r.y1);
  return d <= FAUBOURG_DEPTH ? 'faubourg' : 'country';
}
export const inKeep = (state, x, y, r) => zoneAt(state, x, y, r) === 'keep';
export function ruleOf(type) {
  if (KEEP_ONLY.includes(type)) return 'keep';
  if (COUNTRY_ONLY.includes(type)) return 'country';
  if (OUTSIDE_ONLY.includes(type)) return 'outside';
  return 'any';
}
export function zoneAllows(type, zone) {
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
  if (zoneAllows(type, z)) return { ok: true, zone: z };
  const r = ruleOf(type);
  const reason = r === 'keep' ? 'Ce bâtiment se construit dans la cour du donjon (intra-muros).'
    : r === 'country' ? 'Ce bâtiment se construit dans la campagne, au-delà des faubourgs.'
      : 'Ce bâtiment se construit hors les murs (faubourgs ou campagne).';
  return { ok: false, reason, zone: z };
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

// Agrandir l'enceinte d'une rangée ou d'une colonne (côté n, s, e, o)
const SIDES = { n: ['y0', -1], s: ['y1', 1], w: ['x0', -1], e: ['x1', 1] };
export function enlargePreview(state, side) {
  const r = rectOf(state), [k, d] = SIDES[side] || [];
  if (!k) return { ok: false, reason: 'Côté inconnu' };
  const n = { ...r, [k]: r[k] + d };
  if (n.x0 < 0 || n.y0 < 0 || n.x1 >= state.city.w || n.y1 >= state.city.h) return { ok: false, reason: 'Bord du domaine atteint' };
  const mx = maxDims(state);
  if (rectW(n) > mx.w || rectH(n) > mx.h) return { ok: false, reason: `Enceinte maximale pour ce domaine (${mx.w} × ${mx.h}) : agrandissez le domaine` };
  const seg = perimeter(n) - perimeter(r);
  const k2 = 1 + ENCEINTE.levelCost * fortLevel(state, 'wall');
  const cost = Object.fromEntries(Object.entries(ENCEINTE.segmentCost).map(([res, v]) => [res, Math.ceil(v * seg * k2)]));
  const trapped = blds(state).filter((b) => b.level >= 0 && zoneAt(state, b.x, b.y, n) === 'keep' && zoneAt(state, b.x, b.y, r) !== 'keep' && (ruleOf(b.type) === 'country' || ruleOf(b.type) === 'outside'));
  return { ok: true, rect: n, cost, segments: seg, perimeter: perimeter(n), factor: Math.max(ENCEINTE.factorMin, Math.min(ENCEINTE.factorMax, 1 + ENCEINTE.perPerimeter * (ENCEINTE.refPerimeter - perimeter(n)))), trapped };
}
export function enlargeEnceinte(state, side, pay, now = Date.now()) {
  const C = castleState(state);
  const p = enlargePreview(state, side);
  if (!p.ok) return p;
  if (!pay(p.cost)) return { ok: false, reason: 'Ressources insuffisantes' };
  C.rect = p.rect;
  C.stats.enlarged++;
  return { ok: true, rect: p.rect, trapped: p.trapped.length, at: now };
}
export function shrinkPreview(state, side) {
  const r = rectOf(state), [k, d] = SIDES[side] || [];
  if (!k) return { ok: false, reason: 'Côté inconnu' };
  const n = { ...r, [k]: r[k] - d };
  if (rectW(n) < 3 || rectH(n) < 3) return { ok: false, reason: 'Enceinte minimale (3 × 3)' };
  const t = townhall(state);
  if (zoneAt(state, t.x, t.y, n) !== 'keep') return { ok: false, reason: 'L’hôtel de ville doit rester intra-muros' };
  const out = blds(state).filter((b) => zoneAt(state, b.x, b.y, r) === 'keep' && zoneAt(state, b.x, b.y, n) !== 'keep' && ruleOf(b.type) === 'keep');
  if (out.length) return { ok: false, reason: `${BUILDINGS[out[0].type].name} se retrouverait hors les murs` };
  return { ok: true, rect: n, perimeter: perimeter(n) };
}
export function shrinkEnceinte(state, side) {
  const C = castleState(state);
  const p = shrinkPreview(state, side);
  if (!p.ok) return p;
  C.rect = p.rect;
  return { ok: true, rect: p.rect };
}

// ───────── Raids par zone ─────────
export function breachChance(state) {
  if (fortLevel(state, 'wall') <= 0) return 1;
  const c = SIEGE.breachBase - SIEGE.breachPerWall * fortLevel(state, 'wall') - SIEGE.breachPerMoat * fortLevel(state, 'moat');
  return Math.max(SIEGE.breachMin, Math.min(SIEGE.breachMax, c));
}
// Bâtiments exposés à l'incendie des pillards : hors les murs d'abord ; la cour seulement si la muraille a cédé
export function raidTargets(state, breached) {
  const ok = (b) => b.level > 0 && !b.damaged && !['townhall', 'road', 'deco', 'warehouse'].includes(b.type);
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
  const count = { faubourg: 0, keep: 0 };
  const list = [];
  for (const d of blds(state)) {
    if (d.type !== 'deco') continue;
    const z = zoneAt(state, d.x, d.y);
    const fx = DECO_FX[z];
    let active = !!fx && (!fx.near || near(d, fx.near));
    if (active && count[z] >= fx.max) active = false;
    if (active) count[z]++;
    list.push({ id: d.id, zone: z, active, text: fx ? fx.text : 'en campagne, personne ne la voit : aucun effet' });
  }
  const mods = {};
  if (count.faubourg) mods[DECO_FX.faubourg.mod] = count.faubourg * DECO_FX.faubourg.per;
  if (count.keep) mods[DECO_FX.keep.mod] = count.keep * DECO_FX.keep.per;
  return { mods, list, count };
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
  const gate = { x: Math.floor((r.x0 + r.x1) / 2), y: r.y1 + 1 };
  const center = { x: (r.x0 + r.x1) / 2, y: (r.y0 + r.y1) / 2 };
  const out = [];
  for (const type of LOT_TYPES) {
    if (!BUILDINGS[type] || countType(state, type) > 0) continue;
    const prefKeep = ruleOf(type) === 'keep' || ['barracks', 'warehouse'].includes(type);
    const anchor = prefKeep ? center : gate;
    let best = null, bd = Infinity;
    for (let y = 0; y < Hh; y++) for (let x = 0; x < W; x++) {
      if (taken.has(x + ',' + y) || state.city.terrain[y * W + x] !== 'plain') continue;
      const z = zoneAt(state, x, y, r);
      if (!zoneAllows(type, z)) continue;
      if (prefKeep && ruleOf(type) !== 'keep' && z !== 'keep') continue;
      if (!prefKeep && z !== 'faubourg') continue;
      const d = Math.hypot(x - anchor.x, y - anchor.y) + (x + y * 0.01) * 1e-4;
      if (d < bd) { bd = d; best = { x, y }; }
    }
    if (best) { taken.add(best.x + ',' + best.y); out.push({ type, x: best.x, y: best.y, screens: BUILDING_SCREENS[type] || [] }); }
  }
  return out;
}

// ───────── Mise en place et migration ─────────
// Nouvelle partie : 5 × 5 autour de l'hôtel de ville. Ancienne partie (migrate) : enceinte tracée autour de l'hôtel
// de ville et des bâtiments les plus proches qui ont leur place dans la cour, dans la limite du domaine ; les
// bâtiments mal placés restent actifs et le déménagement est gratuit pendant 7 jours.
export function newCastle(state) {
  state.castle = null;
  return castleState(state);
}
export function migrateCastle(state, now = Date.now()) {
  state.castle = null;
  const C = castleState(state);
  let r = defaultRect(state);
  const mx = maxDims(state);
  const t = townhall(state);
  const cand = blds(state).filter((b) => b.type !== 'townhall' && ['keep', 'any'].includes(ruleOf(b.type)) && !['road', 'deco'].includes(b.type))
    .sort((a, b) => (ruleOf(b.type) === 'keep') - (ruleOf(a.type) === 'keep') || Math.max(Math.abs(a.x - t.x), Math.abs(a.y - t.y)) - Math.max(Math.abs(b.x - t.x), Math.abs(b.y - t.y)));
  for (const b of cand) {
    const n = { x0: Math.min(r.x0, b.x), y0: Math.min(r.y0, b.y), x1: Math.max(r.x1, b.x), y1: Math.max(r.y1, b.y) };
    if (rectW(n) > mx.w || rectH(n) > mx.h) continue;
    // On n'enferme pas un champ, une carrière ou une tannerie dans la cour
    if (blds(state).some((o) => zoneAt(state, o.x, o.y, n) === 'keep' && zoneAt(state, o.x, o.y, r) !== 'keep' && ['country', 'outside'].includes(ruleOf(o.type)))) continue;
    r = n;
  }
  C.rect = clampRect(state, r);
  C.migrated = now;
  C.freeMoveUntil = now + ENCEINTE.freeMoveDays * 24 * H;
  C.stage = stageIndex(thOf(state));
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

export { ZONES, FLANKS, ASSAULT_FLANKS, DEFENSE_TOOLS, CASTLE_STAGES, BUILDING_SCREENS };
