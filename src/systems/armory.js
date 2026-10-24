// v18 « L'Armurerie » : équipement des héros rapide et juste (module pur, testable).
// - Valeur par rôle : le gain réel d'un objet est la différence des modificateurs du héros (heroMods) avec et sans
//   l'objet, dans le contexte de son rôle (intendant d'un secteur, commandant de guerre, de récolte ou d'exploration),
//   pondérée par data/armory.js. itemScore ne sert plus qu'à l'affichage.
// - Équipement automatique d'un héros ou de toute la troupe, avec aperçu, priorités, verrous, réservations, annulation.
// - Vente (or, gemmes plafonnées par jour) et démantèlement (métal et matériaux), à l'unité ou en masse, annulables.
// - Règles de tri du butin (ordres du royaume de type « loot ») et plafond d'inventaire sans perte silencieuse.
// - Gemmes taillées serties dans les châsses, ensembles, tenues, transmutation, réforge, conseils de la taverne.
import { rng } from '../core/rng.js';
import { uid } from '../core/util.js';
import { SLOT_ORDER, SLOTS, AFFIXES, ITEM_BASES } from '../data/items.js';
import { RARITIES, RARITY_ORDER, SECTORS, HERO_CLASSES } from '../data/heroes.js';
import { RESOURCES } from '../data/resources.js';
import {
  COMMAND_FOCUS, DEFAULT_FOCUS, GOVERNOR_WEIGHTS, GLOBAL_WEIGHTS, XP_WEIGHT, SOCKETS, GEM_TYPES, GEM_QUALITIES, CUT_COST, FUSE_N, fuseCost, unsetCost,
  ITEM_SETS, SELL_BASE_GOLD, JEWEL_SLOTS, GEM_DAILY, GEM_GOLD, TRANSMUTE_SHARE, transmuteCost, reforgeCost,
  LOOT_RULES_MAX, OUTFITS_MAX, UNDO_MS, SAVED_FILTERS_MAX,
} from '../data/armory.js';
import { heroMods, setCounts } from './heroes.js';
import { itemMods, salvageYield, MAX_PLUS, itemScore, emptySockets, parseGem, gemMods } from './items.js';
import { pay, missing } from './economy.js';
import { log } from './log.js';
import { fmtMod, modLabel } from '../data/modLabels.js';

const DAY = 86400000;
const EPS = 1e-6;

// ───────── État ─────────
export function armoryState(state) {
  const a = (state.armory && typeof state.armory === 'object') ? state.armory : (state.armory = {});
  a.settings ||= {};
  const S = a.settings;
  if (!['assigned', 'level', 'custom'].includes(S.priority)) S.priority = 'assigned';
  if (!Array.isArray(S.order)) S.order = [];
  if (typeof S.allowSteal !== 'boolean') S.allowSteal = true;
  if (typeof S.autoLoot !== 'boolean') S.autoLoot = false; // prudent : désactivé par défaut
  a.gemBag ||= {};
  if (!Array.isArray(a.reports)) a.reports = [];
  a.gemSale ||= { day: 0, n: 0 };
  a.setsDone ||= {};
  if (!Array.isArray(a.filters)) a.filters = [];
  a.stats ||= { sold: 0, dismantled: 0, goldSold: 0, gemsSold: 0, gemsCut: 0, autoEquips: 0, ruled: 0, capped: 0 };
  return a;
}

// Migration et objets venus d'ailleurs : châsses selon la rareté, date d'arrivée (les objets anciens ne sont pas
// « nouveaux » pour les règles de tri)
export function ensureArmory(state, now = Date.now()) {
  armoryState(state);
  for (const it of state.inventory?.items || []) {
    if (!Array.isArray(it.sockets)) it.sockets = emptySockets(it.rarity);
    else if (it.sockets.length < (SOCKETS[it.rarity] || 0)) while (it.sockets.length < SOCKETS[it.rarity]) it.sockets.push(null);
    if (!it.got) it.got = state.meta?.lastTick || now;
  }
  for (const h of state.heroes || []) { if (!Array.isArray(h.outfits)) h.outfits = []; }
}

const itemsById = (state) => { const m = new Map(); for (const it of state.inventory.items) m.set(it.id, it); return m; };

// ───────── Rôle et valeur ─────────
export function heroRole(hero) {
  if (hero.assignment?.type === 'governor' && SECTORS[hero.assignment.sector]) return { kind: 'governor', sector: hero.assignment.sector };
  return { kind: 'commander', focus: COMMAND_FOCUS[hero.focus] ? hero.focus : DEFAULT_FOCUS[hero.cls] || 'war' };
}
export function roleLabel(role) {
  if (role.kind === 'governor') return `${SECTORS[role.sector].icon} Intendant : ${SECTORS[role.sector].name}`;
  const f = COMMAND_FOCUS[role.focus];
  return `${f.icon} Commandant : ${f.name.toLowerCase()}`;
}
function roleWeights(role) {
  if (role.kind === 'commander') return COMMAND_FOCUS[role.focus].weights;
  const w = {};
  for (const k of Object.keys(AFFIXES)) if (AFFIXES[k].ctx === 'governor' && k.startsWith('prod.')) w[k] = GOVERNOR_WEIGHTS.otherProd;
  for (const k of SECTORS[role.sector].mods) if (k.startsWith('prod.')) w[k] = GOVERNOR_WEIGHTS.sector;
  w['prod.all'] = GOVERNOR_WEIGHTS['prod.all'];
  w['research.speed'] = role.sector === 'science' ? GOVERNOR_WEIGHTS.sector : GOVERNOR_WEIGHTS['research.speed'];
  w['craft.quality'] = role.sector === 'forge' ? GOVERNOR_WEIGHTS.sector : GOVERNOR_WEIGHTS['craft.quality'];
  w['craft.speed'] = role.sector === 'forge' ? GOVERNOR_WEIGHTS.sector : GOVERNOR_WEIGHTS['craft.speed'];
  w['market.fee'] = GOVERNOR_WEIGHTS['market.fee'];
  return w;
}
// Héros tel qu'il serait dans ce rôle (pour comparer deux affectations sans rien modifier)
function asRole(hero, role) {
  if (role.kind === 'governor') return hero.assignment?.sector === role.sector ? hero : { ...hero, assignment: { type: 'governor', sector: role.sector } };
  return hero.assignment ? { ...hero, assignment: null } : hero;
}
const dot = (m, w) => { let v = 0; for (const k in m) if (w[k]) v += m[k] * w[k]; return v; };

// Valeur (en points de rôle) d'un héros portant `items` (liste d'objets) dans un rôle
export function configValue(hero, role, items) {
  const fakeState = { inventory: { items } };
  const h = { ...asRole(hero, role), equipment: Object.fromEntries(items.map((it) => [it.slot, it.id])) };
  const ctx = role.kind === 'governor' ? 'governor' : 'commander';
  let v = dot(heroMods(fakeState, h, ctx), roleWeights(role)) + dot(heroMods(fakeState, h, 'global'), GLOBAL_WEIGHTS);
  for (const it of items) v += (itemMods(it)['hero.xp'] || 0) * XP_WEIGHT;
  return v;
}
// Valeur actuelle d'un héros dans son rôle (ou un rôle donné)
export function roleValue(state, hero, role = heroRole(hero)) {
  const by = itemsById(state);
  return configValue(hero, role, Object.values(hero.equipment || {}).map((id) => by.get(id)).filter(Boolean));
}

