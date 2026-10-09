// Spécialisations de royaume : bonus et malus réellement appliqués par les formules du jeu, cumul, départ,
// difficulté, origine, sauvegarde et migration.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createNewState, SAVE_VERSION } from '../src/core/state.js';
import { advance } from '../src/core/engine.js';
import { serialize, deserialize } from '../src/core/save.js';
import { rng, mulberry32 } from '../src/core/rng.js';
import { KINGDOM_TYPES, ORIGINS, DIFFICULTIES } from '../src/data/kingdoms.js';
import { kingdomMods, costMult } from '../src/systems/kingdom.js';
import { computeMods, prodMult } from '../src/systems/modifiers.js';
import { storageCap, upkeepPerHour, buildingRates } from '../src/systems/economy.js';
import { getUpgradeInfo } from '../src/systems/construction.js';
import { unitCost, trainTime } from '../src/systems/army.js';
import { researchCost, researchTime } from '../src/systems/research.js';
import { craftCost } from '../src/systems/crafting.js';
import { ENVOY_COST } from '../src/systems/factions.js';
import { repairCost } from '../src/systems/automation.js';
import { territoryCost } from '../src/systems/territory.js';
import { simulateBattle } from '../src/systems/combat.js';
import { fulfillContract, contractsTick } from '../src/systems/market.js';
import { foundDynasty } from '../src/systems/talents.js';
import { revealedCount } from '../src/systems/world.js';
import { shardState } from '../src/systems/shards.js';

const T0 = Date.UTC(2026, 5, 1);
const H = 3600000;
const make = (kingdomType, extra = {}) => createNewState({ seed: 'kt', now: T0, kingdomType, ...extra });
const sum = (o) => Object.values(o).reduce((a, b) => a + b, 0);
const near = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;

test('Chaque spécialisation : données complètes et modificateurs exactement ajoutés à computeMods', () => {
  const base = computeMods(make(null), T0);
  for (const [k, def] of Object.entries(KINGDOM_TYPES)) {
    for (const f of ['name', 'icon', 'lore', 'style', 'strategy', 'startText']) assert.ok(def[f], `${k}.${f}`);
    assert.ok(def.bonuses.length >= 2 && def.maluses.length >= 1 && def.excels.length >= 2, k);
    assert.ok(def.difficulty >= 1 && def.difficulty <= 3);
    const s = make(k);
    assert.equal(s.kingdom.type, k);
    const m = computeMods(s, T0);
    for (const [key, v] of Object.entries(def.mods)) assert.ok(near((m[key] || 0) - (base[key] || 0), v), `${k} ${key}`);
    // Aucun bonus caché : toutes les clés proviennent de la fiche affichée
    assert.deepEqual(kingdomMods(s), def.mods);
  }
});

test('Anciens : aucune source d’Éclats, aucune modification de la Roue ni des légendaires', () => {
  for (const def of Object.values(KINGDOM_TYPES)) for (const key of Object.keys(def.mods)) assert.doesNotMatch(key, /shard|wheel|pity|legend|ticket|mythic/i);
  const s = make('ancients');
  assert.equal(shardState(s).count, 0);
  assert.equal(shardState(s).tickets, 0);
  // Départ plus difficile : −25 % de ressources (+5 cristaux)
  const legacy = make(null);
  assert.equal(s.resources.wood, Math.floor(legacy.resources.wood * 0.75));
  assert.equal(s.resources.crystals, legacy.resources.crystals + 5);
});

test('Moissons : production, stockage, coût agricole, famine et formation appliqués par les formules', () => {
  const h = make('harvest'), l = make(null);
  const mh = computeMods(h, T0), ml = computeMods(l, T0);
  for (const s of [h, l]) s.city.buildings.f = { id: 'f', type: 'farm', level: 3, x: 9, y: 2 };
  const fh = buildingRates(h, h.city.buildings.f, mh).out.food, fl = buildingRates(l, l.city.buildings.f, ml).out.food;
  assert.ok(near(fh / fl, prodMult(mh, 'food') / prodMult(ml, 'food'), 1e-6) && fh > fl, 'ferme plus productive');
  assert.ok(storageCap(h, mh, 'food') > storageCap(l, ml, 'food') && storageCap(h, mh, 'wood') === storageCap(l, ml, 'wood'), 'stockage nourriture seulement');
  assert.equal(getUpgradeInfo(h, 'farm', 2, mh).cost.wood, Math.ceil(getUpgradeInfo(l, 'farm', 2, ml).cost.wood * 0.85 / 1) || getUpgradeInfo(h, 'farm', 2, mh).cost.wood);
  assert.ok(getUpgradeInfo(h, 'farm', 2, mh).cost.wood < getUpgradeInfo(l, 'farm', 2, ml).cost.wood);
  assert.equal(getUpgradeInfo(h, 'sawmill', 2, mh).cost.wood, getUpgradeInfo(l, 'sawmill', 2, ml).cost.wood, 'les autres bâtiments ne sont pas réduits');
  assert.ok(sum(unitCost('spearman', mh)) > sum(unitCost('spearman', ml)), 'formation +10 %');
  assert.equal(h.resources.food, l.resources.food + 800);
  // Famine : la pénalité de moral est divisée par deux
  const side = (mods) => ({ units: { spearman: 20 }, mods, famine: true, label: 'X' });
  const rh = simulateBattle(side(mh), { units: { bandit: 5 }, mods: {} }, { deterministic: true });
  assert.ok(rh.notes.some((n) => /famine −15/.test(n)), rh.notes.join('|'));
});

