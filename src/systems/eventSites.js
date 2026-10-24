// v24 « Le monde et ses cibles » — Lieux d'événement sur la carte du monde. L'événement en cours (systems/liveEvents.js)
// devient un camp visible près de la capitale : on le sélectionne sur la carte, on voit ses cibles, et l'on attaque
// directement depuis sa fiche (mêmes règles, mêmes marches, mêmes combats et récompenses que l'écran de l'événement).
// Aucun second système : le lieu ne fait que refléter l'état réel, synchronisé à chaque pas (liveTick) :
//   à venir (dans moins de 24 h, pas encore attaquable) → actif → boss (le chef est apparu) → nettoyé (plus de cible)
//   → retiré à la fin de l'événement. Un même événement récurrent ne crée jamais de doublon (une seule clé par édition).
import { LIVE_EVENTS } from '../data/liveEvents.js';
import { liveState, isVisible, actionsFor, targetName } from './liveEvents.js';
import { key } from './world.js';
import { TERRAINS } from '../data/world.js';

const H = 3600000;
export const EVENT_SITE_RING = [5, 9]; // distance à la capitale (cases), dans la zone que l'on découvre tôt
export const UPCOMING_WINDOW = 24 * H;
const BLOCKED = new Set(['river', 'mountain', 'sea', 'lake']);
const TERRAIN_BY_CHAR = Object.fromEntries(Object.entries(TERRAINS).map(([k, t]) => [t.char, k]));

// Ce que le lieu doit montrer maintenant (ou null)
export function eventSiteWanted(state, now = Date.now()) {
  const L = liveState(state);
  const cur = L.current;
  if (cur && now < cur.end) {
    const def = LIVE_EVENTS[cur.key];
    const vis = cur.map.targets.filter((t) => isVisible(cur, t));
    const boss = vis.some((t) => t.type === 'boss');
    return { key: cur.key, occ: cur.occ, phase: boss ? 'boss' : vis.length ? 'active' : 'cleared', name: def.name, color: def.color, until: cur.end };
  }
  const next = L.calendar?.[0];
  if (next && next.start > now && next.start - now <= UPCOMING_WINDOW) {
    const def = LIVE_EVENTS[next.key];
    return { key: next.key, occ: (L.occ[next.key] || 0) + 1, phase: 'upcoming', name: def.name, color: def.color, until: next.start };
  }
  return null;
}
// Case libre, stable pour une édition donnée (même graine → même place), dans l'anneau autour de la capitale
export function eventSiteSpot(state, k, occ) {
  const w = state.world, c = w.capital, S = w.size;
  let h = 0; for (const ch of `${k}#${occ}`) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  for (let tries = 0; tries < 160; tries++) {
    const a = ((h + tries * 2654435761) % 3600) / 3600 * Math.PI * 2;
    const d = EVENT_SITE_RING[0] + ((h >> 8) + tries) % (EVENT_SITE_RING[1] - EVENT_SITE_RING[0] + 1);
    const x = Math.round(c.x + Math.cos(a) * d), y = Math.round(c.y + Math.sin(a) * d);
    if (x < 1 || y < 1 || x >= S - 1 || y >= S - 1) continue;
    if (w.pois[key(x, y)] || state.territories?.[key(x, y)]) continue;
    const t = typeof w.terrain === 'string' ? w.terrain[y * S + x] : null;
    if (t && BLOCKED.has(TERRAIN_BY_CHAR[t])) continue;
    return { x, y };
  }
  return null;
}
// Synchronise la carte avec l'événement : pose, met à jour ou retire le lieu. Renvoie le lieu (ou null).
export function syncEventSites(state, now = Date.now()) {
  const w = state.world;
  if (!w?.pois || !w.capital) return null;
  const want = eventSiteWanted(state, now);
  const id = want ? `ev_${want.key}_${want.occ}` : null;
  let site = null;
  for (const [k, p] of Object.entries(w.pois)) {
    if (p.type !== 'eventSite') continue;
    if (p.id === id && !site) site = p; else delete w.pois[k]; // édition passée, doublon : retiré
  }
  if (!want) return null;
  if (!site) {
    const at = eventSiteSpot(state, want.key, want.occ);
    if (!at) return null;
    site = { id, type: 'eventSite', x: at.x, y: at.y, danger: 0, eventKey: want.key, occ: want.occ };
    w.pois[key(at.x, at.y)] = site;
    // le camp et ses abords sont visibles : on n'a pas à explorer pour le trouver
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const xx = at.x + dx, yy = at.y + dy; if (xx >= 0 && yy >= 0 && xx < w.size && yy < w.size) w.revealed[yy * w.size + xx] = 1; }
  }
  Object.assign(site, { phase: want.phase, name: want.name, color: want.color, until: want.until });
  return site;
}
// Cibles de l'événement attaquables ou utilisables depuis la fiche du lieu (lecture seule)
export function eventSiteTargets(state, now = Date.now()) {
  const cur = liveState(state).current;
  if (!cur || now >= cur.end) return [];
  return cur.map.targets.filter((t) => isVisible(cur, t)).map((t) => ({ t, name: targetName(cur, t), actions: actionsFor(state, t, now) }))
    .sort((a, b) => (b.t.type === 'boss') - (a.t.type === 'boss') || (a.t.tier || 0) - (b.t.tier || 0));
}
