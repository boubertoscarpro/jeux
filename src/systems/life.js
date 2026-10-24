// v21 « Couleurs du Royaume » — Vie de la ville (module pur) : combien de passants, de gardes, de charrettes et
// d'oiseaux la carte montre, d'après l'état réel du royaume. Rien n'est décoratif au hasard : la foule suit l'ordre
// public et la population, se raréfie en cas de famine, de crise ou la nuit ; un raid double la garde et vide les rues.
// Chaque facteur est expliqué (« Pourquoi ? »). Le plafond dépend de la qualité graphique.
import { publicOrder } from './order.js';

export const LIFE = {
  base: 6, perHouse: 1.2, perThLevel: 0.4,
  guards: 3, perWall: 0.5, carts: 1, perMarket: 1,
  cap: { high: 70, medium: 40, low: 14 },
};
// state, { phase ('day'|'dusk'|'night'|'dawn'), season, gfx } → densité et raisons
export function lifeDensity(state, { phase = 'day', season = 'summer', gfx = 'high' } = {}) {
  const why = [];
  const blds = Object.values(state.city?.buildings || {});
  const houses = blds.filter((b) => b.type === 'house' && b.level > 0).length;
  const th = blds.reduce((m, b) => (b.type === 'townhall' ? Math.max(m, b.level) : m), 0);
  const markets = blds.filter((b) => b.type === 'market' && b.level > 0).length;
  let peasants = LIFE.base + LIFE.perHouse * houses + LIFE.perThLevel * th;
  why.push(`${houses} maison${houses > 1 ? 's' : ''} et l’hôtel de ville niv. ${th} : ${Math.round(peasants)} passants`);
  // ordre public : rues animées quand il est haut, désertes quand il est bas
  const ord = publicOrder(state).value;
  const kOrder = ord >= 60 ? 1.3 : ord >= 30 ? 1 : ord >= 10 ? 0.75 : 0.5;
  if (kOrder !== 1) why.push(`Ordre public ${ord} : ${kOrder > 1 ? 'rues animées' : 'rues plus vides'} (×${kOrder})`);
  peasants *= kOrder;
  let guards = LIFE.guards + LIFE.perWall * (state.city?.fort?.wall || 0);
  let carts = LIFE.carts + LIFE.perMarket * markets + (state.caravans || []).length;
  let mood = ord >= 60 ? 'festive' : 'calm';
  if (state.famine) { peasants *= 0.5; carts = Math.min(carts, 1); mood = 'grim'; why.push('Famine : moitié moins de monde dehors, peu de charrettes'); }
  const crises = (state.crises?.active || []).length;
  if (crises) { peasants *= 0.8; mood = mood === 'grim' ? 'grim' : 'tense'; why.push(`${crises} crise${crises > 1 ? 's' : ''} en cours : les gens restent chez eux (×0,8)`); }
  const raid = (state.raids || []).length > 0;
  if (raid) { guards *= 2; peasants *= 0.4; carts = 0; mood = 'alarm'; why.push('Raid en approche : garde doublée sur les remparts, rues vidées'); }
  if (phase === 'night') { peasants *= 0.25; carts = 0; why.push('Nuit : quelques passants seulement, gardes aux torches'); }
  else if (phase === 'dusk' || phase === 'dawn') { peasants *= 0.6; why.push('Aube ou crépuscule : rues calmes'); }
  if (season === 'winter') { peasants *= 0.8; why.push('Hiver : moins de monde dehors'); }
  const cap = LIFE.cap[gfx] ?? LIFE.cap.high;
  const birds = phase === 'night' || season === 'winter' ? 0 : gfx === 'low' ? 1 : 3;
  const clouds = gfx === 'low' ? 0 : state.weather?.type === 'clear' ? 2 : 4;
  // le plafond réduit d'abord les passants, jamais la garde (elle porte une information : raid, muraille)
  guards = Math.min(Math.round(guards), Math.max(2, Math.floor(cap * 0.4)));
  carts = Math.min(Math.round(carts), Math.max(0, Math.floor(cap * 0.15)));
  peasants = Math.max(0, Math.min(Math.round(peasants), cap - guards - carts));
  return { peasants, guards, carts, birds, clouds, mood, raid, night: phase === 'night', why };
}
