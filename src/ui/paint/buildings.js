// v21 « Couleurs du Royaume » — Bâtiments peints (planche de style) : hôtel de ville à 3 paliers, ferme, caserne,
// morceau de muraille avec tour et douves. Chaque fonction peint dans un repère `pen` (paint.js) sur une case (u, v ∈ [0, 1]).
import {
  pen, MAT, box, gable, tower, cone, banner, dropShadow, roundShadow, groundTile, water, figure, smoke, onFace,
  window_, door, poly, strokeInk, lit, rgba, INK,
} from './paint.js';

const STONE = '#e2c896', STONE_D = '#c9ad7e', RED = '#c84a2e', BLUE = '#3f74b0', SLATE = '#5a6b86', GOLD = '#e2b84a';
const PLAYER = ['#2f5fb0', '#f1d36a']; // couleurs du blason (exemple)

// Petits accessoires
function barrel(p, x, y) {
  const g = p.g, s = p.s;
  const gr = g.createLinearGradient(x - 5 * s, 0, x + 5 * s, 0); gr.addColorStop(0, '#b07a44'); gr.addColorStop(0.4, '#d29a5a'); gr.addColorStop(1, '#6e4524');
  g.fillStyle = gr; g.beginPath(); g.ellipse(x, y, 5 * s, 2 * s, 0, 0, Math.PI); g.lineTo(x - 5 * s, y - 10 * s); g.ellipse(x, y - 10 * s, 5 * s, 2 * s, 0, Math.PI, 0, true); g.closePath(); g.fill(); strokeInk(p, 0.8);
  g.fillStyle = '#7a5230'; g.beginPath(); g.ellipse(x, y - 10 * s, 5 * s, 2 * s, 0, 0, 7); g.fill(); strokeInk(p, 0.8);
  g.strokeStyle = '#3b3b40'; g.lineWidth = 1 * s; for (const yy of [-2.5, -7.5]) { g.beginPath(); g.ellipse(x, y + yy * s, 5 * s, 2 * s, 0, 0, Math.PI); g.stroke(); }
}
function crate(p, u, v, z = 0, sz = 0.08) {
  box(p, u, v, u + sz, v + sz, z, z + sz * 120, { G: (g, W, H, k) => MAT.planks(g, W, H, p, '#b3824c', k), D: (g, W, H, k) => MAT.planks(g, W, H, p, '#b3824c', k), top: '#d6a466' });
}
function flowerBox(g, x, y, w, p) { const s = p.s; g.fillStyle = '#7a4a26'; g.fillRect(x, y - 2.5 * s, w, 2.5 * s); for (let i = 0; i < w / (2.4 * s); i++) { g.fillStyle = ['#e8484a', '#ffd95a', '#f08aa0'][i % 3]; g.beginPath(); g.arc(x + 1.2 * s + i * 2.4 * s, y + 0.8 * s, 1.3 * s, 0, 7); g.fill(); g.fillStyle = '#4f8a2a'; g.fillRect(x + 0.6 * s + i * 2.4 * s, y - 0.4 * s, 1.4 * s, 1 * s); } }
function shield(g, x, y, p, c1 = PLAYER[0], c2 = PLAYER[1]) {
  const s = p.s;
  g.beginPath(); g.moveTo(x - 5 * s, y + 7 * s); g.lineTo(x + 5 * s, y + 7 * s); g.lineTo(x + 5 * s, y); g.quadraticCurveTo(x + 5 * s, y - 5 * s, x, y - 7 * s); g.quadraticCurveTo(x - 5 * s, y - 5 * s, x - 5 * s, y); g.closePath();
  g.fillStyle = c1; g.fill(); g.strokeStyle = INK; g.lineWidth = 0.9 * s; g.stroke();
  g.fillStyle = c2; g.fillRect(x - 1.2 * s, y - 5 * s, 2.4 * s, 11 * s);
}
function chimney(p, u, v, z0, z1, smoking = true) {
  box(p, u, v, u + 0.07, v + 0.07, z0, z1, { G: (g, W, H, k) => MAT.stone(g, W, H, p, '#b9806a', k), D: (g, W, H, k) => MAT.stone(g, W, H, p, '#b9806a', k), top: '#3a2a20' });
  if (smoking) { const [x, y] = p.P(u + 0.035, v + 0.035, z1); smoke(p, x, y - 4 * p.s, 4); }
}

