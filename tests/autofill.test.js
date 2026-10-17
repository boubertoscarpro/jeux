// Fenêtre d'attaque : « moitié de chaque unité » et « remplissage auto » (minimum pour gagner + marge de sécurité).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createNewState } from '../src/core/state.js';
import { POI_TYPES } from '../src/data/world.js';
import { autoFillAttack, halfOfEach, fightingUnits, AUTOFILL } from '../src/systems/autofill.js';
import { previewBattle } from '../src/systems/combat.js';
import { sendMarch } from '../src/systems/marches.js';

const T0 = Date.UTC(2026, 6, 1, 8);
function realm(seed) {
  const s = createNewState({ seed, now: T0 });
  Object.values(s.city.buildings).find((b) => b.type === 'townhall').level = 8;
  s.meta.lastTick = T0;
  s.army = { spearman: 400, swordsman: 300, archer: 300, scout: 6, spy: 2 };
  return s;
}
const camp = (s) => Object.values(s.world.pois).filter((p) => POI_TYPES[p.type]?.kind === 'danger' && !POI_TYPES[p.type].dungeon && p.danger >= 1 && p.danger <= 2)
  .sort((a, b) => Math.hypot(a.x - s.world.capital.x, a.y - s.world.capital.y) - Math.hypot(b.x - s.world.capital.x, b.y - s.world.capital.y))[0];
const count = (u) => Object.values(u).reduce((a, b) => a + b, 0);

test('Moitié de chaque unité : la moitié arrondie vers le bas, sans éclaireurs ni espions', () => {
  const s = realm('h1');
  s.army.archer = 301;
  assert.deepEqual(halfOfEach(s), { spearman: 200, swordsman: 150, archer: 150 });
  assert.ok(!('scout' in fightingUnits(s)) && !('spy' in fightingUnits(s)));
});

test('Remplissage auto : le minimum qui gagne, bien moins que toute l’armée, et la composition gagne vraiment', () => {
  const s = realm('a1');
  const poi = camp(s);
  poi.scouted = true;
  const r = autoFillAttack(s, { type: 'attack', x: poi.x, y: poi.y, units: {}, formation: 'balanced' }, T0);
  assert.ok(r.ok, r.reason);
  assert.ok(count(r.units) < count(fightingUnits(s)) * 0.5, `${count(r.units)} unités envoyées`);
  assert.ok(r.fraction <= Math.min(1, r.minimum * AUTOFILL.marginScouted) + 1e-9);
  assert.equal(r.estimated, false);
  // Proportions conservées (même mélange que l'armée disponible)
  const k = r.units.spearman / 400;
  assert.ok(Math.abs(r.units.archer / 300 - k) < 0.02);
  // L'aperçu de combat confirme la victoire avec des pertes raisonnables
  const pv = previewBattle({ units: r.units, mods: {}, formation: 'balanced' }, { units: poi.enemies, mods: { 'combat.atk': 0.05 * poi.danger, 'combat.def': 0.05 * poi.danger } }, { terrain: 'plain' });
  assert.equal(pv.winner, 'attacker');
  // La marche part avec cette composition
  assert.ok(sendMarch(s, { type: 'attack', x: poi.x, y: poi.y, units: r.units }, T0).ok);
});

test('Remplissage auto : marge prudente si le lieu n’est pas espionné ; refus clair si l’armée ne suffit pas', () => {
  const s = realm('a2');
  const poi = camp(s);
  poi.scouted = false;
  const blind = autoFillAttack(s, { type: 'attack', x: poi.x, y: poi.y, units: {} }, T0);
  poi.scouted = true;
  const seen = autoFillAttack(s, { type: 'attack', x: poi.x, y: poi.y, units: {} }, T0);
  assert.ok(blind.ok && seen.ok);
  assert.ok(blind.estimated && count(blind.units) >= count(seen.units));
  s.army = { spearman: 1 };
  const weak = autoFillAttack(s, { type: 'attack', x: poi.x, y: poi.y, units: {} }, T0);
  assert.equal(weak.ok, false);
  assert.match(weak.reason, /armée/);
  // Lieu sans ennemis (site de récolte paisible) : refus explicite
  const node = Object.values(s.world.pois).find((p) => POI_TYPES[p.type]?.kind === 'gather');
  assert.equal(autoFillAttack(s, { type: 'attack', x: node.x, y: node.y, units: {} }, T0).ok, false);
});
