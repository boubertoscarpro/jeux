// v21 « Couleurs du Royaume » — Catalogue peint : chaque type de bâtiment, ses 6 paliers (0 à 5, voir sizeTier), le
// décor (arbres, montagnes, décombres), les routes, décorations, trophées, terrains vagues, échafaudages et la muraille.
// Chaque peintre reçoit un `pen` (paint.js) posé sur une case (u, v ∈ [0, 1]) et peint dans le repère de la case.
// Règle de croissance commune : palier 0–1 un niveau ; 2 un étage ; 3 une annexe ; 4 une tourelle ; 5 ornements dorés.
import {
  MAT, box, gable, tower, cone, banner, dropShadow, roundShadow, groundTile, water, figure, smoke, onFace,
  window_, door, poly, strokeInk, lit, rgba, mix, INK, rng,
} from './paint.js';
import { townhall as townhallSheet, farm as farmSheet, barracks as barracksSheet } from './buildings.js';

export const PAL = {
  stone: '#e2c896', stoneD: '#c9ad7e', stoneG: '#c4bfb2', plaster: '#f2e4c2', wood: '#5e3a20', plank: '#a0703e',
  red: '#c84a2e', orange: '#d0703a', brown: '#9a5a32', blue: '#3f74b0', slate: '#5a6b86', teal: '#2f9c94', violet: '#6a5aa8',
  green: '#4f8a3a', thatch: '#cfa64e', gold: '#e2b84a',
};
// Couleur de toit par famille (repérage ; toujours doublé d'une forme ou d'un signe distinctif)
export const ROOF_OF = {
  core: PAL.blue, military: PAL.red, economy: PAL.orange, knowledge: PAL.violet, places: PAL.teal, country: PAL.thatch,
};
const VARIANT_TINT = [0, 0.06, -0.06, 0.1];
export const roofTint = (c, v) => lit(c, VARIANT_TINT[v % 4]);

// ───────── Matières nommées ─────────
const mat = (p, kind, c1, c2) => (gg, W, H, k) => {
  if (kind === 'stone') MAT.stone(gg, W, H, p, c1 || PAL.stone, k);
  else if (kind === 'timber') MAT.timber(gg, W, H, p, c1 || PAL.plaster, c2 || PAL.wood, k);
  else if (kind === 'planks') MAT.planks(gg, W, H, p, c1 || PAL.plank, k);
  else MAT.plaster(gg, W, H, p, c1 || PAL.plaster, k);
};
const withDeco = (base, deco) => (gg, W, H, k) => { base(gg, W, H, k); if (deco) deco(gg, W, H, k); };

// Rangée de fenêtres sur une face (repère local, y vers le haut)
function windows(gg, W, p, n, y, h = 9, { arch = true, glow = 1, shutters = false, w = 7 } = {}) {
  const s = p.s;
  for (let i = 0; i < n; i++) { const x = (W * (i + 0.5)) / n - (w * s) / 2; window_(gg, x, y * s, w * s, h * s, p, { arch, glow: i === glow, shutters }); }
}

// ───────── Enseignes (symboles peints, sans texte) ─────────
const SYM = {
  mug(g, s) { g.fillStyle = '#e8b04a'; g.fillRect(-4 * s, -5 * s, 7 * s, 9 * s); g.strokeStyle = '#3a2412'; g.lineWidth = 1.2 * s; g.strokeRect(-4 * s, -5 * s, 7 * s, 9 * s); g.beginPath(); g.arc(4 * s, 0, 2.5 * s, -1.4, 1.4); g.stroke(); g.fillStyle = '#fff'; g.fillRect(-4 * s, -6.5 * s, 7 * s, 2 * s); },
  anvil(g, s) { g.fillStyle = '#4a4d55'; g.beginPath(); g.moveTo(-6 * s, -3 * s); g.lineTo(6 * s, -3 * s); g.lineTo(3 * s, 0); g.lineTo(2 * s, 4 * s); g.lineTo(-2 * s, 4 * s); g.lineTo(-3 * s, 0); g.closePath(); g.fill(); },
  book(g, s) { g.fillStyle = '#7a2a2a'; g.fillRect(-5 * s, -5 * s, 10 * s, 9 * s); g.fillStyle = '#f2e4c2'; g.fillRect(-4 * s, -4 * s, 8 * s, 7 * s); g.strokeStyle = '#3a2412'; g.lineWidth = 0.8 * s; g.beginPath(); g.moveTo(0, -4 * s); g.lineTo(0, 3 * s); g.stroke(); },
  bread(g, s) { g.fillStyle = '#c47a2c'; g.beginPath(); g.ellipse(0, 0, 6 * s, 3.6 * s, 0, 0, 7); g.fill(); g.strokeStyle = '#fde6b4'; g.lineWidth = 1 * s; for (const x of [-2.5, 0, 2.5]) { g.beginPath(); g.moveTo(x * s - 1 * s, -2 * s); g.lineTo(x * s + 1 * s, 1 * s); g.stroke(); } },
  cloth(g, s) { g.fillStyle = '#b8402a'; g.fillRect(-5 * s, -5 * s, 4 * s, 10 * s); g.fillStyle = '#3f74b0'; g.fillRect(-1 * s, -5 * s, 4 * s, 10 * s); g.fillStyle = '#e2b84a'; g.fillRect(3 * s, -5 * s, 2.5 * s, 10 * s); },
  flask(g, s) { g.fillStyle = '#7ad07a'; g.beginPath(); g.moveTo(-1.5 * s, -6 * s); g.lineTo(1.5 * s, -6 * s); g.lineTo(1.5 * s, -2 * s); g.lineTo(5 * s, 4 * s); g.lineTo(-5 * s, 4 * s); g.lineTo(-1.5 * s, -2 * s); g.closePath(); g.fill(); g.strokeStyle = '#2a3a2a'; g.lineWidth = 0.8 * s; g.stroke(); },
  sword(g, s) { g.strokeStyle = '#d8dee6'; g.lineWidth = 2 * s; g.beginPath(); g.moveTo(-5 * s, 5 * s); g.lineTo(5 * s, -5 * s); g.moveTo(5 * s, 5 * s); g.lineTo(-5 * s, -5 * s); g.stroke(); g.fillStyle = '#e2b84a'; g.fillRect(-1.5 * s, -1.5 * s, 3 * s, 3 * s); },
  coin(g, s) { g.fillStyle = '#f1c232'; g.beginPath(); g.arc(0, 0, 5 * s, 0, 7); g.fill(); g.strokeStyle = '#a87510'; g.lineWidth = 1 * s; g.stroke(); g.beginPath(); g.moveTo(0, -3 * s); g.lineTo(0, 3 * s); g.stroke(); },
  horse(g, s) { g.fillStyle = '#7a4a26'; g.beginPath(); g.ellipse(0, 1 * s, 5 * s, 2.6 * s, 0, 0, 7); g.fill(); g.fillRect(3 * s, -4 * s, 2.4 * s, 5 * s); g.fillRect(-4 * s, 2 * s, 1.2 * s, 3 * s); g.fillRect(2.6 * s, 2 * s, 1.2 * s, 3 * s); },
  map(g, s) { g.fillStyle = '#f2e4c2'; g.fillRect(-5 * s, -4 * s, 10 * s, 8 * s); g.strokeStyle = '#b8402a'; g.lineWidth = 1 * s; g.setLineDash([1.5 * s, 1 * s]); g.beginPath(); g.moveTo(-4 * s, 2 * s); g.lineTo(0, -1 * s); g.lineTo(3 * s, 2 * s); g.stroke(); g.setLineDash([]); },
  star(g, s) { g.fillStyle = '#ffd95a'; g.beginPath(); for (let i = 0; i < 10; i++) { const a = (i * Math.PI) / 5 - Math.PI / 2, r = (i % 2 ? 2.4 : 6) * s; g.lineTo(Math.cos(a) * r, Math.sin(a) * r); } g.closePath(); g.fill(); },
  quill(g, s) { g.fillStyle = '#f2f2f2'; g.beginPath(); g.moveTo(-4 * s, 5 * s); g.quadraticCurveTo(-2 * s, -6 * s, 5 * s, -6 * s); g.quadraticCurveTo(2 * s, -1 * s, -4 * s, 5 * s); g.fill(); },
  scale(g, s) { g.strokeStyle = '#e2b84a'; g.lineWidth = 1.2 * s; g.beginPath(); g.moveTo(0, -5 * s); g.lineTo(0, 5 * s); g.moveTo(-5 * s, -3 * s); g.lineTo(5 * s, -3 * s); g.stroke(); g.fillStyle = '#e2b84a'; g.beginPath(); g.arc(-4 * s, 0, 2 * s, 0, Math.PI); g.arc(4 * s, 0, 2 * s, 0, Math.PI); g.fill(); },
  hammer(g, s) { g.fillStyle = '#6b4a2a'; g.fillRect(-1 * s, -2 * s, 2 * s, 8 * s); g.fillStyle = '#5d6672'; g.fillRect(-5 * s, -5 * s, 10 * s, 4 * s); },
  saw(g, s) { g.fillStyle = '#c9d0d8'; g.fillRect(-6 * s, -2 * s, 10 * s, 3.5 * s); g.fillStyle = '#7a4a26'; g.fillRect(4 * s, -3 * s, 3 * s, 5 * s); },
  leaf(g, s) { g.fillStyle = '#5aa83a'; g.beginPath(); g.ellipse(0, 0, 3.5 * s, 6 * s, 0.6, 0, 7); g.fill(); },
  fish(g, s) { g.fillStyle = '#6aa8d8'; g.beginPath(); g.ellipse(-1 * s, 0, 5 * s, 2.6 * s, 0, 0, 7); g.fill(); g.beginPath(); g.moveTo(3 * s, 0); g.lineTo(6 * s, -3 * s); g.lineTo(6 * s, 3 * s); g.closePath(); g.fill(); },
  bow(g, s) { g.strokeStyle = '#7a4a26'; g.lineWidth = 1.6 * s; g.beginPath(); g.arc(-2 * s, 0, 6 * s, -1.2, 1.2); g.stroke(); g.strokeStyle = '#eee'; g.lineWidth = 0.7 * s; g.beginPath(); g.moveTo(0.2 * s, -5.6 * s); g.lineTo(0.2 * s, 5.6 * s); g.stroke(); },
  crystal(g, s) { g.fillStyle = '#9ad8ff'; g.beginPath(); g.moveTo(0, -6 * s); g.lineTo(3.5 * s, 0); g.lineTo(0, 6 * s); g.lineTo(-3.5 * s, 0); g.closePath(); g.fill(); g.strokeStyle = '#2a4a6a'; g.lineWidth = 0.8 * s; g.stroke(); },
  hide(g, s) { g.fillStyle = '#b08050'; g.beginPath(); g.moveTo(-5 * s, -5 * s); g.lineTo(5 * s, -5 * s); g.lineTo(4 * s, 0); g.lineTo(5 * s, 5 * s); g.lineTo(-5 * s, 5 * s); g.lineTo(-4 * s, 0); g.closePath(); g.fill(); },
  shield(g, s) { g.fillStyle = '#3f74b0'; g.beginPath(); g.moveTo(-5 * s, -5 * s); g.lineTo(5 * s, -5 * s); g.lineTo(5 * s, 0); g.quadraticCurveTo(5 * s, 4 * s, 0, 6 * s); g.quadraticCurveTo(-5 * s, 4 * s, -5 * s, 0); g.closePath(); g.fill(); g.fillStyle = '#f1d36a'; g.fillRect(-1 * s, -4 * s, 2 * s, 9 * s); },
};
// Enseigne suspendue à une potence, posée sur la face G d'un bâtiment, à la hauteur z
export function sign(p, u, v, z, sym) {
  const g = p.g, s = p.s;
  const [x, y] = p.P(u, v, z);
  g.strokeStyle = INK; g.lineWidth = 2 * s; g.beginPath(); g.moveTo(x, y); g.lineTo(x - 12 * s, y + 6 * s); g.stroke();
  g.strokeStyle = '#5a3a20'; g.lineWidth = 1 * s; g.stroke();
  const cx = x - 9 * s, cy = y + 14 * s;
  g.strokeStyle = '#3a2412'; g.lineWidth = 0.8 * s; g.beginPath(); g.moveTo(cx - 5 * s, y + 4.5 * s); g.lineTo(cx - 5 * s, cy - 7 * s); g.moveTo(cx + 5 * s, y + 3 * s); g.lineTo(cx + 5 * s, cy - 7 * s); g.stroke();
  g.fillStyle = '#c9a36a'; g.beginPath(); g.roundRect(cx - 8 * s, cy - 8 * s, 16 * s, 15 * s, 2 * s); g.fill(); strokeInk(p, 1);
  g.save(); g.translate(cx, cy - 0.5 * s); (SYM[sym] || SYM.star)(g, s * 0.95); g.restore();
}

// ───────── Archétype commun : maison à un ou deux niveaux qui grandit avec ses paliers ─────────
export function hall(p, t, v, o = {}) {
  const s = p.s;
  const { u0 = 0.18, v0 = 0.2, u1 = 0.82, v1 = 0.8, low = 'stone', high = 'timber', lowC = null, highC = null, wood = PAL.wood,
    roof = PAL.red, kind = 'tile', axis = 'u', h1 = 22, h2 = 20, rh = 28, sym = null, glow = 1, frontG = null, frontD = null,
    chim = true, active = true, maxFloors = 2, annex = true, turret = true, roofGable = null } = o;
  const floors = t >= 2 ? Math.min(2, maxFloors) : 1;
  const H = floors === 2 ? h1 + h2 : h1;
  const lowM = mat(p, low, lowC, wood), highM = mat(p, high, highC, wood);
  // annexe (palier 3) : appentis sur le côté gauche, sous le bâtiment principal
  if (t >= 3 && annex) {
    dropShadow(p, u0 - 0.12, v0 + 0.15, u0 + 0.05, v1 - 0.05, 30);
    box(p, u0 - 0.14, v0 + 0.2, u0, v1 - 0.06, 0, h1 - 4, { G: withDeco(mat(p, 'planks', null, wood), (gg, W) => windows(gg, W, p, 1, 5, 7, { arch: false, glow: -1 })), D: mat(p, 'planks', null, wood) });
    gable(p, u0 - 0.15, v0 + 0.19, u0 + 0.02, v1 - 0.05, h1 - 4, 12, { axis: 'v', color: lit(roof, -0.08), kind, o: 0.03 });
  }
  dropShadow(p, u0, v0, u1, v1, H + rh);
  // v23 : soubassement de pierre, un peu plus large que les murs (le bâtiment est posé, pas collé au sol)
  const plinthC = low === 'stone' ? lit(PAL.stoneD, -0.12) : '#a8946c';
  box(p, u0 - 0.018, v0 - 0.018, u1 + 0.018, v1 + 0.018, 0, 5, { G: mat(p, 'stone', plinthC), D: mat(p, 'stone', plinthC), top: lit(plinthC, 0.12) });
  const floorG = withDeco(lowM, (gg, W, Hh) => { door(gg, W * (axis === 'u' ? 0.42 : 0.38), 13 * s, 17 * s, p, { arch: low === 'stone' }); windows(gg, W, p, 2, 6, 9, { glow: glow >= 1 ? 1 : -1 }); if (frontG) frontG(gg, W, Hh); });
  const floorD = withDeco(lowM, (gg, W, Hh) => { windows(gg, W, p, 2, 6, 9, { glow: -1 }); if (frontD) frontD(gg, W, Hh); });
  box(p, u0, v0, u1, v1, 0, h1, { G: floorG, D: floorD });
  if (floors === 2) {
    box(p, u0 - 0.02, v0 - 0.02, u1 + 0.02, v1 + 0.02, h1, H, {
      G: withDeco(highM, (gg, W) => windows(gg, W, p, 2, 5, 9, { arch: false, shutters: true, glow: glow >= 1 ? 0 : -1 })),
      D: withDeco(highM, (gg, W) => windows(gg, W, p, 1, 5, 9, { arch: false, shutters: true, glow: -1 })),
    });
  }
  const e = floors === 2 ? 0.02 : 0;
  if (chim) { const cu = axis === 'u' ? u0 + (u1 - u0) * 0.7 : u0 + 0.06, cv = axis === 'u' ? v0 + 0.06 : v0 + (v1 - v0) * 0.3; chimneyAt(p, cu, cv, H + 4, H + rh + 10, active); }
  gable(p, u0 - e, v0 - e, u1 + e, v1 + e, H, rh, { axis, color: roof, kind, gableMat: roofGable || highM });
  // v23 : épis de faîtage (palier 4) puis faîtage doré (palier 5) : la richesse se lit sur le toit
  if (t >= 4 && kind !== 'thatch') ridgeDress(p, u0 - e, v0 - e, u1 + e, v1 + e, H + rh, axis, t >= 5);
  if (sym) sign(p, u0 + 0.12, v1 + e, h1 - 4, sym);
  // tourelle d'angle (palier 4) et ornements (palier 5)
  if (t >= 4 && turret) tower(p, u1 + 0.02, v0 + 0.02, 0.1, 0, H + 14, { roof, roofKind: kind === 'thatch' ? 'tile' : kind, roofH: 26, crenels: false, windows: 1, flag: t >= 5 ? ['#2f5fb0', '#f1d36a'] : null });
  return H + rh;
}
// Épis aux deux bouts du faîtage ; gold : faîtage souligné d'or
function ridgeDress(p, u0, v0, u1, v1, z, axis, gold) {
  const g = p.g, s = p.s, o = 0.06;
  const a = axis === 'u' ? p.P(u0 - o, (v0 + v1) / 2, z) : p.P((u0 + u1) / 2, v0 - o, z);
  const b = axis === 'u' ? p.P(u1 + o, (v0 + v1) / 2, z) : p.P((u0 + u1) / 2, v1 + o, z);
  if (gold) { g.lineCap = 'round'; g.strokeStyle = PAL.gold; g.lineWidth = 1.6 * s; g.beginPath(); g.moveTo(a[0], a[1] - 1.5 * s); g.lineTo(b[0], b[1] - 1.5 * s); g.stroke(); }
  for (const [x, y] of [a, b]) {
    g.strokeStyle = INK; g.lineWidth = 2.4 * s; g.beginPath(); g.moveTo(x, y); g.lineTo(x, y - 9 * s); g.stroke();
    g.strokeStyle = gold ? PAL.gold : '#5b6068'; g.lineWidth = 1.2 * s; g.stroke();
    g.fillStyle = gold ? PAL.gold : '#5b6068'; g.beginPath(); g.arc(x, y - 10 * s, 2.2 * s, 0, 7); g.fill(); strokeInk(p, 0.7);
  }
}
// Potence de levage au pignon d'un entrepôt, corde et charge suspendue
function hoist(p, u, v, z, load = '#b3824c') {
  const g = p.g, s = p.s, [x, y] = p.P(u, v, z), [x2, y2] = p.P(u, v + 0.16, z);
  g.lineCap = 'round'; g.strokeStyle = INK; g.lineWidth = 4.2 * s; g.beginPath(); g.moveTo(x, y); g.lineTo(x2, y2); g.stroke();
  g.strokeStyle = '#7a4a26'; g.lineWidth = 2.6 * s; g.stroke();
  g.strokeStyle = '#3a2a1c'; g.lineWidth = 0.9 * s; g.beginPath(); g.moveTo(x2, y2); g.lineTo(x2, y2 + 16 * s); g.stroke();
  g.fillStyle = load; g.fillRect(x2 - 5 * s, y2 + 16 * s, 10 * s, 8 * s); g.strokeStyle = INK; g.lineWidth = 1 * s; g.strokeRect(x2 - 5 * s, y2 + 16 * s, 10 * s, 8 * s);
  g.strokeStyle = rgba('#3a2412', 0.6); g.beginPath(); g.moveTo(x2 - 5 * s, y2 + 20 * s); g.lineTo(x2 + 5 * s, y2 + 20 * s); g.stroke();
}
// Puits de pierre à toit de bardeaux
function well(p, u, v) {
  const g = p.g, s = p.s, [x, y] = p.P(u, v);
  g.fillStyle = 'rgba(22,30,12,0.25)'; g.beginPath(); g.ellipse(x + 3 * s, y + 1 * s, 10 * s, 4 * s, 0, 0, 7); g.fill();
  g.fillStyle = '#b8a27a'; g.beginPath(); g.ellipse(x, y, 8 * s, 3.5 * s, 0, 0, Math.PI); g.lineTo(x - 8 * s, y - 8 * s); g.ellipse(x, y - 8 * s, 8 * s, 3.5 * s, 0, Math.PI, 0, true); g.closePath(); g.fill(); strokeInk(p, 0.9);
  g.fillStyle = '#2c3a48'; g.beginPath(); g.ellipse(x, y - 8 * s, 6 * s, 2.4 * s, 0, 0, 7); g.fill(); strokeInk(p, 0.7);
  g.strokeStyle = INK; g.lineWidth = 1.8 * s; g.beginPath(); g.moveTo(x - 7 * s, y - 8 * s); g.lineTo(x - 7 * s, y - 20 * s); g.moveTo(x + 7 * s, y - 8 * s); g.lineTo(x + 7 * s, y - 20 * s); g.stroke();
  g.fillStyle = '#8a5a32'; g.beginPath(); g.moveTo(x - 10 * s, y - 19 * s); g.lineTo(x, y - 26 * s); g.lineTo(x + 10 * s, y - 19 * s); g.closePath(); g.fill(); strokeInk(p, 0.9);
}
// Petit potager clos (rangs de légumes)
function garden(p, u0, v0, u1, v1, season = 'summer') {
  const g = p.g, s = p.s;
  poly(g, [p.P(u0, v0), p.P(u1, v0), p.P(u1, v1), p.P(u0, v1)]); g.fillStyle = '#7a5a36'; g.fill();
  const leaf = season === 'winter' ? '#cfd8d0' : season === 'autumn' ? '#b8963a' : '#5aa83a';
  for (let i = 1; i < 4; i++) { const v = v0 + ((v1 - v0) * i) / 4; for (let j = 1; j < 5; j++) { const [x, y] = p.P(u0 + ((u1 - u0) * j) / 5, v); g.fillStyle = leaf; g.beginPath(); g.ellipse(x, y - 1.5 * s, 2.6 * s, 1.8 * s, 0, 0, 7); g.fill(); } }
  fence(p, u0, v1, u1, v1, 4); fence(p, u1, v0, u1, v1, 3);
}
function chimneyAt(p, u, v, z0, z1, smoking = true) {
  box(p, u, v, u + 0.065, v + 0.065, z0 - 8, z1, { G: mat(p, 'stone', '#b9806a'), D: mat(p, 'stone', '#b9806a'), top: '#3a2a20' });
  if (smoking) { const [x, y] = p.P(u + 0.032, v + 0.032, z1); smoke(p, x, y - 4 * p.s, 4); }
}

