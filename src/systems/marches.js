import { UNITS } from '../data/units.js';
import { POI_TYPES } from '../data/world.js';
import { RESOURCES } from '../data/resources.js';
import { EXPLORE_EVENTS } from '../data/exploration.js';
import { CONSUMABLES } from '../data/items.js';
import { BOSSES } from '../data/world.js';
import { SEASON } from '../data/social.js';
import { rng } from '../core/rng.js';
import { uid, addInto, fmt } from '../core/util.js';
import { computeMods } from './modifiers.js';
import { heroMods, giveXp, createHero } from './heroes.js';
import { simulateBattle } from './combat.js';
import { gain, pay, storageCap } from './economy.js';
import { generateItem } from './items.js';
import { boostResearch } from './research.js';
import { log, toast } from './log.js';
import { wTerrain, poiAt, reveal, travelTime, distCap, spawnPoi, findFreeTile, key, isRevealed } from './world.js';
import { makeEnemies } from './worldgen.js';
import { maxHeroes } from './tavern.js';
import { guildProgress } from './guild.js';
import { rivalGarrison, onRivalDefeated } from './rivals.js';
import { runDungeon } from './dungeons.js';
import { rollShards } from './shards.js';
import { recordMax, bumpRep } from './reputation.js';
import { changeRelation, diplomacy } from './factions.js';

export const MARCH_TYPES = {
  gather: { name: 'Récolte', icon: '🧺' },
  explore: { name: 'Exploration', icon: '🧭' },
  attack: { name: 'Attaque', icon: '⚔️' },
  scout: { name: 'Espionnage', icon: '👁️' },
  boss: { name: 'Assaut du boss', icon: '🐉' },
  dungeon: { name: 'Expédition de donjon', icon: '🏚️' },
};

export const maxMarches = (mods) => 2 + (mods.marches || 0);

export function carryCapacity(units, mods) {
  let c = 0;
  for (const [t, n] of Object.entries(units)) c += (UNITS[t]?.carry || 0) * n;
  return Math.floor(c * (1 + (mods.carry || 0)));
}

export function gatherRate(units, mods, res) {
  let g = 0;
  for (const [t, n] of Object.entries(units)) g += (UNITS[t]?.gather || 0) * n;
  const hardness = Object.values(POI_TYPES).find((d) => d.res === res)?.hardness || 1;
  return (g * (1 + (mods['gather.all'] || 0) + (mods['gather.' + res] || 0))) / hardness;
}

// Modificateurs d'une marche = globaux + commandant + potion
export function marchMods(state, heroId, potion, now) {
  const mods = { ...computeMods(state, now) };
  const hero = state.heroes.find((h) => h.id === heroId);
  if (hero) for (const [k, v] of Object.entries(heroMods(state, hero, 'commander'))) mods[k] = (mods[k] || 0) + v;
  if (potion && CONSUMABLES[potion]?.march) for (const [k, v] of Object.entries(CONSUMABLES[potion].march)) mods[k] = (mods[k] || 0) + v;
  return mods;
}

const unitCount = (u) => Object.values(u).reduce((s, v) => s + v, 0);
export const breadNeeded = (units) => Math.ceil(unitCount(units) * 0.5);

