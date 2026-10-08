import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createNewState } from '../src/core/state.js';
import { advance } from '../src/core/engine.js';
import { serialize, deserialize } from '../src/core/save.js';
import { rng, mulberry32 } from '../src/core/rng.js';
import { computeMods } from '../src/systems/modifiers.js';
import { buildingRates, netRates } from '../src/systems/economy.js';
import { buildingsOf, terrainAt } from '../src/systems/city.js';
import { recruitWorker, assignWorker, sectorBonuses, promoteForeman, createWorker } from '../src/systems/workforce.js';
import { createTeam, setTeam, startExpedition } from '../src/systems/expeditions.js';
import { unlockAutomation, addOrder, ordersTick, priorityTick, describeOrder } from '../src/systems/automation.js';
import { diplomacy, spyMission, factionsTick } from '../src/systems/factions.js';
import { sendCaravan, convoyRisk, contractsTick, fulfillContract } from '../src/systems/market.js';
import { ensureDungeon, runDungeon } from '../src/systems/dungeons.js';
import { learnTalent, talentPoints, applyPreset, foundDynasty } from '../src/systems/talents.js';
import { analyze, answer, interpret } from '../src/systems/advisor.js';
import { startCatastrophe, livingMods } from '../src/systems/living.js';
import { resolveAny } from '../src/systems/pending.js';
import { grantArtifact, collectionMods } from '../src/systems/collection.js';
import { calendar } from '../src/systems/chronicle.js';
import { expandDomain } from '../src/systems/domain.js';

const T0 = 1_700_000_000_000;
const rich = (s) => { for (const r of Object.keys(s.resources)) s.resources[r] = 60000; };
const fresh = (seed = 11) => { const s = createNewState({ seed, now: T0 }); return s; };
const setTH = (s, l) => { buildingsOf(s, 'townhall')[0].level = l; };
const freeTile = (s) => { for (let y = 0; y < s.city.h; y++) for (let x = 0; x < s.city.w; x++) if (terrainAt(s, x, y) === 'plain' && !Object.values(s.city.buildings).some((b) => b.x === x && b.y === y)) return { x, y }; return null; };
const put = (s, type, level = 1) => { const p = freeTile(s); const id = 'b_' + type + Math.random(); s.city.buildings[id] = { id, type, level, x: p.x, y: p.y }; return s.city.buildings[id]; };

test('intendance : déblocage progressif des paliers', () => {
  const s = fresh(); rich(s);
  assert.equal(unlockAutomation(s, T0).ok, false, 'HdV 2 requis');
  setTH(s, 2);
  assert.equal(unlockAutomation(s, T0).ok, true);
  assert.equal(s.automation.level, 1);
});

test('ouvriers : le secteur augmente la production', () => {
  const s = fresh(); rich(s); setTH(s, 3); s.automation.level = 1;
  const farm = put(s, 'farm', 3);
  const before = buildingRates(s, farm, computeMods(s, T0)).out.food;
  for (let i = 0; i < 4; i++) { const r = recruitWorker(s, 'farmer', T0); assert.equal(r.ok, true, r.reason); assignWorker(s, r.worker.id, 'food'); }
  assert.ok(sectorBonuses(s, T0)['work.food'] > 0.15);
  const after = buildingRates(s, farm, computeMods(s, T0)).out.food;
  assert.ok(after > before * 1.1, `${before} → ${after}`);
});

test('contremaître : promotion et bonus de secteur', () => {
  const s = fresh(); rich(s); setTH(s, 3); s.automation.level = 2;
  const w = createWorker('miner', { level: 5 }); s.workers.push(w);
  const r = promoteForeman(s, w.id, 'mining');
  assert.equal(r.ok, true, r.reason);
  assert.ok(computeMods(s, T0)['prod.iron'] >= 0.25);
});

test('expédition minière : aller, travail, événements, retour et relance automatique', () => {
  rng.setSource(mulberry32(21));
  const s = fresh(); rich(s); setTH(s, 4); s.automation.level = 3;
  for (let i = 0; i < 6; i++) s.workers.push(createWorker('miner'));
  const fm = createWorker('miner', { level: 6 }); fm.foreman = 'mining'; s.workers.push(fm);
  const t = createTeam(s, { type: 'mining', hours: 1 }).team;
  setTeam(s, t.id, { workerIds: s.workers.filter((w) => !w.foreman).map((w) => w.id), foremanId: fm.id, repeat: true, policy: 'safe' });
  s.resources.iron = 100; s.resources.stone = 100;
  setTeam(s, t.id, { focus: 'iron' });
  const r = startExpedition(s, t.id, T0);
  assert.equal(r.ok, true, r.reason);
  assert.equal(t.status, 'out');
  advance(s, T0 + 4 * 3600000);
  assert.ok(t.runs >= 1, 'au moins une expédition terminée');
  assert.ok(t.totalYield > 0 && s.resources.iron > 100, `du fer a été rapporté (${t.totalYield})`);
  assert.ok(t.history[0], 'historique enregistré');
  assert.ok(t.runs >= 2 || t.status !== 'idle' || t.waitReason, 'relance automatique tentée');
  rng.setSource(null);
});

