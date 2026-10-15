// Passe-temps de recrutement : réduction du temps de formation, consommation unique, aucune unité en plus, fin de
// formation normale, familles séparées (chantier ≠ formation), refus sans consommation, combinaison, sauvegarde.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createNewState } from '../src/core/state.js';
import { serialize, deserialize } from '../src/core/save.js';
import { advance } from '../src/core/engine.js';
import { train, cancelTrain } from '../src/systems/army.js';
import { startUpgrade } from '../src/systems/construction.js';
import { applySpeedup, previewSpeedup, speedupCount, finishCombo, applyCombo, speedupState } from '../src/systems/speedups.js';
import { SPEEDUPS, RECRUIT_ORDER, SPEEDUP_ORDER } from '../src/data/speedups.js';

const T0 = Date.UTC(2026, 6, 1, 8);
const MIN = 60000;
const th = (s) => Object.values(s.city.buildings).find((b) => b.type === 'townhall');

// Une caserne et une longue formation (plusieurs heures) de lanciers
function setup(seed = 'rc', n = 1500) {
  const s = createNewState({ seed, now: T0 });
  for (const r of Object.keys(s.resources)) s.resources[r] = 5e6;
  th(s).level = 10;
  s.city.buildings.bk = { id: 'bk', type: 'barracks', level: 10, x: 9, y: 9 };
  s.meta.lastTick = T0;
  s.army = {};
  const r = train(s, 'spearman', n, T0);
  assert.ok(r.ok, r.reason);
  return { s, q: s.queues.train[0] };
}
const give = (s, k, n) => { s.inventory.consumables[k] = (s.inventory.consumables[k] || 0) + n; };
const soldiers = (s) => Object.values(s.army).reduce((a, b) => a + b, 0);

test('Recrutement 1 : un passe-temps de recrutement réduit le temps restant de la formation', () => {
  const { s, q } = setup('r1');
  give(s, 'rspeed60', 1);
  const before = q.end;
  assert.ok(before - T0 > 2 * 60 * MIN, 'formation de plus de 2 h');
  const r = applySpeedup(s, q.id, { item: 'rspeed60' }, T0);
  assert.ok(r.ok, r.reason);
  assert.equal(q.end, before - 60 * MIN);
  assert.equal(r.done, false);
});

test('Recrutement 2 : le bon objet est consommé une seule fois', () => {
  const { s, q } = setup('r2');
  give(s, 'rspeed15', 3); give(s, 'speed15', 3);
  const r0 = speedupCount(s, 'rspeed15'), b0 = speedupCount(s, 'speed15');
  assert.ok(applySpeedup(s, q.id, { item: 'rspeed15' }, T0).ok);
  assert.equal(speedupCount(s, 'rspeed15'), r0 - 1);
  assert.equal(speedupCount(s, 'speed15'), b0, 'le passe-temps de chantier n’est pas touché');
  assert.equal(speedupState(s).used.rspeed15, 1);
});

test('Recrutement 3 et 4 : aucune unité en plus ; la formation terminée passe par la fin normale', () => {
  const { s, q } = setup('r3', 20);
  const n = q.count;
  // Une deuxième formation en attente dans la même caserne avance sans changer de durée
  assert.ok(train(s, 'spearman', 10, T0).ok);
  const q2 = s.queues.train[1];
  const dur2 = q2.end - q2.start;
  for (const k of RECRUIT_ORDER) give(s, k, 5);
  const r = applyCombo(s, q.id, T0);
  assert.ok(r.ok && r.done, r.reason);
  assert.equal(s.army.spearman, n, 'exactement les soldats de la formation');
  assert.ok(!s.queues.train.some((x) => x.id === q.id), 'formation retirée de la file');
  assert.equal(q2.start <= T0 + 1, true, 'la suivante démarre aussitôt');
  assert.equal(q2.end - q2.start, dur2, 'même durée pour la suivante');
  // Le temps passe : la deuxième formation se termine normalement, sans doublon pour la première
  advance(s, q2.end + 1000);
  assert.equal(s.army.spearman, n + 10);
  assert.equal(soldiers(s), n + 10);
  // Annuler ne rembourse pas des soldats déjà formés
  assert.equal(cancelTrain(s, q.id, q2.end + 2000).ok, false);
});

