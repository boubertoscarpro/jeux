// Caméra 2D générique : zoom (molette centrée sur le curseur, boutons, pincement) et déplacement (glisser),
// bornée aux limites de la carte. Utilisée par la carte du royaume (grille HTML transformée en CSS) ; la carte du
// monde (canvas) réutilise les mêmes règles via clampWorldCam dans sa vue.
//
// cam = { x, y, z } : translation (px) du contenu dans la fenêtre et facteur d'échelle.

export const DRAG_THRESHOLD = 5; // px : en dessous, c'est un clic (sélection d'une case), pas un déplacement

// Garde le contenu dans la fenêtre : s'il est plus petit, il est centré ; sinon aucun bord vide n'apparaît.
export function clampCam(cam, vpW, vpH, contentW, contentH) {
  const w = contentW * cam.z, h = contentH * cam.z;
  cam.x = w <= vpW ? (vpW - w) / 2 : Math.min(0, Math.max(vpW - w, cam.x));
  cam.y = h <= vpH ? (vpH - h) / 2 : Math.min(0, Math.max(vpH - h, cam.y));
  return cam;
}

// Zoom autour d'un point (px, py) de la fenêtre : ce point reste sous le curseur
export function zoomAt(cam, factor, px, py, zMin, zMax) {
  const z2 = Math.max(zMin, Math.min(zMax, cam.z * factor));
  const k = z2 / cam.z;
  cam.x = px - (px - cam.x) * k;
  cam.y = py - (py - cam.y) * k;
  cam.z = z2;
  return cam;
}

// Zoom qui fait tenir tout le contenu dans la fenêtre
export const fitZoom = (vpW, vpH, contentW, contentH) => Math.min(vpW / contentW, vpH / contentH);

// Lie une fenêtre HTML (.mapvp) à sa caméra. opts : { getCam, content (élément transformé), zMin, zMax, onChange }
export function bindPanZoom(vp, opts) {
  if (!vp || vp.dataset.pz) return;
  vp.dataset.pz = '1';
  const content = () => vp.querySelector('.mapvp-inner');
  const size = () => { const c = content(); return { cw: c.offsetWidth, ch: c.offsetHeight, vw: vp.clientWidth, vh: vp.clientHeight }; };
  const apply = () => {
    const cam = opts.getCam(), sz = size();
    clampCam(cam, sz.vw, sz.vh, sz.cw, sz.ch);
    content().style.transform = `translate(${cam.x}px, ${cam.y}px) scale(${cam.z})`;
    opts.onChange?.(cam);
  };
  vp._apply = apply;
  const pts = new Map();
  let drag = null, pinch = null;
  vp.addEventListener('pointerdown', (e) => {
    if (e.target.closest('.map-tools')) return;
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.size === 1) drag = { x: e.clientX, y: e.clientY, moved: false, id: e.pointerId };
    if (pts.size === 2) {
      const [a, b] = [...pts.values()];
      pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), z: opts.getCam().z };
      if (drag) drag.moved = true;
    }
  });
  vp.addEventListener('pointermove', (e) => {
    if (!pts.has(e.pointerId)) return;
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const cam = opts.getCam();
    if (pinch && pts.size >= 2) {
      const [a, b] = [...pts.values()];
      const rect = vp.getBoundingClientRect();
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      zoomAt(cam, (pinch.z * d / pinch.d) / cam.z, (a.x + b.x) / 2 - rect.left, (a.y + b.y) / 2 - rect.top, opts.zMin, opts.zMax);
      apply();
      return;
    }
    if (!drag || drag.id !== e.pointerId) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (!drag.moved && Math.abs(dx) + Math.abs(dy) > DRAG_THRESHOLD) { drag.moved = true; vp.setPointerCapture?.(e.pointerId); vp.classList.add('dragging'); }
    if (drag.moved) { cam.x += dx; cam.y += dy; drag.x = e.clientX; drag.y = e.clientY; apply(); }
  });
  const end = (e) => {
    pts.delete(e.pointerId);
    if (pts.size < 2) pinch = null;
    if (drag && drag.id === e.pointerId) {
      vp.classList.remove('dragging');
      // Un glisser ne doit pas sélectionner la case sous le curseur
      if (drag.moved) vp._suppressClick = Date.now();
      drag = null;
    }
  };
  vp.addEventListener('pointerup', end);
  vp.addEventListener('pointercancel', end);
  vp.addEventListener('click', (e) => { if (vp._suppressClick && Date.now() - vp._suppressClick < 400) { e.stopPropagation(); e.preventDefault(); vp._suppressClick = 0; } }, true);
  vp.addEventListener('wheel', (e) => {
    e.preventDefault(); // la molette sert au zoom sur la carte uniquement (le reste de la page défile normalement)
    const rect = vp.getBoundingClientRect();
    zoomAt(opts.getCam(), Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.0015)), e.clientX - rect.left, e.clientY - rect.top, opts.zMin, opts.zMax);
    apply();
  }, { passive: false });
  apply();
}
