// Version 9 : noms du château et des avant-postes (validation, persistance, migration), identité stable,
// indicateurs d'amélioration, quêtes du royaume, missions dynamiques, événements de situation, conseiller,
// affinité des spécialités d'avant-poste.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createNewState, SAVE_VERSION } from '../src/core/state.js';
import { serialize, deserialize, exportSave, importSave } from '../src/core/save.js';
import { advance } from '../src/core/engine.js';
import { rng, mulberry32 } from '../src/core/rng.js';
import { sanitizeName, renameCastle, renameOutpost, renameKingdom, castleName, defaultCastleName, ensureIdentity } from '../src/systems/identity.js';
import { upgradeCheck, upgradeSummary, startUpgrade, startBuild, demolish } from '../src/systems/construction.js';
import { placementCheck } from '../src/systems/city.js';
import { claimTerritory, outpostUpgradeCheck, upgradeOutpost, setSpec, specAffinity, territoryTick, outpostStatus } from '../src/systems/territory.js';
import { questTick, questlineList, claimQuestStep, qlState } from '../src/systems/questlines.js';
import { missionsTick, missionList, claimDynMission, dropMission, missionState, missionVoidReason, MISSION_MAX } from '../src/systems/missions.js';
import { decisionsTick, resolveDecision } from '../src/systems/decisions.js';
import { analyze } from '../src/systems/advisor.js';
import { adviceList } from '../src/systems/guide.js';
import { key, setTerrain } from '../src/systems/world.js';
import { DILEMMAS } from '../src/data/dilemmas.js';

const T0 = Date.UTC(2026, 6, 1);
const H = 3600000;
const rich = (s, n = 50000) => { for (const r of Object.keys(s.resources)) s.resources[r] = n; return s; };
const th = (s) => Object.values(s.city.buildings).find((b) => b.type === 'townhall');
const free = (s, type, skip = 0) => { let k = 0; for (let y = 0; y < s.city.h; y++) for (let x = 0; x < s.city.w; x++) if (placementCheck(s, type, x, y).ok && k++ >= skip) return { x, y }; return null; };
const claimNear = (s, dx, dy) => { s.world.revealed.fill(1); return claimTerritory(s, s.world.capital.x + dx, s.world.capital.y + dy, T0); };
const build = (s, type, n = 1) => { for (let i = 0; i < n; i++) { const p = free(s, type); assert.ok(startBuild(s, type, p.x, p.y, T0).ok, type); advance(s, T0 + H); s.meta.lastTick = T0; } };

test('Noms : validation commune (vide, espaces, HTML, longueur)', () => {
  assert.equal(sanitizeName('   ').ok, false);
  assert.equal(sanitizeName('A').ok, false);
  assert.equal(sanitizeName('x'.repeat(33)).ok, false);
  assert.equal(sanitizeName('  Fort   d’Argent  ').value, 'Fort d’Argent');
  const v = sanitizeName('<img src=x onerror=alert(1)>Tour');
  assert.ok(v.ok && !/[<>]/.test(v.value), 'aucun chevron conservé');
  assert.equal(sanitizeName('<<>>').ok, false);
  assert.equal(sanitizeName(42).ok, false);
});

test('Château : nom par défaut cohérent, renommage, persistance (sauvegarde, export/import)', () => {
  const s = createNewState({ seed: 1, kingdomName: 'Valombre', now: T0 });
  assert.equal(castleName(s), 'Château de Valombre');
  assert.ok(s.identity.playerId && s.identity.kingdomId && s.identity.castleId, 'identifiants stables');
  assert.equal(renameCastle(s, '').ok, false);
  assert.ok(renameCastle(s, '  Bastion   des Cendres ').ok);
  assert.equal(castleName(s), 'Bastion des Cendres');
  const back = deserialize(serialize(s));
  assert.equal(castleName(back), 'Bastion des Cendres');
  assert.equal(back.identity.castleId, s.identity.castleId);
  assert.equal(castleName(importSave(exportSave(s))), 'Bastion des Cendres');
  // Renommer le royaume ne touche pas un nom de château choisi…
  assert.ok(renameKingdom(s, 'Nouvelle Aube').ok);
  assert.equal(castleName(s), 'Bastion des Cendres');
  // …mais le nom par défaut suit le royaume
  const t = createNewState({ seed: 2, kingdomName: 'Ardoise', now: T0 });
  renameKingdom(t, 'Brumeval');
  assert.equal(castleName(t), defaultCastleName('Brumeval'));
});

