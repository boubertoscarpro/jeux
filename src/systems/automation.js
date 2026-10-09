import { TRADABLE } from '../data/resources.js';
import { AUTOMATION_LEVELS, ORDER_CONDITIONS, ORDER_ACTIONS } from '../data/automation.js';
import { WORK_SECTORS } from '../data/workers.js';
import { RESOURCES } from '../data/resources.js';
import { UNITS } from '../data/units.js';
import { BUILDINGS, buildingCost } from '../data/buildings.js';
import { TECHS, techCost } from '../data/techs.js';
import { uid, fmt } from '../core/util.js';
import { thLevel, allBuildings, levelOf } from './city.js';
import { pay, missing } from './economy.js';
import { automationLevel, assignMany, isAvailable } from './workforce.js';
import { relaunchIdle, recallExpedition } from './expeditions.js';
import { sell, buy } from './market.js';
import { train } from './army.js';
import { startBrew } from './crafting.js';
import { donate } from './guild.js';
import { recallMarch } from './marches.js';
import { techStatus, startResearch } from './research.js';
import { calendar, chronicle } from './chronicle.js';
import { log } from './log.js';

export { automationLevel };
export const orderSlots = (state) => AUTOMATION_LEVELS.slice(0, automationLevel(state) + 1).reduce((m, l) => Math.max(m, l.orders || 0), 0);
export const hasUnlock = (state, key) => AUTOMATION_LEVELS.slice(0, automationLevel(state) + 1).some((l) => l.unlocks.includes(key));

export function nextAutomation(state) { return AUTOMATION_LEVELS[automationLevel(state) + 1] || null; }

export function unlockAutomation(state, now = Date.now()) {
  const next = nextAutomation(state);
  if (!next) return { ok: false, reason: 'Intendance maximale' };
  if (thLevel(state) < next.th) return { ok: false, reason: `Hôtel de ville niv. ${next.th} requis` };
  if (!pay(state, next.cost)) return { ok: false, reason: 'Ressources insuffisantes', missing: missing(state, next.cost) };
  state.automation.level = next.lvl;
  chronicle(state, `Le royaume franchit une étape d’intendance : « ${next.name} ».`, now);
  return { ok: true, level: next };
}

// ---------- Priorités ----------
export const SECTOR_RES = { food: 'food', wood: 'wood', stone: 'stone', iron: 'iron', industry: 'steel', gold: 'gold' };

export function priorityTick(state, now) {
  const p = state.priorities;
  if (!p?.enabled || automationLevel(state) < 4) return;
  if (now - (p.last || 0) < 5 * 60000) return;
  p.last = now;
  const moves = [];
  const stock = (s) => state.resources[SECTOR_RES[s]] || 0;
  const th = (s) => p.thresholds[s] || {};
  // 1) Les inactifs vont au secteur le plus prioritaire non saturé
  const idle = state.workers.filter((w) => isAvailable(w, now) && !w.foreman).length;
  if (idle) {
    const target = p.order.find((s) => !th(s).max || stock(s) < th(s).max) || p.order[0];
    const n = assignMany(state, target, idle, now, false);
    if (n) moves.push(`${n} inactif(s) → ${WORK_SECTORS[target].name}`);
  }
  // 2) Pénurie : renforcer le secteur, en prenant aux moins prioritaires
  for (const s of p.order) {
    if (th(s).min && stock(s) < th(s).min) {
      const n = assignMany(state, s, 2, now, true);
      if (n) moves.push(`${n} → ${WORK_SECTORS[s].name} (${RESOURCES[SECTOR_RES[s]].name} ${fmt(stock(s))} < ${fmt(th(s).min)})`);
      break;
    }
  }
  // 3) Surplus : libérer des ouvriers vers le secteur suivant qui en a besoin
  for (const s of p.order) {
    if (th(s).max && stock(s) > th(s).max) {
      const dest = p.order.find((o) => o !== s && (!th(o).max || stock(o) < th(o).max));
      if (!dest) continue;
      const ws = state.workers.filter((w) => w.job?.type === 'sector' && w.job.sector === s && !w.foreman).slice(0, 2);
      ws.forEach((w) => { w.job = { type: 'sector', sector: dest }; });
      if (ws.length) moves.push(`${ws.length} : ${WORK_SECTORS[s].name} → ${WORK_SECTORS[dest].name} (surplus)`);
    }
  }
  if (moves.length) {
    p.lastMoves = { t: now, moves };
    log(state, 'info', `📋 Priorités : ${moves.join(' ; ')}.`, now);
  }
}

