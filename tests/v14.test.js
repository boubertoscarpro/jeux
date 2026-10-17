// v14 « Répercussions » : présages, crises en cascade, réserves royales, feu et eau, frontières contestées.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { createNewState } from '../src/core/state.js';
import { advance } from '../src/core/engine.js';
import { serialize, deserialize } from '../src/core/save.js';
import { rng, mulberry32 } from '../src/core/rng.js';
import { CRISES, CRISIS, RESERVE, OMEN, FIRE, BORDER } from '../src/data/crises.js';
import { CATASTROPHES } from '../src/data/seasons.js';
import { MOTIONS } from '../src/data/council.js';
import { startCatastrophe, livingMarket, livingMods } from '../src/systems/living.js';
import { omensState, omenReliability, omenTick, verifyOmen, prepareFor, isPrepared, verifyCost } from '../src/systems/omens.js';
import { crisesState, openCrisis, crisisTick, intervene, crisisThread, crisisMods } from '../src/systems/crises.js';
import { reserveState, reserveCap, depositReserve, setReserveRule, releaseFood, reserveOf } from '../src/systems/reserve.js';
import { spreadWave, fireRisk, riskBand, floodZone, floodDamage, borderOf, igniteChance } from '../src/systems/hazards.js';
import { councilPressures, pickMotion } from '../src/systems/council.js';
import { stabilityFactors } from '../src/systems/stability.js';
import { computeMods } from '../src/systems/modifiers.js';
import { storageCap } from '../src/systems/economy.js';
import { key } from '../src/systems/world.js';

const T0 = Date.UTC(2026, 6, 1, 8);
const H = 3600000, MIN = 60000;
const th = (s) => Object.values(s.city.buildings).find((b) => b.type === 'townhall');
function realm(seed, lvl = 8) {
  const s = createNewState({ seed, now: T0 });
  th(s).level = lvl;
  s.meta.lastTick = T0;
  for (const r of Object.keys(s.resources)) s.resources[r] = 20000;
  return s;
}
const SUMMER = { key: 'summer' };
const hooks = (log) => ({ catastrophe: (k) => { log.push(k); return true; }, market: (r) => { log.push(r); return true; } });
// Ville vide et plate (bâtiments posés à la main pour les tests de propagation)
function flatCity(s) {
  s.city.terrain = s.city.terrain.map(() => 'plain');
  const keep = th(s);
  s.city.buildings = { [keep.id]: { ...keep, x: 0, y: 0 } };
  return (id, type, x, y, level = 1) => (s.city.buildings[id] = { id, type, x, y, level });
}

// ───────── Présages ─────────
test('Présages : la fiabilité dépend des sources et est bornée', () => {
  const s = realm('o1');
  const base = omenReliability(s);
  assert.equal(base, OMEN.baseReliability);
  s.city.buildings.tv = { id: 'tv', type: 'tavern', level: 20, x: 3, y: 3 };
  s.city.buildings.wt = { id: 'wt', type: 'watchtower', level: 20, x: 4, y: 3 };
  s.city.buildings.ob = { id: 'ob', type: 'observatory', level: 1, x: 5, y: 3 };
  const full = omenReliability(s);
  assert.ok(full > base && full <= OMEN.maxReliability);
});

test('Présages : un présage faux ne déclenche rien ; un vrai déclenche l’événement à l’échéance ; fréquence réelle inchangée', () => {
  rng.setSource(mulberry32(7));
  try {
    const s = realm('o2');
    const q = omenReliability(s);
    const fired = [];
    let announced = 0;
    // 600 h de jeu en été : on compte les sécheresses réellement déclenchées
    for (let m = 0; m < 600 * 60; m += 5) {
      const t = T0 + m * MIN;
      const before = omensState(s).stats.announced;
      omenTick(s, t, 5 / 60, SUMMER, hooks(fired));
      announced += omensState(s).stats.announced - before;
      s.catastrophe = null;
    }
    const S = omensState(s).stats;
    const droughts = fired.filter((k) => k === 'drought').length;
    const expected = 600 * CATASTROPHES.drought.chance; // ≈ 42 en v13 (sans présage)
    assert.ok(Math.abs(droughts - expected) < expected * 0.45, `${droughts} sécheresses pour ≈ ${expected} attendues`);
    // La part des présages faux correspond à la fiabilité affichée
    const falseShare = S.false / (S.false + S.happened);
    assert.ok(Math.abs(falseShare - (1 - q)) < 0.12, `faux : ${Math.round(falseShare * 100)} % (attendu ${Math.round((1 - q) * 100)} %)`);
    assert.ok(announced > 0);
  } finally { rng.setSource(null); }
});