test('Recrutement 5 : un objet de construction ne sert pas à une formation (et inversement)', () => {
  const { s, q } = setup('r5');
  give(s, 'speed60', 2);
  const p = previewSpeedup(s, q.id, { item: 'speed60' }, T0);
  assert.equal(p.ok, false);
  assert.match(p.reason, /chantiers/);
  const end = q.end;
  assert.equal(applySpeedup(s, q.id, { item: 'speed60' }, T0).ok, false);
  assert.equal(speedupCount(s, 'speed60'), 2);
  assert.equal(q.end, end);
  // Inverse : chantier + objet de recrutement
  assert.ok(startUpgrade(s, th(s).id, T0).ok);
  const b = s.queues.build[0];
  give(s, 'rspeed60', 1);
  const bend = b.end;
  assert.equal(applySpeedup(s, b.id, { item: 'rspeed60' }, T0).ok, false);
  assert.equal(speedupCount(s, 'rspeed60'), 1);
  assert.equal(b.end, bend);
  for (const k of SPEEDUP_ORDER) assert.equal(SPEEDUPS[k].target, 'build');
  for (const k of RECRUIT_ORDER) assert.equal(SPEEDUPS[k].target, 'train');
});

test('Recrutement 6 : une accélération impossible ne consomme rien', () => {
  const { s, q } = setup('r6', 20);
  // Aucun objet en stock
  assert.equal(applySpeedup(s, q.id, { item: 'rspeed5' }, T0).ok, false);
  // Formation en attente derrière une autre : refusée
  assert.ok(train(s, 'spearman', 10, T0).ok);
  const q2 = s.queues.train[1];
  give(s, 'rspeed5', 2);
  assert.equal(applySpeedup(s, q2.id, { item: 'rspeed5' }, T0).ok, false);
  assert.equal(speedupCount(s, 'rspeed5'), 2);
  // Presque finie : en dessous du seuil, refusée
  assert.equal(applySpeedup(s, q.id, { item: 'rspeed5' }, q.end - 5000).ok, false);
  assert.equal(speedupCount(s, 'rspeed5'), 2);
  // Formation inexistante
  assert.equal(applySpeedup(s, 'nope', { item: 'rspeed5' }, T0).ok, false);
  // Combinaison impossible (stock insuffisant) : rien n'est consommé
  const big = setup('r6b', 6000);
  give(big.s, 'rspeed5', 1);
  assert.equal(finishCombo(big.s, big.q.id, T0), null);
  assert.equal(applyCombo(big.s, big.q.id, T0).ok, false);
  assert.equal(speedupCount(big.s, 'rspeed5'), 1);
  // Gemmes insuffisantes : rien n'est payé
  big.s.resources.gems = 0;
  assert.equal(applySpeedup(big.s, big.q.id, { gems: 'hour' }, T0).ok, false);
});

test('Recrutement : la combinaison ne consomme pas plus que nécessaire, et la sauvegarde conserve le stock', () => {
  const { s, q } = setup('r7', 30);
  const left = Math.ceil((q.end - T0) / MIN);
  for (const k of RECRUIT_ORDER) give(s, k, 10);
  const c = finishCombo(s, q.id, T0);
  assert.ok(c.minutes >= left);
  assert.ok(c.waste < 480, 'gaspillage borné');
  const before = Object.fromEntries(RECRUIT_ORDER.map((k) => [k, speedupCount(s, k)]));
  const r = applyCombo(s, q.id, T0);
  assert.ok(r.done);
  const spent = RECRUIT_ORDER.reduce((a, k) => a + (before[k] - speedupCount(s, k)) * SPEEDUPS[k].min, 0);
  assert.ok(spent >= left && spent <= c.minutes);
  const back = deserialize(serialize(s));
  for (const k of RECRUIT_ORDER) assert.equal(speedupCount(back, k), speedupCount(s, k));
  assert.equal(back.army.spearman, 30);
});
