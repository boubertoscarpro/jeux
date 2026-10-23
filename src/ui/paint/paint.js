// v21 « Couleurs du Royaume » — Peinture procédurale (Canvas 2D) : primitives isométriques pour des bâtiments au rendu
// « peint » (matières lisibles, lumière chaude venue du haut à gauche, ombres douces, contours sombres réguliers).
// Les dessins sont faits une fois puis « cuits » en images (voir bake.js) ; rien ici ne dépend de l'état du jeu.
//
// Repère : une case fait 128 × 64 px à l'échelle 1 (comme la v20). (u, v) ∈ [0, 1] dans la case, z en px vers le haut.
//   écran = (ox + (u − v)·64·s, oy + (u + v)·32·s − z·s)
// Faces visibles d'un volume : « G » (plan v = v1, tournée vers le bas à gauche, au soleil) et « D » (plan u = u1,
// tournée vers le bas à droite, à l'ombre). Le soleil vient du haut à gauche : les ombres portées partent vers la droite.

export const INK = '#2a1a10'; // contour (brun très sombre, plus doux qu'un noir)

// ───────── Couleurs ─────────
const hex = (h) => { const n = parseInt(h.slice(1), 16); return h.length === 4 ? [((n >> 8) & 15) * 17, ((n >> 4) & 15) * 17, (n & 15) * 17] : [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const toHex = (c) => '#' + c.map((x) => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, '0')).join('');
export const mix = (a, b, t) => { const A = hex(a), B = hex(b); return toHex(A.map((x, i) => x + (B[i] - x) * t)); };
// k > 0 : éclaircit vers une lumière chaude ; k < 0 : assombrit vers une ombre froide (lumière de fin d'après-midi)
export const lit = (c, k) => (k >= 0 ? mix(c, '#fff4d6', k) : mix(c, '#1c2440', -k));
export const rgba = (c, a) => { const [r, g, b] = hex(c); return `rgba(${r},${g},${b},${a})`; };

// Générateur déterministe (une même graine donne le même dessin)
export function rng(seed) {
  let a = (typeof seed === 'number' ? seed : [...String(seed)].reduce((h, ch) => Math.imul(h ^ ch.charCodeAt(0), 16777619), 2166136261)) >>> 0;
  const f = () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  f.range = (lo, hi) => lo + (hi - lo) * f();
  f.pick = (arr) => arr[Math.floor(f() * arr.length)];
  return f;
}

// ───────── Repère ─────────
export function pen(g, ox, oy, s = 2, seed = 1) {
  const P = (u, v, z = 0) => [ox + (u - v) * 64 * s, oy + (u + v) * 32 * s - z * s];
  return { g, ox, oy, s, P, r: rng(seed) };
}
const len = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);
export function poly(g, pts) { g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); }
export function strokeInk(p, w = 1.1) { const g = p.g; g.lineJoin = 'round'; g.lineCap = 'round'; g.strokeStyle = INK; g.lineWidth = w * p.s; g.stroke(); }

// Repère local d'une face verticale : x de 0 à W le long de la face, y de 0 à H vers le haut (en px de dessin).
// kind 'G' : plan v = fixe, x le long de u ; kind 'D' : plan u = fixe, x le long de v.
export function onFace(p, kind, fixed, a0, a1, z0, z1, draw) {
  const g = p.g;
  const A = kind === 'G' ? p.P(a0, fixed, z0) : p.P(fixed, a0, z0);
  const B = kind === 'G' ? p.P(a1, fixed, z0) : p.P(fixed, a1, z0);
  const C = kind === 'G' ? p.P(a0, fixed, z1) : p.P(fixed, a0, z1);
  const W = len(A, B), H = len(A, C);
  g.save();
  g.transform((B[0] - A[0]) / W, (B[1] - A[1]) / W, (C[0] - A[0]) / H, (C[1] - A[1]) / H, A[0], A[1]);
  g.beginPath(); g.rect(0, 0, W, H); g.clip();
  draw(g, W, H);
  g.restore();
  return { A, B, C, D: [B[0] + C[0] - A[0], B[1] + C[1] - A[1]], W, H };
}
// Repère local d'un pan de toit : x le long de l'arête basse (E0 → E1), y de l'égout vers le faîtage (E0 → R0)
export function onPlane(p, E0, E1, R0, draw) {
  const g = p.g;
  const W = len(E0, E1), H = len(E0, R0);
  g.save();
  g.transform((E1[0] - E0[0]) / W, (E1[1] - E0[1]) / W, (R0[0] - E0[0]) / H, (R0[1] - E0[1]) / H, E0[0], E0[1]);
  g.beginPath(); g.rect(0, 0, W, H); g.clip();
  draw(g, W, H);
  g.restore();
}

