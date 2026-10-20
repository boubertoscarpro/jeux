// v20 « Ma forteresse » — Terres lointaines (module pur). Un comptoir fortifié par contrée, fondé à partir d'un
// avant-poste de niveau suffisant (le camp de base). Production modeste d'une ressource rare existante, menaces
// régulières et prévisibles (la date de la prochaine est affichée), jamais de destruction : une menace perdue
// suspend la production quelques heures et coûte une part de la garnison.
import { FARLANDS, FARLAND_ORDER, FAR } from '../data/farlands.js';
import { UNITS } from '../data/units.js';
import { thLevel } from './city.js';
import { pay, missing, addResource } from './economy.js';
import { computeMods } from './modifiers.js';
import { simulateBattle } from './combat.js';
import { log } from './log.js';
import { hashSeed } from './siege.js';

const unitSum = (u) => Object.values(u || {}).reduce((a, b) => a + b, 0);
const H = 3600000;

export function farState(state) {
  state.farlands ||= {};
  return state.farlands;
}
// Avant-postes qui peuvent servir de camp de base (niveau ≥ FAR.baseLevel et pas déjà pris)
export function baseCamps(state) {
  const used = new Set(Object.values(farState(state)).map((f) => f.base));
  return Object.entries(state.territories || {}).filter(([k, t]) => (t.level || 1) >= FAR.baseLevel && !used.has(k)).map(([k, t]) => ({ k, t }));
}
export function farlandCheck(state, key) {
  const d = FARLANDS[key];
  if (!d) return { ok: false, reason: 'Contrée inconnue' };
  if (farState(state)[key]) return { ok: false, reason: 'Comptoir déjà fondé' };
  if (thLevel(state) < d.th) return { ok: false, reason: `Hôtel de ville niv. ${d.th} requis` };
  if (!baseCamps(state).length) return { ok: false, reason: `Il faut un avant-poste de niveau ${FAR.baseLevel} libre comme camp de base` };
  const cost = FAR.found(FARLAND_ORDER.indexOf(key));
  const miss = missing(state, cost);
  if (Object.keys(miss).length) return { ok: false, reason: 'Ressources insuffisantes', cost, missing: miss };
  return { ok: true, cost };
}
const nextThreat = (key, at, n) => at + (FAR.threatEvery[0] + (hashSeed(key + n) % (FAR.threatEvery[1] - FAR.threatEvery[0] + 1))) * H;

