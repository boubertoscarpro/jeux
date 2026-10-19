// v19 « L'Art du siège » : protections, production et arsenal, contres dégressifs et bornés, limites, bataille flanc
// par flanc puis la cour, déterminisme, consommation et récupération des engins, renseignement de la tour de guet,
// adaptation des raids, plans enregistrés, ordre « maintenir le stock », mode simplifié, migration d'une vraie
// sauvegarde v18 et performance.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { deserialize, serialize } from '../src/core/save.js';
import { rng, mulberry32 } from '../src/core/rng.js';
import { computeMods } from '../src/systems/modifiers.js';
import { planMarch, sendMarch } from '../src/systems/marches.js';
import { resolveRaid, raidArmy } from '../src/systems/rivals.js';
import { unitStatus } from '../src/systems/army.js';
import { castleState } from '../src/systems/castle.js';
import { addOrder, ordersTick, automationLevel } from '../src/systems/automation.js';
import { setA11y } from '../src/systems/a11y.js';
import * as SG from '../src/systems/siege.js';
import { POI_TYPES } from '../src/data/world.js';
import { ATTACK_ENGINES, DEFENSE_ENGINES, SIEGE_RULES, COUNTER_CAP } from '../src/data/siege.js';

const raw = (f) => gunzipSync(readFileSync(new URL(`./fixtures/${f}.json.gz`, import.meta.url))).toString();
const load = (f) => deserialize(raw(f));
const T = Date.UTC(2026, 6, 1, 12);
const sum = (o) => Object.values(o || {}).reduce((a, b) => a + b, 0);
const kingdom = (s) => Object.values(s.world.pois).find((p) => p.type === 'kingdom');
// Un atelier de siège (aucune sauvegarde de test n'en a)
function withWorkshop(s, level = 5) {
  s.city.buildings.b_ws19 = { id: 'b_ws19', type: 'workshop', level, x: 0, y: 0 };
  return s;
}
function watch(s, level) { for (const b of Object.values(s.city.buildings)) if (b.type === 'watchtower') b.level = level; return s; }
const army = { spearman: 1200, swordsman: 400, archer: 600, lightcav: 200 };
const plan1 = (flank, engines = {}, share = 1) => ({ waves: [{ left: { share: 0, engines: {} }, front: { share: 0, engines: {} }, right: { share: 0, engines: {} }, [flank]: { share, engines } }] });

test('Protections : le château répartit l’ancien bonus de muraille en muraille, porte et douves', () => {
  const s = load('save-fin');
  const mods = computeMods(s, T);
  const old = (mods['wall.bonus'] || 0) * (1 + (mods['wall.pct'] || 0));
  const P = SG.castleProtections(s, mods);
  assert.ok(P.moat > 0 && P.wall > 0, 'muraille et douves comptent');
  assert.equal(P.gate, P.wall, 'la porte suit la muraille');
  assert.ok(Math.abs(P.wall + P.moat - old) < 1e-9, 'sans engin, un flanc vaut l’ancien bonus');
  for (const f of ['left', 'front', 'right']) assert.ok(Math.abs(SG.flankEffects({}, {}, P, f).fort - old) < 1e-9, `${f} : même protection qu’avant`);
  assert.equal(P.oneFlank, false, 'muraille 14 : trois flancs');
  const m = load('save-milieu');
  assert.equal(SG.castleProtections(m).oneFlank, true, 'sans muraille de pierre : un seul front');
  const t = SG.targetProtections(0.3, { moat: 2 });
  assert.ok(Math.abs(t.moat - 0.08) < 1e-9 && Math.abs(t.wall - 0.22) < 1e-9 && t.gate === t.wall);
});

test('Camps sans enceinte : pas de siège, et les engins y sont refusés', () => {
  const s = withWorkshop(load('save-fin'));
  SG.siegeState(s).arsenal.attack.ladders = 5;
  const camp = Object.values(s.world.pois).find((p) => POI_TYPES[p.type]?.kind === 'danger' && !POI_TYPES[p.type].dungeon);
  assert.ok(camp, 'un camp sur la carte');
  const r = planMarch(s, { type: 'attack', x: camp.x, y: camp.y, units: { spearman: 10 }, siegePlan: plan1('left', { ladders: 2 }) });
  assert.equal(r.ok, false);
  assert.match(r.reason, /camp sans enceinte/);
  assert.equal(SG.siegeState(s).arsenal.attack.ladders, 5, 'les engins restent à l’arsenal');
});

