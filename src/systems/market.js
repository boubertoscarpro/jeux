import { recordLoss } from './losses.js';
import { RESOURCES, TRADABLE, isCapped } from '../data/resources.js';
import { WORLD_EVENTS } from '../data/events.js';
import { RIVALS } from '../data/world.js';
import { rng } from '../core/rng.js';
import { uid, fmt } from '../core/util.js';
import { levelOf } from './city.js';
import { computeMods } from './modifiers.js';
import { pay, gain, storageCap } from './economy.js';
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

// Marchandises achetées récemment au marché : elles ne comptent pas comme « produites par le royaume »
// pour les contrats et les primes des cités (empêche les boucles achat → revente sans risque)
export const boughtRecent = (state, r) => state.market?.bought?.[r] || 0;

export function sell(state, r, qty, now = Date.now()) {
  qty = Math.floor(qty);
  if (!levelOf(state, 'market')) return { ok: false, reason: 'Marché requis' };
  if (!TRADABLE.includes(r)) return { ok: false, reason: `${RESOURCES[r]?.name || r} ne se vend pas au marché` };
  if (!(qty > 0) || (state.resources[r] || 0) < qty) return { ok: false, reason: 'Quantité invalide' };
  const mods = computeMods(state, now);
  const q = quote(state, r, qty, -1, mods);
  q.total = Math.floor(q.unit * qty);
  state.resources[r] -= qty;
  state.resources.gold += q.total;
  state.market.prices[r] = Math.max(RESOURCES[r].price * 0.25, q.after);
  state.stats.trades++;
  return { ok: true, gold: q.total };
}

export function buy(state, r, qty, now = Date.now()) {
  qty = Math.floor(qty);
  if (!levelOf(state, 'market')) return { ok: false, reason: 'Marché requis' };
  if (!TRADABLE.includes(r)) return { ok: false, reason: `${RESOURCES[r]?.name || r} ne s’achète pas au marché` };
  if (RESOURCES[r].cat === 'rare') return { ok: false, reason: 'Ressource rare : introuvable au marché (expéditions, donjons, marchand ambulant)' };
  if (!(qty > 0)) return { ok: false, reason: 'Quantité invalide' };
  const mods = computeMods(state, now);
  // On n'achète pas ce que l'entrepôt ne peut pas recevoir
  if (isCapped(r)) {
    const room = Math.floor(storageCap(state, mods, r) * 1.5 - (state.resources[r] || 0));
    if (room <= 0) return { ok: false, reason: 'Entrepôt plein pour cette ressource' };
    qty = Math.min(qty, room);
  }
  const q = quote(state, r, qty, 1, mods);
  q.total = Math.ceil(q.unit * qty);
  if (!pay(state, { gold: q.total })) return { ok: false, reason: `Il faut ${fmt(q.total)} or` };
  gain(state, { [r]: qty }, mods);
  const b = (state.market.bought ||= {});
  b[r] = (b[r] || 0) + qty;
  state.market.prices[r] = Math.min(RESOURCES[r].price * 4, q.after);
  state.stats.trades++;
  return { ok: true, gold: q.total, qty };
}

// Évolution des prix (offre/demande simulée + événements)
export function marketTick(state, now) {
  const m = state.market;
  // L'origine « achetée » s'estompe (−25 %/h) ; la saturation des cités retombe (−10 %/h)
  const dtH = Math.max(0, Math.min(12, (now - (m.last || now)) / 3600000));
  if (m.bought) for (const r of Object.keys(m.bought)) { m.bought[r] *= Math.pow(0.75, dtH); if (m.bought[r] < 1) delete m.bought[r]; }
  if (dtH) for (const p of Object.values(state.world.pois)) if (p.sat) for (const r of Object.keys(p.sat)) { p.sat[r] = Math.max(0, p.sat[r] - 0.1 * dtH); if (!p.sat[r]) delete p.sat[r]; }
  for (const r of TRADABLE) {
    const target = RESOURCES[r].price * eventMult(state, r, now);
    let p = m.prices[r];
    p += (target - p) * 0.15; // retour vers l'équilibre
    p *= 1 + rng.float(-0.04, 0.04); // activité des marchands et seigneurs IA
    m.prices[r] = Math.max(RESOURCES[r].price * 0.25, Math.min(RESOURCES[r].price * 4, p));
    m.history[r].push(Math.round(m.prices[r] * 100) / 100);
    if (m.history[r].length > HISTORY) m.history[r].shift();
  }
  m.last = now;
}

// ---------- Caravanes ----------
export const caravanSlots = (mods) => Math.max(0, mods.caravans || 0);
export const caravanCargo = (state) => 800 + levelOf(state, 'market') * 400 + levelOf(state, 'port') * 600;

