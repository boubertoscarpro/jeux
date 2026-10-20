// v15 « L'Atlas vivant » : état de scène (ce que montrent les cartes), signes des présages (estimation de Bayes),
// demi-mesure et crise contenue, Némésis de la Brèche, migration d'une vraie sauvegarde v14, peintre déterministe.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { createNewState } from '../src/core/state.js';
import { advance } from '../src/core/engine.js';
import { serialize, deserialize } from '../src/core/save.js';
import { rng, mulberry32 } from '../src/core/rng.js';
import { OMEN, HALF_PREP, SIGNS } from '../src/data/crises.js';
import { sceneState, dayLight, groundKey } from '../src/systems/scene.js';
import { omensState, omenTick, omenEstimate, prepareFor, isPrepared, halfCost, prepCost } from '../src/systems/omens.js';
import { startCatastrophe } from '../src/systems/living.js';
import { crisesState, openCrisis, crisisTick } from '../src/systems/crises.js';
import { ensureBreach, breachForts, breachDefense, breachComposition, onBreachBattle } from '../src/systems/breach.js';
import { nemesisOf, nemesisMemory, nemesisFocus, nemesisReinforcement, nemesisAfterBattle, nemesisWarning, nemesisEpithet } from '../src/systems/nemesis.js';
import { NEMESIS, NEMESIS_TITLES } from '../src/data/nemesis.js';
import { armyPower } from '../src/systems/army.js';

const T0 = Date.UTC(2026, 6, 1, 8);
const H = 3600000, MIN = 60000;
const th = (s) => Object.values(s.city.buildings).find((b) => b.type === 'townhall');
function realm(seed, lvl = 8) {
  const s = createNewState({ seed, now: T0 });
  th(s).level = lvl;
  s.meta.lastTick = T0;
  for (const r of Object.keys(s.resources)) s.resources[r] = 50000;
  return s;
}
const omen = (o) => ({ kind: 'catastrophe', key: 'drought', q: 0.6, signs: [], quiet: 0, ...o });

// ───────── Scène ─────────
const noPlaces = (o) => Object.fromEntries(Object.entries(o).filter(([k, v]) => !k.startsWith('p_') && !(v.type === 'deco' && String(v.deco).startsWith('tr_')))); // lieux v16 et trophées v20 : ajoutés, jamais retirés

test('Scène : lumière selon l’heure, bornée et lisible', () => {
  assert.equal(dayLight(12).phase, 'day');
  assert.equal(dayLight(12).a, 0);
  assert.equal(dayLight(23).phase, 'night');
  assert.equal(dayLight(3).phase, 'night');
  assert.equal(dayLight(6).phase, 'dawn');
  assert.equal(dayLight(19).phase, 'dusk');
  for (let h = 0; h < 24; h += 0.5) assert.ok(dayLight(h).a <= 0.35, `voile ≤ 0,35 à ${h} h`);
});

test('Scène : déduite de l’état réel (catastrophe, crise de feu, signes), sans le modifier', () => {
  const s = realm('sc1');
  const before = JSON.stringify(s);
  const calm = sceneState(s, T0, 12);
  assert.equal(calm.drought, false);
  assert.equal(calm.burning.length, 0);
  assert.equal(calm.signs.length, 0);
  assert.equal(JSON.stringify(s), before, 'lecture seule');
  s.catastrophe = { key: 'drought', until: T0 + H, start: T0 };
  const b = Object.values(s.city.buildings).find((x) => x.type !== 'townhall') || th(s);
  s.crises = { ...(s.crises || {}), active: [{ id: 'c1', type: 'fire', stage: 0, burnt: [b.id] }] };
  omensState(s).list.unshift(omen({ id: 'o1', key: 'flood', at: T0 + H, signs: [{ t: T0 }], quiet: 1 }));
  const sc = sceneState(s, T0, 22);
  assert.equal(sc.drought, true);
  assert.equal(sc.catastrophe, 'drought');
  assert.deepEqual(sc.burning, [b.id]);
  assert.equal(sc.fireSpreading, true);
  assert.equal(sc.light.phase, 'night');
  assert.equal(sc.signs.length, 1);
  assert.equal(sc.signs[0].key, 'flood');
  assert.notEqual(groundKey(s, sc), groundKey(s, calm), 'le sol est repeint quand la sécheresse arrive');
});

