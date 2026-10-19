// v17 « Clair comme le jour » — La frise du temps (module pur) : ce qui va arriver dans les prochaines heures, pour
// planifier sa session d'un coup d'œil. Elle montre ; elle ne rappelle ni ne presse (aucune alarme, aucun compte à
// rebours anxiogène).
import { BUILDINGS } from '../data/buildings.js';
import { TECHS } from '../data/techs.js';
import { LIVE_EVENTS } from '../data/liveEvents.js';
import { CATASTROPHES } from '../data/seasons.js';
import { UNITS } from '../data/units.js';

export const TIMELINE_HOURS = 8;
export function timeline(state, now = Date.now(), hours = TIMELINE_HOURS) {
  const end = now + hours * 3600e3, out = [];
  const add = (t, icon, text, kind = 'info', view = null) => { if (t > now && t <= end) out.push({ t, icon, text, kind, view }); };
  for (const q of state.queues?.build || []) add(q.end, '🔨', q.kind === 'clear' ? 'Déblaiement terminé' : `${BUILDINGS[q.type]?.name || 'Chantier'} → niveau ${q.level}`, 'build');
  for (const q of state.queues?.research || []) add(q.end, '🔬', `Recherche : ${TECHS[q.id]?.name || q.id}`, 'research', 'research');
  for (const q of state.queues?.train || []) add(q.end, '⚔️', `${q.count || ''} ${(UNITS[q.unit]?.name?.toLowerCase() || 'soldat') + ((q.count || 0) > 1 ? 's' : '')} formé${(q.count || 0) > 1 ? 's' : ''}`.trim(), 'army', 'army');
  for (const q of state.queues?.craft || []) add(q.end, '⚒️', 'Objet forgé', 'craft', 'craft');
  for (const r of state.raids || []) add(r.arrive, '🚨', `Raid : ${r.name}`, 'danger', 'defense');
  for (const m of state.marches || []) add(m.phase === 'back' ? m.returnAt : m.phase === 'out' ? m.arrive : m.workEnd, '🐎', m.phase === 'back' ? 'Retour d’une marche' : 'Marche arrivée', 'march');
  for (const t of state.expeditions || []) if (t.status !== 'idle') add(t.returnAt || t.end, '🧭', 'Retour d’expédition', 'march', 'expeditions');
  for (const o of state.omens?.list || []) if (!o.resolved) add(o.at, '🔮', o.kind === 'catastrophe' ? `Présage : ${CATASTROPHES[o.key]?.name || 'catastrophe annoncée'}` : 'Présage du marché : les cours vont bouger', 'omen', o.kind === 'catastrophe' ? 'omens' : 'market');
  const L = state.live?.current; if (L && LIVE_EVENTS[L.key]) add(L.end, LIVE_EVENTS[L.key].icon, `Fin de l’événement : ${LIVE_EVENTS[L.key].name}`, 'event', 'event');
  for (const c of state.caravans || []) add(c.returnAt || c.arrive, '🐪', 'Caravane de retour', 'march', 'convoys');
  out.sort((a, b) => a.t - b.t);
  // Une même file qui se suit (5 formations de lanciers) ne prend qu'une place : la première, avec le nombre
  const merged = [];
  for (const e of out) { const p = merged.find((m) => m.kind === e.kind && m.icon === e.icon && e.kind !== 'danger'); if (p) { p.more = (p.more || 0) + 1; p.last = e.t; } else merged.push({ ...e }); }
  return merged;
}
