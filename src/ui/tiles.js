// v27 « Netteté et vie » — Tuiles peintes à la taille d'affichage, communes au monde et au château.
//
// Une couche (layer) découpe son plan en tuiles carrées de TILE_PX pixels source. Pour un niveau lv (pixels source par
// unité : par case pour le monde, par px CSS pour le château), une tuile couvre TILE_PX / lv unités. À chaque image, on
// choisit le plus petit niveau qui n'étire jamais une tuile plus de MAG_MAX (1,25), on dessine les tuiles prêtes, et on
// complète les trous avec ce qui existe déjà à d'autres niveaux (repli) pendant que le niveau voulu se peint en
// arrière-plan (requestIdleCallback, par tranches). Une tuile nouvelle apparaît en fondu (FADE_MS) par-dessus son repli.
//
// Le cache est borné en mégaoctets (compte exact largeur × hauteur × 4) : on évince d'abord les couches inactives, puis
// les tuiles d'autres niveaux, puis les plus éloignées de la vue. Les tuiles dessinées à l'image en cours et les tuiles
// épinglées (vue d'ensemble du monde) ne sont jamais évincées.
export const TILE_PX = 512;
export const MAG_MAX = 1.25;
export const FADE_MS = 150;

const cache = new Map(); // clé → entrée
let bytes = 0, frame = 0;
const BUDGET = { high: 96e6, medium: 64e6, low: 32e6 }; // v27.1 : budgets réduits (portable moyen)
let budget = BUDGET.high;
export const tileStats = { painted: 0, paintMs: 0, evicted: 0, syncPainted: 0, peakBytes: 0, workerJobs: 0 };
export const sharp = {}; // agrandissement maximum réel par couche à la dernière image : { id: { mag, lv, need } }
const layers = new Map();
const queue = []; // travaux en attente : { layer, lv, tx, ty, ck, prio, state }
let pumping = 0;

// v27.1 : geste en cours (zoom, glisser) : pas de fondu ni de peinture d'arrière-plan sur le fil principal pendant le
// geste ; elles reprennent 200 ms après le dernier mouvement
let gestureUntil = 0, gestureTimer = 0;
export const gestureActive = () => (typeof performance !== 'undefined' ? performance.now() : 0) < gestureUntil;
const afterGesture = new Set();
export function onGestureEnd(fn) { afterGesture.add(fn); }
export function markGesture() {
  gestureUntil = performance.now() + 200;
  clearTimeout(gestureTimer);
  gestureTimer = setTimeout(() => { for (const fn of afterGesture) fn(); for (const L of layers.values()) L.onReady?.(); pump(); }, 220);
}
export function setTileBudget(quality, bytesOverride = 0) { budget = bytesOverride || BUDGET[quality] || BUDGET.high; evict(); }
// Une boîte [u0, v0, u1, v1] (unités) touche-t-elle la tuile (lv, tx, ty) ?
export function boxTouchesTile(box, lv, tx, ty) {
  const span = TILE_PX / lv, u0 = tx * span, v0 = ty * span;
  return box[2] > u0 && box[0] < u0 + span && box[3] > v0 && box[1] < v0 + span;
}
export const tileBytes = () => bytes;
export const tileCount = () => cache.size;
const kOf = (id, lv, tx, ty) => `${id}|${lv}|${tx}|${ty}`;

// Plus petit niveau qui n'étire pas plus de MAG_MAX ; au-delà du dernier niveau, le dernier (la mesure le dira)
export function pickLevel(levels, need) {
  for (const lv of levels) if (lv * MAG_MAX >= need) return lv;
  return levels[levels.length - 1];
}

/**
 * Déclare une couche.
 * spec : { id, levels, bounds: () => [u0, v0, u1, v1] (unités), key: (lv, tx, ty) → clé de contenu (string),
 *          paint: (cv, lv, tx, ty, job) → true si fini (sinon rappelée plus tard, job.state garde l'avancement),
 *          onReady: () → void (redessiner), pin?: (lv) → bool, sync?: bool (peindre tout de suite si aucun repli),
 *          syncBudget?: ms par image pour la peinture immédiate, syncStale?: bool (contenu changé → repeint tout de suite),
 *          fade?: bool }
 */
export function defineLayer(spec) {
  const L = layers.get(spec.id) || { lastDraw: 0, view: null, lv: 0, epoch: 0 };
  Object.assign(L, spec);
  layers.set(spec.id, L);
  return L;
}
export function dropLayer(id) {
  for (const [k, e] of cache) if (e.id === id) { cache.delete(k); bytes -= e.bytes; }
  for (let i = queue.length - 1; i >= 0; i--) if (queue[i].layer.id === id) queue.splice(i, 1);
}