// Valide une marche ; renvoie { ok, reason, info }
export function planMarch(state, opts, now = Date.now()) {
  const { type, x, y, heroId, potion } = opts;
  const units = Object.fromEntries(Object.entries(opts.units || {}).filter(([, n]) => n > 0).map(([k, n]) => [k, Math.floor(n)]));
  const world = state.world;
  const mods = marchMods(state, heroId, potion, now);
  const poi = poiAt(world, x, y);
  const fail = (reason) => ({ ok: false, reason });
  if (state.marches.length >= maxMarches(computeMods(state, now))) return fail('Nombre maximum de marches atteint (améliorez le Donjon)');
  for (const [t, n] of Object.entries(units)) if ((state.army[t] || 0) < n) return fail(`Pas assez de ${UNITS[t].name}`);
  if (!unitCount(units)) return fail('Sélectionnez des unités');
  if (heroId) {
    const h = state.heroes.find((h) => h.id === heroId);
    if (!h) return fail('Héros introuvable');
    if (h.marchId) return fail(`${h.name} est déjà en marche`);
    if (h.assignment) return fail(`${h.name} est intendant (retirez-le d’abord)`);
  }
  if (potion && !(state.inventory.consumables[potion] > 0)) return fail('Potion indisponible');
  if (opts.supply && (state.resources.bread || 0) < breadNeeded(units)) return fail(`Pas assez de pain (${breadNeeded(units)} requis)`);
  const def = poi ? POI_TYPES[poi.type] : null;
  if (type === 'explore') {
    if (!units.scout) return fail('Il faut au moins un éclaireur');
  } else if (type === 'scout') {
    if (!units.scout) return fail('Il faut au moins un éclaireur');
    if (!poi || !['danger', 'kingdom', 'gather', 'boss'].includes(def.kind)) return fail('Rien à espionner ici');
  } else if (type === 'gather') {
    if (!poi || def.kind !== 'gather') return fail('Pas de site de récolte');
    if (poi.amount < 1) return fail('Site épuisé');
    if (state.marches.some((m) => m.type === 'gather' && m.x === x && m.y === y)) return fail('Déjà une récolte en cours sur ce site');
    if (!gatherRate(units, mods, def.res)) return fail('Ces unités ne peuvent pas récolter');
  } else if (type === 'attack') {
    if (!poi || !['danger', 'kingdom'].includes(def.kind)) return fail('Rien à attaquer ici');
    if (poi.clearedUntil > now) return fail('Site déjà nettoyé (réapparition plus tard)');
  } else if (type === 'dungeon') {
    if (!poi || !def.dungeon) return fail('Pas de donjon ici');
  } else if (type === 'boss') {
    if (!state.boss || state.boss.x !== x || state.boss.y !== y || state.boss.hp <= 0) return fail('Pas de boss ici');
  }
  const travel = travelTime(world, x, y, units, mods, type === 'explore' || type === 'scout' ? 'explore' : 'march');
  return { ok: true, units, mods, travel, poi };
}

export function sendMarch(state, opts, now = Date.now()) {
  const plan = planMarch(state, opts, now);
  if (!plan.ok) return plan;
  const { units, travel } = plan;
  for (const [t, n] of Object.entries(units)) state.army[t] -= n;
  if (opts.supply) state.resources.bread -= breadNeeded(units);
  if (opts.potion) state.inventory.consumables[opts.potion]--;
  const m = {
    id: uid('m'), type: opts.type, x: opts.x, y: opts.y, units, heroId: opts.heroId || null,
    formation: opts.formation || 'balanced', supply: !!opts.supply, potion: opts.potion || null,
    phase: 'out', start: now, arrive: now + travel, travel, loot: {}, items: [], log: [], retreat: opts.retreat ?? 0.5,
  };
  if (m.heroId) state.heroes.find((h) => h.id === m.heroId).marchId = m.id;
  state.marches.push(m);
  return { ok: true, march: m };
}

export function recallMarch(state, mid, now = Date.now()) {
  const m = state.marches.find((x) => x.id === mid);
  if (!m || m.phase === 'back') return { ok: false };
  if (m.phase === 'out') {
    const elapsed = now - m.start;
    m.phase = 'back'; m.returnAt = now + elapsed;
  } else if (m.phase === 'work') {
    const frac = Math.max(0, Math.min(1, (now - m.workStart) / (m.workEnd - m.workStart)));
    const poi = poiAt(state.world, m.x, m.y);
    if (poi) poi.amount += m.reserved * (1 - frac);
    finishGather(state, m, frac, now);
    m.phase = 'back'; m.returnAt = now + m.travel;
  } else if (m.phase === 'wait') {
    state.pending = state.pending.filter((p) => p.marchId !== m.id);
    m.phase = 'back'; m.returnAt = now + m.travel;
  }
  return { ok: true };
}

// Prochain instant où une marche change d'état
export function marchNextTime(m) {
  if (m.phase === 'out') return m.arrive;
  if (m.phase === 'work') return m.workEnd;
  if (m.phase === 'back') return m.returnAt;
  return Infinity;
}

export function processMarch(state, m, now) {
  if (m.phase === 'out' && now >= m.arrive) arrive(state, m, m.arrive);
  else if (m.phase === 'work' && now >= m.workEnd) {
    finishGather(state, m, 1, m.workEnd);
    m.phase = 'back'; m.returnAt = m.workEnd + m.travel;
  } else if (m.phase === 'back' && now >= m.returnAt) homecoming(state, m, m.returnAt);
}

