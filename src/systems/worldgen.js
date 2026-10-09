import { mulberry32 } from '../core/rng.js';
import { WORLD_SIZE, TERRAINS, POI_TYPES, TOWN_NAMES, RIVALS, DANGER_RADIUS } from '../data/world.js';
import { RESOURCES } from '../data/resources.js';

function noiseField(r, size, cell) {
  const g = Math.ceil(size / cell) + 2;
  const grid = Array.from({ length: g * g }, () => r());
  const sm = (t) => t * t * (3 - 2 * t);
  return (x, y) => {
    const gx = x / cell, gy = y / cell;
    const x0 = Math.floor(gx), y0 = Math.floor(gy);
    const tx = sm(gx - x0), ty = sm(gy - y0);
    const v = (i, j) => grid[(j % g) * g + (i % g)];
    const a = v(x0, y0) * (1 - tx) + v(x0 + 1, y0) * tx;
    const b = v(x0, y0 + 1) * (1 - tx) + v(x0 + 1, y0 + 1) * tx;
    return a * (1 - ty) + b * ty;
  };
}

export const key = (x, y) => `${x},${y}`;

export function makeEnemies(type, danger, r = Math.random) {
  const def = POI_TYPES[type];
  const out = {};
  const scale = 0.5 + 0.55 * danger;
  for (const [u, base] of Object.entries(def.enemies || {})) {
    const v = base * scale * (0.85 + r() * 0.3);
    const n = Math.floor(v) + (r() < v - Math.floor(v) ? 1 : 0);
    if (n > 0) out[u] = n;
  }
  return out;
}

export function makePoi(type, x, y, r, distNorm = 0.5, opts = {}) {
  const def = POI_TYPES[type];
  const poi = { id: `p_${x}_${y}_${type}`, type, x, y, scouted: false };
  const [dmin, dmax] = def.danger || [0, 0];
  poi.danger = Math.round(Math.min(dmax, Math.max(dmin, dmin + (dmax - dmin) * (distNorm * 0.8 + r() * 0.5))));
  if (opts.danger !== undefined) poi.danger = opts.danger;
  if (def.kind === 'gather') {
    const [a, b] = def.amount;
    poi.max = Math.round((a + (b - a) * r()) * (1 + poi.danger * 0.35));
    poi.amount = poi.max;
  }
  if (def.kind === 'danger') poi.enemies = makeEnemies(type, poi.danger, r);
  if (def.kind === 'gather' && poi.danger > 0) poi.enemies = { bandit: 2 + poi.danger * 2, wolf: poi.danger * 2 };
  return poi;
}

// Danger normalisé selon la distance à la capitale : progression sur DANGER_RADIUS cases (ou la demi-carte si
// elle est plus petite, comme les anciens mondes 48×48), puis « terres lointaines » un peu plus rudes.
export const dangerNorm = (size, d) => Math.min(1.3, d / Math.min(size / 2, DANGER_RADIUS));

// Densité de référence : nombre de sites pour un monde 48×48 (multiplié par la surface)
export const POI_DENSITY = { woodNode: 22, stoneNode: 16, ironNode: 14, foodNode: 16, herbNode: 12, coalNode: 9, silverNode: 7, crystalNode: 6, gemNode: 5, ancientGrove: 5,
  banditCamp: 12, abandonedMine: 6, crypt: 6, monsterLair: 9, dungeon: 4, ruinSite: 6, village: 8 };
// Ressources rares : jamais collées à la capitale
export const RARE_MIN_DIST = { silverNode: 6, crystalNode: 8, gemNode: 8, ancientGrove: 7, dungeon: 12 };

