// Non-régression des bugs confirmés par l'audit (économie, combats, sauvegardes). Chaque test reproduit le cas
// d'origine et vérifie le comportement corrigé.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createNewState } from '../src/core/state.js';
import { serialize, deserialize } from '../src/core/save.js';
import { advance } from '../src/core/engine.js';
import { rng, mulberry32 } from '../src/core/rng.js';
import { startBuild, cancelBuild, startUpgrade } from '../src/systems/construction.js';
import { campaignTick, claimMission, campaignState } from '../src/systems/campaign.js';
import { missionState, claimDynMission } from '../src/systems/missions.js';
import { startSurprise, buyFair, startEvent, sendLive, recallLive, processLiveMarches } from '../src/systems/liveEvents.js';
import { LIVE_EVENTS } from '../src/data/liveEvents.js';
import { storageCap } from '../src/systems/economy.js';
import { computeMods } from '../src/systems/modifiers.js';
import { buy, sell, MIN_TRADE_GOLD } from '../src/systems/market.js';
import { train, cancelTrain } from '../src/systems/army.js';
import { diplomacy, playerPower, factionPower } from '../src/systems/factions.js';
import { sendMarch, processMarch, marchNextTime } from '../src/systems/marches.js';
import { ensureDungeon } from '../src/systems/dungeons.js';
import { startCampaign, launchOp, warTick, OPS, warState } from '../src/systems/warcampaign.js';
import { createHero } from '../src/systems/heroes.js';
import { autoDefense } from '../src/systems/automation.js';

const T0 = Date.UTC(2026, 2, 1, 9);
const H = 3600000;
const th = (s) => Object.values(s.city.buildings).find((b) => b.type === 'townhall');
function base(seed = 'audit') {
  const s = createNewState({ seed, now: T0 });
  s.city.buildings.mk = { id: 'mk', type: 'market', level: 3, x: 9, y: 4 };
  th(s).level = 6;
  return s;
}
const freeSpot = (s, type) => { for (let y = 0; y < s.city.h; y++) for (let x = 0; x < s.city.w; x++) { const r = startBuild(s, type, x, y, T0); if (r.ok) return { x, y }; } return null; };

test('Missions « construire » : lancer puis annuler un chantier ne valide plus rien', () => {
  const s = base();
  for (const b of Object.values(s.city.buildings)) if (b.type === 'sawmill') delete s.city.buildings[b.id];
  Object.assign(s.resources, { wood: 5000, stone: 5000, gold: 5000 });
  assert.ok(freeSpot(s, 'sawmill'));
  campaignTick(s, T0);
  cancelBuild(s, s.queues.build[0].id);
  assert.ok(!campaignState(s).done.q_saw);
  assert.equal(claimMission(s, 'q_saw', T0).ok, false);
  const M = missionState(s);
  M.active.push({ id: 'ms_x', tpl: 'newbuild', title: 'x', icon: 'x', kind: 'count', params: { type: 'barracks' }, target: 1, reward: { res: { gold: 200 } }, at: T0, expires: T0 + 86400000 });
  Object.assign(s.resources, { wood: 5000, stone: 5000, gold: 5000, iron: 5000 });
  assert.ok(freeSpot(s, 'barracks'));
  cancelBuild(s, s.queues.build[0].id);
  assert.equal(claimDynMission(s, 'ms_x', T0).ok, false);
});

test('Grande Foire : entrepôt plein → échange refusé AVANT paiement', () => {
  const s = base();
  const cap = storageCap(s, computeMods(s, T0), 'iron');
  s.resources.wood = 5000; s.resources.iron = cap * 1.5;
  startSurprise(s, 'fair', T0);
  const r = buyFair(s, 'f1', T0 + 1000);
  assert.equal(r.ok, false);
  assert.equal(s.resources.wood, 5000);
});

