// v16 « Le Château et ses Faubourgs » : zones, règles de placement, périmètre, agrandissement de l'enceinte, raids par
// zone, feu et douves, crue et douves, flancs de défense, outils, décorations utiles, paliers de silhouette, terrains
// vagues, migration d'une vraie sauvegarde v15.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { createNewState } from '../src/core/state.js';
import { advance } from '../src/core/engine.js';
import { serialize, deserialize } from '../src/core/save.js';
import { rng, mulberry32 } from '../src/core/rng.js';
import { computeMods } from '../src/systems/modifiers.js';
import { placementCheck } from '../src/systems/city.js';
import { startBuild, moveBuilding, moveCost } from '../src/systems/construction.js';
import { buildingRates, pay } from '../src/systems/economy.js';
import { resolveRaid } from '../src/systems/rivals.js';
import { spreadWave, floodZone } from '../src/systems/hazards.js';
import {
  castleState, rectOf, zoneAt, ruleOf, zoneCheck, perimeter, wallFactor, enlargePreview, enlargeEnceinte, shrinkPreview,
  breachChance, raidTargets, pillageShare, siegeDamage, moatBetween, moatOverflowChance, moatBank, setFlanks, flankBonus,
  pickRaidFlank, useTools, setTool, decoEffects, castleTick, vacantLots, migrateCastle, misplaced, freeMoveActive, castleMods, repairWall,
} from '../src/systems/castle.js';
import { ENC_STAGES, ENCEINTE, FLANK_RULES, SIEGE, DECO_FX, KEEP_ONLY, COUNTRY_ONLY, BUILDING_SCREENS, LOT_TYPES } from '../src/data/castle.js';
import { BUILDINGS } from '../src/data/buildings.js';

const T0 = Date.UTC(2026, 6, 1, 8);
const H = 3600000;
const th = (s) => Object.values(s.city.buildings).find((b) => b.type === 'townhall');
function realm(seed = 'c1', lvl = 8) {
  const s = createNewState({ seed, now: T0 });
  th(s).level = lvl;
  s.meta.lastTick = T0;
  for (const r of Object.keys(s.resources)) s.resources[r] = 200000;
  s.city.terrain = s.city.terrain.map(() => 'plain');
  return s;
}
const put = (s, id, type, x, y, level = 1) => (s.city.buildings[id] = { id, type, x, y, level });

// ───────── Zones ─────────
const noPlaces = (o) => Object.fromEntries(Object.entries(o).filter(([k, v]) => !k.startsWith('p_') && !(v.type === 'deco' && String(v.deco).startsWith('tr_')))); // lieux v16 et trophées v20 : ajoutés, jamais retirés

// v20 « Ma forteresse » : ces règles remplacent celles de la v16 (cour 5 × 5, faubourgs, facteur de périmètre,
// agrandissement côté par côté). L'intention est gardée : des zones lisibles, des règles de placement, une enceinte
// qui grandit à un coût connu.
test('Zones (v20) : ville fortifiée 6 × 6 autour de l’hôtel de ville, douves sur 1 case, abords sur 2, campagne au-delà', () => {
  const s = realm();
  const r = rectOf(s);
  assert.deepEqual(r, { x0: 9, y0: 5, x1: 14, y1: 10 });
  assert.equal(zoneAt(s, 11, 7), 'keep');
  assert.equal(zoneAt(s, 14, 10), 'keep');
  assert.equal(zoneAt(s, 8, 7), 'moat');
  assert.equal(zoneAt(s, 7, 7), 'faubourg');
  assert.equal(zoneAt(s, 6, 7), 'faubourg');
  assert.equal(zoneAt(s, 5, 7), 'country');
  assert.equal(zoneAt(s, 16, 7), 'faubourg');
});

