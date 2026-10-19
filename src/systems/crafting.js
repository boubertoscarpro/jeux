import { CRAFT_RECIPES, CATALYSTS, CONSUMABLES, SLOTS, FORGE_ORDERS } from '../data/items.js';
import { RARITY_ORDER } from '../data/heroes.js';
import { SEASON } from '../data/social.js';
import { uid, scaleObj } from '../core/util.js';
import { levelOf } from './city.js';
import { computeMods } from './modifiers.js';
import { pay, missing, gain } from './economy.js';
import { generateItem, upgradeCost, MAX_PLUS } from './items.js';
import { lootTick, disposeItems, INVENTORY_CAP } from './armory.js';
import { log } from './log.js';
import { costMult, applyCostMult } from './kingdom.js';
import { PLANS } from '../data/recipes.js';
import { workshopEffect, knowsPlan, applyPlan } from './recipes.js';

// Coût de fabrication ; la réduction cost.craft (spécialisation) s'applique si mods est fourni.
// Avec state : spécialisation de l'atelier ; avec plan : coût supplémentaire du plan de forge.
export function craftCost(slot, catalyst = 'none', mods = null, state = null, plan = null) {
  const c = { ...CRAFT_RECIPES[slot].cost };
  for (const [r, v] of Object.entries(CATALYSTS[catalyst].cost)) c[r] = (c[r] || 0) + v;
  if (plan && PLANS[plan]) for (const [r, v] of Object.entries(PLANS[plan].cost || {})) c[r] = (c[r] || 0) + v;
  const k = (mods ? costMult(mods, 'craft') : 1) * (state ? workshopEffect(state, slot).costMult : 1);
  return k !== 1 ? applyCostMult(c, k) : c;
}

export function craftQuality(state, catalyst, mods, slot = null) {
  return levelOf(state, 'forge') * 0.06 + (mods['craft.quality'] || 0) + CATALYSTS[catalyst].boost + (slot ? workshopEffect(state, slot).quality : 0);
}

