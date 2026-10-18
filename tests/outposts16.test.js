// v16 « Le Château » : les avant-postes deviennent de petits châteaux (ville, bâtiments, enceinte, vocation).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { createNewState } from '../src/core/state.js';
import { deserialize, serialize } from '../src/core/save.js';
import { rng, mulberry32 } from '../src/core/rng.js';
import { computeMods } from '../src/systems/modifiers.js';
import { claimTerritory, garrisonNeed, outpostUpkeep, outpostReport, territoryTick, specOf } from '../src/systems/territory.js';
import { stabilityFactors } from '../src/systems/stability.js';
import {
  ensureTown, townBuild, townUpgrade, townFort, townExpand, townTick, vocationOf, townFx, townProdMult, townThreatMult,
  townSlots, moveTownBuilding, demolishTownBuilding, hallPos, tileFree, firstFree,
} from '../src/systems/outposts.js';
import { TOWN_SIZES, OUTPOST_LIMITS, VOCATION_BONUS } from '../src/data/outposts.js';

const T0 = Date.UTC(2026, 0, 5, 9);
const H = 3600e3;
const rich = (s, n = 1e6) => { for (const r of Object.keys(s.resources)) s.resources[r] = n; return s; };
function realm(seed = 'op16') {
  const s = rich(createNewState({ seed, now: T0 }));
  s.world.revealed.fill(1);
  for (let d = 2; d < 6; d++) for (const [dx, dy] of [[d, 0], [0, d], [-d, 0], [0, -d], [d, d]]) {
    const r = claimTerritory(s, s.world.capital.x + dx, s.world.capital.y + dy, T0);
    if (r.ok) return { s, k: Object.keys(s.territories).find((k) => s.territories[k].id === r.id) };
  }
  throw new Error('aucun avant-poste');
}
// Place directement un bâtiment fini (pour tester les effets)
const put = (t, type, level, n = 1) => { for (let i = 0; i < n; i++) { const f = firstFree(t); const id = 'x' + Math.random().toString(36).slice(2, 7); t.town.b[id] = { id, type, level, x: f.x, y: f.y }; } };

test('Avant-postes : un nouvel avant-poste a sa ville 6 × 5, hôtel de ville secondaire au centre', () => {
  const { s, k } = realm();
  const t = s.territories[k];
  assert.deepEqual([t.town.w, t.town.h], TOWN_SIZES[0]);
  assert.equal(t.town.terrain.length, 30);
  const hp = hallPos(t.town.w, t.town.h);
  assert.equal(t.town.terrain[hp.y * t.town.w + hp.x], 'plain');
  assert.ok(!tileFree(t, hp.x, hp.y), 'la case de l’hôtel de ville est prise');
  assert.equal(townSlots(t), 3);
  // Déterministe : même avant-poste → même ville
  const copy = { ...t, town: null };
  assert.deepEqual(ensureTown(copy).terrain, t.town.terrain);
});

test('Avant-postes : un chantier à la fois, payé par le royaume, fini à l’heure ; niveau ≤ niveau de l’avant-poste', () => {
  const { s, k } = realm();
  const t = s.territories[k];
  const wood = s.resources.wood;
  const f = firstFree(t);
  assert.ok(townBuild(s, k, 'fields', f.x, f.y, T0).ok);
  assert.ok(s.resources.wood < wood);
  assert.equal(townBuild(s, k, 'granary', firstFree(t).x, firstFree(t).y, T0).ok, false, 'un seul chantier');
  townTick(s, t, T0 + 60e3);
  assert.equal(Object.keys(t.town.b).length, 0, 'pas encore fini');
  townTick(s, t, T0 + H);
  const b = Object.values(t.town.b)[0];
  assert.equal(b.type, 'fields'); assert.equal(b.level, 1); assert.deepEqual([b.x, b.y], [f.x, f.y]);
  assert.equal(townUpgrade(s, k, b.id, T0 + H).ok, false, 'avant-poste niveau 1 : bâtiment niveau 1 au plus');
  t.level = 2;
  assert.ok(townUpgrade(s, k, b.id, T0 + H).ok);
  townTick(s, t, T0 + 3 * H);
  assert.equal(b.level, 2);
  // Emplacements : 2 + niveau (+ agrandissements)
  t.level = 1; t.town.b = {}; put(t, 'fields', 1, 3);
  assert.match(townBuild(s, k, 'depot', firstFree(t).x, firstFree(t).y, T0).reason, /Emplacements pleins/);
});

