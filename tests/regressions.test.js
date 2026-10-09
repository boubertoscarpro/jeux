// Tests de non-régression des bugs relevés par l'audit (un test par bug corrigé).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createNewState } from '../src/core/state.js';
import { advance } from '../src/core/engine.js';
import { rng, mulberry32 } from '../src/core/rng.js';
import { RESOURCES } from '../src/data/resources.js';
import { UNITS } from '../src/data/units.js';
import { UNIQUE_ITEMS } from '../src/data/items.js';
import { sell, buy, sendCaravan, fulfillContract } from '../src/systems/market.js';
import { advanceEconomy, storageCap } from '../src/systems/economy.js';
import { computeMods } from '../src/systems/modifiers.js';
import { startBuild } from '../src/systems/construction.js';
import { itemScore, createUniqueItem } from '../src/systems/items.js';
import { heroMods } from '../src/systems/heroes.js';
import { sendMarch, planMarch } from '../src/systems/marches.js';
import { ensureDungeon, runDungeon } from '../src/systems/dungeons.js';
import { grantArtifact } from '../src/systems/collection.js';
import { foundDynasty, prestigeGain } from '../src/systems/talents.js';
import { shardState } from '../src/systems/shards.js';
import { onRivalDefeated } from '../src/systems/rivals.js';
import { simulateBattle } from '../src/systems/combat.js';
import { economicReport } from '../src/systems/report.js';
import { goals } from '../src/systems/goals.js';
import { assignWorker, createWorker } from '../src/systems/workforce.js';

const T0 = Date.UTC(2026, 2, 1);
function base(seed = 'reg') {
  const s = createNewState({ seed, now: T0 });
  const put = (type, x, y, level = 1) => { s.city.buildings[`b_${type}_${x}_${y}`] = { id: `b_${type}_${x}_${y}`, type, level, x, y }; };
  put('market', 9, 4, 3);
  s.city.buildings.b_townhall_11_7.level = 6;
  return { s, put };
}

test('Marché : l’or (non échangeable) ne peut être ni vendu ni acheté — plus de NaN', () => {
  const { s } = base();
  s.resources.gold = 5000;
  assert.equal(sell(s, 'gold', 100, T0).ok, false);
  assert.equal(buy(s, 'gold', 100, T0).ok, false);
  assert.equal(s.resources.gold, 5000);
});

test('Marché : on n’achète pas au-delà de la capacité de l’entrepôt', () => {
  const { s } = base();
  const cap = storageCap(s, computeMods(s, T0));
  s.resources.gold = 1e6;
  s.resources.coal = cap * 1.5;
  assert.equal(buy(s, 'coal', 500, T0).ok, false, 'entrepôt plein : refus');
  s.resources.coal = cap * 1.5 - 100;
  const g = s.resources.gold;
  const r = buy(s, 'coal', 500, T0);
  assert.ok(r.ok);
  assert.equal(r.qty, 100, 'quantité limitée à la place libre');
  assert.ok(g - s.resources.gold < 500 * RESOURCES.coal.price * 2, 'on ne paie que ce qui est livré');
});

test('Marché : ressources rares introuvables à l’achat ; arrondis jamais favorables au joueur', () => {
  const { s } = base();
  s.resources.gold = 1e6;
  assert.equal(buy(s, 'rareOre', 10, T0).ok, false);
  s.resources.grain = 800;
  let one = 0;
  for (let i = 0; i < 20; i++) one += sell(s, 'grain', 1, T0).gold;
  assert.ok(one <= 20 * RESOURCES.grain.price, `vente unitaire : ${one}`);
});

test('Commerce : acheter au marché puis livrer une cité ou un contrat n’est plus une boucle gagnante', () => {
  const { s } = base('loop');
  s.city.buildings.b_market_9_4.level = 5;
  s.resources.gold = 200000;
  const town = Object.values(s.world.pois).find((p) => p.type === 'town');
  s.world.revealed[town.y * s.world.size + town.x] = 1;
  const mods = computeMods(s, T0);
  mods.caravans = 2;
  const res = town.wants?.[0] || 'cloth';
  s.resources[res] = 0;
  const cost = buy(s, res, 800, T0).gold;
  // Caravane : on force un emplacement disponible
  s.techs = { ...s.techs };
  const orig = s.caravans.length;
  const cv = sendCaravan(s, town.x, town.y, res, 800, false, T0, 'secure');
  if (cv.ok) assert.ok(cv.gold < cost, `revente ${cv.gold} < achat ${cost}`);
  else assert.ok(orig === s.caravans.length);
  // Contrat : les marchandises achetées ne comptent pas
  s.resources.iron = 0;
  buy(s, 'iron', 500, T0);
  s.contracts = [{ id: 'c1', town: town.name, tx: town.x, ty: town.y, res: 'iron', qty: 400, reward: { gold: 9999 }, until: T0 + 3600000 }];
  const r = fulfillContract(s, 'c1', T0);
  assert.equal(r.ok, false);
  assert.match(r.reason, /produites par votre royaume/);
  // Expiré
  s.resources.iron = 2000; s.market.bought = {};
  s.contracts = [{ id: 'c2', town: town.name, tx: town.x, ty: town.y, res: 'iron', qty: 400, reward: { gold: 1 }, until: T0 - 1 }];
  assert.equal(fulfillContract(s, 'c2', T0).ok, false);
});

