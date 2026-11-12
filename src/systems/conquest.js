// v26 « Nouvelles conquêtes » — six mécaniques du genre, branchées sur nos systèmes existants :
//  1. Métropoles : trois grandes cités libres deviennent des places fortes à assiéger (siège v19). Prises, on choisit
//     de les piller, de les vassaliser ou de les libérer : conseil royal, réputation, mémoire et rancune de la maison
//     protectrice, qui peut contre-attaquer (marche visible vers la métropole).
//  2. Prisonniers et rançons : un seigneur ou un gouverneur vaincu peut être capturé ; rançon, échange, ralliement ou
//     libération, avec leurs effets sur la réputation et la rancune de sa maison.
//  3. Fausses bannières : la garnison affichée aux espions ennemis paraît plus forte (moins de raids, mais plus
//     lourds) ou plus faible (plus de raids, plus légers). Une ruse éventée est retenue par la maison bernée.
//  4. Saison de guerre : trois semaines de campagne contre les maisons, avec classement (seigneurs simulés hors
//     ligne) et récompenses de prestige seulement (titre, décoration) ; le meilleur rang est gardé par la dynastie.
//  5. Îles de Cendre : un archipel émerge au bord du monde pour une semaine ; une île tenue rapporte des cristaux
//     chaque jour ; les maisons rivales se disputent aussi les îles.
//  6. Calendrier de fidélité : une récompense par jour de visite, sans série à perdre (un jour manqué ne coûte rien),
//     tirée des récompenses existantes.
// Aucune monnaie nouvelle, aucun avantage payant, aucune production de masse ; tout se rejoue hors ligne.
import { POI_TYPES, RIVALS } from '../data/world.js';
import { rng, mulberry32 } from '../core/rng.js';
import { uid, fmt } from '../core/util.js';
import { thLevel } from './city.js';
import { gain } from './economy.js';
import { computeMods } from './modifiers.js';
import { changeRelation } from './factions.js';
import { remember } from './rivalry.js';
import { bumpRep } from './reputation.js';
import { shiftFavor } from './council.js';
import { log } from './log.js';
import { chronicle } from './chronicle.js';
import { key, reveal } from './world.js';
import { makeEnemies } from './worldgen.js';

const H = 3600000, DAY = 24 * H;
export const CONQUEST = {
  metroCount: 3, metroMinDist: 12, metroWall: 0.9, metroRegrow: 7 * DAY,
  vassalTribute: 150, // or par jour et par rang de la cité (petit tribut)
  counterAfter: [36, 72], // délai (h) avant la contre-attaque de la maison protectrice
  captureChance: { kingdom: 0.35, breach: 0.5, metro: 1 },
  bannerCost: { gold: 300 }, bannerDays: 3,
  seasonDays: 21, seasonGap: 7, lbSize: 40,
  isleEvery: 21, isleDays: 7, isleCount: 4, isleCrystals: 6, isleSteal: 0.12,
};
const LOYALTY = [
  { res: { food: 800, wood: 800 } }, { speedups: { speed5: 2 } }, { res: { stone: 800, iron: 300 } }, { speedups: { rspeed5: 2 } },
  { res: { gold: 600 } }, { consumable: { healPotion: 1 } }, { res: { crystals: 3, gold: 400 } },
];

export function conquestState(state) {
  const C = (state.conquest ||= {});
  C.prisoners ||= []; C.season ||= null; C.seasonsDone ||= []; C.isles ||= null; C.loyalty ||= { days: 0, last: null };
  C.banner ||= { mode: 'none', until: 0, fooled: {} }; C.threats ||= [];
  return C;
}
const towns = (state) => Object.values(state.world?.pois || {}).filter((p) => p.type === 'town');
const kingdomOf = (state, idx) => Object.values(state.world.pois).find((p) => p.type === 'kingdom' && p.rival === idx) || null;
export const metropolises = (state) => towns(state).filter((p) => p.metro);
function nearestHouse(state, p) {
  const ks = Object.values(state.world.pois).filter((k) => k.type === 'kingdom');
  return ks.sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y))[0] || null;
}