test('Production et arsenal : déblocage, file, capacité, annulation remboursée à 80 %', () => {
  const s = withWorkshop(load('save-fin'), 1);
  assert.equal(SG.engineUnlocked(s, 'ladders'), true);
  assert.equal(SG.engineUnlocked(s, 'mantlets'), false, 'mantelets : atelier niv. 3');
  assert.equal(SG.startEngines(s, 'tower', 1).ok, false, 'tour : atelier niv. 10');
  const wood0 = s.resources.wood;
  const r = SG.startEngines(s, 'ladders', 5, T);
  assert.ok(r.ok);
  assert.equal(s.resources.wood, wood0 - 300, 'coût payé : 5 × 60 bois');
  const Q = SG.siegeState(s).queue.attack;
  assert.equal(Q.length, 1);
  SG.siegeTick(s, Q[0].end - 1);
  assert.equal(SG.siegeState(s).arsenal.attack.ladders || 0, 0, 'pas encore prêtes');
  SG.siegeTick(s, Q[0].end);
  assert.equal(SG.siegeState(s).arsenal.attack.ladders, 5, 'prêtes à l’arsenal');
  // Capacité : 20 + 10 × niveau, file comprise
  const cap = SG.arsenalCap(s, 'attack');
  assert.equal(cap, 30);
  const r2 = SG.startEngines(s, 'ladders', 100, T);
  assert.equal(r2.n, cap - 5, 'la commande est ramenée à la place libre');
  assert.equal(SG.startEngines(s, 'ladders', 1, T).ok, false, 'arsenal plein');
  const q = SG.siegeState(s).queue.attack[0];
  const w = s.resources.wood;
  SG.cancelEngines(s, 'attack', q.id);
  assert.equal(s.resources.wood, w + Math.floor(q.cost.wood * 0.8), '80 % remboursés');
  // Défense : l'atelier des remparts suit la muraille
  assert.equal(SG.defenseWorkshop(s), 14);
  assert.ok(SG.startEngines(s, 'stones', 2, T).ok);
  s.city.fort.wall = 3;
  assert.equal(SG.startEngines(s, 'stakes', 1, T).ok, false, 'pieux : muraille niv. 5');
});

test('Contres et effets dégressifs : bornés, et chaque engin de plus rapporte moins', () => {
  const P = { wall: 0.6, gate: 0.6, moat: 0.2, oneFlank: false };
  const red = (n) => 1 - SG.flankEffects({ ladders: n }, {}, P, 'left').keep.wall;
  const r5 = red(5), r10 = red(10), r50 = red(50), r500 = red(500);
  assert.ok(r5 > 0 && r10 > r5 && r50 > r10, 'plus d’échelles, plus de réduction');
  assert.ok(r10 - r5 > r50 - r10 - 1e-9 || (r50 - r10) / 40 < (r10 - r5) / 5, 'rendement décroissant');
  assert.ok(r500 <= ATTACK_ENGINES.ladders.effect.cap + 1e-9, 'jamais au-delà du plafond');
  // Les pierres contrent les échelles, sans jamais annuler plus de 80 %
  const withStones = 1 - SG.flankEffects({ ladders: 10 }, { stones: 6 }, P, 'left').keep.wall;
  assert.ok(withStones < r10, 'les pierres réduisent l’effet des échelles');
  const many = SG.flankEffects({ ladders: 10 }, { stones: 999 }, P, 'left');
  assert.ok(many.aEff.ladders >= 10 * (1 - COUNTER_CAP) - 1e-9, 'contre plafonné à 80 %');
  // Les mantelets neutralisent les pierres : les échelles retrouvent de leur effet
  const mant = 1 - SG.flankEffects({ ladders: 10, mantlets: 6 }, { stones: 6 }, P, 'left').keep.wall;
  assert.ok(mant > withStones, 'mantelets contre pierres');
  // Le bélier n'agit qu'au front, les échelles qu'aux flancs ; la herse renforce la porte
  assert.equal(SG.flankEffects({ ram: 10 }, {}, P, 'left').keep.wall, 1);
  const herse = SG.flankEffects({}, { portcullis: 3 }, P, 'front');
  assert.ok(herse.herse > 0 && herse.fort > P.gate + P.moat);
  // Poix : gêne l'infanterie ; pieux : la cavalerie (bonus bornés)
  const fx = SG.flankEffects({}, { pitch: 50, stakes: 50 }, P, 'front');
  assert.ok(fx.attMods['class.infantry.atk'] >= DEFENSE_ENGINES.pitch.effect.infantry - 1e-9 && fx.attMods['class.infantry.atk'] < 0);
  assert.ok(fx.attMods['class.cavalry.atk'] >= DEFENSE_ENGINES.stakes.effect.cavalry - 1e-9);
});

