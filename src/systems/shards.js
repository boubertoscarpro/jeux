import { WHEEL_REWARDS, WHEEL_TIERS, TIER_ORDER, PITY_ORDER, SPECIAL_HEROES, FEATS, SHARD_SHOP } from '../data/shards.js';
import { ARTIFACTS } from '../data/artifacts.js';
import { UNIQUE_ITEMS } from '../data/items.js';
import { COSMETICS } from '../data/social.js';
import { RESOURCES, RARE_RES } from '../data/resources.js';
import { rng } from '../core/rng.js';
import { uid, fmt } from '../core/util.js';
import { thLevel, allBuildings, levelOf } from './city.js';
import { computeMods } from './modifiers.js';
import { gain, armyTotals } from './economy.js';
import { generateItem, createUniqueItem } from './items.js';
import { createHero } from './heroes.js';
import { grantArtifact } from './collection.js';
import { chronicle } from './chronicle.js';
import { log, toast } from './log.js';
import { shardCfg, wheelCfg } from './config.js';

const DAY = 86400000;
export const dayKey = (t) => Math.floor(t / DAY);

export function shardState(state) {
  return (state.shards ||= {
    count: 0, tickets: 0, relicFragments: 0, mythicFragments: 0, legendaryFragments: 0,
    heat: {}, daily: {}, lastFreeTicket: 0, pity: { rare: 0, epic: 0, legendary: 0, mythic: 0 },
    history: [], ledger: {}, feats: {}, forbiddenAt: 0, owned: {}, spins: 0, jackpots: 0,
  });
}

function ledger(state, t) {
  const s = shardState(state);
  const k = dayKey(t);
  const L = (s.ledger[k] ||= { gen: 0, spent: 0, tickets: 0, spins: 0, legendary: 0, mythic: 0, jackpot: 0, bySource: {} });
  const keys = Object.keys(s.ledger).map(Number).sort((a, b) => a - b);
  while (keys.length > 30) delete s.ledger[keys.shift()];
  return L;
}

// Source favorisée de la semaine (rotation)
export function weeklyFavored(state, now = Date.now()) {
  const c = shardCfg(state);
  const week = Math.floor((now - (state.meta.created || now)) / (7 * DAY));
  return c.rotation[week % c.rotation.length];
}

// Bonus de détection (héros explorateur, observatoire, artefacts) — plafonné
export function detectionBonus(state, now = Date.now()) {
  const c = shardCfg(state);
  let b = 0;
  if (state.heroes.some((h) => h.cls === 'explorer')) b += 0.02;
  if (levelOf(state, 'observatory') > 0) b += 0.03;
  b += computeMods(state, now)['shard.detect'] || 0;
  if (state.artifacts?.explorerEye) b += 0.02;
  return Math.min(c.detectionCap, b);
}

// Multiplicateur actuel de chance pour une source (rendements décroissants, plafond quotidien, rotation, détection)
export function sourceMultiplier(state, source, now = Date.now()) {
  const c = shardCfg(state);
  const s = shardState(state);
  const heat = s.heat[source]?.v || 0;
  let m = 1 / (1 + heat * c.heatFactor);
  const d = s.daily[source];
  if (d && d.day === dayKey(now) && d.n >= (c.dailyCap[source] ?? 99)) m *= c.overCapFactor;
  if (weeklyFavored(state, now) === source) m *= c.rotationBonus;
  if (now - (s.lastGain || state.meta.created || now) > c.droughtHours * 3600000) m *= c.droughtBonus;
  m *= 1 + detectionBonus(state, now);
  m *= state.admin?.shardMult ?? 1;
  return m;
}

function coolHeat(state, now) {
  const c = shardCfg(state);
  const s = shardState(state);
  for (const h of Object.values(s.heat)) {
    const dt = (now - (h.t || now)) / 3600000;
    h.v = Math.max(0, h.v - dt * c.heatDecayPerHour);
    h.t = now;
  }
}

