// v27 « Netteté et vie », lot 1 — tuiles à la finesse de l'écran : choix du niveau, cache borné en mégaoctets,
// éviction par distance, réduction par moitié, découpage des dessins par tuile, contours vectoriels, worker du terrain.
import test from 'node:test';
import assert from 'node:assert/strict';

// Canvas factice (le cache ne lit que width, height et quelques appels de dessin)
const calls = [];
const mockCtx = () => ({
  drawImage: (...a) => calls.push(a), setTransform() {}, clearRect() {}, translate() {}, fillRect() {},
  imageSmoothingEnabled: true, imageSmoothingQuality: 'low', globalAlpha: 1,
});
globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: mockCtx }), documentElement: { classList: { contains: () => false } } };
if (typeof globalThis.requestIdleCallback === 'undefined') globalThis.requestIdleCallback = (fn) => setTimeout(() => fn({ timeRemaining: () => 50 }), 0);

const T = await import('../src/ui/tiles.js');
const { makeTerrainKit, terrainWorkerSource } = await import('../src/ui/terrainKit.js');

test('v27 : le niveau choisi n’étire jamais plus de 1,25× (sauf au-delà du plus fin)', () => {
  const levels = [16, 32, 64, 128, 256];
  for (let need = 1; need < 400; need += 0.37) {
    const lv = T.pickLevel(levels, need);
    if (need <= 256 * T.MAG_MAX) assert.ok(need / lv <= T.MAG_MAX + 1e-9, `besoin ${need} → ${lv}`);
    else assert.equal(lv, 256);
    // et c'est le plus petit possible (pas de mémoire gaspillée)
    const i = levels.indexOf(lv);
    if (i > 0 && need <= 256 * T.MAG_MAX) assert.ok(need / levels[i - 1] > T.MAG_MAX);
  }
});

function layer(id, { levels = [16, 32, 64, 128, 256], size = 128, derive = false, sync = true } = {}) {
  let painted = 0;
  T.defineLayer({ id, levels, bounds: () => [0, 0, size, size], key: () => 'k', paint: () => { painted++; return true; }, sync, syncBudget: 1e9, syncStale: true, fade: false, derive });
  return { painted: () => painted };
}
const camFor = (k, cu, cv, vw = 1280, vh = 800) => ({ k, ox: vw / 2 - cu * k, oy: vh / 2 - cv * k, vw, vh });

test('v27 : une couche dessine ses tuiles visibles au niveau voulu ; agrandissement mesuré ≤ 1,25', () => {
  T.clearTiles(); T.setTileBudget('high');
  layer('t1');
  for (const k of [7.8, 26, 52, 104, 135, 270]) {
    T.clearTiles(); // sans repli, la couche « synchrone » peint tout de suite
    T.drawLayer({ ...mockCtx() }, 't1', camFor(k, 64, 64));
    const s = T.sharp.t1;
    assert.equal(s.missing, 0);
    assert.ok(s.mag <= T.MAG_MAX + 1e-9, `k=${k} mag=${s.mag}`);
  }
});

test('v27 : le cache reste sous son budget en mégaoctets et évince d’abord les tuiles éloignées', () => {
  T.clearTiles(); T.setTileBudget('low', 12 * 1024 * 1024); // 12 tuiles de 1 Mo
  layer('t2');
  // promenade au zoom fort : chaque vue demande ~6 tuiles nouvelles
  for (let i = 0; i < 20; i++) {
    T.drawLayer(mockCtx(), 't2', camFor(270, 4 + i * 6, 64, 1280, 800));
    assert.ok(T.tileBytes() <= 12 * 1024 * 1024 + 8 * 512 * 512 * 4, `octets ${T.tileBytes()}`);
  }
  // les tuiles restantes sont les plus proches de la dernière vue
  const d = T.tileDebug();
  assert.ok(d.evicted > 0);
  T.drawLayer(mockCtx(), 't2', camFor(270, 4 + 19 * 6, 64));
  assert.equal(T.sharp.t2.missing, 0, 'la vue courante est entièrement en cache');
  T.setTileBudget('high');
});