test('Limites : par flanc, par vague, flancs permis, stock', () => {
  const s = withWorkshop(load('save-fin'), 2);
  const S = SG.siegeState(s);
  S.arsenal.defense.stones = 100;
  const lim = SG.defenseLimit(s);
  assert.equal(lim, SIEGE_RULES.defensePerFlank(14));
  assert.equal(SG.postEngine(s, 'left', 'stones', 100).n, lim, 'au plus la limite du flanc');
  assert.equal(SG.postEngine(s, 'right', 'stones', 100).n, Math.min(lim, 100 - lim), 'pas plus que le stock');
  assert.equal(SG.postEngine(s, 'front', 'stones', 100).n, Math.max(0, Math.min(lim, 100 - 2 * lim)), 'le stock posé ailleurs ne se pose pas deux fois');
  S.arsenal.defense.portcullis = 3;
  assert.equal(SG.postEngine(s, 'left', 'portcullis', 1).ok, false, 'la herse va au front');
  const m = load('save-milieu'); m.city.fort.wall = 2;
  SG.siegeState(m).arsenal.defense.stones = 10;
  assert.equal(SG.postEngine(m, 'left', 'stones', 2).ok, false, 'un seul front sous la muraille 5');
  S.arsenal.attack = { ladders: 30, ram: 3 };
  const alim = SG.attackLimit(s);
  assert.equal(SG.validatePlan(s, plan1('left', { ladders: alim + 1 })).ok, false, 'trop d’engins sur un flanc');
  assert.equal(SG.validatePlan(s, plan1('left', { ladders: alim })).ok, true);
  assert.equal(SG.validatePlan(s, plan1('left', { ram: 2 })).ok, false, 'le bélier va au front');
  assert.equal(SG.validatePlan(s, plan1('front', { ram: 4 })).ok, false, 'pas assez de béliers');
  assert.ok(SG.maxWaves(s) >= 1 && SG.maxWaves(s) <= SIEGE_RULES.maxWaves);
});

test('Bataille : chaque flanc se résout, puis la cour, avec un bonus par flanc percé', () => {
  const prot = { wall: 0.3, gate: 0.3, moat: 0.1, oneFlank: false };
  const def = { units: { spearman: 300, archer: 200 }, shares: { left: 0.25, front: 0.25, right: 0.25, yard: 0.25 }, engines: {}, prot, mods: {}, formation: 'shieldwall', label: 'D' };
  const waves = SG.planToWaves(plan1('left', { ladders: 6 }), { spearman: 3000, swordsman: 800 });
  const r = SG.siegeBattle({ waves, mods: {}, formation: 'assault', label: 'A' }, def, { seed: 7 });
  assert.equal(r.report.flanks.left.breached, true, 'le flanc gauche cède');
  assert.ok(r.report.flanks.left.fight, 'combat sur le flanc gauche');
  assert.equal(r.report.flanks.front.fight, undefined, 'front non attaqué');
  assert.ok(r.report.yard, 'puis la cour');
  assert.equal(r.report.yard.bonus, SIEGE_RULES.yardBonus[1]);
  assert.equal(r.winner, 'attacker');
  assert.ok(r.key.length > 10, 'une phrase clé');
  // Les flancs non attaqués ont envoyé du renfort, la cour aussi : le flanc gauche avait toute la garnison ou presque
  assert.ok(sum(r.report.flanks.left.fight.defenders) > 0.8 * 500);
  // Défense victorieuse : pas de cour
  const weak = SG.siegeBattle({ waves: SG.planToWaves(plan1('front'), { spearman: 60 }), mods: {}, formation: 'assault', label: 'A' }, def, { seed: 7 });
  assert.equal(weak.winner, 'defender');
  assert.equal(weak.report.yard, null);
  // Un seul front : tout passe par la porte
  const one = SG.siegeBattle({ waves, mods: {}, label: 'A' }, { ...def, prot: { ...prot, oneFlank: true } }, { seed: 7 });
  assert.deepEqual(Object.keys(one.report.flanks), ['front']);
});

