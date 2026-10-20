// v17 — Alternative textuelle de la carte du royaume (module pur) : les bâtiments par zone, avec leur niveau, leur
// état et ce qu'on peut y faire. Lue par les lecteurs d'écran (fenêtre « Le royaume en texte »).
import { BUILDINGS } from '../data/buildings.js';
import { ZONES } from '../data/castle.js';
import { zoneAt, zoneAllows } from './castle.js';
import { PLACES } from '../data/places.js';
import { decoDef } from './trophies.js';

const ZONE_ORDER = ['keep', 'moat', 'faubourg', 'country'];
export function cityOutline(state, { signals = new Map() } = {}) {
  const q = new Map((state.queues?.build || []).filter((x) => x.bid).map((x) => [x.bid, x]));
  const screens = {};
  for (const p of Object.values(PLACES)) if (p.kind === 'building') (screens[p.type] ||= []).push(...p.screens);
  const zones = Object.fromEntries(ZONE_ORDER.map((z) => [z, []]));
  for (const b of Object.values(state.city?.buildings || {})) {
    // v20 : décorations et trophées exposés sont listés aussi (ils comptent pour l'ordre public)
    const d = b.type === 'deco' ? { name: decoDef(b.deco)?.trophy ? `Trophée : ${decoDef(b.deco).name}` : decoDef(b.deco)?.name || 'Décoration' } : BUILDINGS[b.type];
    if (!d || b.type === 'road') continue;
    const z = zoneAt(state, b.x, b.y);
    const st = [];
    if (q.has(b.id)) st.push(b.level > 0 ? `amélioration vers le niveau ${q.get(b.id).level} en cours` : 'en construction');
    if (b.damaged) st.push('endommagé');
    if (b.starved) st.push('manque de matières premières');
    if (b.paused) st.push('en pause');
    if (b.type !== 'townhall' && b.type !== 'deco' && !zoneAllows(b.type, z)) st.push('mal placé pour sa zone');
    const sg = signals.get(b.id);
    if (sg) st.push(sg.text.toLowerCase());
    (zones[z] ||= []).push({ id: b.id, type: b.type, name: d.name, level: b.level, x: b.x, y: b.y, states: st, screens: screens[b.type] || [] });
  }
  return ZONE_ORDER.map((z) => ({ zone: z, name: ZONES[z]?.name || z, items: zones[z].sort((a, b) => (a.screens.length ? 0 : 1) - (b.screens.length ? 0 : 1) || a.name.localeCompare(b.name, 'fr') || b.level - a.level) })).filter((g) => g.items.length);
}
// Résumé en une phrase (annoncé en tête de la liste)
export function citySummary(state) {
  const all = Object.values(state.city?.buildings || {}).filter((b) => BUILDINGS[b.type] && b.type !== 'road');
  const th = all.find((b) => b.type === 'townhall');
  return `Hôtel de ville niveau ${th?.level || 1}, ${all.length} bâtiments, muraille niveau ${state.city?.fort?.wall || 0}, douves niveau ${state.city?.fort?.moat || 0}.`;
}
