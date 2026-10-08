import { CATASTROPHES, SEASONS } from '../data/seasons.js';
import { POI_TYPES } from '../data/world.js';
import { RESOURCES, TRADABLE } from '../data/resources.js';
import { BUILDINGS } from '../data/buildings.js';
import { rng } from '../core/rng.js';
import { fmt } from '../core/util.js';
import { allBuildings, neighbors, thLevel } from './city.js';
import { calendar, chronicle } from './chronicle.js';
import { key, poiAt, setTerrain, spawnPoi, findFreeTile, reveal, distCap, wTerrain } from './world.js';
import { gain } from './economy.js';
import { computeMods } from './modifiers.js';
import { log, toast } from './log.js';

// Modificateurs de la saison et de la catastrophe en cours
export function livingMods(state, now) {
  const m = {};
  const add = (o) => { for (const [k, v] of Object.entries(o || {})) m[k] = (m[k] || 0) + v; };
  add(calendar(state, now).season.mods);
  const c = state.catastrophe;
  if (c && c.until > now) add(CATASTROPHES[c.key].mods);
  if (state.fertileUntil > now) add({ 'prod.food': 0.2, 'prod.grain': 0.2 });
  return m;
}

// Multiplicateurs de prix liés à la saison, aux pénuries et aux rumeurs devenues réalité
export function livingMarket(state, r, now) {
  let k = 1;
  const s = calendar(state, now).season.key;
  if (s === 'winter') k *= { food: 1.25, coal: 1.3, leather: 1.2, cloth: 1.2, rations: 1.2 }[r] || 1;
  if (s === 'autumn') k *= { grain: 0.75, food: 0.9 }[r] || 1;
  if (s === 'spring') k *= { herbs: 0.85 }[r] || 1;
  if (state.scarcity && state.scarcity.until > now && state.scarcity.res === r) k *= 1.8;
  return k;
}

// Tick du monde vivant (chaque minute de jeu)
export function livingTick(state, dtSec, now) {
  const cal = calendar(state, now);
  // Changement de saison
  const sk = `${cal.year}-${cal.seasonIdx}`;
  if (state.seasonKey !== sk) {
    if (state.seasonKey) {
      log(state, 'event', `${cal.season.icon} ${cal.season.name} de l’an ${cal.year} : ${cal.season.desc}`, now);
      if (cal.seasonIdx === 0) chronicle(state, `Début de l’an ${cal.year} du royaume.`, now);
    }
    state.seasonKey = sk;
  }
  const hFrac = dtSec / 3600;
  // Catastrophes rares
  if (!(state.catastrophe?.until > now) && thLevel(state) >= 2) {
    for (const [k, c] of Object.entries(CATASTROPHES)) {
      if (!c.seasons.includes(cal.season.key)) continue;
      if (rng.chance(c.chance * hFrac)) { startCatastrophe(state, k, now); break; }
    }
  }
  // Incendies pendant la sécheresse / risque de base très faible
  const c = state.catastrophe?.until > now ? CATASTROPHES[state.catastrophe.key] : null;
  const fireRisk = (c?.fireRisk || 0) + (thLevel(state) >= 3 ? 0.012 : 0);
  if (rng.chance(fireRisk * hFrac)) cityFire(state, now);
  if (c?.fireRisk && rng.chance(0.4 * hFrac)) forestFire(state, now);
  // Repousse des forêts brûlées
  for (const g of [...(state.world.regrow || [])]) {
    if (g.at <= now) {
      setTerrain(state.world, g.x, g.y, 'forest');
      if (!poiAt(state.world, g.x, g.y)) spawnPoi(state.world, 'woodNode', g.x, g.y);
      state.world.regrow = state.world.regrow.filter((x) => x !== g);
      if (state.world.revealed[g.y * state.world.size + g.x]) log(state, 'info', `🌱 La forêt repousse en (${g.x}, ${g.y}).`, now);
    }
  }
  // Dynamiques rares du terrain
  if (rng.chance(0.08 * hFrac)) mineCollapse(state, now);
  if (rng.chance(0.05 * hFrac)) villageVanishes(state, now);
  if (rng.chance(0.08 * hFrac)) monsterMigration(state, now);
  if (!(state.scarcity?.until > now) && rng.chance(0.06 * hFrac)) scarcity(state, now);
  // Rumeurs : préviennent d'un futur événement (avantage aux marchands attentifs)
  rumorTick(state, now, hFrac);
  // Tribut des cités vassales
  const vassals = Object.values(state.world.pois).filter((p) => p.type === 'town' && p.vassal);
  if (vassals.length) gain(state, { gold: vassals.length * (40 + thLevel(state) * 15) * hFrac }, computeMods(state, now));
}

