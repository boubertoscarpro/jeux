// v20 « Ma forteresse » : projection isométrique et inverse, tri de profondeur, zones et paliers de la ville fortifiée,
// états « à l'arrêt », ordre public, titres de noblesse, terres lointaines, fin de la corvée (et ses limites), récoltes
// sans expiration, mode architecte, film, migration d'une vraie sauvegarde v19 (aperçu, annulation, rien de détruit).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { createNewState } from '../src/core/state.js';
import { advance } from '../src/core/engine.js';
import { serialize, deserialize } from '../src/core/save.js';
import { rng, mulberry32 } from '../src/core/rng.js';
import { computeMods } from '../src/systems/modifiers.js';
import { pay } from '../src/systems/economy.js';
import { placementCheck } from '../src/systems/city.js';
import { isoFrame, toScreen, fromScreen, tileAt, tileCenter, depth, depthSort, LAYER, groundMatrix, ISO_DIRS, isoStep, rectBox } from '../src/systems/iso.js';
import { rectOf, zoneAt, enlargePreview, enlargeEnceinte, keepCapacity, cityCount, isCityType, undoReorganize, castleState, alleeTiles, gateOf } from '../src/systems/castle.js';
import { ENC_STAGES, KEEP_ONLY, COUNTRY_ONLY } from '../src/data/castle.js';
import { stoppedCause, buildingSignals } from '../src/systems/mapSignals.js';
import { publicOrder, orderBonus, orderMods, ORDER } from '../src/systems/order.js';
import { titleOf, honorOf, TITLES, nobilityMods } from '../src/systems/nobility.js';
import { FARLANDS, FAR } from '../src/data/farlands.js';
import { farlandCheck, foundFarland, farlandTick, upgradeFarland, fillFarGarrison, farProd, baseCamps } from '../src/systems/farlands.js';
import { choreState, setChore, choresTick, CHORES, bestRaidTarget } from '../src/systems/chores.js';
import { raidState, maxRaidOrders } from '../src/systems/raidOrders.js';
import { harvestTick, harvestReady, readyHarvests, collectHarvest, harvestState, HARVEST } from '../src/systems/harvest.js';
import { trophyEarned, trophiesToPlace, autoPlaceTrophies, placedTrophies } from '../src/systems/trophies.js';
import { addGhost, removeGhost, ghosts, ghostAt, pruneGhosts, futureStages } from '../src/systems/architect.js';
import { buildTime, filmPlan } from '../src/systems/film.js';
import { expandDomain } from '../src/systems/domain.js';

const T0 = Date.UTC(2026, 9, 1, 8);
const H = 3600000;
const th = (s) => Object.values(s.city.buildings).find((b) => b.type === 'townhall');
function realm(seed = 'v20', lvl = 10) {
  const s = createNewState({ seed, now: T0 });
  th(s).level = lvl;
  s.meta.lastTick = T0;
  for (const r of Object.keys(s.resources)) s.resources[r] = 500000;
  s.city.terrain = s.city.terrain.map(() => 'plain');
  return s;
}
const put = (s, id, type, x, y, level = 1) => (s.city.buildings[id] = { id, type, x, y, level });
const raw = (f) => gunzipSync(readFileSync(new URL(`./fixtures/${f}.json.gz`, import.meta.url))).toString();

// ───────── Projection ─────────
test('Iso : projection et projection inverse sont réciproques, la case sous un point est la bonne', () => {
  const f = isoFrame(24, 16);
  for (const [x, y] of [[0, 0], [5, 3], [23, 15], [11.5, 7.25]]) {
    const p = toScreen(f, x, y);
    const q = fromScreen(f, p.sx, p.sy);
    assert.ok(Math.abs(q.x - x) < 1e-9 && Math.abs(q.y - y) < 1e-9, `${x},${y}`);
  }
  for (let y = 0; y < 16; y++) for (let x = 0; x < 24; x++) {
    const c = tileCenter(f, x, y);
    assert.deepEqual(tileAt(f, c.sx, c.sy, 24, 16), { x, y });
  }
  const c = tileCenter(f, 0, 0);
  assert.equal(tileAt(f, c.sx - 200, c.sy - 200, 24, 16), null, 'hors de la grille');
  // Losange 2:1, tout le monde dans le cadre
  assert.equal(f.tw, 2 * f.th);
  for (const [x, y] of [[0, 0], [24, 0], [0, 16], [24, 16]]) { const p = toScreen(f, x, y); assert.ok(p.sx >= 0 && p.sx <= f.width && p.sy >= 0 && p.sy <= f.height); }
  // Le sol (canvas orthogonal) est projeté sur le même losange
  const m = groundMatrix(f, 32);
  const px = 32 * 3, py = 32 * 2;
  const p = toScreen(f, 3, 2);
  assert.ok(Math.abs(m[0] * px + m[2] * py + m[4] - p.sx) < 1e-9 && Math.abs(m[1] * px + m[3] * py + m[5] - p.sy) < 1e-9);
  // Boîte d'un rectangle de cases (cadrage)
  const b = rectBox(f, { x0: 2, y0: 2, x1: 5, y1: 5 });
  assert.ok(b.right > b.left && b.bottom > b.top);
});

