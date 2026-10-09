// Spécialisation du royaume : définition, modificateurs, coûts et pack de départ.
import { KINGDOM_TYPES, LEGACY_KINGDOM, ORIGINS, DIFFICULTIES } from '../data/kingdoms.js';

export const kingdomDef = (state) => KINGDOM_TYPES[state?.kingdom?.type] || LEGACY_KINGDOM;
export const originDef = (state) => ORIGINS[state?.kingdom?.origin] || ORIGINS.none;
export const difficultyDef = (state) => DIFFICULTIES[state?.kingdom?.difficulty] || DIFFICULTIES.classic;

// Modificateurs permanents : type + origine + difficulté (additionnés aux autres sources dans computeMods)
export function kingdomMods(state) {
  const m = {};
  for (const src of [kingdomDef(state).mods, originDef(state).mods, difficultyDef(state).mods]) {
    for (const [k, v] of Object.entries(src || {})) m[k] = (m[k] || 0) + v;
  }
  return m;
}

// Multiplicateur de coût : Σ des clés cost.<kind> demandées, plancher à 50 % du prix.
// Ex. costMult(mods, 'train', 'train.infantry', 'unit.spearman')
export function costMult(mods, ...kinds) {
  let s = 0;
  for (const k of kinds) s += mods['cost.' + k] || 0;
  return Math.max(0.5, 1 + s);
}

export function applyCostMult(cost, k) {
  if (k === 1) return { ...cost };
  const out = {};
  for (const [r, v] of Object.entries(cost)) out[r] = Math.ceil(v * k);
  return out;
}

// Rayon supplémentaire révélé autour de la capitale (pack de départ)
function reveal(state, extra) {
  const w = state.world;
  if (!w || !extra) return;
  const c = w.capital;
  const R = 5.5 + extra; // rayon révélé de base : 5,5 cases (worldgen)
  const r = Math.ceil(R);
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    const x = c.x + dx, y = c.y + dy;
    if (x < 0 || y < 0 || x >= w.size || y >= w.size) continue;
    if (Math.hypot(dx, dy) <= R) w.revealed[y * w.size + x] = 1;
  }
}

function applyStart(state, start) {
  if (!start) return;
  if (start.resMult) for (const r of Object.keys(state.resources)) state.resources[r] = Math.floor(state.resources[r] * start.resMult);
  for (const [r, v] of Object.entries(start.res || {})) state.resources[r] = (state.resources[r] || 0) + v;
  for (const [u, n] of Object.entries(start.units || {})) state.army[u] = (state.army[u] || 0) + n;
  for (const [f, l] of Object.entries(start.fort || {})) state.city.fort[f] = Math.max(state.city.fort[f] || 0, l);
  for (const [type, lvl] of Object.entries(start.buildings || {})) {
    for (const b of Object.values(state.city.buildings)) if (b.type === type) b.level = Math.max(b.level, lvl);
  }
  if (start.reveal) reveal(state, start.reveal);
}

// Choix à la création : enregistré dans state.kingdom, impossible à changer en cours de partie.
export function applyKingdomChoice(state, { type, origin = 'none', difficulty = 'classic' } = {}, now = Date.now()) {
  if (!KINGDOM_TYPES[type]) type = null;
  if (!ORIGINS[origin]) origin = 'none';
  if (!DIFFICULTIES[difficulty]) difficulty = 'classic';
  state.kingdom = { type, origin, difficulty, chosenAt: now };
  const diff = DIFFICULTIES[difficulty];
  // Multiplicateurs de départ appliqués avant les bonus fixes (ordre : difficulté, origine, type)
  applyStart(state, diff.start);
  applyStart(state, ORIGINS[origin].start);
  if (type) applyStart(state, KINGDOM_TYPES[type].start);
  if (diff.raidGraceH) state.raidCooldown = Math.max(state.raidCooldown || 0, now + diff.raidGraceH * 3600000);
  state.meta.advice = diff.advice;
  if (!diff.tips) state.meta.tipsOff = true;
  if (type) state.meta.banner = KINGDOM_TYPES[type].color;
  return state;
}
