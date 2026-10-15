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

// ───────── Monde évolutif ─────────
import { worldMarksTick, scar, regionEffect, regenMult, markAt, townRankMult } from '../src/systems/worldmarks.js';
import { townPrice } from '../src/systems/market.js';
import { computeMods } from '../src/systems/modifiers.js';

function withOutpost(seed) {
  const s = createNewState({ seed, now: T0 });
  const c = s.world.capital;
  s.territories[`${c.x + 2},${c.y}`] = { id: 'op1', x: c.x + 2, y: c.y, terrain: 'plain', level: 1, stability: 80, garrison: {} };
  return { s, t: s.territories[`${c.x + 2},${c.y}`] };
}

test('Monde : la guerre ravage une région (production −25 %), puis elle se relève', () => {
  const { s, t } = withOutpost('w1');
  assert.equal(regionEffect(s, t, T0).mult, 1);
  scar(s, t.x, t.y, T0, 36);
  assert.equal(regionEffect(s, t, T0 + H).mult, 0.75);
  const node = { x: t.x + 1, y: t.y, type: 'woodNode' };
  assert.equal(regenMult(s, node, T0 + H), 0.6);
  worldMarksTick(s, T0 + 37 * H);
  assert.equal(markAt(s, t.x, t.y), null);
  assert.equal(regionEffect(s, t, T0 + 37 * H).mult, 1);
});

test('Monde : un avant-poste stable fait naître un hameau qui grandit ; la révolte le vide', () => {
  const { s, t } = withOutpost('w2');
  worldMarksTick(s, T0);
  worldMarksTick(s, T0 + 25 * H);
  assert.equal(t.hamlet, 1);
  assert.ok(regionEffect(s, t, T0 + 25 * H).mult > 1);
  worldMarksTick(s, T0 + 25 * H + 49 * H);
  assert.equal(t.hamlet, 2);
  t.revolt = true;
  worldMarksTick(s, T0 + 100 * H);
  assert.equal(t.hamlet, 1);
});

test('Monde : bois surexploité → coupes rases → forêt restaurée', () => {
  const s = createNewState({ seed: 'w3', now: T0 });
  const p = Object.values(s.world.pois).find((x) => x.type === 'woodNode');
  p.exhaust = 2;
  worldMarksTick(s, T0);
  assert.equal(markAt(s, p.x, p.y).kind, 'overcut');
  p.exhaust = 0.1;
  worldMarksTick(s, T0 + H);
  assert.equal(markAt(s, p.x, p.y).kind, 'regrown');
  assert.equal(regenMult(s, p, T0 + 2 * H), 1.25);
});

test('Monde : une route impayée 24 h se dégrade ; reconstruite, la ruine disparaît', () => {
  const { s, t } = withOutpost('w4');
  t.road = 2; t.roadUnpaid = true;
  worldMarksTick(s, T0);
  worldMarksTick(s, T0 + 25 * H);
  assert.equal(t.road, 1);
  assert.equal(markAt(s, t.x, t.y).kind, 'ruinedRoad');
  t.roadUnpaid = false; t.road = 2;
  worldMarksTick(s, T0 + 26 * H);
  assert.equal(markAt(s, t.x, t.y), null);
});

test('Monde : une cité souvent visitée par vos caravanes gagne en importance (prix +4 % par rang)', () => {
  const s = createNewState({ seed: 'w5', now: T0 });
  const town = Object.values(s.world.pois).find((p) => p.type === 'town');
  const mods = computeMods(s, T0);
  const before = townPrice(s, town, 'wood', mods, T0);
  (s.routes ||= {})[`${town.x},${town.y}`] = { trips: 16 };
  worldMarksTick(s, T0);
  assert.equal(town.rank, 2);
  assert.equal(townRankMult(town), 1.08);
  assert.ok(Math.abs(townPrice(s, town, 'wood', mods, T0) / before - 1.08) < 1e-9);
});

// ───────── Codex ─────────
import { codexTick, codexProgress, codexState } from '../src/systems/codex.js';

