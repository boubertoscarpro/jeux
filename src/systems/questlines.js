// Quêtes du royaume : chaînes à étapes (voir data/questlines.js). Une quête s'ouvre quand sa condition est remplie ;
// chaque étape mesure la progression depuis son ouverture (instantané des statistiques), se valide toute seule et
// sa récompense se réclame une fois. Complète le parcours guidé (chapitres) sans le remplacer.
import { QUESTLINES, QUESTLINE_BY_ID } from '../data/questlines.js';
import { countOf, levelOf } from './city.js';
import { combatUnitCount } from './army.js';
import { computeMods } from './modifiers.js';
import { netRates, roadConnected } from './economy.js';
import { outpostStatus } from './territory.js';
import { grantReward } from './rewards.js';
import { chronicle } from './chronicle.js';
import { log, toast } from './log.js';

export function qlState(state) {
  const q = (state.questlines && typeof state.questlines === 'object' && !Array.isArray(state.questlines)) ? state.questlines : (state.questlines = {});
  for (const k of ['active', 'done', 'claimed']) if (!q[k] || typeof q[k] !== 'object' || Array.isArray(q[k])) q[k] = {};
  return q;
}

// Instantané des compteurs au moment où une étape s'ouvre
function snapshot(state) {
  const { produced, ...rest } = state.stats || {};
  const base = {};
  for (const [k, v] of Object.entries(rest)) if (typeof v === 'number') base[k] = v;
  base.produced = { ...(produced || {}) };
  return base;
}

function helpers(state, base) {
  return {
    count: countOf,
    level: levelOf,
    d: (k) => Math.max(0, (state.stats?.[k] || 0) - (base?.[k] || 0)),
    prod: (r) => Math.max(0, Math.floor((state.stats?.produced?.[r] || 0) - (base?.produced?.[r] || 0))),
    combatUnits: () => combatUnitCount(state.army),
    foodNet: () => netRates(state, computeMods(state)).food || 0,
    roadLinked: () => [...roadConnected(state)].filter((id) => state.city.buildings[id]?.type !== 'road').length,
    fullOutposts: () => Object.values(state.territories || {}).filter((t) => t.spec && outpostStatus(state, t).eff >= 1).length,
  };
}

function stepProgress(state, line, a, i) {
  const step = line.steps[i];
  if (!step) return { cur: 0, target: 1, done: false };
  if (a.done?.[i]) return { cur: 1, target: 1, done: true };
  let cur = 0, target = 1;
  try { [cur, target] = step.check(state, helpers(state, a.base)); } catch { cur = 0; }
  return { cur: Math.min(cur, target), target, done: cur >= target };
}

// Ouvre les quêtes débloquées et valide les étapes atteintes ; ne verse jamais de récompense
export function questTick(state, now = Date.now()) {
  const Q = qlState(state);
  const events = [];
  for (const line of QUESTLINES) {
    if (Q.done[line.id]) continue;
    let a = Q.active[line.id];
    if (!a) {
      let ok = false;
      try { ok = line.unlock(state, helpers(state, null)); } catch { ok = false; }
      if (!ok) continue;
      a = Q.active[line.id] = { step: 0, base: snapshot(state), at: now, done: {}, claimed: {} };
      log(state, 'story', `${line.icon} Nouvelle quête : « ${line.title} ». ${line.intro}`, now);
      events.push({ kind: 'open', line });
    }
    // Plusieurs étapes peuvent se valider d'un coup (ex. retour d'absence) : chacune ouvre la suivante
    for (let guard = 0; guard < line.steps.length && a.step < line.steps.length; guard++) {
      const p = stepProgress(state, line, a, a.step);
      if (!p.done) break;
      a.done[a.step] = now;
      events.push({ kind: 'step', line, i: a.step });
      a.step++;
      a.base = snapshot(state);
    }
    if (a.step >= line.steps.length && !Q.done[line.id]) {
      Q.done[line.id] = now;
      chronicle(state, `${line.icon} Quête accomplie : « ${line.title} ».`, now);
      toast(`${line.icon} Quête accomplie : ${line.title}`, 'good');
      events.push({ kind: 'done', line });
    }
  }
  return events;
}

// Vue détaillée pour l'interface
export function questlineList(state) {
  const Q = qlState(state);
  return QUESTLINES.map((line) => {
    const a = Q.active[line.id];
    const finished = !!Q.done[line.id];
    let unlocked = !!a;
    if (!unlocked) { try { unlocked = !!line.unlock(state, helpers(state, null)); } catch { unlocked = false; } }
    const steps = line.steps.map((st, i) => {
      const done = !!a?.done?.[i];
      const current = !!a && !finished && a.step === i;
      const p = current ? stepProgress(state, line, a, i) : { cur: done ? 1 : 0, target: 1 };
      return { ...st, i, done, current, claimed: !!a?.claimed?.[i], cur: p.cur, target: p.target, locked: !a || (!done && !current) };
    });
    const toClaim = steps.filter((s) => s.done && !s.claimed).length + (finished && !Q.claimed[line.id] ? 1 : 0);
    return { ...line, active: !!a, unlocked, finished, finalClaimed: !!Q.claimed[line.id], steps, current: steps.find((s) => s.current) || null, toClaim, stepIndex: a ? Math.min(a.step, line.steps.length) : 0 };
  });
}

export const questlinesBadge = (state) => { try { return questlineList(state).reduce((n, l) => n + l.toClaim, 0); } catch { return 0; } };

export function claimQuestStep(state, lineId, i, now = Date.now()) {
  const Q = qlState(state);
  const line = QUESTLINE_BY_ID[lineId];
  const a = Q.active[lineId];
  if (!line || !a) return { ok: false, reason: 'Quête inconnue ou pas encore ouverte' };
  const step = line.steps[i];
  if (!step) return { ok: false, reason: 'Étape inconnue' };
  if (!a.done[i]) return { ok: false, reason: 'Étape pas encore accomplie' };
  if (a.claimed[i]) return { ok: false, reason: 'Récompense déjà réclamée' };
  a.claimed[i] = now;
  const text = grantReward(state, step.reward, now);
  log(state, 'good', `✅ ${line.title} — ${step.title} : ${text}.`, now);
  return { ok: true, text };
}

export function claimQuestFinal(state, lineId, now = Date.now()) {
  const Q = qlState(state);
  const line = QUESTLINE_BY_ID[lineId];
  if (!line) return { ok: false, reason: 'Quête inconnue' };
  if (!Q.done[lineId]) return { ok: false, reason: 'Quête pas encore terminée' };
  if (Q.claimed[lineId]) return { ok: false, reason: 'Récompense déjà réclamée' };
  Q.claimed[lineId] = now;
  const text = grantReward(state, line.final || {}, now);
  log(state, 'good', `🏆 Quête « ${line.title} » terminée : ${text}.`, now);
  return { ok: true, text };
}
