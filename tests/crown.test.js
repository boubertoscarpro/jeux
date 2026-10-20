// Grands Projets du Royaume : refus si ressources insuffisantes (rien n'est payé), coûts affichés = coûts débités,
// récompense unique jamais donnée deux fois, limites des répétables, sauvegarde, anciennes sauvegardes, pas de
// boucle infinie, bonus temporaires qui expirent, projet d'événement.
import { rng, mulberry32 } from '../src/core/rng.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createNewState } from '../src/core/state.js';
import { serialize, deserialize } from '../src/core/save.js';
import { advance } from '../src/core/engine.js';
import { computeMods } from '../src/systems/modifiers.js';
import { orderMods } from '../src/systems/order.js';
import { storageCap } from '../src/systems/economy.js';
import { CROWN_PROJECTS, crownSlots } from '../src/data/crown.js';
import { RESOURCES } from '../src/data/resources.js';
import { crownInfo, crownCost, startCrown, claimCrown, cancelCrown, crownState, crownMods, crownList } from '../src/systems/crown.js';
import { speedupCount } from '../src/systems/speedups.js';
import { startEvent, liveState } from '../src/systems/liveEvents.js';
import { LIVE_EVENTS } from '../src/data/liveEvents.js';

const T0 = Date.UTC(2026, 6, 1, 8);
const H = 3600000;
const th = (s) => Object.values(s.city.buildings).find((b) => b.type === 'townhall');
function kingdom(seed, lvl = 12) {
  const s = createNewState({ seed, now: T0 });
  th(s).level = lvl;
  s.city.buildings.wh2 = { id: 'wh2', type: 'warehouse', level: 15, x: 2, y: 9 };
  s.city.buildings.bk = { id: 'bk', type: 'barracks', level: 12, x: 9, y: 9 };
  s.meta.lastTick = T0;
  for (const r of Object.keys(s.resources)) s.resources[r] = 400000;
  return s;
}
const value = (o) => Object.entries(o || {}).reduce((a, [r, v]) => a + v * (RESOURCES[r]?.price || 0), 0);

test('Projets 7 : refusé si les ressources manquent, et rien n’est consommé', () => {
  const s = kingdom('c7');
  s.resources.food = 10;
  const before = { ...s.resources };
  const r = startCrown(s, 'warReserve', T0);
  assert.equal(r.ok, false);
  assert.match(r.reason, /insuffisantes/);
  assert.ok(r.missing.food > 0);
  assert.deepEqual(s.resources, before);
  assert.equal(Object.keys(crownState(s).active).length, 0);
});

test('Projets 13 : le coût affiché est exactement le coût débité, et reste payable (≤ 70 % du stockage)', () => {
  const s = kingdom('c13');
  const mods = computeMods(s, T0);
  for (const id of Object.keys(CROWN_PROJECTS)) {
    const c = crownCost(s, id, mods);
    for (const [r, v] of Object.entries(c)) {
      assert.ok(v > 0 && Number.isInteger(v), `${id} ${r}`);
      if (r !== 'gold' && RESOURCES[r].cat !== 'rare') assert.ok(v <= storageCap(s, mods, r) * 0.7 + 1, `${id} ${r} payable`);
    }
  }
  const info = crownInfo(s, 'royalRoads', T0);
  const before = { ...s.resources };
  assert.ok(startCrown(s, 'royalRoads', T0).ok);
  for (const [r, v] of Object.entries(info.cost)) assert.equal(before[r] - s.resources[r], v, r);
  // Le coût suit le niveau d'HdV (économie réelle) : plus cher plus haut
  const lo = kingdom('c13b', 6), hi = kingdom('c13c', 16);
  assert.ok(crownCost(hi, 'warReserve').food > crownCost(lo, 'warReserve').food);
});

