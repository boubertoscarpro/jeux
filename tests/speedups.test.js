// Passe-temps : gains (combat, événements), refus des récompenses non éligibles, usage sur un chantier, gemmes,
// absence de double consommation et de double récompense, sauvegarde, anciennes sauvegardes, hors ligne.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createNewState } from '../src/core/state.js';
import { serialize, deserialize } from '../src/core/save.js';
import { advance } from '../src/core/engine.js';
import { startUpgrade } from '../src/systems/construction.js';
import { applySpeedup, previewSpeedup, grantSpeedups, rollCombatSpeedup, speedupCount, speedupState, combatRoom } from '../src/systems/speedups.js';
import { COMBAT_SPEEDUPS, gemCostForMinutes } from '../src/data/speedups.js';
import { sendMarch } from '../src/systems/marches.js';
import { armyPower } from '../src/systems/army.js';
import { startEvent, claimObjective, liveState } from '../src/systems/liveEvents.js';
import { LIVE_EVENTS } from '../src/data/liveEvents.js';
import { grantReward } from '../src/systems/rewards.js';

const T0 = Date.UTC(2026, 6, 1, 8);
// Les gains de combat peuvent être versés en passe-temps de chantier OU de recrutement (même durée)
const both = (s, k) => speedupCount(s, k) + speedupCount(s, 'r' + k);
const MIN = 60000, H = 3600000;
const th = (s) => Object.values(s.city.buildings).find((b) => b.type === 'townhall');
const rich = (s) => { for (const r of Object.keys(s.resources)) s.resources[r] = 500000; };

// Un chantier long (hôtel de ville 9 → 10 : plusieurs heures)
function longJob(seed = 'sp') {
  const s = createNewState({ seed, now: T0 });
  rich(s); th(s).level = 12; s.meta.lastTick = T0;
  const r = startUpgrade(s, th(s).id, T0);
  assert.ok(r.ok, r.reason);
  return { s, q: s.queues.build[0] };
}

test('1. Combat éligible : un passe-temps est gagné ; 3. une cible trop faible ou une défaite ne donnent rien', () => {
  const s = createNewState({ seed: 'c1', now: T0 });
  const before = both(s, 'speed15');
  const ok = rollCombatSpeedup(s, { win: true, merit: 0.8, table: [1, 'speed15'], source: 'test' }, T0);
  assert.equal((ok.items.speed15 || 0) + (ok.items.rspeed15 || 0), 1);
  assert.equal(both(s, 'speed15'), before + 1);
  assert.equal(rollCombatSpeedup(s, { win: true, merit: 0.1, table: [1, 'speed15'] }, T0).reason, 'cible trop faible pour votre armée');
  assert.equal(rollCombatSpeedup(s, { win: false, merit: 2, table: [1, 'speed15'] }, T0).reason, 'défaite');
  assert.equal(both(s, 'speed15'), before + 1);
  // Plafond quotidien : au-delà, plus rien jusqu'au lendemain ; reculer l'horloge ne le rouvre pas
  for (let i = 0; i < 20; i++) rollCombatSpeedup(s, { win: true, merit: 1, table: [1, 'speed5'] }, T0);
  assert.equal(speedupState(s).combatToday, COMBAT_SPEEDUPS.dailyCap);
  assert.equal(rollCombatSpeedup(s, { win: true, merit: 1, table: [1, 'speed5'] }, T0 - 2 * 86400000).reason, 'plafond quotidien atteint');
  assert.equal(combatRoom(s, T0 + 86400000), COMBAT_SPEEDUPS.dailyCap);
});

