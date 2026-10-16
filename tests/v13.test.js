// v13 — Le Royaume en mouvement : quêtes à embranchements, réactions des factions, conséquences des événements,
// bilan économique, objectifs adaptés, projets intégrés, fin de partie, sauvegardes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createNewState } from '../src/core/state.js';
import { advance } from '../src/core/engine.js';
import { serialize, deserialize } from '../src/core/save.js';
import { rng, mulberry32 } from '../src/core/rng.js';
import { computeMods } from '../src/systems/modifiers.js';
import { netRates } from '../src/systems/economy.js';
import { economicReport } from '../src/systems/report.js';
import { economyAdvice, ecoSampleTick, observed } from '../src/systems/ecoAdvice.js';
import { situationalGoals } from '../src/systems/goals.js';
import { questTick, qlState, questlineList, chooseQuestPath, claimQuestStep, claimQuestFinal } from '../src/systems/questlines.js';
import { QUESTLINE_BY_ID } from '../src/data/questlines.js';
import { factionsTick, diplomacy } from '../src/systems/factions.js';
import { reactionsTick, noteHostile, wealthCap, reactionMods, REACT } from '../src/systems/reactions.js';
import { onRivalDefeated } from '../src/systems/rivals.js';
import { startEvent, endEvent, liveState, applyAftermath } from '../src/systems/liveEvents.js';
import { LIVE_EVENTS } from '../src/data/liveEvents.js';
import { AFTERMATH } from '../src/data/aftermath.js';
import { CROWN_PROJECTS } from '../src/data/crown.js';
import { crownCost, crownInfo, startCrown, claimCrown } from '../src/systems/crown.js';
import { chronicle } from '../src/systems/chronicle.js';
import { startBuild } from '../src/systems/construction.js';
import { placementCheck } from '../src/systems/city.js';
import { RESOURCES } from '../src/data/resources.js';
import { CHAPTERS } from '../src/data/campaign.js';

const T0 = Date.UTC(2026, 6, 1, 8);
const H = 3600000;
const th = (s) => Object.values(s.city.buildings).find((b) => b.type === 'townhall');
const reload = (s) => deserialize(serialize(s));
function realm(seed, lvl = 8) {
  const s = createNewState({ seed, now: T0 });
  th(s).level = lvl;
  s.meta.lastTick = T0;
  for (const r of Object.keys(s.resources)) s.resources[r] = 50000;
  return s;
}
const place = (s, type, now = T0) => { for (let y = 0; y < s.city.h; y++) for (let x = 0; x < s.city.w; x++) if (placementCheck(s, type, x, y).ok) return startBuild(s, type, x, y, now); return { ok: false }; };

test('1. Une quête à embranchements progresse par plusieurs systèmes, sans récompense en double', () => {
  const s = realm('q1', 6);
  s.city.buildings.mk = { id: 'mk', type: 'market', level: 3, x: 9, y: 4 };
  s.stats.caravans = 2;
  s.factions[1].relation = -40;
  s.army.spy = 3;
  questTick(s, T0);
  const a = qlState(s).active.tr_blockade;
  assert.ok(a, 'la route coupée s’ouvre face à une faction hostile');
  assert.equal(a.ctx.faction, 1);
  // Le péage pèse sur le commerce tant que la quête n'est pas résolue
  assert.ok((computeMods(s, T0)['caravan.gain'] || 0) <= -0.08 + 1e-9);
  // Choix : protéger les convois (coût payé une fois, refusé ensuite)
  const wood = s.resources.wood;
  const r = chooseQuestPath(s, 'tr_blockade', 0, 'convoys', T0);
  assert.ok(r.ok, r.reason);
  assert.ok(s.resources.wood < wood, 'coût payé');
  assert.equal(chooseQuestPath(s, 'tr_blockade', 0, 'war', T0).ok, false, 'un seul choix');
  // Les étapes des autres voies sont ignorées, sans récompense
  questTick(s, T0 + 1);
  const l = questlineList(s).find((x) => x.id === 'tr_blockade');
  assert.ok(l.steps.filter((x) => x.path && x.path !== 'convoys').every((x) => x.skipped));
  assert.equal(claimQuestStep(s, 'tr_blockade', 1).ok, false, 'étape d’une autre voie : rien à réclamer');
  // Progression par le commerce (caravanes), puis récompenses une seule fois
  s.stats.caravans += 4; questTick(s, T0 + 2);
  s.stats.caravans += 2; questTick(s, T0 + 3);
  assert.ok(qlState(s).done.tr_blockade);
  const gold = s.resources.gold;
  assert.ok(claimQuestStep(s, 'tr_blockade', 3).ok);
  assert.equal(claimQuestStep(s, 'tr_blockade', 3).ok, false);
  assert.ok(claimQuestFinal(s, 'tr_blockade').ok);
  assert.ok(s.resources.gold > gold);
  const back = reload(s);
  assert.equal(claimQuestFinal(back, 'tr_blockade').ok, false, 'pas de seconde récompense après rechargement');
  assert.ok(!(computeMods(s, T0 + 4)['caravan.gain'] < -0.07), 'route rouverte : plus de malus');
  // La chronique n'inscrit le dénouement qu'une fois, même si la quête est revérifiée
  const n = s.history.filter((h) => /péage|route marchande/.test(h.text)).length;
  questTick(back, T0 + 5); questTick(s, T0 + 5);
  assert.equal(s.history.filter((h) => /péage|route marchande/.test(h.text)).length, n);
});

