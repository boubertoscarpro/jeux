// v21 « Couleurs du Royaume » — Scène peinte du royaume : un cache de dessins cuits (bâtiments, décor, muraille), un
// sol peint mis en cache, et le dessin de la scène dans l'ordre de profondeur sur un canvas. Les boutons HTML invisibles
// posés par-dessus (views/city.js) gardent le clavier, le focus, le lecteur d'écran et les tests.
import { pen, groundTile, poly, lit, rgba, rng, mix } from './paint.js';
import { bake } from './bake.js';
import { PAINT, scenery, road, lot, scaffold, deco, trophy, wallPiece, wallTower, gatehouse, drawbridge } from './art.js';
import { toScreen, depth, LAYER } from '../../systems/iso.js';

// ───────── Cache des dessins cuits ─────────
const TOP = 340, BOT = 90, SIDE = 80; // marges autour d'une case (unités à l'échelle 1)
const cache = new Map();
export const paintStats = { baked: 0, bakeMs: 0, groundMs: 0, sceneMs: 0, items: 0 };
const mk = (w, h) => {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(Math.max(1, w), Math.max(1, h));
  const c = document.createElement('canvas'); c.width = Math.max(1, w); c.height = Math.max(1, h); return c;
};
// Rogne un canvas à ses pixels peints (mémoire et vitesse de dessin)
function trim(cv) {
  const w = cv.width, h = cv.height, d = cv.getContext('2d').getImageData(0, 0, w, h).data;
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) {
    const row = y * w * 4;
    for (let x = 0; x < w; x++) if (d[row + x * 4 + 3] > 6) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; y1 = y; }
  }
  if (x1 < 0) return null;
  const out = mk(x1 - x0 + 1, y1 - y0 + 1);
  out.getContext('2d').drawImage(cv, -x0, -y0);
  return { cv: out, x: x0, y: y0 };
}
// Dessin cuit d'une case : { art, ax, ay (position du sommet haut de la case dans l'image), shadow, sx, sy, fx (fumées) }
export function sprite(key, s, draw) {
  const k = key + '@' + s;
  const hit = cache.get(k);
  if (hit) { cache.delete(k); cache.set(k, hit); return hit; } // le plus récemment utilisé passe en fin de liste
  const t0 = typeof performance !== 'undefined' ? performance.now() : 0;
  const W = Math.ceil((128 + 2 * SIDE) * s), H = Math.ceil((TOP + 64 + BOT) * s);
  const ox = (64 + SIDE) * s, oy = TOP * s;
  const sh = mk(W, H), shg = sh.getContext('2d'), fx = [];
  const art = bake(W, H, (g) => { const p = pen(g, ox, oy, s, key); p.noGround = true; p.sg = shg; p.fx = fx; draw(p); }, { s });
  const a = trim(art), b = trim(sh);
  const sp = {
    art: a?.cv || null, ax: a ? ox - a.x : 0, ay: a ? oy - a.y : 0,
    shadow: b?.cv || null, sx: b ? ox - b.x : 0, sy: b ? oy - b.y : 0,
    fx: fx.map((e) => ({ x: e.x - ox, y: e.y - oy, n: e.n })),
  };
  cache.set(k, sp);
  if (cache.size > 700) { let n = 0; for (const kk of cache.keys()) { cache.delete(kk); if (++n >= 100) break; } }
  paintStats.baked++; paintStats.bakeMs += (typeof performance !== 'undefined' ? performance.now() : 0) - t0;
  return sp;
}
export const clearPaintCache = () => cache.clear();

