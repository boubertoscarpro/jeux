// v21 « Couleurs du Royaume » — Branche la scène peinte sur la carte du royaume : liste des dessins à poser (d'après
// l'état, en lecture seule), canvas du sol et de la scène gardés d'un rendu à l'autre, redessinés seulement si le
// contenu change. Les boutons HTML de views/city.js restent posés par-dessus (zones cliquables invisibles).
import { groundCanvas, wallItems, drawScene, buildingSprite, scenerySprite, roadSprite, lotSprite, scaffoldSprite, decoSprite, trophySprite, paintStats } from './scene.js';
import { depth, LAYER } from '../../systems/iso.js';
import { rectOf, gateOf, alleeTiles, wallStyle, fortLevel } from '../../systems/castle.js';
import { heraldryOf, colorOf } from '../../systems/heraldry.js';
import { sizeTier, variantOf } from '../../systems/mapSignals.js';
import { decoDef } from '../../systems/trophies.js';
import { ghosts } from '../../systems/architect.js';
import { WALLP } from './art.js';
import { terrainAt } from '../../systems/city.js';

// Qualité graphique : pixels de canvas par pixel du monde (borné pour les très grands domaines)
const RES = { high: 1.5, medium: 1.25, low: 1 };
// v22b : selon le zoom et la densité de l'écran, par paliers de 0,5 (la scène est repeinte quand le zoom se pose)
export function paintRes(f, gfx, z = 1) {
  const dpr = Math.min(2, (typeof window !== 'undefined' && window.devicePixelRatio) || 1);
  const want = Math.max(1, Math.round((RES[gfx] || RES.high) * dpr * Math.max(0.7, Math.min(2.2, z)) * 2) / 2);
  return Math.max(0.75, Math.min(want, 8192 / f.width, Math.sqrt(24e6 / (f.width * f.height))));
}

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
    if (b.type === 'road') { items.push({ x, y, depth: depth(x, y, LAYER.ground + 1), k: 'road', sp: roadSprite, noShadow: true, alpha }); continue; }
    if (b.type === 'deco') {
      const td = decoDef(b.deco);
      if (td?.trophy) items.push({ x, y, depth: depth(x, y, LAYER.building), k: `t${td.shape}${td.color}`, sp: (r) => trophySprite(td.shape, td.color, r), alpha });
      else items.push({ x, y, depth: depth(x, y, LAYER.building), k: `d${td?.icon}${season}`, sp: (r) => decoSprite(td?.icon || '🗿', season, r), alpha });
      continue;
    }
    if (!(b.level > 0)) {
      // chantier d'un nouveau bâtiment : terrain piqueté et échafaudage
      items.push({ x, y, depth: depth(x, y, LAYER.building) - 1, k: 'lot', sp: lotSprite, alpha });
      if (q) items.push({ x, y, depth: depth(x, y, LAYER.building), k: 'scaf40', sp: (r) => scaffoldSprite(40, r), alpha });
      continue;
    }
    const tier = sizeTier(b.level || 1), v = variantOf(x, y);
    const o = { active: ctx.active.has(b.id), river: b.type === 'mill' && ctx.riverSide(b), season, level: b.level };
    const filter = ctx.burning.has(b.id) || ctx.charred.has(b.id) ? 'grayscale(.75) brightness(.62)' : ctx.flooded.has(b.id) ? 'saturate(.7) brightness(.9) hue-rotate(-10deg)' : null;
    items.push({ id: b.id, x, y, depth: depth(x, y, LAYER.building), k: `b${b.type}${tier}${v}${o.active ? 1 : 0}${o.river ? 'r' : ''}${o.season}${b.level}`, sp: (r) => buildingSprite(b.type, tier, v, o, r), alpha, filter, smoke: o.active && !filter });
    if (q) items.push({ x, y, depth: depth(x, y, LAYER.building) + 1, k: 'scaf70', sp: (r) => scaffoldSprite(70, r), noShadow: true });
  }
  // terrains vagues (bâtiments « menu » à bâtir)
  if (!ctx.place && !film) for (const l of ctx.lots.values()) items.push({ x: l.x, y: l.y, depth: depth(l.x, l.y, LAYER.building), k: 'lot', sp: lotSprite });
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

