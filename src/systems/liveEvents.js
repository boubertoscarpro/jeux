// Moteur générique des événements temporaires : calendrier, rotation, cartes, marches,
// monnaies, boutiques, objectifs, passe, classement, guilde, boss, surprises et notifications.
// Toutes les règles propres à un événement viennent de data/liveEvents.js.
import { AFTERMATH, AFTERMATH_MIN_EARNED } from '../data/aftermath.js';
import { LIVE_EVENTS, SURPRISE_EVENTS, FAIR_OFFERS, MYSTERY_POOL, RIDDLES, rewardsPass, LB_REWARDS, EVENT_STANCES, DAILY_TEMPLATES } from '../data/liveEvents.js';
import { LIVE_CONFIG } from '../data/liveConfig.js';
import { ALL_UNITS, UNITS } from '../data/units.js';
import { RESOURCES, isCapped } from '../data/resources.js';
import { COSMETICS } from '../data/social.js';
import { UNIQUE_ITEMS } from '../data/items.js';
import { SPECIAL_HEROES } from '../data/shards.js';
import { mulberry32, rng } from '../core/rng.js';
import { uid, fmt, fmtTime } from '../core/util.js';
import { deepMerge } from './config.js';
import { computeMods } from './modifiers.js';
import { gain, pay, canAfford, storageCap } from './economy.js';
import { thLevel } from './city.js';
import { simulateBattle, previewBattle } from './combat.js';
import { marchMods, EVENT_MARCH } from './marches.js';
import { giveXp } from './heroes.js';
import { generateItem, createUniqueItem } from './items.js';
import { grantSpeedups } from './speedups.js';
import { bumpRep } from './reputation.js';
import { shardState, addShards, rollShards, createSpecialHero, dayKey } from './shards.js';
import { spawnBoss } from './events.js';
import { findFreeTile, spawnPoi, reveal, key, poiAt, wTerrain } from './world.js';
import { placeTarget, revealAt, eventBases, nearestBase, baseByKey, eventTravelMs, tileOk, hash32, EVENT_VISIBLE_MAX } from './eventWorld.js';
import { chronicle } from './chronicle.js';
import { log, toast } from './log.js';
import { recordLoss } from './losses.js';
import { flankShare } from './castle.js';

const H = 3600000;
const MIN = 60000;
const DAY = 86400000;

export const liveCfg = (state) => deepMerge(LIVE_CONFIG, state?.admin?.events);
export const eventDef = (key) => LIVE_EVENTS[key];

// ───────────────────────── État ─────────────────────────
export function liveState(state) {
  return (state.live ||= { calendar: [], history: [], occ: {}, current: null, reports: [], surprises: [], nextSurprise: 0, nextFair: 0, unseenReport: null, totals: {} });
}
export function notifications(state) { return (state.notifications ||= []); }

export function notify(state, icon, text, now = Date.now(), kind = 'event') {
  const list = notifications(state);
  list.unshift({ id: uid('n'), t: now, icon, text, kind, read: false });
  if (list.length > 40) list.length = 40;
  toast(`${icon} ${text}`, kind === 'bad' ? 'bad' : 'event');
}

// ───────────────────────── Calendrier & rotation ─────────────────────────
// Choisit le prochain événement : tirage pondéré, sans répéter les N derniers,
// sans enchaîner deux événements partageant un thème (tags) ou déclarés incompatibles.
export function pickNext(state, recent) {
  const c = liveCfg(state);
  const prev = recent[recent.length - 1];
  const prevDef = prev && LIVE_EVENTS[prev];
  const banned = new Set(recent.slice(-c.memory));
  const incompatible = (a, b) => c.incompatible.some(([x, y]) => (x === a && y === b) || (x === b && y === a));
  const pool = {};
  for (const [k, d] of Object.entries(LIVE_EVENTS)) {
    if (c.disabled.includes(k) || banned.has(k)) continue;
    if (prevDef && (d.tags.some((t) => prevDef.tags.includes(t)) || incompatible(prev, k))) continue;
    pool[k] = c.weights[k] ?? d.weight;
  }
  const keys = Object.keys(pool).filter((k) => pool[k] > 0);
  if (!keys.length) {
    // Repli : n'importe quel événement actif différent du précédent
    const any = Object.keys(LIVE_EVENTS).filter((k) => k !== prev && !c.disabled.includes(k));
    return any.length ? rng.pick(any) : prev;
  }
  return rng.weighted(Object.fromEntries(keys.map((k) => [k, pool[k]])));
}

export function ensureCalendar(state, now = Date.now()) {
  const L = liveState(state);
  const c = liveCfg(state);
  if (!L.calendar.length && !L.current) L.calendar.push(mkSlot(state, pickNext(state, L.history), now));
  let guard = 0;
  while (L.calendar.length < 4 && guard++ < 10) {
    const last = L.calendar[L.calendar.length - 1] || L.current;
    const recent = [...L.history, ...(L.current ? [L.current.key] : []), ...L.calendar.map((s) => s.key)];
    L.calendar.push(mkSlot(state, pickNext(state, recent), (last?.end || now) + c.gapHours * H));
  }
  if (!L.nextFair) L.nextFair = (state.meta.created || now) + 5 * DAY;
  return L.calendar;
}
function mkSlot(state, key, start) {
  const dur = (LIVE_EVENTS[key].duration || 72) * liveCfg(state).durationMult * H;
  return { key, start, end: start + dur };
}

// ───────────────────────── Démarrage d'un événement ─────────────────────────
const thScale = (state) => 0.6 + thLevel(state) * 0.2;
const CAMP_TYPES = ['camp', 'port', 'vault', 'crypt', 'pack', 'zone'];
const FAR = ['fortress', 'boss', 'lair', 'bastion'];
const RESPAWNING = ['camp', 'port', 'vault', 'crypt', 'pack', 'zone', 'caravan', 'ship', 'treasure', 'village'];

export function startEvent(state, key, now = Date.now(), end = null) {
  const L = liveState(state);
  const def = LIVE_EVENTS[key];
  const c = liveCfg(state);
  const occ = (L.occ[key] = (L.occ[key] || 0) + 1);
  const seed = Math.floor(rng.random() * 1e9);
  const cur = {
    key, start: now, end: end || now + (def.duration || 72) * c.durationMult * H, occ, seed,
    wallet: 0, earned: 0, autoEarned: {}, stats: {}, claimed: {}, passClaimed: {}, guildClaimed: false, coopClaimed: {},
    map: null, bossIdx: 0, bossHp: 0, bossShown: false,
    shop: buildShop(state, def, occ, seed), mystery: null, lbSeed: seed ^ 0x5eed, best: null, notified: {},
    warmth: 0, fires: false, nextWave: def.special?.waves ? now + (def.special.every || 6) * H : 0, wavesWeak: 0,
    nextAssault: def.special?.siege ? now + (def.special.every || 4) * H : 0, citadel: def.special?.siege ? 100 : 0,
    coop: def.coop ? { hp: Math.round(def.coop.hp * c.bossHpMult), maxHp: Math.round(def.coop.hp * c.bossHpMult), mine: 0 } : null,
    trackStep: 0, lavaAt: now, nextHour: now + H, riddleUsed: [], lastTick: now,
  };
  if (def.bosses?.length) cur.bossHp = Math.round(def.bosses[0].tiers[0].hp * c.bossHpMult);
  L.current = cur;
  cur.map = placeEventWorld(state, cur, def, now);
  notify(state, def.icon, `L’événement « ${def.name} » commence ! Durée : ${fmtTime(cur.end - now)}.`, now);
  log(state, 'event', `${def.icon} ${def.name} : ${def.story}`, now);
  rollMystery(state, now);
  return cur;
}

// v25 : les cibles sont posées sur la carte du monde (systems/eventWorld.js), plus de carte à part.
// map : { targets, lava (cases du monde), frost (front de neige), volcano, burnt (cases brûlées), threats (menaces
// visibles : harcèlement, hordes, assauts, prospecteurs rivaux), spawnN (tirages), respawns (réapparitions par type) }
function placeEventWorld(state, cur, def, now) {
  const map = { targets: [], lava: [], burnt: [], threats: [], frost: null, volcano: null, spawnN: 0, respawns: {} };
  cur.map = map;
  const W = def.world || {};
  const r = mulberry32(hash32(cur.seed, 'world'));
  const c = state.world.capital;
  // Repères géographiques propres à l'événement (une région à 10-20 cases de la capitale)
  const region = (allow) => { for (let k = 0; k < 200; k++) { const a = r() * Math.PI * 2, d = 10 + r() * 10; const x = Math.round(c.x + Math.cos(a) * d), y = Math.round(c.y + Math.sin(a) * d); if (x > 3 && y > 3 && x < state.world.size - 4 && y < state.world.size - 4 && (!allow || allow.includes(wTerrain(state.world, x, y)))) return { x, y }; } return { x: c.x + 12, y: c.y }; };
  if (W.frost) { const p = region(); map.frost = { x: p.x, y: p.y, r: 3, max: 11 }; }
  if (W.volcano) { const p = region(['mountain', 'hills']) ; map.volcano = { x: p.x, y: p.y }; shuffleLava(state, map); }
  for (const spec of W.targets || []) for (let i = 0; i < spec.count; i++) addTarget(state, def, cur, spec.type, spec.tiers, { idx: i });
  if (W.nomads) { const camps = map.targets.filter((t) => t.type === 'camp'); camps.forEach((t, i) => { if (i % Math.round(1 / W.nomads) === 0) { t.nomad = true; t.moveAt = now + (3 + (i % 3)) * H; } }); }
  if (W.hordes) cur.nextWave = cur.nextWave || now + (def.special?.every || 6) * H;
  return map;
}

// Options de placement d'une cible selon l'événement (rivières, neige, frontières, volcan, routes, brouillard)
function placeOpts(state, def, cur, type) {
  const W = def.world || {}, map = cur.map, w = state.world;
  const o = {};
  const near = (ter, rad = 1) => (x, y) => { for (let dy = -rad; dy <= rad; dy++) for (let dx = -rad; dx <= rad; dx++) if (wTerrain(w, x + dx, y + dy) === ter) return true; return false; };
  if (W.riverside?.includes(type)) { if (type === 'ship') o.allow = ['river']; else o.need = near('river'); }
  if (W.underFog?.includes(type)) o.hidden = true;
  if (W.veinTerrain && type === 'vein') { o.allow = ['hills', 'mountain', 'plain', 'forest']; o.need = (x, y) => ['hills', 'mountain'].includes(wTerrain(w, x, y)) || near('river')(x, y); }
  if (map.frost && ['camp', 'pack', 'hearth', 'fortress', 'boss'].includes(type)) { o.center = map.frost; o.ring = [0, map.frost.max]; o.allow = ['plain', 'forest', 'hills', 'snow', 'swamp', 'ruins', 'ash', 'mountain']; }
  if (map.volcano && ['vent', 'boss'].includes(type)) { o.center = map.volcano; o.ring = type === 'boss' ? [1, 3] : [2, 6]; o.allow = ['plain', 'forest', 'hills', 'mountain', 'ash', 'snow', 'swamp', 'ruins']; }
  if (W.borders && type === 'zone') { const b = borderPoint(state, cur); if (b) { o.center = b; o.ring = [0, 4]; } }
  if (W.routes && (type === 'caravan' || type === 'camp')) { const rt = cityRoute(state, cur); if (rt) { if (type === 'caravan') { o.center = rt.a; o.ring = [0, 2]; o.route = rt; } else { const f = 0.25 + ((map.spawnN * 37) % 50) / 100; o.center = { x: Math.round(rt.a.x + (rt.b.x - rt.a.x) * f), y: Math.round(rt.a.y + (rt.b.y - rt.a.y) * f) }; o.ring = [1, 4]; } } }
  if (W.assaultDir && type === 'bastion') { o.center = w.capital; o.ring = [3, 5]; }
  return o;
}

// Point de frontière disputé (Guerre des Royaumes) : entre mes terres et un royaume rival, pondéré par la rancune
function borderPoint(state, cur) {
  const ks = Object.values(state.world.pois).filter((p) => p.type === 'kingdom');
  if (!ks.length) return null;
  const mine = eventBases(state);
  const r = mulberry32(hash32(cur.seed, 'border', cur.map.spawnN));
  const weight = (p) => { const f = state.factions?.[p.rival]; const rel = f?.relation ?? 0; return Math.max(0.2, 1 - rel / 100) * (1 + (p.anger || 0) * 0.2); };
  let tot = ks.reduce((a, p) => a + weight(p), 0), v = r() * tot, k = ks[0];
  for (const p of ks) { if ((v -= weight(p)) <= 0) { k = p; break; } }
  let b = mine[0], bd = Infinity;
  for (const m of mine) { const d = Math.hypot(m.x - k.x, m.y - k.y); if (d < bd) { bd = d; b = m; } }
  const f = Math.min(0.75, Math.max(0.35, 14 / Math.max(14, bd)));
  return { x: Math.round(b.x + (k.x - b.x) * f), y: Math.round(b.y + (k.y - b.y) * f), rival: k.rival, kingdom: k.name };
}

// Route commerciale entre deux cités libres proches de chez soi (Convoi des Sept Marchands)
function cityRoute(state, cur) {
  const c = state.world.capital;
  const towns = Object.values(state.world.pois).filter((p) => p.type === 'town').map((p) => ({ p, d: Math.hypot(p.x - c.x, p.y - c.y) })).sort((a, b) => a.d - b.d).slice(0, 6).map((x) => x.p);
  if (towns.length < 2) return null;
  const n = cur.map.routeN = (cur.map.routeN || 0) + 1;
  const a = towns[n % towns.length], b = towns[(n * 3 + 1) % towns.length] === a ? towns[(n + 1) % towns.length] : towns[(n * 3 + 1) % towns.length];
  return { a: { x: a.x, y: a.y, name: a.name }, b: { x: b.x, y: b.y, name: b.name } };
}

// Migration v24 → v25 (sauvegarde v10 → v11) : les marches de l'ancienne carte d'événement rentrent immédiatement
// (troupes, butin déjà ramassé, coûts d'une action jamais réalisée, héros libérés) ; les cibles restantes d'un
// événement en cours sont transposées sur le monde en gardant leur état (palier, vaincue, réapparition, armée,
// filon restant, trésor révélé, région tenue…). La colonne d'une cible sur l'ancienne carte (0 = près de la base)
// choisit son anneau quand son type n'a pas de palier.
export function ensureEventWorld(state, now = Date.now()) {
  const L = state.live;
  if (!L || typeof L !== 'object') return null;
  const out = { marches: 0, targets: 0 };
  if (Array.isArray(L.marches)) {
    for (const m of L.marches) {
      if (!m) continue;
      for (const [u, n] of Object.entries(m.units || {})) state.army[u] = (state.army[u] || 0) + n;
      for (const [r, v] of Object.entries(m.loot || {})) if (state.resources[r] !== undefined) state.resources[r] += v;
      if (m.paid && m.phase === 'out') for (const [r, v] of Object.entries(m.paid)) state.resources[r] = (state.resources[r] || 0) + v;
      for (const it of m.items || []) state.inventory?.items?.push(it);
      const h = (state.heroes || []).find((z) => z.id === m.heroId); if (h) h.marchId = null;
      state.pending = (state.pending || []).filter((p) => p.marchId !== m.id);
      out.marches++;
    }
    delete L.marches;
  } else if (L.marches !== undefined) delete L.marches; // champ abîmé (import modifié à la main)
  const cur = L.current;
  const def = cur && LIVE_EVENTS[cur.key];
  if (cur && def && cur.map && Array.isArray(cur.map.tiles)) {
    const old = cur.map;
    cur.map = { targets: [], lava: [], burnt: [], threats: [], frost: null, volcano: null, spawnN: 0, respawns: {} };
    const W = def.world || {};
    const r = mulberry32(hash32(cur.seed, 'world'));
    const c = state.world.capital;
    if (W.frost) { const a = r() * Math.PI * 2, d = 10 + r() * 10; cur.map.frost = { x: Math.round(c.x + Math.cos(a) * d), y: Math.round(c.y + Math.sin(a) * d), r: 3, max: 11 }; }
    if (W.volcano) { const a = r() * Math.PI * 2, d = 10 + r() * 10; cur.map.volcano = { x: Math.round(c.x + Math.cos(a) * d), y: Math.round(c.y + Math.sin(a) * d) }; }
    for (const t of old.targets || []) {
      if (!t || t.gone) continue;
      const col = Math.max(0, Math.min(1, (t.x || 0) / Math.max(1, (old.w || 16) - 1)));
      const o = placeOpts(state, def, cur, t.type);
      if (!o.ring && !t.tier) o.ring = [4 + Math.round(col * 14), 8 + Math.round(col * 14)];
      if (o.hidden && t.mapped) delete o.hidden;
      const pos = placeTarget(state, cur, t.type, t.tier || 1, o);
      if (!pos) continue;
      const nt = { ...t, x: pos.x, y: pos.y, fx: undefined, fy: undefined, born: cur.start };
      delete nt.fx; delete nt.fy;
      if (o.hidden) nt.fog = true; else revealAt(state.world, pos.x, pos.y, 1);
      if (nt.type === 'caravan' || nt.type === 'ship') { const a = r() * Math.PI * 2, d = 10 + r() * 10; nt.dest = { x: Math.max(1, Math.min(state.world.size - 2, Math.round(pos.x + Math.cos(a) * d))), y: Math.max(1, Math.min(state.world.size - 2, Math.round(pos.y + Math.sin(a) * d))) }; nt.from = { x: pos.x, y: pos.y }; }
      if (nt.type === 'zone') nt.owned = false; // la garnison qui la tenait vient de rentrer
      cur.map.targets.push(nt);
      out.targets++;
    }
    if (W.volcano) shuffleLava(state, cur.map);
  }
  if (out.marches || out.targets) log(state, 'info', `🎪 Les événements se jouent désormais sur la carte du monde : ${out.targets} cible(s) transposée(s), ${out.marches} troupe(s) d’événement rentrée(s) avec tout ce qu’elles portaient.`, now);
  return out;
}

