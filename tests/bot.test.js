// Un « bot » joue plusieurs jours simulés : vérifie l'absence d'erreur et que la progression avance.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createNewState } from '../src/core/state.js';
import { advance } from '../src/core/engine.js';
import { serialize, deserialize } from '../src/core/save.js';
import { rng, mulberry32 } from '../src/core/rng.js';
import { BUILDINGS } from '../src/data/buildings.js';
import { TECHS } from '../src/data/techs.js';
import { UNITS } from '../src/data/units.js';
import { POI_TYPES } from '../src/data/world.js';
import { SECTORS } from '../src/data/heroes.js';
import { SLOT_ORDER } from '../src/data/items.js';
import { startBuild, startUpgrade, startClear, buildRequirement } from '../src/systems/construction.js';
import { allBuildings, terrainAt, buildingAt, thLevel, adjacencyBonus, placementCheck } from '../src/systems/city.js';
import { computeMods } from '../src/systems/modifiers.js';
import { startResearch, techStatus } from '../src/systems/research.js';
import { train, unitStatus } from '../src/systems/army.js';
import { sendMarch, resolvePending } from '../src/systems/marches.js';
import { isRevealed } from '../src/systems/world.js';
import { tavernCandidates, recruit, assignGovernor, equipItem } from '../src/systems/tavern.js';
import { startCraft, startBrew } from '../src/systems/crafting.js';
import { claimQuest, activeQuests, claimMilestone, milestoneList } from '../src/systems/quests.js';
import { joinGuild, donate } from '../src/systems/guild.js';
import { sell } from '../src/systems/market.js';
import { claimTerritory } from '../src/systems/territory.js';

function bestTile(s, type, mods) {
  let best = null;
  for (let y = 0; y < s.city.h; y++) for (let x = 0; x < s.city.w; x++) {
    if (!placementCheck(s, type, x, y).ok) continue;
    const b = adjacencyBonus(s, type, x, y, mods).total;
    if (!best || b > best.b) best = { x, y, b };
  }
  return best;
}

