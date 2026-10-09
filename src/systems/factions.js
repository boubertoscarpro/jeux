import { RIVALS, PERSONALITIES, STANCES, POI_TYPES } from '../data/world.js';
import { ENEMY_UNITS } from '../data/units.js';
import { rng } from '../core/rng.js';
import { uid, fmt } from '../core/util.js';
import { thLevel, levelOf } from './city.js';
import { armyPower } from './army.js';
import { armyTotals, pay, missing, gain } from './economy.js';
import { computeMods } from './modifiers.js';
import { key, poiAt, wTerrain, reveal } from './world.js';
import { bumpRep } from './reputation.js';
import { chronicle } from './chronicle.js';
import { startWorldEvent } from './events.js';
import { log, toast } from './log.js';
import { costMult } from './kingdom.js';

export { STANCES, PERSONALITIES };

const kingdomPoi = (state, idx) => Object.values(state.world.pois).find((p) => p.type === 'kingdom' && p.rival === idx);

export function initFactions(state) {
  state.factions = RIVALS.map((rv, i) => {
    const p = PERSONALITIES[rv.personality];
    const poi = kingdomPoi(state, i);
    const territory = [];
    if (poi) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const x = poi.x + dx, y = poi.y + dy;
      if (x >= 0 && y >= 0 && x < state.world.size && y < state.world.size) territory.push(key(x, y));
    }
    return { idx: i, wealth: 1000 * (1 + i * 0.5), army: poi?.power || 1, tech: 1 + (rv.personality === 'technological' ? 2 : 0), relation: p.base, stance: 'neutral', treatyAt: 0, territory, wars: [], intel: {}, envoyAt: 0, tribute: 0, weariness: 0, lastRaidPlan: 0 };
  });
}

export const factionName = (i) => RIVALS[i]?.name || '?';
export const factionOf = (state, i) => state.factions?.[i];

export function playerPower(state) { return armyPower(armyTotals(state)); }
// Puissance militaire estimée d'une faction (même échelle que armyPower)
export const factionPower = (state, f) => Math.round(f.army * (200 + thLevel(state) * 180));

function baselineRelation(state, f) {
  const p = PERSONALITIES[RIVALS[f.idx].personality];
  const rep = state.reputation || {};
  let b = p.base;
  for (const [axis, k] of Object.entries(p.likes)) b += (rep[axis] || 0) * k;
  for (const [axis, k] of Object.entries(p.dislikes)) b -= (rep[axis] || 0) * k;
  if (RIVALS[f.idx].personality === 'aggressive' || RIVALS[f.idx].personality === 'military') {
    const ratio = playerPower(state) / Math.max(1, factionPower(state, f));
    b += Math.max(-20, Math.min(20, (ratio - 1) * 15)); // respectent la force
  }
  if (f.stance === 'trade') b += 10;
  if (f.stance === 'alliance') b += 25;
  return Math.max(-100, Math.min(100, b));
}

export function changeRelation(state, i, n) {
  const f = factionOf(state, i);
  if (f) f.relation = Math.max(-100, Math.min(100, f.relation + n));
}

// Tick des factions (toutes les 10 min de jeu) : économie, armée, expansion, guerres, humeur
export function factionsTick(state, now) {
  if (!state.factions) initFactions(state);
  const w = state.world;
  for (const f of state.factions) {
    const per = PERSONALITIES[RIVALS[f.idx].personality];
    const terr = f.territory.length;
    f.wealth += 120 * per.eco * (1 + terr * 0.05) * (f.wars.length ? 0.7 : 1);
    f.army = Math.min(20, f.army + 0.012 * per.mil * (1 + f.wealth / 20000));
    f.tech += 0.01 * per.tech;
    if (f.wars.length) f.weariness = Math.min(100, f.weariness + 2); else f.weariness = Math.max(0, f.weariness - 1);
    // Dérive des relations vers la base (personnalité + réputation du joueur)
    const base = baselineRelation(state, f);
    f.relation += (base - f.relation) * 0.04;
    // Expansion territoriale
    if (f.territory.length < 30 + f.army * 3 && rng.chance(per.expand * 0.35)) expand(state, f, now);
    // Tribut versé par un tributaire
    if (f.stance === 'tributary') gain(state, { gold: Math.round(80 + f.wealth * 0.004) }, computeMods(state, now));
    const poi = kingdomPoi(state, f.idx);
    if (poi) poi.power = Math.round(f.army * 100) / 100;
  }
  // Guerres entre factions
  if (rng.chance(0.04)) {
    const [a, b] = [rng.pick(state.factions), rng.pick(state.factions)];
    if (a && b && a !== b && !a.wars.includes(b.idx) && (PERSONALITIES[RIVALS[a.idx].personality].mil > 1 || rng.chance(0.3))) {
      a.wars.push(b.idx); b.wars.push(a.idx);
      chronicle(state, `La guerre éclate entre ${factionName(a.idx)} et ${factionName(b.idx)}.`, now);
      if (!state.events.some((e) => e.key === 'factionWar')) startWorldEvent(state, 'factionWar', now);
    }
  }
  for (const f of state.factions) {
    for (const e of [...f.wars]) {
      if (!rng.chance(0.05)) continue;
      const g = state.factions[e];
      const winner = f.army >= g.army ? f : g, loser = winner === f ? g : f;
      f.wars = f.wars.filter((x) => x !== e); g.wars = g.wars.filter((x) => x !== f.idx);
      const nLost = Math.min(3, Math.max(0, loser.territory.length - 9));
      const lost = nLost > 0 ? loser.territory.splice(-nLost) : [];
      winner.territory.push(...lost);
      loser.army *= 0.8; winner.army *= 0.9;
      chronicle(state, `${factionName(winner.idx)} remporte la guerre contre ${factionName(loser.idx)}${lost.length ? ` et s’empare de ${lost.length} région(s)` : ''}.`, now);
    }
  }
}

