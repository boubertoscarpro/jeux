// v21 « Couleurs du Royaume » — Couche de vie de la carte du royaume : passants, gardes sur les remparts, charrettes
// dans l'allée, oiseaux, ombres de nuages, fumées des ateliers au travail, reflets sur l'eau. Un canvas à la taille de
// l'affichage, posé au-dessus de la scène (sans clic), qui suit la caméra. ~30 images/s, en pause quand l'onglet est
// caché ; image fixe en mouvement réduit, en mode économie ou en qualité basse. Les quantités viennent de
// systems/life.js (état réel du royaume).
import { toScreen } from '../../systems/iso.js';
import { INK, rng } from './paint.js';

const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
// ───────── Personnages cuits (2 pas de marche) ─────────
const FIG = new Map();
const K = 3; // résolution des petits dessins
function figSprite(kind, step) {
  const key = kind + step;
  if (FIG.has(key)) return FIG.get(key);
  const c = mk(20 * K, 34 * K), g = c.getContext('2d');
  g.scale(K, K); g.translate(10, 30);
  const P = { peasant0: ['#b43c2c', '#7a5a3a'], peasant1: ['#3f6fa3', null], peasant2: ['#5f8a3a', '#e2b84a'], peasant3: ['#c58a3a', null], peasant4: ['#8a4aa8', null], guard: ['#2f5fb0', null], guardRaid: ['#a83a2a', null] }[kind] || ['#b43c2c', null];
  const guard = kind.startsWith('guard');
  const sw = step ? 1.2 : -1.2;
  g.fillStyle = 'rgba(20,28,10,0.32)'; g.beginPath(); g.ellipse(1, 0, 4.6, 1.6, 0, 0, 7); g.fill();
  g.fillStyle = '#3a2a1c'; g.fillRect(-2 + sw * 0.5, -4.5, 1.6, 4.5); g.fillRect(0.6 - sw * 0.5, -4.5, 1.6, 4.5);
  g.lineWidth = 0.7; g.strokeStyle = INK;
  g.fillStyle = P[0]; g.beginPath(); g.moveTo(-3.3, -4); g.lineTo(3.3, -4); g.lineTo(2.4, -10.6); g.lineTo(-2.4, -10.6); g.closePath(); g.fill(); g.stroke();
  if (guard) { g.fillStyle = '#f1d36a'; g.fillRect(-0.6, -10, 1.2, 5.5); }
  g.fillStyle = '#f1c79a'; g.beginPath(); g.arc(0, -12.7, 2.4, 0, 7); g.fill(); g.stroke();
  if (guard) {
    g.fillStyle = '#9aa3ad'; g.beginPath(); g.arc(0, -13.3, 2.7, Math.PI, 0); g.fill(); g.stroke();
    g.strokeStyle = '#6b4a2a'; g.lineWidth = 0.9; g.beginPath(); g.moveTo(3.8, -2); g.lineTo(3.8, -21); g.stroke();
    g.fillStyle = '#d8dee6'; g.beginPath(); g.moveTo(3.8, -24); g.lineTo(2.6, -20.4); g.lineTo(5, -20.4); g.closePath(); g.fill();
  } else if (P[1]) {
    g.fillStyle = P[1]; g.beginPath(); g.ellipse(0, -14.3, 3.8, 1.2, 0, 0, 7); g.fill(); g.stroke(); g.fillRect(-1.8, -16.5, 3.6, 2.2);
  }
  if (kind === 'peasant0' || kind === 'peasant3') { g.fillStyle = '#d8b47a'; g.beginPath(); g.ellipse(-3.8, -8.6, 2.6, 2.2, 0, 0, 7); g.fill(); g.stroke(); }
  FIG.set(key, c);
  return c;
}
function cartSprite(dir) {
  const key = 'cart' + dir;
  if (FIG.has(key)) return FIG.get(key);
  const c = mk(56 * K, 40 * K), g = c.getContext('2d');
  g.scale(K, K); g.translate(28, 32);
  if (dir < 0) g.scale(-1, 1);
  g.lineWidth = 0.8; g.strokeStyle = INK;
  g.fillStyle = 'rgba(20,28,10,0.3)'; g.beginPath(); g.ellipse(0, 1, 20, 4, -0.45, 0, 7); g.fill();
  // cheval (devant, vers le bas-gauche)
  g.fillStyle = '#7a4a26'; g.beginPath(); g.ellipse(-12, -8, 6.5, 3.6, -0.45, 0, 7); g.fill(); g.stroke();
  g.beginPath(); g.moveTo(-16, -10); g.lineTo(-20, -15); g.lineTo(-17.5, -16.5); g.lineTo(-14, -11); g.closePath(); g.fill(); g.stroke();
  g.fillStyle = '#3a2a1c'; for (const x of [-16, -13, -10, -7.5]) g.fillRect(x, -5, 1.2, 5);
  // caisse et roues
  g.fillStyle = '#b3824c'; g.beginPath(); g.moveTo(-4, -16); g.lineTo(12, -24); g.lineTo(16, -18); g.lineTo(0, -10); g.closePath(); g.fill(); g.stroke();
  g.fillStyle = '#8a5a30'; g.beginPath(); g.moveTo(0, -10); g.lineTo(16, -18); g.lineTo(16, -13); g.lineTo(0, -5); g.closePath(); g.fill(); g.stroke();
  g.fillStyle = '#e2c27a'; g.beginPath(); g.ellipse(6, -19, 6, 3, -0.45, 0, 7); g.fill(); g.stroke();
  g.fillStyle = '#5a3a20'; for (const [x, y] of [[3, -5], [13, -10]]) { g.beginPath(); g.ellipse(x, y, 2.6, 3.6, 0, 0, 7); g.fill(); g.stroke(); }
  FIG.set(key, c);
  return c;
}

