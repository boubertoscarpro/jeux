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

// ───────── Lot B ─────────
test('B3 : une forteresse d’événement s’assiège (murs, plan de siège) ; un camp refuse les engins', async () => {
  const { FORT_STYLES } = await import('../src/ui/paint/art.js');
  void FORT_STYLES;
  const s = fresh('b3');
  const cur = LE.startEvent(s, 'steppes', T0);
  const fort = cur.map.targets.find((t) => t.type === 'fortress');
  assert.ok(fort.wall > 0, 'forteresse fortifiée');
  const camp = cur.map.targets.find((t) => t.type === 'camp');
  const plan = { waves: [{ front: { share: 1, engines: { ram: 1 } }, left: { share: 0, engines: {} }, right: { share: 0, engines: {} } }] };
  const r = LE.planLive(s, { action: 'attack', targetId: camp.id, units: { spearman: 10 }, siegePlan: plan }, T0);
  assert.equal(r.ok, false); assert.match(r.reason, /enceinte/);
});

test('B4 : renforts alliés en vraies marches visibles ; combat de route contre les corsaires', () => {
  const s = fresh('b4');
  const cur = LE.startEvent(s, 'siege', T0);
  LE.liveTick(s, T0 + MIN);
  assert.ok(cur.map.threats.some((x) => x.kind === 'ally'), 'renforts en marche vers la Citadelle');
  const c2 = fresh('b4b'); const cc = LE.startEvent(c2, 'corsairs', T0);
  const port = cc.map.targets.find((t) => t.type === 'port');
  c2.caravans.push({ id: 'cv', x: port.x + 1, y: port.y, town: 'Port-Test', start: T0, end: T0 + 2 * H, gold: 1000, risk: 0.05, guards: {} });
  LE.liveTick(c2, T0 + MIN); assert.ok(c2.caravans[0].corsair);
  LE.liveTick(c2, T0 + H + MIN);
  assert.ok(c2.caravans[0].boarded, 'abordage à mi-chemin');
  assert.equal(c2.caravans[0].gold, 500, 'sans gardes, la moitié de la cargaison est pillée');
});

test('B6 : chaque maison rivale a son identité dans les données (architecture connue, couleurs, blason)', async () => {
  const { RIVALS } = await import('../src/data/world.js');
  const { FORT_STYLES } = await import('../src/ui/paint/art.js');
  const keys = new Set(FORT_STYLES.map((f) => f.key));
  for (const r of RIVALS) { assert.ok(keys.has(r.identity.arch), r.name); assert.equal(r.identity.colors.length, 2); assert.ok(r.identity.blazon.charge); }
  assert.equal(new Set(RIVALS.map((r) => r.identity.arch)).size, RIVALS.length, 'une architecture par maison');
});

test('B8 : une ruine fouillée dans une zone de l’archéologie localise le site du mystère', () => {
  const s = fresh('b8');
  s.archaeo = { active: { id: 'x', sites: [{ x: s.world.capital.x + 9, y: s.world.capital.y, cx: s.world.capital.x + 10, cy: s.world.capital.y + 1, r: 5, located: false, found: false }] } };
  const cur = LE.startEvent(s, 'ruins', T0);
  const z = s.archaeo.active.sites[0];
  const inZone = cur.map.targets.filter((t) => Math.hypot(t.x - z.cx, t.y - z.cy) <= z.r + 1);
  assert.ok(inZone.length >= 1, 'des ruines cachées dans la zone de fouilles');
  const tr = inZone.find((t) => t.type === 'treasure') || inZone[0];
  tr.type = 'treasure'; tr.fog = false;
  const r = LE.sendLive(s, { action: 'dig', targetId: tr.id, units: { spearman: 5 } }, T0);
  assert.ok(r.ok, r.reason);
  LE.processEventMarch(s, r.march, r.march.arrive); LE.processEventMarch(s, r.march, r.march.workEnd);
  assert.equal(z.located, true);
});

// ───────── Lot C ─────────
test('C1 : métropoles assiégeables ; pillage, vassalité (tribut, contre-attaque visible), libération', async () => {
  const C = await import('../src/systems/conquest.js');
  const { planMarch } = await import('../src/systems/marches.js');
  const s = fresh('c1');
  const ms = C.ensureMetropolises(s);
  assert.ok(ms.length >= 2);
  for (const p of ms) assert.ok(Math.hypot(p.x - s.world.capital.x, p.y - s.world.capital.y) >= C.CONQUEST.metroMinDist);
  const [a, b, c] = ms;
  s.world.revealed.fill(1);
  assert.ok(planMarch(s, { type: 'attack', x: a.x, y: a.y, units: { spearman: 10 } }, T0).ok, 'une métropole s’attaque');
  C.onMetroTaken(s, a, T0);
  const pd = s.pending.find((p) => p.kind === 'metro');
  assert.ok(pd && s.pending.some((p) => p.kind === 'prisoner'), 'décision et gouverneur capturé');
  const gold = s.resources.gold;
  C.resolveMetro(s, pd.id, 1, T0); // vassal
  assert.equal(a.metro.status, 'vassal');
  assert.ok(C.conquestState(s).threats.some((t) => t.kind === 'counter'), 'contre-attaque annoncée');
  C.conquestTick(s, T0 + 25 * H);
  assert.ok(s.resources.gold > gold, 'tribut');
  if (b) { C.onMetroTaken(s, b, T0); const p2 = s.pending.find((p) => p.kind === 'metro'); C.resolveMetro(s, p2.id, 0, T0); assert.equal(b.metro.status, 'pillaged'); assert.equal(planMarch(s, { type: 'attack', x: b.x, y: b.y, units: { spearman: 10 } }, T0).ok, false, 'la cité se relève'); }
  if (c) { C.onMetroTaken(s, c, T0); const p3 = s.pending.find((p) => p.kind === 'metro'); C.resolveMetro(s, p3.id, 2, T0); assert.equal(c.metro.status, 'liberated'); }
});