test('Placement (v20) : la ville dans les murs, les champs dehors, quelques métiers partout, rien sur les douves', () => {
  const s = realm();
  assert.equal(ruleOf('library'), 'keep');
  assert.equal(ruleOf('market'), 'keep');
  assert.equal(ruleOf('farm'), 'country');
  assert.equal(ruleOf('tannery'), 'any');
  assert.equal(placementCheck(s, 'library', 10, 6).ok, true);
  assert.match(placementCheck(s, 'library', 18, 7).reason, /dans les murs/);
  assert.equal(placementCheck(s, 'farm', 18, 7).ok, true);
  assert.match(placementCheck(s, 'farm', 10, 6).reason, /hors les murs/);
  assert.equal(placementCheck(s, 'tannery', 10, 6).ok, true);
  assert.equal(placementCheck(s, 'tannery', 18, 7).ok, true);
  assert.equal(placementCheck(s, 'tannery', 8, 7).ok, false, 'douves : inconstructibles');
  assert.equal(placementCheck(s, 'library', 11, 9).ok, false, 'allée de la porte réservée');
  for (const t of [...KEEP_ONLY, ...COUNTRY_ONLY]) assert.ok(BUILDINGS[t], t);
  assert.equal(startBuild(s, 'library', 18, 7, T0).ok, false);
});

test('Effets de zone (v20) : plus de malus pour les maisons ou le marché dans les murs ; entrepôts protégés, bornés', () => {
  const s = realm();
  put(s, 'm2', 'market', 10, 6);
  const m = computeMods(s, T0);
  const r = (o) => Object.values(o.out).reduce((a, b) => a + b, 0);
  assert.ok(r(buildingRates(s, s.city.buildings.m2, m)) > 0, 'le marché de la ville produit');
  for (let i = 0; i < 5; i++) put(s, 'w' + i, 'warehouse', 12 + (i % 3), 5 + Math.floor(i / 3));
  assert.ok((castleMods(s).protect || 0) <= 0.1 + 1e-9);
});

test('Enceinte (v20) : la taille ne pénalise plus la muraille (facteur 1)', () => {
  const s = realm();
  s.city.fort.wall = 10;
  assert.equal(perimeter(rectOf(s)), 24);
  assert.equal(wallFactor(s), 1);
  assert.equal(castleMods(s)['wall.pct'] || 0, 0);
});

test('Agrandir (v20) : par paliers liés à l’hôtel de ville, coût connu, terrain aplani, rien n’est détruit, plus de réduction', () => {
  const s = realm('c1', 3);
  assert.equal(enlargePreview(s).ok, false, 'hôtel de ville 4 requis pour 7 × 7');
  th(s).level = 8;
  const p = enlargePreview(s);
  assert.equal(p.ok, true);
  assert.equal(p.size, 7);
  const n0 = Object.keys(s.city.buildings).length;
  const st0 = s.resources.stone;
  assert.equal(enlargeEnceinte(s, null, (c) => pay(s, c), T0).ok, true);
  assert.equal(st0 - s.resources.stone, p.cost.stone);
  assert.equal(Object.keys(s.city.buildings).length, n0);
  const r = rectOf(s);
  assert.equal(r.x1 - r.x0 + 1, 7);
  assert.equal(shrinkPreview(s, 'e').ok, false);
  // Un agrandissement du domaine offre le palier suivant
  castleState(s).freeGrow = 1;
  th(s).level = 12;
  assert.equal(enlargePreview(s).free, true);
  const g0 = s.resources.gold;
  assert.equal(enlargeEnceinte(s, null, (c) => pay(s, c), T0).ok, true);
  assert.equal(s.resources.gold, g0);
});

