// Raids en série : une cible PNJ attaquée automatiquement plusieurs fois, avec garde-fous.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createNewState } from '../src/core/state.js';
import { advance } from '../src/core/engine.js';
import { serialize, deserialize } from '../src/core/save.js';
import { rng, mulberry32 } from '../src/core/rng.js';
import { POI_TYPES } from '../src/data/world.js';
import { RAID, raidState, raidStatus, raidCost, startRaidOrder, cancelRaidOrder, raidLootMult, maxRaidOrders } from '../src/systems/raidOrders.js';
import { recallMarch } from '../src/systems/marches.js';

const T0 = Date.UTC(2026, 6, 1, 8);
const H = 3600000;
const th = (s) => Object.values(s.city.buildings).find((b) => b.type === 'townhall');
function realm(seed, lvl = 8) {
  const s = createNewState({ seed, now: T0 });
  th(s).level = lvl;
  s.meta.lastTick = T0;
  for (const r of Object.keys(s.resources)) s.resources[r] = 100000;
  s.army = { spearman: 400, swordsman: 300, archer: 300, scout: 4 };
  return s;
}
const camp = (s, maxDanger = 2) => Object.values(s.world.pois).filter((p) => POI_TYPES[p.type]?.kind === 'danger' && !POI_TYPES[p.type].dungeon && p.danger >= 1 && p.danger <= maxDanger)
  .sort((a, b) => Math.hypot(a.x - s.world.capital.x, a.y - s.world.capital.y) - Math.hypot(b.x - s.world.capital.x, b.y - s.world.capital.y))[0];
const opts = (p, extra = {}) => ({ x: p.x, y: p.y, count: 10, units: { spearman: 150, swordsman: 100, archer: 100 }, formation: 'balanced', ...extra });

test('Raids en série : conditions (HdV, cible, nombre, troupes, coût) et paiement tout ou rien', () => {
  const low = realm('r0', 4);
  assert.match(raidStatus(low, opts(camp(low))).reason, /Hôtel de ville niveau 5/);
  const s = realm('r1');
  const p = camp(s);
  assert.match(raidStatus(s, opts(p, { count: 11 })).reason, /Entre 2 et 10/);
  assert.match(raidStatus(s, opts(p, { units: {} })).reason, /troupes/);
  const dungeon = Object.values(s.world.pois).find((q) => POI_TYPES[q.type]?.dungeon);
  assert.match(raidStatus(s, opts(dungeon)).reason, /hors donjons/);
  s.resources.gold = 10;
  const before = { ...s.resources };
  assert.equal(startRaidOrder(s, opts(p), T0).ok, false);
  assert.deepEqual(s.resources, before, 'rien n’est payé');
  assert.equal(maxRaidOrders(5), 1); assert.equal(maxRaidOrders(12), 2); assert.equal(maxRaidOrders(20), 3);
});

test('Raids en série : 10 attaques menées seules (y compris hors ligne), repos et réapparition respectés, butin décroissant', () => {
  rng.setSource(mulberry32(7));
  try {
    const s = realm('r2');
    const p = camp(s, 1);
    p.scouted = true;
    const gold = s.resources.gold;
    const r = startRaidOrder(s, opts(p), T0);
    assert.ok(r.ok, r.reason);
    assert.equal(gold - s.resources.gold, raidCost(s, 10).gold);
    assert.equal(s.marches.length, 1, 'première attaque partie aussitôt');
    assert.equal(s.marches[0].lootMult, 1);
    // Une seule autre série à la fois à ce niveau
    assert.match(raidStatus(s, opts(camp(s, 3))).reason, /Déjà 1/);
    const launches = [];
    let t = T0;
    while (t < T0 + 40 * H && raidState(s).active.length) {
      t += 10 * 60000;
      advance(s, t);
      for (const m of s.marches) if (m.lootMult && !launches.some((l) => l.id === m.id)) launches.push({ id: m.id, at: m.start, mult: m.lootMult });
    }
    const h = raidState(s).history[0];
    assert.ok(h, 'ordre terminé');
    assert.ok(['complete', 'expired', 'defeat', 'losses'].includes(h.why), h.why);
    assert.ok(h.done >= 5, `${h.done} attaques menées`);
    if (h.why === 'complete') assert.equal(h.done, 10);
    // Jamais deux attaques plus rapprochées que la réapparition du camp
    const respawn = (POI_TYPES[p.type].respawn || 3600) * 1000;
    for (let i = 1; i < launches.length; i++) assert.ok(launches[i].at - launches[i - 1].at >= respawn, 'attente de la réapparition');
    assert.ok(launches.every((l, i) => i === 0 || l.mult < launches[i - 1].mult || l.mult === RAID.lootFloor), 'butin décroissant');
    assert.ok(h.end - h.start <= RAID.maxHours * H + 60 * 60000);
    assert.ok(Object.keys(h.loot).length > 0);
  } finally { rng.setSource(null); }
});

test('Raids en série : la défaite arrête l’ordre et rend 80 % de l’intendance non utilisée', () => {
  rng.setSource(mulberry32(3));
  try {
    const s = realm('r3');
    const p = camp(s, 2);
    p.enemies = { bandit: 4000 };
    const r = startRaidOrder(s, opts(p, { count: 5, units: { spearman: 20 } }), T0);
    assert.ok(r.ok, r.reason);
    const goldAfterPay = s.resources.gold;
    advance(s, T0 + 6 * H);
    const h = raidState(s).history[0];
    assert.ok(h && ['defeat', 'wiped'].includes(h.why), h?.why);
    assert.equal(h.done, 1);
    assert.equal(h.refund.gold, Math.floor(raidCost(s, 5).gold * 4 / 5 * RAID.refund));
    assert.ok(s.resources.gold >= goldAfterPay + h.refund.gold - 1 || s.resources.gold > goldAfterPay);
    assert.equal(s.marches.length, 0);
  } finally { rng.setSource(null); }
});

test('Raids en série : rappel des troupes ou annulation arrêtent l’ordre ; sauvegarde conservée', () => {
  const s = realm('r4');
  const p = camp(s);
  assert.ok(startRaidOrder(s, opts(p, { count: 3 }), T0).ok);
  const b = deserialize(serialize(s));
  assert.equal(raidState(b).active.length, 1);
  assert.ok(recallMarch(b, b.marches[0].id, T0 + 60000).ok);
  advance(b, T0 + 2 * H);
  assert.equal(raidState(b).active.length, 0);
  assert.equal(raidState(b).history[0].why, 'recalled');
  const id = raidState(s).active[0].id;
  assert.ok(cancelRaidOrder(s, id, T0 + 1000).ok);
  assert.equal(raidState(s).active.length, 0);
  assert.equal(s.marches.length, 1, 'l’attaque en route va au bout');
  advance(s, T0 + 3 * H);
  assert.equal(s.marches.filter((m) => m.lootMult).length, 0, 'aucune relance après annulation');
  // Ancienne sauvegarde sans raids en série
  const raw = JSON.parse(serialize(realm('r5')));
  delete (raw.state || raw).raidOrders;
  const old = deserialize(JSON.stringify(raw));
  advance(old, T0 + H);
  assert.ok(Array.isArray(raidState(old).active));
  assert.equal(raidLootMult(20), RAID.lootFloor);
});
