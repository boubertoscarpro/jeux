// Événements temporaires : calendrier, rotation, démarrage/fin, monnaie, boutique, cartes et mécaniques propres.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createNewState } from '../src/core/state.js';
import { advance } from '../src/core/engine.js';
import { rng, mulberry32 } from '../src/core/rng.js';
import { serialize, deserialize } from '../src/core/save.js';
import { LIVE_EVENTS, SURPRISE_EVENTS } from '../src/data/liveEvents.js';
import { joinGuild } from '../src/systems/guild.js';
import { GUILDS } from '../src/data/social.js';
import { computeMods } from '../src/systems/modifiers.js';
import { resolveAny } from '../src/systems/pending.js';
import {
  liveState, ensureCalendar, pickNext, adminStart, endEvent, sendLive, actionsFor, isVisible, shopItems, buyShopItem,
  objectives, claimObjective, passInfo, claimPass, leaderboard, startSurprise, liveTick, rollMystery, buyMystery, guildInfo,
} from '../src/systems/liveEvents.js';
import { shardState } from '../src/systems/shards.js';

const H = 3600000;
const T0 = Date.UTC(2026, 0, 5);

function strong(seed = 'ev') {
  const s = createNewState({ seed, now: T0 });
  s.city.buildings.b_townhall_11_7.level = 8;
  s.city.buildings.gh = { id: 'gh', type: 'guildhall', level: 1, x: 9, y: 5 };
  s.army = { spearman: 600, swordsman: 500, archer: 500, knight: 150, scout: 30, catapult: 10 };
  for (const k of Object.keys(s.resources)) s.resources[k] = 60000;
  return s;
}

test('Données : chaque événement est complet (monnaie, carte, objectifs, boutique, guilde)', () => {
  assert.ok(Object.keys(LIVE_EVENTS).length >= 10);
  for (const [k, d] of Object.entries(LIVE_EVENTS)) {
    for (const f of ['name', 'icon', 'tags', 'currency', 'enemies', 'map', 'objectives', 'shop', 'guild', 'special']) assert.ok(d[f], `${k}.${f}`);
    assert.ok(d.currency.convert.amount > 0);
    assert.ok(d.shop.fixed.some((i) => i.exclusive), `${k} : objet exclusif`);
    assert.ok(d.shop.fixed.some((i) => i.give.shards && i.global), `${k} : Éclat en stock serveur limité`);
  }
  assert.ok(LIVE_EVENTS.steppes.special.caravans && LIVE_EVENTS.steppes.bosses[0].tiers.length === 4);
  assert.equal(Object.keys(SURPRISE_EVENTS).length, 4);
});

test('Rotation : pas de répétition récente ni de thèmes enchaînés, ordre jamais identique', () => {
  rng.setSource(mulberry32(7));
  const s = createNewState({ seed: 'rot', now: T0 });
  const orders = [];
  for (let run = 0; run < 5; run++) {
    const seq = [];
    for (let i = 0; i < 30; i++) {
      const k = pickNext(s, seq);
      const prev = seq[seq.length - 1];
      if (prev) {
        assert.ok(!LIVE_EVENTS[k].tags.some((t) => LIVE_EVENTS[prev].tags.includes(t)), `${prev} → ${k}`);
        assert.ok(!seq.slice(-4).includes(k), `${k} répété trop tôt`);
      }
      seq.push(k);
    }
    orders.push(seq.join(','));
    assert.ok(new Set(seq).size >= 9, 'la rotation couvre presque tous les événements');
  }
  assert.equal(new Set(orders).size, orders.length, 'jamais le même ordre');
  rng.setSource(null);
});

test('Calendrier : un événement démarre, dure ~3 jours, et le suivant s’enchaîne', () => {
  const s = createNewState({ seed: 'cal', now: T0 });
  ensureCalendar(s, T0);
  assert.equal(liveState(s).calendar.length, 4);
  advance(s, T0 + 2 * 60000);
  const L = liveState(s);
  assert.ok(L.current, 'un événement est en cours');
  const first = L.current.key;
  assert.ok(Math.abs(L.current.end - L.current.start - 72 * H) < 2 * 60000);
  assert.ok(s.notifications.some((n) => /commence/.test(n.text)));
  // Avance de 73 h (par étapes, comme le jeu)
  for (let h = 1; h <= 73; h++) advance(s, T0 + h * H);
  assert.ok(L.reports.length === 1, 'bilan de fin produit');
  assert.ok(L.current && L.current.key !== first, 'événement suivant lancé');
  assert.ok(s.notifications.some((n) => /se termine dans 6 h/.test(n.text)));
});

