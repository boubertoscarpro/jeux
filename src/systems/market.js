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
import { UNITS } from '../data/units.js';
import { simulateBattle } from './combat.js';
import { bumpRep, recordMax } from './reputation.js';
import { grantArtifact } from './collection.js';
import { livingMarket } from './living.js';

const HISTORY = 48;

export function initMarket(now = Date.now()) {
  const prices = {}, history = {};
  for (const r of TRADABLE) { prices[r] = RESOURCES[r].price; history[r] = [RESOURCES[r].price]; }
  return { prices, history, last: now };
}

const liquidity = (r) => 6000 / Math.sqrt(RESOURCES[r].price);
export const marketFee = (mods) => Math.max(0.01, 0.12 + (mods['market.fee'] || 0));

function eventMult(state, r, now) {
  let k = 1;
  for (const e of state.events) if (e.end > now) k *= WORLD_EVENTS[e.key]?.market?.[r] || 1;
  return k * livingMarket(state, r, now);
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

export const CONVOY_MODES = {
  secure:  { name: 'Sécurisé', icon: '🛡️', desc: 'Lent mais sûr (risque ×0,3, durée ×1,4).', time: 1.4, risk: 0.3, profit: 0.97 },
  fast:    { name: 'Rapide', icon: '💨', desc: 'Durée ×0,7 mais risque ×1,6.', time: 0.7, risk: 1.6, profit: 1 },
  smuggle: { name: 'Clandestin', icon: '🌑', desc: 'Sans taxe : gains ×1,6, risque ×3. Réputation douteuse.', time: 1, risk: 3, profit: 1.6 },
};

// Risque d'attaque d'un convoi (0..0,95)
export function convoyRisk(state, town, mode, guards, mods) {
  const d = distCap(state.world, town.x, town.y);
  let risk = 0.03 + d * 0.004;
  risk += (state.factions || []).filter((f) => f.stance === 'war').length * 0.04;
  const c = state.catastrophe;
  if (c && c.until > Date.now() && c.key === 'tempest') risk += 0.15;
  risk *= CONVOY_MODES[mode].risk * Math.max(0.2, 1 + (mods['convoy.risk'] || 0));
  let gp = 0;
  for (const [u, n] of Object.entries(guards || {})) if (UNITS[u]) gp += n * (UNITS[u].atk + UNITS[u].def);
  risk /= 1 + gp / 400;
  return Math.max(0.01, Math.min(0.95, risk));
}

export function tradeBlocked(state, town) {
  const rep = state.reputation || {};
  if ((rep.tyrant || 0) > 300 && (rep.tyrant || 0) > (rep.benefactor || 0) && !town.vassal) return `${town.name} refuse de commercer avec un tyran`;
  if ((town.relation || 0) < -15) return `${town.name} vous ferme ses portes (relation ${town.relation})`;
  return null;
}

export function sendCaravan(state, x, y, r, qty, repeat = false, now = Date.now(), mode = 'secure', guards = {}) {
  const mods = computeMods(state, now);
  const town = poiAt(state.world, x, y);
  qty = Math.floor(qty);
  if (!town || town.type !== 'town') return { ok: false, reason: 'Pas de cité ici' };
  if (!levelOf(state, 'market')) return { ok: false, reason: 'Marché requis' };
  const blocked = tradeBlocked(state, town);
  if (blocked) return { ok: false, reason: blocked };
  if (state.caravans.length >= caravanSlots(mods)) return { ok: false, reason: 'Toutes les caravanes sont en route' };
  if (!(qty > 0) || qty > caravanCargo(state)) return { ok: false, reason: `Cargaison : 1 à ${caravanCargo(state)}` };
  if (!CONVOY_MODES[mode]) mode = 'secure';
  guards = Object.fromEntries(Object.entries(guards || {}).filter(([, n]) => n > 0).map(([u, n]) => [u, Math.floor(n)]));
  for (const [u, n] of Object.entries(guards)) if ((state.army[u] || 0) < n) return { ok: false, reason: `Pas assez de ${UNITS[u].name}` };
  if (!pay(state, { [r]: qty })) return { ok: false, reason: 'Ressources insuffisantes' };
  for (const [u, n] of Object.entries(guards)) state.army[u] -= n;
  const md = CONVOY_MODES[mode];
  const dur = caravanTime(state, town, mods) * md.time;
  const noTax = mode === 'smuggle' ? 1 / (1 - marketFee(mods)) : 1;
  const gold = Math.round(townPrice(state, town, r, mods) * qty * md.profit * noTax);
  const risk = convoyRisk(state, town, mode, guards, mods);
  state.caravans.push({ id: uid('cv'), x, y, town: town.name, res: r, qty, gold, start: now, end: now + dur * 2, repeat, mode, guards, risk });
  return { ok: true, gold, dur: dur * 2, risk };
}

export function completeCaravan(state, c, t) {
  state.caravans = state.caravans.filter((x) => x.id !== c.id);
  const route = ((state.routes ||= {})[`${c.x},${c.y}`] ||= { town: c.town, trips: 0, profit: 0, attacks: 0, hours: 0 });
  route.trips++; route.hours += (c.end - c.start) / 3600000;
  let gold = c.gold;
  let note = '';
  if (rng.chance(c.risk ?? 0.05)) {
    route.attacks++;
    const k = 1 + (state.stats.trades || 0) / 200;
    const bandits = { bandit: Math.round(6 * k), banditRider: Math.round(3 * k), banditArcher: Math.round(3 * k) };
    const guards = c.guards || {};
    let win = false;
    if (Object.keys(guards).length) {
      const res = simulateBattle({ units: guards, mods: computeMods(state, t), formation: 'shieldwall', label: 'Escorte' }, { units: bandits, mods: {} }, { terrain: 'plain', weather: state.weather.type });
      c.guards = Object.fromEntries(Object.entries(res.attRemaining).filter(([, n]) => n > 0));
      win = res.winner === 'attacker';
    }
    if (win) note = ' Des bandits ont attaqué, mais l’escorte les a repoussés !';
    else {
      const lost = c.mode === 'smuggle' ? 1 : rng.float(0.4, 0.8);
      gold = Math.round(gold * (1 - lost));
      note = ` ⚠️ La caravane a été attaquée : ${Math.round(lost * 100)}% de la recette perdue.`;
      state.stats.caravansAttacked = (state.stats.caravansAttacked || 0) + 1;
      if (c.mode === 'smuggle') { bumpRep(state, 'tyrant', 4); bumpRep(state, 'merchant', -6); }
    }
  }
  for (const [u, n] of Object.entries(c.guards || {})) state.army[u] = (state.army[u] || 0) + n;
  state.resources.gold += gold;
  route.profit += gold;
  const town = poiAt(state.world, c.x, c.y);
  if (town) town.relation = (town.relation || 0) + 1;
  state.stats.trades++;
  bumpRep(state, 'merchant', c.mode === 'smuggle' ? 0 : 1);
  recordMax(state, 'bestCaravan', gold, `${c.town} (${gold} or)`, t);
  log(state, note.includes('⚠️') ? 'bad' : 'trade', `🐪 Caravane de retour de ${c.town} : +${fmt(gold)} or (${fmt(c.qty)} ${RESOURCES[c.res].name}).${note}`, t);
  if (c.repeat) {
    const r = sendCaravan(state, c.x, c.y, c.res, c.qty, true, t, c.mode, c.guards);
    if (!r.ok) log(state, 'info', `🐪 Route commerciale vers ${c.town} suspendue : ${r.reason}.`, t);
  }
}

// ---------- Contrats des cités (livraisons à échéance) ----------
export function contractsTick(state, now) {
  state.contracts = (state.contracts || []).filter((c) => c.until > now);
  const towns = Object.values(state.world.pois).filter((p) => p.type === 'town' && state.world.revealed[p.y * state.world.size + p.x]);
  if (!towns.length || !levelOf(state, 'market')) return;
  if (state.contracts.length >= 3 || (state.nextContract || 0) > now) return;
  state.nextContract = now + 25 * 60000;
  {
    const town = rng.pick(towns);
    const res = rng.pick(['wood', 'stone', 'iron', 'food', 'leather', 'cloth', 'steel', 'planks', 'bread', 'herbs', 'weapons', 'rations', 'coal']);
    const th = levelOf(state, 'townhall');
    const qty = Math.round((300 + th * 250) / Math.max(0.6, Math.sqrt(RESOURCES[res].price)) / 10) * 10;
    const reward = { gold: Math.round(qty * RESOURCES[res].price * rng.float(1.8, 2.6)) };
    if (rng.chance(0.25)) reward.silver = rng.int(2, 6);
    if (rng.chance(0.08)) reward.gems = rng.int(1, 3);
    state.contracts.push({ id: uid('ct'), town: town.name, tx: town.x, ty: town.y, res, qty, reward, until: now + rng.int(3, 8) * 3600000 });
  }
}

export function fulfillContract(state, id, now = Date.now()) {
  const c = (state.contracts || []).find((x) => x.id === id);
  if (!c) return { ok: false, reason: 'Contrat expiré' };
  if (!pay(state, { [c.res]: c.qty })) return { ok: false, reason: `Il faut ${fmt(c.qty)} ${RESOURCES[c.res].name}` };
  gain(state, c.reward, computeMods(state, now));
  state.contracts = state.contracts.filter((x) => x.id !== id);
  const town = poiAt(state.world, c.tx, c.ty);
  if (town) town.relation = (town.relation || 0) + 3;
  bumpRep(state, 'merchant', 6);
  state.stats.contracts = (state.stats.contracts || 0) + 1;
  if (state.stats.contracts === 25) grantArtifact(state, 'merchantCrown', now, 'Contrats');
  return { ok: true, reward: c.reward };
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