// ───────── État de la couche ─────────
const L = { cv: null, vp: null, app: null, data: null, ents: [], raf: 0, last: 0, t0: 0, still: false, frames: 0, fpsT: 0, fps: 0 };
export const lifeStats = () => ({ entities: L.ents.length, fps: L.fps, still: L.still });

// data : { f, R, walk: [[x,y]], allee: [[x,y]], perim: [[x,y]…] (rempart avant), wallH, water: [[x,y]], fx: [{x,y,n}],
//          density (systems/life.js) }
export function mountLife(vp, app, data) {
  if (!vp) return;
  if (!L.cv) { L.cv = mk(1, 1); L.cv.className = 'paint-life'; L.cv.setAttribute('aria-hidden', 'true'); }
  const world = vp.querySelector('.iso-world');
  if (L.cv.parentElement !== vp || L.cv.previousElementSibling !== world) world.after(L.cv);
  L.vp = vp; L.app = app;
  const key = JSON.stringify([data.density, data.walk.length, data.allee, data.perim, data.fx.length]);
  if (!L.data || L.data.key !== key) { L.data = { ...data, key }; spawn(); }
  else L.data = { ...data, key };
  const html = document.documentElement;
  L.still = html.classList.contains('reduce-motion') || html.classList.contains('saver') || html.classList.contains('gfx-low') || matchMedia('(prefers-reduced-motion: reduce)').matches || !!app.ui.photo;
  resize();
  if (L.still) { cancelAnimationFrame(L.raf); L.raf = 0; draw(1.7); }
  else if (!L.raf) { L.t0 = performance.now(); L.raf = requestAnimationFrame(loop); }
}
export function lifeRedraw() { if (L.cv?.isConnected) { resize(); draw(L.still ? 1.7 : (performance.now() - L.t0) / 1000); } }
function resize() {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = Math.max(1, Math.round(L.vp.clientWidth * dpr)), h = Math.max(1, Math.round(L.vp.clientHeight * dpr));
  if (L.cv.width !== w || L.cv.height !== h) { L.cv.width = w; L.cv.height = h; }
  L.dpr = dpr;
}
function loop(now) {
  if (!L.cv?.isConnected) { L.raf = 0; return; }
  L.raf = requestAnimationFrame(loop);
  if (document.hidden || now - L.last < 32) return;
  const dt = Math.min(0.1, (now - (L.last || now)) / 1000);
  L.last = now;
  step(dt);
  draw((now - L.t0) / 1000);
  L.frames++;
  if (now - L.fpsT > 1000) { L.fps = Math.round((L.frames * 1000) / (now - L.fpsT)); L.frames = 0; L.fpsT = now; }
}

