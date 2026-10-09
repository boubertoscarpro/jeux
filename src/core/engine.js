import { computeMods } from '../systems/modifiers.js';
import { advanceEconomy } from '../systems/economy.js';
import { completeBuild } from '../systems/construction.js';
import { completeResearch } from '../systems/research.js';
import { completeTrain } from '../systems/army.js';
import { completeCraft } from '../systems/crafting.js';
import { processMarch, marchNextTime } from '../systems/marches.js';
import { completeCaravan, marketTick } from '../systems/market.js';
import { worldEventsTick } from '../systems/events.js';
import { worldUpkeep } from '../systems/world.js';
import { simulateGuild } from '../systems/guild.js';
import { rivalTick, resolveRaid } from '../systems/rivals.js';
import { giveXp } from '../systems/heroes.js';
import { log } from '../systems/log.js';
import { processExpedition, expNextTime } from '../systems/expeditions.js';
import { workforceTick } from '../systems/workforce.js';
import { automationTick } from '../systems/automation.js';
import { livingTick } from '../systems/living.js';
import { decisionsTick } from '../systems/decisions.js';
import { factionsTick, treatiesTick, enemySpyTick } from '../systems/factions.js';
import { contractsTick } from '../systems/market.js';
import { checkFeats, serverFeedTick } from '../systems/shards.js';
import { netRates } from '../systems/economy.js';
import { liveTick, liveNextTime, processLiveMarches } from '../systems/liveEvents.js';
import { bus } from './bus.js';

export const MAX_OFFLINE_MS = 12 * 3600 * 1000;
const WORLD_STEP = 60 * 1000;
const RIVAL_STEP = 10 * 60 * 1000;

function nextEventTime(state) {
  let t = Infinity;
  for (const k of ['build', 'research', 'train', 'craft']) for (const q of state.queues[k]) t = Math.min(t, q.end);
  for (const m of state.marches) t = Math.min(t, marchNextTime(m));
  for (const c of state.caravans) t = Math.min(t, c.end);
  for (const r of state.raids) t = Math.min(t, r.arrive);
  for (const e of state.expeditions || []) t = Math.min(t, expNextTime(e));
  t = Math.min(t, liveNextTime(state));
  t = Math.min(t, state.meta.nextWorldTick, state.nextRivalTick);
  return t;
}

function processDue(state, t) {
  let changed = false;
  for (const [k, fn] of [['build', completeBuild], ['research', completeResearch], ['train', completeTrain], ['craft', completeCraft]]) {
    const due = state.queues[k].filter((q) => q.end <= t).sort((a, b) => a.end - b.end);
    if (!due.length) continue;
    state.queues[k] = state.queues[k].filter((q) => q.end > t);
    for (const q of due) fn(state, q, q.end);
    changed = true;
  }
  for (const m of [...state.marches]) {
    if (marchNextTime(m) <= t) { processMarch(state, m, t); changed = true; }
  }
  for (const c of [...state.caravans]) if (c.end <= t) { completeCaravan(state, c, c.end); changed = true; }
  for (const e of [...(state.expeditions || [])]) if (expNextTime(e) <= t) { processExpedition(state, e, t); changed = true; }
  if (processLiveMarches(state, t)) changed = true;
  for (const r of [...state.raids]) if (r.arrive <= t) {
    state.raids = state.raids.filter((x) => x.id !== r.id);
    resolveRaid(state, r, r.arrive);
    changed = true;
  }
  if (state.meta.nextWorldTick <= t) {
    const dt = WORLD_STEP / 1000;
    const mods = computeMods(state, t);
    worldUpkeep(state, dt, t, mods);
    worldEventsTick(state, dt, t);
    livingTick(state, dt, t);
    marketTick(state, t);
    simulateGuild(state, dt, t);
    workforceTick(state, dt, t, mods);
    automationTick(state, t);
    decisionsTick(state, t);
    contractsTick(state, t);
    state._goldRate = netRates(state, mods).gold || 0;
    checkFeats(state, t);
    serverFeedTick(state, t);
    liveTick(state, t);
    for (const h of state.heroes) if (h.assignment) giveXp(state, h, 2, mods);
    state.meta.nextWorldTick = t + WORLD_STEP;
    changed = true;
  }
  if (state.nextRivalTick <= t) {
    factionsTick(state, t);
    treatiesTick(state, t);
    enemySpyTick(state, t);
    rivalTick(state, t);
    state.nextRivalTick = t + RIVAL_STEP;
  }
  return changed;
}

// Fait avancer la simulation jusqu'à `now` (gère aussi la progression hors-ligne)
export function advance(state, now = Date.now()) {
  let t = state.meta.lastTick || now;
  if (now <= t) return false;
  if (now - t > MAX_OFFLINE_MS) {
    const skipped = now - t - MAX_OFFLINE_MS;
    t = now - MAX_OFFLINE_MS;
    // Les échéances passées pendant la période ignorée sont recalées
    const shift = (o, k) => { if (o[k] < t) o[k] = t; };
    for (const k of ['build', 'research', 'train', 'craft']) for (const q of state.queues[k]) { q.start += 0; shift(q, 'end'); }
    log(state, 'info', `Absence prolongée : seules les 12 dernières heures sont simulées (${Math.round(skipped / 3600000)} h ignorées).`, now);
  }
  if (!state.meta.nextWorldTick) state.meta.nextWorldTick = t + WORLD_STEP;
  if (state.meta.nextWorldTick < t) state.meta.nextWorldTick = t;
  if (state.nextRivalTick < t) state.nextRivalTick = t + RIVAL_STEP;
  let changed = false;
  let guard = 0;
  while (t < now && guard++ < 50000) {
    const next = Math.min(now, Math.max(t, nextEventTime(state)));
    const mods = computeMods(state, t);
    advanceEconomy(state, (next - t) / 1000, mods);
    t = next;
    if (processDue(state, t)) changed = true;
  }
  state.meta.lastTick = now;
  if (changed) bus.emit('changed');
  return changed;
}