function goBack(m, t) { m.phase = 'back'; m.returnAt = t + m.travel; }

function addReport(state, rep) {
  state.reports.unshift({ id: uid('rep'), t: rep.t, read: false, ...rep });
  if (state.reports.length > 60) state.reports.length = 60;
}

function heroOf(state, m) { return state.heroes.find((h) => h.id === m.heroId) || null; }

// Combat générique pour une marche ; applique les pertes et renvoie le résultat
function marchBattle(state, m, enemies, t, opts = {}) {
  const mods = marchMods(state, m.heroId, m.potion, t);
  const terrain = opts.terrain || wTerrain(state.world, m.x, m.y);
  const danger = opts.danger ?? 1;
  const res = simulateBattle(
    { units: m.units, mods, formation: m.formation, supply: m.supply, famine: state.famine, label: 'Vous' },
    { units: enemies, mods: { 'combat.atk': 0.05 * danger, 'combat.def': 0.05 * danger, ...(opts.enemyMods || {}) }, fort: opts.fort || 0, label: opts.enemyLabel || 'Ennemi' },
    { terrain: terrain === 'ash' ? 'ruins' : terrain, weather: state.weather.type, bossHp: opts.bossHp },
  );
  m.potion = null; // la potion est consommée au premier combat
  m.units = Object.fromEntries(Object.entries(res.attRemaining).filter(([, n]) => n > 0));
  const hero = heroOf(state, m);
  const killed = Object.entries(res.defLosses).reduce((s, [u, n]) => s + n * 10, 0) + res.bossDamage / 50;
  if (hero) giveXp(state, hero, 20 + killed, mods);
  if (res.winner === 'attacker' && !opts.bossHp) { state.stats.battlesWon++; state.season.points += SEASON.points.battle; }
  else if (!opts.bossHp) state.stats.battlesLost++;
  return res;
}

function lootWithCarry(state, m, loot, mods) {
  const cap = carryCapacity(m.units, mods) - Object.entries(m.loot).reduce((s, [r, v]) => s + (RESOURCES[r].cat === 'rare' ? 0 : v), 0);
  const commons = Object.entries(loot).filter(([r]) => RESOURCES[r].cat !== 'rare');
  const total = commons.reduce((s, [, v]) => s + v, 0);
  const k = total > cap ? Math.max(0, cap) / total : 1;
  const got = {};
  for (const [r, v] of Object.entries(loot)) {
    const amt = Math.floor(RESOURCES[r].cat === 'rare' ? v : v * k);
    if (amt > 0) got[r] = amt;
  }
  addInto(m.loot, got);
  return { got, limited: k < 1 };
}

function rareRolls(state, m, poi, mods, base) {
  const out = {};
  const p = base + (mods['loot.rare'] || 0);
  const def = POI_TYPES[poi.type];
  for (const [r, [a, b]] of Object.entries(def.rare || {})) if (rng.chance(Math.min(0.95, 0.5 + p))) out[r] = rng.int(a, b);
  if (rng.chance(p * 0.5)) out.rareOre = (out.rareOre || 0) + rng.int(1, 2 + poi.danger);
  if (mods['loot.crystal'] && rng.chance(mods['loot.crystal'] + poi.danger * 0.02)) out.crystals = (out.crystals || 0) + rng.int(1, 3);
  return out;
}