// Coefficients linéaires (points par unité de chaque affixe) : différence de heroMods avec et sans une pièce-sonde.
// Les effets sont additifs, sauf l'arrondi des caractéristiques et les ensembles, traités à part (valeur exacte).
const PROBE = 100;
export function roleCoefs(hero, role = heroRole(hero)) {
  const base = configValue(hero, role, []);
  const coefs = {};
  for (const k of Object.keys(AFFIXES)) {
    const probe = { id: '__probe', slot: 'weapon', rarity: 'common', plus: 0, affixes: { [k]: PROBE }, sockets: [] };
    const d = (configValue(hero, role, [probe]) - base) / PROBE;
    if (Math.abs(d) > EPS) coefs[k] = d;
  }
  return coefs;
}
export const linearGain = (item, coefs) => dot(itemMods(item), coefs);

// Gain exact d'un objet pour un héros, à la place de ce qu'il porte dans cet emplacement
export function itemGain(state, hero, item, role = heroRole(hero)) {
  const by = itemsById(state);
  const worn = Object.values(hero.equipment || {}).map((id) => by.get(id)).filter(Boolean);
  const before = configValue(hero, role, worn);
  const after = configValue(hero, role, [...worn.filter((it) => it.slot !== item.slot && it.id !== item.id), item]);
  return after - before;
}

// Comparaison ligne à ligne avec la pièce portée (▲ / ▼ et des mots, jamais la couleur seule)
export function compareItem(state, hero, item) {
  const by = itemsById(state);
  const cur = by.get(hero.equipment?.[item.slot]);
  const a = cur && cur.id !== item.id ? itemMods(cur) : {};
  const b = itemMods(item);
  const keys = [...new Set([...Object.keys(b), ...Object.keys(a)])];
  const rows = keys.map((k) => {
    const d = (b[k] || 0) - (a[k] || 0);
    const better = k === 'combat.losses' || k === 'market.fee' ? d < 0 : d > 0;
    return { key: k, label: modLabel(k), now: a[k] || 0, next: b[k] || 0, delta: d, dir: Math.abs(d) < EPS ? 'same' : better ? 'up' : 'down' };
  });
  return { current: cur && cur.id !== item.id ? cur : null, rows, gain: itemGain(state, hero, item) };
}

// ───────── Priorités, verrous, réservations ─────────
export function priorityOrder(state) {
  const S = armoryState(state).settings;
  const hs = [...state.heroes];
  const byLevel = (a, b) => b.level - a.level || (a.id < b.id ? -1 : 1);
  if (S.priority === 'custom' && S.order.length) {
    const idx = (h) => { const i = S.order.indexOf(h.id); return i < 0 ? 1e6 : i; };
    return hs.sort((a, b) => idx(a) - idx(b) || byLevel(a, b));
  }
  if (S.priority === 'level') return hs.sort(byLevel);
  // Par défaut : les héros affectés (intendants) d'abord, puis les héros libres ; à égalité, le plus haut niveau
  return hs.sort((a, b) => (b.assignment ? 1 : 0) - (a.assignment ? 1 : 0) || byLevel(a, b));
}
export function setPriority(state, mode, order = null) {
  const S = armoryState(state).settings;
  if (!['assigned', 'level', 'custom'].includes(mode)) return { ok: false, reason: 'Ordre inconnu' };
  S.priority = mode;
  if (order) S.order = order.filter((id) => state.heroes.some((h) => h.id === id));
  return { ok: true };
}
export function moveHeroPriority(state, heroId, dir) {
  const S = armoryState(state).settings;
  const ids = priorityOrder(state).map((h) => h.id);
  const i = ids.indexOf(heroId), j = i + dir;
  if (i < 0 || j < 0 || j >= ids.length) return { ok: false };
  [ids[i], ids[j]] = [ids[j], ids[i]];
  S.priority = 'custom'; S.order = ids;
  return { ok: true };
}
export function setArmoryOption(state, key, value) {
  const S = armoryState(state).settings;
  if (!['allowSteal', 'autoLoot'].includes(key)) return { ok: false };
  S[key] = !!value;
  return { ok: true };
}
export function toggleReserve(state, itemId) {
  const it = state.inventory.items.find((i) => i.id === itemId);
  if (!it) return { ok: false };
  if (it.reservedFor) { delete it.reservedFor; return { ok: true, reserved: false }; }
  if (!it.equippedBy) return { ok: false, reason: 'Réservez une pièce portée : elle restera à ce héros' };
  it.reservedFor = it.equippedBy;
  return { ok: true, reserved: true };
}
export function setFocus(state, heroId, focus) {
  const h = state.heroes.find((x) => x.id === heroId);
  if (!h || !COMMAND_FOCUS[focus]) return { ok: false };
  h.focus = focus;
  return { ok: true };
}