function botSession(s, now) {
  const mods = computeMods(s, now);
  // Quêtes & jalons
  for (const q of activeQuests(s)) if (q.done) claimQuest(s, q.id, now);
  for (const m of milestoneList(s)) if (m.done) claimMilestone(s, m.id, now);
  // Décisions
  for (const p of [...s.pending]) resolvePending(s, p.id, rng.int(0, 1), now);
  // Construction : déblayer, construire ce qui manque, sinon améliorer le moins élevé
  if (!s.queues.build.length) {
    const rubble = (() => { for (let y = 0; y < s.city.h; y++) for (let x = 0; x < s.city.w; x++) if (terrainAt(s, x, y) === 'rubble') return { x, y }; return null; })();
    const wanted = ['farm', 'sawmill', 'quarry', 'house', 'barracks', 'mine', 'library', 'tavern', 'market', 'warehouse', 'mill', 'watchtower', 'castle', 'bakery', 'forge', 'charcoal', 'hunter', 'tannery', 'pasture', 'foundry', 'stable', 'guildhall', 'laboratory', 'weaver', 'herbalist', 'workshop', 'fishery', 'farm', 'sawmill', 'quarry'];
    let done = false;
    for (const type of wanted) {
      if (buildRequirement(s, type)) continue;
      const t = bestTile(s, type, mods);
      if (t && startBuild(s, type, t.x, t.y, now).ok) { done = true; break; }
    }
    if (!done && rubble && rng.chance(0.5)) done = startClear(s, rubble.x, rubble.y, now).ok;
    if (!done) {
      const th = allBuildings(s).find((b) => b.type === 'townhall');
      const cands = allBuildings(s).filter((b) => b.type !== 'deco' && b.level > 0).sort((a, b) => a.level - b.level);
      if (rng.chance(0.35)) done = startUpgrade(s, th.id, now).ok;
      for (const b of cands) { if (done) break; done = startUpgrade(s, b.id, now).ok; }
      if (!done && s.city.fort.wall < thLevel(s)) startUpgrade(s, 'fort:wall', now);
    }
  }
  // Recherche
  if (!s.queues.research.length) {
    const avail = Object.keys(TECHS).filter((id) => techStatus(s, id).status === 'available');
    for (const id of avail.sort(() => rng.random() - 0.5)) if (startResearch(s, id, now).ok) break;
  }
  // Armée
  const types = Object.keys(UNITS).filter((u) => unitStatus(s, u).ok);
  if (types.length && s.queues.train.length < 2 && s.resources.food > 800) {
    const u = rng.pick(types);
    train(s, u, rng.int(3, 15), now);
    if ((s.army.scout || 0) < 3 && unitStatus(s, 'scout').ok) train(s, 'scout', 3, now);
  }
  // Héros
  if (tavernCandidates(s, now).length) recruit(s, s.tavern.candidates[0].id, now);
  const idle = s.heroes.filter((h) => !h.marchId && !h.assignment);
  if (s.heroes.length > 1 && idle.length > 1) assignGovernor(s, idle[1].id, rng.pick(Object.keys(SECTORS)));
  for (const it of s.inventory.items.filter((i) => !i.equippedBy)) {
    const h = rng.pick(s.heroes);
    if (!h.equipment[it.slot]) equipItem(s, h.id, it.id);
  }
  // Artisanat
  startCraft(s, rng.pick(SLOT_ORDER), 'none', now);
  startBrew(s, 'healPotion', 1, now);
  // Guilde & commerce
  if (!s.guild) joinGuild(s, 'oak', now);
  if (s.guild && s.resources.gold > 3000) donate(s, 'gold', 500, now);
  if (s.resources.wood > 4000) sell(s, 'wood', 1000, now);
  // Marches
  const w = s.world;
  if (s.marches.length < 2) {
    const r = rng.random();
    if (r < 0.35 && s.army.scout > 0) {
      const x = Math.max(0, Math.min(w.size - 1, w.capital.x + rng.int(-12, 12)));
      const y = Math.max(0, Math.min(w.size - 1, w.capital.y + rng.int(-12, 12)));
      sendMarch(s, { type: 'explore', x, y, units: { scout: 1 } }, now);
    } else if (r < 0.7) {
      const nodes = Object.values(w.pois).filter((p) => POI_TYPES[p.type].kind === 'gather' && isRevealed(w, p.x, p.y) && p.amount > 100);
      const node = nodes.length && rng.pick(nodes);
      const units = Object.fromEntries(Object.entries(s.army).filter(([u, n]) => n > 0 && u !== 'scout' && UNITS[u].gather > 0));
      if (node && Object.keys(units).length) sendMarch(s, { type: 'gather', x: node.x, y: node.y, units }, now);
    } else {
      const targets = Object.values(w.pois).filter((p) => ['danger', 'kingdom'].includes(POI_TYPES[p.type].kind) && isRevealed(w, p.x, p.y) && !(p.clearedUntil > now));
      const t = targets.length && rng.pick(targets);
      const units = Object.fromEntries(Object.entries(s.army).filter(([u, n]) => n > 0 && u !== 'scout'));
      if (t && Object.keys(units).length) sendMarch(s, { type: 'attack', x: t.x, y: t.y, units, formation: 'balanced', heroId: s.heroes.find((h) => !h.marchId && !h.assignment)?.id }, now);
    }
  }
  if (s.boss && s.boss.hp > 0) {
    const units = Object.fromEntries(Object.entries(s.army).filter(([u, n]) => n > 0 && u !== 'scout'));
    if (Object.keys(units).length) sendMarch(s, { type: 'boss', x: s.boss.x, y: s.boss.y, units }, now);
  }
  // Territoire
  for (let i = 0; i < 6; i++) {
    const x = w.capital.x + rng.int(-5, 5), y = w.capital.y + rng.int(-5, 5);
    if (claimTerritory(s, x, y, now).ok) break;
  }
}

test('le bot joue 3 jours sans erreur et progresse', () => {
  rng.setSource(mulberry32(2024));
  const T0 = 1_700_000_000_000;
  let s = createNewState({ seed: 4242, now: T0 });
  let now = T0;
  const STEP = 10 * 60 * 1000;
  for (let i = 0; i < (3 * 86400000) / STEP; i++) {
    now += STEP;
    advance(s, now);
    botSession(s, now);
    for (const [r, v] of Object.entries(s.resources)) assert.ok(Number.isFinite(v) && v >= 0, `ressource ${r} invalide : ${v}`);
    if (i % 72 === 0) s = deserialize(serialize(s)); // sauvegarde/chargement réguliers
  }
  const th = thLevel(s);
  const report = {
    th, buildings: allBuildings(s).length, techs: Object.keys(s.techs).length, heroes: s.heroes.length,
    items: s.inventory.items.length, stats: s.stats, army: s.army, guild: s.guild?.level, territories: Object.keys(s.territories).length,
    resources: Object.fromEntries(Object.entries(s.resources).map(([k, v]) => [k, Math.round(v)])),
  };
  console.log(JSON.stringify(report, null, 1));
  assert.ok(th >= 4, `HdV ${th}`);
  assert.ok(Object.keys(s.techs).length >= 4);
  assert.ok(s.stats.battlesWon >= 3);
  assert.ok(s.stats.explored >= 5);
  rng.setSource(null);
});
void BUILDINGS; void buildingAt;
