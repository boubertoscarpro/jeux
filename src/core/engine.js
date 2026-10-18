import { npcTick } from '../systems/npcs.js';
import { ensurePlaces } from '../systems/places.js';
import { castleTick } from '../systems/castle.js';
import { chronicle } from '../systems/chronicle.js';
import { feat } from '../systems/log.js';
import { surveyTick } from '../systems/survey.js';
import { raidTick } from '../systems/raidOrders.js';
import { crisisTick, famineRelief } from '../systems/crises.js';
import { ecoSampleTick } from '../systems/ecoAdvice.js';
import { scenarioTick } from '../systems/scenarios.js';
import { codexTick } from '../systems/codex.js';
import { worldMarksTick } from '../systems/worldmarks.js';
import { breachTick } from '../systems/breach.js';
import { commissionsTick } from '../systems/commissions.js';
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
import { territoryTick } from '../systems/territory.js';
import { processPlanned } from '../systems/construction.js';
import { seasonTick } from '../systems/quests.js';
import { sagaTick } from '../systems/sagas.js';
import { policyTick } from '../systems/policy.js';
import { projectTick } from '../systems/projects.js';
import { warTick } from '../systems/warcampaign.js';
import { archaeoTick } from '../systems/archaeology.js';
import { recipesTick } from '../systems/recipes.js';
import { councilTick } from '../systems/council.js';
import { legacyTick } from '../systems/legacy.js';
import { challengesTick } from '../systems/challenges.js';
import { legendTick } from '../systems/legendary.js';
import { inventoryCapTick } from '../systems/crafting.js';
import { bus } from './bus.js';

export const MAX_OFFLINE_MS = 12 * 3600 * 1000;
const WORLD_STEP = 60 * 1000;
const RIVAL_STEP = 10 * 60 * 1000;

function nextEventTime(state) {
  let t = Infinity;
  const min = (v) => { if (Number.isFinite(v) && v < t) t = v; };
  // Une échéance invalide (NaN, absente) est ignorée au lieu de figer toute la simulation
  for (const k of ['build', 'research', 'train', 'craft']) for (const q of state.queues[k]) min(q.end);
  for (const m of state.marches) min(marchNextTime(m));
  for (const c of state.caravans) min(c.end);
  for (const r of state.raids) min(r.arrive);
  for (const e of state.expeditions || []) min(expNextTime(e));
  min(liveNextTime(state));
  min(state.meta.nextWorldTick); min(state.nextRivalTick);
  return t;
}