function expand(state, f, now) {
  const w = state.world;
  const own = new Set(f.territory);
  const others = new Set(state.factions.flatMap((x) => x.territory));
  const cands = [];
  for (const k of f.territory) {
    const [x, y] = k.split(',').map(Number);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy, nk = key(nx, ny);
      if (nx < 0 || ny < 0 || nx >= w.size || ny >= w.size || own.has(nk) || others.has(nk)) continue;
      if (Math.hypot(nx - w.capital.x, ny - w.capital.y) < 4) continue;
      const p = poiAt(w, nx, ny);
      if (p && !['gather'].includes(POI_TYPES[p.type]?.kind)) continue;
      if (state.territories[nk]) {
        // Conquête d'un avant-poste du joueur, seulement en guerre
        if (f.stance !== 'war') continue;
        if (rng.chance(0.5)) {
          delete state.territories[nk];
          chronicle(state, `${factionName(f.idx)} s’empare de votre avant-poste en (${nx}, ${ny}) !`, now);
          toast(`🚩 Avant-poste perdu face à ${factionName(f.idx)}`, 'bad');
        } else continue;
      }
      cands.push(nk);
    }
  }
  if (!cands.length) return;
  const nk = rng.pick(cands);
  f.territory.push(nk);
  if (f.territory.length % 6 === 0) {
    const [x, y] = nk.split(',').map(Number);
    if (w.revealed[y * w.size + x]) log(state, 'event', `🏴 ${factionName(f.idx)} étend son territoire près de (${x}, ${y}).`, now);
  }
}

// Probabilité qu'une faction lance un raid contre le joueur (appelé par le tick des raids)
export function raidWillingness(state, i) {
  const f = factionOf(state, i);
  if (!f) return 0.05;
  if (['alliance', 'trade', 'tributary', 'truce'].includes(f.stance)) return 0;
  const per = PERSONALITIES[RIVALS[i].personality];
  if (f.stance === 'war') return 0.18;
  if (f.relation > 0) return 0;
  return Math.max(0, (per.raid * 0.06) * (1 + -f.relation / 50));
}

// ---------- Diplomatie ----------
// cost.diplomacy (spécialisation) réduit le prix des ambassadeurs, plancher 50 %
export const ENVOY_COST = (state) => ({ gold: Math.ceil((200 + thLevel(state) * 60) * costMult(computeMods(state), 'diplomacy')) });

