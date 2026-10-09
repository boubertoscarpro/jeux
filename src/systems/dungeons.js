import { ROOM_TYPES, DUNGEON_THEMES, DUNGEON_AFFIXES } from '../data/dungeons.js';
import { ALL_UNITS } from '../data/units.js';
import { RESOURCES } from '../data/resources.js';
import { mulberry32, rng } from '../core/rng.js';
import { fmt, addInto } from '../core/util.js';
import { simulateBattle } from './combat.js';
import { generateItem } from './items.js';
import { grantArtifact } from './collection.js';
import { recordMax, bumpRep } from './reputation.js';
import { chronicle } from './chronicle.js';
import { wTerrain } from './world.js';
import { rollShards, addShards, shardState } from './shards.js';

// Génère (ou régénère) la structure d'un donjon : chaque niveau est différent
export function ensureDungeon(poi) {
  if (poi.dungeonData && !poi.dungeonData.done) return poi.dungeonData;
  const level = (poi.dungeonData?.level || poi.danger * 2) + (poi.dungeonData?.done ? 1 : 0);
  const seed = Math.floor(Math.random() * 1e9);
  const r = mulberry32(seed);
  const pick = (arr) => arr[Math.floor(r() * arr.length)];
  const theme = poi.type === 'lostCity' ? 'fortress' : pick(Object.keys(DUNGEON_THEMES));
  const affixKeys = Object.keys(DUNGEON_AFFIXES);
  const affixes = [];
  const nAff = 1 + (level >= 10 ? 1 : 0) + (r() < 0.3 ? 1 : 0);
  while (affixes.length < nAff) { const a = pick(affixKeys); if (!affixes.includes(a)) affixes.push(a); }
  const traps = affixes.includes('trapped') ? 2 : 1, shrines = affixes.includes('holy') ? 2 : 1;
  const nRooms = 4 + Math.floor(r() * 3) + Math.min(3, Math.floor(level / 5));
  const rooms = [];
  const weights = { battle: ROOM_TYPES.battle.weight, trap: ROOM_TYPES.trap.weight * traps, treasure: ROOM_TYPES.treasure.weight, shrine: ROOM_TYPES.shrine.weight * shrines };
  const total = Object.values(weights).reduce((a, b) => a + b, 0);
  for (let i = 0; i < nRooms - 1; i++) {
    let x = r() * total, type = 'battle';
    for (const [k, w] of Object.entries(weights)) { if ((x -= w) < 0) { type = k; break; } }
    if (i === Math.floor(nRooms / 2)) type = 'miniboss';
    rooms.push({ type, done: false });
  }
  rooms.push({ type: 'boss', done: false });
  poi.dungeonData = { seed, level, theme, affixes, rooms, cleared: 0, done: false, runs: (poi.dungeonData?.runs || 0) };
  return poi.dungeonData;
}

function roomEnemies(d, room) {
  const th = DUNGEON_THEMES[d.theme];
  const k = (1 + d.level * 0.22) * (d.affixes.includes('swarming') ? 1.35 : 1);
  const out = {};
  if (room.type === 'battle') { for (const u of th.enemies) out[u] = Math.max(1, Math.round((ALL_UNITS[u].hp > 100 ? 1 : 6) * k * rng.float(0.8, 1.2))); }
  if (room.type === 'miniboss') { out[th.mini] = Math.max(1, Math.round((ALL_UNITS[th.mini].hp > 100 ? 2 : 10) * k)); out[th.enemies[0]] = Math.round(5 * k); }
  if (room.type === 'boss') { out[th.boss] = Math.max(2, Math.round(3 * k)); for (const u of th.enemies) out[u] = (out[u] || 0) + Math.round(5 * k); }
  return out;
}

function ourMods(base, d) {
  const m = { ...base };
  for (const a of d.affixes) for (const [k, v] of Object.entries(DUNGEON_AFFIXES[a].our || {})) m[k] = (m[k] || 0) + v;
  return m;
}

/**
 * Parcourt le donjon salle par salle jusqu'au boss ou jusqu'au seuil de retraite.
 * m : marche (units, heroId, formation, loot, items, retreat) ; renvoie un rapport.
 */