// Ajoute une cible sur le monde ; renvoie null si aucune case ne convient (la cible est alors simplement omise)
function addTarget(state, def, cur, type, tiers, opt = {}) {
  const r = mulberry32(hash32(cur.seed, type, cur.map.spawnN, opt.idx ?? 0));
  const map = cur.map;
  let tier = type === 'fortress' ? 8 : type === 'boss' ? 9 : tiers ? tiers[0] + Math.floor(r() * (tiers[1] - tiers[0] + 1)) : 1 + Math.floor(r() * 4);
  if (opt.tier) tier = opt.tier;
  // Paliers répartis : le n-ième camp d'une série monte de palier régulièrement (beaucoup de petits près de chez soi)
  if (tiers && opt.idx != null && !opt.tier) tier = Math.min(tiers[1], tiers[0] + Math.floor((opt.idx / Math.max(1, (def.world.targets.find((s) => s.type === type)?.count || 1) - 1)) * (tiers[1] - tiers[0]) + 0.0001));
  const o = { ...placeOpts(state, def, cur, type), ...(opt.place || {}) };
  const pos = placeTarget(state, cur, type, tier, o);
  if (!pos) return null;
  // Placement imposé par la géographie (frontière, front de neige, volcan, route) : le palier suit la distance à la
  // base la plus proche, pour garder « faible près de chez soi, fort au loin »
  if (o.center && tiers && !opt.tier && !FAR.includes(type)) {
    const b = nearestBase(state, pos.x, pos.y), d = Math.hypot(b.x - pos.x, b.y - pos.y);
    tier = Math.max(tiers[0], Math.min(tiers[1], 1 + Math.round((d - 4) / 3)));
  }
  const t = { id: uid('lt'), type, x: pos.x, y: pos.y, tier, done: false, born: opt.now || cur.start };
  if (o.hidden) t.fog = true; else revealAt(state.world, pos.x, pos.y, 1);
  if (type === 'caravan' || type === 'ship') {
    const rt = o.route || null;
    let dest;
    if (rt) dest = { x: rt.b.x, y: rt.b.y, name: rt.b.name };
    else { const a = r() * Math.PI * 2, d = 10 + r() * 10; dest = { x: Math.round(pos.x + Math.cos(a) * d), y: Math.round(pos.y + Math.sin(a) * d) }; }
    dest.x = Math.max(1, Math.min(state.world.size - 2, dest.x)); dest.y = Math.max(1, Math.min(state.world.size - 2, dest.y));
    Object.assign(t, { dest, from: rt ? { x: rt.a.x, y: rt.a.y, name: rt.a.name } : { x: pos.x, y: pos.y }, spied: false, cargo: ['soie', 'chevaux', 'épices', 'armes', 'or'][Math.floor(r() * 5)] });
  }
  if (type === 'vein') { t.amount = 4 + Math.floor(r() * 5); t.max = t.amount; }
  if (type === 'trace') t.step = (cur.trackStep || 0) + 1;
  if (type === 'riddle') t.riddle = Math.floor(r() * RIDDLES.length);
  if (type === 'boss') t.hidden = true; // apparaît après quelques heures
  if (type === 'zone' && o.center?.kingdom) t.border = o.center.kingdom;
  if (CAMP_TYPES.includes(type) || type === 'fortress') t.enemies = scaleEnemies(state, def, type, tier);
  map.targets.push(t);
  return t;
}

export function scaleEnemies(state, def, type, tier) {
  const base = def.enemies[type] || def.enemies.camp || Object.values(def.enemies)[0];
  const k = (type === 'fortress' ? 1 : 1 + (tier - 1) * 0.9) * thScale(state) * liveCfg(state).enemyMult;
  return Object.fromEntries(Object.entries(base).map(([u, n]) => [u, Math.max(1, Math.round(n * k))]));
}

// ───────────────────────── Boutique ─────────────────────────
function buildShop(state, def, occ, seed) {
  const r = mulberry32(seed ^ (occ * 7919));
  const rot = [...def.shop.rotating];
  const picks = [];
  // Rotation : chaque occurrence propose une sélection différente
  const n = Math.min(def.shop.picks, rot.length);
  while (picks.length < n) picks.push(rot.splice(Math.floor(r() * rot.length), 1)[0].id);
  return { rotating: picks, bought: {}, globalSold: {} };
}

export function shopItems(state) {
  const cur = liveState(state).current;
  if (!cur) return [];
  const def = LIVE_EVENTS[cur.key];
  const c = liveCfg(state);
  const items = [...def.shop.fixed, ...def.shop.rotating.filter((i) => cur.shop.rotating.includes(i.id)).map((i) => ({ ...i, rotating: true }))];
  return items.map((i) => {
    const bought = cur.shop.bought[i.id] || 0;
    const gsold = Math.floor(cur.shop.globalSold[i.id] || 0);
    const owned = (i.give.unique && shardState(state).owned[i.give.unique]) || (i.give.deco && state.meta.owned[i.give.deco]) || (i.give.specialHero && shardState(state).owned[i.give.specialHero]);
    return { ...i, price: Math.round(i.price * c.priceMult), bought, left: i.stock ? i.stock - bought : null, globalLeft: i.global ? Math.max(0, i.global - gsold - bought) : null, owned: !!owned };
  });
}

export function buyShopItem(state, id, now = Date.now()) {
  const cur = liveState(state).current;
  if (!cur || now >= cur.end) return { ok: false, reason: 'Aucun événement en cours' };
  const it = shopItems(state).find((i) => i.id === id);
  if (!it) return { ok: false, reason: 'Objet introuvable' };
  if (it.left !== null && it.left <= 0) return { ok: false, reason: 'Stock personnel épuisé' };
  if (it.globalLeft !== null && it.globalLeft <= 0) return { ok: false, reason: 'Rupture de stock : les seigneurs rivaux (IA) ont acheté les derniers exemplaires' };
  if (it.owned && it.exclusive) return { ok: false, reason: 'Déjà possédé' };
  if (cur.wallet < it.price) return { ok: false, reason: `Il faut ${fmt(it.price)} ${LIVE_EVENTS[cur.key].currency.name}` };
  cur.wallet -= it.price;
  cur.shop.bought[id] = (cur.shop.bought[id] || 0) + 1;
  const text = grantGive(state, it.give, now, 'Boutique');
  if (it.give.shards) liveTotals(state).shardsBought = (liveTotals(state).shardsBought || 0) + it.give.shards;
  return { ok: true, text };
}

// Marchand mystère : 3 à 5 objets renouvelés chaque jour pendant un événement
export function rollMystery(state, now = Date.now()) {
  const cur = liveState(state).current;
  if (!cur) return;
  const d = dayKey(now);
  if (cur.mystery?.day === d) return;
  const n = rng.int(3, 5);
  const pool = MYSTERY_POOL.filter((x) => !x.rare || rng.chance(0.2));
  const items = [];
  while (items.length < n && pool.length) items.push({ ...pool.splice(rng.int(0, pool.length - 1), 1)[0], bought: false });
  cur.mystery = { day: d, items };
  notify(state, '🎩', `Le Marchand mystère est arrivé avec ${n} objets${items.some((i) => i.rare) ? ' — dont un objet rare !' : ''} (jusqu’à minuit).`, now);
}

export function buyMystery(state, idx, now = Date.now()) {
  const cur = liveState(state).current;
  const it = cur?.mystery?.items[idx];
  if (!it || it.bought || now >= cur.end || cur.mystery.day !== dayKey(now)) return { ok: false, reason: 'Le marchand mystère est reparti' };
  const price = Math.round(it.price * liveCfg(state).priceMult);
  if (cur.wallet < price) return { ok: false, reason: 'Monnaie insuffisante' };
  cur.wallet -= price;
  it.bought = true;
  return { ok: true, text: grantGive(state, it.give, now, 'Marchand mystère') };
}

// ───────────────────────── Récompenses génériques ─────────────────────────
export function liveTotals(state) { return (liveState(state).totals ||= {}); }

function earn(state, n, now, why = '', kind = null) {
  const L = liveState(state);
  const cur = L.current;
  if (!cur || n <= 0) return 0;
  const def = LIVE_EVENTS[cur.key];
  let k = liveCfg(state).currencyMult;
  if (kind) k *= EVENT_STANCES[cur.stance || 'balanced']?.[kind] ?? 1;
  if (def.special?.hearth) k *= 1 + Math.min(150, cur.warmth) / 300;
  const v = Math.round(n * k);
  cur.wallet += v;
  cur.earned += v;
  bump(cur, 'earned', v);
  if (!cur.best || v > cur.best.v) cur.best = { v, why };
  return v;
}
const bump = (cur, stat, n = 1) => { cur.stats[stat] = (cur.stats[stat] || 0) + n; };

function chestLoot(state, kind) {
  const k = 0.6 + thLevel(state) * 0.25;
  const base = kind === 'epic' ? { gold: 2500, iron: 2000, crystals: 8, rareOre: 6 } : { gold: 1000, iron: 800, crystals: 3, rareOre: 2 };
  return Object.fromEntries(Object.entries(base).map(([r, v]) => [r, Math.round(v * k)]));
}

// Applique une récompense « give » ; renvoie un texte lisible
export function grantGive(state, g, now = Date.now(), source = '') {
  const cur = liveState(state).current;
  const def = cur && LIVE_EVENTS[cur.key];
  const mods = computeMods(state, now);
  const s = shardState(state);
  const parts = [];
  for (const [k, v] of Object.entries(g || {})) {
    if (def && k === def.currency.key) { const got = earn(state, v, now, source); parts.push(`${fmt(got)} ${def.currency.icon}`); continue; }
    if (RESOURCES[k]) { gain(state, { [k]: v }, mods); parts.push(`${fmt(v)} ${RESOURCES[k].icon}`); continue; }
    switch (k) {
      case 'res': gain(state, v, mods); parts.push(Object.entries(v).map(([r, n]) => `${fmt(n)} ${RESOURCES[r].icon}`).join(' ')); break;
      case 'units': for (const [u, n] of Object.entries(v)) { state.army[u] = (state.army[u] || 0) + n; parts.push(`${n} ${ALL_UNITS[u].name}`); } break;
      case 'chest': { const r = chestLoot(state, v); gain(state, r, mods); const it = generateItem({ ilvl: 4 + thLevel(state) * 2, boost: 1, min: v === 'epic' ? 'epic' : 'rare' }); state.inventory.items.push(it); parts.push(`coffre ${v === 'epic' ? 'épique' : 'rare'} (${it.name})`); break; }
      case 'item': { const it = generateItem({ ilvl: 4 + thLevel(state) * 2, boost: 1.2, min: v.min }); state.inventory.items.push(it); parts.push(it.name); break; }
      case 'unique': {
        s.owned[v] = (s.owned[v] || 0) + 1;
        if (s.owned[v] > 1) { const m = UNIQUE_ITEMS[v].rarity === 'mythic'; if (m) s.mythicFragments += 40; else s.legendaryFragments += 10; parts.push(`${UNIQUE_ITEMS[v].name} (doublon → fragments)`); }
        else { state.inventory.items.push(createUniqueItem(v)); parts.push(`✨ ${UNIQUE_ITEMS[v].name}`); }
        break;
      }
      case 'specialHero': {
        s.owned[v] = (s.owned[v] || 0) + 1;
        if (s.owned[v] > 1) { s.mythicFragments += 40; parts.push(`${SPECIAL_HEROES[v].name} (doublon → fragments)`); }
        else { state.heroes.push(createSpecialHero(v)); parts.push(`🦸 ${SPECIAL_HEROES[v].name}`); }
        break;
      }
      case 'mythicFragments': case 'legendaryFragments': case 'relicFragments': if (v) { s[k] += v; parts.push(`${v} fragment(s) ${k === 'mythicFragments' ? 'mythiques' : k === 'legendaryFragments' ? 'légendaires' : 'de relique'}`); } break;
      case 'shards': addShards(state, v, 'event', now, source || 'Événement'); parts.push(`💠 ${v} Éclat(s) Ancien(s)`); break;
      case 'deco': if (state.meta.owned[v]) { s.mythicFragments += 20; parts.push(`${COSMETICS[v]?.name || v} (doublon → fragments)`); } else { state.meta.owned[v] = true; parts.push(`décoration ${COSMETICS[v]?.name || v}`); } break;
      case 'buff': state.buffs.push({ name: v.name, mods: v.mods, until: now + v.h * H }); parts.push(`bonus « ${v.name} » ${v.h} h`); break;
      case 'consumable': for (const [c, n] of Object.entries(v)) state.inventory.consumables[c] = (state.inventory.consumables[c] || 0) + n; parts.push('consommables'); break;
      case 'research': { const q = state.queues.research[0]; if (q) { q.end -= v * 1000; q.start -= v * 1000; parts.push('recherche accélérée'); } else { gain(state, { gold: 600 }, mods); parts.push('600 🪙 (aucune recherche en cours)'); } break; }
      case 'treasureMap': { // v25 : de vraies coordonnées sur la carte du monde (de préférence un trésor encore caché)
        const ts = (cur?.map.targets || []).filter((x) => x.type === 'treasure' && !x.done && !x.gone);
        const t = ts.find((x) => x.fog && !x.mapped) || ts[0];
        if (t) { t.mapped = true; revealAt(state.world, t.x, t.y, 1); parts.push(`trésor révélé en (${t.x}, ${t.y})`); } else parts.push('carte vierge'); break; }
      case 'exclusiveFromShop': {
        const ex = def?.shop.fixed.filter((i) => i.exclusive && (i.give.deco || i.give.unique) && !(i.give.deco && state.meta.owned[i.give.deco]) && !(i.give.unique && s.owned[i.give.unique]));
        if (ex?.length) parts.push(grantGive(state, ex[0].give, now, source)); else { s.legendaryFragments += 10; parts.push('10 fragments légendaires'); }
        break;
      }
      case 'speedups': { const t = grantSpeedups(state, v, '', now); if (t) parts.push(t); break; }
      case 'title': state.meta.titles = [...new Set([...(state.meta.titles || []), v])]; parts.push(`titre « ${v} »`); break;
      case 'insignia': state.meta.insignia = (state.meta.insignia || 0) + v; parts.push(`${v} insignes`); break;
      default: break;
    }
  }
  return parts.join(', ');
}

