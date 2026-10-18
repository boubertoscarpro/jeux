// v15 — « L'Atlas vivant » : peinture procédurale des cartes (aucune image externe).
//  - Sol du royaume : une seule peinture continue sous la grille (herbe en aquarelle, berges, sous-bois, rochers,
//    décombres variés), repeinte seulement si sa signature change (terrain, saison, sécheresse, qualité).
//  - Monde : un niveau global (8 px par case) pour la vue d'ensemble, et des blocs de 8 × 8 cases mis en cache pour
//    les vues rapprochées, générés au plus quelques-uns par image (budget) ; brouillard à l'encre ; mini-carte.
// Les transitions entre terrains viennent d'un échantillonnage déformé par du bruit : chaque case garde son terrain en
// son centre (lisibilité du jeu), mais ses bords deviennent organiques.
import { TERRAINS } from '../data/world.js';
import { wTerrain, isRevealed } from '../systems/world.js';

// ───────── Bruit ─────────
const hash = (x, y, s = 0) => {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 982451653)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};
function vnoise(x, y, s) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi, s), b = hash(xi + 1, yi, s), c = hash(xi, yi + 1, s), d = hash(xi + 1, yi + 1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
const fbm = (x, y, s) => vnoise(x, y, s) * 0.62 + vnoise(x * 2.07, y * 2.07, s + 7) * 0.28 + vnoise(x * 4.3, y * 4.3, s + 13) * 0.1;
export const tileRand = (x, y, k = 0) => hash(x * 7 + k, y * 13 - k, 977);

// ───────── Palettes (encre et aquarelle), selon la saison ─────────
const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const BASE = {
  plain: '#86a35a', forest: '#4d7236', hills: '#a69a62', mountain: '#8a8478', river: '#5b8db5', swamp: '#5f7350', ruins: '#8e8090',
  snow: '#dfe7ec', ash: '#5d4f4c', rubble: '#8f8466',
};
const SEASON_TINT = {
  spring: {},
  summer: { plain: '#93a75a', hills: '#ad9d60' },
  autumn: { plain: '#a69a55', forest: '#8d6a32', hills: '#a88a55', swamp: '#6d6a45' },
  winter: { plain: '#dfe6ea', forest: '#6f8a7c', hills: '#d6dad8', mountain: '#b4b6b8', river: '#9fc0d6', swamp: '#b8c2bf', rubble: '#c9c6bc', ruins: '#b7aeb8' },
};
const DROUGHT = { plain: '#bda865', forest: '#6e7340', hills: '#b9a466', swamp: '#8b8455' };
function palette(season, dry = 0) {
  const p = {};
  for (const k of Object.keys(BASE)) {
    let c = hex((SEASON_TINT[season] || {})[k] || BASE[k]);
    if (dry && DROUGHT[k] && season !== 'winter') { const d = hex(DROUGHT[k]); const t = dry >= 2 ? 0.85 : 0.35; c = c.map((v, i) => v + (d[i] - v) * t); }
    p[k] = c;
  }
  return p;
}
const WATER = new Set(['river']);

/**
 * Peint une zone de cases dans un ImageData.
 * get(x, y) → terrain ; tiles x0..x0+tw, y0..y0+th ; res pixels par case ; pal palette ; seed.
 * dryPatch : 0–1, part des prairies tachées de sécheresse (signes de présage).
 */
export function paintTerrain(img, x0, y0, tw, th, res, get, pal, { seed = 1, jitter = 0.38, dryPatch = 0 } = {}) {
  const W = tw * res, H = th * res, d = img.data;
  // Pré-calcul : cases voisines de l'eau (on n'échantillonne les berges que là)
  const near = new Uint8Array((tw + 2) * (th + 2));
  for (let y = -1; y <= th; y++) for (let x = -1; x <= tw; x++) {
    let w = 0, l = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const t = get(x0 + x + dx, y0 + y + dy); if (!t) continue; if (WATER.has(t)) w = 1; else l = 1; }
    near[(y + 1) * (tw + 2) + (x + 1)] = w && l ? 1 : 0;
  }
  // Champs de bruit basse fréquence calculés sur une grille grossière (G points par case), puis interpolés :
  // déformation des bords (jx, jy), variation de teinte (v), taches sèches (dp). Coût par pixel : quelques multiplications.
  const G = 4, gw = tw * G + 2, gh = th * G + 2;
  const JX = new Float32Array(gw * gh), JY = new Float32Array(gw * gh), V = new Float32Array(gw * gh), DP = dryPatch ? new Float32Array(gw * gh) : null;
  for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) {
    const fx = x0 + i / G, fy = y0 + j / G, k = j * gw + i;
    JX[k] = (fbm(fx * 1.25, fy * 1.25, seed + 11) - 0.5) * 2 * jitter;
    JY[k] = (fbm(fx * 1.25 + 40, fy * 1.25, seed + 23) - 0.5) * 2 * jitter;
    V[k] = fbm(fx * 0.33, fy * 0.33, seed + 5);
    if (DP) DP[k] = fbm(fx * 0.9, fy * 0.9, seed + 31);
  }
  const lerp2 = (A, gxF, gyF) => {
    const i = Math.min(gw - 2, gxF | 0), j = Math.min(gh - 2, gyF | 0), u = gxF - i, v = gyF - j, k = j * gw + i;
    return A[k] + (A[k + 1] - A[k]) * u + (A[k + gw] - A[k]) * v + (A[k] - A[k + 1] - A[k + gw] + A[k + gw + 1]) * u * v;
  };
  const dryPal = dryPatch ? hex(DROUGHT.plain) : null;
  // Cache des terrains de la zone (+ marge de 1 case pour la déformation)
  const cw = tw + 2, chh = th + 2, terr = new Array(cw * chh);
  for (let y = -1; y <= th; y++) for (let x = -1; x <= tw; x++) terr[(y + 1) * cw + (x + 1)] = get(x0 + x, y0 + y);
  const T = (tx, ty) => { const ix = tx - x0 + 1, iy = ty - y0 + 1; return ix >= 0 && iy >= 0 && ix < cw && iy < chh ? terr[iy * cw + ix] : get(tx, ty); };
  for (let py = 0; py < H; py++) {
    const ly = (py + 0.5) / res, fy = y0 + ly, gyF = ly * G;
    for (let px = 0; px < W; px++) {
      const lx = (px + 0.5) / res, fx = x0 + lx, gxF = lx * G;
      const jx = lerp2(JX, gxF, gyF), jy = lerp2(JY, gxF, gyF);
      const ter = T(Math.floor(fx + jx), Math.floor(fy + jy)) || T(Math.floor(fx), Math.floor(fy)) || 'plain';
      const c = pal[ter] || pal.plain;
      let k = 0.86 + lerp2(V, gxF, gyF) * 0.26;
      let r = c[0], g = c[1], b = c[2];
      // Taches sèches (signes de sécheresse) dans les prairies
      if (dryPal && ter === 'plain' && lerp2(DP, gxF, gyF) < dryPatch) { r = dryPal[0]; g = dryPal[1]; b = dryPal[2]; }
      // Berges : l'eau s'éclaircit en approchant du bord, la terre s'assombrit (rive humide)
      const ix = Math.floor(fx) - x0 + 1, iy = Math.floor(fy) - y0 + 1;
      if (ix >= 0 && iy >= 0 && ix < tw + 2 && iy < th + 2 && near[iy * (tw + 2) + ix]) {
        const o = 0.2, ex = fx + jx, ey = fy + jy;
        const wet = (WATER.has(T(Math.floor(ex + o), Math.floor(ey)) || '') ? 1 : 0) + (WATER.has(T(Math.floor(ex - o), Math.floor(ey)) || '') ? 1 : 0)
          + (WATER.has(T(Math.floor(ex), Math.floor(ey + o)) || '') ? 1 : 0) + (WATER.has(T(Math.floor(ex), Math.floor(ey - o)) || '') ? 1 : 0);
        if (WATER.has(ter)) { if (wet < 4) { k *= 1.12; r += 12; g += 14; b += 6; } }
        else if (wet > 0) { k *= 0.8; r -= 6; b += 4; }
      }
      // Eau : reflets lents
      if (WATER.has(ter)) k *= 0.94 + vnoise(fx * 3, fy * 0.8, seed + 3) * 0.14;
      const grain = (hash(px + x0 * res, py + y0 * res, seed) - 0.5) * 10;
      const i = (py * W + px) * 4;
      d[i] = r * k + grain; d[i + 1] = g * k + grain; d[i + 2] = b * k + grain; d[i + 3] = 255;
    }
  }
}