test('Codex : les entrées s’ouvrent avec ce que le royaume a construit, formé, affronté et découvert', () => {
  const s = createNewState({ seed: 'cx', now: T0 });
  codexTick(s, T0);
  const C = codexState(s);
  assert.ok(C.seen.building.townhall, 'hôtel de ville connu');
  assert.ok(!C.seen.enemy.troll);
  s.reports.push({ t: T0, enemies: { troll: 1, bandit: 3 } });
  s.techs.eco_tools = true;
  codexTick(s, T0 + 1);
  assert.ok(C.seen.enemy.troll && C.seen.enemy.bandit);
  assert.ok(C.seen.tech.eco_tools);
  const p = codexProgress(s);
  assert.ok(p.have > 0 && p.have < p.total);
  // Le savoir ne se perd pas
  s.reports = [];
  codexTick(s, T0 + 2);
  assert.ok(C.seen.enemy.troll);
});

// ───────── Scénarios ─────────
import { scenarioTick, scenarioObjectives, scenarioMods } from '../src/systems/scenarios.js';
import { SCENARIOS } from '../src/data/scenarios.js';

test('Scénarios : conditions de départ et règles appliquées, partie libre par défaut', () => {
  const free = createNewState({ seed: 'sc', now: T0 });
  assert.equal(free.scenario.id, 'none');
  const fr = createNewState({ seed: 'sc', now: T0, scenario: 'frontier' });
  assert.equal(fr.city.fort.wall, 1);
  assert.ok(fr.army.spearman >= 40);
  assert.ok((computeMods(fr, T0)['city.def'] || 0) >= (computeMods(free, T0)['city.def'] || 0) + 0.1 - 1e-9);
  assert.ok(Object.values(fr.world.pois).some((p) => p.type === 'kingdom' && p.anger >= 4));
  const iso = createNewState({ seed: 'sc', now: T0, scenario: 'isolated' });
  assert.ok(iso.resources.wood < free.resources.wood);
  assert.ok(Object.values(iso.world.pois).filter((p) => p.type === 'crystalNode').length >= Object.values(free.world.pois).filter((p) => p.type === 'crystalNode').length + 1);
  const me = createNewState({ seed: 'sc', now: T0, scenario: 'merchant' });
  assert.ok(me.factions.every((f, i) => f.relation <= free.factions[i].relation - 19));
});

test('Scénarios : objectifs acquis, record et récompense versés une seule fois ; échec si guerre en « moissons »', () => {
  const s = createNewState({ seed: 'sc2', now: T0, scenario: 'merchant' });
  s.stats.caravans = 30; s.stats.contracts = 12;
  s.factions[0].stance = 'trade'; s.factions[1].stance = 'alliance';
  Object.values(s.world.pois).find((p) => p.type === 'town').rank = 2;
  const ins = s.meta.insignia;
  scenarioTick(s, T0 + 50 * H);
  assert.ok(s.scenario.completedAt);
  assert.equal(s.meta.scenarioRecords.merchant, 50);
  assert.equal(s.meta.insignia, ins + SCENARIOS.merchant.reward.insignia);
  scenarioTick(s, T0 + 60 * H);
  assert.equal(s.meta.insignia, ins + SCENARIOS.merchant.reward.insignia, 'pas de double récompense');
  assert.ok(scenarioObjectives(s).every((o) => o.done));
  const p = createNewState({ seed: 'sc3', now: T0, scenario: 'poor' });
  scenarioTick(p, T0 + H);
  p.stats.wars = (p.stats.wars || 0) + 1;
  scenarioTick(p, T0 + 2 * H);
  assert.ok(p.scenario.failed);
  assert.deepEqual(scenarioMods(p), {}, 'les règles du scénario cessent');
  const back = deserialize(serialize(p));
  assert.equal(back.scenario.id, 'poor');
});

// ───────── Épreuves de tradition ─────────
import { legacyTick, legacyState } from '../src/systems/legacy.js';
test('Traditions : chaque tradition adoptée ouvre une épreuve, payée une seule fois par dynastie', () => {
  const s = createNewState({ seed: 'tr', now: T0 });
  legacyState(s).traditions = ['keepers'];
  s.dynasty = { points: 0, count: 0 };
  legacyTick(s, T0);
  assert.ok(!s.traditionTrials?.keepers);
  s.stats.raidsRepelled = 10;
  legacyTick(s, T0 + 1);
  legacyTick(s, T0 + 2);
  assert.ok(s.traditionTrials.keepers);
  assert.equal(s.dynasty.points, 2);
  assert.ok(s.meta.titles.includes('Rempart vivant'));
});