test('Marche d’événement rappelée avant d’agir : ce qui a été payé est rendu', () => {
  const s = base();
  const key = Object.keys(LIVE_EVENTS).find((k) => LIVE_EVENTS[k].map.targets.some((t) => t.type === 'village'));
  const cur = startEvent(s, key, T0);
  s.army.spearman = 100; s.resources.food = 5000;
  const v = cur.map.targets.find((t) => t.type === 'village');
  const r = sendLive(s, { action: 'deliver', targetId: v.id, units: { spearman: 1 } }, T0);
  assert.ok(r.ok && r.march.paid);
  assert.ok(s.resources.food < 5000);
  recallLive(s, r.march.id, T0 + 1000);
  processLiveMarches(s, T0 + H);
  assert.equal(s.resources.food, 5000);
});

test('Marché : revendre efface l’origine « achetée » ; une vente minuscule n’est pas une transaction', () => {
  const s = base();
  s.resources.gold = 100000; s.resources.iron = 0;
  assert.ok(buy(s, 'iron', 1000, T0).ok);
  assert.ok(sell(s, 'iron', 1000, T0).ok);
  assert.ok(!s.market.bought?.iron);
  const n = s.stats.trades;
  s.resources.wood = 10;
  for (let i = 0; i < 4; i++) sell(s, 'wood', 1, T0);
  assert.equal(s.stats.trades, n, `moins de ${MIN_TRADE_GOLD} or : non compté`);
});

test('Formation annulée : le compteur de soldats formés revient en arrière', () => {
  const s = base();
  s.city.buildings.br = { id: 'br', type: 'barracks', level: 3, x: 1, y: 1 };
  Object.assign(s.resources, { food: 50000, wood: 50000, iron: 50000, gold: 50000 });
  const before = s.stats.trained || 0;
  assert.ok(train(s, 'spearman', 10, T0).ok);
  cancelTrain(s, s.queues.train[0].id, T0);
  assert.equal(s.stats.trained, before);
});

test('Diplomatie : un ultimatum ou une paix refusés ne se retentent pas aussitôt', () => {
  rng.setSource(mulberry32(3));
  const s = createNewState({ seed: 'trib', now: T0 });
  const f = s.factions[4];
  s.army = { swordsman: 1 };
  while (playerPower(s) / factionPower(s, f) < 1.32) s.army.swordsman++;
  let ok = 0;
  for (let i = 0; i < 50; i++) if (diplomacy(s, 4, 'tribute', T0 + i).ok) ok++;
  assert.ok(ok <= 1);
  assert.ok((s.reputation.tyrant || 0) <= 10, 'la réputation de tyran ne se farme plus');
  rng.setSource(Math.random);
});

test('Exploration : retourner sur des cases déjà révélées ne fait pas monter le compteur', () => {
  const s = createNewState({ seed: 'exp', now: T0 });
  s.meta.lastTick = T0;
  const c = s.world.capital;
  s.army.scout = 5;
  const n = s.stats.explored;
  let t = T0;
  for (let i = 0; i < 4; i++) { const r = sendMarch(s, { type: 'explore', x: c.x + 1, y: c.y, units: { scout: 1 } }, t); assert.ok(r.ok, r.reason); t += H; advance(s, t); }
  assert.equal(s.stats.explored, n);
});

test('Donjon : butin limité par la capacité de transport ; expérience selon les salles de CETTE expédition', () => {
  rng.setSource(mulberry32(11));
  let t = T0;
  const s = createNewState({ seed: 'dg', now: t });
  const w = s.world, c = w.capital, x = c.x + 3, y = c.y;
  w.pois[`${x},${y}`] = { id: 'dg1', type: 'dungeon', x, y, danger: 4, enemies: {}, scouted: true };
  w.revealed[y * w.size + x] = 1;
  const d = ensureDungeon(w.pois[`${x},${y}`]);
  d.rooms = [{ type: 'treasure', done: false }, { type: 'battle', done: true }, { type: 'boss', done: true }];
  s.army = { scout: 1 };
  const m = sendMarch(s, { type: 'dungeon', x, y, units: { scout: 1 }, retreat: 0.99 }, t).march;
  t = marchNextTime(m); processMarch(s, m, t);
  const commons = Object.entries(m.loot).filter(([r]) => !['crystals', 'rareOre', 'gems', 'silver', 'ancientWood'].includes(r)).reduce((a, [, v]) => a + v, 0);
  assert.ok(commons <= 10, `1 éclaireur porte 10 : ${JSON.stringify(m.loot)}`);
  rng.setSource(Math.random);
});