// ───────── Hôtel de ville : 3 paliers bien distincts ─────────
// Palier 1 : maison commune (pierre et colombages, tuiles rouges, cheminée fumante, tonneaux)
// Palier 3 : donjon de pierre, tours d'angle coiffées d'ardoise, bannières, écus
// Palier 5 : citadelle (courtine crénelée, quatre tours, donjon à grande tour centrale, épis dorés)
export function townhall(p, tier = 1) {
  const g = p.g, s = p.s;
  if (!p.noGround) groundTile(p, 0, 0, 'cobble');
  if (p.onlyGround) return;
  if (tier <= 1) {
    dropShadow(p, 0.18, 0.22, 0.82, 0.78, 90);
    box(p, 0.18, 0.22, 0.82, 0.78, 0, 22, {
      G: (gg, W, H, k) => { MAT.stone(gg, W, H, p, STONE, k); door(gg, W * 0.42, 15 * s, 18 * s, p); window_(gg, W * 0.14, 6 * s, 8 * s, 10 * s, p, { glow: true }); window_(gg, W * 0.76, 6 * s, 8 * s, 10 * s, p); },
      D: (gg, W, H, k) => { MAT.stone(gg, W, H, p, STONE, k); window_(gg, W * 0.3, 6 * s, 8 * s, 10 * s, p); window_(gg, W * 0.66, 6 * s, 8 * s, 10 * s, p); },
    });
    box(p, 0.16, 0.2, 0.84, 0.8, 22, 44, {
      G: (gg, W, H, k) => { MAT.timber(gg, W, H, p, '#f2e4c2', '#5e3a20', k); window_(gg, W * 0.2, 6 * s, 8 * s, 9 * s, p, { arch: false, shutters: true }); window_(gg, W * 0.68, 6 * s, 8 * s, 9 * s, p, { arch: false, shutters: true, glow: true }); flowerBox(gg, W * 0.2 - 1 * s, 5 * s, 10 * s, p); },
      D: (gg, W, H, k) => { MAT.timber(gg, W, H, p, '#f2e4c2', '#5e3a20', k); window_(gg, W * 0.42, 6 * s, 8 * s, 9 * s, p, { arch: false, shutters: true }); },
    });
    chimney(p, 0.6, 0.28, 46, 80);
    gable(p, 0.16, 0.2, 0.84, 0.8, 44, 32, { axis: 'u', color: RED, kind: 'tile', gableMat: (gg, W, H, k) => MAT.timber(gg, W, H, p, '#f2e4c2', '#5e3a20', k) });
    const [bx, by] = p.P(0.12, 0.92); barrel(p, bx, by); barrel(p, bx + 11 * s, by + 3 * s);
    banner(p, 0.93, 0.62, 0, PLAYER, 22);
    return;
  }
  const big = tier >= 5;
  // Palier 5 : courtine du fond (derrière tout)
  if (big) {
    const wallG = (gg, W, H, k) => MAT.stone(gg, W, H, p, STONE_D, k);
    box(p, 0.04, 0.04, 0.96, 0.12, 0, 22, { G: wallG, D: wallG, top: lit(STONE_D, -0.1) });
    box(p, 0.04, 0.04, 0.12, 0.96, 0, 22, { G: wallG, D: wallG, top: lit(STONE_D, -0.1) });
    tower(p, 0.08, 0.08, 0.1, 0, 44, { roof: BLUE, roofH: 30, flag: null, windows: 1 });
  }
  const k0 = big ? 0.28 : 0.25, k1 = big ? 0.72 : 0.75, H0 = big ? 82 : 66;
  // tour arrière (derrière le donjon)
  if (!big) tower(p, 0.2, 0.2, 0.12, 0, 82, { roof: BLUE, roofH: 40, flag: PLAYER, windows: 2 });
  dropShadow(p, k0, k0, k1, k1, H0 + 60);
  box(p, k0, k0, k1, k1, 0, H0, {
    G: (gg, W, H, k) => {
      MAT.stone(gg, W, H, p, STONE, k);
      door(gg, W * 0.38, 18 * s, 24 * s, p, { color: '#6a3c20' });
      for (const fx of [0.12, 0.78]) window_(gg, W * fx, 34 * s, 8 * s, 13 * s, p, { glow: fx > 0.5 });
      for (const fx of [0.3, 0.6]) window_(gg, W * fx, H - 22 * s, 7 * s, 11 * s, p, { glow: big });
      shield(gg, W * 0.5, 38 * s, p);
      if (big) { gg.fillStyle = GOLD; gg.fillRect(0, H - 4 * s, W, 2 * s); }
    },
    D: (gg, W, H, k) => { MAT.stone(gg, W, H, p, STONE, k); for (const fx of [0.25, 0.65]) { window_(gg, W * fx, 18 * s, 8 * s, 12 * s, p); window_(gg, W * fx, H - 24 * s, 7 * s, 11 * s, p, { glow: fx > 0.5 && big }); } if (big) { gg.fillStyle = GOLD; gg.fillRect(0, H - 4 * s, W, 2 * s); } },
    top: big ? lit(STONE, -0.1) : null,
  });
  if (big) {
    // créneaux sur le donjon, puis grande tour centrale
    for (let i = 0; i < 5; i++) { const u = k0 + i * (k1 - k0) / 4.6; box(p, u, k1 - 0.04, u + 0.06, k1, H0, H0 + 8, { G: (gg, W, H, k) => MAT.stone(gg, W, H, p, STONE, k), D: (gg, W, H, k) => MAT.stone(gg, W, H, p, STONE, k), top: lit(STONE, 0.05) }); }
    tower(p, 0.5, 0.5, 0.15, H0, H0 + 52, { roof: BLUE, roofH: 52, flag: PLAYER, windows: 2, finial: GOLD });
  } else {
    gable(p, k0, k0, k1, k1, H0, 36, { axis: 'u', color: SLATE, kind: 'slate', gableMat: (gg, W, H, k) => MAT.stone(gg, W, H, p, STONE, k) });
    const [cx, cy] = p.P(0.62, 0.35, H0 + 18); smoke(p, cx, cy, 3);
  }
  // tours d'angle (gauche et droite)
  const tr = big ? 0.1 : 0.12;
  tower(p, big ? 0.92 : 0.8, big ? 0.08 : 0.2, tr, 0, big ? 44 : 70, { roof: BLUE, roofH: big ? 30 : 36, flag: big ? null : PLAYER, windows: 2 });
  tower(p, big ? 0.08 : 0.2, big ? 0.92 : 0.8, tr, 0, big ? 44 : 70, { roof: BLUE, roofH: big ? 30 : 36, flag: big ? PLAYER : null, windows: 2 });
  if (big) {
    // courtine de devant avec porte, et tour d'avant
    const wallG = (gg, W, H, k) => MAT.stone(gg, W, H, p, STONE_D, k);
    box(p, 0.88, 0.12, 0.96, 0.88, 0, 22, { G: wallG, D: (gg, W, H, k) => { wallG(gg, W, H, k); }, top: lit(STONE_D, -0.1) });
    box(p, 0.12, 0.88, 0.88, 0.96, 0, 22, {
      G: (gg, W, H, k) => { wallG(gg, W, H, k); door(gg, W * 0.4, 16 * s, 17 * s, p, { color: '#5a3418' }); gg.fillStyle = '#3b3b40'; for (let i = 0; i < 4; i++) gg.fillRect(W * 0.4 + i * 4.6 * s, 3 * s, 1 * s, 13 * s); },
      D: wallG, top: lit(STONE_D, -0.1),
    });
    for (let i = 0; i < 6; i++) { const u = 0.14 + i * 0.13; box(p, u, 0.9, u + 0.06, 0.96, 22, 29, { G: (gg, W, H, k) => MAT.stone(gg, W, H, p, STONE_D, k), D: (gg, W, H, k) => MAT.stone(gg, W, H, p, STONE_D, k), top: lit(STONE_D, 0.05) }); }
    tower(p, 0.92, 0.92, 0.1, 0, 48, { roof: BLUE, roofH: 30, flag: null, windows: 1 });
  } else {
    const [bx, by] = p.P(0.9, 0.95); barrel(p, bx, by);
    const [fx, fy] = p.P(0.55, 0.95); figure(p, fx, fy, { tunic: PLAYER[0], helm: true, spear: true });
  }
}