test('Déterminisme : même graine, même bataille ; graines différentes, issues variées', () => {
  const prot = { wall: 0.5, gate: 0.5, moat: 0.1, oneFlank: false };
  const def = { units: { spearman: 900, archer: 500 }, shares: { left: 0.25, front: 0.25, right: 0.25, yard: 0.25 }, engines: { front: { pitch: 6 }, left: { stones: 4 } }, prot, mods: {}, label: 'D' };
  const att = () => ({ waves: SG.planToWaves({ waves: [0, 1].map(() => ({ left: { share: 0.3, engines: { ladders: 4 } }, front: { share: 0.4, engines: { ram: 4, mantlets: 2 } }, right: { share: 0.3, engines: {} } })) }, army), mods: {}, label: 'A' });
  const a = SG.siegeBattle(att(), def, { seed: 1234 });
  rng.setSource(mulberry32(99)); // le hasard du moteur ne change rien : la graine du siège fait foi
  const b = SG.siegeBattle(att(), def, { seed: 1234 });
  assert.deepEqual(a, b);
  const outs = new Set();
  for (let i = 0; i < 30; i++) outs.add(JSON.stringify(SG.siegeBattle(att(), def, { seed: i }).attLosses));
  assert.ok(outs.size > 1, 'la graine change le détail du combat');
});

test('Consommation et récupération : engins de défense consommés, engins d’attaque récupérés en partie', () => {
  const s = load('save-fin');
  const S = SG.siegeState(s);
  S.arsenal.defense = { pitch: 10, stones: 10 };
  SG.postEngine(s, 'front', 'pitch', 8);
  SG.postEngine(s, 'left', 'stones', 6);
  rng.setSource(mulberry32(5));
  const p = kingdom(s);
  const armyR = raidArmy(s, p, T);
  const raid = { id: 'r19', rival: p.rival, name: p.name, from: { x: p.x, y: p.y }, army: armyR, start: T - 1, arrive: T, seen: true, flank: 'front', flankSeen: true, ...SG.raidEngines(s, p, armyR, T, 'front') };
  resolveRaid(s, raid, T);
  const rep = s.reports[0];
  assert.ok(rep.result.report.flanks.front.fight, 'le front est attaqué');
  assert.ok(S.arsenal.defense.pitch < 10, 'la poix a servi');
  assert.equal(S.arsenal.defense.stones, 10, 'les pierres du flanc calme restent');
  assert.equal(S.posted.left.stones, 6);
  // Attaque gagnée : 40 % des engins engagés reviennent
  const prot = { wall: 0.2, gate: 0.2, moat: 0, oneFlank: false };
  const r = SG.siegeBattle({ waves: SG.planToWaves(plan1('front', { ram: 10 }), { spearman: 4000 }), mods: {}, label: 'A' }, { units: { spearman: 100 }, shares: { left: 0.25, front: 0.25, right: 0.25, yard: 0.25 }, engines: {}, prot, mods: {}, label: 'D' }, { seed: 3 });
  assert.equal(r.winner, 'attacker');
  assert.equal(r.engines.attack.used.ram, 10);
  assert.equal(r.engines.attack.recovered.ram, 10 * SIEGE_RULES.recoverWin);
  // Défaite : tout est perdu
  const l = SG.siegeBattle({ waves: SG.planToWaves(plan1('front', { ram: 10 }), { spearman: 20 }), mods: {}, label: 'A' }, { units: { spearman: 2000 }, shares: { left: 0.25, front: 0.25, right: 0.25, yard: 0.25 }, engines: {}, prot, mods: {}, label: 'D' }, { seed: 3 });
  assert.equal(l.engines.attack.lost.ram, 10);
  assert.equal(l.engines.attack.recovered.ram, undefined);
});