// ───────── Équipement automatique ─────────
// opts : { heroIds (null = toute la troupe), allowSteal }
export function planAutoEquip(state, opts = {}) {
  const A = armoryState(state);
  const allowSteal = opts.allowSteal ?? A.settings.allowSteal;
  const by = itemsById(state);
  const order = priorityOrder(state).filter((h) => !h.marchId);
  const targets = opts.heroIds ? order.filter((h) => opts.heroIds.includes(h.id)) : order;
  const marching = new Set(state.heroes.filter((h) => h.marchId).map((h) => h.id));
  // Équipement virtuel
  const eq = new Map(state.heroes.map((h) => [h.id, { ...h.equipment }]));
  const owner = new Map();
  for (const h of state.heroes) for (const id of Object.values(h.equipment)) if (id) owner.set(id, h.id);
  const bySlot = Object.fromEntries(SLOT_ORDER.map((s) => [s, []]));
  for (const it of state.inventory.items) if (bySlot[it.slot]) bySlot[it.slot].push(it);
  const settled = new Set();
  const victims = new Set();
  const usable = (it, hero) => {
    if (it.locked) return false;
    if (it.reservedFor && it.reservedFor !== hero.id) return false;
    const o = owner.get(it.id);
    if (o && o !== hero.id) {
      if (!allowSteal || marching.has(o) || settled.has(o)) return false;
      const oi = by.get(it.id);
      if (oi?.reservedFor === o) return false;
    }
    return true;
  };
  const put = (hero, slot, it) => {
    const e = eq.get(hero.id);
    const prev = e[slot];
    if (prev) owner.delete(prev);
    if (it) {
      const o = owner.get(it.id);
      if (o && o !== hero.id) { eq.get(o)[it.slot] = null; victims.add(o); }
      owner.set(it.id, hero.id);
    }
    e[slot] = it ? it.id : null;
  };
  const wornOf = (hid) => Object.values(eq.get(hid)).map((id) => by.get(id)).filter(Boolean);
  const fixedSlot = (hero, slot) => { const cur = by.get(eq.get(hero.id)[slot]); return cur && (cur.locked || cur.reservedFor === hero.id); };
  const solve = (hero, restrictToFree = false) => {
    const role = heroRole(hero);
    const coefs = roleCoefs(hero, role);
    const cands = {};
    for (const slot of SLOT_ORDER) {
      if (fixedSlot(hero, slot)) continue;
      const cur = by.get(eq.get(hero.id)[slot]);
      const list = bySlot[slot].filter((it) => it.id === cur?.id || (usable(it, hero) && (!restrictToFree || !owner.get(it.id))))
        .map((it) => ({ it, g: linearGain(it, coefs) })).sort((a, b) => b.g - a.g);
      cands[slot] = list;
      const best = list[0];
      if (best && best.it.id !== cur?.id && best.g > (cur ? linearGain(cur, coefs) : 0) + EPS) put(hero, slot, best.it);
    }
    // Affinage exact (ensembles, arrondis) : pour chaque emplacement, les 3 meilleures pièces et les pièces des ensembles
    // déjà commencés sont essayées ; on garde la configuration de plus grande valeur exacte
    for (let pass = 0; pass < 2; pass++) {
      let improved = false;
      for (const slot of SLOT_ORDER) {
        if (!cands[slot]) continue;
        const worn = wornOf(hero.id);
        const sets = setCounts(worn);
        const tries = [...cands[slot].slice(0, 3), ...cands[slot].filter((c) => c.it.set && sets[c.it.set])].map((c) => c.it)
          .filter((it) => it.id === eq.get(hero.id)[slot] || usable(it, hero));
        const others = worn.filter((it) => it.slot !== slot);
        const curId = eq.get(hero.id)[slot];
        let bestV = configValue(hero, role, worn), bestIt = null;
        for (const it of tries) {
          if (it.id === curId) continue;
          const v = configValue(hero, role, [...others, it]);
          if (v > bestV + EPS) { bestV = v; bestIt = it; }
        }
        if (bestIt) { put(hero, slot, bestIt); improved = true; }
      }
      if (!improved) break;
    }
    settled.add(hero.id);
  };
  for (const h of targets) solve(h);
  // Héros qui ont cédé une pièce sans faire partie de la demande : ils reprennent la meilleure pièce libre
  for (const id of victims) { if (settled.has(id)) continue; const h = state.heroes.find((x) => x.id === id); if (h) solve(h, true); }
  // Différences, gains exacts par pièce et par héros
  const changes = [];
  const perHero = [];
  let total = 0;
  for (const h of state.heroes) {
    const before = h.equipment, after = eq.get(h.id);
    const slots = SLOT_ORDER.filter((s) => (before[s] || null) !== (after[s] || null));
    if (!slots.length) continue;
    const role = heroRole(h);
    const wornBefore = Object.values(before).map((id) => by.get(id)).filter(Boolean);
    const wornAfter = Object.values(after).map((id) => by.get(id)).filter(Boolean);
    const vb = configValue(h, role, wornBefore), va = configValue(h, role, wornAfter);
    total += va - vb;
    const ctx = role.kind === 'governor' ? 'governor' : 'commander';
    const mb = modsOf(h, role, wornBefore, ctx), ma = modsOf(h, role, wornAfter, ctx);
    const delta = Object.fromEntries([...new Set([...Object.keys(mb), ...Object.keys(ma)])].map((k) => [k, (ma[k] || 0) - (mb[k] || 0)]).filter(([k, v]) => Math.abs(v) > 1e-4 && (roleWeights(role)[k] || GLOBAL_WEIGHTS[k])));
    perHero.push({ heroId: h.id, before: vb, after: va, gain: va - vb, delta });
    for (const s of slots) {
      const to = by.get(after[s]) || null, from = by.get(before[s]) || null;
      const solo = [...wornBefore.filter((it) => it.slot !== s), ...(to ? [to] : [])];
      changes.push({ heroId: h.id, slot: s, from: from?.id || null, to: to?.id || null, gain: configValue(h, role, solo) - vb });
    }
  }
  return { changes, perHero, total, heroIds: opts.heroIds || null };
}
function modsOf(hero, role, items, ctx) {
  const fakeState = { inventory: { items } };
  const h = { ...asRole(hero, role), equipment: Object.fromEntries(items.map((it) => [it.slot, it.id])) };
  const m = { ...heroMods(fakeState, h, ctx) };
  for (const [k, v] of Object.entries(heroMods(fakeState, h, 'global'))) m[k] = (m[k] || 0) + v;
  return m;
}

// Applique un plan (vérifié de nouveau) ; l'équipement d'avant est gardé pour « Annuler »
export function applyAutoEquip(state, plan, now = Date.now()) {
  if (!plan?.changes?.length) return { ok: false, reason: 'Rien à changer : chacun porte déjà ce qui lui va le mieux' };
  const A = armoryState(state);
  const by = itemsById(state);
  const touched = [...new Set(plan.changes.map((c) => c.heroId))];
  for (const c of plan.changes) {
    const h = state.heroes.find((x) => x.id === c.heroId);
    if (!h || h.marchId) return { ok: false, reason: 'Un héros est parti en marche entre-temps : recalculez' };
    if (c.to && !by.has(c.to)) return { ok: false, reason: 'Un objet a disparu entre-temps : recalculez' };
    if (c.to && by.get(c.to).locked) return { ok: false, reason: 'Un objet a été verrouillé entre-temps : recalculez' };
  }
  for (const it of plan.changes.map((c) => by.get(c.to)).filter(Boolean)) { const o = it.equippedBy && state.heroes.find((h) => h.id === it.equippedBy); if (o && !touched.includes(o.id)) touched.push(o.id); }
  A.undo = { kind: 'equip', t: now, eq: Object.fromEntries(touched.map((id) => [id, { ...state.heroes.find((h) => h.id === id).equipment }])) };
  // On retire d'abord, puis on pose
  for (const c of plan.changes) {
    const h = state.heroes.find((x) => x.id === c.heroId);
    const cur = by.get(h.equipment[c.slot]);
    if (cur && cur.equippedBy === h.id) cur.equippedBy = null;
    h.equipment[c.slot] = null;
  }
  for (const c of plan.changes) {
    if (!c.to) continue;
    const it = by.get(c.to);
    const prev = it.equippedBy && state.heroes.find((x) => x.id === it.equippedBy);
    if (prev && prev.equipment[it.slot] === it.id) prev.equipment[it.slot] = null;
    state.heroes.find((x) => x.id === c.heroId).equipment[c.slot] = it.id;
    it.equippedBy = c.heroId;
  }
  A.stats.autoEquips += plan.changes.length;
  noteSets(state, now);
  return { ok: true, n: plan.changes.length, total: plan.total };
}