// Adoucit les transitions (effet aquarelle) : un léger flou de la couche de couleur, avant le décor
function softenEdges(c, cv) {
  if (typeof c.filter !== 'string') return;
  c.filter = 'blur(0.8px)'; c.globalAlpha = 0.85; c.drawImage(cv, 0, 0); c.globalAlpha = 1; c.filter = 'none';
}

// ───────── Décor : arbres, montagnes, collines, rochers, décombres (ombre portée vers le sud-est) ─────────
function tree(c, x, y, h, col, season) {
  c.fillStyle = 'rgba(30,24,14,0.28)'; c.beginPath(); c.ellipse(x + h * 0.18, y + h * 0.42, h * 0.36, h * 0.13, 0, 0, 7); c.fill();
  c.fillStyle = '#4a3420'; c.fillRect(x - h * 0.05, y + h * 0.1, h * 0.1, h * 0.32);
  c.fillStyle = col; c.beginPath(); c.arc(x, y - h * 0.08, h * 0.32, 0, 7); c.fill();
  c.fillStyle = 'rgba(255,255,230,0.18)'; c.beginPath(); c.arc(x - h * 0.1, y - h * 0.18, h * 0.15, 0, 7); c.fill();
  if (season === 'winter') { c.fillStyle = 'rgba(245,248,252,0.85)'; c.beginPath(); c.arc(x - h * 0.04, y - h * 0.22, h * 0.2, Math.PI, 0); c.fill(); }
}
function pine(c, x, y, h, col, season) {
  c.fillStyle = 'rgba(30,24,14,0.28)'; c.beginPath(); c.ellipse(x + h * 0.18, y + h * 0.45, h * 0.32, h * 0.11, 0, 0, 7); c.fill();
  c.fillStyle = col; c.beginPath(); c.moveTo(x, y - h * 0.55); c.lineTo(x + h * 0.3, y + h * 0.35); c.lineTo(x - h * 0.3, y + h * 0.35); c.closePath(); c.fill();
  c.fillStyle = 'rgba(0,0,0,0.18)'; c.beginPath(); c.moveTo(x, y - h * 0.55); c.lineTo(x + h * 0.3, y + h * 0.35); c.lineTo(x + h * 0.04, y + h * 0.35); c.closePath(); c.fill();
  if (season === 'winter') { c.fillStyle = 'rgba(245,248,252,0.9)'; c.beginPath(); c.moveTo(x, y - h * 0.55); c.lineTo(x + h * 0.12, y - h * 0.2); c.lineTo(x - h * 0.12, y - h * 0.2); c.closePath(); c.fill(); }
}
const FOLIAGE = { spring: ['#3f6e2f', '#4c7d36', '#5a8a3c'], summer: ['#3b672b', '#466f2e', '#557c34'], autumn: ['#a65a26', '#c07a2c', '#8c4a22', '#b8902f'], winter: ['#4d6b55', '#5a7660', '#466253'] };
function peak(c, x, base, h, w, season) {
  c.fillStyle = 'rgba(30,24,14,0.25)'; c.beginPath(); c.moveTo(x - w * 0.6, base); c.lineTo(x + w * 1.5, base + h * 0.15); c.lineTo(x + w, base); c.closePath(); c.fill();
  c.fillStyle = '#7d756b'; c.beginPath(); c.moveTo(x - w, base); c.lineTo(x, base - h); c.lineTo(x + w, base); c.closePath(); c.fill();
  c.fillStyle = 'rgba(0,0,0,0.22)'; c.beginPath(); c.moveTo(x, base - h); c.lineTo(x + w, base); c.lineTo(x + w * 0.15, base); c.closePath(); c.fill();
  c.strokeStyle = 'rgba(44,34,22,0.55)'; c.lineWidth = Math.max(0.6, w * 0.05); c.beginPath(); c.moveTo(x - w, base); c.lineTo(x, base - h); c.lineTo(x + w, base); c.stroke();
  const cap = season === 'winter' ? 0.62 : 0.32;
  c.fillStyle = '#eef2f5'; c.beginPath(); c.moveTo(x, base - h); c.lineTo(x + w * cap, base - h * (1 - cap)); c.lineTo(x - w * cap, base - h * (1 - cap)); c.closePath(); c.fill();
}
function hill(c, x, y, w, col) {
  c.fillStyle = 'rgba(30,24,14,0.2)'; c.beginPath(); c.ellipse(x + w * 0.25, y + w * 0.12, w, w * 0.35, 0, 0, 7); c.fill();
  c.fillStyle = col; c.beginPath(); c.ellipse(x, y, w, w * 0.55, 0, Math.PI, 0); c.fill();
  c.fillStyle = 'rgba(255,250,220,0.18)'; c.beginPath(); c.ellipse(x - w * 0.3, y - w * 0.15, w * 0.45, w * 0.22, 0, Math.PI, 0); c.fill();
}
function stones(c, x, y, s, n, col) {
  for (let i = 0; i < n; i++) {
    const a = tileRand(Math.round(x * 3), Math.round(y * 5), i), r = s * (0.08 + a * 0.1);
    const px = x + (tileRand(i, Math.round(x), 3) - 0.5) * s * 0.8, py = y + (tileRand(Math.round(y), i, 5) - 0.5) * s * 0.7;
    c.fillStyle = 'rgba(30,24,14,0.25)'; c.beginPath(); c.ellipse(px + r * 0.4, py + r * 0.4, r, r * 0.6, 0, 0, 7); c.fill();
    c.fillStyle = col; c.beginPath(); c.moveTo(px - r, py); c.lineTo(px - r * 0.3, py - r * 0.8); c.lineTo(px + r * 0.8, py - r * 0.5); c.lineTo(px + r, py + r * 0.3); c.lineTo(px, py + r * 0.6); c.closePath(); c.fill();
  }
}

