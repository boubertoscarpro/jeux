// Raids en série : une même cible tenue par des PNJ (camp de bandits, repaire, crypte, ruines…) attaquée
// automatiquement plusieurs fois d'affilée, de 2 à 10 attaques. Chaque attaque est une vraie marche : mêmes règles,
// emplacement de marche, combat, pertes et butin qu'une attaque lancée à la main. Entre deux attaques, les troupes
// rentrent au château, se reposent, puis repartent dès que le camp s'est reformé (délai de réapparition du lieu).
// Garde-fous pour que ce ne soit pas abusif :
//   - coût d'organisation payé d'avance (intendance, éclaireurs, officiers) ; 80 % de la part non utilisée rendus ;
//   - repos obligatoire entre deux attaques, et attente de la réapparition du camp (souvent 1 à 2 h) ;
//   - butin décroissant : la région s'appauvrit à chaque raid (−6 % par attaque déjà menée, jamais moins de 50 %) ;
//   - arrêt automatique à la première défaite, si une attaque coûte plus de la moitié des soldats, ou si la cible
//     disparaît ; durée maximale de 36 h ;
//   - un seul ordre à la fois (deux à l'hôtel de ville 12, trois au 20), à partir de l'hôtel de ville 5.
// Tout progresse aussi hors ligne : l'ordre est traité à chaque pas du monde (une minute).
import { POI_TYPES } from '../data/world.js';
import { RESOURCES } from '../data/resources.js';
import { UNITS } from '../data/units.js';
import { uid, fmt, addInto } from '../core/util.js';
import { thLevel } from './city.js';
import { pay, canAfford, gain } from './economy.js';
import { computeMods } from './modifiers.js';
import { poiAt } from './world.js';
import { planMarch, sendMarch, breadNeeded } from './marches.js';
import { autoFillAttack, previewAttack } from './autofill.js';
import { log } from './log.js';

const MIN = 60000, H = 3600000;
export const RAID = {
  minTh: 5, minAttacks: 2, maxAttacks: 10, restMin: 15, retryMin: 10, maxHours: 36,
  lootDecay: 0.06, lootFloor: 0.5, stopLoss: 0.5, refund: 0.8, costPerTh: { gold: 25, food: 35 },
};
export const RAID_COUNTS = [3, 5, 10];
export const maxRaidOrders = (th) => (th < RAID.minTh ? 0 : th < 12 ? 1 : th < 20 ? 2 : 3);
export const raidLootMult = (done) => Math.max(RAID.lootFloor, 1 - RAID.lootDecay * done);
const resText = (c) => Object.entries(c).map(([r, v]) => `${fmt(v)} ${RESOURCES[r]?.icon || r}`).join(' ');
const count = (u) => Object.values(u || {}).reduce((a, b) => a + b, 0);

export function raidState(state) {
  const R = state.raidOrders && typeof state.raidOrders === 'object' && !Array.isArray(state.raidOrders) ? state.raidOrders : (state.raidOrders = {});
  if (!Array.isArray(R.active)) R.active = [];
  if (!Array.isArray(R.history)) R.history = [];
  if (!Array.isArray(R.returns)) R.returns = [];
  return R;
}

// Lieux éligibles : tenus par des PNJ, hors donjons (parcours salle par salle), royaumes rivaux et Brèche
export function raidTargetOk(poi) {
  const def = poi && POI_TYPES[poi.type];
  return !!def && def.kind === 'danger' && !def.dungeon && !def.becomes;
}

// Butin attendu d'une attaque (pour que le remplissage auto emporte de quoi le rapporter)
export function raidExpectedLoot(poi, done = 0) {
  const def = POI_TYPES[poi.type];
  const k = (1 + (poi.danger || 0) * 0.45) * raidLootMult(done) * 1.15;
  return Object.values(def.loot || {}).reduce((a, v) => a + v * k, 0);
}

export function raidCost(state, n) {
  const th = Math.max(1, thLevel(state));
  return Object.fromEntries(Object.entries(RAID.costPerTh).map(([r, v]) => [r, v * th * n]));
}

// Durée estimée d'un cycle : aller-retour + repos, ou réapparition du camp + aller si elle est plus longue
export function raidCycle(state, opts, now = Date.now()) {
  const poi = poiAt(state.world, opts.x, opts.y);
  const plan = planMarch(state, { ...opts, type: 'attack' }, now);
  const travel = plan.travel || 0;
  const respawn = ((POI_TYPES[poi?.type]?.respawn) || 3600) * 1000;
  return Math.max(2 * travel + RAID.restMin * MIN, travel + respawn + MIN);
}

