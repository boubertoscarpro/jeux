import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createNewState } from '../src/core/state.js';
import { advance } from '../src/core/engine.js';
import { serialize, deserialize } from '../src/core/save.js';
import { rng, mulberry32 } from '../src/core/rng.js';
import { startBuild, startClear, startUpgrade } from '../src/systems/construction.js';
import { computeMods } from '../src/systems/modifiers.js';
import { buildingRates, netRates } from '../src/systems/economy.js';
import { adjacencyBonus, buildingsOf, terrainAt } from '../src/systems/city.js';
import { simulateBattle } from '../src/systems/combat.js';
import { sendMarch, resolvePending } from '../src/systems/marches.js';
import { poiAt } from '../src/systems/world.js';
import { POI_TYPES } from '../src/data/world.js';
import { EXPLORE_EVENTS } from '../src/data/exploration.js';
import { train } from '../src/systems/army.js';
import { generateItem } from '../src/systems/items.js';
import { equipItem } from '../src/systems/tavern.js';
import { heroMods } from '../src/systems/heroes.js';
import { sell, buy } from '../src/systems/market.js';
import { startResearch, techStatus } from '../src/systems/research.js';

const T0 = 1_700_000_000_000;
const fresh = (seed = 7) => createNewState({ seed, now: T0 });
const findTile = (s, pred) => {
  for (let y = 0; y < s.city.h; y++) for (let x = 0; x < s.city.w; x++) if (pred(x, y)) return { x, y };
  return null;
};
const freePlain = (s) => (x, y) => terrainAt(s, x, y) === 'plain' && !Object.values(s.city.buildings).some((b) => b.x === x && b.y === y);
const rich = (s) => { for (const r of Object.keys(s.resources)) s.resources[r] = 50000; };

test('nouvel état cohérent et sauvegarde aller-retour', () => {
  const s = fresh();
  assert.equal(s.city.terrain.length, s.city.w * s.city.h);
  assert.ok(Object.keys(s.world.pois).length > 100);
  assert.ok(s.heroes.length === 1);
  const back = deserialize(serialize(s));
  assert.deepEqual(back.resources, s.resources);
  assert.equal(back.world.terrain, s.world.terrain);
});

test('les sites de départ sont garantis près de la capitale', () => {
  for (const seed of [1, 2, 3, 99, 12345]) {
    const s = fresh(seed);
    const near = Object.values(s.world.pois).filter((p) => Math.hypot(p.x - s.world.capital.x, p.y - s.world.capital.y) <= 5.5);
    for (const t of ['woodNode', 'stoneNode', 'foodNode', 'ironNode', 'banditCamp']) {
      assert.ok(near.some((p) => p.type === t), `seed ${seed}: ${t} manquant`);
    }
  }
});

test('déblaiement puis construction et amélioration', () => {
  const s = fresh();
  const rub = findTile(s, (x, y) => terrainAt(s, x, y) === 'rubble');
  assert.equal(startClear(s, rub.x, rub.y, T0).ok, true);
  advance(s, T0 + 9000);
  assert.equal(terrainAt(s, rub.x, rub.y), 'plain');
  assert.equal(s.stats.cleared, 1);
  const p = findTile(s, freePlain(s));
  assert.equal(startBuild(s, 'farm', p.x, p.y, T0 + 9000).ok, true);
  assert.equal(startBuild(s, 'sawmill', p.x, p.y + 1, T0 + 9000).ok, false, 'une seule file de construction');
  advance(s, T0 + 30000);
  const farm = buildingsOf(s, 'farm')[0];
  assert.equal(farm.level, 1);
  rich(s);
  assert.equal(startUpgrade(s, farm.id, T0 + 30000).ok, false, 'limité par le niveau de l’hôtel de ville');
});

test('bonus d’adjacence : ferme au bord de la rivière', () => {
  const s = fresh();
  const mods = computeMods(s, T0);
  const nearRiver = findTile(s, (x, y) => freePlain(s)(x, y) && [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => terrainAt(s, x + dx, y + dy) === 'river'));
  const far = findTile(s, (x, y) => freePlain(s)(x, y) && x >= 8 && [-1, 0, 1].every((dx) => [-1, 0, 1].every((dy) => !['river', 'forest', 'mountain'].includes(terrainAt(s, x + dx, y + dy)))));
  assert.ok(adjacencyBonus(s, 'farm', nearRiver.x, nearRiver.y, mods).total >= 0.1);
  assert.equal(adjacencyBonus(s, 'farm', far.x, far.y, mods).total, 0);
});