function decorTile(c, ter, x, y, px, py, S, season, opts = {}) {
  const r = (k) => tileRand(x, y, k);
  const fol = FOLIAGE[season] || FOLIAGE.spring;
  switch (ter) {
    case 'forest': {
      const n = 3 + Math.floor(r(1) * 3);
      const items = [];
      for (let i = 0; i < n; i++) items.push([px + S * (0.15 + r(10 + i) * 0.7), py + S * (0.2 + r(20 + i) * 0.65), S * (0.32 + r(30 + i) * 0.22), fol[Math.floor(r(40 + i) * fol.length)], r(50 + i) < 0.4]);
      items.sort((a, b) => a[1] - b[1]);
      for (const [tx, ty, h, col, p] of items) (p ? pine : tree)(c, tx, ty, h, col, season);
      break;
    }
    case 'mountain':
      peak(c, px + S * (0.38 + r(1) * 0.12), py + S * 0.9, S * (0.55 + r(2) * 0.25), S * (0.3 + r(3) * 0.08), season);
      if (r(4) < 0.6) peak(c, px + S * (0.72 + r(5) * 0.1), py + S * 0.94, S * (0.32 + r(6) * 0.2), S * (0.2 + r(7) * 0.06), season);
      break;
    case 'hills': {
      const col = season === 'winter' ? '#cfd4d2' : season === 'autumn' ? '#9c7f4c' : '#978d58';
      hill(c, px + S * (0.35 + r(1) * 0.15), py + S * (0.62 + r(2) * 0.15), S * (0.26 + r(3) * 0.08), col);
      if (r(4) < 0.55) hill(c, px + S * (0.72 + r(5) * 0.1), py + S * (0.4 + r(6) * 0.2), S * (0.18 + r(7) * 0.06), col);
      break;
    }
    case 'rubble': {
      stones(c, px + S * 0.5, py + S * 0.55, S, 4 + Math.floor(r(1) * 4), season === 'winter' ? '#c8c4ba' : '#a39a86');
      if (r(2) < 0.45) { c.fillStyle = '#857a64'; c.fillRect(px + S * (0.2 + r(3) * 0.3), py + S * (0.3 + r(4) * 0.3), S * 0.28, S * 0.1); c.fillStyle = 'rgba(30,24,14,0.3)'; c.fillRect(px + S * (0.2 + r(3) * 0.3), py + S * (0.4 + r(4) * 0.3), S * 0.28, S * 0.04); }
      break;
    }
    case 'swamp':
      c.strokeStyle = 'rgba(40,60,40,0.55)'; c.lineWidth = Math.max(0.8, S / 40);
      for (let i = 0; i < 4; i++) { const ax = px + S * (0.15 + r(10 + i) * 0.7), ay = py + S * (0.3 + r(20 + i) * 0.6); c.beginPath(); c.moveTo(ax, ay); c.lineTo(ax - S * 0.04, ay - S * 0.16); c.moveTo(ax, ay); c.lineTo(ax + S * 0.04, ay - S * 0.14); c.stroke(); }
      c.fillStyle = 'rgba(70,100,110,0.35)'; c.beginPath(); c.ellipse(px + S * (0.3 + r(5) * 0.4), py + S * (0.5 + r(6) * 0.3), S * 0.18, S * 0.07, 0, 0, 7); c.fill();
      break;
    case 'ruins':
      stones(c, px + S * 0.45, py + S * 0.6, S, 3, '#9a8f9e');
      c.fillStyle = '#7d7181'; c.fillRect(px + S * 0.55, py + S * 0.25, S * 0.12, S * 0.4); c.fillRect(px + S * 0.3, py + S * 0.35, S * 0.1, S * 0.28);
      break;
    case 'river':
      if (S >= 18) { c.strokeStyle = 'rgba(235,245,255,0.35)'; c.lineWidth = Math.max(0.8, S / 36); const y1 = py + S * (0.3 + r(1) * 0.4); c.beginPath(); c.moveTo(px + S * 0.15, y1); c.quadraticCurveTo(px + S * 0.4, y1 - S * 0.06, px + S * 0.6, y1); c.stroke(); }
      break;
    case 'plain':
      if (opts.decorPlain && S >= 14) {
        const n = Math.floor(r(1) * 3);
        c.strokeStyle = season === 'winter' ? 'rgba(160,175,185,0.6)' : 'rgba(60,80,30,0.45)'; c.lineWidth = Math.max(0.7, S / 48);
        for (let i = 0; i < n; i++) { const ax = px + S * (0.15 + r(10 + i) * 0.7), ay = py + S * (0.3 + r(20 + i) * 0.6); c.beginPath(); c.moveTo(ax, ay); c.lineTo(ax - S * 0.03, ay - S * 0.08); c.moveTo(ax, ay); c.lineTo(ax + S * 0.03, ay - S * 0.07); c.stroke(); }
        if (season !== 'winter' && r(5) < 0.18) { c.fillStyle = ['#f0d76a', '#f3f0e6', '#d9889a'][Math.floor(r(6) * 3)]; c.beginPath(); c.arc(px + S * (0.2 + r(7) * 0.6), py + S * (0.2 + r(8) * 0.6), Math.max(1, S * 0.035), 0, 7); c.fill(); }
        if (opts.cracks) { c.strokeStyle = 'rgba(90,70,40,0.45)'; c.lineWidth = Math.max(0.6, S / 60); const ax = px + S * (0.2 + r(9) * 0.5), ay = py + S * (0.3 + r(11) * 0.4); c.beginPath(); c.moveTo(ax, ay); c.lineTo(ax + S * 0.12, ay + S * 0.05); c.lineTo(ax + S * 0.2, ay - S * 0.03); c.moveTo(ax + S * 0.12, ay + S * 0.05); c.lineTo(ax + S * 0.14, ay + S * 0.16); c.stroke(); }
      }
      break;
    default:
  }
}

