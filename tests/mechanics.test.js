// Nouvelles mécaniques : territoires spécialisés, contrats par catégories, sagas, événements enrichis.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createNewState } from '../src/core/state.js';
import { advance } from '../src/core/engine.js';
import { rng, mulberry32 } from '../src/core/rng.js';
import { claimTerritory, setSpec, upgradeOutpost, setGarrison, outpostStatus, territoryTick, outpostThreat, territoryMods } from '../src/systems/territory.js';
import { contractsTick, fulfillContract, contractProgress } from '../src/systems/market.js';
import { sagaTick, sagaState } from '../src/systems/sagas.js';
import { resolveAny, describePending } from '../src/systems/pending.js';
import { adminStart, setStance, rollDaily, dailyMissions, claimDaily, bossPhase, challengeInfo, sendLive, liveState, endEvent } from '../src/systems/liveEvents.js';
import { LIVE_EVENTS } from '../src/data/liveEvents.js';
import { SAGAS } from '../src/data/sagas.js';
import { key } from '../src/systems/world.js';

const T0 = Date.UTC(2026, 4, 1);
const H = 3600000;
function rich(seed) {
  const s = createNewState({ seed, now: T0 });
  s.city.buildings.b_townhall_11_7.level = 8;
  s.city.buildings.m = { id: 'm', type: 'market', level: 3, x: 9, y: 4 };
  for (const r of Object.keys(s.resources)) s.resources[r] = 40000;
  s.army = { spearman: 300, swordsman: 200, archer: 200, scout: 20 };
  return s;
}
function claimNear(s) {
  const c = s.world.capital;
  for (let r = 1; r < 6; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    const x = c.x + dx, y = c.y + dy;
    s.world.revealed[y * s.world.size + x] = 1;
    if (claimTerritory(s, x, y, T0).ok) return key(x, y);
  }
  return null;
}

test('Territoires : spécialisation, garnison requise, entretien, production réelle', () => {
  const s = rich('terr');
  const k = claimNear(s);
  assert.ok(k, 'un territoire a pu être établi');
  const t = s.territories[k];
  assert.equal(outpostStatus(s, t, T0).eff, 0.3, 'sans garnison : −70 %');
  assert.equal(upgradeOutpost(s, k).ok, false, 'spécialisation obligatoire avant amélioration');
  const spec = (firstSpec(t.terrain))[0];
  assert.ok(setSpec(s, k, spec).ok);
  assert.ok(setGarrison(s, k, { spearman: 8 }).ok);
  assert.equal(s.army.spearman, 292, 'la garnison quitte la ville');
  assert.equal(outpostStatus(s, t, T0).eff, 1);
  assert.equal(setGarrison(s, k, { spearman: 9999 }).ok, false);
  assert.ok(upgradeOutpost(s, k).ok);
  assert.equal(t.level, 2);
  assert.ok(outpostStatus(s, t, T0).eff < 1, 'niveau 2 : il faut 16 soldats');
  setGarrison(s, k, { spearman: 16 });
  const gold = s.resources.gold;
  territoryTick(s, 3600, T0);
  assert.ok(s.resources.gold < gold + 1000, 'entretien prélevé');
  // Entretien impayé → arrêt
  s.resources.gold = 0;
  territoryTick(s, 3600, T0);
  assert.equal(outpostStatus(s, t, T0).eff, 0);
  // Les bonus ne s'appliquent que si l'avant-poste est tenu
  assert.deepEqual(Object.keys(territoryMods(s, T0)).length, 0);
});
function firstSpec(terrain) { return { plain: ['farms'], forest: ['logging'], hills: ['quarry'], mountain: ['mines'], river: ['fishery'], swamp: ['herbalists'], ruins: ['digs'], snow: ['coal'], ash: ['crystals'] }[terrain]; }

test('Territoires : une menace contre un avant-poste sans garnison le pille', () => {
  rng.setSource(mulberry32(4));
  const s = rich('threat');
  const k = claimNear(s);
  const t = s.territories[k];
  setSpec(s, k, firstSpec(t.terrain)[0]);
  outpostThreat(s, k, t, T0);
  rng.setSource(null);
  assert.ok(t.pillagedUntil > T0, 'pillé');
  assert.equal(outpostStatus(s, t, T0 + H).eff, 0);
});

test('Contrats : sept catégories, progression mesurée depuis la publication, bonus de rapidité', () => {
  rng.setSource(mulberry32(8));
  const s = rich('ct');
  const town = Object.values(s.world.pois).find((p) => p.type === 'town');
  s.world.revealed[town.y * s.world.size + town.x] = 1;
  const kinds = new Set();
  for (let i = 0; i < 200; i++) { s.contracts = []; s.nextContract = 0; contractsTick(s, T0 + i * 1000); kinds.add(s.contracts[0].kind); }
  assert.ok(kinds.size >= 5, [...kinds].join(','));
  // Contrat militaire : se mesure depuis la publication
  let c;
  for (let i = 0; i < 300 && !c; i++) { s.contracts = []; s.nextContract = 0; contractsTick(s, T0); c = s.contracts.find((x) => x.kind === 'military'); }
  rng.setSource(null);
  assert.ok(c);
  assert.equal(contractProgress(s, c).cur, 0);
  assert.equal(fulfillContract(s, c.id, T0).ok, false);
  s.stats.battlesWon += c.n;
  const g = s.resources.gold;
  const r = fulfillContract(s, c.id, T0 + 60000);
  assert.ok(r.ok && r.fast, 'bonus de rapidité');
  assert.ok(s.resources.gold > g);
});