export function runDungeon(state, m, poi, mods, now) {
  const d = ensureDungeon(poi);
  const th = DUNGEON_THEMES[d.theme];
  const start = Object.values(m.units).reduce((a, b) => a + b, 0) || 1;
  const lootMult = (1 + d.level * 0.15) * (d.affixes.includes('rich') ? 1.6 : 1);
  const lines = [];
  let killed = 0;
  let moraleBonus = 0;
  for (const room of d.rooms) {
    if (room.done) continue;
    const alive = Object.values(m.units).reduce((a, b) => a + b, 0);
    if (!alive) break;
    if (1 - alive / start >= (m.retreat ?? 0.5)) { lines.push(`🏳️ Pertes trop lourdes : retraite ordonnée (seuil ${Math.round((m.retreat ?? 0.5) * 100)}%).`); break; }
    const rt = ROOM_TYPES[room.type];
    if (room.type === 'trap') {
      const eng = (m.units.engineer || 0) + (m.units.scout || 0);
      if (rng.chance(Math.min(0.9, 0.3 + eng * 0.05))) lines.push(`${rt.icon} Piège désamorcé par vos éclaireurs/ingénieurs.`);
      else {
        let lost = 0;
        for (const u of Object.keys(m.units)) { const l = Math.floor(m.units[u] * 0.08); m.units[u] -= l; lost += l; }
        lines.push(`${rt.icon} Piège ! ${lost} unité(s) perdue(s).`);
      }
    } else if (room.type === 'treasure') {
      const loot = {};
      for (const [r, k] of Object.entries(th.loot)) { const v = Math.round(k * 300 * lootMult * rng.float(0.7, 1.3)); if (v > 0) loot[r] = v; }
      loot.gold = (loot.gold || 0) + Math.round(200 * lootMult);
      addInto(m.loot, loot);
      lines.push(`${rt.icon} Trésor : ${Object.entries(loot).map(([r, v]) => `${fmt(v)} ${RESOURCES[r].icon}`).join(' ')}.`);
    } else if (room.type === 'shrine') {
      moraleBonus += 15;
      lines.push(`${rt.icon} Un autel ancien ravive le courage de vos troupes (+15 moral).`);
    } else {
      const enemies = roomEnemies(d, room);
      const enemyMods = { 'combat.atk': 0.04 * d.level, 'combat.def': 0.04 * d.level };
      for (const a of d.affixes) for (const [k, v] of Object.entries(DUNGEON_AFFIXES[a].enemy || {})) enemyMods[k] = (enemyMods[k] || 0) + v;
      const res = simulateBattle(
        { units: m.units, mods: ourMods({ ...mods, 'combat.morale': (mods['combat.morale'] || 0) + moraleBonus }, d), formation: m.formation, supply: m.supply, label: 'Vous' },
        { units: enemies, mods: enemyMods, label: rt.name },
        { terrain: 'ruins', weather: 'clear' },
      );
      m.units = Object.fromEntries(Object.entries(res.attRemaining).filter(([, n]) => n > 0));
      killed += Object.values(res.defLosses).reduce((a, b) => a + b, 0);
      if (res.winner !== 'attacker') { lines.push(`${rt.icon} ${rt.name} : défaite, vos troupes se replient.`); break; }
      lines.push(`${rt.icon} ${rt.name} : victoire (${Object.entries(res.attLosses).filter(([, n]) => n).map(([u, n]) => `−${n} ${ALL_UNITS[u].name}`).join(', ') || 'sans pertes'}).`);
      if (room.type === 'miniboss') { addInto(m.loot, { gold: Math.round(500 * lootMult), crystals: rng.int(1, 3) }); if (rng.chance(0.5)) m.items.push(generateItem({ ilvl: 4 + d.level, boost: 0.8, min: 'rare' })); }
      if (room.type === 'boss') {
        state.stats.maxDungeonLevel = Math.max(state.stats.maxDungeonLevel || 0, d.level);
        if (d.level >= 6) { const n = rollShards(state, 'dungeon', now, { chance: Math.min(0.3, (d.level - 5) * 0.03), amount: [1, 1 + Math.floor(d.level / 10)] }); if (n) lines.push(`💠 ${n} Éclat(s) Ancien(s) dans le trésor du boss !`); }
        // Le trésor du trône (5 Éclats) n'existe qu'une fois : les purges suivantes ne le renouvellent pas
        if (poi.type === 'lostCity' && !poi.throneLooted) { poi.throneLooted = true; addShards(state, 5, 'event', now, 'Ruines de l’ancien roi'); lines.push('💠 5 Éclats Anciens reposaient sur le trône de l’ancien roi.'); }
        addInto(m.loot, { gold: Math.round(2000 * lootMult), rareOre: rng.int(2, 4 + Math.floor(d.level / 3)), crystals: rng.int(2, 6) });
        m.items.push(generateItem({ ilvl: 8 + d.level, boost: 1.2 + d.level * 0.05, min: d.level >= 10 ? 'epic' : 'rare' }));
        // Artefacts de donjon : liste fermée (pas d'exclusivités de la Roue ni d'artefacts d'autres sources)
        const firstChalice = poi.type === 'lostCity' && !state.artifacts?.dawnChalice;
        const artChance = firstChalice ? 1 : Math.min(0.25, 0.04 + d.level * 0.012);
        if (rng.chance(artChance)) {
          const pool = poi.type === 'lostCity' ? ['whisperMask', 'kingsLedger', 'firstKingSword'] : ['firstKingSword', 'mountainHeart', 'kingsLedger'];
          const a = grantArtifact(state, firstChalice ? 'dawnChalice' : null, now, 'Donjon', pool);
          if (a) lines.push(`🏆 Artefact découvert : ${a} !`);
          else { shardState(state).relicFragments++; lines.push('🧩 Un fragment de relique (vous possédez déjà les artefacts de ce lieu).'); }
        }
      }
    }
    room.done = true;
    d.cleared++;
  }
  const allDone = d.rooms.every((r) => r.done);
  if (allDone) {
    d.done = true;
    d.runs++;
    state.stats.dungeons = (state.stats.dungeons || 0) + 1;
    bumpRep(state, 'warrior', 8); bumpRep(state, 'explorer', 5);
    lines.push(`✅ Donjon niveau ${d.level} purgé ! Il se reformera, plus profond et plus dangereux.`);
    if (d.level >= 10) chronicle(state, `Les armées du royaume purgent un donjon de niveau ${d.level}.`, now);
  }
  recordMax(state, 'biggestVictory', killed, `${fmt(killed)} ennemis dans un donjon`, now);
  return { lines, cleared: d.cleared, total: d.rooms.length, done: allDone, level: d.level };
}

export const dungeonTerrain = (state, poi) => wTerrain(state.world, poi.x, poi.y);