test('Marche : les engins partent avec l’armée et quittent l’arsenal', () => {
  const s = withWorkshop(load('save-fin'), 5);
  const S = SG.siegeState(s);
  S.arsenal.attack = { ram: 6, mantlets: 3 };
  const p = kingdom(s);
  p.garrison ||= { militia: 100 };
  const r = sendMarch(s, { type: 'attack', x: p.x, y: p.y, units: { spearman: 500 }, siegePlan: plan1('front', { ram: 4, mantlets: 2 }) }, T);
  assert.ok(r.ok, r.reason);
  assert.deepEqual(r.march.engines, { ram: 4, mantlets: 2 });
  assert.equal(S.arsenal.attack.ram, 2);
  assert.equal(S.arsenal.attack.mantlets, 1);
});

test('Tour de guet : troupes, puis engins, puis flanc, puis chiffres exacts', () => {
  const s = load('save-fin');
  const raid = { army: { militia: 333 }, engines: { ram: 7, mantlets: 3 }, mainFlank: 'left', flank: 'left', adapt: 'test', seen: false, flankSeen: false };
  const at = (lvl) => SG.raidIntel(watch(s, lvl), raid);
  assert.equal(at(2).troops, null);
  assert.equal(at(3).troops, 335, 'arrondi');
  assert.equal(at(3).engines, null);
  assert.ok(at(4).engines && at(4).adapt === 'test');
  assert.equal(at(4).flank, null);
  assert.equal(at(5).flank, 'left');
  assert.equal(at(8).troops, 333, 'exact');
  assert.deepEqual(at(8).engines, { ram: 7, mantlets: 3 });
  // Renseignement imparfait sur une place adverse non espionnée
  const exact = SG.targetIntel(0.5, {}, true);
  const fuzzy = SG.targetIntel(0.5, {}, false, 77);
  assert.equal(exact.exact, true);
  assert.equal(fuzzy.exact, false);
  assert.ok(Math.abs(fuzzy.engines.front.pitch - exact.engines.front.pitch) <= Math.ceil(exact.engines.front.pitch * 0.2) + 1);
});

test('Adaptation : un seigneur qui a vu de la poix à la porte revient par un flanc avec des mantelets', () => {
  const s = load('save-fin');
  const p = Object.values(s.world.pois).find((x) => x.type === 'kingdom' && x.rival % 3 === 0) || kingdom(s);
  const a0 = SG.raidEngines(s, p, { militia: 1000 }, T);
  if (p.rival % 3 === 0) assert.equal(a0.mainFlank, 'front', 'style « par la porte »');
  SG.remember(s, p.rival, { front: { pitch: 8 }, left: { stones: 1 }, right: { stones: 5 } });
  const a1 = SG.raidEngines(s, p, { militia: 1000 }, T);
  if (p.rival % 3 === 0) {
    assert.equal(a1.mainFlank, 'left', 'par le flanc le moins garni de pierres');
    assert.ok(a1.adapt && /poix/.test(a1.adapt), 'adaptation expliquée');
    assert.ok(a1.engines.mantlets >= 3, 'avec des mantelets');
  }
  // Archères vues : une tour de siège (hôtel de ville ≥ 10) ; crochets vus : plus de tour
  SG.remember(s, p.rival, { front: { pitch: 8 }, left: { archers: 6, stones: 4 } });
  assert.ok(SG.raidEngines(s, p, { militia: 1000 }, T).engines.tower >= 1, 'une tour contre les archères');
  SG.remember(s, p.rival, { front: { pitch: 8 }, left: { archers: 6, stones: 4, hooks: 3 } });
  assert.equal(SG.raidEngines(s, p, { militia: 1000 }, T).engines.tower, undefined);
  // Les raids consacrent une part de leur puissance aux engins : moins de troupes
  assert.ok(sum(a1.army) < 1000);
});

