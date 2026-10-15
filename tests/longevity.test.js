// Commandes prestigieuses d'artisans et armoiries de la dynastie.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createNewState } from '../src/core/state.js';
import { serialize, deserialize } from '../src/core/save.js';
import { advance } from '../src/core/engine.js';
import { commissionStatus, startCommission, stageCheck, launchStage, claimCommission, abandonCommission, commissionState } from '../src/systems/commissions.js';
import { COMMISSIONS } from '../src/data/commissions.js';
import { heraldryOf, setHeraldry, tinctures } from '../src/systems/heraldry.js';
import { shardState } from '../src/systems/shards.js';

const T0 = Date.UTC(2026, 6, 1, 8);
const H = 3600000;
const th = (s) => Object.values(s.city.buildings).find((b) => b.type === 'townhall');
const rich = (s) => { for (const r of Object.keys(s.resources)) s.resources[r] = 100000; };

test('Commande : verrouillée tant que la condition manque, puis étapes payées et chronométrées', () => {
  const s = createNewState({ seed: 'cm', now: T0 });
  rich(s); s.meta.lastTick = T0;
  assert.equal(commissionStatus(s, 'heroBlade').status, 'locked');
  th(s).level = 8; s.city.buildings.fg = { id: 'fg', type: 'forge', level: 5, x: 2, y: 2 };
  assert.equal(commissionStatus(s, 'heroBlade').status, 'available');
  assert.ok(startCommission(s, 'heroBlade', T0).ok);
  assert.equal(commissionStatus(s, 'explorerAstrolabe').status === 'busy' || commissionStatus(s, 'explorerAstrolabe').status === 'locked', true, 'une seule commande à la fois');
  const steel = s.resources.steel;
  assert.ok(launchStage(s, T0).ok);
  assert.equal(s.resources.steel, steel - COMMISSIONS.heroBlade.stages[0].cost.steel);
  assert.equal(launchStage(s, T0 + 1000).ok, false, 'pas deux fois la même étape');
  let t = T0;
  for (let i = 0; i < 3; i++) { t += 5 * H; advance(s, t); if (i < 2) assert.ok(launchStage(s, t).ok); }
  assert.equal(commissionStatus(s, 'heroBlade').status, 'ready');
  const n = s.inventory.items.length, ins = s.meta.insignia;
  const r = claimCommission(s, t);
  assert.ok(r.ok, r.reason);
  assert.equal(s.inventory.items.length, n + 1);
  assert.equal(s.meta.insignia, ins + 2);
  assert.equal(claimCommission(s, t).ok, false, 'jamais deux fois');
  assert.equal(commissionStatus(s, 'heroBlade').status, 'done');
  assert.equal(startCommission(s, 'heroBlade', t).ok, false, 'une fois par dynastie');
});

test('Commande : une étape à exploit attend l’exploit ; ressources manquantes refusées sans rien payer', () => {
  const s = createNewState({ seed: 'cm2', now: T0 });
  rich(s); s.meta.lastTick = T0;
  s.stats.breachTierMax = 2;
  assert.ok(startCommission(s, 'championArmor', T0).ok);
  const a = commissionState(s).active;
  a.stage = 2;
  const chk = stageCheck(s, T0);
  assert.equal(chk.ok, false);
  assert.match(chk.reason, /bastion/);
  s.stats.breachTierMax = 3;
  s.resources.gold = 10;
  assert.equal(launchStage(s, T0).ok, false);
  assert.equal(s.resources.gold, 10);
  assert.ok(abandonCommission(s, T0).ok);
  assert.equal(commissionState(s).active, null);
});

test('Commande à relique : le fragment est consommé au lancement de l’étape', () => {
  const s = createNewState({ seed: 'cm3', now: T0 });
  rich(s);
  s.archaeo = { solved: { m1: T0 } };
  s.city.buildings.fg = { id: 'fg', type: 'forge', level: 4, x: 2, y: 2 };
  assert.ok(startCommission(s, 'aegisRestore', T0).ok);
  commissionState(s).active.stage = 2;
  shardState(s).relicFragments = 0;
  assert.match(stageCheck(s, T0).reason, /relique/);
  shardState(s).relicFragments = 1;
  assert.ok(launchStage(s, T0).ok);
  assert.equal(shardState(s).relicFragments, 0);
});

test('Commande : sauvegarde et commande inconnue', () => {
  const s = createNewState({ seed: 'cm4', now: T0 });
  rich(s); th(s).level = 8; s.city.buildings.fg = { id: 'fg', type: 'forge', level: 5, x: 2, y: 2 };
  startCommission(s, 'heroBlade', T0); launchStage(s, T0);
  const back = deserialize(serialize(s));
  assert.equal(back.commissions.active.id, 'heroBlade');
  assert.ok(back.commissions.active.stageEnd > T0);
  back.commissions.active.id = 'nope';
  assert.equal(commissionState(back).active, null);
});

test('Armoiries : choix validés, couleur principale reprise par la bannière, sauvegarde nettoyée', () => {
  const s = createNewState({ seed: 'her', now: T0 });
  assert.deepEqual(Object.keys(heraldryOf(s)).sort(), ['banner', 'charge', 'field', 'motto', 't1', 't2', 'seal'].sort());
  assert.ok(setHeraldry(s, { t1: 'gueules', charge: 'wolf', motto: 'Toujours <debout>' }).ok);
  assert.equal(s.meta.banner, tinctures(s).gueules.color);
  assert.equal(heraldryOf(s).motto, 'Toujours debout');
  assert.equal(setHeraldry(s, { charge: 'dragonXL' }).ok, false);
  assert.equal(setHeraldry(s, { t1: 'cos_banner_nope' }).ok, false, 'couleur d’une bannière non possédée');
  const d = JSON.parse(serialize(s));
  d.meta.heraldry = { field: 'zigzag', t1: 42, charge: 'wolf' };
  const back = deserialize(JSON.stringify(d));
  assert.equal(back.meta.heraldry.field, 'pale');
  assert.equal(back.meta.heraldry.charge, 'wolf');
  assert.equal(typeof back.meta.heraldry.t1, 'string');
});