test('Iso : tri de profondeur — devant = plus bas à l’écran ; muraille du fond derrière, muraille de devant devant', () => {
  assert.ok(depth(5, 5) > depth(4, 5) && depth(5, 5) > depth(5, 4));
  assert.ok(depth(5, 5, LAYER.building) > depth(5, 5, LAYER.ground));
  assert.ok(depth(5, 5, LAYER.wallFront) > depth(5, 5, LAYER.building));
  assert.ok(depth(5, 5, LAYER.wallBack) < depth(5, 5, LAYER.building));
  // Un bâtiment de la rangée suivante passe devant le mur du fond de la case précédente
  assert.ok(depth(5, 6, LAYER.building) > depth(5, 5, LAYER.wallFront));
  const sorted = depthSort([{ x: 3, y: 3 }, { x: 0, y: 0 }, { x: 1, y: 2 }, { x: 2, y: 1, layer: LAYER.ground }]);
  assert.deepEqual(sorted.map((o) => `${o.x},${o.y}`), ['0,0', '2,1', '1,2', '3,3']);
});

test('Iso : clavier — chaque flèche suit sa direction à l’écran, sans sortir de la grille', () => {
  const f = isoFrame(20, 20);
  for (const [k, d] of Object.entries(ISO_DIRS)) {
    const a = toScreen(f, 10, 10), b = toScreen(f, 10 + d[0], 10 + d[1]);
    if (k === 'ArrowUp') assert.ok(b.sy < a.sy && Math.abs(b.sx - a.sx) < 1e-9);
    if (k === 'ArrowDown') assert.ok(b.sy > a.sy && Math.abs(b.sx - a.sx) < 1e-9);
    if (k === 'ArrowLeft') assert.ok(b.sx < a.sx && Math.abs(b.sy - a.sy) < 1e-9);
    if (k === 'ArrowRight') assert.ok(b.sx > a.sx && Math.abs(b.sy - a.sy) < 1e-9);
  }
  assert.deepEqual(isoStep(0, 0, 'ArrowUp', 20, 20), { x: 0, y: 0 });
  assert.deepEqual(isoStep(19, 19, 'ArrowDown', 20, 20), { x: 19, y: 19 });
});

// ───────── Zones et paliers ─────────
test('Zones : toute la ville a sa place dans les murs, la campagne dehors, et les deux listes sont disjointes', () => {
  assert.ok(!KEEP_ONLY.some((t) => COUNTRY_ONLY.includes(t)));
  for (const t of ['house', 'market', 'library', 'barracks', 'forge', 'tavern']) assert.ok(isCityType(t), t);
  const s = realm();
  const r = rectOf(s);
  assert.equal(placementCheck(s, 'house', r.x0, r.y0).ok, true);
  assert.equal(placementCheck(s, 'house', r.x1 + 3, r.y0).ok, false);
  assert.equal(placementCheck(s, 'farm', r.x1 + 3, r.y0).ok, true);
  assert.equal(placementCheck(s, 'mill', r.x1 + 3, r.y0).ok, true, 'le moulin va partout');
  for (const a of alleeTiles(s)) assert.equal(placementCheck(s, 'house', a.x, a.y).ok, false, 'allée de la porte réservée');
  const g = gateOf(s);
  assert.equal(g.y, r.y1, 'porte au sud');
});

test('Paliers : chaque palier contient tous les bâtiments de ville permis à son hôtel de ville', () => {
  for (let i = 1; i < ENC_STAGES.length; i++) assert.ok(ENC_STAGES[i].size > ENC_STAGES[i - 1].size && ENC_STAGES[i].th > ENC_STAGES[i - 1].th);
  assert.equal(keepCapacity(6), 36 - 1 - 3);
  assert.ok(keepCapacity(ENC_STAGES[ENC_STAGES.length - 1].size) >= 96 * 0.9, 'grande ville de fin de partie');
});