// ───────── Matières (dessinées dans un repère local, y vers le haut) ─────────
export const MAT = {
  // Pierre de taille claire, joints irréguliers, arêtes éclairées
  stone(g, W, H, p, base = '#e2c896', k = 0) {
    const r = p.r, s = p.s;
    g.fillStyle = lit(base, k); g.fillRect(0, 0, W, H);
    const bh = 8.5 * s;
    for (let y = 0, row = 0; y < H; y += bh, row++) {
      let x = row % 2 ? -r.range(4, 10) * s : -r.range(0, 6) * s;
      while (x < W) {
        const bw = r.range(13, 22) * s;
        const c = lit(mix(base, r() < 0.3 ? '#c99a6a' : '#d8cdb4', r.range(0, 0.35)), k + r.range(-0.12, 0.08));
        g.fillStyle = c; g.fillRect(x + 0.8 * s, y + 0.8 * s, bw - 1.6 * s, bh - 1.6 * s);
        g.fillStyle = lit(base, k + 0.24); g.fillRect(x + 0.8 * s, y + bh - 2.2 * s, bw - 1.6 * s, 1.4 * s); // arête haute au soleil
        g.fillStyle = rgba('#3a2a1c', 0.18); g.fillRect(x + 0.8 * s, y + 0.8 * s, bw - 1.6 * s, 1.1 * s);
        if (r() < 0.25) { g.fillStyle = rgba('#5b6b3a', 0.25); g.fillRect(x + r.range(2, bw - 6) , y + 1 * s, r.range(3, 6) * s, 2 * s); } // mousse
        x += bw;
      }
    }
    g.strokeStyle = rgba('#4a3020', 0.55); g.lineWidth = 1 * s;
    for (let y = 0; y < H; y += bh) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
    ao(g, W, H, s);
  },
  // Enduit chaulé
  plaster(g, W, H, p, base = '#efe2c4', k = 0) {
    const r = p.r, s = p.s;
    const gr = g.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, lit(base, k - 0.06)); gr.addColorStop(1, lit(base, k + 0.04));
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
    for (let i = 0; i < W * H / (90 * s * s); i++) { g.fillStyle = rgba(r() < 0.5 ? '#b49a70' : '#ffffff', 0.12); g.fillRect(r() * W, r() * H, r.range(2, 6) * s, r.range(1, 3) * s); }
  },
  // Colombages sur enduit (poutres sombres, croix de Saint-André)
  timber(g, W, H, p, base = '#efe2c4', wood = '#6b4226', k = 0) {
    MAT.plaster(g, W, H, p, base, k);
    const s = p.s, bw = 3.2 * s;
    g.fillStyle = lit(wood, k);
    g.fillRect(0, 0, W, bw); g.fillRect(0, H - bw, W, bw);
    const n = Math.max(2, Math.round(W / (26 * s)));
    for (let i = 0; i <= n; i++) g.fillRect(Math.min(W - bw, (i * W) / n - bw / 2), 0, bw, H);
    g.lineWidth = bw * 0.85; g.strokeStyle = lit(wood, k - 0.04);
    for (let i = 0; i < n; i += 2) { const x0 = (i * W) / n, x1 = ((i + 1) * W) / n; g.beginPath(); g.moveTo(x0, bw); g.lineTo(x1, H - bw); g.moveTo(x1, bw); g.lineTo(x0, H - bw); g.stroke(); }
    g.fillStyle = rgba('#ffffff', 0.12); g.fillRect(0, H - bw, W, 1 * s);
  },
  // Planches verticales (granges, palissades)
  planks(g, W, H, p, base = '#9a6a3c', k = 0) {
    const r = p.r, s = p.s;
    for (let x = 0; x < W; ) {
      const bw = r.range(7, 10) * s;
      g.fillStyle = lit(base, k + r.range(-0.08, 0.06)); g.fillRect(x, 0, bw, H);
      g.strokeStyle = rgba('#3d2614', 0.35); g.lineWidth = 0.6 * s;
      for (let j = 0; j < 2; j++) { const gx = x + r.range(2, bw - 2); g.beginPath(); g.moveTo(gx, 0); g.bezierCurveTo(gx + 2 * s, H * 0.3, gx - 2 * s, H * 0.6, gx, H); g.stroke(); }
      g.fillStyle = rgba('#2a1a10', 0.5); g.fillRect(x + bw - 1 * s, 0, 1 * s, H);
      x += bw;
    }
    ao(g, W, H, s);
  },
};
// Occlusion ambiante au pied des murs
function ao(g, W, H, s) {
  const gr = g.createLinearGradient(0, 0, 0, 14 * s); gr.addColorStop(0, 'rgba(30,20,10,0.38)'); gr.addColorStop(1, 'rgba(30,20,10,0)');
  g.fillStyle = gr; g.fillRect(0, 0, W, 14 * s);
}

