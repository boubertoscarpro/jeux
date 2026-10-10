import { POI_TYPES } from '../data/world.js';
import { costMult } from './kingdom.js';
import { computeMods } from './modifiers.js';
import { pay, missing } from './economy.js';
import { wTerrain, isRevealed, poiAt, distCap, key, territoryLimit, territoryRange, TERRITORY_COST } from './world.js';
import { guildProgress } from './guild.js';
import { log } from './log.js';
import { TERRITORY_SPECS, OUTPOST_MAX_LEVEL, GARRISON_PER_LEVEL, UPKEEP_PER_LEVEL, outpostUpgradeCost, RESPEC_COST, OUTPOST_THREATS, SPEC_INFO, SPEC_CATS, AFFINITY } from '../data/territories.js';
import { uid } from '../core/util.js';
import { defaultOutpostName, outpostLabel } from './identity.js';
import { TERRAINS } from '../data/world.js';
import { UNITS } from '../data/units.js';
import { rng } from '../core/rng.js';
import { gain } from './economy.js';
import { simulateBattle } from './combat.js';
import { thLevel } from './city.js';
import { recordLoss } from './losses.js';
import { shardState } from './shards.js';
import { toast } from './log.js';

export function territoryCost(state) {
  const n = Object.keys(state.territories).length;
  const k = costMult(computeMods(state), 'territory'); // cost.territory (spécialisation)
  return Object.fromEntries(Object.entries(TERRITORY_COST(n)).map(([r, v]) => [r, Math.round(v * k)]));
}

export function canClaim(state, x, y, now = Date.now()) {
  const mods = computeMods(state, now);
  const w = state.world;
  if (!isRevealed(w, x, y)) return { ok: false, reason: 'Case inexplorée' };
  if (state.territories[key(x, y)]) return { ok: false, reason: 'Déjà votre territoire' };
  const d = distCap(w, x, y);
  if (d < 1) return { ok: false, reason: 'C’est votre capitale' };
  if (d > territoryRange(state, mods)) return { ok: false, reason: `Trop loin (portée ${territoryRange(state, mods)})` };
  if (Object.keys(state.territories).length >= territoryLimit(state, mods)) return { ok: false, reason: `Limite de territoires (${territoryLimit(state, mods)}) — Hôtel de ville / recherches` };
  const p = poiAt(w, x, y);
  if (p) {
    const kind = POI_TYPES[p.type].kind;
    if (['town', 'kingdom', 'boss'].includes(kind)) return { ok: false, reason: 'Case occupée' };
    if (kind === 'danger' && !(p.clearedUntil > now)) return { ok: false, reason: 'Nettoyez d’abord ce site' };
  }
  return { ok: true, cost: territoryCost(state) };
}

export function claimTerritory(state, x, y, now = Date.now()) {
  const c = canClaim(state, x, y, now);
  if (!c.ok) return c;
  if (!pay(state, c.cost)) return { ok: false, reason: 'Ressources insuffisantes', missing: missing(state, c.cost) };
  const terrain = wTerrain(state.world, x, y);
  const t = { id: uid('op'), name: null, x, y, terrain, since: now, spec: null, level: 1, garrison: {} };
  t.name = defaultOutpostName(state, t);
  state.territories[key(x, y)] = t;
  guildProgress(state, 'outposts', 1);
  log(state, 'good', `🚩 Avant-poste « ${t.name} » établi en (${x}, ${y}).`, now);
  return { ok: true, id: t.id, name: t.name };
}

export function abandonTerritory(state, x, y) {
  const t = state.territories[key(x, y)];
  if (!t) return { ok: false, reason: 'Pas votre territoire' };
  for (const [u, n] of Object.entries(t.garrison || {})) state.army[u] = (state.army[u] || 0) + n; // la garnison rentre
  delete state.territories[key(x, y)];
  return { ok: true };
}

// ───────── Avant-postes spécialisés ─────────
// Un territoire n'est pas un revenu gratuit : il faut le spécialiser, l'améliorer, y laisser une garnison
// et payer son entretien. Une garnison insuffisante réduit sa production et attire les menaces régionales.

const unitSum = (u) => Object.values(u || {}).reduce((a, b) => a + b, 0);
// Affinité avec l'environnement (voir data/territories.js) ; mise en cache par spécialité (le terrain change rarement)
const affCache = new WeakMap();
export function specAffinity(state, t, specId = t.spec) {
  const info = SPEC_INFO[specId];
  if (!info || !state.world) return { mult: 1, bonus: 0, tiles: 0, nodes: 0 };
  const c = affCache.get(t);
  if (c && c.spec === specId && c.size === state.world.size) return c.val;
  const w = state.world;
  let tiles = 0, nodes = 0;
  for (let dy = -AFFINITY.nodeRadius; dy <= AFFINITY.nodeRadius; dy++) for (let dx = -AFFINITY.nodeRadius; dx <= AFFINITY.nodeRadius; dx++) {
    if (!dx && !dy) continue;
    const x = t.x + dx, y = t.y + dy;
    if (x < 0 || y < 0 || x >= w.size || y >= w.size) continue;
    if (Math.abs(dx) <= AFFINITY.tileRadius && Math.abs(dy) <= AFFINITY.tileRadius && info.near.includes(wTerrain(w, x, y))) tiles++;
    const p = poiAt(w, x, y);
    if (p && POI_TYPES[p.type]?.kind === 'gather' && info.res.includes(POI_TYPES[p.type].res)) nodes++;
  }
  const bonus = Math.min(AFFINITY.max, tiles * AFFINITY.perTile + nodes * AFFINITY.perNode);
  const val = { mult: 1 + bonus, bonus, tiles, nodes };
  affCache.set(t, { spec: specId, size: w.size, val });
  return val;
}
export const specCategory = (specId) => SPEC_CATS[SPEC_INFO[specId]?.cat] || null;

