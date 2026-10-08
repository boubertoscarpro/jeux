import { levelOf } from './city.js';
import { computeMods } from './modifiers.js';
import { pay, missing } from './economy.js';
import { rollCandidates, RECRUIT_COST } from './heroes.js';
import { SECTORS } from '../data/heroes.js';
import { log } from './log.js';

export const TAVERN_REFRESH_MS = 30 * 60 * 1000;

export function maxHeroes(state) {
  const mods = computeMods(state);
  return 1 + (mods.heroSlots || 0);
}

export function tavernCandidates(state, now = Date.now()) {
  const lvl = levelOf(state, 'tavern');
  if (!lvl) return [];
  if (!state.tavern || state.tavern.next <= now) {
    state.tavern = { next: now + TAVERN_REFRESH_MS, candidates: rollCandidates(lvl) };
  }
  return state.tavern.candidates;
}

export function recruitCost(state, hero, now = Date.now()) {
  const mods = computeMods(state, now);
  const k = 1 - (mods['hero.discount'] || 0);
  return Object.fromEntries(Object.entries(RECRUIT_COST[hero.rarity]).map(([r, v]) => [r, Math.ceil(v * k)]));
}

export function recruit(state, heroId, now = Date.now()) {
  const c = state.tavern?.candidates?.find((h) => h.id === heroId);
  if (!c) return { ok: false, reason: 'Candidat introuvable' };
  if (state.heroes.length >= maxHeroes(state)) return { ok: false, reason: 'Plus de place (améliorez la Taverne ou le Donjon)' };
  const cost = recruitCost(state, c, now);
  if (!pay(state, cost)) return { ok: false, reason: 'Ressources insuffisantes', missing: missing(state, cost) };
  state.tavern.candidates = state.tavern.candidates.filter((h) => h.id !== heroId);
  state.heroes.push(c);
  log(state, 'good', `🍺 ${c.name} rejoint votre cour.`, now);
  return { ok: true };
}

export const REFRESH_COST = { gold: 150 };
export function refreshTavern(state, now = Date.now()) {
  const lvl = levelOf(state, 'tavern');
  if (!lvl) return { ok: false, reason: 'Taverne requise' };
  if (!pay(state, REFRESH_COST)) return { ok: false, reason: 'Pas assez d’or' };
  state.tavern = { next: now + TAVERN_REFRESH_MS, candidates: rollCandidates(lvl) };
  return { ok: true };
}

export function dismissHero(state, heroId) {
  const h = state.heroes.find((x) => x.id === heroId);
  if (!h || h.marchId) return { ok: false, reason: 'Héros en marche' };
  if (state.heroes.length <= 1) return { ok: false, reason: 'Vous devez garder au moins un héros' };
  for (const id of Object.values(h.equipment)) {
    const it = state.inventory.items.find((i) => i.id === id);
    if (it) it.equippedBy = null;
  }
  state.heroes = state.heroes.filter((x) => x.id !== heroId);
  return { ok: true };
}

// Nommer un intendant (un seul héros par secteur)
export function assignGovernor(state, heroId, sector) {
  const h = state.heroes.find((x) => x.id === heroId);
  if (!h) return { ok: false };
  if (h.marchId) return { ok: false, reason: 'Héros en marche' };
  if (sector && !SECTORS[sector]) return { ok: false };
  if (sector) {
    const other = state.heroes.find((x) => x.assignment?.sector === sector && x.id !== heroId);
    if (other) other.assignment = null;
    h.assignment = { type: 'governor', sector };
  } else h.assignment = null;
  return { ok: true };
}

export function equipItem(state, heroId, itemId) {
  const h = state.heroes.find((x) => x.id === heroId);
  const it = state.inventory.items.find((i) => i.id === itemId);
  if (!h || !it) return { ok: false };
  if (h.marchId) return { ok: false, reason: 'Héros en marche' };
  if (it.equippedBy) {
    const prev = state.heroes.find((x) => x.id === it.equippedBy);
    if (prev?.marchId) return { ok: false, reason: 'Porté par un héros en marche' };
    if (prev) prev.equipment[it.slot] = null;
  }
  const cur = h.equipment[it.slot];
  if (cur) { const ci = state.inventory.items.find((i) => i.id === cur); if (ci) ci.equippedBy = null; }
  h.equipment[it.slot] = it.id;
  it.equippedBy = h.id;
  return { ok: true };
}

export function unequip(state, heroId, slot) {
  const h = state.heroes.find((x) => x.id === heroId);
  if (!h || h.marchId) return { ok: false, reason: 'Héros en marche' };
  const id = h.equipment[slot];
  const it = state.inventory.items.find((i) => i.id === id);
  if (it) it.equippedBy = null;
  h.equipment[slot] = null;
  return { ok: true };
}
