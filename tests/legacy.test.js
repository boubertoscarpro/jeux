// Héritage dynastique : traditions, archives, vestiges dans le nouveau monde, défis ancestraux.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createNewState } from '../src/core/state.js';
import { serialize, deserialize } from '../src/core/save.js';
import { foundDynasty } from '../src/systems/talents.js';
import { legacyTick, chooseTradition, useRemnant, remnantCheck, legacyState } from '../src/systems/legacy.js';
import { computeMods } from '../src/systems/modifiers.js';
import { TRADITIONS } from '../src/data/legacy.js';
import { key } from '../src/systems/world.js';

const T0 = Date.UTC(2026, 6, 1);
const th = (s) => Object.values(s.city.buildings).find((b) => b.type === 'townhall');
const rich = (s) => { for (const r of Object.keys(s.resources)) s.resources[r] = 50000; };

test('Héritage : traditions après les étapes, archives, vestiges et défis dans la dynastie suivante', () => {
  const s = createNewState({ seed: 'legacy', now: T0 });
  rich(s);
  legacyTick(s, T0);
  assert.equal(legacyState(s).offer, null, 'aucune étape franchie');
  th(s).level = 8;
  legacyTick(s, T0);
  const offer = s.legacy.offer;
  assert.equal(offer.milestone, 'th8');
  assert.equal(offer.choices.length, 3);
  const pick = offer.choices[0];
  const before = computeMods(s, T0);
  assert.ok(chooseTradition(s, pick, T0).ok);
  const after = computeMods(s, T0);
  for (const [k, v] of Object.entries(TRADITIONS[pick].mods)) assert.ok(Math.abs((after[k] || 0) - (before[k] || 0) - v) < 1e-9, `tradition appliquée (${k})`);
  legacyTick(s, T0);
  assert.equal(s.legacy.offer, null, 'chaque étape ne donne qu’un choix');
  // Fin de dynastie : avant-postes, projet achevé, alliés et ennemis
  th(s).level = 15;
  const c = s.world.capital;
  s.territories[key(c.x + 5, c.y + 2)] = { id: 'op1', name: 'Fort-Aubépine', x: c.x + 5, y: c.y + 2, terrain: 'plain', level: 3, garrison: {}, spec: 'farms' };
  s.projects.done.tradeRoad = T0;
  s.factions[0].stance = 'alliance';
  s.factions[1].stance = 'war';
  const r = foundDynasty(s, T0 + 1000);
  assert.ok(r.ok, r.reason);
  const ns = r.state, l = ns.legacy;
  assert.deepEqual(l.traditions, [pick], 'traditions conservées');
  assert.equal(l.archives.length, 1);
  assert.equal(l.archives[0].outposts[0].name, 'Fort-Aubépine');
  assert.deepEqual(l.archives[0].projects, ['tradeRoad']);
  const fort = l.remnants.find((x) => x.kind === 'fort');
  assert.ok(fort && fort.oldName === 'Fort-Aubépine' && fort.level === 3);
  assert.ok(Math.hypot(fort.x - ns.world.capital.x - 5, fort.y - ns.world.capital.y - 2) <= 5, 'même position relative à la capitale');
  assert.ok(l.remnants.some((x) => x.kind === 'monument'));
  assert.ok(ns.factions.some((f) => f.ancestral === 'ally') && ns.factions.some((f) => f.ancestral === 'grudge'));
  assert.ok(l.challenges.some((x) => x.id === 'grudge') && l.challenges.some((x) => x.id === 'surpass' && x.th === 15));
  // Vestige : il faut l'avoir découvert
  const i = l.remnants.indexOf(fort);
  rich(ns);
  ns.world.revealed[fort.y * ns.world.size + fort.x] = 0;
  assert.match(remnantCheck(ns, i, 'restore', T0).reason, /explorez/);
  ns.world.revealed[fort.y * ns.world.size + fort.x] = 1;
  th(ns).level = 6;
  const u = useRemnant(ns, i, 'restore', T0);
  assert.ok(u.ok, u.reason);
  const t = ns.territories[key(fort.x, fort.y)];
  assert.equal(t.name, 'Fort-Aubépine');
  assert.equal(t.level, 3, 'la forteresse redevient un avant-poste à son ancien niveau');
  // Monument
  const mi = l.remnants.findIndex((x) => x.kind === 'monument');
  const m = l.remnants[mi];
  ns.world.revealed[m.y * ns.world.size + m.x] = 1;
  const p0 = computeMods(ns, T0)['prod.all'] || 0;
  assert.ok(useRemnant(ns, mi, 'restore', T0).ok);
  assert.ok(Math.abs((computeMods(ns, T0)['prod.all'] || 0) - p0 - 0.02) < 1e-9);
  // Défi « surpasser les ancêtres »
  const pts = ns.dynasty.points;
  th(ns).level = 15;
  legacyTick(ns, T0);
  assert.equal(ns.dynasty.points, pts + 2);
  const back = deserialize(serialize(ns));
  assert.equal(back.legacy.archives.length, 1);
  assert.equal(back.legacy.remnants.length, l.remnants.length);
});