// ───────── Ferme : chaumière, champs en rangs, meule, clôture ─────────
export function farm(p) {
  const g = p.g, s = p.s;
  if (!p.noGround) groundTile(p, 0, 0, 'grass');
  // champs : blé doré et jeunes pousses, en sillons parallèles
  const field = (u0, v0, u1, v1, c1, c2) => {
    const pts = [p.P(u0, v0), p.P(u1, v0), p.P(u1, v1), p.P(u0, v1)];
    g.save(); poly(g, pts); g.clip();
    const gr = g.createLinearGradient(...p.P(u0, v0), ...p.P(u1, v1)); gr.addColorStop(0, c1); gr.addColorStop(1, lit(c1, -0.15));
    g.fillStyle = gr; poly(g, pts); g.fill();
    for (let u = u0; u < u1; u += 0.045) {
      g.strokeStyle = rgba('#5a3c12', 0.35); g.lineWidth = 1.6 * s; g.beginPath(); g.moveTo(...p.P(u, v0)); g.lineTo(...p.P(u, v1)); g.stroke();
      g.strokeStyle = c2; g.lineWidth = 2.2 * s; g.setLineDash([2 * s, 1.6 * s]); g.beginPath(); g.moveTo(...p.P(u + 0.02, v0, 2)); g.lineTo(...p.P(u + 0.02, v1, 2)); g.stroke(); g.setLineDash([]);
    }
    g.restore(); poly(g, pts); g.strokeStyle = rgba('#5a3c12', 0.6); g.lineWidth = 1.2 * s; g.stroke();
  };
  if (!p.noGround) { field(0.5, 0.06, 0.96, 0.52, '#e3c25a', '#f6dc7a'); field(0.08, 0.55, 0.96, 0.96, '#8cc04a', '#b6e06a'); }
  if (p.onlyGround) return;
  // chaumière
  dropShadow(p, 0.06, 0.08, 0.42, 0.46, 60);
  box(p, 0.06, 0.08, 0.42, 0.46, 0, 26, {
    G: (gg, W, H, k) => { MAT.timber(gg, W, H, p, '#f3e6c6', '#6b4226', k); door(gg, W * 0.18, 10 * s, 15 * s, p, { arch: false, color: '#8a5a30' }); window_(gg, W * 0.6, 9 * s, 8 * s, 8 * s, p, { arch: false, shutters: true, glow: true }); },
    D: (gg, W, H, k) => { MAT.timber(gg, W, H, p, '#f3e6c6', '#6b4226', k); window_(gg, W * 0.45, 9 * s, 8 * s, 8 * s, p, { arch: false, shutters: true }); },
  });
  chimney(p, 0.12, 0.14, 30, 50);
  gable(p, 0.06, 0.08, 0.42, 0.46, 26, 26, { axis: 'v', color: '#cfa64e', kind: 'thatch', gableMat: (gg, W, H, k) => MAT.planks(gg, W, H, p, '#a0703e', k) });
  // meule de foin
  const [hx, hy] = p.P(0.2, 0.86);
  const hg = g.createLinearGradient(hx - 14 * s, 0, hx + 14 * s, 0); hg.addColorStop(0, '#f4d878'); hg.addColorStop(1, '#b58a2c');
  g.fillStyle = 'rgba(22,30,12,0.3)'; g.beginPath(); g.ellipse(hx + 6 * s, hy + 2 * s, 18 * s, 6 * s, 0, 0, 7); g.fill();
  g.fillStyle = hg; g.beginPath(); g.moveTo(hx - 15 * s, hy); g.quadraticCurveTo(hx - 14 * s, hy - 26 * s, hx, hy - 30 * s); g.quadraticCurveTo(hx + 14 * s, hy - 26 * s, hx + 15 * s, hy); g.ellipse(hx, hy, 15 * s, 5 * s, 0, 0, Math.PI); g.fill(); strokeInk(p, 1);
  g.strokeStyle = rgba('#7a5a1c', 0.6); g.lineWidth = 0.8 * s; for (let i = 0; i < 8; i++) { g.beginPath(); g.moveTo(hx - 10 * s + i * 2.8 * s, hy - 3 * s); g.lineTo(hx - 6 * s + i * 1.8 * s, hy - 22 * s); g.stroke(); }
  // clôture
  for (let u = 0.08; u <= 0.96; u += 0.11) { const [x, y] = p.P(u, 0.985); g.fillStyle = '#7a5230'; g.fillRect(x - 1.2 * s, y - 10 * s, 2.4 * s, 10 * s); g.strokeStyle = INK; g.lineWidth = 0.6 * s; g.strokeRect(x - 1.2 * s, y - 10 * s, 2.4 * s, 10 * s); }
  g.strokeStyle = '#8a6038'; g.lineWidth = 1.6 * s; for (const z of [4, 8]) { g.beginPath(); g.moveTo(...p.P(0.08, 0.985, z)); g.lineTo(...p.P(0.96, 0.985, z)); g.stroke(); }
  // épouvantail et paysan
  const [sx, sy] = p.P(0.75, 0.3);
  g.strokeStyle = '#6b4a2a'; g.lineWidth = 1.4 * s; g.beginPath(); g.moveTo(sx, sy); g.lineTo(sx, sy - 22 * s); g.moveTo(sx - 8 * s, sy - 16 * s); g.lineTo(sx + 8 * s, sy - 16 * s); g.stroke();
  g.fillStyle = '#c0462e'; g.fillRect(sx - 4 * s, sy - 17 * s, 8 * s, 9 * s); g.fillStyle = '#f0d39a'; g.beginPath(); g.arc(sx, sy - 21 * s, 3 * s, 0, 7); g.fill(); g.fillStyle = '#8a6a32'; g.beginPath(); g.ellipse(sx, sy - 23.5 * s, 5 * s, 1.5 * s, 0, 0, 7); g.fill();
  const [px, py] = p.P(0.66, 0.72); figure(p, px, py, { tunic: '#5c7a3a', hat: '#c9a24a', load: '#e3c25a' });
}