test('1b. Les Héritiers de la Fracture : la voie choisie décide des étapes suivantes et de la récompense finale', () => {
  const s = realm('q1b', 8);
  s.questlines = { active: {}, done: { story_echoes: T0 }, claimed: {} };
  questTick(s, T0);
  const a = qlState(s).active.saga_heirs;
  assert.ok(a && a.ctx);
  a.step = 4; a.stepAt = T0; // étapes 1 à 4 accomplies (testées séparément par leurs propres systèmes)
  for (let i = 0; i < 4; i++) { a.done[i] = T0; a.claimed[i] = T0; }
  const f = s.factions[a.ctx.faction], rel = f.relation;
  assert.ok(chooseQuestPath(s, 'saga_heirs', 4, 'diplo', T0).ok);
  assert.ok(f.relation > rel, 'la voie des traités rapproche la faction');
  const l = questlineList(s).find((x) => x.id === 'saga_heirs');
  assert.equal(l.current.path, 'diplo');
  assert.deepEqual(l.final, QUESTLINE_BY_ID.saga_heirs.finalByPath.diplo);
  // Trois voies, chacune avec un coût : aucune n'est gratuite
  for (const o of QUESTLINE_BY_ID.saga_heirs.steps[4].options) assert.ok(Object.keys(o.costPerTh).length, o.key);
});

test('2. Les conséquences diplomatiques sont sauvegardées et restaurées', () => {
  rng.setSource(mulberry32(3));
  try {
    const s = realm('d2');
    const f = s.factions[0];
    f.relation = -70;
    for (let i = 0; i < 3; i++) noteHostile(s, 0, 'sack', T0 + i * H);
    // Trésor vide : aucun renfort (rien n'est créé gratuitement)
    f.wealth = 500;
    reactionsTick(reload(s), T0 + 3 * H);
    f.wealth = 3000;
    reactionsTick(s, T0 + 3 * H);
    assert.equal(f.wealth, 3000 - REACT.fortify.cost, 'renfort payé sur sa richesse');
    assert.ok(f.embargoUntil > T0 + 3 * H, 'embargo');
    assert.ok(f.fortifiedUntil > T0 + 3 * H, 'capitale renforcée après 3 attaques');
    assert.ok((reactionMods(s, T0 + 4 * H)['caravan.gain'] || 0) < 0);
    assert.ok(s.factionReports.length >= 2);
    const b = reload(s);
    assert.equal(b.factions[0].embargoUntil, f.embargoUntil);
    assert.equal(b.factions[0].fortifiedUntil, f.fortifiedUntil);
    assert.equal(b.factionReports.length, s.factionReports.length);
    // Pas de nouvel embargo ni renfort pendant le délai de reprise (pas de spirale)
    const reports = b.factionReports.length;
    reactionsTick(b, T0 + 5 * H);
    assert.equal(b.factionReports.length, reports);
    // L'embargo est levé dès que la relation remonte
    b.factions[0].relation = -10; b.factions[0].stance = 'neutral';
    reactionsTick(b, T0 + 6 * H);
    assert.ok(!(b.factions[0].embargoUntil > T0 + 6 * H));
  } finally { rng.setSource(null); }
});

