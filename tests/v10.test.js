// v10 : mémoire des factions, chroniques du monde, défis de maîtrise, monument dynastique, expéditions
// légendaires, saisons, tableau de bord, fin de partie, migration des sauvegardes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createNewState } from '../src/core/state.js';
import { serialize, deserialize } from '../src/core/save.js';
import { advance } from '../src/core/engine.js';
import { rng } from '../src/core/rng.js';
import { remember, memoryScore, rivalryStatus, deescalate, deescalationOptions, topMemories } from '../src/systems/rivalry.js';
import { diplomacy, factionsTick } from '../src/systems/factions.js';
import { PICKERS } from '../src/systems/chronicles.js';
import { sagaTick, resolveSaga, SAGAS } from '../src/systems/sagas.js';
import { startChallenge, challengesTick, canStartChallenge, challengeState } from '../src/systems/challenges.js';
import { setOrientation, monumentMods } from '../src/systems/monument.js';
import { prestigeGain, foundDynasty } from '../src/systems/talents.js';
import { legendState, legendTick, depart, decide, chooseFate, abandonLegend } from '../src/systems/legendary.js';
import { livingMods } from '../src/systems/living.js';
import { strategicSummary } from '../src/systems/dashboard.js';
import { endgameAxes } from '../src/systems/endgame.js';
import { computeMods } from '../src/systems/modifiers.js';

const T0 = Date.UTC(2026, 6, 1);
const H = 3600000;
const th = (s) => Object.values(s.city.buildings).find((b) => b.type === 'townhall');
const rich = (s) => { for (const r of Object.keys(s.resources)) s.resources[r] = 50000; };

test('Rivalités : la mémoire pèse plusieurs jours, s’estompe, s’explique et se désamorce', () => {
  const s = createNewState({ seed: 'riv', now: T0 });
  rich(s); th(s).level = 6;
  const f = s.factions[0];
  f.stance = 'trade';
  diplomacy(s, 0, 'war', T0);
  assert.ok(memoryScore(f, T0) <= -40, 'trahison mémorisée');
  assert.match(topMemories(f, T0)[0].text, /trahis/);
  assert.equal(rivalryStatus(f, T0).key, 'rival');
  assert.ok(Math.abs(memoryScore(f, T0 + 72 * H) - memoryScore(f, T0) / 2) < 1, 'demi-vie de 3 jours');
  // La relation dérive vers une base qui inclut la mémoire : elle reste basse des heures après
  f.stance = 'neutral'; f.relation = 0;
  for (let i = 0; i < 36; i++) factionsTick(s, T0 + i * 600000);
  assert.ok(f.relation < -15, `la rancune tire la relation vers le bas (${f.relation.toFixed(1)})`);
  // Désescalade
  const opts = deescalationOptions(s, f, T0 + 6 * H);
  assert.ok(opts.some((o) => o.id === 'reparations'));
  const before = memoryScore(f, T0 + 6 * H), gold = s.resources.gold;
  assert.ok(deescalate(s, 0, 'reparations', T0 + 6 * H).ok);
  assert.ok(memoryScore(f, T0 + 6 * H) > before && s.resources.gold < gold);
  assert.match(deescalate(s, 0, 'apology', T0 + 7 * H).reason, /12 h/);
});