export const specOf = (t) => (t.spec ? (TERRITORY_SPECS[t.terrain] || []).find((s) => s.id === t.spec) : null);
export const garrisonNeed = (t) => GARRISON_PER_LEVEL * (t.level || 1);

// État d'un avant-poste : efficacité (0 à 1) et raisons
export function outpostStatus(state, t, now = Date.now()) {
  const reasons = [];
  let eff = 1;
  const g = unitSum(t.garrison);
  if (g < garrisonNeed(t)) { eff *= 0.3; reasons.push(`Garnison insuffisante (${g}/${garrisonNeed(t)}) : production −70 %`); }
  if (t.pillagedUntil > now) { eff = 0; reasons.push('Pillé : production arrêtée'); }
  if (t.unpaid) { eff = 0; reasons.push('Entretien impayé : production arrêtée'); }
  if (t.evacUntil > now) { eff = 0; reasons.push('Réserves évacuées : production suspendue'); }
  if (t.threatAt > now) reasons.push('⚠️ Une attaque est annoncée : renforcez la garnison');
  if (!t.spec) reasons.push('Aucune spécialisation choisie');
  return { eff, reasons, garrison: g, need: garrisonNeed(t) };
}

// Modificateurs apportés par les territoires (bonus de terrain + spécialisation), selon leur état
export function territoryMods(state, now = Date.now()) {
  const m = {};
  const add = (k, v) => { m[k] = (m[k] || 0) + v; };
  for (const t of Object.values(state.territories || {})) {
    const st = outpostStatus(state, t, now);
    if (st.eff >= 1) for (const [k, v] of Object.entries(TERRAINS[t.terrain]?.territory || {})) add(k, v);
    const sp = specOf(t);
    if (sp?.mods && st.eff > 0) { const aff = specAffinity(state, t).mult; for (const [k, v] of Object.entries(sp.mods)) add(k, v * (t.level || 1) * st.eff * aff); }
  }
  return m;
}

export function setSpec(state, k, specId) {
  const t = state.territories[k];
  if (!t) return { ok: false, reason: 'Territoire introuvable' };
  const sp = (TERRITORY_SPECS[t.terrain] || []).find((s) => s.id === specId);
  if (!sp) return { ok: false, reason: 'Spécialisation impossible sur ce terrain' };
  if (t.spec === specId) return { ok: false, reason: 'Déjà choisie' };
  if (t.spec) {
    if (!pay(state, RESPEC_COST)) return { ok: false, reason: 'Reconversion : ressources insuffisantes', missing: missing(state, RESPEC_COST) };
    t.level = 1; // une reconversion repart du premier niveau
  }
  t.spec = specId;
  t.level ||= 1;
  return { ok: true };
}

// Règle unique d'amélioration d'un avant-poste (fiche, icône, compteur, missions)
export function outpostUpgradeCheck(state, k) {
  const t = state.territories[k];
  if (!t) return { status: 'none', reasons: ['Territoire introuvable'] };
  const lvl = t.level || 1;
  if (lvl >= OUTPOST_MAX_LEVEL) return { status: 'max', reasons: ['Niveau maximal'], level: lvl };
  if (!t.spec) return { status: 'locked', reasons: ['Choisissez d’abord une spécialisation'], level: lvl };
  const cost = outpostUpgradeCost(lvl + 1);
  const miss = missing(state, cost);
  if (Object.keys(miss).length) return { status: 'lack', reasons: ['Ressources insuffisantes'], missing: miss, cost, level: lvl, next: lvl + 1 };
  return { status: 'ready', reasons: [], cost, level: lvl, next: lvl + 1 };
}

export function upgradeOutpost(state, k) {
  const u = outpostUpgradeCheck(state, k);
  if (u.status === 'none' || u.status === 'max' || u.status === 'locked') return { ok: false, reason: u.reasons[0] === 'Niveau maximal' ? 'Niveau maximal' : u.reasons[0] };
  if (!pay(state, u.cost)) return { ok: false, reason: 'Ressources insuffisantes', missing: missing(state, u.cost) };
  state.territories[k].level = u.next;
  return { ok: true };
}

