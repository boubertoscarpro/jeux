// v20 « Ma forteresse » — Dessins isométriques procéduraux (SVG, aucune image externe).
// Chaque bâtiment est construit à partir de volumes simples (boîtes, toits à deux pans ou en pavillon, tours rondes,
// cônes), vus de trois quarts sur une case en losange de 128 × 64 px. Les toits sont colorés par famille (militaire,
// économie, savoir, lieux, cœur du château) ; la silhouette dit le type, la taille dit le niveau. Les dessins sont des
// <symbol> créés à la demande et réutilisés par <use> : le DOM reste léger même avec une ville pleine.
// Repère local d'une case : u, v ∈ [0, 1] (u vers l'est, v vers le sud), z en px vers le haut.
import { FAMILY_OF, FAMILIES, COUNTRY_ONLY } from '../data/castle.js';

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
// Colombages sur les deux faces visibles d'une boîte
function beams(u0, v0, u1, v1, h, z0 = 0) {
  const c = C.timber, out = [];
  const lineL = (a, b) => `<polyline points="${pts(a, b)}" stroke="${c}" stroke-width="1.6" fill="none"/>`;
  out.push(lineL(P(u0, v1, z0 + h * 0.5), P(u1, v1, z0 + h * 0.5)), lineL(P(u1, v0, z0 + h * 0.5), P(u1, v1, z0 + h * 0.5)));
  for (let k = 1; k < 3; k++) { const u = u0 + ((u1 - u0) * k) / 3; out.push(lineL(P(u, v1, z0), P(u, v1, z0 + h))); }
  for (let k = 1; k < 3; k++) { const v = v0 + ((v1 - v0) * k) / 3; out.push(lineL(P(u1, v, z0), P(u1, v, z0 + h))); }
  return out.join('');
}
// Fenêtres (face gauche : v = v1 ; face droite : u = u1)
function winL(u, v1, z, du = 0.09, dz = 9, lit = false) { return poly(lit ? C.glow : C.window, P(u, v1, z), P(u + du, v1, z), P(u + du, v1, z + dz), P(u, v1, z + dz)); }
function winR(u1, v, z, dv = 0.09, dz = 9, lit = false) { return poly(lit ? C.glow : C.window, P(u1, v, z), P(u1, v + dv, z), P(u1, v + dv, z + dz), P(u1, v, z + dz)); }
function doorL(u, v1, w = 0.14, h = 16, col = C.woodD) { return poly(col, P(u, v1, 0), P(u + w, v1, 0), P(u + w, v1, h), P(u, v1, h)); }
function windowsRow(u0, v0, u1, v1, z, n = 2, lit = false) {
  let s = '';
  for (let i = 0; i < n; i++) s += winL(u0 + ((u1 - u0) * (i + 0.6)) / (n + 0.4), v1, z, 0.08, 8, lit);
  for (let i = 0; i < n; i++) s += winR(u1, v0 + ((v1 - v0) * (i + 0.6)) / (n + 0.4), z, 0.08, 8, lit);
  return s;
}
// Toit à deux pans, faîtage selon u (axis 'u') ou v
export function gable(u0, v0, u1, v1, h, rh, roof, axis = 'u', wall = C.plaster) {
  if (axis === 'u') {
    const vm = (v0 + v1) / 2;
    const R0 = P(u0, vm, h + rh), R1 = P(u1, vm, h + rh);
    return poly(shade(roof, -0.28), P(u0, v0, h), P(u1, v0, h), R1, R0) + poly(roof, R0, R1, P(u1, v1, h), P(u0, v1, h)) + poly(shade(wall, -0.22), P(u1, v0, h), P(u1, v1, h), R1)
      + `<polyline points="${pts(R0, R1)}" stroke="${shade(roof, -0.45)}" stroke-width="2" fill="none"/>`;
  }
  const um = (u0 + u1) / 2;
  const R0 = P(um, v0, h + rh), R1 = P(um, v1, h + rh);
  return poly(shade(roof, -0.3), P(u0, v0, h), P(u0, v1, h), R1, R0) + poly(shade(roof, -0.08), R0, R1, P(u1, v1, h), P(u1, v0, h)) + poly(shade(wall, 0.05), P(u0, v1, h), P(u1, v1, h), R1)
    + `<polyline points="${pts(R0, R1)}" stroke="${shade(roof, -0.45)}" stroke-width="2" fill="none"/>`;
}
// Toit en pavillon (quatre pans), sommet au centre
export function hip(u0, v0, u1, v1, h, rh, roof) {
  const A = P((u0 + u1) / 2, (v0 + v1) / 2, h + rh);
  return poly(shade(roof, -0.32), P(u0, v0, h), P(u1, v0, h), A) + poly(shade(roof, -0.25), P(u0, v0, h), P(u0, v1, h), A)
    + poly(roof, P(u0, v1, h), P(u1, v1, h), A) + poly(shade(roof, -0.12), P(u1, v0, h), P(u1, v1, h), A);
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
// Créneaux sur le bord d'une boîte (faces visibles)
function crenels(u0, v0, u1, v1, h, wall = C.stone) {
  let s = '';
  const n = 4;
  for (let i = 0; i < n; i++) { const a = u0 + ((u1 - u0) * i) / n, b = a + (u1 - u0) / (n * 1.8); s += box(a, v1 - 0.06, b, v1, 6, wall, shade(wall, 0.12), h); }
  for (let i = 0; i < n; i++) { const a = v0 + ((v1 - v0) * i) / n, b = a + (v1 - v0) / (n * 1.8); s += box(u1 - 0.06, a, u1, b, 6, wall, shade(wall, 0.12), h); }
  return s;
}
// Drapeau (couleur de la bannière : variable CSS --banner, sinon or)
export function flag(u, v, z, h = 26, col = 'var(--banner, #e2b84a)') {
  const [x, y] = P(u, v, z);
  return `<path d="M${f1(x)} ${f1(y)}V${f1(y - h)}" stroke="${C.ink}" stroke-width="1.6"/><path class="anim-flag" d="M${f1(x)} ${f1(y - h)}h15l-4 5 4 5h-15Z" fill="${col}" stroke="${C.ink}" stroke-width=".9"/>`;
}
let quiet = false; // bâtiment à l'arrêt : ni fumée ni ailes qui tournent
const smoke = (u, v, z, c = '#d6d1c7') => { if (quiet) return ''; const [x, y] = P(u, v, z); return `<g class="iso-smoke"><circle class="anim-smoke" cx="${f1(x)}" cy="${f1(y - 4)}" r="4" fill="${c}" opacity=".6"/><circle class="anim-smoke d2" cx="${f1(x + 3)}" cy="${f1(y - 10)}" r="5" fill="${c}" opacity=".45"/></g>`; };
const chimney = (u, v, z, h = 14, glow = false) => box(u, v, u + 0.07, v + 0.07, h, C.stoneD, C.stoneD, z) + (glow ? (() => { const [x, y] = P(u + 0.035, v + 0.035, z + h); return `<circle cx="${f1(x)}" cy="${f1(y)}" r="3" fill="#ff9a3c"/>`; })() : '') + smoke(u + 0.035, v + 0.035, z + h);
const shadow = (u0 = 0.08, v0 = 0.08, u1 = 0.92, v1 = 0.92) => polyN('rgba(0,0,0,.18)', P(u0 + 0.05, v0 + 0.08), P(u1 + 0.08, v0 + 0.08), P(u1 + 0.08, v1 + 0.1), P(u0 + 0.05, v1 + 0.1));
const ground = (fill, u0 = 0.04, v0 = 0.04, u1 = 0.96, v1 = 0.96) => polyN(fill, P(u0, v0), P(u1, v0), P(u1, v1), P(u0, v1));
const emblem = (u, v1, z, txt) => { const [x, y] = P(u, v1, z); return `<circle cx="${f1(x)}" cy="${f1(y)}" r="7.5" fill="#f3e6c4" stroke="${C.ink}" stroke-width="1"/><text x="${f1(x)}" y="${f1(y + 3.6)}" font-size="9.5" text-anchor="middle">${txt}</text>`; };
function crate(u, v, s = 0.1) { return box(u, v, u + s, v + s, 8, C.wood, shade(C.wood, 0.15)); }
function barrel(u, v) { const [x, y] = P(u, v); return `<rect x="${f1(x - 4)}" y="${f1(y - 11)}" width="8" height="11" rx="2.5" fill="${C.wood}" stroke="${C.ink}" stroke-width=".9"/><path d="M${f1(x - 4)} ${f1(y - 7)}h8M${f1(x - 4)} ${f1(y - 3)}h8" stroke="${C.woodD}"/>`; }
function treeAt(u, v, s = 1, col = C.leaf, conifer = false) {
  const [x, y] = P(u, v);
  if (conifer) return `<path d="M${f1(x)} ${f1(y - 34 * s)}L${f1(x + 10 * s)} ${f1(y - 8 * s)}H${f1(x - 10 * s)}Z" fill="${col}" stroke="${C.ink}" stroke-width=".9"/><path d="M${f1(x)} ${f1(y - 42 * s)}L${f1(x + 8 * s)} ${f1(y - 20 * s)}H${f1(x - 8 * s)}Z" fill="${shade(col, 0.1)}" stroke="${C.ink}" stroke-width=".9"/><rect x="${f1(x - 1.6 * s)}" y="${f1(y - 8 * s)}" width="${f1(3.2 * s)}" height="${f1(8 * s)}" fill="${C.woodD}"/>`;
  return `<rect x="${f1(x - 1.8 * s)}" y="${f1(y - 12 * s)}" width="${f1(3.6 * s)}" height="${f1(12 * s)}" fill="${C.woodD}"/><circle cx="${f1(x)}" cy="${f1(y - 19 * s)}" r="${f1(11 * s)}" fill="${col}" stroke="${C.ink}" stroke-width=".9"/><circle cx="${f1(x - 3 * s)}" cy="${f1(y - 22 * s)}" r="${f1(5 * s)}" fill="${shade(col, 0.15)}"/>`;
}

// ───────── Bâtiments ─────────
export const roofOf = (type, v = 0) => {
  const fam = FAMILY_OF[type] || (COUNTRY_ONLY.includes(type) ? null : 'places');
  const base = fam ? FAMILIES[fam].roof : C.thatch;
  return shade(base, [0, 0.08, -0.08, 0.14][v % 4]);
};
// Taille selon le palier de niveau (0 à 5) : emprise et hauteur grandissent
const fp = (tier) => { const m = 0.2 - tier * 0.022; return [m, m, 1 - m, 1 - m]; };
const hk = (tier) => 1 + tier * 0.12;

function house(t, v, roof) {
  const [u0, v0, u1, v1] = fp(t);
  const h = 26 * hk(t) + (v % 2) * 6;
  const two = t >= 3;
  return shadow(u0, v0, u1, v1) + box(u0, v0, u1, v1, h) + beams(u0, v0, u1, v1, h) + windowsRow(u0, v0, u1, v1, h * 0.55, two ? 2 : 1) + doorL(u0 + 0.12, v1)
    + gable(u0 - 0.03, v0 - 0.03, u1 + 0.03, v1 + 0.03, h, 22 + t * 2, roof, v % 2 ? 'u' : 'v') + (t >= 2 ? chimney(u0 + 0.12, v0 + 0.15, h + 8) : '');
}
function hall(t, v, roof, opts = {}) {
  const [u0, v0, u1, v1] = fp(Math.max(0, t - 1)).map((x, i) => (i < 2 ? x - 0.06 : x + 0.06));
  const h = (opts.h || 30) * hk(t);
  const wall = opts.wall || C.plaster;
  return shadow(u0, v0, u1, v1) + box(u0, v0, u1, v1, h, wall) + (opts.beams !== false && wall === C.plaster ? beams(u0, v0, u1, v1, h) : '') + windowsRow(u0, v0, u1, v1, h * 0.5, 2 + (t > 2 ? 1 : 0), opts.lit)
    + doorL((u0 + u1) / 2 - 0.07, v1, 0.14, 18) + (opts.roofKind === 'hip' ? hip(u0 - 0.03, v0 - 0.03, u1 + 0.03, v1 + 0.03, h, 30 + t * 3, roof) : gable(u0 - 0.03, v0 - 0.03, u1 + 0.03, v1 + 0.03, h, 26 + t * 3, roof, opts.axis || 'u', wall));
}
const ARCH = {
  townhall: (t, v) => {
    const roof = FAMILIES.core.roof;
    return shadow(0.02, 0.02, 0.98, 0.98) + box(0.08, 0.1, 0.92, 0.9, 38 + t * 3, C.stone, null) + windowsRow(0.08, 0.1, 0.92, 0.9, 20, 3, true) + doorL(0.42, 0.9, 0.16, 22)
      + hip(0.05, 0.07, 0.95, 0.93, 38 + t * 3, 34, roof) + tower(0.5, 0.45, 0.17, 62 + t * 6, C.stone, roof, 40) + (t >= 2 ? tower(0.18, 0.78, 0.1, 54, C.stone, roof, 28) + tower(0.82, 0.22, 0.1, 54, C.stone, roof, 28) : '')
      + flag(0.5, 0.45, 102 + t * 6 + 40, 30);
  },
  castle: (t) => {
    const roof = FAMILIES.core.roof;
    return shadow(0.02, 0.02, 0.98, 0.98) + box(0.16, 0.16, 0.84, 0.84, 52 + t * 4, C.stone) + crenels(0.16, 0.16, 0.84, 0.84, 52 + t * 4) + windowsRow(0.16, 0.16, 0.84, 0.84, 30, 2)
      + doorL(0.42, 0.84, 0.16, 20, '#3a2414') + tower(0.12, 0.88, 0.11, 66 + t * 4, C.stone, roof, 32) + tower(0.88, 0.12, 0.11, 66 + t * 4, C.stone, roof, 32) + tower(0.88, 0.88, 0.12, 72 + t * 4, C.stone, roof, 34) + flag(0.5, 0.5, 58 + t * 4, 28);
  },
  warehouse: (t, v) => hall(t, v, shade(C.wood, -0.1), { wall: C.wood, beams: false, h: 26, axis: 'v' }) + barrel(0.84, 0.96) + crate(0.02, 0.8),
  house: (t, v) => house(t, v, roofOf('house', v)),
  market: (t, v) => {
    const cols = ['#c0392b', '#e2b84a', '#2f7fb8', '#3f9b55'];
    let s = ground('rgba(160,140,100,.35)');
    const stall = (u, w, c) => box(u, w, u + 0.22, w + 0.22, 14, C.wood) + gable(u - 0.02, w - 0.02, u + 0.24, w + 0.24, 16, 10, c, 'u', C.cloth);
    s += stall(0.12, 0.12, cols[v % 4]) + stall(0.55, 0.15, cols[(v + 1) % 4]) + stall(0.15, 0.58, cols[(v + 2) % 4]) + (t >= 2 ? stall(0.58, 0.6, cols[(v + 3) % 4]) : crate(0.62, 0.66) + barrel(0.78, 0.82));
    return s;
  },
  tavern: (t, v) => hall(t, v, roofOf('tavern', v), { h: 28 }) + chimney(0.7, 0.25, 50 + t * 4) + emblem(0.32, 0.88, 22, '🍺'),
  library: (t, v) => hall(t, v, roofOf('library', v), { wall: C.stone, roofKind: 'hip', h: 32, lit: true }) + tower(0.78, 0.25, 0.1, 58 + t * 4, C.stone, roofOf('library', v), 30) + emblem(0.3, 0.88, 22, '📚'),
  laboratory: (t, v) => hall(t, v, roofOf('laboratory', v), { wall: C.stone, h: 28 }) + chimney(0.25, 0.25, 48, 22, true) + emblem(0.32, 0.88, 20, '⚗️'),
  observatory: (t, v) => shadow() + tower(0.5, 0.5, 0.28, 50 + t * 4, C.stone, null) + (() => { const [x, y] = P(0.5, 0.5, 50 + t * 4); return `<path d="M${f1(x - 25)} ${f1(y)}a25 22 0 0 1 50 0Z" fill="${roofOf('observatory', v)}" stroke="${C.ink}" stroke-width="1.1"/><path d="M${f1(x - 3)} ${f1(y - 20)}l22 -14" stroke="${C.iron}" stroke-width="5"/>`; })(),
  guildhall: (t, v) => hall(t, v, roofOf('guildhall', v), { h: 34, roofKind: 'hip' }) + flag(0.5, 0.5, 70 + t * 4, 24) + emblem(0.32, 0.9, 24, '🛡️'),
  bakery: (t, v) => house(t, v, roofOf('bakery', v)) + chimney(0.62, 0.3, 46, 16, true) + emblem(0.6, 0.82, 12, '🍞'),
  foundry: (t, v) => hall(t, v, shade('#5b5f68', 0.1), { wall: C.stone, h: 28 }) + chimney(0.68, 0.22, 52, 30, true) + emblem(0.3, 0.88, 18, '🔥'),
  forge: (t, v) => shadow() + box(0.2, 0.2, 0.8, 0.8, 26, C.stone) + gable(0.15, 0.15, 0.85, 0.85, 26, 18, roofOf('forge', v), 'v') + (() => { const [x, y] = P(0.35, 0.92); return `<rect class="iso-anvil" x="${f1(x - 8)}" y="${f1(y - 10)}" width="16" height="6" fill="${C.iron}" stroke="${C.ink}"/><rect x="${f1(x - 3)}" y="${f1(y - 4)}" width="6" height="4" fill="${C.iron}"/>`; })() + chimney(0.68, 0.3, 40, 14, true) + emblem(0.62, 0.82, 14, '⚒️'),
  armory: (t, v) => hall(t, v, roofOf('armory', v), { wall: C.stone, h: 30 }) + emblem(0.3, 0.88, 22, '🗡️') + flag(0.8, 0.8, 30, 20),
  quartermaster: (t, v) => hall(t, v, roofOf('quartermaster', v), { wall: C.wood, beams: false, h: 26 }) + crate(0.02, 0.84) + crate(0.86, 0.02) + emblem(0.3, 0.88, 18, '📦'),
  weaver: (t, v) => house(t, v, roofOf('weaver', v)) + (() => { const [a, b] = P(0.9, 0.2, 18), [c, d] = P(0.9, 0.85, 18); return `<path d="M${f1(a)} ${f1(b)}L${f1(c)} ${f1(d)}" stroke="${C.woodD}" stroke-width="1.5"/><rect x="${f1((a + c) / 2 - 6)}" y="${f1((b + d) / 2)}" width="12" height="10" fill="#c0392b"/>`; })(),
  carpentry: (t, v) => shadow() + box(0.25, 0.2, 0.8, 0.75, 22, C.wood) + gable(0.2, 0.15, 0.85, 0.8, 22, 16, roofOf('carpentry', v), 'u', C.wood) + box(0.06, 0.82, 0.5, 0.94, 6, '#c9a36a', '#d8b47a') + box(0.08, 0.84, 0.48, 0.92, 4, '#c9a36a', '#e0be86', 6),
  tannery: (t, v) => shadow() + box(0.3, 0.3, 0.75, 0.75, 20, C.wood) + gable(0.25, 0.25, 0.8, 0.8, 20, 14, roofOf('tannery', v), 'v', C.wood) + (() => { const [x, y] = P(0.15, 0.9); return `<path d="M${f1(x - 10)} ${f1(y)}V${f1(y - 22)}M${f1(x + 10)} ${f1(y)}V${f1(y - 22)}M${f1(x - 12)} ${f1(y - 20)}h24" stroke="${C.woodD}" stroke-width="2"/><rect x="${f1(x - 8)}" y="${f1(y - 19)}" width="16" height="12" fill="#a8743f" stroke="${C.ink}" stroke-width=".8"/>`; })(),
  mill: (t, v, o = {}) => {
    const roof = roofOf('mill', v);
    if (o.river) return shadow() + box(0.25, 0.2, 0.8, 0.75, 28, C.stone) + gable(0.2, 0.15, 0.85, 0.8, 28, 20, roof, 'u', C.stone) + (() => { const [x, y] = P(0.86, 0.47, 14); return `<g class="iso-wheel ${o.active ? 'spin' : ''}" style="transform-origin:${f1(x)}px ${f1(y)}px"><circle cx="${f1(x)}" cy="${f1(y)}" r="15" fill="none" stroke="${C.woodD}" stroke-width="3"/><path d="M${f1(x - 15)} ${f1(y)}h30M${f1(x)} ${f1(y - 15)}v30M${f1(x - 11)} ${f1(y - 11)}l22 22M${f1(x + 11)} ${f1(y - 11)}l-22 22" stroke="${C.woodD}" stroke-width="2.4"/></g>`; })();
    const [x, y] = P(0.5, 0.5, 62);
    return shadow() + tower(0.5, 0.5, 0.2, 46, C.plaster, roof, 22) + `<g class="iso-sails ${o.active ? 'spin' : ''}" style="transform-origin:${f1(x)}px ${f1(y)}px"><path d="M${f1(x)} ${f1(y)}l-4 -34h8Z M${f1(x)} ${f1(y)}l34 -4v8Z M${f1(x)} ${f1(y)}l4 34h-8Z M${f1(x)} ${f1(y)}l-34 4v-8Z" fill="${C.cloth}" stroke="${C.woodD}" stroke-width="1.2"/><circle cx="${f1(x)}" cy="${f1(y)}" r="3.5" fill="${C.woodD}"/></g>`;
  },
  barracks: (t, v) => hall(t, v, roofOf('barracks', v), { wall: C.stone, h: 26, axis: 'v' }) + flag(0.2, 0.2, 26 + 20, 26) + (() => { const [x, y] = P(0.9, 0.9); return `<path d="M${f1(x)} ${f1(y)}v-18M${f1(x - 7)} ${f1(y - 13)}h14" stroke="${C.woodD}" stroke-width="2.4"/><circle cx="${f1(x)}" cy="${f1(y - 21)}" r="4" fill="${C.cloth}" stroke="${C.ink}"/>`; })(),
  stable: (t, v) => shadow() + box(0.15, 0.25, 0.85, 0.7, 20, C.wood) + gable(0.1, 0.2, 0.9, 0.75, 20, 16, roofOf('stable', v), 'u', C.wood) + (() => { const a = P(0.1, 0.95), b = P(0.9, 0.95); return `<polyline points="${pts(a, b)}" stroke="${C.woodD}" stroke-width="2.5"/><polyline points="${pts([a[0], a[1] - 7], [b[0], b[1] - 7])}" stroke="${C.woodD}" stroke-width="2"/>`; })() + emblem(0.5, 0.7, 14, '🐎'),
  workshop: (t, v) => shadow() + box(0.25, 0.25, 0.8, 0.8, 24, C.wood) + gable(0.2, 0.2, 0.85, 0.85, 24, 16, roofOf('workshop', v), 'v', C.wood) + (() => { const [x, y] = P(0.12, 0.88); return `<path d="M${f1(x - 12)} ${f1(y)}l12 -36l12 36M${f1(x)} ${f1(y - 36)}l20 -8" stroke="${C.woodD}" stroke-width="3" fill="none"/><circle cx="${f1(x + 20)}" cy="${f1(y - 44)}" r="4" fill="${C.rock}"/>`; })(),
  watchtower: (t, v) => shadow(0.3, 0.3, 0.7, 0.7) + tower(0.5, 0.5, 0.14, 70 + t * 6, C.stone, roofOf('watchtower', v), 30) + flag(0.5, 0.5, 100 + t * 6, 22),
  embassy: (t, v) => shadow() + box(0.15, 0.2, 0.85, 0.8, 30, '#f2ead6') + (() => { let s = ''; for (let i = 0; i < 4; i++) { const u = 0.2 + i * 0.18; s += box(u, 0.8, u + 0.05, 0.86, 30, '#fbf6ea'); } return s; })() + hip(0.12, 0.17, 0.88, 0.88, 30, 22, roofOf('embassy', v)) + flag(0.5, 0.5, 52, 22),
  cartographer: (t, v) => house(t, v, roofOf('cartographer', v)) + emblem(0.5, 0.8, 16, '🧭'),
  herald: (t, v) => shadow() + box(0.15, 0.25, 0.85, 0.75, 10, C.wood, shade(C.wood, 0.2)) + flag(0.2, 0.3, 10, 34, '#c0392b') + flag(0.8, 0.3, 10, 34, '#2f7fb8') + emblem(0.5, 0.75, 6, '📯'),
  lists: (t, v) => ground('rgba(200,175,110,.55)') + (() => { const a = P(0.1, 0.5, 0), b = P(0.9, 0.5, 0); return `<polyline points="${pts(a, b)}" stroke="${C.woodD}" stroke-width="3"/>`; })() + gable(0.08, 0.06, 0.3, 0.28, 8, 18, '#c0392b', 'v', C.cloth) + gable(0.7, 0.7, 0.94, 0.94, 8, 18, '#2f7fb8', 'u', C.cloth) + flag(0.5, 0.5, 4, 26),
  scriptorium: (t, v) => hall(t, v, roofOf('scriptorium', v), { wall: C.stone, h: 26 }) + tower(0.75, 0.25, 0.08, 52, C.stone, roofOf('scriptorium', v), 26) + emblem(0.3, 0.88, 18, '📜'),
  sanctuary: (t, v) => shadow() + box(0.18, 0.18, 0.82, 0.82, 30, '#f2ead6') + (() => { const [x, y] = P(0.5, 0.5, 30); return `<path d="M${f1(x - 30)} ${f1(y)}a30 26 0 0 1 60 0Z" fill="${roofOf('sanctuary', v)}" stroke="${C.ink}" stroke-width="1.1"/><path d="M${f1(x)} ${f1(y - 26)}v-12M${f1(x - 5)} ${f1(y - 33)}h10" stroke="${C.gold}" stroke-width="2.4"/>`; })(),
  monument: (t, v, o = {}) => { const st = Math.max(1, Math.min(5, o.level || 1)); return shadow() + box(0.15, 0.15, 0.85, 0.85, 8, C.stoneD, C.stone) + box(0.32, 0.32, 0.68, 0.68, 14 + st * 14, '#ddd5c2', '#efe8d6', 8) + (st >= 4 ? (() => { const [x, y] = P(0.5, 0.5, 22 + st * 14); return `<path d="M${f1(x - 9)} ${f1(y)}L${f1(x)} ${f1(y - 22)}L${f1(x + 9)} ${f1(y)}Z" fill="var(--orient, ${C.gold})" stroke="${C.ink}" stroke-width="1"/>`; })() : ''); },
  // Campagne
  farm: (t, v, o = {}) => {
    const c1 = o.season === 'winter' ? '#e8eef2' : o.season === 'spring' ? '#8fbf5a' : C.field, c2 = o.season === 'winter' ? '#cdd6dc' : o.season === 'spring' ? '#6f9f45' : C.fieldD;
    let s = ground(c2, 0.02, 0.02, 0.98, 0.98);
    for (let i = 0; i < 6; i++) { const a = 0.05 + i * 0.155; s += polyN(c1, P(a, 0.05), P(a + 0.1, 0.05), P(a + 0.1, 0.95), P(a, 0.95)); }
    return s + (t >= 1 ? box(0.7, 0.05, 0.95, 0.3, 16, C.wood) + gable(0.68, 0.03, 0.97, 0.32, 16, 12, roofOf('farm', v), 'u', C.wood) : '');
  },
  pasture: (t, v) => ground('#9fcf6a', 0.02, 0.02, 0.98, 0.98) + (() => { const a = P(0.04, 0.96), b = P(0.96, 0.96), c = P(0.96, 0.04); return `<polyline points="${pts(a, b, c)}" fill="none" stroke="${C.woodD}" stroke-width="2"/>`; })() + [[0.3, 0.4], [0.55, 0.6], [0.7, 0.3]].map(([u, w]) => { const [x, y] = P(u, w); return `<ellipse cx="${f1(x)}" cy="${f1(y - 5)}" rx="7" ry="5" fill="#f4f1ea" stroke="${C.ink}" stroke-width=".8"/><circle cx="${f1(x + 6)}" cy="${f1(y - 7)}" r="2.6" fill="#3a3a3a"/>`; }).join(''),
  orchard: (t, v) => ground('#8fbf5a', 0.02, 0.02, 0.98, 0.98) + [[0.25, 0.25], [0.7, 0.25], [0.25, 0.7], [0.7, 0.7], [0.48, 0.48]].map(([u, w]) => treeAt(u, w, 0.85, '#5f9a3e')).join('') + [[0.25, 0.25], [0.7, 0.7]].map(([u, w]) => { const [x, y] = P(u, w); return `<circle cx="${f1(x - 4)}" cy="${f1(y - 18)}" r="2" fill="#d23a2a"/><circle cx="${f1(x + 3)}" cy="${f1(y - 22)}" r="2" fill="#d23a2a"/>`; }).join(''),
  sawmill: (t, v) => shadow() + box(0.3, 0.2, 0.85, 0.65, 22, C.wood) + gable(0.25, 0.15, 0.9, 0.7, 22, 14, roofOf('sawmill', v), 'u', C.wood) + box(0.05, 0.7, 0.55, 0.95, 8, '#b07a49', '#c9945c') + (() => { const [x, y] = P(0.18, 0.82, 8); return `<circle cx="${f1(x)}" cy="${f1(y)}" r="5" fill="#d8b47a" stroke="${C.woodD}"/><circle cx="${f1(x + 12)}" cy="${f1(y + 6)}" r="5" fill="#d8b47a" stroke="${C.woodD}"/>`; })(),
  quarry: (t, v) => ground('#a49c8e', 0.04, 0.04, 0.96, 0.96) + box(0.1, 0.1, 0.5, 0.4, 22, C.rock, shade(C.rock, 0.12)) + box(0.5, 0.15, 0.85, 0.45, 14, C.rock, shade(C.rock, 0.1)) + box(0.55, 0.62, 0.75, 0.82, 8, '#d8d1c2', '#ece6d8'),
  mine: (t, v) => shadow() + (() => { const [x, y] = P(0.5, 0.55); return `<path d="M${f1(x - 54)} ${f1(y + 4)}Q${f1(x - 10)} ${f1(y - 66)} ${f1(x + 50)} ${f1(y - 8)}L${f1(x + 54)} ${f1(y + 10)}Z" fill="${C.rock}" stroke="${C.ink}" stroke-width="1.1"/><path d="M${f1(x - 14)} ${f1(y + 4)}v-22h28v22" fill="#2a2018" stroke="${C.woodD}" stroke-width="3"/>`; })() + box(0.75, 0.8, 0.92, 0.95, 8, C.iron, '#7a7f88'),
  hunter: (t, v) => house(Math.min(t, 2), v, roofOf('hunter', v)) + (() => { const [x, y] = P(0.5, 0.82, 26); return `<path d="M${f1(x - 10)} ${f1(y)}l-4 -8M${f1(x - 10)} ${f1(y)}l-8 -4M${f1(x + 10)} ${f1(y)}l4 -8M${f1(x + 10)} ${f1(y)}l8 -4" stroke="#e8dcc0" stroke-width="2"/>`; })(),
  herbalist: (t, v) => ground('#7aa24a', 0.04, 0.5, 0.96, 0.96) + house(Math.min(t, 1), v, roofOf('herbalist', v)) + [[0.2, 0.85], [0.45, 0.88], [0.75, 0.85]].map(([u, w]) => { const [x, y] = P(u, w); return `<circle cx="${f1(x)}" cy="${f1(y - 4)}" r="5" fill="#5aa04a"/><circle cx="${f1(x + 2)}" cy="${f1(y - 7)}" r="2" fill="#c45ab0"/>`; }).join(''),
  charcoal: (t, v) => shadow() + (() => { const [x, y] = P(0.5, 0.55); return `<path d="M${f1(x - 40)} ${f1(y)}Q${f1(x)} ${f1(y - 50)} ${f1(x + 40)} ${f1(y)}Z" fill="#4a3f36" stroke="${C.ink}" stroke-width="1.1"/>`; })() + smoke(0.5, 0.55, 30, '#8f8a85'),
  fishery: (t, v) => shadow() + box(0.3, 0.3, 0.7, 0.7, 18, C.wood) + gable(0.25, 0.25, 0.75, 0.75, 18, 14, roofOf('fishery', v), 'v', C.wood) + box(0.72, 0.4, 1.0, 0.56, 3, C.woodD, shade(C.wood, 0.1)) + (() => { const [x, y] = P(0.2, 0.85); return `<path d="M${f1(x - 10)} ${f1(y)}h20" stroke="${C.woodD}" stroke-width="2"/><ellipse cx="${f1(x)}" cy="${f1(y - 6)}" rx="6" ry="3" fill="#8fb6cf"/>`; })(),
  port: (t, v) => box(0.1, 0.35, 1.0, 0.65, 4, C.woodD, C.wood) + (() => { const [x, y] = P(0.6, 0.85); return `<path d="M${f1(x - 22)} ${f1(y)}q22 14 44 0z" fill="${C.wood}" stroke="${C.ink}"/><path d="M${f1(x)} ${f1(y)}v-34" stroke="${C.woodD}" stroke-width="2"/><path d="M${f1(x)} ${f1(y - 32)}l18 12h-18Z" fill="${C.cloth}" stroke="${C.ink}" stroke-width=".8"/>`; })() + box(0.15, 0.1, 0.45, 0.35, 16, C.wood) + gable(0.12, 0.08, 0.48, 0.38, 16, 12, roofOf('port', v), 'u', C.wood),
};
// Bâtiments sans dessin propre : maison de famille ou halle selon la catégorie
const fallback = (type, t, v) => (COUNTRY_ONLY.includes(type) ? house(t, v, C.thatch) : hall(t, v, roofOf(type, v)));

// Symbole d'un bâtiment (contenu SVG du dessin entier)
export function buildingIsoSvg(type, tier = 0, variant = 0, opts = {}) {
  const fn = ARCH[type];
  quiet = opts.active === false;
  try { return fn ? fn(tier, variant, opts) : fallback(type, tier, variant); } finally { quiet = false; }
}
// Route : dalle pavée à plat
export const roadIso = () => polyN('#c8bda3', P(0.02, 0.02), P(0.98, 0.02), P(0.98, 0.98), P(0.02, 0.98)) + `<polyline points="${pts(P(0.02, 0.5), P(0.98, 0.5))}" stroke="rgba(90,70,40,.25)" stroke-width="1" stroke-dasharray="3 5" fill="none"/>`;
// Décoration (socle + icône) et trophée (statue, obélisque, bannière, arc) : la vitrine de la partie
export function decoIso(icon) {
  const [x, y] = P(0.5, 0.5, 14);
  return shadow(0.25, 0.25, 0.75, 0.75) + box(0.3, 0.3, 0.7, 0.7, 14, '#d8d1c2', '#ece6d8') + `<text x="${f1(x)}" y="${f1(y - 4)}" font-size="26" text-anchor="middle">${icon}</text>`;
}
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
// Terrain vague : panneau « à bâtir » avec l'icône du bâtiment
export function lotIso(icon) {
  const [x, y] = P(0.5, 0.55);
  return polyN('rgba(201,163,106,.35)', P(0.08, 0.08), P(0.92, 0.08), P(0.92, 0.92), P(0.08, 0.92)) + `<path d="M${f1(x)} ${f1(y)}V${f1(y - 34)}" stroke="#4a2f17" stroke-width="3"/><rect x="${f1(x - 20)}" y="${f1(y - 52)}" width="40" height="22" rx="2" fill="#c9a36a" stroke="#4a2f17" stroke-width="2"/><text x="${f1(x)}" y="${f1(y - 36)}" font-size="14" text-anchor="middle">${icon}</text>`;
}
// Échafaudage (chantier en cours) par-dessus le dessin
export const scaffoldIso = () => { const a = P(0.12, 0.88), b = P(0.88, 0.88), c = P(0.88, 0.12); return `<g class="iso-scaffold" stroke="#c9a36a" stroke-width="2.2" fill="none"><polyline points="${pts(a, [a[0], a[1] - 60], [b[0], b[1] - 60], b)}"/><polyline points="${pts([b[0], b[1] - 60], [c[0], c[1] - 60], c)}"/><polyline points="${pts([a[0], a[1] - 30], [b[0], b[1] - 30], [c[0], c[1] - 30])}"/></g>`; };

// ───────── Décor de la campagne ─────────
const FOLIAGE = { spring: '#4c8a36', summer: '#3f7a2e', autumn: '#c07a2c', winter: '#4d6b55' };
export function sceneryIso(ter, v = 0, season = 'summer') {
  const leaf = FOLIAGE[season] || FOLIAGE.summer;
  if (ter === 'forest') {
    const conifer = v % 3 === 0 || season === 'winter';
    const spots = [[0.3, 0.35], [0.68, 0.3], [0.45, 0.62], [0.78, 0.7], [0.22, 0.78]].slice(0, 3 + (v % 3));
    return spots.map(([u, w], i) => treeAt(u, w, 0.9 + ((v + i) % 3) * 0.12, i % 2 ? shade(leaf, 0.1) : leaf, conifer || i === 2)).join('');
  }
  if (ter === 'mountain') {
    const [x, y] = P(0.5, 0.55);
    const h = 70 + (v % 3) * 14;
    const snow = season === 'winter' || v % 2 === 0;
    return `<path d="M${f1(x - 60)} ${f1(y + 6)}L${f1(x - 6)} ${f1(y - h)}L${f1(x + 60)} ${f1(y + 6)}Z" fill="${C.rock}" stroke="${C.ink}" stroke-width="1.1"/><path d="M${f1(x - 6)} ${f1(y - h)}L${f1(x + 60)} ${f1(y + 6)}H${f1(x + 10)}Z" fill="${C.rockD}"/>${snow ? `<path d="M${f1(x - 6)} ${f1(y - h)}L${f1(x - 20)} ${f1(y - h + 24)}l8 -4 6 6 6 -6 8 4Z" fill="${C.snow}"/>` : ''}<path d="M${f1(x + 14)} ${f1(y + 6)}L${f1(x + 34)} ${f1(y - 30)}L${f1(x + 58)} ${f1(y + 6)}Z" fill="${shade(C.rock, -0.1)}" stroke="${C.ink}" stroke-width="1"/>`;
  }
  if (ter === 'rubble') return [[0.3, 0.4], [0.6, 0.55], [0.45, 0.75]].map(([u, w], i) => box(u - 0.08, w - 0.08, u + 0.08, w + 0.06, 6 + i * 3, '#a69c8a', '#c2b8a4')).join('') + (() => { const [x, y] = P(0.7, 0.3); return `<path d="M${f1(x - 6)} ${f1(y)}l4 -16l6 2l-2 14" fill="#8f8574" stroke="${C.ink}" stroke-width=".8"/>`; })();
  return '';
}

// ───────── Muraille, tours, porte (dessinées en coordonnées de grille, voir isoView) ─────────
export const WALL = {
  palisade: { h: 26, wall: '#8a5a33', top: '#a8743f', tower: '#7a4e2c', roof: '#5e3a1f' },
  stone: { h: 34, wall: '#a49d91', top: '#c7c0b2', tower: '#8f887c', roof: '#3a3a44' },
  towers: { h: 40, wall: '#9a958c', top: '#bfb9ad', tower: '#86807a', roof: '#33333d' },
  fortress: { h: 46, wall: '#8d877d', top: '#b3ad9f', tower: '#7a7268', roof: '#2a2a33' },
  stakes: { h: 8, wall: '#c9a36a', top: '#d8b47a', tower: '#c9a36a', roof: '#a8743f' },
};

// ───────── Symboles réutilisés (<symbol> créés à la demande) ─────────
const made = new Set();
export function ensureIsoDefs() {
  if (typeof document === 'undefined') return null;
  let host = document.getElementById('iso-defs');
  if (!host) {
    host = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    host.id = 'iso-defs'; host.setAttribute('aria-hidden', 'true'); host.setAttribute('width', '0'); host.setAttribute('height', '0');
    host.style.position = 'absolute';
    host.innerHTML = '<defs></defs>';
    document.body.appendChild(host);
    made.clear();
  }
  return host.firstElementChild;
}
// Référence <use> vers un symbole (créé s'il manque) ; key unique par dessin
export function isoUse(key, make, cls = 'iso-art', w = SPRITE.w, h = SPRITE.h) {
  const defs = ensureIsoDefs();
  const id = 'iso-' + key.replace(/[^a-zA-Z0-9_-]/g, '_');
  if (defs && !made.has(id)) {
    if (!document.getElementById(id)) {
      const sym = document.createElementNS('http://www.w3.org/2000/svg', 'symbol');
      sym.id = id; sym.setAttribute('viewBox', `0 0 ${w} ${h}`); sym.setAttribute('overflow', 'visible');
      sym.innerHTML = make();
      defs.appendChild(sym);
    }
    made.add(id);
  }
  return `<svg class="${cls}" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" aria-hidden="true" overflow="visible"><use href="#${id}"/></svg>`;
}
// Dessin autonome (sans <use>), pour le mode photo ou un usage hors page
export const isoInline = (inner, w = SPRITE.w, h = SPRITE.h) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">${inner}</svg>`;
