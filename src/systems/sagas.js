// Sagas des Terres Brisées : chaînes de quêtes narratives, une étape à la fois, avec conséquences durables.
import { SAGAS } from '../data/sagas.js';
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

function fillText(s, ctx) {
  return String(s).replace(/\{town\}/g, ctx.townName || 'une cité libre').replace(/\{faction\}/g, RIVALS[ctx.faction]?.name || 'une faction').replace(/\{faction2\}/g, RIVALS[ctx.faction2]?.name || 'une faction rivale').replace(/\{food\}/g, fmt(ctx.food));
}

export function sagaTick(state, now) {
  const S = sagaState(state);
  const th = thLevel(state);
  // Une nouvelle saga environ toutes les 3 à 5 h de jeu, jamais deux en même temps
  if (!S.active && th >= 2 && now >= (S.nextAt || 0)) {
    const pool = Object.entries(SAGAS).filter(([k, s]) => !S.done[k] && s.minTH <= th);
    if (pool.length) {
      const [k] = rng.pick(pool);
      const towns = Object.values(state.world.pois).filter((p) => p.type === 'town');
      const town = towns.length ? rng.pick(towns) : null;
      const f1 = rng.int(0, RIVALS.length - 1);
      let f2 = rng.int(0, RIVALS.length - 1); if (f2 === f1) f2 = (f1 + 1) % RIVALS.length;
      S.active = { id: k, step: 'start', at: now, town: town ? key(town.x, town.y) : null, townName: town?.name, faction: f1, faction2: f2, food: Math.round(1200 + th * 500), choices: [] };
    }
    S.nextAt = now + rng.int(180, 300) * 60000;
  }
  // L'étape active devient une décision en attente quand son heure arrive
  const a = S.active;
  if (a && a.at <= now && !state.pending.some((p) => p.kind === 'saga')) {
    const saga = SAGAS[a.id];
    const st = saga.steps[a.step];
    state.pending.push({ id: uid('sg'), kind: 'saga', saga: a.id, step: a.step, t: now, deadline: now + STEP_TTL, title: fillText(st.title, a), text: fillText(st.text, a), town: a.town, townName: a.townName, faction: a.faction, faction2: a.faction2, food: a.food });
    toast(`${saga.icon} Saga : ${fillText(st.title, a)}`, 'event');
  }
  for (const p of [...state.pending]) if (p.kind === 'saga' && p.deadline <= now) resolveSaga(state, p.id, SAGAS[p.saga].steps[p.step].default, now, true);
}

export function describeSaga(p) {
  const saga = SAGAS[p.saga];
  const st = saga.steps[p.step];
  const ctx = { townName: p.townName, faction: p.faction, faction2: p.faction2, food: p.food };
  return { icon: saga.icon, title: `${saga.title} — ${p.title}`, text: p.text, choices: st.choices.map((c) => ({ label: fillText(c.label, ctx), hint: fillText(c.hint || '', ctx) })), deadline: p.deadline, def: st.default };
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
    else { S.done[p.saga] = now; chronicle(state, `${saga.icon} Saga « ${saga.title} » : ${p.title} — le souverain choisit « ${label} ».`, now); S.active = null; }
  }
  return { ok: true, text };
}
