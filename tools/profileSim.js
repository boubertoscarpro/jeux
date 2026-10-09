// Simulation de progression par profils de joueurs, avec le VRAI moteur du jeu.
// Profils : occasionnel, actif, très optimisé, économie, armée, exploration.
// Lancer : node tools/profileSim.js [jours] [graines]
import { createNewState } from '../src/core/state.js';
import { advance } from '../src/core/engine.js';
import { serialize } from '../src/core/save.js';
import { rng, mulberry32 } from '../src/core/rng.js';
import { TECHS } from '../src/data/techs.js';
import { UNITS } from '../src/data/units.js';
import { POI_TYPES } from '../src/data/world.js';
import { RESOURCES, isCapped } from '../src/data/resources.js';
import { startBuild, startUpgrade, startClear, buildRequirement } from '../src/systems/construction.js';
import { allBuildings, terrainAt, thLevel, adjacencyBonus, placementCheck, totalLevels } from '../src/systems/city.js';
import { computeMods } from '../src/systems/modifiers.js';
import { netRates, storageCap } from '../src/systems/economy.js';
import { startResearch, techStatus } from '../src/systems/research.js';
import { train, unitStatus } from '../src/systems/army.js';
import { sendMarch } from '../src/systems/marches.js';
import { resolveAny } from '../src/systems/pending.js';
import { isRevealed } from '../src/systems/world.js';
import { claimQuest, activeQuests, claimMilestone, milestoneList } from '../src/systems/quests.js';
import { sell } from '../src/systems/market.js';
import { fulfillContract, contractProgress } from '../src/systems/market.js';
import { claimTerritory, setSpec, setGarrison, upgradeOutpost } from '../src/systems/territory.js';
import { TERRITORY_SPECS } from '../src/data/territories.js';
import { recruitWorker, assignMany, housing } from '../src/systems/workforce.js';
import { unlockAutomation } from '../src/systems/automation.js';
import { shardState } from '../src/systems/shards.js';

const H = 3600000;
const ECO = ['farm', 'sawmill', 'quarry', 'mine', 'house', 'warehouse', 'mill', 'bakery', 'market', 'charcoal', 'foundry', 'library', 'herbalist', 'hunter', 'tannery', 'weaver', 'carpentry', 'fishery'];
const MIL = ['barracks', 'castle', 'stable', 'forge', 'watchtower', 'armory', 'quartermaster', 'tavern'];

export const PROFILES = {
  casual:   { name: 'Occasionnel', sessions: [8, 20], every: 0, build: [...ECO.slice(0, 6), 'barracks', 'library'], army: 0.15, explore: 0.3, attack: 0.2, territories: 0, contracts: 0.5 },
  active:   { name: 'Actif', sessions: null, from: 8, to: 23, every: 30, build: [...ECO, ...MIL], army: 0.3, explore: 0.3, attack: 0.3, territories: 1, contracts: 1 },
  optimized:{ name: 'Très optimisé', sessions: null, from: 7, to: 24, every: 10, build: [...ECO, ...MIL], army: 0.3, explore: 0.3, attack: 0.4, territories: 1, contracts: 1, smart: true },
  economy:  { name: 'Économie', sessions: null, from: 8, to: 23, every: 30, build: [...ECO, 'barracks', 'castle'], army: 0.08, explore: 0.2, attack: 0.1, territories: 1, contracts: 1, sellSurplus: true },
  military: { name: 'Armée', sessions: null, from: 8, to: 23, every: 30, build: [...MIL, ...ECO], army: 0.7, explore: 0.15, attack: 0.8, territories: 0.5, contracts: 0.3 },
  explorer: { name: 'Exploration', sessions: null, from: 8, to: 23, every: 30, build: [...ECO.slice(0, 8), 'barracks', 'stable', 'library'], army: 0.2, explore: 0.8, attack: 0.2, territories: 1, contracts: 0.5 },
};

function bestTile(s, type, mods) {
  let best = null;
  for (let y = 0; y < s.city.h; y++) for (let x = 0; x < s.city.w; x++) {
    if (!placementCheck(s, type, x, y).ok) continue;
    const b = adjacencyBonus(s, type, x, y, mods).total;
    if (!best || b > best.b) best = { x, y, b };
  }
  return best;
}