// ───────── Caserne : long bâtiment, cour d'entraînement, mannequins, râtelier ─────────
export function barracks(p) {
  const g = p.g, s = p.s;
  if (!p.noGround) groundTile(p, 0, 0, 'dirt');
  if (p.onlyGround) return;
  dropShadow(p, 0.08, 0.08, 0.92, 0.46, 70);
  box(p, 0.08, 0.08, 0.92, 0.46, 0, 22, {
    G: (gg, W, H, k) => { MAT.stone(gg, W, H, p, '#c9b28a', k); door(gg, W * 0.45, 15 * s, 18 * s, p, { color: '#7a3a22' }); for (const fx of [0.12, 0.28, 0.7, 0.86]) window_(gg, W * fx, 8 * s, 7 * s, 9 * s, p, { glow: fx === 0.28 }); },
    D: (gg, W, H, k) => { MAT.stone(gg, W, H, p, '#c9b28a', k); window_(gg, W * 0.4, 8 * s, 7 * s, 9 * s, p); },
  });
  box(p, 0.07, 0.07, 0.93, 0.47, 22, 38, {
    G: (gg, W, H, k) => { MAT.timber(gg, W, H, p, '#efdcb8', '#5a3418', k); for (let i = 0; i < 5; i++) shield(gg, W * (0.12 + i * 0.19), 8 * s, p, i % 2 ? '#a83a2a' : PLAYER[0], PLAYER[1]); },
    D: (gg, W, H, k) => MAT.timber(gg, W, H, p, '#efdcb8', '#5a3418', k),
  });
  chimney(p, 0.7, 0.14, 40, 66);
  gable(p, 0.07, 0.07, 0.93, 0.47, 38, 26, { axis: 'u', color: '#b8402a', kind: 'tile', gableMat: (gg, W, H, k) => MAT.timber(gg, W, H, p, '#efdcb8', '#5a3418', k) });
  // cour : mannequins d'entraînement, cible, râtelier
  const dummy = (u, v) => {
    const [x, y] = p.P(u, v);
    g.fillStyle = 'rgba(22,30,12,0.3)'; g.beginPath(); g.ellipse(x + 3 * s, y, 6 * s, 2 * s, 0, 0, 7); g.fill();
    g.strokeStyle = '#6b4a2a'; g.lineWidth = 2 * s; g.beginPath(); g.moveTo(x, y); g.lineTo(x, y - 22 * s); g.moveTo(x - 7 * s, y - 15 * s); g.lineTo(x + 7 * s, y - 15 * s); g.stroke();
    g.fillStyle = '#e0c06a'; g.beginPath(); g.ellipse(x, y - 13 * s, 4.5 * s, 6 * s, 0, 0, 7); g.fill(); strokeInk(p, 0.8);
    g.fillStyle = '#d8b25a'; g.beginPath(); g.arc(x, y - 21 * s, 3.2 * s, 0, 7); g.fill(); strokeInk(p, 0.8);
    g.strokeStyle = '#b8402a'; g.lineWidth = 1 * s; g.beginPath(); g.arc(x, y - 13 * s, 2 * s, 0, 7); g.stroke();
  };
  dummy(0.3, 0.68); dummy(0.52, 0.66);
  // cible de tir
  const [tx, ty] = p.P(0.84, 0.62);
  g.strokeStyle = '#6b4a2a'; g.lineWidth = 1.6 * s; g.beginPath(); g.moveTo(tx - 4 * s, ty); g.lineTo(tx, ty - 18 * s); g.lineTo(tx + 4 * s, ty); g.stroke();
  for (const [rr, c] of [[9, '#f3e6c6'], [6.5, '#c0462e'], [4, '#f3e6c6'], [2, '#c0462e']]) { g.fillStyle = c; g.beginPath(); g.ellipse(tx, ty - 16 * s, rr * 0.8 * s, rr * s, 0, 0, 7); g.fill(); }
  g.beginPath(); g.ellipse(tx, ty - 16 * s, 7.2 * s, 9 * s, 0, 0, 7); strokeInk(p, 0.9);
  // râtelier de lances
  const [rx, ry] = p.P(0.12, 0.72);
  g.fillStyle = '#7a5230'; g.fillRect(rx - 10 * s, ry - 12 * s, 20 * s, 2.4 * s); g.fillRect(rx - 10 * s, ry - 4 * s, 20 * s, 2.4 * s);
  for (let i = 0; i < 5; i++) { const x = rx - 8 * s + i * 4 * s; g.strokeStyle = '#6b4a2a'; g.lineWidth = 1.1 * s; g.beginPath(); g.moveTo(x, ry); g.lineTo(x + 1 * s, ry - 26 * s); g.stroke(); g.fillStyle = '#c9d0d8'; g.beginPath(); g.moveTo(x + 1 * s, ry - 30 * s); g.lineTo(x - 0.4 * s, ry - 25 * s); g.lineTo(x + 2.4 * s, ry - 25 * s); g.closePath(); g.fill(); }
  // soldats à l'exercice
  const [ax, ay] = p.P(0.42, 0.86); figure(p, ax, ay, { tunic: PLAYER[0], helm: true, spear: true });
  const [bx, by] = p.P(0.64, 0.84); figure(p, bx, by, { tunic: '#a83a2a', helm: true, spear: true });
  banner(p, 0.95, 0.5, 0, PLAYER, 22);
}

