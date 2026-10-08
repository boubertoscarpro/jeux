import { RESOURCES, TRADABLE } from '../data/resources.js';
import { WORLD_EVENTS } from '../data/events.js';
import { rng } from '../core/rng.js';
import { uid, fmt } from '../core/util.js';
import { levelOf } from './city.js';
import { computeMods } from './modifiers.js';
import { pay, gain } from './economy.js';
import { poiAt, distCap } from './world.js';
import { log } from './log.js';
import { generateItem } from './items.js';

const HISTORY = 48;

export function initMarket(now = Date.now()) {
  const prices = {}, history = {};
  for (const r of TRADABLE) { prices[r] = RESOURCES[r].price; history[r] = [RESOURCES[r].price]; }
  return { prices, history, last: now };
}

const liquidity = (r) => 6000 / Math.sqrt(RESOURCES[r].price);
export const marketFee = (mods) => Math.max(0.02, 0.12 + (mods['market.fee'] || 0));

function eventMult(state, r, now) {
  let k = 1;
  for (const e of state.events) if (e.end > now) k *= WORLD_EVENTS[e.key]?.market?.[r] || 1;
  return k;
}

// Prix moyen d'une transaction avec impact sur le marché
function tradeQuote(state, r, qty, dir) {
  const p0 = state.market.prices[r];
  const impact = (qty / liquidity(r)) * 0.5;
  const p1 = dir > 0 ? p0 * (1 + impact) : p0 * Math.max(0.3, 1 - impact);
  return { avg: (p0 + p1) / 2, after: p1 };
}

export function quote(state, r, qty, dir, mods = computeMods(state)) {
  const { avg, after } = tradeQuote(state, r, qty, dir);
  const fee = marketFee(mods);
  const unit = dir > 0 ? avg * (1 + fee) : avg * (1 - fee);
  return { unit, total: Math.round(unit * qty), after, fee };
}

export function sell(state, r, qty, now = Date.now()) {
  qty = Math.floor(qty);
  if (!levelOf(state, 'market')) return { ok: false, reason: 'Marché requis' };
  if (!(qty > 0) || (state.resources[r] || 0) < qty) return { ok: false, reason: 'Quantité invalide' };
  const mods = computeMods(state, now);
  const q = quote(state, r, qty, -1, mods);
  state.resources[r] -= qty;
  state.resources.gold += q.total;
  state.market.prices[r] = Math.max(RESOURCES[r].price * 0.25, q.after);
  state.stats.trades++;
  return { ok: true, gold: q.total };
}

export function buy(state, r, qty, now = Date.now()) {
  qty = Math.floor(qty);
  if (!levelOf(state, 'market')) return { ok: false, reason: 'Marché requis' };
  if (!(qty > 0)) return { ok: false, reason: 'Quantité invalide' };
  const mods = computeMods(state, now);
  const q = quote(state, r, qty, 1, mods);
  if (!pay(state, { gold: q.total })) return { ok: false, reason: `Il faut ${fmt(q.total)} or` };
  gain(state, { [r]: qty }, mods);
  state.market.prices[r] = Math.min(RESOURCES[r].price * 4, q.after);
  state.stats.trades++;
  return { ok: true, gold: q.total };
}

// Évolution des prix (offre/demande simulée + événements)
export function marketTick(state, now) {
  const m = state.market;
  for (const r of TRADABLE) {
    const target = RESOURCES[r].price * eventMult(state, r, now);
    let p = m.prices[r];
    p += (target - p) * 0.15; // retour vers l'équilibre
    p *= 1 + rng.float(-0.04, 0.04); // activité des autres joueurs
    m.prices[r] = Math.max(RESOURCES[r].price * 0.25, Math.min(RESOURCES[r].price * 4, p));
    m.history[r].push(Math.round(m.prices[r] * 100) / 100);
    if (m.history[r].length > HISTORY) m.history[r].shift();
  }
  m.last = now;
}

// ---------- Caravanes ----------
export const caravanSlots = (mods) => Math.max(0, mods.caravans || 0);
export const caravanCargo = (state) => 800 + levelOf(state, 'market') * 400 + levelOf(state, 'port') * 600;