// ───────── Qualité graphique ─────────
export const GFX = {
  low: { city: 14, chunk: 16, lodA: 6, fog: 3, decor: false },
  medium: { city: 26, chunk: 24, lodA: 8, fog: 4, decor: true },
  high: { city: 32, chunk: 32, lodA: 8, fog: 6, decor: true },
};
export const gfxOf = (state) => (GFX[state?.meta?.gfx] ? state.meta.gfx : 'medium');

// ───────── Sol du royaume ─────────
let cityGround = { key: '', canvas: null, ms: 0 };
export function paintCityGround(state, scene, key, quality) {
  if (cityGround.key === key && cityGround.canvas) return cityGround.canvas;
  const t0 = performance.now();
  const q = GFX[quality] || GFX.medium;
  const w = state.city.w, h = state.city.h, res = q.city;
  const cv = cityGround.canvas || document.createElement('canvas');
  cv.width = w * res; cv.height = h * res;
  const c = cv.getContext('2d');
  const img = c.createImageData(cv.width, cv.height);
  const get = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? null : state.city.terrain[y * w + x]);
  const dry = scene.drought ? 2 : scene.signs.some((x) => x.key === 'drought') ? 1 : 0;
  paintTerrain(img, 0, 0, w, h, res, get, palette(scene.season, dry), { seed: 3, jitter: 0.34, dryPatch: dry === 1 ? 0.32 : 0 });
  c.putImageData(img, 0, 0);
  softenEdges(c, cv);
  if (q.decor) {
    // Décor : on laisse les cases bâties dégagées (le bâtiment les recouvre)
    const built = new Set(Object.values(state.city.buildings).map((b) => b.x + ',' + b.y));
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const ter = get(x, y);
      if (built.has(x + ',' + y) && ter !== 'river') continue;
      decorTile(c, ter, x, y, x * res, y * res, res, scene.season, { decorPlain: true, cracks: dry >= 2 });
    }
  }
  cityGround = { key, canvas: cv, ms: Math.round(performance.now() - t0) };
  return cv;
}
export const cityGroundStats = () => ({ ms: cityGround.ms, key: cityGround.key });

