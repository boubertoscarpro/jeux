// v16 « Le Château » (seconde passe) : table des lieux, nouveaux lieux posés d'eux-mêmes, accessibilité de tous les
// écrans par leur lieu et par la liste des Lieux.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createNewState } from '../src/core/state.js';
import { advance } from '../src/core/engine.js';
import { serialize, deserialize } from '../src/core/save.js';
import { startBuild } from '../src/systems/construction.js';
import { totalLevels } from '../src/systems/city.js';
import { zoneAt } from '../src/systems/castle.js';
import { ensurePlaces, placesOfScreen, placeBuilding } from '../src/systems/places.js';
import { PLACES, SCREEN_PLACE, NEW_PLACES } from '../src/data/places.js';
import { BUILDINGS } from '../src/data/buildings.js';
import { VIEWS } from '../src/ui/app.js';
import { placesList } from '../src/ui/castleUi.js';

const T0 = Date.UTC(2026, 0, 5, 9);
const H = 3600e3;
const th = (s) => Object.values(s.city.buildings).find((b) => b.type === 'townhall');
const screenIds = VIEWS.map((v) => v.id).filter((id) => id !== 'city');

test('Lieux : chaque écran du jeu a un lieu (bâtiment, carte ou affichage fixe), et chaque lieu mène à un écran existant', () => {
  for (const id of screenIds) assert.ok(SCREEN_PLACE[id], `écran sans lieu : ${id}`);
  const ids = new Set(VIEWS.map((v) => v.id));
  for (const [k, p] of Object.entries(PLACES)) {
    assert.ok(p.screens.length > 0, k);
    for (const sc of p.screens) assert.ok(ids.has(sc), `${k} → ${sc} inconnu`);
    if (p.kind === 'building') assert.ok(BUILDINGS[p.type], `${k} : bâtiment inconnu`);
    else assert.ok(p.name && p.icon, k);
  }
  assert.deepEqual(placesOfScreen('army').sort(), ['barracks', 'stable']);
});

test('Lieux : la liste des Lieux contient chaque écran exactement une fois, avec son lieu', () => {
  const s = createNewState({ seed: 'lieux', now: T0 });
  const app = { state: s, ui: {}, views: Object.fromEntries(VIEWS.map((v) => [v.id, v])) };
  const items = placesList(app);
  const seen = items.map((i) => i.view);
  assert.equal(new Set(seen).size, seen.length, 'aucun doublon');
  assert.deepEqual([...seen].sort(), [...screenIds].sort(), 'aucun écran perdu');
  for (const it of items) assert.ok(it.place, `${it.view} : lieu affiché`);
  // Un lieu bâti renvoie à sa case (« Voir »), un lieu à bâtir à son terrain vague quand il y en a un
  const market = items.find((i) => i.view === 'market');
  assert.ok(market.at, 'le marché se montre sur la carte (bâtiment ou terrain vague)');
});

test('Lieux : une nouvelle partie pose le scriptorium, la place du héraut et l’ambassade dans les faubourgs', () => {
  const s = createNewState({ seed: 'neuf', now: T0 });
  for (const t of ['scriptorium', 'herald', 'embassy']) {
    const b = Object.values(s.city.buildings).find((x) => x.type === t);
    assert.ok(b, t);
    assert.equal(b.level, 1);
    assert.equal(zoneAt(s, b.x, b.y), 'faubourg', `${t} dans les faubourgs`);
    assert.equal(s.city.terrain[b.y * s.city.w + b.x], 'plain', `${t} sur une case libre`);
  }
  const pos = new Set(Object.values(s.city.buildings).map((b) => b.x + ',' + b.y));
  assert.equal(pos.size, Object.keys(s.city.buildings).length, 'aucune superposition');
  assert.ok(!Object.values(s.city.buildings).some((b) => b.type === 'lists'), 'la lice attend l’hôtel de ville 4');
  // Les lieux ne comptent pas dans les niveaux du royaume et ne se bâtissent pas à la main
  const before = totalLevels(s);
  delete s.city.buildings.p_scriptorium;
  assert.equal(totalLevels(s), before);
  assert.equal(startBuild(s, 'scriptorium', 0, 0, T0).ok, false);
  // … mais réapparaissent d'eux-mêmes (une seule fois)
  assert.equal(ensurePlaces(s).length, 1);
  assert.equal(ensurePlaces(s).length, 0);
});