test('chaîne de production : blé → farine', () => {
  const s = fresh();
  rich(s);
  s.city.buildings.th = undefined; delete s.city.buildings.th;
  const th = buildingsOf(s, 'townhall')[0]; th.level = 3;
  const p = findTile(s, freePlain(s));
  s.city.buildings.m = { id: 'm', type: 'mill', level: 1, x: p.x, y: p.y };
  s.resources.grain = 100; s.resources.flour = 0;
  const mods = computeMods(s, T0);
  const r = buildingRates(s, s.city.buildings.m, mods);
  assert.ok(r.in.grain > 0 && r.out.flour > 0);
  advance(s, T0 + 3600 * 1000);
  assert.ok(s.resources.flour > 10, `farine produite : ${s.resources.flour}`);
});

test('combat : les lanciers contrent la cavalerie, les collines favorisent les archers', () => {
  rng.setSource(mulberry32(1));
  const vsCav = (units) => simulateBattle({ units, mods: {} }, { units: { lightcav: 40 }, mods: {} }, { terrain: 'plain', weather: 'clear', deterministic: true });
  const spear = vsCav({ spearman: 60 });
  const sword = vsCav({ swordsman: 60 });
  const lossSpear = Object.values(spear.attLosses).reduce((a, b) => a + b, 0);
  const lossSword = Object.values(sword.attLosses).reduce((a, b) => a + b, 0);
  assert.ok(lossSpear < lossSword, `lanciers ${lossSpear} vs épéistes ${lossSword}`);
  assert.equal(spear.winner, 'attacker');
  const archers = (terrain) => simulateBattle({ units: { archer: 50 }, mods: {} }, { units: { bandit: 40 }, mods: {} }, { terrain, weather: 'clear', deterministic: true });
  const lost = (r) => Object.values(r.attLosses).reduce((a, b) => a + b, 0);
  const volley = (r) => r.rounds[0].attDmg;
  assert.ok(volley(archers('hills')) > volley(archers('forest')));
  assert.ok(lost(archers('hills')) <= lost(archers('forest')));
  const rain = simulateBattle({ units: { archer: 50 }, mods: {} }, { units: { bandit: 40 }, mods: {} }, { terrain: 'plain', weather: 'rain', deterministic: true });
  assert.ok(volley(rain) < volley(archers('plain')));
  rng.setSource(null);
});

test('marche de récolte : aller, récolte, retour avec butin', () => {
  rng.setSource(mulberry32(3));
  const s = fresh();
  const node = Object.values(s.world.pois).find((p) => p.type === 'woodNode' && p.danger === 0);
  const before = s.resources.wood;
  const r = sendMarch(s, { type: 'gather', x: node.x, y: node.y, units: { spearman: 10 } }, T0);
  assert.equal(r.ok, true, r.reason);
  assert.equal(s.army.spearman, 0);
  advance(s, T0 + 3 * 3600 * 1000);
  assert.equal(s.marches.length, 0);
  assert.equal(s.army.spearman, 10);
  assert.ok(s.resources.wood > before, 'du bois a été rapporté');
  assert.ok(node.amount < node.max || node.amount === node.max, 'le site a été entamé puis régénéré');
  rng.setSource(null);
});

