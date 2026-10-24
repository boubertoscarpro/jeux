// v22b « Boutique de la Couronne » (voir data/goldShop.js) : achats en or, prix croissants dans la journée.
import { GOLD_SHOP, GOLD_SHOP_MIN_TH, GOLD_SHOP_RISE, GOLD_SHOP_GROWTH } from '../data/goldShop.js';
import { SPEEDUPS } from '../data/speedups.js';
import { CONSUMABLES } from '../data/items.js';
import { thLevel } from './city.js';
import { generateItem } from './items.js';
import { grantSpeedups } from './speedups.js';
import { log } from './log.js';

const DAY = 86400000;
export function goldShopState(state, now = Date.now()) {
  const g = (state.goldShop && typeof state.goldShop === 'object' && !Array.isArray(state.goldShop)) ? state.goldShop : (state.goldShop = {});
  const d = Math.floor(now / DAY);
  if (g.day !== d || !g.bought || typeof g.bought !== 'object') { g.day = d; g.bought = {}; }
  g.spent ||= 0; g.total ||= 0;
  return g;
}
export const goldShopName = (id) => {
  const it = GOLD_SHOP[id];
  if (!it) return '?';
  if (it.kind === 'speedup') return SPEEDUPS[it.key].name;
  if (it.kind === 'consumable') return `${it.n > 1 ? `${it.n} × ` : ''}${CONSUMABLES[it.key].name}`;
  return it.rarity === 'epic' ? 'Grand coffre de l’armurier' : 'Coffre de l’armurier';
};
// Prix d'un article : selon le niveau de l'hôtel de ville, puis ×1,6 par achat déjà fait aujourd'hui ; arrondi « marchand »
const round = (v) => { const p = 10 ** Math.max(1, Math.floor(Math.log10(v)) - 1); return Math.ceil(v / p) * p; };
export function goldPrice(state, id, now = Date.now()) {
  const it = GOLD_SHOP[id];
  const th = Math.max(1, thLevel(state));
  const base = it.kind === 'speedup' ? it.perMin * SPEEDUPS[it.key].min : it.base;
  const n = goldShopState(state, now).bought[id] || 0;
  return round(base * GOLD_SHOP_GROWTH ** (th - 1) * GOLD_SHOP_RISE ** n);
}
export function goldShopCheck(state, id, now = Date.now()) {
  const it = GOLD_SHOP[id];
  if (!it) return { ok: false, reason: 'Article inconnu' };
  const th = thLevel(state);
  if (th < GOLD_SHOP_MIN_TH) return { ok: false, reason: `Hôtel de ville niv. ${GOLD_SHOP_MIN_TH} requis` };
  if (it.th && th < it.th) return { ok: false, reason: `Hôtel de ville niv. ${it.th} requis` };
  const left = it.limit - (goldShopState(state, now).bought[id] || 0);
  if (left <= 0) return { ok: false, reason: 'Épuisé pour aujourd’hui (renouvelé à minuit)', left: 0 };
  const price = goldPrice(state, id, now);
  if ((state.resources.gold || 0) < price) return { ok: false, reason: `Or insuffisant : il manque ${Math.ceil(price - (state.resources.gold || 0))} pièces`, price, left };
  return { ok: true, price, left };
}
export function buyGoldItem(state, id, now = Date.now()) {
  const c = goldShopCheck(state, id, now);
  if (!c.ok) return c;
  const it = GOLD_SHOP[id];
  state.resources.gold -= c.price;
  const G = goldShopState(state, now);
  G.bought[id] = (G.bought[id] || 0) + 1;
  G.spent += c.price; G.total++;
  let text = goldShopName(id);
  if (it.kind === 'speedup') grantSpeedups(state, { [it.key]: 1 }, 'Boutique de la Couronne', now);
  else if (it.kind === 'consumable') state.inventory.consumables[it.key] = (state.inventory.consumables[it.key] || 0) + it.n;
  else if (it.kind === 'item') { const g = generateItem({ rarity: it.rarity, ilvl: Math.max(1, thLevel(state)) }); state.inventory.items.push(g); text = g.name; }
  log(state, 'good', `Boutique de la Couronne : ${text} contre ${c.price} or.`, now);
  return { ok: true, text, price: c.price };
}
