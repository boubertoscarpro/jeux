import { EXPLORE_EVENTS } from '../data/exploration.js';
import { EXPEDITION_EVENTS } from '../data/workers.js';
import { resolvePending } from './marches.js';
import { resolveExpeditionEvent, resolveAnomaly, ANOMALY } from './expeditions.js';
import { resolveDecision, decisionSource } from './decisions.js';
import { describeRiddle, resolveRiddle } from './liveEvents.js';
import { describeSaga, resolveSaga } from './sagas.js';

// Décrit une décision en attente, quelle que soit son origine
export function describePending(state, p) {
  if (p.kind === 'riddle') return describeRiddle(p);
  if (p.kind === 'saga') return describeSaga(p);
  if (p.kind === 'anomaly') return { icon: ANOMALY.icon, title: ANOMALY.title, text: ANOMALY.text, choices: ANOMALY.choices.map((c) => ({ label: c.label, hint: c.desc })), deadline: p.deadline, def: ANOMALY.default, coords: `(${p.x}, ${p.y})` };
  if (p.kind === 'exp') {
    const ev = EXPEDITION_EVENTS[p.event];
    const t = state.expeditions.find((x) => x.id === p.expId);
    return { icon: ev.icon, title: `${t?.name || 'Expédition'} : ${ev.title}`, text: ev.text, choices: ev.choices.map((c) => ({ label: c.label, hint: c.desc })), deadline: p.deadline, def: ev.default };
  }
  if (p.kind === 'dilemma' || p.kind === 'secret') {
    const src = decisionSource(p);
    return { icon: src.icon, title: p.title, text: p.text, choices: src.choices.map((c) => ({ label: c.label, hint: c.hint })), deadline: p.deadline, def: src.default };
  }
  const ev = EXPLORE_EVENTS[p.event];
  return { icon: '🧭', title: ev.title, text: ev.text, choices: ev.choices.map((c) => ({ label: c.label, hint: c.hint, cost: c.cost })), deadline: null, coords: `(${p.x}, ${p.y})` };
}

export function resolveAny(state, pid, idx, now = Date.now()) {
  const p = state.pending.find((x) => x.id === pid);
  if (!p) return { ok: false, reason: 'Décision introuvable' };
  if (p.kind === 'exp') return resolveExpeditionEvent(state, pid, idx, now);
  if (p.kind === 'riddle') return resolveRiddle(state, pid, idx, now);
  if (p.kind === 'saga') return resolveSaga(state, pid, idx, now);
  if (p.kind === 'anomaly') return resolveAnomaly(state, pid, idx, now);
  if (p.kind === 'dilemma' || p.kind === 'secret') return resolveDecision(state, pid, idx, now);
  return resolvePending(state, pid, idx, now);
}