// ───────── Ouvertures et détails sur une face (repère local, y vers le haut) ─────────
export function window_(g, x, y, w, h, p, { arch = true, glow = false, shutters = false } = {}) {
  const s = p.s;
  g.fillStyle = '#5a3c22';
  roundTop(g, x - 1.6 * s, y - 1.6 * s, w + 3.2 * s, h + 3.2 * s, arch); g.fill();
  const gr = g.createLinearGradient(0, y, 0, y + h);
  if (glow) { gr.addColorStop(0, '#ffcf6a'); gr.addColorStop(1, '#e88a2c'); } else { gr.addColorStop(0, '#1d2a3a'); gr.addColorStop(1, '#3f5878'); }
  g.fillStyle = gr; roundTop(g, x, y, w, h, arch); g.fill();
  g.strokeStyle = '#5a3c22'; g.lineWidth = 1.2 * s; g.beginPath(); g.moveTo(x + w / 2, y); g.lineTo(x + w / 2, y + h); g.moveTo(x, y + h * 0.55); g.lineTo(x + w, y + h * 0.55); g.stroke();
  if (!glow) { g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(x + w * 0.12, y + h * 0.6, w * 0.22, h * 0.25); }
  g.fillStyle = '#cdb994'; g.fillRect(x - 2.4 * s, y - 3 * s, w + 4.8 * s, 2 * s); // appui
  if (shutters) { g.fillStyle = '#3f6d3a'; g.fillRect(x - 5 * s, y, 3.4 * s, h * 0.9); g.fillRect(x + w + 1.6 * s, y, 3.4 * s, h * 0.9); }
}
function roundTop(g, x, y, w, h, arch) {
  g.beginPath();
  if (!arch) { g.rect(x, y, w, h); return; }
  const r = w / 2;
  g.moveTo(x, y); g.lineTo(x, y + h - r); g.arc(x + r, y + h - r, r, Math.PI, 0, false); g.lineTo(x + w, y); g.closePath();
}
export function door(g, x, w, h, p, { arch = true, color = '#7a4a26' } = {}) {
  const s = p.s;
  g.fillStyle = '#4a3020'; roundTop(g, x - 2.2 * s, -0.5 * s, w + 4.4 * s, h + 2.4 * s, arch); g.fill();
  const gr = g.createLinearGradient(x, 0, x + w, 0); gr.addColorStop(0, lit(color, 0.12)); gr.addColorStop(1, lit(color, -0.2));
  g.fillStyle = gr; roundTop(g, x, 0, w, h, arch); g.fill();
  g.strokeStyle = rgba('#2a1a10', 0.6); g.lineWidth = 0.8 * s;
  for (let i = 1; i < 4; i++) { g.beginPath(); g.moveTo(x + (i * w) / 4, 0); g.lineTo(x + (i * w) / 4, h * 0.92); g.stroke(); }
  g.fillStyle = '#3b3b40'; g.fillRect(x, h * 0.25, w, 1.6 * s); g.fillRect(x, h * 0.62, w, 1.6 * s);
  g.fillStyle = '#e2b84a'; g.beginPath(); g.arc(x + w * 0.78, h * 0.45, 1.2 * s, 0, 7); g.fill();
}

// ───────── Volumes ─────────
// Bloc droit : faces G et D peintes avec leurs matières (fonctions (g, W, H, k)), dessus facultatif, contours
export function box(p, u0, v0, u1, v1, z0, z1, { G, D, top = null, ink = true } = {}) {
  const fd = onFace(p, 'D', u1, v0, v1, z0, z1, (g, W, H) => D(g, W, H, -0.2));
  const fg = onFace(p, 'G', v1, u0, u1, z0, z1, (g, W, H) => G(g, W, H, 0.06));
  if (top) { poly(p.g, [p.P(u0, v0, z1), p.P(u1, v0, z1), p.P(u1, v1, z1), p.P(u0, v1, z1)]); p.g.fillStyle = top; p.g.fill(); if (ink) strokeInk(p, 0.9); }
  if (ink) {
    poly(p.g, [p.P(u1, v0, z0), p.P(u1, v1, z0), p.P(u1, v1, z1), p.P(u1, v0, z1)]); strokeInk(p, 1);
    poly(p.g, [p.P(u0, v1, z0), p.P(u1, v1, z0), p.P(u1, v1, z1), p.P(u0, v1, z1)]); strokeInk(p, 1);
  }
  return { fd, fg };
}