test('Avant-postes : noms différents, renommage indépendant, doublon refusé, persistance', () => {
  const s = rich(createNewState({ seed: 'op', now: T0 }));
  th(s).level = 9;
  const a = claimNear(s, 3, 0), b = claimNear(s, -3, 1), c = claimNear(s, 0, 4);
  assert.ok(a.ok && b.ok && c.ok);
  const names = Object.values(s.territories).map((t) => t.name);
  assert.equal(new Set(names).size, 3, 'trois noms distincts');
  assert.equal(new Set(Object.values(s.territories).map((t) => t.id)).size, 3, 'trois identifiants distincts');
  const k = key(s.world.capital.x + 3, s.world.capital.y);
  assert.ok(renameOutpost(s, k, 'Fort des Brumes').ok);
  assert.equal(renameOutpost(s, a.id === s.territories[k].id ? key(s.world.capital.x - 3, s.world.capital.y + 1) : k, 'Fort des Brumes').ok, false, 'pas deux fois le même nom');
  const other = Object.values(s.territories).filter((t) => t.name !== 'Fort des Brumes').map((t) => t.name);
  const back = importSave(exportSave(s));
  assert.equal(back.territories[k].name, 'Fort des Brumes');
  assert.deepEqual(Object.values(back.territories).filter((t) => t.name !== 'Fort des Brumes').map((t) => t.name), other, 'les autres noms sont inchangés');
  assert.ok(renameOutpost(s, s.territories[k].id, 'Fort-Neuf').ok, 'renommage par identifiant stable');
});

test('Migration v8 → v9 : identité ajoutée, avant-postes nommés, rien de perdu', () => {
  const s = rich(createNewState({ seed: 'legacy9', kingdomName: 'Vieux-Royaume', now: T0 }), 1234);
  th(s).level = 6;
  claimNear(s, 2, 2); claimNear(s, -2, 3);
  const old = JSON.parse(serialize(s));
  old.version = 8;
  delete old.identity; delete old.questlines; delete old.missions;
  for (const t of Object.values(old.territories)) { delete t.id; delete t.name; }
  const st = deserialize(JSON.stringify(old));
  assert.equal(st.version, SAVE_VERSION);
  assert.equal(castleName(st), 'Château de Vieux-Royaume', 'nom par défaut issu du royaume, pas d’un autre');
  assert.ok(st.identity.playerId.startsWith('pl_'));
  for (const t of Object.values(st.territories)) assert.ok(t.id && t.name, 'avant-poste ancien : identifiant et nom par défaut');
  assert.deepEqual(st.city.buildings, old.city.buildings);
  assert.equal(st.resources.wood, old.resources.wood);
  assert.deepEqual(Object.keys(st.territories), Object.keys(old.territories));
  assert.ok(st.questlines && Array.isArray(st.missions.active));
  // Un second chargement ne change plus les noms ni les identifiants
  const again = deserialize(serialize(st));
  assert.deepEqual(Object.values(again.territories).map((t) => [t.id, t.name]), Object.values(st.territories).map((t) => [t.id, t.name]));
  assert.equal(again.identity.castleId, st.identity.castleId);
  // Nom corrompu dans une sauvegarde modifiée à la main : remplacé par un nom valide
  const bad = JSON.parse(serialize(st));
  bad.identity.castleName = '<script>'; Object.values(bad.territories)[0].name = '   ';
  const fixed = deserialize(JSON.stringify(bad));
  assert.ok(!/[<>]/.test(castleName(fixed)), 'aucun HTML conservé');
  bad.identity.castleName = '  '; assert.equal(castleName(deserialize(JSON.stringify(bad))), 'Château de Vieux-Royaume', 'nom vide → nom par défaut');
  assert.ok(Object.values(fixed.territories)[0].name.trim().length > 1);
});