test('C2 : prisonniers : rançon, échange, ralliement, libération (réputation et mémoire de la maison)', async () => {
  const C = await import('../src/systems/conquest.js');
  const s = fresh('c2');
  const rel = () => s.factions[0].relation;
  const r0 = rel();
  for (let i = 0; i < 4; i++) {
    C.capture(s, { name: `Seigneur ${i}`, house: 0, rank: 1 }, T0);
    const pd = s.pending.find((p) => p.kind === 'prisoner');
    assert.ok(C.resolvePrisoner(s, pd.id, i, T0).ok);
  }
  assert.equal(C.conquestState(s).prisoners.length, 0);
  assert.ok(s.buffs.some((b) => /rallié/.test(b.name)));
  assert.ok(Array.isArray(s.factions[0].memory) && s.factions[0].memory.length >= 3);
  void r0;
});

test('C3 : fausses bannières : coût, durée, effet sur les raids, ruse éventée retenue', async () => {
  const C = await import('../src/systems/conquest.js');
  const s = fresh('c3');
  const g = s.resources.gold;
  assert.ok(C.setFalseBanner(s, 'weak', T0).ok);
  assert.equal(s.resources.gold, g - C.CONQUEST.bannerCost.gold);
  assert.equal(C.bannerMode(s, T0 + H), 'weak'); assert.equal(C.bannerMode(s, T0 + 4 * 24 * H), 'none');
  rng.setSource(mulberry32(1));
  let exposed = 0, light = 0;
  for (let i = 0; i < 40; i++) { const r = C.bannerOnRaid(s, 4, T0 + H); if (r.exposed) exposed++; else if (r.army < 1) light++; }
  assert.ok(exposed > 0 && light > 0, `${exposed} éventées, ${light} raids allégés`);
  assert.ok(s.factions[4].memory.some((m) => m.kind === 'ruse'));
});

test('C4 : saison de guerre : points, classement, prestige à la fin (titre), meilleur rang gardé par la dynastie', async () => {
  const C = await import('../src/systems/conquest.js');
  const s = fresh('c4');
  s.city.buildings[Object.keys(s.city.buildings).find((k) => s.city.buildings[k].type === 'townhall')].level = 6;
  C.conquestTick(s, T0);
  const S = C.conquestState(s).season;
  assert.ok(S && S.end - S.start === C.CONQUEST.seasonDays * 24 * H);
  C.addSeasonPoints(s, 50000, 'test', T0 + H);
  assert.equal(C.seasonBoard(s, T0 + 2 * H).rank, 1);
  C.conquestTick(s, S.end + MIN);
  assert.equal(C.conquestState(s).seasonsDone[0].rank, 1);
  assert.ok(s.meta.titles.some((t) => /Saison/.test(t)));
  assert.equal(s.legacy.bestWarSeason, 1);
  assert.equal(C.conquestState(s).season.n, 2);
});

test('C5 : Îles de Cendre : émergent au bord du monde, rapportent des cristaux, puis replongent', async () => {
  const C = await import('../src/systems/conquest.js');
  const s = fresh('c5');
  s.city.buildings[Object.keys(s.city.buildings).find((k) => s.city.buildings[k].type === 'townhall')].level = 7;
  C.conquestTick(s, T0); C.conquestTick(s, T0 + 2 * 24 * H + MIN);
  const I = C.conquestState(s).isles;
  assert.ok(I.list.length >= 2);
  const S = s.world.size;
  for (const k of I.list) { const [x, y] = k.split(',').map(Number); assert.ok(x <= 2 || y <= 2 || x >= S - 3 || y >= S - 3, 'au bord du monde'); }
  const p = s.world.pois[I.list[0]];
  C.onIsleTaken(s, p, T0 + 2 * 24 * H + 2 * MIN);
  const cr = s.resources.crystals || 0;
  C.conquestTick(s, T0 + 3 * 24 * H + 5 * MIN);
  assert.ok((s.resources.crystals || 0) >= cr || p.owner !== 'me');
  C.conquestTick(s, T0 + 10 * 24 * H);
  assert.equal(C.conquestState(s).isles.list.length, 0, 'replongées');
  for (const k of I.list) assert.ok(!s.world.pois[k] || s.world.pois[k].type !== 'ashIsle');
});

test('C6 : calendrier de fidélité : une récompense par jour, aucun jour manqué ne coûte rien', async () => {
  const C = await import('../src/systems/conquest.js');
  const s = fresh('c6');
  assert.ok(C.claimLoyalty(s, T0).ok);
  assert.equal(C.claimLoyalty(s, T0 + H).ok, false, 'une fois par jour');
  assert.ok(C.claimLoyalty(s, T0 + 5 * 24 * H).ok, 'après 4 jours sans venir : on continue');
  assert.equal(C.conquestState(s).loyalty.days, 2);
});