export function undoLast(state, now = Date.now()) {
  const A = armoryState(state);
  const u = A.undo;
  if (!u || now - u.t > UNDO_MS) return { ok: false, reason: 'Plus rien à annuler' };
  if (u.kind === 'equip') {
    const by = itemsById(state);
    for (const id of Object.keys(u.eq)) if (state.heroes.find((h) => h.id === id)?.marchId) return { ok: false, reason: 'Un héros est en marche : annulation impossible' };
    for (const [hid, eq] of Object.entries(u.eq)) {
      const h = state.heroes.find((x) => x.id === hid);
      if (!h) continue;
      for (const id of Object.values(h.equipment)) { const it = by.get(id); if (it && it.equippedBy === hid) it.equippedBy = null; }
      h.equipment = Object.fromEntries(SLOT_ORDER.map((s) => [s, null]));
      for (const [slot, id] of Object.entries(eq)) {
        const it = by.get(id);
        if (!it) continue;
        const o = it.equippedBy && state.heroes.find((x) => x.id === it.equippedBy);
        if (o && o.id !== hid) o.equipment[it.slot] = null;
        h.equipment[slot] = id; it.equippedBy = hid;
      }
    }
  } else if (u.kind === 'bulk') {
    const miss = missing(state, u.res);
    if (Object.keys(miss).length) return { ok: false, reason: 'Une partie de ce qui a été obtenu est déjà dépensée', missing: miss };
    for (const [r, v] of Object.entries(u.res)) state.resources[r] = (state.resources[r] || 0) - v;
    for (const [g, n] of Object.entries(u.gemsOut || {})) { A.gemBag[g] = (A.gemBag[g] || 0) - n; if (A.gemBag[g] <= 0) delete A.gemBag[g]; }
    state.inventory.items.push(...u.items);
    A.gemSale.n = Math.max(0, A.gemSale.n - (u.quota || 0));
    A.stats.sold -= u.kind2 === 'sell' ? u.items.length : 0;
    A.stats.dismantled -= u.kind2 === 'dismantle' ? u.items.length : 0;
  } else return { ok: false, reason: 'Plus rien à annuler' };
  A.undo = null;
  return { ok: true, kind: u.kind };
}
export const undoAvailable = (state, now = Date.now()) => { const u = armoryState(state).undo; return u && now - u.t <= UNDO_MS ? u : null; };

// Meilleure pièce libre pour chaque héros et emplacement (badge « Meilleur pour… ») ; protège ces pièces du tri
export function bestForMap(state) {
  const by = itemsById(state);
  const free = state.inventory.items.filter((it) => !it.equippedBy);
  const out = new Map();
  for (const h of state.heroes) {
    const role = heroRole(h);
    const coefs = roleCoefs(h, role);
    for (const slot of SLOT_ORDER) {
      const cur = by.get(h.equipment[slot]);
      if (cur && (cur.locked || cur.reservedFor === h.id)) continue;
      let best = null, bg = cur ? linearGain(cur, coefs) : 0;
      for (const it of free) {
        if (it.slot !== slot || (it.reservedFor && it.reservedFor !== h.id)) continue;
        const g = linearGain(it, coefs);
        if (g > bg + EPS) { bg = g; best = it; }
      }
      if (best) { if (!out.has(best.id)) out.set(best.id, []); out.get(best.id).push(h.id); }
    }
  }
  return out;
}
// Objet qui n'améliorerait aucun héros (pour son rôle actuel)
export function improvesSomeone(state, item, cache = null) {
  const C = cache || coefCache(state);
  for (const h of state.heroes) {
    if (item.reservedFor && item.reservedFor !== h.id) continue;
    const cur = C.by.get(h.equipment[item.slot]);
    if (cur && (cur.locked || cur.reservedFor === h.id)) continue;
    const coefs = C.coefs.get(h.id);
    if (linearGain(item, coefs) > (cur ? linearGain(cur, coefs) : 0) + EPS) return true;
  }
  return false;
}
export function coefCache(state) {
  return { by: itemsById(state), coefs: new Map(state.heroes.map((h) => [h.id, roleCoefs(h)])) };
}

// ───────── Démantèlement et vente ─────────
const rIdx = (it) => RARITY_ORDER.indexOf(it.rarity);
const addTo = (o, r, v) => { if (v > 0) o[r] = (o[r] || 0) + v; };
// Démanteler : voir salvageYield (systems/items.js), révisé en v18
export const dismantleYield = (item, bonus = 0) => salvageYield(item, bonus);
// Cours du Joaillier : suit le cours des gemmes au marché (événements compris), borné à ±15 %
export function jewelerRate(state) {
  const p = state.market?.prices?.gems, base = RESOURCES.gems?.price || 25;
  return p ? Math.max(0.85, Math.min(1.15, p / base)) : 1;
}
export function sellValue(state, item) {
  const r = rIdx(item);
  const gold = Math.round(SELL_BASE_GOLD * Math.pow(1 + r, 1.7) * (1 + ((item.ilvl || 1) - 1) * 0.05) * (1 + (item.plus || 0) * 0.2) * jewelerRate(state));
  const jewel = JEWEL_SLOTS.includes(item.slot);
  const gems = (jewel && r >= 1 ? r : 0) + (!jewel && r >= 2 ? r - 1 : 0);
  return { gold, gems };
}
function gemQuota(state, now) {
  const A = armoryState(state);
  const d = Math.floor(now / DAY);
  if (A.gemSale.day !== d) A.gemSale = { day: d, n: 0 };
  return A.gemSale;
}
export const gemQuotaLeft = (state, now = Date.now()) => Math.max(0, GEM_DAILY - gemQuota(state, now).n);
// Total d'une vente : les gemmes au-delà du quota du jour sont payées en or
export function sellQuote(state, items, now = Date.now()) {
  let gold = 0, gems = 0;
  for (const it of items) { const v = sellValue(state, it); gold += v.gold; gems += v.gems; }
  const left = gemQuotaLeft(state, now);
  const paid = Math.min(gems, left);
  return { gold: gold + (gems - paid) * GEM_GOLD, gems: paid, gemsToGold: gems - paid };
}
export function dismantleQuote(state, items, bonus = 0) {
  const out = {};
  for (const it of items) for (const [r, v] of Object.entries(dismantleYield(it, bonus))) addTo(out, r, v);
  return out;
}
// Gemmes serties : toujours rendues à l'écrin quand l'objet est vendu, démantelé ou transmuté
function returnGems(state, it, out) {
  const A = armoryState(state);
  for (const g of it.sockets || []) if (g) { A.gemBag[g] = (A.gemBag[g] || 0) + 1; out[g] = (out[g] || 0) + 1; }
}
const protectedReason = (it, best) => (it.equippedBy ? 'porté' : it.locked ? 'verrouillé' : it.reservedFor ? 'réservé' : best?.has(it.id) ? 'meilleur pour un héros' : null);

