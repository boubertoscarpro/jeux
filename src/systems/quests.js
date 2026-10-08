import { STORY_QUESTS, MILESTONES } from '../data/quests.js';
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

export function questProgress(state, q) {
  const [cur, target] = q.check(state, H);
  return { cur: Math.min(cur, target), target, done: cur >= target };
}

// Les 3 prochaines quêtes non réclamées
export function activeQuests(state, n = 3) {
  return STORY_QUESTS.filter((q) => !state.quests.done[q.id]).slice(0, n).map((q) => ({ ...q, ...questProgress(state, q) }));
}

export function claimQuest(state, id, now = Date.now()) {
  const q = STORY_QUESTS.find((x) => x.id === id);
  if (!q || state.quests.done[id]) return { ok: false };
  if (!questProgress(state, q).done) return { ok: false, reason: 'Objectif non atteint' };
  state.quests.done[id] = now;
  gain(state, q.reward, computeMods(state, now));
  log(state, 'good', `✅ Quête accomplie : ${q.title}.`, now);
  return { ok: true, reward: q.reward };
}

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
  if (!m || !m.done) return { ok: false };
  state.quests.milestones[id] = m.tier + 1;
  gain(state, m.reward, computeMods(state, now));
  state.meta.insignia = (state.meta.insignia || 0) + 1;
  log(state, 'good', `🏅 Jalon « ${m.title} » palier ${m.tier + 1} atteint (+1 insigne).`, now);
  return { ok: true };
}

export const claimableCount = (state) => activeQuests(state).filter((q) => q.done).length + milestoneList(state).filter((m) => m.done).length;

// ---------- Saison ----------
export function seasonInfo(state, now = Date.now()) {
  const end = state.season.start + SEASON.lengthDays * 86400000;
  return { ...SEASON, end, remaining: end - now, points: Math.floor(state.season.points) };
}

export function claimSeasonTier(state, idx, now = Date.now()) {
  const tier = SEASON.tiers[idx];
  if (!tier || state.season.claimed[idx] || state.season.points < tier.pts) return { ok: false };
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
  if (c.seasonal) return { ok: false, reason: 'Récompense de saison uniquement' };
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