// ───────── 1. Métropoles ─────────
export function ensureMetropolises(state) {
  const C = conquestState(state);
  if (C.metroInit || !state.world?.capital) return metropolises(state);
  C.metroInit = true;
  const c = state.world.capital;
  const cand = towns(state).filter((p) => Math.hypot(p.x - c.x, p.y - c.y) >= CONQUEST.metroMinDist)
    .sort((a, b) => (b.rank || 0) - (a.rank || 0) || Math.hypot(a.x - c.x, a.y - c.y) - Math.hypot(b.x - c.x, b.y - c.y)).slice(0, CONQUEST.metroCount);
  cand.forEach((p, i) => { const h = nearestHouse(state, p); p.metro = { power: 1 + i * 0.5, wall: CONQUEST.metroWall, status: 'free', protector: h?.rival ?? null, garrison: null, regrowAt: 0 }; });
  return cand;
}
export function metroGarrison(state, p) {
  const k = (1 + p.metro.power) * (1 + thLevel(state) * 0.35);
  return { militia: Math.round(40 * k), guard: Math.round(28 * k), royalArcher: Math.round(24 * k), royalKnight: Math.round(10 * k) };
}
export const metroAttackable = (p, now) => !!p?.metro && p.metro.status !== 'vassal' && !(p.metro.regrowAt > now);
export function metroDefense(state, p) {
  if (!p.metro.garrison) p.metro.garrison = metroGarrison(state, p);
  return { enemies: p.metro.garrison, fort: p.metro.wall };
}
// Victoire : décision « que faire de la cité ? » + gouverneur capturé
export function onMetroTaken(state, p, t) {
  p.metro.garrison = null;
  p.metro.takenAt = t;
  state.pending.push({ id: uid('pd'), kind: 'metro', x: p.x, y: p.y, poiId: p.id, t, deadline: t + 24 * H });
  capture(state, { name: `Gouverneur de ${p.name}`, house: p.metro.protector, kind: 'governor', rank: 2 }, t);
  addSeasonPoints(state, 400, `prise de ${p.name}`, t);
  log(state, 'good', `🏰 ${p.name} est à vous ! Décidez de son sort (pillage, vassalité ou liberté).`, t);
}
export const METRO_CHOICES = [
  { id: 'pillage', label: 'Piller la cité', hint: 'Gros butin d’or et de ressources ; réputation de tyran, colère de la maison protectrice et des marchands ; la cité se relève en 7 jours.' },
  { id: 'vassal', label: 'En faire un vassal', hint: `Tribut quotidien en or ; la maison protectrice prépare une contre-attaque (visible) pour la reprendre.` },
  { id: 'free', label: 'Libérer la cité', hint: 'Réputation de bienfaiteur et de diplomate, faveur du peuple et des marchands, un présent de remerciement.' },
];
export function describeMetro(state, p) {
  const poi = state.world.pois[key(p.x, p.y)];
  return { icon: '🏰', title: `Le sort de ${poi?.name || 'la métropole'}`, text: 'Vos troupes tiennent la cité. Le conseil attend votre décision ; la maison qui la protégeait s’en souviendra.', choices: METRO_CHOICES.map((c) => ({ label: c.label, hint: c.hint })), deadline: p.deadline, coords: `(${p.x}, ${p.y})` };
}
export function resolveMetro(state, pid, idx, now = Date.now()) {
  const p = state.pending.find((x) => x.id === pid);
  if (!p) return { ok: false, reason: 'Décision introuvable' };
  state.pending = state.pending.filter((x) => x.id !== pid);
  const poi = state.world.pois[key(p.x, p.y)];
  if (!poi?.metro) return { ok: false, reason: 'Cité introuvable' };
  const M = poi.metro, h = M.protector, rank = Math.max(1, poi.rank || 1);
  const ch = METRO_CHOICES[idx ?? 0]?.id || 'pillage';
  const mods = computeMods(state, now);
  let text;
  if (ch === 'pillage') {
    const loot = { gold: 2500 * rank, iron: 600 * rank, stone: 900 * rank, food: 1200 * rank };
    gain(state, loot, mods);
    bumpRep(state, 'tyrant', 8);
    if (h != null) { changeRelation(state, h, -20); remember(state, h, 'metroSack', -25, `${poi.name} pillée`, now); const k = kingdomOf(state, h); if (k) k.anger = (k.anger || 0) + 2; }
    shiftFavor(state, 'army', 6, `Pillage de ${poi.name}`, now); shiftFavor(state, 'merchants', -8, `Pillage de ${poi.name}`, now);
    M.status = 'pillaged'; M.regrowAt = now + CONQUEST.metroRegrow;
    text = `${poi.name} est pillée : ${fmt(loot.gold)} or et des ressources.`;
  } else if (ch === 'vassal') {
    M.status = 'vassal'; M.since = now; M.tributeAt = now + DAY;
    if (h != null) { changeRelation(state, h, -10); remember(state, h, 'metroVassal', -12, `${poi.name} vassalisée`, now); scheduleCounter(state, poi, now); }
    shiftFavor(state, 'nobles', 5, `${poi.name} vassale`, now);
    text = `${poi.name} devient votre vassale : tribut de ${fmt(CONQUEST.vassalTribute * rank)} or par jour.`;
  } else {
    gain(state, { gold: 800 * rank, food: 1000 * rank }, mods);
    bumpRep(state, 'benefactor', 10); bumpRep(state, 'diplomat', 5);
    if (h != null) { changeRelation(state, h, 5); remember(state, h, 'metroFree', 8, `${poi.name} libérée`, now); }
    shiftFavor(state, 'peasants', 6, `${poi.name} libérée`, now); shiftFavor(state, 'merchants', 6, `${poi.name} libérée`, now);
    M.status = 'liberated'; M.regrowAt = now + CONQUEST.metroRegrow;
    text = `${poi.name} est libre : ses habitants vous offrent des présents.`;
  }
  chronicle(state, `${state.meta.kingdomName} prend ${poi.name} et choisit : ${METRO_CHOICES.find((c) => c.id === ch).label.toLowerCase()}.`, now, 'war', `metro:${poi.id}:${p.t}`);
  log(state, 'info', `🏰 ${text}`, now);
  return { ok: true, text };
}
function scheduleCounter(state, poi, now) {
  const C = conquestState(state);
  const k = kingdomOf(state, poi.metro.protector);
  if (!k) return;
  const r = mulberry32((poi.x * 131 + poi.y * 7 + Math.floor(now / H)) >>> 0);
  const at = now + (CONQUEST.counterAfter[0] + r() * (CONQUEST.counterAfter[1] - CONQUEST.counterAfter[0])) * H;
  C.threats.push({ id: uid('ct'), kind: 'counter', from: { x: k.x, y: k.y, name: k.name }, to: { x: poi.x, y: poi.y, name: poi.name }, start: at - 6 * H, arrive: at, house: poi.metro.protector, label: `Contre-attaque de ${k.name} sur ${poi.name}` });
}