// Vend ou démantèle une liste d'objets. manual = choix explicite du joueur (un objet « meilleur pour un héros » peut
// alors partir ; un objet porté ou verrouillé jamais).
export function disposeItems(state, ids, kind, now = Date.now(), { manual = false, mods = {}, best = null, undo = true } = {}) {
  const A = armoryState(state);
  const want = new Set(ids);
  const bestMap = manual ? null : best || bestForMap(state);
  const items = state.inventory.items.filter((it) => want.has(it.id) && !protectedReason(it, bestMap));
  const blocked = state.inventory.items.filter((it) => want.has(it.id) && protectedReason(it, bestMap));
  if (!items.length) return { ok: false, reason: blocked.length ? `Objet ${protectedReason(blocked[0], bestMap)} : il n'est ni vendu ni démantelé` : 'Aucun objet' };
  const res = {};
  let quota = 0;
  if (kind === 'sell') {
    const q = sellQuote(state, items, now);
    addTo(res, 'gold', q.gold); addTo(res, 'gems', q.gems);
    gemQuota(state, now).n += q.gems; quota = q.gems;
    A.stats.sold += items.length; A.stats.goldSold += q.gold; A.stats.gemsSold += q.gems;
  } else {
    Object.assign(res, dismantleQuote(state, items, mods['salvage.bonus'] || 0));
    A.stats.dismantled += items.length;
  }
  for (const [r, v] of Object.entries(res)) state.resources[r] = (state.resources[r] || 0) + v;
  const gemsOut = {};
  for (const it of items) returnGems(state, it, gemsOut);
  const gone = new Set(items.map((i) => i.id));
  state.inventory.items = state.inventory.items.filter((i) => !gone.has(i.id));
  if (undo) A.undo = { kind: 'bulk', kind2: kind, t: now, items: items.map((it) => ({ ...it, sockets: [...(it.sockets || [])] })), res, gemsOut, quota };
  return { ok: true, n: items.length, res, gemsOut, blocked: blocked.length };
}
export const sellItems = (state, ids, now, o) => disposeItems(state, ids, 'sell', now, o);
export const dismantleItems = (state, ids, now, o) => disposeItems(state, ids, 'dismantle', now, o);

// ───────── En masse : filtres et aperçu ─────────
// filter : { maxRarity, slot, maxIlvl, useless, duplicates }
export function bulkCandidates(state, filter = {}) {
  const best = bestForMap(state);
  const C = filter.useless ? coefCache(state) : null;
  const maxR = filter.maxRarity ? RARITY_ORDER.indexOf(filter.maxRarity) : RARITY_ORDER.length - 1;
  const dup = filter.duplicates ? duplicateIds(state) : null;
  const pick = [], kept = { porté: 0, verrouillé: 0, réservé: 0, 'meilleur pour un héros': 0 };
  for (const it of state.inventory.items) {
    if (rIdx(it) > maxR) continue;
    if (filter.slot && it.slot !== filter.slot) continue;
    if (filter.rarities?.length && !filter.rarities.includes(it.rarity)) continue;
    if (filter.slots?.length && !filter.slots.includes(it.slot)) continue;
    if (filter.maxIlvl && (it.ilvl || 1) > filter.maxIlvl) continue;
    if (dup && !dup.has(it.id)) continue;
    const why = protectedReason(it, best);
    if (why) { kept[why]++; continue; }
    if (C && improvesSomeone(state, it, C)) continue;
    pick.push(it);
  }
  return { items: pick, kept, best };
}
// Doublons : même modèle et même rareté qu'une pièce au moins aussi forte (on garde la meilleure de chaque groupe)
export function duplicateIds(state) {
  const groups = new Map();
  for (const it of state.inventory.items) { const k = `${it.base}|${it.rarity}`; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(it); }
  const out = new Set();
  for (const g of groups.values()) {
    if (g.length < 2) continue;
    g.sort((a, b) => (b.equippedBy ? 1 : 0) - (a.equippedBy ? 1 : 0) || itemScore(b) - itemScore(a) || (a.id < b.id ? -1 : 1));
    for (const it of g.slice(1)) out.add(it.id);
  }
  return out;
}
export function bulkPreview(state, filter, kind, now = Date.now(), mods = {}) {
  const c = bulkCandidates(state, filter);
  const quote = kind === 'sell' ? sellQuote(state, c.items, now) : null;
  return { ...c, n: c.items.length, res: kind === 'sell' ? { gold: quote.gold, ...(quote.gems ? { gems: quote.gems } : {}) } : dismantleQuote(state, c.items, mods['salvage.bonus'] || 0), gemsToGold: quote?.gemsToGold || 0, gemsBack: c.items.reduce((n, it) => n + (it.sockets || []).filter(Boolean).length, 0) };
}
export function bulkApply(state, filter, kind, now = Date.now(), mods = {}) {
  const c = bulkCandidates(state, filter);
  if (!c.items.length) return { ok: false, reason: 'Aucun objet ne correspond à ces filtres' };
  return disposeItems(state, c.items.map((i) => i.id), kind, now, { mods, best: c.best });
}
export function saveFilter(state, name, filter) {
  const A = armoryState(state);
  const f = { name: String(name || 'Filtre').slice(0, 24), filter: { ...filter } };
  A.filters = [f, ...A.filters.filter((x) => x.name !== f.name)].slice(0, SAVED_FILTERS_MAX);
  return { ok: true };
}

