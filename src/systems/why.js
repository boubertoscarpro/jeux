// v17 — « Pourquoi ? » : d'où vient un chiffre (module pur). Chaque explication donne des lignes [libellé, valeur]
// et un total ; une ligne « Autres sources » garde la somme juste quand une source n'est pas détaillée.
import { BUILDINGS } from '../data/buildings.js';
import { TECHS } from '../data/techs.js';
import { RESOURCES } from '../data/resources.js';
import { computeMods } from './modifiers.js';
import { netRates } from './economy.js';
import { resourceBreakdown } from './advisor.js';
import { territoryMods } from './territory.js';
import { castleMods } from './castle.js';
import { stabilityFactors, stabilityTarget } from './stability.js';
import { fmt } from '../core/util.js';

const pct = (v) => `${v >= 0 ? '+' : ''}${Math.round(v * 1000) / 10} %`;
const perH = (v) => `${v >= 0 ? '+' : ''}${fmt(v)}/h`;

export function whyProduction(state, res, now = Date.now()) {
  const mods = computeMods(state, now);
  const b0 = resourceBreakdown(state, res, mods);
  // Bâtiments semblables regroupés (« Scierie niv. 6 ×4 »)
  const group = (l) => { const m = new Map(); for (const s of l) { const g = m.get(s.label) || { label: s.label, v: 0, n: 0 }; g.v += s.v; g.n++; m.set(s.label, g); } return [...m.values()].map((g) => ({ label: g.n > 1 ? `${g.label} ×${g.n}` : g.label, v: g.v })).sort((a, c) => c.v - a.v); };
  const b = { ...b0, sources: group(b0.sources), sinks: group(b0.sinks) };
  const lines = [];
  for (const s of b.sources.slice(0, 6)) lines.push([s.label, perH(s.v)]);
  const restP = b.sources.slice(6).reduce((a, s) => a + s.v, 0);
  if (restP) lines.push([`Autres producteurs (${b.sources.length - 6})`, perH(restP)]);
  for (const s of b.sinks.slice(0, 4)) lines.push([s.label, perH(-s.v)]);
  const restS = b.sinks.slice(4).reduce((a, s) => a + s.v, 0);
  if (restS) lines.push([`Autres consommateurs (${b.sinks.length - 4})`, perH(-restS)]);
  if (mods['prod.' + res]) lines.push([`Bonus de production (${RESOURCES[res]?.name || res}), déjà compris ci-dessus`, pct(mods['prod.' + res])]);
  const net = netRates(state, mods)[res] || 0;
  const other = net - (b.prod - b.cons);
  if (Math.abs(other) >= 0.5) lines.push(['Autres sources (avant-postes, ouvriers, marché…)', perH(other)]);
  return { lines, total: perH(net) };
}

export function whyDefense(state, now = Date.now()) {
  const mods = computeMods(state, now);
  const keys = ['city.def', 'wall.pct'];
  const sum = (m) => keys.reduce((a, k) => a + (m[k] || 0), 0);
  const lines = [];
  let known = 0;
  const add = (label, v) => { if (Math.abs(v) > 1e-6) { lines.push([label, pct(v)]); known += v; } };
  let bl = 0; for (const b of Object.values(state.city.buildings)) { const d = BUILDINGS[b.type]; if (d?.effects && b.level > 0) bl += sum(d.effects(b.level) || {}); }
  add('Bâtiments (tours, caserne…)', bl);
  let fl = 0; for (const [t, l] of Object.entries(state.city.fort || {})) if (l > 0) fl += sum(BUILDINGS[t]?.effects?.(l) || {});
  lines.push([`Muraille ${state.city.fort?.wall || 0} et douves ${state.city.fort?.moat || 0}`, pct(fl)]); known += fl;
  add('Enceinte (périmètre, dégâts de la muraille)', sum(castleMods(state)));
  let tl = 0; for (const id of Object.keys(state.techs || {})) tl += sum(TECHS[id]?.mods || {});
  add('Recherches', tl);
  add('Avant-postes (tours de guet, forteresses)', sum(territoryMods(state, now)));
  const total = sum(mods);
  if (Math.abs(total - known) > 1e-3) lines.push(['Autres sources (alliés, héros, événements, saison…)', pct(total - known)]);
  if (mods['wall.bonus']) lines.push(['Bonus de muraille au combat (multiplié par l’enceinte)', pct(mods['wall.bonus'])]);
  return { lines, total: pct(total) };
}

export function whyStability(state, k, now = Date.now()) {
  const t = state.territories?.[k];
  if (!t) return { name: '?', lines: [], total: '' };
  const f = stabilityFactors(state, t, now);
  return { name: t.name || k, lines: f.map(([l, v]) => [l, `${v >= 0 ? '+' : ''}${v}`]), total: `${Math.round(stabilityTarget(state, t, now))} (cible)` };
}
