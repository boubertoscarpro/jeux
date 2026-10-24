import { decoAuras } from './realm21.js';
// v20 « Ma forteresse » — Ordre public du château principal (module pur). Inspiré du genre, relié à ce qui existe :
// décorations et trophées de la cour, lieux, monument, muraille, autorité de l'hôtel de ville ; les maisons (or et
// ouvriers) le font baisser. Effet à rendement décroissant sur la production et la vitesse de formation, borné, et
// entièrement détaillé (« Pourquoi ? »).
import { BUILDINGS } from '../data/buildings.js';
import { TROPHIES } from '../data/trophies.js';
import { zoneAt } from './castle.js';

export const ORDER = {
  base: 20, perTh: 3, perWall: 1, deco: 12, trophy: 15, place: 8, perMonument: 4, house: 2, housePerLevel: 0.25,
  capUp: 0.12, kUp: 150, capDown: 0.2, kDown: 80,
};
const PLACE_TYPES = new Set(['sanctuary', 'observatory', 'embassy', 'cartographer', 'herald', 'lists', 'scriptorium']);
// Valeur et détail des facteurs
export function publicOrder(state) {
  const parts = [];
  const blds = Object.values(state.city?.buildings || {});
  const th = blds.reduce((m, b) => (b.type === 'townhall' ? Math.max(m, b.level) : m), 0);
  parts.push(['Base', ORDER.base]);
  if (th) parts.push([`Autorité de l’hôtel de ville (niv. ${th})`, ORDER.perTh * th]);
  const wl = state.city?.fort?.wall || 0;
  if (wl) parts.push([`Sécurité des remparts (muraille niv. ${wl})`, ORDER.perWall * wl]);
  let decos = 0, trophies = 0, places = 0, mon = 0, houses = 0, hcount = 0;
  for (const b of blds) {
    if (b.type === 'deco') { if (zoneAt(state, b.x, b.y) !== 'keep') continue; if (TROPHIES[b.deco]) trophies++; else decos++; continue; }
    if (b.level <= 0 || !BUILDINGS[b.type]) continue;
    if (PLACE_TYPES.has(b.type)) places++;
    if (b.type === 'monument') mon += b.level;
    if (b.type === 'house') { hcount++; houses += ORDER.house + ORDER.housePerLevel * b.level; }
  }
  if (decos) parts.push([`${decos} décoration${decos > 1 ? 's' : ''} dans la cour`, ORDER.deco * decos]);
  if (trophies) parts.push([`${trophies} trophée${trophies > 1 ? 's' : ''} exposé${trophies > 1 ? 's' : ''}`, ORDER.trophy * trophies]);
  if (places) parts.push([`${places} lieu${places > 1 ? 'x' : ''} (sanctuaire, ambassade…)`, ORDER.place * places]);
  if (mon) parts.push([`Monument dynastique (${mon} étape${mon > 1 ? 's' : ''})`, ORDER.perMonument * mon]);
  // v21 : auras des décorations (près des maisons, de l'hôtel de ville), usées après 48 h sans entretien
  const au = decoAuras(state).order;
  if (au) parts.push(['Auras des décorations bien placées', au]);
  if (hcount) parts.push([`${hcount} maison${hcount > 1 ? 's' : ''} (ruelles, foule)`, -Math.round(houses)]);
  const value = Math.round(parts.reduce((a, [, v]) => a + v, 0));
  return { value, parts, bonus: orderBonus(value) };
}
// Rendement décroissant : chaque point compte moins que le précédent ; borné à +12 % et −20 %
export function orderBonus(v) {
  if (v >= 0) return Math.round(ORDER.capUp * (1 - Math.exp(-v / ORDER.kUp)) * 1000) / 1000;
  return -Math.round(ORDER.capDown * (1 - Math.exp(v / ORDER.kDown)) * 1000) / 1000;
}
export const orderLevel = (v) => (v >= 150 ? { key: 'fervent', name: 'Exemplaire', icon: '🌟' } : v >= 60 ? { key: 'calm', name: 'Paisible', icon: '🙂' } : v >= 0 ? { key: 'tense', name: 'Fragile', icon: '😐' } : { key: 'unrest', name: 'Troublé', icon: '😠' });
export function orderMods(state) {
  const b = publicOrder(state).bonus;
  return b ? { 'prod.all': b, 'train.speed': b } : {};
}