// ───────── Accessoires ─────────
function barrel(p, u, v, c = '#b07a44') {
  const g = p.g, s = p.s, [x, y] = p.P(u, v);
  const gr = g.createLinearGradient(x - 5 * s, 0, x + 5 * s, 0); gr.addColorStop(0, lit(c, 0.1)); gr.addColorStop(0.4, lit(c, 0.25)); gr.addColorStop(1, lit(c, -0.3));
  g.fillStyle = gr; g.beginPath(); g.ellipse(x, y, 5 * s, 2 * s, 0, 0, Math.PI); g.lineTo(x - 5 * s, y - 10 * s); g.ellipse(x, y - 10 * s, 5 * s, 2 * s, 0, Math.PI, 0, true); g.closePath(); g.fill(); strokeInk(p, 0.8);
  g.fillStyle = lit(c, -0.2); g.beginPath(); g.ellipse(x, y - 10 * s, 5 * s, 2 * s, 0, 0, 7); g.fill(); strokeInk(p, 0.8);
  g.strokeStyle = '#3b3b40'; g.lineWidth = 1 * s; for (const yy of [-2.5, -7.5]) { g.beginPath(); g.ellipse(x, y + yy * s, 5 * s, 2 * s, 0, 0, Math.PI); g.stroke(); }
}
function crate(p, u, v, sz = 0.08, c = '#b3824c') { box(p, u, v, u + sz, v + sz, 0, sz * 120, { G: mat(p, 'planks', c), D: mat(p, 'planks', c), top: lit(c, 0.15) }); }
function logs(p, u, v, n = 3) { const g = p.g, s = p.s; for (let i = 0; i < n; i++) { const [x, y] = p.P(u + i * 0.01, v + i * 0.04, (i % 2) * 5); g.fillStyle = '#8a5a30'; g.beginPath(); g.roundRect(x - 12 * s, y - 5 * s, 22 * s, 5 * s, 2.5 * s); g.fill(); strokeInk(p, 0.7); g.fillStyle = '#e8c690'; g.beginPath(); g.ellipse(x + 10 * s, y - 2.5 * s, 2.4 * s, 2.6 * s, 0, 0, 7); g.fill(); strokeInk(p, 0.6); } }
function tree(p, u, v, { season = 'summer', kind = 'round', size = 1, fruit = null, r: rr = null } = {}) {
  const g = p.g, s = p.s * size, [x, y] = p.P(u, v);
  const R = rr || rng(Math.round(u * 1000 + v * 37));
  g.fillStyle = 'rgba(22,30,12,0.3)'; g.beginPath(); g.ellipse(x + 6 * s, y, 13 * s, 4.5 * s, 0, 0, 7); g.fill();
  g.fillStyle = '#6b4226'; g.fillRect(x - 2 * s, y - 14 * s, 4 * s, 14 * s); g.strokeStyle = INK; g.lineWidth = 0.8 * p.s; g.strokeRect(x - 2 * s, y - 14 * s, 4 * s, 14 * s);
  const leaf = { spring: ['#7cc04a', '#a8e070'], summer: ['#4f9a3a', '#7cc04a'], autumn: ['#d8862a', '#f0b84a'], winter: ['#e8f0f4', '#ffffff'] }[season] || ['#4f9a3a', '#7cc04a'];
  if (kind === 'pine') {
    for (let i = 0; i < 3; i++) {
      const w = (14 - i * 3.5) * s, yy = y - 12 * s - i * 9 * s;
      g.beginPath(); g.moveTo(x - w, yy); g.lineTo(x, yy - 16 * s); g.lineTo(x + w, yy); g.closePath();
      const gr = g.createLinearGradient(x - w, 0, x + w, 0); gr.addColorStop(0, season === 'winter' ? '#e8f0f4' : '#4f8a4a'); gr.addColorStop(1, season === 'winter' ? '#9fb4c0' : '#1f5a32');
      g.fillStyle = gr; g.fill(); strokeInk(p, 0.8);
    }
    return;
  }
  const blobs = [[0, -24, 11], [-7, -18, 8], [7, -18, 8], [0, -14, 9]];
  for (const [dx, dy, r] of blobs) {
    const gr = g.createRadialGradient(x + (dx - 3) * s, y + (dy - 3) * s, 1 * s, x + dx * s, y + dy * s, r * s);
    gr.addColorStop(0, leaf[1]); gr.addColorStop(1, leaf[0]);
    g.fillStyle = gr; g.beginPath(); g.arc(x + dx * s, y + dy * s, r * s, 0, 7); g.fill();
  }
  g.beginPath(); g.arc(x, y - 24 * s, 11 * s, Math.PI * 0.95, Math.PI * 2.05); g.arc(x + 7 * s, y - 18 * s, 8 * s, -0.8, 1.2); g.arc(x - 7 * s, y - 18 * s, 8 * s, 1.9, 4); g.strokeStyle = INK; g.lineWidth = 0.9 * p.s; g.stroke();
  if (fruit && season !== 'winter') for (let i = 0; i < 6; i++) { g.fillStyle = fruit; g.beginPath(); g.arc(x + R.range(-9, 9) * s, y + R.range(-30, -14) * s, 1.6 * s, 0, 7); g.fill(); }
}
function fence(p, u0, v0, u1, v1, n = 6) {
  const g = p.g, s = p.s;
  for (let i = 0; i <= n; i++) { const u = u0 + ((u1 - u0) * i) / n, v = v0 + ((v1 - v0) * i) / n; const [x, y] = p.P(u, v); g.fillStyle = '#7a5230'; g.fillRect(x - 1.1 * s, y - 9 * s, 2.2 * s, 9 * s); }
  g.strokeStyle = '#8a6038'; g.lineWidth = 1.5 * s; for (const z of [3.5, 7]) { g.beginPath(); g.moveTo(...p.P(u0, v0, z)); g.lineTo(...p.P(u1, v1, z)); g.stroke(); }
}
function animal(p, u, v, kind = 'sheep') {
  const g = p.g, s = p.s, [x, y] = p.P(u, v);
  g.fillStyle = 'rgba(22,30,12,0.25)'; g.beginPath(); g.ellipse(x + 2 * s, y, 7 * s, 2.2 * s, 0, 0, 7); g.fill();
  const body = kind === 'sheep' ? '#f4f0e6' : kind === 'cow' ? '#f2efe8' : '#8a5a32';
  g.fillStyle = '#3a2a1c'; for (const dx of [-4, -1, 2, 4.5]) g.fillRect(x + dx * s, y - 4 * s, 1.3 * s, 4 * s);
  g.fillStyle = body; g.beginPath(); g.ellipse(x, y - 6 * s, 7 * s, 4 * s, 0, 0, 7); g.fill(); strokeInk(p, 0.7);
  if (kind === 'cow') { g.fillStyle = '#3a2a1c'; g.beginPath(); g.ellipse(x - 2 * s, y - 7 * s, 2.2 * s, 1.6 * s, 0, 0, 7); g.fill(); }
  g.fillStyle = kind === 'sheep' ? '#3a2a1c' : body; g.beginPath(); g.ellipse(x + 7 * s, y - 8 * s, 2.8 * s, 2.2 * s, 0, 0, 7); g.fill(); strokeInk(p, 0.6);
}
function cart(p, u, v, load = '#e3c25a') {
  const g = p.g, s = p.s, [x, y] = p.P(u, v);
  g.fillStyle = '#8a5a30'; g.beginPath(); g.moveTo(x - 10 * s, y - 8 * s); g.lineTo(x + 8 * s, y - 2 * s); g.lineTo(x + 8 * s, y - 8 * s); g.lineTo(x - 10 * s, y - 14 * s); g.closePath(); g.fill(); strokeInk(p, 0.8);
  g.fillStyle = load; g.beginPath(); g.ellipse(x - 1 * s, y - 13 * s, 8 * s, 4 * s, 0.3, 0, 7); g.fill(); strokeInk(p, 0.7);
  for (const dx of [-6, 5]) { g.fillStyle = '#5a3a20'; g.beginPath(); g.ellipse(x + dx * s, y - 3 * s, 3 * s, 4 * s, 0, 0, 7); g.fill(); g.strokeStyle = '#c9a36a'; g.lineWidth = 0.8 * s; g.stroke(); }
}
function stall(p, u, v, stripe = '#c84a2e', goods = ['#e3c25a', '#c84a2e', '#6aa83a']) {
  const g = p.g, s = p.s;
  box(p, u, v, u + 0.2, v + 0.14, 0, 10, { G: mat(p, 'planks', '#b3824c'), D: mat(p, 'planks', '#9a6a3c') });
  // marchandises
  for (let i = 0; i < 5; i++) { const [x, y] = p.P(u + 0.03 + i * 0.035, v + 0.07, 10); g.fillStyle = goods[i % goods.length]; g.beginPath(); g.arc(x, y - 1.5 * s, 2.4 * s, 0, 7); g.fill(); strokeInk(p, 0.5); }
  // poteaux et auvent rayé
  for (const [uu, vv] of [[u, v + 0.14], [u + 0.2, v + 0.14]]) { g.strokeStyle = '#5a3a20'; g.lineWidth = 1.6 * s; g.beginPath(); g.moveTo(...p.P(uu, vv, 0)); g.lineTo(...p.P(uu, vv, 26)); g.stroke(); }
  const A = p.P(u - 0.02, v - 0.02, 30), B = p.P(u + 0.22, v - 0.02, 30), C = p.P(u + 0.22, v + 0.2, 20), D = p.P(u - 0.02, v + 0.2, 20);
  poly(g, [A, B, C, D]); g.fillStyle = '#f6efe0'; g.fill();
  for (let i = 0; i < 6; i += 2) { const a = i / 6, b = (i + 1) / 6; poly(g, [[A[0] + (B[0] - A[0]) * a, A[1] + (B[1] - A[1]) * a], [A[0] + (B[0] - A[0]) * b, A[1] + (B[1] - A[1]) * b], [D[0] + (C[0] - D[0]) * b, D[1] + (C[1] - D[1]) * b], [D[0] + (C[0] - D[0]) * a, D[1] + (C[1] - D[1]) * a]]); g.fillStyle = stripe; g.fill(); }
  poly(g, [A, B, C, D]); strokeInk(p, 1);
  for (let i = 0; i < 6; i++) { const t0 = i / 6, x = D[0] + (C[0] - D[0]) * (t0 + 1 / 12), y = D[1] + (C[1] - D[1]) * (t0 + 1 / 12); g.fillStyle = i % 2 ? stripe : '#f6efe0'; g.beginPath(); g.arc(x, y, 3.2 * s, 0, Math.PI); g.fill(); g.strokeStyle = INK; g.lineWidth = 0.7 * s; g.stroke(); }
}
function tent(p, u, v, r = 0.16, h = 34, c1 = '#c84a2e', c2 = '#f6efe0', flagC = null) {
  const g = p.g, s = p.s, rx = r * 90.5 * s, ry = r * 45.25 * s;
  const b = p.P(u, v, 0), a = p.P(u, v, h);
  roundShadow(p, u, v, r, h);
  g.save(); g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0] - rx, b[1]); g.ellipse(b[0], b[1], rx, ry, 0, Math.PI, 0, true); g.closePath(); g.clip();
  g.fillStyle = c2; g.fillRect(b[0] - rx, a[1], rx * 2, b[1] - a[1] + ry);
  for (let i = 0; i < 8; i += 2) { const a0 = Math.PI * (i / 8), a1 = Math.PI * ((i + 1) / 8); g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0] + rx * Math.cos(a0), b[1] + ry * Math.sin(a0)); g.lineTo(b[0] + rx * Math.cos(a1), b[1] + ry * Math.sin(a1)); g.closePath(); g.fillStyle = c1; g.fill(); }
  const sh = g.createLinearGradient(b[0] - rx, 0, b[0] + rx, 0); sh.addColorStop(0, 'rgba(255,240,200,.25)'); sh.addColorStop(0.6, 'rgba(0,0,0,0)'); sh.addColorStop(1, 'rgba(20,20,60,.35)');
  g.fillStyle = sh; g.fillRect(b[0] - rx, a[1], rx * 2, b[1] - a[1] + ry);
  g.restore();
  g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0] - rx, b[1]); g.ellipse(b[0], b[1], rx, ry, 0, Math.PI, 0, true); g.closePath(); strokeInk(p, 1.1);
  g.fillStyle = '#2a1a10'; g.beginPath(); g.moveTo(b[0] - 3 * s, b[1] + ry); g.lineTo(b[0] + 1 * s, b[1] + ry - 12 * s); g.lineTo(b[0] + 5 * s, b[1] + ry); g.closePath(); g.fill();
  if (flagC) banner(p, u, v, h, flagC, 16);
}
// Galerie circulaire en encorbellement (garde-corps de bois) autour d'une tour
function gallery(p, cu, cv, r, z) {
  const g = p.g, s = p.s, [x, y] = p.P(cu, cv, z), rx = r * 90.5 * s, ry = r * 45.25 * s;
  g.fillStyle = '#6b4524'; g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, 7); g.fill(); strokeInk(p, 1);
  g.fillStyle = '#8a5a32'; g.beginPath(); g.ellipse(x, y - 2 * s, rx, ry, 0, 0, 7); g.fill(); strokeInk(p, 0.8);
  g.strokeStyle = '#5a3a20'; g.lineWidth = 1.2 * s;
  for (let i = 0; i < 14; i++) { const a = (i / 14) * Math.PI; const px = x + Math.cos(a) * rx, py = y - 2 * s + Math.sin(a) * ry; g.beginPath(); g.moveTo(px, py); g.lineTo(px, py - 7 * s); g.stroke(); }
  g.strokeStyle = INK; g.lineWidth = 1.6 * s; g.beginPath(); g.ellipse(x, y - 9 * s, rx, ry, 0, 0, Math.PI); g.stroke();
  g.strokeStyle = '#c9a36a'; g.lineWidth = 0.8 * s; g.stroke();
}
// Sphère armillaire dorée au sommet d'une coupole
function armillary(p, cu, cv, z) {
  const g = p.g, s = p.s, [x, y] = p.P(cu, cv, z), R = 9 * s;
  g.strokeStyle = INK; g.lineWidth = 2.2 * s; g.beginPath(); g.moveTo(x, y + R + 6 * s); g.lineTo(x, y + R); g.stroke();
  for (const [rx, ry, rot] of [[R, R, 0], [R, R * 0.35, 0.4], [R * 0.35, R, -0.3]]) {
    g.beginPath(); g.ellipse(x, y, rx, ry, rot, 0, 7); g.strokeStyle = INK; g.lineWidth = 2.6 * s; g.stroke(); g.strokeStyle = PAL.gold; g.lineWidth = 1.4 * s; g.stroke();
  }
  g.fillStyle = '#f6dd94'; g.beginPath(); g.arc(x, y, 2.4 * s, 0, 7); g.fill(); strokeInk(p, 0.6);
}
function dome(p, cu, cv, r, z, color = '#3f74b0') {
  const g = p.g, s = p.s, rx = r * 90.5 * s, ry = r * 45.25 * s, [x, y] = p.P(cu, cv, z);
  g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, Math.PI); g.ellipse(x, y, rx, rx * 0.95, 0, Math.PI, 0); g.closePath();
  const gr = g.createRadialGradient(x - rx * 0.4, y - rx * 0.6, 1 * s, x, y - rx * 0.3, rx * 1.3); gr.addColorStop(0, lit(color, 0.45)); gr.addColorStop(0.5, color); gr.addColorStop(1, lit(color, -0.35));
  g.fillStyle = gr; g.fill(); strokeInk(p, 1.1);
  g.strokeStyle = rgba('#10162a', 0.3); g.lineWidth = 0.9 * s; for (const k of [-0.5, 0, 0.5]) { g.beginPath(); g.ellipse(x, y, Math.abs(rx * k) + 0.1, rx * 0.95, 0, Math.PI, 0); g.stroke(); }
  g.fillStyle = PAL.gold; g.beginPath(); g.arc(x, y - rx * 0.95 - 3 * s, 2.4 * s, 0, 7); g.fill(); strokeInk(p, 0.7);
}
function shedRoof(p, u0, v0, u1, v1, zBack, zFront, color, kind = 'tile') {
  const g = p.g;
  // pan unique incliné vers l'avant (v croissant), posé sur poteaux ou murs
  const A = p.P(u0, v0, zBack), B = p.P(u1, v0, zBack), C = p.P(u1, v1, zFront), D = p.P(u0, v1, zFront);
  poly(g, [A, B, C, D]); g.fillStyle = lit(color, -0.1); g.fill();
  // repère du pan : x le long de u (D → C), y vers le haut de la pente (D → A)
  const Wl = Math.hypot(C[0] - D[0], C[1] - D[1]), Hl = Math.hypot(A[0] - D[0], A[1] - D[1]);
  g.save(); g.transform((C[0] - D[0]) / Wl, (C[1] - D[1]) / Wl, (A[0] - D[0]) / Hl, (A[1] - D[1]) / Hl, D[0], D[1]);
  g.beginPath(); g.rect(0, 0, Wl, Hl); g.clip();
  ({ tile: () => import_ROOF.tile(g, Wl, Hl, p, color, 0), slate: () => import_ROOF.slate(g, Wl, Hl, p, color, 0), thatch: () => import_ROOF.thatch(g, Wl, Hl, p, color, 0) }[kind] || (() => {}))();
  g.restore();
  poly(g, [A, B, C, D]); strokeInk(p, 1.1);
  poly(g, [B, C, p.P(u1, v1, 0), p.P(u1, v0, 0)]);
}
import { ROOF as import_ROOF } from './paint.js';
function post(p, u, v, z, c = '#5a3a20') { const g = p.g; g.strokeStyle = INK; g.lineWidth = 3.4 * p.s; g.beginPath(); g.moveTo(...p.P(u, v, 0)); g.lineTo(...p.P(u, v, z)); g.stroke(); g.strokeStyle = c; g.lineWidth = 2 * p.s; g.stroke(); }