test('Agrandir : coût payé, mur redessiné plus grand, la campagne recule hors des murs, aucun bâtiment détruit', () => {
  const s = realm('grow', 12);
  const r0 = rectOf(s);
  put(s, 'farm1', 'farm', r0.x1 + 1, r0.y0 + 1); // sera dans les nouveaux murs
  const n0 = Object.keys(s.city.buildings).length;
  const p = enlargePreview(s);
  assert.equal(p.ok, true);
  assert.ok(p.moving >= 1);
  const r = enlargeEnceinte(s, null, (c) => pay(s, c), T0);
  assert.equal(r.ok, true);
  assert.equal(Object.keys(s.city.buildings).length, n0);
  assert.notEqual(zoneAt(s, s.city.buildings.farm1.x, s.city.buildings.farm1.y), 'keep', 'la ferme est ressortie');
  assert.ok(castleState(s).lastGrow, 'moment mis en scène');
  assert.equal(castleState(s).history.length, 1);
});

test('Agrandir le domaine offre le palier suivant de la ville fortifiée', () => {
  const s = realm('dom', 15);
  assert.ok(expandDomain(s, T0).ok);
  const p = enlargePreview(s);
  assert.equal(p.free, true);
  assert.deepEqual(p.cost, {});
});

// ───────── États « à l'arrêt » ─────────
test('Zzz : à l’arrêt avec sa cause (pause, matière, entrepôt plein) ; « ! » pour un bâtiment endommagé', () => {
  const s = realm();
  const r = rectOf(s);
  put(s, 'saw', 'sawmill', r.x1 + 4, r.y0, 3);
  const b = s.city.buildings.saw;
  const mods = computeMods(s, T0);
  s.resources.wood = 0;
  assert.equal(stoppedCause(s, b, mods), null);
  b.paused = true;
  assert.match(stoppedCause(s, b, mods), /pause/);
  b.paused = false;
  s.resources.wood = 1e12; // au-delà de la capacité de l'entrepôt
  assert.match(stoppedCause(s, b, mods), /entrepôt plein/);
  const sig = buildingSignals(s, { mods, showUpgrades: false });
  assert.equal(sig.get('saw').kind, 'stopped');
  assert.equal(sig.get('saw').icon, 'Zzz');
  b.damaged = true;
  const sig2 = buildingSignals(s, { mods, showUpgrades: false });
  assert.equal(sig2.get('saw').kind, 'problem');
});

// ───────── Ordre public ─────────
test('Ordre public : décorations et trophées dans les murs le font monter, les maisons baisser ; rendement décroissant et borné', () => {
  const s = realm();
  const r = rectOf(s);
  const o0 = publicOrder(s).value;
  s.city.buildings.d1 = { id: 'd1', type: 'deco', deco: 'x', level: 1, x: r.x0, y: r.y0 };
  assert.equal(publicOrder(s).value, o0 + ORDER.deco);
  s.city.buildings.d2 = { id: 'd2', type: 'deco', deco: 'y', level: 1, x: r.x1 + 4, y: r.y0 };
  assert.equal(publicOrder(s).value, o0 + ORDER.deco, 'hors les murs : sans effet');
  put(s, 'h9', 'house', r.x0 + 1, r.y0, 10);
  assert.ok(publicOrder(s).value < o0 + ORDER.deco);
  // Rendement décroissant
  assert.ok(orderBonus(100) - orderBonus(50) < orderBonus(50) - orderBonus(0));
  assert.ok(orderBonus(1e9) <= ORDER.capUp && orderBonus(-1e9) >= -ORDER.capDown);
  // Le détail (« Pourquoi ? ») additionne exactement la valeur
  const o = publicOrder(s);
  assert.equal(o.parts.reduce((a, [, v]) => a + v, 0), o.value);
  assert.equal(computeMods(s, T0)['prod.all'] >= (orderMods(s)['prod.all'] || 0) - 1, true);
});

