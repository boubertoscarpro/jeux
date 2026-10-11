// Récompenses communes aux quêtes du royaume et aux missions dynamiques. Elles réutilisent les systèmes existants
// (ressources, objets, réputation, fragments de relique, expérience des héros, bonus temporaires) et restent modestes
// par rapport à la production : elles accélèrent la progression sans rendre l'économie inutile.
import { RESOURCES } from '../data/resources.js';
import { RARITIES } from '../data/heroes.js';
import { REPUTATIONS, bumpRep } from './reputation.js';
import { gain } from './economy.js';
import { computeMods } from './modifiers.js';
import { generateItem } from './items.js';
import { giveXp } from './heroes.js';
import { shardState } from './shards.js';
import { fmt } from '../core/util.js';

// reward : { res: {r: n}, item: 'rare'|'epic'|…, rep: {axe: n}, relic: n, xp: n, buff: { name, mods, hours } }
export function grantReward(state, reward, now = Date.now()) {
  const mods = computeMods(state, now);
  const parts = [];
  if (reward.res && Object.keys(reward.res).length) { gain(state, reward.res, mods); parts.push(Object.entries(reward.res).map(([r, v]) => `${fmt(v)} ${RESOURCES[r]?.icon || r}`).join(' ')); }
  if (reward.item) {
    const th = Object.values(state.city.buildings).find((b) => b.type === 'townhall')?.level || 1;
    const it = generateItem({ rarity: reward.item, ilvl: Math.max(1, th) });
    state.inventory.items.push(it);
    parts.push(`objet ${RARITIES[reward.item]?.name.toLowerCase() || reward.item} : ${it.name}`);
  }
  if (reward.rep) for (const [a, n] of Object.entries(reward.rep)) { bumpRep(state, a, n); parts.push(`réputation ${REPUTATIONS[a]?.name.toLowerCase() || a} +${n}`); }
  if (reward.relic) { shardState(state).relicFragments += reward.relic; parts.push(`+${reward.relic} fragment(s) de relique`); }
  if (reward.xp) {
    const h = [...state.heroes].sort((a, b) => b.level - a.level)[0];
    if (h) { giveXp(state, h, reward.xp, mods); parts.push(`+${reward.xp} XP pour ${h.name}`); }
  }
  if (reward.buff) { state.buffs.push({ name: reward.buff.name, mods: reward.buff.mods, until: now + reward.buff.hours * 3600000 }); parts.push(`bonus « ${reward.buff.name} » (${reward.buff.hours} h)`); }
  return parts.join(', ');
}

// Texte court d'une récompense (sans l'accorder)
export function rewardText(reward = {}) {
  const parts = [];
  if (reward.res) parts.push(Object.entries(reward.res).map(([r, v]) => `${RESOURCES[r]?.icon || r} ${fmt(v)}`).join(' '));
  if (reward.item) parts.push(`🎒 objet ${RARITIES[reward.item]?.name.toLowerCase() || reward.item}`);
  if (reward.rep) parts.push(Object.entries(reward.rep).map(([a, n]) => `${REPUTATIONS[a]?.icon || ''} +${n} ${REPUTATIONS[a]?.name.toLowerCase() || a}`).join(' '));
  if (reward.relic) parts.push(`🏺 ${reward.relic} fragment(s) de relique`);
  if (reward.xp) parts.push(`✨ ${reward.xp} XP (héros)`);
  if (reward.buff) parts.push(`⏳ ${reward.buff.name} (${reward.buff.hours} h)`);
  return parts.join(' · ');
}