test('1 bis. Attaque réelle sur la carte : victoire méritée → passe-temps, armée écrasante → rien', () => {
  const saved = COMBAT_SPEEDUPS.byDanger[2];
  COMBAT_SPEEDUPS.byDanger[2] = [1, 'speed15'];
  try {
    const run = (n) => {
      const s = createNewState({ seed: 'c2', now: T0 });
      rich(s); s.meta.lastTick = T0;
      const p = Object.values(s.world.pois).find((x) => x.type === 'banditCamp') || Object.values(s.world.pois).find((x) => (x.enemies && Object.keys(x.enemies).length));
      p.danger = 2; p.type = 'banditCamp'; p.enemies = { bandit: 20, banditArcher: 10 }; p.clearedUntil = 0;
      s.army = { knight: n };
      const r = sendMarch(s, { type: 'attack', x: p.x, y: p.y, units: { knight: n } }, T0);
      assert.ok(r.ok, r.reason);
      const before = both(s, 'speed15');
      const merit = armyPower(p.enemies) / armyPower({ knight: n });
      advance(s, T0 + 6 * H);
      return { gained: both(s, 'speed15') - before, merit, won: s.stats.battlesWon };
    };
    const fair = run(12);
    assert.equal(fair.won, 1);
    assert.ok(fair.merit >= COMBAT_SPEEDUPS.minMerit, `mérite ${fair.merit}`);
    assert.equal(fair.gained, 1);
    const crush = run(1000);
    assert.equal(crush.won, 1);
    assert.ok(crush.merit < COMBAT_SPEEDUPS.minMerit);
    assert.equal(crush.gained, 0);
  } finally { COMBAT_SPEEDUPS.byDanger[2] = saved; }
});

test('2. Objectif d’événement : passe-temps affichés et versés une seule fois', () => {
  const s = createNewState({ seed: 'ev', now: T0 });
  const key = Object.keys(LIVE_EVENTS)[0];
  startEvent(s, key, T0);
  const cur = liveState(s).current;
  const o = LIVE_EVENTS[key].objectives[0];
  // Premier objectif : deux sabliers de 15 min (de recrutement si l'objectif est militaire, comme « vaincre des camps »)
  const [[k, n]] = Object.entries(o.reward.speedups);
  assert.ok(['speed15', 'rspeed15'].includes(k) && n === 2);
  cur.stats[o.stat] = o.target;
  const before = speedupCount(s, k);
  const r = claimObjective(s, o.id, T0);
  assert.ok(r.ok);
  assert.match(r.text, /15 min/);
  assert.equal(speedupCount(s, k), before + 2);
  assert.equal(claimObjective(s, o.id, T0).ok, false);
  assert.equal(speedupCount(s, k), before + 2);
});

test('4 et 5. Un passe-temps réduit exactement le temps restant d’un chantier en cours', () => {
  const { s, q } = longJob();
  const left = q.end - T0;
  assert.ok(left > H);
  const n = speedupCount(s, 'speed15');
  const r = applySpeedup(s, q.id, { item: 'speed15' }, T0);
  assert.ok(r.ok, r.reason);
  assert.equal(q.end - T0, left - 15 * MIN);
  assert.equal(r.after, left - 15 * MIN);
  assert.equal(speedupCount(s, 'speed15'), n - 1);
  assert.ok(q.end > T0, 'jamais de temps négatif');
});

test('6. Impossible d’utiliser un passe-temps sans en posséder (rien n’est modifié)', () => {
  const { s, q } = longJob();
  s.inventory.consumables.speed60 = 0;
  const end = q.end;
  const r = applySpeedup(s, q.id, { item: 'speed60' }, T0);
  assert.equal(r.ok, false);
  assert.match(r.reason, /Aucun/);
  assert.equal(q.end, end);
  assert.equal(s.inventory.consumables.speed60, 0);
});

test('7 et 9. Chantier terminé : aucune accélération possible, aucune double consommation', () => {
  const s = createNewState({ seed: 'fin', now: T0 });
  rich(s); th(s).level = 4; s.meta.lastTick = T0;
  assert.ok(startUpgrade(s, th(s).id, T0).ok);
  const q = s.queues.build[0];
  const left = q.end - T0;
  s.inventory.consumables.speed60 = 1;
  const r = applySpeedup(s, q.id, { item: 'speed60' }, T0); // 1 h > temps restant : le chantier se termine
  assert.ok(r.ok && r.done);
  assert.equal(r.removed, left, 'le temps retiré est plafonné au temps restant');
  assert.equal(th(s).level, 5, 'achevé tout de suite par le moteur');
  assert.equal(s.queues.build.length, 0);
  s.inventory.consumables.speed5 = 2;
  const again = applySpeedup(s, q.id, { item: 'speed5' }, T0);
  assert.equal(again.ok, false);
  assert.equal(s.inventory.consumables.speed5, 2, 'rien consommé');
  const gem = applySpeedup(s, q.id, { gems: 'finish' }, T0);
  assert.equal(gem.ok, false);
  // Un chantier qui finit dans quelques secondes refuse les passe-temps (ils seraient gaspillés)
  assert.ok(startUpgrade(s, th(s).id, T0).ok);
  const q2 = s.queues.build[0];
  assert.equal(previewSpeedup(s, q2.id, { item: 'speed5' }, q2.end - 5000).ok, false);
});

