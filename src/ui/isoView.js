// v20 « Ma forteresse » — Scène isométrique du royaume : placement des dessins (projection, profondeur), décor de la
// campagne et muraille mis en cache, positions et silhouettes cliquables des bâtiments. La logique (systems/iso.js)
// reste pure ; ce module produit du HTML et ne modifie jamais l'état.
import { isoFrame, toScreen, depth, LAYER, diamond, tileCenter } from '../systems/iso.js';
import { rectOf, gateOf, wallStyle, fortLevel, encStage } from '../systems/castle.js';
import { DEFENSE_ENGINES } from '../data/siege.js';
import { heraldryOf, colorOf } from '../systems/heraldry.js';
import { SPRITE, P, box, tower, flag, sceneryIso, isoUse, WALL, shade } from './isoArt.js';
import { variantOf } from '../systems/mapSignals.js';

export const SPRITE_BASE = SPRITE.h - 64; // sommet haut du losange dans un dessin
export const frameOf = (state) => isoFrame(state.city.w, state.city.h);
const f1 = (n) => Math.round(n * 10) / 10;
// Style de position d'un dessin posé sur la case (x, y)
export function placeStyle(f, x, y, layer = LAYER.building, dz = 0) {
  const p = toScreen(f, x, y);
  return `left:${f1(p.sx - SPRITE.w / 2)}px;top:${f1(p.sy - SPRITE_BASE - dz)}px;z-index:${depth(x, y, layer)}`;
}
// Silhouette cliquable (clip-path) : losange de la case + volume du bâtiment jusqu'à sa hauteur (px au-dessus du sol)
export function hitClip(height) {
  // Hexagone d'un volume isométrique : base en losange, flancs verticaux, sommet en losange (plus de rectangle qui
  // déborderait sur les voisins de derrière)
  const side = Math.max(0, SPRITE.h - 32 - Math.max(8, height - 24)), top = Math.max(0, SPRITE.h - 64 - Math.max(8, height - 24));
  const pc = (y) => f1((y / SPRITE.h) * 100) + '%';
  return `clip-path:polygon(50% 100%, 0% ${pc(SPRITE.h - 32)}, 0% ${pc(side)}, 50% ${pc(top)}, 100% ${pc(side)}, 100% ${pc(SPRITE.h - 32)})`;
}
// Hauteur approximative d'un dessin (pour la silhouette cliquable)
const TALL = { townhall: 150, castle: 120, watchtower: 120, observatory: 100, library: 100, mill: 110, scriptorium: 90, guildhall: 90, embassy: 80, monument: 100 };
const FLAT = { farm: 24, pasture: 24, orchard: 40, quarry: 40, lists: 40, port: 40, road: 4, herald: 50 };
export const artHeight = (type, tier = 0) => FLAT[type] ?? (TALL[type] ?? 70) + tier * 6;

// Losange (SVG) d'une case, en coordonnées du monde : survol, sélection, aperçu du placement
export function diamondPath(f, x, y) {
  return 'M' + diamond(f, x, y).map((p) => `${f1(p.sx)} ${f1(p.sy)}`).join('L') + 'Z';
}

// ───────── Décor de la campagne (mis en cache : terrain, saison, enceinte) ─────────
let sceneryCache = { key: '', html: '' };
export function sceneryLayer(state, f, season) {
  const W = state.city.w, Hh = state.city.h, T = state.city.terrain;
  const key = `${W}x${Hh}|${season}|${typeof T === 'string' ? T : T.join('')}|${JSON.stringify(rectOf(state))}|${Object.keys(state.city.buildings).length}`;
  if (sceneryCache.key === key) return sceneryCache.html;
  const built = new Set(Object.values(state.city.buildings).map((b) => b.x + ',' + b.y));
  const out = [];
  for (let y = 0; y < Hh; y++) for (let x = 0; x < W; x++) {
    const ter = T[y * W + x];
    if (!['forest', 'mountain', 'rubble'].includes(ter) || built.has(x + ',' + y)) continue;
    const v = variantOf(x, y);
    out.push(`<div class="iso-s iso-${ter}" style="${placeStyle(f, x, y, LAYER.scenery)}">${isoUse(`s-${ter}-${v}-${season}`, () => sceneryIso(ter, v, season))}</div>`);
  }
  sceneryCache = { key, html: out.join('') };
  return sceneryCache.html;
}

