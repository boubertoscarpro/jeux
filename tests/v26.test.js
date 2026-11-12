// v26 « Audit, finitions et nouvelles conquêtes » — lot A : chaque bug trouvé a son test (qui échouait avant la
// correction), plus les tests permanents de l'audit (reproductibilité, migrations, taille de la sauvegarde).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { createNewState } from '../src/core/state.js';
import { deserialize, serialize, importSave, saveGame, loadGame, SAVE_KEY } from '../src/core/save.js';
import { compress, decompress, isCompressed } from '../src/core/lz.js';
import { advance } from '../src/core/engine.js';
import { rng, mulberry32 } from '../src/core/rng.js';
import * as LE from '../src/systems/liveEvents.js';
import { canClaim } from '../src/systems/territory.js';
import { applySpeedup, findJob, previewSpeedup } from '../src/systems/speedups.js';
import { makeEnemies } from '../src/systems/worldgen.js';
import { key } from '../src/systems/world.js';

const T0 = Date.UTC(2026, 10, 12, 9), H = 3600000, MIN = 60000;
const fixture = (f) => gunzipSync(readFileSync(new URL(`./fixtures/${f}.json.gz`, import.meta.url))).toString();
const fresh = (seed) => {
  rng.setSource(mulberry32(11));
  const s = createNewState({ seed, now: T0 });
  s.army = { spearman: 300, swordsman: 200, archer: 200, scout: 10 };
  for (const r of ['gold', 'wood', 'stone', 'food', 'coal']) s.resources[r] = 1e6;
  s.live.calendar = []; s.live.current = null; s.meta.lastTick = T0;
  return s;
};
// État comparable : identifiants uniques (heure réelle + hasard, purement techniques) remplacés par un repère
function canon(state) {
  const txt = serialize(state).replace(/([a-z]+)_([0-9]+_[0-9]+_[a-zA-Z]+_)?[0-9a-z]{8,}/g, '$1_ID');
  const c = (o) => {
    if (Array.isArray(o)) return o.map(c);
    if (o && typeof o === 'object') { const ks = Object.keys(o); if (ks.length && ks.every((k) => /_ID/.test(k))) return ks.map((k) => c(o[k])).map((x) => JSON.stringify(x)).sort(); return Object.fromEntries(ks.map((k) => [k, c(o[k])])); }
    return o;
  };
  return c(JSON.parse(txt));
}
function finiteAll(o, path = '', out = []) {
  if (typeof o === 'number') { if (!Number.isFinite(o)) out.push(`${path}=${o}`); return out; }
  if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) finiteAll(v, `${path}.${k}`, out);
  return out;
}

test('A1 : la case d’une cible d’événement ne peut pas être revendiquée (la cible resterait cachée mais attaquable)', () => {
  const s = fresh('a1');
  const cur = LE.startEvent(s, 'steppes', T0);
  LE.syncEventPois(s, T0);
  const c = s.world.capital;
  const t = cur.map.targets.filter((x) => x.type === 'camp').sort((a, b) => Math.hypot(a.x - c.x, a.y - c.y) - Math.hypot(b.x - c.x, b.y - c.y))[0];
  s.world.revealed[t.y * s.world.size + t.x] = 1;
  const r = canClaim(s, t.x, t.y, T0);
  assert.equal(r.ok, false); assert.match(r.reason, /événement/);
  // y compris une ruine encore cachée sous le brouillard
  const ru = fresh('a1b'); const cr = LE.startEvent(ru, 'ruins', T0); const h = cr.map.targets.find((x) => x.fog);
  ru.world.revealed[h.y * ru.world.size + h.x] = 1; delete ru.world.pois[key(h.x, h.y)];
  assert.equal(canClaim(ru, h.x, h.y, T0).ok, false);
});

test('A2 : les ordres militaires pressent une marche (aller et retour), d’événement comme du monde', () => {
  const s = fresh('a2');
  const cur = LE.startEvent(s, 'steppes', T0);
  const t = cur.map.targets.filter((x) => x.type === 'camp').sort((a, b) => b.tier - a.tier)[0];
  const r = LE.sendLive(s, { action: 'attack', targetId: t.id, units: { spearman: 20 } }, T0);
  assert.ok(r.ok, r.reason);
  s.inventory.consumables.rspeed15 = 2; s.inventory.consumables.speed15 = 2;
  assert.equal(findJob(s, r.march.id).kind, 'march');
  assert.equal(previewSpeedup(s, r.march.id, { item: 'speed15' }, T0).ok, false, 'un passe-temps de construction ne presse pas une marche');
  const before = r.march.arrive;
  const sp = applySpeedup(s, r.march.id, { item: 'rspeed15' }, T0 + MIN);
  assert.ok(sp.ok, sp.reason);
  assert.equal(r.march.arrive, before - 15 * MIN); assert.equal(s.inventory.consumables.rspeed15, 1);
  // une marche pressée jusqu'au bout arrive tout de suite (le combat a lieu)
  s.inventory.consumables.rspeed480 = 1;
  const done = applySpeedup(s, r.march.id, { item: 'rspeed480' }, T0 + 2 * MIN);
  assert.ok(done.ok && done.done);
  assert.ok(!s.marches.some((m) => m.id === r.march.id && m.phase === 'out'), 'la marche a combattu (retour, ou armée tombée)');
});