test('8. Gemmes : prix exact, refus si insuffisantes, rien dépensé en cas d’échec', () => {
  const { s, q } = longJob();
  const leftMin = Math.ceil((q.end - T0) / MIN);
  assert.equal(gemCostForMinutes(60), 4);
  assert.equal(gemCostForMinutes(10), 1);
  assert.equal(gemCostForMinutes(120), 6);
  const p = previewSpeedup(s, q.id, { gems: 'finish' }, T0);
  assert.equal(p.cost, gemCostForMinutes(leftMin));
  s.resources.gems = p.cost - 1;
  const r = applySpeedup(s, q.id, { gems: 'finish' }, T0);
  assert.equal(r.ok, false);
  assert.match(r.reason, /Gemmes insuffisantes/);
  assert.equal(s.resources.gems, p.cost - 1);
  s.resources.gems = 4;
  const hour = applySpeedup(s, q.id, { gems: 'hour' }, T0);
  assert.ok(hour.ok);
  assert.equal(s.resources.gems, 0);
  assert.equal(hour.removed, H);
});

test('Double récompense : une même clé de récompense n’est jamais payée deux fois', () => {
  const s = createNewState({ seed: 'dup', now: T0 });
  const n = speedupCount(s, 'speed60');
  grantReward(s, { speedups: { speed60: 1 } }, T0, 'quest:x:1');
  grantReward(s, { speedups: { speed60: 1 } }, T0, 'quest:x:1');
  grantSpeedups(s, { speed60: 1 }, '', T0, 'quest:x:1');
  assert.equal(speedupCount(s, 'speed60'), n + 1);
  grantSpeedups(s, { speed60: -5, bogus: 3, speed5: 1.7 }, '', T0);
  assert.equal(speedupCount(s, 'speed60'), n + 1);
});

test('10 et 11. Sauvegarde : inventaire conservé, ancienne sauvegarde migrée, valeurs invalides corrigées', () => {
  const { s } = longJob();
  s.inventory.consumables.speed480 = 2;
  const back = deserialize(serialize(s));
  assert.equal(back.inventory.consumables.speed480, 2);
  assert.ok(back.speedups && back.speedups.earned);
  // Ancienne sauvegarde (avant les passe-temps) : champ absent → ajouté, stock de départ offert une fois
  const old = JSON.parse(serialize(createNewState({ seed: 'old', now: T0 })));
  delete old.speedups; old.inventory.consumables = { healPotion: 2 };
  const mig = deserialize(JSON.stringify(old));
  assert.equal(mig.inventory.consumables.healPotion, 2);
  assert.equal(mig.inventory.consumables.speed5, 3);
  assert.ok(mig.speedups.granted);
  // Sauvegarde mal formée
  const bad = JSON.parse(serialize(createNewState({ seed: 'bad', now: T0 })));
  bad.inventory.consumables.speed60 = -4; bad.inventory.consumables.speed15 = 'abc'; bad.inventory.consumables.speed5 = 2.9;
  bad.speedups.combatToday = 'x';
  const fixed = deserialize(JSON.stringify(bad));
  assert.equal(fixed.inventory.consumables.speed60, 0);
  assert.equal(fixed.inventory.consumables.speed15, 0);
  assert.equal(fixed.inventory.consumables.speed5, 2);
  assert.equal(fixed.speedups.combatToday, 0);
});

test('12. Hors ligne : un chantier accéléré se termine au bon moment pendant l’absence', () => {
  const { s, q } = longJob('off');
  const lvl = th(s).level;
  const left = q.end - T0;
  s.inventory.consumables.speed60 = 2;
  applySpeedup(s, q.id, { item: 'speed60' }, T0);
  applySpeedup(s, q.id, { item: 'speed60' }, T0);
  const end = q.end;
  assert.equal(end, T0 + left - 2 * H);
  // Absence plus courte que le reste : toujours en cours
  advance(s, end - MIN);
  assert.equal(th(s).level, lvl);
  // Retour après la fin : achevé exactement une fois
  advance(s, end + 3 * H);
  assert.equal(th(s).level, lvl + 1);
  assert.equal(s.queues.build.length, 0);
  assert.equal(speedupState(s).minutesSaved, 120);
});