function mkCanvas(w, h) {
  if (typeof document !== 'undefined') { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
  return { width: w, height: h, getContext: () => null };
}
function store(L, lv, tx, ty, ck, cv, born) {
  const k = kOf(L.id, lv, tx, ty), old = cache.get(k);
  if (old) bytes -= old.bytes;
  const e = { id: L.id, lv, tx, ty, ck, cv, bytes: cv.width * cv.height * 4, born, used: frame, pin: !!L.pin?.(lv) };
  cache.set(k, e); bytes += e.bytes;
  if (bytes > tileStats.peakBytes) tileStats.peakBytes = bytes;
  evict();
  return e;
}

// Éviction : couches inactives (non dessinées depuis 2 s), autres niveaux, puis distance à la vue
export function evict(force = 0) {
  const limit = budget - force;
  if (bytes <= limit) return;
  const now = typeof performance !== 'undefined' ? performance.now() : 0;
  const scored = [];
  for (const [k, e] of cache) {
    const L = layers.get(e.id);
    // jamais les tuiles dessinées à la dernière image de LEUR couche (le sol et la scène se dessinent l'un après l'autre)
    if (e.used === frame || e.pin || (L && e.used >= L.drawFrame)) continue;
    let s = 0;
    if (!L || now - L.lastDraw > 2000) s += 1e9 + (now - (L?.lastDraw || 0));
    else {
      if (e.lv !== L.lv) s += 1e6 + Math.abs(Math.log2(e.lv / L.lv)) * 1e5;
      const span = TILE_PX / e.lv, v = L.view;
      if (v) { const cx = (e.tx + 0.5) * span, cy = (e.ty + 0.5) * span; s += Math.hypot(cx - v.cu, cy - v.cv) / span; }
    }
    scored.push([s, k, e]);
  }
  scored.sort((a, b) => b[0] - a[0]);
  for (const [, k, e] of scored) {
    if (bytes <= limit) break;
    cache.delete(k); bytes -= e.bytes; tileStats.evicted++;
  }
}

// Dessine une tuile (ou une partie) aux bords arrondis au pixel réel : deux tuiles voisines partagent exactement le
// même bord (aucun joint visible)
function blit(ctx, e, cam, alpha = 1, sub = null) {
  const span = TILE_PX / e.lv;
  let u0 = e.tx * span, v0 = e.ty * span, u1 = u0 + span, v1 = v0 + span;
  let sx = 0, sy = 0, sw = e.cv.width, sh = e.cv.height;
  if (sub) { // partie de la tuile (repli d'une tuile plus grossière sous une case de niveau plus fin)
    const a = Math.max(u0, sub[0]), b = Math.max(v0, sub[1]), c = Math.min(u1, sub[2]), d = Math.min(v1, sub[3]);
    if (c <= a || d <= b) return;
    sx = (a - u0) * e.lv; sy = (b - v0) * e.lv; sw = (c - a) * e.lv; sh = (d - b) * e.lv;
    u0 = a; v0 = b; u1 = c; v1 = d;
  }
  // la tuile peut être plus petite au bord du plan
  sw = Math.min(sw, e.cv.width - sx); sh = Math.min(sh, e.cv.height - sy);
  if (sw <= 0 || sh <= 0) return;
  u1 = u0 + sw / e.lv; v1 = v0 + sh / e.lv;
  const X0 = Math.round(cam.ox + u0 * cam.k), Y0 = Math.round(cam.oy + v0 * cam.k);
  const X1 = Math.round(cam.ox + u1 * cam.k), Y1 = Math.round(cam.oy + v1 * cam.k);
  if (X1 <= X0 || Y1 <= Y0) return;
  ctx.globalAlpha = alpha;
  ctx.drawImage(e.cv, sx, sy, sw, sh, X0, Y0, X1 - X0, Y1 - Y0);
  ctx.globalAlpha = 1;
}

/**
 * Dessine la couche. ctx en pixels réels (transformation identité) ; cam = { k: px réels par unité, ox, oy : position
 * réelle de l'unité 0, vw, vh : taille de la zone visible en px réels }. Renvoie le nombre de tuiles encore à peindre.
 */
export function drawLayer(ctx, id, cam) {
  const L = layers.get(id);
  if (!L) return 0;
  frame++;
  L.drawFrame = frame;
  const now = typeof performance !== 'undefined' ? performance.now() : 0;
  L.lastDraw = now;
  const need = cam.k;
  const lv = pickLevel(L.levels, need);
  L.lv = lv;
  const [B0, B1, B2, B3] = L.bounds();
  const vu0 = Math.max(B0, -cam.ox / cam.k), vv0 = Math.max(B1, -cam.oy / cam.k);
  const vu1 = Math.min(B2, (cam.vw - cam.ox) / cam.k), vv1 = Math.min(B3, (cam.vh - cam.oy) / cam.k);
  L.view = { cu: (vu0 + vu1) / 2, cv: (vv0 + vv1) / 2 };
  if (vu1 <= vu0 || vv1 <= vv0) return 0;
  const span = TILE_PX / lv;
  const tx0 = Math.floor(vu0 / span), ty0 = Math.floor(vv0 / span), tx1 = Math.ceil(vu1 / span) - 1, ty1 = Math.ceil(vv1 / span) - 1;
  ctx.imageSmoothingEnabled = true;
  if ('imageSmoothingQuality' in ctx) ctx.imageSmoothingQuality = 'high';
  let missing = 0, fading = false, maxMag = 0, syncLeft = L.syncBudget ?? 0;
  const todo = [];
  for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) {
    const ck = L.key(lv, tx, ty);
    let e = cache.get(kOf(id, lv, tx, ty));
    if (e && e.ck !== ck) e.stale = true;
    if (!e || e.stale) {
      // aucun repli possible et couche « synchrone » : on peint tout de suite (première ouverture du château)
      if (L.sync && syncLeft > 0 && !gestureActive() && (e ? (typeof L.syncStale === 'function' ? L.syncStale() : L.syncStale) : !hasFallback(L, lv, tx, ty))) {
        const t0 = performance.now();
        const ne = paintNow(L, lv, tx, ty, ck, 0);
        syncLeft -= performance.now() - t0;
        if (ne) { e = ne; tileStats.syncPainted++; }
      } else if (!(L.derive && !L.pin?.(lv) && (e = derive(L, lv, tx, ty, ck)))) enqueue(L, lv, tx, ty, ck, Math.hypot(tx + 0.5 - L.view.cu / span, ty + 0.5 - L.view.cv / span));
    }
    todo.push([tx, ty, e]);
  }
  // 1) replis sous les tuiles absentes, périmées ou en fondu
  for (const [tx, ty, e] of todo) {
    const a = e && !e.stale ? Math.min(1, (now - e.born) / FADE_MS) : 0;
    if (e && !e.stale && a >= 1) continue;
    const box = [tx * span, ty * span, (tx + 1) * span, (ty + 1) * span];
    const fb = fallback(L, lv, tx, ty, e);
    for (const f of fb) { f.used = frame; blit(ctx, f, cam, 1, box); maxMag = Math.max(maxMag, need / f.lv); }
    if (!e || e.stale) missing++;
  }
  // 2) tuiles du niveau voulu
  for (const [, , e] of todo) {
    if (!e || e.stale) continue;
    e.used = frame;
    const a = L.fade === false || reduceMotion() || gestureActive() ? 1 : Math.min(1, (now - e.born) / FADE_MS);
    if (a < 1) fading = true;
    blit(ctx, e, cam, a);
    maxMag = Math.max(maxMag, need / lv);
  }
  sharp[id] = { mag: +maxMag.toFixed(3), lv, need: +need.toFixed(2), missing };
  if (queue.length) { kick(); pump(); }
  if (fading && !gestureActive()) L.onReady?.();
  return missing;
}
const reduceMotion = () => typeof document !== 'undefined' && document.documentElement.classList.contains('reduce-motion');

