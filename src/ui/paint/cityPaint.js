// v21 « Couleurs du Royaume » — Branche la scène peinte sur la carte du royaume : liste des dessins à poser (d'après
// l'état, en lecture seule), canvas du sol et de la scène gardés d'un rendu à l'autre, redessinés seulement si le
// contenu change. Les boutons HTML de views/city.js restent posés par-dessus (zones cliquables invisibles).
import { setSpriteBudget, spriteStats, groundCanvas, groundKeyOf, paintGroundInto, sortScene, wallItems, drawScene, buildingSprite, scenerySprite, roadSprite, lotSprite, scaffoldSprite, decoSprite, trophySprite, paintStats } from './scene.js';
import { depth, LAYER, toScreen } from '../../systems/iso.js';
import { defineLayer, dropLayer, drawLayer, pickLevel, setTileBudget, sharp, tileDebug, boxTouchesTile, TILE_PX } from '../tiles.js';
import { rectOf, gateOf, alleeTiles, wallStyle, fortLevel } from '../../systems/castle.js';
import { heraldryOf, colorOf } from '../../systems/heraldry.js';
import { sizeTier, variantOf } from '../../systems/mapSignals.js';
import { decoDef } from '../../systems/trophies.js';
import { ghosts } from '../../systems/architect.js';
import { WALLP } from './art.js';
import { terrainAt } from '../../systems/city.js';