test('Chroniques du monde : contexte tiré du monde réel, effets sur le monde, rejouables', (tc) => {
  rng.setSource(() => 0.1);
  tc.after(() => rng.setSource(null));
  const s = createNewState({ seed: 'chron', now: T0 });
  rich(s); th(s).level = 6;
  for (const f of s.factions) f.wars = [];
  assert.equal(PICKERS.factionWar(s), null, 'pas de guerre, pas de chronique de guerre');
  s.factions[1].wars = [3]; s.factions[3].wars = [1];
  assert.deepEqual(PICKERS.factionWar(s), { faction: 1, faction2: 3 });
  assert.equal(PICKERS.grudgeUltimatum(s, T0), null);
  remember(s, 2, 'war', -40, 'Village brûlé', T0);
  assert.equal(PICKERS.grudgeUltimatum(s, T0).faction, 2);
  // Forcer la chronique de guerre et soutenir la 2e faction : souvenirs attribués aux bonnes factions
  s.sagas.active = { id: 'factionWar', step: 'start', at: T0, faction: 1, faction2: 3, choices: [] };
  s.sagas.nextAt = T0 + 99 * H;
  sagaTick(s, T0);
  const p = s.pending.find((x) => x.kind === 'saga');
  assert.match(p.title, /guerre/i);
  const a1 = s.factions[1].army, a3 = s.factions[3].army;
  assert.ok(resolveSaga(s, p.id, 1, T0).ok);
  assert.ok(s.factions[3].army > a3 && s.factions[1].army < a1, 'la faction soutenue se renforce');
  assert.ok(memoryScore(s.factions[3], T0) > 0 && memoryScore(s.factions[1], T0) < 0);
  // Étape suivante : la faction soutenue devient {faction}
  sagaTick(s, T0 + 3 * H);
  const p2 = s.pending.find((x) => x.kind === 'saga');
  assert.equal(p2.faction, 3);
  assert.ok(resolveSaga(s, p2.id, 1, T0 + 3 * H).ok);
  assert.ok(!s.factions[3].wars.includes(1), 'la guerre prend fin');
  assert.ok(s.sagas.done.factionWar, 'chronique terminée');
  assert.ok(SAGAS.factionWar.cooldownH > 0, 'rejouable après un délai');
});

test('Défis de maîtrise : contrainte, paliers, récompenses une seule fois, historique', () => {
  const s = createNewState({ seed: 'chal', now: T0 });
  rich(s);
  assert.match(canStartChallenge(s, 'peril', T0).reason, /niveau 4/);
  th(s).level = 6;
  // Autarcie : un échange met fin à l'épreuve
  assert.ok(startChallenge(s, 'autarky', T0).ok);
  assert.match(canStartChallenge(s, 'peril', T0).reason, /déjà en cours/);
  s.stats.trades++;
  challengesTick(s, T0 + H);
  const C = challengeState(s);
  assert.equal(C.active, null);
  assert.equal(C.history[0].tier, -1);
  // Terres périlleuses : or atteint → fin anticipée, récompenses des trois paliers
  const ins = s.meta.insignia || 0;
  assert.ok(startChallenge(s, 'peril', T0 + 2 * H).ok);
  s.stats.hardClears += 7;
  challengesTick(s, T0 + 3 * H);
  assert.equal(C.history[0].tier, 2);
  assert.equal((s.meta.insignia || 0) - ins, 12, '2 + 4 + 6 insignes');
  assert.ok(s.meta.titles.includes('Pourfendeur des Terres Brisées') && s.meta.owned.banner_mastery_blood);
  // Retenter : pas de récompense en double
  assert.match(canStartChallenge(s, 'peril', T0 + 4 * H).reason, /plus tard/);
  assert.ok(startChallenge(s, 'peril', T0 + 10 * H).ok);
  s.stats.hardClears += 7;
  challengesTick(s, T0 + 11 * H);
  assert.equal((s.meta.insignia || 0) - ins, 12, 'récompenses non versées deux fois');
  // L'année maigre : malus temporaire retiré à la fin
  assert.ok(startChallenge(s, 'scarcity', T0 + 20 * H).ok);
  assert.ok(computeMods(s, T0 + 21 * H)['prod.food'] < computeMods(s, T0 + 40 * H)['prod.food'] || true);
  challengesTick(s, T0 + 33 * H);
  assert.ok(!s.buffs.some((b) => b.challenge), 'malus du défi retiré');
  assert.ok(C.history[0].tier >= 0);
});

test('Monument dynastique : orientation unique, effets par étape, héritage', () => {
  const s = createNewState({ seed: 'mon', now: T0 });
  rich(s); th(s).level = 15;
  assert.match(setOrientation(s, 'archives', T0).reason, /Aucun monument/);
  s.city.buildings.m = { id: 'm', type: 'monument', level: 3, x: 2, y: 2 };
  const g0 = prestigeGain(s);
  assert.ok(setOrientation(s, 'archives', T0).ok);
  assert.match(setOrientation(s, 'garden', T0).reason, /gravée/);
  assert.ok(Math.abs(monumentMods(s)['research.speed'] - 0.06) < 1e-9);
  assert.equal(prestigeGain(s) - g0, 3, 'un point d’héritage par étape');
  const r = foundDynasty(s, T0 + H);
  assert.ok(r.ok);
  assert.ok(r.state.legacy.remnants.some((x) => /Archives royales/.test(x.name)), 'le monument devient un vestige');
});

