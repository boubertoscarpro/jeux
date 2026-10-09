// Cartes agrandies : royaume 24×16, monde 96×96, génération, déplacements, migration des anciennes parties,
// caméra (zoom, bornes) et encart de soutien.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createNewState, generateCity, CITY_W, CITY_H, RUBBLE_COUNT } from '../src/core/state.js';
import { advance } from '../src/core/engine.js';
import { serialize, deserialize } from '../src/core/save.js';
import { rng, mulberry32 } from '../src/core/rng.js';
import { generateWorld } from '../src/systems/worldgen.js';
import { WORLD_SIZE, POI_TYPES, TOWN_NAMES, RIVALS, DANGER_RADIUS } from '../src/data/world.js';
import { terrainAt, placementCheck, adjacencyBonus, buildingAt } from '../src/systems/city.js';
import { startBuild, moveBuilding } from '../src/systems/construction.js';
import { expandDomain, DOMAIN_STEPS } from '../src/systems/domain.js';
import { sendMarch } from '../src/systems/marches.js';
import { claimTerritory } from '../src/systems/territory.js';
import { spawnBoss } from '../src/systems/events.js';
import { distCap, isRevealed, wTerrain, aroundCapital, worldScale, travelTime, key } from '../src/systems/world.js';
import { computeMods } from '../src/systems/modifiers.js';
import { clampCam, zoomAt, fitZoom } from '../src/ui/panzoom.js';
import { clampWorldCam, zoomWorldAt, notablePlaces } from '../src/ui/views/world.js';
import { supportHtml, SUPPORT_URL } from '../src/ui/creation.js';

const T0 = Date.UTC(2026, 6, 1);
const H = 3600000;
const count = (s, t) => s.city.terrain.filter((x) => x === t).length;
const free = (s, type, pred = () => true) => { for (let y = 0; y < s.city.h; y++) for (let x = 0; x < s.city.w; x++) if (pred(x, y) && placementCheck(s, type, x, y).ok) return { x, y }; return null; };

test('Royaume : 24×16 dès le départ, plus de cases constructibles, même nombre de décombres, hameau centré', () => {
  for (const seed of [1, 7, 'abc', 4242]) {
    const s = createNewState({ seed, now: T0 });
    assert.equal(s.city.w, CITY_W); assert.equal(s.city.h, CITY_H);
    assert.equal(CITY_W * CITY_H, 384);
    assert.equal(s.city.terrain.length, 384);
    assert.equal(count(s, 'rubble'), RUBBLE_COUNT, 'pas plus de butin de déblaiement qu’avant');
    assert.ok(count(s, 'plain') >= 200, `cases libres : ${count(s, 'plain')}`);
    for (const t of ['river', 'forest', 'mountain']) assert.ok(count(s, t) > 5, t);
    const th = Object.values(s.city.buildings).find((b) => b.type === 'townhall');
    assert.ok(th.x >= 8 && th.x <= 15 && th.y >= 5 && th.y <= 10, 'hôtel de ville vers le centre');
    // Les bonus d'adjacence restent accessibles : scierie/forêt, carrière/montagne, ferme/rivière
    const mods = computeMods(s, T0);
    for (const type of ['sawmill', 'quarry', 'farm']) {
      const ok = free(s, type, (x, y) => adjacencyBonus(s, type, x, y, mods).total > 0);
      assert.ok(ok, `${type} : un emplacement avec bonus existe`);
    }
  }
  // Les ressources et bâtiments de départ ne changent pas avec la taille
  const s = createNewState({ seed: 1, now: T0 });
  assert.equal(Object.keys(s.city.buildings).length, 3);
  assert.equal(s.resources.wood, 600);
});

test('Royaume : construire, sélectionner et déplacer partout, y compris aux bords de la grande carte', () => {
  const s = createNewState({ seed: 'build', now: T0 });
  for (const r of Object.keys(s.resources)) s.resources[r] = 5000;
  const far = free(s, 'house', (x, y) => x >= 18 && y >= 10);
  assert.ok(far, 'case libre à l’est/sud');
  assert.ok(startBuild(s, 'house', far.x, far.y, T0).ok);
  advance(s, T0 + H);
  const b = buildingAt(s, far.x, far.y);
  assert.ok(b && b.level === 1);
  const dest = free(s, 'house', (x, y) => x <= 8 && y <= 3);
  assert.ok(moveBuilding(s, b.id, dest.x, dest.y).ok);
  assert.equal(buildingAt(s, dest.x, dest.y)?.id, b.id);
  assert.equal(placementCheck(s, 'house', s.city.w, 0).ok, false, 'hors carte refusé');
});

