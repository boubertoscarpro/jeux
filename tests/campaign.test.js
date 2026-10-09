// Parcours guidé : chapitres, détection automatique, récompenses uniques, missions du jour, conseiller,
// entraînement, hors ligne, migration et cohérence avec l'interface.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createNewState } from '../src/core/state.js';
import { advance } from '../src/core/engine.js';
import { serialize, deserialize } from '../src/core/save.js';
import { rng, mulberry32 } from '../src/core/rng.js';
import { CHAPTERS, LONG_TERM, DAILY_POOL } from '../src/data/campaign.js';
import { campaignTick, claimMission, claimChapter, chapterInfo, objectives, trainingBattle, royalDaily, royalDailyList, claimRoyalDaily, missionProgress, MISSIONS, markVisited, campaignState } from '../src/systems/campaign.js';
import { adviceList, snoozeAdvice, dismissAdvice, setAdviceLevel, SNOOZE_MS } from '../src/systems/guide.js';
import { startClear, startBuild } from '../src/systems/construction.js';
import { terrainAt, placementCheck } from '../src/systems/city.js';

const T0 = Date.UTC(2026, 5, 1, 8);
const H = 3600000;
const fresh = (seed = 'cp', extra = {}) => createNewState({ seed, now: T0, ...extra });
const rubble = (s) => { for (let y = 0; y < s.city.h; y++) for (let x = 0; x < s.city.w; x++) if (terrainAt(s, x, y) === 'rubble') return { x, y }; return null; };
const place = (s, type) => { for (let y = 0; y < s.city.h; y++) for (let x = 0; x < s.city.w; x++) if (placementCheck(s, type, x, y).ok) return startBuild(s, type, x, y, T0); return { ok: false }; };
const viewIds = new Set(fs.readdirSync('src/ui/views').flatMap((f) => [...fs.readFileSync(`src/ui/views/${f}`, 'utf8').matchAll(/^ {2}id: '([a-zA-Z]+)'/gm)].map((m) => m[1])));

test('Données : 8 chapitres, missions uniques, chaque chapitre a des missions principales et une récompense', () => {
  assert.equal(CHAPTERS.length, 8);
  assert.deepEqual(CHAPTERS.map((c) => c.title), ['Le dernier hameau', 'Nourrir le peuple', 'Les routes des Terres Brisées', 'La première garnison', 'La connaissance est une arme', 'Les marchés et les alliances', 'Les secrets de la Fracture', 'Le royaume prend son envol']);
  const ids = [...CHAPTERS.flatMap((c) => c.missions.map((m) => m.id)), ...LONG_TERM.map((m) => m.id)];
  assert.equal(new Set(ids).size, ids.length, 'identifiants uniques');
  for (const c of CHAPTERS) {
    assert.ok(c.missions.some((m) => !m.optional) && Object.keys(c.reward).length && c.intro && c.tip);
    for (const m of c.missions) assert.ok(m.title && m.desc && m.reward && (m.view || m.action), m.id);
  }
  // Le chapitre 4 propose un exercice sans risque
  assert.ok(CHAPTERS[3].missions.some((m) => m.action === 'cp-training'));
});

test('Interface : chaque « Y aller » mène à un écran existant, chaque action existe (rien d’inventé)', () => {
  const hud = fs.readFileSync('src/ui/hud.js', 'utf8');
  for (const m of [...Object.values(MISSIONS), ...DAILY_POOL]) {
    if (m.view) assert.ok(viewIds.has(m.view), `${m.id} → ${m.view}`);
    if (m.action) assert.ok(hud.includes(`'${m.action}':`), `${m.id} → ${m.action}`);
  }
});

test('Chapitre 1 : détection automatique, récompense réclamable une seule fois, ouverture du chapitre 2', () => {
  const s = fresh();
  assert.equal(s.campaign.chapter, 1);
  assert.equal(claimMission(s, 'q_clear', T0).ok, false, 'non atteint');
  assert.equal(claimMission(s, 'q_farm', T0 + 1).ok, false, 'chapitre 2 pas encore ouvert');
  const r = rubble(s);
  assert.ok(startClear(s, r.x, r.y, T0).ok);
  advance(s, T0 + H);
  campaignTick(s, T0 + H);
  assert.ok(s.campaign.done.q_clear, 'détectée');
  const wood = s.resources.wood;
  assert.ok(claimMission(s, 'q_clear', T0 + H).ok);
  assert.equal(s.resources.wood, wood + 150);
  assert.equal(claimMission(s, 'q_clear', T0 + H).ok, false, 'pas deux fois');
  // Terminer les autres missions principales
  s.city.buildings.sw = { id: 'sw', type: 'sawmill', level: 1, x: 2, y: 8 };
  s.city.buildings.qu = { id: 'qu', type: 'quarry', level: 1, x: 12, y: 3 };
  Object.values(s.city.buildings).find((b) => b.type === 'townhall').level = 2;
  const ev = campaignTick(s, T0 + 2 * H);
  assert.equal(s.campaign.chapter, 2);
  assert.ok(ev.some((e) => e.kind === 'chapter'));
  assert.ok(chapterInfo(s, 1).complete);
  const g = s.resources.gold;
  assert.ok(claimChapter(s, 1, T0 + 2 * H).ok);
  assert.equal(s.resources.gold, g + CHAPTERS[0].reward.gold);
  assert.equal(claimChapter(s, 1, T0 + 2 * H).ok, false);
  assert.equal(claimChapter(s, 2, T0 + 2 * H).ok, false, 'chapitre 2 non terminé');
  assert.equal(claimChapter(s, 5, T0 + 2 * H).ok, false, 'chapitre verrouillé');
});