test('Cavaliers des Steppes : camps, caravanes (4 actions), boss à paliers, objectifs, passe', () => {
  rng.setSource(mulberry32(11));
  const s = strong('steppes');
  joinGuild(s, Object.keys(GUILDS)[0], T0);
  adminStart(s, 'steppes', T0);
  const L = liveState(s);
  const cur = L.current;
  const camp = cur.map.targets.find((t) => t.type === 'camp' && t.tier <= 2);
  const car = cur.map.targets.find((t) => t.type === 'caravan');
  assert.deepEqual(actionsFor(s, car, T0), ['attack', 'escort', 'trade', 'spy']);
  const army = { swordsman: 150, archer: 150, spearman: 150, knight: 40 };
  assert.ok(sendLive(s, { targetId: camp.id, action: 'attack', units: army }, T0).ok);
  assert.ok(sendLive(s, { targetId: car.id, action: 'spy', units: { scout: 2 } }, T0).ok);
  const car2 = cur.map.targets.find((t) => t.type === 'caravan' && t.id !== car.id);
  assert.ok(sendLive(s, { targetId: car2.id, action: 'trade', units: { spearman: 20 } }, T0).ok);
  for (let m = 1; m <= 120; m++) advance(s, T0 + m * 60000);
  assert.ok(cur.stats.camps >= 1, 'camp vaincu');
  assert.ok(car.spied || car.done, 'caravane espionnée');
  assert.ok((cur.stats.trades || 0) >= 1, 'échange conclu');
  assert.ok(cur.earned > 0 && cur.wallet > 0);
  // Le boss apparaît après 6 h et a 4 rangs
  for (let h = 3; h <= 7; h++) advance(s, T0 + h * H);
  const boss = cur.map.targets.find((t) => t.type === 'boss');
  assert.ok(isVisible(cur, boss), 'boss visible');
  assert.ok(s.notifications.some((n) => /apparu/.test(n.text)));
  const before = cur.bossHp;
  Object.assign(s.army, { knight: 100, swordsman: 300, archer: 300 });
  const sent = sendLive(s, { targetId: boss.id, action: 'attack', units: { knight: 60, swordsman: 200, archer: 200 } }, T0 + 7 * H);
  assert.ok(sent.ok, sent.reason);
  for (let m = 1; m <= 90; m++) advance(s, T0 + 7 * H + m * 60000);
  assert.ok(cur.bossHp < before || cur.bossIdx > 0, 'dégâts infligés au Khan');
  // Objectifs & passe
  cur.stats.camps = 10;
  const o = objectives(s).find((x) => x.id === 'c10');
  assert.ok(o.done);
  assert.ok(claimObjective(s, 'c10', T0 + 9 * H).ok);
  assert.equal(claimObjective(s, 'c10', T0 + 9 * H).ok, false, 'pas deux fois');
  cur.earned = 1300;
  assert.equal(passInfo(s).level, 2);
  assert.ok(claimPass(s, 1, T0 + 9 * H).ok);
  assert.ok(guildInfo(s, T0 + 9 * H).target === 2000);
  rng.setSource(null);
});

test('Boutique : stock personnel, stock serveur partagé, monnaie insuffisante', () => {
  const s = strong('shop');
  adminStart(s, 'corsairs', T0);
  const cur = liveState(s).current;
  assert.equal(buyShopItem(s, 'food', T0).ok, false, 'monnaie insuffisante');
  cur.wallet = 100000;
  const shard = shopItems(s).find((i) => i.id === 'shard');
  assert.equal(shard.left, 3);
  assert.equal(shard.globalLeft, 5);
  assert.ok(buyShopItem(s, 'shard', T0).ok);
  assert.equal(shardState(s).count, 1);
  cur.shop.globalSold.shard = 4; // d'autres seigneurs ont acheté le reste
  assert.equal(buyShopItem(s, 'shard', T0).ok, false, 'rupture serveur');
  assert.ok(buyShopItem(s, 'sabre', T0).ok);
  assert.equal(buyShopItem(s, 'sabre', T0).ok, false, 'exclusif : stock 1');
  // Rotation : 4 objets tournants choisis parmi le catalogue
  assert.equal(shopItems(s).filter((i) => i.rotating).length, 4);
  // Marchand mystère : 3 à 5 objets
  rollMystery(s, T0 + 86400000);
  assert.ok(cur.mystery.items.length >= 3 && cur.mystery.items.length <= 5);
  assert.ok(buyMystery(s, 0, T0 + 86400000).ok);
});

test('Fin d’événement : conversion de la monnaie restante, récompenses de rang, bilan', () => {
  const s = strong('end');
  adminStart(s, 'steppes', T0);
  const cur = liveState(s).current;
  cur.wallet = 1000; cur.earned = 90000; cur.stats.camps = 12;
  s.resources.food = 0;
  const food = s.resources.food;
  const rep = endEvent(s, T0 + 72 * H);
  assert.ok(rep.left >= 1000, 'les objectifs réclamés automatiquement s’ajoutent avant conversion');
  assert.ok(s.resources.food > food, 'monnaie convertie en nourriture');
  assert.ok(rep.rank <= 10, `rang ${rep.rank}`);
  assert.equal(rep.camps, 12);
  assert.ok(rep.rewards.length >= 1);
  assert.equal(liveState(s).current, null);
  assert.ok(liveState(s).unseenReport);
});