// ───────────────────────── Actions sur la carte ─────────────────────────
const WORK = { escort: 60, dig: 30, mine: 60, harvest: 60, track: 20 };
export const ACTIONS = {
  attack: { label: 'Attaquer', icon: '⚔️' },
  escort: { label: 'Escorter', icon: '🛡️', hint: '1 h aux côtés de la caravane — récompense sûre, petit risque d’embuscade' },
  trade: { label: 'Commercer', icon: '🤝', hint: 'Échangez vos marchandises contre de la monnaie, sans combat' },
  spy: { label: 'Espionner', icon: '👁️', hint: 'Révèle destination et cargaison ; +50 % de butin si vous attaquez ensuite' },
  dig: { label: 'Déterrer', icon: '⛏️', hint: '30 min de fouille' },
  deliver: { label: 'Livrer', icon: '📦' },
  solve: { label: 'Résoudre l’énigme', icon: '❓' },
  track: { label: 'Suivre la piste', icon: '🐾', hint: 'Éclaireur requis' },
  garrison: { label: 'Tenir garnison', icon: '🏰' },
  withdraw: { label: 'Rappeler la garnison', icon: '↩️' },
  mine: { label: 'Exploiter le filon', icon: '⛏️', hint: '1 h de travail ; plus de récolteurs = plus de pépites' },
  harvest: { label: 'Récolter l’évent', icon: '🌋', hint: '1 h de récolte, très dangereux si la lave se rapproche' },
};

export const TARGET_INFO = {
  camp: { name: 'Camp', icon: '⛺' }, port: { name: 'Port', icon: '⚓' }, vault: { name: 'Chambre forte', icon: '🚪' },
  crypt: { name: 'Crypte', icon: '⚰️' }, pack: { name: 'Meute', icon: '🐺' }, zone: { name: 'Région', icon: '🚩' },
  fortress: { name: 'Forteresse', icon: '🏯' }, boss: { name: 'Boss', icon: '👑' }, caravan: { name: 'Caravane', icon: '🐫' },
  ship: { name: 'Navire', icon: '⛵' }, treasure: { name: 'Trésor', icon: '💰' }, village: { name: 'Village', icon: '🏘️' },
  hearth: { name: 'Brasier', icon: '🔥' }, riddle: { name: 'Salle à énigme', icon: '❓' }, trace: { name: 'Piste du dragon', icon: '🐾' },
  lair: { name: 'Antre du dragon', icon: '🐉' }, horde: { name: 'Horde des morts', icon: '💀' }, vein: { name: 'Filon', icon: '🪙' }, vent: { name: 'Évent d’obsidienne', icon: '🌋' },
  bastion: { name: 'Citadelle des Anciens', icon: '🏰' },
};

const DELIVER_COST = {
  village: { food: 1500 },
  hearth: { wood: 800, coal: 150, food: 800 },
};
const tradeCost = (t) => ({ food: 500 * t.tier, wood: 400 * t.tier });
export const actionCost = (t, action) => (action === 'deliver' ? DELIVER_COST[t.type] : action === 'trade' ? tradeCost(t) : null);

export function targetName(cur, t) {
  const def = LIVE_EVENTS[cur.key];
  if (t.type === 'boss') { const b = def.bosses[cur.bossIdx] || def.bosses[0]; return `${b.name} (rang ${Math.min(cur.bossIdx + 1, b.tiers.length)})`; }
  if (t.type === 'lair') return def.coop?.name || 'Antre';
  const roman = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII'][t.tier] || '';
  return `${TARGET_INFO[t.type]?.name || t.type}${CAMP_TYPES.includes(t.type) ? ' ' + roman : ''}`;
}

// Cible visible et utilisable. Les ruines cachées (Ruines Anciennes) restent sous le vrai brouillard du monde tant que
// la case n'est pas révélée (éclaireurs, exploration, carte au trésor).
export function isVisible(cur, t, world = null) {
  if (t.done || t.gone || t.hidden) return false;
  if (t.fog && !t.mapped && world && !world.revealed[t.y * world.size + t.x]) return false;
  return true;
}

export function actionsFor(state, t, now = Date.now()) {
  const cur = liveState(state).current;
  const def = LIVE_EVENTS[cur.key];
  const held = eventMarches(state).some((m) => m.targetId === t.id && m.phase === 'hold');
  switch (t.type) {
    case 'caravan': return ['attack', 'escort', 'trade', 'spy'];
    case 'ship': return ['attack', 'spy'];
    case 'port': return def.special?.portTrade && !(t.tradeCd > now) ? ['attack', 'trade'] : ['attack'];
    case 'treasure': return ['dig'];
    case 'village': return ['deliver'];
    case 'hearth': return t.cooldown > now ? [] : ['deliver'];
    case 'riddle': return t.sealedUntil > now ? [] : ['solve'];
    case 'trace': return ['track'];
    case 'zone': return held ? ['withdraw'] : t.owned ? ['garrison'] : ['attack'];
    case 'bastion': return held ? ['garrison', 'withdraw'] : ['garrison'];
    case 'vein': return ['mine'];
    case 'vent': return t.cooldown > now ? [] : ['harvest'];
    case 'horde': case 'boss': case 'lair': return ['attack'];
    // v25 : camps et forteresses s'espionnent (défenseurs exacts au lieu d'une estimation), comme sur la carte du monde
    default: return t.spied ? ['attack'] : ['attack', 'spy'];
  }
}

// v25 : les marches d'événement sont des marches du monde (state.marches, type « event ») : même tracé sur la carte,
// mêmes accélérateurs, même rappel. Elles gardent leur propre plafond (bonus de marches pendant l'événement).
export const maxLiveMarches = (state) => liveCfg(state).maxMarches + Math.floor(thLevel(state) / 4);
export const eventMarches = (state) => (state.marches || []).filter((m) => m.type === 'event');
const dropMarch = (state, m) => { state.marches = state.marches.filter((z) => z.id !== m.id); };
const unitCount = (u) => Object.values(u || {}).reduce((s, v) => s + v, 0);

// Point de départ d'une marche : la base demandée (capitale ou avant-poste), sinon la plus proche de la cible
export function marchOrigin(state, x, y, fromKey = null) {
  return (fromKey && baseByKey(state, fromKey)) || nearestBase(state, x, y);
}
export function liveTravel(state, cur, from, x, y, units, mods) {
  let speed = Infinity;
  for (const [u, n] of Object.entries(units)) if (n > 0 && UNITS[u]) speed = Math.min(speed, UNITS[u].speed);
  if (speed === Infinity) speed = 1;
  return Math.max(MIN, eventTravelMs(cur, from, x, y, speed * (1 + (mods['march.speed'] || 0)), liveCfg(state).travelMult));
}

export function planLive(state, opts, now = Date.now()) {
  const L = liveState(state);
  const cur = L.current;
  const fail = (reason) => ({ ok: false, reason });
  if (!cur || now >= cur.end) return fail('Aucun événement en cours');
  const units = Object.fromEntries(Object.entries(opts.units || {}).filter(([, n]) => n > 0).map(([k, n]) => [k, Math.floor(n)]));
  const { action } = opts;
  const t = cur.map.targets.find((z) => z.id === opts.targetId);
  if (!t || !isVisible(cur, t, state.world)) return fail('Cible introuvable');
  if (!actionsFor(state, t, now).includes(action)) return fail('Action impossible ici');
  const x = t.x, y = t.y;
  if (action === 'withdraw') return { ok: true, units: {}, t, travel: 0 };
  if (eventMarches(state).filter((m) => m.phase !== 'hold').length >= maxLiveMarches(state)) return fail(`Maximum ${maxLiveMarches(state)} troupes d’événement en route`);
  for (const [u, n] of Object.entries(units)) if ((state.army[u] || 0) < n) return fail(`Pas assez de ${ALL_UNITS[u]?.name || u}`);
  if (!unitCount(units)) return fail('Sélectionnez des unités');
  if ((action === 'track' || action === 'spy') && !units.scout) return fail('Il faut au moins un éclaireur');
  if (['mine', 'harvest', 'dig', 'escort', 'deliver', 'trade', 'solve'].includes(action) && eventMarches(state).some((m) => m.targetId === t.id && m.phase !== 'back')) return fail('Une de vos troupes est déjà sur place');
  const cost = actionCost(t, action);
  if (cost && !canAfford(state, cost)) return fail(`Il faut ${Object.entries(cost).map(([r, v]) => `${fmt(v)} ${RESOURCES[r].icon}`).join(' ')}`);
  if (opts.heroId) {
    const h = state.heroes.find((z) => z.id === opts.heroId);
    if (!h || h.marchId || h.assignment) return fail('Héros indisponible');
  }
  const mods = marchMods(state, opts.heroId, null, now);
  const from = marchOrigin(state, x, y, opts.from);
  return { ok: true, units, t, x, y, cost, from, travel: liveTravel(state, cur, from, x, y, units, mods), mods };
}

export function sendLive(state, opts, now = Date.now()) {
  const L = liveState(state);
  const plan = planLive(state, opts, now);
  if (!plan.ok) return plan;
  if (opts.action === 'withdraw') {
    const m = eventMarches(state).find((z) => z.targetId === plan.t.id && z.phase === 'hold');
    if (!m) return { ok: false, reason: 'Aucune garnison' };
    m.phase = 'back'; m.returnAt = now + m.travel;
    if (plan.t.type === 'zone') { plan.t.owned = false; plan.t.enemies = scaleEnemies(state, LIVE_EVENTS[L.current.key], 'zone', plan.t.tier); }
    return { ok: true };
  }
  for (const [u, n] of Object.entries(plan.units)) state.army[u] -= n;
  if (plan.cost) pay(state, plan.cost);
  const m = {
    id: uid('lm'), type: 'event', event: L.current.key, action: opts.action, targetId: plan.t.id, x: plan.x, y: plan.y, units: plan.units,
    from: { key: plan.from.key, name: plan.from.name, x: plan.from.x, y: plan.from.y },
    heroId: opts.heroId || null, formation: opts.formation || 'balanced', phase: 'out', start: now, arrive: now + plan.travel,
    travel: plan.travel, loot: {}, items: [], workEnd: 0, returnAt: 0, paid: plan.cost || null,
  };
  if (m.heroId) state.heroes.find((h) => h.id === m.heroId).marchId = m.id;
  state.marches.push(m);
  return { ok: true, march: m };
}

export function recallLive(state, mid, now = Date.now()) {
  const m = eventMarches(state).find((z) => z.id === mid);
  if (!m || m.phase === 'back') return { ok: false };
  if (m.phase === 'wait') state.pending = state.pending.filter((p) => p.marchId !== m.id);
  if (m.phase === 'out') { m.phase = 'back'; m.returnAt = now + (now - m.start); m.refund = true; } // rappelée avant d'agir : ce qui a été payé revient
  else { m.phase = 'back'; m.returnAt = now + m.travel; }
  const t = liveTarget(state, m.targetId);
  if (t?.type === 'zone' && t.owned) { t.owned = false; t.enemies = scaleEnemies(state, LIVE_EVENTS[liveState(state).current.key], 'zone', t.tier); }
  return { ok: true };
}

export const liveTarget = (state, id) => liveState(state).current?.map.targets.find((t) => t.id === id) || null;

export function liveMarchNext(m) {
  if (m.phase === 'out') return m.arrive;
  if (m.phase === 'work') return m.workEnd;
  if (m.phase === 'back') return m.returnAt;
  return Infinity;
}
// Échéance d'une marche d'événement (appelée par processMarch de systems/marches.js)
export function processEventMarch(state, m, now) {
  if (liveMarchNext(m) > now) return false;
  if (m.phase === 'out') arriveLive(state, m, m.arrive);
  else if (m.phase === 'work') finishLiveWork(state, m, m.workEnd);
  else if (m.phase === 'back') homeLive(state, m, m.returnAt);
  if (m.phase !== 'back') syncEventPois(state, Math.min(now, m.workEnd || now, m.arrive || now));
  return true;
}

// ───────────────────────── Projection sur la carte du monde ─────────────────────────
// Chaque cible visible devient un lieu du monde (type « evt ») le temps de l'événement : dessin, niveau, bannière de
// l'événement, sélection, étiquette, filtre « Événement ». La vérité reste dans cur.map.targets ; la projection est
// refaite à chaque pas du monde et après chaque action. Phases : upcoming (annoncé, 24 h avant), active, boss,
// cleared (vaincu : campement en feu puis ruines jusqu'à la réapparition), ended (fin : la bannière tombe, 20 min).
export const UPCOMING_WINDOW = 24 * H;
export const CLEARED_SHOW = 30 * MIN;
export function eventPhaseOf(cur, t, now) {
  if (t.done) return 'cleared';
  if (t.type === 'boss' || t.type === 'lair' || t.type === 'fortress') return 'boss';
  void cur; void now;
  return 'active';
}
function heraldSpot(state, k, occ) {
  const w = state.world, c = w.capital, S = w.size;
  const h = hash32(k, occ);
  for (let tries = 0; tries < 160; tries++) {
    const a = ((h + tries * 2654435761) % 3600) / 3600 * Math.PI * 2, d = 5 + ((h >> 8) + tries) % 5;
    const x = Math.round(c.x + Math.cos(a) * d), y = Math.round(c.y + Math.sin(a) * d);
    if (x < 1 || y < 1 || x >= S - 1 || y >= S - 1 || w.pois[key(x, y)] || state.territories?.[key(x, y)]) continue;
    if (['river', 'mountain'].includes(wTerrain(w, x, y))) continue;
    return { x, y };
  }
  return null;
}
export function syncEventPois(state, now = Date.now()) {
  const w = state.world;
  if (!w?.pois || !w.capital) return [];
  for (const [k, p] of Object.entries(w.pois)) if (p.type === 'evt' || p.type === 'eventSite') delete w.pois[k];
  const L = liveState(state);
  const out = [];
  const put = (t, extra) => {
    const k = key(t.x, t.y);
    if (w.pois[k] || state.territories?.[k]) return;
    const p = { id: 'evt_' + (t.id || extra.kind), type: 'evt', x: t.x, y: t.y, danger: 0, ...extra };
    w.pois[k] = p; out.push(p);
  };
  const cur = L.current;
  if (cur && now < cur.end) {
    const def = LIVE_EVENTS[cur.key];
    const bases = eventBases(state);
    const dist = (t) => Math.min(...bases.map((b) => Math.hypot(b.x - t.x, b.y - t.y)));
    const live = cur.map.targets.filter((t) => isVisible(cur, t, w)).sort((a, b) => (b.type === 'boss') - (a.type === 'boss') || dist(a) - dist(b)).slice(0, EVENT_VISIBLE_MAX);
    for (const t of cur.map.targets) if (t.done && !t.doneAt) t.doneAt = now;
    const cleared = cur.map.targets.filter((t) => t.done && !t.gone && !t.fog && (RESPAWNING.includes(t.type) || now - (t.doneAt || now) < CLEARED_SHOW)).slice(0, 10);
    for (const t of [...live, ...cleared]) {
      put(t, { evId: t.id, eventKey: cur.key, kind: t.type, tier: t.tier, phase: eventPhaseOf(cur, t, now), color: def.color, name: targetName(cur, t), enemies: t.enemies || null, scouted: !!t.spied, doneAt: t.doneAt || 0, respawnAt: t.done ? t.respawnAt || 0 : 0, movedAt: t.movedAt || 0, prev: t.prev || null, nomad: !!t.nomad });
    }
  } else if (L.fading && now < L.fading.until) {
    for (const t of L.fading.items) put(t, { evId: t.id, eventKey: L.fading.eventKey, kind: t.kind, tier: t.tier, phase: 'ended', color: L.fading.color, name: `${TARGET_INFO[t.kind]?.name || 'Camp'} levé`, endAt: L.fading.until - 20 * MIN });
  }
  const next = L.calendar?.[0];
  if (!cur && next && next.start > now && next.start - now <= UPCOMING_WINDOW) {
    const def = LIVE_EVENTS[next.key];
    const at = heraldSpot(state, next.key, (L.occ[next.key] || 0) + 1);
    if (at) {
      put({ ...at, id: `herald_${next.key}` }, { kind: 'herald', eventKey: next.key, tier: 1, phase: 'upcoming', color: def.color, name: def.name, until: next.start });
      revealAt(w, at.x, at.y, 1);
    }
  }
  return out;
}
// Lieu projeté → cible de l'événement (ou null)
export const eventTargetOfPoi = (state, poi) => (poi?.type === 'evt' && poi.evId ? liveTarget(state, poi.evId) : null);
// Cibles visibles triées par distance à la base la plus proche (écran de l'événement : « Montre-moi »)
export function eventTargetsByDistance(state, now = Date.now()) {
  const cur = liveState(state).current;
  if (!cur || now >= cur.end) return [];
  return cur.map.targets.filter((t) => isVisible(cur, t, state.world)).map((t) => {
    const b = nearestBase(state, t.x, t.y);
    return { t, name: targetName(cur, t), base: b, d: Math.hypot(b.x - t.x, b.y - t.y), actions: actionsFor(state, t, now) };
  }).sort((a, b) => a.d - b.d);
}
EVENT_MARCH.process = processEventMarch;
EVENT_MARCH.recall = (state, mid, now) => recallLive(state, mid, now);