export function startCatastrophe(state, k, now) {
  const c = CATASTROPHES[k];
  state.catastrophe = { key: k, until: now + c.duration * 1000, start: now };
  if (c.weather) state.weather = { type: c.weather, until: now + c.duration * 1000 };
  chronicle(state, `${c.icon} ${c.name} : ${c.text}`, now);
  toast(`${c.icon} ${c.name} !`, 'bad');
  if (c.flood) {
    let n = 0;
    for (const b of allBuildings(state)) {
      if (b.level <= 0 || b.type === 'road' || b.type === 'deco') continue;
      if (neighbors(state, b.x, b.y).some((x) => x.terrain === 'river') && rng.chance(0.4)) { b.damaged = true; n++; }
    }
    state.fertileUntil = now + c.duration * 1000 + 3 * 3600000;
    if (n) log(state, 'bad', `🌊 L’inondation endommage ${n} bâtiment(s) au bord de la rivière. Les terres seront plus fertiles ensuite (+20% nourriture).`, now);
  }
  if (c.crystals) {
    const w = state.world;
    for (let i = 0; i < 3; i++) {
      const pos = findFreeTile(w, w.size - 4 - rng.int(0, 3), rng.int(5, w.size - 5), null, 4);
      if (pos) { const p = spawnPoi(w, 'crystalNode', pos.x, pos.y); p.expires = now + 12 * 3600000; p.temp = true; setTerrain(w, pos.x, pos.y, 'ash'); }
    }
  }
}

function cityFire(state, now) {
  const cands = allBuildings(state).filter((b) => b.level > 0 && !b.damaged && !['townhall', 'road', 'deco', 'castle'].includes(b.type));
  if (!cands.length) return;
  const b = rng.pick(cands);
  b.damaged = true;
  state.stats.fires = (state.stats.fires || 0) + 1;
  log(state, 'bad', `🔥 Un incendie a ravagé : ${BUILDINGS[b.type].name} (niv. ${b.level}). Production réduite de moitié jusqu’à réparation.`, now);
  toast(`🔥 Incendie : ${BUILDINGS[b.type].name}`, 'bad');
}

function forestFire(state, now) {
  const w = state.world;
  const nodes = Object.values(w.pois).filter((p) => p.type === 'woodNode' && distCap(w, p.x, p.y) > 3);
  if (!nodes.length) return;
  const p = rng.pick(nodes);
  delete w.pois[key(p.x, p.y)];
  setTerrain(w, p.x, p.y, 'ash');
  (w.regrow ||= []).push({ x: p.x, y: p.y, at: now + 18 * 3600000 });
  if (w.revealed[p.y * w.size + p.x]) chronicle(state, `Un incendie de forêt réduit en cendres les bois en (${p.x}, ${p.y}).`, now);
}