export function diplomacy(state, i, action, now = Date.now()) {
  const f = factionOf(state, i);
  if (!f) return { ok: false };
  const per = RIVALS[i].personality;
  const name = factionName(i);
  const ratio = playerPower(state) / Math.max(1, factionPower(state, f));
  const repD = (state.reputation?.diplomat || 0);
  switch (action) {
    case 'envoy': {
      if (now - f.envoyAt < 3600000) return { ok: false, reason: 'Un ambassadeur est déjà en mission (1 h)' };
      const cost = ENVOY_COST(state);
      if (!pay(state, cost)) return { ok: false, reason: 'Pas assez d’or', missing: missing(state, cost) };
      f.envoyAt = now;
      const gainRel = Math.round(rng.int(6, 14) * (1 + repD / 400) * (f.stance === 'war' ? 0.5 : 1));
      f.relation = Math.min(100, f.relation + gainRel);
      bumpRep(state, 'diplomat', 4);
      return { ok: true, msg: `Votre ambassadeur est bien reçu à ${name} (+${gainRel} relation).` };
    }
    case 'trade': {
      if (f.stance === 'war') return { ok: false, reason: 'Impossible en temps de guerre' };
      const need = per === 'commercial' ? 5 : 20;
      if (f.relation < need) return { ok: false, reason: `Relation insuffisante (${need} requis)` };
      if (per === 'isolationist' && f.relation < 40) return { ok: false, reason: `${name} refuse d’ouvrir ses marchés (relation 40 requise)` };
      f.stance = 'trade'; f.treatyAt = now;
      bumpRep(state, 'merchant', 10); bumpRep(state, 'diplomat', 8);
      chronicle(state, `Un pacte commercial est signé avec ${name}.`, now);
      return { ok: true, msg: 'Pacte commercial signé : −2% de taxe au marché et contrats exclusifs.' };
    }
    case 'alliance': {
      if (f.stance !== 'trade') return { ok: false, reason: 'Un pacte commercial est requis d’abord' };
      if (f.relation < 60) return { ok: false, reason: 'Relation 60 requise' };
      f.stance = 'alliance'; f.treatyAt = now;
      bumpRep(state, 'diplomat', 20);
      chronicle(state, `Une alliance est scellée avec ${name}.`, now);
      return { ok: true, msg: 'Alliance scellée : renforts lors des raids et carte partagée.' };
    }
    case 'peace': {
      if (f.stance !== 'war') return { ok: false, reason: 'Vous n’êtes pas en guerre' };
      const chance = 0.25 + (f.relation + 60) / 250 + f.weariness / 200 + Math.max(0, ratio - 1) * 0.25;
      if (!rng.chance(Math.min(0.95, chance))) { f.relation = Math.max(-100, f.relation - 3); return { ok: false, reason: `${name} rejette votre proposition (chance ${Math.round(Math.min(0.95, chance) * 100)}%)` }; }
      f.stance = 'truce'; f.treatyAt = now; f.relation = Math.max(f.relation, -10);
      bumpRep(state, 'diplomat', 15);
      chronicle(state, `La paix est signée avec ${name}.`, now);
      return { ok: true, msg: 'Paix signée : trêve de 6 h.' };
    }
    case 'war': {
      if (f.stance === 'war') return { ok: false, reason: 'Déjà en guerre' };
      const betrayal = ['alliance', 'trade', 'truce'].includes(f.stance);
      f.stance = 'war'; f.treatyAt = now; f.relation = Math.min(f.relation, -50);
      bumpRep(state, 'warrior', 10);
      if (betrayal) { bumpRep(state, 'tyrant', 25); bumpRep(state, 'diplomat', -40); for (const o of state.factions) if (o !== f) o.relation = Math.max(-100, o.relation - 10); }
      state.stats.wars = (state.stats.wars || 0) + 1;
      chronicle(state, `${state.meta.kingdomName} déclare la guerre à ${name}${betrayal ? ', rompant ses serments' : ''}.`, now);
      return { ok: true, msg: `Guerre déclarée à ${name}.` };
    }
    case 'tribute': {
      if (f.stance === 'tributary') return { ok: false, reason: 'Déjà tributaire' };
      if (ratio < 1.3) return { ok: false, reason: `Votre armée n’impressionne pas ${name} (puissance ×${ratio.toFixed(2)}, 1,3 requis)` };
      const resist = { isolationist: 0.6, military: 0.5, aggressive: 0.35, commercial: 0.2, technological: 0.4 }[per];
      bumpRep(state, 'tyrant', 10);
      if (rng.chance(Math.min(0.9, (ratio - 1) * 0.5 + 0.2 - resist * 0.3 + (state.reputation?.tyrant || 0) / 2000))) {
        f.stance = 'tributary'; f.treatyAt = now; f.relation = Math.max(-100, f.relation - 20);
        chronicle(state, `${name} accepte de payer tribut à ${state.meta.kingdomName}.`, now);
        return { ok: true, msg: `${name} vous versera un tribut régulier.` };
      }
      f.relation = Math.max(-100, f.relation - 15);
      if (per === 'aggressive' || per === 'military') { f.stance = 'war'; chronicle(state, `${name} répond à votre ultimatum par la guerre !`, now); }
      return { ok: false, reason: `${name} refuse avec mépris.` };
    }
    default: return { ok: false };
  }
}

// Les traités temporaires expirent (trêve 6 h)
export function treatiesTick(state, now) {
  for (const f of state.factions || []) {
    if (f.stance === 'truce' && now - f.treatyAt > 6 * 3600000) f.stance = 'neutral';
    if (f.stance === 'tributary' && f.relation < -60 && rng.chance(0.1)) { f.stance = 'war'; chronicle(state, `${factionName(f.idx)} se révolte contre votre domination !`, now); }
  }
}