function goBack(m, t) { m.phase = 'back'; m.returnAt = t + m.travel; }
function addLiveReport(state, text, t, win = true) {
  const cur = liveState(state).current;
  if (!cur) return;
  (cur.log ||= []).unshift({ t, text, win });
  if (cur.log.length > 40) cur.log.length = 40;
}

// Les deux camps d'un combat d'événement (partagés par le vrai combat et l'estimation)
function liveSides(state, m, enemies, t, opts = {}) {
  const cur = liveState(state).current;
  const mods = { ...marchMods(state, m.heroId, null, t) };
  if (opts.bonusAtk) mods['combat.atk'] = (mods['combat.atk'] || 0) + opts.bonusAtk;
  if (opts.bonusDef) mods['combat.def'] = (mods['combat.def'] || 0) + opts.bonusDef;
  const stance = EVENT_STANCES[cur.stance || 'balanced'];
  if (stance?.losses) mods['combat.losses'] = (mods['combat.losses'] || 0) + stance.losses;
  const terrain = wTerrain(state.world, m.x, m.y) || 'plain';
  const tier = opts.tier || 1;
  return [
    { units: m.units, mods, formation: m.formation, label: 'Vous' },
    { units: enemies, mods: { 'combat.atk': 0.04 * tier + (opts.enemyMods?.['combat.atk'] || 0), 'combat.def': 0.04 * tier }, label: opts.label || 'Ennemi' },
    { terrain: terrain === 'ash' ? 'ruins' : terrain, weather: state.weather.type, bossHp: opts.bossHp },
  ];
}

function liveBattle(state, m, enemies, t, opts = {}) {
  const [att, dfn, ctx] = liveSides(state, m, enemies, t, opts);
  const mods = att.mods;
  const res = simulateBattle(att, dfn, ctx);
  m.units = Object.fromEntries(Object.entries(res.attRemaining).filter(([, n]) => n > 0));
  const killed = Object.values(res.defLosses).reduce((a, b) => a + b, 0);
  const hero = state.heroes.find((h) => h.id === m.heroId);
  if (hero) giveXp(state, hero, 20 + killed * 8 + res.bossDamage / 60, mods);
  state.stats.enemiesKilled = (state.stats.enemiesKilled || 0) + killed;
  return res;
}

/**
 * Adversaire attendu d'une action d'événement (pour l'estimation et le remplissage auto), avec les mêmes options que
 * le vrai combat. kind : 'win' (il faut l'emporter), 'boss' (dégâts à infliger, pas de victoire), null (pas de combat).
 */
export function liveFoe(state, action, tg) {
  const cur = liveState(state).current;
  if (!cur || !tg) return null;
  const def = LIVE_EVENTS[cur.key];
  if (action === 'attack') {
    if (tg.type === 'boss') {
      const b = def.bosses[0];
      if (cur.bossIdx >= b.tiers.length) return null;
      return { kind: 'boss', enemies: { [b.unit]: 1 }, opts: { bossHp: cur.bossHp, tier: 3 + cur.bossIdx, enemyMods: bossPhase(state, cur, def).enemyMods } };
    }
    if (tg.type === 'lair') return cur.coop?.hp > 0 ? { kind: 'boss', enemies: { [def.coop.unit]: 1 }, opts: { bossHp: cur.coop.hp, tier: 5 } } : null;
    const enemies = tg.enemies || scaleEnemies(state, def, tg.type === 'ship' || tg.type === 'caravan' ? tg.type : 'camp', tg.tier);
    const bonusAtk = tg.type === 'ship' && (state.city && Object.values(state.city.buildings).some((b) => b.type === 'port')) ? 0.3 : 0;
    return { kind: 'win', enemies, opts: { tier: tg.tier, bonusAtk } };
  }
  if (action === 'escort') return { kind: 'win', ambush: true, enemies: scaleEnemies(state, def, 'camp', Math.max(1, tg.tier - 1)), opts: { tier: tg.tier } };
  if (action === 'garrison' && tg.type === 'zone') return { kind: 'win', hold: true, enemies: scaleEnemies(state, def, 'zone', Math.max(1, tg.tier - 1)), opts: { tier: tg.tier } };
  if (action === 'garrison' && tg.type === 'bastion' && def.enemies.assault) {
    const k = (0.4 + ((cur.stats.assaultsSeen || 0) + 1) * 0.08) * thScale(state) * liveCfg(state).enemyMult;
    return { kind: 'win', hold: true, enemies: Object.fromEntries(Object.entries(def.enemies.assault).map(([u, v]) => [u, Math.max(1, Math.round(v * k))])), opts: { tier: 3 } };
  }
  return null;
}

// Estimation déterministe d'un envoi d'événement contre l'adversaire attendu
export function livePreview(state, opts, now = Date.now()) {
  const tg = liveTarget(state, opts.targetId);
  const foe = liveFoe(state, opts.action, tg);
  if (!foe) return null;
  const m = { units: opts.units, heroId: opts.heroId, formation: opts.formation, x: tg.x, y: tg.y };
  return { ...foe, pv: previewBattle(...liveSides(state, m, foe.enemies, now, foe.opts)) };
}

const campReward = (tier) => 50 * tier + 15 * tier * tier;
// Récompense attendue d'une cible (fiche de la carte) : points d'événement et butin indicatif, sans hasard
export function targetReward(state, t) {
  const cur = liveState(state).current;
  const def = cur && LIVE_EVENTS[cur.key];
  if (!def) return null;
  const pts = (v) => Math.round(v * liveCfg(state).currencyMult);
  switch (t.type) {
    case 'fortress': return { points: pts(2500), loot: 'objet épique garanti' };
    case 'caravan': return { points: pts((300 + 150 * t.tier) * (t.spied ? 1.5 : 1)), loot: `${fmt(400 * t.tier)} or et marchandises` };
    case 'ship': return { points: pts((400 + 100 * t.tier) * (t.spied ? 1.5 : 1)), loot: `${fmt(600 * t.tier)} or` };
    case 'horde': { const n = (cur.stats.waves || 0) + (cur.stats.wavesLost || 0); return { points: pts(300 + n * 60 + campReward(t.tier)), loot: 'la vague de cette nuit est annulée' }; }
    case 'treasure': return { points: pts(325), loot: 'or, gemmes, parfois un objet rare' };
    case 'riddle': return { points: pts(500), loot: 'parfois un fragment de relique' };
    case 'vein': return { points: pts(110), loot: `par poche (reste ${t.amount}/${t.max}) + 250 or` };
    case 'vent': return { points: pts(145), loot: 'cristaux, minerai rare' };
    case 'village': return { points: pts(250), loot: '' };
    case 'hearth': return { points: pts(120), loot: '+10 chaleur' };
    case 'trace': return { points: pts(300), loot: 'mène à l’antre' };
    case 'boss': return { points: null, loot: 'récompense de rang (voir la fiche)' };
    case 'lair': return { points: null, loot: 'points selon les dégâts infligés' };
    case 'bastion': return { points: null, loot: 'points à chaque assaut repoussé' };
    case 'zone': return { points: pts(campReward(t.tier)), loot: `puis ${fmt(40 * t.tier)} par heure tenue` };
    default: return { points: pts(campReward(t.tier)), loot: t.tier >= 5 ? 'chance d’objet rare' : 'chance d’objet' };
  }
}

function arriveLive(state, m, t) {
  const L = liveState(state);
  const cur = L.current;
  if (!cur) return goBack(m, t);
  const def = LIVE_EVENTS[cur.key];
  const tg = liveTarget(state, m.targetId);
  if (!tg || tg.done || tg.gone) { m.refund = true; addLiveReport(state, '↩️ La cible a disparu avant votre arrivée : ce qui avait été payé est rapporté.', t, false); return goBack(m, t); }
  const name = targetName(cur, tg);
  switch (m.action) {
    case 'attack': return attackTarget(state, m, tg, t, def, name);
    case 'spy': {
      tg.spied = true;
      addLiveReport(state, tg.dest ? `👁️ ${name} espionnée : cargaison de ${tg.cargo}, destination (${tg.dest.x}, ${tg.dest.y}), ${unitCount(tg.enemies || def.enemies[tg.type] || {})} gardes.` : `👁️ ${name} espionné : ${unitCount(tg.enemies || {})} défenseurs, composition exacte connue.`, t);
      earn(state, 40, t, 'espionnage', 'peace');
      return goBack(m, t);
    }
    case 'trade': {
      // Port en délai de reprise (plusieurs marches envoyées à la fois) : pas d'échange, retour
      if (tg.type === 'port' && tg.tradeCd > t) { m.refund = true; addLiveReport(state, `⏳ ${name} vient déjà de commercer : revenez dans ${Math.ceil((tg.tradeCd - t) / MIN)} min.`, t, false); return goBack(m, t); }
      const v = tg.type === 'port' ? 300 : 150 + 60 * tg.tier;
      const got = earn(state, v, t, 'commerce', 'peace');
      bump(cur, 'trades');
      if (tg.type === 'port') tg.tradeCd = t + 30 * MIN;
      else { m.loot.silver = (m.loot.silver || 0) + tg.tier * 2; }
      addLiveReport(state, `🤝 Échange conclu avec ${name} : +${fmt(got)} ${def.currency.icon}.`, t);
      return goBack(m, t);
    }
    case 'deliver': {
      if (tg.type === 'hearth') {
        cur.warmth = Math.min(200, cur.warmth + 10);
        tg.cooldown = t + 30 * MIN;
        bump(cur, 'deliveries'); cur.stats.warmth = Math.max(cur.stats.warmth || 0, cur.warmth);
        const got = earn(state, 120, t, 'brasier', 'peace');
        addLiveReport(state, `🔥 Brasier alimenté : chaleur ${Math.round(cur.warmth)}, +${fmt(got)} ${def.currency.icon}.`, t);
      } else {
        bump(cur, 'deliveries');
        const got = earn(state, 250, t, 'village', 'peace');
        tg.done = true; tg.respawnAt = t + liveCfg(state).respawnMin * MIN * 2;
        addLiveReport(state, `📦 Vivres livrés au village : +${fmt(got)} ${def.currency.icon}.`, t);
      }
      return goBack(m, t);
    }
    case 'solve': {
      const q = RIDDLES[tg.riddle];
      state.pending.push({ id: uid('pd'), kind: 'riddle', targetId: tg.id, marchId: m.id, riddle: tg.riddle, deadline: t + 2 * H, x: tg.x, y: tg.y, t });
      m.phase = 'wait';
      notify(state, '❓', `Vos érudits sont devant une salle scellée : « ${q.q.slice(0, 60)}… »`, t);
      return;
    }
    case 'garrison': {
      const same = eventMarches(state).find((z) => z.targetId === tg.id && z.phase === 'hold' && z.id !== m.id);
      if (same) { for (const [u, n] of Object.entries(m.units)) same.units[u] = (same.units[u] || 0) + n; dropMarch(state, m); if (m.heroId) { const h = state.heroes.find((x) => x.id === m.heroId); if (h) h.marchId = null; } }
      else m.phase = 'hold';
      addLiveReport(state, `🏰 Renforts arrivés à ${name}.`, t);
      return;
    }
    default:
      if (WORK[m.action]) { m.phase = 'work'; m.workEnd = t + WORK[m.action] * MIN; return; }
      return goBack(m, t);
  }
}

function attackTarget(state, m, tg, t, def, name) {
  const L = liveState(state);
  const cur = L.current;
  const c = liveCfg(state);
  if (tg.type === 'boss') return attackBoss(state, m, tg, t, def);
  if (tg.type === 'lair') return attackLair(state, m, tg, t, def);
  const enemies = tg.enemies || scaleEnemies(state, def, tg.type === 'ship' || tg.type === 'caravan' ? tg.type : 'camp', tg.tier);
  const bonusAtk = tg.type === 'ship' && (state.city && Object.values(state.city.buildings).some((b) => b.type === 'port')) ? 0.3 : 0;
  const res = liveBattle(state, m, enemies, t, { tier: tg.tier, label: name, bonusAtk });
  const win = res.winner === 'attacker';
  if (!win) {
    tg.enemies = { ...res.defRemaining };
    addLiveReport(state, `💀 Défaite contre ${name}. Pertes : ${Object.entries(res.attLosses).filter(([, n]) => n).map(([u, n]) => `${n} ${ALL_UNITS[u].name}`).join(', ') || 'aucune'}.`, t, false);
    if (!unitCount(m.units)) return homeLive(state, m, t);
    return goBack(m, t);
  }
  let v = 0;
  const loot = {};
  if (tg.type === 'fortress') { v = 2500; bump(cur, 'fortress'); m.items.push(generateItem({ ilvl: 6 + thLevel(state) * 2, boost: 1.2, min: 'epic' })); }
  else if (tg.type === 'caravan') { v = (300 + 150 * tg.tier) * (tg.spied ? 1.5 : 1); bump(cur, 'caravans'); loot.gold = 400 * tg.tier; loot[tg.cargo === 'armes' ? 'weapons' : tg.cargo === 'chevaux' ? 'leather' : 'cloth'] = 120 * tg.tier; }
  else if (tg.type === 'ship') { v = (400 + 100 * tg.tier) * (tg.spied ? 1.5 : 1); bump(cur, 'ships'); loot.gold = 600 * tg.tier; }
  else if (tg.type === 'horde') { const n = (cur.stats.waves || 0) + (cur.stats.wavesLost || 0); v = 300 + n * 60 + campReward(tg.tier); bump(cur, 'hordes'); bump(cur, 'waves'); }
  else { v = campReward(tg.tier); if (tg.type !== 'pack') bump(cur, 'camps'); else bump(cur, 'packs'); if (tg.tier >= 7) bump(cur, 'tier7'); }
  if (tg.type === 'crypt') cur.wavesWeak = Math.min(0.6, cur.wavesWeak + 0.04);
  const got = earn(state, v, t, name, 'combat');
  Object.assign(m.loot, Object.fromEntries(Object.entries(loot).map(([r, n]) => [r, Math.round(n * thScale(state))])));
  if (rng.chance(0.04 * tg.tier)) m.items.push(generateItem({ ilvl: 3 + tg.tier + thLevel(state), boost: 0.2 * tg.tier, min: tg.tier >= 5 ? 'rare' : 'common' }));
  if (tg.type === 'zone') {
    tg.owned = true; tg.nextCounter = t + 2 * H; tg.enemies = null;
    m.phase = 'hold';
    bump(cur, 'held'); cur.stats.heldMax = Math.max(cur.stats.heldMax || 0, cur.map.targets.filter((z) => z.type === 'zone' && z.owned).length);
    addLiveReport(state, `🚩 ${name} conquise ! +${fmt(got)} ${def.currency.icon}. Vos survivants y tiennent garnison.`, t);
    return;
  }
  tg.done = true;
  tg.respawnAt = t + (tg.type === 'fortress' ? 6 * H : c.respawnMin * MIN);
  addLiveReport(state, `⚔️ ${name} vaincu${tg.type === 'caravan' ? 'e' : ''} ! +${fmt(got)} ${def.currency.icon}.`, t);
  goBack(m, t);
}

