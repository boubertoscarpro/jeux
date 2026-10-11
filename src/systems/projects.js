// Grands projets royaux (voir data/projects.js) : un projet actif, étapes financées par contributions,
// travaux minutés, bonus permanents à l'achèvement.
import { PROJECTS, PROJECT_MIN_TH } from '../data/projects.js';
import { RESOURCES } from '../data/resources.js';
import { countOf, levelOf, thLevel } from './city.js';
import { combatUnitCount } from './army.js';
import { SPEC_INFO } from '../data/territories.js';
import { aroundCapital, reveal, worldScale } from './world.js';
import { shardState } from './shards.js';
import { chronicle } from './chronicle.js';
import { log, toast } from './log.js';
import { fmt } from '../core/util.js';

export function projectState(state) {
  const p = (state.projects && typeof state.projects === 'object' && !Array.isArray(state.projects)) ? state.projects : (state.projects = {});
  if (!p.done || typeof p.done !== 'object' || Array.isArray(p.done)) p.done = {};
  if (p.active && (!PROJECTS[p.active.id] || typeof p.active !== 'object')) p.active = null;
  if (p.active) { p.active.paid ||= {}; p.active.stage = Math.max(0, Math.floor(+p.active.stage || 0)); }
  p.active ??= null;
  return p;
}

const helpers = (s) => ({
  level: (t) => levelOf(s, t),
  count: (t) => countOf(s, t),
  combat: () => combatUnitCount(s.army),
  outposts: () => Object.keys(s.territories || {}).length,
  outpostCat: (cats) => Object.values(s.territories || {}).some((t) => t.spec && cats.includes(SPEC_INFO[t.spec]?.cat)),
  townKnown: () => Object.values(s.world.pois).some((p) => p.type === 'town' && s.world.revealed[p.y * s.world.size + p.x]),
});

export function stageReqs(state, id, i) {
  const st = PROJECTS[id].stages[i];
  const h = helpers(state);
  return (st?.req || []).map(([text, fn]) => { let ok = false; try { ok = !!fn(state, h); } catch { ok = false; } return { text, ok }; });
}

// Vue d'un projet pour l'interface et le conseiller
export function projectInfo(state, id, now = Date.now()) {
  const P = projectState(state), def = PROJECTS[id];
  const active = P.active?.id === id ? P.active : null;
  const done = !!P.done[id];
  const stage = done ? def.stages.length : active ? active.stage : 0;
  const st = def.stages[stage] || null;
  const paid = active?.paid || {};
  const funded = st ? Object.entries(st.cost).every(([r, v]) => (paid[r] || 0) >= v) : false;
  const reqs = st ? stageReqs(state, id, stage) : [];
  const building = !!active?.buildEnd;
  const fundPct = st ? Object.entries(st.cost).reduce((a, [r, v]) => a + Math.min(1, (paid[r] || 0) / v), 0) / Object.keys(st.cost).length : 1;
  const locked = thLevel(state) < def.th ? `Hôtel de ville niv. ${def.th} requis` : null;
  return { id, def, active: !!active, done, stage, st, paid, funded, reqs, reqsOk: reqs.every((r) => r.ok), building, buildEnd: active?.buildEnd || 0, buildStart: active?.buildStart || 0, fundPct, locked };
}

export function startProject(state, id, now = Date.now()) {
  const P = projectState(state);
  if (!PROJECTS[id]) return { ok: false, reason: 'Projet inconnu' };
  if (thLevel(state) < PROJECT_MIN_TH) return { ok: false, reason: `Hôtel de ville niv. ${PROJECT_MIN_TH} requis` };
  if (thLevel(state) < PROJECTS[id].th) return { ok: false, reason: `Hôtel de ville niv. ${PROJECTS[id].th} requis` };
  if (P.done[id]) return { ok: false, reason: 'Projet déjà achevé' };
  if (P.active) return { ok: false, reason: `Un seul grand projet à la fois (« ${PROJECTS[P.active.id].name} » en cours)` };
  P.active = { id, stage: 0, paid: {}, at: now };
  log(state, 'info', `${PROJECTS[id].icon} Grand projet lancé : ${PROJECTS[id].name}.`, now);
  return { ok: true };
}