// ───────── Butin : équipement automatique, règles de tri, plafond ─────────
export const lootRules = (state) => (state.orders || []).filter((o) => o.cond?.type === 'loot');
export function ruleMatches(rule, it, state, C) {
  const c = rule.cond;
  if (c.rarityMax && rIdx(it) > RARITY_ORDER.indexOf(c.rarityMax)) return false;
  if (c.rarityMin && rIdx(it) < RARITY_ORDER.indexOf(c.rarityMin)) return false;
  if (c.slot && it.slot !== c.slot) return false;
  if (c.rarities?.length && !c.rarities.includes(it.rarity)) return false;
  if (c.slots?.length && !c.slots.includes(it.slot)) return false;
  if (c.maxIlvl && (it.ilvl || 1) > c.maxIlvl) return false;
  if (c.useful === 'useless' && improvesSomeone(state, it, C)) return false;
  return true;
}
// Appelé à chaque pas du monde : traite les objets arrivés depuis le dernier passage
export function lootTick(state, now = Date.now(), mods = {}) {
  const A = armoryState(state);
  const fresh = state.inventory.items.filter((it) => !it.got);
  if (!fresh.length && state.inventory.items.length <= INVENTORY_CAP) return null;
  for (const it of fresh) { it.got = now; if (!Array.isArray(it.sockets)) it.sockets = emptySockets(it.rarity); }
  const report = { t: now, lines: [], res: {}, n: 0 };
  // 1) Équiper automatiquement le butin meilleur (facultatif)
  if (A.settings.autoLoot && fresh.length) {
    for (const it of fresh) {
      let best = null, bg = 0;
      for (const h of state.heroes) {
        if (h.marchId || (it.reservedFor && it.reservedFor !== h.id)) continue;
        const cur = state.inventory.items.find((x) => x.id === h.equipment[it.slot]);
        if (cur && (cur.locked || cur.reservedFor === h.id)) continue;
        const g = itemGain(state, h, it);
        if (g > bg + 0.05) { bg = g; best = h; }
      }
      if (best) {
        const cur = state.inventory.items.find((x) => x.id === best.equipment[it.slot]);
        if (cur) cur.equippedBy = null;
        best.equipment[it.slot] = it.id; it.equippedBy = best.id;
        A.stats.autoEquips++;
        log(state, 'good', `🎒 ${it.name} équipé par ${best.name} (${heroGainText(best, bg)}).`, now);
      }
    }
  }
  // 2) Règles de tri, dans l'ordre ; la première qui correspond décide. Jamais un objet porté, verrouillé, réservé
  //    ou meilleur pour un héros
  const rules = lootRules(state).filter((o) => o.enabled);
  if (rules.length && fresh.length) {
    const C = coefCache(state);
    const best = bestForMap(state);
    const sell = [], scrap = [];
    for (const it of fresh) {
      if (protectedReason(it, best)) continue;
      const r = rules.find((o) => ruleMatches(o, it, state, C));
      if (!r || r.action.type === 'lootKeep') continue;
      (r.action.type === 'lootSell' ? sell : scrap).push(it.id);
      r.runs = (r.runs || 0) + 1; r.lastRun = now;
    }
    for (const [ids, kind] of [[sell, 'sell'], [scrap, 'dismantle']]) {
      if (!ids.length) continue;
      const names = state.inventory.items.filter((i) => ids.includes(i.id)).map((i) => i.name);
      const r = disposeItems(state, ids, kind, now, { mods, best, undo: false });
      if (!r.ok) continue;
      A.stats.ruled += r.n;
      report.n += r.n;
      for (const [k, v] of Object.entries(r.res)) addTo(report.res, k, v);
      report.lines.push(`${kind === 'sell' ? 'Vendus' : 'Démantelés'} (${r.n}) : ${names.slice(0, 6).join(', ')}${names.length > 6 ? '…' : ''}`);
    }
    if (report.n) { report.kind = 'rules'; pushReport(state, report); log(state, 'info', `🗂️ Règles de tri : ${report.lines.join(' ; ')} → ${resText(report.res)}.`, now); }
  }
  // 3) Plafond : au-delà, les pièces les moins utiles sont démantelées, avec un rapport ; jamais une pièce protégée
  return capOverflow(state, now, mods);
}
export const INVENTORY_CAP = 300;
export function capOverflow(state, now = Date.now(), mods = {}) {
  const items = state.inventory.items;
  if (items.length <= INVENTORY_CAP) return null;
  const A = armoryState(state);
  const best = bestForMap(state);
  const C = coefCache(state);
  const usefulness = (it) => { let m = 0; for (const h of state.heroes) m = Math.max(m, linearGain(it, C.coefs.get(h.id))); return m; };
  const free = items.filter((it) => !protectedReason(it, best)).map((it) => ({ it, u: usefulness(it) })).sort((a, b) => a.u - b.u || itemScore(a.it) - itemScore(b.it));
  const excess = Math.min(free.length, items.length - INVENTORY_CAP);
  if (!excess) { if (!A.capWarned || now - A.capWarned > DAY) { A.capWarned = now; log(state, 'warn', `🎒 Inventaire au-delà de ${INVENTORY_CAP} objets, mais tous sont portés, verrouillés, réservés ou meilleurs pour un héros : rien n’est touché.`, now); } return null; }
  const victims = free.slice(0, excess).map((x) => x.it);
  const names = victims.map((i) => i.name);
  const r = disposeItems(state, victims.map((i) => i.id), 'dismantle', now, { mods, best, undo: false });
  if (!r.ok) return null;
  A.stats.capped += r.n;
  const report = { t: now, kind: 'cap', n: r.n, res: r.res, lines: [`Démantelés (${r.n}) : ${names.slice(0, 10).join(', ')}${names.length > 10 ? `… et ${names.length - 10} autres` : ''}`] };
  pushReport(state, report);
  log(state, 'warn', `🎒 Inventaire plein (${INVENTORY_CAP}) : ${r.n} objet(s) parmi les moins utiles démantelé(s) → ${resText(r.res)}. Détail dans l’Armurerie › Règles de tri ; ajoutez des règles ou verrouillez 🔒 ce que vous gardez.`, now);
  return report;
}
function pushReport(state, rep) { const A = armoryState(state); A.reports.unshift(rep); if (A.reports.length > 20) A.reports.length = 20; }
export const resText = (res) => Object.entries(res).map(([r, v]) => `${Math.round(v)} ${RESOURCES[r]?.name?.toLowerCase() || r}`).join(', ') || 'rien';
export function heroGainText(hero, gain) { const role = heroRole(hero); return `+${(Math.round(gain * 10) / 10).toString().replace('.', ',')} pts ${role.kind === 'governor' ? 'd’intendance' : COMMAND_FOCUS[role.focus].name.toLowerCase()}`; }

// Règles de tri = ordres du royaume de type « loot » (hors quota des ordres, voir data/armory.js)
export function addLootRule(state, { rarityMax = 'common', rarityMin = '', slot = '', useful = 'any', action = 'lootDismantle', name = null } = {}) {
  if (lootRules(state).length >= LOOT_RULES_MAX) return { ok: false, reason: `Au plus ${LOOT_RULES_MAX} règles de tri` };
  if (!['lootSell', 'lootDismantle', 'lootKeep'].includes(action)) return { ok: false, reason: 'Action inconnue' };
  if ((rarityMax && !RARITIES[rarityMax]) || (rarityMin && !RARITIES[rarityMin])) return { ok: false };
  if (slot && !SLOTS[slot]) return { ok: false };
  state.orders ||= [];
  const label = name || `${action === 'lootSell' ? 'Vendre' : action === 'lootDismantle' ? 'Démanteler' : 'Garder'} ${slot ? SLOTS[slot].name.toLowerCase() + 's ' : ''}≤ ${RARITIES[rarityMax].name.toLowerCase()}${useful === 'useless' ? ' inutiles' : ''}`;
  state.orders.push({ id: uid('o'), name: label, enabled: true, cond: { type: 'loot', rarityMax, slot, useful }, action: { type: action }, cooldown: 0, lastRun: 0, runs: 0, lastMsg: '' });
  return { ok: true };
}