// Ajoute des Éclats (comptabilité incluse)
export function addShards(state, n, source, now = Date.now(), label = '') {
  if (!(n > 0)) return 0;
  const c = shardCfg(state);
  const s = shardState(state);
  s.count += n;
  if (!['free', 'admin', 'feat'].includes(source)) s.lastGain = now;
  const L = ledger(state, now);
  L.gen += n; L.bySource[source] = (L.bySource[source] || 0) + n;
  coolHeat(state, now);
  const h = (s.heat[source] ||= { v: 0, t: now });
  h.v += c.heatPerDrop; h.t = now;
  const d = s.daily[source];
  if (!d || d.day !== dayKey(now)) s.daily[source] = { day: dayKey(now), n: n }; else d.n += n;
  state.stats.shardsFound = (state.stats.shardsFound || 0) + n;
  log(state, 'good', `💠 +${n} Éclat${n > 1 ? 's' : ''} Ancien${n > 1 ? 's' : ''}${label ? ` — ${label}` : ''} !`, now);
  toast(`💠 +${n} Éclat${n > 1 ? 's' : ''} Ancien${n > 1 ? 's' : ''}`, 'good');
  return n;
}

// Tente un gain d'Éclats depuis une source. ctx.chance surcharge la chance de base.
export function rollShards(state, source, now = Date.now(), ctx = {}) {
  const c = shardCfg(state);
  const src = c.sources[source];
  if (!src) return 0;
  const chance = Math.min(0.95, (ctx.chance ?? src.chance) * sourceMultiplier(state, source, now));
  if (!rng.chance(chance)) return 0;
  const [a, b] = ctx.amount || src.amount;
  return addShards(state, rng.int(a, b), source, now, ctx.label || src.name);
}

// ---------- Exploits ----------
export function checkFeats(state, now = Date.now()) {
  const s = shardState(state);
  const done = (id) => s.feats[id];
  const award = (id) => {
    const f = FEATS.find((x) => x.id === id);
    s.feats[id] = now;
    addShards(state, f.shards, 'feat', now, `Exploit : ${f.label}`);
    chronicle(state, `Exploit accompli : ${f.label}. Les Anciens remettent ${f.shards} Éclats au royaume.`, now);
  };
  if (!done('deepDungeon') && (state.stats.maxDungeonLevel || 0) >= 15) award('deepDungeon');
  if (!done('wonder') && allBuildings(state).some((b) => ['sanctuary', 'observatory'].includes(b.type) && b.level > 0)) award('wonder');
  if (!done('relics5') && Object.keys(state.artifacts || {}).length >= 5) award('relics5');
  if (!done('bossSlayer') && Object.keys(state.bossTrophies || {}).length >= 5) award('bossSlayer');
  if (!done('dynasty') && (state.dynasty?.count || 0) >= 1) award('dynasty');
  if (!done('chapter') && state.quests?.done && Object.keys(state.quests.done).length >= 30) award('chapter');
  if (!done('production') && (state._goldRate || 0) >= 5000) award('production');
  if (!done('edgeOfWorld')) {
    const w = state.world;
    for (let i = 0; i < w.revealed.length; i++) if (w.revealed[i] && Math.hypot((i % w.size) - w.capital.x, Math.floor(i / w.size) - w.capital.y) >= 22) { award('edgeOfWorld'); break; }
  }
}

// ---------- Ticket gratuit ----------
export const freeTicketAt = (state) => (shardState(state).lastFreeTicket || 0) + shardCfg(state).freeTicketDays * DAY;
export function claimFreeTicket(state, now = Date.now()) {
  const s = shardState(state);
  if (now < freeTicketAt(state)) return { ok: false, reason: 'Pas encore disponible' };
  s.lastFreeTicket = now; s.tickets++;
  ledger(state, now).tickets++;
  return { ok: true };
}

// ---------- Dépenses ----------
export function spendShards(state, optionId, choice = null, now = Date.now()) {
  const s = shardState(state);
  const opt = SHARD_SHOP.find((o) => o.id === optionId);
  if (!opt) return { ok: false };
  const cost = optionId === 'ticket' ? shardCfg(state).ticketCost : opt.cost;
  if (s.count < cost) return { ok: false, reason: `Il faut ${cost} Éclats` };
  if (optionId === 'guaranteed' && !choice) return { ok: false, reason: 'Choisissez une récompense' };
  s.count -= cost;
  const L = ledger(state, now);
  L.spent += cost;
  let text = '';
  if (optionId === 'ticket') { s.tickets++; L.tickets++; text = '1 ticket obtenu'; }
  if (optionId === 'chest') {
    const k = 1 + thLevel(state) * 0.1;
    const r = { crystals: Math.round(8 * k), rareOre: Math.round(6 * k), gems: Math.round(5 * k), ancientWood: Math.round(6 * k), silver: Math.round(15 * k) };
    gain(state, r, computeMods(state, now));
    text = Object.entries(r).map(([k2, v]) => `${v} ${RESOURCES[k2].icon}`).join(' ');
  }
  if (optionId === 'relic') {
    s.relicFragments++;
    text = `Fragment de relique (${s.relicFragments}/3)`;
  }
  if (optionId === 'guaranteed') {
    const rw = WHEEL_REWARDS.legendary.find((x) => x.id === choice);
    if (!rw) { s.count += cost; return { ok: false, reason: 'Récompense inconnue' }; }
    text = grantReward(state, rw, 'legendary', now).text;
  }
  return { ok: true, text };
}