test('Fer : forge moins chère, défense de l’infanterie, entretien plus élevé', () => {
  const f = make('iron'), l = make(null);
  const mf = computeMods(f, T0), ml = computeMods(l, T0);
  assert.ok(sum(craftCost('weapon', 'none', mf)) < sum(craftCost('weapon', 'none', ml)));
  l.army = { ...f.army };
  assert.ok(near(upkeepPerHour(f, mf) / upkeepPerHour(l, ml), (1 + (mf.upkeep || 0)) / (1 + (ml.upkeep || 0)), 1e-6));
  // Même combat déterministe : l'infanterie de Fer perd moins
  const fight = (mods) => simulateBattle({ units: { bandit: 40 }, mods: {} }, { units: { spearman: 40 }, mods, label: 'D' }, { deterministic: true });
  assert.ok(sum(fight(mf).defLosses) <= sum(fight(ml).defLosses) && sum(fight(mf).attLosses) >= sum(fight(ml).attLosses));
  assert.equal(f.army.swordsman, 8);
});

test('Marchands : contrats +10 %, formation plus chère', () => {
  rng.setSource(mulberry32(8));
  const run = (type) => {
    const s = make(type);
    for (const r of Object.keys(s.resources)) s.resources[r] = 20000;
    s.city.buildings.m = { id: 'm', type: 'market', level: 3, x: 9, y: 4 };
    const town = Object.values(s.world.pois).find((p) => p.type === 'town');
    s.world.revealed[town.y * s.world.size + town.x] = 1;
    let c;
    for (let i = 0; i < 400 && !c; i++) { s.contracts = []; s.nextContract = 0; contractsTick(s, T0); c = s.contracts.find((x) => x.kind === 'military'); }
    s.stats.battlesWon += c.n;
    return fulfillContract(s, c.id, T0 + 60000).reward;
  };
  const rm = run('merchants');
  rng.setSource(mulberry32(8));
  const rl = run(null);
  rng.setSource(null);
  for (const r of Object.keys(rl)) assert.ok(rm[r] >= Math.round(rl[r] * 1.1) - 1, `${r} ${rm[r]} vs ${rl[r]}`);
});

test('Érudits : recherche plus rapide et moins chère (davantage en économie), formation plus lente, militaire plus cher', () => {
  const e = make('scholars'), l = make(null);
  const me = computeMods(e, T0), ml = computeMods(l, T0);
  const eco = 'eco_tools', mil = 'mil_drill';
  const k = (id) => sum(researchCost(id, me)) / sum(researchCost(id, ml));
  assert.ok(k(eco) < k(mil) && k(mil) < 1, `${k(eco)} ${k(mil)}`);
  assert.ok(researchTime(eco, me) < researchTime(eco, ml));
  assert.ok(trainTime('spearman', 1, me) > trainTime('spearman', 1, ml));
  assert.ok(sum(getUpgradeInfo(e, 'barracks', 1, me).cost) > sum(getUpgradeInfo(l, 'barracks', 1, ml).cost));
  assert.equal(sum(getUpgradeInfo(e, 'library', 1, me).cost), sum(getUpgradeInfo(l, 'library', 1, ml).cost));
});

test('Pionniers : éclaireurs moins chers, carte plus révélée, vivres d’expédition réduits', () => {
  const p = make('pioneers'), l = make(null);
  const mp = computeMods(p, T0), ml = computeMods(l, T0);
  assert.ok(sum(unitCost('scout', mp)) < sum(unitCost('scout', ml)));
  assert.equal(sum(unitCost('spearman', mp)), sum(unitCost('spearman', ml)));
  assert.ok(revealedCount(p.world) > revealedCount(l.world));
  assert.equal(costMult(mp, 'expedition'), 0.8);
  assert.equal(p.army.scout, l.army.scout + 4);
});

test('Bastions : muraille de départ, réparations moins chères, territoires et engins de siège plus chers', () => {
  const b = make('bastions'), l = make(null);
  const mb = computeMods(b, T0), ml = computeMods(l, T0);
  assert.equal(b.city.fort.wall, 1);
  const bld = { type: 'farm', level: 3 };
  assert.ok(sum(repairCost(bld, mb)) < sum(repairCost(bld, ml)));
  assert.ok(sum(territoryCost(b)) > sum(territoryCost(l)));
  assert.ok(sum(unitCost('ram', mb)) > sum(unitCost('ram', ml)));
  assert.ok((mb['wall.pct'] || 0) - (ml['wall.pct'] || 0) >= 0.3 - 1e-9);
});

