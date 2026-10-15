// Codex illustré : registre des bâtiments, unités, ennemis, lieux, factions, technologies, artefacts et
// découvertes. Une entrée s'ouvre quand le joueur l'a rencontrée (construite, formée, affrontée, découverte…).
// state.codex.seen = { building: {type: date}, unit: {}, enemy: {}, place: {}, faction: {}, tech: {}, artifact: {}, mystery: {} }
// Les connaissances déjà acquises ne se perdent jamais (même si le bâtiment est démoli ou l'unité perdue).
import { BUILDINGS } from '../data/buildings.js';
import { UNITS, ENEMY_UNITS } from '../data/units.js';
import { POI_TYPES, RIVALS } from '../data/world.js';
import { TECHS } from '../data/techs.js';
import { ARTIFACTS } from '../data/artifacts.js';
import { MYSTERIES } from '../data/archaeology.js';

export const CODEX_CATS = {
  building: { name: 'Bâtiments', icon: '🏛️', hint: 'Construisez-le une première fois.' },
  unit: { name: 'Unités', icon: '⚔️', hint: 'Formez-en au moins une.' },
  enemy: { name: 'Ennemis', icon: '👹', hint: 'Affrontez-le ou espionnez une troupe qui en compte.' },
  place: { name: 'Lieux', icon: '🗺️', hint: 'Découvrez-en un sur la carte du monde.' },
  faction: { name: 'Factions', icon: '⚜️', hint: 'Révélez sa capitale ou traitez avec elle.' },
  tech: { name: 'Technologies', icon: '🔬', hint: 'Terminez cette recherche.' },
  artifact: { name: 'Artefacts', icon: '🏺', hint: 'Obtenez cet artefact.' },
  mystery: { name: 'Découvertes', icon: '🔭', hint: 'Résolvez ce mystère archéologique.' },
};

export function codexState(state) {
  const C = (state.codex && typeof state.codex === 'object' && !Array.isArray(state.codex)) ? state.codex : (state.codex = {});
  C.seen ||= {};
  for (const k of Object.keys(CODEX_CATS)) if (!C.seen[k] || typeof C.seen[k] !== 'object') C.seen[k] = {};
  return C;
}

// Toutes les entrées possibles par catégorie (les boss et cosmétiques sont exclus des listes)
export function codexEntries(cat) {
  switch (cat) {
    case 'building': return Object.keys(BUILDINGS).filter((k) => k !== 'deco');
    case 'unit': return Object.keys(UNITS);
    case 'enemy': return Object.keys(ENEMY_UNITS).filter((k) => ENEMY_UNITS[k].class !== 'boss');
    case 'place': return Object.keys(POI_TYPES).filter((k) => k !== 'capital');
    case 'faction': return RIVALS.map((_, i) => String(i));
    case 'tech': return Object.keys(TECHS);
    case 'artifact': return Object.keys(ARTIFACTS);
    case 'mystery': return Object.keys(MYSTERIES);
    default: return [];
  }
}

function see(C, cat, k, now) { if (k !== undefined && k !== null && !C.seen[cat][k]) { C.seen[cat][k] = now; return 1; } return 0; }

// Enregistre ce que le joueur connaît (appelé chaque minute de jeu ; peu coûteux)
export function codexTick(state, now) {
  const C = codexState(state);
  let n = 0;
  for (const b of Object.values(state.city?.buildings || {})) if (b.level > 0 && BUILDINGS[b.type]) n += see(C, 'building', b.type, now);
  for (const t of ['wall', 'moat']) if (state.city?.fort?.[t] > 0) n += see(C, 'building', t, now);
  for (const [u, c] of Object.entries(state.army || {})) if (c > 0 && UNITS[u]) n += see(C, 'unit', u, now);
  for (const r of state.reports || []) for (const u of Object.keys(r.enemies || {})) if (ENEMY_UNITS[u]) n += see(C, 'enemy', u, now);
  const w = state.world;
  if (w?.pois) for (const p of Object.values(w.pois)) {
    if (!w.revealed?.[p.y * w.size + p.x]) continue;
    if (POI_TYPES[p.type] && p.type !== 'capital') n += see(C, 'place', p.type, now);
    if (p.type === 'kingdom' && p.rival !== undefined) n += see(C, 'faction', String(p.rival), now);
    if (p.scouted) for (const u of Object.keys(p.enemies || p.garrison || {})) if (ENEMY_UNITS[u]) n += see(C, 'enemy', u, now);
  }
  for (const f of state.factions || []) if (f.stance && f.stance !== 'neutral') n += see(C, 'faction', String(f.idx), now);
  for (const t of Object.keys(state.techs || {})) if (TECHS[t]) n += see(C, 'tech', t, now);
  for (const a of Object.keys(state.artifacts || {})) if (ARTIFACTS[a]) n += see(C, 'artifact', a, now);
  for (const m of Object.keys(state.archaeo?.solved || {})) if (MYSTERIES[m]) n += see(C, 'mystery', m, now);
  return n;
}

export function codexProgress(state) {
  const C = codexState(state);
  const out = {};
  let have = 0, total = 0;
  for (const cat of Object.keys(CODEX_CATS)) {
    const all = codexEntries(cat);
    const n = all.filter((k) => C.seen[cat][k]).length;
    out[cat] = { have: n, total: all.length };
    have += n; total += all.length;
  }
  return { cats: out, have, total };
}
