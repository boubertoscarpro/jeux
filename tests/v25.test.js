// v25 « Le monde en fête et en guerre » : les événements se jouent sur la carte du monde (plus de carte à part).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { createNewState } from '../src/core/state.js';
import { deserialize, serialize } from '../src/core/save.js';
import { rng, mulberry32 } from '../src/core/rng.js';
import { advance } from '../src/core/engine.js';
import { LIVE_EVENTS } from '../src/data/liveEvents.js';
import {
  startEvent, endEvent, liveState, planLive, sendLive, recallLive, isVisible, actionsFor, eventMarches, syncEventPois,
  liveTick, liveTravel, eventTargetsByDistance, processEventMarch, targetReward,
} from '../src/systems/liveEvents.js';
import { ringFor, eventBases, EVENT_VISIBLE_MAX, EVENT_SPACING, insideDisk } from '../src/systems/eventWorld.js';
import { planMarch, maxMarches, worldMarches } from '../src/systems/marches.js';
import { wTerrain, key } from '../src/systems/world.js';
import { computeMods } from '../src/systems/modifiers.js';
import { EVENT_TARGETS } from '../src/ui/paint/art.js';
import { ringActions } from '../src/ui/eventMap.js';

const T0 = Date.UTC(2026, 9, 30, 9), H = 3600000, MIN = 60000;
const fresh = (seed) => {
  const s = createNewState({ seed, now: T0 });
  s.army = { spearman: 400, swordsman: 300, archer: 300, knight: 60, scout: 20 };
  s.live.calendar = []; s.live.current = null;
  return s;
};
const dist = (s, t) => Math.min(...eventBases(s).map((b) => Math.hypot(b.x - t.x, b.y - t.y)));
const capDist = (s, t) => Math.hypot(t.x - s.world.capital.x, t.y - s.world.capital.y);

test('Placement : sur le vrai monde, déterministe, jamais sur rivière/montagne/lieu/territoire, espacé, en anneaux', () => {
  for (const k of Object.keys(LIVE_EVENTS)) {
    const a = fresh('pl' + k), b = fresh('pl' + k);
    rng.setSource(mulberry32(3)); const ca = startEvent(a, k, T0);
    rng.setSource(mulberry32(3)); const cb = startEvent(b, k, T0);
    rng.setSource(null);
    assert.ok(ca.map && !ca.map.tiles && ca.map.targets.length > 0, `${k} : cibles posées sur le monde`);
    assert.deepEqual(ca.map.targets.map((t) => [t.type, t.x, t.y, t.tier]), cb.map.targets.map((t) => [t.type, t.x, t.y, t.tier]), `${k} : même graine, même placement`);
    const W = LIVE_EVENTS[k].world;
    for (const t of ca.map.targets) {
      const ter = wTerrain(a.world, t.x, t.y);
      if (t.type === 'ship') assert.equal(ter, 'river', `${k} : navire sur la rivière`);
      else if (!(W.frost || W.volcano) && !(W.veinTerrain && t.type === 'vein')) assert.ok(!['river', 'mountain'].includes(ter), `${k} : ${t.type} sur ${ter}`);
      assert.ok(!a.territories[key(t.x, t.y)]);
      assert.ok(t.x !== a.world.capital.x || t.y !== a.world.capital.y);
      for (const o of ca.map.targets) if (o !== t) assert.ok(Math.max(Math.abs(o.x - t.x), Math.abs(o.y - t.y)) >= EVENT_SPACING, `${k} : cibles collées`);
    }
  }
  // Paliers : faibles près de chez soi, forts au loin, forteresse et chef au plus loin
  const s = fresh('rings');
  const cur = startEvent(s, 'steppes', T0);
  const camps = cur.map.targets.filter((t) => t.type === 'camp');
  const near = camps.filter((t) => t.tier <= 2), far = camps.filter((t) => t.tier >= 6);
  const avg = (l) => l.reduce((x, t) => x + capDist(s, t), 0) / l.length;
  assert.ok(near.length && far.length && avg(near) + 6 < avg(far), `anneaux : ${avg(near).toFixed(1)} → ${avg(far).toFixed(1)}`);
  for (const t of cur.map.targets.filter((x) => x.type === 'fortress' || x.type === 'boss')) assert.ok(capDist(s, t) >= 14, `${t.type} au loin (${capDist(s, t).toFixed(1)})`);
  assert.deepEqual(ringFor('camp', 1), [4, 8]);
  assert.deepEqual(ringFor('camp', 7), [22, 24]);
});