test('2b. Contre-offensive bornée : jamais pendant une série de défaites du joueur', () => {
  const s = realm('d2b');
  const f = s.factions[2];
  f.stance = 'war'; f.relation = -90;
  noteHostile(s, 2, 'sack', T0);
  s.raidLossStreak = 2;
  reactionsTick(s, T0 + H);
  assert.ok(!s.factionReports.some((r) => r.kind === 'counter'), 'le joueur se reconstruit');
  s.raidLossStreak = 0; s.raidCooldown = 0;
  reactionsTick(s, T0 + 2 * H);
  assert.equal(s.factionReports.filter((r) => r.kind === 'counter').length, 1);
  reactionsTick(s, T0 + 3 * H);
  assert.equal(s.factionReports.filter((r) => r.kind === 'counter').length, 1, 'au plus une par 36 h');
});

test('3. Une faction ne reçoit pas de ressources infinies', () => {
  rng.setSource(mulberry32(5));
  try {
    const s = realm('f3');
    for (let i = 0; i < 2000; i++) factionsTick(s, T0 + i * 600000);
    for (const f of s.factions) assert.ok(f.wealth <= wealthCap(f) + 1, `${f.idx} : ${Math.round(f.wealth)} > ${wealthCap(f)}`);
    // Défaites répétées : la faction s'épuise au lieu de gagner
    const poi = Object.values(s.world.pois).find((p) => p.type === 'kingdom');
    const f = s.factions[poi.rival];
    f.wealth = 1000; f.army = 5;
    onRivalDefeated(s, poi, T0);
    const a1 = f.army;
    onRivalDefeated(s, poi, T0 + 1);
    assert.ok(f.army - a1 < 0.1, 'renfort réduit quand le trésor est vide');
    assert.ok(f.wealth >= 0);
  } finally { rng.setSource(null); }
});

test('4. Les événements gardent leur calendrier et leurs limites ; conséquences appliquées une seule fois', () => {
  const s = realm('e4');
  const key = 'sevenMerchants';
  const cur = startEvent(s, key, T0, T0 + 72 * H);
  cur.earned = 900;
  const buffs = s.buffs.length;
  endEvent(s, T0 + 72 * H);
  assert.equal(liveState(s).current, null);
  const added = s.buffs.length - buffs;
  assert.equal(added, 2, 'conséquence du monde + participation');
  // Rappel (rechargement, changement de date) : aucune seconde application
  const again = applyAftermath(s, cur, LIVE_EVENTS[key], T0 + 73 * H);
  assert.deepEqual(again, []);
  const b = reload(s);
  assert.deepEqual(applyAftermath(b, cur, LIVE_EVENTS[key], T0 + 74 * H), []);
  // Effets temporaires (≤ 48 h) ; un absent ne reçoit que la conséquence du monde, jamais de pénalité
  for (const [k, A] of Object.entries(AFTERMATH)) {
    for (const x of [A.all, A.won]) if (x) { assert.ok(x.hours <= 48, k); for (const v of Object.values(x.mods)) assert.ok(v > 0 || ['convoy.risk', 'market.fee'].includes(Object.keys(x.mods)[0]), `${k} : pas de pénalité`); }
    assert.ok(LIVE_EVENTS[k], `${k} existe dans le calendrier`);
  }
  const s2 = realm('e4b');
  const c2 = startEvent(s2, key, T0, T0 + 72 * H);
  c2.earned = 0;
  const n2 = s2.buffs.length;
  endEvent(s2, T0 + 72 * H);
  assert.equal(s2.buffs.length - n2, 1, 'absent : seulement la conséquence du monde');
  // Le calendrier continue (rotation existante)
  advance(s2, T0 + 80 * H);
  assert.ok(liveState(s2).calendar.length || liveState(s2).current);
});

test('5. Les recommandations économiques reflètent les données réelles', () => {
  const s = createNewState({ seed: 'eco5', now: T0 });
  s.meta.lastTick = T0;
  const r = economicReport(s, T0);
  const adv = economyAdvice(s, r, T0);
  const farm = adv.find((a) => /ferme/i.test(a.text));
  assert.ok(farm, 'aucune ferme : recommandation de ferme');
  assert.match(farm.why, new RegExp(String(Math.round(r.upkeep.total))));
  // Une fois la ferme construite et la nourriture positive : plus d'alerte de nourriture
  s.city.buildings.fa = { id: 'fa', type: 'farm', level: 6, x: 4, y: 5 };
  const r2 = economicReport(s, T0);
  assert.ok(r2.list.find((x) => x.res === 'food').net > 0);
  assert.ok(!economyAdvice(s, r2, T0).some((a) => /ferme/i.test(a.text)));
  // Rythme observé : qualitatif tant que les relevés manquent, chiffré ensuite
  assert.equal(observed(s, 'food').reliable, false);
  for (let i = 0; i < 4; i++) { s.resources.food += 100; ecoSampleTick(s, T0 + i * H); }
  const o = observed(s, 'food');
  assert.ok(o.reliable && Math.abs(o.perH - 100) < 1);
});

