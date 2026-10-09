// Sauvegarde, migration, progression hors ligne : cas limites et données invalides.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createNewState, SAVE_VERSION } from '../src/core/state.js';
import { advance } from '../src/core/engine.js';
import { serialize, deserialize, saveGame, loadGame, importSave, exportSave, deleteSave, SAVE_KEY, BACKUP_KEY, CORRUPT_KEY } from '../src/core/save.js';
import { generateItem } from '../src/systems/items.js';
import { INVENTORY_CAP } from '../src/systems/crafting.js';
import { seasonInfo, claimSeasonTier } from '../src/systems/quests.js';

const T0 = Date.UTC(2026, 3, 1);
const H = 3600000;

// localStorage simulé, avec un quota optionnel
function fakeStorage(quota = Infinity) {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => {
      const size = [...m].reduce((a, [kk, vv]) => a + (kk === k ? 0 : vv.length), 0) + v.length;
      if (size > quota) { const e = new Error('quota exceeded'); e.name = 'QuotaExceededError'; throw e; }
      m.set(k, String(v));
    },
    removeItem: (k) => m.delete(k),
    _m: m,
  };
}
beforeEach(() => { globalThis.localStorage = fakeStorage(); });

test('Import mal formé (tableaux remplacés par des objets) : réparé, la partie tourne', () => {
  const s = createNewState({ seed: 'bad', now: T0 });
  const bad = JSON.parse(serialize(s));
  bad.pending = {}; bad.caravans = {}; bad.expeditions = {}; bad.workers = {}; bad.live.marches = {}; bad.queues.build = {};
  const st = deserialize(JSON.stringify(bad));
  for (const k of ['pending', 'caravans', 'expeditions', 'workers']) assert.ok(Array.isArray(st[k]), k);
  assert.ok(Array.isArray(st.live.marches) && Array.isArray(st.queues.build));
  assert.ok(st.meta.repaired?.length);
  assert.doesNotThrow(() => advance(st, T0 + 2 * H));
});

test('Échéance invalide (caravane sans date) : retirée au chargement, le temps n’est jamais figé', () => {
  const s = createNewState({ seed: 'nan', now: T0 });
  s.caravans.push({ id: 'c1' });
  s.raids.push({ id: 'r1', arrive: undefined });
  const st = deserialize(serialize(s));
  assert.equal(st.caravans.length, 0);
  assert.equal(st.raids.length, 0);
  // Même sans passer par le chargement, une échéance NaN ne gèle pas la simulation
  s.marches.push({ id: 'm1', phase: 'out', arrive: NaN, units: {} });
  const food0 = s.resources.food;
  advance(s, T0 + 2 * H);
  assert.ok(s.meta.nextWorldTick > T0 + H, 'les ticks du monde continuent');
  assert.ok(Number.isFinite(s.resources.food) && (s.resources.food > 0 || food0 === 0));
});

test('Valeurs invalides : NaN, négatifs et nombres en texte corrigés', () => {
  const s = createNewState({ seed: 'num', now: T0 });
  const raw = JSON.parse(serialize(s));
  raw.resources.gold = '100'; raw.resources.wood = -5; raw.resources.stone = null;
  const st = deserialize(JSON.stringify(raw));
  assert.equal(st.resources.gold, 100);
  assert.equal(st.resources.wood, 0);
  assert.equal(st.resources.stone, 0);
});

test('Validation : contenu étranger, version future, données illisibles → erreur claire, rien n’est écrasé', () => {
  assert.throws(() => deserialize('{"hello":1}'), /pas une sauvegarde|incomplète/);
  assert.throws(() => deserialize('nope'), /illisible/);
  const s = createNewState({ seed: 'v', now: T0 });
  const future = { ...JSON.parse(serialize(s)), version: SAVE_VERSION + 5 };
  assert.throws(() => deserialize(JSON.stringify(future)), /plus récente/);
  assert.throws(() => importSave(''), /collez/);
  assert.throws(() => importSave('###'), /mal formé/);
  // Export / import aller-retour (code texte et JSON brut)
  assert.equal(importSave(exportSave(s)).meta.kingdomName, s.meta.kingdomName);
  assert.equal(importSave(serialize(s)).meta.seed, s.meta.seed);
});

test('Sauvegarde illisible : jamais écrasée silencieusement ; copie de secours proposée', () => {
  const good = createNewState({ seed: 'good', now: T0, kingdomName: 'Bonroyaume' });
  good.meta.bootOk = true;
  assert.ok(saveGame(good, T0).ok);
  assert.ok(localStorage.getItem(BACKUP_KEY), 'copie de secours créée');
  localStorage.setItem(SAVE_KEY, '{corrompu');
  const r = loadGame();
  assert.ok(r.error && !r.state);
  assert.equal(r.backup.meta.kingdomName, 'Bonroyaume');
  assert.equal(localStorage.getItem(CORRUPT_KEY), '{corrompu', 'copie de la sauvegarde endommagée conservée');
  assert.equal(localStorage.getItem(SAVE_KEY), '{corrompu', 'la sauvegarde n’a pas été remplacée');
});

