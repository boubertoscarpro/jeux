// Conseil royal (groupes d'influence, motions) et réseau logistique (routes, pertes, relais, rations).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createNewState } from '../src/core/state.js';
import { serialize, deserialize } from '../src/core/save.js';
import { rng } from '../src/core/rng.js';
import { MOTIONS, COUNCIL } from '../src/data/council.js';
import { councilTick, openMotion, decideMotion, favorOf, councilTarget, councilMods, councilState } from '../src/systems/council.js';
import { setPolicy } from '../src/systems/policy.js';
import { computeMods } from '../src/systems/modifiers.js';
import { stabilityFactors } from '../src/systems/stability.js';
import { logisticsNetwork, upgradeRoad, sendRations, deliveredProd, clearLogisticsCache, ROADS } from '../src/systems/logistics.js';
import { outpostReport, territoryTick } from '../src/systems/territory.js';
import { key } from '../src/systems/world.js';

const T0 = Date.UTC(2026, 6, 1);
const H = 3600000;
const th = (s) => Object.values(s.city.buildings).find((b) => b.type === 'townhall');
const rich = (s) => { for (const r of Object.keys(s.resources)) s.resources[r] = 50000; };

test('Conseil royal : motions, faveur, mémoire des décisions, effets loyal/hostile', (tc) => {
  rng.setSource(() => 0.5);
  tc.after(() => rng.setSource(null));
  const s = createNewState({ seed: 'council', now: T0 });
  rich(s);
  councilTick(s, T0);
  assert.equal(councilState(s).motion, null, 'conseil fermé avant l’hôtel de ville 5');
  th(s).level = 5;
  councilTick(s, T0);
  councilTick(s, T0 + H);
  assert.ok(s.council.motion, 'première motion peu après l’ouverture');
  // Décision : le groupe favorisé gagne, l'autre perd ; ressources payées
  openMotion(s, 'pay', T0 + H);
  const gold = s.resources.gold;
  const r = decideMotion(s, 0, T0 + H);
  assert.ok(r.ok, r.reason);
  assert.ok(s.resources.gold < gold, 'solde payée');
  assert.equal(favorOf(s, 'army'), 66);
  assert.ok(s.buffs.some((b) => b.name === 'Troupes bien payées'));
  assert.ok(councilTarget(s, 'army', T0 + 2 * H) > 50, 'la décision pèse sur la cible (mémoire)');
  assert.ok(councilTarget(s, 'army', T0 + 60 * H) <= 55, 'puis s’efface après 48 h');
  // Priorité royale : pression durable
  setPolicy(s, 'commerce', T0 + 2 * H);
  assert.ok(councilTarget(s, 'merchants', T0 + 10 * H) > 55);
  // Loyal / hostile → modificateurs
  s.council.favor.scholars = 80; s.council.favor.nobles = 10;
  const m = councilMods(s);
  assert.ok(m['research.speed'] > 0 && m['build.speed'] < 0);
  assert.ok((computeMods(s, T0 + 3 * H)['research.speed'] || 0) >= 0.08 - 1e-9);
  // Assemblée des villages hostile → stabilité des provinces
  s.council.favor.peasants = 20;
  s.territories['1,1'] = { id: 'op1', name: 'Test', x: 1, y: 1, terrain: 'plain', level: 1, garrison: {} };
  assert.ok(stabilityFactors(s, s.territories['1,1'], T0).some(([l, v]) => /Assemblée/.test(l) && v < 0));
  // Motion ignorée : pénalité
  openMotion(s, 'grain', T0 + 4 * H);
  councilTick(s, T0 + 4 * H + COUNCIL.deadlineH * H + 1);
  assert.equal(s.council.motion, null);
  assert.ok(s.council.history[0].choice === -1);
  assert.ok(s.council.memory.some((m) => m.g === 'peasants' && m.v < 0 && /ignorée/.test(m.label)), 'rancune mémorisée');
  for (const mo of Object.values(MOTIONS)) assert.ok(mo.options.length >= 2 && mo.options.every((o) => o.favor), mo.title);
  const back = deserialize(serialize(s));
  assert.equal(back.council.favor.scholars, s.council.favor.scholars);
});