test('Améliorations : l’icône « prête » correspond exactement à ce que startUpgrade accepte', () => {
  const s = createNewState({ seed: 'up', now: T0 });
  const house = Object.values(s.city.buildings).find((b) => b.type === 'house');
  // Maison niv. 1 → 2 : hôtel de ville niv. 1 → verrouillée
  assert.equal(upgradeCheck(s, house.id).status, 'locked');
  assert.match(upgradeCheck(s, house.id).reasons[0], /Hôtel de ville niv\. 2/);
  th(s).level = 3;
  rich(s, 0);
  assert.equal(upgradeCheck(s, house.id).status, 'lack', 'ressources manquantes : pas présentée comme améliorable');
  assert.equal(startUpgrade(s, house.id, T0).ok, false);
  rich(s);
  const before = upgradeSummary(s).count;
  assert.equal(upgradeCheck(s, house.id).status, 'ready');
  assert.ok(startUpgrade(s, house.id, T0).ok);
  assert.equal(upgradeCheck(s, house.id).status, 'busy', 'chantier en cours : état réel, pas d’action proposée');
  assert.ok(upgradeSummary(s).count < before, 'le compteur se met à jour');
  // File pleine : planifiable mais pas « prête »
  const wh = Object.values(s.city.buildings).find((b) => b.type === 'warehouse');
  assert.equal(upgradeCheck(s, wh.id).status, 'queue');
  advance(s, T0 + 3 * H);
  assert.equal(house.level, 2);
  for (const u of upgradeSummary(s).ready) assert.equal(startUpgrade(createLike(s), u.bid, T0 + 3 * H).ok, true, u.name);
  th(s).level = 25;
  assert.equal(upgradeCheck(s, th(s).id).status, 'max');
});
// Copie indépendante pour vérifier chaque amélioration « prête » isolément
const createLike = (s) => deserialize(serialize(s));

test('Avant-postes : amélioration (prête / ressources / spécialité requise / maximum)', () => {
  const s = rich(createNewState({ seed: 'opup', now: T0 }));
  th(s).level = 6;
  claimNear(s, 3, 1);
  const k = key(s.world.capital.x + 3, s.world.capital.y + 1);
  assert.equal(outpostUpgradeCheck(s, k).status, 'locked');
  const spec = (await_specs(s, k));
  assert.ok(setSpec(s, k, spec).ok);
  assert.equal(outpostUpgradeCheck(s, k).status, 'ready');
  rich(s, 0);
  assert.equal(outpostUpgradeCheck(s, k).status, 'lack');
  rich(s);
  for (let i = 0; i < 4; i++) assert.ok(upgradeOutpost(s, k).ok);
  assert.equal(outpostUpgradeCheck(s, k).status, 'max');
});
function await_specs(s, k) { return { plain: 'farms', forest: 'logging', hills: 'quarry', mountain: 'mines', river: 'port', swamp: 'herbalists', ruins: 'digs', snow: 'coal', ash: 'crystals' }[s.territories[k].terrain]; }

test('Spécialités : l’affinité dépend des environs et reste plafonnée à +30 %', () => {
  const s = rich(createNewState({ seed: 'aff', now: T0 }));
  th(s).level = 6;
  const w = s.world, x = w.capital.x + 4, y = w.capital.y;
  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if (!w.pois[key(x + dx, y + dy)]) setTerrain(w, x + dx, y + dy, 'forest');
  w.revealed.fill(1);
  assert.ok(claimTerritory(s, x, y, T0).ok);
  const t = s.territories[key(x, y)];
  const forest = specAffinity(s, t, 'logging');
  assert.ok(forest.bonus > 0.25 && forest.bonus <= 0.3 + 1e-9, `affinité forestière ${forest.bonus}`);
  setSpec(s, key(x, y), 'logging');
  t.garrison = { spearman: 8 };
  s.resources.wood = 0;
  const wood0 = 0;
  territoryTick(s, 3600, T0 + 60000);
  assert.ok(s.resources.wood - wood0 >= 70 * 1.25, 'production majorée par l’affinité');
});

