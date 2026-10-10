import { mulberry32, hashString } from './rng.js';
import { RESOURCES } from '../data/resources.js';
import { generateWorld } from '../systems/worldgen.js';
import { createHero } from '../systems/heroes.js';
import { initMarket } from '../systems/market.js';
import { initFactions } from '../systems/factions.js';
import { applyKingdomChoice } from '../systems/kingdom.js';
import { ensureIdentity } from '../systems/identity.js';

export const SAVE_VERSION = 9;
// Royaume de départ 24×16 (384 cases, contre 14×10 auparavant) ; chaque agrandissement ajoute 4 colonnes et 2 rangées.
export const CITY_W = 24;
export const CITY_H = 16;
// Centre du hameau (hôtel de ville)
export const TOWN_X = 11;
export const TOWN_Y = 7;
export const RUBBLE_COUNT = 14; // inchangé : un royaume plus grand ne donne pas plus de butin de déblaiement

// Génère le terrain de la ville : rivière, forêts, montagnes, décombres
export function generateCity(seed, W = CITY_W, H = CITY_H) {
  const r = mulberry32(seed ^ 0xc17e);
  const tiles = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) tiles.push('plain');
  const set = (x, y, t) => { if (x >= 0 && y >= 0 && x < W && y < H) tiles[y * W + x] = t; };
  const get = (x, y) => tiles[y * W + x];
  const nearTown = (x, y, d) => Math.abs(x - TOWN_X) <= d && Math.abs(y - TOWN_Y) <= d;
  // Rivière sinueuse (colonnes 3 à 5)
  let rx = 4;
  for (let y = 0; y < H; y++) {
    set(rx, y, 'river');
    const d = r() < 0.33 ? -1 : r() < 0.5 ? 1 : 0;
    const nx = Math.max(3, Math.min(5, rx + d));
    if (nx !== rx) set(nx, y, 'river');
    rx = nx;
  }
  // Chaîne de montagnes au nord-est, et un éperon rocheux au sud-est
  for (let y = 0; y < 4; y++) for (let x = W - 7; x < W; x++) if (r() < 0.85 - y * 0.2 + (x - (W - 7)) * 0.05) set(x, y, 'mountain');
  const sx = W - 4, sy = H - 6;
  for (let y = sy - 2; y <= sy + 2; y++) for (let x = sx - 2; x <= sx + 2; x++) if (Math.hypot(x - sx, y - sy) < 1.6 + r() * 0.8) set(x, y, 'mountain');
  // Forêts : lisière ouest, bordure sud, bosquets
  for (let y = 0; y < H; y++) for (let x = 0; x < 3; x++) if (get(x, y) === 'plain' && r() < (x < 2 ? 0.75 : 0.25)) set(x, y, 'forest');
  for (let x = 6; x < W; x++) { if (r() < 0.6) set(x, H - 1, 'forest'); if (r() < 0.25 && get(x, H - 2) === 'plain') set(x, H - 2, 'forest'); }
  for (let g = 0; g < 4; g++) {
    let gx, gy, k = 0;
    do { gx = 7 + Math.floor(r() * (W - 9)); gy = 1 + Math.floor(r() * (H - 3)); k++; } while (k < 20 && (nearTown(gx, gy, 3) || get(gx, gy) !== 'plain'));
    for (let y = gy - 1; y <= gy + 1; y++) for (let x = gx - 1; x <= gx + 1; x++) if (x >= 0 && y >= 0 && x < W && y < H && get(x, y) === 'plain' && !nearTown(x, y, 2) && r() < 0.6) set(x, y, 'forest');
  }
  // Décombres (même nombre qu'avant), autour du hameau
  let placed = 0, tries = 0;
  while (placed < RUBBLE_COUNT && tries++ < 5000) {
    const x = 6 + Math.floor(r() * Math.min(W - 7, 14));
    const y = 1 + Math.floor(r() * (H - 3));
    if (get(x, y) === 'plain' && !nearTown(x, y, 1)) { set(x, y, 'rubble'); placed++; }
  }
  return tiles;
}

// Agrandit la grille vers l'est et le sud sans rien déplacer : les cases existantes gardent leurs coordonnées.
// Les nouvelles cases viennent de terrain généré ; aucun décombre n'est ajouté si rubbleP = 0.
export function extendCity(state, nw, nh, rand, rubbleP = 0) {
  const { w, h, terrain } = state.city;
  if (nw <= w && nh <= h) return false;
  nw = Math.max(nw, w); nh = Math.max(nh, h);
  const gen = generateCity(state.meta.seed, nw, nh);
  const t = new Array(nw * nh);
  for (let y = 0; y < nh; y++) for (let x = 0; x < nw; x++) {
    if (x < w && y < h) { t[y * nw + x] = terrain[y * w + x]; continue; }
    let ter = gen[y * nw + x];
    if (ter === 'rubble' || ter === 'river') ter = 'plain';
    // La rivière existante continue vers le sud
    if (y >= h && x < w && terrain[(h - 1) * w + x] === 'river') ter = 'river';
    if (ter === 'plain' && rubbleP && rand() < rubbleP) ter = 'rubble';
    t[y * nw + x] = ter;
  }
  Object.assign(state.city, { w: nw, h: nh, terrain: t });
  return true;
}