export function raidStatus(state, opts, now = Date.now()) {
  const th = thLevel(state);
  const n = Math.floor(opts.count || 0);
  const poi = poiAt(state.world, opts.x, opts.y);
  const cost = raidCost(state, n);
  let reason = null;
  if (th < RAID.minTh) reason = `Hôtel de ville niveau ${RAID.minTh} requis pour les raids en série`;
  else if (raidState(state).active.length >= maxRaidOrders(th)) reason = `Déjà ${maxRaidOrders(th)} raid(s) en série en cours (un de plus aux hôtels de ville 12 et 20)`;
  else if (!raidTargetOk(poi)) reason = 'Les raids en série visent un lieu tenu par des PNJ (camp, repaire, crypte, ruines…), hors donjons et sites à reconquérir';
  else if (n < RAID.minAttacks || n > RAID.maxAttacks) reason = `Entre ${RAID.minAttacks} et ${RAID.maxAttacks} attaques`;
  else if (!opts.auto && !count(opts.units)) reason = 'Choisissez les troupes de chaque attaque (ou le recalcul automatique)';
  else if (!canAfford(state, cost)) reason = `Organisation trop coûteuse : ${resText(cost)}`;
  else if (!opts.auto) {
    const plan = planMarch(state, { ...opts, type: 'attack' }, now);
    if (!plan.ok && !/déjà nettoyé/.test(plan.reason)) reason = plan.reason;
  }
  return { ok: !reason, reason, cost, n };
}

export function startRaidOrder(state, opts, now = Date.now()) {
  const st = raidStatus(state, opts, now);
  if (!st.ok) return st;
  if (!pay(state, st.cost)) return { ok: false, reason: 'Ressources insuffisantes' };
  const poi = poiAt(state.world, opts.x, opts.y);
  const o = {
    id: uid('ro'), x: opts.x, y: opts.y, type: poi.type, name: poi.name || POI_TYPES[poi.type].name,
    total: st.n, done: 0, wins: 0, lost: 0, loot: {}, auto: !!opts.auto,
    units: Object.fromEntries(Object.entries(opts.units || {}).filter(([, v]) => v > 0).map(([u, v]) => [u, Math.floor(v)])),
    heroId: opts.heroId || null, formation: opts.formation || 'balanced', supply: !!opts.supply,
    cost: st.cost, start: now, until: now + RAID.maxHours * H, status: 'waiting', nextAt: now, marchId: null, note: '',
  };
  raidState(state).active.push(o);
  launch(state, o, now);
  log(state, 'info', `🔁 Raids en série sur ${o.name} : ${o.total} attaques prévues.`, now);
  return { ok: true, order: o };
}

const wait = (o, at, note) => { o.status = 'waiting'; o.nextAt = at; o.note = note; };

function launch(state, o, t) {
  const poi = poiAt(state.world, o.x, o.y);
  if (!poi || poi.type !== o.type) return finish(state, o, 'gone', t);
  if (poi.clearedUntil > t) return wait(o, poi.clearedUntil + MIN, 'Le camp se reforme');
  const md = { type: 'attack', x: o.x, y: o.y, formation: o.formation };
  let units;
  if (o.auto) {
    const r = autoFillAttack(state, { ...md, units: {} }, t, { carry: raidExpectedLoot(poi, o.done) });
    if (!r.ok) return wait(o, t + RAID.retryMin * MIN, r.reason);
    units = r.units;
  } else {
    units = {};
    for (const [u, v] of Object.entries(o.units)) { const k = Math.min(v, state.army[u] || 0); if (k > 0) units[u] = k; }
    if (count(units) < count(o.units) * 0.5) return wait(o, t + RAID.retryMin * MIN, 'Moins de la moitié des troupes prévues est au château');
    const pv = poi.scouted ? previewAttack(state, md, units, t) : null;
    if (pv && pv.winner !== 'attacker') return wait(o, t + RAID.retryMin * MIN, 'L’estimation prévoit une défaite avec les troupes présentes');
  }
  const hero = o.heroId && state.heroes.find((h) => h.id === o.heroId && !h.marchId && !h.assignment);
  const supply = o.supply && (state.resources.bread || 0) >= breadNeeded(units);
  const r = sendMarch(state, { ...md, units, heroId: hero ? hero.id : null, supply }, t);
  if (!r.ok) return wait(o, t + RAID.retryMin * MIN, r.reason);
  r.march.orderId = o.id;
  r.march.lootMult = raidLootMult(o.done);
  r.march.orderSent = { ...r.march.units };
  o.marchId = r.march.id; o.status = 'marching'; o.nextAt = null; o.note = '';
}

