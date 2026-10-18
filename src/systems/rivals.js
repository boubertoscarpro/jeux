import { fortifyFactor, noteHostile } from './reactions.js';
import { recordLoss } from './losses.js';
import { castleName } from './identity.js';
import { raidPenalty } from './warcampaign.js';
import { RIVALS, POI_TYPES } from '../data/world.js';
import { BASE_RES, RESOURCES } from '../data/resources.js';
import { rng } from '../core/rng.js';
import { uid, fmt } from '../core/util.js';
import { thLevel, levelOf, allBuildings } from './city.js';
import { BUILDINGS } from '../data/buildings.js';
import { computeMods } from './modifiers.js';
import { simulateBattle } from './combat.js';
import { armyPower } from './army.js';
import { armyTotals } from './economy.js';
import { ENEMY_UNITS } from '../data/units.js';
import { protectedAmount, gain } from './economy.js';
import { log, toast, feat } from './log.js';
import { raidWillingness, allyReinforcements, changeRelation } from './factions.js';
import { UNITS } from '../data/units.js';
import { bumpRep, recordMax } from './reputation.js';
import { chronicle } from './chronicle.js';
import { pay } from './economy.js';
import { pickRaidFlank, flankRevealed, flankBonus, useTools, breachChance, raidTargets, pillageShare, siegeDamage } from './castle.js';
import { FLANKS, DEFENSE_TOOLS } from '../data/castle.js';

export const PROTECTION_TH = 4;
// Trêve après un raid (6 h, contre 3 auparavant) et répit supplémentaire après un pillage : les raids restent un
// défi régulier (≈ 2 par jour au plus) sans tourner à la corvée ni à la spirale de pertes.
export const RAID_TRUCE_H = 6;
export const RAID_LOST_GRACE_H = 4;

const kingdoms = (state) => Object.values(state.world.pois).filter((p) => p.type === 'kingdom');

function warWeakness(state, now) {
  return state.events.some((e) => e.key === 'factionWar' && e.end > now) ? 0.75 : 1;
}

export function rivalGarrison(state, poi, now = Date.now()) {
  const k = poi.power * (0.5 + 0.45 * thLevel(state)) * warWeakness(state, now) * fortifyFactor(state, poi.rival, now);
  const style = RIVALS[poi.rival]?.style;
  const mix = style === 'defensive' ? { militia: 26, guard: 10, royalArcher: 14, royalKnight: 2 }
    : style === 'raider' ? { militia: 14, guard: 4, royalArcher: 10, royalKnight: 8 }
    : { militia: 20, guard: 6, royalArcher: 10, royalKnight: 4 };
  return Object.fromEntries(Object.entries(mix).map(([u, n]) => [u, Math.max(1, Math.round(n * k * rng.float(0.9, 1.1)))]));
}

export function onRivalDefeated(state, poi, now) {
  const k = poi.power * (1 + thLevel(state) * 0.4);
  const loot = { gold: Math.round(500 * k), food: Math.round(800 * k), wood: Math.round(700 * k), stone: Math.round(600 * k), iron: Math.round(300 * k) };
  if (poi.power > 2) loot.steel = Math.round(20 * k);
  poi.garrison = null;
  poi.power = Math.round((poi.power + 0.15) * 100) / 100;
  // La faction se renforce réellement (sinon le tick des factions écrasait ce gain), mais en puisant dans sa
  // richesse (bornée) : des défaites répétées l'épuisent au lieu de la rendre plus riche
  const f = (state.factions || []).find((x) => x.idx === poi.rival);
  if (f) {
    const paid = f.wealth >= 600;
    if (paid) f.wealth -= 600;
    f.army = Math.min(20, Math.round((f.army + (paid ? 0.15 : 0.05)) * 100) / 100);
    noteHostile(state, poi.rival, 'sack', now);
  }
  // … et une cité mise à sac n'a plus rien à piller pendant 6 h
  poi.clearedUntil = now + 6 * 3600000;
  poi.anger = (poi.anger || 0) + 1;
  poi.lastDefeated = now;
  return loot;
}

// Armée de raid : calibrée sur la puissance totale du joueur (préparer sa défense permet de gagner)
function raidArmy(state, poi, now) {
  const mix = { militia: 0.35, guard: 0.1, royalArcher: 0.3, royalKnight: 0.25 };
  const target = Math.max(250 * thLevel(state), armyPower(armyTotals(state)) * rng.float(0.6, 1.0) * (0.9 + 0.08 * poi.rival)) * warWeakness(state, now) * raidPenalty(state, poi.rival, now);
  const out = {};
  for (const [u, share] of Object.entries(mix)) {
    const unit = ENEMY_UNITS[u];
    const per = (unit.atk + unit.def) * Math.sqrt(unit.hp / 30);
    out[u] = Math.max(1, Math.round((target * share) / per));
  }
  return out;
}