// Repli : la tuile périmée elle-même, sinon la tuile plus grossière la plus proche, sinon les plus fines
function hasFallback(L, lv, tx, ty) { return fallback(L, lv, tx, ty, null).length > 0; }
function fallback(L, lv, tx, ty, self) {
  if (self) return [self];
  const out = [];
  const levels = L.levels;
  const i = levels.indexOf(lv);
  // plus grossiers d'abord (une tuile couvre toute la zone)
  for (let j = i - 1; j >= 0; j--) {
    const r = lv / levels[j];
    const e = cache.get(kOf(L.id, levels[j], Math.floor(tx / r), Math.floor(ty / r)));
    if (e) { out.push(e); return out; }
  }
  // plus fins : les tuiles qui couvrent la zone (2 × 2, 4 × 4…)
  for (let j = i + 1; j < levels.length; j++) {
    const r = levels[j] / lv;
    let any = false;
    for (let y = 0; y < r; y++) for (let x = 0; x < r; x++) { const e = cache.get(kOf(L.id, levels[j], tx * r + x, ty * r + y)); if (e) { out.push(e); any = true; } }
    if (any) return out;
  }
  return out;
}

// Réduction par moitié : une tuile d'un niveau se compose de ses 4 tuiles du niveau double, si elles sont prêtes
// (lissage de haute qualité, aucun moiré, quasi gratuit). Les niveaux plus bas se déduisent de proche en proche.
function derive(L, lv, tx, ty, ck) {
  const i = L.levels.indexOf(lv), up = L.levels[i + 1];
  if (!up || up !== lv * 2) return null;
  const kids = [];
  for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) {
    const e = cache.get(kOf(L.id, up, tx * 2 + x, ty * 2 + y));
    const span = TILE_PX / up, [B0, B1, B2, B3] = L.bounds();
    const inside = (tx * 2 + x) * span < B2 && (ty * 2 + y) * span < B3 && (tx * 2 + x + 1) * span > B0 && (ty * 2 + y + 1) * span > B1;
    if (!inside) continue;
    if (!e || e.ck !== ck) return null;
    kids.push([x, y, e]);
  }
  if (!kids.length) return null;
  const span = TILE_PX / lv, [B0, B1, B2, B3] = L.bounds();
  const w = Math.max(1, Math.min(TILE_PX, Math.ceil((B2 - Math.max(B0, tx * span)) * lv))), h = Math.max(1, Math.min(TILE_PX, Math.ceil((B3 - Math.max(B1, ty * span)) * lv)));
  const cv = mkCanvas(w, h), g = cv.getContext('2d');
  if (!g) return null;
  g.imageSmoothingEnabled = true;
  if ('imageSmoothingQuality' in g) g.imageSmoothingQuality = 'high';
  for (const [x, y, e] of kids) g.drawImage(e.cv, x * TILE_PX / 2, y * TILE_PX / 2, e.cv.width / 2, e.cv.height / 2);
  tileStats.derived = (tileStats.derived || 0) + 1;
  return store(L, lv, tx, ty, ck, cv, 0);
}