test('Une partie qui n’a pas encore tourné ne remplace pas la copie de secours', () => {
  const good = createNewState({ seed: 'g', now: T0, kingdomName: 'Sain' });
  good.meta.bootOk = true;
  saveGame(good, T0);
  const imported = createNewState({ seed: 'i', now: T0, kingdomName: 'Importé' });
  saveGame(imported, T0 + 2 * H); // bootOk absent : pas de rotation
  assert.equal(JSON.parse(localStorage.getItem(BACKUP_KEY)).meta.kingdomName, 'Sain');
});

test('Stockage plein : la copie de secours est libérée pour que la sauvegarde principale passe', () => {
  const s = createNewState({ seed: 'q', now: T0 });
  s.meta.bootOk = true;
  const size = serialize(s).length;
  globalThis.localStorage = fakeStorage(size * 1.6);
  const r = saveGame(s, T0);
  assert.ok(r.ok, r.error);
  assert.ok(localStorage.getItem(SAVE_KEY));
  // Vraiment trop gros : erreur explicite, aucune exception
  globalThis.localStorage = fakeStorage(10);
  const r2 = saveGame(s, T0 + 20 * 60000);
  assert.equal(r2.ok, false);
  assert.match(r2.error, /Stockage plein/);
});

test('Nouvelle partie : toutes les copies sont effacées', () => {
  const s = createNewState({ seed: 'd', now: T0 }); s.meta.bootOk = true;
  saveGame(s, T0);
  localStorage.setItem(CORRUPT_KEY, 'x');
  deleteSave();
  for (const k of [SAVE_KEY, BACKUP_KEY, CORRUPT_KEY]) assert.equal(localStorage.getItem(k), null, k);
});

test('Horloge reculée : la simulation reprend au lieu de se figer', () => {
  const s = createNewState({ seed: 'clock', now: T0 });
  advance(s, T0 + 10 * H);
  const wood = s.resources.wood;
  assert.ok(advance(s, T0 + 4 * H), 'recalage');
  for (let h = 5; h <= 8; h++) advance(s, T0 + h * H);
  assert.ok(s.resources.wood !== wood || s.resources.food !== undefined);
  assert.ok(s.meta.lastTick === T0 + 8 * H);
  assert.ok(s.log.some((l) => /horloge/i.test(l.text)));
});

test('Longue absence (3 jours) : 12 h simulées au plus, aucune échéance résolue dans la période ignorée', () => {
  const s = createNewState({ seed: 'away', now: T0 });
  s.army.scout = 5;
  s.marches.push({ id: 'mx', type: 'explore', x: s.world.capital.x + 2, y: s.world.capital.y, units: { scout: 1 }, phase: 'out', start: T0, arrive: T0 + H, travel: H, loot: {}, items: [], log: [] });
  const now = T0 + 72 * H;
  advance(s, now);
  const skippedEnd = now - 12 * H;
  const inWindow = s.log.filter((l) => l.t > T0 + 1 && l.t < skippedEnd - 1 && !/Absence/.test(l.text));
  assert.equal(inWindow.length, 0, inWindow.map((l) => l.text).join(' | '));
  assert.equal(s.meta.lastTick, now);
});

test('Inventaire plafonné : les objets les plus faibles sont recyclés, les verrouillés et équipés gardés', () => {
  const s = createNewState({ seed: 'inv', now: T0 });
  for (let i = 0; i < INVENTORY_CAP + 50; i++) s.inventory.items.push(generateItem({ ilvl: 1 + (i % 10) }));
  const keep = s.inventory.items[0];
  keep.locked = true;
  advance(s, T0 + 2 * 60000);
  assert.ok(s.inventory.items.length <= INVENTORY_CAP);
  assert.ok(s.inventory.items.includes(keep));
});

test('Saison : se renouvelle à son terme ; un palier ne se réclame qu’une fois par saison', () => {
  const s = createNewState({ seed: 'season', now: T0 });
  s.season.points = 1e6;
  assert.ok(claimSeasonTier(s, 0, T0).ok);
  assert.equal(claimSeasonTier(s, 0, T0).ok, false);
  const later = T0 + 30 * 86400000;
  assert.equal(claimSeasonTier(s, 0, later).ok, false, 'points remis à zéro par la nouvelle saison');
  assert.ok(seasonInfo(s, later).remaining > 0);
});

test('Migration : une sauvegarde v4 sans les nouveaux systèmes est convertie et marquée', () => {
  const s = createNewState({ seed: 'old', now: T0 });
  const old = JSON.parse(serialize(s));
  for (const k of ['live', 'shards', 'notifications', 'admin', 'serverFeed']) delete old[k];
  old.version = 4;
  old.territories = { '1,1': { x: 1, y: 1, terrain: 'forest', since: T0 } };
  const st = deserialize(JSON.stringify(old));
  assert.equal(st.version, SAVE_VERSION);
  assert.equal(st.meta.migratedFrom, 4);
  assert.equal(st.territories['1,1'].level, 1);
  assert.ok(st.live && st.shards);
});