// ───────── Entités ─────────
function spawn() {
  const d = L.data, n = d.density, r = rng(d.walk.length * 7 + 3);
  L.ents = [];
  const walkSet = new Set(d.walk.map(([x, y]) => x + ',' + y));
  L.walkSet = walkSet;
  for (let i = 0; i < n.peasants && d.walk.length; i++) {
    const [x, y] = d.walk[Math.floor((i * 0.618034 + r() * 0.1) * d.walk.length) % d.walk.length];
    L.ents.push({ k: 'p', kind: 'peasant' + (i % 5), tx: x, ty: y, x: x + 0.3 + r() * 0.4, y: y + 0.3 + r() * 0.4, gx: x + 0.5, gy: y + 0.5, speed: 0.35 + r() * 0.25, wait: r() * 3, ph: r() * 6, px: x, py: y });
  }
  const per = d.perim;
  if (per.length > 1) for (let i = 0; i < n.guards; i++) L.ents.push({ k: 'g', kind: n.raid ? 'guardRaid' : 'guard', s: (i + 0.5) / n.guards, dir: i % 2 ? 1 : -1, speed: 0.012 + r() * 0.01, ph: r() * 6 });
  if (d.allee.length > 1) for (let i = 0; i < n.carts; i++) L.ents.push({ k: 'c', s: r(), dir: i % 2 ? 1 : -1, speed: 0.04 + r() * 0.02 });
  for (let i = 0; i < n.birds; i++) L.ents.push({ k: 'b', x: r() * d.f.width, y: 60 + r() * d.f.height * 0.5, vx: 22 + r() * 14, ph: r() * 6, size: 3 + Math.floor(r() * 3) });
  for (let i = 0; i < n.clouds; i++) L.ents.push({ k: 'cl', x: r() * d.f.width, y: r() * d.f.height, vx: 6 + r() * 5, rx: 260 + r() * 260, ry: 120 + r() * 90 });
}
function step(dt) {
  const d = L.data;
  for (const e of L.ents) {
    if (e.k === 'p') {
      if (e.wait > 0) { e.wait -= dt; continue; }
      const dx = e.gx - e.x, dy = e.gy - e.y, dist = Math.hypot(dx, dy);
      if (dist < 0.05) {
        // case suivante : un voisin praticable, de préférence sans revenir en arrière
        const nb = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([a, b]) => [e.tx + a, e.ty + b]).filter(([x, y]) => L.walkSet.has(x + ',' + y));
        const fwd = nb.filter(([x, y]) => x !== e.px || y !== e.py);
        const pick = (fwd.length ? fwd : nb)[Math.floor(Math.random() * (fwd.length || nb.length || 1))];
        if (!pick || Math.random() < 0.18) { e.wait = 1 + Math.random() * 3; continue; }
        e.px = e.tx; e.py = e.ty; e.tx = pick[0]; e.ty = pick[1];
        e.gx = e.tx + 0.25 + Math.random() * 0.5; e.gy = e.ty + 0.25 + Math.random() * 0.5;
      } else { const v = Math.min(dist, e.speed * dt); e.x += (dx / dist) * v; e.y += (dy / dist) * v; e.mx = dx; e.my = dy; }
      e.ph += dt * 8;
    } else if (e.k === 'g' || e.k === 'c') {
      e.s += e.dir * e.speed * dt;
      if (e.s > 1) { e.s = 1; e.dir = -1; } else if (e.s < 0) { e.s = 0; e.dir = 1; }
      e.ph = (e.ph || 0) + dt * 6;
    } else if (e.k === 'b') { e.x += e.vx * dt; e.ph += dt * 9; if (e.x > d.f.width + 80) { e.x = -80; e.y = 60 + Math.random() * d.f.height * 0.5; } }
    else if (e.k === 'cl') { e.x += e.vx * dt; if (e.x - e.rx > d.f.width) e.x = -e.rx; }
  }
}
// point le long d'une ligne brisée (coordonnées de grille), s dans [0, 1]
function along(path, s) {
  let tot = 0; const seg = [];
  for (let i = 1; i < path.length; i++) { const l = Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]); seg.push(l); tot += l; }
  let at = s * tot;
  for (let i = 0; i < seg.length; i++) {
    if (at <= seg[i] || i === seg.length - 1) { const k = seg[i] ? Math.min(1, at / seg[i]) : 0; return [path[i][0] + (path[i + 1][0] - path[i][0]) * k, path[i][1] + (path[i + 1][1] - path[i][1]) * k, i]; }
    at -= seg[i];
  }
  return [path[0][0], path[0][1], 0];
}

