import { CRAFT_RECIPES, CATALYSTS, CONSUMABLES, SLOTS } from '../data/items.js';
import { SEASON } from '../data/social.js';
import { uid, scaleObj } from '../core/util.js';
import { levelOf } from './city.js';
import { computeMods } from './modifiers.js';
import { pay, missing, gain } from './economy.js';
import { generateItem, upgradeCost, salvageYield, MAX_PLUS } from './items.js';
import { log } from './log.js';

export function craftCost(slot, catalyst = 'none') {
  const c = { ...CRAFT_RECIPES[slot].cost };
  for (const [r, v] of Object.entries(CATALYSTS[catalyst].cost)) c[r] = (c[r] || 0) + v;
  return c;
}

export function craftQuality(state, catalyst, mods) {
  return levelOf(state, 'forge') * 0.06 + (mods['craft.quality'] || 0) + CATALYSTS[catalyst].boost;
}

export function startCraft(state, slot, catalyst = 'none', now = Date.now()) {
  const forge = levelOf(state, 'forge');
  if (!forge) return { ok: false, reason: 'Forge requise' };
  if (!SLOTS[slot]) return { ok: false };
  if (state.queues.craft.some((q) => q.kind === 'item')) return { ok: false, reason: 'La forge est occupée' };
  const cost = craftCost(slot, catalyst);
  if (!pay(state, cost)) return { ok: false, reason: 'Ressources insuffisantes', missing: missing(state, cost) };
  const mods = computeMods(state, now);
  const dur = (CRAFT_RECIPES[slot].time * 1000) / (1 + (mods['craft.speed'] || 0));
  state.queues.craft.push({ id: uid('c'), kind: 'item', slot, catalyst, ilvl: 1 + forge * 2, quality: craftQuality(state, catalyst, mods), start: now, end: now + dur, cost });
  return { ok: true };
}

export function startBrew(state, key, n = 1, now = Date.now()) {
  const c = CONSUMABLES[key];
  const lab = levelOf(state, 'laboratory');
  if (!lab) return { ok: false, reason: 'Laboratoire requis' };
  if (lab < c.lab) return { ok: false, reason: `Laboratoire niv. ${c.lab} requis` };
  if (state.queues.craft.some((q) => q.kind === 'potion')) return { ok: false, reason: 'Le laboratoire est occupé' };
  n = Math.max(1, Math.floor(n));
  const cost = scaleObj(c.cost, n);
  if (!pay(state, cost)) return { ok: false, reason: 'Ressources insuffisantes', missing: missing(state, cost) };
  const mods = computeMods(state, now);
  const dur = (c.time * n * 1000) / (1 + (mods['craft.speed'] || 0) + lab * 0.04);
  state.queues.craft.push({ id: uid('c'), kind: 'potion', key, n, start: now, end: now + dur, cost });
  return { ok: true };
}

export function completeCraft(state, q, t) {
  if (q.kind === 'item') {
    const it = generateItem({ slot: q.slot, ilvl: q.ilvl, boost: q.quality, min: CATALYSTS[q.catalyst].minRarity || 'common' });
    state.inventory.items.push(it);
    state.stats.crafted++;
    state.season.points += SEASON.points.craft;
    log(state, 'good', `⚒️ La forge a produit : ${it.name} (${it.rarity}).`, t);
  } else {
    state.inventory.consumables[q.key] = (state.inventory.consumables[q.key] || 0) + q.n;
    log(state, 'good', `⚗️ ${q.n} × ${CONSUMABLES[q.key].name} prêt(s).`, t);
  }
}

export function cancelCraft(state, qid) {
  const i = state.queues.craft.findIndex((q) => q.id === qid);
  if (i < 0) return { ok: false };
  const q = state.queues.craft[i];
  for (const [r, v] of Object.entries(q.cost)) state.resources[r] += Math.floor(v * 0.8);
  state.queues.craft.splice(i, 1);
  return { ok: true };
}

export function usePotion(state, key, now = Date.now()) {
  const c = CONSUMABLES[key];
  if (!c?.buff) return { ok: false, reason: 'Cette potion s’emporte en marche' };
  if (!(state.inventory.consumables[key] > 0)) return { ok: false, reason: 'Aucune en stock' };
  const mods = computeMods(state, now);
  state.inventory.consumables[key]--;
  state.buffs.push({ name: c.name, mods: c.buff.mods, until: now + c.buff.duration * 1000 * (1 + (mods['potion.duration'] || 0)) });
  return { ok: true };
}

export function upgradeItem(state, itemId, now = Date.now()) {
  const it = state.inventory.items.find((i) => i.id === itemId);
  if (!it) return { ok: false };
  if (!levelOf(state, 'forge')) return { ok: false, reason: 'Forge requise' };
  if (it.plus >= MAX_PLUS[it.rarity]) return { ok: false, reason: 'Amélioration maximale' };
  if (it.plus >= levelOf(state, 'forge') + 2) return { ok: false, reason: `Forge niv. ${it.plus - 1} requise` };
  const mods = computeMods(state, now);
  const cost = upgradeCost(it, -(mods['upgrade.cost'] || 0));
  if (!pay(state, cost)) return { ok: false, reason: 'Ressources insuffisantes', missing: missing(state, cost) };
  it.plus++;
  return { ok: true };
}

export function salvageItem(state, itemId, now = Date.now()) {
  const it = state.inventory.items.find((i) => i.id === itemId);
  if (!it) return { ok: false };
  if (it.equippedBy) return { ok: false, reason: 'Objet équipé' };
  const mods = computeMods(state, now);
  const y = salvageYield(it, mods['salvage.bonus'] || 0);
  gain(state, y, mods);
  state.inventory.items = state.inventory.items.filter((i) => i.id !== itemId);
  return { ok: true, yield: y };
}

export function toggleLock(state, itemId) {
  const it = state.inventory.items.find((i) => i.id === itemId);
  if (it) it.locked = !it.locked;
}