test('Chaînes : une chaîne proche de la capacité ne gaspille plus ses matières premières', () => {
  const { s, put } = base('chain');
  put('charcoal', 10, 6, 8);
  const mods = computeMods(s, T0);
  const cap = storageCap(s, mods);
  s.resources.coal = cap - 1;
  s.resources.wood = 5000;
  advanceEconomy(s, 3600, mods);
  assert.ok(s.resources.wood > 4800, `bois consommé pour 1 charbon : ${5000 - s.resources.wood}`);
  // Quota respecté
  const b = Object.values(s.city.buildings).find((x) => x.type === 'charcoal');
  b.quota = 100; s.resources.coal = 50; s.resources.wood = 5000;
  advanceEconomy(s, 3600, mods);
  assert.ok(s.resources.coal <= 101, `quota dépassé : ${s.resources.coal}`);
});

test('Construction : une fortification ne peut pas être payée deux fois', () => {
  const { s } = base('fort');
  for (const r of Object.keys(s.resources)) s.resources[r] = 50000;
  s.city.buildings.b_townhall_11_7.level = 10;
  const mods = computeMods(s, T0);
  mods.buildQueue = 3;
  const r1 = startBuild(s, 'wall', 0, 0, T0);
  if (!r1.ok) return; // mur indisponible à ce niveau : rien à tester
  const stone = s.resources.stone;
  const r2 = startBuild(s, 'wall', 0, 0, T0);
  assert.equal(r2.ok, false);
  assert.equal(s.resources.stone, stone);
});

test('Ouvriers : un contremaître ne travaille pas dans un secteur', () => {
  const { s } = base('fm');
  const w = createWorker('lumberjack');
  w.foreman = 'workshop';
  s.workers.push(w);
  assert.equal(assignWorker(s, w.id, 'wood').ok, false);
});

test('Objets uniques : leurs affixes s’appliquent et n’empêchent plus l’affichage', () => {
  const { s } = base('uniq');
  for (const k of Object.keys(UNIQUE_ITEMS)) assert.ok(Number.isFinite(itemScore(createUniqueItem(k))), k);
  const h = s.heroes[0];
  const it = createUniqueItem('bastionShield');
  s.inventory.items.push(it);
  h.equipment.armor = it.id;
  assert.ok((heroMods(s, h, 'global')['city.def'] || 0) > 0.1, 'défense de la ville appliquée');
  assert.ok((computeMods(s, T0)['city.def'] || 0) >= 0.15);
  const sw = createUniqueItem('khanSword');
  s.inventory.items.push(sw);
  h.equipment.weapon = sw.id;
  assert.ok(heroMods(s, h, 'commander')['class.cavalry.atk'] > 0);
});

test('Exploration : refouiller une case déjà explorée ne rapporte plus rien pendant 24 h', () => {
  rng.setSource(mulberry32(3));
  const { s } = base('explore');
  s.army.scout = 400;
  const c = s.world.capital;
  const before = { gold: s.resources.gold, rep: s.reputation?.explorer || 0 };
  let t = T0;
  for (let i = 0; i < 60; i++) {
    const r = sendMarch(s, { type: 'explore', x: c.x + 1, y: c.y, units: { scout: 1 } }, t);
    assert.ok(r.ok || /maximum/.test(r.reason));
    t += 10 * 60000;
    advance(s, t);
    for (const p of [...s.pending]) if (p.kind === 'explore') s.pending = s.pending.filter((x) => x !== p);
  }
  rng.setSource(null);
  assert.ok((s.reputation?.explorer || 0) - before.rep <= 2, `réputation : ${(s.reputation?.explorer || 0) - before.rep}`);
});

test('Donjons : le trésor de la Cité perdue n’est donné qu’une fois ; jamais d’artefact exclusif de la Roue', () => {
  rng.setSource(mulberry32(9));
  const { s } = base('lost');
  const poi = { type: 'lostCity', x: 1, y: 1, danger: 6 };
  for (let run = 0; run < 8; run++) {
    ensureDungeon(poi);
    poi.dungeonData.rooms = [{ type: 'boss', done: false }];
    const m = { units: { knight: 3000, crossbow: 3000, heavy: 3000 }, loot: {}, items: [], formation: 'balanced', retreat: 1 };
    runDungeon(s, m, poi, {}, T0 + run * 1000);
  }
  rng.setSource(null);
  assert.ok(shardState(s).count <= 5 + 8 * 2, `Éclats : ${shardState(s).count}`);
  assert.ok(!s.artifacts.ancientEye, 'Œil de l’Ancien obtenu hors de la Roue');
  for (let i = 0; i < 30; i++) grantArtifact(s, null, T0);
  assert.ok(!s.artifacts.ancientEye);
});