// Canvas persistants (sol, scène) : rattachés à la place vide du rendu, redessinés si la clé change
const keep = { ground: null, scene: null, sceneKey: '', fx: [] };
const mkCanvas = (cls) => { const c = document.createElement('canvas'); c.className = cls; c.setAttribute('aria-hidden', 'true'); return c; };
export function attachPaint(gslot, slot, state, f, R, items, gopts) {
  if (!slot || !gslot) return;
  keep.ground ||= mkCanvas('paint-ground');
  keep.scene ||= mkCanvas('paint-scene');
  const W = Math.ceil(f.width * R), H = Math.ceil(f.height * R);
  for (const c of [keep.ground, keep.scene]) {
    if (c.width !== W || c.height !== H) { c.width = W; c.height = H; if (c === keep.scene) keep.sceneKey = ''; }
    c.style.width = Math.round(f.width) + 'px'; c.style.height = Math.round(f.height) + 'px';
    const into = c === keep.ground ? gslot : slot;
    if (c.parentElement !== into) into.appendChild(c);
  }
  // sol : le canvas peint en cache est recopié (même taille)
  const gcv = groundCanvas(state, f, R, gopts);
  if (keep.ground._src !== gcv) { const g = keep.ground.getContext('2d'); g.clearRect(0, 0, W, H); g.drawImage(gcv, 0, 0); keep.ground._src = gcv; }
  const key = R + '|' + W + 'x' + H + '|' + items.map((it) => `${it.k}@${it.x},${it.y}${it.alpha ?? ''}${it.filter || ''}${it.depth}`).join(';');
  if (key !== keep.sceneKey) {
    const { fx } = drawScene(keep.scene, items, f, R);
    // fumées : animées (ou figées) par la couche de vie, en coordonnées du monde
    keep.fx = fx.map((e) => ({ x: e.x / R, y: e.y / R, n: e.n }));
    keep.sceneKey = key;
  }
}
export const paintFx = () => keep.fx;
export const sceneCanvases = () => ({ ground: keep.ground, scene: keep.scene });
export { paintStats };

// Données de la couche de vie : cases où l'on marche, allée des charrettes, rempart avant des gardes, eau
export function lifeData(app, ctx, film, density) {
  const s = ctx.s, r = film ? film.rect : rectOf(s), g = gateOf(s, r), W = s.city.w, Hh = s.city.h;
  const solid = (x, y) => { const b = ctx.at.get(x + ',' + y); return !!b && b.type !== 'road'; };
  const walk = [];
  for (let y = 0; y < Hh; y++) for (let x = 0; x < W; x++) {
    const inside = x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1;
    const b = ctx.at.get(x + ',' + y), d = Math.max(r.x0 - x, x - r.x1, r.y0 - y, y - r.y1);
    // dedans : la cour pavée ; dehors : routes et prés libres autour des douves
    const out = b ? b.type === 'road' : d >= 2 && d <= 4 && terrainAt(s, x, y) === 'plain';
    if (inside ? solid(x, y) || ctx.lots.has(x + ',' + y) : !out) continue;
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
  return { f: ctx.f, walk, allee: allee.length > 1 ? allee : [], perim, wallH: (WALLP[style]?.h || 30) + 2, water, fx: keep.fx, density };
}

// Dessin cuit déjà posé sur une case (rebond de fin de chantier)
export function spriteAt(app, x, y) {
  const p = app._paint;
  const it = p?.items.find((i) => i.x === x && i.y === y && i.k?.startsWith('b'));
  return it ? { sprite: it.sp(p.R), R: p.R } : null;
}