// ───────── Gemmes taillées ─────────
export const gemKey = (type, q) => `${type}:${q}`;
export function gemName(g) { const p = parseGem(g); return p ? `${GEM_TYPES[p.type].name} ${GEM_QUALITIES[p.q].name.toLowerCase()}` : '?'; }
export function gemText(g) { return Object.entries(gemMods(g)).map(([k, v]) => fmtMod(k, v)).join(', '); }
export function cutGem(state, type) {
  if (!GEM_TYPES[type]) return { ok: false, reason: 'Gemme inconnue' };
  if (!pay(state, CUT_COST)) return { ok: false, reason: 'Ressources insuffisantes', missing: missing(state, CUT_COST) };
  const A = armoryState(state);
  const k = gemKey(type, 0);
  A.gemBag[k] = (A.gemBag[k] || 0) + 1;
  A.stats.gemsCut++;
  return { ok: true, gem: k };
}
export function fuseGems(state, type, q) {
  const A = armoryState(state);
  const k = gemKey(type, q);
  if (!GEM_TYPES[type] || !(q >= 0 && q < 3)) return { ok: false, reason: 'Qualité maximale' };
  if ((A.gemBag[k] || 0) < FUSE_N) return { ok: false, reason: `Il faut ${FUSE_N} gemmes de cette qualité` };
  const c = fuseCost(q);
  if (!pay(state, c)) return { ok: false, reason: 'Pas assez d’or', missing: missing(state, c) };
  A.gemBag[k] -= FUSE_N; if (!A.gemBag[k]) delete A.gemBag[k];
  const up = gemKey(type, q + 1);
  A.gemBag[up] = (A.gemBag[up] || 0) + 1;
  return { ok: true, gem: up };
}
const wearerMarching = (state, it) => it.equippedBy && state.heroes.find((h) => h.id === it.equippedBy)?.marchId;
export function socketGem(state, itemId, idx, g) {
  const A = armoryState(state);
  const it = state.inventory.items.find((i) => i.id === itemId);
  if (!it || !parseGem(g)) return { ok: false };
  if (wearerMarching(state, it)) return { ok: false, reason: 'Porté par un héros en marche' };
  if (!(idx >= 0 && idx < (it.sockets || []).length)) return { ok: false, reason: 'Pas de châsse ici' };
  if (it.sockets[idx]) return { ok: false, reason: 'Châsse occupée : dessertissez d’abord' };
  if (!(A.gemBag[g] > 0)) return { ok: false, reason: 'Cette gemme n’est pas dans l’écrin' };
  A.gemBag[g]--; if (!A.gemBag[g]) delete A.gemBag[g];
  it.sockets[idx] = g;
  return { ok: true };
}
export function unsocketGem(state, itemId, idx) {
  const A = armoryState(state);
  const it = state.inventory.items.find((i) => i.id === itemId);
  const g = it?.sockets?.[idx];
  if (!g) return { ok: false, reason: 'Châsse vide' };
  if (wearerMarching(state, it)) return { ok: false, reason: 'Porté par un héros en marche' };
  const c = unsetCost(parseGem(g).q);
  if (!pay(state, c)) return { ok: false, reason: 'Pas assez d’or', missing: missing(state, c) };
  it.sockets[idx] = null;
  A.gemBag[g] = (A.gemBag[g] || 0) + 1;
  return { ok: true, gem: g };
}
// Sertir au mieux : la gemme de l'écrin qui rapporte le plus à ce héros, dans chaque châsse vide de ses pièces
export function autoSocket(state, heroId) {
  const A = armoryState(state);
  const h = state.heroes.find((x) => x.id === heroId);
  if (!h || h.marchId) return { ok: false, reason: 'Héros indisponible' };
  const coefs = roleCoefs(h);
  let n = 0;
  for (const id of Object.values(h.equipment)) {
    const it = state.inventory.items.find((i) => i.id === id);
    if (!it) continue;
    for (let i = 0; i < (it.sockets || []).length; i++) {
      if (it.sockets[i]) continue;
      const g = Object.keys(A.gemBag).filter((k) => A.gemBag[k] > 0).sort((a, b) => dot(gemMods(b), coefs) - dot(gemMods(a), coefs))[0];
      if (!g || dot(gemMods(g), coefs) <= EPS) break;
      socketGem(state, it.id, i, g); n++;
    }
  }
  return n ? { ok: true, n } : { ok: false, reason: 'Aucune châsse vide ou aucune gemme utile à ce héros' };
}

// ───────── Ensembles ─────────
export function noteSets(state, now = Date.now()) {
  const A = armoryState(state);
  const by = itemsById(state);
  for (const h of state.heroes) {
    const c = setCounts(Object.values(h.equipment).map((id) => by.get(id)).filter(Boolean));
    for (const [k, n] of Object.entries(c)) if (n >= 4 && !A.setsDone[k]) { A.setsDone[k] = now; log(state, 'good', `${ITEM_SETS[k].icon} Ensemble complet : ${ITEM_SETS[k].name} (${h.name}). Il entre dans la collection.`, now); }
  }
}

// ───────── Tenues ─────────
export function saveOutfit(state, heroId, idx, name = null, role = null) {
  const h = state.heroes.find((x) => x.id === heroId);
  if (!h || !(idx >= 0 && idx < OUTFITS_MAX)) return { ok: false };
  h.outfits ||= [];
  const auto = role === 'governor' || role === 'commander' ? role : null;
  // Une seule tenue par rôle déclencheur
  if (auto) for (const o of h.outfits) if (o && o.role === auto) o.role = null;
  h.outfits[idx] = { name: String(name || `Tenue ${idx + 1}`).slice(0, 24), items: { ...h.equipment }, role: auto };
  return { ok: true };
}
export function setOutfitRole(state, heroId, idx, role) {
  const h = state.heroes.find((x) => x.id === heroId);
  const o = h?.outfits?.[idx];
  if (!o) return { ok: false };
  const auto = role === 'governor' || role === 'commander' ? role : null;
  if (auto) for (const x of h.outfits) if (x && x.role === auto) x.role = null;
  o.role = auto;
  return { ok: true };
}
export function deleteOutfit(state, heroId, idx) { const h = state.heroes.find((x) => x.id === heroId); if (!h?.outfits?.[idx]) return { ok: false }; h.outfits[idx] = null; return { ok: true }; }
export function wearOutfit(state, heroId, idx) {
  const h = state.heroes.find((x) => x.id === heroId);
  const o = h?.outfits?.[idx];
  if (!o) return { ok: false, reason: 'Tenue vide' };
  if (h.marchId) return { ok: false, reason: 'Héros en marche' };
  const by = itemsById(state);
  const skipped = [];
  for (const slot of SLOT_ORDER) {
    const want = o.items[slot] || null;
    if ((h.equipment[slot] || null) === want) continue;
    const cur = by.get(h.equipment[slot]);
    if (cur && (cur.locked || cur.reservedFor === h.id) && want) { skipped.push(SLOTS[slot].name); continue; }
    if (!want) { if (cur) { cur.equippedBy = null; h.equipment[slot] = null; } continue; }
    const it = by.get(want);
    if (!it) { skipped.push(SLOTS[slot].name); continue; }
    const owner = it.equippedBy && state.heroes.find((x) => x.id === it.equippedBy);
    if (owner && owner.id !== h.id && (owner.marchId || it.reservedFor === owner.id)) { skipped.push(SLOTS[slot].name); continue; }
    if (owner && owner.id !== h.id) owner.equipment[slot] = null;
    if (cur) cur.equippedBy = null;
    h.equipment[slot] = it.id; it.equippedBy = h.id;
  }
  noteSets(state);
  return { ok: true, skipped };
}
// Au changement d'affectation : une tenue marquée pour le nouveau rôle est revêtue d'office ; sinon un plan
// d'équipement adapté est proposé (jamais appliqué sans accord)
export function onRoleChange(state, heroId) {
  const h = state.heroes.find((x) => x.id === heroId);
  if (!h) return null;
  const kind = heroRole(h).kind;
  const idx = (h.outfits || []).findIndex((o) => o && o.role === kind);
  if (idx >= 0) { const r = wearOutfit(state, heroId, idx); return { outfit: h.outfits[idx].name, ...r }; }
  const plan = planAutoEquip(state, { heroIds: [heroId] });
  return plan.changes.length ? { plan } : null;
}

