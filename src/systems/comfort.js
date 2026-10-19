// v18 : confort hors équipement (module pur).
// - « Tout réclamer » : missions, chapitres, missions royales et dynamiques, étapes de quêtes, jalons, paliers de
//   saison, récompenses de l'événement en cours et ouvrage terminé, en une fois, avec le total obtenu. Les choix
//   (embranchements de quêtes, décisions) ne sont jamais tranchés à la place du joueur.
// - Compositions d'armée enregistrées (3) pour les marches, les raids et la défense.
// - Maintien de l'armée : compléter jusqu'à une composition (ordre du royaume « maintain »).
import { objectives, claimMission, claimChapter, claimRoyalDaily } from './campaign.js';
import { questlineList, claimQuestStep, claimQuestFinal } from './questlines.js';
import { missionList, claimDynMission } from './missions.js';
import { milestoneList, claimMilestone, claimSeasonTier } from './quests.js';
import { objectives as liveObjectives, claimObjective, passInfo, claimPass, dailyMissions, claimDaily, challengeInfo, claimChallenge } from './liveEvents.js';
import { commissionState, claimCommission } from './commissions.js';
import { train, unitStatus } from './army.js';
import { SEASON } from '../data/social.js';
import { UNITS } from '../data/units.js';
import { RESOURCES } from '../data/resources.js';
import { ARMY_PRESETS_MAX } from '../data/armory.js';
import { log } from './log.js';

// Tout ce qui peut être réclamé maintenant : [{ label, run }]
export function claimables(state, now = Date.now()) {
  const out = [];
  const add = (label, run) => out.push({ label, run });
  const safe = (f) => { try { return f() || []; } catch { return []; } };
  const o = safe(() => objectives(state, now));
  for (const m of [...(o.main || []), ...(o.secondary || []), ...(o.long || [])]) if (m.done && !m.claimed) add(m.title, () => claimMission(state, m.id, now));
  for (const c of o.chapters || []) if (c.unlocked && c.complete && !c.rewardClaimed) add(`Chapitre ${c.n}`, () => claimChapter(state, c.n, now));
  for (const m of o.daily || []) if (m.done && !m.claimed) add(m.title, () => claimRoyalDaily(state, m.id, now));
  for (const l of safe(() => questlineList(state))) {
    for (const st of l.steps || []) if (st.done && !st.claimed && !st.skipped) add(`${l.title} — ${st.title}`, () => claimQuestStep(state, l.id, st.i, now));
    if (l.finished && !l.finalClaimed) add(l.title, () => claimQuestFinal(state, l.id, now));
  }
  for (const m of safe(() => missionList(state, now))) if (m.done) add(m.title, () => claimDynMission(state, m.id, now));
  for (const m of safe(() => milestoneList(state))) if (m.done) add(`Jalon ${m.title}`, () => claimMilestone(state, m.id, now));
  SEASON.tiers.forEach((t, i) => { if (!state.season?.claimed?.[i] && (state.season?.points || 0) >= t.pts) add(`Saison, palier ${i + 1}`, () => claimSeasonTier(state, i, now)); });
  for (const x of safe(() => liveObjectives(state))) if (x.done && !x.claimed) add(x.label, () => claimObjective(state, x.id, now));
  for (const l of safe(() => passInfo(state)?.levels)) if (l.ready && !l.claimed) add(`Passe, niveau ${l.level}`, () => claimPass(state, l.level, now));
  safe(() => dailyMissions(state)).forEach((m, i) => { if (m.done && !m.claimed) add(m.label, () => claimDaily(state, i, now)); });
  const ch = safe(() => challengeInfo(state));
  if (ch && ch.done && !ch.claimed) add('Défi héroïque', () => claimChallenge(state, now));
  const a = safe(() => commissionState(state).active);
  if (a && a.ready) add('Ouvrage des artisans', () => claimCommission(state, now));
  return out;
}
export const claimableCount = (state, now = Date.now()) => claimables(state, now).length;