// ───────── Les peintres, type par type ─────────
// Signature : (p, t, v, o) — t palier 0..5, v variante, o { active, river, season, level }
const fam = (k, v) => roofTint(ROOF_OF[k] || PAL.red, v);
export const PAINT = {
  townhall: (p, t) => townhallSheet(p, t <= 1 ? 1 : t <= 3 ? 3 : 5),
  castle: (p, t, v, o) => {
    const k0 = 0.24, k1 = 0.76, H = 56 + t * 6;
    tower(p, 0.2, 0.2, 0.11, 0, H + 10, { roof: PAL.red, roofKind: 'tile', roofH: 30, windows: 1 });
    dropShadow(p, k0, k0, k1, k1, H + 40);
    box(p, k0, k0, k1, k1, 0, H, { G: withDeco(mat(p, 'stone'), (gg, W) => { door(gg, W * 0.4, 16 * p.s, 22 * p.s, p, { color: '#6a3c20' }); windows(gg, W, p, 3, 34, 10, { glow: 1 }); }), D: withDeco(mat(p, 'stone'), (gg, W) => windows(gg, W, p, 2, 30, 10, { glow: -1 })), top: lit(PAL.stone, -0.08) });
    for (let i = 0; i < 5; i++) { const u = k0 + i * (k1 - k0) / 4.6; box(p, u, k1 - 0.04, u + 0.06, k1, H, H + 8, { G: mat(p, 'stone'), D: mat(p, 'stone'), top: lit(PAL.stone, 0.05) }); }
    for (let i = 0; i < 5; i++) { const v0 = k0 + i * (k1 - k0) / 4.6; box(p, k1 - 0.04, v0, k1, v0 + 0.06, H, H + 8, { G: mat(p, 'stone'), D: mat(p, 'stone'), top: lit(PAL.stone, 0.05) }); }
    if (t >= 3) tower(p, 0.5, 0.5, 0.12, H, H + 30, { roof: PAL.red, roofKind: 'tile', roofH: 32, flag: ['#a83a2a', '#f1d36a'], windows: 1 });
    tower(p, 0.8, 0.2, 0.11, 0, H + 10, { roof: PAL.red, roofKind: 'tile', roofH: 30, windows: 1, flag: t >= 2 ? ['#2f5fb0', '#f1d36a'] : null });
    tower(p, 0.2, 0.8, 0.11, 0, H + 10, { roof: PAL.red, roofKind: 'tile', roofH: 30, windows: 1 });
    banner(p, 0.62, 0.9, 0, ['#a83a2a', '#f1d36a'], 20);
  },
  house: (p, t, v, o) => {
    const roof = [PAL.red, PAL.orange, '#b0503a', PAL.brown][v % 4];
    hall(p, t, v, { roof, kind: t === 0 || v % 3 === 2 ? 'thatch' : 'tile', axis: v % 2 ? 'v' : 'u', u0: 0.22, v0: 0.24, u1: 0.78, v1: 0.76, h1: 20, h2: 18, rh: 26, turret: false, active: o.active, frontG: (gg, W) => { const s = p.s; gg.fillStyle = '#7a4a26'; gg.fillRect(W * 0.66, 3 * p.s, 10 * s, 2.5 * s); for (let i = 0; i < 4; i++) { gg.fillStyle = ['#e8484a', '#ffd95a', '#f08aa0', '#b6d4ff'][i]; gg.beginPath(); gg.arc(W * 0.66 + 1.5 * s + i * 2.5 * s, 6.5 * s, 1.3 * s, 0, 7); gg.fill(); } } });
    // v23 : potager clos (palier 3), puits (4), tourelle de manoir (5)
    if (t >= 3) garden(p, 0.04, 0.8, 0.3, 0.98, o.season);
    if (t >= 4) { barrel(p, 0.86, 0.9); well(p, 0.9, 0.62); }
    if (t >= 5) { tower(p, 0.78, 0.24, 0.09, 0, 62, { roof, roofKind: 'tile', roofH: 24, crenels: false, windows: 1, flag: ['#2f5fb0', '#f1d36a'] }); }
  },
  warehouse: (p, t, v, o) => {
    hall(p, t, v, { low: 'planks', high: 'planks', lowC: '#9a6a3c', highC: '#8a5a32', roof: fam('core', v), kind: 'slate', u0: 0.12, v0: 0.18, u1: 0.88, v1: 0.72, h1: 26, h2: 16, rh: 26, chim: false, sym: 'coin', turret: false, maxFloors: 2,
      frontG: (gg, W) => { const s = p.s; gg.fillStyle = '#5a3418'; gg.fillRect(W * 0.62, 0, 20 * s, 20 * s); gg.strokeStyle = '#3b3b40'; gg.lineWidth = 1.4 * s; gg.beginPath(); gg.moveTo(W * 0.62, 0); gg.lineTo(W * 0.62 + 20 * s, 20 * s); gg.moveTo(W * 0.62 + 20 * s, 0); gg.lineTo(W * 0.62, 20 * s); gg.stroke(); } });
    crate(p, 0.14, 0.82); crate(p, 0.24, 0.84, 0.07, '#c9965a'); barrel(p, 0.86, 0.86); if (t >= 2) { crate(p, 0.18, 0.76, 0.06); barrel(p, 0.92, 0.78); }
    // v23 : potence de levage au pignon (palier 2), charrette (3), pile de caisses (4), quai couvert (5)
    if (t >= 2) hoist(p, 0.88, 0.28, 50, '#c9965a');
    if (t >= 3) cart(p, 0.6, 0.92);
    if (t >= 4) { crate(p, 0.9, 0.62, 0.08); crate(p, 0.9, 0.62, 0.06, '#c9965a'); box(p, 0.91, 0.63, 0.97, 0.69, 9, 16, { G: mat(p, 'planks', '#a0703e'), D: mat(p, 'planks', '#a0703e'), top: '#c9965a' }); }
    if (t >= 5) { post(p, 0.5, 0.86, 22); post(p, 0.84, 0.86, 22); shedRoof(p, 0.46, 0.72, 0.88, 0.88, 30, 22, lit(fam('core', v), -0.1), 'slate'); }
  },
  market: (p, t, v, o) => {
    const stripes = ['#c84a2e', '#3f74b0', '#e2b84a', '#4f8a3a'];
    if (t >= 2) hall(p, t, v, { roof: fam('economy', v), u0: 0.1, v0: 0.08, u1: 0.62, v1: 0.42, h1: 20, h2: 16, rh: 22, sym: 'scale', turret: t >= 4, annex: false, active: o.active });
    const n = 2 + Math.min(3, Math.floor(t / 1.5));
    const spots = [[0.66, 0.12], [0.62, 0.5], [0.3, 0.56], [0.12, 0.62], [0.66, 0.72]];
    for (let i = 0; i < n; i++) stall(p, spots[i][0], spots[i][1], stripes[(i + v) % 4]);
    barrel(p, 0.48, 0.92); crate(p, 0.88, 0.5, 0.06);
  },
  tavern: (p, t, v, o) => {
    hall(p, t, v, { roof: fam('places', v), kind: 'tile', u0: 0.16, v0: 0.16, u1: 0.84, v1: 0.74, h1: 22, h2: 20, rh: 28, sym: 'mug', glow: 1, active: o.active });
    barrel(p, 0.86, 0.84); barrel(p, 0.92, 0.76, '#9a6a3c'); barrel(p, 0.12, 0.86);
    if (t >= 3) { const [x, y] = p.P(0.5, 0.92); figure(p, x, y, { tunic: '#7a4a26', hat: '#5a3a20' }); }
  },
  library: (p, t, v, o) => {
    hall(p, t, v, { low: 'stone', high: 'stone', roof: fam('knowledge', v), kind: 'slate', u0: 0.16, v0: 0.18, u1: 0.84, v1: 0.8, h1: 26, h2: 22, rh: 30, sym: 'book', turret: false, chim: false });
    if (t >= 4) { tower(p, 0.84, 0.2, 0.12, 0, 74, { roof: fam('knowledge', v), roofH: 32, windows: 2 }); }
    if (t >= 5) dome(p, 0.5, 0.5, 0.1, 96, PAL.gold);
  },
  laboratory: (p, t, v, o) => {
    hall(p, Math.min(t, 2), v, { low: 'stone', high: 'timber', roof: fam('knowledge', v), kind: 'slate', u0: 0.12, v0: 0.3, u1: 0.62, v1: 0.84, h1: 20, h2: 16, rh: 22, sym: 'flask', turret: false, annex: false, active: false });
    roundShadow(p, 0.76, 0.3, 0.16, 90);
    tower(p, 0.76, 0.3, 0.16, 0, 50 + t * 8, { roof: '#5a3a8a', roofH: 34, windows: 2, crenels: false });
    if (o.active !== false) { const [x, y] = p.P(0.76, 0.3, 90 + t * 8); smoke(p, x, y, 3); }
  },
  observatory: (p, t, v, o) => {
    // v23 : une tour d'astronome qui grandit — annexe d'étude (palier 2), galerie d'observation (3), seconde
    // coupole (4), sphère armillaire dorée (5). La lunette pointe toujours vers le ciel du sud-est.
    const H = 54 + t * 8, col = fam('knowledge', v);
    if (t >= 2) hall(p, Math.min(t, 2), v, { low: 'stone', high: 'stone', roof: col, kind: 'slate', u0: 0.06, v0: 0.5, u1: 0.42, v1: 0.92, h1: 20, h2: 14, rh: 18, sym: 'star', turret: false, annex: false, chim: false, maxFloors: 1 });
    if (t >= 4) { roundShadow(p, 0.84, 0.8, 0.1, 60); tower(p, 0.84, 0.8, 0.1, 0, 40, { roof: null, windows: 1, crenels: false }); dome(p, 0.84, 0.8, 0.085, 42, lit(col, 0.1)); }
    roundShadow(p, 0.56, 0.42, 0.24, 110);
    tower(p, 0.56, 0.42, 0.24, 0, H, { roof: null, windows: 2, crenels: t < 3 });
    if (t >= 3) gallery(p, 0.56, 0.42, 0.29, H - 2);
    dome(p, 0.56, 0.42, 0.2, H + 4, col);
    const g = p.g, s = p.s, [x, y] = p.P(0.56, 0.42, H + 16);
    g.lineCap = 'round'; g.strokeStyle = INK; g.lineWidth = 5.4 * s; g.beginPath(); g.moveTo(x, y); g.lineTo(x + 15 * s, y - 17 * s); g.stroke(); g.strokeStyle = '#c9a36a'; g.lineWidth = 3.2 * s; g.stroke();
    g.fillStyle = '#e2b84a'; g.beginPath(); g.arc(x + 15 * s, y - 17 * s, 2.2 * s, 0, 7); g.fill(); strokeInk(p, 0.6);
    if (t >= 5) armillary(p, 0.56, 0.42, H + 40);
  },
  guildhall: (p, t, v, o) => {
    hall(p, t, v, { roof: fam('places', v), kind: 'tile', u0: 0.1, v0: 0.14, u1: 0.9, v1: 0.82, h1: 24, h2: 22, rh: 30, sym: 'shield', active: o.active });
    banner(p, 0.08, 0.86, 0, ['#2f5fb0', '#f1d36a'], 18); banner(p, 0.94, 0.5, 0, ['#a83a2a', '#f1d36a'], 18);
  },
  bakery: (p, t, v, o) => {
    hall(p, t, v, { roof: fam('economy', v), u0: 0.2, v0: 0.22, u1: 0.8, v1: 0.78, h1: 20, h2: 18, rh: 26, sym: 'bread', active: o.active, frontD: (gg, W) => { const s = p.s; gg.fillStyle = '#3a2418'; gg.beginPath(); gg.arc(W * 0.55, 0, 8 * s, Math.PI, 0, false); gg.fill(); gg.fillStyle = o.active !== false ? '#ff9a3a' : '#5a3a2a'; gg.beginPath(); gg.arc(W * 0.55, 0, 5.5 * s, Math.PI, 0, false); gg.fill(); } });
    crate(p, 0.86, 0.84, 0.07, '#d6a466');
  },
  foundry: (p, t, v, o) => {
    hall(p, t, v, { low: 'stone', high: 'stone', lowC: '#b9a080', roof: fam('economy', v), kind: 'slate', u0: 0.14, v0: 0.24, u1: 0.78, v1: 0.84, h1: 24, h2: 16, rh: 22, chim: false, sym: 'hammer', turret: false,
      frontG: (gg, W) => { const s = p.s; gg.fillStyle = '#2a1a10'; gg.fillRect(W * 0.62, 0, 16 * s, 18 * s); const gr = gg.createLinearGradient(0, 0, 0, 16 * s); gr.addColorStop(0, '#ffcf6a'); gr.addColorStop(1, '#e85a1a'); gg.fillStyle = o.active !== false ? gr : '#3a2418'; gg.fillRect(W * 0.62 + 2 * s, 0, 12 * s, 14 * s); } });
    box(p, 0.78, 0.14, 0.9, 0.26, 0, 80 + t * 6, { G: mat(p, 'stone', '#a8604a'), D: mat(p, 'stone', '#a8604a'), top: '#2a1a12' });
    if (o.active !== false) { const [x, y] = p.P(0.84, 0.2, 80 + t * 6); smoke(p, x, y - 4 * p.s, 5); }
  },
  forge: (p, t, v, o) => {
    hall(p, Math.min(t, 1), v, { low: 'stone', roof: fam('military', v), u0: 0.12, v0: 0.12, u1: 0.6, v1: 0.5, h1: 22, rh: 22, sym: 'anvil', annex: false, active: o.active });
    // atelier ouvert : appentis sur poteaux, enclume, braises
    for (const [u, v0] of [[0.62, 0.55], [0.92, 0.55], [0.92, 0.9], [0.62, 0.9]]) post(p, u, v0, 24);
    const g = p.g, s = p.s, [ax, ay] = p.P(0.76, 0.72);
    g.fillStyle = 'rgba(22,30,12,0.3)'; g.beginPath(); g.ellipse(ax, ay, 12 * s, 4 * s, 0, 0, 7); g.fill();
    g.save(); g.translate(ax, ay - 8 * s); SYM.anvil(g, s * 1.6); g.restore();
    const [fx, fy] = p.P(0.68, 0.62); const gr = g.createRadialGradient(fx, fy - 4 * s, 1 * s, fx, fy - 4 * s, 10 * s); gr.addColorStop(0, o.active !== false ? '#ffe08a' : '#7a4a2a'); gr.addColorStop(1, 'rgba(232,90,26,0)'); g.fillStyle = gr; g.beginPath(); g.arc(fx, fy - 4 * s, 10 * s, 0, 7); g.fill();
    shedRoof(p, 0.6, 0.53, 0.94, 0.92, 30, 22, fam('military', v));
    if (t >= 3) { const [x, y] = p.P(0.84, 0.8); figure(p, x, y, { tunic: '#5a3a20', skin: '#e8b88a' }); }
    if (t >= 4) logs(p, 0.2, 0.86, 3);
  },
  armory: (p, t, v, o) => {
    hall(p, t, v, { low: 'stone', high: 'stone', roof: fam('military', v), kind: 'tile', u0: 0.14, v0: 0.18, u1: 0.86, v1: 0.8, h1: 26, h2: 20, rh: 26, sym: 'sword', chim: false,
      frontD: (gg, W, H) => { const s = p.s; gg.save(); gg.translate(W * 0.5, H * 0.6); gg.scale(1, -1); SYM.shield(gg, s * 1.4); gg.restore(); } });
    banner(p, 0.92, 0.86, 0, ['#a83a2a', '#f1d36a'], 18);
  },
  quartermaster: (p, t, v, o) => {
    hall(p, t, v, { low: 'planks', roof: fam('military', v), u0: 0.12, v0: 0.12, u1: 0.62, v1: 0.6, h1: 20, h2: 16, rh: 22, sym: 'map', annex: false, active: o.active });
    tent(p, 0.78, 0.68, 0.14, 30, '#a83a2a', '#f6efe0', t >= 3 ? ['#a83a2a', '#f1d36a'] : null);
    crate(p, 0.3, 0.82); crate(p, 0.4, 0.86, 0.06); barrel(p, 0.56, 0.9);
  },
  weaver: (p, t, v, o) => {
    hall(p, t, v, { roof: fam('economy', v), u0: 0.16, v0: 0.14, u1: 0.74, v1: 0.6, h1: 20, h2: 18, rh: 24, sym: 'cloth', active: o.active });
    // fils à linge et étoffes colorées
    const g = p.g, s = p.s; post(p, 0.3, 0.86, 20); post(p, 0.86, 0.86, 20);
    const A = p.P(0.3, 0.86, 19), B = p.P(0.86, 0.86, 19);
    g.strokeStyle = '#5a3a20'; g.lineWidth = 0.8 * s; g.beginPath(); g.moveTo(...A); g.lineTo(...B); g.stroke();
    ['#c84a2e', '#3f74b0', '#e2b84a', '#7a5aa8'].forEach((c, i) => { const tt = 0.12 + i * 0.22, x = A[0] + (B[0] - A[0]) * tt, y = A[1] + (B[1] - A[1]) * tt; g.fillStyle = c; g.beginPath(); g.moveTo(x, y); g.lineTo(x + 9 * s, y + 4.5 * s); g.lineTo(x + 9 * s, y + 16 * s); g.lineTo(x, y + 12 * s); g.closePath(); g.fill(); strokeInk(p, 0.6); });
  },
  carpentry: (p, t, v, o) => {
    hall(p, t, v, { low: 'planks', high: 'planks', roof: fam('economy', v), kind: 'tile', u0: 0.14, v0: 0.14, u1: 0.7, v1: 0.6, h1: 22, h2: 16, rh: 24, sym: 'saw', active: o.active });
    logs(p, 0.6, 0.86, 3); logs(p, 0.28, 0.9, 2);
  },
  tannery: (p, t, v, o) => {
    hall(p, t, v, { low: 'planks', roof: fam('economy', v), kind: 'thatch', u0: 0.12, v0: 0.12, u1: 0.62, v1: 0.56, h1: 20, h2: 16, rh: 22, sym: 'hide', active: o.active });
    // séchoirs à peaux et cuves
    const g = p.g, s = p.s;
    for (const u of [0.7, 0.86]) { post(p, u, 0.66, 20); post(p, u, 0.9, 20); const A = p.P(u, 0.66, 18), B = p.P(u, 0.9, 18); g.fillStyle = '#b08050'; g.beginPath(); g.moveTo(A[0] - 1 * s, A[1] + 2 * s); g.lineTo(B[0] + 1 * s, B[1] + 2 * s); g.lineTo(B[0] + 1 * s, B[1] + 14 * s); g.lineTo(A[0] - 1 * s, A[1] + 12 * s); g.closePath(); g.fill(); strokeInk(p, 0.7); }
    for (const [u, v0, c] of [[0.24, 0.84, '#6a8aa8'], [0.42, 0.88, '#8a6a3a']]) { const [x, y] = p.P(u, v0); g.fillStyle = '#7a5230'; g.beginPath(); g.ellipse(x, y, 9 * s, 4 * s, 0, 0, Math.PI); g.lineTo(x - 9 * s, y - 6 * s); g.ellipse(x, y - 6 * s, 9 * s, 4 * s, 0, Math.PI, 0, true); g.closePath(); g.fill(); strokeInk(p, 0.8); g.fillStyle = c; g.beginPath(); g.ellipse(x, y - 6 * s, 7.5 * s, 3 * s, 0, 0, 7); g.fill(); }
  },
  mill: (p, t, v, o) => {
    if (o.river) {
      hall(p, t, v, { low: 'stone', high: 'timber', roof: fam('economy', v), u0: 0.18, v0: 0.14, u1: 0.72, v1: 0.72, h1: 24, h2: 18, rh: 26, turret: false, active: o.active });
      waterWheel(p, 0.8, 0.44, 22, o.active !== false && !o.animated);
      return;
    }
    roundShadow(p, 0.5, 0.5, 0.2, 100);
    tower(p, 0.5, 0.5, 0.2, 0, 52 + t * 6, { stone: '#f2e4c2', roof: fam('economy', v), roofKind: 'tile', roofH: 30, crenels: false, windows: 2 });
    if (!o.animated) sails(p, 0.5, 0.5, 46 + t * 6, 0.35);
    else { /* ailes animées par la couche de vie */ }
  },
  barracks: (p, t, v) => {
    barracksSheet(p);
    if (t >= 3) tower(p, 0.94, 0.1, 0.09, 0, 64, { roof: fam('military', v), roofKind: 'tile', roofH: 24, windows: 1, flag: t >= 5 ? ['#a83a2a', '#f1d36a'] : null });
  },
  stable: (p, t, v, o) => {
    hall(p, Math.min(t, 1), v, { low: 'planks', roof: fam('military', v), kind: 'tile', u0: 0.08, v0: 0.12, u1: 0.92, v1: 0.5, h1: 22, rh: 22, sym: 'horse', active: false,
      frontG: (gg, W) => { const s = p.s; for (let i = 0; i < 4; i++) { gg.fillStyle = '#3a2418'; gg.fillRect(W * (0.12 + i * 0.22), 0, 12 * s, 14 * s); gg.fillStyle = '#7a4a26'; gg.fillRect(W * (0.12 + i * 0.22), 0, 12 * s, 7 * s); } } });
    fence(p, 0.1, 0.62, 0.9, 0.62, 6); fence(p, 0.9, 0.62, 0.9, 0.96, 3);
    animal(p, 0.36, 0.78, 'horse'); if (t >= 2) animal(p, 0.62, 0.84, 'horse'); if (t >= 4) animal(p, 0.5, 0.92, 'horse');
    const [hx, hy] = p.P(0.18, 0.86); const g = p.g, s = p.s; g.fillStyle = '#e8c868'; g.beginPath(); g.ellipse(hx, hy - 5 * s, 10 * s, 5 * s, 0, 0, 7); g.fill(); strokeInk(p, 0.8);
  },
  workshop: (p, t, v, o) => {
    hall(p, t, v, { low: 'stone', high: 'planks', roof: fam('military', v), u0: 0.1, v0: 0.1, u1: 0.62, v1: 0.52, h1: 22, h2: 16, rh: 24, sym: 'hammer', annex: false, active: o.active });
    // engin de siège (catapulte) dans la cour
    const g = p.g, s = p.s, [x, y] = p.P(0.74, 0.76);
    g.fillStyle = 'rgba(22,30,12,0.3)'; g.beginPath(); g.ellipse(x + 4 * s, y, 18 * s, 6 * s, 0, 0, 7); g.fill();
    g.fillStyle = '#8a5a30'; g.beginPath(); g.moveTo(x - 16 * s, y - 4 * s); g.lineTo(x + 14 * s, y + 4 * s); g.lineTo(x + 14 * s, y - 2 * s); g.lineTo(x - 16 * s, y - 10 * s); g.closePath(); g.fill(); strokeInk(p, 0.9);
    g.strokeStyle = INK; g.lineWidth = 3.2 * s; g.beginPath(); g.moveTo(x - 2 * s, y - 6 * s); g.lineTo(x - 18 * s, y - 34 * s); g.stroke(); g.strokeStyle = '#a0703e'; g.lineWidth = 2 * s; g.stroke();
    g.fillStyle = '#7a7d85'; g.beginPath(); g.arc(x - 19 * s, y - 36 * s, 4 * s, 0, 7); g.fill(); strokeInk(p, 0.8);
    for (const dx of [-12, 10]) { g.fillStyle = '#5a3a20'; g.beginPath(); g.ellipse(x + dx * s, y - 1 * s, 4 * s, 5 * s, 0, 0, 7); g.fill(); g.strokeStyle = '#c9a36a'; g.lineWidth = 0.8 * s; g.stroke(); }
  },
  watchtower: (p, t, v, o) => {
    const H = 70 + t * 8;
    roundShadow(p, 0.5, 0.5, 0.18, H);
    if (t < 2) {
      // tour de guet en bois sur pilotis
      for (const [u, vv] of [[0.36, 0.36], [0.64, 0.36], [0.64, 0.64], [0.36, 0.64]]) post(p, u, vv, H - 14);
      box(p, 0.3, 0.3, 0.7, 0.7, H - 16, H, { G: mat(p, 'planks'), D: mat(p, 'planks') });
      gable(p, 0.3, 0.3, 0.7, 0.7, H, 18, { axis: 'u', color: fam('military', v), kind: 'tile' });
    } else tower(p, 0.5, 0.5, 0.18, 0, H, { roof: fam('military', v), roofKind: 'tile', roofH: 34, windows: 2, flag: t >= 4 ? ['#2f5fb0', '#f1d36a'] : null });
    const [x, y] = p.P(0.5, 0.62, H - 10); if (t >= 3) figure(p, x, y, { tunic: '#2f5fb0', helm: true, spear: true });
  },
  // v21 : hospice — long bâtiment blanc à toit d'ardoise, jardin de simples, bannières à la croix
  hospice: (p, t, v, o) => {
    hall(p, t, v, { low: 'plaster', high: 'plaster', lowC: '#f1e8d6', highC: '#f6efe2', roof: fam('military', v), kind: 'slate', u0: 0.12, v0: 0.22, u1: 0.88, v1: 0.76, h1: 22, h2: 18, rh: 24, sym: 'flask', active: o.active, turret: false });
    const g = p.g, s = p.s;
    for (const [u, vv] of [[0.1, 0.86], [0.92, 0.6]]) {
      banner(p, u, vv, 0, ['#f6efe2', '#c8322a'], 18);
    }
    for (let i = 0; i < 7; i++) { const [x, y] = p.P(0.2 + i * 0.09, 0.9); g.fillStyle = '#4f8a2a'; g.beginPath(); g.arc(x, y - 2 * s, 3 * s, 0, 7); g.fill(); g.fillStyle = i % 2 ? '#f6efe2' : '#b6d4ff'; g.beginPath(); g.arc(x, y - 3.5 * s, 1.3 * s, 0, 7); g.fill(); }
  },
  embassy: (p, t, v, o) => {
    hall(p, t, v, { low: 'stone', high: 'plaster', roof: fam('places', v), kind: 'slate', u0: 0.14, v0: 0.18, u1: 0.86, v1: 0.78, h1: 24, h2: 20, rh: 28, sym: 'scale', active: o.active });
    banner(p, 0.08, 0.9, 0, ['#2f5fb0', '#f1d36a'], 16); banner(p, 0.3, 0.94, 0, ['#4f8a3a', '#f6efe0'], 16); banner(p, 0.94, 0.62, 0, ['#a83a2a', '#f6efe0'], 16);
  },
  cartographer: (p, t, v, o) => {
    hall(p, t, v, { roof: fam('places', v), u0: 0.18, v0: 0.2, u1: 0.82, v1: 0.78, h1: 22, h2: 18, rh: 26, sym: 'map', active: o.active, turret: false });
    if (t >= 3) { const g = p.g, s = p.s, [x, y] = p.P(0.84, 0.86); g.fillStyle = '#5a3a20'; g.fillRect(x - 1.5 * s, y - 14 * s, 3 * s, 14 * s); const gr = g.createRadialGradient(x - 3 * s, y - 22 * s, 1 * s, x, y - 19 * s, 7 * s); gr.addColorStop(0, '#8ad0ff'); gr.addColorStop(1, '#2a6a3a'); g.fillStyle = gr; g.beginPath(); g.arc(x, y - 19 * s, 7 * s, 0, 7); g.fill(); strokeInk(p, 0.9); }
  },
  herald: (p, t, v, o) => {
    tent(p, 0.5, 0.42, 0.24, 40 + t * 4, fam('places', v), '#f6efe0', ['#2f5fb0', '#f1d36a']);
    banner(p, 0.12, 0.9, 0, ['#a83a2a', '#f1d36a'], 16); banner(p, 0.9, 0.86, 0, ['#2f5fb0', '#f1d36a'], 16);
    const [x, y] = p.P(0.56, 0.86); figure(p, x, y, { tunic: '#e2b84a', hat: '#a83a2a' });
  },
  lists: (p, t, v, o) => {
    fence(p, 0.08, 0.3, 0.92, 0.3, 7); fence(p, 0.08, 0.7, 0.92, 0.7, 7);
    const g = p.g, s = p.s; g.strokeStyle = '#a83a2a'; g.lineWidth = 2 * s; g.beginPath(); g.moveTo(...p.P(0.1, 0.5, 8)); g.lineTo(...p.P(0.9, 0.5, 8)); g.stroke();
    tent(p, 0.18, 0.12, 0.1, 26, '#3f74b0', '#f6efe0', ['#3f74b0', '#f1d36a']); tent(p, 0.86, 0.14, 0.1, 26, '#a83a2a', '#f6efe0', ['#a83a2a', '#f1d36a']);
    animal(p, 0.3, 0.56, 'horse'); animal(p, 0.7, 0.44, 'horse');
  },
  scriptorium: (p, t, v, o) => {
    hall(p, t, v, { low: 'stone', high: 'stone', roof: fam('knowledge', v), kind: 'slate', u0: 0.18, v0: 0.2, u1: 0.82, v1: 0.8, h1: 26, h2: 20, rh: 30, sym: 'quill', active: o.active });
  },
  sanctuary: (p, t, v, o) => {
    hall(p, Math.min(t, 1), v, { low: 'stone', roof: fam('places', v), kind: 'slate', u0: 0.22, v0: 0.3, u1: 0.78, v1: 0.84, h1: 30, rh: 30, sym: 'crystal', annex: false, chim: false });
    tower(p, 0.3, 0.2, 0.1, 0, 70 + t * 6, { roof: fam('places', v), roofH: 34, crenels: false, windows: 1 });
    const g = p.g, s = p.s, [x, y] = p.P(0.82, 0.88); g.save(); g.translate(x, y - 10 * s); SYM.crystal(g, s * 1.6); g.restore();
  },
  monument: (p, t, v, o) => {
    const lv = Math.max(1, o.level || t + 1), steps = Math.min(5, lv);
    for (let i = 0; i < steps; i++) { const m = 0.08 + i * 0.06; box(p, m, m, 1 - m, 1 - m, i * 6, i * 6 + 6, { G: mat(p, 'stone', '#e8dcc2'), D: mat(p, 'stone', '#e8dcc2'), top: '#efe6d0' }); }
    const z = steps * 6;
    box(p, 0.42, 0.42, 0.58, 0.58, z, z + 50 + lv * 4, { G: mat(p, 'stone', '#f2ead8'), D: mat(p, 'stone', '#f2ead8') });
    cone(p, 0.5, 0.5, 0.09, z + 50 + lv * 4, 18, PAL.gold, 'slate');
  },
  farm: (p, t, v, o) => {
    farmSheet(p);
    if (p.onlyGround) return;
    if (t >= 3) { box(p, 0.06, 0.52, 0.2, 0.66, 0, 20, { G: mat(p, 'planks', '#a8402a'), D: mat(p, 'planks', '#a8402a') }); gable(p, 0.05, 0.51, 0.21, 0.67, 20, 12, { axis: 'v', color: PAL.brown, kind: 'shingle', o: 0.02 }); }
    if (t >= 5) banner(p, 0.46, 0.08, 0, ['#2f5fb0', '#f1d36a'], 16);
  },
  pasture: (p, t, v, o) => {
    hall(p, Math.min(t, 1), v, { low: 'planks', roof: PAL.brown, kind: 'thatch', u0: 0.08, v0: 0.08, u1: 0.4, v1: 0.4, h1: 18, rh: 20, annex: false, chim: false });
    fence(p, 0.5, 0.06, 0.96, 0.06, 4); fence(p, 0.96, 0.06, 0.96, 0.96, 6); fence(p, 0.06, 0.96, 0.96, 0.96, 6);
    const n = 2 + Math.min(4, t);
    for (let i = 0; i < n; i++) animal(p, 0.55 + (i % 3) * 0.14, 0.42 + Math.floor(i / 3) * 0.22, i % 3 === 2 ? 'cow' : 'sheep');
  },
  orchard: (p, t, v, o) => {
    const n = 3 + Math.min(3, t);
    const spots = [[0.25, 0.25], [0.7, 0.25], [0.25, 0.7], [0.7, 0.7], [0.48, 0.48], [0.9, 0.5]];
    spots.slice(0, n).sort((a, b) => a[0] + a[1] - b[0] - b[1]).forEach(([u, vv]) => tree(p, u, vv, { season: o.season, fruit: v % 2 ? '#e8484a' : '#f0a020', size: 0.9 }));
    if (t >= 2) cart(p, 0.86, 0.86, '#e8484a');
  },
  sawmill: (p, t, v, o) => {
    hall(p, t, v, { low: 'planks', high: 'planks', roof: fam('economy', v), kind: 'tile', u0: 0.14, v0: 0.14, u1: 0.68, v1: 0.6, h1: 22, h2: 16, rh: 22, sym: 'saw', active: o.active });
    logs(p, 0.6, 0.86, 3); logs(p, 0.26, 0.88, 3); if (t >= 2) logs(p, 0.84, 0.66, 2);
  },
  quarry: (p, t, v, o) => {
    const g = p.g, s = p.s;
    const pit = [p.P(0.12, 0.3), p.P(0.7, 0.3), p.P(0.7, 0.88), p.P(0.12, 0.88)];
    poly(g, pit); const gr = g.createLinearGradient(...p.P(0.12, 0.3), ...p.P(0.7, 0.88)); gr.addColorStop(0, '#8a8278'); gr.addColorStop(1, '#bdb4a4'); g.fillStyle = gr; g.fill(); strokeInk(p, 1);
    box(p, 0.12, 0.3, 0.7, 0.36, 0, 18, { G: mat(p, 'stone', '#b8b0a2'), D: mat(p, 'stone', '#b8b0a2') });
    box(p, 0.64, 0.3, 0.7, 0.88, 0, 18, { G: mat(p, 'stone', '#b8b0a2'), D: mat(p, 'stone', '#b8b0a2') });
    for (const [u, vv] of [[0.24, 0.62], [0.42, 0.7], [0.3, 0.78]]) box(p, u, vv, u + 0.1, vv + 0.08, 0, 9, { G: mat(p, 'stone', '#e8e2d6'), D: mat(p, 'stone', '#e8e2d6'), top: '#f2eee6' });
    // grue de bois
    post(p, 0.86, 0.5, 46); const A = p.P(0.86, 0.5, 46), B = p.P(0.56, 0.5, 52); g.strokeStyle = INK; g.lineWidth = 3.4 * s; g.beginPath(); g.moveTo(...A); g.lineTo(...B); g.stroke(); g.strokeStyle = '#8a5a30'; g.lineWidth = 2 * s; g.stroke();
    g.strokeStyle = '#3a2a1c'; g.lineWidth = 0.8 * s; g.beginPath(); g.moveTo(...B); g.lineTo(B[0], B[1] + 26 * s); g.stroke();
    const [x, y] = p.P(0.84, 0.76); figure(p, x, y, { tunic: '#7a5a3a', skin: '#e8b88a' });
  },
  mine: (p, t, v, o) => {
    const g = p.g, s = p.s;
    rock(p, 0.42, 0.4, 1.2 + t * 0.06);
    const [x, y] = p.P(0.62, 0.66, 0);
    g.fillStyle = '#1a120c'; g.beginPath(); g.moveTo(x - 12 * s, y); g.lineTo(x - 12 * s, y - 16 * s); g.quadraticCurveTo(x, y - 26 * s, x + 12 * s, y - 16 * s); g.lineTo(x + 12 * s, y); g.closePath(); g.fill();
    g.strokeStyle = '#7a4a26'; g.lineWidth = 3 * s; g.beginPath(); g.moveTo(x - 12 * s, y); g.lineTo(x - 12 * s, y - 17 * s); g.lineTo(x + 12 * s, y - 17 * s); g.lineTo(x + 12 * s, y); g.stroke();
    g.strokeStyle = '#5a5d65'; g.lineWidth = 1.2 * s; for (const d of [-4, 4]) { g.beginPath(); g.moveTo(x + d * s, y); g.lineTo(x + (d * 1.6 + 18) * s, y + 14 * s); g.stroke(); }
    cart(p, 0.84, 0.9, '#5d6672');
    if (t >= 3) { const [fx, fy] = p.P(0.4, 0.86); figure(p, fx, fy, { tunic: '#5a5d65', hat: '#3a2a1c' }); }
  },
  hunter: (p, t, v, o) => {
    hall(p, t, v, { low: 'planks', high: 'planks', lowC: '#8a5a32', roof: PAL.brown, kind: 'thatch', u0: 0.16, v0: 0.16, u1: 0.7, v1: 0.66, h1: 20, h2: 14, rh: 22, sym: 'bow', active: o.active });
    tree(p, 0.86, 0.3, { season: o.season, kind: 'pine', size: 0.9 });
    const g = p.g, s = p.s; post(p, 0.82, 0.86, 18); post(p, 0.58, 0.9, 18); g.strokeStyle = '#5a3a20'; g.lineWidth = 1.4 * s; g.beginPath(); g.moveTo(...p.P(0.82, 0.86, 17)); g.lineTo(...p.P(0.58, 0.9, 17)); g.stroke();
    const [hx, hy] = p.P(0.7, 0.88, 16); g.save(); g.translate(hx, hy + 6 * s); SYM.hide(g, s); g.restore();
  },
  herbalist: (p, t, v, o) => {
    hall(p, t, v, { low: 'plaster', roof: PAL.thatch, kind: 'thatch', u0: 0.12, v0: 0.12, u1: 0.56, v1: 0.52, h1: 18, h2: 14, rh: 22, sym: 'leaf', active: o.active });
    const g = p.g, s = p.s;
    for (let i = 0; i < 3; i++) { const u0 = 0.6, v0 = 0.12 + i * 0.28; const pts = [p.P(u0, v0), p.P(0.94, v0), p.P(0.94, v0 + 0.2), p.P(u0, v0 + 0.2)]; poly(g, pts); g.fillStyle = '#7a5230'; g.fill(); strokeInk(p, 0.8); for (let k = 0; k < 6; k++) { const [x, y] = p.P(u0 + 0.04 + (k % 3) * 0.1, v0 + 0.06 + Math.floor(k / 3) * 0.08); g.fillStyle = ['#5aa83a', '#8ac04a', '#c86aa8'][(k + i) % 3]; g.beginPath(); g.arc(x, y - 2 * s, 3 * s, 0, 7); g.fill(); } }
    for (let i = 0; i < 3; i++) { const u0 = 0.14 + i * 0.16; const [x, y] = p.P(u0, 0.82); g.fillStyle = '#5aa83a'; g.beginPath(); g.arc(x, y - 3 * s, 4 * s, 0, 7); g.fill(); g.fillStyle = '#f0d85a'; g.beginPath(); g.arc(x + 1 * s, y - 5 * s, 1.3 * s, 0, 7); g.fill(); }
  },
  charcoal: (p, t, v, o) => {
    hall(p, Math.min(t, 1), v, { low: 'planks', roof: PAL.brown, kind: 'thatch', u0: 0.1, v0: 0.1, u1: 0.42, v1: 0.42, h1: 16, rh: 18, annex: false, chim: false });
    const g = p.g, s = p.s;
    for (const [u, vv, r] of [[0.66, 0.62, 0.2], [0.3, 0.76, 0.13]]) { const [x, y] = p.P(u, vv); const rx = r * 90.5 * s, ry = r * 45.25 * s; g.fillStyle = 'rgba(22,30,12,0.3)'; g.beginPath(); g.ellipse(x + 4 * s, y, rx, ry, 0, 0, 7); g.fill(); const gr = g.createRadialGradient(x - rx * 0.3, y - rx * 0.5, 1 * s, x, y - rx * 0.2, rx * 1.2); gr.addColorStop(0, '#6a5a4a'); gr.addColorStop(1, '#2a221c'); g.fillStyle = gr; g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, Math.PI); g.ellipse(x, y, rx, rx * 0.65, 0, Math.PI, 0); g.closePath(); g.fill(); strokeInk(p, 0.9); if (o.active !== false) smoke(p, x, y - rx * 0.7, 4); }
    logs(p, 0.86, 0.9, 2);
  },
  fishery: (p, t, v, o) => {
    const g = p.g, s = p.s;
    for (const [u, vv] of [[0.2, 0.2], [0.6, 0.2], [0.6, 0.62], [0.2, 0.62]]) post(p, u, vv, 12);
    hall(p, t, v, { low: 'planks', high: 'planks', roof: PAL.brown, kind: 'shingle', u0: 0.16, v0: 0.16, u1: 0.64, v1: 0.66, h1: 18, h2: 14, rh: 22, sym: 'fish', active: o.active });
    // ponton et filets
    poly(g, [p.P(0.64, 0.7), p.P(0.96, 0.7), p.P(0.96, 0.86), p.P(0.64, 0.86)]); g.fillStyle = '#a0703e'; g.fill(); strokeInk(p, 0.8);
    const [nx, ny] = p.P(0.84, 0.4); g.strokeStyle = 'rgba(60,40,20,.7)'; g.lineWidth = 0.6 * s; for (let i = 0; i < 6; i++) { g.beginPath(); g.moveTo(nx - 10 * s + i * 4 * s, ny - 16 * s); g.lineTo(nx - 12 * s + i * 4 * s, ny); g.stroke(); g.beginPath(); g.moveTo(nx - 12 * s, ny - 16 * s + i * 3 * s); g.lineTo(nx + 12 * s, ny - 16 * s + i * 3 * s); g.stroke(); }
  },
  port: (p, t, v, o) => {
    const g = p.g, s = p.s;
    poly(g, [p.P(0.05, 0.4), p.P(0.95, 0.4), p.P(0.95, 0.62), p.P(0.05, 0.62)]); g.fillStyle = '#a0703e'; g.fill(); strokeInk(p, 1);
    for (let u = 0.08; u < 0.95; u += 0.12) post(p, u, 0.62, 8);
    hall(p, Math.min(t, 2), v, { low: 'planks', roof: fam('economy', v), u0: 0.1, v0: 0.06, u1: 0.56, v1: 0.36, h1: 20, h2: 14, rh: 20, sym: 'coin', annex: false, active: o.active });
    // bateau à voile
    const [x, y] = p.P(0.6, 0.82);
    g.fillStyle = '#7a4a26'; g.beginPath(); g.moveTo(x - 22 * s, y - 6 * s); g.quadraticCurveTo(x, y + 8 * s, x + 24 * s, y - 2 * s); g.lineTo(x + 20 * s, y - 10 * s); g.lineTo(x - 18 * s, y - 14 * s); g.closePath(); g.fill(); strokeInk(p, 1);
    g.strokeStyle = INK; g.lineWidth = 2.2 * s; g.beginPath(); g.moveTo(x, y - 10 * s); g.lineTo(x, y - 46 * s); g.stroke();
    g.fillStyle = '#f6efe0'; g.beginPath(); g.moveTo(x + 1 * s, y - 44 * s); g.quadraticCurveTo(x + 18 * s, y - 30 * s, x + 2 * s, y - 14 * s); g.closePath(); g.fill(); strokeInk(p, 0.9);
    g.fillStyle = '#c84a2e'; g.fillRect(x + 1 * s, y - 34 * s, 8 * s, 3 * s);
  },
};
PAINT.castle_ = PAINT.castle;