// ───────── Signes des présages ─────────
test('Signes : l’estimation suit la règle de Bayes et part de la fiabilité annoncée', () => {
  const L = OMEN.signLikelihood;
  assert.equal(Math.round(omenEstimate(omen({})) * 1000), 600);
  const one = omenEstimate(omen({ signs: [{}] }));
  const odds = (0.6 / 0.4) * (L.true / L.false);
  assert.ok(Math.abs(one - odds / (1 + odds)) < 1e-9);
  assert.ok(omenEstimate(omen({ quiet: 3 })) < 0.6, 'des relevés sans signe font baisser l’estimation');
  assert.ok(omenEstimate(omen({ signs: [{}, {}, {}] })) > 0.95);
});

test('Signes : l’estimation est calibrée (parmi les présages estimés ~80 %, environ 80 % sont vrais)', () => {
  const r = mulberry32(42);
  const L = OMEN.signLikelihood;
  const bins = Array.from({ length: 5 }, () => ({ n: 0, truth: 0, est: 0 }));
  for (let i = 0; i < 20000; i++) {
    const q = 0.4 + r() * 0.5, truth = r() < q;
    const o = omen({ q });
    const k = 3 + Math.floor(r() * 4);
    for (let j = 0; j < k; j++) { if (r() < (truth ? L.true : L.false)) o.signs.push({}); else o.quiet++; }
    const e = omenEstimate(o), b = bins[Math.min(4, Math.floor(e * 5))];
    b.n++; b.truth += truth ? 1 : 0; b.est += e;
  }
  for (const b of bins) if (b.n > 500) assert.ok(Math.abs(b.truth / b.n - b.est / b.n) < 0.03, `écart de calibration ${(b.truth / b.n).toFixed(3)} vs ${(b.est / b.n).toFixed(3)}`);
});

test('Signes : relevés toutes les 20 min jusqu’à l’échéance ; la fréquence des fléaux ne change pas', () => {
  rng.setSource(mulberry32(5));
  try {
    const s = realm('sg1');
    const o = omen({ id: 'om1', heard: T0, at: T0 + 100 * MIN, truth: true, q: 0.6, resolved: false, nextSign: T0 + OMEN.signEveryMin * MIN });
    omensState(s).list.unshift(o);
    const hits = [];
    omenTick(s, T0 + 99 * MIN, 1 / 60, { key: 'summer' }, { catastrophe: (k) => { hits.push(k); return true; }, market: () => true });
    assert.equal(o.signs.length + o.quiet, Math.floor(99 / OMEN.signEveryMin), 'un relevé par tranche de 20 min');
    assert.ok(SIGNS.drought && SIGNS.flood);
    omenTick(s, T0 + 101 * MIN, 1 / 60, { key: 'summer' }, { catastrophe: (k) => { hits.push(k); return true; }, market: () => true });
    assert.deepEqual(hits, ['drought'], 'le fléau vrai arrive, ni plus ni moins');
  } finally { rng.setSource(null); }
});

// ───────── Demi-mesure ─────────
test('Demi-mesure : moitié du coût, compléter coûte l’autre moitié, crise contenue à sa 1re étape', () => {
  const s = realm('hp1');
  const o = omen({ id: 'omh', at: T0 + H, truth: true, resolved: false });
  omensState(s).list.unshift(o);
  const full = prepCost(s, 'drought'), half = halfCost(s, 'drought');
  for (const [r, v] of Object.entries(full)) assert.equal(half[r], Math.ceil(v * HALF_PREP.share));
  const g0 = { ...s.resources };
  assert.equal(prepareFor(s, 'omh', T0, 'half').ok, true);
  for (const [r, v] of Object.entries(half)) assert.equal(Math.round(g0[r] - s.resources[r]), v);
  assert.equal(isPrepared(s, 'drought', T0 + 10 * MIN), 'half');
  assert.equal(prepareFor(s, 'omh', T0, 'half').ok, false, 'pas deux demi-mesures');
  // Le fléau frappe : la crise s'ouvre « contenue » et s'arrête après sa première étape
  startCatastrophe(s, 'drought', T0 + H);
  const c = crisesState(s).active.find((x) => x.type === 'drought');
  assert.ok(c && c.contained, 'crise contenue');
  crisisTick(s, c.nextAt + MIN);
  assert.ok(!crisesState(s).active.find((x) => x.id === c.id), 'terminée après la 1re étape');
  // Compléter (sur un autre présage) : l'autre moitié, puis préparation entière
  const o2 = omen({ id: 'omh2', key: 'flood', at: T0 + 5 * H, truth: true, resolved: false });
  omensState(s).list.unshift(o2);
  prepareFor(s, 'omh2', T0 + 2 * H, 'half');
  const g1 = { ...s.resources };
  assert.equal(prepareFor(s, 'omh2', T0 + 2 * H, 'full').ok, true);
  for (const [r, v] of Object.entries(halfCost(s, 'flood'))) assert.equal(Math.round(g1[r] - s.resources[r]), v);
  assert.equal(isPrepared(s, 'flood', T0 + 3 * H), 'full');
});