// Réclame tout, en plusieurs passes (une récompense peut en débloquer une autre : chapitre après ses missions)
export function claimAll(state, now = Date.now()) {
  const before = { ...state.resources };
  const done = [];
  for (let pass = 0; pass < 4; pass++) {
    const list = claimables(state, now);
    if (!list.length) break;
    let n = 0;
    for (const c of list) { let r; try { r = c.run(); } catch { r = null; } if (r && r.ok !== false) { done.push(c.label); n++; } }
    if (!n) break;
  }
  if (!done.length) return { ok: false, reason: 'Rien à réclamer pour le moment' };
  const gained = {};
  for (const [k, v] of Object.entries(state.resources)) { const d = Math.round(v - (before[k] || 0)); if (d > 0) gained[k] = d; }
  const text = Object.entries(gained).map(([k, v]) => `${RESOURCES[k]?.icon || ''} ${v} ${RESOURCES[k]?.name?.toLowerCase() || k}`).join(', ');
  log(state, 'good', `🎁 Tout réclamé : ${done.length} récompense${done.length > 1 ? 's' : ''}${text ? ` (${text})` : ''}.`, now);
  return { ok: true, n: done.length, labels: done, gained, text };
}

// ───────── Compositions d'armée ─────────
export function armyPresets(state) {
  if (!Array.isArray(state.armyPresets)) state.armyPresets = [];
  return state.armyPresets;
}
export function saveArmyPreset(state, idx, name, units) {
  if (!(idx >= 0 && idx < ARMY_PRESETS_MAX)) return { ok: false };
  const clean = Object.fromEntries(Object.entries(units || {}).filter(([u, n]) => UNITS[u] && n > 0).map(([u, n]) => [u, Math.floor(n)]));
  if (!Object.keys(clean).length) return { ok: false, reason: 'Composition vide' };
  armyPresets(state)[idx] = { name: String(name || `Composition ${idx + 1}`).slice(0, 24), units: clean };
  return { ok: true };
}
export function deleteArmyPreset(state, idx) { const P = armyPresets(state); if (!P[idx]) return { ok: false }; P[idx] = null; return { ok: true }; }
// Unités d'une composition, limitées à ce qui est en ville
export function presetUnits(state, idx) {
  const p = armyPresets(state)[idx];
  if (!p) return null;
  const out = {};
  for (const [u, n] of Object.entries(p.units)) { const v = Math.min(n, state.army[u] || 0); if (v > 0) out[u] = v; }
  return { units: out, short: Object.entries(p.units).filter(([u, n]) => (state.army[u] || 0) < n).map(([u, n]) => `${UNITS[u].name} ${state.army[u] || 0}/${n}`) };
}
// Effectif « à terme » d'une unité : en ville, en formation et en marche (les marches reviennent)
function headcount(state, u) {
  let n = state.army[u] || 0;
  for (const q of state.queues.train || []) if (q.unit === u || q.type === u) n += q.n || q.count || 0;
  for (const m of state.marches || []) n += m.units?.[u] || 0;
  return n;
}
// Compléter jusqu'à la composition : forme les manquants, unité par unité, tant que les ressources suffisent
export function maintainArmy(state, idx, now = Date.now()) {
  const p = armyPresets(state)[idx];
  if (!p) return { ok: false, reason: 'Composition introuvable (enregistrez-en une dans une marche)' };
  const done = [];
  for (const [u, target] of Object.entries(p.units)) {
    const need = target - headcount(state, u);
    if (need <= 0 || !unitStatus(state, u).ok) continue;
    const r = train(state, u, need, now);
    if (r.ok) done.push(`${need} ${UNITS[u].name}`);
  }
  return done.length ? { ok: true, msg: `formation : ${done.join(', ')}` } : { ok: false, reason: 'effectifs complets ou ressources insuffisantes' };
}