// ───────── Raids par zone ─────────
test('Raids : brèche selon muraille et douves ; la cour n’est exposée qu’en cas de brèche', () => {
  const s = realm();
  assert.equal(breachChance(s), 1, 'sans muraille, rien n’arrête les pillards');
  s.city.fort.wall = 10; s.city.fort.moat = 5;
  assert.ok(Math.abs(breachChance(s) - Math.max(SIEGE.breachMin, 0.65 - 0.25 - 0.15)) < 1e-9);
  s.city.fort.wall = 25; s.city.fort.moat = 10;
  assert.equal(breachChance(s), SIEGE.breachMin);
  put(s, 'lib', 'library', 10, 6); put(s, 'f1', 'farm', 18, 7);
  assert.deepEqual(raidTargets(s, false).map((b) => b.id), ['f1']);
  assert.ok(raidTargets(s, true).some((b) => b.id === 'lib'));
  assert.ok(!raidTargets(s, true).some((b) => b.type === 'townhall'));
  // Entrepôt intra-muros et muraille qui tient : pillage réduit
  assert.equal(pillageShare(s, false), SIEGE.heldPillage);
  assert.equal(pillageShare(s, true), 0.3);
});

// v19 : une défaite veut dire qu'un flanc a cédé puis la cour (la brèche n'est plus tirée au hasard) ; les pillards
// frappent alors hors les murs comme dans la cour, et la muraille est abîmée
test('Raids : défaite → flanc percé, bâtiment incendié, dégâts de muraille, réparation', () => {
  rng.setSource(mulberry32(11));
  try {
    let outsideHits = 0, insideHits = 0, breachedInside = 0;
    for (let i = 0; i < 40; i++) {
      const s = realm('r' + i);
      s.city.fort.wall = 25; s.city.fort.moat = 10; // brèche 15 %
      s.army = {};
      put(s, 'lib', 'library', 10, 6); put(s, 'f1', 'farm', 18, 7);
      resolveRaid(s, { id: 'x', rival: 0, name: 'Pillards', army: { royalKnight: 400 }, flank: 'front' }, T0);
      const rep = s.reports[0];
      assert.equal(rep.win, false);
      if (s.city.buildings.lib.damaged) insideHits++;
      if (s.city.buildings.f1.damaged) outsideHits++;
      assert.ok(s.castle.wallDmg > 0);
      assert.ok(rep.siege.breached.length > 0, 'une défaite passe par un flanc percé');
      if (rep.siege.breached.length < 2) breachedInside += rep.breached ? 1 : 0;
    }
    assert.ok(outsideHits + insideHits > 0);
    // v19 : un seul flanc percé ne livre l'intérieur qu'avec la chance de brèche (15 % ici), comme en v16
    assert.ok(breachedInside < 20, `${breachedInside} intérieurs livrés sur 40`);
    // Les maçons réparent 10 % par heure
    const s = realm(); s.city.fort.wall = 5; siegeDamage(s, { win: false, breached: true });
    assert.equal(s.castle.wallDmg, SIEGE.dmgBreach);
    castleTick(s, T0, 1);
    assert.ok(Math.abs(s.castle.wallDmg - (SIEGE.dmgBreach - SIEGE.repairPerHour)) < 1e-9);
    assert.ok(castleMods(s)['wall.pct'] < 0, 'une muraille abîmée défend moins');
    assert.equal(repairWall(s, (c) => pay(s, c)).ok, true);
    assert.equal(s.castle.wallDmg, 0);
  } finally { rng.setSource(null); }
});

// ───────── Feu et eau ─────────
test('Feu : il ne traverse pas les douves, mais traverse une enceinte sans douves', () => {
  rng.setSource(mulberry32(3));
  try {
    const s = realm();
    put(s, 'a', 'house', 14, 7); put(s, 'b', 'house', 15, 7); // de part et d'autre de la muraille est (v20 : 6 × 6)
    s.city.buildings.a.damaged = true;
    assert.equal(moatBetween(s, s.city.buildings.a, s.city.buildings.b), false);
    s.city.fort.moat = 1;
    assert.equal(moatBetween(s, s.city.buildings.a, s.city.buildings.b), true);
    for (let i = 0; i < 30; i++) spreadWave(s, { burnt: ['a'] });
    assert.ok(!s.city.buildings.b.damaged, 'les douves arrêtent le feu');
    s.city.fort.moat = 0;
    let crossed = false;
    for (let i = 0; i < 60 && !crossed; i++) { const f = { burnt: ['a'] }; spreadWave(s, f); crossed = f.burnt.includes('b'); }
    assert.ok(crossed, 'sans douves, le feu passe');
  } finally { rng.setSource(null); }
});

