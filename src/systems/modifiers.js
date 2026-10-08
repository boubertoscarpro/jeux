import { BUILDINGS } from '../data/buildings.js';
import { TECHS } from '../data/techs.js';
import { WORLD_EVENTS } from '../data/events.js';
import { WEATHER } from '../data/units.js';
import { TERRAINS } from '../data/world.js';
import { GUILDS, GUILD_LEVELS } from '../data/social.js';
import { allBuildings, proximityEffects } from './city.js';
import { heroMods } from './heroes.js';
import { sectorBonuses, foremanMods } from './workforce.js';
import { livingMods } from './living.js';
import { repMods } from './reputation.js';
import { collectionMods } from './collection.js';
import { talentMods } from './talents.js';

const add = (o, k, v) => { if (typeof v === 'number') o[k] = (o[k] || 0) + v; };
const merge = (o, src, mult = 1) => { for (const [k, v] of Object.entries(src || {})) add(o, k, v * mult); };

// Agrège tous les modificateurs globaux du royaume.
// Clés : prod.<res>, prod.all, combat.atk, storage (absolu), city.def, marches, …
export function computeMods(state, now = Date.now()) {
  const m = {};
  // Bâtiments
  for (const b of allBuildings(state)) {
    if (b.level <= 0) continue;
    const def = BUILDINGS[b.type];
    if (def?.effects) merge(m, def.effects(b.level));
    if (def) merge(m, proximityEffects(state, b));
  }
  for (const [type, lvl] of Object.entries(state.city.fort)) if (lvl > 0) merge(m, BUILDINGS[type].effects(lvl));
  // Technologies
  for (const id of Object.keys(state.techs)) merge(m, TECHS[id]?.mods);
  // Héros
  for (const h of state.heroes) {
    merge(m, heroMods(state, h, 'global'));
    if (h.assignment?.type === 'governor') merge(m, heroMods(state, h, 'governor'));
  }
  // Événements mondiaux
  for (const e of state.events) if (e.end > now) merge(m, WORLD_EVENTS[e.key]?.mods);
  // Météo
  const w = WEATHER[state.weather?.type];
  if (w) {
    for (const [r, v] of Object.entries(w.prod || {})) add(m, 'prod.' + r, v);
    if (w.upkeep) add(m, 'upkeep', w.upkeep);
  }
  // Buffs temporaires (potions, bénédictions)
  for (const b of state.buffs) if (b.until > now) merge(m, b.mods);
  // Territoires
  for (const t of Object.values(state.territories)) merge(m, TERRAINS[t.terrain]?.territory);
  // Guilde
  if (state.guild) {
    merge(m, GUILDS[state.guild.key]?.perk);
    for (const gl of GUILD_LEVELS) if (state.guild.level >= gl.lvl) merge(m, gl.mods);
  }
  // Ouvriers, contremaîtres, saisons, réputation, collection, talents
  merge(m, sectorBonuses(state, now));
  merge(m, foremanMods(state, now));
  merge(m, livingMods(state, now));
  merge(m, repMods(state));
  merge(m, collectionMods(state));
  merge(m, talentMods(state));
  // Traités
  for (const f of state.factions || []) {
    if (f.stance === 'trade' || f.stance === 'alliance') { add(m, 'market.fee', -0.02); add(m, 'caravan.gain', 0.05); }
  }
  if ((state.automation?.level || 0) >= 6) add(m, 'chain.efficiency', 0.15);
  return m;
}

// Multiplicateur de production d'une ressource (hors adjacence)
export const prodMult = (mods, res) => 1 + (mods['prod.' + res] || 0) + (mods['prod.all'] || 0);