export function craftRelic(state, artifactKey, now = Date.now()) {
  const s = shardState(state);
  if (s.relicFragments < 3) return { ok: false, reason: '3 fragments de relique requis' };
  if (!ARTIFACTS[artifactKey] || state.artifacts?.[artifactKey] || artifactKey === 'ancientEye') return { ok: false, reason: 'Artefact indisponible' };
  s.relicFragments -= 3;
  grantArtifact(state, artifactKey, now, 'Fragments de relique');
  return { ok: true };
}

// ---------- Roue ----------
export function currentWheelSeason(state, now = Date.now()) {
  return 1 + Math.floor((now - (state.meta.created || now)) / (wheelCfg(state).seasonDays * DAY));
}

// Récompenses disponibles d'un palier (saison en cours ; les exclusivités d'anciennes saisons ne reviennent pas)
export function tierPool(state, tier, now = Date.now()) {
  const season = currentWheelSeason(state, now);
  return WHEEL_REWARDS[tier].filter((r) => !r.season || r.season === Math.min(season, 2));
}

export function tierProbs(state) {
  return wheelCfg(state).probs;
}

function pickTier(state) {
  const c = wheelCfg(state);
  const p = shardState(state).pity;
  // Garanties progressives (de la plus haute à la plus basse)
  if (p.mythic + 1 >= c.pity.mythic) return 'mythic';
  if (p.legendary + 1 >= c.pity.legendary) return rng.chance(c.probs.mythic / (c.probs.mythic + c.probs.legendary)) ? 'mythic' : 'legendary';
  const roll = rng.weighted(c.probs);
  if (p.epic + 1 >= c.pity.epic && TIER_ORDER.indexOf(roll) < TIER_ORDER.indexOf('epic')) return 'epic';
  if (p.rare + 1 >= c.pity.rare && TIER_ORDER.indexOf(roll) < TIER_ORDER.indexOf('rare')) return 'rare';
  return roll;
}

function updatePity(state, tier) {
  const p = shardState(state).pity;
  const ti = TIER_ORDER.indexOf(tier);
  for (const t of PITY_ORDER) p[t] = TIER_ORDER.indexOf(t) <= ti ? 0 : p[t] + 1;
}

