import { ARTIFACTS, COLLECTION_SETS } from '../data/artifacts.js';
import { RARE_RES } from '../data/resources.js';
import { COSMETICS } from '../data/social.js';
import { rng } from '../core/rng.js';
import { chronicle } from './chronicle.js';
import { toast } from './log.js';

// Donne un artefact (aléatoire parmi ceux non possédés si key = null). Renvoie son nom ou null.
export function grantArtifact(state, key, now = Date.now(), source = '') {
  const owned = (state.artifacts ||= {});
  if (!key) {
    const left = Object.keys(ARTIFACTS).filter((k) => !owned[k]);
    if (!left.length) return null;
    key = rng.pick(left);
  }
  if (owned[key]) return null;
  owned[key] = { t: now, source };
  chronicle(state, `Le royaume entre en possession d’un artefact légendaire : ${ARTIFACTS[key].name}.`, now);
  toast(`${ARTIFACTS[key].icon} Artefact : ${ARTIFACTS[key].name} !`, 'good');
  return ARTIFACTS[key].name;
}

function setProgress(state, set) {
  const n = set.need;
  if (n.artifacts) return [n.artifacts.filter((a) => state.artifacts?.[a]).length, n.artifacts.length];
  if (n.bosses) return [Object.keys(state.bossTrophies || {}).length, n.bosses];
  if (n.heroClasses) return [new Set([...(state.meta.heroClassesSeen || []), ...state.heroes.map((h) => h.cls)]).size, n.heroClasses];
  if (n.rareStock) return [RARE_RES.filter((r) => (state.resources[r] || 0) >= n.rareStock).length, RARE_RES.length];
  if (n.decos) return [Object.keys(state.meta.owned || {}).filter((k) => COSMETICS[k]?.type === 'deco').length, n.decos];
  return [0, 1];
}

export function collectionStatus(state) {
  return COLLECTION_SETS.map((s) => { const [cur, max] = setProgress(state, s); return { ...s, cur, max, done: cur >= max }; });
}

export function collectionMods(state) {
  const m = {};
  for (const k of Object.keys(state.artifacts || {})) for (const [mk, v] of Object.entries(ARTIFACTS[k]?.mods || {})) m[mk] = (m[mk] || 0) + v;
  for (const s of collectionStatus(state)) if (s.done) for (const [mk, v] of Object.entries(s.mods)) m[mk] = (m[mk] || 0) + v;
  return m;
}
