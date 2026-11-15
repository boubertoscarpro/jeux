// v15 — « L'Atlas vivant » : peinture procédurale des cartes (aucune image externe).
//  - Sol du royaume : une seule peinture continue sous la grille (herbe en aquarelle, berges, sous-bois, rochers,
//    décombres variés), repeinte seulement si sa signature change (terrain, saison, sécheresse, qualité).
//  - Monde : un niveau global (8 px par case) pour la vue d'ensemble, et des blocs de 8 × 8 cases mis en cache pour
//    les vues rapprochées, générés au plus quelques-uns par image (budget) ; brouillard à l'encre ; mini-carte.
// Les transitions entre terrains viennent d'un échantillonnage déformé par du bruit : chaque case garde son terrain en
// son centre (lisibilité du jeu), mais ses bords deviennent organiques.
import { TERRAINS, CHAR_TO_TERRAIN } from '../data/world.js';
import { wTerrain, isRevealed } from '../systems/world.js';
import { makeTerrainKit, terrainWorkerSource } from './terrainKit.js';
import { defineLayer, dropLayer, drawLayer, drawCached, prefetchLevel, resumeJob, setTileBudget, sharp, tileStats, gestureActive, TILE_PX } from './tiles.js';
const KIT = makeTerrainKit();

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

/**
 * Peint une zone de cases dans un ImageData (le calcul est dans terrainKit.js, partagé avec le worker du monde).
 * dryPatch : 0–1, part des prairies tachées de sécheresse (signes de présage).
 */