// ---------- Espionnage ----------
export const SPY_OBJECTIVES = {
  army: { name: 'Armée', icon: '⚔️' }, resources: { name: 'Richesses', icon: '💰' }, production: { name: 'Production', icon: '🏭' },
  tech: { name: 'Technologies', icon: '🔬' }, weakness: { name: 'Faiblesses', icon: '🎯' }, movements: { name: 'Mouvements de troupes', icon: '🐎' },
};

export function spyChance(state, i, spies) {
  const f = factionOf(state, i);
  const mods = computeMods(state);
  const tech = RIVALS[i].personality === 'technological' ? 0.15 : 0;
  return Math.max(0.05, Math.min(0.95, 0.45 + Math.min(0.3, spies * 0.05) + (mods['spy.power'] || 0) - f.tech * 0.02 - tech - (RIVALS[i].personality === 'isolationist' ? 0.08 : 0)));
}

export function spyMission(state, i, objective, spies = 1, now = Date.now()) {
  const f = factionOf(state, i);
  if (!f || !SPY_OBJECTIVES[objective]) return { ok: false };
  spies = Math.floor(spies);
  if (!(spies > 0) || (state.army.spy || 0) < spies) return { ok: false, reason: 'Pas assez d’espions (formez-en à la caserne)' };
  const chance = spyChance(state, i, spies);
  const poi = kingdomPoi(state, i);
  if (rng.chance(chance)) {
    let info;
    if (objective === 'army') { const g = poi ? (poi.garrison ||= null) : null; info = { power: factionPower(state, f), garrison: g }; if (poi) poi.scouted = true; }
    if (objective === 'resources') info = { wealth: Math.round(f.wealth) };
    if (objective === 'production') info = { perHour: Math.round(120 * PERSONALITIES[RIVALS[i].personality].eco * 6) };
    if (objective === 'tech') info = { tech: Math.round(f.tech * 10) / 10 };
    if (objective === 'weakness') info = { text: weaknessOf(i) };
    if (objective === 'movements') info = { text: movementsOf(state, f, now) };
    f.intel[objective] = { t: now, ...info };
    bumpRep(state, 'diplomat', -1);
    return { ok: true, msg: 'Mission réussie : informations obtenues.', info };
  }
  const caught = Math.max(1, Math.ceil(spies * 0.6));
  state.army.spy -= caught;
  f.relation = Math.max(-100, f.relation - 12);
  bumpRep(state, 'diplomat', -5);
  log(state, 'bad', `🕵️ Vos espions ont été démasqués à ${factionName(i)} (${caught} capturé(s)).`, now);
  return { ok: false, reason: `Démasqués ! ${caught} espion(s) capturé(s), relation −12.` };
}

function weaknessOf(i) {
  return {
    aggressive: 'Leur cavalerie charge sans discipline : les lanciers en formation Mur de boucliers les brisent.',
    isolationist: 'Leurs murailles sont épaisses : apportez béliers et catapultes, et frappez par temps de brouillard.',
    military: 'Leurs chevaliers dominent les plaines mais peinent en forêt et en montagne.',
    commercial: 'Leur armée est surtout composée de milices : une infanterie lourde suffit.',
    technological: 'Leurs archers d’élite redoutent la cavalerie légère et la pluie.',
  }[RIVALS[i].personality];
}
function movementsOf(state, f, now) {
  if (f.stance === 'war' || raidWillingness(state, f.idx) > 0.08) return `Des troupes se massent : un raid est probable dans les prochaines heures${state.raidCooldown > now ? ' (après la trêve actuelle)' : ''}.`;
  if (f.wars.length) return `Leurs armées sont occupées contre ${f.wars.map(factionName).join(', ')}.`;
  return 'Aucun mouvement hostile observé.';
}

// Contre-espionnage : les factions espionnent aussi le joueur
export function enemySpyTick(state, now) {
  for (const f of state.factions || []) {
    const per = RIVALS[f.idx].personality;
    if (!rng.chance(per === 'technological' ? 0.06 : 0.02)) continue;
    const detect = Math.min(0.9, 0.2 + levelOf(state, 'watchtower') * 0.04 + (state.army.spy || 0) * 0.03);
    if (rng.chance(detect)) {
      f.relation = Math.max(-100, f.relation - 4);
      log(state, 'good', `🕵️ Un espion de ${factionName(f.idx)} a été démasqué dans votre ville.`, now);
    } else f.knowsUs = now;
  }
}

export function allyReinforcements(state) {
  const allies = (state.factions || []).filter((f) => f.stance === 'alliance');
  const guildN = state.guild && state.guild.level >= 5 ? 8 + state.guild.level * 2 : 0;
  if (!allies.length && !guildN) return null;
  const n = allies.reduce((a, f) => a + Math.round(6 + f.army * 6), 0) + guildN;
  return { guard: n, royalArcher: Math.round(n * 0.7) };
}

void ENEMY_UNITS; void wTerrain; void reveal; void uid; void fmt; void STANCES;