function arrive(state, m, t) {
  const world = state.world;
  const poi = poiAt(world, m.x, m.y);
  const mods = marchMods(state, m.heroId, m.potion, t);
  const hero = heroOf(state, m);
  if (m.type === 'explore') return arriveExplore(state, m, t, mods, hero);
  if (m.type === 'scout') {
    reveal(world, m.x, m.y, 1);
    const danger = poi?.danger || 0;
    const lossChance = Math.max(0, danger * 0.08 - (mods['ambush.reduce'] || 0) * 0.2);
    let text = '';
    if (poi) {
      if (POI_TYPES[poi.type].kind === 'kingdom' && !poi.garrison) poi.garrison = rivalGarrison(state, poi, t);
      poi.scouted = true;
      text = `Vos éclaireurs ont observé ${POI_TYPES[poi.type].name}.`;
    }
    if (rng.chance(lossChance)) {
      const lost = Math.max(1, Math.floor(m.units.scout * 0.5));
      m.units.scout -= lost;
      text += ` ${lost} éclaireur(s) capturé(s).`;
    }
    addReport(state, { t, kind: 'scout', title: `Espionnage — ${poi ? POI_TYPES[poi.type].name : 'zone'}`, x: m.x, y: m.y, text, enemies: poi?.enemies || poi?.garrison, win: true });
    log(state, 'explore', `👁️ ${text}`, t);
    if (hero) giveXp(state, hero, 25, mods);
    return goBack(m, t);
  }
  if (m.type === 'gather') return arriveGather(state, m, t, mods, poi, hero);
  if (m.type === 'attack') return arriveAttack(state, m, t, mods, poi);
  if (m.type === 'boss') return arriveBoss(state, m, t, mods);
  if (m.type === 'dungeon') {
    const rep = runDungeon(state, m, poi, mods, t);
    const hero = heroOf(state, m);
    if (hero) giveXp(state, hero, 60 + rep.cleared * 25, mods);
    addReport(state, { t, kind: 'battle', title: `Donjon niv. ${rep.level} — ${rep.done ? 'purgé' : `${rep.cleared}/${rep.total} salles`}`, x: m.x, y: m.y, win: rep.done, text: rep.lines.join(' '), loot: { ...m.loot } });
    log(state, rep.done ? 'good' : 'combat', `🏚️ Donjon (${m.x}, ${m.y}) : ${rep.cleared}/${rep.total} salles franchies.${rep.done ? ' Donjon purgé !' : ''}`, t);
    if (!unitCount(m.units)) return homecoming(state, m, t, true);
    return goBack(m, t);
  }
  goBack(m, t);
}

function arriveGather(state, m, t, mods, poi, hero) {
  const def = poi && POI_TYPES[poi.type];
  if (!poi || def.kind !== 'gather' || poi.amount < 1) {
    log(state, 'info', '🧺 Le site de récolte a disparu ou est épuisé. Vos troupes rentrent.', t);
    return goBack(m, t);
  }
  // Embuscade
  let ambushChance = poi.danger * 0.14 * (1 - (mods['ambush.reduce'] || 0));
  if (state.weather.type === 'fog') ambushChance += 0.08;
  if (poi.infested) ambushChance += 0.25;
  if (poi.danger > 0 && rng.chance(ambushChance)) {
    const enemies = poi.enemies ? { ...poi.enemies } : { bandit: 3 + poi.danger * 2 };
    if (poi.infested) { enemies.spider = (enemies.spider || 0) + 4 + poi.danger * 2; }
    const res = marchBattle(state, m, enemies, t, { danger: poi.danger, enemyLabel: 'Embuscade' });
    addReport(state, { t, kind: 'battle', title: `Embuscade — ${def.name}`, x: m.x, y: m.y, win: res.winner === 'attacker', result: res, enemies, terrain: wTerrain(state.world, m.x, m.y), weather: state.weather.type });
    if (res.winner !== 'attacker') {
      log(state, 'bad', `⚔️ Embuscade au ${def.name} ! Vos troupes battent en retraite.`, t);
      if (!unitCount(m.units)) return homecoming(state, m, t, true);
      return goBack(m, t);
    }
    log(state, 'good', `⚔️ Embuscade repoussée au ${def.name}. La récolte continue.`, t);
  }
  const mult = 1 + (mods['gather.all'] || 0) + (mods['gather.' + def.res] || 0);
  const cap = carryCapacity(m.units, mods);
  const take = Math.floor(Math.min(poi.amount, cap / mult));
  if (take <= 0) return goBack(m, t);
  const rate = gatherRate(m.units, mods, def.res) / mult; // unités du site par minute (le bonus augmente le rendement)
  const minutes = Math.max(0.5, take / Math.max(1, rate));
  poi.amount -= take;
  m.reserved = take;
  m.yieldMult = mult;
  m.phase = 'work'; m.workStart = t; m.workEnd = t + minutes * 60000;
}