function paintNow(L, lv, tx, ty, ck, born) {
  const span = TILE_PX / lv, [B0, B1, B2, B3] = L.bounds();
  const w = Math.max(1, Math.min(TILE_PX, Math.ceil((B2 - Math.max(B0, tx * span)) * lv))), h = Math.max(1, Math.min(TILE_PX, Math.ceil((B3 - Math.max(B1, ty * span)) * lv)));
  const cv = mkCanvas(w, h);
  const job = { state: null, sync: true };
  const t0 = typeof performance !== 'undefined' ? performance.now() : 0;
  let guard = 0;
  while (!L.paint(cv, lv, tx, ty, job) && guard++ < 1e4);
  const dt = (typeof performance !== 'undefined' ? performance.now() : 0) - t0;
  tileStats.painted++; tileStats.paintMs += dt;
  const bl = (tileStats.byLayer ||= {}); (bl[L.id] ||= { n: 0, ms: 0, max: 0 }); bl[L.id].ms += dt; bl[L.id].n++; bl[L.id].max = Math.max(bl[L.id].max, dt);
  return store(L, lv, tx, ty, ck, cv, born);
}

function enqueue(L, lv, tx, ty, ck, prio) {
  const k = kOf(L.id, lv, tx, ty);
  const q = queue.find((j) => j.k === k);
  if (q) { q.ck = ck; q.prio = prio; q.epoch = frame; return; }
  queue.push({ k, layer: L, lv, tx, ty, ck, prio, epoch: frame, state: null, cv: null });
}