export function createNewState({ seed = Math.floor(Math.random() * 1e9), kingdomName = 'Cendrelande', lordName = 'Seigneur', now = Date.now(), kingdomType = null, origin = 'none', difficulty = 'classic' } = {}) {
  if (typeof seed === 'string') seed = hashString(seed);
  const resources = Object.fromEntries(Object.keys(RESOURCES).map((r) => [r, 0]));
  Object.assign(resources, { wood: 600, stone: 450, iron: 150, food: 500, gold: 250, grain: 50, herbs: 10 });

  const terrain = generateCity(seed);
  const state = {
    version: SAVE_VERSION,
    // Identité stable (joueur, royaume, château principal) : voir systems/identity.js et docs/MULTIPLAYER.md
    identity: null,
    meta: { seed, kingdomName, lordName, created: now, lastTick: now, banner: '#c9a227', title: null, theme: null, insignia: 3, owned: {} },
    resources,
    city: { w: CITY_W, h: CITY_H, terrain, buildings: {} , fort: { wall: 0, moat: 0 } },
    queues: { build: [], train: [], research: [], craft: [], planned: [] },
    army: {},
    heroes: [],
    inventory: { items: [], consumables: {} },
    techs: {},
    world: null,
    marches: [],
    pending: [],        // décisions d'exploration en attente
    reports: [],        // rapports de combat
    log: [],
    market: null,
    caravans: [],
    events: [],         // événements mondiaux actifs
    weather: { type: 'clear', until: now + 10 * 60 * 1000 },
    nextWorldEvent: now + 4 * 60 * 1000,
    boss: null,
    nextBoss: now + 45 * 60 * 1000,
    raids: [],
    territories: {},
    buffs: [],
    guild: null,
    quests: { done: {}, milestones: {} },
    season: { start: now, points: 0, claimed: {} },
    stats: { built: 0, cleared: 0, explored: 0, gathered: 0, gatherDone: 0, battlesWon: 0, battlesLost: 0, trades: 0, crafted: 0, hardClears: 0, bossKills: 0, produced: {}, raidsRepelled: 0 },
    merchant: null,
    nextRivalTick: now + 60 * 1000,
    // --- Phase 2 ---
    workers: [],
    expeditions: [],
    automation: { level: 0, autoRepair: true },
    priorities: { enabled: false, order: ['food', 'wood', 'stone', 'iron', 'industry', 'gold'], thresholds: { food: { min: 2000, max: 0 }, wood: { min: 1000, max: 0 }, stone: { min: 800, max: 0 }, iron: { min: 500, max: 0 }, industry: {}, gold: {} } },
    orders: [],
    orderLog: [],
    autoResearch: { enabled: false, focus: 'iron' },
    factions: null,
    reputation: {},
    records: {},
    history: [],
    artifacts: {},
    bossTrophies: {},
    talents: { ranks: {}, builds: [], switchAt: 0 },
    dynasty: null,
    contracts: [],
    routes: {},
    catastrophe: null,
    rumor: null,
    scarcity: null,
    nextDilemma: now + 40 * 60 * 1000,
    domain: 0,
    // --- Événements & Éclats Anciens ---
    live: { calendar: [], history: [], occ: {}, current: null, marches: [], reports: [], surprises: [], nextSurprise: 0, nextFair: now + 5 * 86400000, unseenReport: null, totals: {} },
    shards: { count: 0, tickets: 0, relicFragments: 0, mythicFragments: 0, legendaryFragments: 0, heat: {}, daily: {}, lastFreeTicket: 0, pity: { rare: 0, epic: 0, legendary: 0, mythic: 0 }, history: [], ledger: {}, feats: {}, forbiddenAt: 0, owned: {}, spins: 0, jackpots: 0 },
    notifications: [],
    sagas: { active: null, done: {}, nextAt: now + 90 * 60000, log: [] },
    serverFeed: [],
    admin: {},
    // --- Spécialisation & parcours guidé ---
    kingdom: { type: null, origin: 'none', difficulty: 'classic', chosenAt: now },
    campaign: { chapter: 1, done: {}, claimed: {}, chapterClaimed: {}, unlockedAt: { 1: now }, flags: {}, snoozed: {}, dismissed: {}, daily: null },
    // --- Quêtes du royaume (chaînes en plusieurs étapes) et missions dynamiques ---
    questlines: { active: {}, done: {}, claimed: {} },
    missions: { active: [], recent: [], nextAt: now + 10 * 60000, rerollAt: 0, done: 0 },
  };
  ensureIdentity(state);

  // Bâtiments de départ (hameau presque abandonné)
  const place = (type, x, y, level = 1) => {
    const id = `b_${type}_${x}_${y}`;
    state.city.buildings[id] = { id, type, level, x, y };
    state.city.terrain[y * CITY_W + x] = 'plain';
  };
  place('townhall', TOWN_X, TOWN_Y, 1);
  place('house', TOWN_X + 1, TOWN_Y + 1, 1);
  place('warehouse', TOWN_X - 1, TOWN_Y + 1, 1);

  state.world = generateWorld(seed);
  initFactions(state);
  state.market = initMarket(now);

  // Héros de départ
  const r = mulberry32(seed ^ 0xbeef);
  state.heroes.push(createHero({ cls: 'general', rarity: 'rare', rand: r, name: 'Aldric le Hardi' }));
  state.army = { spearman: 10, archer: 6, scout: 2 };

  applyKingdomChoice(state, { type: kingdomType, origin, difficulty }, now);

  state.log.push({ t: now, type: 'story', text: `Vous prenez possession du hameau de ${kingdomName}. Les décombres de la Fracture encombrent encore les rues…` });
  return state;
}