// ───────── Monde : niveau global + blocs ─────────
export const CHUNK = 8;
const worldCache = { sig: '', lodA: null, chunks: new Map(), fog: null, fogSig: '', terrain: '', stats: { lodAms: 0, chunkMs: 0, chunks: 0 } };
export function worldSig(w, season, quality) { return `${w.size}:${season}:${quality}`; }
function resetWorldCache(sig, terrain) { worldCache.sig = sig; worldCache.terrain = terrain; worldCache.lodA = null; worldCache.chunks.clear(); }

// Niveau global : un fond plat instantané (1 px par case), puis la peinture complète par bandes de lignes, au plus
// ~6 ms par image (aucun à-coup à l'ouverture de la carte)
function ensureLodA(w, season, quality) {
  const terr = typeof w.terrain === 'string' ? w.terrain : Array.isArray(w.terrain) ? w.terrain.join('') : String(w.terrain);
  const sig = worldSig(w, season, quality);
  if (worldCache.sig !== sig || worldCache.terrain !== terr) resetWorldCache(sig, terr);
  if (worldCache.lodA) return worldCache.lodA;
  const q = GFX[quality] || GFX.medium, res = q.lodA, S = w.size;
  const flat = document.createElement('canvas'); flat.width = S; flat.height = S;
  const fc = flat.getContext('2d'), fimg = fc.createImageData(S, S), pal = palette(season);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { const c = pal[wTerrain(w, x, y)] || pal.plain, i = (y * S + x) * 4; fimg.data[i] = c[0]; fimg.data[i + 1] = c[1]; fimg.data[i + 2] = c[2]; fimg.data[i + 3] = 255; }
  fc.putImageData(fimg, 0, 0);
  const cv = document.createElement('canvas'); cv.width = S * res; cv.height = S * res;
  worldCache.lodA = cv; worldCache.flat = flat; worldCache.lodRow = 0; worldCache.lodMs = 0;
  return cv;
}
function progressLodA(w, season, quality, msBudget = 6) {
  if (worldCache.lodRow >= w.size) return false;
  const t0 = performance.now();
  const q = GFX[quality] || GFX.medium, res = q.lodA, S = w.size, cv = worldCache.lodA, c = cv.getContext('2d'), pal = palette(season);
  const get = (x, y) => wTerrain(w, x, y);
  while (worldCache.lodRow < S && performance.now() - t0 < msBudget) {
    const y0 = worldCache.lodRow, n = Math.min(4, S - y0);
    const img = c.createImageData(S * res, n * res);
    paintTerrain(img, 0, y0, S, n, res, get, pal, { seed: 7, jitter: 0.42 });
    c.putImageData(img, 0, y0 * res);
    // Petits signes du relief à cette échelle : points d'arbres, crêtes
    for (let y = y0; y < y0 + n; y++) for (let x = 0; x < S; x++) {
      const t = get(x, y);
      if (t === 'forest') { c.fillStyle = 'rgba(30,50,25,0.45)'; c.fillRect(x * res + res * 0.25, y * res + res * 0.3, res * 0.3, res * 0.3); }
      else if (t === 'mountain') { c.fillStyle = 'rgba(245,245,245,0.55)'; c.fillRect(x * res + res * 0.4, y * res + res * 0.2, res * 0.2, res * 0.2); c.fillStyle = 'rgba(40,30,20,0.35)'; c.fillRect(x * res + res * 0.55, y * res + res * 0.45, res * 0.3, res * 0.3); }
    }
    worldCache.lodRow += n;
  }
  worldCache.lodMs += performance.now() - t0;
  if (worldCache.lodRow >= S) worldCache.stats.lodAms = Math.round(worldCache.lodMs);
  return worldCache.lodRow < S;
}

