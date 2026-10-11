// Priorités royales (orientation stratégique) et gestion à distance des avant-postes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createNewState } from '../src/core/state.js';
import { serialize, deserialize } from '../src/core/save.js';
import { advance } from '../src/core/engine.js';
import { computeMods } from '../src/systems/modifiers.js';
import { setPolicy, activePolicy, policyState, canChangePolicy, alignPriorities } from '../src/systems/policy.js';
import { POLICIES, POLICY_TRANSITION, POLICY_LOCK } from '../src/data/policies.js';
import { playStyle } from '../src/systems/missions.js';
import { claimTerritory, fillGarrison, outpostReport, setSpec, garrisonNeed } from '../src/systems/territory.js';

const T0 = Date.UTC(2026, 6, 1);
const th = (s) => Object.values(s.city.buildings).find((b) => b.type === 'townhall');
const fresh = () => { const s = createNewState({ seed: 'pol', now: T0 }); th(s).level = 4; return s; };

test('Priorité royale : réservée à l’hôtel de ville 3, transition sans effet, puis bonus et malus', () => {
  const s = createNewState({ seed: 'pol0', now: T0 });
  assert.equal(setPolicy(s, 'prosperity', T0).ok, false, 'hôtel de ville 1 : pas encore');
  th(s).level = 3;
  const base = computeMods(s, T0)['prod.all'] || 0;
  assert.ok(setPolicy(s, 'prosperity', T0).ok);
  assert.equal(activePolicy(s, T0 + 1000), null, 'réorganisation : aucune priorité');
  assert.equal(computeMods(s, T0 + 1000)['prod.all'] || 0, base);
  const t1 = T0 + POLICY_TRANSITION + 1;
  assert.equal(activePolicy(s, t1), 'prosperity');
  const m = computeMods(s, t1);
  assert.ok(Math.abs((m['prod.all'] || 0) - base - 0.08) < 1e-9, 'bonus appliqué');
  assert.ok((m['train.speed'] || 0) <= -0.12 + 1e-9 + 0, 'malus appliqué');
});

test('Priorité royale : délai entre deux changements, retour immédiat à l’équilibre, persistance', () => {
  const s = fresh();
  assert.ok(setPolicy(s, 'defense', T0).ok);
  assert.equal(setPolicy(s, 'commerce', T0 + 60000).ok, false, 'délai de 4 h');
  assert.match(canChangePolicy(s, 'commerce', T0 + 60000).reason, /min/);
  advance(s, T0 + POLICY_LOCK + 1);
  assert.equal(policyState(s).id, 'defense', 'transition terminée par le moteur');
  assert.ok(setPolicy(s, 'balanced', T0 + POLICY_LOCK + 2).ok);
  assert.equal(activePolicy(s, T0 + POLICY_LOCK + 2), 'balanced', 'équilibre immédiat');
  const back = deserialize(serialize(s));
  assert.equal(back.policy.pending || back.policy.id, 'balanced');
  assert.equal(back.policy.history.length, 2);
  // Anciennes sauvegardes : priorité absente → équilibre
  const old = JSON.parse(serialize(s)); delete old.policy;
  assert.equal(activePolicy(deserialize(JSON.stringify(old)), T0), 'balanced');
});

test('Priorités : chacune a un avantage et un coût ; l’automatisation et les missions suivent', () => {
  for (const [id, p] of Object.entries(POLICIES)) {
    if (id === 'balanced') continue;
    assert.ok(p.pros.length && p.cons.length, id);
    const vals = Object.values(p.mods);
    assert.ok(vals.some((v) => v > 0) && vals.some((v) => v < 0), `${id} : bonus et malus`);
  }
  const s = fresh();
  const before = playStyle(s).trade;
  setPolicy(s, 'commerce', T0);
  assert.ok(alignPriorities(s).ok);
  assert.equal(s.priorities.order[0], 'gold');
  assert.ok(playStyle(s).trade > before, 'missions de commerce favorisées');
});

test('Avant-postes : garnison complétée à distance, bilan comparatif', () => {
  const s = fresh();
  for (const r of Object.keys(s.resources)) s.resources[r] = 50000;
  s.world.revealed.fill(1);
  const k = `${s.world.capital.x + 2},${s.world.capital.y + 1}`;
  assert.ok(claimTerritory(s, s.world.capital.x + 2, s.world.capital.y + 1, T0).ok);
  const spec = { plain: 'farms', forest: 'logging', hills: 'quarry', mountain: 'mines', river: 'port', swamp: 'herbalists', ruins: 'digs', snow: 'coal', ash: 'crystals' }[s.territories[k].terrain];
  setSpec(s, k, spec);
  const r0 = outpostReport(s, k, T0);
  assert.ok(r0.st.eff < 1, 'sans garnison : production réduite');
  s.army = { spearman: 3, archer: 20, scout: 2, ram: 5 };
  const r = fillGarrison(s, k);
  assert.ok(r.ok && r.moved === garrisonNeed(s.territories[k]));
  assert.equal(s.territories[k].garrison.spearman, 3, 'lanciers d’abord');
  assert.ok(!s.territories[k].garrison.scout && !s.territories[k].garrison.ram, 'ni éclaireurs ni engins de siège');
  assert.equal(fillGarrison(s, k).ok, false, 'déjà complète');
  const r1 = outpostReport(s, k, T0);
  assert.equal(r1.st.eff, 1);
  const sum = (o) => Object.values(o).reduce((a, b) => a + b, 0);
  assert.ok(sum(r1.prod) + sum(r1.mods) > sum(r0.prod) + sum(r0.mods), 'bilan effectif mis à jour');
});