// Donne une récompense de la Roue (avec conversion des doublons)
export function grantReward(state, rw, tier, now = Date.now()) {
  const s = shardState(state);
  const c = wheelCfg(state);
  const g = rw.give;
  const mods = computeMods(state, now);
  const k = 0.6 + thLevel(state) * 0.25;
  let text = rw.label;
  const dupe = (key, frag) => { s.owned[key] = (s.owned[key] || 0) + 1; if (s.owned[key] > 1) { if (frag === 'm') s.mythicFragments += c.mythicDupe; else s.legendaryFragments += c.legendaryDupe; return true; } return false; };
  if (g.scaledRes) { const r = Object.fromEntries(Object.entries(g.scaledRes).map(([x, v]) => [x, Math.round(v * k)])); gain(state, r, mods); text = `${rw.label} : ${Object.entries(r).map(([x, v]) => `${fmt(v)} ${RESOURCES[x].icon}`).join(' ')}`; }
  if (g.res) gain(state, g.res, mods);
  if (g.speedup) { const q = state.queues.build[0]; if (q) { q.end -= g.speedup * 60000; q.start -= g.speedup * 60000; } else gain(state, { gold: 500 * k }, mods); }
  if (g.item) { const it = generateItem({ ilvl: 4 + thLevel(state) * 2, boost: 1, min: g.item.min }); state.inventory.items.push(it); text = `${rw.label} : ${it.name}`; }
  if (g.units) { for (const [u, n] of Object.entries(g.units)) state.army[u] = (state.army[u] || 0) + n; }
  if (g.buff) state.buffs.push({ name: g.buff.name, mods: g.buff.mods, until: now + g.buff.h * 3600000 });
  if (g.hero) { const h = createHero({ rarity: g.hero.rarity }); state.heroes.push(h); text = `${rw.label} : ${h.name}`; }
  if (g.artifact) { const a = grantArtifact(state, null, now, 'Roue des Anciens'); if (a) text = `Artefact : ${a}`; else { s.legendaryFragments += c.legendaryDupe; text += ' (doublon → fragments légendaires)'; } }
  if (g.unique) {
    if (dupe(g.unique, UNIQUE_ITEMS[g.unique].rarity === 'mythic' ? 'm' : 'l')) text += ' — doublon converti en fragments';
    else state.inventory.items.push(createUniqueItem(g.unique));
  }
  if (g.specialHero) {
    if (dupe(g.specialHero, 'm')) text += ' — doublon converti en fragments mythiques';
    else state.heroes.push(createSpecialHero(g.specialHero));
  }
  if (g.artifactKey) {
    if (state.artifacts?.[g.artifactKey]) { s.mythicFragments += c.mythicDupe; text += ' — doublon converti en fragments mythiques'; }
    else grantArtifact(state, g.artifactKey, now, 'Roue des Anciens');
  }
  if (g.deco) {
    if (state.meta.owned[g.deco]) { s.mythicFragments += c.mythicDupe; text += ' — doublon converti en fragments'; }
    else state.meta.owned[g.deco] = true;
  }
  if (g.jackpot) {
    const r = { gold: Math.round(30000 * k), crystals: 60, rareOre: 50, gems: 40 };
    gain(state, r, mods);
    state.meta.titles = [...new Set([...(state.meta.titles || []), 'Élu des Anciens'])];
    state.meta.owned.deco_colossus = true;
    state.army.celestialRider = (state.army.celestialRider || 0) + 25;
    s.jackpots++;
    text = '👑 JACKPOT ANCESTRAL : trésor colossal, 25 Cavaliers célestes, titre « Élu des Anciens », Colosse de l’Ancien';
    chronicle(state, `🏆 ${state.meta.kingdomName} DÉCROCHE LE JACKPOT ANCESTRAL !`, now);
    (state.serverFeed ||= []).unshift({ t: now, text: `🏆 ${state.meta.kingdomName} vient de trouver le JACKPOT ANCESTRAL !`, me: true });
    toast('🏆 UN JOUEUR VIENT DE TROUVER LE JACKPOT ANCESTRAL !', 'event');
  }
  return { text };
}

export function createSpecialHero(key) {
  const d = SPECIAL_HEROES[key];
  const h = createHero({ cls: d.cls, rarity: d.rarity, name: d.name });
  h.special = { key, mods: d.mods, desc: d.desc };
  h.level = 5;
  return h;
}

export function spin(state, now = Date.now()) {
  const s = shardState(state);
  if (s.tickets < 1) return { ok: false, reason: 'Aucun ticket' };
  s.tickets--;
  s.spins++;
  const c = wheelCfg(state);
  const tier = pickTier(state);
  updatePity(state, tier);
  let rw;
  if (tier === 'mythic' && rng.chance(c.jackpotShare)) rw = WHEEL_REWARDS.jackpot;
  else rw = rng.weighted(tierPool(state, tier, now));
  const res = grantReward(state, rw, tier, now);
  const frag = rng.int(c.fragmentsPerSpin[0], c.fragmentsPerSpin[1]);
  s.mythicFragments += frag;
  const L = ledger(state, now);
  L.spins++;
  if (tier === 'legendary') L.legendary++;
  if (tier === 'mythic') L.mythic++;
  if (rw.id === 'jackpot') L.jackpot++;
  s.history.unshift({ t: now, tier, id: rw.id, text: res.text });
  if (s.history.length > 50) s.history.length = 50;
  if (TIER_ORDER.indexOf(tier) >= 3) chronicle(state, `La Roue des Anciens offre une récompense ${WHEEL_TIERS[tier].name.toLowerCase()} : ${res.text}.`, now);
  return { ok: true, tier, reward: rw, text: res.text, fragments: frag };
}