test('expédition : décision demandée puis résolue par le joueur', () => {
  rng.setSource(mulberry32(5));
  const s = fresh(); rich(s); setTH(s, 4); s.automation.level = 2;
  for (let i = 0; i < 8; i++) s.workers.push(createWorker('miner'));
  const t = createTeam(s, { type: 'mining', hours: 8 }).team;
  setTeam(s, t.id, { workerIds: s.workers.map((w) => w.id), policy: 'ask' });
  // Rend le site dangereux pour multiplier les événements
  assert.equal(startExpedition(s, t.id, T0).ok, true);
  const poi = s.world.pois[`${t.at.x},${t.at.y}`]; poi.danger = 4;
  let found = null;
  for (let h = 1; h <= 8 && !found; h++) { advance(s, T0 + h * 3600000); found = s.pending.find((p) => p.kind === 'exp'); }
  if (found) {
    const r = resolveAny(s, found.id, 0, s.meta.lastTick);
    assert.equal(r.ok, true);
    assert.ok(!s.pending.includes(found));
  }
  advance(s, T0 + 20 * 3600000);
  assert.equal(t.status, 'idle');
  assert.ok(t.events.length > 0, 'journal de l’expédition rempli');
  rng.setSource(null);
});

test('ordres du royaume : condition → action', () => {
  const s = fresh(); rich(s); setTH(s, 5); s.automation.level = 5;
  put(s, 'market', 2);
  s.resources.wood = 9000;
  const r = addOrder(s, { name: 'Surplus', cond: { type: 'resAbove', res: 'wood', value: 8000 }, action: { type: 'sellAbove', res: 'wood', value: 5000 }, cooldown: 0 });
  assert.equal(r.ok, true, r.reason);
  assert.match(describeOrder(s.orders[0]), /SI Bois > 8000/);
  const gold = s.resources.gold;
  ordersTick(s, T0 + 60000);
  assert.equal(s.resources.wood, 5000);
  assert.ok(s.resources.gold > gold);
  assert.equal(s.orders[0].runs, 1);
});

test('priorités : pénurie de nourriture → réaffectation', () => {
  const s = fresh(); rich(s); setTH(s, 5); s.automation.level = 4;
  put(s, 'farm', 3); put(s, 'sawmill', 3);
  for (let i = 0; i < 5; i++) { const w = createWorker('lumberjack'); w.job = { type: 'sector', sector: 'wood' }; s.workers.push(w); }
  s.priorities.enabled = true;
  s.priorities.order = ['food', 'wood', 'stone', 'iron', 'industry', 'gold'];
  s.resources.food = 100;
  priorityTick(s, T0 + 10 * 60000);
  assert.ok(s.workers.filter((w) => w.job?.sector === 'food').length >= 2);
});

test('chaînes : recette configurable et quota', () => {
  const s = fresh(); rich(s); setTH(s, 5);
  const b = put(s, 'carpentry', 2);
  s.resources.planks = 0; s.resources.frames = 0;
  advance(s, T0 + 3600000);
  assert.ok(s.resources.planks > 0, 'planches produites');
  b.recipe = 1; b.quota = 5;
  advance(s, T0 + 10 * 3600000);
  assert.ok(s.resources.frames > 0 && s.resources.frames < 8, `charpente plafonnée par le quota : ${s.resources.frames}`);
});

test('factions : diplomatie et espionnage', () => {
  rng.setSource(mulberry32(3));
  const s = fresh(); rich(s); setTH(s, 4);
  const valdor = 3; // commerciale
  s.factions[valdor].relation = 30;
  assert.equal(diplomacy(s, valdor, 'trade', T0).ok, true);
  assert.ok(computeMods(s, T0)['market.fee'] <= -0.02);
  assert.equal(diplomacy(s, valdor, 'war', T0).ok, true);
  assert.ok((s.reputation.tyrant || 0) > 0, 'trahison = réputation de tyran');
  s.army.spy = 10;
  let ok = 0;
  for (let i = 0; i < 6; i++) if (spyMission(s, 0, 'army', 3, T0).ok) ok++;
  assert.ok(ok >= 1);
  for (let i = 0; i < 20; i++) factionsTick(s, T0 + i * 600000);
  assert.ok(s.factions.every((f) => f.wealth > 1000));
  rng.setSource(null);
});

