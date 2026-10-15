// Niveaux étendus : HdV jusqu'à 30, bâtiments emblématiques jusqu'à 25, ères et paliers, prérequis affichés,
// coûts et durées progressifs mais payables, effets à demi-pente au-delà de 20, compatibilité des sauvegardes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createNewState } from '../src/core/state.js';
import { serialize, deserialize } from '../src/core/save.js';
import { advance } from '../src/core/engine.js';
import { BUILDINGS, buildingCost, buildingTime } from '../src/data/buildings.js';
import { ERAS, eraOf, TH_MILESTONES, thRequirements } from '../src/data/eras.js';
import { computeMods } from '../src/systems/modifiers.js';
import { storageCap } from '../src/systems/economy.js';
import { upgradeCheck, startUpgrade, buildSlots } from '../src/systems/construction.js';
import { maxMarches } from '../src/systems/marches.js';
import { applySpeedup } from '../src/systems/speedups.js';
import { buildingSvg, levelTier } from '../src/ui/art.js';

const T0 = Date.UTC(2026, 6, 1, 8);
const H = 3600000;
const th = (s) => Object.values(s.city.buildings).find((b) => b.type === 'townhall');
const EMBLEMATIC = ['townhall', 'castle', 'barracks', 'stable', 'workshop', 'market', 'library', 'wall', 'sawmill', 'quarry', 'mine', 'house', 'farm', 'warehouse'];

// Royaume de niveau L : HdV L, deux entrepôts au niveau min(L, 25), donjon et bibliothèque suffisants
function realm(L, seed = 'lv') {
  const s = createNewState({ seed, now: T0 });
  th(s).level = L;
  const wl = Math.min(25, L);
  for (const b of Object.values(s.city.buildings)) if (b.type === 'warehouse') b.level = wl;
  s.city.buildings.wh9 = { id: 'wh9', type: 'warehouse', level: wl, x: 2, y: 9 };
  s.city.buildings.cs = { id: 'cs', type: 'castle', level: Math.min(25, L), x: 9, y: 9 };
  s.city.buildings.lb = { id: 'lb', type: 'library', level: Math.min(25, L), x: 11, y: 9 };
  s.meta.lastTick = T0;
  return s;
}

test('Niveaux : HdV 30, bâtiments emblématiques 25, ordinaires au moins 20 ; bâtiments spéciaux inchangés', () => {
  assert.equal(BUILDINGS.townhall.maxLevel, 30);
  for (const t of EMBLEMATIC.slice(1)) assert.equal(BUILDINGS[t].maxLevel, 25, t);
  for (const [t, d] of Object.entries(BUILDINGS)) if (d.cat !== 'unique' && !['road', 'moat', 'guildhall'].includes(t)) assert.ok(d.maxLevel >= 20, t);
  assert.equal(BUILDINGS.monument.maxLevel, 5);
  assert.equal(BUILDINGS.moat.maxLevel, 10);
});

test('Niveaux : chaque niveau coûte plus et dure plus que le précédent (aucun niveau vide)', () => {
  for (const [t, d] of Object.entries(BUILDINGS)) {
    if (t === 'road') continue;
    for (let L = 2; L <= d.maxLevel; L++) {
      const a = buildingCost(t, L - 1), b = buildingCost(t, L);
      const sum = (o) => Object.values(o).reduce((x, y) => x + y, 0);
      assert.ok(sum(b) > sum(a), `${t} ${L} coût`);
      for (const r of Object.keys(a)) assert.ok((b[r] || 0) >= a[r], `${t} ${L} ${r}`);
      assert.ok(buildingTime(t, L) > buildingTime(t, L - 1), `${t} ${L} durée`);
    }
  }
});

test('Niveaux : les coûts 16 à 30 restent payables (≤ 80 % du stockage réel d’un royaume de ce niveau)', () => {
  for (let L = 16; L <= 30; L++) {
    const s = realm(L, 'cap' + L);
    const mods = computeMods(s, T0);
    for (const [t, d] of Object.entries(BUILDINGS)) {
      if (L > d.maxLevel || d.cat === 'unique' || t === 'road') continue;
      for (const [r, v] of Object.entries(buildingCost(t, L))) if (r !== 'gold' && !['rareOre', 'crystals', 'gems', 'ancientWood', 'silver'].includes(r)) assert.ok(v <= storageCap(s, mods, r) * 0.8, `${t} ${L} ${r} ${v} > ${storageCap(s, mods, r)}`);
    }
  }
});

test('Niveaux : durées de fin de partie longues mais pas absurdes', () => {
  const days = (t, L) => buildingTime(t, L) / (24 * H);
  assert.ok(days('townhall', 20) > 3 && days('townhall', 20) < 6);
  assert.ok(days('townhall', 25) < 8);
  assert.ok(days('townhall', 30) < 11);
  for (const [t, d] of Object.entries(BUILDINGS)) for (let L = 21; L <= d.maxLevel; L++) if (t !== 'townhall') assert.ok(buildingTime(t, L) <= 0.8 * buildingTime('townhall', L) + 1, `${t} ${L}`);
});