// Toit à deux pans, faîtage le long de u (axe 'u') ou de v (axe 'v'). kind : 'tile' | 'slate' | 'thatch' | 'shingle'
export function gable(p, u0, v0, u1, v1, z, rh, { axis = 'u', color = '#c0462e', kind = 'tile', o = 0.06, gableMat = null } = {}) {
  const g = p.g;
  if (axis === 'u') {
    const vm = (v0 + v1) / 2;
    // pan arrière (souvent caché), puis pignon (face D), puis pan avant
    const back = [p.P(u0 - o, v0 - o, z - 2), p.P(u1 + o, v0 - o, z - 2), p.P(u1 + o, vm, z + rh), p.P(u0 - o, vm, z + rh)];
    poly(g, back); g.fillStyle = lit(color, -0.32); g.fill(); strokeInk(p, 1);
    poly(g, [p.P(u1, v0, z), p.P(u1, v1, z), p.P(u1, vm, z + rh)]);
    if (gableMat) { g.save(); g.clip(); onFace(p, 'D', u1, v0, v1, z, z + rh, (gg, W, H) => gableMat(gg, W, H, -0.2)); g.restore(); } else { g.fillStyle = lit('#e8d9b5', -0.2); g.fill(); }
    poly(g, [p.P(u1, v0, z), p.P(u1, v1, z), p.P(u1, vm, z + rh)]); strokeInk(p, 1);
    const E0 = p.P(u0 - o, v1 + o, z - 2), E1 = p.P(u1 + o, v1 + o, z - 2), R0 = p.P(u0 - o, vm, z + rh);
    onPlane(p, E0, E1, R0, (gg, W, H) => ROOF[kind](gg, W, H, p, color, 0.04));
    poly(g, [E0, E1, p.P(u1 + o, vm, z + rh), R0]); strokeInk(p, 1.2);
    ridge(p, p.P(u0 - o, vm, z + rh), p.P(u1 + o, vm, z + rh), color, kind);
    // bord de rive sur le pignon (planche éclairée)
    g.beginPath(); g.moveTo(...p.P(u1 + o, v1 + o, z - 2)); g.lineTo(...p.P(u1 + o, vm, z + rh)); g.lineTo(...p.P(u1 + o, v0 - o, z - 2));
    g.strokeStyle = INK; g.lineWidth = 3.4 * p.s; g.stroke(); g.strokeStyle = lit(color, -0.05); g.lineWidth = 1.8 * p.s; g.stroke();
  } else {
    const um = (u0 + u1) / 2;
    const back = [p.P(u0 - o, v0 - o, z - 2), p.P(u0 - o, v1 + o, z - 2), p.P(um, v1 + o, z + rh), p.P(um, v0 - o, z + rh)];
    poly(g, back); g.fillStyle = lit(color, -0.3); g.fill(); strokeInk(p, 1);
    poly(g, [p.P(u0, v1, z), p.P(u1, v1, z), p.P(um, v1, z + rh)]);
    if (gableMat) { g.save(); g.clip(); onFace(p, 'G', v1, u0, u1, z, z + rh, (gg, W, H) => gableMat(gg, W, H, 0.06)); g.restore(); } else { g.fillStyle = '#efe2c4'; g.fill(); }
    poly(g, [p.P(u0, v1, z), p.P(u1, v1, z), p.P(um, v1, z + rh)]); strokeInk(p, 1);
    const E0 = p.P(u1 + o, v0 - o, z - 2), E1 = p.P(u1 + o, v1 + o, z - 2), R0 = p.P(um, v0 - o, z + rh);
    onPlane(p, E0, E1, R0, (gg, W, H) => ROOF[kind](gg, W, H, p, color, -0.16));
    poly(g, [E0, E1, p.P(um, v1 + o, z + rh), R0]); strokeInk(p, 1.2);
    ridge(p, p.P(um, v0 - o, z + rh), p.P(um, v1 + o, z + rh), color, kind);
    g.beginPath(); g.moveTo(...p.P(u0 - o, v1 + o, z - 2)); g.lineTo(...p.P(um, v1 + o, z + rh)); g.lineTo(...p.P(u1 + o, v1 + o, z - 2));
    g.strokeStyle = INK; g.lineWidth = 3.4 * p.s; g.stroke(); g.strokeStyle = lit(color, 0.05); g.lineWidth = 1.8 * p.s; g.stroke();
  }
}
function ridge(p, a, b, color, kind) {
  const g = p.g;
  g.lineCap = 'round';
  g.strokeStyle = INK; g.lineWidth = 5.2 * p.s; g.beginPath(); g.moveTo(...a); g.lineTo(...b); g.stroke();
  g.strokeStyle = kind === 'thatch' ? '#8a6a32' : lit(color, -0.12); g.lineWidth = 3.4 * p.s; g.stroke();
  g.strokeStyle = rgba('#fff4d6', 0.45); g.lineWidth = 1 * p.s; g.beginPath(); g.moveTo(a[0], a[1] - 1 * p.s); g.lineTo(b[0], b[1] - 1 * p.s); g.stroke();
}

// Couvertures (repère d'un pan : x le long de l'égout, y vers le faîtage)
export const ROOF = {
  tile(g, W, H, p, color, k) {
    const r = p.r, s = p.s, rowH = 6.2 * s, tw = 7.2 * s;
    const gr = g.createLinearGradient(0, 0, W, H); gr.addColorStop(0, lit(color, k + 0.12)); gr.addColorStop(1, lit(color, k - 0.1));
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
    for (let y = H - rowH * 0.2, row = 0; y > -rowH; y -= rowH, row++) {
      g.fillStyle = rgba('#2a1206', 0.32); g.fillRect(0, y - 1.4 * s, W, 1.4 * s); // ombre sous le rang
      for (let x = (row % 2) * -tw / 2; x < W; x += tw) {
        const c = lit(color, k + r.range(-0.08, 0.1) + (y / H) * 0.08);
        g.fillStyle = c;
        g.beginPath(); g.moveTo(x + 0.6 * s, y); g.lineTo(x + 0.6 * s, y - rowH + 2 * s); g.quadraticCurveTo(x + tw / 2, y - rowH - 1.6 * s, x + tw - 0.6 * s, y - rowH + 2 * s); g.lineTo(x + tw - 0.6 * s, y); g.closePath(); g.fill();
        g.fillStyle = rgba('#ffe6c0', 0.28); g.fillRect(x + 1.4 * s, y - rowH + 1 * s, tw * 0.28, rowH - 2.4 * s);
      }
    }
  },
  slate(g, W, H, p, color, k) {
    const r = p.r, s = p.s, rowH = 5 * s, tw = 8 * s;
    const gr = g.createLinearGradient(0, 0, W, H); gr.addColorStop(0, lit(color, k + 0.14)); gr.addColorStop(1, lit(color, k - 0.12));
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
    for (let y = H, row = 0; y > -rowH; y -= rowH, row++) {
      for (let x = (row % 2) * -tw / 2; x < W; x += tw) {
        g.fillStyle = lit(color, k + r.range(-0.12, 0.1)); g.fillRect(x + 0.5 * s, y - rowH + 0.6 * s, tw - 1 * s, rowH - 0.6 * s);
        g.fillStyle = rgba('#e8f0ff', 0.2); g.fillRect(x + 0.5 * s, y - 1.6 * s, tw - 1 * s, 0.9 * s);
      }
      g.fillStyle = rgba('#0e1424', 0.35); g.fillRect(0, y - rowH, W, 0.9 * s);
    }
  },
  thatch(g, W, H, p, color = '#c9a24a', k) {
    const r = p.r, s = p.s;
    const gr = g.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, lit(color, k - 0.08)); gr.addColorStop(1, lit(color, k + 0.1));
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
    g.lineCap = 'round';
    for (let i = 0; i < (W * H) / (7 * s * s); i++) {
      const x = r() * W, y = r() * H, l = r.range(5, 11) * s;
      g.strokeStyle = r() < 0.5 ? lit(color, k + r.range(0.05, 0.25)) : lit(color, k - r.range(0.1, 0.3));
      g.lineWidth = r.range(0.6, 1.2) * s; g.beginPath(); g.moveTo(x, y); g.lineTo(x + r.range(-1, 1) * s, y + l); g.stroke();
    }
    for (let y = H * 0.33; y < H; y += H * 0.33) { g.fillStyle = rgba('#5a3c12', 0.25); g.fillRect(0, y, W, 1.4 * s); }
    // frange à l'égout
    for (let x = 0; x < W; x += 2.2 * s) { g.strokeStyle = lit(color, k - r.range(0, 0.25)); g.lineWidth = 1 * s; g.beginPath(); g.moveTo(x, 3 * s); g.lineTo(x + r.range(-1, 1) * s, -2 * s); g.stroke(); }
  },
  shingle(g, W, H, p, color = '#8a5a32', k) { ROOF.slate(g, W, H, p, color, k); },
};