function mineCollapse(state, now) {
  const w = state.world;
  const mines = Object.values(w.pois).filter((p) => ['ironNode', 'coalNode', 'silverNode'].includes(p.type) && p.amount < p.max * 0.4 && !state.expeditions.some((t) => t.at && t.at.x === p.x && t.at.y === p.y && t.status !== 'idle'));
  if (!mines.length) return;
  const p = rng.pick(mines);
  delete w.pois[key(p.x, p.y)];
  // Un nouveau filon apparaît ailleurs : le monde se renouvelle
  const pos = findFreeTile(w, p.x + rng.int(-6, 6), p.y + rng.int(-6, 6), POI_TYPES[p.type].terrain, 3);
  if (pos) spawnPoi(w, p.type, pos.x, pos.y);
  if (w.revealed[p.y * w.size + p.x]) log(state, 'event', `🪨 ${POI_TYPES[p.type].name} en (${p.x}, ${p.y}) s’est effondré(e)${pos ? ` ; des prospecteurs signalent un nouveau filon vers (${pos.x}, ${pos.y})` : ''}.`, now);
}

function villageVanishes(state, now) {
  const w = state.world;
  const vs = Object.values(w.pois).filter((p) => p.type === 'village' && !p.visited);
  if (vs.length < 3) { const pos = findFreeTile(w, rng.int(5, w.size - 5), rng.int(5, w.size - 5), ['plain', 'forest', 'hills'], 3); if (pos) spawnPoi(w, 'village', pos.x, pos.y); return; }
  const v = rng.pick(vs);
  delete w.pois[key(v.x, v.y)];
  if (w.revealed[v.y * w.size + v.x]) log(state, 'event', `🏚️ Le village abandonné en (${v.x}, ${v.y}) a disparu, englouti par la lande.`, now);
}

function monsterMigration(state, now) {
  const w = state.world;
  const lairs = Object.values(w.pois).filter((p) => p.type === 'monsterLair' && !(p.clearedUntil > now));
  if (!lairs.length) return;
  const l = rng.pick(lairs);
  const pos = findFreeTile(w, l.x + rng.int(-5, 5), l.y + rng.int(-5, 5), ['forest', 'swamp', 'hills'], 2);
  if (!pos) return;
  delete w.pois[key(l.x, l.y)];
  const n = spawnPoi(w, 'monsterLair', pos.x, pos.y, { danger: l.danger });
  n.enemies = l.enemies;
  if (w.revealed[pos.y * w.size + pos.x] || w.revealed[l.y * w.size + l.x]) log(state, 'event', `🐺 Une meute migre de (${l.x}, ${l.y}) vers (${pos.x}, ${pos.y}).`, now);
}

function scarcity(state, now) {
  const res = rng.pick(['iron', 'wood', 'stone', 'leather', 'cloth', 'coal', 'herbs', 'steel']);
  state.scarcity = { res, until: now + 2 * 3600000 };
  log(state, 'event', `📉 Pénurie de ${RESOURCES[res].name} dans les Terres Brisées : les prix s’envolent (×1,8 pendant 2 h).`, now);
}

// Rumeurs : un événement de marché annoncé à l'avance
const RUMORS = [
  { res: 'iron', text: 'On murmure qu’une grande guerre se prépare : le fer va manquer.' },
  { res: 'food', text: 'Les anciens annoncent une mauvaise récolte chez les voisins : la nourriture va renchérir.' },
  { res: 'cloth', text: 'Une caravane de soieries a été pillée : le tissu va se faire rare.' },
  { res: 'steel', text: 'Les forges de Valdor tournent au ralenti : l’acier va monter.' },
  { res: 'leather', text: 'Une épizootie frappe les troupeaux du sud : le cuir va flamber.' },
];
function rumorTick(state, now, hFrac) {
  const r = state.rumor;
  if (r && r.at <= now && !r.done) {
    r.done = true;
    state.scarcity = { res: r.res, until: now + 2 * 3600000 };
    log(state, 'event', `📈 La rumeur se confirme : ${RESOURCES[r.res].name} ×1,8 pendant 2 h !`, now);
  }
  if ((!r || r.done) && rng.chance(0.15 * hFrac)) {
    const pick = rng.pick(RUMORS);
    state.rumor = { ...pick, at: now + rng.int(40, 90) * 60000, heard: now };
  }
}

export const currentSeason = (state, now = Date.now()) => calendar(state, now).season;
void SEASONS; void TRADABLE; void reveal; void wTerrain; void fmt;