// ───────── Titres ─────────
test('Titres : huit rangs lus dans les faits d’armes, barre de progression, avantage petit et borné', () => {
  assert.equal(TITLES.length, 8);
  const s = realm();
  assert.equal(titleOf(s).rank, 0);
  s.stats.battlesWon = 60; // 120 points
  assert.equal(titleOf(s).name, 'Chevalier');
  assert.ok(titleOf(s).progress > 0 && titleOf(s).progress < 1);
  s.stats.raidsRepelled = 1000;
  assert.equal(titleOf(s).name, 'Duc');
  assert.equal(titleOf(s).progress, 1);
  assert.equal(nobilityMods(s)['prod.all'], 0.07);
  assert.equal(honorOf(s).total, 60 * 2 + 1000 * 10);
});

// ───────── Terres lointaines ─────────
test('Terres lointaines : hôtel de ville et camp de base requis, production modeste d’une ressource rare existante', () => {
  rng.setSource(mulberry32(20));
  try {
    const s = realm('far', 14);
    assert.match(farlandCheck(s, 'glacier').reason, /Hôtel de ville niv. 15/);
    th(s).level = 15;
    assert.match(farlandCheck(s, 'glacier').reason, /avant-poste/);
    s.territories.t1 = { name: 'Fort du Nord', level: FAR.baseLevel, x: 1, y: 1, terrain: 'snow', garrison: {} };
    assert.equal(baseCamps(s).length, 1);
    assert.ok(farlandCheck(s, 'glacier').ok);
    assert.ok(foundFarland(s, 'glacier', 't1', T0).ok);
    assert.equal(baseCamps(s).length, 0, 'un avant-poste ne sert qu’une terre');
    for (const k of Object.keys(FARLANDS)) assert.ok(['crystals', 'gems', 'rareOre'].includes(FARLANDS[k].res));
    const c0 = s.resources.crystals;
    const f = s.farlands.glacier;
    f.nextAt = T0 + 100 * H; // pas de menace pendant la mesure
    farlandTick(s, T0 + 10 * H);
    assert.ok(Math.abs(s.resources.crystals - c0 - farProd(f) * 10) < 1e-6);
    assert.ok(farProd({ level: FAR.maxLevel }) <= 3, 'production modeste');
    assert.ok(upgradeFarland(s, 'glacier', 'wall').ok);
  } finally { rng.setSource(null); }
});

test('Terres lointaines : menace à date connue ; une défaite suspend la production sans rien détruire ; absence rattrapée et bornée', () => {
  rng.setSource(mulberry32(21));
  try {
    const s = realm('far2', 15);
    s.territories.t1 = { name: 'Fort', level: 3, x: 1, y: 1, terrain: 'snow', garrison: {} };
    assert.ok(foundFarland(s, 'glacier', 't1', T0).ok);
    const f = s.farlands.glacier;
    const at = f.nextAt;
    assert.ok(at > T0 + FAR.threatEvery[0] * H - 1 && at <= T0 + FAR.threatEvery[1] * H);
    farlandTick(s, at + 1);
    assert.equal(f.threats, 1);
    assert.ok(f.won + f.lost === 1);
    if (f.lost) { const c = s.resources.crystals; farlandTick(s, at + 2 * H); assert.equal(s.resources.crystals, c, 'production suspendue'); }
    // Longue absence : au plus FAR.catchUp menaces rattrapées
    farlandTick(s, at + 1000 * H);
    assert.ok(f.threats <= 1 + FAR.catchUp);
    assert.ok(f.nextAt > at + 1000 * H);
    // Garnison : prise au château, jamais créée
    s.army.spearman = 50;
    assert.ok(fillFarGarrison(s, 'glacier').ok);
    assert.equal(s.army.spearman + (f.garrison.spearman || 0), 50);
  } finally { rng.setSource(null); }
});

// ───────── Fin de la corvée ─────────
test('Corvées : réglées une fois, hors quota d’ordres, désactivées par défaut, chaque passage consigné', () => {
  const s = realm();
  const C = choreState(s);
  for (const k of Object.keys(CHORES)) assert.equal(C[k].on, false);
  assert.ok(setChore(s, 'cleanup', { on: true, days: 1 }).ok);
  assert.equal(setChore(s, 'cleanup', { days: 3 }).ok, false, 'délai hors liste refusé');
  s.reports = [
    { id: 'r1', kind: 'attack', win: true, read: true, t: T0 - 3 * 24 * H },
    { id: 'r2', kind: 'attack', win: false, read: true, t: T0 - 3 * 24 * H },
    { id: 'r3', kind: 'attack', win: true, read: false, t: T0 - 3 * 24 * H },
    { id: 'r4', kind: 'attack', win: true, read: true, t: T0 - 1000 },
  ];
  const n0 = s.orders.length;
  const out = choresTick(s, T0);
  assert.equal(out.length, 1);
  assert.deepEqual(s.reports.map((r) => r.id), ['r2', 'r3', 'r4'], 'défaite, non lu et récent gardés');
  assert.equal(s.orders.length, n0, 'aucune place d’ordre prise');
  assert.match(s.orderLog[0].msg, /rapport/);
  assert.equal(choresTick(s, T0 + 60000).length, 0, 'cadence respectée');
});

