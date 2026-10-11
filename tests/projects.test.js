// Grands projets royaux : lancement, contributions partielles, conditions, travaux, bonus permanents, sauvegarde.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createNewState } from '../src/core/state.js';
import { serialize, deserialize } from '../src/core/save.js';
import { advance } from '../src/core/engine.js';
import { computeMods } from '../src/systems/modifiers.js';
import { PROJECTS } from '../src/data/projects.js';
import { projectState, projectInfo, startProject, contribute, startStageWorks, abandonProject, projectTick } from '../src/systems/projects.js';
import { analyze } from '../src/systems/advisor.js';

const T0 = Date.UTC(2026, 6, 1);
const H = 3600000;
const th = (s) => Object.values(s.city.buildings).find((b) => b.type === 'townhall');
const setup = (lvl = 5) => { const s = createNewState({ seed: 'proj', now: T0 }); th(s).level = lvl; for (const r of Object.keys(s.resources)) s.resources[r] = 0; return s; };
const give = (s, cost) => { for (const [r, v] of Object.entries(cost)) s.resources[r] = (s.resources[r] || 0) + v; };

test('Projets : verrouillés selon l’hôtel de ville, un seul à la fois', () => {
  const s = setup(3);
  assert.equal(startProject(s, 'tradeRoad', T0).ok, false);
  th(s).level = 4;
  assert.equal(startProject(s, 'bridge', T0).ok, false, 'pont : hôtel de ville 5');
  assert.ok(startProject(s, 'tradeRoad', T0).ok);
  th(s).level = 5;
  assert.match(startProject(s, 'bridge', T0).reason, /Un seul grand projet/);
});

test('Projets : apports partiels conservés, conditions vérifiées, travaux puis étape suivante', () => {
  const s = setup(5);
  startProject(s, 'tradeRoad', T0);
  const st = PROJECTS.tradeRoad.stages[0];
  s.resources.stone = 1000;
  assert.ok(contribute(s).ok);
  assert.equal(s.resources.stone, 0);
  assert.equal(projectInfo(s, 'tradeRoad').paid.stone, 1000);
  assert.equal(startStageWorks(s, T0).ok, false, 'pas encore financée');
  give(s, st.cost);
  s.resources.stone += 5000;
  const r = contribute(s, null, 1, T0);
  assert.ok(r.ok);
  assert.equal(s.resources.stone, st.cost.stone + 5000 - (st.cost.stone - 1000), 'on n’apporte jamais plus que le besoin');
  assert.ok(projectInfo(s, 'tradeRoad').funded);
  assert.match(startStageWorks(s, T0).reason, /Marché niveau 2/, 'condition manquante expliquée');
  s.city.buildings.mk = { id: 'mk', type: 'market', level: 2, x: 1, y: 1 };
  assert.ok(startStageWorks(s, T0).ok);
  assert.equal(contribute(s).ok, false, 'pas d’apport pendant les travaux');
  projectTick(s, T0 + st.hours * H - 1);
  assert.equal(projectState(s).active.stage, 0);
  projectTick(s, T0 + st.hours * H + 1);
  assert.equal(projectState(s).active.stage, 1);
  assert.equal(s.stats.projectStages, 1);
});

test('Projets : achèvement → bonus permanents, reliques, persistance ; abandon rend la moitié', () => {
  const s = setup(6);
  for (const r of Object.keys(s.resources)) s.resources[r] = 0;
  s.city.buildings.lb = { id: 'lb', type: 'library', level: 5, x: 1, y: 1 };
  for (let i = 0; i < 10; i++) s.techs['t' + i] = 1;
  s.territories['1,1'] = { id: 'op_x', name: 'Test', x: 1, y: 1, terrain: 'ruins', spec: 'digs', level: 1, garrison: {} };
  const base = computeMods(s, T0)['research.speed'] || 0;
  const relics = s.shards.relicFragments;
  assert.ok(startProject(s, 'library', T0).ok);
  let t = T0;
  for (const st of PROJECTS.library.stages) {
    give(s, st.cost); assert.ok(contribute(s, null, 1, t).ok);
    const r = startStageWorks(s, t); assert.ok(r.ok, r.reason);
    t += st.hours * H + 1; projectTick(s, t);
  }
  assert.ok(projectState(s).done.library);
  assert.equal(projectState(s).active, null);
  assert.ok(Math.abs((computeMods(s, t)['research.speed'] || 0) - base - 0.1) < 1e-9, 'bonus permanent');
  assert.equal(s.shards.relicFragments, relics + 2);
  const back = deserialize(serialize(s));
  assert.ok(back.projects.done.library);
  assert.equal(startProject(back, 'library', t).ok, false, 'pas deux fois');
  // Abandon
  startProject(s, 'tradeRoad', t);
  s.resources.gold = 600; contribute(s, 'gold', 1, t);
  assert.ok(abandonProject(s, t).ok);
  assert.equal(s.resources.gold, 300);
  assert.equal(projectState(s).active, null);
});

test('Projets : le moteur termine les travaux hors ligne ; le conseiller signale une étape prête', () => {
  const s = setup(5);
  s.city.buildings.mk = { id: 'mk', type: 'market', level: 2, x: 1, y: 1 };
  startProject(s, 'tradeRoad', T0);
  give(s, PROJECTS.tradeRoad.stages[0].cost); contribute(s, null, 1, T0);
  assert.ok(analyze(s, T0).recs.some((r) => r.id === 'proj-ready'));
  startStageWorks(s, T0);
  advance(s, T0 + 2 * H);
  assert.equal(projectState(s).active.stage, 1);
  // Toutes les définitions sont cohérentes
  for (const [id, p] of Object.entries(PROJECTS)) {
    assert.equal(p.stages.length, 3, id);
    for (const st of p.stages) { assert.ok(st.hours > 0 && Object.keys(st.cost).length, id); for (const r of Object.keys(st.cost)) assert.ok(s.resources[r] !== undefined, `${id} : ressource ${r}`); }
    assert.ok(Object.values(p.reward.mods).every((v) => Math.abs(v) <= 0.25), `${id} : bonus modestes`);
  }
});