// ───────── Tour ronde (fût de pierre, créneaux, toit conique) ─────────
export function tower(p, cu, cv, r, z0, z1, { roof = '#3f6fa3', roofH = 46, stone = '#e2c896', crenels = true, flag = null, roofKind = 'slate', finial = '#e2b84a', windows = 2 } = {}) {
  const g = p.g, s = p.s;
  const rx = r * 90.5 * s, ry = r * 45.25 * s;
  const c0 = p.P(cu, cv, z0), c1 = p.P(cu, cv, z1);
  // fût
  g.save();
  g.beginPath(); g.ellipse(c0[0], c0[1], rx, ry, 0, 0, Math.PI); g.lineTo(c1[0] - rx, c1[1]); g.ellipse(c1[0], c1[1], rx, ry, 0, Math.PI, 0, true); g.closePath();
  const gr = g.createLinearGradient(c0[0] - rx, 0, c0[0] + rx, 0);
  gr.addColorStop(0, lit(stone, -0.05)); gr.addColorStop(0.28, lit(stone, 0.16)); gr.addColorStop(0.62, lit(stone, -0.12)); gr.addColorStop(1, lit(stone, -0.36));
  g.fillStyle = gr; g.fill();
  g.clip();
  // assises et joints
  const r0 = p.r, bh = 8 * s;
  for (let z = 0, row = 0; c0[1] - z > c1[1] - ry; z += bh, row++) {
    const cy = c0[1] - z;
    g.strokeStyle = rgba('#3a2a1c', 0.4); g.lineWidth = 0.9 * s; g.beginPath(); g.ellipse(c0[0], cy, rx, ry, 0, 0, Math.PI); g.stroke();
    for (let a = (row % 2) * 0.22 + 0.1; a < Math.PI; a += r0.range(0.32, 0.48)) {
      const x = c0[0] + rx * Math.cos(a), y = cy + ry * Math.sin(a);
      g.beginPath(); g.moveTo(x, y); g.lineTo(x, y - bh); g.stroke();
    }
    g.strokeStyle = rgba('#fff4d6', 0.18); g.beginPath(); g.ellipse(c0[0], cy - 1.2 * s, rx, ry, 0, 0.2, 1.4); g.stroke();
  }
  // occlusion au pied
  const ag = g.createLinearGradient(0, c0[1], 0, c0[1] - 16 * s); ag.addColorStop(0, 'rgba(30,20,10,0.4)'); ag.addColorStop(1, 'rgba(30,20,10,0)');
  g.fillStyle = ag; g.fillRect(c0[0] - rx, c0[1] - 16 * s, rx * 2, 16 * s + ry);
  g.restore();
  g.beginPath(); g.ellipse(c0[0], c0[1], rx, ry, 0, 0, Math.PI); g.lineTo(c1[0] - rx, c1[1]); g.moveTo(c0[0] + rx, c0[1]); g.lineTo(c1[0] + rx, c1[1]); strokeInk(p, 1.2);
  // meurtrières / fenêtres
  for (let i = 0; i < windows; i++) {
    const zz = z0 + (z1 - z0) * (0.35 + 0.35 * i), x = c0[0] - rx * 0.25 + i * rx * 0.1, y = p.P(cu, cv, zz)[1] + ry * 0.85;
    g.fillStyle = '#2a1c12'; g.beginPath(); g.ellipse(x, y - 5 * s, 2.2 * s, 6 * s, 0, 0, 7); g.fill();
    g.fillStyle = i === windows - 1 ? '#f2a640' : '#3f5878'; g.beginPath(); g.ellipse(x, y - 5 * s, 1.3 * s, 4.8 * s, 0, 0, 7); g.fill();
  }
  let top = z1;
  if (crenels) {
    // chemin de ronde en encorbellement + merlons
    const cz = p.P(cu, cv, z1);
    g.beginPath(); g.ellipse(cz[0], cz[1], rx * 1.12, ry * 1.12, 0, 0, Math.PI * 2); g.fillStyle = lit(stone, -0.08); g.fill(); strokeInk(p, 1);
    g.beginPath(); g.ellipse(cz[0], cz[1] + 3 * s, rx * 1.12, ry * 1.12, 0, 0, Math.PI); g.lineTo(cz[0] - rx * 1.12, cz[1]); g.ellipse(cz[0], cz[1], rx * 1.12, ry * 1.12, 0, Math.PI, 0, true); g.fillStyle = lit(stone, -0.2); g.fill();
    const n = 7;
    for (let i = 0; i < n; i++) {
      const a = Math.PI * (i + 0.5) / n, x = cz[0] + rx * 1.1 * Math.cos(a), y = cz[1] + ry * 1.1 * Math.sin(a);
      const w = 6.5 * s, h = 7 * s;
      const mg = g.createLinearGradient(x - w, 0, x + w, 0); mg.addColorStop(0, lit(stone, 0.12)); mg.addColorStop(1, lit(stone, -0.25));
      g.fillStyle = mg; g.fillRect(x - w / 2, y - h, w, h); g.strokeStyle = INK; g.lineWidth = 0.9 * s; g.strokeRect(x - w / 2, y - h, w, h);
    }
    top = z1 + 2;
  }
  if (roof) cone(p, cu, cv, r * 1.18, top, roofH, roof, roofKind, finial);
  if (flag) banner(p, cu, cv, top + roofH + 4, flag);
  return { rx, ry };
}
// Toit conique (rangs d'ardoises ou de tuiles en écailles)
export function cone(p, cu, cv, r, z, h, color, kind = 'slate', finial = '#e2b84a') {
  const g = p.g, s = p.s;
  const rx = r * 90.5 * s, ry = r * 45.25 * s;
  const b = p.P(cu, cv, z), a = p.P(cu, cv, z + h);
  g.save();
  g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0] - rx, b[1]); g.ellipse(b[0], b[1], rx, ry, 0, Math.PI, 0, true); g.closePath();
  const gr = g.createLinearGradient(b[0] - rx, 0, b[0] + rx, 0);
  gr.addColorStop(0, lit(color, 0.05)); gr.addColorStop(0.3, lit(color, 0.22)); gr.addColorStop(0.7, lit(color, -0.18)); gr.addColorStop(1, lit(color, -0.4));
  g.fillStyle = gr; g.fill(); g.clip();
  const rows = Math.round(h / (6 * (kind === 'tile' ? 1.1 : 1)));
  for (let i = 0; i < rows; i++) {
    const t = i / rows, cx = b[0] + (a[0] - b[0]) * t, cy = b[1] + (a[1] - b[1]) * t, rxt = rx * (1 - t), ryt = ry * (1 - t);
    g.strokeStyle = rgba('#10162a', 0.35); g.lineWidth = 1 * s; g.beginPath(); g.ellipse(cx, cy, rxt, ryt, 0, 0, Math.PI); g.stroke();
    const n = Math.max(3, Math.round(rxt / (4 * s)));
    for (let j = 0; j <= n; j++) {
      const ang = (Math.PI * (j + (i % 2) * 0.5)) / n, x = cx + rxt * Math.cos(ang), y = cy + ryt * Math.sin(ang);
      g.strokeStyle = rgba('#10162a', 0.22); g.beginPath(); g.moveTo(x, y); g.lineTo(x + (a[0] - x) * 0.06, y - 5 * s); g.stroke();
    }
  }
  g.restore();
  g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0] - rx, b[1]); g.ellipse(b[0], b[1], rx, ry, 0, Math.PI, 0, true); g.closePath(); strokeInk(p, 1.2);
  // reflet sur l'arête éclairée
  g.strokeStyle = rgba('#fff4d6', 0.35); g.lineWidth = 1.2 * s; g.beginPath(); g.moveTo(a[0] - 1 * s, a[1] + 2 * s); g.lineTo(b[0] - rx * 0.55, b[1] + ry * 0.2); g.stroke();
  // épi de faîtage doré
  g.strokeStyle = INK; g.lineWidth = 2.6 * s; g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(a[0], a[1] - 9 * s); g.stroke();
  g.strokeStyle = finial; g.lineWidth = 1.4 * s; g.stroke();
  g.fillStyle = finial; g.beginPath(); g.arc(a[0], a[1] - 9 * s, 2 * s, 0, 7); g.fill(); g.strokeStyle = INK; g.lineWidth = 0.8 * s; g.stroke();
}
// Bannière (mât + tissu ondulé), couleur(s) du blason
export function banner(p, cu, cv, z, colors, len = 26) {
  const g = p.g, s = p.s;
  const [x, y] = p.P(cu, cv, z);
  const [c1, c2] = Array.isArray(colors) ? colors : [colors, lit(colors, 0.35)];
  g.strokeStyle = INK; g.lineWidth = 2.4 * s; g.beginPath(); g.moveTo(x, y); g.lineTo(x, y - 30 * s); g.stroke();
  g.strokeStyle = '#d9b25a'; g.lineWidth = 1.1 * s; g.stroke();
  const L = len * s, h = 11 * s, y0 = y - 29 * s;
  g.beginPath(); g.moveTo(x, y0);
  g.bezierCurveTo(x + L * 0.35, y0 - 3 * s, x + L * 0.65, y0 + 3 * s, x + L, y0 + 1 * s);
  g.lineTo(x + L * 0.85, y0 + h * 0.55); g.lineTo(x + L, y0 + h + 1 * s);
  g.bezierCurveTo(x + L * 0.65, y0 + h + 3 * s, x + L * 0.35, y0 + h - 3 * s, x, y0 + h); g.closePath();
  const gr = g.createLinearGradient(x, y0, x + L, y0); gr.addColorStop(0, c1); gr.addColorStop(0.5, lit(c1, 0.15)); gr.addColorStop(1, lit(c1, -0.2));
  g.fillStyle = gr; g.fill(); strokeInk(p, 1);
  g.fillStyle = c2; g.beginPath(); g.moveTo(x + L * 0.18, y0 + h * 0.3); g.lineTo(x + L * 0.45, y0 + h * 0.3); g.lineTo(x + L * 0.45, y0 + h * 0.72); g.lineTo(x + L * 0.18, y0 + h * 0.72); g.closePath(); g.fill();
}