test('Projection : les cibles visibles sont des lieux du monde (plafond, aucune collision), « annoncé » 24 h avant', () => {
  const s = fresh('proj');
  const pois0 = Object.keys(s.world.pois).length;
  s.live.calendar = [{ key: 'steppes', start: T0 + 10 * H, end: T0 + 82 * H }];
  syncEventPois(s, T0);
  const herald = Object.values(s.world.pois).filter((p) => p.type === 'evt');
  assert.equal(herald.length, 1); assert.equal(herald[0].phase, 'upcoming');
  liveTick(s, T0 + 10 * H + MIN);
  const cur = liveState(s).current;
  assert.equal(cur.key, 'steppes');
  const evts = Object.values(s.world.pois).filter((p) => p.type === 'evt');
  assert.ok(evts.length > 5 && evts.length <= EVENT_VISIBLE_MAX + 10, `${evts.length} lieux d'événement`);
  assert.equal(Object.keys(s.world.pois).length - evts.length, pois0, 'aucun lieu du monde écrasé');
  assert.ok(evts.every((p) => p.phase !== 'upcoming'));
  // une seule projection par cible, même après plusieurs pas
  syncEventPois(s, T0 + 10 * H + 2 * MIN); syncEventPois(s, T0 + 10 * H + 3 * MIN);
  const ids = Object.values(s.world.pois).filter((p) => p.type === 'evt').map((p) => p.evId);
  assert.equal(new Set(ids).size, ids.length, 'pas de doublon');
  // fin : les camps se lèvent (phase « ended »), puis disparaissent
  endEvent(s, T0 + 20 * H);
  assert.ok(Object.values(s.world.pois).some((p) => p.type === 'evt' && p.phase === 'ended'));
  syncEventPois(s, T0 + 20 * H + 21 * MIN);
  liveTick(s, T0 + 20 * H + 22 * MIN);
  assert.ok(!Object.values(s.world.pois).some((p) => p.type === 'evt' && p.phase === 'ended'));
});

test('Marches : une seule liste (state.marches), départ de la capitale ou de l’avant-poste le plus proche, vrais trajets', () => {
  const s = fresh('march');
  const cur = startEvent(s, 'steppes', T0);
  const far = cur.map.targets.filter((t) => t.type === 'camp').sort((a, b) => capDist(s, b) - capDist(s, a))[0];
  const r0 = planLive(s, { action: 'attack', targetId: far.id, units: { spearman: 50 } }, T0);
  assert.equal(r0.ok, true, r0.reason); assert.equal(r0.from.key, 'capital');
  // un avant-poste près de la cible : on en part, et c'est plus court
  const ox = far.x + 2, oy = far.y;
  s.territories[key(ox, oy)] = { id: 'op1', name: 'Fort-Avancé', x: ox, y: oy, garrison: {}, level: 1 };
  const r1 = planLive(s, { action: 'attack', targetId: far.id, units: { spearman: 50 } }, T0);
  assert.equal(r1.from.key, key(ox, oy)); assert.ok(r1.travel < r0.travel / 2, `${r1.travel} < ${r0.travel}`);
  const r2 = planLive(s, { action: 'attack', targetId: far.id, units: { spearman: 50 }, from: 'capital' }, T0);
  assert.equal(r2.travel, r0.travel, 'départ choisi : la capitale');
  // trajet = trajet réel du monde (18 s par case à vitesse 1) × 4
  assert.ok(Math.abs(r0.travel - capDist(s, far) * 18000 * 4) < 2000);
  const sent = sendLive(s, { action: 'attack', targetId: far.id, units: { spearman: 50 } }, T0);
  assert.equal(sent.ok, true);
  assert.equal(sent.march.type, 'event'); assert.ok(s.marches.includes(sent.march)); assert.equal(s.live.marches, undefined);
  // les marches d'événement ne prennent pas les places des marches du monde
  assert.equal(worldMarches(s).length, 0);
  assert.ok(planMarch(s, { type: 'explore', x: s.world.capital.x + 3, y: s.world.capital.y, units: { scout: 1 } }, T0).ok);
  assert.ok(maxMarches(computeMods(s, T0)) >= 2);
  // rappel par la voie commune (rappel automatique avant un raid, bouton de la barre des marches)
  assert.ok(recallLive(s, sent.march.id, T0 + MIN).ok);
  advance(s, T0 + 3 * H);
  assert.equal(eventMarches(s).length, 0); assert.equal(s.army.spearman, 400);
});