// Fabrication avec fragments
export function craftMythic(state, rewardId, now = Date.now()) {
  const s = shardState(state);
  const c = wheelCfg(state);
  if (s.mythicFragments < c.mythicCraft) return { ok: false, reason: `${c.mythicCraft} fragments mythiques requis` };
  const rw = tierPool(state, 'mythic', now).find((r) => r.id === rewardId);
  if (!rw) return { ok: false, reason: 'Indisponible cette saison' };
  s.mythicFragments -= c.mythicCraft;
  return { ok: true, text: grantReward(state, rw, 'mythic', now).text };
}
export function craftLegendary(state, rewardId, now = Date.now()) {
  const s = shardState(state);
  const c = wheelCfg(state);
  if (s.legendaryFragments < c.legendaryCraft) return { ok: false, reason: `${c.legendaryCraft} fragments légendaires requis` };
  const rw = WHEEL_REWARDS.legendary.find((r) => r.id === rewardId);
  if (!rw) return { ok: false };
  s.legendaryFragments -= c.legendaryCraft;
  return { ok: true, text: grantReward(state, rw, 'legendary', now).text };
}

// ---------- Fil « serveur » simulé (communauté) ----------
const LORDS = ['Baronne Elvire', 'Sire Gondemar', 'Dame Ysolde', 'Comte Aubri', 'Margrave Ulric', 'Duchesse Ermengarde', 'Seigneur Hugues', 'Vicomtesse Blanche'];
export function serverFeedTick(state, now) {
  const f = (state.serverFeed ||= []);
  if (rng.chance(0.04)) {
    const roll = rng.random();
    const what = roll < 0.002 ? '👑 le JACKPOT ANCESTRAL' : roll < 0.05 ? 'une récompense mythique' : 'une récompense légendaire';
    f.unshift({ t: now, text: `${rng.pick(LORDS)} a obtenu ${what} à la Roue des Anciens.` });
    if (f.length > 30) f.length = 30;
  }
}

// ---------- Modèle économique (estimation pour l'outil de suivi) ----------
// Gains attendus par jour selon un profil d'activité, à partir de la configuration réelle
export function expectedDaily(state, profile) {
  const c = shardCfg(state);
  const cap = (src, v) => { const k = c.dailyCap[src] ?? 99; return v <= k ? v : k + (v - k) * c.overCapFactor; };
  const avg = (r) => (r[0] + r[1]) / 2;
  const e = {
    expedition: cap('expedition', profile.rareExpeditions * c.sources.expedition.chance * avg(c.sources.expedition.amount)),
    anomaly: cap('anomaly', profile.expeditions * 0.02 * 0.6 * avg(c.sources.anomaly.amount) * profile.intervene),
    dungeon: cap('dungeon', profile.deepDungeons * 0.18 * avg(c.sources.dungeon.amount)),
    boss: cap('boss', profile.bosses * c.sources.boss.chance * avg(c.sources.boss.amount)),
    exploration: cap('exploration', profile.explorations * c.sources.exploration.chance),
    forbidden: (profile.forbidden * (c.forbidden.outcomes.partial * avg(c.forbidden.partial) + c.forbidden.outcomes.success * avg(c.forbidden.success))) / (c.forbidden.cooldownHours / 24),
    event: profile.eventShards,
    free: c.ticketCost / c.freeTicketDays,
  };
  e.total = Object.values(e).reduce((a, b) => a + b, 0);
  return e;
}

export const PROFILES = {
  casual: { name: 'Occasionnel', rareExpeditions: 2, expeditions: 6, deepDungeons: 0, bosses: 0.3, explorations: 6, forbidden: 0, intervene: 0.3, eventShards: 0 },
  active: { name: 'Actif', rareExpeditions: 10, expeditions: 20, deepDungeons: 1, bosses: 2, explorations: 25, forbidden: 0.5, intervene: 0.8, eventShards: 0.2 },
  hardcore: { name: 'Hardcore', rareExpeditions: 30, expeditions: 40, deepDungeons: 4, bosses: 5, explorations: 60, forbidden: 1, intervene: 1, eventShards: 0.6 },
};
void UNIQUE_ITEMS; void COSMETICS; void RARE_RES; void armyTotals; void uid;
