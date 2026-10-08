import { rng } from '../core/rng.js';
import { uid } from '../core/util.js';
import { HERO_CLASSES, HERO_NAMES, HERO_EPITHETS, RARITIES, RARITY_ORDER, SECTORS, xpForLevel, HERO_MAX_LEVEL } from '../data/heroes.js';
import { SLOT_ORDER, AFFIXES } from '../data/items.js';
import { itemMods } from './items.js';

export function createHero({ cls, rarity = 'common', rand = null, name = null, level = 1 } = {}) {
  const r = rand || rng.random;
  const pick = (arr) => arr[Math.floor(r() * arr.length)];
  cls = cls || pick(Object.keys(HERO_CLASSES));
  const def = HERO_CLASSES[cls];
  // Petite variation individuelle des caractéristiques
  const talent = {};
  for (const k of Object.keys(def.base)) talent[k] = Math.round((0.85 + r() * 0.3) * 100) / 100;
  return {
    id: uid('h'),
    name: name || `${pick(HERO_NAMES)} ${pick(HERO_EPITHETS)}`,
    cls, rarity, level, xp: 0, talent,
    equipment: Object.fromEntries(SLOT_ORDER.map((s) => [s, null])),
    assignment: null, // { type: 'governor', sector }
    marchId: null,
  };
}

export function heroMaxLevel(mods) { return HERO_MAX_LEVEL + (mods?.['hero.maxLevel'] || 0); }

export function equippedItems(state, hero) {
  return Object.values(hero.equipment).filter(Boolean)
    .map((id) => state.inventory.items.find((i) => i.id === id)).filter(Boolean);
}

// Caractéristiques effectives d'un héros
export function heroStats(state, hero) {
  const def = HERO_CLASSES[hero.cls];
  const rm = RARITIES[hero.rarity].mult;
  const out = {};
  for (const k of Object.keys(def.base)) {
    out[k] = (def.base[k] + def.growth[k] * (hero.level - 1)) * rm * (hero.talent?.[k] || 1);
  }
  for (const item of equippedItems(state, hero)) {
    for (const [stat, v] of Object.entries(itemMods(item))) {
      if (stat.startsWith('stat.')) out[stat.slice(5)] += v;
    }
  }
  for (const k of Object.keys(out)) out[k] = Math.round(out[k]);
  return out;
}

export function heroSkills(hero) {
  return HERO_CLASSES[hero.cls].skills.map((s) => ({ ...s, unlocked: hero.level >= s.lvl }));
}

const add = (o, k, v) => { o[k] = (o[k] || 0) + v; };

// Modificateurs apportés par un héros dans un contexte : 'commander' | 'governor' | 'global'
export function heroMods(state, hero, ctx) {
  const out = {};
  for (const s of heroSkills(hero)) {
    if (s.unlocked && s.ctx === ctx) for (const [k, v] of Object.entries(s.mods)) add(out, k, v);
  }
  if (ctx === 'global') return out;
  for (const item of equippedItems(state, hero)) {
    for (const [stat, v] of Object.entries(itemMods(item))) {
      if (AFFIXES[stat]?.ctx === ctx) add(out, stat, v);
    }
  }
  const st = heroStats(state, hero);
  if (ctx === 'commander') {
    add(out, 'combat.atk', st.force * 0.004);
    add(out, 'combat.def', st.command * 0.004);
    add(out, 'combat.morale', st.command * 0.4);
    add(out, 'gather.all', st.lore * 0.002 + st.cunning * 0.002);
    add(out, 'loot.rare', st.cunning * 0.0008);
    add(out, 'explore.speed', st.cunning * 0.004);
  }
  if (ctx === 'governor' && hero.assignment?.sector) {
    const sector = SECTORS[hero.assignment.sector];
    const match = HERO_CLASSES[hero.cls].sector === hero.assignment.sector ? 1.5 : 1;
    for (const key of sector.mods) {
      if (key === 'market.fee') add(out, key, -st.lore * 0.0004 * match);
      else add(out, key, st.lore * 0.004 * match);
    }
  }
  return out;
}

export function heroPower(state, hero) {
  const st = heroStats(state, hero);
  return Math.round((st.force + st.command + st.cunning + st.lore) * (1 + hero.level / 20));
}

// Gain d'expérience ; renvoie le nombre de niveaux gagnés
export function giveXp(state, hero, amount, mods = {}) {
  if (!hero) return 0;
  const itemXp = equippedItems(state, hero).reduce((s, it) => s + (itemMods(it)['hero.xp'] || 0), 0);
  hero.xp += amount * (1 + (mods['hero.xp'] || 0) + itemXp);
  let gained = 0;
  const max = heroMaxLevel(mods);
  while (hero.level < max && hero.xp >= xpForLevel(hero.level)) {
    hero.xp -= xpForLevel(hero.level);
    hero.level++;
    gained++;
  }
  if (hero.level >= max) hero.xp = Math.min(hero.xp, xpForLevel(hero.level));
  return gained;
}

// Recrutement en taverne
export const RECRUIT_COST = {
  common: { gold: 200 }, rare: { gold: 650 }, epic: { gold: 2200, gems: 2 },
  legendary: { gold: 7000, gems: 8 }, mythic: { gold: 18000, gems: 25, crystals: 10 },
};

export function rollCandidates(tavernLevel) {
  const out = [];
  const boost = 0.08 * tavernLevel;
  for (let i = 0; i < 3; i++) {
    const weights = {};
    RARITY_ORDER.forEach((r, idx) => { weights[r] = RARITIES[r].weight * Math.pow(1 + boost, idx); });
    const rarity = rng.weighted(weights);
    out.push(createHero({ rarity }));
  }
  return out;
}