// ───────── Dessin ─────────
function draw(t) {
  const cv = L.cv, g = cv.getContext('2d'), cam = L.app.ui.cityCam || { x: 0, y: 0, z: 1 };
  g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, cv.width, cv.height);
  const z = cam.z * L.dpr;
  g.setTransform(z, 0, 0, z, cam.x * L.dpr, cam.y * L.dpr);
  // fenêtre visible (coordonnées du monde) pour ne dessiner que l'utile
  const vx0 = -cam.x / cam.z - 60, vy0 = -cam.y / cam.z - 80;
  paintLife(g, t, [vx0, vy0, vx0 + cv.width / z + 120, vy0 + cv.height / z + 160]);
}
// Image de la vie dans le repère du monde (mode photo) : g déjà mis à l'échelle par l'appelant
export function lifeInto(g, t = 1.7) { if (L.data) paintLife(g, t, [-1e9, -1e9, 1e9, 1e9]); }
function paintLife(g, t, [vx0, vy0, vx1, vy1]) {
  const d = L.data;
  const vis = (x, y) => x > vx0 && x < vx1 && y > vy0 && y < vy1;
  const f = d.f;
  // ombres des nuages (au sol)
  for (const e of L.ents) if (e.k === 'cl') {
    const gr = g.createRadialGradient(e.x, e.y, 0, e.x, e.y, e.rx);
    gr.addColorStop(0, 'rgba(20,34,40,0.13)'); gr.addColorStop(1, 'rgba(20,34,40,0)');
    g.save(); g.translate(e.x, e.y); g.scale(1, e.ry / e.rx); g.translate(-e.x, -e.y); g.fillStyle = gr; g.beginPath(); g.arc(e.x, e.y, e.rx, 0, 7); g.fill(); g.restore();
  }
  // reflets sur l'eau
  for (let i = 0; i < d.water.length; i++) {
    const [wx, wy] = d.water[i], q = toScreen(f, wx + 0.5, wy + 0.5);
    if (!vis(q.sx, q.sy)) continue;
    for (let j = 0; j < 2; j++) {
      const ph = Math.sin(t * 1.6 + i * 1.7 + j * 2.3);
      const a = Math.max(0, ph) ** 6;
      if (a < 0.05) continue;
      const x = q.sx + ((i * 37 + j * 53) % 60) - 30, y = q.sy + ((i * 23 + j * 31) % 24) - 12;
      g.strokeStyle = `rgba(255,255,255,${(0.85 * a).toFixed(3)})`; g.lineWidth = 1.2;
      g.beginPath(); g.moveTo(x - 4, y); g.lineTo(x + 4, y); g.moveTo(x, y - 2.4); g.lineTo(x, y + 2.4); g.stroke();
    }
  }
  // personnages et charrettes, triés par profondeur
  const list = [];
  for (const e of L.ents) {
    if (e.k === 'p') { const q = toScreen(f, e.x, e.y); if (vis(q.sx, q.sy)) list.push({ y: q.sy, draw: () => { const sp = figSprite(e.kind, e.wait > 0 ? 0 : Math.floor(e.ph) % 2); const flip = (e.mx || 0) - (e.my || 0) < 0; g.save(); g.translate(q.sx, q.sy); if (flip) g.scale(-1, 1); g.drawImage(sp, -10, -30, 20, 34); g.restore(); } }); }
    else if (e.k === 'g') {
      const [gx, gy] = along(d.perim, e.s), q = toScreen(f, gx, gy), yy = q.sy - d.wallH;
      if (!vis(q.sx, yy)) continue;
      list.push({ y: q.sy + 1000, draw: () => {
        const sp = figSprite(e.kind, Math.floor(e.ph) % 2); g.save(); g.translate(q.sx, yy); if (e.dir < 0) g.scale(-1, 1); g.drawImage(sp, -10, -30, 20, 34); g.restore();
        if (d.density.night) { const gr = g.createRadialGradient(q.sx + 5, yy - 18, 0, q.sx + 5, yy - 18, 16); gr.addColorStop(0, 'rgba(255,190,90,0.55)'); gr.addColorStop(1, 'rgba(255,190,90,0)'); g.fillStyle = gr; g.beginPath(); g.arc(q.sx + 5, yy - 18, 16, 0, 7); g.fill(); g.fillStyle = '#ffd36a'; g.beginPath(); g.arc(q.sx + 5, yy - 18, 1.8, 0, 7); g.fill(); }
      } });
    } else if (e.k === 'c') {
      const [gx, gy] = along(d.allee, e.s), q = toScreen(f, gx + 0.5, gy);
      if (vis(q.sx, q.sy)) list.push({ y: q.sy, draw: () => g.drawImage(cartSprite(e.dir), q.sx - 28, q.sy - 32, 56, 40) });
    }
  }
  list.sort((a, b) => a.y - b.y);
  for (const it of list) it.draw();
  // fumées des ateliers au travail
  for (let i = 0; i < d.fx.length; i++) {
    const e = d.fx[i];
    if (!vis(e.x, e.y)) continue;
    for (let j = 0; j < 4; j++) {
      const a = ((t * 0.22 + j / 4 + i * 0.37) % 1);
      const x = e.x + a * 12 + Math.sin(t + i + j) * 2, y = e.y - a * 38, rr = 3 + a * 9;
      const gr = g.createRadialGradient(x, y, 0, x, y, rr);
      gr.addColorStop(0, `rgba(240,236,228,${(0.6 * (1 - a)).toFixed(3)})`); gr.addColorStop(1, 'rgba(240,236,228,0)');
      g.fillStyle = gr; g.beginPath(); g.arc(x, y, rr, 0, 7); g.fill();
    }
  }
  // oiseaux (au-dessus de tout)
  g.strokeStyle = 'rgba(40,30,24,0.8)'; g.lineWidth = 1.4; g.lineCap = 'round';
  for (const e of L.ents) if (e.k === 'b') {
    for (let k = 0; k < e.size; k++) {
      const bx = e.x - k * 14, by = e.y + (k % 2 ? 1 : -1) * k * 6, w = Math.sin(e.ph + k) * 3;
      if (!vis(bx, by)) continue;
      g.beginPath(); g.moveTo(bx - 6, by - w); g.quadraticCurveTo(bx - 3, by - 3, bx, by); g.quadraticCurveTo(bx + 3, by - 3, bx + 6, by - w); g.stroke();
    }
  }
}