export function processDue(state, t) {
  let changed = false;
  for (const [k, fn] of [['build', completeBuild], ['research', completeResearch], ['train', completeTrain], ['craft', completeCraft]]) {
    const due = state.queues[k].filter((q) => q.end <= t).sort((a, b) => a.end - b.end);
    if (!due.length) continue;
    state.queues[k] = state.queues[k].filter((q) => q.end > t);
    for (const q of due) fn(state, q, q.end);
    if (k === 'build') processPlanned(state, t);
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
    crisisTick(state, t);
    famineRelief(state, t);
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
    territoryTick(state, dt, t);
    processPlanned(state, t);
    seasonTick(state, t);
    sagaTick(state, t);
    policyTick(state, t);
    projectTick(state, t);
    warTick(state, t);
    archaeoTick(state, t);
    recipesTick(state, t);
    councilTick(state, t);
    legacyTick(state, t);
    challengesTick(state, t);
    legendTick(state, t);
    breachTick(state, t);
    castleWorldTick(state, t, dt);
    commissionsTick(state, t);
    worldMarksTick(state, t);
    codexTick(state, t);
    scenarioTick(state, t);
    inventoryCapTick(state, t);
    ecoSampleTick(state, t);
    npcTick(state, t);
    surveyTick(state, t);
    raidTick(state, t);
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

// Décale tous les horodatages de la partie (millisecondes depuis 1970, entre 2017 et 2096) de `d` ms.
// Utilisé quand l'horloge de l'appareil recule. Les grands tableaux (terrain, brouillard) sont ignorés.
const TS_MIN = 1.5e12, TS_MAX = 4e12;
const NOT_TIME = new Set(['seed', 'resources', 'stats', 'records', 'army', 'revealed', 'terrain', 'prices']);
export function shiftTimeline(state, d) {
  const walk = (o, depth) => {
    if (!o || typeof o !== 'object' || depth > 8) return;
    if (Array.isArray(o)) { if (o.length > 2000) return; for (let i = 0; i < o.length; i++) { const v = o[i]; if (typeof v === 'number') { if (v > TS_MIN && v < TS_MAX) o[i] = v + d; } else walk(v, depth + 1); } return; }
    for (const k of Object.keys(o)) {
      if (NOT_TIME.has(k)) continue;
      const v = o[k];
      if (typeof v === 'number') { if (v > TS_MIN && v < TS_MAX) o[k] = v + d; } else walk(v, depth + 1);
    }
  };
  walk(state, 0);
}

// Fait avancer la simulation jusqu'à `now` (gère aussi la progression hors-ligne)
export function advance(state, now = Date.now()) {
  let t = state.meta.lastTick || now;
  // Horloge reculée (changement d'heure manuel, sauvegarde venue d'un appareil en avance) :
  // on repart de maintenant au lieu de figer le royaume jusqu'à ce que l'heure rattrape l'ancienne date
  if (t - now > 60000) {
    // Toute la chronologie (échéances, délais, historique) est décalée du même écart : un chantier à qui il restait
    // 2 min finit toujours dans 2 min, au lieu d'attendre que l'horloge rattrape l'ancienne date
    shiftTimeline(state, now - t);
    log(state, 'info', `⏰ L’horloge de l’appareil a reculé de ${Math.round((t - now) / 60000)} min : la simulation reprend à l’heure actuelle.`, now);
    state.meta.lastTick = now;
    state.meta.nextWorldTick = Math.min(state.meta.nextWorldTick || now, now + WORLD_STEP);
    state.nextRivalTick = Math.min(state.nextRivalTick || now, now + RIVAL_STEP);
    return true;
  }
  // Forteresses de la Brèche : placées dès la première avance (nouvelle partie ou ancienne sauvegarde)
  if (!state.breach?.placed) breachTick(state, Math.min(now, t));
  if (now <= t) return false;
  if (now - t > MAX_OFFLINE_MS) {
    const skipped = now - t - MAX_OFFLINE_MS;
    t = now - MAX_OFFLINE_MS;
    // Les échéances passées pendant la période ignorée sont recalées
    // Toutes les échéances tombées dans la période ignorée sont recalées au début de la période simulée
    const shift = (o, ...ks) => { for (const k of ks) if (Number.isFinite(o[k]) && o[k] < t) o[k] = t; };
    for (const k of ['build', 'research', 'train', 'craft']) for (const q of state.queues[k]) shift(q, 'end');
    for (const m of [...state.marches, ...(state.live?.marches || [])]) shift(m, 'arrive', 'workEnd', 'returnAt');
    for (const c of state.caravans) shift(c, 'end');
    for (const r of state.raids) shift(r, 'arrive');
    for (const e of state.expeditions || []) {
      // Expédition au travail : toute sa fenêtre de travail glisse (sinon la période ignorée compterait comme travaillée)
      if (e.status === 'work' && Number.isFinite(e.workEnd) && e.workEnd < t) { const d = t - e.workEnd; e.lastAcc = (e.lastAcc || 0) + d; e.workStart = (e.workStart || 0) + d; e.workEnd = t; }
      shift(e, 'arrive', 'workEnd', 'returnAt', 'nextEventAt', 'decisionAt');
    }
    for (const p of state.pending) shift(p, 'deadline');
    log(state, 'info', `Absence prolongée : seules les 12 dernières heures sont simulées (${Math.round(skipped / 3600000)} h ignorées).`, now);
  }
  if (!state.meta.nextWorldTick) state.meta.nextWorldTick = t + WORLD_STEP;
  if (state.meta.nextWorldTick < t) state.meta.nextWorldTick = t;
  if (state.nextRivalTick < t) state.nextRivalTick = t + RIVAL_STEP;
  let changed = false;
  let guard = 0;
  while (t < now && guard++ < 50000) {
    const next = Math.min(now, Math.max(t, nextEventTime(state)));
    if (!Number.isFinite(next)) break;
    const mods = computeMods(state, t);
    advanceEconomy(state, (next - t) / 1000, mods);
    t = next;
    if (processDue(state, t)) changed = true;
  }
  state.meta.lastTick = now;
  if (changed) bus.emit('changed');
  return changed;
}

// v16 : réparation de la muraille, passage d'un palier de silhouette (moment marquant : chronique et annonce)
function castleWorldTick(state, t, dt) {
  for (const p of ensurePlaces(state)) log(state, 'good', `🏛️ Un nouveau lieu ouvre ses portes : ${p.name}.`, t);
  const st = castleTick(state, t, dt / 3600);
  if (st) {
    chronicle(state, `🏰 ${state.meta.kingdomName} devient ${st.name.toLowerCase()} : ${st.text}`, t);
    feat('🏰', `Votre château devient ${st.name.toLowerCase()}`, st.text, 'good');
  }
}