function rock(p, u, v, size = 1) {
  const g = p.g, s = p.s * size, [x, y] = p.P(u, v);
  g.fillStyle = 'rgba(22,30,12,0.25)'; g.beginPath(); g.ellipse(x + 4 * s, y + 2 * s, 32 * s, 10 * s, 0, 0, 7); g.fill();
  const faces = [
    [[x - 30 * s, y], [x - 18 * s, y - 30 * s], [x - 2 * s, y - 40 * s], [x + 6 * s, y - 22 * s], [x - 4 * s, y + 4 * s]],
    [[x - 4 * s, y + 4 * s], [x + 6 * s, y - 22 * s], [x - 2 * s, y - 40 * s], [x + 22 * s, y - 28 * s], [x + 32 * s, y - 2 * s]],
  ];
  const cols = [['#c4b8a4', '#9a8e7a'], ['#8a7e6c', '#665c4c']];
  faces.forEach((f, i) => { poly(g, f); const gr = g.createLinearGradient(f[0][0], f[0][1] - 30 * s, f[2][0], f[2][1] + 30 * s); gr.addColorStop(0, cols[i][0]); gr.addColorStop(1, cols[i][1]); g.fillStyle = gr; g.fill(); strokeInk({ g, s: p.s }, 1); });
  g.strokeStyle = rgba('#fff4d6', 0.4); g.lineWidth = 1 * p.s; g.beginPath(); g.moveTo(x - 18 * s, y - 30 * s); g.lineTo(x - 2 * s, y - 40 * s); g.stroke();
}
// Roue à aubes (statique ; la couche de vie peut la faire tourner)
export function waterWheel(p, u, v, z, spin = false, angle = 0) {
  const g = p.g, s = p.s, [x, y] = p.P(u, v, z), R = 17 * s;
  g.save(); g.translate(x, y); g.scale(0.55, 1);
  g.strokeStyle = INK; g.lineWidth = 5 * s; g.beginPath(); g.arc(0, 0, R, 0, 7); g.stroke();
  g.strokeStyle = '#8a5a30'; g.lineWidth = 3 * s; g.stroke();
  for (let i = 0; i < 8; i++) { const a = angle + (i * Math.PI) / 4; g.strokeStyle = '#6b4226'; g.lineWidth = 2.2 * s; g.beginPath(); g.moveTo(0, 0); g.lineTo(Math.cos(a) * R, Math.sin(a) * R); g.stroke(); g.fillStyle = '#a0703e'; g.fillRect(Math.cos(a) * R - 3 * s, Math.sin(a) * R - 3 * s, 6 * s, 6 * s); }
  g.restore();
  void spin;
}
// Ailes de moulin (statiques ici ; la couche de vie les redessine en mouvement)
export function sails(p, u, v, z, angle = 0.35) {
  const g = p.g, s = p.s, [x, y] = p.P(u, v, z);
  const cx = x - 10 * s, cy = y + 6 * s;
  for (let i = 0; i < 4; i++) {
    const a = angle + (i * Math.PI) / 2, c = Math.cos(a), sn = Math.sin(a);
    const L = 40 * s, w = 8 * s;
    const tip = [cx + c * L, cy + sn * L * 0.9];
    g.strokeStyle = INK; g.lineWidth = 2.6 * s; g.beginPath(); g.moveTo(cx, cy); g.lineTo(...tip); g.stroke(); g.strokeStyle = '#6b4226'; g.lineWidth = 1.4 * s; g.stroke();
    const nx = -sn * w, ny = c * w * 0.9;
    g.beginPath(); g.moveTo(cx + c * 10 * s, cy + sn * 9 * s); g.lineTo(...tip); g.lineTo(tip[0] + nx, tip[1] + ny); g.lineTo(cx + c * 10 * s + nx, cy + sn * 9 * s + ny); g.closePath();
    g.fillStyle = '#f6efe0'; g.fill(); g.strokeStyle = '#8a6a40'; g.lineWidth = 0.8 * s; g.stroke();
    g.strokeStyle = 'rgba(120,90,50,.5)'; for (let k = 1; k < 4; k++) { const tt = 0.25 + k * 0.18; g.beginPath(); g.moveTo(cx + c * L * tt, cy + sn * L * 0.9 * tt); g.lineTo(cx + c * L * tt + nx, cy + sn * L * 0.9 * tt + ny); g.stroke(); }
  }
  g.fillStyle = '#5a3a20'; g.beginPath(); g.arc(cx, cy, 3.5 * s, 0, 7); g.fill(); strokeInk(p, 0.8);
}