// Dessins de la ville : { x, y, depth, k (clé), sp(s), alpha?, filter? }
export function cityItems(app, ctx, { film = null, night = false, raid = null, rank = 0 } = {}) {
  const s = ctx.s, items = [], season = ctx.scene.season;
  const W = s.city.w, Hh = s.city.h, T = s.city.terrain;
  const built = new Set(Object.values(s.city.buildings).map((b) => b.x + ',' + b.y));
  // décor de la campagne
  for (let y = 0; y < Hh; y++) for (let x = 0; x < W; x++) {
    const ter = T[y * W + x];
    if (!['forest', 'mountain', 'rubble'].includes(ter) || built.has(x + ',' + y)) continue;
    const v = (variantOf(x, y) + x * 3 + y) % 6;
    items.push({ x, y, depth: depth(x, y, LAYER.scenery), k: `s${ter}${v}${season}`, sp: (r) => scenerySprite(ter, v, season, r) });
  }
  // bâtiments, routes, décorations, trophées
  for (const b of Object.values(s.city.buildings)) {
    if (film && !film.ids.has(b.id)) continue;
    const x = b.x, y = b.y, q = ctx.q.get(b.id);
    const alpha = ctx.planFrom.has(b.id) ? 0.4 : 1;
    if (b.type === 'road') { items.push({ x, y, flat: true, depth: depth(x, y, LAYER.ground + 1), k: 'road', sp: roadSprite, noShadow: true, alpha }); continue; }
    if (b.type === 'deco') {
      const td = decoDef(b.deco);
      if (td?.trophy) items.push({ x, y, depth: depth(x, y, LAYER.building), k: `t${td.shape}${td.color}`, sp: (r) => trophySprite(td.shape, td.color, r), alpha });
      else items.push({ x, y, depth: depth(x, y, LAYER.building), k: `d${td?.icon}${season}`, sp: (r) => decoSprite(td?.icon || '🗿', season, r), alpha });
      continue;
    }
    if (!(b.level > 0)) {
      // chantier d'un nouveau bâtiment : terrain piqueté et échafaudage
      items.push({ x, y, depth: depth(x, y, LAYER.building) - 1, k: 'lot', sp: lotSprite, alpha });
      if (q) {
        // v23 : le bâtiment monte derrière l'échafaudage, de la base au faîte, au rythme du chantier (12 paliers)
        const prog = () => Math.max(0.08, Math.min(1, (Date.now() - q.start) / Math.max(1, q.end - q.start)));
        items.push({ x, y, depth: depth(x, y, LAYER.building), k: `rise${b.type}`, prog, sp: (r) => buildingSprite(b.type, sizeTier(1), variantOf(x, y), { active: false, season, level: 1 }, r), noShadow: true, smoke: false });
        items.push({ x, y, depth: depth(x, y, LAYER.building) + 1, k: 'scaf40', sp: (r) => scaffoldSprite(40, r), alpha });
      }
      continue;
    }
    const tier = sizeTier(b.level || 1), v = variantOf(x, y);
    const o = { active: ctx.active.has(b.id), river: b.type === 'mill' && ctx.riverSide(b), season, level: b.level };
    const filter = ctx.burning.has(b.id) || ctx.charred.has(b.id) ? 'grayscale(.75) brightness(.62)' : ctx.flooded.has(b.id) ? 'saturate(.7) brightness(.9) hue-rotate(-10deg)' : null;
    items.push({ id: b.id, x, y, depth: depth(x, y, LAYER.building), k: `b${b.type}${tier}${v}${o.active ? 1 : 0}${o.river ? 'r' : ''}${o.season}${b.level}`, sp: (r) => buildingSprite(b.type, tier, v, o, r), alpha, filter, smoke: o.active && !filter });
    if (q) items.push({ x, y, depth: depth(x, y, LAYER.building) + 1, k: 'scaf70', sp: (r) => scaffoldSprite(70, r), noShadow: true });
  }
  // terrains vagues (bâtiments « menu » à bâtir)
  // v26 : discrets hors mode Construire (sol et piquets), panneau en mode Construire
  const showLots = !!(app.ui.buildMode || app.ui.placeType);
  if (!ctx.place && !film) for (const l of ctx.lots.values()) items.push({ x: l.x, y: l.y, depth: depth(l.x, l.y, LAYER.building), k: showLots ? 'lot' : 'lotQ', sp: (r) => lotSprite(r, showLots) });
  // silhouettes : mode architecte, aperçu d'un plan
  for (const g of ghosts(s)) {
    if (ctx.at.has(g.x + ',' + g.y)) continue;
    items.push({ x: g.x, y: g.y, depth: depth(g.x, g.y, LAYER.building), k: `g${g.type}`, sp: (r) => buildingSprite(g.type, 0, 0, { active: false, season }, r), alpha: app.ui.architect ? 0.6 : 0.35, noShadow: true, smoke: false, filter: 'sepia(.5) brightness(1.15)' });
  }
  for (const [k, type] of ctx.planTo) {
    const [x, y] = k.split(',').map(Number);
    items.push({ x, y, depth: depth(x, y, LAYER.building), k: `p${type}`, sp: (r) => buildingSprite(type, 1, 0, { active: false, season }, r), alpha: 0.5, noShadow: true, smoke: false });
  }
  // muraille, tours, porte
  const st = film ? { ...s, castle: { ...s.castle, rect: film.rect } } : s;
  const r = rectOf(st), h = heraldryOf(s);
  items.push(...wallItems(st, ctx.f, {
    rect: r, gate: gateOf(st, r), style: wallStyle(fortLevel(s, 'wall')).key, dmg: s.castle?.wallDmg || 0, night, raid: !!raid && !film,
    roofGold: rank >= 5, c1: colorOf(s, h.t1), c2: colorOf(s, h.t2), posted: s.siege?.posted || {},
  }).map((it) => ({ ...it, k: it.key })));
  return items;
}
// Paramètres du sol peint
export function groundOpts(app, ctx, film) {
  const s = ctx.s, r = film ? film.rect : rectOf(s);
  return { rect: r, moat: fortLevel(s, 'moat'), season: ctx.scene.season, allee: film ? [] : alleeTiles(s, r).map((a) => a.x + ',' + a.y), gate: gateOf(s, r) };
}

// ───────── v27 : sol et scène en tuiles, à la finesse de l'écran ─────────
// Le domaine n'est plus peint dans deux canvas géants (bornés en mémoire, donc étirés au zoom) : sol et scène sont
// découpés en tuiles de 512 px source, peintes à la finesse R (px source par px du monde) choisie selon le zoom et la
// densité de l'écran, jamais étirées plus de 1,25×. Deux canvas de la taille de la fenêtre, posés dans le plan du château
// (sous les boutons, au même endroit qu'avant), recopient les tuiles visibles à chaque mouvement de caméra.
export const CITY_LEVELS = { high: [0.5, 1, 2, 3, 4, 6], medium: [0.5, 1, 2, 3, 4], low: [0.5, 1, 2] };
export const pixelRatio = () => Math.min(3, (typeof window !== 'undefined' && window.devicePixelRatio) || 1);
// Finesse voulue pour un zoom (cuisson des dessins de la fin de chantier, mesures)
export function paintRes(f, gfx, z = 1) { return pickLevel(CITY_LEVELS[gfx] || CITY_LEVELS.high, z * pixelRatio()); }