function paintChunk(w, cx, cy, season, quality) {
  const t0 = performance.now();
  const q = GFX[quality] || GFX.medium, res = q.chunk, S = w.size;
  const tw = Math.min(CHUNK, S - cx * CHUNK), th = Math.min(CHUNK, S - cy * CHUNK);
  const cv = document.createElement('canvas'); cv.width = tw * res; cv.height = th * res;
  const c = cv.getContext('2d');
  const img = c.createImageData(cv.width, cv.height);
  const get = (x, y) => wTerrain(w, x, y);
  paintTerrain(img, cx * CHUNK, cy * CHUNK, tw, th, res, get, palette(season), { seed: 7, jitter: 0.42 });
  c.putImageData(img, 0, 0);
  if (quality === 'high') softenEdges(c, cv); // le flou coûte ~3 ms par bloc : qualité élevée seulement
  if (q.decor) for (let y = 0; y < th; y++) for (let x = 0; x < tw; x++) {
    const X = cx * CHUNK + x, Y = cy * CHUNK + y;
    decorTile(c, get(X, Y), X, Y, x * res, y * res, res, season, { decorPlain: false });
  }
  worldCache.stats.chunkMs += performance.now() - t0; worldCache.stats.chunks++;
  return cv;
}

/**
 * Dessine le terrain visible du monde. T : taille d'une case à l'écran ; ox, oy : origine ; x0..x1, y0..y1 : cases
 * visibles. budget : nombre de blocs à générer au plus pendant cette image (les autres utilisent le niveau global).
 * Renvoie le nombre de blocs encore à générer (l'appelant redessine alors à l'image suivante).
 */