// ───────── Décor de la campagne ─────────
export function scenery(p, ter, v = 0, season = 'summer') {
  if (ter === 'forest') {
    const r = rng(v * 13 + 5);
    const spots = [[0.3, 0.3], [0.7, 0.32], [0.32, 0.72], [0.72, 0.7], [0.5, 0.5]].slice(0, 3 + (v % 3));
    spots.sort((a, b) => a[0] + a[1] - b[0] - b[1]).forEach(([u, vv], i) => tree(p, u + r.range(-0.06, 0.06), vv + r.range(-0.06, 0.06), { season, kind: (v + i) % 3 === 0 || season === 'winter' ? 'pine' : 'round', size: r.range(0.85, 1.15), r }));
  } else if (ter === 'mountain') {
    const g = p.g, s = p.s, [x, y] = p.P(0.5, 0.62);
    const h = (56 + (v % 4) * 8) * s, w = 58 * s;
    g.fillStyle = 'rgba(22,30,12,0.3)'; g.beginPath(); g.ellipse(x + 10 * s, y + 4 * s, w, 16 * s, 0, 0, 7); g.fill();
    const L = [[x - w, y + 6 * s], [x - 10 * s, y - h], [x + 2 * s, y - h + 6 * s], [x - 4 * s, y + 14 * s]];
    const R = [[x - 4 * s, y + 14 * s], [x + 2 * s, y - h + 6 * s], [x + 18 * s, y - h * 0.6], [x + w, y + 4 * s]];
    poly(g, L); let gr = g.createLinearGradient(x - w, y - h, x, y); gr.addColorStop(0, '#c8bca8'); gr.addColorStop(1, '#9a8e7a'); g.fillStyle = gr; g.fill(); strokeInk(p, 1.1);
    poly(g, R); gr = g.createLinearGradient(x, y - h, x + w, y); gr.addColorStop(0, '#8a7e6c'); gr.addColorStop(1, '#5a5244'); g.fillStyle = gr; g.fill(); strokeInk(p, 1.1);
    poly(g, [[x - 22 * s, y - h * 0.62], [x - 10 * s, y - h], [x + 2 * s, y - h + 6 * s], [x + 12 * s, y - h * 0.7], [x + 2 * s, y - h * 0.6], [x - 8 * s, y - h * 0.72]]); g.fillStyle = season === 'summer' ? '#f6f8fa' : '#ffffff'; g.fill(); strokeInk(p, 0.8);
  } else if (ter === 'rubble') {
    const g = p.g, s = p.s, r = rng(v * 7 + 1);
    for (let i = 0; i < 5; i++) { const [x, y] = p.P(0.25 + r() * 0.5, 0.25 + r() * 0.5); g.fillStyle = r() < 0.5 ? '#b8ac98' : '#9a8e7a'; g.beginPath(); g.moveTo(x - 7 * s, y); g.lineTo(x - 4 * s, y - 7 * s); g.lineTo(x + 5 * s, y - 6 * s); g.lineTo(x + 8 * s, y); g.closePath(); g.fill(); strokeInk(p, 0.8); }
    const [bx, by] = p.P(0.6, 0.4); g.save(); g.translate(bx, by); g.rotate(-0.4); g.fillStyle = '#6b4226'; g.fillRect(-16 * s, -3 * s, 32 * s, 5 * s); g.strokeStyle = INK; g.lineWidth = 0.8 * s; g.strokeRect(-16 * s, -3 * s, 32 * s, 5 * s); g.restore();
  }
}

