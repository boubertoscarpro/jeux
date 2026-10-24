// v23 « Refonte artistique » — Composition de la scène du château : ordre de dessin déduit des emprises au sol
// (paint/scene.js, sortScene). Chaque dessin reçoit un rectangle d'écran réaliste : l'emprise projetée, élargie d'une
// demi-case, et 170 px de haut (bâtiment, tour, mur) — seules les paires qui se chevauchent à l'écran sont ordonnées,
// comme dans le jeu.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { wallItems, sortScene, behind, footprint } from '../src/ui/paint/scene.js';
import { isoFrame, toScreen, depth, LAYER } from '../src/systems/iso.js';
import { skyLight, dayLight } from '../src/systems/scene.js';

const r = { x0: 9, y0: 5, x1: 14, y1: 10 }, gate = { x: 11, y: 10 };
const state = { city: { w: 24, h: 16 } };
const f = isoFrame(24, 16);
const walls = () => wallItems(state, f, { rect: r, gate, style: 'stone' }).map((it) => ({ ...it, k: it.key }));
const bld = (x, y, k = 'b') => ({ x, y, k: `${k}${x},${y}`, depth: depth(x, y, LAYER.building) });
const tree = (x, y) => ({ x, y, k: `s${x},${y}`, depth: depth(x, y, LAYER.scenery) });
const order = (items) => {
  const placed = items.map((it) => {
    const [x0, x1, y0, y1] = footprint(it), q = toScreen(f, it.x, it.y);
    const pts = [toScreen(f, x0, y0), toScreen(f, x1, y0), toScreen(f, x1, y1), toScreen(f, x0, y1)];
    const L = Math.min(...pts.map((p) => p.sx)) - 32, Rr = Math.max(...pts.map((p) => p.sx)) + 32;
    const T = Math.min(...pts.map((p) => p.sy)) - 170, B = Math.max(...pts.map((p) => p.sy)) + 8;
    return { it, X: q.sx, Y: q.sy, sp: { art: { width: Rr - L, height: B - T }, ax: q.sx - L, ay: q.sy - T } };
  });
  return sortScene(placed).map((p) => p.it);
};
const idx = (list, pred) => { const i = list.findIndex(pred); assert.ok(i >= 0, 'élément introuvable'); return i; };
const towerAt = (cx, cy) => (it) => it.tower && it.box[0] < cx && it.box[1] > cx && it.box[2] < cy && it.box[3] > cy;
const pieceAt = (axis, x, y) => (it) => it.key?.startsWith('w|') && it.key.split('|')[2] === axis && it.x === x && it.y === y;