export function townPrice(state, town, r, mods) {
  const base = state.market.prices[r];
  const wanted = town.wants?.includes(r) ? 1.6 : 1.12;
  return base * wanted * (1 + (mods['caravan.gain'] || 0) + Math.min(0.2, (town.relation || 0) * 0.01));
}

export function caravanTime(state, town, mods) {
  return (distCap(state.world, town.x, town.y) * 26 * 1000) / (1 + (mods['caravan.speed'] || 0));
}

export function sendCaravan(state, x, y, r, qty, repeat = false, now = Date.now()) {
  const mods = computeMods(state, now);
  const town = poiAt(state.world, x, y);
  qty = Math.floor(qty);
  if (!town || town.type !== 'town') return { ok: false, reason: 'Pas de cité ici' };
  if (!levelOf(state, 'market')) return { ok: false, reason: 'Marché requis' };
  if (state.caravans.length >= caravanSlots(mods)) return { ok: false, reason: 'Toutes les caravanes sont en route' };
  if (!(qty > 0) || qty > caravanCargo(state)) return { ok: false, reason: `Cargaison : 1 à ${caravanCargo(state)}` };
  if (!pay(state, { [r]: qty })) return { ok: false, reason: 'Ressources insuffisantes' };
  const dur = caravanTime(state, town, mods);
  const gold = Math.round(townPrice(state, town, r, mods) * qty);
  state.caravans.push({ id: uid('cv'), x, y, town: town.name, res: r, qty, gold, start: now, end: now + dur * 2, repeat });
  return { ok: true, gold, dur: dur * 2 };
}

export function completeCaravan(state, c, t) {
  state.resources.gold += c.gold;
  const town = poiAt(state.world, c.x, c.y);
  if (town) town.relation = (town.relation || 0) + 1;
  state.stats.trades++;
  state.caravans = state.caravans.filter((x) => x.id !== c.id);
  log(state, 'trade', `🐪 Caravane de retour de ${c.town} : +${fmt(c.gold)} or (${fmt(c.qty)} ${RESOURCES[c.res].name} vendus).`, t);
  if (c.repeat) {
    const r = sendCaravan(state, c.x, c.y, c.res, c.qty, true, t);
    if (!r.ok) log(state, 'info', `🐪 Route commerciale vers ${c.town} suspendue : ${r.reason}.`, t);
  }
}

export function cancelRoute(state, cid) {
  const c = state.caravans.find((x) => x.id === cid);
  if (c) c.repeat = false;
}

// ---------- Marchand mystérieux ----------
export function spawnMerchant(state, now, durationSec) {
  const offers = [];
  for (let i = 0; i < 3; i++) {
    const it = generateItem({ ilvl: 5 + i * 3, boost: 1.2, min: i === 2 ? 'epic' : 'rare' });
    const cost = { gold: 600 + i * 900 };
    if (it.rarity === 'epic') cost.gems = 3;
    if (it.rarity === 'legendary' || it.rarity === 'mythic') { cost.gems = 10; cost.crystals = 5; }
    offers.push({ item: it, cost });
  }
  offers.push({ res: 'rareOre', qty: 10, cost: { gold: 1500 } });
  offers.push({ res: 'crystals', qty: 8, cost: { gold: 1800 } });
  state.merchant = { until: now + durationSec * 1000, offers };
}

export function buyFromMerchant(state, idx, now = Date.now()) {
  const mer = state.merchant;
  if (!mer || mer.until < now) return { ok: false, reason: 'Le marchand est parti' };
  const o = mer.offers[idx];
  if (!o || o.sold) return { ok: false, reason: 'Déjà vendu' };
  if (!pay(state, o.cost)) return { ok: false, reason: 'Ressources insuffisantes' };
  o.sold = true;
  if (o.item) state.inventory.items.push(o.item);
  if (o.res) gain(state, { [o.res]: o.qty }, computeMods(state, now));
  return { ok: true };
}