test('Agrandissement du domaine : +4 colonnes, +2 rangées, rien ne bouge, jusqu’à 40×24', () => {
  rng.setSource(mulberry32(3));
  const s = createNewState({ seed: 'dom', now: T0 });
  for (const r of Object.keys(s.resources)) s.resources[r] = 1e6;
  Object.values(s.city.buildings).find((b) => b.type === 'townhall').level = 15;
  const before = s.city.terrain.slice(), w0 = s.city.w;
  const blds = JSON.stringify(s.city.buildings);
  for (let i = 0; i < DOMAIN_STEPS.length; i++) assert.ok(expandDomain(s, T0).ok);
  rng.setSource(null);
  assert.equal(s.city.w, 40); assert.equal(s.city.h, 24);
  for (let y = 0; y < 16; y++) for (let x = 0; x < w0; x++) assert.equal(s.city.terrain[y * s.city.w + x], before[y * w0 + x]);
  assert.equal(JSON.stringify(s.city.buildings), blds);
  assert.ok(count(s, 'rubble') < RUBBLE_COUNT + 30, 'peu de décombres ajoutés');
});

test('Monde : 96×96, sites 4× plus nombreux à densité égale, ressources de base proches, danger croissant', () => {
  for (const seed of [1, 2, 3, 99, 12345]) {
    const t = Date.now();
    const w = generateWorld(seed);
    assert.ok(Date.now() - t < 500, 'génération rapide');
    assert.equal(w.size, WORLD_SIZE); assert.equal(WORLD_SIZE, 96);
    assert.equal(w.terrain.length, 96 * 96);
    const pois = Object.values(w.pois);
    assert.ok(pois.length >= 600, `sites : ${pois.length}`);
    const by = (type) => pois.filter((p) => p.type === type);
    const c = w.capital;
    const d = (p) => Math.hypot(p.x - c.x, p.y - c.y);
    // Ressources essentielles à courte distance
    for (const type of ['woodNode', 'stoneNode', 'foodNode', 'ironNode']) assert.ok(by(type).filter((p) => d(p) <= 12).length >= 2, `${seed} ${type} proche`);
    // Cités, royaumes, donjons
    assert.equal(by('town').length, TOWN_NAMES.length);
    assert.equal(new Set(by('town').map((p) => p.name)).size, TOWN_NAMES.length);
    assert.ok(by('town').filter((p) => d(p) <= 12).length >= 2, 'deux cités proches');
    assert.equal(by('kingdom').length, RIVALS.length);
    for (const k of by('kingdom')) assert.ok(d(k) >= 10 && d(k) <= 34.5, `royaume à ${d(k)}`);
    assert.ok(by('dungeon').length >= 12 && by('dungeon').every((p) => d(p) >= 12));
    for (const type of ['crystalNode', 'gemNode']) assert.ok(by(type).every((p) => d(p) >= 8), `${type} jamais collé à la capitale`);
    // Danger moyen croissant avec la distance
    const ring = (a, b) => { const l = pois.filter((p) => d(p) >= a && d(p) < b && p.danger !== undefined); return l.reduce((s, p) => s + p.danger, 0) / l.length; };
    assert.ok(ring(0, 10) < ring(10, 25) && ring(10, 25) < ring(DANGER_RADIUS, 99), 'progression de la difficulté');
    // Tout lieu important est sur la carte, sur un terrain valide
    for (const p of pois) { assert.ok(p.x >= 0 && p.y >= 0 && p.x < 96 && p.y < 96); assert.ok(wTerrain(w, p.x, p.y)); }
  }
});

test('Exploration, déplacements et conquête sur le grand monde', () => {
  const s = createNewState({ seed: 'far', now: T0 });
  for (const r of Object.keys(s.resources)) s.resources[r] = 50000;
  s.army = { scout: 10, spearman: 100 };
  Object.values(s.city.buildings).find((b) => b.type === 'townhall').level = 8;
  const w = s.world;
  const t = travelTime(w, 90, 90, { scout: 1 }, {}, 'explore');
  assert.ok(Number.isFinite(t) && t < 2 * H, 'traversée raisonnable');
  assert.ok(sendMarch(s, { type: 'explore', x: 90, y: 90, units: { scout: 1 } }, T0).ok);
  advance(s, T0 + 3 * H);
  assert.ok(isRevealed(w, 90, 90), 'exploration à l’autre bout du monde');
  // Avant-poste
  let claimed = false;
  for (let r = 1; r < 6 && !claimed; r++) for (let dy = -r; dy <= r && !claimed; dy++) for (let dx = -r; dx <= r && !claimed; dx++) {
    const x = w.capital.x + dx, y = w.capital.y + dy; w.revealed[y * w.size + x] = 1;
    claimed = claimTerritory(s, x, y, T0 + 3 * H).ok;
  }
  assert.ok(claimed);
});

