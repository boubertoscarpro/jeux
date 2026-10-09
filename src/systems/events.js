import { WORLD_EVENTS, WEATHER_CYCLE, WEATHER_DURATION } from '../data/events.js';
import { WEATHER } from '../data/units.js';
import { BOSSES, POI_TYPES } from '../data/world.js';
import { SEASON } from '../data/social.js';
import { rng } from '../core/rng.js';
import { fmt } from '../core/util.js';
import { thLevel } from './city.js';
import { computeMods } from './modifiers.js';
import { gain } from './economy.js';
import { createUniqueItem, generateItem } from './items.js';
import { grantArtifact } from './collection.js';
import { rollShards } from './shards.js';
import { spawnPoi, findFreeTile, reveal, poiAt, key, distCap } from './world.js';
import { spawnMerchant } from './market.js';
import { log, toast } from './log.js';
import { calendar, chronicle } from './chronicle.js';

export function changeWeather(state, now) {
  const forced = state.events.find((e) => e.end > now && WORLD_EVENTS[e.key]?.weather);
  const type = forced ? WORLD_EVENTS[forced.key].weather : rng.weighted(calendar(state, now).season.weather || WEATHER_CYCLE);
  const dur = rng.int(WEATHER_DURATION[0], WEATHER_DURATION[1]) * 1000;
  const changed = state.weather.type !== type;
  state.weather = { type, until: now + dur };
  if (changed) log(state, 'info', `${WEATHER[type].icon} Météo : ${WEATHER[type].name}. ${WEATHER[type].note}`, now);
}

export function startWorldEvent(state, evKey, now) {
  const ev = WORLD_EVENTS[evKey];
  const world = state.world;
  const e = { key: evKey, start: now, end: now + ev.duration * 1000 };
  state.events.push(e);
  if (ev.weather) state.weather = { type: ev.weather, until: e.end };
  if (ev.spawn) {
    const { type, count, near, far } = ev.spawn;
    for (let i = 0; i < count; i++) {
      let pos;
      for (let k = 0; k < 30 && !pos; k++) {
        const ang = rng.float(0, Math.PI * 2);
        const d = far ? rng.float(world.size * 0.3, world.size * 0.45) : rng.float(3, near);
        const x = Math.round(world.capital.x + Math.cos(ang) * d), y = Math.round(world.capital.y + Math.sin(ang) * d);
        pos = findFreeTile(world, x, y, null, 2);
      }
      if (!pos) continue;
      const p = spawnPoi(world, type, pos.x, pos.y, far ? { danger: 4 } : {});
      p.expires = e.end + 30 * 60 * 1000;
      p.temp = true;
      p.event = evKey;
      reveal(world, pos.x, pos.y, 0.5);
    }
  }
  if (ev.infest) {
    const forests = Object.values(world.pois).filter((p) => (p.type === 'woodNode' || p.type === 'foodNode' || p.type === 'herbNode') && !p.infested && distCap(world, p.x, p.y) < 16);
    if (forests.length) {
      const p = rng.pick(forests);
      p.infested = e.end;
      p.danger = Math.min(5, p.danger + 2);
      p.max *= 2; p.amount = p.max;
      p.enemies = { spider: 6 + p.danger * 2, wolf: 4 + p.danger };
      reveal(world, p.x, p.y, 0.5);
      e.target = { x: p.x, y: p.y };
    }
  }
  if (ev.merchant) spawnMerchant(state, now, ev.duration);
  if (ev.boss) spawnBoss(state, ev.boss, now);
  if (ev.revealRegion) {
    const ang = rng.float(0, Math.PI * 2);
    const x = Math.round(world.capital.x + Math.cos(ang) * world.size * 0.38), y = Math.round(world.capital.y + Math.sin(ang) * world.size * 0.38);
    reveal(world, Math.max(3, Math.min(world.size - 4, x)), Math.max(3, Math.min(world.size - 4, y)), 4);
  }
  log(state, 'event', `${ev.icon} ${ev.name} : ${ev.text}`, now);
  toast(`${ev.icon} ${ev.name}`, 'event');
}

function endWorldEvent(state, e, now) {
  const ev = WORLD_EVENTS[e.key];
  if (ev.infest && e.target) {
    const p = poiAt(state.world, e.target.x, e.target.y);
    if (p && p.infested) { p.infested = 0; p.danger = Math.max(0, p.danger - 2); p.max = Math.round(p.max / 2); p.amount = Math.min(p.amount, p.max); }
  }
  log(state, 'info', `${ev.icon} Fin de l’événement : ${ev.name}.`, now);
}