test('Ères : six ères continues de 1 à 30', () => {
  assert.equal(ERAS.length, 6);
  for (let L = 1; L <= 30; L++) assert.ok(eraOf(L).from <= L && eraOf(L).to >= L);
  assert.equal(eraOf(13).name, 'Puissance royale');
  assert.equal(eraOf(30).name, 'Héritage légendaire');
});

test('HdV : les prérequis sont affichés et bloquent ; remplis, l’amélioration est prête', () => {
  const s = realm(20, 'req');
  for (const r of Object.keys(s.resources)) s.resources[r] = 9e6;
  s.city.buildings.cs.level = 10; // donjon trop bas pour l'HdV 21 (il faut 15)
  const u = upgradeCheck(s, th(s).id);
  assert.equal(u.status, 'locked');
  assert.ok(u.reasons.some((x) => /Donjon niv\. 15/.test(x)), u.reasons.join(' | '));
  assert.equal(startUpgrade(s, th(s).id, T0).ok, false);
  s.city.buildings.cs.level = 15;
  assert.equal(upgradeCheck(s, th(s).id).status, 'ready');
  assert.deepEqual(thRequirements(16).map((r) => r.type), ['warehouse']);
  assert.ok(thRequirements(30).length === 3);
});

test('HdV : paliers réels (marche à 18, file de construction à 20) et titre au niveau 30', () => {
  const s17 = realm(17, 'm17'), s18 = realm(18, 'm18'), s20 = realm(20, 'm20'), s19 = realm(19, 'm19');
  for (const x of [s17, s18, s19, s20]) x.city.buildings.cs.level = 15; // même donjon : seul l'HdV change
  assert.equal(maxMarches(computeMods(s18, T0)) - maxMarches(computeMods(s17, T0)), 1);
  assert.equal(buildSlots(computeMods(s20, T0)) - buildSlots(computeMods(s19, T0)), 1);
  for (const l of Object.keys(TH_MILESTONES)) assert.ok(+l > 15 && +l <= 30);
  const s = realm(29, 'm30');
  for (const r of Object.keys(s.resources)) s.resources[r] = 9e6;
  const r = startUpgrade(s, th(s).id, T0);
  assert.ok(r.ok, r.reason);
  advance(s, s.queues.build[0].end + 1000);
  assert.equal(th(s).level, 30);
  assert.ok(s.meta.titles.includes('Souverain légendaire'));
  assert.equal(upgradeCheck(s, th(s).id).status, 'max');
});

test('Bâtiments 21–25 : HdV requis, effets à demi-pente (pas d’auto-victoire)', () => {
  const s = realm(22, 'ext');
  for (const r of Object.keys(s.resources)) s.resources[r] = 9e6;
  s.city.buildings.bk = { id: 'bk', type: 'barracks', level: 22, x: 13, y: 9 };
  const u = upgradeCheck(s, 'bk');
  assert.equal(u.status, 'locked');
  assert.match(u.reasons[0], /Hôtel de ville niv\. 23/);
  const e = BUILDINGS.barracks.effects;
  const step20 = e(20)['train.speed'] - e(19)['train.speed'];
  const step21 = e(21)['train.speed'] - e(20)['train.speed'];
  assert.ok(Math.abs(step21 - step20 / 2) < 1e-9);
  assert.ok(BUILDINGS.castle.effects(25)['city.def'] < BUILDINGS.castle.effects(20)['city.def'] * 1.2);
});

test('Niveaux étendus : passe-temps et gemmes fonctionnent sur un chantier d’HdV 25 (jamais obligatoires)', () => {
  const s = realm(24, 'sp');
  for (const r of Object.keys(s.resources)) s.resources[r] = 9e6;
  assert.ok(startUpgrade(s, th(s).id, T0).ok);
  const q = s.queues.build[0];
  s.inventory.consumables.speed480 = 1;
  const end = q.end;
  assert.ok(applySpeedup(s, q.id, { item: 'speed480' }, T0).ok);
  assert.equal(q.end, end - 8 * H);
  // Sans rien dépenser, le chantier se termine quand même
  advance(s, q.end + 1000);
  assert.equal(th(s).level, 25);
});

test('Sauvegardes : une partie avec un HdV 25 (ancien maximum) se recharge et peut viser le 26', () => {
  const s = realm(25, 'old');
  const back = deserialize(serialize(s));
  assert.equal(th(back).level, 25);
  assert.notEqual(upgradeCheck(back, th(back).id).status, 'max');
});

test('Visuels : paliers 20 et 25 ajoutent bannières royales et couronne', () => {
  assert.equal(levelTier(19), 3);
  assert.equal(levelTier(20), 4);
  assert.equal(levelTier(25), 5);
  assert.match(buildingSvg('barracks', 21), /ov-pennants/);
  assert.match(buildingSvg('townhall', 27), /ov-crown/);
  assert.doesNotMatch(buildingSvg('barracks', 12), /ov-pennants/);
});