const keep = { ground: null, scene: null, fx: [], vp: null, getCam: null, items: null, model: null, state: null, f: null, gopts: null, gkey: '', gfx: 'high', R: 1 };
const mkCanvas = (cls) => { const c = document.createElement('canvas'); c.className = cls; c.setAttribute('aria-hidden', 'true'); return c; };
const PAD = 3;
// Modèle de la scène pour une liste de dessins : placement et ordre calculés une fois, à la finesse 1 (les rectangles
// sont proportionnels à la finesse), puis tuiles → dessins qui les touchent
function sceneModel(items, f) {
  if (keep.model && keep.model.items === items && keep.model.f === f) return keep.model;
  const placed = items.map((it) => { const q = toScreen(f, it.x, it.y); const sp = it.sp(1); return { it, X: q.sx, Y: q.sy, sp }; });
  const fx = [];
  for (const p of placed) if (p.it.smoke !== false && p.sp.art) for (const e of p.sp.fx) fx.push({ x: p.X + e.x, y: p.Y + e.y, n: e.n });
  const order = sortScene(placed.slice());
  // rectangle occupé (dessin et ombre) en px du monde
  for (const p of order) {
    const sp = p.sp; let a = [p.X, p.Y, p.X, p.Y];
    if (sp.art) a = [p.X - sp.ax, p.Y - sp.ay, p.X - sp.ax + sp.art.width, p.Y - sp.ay + sp.art.height];
    if (sp.shadow) a = [Math.min(a[0], p.X - sp.sx), Math.min(a[1], p.Y - sp.sy), Math.max(a[2], p.X - sp.sx + sp.shadow.width), Math.max(a[3], p.Y - sp.sy + sp.shadow.height)];
    p.box = [a[0] - PAD, a[1] - PAD, a[2] + PAD, a[3] + PAD];
    p.key0 = `${p.it.k}@${p.it.x},${p.it.y}${p.it.alpha ?? ''}${p.it.filter || ''}${p.it.depth}`;
  }
  keep.model = { items, f, order, fx, lists: new Map() };
  return keep.model;
}
function tileList(M, R, tx, ty) {
  const k = R + '|' + tx + '|' + ty;
  let l = M.lists.get(k);
  if (!l) {
    l = M.order.filter((p) => boxTouchesTile(p.box, R, tx, ty));
    M.lists.set(k, l);
  }
  return l;
}
const itemKey = (p) => p.key0 + (p.it.prog ? '~' + Math.floor(p.it.prog() * 12) : '');
function paintSceneTile(cv, R, tx, ty) {
  const t0 = performance.now();
  const M = keep.model, g = cv.getContext('2d');
  if (!g || !M) return true;
  g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, cv.width, cv.height);
  g.translate(-tx * TILE_PX, -ty * TILE_PX);
  const list = tileList(M, R, tx, ty);
  for (const p of list) {
    if (p.it.noShadow) continue;
    const sp = p.it.sp(R);
    if (!sp.shadow) continue;
    g.globalAlpha = p.it.alpha ?? 1; g.drawImage(sp.shadow, p.X * R - sp.sx, p.Y * R - sp.sy);
  }
  for (const p of list) {
    const it = p.it, sp = it.sp(R), X = p.X * R, Y = p.Y * R;
    if (!sp.art) continue;
    g.globalAlpha = it.alpha ?? 1;
    g.filter = it.filter || 'none';
    if (it.prog) {
      const h = sp.art.height, k = it.prog();
      g.save(); g.beginPath(); g.rect(X - sp.ax, Y - sp.ay + h * (1 - k), sp.art.width, h * k + 1); g.clip();
      g.drawImage(sp.art, X - sp.ax, Y - sp.ay); g.restore();
    } else g.drawImage(sp.art, X - sp.ax, Y - sp.ay);
    g.filter = 'none';
  }
  g.globalAlpha = 1;
  paintStats.sceneMs = performance.now() - t0; paintStats.items = M.order.length;
  return true;
}
function paintGroundTile(cv, R, tx, ty) {
  const t0 = performance.now();
  const g = cv.getContext('2d');
  if (!g) return true;
  g.setTransform(1, 0, 0, 1, 0, 0);
  const X0 = tx * TILE_PX, Y0 = ty * TILE_PX;
  g.translate(-X0, -Y0);
  paintGroundInto(g, keep.state, keep.f, R, keep.gopts, [X0, Y0, X0 + cv.width, Y0 + cv.height]);
  paintStats.groundMs = performance.now() - t0;
  return true;
}
function defineCityLayers() {
  const levels = CITY_LEVELS[keep.gfx] || CITY_LEVELS.high;
  const bounds = () => [0, 0, keep.f.width, keep.f.height];
  const onReady = () => redrawCity();
  defineLayer({ id: 'cg', levels, bounds, key: (R) => keep.gkey + '|' + R, paint: (cv, R, tx, ty) => paintGroundTile(cv, R, tx, ty), onReady, sync: true, syncBudget: 350, syncStale: true, fade: true });
  defineLayer({ id: 'cs', levels, bounds, key: (R, tx, ty) => { const M = keep.model; return M ? tileList(M, R, tx, ty).map(itemKey).join(';') : ''; }, paint: (cv, R, tx, ty) => paintSceneTile(cv, R, tx, ty), onReady, sync: true, syncBudget: 350, syncStale: true, fade: true });
}
let redrawRaf = 0;
function redrawCity() { if (redrawRaf) return; redrawRaf = requestAnimationFrame(() => { redrawRaf = 0; if (keep.getCam) drawCity(keep.getCam()); }); }

