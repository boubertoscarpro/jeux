// v19 « L'Art du siège » (module pur, testable) : protections des places fortes, engins d'attaque et de défense,
// production et arsenal, contres dégressifs et bornés, bataille par flancs, vagues et cour (chaque combat passe par
// simulateBattle), raids qui assiègent et s'adaptent, renseignement de la tour de guet, conseil de guerre, plans.
import { mulberry32, rng } from '../core/rng.js';
import { uid } from '../core/util.js';
import { ATTACK_ENGINES, DEFENSE_ENGINES, COUNTER_CAP, NEUTRALIZE_CAP, SIEGE_RULES, INTEL, RAID_ENGINES, MOAT_PER_LEVEL, PLAN_SLOTS } from '../data/siege.js';
import { ASSAULT_FLANKS, FLANKS } from '../data/castle.js';
import { UNITS, ALL_UNITS } from '../data/units.js';
import { simulateBattle } from './combat.js';
import { castleState, fortLevel } from './castle.js';
import { levelOf, thLevel } from './city.js';
import { computeMods } from './modifiers.js';
import { pay, missing } from './economy.js';
import { log } from './log.js';
import { a11yPrefs } from './a11y.js';

const FL = ASSAULT_FLANKS; // left, front, right
const sat = (n, k, cap) => (n > 0 ? cap * (1 - Math.exp(-n / k)) : 0);
const scale = (units, f) => { const o = {}; for (const [u, n] of Object.entries(units || {})) { const v = Math.round(n * f); if (v > 0) o[u] = v; } return o; };
const add = (a, b) => { const o = { ...(a || {}) }; for (const [u, n] of Object.entries(b || {})) o[u] = (o[u] || 0) + n; return o; };
const sum = (o) => Object.values(o || {}).reduce((a, b) => a + b, 0);
const clean = (o) => Object.fromEntries(Object.entries(o || {}).filter(([, n]) => n > 0));
const ENG = { ...ATTACK_ENGINES, ...DEFENSE_ENGINES };
export const engineDef = (k) => ENG[k];
export const isAttackEngine = (k) => !!ATTACK_ENGINES[k];

// ───────── État ─────────
export function siegeState(state) {
  const s = (state.siege && typeof state.siege === 'object') ? state.siege : (state.siege = {});
  s.arsenal ||= {};
  s.arsenal.attack ||= {};
  s.arsenal.defense ||= {};
  s.queue ||= {};
  for (const side of ['attack', 'defense']) if (!Array.isArray(s.queue[side])) s.queue[side] = [];
  s.posted ||= {};
  for (const f of FL) s.posted[f] ||= {};
  s.plans ||= {};
  for (const k of ['attack', 'defense']) if (!Array.isArray(s.plans[k])) s.plans[k] = [];
  s.minStock ||= {};
  s.memory ||= {};
  return s;
}
// Migration : béliers (unités) → béliers (engins), outils de défense posés → engins posés, répartition conservée
export function ensureSiege(state) {
  const S = siegeState(state);
  if (S.migrated) return S;
  S.migrated = true;
  const rams = state.army?.ram || 0;
  if (rams > 0) { S.arsenal.attack.ram = (S.arsenal.attack.ram || 0) + rams; delete state.army.ram; }
  const tools = state.castle?.tools || {};
  const MAP = { stones: 'stones', pitch: 'pitch', archers: 'archers' };
  for (const [t, f] of Object.entries(tools)) {
    const k = MAP[t];
    if (!k || !FL.includes(f)) continue;
    // Un outil posé équivalait à +4 % : 5 engins de son type, en stock et posés sur le même flanc
    S.arsenal.defense[k] = (S.arsenal.defense[k] || 0) + 5;
    S.posted[f][k] = (S.posted[f][k] || 0) + 5;
  }
  if (state.castle) state.castle.tools = {};
  return S;
}

// ───────── Protections ─────────
// Château du joueur : l'ancien bonus de muraille (muraille + douves, facteur de l'enceinte, dégâts) est réparti en
// muraille, porte (au niveau de la muraille) et douves. Sans engin, la protection d'un flanc vaut l'ancien bonus.
export function castleProtections(state, mods = computeMods(state)) {
  const pct = 1 + (mods['wall.pct'] || 0);
  const total = Math.max(0, (mods['wall.bonus'] || 0) * pct);
  const moat = Math.min(total, MOAT_PER_LEVEL * fortLevel(state, 'moat') * pct);
  const wall = Math.max(0, total - moat);
  return { wall, gate: wall, moat, wallLevel: fortLevel(state, 'wall'), moatLevel: fortLevel(state, 'moat'), oneFlank: fortLevel(state, 'wall') < SIEGE_RULES.flanksAtWall };
}
// Place adverse : le bonus de muraille connu de la cible (rival, fort de faction, forteresse de la Brèche)
export function targetProtections(fort, poi = {}) {
  const moat = Math.min(fort, poi.moat ? MOAT_PER_LEVEL * poi.moat : 0);
  const wall = Math.max(0, fort - moat);
  return { wall, gate: wall, moat, wallLevel: Math.round(fort / 0.08), oneFlank: fort < 0.2 };
}
export const isFortified = (fort) => fort > 0;

