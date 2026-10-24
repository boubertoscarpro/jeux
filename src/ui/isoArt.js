// v20 « Ma forteresse » — Petits dessins isométriques en SVG encore utilisés hors de la scène : miniatures des trophées
// (panneau Construire), portrait du conseiller, et les primitives qu'ils emploient. v23 : les bâtiments, le décor et la
// muraille SVG de la v20 ont été retirés ; la scène peinte (paint/) les dessine.
// Repère local d'une case : u, v ∈ [0, 1] (u vers l'est, v vers le sud), z en px vers le haut.

export const SPRITE = { w: 128, h: 200 }; // la case occupe le bas du dessin : losange de 128 × 64 dont le bas touche h
const BASE = SPRITE.h - 64; // y du sommet haut du losange dans le dessin
const f1 = (n) => Math.round(n * 10) / 10;
// Projection locale
export const P = (u, v, z = 0) => [64 + (u - v) * 64, BASE + (u + v) * 32 - z];
const pts = (...ps) => ps.map((p) => `${f1(p[0])},${f1(p[1])}`).join(' ');
const poly = (fill, ...ps) => `<polygon points="${pts(...ps)}" fill="${fill}" stroke="#1d1812" stroke-width="1.1" stroke-linejoin="round"/>`;
const polyN = (fill, ...ps) => `<polygon points="${pts(...ps)}" fill="${fill}"/>`;

// Teintes : éclaircir / assombrir une couleur #rrggbb
export function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.max(0, Math.min(255, Math.round(k >= 0 ? v + (255 - v) * k : v * (1 + k)))));
  return '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('');
}
const C = {
  plaster: '#ece0c4', timber: '#7a4e2c', stone: '#bdb5a6', stoneD: '#8f887c', wood: '#9a6a3c', woodD: '#6b4524', thatch: '#d2ab52',
  ink: '#1d1812', window: '#2c2a33', glow: '#f6d27a', gold: '#e2b84a', water: '#4f8fc0', leaf: '#4e8a3a', leafD: '#3a6a2b', field: '#e2c15a', fieldD: '#b8952f',
  grass: '#8fbf5a', rock: '#9c958a', rockD: '#6f695f', snow: '#f4f6f8', cloth: '#d9cfa8', red: '#b8432f', iron: '#5b6068',
};

