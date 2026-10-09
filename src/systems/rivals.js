import { recordLoss } from './losses.js';
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
import { log, toast } from './log.js';
import { raidWillingness, allyReinforcements, changeRelation } from './factions.js';
import { UNITS } from '../data/units.js';
import { bumpRep, recordMax } from './reputation.js';
import { chronicle } from './chronicle.js';

export const PROTECTION_TH = 4;

const kingdoms = (state) => Object.values(state.world.pois).filter((p) => p.type === 'kingdom');

function warWeakness(state, now) {
  return state.events.some((e) => e.key === 'factionWar' && e.end > now) ? 0.75 : 1;
}

export function rivalGarrison(state, poi, now = Date.now()) {
  const k = poi.power * (0.5 + 0.45 * thLevel(state)) * warWeakness(state, now);
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
  // La faction se renforce réellement (sinon le tick des factions écrasait ce gain) …
  const f = (state.factions || []).find((x) => x.idx === poi.rival);
  if (f) f.army = Math.min(20, Math.round((f.army + 0.15) * 100) / 100);
  // … et une cité mise à sac n'a plus rien à piller pendant 6 h
  poi.clearedUntil = now + 6 * 3600000;
  poi.anger = (poi.anger || 0) + 1;
  poi.lastDefeated = now;
  return loot;
}

// Armée de raid : calibrée sur la puissance totale du joueur (préparer sa défense permet de gagner)
function raidArmy(state, poi, now) {
  const mix = { militia: 0.35, guard: 0.1, royalArcher: 0.3, royalKnight: 0.25 };
  const target = Math.max(250 * thLevel(state), armyPower(armyTotals(state)) * rng.float(0.6, 1.0) * (0.9 + 0.08 * poi.rival)) * warWeakness(state, now);
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
  state.raidCooldown = now + warn + 3 * 3600 * 1000; // trêve après chaque raid
  state.raids.push({ id: uid('raid'), rival: p.rival, name: p.name, from: { x: p.x, y: p.y }, army, arrive: now + warn, seen: levelOf(state, 'watchtower') >= 3 || (mods['raid.reveal'] || 0) > 0 });
  if (p.anger) p.anger--;
  log(state, 'bad', `🚨 ${RIVALS[p.rival].lord} (${p.name}) lance un raid contre votre ville ! Arrivée dans ${Math.round(warn / 60000)} min.`, now);
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
  const res = simulateBattle(
    { units: raid.army, mods: { 'combat.atk': 0.05 }, formation: 'assault', label: raid.name },
    { units: def, mods: { ...mods, 'combat.def': (mods['combat.def'] || 0) + (mods['city.def'] || 0) }, fort, formation: 'shieldwall', supply: (state.resources.bread || 0) > 50, famine: state.famine, label: 'Garnison' },
    { terrain: 'city', weather: state.weather.type },
  );
  // Pertes de la garnison
  const newArmy = { scout: scouts };
  for (const [u, n] of Object.entries(res.defRemaining)) if (UNITS[u] && u !== 'scout') newArmy[u] = n;
  for (const u of ['spy']) if (state.army[u]) newArmy[u] = state.army[u];
  state.army = newArmy;
  const win = res.winner === 'defender';
  let text;
  if (win) {
    state.stats.raidsRepelled++;
    bumpRep(state, 'warrior', 5);
    changeRelation(state, raid.rival, 3);
    if (allies) chronicle(state, `Avec l’aide de leurs alliés, les défenseurs de ${state.meta.kingdomName} repoussent ${raid.name}.`, t);
    const bounty = { gold: 150 + thLevel(state) * 60, iron: 50 + thLevel(state) * 30 };
    gain(state, bounty, mods);
    text = `Raid de ${raid.name} repoussé ! Butin des vaincus : ${bounty.gold} or, ${bounty.iron} fer.`;
    log(state, 'good', `🛡️ ${text}`, t);
  } else {
    const prot = protectedAmount(state, mods);
    const stolen = {};
    for (const r of BASE_RES) {
      const v = Math.floor(Math.max(0, (state.resources[r] || 0) - prot) * 0.3);
      if (v > 0) { stolen[r] = v; state.resources[r] -= v; }
    }
    recordLoss(state, 'raid', stolen, t);
    text = `La ville est pillée par ${raid.name} : ${Object.entries(stolen).map(([r, v]) => `${fmt(v)} ${RESOURCES[r].icon}`).join(' ') || 'rien (tout était à l’abri)'}.`;
    state.stats.raidsLost = (state.stats.raidsLost || 0) + 1;
    log(state, 'bad', `🔥 ${text}`, t);
    const k = Object.values(state.world.pois).find((p) => p.type === 'kingdom' && p.rival === raid.rival);
    if (k) k.anger = (k.anger || 0) + 1;
    // Une fois sur deux, les assaillants incendient un bâtiment (production −50 % jusqu'à réparation)
    const targets = allBuildings(state).filter((b) => b.level > 0 && !b.damaged && !['townhall', 'road', 'deco', 'warehouse'].includes(b.type));
    const burnt = [];
    if (targets.length && rng.chance(0.5)) { const b = rng.pick(targets); b.damaged = true; burnt.push(BUILDINGS[b.type]?.name || b.type); }
    if (burnt.length) text += ` Bâtiments incendiés (production −50 % jusqu’à réparation) : ${burnt.join(', ')}.`;
  }
  const nDef = Object.values(def).reduce((a, b) => a + b, 0);
  const prep = `Préparation : ${nDef} défenseurs${allies ? ' (dont renforts alliés)' : ''}, muraille +${Math.round(fort * 100)} % de défense, ${(state.resources.bread || 0) > 50 ? 'rations de pain distribuées' : 'pas de pain (moral réduit)'}${mods['city.def'] ? `, défense de la ville +${Math.round(mods['city.def'] * 100)} %` : ''}.`;
  text = `${text} ${prep}`;
  state.reports.unshift({ id: uid('rep'), t, kind: 'defense', title: `${win ? 'Défense réussie' : 'Ville pillée'} — ${raid.name}`, win, result: res, enemies: raid.army, text, terrain: 'city', weather: state.weather.type, defense: true, read: false });
  if (state.reports.length > 60) state.reports.length = 60;
}

export { POI_TYPES };