export function drawWorldTerrain(ctx, w, view, season, quality, budget = 4) {
  const { T, ox, oy, x0, x1, y0, y1 } = view;
  const lodA = ensureLodA(w, season, quality);
  const q = GFX[quality] || GFX.medium;
  const resA = q.lodA;
  ctx.imageSmoothingEnabled = true;
  let pending = 0;
  // Niveau global (toujours dessiné : il sert de fond pendant la génération des blocs) ; tant qu'il se peint par
  // bandes, le fond plat (1 px par case) le complète
  if (worldCache.lodRow < w.size) {
    ctx.drawImage(worldCache.flat, x0, y0, x1 - x0 + 1, y1 - y0 + 1, ox + x0 * T, oy + y0 * T, (x1 - x0 + 1) * T, (y1 - y0 + 1) * T);
    if (progressLodA(w, season, quality, budget > 1 ? 6 : 3)) pending++;
  }
  ctx.drawImage(lodA, x0 * resA, y0 * resA, (x1 - x0 + 1) * resA, (y1 - y0 + 1) * resA, ox + x0 * T, oy + y0 * T, (x1 - x0 + 1) * T, (y1 - y0 + 1) * T);
  if (T < 26) return pending;
  for (let cy = Math.floor(y0 / CHUNK); cy <= Math.floor(y1 / CHUNK); cy++) for (let cx = Math.floor(x0 / CHUNK); cx <= Math.floor(x1 / CHUNK); cx++) {
    const k = cx + ',' + cy;
    let ch = worldCache.chunks.get(k);
    if (!ch) {
      if (budget <= 0) { pending++; continue; }
      ch = paintChunk(w, cx, cy, season, quality); budget--;
      worldCache.chunks.set(k, ch);
      if (worldCache.chunks.size > 220) worldCache.chunks.delete(worldCache.chunks.keys().next().value); // mémoire bornée
    }
    ctx.drawImage(ch, ox + cx * CHUNK * T, oy + cy * CHUNK * T, (ch.width / q.chunk) * T, (ch.height / q.chunk) * T);
  }
  return pending;
}