function finishGather(state, m, frac, t) {
  const poi = poiAt(state.world, m.x, m.y);
  if (!m.reserved) return;
  const def = POI_TYPES[poi?.type] || POI_TYPES.woodNode;
  const mods = marchMods(state, m.heroId, null, t);
  const amount = Math.floor(m.reserved * frac * (m.yieldMult || 1));
  const loot = { [def.res]: amount };
  for (const [r, p] of Object.entries(def.bonus || {})) {
    const v = amount * p;
    const n = Math.floor(v) + (rng.chance(v - Math.floor(v)) ? 1 : 0);
    if (n > 0) loot[r] = (loot[r] || 0) + n;
  }
  if (poi && poi.danger > 0 && frac > 0.5) addInto(loot, rareRolls(state, m, poi, mods, poi.danger * 0.03));
  addInto(m.loot, loot);
  state.stats.gatherDone++;
  m.reserved = 0;
  m.log.push(`Récolte : ${Object.entries(loot).map(([r, v]) => `${fmt(v)} ${RESOURCES[r].name}`).join(', ')}`);
  const hero = heroOf(state, m);
  if (hero) giveXp(state, hero, amount / 40, mods);
  state.season.points += SEASON.points.gather;
  guildProgress(state, def.res, amount);
}

function arriveAttack(state, m, t, mods, poi) {
  const def = poi && POI_TYPES[poi.type];
  if (!poi || (poi.clearedUntil > t)) {
    log(state, 'info', '⚔️ La cible a déjà été nettoyée. Vos troupes rentrent.', t);
    return goBack(m, t);
  }
  let enemies = poi.enemies || {};
  let fort = 0;
  if (def.kind === 'kingdom') {
    const f = state.factions?.[poi.rival];
    if (f && f.stance !== 'war') { diplomacy(state, poi.rival, 'war', t); log(state, 'bad', `⚔️ Votre attaque contre ${poi.name} est un acte de guerre.`, t); }
    if (!poi.garrison) poi.garrison = rivalGarrison(state, poi, t);
    enemies = poi.garrison;
    fort = poi.wall || 0;
  }
  const res = marchBattle(state, m, enemies, t, { danger: poi.danger, fort, enemyLabel: def.kind === 'kingdom' ? poi.name : def.name, terrain: def.kind === 'kingdom' ? 'city' : undefined });
  const win = res.winner === 'attacker';
  let lootText = '';
  if (win) {
    let baseLoot = {};
    if (def.kind === 'kingdom') {
      baseLoot = onRivalDefeated(state, poi, t);
    } else {
      const k = 1 + poi.danger * 0.45;
      for (const [r, v] of Object.entries(def.loot || {})) baseLoot[r] = Math.round(v * k * rng.float(0.85, 1.15));
      addInto(baseLoot, rareRolls(state, m, poi, mods, 0.02 * poi.danger));
      poi.clearedUntil = t + (def.respawn || 3600) * 1000;
      poi.enemies = {};
      if (poi.danger >= 3) state.stats.hardClears++;
      state.season.points += poi.danger >= 3 ? SEASON.points.hardClear : 0;
      guildProgress(state, 'clears', 1);
      // Objet
      if (def.item && rng.chance(Math.min(1, def.item + (mods['loot.rare'] || 0)))) {
        const it = generateItem({ ilvl: 1 + poi.danger * 2, boost: 0.15 * poi.danger + (mods['loot.rare'] || 0) * 3, min: def.itemMin || 'common' });
        m.items.push(it);
        lootText += ` Objet trouvé : ${it.name}.`;
      }
      // Transformation du site (mine reconquise)
      if (def.becomes) {
        const nd = POI_TYPES[def.becomes];
        const np = { id: `p_${poi.x}_${poi.y}_${def.becomes}`, type: def.becomes, x: poi.x, y: poi.y, danger: 1, max: nd.amount[0], amount: nd.amount[0], scouted: true };
        state.world.pois[key(poi.x, poi.y)] = np;
        lootText += ' La mine est reconquise : un riche filon est désormais exploitable !';
      }
      if (poi.temp) delete state.world.pois[key(poi.x, poi.y)];
    }
    const { got, limited } = lootWithCarry(state, m, baseLoot, mods);
    bumpRep(state, 'warrior', def.kind === 'kingdom' ? 6 : 1 + Math.floor(poi.danger / 2));
    if (def.kind === 'kingdom') { bumpRep(state, 'tyrant', 3); changeRelation(state, poi.rival, -10); }
    recordMax(state, 'biggestLoot', Object.values(got).reduce((a, b) => a + b, 0), `${def.kind === 'kingdom' ? poi.name : def.name} (${Object.values(got).reduce((a, b) => a + b, 0)} ressources)`, t);
    recordMax(state, 'biggestVictory', Object.values(res.defLosses).reduce((a, b) => a + b, 0), `${Object.values(res.defLosses).reduce((a, b) => a + b, 0)} ennemis — ${def.kind === 'kingdom' ? poi.name : def.name}`, t);
    state.stats.enemiesKilled = (state.stats.enemiesKilled || 0) + Object.values(res.defLosses).reduce((a, b) => a + b, 0);
    lootText = `Butin : ${Object.entries(got).map(([r, v]) => `${fmt(v)} ${RESOURCES[r].icon}`).join(' ') || 'rien'}${limited ? ' (limité par la capacité de transport)' : ''}.` + lootText;
    log(state, 'good', `⚔️ Victoire contre ${def.kind === 'kingdom' ? poi.name : def.name} ! ${lootText}`, t);
  } else {
    log(state, 'bad', `⚔️ Défaite contre ${def.kind === 'kingdom' ? poi.name : def.name}.`, t);
    // L'ennemi subit quand même ses pertes
    if (def.kind === 'danger') poi.enemies = { ...res.defRemaining };
    if (def.kind === 'kingdom') poi.garrison = { ...res.defRemaining };
  }
  poi.scouted = true;
  addReport(state, { t, kind: 'battle', title: `${win ? 'Victoire' : 'Défaite'} — ${def.kind === 'kingdom' ? poi.name : def.name}`, x: m.x, y: m.y, win, result: res, enemies, loot: { ...m.loot }, text: lootText, terrain: wTerrain(state.world, m.x, m.y), weather: state.weather.type });
  if (!unitCount(m.units)) return homecoming(state, m, t, true);
  goBack(m, t);
}

