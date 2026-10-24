// v20 « Ma forteresse » — Scène isométrique du royaume : placement des dessins (projection, profondeur), décor de la
// campagne et muraille mis en cache, positions et silhouettes cliquables des bâtiments. La logique (systems/iso.js)
// reste pure ; ce module produit du HTML et ne modifie jamais l'état.
import { isoFrame, toScreen, depth, LAYER, diamond, tileCenter } from '../systems/iso.js';
import { rectOf, gateOf } from '../systems/castle.js';
import { SPRITE, P } from './isoArt.js';

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

// v23 : le décor et la muraille HTML de la v20 (sceneryLayer, wallLayer) ont été retirés : la scène peinte
// (paint/scene.js) les dessine, avec son propre ordre de profondeur.

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
export { tileCenter };