// Peinture en arrière-plan : la tuile la plus proche du centre d'abord, ~6 ms par tranche (ou le temps libre annoncé)
const idle = (fn) => (typeof requestIdleCallback === 'function' ? requestIdleCallback(fn, { timeout: 40 }) : setTimeout(() => fn({ timeRemaining: () => 6, didTimeout: true }), 16));
export function pump() {
  if (pumping || !queue.length) return;
  pumping = 1;
  idle((dl) => {
    pumping = 0;
    tileStats.pumps = (tileStats.pumps || 0) + 1;
    if (gestureActive()) { tileStats.pumpGesture = (tileStats.pumpGesture || 0) + 1; return; } // reprise à la fin du geste (markGesture)
    const t0 = performance.now();
    // v27.1 : tranches de 12 à 24 ms hors geste (sous le seuil des tâches longues de 50 ms), pour que la peinture avance
    const budgetMs = Math.max(12, Math.min(24, dl.timeRemaining && !dl.didTimeout ? dl.timeRemaining() : 24));
    const touched = new Set();
    while (queue.length && performance.now() - t0 < budgetMs) {
      // travaux trop vieux (la vue est partie ailleurs) : abandonnés
      for (let i = queue.length - 1; i >= 0; i--) {
        const j = queue[i], L = j.layer, cur = L.lv;
        if (L.pin?.(j.lv)) continue;
        if (frame - j.epoch > 600 || j.lv !== cur) queue.splice(i, 1);
      }
      if (!queue.length) break;
      queue.sort((a, b) => a.prio - b.prio);
      // la première tuile prête à avancer : déjà commencée, ou sa couche peut la commencer (worker libre)
      const j = queue.find((q) => !q.wait && (q.state || !q.layer.canStart || q.layer.canStart()));
      if (!j) break;
      if (runJob(j)) touched.add(j.layer);
    }
    for (const L of touched) L.onReady?.();
    if (queue.some((j) => !j.wait)) pump();
  });
}
function runJob(j) {
  const L = j.layer;
  if (!j.cv) {
    const span = TILE_PX / j.lv, [B0, B1, B2, B3] = L.bounds();
    const w = Math.max(1, Math.min(TILE_PX, Math.ceil((B2 - Math.max(B0, j.tx * span)) * j.lv))), h = Math.max(1, Math.min(TILE_PX, Math.ceil((B3 - Math.max(B1, j.ty * span)) * j.lv)));
    j.cv = mkCanvas(w, h);
  }
  const t0 = performance.now();
  const done = L.paint(j.cv, j.lv, j.tx, j.ty, j);
  const dt = performance.now() - t0;
  tileStats.paintMs += dt;
  const bl = (tileStats.byLayer ||= {}); (bl[L.id] ||= { n: 0, ms: 0, max: 0 }); bl[L.id].ms += dt; if (done) bl[L.id].n++; bl[L.id].max = Math.max(bl[L.id].max, dt);
  if (j.wait) return false;
  if (!done) return false;
  queue.splice(queue.indexOf(j), 1);
  tileStats.painted++;
  store(L, j.lv, j.tx, j.ty, j.ck, j.cv, performance.now());
  return true;
}
// Rappel du worker : la tuile j a fini sa partie hors du fil principal
export function resumeJob(j) {
  j.wait = false;
  // pixels rendus par le worker : on finit la tuile tout de suite (pose des pixels et décor, quelques ms)
  if (j.state?.buf && queue.includes(j) && runJob(j)) { evict(); j.layer.onReady?.(); }
  kick(); pump();
}
// Envoi immédiat des travaux confiés aux workers (poster un message ne coûte rien) : un worker libéré repart aussitôt
export function kick() {
  queue.sort((a, b) => a.prio - b.prio);
  for (const j of queue) {
    if (j.state || j.wait || !j.layer.canStart || j.layer.lv && j.lv !== j.layer.lv && !j.layer.pin?.(j.lv)) continue;
    if (!j.layer.canStart()) break;
    runJob(j);
  }
}

// Toutes les tuiles d'un niveau (vue d'ensemble du monde, épinglée) : peintes en arrière-plan dès l'ouverture
export function prefetchLevel(id, lv) {
  const L = layers.get(id);
  if (!L) return;
  const span = TILE_PX / lv, [B0, B1, B2, B3] = L.bounds();
  for (let ty = Math.floor(B1 / span); ty < Math.ceil(B3 / span); ty++) for (let tx = Math.floor(B0 / span); tx < Math.ceil(B2 / span); tx++) {
    if (!cache.has(kOf(id, lv, tx, ty))) enqueue(L, lv, tx, ty, L.key(lv, tx, ty), 1e3 + tx + ty);
  }
  pump();
}
// Dessine les seules tuiles déjà prêtes d'un niveau (mini-carte), sans rien demander à peindre
export function drawCached(ctx, id, lv, cam) {
  ctx.imageSmoothingEnabled = true;
  if ('imageSmoothingQuality' in ctx) ctx.imageSmoothingQuality = 'high';
  for (const e of cache.values()) if (e.id === id && e.lv === lv) blit(ctx, e, cam);
}
export function clearTiles() { cache.clear(); bytes = 0; queue.length = 0; }
export const tileDebug = () => ({ bytes, count: cache.size, queue: queue.length, budget, ...tileStats, layers: [...layers.keys()] });