function arriveBoss(state, m, t, mods) {
  const boss = state.boss;
  if (!boss || boss.hp <= 0 || boss.x !== m.x || boss.y !== m.y) {
    log(state, 'info', '🐉 Le boss n’est plus là. Vos troupes rentrent.', t);
    return goBack(m, t);
  }
  const def = BOSSES[boss.key];
  const res = marchBattle(state, m, { [def.unit]: 1 }, t, { danger: 0, bossHp: boss.hp, enemyLabel: def.name });
  const dmg = Math.min(boss.hp, res.bossDamage);
  boss.hp -= dmg;
  boss.contrib = (boss.contrib || 0) + dmg;
  guildProgress(state, 'bossDamage', dmg);
  addReport(state, { t, kind: 'boss', title: `Assaut — ${def.name}`, x: m.x, y: m.y, win: dmg > 0, result: res, text: `Dégâts infligés : ${fmt(dmg)}.`, terrain: wTerrain(state.world, m.x, m.y), weather: state.weather.type });
  log(state, 'combat', `🐉 Vos troupes infligent ${fmt(dmg)} dégâts au ${def.name} (PV restants : ${fmt(boss.hp)}).`, t);
  if (!unitCount(m.units)) return homecoming(state, m, t, true);
  goBack(m, t);
}