// ───────── 2. Prisonniers et rançons ─────────
export function capture(state, who, now) {
  const C = conquestState(state);
  const p = { id: uid('pr'), name: who.name, house: who.house ?? null, kind: who.kind || 'lord', rank: who.rank || 1, at: now };
  C.prisoners.push(p);
  state.pending.push({ id: uid('pd'), kind: 'prisoner', prisonerId: p.id, t: now, deadline: now + 48 * H });
  log(state, 'good', `⛓️ ${p.name} est votre prisonnier : rançon, échange, ralliement ou libération ?`, now);
  return p;
}
export function maybeCapture(state, kind, who, now) {
  if (rng.random() >= (CONQUEST.captureChance[kind] ?? 0)) return null;
  return capture(state, { ...who, kind }, now);
}
export const PRISONER_CHOICES = [
  { id: 'ransom', label: 'Rançon', hint: 'De l’or tout de suite ; la maison du prisonnier vous en garde rancune (un peu).' },
  { id: 'exchange', label: 'Échange', hint: 'Rendu à sa maison contre la paix des cœurs : relation nettement meilleure et colère apaisée.' },
  { id: 'rally', label: 'Le rallier', hint: 'Il entre à votre service : un bonus d’attaque de 5 % pendant 3 jours ; sa maison crie à la trahison.' },
  { id: 'release', label: 'Le libérer sans condition', hint: 'Réputation de diplomate et de bienfaiteur ; sa maison s’en souvient favorablement.' },
];
export function describePrisoner(state, p) {
  const pr = conquestState(state).prisoners.find((x) => x.id === p.prisonerId);
  return { icon: '⛓️', title: `Prisonnier : ${pr?.name || 'inconnu'}`, text: `${pr?.house != null ? `Il sert ${RIVALS[pr.house]?.name}. ` : ''}Que faites-vous de lui ? Sa maison s’en souviendra.`, choices: PRISONER_CHOICES.map((c) => ({ label: c.label, hint: c.hint })), deadline: p.deadline };
}
export function resolvePrisoner(state, pid, idx, now = Date.now()) {
  const p = state.pending.find((x) => x.id === pid);
  if (!p) return { ok: false, reason: 'Décision introuvable' };
  state.pending = state.pending.filter((x) => x.id !== pid);
  const C = conquestState(state);
  const pr = C.prisoners.find((x) => x.id === p.prisonerId);
  if (!pr) return { ok: false, reason: 'Prisonnier introuvable' };
  C.prisoners = C.prisoners.filter((x) => x.id !== pr.id);
  const h = pr.house, ch = PRISONER_CHOICES[idx ?? 0]?.id || 'ransom';
  let text;
  if (ch === 'ransom') { const g = 700 * pr.rank; gain(state, { gold: g }, computeMods(state, now)); if (h != null) { changeRelation(state, h, -4); remember(state, h, 'ransom', -6, `${pr.name} rançonné`, now); } text = `Rançon de ${fmt(g)} or versée pour ${pr.name}.`; }
  else if (ch === 'exchange') { if (h != null) { changeRelation(state, h, 15); remember(state, h, 'exchange', 10, `${pr.name} rendu`, now); const k = kingdomOf(state, h); if (k) k.anger = 0; } bumpRep(state, 'diplomat', 4); text = `${pr.name} est rendu à sa maison : les cœurs s’apaisent.`; }
  else if (ch === 'rally') { state.buffs.push({ name: `${pr.name} rallié`, mods: { 'combat.atk': 0.05 }, until: now + 3 * DAY }); if (h != null) { changeRelation(state, h, -15); remember(state, h, 'turncoat', -20, `${pr.name} retourné`, now); } bumpRep(state, 'tyrant', 2); text = `${pr.name} rejoint votre état-major (+5 % d’attaque, 3 jours).`; }
  else { bumpRep(state, 'diplomat', 6); bumpRep(state, 'benefactor', 4); if (h != null) { changeRelation(state, h, 10); remember(state, h, 'mercy', 12, `${pr.name} libéré`, now); } text = `${pr.name} est libéré sans condition.`; }
  addSeasonPoints(state, 60, 'prisonnier', now);
  log(state, 'info', `⛓️ ${text}`, now);
  return { ok: true, text };
}