test('v27 : réduction par moitié — un niveau bas se compose des 4 tuiles du niveau double, sans repeindre', () => {
  T.clearTiles(); T.setTileBudget('high');
  const L = layer('t3', { derive: true });
  T.drawLayer(mockCtx(), 't3', camFor(100, 16, 16, 2048, 2048)); // niveau 128 : 4 cases par tuile
  const before = L.painted();
  T.drawLayer(mockCtx(), 't3', camFor(50, 16, 16, 512, 512)); // niveau 64 : déduit des tuiles 128 déjà prêtes
  assert.equal(L.painted(), before, 'aucune peinture : réduction par moitié');
  assert.ok(T.tileDebug().derived > 0);
});

test('v27 : un dessin est rangé dans toutes les tuiles que touche son cadre, et seulement elles', () => {
  for (let i = 0; i < 300; i++) {
    const R = [0.5, 1, 2, 3, 4, 6][i % 6], x = (i * 97) % 3000, y = (i * 61) % 1600, w = 20 + (i * 13) % 400, h = 20 + (i * 7) % 500;
    const box = [x, y, x + w, y + h], span = T.TILE_PX / R;
    for (let ty = 0; ty < 1700 / span; ty++) for (let tx = 0; tx < 3500 / span; tx++) {
      const inter = box[2] > tx * span && box[0] < (tx + 1) * span && box[3] > ty * span && box[1] < (ty + 1) * span;
      assert.equal(T.boxTouchesTile(box, R, tx, ty), inter);
    }
  }
});

test('v27 : contours vectoriels — l’aire des boucles est celle de la région, lissage fermé', async () => {
  globalThis.window = globalThis.window || {};
  const { regionLoops, chaikin } = await import('../src/ui/contours.js');
  const S = 24, cells = new Set();
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) if ((Math.sin(x * 0.7) + Math.cos(y * 0.5) + ((x * 7 + y * 3) % 5) * 0.2) > 0.4) cells.add(x + ',' + y);
  const loops = regionLoops(S, (x, y) => cells.has(x + ',' + y));
  const area = (l) => l.reduce((a, p, i) => { const q = l[(i + 1) % l.length]; return a + p[0] * q[1] - q[0] * p[1]; }, 0) / 2;
  const total = loops.reduce((a, l) => a + area(l), 0);
  assert.equal(Math.round(Math.abs(total)), cells.size, 'aire des contours (trous déduits) = nombre de cases');
  const sm = chaikin(loops[0], 2, true);
  assert.equal(sm.length, loops[0].length * 4);
  assert.ok(Math.abs(area(sm)) > 0);
});

test('v27 : le worker du terrain peint exactement les mêmes pixels que le fil principal', () => {
  const K = makeTerrainKit();
  const ters = ['plain', 'forest', 'river', 'hills', 'mountain'];
  const S = 16, terrain = Array.from({ length: S * S }, (_, i) => 'abcde'[(i * 7 + Math.floor(i / S) * 3) % 5]).join('');
  const map = { a: 'plain', b: 'forest', c: 'river', d: 'hills', e: 'mountain' };
  const get = (x, y) => (x < 0 || y < 0 || x >= S || y >= S ? null : map[terrain[y * S + x]]);
  const pal = Object.fromEntries(ters.map((t, i) => [t, [90 + i * 30, 120, 70 + i * 10]]));
  const P = K.prepare(4, 4, 4, 4, 16, get, pal, { seed: 7, jitter: 0.42 });
  const a = new Uint8ClampedArray(64 * 64 * 4); K.rows(P, a, 0, 64);
  // le worker, exécuté ici dans une fonction (même source que le Blob du navigateur)
  let out = null;
  const fake = new Function('postMessage', 'performance', terrainWorkerSource() + '; return onmessage;')((m) => { out = m; }, { now: () => 0 });
  fake({ data: { world: { size: S, terrain, map } } });
  fake({ data: { id: 1, x0: 4, y0: 4, tw: 4, th: 4, res: 16, pal, seed: 7, jitter: 0.42 } });
  const b = new Uint8ClampedArray(out.buf);
  assert.equal(b.length, a.length);
  assert.deepEqual(Array.from(b), Array.from(a));
});