test('Avant-postes : la vocation naît des constructions (3 niveaux, sans égalité) et renforce sa catégorie de 25 %', () => {
  const { s, k } = realm();
  const t = s.territories[k];
  t.level = 5;
  put(t, 'fields', 2);
  assert.equal(vocationOf(t), null, '2 niveaux : pas encore');
  put(t, 'granary', 1);
  assert.equal(vocationOf(t), 'agricole');
  put(t, 'workshop', 3);
  assert.equal(vocationOf(t), null, 'égalité : aucune vocation');
  put(t, 'depot', 1);
  assert.equal(vocationOf(t), 'industriel');
  const fx = townFx(t);
  assert.ok(Math.abs(fx.prodRes.wood - 0.08 * 3 * (1 + VOCATION_BONUS)) < 1e-9);
  assert.ok(Math.abs(fx.prodRes.food - 0.08 * 2) < 1e-9, 'les champs ne sont plus de la vocation');
});

test('Avant-postes : effets bornés — production +50 % au plus, grenier −40 % au plus, tours +4 % au plus', () => {
  const { s, k } = realm();
  const t = s.territories[k];
  t.level = 5; t.town.exp = 3; t.town.w = 9; t.town.h = 8; t.town.terrain = Array(72).fill('plain');
  put(t, 'workshop', 5, 3); put(t, 'depot', 5, 2);
  assert.equal(townProdMult(t, 'wood'), 1 + OUTPOST_LIMITS.prod);
  t.town.b = {}; put(t, 'granary', 5, 3);
  const base = 10 * 5;
  assert.ok(Math.abs(outpostUpkeep(t).food - base * 0.6) < 1e-9, 'grenier plafonné à −40 %');
  // Tours de guet sur plusieurs avant-postes : défense de la ville plafonnée
  const before = computeMods(s, T0)['city.def'] || 0;
  t.town.b = {}; put(t, 'tower', 5, 8);
  t.garrison = { spearman: 999 }; t.spec = (specOf(t) || {}).id || t.spec;
  const after = computeMods(s, T0 + 1)['city.def'] || 0;
  assert.ok(after - before <= OUTPOST_LIMITS.cityDef + 1e-9, `${after - before}`);
});

test('Avant-postes : camp d’entraînement (garnison), enceinte et voisin militaire (menaces), chapelle (stabilité)', () => {
  const { s, k } = realm();
  const t = s.territories[k];
  t.level = 3;
  assert.equal(garrisonNeed(t), 24);
  put(t, 'camp', 3);
  assert.equal(garrisonNeed(t), Math.ceil(24 / (1 + 0.3 * (1 + VOCATION_BONUS))), 'vocation militaire : +25 %');
  assert.equal(townThreatMult(s, t), 1);
  t.town.fort = { wall: 6, moat: 3 };
  assert.ok(Math.abs(townThreatMult(s, t) - (1 - 0.3 - 0.12)) < 1e-9);
  t.town.fort = { wall: 10, moat: 5 };
  assert.equal(townThreatMult(s, t), 0.4, 'jamais moins de ×0,4');
  // Un voisin militaire (≤ 4 cases) couvre l'avant-poste
  const o = { id: 'nb', x: t.x + 2, y: t.y + 1, level: 5, terrain: 'plain', garrison: {} };
  ensureTown(o); put(o, 'camp', 3);
  s.territories['nb'] = o;
  t.town.fort = { wall: 0, moat: 0 };
  assert.ok(Math.abs(townThreatMult(s, t) - 0.8) < 1e-9);
  // Chapelle : stabilité cible
  put(t, 'chapel', 2);
  assert.ok(stabilityFactors(s, t, T0).some(([l, v]) => /Chapelle/.test(l) && v === 6));
});