// ---------- Ordres du royaume ----------
export function addOrder(state, order) {
  if (automationLevel(state) < 4) return { ok: false, reason: 'Palier d’Intendance 4 (Gestionnaire) requis' };
  if (state.orders.length >= orderSlots(state)) return { ok: false, reason: `Maximum ${orderSlots(state)} ordres à ce palier` };
  const a = ORDER_ACTIONS[order.action?.type];
  const c = ORDER_CONDITIONS[order.cond?.type];
  if (!a || !c) return { ok: false, reason: 'Ordre incomplet' };
  if (a.min > automationLevel(state)) return { ok: false, reason: `Action disponible au palier ${a.min}` };
  if (c.min && c.min > automationLevel(state)) return { ok: false, reason: `Condition disponible au palier ${c.min}` };
  state.orders.push({ id: uid('o'), name: order.name || 'Ordre', enabled: true, cond: order.cond, action: order.action, cooldown: order.cooldown ?? 10, lastRun: 0, runs: 0, lastMsg: '' });
  return { ok: true };
}
export function removeOrder(state, id) { state.orders = state.orders.filter((o) => o.id !== id); return { ok: true }; }
export function toggleOrder(state, id) { const o = state.orders.find((x) => x.id === id); if (o) o.enabled = !o.enabled; return { ok: true }; }
export function moveOrder(state, id, dir) {
  const i = state.orders.findIndex((o) => o.id === id), j = i + dir;
  if (i < 0 || j < 0 || j >= state.orders.length) return { ok: false };
  [state.orders[i], state.orders[j]] = [state.orders[j], state.orders[i]];
  return { ok: true };
}

export function describeOrder(o) {
  const c = o.cond, a = o.action;
  const res = (r) => RESOURCES[r]?.name || r;
  const cond = {
    resBelow: () => `${res(c.res)} < ${fmt(c.value)}`, resAbove: () => `${res(c.res)} > ${fmt(c.value)}`, every: () => `toutes les ${c.minutes} min`,
    idleWorkers: () => `ouvriers inactifs ≥ ${c.value}`, unitBelow: () => `${UNITS[c.unit]?.name || c.unit} en ville < ${c.value}`, raid: () => 'un raid approche',
    damaged: () => 'un bâtiment est endommagé', season: () => `saison = ${c.season}`, expIdle: () => 'une équipe est au repos',
  }[c.type]?.() || '?';
  const act = {
    assign: () => `affecter ${a.count} ouvriers → ${WORK_SECTORS[a.sector]?.name}`, sellAbove: () => `vendre le ${res(a.res)} au-delà de ${fmt(a.value)}`,
    buy: () => `acheter ${fmt(a.count)} ${res(a.res)}`, train: () => `former ${a.count} ${UNITS[a.unit]?.name}`, relaunch: () => 'relancer les expéditions',
    pauseChain: () => `pause : ${BUILDINGS[a.building]?.name}`, resumeChain: () => `relancer : ${BUILDINGS[a.building]?.name}`, brew: () => `distiller ${a.count} potions de soin`,
    donate: () => `donner ${fmt(a.count)} ${res(a.res)} à la guilde`, repair: () => 'réparer les bâtiments', recall: () => 'rappeler les troupes', research: () => 'lancer la recherche prioritaire',
  }[a.type]?.() || '?';
  return `SI ${cond} → ${act}`;
}