test('Mécaniques propres : vagues, siège, lave, filons, régions, brasiers, énigmes, dragon coopératif', () => {
  rng.setSource(mulberry32(5));
  for (const key of Object.keys(LIVE_EVENTS)) {
    const s = strong('mech' + key);
    adminStart(s, key, T0);
    const cur = liveState(s).current;
    let t = T0;
    for (let i = 0; i < 6 * 24; i++) { // 36 h de jeu, par tranches de 15 min
      t += 15 * 60000;
      advance(s, t);
      if (!liveState(s).current) break;
      for (const tg of cur.map.targets.filter((x) => isVisible(cur, x))) {
        const a = actionsFor(s, tg, t).find((x) => x !== 'withdraw');
        if (a) sendLive(s, { targetId: tg.id, action: a, units: { swordsman: 60, archer: 60, spearman: 60, knight: 15, scout: 1 } }, t);
      }
      if (cur.map.revealed) sendLive(s, { action: 'explore', x: 4 + (i % 10), y: i % cur.map.h, units: { scout: 1 } }, t);
      for (const p of s.pending.filter((x) => x.kind === 'riddle')) resolveAny(s, p.id, 0, t);
      for (const u of ['swordsman', 'archer', 'spearman', 'knight']) s.army[u] = Math.max(s.army[u], 400);
      s.army.scout = 30;
    }
    assert.ok(cur.earned > 500, `${key} : ${cur.earned} gagnés`);
    const st = cur.stats;
    if (key === 'deadNight') assert.ok((st.waves || 0) + (st.wavesLost || 0) >= 5, 'vagues');
    if (key === 'siege') assert.ok((st.assaultsSeen || 0) >= 8 && cur.citadel <= 100, 'assauts');
    if (key === 'goldRush') assert.ok(st.veins >= 1, 'filons exploités');
    if (key === 'kingdomWar') assert.ok(st.held >= 1, 'régions conquises');
    if (key === 'giants') assert.ok(st.deliveries >= 1 && cur.warmth >= 0, 'brasiers');
    if (key === 'ruins') assert.ok(st.explored > 0, 'exploration du brouillard');
    if (key === 'dragonHunt') assert.ok(cur.coop.hp < cur.coop.maxHp, 'le serveur frappe le dragon');
    if (key === 'volcano') assert.ok(cur.map.lava.length > 0, 'lave');
    assert.ok(leaderboard(s, t).rank >= 1);
  }
  rng.setSource(null);
});

test('Modificateurs : l’Hiver des Géants alourdit l’entretien ; la Grande Foire baisse la taxe', () => {
  const s = strong('mods');
  const base = computeMods(s, T0);
  adminStart(s, 'giants', T0);
  assert.ok((computeMods(s, T0).upkeep || 0) > (base.upkeep || 0));
  startSurprise(s, 'fair', T0);
  assert.ok((computeMods(s, T0)['market.fee'] || 0) < (base['market.fee'] || 0));
  startSurprise(s, 'meteor', T0);
  assert.ok(Object.values(s.world.pois).some((p) => p.meteor));
  liveTick(s, T0 + 7 * H);
  assert.ok(!liveState(s).surprises.some((x) => x.key === 'meteor'), 'la météorite expire après 6 h');
});

test('Automatisation : un petit revenu passif, plafonné par jour', () => {
  const s = strong('auto');
  adminStart(s, 'steppes', T0);
  s.expeditions = [{ id: 'x', status: 'work' }, { id: 'y', status: 'work' }, { id: 'z', status: 'work' }];
  const cur = liveState(s).current;
  cur.lastTick = T0;
  for (let m = 1; m <= 24 * 60; m += 10) liveTick(s, T0 + m * 60000);
  assert.ok(cur.stats.auto > 0);
  assert.ok(cur.stats.auto <= 400, `plafond : ${cur.stats.auto}`);
});

test('Sauvegarde : un événement en cours survit à la sérialisation ; vieille sauvegarde migrée', () => {
  const s = strong('save');
  adminStart(s, 'ruins', T0);
  const back = deserialize(serialize(s));
  assert.equal(back.live.current.key, 'ruins');
  assert.equal(back.live.current.map.revealed.length, back.live.current.map.w * back.live.current.map.h);
  const old = JSON.parse(serialize(createNewState({ seed: 'old', now: T0 })));
  delete old.live; delete old.shards; delete old.notifications; delete old.admin;
  old.version = 4;
  const mig = deserialize(JSON.stringify(old));
  assert.ok(mig.live && mig.shards && Array.isArray(mig.notifications) && mig.admin);
  advance(mig, T0 + 5 * 60000);
  assert.ok(mig.live.current);
});