// ───────── Production et arsenal ─────────
export const attackWorkshop = (state) => levelOf(state, 'workshop');
// L'atelier de défense est une extension de la muraille (les hourds) : son niveau est celui de la muraille
export const defenseWorkshop = (state) => fortLevel(state, 'wall');
export function engineUnlocked(state, type) {
  if (ATTACK_ENGINES[type]) return attackWorkshop(state) >= ATTACK_ENGINES[type].workshop;
  if (DEFENSE_ENGINES[type]) return defenseWorkshop(state) >= DEFENSE_ENGINES[type].wall;
  return false;
}
export const unlockText = (type) => (ATTACK_ENGINES[type] ? `Atelier de siège niv. ${ATTACK_ENGINES[type].workshop}` : `Muraille niv. ${DEFENSE_ENGINES[type].wall}`);
export const arsenalCap = (state, side) => (side === 'attack' ? SIEGE_RULES.arsenal.attack(attackWorkshop(state)) : SIEGE_RULES.arsenal.defense(defenseWorkshop(state)));
export const stockOf = (state, side) => siegeState(state).arsenal[side];
export const stockTotal = (state, side) => sum(stockOf(state, side)) + siegeState(state).queue[side].reduce((a, q) => a + q.n, 0);
export function engineCost(type, n = 1) {
  const d = ENG[type];
  return Object.fromEntries(Object.entries(d.cost).map(([r, v]) => [r, Math.ceil(v * n)]));
}
export function engineTime(state, type, n = 1, mods = computeMods(state)) {
  const lvl = ATTACK_ENGINES[type] ? attackWorkshop(state) : defenseWorkshop(state);
  return (ENG[type].time * n * 1000) / (1 + 0.03 * lvl + (mods['siege.build'] || 0));
}
export function startEngines(state, type, n, now = Date.now()) {
  const side = ATTACK_ENGINES[type] ? 'attack' : DEFENSE_ENGINES[type] ? 'defense' : null;
  if (!side) return { ok: false, reason: 'Engin inconnu' };
  n = Math.floor(n);
  if (!(n > 0)) return { ok: false, reason: 'Quantité invalide' };
  if (side === 'attack' && !attackWorkshop(state)) return { ok: false, reason: 'Atelier de siège requis' };
  if (side === 'defense' && !defenseWorkshop(state)) return { ok: false, reason: 'Muraille requise (l’atelier de défense en est une extension)' };
  if (!engineUnlocked(state, type)) return { ok: false, reason: `${unlockText(type)} requis` };
  const room = arsenalCap(state, side) - stockTotal(state, side);
  if (room <= 0) return { ok: false, reason: 'Arsenal plein : agrandissez l’atelier (attaque) ou la muraille (défense)' };
  n = Math.min(n, room);
  const cost = engineCost(type, n);
  if (!pay(state, cost)) return { ok: false, reason: 'Ressources insuffisantes', missing: missing(state, cost) };
  const S = siegeState(state);
  const last = S.queue[side].reduce((m, q) => Math.max(m, q.end), now);
  S.queue[side].push({ id: uid('sg'), type, n, start: Math.max(now, last), end: Math.max(now, last) + engineTime(state, type, n), cost });
  return { ok: true, n };
}
export function cancelEngines(state, side, id) {
  const S = siegeState(state);
  const i = S.queue[side].findIndex((q) => q.id === id);
  if (i < 0) return { ok: false };
  const q = S.queue[side][i];
  for (const [r, v] of Object.entries(q.cost)) state.resources[r] = (state.resources[r] || 0) + Math.floor(v * 0.8);
  S.queue[side].splice(i, 1);
  return { ok: true };
}
// Pas du monde : fin des productions ; ordre « maintenir le stock »
export function siegeTick(state, now = Date.now()) {
  const S = siegeState(state);
  // Un bélier formé comme unité (file de formation d'avant la v19) rejoint l'arsenal
  if (state.army?.ram > 0) { S.arsenal.attack.ram = (S.arsenal.attack.ram || 0) + state.army.ram; delete state.army.ram; }
  for (const side of ['attack', 'defense']) {
    while (S.queue[side].length && S.queue[side][0].end <= now) {
      const q = S.queue[side].shift();
      S.arsenal[side][q.type] = (S.arsenal[side][q.type] || 0) + q.n;
      log(state, 'good', `${ENG[q.type].icon} ${q.n} × ${ENG[q.type].name} prêt${q.n > 1 ? 's' : ''} à l’arsenal.`, q.end);
    }
  }
  // Mode simplifié : la défense conseillée est appliquée d'elle-même quand un nouveau raid est repéré
  if (a11yPrefs(state).simple) {
    const raid = (state.raids || []).filter((r) => !r.autoDefended).sort((a, b) => a.arrive - b.arrive)[0];
    if (raid) { applyDefense(state, advisedDefense(state, raid)); raid.autoDefended = true; }
  }
}
export function keepStock(state, now = Date.now()) {
  const S = siegeState(state);
  const done = [];
  for (const [type, want] of Object.entries(S.minStock)) {
    if (!ENG[type] || !(want > 0) || !engineUnlocked(state, type)) continue;
    const side = ATTACK_ENGINES[type] ? 'attack' : 'defense';
    const have = (S.arsenal[side][type] || 0) + S.queue[side].filter((q) => q.type === type).reduce((a, q) => a + q.n, 0) + postedCount(state, type);
    if (have >= want) continue;
    const r = startEngines(state, type, want - have, now);
    if (r.ok) done.push(`${r.n} ${ENG[type].name.toLowerCase()}`);
  }
  return done.length ? { ok: true, msg: `en fabrication : ${done.join(', ')}` } : { ok: false, reason: 'stocks complets ou ressources insuffisantes' };
}
export function setMinStock(state, type, n) { if (!ENG[type]) return { ok: false }; siegeState(state).minStock[type] = Math.max(0, Math.floor(n) || 0); return { ok: true }; }

// ───────── Défense du château : engins posés sur les flancs ─────────
export const postedCount = (state, type) => FL.reduce((a, f) => a + (siegeState(state).posted[f][type] || 0), 0);
export const defenseLimit = (state) => SIEGE_RULES.defensePerFlank(defenseWorkshop(state));
// Poser n engins (stock) sur un flanc ; le stock non posé reste à l'arsenal
export function postEngine(state, flank, type, n) {
  const D = DEFENSE_ENGINES[type];
  if (!D || !FL.includes(flank)) return { ok: false, reason: 'Engin ou flanc inconnu' };
  if (D.flanks && !D.flanks.includes(flank)) return { ok: false, reason: `${D.name} : ${D.flanks.map((f) => FLANKS[f].name.toLowerCase()).join(', ')} seulement` };
  const S = siegeState(state);
  const prot = castleProtections(state);
  if (prot.oneFlank && flank !== 'front') return { ok: false, reason: `Un seul front tant que la muraille est sous le niveau ${SIEGE_RULES.flanksAtWall}` };
  n = Math.max(0, Math.floor(n) || 0);
  const others = FL.filter((f) => f !== flank).reduce((a, f) => a + (S.posted[f][type] || 0), 0);
  const stock = (S.arsenal.defense[type] || 0);
  const onFlankOther = sum(S.posted[flank]) - (S.posted[flank][type] || 0);
  n = Math.min(n, Math.max(0, stock - others), Math.max(0, defenseLimit(state) - onFlankOther));
  if (n) S.posted[flank][type] = n; else delete S.posted[flank][type];
  return { ok: true, n };
}
// Répartition des troupes (parts du château, système v16) : part sur un flanc ±
export function stepShare(state, flank, d) {
  const C = castleState(state);
  const f = { ...C.flanks };
  f[flank] = Math.max(0, Math.min(1, (f[flank] || 0) + d));
  const tot = sum(f) || 1;
  for (const k of Object.keys(f)) f[k] = Math.round((f[k] / tot) * 1000) / 1000;
  C.flanks = f;
  return { ok: true };
}
const defenseShares = (state, oneFlank) => {
  const f = { left: 0.25, front: 0.25, right: 0.25, yard: 0.25, ...(castleState(state).flanks || {}) };
  // Un seul front (muraille sous le niveau 5) : toute la garnison défend la porte, comme avant la v19
  if (oneFlank) return { left: 0, front: 1, right: 0, yard: 0 };
  return f;
};

