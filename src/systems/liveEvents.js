// Moteur générique des événements temporaires : calendrier, rotation, cartes, marches,
// monnaies, boutiques, objectifs, passe, classement, guilde, boss, surprises et notifications.
// Toutes les règles propres à un événement viennent de data/liveEvents.js.
import { LIVE_EVENTS, SURPRISE_EVENTS, FAIR_OFFERS, MYSTERY_POOL, RIDDLES, rewardsPass, LB_REWARDS } from '../data/liveEvents.js';
import { LIVE_CONFIG } from '../data/liveConfig.js';
import { ALL_UNITS, UNITS } from '../data/units.js';
import { RESOURCES } from '../data/resources.js';
import { COSMETICS } from '../data/social.js';
import { UNIQUE_ITEMS } from '../data/items.js';
import { SPECIAL_HEROES } from '../data/shards.js';
import { mulberry32, rng } from '../core/rng.js';
import { uid, fmt, fmtTime } from '../core/util.js';
import { deepMerge } from './config.js';
import { computeMods } from './modifiers.js';
import { gain, pay, canAfford } from './economy.js';
import { thLevel } from './city.js';
import { simulateBattle } from './combat.js';
import { marchMods } from './marches.js';
import { giveXp } from './heroes.js';
import { generateItem, createUniqueItem } from './items.js';
import { shardState, addShards, rollShards, createSpecialHero, dayKey } from './shards.js';
import { spawnBoss } from './events.js';
import { findFreeTile, spawnPoi, reveal } from './world.js';
import { chronicle } from './chronicle.js';
import { log, toast } from './log.js';
import { recordLoss } from './losses.js';

const H = 3600000;
const MIN = 60000;
const DAY = 86400000;

export const liveCfg = (state) => deepMerge(LIVE_CONFIG, state?.admin?.events);
export const eventDef = (key) => LIVE_EVENTS[key];

// ───────────────────────── État ─────────────────────────
export function liveState(state) {
  return (state.live ||= { calendar: [], history: [], occ: {}, current: null, marches: [], reports: [], surprises: [], nextSurprise: 0, nextFair: 0, unseenReport: null, totals: {} });
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
    map: generateMap(state, def, seed), bossIdx: 0, bossHp: 0, bossShown: false,
    shop: buildShop(state, def, occ, seed), mystery: null, lbSeed: seed ^ 0x5eed, best: null, notified: {},
    warmth: 0, fires: false, nextWave: def.special?.waves ? now + (def.special.every || 6) * H : 0, wavesWeak: 0,
    nextAssault: def.special?.siege ? now + (def.special.every || 4) * H : 0, citadel: def.special?.siege ? 100 : 0,
    coop: def.coop ? { hp: Math.round(def.coop.hp * c.bossHpMult), maxHp: Math.round(def.coop.hp * c.bossHpMult), mine: 0 } : null,
    trackStep: 0, lavaAt: now, nextHour: now + H, riddleUsed: [],
  };
  if (def.bosses?.length) cur.bossHp = Math.round(def.bosses[0].tiers[0].hp * c.bossHpMult);
  L.current = cur;
  notify(state, def.icon, `L’événement « ${def.name} » commence ! Durée : ${fmtTime(cur.end - now)}.`, now);
  log(state, 'event', `${def.icon} ${def.name} : ${def.story}`, now);
  rollMystery(state, now);
  return cur;
}

// Carte d'événement : grille de terrain + cibles
function generateMap(state, def, seed) {
  const r = mulberry32(seed);
  const { w, h } = def.map;
  const terr = Object.entries(def.map.terrain);
  const tiles = [];
  for (let i = 0; i < w * h; i++) {
    let x = r(), t = terr[0][0];
    for (const [k, p] of terr) { if ((x -= p) < 0) { t = k; break; } }
    tiles.push(t);
  }
  // Rivières en bandes pour la cohérence visuelle
  const base = { x: 0, y: Math.floor(h / 2) };
  tiles[base.y * w] = 'plain';
  const map = { w, h, tiles, base, targets: [], revealed: null, lava: [] };
  if (def.map.fog) {
    map.revealed = Array(w * h).fill(0);
    for (let y = 0; y < h; y++) for (let x = 0; x < 3; x++) map.revealed[y * w + x] = 1;
  }
  for (const spec of def.map.targets) for (let i = 0; i < spec.count; i++) addTarget(state, def, map, spec.type, spec.tiers, r);
  if (def.special?.lava) shuffleLava(map, r);
  return map;
}