test('Quêtes du royaume : ouverture, étapes mesurées après ouverture, récompense unique', () => {
  const s = rich(createNewState({ seed: 'ql', now: T0 }), 5000);
  th(s).level = 5;
  questTick(s, T0);
  assert.ok(!qlState(s).active.dev_wood, 'pas de scierie : quête fermée');
  build(s, 'sawmill');
  questTick(s, T0 + 1);
  const a = qlState(s).active.dev_wood;
  assert.ok(a, 'quête ouverte avec la première scierie');
  let l = questlineList(s).find((x) => x.id === 'dev_wood');
  assert.equal(l.current.i, 0);
  assert.equal(claimQuestStep(s, 'dev_wood', 0).ok, false, 'pas encore accomplie');
  build(s, 'sawmill');
  questTick(s, T0 + 2);
  l = questlineList(s).find((x) => x.id === 'dev_wood');
  assert.ok(l.steps[0].done && l.current.i === 1);
  const gold = s.resources.gold;
  assert.ok(claimQuestStep(s, 'dev_wood', 0).ok);
  assert.ok(s.resources.gold > gold, 'récompense versée');
  assert.equal(claimQuestStep(s, 'dev_wood', 0).ok, false, 'une seule fois');
  // Une étape « depuis l'ouverture » ne compte pas ce qui a été fait avant
  s.stats.explored = 50; questTick(s, T0 + 3);
  const ex = qlState(s).active.ex_frontier;
  assert.ok(ex);
  assert.equal(questlineList(s).find((x) => x.id === 'ex_frontier').current.cur, 0);
  s.stats.explored = 60; questTick(s, T0 + 4);
  assert.ok(questlineList(s).find((x) => x.id === 'ex_frontier').steps[0].done);
  // Toutes les quêtes ont des étapes et des récompenses valides
  for (const q of questlineList(s)) { assert.ok(q.steps.length >= 3, q.id); for (const st of q.steps) assert.ok(st.reward && st.title, q.id); }
});

test('Missions dynamiques : réalisables, au plus 3, sans répétition, impossibles expliquées', () => {
  rng.setSource(mulberry32(7));
  try {
    const s = rich(createNewState({ seed: 'dyn', now: T0 }), 3000);
    th(s).level = 2;
    s.campaign.chapter = 1;
    assert.equal(missionsTick(s, T0 + 30 * 60000).length, 0, 'pas avant le chapitre 2');
    th(s).level = 4;
    s.campaign.chapter = 3;
    for (let i = 0; i < 12; i++) missionsTick(s, T0 + H + i * 25 * 60000);
    const list = missionList(s, T0 + 6 * H);
    assert.ok(list.length >= 1 && list.length <= MISSION_MAX);
    assert.equal(new Set(list.map((m) => m.tpl)).size, list.length, 'pas deux fois le même modèle');
    for (const m of list) { assert.ok(!m.done || m.cur >= m.target); assert.ok(m.title && m.desc && m.reward?.res, m.tpl); }
    // Accomplir une mission (on force sa condition) puis réclamer
    const m = missionState(s).active[0];
    m.kind = 'stat'; m.params = { stat: 'built' }; m.base = s.stats.built; m.target = 1;
    s.stats.built++;
    missionsTick(s, T0 + 7 * H);
    const gold = s.resources.gold;
    assert.ok(claimDynMission(s, m.id, T0 + 7 * H).ok);
    assert.ok(s.resources.gold > gold);
    assert.equal(missionState(s).recent[0], m.tpl, 'mémorisée pour éviter la répétition');
    // Mission devenue impossible : raison affichée, retrait gratuit
    const b = Object.values(s.city.buildings).find((x) => x.type === 'house');
    const v = { id: 'v1', tpl: 'producer', kind: 'level', params: { bid: b.id, name: 'Maisons', x: b.x, y: b.y }, target: b.level + 1, reward: { res: { gold: 1 } }, expires: T0 + 99 * H };
    missionState(s).active.push(v);
    demolish(s, b.id);
    assert.match(missionVoidReason(s, v), /n’existe plus/);
    missionState(s).rerollAt = T0 + 99 * H;
    assert.ok(dropMission(s, 'v1', T0 + 7 * H).ok, 'retrait gratuit malgré le délai de refus');
    // Refus volontaire : une fois toutes les 30 min
    missionState(s).rerollAt = 0;
    while (missionState(s).active.length < 2) missionsTick(s, (missionState(s).nextAt || 0) + 1);
    const [x1, x2] = missionState(s).active.filter((x) => !x.done);
    if (x1 && x2) { assert.ok(dropMission(s, x1.id, T0 + 8 * H).ok); assert.equal(dropMission(s, x2.id, T0 + 8 * H).ok, false); }
  } finally { rng.setSource(null); }
});