function attackBoss(state, m, tg, t, def) {
  const cur = liveState(state).current;
  const b = def.bosses[0];
  if (cur.bossIdx >= b.tiers.length) { addLiveReport(state, `👑 ${b.name} a déjà été vaincu à tous les rangs.`, t); return goBack(m, t); }
  const ph = bossPhase(state, cur, def);
  const res = liveBattle(state, m, { [b.unit]: 1 }, t, { bossHp: cur.bossHp, label: b.name, tier: 3 + cur.bossIdx, enemyMods: ph.enemyMods });
  // Phase « Dernier rempart » : seuls les engins de siège percent vraiment la carapace
  const hasSiege = Object.keys(m.units).some((u) => UNITS[u]?.class === 'siege') || Object.keys(res.attLosses).some((u) => UNITS[u]?.class === 'siege');
  const dmg = Math.min(cur.bossHp, Math.round(res.bossDamage * (ph.dmgMult ? (hasSiege ? ph.dmgMult.siege : ph.dmgMult.other) : 1)));
  cur.bossHp -= dmg;
  bump(cur, 'bossDamage', dmg);
  earn(state, Math.round(dmg / 200), t, `assaut contre ${b.name}`, 'combat');
  let text = `👑 ${fmt(dmg)} dégâts infligés à ${b.name} (rang ${cur.bossIdx + 1}, ${ph.name}).`;
  if (cur.bossHp <= 0) {
    const tier = b.tiers[cur.bossIdx];
    const got = grantGive(state, { ...tier.reward }, t, `${b.name} rang ${cur.bossIdx + 1}`);
    bump(cur, 'bossKills');
    text += ` Il s’effondre ! Récompenses : ${got}.`;
    chronicle(state, `${state.meta.kingdomName} terrasse ${b.name} au rang ${cur.bossIdx + 1}.`, t);
    cur.bossIdx++;
    if (cur.bossIdx < b.tiers.length) {
      cur.bossHp = Math.round(b.tiers[cur.bossIdx].hp * liveCfg(state).bossHpMult);
      notify(state, '👑', `${b.name} revient, plus puissant (rang ${cur.bossIdx + 1}) !`, t);
    } else tg.done = true;
  }
  addLiveReport(state, text, t);
  if (!unitCount(m.units)) return homeLive(state, m, t);
  goBack(m, t);
}

function attackLair(state, m, tg, t, def) {
  const cur = liveState(state).current;
  const co = cur.coop;
  if (!co || co.hp <= 0) { addLiveReport(state, `🐉 ${def.coop.name} est déjà tombé.`, t); return goBack(m, t); }
  const res = liveBattle(state, m, { [def.coop.unit]: 1 }, t, { bossHp: co.hp, label: def.coop.name, tier: 5 });
  const dmg = Math.min(co.hp, res.bossDamage);
  co.hp -= dmg; co.mine += dmg;
  bump(cur, 'coopDamage', dmg);
  const got = earn(state, Math.round(dmg / 150), t, `coups portés à ${def.coop.name}`, 'combat');
  addLiveReport(state, `🐉 ${fmt(dmg)} dégâts à ${def.coop.name} (+${fmt(got)} ${def.currency.icon}). PV restants : ${Math.round((co.hp / co.maxHp) * 100)} %.`, t);
  if (!unitCount(m.units)) return homeLive(state, m, t);
  goBack(m, t);
}

function finishLiveWork(state, m, t) {
  const cur = liveState(state).current;
  if (!cur) return goBack(m, t);
  const def = LIVE_EVENTS[cur.key];
  const tg = liveTarget(state, m.targetId);
  if (!tg || tg.gone) { addLiveReport(state, '↩️ Le site a disparu pendant le travail.', t, false); return goBack(m, t); }
  const name = targetName(cur, tg);
  if (m.action === 'escort') {
    if (rng.chance(0.2)) {
      const res = liveBattle(state, m, scaleEnemies(state, def, 'camp', Math.max(1, tg.tier - 1)), t, { tier: tg.tier, label: 'Embuscade' });
      if (res.winner !== 'attacker') { addLiveReport(state, `🗡️ Embuscade pendant l’escorte : la caravane est perdue.`, t, false); tg.done = true; tg.respawnAt = t + 30 * MIN; return unitCount(m.units) ? goBack(m, t) : homeLive(state, m, t); }
    }
    const got = earn(state, 200 + 80 * tg.tier, t, 'escorte', 'peace');
    bump(cur, 'escorts'); bump(cur, 'caravans');
    m.loot.gold = (m.loot.gold || 0) + 200 * tg.tier;
    addLiveReport(state, `🛡️ Escorte réussie : la caravane vous remercie (+${fmt(got)} ${def.currency.icon}).`, t);
    tg.done = true; tg.respawnAt = t + 30 * MIN;
  } else if (m.action === 'dig') {
    const got = earn(state, rng.int(200, 450), t, 'trésor', 'peace');
    bump(cur, 'treasures');
    const loot = { gold: rng.int(300, 900), gems: rng.int(1, 4) };
    for (const [r, v] of Object.entries(loot)) m.loot[r] = (m.loot[r] || 0) + Math.round(v * thScale(state));
    if (rng.chance(0.25)) m.items.push(generateItem({ ilvl: 4 + thLevel(state) * 2, boost: 0.8, min: 'rare' }));
    addLiveReport(state, `💰 Trésor déterré : +${fmt(got)} ${def.currency.icon}.`, t);
    tg.done = true; tg.respawnAt = t + liveCfg(state).respawnMin * MIN;
  } else if (m.action === 'track') {
    bump(cur, 'traces');
    cur.trackStep++;
    earn(state, 300, t, 'traque', 'peace');
    tg.done = true; tg.gone = true;
    if (cur.trackStep >= 3) {
      const lair = addTarget(state, def, cur, 'lair', null, { tier: 9, now: t, place: { center: tg, ring: [5, 9] } }) || addTarget(state, def, cur, 'lair', null, { tier: 9, now: t });
      if (lair) {
        burnTrail(state, cur, tg, lair);
        notify(state, '🐉', `L’antre de ${def.coop?.name || 'la bête'} est localisé en (${lair.x}, ${lair.y}) ! Tous à l’assaut.`, t);
        addLiveReport(state, `🐾 Dernière piste : l’antre est trouvé !`, t);
      }
    } else {
      const nt = addTarget(state, def, cur, 'trace', null, { now: t, place: { center: tg, ring: [4, 8] } }) || addTarget(state, def, cur, 'trace', null, { now: t });
      if (nt) { burnTrail(state, cur, tg, nt); addLiveReport(state, `🐾 Piste ${cur.trackStep}/3 suivie : de nouvelles traces mènent en (${nt.x}, ${nt.y}).`, t); }
    }
  } else if (m.action === 'mine') {
    const gatherers = Object.entries(m.units).reduce((s, [u, n]) => s + (UNITS[u]?.gather || 0) * n, 0);
    const units = Math.min(tg.amount, Math.max(1, Math.floor(gatherers / 120)));
    tg.amount -= units;
    const got = earn(state, units * 110, t, 'filon', 'peace');
    bump(cur, 'veins');
    m.loot.gold = (m.loot.gold || 0) + units * 250;
    if (rng.chance(0.15)) m.loot.silver = (m.loot.silver || 0) + rng.int(3, 8);
    addLiveReport(state, `⛏️ ${name} : ${units} poche(s) exploitée(s), +${fmt(got)} ${def.currency.icon} (reste ${tg.amount}/${tg.max}).`, t);
    if (tg.amount <= 0) { tg.done = true; tg.gone = true; }
  } else if (m.action === 'harvest') {
    const near = lavaNear(state, cur.map, tg.x, tg.y);
    if (near) {
      let lost = 0;
      for (const u of Object.keys(m.units)) { const l = Math.floor(m.units[u] * 0.15); m.units[u] -= l; lost += l; }
      addLiveReport(state, `🌋 La lave cerne l’évent : ${lost} hommes perdus pendant la récolte.`, t, false);
    }
    const got = earn(state, 110 + rng.int(0, 70), t, 'évent', 'peace');
    bump(cur, 'vents');
    m.loot.crystals = (m.loot.crystals || 0) + rng.int(3, 8);
    m.loot.rareOre = (m.loot.rareOre || 0) + rng.int(2, 6);
    const sh = rollShards(state, 'event', t, { chance: 0.03, amount: [1, 1], label: 'Éclat pris dans l’obsidienne' });
    addLiveReport(state, `🌋 Évent récolté : +${fmt(got)} ${def.currency.icon}${sh ? ' et 💠 un Éclat Ancien !' : ''}.`, t);
    tg.cooldown = t + 3 * H;
  }
  if (!unitCount(m.units)) return homeLive(state, m, t);
  goBack(m, t);
}

// Le dragon laisse des cases brûlées entre deux étapes de sa piste (couche visuelle de la carte du monde)
function burnTrail(state, cur, a, b) {
  if (!a || !b) return;
  const S = state.world.size, burnt = (cur.map.burnt ||= []);
  const n = 3 + (hash32(cur.seed, a.x, a.y) % 3);
  for (let i = 1; i <= n; i++) {
    const f = i / (n + 1), x = Math.round(a.x + (b.x - a.x) * f), y = Math.round(a.y + (b.y - a.y) * f);
    if (x >= 0 && y >= 0 && x < S && y < S && !burnt.includes(y * S + x)) burnt.push(y * S + x);
  }
}

function homeLive(state, m, t) {
  const L = liveState(state);
  for (const [u, n] of Object.entries(m.units)) state.army[u] = (state.army[u] || 0) + n;
  const mods = computeMods(state, t);
  if (Object.keys(m.loot).length) gain(state, m.loot, mods);
  // Action jamais réalisée (rappel avant l'arrivée, cible disparue, fin de l'événement en chemin) : remboursement intégral
  if (m.paid && (m.refund || m.phase === 'out')) { for (const [r, v] of Object.entries(m.paid)) state.resources[r] = (state.resources[r] || 0) + v; m.paid = null; }
  for (const it of m.items) state.inventory.items.push(it);
  const hero = state.heroes.find((h) => h.id === m.heroId);
  if (hero) hero.marchId = null;
  dropMarch(state, m);
  state.pending = state.pending.filter((p) => p.marchId !== m.id);
}

// Énigme (décision en attente)
export function describeRiddle(p) {
  const q = RIDDLES[p.riddle];
  return { icon: '❓', title: 'Salle scellée des Ruines', text: q.q, choices: q.a.map((a) => ({ label: a })), deadline: p.deadline, def: null, coords: `(${p.x}, ${p.y})` };
}
export function resolveRiddle(state, pid, idx, now = Date.now()) {
  const p = state.pending.find((x) => x.id === pid);
  if (!p) return { ok: false };
  state.pending = state.pending.filter((x) => x.id !== pid);
  const L = liveState(state);
  const m = eventMarches(state).find((z) => z.id === p.marchId);
  const tg = liveTarget(state, p.targetId);
  const cur = L.current;
  const q = RIDDLES[p.riddle];
  let text;
  if (cur && tg && idx === q.ok) {
    const def = LIVE_EVENTS[cur.key];
    const got = earn(state, 500, now, 'énigme', 'peace');
    bump(cur, 'riddles');
    tg.done = true; tg.gone = true;
    let extra = '';
    if (rng.chance(0.12)) { shardState(state).relicFragments++; extra = ' Un fragment de relique repose sur l’autel !'; }
    text = `✅ La porte s’ouvre : +${fmt(got)} ${def.currency.icon}.${extra}`;
    addLiveReport(state, text, now);
  } else {
    if (tg) tg.sealedUntil = now + H;
    text = idx === null ? '⌛ Personne n’a répondu : la salle reste scellée.' : '❌ Mauvaise réponse : la salle se scelle pour 1 h.';
    addLiveReport(state, text, now, false);
  }
  if (m) goBack(m, now);
  return { ok: true, text };
}

// ───────────────────────── Lave, brouillard ─────────────────────────
// Lave (Colère du Volcan) : ~35 % des cases du monde autour du volcan, redistribuées chaque heure, jamais sur une cible
function shuffleLava(state, map, r = rng.random) {
  const v = map.volcano, S = state.world.size;
  if (!v) return;
  const prot = new Set(map.targets.filter((t) => !t.gone).map((t) => t.y * S + t.x));
  const lava = [];
  for (let dy = -6; dy <= 6; dy++) for (let dx = -6; dx <= 6; dx++) {
    const x = v.x + dx, y = v.y + dy, d = Math.hypot(dx, dy);
    if (d > 6 || x < 0 || y < 0 || x >= S || y >= S || prot.has(y * S + x)) continue;
    if (d < 1.5 || r() < 0.35 * (1 - d / 8)) lava.push(y * S + x);
  }
  map.lava = lava;
}
export function lavaNear(state, map, x, y) {
  const S = state.world.size;
  let n = 0;
  for (const i of map.lava || []) { const lx = i % S, ly = Math.floor(i / S); if (Math.abs(lx - x) <= 1 && Math.abs(ly - y) <= 1) n++; }
  return n >= 2;
}

// ───────────────────────── Tick (chaque minute de jeu) ─────────────────────────
export function liveTick(state, now) {
  const L = liveState(state);
  ensureCalendar(state, now);
  // Fin de l'événement en cours
  if (L.current && now >= L.current.end) endEvent(state, L.current.end);
  // Début du suivant
  if (!L.current && L.calendar.length && L.calendar[0].start <= now) {
    const slot = L.calendar.shift();
    startEvent(state, slot.key, Math.max(slot.start, now - 12 * H), slot.end);
    ensureCalendar(state, now);
  }
  const cur = L.current;
  if (cur) currentTick(state, cur, now);
  if (L.fading && now >= L.fading.until) L.fading = null;
  syncEventPois(state, now);
  if (L.pendingFair) { L.pendingFair = false; startSurprise(state, 'fair', now); }
  surpriseTick(state, now);
  // Décisions expirées : énigme non résolue, anomalie ignorée (aucun gain sans intervention)
  for (const p of state.pending.filter((x) => (x.kind === 'riddle' || x.kind === 'anomaly') && x.deadline <= now)) {
    if (p.kind === 'riddle') resolveRiddle(state, p.id, null, now);
    else state.pending = state.pending.filter((x) => x.id !== p.id);
  }
  // Rappel de l'événement suivant
  const next = L.calendar[0];
  if (next && !L.current && next.start - now < H && !next.notified) { next.notified = true; notify(state, LIVE_EVENTS[next.key].icon, `« ${LIVE_EVENTS[next.key].name} » commence dans moins d’une heure.`, now); }
}

