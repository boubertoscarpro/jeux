// Fenêtre d'attaque : « moitié de chaque unité » et « remplissage auto » (minimum pour gagner + marge de sécurité).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createNewState } from '../src/core/state.js';
import { POI_TYPES } from '../src/data/world.js';
import { autoFillAttack, halfOfEach, fightingUnits, AUTOFILL } from '../src/systems/autofill.js';
import { previewBattle } from '../src/systems/combat.js';
import { sendMarch } from '../src/systems/marches.js';

const T0 = Date.UTC(2026, 6, 1, 8);
function realm(seed) {
  const s = createNewState({ seed, now: T0 });
  Object.values(s.city.buildings).find((b) => b.type === 'townhall').level = 8;
  s.meta.lastTick = T0;
  s.army = { spearman: 400, swordsman: 300, archer: 300, scout: 6, spy: 2 };
  return s;
}
const camp = (s) => Object.values(s.world.pois).filter((p) => POI_TYPES[p.type]?.kind === 'danger' && !POI_TYPES[p.type].dungeon && p.danger >= 1 && p.danger <= 2)
  .sort((a, b) => Math.hypot(a.x - s.world.capital.x, a.y - s.world.capital.y) - Math.hypot(b.x - s.world.capital.x, b.y - s.world.capital.y))[0];
const count = (u) => Object.values(u).reduce((a, b) => a + b, 0);

test('Moitié de chaque unité : la moitié arrondie vers le bas, sans éclaireurs ni espions', () => {
  const s = realm('h1');
  s.army.archer = 301;
  assert.deepEqual(halfOfEach(s), { spearman: 200, swordsman: 150, archer: 150 });
  assert.ok(!('scout' in fightingUnits(s)) && !('spy' in fightingUnits(s)));
});

test('Remplissage auto : le minimum qui gagne, bien moins que toute l’armée, et la composition gagne vraiment', () => {
  const s = realm('a1');
  const poi = camp(s);
  poi.scouted = true;
  const r = autoFillAttack(s, { type: 'attack', x: poi.x, y: poi.y, units: {}, formation: 'balanced' }, T0);
  assert.ok(r.ok, r.reason);
  assert.ok(count(r.units) < count(fightingUnits(s)) * 0.5, `${count(r.units)} unités envoyées`);
  assert.ok(r.fraction <= Math.min(1, r.minimum * AUTOFILL.marginScouted) + 1e-9);
  assert.equal(r.estimated, false);
  // Proportions conservées (même mélange que l'armée disponible)
  const k = r.units.spearman / 400;
  assert.ok(Math.abs(r.units.archer / 300 - k) < 0.02);
  // L'aperçu de combat confirme la victoire avec des pertes raisonnables
  const pv = previewBattle({ units: r.units, mods: {}, formation: 'balanced' }, { units: poi.enemies, mods: { 'combat.atk': 0.05 * poi.danger, 'combat.def': 0.05 * poi.danger } }, { terrain: 'plain' });
  assert.equal(pv.winner, 'attacker');
  // La marche part avec cette composition
  assert.ok(sendMarch(s, { type: 'attack', x: poi.x, y: poi.y, units: r.units }, T0).ok);
});

test('Remplissage auto : marge prudente si le lieu n’est pas espionné ; refus clair si l’armée ne suffit pas', () => {
  const s = realm('a2');
  const poi = camp(s);
  poi.scouted = false;
  const blind = autoFillAttack(s, { type: 'attack', x: poi.x, y: poi.y, units: {} }, T0);
  poi.scouted = true;
  const seen = autoFillAttack(s, { type: 'attack', x: poi.x, y: poi.y, units: {} }, T0);
  assert.ok(blind.ok && seen.ok);
  assert.ok(blind.estimated && count(blind.units) >= count(seen.units));
  s.army = { spearman: 1 };
  const weak = autoFillAttack(s, { type: 'attack', x: poi.x, y: poi.y, units: {} }, T0);
  assert.equal(weak.ok, false);
  assert.match(weak.reason, /armée/);
  // Lieu sans ennemis (site de récolte paisible) : refus explicite
  const node = Object.values(s.world.pois).find((p) => POI_TYPES[p.type]?.kind === 'gather');
  assert.equal(autoFillAttack(s, { type: 'attack', x: node.x, y: node.y, units: {} }, T0).ok, false);
});

// ───────── Partout où l'on attaque : récolte, donjon, boss, événements en direct, campagnes ─────────
import { carryCapacity, planMarch } from '../src/systems/marches.js';
import { previewDungeon } from '../src/systems/dungeons.js';
import { spawnBoss } from '../src/systems/events.js';
import { adminStart, liveState, livePreview, sendLive } from '../src/systems/liveEvents.js';
import { autoFillLive, autoFillWarOp, autoFillNote } from '../src/systems/autofill.js';
import { startCampaign, previewOp, launchOp } from '../src/systems/warcampaign.js';
import { rng, mulberry32 } from '../src/core/rng.js';

const near = (s, f) => Object.values(s.world.pois).filter(f).sort((a, b) => Math.hypot(a.x - s.world.capital.x, a.y - s.world.capital.y) - Math.hypot(b.x - s.world.capital.x, b.y - s.world.capital.y))[0];