test('Logistique : pertes selon distance et dangers, routes, relais, capacité, rations', () => {
  const s = createNewState({ seed: 'logi', now: T0 });
  rich(s);
  const c = s.world.capital;
  // Débarrasse la zone des lieux dangereux pour un test déterministe
  for (const [k, p] of Object.entries(s.world.pois)) if (Math.hypot(p.x - c.x, p.y - c.y) < 20 && p.type !== 'capital') delete s.world.pois[k];
  clearLogisticsCache();
  const near = { id: 'a', name: 'Près', x: c.x + 3, y: c.y, terrain: 'plain', level: 1, garrison: { spearman: 8 }, spec: 'farms' };
  const far = { id: 'b', name: 'Loin', x: c.x + 15, y: c.y, terrain: 'plain', level: 1, garrison: { spearman: 8 }, spec: 'farms' };
  s.territories[key(near.x, near.y)] = near;
  s.territories[key(far.x, far.y)] = far;
  let net = logisticsNetwork(s, T0);
  assert.equal(net[key(near.x, near.y)].eff, 1, 'aucune perte à moins de 3 cases');
  const farK = key(far.x, far.y);
  assert.ok(Math.abs(net[farK].loss - 12 * 0.015) < 1e-9, '1,5 % par case au-delà de 3');
  assert.equal(net[farK].via, null);
  // Danger : un camp de bandits sur le trajet
  s.world.pois[key(c.x + 9, c.y + 1)] = { id: 'bc', type: 'banditCamp', x: c.x + 9, y: c.y + 1, danger: 2 };
  clearLogisticsCache();
  net = logisticsNetwork(s, T0);
  assert.equal(net[farK].sites, 1);
  const lossDanger = net[farK].loss;
  // Une route vers l'avant-poste proche en fait un relais pour le lointain
  assert.ok(upgradeRoad(s, key(near.x, near.y), T0).ok);
  net = logisticsNetwork(s, T0);
  assert.equal(net[farK].via, key(near.x, near.y), 'transit par l’avant-poste relié');
  assert.ok(net[farK].eff > 1 - lossDanger);
  // Route de l'avant-poste lointain : pertes réduites
  assert.ok(upgradeRoad(s, farK, T0).ok);
  assert.ok(upgradeRoad(s, farK, T0).ok);
  net = logisticsNetwork(s, T0);
  assert.equal(net[farK].road, 2);
  assert.ok(net[farK].eff > 0.9);
  // Capacité
  const d = deliveredProd({ food: 1000 }, { eff: 1, cap: ROADS[0].cap });
  assert.equal(Math.round(d.food), ROADS[0].cap);
  // Production livrée = production sur place × efficacité
  const rep = outpostReport(s, farK, T0);
  assert.ok(rep.prod.food < rep.raw.food + 1e-9);
  // Entretien des routes prélevé
  const gold = s.resources.gold;
  territoryTick(s, 3600, T0 + H);
  assert.ok(s.resources.gold !== gold);
  // Ravitaillement : garnison mal ravitaillée → rations
  s.territories[farK].road = 0;
  s.world.pois[key(c.x + 12, c.y)] = { id: 'bc2', type: 'crypt', x: c.x + 12, y: c.y, danger: 3 };
  s.world.pois[key(c.x + 13, c.y + 1)] = { id: 'bc3', type: 'crypt', x: c.x + 13, y: c.y + 1, danger: 3 };
  delete s.territories[key(near.x, near.y)];
  clearLogisticsCache();
  assert.ok(stabilityFactors(s, far, T0).some(([l]) => /mal ravitaillée/.test(l)));
  assert.ok(sendRations(s, farK, T0).ok);
  assert.ok(stabilityFactors(s, far, T0).some(([l, v]) => /rations/.test(l) && v > 0));
  assert.match(sendRations(s, farK, T0).reason, /déjà/);
});
