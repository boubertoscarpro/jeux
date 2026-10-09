import { rng } from '../core/rng.js';
import { uid } from '../core/util.js';
import { ITEM_BASES, AFFIXES, UNIQUE_ITEMS, SLOTS } from '../data/items.js';
import { RARITIES, RARITY_ORDER } from '../data/heroes.js';

export const MAX_PLUS = { common: 5, rare: 7, epic: 10, legendary: 12, mythic: 15 };

const round = (v, pct) => (pct ? Math.round(v * 1000) / 1000 : Math.round(v * 10) / 10);

// Tire une rareté. boost > 0 améliore les chances (qualité de forge, catalyseur, butin rare)
export function rollRarity(boost = 0, min = 'common') {
  const minIdx = RARITY_ORDER.indexOf(min);
  const weights = {};
  RARITY_ORDER.forEach((r, i) => {
    if (i < minIdx) return;
    weights[r] = RARITIES[r].weight * Math.pow(1 + boost, i);
  });
  return rng.weighted(weights);
}

// Génère un objet aléatoire
export function generateItem({ slot = null, rarity = null, ilvl = 1, boost = 0, min = 'common', baseKey = null } = {}) {
  let bases = Object.entries(ITEM_BASES);
  if (slot) bases = bases.filter(([, b]) => b.slot === slot);
  rarity = rarity || rollRarity(boost, min);
  const rIdx = RARITY_ORDER.indexOf(rarity);
  bases = bases.filter(([, b]) => !b.minRarity || RARITY_ORDER.indexOf(b.minRarity) <= rIdx);
  const [key, base] = baseKey ? [baseKey, ITEM_BASES[baseKey]] : rng.pick(bases);
  const rm = RARITIES[rarity].mult;
  const lvlMult = 1 + (ilvl - 1) * 0.06;
  const affixes = {};
  for (const [stat, k] of Object.entries(base.sig)) {
    affixes[stat] = round(AFFIXES[stat].base * k * rm * lvlMult * rng.float(0.9, 1.1), AFFIXES[stat].pct);
  }
  const extra = RARITIES[rarity].affixes - 1;
  const pool = [...base.pool, 'combat.atk', 'combat.def', 'gather.all', 'loot.rare', 'prod.all', 'hero.xp', 'stat.force', 'stat.cunning', 'stat.lore', 'stat.command'];
  for (let i = 0; i < extra; i++) {
    // Les affixes de la base sont deux fois plus probables
    const stat = rng.chance(0.65) ? rng.pick(base.pool) : rng.pick(pool);
    const v = AFFIXES[stat].base * rm * lvlMult * rng.float(0.7, 1.15);
    affixes[stat] = round((affixes[stat] || 0) + v, AFFIXES[stat].pct);
  }
  const prefix = { common: '', rare: '', epic: '', legendary: '', mythic: '' };
  return { id: uid('it'), base: key, slot: base.slot, name: prefix[rarity] + base.name, rarity, ilvl, plus: 0, affixes, equippedBy: null };
}

export function createUniqueItem(key) {
  const u = UNIQUE_ITEMS[key];
  return { id: uid('it'), base: key, unique: true, slot: u.slot, name: u.name, rarity: u.rarity, ilvl: 20, plus: 0, affixes: { ...u.affixes }, equippedBy: null };
}

// Valeur effective d'un affixe (avec améliorations +N)
export function affixValue(item, stat) {
  return item.affixes[stat] * (1 + 0.1 * (item.plus || 0));
}

export function itemMods(item) {
  const out = {};
  for (const stat of Object.keys(item.affixes)) out[stat] = affixValue(item, stat);
  return out;
}

export function fmtAffix(stat, value) {
  const a = AFFIXES[stat];
  if (!a) return `${stat}: ${value}`;
  if (a.pct) return `${value >= 0 ? '+' : ''}${(value * 100).toFixed(1).replace('.0', '')}% ${a.name}`;
  return `${value >= 0 ? '+' : ''}${Math.round(value)} ${a.name}`;
}

export function itemScore(item) {
  let s = 0;
  for (const [stat, v] of Object.entries(itemMods(item))) {
    const a = AFFIXES[stat];
    s += Math.abs(a?.pct === false ? v : v * 100);
  }
  return Math.round(s * 10) / 10;
}

// Coût d'amélioration +1
export function upgradeCost(item, discount = 0) {
  const r = RARITY_ORDER.indexOf(item.rarity);
  const p = item.plus + 1;
  const k = (1 + r * 0.6) * Math.pow(1.35, p) * (1 - discount);
  const cost = { steel: Math.ceil(8 * k), gold: Math.ceil(60 * k) };
  if (['armor', 'gloves', 'boots', 'helmet'].includes(item.slot)) cost.leather = Math.ceil(5 * k);
  if (['ring', 'amulet'].includes(item.slot)) { delete cost.steel; cost.silver = Math.ceil(1 * k); }
  if (p >= 6) cost.crystals = Math.ceil((p - 5) * (1 + r * 0.5));
  if (p >= 10) cost.rareOre = Math.ceil((p - 9) * (1 + r));
  return cost;
}

// Matériaux rendus au recyclage
export function salvageYield(item, bonus = 0) {
  const r = RARITY_ORDER.indexOf(item.rarity);
  const k = (1 + r) * (1 + item.plus * 0.3) * (1 + bonus);
  const out = { steel: Math.round(5 * k), leather: Math.round(3 * k), gold: Math.round(30 * k) };
  if (r >= 2) out.crystals = Math.round(r - 1);
  if (r >= 3) out.rareOre = Math.round((r - 2) * 2);
  return out;
}

export const slotName = (slot) => SLOTS[slot]?.name || slot;

// Probabilités de rareté (affichage)
export function rarityOdds(boost = 0, min = 'common') {
  const minIdx = RARITY_ORDER.indexOf(min);
  const w = RARITY_ORDER.map((r, i) => (i < minIdx ? 0 : RARITIES[r].weight * Math.pow(1 + boost, i)));
  const tot = w.reduce((a, b) => a + b, 0);
  return Object.fromEntries(RARITY_ORDER.map((r, i) => [r, w[i] / tot]));
}