test('Plans : 3 de défense et 3 d’attaque, rechargés à l’identique', () => {
  const s = load('save-fin');
  const S = SG.siegeState(s);
  S.arsenal.defense = { stones: 20, pitch: 20, archers: 10 };
  SG.stepShare(s, 'front', 0.2);
  SG.postEngine(s, 'front', 'pitch', 7);
  SG.postEngine(s, 'left', 'stones', 4);
  const shares = { ...castleState(s).flanks };
  assert.ok(SG.savePlan(s, 'defense', 1, 'Porte', null).ok);
  SG.applyDefense(s, { shares: { left: 0.25, front: 0.25, right: 0.25, yard: 0.25 }, posted: { left: {}, front: {}, right: {} } });
  const r = SG.loadDefensePlan(s, 1);
  assert.ok(r.ok && r.name === 'Porte');
  assert.deepEqual(castleState(s).flanks, shares);
  assert.equal(S.posted.front.pitch, 7);
  assert.equal(S.posted.left.stones, 4);
  assert.equal(SG.savePlan(s, 'defense', 3, 'x').ok, false, 'trois emplacements');
  assert.ok(SG.savePlan(s, 'attack', 0, 'Échelles', plan1('left', { ladders: 4 })).ok);
  assert.deepEqual(S.plans.attack[0].plan, plan1('left', { ladders: 4 }));
  // Défense conseillée : le flanc annoncé d'abord, des engins face aux engins annoncés
  watch(s, 8);
  const adv = SG.advisedDefense(s, { army: { militia: 100 }, engines: { ladders: 6, mantlets: 2 }, mainFlank: 'right', flank: 'right' });
  assert.ok(adv.shares.right > adv.shares.left);
  assert.ok(adv.posted.right.stones > 0 && adv.posted.right.archers > 0);
  // Attaque conseillée : un plan valide
  const s2 = withWorkshop(load('save-fin'), 5);
  SG.siegeState(s2).arsenal.attack = { ladders: 10, ram: 6, mantlets: 6, fascines: 4 };
  const ap = SG.advisedAttackPlan(s2, SG.targetIntel(0.5, { moat: 2 }, true), { waves: 2 });
  assert.ok(SG.validatePlan(s2, ap.plan).ok);
  assert.ok(ap.why.length > 0);
});

test('Ordre « maintenir le stock » : l’intendant relance la fabrication sous le minimum', () => {
  const s = load('save-fin');
  assert.ok(SG.setMinStock(s, 'stones', 12).ok);
  const r = SG.keepStock(s, T);
  assert.ok(r.ok);
  assert.equal(SG.siegeState(s).queue.defense.reduce((a, q) => a + q.n, 0), 12);
  assert.equal(SG.keepStock(s, T).ok, false, 'déjà en fabrication : rien de plus');
  if (automationLevel(s) >= 4) {
    const s2 = load('save-fin');
    SG.setMinStock(s2, 'pitch', 5);
    s2.orders = [];
    assert.ok(addOrder(s2, { name: 'Arsenal', cond: { type: 'every', minutes: 30 }, action: { type: 'engineStock' } }).ok);
    ordersTick(s2, T);
    assert.equal(SG.siegeState(s2).queue.defense.reduce((a, q) => a + q.n, 0), 5);
  }
});

test('Mode simplifié : la défense conseillée s’applique d’elle-même quand un raid est repéré', () => {
  const s = load('save-fin');
  watch(s, 8);
  setA11y(s, 'simple', true);
  SG.siegeState(s).arsenal.defense = { stones: 10, pitch: 10 };
  s.raids = [{ id: 'x', rival: 0, name: 'X', from: { x: 0, y: 0 }, army: { militia: 100 }, engines: { ram: 4 }, start: T, arrive: T + 6e5, flank: 'front', mainFlank: 'front', seen: true, flankSeen: true }];
  SG.siegeTick(s, T);
  assert.ok(SG.siegeState(s).posted.front.pitch > 0, 'poix posée face au bélier');
  assert.equal(s.raids[0].autoDefended, true);
});

