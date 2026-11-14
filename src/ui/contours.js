// v27 — Contours vectoriels de régions de cases (frontières, brouillard) et lissage de Chaikin : sans dépendance.
// Contours d'une région de cases (inside(x, y) → bool) : boucles de coins de cases, orientées, sans points alignés.
export function regionLoops(S, inside) {
  const next = new Map(); // "x,y" → [points d'arrivée]
  const add = (ax, ay, bx, by) => { const k = ax + ',' + ay; const l = next.get(k); if (l) l.push([bx, by]); else next.set(k, [[bx, by]]); };
  const IN = (x, y) => x >= 0 && y >= 0 && x < S && y < S && inside(x, y);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    if (!IN(x, y)) continue;
    if (!IN(x, y - 1)) add(x, y, x + 1, y);
    if (!IN(x + 1, y)) add(x + 1, y, x + 1, y + 1);
    if (!IN(x, y + 1)) add(x + 1, y + 1, x, y + 1);
    if (!IN(x - 1, y)) add(x, y + 1, x, y);
  }
  const loops = [];
  for (const [k0, l0] of next) {
    while (l0.length) {
      const [sx, sy] = k0.split(',').map(Number), pts = [[sx, sy]];
      let [cx, cy] = l0.pop(), px = sx, py = sy, guard = 0;
      while ((cx !== sx || cy !== sy) && guard++ < 1e6) {
        pts.push([cx, cy]);
        const l = next.get(cx + ',' + cy);
        if (!l || !l.length) break;
        // point selle : on tourne à droite (régions en diagonale séparées)
        let pick = 0;
        if (l.length > 1) { const dx = cx - px, dy = cy - py; pick = l.findIndex(([nx, ny]) => (nx - cx) === -dy && (ny - cy) === dx); if (pick < 0) pick = 0; }
        const [nx, ny] = l.splice(pick, 1)[0];
        px = cx; py = cy; cx = nx; cy = ny;
      }
      // points alignés retirés
      const out = pts.filter((p, i) => { const a = pts[(i - 1 + pts.length) % pts.length], b = pts[(i + 1) % pts.length]; return (p[0] - a[0]) * (b[1] - p[1]) - (p[1] - a[1]) * (b[0] - p[0]) !== 0; });
      if (out.length >= 3) loops.push(out);
    }
  }
  return loops;
}
// Lissage de Chaikin (boucles fermées ou lignes ouvertes)
export function chaikin(pts, iter = 2, closed = true) {
  let p = pts;
  for (let k = 0; k < iter; k++) {
    const o = [];
    const n = p.length;
    if (!closed) o.push(p[0]);
    for (let i = 0; i < (closed ? n : n - 1); i++) {
      const a = p[i], b = p[(i + 1) % n];
      o.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25], [a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]);
    }
    if (!closed) o.push(p[n - 1]);
    p = o;
  }
  return p;
}
export function tracePath(ctx, loops, T, ox, oy, closed = true) {
  for (const l of loops) {
    ctx.moveTo(ox + l[0][0] * T, oy + l[0][1] * T);
    for (let i = 1; i < l.length; i++) ctx.lineTo(ox + l[i][0] * T, oy + l[i][1] * T);
    if (closed) ctx.closePath();
  }
}