function currentTick(state, cur, now) {
  const def = LIVE_EVENTS[cur.key];
  const c = liveCfg(state);
  const map = cur.map;
  const dtH = Math.max(0, (now - (cur.lastTick || now)) / H);
  cur.lastTick = now;
  // Notifications : fin proche, boss
  if (!cur.notified.ending && cur.end - now <= 6 * H) { cur.notified.ending = true; notify(state, '⏳', `« ${def.name} » se termine dans 6 h — dépensez vos ${def.currency.name} !`, now); }
  const boss = map.targets.find((t) => t.type === 'boss');
  if (boss?.hidden && now - cur.start >= 6 * H) { boss.hidden = false; notify(state, '👑', `${def.bosses[0].name} est apparu sur la carte de l’événement !`, now); }
  // Réapparitions : même anneau, palier qui monte de 1 toutes les 3 réapparitions du type (plafonné), et jamais plus de
  // EVENT_VISIBLE_MAX cibles en même temps (la carte reste lisible)
  for (const t of map.targets) {
    if (!(t.done && !t.gone && t.respawnAt && t.respawnAt <= now && (RESPAWNING.includes(t.type) || t.type === 'fortress'))) continue;
    if (liveCount(cur) >= EVENT_VISIBLE_MAX) { t.respawnAt = now + 10 * MIN; continue; }
    const spec = def.world.targets.find((z) => z.type === t.type);
    const n = map.respawns[t.type] = (map.respawns[t.type] || 0) + 1;
    const top = spec?.tiers ? spec.tiers[1] : 7;
    const tier = t.type === 'fortress' ? 8 : Math.min(Math.max(top, t.tier), t.tier + (n % 3 === 0 ? 1 : 0));
    t.gone = true;
    addTarget(state, def, cur, t.type, spec?.tiers, { tier: spec?.tiers || t.type === 'fortress' ? tier : null, now });
  }
  map.targets = map.targets.filter((t) => !t.gone);
  moveTargets(state, cur, def, dtH, now);
  threatsTick(state, cur, def, now);
  if (map.frost) map.frost.r = Math.min(map.frost.max, 3 + ((now - cur.start) / (cur.end - cur.start)) * (map.frost.max - 3) * 1.4);
  // Boucle horaire
  if (now >= cur.nextHour) {
    cur.nextHour += H;
    hourly(state, cur, def, now);
  }
  // Vagues (Nuit des Morts)
  if (cur.nextWave && now >= cur.nextWave) { cur.nextWave += (def.special.every || 6) * H; hordeArrives(state, cur, def, now); }
  if (cur.nextWave && !cur.notified['wave' + cur.nextWave] && cur.nextWave - now <= 30 * MIN) { cur.notified['wave' + cur.nextWave] = true; notify(state, '👻', 'Une vague de morts-vivants arrive dans 30 minutes !', now, 'bad'); }
  // Assauts (Siège)
  if (cur.nextAssault && now >= cur.nextAssault) { const th = map.threats.find((x) => x.kind === 'assault'); cur.nextAssault += (def.special.every || 4) * H; resolveAssault(state, cur, def, now, th?.flank); map.threats = map.threats.filter((x) => x !== th); }
  // Boss coopératif : les seigneurs rivaux IA frappent aussi
  if (cur.coop && cur.coop.hp > 0) {
    cur.coop.hp = Math.max(0, cur.coop.hp - cur.coop.maxHp * def.coop.serverRate * dtH * rng.float(0.7, 1.3));
    for (let i = 0; i < def.coop.tiers.length; i++) {
      if (!cur.notified['coop' + i] && coopProgress(cur) >= def.coop.tiers[i]) { cur.notified['coop' + i] = true; notify(state, '🐉', `Les seigneurs (vous et les rivaux IA) ont infligé ${Math.round(def.coop.tiers[i] * 100)} % des dégâts à ${def.coop.name}${cur.coop.mine ? ' : une récompense vous attend' : ''}.`, now); }
    }
  }
  // Stock partagé du marchand : les seigneurs rivaux IA achètent aussi
  for (const it of def.shop.fixed.filter((i) => i.global)) {
    cur.shop.globalSold[it.id] = Math.min(it.global, (cur.shop.globalSold[it.id] || 0) + dtH * 0.06 * c.globalStockSpeed * rng.float(0, 2));
  }
  // Marchand mystère et missions du jour
  rollMystery(state, now);
  rollDaily(state, now);
  // Automatisation : petit revenu passif plafonné
  const working = (state.expeditions || []).filter((e) => e.status === 'work').length;
  if (working) {
    const d = dayKey(now);
    const already = cur.autoEarned[d] || 0;
    const add = Math.min(c.autoCapPerDay - already, working * c.autoPerMin * dtH * 60);
    if (add > 0) { cur.autoEarned[d] = already + add; cur.autoFrac = (cur.autoFrac || 0) + add; const whole = Math.floor(cur.autoFrac); if (whole) { cur.autoFrac -= whole; cur.wallet += whole; cur.earned += whole; bump(cur, 'earned', whole); bump(cur, 'auto', whole); } }
  }
  // Chaleur (Hiver des Géants)
  if (def.special?.hearth) cur.warmth = Math.max(0, cur.warmth - 2 * dtH);
}

const liveCount = (cur) => cur.map.targets.filter((t) => !t.done && !t.gone).length;
const ANY_GROUND = ['plain', 'forest', 'hills', 'river', 'swamp', 'ruins', 'snow', 'ash'];

// Cibles mobiles : caravanes (sur la terre ferme), navires (le long des rivières), hordes (vers leur cible), camps
// nomades (changent de place toutes les 4 h dans leur anneau)
function moveTargets(state, cur, def, dtH, now) {
  const map = cur.map;
  for (const t of map.targets) {
    if (t.done || t.gone) continue;
    if (t.type === 'caravan') walkStep(state, cur, t, 1.4 * dtH, now, ANY_GROUND, 400);
    else if (t.type === 'ship') walkStep(state, cur, t, 2 * dtH, now, ['river'], 18);
    else if (t.type === 'horde') {
      const f = Math.max(0, Math.min(1, (now - t.start) / Math.max(1, t.arrive - t.start)));
      const goal = { x: Math.round(t.from.x + (t.dest.x - t.from.x) * f), y: Math.round(t.from.y + (t.dest.y - t.from.y) * f) };
      // la horde suit sa ligne ; si la case visée est prise (lieu, autre cible), elle se pose sur la plus proche libre
      const ok = (x, y) => tileOk(state, cur, x, y, { self: t.id, gap: 1, allow: [...ANY_GROUND, 'mountain'] });
      if (goal.x !== t.x || goal.y !== t.y) {
        let best = ok(goal.x, goal.y) ? goal : null, bd = Infinity;
        for (let dy = -2; !best && dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { const x = goal.x + dx, y = goal.y + dy, d = Math.hypot(dx, dy); if (d < bd && ok(x, y)) { bd = d; best = { x, y }; } }
        if (best && (best.x !== t.x || best.y !== t.y)) { t.x = best.x; t.y = best.y; }
      }
    } else if (t.nomad && t.moveAt <= now) {
      const p = placeTarget(state, cur, t.type, t.tier, { self: t.id });
      if (p) { t.prev = { x: t.x, y: t.y }; t.x = p.x; t.y = p.y; t.movedAt = now; revealAt(state.world, p.x, p.y, 1); }
      t.moveAt = now + 4 * H;
    }
  }
}
// Une cible mobile avance case par case vers sa destination (sans revenir sur ses pas) en contournant montagnes,
// lieux et autres cibles : caravanes sur la terre ferme, navires le long des rivières. Arrivée (ou voyage trop long) :
// elle quitte la carte et réapparaîtra plus tard.
function walkStep(state, cur, t, step, now, allow, maxSteps) {
  t.walk = (t.walk || 0) + step;
  const trail = (t.trail ||= []);
  while (t.walk >= 1) {
    t.walk -= 1;
    let best = null, bd = Infinity;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const x = t.x + dx, y = t.y + dy;
      if ((!dx && !dy) || trail.includes(`${x},${y}`)) continue;
      if (!tileOk(state, cur, x, y, { self: t.id, gap: 1, allow })) continue;
      const d = Math.hypot(t.dest.x - x, t.dest.y - y);
      if (d < bd) { bd = d; best = { x, y }; }
    }
    t.steps = (t.steps || 0) + 1;
    const there = Math.hypot(t.dest.x - t.x, t.dest.y - t.y) <= 1.5;
    if (!best || there || t.steps > maxSteps) { t.done = true; t.arrived = true; t.respawnAt = now + 20 * MIN; return; }
    trail.push(`${t.x},${t.y}`); if (trail.length > 6) trail.shift();
    t.x = best.x; t.y = best.y;
  }
}

// Menaces visibles sur la carte du monde (traits rouges ou orange avec compte à rebours) : harcèlement d'avant-poste
// par un camp nomade, horde des morts en marche, assaut des Anciens, convoi de prospecteurs rivaux. Interception des
// caravanes du joueur par les repaires corsaires proches de leur route.
function threatsTick(state, cur, def, now) {
  const map = cur.map;
  for (const th of [...map.threats]) {
    if (th.arrive > now || th.kind === 'assault') continue;
    map.threats = map.threats.filter((x) => x !== th);
    if (th.kind === 'harass') harassOutpost(state, cur, def, th, now);
    else if (th.kind === 'rival') {
      const v = liveTarget(state, th.targetId);
      if (!v || v.done || v.gone) continue;
      const working = eventMarches(state).some((m) => m.targetId === v.id && (m.phase === 'work' || (m.phase === 'out' && m.arrive <= th.arrive)));
      if (working) { addLiveReport(state, `🪙 ${th.label} trouvent vos mineurs déjà au travail en (${v.x}, ${v.y}) et repartent bredouilles.`, now); bump(cur, 'raceWon'); }
      else { v.done = true; v.gone = true; addLiveReport(state, `🪙 ${th.label} ont revendiqué le filon en (${v.x}, ${v.y}) avant vous.`, now, false); }
    }
  }
  const terr = state.territories || {};
  // Camps nomades : un avant-poste à moins de 6 cases est harcelé (pillage limité, jamais de destruction)
  if (def.world?.nomads) for (const t of map.targets) {
    if (!t.nomad || t.done || (t.harassAt || 0) > now) continue;
    for (const [k, o] of Object.entries(terr)) {
      if (Math.hypot(o.x - t.x, o.y - t.y) > 6) continue;
      if (map.threats.some((x) => x.kind === 'harass' && x.campId === t.id)) break;
      map.threats.push({ id: uid('th'), kind: 'harass', campId: t.id, from: { x: t.x, y: t.y }, to: { x: o.x, y: o.y, key: k, name: o.name || 'avant-poste' }, start: now, arrive: now + H, label: `${targetName(cur, t)} harcèle ${o.name || 'votre avant-poste'}` });
      notify(state, '🏹', `Des cavaliers nomades se dirigent vers ${o.name || 'votre avant-poste'} (arrivée dans 1 h). Renforcez sa garnison ou abattez le camp.`, now, 'bad');
      t.harassAt = now + 8 * H;
      break;
    }
  }
  // Siège des Anciens : l'armée de l'assaut suivant approche, visible, depuis une direction qui donne le flanc visé
  if (cur.nextAssault && !map.threats.some((x) => x.kind === 'assault')) {
    const r = mulberry32(hash32(cur.seed, 'assault', cur.nextAssault));
    const bastion = map.targets.find((t) => t.type === 'bastion') || state.world.capital;
    const a = r() * Math.PI * 2, c = state.world.capital;
    const dx = Math.cos(a), dy = Math.sin(a);
    const flank = dx < -Math.abs(dy) * 0.5 ? 'left' : dx > Math.abs(dy) * 0.5 ? 'right' : 'front';
    const S = state.world.size;
    const from = { x: Math.max(1, Math.min(S - 2, Math.round(c.x + dx * 15))), y: Math.max(1, Math.min(S - 2, Math.round(c.y + dy * 15))) };
    map.threats.push({ id: uid('th'), kind: 'assault', flank, from, to: { x: bastion.x, y: bastion.y }, start: Math.max(now, cur.nextAssault - 2 * H), arrive: cur.nextAssault, label: `Assaut des Anciens par le ${FLANK_NAME[flank]}` });
  }
  // Nuit des Morts : 3 h avant chaque vague, une horde sort d'une crypte et marche vers la capitale ou un avant-poste
  if (def.world?.hordes && cur.nextWave && cur.nextWave - now <= 3 * H && cur.hordeFor !== cur.nextWave) {
    cur.hordeFor = cur.nextWave;
    const crypts = map.targets.filter((t) => t.type === 'crypt' && !t.gone);
    const bases = eventBases(state);
    const n = (cur.stats.waves || 0) + (cur.stats.wavesLost || 0) + (cur.stats.hordes || 0);
    const dest = bases[n % bases.length];
    const src = crypts.sort((a, b) => Math.hypot(a.x - dest.x, a.y - dest.y) - Math.hypot(b.x - dest.x, b.y - dest.y))[0];
    if (src) {
      const k = (1 + n * 0.25) * thScale(state) * (1 - cur.wavesWeak) * liveCfg(state).enemyMult;
      const enemies = Object.fromEntries(Object.entries(def.enemies.wave).map(([u, v]) => [u, Math.max(1, Math.round(v * k))]));
      const t = { id: uid('lt'), type: 'horde', x: src.x, y: src.y, tier: Math.min(7, 2 + n), done: false, from: { x: src.x, y: src.y }, dest: { x: dest.x, y: dest.y, key: dest.key, name: dest.name }, start: now, arrive: cur.nextWave, enemies, born: now };
      const p = placeTarget(state, cur, 'horde', t.tier, { center: src, ring: [1, 2], allow: [...ANY_GROUND, 'mountain'] });
      if (p) { t.x = p.x; t.y = p.y; t.from = { ...p }; }
      map.targets.push(t);
      notify(state, '💀', `Une horde quitte une crypte en (${t.x}, ${t.y}) et marche sur ${dest.name} : interceptez-la avant ${fmtTime(cur.nextWave - now)} !`, now, 'bad');
    }
  }
  // Corsaires : un repaire à moins de 3 cases de la route d'une de vos caravanes la prend en chasse
  if (def.world?.riverside) for (const cv of state.caravans || []) {
    if (cv.corsair) continue;
    const c = state.world.capital;
    const port = map.targets.find((t) => t.type === 'port' && !t.done && segDist(c, cv, t) <= 3);
    if (!port) continue;
    cv.corsair = port.id; cv.risk = Math.max(cv.risk ?? 0.05, 0.6);
    addLiveReport(state, `🏴‍☠️ ${targetName(cur, port)} guette votre caravane vers ${cv.town} : risque d’abordage élevé (escortez-la ou nettoyez le repaire).`, now, false);
    notify(state, '🏴‍☠️', `Des corsaires guettent votre caravane vers ${cv.town}.`, now, 'bad');
  }
}
const FLANK_NAME = { left: 'flanc gauche', front: 'front (porte)', right: 'flanc droit' };
// Distance d'un point au segment a → b
function segDist(a, b, p) {
  const vx = b.x - a.x, vy = b.y - a.y, L2 = vx * vx + vy * vy || 1;
  const f = Math.max(0, Math.min(1, ((p.x - a.x) * vx + (p.y - a.y) * vy) / L2));
  return Math.hypot(a.x + vx * f - p.x, a.y + vy * f - p.y);
}
// Harcèlement : la garnison de l'avant-poste se bat ; en cas d'échec, un petit pillage (3 % or et nourriture)
function harassOutpost(state, cur, def, th, now) {
  const camp = liveTarget(state, th.campId);
  const o = state.territories?.[th.to.key];
  if (!o || !camp || camp.done) { addLiveReport(state, `🏹 Le harcèlement de ${th.to.name} n’a pas eu lieu : le camp a été dispersé.`, now); return; }
  const raiders = Object.fromEntries(Object.entries(camp.enemies || {}).map(([u, n]) => [u, Math.max(1, Math.round(n * 0.5))]));
  const gar = Object.fromEntries(Object.entries(o.garrison || {}).filter(([, n]) => n > 0));
  let win = false;
  if (Object.keys(gar).length) {
    const res = simulateBattle({ units: raiders, mods: { 'combat.atk': 0.04 * camp.tier }, label: 'Cavaliers' }, { units: gar, mods: computeMods(state, now), fort: 0.2, label: 'Garnison' }, { terrain: wTerrain(state.world, o.x, o.y) || 'plain', weather: state.weather.type });
    for (const [u, lost] of Object.entries(res.defLosses)) if (o.garrison[u]) o.garrison[u] = Math.max(0, o.garrison[u] - Math.ceil(lost / 2));
    win = res.winner === 'defender';
  }
  if (win) { bump(cur, 'defended'); const got = earn(state, 80 + 30 * camp.tier, now, 'harcèlement repoussé', 'combat'); addLiveReport(state, `🛡️ La garnison de ${th.to.name} repousse les cavaliers (+${fmt(got)} ${def.currency.icon}).`, now); return; }
  const lost = {};
  for (const r of ['food', 'gold']) { const v = Math.floor((state.resources[r] || 0) * 0.03); if (v) { lost[r] = v; state.resources[r] -= v; } }
  recordLoss(state, 'raid', lost, now);
  addLiveReport(state, `🏹 Les cavaliers pillent les abords de ${th.to.name} : ${Object.entries(lost).map(([r, v]) => `${fmt(v)} ${RESOURCES[r].icon}`).join(' ') || 'rien à prendre'}.`, now, false);
  notify(state, '🏹', `${th.to.name} a été harcelé par les nomades.`, now, 'bad');
}
// Arrivée de la horde (Nuit des Morts) : interceptée en chemin → rien ; sinon la vague frappe sa cible
function hordeArrives(state, cur, def, now) {
  const h = cur.map.targets.find((t) => t.type === 'horde' && !t.gone);
  if (!h || h.done) {
    if (h) h.gone = true;
    addLiveReport(state, '💀 La horde a été taillée en pièces avant d’atteindre vos terres : aucune vague cette nuit.', now);
    return;
  }
  h.gone = true;
  if (!h.dest || h.dest.key === 'capital') return resolveWave(state, cur, def, now);
  const o = state.territories?.[h.dest.key];
  if (!o) return resolveWave(state, cur, def, now);
  harassOutpost(state, cur, def, { campId: h.id, to: { key: h.dest.key, name: h.dest.name } }, now);
}

