// v20 « Ma forteresse » — Projection isométrique de la carte du royaume (module pur, sans DOM).
// La logique du jeu reste sur la grille orthogonale (x, y) ; seul l'affichage est projeté : losange 2:1.
//   sx = (x − y) · TW/2 + ox        sy = (x + y) · TH/2 + oy
// Le point (x, y) de la grille est le sommet haut de la case (x, y) ; son centre est (x + ½, y + ½).
// La projection inverse sert aux clics, au survol, au clavier et au glisser-déposer sur les cases vides.

// top/bottom : marges en hauteurs de case (bâtiments hauts, douves) ; side : marge à gauche et à droite, en largeurs
// de case (v24 : la lisière du domaine se dessine autour du losange au lieu d'être coupée par le bord du canvas)
export const ISO = { tw: 128, th: 64, top: 3, bottom: 2, side: 1.5 };

// Géométrie de la scène pour une grille w × h : origine et taille du monde projeté (en px au zoom 1)
export function isoFrame(w, h, tw = ISO.tw, th = ISO.th) {
  const mx = ISO.side * tw;
  const ox = h * (tw / 2) + mx;
  const oy = ISO.top * th;
  return { tw, th, ox, oy, mx, width: (w + h) * (tw / 2) + 2 * mx, height: (w + h) * (th / 2) + oy + ISO.bottom * th };
}
export function toScreen(f, x, y) {
  return { sx: (x - y) * (f.tw / 2) + f.ox, sy: (x + y) * (f.th / 2) + f.oy };
}
export const tileCenter = (f, x, y) => toScreen(f, x + 0.5, y + 0.5);
// Projection inverse (coordonnées continues de la grille)
export function fromScreen(f, sx, sy) {
  const u = (sx - f.ox) / (f.tw / 2), v = (sy - f.oy) / (f.th / 2);
  return { x: (u + v) / 2, y: (v - u) / 2 };
}
// Case sous un point de l'écran (ou null hors de la grille)
export function tileAt(f, sx, sy, w, h) {
  const p = fromScreen(f, sx, sy);
  const x = Math.floor(p.x), y = Math.floor(p.y);
  return x >= 0 && y >= 0 && x < w && y < h ? { x, y } : null;
}
// Sommets du losange d'une case (haut, droite, bas, gauche)
export function diamond(f, x, y) {
  return [toScreen(f, x, y), toScreen(f, x + 1, y), toScreen(f, x + 1, y + 1), toScreen(f, x, y + 1)];
}
// Profondeur d'affichage : plus une case est « en bas » de l'écran, plus elle est devant. Les couches d'une même case
// (sol, décor, bâtiment, signal) s'ordonnent par un petit décalage ; la muraille d'un bord se glisse entre deux rangées.
export const LAYER = { ground: 0, scenery: 2, wallBack: 3, building: 5, wallFront: 7, fx: 8 };
export const depth = (x, y, layer = LAYER.building) => Math.round((x + y) * 10) + layer + 10;
// Matrice CSS qui projette un canvas orthogonal (res px par case) sur le losange : (px, py) → (sx, sy)
export function groundMatrix(f, res) {
  const a = f.tw / 2 / res, b = f.th / 2 / res;
  return [a, b, -a, b, f.ox, f.oy];
}
// Directions des flèches du clavier à l'écran, exprimées dans la grille (haut de l'écran = nord-ouest de la grille)
export const ISO_DIRS = {
  ArrowUp: [-1, -1], ArrowDown: [1, 1], ArrowLeft: [-1, 1], ArrowRight: [1, -1],
};
// Case voisine à l'écran (Maj + flèche : une case, en alternant les deux axes pour suivre la direction de l'écran)
export function isoStep(x, y, key, w, h, alt = 0) {
  const d = ISO_DIRS[key];
  if (!d) return null;
  // Une flèche de l'écran correspond à une diagonale de la grille : on avance d'un axe à la fois (alt alterne)
  const nx = alt % 2 === 0 ? x + d[0] : x, ny = alt % 2 === 0 ? y : y + d[1];
  const px = Math.max(0, Math.min(w - 1, nx)), py = Math.max(0, Math.min(h - 1, ny));
  return { x: px, y: py };
}
// Boîte englobante à l'écran d'un rectangle de cases (cadrage de la caméra)
export function rectBox(f, r) {
  const pts = [toScreen(f, r.x0, r.y0), toScreen(f, r.x1 + 1, r.y0), toScreen(f, r.x1 + 1, r.y1 + 1), toScreen(f, r.x0, r.y1 + 1)];
  const xs = pts.map((p) => p.sx), ys = pts.map((p) => p.sy);
  return { left: Math.min(...xs), right: Math.max(...xs), top: Math.min(...ys), bottom: Math.max(...ys) };
}
// Tri de profondeur d'une liste d'éléments { x, y, layer } (pour les dessins qui ne passent pas par le z-index)
export const depthSort = (items) => items.slice().sort((a, b) => depth(a.x, a.y, a.layer ?? LAYER.building) - depth(b.x, b.y, b.layer ?? LAYER.building) || a.x - b.x);
