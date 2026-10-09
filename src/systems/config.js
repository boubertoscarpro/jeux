import { SHARD_CONFIG, WHEEL_CONFIG } from '../data/shards.js';

// Configuration effective = valeurs par défaut + surcharges de l'outil d'administration (state.admin)
const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
export function deepMerge(base, over) {
  if (!isObj(over)) return base;
  const out = Array.isArray(base) ? [...base] : { ...base };
  for (const [k, v] of Object.entries(over)) out[k] = isObj(v) && isObj(base?.[k]) ? deepMerge(base[k], v) : v;
  return out;
}
export const shardCfg = (state) => deepMerge(SHARD_CONFIG, state?.admin?.shards);
export const wheelCfg = (state) => deepMerge(WHEEL_CONFIG, state?.admin?.wheel);