// ───────── Interaction des engins sur un flanc ─────────
// aE : engins d'attaque engagés sur ce flanc par cette vague ; dE : engins de défense présents ; prot : protections
export function flankEffects(aE = {}, dE = {}, prot, flank) {
  const notes = [];
  // 1) Efficacité des engins de défense, diminuée par les engins d'attaque qui les neutralisent
  const dEff = {};
  for (const [k, n] of Object.entries(dE)) {
    let v = n;
    for (const [A, a] of Object.entries(ATTACK_ENGINES)) {
      if (!aE[A] || !a.effect.neutralize?.includes(k)) continue;
      const r = sat(aE[A], a.effect.k, a.effect.ncap || NEUTRALIZE_CAP);
      if (r > 0.01) notes.push({ kind: 'neutralize', by: A, target: k, pct: r });
      v *= 1 - r;
    }
    dEff[k] = v;
  }
  // 2) Efficacité des engins d'attaque, diminuée par leurs contres
  const aEff = {};
  for (const [A, n] of Object.entries(aE)) {
    let v = n;
    for (const [D, d] of Object.entries(DEFENSE_ENGINES)) {
      const c = d.effect.counter;
      if (!dEff[D] || !(Array.isArray(c) ? c.includes(A) : c === A)) continue;
      const r = sat(dEff[D], d.effect.k, COUNTER_CAP);
      if (r > 0.01) notes.push({ kind: 'counter', by: D, target: A, pct: r });
      v *= 1 - r;
    }
    aEff[A] = v;
  }
  // 3) Protections du flanc
  const front = flank === 'front';
  const herse = front && dEff.portcullis ? sat(dEff.portcullis, DEFENSE_ENGINES.portcullis.effect.k, DEFENSE_ENGINES.portcullis.effect.gate) : 0;
  const base = (front ? prot.gate + herse : prot.wall) + prot.moat;
  const red = (A) => { const e = ATTACK_ENGINES[A].effect; return sat(aEff[A] || 0, e.k, e.cap); };
  const tw = sat(aEff.tower || 0, ATTACK_ENGINES.tower.effect.k, ATTACK_ENGINES.tower.effect.cap);
  // Part de chaque protection qui subsiste (se multiplie d'une vague à l'autre)
  const keep = { wall: front ? 1 : (1 - red('ladders')) * (1 - tw), gate: front ? (1 - red('ram')) * (1 - tw) : 1, moat: (1 - red('fascines')) * (1 - tw) };
  const wall = front ? 0 : prot.wall * keep.wall;
  const gate = front ? (prot.gate + herse) * keep.gate : 0;
  const moat = prot.moat * keep.moat;
  const fort = Math.max(0, wall + gate + moat);
  // 4) Effets sur les combattants (bornés)
  const attMods = {}, defMods = {};
  const plus = (o, k, v) => { if (Math.abs(v) > 1e-6) o[k] = (o[k] || 0) + v; };
  plus(attMods, 'combat.atk', sat(aEff.tower || 0, ATTACK_ENGINES.tower.effect.k, ATTACK_ENGINES.tower.effect.atk));
  if (front) plus(attMods, 'class.infantry.atk', -sat(dEff.pitch || 0, DEFENSE_ENGINES.pitch.effect.k, -DEFENSE_ENGINES.pitch.effect.infantry));
  plus(attMods, 'class.cavalry.atk', -sat(dEff.stakes || 0, DEFENSE_ENGINES.stakes.effect.k, -DEFENSE_ENGINES.stakes.effect.cavalry));
  plus(defMods, 'combat.def', sat(dEff.stones || 0, DEFENSE_ENGINES.stones.effect.k, DEFENSE_ENGINES.stones.effect.def));
  plus(defMods, 'combat.atk', sat(dEff.archers || 0, DEFENSE_ENGINES.archers.effect.k, DEFENSE_ENGINES.archers.effect.atk));
  plus(defMods, 'combat.atk', -sat(aEff.mantlets || 0, ATTACK_ENGINES.mantlets.effect.k, -ATTACK_ENGINES.mantlets.effect.defAtk));
  return { fort, base, herse, keep, prot: { wall, gate, moat }, attMods, defMods, aEff, dEff, notes };
}