// ───────── Routes, terrains vagues, échafaudages, décorations, trophées ─────────
export function road(p) {
  const g = p.g, s = p.s, r = rng(3);
  const pts = [p.P(0.06, 0.06), p.P(0.94, 0.06), p.P(0.94, 0.94), p.P(0.06, 0.94)];
  g.save(); poly(g, pts); g.clip();
  const [cx, cy] = p.P(0.5, 0.5); g.fillStyle = '#a89878'; g.fillRect(cx - 70 * s, cy - 40 * s, 140 * s, 80 * s);
  for (let y = -34; y < 34; y += 5) for (let x = -62 + (y % 10 ? 3 : 0); x < 62; x += 7) { g.fillStyle = lit('#c4b494', r.range(-0.12, 0.12)); g.beginPath(); g.ellipse(cx + x * s, cy + y * s, 3.1 * s, 1.9 * s, 0, 0, 7); g.fill(); }
  g.restore(); poly(g, pts); g.strokeStyle = rgba('#5a4a30', 0.5); g.lineWidth = 1 * s; g.stroke();
}
export function lot(p) {
  const g = p.g, s = p.s;
  const pts = [p.P(0.1, 0.1), p.P(0.9, 0.1), p.P(0.9, 0.9), p.P(0.1, 0.9)];
  poly(g, pts); g.fillStyle = 'rgba(201,163,106,.45)'; g.fill(); g.setLineDash([5 * s, 4 * s]); g.strokeStyle = '#6b4a26'; g.lineWidth = 1.4 * s; g.stroke(); g.setLineDash([]);
  const [x, y] = p.P(0.5, 0.55);
  g.strokeStyle = INK; g.lineWidth = 3.4 * s; g.beginPath(); g.moveTo(x, y); g.lineTo(x, y - 32 * s); g.stroke(); g.strokeStyle = '#7a4a26'; g.lineWidth = 2 * s; g.stroke();
  g.fillStyle = '#c9a36a'; g.beginPath(); g.roundRect(x - 18 * s, y - 50 * s, 36 * s, 20 * s, 3 * s); g.fill(); strokeInk(p, 1);
  g.fillStyle = '#5a3a20'; g.fillRect(x - 12 * s, y - 43 * s, 24 * s, 2 * s); g.fillRect(x - 12 * s, y - 38 * s, 16 * s, 2 * s);
  stakes(p);
}
function stakes(p) { const g = p.g, s = p.s; for (const [u, v] of [[0.1, 0.1], [0.9, 0.1], [0.9, 0.9], [0.1, 0.9]]) { const [x, y] = p.P(u, v); g.fillStyle = '#d8b47a'; g.fillRect(x - 1.2 * s, y - 8 * s, 2.4 * s, 8 * s); g.fillStyle = '#c84a2e'; g.fillRect(x - 1.2 * s, y - 8 * s, 2.4 * s, 2 * s); } }
export function scaffold(p, height = 60) {
  const g = p.g, s = p.s;
  const corners = [[0.12, 0.12], [0.88, 0.12], [0.88, 0.88], [0.12, 0.88]];
  for (const [u, v] of corners) post(p, u, v, height, '#c9a36a');
  g.strokeStyle = INK; g.lineWidth = 2.8 * s;
  for (const z of [height * 0.35, height * 0.7, height]) {
    g.beginPath(); g.moveTo(...p.P(0.12, 0.88, z)); g.lineTo(...p.P(0.88, 0.88, z)); g.lineTo(...p.P(0.88, 0.12, z)); g.stroke();
  }
  g.strokeStyle = '#c9a36a'; g.lineWidth = 1.6 * s;
  for (const z of [height * 0.35, height * 0.7, height]) { g.beginPath(); g.moveTo(...p.P(0.12, 0.88, z)); g.lineTo(...p.P(0.88, 0.88, z)); g.lineTo(...p.P(0.88, 0.12, z)); g.stroke(); }
  g.beginPath(); g.moveTo(...p.P(0.12, 0.88, 0)); g.lineTo(...p.P(0.88, 0.88, height * 0.7)); g.moveTo(...p.P(0.88, 0.88, 0)); g.lineTo(...p.P(0.88, 0.12, height * 0.7)); g.stroke();
  // planches et un ouvrier
  poly(g, [p.P(0.12, 0.8, height * 0.35), p.P(0.88, 0.8, height * 0.35), p.P(0.88, 0.92, height * 0.35), p.P(0.12, 0.92, height * 0.35)]); g.fillStyle = '#b3824c'; g.fill(); strokeInk(p, 0.8);
  const [x, y] = p.P(0.5, 0.86, height * 0.35); figure(p, x, y, { tunic: '#7a5a3a', hat: '#e2b84a' });
}
const DECO_KIND = { '⛲': 'fountain', '🗿': 'statue', '🌳': 'tree', '🌷': 'flowers', '🌸': 'flowers', '🏮': 'lantern', '⛩️': 'arch', '🗽': 'statue', '🪦': 'statue', '🏺': 'urn', '🎪': 'tent', '🌲': 'pine' };
export function deco(p, icon = '🗿', season = 'summer') {
  const g = p.g, s = p.s, k = DECO_KIND[icon] || 'statue';
  if (k === 'tree' || k === 'pine') return tree(p, 0.5, 0.55, { season, kind: k === 'pine' ? 'pine' : 'round' });
  if (k === 'tent') return tent(p, 0.5, 0.5, 0.18, 30, '#7a5aa8');
  if (k === 'flowers') { const r = rng(9); for (let i = 0; i < 14; i++) { const [x, y] = p.P(0.25 + r() * 0.5, 0.25 + r() * 0.5); g.fillStyle = '#4f8a2a'; g.beginPath(); g.arc(x, y - 2 * s, 3 * s, 0, 7); g.fill(); g.fillStyle = r.pick(['#e8484a', '#ffd95a', '#f08aa0', '#b6d4ff']); g.beginPath(); g.arc(x, y - 4 * s, 1.8 * s, 0, 7); g.fill(); } return; }
  // socle commun
  roundShadow(p, 0.5, 0.5, 0.2, 30);
  box(p, 0.32, 0.32, 0.68, 0.68, 0, 8, { G: mat(p, 'stone', '#e8dcc2'), D: mat(p, 'stone', '#e8dcc2'), top: '#efe6d0' });
  if (k === 'fountain') {
    const [x, y] = p.P(0.5, 0.5, 8), rx = 22 * s, ry = 11 * s;
    g.fillStyle = '#d8ccb2'; g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, 7); g.fill(); strokeInk(p, 1);
    g.fillStyle = '#4aa8d8'; g.beginPath(); g.ellipse(x, y - 1 * s, rx - 4 * s, ry - 2 * s, 0, 0, 7); g.fill();
    g.fillStyle = '#e8dcc2'; g.fillRect(x - 2.5 * s, y - 22 * s, 5 * s, 20 * s); g.strokeStyle = INK; g.lineWidth = 0.8 * s; g.strokeRect(x - 2.5 * s, y - 22 * s, 5 * s, 20 * s);
    g.strokeStyle = 'rgba(200,240,255,.9)'; g.lineWidth = 1.6 * s; for (const d of [-1, 1]) { g.beginPath(); g.moveTo(x, y - 22 * s); g.quadraticCurveTo(x + d * 10 * s, y - 30 * s, x + d * 14 * s, y - 4 * s); g.stroke(); }
    return;
  }
  if (k === 'lantern') { post(p, 0.5, 0.5, 40); const [x, y] = p.P(0.5, 0.5, 40); g.fillStyle = '#ffcf6a'; g.beginPath(); g.roundRect(x - 4 * s, y - 2 * s, 8 * s, 10 * s, 2 * s); g.fill(); strokeInk(p, 0.8); return; }
  if (k === 'urn') { const [x, y] = p.P(0.5, 0.5, 8); g.fillStyle = '#c47a2c'; g.beginPath(); g.ellipse(x, y - 10 * s, 9 * s, 11 * s, 0, 0, 7); g.fill(); strokeInk(p, 0.9); return; }
  // statue (silhouette de chevalier en bronze)
  const [x, y] = p.P(0.5, 0.5, 8);
  const gr = g.createLinearGradient(x - 8 * s, 0, x + 8 * s, 0); gr.addColorStop(0, '#9ac4a8'); gr.addColorStop(1, '#4a7a62');
  g.fillStyle = gr;
  g.beginPath(); g.moveTo(x - 7 * s, y); g.lineTo(x - 6 * s, y - 22 * s); g.lineTo(x - 3 * s, y - 30 * s); g.lineTo(x + 3 * s, y - 30 * s); g.lineTo(x + 6 * s, y - 22 * s); g.lineTo(x + 7 * s, y); g.closePath(); g.fill(); strokeInk(p, 0.9);
  g.beginPath(); g.arc(x, y - 34 * s, 4.5 * s, 0, 7); g.fill(); strokeInk(p, 0.9);
  g.strokeStyle = INK; g.lineWidth = 2.4 * s; g.beginPath(); g.moveTo(x + 8 * s, y - 4 * s); g.lineTo(x + 8 * s, y - 40 * s); g.stroke(); g.strokeStyle = '#7aa890'; g.lineWidth = 1.2 * s; g.stroke();
}
export function trophy(p, shape = 'obelisk', color = PAL.gold) {
  const g = p.g, s = p.s;
  roundShadow(p, 0.5, 0.5, 0.22, 60);
  box(p, 0.28, 0.28, 0.72, 0.72, 0, 10, { G: mat(p, 'stone', '#e8dcc2'), D: mat(p, 'stone', '#e8dcc2'), top: '#efe6d0' });
  if (shape === 'obelisk') { box(p, 0.42, 0.42, 0.58, 0.58, 10, 76, { G: mat(p, 'stone', '#f2ead8'), D: mat(p, 'stone', '#f2ead8') }); cone(p, 0.5, 0.5, 0.09, 76, 14, color, 'slate'); return; }
  if (shape === 'banner') { banner(p, 0.42, 0.58, 10, [color, lit(color, 0.4)], 28); banner(p, 0.6, 0.42, 10, [lit(color, -0.2), lit(color, 0.4)], 22); return; }
  if (shape === 'arch') {
    box(p, 0.3, 0.44, 0.4, 0.56, 10, 60, { G: mat(p, 'stone'), D: mat(p, 'stone') }); box(p, 0.6, 0.44, 0.7, 0.56, 10, 60, { G: mat(p, 'stone'), D: mat(p, 'stone') });
    box(p, 0.28, 0.42, 0.72, 0.58, 60, 72, { G: (gg, W, H, k) => { MAT.stone(gg, W, H, p, PAL.stone, k); gg.fillStyle = color; gg.fillRect(0, H * 0.35, W, H * 0.3); }, D: mat(p, 'stone'), top: lit(PAL.stone, 0.05) }); return;
  }
  if (shape === 'column') { tower(p, 0.5, 0.5, 0.08, 10, 70, { roof: null, crenels: false, windows: 0, stone: '#f2ead8' }); const [x, y] = p.P(0.5, 0.5, 72); g.fillStyle = color; g.beginPath(); g.arc(x, y - 6 * s, 7 * s, 0, 7); g.fill(); strokeInk(p, 1); return; }
  // v21 : croix du soigneur, épée brisée de la ligue, boucliers des frères d'armes, châsse du reliquaire
  if (shape === 'cross') {
    box(p, 0.46, 0.46, 0.54, 0.54, 10, 70, { G: mat(p, 'stone', '#f2ead8'), D: mat(p, 'stone', '#f2ead8') });
    const [x, y] = p.P(0.5, 0.5, 52);
    g.fillStyle = '#f6efe2'; g.beginPath(); g.roundRect(x - 13 * s, y - 15 * s, 26 * s, 26 * s, 5 * s); g.fill(); strokeInk(p, 1.1);
    g.fillStyle = color; g.fillRect(x - 3.5 * s, y - 11 * s, 7 * s, 18 * s); g.fillRect(x - 9 * s, y - 5.5 * s, 18 * s, 7 * s);
    return;
  }
  if (shape === 'sword') {
    const [x, y] = p.P(0.5, 0.5, 10);
    g.save(); g.translate(x, y - 4 * s); g.rotate(-0.35);
    g.fillStyle = '#cfd6de'; g.beginPath(); g.moveTo(-3 * s, 0); g.lineTo(3 * s, 0); g.lineTo(2.5 * s, -30 * s); g.lineTo(-1 * s, -36 * s); g.lineTo(-2.5 * s, -30 * s); g.closePath(); g.fill(); strokeInk(p, 1);
    g.fillStyle = color; g.fillRect(-11 * s, -42 * s, 22 * s, 5 * s); g.strokeStyle = INK; g.lineWidth = 1 * s; g.strokeRect(-11 * s, -42 * s, 22 * s, 5 * s);
    g.fillStyle = '#5a3a20'; g.fillRect(-2 * s, -56 * s, 4 * s, 14 * s); g.fillStyle = PAL.gold; g.beginPath(); g.arc(0, -58 * s, 3.5 * s, 0, 7); g.fill(); strokeInk(p, 0.8);
    g.restore();
    g.fillStyle = '#cfd6de'; g.beginPath(); g.moveTo(x + 8 * s, y - 2 * s); g.lineTo(x + 22 * s, y - 6 * s); g.lineTo(x + 21 * s, y - 2 * s); g.closePath(); g.fill(); strokeInk(p, 0.8);
    return;
  }
  if (shape === 'shields') {
    for (const [dx, c] of [[-9, color], [9, lit(color, -0.25)]]) {
      const [x, y] = p.P(0.5, 0.5, 40);
      g.fillStyle = c; g.beginPath(); g.moveTo(x + dx * s - 11 * s, y - 14 * s); g.lineTo(x + dx * s + 11 * s, y - 14 * s); g.lineTo(x + dx * s + 10 * s, y + 4 * s); g.quadraticCurveTo(x + dx * s, y + 16 * s, x + dx * s - 10 * s, y + 4 * s); g.closePath(); g.fill(); strokeInk(p, 1.1);
      g.fillStyle = PAL.gold; g.fillRect(x + dx * s - 1.5 * s, y - 12 * s, 3 * s, 20 * s);
    }
    post(p, 0.5, 0.5, 34, '#8a5a30');
    return;
  }
  if (shape === 'reliquary') {
    box(p, 0.36, 0.4, 0.64, 0.6, 10, 30, { G: mat(p, 'planks', '#c99a2e'), D: mat(p, 'planks', '#a87a20') });
    gable(p, 0.35, 0.39, 0.65, 0.61, 30, 14, { axis: 'u', color, kind: 'slate', o: 0.02 });
    const [x, y] = p.P(0.5, 0.6, 20); g.fillStyle = '#fff3c4'; g.beginPath(); g.arc(x, y, 3.2 * s, 0, 7); g.fill(); strokeInk(p, 0.7);
    return;
  }
  // statue dorée
  const [x, y] = p.P(0.5, 0.5, 10);
  const gr = g.createLinearGradient(x - 9 * s, 0, x + 9 * s, 0); gr.addColorStop(0, lit(color, 0.35)); gr.addColorStop(1, lit(color, -0.3));
  g.fillStyle = gr; g.beginPath(); g.moveTo(x - 8 * s, y); g.lineTo(x - 7 * s, y - 26 * s); g.lineTo(x - 3 * s, y - 36 * s); g.lineTo(x + 3 * s, y - 36 * s); g.lineTo(x + 7 * s, y - 26 * s); g.lineTo(x + 8 * s, y); g.closePath(); g.fill(); strokeInk(p, 1);
  g.beginPath(); g.arc(x, y - 41 * s, 5 * s, 0, 7); g.fill(); strokeInk(p, 1);
  g.strokeStyle = INK; g.lineWidth = 2.6 * s; g.beginPath(); g.moveTo(x - 9 * s, y - 20 * s); g.lineTo(x - 14 * s, y - 50 * s); g.stroke(); g.strokeStyle = lit(color, 0.3); g.lineWidth = 1.4 * s; g.stroke();
}

// ───────── Muraille (pièces posées case par case) ─────────
export const WALLP = {
  stakes: { h: 8, stone: '#d8b47a', kind: 'stakes' },
  palisade: { h: 30, stone: '#9a6a3c', kind: 'palisade' },
  stone: { h: 40, stone: '#d2bc92', kind: 'stone' },
  towers: { h: 46, stone: '#cbb892', kind: 'stone' },
  fortress: { h: 52, stone: '#c4b08a', kind: 'stone' },
};
// Morceau de courtine le long d'un bord de case : axe 'u' (bord nord ou sud, v fixe) ou 'v' (bord ouest ou est, u fixe).
export function wallPiece(p, style, axis, at, { cracked = false, guard = null, banners = null } = {}) {
  const W = WALLP[style] || WALLP.stone, g = p.g, s = p.s, T = 0.12;
  const [u0, v0, u1, v1] = axis === 'u' ? [0, at - T, 1, at + T] : [at - T, 0, at + T, 1];
  if (W.kind === 'stakes') { for (let i = 0; i < 5; i++) { const u = axis === 'u' ? 0.1 + i * 0.2 : at, v = axis === 'u' ? at : 0.1 + i * 0.2; const [x, y] = p.P(u, v); g.fillStyle = '#d8b47a'; g.fillRect(x - 1 * s, y - 8 * s, 2 * s, 8 * s); g.strokeStyle = rgba('#5a3a20', 0.6); g.lineWidth = 0.6 * s; g.strokeRect(x - 1 * s, y - 8 * s, 2 * s, 8 * s); } return; }
  if (W.kind === 'palisade') {
    for (let i = 0; i < 9; i++) {
      const tt = (i + 0.5) / 9, u = axis === 'u' ? tt : at, v = axis === 'u' ? at : tt, [x, y] = p.P(u, v);
      const h = (W.h + (i % 2) * 3) * s;
      const gr = g.createLinearGradient(x - 4 * s, 0, x + 4 * s, 0); gr.addColorStop(0, '#b8844c'); gr.addColorStop(1, '#6b4226');
      g.fillStyle = gr; g.beginPath(); g.moveTo(x - 4 * s, y + 2 * s); g.lineTo(x - 4 * s, y - h); g.lineTo(x, y - h - 6 * s); g.lineTo(x + 4 * s, y - h); g.lineTo(x + 4 * s, y + 2 * s); g.closePath(); g.fill(); strokeInk(p, 0.8);
    }
    g.strokeStyle = '#5a3a20'; g.lineWidth = 2 * s; g.beginPath(); g.moveTo(...p.P(axis === 'u' ? 0 : at, axis === 'u' ? at : 0, W.h * 0.6)); g.lineTo(...p.P(axis === 'u' ? 1 : at, axis === 'u' ? at : 1, W.h * 0.6)); g.stroke();
    return;
  }
  const m = (gg, Wd, H, k) => { MAT.stone(gg, Wd, H, p, W.stone, k); if (cracked) { gg.strokeStyle = '#1d1812'; gg.lineWidth = 2 * s; gg.beginPath(); gg.moveTo(Wd * 0.5, H * 0.85); gg.lineTo(Wd * 0.56, H * 0.6); gg.lineTo(Wd * 0.48, H * 0.42); gg.lineTo(Wd * 0.58, H * 0.2); gg.stroke(); } gg.fillStyle = '#2a1c12'; gg.fillRect(Wd * 0.5 - 1.2 * s, H * 0.5, 2.4 * s, 9 * s); if (banners) { gg.fillStyle = banners[0]; gg.fillRect(Wd * 0.2, H * 0.3, 9 * s, H * 0.6); gg.fillStyle = banners[1]; gg.fillRect(Wd * 0.2 + 3.5 * s, H * 0.38, 2 * s, H * 0.48); } };
  box(p, u0, v0, u1, v1, 0, W.h, { G: m, D: m, top: lit(W.stone, -0.18) });
  // créneaux : arrière, garde, avant
  const merlon = (a, b0, b1) => { const [mu0, mv0, mu1, mv1] = axis === 'u' ? [a, b0, a + 0.09, b1] : [b0, a, b1, a + 0.09]; box(p, mu0, mv0, mu1, mv1, W.h, W.h + 8, { G: mat(p, 'stone', W.stone), D: mat(p, 'stone', W.stone), top: lit(W.stone, 0.06) }); };
  for (let a = 0.02; a < 1; a += 0.2) merlon(a, axis === 'u' ? at - T : at - T, axis === 'u' ? at - T + 0.05 : at - T + 0.05);
  if (guard) { const [x, y] = p.P(axis === 'u' ? 0.5 : at, axis === 'u' ? at : 0.5, W.h); figure(p, x, y, { tunic: guard, helm: true, spear: true }); }
  for (let a = 0.02; a < 1; a += 0.2) merlon(a, axis === 'u' ? at + T - 0.05 : at + T - 0.05, at + T);
}
export function wallTower(p, style, cu, cv, { roof = '#c84a2e', gold = false, flag = null, torch = false } = {}) {
  const W = WALLP[style] || WALLP.stone;
  if (W.kind === 'stakes') return;
  if (W.kind === 'palisade') {
    for (const [du, dv] of [[-0.12, -0.12], [0.12, -0.12], [0.12, 0.12], [-0.12, 0.12]]) post(p, cu + du, cv + dv, W.h + 16);
    box(p, cu - 0.16, cv - 0.16, cu + 0.16, cv + 0.16, W.h + 6, W.h + 18, { G: mat(p, 'planks'), D: mat(p, 'planks') });
    gable(p, cu - 0.16, cv - 0.16, cu + 0.16, cv + 0.16, W.h + 18, 14, { axis: 'u', color: '#8a5a32', kind: 'shingle' });
    return;
  }
  roundShadow(p, cu, cv, 0.22, W.h + 40);
  tower(p, cu, cv, 0.22, 0, W.h + 18, { stone: W.stone, roof: gold ? '#d8a032' : roof, roofKind: 'tile', roofH: 30, flag, windows: 1 });
  if (torch) { const g = p.g, s = p.s, [x, y] = p.P(cu, cv + 0.22, W.h + 6); const gr = g.createRadialGradient(x, y, 0, x, y, 12 * s); gr.addColorStop(0, 'rgba(255,200,90,.9)'); gr.addColorStop(1, 'rgba(255,140,40,0)'); g.fillStyle = gr; g.beginPath(); g.arc(x, y, 12 * s, 0, 7); g.fill(); }
}
export function gatehouse(p, style, at, { banner: bc = null, raid = false } = {}) {
  const W = WALLP[style] || WALLP.stone, g = p.g, s = p.s, T = 0.14;
  if (W.kind === 'stakes') return;
  const H = W.h + 10;
  box(p, 0.08, at - T, 0.92, at + T, 0, H, {
    G: (gg, Wd, Hh, k) => {
      (W.kind === 'palisade' ? MAT.planks : MAT.stone)(gg, Wd, Hh, p, W.stone, k);
      // arche et porte, herse baissée pendant un raid
      gg.fillStyle = '#2a1c12'; gg.beginPath(); gg.moveTo(Wd * 0.3, 0); gg.lineTo(Wd * 0.3, Hh * 0.45); gg.arc(Wd * 0.5, Hh * 0.45, Wd * 0.2, Math.PI, 0, false); gg.lineTo(Wd * 0.7, 0); gg.closePath(); gg.fill();
      if (!raid) { door(gg, Wd * 0.34, Wd * 0.32, Hh * 0.5, p, { color: '#7a4a26' }); }
      else { gg.strokeStyle = '#4a4d55'; gg.lineWidth = 2 * s; for (let i = 0; i < 6; i++) { gg.beginPath(); gg.moveTo(Wd * (0.32 + i * 0.07), 0); gg.lineTo(Wd * (0.32 + i * 0.07), Hh * 0.62); gg.stroke(); } for (let j = 1; j < 4; j++) { gg.beginPath(); gg.moveTo(Wd * 0.3, Hh * 0.15 * j); gg.lineTo(Wd * 0.7, Hh * 0.15 * j); gg.stroke(); } }
    },
    D: (gg, Wd, Hh, k) => (W.kind === 'palisade' ? MAT.planks : MAT.stone)(gg, Wd, Hh, p, W.stone, k),
    top: lit(W.stone, -0.15),
  });
  if (W.kind !== 'palisade') {
    tower(p, 0.08, at, 0.17, 0, H + 18, { stone: W.stone, roof: '#c84a2e', roofKind: 'tile', roofH: 26, windows: 1 });
    tower(p, 0.92, at, 0.17, 0, H + 18, { stone: W.stone, roof: '#c84a2e', roofKind: 'tile', roofH: 26, windows: 1, flag: bc });
  }
}
// Pont-levis sur les douves, devant la porte
export function drawbridge(p, at, down = true) {
  const g = p.g, s = p.s;
  if (!down) return;
  const pts = [p.P(0.3, at + 0.14), p.P(0.7, at + 0.14), p.P(0.7, at + 1.1), p.P(0.3, at + 1.1)];
  poly(g, pts); g.fillStyle = '#a0703e'; g.fill(); strokeInk(p, 1);
  g.strokeStyle = rgba('#3a2412', 0.6); g.lineWidth = 0.8 * s; for (let k = 1; k < 8; k++) { g.beginPath(); g.moveTo(...p.P(0.3, at + 0.14 + k * 0.12)); g.lineTo(...p.P(0.7, at + 0.14 + k * 0.12)); g.stroke(); }
}
export { figure, groundTile, water, smoke, tree };