// ───────── Ombres portées, sol, eau ─────────
// Ombre douce d'un volume : la base du volume étirée vers la droite (soleil en haut à gauche), floutée
export function dropShadow(p, u0, v0, u1, v1, height, alpha = 0.34) {
  const g = p.sg || p.g, d = height * 0.0026; // p.sg : calque du sol (l'ombre n'est pas cuite avec le bâtiment)
  g.save();
  if (p.sg && p.sgOff) g.translate(p.sgOff[0], p.sgOff[1]);
  g.filter = `blur(${5 * p.s}px)`;
  g.fillStyle = `rgba(22,30,12,${alpha})`;
  poly(g, [p.P(u0, v0), p.P(u1 + d, v0 - d * 0.2), p.P(u1 + d, v1 - d * 0.2), p.P(u1, v1), p.P(u0, v1)]); g.fill();
  g.restore();
}
export function roundShadow(p, cu, cv, r, height, alpha = 0.32) {
  const g = p.sg || p.g, [x, y] = p.P(cu + height * 0.003, cv - height * 0.001);
  g.save(); if (p.sg && p.sgOff) g.translate(p.sgOff[0], p.sgOff[1]); g.filter = `blur(${5 * p.s}px)`; g.fillStyle = `rgba(22,30,12,${alpha})`;
  g.beginPath(); g.ellipse(x + height * 0.12 * p.s, y, r * 90.5 * p.s + height * 0.12 * p.s, r * 45.25 * p.s + 3 * p.s, 0, 0, 7); g.fill(); g.restore();
}
// Case d'herbe vive (dégradé, brins, fleurs), ou de terre battue / pavés
export function groundTile(p, u, v, kind = 'grass') {
  const g = p.g, s = p.s, r = p.r;
  const pts = [p.P(u, v), p.P(u + 1, v), p.P(u + 1, v + 1), p.P(u, v + 1)];
  g.save(); poly(g, pts); g.clip();
  const [cx, cy] = p.P(u + 0.5, v + 0.5);
  if (kind === 'grass') {
    const gr = g.createRadialGradient(cx - 30 * s, cy - 20 * s, 10 * s, cx, cy, 90 * s); gr.addColorStop(0, '#9fd25a'); gr.addColorStop(1, '#6fae3c');
    g.fillStyle = gr; g.fillRect(cx - 70 * s, cy - 40 * s, 140 * s, 80 * s);
    for (let i = 0; i < 70; i++) {
      const x = cx + r.range(-64, 64) * s, y = cy + r.range(-32, 32) * s;
      g.strokeStyle = r() < 0.6 ? rgba('#4f8a2a', 0.55) : rgba('#c6ec7a', 0.6); g.lineWidth = 0.9 * s;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + r.range(-1.5, 1.5) * s, y - r.range(2, 5) * s); g.stroke();
    }
    for (let i = 0; i < 4; i++) { g.fillStyle = r.pick(['#fff4d6', '#ffd95a', '#f08aa0', '#b6d4ff']); g.beginPath(); g.arc(cx + r.range(-50, 50) * s, cy + r.range(-22, 22) * s, 1.3 * s, 0, 7); g.fill(); }
  } else if (kind === 'dirt') {
    const gr = g.createRadialGradient(cx, cy, 10 * s, cx, cy, 90 * s); gr.addColorStop(0, '#d8b880'); gr.addColorStop(1, '#b8925a');
    g.fillStyle = gr; g.fillRect(cx - 70 * s, cy - 40 * s, 140 * s, 80 * s);
    for (let i = 0; i < 40; i++) { g.fillStyle = rgba(r() < 0.5 ? '#8a6a3c' : '#f0dcb0', 0.4); g.beginPath(); g.ellipse(cx + r.range(-60, 60) * s, cy + r.range(-30, 30) * s, r.range(1, 3) * s, r.range(0.6, 1.5) * s, 0, 0, 7); g.fill(); }
  } else if (kind === 'cobble') {
    g.fillStyle = '#9c8c74'; g.fillRect(cx - 70 * s, cy - 40 * s, 140 * s, 80 * s);
    for (let y = -36; y < 36; y += 5) for (let x = -66 + (y % 10 ? 3 : 0); x < 66; x += 7) { g.fillStyle = lit('#b9a98c', r.range(-0.12, 0.12)); g.beginPath(); g.ellipse(cx + x * s, cy + y * s, 3.1 * s, 1.9 * s, 0, 0, 7); g.fill(); g.fillStyle = rgba('#ffffff', 0.18); g.beginPath(); g.ellipse(cx + (x - 0.6) * s, cy + (y - 0.6) * s, 1.6 * s, 0.8 * s, 0, 0, 7); g.fill(); }
  }
  g.restore();
}
// Eau (douves) : bande isométrique entre deux bords, reflets et vaguelettes
export function water(p, pts, phase = 0) {
  const g = p.g, s = p.s, r = rng(7);
  g.save(); poly(g, pts); g.clip();
  const xs = pts.map((q) => q[0]), ys = pts.map((q) => q[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const gr = g.createLinearGradient(0, y0, 0, y1); gr.addColorStop(0, '#2e7fa8'); gr.addColorStop(0.5, '#3fa0c4'); gr.addColorStop(1, '#2a6f96');
  g.fillStyle = gr; g.fillRect(x0, y0, x1 - x0, y1 - y0);
  for (let i = 0; i < (x1 - x0) * (y1 - y0) / (260 * s * s); i++) {
    const x = r.range(x0, x1), y = r.range(y0, y1), w = r.range(5, 12) * s;
    g.strokeStyle = rgba('#d8f4ff', r.range(0.35, 0.7)); g.lineWidth = 1 * s;
    g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + w / 2, y - 2 * s * Math.sin(phase + i), x + w, y); g.stroke();
  }
  g.restore();
  poly(g, pts); g.strokeStyle = rgba('#1c3b4e', 0.7); g.lineWidth = 1.4 * s; g.stroke();
}
// Petit personnage (garde, paysan) : silhouette lisible de ~14 px à l'échelle 1
export function figure(p, x, y, { tunic = '#b43c2c', skin = '#f1c79a', hat = null, spear = false, helm = false, load = null } = {}) {
  const g = p.g, s = p.s;
  g.save(); g.translate(x, y); g.scale(s, s);
  g.fillStyle = 'rgba(20,28,10,0.3)'; g.beginPath(); g.ellipse(1.5, 0, 4.5, 1.6, 0, 0, 7); g.fill();
  g.fillStyle = '#3a2a1c'; g.fillRect(-2, -4.5, 1.6, 4.5); g.fillRect(0.6, -4.5, 1.6, 4.5);
  g.fillStyle = tunic; g.beginPath(); g.moveTo(-3.2, -4); g.lineTo(3.2, -4); g.lineTo(2.4, -10.5); g.lineTo(-2.4, -10.5); g.closePath(); g.fill();
  g.strokeStyle = INK; g.lineWidth = 0.7; g.stroke();
  g.fillStyle = skin; g.beginPath(); g.arc(0, -12.6, 2.4, 0, 7); g.fill(); g.stroke();
  if (helm) { g.fillStyle = '#9aa3ad'; g.beginPath(); g.arc(0, -13.2, 2.6, Math.PI, 0); g.fill(); g.stroke(); }
  if (hat) { g.fillStyle = hat; g.beginPath(); g.ellipse(0, -14.2, 3.8, 1.2, 0, 0, 7); g.fill(); g.stroke(); g.fillRect(-1.8, -16.4, 3.6, 2.2); }
  if (spear) { g.strokeStyle = '#6b4a2a'; g.lineWidth = 0.9; g.beginPath(); g.moveTo(3.6, -2); g.lineTo(3.6, -20); g.stroke(); g.fillStyle = '#c9d0d8'; g.beginPath(); g.moveTo(3.6, -23); g.lineTo(2.4, -19.6); g.lineTo(4.8, -19.6); g.closePath(); g.fill(); }
  if (load) { g.fillStyle = load; g.beginPath(); g.ellipse(-3.6, -8.5, 2.6, 2.2, 0, 0, 7); g.fill(); g.stroke(); }
  g.restore();
}
// Fumée de cheminée (quelques volutes douces)
export function smoke(p, x, y, n = 4) {
  // Hors cuisson (pas de contour) : la fumée est différée sur le calque des effets quand il existe (p.fx)
  if (p.fx) { const s0 = p.s; p.fx.push((g) => smoke({ g, s: s0 }, x, y, n)); return; }
  const g = p.g, s = p.s;
  for (let i = 0; i < n; i++) {
    const rr = (4 + i * 2.6) * s;
    const gr = g.createRadialGradient(x + i * 4 * s, y - i * 9 * s, 0, x + i * 4 * s, y - i * 9 * s, rr);
    gr.addColorStop(0, `rgba(240,236,228,${0.55 - i * 0.1})`); gr.addColorStop(1, 'rgba(240,236,228,0)');
    g.fillStyle = gr; g.beginPath(); g.arc(x + i * 4 * s, y - i * 9 * s, rr, 0, 7); g.fill();
  }
}