// ───────── Primitives ─────────
// Boîte : faces visibles (ouest-sud = gauche, est-sud = droite, dessus)
export function box(u0, v0, u1, v1, h, wall = C.plaster, top = null, z0 = 0) {
  const L = poly(shade(wall, 0.08), P(u0, v1, z0), P(u1, v1, z0), P(u1, v1, z0 + h), P(u0, v1, z0 + h));
  const R = poly(shade(wall, -0.18), P(u1, v0, z0), P(u1, v1, z0), P(u1, v1, z0 + h), P(u1, v0, z0 + h));
  const T = top ? poly(top, P(u0, v0, z0 + h), P(u1, v0, z0 + h), P(u1, v1, z0 + h), P(u0, v1, z0 + h)) : '';
  return L + R + T;
}
// Tour ronde (cylindre) et toit conique
export function tower(cu, cv, r, h, wall = C.stone, roof = '#2f9c94', rh = 26, z0 = 0) {
  const [cx, cy] = P(cu, cv, z0);
  const rx = r * 90.5, ry = r * 45.25;
  const body = `<path d="M${f1(cx - rx)} ${f1(cy - h)}V${f1(cy)}A${f1(rx)} ${f1(ry)} 0 0 0 ${f1(cx + rx)} ${f1(cy)}V${f1(cy - h)}Z" fill="${wall}" stroke="${C.ink}" stroke-width="1.1"/>
    <path d="M${f1(cx + rx * 0.2)} ${f1(cy - h)}V${f1(cy + ry * 0.98)}A${f1(rx)} ${f1(ry)} 0 0 0 ${f1(cx + rx)} ${f1(cy)}V${f1(cy - h)}Z" fill="${shade(wall, -0.2)}"/>
    <ellipse cx="${f1(cx)}" cy="${f1(cy - h)}" rx="${f1(rx)}" ry="${f1(ry)}" fill="${shade(wall, 0.1)}" stroke="${C.ink}" stroke-width="1.1"/>`;
  const cone = roof ? `<path d="M${f1(cx - rx * 1.12)} ${f1(cy - h)}L${f1(cx)} ${f1(cy - h - rh)}L${f1(cx + rx * 1.12)} ${f1(cy - h)}A${f1(rx * 1.12)} ${f1(ry * 1.12)} 0 0 1 ${f1(cx - rx * 1.12)} ${f1(cy - h)}Z" fill="${roof}" stroke="${C.ink}" stroke-width="1.1"/>
    <path d="M${f1(cx)} ${f1(cy - h - rh)}L${f1(cx + rx * 1.12)} ${f1(cy - h)}A${f1(rx * 1.12)} ${f1(ry * 1.12)} 0 0 1 ${f1(cx + rx * 0.2)} ${f1(cy - h + ry * 1.1)}Z" fill="${shade(roof, -0.25)}"/>` : '';
  return body + cone;
}
// Drapeau (couleur de la bannière : variable CSS --banner, sinon or)
export function flag(u, v, z, h = 26, col = 'var(--banner, #e2b84a)') {
  const [x, y] = P(u, v, z);
  return `<path d="M${f1(x)} ${f1(y)}V${f1(y - h)}" stroke="${C.ink}" stroke-width="1.6"/><path class="anim-flag iso-flag" d="M${f1(x)} ${f1(y - h)}h15l-4 5 4 5h-15Z" fill="${col}" stroke="${C.ink}" stroke-width=".9"/>`;
}
const shadow = (u0 = 0.08, v0 = 0.08, u1 = 0.92, v1 = 0.92) => polyN('rgba(0,0,0,.18)', P(u0 + 0.05, v0 + 0.08), P(u1 + 0.08, v0 + 0.08), P(u1 + 0.08, v1 + 0.1), P(u0 + 0.05, v1 + 0.1));
// Trophée (statue, obélisque, bannière, arc, colonne) : miniature du panneau Construire
export function trophyIso(shape, color = C.gold) {
  const base = shadow(0.2, 0.2, 0.8, 0.8) + box(0.26, 0.26, 0.74, 0.74, 12, '#cfc6b2', '#e6dfcd');
  if (shape === 'obelisk') { const a = P(0.5, 0.5, 92); return base + box(0.4, 0.4, 0.6, 0.6, 70, '#e7e0cc', null, 12) + `<polygon points="${pts(P(0.4, 0.6, 82), P(0.6, 0.6, 82), P(0.6, 0.4, 82), a)}" fill="${color}" stroke="#1d1812" stroke-width="1"/>`; }
  if (shape === 'banner') return base + flag(0.5, 0.5, 12, 56, color) + flag(0.32, 0.68, 12, 44, shade(color, -0.2));
  if (shape === 'arch') return base + box(0.22, 0.4, 0.38, 0.6, 52, '#e7e0cc', null, 0) + box(0.62, 0.4, 0.78, 0.6, 52, '#e7e0cc', null, 0) + box(0.22, 0.4, 0.78, 0.6, 14, color, shade(color, 0.2), 52);
  if (shape === 'column') return base + tower(0.5, 0.5, 0.1, 70, '#e7e0cc', color, 14, 12);
  // statue
  const [x, y] = P(0.5, 0.5, 12);
  return base + `<path d="M${f1(x - 9)} ${f1(y)}v-28q9 -10 18 0v28Z" fill="${color}" stroke="#1d1812" stroke-width="1"/><circle cx="${f1(x)}" cy="${f1(y - 38)}" r="7" fill="${color}" stroke="#1d1812" stroke-width="1"/><path d="M${f1(x + 9)} ${f1(y - 22)}l10 -18" stroke="#1d1812" stroke-width="2.6"/>`;
}
// Dessin autonome (sans <use>), pour le mode photo ou un usage hors page
export const isoInline = (inner, w = SPRITE.w, h = SPRITE.h) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">${inner}</svg>`;

// v20 : portrait illustré du conseiller (vieux mage au chapeau pointu, bras levé quand il a quelque chose à dire)
export const advisorSvg = (size = 40) => `<svg viewBox="0 0 48 48" width="${size}" height="${size}" aria-hidden="true" class="adv-svg">
  <circle cx="24" cy="24" r="23" fill="#2c3a55" stroke="#c9a36a" stroke-width="2"/>
  <path d="M10 46c1-10 6-15 14-15s13 5 14 15Z" fill="#4b5fa0" stroke="#1d1812" stroke-width="1.2"/>
  <path d="M19 31l5 12 5-12" fill="#e9e2cf" stroke="#1d1812" stroke-width="1"/>
  <circle cx="24" cy="24" r="7.5" fill="#f1cfa6" stroke="#1d1812" stroke-width="1.2"/>
  <path d="M17 26c2 7 5 10 7 11 2-1 5-4 7-11-3 2-11 2-14 0Z" fill="#eeeae0" stroke="#1d1812" stroke-width="1"/>
  <circle cx="21.5" cy="23" r="1.1" fill="#1d1812"/><circle cx="26.5" cy="23" r="1.1" fill="#1d1812"/>
  <path d="M13 19c4-2 18-2 22 0l-2 2H15Z" fill="#3b4f8f" stroke="#1d1812" stroke-width="1.2"/>
  <path d="M16 19L24 3l9 16Z" fill="#4b5fa0" stroke="#1d1812" stroke-width="1.2"/><circle cx="25" cy="11" r="1.4" fill="#ffd86b"/>
  <g class="adv-arm"><path d="M36 38c3-4 4-9 3-14" stroke="#4b5fa0" stroke-width="4.5" stroke-linecap="round" fill="none"/><circle cx="39" cy="23" r="2.6" fill="#f1cfa6" stroke="#1d1812" stroke-width="1"/></g>
</svg>`;