export function generateWorld(seed, S = WORLD_SIZE) {
  const r = mulberry32(seed ^ 0x51ab);
  const elev = noiseField(r, S, 9), elev2 = noiseField(r, S, 4), moist = noiseField(r, S, 7), ruin = noiseField(r, S, 6);
  const cx = Math.floor(S / 2), cy = Math.floor(S / 2);
  const t = new Array(S * S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const dAbs = Math.hypot(x - cx, y - cy);
    let e = elev(x, y) * 0.75 + elev2(x, y) * 0.25;
    const m = moist(x, y);
    if (dAbs < 4.4) e = Math.min(e, 0.55); // les environs de la capitale sont accessibles
    let ter = 'plain';
    if (e > 0.72) ter = 'mountain';
    else if (e > 0.6) ter = 'hills';
    else if (m > 0.62) ter = e < 0.35 ? 'swamp' : 'forest';
    else if (m > 0.5) ter = 'forest';
    if (ter === 'plain' && ruin(x, y) > 0.8) ter = 'ruins';
    // Biomes lointains : toundra au nord, terres de cendre à l'est
    if (y < Math.round(S * 0.15) && (ter === 'plain' || ter === 'forest') && r() < 0.75) ter = 'snow';
    if (x > S - Math.round(S * 0.19) && ter !== 'mountain' && r() < 0.7) ter = 'ash';
    t[y * S + x] = ter;
  }
  // Rivières : marche aléatoire depuis des montagnes
  for (let i = 0; i < Math.round(3 * S / 48); i++) {
    let x = Math.floor(r() * S), y = i === 0 ? 0 : Math.floor(r() * S);
    if (i === 0) x = cx - 3 + Math.floor(r() * 6);
    let dirx = r() < 0.5 ? -1 : 1;
    for (let k = 0; k < S * 1.4; k++) {
      if (x < 0 || y < 0 || x >= S || y >= S) break;
      t[y * S + x] = 'river';
      if (r() < 0.6) y++; else x += dirx;
      if (r() < 0.1) dirx = -dirx;
    }
  }
  t[cy * S + cx] = 'plain';

  const pois = {};
  const occupied = (x, y) => pois[key(x, y)] || (Math.abs(x - cx) <= 1 && Math.abs(y - cy) <= 1);
  const terrainAt = (x, y) => t[y * S + x];
  const place = (type, tries = 200, minD = 3, maxD = S, opts = {}) => {
    const def = POI_TYPES[type];
    // Tirage dans le carré englobant l'anneau [minD, maxD] : efficace même sur un grand monde
    const lo = (c) => Math.max(0, Math.floor(c - maxD)), span = (c) => Math.min(S - 1, Math.ceil(c + maxD)) - lo(c) + 1;
    const rx = () => lo(cx) + Math.floor(r() * span(cx)), ry = () => lo(cy) + Math.floor(r() * span(cy));
    for (let i = 0; i < tries; i++) {
      const x = rx(), y = ry();
      const d = Math.hypot(x - cx, y - cy);
      if (d < minD || d > maxD || occupied(x, y)) continue;
      if (def.terrain.length && !def.terrain.includes(terrainAt(x, y))) continue;
      const poi = makePoi(type, x, y, r, dangerNorm(S, d), opts);
      Object.assign(poi, opts.extra || {});
      pois[key(x, y)] = poi;
      return poi;
    }
    if (opts.force) {
      // Garantit le site : on adapte le terrain d'une case libre
      for (let i = 0; i < 500; i++) {
        const x = rx(), y = ry();
        const d = Math.hypot(x - cx, y - cy);
        if (d < minD || d > maxD || occupied(x, y)) continue;
        if (def.terrain.length) t[y * S + x] = def.terrain[0];
        const poi = makePoi(type, x, y, r, dangerNorm(S, d), opts);
        Object.assign(poi, opts.extra || {});
        pois[key(x, y)] = poi;
        return poi;
      }
    }
    return null;
  };

  pois[key(cx, cy)] = { id: 'capital', type: 'capital', x: cx, y: cy, danger: 0 };
  // Ressources proches garanties
  const F = { force: true, danger: 0 };
  place('woodNode', 300, 2, 5, F); place('stoneNode', 300, 2, 5, F); place('foodNode', 300, 2, 5, F); place('ironNode', 300, 3, 5, F);
  place('banditCamp', 300, 3, 5, { force: true, danger: 1 });
  place('herbNode', 300, 2, 7, { force: true });
  place('village', 300, 4, 8, { force: true });
  // Même densité qu'un monde 48×48 : la surface quadruple, le nombre de sites aussi
  const area = (S * S) / (48 * 48);
  for (const [type, n] of Object.entries(POI_DENSITY)) for (let i = 0; i < Math.round(n * area); i++) place(type, 200, RARE_MIN_DIST[type] || 4);
  // Ceinture de ressources de base à mi-distance : l'expansion ne demande pas de longs trajets
  for (const type of ['woodNode', 'stoneNode', 'foodNode', 'ironNode']) place(type, 300, 6, 12, { force: true });

  // Cités libres
  TOWN_NAMES.forEach((name, i) => {
    const res = Object.keys(RESOURCES).filter((k) => RESOURCES[k].price > 0 && RESOURCES[k].cat !== 'inter');
    const wants = [res[Math.floor(r() * res.length)], res[Math.floor(r() * res.length)]];
    // 2 cités proches, puis une couronne intermédiaire et des cités lointaines
    const ring = i < 2 ? [5, 12] : i < 6 ? [10, Math.min(S, 24)] : [18, S];
    place('town', 300, ring[0], ring[1], { force: S > 48, extra: { name, wants: [...new Set(wants)], relation: 0 } });
  });
  // Royaumes rivaux
  RIVALS.forEach((rv, i) => {
    place('kingdom', 400, 10, Math.min(S, 34), { force: S > 48, danger: 2 + i, extra: { rival: i, name: rv.name, lord: rv.lord, power: 1 + i * 0.6, wall: 0.2 + i * 0.1, garrison: null } });
  });

  const revealed = new Array(S * S).fill(0);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) if (Math.hypot(x - cx, y - cy) <= 5.5) revealed[y * S + x] = 1;

  const terrainStr = t.map((k) => TERRAINS[k].char).join('');
  return { size: S, terrain: terrainStr, revealed, pois, capital: { x: cx, y: cy } };
}