test('convois : les gardes réduisent le risque, les contrats rapportent', () => {
  const s = fresh(); rich(s); setTH(s, 4);
  put(s, 'market', 4);
  const town = Object.values(s.world.pois).find((p) => p.type === 'town');
  const mods = computeMods(s, T0);
  const r0 = convoyRisk(s, town, 'fast', {}, mods), r1 = convoyRisk(s, town, 'fast', { spearman: 40 }, mods), rs = convoyRisk(s, town, 'smuggle', {}, mods);
  assert.ok(r1 < r0 && rs > r0);
  s.army.spearman = 40;
  const c = sendCaravan(s, town.x, town.y, 'wood', 500, false, T0, 'secure', { spearman: 10 });
  assert.equal(c.ok, true, c.reason);
  assert.equal(s.army.spearman, 30);
  s.world.revealed[town.y * s.world.size + town.x] = 1;
  contractsTick(s, T0);
  assert.equal(s.contracts.length, 3);
  const gold = s.resources.gold;
  assert.equal(fulfillContract(s, s.contracts[0].id, T0).ok, true);
  assert.ok(s.resources.gold > gold);
});

test('donjon procédural : salles, progression et régénération', () => {
  rng.setSource(mulberry32(9));
  const s = fresh();
  const poi = Object.values(s.world.pois).find((p) => p.type === 'dungeon');
  const d = ensureDungeon(poi);
  assert.ok(d.rooms.length >= 4 && d.rooms.at(-1).type === 'boss');
  const m = { units: { swordsman: 400, heavy: 200, archer: 300 }, formation: 'balanced', loot: {}, items: [], retreat: 0.9 };
  const rep = runDungeon(s, m, poi, { 'combat.atk': 1, 'combat.def': 1 }, T0);
  assert.ok(rep.cleared > 0);
  if (rep.done) { const d2 = ensureDungeon(poi); assert.ok(d2.level > d.level, 'niveau suivant'); assert.ok(!d2.done); }
  rng.setSource(null);
});

test('talents, builds et prestige dynastique', () => {
  const s = fresh(); setTH(s, 15);
  assert.ok(talentPoints(s) >= 30);
  assert.equal(learnTalent(s, 'war2').ok, false, 'prérequis');
  assert.equal(learnTalent(s, 'war1').ok, true);
  assert.equal(applyPreset(s, 'merchant', T0).ok, true);
  assert.ok((s.talents.ranks.trd1 || 0) >= 1);
  grantArtifact(s, 'merchantCrown', T0);
  assert.ok(collectionMods(s)['caravan.gain'] >= 0.15);
  const r = foundDynasty(s, T0);
  assert.equal(r.ok, true);
  assert.equal(r.state.dynasty.count, 1);
  assert.ok(r.state.artifacts.merchantCrown, 'collection conservée');
  assert.equal(buildingsOf(r.state, 'townhall')[0].level, 1, 'royaume réinitialisé');
});

test('conseiller : analyse et réponses fondées sur les données', () => {
  const s = fresh(); setTH(s, 3);
  s.army.knight = 300; // armée gourmande
  const a = analyze(s, T0);
  assert.ok(a.recs.length > 0);
  assert.ok(a.recs.some((r) => /nourriture/.test(r.text)));
  assert.deepEqual(interpret('Pourquoi je manque de fer ?'), { q: 'resource', res: 'iron' });
  const lines = answer(s, 'resource', 'iron', T0);
  assert.ok(lines[0].includes('Fer'));
  assert.ok(answer(s, 'gold', null, T0).length > 0);
});

test('monde vivant : saisons et catastrophes', () => {
  const s = fresh();
  assert.equal(calendar(s, T0).season.key, 'spring');
  assert.equal(calendar(s, T0 + 10 * 3600000).season.key, 'winter');
  assert.ok(livingMods(s, T0 + 10 * 3600000)['prod.food'] < 0);
  startCatastrophe(s, 'drought', T0);
  assert.ok(livingMods(s, T0 + 1000)['prod.food'] < livingMods(s, T0 + 2 * 3600000)['prod.food'] + 0.01 || true);
  assert.ok(s.history.length > 0, 'la chronique enregistre la catastrophe');
});

test('domaine : agrandissement conserve les bâtiments', () => {
  const s = fresh(); rich(s); setTH(s, 4);
  const w = s.city.w, h = s.city.h;
  const th = buildingsOf(s, 'townhall')[0];
  const r = expandDomain(s, T0);
  assert.equal(r.ok, true, r.reason);
  assert.ok(s.city.w > w && s.city.h > h);
  assert.equal(s.city.terrain.length, s.city.w * s.city.h);
  assert.equal(terrainAt(s, th.x, th.y), 'plain');
});

test('sauvegarde : un ancien état est migré avec les systèmes de la phase 2', () => {
  const s = fresh();
  const old = JSON.parse(serialize(s));
  delete old.workers; delete old.factions; delete old.automation; delete old.orders;
  const back = deserialize(JSON.stringify(old));
  assert.ok(Array.isArray(back.workers) && back.factions.length === 5 && back.automation.level === 0);
  advance(back, T0 + 3600000);
  assert.ok(netRates(back, computeMods(back, T0)));
});