// ───────── La bataille ─────────
// att : { waves: [{ left:{units,engines}, front:{…}, right:{…} }], mods, formation, label, supply, famine }
// def : { units, shares:{left,front,right,yard}, engines:{left:{},front:{},right:{}}, prot, mods, formation, label, supply, famine }
// ctx : { terrain, weather, seed }. Reproductible : même entrée et même graine → même résultat.
export function siegeBattle(att, def, ctx = {}) {
  // Les combats gardent la part de hasard du moteur, tirée de la graine : même graine → même bataille
  return rng.seeded(((ctx.seed ?? 1) * 2246822519) >>> 0, () => siegeBattleRun(att, def, ctx));
}
function siegeBattleRun(att, def, ctx) {
  const rand = mulberry32(((ctx.seed ?? 1) * 2654435761) >>> 0);
  const fortune = () => (rand() * 2 - 1) * SIEGE_RULES.variance;
  const one = !!def.prot.oneFlank;
  const flanks = one ? ['front'] : FL;
  const sh = one ? { front: (def.shares.left || 0) + (def.shares.front || 0) + (def.shares.right || 0), yard: def.shares.yard || 0 } : def.shares;
  const totSh = flanks.reduce((a, f) => a + (sh[f] || 0), 0) + (sh.yard || 0) || 1;
  const defOn = {};
  for (const f of flanks) defOn[f] = scale(def.units, (sh[f] || 0) / totSh);
  let yard = scale(def.units, (sh.yard || 0) / totSh);
  // Engins de défense : sur un seul front, tout ce qui est posé y est regroupé
  const dEng = {};
  for (const f of flanks) dEng[f] = {};
  for (const f of FL) for (const [k, n] of Object.entries(def.engines?.[f] || {})) { const g = one ? 'front' : f; dEng[g][k] = (dEng[g][k] || 0) + n; }
  // Vagues : sur un seul front, tout l'assaut passe par la porte
  const waves = (att.waves || []).map((w) => {
    if (!one) return w;
    const units = FL.reduce((a, f) => add(a, w[f]?.units), {});
    const engines = FL.reduce((a, f) => add(a, w[f]?.engines), {});
    return { front: { units, engines } };
  });
  const attacked = flanks.filter((f) => waves.some((w) => sum(w[f]?.units) > 0));
  // Les flancs qui ne sont pas attaqués envoient une part de leurs troupes en renfort
  if (attacked.length && attacked.length < flanks.length) {
    for (const f of flanks.filter((x) => !attacked.includes(x))) {
      const mv = scale(defOn[f], SIEGE_RULES.idleShift);
      for (const [u, n] of Object.entries(mv)) defOn[f][u] = Math.max(0, (defOn[f][u] || 0) - n);
      const part = scale(mv, 1 / attacked.length);
      for (const g of attacked) defOn[g] = add(defOn[g], part);
    }
  }
  // La réserve de la cour renforce les flancs attaqués avant l'assaut
  if (attacked.length && sum(yard) > 0) {
    const rf = scale(yard, SIEGE_RULES.yardReinforce);
    const part = scale(rf, 1 / attacked.length);
    for (const f of attacked) defOn[f] = add(defOn[f], part);
    for (const [u, n] of Object.entries(rf)) yard[u] = Math.max(0, (yard[u] || 0) - n);
  }
  const defStart = add(FL.reduce((a, f) => add(a, defOn[f]), {}), yard);
  const attStart = waves.reduce((a, w) => FL.reduce((b, f) => add(b, w[f]?.units), a), {});
  const report = { flanks: {}, yard: null, oneFlank: one, attacked };
  for (const f of flanks) report.flanks[f] = { waves: [], breached: false, protBase: null, protFinal: null };
  const breached = [];
  let toYard = {}, retreat = {};
  const engStats = { attack: { used: {}, lost: {}, recovered: {} }, defense: { used: {}, lost: {}, kept: {} } };
  const bump = (o, k, n) => { if (n > 0) o[k] = (o[k] || 0) + n; };
  const ctxB = { terrain: ctx.terrain || 'city', weather: ctx.weather || 'clear', deterministic: !!ctx.deterministic };
  let lastRes = null;
  // Chaque flanc : les vagues engagent leurs engins l'une après l'autre (la première attire et use les engins de
  // défense, la réduction de protection se cumule), puis toutes les troupes du flanc donnent l'assaut ensemble
  for (const f of flanks) {
    const units = waves.reduce((a, w) => add(a, w[f]?.units), {});
    const engW = waves.map((w) => clean(w[f]?.engines));
    if (!sum(units)) { for (const e of engW) for (const [k, n] of Object.entries(e)) bump(engStats.attack.recovered, k, n); continue; }
    const X = report.flanks[f];
    // Artillerie : catapultes et trébuchets détruisent des engins de défense de ce flanc
    let destroy = 0;
    for (const [u, k] of Object.entries(SIEGE_RULES.artillery)) destroy += (units[u] || 0) * k;
    if (destroy > 0) for (const k of Object.keys(dEng[f])) { const d = Math.min(dEng[f][k], destroy * dEng[f][k] / (sum(dEng[f]) || 1)); dEng[f][k] -= d; bump(engStats.defense.lost, k, d); }
    const kept = { wall: 1, gate: 1, moat: 1 };
    let fx = null, attMods = {}, firstBase = null;
    const used = {};
    for (let w = 0; w < engW.length; w++) {
      if (!sum(engW[w]) && w > 0) continue;
      fx = flankEffects(engW[w], dEng[f], def.prot, f);
      for (const k of Object.keys(kept)) kept[k] *= fx.keep[k];
      if (firstBase === null) firstBase = fx.base;
      X.waves.push({ w, engines: engW[w], fort: fx.fort, keep: { ...kept }, notes: fx.notes });
      for (const [k, n] of Object.entries(engW[w])) bump(used, k, n);
      // Les engins de défense qui ont servi contre cette vague sont en partie consommés
      if (sum(engW[w])) for (const k of Object.keys(dEng[f])) { const n = dEng[f][k]; if (!(n > 0)) continue; const spent = n * SIEGE_RULES.defenseUsedHeld; dEng[f][k] = n - spent; bump(engStats.defense.used, k, spent); bump(engStats.defense.lost, k, spent); }
      attMods = merge(attMods, fx.attMods);
    }
    // L'assaut, à la protection qui reste, contre les défenseurs du flanc (engins de défense restants)
    // Ce que les vagues ont abattu reste abattu ; la herse restante compte encore
    const last = flankEffects({}, dEng[f], def.prot, f);
    const fort = Math.max(0, f === 'front' ? (def.prot.gate + last.herse) * kept.gate + def.prot.moat * kept.moat : def.prot.wall * kept.wall + def.prot.moat * kept.moat);
    X.protBase = firstBase ?? last.base;
    X.protFinal = fort;
    const dHere = clean(defOn[f]);
    const res = sum(dHere)
      ? simulateBattle(
        { units, mods: merge(att.mods, attMods, { 'combat.atk': fortune() }), formation: att.formation, supply: att.supply, famine: att.famine, label: att.label },
        { units: dHere, mods: merge(def.mods, last.defMods), fort, formation: def.formation, supply: def.supply, famine: def.famine, label: def.label },
        ctxB)
      : { winner: 'attacker', attRemaining: units, defRemaining: {}, attLosses: {}, defLosses: {}, rounds: [], notes: [] };
    lastRes = res;
    const win = res.winner === 'attacker';
    for (const [k, n] of Object.entries(used)) { bump(engStats.attack.used, k, n); if (win) { bump(engStats.attack.recovered, k, n * SIEGE_RULES.recoverWin); bump(engStats.attack.lost, k, n * (1 - SIEGE_RULES.recoverWin)); } else bump(engStats.attack.lost, k, n); }
    if (win) for (const [k, n] of Object.entries(dEng[f])) { if (n > 0) { bump(engStats.defense.lost, k, n); dEng[f][k] = 0; } }
    X.fight = { units, defenders: dHere, fort, win, attLosses: clean(res.attLosses), defLosses: clean(res.defLosses), rounds: res.rounds?.length || 0 };
    defOn[f] = clean(res.defRemaining);
    if (win) { breached.push(f); X.breached = true; toYard = add(toYard, clean(res.attRemaining)); defOn[f] = {}; }
    else retreat = add(retreat, clean(res.attRemaining));
  }
  for (const f of flanks) for (const [k, n] of Object.entries(dEng[f])) if (n > 0.01) bump(engStats.defense.kept, k, n);
  // La cour
  let winner = 'defender';
  let defEnd = add(FL.reduce((a, f) => add(a, defOn[f]), {}), yard);
  let attEnd = add(retreat, toYard);
  if (breached.length) {
    const held = flanks.filter((f) => !breached.includes(f));
    const yardDef = add(yard, held.reduce((a, f) => add(a, scale(defOn[f], SIEGE_RULES.fallback)), {}));
    const stay = held.reduce((a, f) => add(a, scale(defOn[f], 1 - SIEGE_RULES.fallback)), {});
    const bonus = SIEGE_RULES.yardBonus[Math.min(3, breached.length)];
    const res = sum(yardDef)
      ? simulateBattle(
        { units: toYard, mods: merge(att.mods, { 'combat.atk': bonus + fortune() }), formation: att.formation, label: att.label },
        { units: yardDef, mods: def.mods, fort: 0, formation: def.formation, supply: def.supply, famine: def.famine, label: def.label },
        ctxB)
      : { winner: 'attacker', attRemaining: toYard, defRemaining: {}, attLosses: {}, defLosses: {}, rounds: [], notes: [] };
    lastRes = res;
    winner = res.winner;
    report.yard = { attackers: toYard, defenders: yardDef, bonus, win: winner === 'attacker', attLosses: clean(res.attLosses), defLosses: clean(res.defLosses) };
    defEnd = add(stay, clean(res.defRemaining));
    attEnd = add(retreat, clean(res.attRemaining));
  }
  const loss = (start, end) => Object.fromEntries(Object.entries(start).map(([u, n]) => [u, Math.max(0, n - (end[u] || 0))]).filter(([, n]) => n > 0));
  const defRemaining = Object.fromEntries(Object.keys(defStart).map((u) => [u, Math.min(defStart[u], Math.round(defEnd[u] || 0))]));
  const attRemaining = Object.fromEntries(Object.keys(attStart).map((u) => [u, Math.min(attStart[u], Math.round(attEnd[u] || 0))]));
  const out = {
    winner, breached, report, engines: roundStats(engStats),
    attRemaining, defRemaining, attLosses: loss(attStart, attRemaining), defLosses: loss(defStart, defRemaining),
    rounds: lastRes?.rounds || [], notes: lastRes?.notes || [], bossDamage: 0, moraleA: lastRes?.moraleA, moraleD: lastRes?.moraleD, routed: lastRes?.routed || null,
  };
  out.key = keySentence(out, def.prot);
  return out;
}
function merge(...ms) { const o = {}; for (const m of ms) for (const [k, v] of Object.entries(m || {})) o[k] = (o[k] || 0) + v; return o; }
function roundStats(s) { const r = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, Math.round(v * 10) / 10]).filter(([, v]) => v > 0)); return { attack: { used: r(s.attack.used), lost: r(s.attack.lost), recovered: r(s.attack.recovered) }, defense: { used: r(s.defense.used), lost: r(s.defense.lost), kept: r(s.defense.kept) } }; }
const pct = (v) => `${Math.round(v * 100)} %`;
const flankName = (f) => FLANKS[f].name.toLowerCase();
// La phrase qui explique la clé de l'issue
function keySentence(r, prot) {
  const R = r.report;
  const counters = Object.values(R.flanks).flatMap((x) => x.waves.flatMap((w) => w.notes.filter((n) => n.kind === 'counter' && n.pct > 0.3)));
  const drop = Object.entries(R.flanks).map(([f, x]) => ({ f, from: x.protBase, to: x.protFinal })).filter((x) => x.from != null).sort((a, b) => (b.from - b.to) - (a.from - a.to))[0];
  if (!r.breached.length) {
    if (counters.length) { const c = counters.sort((a, b) => b.pct - a.pct)[0]; return `Aucun flanc n’a cédé : ${ENG[c.by].name.toLowerCase()} ont annulé ${pct(c.pct)} de l’effet des ${ENG[c.target].name.toLowerCase()}.`; }
    return drop && drop.to > 0.05 ? `Aucun flanc n’a cédé : la protection est restée à +${pct(drop.to)} sur le ${flankName(drop.f)}.` : 'Aucun flanc n’a cédé : la garnison a tenu.';
  }
  const f = r.breached[0];
  const x = R.flanks[f];
  const why = x.protBase > 0.02 ? ` (protection réduite de +${pct(x.protBase)} à +${pct(x.protFinal)})` : (prot.wall + prot.gate + prot.moat < 0.02 ? ' (aucune muraille)' : '');
  const yard = R.yard ? (R.yard.win ? `, puis la cour est tombée${R.yard.bonus ? ` (assaillants +${pct(R.yard.bonus)} pour ${r.breached.length} flanc${r.breached.length > 1 ? 's' : ''} percé${r.breached.length > 1 ? 's' : ''})` : ''}.` : ', mais la réserve de la cour a repoussé l’assaut.') : '.';
  return `Le ${flankName(f)} a cédé${why}${yard}`;
}