test('Tours : chaque tour est dessinée après les pans de mur qui la rejoignent (aux quatre coins)', () => {
  const list = order(walls());
  const corners = [
    { t: [r.x0, r.y0], p: [pieceAt('u', r.x0, r.y0), pieceAt('v', r.x0, r.y0)] }, // coin du fond
    { t: [r.x1 + 1, r.y0], p: [pieceAt('u', r.x1, r.y0), pieceAt('v', r.x1, r.y0)] }, // coin droit
    { t: [r.x0, r.y1 + 1], p: [pieceAt('v', r.x0, r.y1), pieceAt('u', r.x0, r.y1)] }, // coin gauche
    { t: [r.x1 + 1, r.y1 + 1], p: [pieceAt('u', r.x1, r.y1), pieceAt('v', r.x1, r.y1)] }, // coin avant
  ];
  for (const c of corners) {
    const ti = idx(list, towerAt(...c.t));
    for (const p of c.p) assert.ok(idx(list, p) < ti, `tour (${c.t}) devant son mur`);
  }
});
test('Ancienne règle (profondeur seule) : la tour du fond passait derrière ses murs — c’est le défaut corrigé', () => {
  const w = walls();
  const t = w.find(towerAt(r.x0, r.y0)), p = w.find(pieceAt('u', r.x0, r.y0));
  const oldTowerDepth = depth(r.x0 - 0.4, r.y0 - 0.4, LAYER.wallBack);
  assert.ok(oldTowerDepth < p.depth, 'avec l’ancienne profondeur, le mur était dessiné après la tour');
  assert.equal(behind(p, t), true, 'avec les emprises, le mur passe avant la tour');
});
test('Tours du fond derrière les bâtiments de la cour ; tours de devant devant eux', () => {
  const back = [r.x0 + 3, r.y0], front = [r.x0, r.y1 + 1];
  const list = order([...walls(), bld(back[0] - 1, back[1]), bld(back[0], back[1]), bld(r.x0, r.y1)]);
  const tb = idx(list, towerAt(...back));
  assert.ok(tb < idx(list, (it) => it.k === `b${back[0] - 1},${back[1]}`), 'cour devant la tour du fond (à gauche)');
  assert.ok(tb < idx(list, (it) => it.k === `b${back[0]},${back[1]}`), 'cour devant la tour du fond (à droite)');
  assert.ok(idx(list, towerAt(...front)) > idx(list, (it) => it.k === `b${r.x0},${r.y1}`), 'tour du coin gauche devant la cour');
});
test('Murs : le rempart du fond passe devant ce qui est derrière lui et derrière la cour ; le rempart avant devant la cour', () => {
  const x = r.x0 + 1; // (r.x0 + 2 est la porte)
  const list = order([...walls(), tree(x, r.y0 - 1), bld(x, r.y0), bld(x, r.y1), tree(x, r.y1 + 1), bld(r.x1, r.y0 + 2), tree(r.x1 + 1, r.y0 + 2)]);
  const back = idx(list, pieceAt('u', x, r.y0)), front = idx(list, pieceAt('u', x, r.y1)), right = idx(list, pieceAt('v', r.x1, r.y0 + 2));
  assert.ok(idx(list, (it) => it.k === `s${x},${r.y0 - 1}`) < back, 'arbre derrière le rempart du fond');
  assert.ok(back < idx(list, (it) => it.k === `b${x},${r.y0}`), 'bâtiment de la cour devant le rempart du fond');
  assert.ok(idx(list, (it) => it.k === `b${x},${r.y1}`) < front, 'rempart avant devant la cour');
  assert.ok(front < idx(list, (it) => it.k === `s${x},${r.y1 + 1}`), 'arbre devant le rempart avant');
  assert.ok(idx(list, (it) => it.k === `b${r.x1},${r.y0 + 2}`) < right && right < idx(list, (it) => it.k === `s${r.x1 + 1},${r.y0 + 2}`), 'flanc droit entre la cour et le dehors');
});
test('Porte : la porte passe devant les pans de mur voisins et devant la cour ; ordre stable et complet', () => {
  const items = [...walls(), bld(gate.x, r.y1 - 1), bld(gate.x - 1, r.y1)];
  const list = order(items);
  assert.equal(list.length, items.length, 'aucun dessin perdu');
  const gi = idx(list, (it) => it.key?.startsWith('wg|'));
  assert.ok(idx(list, pieceAt('u', gate.x - 1, r.y1)) < gi && idx(list, pieceAt('u', gate.x + 1, r.y1)) < gi);
  assert.ok(idx(list, (it) => it.k === `b${gate.x - 1},${r.y1}`) < gi);
  assert.deepEqual(order(items).map((it) => it.k), list.map((it) => it.k), 'même résultat d’un rendu à l’autre');
});
test('Bâtiments voisins et routes : les plats passent d’abord, puis de l’arrière vers l’avant', () => {
  const road = { x: 3, y: 3, k: 'road', flat: true, depth: depth(3, 3, LAYER.ground + 1) };
  const list = order([bld(4, 4), road, bld(3, 4), bld(4, 3), bld(3, 3)]);
  assert.equal(list[0].k, 'road');
  const at = (x, y) => idx(list, (it) => it.k === `b${x},${y}`);
  assert.ok(at(3, 3) < at(3, 4) && at(3, 3) < at(4, 3) && at(3, 4) < at(4, 4) && at(4, 3) < at(4, 4));
});

test('Ciel selon la météo : teinte grise sous la pluie, sombre sous l’orage, claire dans la brume ; rien par beau temps', () => {
  const day = dayLight(12);
  assert.equal(skyLight(day, null), day);
  const rain = skyLight(day, 'rain'), storm = skyLight(day, 'storm'), fog = skyLight(day, 'fog');
  assert.ok(rain.a > 0 && storm.a > rain.a, 'l’orage assombrit plus que la pluie');
  assert.equal(fog.soft, true, 'la brume éclaircit');
  const night = skyLight(dayLight(23), 'rain');
  assert.ok(night.a >= dayLight(23).a && night.a <= 0.45, 'de nuit, la pluie assombrit un peu, sans excès');
});
test('Scène dense (enceinte, cour pleine, forêt autour) : un ordre sans cycle, chaque élément dessiné une fois', async () => {
  const { paintStats } = await import('../src/ui/paint/scene.js');
  const items = [...walls()];
  for (let y = r.y0; y <= r.y1; y++) for (let x = r.x0; x <= r.x1; x++) if (!(x === gate.x && y === r.y1)) items.push(bld(x, y));
  for (let y = r.y0 - 3; y <= r.y1 + 3; y++) for (let x = r.x0 - 3; x <= r.x1 + 3; x++) {
    const out = x < r.x0 - 1 || x > r.x1 + 1 || y < r.y0 - 1 || y > r.y1 + 1;
    if (out && (x * 7 + y * 3) % 2 === 0) items.push(tree(x, y));
  }
  const list = order(items);
  assert.equal(list.length, items.length);
  assert.equal(new Set(list).size, items.length);
  assert.equal(paintStats.cycles, 0, `ordres forcés : ${paintStats.forced}`);
});