// ───────── Transmutation et réforge ─────────
export function transmuteCheck(state, fromId, toId) {
  const by = itemsById(state);
  const a = by.get(fromId), b = by.get(toId);
  if (!a || !b || a.id === b.id) return { ok: false, reason: 'Choisissez deux objets' };
  if (a.slot !== b.slot) return { ok: false, reason: 'Même emplacement requis' };
  if (a.equippedBy || a.locked) return { ok: false, reason: 'L’objet sacrifié ne doit être ni porté ni verrouillé' };
  if (wearerMarching(state, b)) return { ok: false, reason: 'Porté par un héros en marche' };
  const plus = Math.min(MAX_PLUS[b.rarity], Math.floor((a.plus || 0) * TRANSMUTE_SHARE));
  if (plus <= (b.plus || 0)) return { ok: false, reason: `Rien à gagner : ${a.name} +${a.plus || 0} donnerait +${plus}` };
  return { ok: true, plus, cost: transmuteCost(a.plus) };
}
export function transmute(state, fromId, toId) {
  const c = transmuteCheck(state, fromId, toId);
  if (!c.ok) return c;
  if (!pay(state, c.cost)) return { ok: false, reason: 'Ressources insuffisantes', missing: missing(state, c.cost) };
  const by = itemsById(state);
  const a = by.get(fromId), b = by.get(toId);
  returnGems(state, a, {});
  b.plus = c.plus;
  state.inventory.items = state.inventory.items.filter((i) => i.id !== a.id);
  return { ok: true, plus: c.plus, name: b.name };
}
// Les affixes de signature du modèle ne se réforgent pas ; les objets uniques non plus
export function reforgeable(item) {
  if (!item || item.unique || !ITEM_BASES[item.base]) return [];
  const sig = Object.keys(ITEM_BASES[item.base].sig);
  return Object.keys(item.affixes).filter((k) => !sig.includes(k));
}
export const reforgeQuote = (item) => reforgeCost(item.reforges || 0, rIdx(item));
export function reforge(state, itemId, stat) {
  const it = state.inventory.items.find((i) => i.id === itemId);
  if (!it) return { ok: false };
  if (!reforgeable(it).includes(stat)) return { ok: false, reason: 'Cet effet ne se réforge pas (signature du modèle)' };
  if (wearerMarching(state, it)) return { ok: false, reason: 'Porté par un héros en marche' };
  const base = ITEM_BASES[it.base];
  const pool = [...new Set([...base.pool, 'combat.atk', 'combat.def', 'gather.all', 'loot.rare', 'prod.all', 'hero.xp', 'stat.force', 'stat.cunning', 'stat.lore', 'stat.command'])].filter((k) => !(k in it.affixes) && AFFIXES[k]);
  if (!pool.length) return { ok: false, reason: 'Aucun autre effet possible' };
  const cost = reforgeQuote(it);
  if (!pay(state, cost)) return { ok: false, reason: 'Ressources insuffisantes', missing: missing(state, cost) };
  const k = rng.pick(pool);
  const rm = RARITIES[it.rarity].mult, lvl = 1 + ((it.ilvl || 1) - 1) * 0.06;
  const v = AFFIXES[k].base * rm * lvl * rng.float(0.8, 1.1);
  delete it.affixes[stat];
  it.affixes[k] = AFFIXES[k].pct ? Math.round(v * 1000) / 1000 : Math.round(v * 10) / 10;
  it.reforges = (it.reforges || 0) + 1;
  return { ok: true, from: stat, to: k };
}

// ───────── Conseils de la taverne ─────────
// Meilleure affectation d'intendant (un héros par secteur), chiffrée par le bonus de secteur obtenu
function sectorScore(state, hero, sector) {
  const h = { ...hero, assignment: { type: 'governor', sector } };
  const m = heroMods(state, h, 'governor');
  return Math.abs(m[SECTORS[sector].mods[0]] || 0); // l'effet principal du secteur (nourriture, bois, or…)
}
const pctTxt = (v) => (Math.round(v * 1000) / 10).toString().replace('.', ',');
export function tavernAdvice(state) {
  const heroes = state.heroes.filter((h) => !h.marchId);
  const pairs = [];
  for (const h of heroes) for (const sec of Object.keys(SECTORS)) pairs.push({ h, sec, v: sectorScore(state, h, sec) });
  pairs.sort((a, b) => b.v - a.v);
  const usedH = new Set(), usedS = new Set(), plan = new Map();
  // On ne nomme pas plus d'intendants qu'aujourd'hui (au moins un), pour ne pas vider les commandants
  const nGov = Math.max(1, heroes.filter((h) => h.assignment).length);
  for (const p of pairs) {
    if (plan.size >= nGov) break;
    if (usedH.has(p.h.id) || usedS.has(p.sec)) continue;
    usedH.add(p.h.id); usedS.add(p.sec); plan.set(p.h.id, p);
  }
  const out = [];
  for (const h of heroes) {
    const p = plan.get(h.id);
    const cur = h.assignment?.sector || null;
    if (p && p.sec !== cur) {
      const now = cur ? sectorScore(state, h, cur) : 0;
      const star = HERO_CLASSES[h.cls].sector === p.sec ? ' (★ spécialité de sa classe)' : '';
      out.push({ heroId: h.id, to: p.sec, text: `${h.name} → intendant ${SECTORS[p.sec].name}${star} : ${modLabel(SECTORS[p.sec].mods[0]).toLowerCase()} +${pctTxt(p.v)} %${cur ? ` (aujourd’hui ${SECTORS[cur].name} : ${modLabel(SECTORS[cur].mods[0]).toLowerCase()} +${pctTxt(now)} %)` : ''}.` });
    } else if (!p && cur) {
      out.push({ heroId: h.id, to: null, text: `${h.name} → commandant (${COMMAND_FOCUS[heroRole({ ...h, assignment: null }).focus].name.toLowerCase()}) : un autre héros tient mieux ${SECTORS[cur].name}.` });
    }
  }
  return out;
}
export { parseGem as parseGemKey };

// v22b : la sélection groupée du tri en masse (raretés, emplacements, niveau) devient une règle de vente automatique :
// chaque butin qui lui correspond est vendu à son arrivée (jamais une pièce protégée, voir lootTick)
export function autoSellRule(state, filter = {}, name = null) {
  if (lootRules(state).length >= LOOT_RULES_MAX) return { ok: false, reason: `Au plus ${LOOT_RULES_MAX} règles de tri` };
  const rarities = (filter.rarities || []).filter((r) => RARITIES[r]);
  const slots = (filter.slots || []).filter((k) => SLOTS[k]);
  const cond = { type: 'loot', rarityMax: RARITIES[filter.maxRarity] ? filter.maxRarity : '', slot: SLOTS[filter.slot] ? filter.slot : '', useful: filter.useless ? 'useless' : 'any' };
  if (rarities.length) cond.rarities = rarities;
  if (slots.length) cond.slots = slots;
  if (filter.maxIlvl > 0) cond.maxIlvl = Math.floor(filter.maxIlvl);
  if (!cond.rarityMax && !rarities.length) return { ok: false, reason: 'Choisissez au moins une rareté : la vente automatique de tout le butin est refusée' };
  const rn = rarities.length ? rarities.map((r) => RARITIES[r].name.toLowerCase()).join(', ') : `≤ ${RARITIES[cond.rarityMax].name.toLowerCase()}`;
  const sn = slots.length ? slots.map((k) => SLOTS[k].name.toLowerCase()).join(', ') : cond.slot ? SLOTS[cond.slot].name.toLowerCase() : 'tout emplacement';
  const label = name || `Vendre ${rn} · ${sn}${cond.maxIlvl ? ` · niv. ≤ ${cond.maxIlvl}` : ''}${cond.useful === 'useless' ? ' · inutiles' : ''}`;
  state.orders ||= [];
  state.orders.push({ id: uid('o'), name: label.slice(0, 80), enabled: true, cond, action: { type: 'lootSell' }, cooldown: 0, lastRun: 0, runs: 0, lastMsg: '' });
  return { ok: true, label };
}