export function foundFarland(state, key, baseKey = null, now = Date.now()) {
  const c = farlandCheck(state, key);
  if (!c.ok) return c;
  const camps = baseCamps(state);
  const base = camps.find((x) => x.k === baseKey) || camps[0];
  if (!pay(state, c.cost)) return { ok: false, reason: 'Ressources insuffisantes' };
  farState(state)[key] = { level: 1, wall: 0, base: base.k, garrison: {}, since: now, last: now, threats: 0, won: 0, lost: 0, nextAt: nextThreat(key, now, 0), haltUntil: 0, produced: 0 };
  log(state, 'good', `${FARLANDS[key].icon} Un comptoir est fondé dans ${FARLANDS[key].name}, depuis l’avant-poste ${base.t.name || base.k}.`, now);
  return { ok: true };
}
export const farProd = (f) => FAR.prodPerLevel * f.level; // par heure
export const garrisonAdvice = (f) => FAR.garrisonPerLevel * f.level;
export function threatUnits(key, f) {
  const d = FARLANDS[key];
  const sc = 1 + FAR.threatScale * (f.level - 1) + (f.threats || 0) * 0.02;
  return Object.fromEntries(Object.entries(d.threat.units).map(([u, n]) => [u, Math.max(1, Math.round(n * sc))]));
}
export function upgradeCheck(state, key, what = 'level') {
  const f = farState(state)[key];
  if (!f) return { ok: false, reason: 'Pas de comptoir' };
  const lvl = what === 'wall' ? f.wall : f.level;
  const max = what === 'wall' ? FAR.maxWall : FAR.maxLevel;
  if (lvl >= max) return { ok: false, reason: 'Niveau maximum' };
  const cost = what === 'wall' ? FAR.wall(lvl) : FAR.up(lvl);
  const miss = missing(state, cost);
  if (Object.keys(miss).length) return { ok: false, reason: 'Ressources insuffisantes', cost, missing: miss };
  return { ok: true, cost };
}
export function upgradeFarland(state, key, what = 'level') {
  const c = upgradeCheck(state, key, what);
  if (!c.ok) return c;
  if (!pay(state, c.cost)) return { ok: false, reason: 'Ressources insuffisantes' };
  const f = farState(state)[key];
  if (what === 'wall') f.wall++; else f.level++;
  return { ok: true };
}
// Garnison : envoyée depuis l'armée du château (et rendue au château)
export function setFarGarrison(state, key, units) {
  const f = farState(state)[key];
  if (!f) return { ok: false, reason: 'Pas de comptoir' };
  const want = Object.fromEntries(Object.entries(units || {}).map(([u, n]) => [u, Math.max(0, Math.floor(n) || 0)]).filter(([u]) => UNITS[u] && !['special', 'siege'].includes(UNITS[u].class)));
  for (const [u, n] of Object.entries(want)) if (n - (f.garrison[u] || 0) > (state.army[u] || 0)) return { ok: false, reason: `Pas assez de ${UNITS[u].name} au château` };
  for (const [u, n] of Object.entries(want)) {
    state.army[u] = (state.army[u] || 0) - (n - (f.garrison[u] || 0));
    if (n > 0) f.garrison[u] = n; else delete f.garrison[u];
  }
  return { ok: true };
}
export function fillFarGarrison(state, key) {
  const f = farState(state)[key];
  if (!f) return { ok: false, reason: 'Pas de comptoir' };
  let left = Math.max(0, garrisonAdvice(f) - unitSum(f.garrison)), moved = 0;
  for (const u of ['spearman', 'swordsman', 'heavy', 'archer', 'crossbow', 'knight']) {
    const n = Math.min(left, state.army[u] || 0);
    if (n > 0) { state.army[u] -= n; f.garrison[u] = (f.garrison[u] || 0) + n; left -= n; moved += n; }
  }
  return moved ? { ok: true, moved } : { ok: false, reason: 'Aucune troupe disponible' };
}
export function recallFarGarrison(state, key) {
  const f = farState(state)[key];
  if (!f) return { ok: false };
  for (const [u, n] of Object.entries(f.garrison)) state.army[u] = (state.army[u] || 0) + n;
  f.garrison = {};
  return { ok: true };
}
// Une menace : combat de la garnison (palissade = défense) contre la troupe de la contrée
export function farThreat(state, key, now = Date.now(), deterministic = false) {
  const f = farState(state)[key], d = FARLANDS[key];
  const enemies = threatUnits(key, f);
  const def = { units: unitSum(f.garrison) ? f.garrison : { militia: 2 }, mods: { 'combat.def': FAR.wallDef * f.wall }, formation: 'shieldwall', label: 'Comptoir' };
  const res = simulateBattle({ units: enemies, mods: {}, label: d.threat.name }, def, { terrain: d.terrain === 'ash' ? 'ruins' : 'plain', weather: 'clear', deterministic });
  if (unitSum(f.garrison)) f.garrison = Object.fromEntries(Object.entries(res.defRemaining).filter(([u, n]) => n > 0 && f.garrison[u]));
  f.threats++;
  if (res.winner === 'defender') {
    f.won++;
    log(state, 'good', `${d.icon} ${d.threat.name} repoussés au comptoir de ${d.name}.`, now);
  } else {
    f.lost++;
    f.haltUntil = now + FAR.haltHours * H;
    log(state, 'bad', `${d.icon} ${d.threat.name} ont forcé le comptoir de ${d.name} : production suspendue ${FAR.haltHours} h (rien n’est détruit).`, now);
  }
  f.nextAt = nextThreat(key, now, f.threats);
  return { won: res.winner === 'defender' };
}
// Tick : production (rattrapée hors ligne), menaces à leur date (au plus FAR.catchUp rattrapées d'un coup)
export function farlandTick(state, now = Date.now(), mods = null) {
  const F = state.farlands;
  if (!F) return;
  for (const key of FARLAND_ORDER) {
    const f = F[key];
    if (!f) continue;
    let n = 0;
    while (f.nextAt <= now && n < FAR.catchUp) {
      produce(state, key, f, f.nextAt, mods);
      farThreat(state, key, f.nextAt);
      n++;
    }
    if (f.nextAt <= now) f.nextAt = nextThreat(key, now, f.threats);
    produce(state, key, f, now, mods);
  }
}
function produce(state, key, f, t, mods) {
  if (t <= f.last) return;
  const from = Math.max(f.last, Math.min(t, f.haltUntil || 0));
  const h = Math.max(0, (t - from) / H);
  f.last = t;
  if (h <= 0) return;
  const amt = farProd(f) * h;
  addResource(state, FARLANDS[key].res, amt, mods || computeMods(state, t), null);
  f.produced += amt;
}
export function farlandList(state) {
  const th = thLevel(state);
  return FARLAND_ORDER.map((key) => ({ key, ...FARLANDS[key], f: farState(state)[key] || null, open: th >= FARLANDS[key].th, check: farlandCheck(state, key) }));
}