function checkCond(state, o, now) {
  const c = o.cond;
  const v = (r) => state.resources[r] || 0;
  switch (c.type) {
    case 'resBelow': return v(c.res) < c.value;
    case 'resAbove': return v(c.res) > c.value;
    case 'every': return now - (o.lastRun || 0) >= c.minutes * 60000;
    case 'idleWorkers': return state.workers.filter((w) => isAvailable(w, now) && !w.foreman).length >= c.value;
    case 'unitBelow': return (state.army[c.unit] || 0) < c.value;
    case 'raid': return state.raids.length > 0;
    case 'damaged': return allBuildings(state).some((b) => b.damaged);
    case 'season': return calendar(state, now).season.key === c.season;
    case 'expIdle': return state.expeditions.some((t) => t.status === 'idle' && t.workerIds.length);
    default: return false;
  }
}

function runAction(state, o, now) {
  const a = o.action;
  switch (a.type) {
    case 'assign': { const n = assignMany(state, a.sector, a.count, now, true); return n ? { ok: true, msg: `${n} ouvrier(s) affecté(s)` } : { ok: false, reason: 'aucun ouvrier disponible' }; }
    case 'sellAbove': {
      if (!TRADABLE.includes(a.res)) return { ok: false, reason: `${a.res} ne se vend pas` }; const q = Math.min(20000, Math.floor((state.resources[a.res] || 0) - a.value)); return q > 0 ? withMsg(sell(state, a.res, q, now), (r) => `vendu ${fmt(q)} (+${fmt(r.gold)} or)`) : { ok: false, reason: 'pas de surplus' }; }
    case 'buy': return withMsg(buy(state, a.res, a.count, now), (r) => `acheté (−${fmt(r.gold)} or)`);
    case 'train': return withMsg(train(state, a.unit, a.count, now), () => `${a.count} en formation`);
    case 'relaunch': { const n = relaunchIdle(state, now, true); return n ? { ok: true, msg: `${n} équipe(s) relancée(s)` } : { ok: false, reason: 'aucune équipe prête' }; }
    case 'pauseChain': case 'resumeChain': {
      const bs = allBuildings(state).filter((b) => b.type === a.building && b.level > 0);
      const pause = a.type === 'pauseChain';
      const changed = bs.filter((b) => !!b.paused !== pause);
      changed.forEach((b) => { b.paused = pause; });
      return changed.length ? { ok: true, msg: `${changed.length} bâtiment(s) ${pause ? 'en pause' : 'relancé(s)'}` } : { ok: false, reason: 'déjà fait' };
    }
    case 'brew': return withMsg(startBrew(state, 'healPotion', a.count, now), () => 'distillation lancée');
    case 'donate': return withMsg(donate(state, a.res, a.count, now), () => 'don effectué');
    case 'repair': { const n = repairAll(state, now); return n ? { ok: true, msg: `${n} bâtiment(s) réparé(s)` } : { ok: false, reason: 'rien à réparer ou ressources manquantes' }; }
    case 'recall': {
      let n = 0;
      for (const m of [...state.marches]) if (m.phase !== 'back' && recallMarch(state, m.id, now).ok) n++;
      for (const t of state.expeditions) if (['out', 'work'].includes(t.status) && t.type === 'mercenary' && recallExpedition(state, t.id, now).ok) n++;
      return n ? { ok: true, msg: `${n} groupe(s) rappelé(s)` } : { ok: false, reason: 'personne à rappeler' };
    }
    case 'research': return autoResearch(state, now, true);
    default: return { ok: false, reason: 'action inconnue' };
  }
}
const withMsg = (r, f) => (r?.ok ? { ok: true, msg: f(r) } : { ok: false, reason: r?.reason || 'échec' });

