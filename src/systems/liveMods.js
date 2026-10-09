import { LIVE_EVENTS } from '../data/liveEvents.js';

// Modificateurs apportés par l'événement en cours et les surprises actives
// (module séparé, sans dépendances, pour éviter les imports circulaires avec modifiers.js)
const SURPRISE_MODS = {
  fair: { 'market.fee': -0.06 },
  eclipse: { 'loot.rare': 0.1, 'shard.detect': 0.03 },
};

export function liveMods(state, now = Date.now()) {
  const out = {};
  const add = (src) => { for (const [k, v] of Object.entries(src || {})) out[k] = (out[k] || 0) + v; };
  const cur = state.live?.current;
  if (cur && cur.end > now) add(LIVE_EVENTS[cur.key]?.mods);
  for (const s of state.live?.surprises || []) if (s.start <= now && s.end > now) add(SURPRISE_MODS[s.key]);
  return out;
}