// Prix payé par une cité : prix de référence (pas le cours du marché, que vos propres achats font monter),
// prime si la cité réclame la marchandise, saturation si vous la livrez trop souvent.
export function townPrice(state, town, r, mods, now = Date.now()) {
  const base = (RESOURCES[r].price || 0) * eventMult(state, r, now);
  const wanted = town.wants?.includes(r) ? 1.5 : 1.12;
  const sat = Math.max(0.5, 1 - (town.sat?.[r] || 0));
  return base * wanted * sat * (1 + (mods['caravan.gain'] || 0) + Math.min(0.2, (town.relation || 0) * 0.01));
}

export function caravanTime(state, town, mods) {
  return (distCap(state.world, town.x, town.y) * 26 * 1000) / (1 + (mods['caravan.speed'] || 0));
}

export const CONVOY_MODES = {
  secure:  { name: 'Sécurisé', icon: '🛡️', desc: 'Lent mais sûr (risque ×0,3, durée ×1,4).', time: 1.4, risk: 0.3, profit: 0.97 },
  fast:    { name: 'Rapide', icon: '💨', desc: 'Durée ×0,7 mais risque ×1,6.', time: 0.7, risk: 1.6, profit: 1 },
  smuggle: { name: 'Clandestin', icon: '🌑', desc: 'Sans taxe : gains ×1,35, risque ×3. Réputation douteuse.', time: 1, risk: 3, profit: 1.35 },
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
  // La part achetée au marché est payée au prix de référence, sans prime
  const fromMarket = Math.min(qty, boughtRecent(state, r));
  if (fromMarket) state.market.bought[r] -= fromMarket;
  const ref = (RESOURCES[r].price || 0) * eventMult(state, r, now);
  const gold = Math.round((townPrice(state, town, r, mods, now) * (qty - fromMarket) + ref * fromMarket) * md.profit * noTax);
  town.sat = town.sat || {};
  town.sat[r] = Math.min(0.5, (town.sat[r] || 0) + qty / (liquidity(r) * 4));
  const risk = convoyRisk(state, town, mode, guards, mods);
  state.stats.caravans = (state.stats.caravans || 0) + 1;
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
      recordLoss(state, 'caravan', { gold: Math.round(gold * lost) }, t);
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

// ---------- Contrats et commissions ----------
// Catégories : commerce, livraison urgente, artisanat, exploration, militaire, diplomatie, guilde.
// Chaque contrat a une difficulté (1 à 3), une échéance, une récompense et un bonus de rapidité (+25 %
// s'il est rempli dans les premiers 40 % du délai). Les objectifs « à accomplir » se mesurent à partir
// de la publication du contrat.
export const CONTRACT_KINDS = {
  trade: { name: 'Commande commerciale', icon: '📦' },
  urgent: { name: 'Livraison urgente', icon: '⏰' },
  craft: { name: 'Commande d’artisanat', icon: '⚒️' },
  explore: { name: 'Mission d’exploration', icon: '🧭' },
  military: { name: 'Contrat militaire', icon: '⚔️' },
  diplomacy: { name: 'Mission diplomatique', icon: '🕊️' },
  guild: { name: 'Objectif de guilde', icon: '🏛️' },
};
const BASIC_GOODS = ['wood', 'stone', 'iron', 'food', 'herbs', 'coal', 'leather', 'cloth'];
const CRAFT_GOODS = ['planks', 'steel', 'weapons', 'bread', 'rations', 'frames'];

function makeContract(state, town, now) {
  const th = levelOf(state, 'townhall');
  const kinds = { trade: 4, urgent: 2, craft: 2, explore: 2, military: 2, diplomacy: (state.factions || []).length ? 1.5 : 0, guild: state.guild ? 1.5 : 0 };
  const kind = rng.weighted(kinds);
  const diff = rng.int(1, 3);
  const c = { id: uid('ct'), kind, diff, town: town.name, tx: town.x, ty: town.y, posted: now, reward: {} };
  const dur = (h) => { c.until = now + h * 3600000; };
  const delivery = (pool, k, hours) => {
    const res = rng.pick(pool);
    const qty = Math.round(((300 + th * 250) * (0.6 + diff * 0.4)) / Math.max(0.6, Math.sqrt(RESOURCES[res].price)) / 10) * 10;
    Object.assign(c, { res, qty, title: `${fmt(qty)} ${RESOURCES[res].name}` });
    c.reward.gold = Math.round(qty * RESOURCES[res].price * rng.float(1.4, 1.9) * k);
    dur(hours);
  };
  if (kind === 'trade') delivery(BASIC_GOODS, 1, rng.int(4, 8));
  if (kind === 'urgent') { delivery(BASIC_GOODS, 1.45, rng.int(1, 2)); c.reward.silver = 2 + diff * 2; }
  if (kind === 'craft') { delivery(CRAFT_GOODS, 1.25, rng.int(6, 10)); if (diff >= 2) c.reward.gems = diff; }
  const goal = (stat, n, title, hours) => { Object.assign(c, { stat, n, base: statValue(state, stat, c), title }); dur(hours); };
  if (kind === 'explore') { goal('explored', 2 + diff * 2, `Explorer ${2 + diff * 2} nouvelles zones`, 10); c.reward = { gold: 250 * diff * (1 + th * 0.3) | 0, crystals: diff * 2 }; c.rep = 'explorer'; }
  if (kind === 'military') { goal('battlesWon', 1 + diff * 2, `Remporter ${1 + diff * 2} batailles`, 10); c.reward = { gold: 300 * diff * (1 + th * 0.3) | 0, iron: 200 * diff }; c.rep = 'warrior'; }
  if (kind === 'diplomacy') {
    const f = rng.pick(state.factions);
    c.faction = f.idx;
    goal('relation', 6 + diff * 4, `Améliorer de ${6 + diff * 4} la relation avec ${RIVALS[f.idx]?.name || 'une faction'}`, 16);
    c.reward = { gold: 280 * diff * (1 + th * 0.3) | 0 }; c.rep = 'diplomat'; c.insignia = 1;
  }
  if (kind === 'guild') { goal('guild', 200 * diff * (1 + th * 0.2) | 0, 'Contribuer à votre guilde (dons, objectifs)', 12); c.reward = { gold: 200 * diff * (1 + th * 0.3) | 0 }; c.insignia = diff; }
  c.title = `${CONTRACT_KINDS[kind].icon} ${CONTRACT_KINDS[kind].name} — ${c.title}`;
  return c;
}

function statValue(state, stat, c) {
  if (stat === 'relation') return (state.factions || []).find((f) => f.idx === c.faction)?.relation || 0;
  if (stat === 'guild') return state.guild?.contributed || 0;
  return state.stats[stat] || 0;
}

export function contractProgress(state, c) {
  if (c.res) { const have = state.resources[c.res] || 0; return { cur: Math.min(have, c.qty), max: c.qty, done: have >= c.qty }; }
  const v = statValue(state, c.stat, c) - (c.base || 0);
  return { cur: Math.max(0, Math.min(v, c.n)), max: c.n, done: v >= c.n };
}

export function contractsTick(state, now) {
  state.contracts = (state.contracts || []).filter((c) => c.until > now);
  const towns = Object.values(state.world.pois).filter((p) => p.type === 'town' && state.world.revealed[p.y * state.world.size + p.x]);
  if (!towns.length || !levelOf(state, 'market')) return;
  if (state.contracts.length >= 4 || (state.nextContract || 0) > now) return;
  state.nextContract = now + 25 * 60000;
  state.contracts.push(makeContract(state, rng.pick(towns), now));
}

export function fulfillContract(state, id, now = Date.now()) {
  const c = (state.contracts || []).find((x) => x.id === id);
  if (!c || c.until <= now) return { ok: false, reason: 'Contrat expiré' };
  if (c.res) {
    const own = (state.resources[c.res] || 0) - boughtRecent(state, c.res);
    if ((state.resources[c.res] || 0) >= c.qty && own < c.qty) return { ok: false, reason: `La cité exige des marchandises produites par votre royaume (${fmt(Math.max(0, own))} sur ${fmt(c.qty)} ; le reste a été acheté au marché récemment)` };
    if (!pay(state, { [c.res]: c.qty })) return { ok: false, reason: `Il faut ${fmt(c.qty)} ${RESOURCES[c.res].name}` };
  } else {
    const p = contractProgress(state, c);
    if (!p.done) return { ok: false, reason: `Objectif non atteint (${fmt(p.cur)}/${fmt(p.max)})` };
  }
  const fast = c.posted && now - c.posted <= (c.until - c.posted) * 0.4;
  const mods = computeMods(state, now);
  const k = (fast ? 1.25 : 1) * (1 + (mods['contract.reward'] || 0)); // contract.reward : spécialisation
  const reward = Object.fromEntries(Object.entries(c.reward).map(([r, v]) => [r, Math.round(v * k)]));
  gain(state, reward, mods);
  if (c.insignia) state.meta.insignia = (state.meta.insignia || 0) + c.insignia;
  state.contracts = state.contracts.filter((x) => x.id !== id);
  const town = poiAt(state.world, c.tx, c.ty);
  if (town) town.relation = (town.relation || 0) + 3;
  bumpRep(state, c.rep || 'merchant', 6);
  state.stats.contracts = (state.stats.contracts || 0) + 1;
  if (state.stats.contracts === 25) grantArtifact(state, 'merchantCrown', now, 'Contrats');
  return { ok: true, reward, fast };
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
