// Sagas des Terres Brisées : chaînes de quêtes narratives, une étape à la fois, avec conséquences durables.
import { SAGAS as CLASSIC } from '../data/sagas.js';
import { CHRONICLES } from '../data/chronicles.js';
import { PICKERS, defaultContext } from './chronicles.js';

// Sagas classiques et chroniques du monde partagent le même moteur
export const SAGAS = { ...CLASSIC, ...CHRONICLES };
const DEFAULT_COOLDOWN_H = 96;
import { RIVALS } from '../data/world.js';
import { rng } from '../core/rng.js';
import { uid, fmt } from '../core/util.js';
import { thLevel } from './city.js';
import { armyTotals } from './economy.js';
import { applyDecisionFx } from './decisions.js';
import { chronicle } from './chronicle.js';
import { log, toast } from './log.js';
import { key } from './world.js';

const STEP_TTL = 4 * 3600000;
export const sagaState = (state) => (state.sagas ||= { active: null, done: {}, nextAt: 0, log: [] });

export function fillText(s, ctx) {
  return String(s).replace(/\{town\}/g, ctx.townName || 'une cité libre').replace(/\{faction\}/g, RIVALS[ctx.faction]?.name || 'une faction').replace(/\{faction2\}/g, RIVALS[ctx.faction2]?.name || 'une faction rivale').replace(/\{food\}/g, fmt(ctx.food)).replace(/\{grievance\}/g, ctx.grievance || 'vos affronts');
}

export function sagaTick(state, now) {
  const S = sagaState(state);
  const th = thLevel(state);
  // Une nouvelle saga environ toutes les 3 à 5 h de jeu, jamais deux en même temps
  if (!S.active && th >= 2 && now >= (S.nextAt || 0)) {
    // Histoires possibles : niveau suffisant, délai de reprise écoulé, et situation réellement présente dans le monde
    const pool = [];
    for (const [k, sg] of Object.entries(SAGAS)) {
      if (sg.minTH > th) continue;
      if (S.done[k] && now - S.done[k] < (sg.cooldownH ?? DEFAULT_COOLDOWN_H) * 3600000) continue;
      const ctx = PICKERS[k] ? PICKERS[k](state, now) : defaultContext(state, k);
      if (!ctx) continue;
      // Les chroniques nées de la situation du moment et les histoires jamais jouées passent en priorité
      pool.push({ k, ctx, weight: (sg.chronicle ? 2 : 1) * (S.done[k] ? 1 : 2) });
    }
    if (pool.length) {
      const pick = rng.weighted(pool);
      S.active = { id: pick.k, step: 'start', at: now, town: pick.ctx.town || null, townName: pick.ctx.townName, faction: pick.ctx.faction ?? 0, faction2: pick.ctx.faction2 ?? 1, grievance: pick.ctx.grievance || null, food: Math.round(1200 + th * 500), choices: [] };
    }
    S.nextAt = now + rng.int(180, 300) * 60000;
  }
  // L'étape active devient une décision en attente quand son heure arrive
  const a = S.active;
  if (a && a.at <= now && !state.pending.some((p) => p.kind === 'saga')) {
    const saga = SAGAS[a.id];
    const st = saga.steps[a.step];
    state.pending.push({ id: uid('sg'), kind: 'saga', saga: a.id, step: a.step, t: now, deadline: now + STEP_TTL, title: fillText(st.title, a), text: fillText(st.text, a), town: a.town, townName: a.townName, faction: a.faction, faction2: a.faction2, grievance: a.grievance, food: a.food });
    toast(`${saga.icon} Saga : ${fillText(st.title, a)}`, 'event');
  }
  for (const p of [...state.pending]) if (p.kind === 'saga' && p.deadline <= now) resolveSaga(state, p.id, SAGAS[p.saga].steps[p.step].default, now, true);
}

export function describeSaga(p) {
  const saga = SAGAS[p.saga];
  const st = saga.steps[p.step];
  const ctx = { townName: p.townName, faction: p.faction, faction2: p.faction2, food: p.food, grievance: p.grievance };
  return { icon: saga.icon, title: `${fillText(saga.title, ctx)} — ${p.title}`, text: p.text, choices: st.choices.map((c) => ({ label: fillText(c.label, ctx), hint: fillText(c.hint || '', ctx) })), deadline: p.deadline, def: st.default };
}

export function resolveSaga(state, pid, idx, now = Date.now(), auto = false) {
  const p = state.pending.find((x) => x.id === pid);
  if (!p || p.kind !== 'saga') return { ok: false, reason: 'Décision introuvable' };
  const S = sagaState(state);
  const saga = SAGAS[p.saga];
  const ch = saga.steps[p.step].choices[idx];
  if (!ch) return { ok: false };
  const fx = ch.fx || {};
  const cost = {};
  for (const [r, v] of Object.entries(fx.res || {})) if (v < 0) cost[r] = r === 'food' && v === -1 ? p.food : -v;
  if (!auto && Object.entries(cost).some(([r, v]) => (state.resources[r] || 0) < v)) return { ok: false, reason: `Ressources insuffisantes (${Object.entries(cost).map(([r, v]) => `${fmt(v)} ${r}`).join(', ')})` };
  if (!auto && fx.fight && !Object.entries(armyTotals(state)).some(([u, n]) => n > 0 && u !== 'scout' && u !== 'spy')) return { ok: false, reason: 'Aucun soldat disponible pour ce combat' };
  state.pending = state.pending.filter((x) => x.id !== pid);
  const text = applyDecisionFx(state, p, fx, now);
  const label = describeSaga(p).choices[idx].label;
  (S.log ||= []).unshift({ t: now, saga: p.saga, title: p.title, choice: label, text });
  if (S.log.length > 30) S.log.length = 30;
  log(state, 'story', `${saga.icon} ${p.title} — ${auto ? 'faute de réponse : ' : ''}« ${label} ». ${text}`, now);
  if (S.active) {
    S.active.choices.push(idx);
    if (ch.next) { S.active.step = ch.next[0]; S.active.at = now + ch.next[1] * 60000; }
    else {
      S.done[p.saga] = now;
      S.count = (S.count || 0) + 1;
      (S.endings ||= {})[p.saga] = [...new Set([...(S.endings[p.saga] || []), `${p.step}:${idx}`])];
      chronicle(state, `${saga.icon} ${saga.chronicle ? 'Chronique' : 'Saga'} « ${fillText(saga.title, p)} » : ${p.title} — le souverain choisit « ${label} ».`, now);
      S.active = null;
    }
  }
  return { ok: true, text };
}