function hourly(state, cur, def, now) {
  const map = cur.map;
  if (def.special?.zones) {
    for (const z of map.targets.filter((t) => t.type === 'zone' && t.owned)) {
      earn(state, 40 * z.tier, now, 'régions tenues', 'combat');
      if (z.nextCounter && now >= z.nextCounter) {
        z.nextCounter = now + 2 * H;
        const m = eventMarches(state).find((x) => x.targetId === z.id && x.phase === 'hold');
        if (!m) { z.owned = false; z.enemies = scaleEnemies(state, def, 'zone', z.tier); continue; }
        const res = liveBattle(state, m, scaleEnemies(state, def, 'zone', Math.max(1, z.tier - 1)), now, { tier: z.tier, label: 'Contre-attaque' });
        if (res.winner === 'attacker') { bump(cur, 'defended'); addLiveReport(state, `🛡️ Contre-attaque repoussée sur ${targetName(cur, z)}.`, now); }
        else { z.owned = false; z.enemies = scaleEnemies(state, def, 'zone', z.tier); addLiveReport(state, `🚩 ${targetName(cur, z)} est perdue face à la contre-attaque.`, now, false); notify(state, '🚩', `Une de vos régions est tombée (${targetName(cur, z)}).`, now, 'bad'); if (unitCount(m.units)) goBack(m, now); else homeLive(state, m, now); }
      }
    }
  }
  if (def.special?.veins) {
    // Les prospecteurs rivaux revendiquent un filon libre ; de nouveaux filons affleurent
    // v25 : une course visible — un convoi de prospecteurs rivaux part vers un filon libre ; s'il arrive avant vous (ou
    // si personne n'y travaille à son arrivée), le filon est perdu
    const chased = new Set(map.threats.filter((x) => x.kind === 'rival').map((x) => x.targetId));
    const free = map.targets.filter((t) => t.type === 'vein' && !t.done && !chased.has(t.id) && !eventMarches(state).some((m) => m.targetId === t.id));
    if (free.length && rng.chance(0.7)) {
      const v = rng.pick(free);
      const ks = Object.values(state.world.pois).filter((p) => p.type === 'kingdom' || p.type === 'town');
      const src = ks.sort((a, b) => Math.hypot(a.x - v.x, a.y - v.y) - Math.hypot(b.x - v.x, b.y - v.y))[0] || { x: v.x + 12, y: v.y, name: 'des terres lointaines' };
      map.threats.push({ id: uid('th'), kind: 'rival', targetId: v.id, from: { x: src.x, y: src.y, name: src.name }, to: { x: v.x, y: v.y }, start: now, arrive: now + rng.int(60, 120) * MIN, label: `Prospecteurs rivaux de ${src.name || 'l’ouest'}` });
    }
    if (map.targets.filter((t) => t.type === 'vein' && !t.gone).length < 10 && rng.chance(0.8)) addTarget(state, def, cur, 'vein', null, { now });
  }
  if (def.special?.lava) {
    shuffleLava(state, map);
    // Avant-postes à moins de 4 cases d'une coulée : production −30 % pendant 2 h (jamais de destruction)
    const S = state.world.size;
    for (const o of Object.values(state.territories || {})) {
      const hot = map.lava.some((i) => Math.max(Math.abs((i % S) - o.x), Math.abs(Math.floor(i / S) - o.y)) <= 4);
      if (!hot) continue;
      if (!(o.lavaUntil > now)) notify(state, '🌋', `La lave menace ${o.name || 'votre avant-poste'} : production réduite tant que les coulées sont proches.`, now, 'bad');
      o.lavaUntil = now + 2 * H;
    }
  }
}

function resolveWave(state, cur, def, now) {
  const mods = computeMods(state, now);
  const n = (cur.stats.waves || 0) + (cur.stats.wavesLost || 0);
  const k = (1 + n * 0.25) * thScale(state) * (1 - cur.wavesWeak) * liveCfg(state).enemyMult;
  const wave = Object.fromEntries(Object.entries(def.enemies.wave).map(([u, v]) => [u, Math.max(1, Math.round(v * k))]));
  const defenders = { ...state.army }; delete defenders.scout; delete defenders.spy;
  const any = Object.values(defenders).some((v) => v > 0);
  const fortBonus = (mods['wall.bonus'] || 0) * (1 + (mods['wall.pct'] || 0));
  const res = simulateBattle(
    { units: wave, mods: { 'combat.atk': 0.05 }, formation: 'assault', label: 'Morts-vivants' },
    { units: any ? defenders : { militia: 5 }, mods: { ...mods, 'combat.def': (mods['combat.def'] || 0) + (mods['city.def'] || 0) + (cur.fires ? 0.2 : 0) }, fort: fortBonus, formation: 'shieldwall', label: 'Garnison' },
    { terrain: 'city', weather: state.weather.type },
  );
  // Les blessés guérissent : seule la moitié des pertes est définitive
  if (any) for (const [u, lost] of Object.entries(res.defLosses)) if (state.army[u]) state.army[u] = Math.max(0, state.army[u] - Math.ceil(lost / 2));
  cur.fires = false;
  cur.wavesWeak = 0;
  if (res.winner === 'defender') {
    bump(cur, 'waves');
    const got = earn(state, 300 + n * 60, now, 'vague repoussée', 'combat');
    addLiveReport(state, `👻 Vague ${n + 1} repoussée ! +${fmt(got)} ${def.currency.icon}.`, now);
    notify(state, '👻', `Vague ${n + 1} repoussée ! +${fmt(got)} ${def.currency.icon}`, now, 'good');
  } else {
    bump(cur, 'wavesLost');
    const lost = {};
    for (const r of ['food', 'gold']) { const v = Math.floor((state.resources[r] || 0) * 0.08); if (v) { lost[r] = v; state.resources[r] -= v; } }
    recordLoss(state, 'wave', lost, now);
    addLiveReport(state, `💀 La vague ${n + 1} submerge vos défenses : ${Object.entries(lost).map(([r, v]) => `${fmt(v)} ${RESOURCES[r].icon}`).join(' ')} perdus.`, now, false);
    notify(state, '💀', `La vague ${n + 1} a submergé votre ville.`, now, 'bad');
  }
}

export function lightFires(state) {
  const cur = liveState(state).current;
  if (!cur || !LIVE_EVENTS[cur.key].special?.waves) return { ok: false, reason: 'Pas de vague à repousser dans cet événement' };
  if (cur.fires) return { ok: false, reason: 'Les feux brûlent déjà' };
  if (!pay(state, { herbs: 200 })) return { ok: false, reason: 'Il faut 200 herbes' };
  cur.fires = true;
  return { ok: true };
}

function resolveAssault(state, cur, def, now, flank = null) {
  const m = eventMarches(state).find((x) => x.phase === 'hold' && liveTarget(state, x.targetId)?.type === 'bastion');
  const n = cur.stats.assaultsSeen = (cur.stats.assaultsSeen || 0) + 1;
  let dmg = rng.int(2, 7);
  if (m) {
    const k = (0.4 + n * 0.08) * thScale(state) * liveCfg(state).enemyMult;
    const enemies = Object.fromEntries(Object.entries(def.enemies.assault).map(([u, v]) => [u, Math.max(1, Math.round(v * k))]));
    // v25 : l'assaut arrive par un flanc visible sur la carte ; un château qui y a massé ses défenseurs (siège v19)
    // soutient la garnison de la Citadelle (+20 % de défense au plus, −10 % si ce flanc est dégarni)
    const bonusDef = flank ? Math.max(-0.1, Math.min(0.2, (flankShare(state, flank) - 0.25) * 0.8)) : 0;
    const res = liveBattle(state, m, enemies, now, { tier: 3, label: flank ? `Assaut (${FLANK_NAME[flank]})` : 'Assaut', bonusDef });
    const killed = Object.values(res.defLosses).reduce((a, b) => a + b, 0);
    bump(cur, 'assaults');
    const got = earn(state, 200 + killed * 4, now, 'défense de la Citadelle', 'combat');
    if (res.winner === 'attacker') dmg = Math.max(0, dmg - 2);
    addLiveReport(state, `🏰 Assaut ${n} : votre garnison abat ${killed} assaillants (+${fmt(got)} ${def.currency.icon}).`, now, res.winner === 'attacker');
    if (!unitCount(m.units)) homeLive(state, m, now);
  }
  cur.citadel = Math.max(0, cur.citadel - dmg);
  if (cur.citadel <= 0 && !cur.notified.fallen) { cur.notified.fallen = true; notify(state, '🏰', 'La Citadelle des Anciens est tombée…', now, 'bad'); }
}

export const coopProgress = (cur) => (cur.coop ? 1 - cur.coop.hp / cur.coop.maxHp : 0);

// ───────────────────────── Objectifs, passe, classement, guilde ─────────────────────────
export function objectives(state) {
  const cur = liveState(state).current;
  if (!cur) return [];
  return LIVE_EVENTS[cur.key].objectives.map((o) => ({ ...o, value: Math.floor(cur.stats[o.stat] || 0), done: (cur.stats[o.stat] || 0) >= o.target, claimed: !!cur.claimed[o.id] }));
}
export function claimObjective(state, id, now = Date.now()) {
  const cur = liveState(state).current;
  const o = objectives(state).find((x) => x.id === id);
  if (!o || !o.done || o.claimed) return { ok: false, reason: 'Objectif non atteint' };
  cur.claimed[id] = now;
  return { ok: true, text: grantGive(state, o.reward, now, o.label) };
}

// v25 : points par palier de passe ajustés par événement (passScale) : sur les vrais trajets du monde, certains
// événements rapportent moins par heure (vagues, assauts, régions tenues) ; mesuré par tools/eventSim.js pour qu'un
// joueur moyen (une visite toutes les 2 h en journée) finisse la passe en 72 h. Les récompenses ne changent pas.
export const passDef = (def) => { const p = def.pass || rewardsPass(def.currency.key); return def.passScale ? { ...p, per: Math.round(p.per * def.passScale) } : p; };
export function passInfo(state) {
  const cur = liveState(state).current;
  if (!cur) return null;
  const p = passDef(LIVE_EVENTS[cur.key]);
  const level = Math.min(20, Math.floor(cur.earned / p.per));
  return { level, per: p.per, progress: (cur.earned % p.per) / p.per, levels: Object.entries(p.levels).map(([l, r]) => ({ level: +l, reward: r, claimed: !!cur.passClaimed[l], ready: level >= +l })) };
}
export function claimPass(state, level, now = Date.now()) {
  const cur = liveState(state).current;
  const info = passInfo(state);
  const l = info?.levels.find((x) => x.level === +level);
  if (!l || !l.ready || l.claimed) return { ok: false, reason: 'Niveau non atteint' };
  cur.passClaimed[level] = now;
  return { ok: true, text: grantGive(state, l.reward, now, `Passe niveau ${level}`) };
}

// Classement simulé : les autres seigneurs gagnent la monnaie à leur propre rythme
export function leaderboard(state, now = Date.now()) {
  const cur = liveState(state).current;
  if (!cur) return null;
  const c = liveCfg(state);
  const r = mulberry32(cur.lbSeed);
  const hrs = Math.max(0, (Math.min(now, cur.end) - cur.start) / H);
  const names = ['Ysolde', 'Baudouin', 'Mahaut', 'Thibaut', 'Aliénor', 'Gauvain', 'Héloïse', 'Enguerrand', 'Bérangère', 'Tancrède', 'Mélisende', 'Godefroy', 'Ermengarde', 'Perceval', 'Clothilde', 'Roland'];
  const others = [];
  for (let i = 0; i < c.lbSize - 1; i++) {
    const u1 = r() || 1e-9, u2 = r();
    const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    const rate = 95 * Math.exp(0.85 * z); // monnaie / heure
    const ramp = Math.min(1, hrs / 6);
    others.push({ name: `${names[i % names.length]} ${['de Valmont', 'le Rouge', 'd’Aubrac', 'la Sage', 'le Hardi', 'de Brume'][Math.floor(r() * 6)]}`, score: Math.round(rate * hrs * (0.7 + 0.3 * ramp)) });
  }
  const me = { name: `${state.meta.lordName} (${state.meta.kingdomName})`, score: Math.round(cur.earned), me: true };
  const all = [...others, me].sort((a, b) => b.score - a.score);
  const rank = all.indexOf(me) + 1;
  return { rank, size: all.length, top: all.slice(0, 10), around: all.slice(Math.max(0, rank - 3), rank + 2).map((x) => ({ ...x, rank: all.indexOf(x) + 1 })), rewards: LB_REWARDS };
}
export function lbRewardFor(rank) {
  const k = Object.keys(LB_REWARDS).map(Number).sort((a, b) => a - b).find((x) => rank <= x);
  return k ? LB_REWARDS[k] : null;
}

export function guildInfo(state, now = Date.now()) {
  const cur = liveState(state).current;
  if (!cur || !state.guild) return null;
  const g = LIVE_EVENTS[cur.key].guild;
  const elapsed = Math.max(0, Math.min(1, (now - cur.start) / (cur.end - cur.start)));
  const r = mulberry32(cur.seed ^ 0x9111d);
  const pace = 0.75 + r() * 0.5; // certaines guildes y arrivent, d'autres non
  const mates = Math.floor(g.target * pace * Math.min(1, elapsed * 1.25));
  const mine = Math.floor(cur.stats[g.stat] || 0);
  const value = mates + mine;
  return { ...g, value, mine, done: value >= g.target, claimed: cur.guildClaimed };
}
export function claimGuild(state, now = Date.now()) {
  const gi = guildInfo(state, now);
  if (!gi || !gi.done || gi.claimed) return { ok: false, reason: 'Objectif de guilde non atteint' };
  if (!gi.mine) return { ok: false, reason: 'Vous n’avez pas contribué' };
  liveState(state).current.guildClaimed = true;
  return { ok: true, text: grantGive(state, gi.reward, now, 'Objectif de guilde') };
}

export function claimCoop(state, i, now = Date.now()) {
  const cur = liveState(state).current;
  const def = cur && LIVE_EVENTS[cur.key];
  if (!cur?.coop || cur.coopClaimed[i] || coopProgress(cur) < def.coop.tiers[i]) return { ok: false, reason: 'Palier non atteint' };
  if (!cur.coop.mine) return { ok: false, reason: 'Participez à l’assaut pour recevoir les récompenses' };
  cur.coopClaimed[i] = true;
  return { ok: true, text: grantGive(state, def.coop.rewards[i], now, `${def.coop.name} — palier ${i + 1}`) };
}