function session(s, p, now) {
  const mods = computeMods(s, now);
  for (const q of activeQuests(s)) if (q.done) claimQuest(s, q.id, now);
  for (const m of milestoneList(s)) if (m.done) claimMilestone(s, m.id, now);
  for (const pd of [...s.pending]) resolveAny(s, pd.id, 0, now);
  // Construction
  if (s.queues.build.length < 1) {
    let done = false;
    for (const type of p.build) { if (buildRequirement(s, type)) continue; const t = bestTile(s, type, mods); if (t && startBuild(s, type, t.x, t.y, now).ok) { done = true; break; } }
    if (!done) for (let y = 0; y < s.city.h && !done; y++) for (let x = 0; x < s.city.w && !done; x++) if (terrainAt(s, x, y) === 'rubble') done = startClear(s, x, y, now).ok;
    if (!done) {
      const th = allBuildings(s).find((b) => b.type === 'townhall');
      // Le joueur optimisé monte l'hôtel de ville en priorité ; les autres alternent
      if (p.smart || rng.chance(0.4)) done = startUpgrade(s, th.id, now).ok;
      const cands = allBuildings(s).filter((b) => b.level > 0 && b.type !== 'deco' && b.type !== 'townhall').sort((a, b) => a.level - b.level);
      for (const b of cands) { if (done) break; done = startUpgrade(s, b.id, now).ok; }
    }
  }
  if (!s.queues.research.length) { for (const id of Object.keys(TECHS).filter((t) => techStatus(s, t).status === 'available').sort(() => rng.random() - 0.5)) if (startResearch(s, id, now).ok) break; }
  // Armée (proportion selon le profil, en gardant de la nourriture)
  const types = Object.keys(UNITS).filter((u) => unitStatus(s, u).ok && UNITS[u].class !== 'special');
  if (types.length && !s.queues.train.length && rng.chance(p.army) && s.resources.food > 1500) train(s, rng.pick(types.filter((u) => u !== 'spy')), rng.int(5, 15), now);
  if ((s.army.scout || 0) < 3 && unitStatus(s, 'scout').ok) train(s, 'scout', 2, now);
  // Ouvriers
  unlockAutomation(s, now);
  if (s.workers.length < housing(s)) recruitWorker(s, null, now);
  if (s.workers.some((w) => !w.job)) assignMany(s, rng.pick(['food', 'wood', 'stone', 'iron']), 2, now);
  // Marches
  const w = s.world;
  if (s.marches.length < 2) {
    if (rng.chance(p.explore) && s.army.scout > 0) {
      sendMarch(s, { type: 'explore', x: Math.max(0, Math.min(w.size - 1, w.capital.x + rng.int(-14, 14))), y: Math.max(0, Math.min(w.size - 1, w.capital.y + rng.int(-14, 14))), units: { scout: 1 } }, now);
    } else if (rng.chance(p.attack)) {
      const ts = Object.values(w.pois).filter((pp) => POI_TYPES[pp.type].kind === 'danger' && !POI_TYPES[pp.type].dungeon && isRevealed(w, pp.x, pp.y) && !(pp.clearedUntil > now) && pp.danger <= 1 + Math.floor(thLevel(s) / 2));
      const units = Object.fromEntries(Object.entries(s.army).filter(([u, n]) => n > 0 && u !== 'scout' && u !== 'spy'));
      if (ts.length && Object.keys(units).length) sendMarch(s, { type: 'attack', ...(({ x, y }) => ({ x, y }))(rng.pick(ts)), units }, now);
    } else {
      const nodes = Object.values(w.pois).filter((pp) => POI_TYPES[pp.type].kind === 'gather' && isRevealed(w, pp.x, pp.y) && pp.amount > 100 && (pp.danger || 0) <= 1);
      const units = Object.fromEntries(Object.entries(s.army).filter(([u, n]) => n > 0 && UNITS[u]?.gather > 0 && u !== 'scout'));
      if (nodes.length && Object.keys(units).length) sendMarch(s, { type: 'gather', ...(({ x, y }) => ({ x, y }))(rng.pick(nodes)), units }, now);
    }
  }
  // Contrats & territoires
  if (rng.chance(p.contracts)) for (const c of [...(s.contracts || [])]) if (contractProgress(s, c).done) fulfillContract(s, c.id, now);
  if (rng.chance(p.territories * 0.2)) {
    for (let i = 0; i < 8; i++) { const x = w.capital.x + rng.int(-6, 6), y = w.capital.y + rng.int(-6, 6); if (claimTerritory(s, x, y, now).ok) break; }
  }
  for (const [k, t] of Object.entries(s.territories)) {
    if (!t.spec) setSpec(s, k, TERRITORY_SPECS[t.terrain][0].id);
    const need = 8 * (t.level || 1), have = Object.values(t.garrison || {}).reduce((a, b) => a + b, 0);
    if (have < need && (s.army.spearman || 0) >= need - have) setGarrison(s, k, { ...t.garrison, spearman: (t.garrison?.spearman || 0) + need - have });
    if (p.territories >= 1 && rng.chance(0.1)) upgradeOutpost(s, k);
  }
  if (p.sellSurplus) { const cap = storageCap(s, mods); for (const r of ['wood', 'stone', 'food']) if (s.resources[r] > cap * 0.9) sell(s, r, Math.floor(cap * 0.2), now); }
}