test('Migration v18 → v19 : béliers, outils posés et répartition conservés', () => {
  const d = JSON.parse(raw('save-armurerie'));
  d.army.ram = 7;
  d.castle.tools = { stones: 'left', pitch: 'front' };
  d.castle.flanks = { left: 0.4, front: 0.3, right: 0.1, yard: 0.2 };
  delete d.siege;
  const s = deserialize(JSON.stringify(d));
  const S = SG.siegeState(s);
  assert.equal(s.army.ram, undefined, 'plus d’unité bélier');
  assert.equal(S.arsenal.attack.ram, 7, 'les béliers sont à l’arsenal');
  assert.equal(S.arsenal.defense.stones, 5);
  assert.equal(S.posted.left.stones, 5, 'outil posé → engins posés sur le même flanc');
  assert.equal(S.posted.front.pitch, 5);
  assert.deepEqual(s.castle.tools, {});
  assert.deepEqual(castleState(s).flanks, { left: 0.4, front: 0.3, right: 0.1, yard: 0.2 }, 'répartition conservée');
  // Pas de double migration à la relecture
  const again = deserialize(serialize(s));
  assert.equal(SG.siegeState(again).arsenal.attack.ram, 7);
  assert.equal(SG.siegeState(again).arsenal.defense.stones, 5);
  // Le bélier ne se forme plus comme unité ; un bélier d'une ancienne file rejoint l'arsenal
  assert.equal(unitStatus(again, 'ram').ok, false);
  again.army.ram = 2;
  SG.siegeTick(again, T);
  assert.equal(SG.siegeState(again).arsenal.attack.ram, 9);
});

test('Performance : un siège complet (4 vagues × 3 flancs + cour) reste instantané', () => {
  const prot = { wall: 0.6, gate: 0.6, moat: 0.2, oneFlank: false };
  const def = { units: { spearman: 6000, swordsman: 2000, archer: 4000, knight: 500 }, shares: { left: 0.25, front: 0.25, right: 0.25, yard: 0.25 }, engines: { left: { stones: 10, archers: 5, hooks: 3 }, front: { pitch: 10, portcullis: 3 }, right: { stones: 10, archers: 5 } }, prot, mods: {}, label: 'D' };
  const plan = { waves: [0, 1, 2, 3].map(() => ({ left: { share: 1, engines: { ladders: 5, mantlets: 3, tower: 1 } }, front: { share: 1, engines: { ram: 5, mantlets: 3, fireArrows: 2 } }, right: { share: 1, engines: { ladders: 5, fascines: 3 } } })) };
  const big = { spearman: 9000, swordsman: 3000, archer: 5000, lightcav: 2000, knight: 1000, catapult: 30 };
  const t0 = performance.now();
  const N = 50;
  for (let i = 0; i < N; i++) SG.siegeBattle({ waves: SG.planToWaves(plan, big), mods: {}, label: 'A' }, def, { seed: i });
  const per = (performance.now() - t0) / N;
  assert.ok(per < 25, `${per.toFixed(2)} ms par siège complet`);
  // Raids en série contre le château
  const s = load('save-fin');
  const json = serialize(s);
  const t1 = performance.now();
  for (let i = 0; i < 20; i++) {
    const x = deserialize(json);
    rng.setSource(mulberry32(i));
    const p = kingdom(x);
    const a = raidArmy(x, p, T);
    resolveRaid(x, { id: 'p' + i, rival: p.rival, name: p.name, from: { x: p.x, y: p.y }, army: a, start: T - 1, arrive: T, flank: 'front', ...SG.raidEngines(x, p, a, T) }, T);
  }
  assert.ok((performance.now() - t1) / 20 < 400, 'un raid (lecture de sauvegarde comprise) en moins de 0,4 s');
});