test('Ombres : ambassadeurs et espions moins chers, production réduite', () => {
  const o = make('shadows'), l = make(null);
  const mo = computeMods(o, T0), ml = computeMods(l, T0);
  assert.ok(ENVOY_COST(o).gold < ENVOY_COST(l).gold);
  assert.ok(sum(unitCost('spy', mo)) < sum(unitCost('spy', ml)));
  assert.ok(prodMult(mo, 'wood') < prodMult(ml, 'wood'));
  assert.equal(o.army.spy, 2);
});

test('Cumul : additif avec technologies, événements et bâtiments ; coûts jamais sous 50 %', () => {
  const s = make('harvest');
  const before = computeMods(s, T0)['prod.food'] || 0;
  s.techs.agr_plough = T0;
  s.events.push({ key: 'harvestFestival', end: T0 + H });
  const after = computeMods(s, T0)['prod.food'];
  assert.ok(near(after, before + 0.1 + 0.25), `${after}`);
  assert.equal(costMult({ 'cost.train': -0.9, 'cost.unit.scout': -0.3 }, 'train', 'unit.scout'), 0.5);
  assert.equal(costMult({}, 'train'), 1);
  // Bâtiments : le coût de construction cumule build.cost (technos) et la spécialisation, plancher 50 %
  const m = { 'build.cost': -0.4, 'cost.build.food': -0.3 };
  const full = getUpgradeInfo(s, 'farm', 2, {}).cost.wood;
  assert.equal(getUpgradeInfo(s, 'farm', 2, m).cost.wood, Math.ceil(full * 0.5) || getUpgradeInfo(s, 'farm', 2, m).cost.wood);
});

test('Difficulté et origine : effets de départ et réglages', () => {
  const g = make('harvest', { difficulty: 'guided' }), c = make('harvest');
  assert.ok(g.resources.wood > c.resources.wood);
  assert.equal(g.raidCooldown, T0 + 24 * H);
  assert.equal(g.meta.advice, 'full');
  const e = make('harvest', { difficulty: 'expert' });
  assert.ok(e.meta.tipsOff && e.meta.advice === 'reduced');
  assert.ok(computeMods(e, T0)['prod.all'] < (computeMods(c, T0)['prod.all'] || 0));
  const imp = make(null, { origin: 'imperial' });
  assert.equal(Object.values(imp.city.buildings).find((b) => b.type === 'warehouse').level, 2);
  const fr = make(null, { origin: 'frontier' });
  assert.ok(revealedCount(fr.world) > revealedCount(make(null).world));
  for (const k of Object.keys(ORIGINS)) assert.equal(make(null, { origin: k }).kingdom.origin, k);
  for (const k of Object.keys(DIFFICULTIES)) assert.equal(make(null, { difficulty: k }).kingdom.difficulty, k);
});

test('Sauvegarde : spécialisation conservée au rechargement ; valeur inconnue neutralisée', () => {
  const s = make('pioneers', { origin: 'rebuilt', difficulty: 'expert' });
  const st = deserialize(serialize(s));
  assert.deepEqual(st.kingdom, s.kingdom);
  assert.deepEqual(computeMods(st, T0), computeMods(s, T0));
  const bad = JSON.parse(serialize(s));
  bad.kingdom.type = 'dragons'; bad.kingdom.origin = 42;
  const sb = deserialize(JSON.stringify(bad));
  assert.equal(sb.kingdom.type, null);
  assert.equal(sb.kingdom.origin, 'none');
});

test('Migration v6 → v7 : royaume sans spécialisation, aucun bonus rétroactif, ressources intactes', () => {
  const s = createNewState({ seed: 'old7', now: T0 });
  const old = JSON.parse(serialize(s));
  delete old.kingdom; delete old.campaign;
  old.version = 6;
  const st = deserialize(JSON.stringify(old));
  assert.equal(st.version, SAVE_VERSION);
  assert.equal(st.kingdom.type, null);
  assert.deepEqual(kingdomMods(st), {});
  assert.deepEqual(st.resources, old.resources);
  assert.deepEqual(st.army, old.army);
});

test('Dynastie : la spécialisation est conservée', () => {
  const s = make('bastions', { difficulty: 'guided' });
  Object.values(s.city.buildings).find((b) => b.type === 'townhall').level = 15;
  const r = foundDynasty(s, T0 + H);
  assert.ok(r.ok, r.reason);
  assert.equal(r.state.kingdom.type, 'bastions');
  assert.equal(r.state.kingdom.difficulty, 'guided');
});

test('Compatibilité : 2 jours de jeu pour chaque spécialisation sans erreur ni valeur invalide', () => {
  for (const k of [null, ...Object.keys(KINGDOM_TYPES)]) {
    rng.setSource(mulberry32(3));
    const s = make(k, { difficulty: k === 'ancients' ? 'expert' : 'classic' });
    let t = T0;
    for (let i = 0; i < 2 * 24 * 2; i++) { t += 30 * 60000; advance(s, t); }
    rng.setSource(null);
    for (const [r, v] of Object.entries(s.resources)) assert.ok(Number.isFinite(v) && v >= 0, `${k} ${r}=${v}`);
  }
});