// ───────── Muraille, tours, porte, bannières, engins posés, dégâts (mis en cache) ─────────
let wallCache = { key: '', html: '' };
export function wallLayer(state, f, { night = false, raid = null, titleRank = 0 } = {}) {
  const r = rectOf(state), g = gateOf(state, r);
  const wl = fortLevel(state, 'wall');
  const style = wallStyle(wl);
  const S = WALL[style.key] || WALL.stone;
  const dmg = state.castle?.wallDmg || 0;
  const posted = state.siege?.posted || {};
  const h = heraldryOf(state);
  const c1 = colorOf(state, h.t1), c2 = colorOf(state, h.t2);
  const key = JSON.stringify([r, wl, Math.round(dmg * 10), posted, c1, c2, night, !!raid, raid?.flank, titleRank, encStage(state)]);
  if (wallCache.key === key) return wallCache.html;
  const out = [];
  const H = S.h;
  const low = style.key === 'stakes';
  const cracked = (i) => dmg > 0 && ((i * 37) % 10) / 10 < dmg * 0.9;
  // Un morceau de mur : boîte fine sur le bord de la case, créneaux au-dessus (sauf palissade et enceinte projetée)
  const piece = (x, y, u0, v0, u1, v1, layer, depthX, depthY, i, extra = '') => {
    const art = low ? box(u0, v0, u1, v1, H, S.wall, S.top) : box(u0, v0, u1, v1, H, S.wall, S.top) + battlement(u0, v0, u1, v1, H, S);
    const crack = cracked(i) ? `<path d="M${f1(P((u0 + u1) / 2, v1, H * 0.7)[0])} ${f1(P((u0 + u1) / 2, v1, H * 0.7)[1])}l6 8l-5 7l8 9" stroke="#1d1812" stroke-width="2.4" fill="none"/>` : '';
    const style0 = placeStyle(f, x, y, layer).replace(/z-index:\d+/, `z-index:${depth(depthX, depthY, layer)}`);
    out.push(`<div class="iso-w" style="${style0}"><svg class="iso-art" viewBox="0 0 ${SPRITE.w} ${SPRITE.h}" width="${SPRITE.w}" height="${SPRITE.h}" overflow="visible" aria-hidden="true">${art}${crack}${extra}</svg></div>`);
  };
  let i = 0;
  const T = 0.12;
  // Nord (bord haut-droit à l'écran) et ouest (haut-gauche) : derrière la ville
  for (let x = r.x0; x <= r.x1; x++) piece(x, r.y0, 0, -T, 1, T, LAYER.wallBack, x, r.y0 - 0.5, i++);
  for (let y = r.y0; y <= r.y1; y++) piece(r.x0, y, -T, 0, T, 1, LAYER.wallBack, r.x0 - 0.5, y, i++, enginesOn('left', posted, y === Math.floor((r.y0 + r.y1) / 2), -0.05, 0.5, H));
  // Sud (bas-gauche, la porte) et est (bas-droit) : devant la ville
  for (let x = r.x0; x <= r.x1; x++) {
    if (x === g.x) { gatehouse(out, f, x, r.y1, H, S, low, raid, c1); continue; }
    piece(x, r.y1, 0, 1 - T, 1, 1 + T, LAYER.wallFront, x, r.y1 + 0.5, i++, enginesOn('front', posted, x === g.x - 1 || (g.x === r.x0 && x === r.x0 + 1), 0.5, 1.05, H));
  }
  for (let y = r.y0; y <= r.y1; y++) piece(r.x1, y, 1 - T, 0, 1 + T, 1, LAYER.wallFront, r.x1 + 0.5, y, i++, enginesOn('right', posted, y === Math.floor((r.y0 + r.y1) / 2), 1.05, 0.5, H));
  // Tours : aux coins, puis tous les 3 segments (palissade : tours de bois ; enceinte projetée : piquets)
  if (!low) {
    const towers = [[r.x0, r.y0], [r.x1 + 1, r.y0], [r.x0, r.y1 + 1], [r.x1 + 1, r.y1 + 1]];
    for (let x = r.x0 + 3; x <= r.x1 - 1; x += 3) towers.push([x, r.y0], [x, r.y1 + 1]);
    for (let y = r.y0 + 3; y <= r.y1 - 1; y += 3) towers.push([r.x0, y], [r.x1 + 1, y]);
    const roofGold = titleRank >= 5;
    for (const [cx, cy] of towers) {
      if (cy === r.y1 + 1 && Math.abs(cx - (g.x + 0.5)) < 1.2) continue; // la porte a ses propres tours
      const tx = Math.min(cx, state.city.w - 1), ty = Math.min(cy, state.city.h - 1);
      const lu = cx - tx, lv = cy - ty;
      const front = cy > r.y1 || cx > r.x1;
      const art = tower(lu, lv, 0.2, H + 18, S.tower, roofGold ? '#c99a2e' : S.roof, 22) + flag(lu, lv, H + 40, 22, ((cx + cy) % 2) ? c1 : c2)
        + (night ? (() => { const [x, y] = P(lu, lv, H + 10); return `<circle class="iso-torch" cx="${f1(x + 10)}" cy="${f1(y)}" r="9" fill="rgba(255,170,60,.35)"/><circle cx="${f1(x + 10)}" cy="${f1(y)}" r="3" fill="#ffcf6a"/>`; })() : '');
      out.push(`<div class="iso-w iso-tower" style="${placeStyle(f, tx, ty, front ? LAYER.wallFront : LAYER.wallBack).replace(/z-index:\d+/, `z-index:${depth(cx - 0.4, cy - 0.4, front ? LAYER.wallFront + 1 : LAYER.wallBack)}`)}"><svg class="iso-art" viewBox="0 0 ${SPRITE.w} ${SPRITE.h}" width="${SPRITE.w}" height="${SPRITE.h}" overflow="visible" aria-hidden="true">${art}</svg></div>`);
    }
  }
  wallCache = { key, html: out.join('') };
  return wallCache.html;
}
// Créneaux continus au sommet d'un morceau de mur
function battlement(u0, v0, u1, v1, H, S) {
  let s = '';
  const along = u1 - u0 > v1 - v0;
  for (let k = 0; k < 4; k++) {
    if (along) { const a = u0 + k * 0.25 + 0.03; s += box(a, v0, a + 0.13, v1, 7, S.wall, S.top, H); } else { const a = v0 + k * 0.25 + 0.03; s += box(u0, a, u1, a + 0.13, 7, S.wall, S.top, H); }
  }
  return s;
}
// Engins de défense (v19) posés sur un flanc : petites icônes sur le chemin de ronde, au milieu du flanc
function enginesOn(flank, posted, here, u, v, H) {
  if (!here) return '';
  const list = Object.entries(posted[flank] || {}).filter(([, n]) => n > 0).slice(0, 3);
  if (!list.length) return '';
  const [x, y] = P(u, v, H + 18);
  return list.map(([k, n], i) => `<g transform="translate(${f1(x - 26 + i * 26)} ${f1(y)})"><rect x="-12" y="-11" width="24" height="20" rx="5" fill="rgba(24,18,12,.88)" stroke="#e6cf9a"/><text x="0" y="3" font-size="12" text-anchor="middle">${DEFENSE_ENGINES[k]?.icon || '•'}</text><text x="10" y="13" font-size="9" fill="#fff6dc" text-anchor="middle" font-weight="700">${n}</text></g>`).join('');
}
// Porte : deux tours, arche, herse levée (baissée pendant un raid)
function gatehouse(out, f, x, y, H, S, low, raid, banner) {
  const art = low
    ? box(0, 0.88, 0.25, 1.12, H, S.wall, S.top) + box(0.75, 0.88, 1, 1.12, H, S.wall, S.top)
    : box(0.05, 0.86, 0.95, 1.14, H + 8, S.wall, S.top) + (() => {
      const a = P(0.35, 1.14, 0), b = P(0.65, 1.14, 0), c = P(0.65, 1.14, H * 0.7), d = P(0.35, 1.14, H * 0.7);
      return `<polygon points="${f1(a[0])},${f1(a[1])} ${f1(b[0])},${f1(b[1])} ${f1(c[0])},${f1(c[1])} ${f1(d[0])},${f1(d[1])}" fill="#2b1d12" stroke="#1d1812"/>${raid ? `<path d="M${f1(a[0])} ${f1(a[1] - 6)}L${f1(b[0])} ${f1(b[1] - 6)}M${f1(a[0])} ${f1(a[1] - 16)}L${f1(b[0])} ${f1(b[1] - 16)}M${f1((a[0] + b[0]) / 2)} ${f1((a[1] + b[1]) / 2)}V${f1((c[1] + d[1]) / 2)}" stroke="#5b6068" stroke-width="2.2"/>` : ''}`;
    })() + tower(0.08, 1.0, 0.16, H + 24, S.tower, S.roof, 24) + tower(0.92, 1.0, 0.16, H + 24, S.tower, S.roof, 24) + flag(0.5, 1.0, H + 12, 22, banner);
  out.push(`<div class="iso-w iso-gate" style="${placeStyle(f, x, y, LAYER.wallFront).replace(/z-index:\d+/, `z-index:${depth(x, y + 0.6, LAYER.wallFront)}`)}"><svg class="iso-art" viewBox="0 0 ${SPRITE.w} ${SPRITE.h}" width="${SPRITE.w}" height="${SPRITE.h}" overflow="visible" aria-hidden="true">${art}</svg></div>`);
}