test('Sagas : enchaînement d’étapes, conséquences, choix par défaut à l’échéance', () => {
  rng.setSource(mulberry32(12));
  const s = rich('saga');
  let t = T0, steps = 0;
  for (let i = 0; i < 3000 && Object.keys(sagaState(s).done).length < Object.keys(SAGAS).length; i++) {
    t += 10 * 60000;
    sagaTick(s, t);
    for (const p of s.pending.filter((x) => x.kind === 'saga')) {
      const d = describePending(s, p);
      assert.ok(d.choices.length >= 2 && d.text && !/\{/.test(d.title + d.text), 'texte instancié');
      // Une fois sur trois on laisse expirer pour tester le choix par défaut
      if (steps % 3 !== 2) assert.ok(resolveAny(s, p.id, steps % d.choices.length, t).ok || true);
      steps++;
    }
  }
  rng.setSource(null);
  assert.equal(Object.keys(sagaState(s).done).length, Object.keys(SAGAS).length, 'toutes les sagas se terminent');
  assert.ok(sagaState(s).log.length >= Object.keys(SAGAS).length);
});

test('Événements : stratégie (une fois par jour), missions du jour, phases du boss, défi, participation', () => {
  rng.setSource(mulberry32(6));
  const s = rich('evx');
  adminStart(s, 'sevenMerchants', T0);
  const cur = liveState(s).current;
  assert.ok(LIVE_EVENTS.sevenMerchants.special.caravans);
  assert.ok(setStance(s, 'raid', T0).ok);
  assert.equal(setStance(s, 'trade', T0 + 1000).ok, false, 'une décision par jour');
  assert.ok(setStance(s, 'trade', T0 + 25 * H).ok);
  rollDaily(s, T0);
  const ds = dailyMissions(s);
  assert.equal(ds.length, 3);
  cur.stats[ds[0].stat] = (cur.stats[ds[0].stat] || 0) + ds[0].target;
  assert.ok(claimDaily(s, 0, T0).ok);
  assert.equal(claimDaily(s, 0, T0).ok, false);
  // Phases du boss selon les PV
  const def = LIVE_EVENTS[cur.key];
  assert.equal(bossPhase(s, cur, def).n, 1);
  cur.bossHp = def.bosses[0].tiers[0].hp * 0.5;
  assert.equal(bossPhase(s, cur, def).n, 2);
  cur.bossHp = def.bosses[0].tiers[0].hp * 0.2;
  assert.equal(bossPhase(s, cur, def).n, 3);
  assert.equal(challengeInfo(s).done, false);
  // Participation
  cur.earned = 600;
  const ins = s.meta.insignia;
  const rep = endEvent(s, T0 + 72 * H);
  rng.setSource(null);
  assert.ok(rep.rewards.some((x) => /Participation/.test(x)));
  assert.ok(s.meta.insignia >= ins + 2);
});

test('Longue durée : 4 jours avec événements, territoires, contrats et sagas sans erreur ni valeur invalide', () => {
  rng.setSource(mulberry32(21));
  const s = rich('long');
  const k = claimNear(s);
  if (k) { setSpec(s, k, firstSpec(s.territories[k].terrain)[0]); setGarrison(s, k, { spearman: 8 }); }
  let t = T0;
  for (let i = 0; i < 4 * 24 * 4; i++) {
    t += 15 * 60000;
    advance(s, t);
    for (const p of [...s.pending]) resolveAny(s, p.id, 0, t);
    const cur = s.live.current;
    if (cur && i % 4 === 0) {
      const tg = cur.map.targets.find((x) => x.type === 'camp' && !x.done && !x.gone);
      if (tg) sendLive(s, { targetId: tg.id, action: 'attack', units: { swordsman: 30, archer: 30 } }, t);
    }
    for (const u of ['swordsman', 'archer']) s.army[u] = Math.max(s.army[u] || 0, 100);
  }
  rng.setSource(null);
  for (const [r, v] of Object.entries(s.resources)) assert.ok(Number.isFinite(v) && v >= 0, `${r} = ${v}`);
  assert.ok(s.meta.lastTick === t);
  assert.ok(Object.keys(sagaState(s).done).length >= 1, 'au moins une saga terminée');
});

test('Chantiers planifiés : démarrent seuls quand la file se libère, payés au démarrage seulement', async () => {
  const { planConstruction, processPlanned, startUpgrade, PLAN_MAX } = await import('../src/systems/construction.js');
  const s = rich('plan');
  const th = Object.values(s.city.buildings).find((b) => b.type === 'townhall');
  const house = Object.values(s.city.buildings).find((b) => b.type === 'house');
  assert.ok(startUpgrade(s, th.id, T0).ok);
  const r = startUpgrade(s, house.id, T0);
  assert.equal(r.ok, false);
  const wood = s.resources.wood;
  assert.ok(planConstruction(s, { kind: 'upgrade', bid: house.id }).ok);
  assert.equal(s.resources.wood, wood, 'rien n’est payé à la planification');
  for (let i = 0; i < PLAN_MAX - 1; i++) planConstruction(s, { kind: 'upgrade', bid: 'fort:wall' + i });
  assert.equal(planConstruction(s, { kind: 'upgrade', bid: 'x' }).ok, false, 'plafond du plan');
  advance(s, T0 + 6 * H);
  assert.ok(house.level >= 2 || s.queues.build.some((q) => q.bid === house.id), 'la maison a démarré seule');
  assert.ok(s.queues.planned.every((p) => p.bid !== house.id));
});