// ───────── Plans d'attaque ─────────
// Un plan : { waves: [{ left:{share, engines}, front:{…}, right:{…} }] } ; les parts sont des fractions de l'armée
export function maxWaves(state, hero = null) {
  let n = 1;
  if (attackWorkshop(state) >= 5) n++;
  if (state.techs?.mil_siege) n++;
  if ((hero && hero.level >= 15) || state.techs?.mil_trebuchet) n++;
  return Math.min(SIEGE_RULES.maxWaves, n);
}
export const attackLimit = (state, mods = computeMods(state)) => SIEGE_RULES.attackPerFlank(attackWorkshop(state), mods);
export function planToWaves(plan, units) {
  const total = (plan?.waves || []).reduce((a, w) => a + FL.reduce((b, f) => b + (w[f]?.share || 0), 0), 0) || 1;
  return (plan?.waves || []).map((w) => Object.fromEntries(FL.map((f) => [f, { units: scale(units, (w[f]?.share || 0) / total), engines: clean(w[f]?.engines) }])));
}
export const planEngines = (plan) => (plan?.waves || []).reduce((a, w) => FL.reduce((b, f) => add(b, w[f]?.engines), a), {});
export function validatePlan(state, plan, { oneFlank = false } = {}) {
  const lim = attackLimit(state);
  const need = planEngines(plan);
  const S = siegeState(state);
  for (const [k, n] of Object.entries(need)) {
    const d = ATTACK_ENGINES[k];
    if (!d) return { ok: false, reason: 'Engin inconnu' };
    if ((S.arsenal.attack[k] || 0) < n) return { ok: false, reason: `Pas assez de ${d.name.toLowerCase()} à l’arsenal (${S.arsenal.attack[k] || 0}/${n})` };
  }
  for (const w of plan.waves || []) for (const f of FL) {
    const e = w[f]?.engines || {};
    if (sum(e) > lim) return { ok: false, reason: `Au plus ${lim} engins par flanc et par vague` };
    if (!oneFlank) for (const k of Object.keys(e)) if (!ATTACK_ENGINES[k].flanks.includes(f)) return { ok: false, reason: `${ATTACK_ENGINES[k].name} : ${ATTACK_ENGINES[k].flanks.map(flankName).join(', ')} seulement` };
  }
  if ((plan.waves || []).length > SIEGE_RULES.maxWaves) return { ok: false, reason: 'Trop de vagues' };
  return { ok: true };
}
// Plan conseillé contre une place, d'après ce qu'on en sait (protections, engins posés, flanc le plus faible)
export function advisedAttackPlan(state, intel, { waves = 1, hero = null } = {}) {
  const S = siegeState(state);
  const st = { ...S.arsenal.attack };
  const lim = attackLimit(state);
  const nW = Math.max(1, Math.min(waves, maxWaves(state, hero)));
  const one = intel.prot.oneFlank;
  const weak = one ? 'front' : FL.slice().sort((a, b) => flankStrength(intel, a) - flankStrength(intel, b))[0];
  const why = [];
  const take = (k, n) => { const v = Math.min(st[k] || 0, n); st[k] = (st[k] || 0) - v; return v; };
  const enginesFor = (f) => {
    const e = {};
    const d = intel.engines?.[f] || {};
    const room = () => lim - sum(e);
    if (f === 'front' && intel.prot.gate > 0) { const v = take('ram', Math.min(room(), d.pitch ? 6 : 4)); if (v) e.ram = v; }
    if (f !== 'front' && intel.prot.wall > 0) { const v = take('ladders', Math.min(room(), d.stones ? 6 : 4)); if (v) e.ladders = v; }
    if ((d.stones || d.pitch || d.hooks) && room() > 0) { const v = take('mantlets', Math.min(room(), 3)); if (v) { e.mantlets = v; why.push(`mantelets contre ${d.pitch ? 'la poix' : d.stones ? 'les pierres' : 'les crochets'}`); } }
    if (intel.prot.moat > 0 && room() > 0) { const v = take('fascines', Math.min(room(), 3)); if (v) e.fascines = v; }
    if ((d.stakes || d.portcullis) && room() > 0) { const v = take('fireArrows', Math.min(room(), 3)); if (v) e.fireArrows = v; }
    if (f !== 'front' && room() > 0 && !d.hooks) { const v = take('tower', 1); if (v) e.tower = v; }
    return e;
  };
  const plan = { waves: [] };
  for (let w = 0; w < nW; w++) {
    const wave = {};
    for (const f of FL) wave[f] = { share: 0, engines: {} };
    if (one) wave.front = { share: 1 / nW, engines: enginesFor('front') };
    else {
      const main = w === 0 ? 0.6 : 0.5;
      wave[weak] = { share: main / nW, engines: enginesFor(weak) };
      const others = FL.filter((f) => f !== weak);
      for (const f of others) wave[f] = { share: (1 - main) / 2 / nW, engines: w === 0 ? enginesFor(f) : {} };
    }
    plan.waves.push(wave);
  }
  if (!one) why.unshift(`effort principal sur le ${flankName(weak)} (le moins protégé selon vos renseignements)`);
  return { plan, why };
}
function flankStrength(intel, f) {
  const p = intel.prot;
  const base = (f === 'front' ? p.gate : p.wall) + p.moat;
  const eng = sum(intel.engines?.[f] || {}) * 0.02;
  const troops = (intel.shares?.[f] ?? 0.25);
  return base + eng + troops;
}

