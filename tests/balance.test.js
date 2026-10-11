// Passe d'équilibrage : écoulement des surplus, trêve après les raids, hôtel de ville de fin de partie.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createNewState } from '../src/core/state.js';
import { advanceEconomy, storageCap, OVERFLOW_RATE, OVERFLOW_GOLD_PER_LVL } from '../src/systems/economy.js';
import { computeMods } from '../src/systems/modifiers.js';
import { resolveRaid, RAID_TRUCE_H, RAID_LOST_GRACE_H } from '../src/systems/rivals.js';
import { buildingTime, TH_LATE_FROM } from '../src/data/buildings.js';

const T0 = Date.UTC(2026, 6, 1);

test('Surplus : perdu sans marché, écoulé à bas prix (et plafonné) avec un marché', () => {
  const s = createNewState({ seed: 'over', now: T0 });
  s.city.buildings.saw = { id: 'saw', type: 'sawmill', level: 10, x: 2, y: 2 };
  const mods = computeMods(s, T0);
  s.resources.wood = storageCap(s, mods, 'wood');
  const g0 = s.resources.gold;
  advanceEconomy(s, 3600, mods);
  assert.ok(s.stats.overflow.wood > 0, 'surplus mesuré');
  const goldNoMarket = s.resources.gold - g0;
  s.city.buildings.mk = { id: 'mk', type: 'market', level: 2, x: 4, y: 4 };
  const mods2 = computeMods(s, T0);
  s.resources.wood = storageCap(s, mods2, 'wood');
  assert.ok(!s.stats.overflowGold, 'sans marché : rien n’est écoulé');
  advanceEconomy(s, 3600, mods2);
  const extra = s.stats.overflowGold;
  void goldNoMarket;
  assert.ok(extra > 0, 'le marché écoule le surplus');
  assert.ok(extra <= OVERFLOW_GOLD_PER_LVL * 2 + 1e-6, 'plafonné selon le niveau du marché');
  assert.ok(OVERFLOW_RATE < 0.5, 'toujours bien moins rentable que de vendre soi-même');
});

test('Raids : trêve de 6 h, et répit supplémentaire après un pillage', () => {
  const s = createNewState({ seed: 'raid', now: T0 });
  Object.values(s.city.buildings).find((b) => b.type === 'townhall').level = 5;
  s.army = {};
  for (const r of ['wood', 'stone', 'food', 'iron']) s.resources[r] = 20000;
  const k = Object.values(s.world.pois).find((p) => p.type === 'kingdom');
  resolveRaid(s, { id: 'r', rival: k.rival, name: k.name, from: { x: k.x, y: k.y }, army: { bandit: 40, banditRider: 10 }, start: T0 - 600000, arrive: T0 }, T0);
  assert.equal(s.stats.raidsLost, 1);
  assert.ok(s.raidCooldown >= T0 + (RAID_TRUCE_H + RAID_LOST_GRACE_H) * 3600000, 'les pillards laissent le royaume se relever');
});

test('Hôtel de ville : la fin de partie demande nettement plus de temps, le début reste inchangé', () => {
  assert.equal(buildingTime('townhall', 5), buildingTime('house', 5) / 12 * 30, 'début inchangé (même formule que les autres bâtiments)');
  const ratio = buildingTime('townhall', 15) / buildingTime('townhall', 14);
  assert.ok(ratio > 2, `fin de partie ralentie (×${ratio.toFixed(2)} par niveau)`);
  assert.equal(buildingTime('sawmill', 15) / buildingTime('sawmill', 14), 1.5, 'les autres bâtiments ne changent pas');
  assert.ok(TH_LATE_FROM >= 9);
});