test('exploration avec choix', () => {
  rng.setSource(mulberry32(5));
  const s = fresh();
  let tries = 0;
  // Explore jusqu'à obtenir une décision
  while (!s.pending.some((p) => p.kind === 'explore') && tries++ < 40) {
    s.army.scout = 5;
    const x = s.world.capital.x + 7 + (tries % 5), y = s.world.capital.y - 7 + Math.floor(tries / 5);
    const r = sendMarch(s, { type: 'explore', x, y, units: { scout: 1 } }, s.meta.lastTick);
    assert.equal(r.ok, true, r.reason);
    advance(s, s.meta.lastTick + 3600 * 1000);
  }
  assert.ok(s.pending.length > 0, 'un événement à choix est apparu');
  assert.ok(s.stats.explored > 0);
  const p = s.pending.find((x) => x.kind === 'explore');
  const idx = EXPLORE_EVENTS[p.event].choices.findIndex((c) => !c.cost);
  const res = resolvePending(s, p.id, idx, s.meta.lastTick);
  assert.equal(res.ok, true, res.reason);
  advance(s, s.meta.lastTick + 3600 * 1000);
  assert.equal(s.pending.filter((x) => x.kind === 'explore').length, 0);
  rng.setSource(null);
});

test('attaque d’un camp de bandits avec une armée solide', () => {
  rng.setSource(mulberry32(8));
  const s = fresh();
  const camp = Object.values(s.world.pois).find((p) => p.type === 'banditCamp' && p.danger === 1);
  s.army = { spearman: 40, swordsman: 30, archer: 30 };
  const r = sendMarch(s, { type: 'attack', x: camp.x, y: camp.y, units: { ...s.army }, heroId: s.heroes[0].id }, T0);
  assert.equal(r.ok, true, r.reason);
  advance(s, T0 + 10 * 60 * 1000);
  assert.equal(s.stats.battlesWon, 1);
  assert.ok(camp.clearedUntil > T0);
  assert.ok(s.reports.some((x) => x.kind === 'battle' && x.win));
  assert.ok(s.heroes[0].xp > 0 || s.heroes[0].level > 1);
  rng.setSource(null);
});

test('équipement : les affixes s’appliquent au commandant', () => {
  const s = fresh();
  const it = generateItem({ baseKey: 'generalSword', rarity: 'epic', ilvl: 5 });
  s.inventory.items.push(it);
  const h = s.heroes[0];
  const before = heroMods(s, h, 'commander')['combat.atk'];
  assert.equal(equipItem(s, h.id, it.id).ok, true);
  assert.ok(heroMods(s, h, 'commander')['combat.atk'] > before);
});

test('marché : vendre fait baisser le prix, acheter le fait monter', () => {
  const s = fresh();
  s.city.buildings.mk = { id: 'mk', type: 'market', level: 1, x: 0, y: 0 };
  s.resources.wood = 5000; s.resources.gold = 50000;
  const p0 = s.market.prices.wood;
  assert.equal(sell(s, 'wood', 2000, T0).ok, true);
  assert.ok(s.market.prices.wood < p0);
  const p1 = s.market.prices.iron;
  assert.equal(buy(s, 'iron', 1000, T0).ok, true);
  assert.ok(s.market.prices.iron > p1);
});

test('recherche : prérequis, exclusivité et complétion', () => {
  const s = fresh();
  rich(s);
  s.city.buildings.lib = { id: 'lib', type: 'library', level: 6, x: 0, y: 0 };
  assert.equal(techStatus(s, 'agr_rotation').status, 'locked');
  assert.equal(startResearch(s, 'agr_plough', T0).ok, true);
  advance(s, T0 + 3600 * 1000);
  assert.ok(s.techs.agr_plough);
  assert.equal(startResearch(s, 'agr_rotation', s.meta.lastTick).ok, true);
  assert.equal(techStatus(s, 'agr_pastures').status, 'excluded');
});

test('formation de troupes et entretien', () => {
  const s = fresh();
  rich(s);
  s.city.buildings.br = { id: 'br', type: 'barracks', level: 1, x: 0, y: 0 };
  assert.equal(train(s, 'spearman', 10, T0).ok, true);
  advance(s, T0 + 600 * 1000);
  assert.equal(s.army.spearman, 20);
  const mods = computeMods(s, s.meta.lastTick);
  assert.ok(netRates(s, mods).food < 0, 'l’armée consomme de la nourriture');
});

test('progression hors-ligne plafonnée à 12 h', () => {
  const s = fresh();
  advance(s, T0 + 3 * 86400 * 1000);
  assert.equal(s.meta.lastTick, T0 + 3 * 86400 * 1000);
  assert.ok(s.log.some((l) => l.text.includes('12 dernières heures')));
});
