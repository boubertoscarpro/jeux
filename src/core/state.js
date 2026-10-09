import { mulberry32, hashString } from './rng.js';
import { RESOURCES } from '../data/resources.js';
import { generateWorld } from '../systems/worldgen.js';
import { createHero } from '../systems/heroes.js';
import { initMarket } from '../systems/market.js';
import { initFactions } from '../systems/factions.js';

export const SAVE_VERSION = 6;
export const CITY_W = 14;
export const CITY_H = 10;

// Génère le terrain de la ville : rivière, forêts, montagnes, décombres
export function generateCity(seed) {
  const r = mulberry32(seed ^ 0xc17e);
  const tiles = [];
  for (let y = 0; y < CITY_H; y++) for (let x = 0; x < CITY_W; x++) tiles.push('plain');
  const set = (x, y, t) => { if (x >= 0 && y >= 0 && x < CITY_W && y < CITY_H) tiles[y * CITY_W + x] = t; };
  // Rivière sinueuse (colonne 3 ± 1)
  let rx = 3;
  for (let y = 0; y < CITY_H; y++) {
    set(rx, y, 'river');
    const d = r() < 0.33 ? -1 : r() < 0.5 ? 1 : 0;
    const nx = Math.max(2, Math.min(4, rx + d));
    if (nx !== rx) set(nx, y, 'river');
    rx = nx;
  }
  // Montagnes en haut à droite
  for (let y = 0; y < 3; y++) for (let x = CITY_W - 4; x < CITY_W; x++) if (r() < 0.8 - y * 0.2 + (x - (CITY_W - 4)) * 0.1) set(x, y, 'mountain');
  // Forêts : bord gauche et bas
  for (let y = 0; y < CITY_H; y++) for (let x = 0; x < 2; x++) if (r() < 0.75 && tiles[y * CITY_W + x] === 'plain') set(x, y, 'forest');
  for (let x = 5; x < CITY_W; x++) if (r() < 0.6) set(x, CITY_H - 1, 'forest');
  for (let i = 0; i < 3; i++) set(9 + Math.floor(r() * 4), CITY_H - 2, 'forest');
  // Décombres
  let placed = 0;
  while (placed < 14) {
    const x = 5 + Math.floor(r() * (CITY_W - 6));
    const y = 1 + Math.floor(r() * (CITY_H - 3));
    if (tiles[y * CITY_W + x] === 'plain' && !(Math.abs(x - 7) <= 1 && Math.abs(y - 4) <= 1)) { set(x, y, 'rubble'); placed++; }
  }
  return tiles;
}

export function createNewState({ seed = Math.floor(Math.random() * 1e9), kingdomName = 'Cendrelande', lordName = 'Seigneur', now = Date.now() } = {}) {
  if (typeof seed === 'string') seed = hashString(seed);
  const resources = Object.fromEntries(Object.keys(RESOURCES).map((r) => [r, 0]));
  Object.assign(resources, { wood: 600, stone: 450, iron: 150, food: 500, gold: 250, grain: 50, herbs: 10 });

  const terrain = generateCity(seed);
  const state = {
    version: SAVE_VERSION,
    meta: { seed, kingdomName, lordName, created: now, lastTick: now, banner: '#c9a227', title: null, theme: null, insignia: 3, owned: {} },
    resources,
    city: { w: CITY_W, h: CITY_H, terrain, buildings: {} , fort: { wall: 0, moat: 0 } },
    queues: { build: [], train: [], research: [], craft: [] },
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
  };

  // Bâtiments de départ (hameau presque abandonné)
  const place = (type, x, y, level = 1) => {
    const id = `b_${type}_${x}_${y}`;
    state.city.buildings[id] = { id, type, level, x, y };
    state.city.terrain[y * CITY_W + x] = 'plain';
  };
  place('townhall', 7, 4, 1);
  place('house', 8, 5, 1);
  place('warehouse', 6, 5, 1);

  state.world = generateWorld(seed);
  initFactions(state);
  state.market = initMarket(now);

  // Héros de départ
  const r = mulberry32(seed ^ 0xbeef);
  state.heroes.push(createHero({ cls: 'general', rarity: 'rare', rand: r, name: 'Aldric le Hardi' }));
  state.army = { spearman: 10, archer: 6, scout: 2 };

  state.log.push({ t: now, type: 'story', text: `Vous prenez possession du hameau de ${kingdomName}. Les décombres de la Fracture encombrent encore les rues…` });
  return state;
}