test('Validation dans le moteur : action inconnue, cible vaincue ou cachée refusées ; espionnage révèle les défenseurs', () => {
  const s = fresh('valid');
  const cur = startEvent(s, 'steppes', T0);
  const camp = cur.map.targets.find((t) => t.type === 'camp');
  assert.deepEqual(actionsFor(s, camp, T0), ['attack', 'spy']);
  assert.equal(planLive(s, { action: 'dig', targetId: camp.id, units: { spearman: 5 } }, T0).ok, false);
  assert.equal(planLive(s, { action: 'spy', targetId: camp.id, units: { spearman: 5 } }, T0).ok, false, 'éclaireur requis');
  const sp = sendLive(s, { action: 'spy', targetId: camp.id, units: { scout: 1 } }, T0);
  processEventMarch(s, sp.march, sp.march.arrive);
  assert.equal(camp.spied, true); assert.deepEqual(actionsFor(s, camp, T0), ['attack']);
  const boss = cur.map.targets.find((t) => t.type === 'boss');
  assert.equal(planLive(s, { action: 'attack', targetId: boss.id, units: { spearman: 5 } }, T0).ok, false, 'chef pas encore apparu');
  camp.done = true;
  assert.equal(planLive(s, { action: 'attack', targetId: camp.id, units: { spearman: 5 } }, T0).ok, false, 'cible vaincue');
  // une marche ordinaire du monde ne peut pas attaquer une cible d'événement
  syncEventPois(s, T0);
  const p = Object.values(s.world.pois).find((x) => x.type === 'evt' && x.phase === 'active');
  assert.equal(planMarch(s, { type: 'attack', x: p.x, y: p.y, units: { spearman: 10 } }, T0).ok, false);
  assert.ok(ringActions(s, p, T0).some((a) => a.kind === 'ev') && ringActions(s, p, T0).some((a) => a.act === 'info'), 'anneau : actions de l’événement + Infos');
  assert.ok(targetReward(s, cur.map.targets.find((t) => t.type === 'camp' && !t.done)).points > 0);
});

test('Réapparition : même anneau, palier qui monte, plafond de cibles visibles respecté', () => {
  rng.setSource(mulberry32(9));
  const s = fresh('resp');
  const cur = startEvent(s, 'steppes', T0);
  const tiers0 = cur.map.targets.filter((t) => t.type === 'camp').map((t) => t.tier).reduce((a, b) => a + b, 0);
  let t = T0;
  for (let round = 0; round < 6; round++) {
    for (const c of cur.map.targets.filter((x) => x.type === 'camp' && !x.done)) { c.done = true; c.respawnAt = t + MIN; }
    t += 5 * MIN; liveTick(s, t);
    assert.ok(cur.map.targets.filter((x) => !x.done && !x.gone).length <= EVENT_VISIBLE_MAX);
  }
  const camps = cur.map.targets.filter((x) => x.type === 'camp' && !x.done);
  assert.ok(camps.length >= 6, `${camps.length} camps revenus`);
  assert.ok(camps.reduce((a, c) => a + c.tier, 0) > tiers0, 'paliers en hausse');
  assert.ok(camps.every((c) => c.tier <= 7));
  rng.setSource(null);
});

test('Cavaliers des Steppes : camps nomades qui changent de place ; harcèlement visible d’un avant-poste mal gardé', () => {
  const s = fresh('nomad');
  const cur = startEvent(s, 'steppes', T0);
  const nomad = cur.map.targets.find((t) => t.nomad);
  assert.ok(nomad, 'au moins un camp nomade');
  const at = [nomad.x, nomad.y];
  let t = T0; for (let i = 0; i < 6 * 6; i++) { t += 10 * MIN; liveTick(s, t); }
  assert.notDeepEqual([nomad.x, nomad.y], at, 'le camp s’est déplacé');
  // un avant-poste sans garnison près d'un camp nomade : une menace part, visible, et frappe 1 h plus tard
  const ox = nomad.x + 3, oy = nomad.y;
  s.territories[key(ox, oy)] = { id: 'op', name: 'Gué-Clair', x: ox, y: oy, garrison: {}, level: 1 };
  nomad.harassAt = 0; s.resources.gold = 10000;
  liveTick(s, t + MIN);
  const th = cur.map.threats.find((x) => x.kind === 'harass');
  assert.ok(th && th.to.name === 'Gué-Clair' && th.arrive > t);
  liveTick(s, th.arrive + MIN);
  assert.ok(!cur.map.threats.includes(th));
  assert.ok(s.resources.gold < 10000, 'pillage limité (pas de destruction)');
  assert.ok(s.resources.gold >= 9000, 'au plus 3 % par camp harceleur');
});

