import { TECHS, MAX_MASTERIES, techCost, techTime, techLibraryReq } from '../data/techs.js';
import { SEASON } from '../data/social.js';
import { uid } from '../core/util.js';
import { levelOf } from './city.js';
import { computeMods } from './modifiers.js';
import { pay, missing } from './economy.js';
import { log } from './log.js';
import { costMult, applyCostMult } from './kingdom.js';

export const researchSlots = (state) => 1 + (levelOf(state, 'library') >= 10 ? 1 : 0);
export const masteriesTaken = (state) => Object.keys(state.techs).filter((id) => TECHS[id]?.mastery).length;
// Coût après spécialisation : cost.research + cost.research.<branche> (plancher 50 %)
export const researchCost = (id, mods) => applyCostMult(techCost(id), costMult(mods, 'research', 'research.' + TECHS[id]?.branch));
export const researchTime = (id, mods) => techTime(id) / (1 + (mods['research.speed'] || 0));

// Statut d'une techno : done | active | available | locked (+ raison)
export function techStatus(state, id) {
  const t = TECHS[id];
  if (state.techs[id]) return { status: 'done' };
  if (state.queues.research.some((q) => q.tech === id)) return { status: 'active' };
  const lib = levelOf(state, 'library');
  if (lib < techLibraryReq(id)) return { status: 'locked', reason: lib === 0 ? 'Bibliothèque requise' : `Bibliothèque niv. ${techLibraryReq(id)}` };
  const reqOk = t.reqAny ? t.req.some((r) => state.techs[r]) : t.req.every((r) => state.techs[r]);
  if (t.req.length && !reqOk) return { status: 'locked', reason: `Requiert : ${t.req.map((r) => TECHS[r].name).join(t.reqAny ? ' ou ' : ', ')}` };
  if (t.excl) {
    const other = Object.keys(state.techs).find((o) => TECHS[o]?.excl === t.excl);
    const queued = state.queues.research.find((q) => TECHS[q.tech].excl === t.excl);
    if (other || queued) return { status: 'excluded', reason: `Exclusif avec ${TECHS[other || queued.tech].name}` };
  }
  if (t.mastery && masteriesTaken(state) + state.queues.research.filter((q) => TECHS[q.tech].mastery).length >= MAX_MASTERIES) {
    return { status: 'excluded', reason: `Maximum ${MAX_MASTERIES} maîtrises` };
  }
  return { status: 'available' };
}

export function startResearch(state, id, now = Date.now()) {
  const st = techStatus(state, id);
  if (st.status !== 'available') return { ok: false, reason: st.reason || 'Indisponible' };
  if (state.queues.research.length >= researchSlots(state)) return { ok: false, reason: 'Une recherche est déjà en cours' };
  const mods = computeMods(state, now);
  const cost = researchCost(id, mods);
  if (!pay(state, cost)) return { ok: false, reason: 'Ressources insuffisantes', missing: missing(state, cost) };
  state.queues.research.push({ id: uid('r'), tech: id, start: now, end: now + researchTime(id, mods), cost });
  return { ok: true };
}

export function cancelResearch(state, qid) {
  const i = state.queues.research.findIndex((q) => q.id === qid);
  if (i < 0) return { ok: false };
  const q = state.queues.research[i];
  for (const [r, v] of Object.entries(q.cost)) state.resources[r] += Math.floor(v * 0.8);
  state.queues.research.splice(i, 1);
  return { ok: true };
}

export function completeResearch(state, q, now) {
  state.techs[q.tech] = now;
  state.season.points += SEASON.points.research;
  log(state, 'good', `📜 Recherche terminée : ${TECHS[q.tech].name}.`, now);
}

// Accélère la recherche en cours (parchemins trouvés en exploration)
export function boostResearch(state, seconds) {
  const q = state.queues.research[0];
  if (!q) return false;
  q.end -= seconds * 1000;
  return true;
}