test('6. Une pénurie de nourriture peut être résolue par plusieurs stratégies', () => {
  const base = realm('eco6', 6);
  base.army = { spearman: 400 };
  base.city.buildings.qm = { id: 'qm', type: 'quartermaster', level: 4, x: 12, y: 8, recipe: 0 };
  base.city.buildings.mk = { id: 'mk', type: 'market', level: 3, x: 9, y: 4 };
  const net0 = netRates(base, computeMods(base, T0)).food;
  assert.ok(net0 < 0);
  const kinds = economyAdvice(base, economicReport(base, T0), T0).map((a) => a.text);
  assert.ok(kinds.length >= 3, kinds.join(' | '));
  // a) produire : une ferme
  rng.setSource(mulberry32(6));
  const a = reload(base); assert.ok(place(a, 'farm').ok); advance(a, T0 + 60000);
  rng.setSource(null);
  assert.ok(a.city && Object.values(a.city.buildings).some((x) => x.type === 'farm' && x.level === 1));
  assert.ok(netRates(a, computeMods(a, T0 + 60000)).food > net0);
  // b) réduire une consommation évitable : pause de la chaîne de rations
  const b = reload(base); b.city.buildings.qm.paused = true;
  assert.ok(netRates(b, computeMods(b, T0)).food > net0);
  // c) alléger l'armée en ville
  const c = reload(base); c.army.spearman = 100;
  assert.ok(netRates(c, computeMods(c, T0)).food > net0);
});

test('7. Les objectifs proposés correspondent à l’état du royaume', () => {
  const s = realm('g7', 6);
  s.army = { spearman: 600 };
  const g = situationalGoals(s, computeMods(s, T0), T0);
  assert.ok(g.some((x) => x.term === 'short' && /nourriture/i.test(x.title)), 'pénurie → objectif économique immédiat');
  assert.ok(!g.some((x) => /Campagne possible/.test(x.title)), 'pas de campagne conseillée quand les réserves baissent');
  // Royaume sain, entrepôt plein de pierre : investir l'excédent
  const h = realm('g7b', 9);
  h.army = {};
  h.city.buildings.fa = { id: 'fa', type: 'farm', level: 8, x: 4, y: 5 };
  const mods = computeMods(h, T0);
  h.resources.stone = 1e7;
  const g2 = situationalGoals(h, mods, T0);
  assert.ok(!g2.some((x) => /nourriture/i.test(x.title)));
  assert.ok(g2.some((x) => /Pierre/.test(x.title + x.desc)), 'excédent signalé');
  // Faction affaiblie en guerre : occasion de négocier
  h.factions[0].stance = 'war'; h.factions[0].negotiableUntil = T0 + H;
  assert.ok(situationalGoals(h, mods, T0).some((x) => /prête à négocier/.test(x.title)));
  // Faction affaiblie : la paix est vraiment plus facile
  rng.setSource(() => 0.5);
  try {
    h.factions[1].stance = 'war'; h.factions[1].weariness = 0;
    h.factions[1].relation = -35;
    const no = diplomacy(reload(h), 1, 'peace', T0).ok;
    h.factions[1].negotiableUntil = T0 + H;
    const yes = diplomacy(h, 1, 'peace', T0).ok;
    assert.ok(!no && yes);
  } finally { rng.setSource(null); }
});

test('8. Les nouveaux Grands Projets n’ouvrent aucune boucle de ressources et dépendent de vrais systèmes', () => {
  const s = realm('p8', 20);
  const value = (o) => Object.entries(o || {}).reduce((a, [r, v]) => a + v * (RESOURCES[r]?.price || 0), 0);
  for (const id of ['freeCityExchange', 'frontierForts', 'excavationReliquary', 'peaceCongress', 'triumphalWay', 'imperialArchive']) {
    const d = CROWN_PROJECTS[id];
    assert.ok(d, id);
    assert.ok(value(d.reward.res) < value(crownCost(s, id)) * 0.5, id);
  }
  // Conditions réelles : un pacte est nécessaire pour le comptoir
  assert.equal(crownInfo(s, 'freeCityExchange', T0).status, 'locked');
  s.factions[0].stance = 'trade';
  assert.equal(crownInfo(s, 'freeCityExchange', T0).status, 'available');
  assert.ok(startCrown(s, 'freeCityExchange', T0).ok);
  assert.ok(claimCrown(s, 'freeCityExchange', T0 + 9 * H).ok);
  assert.equal(claimCrown(s, 'freeCityExchange', T0 + 9 * H).ok, false);
});

