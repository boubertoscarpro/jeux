// Seigneurs de la Brèche : placement, attaques, victoires, défaites, seuils, compositions évolutives,
// récompenses, protections anti-abus, sauvegarde.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createNewState } from '../src/core/state.js';
import { serialize, deserialize } from '../src/core/save.js';
import { advance } from '../src/core/engine.js';
import { rng, mulberry32 } from '../src/core/rng.js';
import { sendMarch } from '../src/systems/marches.js';
import { armyPower } from '../src/systems/army.js';
import { ensureBreach, breachForts, breachDefense, breachComposition, roleShares, onBreachBattle, nextStep, breachState } from '../src/systems/breach.js';
import { BREACH_PROGRESS, BREACH_MIN_MERIT, BREACH_MAX_LEVEL, tierOf, BREACH_SITES } from '../src/data/breach.js';
import { speedupCount } from '../src/systems/speedups.js';
import { questTick as questlineTick } from '../src/systems/questlines.js';

const T0 = Date.UTC(2026, 6, 1, 8);
const H = 3600000, MIN = 60000;
function world(seed = 'br') {
  const s = createNewState({ seed, now: T0 });
  s.meta.lastTick = T0;
  ensureBreach(s, T0);
  return s;
}
const fortAt = (s, level) => breachForts(s).find((p) => p.breach.level === level);
// Armée de chevaliers dimensionnée pour une puissance donnée
const knights = (power) => ({ knight: Math.max(1, Math.round(power / armyPower({ knight: 1 }))) });
// Envoie une attaque et attend le retour
function attack(s, poi, units, t) {
  for (const [u, n] of Object.entries(units)) s.army[u] = (s.army[u] || 0) + n;
  const r = sendMarch(s, { type: 'attack', x: poi.x, y: poi.y, units }, t);
  assert.ok(r.ok, r.reason);
  advance(s, t + 8 * H);
  return r.march;
}

test('Placement : 7 forteresses à distance croissante, niveaux de départ configurés, la première révélée', () => {
  const s = world();
  const forts = breachForts(s);
  assert.equal(forts.length, BREACH_SITES.length);
  assert.deepEqual(forts.map((p) => p.breach.level).sort((a, b) => a - b), BREACH_SITES.map((x) => x.level).sort((a, b) => a - b));
  const first = fortAt(s, 1);
  assert.ok(s.world.revealed[first.y * s.world.size + first.x]);
  assert.equal(ensureBreach(s, T0), 0, 'jamais placées deux fois');
  assert.equal(new Set(forts.map((p) => p.breach.lord)).size, forts.length, 'seigneurs tous différents');
});

test('Paliers et défenses : puissance, murs, formations et commandant progressent', () => {
  const s = world();
  const p = fortAt(s, 1);
  const powers = [], forts = [];
  for (const lvl of [1, 6, 11, 16, 20]) {
    p.breach.level = lvl;
    const D = breachDefense(s, p, T0);
    powers.push(armyPower(D.enemies)); forts.push(D.fort);
    if (lvl >= 16) assert.ok(D.enemies.breachLord >= 1 && D.commander, 'commandant au palier 4');
    else assert.ok(!D.enemies.breachLord);
    if (lvl >= 6) assert.ok(D.enemies.breachLancer > 0, 'lanciers dès le palier 2');
    if (lvl >= 11) assert.ok(D.enemies.breachWarden > 0, 'gardiens dès le palier 3');
  }
  for (let i = 1; i < powers.length; i++) { assert.ok(powers[i] > powers[i - 1] * 1.5); assert.ok(forts[i] > forts[i - 1]); }
  assert.equal(tierOf(1).n, 1); assert.equal(tierOf(6).n, 2); assert.equal(tierOf(11).n, 3); assert.equal(tierOf(16).n, 4);
});