test('Événements, boss et factions : distances maîtrisées sur le grand monde', () => {
  rng.setSource(mulberry32(9));
  const s = createNewState({ seed: 'ev', now: T0 });
  Object.values(s.city.buildings).find((b) => b.type === 'townhall').level = 6;
  assert.equal(worldScale(s.world), 48);
  for (let i = 0; i < 50; i++) {
    const p = aroundCapital(s.world, 10, 22);
    assert.ok(p.x >= 3 && p.y >= 3 && p.x <= 92 && p.y <= 92);
    assert.ok(distCap(s.world, p.x, p.y) <= 23);
  }
  spawnBoss(s, null, T0);
  assert.ok(s.boss && distCap(s.world, s.boss.x, s.boss.y) <= 13, 'boss à portée');
  assert.equal(s.factions.length, RIVALS.length);
  for (const f of s.factions) assert.ok(f.territory.length >= 1);
  let t = T0;
  for (let i = 0; i < 48; i++) { t += 30 * 60000; advance(s, t); }
  rng.setSource(null);
  for (const f of s.factions) for (const k of f.territory) { const [x, y] = k.split(',').map(Number); assert.ok(x >= 0 && y >= 0 && x < 96 && y < 96); }
});

// Construit une sauvegarde au format v7 (ville 14×10 agrandie une fois, monde 48×48)
function legacySave(seed = 'legacy') {
  const s = createNewState({ seed, now: T0 });
  const n = s.meta.seed;
  s.city = { w: 16, h: 11, terrain: (() => { const t14 = generateCity(n, 14, 10); const t = []; for (let y = 0; y < 11; y++) for (let x = 0; x < 16; x++) t.push(x < 14 && y < 10 ? t14[y * 14 + x] : (x + y) % 5 ? 'plain' : 'forest'); return t; })(), buildings: {}, fort: { wall: 2, moat: 0 } };
  const put = (type, x, y, level) => { const id = `b_${type}_${x}_${y}`; s.city.buildings[id] = { id, type, level, x, y }; s.city.terrain[y * 16 + x] = 'plain'; };
  put('townhall', 7, 4, 6); put('house', 8, 5, 4); put('warehouse', 6, 5, 3); put('farm', 15, 10, 2);
  s.domain = 1;
  s.world = generateWorld(n, 48);
  s.world.revealed[3 * 48 + 40] = 1;
  s.territories = { [key(26, 25)]: { x: 26, y: 25, terrain: 'plain', since: T0, spec: null, level: 1 } };
  const old = JSON.parse(serialize(s));
  old.version = 7;
  return old;
}

test('Migration v7 → v8 : ville et monde agrandis sans rien déplacer ni perdre', () => {
  const old = legacySave();
  const st = deserialize(JSON.stringify(old));
  // Ville : 24+4 × 16+2 (un agrandissement déjà acheté), ancienne zone intacte, bâtiments aux mêmes coordonnées
  assert.equal(st.city.w, 28); assert.equal(st.city.h, 18);
  for (let y = 0; y < old.city.h; y++) for (let x = 0; x < old.city.w; x++) assert.equal(st.city.terrain[y * 28 + x], old.city.terrain[y * old.city.w + x], `${x},${y}`);
  assert.deepEqual(st.city.buildings, old.city.buildings);
  assert.deepEqual(st.city.fort, old.city.fort);
  const newRubble = st.city.terrain.filter((t, i) => t === 'rubble' && ((i % 28) >= old.city.w || Math.floor(i / 28) >= old.city.h)).length;
  assert.equal(newRubble, 0, 'aucun décombre (butin) ajouté');
  // Monde : 96×96, ancienne zone identique (terrain, brouillard, sites, capitale, territoires)
  const w = st.world;
  assert.equal(w.size, 96);
  assert.deepEqual(w.capital, old.world.capital);
  for (let y = 0; y < 48; y++) for (let x = 0; x < 48; x++) {
    assert.equal(w.terrain[y * 96 + x], old.world.terrain[y * 48 + x]);
    assert.equal(!!w.revealed[y * 96 + x], !!old.world.revealed[y * 48 + x]);
  }
  for (const [k, p] of Object.entries(old.world.pois)) assert.deepEqual(w.pois[k], p, k);
  assert.deepEqual(st.territories, old.territories);
  // Nouvelles régions : inexplorées, peuplées, plus dangereuses (loin de la capitale)
  const added = Object.values(w.pois).filter((p) => p.x >= 48 || p.y >= 48);
  assert.ok(added.length >= 300, `sites ajoutés : ${added.length}`);
  assert.ok(added.every((p) => !isRevealed(w, p.x, p.y)));
  const names = Object.values(w.pois).filter((p) => p.type === 'town').map((p) => p.name);
  assert.equal(new Set(names).size, names.length, 'pas de cité en double');
  const avg = (l) => l.reduce((s, p) => s + (p.danger || 0), 0) / l.length;
  assert.ok(avg(added.filter((p) => POI_TYPES[p.type].kind === 'danger')) >= 2);
  // La partie continue normalement, et un second chargement ne change plus rien
  assert.doesNotThrow(() => advance(st, T0 + 6 * H));
  const again = deserialize(serialize(st));
  assert.equal(again.world.size, 96); assert.equal(again.city.w, 28);
  assert.deepEqual(again.city.terrain, st.city.terrain);
});