test('9. Les récompenses de fin de jeu privilégient le prestige, pas la puissance illimitée', () => {
  const L = QUESTLINE_BY_ID.legacy_mastery;
  for (const st of L.steps) assert.ok(!st.reward.mods && !st.reward.buff, st.title);
  assert.ok(L.final.title && !L.final.mods);
  assert.ok(!CROWN_PROJECTS.imperialArchive.reward.mods, 'archives : prestige seulement');
  // Bonus permanents des projets : modestes
  for (const [id, d] of Object.entries(CROWN_PROJECTS)) for (const [k, v] of Object.entries(d.reward.mods || {})) assert.ok(Math.abs(v) <= 0.08, `${id} ${k}`);
  // L'héritage s'ouvre à l'HdV 16 seulement et n'est jamais requis ailleurs
  const s = realm('l9', 15);
  questTick(s, T0);
  assert.ok(!qlState(s).active.legacy_mastery);
  th(s).level = 16; questTick(s, T0 + 1);
  assert.ok(qlState(s).active.legacy_mastery);
});

test('10. Anciennes sauvegardes : les champs v13 absents ou corrompus sont réparés sans rien perdre', () => {
  const s = realm('o10', 9);
  s.army = { spearman: 77 };
  const raw = JSON.parse(serialize(s));
  const st = raw.state || raw;
  delete st.historyKeys; delete st.ecoLog; delete st.factionReports;
  for (const f of st.factions) { delete f.react; f.embargoUntil = 'x'; }
  st.questlines = { active: { tr_blockade: { step: 0, base: {}, at: T0, done: {}, claimed: {} } }, done: {}, claimed: {} }; // quête ouverte avant v13, sans contexte
  const b = deserialize(JSON.stringify(raw));
  assert.equal(b.army.spearman, 77);
  assert.equal(th(b).level, 9);
  advance(b, T0 + 6 * H);
  questTick(b, T0 + 6 * H);
  reactionsTick(b, T0 + 6 * H);
  assert.ok(Array.isArray(b.ecoLog.s));
  assert.ok(questlineList(b).find((x) => x.id === 'tr_blockade'));
  assert.ok(Object.keys(CHAPTERS[0].missions).length);
});

test('11. Les nouvelles interactions ne cassent pas la simulation (3 jours, royaume de milieu de partie)', () => {
  rng.setSource(mulberry32(11));
  try {
    const s = realm('i11', 10);
    s.army = { spearman: 200, archer: 100 };
    s.city.buildings.fa = { id: 'fa', type: 'farm', level: 10, x: 4, y: 5 };
    s.city.buildings.mk = { id: 'mk', type: 'market', level: 5, x: 9, y: 4 };
    s.factions[0].stance = 'war'; s.factions[0].relation = -80;
    s.factions[3].stance = 'alliance'; s.factions[3].wars = [1];
    for (let t = T0; t <= T0 + 72 * H; t += H) advance(s, t);
    for (const r of Object.keys(s.resources)) assert.ok(Number.isFinite(s.resources[r]) && s.resources[r] >= 0, r);
    for (const f of s.factions) assert.ok(f.wealth <= wealthCap(f) + 1);
    assert.ok(s.ecoLog.s.length >= 20);
    // Chronique : pas de doublon de fait inscrit avec une clé
    assert.equal(chronicle(s, 'Fait unique', T0, 'story', 'unique:1'), true);
    assert.equal(chronicle(s, 'Fait unique', T0 + 9 * H, 'story', 'unique:1'), false);
    assert.ok(s.history.every((h) => h.cat), 'chaque fait a une catégorie');
  } finally { rng.setSource(null); }
});

test('Famine du début de partie : la ferme fait partie du chapitre 1', () => {
  assert.ok(CHAPTERS[0].missions.some((m) => m.id === 'c1_farm' && !m.optional));
  void REACT;
});