// Abandon : les ressources déjà apportées à l'étape en cours sont rendues à moitié ; les étapes achevées sont perdues
export function abandonProject(state, now = Date.now()) {
  const P = projectState(state);
  if (!P.active) return { ok: false, reason: 'Aucun projet en cours' };
  if (P.active.buildEnd) return { ok: false, reason: 'Des travaux sont en cours : attendez leur fin' };
  const back = {};
  for (const [r, v] of Object.entries(P.active.paid)) { back[r] = Math.floor(v / 2); state.resources[r] = (state.resources[r] || 0) + back[r]; }
  log(state, 'info', `${PROJECTS[P.active.id].icon} Projet « ${PROJECTS[P.active.id].name} » abandonné (moitié des apports de l’étape restituée).`, now);
  P.active = null;
  return { ok: true, back };
}

// Contribution : apporte ce qui est disponible, sans dépasser le besoin ; share (0–1) limite la part du stock donnée
export function contribute(state, res = null, share = 1, now = Date.now()) {
  const P = projectState(state);
  const a = P.active;
  if (!a) return { ok: false, reason: 'Aucun projet en cours' };
  if (a.buildEnd) return { ok: false, reason: 'Travaux en cours : l’étape est déjà financée' };
  const st = PROJECTS[a.id].stages[a.stage];
  const given = {};
  for (const [r, need] of Object.entries(st.cost)) {
    if (res && r !== res) continue;
    const left = need - (a.paid[r] || 0);
    const give = Math.floor(Math.min(left, (state.resources[r] || 0) * share));
    if (give > 0) { state.resources[r] -= give; a.paid[r] = (a.paid[r] || 0) + give; given[r] = give; }
  }
  if (!Object.keys(given).length) return { ok: false, reason: 'Rien à apporter : ressources manquantes ou déjà fournies' };
  return { ok: true, given, text: Object.entries(given).map(([r, v]) => `${fmt(v)} ${RESOURCES[r].icon}`).join(' ') };
}

export function startStageWorks(state, now = Date.now()) {
  const P = projectState(state);
  const a = P.active;
  if (!a) return { ok: false, reason: 'Aucun projet en cours' };
  if (a.buildEnd) return { ok: false, reason: 'Travaux déjà en cours' };
  const info = projectInfo(state, a.id, now);
  if (!info.funded) return { ok: false, reason: 'Étape pas encore financée' };
  const miss = info.reqs.find((r) => !r.ok);
  if (miss) return { ok: false, reason: `Condition manquante : ${miss.text}` };
  a.buildStart = now;
  a.buildEnd = now + info.st.hours * 3600000;
  return { ok: true };
}

// Fin des travaux (moteur, chaque minute de jeu) : étape suivante ou achèvement
export function projectTick(state, now = Date.now()) {
  const P = projectState(state);
  const a = P.active;
  if (!a || !a.buildEnd || a.buildEnd > now) return false;
  const def = PROJECTS[a.id];
  const stName = def.stages[a.stage].name;
  state.stats.projectStages = (state.stats.projectStages || 0) + 1;
  a.stage++; a.paid = {}; a.buildEnd = 0; a.buildStart = 0;
  if (a.stage >= def.stages.length) {
    P.done[a.id] = now;
    P.active = null;
    if (def.reward.relic) shardState(state).relicFragments += def.reward.relic;
    if (def.reward.reveal && state.world) { const w = state.world; const c = aroundCapital(w, worldScale(w) * 0.4, worldScale(w) * 0.5); reveal(w, c.x, c.y, def.reward.reveal); }
    chronicle(state, `${def.icon} Le grand projet « ${def.name} » est achevé : ${def.reward.text.join(', ')}.`, now);
    toast(`${def.icon} ${def.name} achevé !`, 'good');
  } else {
    log(state, 'good', `${def.icon} ${def.name} : étape « ${stName} » terminée. Prochaine étape : « ${def.stages[a.stage].name} ».`, now);
    toast(`${def.icon} Étape terminée : ${stName}`, 'good');
  }
  return true;
}

// Bonus permanents des projets achevés (agrégés dans computeMods)
export function projectMods(state) {
  const out = {};
  for (const id of Object.keys(state.projects?.done || {})) for (const [k, v] of Object.entries(PROJECTS[id]?.reward.mods || {})) out[k] = (out[k] || 0) + v;
  return out;
}