test('Une mission atteinte reste acquise ; une mission secondaire ne bloque jamais le chapitre', () => {
  const s = fresh();
  s.campaign.chapter = 4;
  s.army.spearman = 30;
  campaignTick(s, T0);
  assert.ok(s.campaign.done.q_army);
  s.army = {};
  assert.ok(missionProgress(s, MISSIONS.q_army).done, 'reste acquise');
  assert.ok(claimMission(s, 'q_army', T0).ok);
  // q_tavern (secondaire) non faite : le chapitre peut quand même se terminer
  s.city.buildings.br = { id: 'br', type: 'barracks', level: 1, x: 9, y: 4 };
  s.campaign.flags.training = T0; markVisited(s, 'army'); s.stats.battlesWon = 1;
  campaignTick(s, T0);
  assert.equal(s.campaign.chapter, 5);
  assert.ok(!s.campaign.done.q_tavern);
});

test('Exercice d’entraînement : aucune perte, aucune ressource dépensée, mission validée', () => {
  const s = fresh();
  const army = { ...s.army }, res = { ...s.resources };
  const r = trainingBattle(s, T0);
  assert.ok(r.ok && r.res.rounds.length);
  assert.deepEqual(s.army, army);
  assert.deepEqual(s.resources, res);
  assert.ok(missionProgress(s, MISSIONS.c4_training).done);
  s.army = {};
  assert.equal(trainingBattle(s, T0).ok, false, 'sans troupes : message clair');
});

test('Missions royales du jour : 3 missions, progression depuis le début du jour, une réclamation, versement le lendemain', () => {
  const s = fresh();
  s.city.buildings.mk = { id: 'mk', type: 'market', level: 1, x: 9, y: 4 };
  const d = royalDaily(s, T0);
  assert.equal(d.list.length, 3);
  assert.equal(royalDaily(s, T0 + H), d, 'même journée : même liste');
  const m = royalDailyList(s)[0];
  assert.equal(m.cur, 0);
  assert.equal(claimRoyalDaily(s, m.id, T0).ok, false);
  s.stats[m.stat] = (s.stats[m.stat] || 0) + m.target;
  const gold = s.resources.gold;
  assert.ok(claimRoyalDaily(s, m.id, T0).ok);
  assert.ok(s.resources.gold > gold);
  assert.equal(claimRoyalDaily(s, m.id, T0).ok, false, 'une seule fois');
  // Une mission accomplie et oubliée est versée au changement de jour
  const m2 = royalDailyList(s)[1];
  s.stats[m2.stat] = (s.stats[m2.stat] || 0) + m2.target;
  const g2 = s.resources.gold;
  royalDaily(s, T0 + 24 * H);
  assert.ok(s.resources.gold > g2);
  assert.notEqual(s.campaign.daily.day, d.day);
});

test('Objectifs : catégories principales, secondaires, du jour, événement et long terme', () => {
  const s = fresh();
  const o = objectives(s, T0);
  for (const k of ['main', 'secondary', 'daily', 'event', 'long']) assert.ok(Array.isArray(o[k]), k);
  assert.ok(o.main.length >= 3);
  assert.ok(o.long.length >= 3);
  for (const m of [...o.main, ...o.secondary, ...o.long]) assert.ok(Number.isFinite(m.cur) && Number.isFinite(m.target), m.id);
  // Toutes les conditions s'évaluent sans erreur, même sur un royaume très avancé
  const rich = fresh('rich');
  rich.campaign.chapter = 8;
  Object.values(rich.city.buildings).find((b) => b.type === 'townhall').level = 12;
  assert.doesNotThrow(() => objectives(rich, T0));
});