test('Corsaires : repaires au bord des rivières, navires sur l’eau ; une caravane proche d’un repaire est guettée', () => {
  const s = fresh('cors');
  const cur = startEvent(s, 'corsairs', T0);
  const near = (t) => [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]].some(([dx, dy]) => wTerrain(s.world, t.x + dx, t.y + dy) === 'river');
  const ports = cur.map.targets.filter((t) => t.type === 'port');
  assert.ok(ports.length >= 4 && ports.filter(near).length >= ports.length - 1, 'repaires au bord de l’eau');
  const port = ports[0];
  s.caravans.push({ id: 'cv', x: port.x + 1, y: port.y, town: 'Port-Test', start: T0, end: T0 + 2 * H, gold: 500, risk: 0.05 });
  liveTick(s, T0 + MIN);
  assert.ok(s.caravans[0].corsair && s.caravans[0].risk >= 0.6, 'caravane guettée');
});

test('Hiver des Géants : front de neige qui avance et ralentit les marches qui le traversent ; géants dans la zone gelée', () => {
  const s = fresh('frost');
  const cur = startEvent(s, 'giants', T0);
  const f = cur.map.frost;
  assert.ok(f && f.r >= 3);
  for (const t of cur.map.targets.filter((x) => ['camp', 'pack', 'hearth'].includes(x.type))) assert.ok(Math.hypot(t.x - f.x, t.y - f.y) <= f.max + 4, 'dans la zone gelée');
  liveTick(s, T0 + 36 * H);
  assert.ok(f.r > 3, 'le front avance');
  const from = { x: f.x - 20, y: f.y }, to = { x: f.x, y: f.y };
  assert.ok(insideDisk(from, to, f, f.r) > 0);
  const cold = liveTravel(s, cur, from, to.x, to.y, { spearman: 1 }, {});
  const saved = cur.map.frost; cur.map.frost = null;
  const warm = liveTravel(s, cur, from, to.x, to.y, { spearman: 1 }, {});
  cur.map.frost = saved;
  assert.ok(cold > warm * 1.05, `${cold} > ${warm}`);
});

test('Ruines Anciennes : ruines sous le vrai brouillard, visibles une fois la case révélée ; carte au trésor = vraies coordonnées', () => {
  const s = fresh('ruins');
  const cur = startEvent(s, 'ruins', T0);
  const hidden = cur.map.targets.filter((t) => t.fog);
  assert.ok(hidden.length >= 5);
  const t = hidden[0];
  assert.equal(isVisible(cur, t, s.world), false);
  assert.ok(!eventTargetsByDistance(s, T0).some((x) => x.t === t));
  s.world.revealed[t.y * s.world.size + t.x] = 1;
  assert.equal(isVisible(cur, t, s.world), true);
  syncEventPois(s, T0);
  assert.ok(Object.values(s.world.pois).some((p) => p.evId === t.id), 'apparaît sur la carte du monde');
});

test('Chasse au Dragon : chaque piste mène à la suivante en laissant des cases brûlées, jusqu’à l’antre', () => {
  const s = fresh('drag');
  const cur = startEvent(s, 'dragonHunt', T0);
  for (let i = 0; i < 3; i++) {
    const tr = cur.map.targets.find((t) => t.type === 'trace' && !t.gone && !t.done);
    assert.ok(tr, `piste ${i + 1}`);
    const r = sendLive(s, { action: 'track', targetId: tr.id, units: { scout: 1 } }, T0);
    assert.ok(r.ok, r.reason);
    processEventMarch(s, r.march, r.march.arrive);
    processEventMarch(s, r.march, r.march.workEnd);
  }
  assert.ok(cur.map.targets.some((t) => t.type === 'lair'), 'antre trouvé');
  assert.ok(cur.map.burnt.length >= 6, `${cur.map.burnt.length} cases brûlées`);
});