test('Événements de situation : proposés seulement s’ils ont du sens ; menace annoncée puis réelle', () => {
  rng.setSource(mulberry32(11));
  try {
    const s = rich(createNewState({ seed: 'ev9', now: T0 }), 10000);
    th(s).level = 5;
    // Sans marché, jamais de caravane
    for (let i = 0; i < 200; i++) { s.nextDilemma = 0; s.pending = []; s.lastDilemma = null; decisionsTick(s, T0 + i); assert.notEqual(s.pending[0]?.event, 'caravanArrives'); }
    // Avant-poste sans garnison : alerte 2 h avant, évacuation = aucun or volé
    claimNear(s, 3, 0);
    const k = key(s.world.capital.x + 3, s.world.capital.y);
    const t = s.territories[k];
    let p = null;
    for (let i = 0; i < 400 && !p; i++) { s.nextDilemma = 0; s.pending = []; s.lastDilemma = null; delete t.threatAt; decisionsTick(s, T0 + i); if (s.pending[0]?.event === 'outpostThreat') p = s.pending[0]; }
    assert.ok(p, 'menace proposée');
    assert.ok(t.threatAt > T0 && t.threatAt <= T0 + 2 * H + 400);
    assert.ok(outpostStatus(s, t, T0 + 1000).reasons.some((r) => /attaque est annoncée/.test(r)));
    const choice = DILEMMAS.outpostThreat.choices.findIndex((c) => c.fx.outpostEvac);
    assert.ok(resolveDecision(s, p.id, choice, T0 + 1000).ok);
    const gold = s.resources.gold;
    territoryTick(s, 60, t.threatAt + 1);
    assert.ok(!t.threatAt, 'la menace a frappé à l’échéance');
    assert.ok(s.resources.gold >= gold - 1, 'réserves évacuées : pas d’or pillé');
  } finally { rng.setSource(null); }
});

test('Conseiller : dangers réels, action concrète, rien d’impossible', () => {
  const s = rich(createNewState({ seed: 'adv9', now: T0 }));
  th(s).level = 4;
  const k = Object.values(s.world.pois).find((p) => p.type === 'kingdom');
  s.raids.push({ id: 'r', rival: k.rival, name: k.name, from: { x: k.x, y: k.y }, army: { bandit: 3 }, start: T0, arrive: T0 + 600000 });
  const recs = analyze(s, T0).recs;
  assert.ok(recs.some((r) => r.sev === 'bad' && /Raid de/.test(r.text)));
  assert.ok(recs.some((r) => /Aucune production de bois/.test(r.text)), 'pas de scierie signalé');
  const idle = recs.find((r) => r.id === 'idle-build');
  assert.ok(idle && idle.action === 'up-list', 'action concrète : liste des améliorations');
  rich(s, 0);
  const idle2 = analyze(s, T0).recs.find((r) => r.id === 'idle-build');
  assert.ok(!idle2.action, 'aucune action proposée quand rien n’est abordable');
  assert.ok(adviceList(s, T0).length <= 30);
});

test('Compatibilité : partie neuve v9, avance de 12 h hors ligne avec quêtes, missions et noms', () => {
  rng.setSource(mulberry32(3));
  try {
    const s = rich(createNewState({ seed: 'off9', now: T0 }), 4000);
    th(s).level = 5; s.campaign.chapter = 3;
    claimNear(s, 2, -2);
    renameCastle(s, 'Haut-Castel');
    missionsTick(s, T0); questTick(s, T0);
    advance(s, T0 + 12 * H);
    missionsTick(s, T0 + 12 * H); questTick(s, T0 + 12 * H);
    const back = deserialize(serialize(s));
    assert.equal(castleName(back), 'Haut-Castel');
    assert.deepEqual(back.missions.active.map((m) => m.id), s.missions.active.map((m) => m.id));
    assert.deepEqual(Object.keys(back.questlines.active), Object.keys(s.questlines.active));
    ensureIdentity(back);
    assert.equal(castleName(back), 'Haut-Castel');
  } finally { rng.setSource(null); }
});

test('Performances : synthèse des améliorations sur un grand royaume', () => {
  const s = rich(createNewState({ seed: 'perf9', now: T0 }));
  th(s).level = 12;
  let n = 0;
  for (let y = 0; y < s.city.h && n < 120; y++) for (let x = 0; x < s.city.w && n < 120; x++) if (placementCheck(s, 'house', x, y).ok) { s.city.buildings['p' + n] = { id: 'p' + n, type: n % 2 ? 'house' : 'farm', level: 1 + (n % 9), x, y }; n++; }
  const t = performance.now();
  for (let i = 0; i < 20; i++) upgradeSummary(s);
  const ms = (performance.now() - t) / 20;
  assert.ok(ms < 25, `upgradeSummary ${ms.toFixed(2)} ms pour ${n} bâtiments`);
});