test('Corvées : la défense conseillée est appliquée une fois par raid ; le ravitaillement garde sa réserve', () => {
  const s = realm();
  setChore(s, 'defense', { on: true });
  s.raids = [{ id: 'rd1', name: 'Pillards', arrive: T0 + H, units: { bandit: 5 } }];
  assert.equal(choresTick(s, T0).length, 1);
  assert.equal(choresTick(s, T0 + 2 * 60000).length, 0, 'même raid : pas de second passage');
  setChore(s, 'supply', { on: true, reserve: 1e9 });
  s.territories.t1 = { name: 'Fort', level: 1, x: 1, y: 1, terrain: 'plain', garrison: { spearman: 10 } };
  const food = s.resources.food;
  choresTick(s, T0 + H);
  assert.equal(s.resources.food, food, 'réserve jamais entamée');
  setChore(s, 'supply', { reserve: 0 });
  s.chores.last.supply = 0;
  choresTick(s, T0 + 2 * H);
  assert.ok(s.resources.food < food);
  assert.ok(s.territories.t1.rationsUntil > T0 + 2 * H);
});

test('Corvées : les raids relancés respectent le nombre de séries permis et la réserve', () => {
  const s = realm('raid', 12);
  setChore(s, 'raids', { on: true, count: 3, maxDanger: 5 });
  const p = bestRaidTarget(s, 5, T0);
  if (!p) return; // monde sans camp révélé : rien à relancer (cas couvert par l'écran)
  choresTick(s, T0);
  assert.ok(raidState(s).active.length <= maxRaidOrders(12));
  // Réserve : rien ne part si l'or tomberait sous la réserve
  const s2 = realm('raid2', 12);
  setChore(s2, 'raids', { on: true, count: 3, maxDanger: 5 });
  s2.chores.raids.reserve = { gold: 1e12, food: 0 };
  choresTick(s2, T0);
  assert.equal(raidState(s2).active.length, 0);
});

// ───────── Récoltes ─────────
test('Récoltes : 5 % mis de côté, prêtes après 4 h, jamais perdues (aucune expiration), entrepôt plein respecté', () => {
  const s = realm();
  const r = rectOf(s);
  put(s, 'q', 'quarry', r.x1 + 4, r.y0 + 1, 5);
  const mods = computeMods(s, T0);
  s.resources.stone = 0;
  harvestTick(s, T0, mods);
  harvestTick(s, T0 + 2 * H, mods);
  assert.equal(harvestReady(s, 'q'), false);
  harvestTick(s, T0 + 4 * H, mods);
  assert.equal(harvestReady(s, 'q'), true);
  // Des mois plus tard : toujours là, et même plus
  const got4 = harvestState(s).acc.q.got.stone;
  harvestTick(s, T0 + 2000 * H, mods);
  assert.ok(harvestState(s).acc.q.got.stone > got4);
  assert.ok(readyHarvests(s).includes('q'));
  const before = s.resources.stone;
  assert.ok(collectHarvest(s, null, mods).ok);
  assert.ok(s.resources.stone > before);
  assert.equal(collectHarvest(s, 'q', mods).ok, false);
  assert.ok(HARVEST.share <= 0.05);
});

// ───────── Vitrine, architecte, film ─────────
test('Trophées : gagnés par les faits d’armes, exposés dans la ville fortifiée, rien ne s’achète', () => {
  const s = realm();
  s.stats.battlesWon = 30;
  assert.ok(trophyEarned(s, 'tr_battles_1'));
  assert.ok(trophiesToPlace(s).includes('tr_battles_1'));
  const placed = autoPlaceTrophies(s);
  assert.ok(placed.length >= 1);
  for (const p of placed) assert.equal(zoneAt(s, p.x, p.y), 'keep');
  assert.ok(placedTrophies(s).has('tr_battles_1'));
  assert.equal(trophiesToPlace(s).length, 0);
});