// Clés et peintres des dessins de la ville
export const SEASONAL = new Set(['farm', 'orchard', 'hunter']);
export function buildingSprite(type, tier, v, o, s) {
  const key = `b|${type}|${tier}|${v % 4}|${o.active ? 1 : 0}|${o.river ? 'r' : ''}|${SEASONAL.has(type) ? o.season : ''}|${type === 'monument' ? o.level : ''}`;
  return sprite(key, s, (p) => (PAINT[type] || PAINT.house)(p, tier, v, { ...o, animated: true }));
}
export const scenerySprite = (ter, v, season, s) => sprite(`s|${ter}|${v % 6}|${season}`, s, (p) => scenery(p, ter, v % 6, season));
export const roadSprite = (s) => sprite('road', s, (p) => road(p));
export const lotSprite = (s) => sprite('lot', s, (p) => lot(p));
export const scaffoldSprite = (h, s) => sprite(`scaf|${h}`, s, (p) => scaffold(p, h));
export const decoSprite = (icon, season, s) => sprite(`d|${icon}|${season}`, s, (p) => deco(p, icon, season));
export const trophySprite = (shape, color, s) => sprite(`t|${shape}|${color}`, s, (p) => trophy(p, shape, color));

// ───────── Sol peint (mis en cache) ─────────
let groundCache = { key: '', cv: null };
const GRASS = { spring: '#86c24e', summer: '#78b844', autumn: '#a0a844', winter: '#e8eef2' };
export function groundCanvas(state, f, R, o) {
  const W = state.city.w, Hh = state.city.h, T = state.city.terrain;
  const key = [W, Hh, R, typeof T === 'string' ? T : T.join(''), JSON.stringify(o.rect), o.moat, o.season, o.allee.join(';'), o.gate ? o.gate.x + ',' + o.gate.y : '', o.zoneOf ? 'z' : ''].join('|');
  if (groundCache.key === key) return groundCache.cv;
  const t0 = typeof performance !== 'undefined' ? performance.now() : 0;
  const cv = mk(Math.ceil(f.width * R), Math.ceil(f.height * R)), g = cv.getContext('2d');
  const r = rng(W * 31 + Hh);
  const base = GRASS[o.season] || GRASS.summer;
  // fond : prairie continue, taches d'ombre et de lumière
  g.fillStyle = lit(base, -0.05); g.fillRect(0, 0, cv.width, cv.height);
  const tileAt = (x, y) => T[y * W + x];
  const inRect = (x, y) => x >= o.rect.x0 && x <= o.rect.x1 && y >= o.rect.y0 && y <= o.rect.y1;
  const ring = (x, y) => { const d = Math.max(o.rect.x0 - x, 0, x - o.rect.x1, o.rect.y0 - y, 0, y - o.rect.y1); return d === 1; };
  const allee = new Set(o.allee);
  const kindOf = (x, y) => {
    if (x < 0 || y < 0 || x >= W || y >= Hh) return 'out';
    if (inRect(x, y)) return allee.has(x + ',' + y) ? 'path' : 'cobble';
    if (ring(x, y)) return o.moat > 0 ? 'water' : 'ditch';
    const t = tileAt(x, y);
    return t === 'river' ? 'water' : t === 'mountain' ? 'rocky' : t === 'rubble' ? 'dirt' : t === 'forest' ? 'forest' : 'grass';
  };
  // diamant de la prairie entière
  const corners = [toScreen(f, 0, 0), toScreen(f, W, 0), toScreen(f, W, Hh), toScreen(f, 0, Hh)].map((q) => [q.sx * R, q.sy * R]);
  g.save(); poly(g, corners); g.clip();
  const gr = g.createLinearGradient(0, 0, cv.width, cv.height); gr.addColorStop(0, lit(base, 0.12)); gr.addColorStop(1, lit(base, -0.08));
  g.fillStyle = gr; g.fillRect(0, 0, cv.width, cv.height);
  for (let i = 0; i < W * Hh * 0.6; i++) {
    const x = r() * cv.width, y = r() * cv.height, rr = r.range(30, 90) * R;
    const blob = g.createRadialGradient(x, y, 0, x, y, rr);
    blob.addColorStop(0, rgba(r() < 0.5 ? lit(base, 0.18) : lit(base, -0.16), 0.35)); blob.addColorStop(1, rgba(base, 0));
    g.fillStyle = blob; g.beginPath(); g.arc(x, y, rr, 0, 7); g.fill();
  }
  g.restore();
  // cases
  for (let y = 0; y < Hh; y++) for (let x = 0; x < W; x++) {
    const k = kindOf(x, y), q = toScreen(f, x, y);
    const p = pen(g, q.sx * R, q.sy * R, R, x * 977 + y);
    const pts = [p.P(0, 0), p.P(1, 0), p.P(1, 1), p.P(0, 1)];
    if (k === 'grass' || k === 'forest') {
      const pr = p.r;
      if (k === 'forest') { poly(g, pts); g.fillStyle = rgba(lit(base, -0.28), 0.55); g.fill(); }
      for (let i = 0; i < 26; i++) {
        const [bx, by] = p.P(pr(), pr());
        g.strokeStyle = pr() < 0.6 ? rgba(lit(base, -0.3), 0.5) : rgba(lit(base, 0.3), 0.55); g.lineWidth = 0.9 * R;
        g.beginPath(); g.moveTo(bx, by); g.lineTo(bx + pr.range(-1.5, 1.5) * R, by - pr.range(2, 5) * R); g.stroke();
      }
      if (o.season !== 'winter' && pr() < 0.55) for (let i = 0; i < 3; i++) { const [bx, by] = p.P(pr(), pr()); g.fillStyle = pr.pick(['#fff4d6', '#ffd95a', '#f08aa0', '#b6d4ff']); g.beginPath(); g.arc(bx, by, 1.2 * R, 0, 7); g.fill(); }
    } else if (k === 'cobble' || k === 'path' || k === 'dirt') {
      groundTile(p, 0, 0, k === 'cobble' ? 'cobble' : 'dirt');
      if (k === 'path') { poly(g, pts); g.fillStyle = 'rgba(255,236,190,.25)'; g.fill(); }
    } else if (k === 'rocky') {
      groundTile(p, 0, 0, 'dirt'); poly(g, pts); g.fillStyle = 'rgba(120,112,100,.45)'; g.fill();
    } else if (k === 'ditch') {
      poly(g, pts); g.fillStyle = '#8a6a3c'; g.fill(); poly(g, [p.P(0.15, 0.15), p.P(0.85, 0.15), p.P(0.85, 0.85), p.P(0.15, 0.85)]); g.fillStyle = '#6b5030'; g.fill();
    } else if (k === 'water') {
      poly(g, pts);
      const wg = g.createLinearGradient(0, 0, 0, cv.height); wg.addColorStop(0, '#3a9cc4'); wg.addColorStop(1, '#2a78a4');
      g.fillStyle = wg; g.fill();
      const pr = p.r;
      for (let i = 0; i < 6; i++) { const [bx, by] = p.P(pr.range(0.1, 0.9), pr.range(0.1, 0.9)); const w = pr.range(5, 11) * R; g.strokeStyle = rgba('#e4f8ff', pr.range(0.35, 0.7)); g.lineWidth = 1 * R; g.beginPath(); g.moveTo(bx, by); g.quadraticCurveTo(bx + w / 2, by - 2 * R, bx + w, by); g.stroke(); }
      // berges : là où la case voisine n'est pas de l'eau
      const sides = [[0, -1, [0, 0], [1, 0]], [1, 0, [1, 0], [1, 1]], [0, 1, [1, 1], [0, 1]], [-1, 0, [0, 1], [0, 0]]];
      for (const [dx, dy, a, b] of sides) {
        const nk = kindOf(x + dx, y + dy);
        if (nk === 'water' || nk === 'out') continue;
        g.strokeStyle = '#c9a868'; g.lineWidth = 3.4 * R; g.lineCap = 'round'; g.beginPath(); g.moveTo(...p.P(...a)); g.lineTo(...p.P(...b)); g.stroke();
        g.strokeStyle = rgba('#1c3b4e', 0.45); g.lineWidth = 1.2 * R; g.beginPath(); g.moveTo(...p.P(a[0] * 0.92 + 0.04, a[1] * 0.92 + 0.04)); g.lineTo(...p.P(b[0] * 0.92 + 0.04, b[1] * 0.92 + 0.04)); g.stroke();
      }
    }
    if (o.season === 'winter' && k !== 'water') { poly(g, pts); g.fillStyle = 'rgba(250,252,255,.55)'; g.fill(); }
  }
  // pont-levis devant la porte, au-dessus des douves
  if (o.gate && o.moat > 0) { const q = toScreen(f, o.gate.x, o.gate.y); drawbridge(pen(g, q.sx * R, q.sy * R, R), 1, true); }
  // bord du domaine : liseré sombre
  poly(g, corners); g.strokeStyle = 'rgba(30,40,14,.45)'; g.lineWidth = 3 * R; g.stroke();
  groundCache = { key, cv };
  paintStats.groundMs = (typeof performance !== 'undefined' ? performance.now() : 0) - t0;
  return cv;
}