export function attachPaint(gslot, slot, state, f, R, items, gopts, vp = null, getCam = null, gfx = 'high') {
  if (!slot || !gslot) return;
  keep.ground ||= mkCanvas('paint-ground');
  keep.scene ||= mkCanvas('paint-scene');
  if (keep.ground.parentElement !== gslot) gslot.appendChild(keep.ground);
  if (keep.scene.parentElement !== slot) slot.appendChild(keep.scene);
  const gkey = groundKeyOf(state, gopts);
  const relevel = keep.gfx !== gfx || keep.f?.width !== f.width || keep.f?.height !== f.height;
  Object.assign(keep, { state, f, gopts, gkey, items, gfx, vp: vp || keep.vp, getCam: getCam || keep.getCam });
  sceneModel(items, f);
  keep.fx = keep.model.fx;
  if (relevel) { dropLayer('cg'); dropLayer('cs'); }
  defineCityLayers();
  setTileBudget(gfx); setSpriteBudget(gfx);
  if (keep.getCam && keep.getCam().init !== false) drawCity(keep.getCam());
}
// Recopie les tuiles visibles dans les deux canvas de la fenêtre. cam = { x, y, z } (caméra CSS du château)
export function drawCity(cam) {
  const vp = keep.vp;
  if (!vp || !vp.isConnected || !keep.f) return;
  const t0 = performance.now();
  const dpr = pixelRatio(), vw = vp.clientWidth, vh = vp.clientHeight;
  const W = Math.max(1, Math.round(vw * dpr)), H = Math.max(1, Math.round(vh * dpr));
  for (const [c, id] of [[keep.ground, 'cg'], [keep.scene, 'cs']]) {
    if (!c) continue;
    if (c.width !== W || c.height !== H) { c.width = W; c.height = H; }
    c.style.left = (-cam.x / cam.z) + 'px'; c.style.top = (-cam.y / cam.z) + 'px';
    c.style.width = (vw / cam.z) + 'px'; c.style.height = (vh / cam.z) + 'px';
    const g = c.getContext('2d');
    g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, W, H);
    drawLayer(g, id, { k: cam.z * dpr, ox: cam.x * dpr, oy: cam.y * dpr, vw: W, vh: H });
  }
  keep.R = sharp.cs?.lv || keep.R;
  const dt = performance.now() - t0; paintStats.drawMs = dt; paintStats.draws = (paintStats.draws || 0) + 1; paintStats.drawTot = (paintStats.drawTot || 0) + dt;
}
export const paintFx = () => keep.fx;
// v27 : agrandissement réel du sol et de la scène à la dernière image (tools/sharpness.cjs)
export const citySharp = () => ({ view: 'city', z: keep.getCam?.().z, dpr: pixelRatio(), ground: sharp.cg, scene: sharp.cs, life: sharp.life, tiles: tileDebug(), sprites: spriteStats() });
// Sol et scène entiers à la finesse k (mode photo)
export function fullCanvases(k) {
  if (!keep.state) return { ground: null, scene: null };
  const ground = groundCanvas(keep.state, keep.f, k, keep.gopts);
  const scene = document.createElement('canvas'); scene.width = Math.ceil(keep.f.width * k); scene.height = Math.ceil(keep.f.height * k);
  drawScene(scene, keep.items, keep.f, k);
  return { ground, scene };
}
export const sceneCanvases = () => ({ ground: keep.ground, scene: keep.scene });
export { paintStats };
export { wildColor } from './scene.js';