// ───────── Défense de places adverses ─────────
// Engins et répartition d'une place tenue par l'ennemi, selon sa protection (doctrine simple : la porte d'abord)
export function targetDefense(fort, poi = {}) {
  const prot = targetProtections(fort, poi);
  const n = Math.round(fort * 24);
  const engines = { left: {}, front: {}, right: {} };
  if (n > 0) {
    engines.front.pitch = Math.ceil(n * 0.35);
    engines.left.stones = Math.ceil(n * 0.2); engines.right.stones = Math.ceil(n * 0.2);
    if (fort >= 0.25) { engines.left.archers = Math.ceil(n * 0.1); engines.right.archers = Math.ceil(n * 0.1); }
    if (fort >= 0.6) engines.front.portcullis = 2;
    if (fort >= 0.8) { engines.left.hooks = 1; engines.right.hooks = 1; }
  }
  return { prot, engines, shares: prot.oneFlank ? { left: 0, front: 0.75, right: 0, yard: 0.25 } : { left: 0.2, front: 0.35, right: 0.2, yard: 0.25 } };
}
// Ce que le joueur sait d'une place adverse (renseignement imparfait si elle n'est pas espionnée)
export function targetIntel(fort, poi = {}, scouted = false, seed = 1) {
  const D = targetDefense(fort, poi);
  if (scouted) return { ...D, exact: true };
  const r = mulberry32(seed >>> 0);
  const fuzz = (n) => Math.max(0, Math.round(n * (0.8 + r() * 0.4)));
  const engines = Object.fromEntries(FL.map((f) => [f, Object.fromEntries(Object.entries(D.engines[f]).map(([k, n]) => [k, fuzz(n)]))]));
  return { ...D, engines, exact: false };
}

// ───────── Raids contre le château : engins, vagues et adaptation ─────────
const STYLES = ['gate', 'escalade', 'mixed'];
const STYLE_NAME = { gate: 'par la porte', escalade: 'à l’échelle', mixed: 'sur plusieurs flancs' };
export function raidEngines(state, poi, army, t, flankHint = null) {
  const prot = castleProtections(state);
  const th = Math.max(1, thLevel(state));
  if (prot.wall + prot.moat < 0.01) return { plan: { waves: [{ front: { share: 1, engines: {} }, left: { share: 0, engines: {} }, right: { share: 0, engines: {} } }] }, engines: {}, style: 'none', adapt: null, army };
  // Une part de la puissance va aux engins : les troupes diminuent d'autant
  const troops = scale(army, 1 - RAID_ENGINES.budget);
  const total = Math.max(2, Math.round(RAID_ENGINES.perTh * th));
  let style = STYLES[(poi?.rival || 0) % 3];
  let main = prot.oneFlank ? 'front' : flankHint && FL.includes(flankHint) ? flankHint : style === 'gate' ? 'front' : 'left';
  if (style === 'gate' && !prot.oneFlank) main = 'front';
  // Adaptation : ce que les raids précédents de ce seigneur ont vu sur les remparts
  const mem = siegeState(state).memory[poi?.rival ?? 'x'] || null;
  let adapt = null;
  const extra = {};
  if (mem && !prot.oneFlank) {
    const seenAt = (f, k) => (mem.flanks?.[f]?.[k] || 0);
    if (main === 'front' && seenAt('front', 'pitch') >= 3) { main = seenAt('left', 'stones') <= seenAt('right', 'stones') ? 'left' : 'right'; extra.mantlets = 3; adapt = `trop de poix à la porte la dernière fois : ils viennent par le ${flankName(main)}, avec des mantelets`; }
    else if (main !== 'front' && seenAt(main, 'stones') >= 3) { extra.mantlets = 3; adapt = `ils ont vu vos pierres sur le ${flankName(main)} : ils apportent des mantelets`; }
    if (mem.archers >= 4 && th >= 10) { extra.tower = 1; adapt = (adapt ? adapt + ' ; ' : '') + 'contre vos archères, une tour de siège'; }
    if (mem.hooks >= 2) { delete extra.tower; adapt = (adapt ? adapt + ' ; ' : '') + 'vos crochets les ont dissuadés de la tour'; }
  }
  const nW = prot.oneFlank ? 1 : RAID_ENGINES.waves(th);
  const engFor = (f, n) => {
    const e = {};
    if (f === 'front') e.ram = Math.ceil(n * 0.6); else e.ladders = Math.ceil(n * 0.6);
    if (prot.moat > 0) e.fascines = Math.ceil(n * 0.2);
    if (extra.mantlets) e.mantlets = extra.mantlets; else if (n >= 6) e.mantlets = Math.ceil(n * 0.2);
    if (extra.tower && f !== 'front') e.tower = extra.tower;
    return e;
  };
  const waves = [];
  for (let w = 0; w < nW; w++) {
    const wave = { left: { share: 0, engines: {} }, front: { share: 0, engines: {} }, right: { share: 0, engines: {} } };
    if (prot.oneFlank) wave.front = { share: 1, engines: engFor('front', total) };
    else {
      const second = style === 'mixed' ? FL.find((f) => f !== main) : null;
      wave[main] = { share: (second ? 0.65 : 1) / nW, engines: w === 0 ? engFor(main, second ? Math.ceil(total * 0.65) : total) : {} };
      if (second) wave[second] = { share: 0.35 / nW, engines: w === 0 ? engFor(second, Math.floor(total * 0.35)) : {} };
    }
    waves.push(wave);
  }
  const engines = planEngines({ waves });
  return { plan: { waves }, engines, style, styleText: STYLE_NAME[style], adapt, army: troops, mainFlank: main };
}
// Mémoire des remparts vus par un seigneur (pour son prochain raid)
export function remember(state, rival, posted) {
  const S = siegeState(state);
  const m = S.memory[rival] ||= { flanks: {}, archers: 0, hooks: 0, raids: 0 };
  m.raids++;
  m.flanks = {};
  for (const f of FL) m.flanks[f] = { ...(posted[f] || {}) };
  m.archers = FL.reduce((a, f) => a + (posted[f]?.archers || 0), 0);
  m.hooks = FL.reduce((a, f) => a + (posted[f]?.hooks || 0), 0);
}
// Ce que la tour de guet révèle d'un raid qui approche
export function raidIntel(state, raid) {
  const lvl = levelOf(state, 'watchtower');
  const exact = lvl >= INTEL.exact;
  const approx = (n) => (exact ? n : Math.round(n / 5) * 5 || n);
  return {
    troops: lvl >= INTEL.troops || raid.seen ? approx(sum(raid.army)) : null,
    engines: lvl >= INTEL.engines ? Object.fromEntries(Object.entries(raid.engines || {}).map(([k, n]) => [k, exact ? n : Math.max(1, Math.round(n / 2) * 2)])) : null,
    flank: lvl >= INTEL.flank || raid.flankSeen ? raid.mainFlank || raid.flank : null,
    adapt: lvl >= INTEL.engines ? raid.adapt || null : null,
    level: lvl,
  };
}