// ───────── Muraille : pièces, tours, porte (ordre de profondeur repris de la v20) ─────────
export function wallItems(state, f, w) {
  const { rect: r, gate: g, style, dmg = 0, night = false, raid = false, roofGold = false, c1 = '#2f5fb0', c2 = '#f1d36a', posted = {} } = w;
  const items = [];
  if (!style) return items;
  const cracked = (i) => dmg > 0 && ((i * 37) % 10) / 10 < dmg * 0.9;
  const guardC = (i) => (i % 3 === 0 ? (raid ? '#a83a2a' : c1) : null);
  let i = 0;
  const mid = (a, b) => Math.floor((a + b) / 2);
  const piece = (x, y, axis, at, layer, dx, dy, extra = {}) => {
    const idx = i++;
    const engines = extra.engines || 0;
    const key = `w|${style}|${axis}|${at}|${cracked(idx) ? 'c' : ''}|${guardC(idx) || ''}|${extra.banner ? 'b' : ''}|${engines}`;
    items.push({ x, y, key, depth: depth(dx, dy, layer), sp: (s) => sprite(key, s, (p) => {
      wallPiece(p, style, axis, at, { cracked: cracked(idx), guard: guardC(idx), banners: extra.banner ? [c1, c2] : null });
      if (engines) engineMarks(p, axis, at, engines, style);
    }) });
  };
  const flankCount = (fl) => Object.values(posted[fl] || {}).reduce((a, b) => a + (b > 0 ? b : 0), 0);
  for (let x = r.x0; x <= r.x1; x++) piece(x, r.y0, 'u', 0, LAYER.wallBack, x, r.y0 - 0.5, { banner: x === mid(r.x0, r.x1) });
  for (let y = r.y0; y <= r.y1; y++) piece(r.x0, y, 'v', 0, LAYER.wallBack, r.x0 - 0.5, y, { engines: y === mid(r.y0, r.y1) ? Math.min(3, flankCount('left')) : 0 });
  for (let x = r.x0; x <= r.x1; x++) {
    if (x === g.x) {
      items.push({ x, y: r.y1, key: `wg|${style}|${raid ? 1 : 0}|${c1}`, depth: depth(x, r.y1 + 0.6, LAYER.wallFront), sp: (s) => sprite(`wg|${style}|${raid ? 1 : 0}|${c1}`, s, (p) => gatehouse(p, style, 1, { banner: [c1, c2], raid })) });
      continue;
    }
    piece(x, r.y1, 'u', 1, LAYER.wallFront, x, r.y1 + 0.5, { engines: (x === g.x - 1 || (g.x === r.x0 && x === r.x0 + 1)) ? Math.min(3, flankCount('front')) : 0 });
  }
  for (let y = r.y0; y <= r.y1; y++) piece(r.x1, y, 'v', 1, LAYER.wallFront, r.x1 + 0.5, y, { engines: y === mid(r.y0, r.y1) ? Math.min(3, flankCount('right')) : 0, banner: y === r.y0 + 1 });
  // tours : coins, puis tous les 3 segments (sauf autour de la porte)
  if (style !== 'stakes') {
    const towers = [[r.x0, r.y0], [r.x1 + 1, r.y0], [r.x0, r.y1 + 1], [r.x1 + 1, r.y1 + 1]];
    for (let x = r.x0 + 3; x <= r.x1 - 1; x += 3) towers.push([x, r.y0], [x, r.y1 + 1]);
    for (let y = r.y0 + 3; y <= r.y1 - 1; y += 3) towers.push([r.x0, y], [r.x1 + 1, y]);
    for (const [cx, cy] of towers) {
      if (cy === r.y1 + 1 && Math.abs(cx - (g.x + 0.5)) < 1.2) continue;
      const tx = Math.min(cx, state.city.w - 1), ty = Math.min(cy, state.city.h - 1);
      const lu = cx - tx, lv = cy - ty;
      const front = cy > r.y1 || cx > r.x1;
      const flag = ((cx + cy) % 2) ? [c1, c2] : [c2, c1];
      const key = `wt|${style}|${lu}|${lv}|${roofGold ? 1 : 0}|${flag[0]}|${night ? 1 : 0}`;
      items.push({ x: tx, y: ty, key, depth: depth(cx - 0.4, cy - 0.4, front ? LAYER.wallFront + 1 : LAYER.wallBack), sp: (s) => sprite(key, s, (p) => wallTower(p, style, lu, lv, { gold: roofGold, flag, torch: night })) });
    }
  }
  return items;
}
// Engins de défense (v19) posés sur un flanc : petites balistes de bois sur le chemin de ronde
function engineMarks(p, axis, at, n, style) {
  const g = p.g, s = p.s, H = { palisade: 30, stone: 40, towers: 46, fortress: 52 }[style] || 40;
  for (let k = 0; k < n; k++) {
    const t = 0.25 + k * 0.25, [x, y] = p.P(axis === 'u' ? t : at, axis === 'u' ? at : t, H + 2);
    g.fillStyle = '#8a5a30'; g.fillRect(x - 6 * s, y - 4 * s, 12 * s, 4 * s); g.strokeStyle = '#2a1a10'; g.lineWidth = 0.8 * s; g.strokeRect(x - 6 * s, y - 4 * s, 12 * s, 4 * s);
    g.strokeStyle = '#2a1a10'; g.lineWidth = 2.2 * s; g.beginPath(); g.moveTo(x - 7 * s, y - 9 * s); g.quadraticCurveTo(x, y - 4 * s, x + 7 * s, y - 9 * s); g.stroke();
    g.strokeStyle = '#c9a36a'; g.lineWidth = 1.2 * s; g.stroke();
  }
}