test('Conseiller : prochaine étape, sans doublon ; report, ignorer et niveaux', () => {
  const s = fresh();
  let list = adviceList(s, T0);
  assert.ok(list.some((r) => r.id.startsWith('next:q_clear')), 'prochaine mission conseillée');
  assert.equal(new Set(list.map((r) => r.id)).size, list.length, 'aucun doublon');
  for (const r of list) if (r.goto) assert.ok(viewIds.has(r.goto) || r.goto.startsWith('g-'), r.goto);
  const next = list.find((r) => r.id.startsWith('next:'));
  snoozeAdvice(s, next.id, T0);
  assert.ok(!adviceList(s, T0 + H).some((r) => r.id === next.id), 'reporté');
  assert.ok(adviceList(s, T0 + SNOOZE_MS + 1).some((r) => r.id === next.id), 'revient après le délai');
  dismissAdvice(s, next.id, T0);
  assert.ok(!adviceList(s, T0 + 10 * SNOOZE_MS).some((r) => r.id === next.id), 'ignoré : ne revient plus');
  setAdviceLevel(s, 'reduced');
  assert.ok(adviceList(s, T0).every((r) => ['bad', 'warn', 'next'].includes(r.sev)));
  setAdviceLevel(s, 'off');
  assert.equal(adviceList(s, T0).length, 0);
  assert.equal(setAdviceLevel(s, 'bavard').ok, false);
  // Le conseil suit l'état : la mission accomplie disparaît des recommandations « prochaine étape »
  setAdviceLevel(s, 'full');
  s.campaign.dismissed = {};
  s.stats.cleared = 1;
  campaignTick(s, T0);
  assert.ok(!adviceList(s, T0).some((r) => r.id === 'next:q_clear'));
  assert.ok(adviceList(s, T0).some((r) => r.id === 'claim'), 'propose de réclamer');
});

test('Hors ligne : 12 h simulées ne réclament rien et ne valident que ce qui est réellement atteint', () => {
  rng.setSource(mulberry32(5));
  const s = fresh();
  const r = rubble(s);
  startClear(s, r.x, r.y, T0);
  place(s, 'farm');
  advance(s, T0 + 30 * H);
  campaignTick(s, T0 + 30 * H);
  rng.setSource(null);
  assert.deepEqual(s.campaign.claimed, {}, 'aucune récompense versée automatiquement');
  assert.ok(s.campaign.done.q_clear);
  assert.ok(!s.campaign.done.q_th2, 'hôtel de ville 2 non atteint : non validé');
  assert.equal(s.campaign.chapter, 1);
});

test('Sauvegarde : missions, réclamations et chapitre conservés ; aucune double réclamation après rechargement', () => {
  const s = fresh();
  s.stats.cleared = 1;
  campaignTick(s, T0);
  claimMission(s, 'q_clear', T0);
  s.campaign.flags.training = T0;
  const st = deserialize(serialize(s));
  assert.deepEqual(st.campaign.claimed, s.campaign.claimed);
  assert.equal(claimMission(st, 'q_clear', T0).ok, false);
  assert.ok(st.campaign.flags.training);
});

test('Migration : quêtes déjà réclamées conservées, nouvelles missions accomplies marquées sans récompense, bon chapitre', () => {
  const s = fresh('legacy');
  Object.values(s.city.buildings).find((b) => b.type === 'townhall').level = 3;
  s.city.buildings.sw = { id: 'sw', type: 'sawmill', level: 1, x: 2, y: 8 };
  s.city.buildings.qu = { id: 'qu', type: 'quarry', level: 1, x: 12, y: 3 };
  s.city.buildings.fa = { id: 'fa', type: 'farm', level: 3, x: 9, y: 2 };
  s.city.buildings.fa2 = { id: 'fa2', type: 'farm', level: 3, x: 10, y: 2 };
  s.stats.cleared = 3;
  const old = JSON.parse(serialize(s));
  delete old.kingdom; delete old.campaign;
  old.version = 6;
  old.quests = { done: { q_clear: T0, q_saw: T0, q_quarry: T0, q_th2: T0 }, milestones: {} };
  const res = { ...old.resources };
  const st = deserialize(JSON.stringify(old));
  const c = campaignState(st);
  assert.ok(c.chapter >= 2, `chapitre ${c.chapter}`);
  for (const id of ['q_clear', 'q_saw', 'q_quarry', 'q_th2']) assert.ok(c.claimed[id], id);
  assert.ok(c.chapterClaimed[1], 'chapitre dépassé : pas de prime rétroactive');
  // q_farm : ancienne quête atteinte mais jamais réclamée → reste réclamable ; c2_farm2 : nouvelle → marquée sans récompense
  assert.ok(!c.claimed.q_farm && c.done.q_farm);
  assert.ok(c.claimed.c2_farm2);
  assert.deepEqual(st.resources, res, 'aucune ressource versée par la migration');
  assert.ok(claimMission(st, 'q_farm', T0).ok);
  assert.equal(claimMission(st, 'c2_farm2', T0).ok, false);
});