export function paintTerrain(img, x0, y0, tw, th, res, get, pal, opts = {}) {
  KIT.paintTerrain(img, x0, y0, tw, th, res, get, pal, { ...opts, dryPal: hex(DROUGHT.plain) });
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
export const gfxOf = (state) => (GFX[state?.meta?.gfx] ? state.meta.gfx : 'high');

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

// ───────── Monde : pyramide de tuiles (v27) ─────────
// Niveaux de 16 à 256 px par case selon la qualité. Le niveau 16 est la carte d'ensemble (massifs forestiers, relief,
// pas d'arbres un par un) ; il est épinglé (jamais évincé) et sert de repli et de mini-carte. Les pixels du terrain sont
// peints par un worker quand c'est possible, sinon par tranches de lignes ; le décor (arbres, sommets) est peint ensuite
// sur le fil principal, avec une marge d'une case pour qu'un arbre à cheval sur deux tuiles soit identique des deux côtés.
export const WORLD_LEVELS = { high: [16, 32, 64, 128, 256], medium: [16, 32, 64, 128, 256], low: [16, 32, 64] };
const OVERVIEW = 16;
export function worldSig(w, season, quality) { return `${w.size}:${season}:${quality}`; }
const WL = { sig: '', terrain: '', w: null, season: 'spring', quality: 'high', flat: null, onReady: null, stats: { lodAms: 0 } };
// Plusieurs workers (jusqu'à 3, selon les cœurs) : les tuiles visibles se peignent en parallèle
let workers = [], workerOk = typeof Worker !== 'undefined' && typeof Blob !== 'undefined', workerWorld = '', jobId = 0, worldMsg = null;
const jobs = new Map();
function getWorker() {
  if (!workerOk) return null;
  if (!workers.length) {
    try {
      const url = URL.createObjectURL(new Blob([terrainWorkerSource()], { type: 'text/javascript' }));
      const n = Math.max(1, Math.min(3, ((typeof navigator !== 'undefined' && navigator.hardwareConcurrency) || 2) - 1));
      for (let i = 0; i < n; i++) {
        const wk = new Worker(url);
        wk.busy = 0;
        wk.onmessage = (e) => { wk.busy--; const j = jobs.get(e.data.id); jobs.delete(e.data.id); tileStats.workerMs = (tileStats.workerMs || 0) + (e.data.ms || 0); if (!j) return; j.state.buf = e.data; resumeJob(j); };
        wk.onerror = () => { workerOk = false; workers = []; for (const j of jobs.values()) { j.state = null; resumeJob(j); } jobs.clear(); };
        if (worldMsg) wk.postMessage(worldMsg);
        workers.push(wk);
      }
    } catch { workerOk = false; workers = []; }
  }
  return workers.length ? workers.reduce((a, b) => (b.busy < a.busy ? b : a)) : null;
}
// Un travail à la fois par worker : les priorités (centre de la vue d'abord) jouent au moment de l'envoi
const workerFree = () => !workerOk || !getWorker() || workers.some((w) => w.busy === 0);
export const worldWorkerOn = () => workers.length > 0 && workerOk;
const terrOf = (w) => (typeof w.terrain === 'string' ? w.terrain : Array.isArray(w.terrain) ? w.terrain.join('') : String(w.terrain));

function ensureWorldLayer(w, season, quality) {
  const terr = terrOf(w), sig = worldSig(w, season, quality);
  if (WL.sig === sig && WL.terrain === terr && WL.w === w) return;
  const changed = WL.sig !== sig || WL.terrain !== terr;
  Object.assign(WL, { sig, terrain: terr, w, season, quality });
  if (!changed) return;
  dropLayer('wt');
  setTileBudget(quality);
  // fond plat instantané (1 px par case) en attendant les tuiles
  const S = w.size, pal = palette(season);
  const flat = document.createElement('canvas'); flat.width = S; flat.height = S;
  const fc = flat.getContext('2d'), fimg = fc.createImageData(S, S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { const c = pal[wTerrain(w, x, y)] || pal.plain, i = (y * S + x) * 4; fimg.data[i] = c[0]; fimg.data[i + 1] = c[1]; fimg.data[i + 2] = c[2]; fimg.data[i + 3] = 255; }
  fc.putImageData(fimg, 0, 0);
  WL.flat = flat; WL.rivers = null;
  worldMsg = { world: { size: S, terrain: terr, map: CHAR_TO_TERRAIN } };
  if (getWorker() && workerWorld !== sig + terr) { for (const wk of workers) wk.postMessage(worldMsg); workerWorld = sig + terr; }
  const levels = WORLD_LEVELS[quality] || WORLD_LEVELS.medium;
  defineLayer({
    id: 'wt', levels, bounds: () => [0, 0, S, S], key: () => sig, pin: (lv) => lv === OVERVIEW, fade: true, derive: true, canStart: workerFree,
    onReady: () => WL.onReady?.(),
    paint: (cv, lv, tx, ty, job) => paintWorldTile(cv, lv, tx, ty, job),
  });
  prefetchLevel('wt', OVERVIEW);
}

function paintWorldTile(cv, lv, tx, ty, job) {
  const w = WL.w, S = w.size, span = TILE_PX / lv, x0 = tx * span, y0 = ty * span;
  const tw = Math.min(span, S - x0), th = Math.min(span, S - y0), W = tw * lv, H = th * lv;
  const pal = palette(WL.season), seed = 7, jitter = 0.42;
  const c = cv.getContext('2d');
  if (!c) return true;
  const get = (x, y) => wTerrain(w, x, y);
  // 1) pixels : worker, sinon tranches de 48 lignes
  if (!job.state) {
    const wk = !job.sync && getWorker();
    if (wk) {
      const id = ++jobId; jobs.set(id, job); job.state = { worker: true }; job.wait = true;
      wk.busy++; wk.postMessage({ id, x0, y0, tw, th, res: lv, pal, seed, jitter }); tileStatsWorker();
      return false;
    }
    job.state = { P: KIT.prepare(x0, y0, tw, th, lv, get, pal, { seed, jitter }), row: 0, img: c.createImageData(W, H) };
  }
  const st = job.state;
  if (st.worker && !st.buf) { job.wait = true; return false; }
  if (st.buf) { c.putImageData(new ImageData(new Uint8ClampedArray(st.buf.buf), st.buf.w, st.buf.h), 0, 0); st.done = true; }
  else if (!st.done) {
    const step = job.sync ? H : Math.max(8, Math.floor(48 * 512 / W));
    const r1 = Math.min(H, st.row + step);
    KIT.rows(st.P, st.img.data.subarray(st.row * W * 4, r1 * W * 4), st.row, r1);
    st.row = r1;
    if (st.row < H) return false;
    c.putImageData(st.img, 0, 0); st.done = true;
  }
  // 2) adoucissement (aquarelle) aux niveaux bas, puis décor avec une case de marge
  if (lv <= 32 && WL.quality === 'high') softenEdges(c, cv);
  const q = GFX[WL.quality] || GFX.medium;
  if (lv === OVERVIEW) overviewDecor(c, x0, y0, tw, th, lv, get, WL.season, pal);
  else if (q.decor) for (let y = y0 - 1; y <= y0 + th; y++) for (let x = x0 - 1; x <= x0 + tw; x++) {
    const ter = get(x, y);
    if (ter) decorTile(c, ter, x, y, (x - x0) * lv, (y - y0) * lv, lv, WL.season, { decorPlain: false });
  }
  return true;
}
const tileStatsWorker = () => { tileStats.workerJobs++; };

// Carte d'ensemble : forêts regroupées en massifs, montagnes et collines en relief, sans détail à l'unité
function overviewDecor(c, x0, y0, tw, th, S, get, season, pal) {
  const fol = FOLIAGE[season] || FOLIAGE.spring, dark = fol[0], light = fol[fol.length - 1];
  const shade = (col, k) => `rgb(${col.map((v) => Math.max(0, Math.min(255, Math.round(v * k)))).join(',')})`;
  // ombre des massifs, puis frondaisons, puis lumières : les cases voisines se fondent en une seule masse
  for (const pass of [0, 1, 2]) for (let y = y0 - 1; y <= y0 + th; y++) for (let x = x0 - 1; x <= x0 + tw; x++) {
    if (get(x, y) !== 'forest') continue;
    const px = (x - x0 + 0.5) * S, py = (y - y0 + 0.5) * S;
    for (let i = 0; i < 3; i++) {
      const ax = px + (tileRand(x, y, i) - 0.5) * S * 0.7, ay = py + (tileRand(x, y, i + 9) - 0.5) * S * 0.7, r = S * (0.36 + tileRand(x, y, i + 5) * 0.16);
      if (pass === 0) { c.fillStyle = 'rgba(20,30,14,0.35)'; c.beginPath(); c.arc(ax + r * 0.25, ay + r * 0.3, r, 0, 7); c.fill(); }
      else if (pass === 1) { c.fillStyle = i === 1 ? dark : shade(pal.forest, 0.92); c.beginPath(); c.arc(ax, ay, r, 0, 7); c.fill(); }
      else { c.fillStyle = light; c.globalAlpha = 0.55; c.beginPath(); c.arc(ax - r * 0.3, ay - r * 0.3, r * 0.42, 0, 7); c.fill(); c.globalAlpha = 1; }
    }
  }
  for (let y = y0 - 1; y <= y0 + th; y++) for (let x = x0 - 1; x <= x0 + tw; x++) {
    const ter = get(x, y);
    if (ter === 'mountain' || ter === 'hills') decorTile(c, ter, x, y, (x - x0) * S, (y - y0) * S, S, season, {});
  }
}

/**
 * Dessine le terrain visible du monde. view : { T (px CSS par case), ox, oy, x0..x1, y0..y1 } ; ctx en px CSS
 * (transformation = densité de l'écran). onReady : rappelé quand une tuile est prête (redessiner la carte).
 * Renvoie le nombre de tuiles encore à peindre.
 */
export function drawWorldTerrain(ctx, w, view, season, quality, onReady = null) {
  ensureWorldLayer(w, season, quality);
  WL.onReady = onReady;
  const { T, ox, oy, x0, x1, y0, y1 } = view;
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(WL.flat, x0, y0, x1 - x0 + 1, y1 - y0 + 1, ox + x0 * T, oy + y0 * T, (x1 - x0 + 1) * T, (y1 - y0 + 1) * T);
  const m = ctx.getTransform(), dpr = m.a || 1;
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
  const missing = drawLayer(ctx, 'wt', { k: T * dpr, ox: ox * dpr + m.e, oy: oy * dpr + m.f, vw: ctx.canvas.width, vh: ctx.canvas.height });
  ctx.restore();
  return missing;
}

// ───────── Lignes vectorielles : rivières, frontières, brouillard (v27) ─────────
export { regionLoops, chaikin, tracePath } from './contours.js';
import { regionLoops, chaikin, tracePath } from './contours.js';

// Rivières : chaînes de cases d'eau (4-voisins) reliant leurs centres, lissées
function riverChains(w) {
  if (WL.rivers && WL.riversFor === WL.terrain) return WL.rivers;
  const S = w.size, isR = (x, y) => wTerrain(w, x, y) === 'river';
  const nb = (x, y) => [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dy]) => isR(x + dx, y + dy)).map(([dx, dy]) => [x + dx, y + dy]);
  const used = new Set(), ek = (a, b) => (a[0] * S + a[1] < b[0] * S + b[1] ? `${a}|${b}` : `${b}|${a}`);
  const chains = [];
  const cells = [];
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) if (isR(x, y)) cells.push([x, y]);
  // départs : extrémités et carrefours (degré ≠ 2), puis ce qui reste (boucles)
  const order = cells.filter(([x, y]) => nb(x, y).length !== 2).concat(cells);
  for (const s of order) for (const n of nb(...s)) {
    if (used.has(ek(s, n))) continue;
    const ch = [s];
    let a = s, b = n;
    for (;;) {
      used.add(ek(a, b)); ch.push(b);
      const nn = nb(...b).filter((c) => !used.has(ek(b, c)));
      if (nb(...b).length !== 2 || !nn.length) break;
      a = b; b = nn[0];
    }
    chains.push(chaikin(ch.map(([x, y]) => [x + 0.5, y + 0.5]), 3, false));
  }
  for (const [x, y] of cells) if (!nb(x, y).length) chains.push([[x + 0.3, y + 0.5], [x + 0.7, y + 0.5]]);
  WL.rivers = chains; WL.riversFor = WL.terrain;
  return chains;
}
export function drawRivers(ctx, w, T, ox, oy, season) {
  if (T < 6) return;
  const ch = riverChains(w);
  ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const water = season === 'winter' ? '#a9c8dc' : '#4f86b2';
  for (const [col, k] of [['rgba(52,70,48,0.35)', 0.78], [water, 0.6], ['rgba(225,242,255,0.28)', 0.16]]) {
    ctx.strokeStyle = col; ctx.lineWidth = Math.max(1, T * k);
    ctx.beginPath(); tracePath(ctx, ch, T, ox, oy, false); ctx.stroke();
  }
  ctx.restore();
}

