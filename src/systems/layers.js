// v17 « Clair comme le jour » — Calques d'information de la carte du royaume (module pur), à la manière des vues
// thématiques : on comprend sa ville sans ouvrir de fenêtre. Chaque bâtiment reçoit un palier 0 à 3 et un libellé ;
// la carte le dessine avec un motif (pas seulement une couleur) et une légende.
import { BUILDINGS } from '../data/buildings.js';
import { ZONE_FX } from '../data/castle.js';
import { buildingRates } from './economy.js';
import { adjacencyBonus } from './city.js';
import { fireRisk, riskBand, floodZone } from './hazards.js';
import { zoneAt, fortLevel } from './castle.js';
import { fmt } from '../core/util.js';

export const LAYERS = {
  production: { name: 'Production', icon: '⚒️', legend: ['Ne produit rien', 'Faible', 'Moyenne', 'Forte'], desc: 'Ce que chaque bâtiment produit par heure, comparé aux autres.' },
  fire: { name: 'Risque d’incendie', icon: '🔥', legend: ['Nul', 'Faible', 'Moyen', 'Élevé'], desc: 'Le feu se propage entre voisins inflammables ; les douves l’arrêtent.' },
  defense: { name: 'Couverture défensive', icon: '🛡️', legend: ['Exposé', 'Peu couvert', 'Couvert', 'À l’abri'], desc: 'Campagne exposée, faubourgs peu couverts, cour à l’abri derrière la muraille.' },
  placement: { name: 'Bonus de placement', icon: '🧩', legend: ['Aucun', 'Petit', 'Bon', 'Excellent'], desc: 'Bonus de voisinage (forêt, rivière, montagne, ateliers liés) et effets de zone.' },
  zones: { name: 'Effets de zone', icon: '🏘️', legend: ['Défavorable', 'Neutre', 'Favorable', 'Très favorable'], desc: 'Maisons et marchés aiment les faubourgs ; entrepôt, caserne et écurie la cour.' },
};

export function layerValues(state, kind, mods = {}) {
  const out = new Map();
  const blds = Object.values(state.city?.buildings || {}).filter((b) => BUILDINGS[b.type] && b.type !== 'road' && b.type !== 'deco' && b.level > 0);
  if (kind === 'production') {
    const vals = new Map(blds.map((b) => { const r = buildingRates(state, b, mods); return [b.id, Object.values(r.out || {}).reduce((a, v) => a + v, 0)]; }));
    const max = Math.max(1, ...vals.values());
    for (const b of blds) { const v = vals.get(b.id); out.set(b.id, { band: v <= 0 ? 0 : v < max * 0.25 ? 1 : v < max * 0.6 ? 2 : 3, label: v > 0 ? `${fmt(v)}/h` : 'ne produit rien' }); }
  } else if (kind === 'fire') {
    const flood = new Set(floodZone(state).map((b) => b.id));
    for (const b of blds) { const band = { none: 0, low: 1, mid: 2, high: 3 }[riskBand(fireRisk(state, b))]; out.set(b.id, { band, label: `risque d’incendie ${LAYERS.fire.legend[band].toLowerCase()}${flood.has(b.id) ? ', zone inondable' : ''}` }); }
  } else if (kind === 'defense') {
    const wall = fortLevel(state, 'wall') > 0, moat = fortLevel(state, 'moat') > 0;
    for (const b of blds) { const z = zoneAt(state, b.x, b.y); const band = z === 'keep' ? (wall ? 3 : 2) : z === 'faubourg' ? (moat ? 2 : 1) : 0; out.set(b.id, { band, label: LAYERS.defense.legend[band] }); }
  } else if (kind === 'placement') {
    for (const b of blds) { const v = (adjacencyBonus(state, b.type, b.x, b.y, mods).total || 0) + (ZONE_FX[b.type]?.[zoneAt(state, b.x, b.y)]?.prod || 0); out.set(b.id, { band: v <= 0 ? 0 : v < 0.1 ? 1 : v < 0.25 ? 2 : 3, label: v ? `bonus ${v > 0 ? '+' : ''}${Math.round(v * 100)} %` : 'aucun bonus' }); }
  } else if (kind === 'zones') {
    for (const b of blds) { const fx = ZONE_FX[b.type]?.[zoneAt(state, b.x, b.y)]; const band = !fx ? 1 : (fx.prod || 0) < 0 ? 0 : (fx.prod || 0) >= 0.1 || fx.mods ? 3 : 2; out.set(b.id, { band, label: fx ? fx.text : 'aucun effet de zone' }); }
  }
  return out;
}
// Résumé du calque (nombre de bâtiments par palier), pour la légende et les lecteurs d'écran
export function layerSummary(values) {
  const n = [0, 0, 0, 0];
  for (const v of values.values()) n[v.band]++;
  return n;
}