test('Présages : recouper (astrologues contre de l’or, ou un éclaireur rendu après 30 min) et se préparer', () => {
  rng.setSource(mulberry32(3));
  try {
    const s = realm('o3');
    s.army.scout = 2;
    const S = omensState(s);
    S.list.push({ id: 'a', kind: 'catastrophe', key: 'flood', heard: T0, at: T0 + 2 * H, q: 0.6, truth: false, resolved: false });
    S.list.push({ id: 'b', kind: 'catastrophe', key: 'drought', heard: T0, at: T0 + 2 * H, q: 0.6, truth: true, resolved: false });
    const gold = s.resources.gold;
    const r = verifyOmen(s, 'a', 'gold', T0);
    assert.ok(r.ok && r.truth === false);
    assert.equal(gold - s.resources.gold, verifyCost(s).gold);
    assert.equal(verifyOmen(s, 'a', 'gold', T0).ok, false, 'pas deux fois');
    assert.ok(verifyOmen(s, 'b', 'scout', T0).pending);
    assert.equal(s.army.scout, 1);
    omenTick(s, T0 + 31 * MIN, 1 / 60, SUMMER, hooks([]));
    assert.equal(S.list.find((o) => o.id === 'b').checked, true);
    assert.equal(s.army.scout, 2, 'éclaireur rendu');
    // Préparation : payée même si le présage est faux ; la sécheresse préparée n'ouvre pas de crise
    const wood = s.resources.wood;
    assert.ok(prepareFor(s, 'b', T0).ok);
    assert.ok(s.resources.wood < wood);
    assert.ok(isPrepared(s, 'drought', T0 + 2 * H));
    startCatastrophe(s, 'drought', T0 + 2 * H);
    assert.equal(crisesState(s).active.length, 0, 'préparé : pas de crise');
  } finally { rng.setSource(null); }
});

// ───────── Crises en cascade ─────────
test('Crises : une sécheresse passe du marché au conseil puis aux provinces si on ne fait rien', () => {
  const s = realm('c1');
  const c = { x: s.world.capital.x + 2, y: s.world.capital.y + 2 };
  s.territories[key(c.x, c.y)] = { x: c.x, y: c.y, level: 1, name: 'Témoin', garrison: {}, stability: 40, tax: 'normal' };
  s.factions = [];
  const price0 = livingMarket(s, 'food', T0);
  startCatastrophe(s, 'drought', T0);
  const cr = crisesState(s).active[0];
  assert.equal(cr.type, 'drought');
  assert.equal(cr.stage, 0);
  crisisTick(s, T0 + 3 * H + 1);
  assert.equal(cr.stage, 1, 'le pain renchérit');
  assert.ok(livingMarket(s, 'food', T0 + 3 * H + 1) > price0 * 1.3);
  assert.ok(councilPressures(s).peasants.some(([l, v]) => /Sécheresse/.test(l) && v < 0));
  crisisTick(s, T0 + 7 * H + 1);
  assert.equal(cr.stage, 2);
  assert.ok(stabilityFactors(s, s.territories[key(c.x, c.y)], T0 + 7 * H + 1).some(([l, v]) => /Sécheresse/.test(l) && v < 0));
  crisisTick(s, T0 + 11 * H + 1);
  assert.equal(cr.stage, 3, 'jacquerie');
  assert.equal(s.territories[key(c.x, c.y)].revolt, true, 'la province instable se soulève');
  crisisTick(s, T0 + 17 * H + 1);
  assert.equal(crisesState(s).active.length, 0);
  assert.equal(crisesState(s).history[0].outcome, 'endured');
  // Effets temporaires : plus rien une fois la crise finie
  assert.equal(livingMarket(s, 'food', T0 + 17 * H + 2), price0);
  assert.deepEqual(crisisMods(s), {});
  // Délai avant une nouvelle crise
  assert.equal(openCrisis(s, 'flood', T0 + 18 * H), null);
  assert.ok(openCrisis(s, 'flood', T0 + 17 * H + CRISIS.cooldownH * H + 2));
});