test('Victoire méritée : progression, butin, ruines ; une 2e marche n’obtient rien pendant les ruines', () => {
  rng.setSource(mulberry32(5));
  const s = world('win');
  const p = fortAt(s, 1);
  const D = breachDefense(s, p, T0);
  const units = knights(armyPower(D.enemies) * (1 + D.fort) * 1.8); // mérite ≈ 0,55
  for (const [u, n] of Object.entries(units)) s.army[u] = (s.army[u] || 0) + 2 * n;
  const m1 = sendMarch(s, { type: 'attack', x: p.x, y: p.y, units }, T0);
  const m2 = sendMarch(s, { type: 'attack', x: p.x, y: p.y, units }, T0 + 1000);
  assert.ok(m1.ok && m2.ok);
  const gold0 = s.resources.gold;
  advance(s, T0 + 8 * H);
  const b = p.breach;
  assert.equal(b.wins, 1, 'une seule victoire : la 2e marche trouve la forteresse en ruine');
  assert.equal(b.attacks, 1);
  assert.equal(b.xp, BREACH_PROGRESS.win(0.55));
  assert.ok(s.resources.gold > gold0, 'butin rapporté');
  assert.ok(p.clearedUntil > T0, 'ruines');
  assert.equal(s.stats.breachWins, 1);
  assert.ok(breachState(s).firstTier[1], 'première victoire de palier enregistrée');
  rng.setSource(Math.random);
});

test('Seuils : la forteresse monte d’un niveau au seuil de points, et l’explique', () => {
  const s = world();
  const p = fortAt(s, 1), b = p.breach;
  const res = { winner: 'attacker', defRemaining: {}, attLosses: {} };
  let evolved = [];
  for (let i = 0; i < 2; i++) { p.clearedUntil = 0; evolved = onBreachBattle(s, p, res, { merit: 1, units: { knight: 10 }, sentCount: 10, lost: 0 }, T0 + i * H).evolved; }
  assert.equal(b.xp, 20 - BREACH_PROGRESS.need(1), 'le surplus est conservé');
  // need(1) = 14 : deux victoires (10 + 10) suffisent ; le surplus est conservé
  assert.equal(b.level, 2);
  assert.ok(b.changes[0].text.includes('niveau 2'));
  assert.ok(nextStep(b).text.startsWith('Niveau 3'));
  assert.ok(evolved.length === 0 || evolved[0].includes('niveau'));
});

test('Défaite : un peu de progression (une fois par demi-heure), garnison affaiblie puis restaurée', () => {
  const s = world();
  const p = fortAt(s, 1), b = p.breach;
  const full = breachComposition(b);
  const res = { winner: 'defender', defRemaining: { breachRaider: 3 }, attLosses: { knight: 5 } };
  onBreachBattle(s, p, res, { merit: 0.8, units: { knight: 5 }, sentCount: 5, lost: 5 }, T0);
  assert.equal(b.xp, BREACH_PROGRESS.loss);
  onBreachBattle(s, p, res, { merit: 0.8, units: { knight: 5 }, sentCount: 5, lost: 5 }, T0 + 5 * MIN);
  assert.equal(b.xp, BREACH_PROGRESS.loss, 'deuxième défaite trop rapprochée : rien');
  assert.deepEqual(breachDefense(s, p, T0 + 10 * MIN).enemies, { breachRaider: 3 });
  assert.deepEqual(breachDefense(s, p, T0 + 30 * MIN).enemies, full);
  assert.equal(b.losses, 2);
});

test('Anti-abus : armée écrasante ou attaque suicide → aucune évolution ni passe-temps, butin réduit', () => {
  rng.setSource(mulberry32(9));
  const s = world('abuse');
  const p = fortAt(s, 1);
  const D = breachDefense(s, p, T0);
  const sp0 = Object.values(s.inventory.consumables).reduce((a, b) => a + b, 0);
  attack(s, p, knights(armyPower(D.enemies) * 20), T0); // mérite ≈ 0,06
  assert.equal(p.breach.wins, 1);
  assert.equal(p.breach.xp, 0);
  assert.equal(p.breach.ignored, 1);
  assert.equal(Object.values(s.inventory.consumables).reduce((a, b) => a + b, 0), sp0, 'aucun passe-temps');
  assert.ok(p.breach.lastRewards && !p.breach.lastRewards.worthy);
  // Poignée de soldats envoyée au massacre : défaite ignorée
  p.clearedUntil = 0;
  attack(s, p, { spearman: 1 }, T0 + 9 * H);
  assert.equal(p.breach.losses, 1);
  assert.equal(p.breach.xp, 0);
  assert.equal(p.breach.ignored, 2);
  rng.setSource(Math.random);
});