test('Guerre des Royaumes : régions disputées sur la frontière avec un royaume rival existant', () => {
  const s = fresh('war');
  const cur = startEvent(s, 'kingdomWar', T0);
  const ks = Object.values(s.world.pois).filter((p) => p.type === 'kingdom');
  const zones = cur.map.targets.filter((t) => t.type === 'zone');
  assert.ok(zones.length >= 5);
  assert.ok(zones.filter((z) => z.border && ks.some((k) => k.name === z.border)).length >= zones.length - 1, 'rattachées à un royaume');
  for (const z of zones) { const k = ks.find((x) => x.name === z.border); if (k) assert.ok(Math.hypot(k.x - z.x, k.y - z.y) < capDist(s, k) + 2); }
});

test('Ruée vers l’Or : filons sur collines, montagnes ou rivières ; course visible contre les prospecteurs rivaux', () => {
  rng.setSource(mulberry32(4));
  const s = fresh('gold');
  const cur = startEvent(s, 'goldRush', T0);
  const veins = cur.map.targets.filter((t) => t.type === 'vein');
  assert.ok(veins.length >= 6);
  let t = T0;
  for (let i = 0; i < 8 && !cur.map.threats.some((x) => x.kind === 'rival'); i++) { t += H; liveTick(s, t); }
  const run = cur.map.threats.find((x) => x.kind === 'rival');
  assert.ok(run && run.arrive > t && run.from, 'convoi rival visible');
  const v = cur.map.targets.find((x) => x.id === run.targetId);
  liveTick(s, run.arrive + MIN);
  assert.ok(v.gone, 'filon perdu : personne n’y travaillait');
  rng.setSource(null);
});

test('Colère du Volcan : volcan sur le monde, lave qui bouge sur de vraies cases, jamais sous une cible', () => {
  const s = fresh('volc');
  const cur = startEvent(s, 'volcano', T0);
  assert.ok(cur.map.volcano && cur.map.lava.length > 10);
  const before = cur.map.lava.join();
  liveTick(s, T0 + 2 * H + MIN);
  assert.notEqual(cur.map.lava.join(), before, 'la lave bouge');
  const cells = new Set(cur.map.lava);
  for (const t of cur.map.targets) assert.ok(!cells.has(t.y * s.world.size + t.x));
  for (const t of cur.map.targets.filter((x) => x.type === 'vent')) assert.ok(Math.hypot(t.x - cur.map.volcano.x, t.y - cur.map.volcano.y) <= 9);
  // un avant-poste près des coulées : production réduite (jamais détruit)
  const v = cur.map.volcano;
  s.territories[key(v.x + 3, v.y)] = { id: 'op', name: 'Cendrée', x: v.x + 3, y: v.y, garrison: {}, level: 1 };
  liveTick(s, T0 + 3 * H + MIN);
  assert.ok(s.territories[key(v.x + 3, v.y)].lavaUntil > T0 + 3 * H, 'avant-poste menacé');
});

test('Nuit des Morts : une horde marche vers la capitale ; interceptée, la vague est annulée', () => {
  const s = fresh('dead');
  const cur = startEvent(s, 'deadNight', T0);
  liveTick(s, cur.nextWave - 3 * H + MIN);
  const h = cur.map.targets.find((t) => t.type === 'horde');
  assert.ok(h && h.dest && h.arrive === cur.nextWave, 'horde en marche');
  const start = [h.x, h.y];
  liveTick(s, cur.nextWave - 90 * MIN);
  assert.notDeepEqual([h.x, h.y], start, 'elle avance sur la carte');
  const r = sendLive(s, { action: 'attack', targetId: h.id, units: { swordsman: 300, archer: 300, knight: 60 } }, cur.nextWave - 90 * MIN);
  assert.ok(r.ok, r.reason);
  processEventMarch(s, r.march, r.march.arrive);
  assert.ok(h.done, 'horde taillée en pièces');
  const waves = cur.stats.waves || 0;
  liveTick(s, cur.nextWave + MIN);
  assert.equal(cur.stats.wavesLost || 0, 0, 'aucune vague subie');
  assert.ok((cur.stats.waves || 0) >= waves);
});

