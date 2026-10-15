// Scénarios alternatifs (données : data/scenarios.js).
// state.scenario = { id, started, done: { objectif: date }, completedAt, failed? }
// Records (meilleur temps en heures) : state.meta.scenarioRecords, conservés d'une dynastie à l'autre.
import { SCENARIOS } from '../data/scenarios.js';
import { POI_TYPES } from '../data/world.js';
import { spawnPoi, findFreeTile, reveal } from './world.js';
import { chronicle } from './chronicle.js';
import { feat, log } from './log.js';

const H = 3600000;
export const scenarioDef = (state) => SCENARIOS[state?.scenario?.id] || SCENARIOS.none;
export const scenarioMods = (state) => (state?.scenario?.failed ? {} : scenarioDef(state).mods || {});

// Applique un scénario à une partie neuve (appelé à la création, après la spécialisation et l'origine)
export function applyScenario(state, id, now = Date.now(), applyStart = null) {
  if (!SCENARIOS[id] || id === 'none') { state.scenario = { id: 'none', started: now, done: {} }; return state; }
  const def = SCENARIOS[id];
  state.scenario = { id, started: now, done: {} };
  if (applyStart) applyStart(state, def.start);
  const w = state.world;
  if (def.setup === 'angry') {
    // Deux royaumes rivaux en colère : raids plus fréquents dès que la protection du débutant tombe
    const ks = Object.values(w.pois).filter((p) => p.type === 'kingdom').slice(0, 2);
    for (const p of ks) p.anger = (p.anger || 0) + 4;
  }
  if (def.setup === 'rareNodes') {
    for (const [type, n] of [['crystalNode', 2], ['silverNode', 2], ['gemNode', 1]]) {
      for (let i = 0; i < n; i++) {
        const pos = findFreeTile(w, w.capital.x + Math.round((Math.random() - 0.5) * 10), w.capital.y + Math.round((Math.random() - 0.5) * 10), POI_TYPES[type].terrain, 4) || findFreeTile(w, w.capital.x + 3, w.capital.y + 3, null, 6);
        if (pos) { spawnPoi(w, type, pos.x, pos.y, { danger: 1 }); reveal(w, pos.x, pos.y, 1); }
      }
    }
  }
  if (def.setup === 'merchant') {
    for (const f of state.factions || []) f.relation = Math.max(-100, (f.relation || 0) - 20);
    for (const b of Object.values(state.city.buildings)) if (b.type === 'market') b.level = Math.max(b.level, 2);
  }
  return state;
}

export function scenarioObjectives(state) {
  const def = scenarioDef(state), S = state.scenario || {};
  return def.objectives.map((o) => { const [cur, target] = o.check(state); return { ...o, cur: Math.min(cur, target), target, done: !!S.done?.[o.id] || cur >= target }; });
}

// Moteur : objectifs atteints (acquis définitivement), victoire, record, échec (guerre déclarée en « moissons »)
export function scenarioTick(state, now) {
  const S = state.scenario;
  if (!S || S.id === 'none' || !SCENARIOS[S.id] || S.completedAt || S.failed) return;
  const def = SCENARIOS[S.id];
  if (def.noWar && (state.stats.wars || 0) > (S.warsAtStart ??= state.stats.wars || 0)) {
    S.failed = now;
    log(state, 'bad', `${def.icon} Scénario « ${def.name} » échoué : une guerre a été déclarée. La partie continue normalement, sans ses règles.`, now);
    return;
  }
  S.done ||= {};
  for (const o of def.objectives) if (!S.done[o.id]) { const [cur, target] = o.check(state); if (cur >= target) { S.done[o.id] = now; log(state, 'good', `${def.icon} Objectif du scénario atteint : ${o.label}.`, now); } }
  if (def.objectives.every((o) => S.done[o.id])) {
    S.completedAt = now;
    const hours = Math.round(((now - S.started) / H) * 10) / 10;
    const R = (state.meta.scenarioRecords ||= {});
    const best = R[S.id];
    if (!(best <= hours)) R[S.id] = hours;
    if (def.reward) {
      state.meta.insignia = (state.meta.insignia || 0) + (def.reward.insignia || 0);
      if (def.reward.title) state.meta.titles = [...new Set([...(state.meta.titles || []), def.reward.title])];
    }
    feat(def.icon, `Scénario « ${def.name} » accompli`, `${hours} h${best ? ` (record précédent : ${best} h)` : ' : premier record'}`);
    chronicle(state, `${def.icon} Le royaume accomplit le scénario « ${def.name} » en ${hours} heures.`, now);
  }
}