// ───────── Brouillard à l'encre : opaque sur l'inconnu, bords déchiquetés qui mordent sur le connu ─────────
export function fogCanvas(w, revealedN, quality) {
  const q = GFX[quality] || GFX.medium, res = q.fog, S = w.size;
  const sig = `${S}:${revealedN}:${quality}`;
  if (worldCache.fog && worldCache.fogSig === sig) return worldCache.fog;
  const cv = worldCache.fog || document.createElement('canvas');
  cv.width = S * res; cv.height = S * res;
  const c = cv.getContext('2d');
  const img = c.createImageData(cv.width, cv.height), d = img.data;
  const R = (x, y) => (x < 0 || y < 0 || x >= S || y >= S ? false : isRevealed(w, x, y));
  for (let py = 0; py < cv.height; py++) {
    const fy = (py + 0.5) / res, ty = Math.floor(fy);
    for (let px = 0; px < cv.width; px++) {
      const fx = (px + 0.5) / res, tx = Math.floor(fx);
      let a;
      const n = fbm(fx * 0.8, fy * 0.8, 91);
      if (!R(tx, ty)) a = 0.93 + n * 0.07;
      else {
        // Distance à la case inconnue la plus proche (voisinage 3 × 3), déformée par le bruit : bord d'encre irrégulier
        let dmin = 2;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          if (R(tx + dx, ty + dy)) continue;
          const ex = Math.max(tx + dx - fx, 0, fx - (tx + dx + 1)), ey = Math.max(ty + dy - fy, 0, fy - (ty + dy + 1));
          dmin = Math.min(dmin, Math.hypot(ex, ey));
        }
        const edge = 0.55 + (n - 0.5) * 0.5;
        a = dmin >= edge ? 0 : 0.9 * (1 - dmin / edge) ** 1.4;
      }
      const i = (py * cv.width + px) * 4;
      const tone = 0.85 + n * 0.3;
      d[i] = 34 * tone; d[i + 1] = 27 * tone; d[i + 2] = 20 * tone; d[i + 3] = Math.round(a * 255);
    }
  }
  c.putImageData(img, 0, 0);
  worldCache.fog = cv; worldCache.fogSig = sig;
  return cv;
}
export function drawFog(ctx, w, view, revealedN, quality) {
  const { T, ox, oy, x0, x1, y0, y1 } = view;
  const fog = fogCanvas(w, revealedN, quality);
  const res = (GFX[quality] || GFX.medium).fog;
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(fog, x0 * res, y0 * res, (x1 - x0 + 1) * res, (y1 - y0 + 1) * res, ox + x0 * T, oy + y0 * T, (x1 - x0 + 1) * T, (y1 - y0 + 1) * T);
}

// ───────── Mini-carte : cadrée sur la zone connue (au moins 32 cases), lisible ─────────
export function miniFrame(w) {
  const S = w.size;
  let minX = S, minY = S, maxX = 0, maxY = 0;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) if (isRevealed(w, x, y)) { if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
  if (maxX < minX) { minX = 0; minY = 0; maxX = S - 1; maxY = S - 1; }
  const side = Math.min(S, Math.max(32, maxX - minX + 9, maxY - minY + 9));
  const cx = (minX + maxX + 1) / 2, cy = (minY + maxY + 1) / 2;
  const x = Math.max(0, Math.min(S - side, Math.round(cx - side / 2))), y = Math.max(0, Math.min(S - side, Math.round(cy - side / 2)));
  return { x, y, side };
}
export function paintMini(c, w, size, frame, season, quality, revealedN) {
  const lodA = ensureLodA(w, season, quality), res = (GFX[quality] || GFX.medium).lodA;
  if (worldCache.lodRow < w.size) c.drawImage(worldCache.flat, frame.x, frame.y, frame.side, frame.side, 0, 0, size, size);
  c.imageSmoothingEnabled = true;
  c.drawImage(lodA, frame.x * res, frame.y * res, frame.side * res, frame.side * res, 0, 0, size, size);
  const fog = fogCanvas(w, revealedN, quality), fr = (GFX[quality] || GFX.medium).fog;
  c.drawImage(fog, frame.x * fr, frame.y * fr, frame.side * fr, frame.side * fr, 0, 0, size, size);
}

export const atlasStats = () => ({ ...worldCache.stats, chunksCached: worldCache.chunks.size, cityGroundMs: cityGround.ms });
void TERRAINS;