test('Campagne : le héros engagé apporte ses bonus ; la paix bloque les nouvelles opérations', () => {
  const run = (withHero) => {
    rng.setSource(mulberry32(42));
    const s = createNewState({ seed: 'warh', now: T0 });
    th(s).level = 6;
    s.city.buildings.br = { id: 'br', type: 'barracks', level: 5, x: 1, y: 1 };
    const g = createHero({ cls: 'general', rarity: 'legendary', level: 30 }); s.heroes.push(g);
    startCampaign(s, 0, T0);
    s.army = { spearman: 600, archer: 400, knight: 150 };
    assert.ok(launchOp(s, { spearman: 600, archer: 400, knight: 150 }, withHero ? g.id : null, T0).ok);
    rng.setSource(mulberry32(7));
    warTick(s, T0 + OPS.pass.minutes * 60000 * 3);
    return { s, lost: (warState(s).active?.results?.[0] || warState(s).history[0]?.results?.[0]).lost };
  };
  const a = run(false), b = run(true);
  assert.ok(b.lost < a.lost, `pertes ${b.lost} (héros) < ${a.lost}`);
  const s = b.s, f = s.factions.find((x) => x.idx === warState(s).active.faction);
  f.stance = 'truce';
  const r = launchOp(s, { spearman: 10 }, null, T0 + 5 * H);
  assert.equal(r.ok, false);
  rng.setSource(Math.random);
});

test('Défense automatique : à l’annonce d’un raid, les marches qui peuvent rentrer à temps sont rappelées', () => {
  const s = createNewState({ seed: 'def', now: T0 });
  const c = s.world.capital;
  s.army.scout = 2;
  const m = sendMarch(s, { type: 'explore', x: c.x + 3, y: c.y, units: { scout: 1 } }, T0).march;
  s.raids.push({ id: 'r1', name: 'Pillards', army: { bandit: 5 }, arrive: T0 + 2 * H });
  assert.equal(autoDefense(s, T0 + 10000), 1);
  assert.equal(m.phase, 'back');
  assert.equal(autoDefense(s, T0 + 20000), 0, 'pas de double rappel');
});

test('Horloge reculée : les échéances glissent du même écart (rien ne reste figé)', () => {
  const s = base();
  Object.assign(s.resources, { wood: 1e5, stone: 1e5, gold: 1e5, iron: 1e5 });
  s.meta.lastTick = T0;
  assert.ok(startUpgrade(s, th(s).id, T0).ok);
  const q = s.queues.build[0], left = q.end - T0, lvl = th(s).level;
  const back = T0 - 24 * H;
  advance(s, back);
  assert.equal(q.end - back, left);
  advance(s, back + left + 1000);
  assert.equal(th(s).level, lvl + 1);
});

test('Sauvegardes : import sans « démarrage réussi », version texte acceptée, entrées nulles retirées', () => {
  const s = createNewState({ seed: 'imp', now: T0 });
  s.meta.bootOk = true; s.meta.lastBackup = T0;
  const d = JSON.parse(serialize(s));
  d.version = String(d.version);
  d.heroes.push(null); d.buffs = [null]; d.inventory.items.push(null); d.army.dragonfly = 3; d.meta.kingdomName = 1234;
  const r = deserialize(JSON.stringify(d));
  assert.equal(r.meta.bootOk, undefined);
  assert.equal(r.meta.lastBackup, undefined);
  assert.ok(r.heroes.every(Boolean));
  assert.deepEqual(r.buffs, []);
  assert.ok(!('dragonfly' in r.army));
  assert.equal(typeof r.meta.kingdomName, 'string');
  assert.throws(() => deserialize(JSON.stringify({ ...d, version: 'abc' })), /version invalide/);
});