test('Crue : les douves débordent moins quand elles sont larges ; débordement → bâtiments au pied de la muraille', () => {
  const s = realm();
  assert.equal(moatOverflowChance(s), 0, 'sans douves, rien ne déborde');
  s.city.fort.moat = 1;
  assert.ok(Math.abs(moatOverflowChance(s) - 0.54) < 1e-9);
  s.city.fort.moat = 10;
  assert.equal(moatOverflowChance(s), 0);
  put(s, 'in', 'house', 9, 7); put(s, 'out', 'house', 8, 7); put(s, 'far', 'house', 11, 7);
  const bank = moatBank(s).map((b) => b.id);
  assert.ok(bank.includes('in') && bank.includes('out') && !bank.includes('far'));
  assert.ok(floodZone(s, true).some((b) => b.id === 'in'));
  assert.ok(!floodZone(s, false).some((b) => b.id === 'in'));
});

// ───────── Flancs ─────────
test('Flancs : répartition égale neutre, bonus borné à ±15 %, cour en réserve à moitié', () => {
  const s = realm();
  for (const f of ['left', 'front', 'right']) assert.equal(flankBonus(s, f), 0);
  setFlanks(s, { left: 0, front: 1, right: 0, yard: 0 });
  assert.equal(flankBonus(s, 'front'), FLANK_RULES.maxBonus);
  assert.equal(flankBonus(s, 'left'), -FLANK_RULES.maxBonus);
  setFlanks(s, { left: 0, front: 0, right: 0, yard: 1 });
  assert.ok(Math.abs(flankBonus(s, 'left') - (0.5 / 0.375 - 1) * 0.15) < 1e-3);
  // Les assaillants visent le flanc le plus faible une fois sur deux
  setFlanks(s, { left: 0.1, front: 0.5, right: 0.4, yard: 0 });
  let left = 0; const r = mulberry32(5);
  for (let i = 0; i < 2000; i++) if (pickRaidFlank(s, r) === 'left') left++;
  assert.ok(left / 2000 > 0.6 && left / 2000 < 0.73, `flanc gauche visé ${left / 2000}`);
});

test('Outils de défense : muraille requise, payés seulement s’ils servent, effet borné', () => {
  const s = realm();
  assert.equal(setTool(s, 'stones', 'left').ok, false, 'muraille requise');
  s.city.fort.wall = 10;
  for (const t of ['stones', 'pitch', 'archers']) assert.equal(setTool(s, t, 'left').ok, true);
  const st = s.resources.stone;
  const none = useTools(s, 'right', (c) => pay(s, c));
  assert.deepEqual(none.used, []);
  assert.equal(s.resources.stone, st);
  const u = useTools(s, 'left', (c) => pay(s, c));
  assert.equal(u.used.length, 3);
  assert.ok((u.mods['combat.def'] || 0) + (u.mods['combat.atk'] || 0) <= 0.12 + 1e-9);
  assert.ok(s.resources.stone < st);
});

test('Flancs intégrés au raid : un flanc dégarni perd plus souvent qu’un flanc garni', () => {
  const outcome = (front) => {
    let wins = 0;
    for (let i = 0; i < 30; i++) {
      rng.setSource(mulberry32(100 + i));
      const s = realm('f' + i);
      s.city.fort.wall = 5;
      s.army = { swordsman: 60, archer: 40 };
      setFlanks(s, front ? { left: 0, front: 1, right: 0, yard: 0 } : { left: 0.5, front: 0, right: 0.5, yard: 0 });
      resolveRaid(s, { id: 'x', rival: 0, name: 'Pillards', army: { militia: 45, royalArcher: 23, royalKnight: 14 }, flank: 'front' }, T0); // force réglée au seuil (≈ 75 % d'une garnison neutre)
      if (s.reports[0].win) wins++;
      assert.match(s.reports[0].text, /front/);
    }
    rng.setSource(null);
    return wins;
  };
  const good = outcome(true), bad = outcome(false);
  assert.ok(good > bad, `garni ${good} / dégarni ${bad}`);
});