// Brouillard vectoriel : contour lissé et frangé de la zone connue ; encre dense dehors, bord adouci par des traits
// larges et transparents ; grain d'encre au pixel réel (motif aligné sur l'écran, jamais étiré)
let fogLoops = { sig: '', loops: [] }, inkPat = null;
function fogShape(w, revealedN) {
  const sig = w.size + ':' + revealedN;
  if (fogLoops.sig === sig) return fogLoops.loops;
  const raw = regionLoops(w.size, (x, y) => isRevealed(w, x, y));
  const loops = raw.map((l) => {
    const p = chaikin(l, 2, true);
    // franges : déplacement par un bruit fixé au monde
    return chaikin(p.map(([x, y]) => [x + (fbm(x * 0.9, y * 0.9, 31) - 0.5) * 0.9, y + (fbm(x * 0.9, y * 0.9, 57) - 0.5) * 0.9]), 1, true);
  });
  fogLoops = { sig, loops };
  return loops;
}
function inkPattern(ctx) {
  if (!inkPat) {
    const N = 192, cv = document.createElement('canvas'); cv.width = N; cv.height = N;
    const c = cv.getContext('2d'), img = c.createImageData(N, N);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      // bruit périodique (tuile sans raccord)
      const a = (x / N) * Math.PI * 2, b = (y / N) * Math.PI * 2;
      const n = fbm(3 + Math.cos(a) * 2, 3 + Math.sin(b) * 2 + Math.sin(a), 91) * 0.7 + hash(x, y, 4) * 0.3;
      const tone = 0.85 + n * 0.3, i = (y * N + x) * 4;
      img.data[i] = 34 * tone; img.data[i + 1] = 27 * tone; img.data[i + 2] = 20 * tone; img.data[i + 3] = 255;
    }
    c.putImageData(img, 0, 0);
    inkPat = cv;
  }
  const p = ctx.createPattern(inkPat, 'repeat');
  const m = ctx.getTransform();
  if (p.setTransform && typeof DOMMatrix !== 'undefined') p.setTransform(new DOMMatrix([1 / (m.a || 1), 0, 0, 1 / (m.d || 1), 0, 0]));
  return p;
}
export function drawFog(ctx, w, view, revealedN, main = true) {
  const { T, ox, oy } = view, S = w.size;
  const loops = fogShape(w, revealedN);
  ctx.save();
  ctx.beginPath(); ctx.rect(ox, oy, S * T, S * T); tracePath(ctx, loops, T, ox, oy, true);
  ctx.clip('evenodd');
  ctx.globalAlpha = 0.93; ctx.fillStyle = inkPattern(ctx); ctx.fillRect(ox, oy, S * T, S * T);
  ctx.restore();
  // bord adouci (des deux côtés du contour) ; v27.1 : un seul trait pendant un geste
  ctx.save(); ctx.lineJoin = 'round';
  for (const [k, a] of gestureActive() ? [[0.4, 0.3]] : [[0.95, 0.14], [0.55, 0.2], [0.22, 0.3]]) {
    ctx.strokeStyle = `rgba(34,27,20,${a})`; ctx.lineWidth = Math.max(1.5, T * k);
    ctx.beginPath(); tracePath(ctx, loops, T, ox, oy, true); ctx.stroke();
  }
  ctx.restore();
  if (main) sharp.fog = { mag: 1, lv: 'vecteur', need: +(T * (ctx.getTransform().a || 1)).toFixed(2), missing: 0 };
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
  ensureWorldLayer(w, season, quality);
  const T = size / frame.side, ox = -frame.x * T, oy = -frame.y * T;
  c.imageSmoothingEnabled = true;
  c.drawImage(WL.flat, frame.x, frame.y, frame.side, frame.side, 0, 0, size, size);
  const m = c.getTransform(), dpr = m.a || 1;
  c.save(); c.setTransform(1, 0, 0, 1, 0, 0);
  drawCached(c, 'wt', OVERVIEW, { k: T * dpr, ox: ox * dpr, oy: oy * dpr, vw: c.canvas.width, vh: c.canvas.height });
  c.restore();
  drawFog(c, w, { T, ox, oy }, revealedN, false);
}

export const atlasStats = () => ({ ...WL.stats, worker: worldWorkerOn(), cityGroundMs: cityGround.ms });
void TERRAINS;