// ───────── 3. Fausses bannières ─────────
export const BANNER_MODES = {
  none: { name: 'Bannières sincères', chance: 1, army: 1, desc: 'La garnison montrée aux espions est la vraie.' },
  strong: { name: 'Garnison gonflée', chance: 0.55, army: 1.2, desc: 'Moins de raids, mais ceux qui viennent arrivent mieux armés.' },
  weak: { name: 'Garnison dégarnie', chance: 1.5, army: 0.75, desc: 'Plus de raids, mais plus légers : de quoi les écraser et gagner leur butin.' },
};
export function setFalseBanner(state, mode, now = Date.now()) {
  if (!BANNER_MODES[mode]) return { ok: false, reason: 'Ruse inconnue' };
  const C = conquestState(state);
  if (mode !== 'none') {
    for (const [r, v] of Object.entries(CONQUEST.bannerCost)) if ((state.resources[r] || 0) < v) return { ok: false, reason: `Il faut ${v} ${r === 'gold' ? 'or' : r}` };
    for (const [r, v] of Object.entries(CONQUEST.bannerCost)) state.resources[r] -= v;
  }
  C.banner.mode = mode; C.banner.until = mode === 'none' ? 0 : now + CONQUEST.bannerDays * DAY;
  return { ok: true };
}
export const bannerMode = (state, now = Date.now()) => { const b = conquestState(state).banner; return b.mode !== 'none' && b.until > now ? b.mode : 'none'; };
// Raid ennemi : la ruse change sa probabilité et sa taille ; éventée (espions de la maison), elle est retenue
export function bannerOnRaid(state, rival, now) {
  const mode = bannerMode(state, now);
  if (mode === 'none') return { chance: 1, army: 1, exposed: false };
  const tech = RIVALS[rival]?.personality === 'technological' ? 0.4 : 0.2;
  const C = conquestState(state);
  if (rng.random() < tech + (C.banner.fooled[rival] || 0) * 0.1) {
    changeRelation(state, rival, -6); remember(state, rival, 'ruse', -10, 'Fausses bannières éventées', now);
    C.banner.fooled[rival] = 0;
    log(state, 'bad', `🎭 Les espions de ${RIVALS[rival]?.name} ont éventé vos fausses bannières : ils s’en souviendront.`, now);
    return { chance: 1, army: 1, exposed: true };
  }
  C.banner.fooled[rival] = (C.banner.fooled[rival] || 0) + 1;
  return { ...BANNER_MODES[mode], exposed: false };
}