const isActive = (p, t) => {
  const hour = new Date(t).getUTCHours(), min = new Date(t).getUTCMinutes();
  if (p.sessions) return p.sessions.includes(hour) && min < 10;
  return hour >= p.from && hour < p.to && min % p.every < 10;
};

export function simulate(profileKey, days = 7, seed = 1) {
  const p = PROFILES[profileKey];
  rng.setSource(mulberry32(seed * 131 + profileKey.length * 7));
  const T0 = Date.UTC(2026, 5, 1, 0, 0);
  const s = createNewState({ seed: `prof${seed}`, now: T0 });
  let t = T0, famineMin = 0, cappedMin = 0, samples = 0;
  const STEP = 10 * 60000;
  for (let i = 0; i < (days * 24 * H) / STEP; i++) {
    t += STEP;
    advance(s, t);
    if (isActive(p, t)) session(s, p, t);
    if (s.famine) famineMin += 10;
    if (i % 6 === 0) {
      const cap = storageCap(s, computeMods(s, t));
      samples++;
      if (['wood', 'stone', 'food'].some((r) => isCapped(r) && s.resources[r] >= cap * 0.98)) cappedMin += 60;
    }
  }
  const mods = computeMods(s, t);
  const net = netRates(s, mods);
  const wealth = Object.entries(s.resources).reduce((a, [r, v]) => a + v * (RESOURCES[r].price || 1), 0);
  const out = {
    profile: p.name, th: thLevel(s), levels: totalLevels(s), techs: Object.keys(s.techs).length,
    army: Object.values(s.army).reduce((a, b) => a + b, 0), battlesWon: s.stats.battlesWon, battlesLost: s.stats.battlesLost, explored: s.stats.explored,
    territories: Object.keys(s.territories).length, contracts: s.stats.contracts || 0, goldPerH: Math.round(net.gold || 0), foodNet: Math.round(net.food || 0),
    wealth: Math.round(wealth), famineH: Math.round(famineMin / 60), cappedH: Math.round(cappedMin / 60), shards: shardState(s).count + shardState(s).tickets * 10,
    raidsLost: s.stats.raidsLost || 0, saveKB: Math.round(serialize(s).length / 1024),
  };
  rng.setSource(null);
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const days = +(process.argv[2] || 7), seeds = +(process.argv[3] || 2);
  const keys = Object.keys(PROFILES);
  const rows = keys.map((k) => {
    const runs = Array.from({ length: seeds }, (_, i) => simulate(k, days, i + 1));
    const avg = Object.fromEntries(Object.keys(runs[0]).map((f) => [f, typeof runs[0][f] === 'number' ? runs.reduce((a, r) => a + r[f], 0) / runs.length : runs[0][f]]));
    return avg;
  });
  const cols = ['profile', 'th', 'levels', 'techs', 'army', 'battlesWon', 'battlesLost', 'explored', 'territories', 'contracts', 'goldPerH', 'foodNet', 'wealth', 'famineH', 'cappedH', 'raidsLost', 'shards', 'saveKB'];
  console.log(`Simulation de ${days} jours, ${seeds} partie(s) par profil\n`);
  console.log('| ' + cols.join(' | ') + ' |');
  console.log('|' + cols.map(() => '---').join('|') + '|');
  for (const r of rows) console.log('| ' + cols.map((c) => (typeof r[c] === 'number' ? (Math.round(r[c] * 10) / 10) : r[c])).join(' | ') + ' |');
}