test('Crises : couper la chaîne tôt coûte moins cher ; paiement tout ou rien ; retard une seule fois', () => {
  const s = realm('c2');
  const cr = openCrisis(s, 'drought', T0);
  const early = CRISES.drought.interventions.find((i) => i.id === 'canals');
  const late = CRISES.drought.interventions.find((i) => i.id === 'import');
  const val = (o) => Object.entries(o).reduce((a, [r, v]) => a + v * ({ gold: 1, wood: 1, stone: 1.1 }[r] || 1), 0);
  assert.ok(val(early.costPerTh) < val(late.costPerTh), 'tôt = moins cher');
  // Retard : une fois par crise
  crisisTick(s, T0 + 3 * H + 1);
  const next = cr.nextAt;
  assert.ok(intervene(s, cr.id, 'ration', T0 + 3 * H + 2).delayed);
  assert.equal(cr.nextAt, next + 4 * H);
  assert.equal(intervene(s, cr.id, 'ration', T0 + 3 * H + 3).ok, false);
  // Trop pauvre : rien n'est payé
  s.resources.gold = 10;
  const before = { ...s.resources };
  assert.equal(intervene(s, cr.id, 'import', T0 + 4 * H).ok, false);
  assert.deepEqual(s.resources, before);
  s.resources.gold = 100000;
  assert.ok(intervene(s, cr.id, 'import', T0 + 4 * H).resolved);
  assert.equal(crisesState(s).history[0].outcome, 'resolved');
});

test('Crises : pas avant l’HdV 3, une à la fois (plus un incendie), fil lisible', () => {
  const low = realm('c3', 2);
  assert.equal(openCrisis(low, 'drought', T0), null);
  const s = realm('c3b');
  assert.ok(openCrisis(s, 'flood', T0));
  assert.equal(openCrisis(s, 'drought', T0), null);
  assert.ok(openCrisis(s, 'fire', T0, { burnt: [] }));
  const t = crisisThread(s, crisesState(s).active[0]);
  assert.equal(t.stages[0].state, 'now');
  assert.ok(t.stages[1].effects.length > 0);
  assert.ok(t.interventions.every((iv) => iv.stages.includes(0)));
});

// ───────── Réserves royales ─────────
test('Réserves : plafond, versement, consigne de débordement, aucune reprise libre', () => {
  const s = realm('r1');
  const mods = computeMods(s, T0);
  const cap = reserveCap(s, 'food', mods);
  assert.equal(cap, Math.floor(storageCap(s, mods, 'food') * RESERVE.capShare.food));
  s.resources.food = 4000;
  const r = depositReserve(s, 'food', null, T0);
  assert.ok(r.ok && r.n === 1000);
  assert.equal(s.resources.food, 3000);
  assert.equal(depositReserve(s, 'gold', 10).ok, false, 'pas d’or en réserve');
  depositReserve(s, 'food', 10 ** 9, T0);
  assert.ok(reserveOf(s, 'food') <= cap);
  // Pas de famine : on ne reprend pas
  assert.equal(releaseFood(s).ok, false);
  s.famine = true; s.resources.food = 0;
  const back = releaseFood(s);
  assert.ok(back.ok && s.resources.food === back.n && reserveOf(s, 'food') === 0);
  // Débordement : versé à la réserve au lieu d'être écoulé
  const t = realm('r1b');
  for (const k of Object.keys(t.resources)) t.resources[k] = 0;
  t.city.buildings.mk = { id: 'mk', type: 'market', level: 3, x: 20, y: 12 };
  t.city.buildings.fm = { id: 'fm', type: 'farm', level: 10, x: 21, y: 12 };
  t.resources.food = storageCap(t, computeMods(t, T0), 'food');
  setReserveRule(t, 'overflow', true);
  advance(t, T0 + 2 * H);
  assert.ok(reserveOf(t, 'food') > 0, 'le débordement nourrit la réserve');
});