test('Siège des Anciens : l’assaut approche visiblement depuis une direction qui donne le flanc visé', () => {
  const s = fresh('siege');
  const cur = startEvent(s, 'siege', T0);
  const bastion = cur.map.targets.find((t) => t.type === 'bastion');
  assert.ok(bastion && capDist(s, bastion) <= 7, 'Citadelle près de la capitale');
  liveTick(s, T0 + MIN);
  const th = cur.map.threats.find((x) => x.kind === 'assault');
  assert.ok(th && ['left', 'front', 'right'].includes(th.flank) && th.arrive === cur.nextAssault);
  const dx = th.from.x - s.world.capital.x, dy = th.from.y - s.world.capital.y;
  const expect = dx < -Math.abs(dy) * 0.5 ? 'left' : dx > Math.abs(dy) * 0.5 ? 'right' : 'front';
  assert.equal(th.flank, expect, 'la direction donne le flanc');
  const n = cur.stats.assaultsSeen || 0;
  liveTick(s, th.arrive + MIN);
  assert.equal(cur.stats.assaultsSeen, n + 1);
});

test('Convoi des Sept Marchands : caravanes entre deux cités libres réelles, sur de vraies routes', () => {
  const s = fresh('seven');
  const cur = startEvent(s, 'sevenMerchants', T0);
  const towns = Object.values(s.world.pois).filter((p) => p.type === 'town');
  const cvs = cur.map.targets.filter((t) => t.type === 'caravan');
  assert.ok(cvs.length >= 5);
  for (const c of cvs) assert.ok(towns.some((t) => t.x === c.dest.x && t.y === c.dest.y), 'destination : une cité libre');
  const c0 = cvs[0], p0 = [c0.x, c0.y], d0 = Math.hypot(c0.dest.x - c0.x, c0.dest.y - c0.y);
  liveTick(s, T0 + 3 * H);
  assert.ok(c0.done || Math.hypot(c0.dest.x - c0.x, c0.dest.y - c0.y) < d0 || p0[0] !== c0.x || p0[1] !== c0.y, 'le convoi avance');
});

test('Dessins : chaque type de cible d’événement a son dessin peint', () => {
  const types = new Set();
  for (const d of Object.values(LIVE_EVENTS)) for (const t of d.world.targets) types.add(t.type);
  for (const t of ['lair', 'horde', 'trace', 'herald', 'ruins']) types.add(t);
  for (const t of types) assert.ok(EVENT_TARGETS[t], `dessin manquant : ${t}`);
});

test('Migration v24 → v25 (fixture save-v24) : cibles transposées avec leur état, marches rentrées, aucune perte', () => {
  const raw = gunzipSync(readFileSync(new URL('./fixtures/save-v24.json.gz', import.meta.url))).toString();
  const old = JSON.parse(raw);
  const oldCur = old.live.current;
  const oldT = oldCur.map.targets.filter((t) => !t.gone);
  const armyBefore = { ...old.army };
  for (const m of old.live.marches) for (const [u, n] of Object.entries(m.units)) armyBefore[u] = (armyBefore[u] || 0) + n;
  const st = deserialize(raw);
  const cur = st.live.current;
  assert.equal(st.live.marches, undefined);
  assert.equal(cur.map.tiles, undefined);
  assert.ok(cur.map.targets.length >= oldT.length - 2, `${cur.map.targets.length}/${oldT.length} cibles transposées`);
  for (const t of cur.map.targets) assert.ok(t.x >= 0 && t.x < st.world.size && t.y >= 0 && t.y < st.world.size);
  const byId = Object.fromEntries(cur.map.targets.map((t) => [t.id, t]));
  for (const t of oldT) if (byId[t.id]) { assert.equal(byId[t.id].done, t.done); assert.equal(byId[t.id].tier, t.tier); assert.equal(!!byId[t.id].mapped, !!t.mapped); }
  assert.equal(cur.bossHp, oldCur.bossHp, 'PV du chef conservés');
  for (const [u, n] of Object.entries(armyBefore)) assert.equal(st.army[u], n, `${u} rentrés`);
  assert.ok(st.heroes.every((h) => !h.marchId || st.marches.some((m) => m.id === h.marchId)));
  assert.ok(st.meta.eventsMigrated?.marches === 2);
  // la partie tourne, et une sauvegarde de la v25 se recharge à l'identique
  advance(st, (st.meta.lastTick || T0) + 2 * H);
  const back = deserialize(serialize(st));
  assert.equal(back.live.current?.key ?? null, st.live.current?.key ?? null);
});