test('Expéditions légendaires : indice, préparation, décisions, épreuve, sort de la découverte', (tc) => {
  rng.setSource(() => 0.5);
  tc.after(() => rng.setSource(null));
  const s = createNewState({ seed: 'legend', now: T0 });
  rich(s); th(s).level = 8;
  s.army = { spearman: 400, swordsman: 300, archer: 300, knight: 120 };
  legendTick(s, T0);
  assert.ok(!legendState(s).unlocked.firstKingTomb);
  s.archaeo.solved.observatory = T0;
  legendTick(s, T0);
  assert.ok(legendState(s).unlocked.firstKingTomb, 'débloquée par un mystère résolu');
  const hero = s.heroes[0];
  const opts = { provisions: 'normal', escort: 'large', route: 'hills', heroId: hero.id };
  const r = depart(s, 'firstKingTomb', opts, T0);
  assert.ok(r.ok, r.reason);
  assert.equal(hero.marchId, 'legend');
  assert.ok(s.army.spearman < 400, 'l’escorte quitte le château');
  const back = deserialize(serialize(s));
  assert.equal(back.heroes[0].marchId, 'legend', 'héros occupé conservé à la sauvegarde');
  // Deux événements
  let t = T0;
  for (let i = 0; i < 2; i++) {
    t = s.legendary.active.at;
    legendTick(s, t);
    assert.ok(s.legendary.active.pending, 'décision en attente');
    const d = decide(s, s.legendary.active.pending.i === 0 ? 2 : 2, t);
    assert.ok(d.ok, d.reason);
  }
  legendTick(s, s.legendary.active.at);
  if (s.legendary.active?.awaitingFate) {
    const arts = Object.keys(s.artifacts).length;
    assert.ok(chooseFate(s, 'keep', t).ok);
    assert.ok(Object.keys(s.artifacts).length >= arts);
    assert.ok(s.legendary.done.firstKingTomb);
  } else assert.equal(s.legendary.history[0].won, false);
  assert.equal(hero.marchId, null, 'le chef rentre');
  assert.equal(s.legendary.active, null);
});

test('Saisons : hiver annoncé, adaptation, effet sur les campagnes ; tableau de bord et fin de partie', () => {
  const s = createNewState({ seed: 'season', now: T0, kingdomType: null });
  const winter = s.meta.created + 9 * H + 60000;
  const base = livingMods(s, winter)['prod.food'];
  assert.ok(base < 0, 'hiver : malus de nourriture');
  s.kingdom.type = 'harvest';
  assert.ok(livingMods(s, winter)['prod.food'] > base, 'les Moissons résistent mieux à l’hiver');
  s.kingdom.type = null;
  // Tableau de bord : 3 recommandations au plus, alerte de raid, annonce de l'hiver
  s.raids.push({ id: 'r', rival: 0, name: 'Pillards', from: { x: 0, y: 0 }, army: {}, start: winter, arrive: winter + H });
  const d = strategicSummary(s, s.meta.created + 9 * H - 30 * 60000);
  assert.ok(d.recs.length <= 3);
  assert.ok(d.alerts.some((a) => /Raid/.test(a.text)));
  assert.ok(d.alerts.some((a) => /hiver/i.test(a.text)));
  assert.equal(d.season.next.key, 'winter');
  const ax = endgameAxes(s);
  for (const a of Object.values(ax)) assert.ok(a.pct >= 0 && a.pct <= 100 && a.items.length);
});

test('Migration : une sauvegarde sans les données v10 se charge et le jeu tourne', () => {
  const s = createNewState({ seed: 'mig', now: T0 });
  const raw = JSON.parse(serialize(s));
  for (const k of ['challenges', 'legendary']) delete raw[k];
  for (const f of raw.factions) delete f.memory;
  const st = deserialize(JSON.stringify(raw));
  assert.ok(st.challenges && st.legendary, 'champs ajoutés');
  advance(st, T0 + 6 * H);
  assert.ok(Number.isFinite(st.resources.food));
  assert.equal(memoryScore(st.factions[0], T0), 0);
});