// ───────── Défense conseillée (et mode simplifié) ─────────
// Répartit les troupes (le flanc annoncé d'abord) et pose les engins du stock face aux engins annoncés
export function advisedDefense(state, raid = null) {
  const prot = castleProtections(state);
  const intel = raid ? raidIntel(state, raid) : {};
  const S = siegeState(state);
  const stock = { ...S.arsenal.defense };
  const lim = defenseLimit(state);
  const shares = prot.oneFlank ? { left: 0, front: 1, right: 0, yard: 0 } : intel.flank ? Object.fromEntries([...FL.map((f) => [f, f === intel.flank ? 0.4 : 0.15]), ['yard', 0.3]]) : { left: 0.25, front: 0.25, right: 0.25, yard: 0.25 };
  const posted = { left: {}, front: {}, right: {} };
  const why = [];
  const flanks = prot.oneFlank ? ['front'] : FL;
  const order = intel.flank ? [intel.flank, ...flanks.filter((f) => f !== intel.flank)] : ['front', ...flanks.filter((f) => f !== 'front')];
  const want = (f) => {
    const w = {};
    const e = intel.engines || {};
    if (f === 'front') { w.pitch = 1 + (e.ram || 0); w.portcullis = 2; } else w.stones = 1 + (e.ladders || 0);
    if (e.mantlets) w.archers = e.mantlets + 1; else w.archers = 2;
    if (e.fascines || prot.moat > 0) w.stakes = (e.fascines || 1) + 1;
    if (e.tower) w.hooks = e.tower + 1;
    return w;
  };
  for (const f of order) {
    const share = f === (intel.flank || null) ? 2 : 1;
    for (const [k, n] of Object.entries(want(f))) {
      if (!DEFENSE_ENGINES[k] || (DEFENSE_ENGINES[k].flanks && !DEFENSE_ENGINES[k].flanks.includes(f))) continue;
      const room = lim - sum(posted[f]);
      const v = Math.min(stock[k] || 0, n * share, room);
      if (v > 0) { posted[f][k] = v; stock[k] -= v; }
    }
  }
  if (intel.flank) why.push(`40 % de la garnison sur le ${flankName(intel.flank)}, flanc annoncé par la tour de guet`);
  if (intel.engines) why.push(`engins posés face aux engins annoncés (${Object.entries(intel.engines).map(([k, n]) => `${n} ${ENG[k].name.toLowerCase()}`).join(', ')})`);
  if (!sum(S.arsenal.defense)) why.push('aucun engin de défense à l’arsenal : fabriquez-en (pierres et poix d’abord)');
  return { shares, posted, why };
}
export function applyDefense(state, d) {
  const C = castleState(state);
  C.flanks = { ...d.shares };
  const S = siegeState(state);
  S.posted = { left: { ...d.posted.left }, front: { ...d.posted.front }, right: { ...d.posted.right } };
  return { ok: true };
}
// Pour la simulation et le mode simplifié : défense conseillée, avec un petit stock d'engins de défense
export function prepareDefense(state, t = Date.now()) {
  const S = siegeState(state);
  const lvl = defenseWorkshop(state);
  if (lvl > 0) for (const k of Object.keys(DEFENSE_ENGINES)) if (engineUnlocked(state, k)) S.arsenal.defense[k] = Math.max(S.arsenal.defense[k] || 0, Math.min(arsenalCap(state, 'defense') / 6, 4 + lvl));
  const raid = (state.raids || [])[0] || null;
  return applyDefense(state, advisedDefense(state, raid));
}

// ───────── Plans enregistrés (3 d'attaque, 3 de défense) ─────────
export function savePlan(state, kind, idx, name, plan) {
  if (!['attack', 'defense'].includes(kind) || !(idx >= 0 && idx < PLAN_SLOTS)) return { ok: false };
  const S = siegeState(state);
  const p = kind === 'defense' ? { shares: { ...castleState(state).flanks }, posted: JSON.parse(JSON.stringify(S.posted)) } : JSON.parse(JSON.stringify(plan));
  S.plans[kind][idx] = { name: String(name || `Plan ${idx + 1}`).slice(0, 24), plan: p };
  return { ok: true };
}
export function loadDefensePlan(state, idx) {
  const p = siegeState(state).plans.defense[idx];
  if (!p) return { ok: false, reason: 'Plan vide' };
  const S = siegeState(state);
  castleState(state).flanks = { ...p.plan.shares };
  S.posted = { left: {}, front: {}, right: {} };
  for (const f of FL) for (const [k, n] of Object.entries(p.plan.posted[f] || {})) postEngine(state, f, k, n);
  return { ok: true, name: p.name };
}

// ───────── Défense du château face à un raid (appelée par rivals.resolveRaid) ─────────
export function defendCastle(state, raid, defenders, defMods, t, ctxExtra = {}) {
  const S = siegeState(state);
  const prot = castleProtections(state, ctxExtra.mods || computeMods(state, t));
  const plan = raid.plan || raidEngines(state, { rival: raid.rival }, raid.army, t, raid.flank).plan;
  const waves = planToWaves(plan, raid.army);
  const res = siegeBattle(
    { waves, mods: { 'combat.atk': 0.05 }, formation: 'assault', label: raid.name },
    { units: defenders, shares: defenseShares(state, prot.oneFlank), engines: S.posted, prot, mods: defMods, formation: 'shieldwall', label: 'Garnison', supply: ctxExtra.supply, famine: ctxExtra.famine },
    { terrain: 'city', weather: state.weather?.type, seed: hashSeed(raid.id) },
  );
  // Engins de défense consommés (retirés du stock et des flancs) ; mémoire des remparts pour le seigneur
  remember(state, raid.rival, S.posted);
  for (const f of FL) for (const [k, n] of Object.entries(S.posted[f])) {
    const x = res.report.flanks[res.report.oneFlank ? 'front' : f];
    const usedHere = x?.waves?.length ? (x.breached ? n : Math.round(n * SIEGE_RULES.defenseUsedHeld)) : 0;
    if (!usedHere) continue;
    S.posted[f][k] = n - usedHere;
    if (S.posted[f][k] <= 0) delete S.posted[f][k];
    S.arsenal.defense[k] = Math.max(0, (S.arsenal.defense[k] || 0) - usedHere);
  }
  return { res, prot };
}
export function hashSeed(s) { let h = 2166136261; for (const c of String(s || 'x')) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }

// ───────── Attaque d'une place (appelée par marchBattle) ─────────
export function attackFortress(att, enemies, fort, poi, ctx, plan = null) {
  const D = targetDefense(fort, poi);
  const waves = plan ? planToWaves(plan, att.units) : [{ front: { units: att.units, engines: {} }, left: { units: {}, engines: {} }, right: { units: {}, engines: {} } }];
  return siegeBattle(
    { waves, mods: att.mods, formation: att.formation, supply: att.supply, famine: att.famine, label: att.label },
    { units: enemies, shares: D.shares, engines: D.engines, prot: D.prot, mods: ctx.enemyMods, formation: ctx.enemyFormation, label: ctx.enemyLabel },
    { terrain: ctx.terrain, weather: ctx.weather, seed: ctx.seed },
  );
}

// ───────── Conseil de guerre : aperçu avec fourchette ─────────
export function warCouncil(att, enemies, fort, poi, ctx, plan) {
  const runs = [];
  for (let i = 0; i < 5; i++) runs.push(attackFortress(att, enemies, fort, poi, { ...ctx, seed: 101 + i * 7919 }, plan));
  const wins = runs.filter((r) => r.winner === 'attacker').length;
  const loss = runs.map((r) => sum(r.attLosses) / (sum(att.units) || 1)).sort((a, b) => a - b);
  const r0 = runs[2];
  const D = targetDefense(fort, poi);
  const missingCounters = [];
  for (const f of FL) for (const k of Object.keys(D.engines[f] || {})) {
    const by = DEFENSE_ENGINES[k]?.counteredBy;
    const list = Array.isArray(by) ? by : [by];
    if (!list.some((b) => (plan?.waves || []).some((w) => w[f]?.engines?.[b]))) missingCounters.push(`${ENG[k].name.toLowerCase()} au ${flankName(f)} (contre : ${list.map((b) => ENG[b].name.toLowerCase()).join(' ou ')})`);
  }
  return {
    wins, of: runs.length, verdict: wins >= 4 ? 'Victoire probable' : wins >= 2 ? 'Issue incertaine' : 'Défaite probable',
    lossRange: [loss[0], loss[loss.length - 1]],
    flanks: Object.fromEntries(Object.entries(r0.report.flanks).map(([f, x]) => [f, { breached: x.breached, from: x.protBase, to: x.protFinal, waves: x.waves.length }])),
    yard: r0.report.yard ? { win: r0.report.yard.win, bonus: r0.report.yard.bonus } : null,
    key: r0.key, missingCounters: [...new Set(missingCounters)].slice(0, 4),
  };
}

// ───────── Grille de stratégies (outil de simulation d'équilibre) ─────────
export function strategyGrid(state, { n = 20 } = {}) {
  const prot = castleProtections(state);
  const army = { spearman: 1200, swordsman: 400, archer: 600, lightcav: 200 };
  // Garnison calibrée : l'assaut sans engin contre une défense neutre gagne environ une fois sur deux
  const g0 = { spearman: 900, swordsman: 200, archer: 500 };
  const plain = (k, seed) => { const waves = planToWaves({ waves: [{ left: { share: 0, engines: {} }, front: { share: 1, engines: {} }, right: { share: 0, engines: {} } }] }, army); return siegeBattle({ waves, mods: {}, formation: 'assault', label: 'A' }, { units: scale(g0, k), shares: { left: 0.25, front: 0.25, right: 0.25, yard: 0.25 }, engines: {}, prot, mods: {}, formation: 'shieldwall', label: 'D' }, { seed }).winner === 'attacker'; };
  let lo = 0.05, hi = 8;
  for (let it = 0; it < 14; it++) { const mid = Math.sqrt(lo * hi); let w = 0; for (let i = 0; i < 12; i++) if (plain(mid, 500 + i)) w++; if (w / 12 > 0.5) lo = mid; else hi = mid; }
  const garrison = scale(g0, Math.sqrt(lo * hi));
  const ATT = {
    'porte (béliers)': { waves: [{ front: { share: 1, engines: { ram: 10, mantlets: 3 } } }] },
    'échelles (flanc gauche)': { waves: [{ left: { share: 1, engines: { ladders: 10, mantlets: 3 } } }] },
    'deux flancs': { waves: [{ left: { share: 0.5, engines: { ladders: 6 } }, right: { share: 0.5, engines: { ladders: 6 } } }] },
    'tour de siège': { waves: [{ right: { share: 1, engines: { tower: 2, ladders: 4 } } }] },
    'trois vagues au front': { waves: [0, 1, 2].map(() => ({ front: { share: 1 / 3, engines: { ram: 4, mantlets: 2 } } })) },
    'sans engin': { waves: [{ front: { share: 1, engines: {} } }] },
  };
  const DEF = {
    neutre: { shares: { left: 0.25, front: 0.25, right: 0.25, yard: 0.25 }, posted: {} },
    'poix à la porte': { shares: { left: 0.2, front: 0.4, right: 0.2, yard: 0.2 }, posted: { front: { pitch: 10, portcullis: 3 } } },
    'pierres aux flancs': { shares: { left: 0.3, front: 0.2, right: 0.3, yard: 0.2 }, posted: { left: { stones: 8, archers: 3 }, right: { stones: 8, archers: 3 } } },
    'crochets et pierres aux flancs': { shares: { left: 0.3, front: 0.2, right: 0.3, yard: 0.2 }, posted: { left: { hooks: 4, stones: 6 }, right: { hooks: 4, stones: 6 } } },
    'tout contre tout': { shares: { left: 0.25, front: 0.25, right: 0.25, yard: 0.25 }, posted: { left: { stones: 5, archers: 3, hooks: 2 }, front: { pitch: 6, archers: 3 }, right: { stones: 5, archers: 3, hooks: 2 } } },
  };
  const grid = {};
  for (const [an, ap] of Object.entries(ATT)) {
    grid[an] = {};
    for (const [dn, dp] of Object.entries(DEF)) {
      let w = 0;
      for (let i = 0; i < n; i++) {
        const waves = planToWaves({ waves: ap.waves.map((x) => ({ left: { share: 0, engines: {} }, front: { share: 0, engines: {} }, right: { share: 0, engines: {} }, ...x })) }, army);
        const r = siegeBattle({ waves, mods: {}, formation: 'assault', label: 'A' }, { units: garrison, shares: dp.shares, engines: dp.posted, prot, mods: {}, formation: 'shieldwall', label: 'D' }, { seed: 1 + i });
        if (r.winner === 'attacker') w++;
      }
      grid[an][dn] = Math.round((w / n) * 100);
    }
  }
  return { prot: { wall: prot.wall, gate: prot.gate, moat: prot.moat }, army, garrison, grid };
}
void ALL_UNITS; void UNITS;