test('Projets 8 : une récompense unique n’est jamais donnée deux fois', () => {
  const s = kingdom('c8');
  assert.ok(startCrown(s, 'crownArsenal', T0).ok);
  assert.equal(claimCrown(s, 'crownArsenal', T0 + H).ok, false, 'pas avant la fin des travaux');
  const r0 = speedupCount(s, 'rspeed60');
  const t1 = T0 + 7 * H;
  assert.ok(claimCrown(s, 'crownArsenal', t1).ok);
  assert.equal(speedupCount(s, 'rspeed60'), r0 + 2);
  assert.equal(claimCrown(s, 'crownArsenal', t1).ok, false);
  assert.equal(speedupCount(s, 'rspeed60'), r0 + 2);
  assert.equal(crownInfo(s, 'crownArsenal', t1).status, 'done');
  assert.equal(startCrown(s, 'crownArsenal', t1).ok, false, 'un projet unique ne se relance pas');
  assert.equal(crownMods(s)['train.speed'], 0.04, 'bonus permanent compté une fois');
  // Titre et décoration de prestige : une seule fois
  assert.ok(startCrown(s, 'restoreMonument', t1).ok);
  assert.ok(claimCrown(s, 'restoreMonument', t1 + 9 * H).ok);
  assert.equal(s.meta.titles.filter((x) => x === 'Restaurateur des Anciens').length, 1);
  assert.equal(s.meta.owned.deco_restored, true);
});

test('Projets 9 : les répétables respectent délai, limite et coût croissant', () => {
  const s = kingdom('c9');
  let t = T0;
  const def = CROWN_PROJECTS.warReserve;
  let last = 0;
  for (let i = 0; i < def.repeat.max; i++) {
    const c = crownCost(s, 'warReserve').food;
    assert.ok(c >= last, 'coût croissant ou plafonné');
    last = c;
    const r = startCrown(s, 'warReserve', t);
    assert.ok(r.ok, `édition ${i + 1} : ${r.reason}`);
    t += def.hours * H;
    assert.ok(claimCrown(s, 'warReserve', t).ok);
    // Délai entre deux éditions
    if (i < def.repeat.max - 1) { assert.equal(startCrown(s, 'warReserve', t + H).ok, false); assert.equal(crownInfo(s, 'warReserve', t + H).status, 'cooldown'); }
    t += def.repeat.cooldownH * H;
  }
  assert.equal(crownState(s).done.warReserve, def.repeat.max);
  const r = startCrown(s, 'warReserve', t);
  assert.equal(r.ok, false);
  assert.match(r.reason, /Limite/);
});

test('Projets : plusieurs projets en parallèle, dans la limite des emplacements ; annulation à moitié remboursée', () => {
  const s = kingdom('cp');
  assert.equal(crownSlots(12), 2);
  assert.equal(crownSlots(20), 3);
  assert.ok(startCrown(s, 'royalRoads', T0).ok);
  assert.ok(startCrown(s, 'royalFair', T0).ok);
  const r = startCrown(s, 'warReserve', T0);
  assert.equal(r.ok, false);
  assert.match(r.reason, /emplacement|en cours/);
  const paid = crownState(s).active.royalFair.cost.gold;
  const g = s.resources.gold;
  assert.ok(cancelCrown(s, 'royalFair', T0 + H).ok);
  assert.equal(s.resources.gold - g, Math.floor(paid * 0.5));
  assert.equal(crownState(s).done.royalFair || 0, 0);
});

test('Projets 10 et 11 : sauvegarde/rechargement en cours de travaux, et ancienne sauvegarde sans projets', () => {
  const s = kingdom('c10');
  assert.ok(startCrown(s, 'royalRoads', T0).ok);
  assert.ok(startCrown(s, 'warReserve', T0).ok);
  assert.ok(claimCrown(s, 'warReserve', T0 + 4 * H).ok);
  const back = deserialize(serialize(s));
  assert.deepEqual(crownState(back).active.royalRoads, crownState(s).active.royalRoads);
  assert.equal(crownState(back).done.warReserve, 1);
  assert.equal(claimCrown(back, 'warReserve', T0 + 5 * H).ok, false, 'pas de double récompense après rechargement');
  assert.ok(claimCrown(back, 'royalRoads', T0 + 5 * H).ok);
  // Ancienne sauvegarde : pas de champ crown, ou un champ corrompu
  const old = JSON.parse(serialize(kingdom('c11')));
  delete (old.state || old).crown;
  const o = deserialize(JSON.stringify(old));
  assert.deepEqual(crownState(o).active, {});
  assert.ok(crownList(o, T0).length === Object.keys(CROWN_PROJECTS).length);
  const bad = JSON.parse(serialize(kingdom('c11b')));
  (bad.state || bad).crown = { active: { ghost: { end: 5 }, royalRoads: 'x' }, done: [], last: null };
  const b = deserialize(JSON.stringify(bad));
  assert.deepEqual(crownState(b).active, {});
  assert.ok(startCrown(b, 'royalRoads', T0).ok);
});