export function ordersTick(state, now) {
  if (automationLevel(state) < 4) return;
  const slots = orderSlots(state);
  state.orders.slice(0, slots).forEach((o) => {
    if (!o.enabled) return;
    if (o.cond.type !== 'every' && now - (o.lastRun || 0) < (o.cooldown || 0) * 60000) return;
    if (!checkCond(state, o, now)) return;
    const r = runAction(state, o, now);
    o.lastRun = now;
    if (r.ok) {
      o.runs++;
      o.lastMsg = `${r.msg}`;
      state.stats.ordersRun = (state.stats.ordersRun || 0) + 1;
      (state.orderLog ||= []).unshift({ t: now, name: o.name, msg: r.msg });
      if (state.orderLog.length > 60) state.orderLog.length = 60;
    } else o.lastMsg = `⚠ ${r.reason}`;
  });
}

// ---------- Recherche automatique ----------
export const RESEARCH_FOCUS = {
  iron: { name: 'Production de fer et d’acier', keys: ['prod.iron', 'prod.steel', 'prod.stone'] },
  food: { name: 'Agriculture et vivres', keys: ['prod.food', 'prod.grain', 'prod.bread', 'upkeep'] },
  gold: { name: 'Or et commerce', keys: ['prod.gold', 'market.fee', 'caravan.gain', 'caravans'] },
  war: { name: 'Puissance militaire', keys: ['combat.atk', 'combat.def', 'combat.morale', 'train.speed'] },
  explore: { name: 'Exploration et récolte', keys: ['gather.all', 'loot.rare', 'explore.speed', 'march.speed', 'carry'] },
  build: { name: 'Construction et stockage', keys: ['build.speed', 'storage.pct', 'buildQueue', 'build.cost'] },
  defense: { name: 'Défense', keys: ['city.def', 'wall.pct', 'protect'] },
};

export function autoResearch(state, now, force = false) {
  if (!force && !(state.autoResearch?.enabled && automationLevel(state) >= 5)) return { ok: false };
  if (state.queues.research.length) return { ok: false, reason: 'recherche déjà en cours' };
  const focus = RESEARCH_FOCUS[state.autoResearch?.focus] || null;
  const avail = Object.keys(TECHS).filter((id) => techStatus(state, id).status === 'available' && !TECHS[id].mastery);
  if (!avail.length) return { ok: false, reason: 'aucune technologie disponible' };
  const score = (id) => (focus && Object.keys(TECHS[id].mods).some((k) => focus.keys.includes(k)) ? 0 : 1) * 10 + TECHS[id].tier;
  const sorted = avail.sort((a, b) => score(a) - score(b));
  for (const id of sorted) {
    const r = startResearch(state, id, now);
    if (r.ok) { log(state, 'info', `🔬 Les chercheurs entament « ${TECHS[id].name} »${focus ? ` (mission : ${focus.name})` : ''}.`, now); return { ok: true, msg: TECHS[id].name }; }
  }
  return { ok: false, reason: 'ressources insuffisantes' };
}

// ---------- Dégâts & réparations ----------
export const repairCost = (b) => Object.fromEntries(Object.entries(buildingCost(b.type, Math.max(1, b.level))).map(([r, v]) => [r, Math.ceil(v * 0.25)]));
export function repairBuilding(state, bid) {
  const b = state.city.buildings[bid];
  if (!b?.damaged) return { ok: false, reason: 'Intact' };
  const cost = repairCost(b);
  if (!pay(state, cost)) return { ok: false, reason: 'Ressources insuffisantes', missing: missing(state, cost) };
  b.damaged = false;
  return { ok: true };
}
export function repairAll(state, now) {
  let n = 0;
  for (const b of allBuildings(state)) if (b.damaged && repairBuilding(state, b.id).ok) n++;
  return n;
}

// Tick de l'automatisation (chaque minute de jeu)
export function automationTick(state, now) {
  priorityTick(state, now);
  ordersTick(state, now);
  autoResearch(state, now);
  if (hasUnlock(state, 'autoRepair') && state.automation.autoRepair) repairAll(state, now);
  if (hasUnlock(state, 'repeat')) relaunchIdle(state, now);
  void levelOf; void techCost;
}