test('Lieux : la lice et le cabinet du cartographe s’ouvrent avec le royaume, annoncés au journal', () => {
  const s = createNewState({ seed: 'lice', now: T0 });
  th(s).level = 4;
  advance(s, T0 + H);
  for (const t of ['lists', 'cartographer']) assert.ok(placeBuilding(s, t), t);
  assert.ok(s.log.some((l) => /nouveau lieu/.test(l.text || l.msg || '')), 'annonce au journal');
  for (const k of Object.keys(NEW_PLACES)) assert.ok(BUILDINGS[PLACES[k].type].isPlace && BUILDINGS[PLACES[k].type].maxLevel === 1, k);
  // Sauvegarde : les lieux survivent tels quels
  const again = deserialize(serialize(s));
  for (const t of ['lists', 'cartographer', 'scriptorium']) assert.deepEqual(placeBuilding(again, t), placeBuilding(s, t));
});

test('Lieux : la marque « lieu » ne se confond pas avec la contrainte de placement (pêcherie, port au bord de l’eau)', () => {
  const s = createNewState({ seed: 'eau', now: T0 });
  for (const t of ['fishery', 'port']) {
    assert.equal(BUILDINGS[t].place, 'river', t);
    assert.ok(!BUILDINGS[t].isPlace, t);
    const r = startBuild(s, t, 0, 0, T0);
    assert.ok(!/apparaît de lui-même/.test(r.reason || ''), `${t} reste constructible`);
  }
  const before = totalLevels(s);
  s.city.buildings.fx = { id: 'fx', type: 'fishery', level: 3, x: 0, y: 0 };
  assert.equal(totalLevels(s), before + 3);
});

test('Bulles : peu nombreuses, triées par importance, une par bâtiment, chacune mène à un écran ; héros à leur poste', async () => {
  const { cityBubbles, heroPosts, BUBBLE_MAX } = await import('../src/systems/bubbles.js');
  const { computeMods } = await import('../src/systems/modifiers.js');
  const s = createNewState({ seed: 'bulles', now: T0 });
  const put = (id, type, x, y, level = 3) => { s.city.buildings[id] = { id, type, level, x, y }; };
  put('lib', 'library', 1, 1); put('bar', 'barracks', 2, 1); put('wh', 'warehouse', 3, 1); put('tav', 'tavern', 4, 1); put('frg', 'forge', 5, 1); put('wt', 'watchtower', 6, 1); put('mill', 'sawmill', 7, 1);
  s.queues.research = []; s.queues.train = []; s.queues.craft = [];
  const mods = computeMods(s, T0);
  s.resources.wood = 1e9; // déborde
  s.raids = [{ id: 'r', name: 'Crocs', arrive: T0 + H, army: {} }];
  const list = cityBubbles(s, mods, T0);
  assert.ok(list.length <= BUBBLE_MAX);
  for (let i = 1; i < list.length; i++) assert.ok(list[i - 1].prio >= list[i].prio, 'triées');
  assert.equal(new Set(list.map((b) => b.bid)).size, list.length, 'une par bâtiment');
  assert.equal(list[0].id, 'raid');
  assert.ok(list.some((b) => b.id === 'full' && b.bid === 'wh'));
  const ids = new Set(VIEWS.map((v) => v.id));
  for (const b of list) { assert.ok(ids.has(b.view), b.view); assert.ok(b.mark && b.text); }
  // Rien en cours ni à signaler : pas de bulle de raid ni de stock plein
  s.raids = []; s.resources.wood = 0;
  assert.ok(!cityBubbles(s, mods, T0).some((b) => b.id === 'raid' || b.id === 'full'));
  // Héros gouverneur : montré sur le bâtiment de son secteur
  s.heroes[0].assignment = { type: 'governor', sector: 'wood' };
  assert.deepEqual(heroPosts(s).get('mill').map((p) => p.sector), ['wood']);
});

test('Lieux : un lieu (niveau maximal) ne peut pas être planifié en amélioration et n’encombre pas la file', async () => {
  const { planConstruction } = await import('../src/systems/construction.js');
  const s = createNewState({ seed: 'plan', now: T0 });
  const r = planConstruction(s, { kind: 'upgrade', bid: 'p_scriptorium' });
  assert.equal(r.ok, false);
  assert.equal((s.queues.planned || []).length, 0);
  const th = Object.values(s.city.buildings).find((b) => b.type === 'townhall');
  assert.ok(planConstruction(s, { kind: 'upgrade', bid: th.id }).ok, 'les autres restent planifiables');
});