// ───────── Némésis ─────────
const bFort = () => ({ id: 'brx', lord: 'Varg le Rouge', level: 6, xp: 0, doctrine: 'archers', cycle: 0, seen: {}, attacks: 0, wins: 0, losses: 0, ignored: 0, history: [], changes: [] });

test('Némésis : la mémoire suit vos classes envoyées et s’efface (demi-vie 24 h)', () => {
  const b = bFort();
  nemesisAfterBattle(b, { win: true, units: { knight: 10 } }, T0);
  assert.ok(Math.abs(nemesisMemory(b, T0).cavalry - NEMESIS.memoryWeight) < 1e-9);
  assert.ok(Math.abs(nemesisMemory(b, T0 + 24 * H).cavalry - NEMESIS.memoryWeight / 2) < 1e-3);
  assert.equal(b.nem.met, 1);
});

test('Némésis : adaptation bornée à +20 %, nulle pour une armée variée, annoncée avant l’attaque', () => {
  const mono = bFort(), mixed = bFort();
  for (let i = 0; i < 12; i++) {
    nemesisAfterBattle(mono, { win: true, units: { knight: 40 } }, T0 + i * MIN);
    nemesisAfterBattle(mixed, { win: true, units: { knight: 10, archer: 10, spearman: 10, ram: 10 } }, T0 + i * MIN);
  }
  const P = 10000;
  const r = nemesisReinforcement(mono, P, T0 + 12 * MIN);
  assert.ok(r.pct > 0.15 && r.pct <= NEMESIS.bonusMax + 1e-9, `renfort ${r.pct}`);
  assert.ok(r.units.breachWarden > 0, 'des gardiens contre la cavalerie');
  assert.ok(armyPower(r.units) <= P * NEMESIS.bonusMax * 1.1);
  assert.equal(nemesisReinforcement(mixed, P, T0 + 12 * MIN).pct, 0, 'la variété annule l’adaptation');
  assert.match(nemesisWarning(mono, T0 + 12 * MIN).text, /cavaliers/);
  // Attendre trois jours : l'oubli fait retomber l'adaptation
  assert.equal(nemesisReinforcement(mono, P, T0 + 72 * H).pct, 0);
  // Pas d'adaptation à la première rencontre
  const fresh = bFort();
  nemesisAfterBattle(fresh, { win: true, units: { knight: 40 } }, T0);
  assert.ok(nemesisFocus(fresh, T0).strength < 0.2);
});

test('Némésis : cicatrices quand vous gagnez, titres quand il gagne, revanche', () => {
  const b = bFort();
  const l = nemesisAfterBattle(b, { win: false, units: { knight: 30 } }, T0);
  assert.equal(l.title, NEMESIS_TITLES.cavalry);
  assert.equal(nemesisEpithet(b), `Varg le Rouge, ${NEMESIS_TITLES.cavalry}`);
  const w = nemesisAfterBattle(b, { win: true, units: { archer: 30 } }, T0 + H);
  assert.equal(w.revenge, NEMESIS_TITLES.cavalry);
  assert.ok(w.scar);
  assert.equal(b.nem.titles.length, 0);
  for (let i = 0; i < 8; i++) nemesisAfterBattle(b, { win: true, units: { archer: 30 } }, T0 + (2 + i) * H);
  assert.equal(b.nem.scars.length, NEMESIS.maxScars, 'cicatrices bornées');
  for (let i = 0; i < 8; i++) nemesisAfterBattle(b, { win: false, units: { [['archer', 'knight', 'spearman', 'ram'][i % 4]]: 30 } }, T0 + (20 + i) * H);
  assert.ok(b.nem.titles.length <= NEMESIS.maxTitles, 'titres bornés');
});