test('Remplissage auto (récolte) : assez de capacité pour vider le site et repousser une embuscade', () => {
  const s = realm('g1');
  const poi = near(s, (p) => POI_TYPES[p.type]?.kind === 'gather');
  poi.danger = 1; poi.scouted = true; poi.enemies = { bandit: 6 };
  const md = { type: 'gather', x: poi.x, y: poi.y, units: {}, formation: 'balanced' };
  const r = autoFillAttack(s, md, T0);
  assert.ok(r.ok, r.reason);
  assert.ok(count(r.units) < count(fightingUnits(s)));
  const mods = planMarch(s, { ...md, units: r.units }, T0).mods;
  const def = POI_TYPES[poi.type];
  const mult = 1 + (mods['gather.all'] || 0) + (mods['gather.' + def.res] || 0);
  assert.ok(carryCapacity(r.units, mods) >= Math.min(poi.amount * mult, carryCapacity(fightingUnits(s), mods)));
  assert.ok(sendMarch(s, { ...md, units: r.units }, T0).ok);
});

test('Remplissage auto (donjon) : la composition franchit toutes les salles restantes d’après l’estimation', () => {
  const s = realm('d1');
  s.army = { spearman: 3000, swordsman: 3000, archer: 3000, knight: 800 };
  const poi = near(s, (p) => POI_TYPES[p.type]?.dungeon);
  assert.ok(poi, 'un donjon sur la carte');
  const md = { type: 'dungeon', x: poi.x, y: poi.y, units: {}, formation: 'balanced', retreat: 0.5 };
  const r = autoFillAttack(s, md, T0);
  assert.ok(r.ok, r.reason);
  assert.ok(count(r.units) < count(fightingUnits(s)));
  const pv = previewDungeon(s, r.units, planMarch(s, { ...md, units: r.units }, T0).mods, poi, { retreat: 0.5 });
  assert.ok(pv.ok && pv.lossRatio <= AUTOFILL.maxLoss);
  assert.match(autoFillNote(s, r), /salle/);
});

test('Remplissage auto (boss mondial) : toutes les unités de combat, dégâts estimés, sans éclaireurs', () => {
  rng.setSource(mulberry32(5));
  try {
    const s = realm('b1');
    spawnBoss(s, null, T0);
    const r = autoFillAttack(s, { type: 'boss', x: s.boss.x, y: s.boss.y, units: {} }, T0);
    assert.ok(r.ok && r.boss);
    assert.deepEqual(r.units, fightingUnits(s));
    assert.ok(r.damage > 0);
    assert.match(autoFillNote(s, r), /boss/);
  } finally { rng.setSource(null); }
});

test('Événements en direct : remplissage auto pour attaquer et escorter, refus pour une action sans combat', () => {
  rng.setSource(mulberry32(11));
  try {
    const s = realm('ev1');
    s.army = { spearman: 600, swordsman: 500, archer: 500, knight: 150, scout: 30 };
    adminStart(s, 'steppes', T0);
    const cur = liveState(s).current;
    const camp = cur.map.targets.find((t) => t.type === 'camp' && t.tier <= 2);
    const r = autoFillLive(s, { action: 'attack', targetId: camp.id, formation: 'balanced' }, T0);
    assert.ok(r.ok, r.reason);
    assert.ok(count(r.units) < count(fightingUnits(s)) * 0.6, `${count(r.units)}`);
    const pv = livePreview(s, { action: 'attack', targetId: camp.id, units: r.units, formation: 'balanced' }, T0).pv;
    assert.equal(pv.winner, 'attacker');
    assert.ok(sendLive(s, { targetId: camp.id, action: 'attack', units: r.units }, T0).ok);
    const car = cur.map.targets.find((t) => t.type === 'caravan');
    const esc = autoFillLive(s, { action: 'escort', targetId: car.id }, T0);
    assert.ok(esc.ok && esc.ambush, esc.reason);
    assert.equal(autoFillLive(s, { action: 'trade', targetId: car.id }, T0).ok, false);
    const boss = cur.map.targets.find((t) => t.type === 'boss');
    if (boss) { const b = autoFillLive(s, { action: 'attack', targetId: boss.id }, T0); assert.ok(b.ok && b.boss); }
  } finally { rng.setSource(null); }
});

test('Campagnes : remplissage auto gagne l’opération avec moins que toute l’armée ; refus clair si trop faible', () => {
  rng.setSource(mulberry32(3));
  try {
    const s = realm('w1');
    s.city.buildings.br = { id: 'br', type: 'barracks', level: 5, x: 1, y: 1 };
    assert.ok(startCampaign(s, 0, T0).ok);
    s.army = { spearman: 2000, swordsman: 1500, archer: 1500, knight: 600, scout: 10 };
    const r = autoFillWarOp(s, null, T0);
    assert.ok(r.ok, r.reason);
    assert.ok(!('scout' in r.units));
    assert.ok(count(r.units) < count(fightingUnits(s)));
    assert.equal(previewOp(s, r.units, T0, null).pv.winner, 'attacker');
    assert.ok(launchOp(s, r.units, null, T0).ok);
    const weak = realm('w2');
    weak.city.buildings.br = { id: 'br', type: 'barracks', level: 5, x: 1, y: 1 };
    assert.ok(startCampaign(weak, 0, T0).ok);
    weak.army = { spearman: 3 };
    const w = autoFillWarOp(weak, null, T0);
    assert.equal(w.ok, false);
    assert.match(w.reason, /armée|troupe/);
  } finally { rng.setSource(null); }
});