export function raidWarning(state, mods) {
  return (6 + levelOf(state, 'watchtower') * 1.5) * 60 * 1000 * (1 + (mods['raid.warning'] || 0));
}

// Tick des rivaux (toutes les ~10 min de jeu)
export function rivalTick(state, now) {
  for (const p of kingdoms(state)) {
    p.power = Math.round((p.power + 0.01) * 1000) / 1000; // croissance lente
    if (p.garrison && rng.chance(0.2)) p.garrison = null; // la garnison se renouvelle
  }
  if (thLevel(state) < PROTECTION_TH) return;
  if (state.raids.length || (state.raidCooldown || 0) > now) return;
  const candidates = kingdoms(state).filter((p) => raidWillingness(state, p.rival) > 0 || (p.anger || 0) > 0);
  if (!candidates.length) return;
  const p = rng.pick(candidates);
  const chance = raidWillingness(state, p.rival) + (p.anger || 0) * 0.06;
  if (!rng.chance(chance)) return;
  const mods = computeMods(state, now);
  const army = raidArmy(state, p, now);
  const warn = raidWarning(state, mods);
  state.raidCooldown = now + warn + RAID_TRUCE_H * 3600 * 1000; // trêve après chaque raid
  feat('⚔️', `Raid en approche : ${p.name}`, 'Renforcez la garnison, montez les murailles ou évacuez les réserves.', 'bad');
  // v16 : flanc visé (le plus faible une fois sur deux), connu à l'avance avec une tour de garde niv. 5
  state.raids.push({ id: uid('raid'), rival: p.rival, name: p.name, from: { x: p.x, y: p.y }, army, start: now, arrive: now + warn, seen: levelOf(state, 'watchtower') >= 3 || (mods['raid.reveal'] || 0) > 0, flank: pickRaidFlank(state, () => rng.random()), flankSeen: flankRevealed(state) });
  if (p.anger) p.anger--;
  log(state, 'bad', `🚨 ${RIVALS[p.rival].lord} (${p.name}) lance un raid contre ${castleName(state)} ! Arrivée dans ${Math.round(warn / 60000)} min.`, now);
  toast(`🚨 Raid en approche : ${p.name}`, 'bad');
}