// ───────── Muraille : courtine crénelée, chemin de ronde gardé, tour d'angle, douves ─────────
// Le repère couvre plusieurs cases le long de u (0 à n) ; les douves sont devant (v croissant).
export function wallSection(p, n = 3) {
  const g = p.g, s = p.s;
  if (!p.noGround) {
  for (let u = -1; u < n + 1; u++) for (let v = -1; v < 3; v++) groundTile(p, u, v, 'grass');
  // rive de terre et douves
  const bank = [p.P(-1, 0.7), p.P(n + 0.6, 0.7), p.P(n + 0.6, 1.85), p.P(-1, 1.85)];
  poly(g, bank); g.fillStyle = '#9a7a48'; g.fill();
  water(p, [p.P(-1, 0.86), p.P(n + 0.6, 0.86), p.P(n + 0.6, 1.7), p.P(-1, 1.7)]);
  // roseaux
  for (let i = 0; i < 18; i++) { const [x, y] = p.P(-0.8 + i * 0.22, 1.72 + (i % 3) * 0.03); g.strokeStyle = i % 2 ? '#5a8a2a' : '#7aa83a'; g.lineWidth = 1.1 * s; for (let j = -1; j <= 1; j++) { g.beginPath(); g.moveTo(x + j * 2 * s, y); g.quadraticCurveTo(x + j * 3 * s, y - 6 * s, x + j * 4 * s, y - 11 * s); g.stroke(); } }
  }
  if (p.onlyGround) return;
  // ombre de la muraille
  dropShadow(p, -1, 0.36, n, 0.64, 70, 0.4);
  const W0 = '#cbb892';
  box(p, -1, 0.36, n - 0.2, 0.64, 0, 50, {
    G: (gg, W, H, k) => { MAT.stone(gg, W, H, p, W0, k); for (let x = 30 * s; x < W - 20 * s; x += 60 * s) { gg.fillStyle = '#2a1c12'; gg.fillRect(x, 24 * s, 2.4 * s, 10 * s); } },
    D: (gg, W, H, k) => MAT.stone(gg, W, H, p, W0, k),
    top: '#a89270',
  });
  // merlons du fond, gardes sur le chemin de ronde, merlons de devant
  const merlon = (u, v0, v1) => box(p, u, v0, u + 0.075, v1, 50, 58, { G: (gg, W, H, k) => MAT.stone(gg, W, H, p, W0, k), D: (gg, W, H, k) => MAT.stone(gg, W, H, p, W0, k), top: lit(W0, 0.08) });
  for (let u = -1; u < n - 0.3; u += 0.16) merlon(u, 0.36, 0.4);
  for (const [u, c] of [[0.2, PLAYER[0]], [1.35, '#a83a2a'], [2.2, PLAYER[0]]]) { const [x, y] = p.P(u, 0.5, 50); figure(p, x, y, { tunic: c, helm: true, spear: true }); }
  for (let u = -1; u < n - 0.3; u += 0.16) merlon(u, 0.6, 0.64);
  // tour d'angle (coiffe de tuiles rouges) et bannière du seigneur
  roundShadow(p, n - 0.1, 0.5, 0.36, 110);
  tower(p, n - 0.1, 0.5, 0.36, 0, 86, { roof: RED, roofH: 54, roofKind: 'tile', flag: PLAYER, windows: 2, stone: W0 });
  // torche et bannière tombante sur la courtine
  onFace(p, 'G', 0.64, 0.6, 0.86, 18, 46, (gg, W, H) => { gg.fillStyle = PLAYER[0]; gg.fillRect(4 * s, 2 * s, W - 8 * s, H - 2 * s); gg.fillStyle = PLAYER[1]; gg.fillRect(W / 2 - 2 * s, 6 * s, 4 * s, H - 10 * s); gg.beginPath(); gg.moveTo(4 * s, 2 * s); gg.lineTo(W / 2, -4 * s); gg.lineTo(W - 4 * s, 2 * s); gg.fillStyle = PLAYER[0]; gg.fill(); });
}

export { pen };