// ───────── Carte du monde (v21) ─────────
// Camp de brigands : palissade de pieux, tentes rapiécées, feu de camp ; plus il est fort, plus il s'étend
// Village abandonné : deux masures au toit crevé
export function hamletRuin(p) {
  hall(p, 0, 1, {});
  const g = p.g, s = p.s, [x, y] = p.P(0.5, 0.5, 30);
  g.fillStyle = '#2a1a10'; g.beginPath(); g.moveTo(x - 8 * s, y); g.lineTo(x + 2 * s, y - 6 * s); g.lineTo(x + 9 * s, y + 3 * s); g.lineTo(x - 1 * s, y + 6 * s); g.closePath(); g.fill();
}

// ───────── v24 « Cibles du monde » ─────────
// Chaque catégorie de lieu de la carte du monde a sa silhouette et son décor ; le palier t (1 à 4, d'après le danger
// ou le niveau) ajoute des structures, des défenses et une présence plus forte. v (0 à 3, d'après la position) change
// la disposition des accessoires sans toucher aux volumes, pour que deux lieux voisins ne soient pas identiques.
const pick = (v, list) => list[((v % list.length) + list.length) % list.length];
// Sol foulé sous un lieu : il est posé sur la carte, pas collé dessus
function siteGround(p, c = '#8a6a44', r = 0.42, a = 0.55) {
  const g = p.g, s = p.s, [x, y] = p.P(0.5, 0.5);
  const gr = g.createRadialGradient(x, y, 0, x, y, r * 90 * s);
  gr.addColorStop(0, rgba(c, a)); gr.addColorStop(0.7, rgba(c, a * 0.55)); gr.addColorStop(1, rgba(c, 0));
  g.fillStyle = gr; g.beginPath(); g.ellipse(x, y, r * 96 * s, r * 48 * s, 0, 0, 7); g.fill();
}
// Chemin d'accès vers le sud-ouest (bord avant gauche de la case)
function approach(p, c = '#a8865a') {
  const g = p.g, s = p.s;
  g.lineCap = 'round';
  for (const [w, a] of [[13, 0.18], [8, 0.3]]) { g.strokeStyle = rgba(c, a); g.lineWidth = w * s; g.beginPath(); g.moveTo(...p.P(0.46, 0.66)); g.quadraticCurveTo(...p.P(0.3, 0.84), ...p.P(0.16, 0.98)); g.stroke(); }
}
// Pieu taillé (palissade)
function stake(p, u, v, h = 16, c = '#8a5a30') {
  const g = p.g, s = p.s, [x, y] = p.P(u, v);
  g.fillStyle = c; g.beginPath(); g.moveTo(x - 2 * s, y); g.lineTo(x - 2 * s, y - (h - 4) * s); g.lineTo(x, y - h * s); g.lineTo(x + 2 * s, y - (h - 4) * s); g.lineTo(x + 2 * s, y); g.closePath(); g.fill(); strokeInk(p, 0.7);
}
// Palissade en anneau (ouverte au sud-ouest pour l'entrée), r en cases
function palisadeRing(p, r = 0.44, n = 22, h = 16, gap = true) {
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2, u = 0.5 + Math.cos(a) * r, v = 0.5 + Math.sin(a) * r;
    if (gap && Math.sin(a) > 0.55 && Math.cos(a) < -0.1) continue; // porte côté sud-ouest
    stake(p, u, v, h);
  }
}
// Tour de guet de bois sur pilotis
function watchPost(p, u, v, h = 44, flag = null) {
  const g = p.g, s = p.s;
  for (const [du, dv] of [[-0.05, -0.05], [0.05, -0.05], [0.05, 0.05], [-0.05, 0.05]]) post(p, u + du, v + dv, h);
  g.strokeStyle = '#5a3a20'; g.lineWidth = 1.2 * s; g.beginPath(); g.moveTo(...p.P(u - 0.05, v + 0.05, 4)); g.lineTo(...p.P(u + 0.05, v + 0.05, h * 0.6)); g.moveTo(...p.P(u + 0.05, v + 0.05, 4)); g.lineTo(...p.P(u - 0.05, v + 0.05, h * 0.6)); g.stroke();
  box(p, u - 0.07, v - 0.07, u + 0.07, v + 0.07, h, h + 7, { G: mat(p, 'planks', '#8a5a30'), D: mat(p, 'planks', '#8a5a30'), top: '#a0703e' });
  shedRoof(p, u - 0.08, v - 0.08, u + 0.08, v + 0.08, h + 20, h + 14, '#6b4524', 'shingle');
  if (flag) banner(p, u, v, h + 20, flag, 16);
}
// Râtelier d'armes
function weaponRack(p, u, v) {
  const g = p.g, s = p.s;
  post(p, u, v, 14); post(p, u + 0.1, v - 0.02, 14);
  g.strokeStyle = '#5a3a20'; g.lineWidth = 1.6 * s; g.beginPath(); g.moveTo(...p.P(u, v, 12)); g.lineTo(...p.P(u + 0.1, v - 0.02, 12)); g.stroke();
  for (let i = 0; i < 4; i++) { const [x, y] = p.P(u + 0.02 + i * 0.022, v - 0.004 * i, 2); g.strokeStyle = '#6b4a2a'; g.lineWidth = 1 * s; g.beginPath(); g.moveTo(x, y); g.lineTo(x + 1 * s, y - 20 * s); g.stroke(); g.fillStyle = '#d8dee6'; g.beginPath(); g.moveTo(x + 1 * s, y - 24 * s); g.lineTo(x - 0.4 * s, y - 19 * s); g.lineTo(x + 2.4 * s, y - 19 * s); g.closePath(); g.fill(); }
}
function campfire(p, u, v, big = false) {
  const g = p.g, s = p.s, [fx, fy] = p.P(u, v), k = big ? 1.4 : 1;
  for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; g.fillStyle = '#8a8278'; g.beginPath(); g.arc(fx + Math.cos(a) * 7 * s * k, fy + Math.sin(a) * 3.5 * s * k, 1.8 * s, 0, 7); g.fill(); }
  g.fillStyle = '#5a3a20'; g.fillRect(fx - 6 * s * k, fy - 2 * s, 12 * s * k, 3 * s);
  const fl = g.createRadialGradient(fx, fy - 5 * s, 0, fx, fy - 5 * s, 10 * s * k); fl.addColorStop(0, 'rgba(255,230,120,1)'); fl.addColorStop(0.5, 'rgba(255,120,40,.85)'); fl.addColorStop(1, 'rgba(255,80,20,0)');
  g.fillStyle = fl; g.beginPath(); g.arc(fx, fy - 5 * s, 10 * s * k, 0, 7); g.fill();
  smoke(p, fx + 2 * s, fy - 16 * s, big ? 4 : 3);
}
function bones(p, u, v, n = 3) {
  const g = p.g, s = p.s;
  for (let i = 0; i < n; i++) {
    const [x, y] = p.P(u + i * 0.05, v + (i % 2) * 0.04); const a = i * 1.3;
    g.strokeStyle = '#efe6cf'; g.lineWidth = 1.8 * s; g.lineCap = 'round'; g.beginPath(); g.moveTo(x - Math.cos(a) * 5 * s, y - Math.sin(a) * 2 * s); g.lineTo(x + Math.cos(a) * 5 * s, y + Math.sin(a) * 2 * s); g.stroke();
  }
  const [sx, sy] = p.P(u + 0.06, v - 0.05);
  g.fillStyle = '#efe6cf'; g.beginPath(); g.arc(sx, sy - 3 * s, 3.4 * s, 0, 7); g.fill(); strokeInk(p, 0.6);
  g.fillStyle = '#2a1a10'; g.fillRect(sx - 2 * s, sy - 4 * s, 1.4 * s, 1.4 * s); g.fillRect(sx + 0.6 * s, sy - 4 * s, 1.4 * s, 1.4 * s);
}
function gravestone(p, u, v, tilt = 0) {
  const g = p.g, s = p.s, [x, y] = p.P(u, v);
  g.save(); g.translate(x, y); g.rotate(tilt);
  g.fillStyle = '#9a958a'; g.beginPath(); g.moveTo(-4 * s, 0); g.lineTo(-4 * s, -8 * s); g.arc(0, -8 * s, 4 * s, Math.PI, 0); g.lineTo(4 * s, 0); g.closePath(); g.fill(); strokeInk(p, 0.7);
  g.strokeStyle = '#5a564e'; g.lineWidth = 0.8 * s; g.beginPath(); g.moveTo(0, -10 * s); g.lineTo(0, -4 * s); g.moveTo(-2 * s, -8 * s); g.lineTo(2 * s, -8 * s); g.stroke();
  g.restore();
}
function deadTree(p, u, v, h = 30) {
  const g = p.g, s = p.s, [x, y] = p.P(u, v);
  g.strokeStyle = INK; g.lineCap = 'round';
  const br = (x0, y0, a, l, w, d) => { const x1 = x0 + Math.cos(a) * l, y1 = y0 + Math.sin(a) * l; g.lineWidth = w + 1.2 * s; g.strokeStyle = INK; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke(); g.lineWidth = w; g.strokeStyle = '#5a4636'; g.stroke(); if (d > 0) { br(x1, y1, a - 0.5, l * 0.62, w * 0.6, d - 1); br(x1, y1, a + 0.45, l * 0.55, w * 0.6, d - 1); } };
  br(x, y, -Math.PI / 2, h * 0.55 * s, 3.2 * s, 2);
}
// Amas de cristaux luisants (cristaux, gemmes, filon légendaire)
function crystals(p, u, v, cols, n = 5, h = 26, glow = true) {
  const g = p.g, s = p.s, [x, y] = p.P(u, v);
  if (glow) { const gr = g.createRadialGradient(x, y - 10 * s, 0, x, y - 10 * s, 34 * s); gr.addColorStop(0, rgba(cols[0], 0.45)); gr.addColorStop(1, rgba(cols[0], 0)); g.fillStyle = gr; g.beginPath(); g.arc(x, y - 10 * s, 34 * s, 0, 7); g.fill(); }
  const spots = [[0, 0, 1], [-9, 3, 0.7], [9, 2, 0.75], [-4, 6, 0.55], [6, 7, 0.5], [-13, 7, 0.45], [13, 8, 0.4]].slice(0, n);
  for (const [dx, dy, k] of spots) {
    const bx = x + dx * s, by = y + dy * s, hh = h * k * s, w = 5 * k * s + 1.5 * s, lean = dx * 0.08 * s;
    g.fillStyle = cols[1]; g.beginPath(); g.moveTo(bx - w, by); g.lineTo(bx - w * 0.8 + lean, by - hh * 0.75); g.lineTo(bx + lean, by - hh); g.lineTo(bx, by); g.closePath(); g.fill();
    g.fillStyle = cols[2]; g.beginPath(); g.moveTo(bx, by); g.lineTo(bx + lean, by - hh); g.lineTo(bx + w * 0.8 + lean, by - hh * 0.75); g.lineTo(bx + w, by); g.closePath(); g.fill();
    g.beginPath(); g.moveTo(bx - w, by); g.lineTo(bx - w * 0.8 + lean, by - hh * 0.75); g.lineTo(bx + lean, by - hh); g.lineTo(bx + w * 0.8 + lean, by - hh * 0.75); g.lineTo(bx + w, by); g.closePath(); strokeInk(p, 0.8);
    g.strokeStyle = rgba('#ffffff', 0.6); g.lineWidth = 0.8 * s; g.beginPath(); g.moveTo(bx - w * 0.5, by - hh * 0.3); g.lineTo(bx - w * 0.3 + lean, by - hh * 0.8); g.stroke();
  }
}
// Mini-forteresse : quatre tours, courtines, donjon central, porte au sud-ouest. st : matériaux et toits du style
function fortress(p, st, t = 3, flag = null) {
  const k0 = 0.2, k1 = 0.8, H = st.h + t * 4;
  const wallM = mat(p, st.wood ? 'planks' : 'stone', st.stone);
  const tw = (u, v, big = false) => (st.square ? (() => { box(p, u - 0.07, v - 0.07, u + 0.07, v + 0.07, 0, H + 14, { G: wallM, D: wallM, top: st.stone }); if (st.roof) gable(p, u - 0.08, v - 0.08, u + 0.08, v + 0.08, H + 14, 18, { axis: 'u', color: st.roof, kind: 'slate', o: 0.02 }); })()
    : tower(p, u, v, big ? 0.1 : 0.085, 0, H + (big ? 26 : 14), { roof: st.roof, roofKind: 'slate', roofH: st.roof ? 26 : 0, stone: st.stone, crenels: !st.roof, windows: 1, flag: big ? flag : null }));
  dropShadow(p, k0, k0, k1, k1, H + 30);
  tw(k0, k0);
  // courtines du fond
  box(p, k0, k0 - 0.025, k1, k0 + 0.025, 0, H, { G: wallM, D: wallM, top: lit(st.stone, 0.1) });
  box(p, k0 - 0.025, k0, k0 + 0.025, k1, 0, H, { G: wallM, D: wallM, top: lit(st.stone, 0.1) });
  tw(k1, k0); tw(k0, k1);
  // donjon
  if (t >= 2) { box(p, 0.38, 0.36, 0.62, 0.6, 0, H + 26 + t * 4, { G: withDeco(mat(p, 'stone', st.keep || st.stone), (gg, W) => windows(gg, W, p, 2, 22, 9, { glow: st.dark ? 1 : -1 })), D: mat(p, 'stone', st.keep || st.stone) }); gable(p, 0.37, 0.35, 0.63, 0.61, H + 26 + t * 4, 26, { axis: 'u', color: st.roof || '#4a4a52', kind: 'slate' }); if (flag) banner(p, 0.5, 0.48, H + 52 + t * 4, flag, 24); }
  // courtines avant
  box(p, k0, k1 - 0.025, k1, k1 + 0.025, 0, H, { G: withDeco(wallM, (gg, W) => door(gg, W * 0.32, 14 * p.s, 18 * p.s, p, { color: st.dark ? '#1a1218' : '#5a3418' })), D: wallM, top: lit(st.stone, 0.1) });
  box(p, k1 - 0.025, k0, k1 + 0.025, k1, 0, H, { G: wallM, D: wallM, top: lit(st.stone, 0.1) });
  tw(k1, k1, true);
  if (t >= 4 && st.braziers) for (const [u, v] of [[0.32, 0.86], [0.12, 0.66]]) { const [x, y] = p.P(u, v); const gr = p.g.createRadialGradient(x, y - 6 * p.s, 0, x, y - 6 * p.s, 9 * p.s); gr.addColorStop(0, st.braziers); gr.addColorStop(1, rgba(st.braziers, 0)); p.g.fillStyle = gr; p.g.beginPath(); p.g.arc(x, y - 6 * p.s, 9 * p.s, 0, 7); p.g.fill(); post(p, u, v, 8); }
}
// Styles des royaumes rivaux et des forteresses (cinq architectures distinctes)
export const FORT_STYLES = [
  { key: 'bois', wood: true, square: true, stone: '#9a6a3c', roof: '#6b4524', h: 26 }, // Seigneurie de bois (palissade et tours carrées)
  { key: 'gres', stone: '#d8b88a', roof: '#b8432f', h: 32 }, // Grès rouge, toits de tuiles
  { key: 'ardoise', stone: '#b8b4aa', roof: '#3f5f86', h: 36, keep: '#a8a49a' }, // Granit et ardoise bleue
  { key: 'fort', square: true, stone: '#c4b08a', roof: null, h: 40 }, // Forteresse crénelée, tours carrées
  { key: 'noir', stone: '#5e5866', roof: '#3a2a46', h: 38, keep: '#4e4858', dark: true, braziers: '#c06aff' }, // Pierre noire, flammes pourpres
];