// ───────────────────────── Fin d'événement ─────────────────────────
export function endEvent(state, now = Date.now()) {
  const L = liveState(state);
  const cur = L.current;
  if (!cur) return null;
  const def = LIVE_EVENTS[cur.key];
  const rewards = [];
  // Rappel des troupes
  for (const m of eventMarches(state)) homeLive(state, m, now);
  state.pending = state.pending.filter((p) => p.kind !== 'riddle');
  // Récompenses non réclamées : objectifs et passe sont versés automatiquement
  for (const o of objectives(state)) if (o.done && !o.claimed) rewards.push(claimObjective(state, o.id, now).text);
  dailyMissions(state).forEach((d, i) => { if (d.done && !d.claimed) rewards.push(claimDaily(state, i, now).text); });
  const ch = challengeInfo(state);
  if (ch?.done && !ch.claimed) rewards.push(claimChallenge(state, now).text);
  if (cur.earned >= 500) rewards.push(`Participation : ${grantGive(state, { chest: 'rare', insignia: 2 }, now, 'Participation')}`);
  if (cur.coop?.mine) def.coop.tiers.forEach((tr, i) => { if (!cur.coopClaimed[i] && coopProgress(cur) >= tr) rewards.push(claimCoop(state, i, now).text); });
  if (def.special?.siege && cur.citadel > 0 && (cur.stats.assaults || 0) > 0) {
    rewards.push(grantGive(state, { [def.currency.key]: 1500 + 200 * cur.stats.assaults, chest: 'epic' }, now, 'Citadelle tenue'));
    if (cur.stats.assaults >= 6) { addShards(state, 2, 'event', now, 'Défenseur de la Citadelle'); rewards.push('💠 2 Éclats Anciens'); }
  }
  // Passe : versé EN DERNIER et jusqu'à stabilité (les récompenses ci-dessus peuvent ajouter de la monnaie et
  // débloquer de nouveaux paliers, eux-mêmes porteurs de monnaie)
  for (let guard = 0, more = true; more && guard < 25; guard++) {
    more = false;
    for (const l of passInfo(state).levels) if (l.ready && !l.claimed) { rewards.push(claimPass(state, l.level, now).text); more = true; }
  }
  // Classement
  const lb = leaderboard(state, now);
  const lbr = lbRewardFor(lb.rank);
  if (lbr && cur.earned > 0) {
    const g = { ...lbr };
    if (g.deco) { const d = def.shop.fixed.find((i) => i.give.deco); delete g.deco; if (d) g.deco = d.give.deco; }
    if (g.title) g.title = `${g.title} — ${def.name}`;
    rewards.push(grantGive(state, g, now, 'Classement'));
  }
  // Conversion de la monnaie restante
  const left = Math.floor(cur.wallet);
  const conv = def.currency.convert;
  const amount = Math.floor(left / conv.per) * conv.amount;
  if (amount > 0) gain(state, { [conv.res]: amount }, computeMods(state, now));
  const report = {
    key: cur.key, name: def.name, icon: def.icon, start: cur.start, end: now, rank: lb.rank, of: lb.size,
    camps: cur.stats.camps || 0, earned: Math.round(cur.earned), left, converted: amount ? `${fmt(amount)} ${RESOURCES[conv.res].icon}` : 'rien',
    rewards: rewards.filter(Boolean), best: cur.best, bossTier: cur.bossIdx, stats: { ...cur.stats },
  };
  L.reports.unshift(report);
  if (L.reports.length > 12) L.reports.length = 12;
  L.unseenReport = report;
  L.history.push(cur.key);
  if (L.history.length > 20) L.history.shift();
  const T = liveTotals(state);
  T.events = (T.events || 0) + 1;
  T.bestRank = Math.min(T.bestRank || Infinity, lb.rank);
  T.bestScore = Math.max(T.bestScore || 0, report.earned);
  report.aftermath = applyAftermath(state, cur, def, now);
  // v25 : les cibles restantes quittent la carte avec une courte animation (bannière qui tombe, campement levé)
  L.fading = { until: now + 20 * MIN, eventKey: cur.key, color: def.color, items: cur.map.targets.filter((t) => !t.gone && !t.fog).slice(0, EVENT_VISIBLE_MAX).map((t) => ({ id: t.id, x: t.x, y: t.y, kind: t.type, tier: t.tier })) };
  L.current = null;
  syncEventPois(state, now);
  chronicle(state, `Fin de « ${def.name} » : ${state.meta.kingdomName} termine ${lb.rank}e sur ${lb.size} avec ${fmt(report.earned)} ${def.currency.name}.`, now, 'event', `eventEnd:${cur.key}:${cur.start}`);
  notify(state, '📜', `« ${def.name} » est terminé : vous êtes ${lb.rank}e. ${left ? `${fmt(left)} ${def.currency.icon} convertis en ${report.converted}.` : ''}`, now);
  return report;
}

// ───────────────────────── Événements surprises ─────────────────────────
export function activeSurprises(state, now = Date.now()) { return (liveState(state).surprises || []).filter((s) => s.end > now); }

function surpriseTick(state, now) {
  const L = liveState(state);
  L.surprises = (L.surprises || []).filter((s) => s.end > now);
  // La Grande Foire, annoncée, revient chaque semaine
  if (L.nextFair && now >= L.nextFair) { startSurprise(state, 'fair', now); L.nextFair += SURPRISE_EVENTS.fair.everyDays * DAY; }
  // Météorite : le premier à y récolter trouve l'Éclat pris dans la roche
  for (const sp of L.surprises.filter((x) => x.key === 'meteor' && x.x !== undefined)) {
    const p = state.world.pois[`${sp.x},${sp.y}`] || Object.values(state.world.pois).find((q) => q.x === sp.x && q.y === sp.y);
    if (p?.shard && state.marches.some((m) => m.type === 'gather' && m.x === sp.x && m.y === sp.y && m.phase === 'work')) {
      p.shard = false;
      addShards(state, 1, 'event', now, 'Cœur de météorite');
      notify(state, '☄️', 'Vos récolteurs ont trouvé un Éclat Ancien au cœur de la météorite !', now, 'good');
    } else if (p?.shard && now - sp.start > 2 * H && rng.chance(0.02)) { p.shard = false; addLiveNote(state, sp); }
  }
  if (now < (L.nextSurprise || 0)) return;
  L.nextSurprise = now + H;
  const tags = L.current ? LIVE_EVENTS[L.current.key].tags : [];
  const mult = liveCfg(state).surpriseMult;
  for (const [k, s] of Object.entries(SURPRISE_EVENTS)) {
    if (!s.chancePerDay || L.surprises.some((x) => x.key === k)) continue;
    if (s.incompatible.some((t) => tags.includes(t))) continue;
    if (rng.chance((s.chancePerDay / 24) * mult)) startSurprise(state, k, now);
  }
}

function addLiveNote(state, sp) { log(state, 'info', `☄️ Un seigneur rival (IA) a extrait l’Éclat de la météorite en (${sp.x}, ${sp.y}) avant vous.`, sp.start); }

export function startSurprise(state, k, now = Date.now()) {
  const L = liveState(state);
  const s = SURPRISE_EVENTS[k];
  const sp = { key: k, start: now, end: now + s.hours * H };
  if (k === 'meteor') {
    const w = state.world;
    let pos = null;
    for (let i = 0; i < 20 && !pos; i++) { const a = rng.float(0, Math.PI * 2), d = rng.float(5, 11); pos = findFreeTile(w, Math.round(w.capital.x + Math.cos(a) * d), Math.round(w.capital.y + Math.sin(a) * d), null, 2); }
    // Repli : environs de la capitale très encombrés → recherche plus large (la météorite ne doit jamais manquer)
    pos ||= findFreeTile(w, w.capital.x + 7, w.capital.y, null, 12);
    if (pos) {
      const p = spawnPoi(w, 'rareVein', pos.x, pos.y, { danger: 3 });
      p.expires = sp.end; p.temp = true; p.event = 'meteor'; p.meteor = true; p.amount = p.max = Math.round(p.max * 1.5);
      reveal(w, pos.x, pos.y, 1);
      sp.x = pos.x; sp.y = pos.y;
      // Un Éclat Ancien est parfois pris dans la roche : il revient au premier qui arrive (vous ?)
      if (rng.chance(0.35)) p.shard = true;
    }
  }
  if (k === 'wanderingDragon') { if (state.boss) return null; spawnBoss(state, 'dragon', now); if (state.boss) state.boss.until = sp.end; }
  L.surprises.push(sp);
  notify(state, s.icon, `${s.name} ! ${s.desc}`, now);
  log(state, 'event', `${s.icon} ${s.name} : ${s.desc}`, now);
  return sp;
}

export function fairOffers(state, now = Date.now()) {
  const sp = activeSurprises(state, now).find((s) => s.key === 'fair');
  if (!sp) return null;
  return FAIR_OFFERS.map((o) => ({ ...o, used: !!(sp.used || {})[o.id] }));
}
export function buyFair(state, id, now = Date.now()) {
  const sp = activeSurprises(state, now).find((s) => s.key === 'fair');
  const o = FAIR_OFFERS.find((x) => x.id === id);
  if (!sp || !o) return { ok: false, reason: 'La foire est terminée' };
  if ((sp.used ||= {})[id]) return { ok: false, reason: 'Déjà échangé' };
  // Entrepôt plein : on refuse AVANT de payer (sinon la marchandise serait perdue)
  const mods0 = computeMods(state, now);
  for (const [r, v] of Object.entries(o.get)) if (RESOURCES[r] && isCapped(r) && (state.resources[r] || 0) + v > storageCap(state, mods0, r) * 1.5) return { ok: false, reason: `Entrepôt plein pour ${RESOURCES[r].name.toLowerCase()} : faites de la place avant l’échange` };
  if (!pay(state, o.pay)) return { ok: false, reason: 'Ressources insuffisantes' };
  sp.used[id] = true;
  const get = { ...o.get };
  let text = '';
  if (get.chest) { text = grantGive(state, { chest: get.chest }, now, 'Grande Foire'); delete get.chest; }
  gain(state, get, computeMods(state, now));
  return { ok: true, text: text || o.label };
}

// ───────────────────────── Administration ─────────────────────────
export function adminStart(state, key, now = Date.now()) {
  const L = liveState(state);
  if (L.current) endEvent(state, now);
  L.calendar = [];
  const cur = startEvent(state, key, now);
  ensureCalendar(state, now);
  return { ok: true, cur };
}
export function adminEnd(state, now = Date.now()) {
  const L = liveState(state);
  if (!L.current) return { ok: false };
  const rep = endEvent(state, now);
  L.calendar = [];
  ensureCalendar(state, now);
  return { ok: true, rep };
}
export function adminCurrency(state, n) {
  const cur = liveState(state).current;
  if (!cur) return { ok: false };
  cur.wallet += n; cur.earned += n;
  return { ok: true };
}
export function adminReroll(state, now = Date.now()) {
  const L = liveState(state);
  L.calendar = [];
  ensureCalendar(state, now);
  return { ok: true };
}

// ───────── Phases de boss ─────────
// Chaque rang du boss se joue en trois phases selon ses PV restants : préparez l'armée en conséquence.
export function bossPhase(state, cur, def) {
  const b = def.bosses?.[0];
  const tier = b?.tiers[cur.bossIdx];
  if (!tier) return { n: 0, name: '—' };
  const frac = cur.bossHp / Math.round(tier.hp * liveCfg(state).bossHpMult);
  if (frac > 0.66) return { n: 1, name: 'Phase 1 : Assaut', desc: 'Le boss se bat normalement.' };
  if (frac > 0.33) return { n: 2, name: 'Phase 2 : Enragé', desc: 'Attaque du boss +30 % : envoyez des troupes solides (lanciers, infanterie lourde).', enemyMods: { 'combat.atk': 0.3 } };
  return { n: 3, name: 'Phase 3 : Dernier rempart', desc: 'Carapace : dégâts −40 %, sauf avec des engins de siège (+15 %).', dmgMult: { other: 0.6, siege: 1.15 } };
}

// ───────── Stratégie d'événement ─────────
export function setStance(state, key, now = Date.now()) {
  const cur = liveState(state).current;
  if (!cur) return { ok: false, reason: 'Aucun événement en cours' };
  if (!EVENT_STANCES[key]) return { ok: false, reason: 'Stratégie inconnue' };
  if ((cur.stance || 'balanced') === key) return { ok: false, reason: 'Déjà adoptée' };
  if (cur.stanceDay === dayKey(now)) return { ok: false, reason: 'Une seule décision de stratégie par jour' };
  cur.stance = key; cur.stanceDay = dayKey(now);
  return { ok: true };
}

// ───────── Missions du jour ─────────
export function rollDaily(state, now = Date.now()) {
  const cur = liveState(state).current;
  if (!cur) return;
  const d = dayKey(now);
  if (cur.daily?.day === d) return;
  // Les missions non réclamées de la veille sont versées automatiquement
  if (cur.daily) dailyMissions(state).forEach((m, i) => { if (m.done && !m.claimed) claimDaily(state, i, now); });
  const def = LIVE_EVENTS[cur.key];
  const stats = new Set(['earned', ...def.objectives.map((o) => o.stat), ...(def.bosses?.length ? ['bossDamage'] : []), ...(def.coop ? ['coopDamage'] : []), ...(def.special?.caravans ? ['caravans', 'escorts', 'trades'] : [])]);
  const pool = [...stats].filter((k) => DAILY_TEMPLATES[k]);
  const r = mulberry32(cur.seed ^ d);
  const picks = [];
  while (picks.length < Math.min(3, pool.length)) { const k = pool.splice(Math.floor(r() * pool.length), 1)[0]; picks.push(k); }
  const scale = 0.8 + Math.min(1.2, thLevel(state) * 0.08);
  cur.daily = { day: d, base: { ...cur.stats }, missions: picks.map((k, i) => { const T = DAILY_TEMPLATES[k]; const target = Math.max(1, Math.round(T.per * (k.endsWith('Damage') || k === 'earned' ? scale : 1))); return { id: `${d}_${i}`, stat: k, target, label: T.label(target), reward: T.reward, claimed: false }; }) };
}
export function dailyMissions(state) {
  const cur = liveState(state).current;
  if (!cur?.daily) return [];
  return cur.daily.missions.map((m) => { const value = Math.floor((cur.stats[m.stat] || 0) - (cur.daily.base[m.stat] || 0)); return { ...m, value, done: value >= m.target }; });
}
export function claimDaily(state, i, now = Date.now()) {
  const cur = liveState(state).current;
  const m = dailyMissions(state)[i];
  if (!m || !m.done || m.claimed) return { ok: false, reason: 'Mission non accomplie' };
  cur.daily.missions[i].claimed = true;
  return { ok: true, text: grantGive(state, { [LIVE_EVENTS[cur.key].currency.key]: m.reward }, now, 'Mission du jour') };
}

// ───────── Défi héroïque ─────────
export function challengeInfo(state) {
  const cur = liveState(state).current;
  if (!cur) return null;
  const def = LIVE_EVENTS[cur.key];
  let c;
  if (def.bosses?.length) c = { label: `Vaincre ${def.bosses[0].name} au rang III`, value: cur.bossIdx, target: 3 };
  else if (def.coop) c = { label: `Infliger 150 000 dégâts à ${def.coop.name}`, value: Math.floor(cur.coop?.mine || 0), target: 150000 };
  else c = { label: 'Gagner 25 000 de monnaie d’événement', value: Math.floor(cur.earned), target: 25000 };
  return { ...c, done: c.value >= c.target, claimed: !!cur.challengeClaimed, reward: { legendaryFragments: 10, relicFragments: 1, title: `Héros — ${def.name}` } };
}
export function claimChallenge(state, now = Date.now()) {
  const c = challengeInfo(state);
  if (!c || !c.done || c.claimed) return { ok: false, reason: 'Défi non relevé' };
  liveState(state).current.challengeClaimed = true;
  return { ok: true, text: grantGive(state, c.reward, now, 'Défi héroïque') };
}

// Conséquences après la fin d'un événement (data/aftermath.js) : appliquées une seule fois par occurrence
// (clé « clé:début » mémorisée), même si endEvent était rappelé après un rechargement ou un changement de date.
export function applyAftermath(state, cur, def, now = Date.now()) {
  const L = liveState(state);
  const done = (L.aftermathDone ||= {});
  const k = `${cur.key}:${cur.start}`;
  if (done[k]) return [];
  done[k] = now;
  const keys = Object.keys(done);
  if (keys.length > 40) for (const old of keys.slice(0, keys.length - 40)) delete done[old];
  const A = AFTERMATH[cur.key];
  if (!A) return [];
  const out = [];
  const took = (cur.earned || 0) >= AFTERMATH_MIN_EARNED;
  const buff = (b, why) => { state.buffs.push({ name: b.name, mods: b.mods, until: now + b.hours * H, aftermath: k }); out.push(`${why} : ${b.name} (${b.hours} h)`); };
  if (A.all) buff(A.all, 'Le monde change');
  if (took && A.won) buff(A.won, 'Votre participation');
  if (took && A.lasting) {
    const x = A.lasting;
    if (x.rep) for (const [r, n] of Object.entries(x.rep)) bumpRep(state, r, n);
    if (x.relic) { shardState(state).relicFragments += x.relic; out.push(`${x.relic} fragment de relique`); }
    if (x.factionRelation) for (const f of state.factions || []) f.relation = Math.max(-100, Math.min(100, f.relation + x.factionRelation));
    if (x.chronicle) chronicle(state, x.chronicle.replace('{kingdom}', state.meta.kingdomName), now, 'event', `aftermath:${k}`);
  }
  if (A.all?.text) notify(state, def.icon, A.all.text, now, 'good');
  return out;
}