// ───────── Décorations ─────────
test('Décorations utiles (v20) : dans les murs (garnison, et ouvriers près des maisons), dehors sans effet ; bornées', () => {
  const s = realm();
  s.city.buildings.d1 = { id: 'd1', type: 'deco', deco: 'x', level: 1, x: 13, y: 7 }; // à côté de la maison (12, 8)
  s.city.buildings.d2 = { id: 'd2', type: 'deco', deco: 'y', level: 1, x: 20, y: 8 };
  s.city.buildings.d3 = { id: 'd3', type: 'deco', deco: 'z', level: 1, x: 10, y: 5 };
  let e = decoEffects(s);
  assert.equal(e.mods['worker.morale'], DECO_FX.keepNear.per);
  assert.equal(e.mods['combat.morale'], 2 * DECO_FX.keep.per);
  assert.equal(e.list.find((x) => x.id === 'd2').active, false);
  for (let i = 0; i < 12; i++) s.city.buildings['k' + i] = { id: 'k' + i, type: 'deco', deco: 'k' + i, level: 1, x: 9 + (i % 6), y: 9 + Math.floor(i / 6) };
  e = decoEffects(s);
  assert.ok((e.mods['worker.morale'] || 0) <= DECO_FX.keepNear.per * DECO_FX.keepNear.max);
  assert.ok(e.mods['combat.morale'] <= DECO_FX.keep.per * DECO_FX.keep.max);
});

// ───────── Silhouette, terrains vagues ─────────
test('Silhouette : un palier franchi est signalé une seule fois', () => {
  const s = realm('st', 2);
  castleState(s);
  th(s).level = 3;
  assert.equal(castleTick(s, T0, 0.1).name, 'Village palissadé');
  assert.equal(castleTick(s, T0, 0.1), null);
  th(s).level = 15;
  assert.equal(castleTick(s, T0, 0.1).name, 'Capitale');
});

test('Terrains vagues : un emplacement stable par bâtiment « menu » absent, dans sa zone, sur une case libre', () => {
  const s = realm();
  const lots = vacantLots(s);
  assert.deepEqual(vacantLots(s), lots, 'stable');
  assert.ok(lots.length >= 8);
  const keys = new Set();
  for (const l of lots) {
    assert.ok(LOT_TYPES.includes(l.type));
    assert.equal(placementCheck(s, l.type, l.x, l.y).ok, true, l.type);
    assert.ok(!keys.has(l.x + ',' + l.y)); keys.add(l.x + ',' + l.y);
    assert.deepEqual(l.screens, BUILDING_SCREENS[l.type] || []);
  }
  assert.equal(lots.find((l) => l.type === 'library') && zoneAt(s, lots.find((l) => l.type === 'library').x, lots.find((l) => l.type === 'library').y), 'keep');
  assert.ok(!lots.some((l) => l.type === 'warehouse'), 'l’entrepôt existe déjà');
});