export function startCraft(state, slot, catalyst = 'none', now = Date.now(), plan = null, variant = null) {
  const forge = levelOf(state, 'forge');
  if (!forge) return { ok: false, reason: 'Forge requise' };
  if (!SLOTS[slot]) return { ok: false };
  if (plan) {
    const p = PLANS[plan];
    if (!p || p.slot !== slot) return { ok: false, reason: 'Ce plan ne correspond pas à cet emplacement' };
    if (!knowsPlan(state, plan)) return { ok: false, reason: 'Plan inconnu' };
    if (!p.variants[variant]) variant = Object.keys(p.variants)[0];
  }
  if (state.queues.craft.some((q) => q.kind === 'item')) return { ok: false, reason: 'La forge est occupée' };
  const mods = computeMods(state, now);
  const cost = craftCost(slot, catalyst, mods, state, plan);
  if (!pay(state, cost)) return { ok: false, reason: 'Ressources insuffisantes', missing: missing(state, cost) };
  const dur = (CRAFT_RECIPES[slot].time * 1000) / (1 + (mods['craft.speed'] || 0));
  const job = { id: uid('c'), kind: 'item', slot, catalyst, ilvl: 1 + forge * 2, quality: craftQuality(state, catalyst, mods, slot), start: now, end: now + dur, cost };
  if (plan) Object.assign(job, { plan, variant });
  state.queues.craft.push(job);
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

// ───────── Grosses commandes aux forgerons ─────────
export function orderCost(state, slot, key, mods = computeMods(state)) {
  const o = FORGE_ORDERS[key];
  const forge = levelOf(state, 'forge');
  const per = (1 + forge / 5) * o.costMult;
  const base = craftCost(slot, 'none', mods, state);
  const c = {};
  for (const [r, v] of Object.entries(base)) c[r] = Math.ceil(v * per * o.n);
  c.gold = (c.gold || 0) + o.goldPer * o.n * Math.max(1, Math.ceil(forge / 3));
  for (const [r, v] of Object.entries(o.extra || {})) c[r] = (c[r] || 0) + v;
  return c;
}
export function orderDuration(state, slot, key, mods = computeMods(state)) {
  const o = FORGE_ORDERS[key];
  return ((o.hours * 3600 + CRAFT_RECIPES[slot].time * o.n) * 1000) / (1 + (mods['craft.speed'] || 0));
}
export function orderStatus(state, slot, key, now = Date.now()) {
  const o = FORGE_ORDERS[key];
  if (!o || !SLOTS[slot]) return { ok: false, reason: 'Commande inconnue' };
  const forge = levelOf(state, 'forge');
  if (!forge) return { ok: false, reason: 'Forge requise' };
  if (forge < o.forge) return { ok: false, reason: `Forge niv. ${o.forge} requise` };
  if (state.queues.craft.some((q) => q.kind === 'item')) return { ok: false, reason: 'La forge est occupée' };
  const mods = computeMods(state, now);
  const cost = orderCost(state, slot, key, mods);
  const miss = missing(state, cost);
  return { ok: !Object.keys(miss).length, reason: Object.keys(miss).length ? 'Ressources insuffisantes' : null, cost, missing: miss, time: orderDuration(state, slot, key, mods), quality: craftQuality(state, 'none', mods, slot) + o.quality, n: o.n };
}
// Lancement : tout est vérifié puis payé d'un coup ; annulable (80 % rendus, comme une fabrication normale)
export function startForgeOrder(state, slot, key, now = Date.now()) {
  const st = orderStatus(state, slot, key, now);
  if (!st.ok) return { ok: false, reason: st.reason, missing: st.missing };
  if (!pay(state, st.cost)) return { ok: false, reason: 'Ressources insuffisantes', missing: missing(state, st.cost) };
  const o = FORGE_ORDERS[key];
  state.queues.craft.push({ id: uid('c'), kind: 'item', order: key, n: o.n, slot, catalyst: 'none', ilvl: 1 + levelOf(state, 'forge') * 2, quality: st.quality, start: now, end: now + st.time, cost: st.cost });
  log(state, 'info', `${o.icon} ${o.name} passée aux forgerons : ${o.n} × ${SLOTS[slot].name}.`, now);
  return { ok: true, text: `${o.name} : ${o.n} objets` };
}

export function completeCraft(state, q, t) {
  if (q.kind === 'item' && q.order && FORGE_ORDERS[q.order]) {
    const o = FORGE_ORDERS[q.order];
    const made = [];
    for (let i = 0; i < (q.n || o.n); i++) {
      // Garantie : les premiers objets de la commande atteignent au moins la rareté promise
      const min = o.guarantee && i < o.guarantee.count ? o.guarantee.rarity : 'common';
      const it = generateItem({ slot: q.slot, ilvl: q.ilvl, boost: q.quality, min });
      state.inventory.items.push(it);
      made.push(it);
    }
    state.stats.crafted = (state.stats.crafted || 0) + made.length;
    state.stats.forgeOrders = (state.stats.forgeOrders || 0) + 1;
    state.season.points += SEASON.points.craft * made.length;
    const best = [...made].sort((a, b) => RARITY_ORDER.indexOf(b.rarity) - RARITY_ORDER.indexOf(a.rarity))[0];
    log(state, 'good', `${o.icon} ${o.name} livrée : ${made.length} × ${SLOTS[q.slot].name} (meilleur : ${best.name}, ${best.rarity}).`, t);
    return;
  }
  if (q.kind === 'item') {
    const base = q.plan && PLANS[q.plan] ? PLANS[q.plan].base : null;
    const it = generateItem({ slot: q.slot, ilvl: q.ilvl, boost: q.quality, min: CATALYSTS[q.catalyst]?.minRarity || 'common', baseKey: base });
    if (base) applyPlan(it, q.plan, q.variant);
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

// Démanteler un objet (v18 : rend aussi les gemmes serties à l'écrin ; annulable comme une action en masse)
export function salvageItem(state, itemId, now = Date.now()) {
  const it = state.inventory.items.find((i) => i.id === itemId);
  if (!it) return { ok: false };
  if (it.equippedBy) return { ok: false, reason: 'Objet équipé' };
  if (it.locked) return { ok: false, reason: 'Objet verrouillé' };
  const r = disposeItems(state, [itemId], 'dismantle', now, { manual: true, mods: computeMods(state, now) });
  return r.ok ? { ok: true, yield: r.res } : r;
}

// v18 : plus de recyclage silencieux. À chaque pas du monde, le butin arrivé passe par l'équipement automatique
// (facultatif) et les règles de tri du joueur ; au-delà de 300 objets, les moins utiles sont démantelés avec un
// rapport, jamais une pièce portée, verrouillée, réservée ou meilleure pour un héros (systems/armory.js).
export { INVENTORY_CAP };
export function inventoryCapTick(state, now = Date.now()) {
  const r = lootTick(state, now, computeMods(state, now));
  return r?.kind === 'cap' ? r.n : 0;
}

export function toggleLock(state, itemId) {
  const it = state.inventory.items.find((i) => i.id === itemId);
  if (it) it.locked = !it.locked;
}