// ───────── Dessin de la scène ─────────
// items : { x, y, depth, sp(s) → sprite, alpha?, filter? } ; R : pixels de canvas par pixel du monde
export function drawScene(cv, items, f, R) {
  const t0 = typeof performance !== 'undefined' ? performance.now() : 0;
  const g = cv.getContext('2d');
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, cv.width, cv.height);
  const placed = items.map((it) => { const q = toScreen(f, it.x, it.y); return { it, X: q.sx * R, Y: q.sy * R, sp: it.sp(R) }; });
  // ombres portées d'abord (au sol, sous tous les volumes)
  g.globalAlpha = 1;
  for (const { it, X, Y, sp } of placed) if (sp.shadow && !it.noShadow) { g.globalAlpha = it.alpha ?? 1; g.drawImage(sp.shadow, X - sp.sx, Y - sp.sy); }
  placed.sort((a, b) => a.it.depth - b.it.depth || a.it.x - b.it.x);
  const fx = [];
  for (const { it, X, Y, sp } of placed) {
    if (!sp.art) continue;
    g.globalAlpha = it.alpha ?? 1;
    g.filter = it.filter || 'none';
    g.drawImage(sp.art, X - sp.ax, Y - sp.ay);
    g.filter = 'none';
    if (it.smoke !== false) for (const e of sp.fx) fx.push({ x: X + e.x, y: Y + e.y, n: e.n, id: it.id });
  }
  g.globalAlpha = 1;
  paintStats.sceneMs = (typeof performance !== 'undefined' ? performance.now() : 0) - t0;
  paintStats.items = placed.length;
  return { fx };
}
export { mix };