test('Adaptation : battue par la cavalerie, la forteresse renforce ses contre-unités', () => {
  const s = world();
  const p = fortAt(s, 1), b = p.breach;
  b.level = 12; b.doctrine = 'archers';
  const before = roleShares(b).warden;
  const res = { winner: 'attacker', defRemaining: {}, attLosses: {} };
  for (let i = 0; i < 3; i++) { p.clearedUntil = 0; onBreachBattle(s, p, res, { merit: 0.9, units: { knight: 100 }, sentCount: 100, lost: 2 }, T0 + i * H); }
  assert.ok(b.seen.cavalry > 0.5);
  assert.ok(roleShares(b).warden > before + 0.1, `gardiens ${before} → ${roleShares(b).warden}`);
});

test('Niveau maximal : une victoire méritée réorganise la forteresse (niveau 16, autre doctrine, cycle +1)', () => {
  const s = world();
  const p = fortAt(s, 16), b = p.breach;
  b.level = BREACH_MAX_LEVEL; const doc = b.doctrine;
  onBreachBattle(s, p, { winner: 'attacker', defRemaining: {}, attLosses: {} }, { merit: 1, units: { knight: 1000 }, sentCount: 1000, lost: 10 }, T0);
  assert.equal(b.level, 16);
  assert.notEqual(b.doctrine, doc);
  assert.equal(b.cycle, 1);
  assert.ok(p.clearedUntil >= T0 + 12 * H, 'longue reconstruction');
});

test('Récompenses : passe-temps du palier 4 et bonus de premier palier versés une seule fois', () => {
  rng.setSource(mulberry32(3));
  const s = world('rew');
  const p = fortAt(s, 16);
  const D = breachDefense(s, p, T0);
  const units = knights(armyPower(D.enemies) * (1 + D.fort) * 2.2);
  const n480 = speedupCount(s, 'speed480'), n60 = speedupCount(s, 'speed60');
  attack(s, p, units, T0);
  assert.equal(p.breach.wins, 1, 'armée à la mesure du palier 4 : victoire');
  {
    assert.ok(speedupCount(s, 'speed60') >= n60 + 1, 'sceau garanti au palier 4');
    assert.ok(speedupCount(s, 'speed480') >= n480 + 1, 'parchemin du premier palier 4');
    const after = speedupCount(s, 'speed480');
    p.clearedUntil = 0; p.breach.level = 16;
    attack(s, p, units, T0 + 20 * H);
    assert.ok(speedupCount(s, 'speed480') - after <= 1, 'le bonus de premier palier ne revient pas');
  }
  rng.setSource(Math.random);
});

test('Quête « Les Seigneurs de la Brèche » : les étapes suivent les statistiques réelles', () => {
  const s = world();
  s.stats.battlesWon = 3;
  Object.values(s.city.buildings).find((b) => b.type === 'townhall').level = 3;
  questlineTick(s, T0);
  assert.ok(s.questlines.active.mil_breach, 'quête ouverte');
  fortAt(s, 1).scouted = true;
  questlineTick(s, T0 + MIN);
  assert.ok(s.questlines.active.mil_breach.done[0]);
});

test('Sauvegarde : forteresses, niveaux, historique et statistiques conservés ; ancienne sauvegarde → placées', () => {
  const s = world();
  const p = fortAt(s, 2);
  p.breach.xp = 7; p.breach.history.push({ t: T0, win: true, level: 2, merit: 0.5, sent: 10, lost: 1 });
  const back = deserialize(serialize(s));
  const q = breachForts(back).find((x) => x.breach.id === p.breach.id);
  assert.equal(q.breach.xp, 7);
  assert.equal(q.breach.history.length, 1);
  // Ancienne sauvegarde sans la Brèche : placée au premier tic du monde
  const old = JSON.parse(serialize(createNewState({ seed: 'old', now: T0 })));
  delete old.breach;
  const mig = deserialize(JSON.stringify(old));
  mig.meta.lastTick = T0;
  advance(mig, T0 + 2 * MIN);
  assert.equal(breachForts(mig).length, BREACH_SITES.length);
});

test('Mérite : seuil commun avec la fiche (30 %)', () => {
  assert.equal(BREACH_MIN_MERIT, 0.3);
});