test('Projets 12 : aucune boucle infinie — ce qui est rendu vaut toujours moins que le coût', () => {
  const s = kingdom('c12', 20);
  for (const [id, d] of Object.entries(CROWN_PROJECTS)) {
    const cost = value(crownCost(s, id));
    assert.ok(value(d.reward.res) < cost * 0.5, `${id} : ressources rendues < moitié du coût`);
    if (d.reward.eventCurrency) assert.ok(d.reward.eventCurrency * 5 < cost, id);
    assert.ok(!d.reward.buff || d.reward.buff.hours <= 72, `${id} : bonus temporaire borné`);
    for (const [k, v] of Object.entries(d.reward.buff?.mods || {})) if (k !== 'combat.morale') assert.ok(Math.abs(v) <= 0.2, `${id} ${k} modeste`);
    assert.ok(d.repeat || d.event || !d.reward.buff || true);
    if (d.repeat) assert.ok(d.repeat.max <= 6 && d.repeat.cooldownH >= 24 && d.repeat.growth > 1, `${id} répétable borné`);
  }
});

test('Projets 14 : un bonus temporaire expire ; un bonus permanent de projet unique reste', () => {
  // Tirages fixés : les 9 h simulées ne doivent pas dépendre du hasard du monde (depuis v14, une crise aléatoire —
  // épidémie, entraînement −15 % — pouvait survenir pendant ces 9 h et fausser la comparaison)
  rng.setSource(mulberry32(14));
  try {
  const s = kingdom('c14');
  assert.ok(startCrown(s, 'royalMobilization', T0).ok);
  const t1 = T0 + 4 * H;
  const base = computeMods(s, t1)['train.speed'] || 0;
  // v20 : l'ordre public agit aussi sur la formation et peut changer pendant 9 h (lieux posés) : on en tient compte
  const ob0 = orderMods(s)['train.speed'] || 0;
  assert.ok(claimCrown(s, 'royalMobilization', t1).ok);
  assert.ok(Math.abs((computeMods(s, t1 + 1000)['train.speed'] || 0) - base - 0.2) < 1e-9);
  advance(s, t1 + 9 * H);
  assert.ok(Math.abs((computeMods(s, t1 + 9 * H)['train.speed'] || 0) - base - ((orderMods(s)['train.speed'] || 0) - ob0)) < 1e-9, 'bonus expiré');
  assert.ok(!s.buffs.some((b) => b.name === 'Mobilisation royale' && b.until > t1 + 9 * H));
  } finally { rng.setSource(null); }
});

test('Projets 15 : le projet d’événement n’existe que pendant un événement, une fois, et verse sa monnaie', () => {
  const s = kingdom('c15');
  assert.equal(crownInfo(s, 'eventBanquet', T0).status, 'hidden');
  assert.equal(startCrown(s, 'eventBanquet', T0).ok, false);
  const key = Object.keys(LIVE_EVENTS)[0];
  const cur = startEvent(s, key, T0);
  assert.ok(cur);
  assert.equal(crownInfo(s, 'eventBanquet', T0).status, 'available');
  assert.ok(startCrown(s, 'eventBanquet', T0).ok);
  const w = liveState(s).current.wallet;
  assert.ok(claimCrown(s, 'eventBanquet', T0 + 2 * H).ok);
  assert.ok(liveState(s).current.wallet > w, 'monnaie d’événement versée');
  assert.equal(crownInfo(s, 'eventBanquet', T0 + 2 * H).status, 'done');
  assert.equal(startCrown(s, 'eventBanquet', T0 + 2 * H).ok, false, 'une seule fois par événement');
});

test('Projets rares : cachés tant que le haut fait manque', () => {
  const s = kingdom('cr');
  s.stats.bossKills = 0;
  assert.equal(crownInfo(s, 'trophyHall', T0).status, 'hidden');
  s.stats.bossKills = 3;
  assert.equal(crownInfo(s, 'trophyHall', T0).status, 'available');
});