export const TARGETS = {
  // Bûcherons : souches, piles de grumes, chevalet de sciage, cabane au palier 2, charrette au palier 3
  woodNode: (p, t, v, o) => {
    siteGround(p, '#7a5a34', 0.38, 0.4);
    const tr = pick(v, [[[0.18, 0.2], [0.84, 0.26], [0.86, 0.7]], [[0.2, 0.3], [0.8, 0.18], [0.16, 0.74]], [[0.3, 0.16], [0.88, 0.5], [0.22, 0.78]], [[0.14, 0.4], [0.62, 0.12], [0.86, 0.8]]]);
    for (const [u, vv] of tr) tree(p, u, vv, { season: o.season, kind: 'pine', size: 1.05 });
    if (t >= 2) hall(p, 0, v, { low: 'planks', high: 'planks', lowC: '#8a5a32', roof: PAL.brown, kind: 'thatch', u0: 0.36, v0: 0.22, u1: 0.68, v1: 0.48, h1: 16, rh: 18, annex: false, chim: true, turret: false, active: o.active });
    logs(p, 0.32, 0.66, 3); logs(p, 0.6, 0.78, 3); if (t >= 3) { logs(p, 0.74, 0.58, 3); cart(p, 0.86, 0.9, '#a0703e'); }
    const g = p.g, s = p.s; for (const [u, vv] of [[0.5, 0.6], [0.24, 0.52]]) { const [x, y] = p.P(u, vv); g.fillStyle = '#b58a5a'; g.beginPath(); g.ellipse(x, y - 3 * s, 5 * s, 2.4 * s, 0, 0, 7); g.fill(); strokeInk(p, 0.7); g.fillStyle = '#8a5a30'; g.fillRect(x - 5 * s, y - 3 * s, 10 * s, 3 * s); }
    const [fx, fy] = p.P(0.46, 0.8); figure(p, fx, fy, { tunic: '#6b8a3a', hat: '#7a4a26' });
  },
  stoneNode: (p, t, v, o) => { siteGround(p, '#9a9080', 0.42, 0.45); PAINT.quarry(p, t, v, o); if (t >= 3) rock(p, 0.86, 0.24, 0.55); },
  ironNode: (p, t, v, o) => { siteGround(p, '#7a6a5a', 0.42, 0.45); PAINT.mine(p, t, v, o); ore(p, 0.24, 0.84, '#7a6e66', '#4a4440'); },
  ironNodeRich: (p, t, v, o) => { siteGround(p, '#7a6a5a', 0.44, 0.5); PAINT.mine(p, 3, v, o); ore(p, 0.24, 0.84, '#7a6e66', '#4a4440'); ore(p, 0.36, 0.9, '#7a6e66', '#4a4440'); banner(p, 0.2, 0.3, 30, ['#2f5fb0', '#f1d36a'], 20); },
  silverNode: (p, t, v, o) => { siteGround(p, '#8a8a90', 0.42, 0.45); PAINT.mine(p, Math.max(2, t), v, o); ore(p, 0.24, 0.84, '#d8dde4', '#9aa2ae'); ore(p, 0.12, 0.7, '#d8dde4', '#9aa2ae'); },
  coalNode: (p, t, v, o) => { siteGround(p, '#4a4038', 0.42, 0.5); PAINT.charcoal(p, t, v, o); ore(p, 0.18, 0.86, '#3a3634', '#1e1c1c'); },
  foodNode: (p, t, v, o) => { siteGround(p, '#6a7a3a', 0.4, 0.3); PAINT.hunter(p, t, v, o); for (const [u, vv] of pick(v, [[[0.12, 0.32], [0.88, 0.56]], [[0.2, 0.84], [0.9, 0.22]]])) tree(p, u, vv, { season: o.season, size: 0.85 }); },
  herbNode: (p, t, v, o) => { siteGround(p, '#7a8a3a', 0.4, 0.3); PAINT.herbalist(p, t, v, o); },
  // Bosquet ancien : un arbre immense entouré d'un cercle de pierres levées
  ancientGrove: (p, t, v, o) => {
    siteGround(p, '#3a5a2a', 0.46, 0.5);
    for (let i = 0; i < 7; i++) { const a = (i / 7) * Math.PI * 2 + v; const u = 0.5 + Math.cos(a) * 0.38, vv = 0.5 + Math.sin(a) * 0.38; box(p, u - 0.03, vv - 0.025, u + 0.03, vv + 0.025, 0, 18 + (i % 3) * 4, { G: mat(p, 'stone', '#a8a49a'), D: mat(p, 'stone', '#a8a49a'), top: '#c4c0b6' }); }
    tree(p, 0.5, 0.52, { season: o.season, size: 2.3 });
    const g = p.g, s = p.s, [x, y] = p.P(0.5, 0.52); const gr = g.createRadialGradient(x, y - 50 * s, 0, x, y - 50 * s, 46 * s); gr.addColorStop(0, 'rgba(190,255,170,0.35)'); gr.addColorStop(1, 'rgba(190,255,170,0)'); g.fillStyle = gr; g.beginPath(); g.arc(x, y - 50 * s, 46 * s, 0, 7); g.fill();
  },
  crystalNode: (p, t, v, o) => { siteGround(p, '#5a4a6a', 0.42, 0.45); rock(p, 0.36, 0.34, 0.7); crystals(p, 0.56, 0.6, ['#c9a0ff', '#7a5ad8', '#b48aff'], 4 + Math.min(3, t), 28 + t * 4); },
  gemNode: (p, t, v, o) => { siteGround(p, '#6a5a4a', 0.42, 0.45); rock(p, 0.44, 0.4, 0.9); crystals(p, 0.3, 0.74, ['#ff7aa0', '#c83a6a', '#ff9ab8'], 3, 20); crystals(p, 0.7, 0.72, ['#7ad0ff', '#2a8ac8', '#9ae0ff'], 3, 22); },
  rareVein: (p, t, v, o) => {
    const g = p.g, s = p.s, [x, y] = p.P(0.5, 0.55);
    g.fillStyle = '#3a2c26'; g.beginPath(); g.ellipse(x, y, 46 * s, 20 * s, 0, 0, 7); g.fill(); strokeInk(p, 1);
    g.fillStyle = '#1e1614'; g.beginPath(); g.ellipse(x, y + 2 * s, 34 * s, 13 * s, 0, 0, 7); g.fill();
    crystals(p, 0.5, 0.56, ['#ff9a3a', '#c8501a', '#ffbf6a'], 5, 30);
    for (const [u, vv] of [[0.16, 0.4], [0.84, 0.5], [0.5, 0.18]]) rock(p, u, vv, 0.35);
  },
  // Camp de bandits : désordonné au début, puis palissade, tours de guet, râteliers, double enceinte
  banditCamp: (p, t, v, o) => {
    siteGround(p, '#8a6a44', 0.46, 0.55); approach(p);
    const col = o.color || '#7a2a20';
    if (t >= 2) palisadeRing(p, 0.45, t >= 4 ? 26 : 20, t >= 4 ? 18 : 15);
    else for (let i = 0; i < 7; i++) { const a = i * 0.9 + v; stake(p, 0.5 + Math.cos(a) * 0.42, 0.5 + Math.sin(a) * 0.42, 10 + (i % 3) * 3); }
    const spots = pick(v, [[[0.35, 0.33], [0.66, 0.38], [0.7, 0.68], [0.4, 0.7]], [[0.32, 0.4], [0.62, 0.3], [0.72, 0.6], [0.48, 0.72]], [[0.4, 0.3], [0.7, 0.45], [0.3, 0.6], [0.62, 0.72]], [[0.3, 0.32], [0.58, 0.28], [0.74, 0.56], [0.36, 0.66]]]);
    const n = Math.min(4, 1 + t);
    for (let i = 0; i < n; i++) tent(p, spots[i][0], spots[i][1], i === 0 && t >= 3 ? 0.15 : 0.11, i === 0 && t >= 3 ? 32 : 24, i % 2 ? '#6b5a3a' : col, '#d8c8a0', i === 0 ? ['#2a1a10', col] : null);
    campfire(p, 0.54, 0.54, t >= 3);
    barrel(p, 0.22, 0.56, '#9a6a3c'); crate(p, 0.78, 0.84, 0.06);
    if (t >= 2) weaponRack(p, 0.6, 0.84);
    if (t >= 3) watchPost(p, 0.82, 0.24, 40, ['#2a1a10', col]);
    if (t >= 4) watchPost(p, 0.16, 0.22, 44, ['#2a1a10', col]);
  },
  // Repaire de bêtes : bouche de grotte dans la roche, ossements, griffures, yeux luisants au palier 3
  monsterLair: (p, t, v, o) => {
    siteGround(p, '#4a3a2a', 0.44, 0.5);
    rock(p, 0.5, 0.42, 1.25 + t * 0.08);
    const g = p.g, s = p.s, [x, y] = p.P(0.56, 0.62);
    g.fillStyle = '#120c0a'; g.beginPath(); g.moveTo(x - 16 * s, y); g.quadraticCurveTo(x - 14 * s, y - 24 * s, x, y - 26 * s); g.quadraticCurveTo(x + 14 * s, y - 24 * s, x + 16 * s, y); g.closePath(); g.fill(); strokeInk(p, 1);
    if (t >= 3) { g.fillStyle = '#ffcf3a'; for (const dx of [-4, 4]) { g.beginPath(); g.ellipse(x + dx * s, y - 12 * s, 1.8 * s, 1.2 * s, 0, 0, 7); g.fill(); } }
    g.strokeStyle = rgba('#2a1a10', 0.7); g.lineWidth = 1.2 * s; for (let i = 0; i < 3; i++) { g.beginPath(); g.moveTo(x + (20 + i * 3) * s, y - 26 * s); g.lineTo(x + (16 + i * 3) * s, y - 14 * s); g.stroke(); }
    bones(p, 0.26, 0.8, 2 + Math.min(2, t)); deadTree(p, 0.16, 0.34, 34);
    if (t >= 2) deadTree(p, 0.86, 0.66, 28);
  },
  // Crypte : mausolée de pierre au toit d'ardoise, croix, tombes de travers, grille rouillée, arbre mort
  crypt: (p, t, v, o) => {
    siteGround(p, '#5a5a4a', 0.44, 0.45);
    for (const [u, vv, a] of pick(v, [[[0.2, 0.7, 0.1], [0.32, 0.82, -0.15], [0.84, 0.76, 0.05]], [[0.16, 0.6, -0.1], [0.3, 0.86, 0.12], [0.8, 0.84, -0.08]]])) gravestone(p, u, vv, a);
    if (t >= 2) for (const [u, vv] of [[0.66, 0.9], [0.92, 0.6]]) gravestone(p, u, vv, 0.2);
    dropShadow(p, 0.3, 0.26, 0.72, 0.62, 70);
    box(p, 0.3, 0.26, 0.72, 0.62, 0, 30 + t * 3, { G: withDeco(mat(p, 'stone', '#a8a49a'), (gg, W) => door(gg, W * 0.38, 13 * p.s, 20 * p.s, p, { color: '#1e1a20' })), D: mat(p, 'stone', '#9a968c') });
    gable(p, 0.29, 0.25, 0.73, 0.63, 30 + t * 3, 24, { axis: 'v', color: '#4a4a5a', kind: 'slate' });
    const g = p.g, s = p.s, [x, y] = p.P(0.51, 0.63, 54 + t * 3);
    g.strokeStyle = INK; g.lineWidth = 3.2 * s; g.beginPath(); g.moveTo(x, y); g.lineTo(x, y - 14 * s); g.moveTo(x - 5 * s, y - 9 * s); g.lineTo(x + 5 * s, y - 9 * s); g.stroke(); g.strokeStyle = '#9a958a'; g.lineWidth = 1.6 * s; g.stroke();
    fence(p, 0.08, 0.92, 0.42, 0.98, 5);
    deadTree(p, 0.84, 0.26, 36);
    if (t >= 3) { const [lx, ly] = p.P(0.4, 0.66, 10); const gr = g.createRadialGradient(lx, ly, 0, lx, ly, 14 * s); gr.addColorStop(0, 'rgba(140,255,200,.55)'); gr.addColorStop(1, 'rgba(140,255,200,0)'); g.fillStyle = gr; g.beginPath(); g.arc(lx, ly, 14 * s, 0, 7); g.fill(); }
  },
  // Donjon des Profondeurs : tour noire fissurée, escalier qui descend, braseros pourpres, remparts en ruine
  dungeon: (p, t, v, o) => {
    siteGround(p, '#3a3040', 0.46, 0.55);
    const g = p.g, s = p.s;
    box(p, 0.12, 0.2, 0.36, 0.26, 0, 22, { G: mat(p, 'stone', '#6a6470'), D: mat(p, 'stone', '#6a6470'), top: '#7a7480' });
    box(p, 0.12, 0.26, 0.18, 0.5, 0, 16, { G: mat(p, 'stone', '#6a6470'), D: mat(p, 'stone', '#6a6470'), top: '#7a7480' });
    roundShadow(p, 0.56, 0.42, 0.17, 120);
    tower(p, 0.56, 0.42, 0.17, 0, 76 + t * 6, { roof: '#3a2a46', roofKind: 'slate', roofH: 40, stone: '#5e5866', crenels: false, windows: 2, finial: '#c06aff' });
    const [x, y] = p.P(0.42, 0.74);
    for (let i = 0; i < 4; i++) { g.fillStyle = i % 2 ? '#3a3440' : '#4a4450'; g.beginPath(); g.moveTo(x - (16 - i * 2) * s, y - i * 3 * s); g.lineTo(x + (16 - i * 2) * s, y - i * 3 * s); g.lineTo(x + (14 - i * 2) * s, y - (i + 1) * 3 * s); g.lineTo(x - (14 - i * 2) * s, y - (i + 1) * 3 * s); g.closePath(); g.fill(); }
    g.fillStyle = '#0c080e'; g.beginPath(); g.ellipse(x, y - 14 * s, 9 * s, 4 * s, 0, 0, 7); g.fill();
    for (const [u, vv] of [[0.24, 0.66], [0.62, 0.86]]) { const [bx, by] = p.P(u, vv); post(p, u, vv, 10); const gr = g.createRadialGradient(bx, by - 13 * s, 0, bx, by - 13 * s, 10 * s); gr.addColorStop(0, '#e0a0ff'); gr.addColorStop(0.5, 'rgba(160,80,255,.7)'); gr.addColorStop(1, 'rgba(160,80,255,0)'); g.fillStyle = gr; g.beginPath(); g.arc(bx, by - 13 * s, 10 * s, 0, 7); g.fill(); }
    bones(p, 0.74, 0.7, 2);
  },
  // Repaire du boss : aiguilles de roche noire, crâne géant, braises, bannière de guerre
  boss: (p, t, v, o) => {
    siteGround(p, '#3a2420', 0.5, 0.6);
    const g = p.g, s = p.s;
    for (const [u, vv, h] of [[0.3, 0.3, 70], [0.7, 0.28, 56], [0.18, 0.62, 44], [0.84, 0.62, 50]]) { const [x, y] = p.P(u, vv); g.fillStyle = '#2e2622'; g.beginPath(); g.moveTo(x - 12 * s, y); g.lineTo(x - 3 * s, y - h * s); g.lineTo(x + 2 * s, y - (h - 8) * s); g.lineTo(x + 12 * s, y); g.closePath(); g.fill(); strokeInk(p, 1); g.fillStyle = 'rgba(255,120,60,.3)'; g.fillRect(x - 1 * s, y - h * 0.8 * s, 2 * s, h * 0.6 * s); }
    const [x, y] = p.P(0.52, 0.58);
    g.fillStyle = '#e8dcc0'; g.beginPath(); g.arc(x, y - 18 * s, 15 * s, Math.PI, 0); g.lineTo(x + 11 * s, y); g.lineTo(x - 11 * s, y); g.closePath(); g.fill(); strokeInk(p, 1.1);
    g.fillStyle = '#1a0c0a'; for (const dx of [-6, 6]) { g.beginPath(); g.ellipse(x + dx * s, y - 18 * s, 4 * s, 4.5 * s, 0, 0, 7); g.fill(); }
    g.fillStyle = '#ff5a2a'; for (const dx of [-6, 6]) { g.beginPath(); g.arc(x + dx * s, y - 18 * s, 1.5 * s, 0, 7); g.fill(); }
    g.fillStyle = '#120808'; g.beginPath(); g.ellipse(x, y - 4 * s, 7 * s, 4 * s, 0, 0, 7); g.fill();
    banner(p, 0.3, 0.86, 0, ['#5a0e0e', '#1a0c0a'], 34); bones(p, 0.66, 0.84, 3);
    smoke(p, x + 20 * s, y - 50 * s, 4);
  },
  // Marchand itinérant : chariot bâché, étal rayé, tonneaux
  npc: (p, t, v, o) => { siteGround(p, '#8a7a54', 0.4, 0.4); stall(p, 0.4, 0.42, '#3f74b0'); cart(p, 0.7, 0.72, '#e3c25a'); barrel(p, 0.26, 0.78); barrel(p, 0.34, 0.84, '#9a6a3c'); },
  // Royaume rival : forteresse au style de la maison (cinq architectures), bannière à ses couleurs
  kingdom: (p, t, v, o) => { siteGround(p, '#7a6a4a', 0.5, 0.55); approach(p, '#b8a070'); fortress(p, FORT_STYLES[(o.style ?? v) % FORT_STYLES.length], t, [o.color || '#7a2a20', '#f1d36a']); },
  // Lieu d'événement : pavillon de guerre aux couleurs de l'événement (à venir, actif, boss, nettoyé)
  eventSite: (p, t, v, o) => {
    const ph = o.phase || 'active', col = o.color || '#a8402a', dim = ph === 'cleared' || ph === 'ended';
    siteGround(p, dim ? '#5a5048' : '#8a6a44', 0.5, 0.6); approach(p);
    if (ph === 'upcoming') { for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2; stake(p, 0.5 + Math.cos(a) * 0.4, 0.5 + Math.sin(a) * 0.4, 9); } crate(p, 0.4, 0.5, 0.08); crate(p, 0.56, 0.56, 0.07, '#c9965a'); logs(p, 0.66, 0.4, 3); return; }
    palisadeRing(p, 0.46, 24, dim ? 10 : 18);
    tent(p, 0.5, 0.42, 0.2, dim ? 22 : 48, dim ? '#6a625a' : col, dim ? '#a8a090' : '#f2e4c2', dim ? null : [col, '#f1d36a']);
    if (!dim) { tent(p, 0.28, 0.66, 0.1, 24, '#6b5a3a', '#d8c8a0'); tent(p, 0.74, 0.7, 0.1, 24, col, '#d8c8a0'); campfire(p, 0.52, 0.74, true); watchPost(p, 0.84, 0.3, 40, [col, '#1a120c']); watchPost(p, 0.16, 0.3, 40, [col, '#1a120c']); }
    else { smoke(p, ...p.P(0.5, 0.42, 30), 3); bones(p, 0.66, 0.74, 2); }
    if (ph === 'boss') { banner(p, 0.36, 0.86, 0, ['#5a0e0e', '#1a0c0a'], 40); banner(p, 0.7, 0.9, 0, ['#5a0e0e', '#1a0c0a'], 40); const g = p.g, s = p.s, [x, y] = p.P(0.5, 0.42, 60); const gr = g.createRadialGradient(x, y, 0, x, y, 40 * s); gr.addColorStop(0, 'rgba(255,80,40,.35)'); gr.addColorStop(1, 'rgba(255,80,40,0)'); g.fillStyle = gr; g.beginPath(); g.arc(x, y, 40 * s, 0, 7); g.fill(); }
  },
};
// Tas de minerai (fer, argent, charbon)
function ore(p, u, v, c1, c2) {
  const g = p.g, s = p.s, [x, y] = p.P(u, v);
  for (const [dx, dy, r] of [[0, 0, 6], [-6, 2, 4.5], [6, 2, 4.5], [-2, -4, 4], [3, -3, 3.5]]) { g.fillStyle = dy < 0 ? c1 : c2; g.beginPath(); g.moveTo(x + (dx - r) * s, y + dy * s); g.lineTo(x + dx * s, y + (dy - r * 1.1) * s); g.lineTo(x + (dx + r) * s, y + dy * s); g.closePath(); g.fill(); strokeInk(p, 0.6); }
}