test('Architecte : silhouettes gratuites, valides, retirées quand la case est prise ; paliers futurs visibles', () => {
  const s = realm();
  const r = rectOf(s);
  const res = JSON.stringify(s.resources);
  assert.ok(addGhost(s, 'library', r.x0, r.y0).ok);
  assert.equal(JSON.stringify(s.resources), res, 'rien n’est payé');
  assert.equal(addGhost(s, 'library', r.x1 + 5, r.y0).ok, false, 'règles de zone respectées');
  assert.equal(addGhost(s, 'tavern', r.x0, r.y0).ok, false, 'une silhouette par case');
  assert.ok(ghostAt(s, r.x0, r.y0));
  put(s, 'x', 'house', r.x0, r.y0);
  assert.equal(pruneGhosts(s), 1);
  assert.equal(ghosts(s).length, 0);
  assert.ok(addGhost(s, 'forge', r.x0 + 1, r.y0).ok);
  assert.ok(removeGhost(s, r.x0 + 1, r.y0).ok);
  assert.ok(futureStages(s).length >= 1);
});

test('Film : la date de chaque bâtiment se lit dans son identifiant ; les images rejouent la croissance', () => {
  const t = Date.UTC(2026, 3, 2);
  assert.equal(buildTime(`b_${t.toString(36)}a1`), t);
  assert.equal(buildTime('b_townhall_11_7'), 0);
  const s = realm();
  put(s, `b_${(T0 + H).toString(36)}x`, 'library', 10, 6);
  put(s, `b_${(T0 + 5 * H).toString(36)}y`, 'forge', 12, 6);
  const fr = filmPlan(s, 10);
  assert.ok(fr.length >= 2);
  assert.ok(fr[0].n < fr[fr.length - 1].n);
  assert.equal(fr[fr.length - 1].n, Object.keys(s.city.buildings).length);
});

// ───────── Migration ─────────
test('Migration : une vraie sauvegarde v19 entre dans les murs, rien n’est détruit, aperçu et annulation possibles', () => {
  const txt = raw('save-fin');
  const old = JSON.parse(txt);
  const s = deserialize(txt);
  // Aucun bâtiment perdu, niveaux identiques ; seuls des trophées ont été ajoutés
  for (const [id, b] of Object.entries(old.city.buildings)) { assert.ok(s.city.buildings[id], id); assert.equal(s.city.buildings[id].level, b.level); }
  const added = Object.keys(s.city.buildings).filter((id) => !old.city.buildings[id] && !id.startsWith('p_')); // lieux v16b posés d'office
  assert.ok(added.every((id) => s.city.buildings[id].type === 'deco' && String(s.city.buildings[id].deco).startsWith('tr_')));
  assert.deepEqual(s.army, old.army);
  // Occupation de la ville fortifiée et bâtiments de ville restés dehors
  const outside = Object.values(s.city.buildings).filter((b) => isCityType(b.type) && zoneAt(s, b.x, b.y) !== 'keep');
  assert.equal(outside.length, 0, 'aucun bâtiment de ville hors des murs');
  const r = rectOf(s);
  const inside = Object.values(s.city.buildings).filter((b) => zoneAt(s, b.x, b.y) === 'keep').length;
  assert.ok(inside / keepCapacity(r.x1 - r.x0 + 1) > 0.8, `occupation ${inside}/${keepCapacity(r.x1 - r.x0 + 1)}`);
  assert.ok(cityCount(s) > 0);
  // Aperçu : anciennes positions gardées ; annulation pendant 7 jours
  const R = castleState(s).reorg;
  assert.ok(R && Object.keys(R.positions).length > 0);
  assert.ok(R.until > s.meta.lastTick + 6 * 24 * H);
  const u = deserialize(serialize(s));
  const res = undoReorganize(u);
  assert.equal(res.ok, true);
  for (const [id, b] of Object.entries(old.city.buildings)) { assert.equal(u.city.buildings[id].x, b.x, id); assert.equal(u.city.buildings[id].y, b.y, id); }
  // Une seule fois : recharger n'en refait pas une seconde
  const again = deserialize(serialize(u));
  assert.equal(again.castle.reorg, null);
  assert.ok(again.castle.reorgUndone);
  // La partie continue
  advance(s, s.meta.lastTick + 6 * H);
  for (const [k, v] of Object.entries(s.resources)) assert.ok(Number.isFinite(v) && v >= 0, k);
});
