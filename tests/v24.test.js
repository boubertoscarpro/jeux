// v24 « Le monde et ses cibles » : domaine du château carré et plus grand (migration sans rien déplacer), lieux
// d'événement synchronisés avec l'événement réel (pose, états, retrait, aucun doublon), attaque validée par le moteur,
// et un dessin propre à chaque catégorie de lieu de la carte du monde.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createNewState, generateCity, CITY_W, CITY_H } from '../src/core/state.js';
import { serialize, deserialize } from '../src/core/save.js';
import { rng, mulberry32 } from '../src/core/rng.js';
import { expandDomain, DOMAIN_STEPS } from '../src/systems/domain.js';
import { POI_TYPES } from '../src/data/world.js';
import { TARGETS, FORT_STYLES } from '../src/ui/paint/art.js';
import { isoFrame, toScreen, ISO } from '../src/systems/iso.js';

const T0 = Date.UTC(2026, 9, 24, 9), H = 3600000;

test('Domaine (v24) : carré de 32 dès le départ, hameau au centre, jusqu’à 48 × 48 par paliers de 4 × 4', () => {
  const s = createNewState({ seed: 'carre', now: T0 });
  assert.equal(s.city.w, 32); assert.equal(s.city.h, 32); assert.equal(CITY_W, CITY_H);
  const th = Object.values(s.city.buildings).find((b) => b.type === 'townhall');
  assert.ok(Math.abs(th.x - 16) <= 1 && Math.abs(th.y - 16) <= 1, `hôtel de ville (${th.x}, ${th.y})`);
  rng.setSource(mulberry32(5));
  for (const r of Object.keys(s.resources)) s.resources[r] = 1e7;
  th.level = 20;
  for (let i = 0; i < DOMAIN_STEPS.length; i++) { assert.ok(expandDomain(s, T0).ok); assert.equal(s.city.w, s.city.h, 'toujours carré'); }
  rng.setSource(null);
  assert.equal(s.city.w, 48);
});

test('Migration 9 → 10 : un ancien domaine rectangulaire devient carré, sans rien déplacer ni offrir de décombres', () => {
  const s = createNewState({ seed: 'vieux', now: T0 });
  const n = s.meta.seed;
  // une partie v9 : domaine 32 × 20 (24 × 16 + 2 agrandissements), quatre bâtiments
  const t = generateCity(n, 32, 20);
  s.city = { w: 32, h: 20, terrain: t, buildings: {}, fort: { wall: 1, moat: 0 } };
  const put = (type, x, y, level) => { const id = `b_${type}_${x}_${y}`; s.city.buildings[id] = { id, type, level, x, y }; s.city.terrain[y * 32 + x] = 'plain'; };
  put('townhall', 11, 7, 7); put('house', 12, 8, 3); put('farm', 30, 18, 2); put('warehouse', 10, 8, 2);
  s.domain = 2;
  const old = JSON.parse(serialize(s));
  old.version = 9;
  const st = deserialize(JSON.stringify(old));
  assert.equal(st.city.w, 40); assert.equal(st.city.h, 40, '32 + 4 × 2 agrandissements');
  for (const [id, b] of Object.entries(old.city.buildings)) { assert.equal(st.city.buildings[id].x, b.x); assert.equal(st.city.buildings[id].y, b.y); assert.equal(st.city.buildings[id].level, b.level); }
  const added = st.city.terrain.filter((x, i) => x === 'rubble' && ((i % 40) >= 32 || Math.floor(i / 40) >= 20)).length;
  assert.equal(added, 0, 'aucun décombre (butin) ajouté');
  assert.ok(st.version >= 10);
});

test('Cadre isométrique : marges autour du losange (la lisière n’est jamais coupée par le bord du dessin)', () => {
  const f = isoFrame(32, 32);
  const left = toScreen(f, 0, 32).sx, right = toScreen(f, 32, 0).sx;
  assert.ok(left >= ISO.side * ISO.tw - 1 && f.width - right >= ISO.side * ISO.tw - 1);
  assert.ok(f.height - toScreen(f, 32, 32).sy >= ISO.bottom * ISO.th - 1);
});

// v25 : le « lieu d'événement » unique de la v24 est remplacé par les cibles de l'événement sur le monde (tests/v25.test.js)

test('Cibles du monde : chaque catégorie de lieu a son dessin (plus de médaillon générique), royaumes à 5 styles', () => {
  const special = new Set(['capital', 'town', 'village', 'ruinSite', 'lostCity', 'abandonedMine', 'breachFort', 'evt']); // peints ailleurs (evt : EVENT_TARGETS, v25)
  const missing = Object.keys(POI_TYPES).filter((k) => !special.has(k) && !k.startsWith('npc_') && !TARGETS[k]);
  assert.deepEqual(missing, []);
  assert.ok(TARGETS.npc, 'marchands itinérants');
  assert.equal(FORT_STYLES.length, 5);
  assert.equal(new Set(FORT_STYLES.map((f) => f.key)).size, 5);
});
