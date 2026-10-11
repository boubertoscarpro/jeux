// Comptoir du Joaillier (ressources rares) et campagnes militaires à objectifs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createNewState } from '../src/core/state.js';
import { serialize, deserialize } from '../src/core/save.js';
import { rng, mulberry32 } from '../src/core/rng.js';
import { advance } from '../src/core/engine.js';
import { SHOP_ITEMS } from '../src/data/shop.js';
import { shopCheck, buyShopItem, shopState } from '../src/systems/shop.js';
import { RESOURCES } from '../src/data/resources.js';
import { warState, canStartCampaign, startCampaign, launchOp, warTick, chooseFinal, currentOpKey, opEnemies, raidPenalty, OPS } from '../src/systems/warcampaign.js';

const T0 = Date.UTC(2026, 6, 1);
const H = 3600000, DAY = 86400000;
const th = (s) => Object.values(s.city.buildings).find((b) => b.type === 'townhall');

test('Joaillier : ressources rares uniquement, limites quotidiennes, effets réels', () => {
  const s = createNewState({ seed: 'shop', now: T0 });
  assert.equal(shopCheck(s, 'rareGear', T0).ok, false, 'hôtel de ville 4 requis');
  th(s).level = 8;
  for (const it of Object.values(SHOP_ITEMS)) for (const r of Object.keys(it.cost)) assert.equal(RESOURCES[r].cat, 'rare', `${it.name} : payé en ressource rare (${r})`);
  assert.match(shopCheck(s, 'rareGear', T0).reason, /insuffisantes/);
  for (const r of ['gems', 'crystals', 'silver', 'rareOre', 'ancientWood']) s.resources[r] = 500;
  const items = s.inventory.items.length;
  assert.ok(buyShopItem(s, 'rareGear', T0).ok);
  assert.equal(s.inventory.items.length, items + 1);
  assert.equal(s.inventory.items.at(-1).rarity, 'rare');
  assert.ok(buyShopItem(s, 'rareGear', T0).ok);
  assert.match(shopCheck(s, 'rareGear', T0).reason, /Épuisé/, 'limite quotidienne');
  assert.ok(buyShopItem(s, 'guildCharter', T0).ok);
  assert.ok(s.buffs.some((b) => b.name === 'Charte des guildes' && b.until === T0 + 12 * H));
  assert.ok(buyShopItem(s, 'fervor', T0).ok);
  assert.equal(s.inventory.consumables.fervorElixir, 3);
  assert.match(shopCheck(s, 'architectPlans', T0).reason, /Aucun chantier/);
  const relic = s.shards.relicFragments;
  assert.ok(buyShopItem(s, 'relicMap', T0).ok);
  assert.equal(s.shards.relicFragments, relic + 1);
  assert.equal(s.resources.gems, 500 - 10 - 1, 'coût exact déduit (2 × 5 gemmes + 1 pour les élixirs)');
  const back = deserialize(serialize(s));
  assert.equal(shopState(back, T0).bought.rareGear, 2, 'achats du jour sauvegardés');
  assert.ok(shopCheck(back, 'rareGear', T0 + DAY).ok, 'renouvelé le lendemain');
});

test('Campagne : conditions, déclaration de guerre, troupes engagées puis rendues, effets durables', () => {
  rng.setSource(mulberry32(3));
  try {
    const s = createNewState({ seed: 'war', now: T0 });
    th(s).level = 6;
    assert.match(canStartCampaign(s, 0, T0).reason, /caserne/);
    s.city.buildings.br = { id: 'br', type: 'barracks', level: 5, x: 1, y: 1 };
    s.factions[0].stance = 'alliance';
    assert.equal(canStartCampaign(s, 0, T0).ok, false, 'pas contre un allié');
    s.factions[0].stance = 'neutral';
    assert.ok(canStartCampaign(s, 0, T0).declares);
    assert.ok(startCampaign(s, 0, T0).ok);
    assert.equal(s.factions[0].stance, 'war');
    assert.equal(currentOpKey(s), 'pass');
    s.army = { spearman: 2000, swordsman: 1500, archer: 1500, knight: 600 };
    const army0 = JSON.parse(JSON.stringify(s.army));
    assert.ok(launchOp(s, { spearman: 1000, archer: 800, knight: 300 }, null, T0).ok);
    assert.equal(s.army.spearman, 1000, 'troupes engagées absentes du château');
    assert.equal(launchOp(s, { spearman: 1 }, null, T0).ok, false, 'une opération à la fois');
    assert.ok(deserialize(serialize(s)).war.active.op, 'opération sauvegardée');
    advance(s, T0 + OPS.pass.minutes * 60000 + 61000);
    const a = warState(s).active;
    assert.ok(a.results.length === 1);
    assert.ok(s.army.spearman > 1000 && s.army.spearman <= army0.spearman, 'survivants rendus');
    if (a.results[0].won) {
      assert.equal(a.stage, 1); assert.ok(a.bonus > 0);
      assert.ok(raidPenalty(s, 0, T0 + H) < 1, 'raids de la faction affaiblis');
      const terr = s.factions[0].territory.length, army = s.factions[0].army;
      const en0 = opEnemies(s, 'fort');
      launchOp(s, s.army, null, T0 + 2 * H); warTick(s, T0 + 4 * H);
      if (warState(s).active?.results.at(-1).won) {
        assert.ok(s.factions[0].territory.length < terr && s.factions[0].army < army, 'la faction perd territoires et troupes');
        assert.ok(opEnemies(s, 'siege').militia < en0.militia * 1.6, 'défenses suivantes affaiblies');
        assert.equal(currentOpKey(s), null, 'objectif final à choisir');
        assert.ok(chooseFinal(s, 'siege').ok);
        launchOp(s, s.army, null, T0 + 5 * H); warTick(s, T0 + 8 * H);
        if (warState(s).history[0]?.won) { assert.equal(s.factions[0].stance, 'tributary'); globalThis.__warFull = true; }
      }
    }
    assert.ok(globalThis.__warFull, 'la campagne complète (col, fort, siège) est couverte par ce scénario');
  } finally { rng.setSource(null); }
});

test('Campagne : deux revers mettent fin à la campagne, avec un temps de repos', () => {
  rng.setSource(mulberry32(9));
  try {
    const s = createNewState({ seed: 'war2', now: T0 });
    th(s).level = 6;
    s.city.buildings.br = { id: 'br', type: 'barracks', level: 5, x: 1, y: 1 };
    s.factions[1].army = 15;
    startCampaign(s, 1, T0);
    for (let i = 0; i < 2; i++) { s.army = { spearman: 3 }; launchOp(s, { spearman: 3 }, null, T0 + i * H); warTick(s, T0 + (i + 1) * H); }
    const W = warState(s);
    assert.equal(W.active, null);
    assert.equal(W.history[0].won, false);
    assert.match(canStartCampaign(s, 1, T0 + 3 * H).reason, /se remettent/);
  } finally { rng.setSource(null); }
});