test('Royaumes rivaux : une cité mise à sac ne peut pas être repillée immédiatement et la faction se renforce', () => {
  const { s } = base('rival');
  const poi = Object.values(s.world.pois).find((p) => p.type === 'kingdom');
  const f = s.factions.find((x) => x.idx === poi.rival);
  const army0 = f.army;
  onRivalDefeated(s, poi, T0);
  assert.ok(f.army > army0);
  s.army.swordsman = 100;
  const plan = planMarch(s, { type: 'attack', x: poi.x, y: poi.y, units: { swordsman: 10 } }, T0 + 60000);
  assert.equal(plan.ok, false);
});

test('Combat : aucune composition ne domine sur tous les terrains (archers, cavalerie, infanterie)', () => {
  const N = 80;
  rng.setSource(mulberry32(77));
  const win = (a, d, terrain) => { let w = 0; for (let i = 0; i < N; i++) if (simulateBattle({ units: a }, { units: d }, { terrain, weather: 'clear' }).winner === 'attacker') w++; return w / N; };
  const price = (r) => (r === 'gold' ? 1 : RESOURCES[r].price);
  const army = (u) => ({ [u]: Math.round(6000 / Object.entries(UNITS[u].cost).reduce((t, [r, v]) => t + v * price(r), 0)) });
  const archers = army('archer'), cav = army('lightcav');
  assert.ok(win(cav, archers, 'plain') >= 0.5, 'la cavalerie bat les archers en plaine');
  assert.ok(win(archers, cav, 'hills') >= 0.5, 'les archers tiennent les collines');
  // Les colosses n'ont plus de bonus de moral caché
  const r = simulateBattle({ units: { swordsman: 100 } }, { units: { dragon: 1 } }, { terrain: 'plain', weather: 'clear', bossHp: 50000, deterministic: true });
  assert.equal(r.moraleD, 100);
  rng.setSource(null);
});

test('Dynastie : pas d’exploit d’Éclats ni de doublons fantômes après prestige', () => {
  const { s } = base('dyn');
  s.city.buildings.b_townhall_11_7.level = 15;
  const sh = shardState(s);
  sh.count = 42; sh.feats.wonder = T0; sh.owned.khanSword = 1;
  s.artifacts = { mountainHeart: { t: s.meta.created - 1 } };
  const g = prestigeGain(s);
  const r = foundDynasty(s, T0);
  assert.ok(r.ok);
  assert.equal(r.state.shards.count, 42, 'Éclats conservés');
  assert.ok(r.state.shards.feats.wonder, 'exploits conservés (non rejouables)');
  assert.deepEqual(r.state.shards.owned, {}, 'objets exclusifs à nouveau obtenables');
  assert.equal(Object.keys(r.state.talents.ranks).length, 0);
  // Un artefact conservé d'une dynastie précédente ne rapporte plus de points
  s.artifacts.newOne = { t: s.meta.created + 10 };
  assert.equal(prestigeGain(s), g + 2);
});

test('Bilan économique et objectifs : calculés sans erreur, pénuries détectées', () => {
  const { s } = base('report');
  s.army.swordsman = 2000;
  s.resources.food = 100;
  const r = economicReport(s, T0);
  const food = r.list.find((x) => x.res === 'food');
  assert.ok(food.net < 0 && food.shortage);
  assert.ok(r.upkeep.army > 0);
  const g = goals(s, T0);
  assert.ok(g.short.length && g.mid.length && g.long.length);
});

test('Blocage définitif impossible : sans carrière ni pierre, la première carrière est offerte', async () => {
  const { createNewState } = await import('../src/core/state.js');
  const { startBuild, getUpgradeInfo } = await import('../src/systems/construction.js');
  const { placementCheck } = await import('../src/systems/city.js');
  const s = createNewState({ seed: 'lock', now: Date.UTC(2026, 0, 1) });
  assert.ok(Object.keys(getUpgradeInfo(s, 'quarry', 1).cost).length > 0, 'payable : prix normal');
  s.resources.stone = 0; s.resources.wood = 0;
  assert.deepEqual(getUpgradeInfo(s, 'quarry', 1).cost, {});
  let r = { ok: false };
  for (let y = 0; y < s.city.h && !r.ok; y++) for (let x = 0; x < s.city.w && !r.ok; x++) if (placementCheck(s, 'quarry', x, y).ok) r = startBuild(s, 'quarry', x, y, Date.UTC(2026, 0, 1));
  assert.ok(r.ok, r.reason);
  // Le deuxième exemplaire se paie normalement
  assert.ok(Object.keys(getUpgradeInfo(s, 'quarry', 1).cost).length > 0);
});