test('Régent : en votre absence, il coupe la crise avec la réserve, jamais avec les stocks', () => {
  const s = realm('r2');
  reserveState(s).stock.food = 100000;
  const goldBefore = s.resources.gold;
  const cr = openCrisis(s, 'drought', T0);
  assert.equal(crisesState(s).active.length, 1, 'la première étape reste la décision du joueur');
  crisisTick(s, T0 + 3 * H + 1);
  assert.equal(crisesState(s).active.length, 0, 'greniers ouverts dès que la crise s’aggrave');
  assert.equal(crisesState(s).history[0].how, 'Ouvrir les greniers royaux');
  assert.equal(crisesState(s).history[0].stage, 1);
  assert.equal(s.resources.gold, goldBefore, 'aucun or dépensé');
  assert.ok(cr);
  // Sans réserve, le régent ne fait rien (la crise suit son cours)
  const t = realm('r2b');
  openCrisis(t, 'drought', T0);
  crisisTick(t, T0 + 30 * H);
  assert.equal(crisesState(t).history[0].outcome, 'endured');
  // Consigne désactivée : il n'agit pas même avec une réserve
  const u = realm('r2c');
  reserveState(u).stock.food = 100000;
  setReserveRule(u, 'regent', false);
  openCrisis(u, 'drought', T0);
  crisisTick(u, T0 + 3 * H + 1);
  assert.equal(crisesState(u).active.length, 1);
});

// ───────── Feu et eau ─────────
test('Incendie : le bois brûle, la pierre résiste, une case vide ou une route arrête le feu ; borné', () => {
  rng.setSource(mulberry32(1));
  try {
    const s = realm('f1');
    const put = flatCity(s);
    // Une rangée de 8 maisons serrées (bois) : bornée à FIRE.maxBurn
    for (let i = 0; i < 8; i++) put('h' + i, 'house', 5 + i, 5);
    s.city.buildings.h0.damaged = true;
    const fire = { burnt: ['h0'] };
    for (let k = 0; k < 10; k++) spreadWave(s, fire);
    assert.ok(fire.burnt.length <= FIRE.maxBurn);
    // Une route ne brûle pas : elle sert de coupe-feu
    put('rd', 'road', 13, 5);
    assert.equal(igniteChance(s, s.city.buildings.rd), 0);
    // Un îlot isolé par une case vide ne peut pas être atteint
    put('far', 'house', 5, 9);
    assert.equal(s.city.buildings.far.damaged, undefined);
    // La pierre est moins inflammable que le bois ; la rivière protège
    put('st', 'warehouse', 3, 12); put('wd', 'house', 5, 12);
    assert.ok(igniteChance(s, s.city.buildings.st) < igniteChance(s, s.city.buildings.wd));
    const wd = igniteChance(s, s.city.buildings.wd);
    s.city.terrain[13 * s.city.w + 5] = 'river';
    assert.ok(igniteChance(s, s.city.buildings.wd) < wd);
    // Aperçu des risques : un bâtiment serré est plus exposé qu'un bâtiment isolé
    put('iso', 'house', 15, 14);
    assert.equal(riskBand(fireRisk(s, s.city.buildings.iso)), 'none');
    assert.notEqual(riskBand(fireRisk(s, s.city.buildings.h6)), 'none');
  } finally { rng.setSource(null); }
});

test('Incendie : la garde proche maîtrise le feu après la première vague ; sinon deux vagues', () => {
  rng.setSource(mulberry32(2));
  try {
    const s = realm('f2');
    const put = flatCity(s);
    for (let i = 0; i < 4; i++) put('h' + i, 'house', 10 + i, 10);
    put('br', 'barracks', 12, 12);
    s.city.buildings.h0.damaged = true;
    const c = openCrisis(s, 'fire', T0, { burnt: ['h0'], guarded: true });
    crisisTick(s, T0 + 31 * MIN);
    assert.equal(c.stage, 2, 'directement aux sans-abri');
    assert.equal(c.how, 'La garde a maîtrisé le feu');
    const t = realm('f2b');
    const put2 = flatCity(t);
    for (let i = 0; i < 4; i++) put2('h' + i, 'house', 10 + i, 10);
    t.city.buildings.h0.damaged = true;
    const d = openCrisis(t, 'fire', T0, { burnt: ['h0'] });
    crisisTick(t, T0 + 31 * MIN);
    assert.equal(d.stage, 1, 'le quartier brûle');
    // Chaîne de seaux : arrête la propagation
    assert.ok(intervene(t, d.id, 'buckets', T0 + 32 * MIN).ok);
    assert.equal(d.stage, 2);
  } finally { rng.setSource(null); }
});