// Colonne ennemie d'un raid qui approche : devant le flanc visé (s'il est connu), sinon devant la porte
export function raidColumnHtml(state, f, raid, engines = '') {
  const r = rectOf(state), g = gateOf(state, r);
  const fl = raid.flankSeen ? raid.mainFlank || raid.flank : 'front';
  const at = fl === 'left' ? { x: Math.max(0, r.x0 - 3), y: Math.floor((r.y0 + r.y1) / 2) } : fl === 'right' ? { x: Math.min(state.city.w - 1, r.x1 + 3), y: Math.floor((r.y0 + r.y1) / 2) } : { x: g.x, y: Math.min(state.city.h - 1, r.y1 + 3) };
  let men = '';
  for (let i = 0; i < 7; i++) { const [x, y] = P(0.15 + (i % 4) * 0.22, 0.25 + Math.floor(i / 4) * 0.35); men += `<g class="foe"><circle cx="${f1(x)}" cy="${f1(y - 14)}" r="3.6" fill="#d9b48f" stroke="#1d1812"/><path d="M${f1(x - 4)} ${f1(y - 10)}h8v10h-8Z" fill="#7d1d16" stroke="#1d1812"/></g>`; }
  const [bx, by] = P(0.5, 0.5);
  const art = `${men}<path d="M${f1(bx)} ${f1(by - 10)}v-40" stroke="#1d1812" stroke-width="2"/><path d="M${f1(bx)} ${f1(by - 50)}h22l-6 7l6 7h-22Z" fill="#7d1d16" stroke="#1d1812"/>${engines}`;
  return `<div class="iso-w iso-raid" style="${placeStyle(f, at.x, at.y, LAYER.building)}" title="Raid : ${raid.name}"><svg class="iso-art" viewBox="0 0 ${SPRITE.w} ${SPRITE.h}" width="${SPRITE.w}" height="${SPRITE.h}" overflow="visible" aria-hidden="true">${art}</svg></div>`;
}

// Cadrage : boîte à l'écran de l'enceinte et de ses douves (pour la caméra par défaut)
export function keepBox(state, f) {
  const r = rectOf(state);
  const pts = [toScreen(f, r.x0 - 1, r.y0 - 1), toScreen(f, r.x1 + 2, r.y0 - 1), toScreen(f, r.x1 + 2, r.y1 + 2), toScreen(f, r.x0 - 1, r.y1 + 2)];
  const xs = pts.map((p) => p.sx), ys = pts.map((p) => p.sy);
  return { left: Math.min(...xs), right: Math.max(...xs), top: Math.min(...ys) - 120, bottom: Math.max(...ys) };
}
export { tileCenter, shade };