// ───────── Sauvegardes ─────────
test('Migration : une vraie sauvegarde v15 reçoit une enceinte, rien n’est détruit, déménagement gratuit 7 jours', () => {
  const raw = gunzipSync(readFileSync(new URL('./fixtures/save-v15.json.gz', import.meta.url))).toString();
  const old = JSON.parse(raw);
  assert.ok(!old.castle, 'fixture au format v15');
  const s = deserialize(raw);
  assert.equal(Object.keys(noPlaces(s.city.buildings)).length, Object.keys(old.city.buildings).length, 'aucun bâtiment supprimé');
  assert.ok(['p_scriptorium', 'p_herald', 'p_embassy'].every((k) => s.city.buildings[k]), 'les nouveaux lieux sont posés sur des cases libres');
  // v20 : la ville peut être réorganisée dans les murs ; les anciennes places sont gardées pour l'annulation
  const was = s.castle.reorg?.positions || {};
  for (const [id, b] of Object.entries(old.city.buildings)) { assert.equal(was[id] ? was[id][0] : s.city.buildings[id].x, b.x); assert.equal(s.city.buildings[id].level, b.level); }
  assert.deepEqual(s.army, old.army);
  const r = rectOf(s);
  const t = th(s);
  assert.equal(zoneAt(s, t.x, t.y), 'keep', 'l’hôtel de ville est dans la cour');
  assert.ok(r.x1 - r.x0 + 1 <= ENC_STAGES[ENC_STAGES.length - 1].size && r.y1 - r.y0 + 1 <= ENC_STAGES[ENC_STAGES.length - 1].size);
  assert.ok(freeMoveActive(s, s.meta.lastTick + 6 * 24 * H));
  assert.ok(!freeMoveActive(s, s.meta.lastTick + 8 * 24 * H));
  assert.ok(Number.isFinite(s.meta.castleMigrated.misplaced));
  // Les bâtiments mal placés produisent toujours
  const m = computeMods(s, s.meta.lastTick);
  for (const b of misplaced(s)) if (b.level > 0 && BUILDINGS[b.type].prod) assert.ok(Object.values(buildingRates(s, b, m).out).some((v) => v > 0), b.type);
  // Déménagement gratuit d'un bâtiment mal placé vers une case autorisée
  const mp = misplaced(s).find((b) => b.level > 0 && !s.queues.build.some((q) => q.bid === b.id));
  if (mp) {
    let dest = null;
    for (let y = 0; y < s.city.h && !dest; y++) for (let x = 0; x < s.city.w && !dest; x++) if (placementCheck(s, mp.type, x, y).ok) dest = { x, y };
    const gold = s.resources.gold;
    const now = Date.now();
    s.castle.freeMoveUntil = now + H;
    assert.equal(moveBuilding(s, mp.id, dest.x, dest.y).ok, true);
    assert.equal(s.resources.gold, gold, 'gratuit');
    assert.ok(moveCost(mp).gold > 0);
  }
  // La partie continue
  advance(s, s.meta.lastTick + 24 * H);
  for (const [k, v] of Object.entries(s.resources)) assert.ok(Number.isFinite(v) && v >= 0, k);
  const again = deserialize(serialize(s));
  assert.deepEqual(again.castle.rect, s.castle.rect);
  assert.equal(again.castle.migrated, s.castle.migrated, 'pas de seconde migration');
});

test('Migration : l’enceinte n’enferme ni champ ni carrière', () => {
  const s = realm();
  put(s, 'lib', 'library', 14, 7); put(s, 'far', 'forge', 16, 7); put(s, 'farm', 'farm', 11, 3);
  delete s.castle;
  migrateCastle(s, T0);
  assert.equal(zoneAt(s, 14, 7), 'keep', 'la bibliothèque proche est rattrapée par l’enceinte');
  assert.notEqual(zoneAt(s, 16, 7), 'keep', 'la forge lointaine reste dehors (enceinte courte, muraille non affaiblie)');
  assert.notEqual(zoneAt(s, 11, 3), 'keep', 'la ferme reste dehors');
  // Une ferme sur le chemin : l'enceinte ne s'étend pas jusqu'à la forge plutôt que d'enfermer la ferme
  const s2 = realm();
  put(s2, 'forge', 'forge', 11, 3); put(s2, 'farm', 'farm', 11, 4);
  delete s2.castle;
  migrateCastle(s2, T0);
  assert.notEqual(zoneAt(s2, 11, 4), 'keep');
  assert.ok(misplaced(s2).some((b) => b.id === 'forge'), 'la forge reste dehors, active, à déménager');
});