function onReturn(state, o, ret) {
  o.marchId = null;
  const t = ret.t;
  if (ret.result === undefined) return finish(state, o, 'recalled', t);
  if (ret.result === 'skip') return wait(o, t + RAID.restMin * MIN, 'Cible déjà nettoyée à l’arrivée');
  o.done++;
  addInto(o.loot, Object.fromEntries(Object.entries(ret.loot || {}).map(([r, v]) => [r, Math.round(v)])));
  const sent = count(ret.sent), lost = Math.max(0, sent - count(ret.units));
  o.lost += lost;
  if (ret.result === 'win') o.wins++;
  if (ret.wiped) return finish(state, o, 'wiped', t);
  if (ret.result !== 'win') return finish(state, o, 'defeat', t);
  if (sent && lost / sent > RAID.stopLoss) return finish(state, o, 'losses', t);
  if (o.done >= o.total) return finish(state, o, 'complete', t);
  if (t >= o.until) return finish(state, o, 'expired', t);
  wait(o, t + RAID.restMin * MIN, 'Repos des troupes');
}

export const RAID_ENDS = {
  complete: 'toutes les attaques ont été menées', defeat: 'arrêt après une défaite', wiped: 'troupes anéanties',
  losses: 'arrêt : pertes trop lourdes (plus de la moitié des soldats engagés)', gone: 'la cible a disparu',
  expired: `durée maximale atteinte (${RAID.maxHours} h)`, recalled: 'troupes rappelées', cancelled: 'ordre annulé',
};

function finish(state, o, why, t) {
  const R = raidState(state);
  R.active = R.active.filter((x) => x.id !== o.id);
  const left = Math.max(0, o.total - o.done);
  let refund = {};
  if (left && why !== 'complete') {
    refund = Object.fromEntries(Object.entries(o.cost).map(([r, v]) => [r, Math.floor((v * left / o.total) * RAID.refund)]).filter(([, v]) => v > 0));
    if (Object.keys(refund).length) gain(state, refund, computeMods(state, t));
  }
  o.status = 'done'; o.end = t; o.why = why; o.refund = refund; o.nextAt = null;
  R.history.unshift(o);
  R.history.length = Math.min(R.history.length, 10);
  log(state, why === 'complete' ? 'good' : 'info', `🔁 Raids en série sur ${o.name} terminés (${RAID_ENDS[why]}) : ${o.wins}/${o.done} victoire(s), ${fmt(count(o.loot))} ressources rapportées, ${fmt(o.lost)} soldat(s) perdu(s).${Object.keys(refund).length ? ` Intendance non utilisée rendue : ${resText(refund)}.` : ''}`, t);
}

export function cancelRaidOrder(state, id, now = Date.now()) {
  const o = raidState(state).active.find((x) => x.id === id);
  if (!o) return { ok: false, reason: 'Ordre introuvable' };
  // Une attaque déjà en route va au bout et rentre normalement, hors du bilan de l'ordre
  const m = o.marchId && state.marches.find((x) => x.id === o.marchId);
  if (m) { m.orderId = null; }
  finish(state, o, 'cancelled', now);
  return { ok: true };
}

export function raidTick(state, now = Date.now()) {
  if (!state.raidOrders) return;
  const R = raidState(state);
  const rets = R.returns.sort((a, b) => a.t - b.t);
  R.returns = [];
  for (const ret of rets) { const o = R.active.find((x) => x.id === ret.orderId); if (o) onReturn(state, o, ret); }
  for (const o of [...R.active]) {
    // Marche perdue (sauvegarde ancienne, rappel non enregistré) : l'ordre reprend au lieu de rester bloqué
    if (o.status === 'marching' && !state.marches.some((m) => m.id === o.marchId)) wait(o, now, '');
    if (o.status !== 'waiting') continue;
    if (now >= o.until) { finish(state, o, 'expired', now); continue; }
    if (now >= o.nextAt) launch(state, o, now);
  }
}

export { resText as raidResText };
export const raidUnitsText = (u) => Object.entries(u).map(([k, v]) => `${UNITS[k]?.icon || ''} ${v}`).join(' ');
