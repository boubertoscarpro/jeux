// Priorités royales (voir data/policies.js) : choix, transition, modificateurs, alignement de l'automatisation.
import { POLICIES, POLICY_TRANSITION, POLICY_LOCK, POLICY_MIN_TH } from '../data/policies.js';
import { thLevel } from './city.js';
import { chronicle } from './chronicle.js';

export function policyState(state) {
  const p = (state.policy && typeof state.policy === 'object' && !Array.isArray(state.policy)) ? state.policy : (state.policy = {});
  if (!POLICIES[p.id]) p.id = 'balanced';
  if (p.pending && !POLICIES[p.pending]) p.pending = null;
  for (const k of ['activeAt', 'lockUntil']) if (!Number.isFinite(p[k])) p[k] = 0;
  if (!Array.isArray(p.history)) p.history = [];
  return p;
}

// Priorité effective : pendant la réorganisation, aucune priorité ne s'applique
export function activePolicy(state, now = Date.now()) {
  const p = policyState(state);
  if (p.pending) return p.activeAt <= now ? p.pending : null;
  return p.id;
}

export function policyMods(state, now = Date.now()) {
  const id = activePolicy(state, now);
  return id ? POLICIES[id].mods : {};
}

export function canChangePolicy(state, id, now = Date.now()) {
  const p = policyState(state);
  if (!POLICIES[id]) return { ok: false, reason: 'Priorité inconnue' };
  if (thLevel(state) < POLICY_MIN_TH) return { ok: false, reason: `Hôtel de ville niv. ${POLICY_MIN_TH} requis` };
  const target = p.pending || p.id;
  if (target === id) return { ok: false, reason: 'C’est déjà la priorité choisie' };
  if (p.lockUntil > now) return { ok: false, reason: `Le conseil royal ne peut changer d’orientation que dans ${Math.ceil((p.lockUntil - now) / 60000)} min` };
  return { ok: true };
}

export function setPolicy(state, id, now = Date.now()) {
  const c = canChangePolicy(state, id, now);
  if (!c.ok) return c;
  const p = policyState(state);
  // Une transition en cours est validée avant d'en commencer une nouvelle
  if (p.pending && p.activeAt <= now) { p.id = p.pending; }
  p.pending = id;
  p.activeAt = id === 'balanced' ? now : now + POLICY_TRANSITION;
  p.lockUntil = now + POLICY_LOCK;
  p.history.unshift({ t: now, id });
  p.history.length = Math.min(p.history.length, 20);
  chronicle(state, `${POLICIES[id].icon} Le souverain oriente le royaume vers « ${POLICIES[id].name} ».`, now);
  return { ok: true, activeAt: p.activeAt };
}

// Fin de transition (appelée régulièrement) : la priorité en attente devient la priorité courante
export function policyTick(state, now = Date.now()) {
  const p = policyState(state);
  if (p.pending && p.activeAt <= now) { p.id = p.pending; p.pending = null; return true; }
  return false;
}

// Aligne l'ordre des secteurs de l'Intendance (Priorités) sur l'orientation choisie
export function alignPriorities(state) {
  const id = policyState(state).pending || policyState(state).id;
  if (!state.priorities) return { ok: false, reason: 'Priorités indisponibles' };
  state.priorities.order = [...POLICIES[id].order];
  return { ok: true };
}