// Données de la couche de vie : cases où l'on marche, allée des charrettes, rempart avant des gardes, eau
export function lifeData(app, ctx, film, density) {
  const s = ctx.s, r = film ? film.rect : rectOf(s), g = gateOf(s, r), W = s.city.w, Hh = s.city.h;
  const solid = (x, y) => { const b = ctx.at.get(x + ',' + y); return !!b && b.type !== 'road'; };
  const walk = [], walled = !!wallStyle(fortLevel(s, 'wall')).key;
  for (let y = 0; y < Hh; y++) for (let x = 0; x < W; x++) {
    const inside = x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1;
    const b = ctx.at.get(x + ',' + y), d = Math.max(r.x0 - x, x - r.x1, r.y0 - y, y - r.y1);
    // dedans : la cour pavée ; dehors : routes et prés libres autour des douves
    const out = b ? b.type === 'road' : d >= 2 && d <= 4 && terrainAt(s, x, y) === 'plain';
    if (inside ? solid(x, y) || ctx.lots.has(x + ',' + y) : !out) continue;
    // v23 : pas de passant sur la dernière rangée de la cour, juste derrière le rempart avant (il passerait devant lui)
    if (inside && walled && (x === r.x1 || y === r.y1) && !(x === g.x && y === r.y1)) continue;
    // pas de passant juste derrière un bâtiment (il serait dessiné par-dessus le toit)
    if (solid(x + 1, y) || solid(x, y + 1) || solid(x + 1, y + 1)) continue;
    walk.push([x, y]);
  }
  const allee = alleeTiles(s, r).map((a) => [a.x, a.y]);
  if (allee.length) { allee.sort((a, b) => a[1] - b[1]); allee.push([g.x, Math.min(Hh - 1, r.y1 + 3)]); }
  const style = wallStyle(fortLevel(s, 'wall')).key;
  const perim = style && style !== 'stakes' ? [[r.x0 + 0.2, r.y1 + 1], [r.x1 + 1, r.y1 + 1], [r.x1 + 1, r.y0 + 0.2]] : [];
  const water = [];
  for (let y = 0; y < Hh; y++) for (let x = 0; x < W; x++) {
    const ring = Math.max(r.x0 - x, x - r.x1, r.y0 - y, y - r.y1) === 1;
    if ((ring && fortLevel(s, 'moat') > 0) || terrainAt(s, x, y) === 'river') water.push([x, y]);
  }
  // v23 : chantiers en cours (poussière et coups de marteau) ; ligne de la porte (la charrette passe sous la voûte)
  const sites = [];
  for (const q of s.queues?.build || []) {
    const b = q.bid ? s.city.buildings[q.bid] : null;
    const at = b ? { x: b.x, y: b.y } : q.kind === 'clear' ? { x: q.x, y: q.y } : null;
    if (at) sites.push({ x: at.x, y: at.y, h: q.kind === 'clear' ? 10 : b && b.level > 0 ? 70 : 40 });
  }
  return { f: ctx.f, walk, allee: allee.length > 1 ? allee : [], perim, wallH: (WALLP[style]?.h || 30) + 2, water, fx: keep.fx, density, sites, gateY: style && style !== 'stakes' ? r.y1 + 1 : null };
}

// Dessin cuit déjà posé sur une case (rebond de fin de chantier)
export function spriteAt(app, x, y) {
  const p = app._paint;
  const it = p?.items.find((i) => i.x === x && i.y === y && i.k?.startsWith('b'));
  return it ? { sprite: it.sp(keep.R), R: keep.R } : null;
}