function freeCell(map, r, minX = 2) {
  const used = new Set(map.targets.filter((t) => !t.gone).map((t) => t.y * map.w + t.x));
  for (let k = 0; k < 200; k++) {
    const x = minX + Math.floor(r() * (map.w - minX)), y = Math.floor(r() * map.h);
    if (used.has(y * map.w + x) || map.lava.includes(y * map.w + x)) continue;
    return { x, y };
  }
  return { x: map.w - 1, y: Math.floor(r() * map.h) };
}

function addTarget(state, def, map, type, tiers, r = rng.random) {
  const pos = type === 'fortress' || type === 'boss' || type === 'bastion' ? freeCell(map, r, Math.floor(map.w * 0.6)) : freeCell(map, r);
  const tier = type === 'fortress' ? 8 : type === 'boss' ? 9 : tiers ? tiers[0] + Math.floor(r() * (tiers[1] - tiers[0] + 1)) : 1 + Math.floor(r() * 4);
  const t = { id: uid('lt'), type, x: pos.x, y: pos.y, tier, done: false };
  if (type === 'caravan' || type === 'ship') {
    const dest = { x: map.w - 1, y: Math.floor(r() * map.h) };
    Object.assign(t, { x: 1 + Math.floor(r() * 3), dest, spied: false, cargo: rng.pick(['soie', 'chevaux', 'épices', 'armes', 'or']) });
  }
  if (type === 'vein') { t.amount = 4 + Math.floor(r() * 5); t.max = t.amount; }
  if (type === 'trace') t.step = 1;
  if (type === 'riddle') t.riddle = Math.floor(r() * RIDDLES.length);
  if (type === 'boss') t.hidden = true; // apparaît après quelques heures
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

function earn(state, n, now, why = '') {
  const L = liveState(state);
  const cur = L.current;
  if (!cur || n <= 0) return 0;
  const def = LIVE_EVENTS[cur.key];
  let k = liveCfg(state).currencyMult;
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
      case 'treasureMap': { const t = cur?.map.targets.find((x) => x.type === 'treasure' && !x.done && !x.gone); if (t) { t.mapped = true; revealAround(cur.map, t.x, t.y, 1); parts.push(`trésor révélé en (${t.x}, ${t.y})`); } else parts.push('carte vierge'); break; }
      case 'exclusiveFromShop': {
        const ex = def?.shop.fixed.filter((i) => i.exclusive && (i.give.deco || i.give.unique) && !(i.give.deco && state.meta.owned[i.give.deco]) && !(i.give.unique && s.owned[i.give.unique]));
        if (ex?.length) parts.push(grantGive(state, ex[0].give, now, source)); else { s.legendaryFragments += 10; parts.push('10 fragments légendaires'); }
        break;
      }
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
  explore: { label: 'Explorer', icon: '🧭', hint: 'Éclaireur requis : révèle les environs' },
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
  lair: { name: 'Antre du dragon', icon: '🐉' }, vein: { name: 'Filon', icon: '🪙' }, vent: { name: 'Évent d’obsidienne', icon: '🌋' },
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

export function isVisible(cur, t) {
  if (t.done || t.gone || t.hidden) return false;
  const m = cur.map;
  if (m.revealed && !m.revealed[t.y * m.w + t.x] && !t.mapped) return false;
  return true;
}

export function actionsFor(state, t, now = Date.now()) {
  const cur = liveState(state).current;
  const def = LIVE_EVENTS[cur.key];
  const held = liveState(state).marches.some((m) => m.targetId === t.id && m.phase === 'hold');
  switch (t.type) {
    case 'caravan': return ['attack', 'escort', 'trade', 'spy'];
    case 'ship': return ['attack', 'spy'];
    case 'port': return def.special?.portTrade ? ['attack', 'trade'] : ['attack'];
    case 'treasure': return ['dig'];
    case 'village': return ['deliver'];
    case 'hearth': return t.cooldown > now ? [] : ['deliver'];
    case 'riddle': return t.sealedUntil > now ? [] : ['solve'];
    case 'trace': return ['track'];
    case 'zone': return held ? ['withdraw'] : t.owned ? ['garrison'] : ['attack'];
    case 'bastion': return held ? ['garrison', 'withdraw'] : ['garrison'];
    case 'vein': return ['mine'];
    case 'vent': return t.cooldown > now ? [] : ['harvest'];
    default: return ['attack'];
  }
}

export const maxLiveMarches = (state) => liveCfg(state).maxMarches + Math.floor(thLevel(state) / 4);
const unitCount = (u) => Object.values(u || {}).reduce((s, v) => s + v, 0);

export function liveTravel(state, cur, x, y, units, mods) {
  const d = Math.hypot(x - cur.map.base.x, y - cur.map.base.y);
  let speed = Infinity;
  for (const [u, n] of Object.entries(units)) if (n > 0 && UNITS[u]) speed = Math.min(speed, UNITS[u].speed);
  if (speed === Infinity) speed = 1;
  return Math.max(MIN, (d * 2.5 * MIN) / (speed * (1 + (mods['march.speed'] || 0))));
}

export function planLive(state, opts, now = Date.now()) {
  const L = liveState(state);
  const cur = L.current;
  const fail = (reason) => ({ ok: false, reason });
  if (!cur || now >= cur.end) return fail('Aucun événement en cours');
  const units = Object.fromEntries(Object.entries(opts.units || {}).filter(([, n]) => n > 0).map(([k, n]) => [k, Math.floor(n)]));
  const { action } = opts;
  let t = null, x = opts.x, y = opts.y;
  if (action !== 'explore') {
    t = cur.map.targets.find((z) => z.id === opts.targetId);
    if (!t || t.done || t.gone || t.hidden) return fail('Cible introuvable');
    if (!actionsFor(state, t, now).includes(action)) return fail('Action impossible ici');
    x = t.x; y = t.y;
  } else {
    if (!cur.map.revealed) return fail('Carte déjà révélée');
    if (!units.scout) return fail('Il faut au moins un éclaireur');
  }
  if (action === 'withdraw') return { ok: true, units: {}, t, travel: 0 };
  if (L.marches.filter((m) => m.phase !== 'hold').length >= maxLiveMarches(state)) return fail(`Maximum ${maxLiveMarches(state)} troupes d’événement en route`);
  for (const [u, n] of Object.entries(units)) if ((state.army[u] || 0) < n) return fail(`Pas assez de ${ALL_UNITS[u]?.name || u}`);
  if (!unitCount(units)) return fail('Sélectionnez des unités');
  if ((action === 'track' || action === 'spy') && !units.scout) return fail('Il faut au moins un éclaireur');
  if (t && ['mine', 'harvest', 'dig', 'escort', 'deliver', 'trade', 'solve'].includes(action) && L.marches.some((m) => m.targetId === t.id && m.phase !== 'back')) return fail('Une de vos troupes est déjà sur place');
  const cost = t && actionCost(t, action);
  if (cost && !canAfford(state, cost)) return fail(`Il faut ${Object.entries(cost).map(([r, v]) => `${fmt(v)} ${RESOURCES[r].icon}`).join(' ')}`);
  if (opts.heroId) {
    const h = state.heroes.find((z) => z.id === opts.heroId);
    if (!h || h.marchId || h.assignment) return fail('Héros indisponible');
  }
  const mods = marchMods(state, opts.heroId, null, now);
  return { ok: true, units, t, x, y, cost, travel: liveTravel(state, cur, x, y, units, mods), mods };
}

export function sendLive(state, opts, now = Date.now()) {
  const L = liveState(state);
  const plan = planLive(state, opts, now);
  if (!plan.ok) return plan;
  if (opts.action === 'withdraw') {
    const m = L.marches.find((z) => z.targetId === plan.t.id && z.phase === 'hold');
    if (!m) return { ok: false, reason: 'Aucune garnison' };
    m.phase = 'back'; m.returnAt = now + m.travel;
    if (plan.t.type === 'zone') { plan.t.owned = false; plan.t.enemies = scaleEnemies(state, LIVE_EVENTS[L.current.key], 'zone', plan.t.tier); }
    return { ok: true };
  }
  for (const [u, n] of Object.entries(plan.units)) state.army[u] -= n;
  if (plan.cost) pay(state, plan.cost);
  const m = {
    id: uid('lm'), action: opts.action, targetId: plan.t?.id || null, x: plan.x, y: plan.y, units: plan.units,
    heroId: opts.heroId || null, formation: opts.formation || 'balanced', phase: 'out', start: now, arrive: now + plan.travel,
    travel: plan.travel, loot: {}, items: [], workEnd: 0, returnAt: 0, paid: plan.cost || null,
  };
  if (m.heroId) state.heroes.find((h) => h.id === m.heroId).marchId = m.id;
  L.marches.push(m);
  return { ok: true, march: m };
}

export function recallLive(state, mid, now = Date.now()) {
  const m = liveState(state).marches.find((z) => z.id === mid);
  if (!m || m.phase === 'back') return { ok: false };
  if (m.phase === 'out') { m.phase = 'back'; m.returnAt = now + (now - m.start); }
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
export function liveNextTime(state) {
  let t = Infinity;
  for (const m of state.live?.marches || []) t = Math.min(t, liveMarchNext(m));
  return t;
}

export function processLiveMarches(state, now) {
  let changed = false;
  for (const m of [...liveState(state).marches]) {
    if (liveMarchNext(m) > now) continue;
    changed = true;
    if (m.phase === 'out') arriveLive(state, m, m.arrive);
    else if (m.phase === 'work') finishLiveWork(state, m, m.workEnd);
    else if (m.phase === 'back') homeLive(state, m, m.returnAt);
  }
  return changed;
}

function goBack(m, t) { m.phase = 'back'; m.returnAt = t + m.travel; }
function addLiveReport(state, text, t, win = true) {
  const cur = liveState(state).current;
  if (!cur) return;
  (cur.log ||= []).unshift({ t, text, win });
  if (cur.log.length > 40) cur.log.length = 40;
}

function liveBattle(state, m, enemies, t, opts = {}) {
  const cur = liveState(state).current;
  const mods = { ...marchMods(state, m.heroId, null, t) };
  if (opts.bonusAtk) mods['combat.atk'] = (mods['combat.atk'] || 0) + opts.bonusAtk;
  const terrain = cur.map.tiles[m.y * cur.map.w + m.x];
  const tier = opts.tier || 1;
  const res = simulateBattle(
    { units: m.units, mods, formation: m.formation, label: 'Vous' },
    { units: enemies, mods: { 'combat.atk': 0.04 * tier, 'combat.def': 0.04 * tier }, label: opts.label || 'Ennemi' },
    { terrain: terrain === 'ash' ? 'ruins' : terrain, weather: state.weather.type, bossHp: opts.bossHp },
  );
  m.units = Object.fromEntries(Object.entries(res.attRemaining).filter(([, n]) => n > 0));
  const killed = Object.values(res.defLosses).reduce((a, b) => a + b, 0);
  const hero = state.heroes.find((h) => h.id === m.heroId);
  if (hero) giveXp(state, hero, 20 + killed * 8 + res.bossDamage / 60, mods);
  state.stats.enemiesKilled = (state.stats.enemiesKilled || 0) + killed;
  return res;
}

const campReward = (tier) => 50 * tier + 15 * tier * tier;

function arriveLive(state, m, t) {
  const L = liveState(state);
  const cur = L.current;
  if (!cur) return goBack(m, t);
  const def = LIVE_EVENTS[cur.key];
  if (m.action === 'explore') {
    const n = revealAround(cur.map, m.x, m.y, 2);
    bump(cur, 'explored', n);
    if (rng.chance(0.15)) earn(state, 60, t, 'exploration');
    addLiveReport(state, `🧭 Exploration en (${m.x}, ${m.y}) : ${n} case(s) révélée(s).`, t);
    return goBack(m, t);
  }
  const tg = liveTarget(state, m.targetId);
  if (!tg || tg.done || tg.gone) { addLiveReport(state, '↩️ La cible a disparu avant votre arrivée.', t, false); return goBack(m, t); }
  const name = targetName(cur, tg);
  switch (m.action) {
    case 'attack': return attackTarget(state, m, tg, t, def, name);
    case 'spy': {
      tg.spied = true;
      addLiveReport(state, `👁️ ${name} espionnée : cargaison de ${tg.cargo}, destination (${tg.dest.x}, ${tg.dest.y}), ${unitCount(tg.enemies || def.enemies[tg.type] || {})} gardes.`, t);
      earn(state, 40, t, 'espionnage');
      return goBack(m, t);
    }
    case 'trade': {
      const v = tg.type === 'port' ? 300 : 150 + 60 * tg.tier;
      const got = earn(state, v, t, 'commerce');
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
        const got = earn(state, 120, t, 'brasier');
        addLiveReport(state, `🔥 Brasier alimenté : chaleur ${Math.round(cur.warmth)}, +${fmt(got)} ${def.currency.icon}.`, t);
      } else {
        bump(cur, 'deliveries');
        const got = earn(state, 250, t, 'village');
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
      const same = L.marches.find((z) => z.targetId === tg.id && z.phase === 'hold' && z.id !== m.id);
      if (same) { for (const [u, n] of Object.entries(m.units)) same.units[u] = (same.units[u] || 0) + n; L.marches = L.marches.filter((z) => z.id !== m.id); if (m.heroId) { const h = state.heroes.find((x) => x.id === m.heroId); if (h) h.marchId = null; } }
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
  else { v = campReward(tg.tier); if (tg.type !== 'pack') bump(cur, 'camps'); else bump(cur, 'packs'); if (tg.tier >= 7) bump(cur, 'tier7'); }
  if (tg.type === 'crypt') cur.wavesWeak = Math.min(0.6, cur.wavesWeak + 0.04);
  const got = earn(state, v, t, name);
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
  const res = liveBattle(state, m, { [b.unit]: 1 }, t, { bossHp: cur.bossHp, label: b.name, tier: 3 + cur.bossIdx });
  const dmg = Math.min(cur.bossHp, res.bossDamage);
  cur.bossHp -= dmg;
  bump(cur, 'bossDamage', dmg);
  earn(state, Math.round(dmg / 200), t, `assaut contre ${b.name}`);
  let text = `👑 ${fmt(dmg)} dégâts infligés à ${b.name} (rang ${cur.bossIdx + 1}).`;
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
  const got = earn(state, Math.round(dmg / 150), t, `coups portés à ${def.coop.name}`);
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
    const got = earn(state, 200 + 80 * tg.tier, t, 'escorte');
    bump(cur, 'escorts'); bump(cur, 'caravans');
    m.loot.gold = (m.loot.gold || 0) + 200 * tg.tier;
    addLiveReport(state, `🛡️ Escorte réussie : la caravane vous remercie (+${fmt(got)} ${def.currency.icon}).`, t);
    tg.done = true; tg.respawnAt = t + 30 * MIN;
  } else if (m.action === 'dig') {
    const got = earn(state, rng.int(200, 450), t, 'trésor');
    bump(cur, 'treasures');
    const loot = { gold: rng.int(300, 900), gems: rng.int(1, 4) };
    for (const [r, v] of Object.entries(loot)) m.loot[r] = (m.loot[r] || 0) + Math.round(v * thScale(state));
    if (rng.chance(0.25)) m.items.push(generateItem({ ilvl: 4 + thLevel(state) * 2, boost: 0.8, min: 'rare' }));
    addLiveReport(state, `💰 Trésor déterré : +${fmt(got)} ${def.currency.icon}.`, t);
    tg.done = true; tg.respawnAt = t + liveCfg(state).respawnMin * MIN;
  } else if (m.action === 'track') {
    bump(cur, 'traces');
    cur.trackStep++;
    earn(state, 300, t, 'traque');
    tg.done = true; tg.gone = true;
    if (cur.trackStep >= 3) {
      const r = mulberry32(cur.seed ^ 0x1a1);
      const lair = addTarget(state, def, cur.map, 'lair', null, r);
      lair.tier = 9;
      notify(state, '🐉', `L’antre de ${def.coop?.name || 'la bête'} est localisé en (${lair.x}, ${lair.y}) ! Tous à l’assaut.`, t);
      addLiveReport(state, `🐾 Dernière piste : l’antre est trouvé !`, t);
    } else {
      const nt = addTarget(state, def, cur.map, 'trace', null);
      addLiveReport(state, `🐾 Piste ${cur.trackStep}/3 suivie : de nouvelles traces mènent en (${nt.x}, ${nt.y}).`, t);
    }
  } else if (m.action === 'mine') {
    const gatherers = Object.entries(m.units).reduce((s, [u, n]) => s + (UNITS[u]?.gather || 0) * n, 0);
    const units = Math.min(tg.amount, Math.max(1, Math.floor(gatherers / 120)));
    tg.amount -= units;
    const got = earn(state, units * 110, t, 'filon');
    bump(cur, 'veins');
    m.loot.gold = (m.loot.gold || 0) + units * 250;
    if (rng.chance(0.15)) m.loot.silver = (m.loot.silver || 0) + rng.int(3, 8);
    addLiveReport(state, `⛏️ ${name} : ${units} poche(s) exploitée(s), +${fmt(got)} ${def.currency.icon} (reste ${tg.amount}/${tg.max}).`, t);
    if (tg.amount <= 0) { tg.done = true; tg.gone = true; }
  } else if (m.action === 'harvest') {
    const near = lavaNear(cur.map, tg.x, tg.y);
    if (near) {
      let lost = 0;
      for (const u of Object.keys(m.units)) { const l = Math.floor(m.units[u] * 0.15); m.units[u] -= l; lost += l; }
      addLiveReport(state, `🌋 La lave cerne l’évent : ${lost} hommes perdus pendant la récolte.`, t, false);
    }
    const got = earn(state, 110 + rng.int(0, 70), t, 'évent');
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

function homeLive(state, m, t) {
  const L = liveState(state);
  for (const [u, n] of Object.entries(m.units)) state.army[u] = (state.army[u] || 0) + n;
  const mods = computeMods(state, t);
  if (Object.keys(m.loot).length) gain(state, m.loot, mods);
  for (const it of m.items) state.inventory.items.push(it);
  const hero = state.heroes.find((h) => h.id === m.heroId);
  if (hero) hero.marchId = null;
  L.marches = L.marches.filter((z) => z.id !== m.id);
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
  const m = L.marches.find((z) => z.id === p.marchId);
  const tg = liveTarget(state, p.targetId);
  const cur = L.current;
  const q = RIDDLES[p.riddle];
  let text;
  if (cur && tg && idx === q.ok) {
    const def = LIVE_EVENTS[cur.key];
    const got = earn(state, 500, now, 'énigme');
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
export function revealAround(map, cx, cy, r) {
  if (!map.revealed) return 0;
  let n = 0;
  for (let y = cy - r; y <= cy + r; y++) for (let x = cx - r; x <= cx + r; x++) {
    if (x < 0 || y < 0 || x >= map.w || y >= map.h) continue;
    if (!map.revealed[y * map.w + x]) { map.revealed[y * map.w + x] = 1; n++; }
  }
  return n;
}
function shuffleLava(map, r = rng.random) {
  const n = Math.round(map.w * map.h * 0.12);
  const lava = new Set();
  const protectedCells = new Set(map.targets.filter((t) => !t.gone).map((t) => t.y * map.w + t.x));
  while (lava.size < n) {
    const i = Math.floor(r() * map.w * map.h);
    if (i % map.w < 2 || protectedCells.has(i)) continue;
    lava.add(i);
  }
  map.lava = [...lava];
}
export function lavaNear(map, x, y) {
  let n = 0;
  for (const i of map.lava) { const lx = i % map.w, ly = Math.floor(i / map.w); if (Math.abs(lx - x) <= 1 && Math.abs(ly - y) <= 1) n++; }
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
  // Réapparitions
  for (const t of map.targets) {
    if (t.done && !t.gone && t.respawnAt && t.respawnAt <= now && RESPAWNING.includes(t.type) || (t.type === 'fortress' && t.done && t.respawnAt <= now)) {
      const spec = def.map.targets.find((s) => s.type === t.type);
      const nt = addTarget(state, def, map, t.type, spec?.tiers);
      t.gone = true;
      void nt;
    }
  }
  map.targets = map.targets.filter((t) => !t.gone);
  // Caravanes & navires se déplacent
  for (const t of map.targets) {
    if ((t.type === 'caravan' || t.type === 'ship') && !t.done) {
      const dx = t.dest.x - t.x, dy = t.dest.y - t.y, d = Math.hypot(dx, dy);
      const step = (t.type === 'ship' ? 2 : 1.4) * dtH;
      if (d <= step) { t.done = true; t.respawnAt = now + 20 * MIN; }
      else { t.fx = (t.fx ?? t.x) + (dx / d) * step; t.fy = (t.fy ?? t.y) + (dy / d) * step; t.x = Math.round(t.fx); t.y = Math.round(t.fy); }
    }
  }
  // Boucle horaire
  if (now >= cur.nextHour) {
    cur.nextHour += H;
    hourly(state, cur, def, now);
  }
  // Vagues (Nuit des Morts)
  if (cur.nextWave && now >= cur.nextWave) { cur.nextWave += (def.special.every || 6) * H; resolveWave(state, cur, def, now); }
  if (cur.nextWave && !cur.notified['wave' + cur.nextWave] && cur.nextWave - now <= 30 * MIN) { cur.notified['wave' + cur.nextWave] = true; notify(state, '👻', 'Une vague de morts-vivants arrive dans 30 minutes !', now, 'bad'); }
  // Assauts (Siège)
  if (cur.nextAssault && now >= cur.nextAssault) { cur.nextAssault += (def.special.every || 4) * H; resolveAssault(state, cur, def, now); }
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
  // Marchand mystère quotidien
  rollMystery(state, now);
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

function hourly(state, cur, def, now) {
  const map = cur.map;
  if (def.special?.zones) {
    for (const z of map.targets.filter((t) => t.type === 'zone' && t.owned)) {
      earn(state, 40 * z.tier, now, 'régions tenues');
      if (z.nextCounter && now >= z.nextCounter) {
        z.nextCounter = now + 2 * H;
        const m = liveState(state).marches.find((x) => x.targetId === z.id && x.phase === 'hold');
        if (!m) { z.owned = false; z.enemies = scaleEnemies(state, def, 'zone', z.tier); continue; }
        const res = liveBattle(state, m, scaleEnemies(state, def, 'zone', Math.max(1, z.tier - 1)), now, { tier: z.tier, label: 'Contre-attaque' });
        if (res.winner === 'attacker') { bump(cur, 'defended'); addLiveReport(state, `🛡️ Contre-attaque repoussée sur ${targetName(cur, z)}.`, now); }
        else { z.owned = false; z.enemies = scaleEnemies(state, def, 'zone', z.tier); addLiveReport(state, `🚩 ${targetName(cur, z)} est perdue face à la contre-attaque.`, now, false); notify(state, '🚩', `Une de vos régions est tombée (${targetName(cur, z)}).`, now, 'bad'); if (unitCount(m.units)) goBack(m, now); else homeLive(state, m, now); }
      }
    }
  }
  if (def.special?.veins) {
    // Les prospecteurs rivaux revendiquent un filon libre ; de nouveaux filons affleurent
    const free = map.targets.filter((t) => t.type === 'vein' && !t.done && !liveState(state).marches.some((m) => m.targetId === t.id));
    if (free.length && rng.chance(0.7)) { const v = rng.pick(free); v.done = true; v.gone = true; addLiveReport(state, `🪙 Des prospecteurs rivaux ont revendiqué un filon en (${v.x}, ${v.y}).`, now, false); }
    if (map.targets.filter((t) => t.type === 'vein' && !t.gone).length < 10 && rng.chance(0.8)) addTarget(state, def, map, 'vein');
  }
  if (def.special?.lava) shuffleLava(map);
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
    const got = earn(state, 300 + n * 60, now, 'vague repoussée');
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
  if (!cur || !LIVE_EVENTS[cur.key].special?.waves) return { ok: false };
  if (cur.fires) return { ok: false, reason: 'Les feux brûlent déjà' };
  if (!pay(state, { herbs: 200 })) return { ok: false, reason: 'Il faut 200 herbes' };
  cur.fires = true;
  return { ok: true };
}

function resolveAssault(state, cur, def, now) {
  const m = liveState(state).marches.find((x) => x.phase === 'hold' && liveTarget(state, x.targetId)?.type === 'bastion');
  const n = cur.stats.assaultsSeen = (cur.stats.assaultsSeen || 0) + 1;
  let dmg = rng.int(2, 7);
  if (m) {
    const k = (0.4 + n * 0.08) * thScale(state) * liveCfg(state).enemyMult;
    const enemies = Object.fromEntries(Object.entries(def.enemies.assault).map(([u, v]) => [u, Math.max(1, Math.round(v * k))]));
    const res = liveBattle(state, m, enemies, now, { tier: 3, label: 'Assaut' });
    const killed = Object.values(res.defLosses).reduce((a, b) => a + b, 0);
    bump(cur, 'assaults');
    const got = earn(state, 200 + killed * 4, now, 'défense de la Citadelle');
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

export const passDef = (def) => def.pass || rewardsPass(def.currency.key);
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
  for (const m of [...L.marches]) homeLive(state, m, now);
  state.pending = state.pending.filter((p) => p.kind !== 'riddle');
  // Récompenses non réclamées : objectifs et passe sont versés automatiquement
  for (const o of objectives(state)) if (o.done && !o.claimed) rewards.push(claimObjective(state, o.id, now).text);
  for (const l of passInfo(state).levels) if (l.ready && !l.claimed) rewards.push(claimPass(state, l.level, now).text);
  if (cur.coop?.mine) def.coop.tiers.forEach((tr, i) => { if (!cur.coopClaimed[i] && coopProgress(cur) >= tr) rewards.push(claimCoop(state, i, now).text); });
  if (def.special?.siege && cur.citadel > 0 && (cur.stats.assaults || 0) > 0) {
    rewards.push(grantGive(state, { [def.currency.key]: 1500 + 200 * cur.stats.assaults, chest: 'epic' }, now, 'Citadelle tenue'));
    if (cur.stats.assaults >= 6) { addShards(state, 2, 'event', now, 'Défenseur de la Citadelle'); rewards.push('💠 2 Éclats Anciens'); }
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
  L.current = null;
  chronicle(state, `Fin de « ${def.name} » : ${state.meta.kingdomName} termine ${lb.rank}e sur ${lb.size} avec ${fmt(report.earned)} ${def.currency.name}.`, now);
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