// Agrandit un monde existant (anciennes sauvegardes 48×48) vers l'est et le sud, SANS déplacer quoi que ce soit :
// capitale, sites, territoires, brouillard et coordonnées restent identiques. Les nouvelles régions reprennent
// le terrain et les sites d'un monde généré de la même graine ; leur danger est recalculé depuis la capitale.
const IMPORT_KINDS = new Set(['gather', 'danger', 'village']);
export function extendWorld(world, seed, S2 = WORLD_SIZE) {
  const S = world.size;
  if (S >= S2) return false;
  const gen = generateWorld(seed, S2);
  const r = mulberry32((seed ^ 0x2b1d) >>> 0);
  let terrain = '';
  for (let y = 0; y < S2; y++) for (let x = 0; x < S2; x++) terrain += x < S && y < S ? world.terrain[y * S + x] : gen.terrain[y * S2 + x];
  const revealed = new Array(S2 * S2).fill(0);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) revealed[y * S2 + x] = world.revealed[y * S + x] ? 1 : 0;
  const names = new Set(Object.values(world.pois).filter((p) => p.type === 'town').map((p) => p.name));
  const cx = world.capital.x, cy = world.capital.y;
  for (const p of Object.values(gen.pois)) {
    if (p.x < S && p.y < S) continue;
    const def = POI_TYPES[p.type];
    if (p.type === 'town') {
      if (names.has(p.name)) continue;
      world.pois[key(p.x, p.y)] = { ...p, id: `p_${p.x}_${p.y}_town` };
      continue;
    }
    if (!def || !IMPORT_KINDS.has(def.kind) || p.type === 'lostCity') continue;
    const poi = makePoi(p.type, p.x, p.y, r, dangerNorm(S2, Math.hypot(p.x - cx, p.y - cy)));
    world.pois[key(p.x, p.y)] = poi;
  }
  Object.assign(world, { size: S2, terrain, revealed });
  return true;
}
