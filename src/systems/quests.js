import { MILESTONES } from '../data/quests.js';
import { SEASON, COSMETICS } from '../data/social.js';
import { countOf, levelOf, totalLevels } from './city.js';
import { combatUnitCount } from './army.js';
import { computeMods } from './modifiers.js';
import { gain } from './economy.js';
import { log } from './log.js';

const H = {
  count: countOf,
  level: levelOf,
  totalLevels,
  combatUnits: (s) => combatUnitCount(s.army),
};

export function milestoneList(state) {
  return MILESTONES.map((m) => {
    const tier = state.quests.milestones[m.id] || 0;
    const target = m.tiers(tier);
    const value = m.value(state, H);
    return { ...m, tier, target, value: Math.floor(value), done: value >= target, reward: m.reward(tier) };
  });
}

export function claimMilestone(state, id, now = Date.now()) {
  const m = milestoneList(state).find((x) => x.id === id);
  if (!m || !m.done) return { ok: false, reason: 'Palier de jalon non atteint' };
  state.quests.milestones[id] = m.tier + 1;
  gain(state, m.reward, computeMods(state, now));
  state.meta.insignia = (state.meta.insignia || 0) + 1;
  log(state, 'good', `🏅 Jalon « ${m.title} » palier ${m.tier + 1} atteint (+1 insigne).`, now);
  return { ok: true };
}


// ---------- Saison ----------
export function seasonInfo(state, now = Date.now()) {
  const end = state.season.start + SEASON.lengthDays * 86400000;
  return { ...SEASON, end, remaining: end - now, points: Math.floor(state.season.points) };
}

// Fin de saison : une nouvelle saison commence (points et paliers remis à zéro, récompenses déjà prises conservées)
export function seasonTick(state, now = Date.now()) {
  const len = SEASON.lengthDays * 86400000;
  if (now < state.season.start + len) return false;
  const n = Math.floor((now - state.season.start) / len);
  state.season.start += n * len;
  state.season.points = 0;
  state.season.claimed = {};
  state.season.number = (state.season.number || 1) + n;
  log(state, 'event', `🎖️ Une nouvelle saison commence (saison ${state.season.number}) : les paliers de récompense sont à nouveau disponibles.`, now);
  return true;
}

export function claimSeasonTier(state, idx, now = Date.now()) {
  seasonTick(state, now);
  const tier = SEASON.tiers[idx];
  if (!tier) return { ok: false };
  if (state.season.claimed[idx]) return { ok: false, reason: 'Récompense déjà réclamée cette saison' };
  if (state.season.points < tier.pts) return { ok: false, reason: `Il faut ${tier.pts} points de saison (vous en avez ${Math.floor(state.season.points)})` };
  state.season.claimed[idx] = true;
  const r = { ...tier.reward };
  if (r.insignia) { state.meta.insignia += r.insignia; delete r.insignia; }
  if (r.title) { state.meta.titles = [...new Set([...(state.meta.titles || []), r.title])]; delete r.title; }
  if (r.banner) { state.meta.owned['banner_' + r.banner] = true; delete r.banner; }
  gain(state, r, computeMods(state, now));
  log(state, 'good', `🎖️ Récompense de saison : ${tier.label}.`, now);
  return { ok: true };
}

// ---------- Boutique cosmétique ----------
export function buyCosmetic(state, key) {
  const c = COSMETICS[key];
  if (!c || state.meta.owned[key]) return { ok: false, reason: 'Déjà possédé' };
  if (c.seasonal || c.exclusive) return { ok: false, reason: c.exclusive ? 'Récompense exclusive (Roue, événements)' : 'Récompense de saison uniquement' };
  if ((state.meta.insignia || 0) < c.cost) return { ok: false, reason: 'Pas assez d’insignes' };
  state.meta.insignia -= c.cost;
  state.meta.owned[key] = true;
  return { ok: true };
}

export function applyCosmetic(state, key) {
  const c = COSMETICS[key];
  if (!c || !state.meta.owned[key]) return { ok: false };
  if (c.type === 'banner') state.meta.banner = c.color;
  if (c.type === 'theme') state.meta.theme = state.meta.theme === key ? null : key;
  return { ok: true };
}