export function setGarrison(state, k, units) {
  const t = state.territories[k];
  if (!t) return { ok: false, reason: 'Territoire introuvable' };
  const want = Object.fromEntries(Object.entries(units || {}).map(([u, n]) => [u, Math.max(0, Math.floor(n) || 0)]).filter(([u]) => UNITS[u] && UNITS[u].class !== 'special'));
  const cur = { ...(t.garrison || {}) };
  for (const [u, n] of Object.entries(want)) {
    const delta = n - (cur[u] || 0);
    if (delta > 0 && (state.army[u] || 0) < delta) return { ok: false, reason: `Pas assez de ${UNITS[u].name} en ville` };
  }
  for (const [u, n] of Object.entries(want)) {
    const delta = n - (cur[u] || 0);
    state.army[u] = (state.army[u] || 0) - delta;
    if (n > 0) cur[u] = n; else delete cur[u];
  }
  t.garrison = cur;
  return { ok: true };
}

export function outpostUpkeep(t) {
  return Object.fromEntries(Object.entries(UPKEEP_PER_LEVEL).map(([r, v]) => [r, v * (t.level || 1)]));
}

// Tick (chaque minute de jeu) : production, entretien, menaces
export function territoryTick(state, dtSec, now) {
  const h = dtSec / 3600;
  const mods = computeMods(state, now);
  for (const [k, t] of Object.entries(state.territories || {})) {
    // Entretien
    const up = outpostUpkeep(t);
    const due = Object.fromEntries(Object.entries(up).map(([r, v]) => [r, v * h]));
    t.unpaid = !Object.entries(due).every(([r, v]) => (state.resources[r] || 0) >= v);
    if (!t.unpaid) for (const [r, v] of Object.entries(due)) state.resources[r] -= v;
    // Production
    const st = outpostStatus(state, t, now);
    const sp = specOf(t);
    const aff = sp ? specAffinity(state, t).mult : 1;
    if (sp?.prod && st.eff > 0) gain(state, Object.fromEntries(Object.entries(sp.prod).map(([r, v]) => [r, v * (t.level || 1) * st.eff * aff * h])), mods);
    if (sp?.relicChance && st.eff > 0 && rng.chance(sp.relicChance * (1 + (mods['relic.find'] || 0)) * (t.level || 1) * h * st.eff)) {
      shardState(state).relicFragments++;
      log(state, 'good', `🏺 Les fouilles de ${outpostLabel(t)} mettent au jour un fragment de relique !`, now);
    }
    // Menace annoncée par un événement : elle frappe à l'échéance (le joueur a eu le temps de réagir)
    if (t.threatAt && t.threatAt <= now) { delete t.threatAt; outpostThreat(state, k, t, now); continue; }
    // Menace régionale (≈ 3 % + 1,5 %/niveau par heure ; doublée sans garnison suffisante)
    const p = (0.03 + 0.015 * (t.level || 1)) * (st.garrison < st.need ? 2 : 1) * h;
    if (!(t.pillagedUntil > now) && rng.chance(p)) outpostThreat(state, k, t, now);
  }
}

export function outpostThreat(state, k, t, now = Date.now()) {
  const th = OUTPOST_THREATS[t.terrain] || OUTPOST_THREATS.plain;
  const sc = (0.6 + 0.35 * (t.level || 1)) * (0.6 + thLevel(state) * 0.12);
  const enemies = Object.fromEntries(Object.entries(th.units).map(([u, n]) => [u, Math.max(1, Math.round(n * sc))]));
  const sp = specOf(t);
  const def = { units: t.garrison && unitSum(t.garrison) ? t.garrison : { militia: 2 }, mods: { 'combat.def': (sp?.garrisonBonus || 0) + 0.1 + (computeMods(state, now)['garrison.def'] || 0) }, formation: 'shieldwall', label: 'Garnison' };
  const res = simulateBattle({ units: enemies, mods: {}, label: th.name }, def, { terrain: t.terrain === 'ash' ? 'ruins' : t.terrain, weather: state.weather?.type || 'clear' });
  if (t.garrison) t.garrison = Object.fromEntries(Object.entries(res.defRemaining).filter(([u, n]) => n > 0 && t.garrison[u]));
  const lostUnits = Object.values(res.defLosses).reduce((a, b) => a + b, 0);
  if (res.winner === 'defender') {
    const bounty = { gold: Math.round(80 * sc), iron: Math.round(40 * sc) };
    gain(state, bounty, computeMods(state, now));
    log(state, 'good', `🛡️ ${th.name} repoussés à l’avant-poste ${outpostLabel(t)} (${lostUnits} pertes). Butin : ${bounty.gold} or.`, now);
    t.defended = (t.defended || 0) + 1;
  } else {
    t.pillagedUntil = now + 3 * 3600000;
    const stolen = { gold: t.evacUntil > now ? 0 : Math.min(state.resources.gold || 0, Math.round(150 * (t.level || 1))) };
    state.resources.gold -= stolen.gold;
    recordLoss(state, 'outpost', stolen, now);
    log(state, 'bad', `🔥 ${th.name} pillent l’avant-poste ${outpostLabel(t)} : production arrêtée 3 h, ${stolen.gold} or perdus, garnison −${lostUnits}.`, now);
    toast(`🔥 Avant-poste ${outpostLabel(t)} pillé`, 'bad');
  }
  return res;
}