test('Crue : seule la zone inondable est touchée ; les sacs de sable divisent les dégâts', () => {
  rng.setSource(mulberry32(5));
  try {
    const s = realm('w1');
    const put = flatCity(s);
    for (let x = 0; x < s.city.w; x++) s.city.terrain[8 * s.city.w + x] = 'river';
    for (let i = 0; i < 20; i++) put('r' + i, 'farm', i, 7);   // au bord de la rivière
    for (let i = 0; i < 20; i++) put('d' + i, 'farm', i, 3);   // loin
    assert.equal(floodZone(s).length, 20);
    const n = floodDamage(s, 1);
    assert.ok(n > 0 && Object.values(s.city.buildings).filter((b) => b.id.startsWith('d') && b.damaged).length === 0);
    for (const b of Object.values(s.city.buildings)) b.damaged = false;
    let g = 0, f = 0;
    for (let k = 0; k < 20; k++) { for (const b of Object.values(s.city.buildings)) b.damaged = false; g += floodDamage(s, 0.25); for (const b of Object.values(s.city.buildings)) b.damaged = false; f += floodDamage(s, 1); }
    assert.ok(g < f * 0.5, `${g} dégâts préparés contre ${f}`);
  } finally { rng.setSource(null); }
});

// ───────── Frontières contestées ─────────
test('Frontières : contestée avec une faction hostile, amie avec une alliée, réversible', () => {
  const s = realm('b1');
  const f = s.factions[0];
  const [fx, fy] = f.territory[0].split(',').map(Number);
  const t = { x: fx + 2, y: fy, level: 1, name: 'Marche', garrison: {}, stability: 70 };
  s.territories[key(t.x, t.y)] = t;
  for (const o of s.factions) if (o !== f) o.territory = [];
  f.relation = -60; f.stance = 'war';
  assert.equal(borderOf(s, t).kind, 'contested');
  assert.ok(stabilityFactors(s, t, T0).some(([l, v]) => /Frontière contestée/.test(l) && v === BORDER.hostile));
  f.relation = 60; f.stance = 'alliance';
  assert.equal(borderOf(s, t).kind, 'friendly');
  assert.ok(stabilityFactors(s, t, T0).some(([l, v]) => /Frontière amie/.test(l) && v === BORDER.friendly));
  // Loin de toute faction : aucun effet
  const far = { x: 0, y: 0, level: 1, name: 'Loin' };
  f.territory = [key(100, 100)];
  assert.equal(borderOf(s, far), null);
});

test('Jacquerie : la révolte vise d’abord une province en frontière contestée', () => {
  const s = realm('b2');
  const f = s.factions[0];
  for (const o of s.factions) if (o !== f) o.territory = [];
  const [fx, fy] = f.territory[0].split(',').map(Number);
  f.relation = -80; f.stance = 'war';
  s.territories.a = { x: fx + 1, y: fy, level: 1, name: 'Frontalière', garrison: {}, stability: 55 };
  s.territories.b = { x: 2, y: 2, level: 1, name: 'Intérieure', garrison: {}, stability: 35 };
  f.territory = f.territory.filter((k) => { const [x, y] = k.split(',').map(Number); return Math.hypot(x - 2, y - 2) > 6; });
  const c = openCrisis(s, 'drought', T0);
  crisisTick(s, T0 + 11 * H + 1);
  assert.equal(c.stage, 3);
  assert.equal(s.territories.a.revolt, true);
  assert.ok(!s.territories.b.revolt);
});