function arriveExplore(state, m, t, mods, hero) {
  const world = state.world;
  const wasRevealed = isRevealed(world, m.x, m.y);
  const radius = 1.5 + (mods['explore.radius'] || 0);
  const found = reveal(world, m.x, m.y, radius);
  state.stats.explored++;
  bumpRep(state, 'explorer', 1);
  rollShards(state, 'exploration', t, { label: 'Fragment d’un ancien artefact découvert' });
  state.season.points += SEASON.points.explore;
  if (hero) giveXp(state, hero, 30, mods);
  const discoveries = found.filter((p) => p.type !== 'capital').map((p) => POI_TYPES[p.type].name);
  if (discoveries.length) m.log.push(`Découvertes : ${discoveries.join(', ')}`);
  const poi = poiAt(world, m.x, m.y);
  // Choix de l'événement
  let evKey;
  if (poi && poi.type === 'village' && !poi.visited) { evKey = 'village'; poi.visited = true; }
  else if (poi && POI_TYPES[poi.type].kind !== 'gather') evKey = rng.chance(0.5) ? null : 'nothing';
  else if (wasRevealed && rng.chance(0.5)) evKey = 'nothing';
  else {
    const weights = Object.fromEntries(Object.entries(EXPLORE_EVENTS).map(([k, e]) => [k, e.weight * (k === 'cache' || k === 'deposit' ? 1 + (mods['loot.rare'] || 0) * 5 : 1)]));
    evKey = rng.weighted(weights);
  }
  const head = `🧭 Exploration (${m.x}, ${m.y})${discoveries.length ? ` — découvert : ${discoveries.join(', ')}` : ''}.`;
  if (!evKey) {
    log(state, 'explore', head, t);
    addReport(state, { t, kind: 'explore', title: 'Exploration', x: m.x, y: m.y, text: head, win: true });
    return goBack(m, t);
  }
  const ev = EXPLORE_EVENTS[evKey];
  if (ev.choices) {
    m.phase = 'wait';
    state.pending.push({ id: uid('pd'), kind: 'explore', marchId: m.id, event: evKey, x: m.x, y: m.y, t, head });
    log(state, 'explore', `${head} ${ev.title} : une décision vous attend !`, t);
    toast(`🧭 ${ev.title} — une décision vous attend`, 'event');
    return;
  }
  const out = rng.weighted(ev.outcomes);
  const text = applyEffects(state, m, out.effects, t, mods);
  const msg = `${head} ${ev.title} : ${ev.text} ${out.text} ${text}`;
  log(state, 'explore', msg, t);
  addReport(state, { t, kind: 'explore', title: ev.title, x: m.x, y: m.y, text: `${ev.text} ${out.text} ${text}`, win: true });
  if (m.phase !== 'back' && m.phase !== 'done') goBack(m, t);
}

export function resolvePending(state, pid, choiceIdx, now = Date.now()) {
  const p = state.pending.find((x) => x.id === pid);
  if (!p || (p.kind && p.kind !== 'explore')) return { ok: false, reason: 'Introuvable' };
  const m = state.marches.find((x) => x.id === p.marchId);
  const ev = EXPLORE_EVENTS[p.event];
  const choice = ev.choices[choiceIdx];
  if (!choice) return { ok: false };
  if (choice.cost && !pay(state, choice.cost)) return { ok: false, reason: 'Ressources insuffisantes' };
  state.pending = state.pending.filter((x) => x.id !== pid);
  if (!m) return { ok: true, text: '' };
  const mods = marchMods(state, m.heroId, m.potion, now);
  const out = rng.weighted(choice.outcomes);
  const text = applyEffects(state, m, out.effects, now, mods);
  const msg = `${ev.title} — « ${choice.label} » : ${out.text} ${text}`;
  log(state, 'explore', `🧭 ${msg}`, now);
  addReport(state, { t: now, kind: 'explore', title: ev.title, x: m.x, y: m.y, text: msg, win: true });
  if (m.phase === 'wait') goBack(m, now);
  return { ok: true, text: `${out.text} ${text}` };
}