test('Némésis : intégrée à la défense de la forteresse (lecture seule) et au combat', () => {
  const s = realm('nm1');
  ensureBreach(s, T0);
  const poi = breachForts(s)[0];
  const before = JSON.stringify(poi.breach);
  const D0 = breachDefense(s, poi, T0);
  assert.equal(JSON.stringify(poi.breach), before, 'la défense ne crée pas l’état Némésis');
  assert.equal(D0.nemesis.pct, 0);
  for (let i = 0; i < 6; i++) nemesisAfterBattle(poi.breach, { win: true, units: { knight: 50 } }, T0 + i * MIN);
  const D1 = breachDefense(s, poi, T0 + 6 * MIN);
  assert.ok(D1.nemesis.pct > 0);
  const base = breachComposition(poi.breach);
  assert.ok((D1.enemies.breachWarden || 0) > (base.breachWarden || 0), 'contre-unités ajoutées');
  assert.ok(armyPower(D1.enemies) <= armyPower(base) * (1 + NEMESIS.bonusMax) * 1.1, 'renfort borné');
  // Revanche : butin courant majoré de 15 %
  poi.breach.nem.titles.push('Brise-Cheval');
  rng.setSource(mulberry32(3));
  try {
    const res = { winner: 'attacker', defRemaining: {} };
    const out = onBreachBattle(s, poi, res, { merit: 0.8, units: { knight: 20 }, sentCount: 20, lost: 2, lostRatio: 0.1, formation: 'balanced' }, T0 + H);
    assert.equal(out.nem.revenge, 'Brise-Cheval');
    assert.equal(poi.breach.nem.scars.length, NEMESIS.maxScars, 'déjà couvert de cicatrices : pas de cinquième');
    assert.ok(out.rewards.res && Object.values(out.rewards.res).every((v) => v > 0));
  } finally { rng.setSource(null); }
});

// ───────── Sauvegardes ─────────
test('Migration : une vraie sauvegarde v14 se charge, joue 2 jours, et se ressauvegarde sans perte', () => {
  const raw = gunzipSync(readFileSync(new URL('./fixtures/save-v14.json.gz', import.meta.url))).toString();
  const old = JSON.parse(raw);
  const s = deserialize(raw);
  assert.deepEqual(s.army, old.army);
  assert.equal(Math.round(s.resources.gold), Math.round(old.resources.gold));
  assert.equal(Object.keys(noPlaces(s.city.buildings)).length, Object.keys(old.city.buildings).length);
  assert.ok(Array.isArray(omensState(s).list));
  assert.equal(typeof omensState(s).prepHalf, 'object');
  // Les présages v14 en cours reçoivent leurs relevés de signes sans erreur
  advance(s, s.meta.lastTick + 48 * H);
  for (const [r, v] of Object.entries(s.resources)) assert.ok(Number.isFinite(v) && v >= 0, r);
  for (const o of omensState(s).list) assert.ok(Number.isFinite(omenEstimate(o)));
  const again = deserialize(serialize(s));
  assert.deepEqual(again.army, s.army);
  sceneState(again, again.meta.lastTick, 12);
});

test('Némésis : l’état survit à la sauvegarde', () => {
  const s = realm('nm2');
  ensureBreach(s, T0);
  const poi = breachForts(s)[0];
  nemesisAfterBattle(poi.breach, { win: false, units: { knight: 30 } }, T0);
  const r = deserialize(serialize(s));
  const p2 = Object.values(r.world.pois).find((p) => p.breach?.id === poi.breach.id);
  assert.deepEqual(p2.breach.nem.titles, [NEMESIS_TITLES.cavalry]);
  assert.equal(nemesisOf(p2.breach).met, 1);
});
