import { POI_TYPES } from '../data/world.js';
import { computeMods } from './modifiers.js';
import { pay, missing } from './economy.js';
import { wTerrain, isRevealed, poiAt, distCap, key, territoryLimit, territoryRange, TERRITORY_COST } from './world.js';
import { guildProgress } from './guild.js';
import { log } from './log.js';

export function territoryCost(state) {
  const n = Object.keys(state.territories).length;
  return Object.fromEntries(Object.entries(TERRITORY_COST(n)).map(([r, v]) => [r, Math.round(v)]));
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
  state.territories[key(x, y)] = { x, y, terrain, since: now };
  guildProgress(state, 'outposts', 1);
  log(state, 'good', `🚩 Avant-poste établi en (${x}, ${y}).`, now);
  return { ok: true };
}

export function abandonTerritory(state, x, y) {
  delete state.territories[key(x, y)];
  return { ok: true };
}