// ---------- Boss mondiaux ----------
export function spawnBoss(state, bossKey, now) {
  if (state.boss && state.boss.hp > 0 && state.boss.until > now) return;
  bossKey = bossKey || rng.pick(Object.keys(BOSSES));
  const def = BOSSES[bossKey];
  const world = state.world;
  let pos = null;
  for (let k = 0; k < 30 && !pos; k++) {
    const ang = rng.float(0, Math.PI * 2), d = rng.float(6, 12);
    pos = findFreeTile(world, Math.round(world.capital.x + Math.cos(ang) * d), Math.round(world.capital.y + Math.sin(ang) * d), null, 2);
  }
  if (!pos) return;
  const hpScale = 0.4 + thLevel(state) * 0.12;
  const maxHp = Math.round(def.hp * hpScale);
  state.boss = { key: bossKey, x: pos.x, y: pos.y, hp: maxHp, maxHp, contrib: 0, start: now, until: now + 2 * 3600 * 1000 };
  world.pois[key(pos.x, pos.y)] = { id: 'boss', type: 'boss', x: pos.x, y: pos.y, danger: 0, scouted: true }; // danger 0 : l'aperçu correspond au combat réel
  reveal(world, pos.x, pos.y, 1);
  log(state, 'event', `🐉 ${def.name} est apparu en (${pos.x}, ${pos.y}) ! Toutes les guildes s’unissent pour l’abattre.`, now);
  toast(`🐉 Boss mondial : ${def.name}`, 'event');
}

function bossTick(state, dtSec, now) {
  const b = state.boss;
  if (!b) return;
  if (b.hp > 0 && b.until > now) {
    // Les seigneurs rivaux (IA) attaquent aussi le boss (~0,9% PV max / minute : chute en ~1 h 50)
    b.hp = Math.max(0, b.hp - b.maxHp * 0.009 * (dtSec / 60) * rng.float(0.6, 1.4));
  }
  if (b.hp <= 0 && !b.done) {
    b.done = true;
    const def = BOSSES[b.key];
    const share = b.contrib / b.maxHp;
    const mods = computeMods(state, now);
    if (b.contrib > 0) {
      const k = Math.min(2, 0.4 + share * 4);
      const reward = Object.fromEntries(Object.entries(def.reward).map(([r, v]) => [r, Math.round(v * k)]));
      gain(state, reward, mods);
      state.stats.bossKills++;
      (state.bossTrophies ||= {})[b.key] = now;
      chronicle(state, `${def.name} tombe sous les coups des seigneurs ; ${state.meta.kingdomName} y prend ${(share * 100).toFixed(1)}% de part.`, now);
      if (share >= 0.1 && rng.chance(0.25)) grantArtifact(state, 'emberHorn', now, def.name);
      if (share >= 0.03) rollShards(state, 'boss', now, { label: `combat contre ${def.name}` });
      if (share >= 0.15) rollShards(state, 'boss', now, { chance: 0.25, amount: [1, 1], label: 'meilleur contributeur' });
      state.season.points += SEASON.points.boss;
      let extra = '';
      if (share >= 0.08 || rng.chance(share * 5)) {
        state.inventory.items.push(createUniqueItem(def.unique));
        extra = ' Objet unique obtenu !';
      } else if (rng.chance(0.7)) {
        state.inventory.items.push(generateItem({ ilvl: 15, min: 'epic', boost: 1 }));
        extra = ' Un objet épique a été récupéré.';
      }
      if (share >= 0.15) state.meta.titles = [...new Set([...(state.meta.titles || []), `Fléau du ${def.name}`])];
      log(state, 'good', `🏆 ${def.name} est vaincu ! Votre contribution : ${(share * 100).toFixed(1)}%. Récompenses : ${Object.entries(reward).map(([r, v]) => `${fmt(v)} ${r}`).join(', ')}.${extra}`, now);
      toast(`🏆 ${def.name} vaincu !`, 'good');
    } else {
      log(state, 'info', `${def.name} a été vaincu par d’autres seigneurs.`, now);
    }
  }
  if (b.done || b.until <= now) {
    if (!b.done) log(state, 'info', `🐉 ${BOSSES[b.key].name} s’est enfui vers les Terres Brisées.`, now);
    delete state.world.pois[key(b.x, b.y)];
    state.boss = null;
    state.nextBoss = now + rng.int(150, 240) * 60 * 1000;
  }
}

// Tick du monde : appelé toutes les ~60 s de jeu (aussi pendant l'absence)
export function worldEventsTick(state, dtSec, now) {
  // Expiration des événements
  for (const e of state.events) if (e.end <= now && !e.ended) { e.ended = true; endWorldEvent(state, e, now); }
  state.events = state.events.filter((e) => !e.ended);
  state.buffs = state.buffs.filter((b) => b.until > now);
  if (state.merchant && state.merchant.until <= now) state.merchant = null;
  // Météo
  if (state.weather.until <= now) changeWeather(state, now);
  // Nouvel événement
  if (now >= state.nextWorldEvent) {
    const th = thLevel(state);
    const pool = Object.fromEntries(Object.entries(WORLD_EVENTS)
      .filter(([k, ev]) => (ev.minTH || 1) <= th && !state.events.some((e) => e.key === k) && !(ev.boss && state.boss))
      .map(([k, ev]) => [k, ev.weight]));
    if (Object.keys(pool).length && state.events.length < 3) startWorldEvent(state, rng.weighted(pool), now);
    state.nextWorldEvent = now + rng.int(12, 25) * 60 * 1000;
  }
  // Boss
  if (!state.boss && now >= state.nextBoss && thLevel(state) >= 3) spawnBoss(state, null, now);
  bossTick(state, dtSec, now);
}

export { POI_TYPES };
