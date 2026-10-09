import { CHAR_TO_TERRAIN, POI_TYPES, SECONDS_PER_TILE, TERRAINS, EVENT_REACH } from '../data/world.js';
import { UNITS } from '../data/units.js';
import { rng } from '../core/rng.js';
import { key, makePoi, makeEnemies, dangerNorm } from './worldgen.js';
import { thLevel } from './city.js';

export { key };

export const wTerrain = (world, x, y) => (x < 0 || y < 0 || x >= world.size || y >= world.size ? null : CHAR_TO_TERRAIN[world.terrain[y * world.size + x]]);
export const isRevealed = (world, x, y) => !!world.revealed[y * world.size + x];
export const poiAt = (world, x, y) => world.pois[key(x, y)] || null;
export const distCap = (world, x, y) => Math.hypot(x - world.capital.x, y - world.capital.y);
// Échelle des événements : proportionnelle au monde, plafonnée (un grand monde n'impose pas de trajets démesurés)
export const worldScale = (world) => Math.min(world.size, EVENT_REACH * 2);
const clampW = (world, v, m = 3) => Math.max(m, Math.min(world.size - 1 - m, v));
// Point à une distance [dMin, dMax] de la capitale, dans un angle aléatoire, à l'intérieur de la carte
export function aroundCapital(world, dMin, dMax) {
  const ang = rng.float(0, Math.PI * 2), d = rng.float(dMin, dMax);
  return { x: clampW(world, Math.round(world.capital.x + Math.cos(ang) * d)), y: clampW(world, Math.round(world.capital.y + Math.sin(ang) * d)) };
}

export function setTerrain(world, x, y, ter) {
  const i = y * world.size + x;
  world.terrain = world.terrain.slice(0, i) + TERRAINS[ter].char + world.terrain.slice(i + 1);
}

// Révèle un rayon ; renvoie la liste des sites nouvellement découverts
export function reveal(world, cx, cy, radius) {
  const found = [];
  for (let y = Math.floor(cy - radius); y <= Math.ceil(cy + radius); y++) {
    for (let x = Math.floor(cx - radius); x <= Math.ceil(cx + radius); x++) {
      if (x < 0 || y < 0 || x >= world.size || y >= world.size) continue;
      if (Math.hypot(x - cx, y - cy) > radius + 0.5) continue;
      const i = y * world.size + x;
      if (!world.revealed[i]) {
        world.revealed[i] = 1;
        const p = poiAt(world, x, y);
        if (p) found.push(p);
      }
    }
  }
  return found;
}

export const revealedCount = (world) => world.revealed.reduce((s, v) => s + v, 0);

export function slowestSpeed(units) {
  let s = Infinity;
  for (const [t, n] of Object.entries(units)) if (n > 0 && UNITS[t]) s = Math.min(s, UNITS[t].speed);
  return s === Infinity ? 1.5 : s;
}

// Durée de trajet (ms) depuis la capitale
export function travelTime(world, x, y, units, mods = {}, kind = 'march') {
  const d = Math.max(1, distCap(world, x, y));
  let speed = slowestSpeed(units) * (1 + (mods['march.speed'] || 0));
  if (kind === 'explore') speed *= 1 + (mods['explore.speed'] || 0);
  return (d * SECONDS_PER_TILE * 1000) / speed;
}

export function findFreeTile(world, x, y, terrains = null, maxR = 4) {
  for (let r = 0; r <= maxR; r++) {
    for (let i = 0; i < 12; i++) {
      const nx = x + rng.int(-r, r), ny = y + rng.int(-r, r);
      if (nx < 0 || ny < 0 || nx >= world.size || ny >= world.size) continue;
      if (poiAt(world, nx, ny)) continue;
      if (Math.hypot(nx - world.capital.x, ny - world.capital.y) < 2) continue;
      const ter = wTerrain(world, nx, ny);
      if (ter === 'river') continue;
      if (terrains && terrains.length && !terrains.includes(ter)) continue;
      return { x: nx, y: ny };
    }
  }
  return null;
}

export function spawnPoi(world, type, x, y, opts = {}) {
  const poi = makePoi(type, x, y, rng.random, dangerNorm(world.size, distCap(world, x, y)), opts);
  poi.id = `p_${x}_${y}_${type}_${Date.now().toString(36)}`;
  Object.assign(poi, opts.extra || {});
  world.pois[key(x, y)] = poi;
  return poi;
}

// Régénération des sites (appelée périodiquement)
export function worldUpkeep(state, dtSec, now, mods = null) {
  const world = state.world;
  for (const poi of Object.values(world.pois)) {
    const def = POI_TYPES[poi.type];
    if (!def) continue;
    if (def.kind === 'gather') {
      // Épuisement des sols : un site surexploité se régénère moins vite ; la jachère le restaure
      const ex = poi.exhaust || 0;
      if (poi.amount < poi.max && !poi.depleting) poi.amount = Math.min(poi.max, poi.amount + (def.regen * dtSec * (1 + (mods?.['node.regen'] || 0))) / 3600 / (1 + ex));
      if (ex > 0) poi.exhaust = Math.max(0, ex - (dtSec / 3600) * 0.08);
    }
    if (def.kind === 'danger' && poi.clearedUntil && poi.clearedUntil <= now) {
      poi.clearedUntil = 0;
      poi.enemies = makeEnemies(poi.type, poi.danger);
      poi.scouted = false;
    }
    // Les sites temporaires (événements) disparaissent
    if (poi.expires && poi.expires <= now && !state.marches.some((m) => m.x === poi.x && m.y === poi.y)) {
      delete world.pois[key(poi.x, poi.y)];
    }
  }
}

// Limites de territoires
export const territoryLimit = (state, mods) => 1 + Math.floor(thLevel(state) / 3) + (mods.territories || 0);
export const territoryRange = (state, mods) => 6 + Math.floor(thLevel(state) / 2) + (mods.vision || 0);
export const TERRITORY_COST = (n) => ({ gold: 300 * Math.pow(2, n), wood: 400 * Math.pow(1.8, n), stone: 400 * Math.pow(1.8, n), food: 300 * Math.pow(1.5, n) });

export function terrainName(t) { return TERRAINS[t]?.name || t; }