// ───────── 4. Saison de guerre ─────────
export function addSeasonPoints(state, n, why, now) {
  const S = conquestState(state).season;
  if (!S || now < S.start || now >= S.end) return 0;
  S.points += n; (S.log ||= []).unshift({ t: now, n, why }); if (S.log.length > 30) S.log.length = 30;
  return n;
}
export function seasonBoard(state, now = Date.now()) {
  const S = conquestState(state).season;
  if (!S) return null;
  const r = mulberry32(S.seed);
  const f = Math.max(0, Math.min(1, (now - S.start) / (S.end - S.start)));
  const rivals = Array.from({ length: CONQUEST.lbSize - 1 }, (_, i) => ({ name: i < RIVALS.length ? RIVALS[i].lord : `Seigneur ${['Aldric', 'Bérenger', 'Clothilde', 'Darius', 'Edwige', 'Fulbert', 'Gisèle', 'Hugues'][i % 8]} ${Math.floor(i / 8) + 1}`, points: Math.round((300 + r() * 2200) * f * (0.6 + r() * 0.8)) }));
  const all = [...rivals, { name: state.meta.lordName || 'Vous', me: true, points: S.points }].sort((a, b) => b.points - a.points);
  return { rank: all.findIndex((x) => x.me) + 1, size: all.length, top: all.slice(0, 5), S };
}
function seasonTick(state, now) {
  const C = conquestState(state);
  if (!C.season && thLevel(state) >= 5) C.season = { n: 1, start: now, end: now + CONQUEST.seasonDays * DAY, points: 0, seed: (now / 1000) | 0 };
  const S = C.season;
  if (!S || now < S.end || S.closed) return;
  S.closed = true;
  const b = seasonBoard(state, S.end);
  const title = b.rank === 1 ? 'Maréchal de la Saison' : b.rank <= 3 ? 'Héraut de la guerre' : b.rank <= 10 ? 'Vétéran de saison' : null;
  if (title) state.meta.titles = [...new Set([...(state.meta.titles || []), `${title} ${S.n}`])];
  C.seasonsDone.unshift({ n: S.n, rank: b.rank, of: b.size, points: S.points, title });
  if (C.seasonsDone.length > 12) C.seasonsDone.length = 12;
  // la dynastie garde le meilleur rang (héritage, sans puissance)
  const L = (state.legacy ||= {}); L.bestWarSeason = Math.min(L.bestWarSeason || 999, b.rank);
  chronicle(state, `Fin de la saison de guerre ${S.n} : ${state.meta.kingdomName} termine ${b.rank}e sur ${b.size}.`, S.end, 'war', `season:${S.n}`);
  C.season = { n: S.n + 1, start: S.end + CONQUEST.seasonGap * DAY, end: S.end + (CONQUEST.seasonGap + CONQUEST.seasonDays) * DAY, points: 0, seed: S.seed + 1 };
}

// ───────── 5. Îles de Cendre ─────────
function edgeSpot(state, r) {
  const S = state.world.size;
  for (let k = 0; k < 80; k++) {
    const side = Math.floor(r() * 4), a = 2 + Math.floor(r() * (S - 4)), d = 1 + Math.floor(r() * 2);
    const [x, y] = side === 0 ? [a, d] : side === 1 ? [S - 1 - d, a] : side === 2 ? [a, S - 1 - d] : [d, a];
    if (!state.world.pois[key(x, y)] && !state.territories?.[key(x, y)]) return { x, y };
  }
  return null;
}
function islesTick(state, now) {
  const C = conquestState(state);
  const I = C.isles;
  if (!I && thLevel(state) >= 6) { C.isles = { next: now + 2 * DAY, list: [] }; return; }
  if (!I) return;
  if (!I.until && now >= I.next) {
    const r = mulberry32(((now / H) | 0) ^ 0x15e);
    I.list = [];
    for (let i = 0; i < CONQUEST.isleCount; i++) {
      const at = edgeSpot(state, r);
      if (!at) continue;
      const p = { id: `p_${at.x}_${at.y}_ashIsle`, type: 'ashIsle', x: at.x, y: at.y, danger: 3 + (i % 3), owner: null };
      p.enemies = makeEnemies('ashIsle', p.danger, r);
      state.world.pois[key(at.x, at.y)] = p; reveal(state.world, at.x, at.y, 1);
      I.list.push(key(at.x, at.y));
    }
    I.until = now + CONQUEST.isleDays * DAY; I.dayAt = now + DAY;
    log(state, 'info', `🌋 Les Îles de Cendre émergent au bord du monde pour ${CONQUEST.isleDays} jours.`, now);
  }
  if (I.until && now >= I.dayAt) {
    I.dayAt += DAY;
    for (const k of I.list) {
      const p = state.world.pois[k];
      if (!p) continue;
      if (p.owner === 'me') { gain(state, { crystals: CONQUEST.isleCrystals }, computeMods(state, now)); addSeasonPoints(state, 30, 'île tenue', now); }
      // les maisons rivales se disputent les îles
      if (rng.random() < CONQUEST.isleSteal) { const h = Math.floor(rng.random() * RIVALS.length); if (p.owner === 'me') log(state, 'bad', `🌋 ${RIVALS[h].name} s’empare d’une Île de Cendre que vous teniez.`, now); p.owner = h; p.enemies = makeEnemies('ashIsle', p.danger + 1); p.clearedUntil = 0; }
    }
  }
  if (I.until && now >= I.until) {
    for (const k of I.list) delete state.world.pois[k];
    log(state, 'info', '🌋 Les Îles de Cendre replongent sous les flots.', now);
    I.list = []; I.until = 0; I.next = now + (CONQUEST.isleEvery - CONQUEST.isleDays) * DAY;
  }
}
export function onIsleTaken(state, p, now) { p.owner = 'me'; addSeasonPoints(state, 80, 'île conquise', now); log(state, 'good', '🌋 Une Île de Cendre est à vous : elle donnera des cristaux chaque jour tant qu’elle émerge.', now); }