test('Avant-postes : muraille et douves limitées par le niveau ; agrandissement aux niveaux 2, 3, 4 sans rien déplacer', () => {
  const { s, k } = realm();
  const t = s.territories[k];
  assert.ok(townFort(s, k, 'wall', T0).ok);
  townTick(s, t, T0 + 5 * H);
  assert.ok(townFort(s, k, 'wall', T0 + 5 * H).ok);
  townTick(s, t, T0 + 10 * H);
  assert.equal(t.town.fort.wall, 2);
  assert.equal(townFort(s, k, 'wall', T0 + 10 * H).ok, false, 'muraille ≤ 2 × niveau');
  assert.equal(townExpand(s, k, T0).ok, false, 'niveau 2 requis');
  t.level = 2;
  put(t, 'fields', 1, 3);
  const before = Object.values(t.town.b).map((b) => [b.id, b.x, b.y]);
  // Un bâtiment sur la future case de l'hôtel de ville est déplacé vers l'ancienne, rien d'autre ne bouge
  assert.ok(townExpand(s, k, T0 + 10 * H).ok);
  townTick(s, t, T0 + 20 * H);
  assert.deepEqual([t.town.w, t.town.h], TOWN_SIZES[1]);
  assert.equal(townSlots(t), 2 + 2 + 1);
  const hp = hallPos(t.town.w, t.town.h);
  for (const [id, x, y] of before) { const b = t.town.b[id]; assert.ok(b, 'rien n’est perdu'); if (!(x === hp.x && y === hp.y)) assert.deepEqual([b.x, b.y], [x, y]); }
  assert.ok(!Object.values(t.town.b).some((b) => b.x === hp.x && b.y === hp.y));
});

test('Avant-postes : déplacer et démolir ; production et comptoir dans le bilan et le tick', () => {
  rng.setSource(mulberry32(5));
  try {
    const { s, k } = realm();
    const t = s.territories[k];
    put(t, 'counter', 1);
    const b = Object.values(t.town.b)[0];
    const f = { x: 0, y: 0 }; t.town.terrain[0] = 'plain';
    assert.ok(moveTownBuilding(s, k, b.id, f.x, f.y).ok);
    assert.deepEqual([b.x, b.y], [0, 0]);
    t.garrison = { spearman: 50 };
    const rep = outpostReport(s, k, T0);
    assert.ok(rep.prod.gold >= 6 * rep.st.eff - 1e-9, 'or du comptoir');
    const g0 = s.resources.gold;
    s.resources.gold = 1000;
    territoryTick(s, 3600, T0);
    assert.ok(Number.isFinite(s.resources.gold));
    void g0;
    assert.ok(demolishTownBuilding(s, k, b.id).ok);
    assert.equal(Object.keys(t.town.b).length, 0);
  } finally { rng.setSource(Math.random); }
});

test('Migration : les avant-postes d’une vraie sauvegarde v15 reçoivent leur ville vide, rien ne change par ailleurs', () => {
  const raw = gunzipSync(readFileSync(new URL('./fixtures/save-v15.json.gz', import.meta.url))).toString();
  const old = JSON.parse(raw);
  const s = deserialize(raw);
  assert.deepEqual(Object.keys(s.territories), Object.keys(old.territories));
  for (const [k, t] of Object.entries(old.territories)) {
    const n = s.territories[k];
    for (const f of ['level', 'spec', 'garrison', 'x', 'y', 'name']) assert.deepEqual(n[f], t[f], `${k}.${f}`);
    assert.ok(n.town && n.town.w === 6 && Object.keys(n.town.b).length === 0, 'ville vide');
  }
  const again = deserialize(serialize(s));
  for (const [k, t] of Object.entries(s.territories)) assert.deepEqual(again.territories[k].town, t.town);
});