test('Caméra : zoom centré sur le curseur, bornes de la carte, vue d’ensemble', () => {
  // Grille HTML (royaume)
  const cam = { x: 0, y: 0, z: 1 };
  zoomAt(cam, 2, 100, 50, 0.3, 2);
  assert.deepEqual([cam.x, cam.y, cam.z], [-100, -50, 2], 'le point sous le curseur reste en place');
  zoomAt(cam, 10, 0, 0, 0.3, 2);
  assert.equal(cam.z, 2, 'zoom maximal');
  clampCam(cam, 800, 600, 1200, 800);
  assert.ok(cam.x <= 0 && cam.x >= 800 - 2400 && cam.y <= 0 && cam.y >= 600 - 1600);
  cam.x = 5000; clampCam(cam, 800, 600, 1200, 800);
  assert.equal(cam.x, 0, 'jamais de vide à gauche');
  cam.z = 0.3; clampCam(cam, 800, 600, 1200, 800);
  assert.equal(cam.x, (800 - 360) / 2, 'carte plus petite que la fenêtre : centrée');
  assert.ok(Math.abs(fitZoom(800, 600, 1200, 800) - 0.666) < 0.01);
  // Canvas (monde)
  const c = { x: 48, y: 48, zoom: 1 };
  const W = 800, Hh = 600, S = 96;
  const under = (px, py) => [(px - W / 2) / (26 * c.zoom) + c.x, (py - Hh / 2) / (26 * c.zoom) + c.y];
  const before = under(200, 150);
  zoomWorldAt(c, 1.5, 200, 150, W, Hh, S);
  const after = under(200, 150);
  assert.ok(Math.abs(before[0] - after[0]) < 1e-9 && Math.abs(before[1] - after[1]) < 1e-9);
  c.x = -50; c.y = 500; clampWorldCam(c, W, Hh, S);
  const T = 26 * c.zoom;
  assert.equal(c.x, W / 2 / T); assert.equal(c.y, S - Hh / 2 / T);
  c.zoom = 0.01; clampWorldCam(c, W, Hh, S);
  assert.ok(c.zoom >= 0.15 && c.x === S / 2, 'vue d’ensemble centrée, zoom minimal borné');
});

test('Accès rapide : lieux découverts listés du plus proche au plus lointain', () => {
  const s = createNewState({ seed: 'places', now: T0 });
  s.world.revealed.fill(1);
  const l = notablePlaces(s);
  assert.ok(l.length >= TOWN_NAMES.length + RIVALS.length);
  for (let i = 1; i < l.length; i++) assert.ok(l[i].d >= l[i - 1].d);
  const hidden = createNewState({ seed: 'places', now: T0 });
  assert.ok(notablePlaces(hidden).length < l.length, 'les lieux inexplorés ne sont pas listés');
});

test('Soutien : encart facultatif, lien PayPal exact, nouvel onglet sécurisé, aucun paiement dans le jeu', () => {
  const h = supportHtml();
  assert.equal(SUPPORT_URL, 'https://paypal.me/Oscarwildrift');
  assert.match(h, /Soutenez le développement de Cendrelande/);
  assert.match(h, /❤️ Soutenir le projet/);
  assert.match(h, /entièrement facultatif/);
  assert.match(h, /href="https:\/\/paypal\.me\/Oscarwildrift"/);
  assert.match(h, /target="_blank"/);
  assert.match(h, /rel="noopener noreferrer"/);
  assert.equal((h.match(/https?:\/\//g) || []).length, 1, 'une seule adresse');
  assert.doesNotMatch(h, /<input|<form|data-action/, 'aucun champ, aucun paiement interne');
});