// ───────── 6. Calendrier de fidélité ─────────
const dayOf = (t) => Math.floor(t / DAY);
export const loyaltyReady = (state, now = Date.now()) => conquestState(state).loyalty.last !== dayOf(now);
export const loyaltyNext = (state) => LOYALTY[conquestState(state).loyalty.days % LOYALTY.length];
export function claimLoyalty(state, now = Date.now()) {
  const L = conquestState(state).loyalty;
  if (L.last === dayOf(now)) return { ok: false, reason: 'Déjà reçue aujourd’hui : revenez demain' };
  const g = LOYALTY[L.days % LOYALTY.length];
  L.days++; L.last = dayOf(now);
  const mods = computeMods(state, now);
  const parts = [];
  if (g.res) { gain(state, g.res, mods); parts.push('ressources'); }
  if (g.speedups) { for (const [k, n] of Object.entries(g.speedups)) state.inventory.consumables[k] = (state.inventory.consumables[k] || 0) + n; parts.push('passe-temps'); }
  if (g.consumable) { for (const [k, n] of Object.entries(g.consumable)) state.inventory.consumables[k] = (state.inventory.consumables[k] || 0) + n; parts.push('potion'); }
  return { ok: true, day: L.days, text: `Récompense du jour ${L.days} : ${parts.join(', ')}` };
}

// ───────── Tick (pas du monde) ─────────
export function conquestTick(state, now) {
  const C = conquestState(state);
  ensureMetropolises(state);
  for (const p of metropolises(state)) {
    const M = p.metro;
    if ((M.status === 'pillaged' || M.status === 'liberated') && M.regrowAt <= now) { M.status = 'free'; M.garrison = null; M.power += 0.2; }
    if (M.status === 'vassal' && M.tributeAt <= now) { M.tributeAt += DAY; gain(state, { gold: CONQUEST.vassalTribute * Math.max(1, p.rank || 1) }, computeMods(state, now)); }
  }
  for (const th of [...C.threats]) {
    if (th.arrive > now) continue;
    C.threats = C.threats.filter((x) => x !== th);
    const p = state.world.pois[key(th.to.x, th.to.y)];
    if (!p?.metro || p.metro.status !== 'vassal') continue;
    // la vassale tient selon sa loyauté (durée de vassalité) et la colère de la maison
    const held = (now - p.metro.since) / DAY;
    if (rng.random() < 0.35 + Math.min(0.4, held * 0.05)) { log(state, 'good', `🛡️ ${p.name} repousse la contre-attaque de ${th.from.name}.`, now); addSeasonPoints(state, 120, 'vassale défendue', now); }
    else { p.metro.status = 'free'; p.metro.garrison = null; log(state, 'bad', `⚔️ ${th.from.name} reprend ${p.name} : la cité n’est plus votre vassale.`, now); }
  }
  seasonTick(state, now);
  islesTick(state, now);
}
// Lieux attaquables en plus : métropole (cité libre fortifiée) — utilisé par planMarch / arriveAttack
export const isMetroTarget = (poi) => POI_TYPES[poi?.type]?.kind === 'town' && !!poi.metro;
