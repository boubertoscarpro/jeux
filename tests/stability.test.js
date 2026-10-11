// Stabilité des provinces : facteurs, dérive, effets sur la production, impôts, festivités, agitation et révolte.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createNewState } from '../src/core/state.js';
import { serialize, deserialize } from '../src/core/save.js';
import { rng, mulberry32 } from '../src/core/rng.js';
import { claimTerritory, setSpec, outpostStatus, territoryTick, garrisonNeed } from '../src/systems/territory.js';
import { stabilityTarget, stabOf, setTax, celebrate, TAXES, STAB_DEFAULT } from '../src/systems/stability.js';
import { decisionsTick, resolveDecision } from '../src/systems/decisions.js';
import { DILEMMAS } from '../src/data/dilemmas.js';
import { analyze } from '../src/systems/advisor.js';

const T0 = Date.UTC(2026, 6, 1);
const H = 3600000;
function setup() {
  const s = createNewState({ seed: 'stab', now: T0 });
  Object.values(s.city.buildings).find((b) => b.type === 'townhall').level = 5;
  for (const r of Object.keys(s.resources)) s.resources[r] = 20000;
  s.world.revealed.fill(1);
  const x = s.world.capital.x + 3, y = s.world.capital.y;
  assert.ok(claimTerritory(s, x, y, T0).ok);
  const k = `${x},${y}`, t = s.territories[k];
  setSpec(s, k, { plain: 'farms', forest: 'logging', hills: 'quarry', mountain: 'mines', river: 'port', swamp: 'herbalists', ruins: 'digs', snow: 'coal', ash: 'crystals' }[t.terrain]);
  return { s, k, t };
}

test('Stabilité : cible selon des facteurs visibles, dérive progressive, valeur par défaut des anciennes provinces', () => {
  const { s, t } = setup();
  assert.equal(stabOf(t), STAB_DEFAULT, 'province sans valeur (ancienne sauvegarde) : 70');
  const without = stabilityTarget(s, t, T0);
  t.garrison = { spearman: garrisonNeed(t) };
  const withG = stabilityTarget(s, t, T0);
  assert.equal(withG - without, 25, 'garnison complète +10 au lieu de −15');
  t.stability = 20;
  territoryTick(s, 3600, T0 + 1000);
  assert.ok(Math.abs(stabOf(t) - 25) < 0.01, '+5 par heure vers la cible');
  const back = deserialize(serialize(s));
  assert.ok(Math.abs(stabOf(Object.values(back.territories)[0]) - stabOf(t)) < 1e-9, 'sauvegardée');
});

test('Stabilité : impôts (or contre satisfaction), festivités, effets sur la production', (tc) => {
  rng.setSource(() => 0.99); // aucune attaque aléatoire de l'avant-poste pendant le test
  tc.after(() => rng.setSource(null));
  const { s, k, t } = setup();
  t.garrison = { spearman: garrisonNeed(t) };
  const base = stabilityTarget(s, t, T0);
  assert.ok(setTax(s, k, 'high').ok);
  assert.equal(stabilityTarget(s, t, T0), base + TAXES.high.stab);
  const g0 = s.resources.gold;
  s.resources.food = 1e6;
  territoryTick(s, 3600, T0 + 1000);
  assert.ok(s.resources.gold > g0 - 12 * (t.level || 1) - 1, 'les impôts lourds compensent l’entretien en or');
  assert.ok(celebrate(s, k, T0).ok);
  assert.equal(celebrate(s, k, T0).ok, false, 'pas deux fois à la fois');
  assert.equal(stabilityTarget(s, t, T0 + 1000), base + TAXES.high.stab + 15);
  t.stability = 90; assert.ok(outpostStatus(s, t, T0).eff > 1, 'prospère : +10 %');
  t.stability = 40; assert.ok(Math.abs(outpostStatus(s, t, T0).eff - 0.8) < 1e-9, 'mécontente : −20 %');
  t.stability = 10; assert.ok(Math.abs(outpostStatus(s, t, T0).eff - 0.5) < 1e-9, 'en révolte : −50 %');
  t.revolt = true; assert.equal(outpostStatus(s, t, T0).eff, 0, 'révolte ouverte : arrêt');
});

test('Agitation : annoncée par le conseiller, audience avec choix, révolte puis retour au calme', () => {
  rng.setSource(mulberry32(5));
  try {
    const { s, k, t } = setup();
    t.stability = 25; s.famine = true; setTax(s, k, 'high');
    assert.ok(analyze(s, T0).recs.some((r) => r.id === 'stab:' + t.id && r.sev === 'bad'), 'avertissement avant la révolte');
    let p = null;
    for (let i = 0; i < 300 && !p; i++) { s.nextDilemma = 0; s.pending = []; s.lastDilemma = null; delete t.unrestAt; decisionsTick(s, T0 + i); if (s.pending[0]?.event === 'outpostUnrest') p = s.pending[0]; }
    assert.ok(p, 'audience proposée');
    assert.match(p.text, /famine|impôts/i, 'la cause est expliquée');
    const ignore = DILEMMAS.outpostUnrest.choices.findIndex((c) => c.fx.unrestIgnore);
    assert.ok(resolveDecision(s, p.id, ignore, T0 + 1000).ok);
    assert.ok(t.revolt);
    s.famine = false; setTax(s, k, 'low'); t.garrison = { spearman: garrisonNeed(t) };
    for (let h = 0; h < 6; h++) territoryTick(s, 3600, T0 + (h + 1) * H);
    assert.ok(!t.revolt && stabOf(t) >= 45, 'le calme revient quand les causes disparaissent');
    // Concessions
    t.stability = 25; delete t.unrestAt; setTax(s, k, 'normal');
    const c = { ...p, id: 'x', ctx: { ...p.ctx } };
    s.pending.push(c);
    const g = s.resources.gold;
    assert.ok(resolveDecision(s, 'x', 0, T0 + 9 * H).ok);
    assert.equal(t.tax, 'low'); assert.ok(stabOf(t) >= 50 && s.resources.gold < g);
  } finally { rng.setSource(null); }
});