export function resolveRaid(state, raid, t) {
  const mods = computeMods(state, t);
  const fort = (mods['wall.bonus'] || 0) * (1 + (mods['wall.pct'] || 0));
  const defenders = { ...state.army };
  delete defenders.scout;
  delete defenders.spy;
  const scouts = state.army.scout || 0;
  if (mods.militia) defenders.militia = 10 + thLevel(state) * 5;
  const allies = allyReinforcements(state);
  if (allies) for (const [u, n] of Object.entries(allies)) defenders[u] = (defenders[u] || 0) + n;
  const def = Object.keys(defenders).length && Object.values(defenders).some((n) => n > 0) ? defenders : { militia: 5 };
  // v16 : défense par flancs (part de la garnison sur le flanc attaqué) et outils de défense posés sur ce flanc
  const flank = FLANKS[raid.flank] ? raid.flank : 'front';
  const fb = flankBonus(state, flank);
  const tools = useTools(state, flank, (c) => pay(state, c));
  const defMods = { ...mods, 'combat.def': (mods['combat.def'] || 0) + (mods['city.def'] || 0) + fb + (tools.mods['combat.def'] || 0), 'combat.atk': (mods['combat.atk'] || 0) + (tools.mods['combat.atk'] || 0) };
  const res = simulateBattle(
    { units: raid.army, mods: { 'combat.atk': 0.05 }, formation: 'assault', label: raid.name },
    { units: def, mods: defMods, fort, formation: 'shieldwall', supply: (state.resources.bread || 0) > 50, famine: state.famine, label: 'Garnison' },
    { terrain: 'city', weather: state.weather.type },
  );
  // Pertes de la garnison
  const newArmy = { scout: scouts };
  for (const [u, n] of Object.entries(res.defRemaining)) if (UNITS[u] && u !== 'scout') newArmy[u] = n;
  for (const u of ['spy']) if (state.army[u]) newArmy[u] = state.army[u];
  state.army = newArmy;
  const win = res.winner === 'defender';
  // v16 : la muraille tient-elle ? (sans muraille, rien n'arrête les pillards)
  const breached = !win && rng.chance(breachChance(state));
  siegeDamage(state, { win, breached });
  let text;
  if (win) {
    state.stats.raidsRepelled++;
    state.raidLossStreak = 0;
    bumpRep(state, 'warrior', 5);
    changeRelation(state, raid.rival, 3);
    if (allies) chronicle(state, `Avec l’aide de leurs alliés, les défenseurs de ${state.meta.kingdomName} repoussent ${raid.name}.`, t);
    const bounty = { gold: 150 + thLevel(state) * 60, iron: 50 + thLevel(state) * 30 };
    gain(state, bounty, mods);
    text = `Raid de ${raid.name} repoussé devant ${castleName(state)} ! Butin des vaincus : ${bounty.gold} or, ${bounty.iron} fer.`;
    log(state, 'good', `🛡️ ${text}`, t);
  } else {
    const prot = protectedAmount(state, mods);
    const share = pillageShare(state, breached);
    const stolen = {};
    for (const r of BASE_RES) {
      const v = Math.floor(Math.max(0, (state.resources[r] || 0) - prot) * share);
      if (v > 0) { stolen[r] = v; state.resources[r] -= v; }
    }
    recordLoss(state, 'raid', stolen, t);
    // Les pillards repus laissent le royaume se relever ; après plusieurs défaites d'affilée, la trêve s'allonge
    // (+6 h par défaite consécutive, jusqu'à +18 h) pour qu'un royaume faible ne soit pas pillé en boucle
    state.raidLossStreak = (state.raidLossStreak || 0) + 1;
    const extra = Math.min(18, 6 * (state.raidLossStreak - 1));
    state.raidCooldown = Math.max(state.raidCooldown || 0, t + (RAID_TRUCE_H + RAID_LOST_GRACE_H + extra) * 3600000);
    text = `${castleName(state)} est pillé par ${raid.name} : ${Object.entries(stolen).map(([r, v]) => `${fmt(v)} ${RESOURCES[r].icon}`).join(' ') || 'rien (tout était à l’abri)'}.`;
    state.stats.raidsLost = (state.stats.raidsLost || 0) + 1;
    log(state, 'bad', `🔥 ${text}`, t);
    // Une fois sur deux, les assaillants incendient un bâtiment (production −50 % jusqu'à réparation)
    // v16 : les pillards frappent d'abord hors les murs ; la cour seulement si la muraille a cédé
    const targets = raidTargets(state, breached);
    const burnt = [];
    if (targets.length && rng.chance(0.5)) { const b = rng.pick(targets); b.damaged = true; burnt.push(BUILDINGS[b.type]?.name || b.type); }
    if (burnt.length) text += ` Bâtiments incendiés (production −50 % jusqu’à réparation) : ${burnt.join(', ')}.`;
    if (levelOf(state, 'wall') > 0) text += breached ? ' La muraille a cédé : la cour du donjon n’était plus à l’abri.' : ` La muraille a tenu : la cour du donjon est restée à l’abri${share < 0.3 ? ' et l’entrepôt intra-muros a limité le pillage' : ''}.`;
    else text += ' Sans muraille, rien n’a arrêté les pillards.';
  }
  const nDef = Object.values(def).reduce((a, b) => a + b, 0);
  const prep = `Préparation : ${nDef} défenseurs${allies ? ' (dont renforts alliés)' : ''}, muraille +${Math.round(fort * 100)} % de défense, ${(state.resources.bread || 0) > 50 ? 'rations de pain distribuées' : 'pas de pain (moral réduit)'}${mods['city.def'] ? `, défense de la ville +${Math.round(mods['city.def'] * 100)} %` : ''}.`;
  const flankTxt = ` Assaut sur le ${FLANKS[flank].name.toLowerCase()} : ${fb > 0 ? `défense +${Math.round(fb * 100)} % (troupes bien placées)` : fb < 0 ? `défense ${Math.round(fb * 100)} % (flanc dégarni)` : 'répartition neutre'}${tools.used.length ? `, ${tools.used.map((k) => DEFENSE_TOOLS[k].name.toLowerCase()).join(' et ')} engagé${tools.used.length > 1 ? 's' : ''}` : ''}.`;
  text = `${text} ${prep}${flankTxt}`;
  state.reports.unshift({ id: uid('rep'), t, kind: 'defense', title: `${win ? 'Défense réussie' : 'Ville pillée'} — ${raid.name}`, win, flank, breached, result: res, enemies: raid.army, text, terrain: 'city', weather: state.weather.type, defense: true, read: false });
  if (state.reports.length > 60) state.reports.length = 60;
}

export { POI_TYPES };
