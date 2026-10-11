// Comptoir du Joaillier (voir data/shop.js) : achats en ressources rares, limites quotidiennes (minuit UTC).
import { SHOP_ITEMS, SHOP_MIN_TH } from '../data/shop.js';
import { CONSUMABLES } from '../data/items.js';
import { thLevel } from './city.js';
import { pay, missing } from './economy.js';
import { generateItem } from './items.js';
import { giveXp } from './heroes.js';
import { computeMods } from './modifiers.js';
import { shardState } from './shards.js';
import { createWorker, housing } from './workforce.js';
import { log } from './log.js';

const DAY = 86400000;
export function shopState(state, now = Date.now()) {
  const s = (state.shop && typeof state.shop === 'object' && !Array.isArray(state.shop)) ? state.shop : (state.shop = {});
  const d = Math.floor(now / DAY);
  if (s.day !== d || !s.bought || typeof s.bought !== 'object') { s.day = d; s.bought = {}; }
  s.total ||= 0;
  return s;
}

export function shopCheck(state, id, now = Date.now()) {
  const it = SHOP_ITEMS[id];
  if (!it) return { ok: false, reason: 'Article inconnu' };
  const th = thLevel(state);
  if (th < SHOP_MIN_TH) return { ok: false, reason: `Hôtel de ville niv. ${SHOP_MIN_TH} requis` };
  if (it.th && th < it.th) return { ok: false, reason: `Hôtel de ville niv. ${it.th} requis` };
  const left = it.limit - (shopState(state, now).bought[id] || 0);
  if (left <= 0) return { ok: false, reason: 'Épuisé pour aujourd’hui (renouvelé à minuit)', left: 0 };
  if (it.kind === 'speedup' && !state.queues.build.length) return { ok: false, reason: 'Aucun chantier en cours', left };
  if (it.kind === 'xp' && !state.heroes.length) return { ok: false, reason: 'Aucun héros', left };
  if (it.kind === 'worker' && (state.workers || []).length >= housing(state)) return { ok: false, reason: 'Plus de logement libre pour un ouvrier', left };
  const miss = missing(state, it.cost);
  if (Object.keys(miss).length) return { ok: false, reason: 'Ressources rares insuffisantes', missing: miss, left };
  return { ok: true, left };
}

export function buyShopItem(state, id, now = Date.now()) {
  const c = shopCheck(state, id, now);
  if (!c.ok) return c;
  const it = SHOP_ITEMS[id];
  if (!pay(state, it.cost)) return { ok: false, reason: 'Ressources rares insuffisantes' };
  const S = shopState(state, now);
  S.bought[id] = (S.bought[id] || 0) + 1;
  S.total++;
  let text = it.name;
  switch (it.kind) {
    case 'item': { const g = generateItem({ rarity: it.rarity, ilvl: Math.max(1, thLevel(state)), slot: it.slot || null }); state.inventory.items.push(g); text = g.name; break; }
    case 'buff': state.buffs.push({ name: it.buff.name, mods: it.buff.mods, until: now + it.buff.hours * 3600000 }); break;
    case 'consumable': state.inventory.consumables[it.key] = (state.inventory.consumables[it.key] || 0) + it.n; text = `${it.n} × ${CONSUMABLES[it.key].name}`; break;
    case 'speedup': for (const q of state.queues.build) { q.end = Math.max(now, q.end - it.hours * 3600000); } break;
    case 'xp': { const h = [...state.heroes].sort((a, b) => b.level - a.level)[0]; giveXp(state, h, it.xpPerTh * thLevel(state), computeMods(state, now)); text = `${h.name} : +${it.xpPerTh * thLevel(state)} XP`; break; }
    case 'relic': shardState(state).relicFragments++; break;
    case 'worker': state.workers.push(createWorker()); break;
    default: break;
  }
  log(state, 'good', `💎 Comptoir du Joaillier : ${text}.`, now);
  return { ok: true, text };
}