function applyEffects(state, m, fx, t, mods) {
  const parts = [];
  const world = state.world;
  const dangerScale = 1 + distCap(world, m.x, m.y) / 12;
  if (fx.res) {
    const loot = {};
    for (const [r, [a, b]] of Object.entries(fx.res)) loot[r] = Math.round(rng.int(Math.min(a, b), Math.max(a, b)) * (a > 0 ? dangerScale : 1));
    const pos = Object.fromEntries(Object.entries(loot).filter(([, v]) => v > 0));
    const neg = Object.fromEntries(Object.entries(loot).filter(([, v]) => v < 0));
    if (Object.keys(neg).length) { gain(state, neg, mods); parts.push(`Perdu : ${Object.entries(neg).map(([r, v]) => `${-v} ${RESOURCES[r].icon}`).join(' ')}`); }
    if (Object.keys(pos).length) { addInto(m.loot, pos); parts.push(`Butin : ${Object.entries(pos).map(([r, v]) => `${v} ${RESOURCES[r].icon}`).join(' ')}`); }
  }
  if (fx.lose) {
    let lost = 0;
    for (const t2 of Object.keys(m.units)) { const l = Math.floor(m.units[t2] * fx.lose); m.units[t2] -= l; lost += l; }
    if (lost) parts.push(`${lost} unité(s) perdue(s)`);
  }
  if (fx.units) {
    const got = {};
    for (const [u, [a, b]] of Object.entries(fx.units)) { const n = rng.int(a, b); if (n > 0) { m.units[u] = (m.units[u] || 0) + n; got[u] = n; } }
    parts.push(`Recrues : ${Object.entries(got).map(([u, n]) => `${n} ${UNITS[u].name}`).join(', ')}`);
  }
  if (fx.item) {
    const it = generateItem({ ilvl: Math.round(1 + distCap(world, m.x, m.y) / 4), boost: (mods['loot.rare'] || 0) * 3, min: fx.item.min });
    m.items.push(it);
    parts.push(`Objet : ${it.name}`);
  }
  if (fx.spawn) {
    let pos = poiAt(world, m.x, m.y) ? findFreeTile(world, m.x, m.y, null, 3) : { x: m.x, y: m.y };
    if (pos) {
      const p = spawnPoi(world, fx.spawn, pos.x, pos.y);
      reveal(world, pos.x, pos.y, 0.5);
      if (fx.scouted) p.scouted = true;
      parts.push(`Site découvert : ${POI_TYPES[fx.spawn].name} (${pos.x}, ${pos.y})`);
    }
  }
  if (fx.reveal) reveal(world, m.x, m.y, 1.5 + fx.reveal);
  if (fx.xp) { const h = heroOf(state, m); if (h) giveXp(state, h, fx.xp, mods); }
  if (fx.research) { if (boostResearch(state, fx.research)) parts.push('Recherche accélérée'); else addInto(m.loot, { gold: 200 }); }
  if (fx.buff) { state.buffs.push({ name: fx.buff.name, mods: fx.buff.mods, until: t + fx.buff.duration * 1000 }); parts.push(fx.buff.name || 'Bonus temporaire'); }
  if (fx.hero) {
    if (state.heroes.length < maxHeroes(state)) {
      const h = createHero({ rarity: rng.chance(0.3) ? 'epic' : 'rare' });
      state.heroes.push(h);
      parts.push(`${h.name} rejoint vos héros`);
    } else { addInto(m.loot, { gold: 400 }); parts.push('Pas de place pour un héros : il vous laisse 400 or'); }
  }
  if (fx.fight) {
    const enemies = {};
    for (const [u, n] of Object.entries(fx.fight)) enemies[u] = Math.round(n * dangerScale);
    const res = marchBattle(state, m, enemies, t, { danger: Math.round(dangerScale) });
    addReport(state, { t, kind: 'battle', title: `Escarmouche (${m.x}, ${m.y})`, x: m.x, y: m.y, win: res.winner === 'attacker', result: res, enemies, terrain: wTerrain(world, m.x, m.y), weather: state.weather.type });
    if (res.winner === 'attacker') { addInto(m.loot, { gold: rng.int(50, 200), food: rng.int(50, 200) }); parts.push('Victoire !'); }
    else parts.push('Défaite…');
  }
  if (!unitCount(m.units)) { parts.push('Aucun survivant.'); homecoming(state, m, t, true); }
  return parts.join('. ') + (parts.length ? '.' : '');
}

function homecoming(state, m, t, wiped = false) {
  for (const [u, n] of Object.entries(m.units)) state.army[u] = (state.army[u] || 0) + n;
  const mods = computeMods(state, t);
  const got = gain(state, m.loot, mods);
  for (const it of m.items) state.inventory.items.push(it);
  const hero = heroOf(state, m);
  if (hero) hero.marchId = null;
  if (wiped) {
    if (hero) { hero.marchId = null; log(state, 'bad', `${hero.name} rentre seul, blessé.`, t); }
  } else if (Object.keys(m.loot).length || m.items.length) {
    const g = (state.stats.gathered += Object.entries(got).reduce((s, [r, v]) => s + (v > 0 ? v : 0), 0));
    void g;
    const lost = Object.entries(m.loot).filter(([r, v]) => (got[r] || 0) < v).map(([r]) => RESOURCES[r].name);
    log(state, 'good', `🏠 Retour de marche : ${Object.entries(got).filter(([, v]) => v > 0).map(([r, v]) => `${fmt(v)} ${RESOURCES[r].icon}`).join(' ')}${m.items.length ? ` + ${m.items.length} objet(s)` : ''}${lost.length ? ` (entrepôt plein : ${lost.join(', ')} perdus en partie)` : ''}.`, t);
  }
  m.phase = 'done';
  state.marches = state.marches.filter((x) => x.id !== m.id);
  state.pending = state.pending.filter((p) => p.marchId !== m.id);
  void storageCap;
}