// ───────── Conseil : motion du grain cohérente ─────────
test('Conseil : « Distribuer le grain » n’est proposée qu’en cas de faim réelle', () => {
  rng.setSource(mulberry32(4));
  try {
    const s = realm('k1');
    const seen = new Set();
    for (let i = 0; i < 300; i++) seen.add(pickMotion(s));
    assert.ok(!seen.has('grain'));
    s.famine = true;
    const seen2 = new Set();
    for (let i = 0; i < 300; i++) seen2.add(pickMotion(s));
    assert.ok(seen2.has('grain'));
    assert.ok(MOTIONS.grain);
  } finally { rng.setSource(null); }
});

// ───────── Sauvegardes ─────────
test('Migration : une vraie sauvegarde v13.3 se charge, sa rumeur devient un présage, rien n’est perdu', () => {
  const raw = gunzipSync(readFileSync(new URL('./fixtures/save-v13.3.json.gz', import.meta.url))).toString();
  const old = JSON.parse(raw);
  assert.ok(old.rumor && !old.crises && !old.omens && !old.reserve, 'fixture au format v13.3');
  const s = deserialize(raw);
  assert.equal(s.city.buildings.tv.level, old.city.buildings.tv.level);
  assert.deepEqual(s.army, old.army);
  assert.equal(Object.keys(s.territories).length, Object.keys(old.territories).length);
  assert.equal(Math.round(s.resources.gold), Math.round(old.resources.gold));
  const S = omensState(s);
  assert.equal(S.list.length, 1);
  assert.equal(S.list[0].kind, 'market');
  assert.equal(S.list[0].key, 'iron');
  assert.equal(s.rumor, null);
  assert.ok(Array.isArray(crisesState(s).active));
  assert.equal(reserveState(s).regent, true);
  // La partie continue : 2 jours de jeu, aucune valeur invalide, la rumeur héritée se réalise comme avant
  advance(s, s.meta.lastTick + 48 * H);
  for (const [r, v] of Object.entries(s.resources)) assert.ok(Number.isFinite(v) && v >= 0, r);
  assert.ok(S.list.find((o) => o.key === 'iron' && o.q === 1)?.resolved);
});

test('Sauvegarde : crises, présages et réserves survivent à un rechargement, et l’ordre des étapes reprend', () => {
  const s = realm('s1');
  reserveState(s).stock.herbs = 5; setReserveRule(s, 'regent', false);
  const c = openCrisis(s, 'flood', T0);
  omensState(s).list.push({ id: 'x', kind: 'catastrophe', key: 'blizzard', heard: T0, at: T0 + H, q: 0.7, truth: true, resolved: false });
  const b = deserialize(serialize(s));
  assert.equal(crisesState(b).active[0].id, c.id);
  assert.equal(omensState(b).list.find((o) => o.id === 'x').key, 'blizzard');
  assert.equal(reserveOf(b, 'herbs'), 5);
  assert.equal(b.reserve.regent, false);
  crisisTick(b, T0 + 3 * H + 1);
  assert.equal(crisesState(b).active[0].stage, 1);
  // Champs corrompus : réparés sans erreur
  const raw = JSON.parse(serialize(s));
  raw.crises = 'x'; raw.omens = [1]; raw.reserve = { stock: { food: -5 } };
  const z = deserialize(JSON.stringify(raw));
  assert.ok(Array.isArray(crisesState(z).active));
  assert.ok(Array.isArray(omensState(z).list));
  assert.equal(reserveOf(z, 'food'), 0);
});

test('Trois jours de jeu avec crises et présages : aucune valeur invalide, effets bornés', () => {
  rng.setSource(mulberry32(14));
  try {
    const s = realm('long');
    s.army = { spearman: 50, scout: 3 };
    for (let h = 1; h <= 72; h++) {
      advance(s, T0 + h * H);
      const m = livingMods(s, T0 + h * H);
      assert.ok((m['prod.all'] || 0) >= -0.2, 'malus cumulés bornés');
    }
    for (const [r, v] of Object.entries(s.resources)) assert.ok(Number.isFinite(v) && v >= 0, r);
    const C = crisesState(s);
    assert.ok(C.active.length <= 2);
    assert.ok(omensState(s).stats.announced > 0);
    assert.ok(omensState(s).list.length <= OMEN.keep);
  } finally { rng.setSource(null); }
});