test('A3 : une bataille ne dépend pas de l’heure réelle de l’appareil (graines tirées du jeu)', () => {
  const raw = fixture('save-milieu');
  const realNow = Date.now;
  const run = (offset) => {
    rng.setSource(mulberry32(7));
    const r = importSave(raw); const s = r.state || r;
    const t0 = s.meta.lastTick;
    Date.now = () => t0 + offset;
    try { advance(s, t0 + 12 * H); } finally { Date.now = realNow; }
    return canon(s);
  };
  assert.deepEqual(run(0), run(365 * 86400000));
});

test('A4 : les garnisons des lieux et les donjons sont tirés du générateur de la partie', () => {
  rng.setSource(mulberry32(5)); const a = makeEnemies('monsterLair', 4);
  rng.setSource(mulberry32(5)); const b = makeEnemies('monsterLair', 4);
  assert.deepEqual(a, b);
  rng.setSource(null);
});

test('Permanent : 12 h d’un coup ou 720 pas d’une minute donnent le même état', () => {
  const raw = fixture('save-milieu');
  const run = (steps) => { rng.setSource(mulberry32(9)); const r = importSave(raw); const s = r.state || r; const t0 = s.meta.lastTick; for (let i = 1; i <= steps; i++) advance(s, t0 + (12 * H * i) / steps); return canon(s); };
  assert.deepEqual(run(1), run(720));
});

test('Permanent : chaîne de migration de toutes les fixtures → version actuelle, rechargement, 24 h sans valeur invalide', () => {
  const files = readdirSync(new URL('./fixtures/', import.meta.url)).filter((f) => f.endsWith('.json.gz'));
  assert.ok(files.length >= 10);
  for (const f of files) {
    rng.setSource(mulberry32(3));
    const s = deserialize(gunzipSync(readFileSync(new URL(`./fixtures/${f}`, import.meta.url))).toString());
    const again = deserialize(serialize(s));
    advance(again, (again.meta.lastTick || T0) + 24 * H);
    const back = deserialize(serialize(again));
    assert.deepEqual(finiteAll(back), [], `${f} : valeurs invalides`);
    for (const [r, v] of Object.entries(back.resources)) assert.ok(v >= 0, `${f} : ${r} = ${v}`);
    for (const [u, v] of Object.entries(back.army)) assert.ok(v >= 0, `${f} : armée ${u} = ${v}`);
  }
  rng.setSource(null);
});

test('A5/A6 : sauvegarde compressée dans le navigateur (≈ 5 fois plus petite), relue à l’identique, ancien format accepté', () => {
  const s = deserialize(fixture('save-fin'));
  const json = serialize(s);
  const c = compress(json);
  assert.ok(isCompressed(c) && c.length < json.length / 3, `${c.length} / ${json.length}`);
  assert.equal(decompress(c), json);
  for (const ch of c) { const k = ch.charCodeAt(0); assert.ok(k < 0xd800 || k > 0xdfff, 'aucun caractère invalide'); }
  const store = new Map();
  globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
  assert.ok(saveGame(s).ok);
  assert.ok(isCompressed(store.get(SAVE_KEY)));
  assert.equal(loadGame().state.meta.kingdomName, s.meta.kingdomName);
  store.set(SAVE_KEY, json); // ancienne sauvegarde (JSON brut)
  assert.equal(loadGame().state.meta.kingdomName, s.meta.kingdomName);
  // stockage plein même après avoir libéré la copie de secours : erreur claire, rien n'est perdu en mémoire
  globalThis.localStorage = { getItem: () => null, setItem: () => { const e = new Error('quota'); e.name = 'QuotaExceededError'; throw e; }, removeItem: () => {} };
  const r = saveGame(s);
  assert.equal(r.ok, false); assert.match(r.error, /plein/);
  delete globalThis.localStorage;
});

test('A6 : l’historique et ses clés anti-doublon restent bornés', async () => {
  const { chronicle } = await import('../src/systems/chronicle.js');
  const s = fresh('a6');
  for (let i = 0; i < 3000; i++) chronicle(s, `Fait ${i}`, T0 + i * MIN, 'story', `k${i}`);
  assert.ok(s.history.length <= 500); assert.ok(Object.keys(s.historyKeys).length <= 2400);
  assert.equal(chronicle(s, 'Fait 2999', T0 + 4000 * MIN, 'story', 'k2999'), false, 'un fait récent reste dédoublonné');
});

test('A7 : un événement lancé en retard garde sa durée prévue, sans empiéter sur le suivant', () => {
  const s = fresh('a7');
  LE.startEvent(s, 'steppes', T0, T0 + 5 * H);
  s.live.calendar = [{ key: 'goldRush', start: T0 + H, end: T0 + 30 * H }, { key: 'giants', start: T0 + 60 * H, end: T0 + 90 * H }];
  advance(s, T0 + 6 * H);
  const cur = s.live.current;
  assert.equal(cur.key, 'goldRush');
  assert.ok(cur.end - cur.start >= 29 * H - MIN, `${(cur.end - cur.start) / H} h`);
  assert.ok(cur.end <= T0 + 60 * H);
});

test('A9 : une région laissée sans ordres ne rapporte plus qu’un quart', () => {
  const s = fresh('a9');
  const cur = LE.startEvent(s, 'kingdomWar', T0);
  const z = cur.map.targets.find((x) => x.type === 'zone');
  Object.assign(z, { owned: true, orderAt: T0, nextCounter: T0 + 99 * H, enemies: null });
  const w0 = cur.earned;
  cur.nextHour = T0 + H; LE.liveTick(s, T0 + H);
  const active = cur.earned - w0;
  cur.nextHour = T0 + 8 * H; LE.liveTick(s, T0 + 8 * H);
  const idle = cur.earned - w0 - active;
  assert.ok(active > 0 && idle > 0 && idle < active, `${active} puis ${idle}`);
});
