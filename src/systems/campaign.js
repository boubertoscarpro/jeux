// Parcours guidé : chapitres, missions détectées automatiquement, récompenses uniques, missions royales du jour,
// exercice d'entraînement et liste d'objectifs par catégorie.
import { CHAPTERS, LONG_TERM, DAILY_POOL } from '../data/campaign.js';
import { RESOURCES } from '../data/resources.js';
import { UNITS } from '../data/units.js';
import { mulberry32 } from '../core/rng.js';
import { countOf, levelOf, thLevel } from './city.js';
import { combatUnitCount } from './army.js';
import { computeMods } from './modifiers.js';
import { gain, netRates } from './economy.js';
import { simulateBattle } from './combat.js';
import { dailyMissions } from './liveEvents.js';
import { log, toast } from './log.js';

const DAY = 86400000;
export const MISSIONS = Object.fromEntries([...CHAPTERS.flatMap((c) => c.missions.map((m) => [m.id, { ...m, chapter: c.n }])), ...LONG_TERM.map((m) => [m.id, { ...m, chapter: 0, long: true }])]);

const H = {
  count: countOf,
  level: levelOf,
  combatUnits: (s) => combatUnitCount(s.army),
  foodNet: (s) => netRates(s, computeMods(s)).food || 0,
};

export function campaignState(state) {
  const c = (state.campaign ||= {});
  c.chapter ||= 1;
  for (const k of ['done', 'claimed', 'chapterClaimed', 'unlockedAt', 'flags', 'snoozed', 'dismissed']) if (!c[k] || typeof c[k] !== 'object') c[k] = {};
  c.unlockedAt[1] ||= state.meta?.created || 0;
  return c;
}

export const markVisited = (state, viewId) => { if (state?.campaign) campaignState(state).flags['view:' + viewId] = 1; };

// Progression d'une mission. Une mission atteinte reste acquise (même si la condition redescend ensuite).
export function missionProgress(state, m) {
  const c = campaignState(state);
  let cur = 0, target = 1;
  try { [cur, target] = m.check(state, H); } catch { cur = 0; }
  const done = !!c.done[m.id] || cur >= target;
  return { cur: done ? target : Math.min(cur, target), target, done, claimed: !!c.claimed[m.id] };
}

const mainDone = (state, ch) => ch.missions.filter((m) => !m.optional).every((m) => missionProgress(state, m).done);

export function chapterInfo(state, n) {
  const c = campaignState(state);
  const ch = CHAPTERS[n - 1];
  if (!ch) return null;
  const missions = ch.missions.map((m) => ({ ...m, chapter: n, ...missionProgress(state, m) }));
  const main = missions.filter((m) => !m.optional);
  return {
    ...ch, missions, unlocked: n <= c.chapter, current: n === c.chapter,
    mainDone: main.filter((m) => m.done).length, mainTotal: main.length,
    complete: main.every((m) => m.done), rewardClaimed: !!c.chapterClaimed[n],
  };
}

// Détection automatique : enregistre les missions atteintes et ouvre le chapitre suivant.
// Appelée régulièrement par l'interface et après chaque réclamation ; ne verse jamais de récompense.
export function campaignTick(state, now = Date.now()) {
  const c = campaignState(state);
  const events = [];
  for (let n = 1; n <= c.chapter; n++) {
    for (const m of CHAPTERS[n - 1].missions) {
      if (c.done[m.id]) continue;
      const p = missionProgress(state, m);
      if (p.done) { c.done[m.id] = now; events.push({ kind: 'mission', m }); }
    }
  }
  for (const m of LONG_TERM) if (!c.done[m.id] && missionProgress(state, m).done) c.done[m.id] = now;
  while (c.chapter < CHAPTERS.length && mainDone(state, CHAPTERS[c.chapter - 1])) {
    c.chapter++;
    c.unlockedAt[c.chapter] = now;
    const ch = CHAPTERS[c.chapter - 1];
    log(state, 'story', `📖 Chapitre ${ch.n} : « ${ch.title} ». ${ch.intro}`, now);
    toast(`📖 Nouveau chapitre : ${ch.title}`, 'good');
    events.push({ kind: 'chapter', ch });
  }
  if (c.chapter === CHAPTERS.length && mainDone(state, CHAPTERS[CHAPTERS.length - 1]) && !c.finished) {
    c.finished = now;
    log(state, 'story', '👑 Le parcours guidé est terminé : votre royaume a pris son envol. Les objectifs à long terme continuent.', now);
  }
  return events;
}

export function claimMission(state, id, now = Date.now()) {
  const c = campaignState(state);
  const m = MISSIONS[id];
  if (!m) return { ok: false, reason: 'Mission inconnue' };
  if (m.chapter > c.chapter) return { ok: false, reason: 'Chapitre pas encore ouvert' };
  if (c.claimed[id]) return { ok: false, reason: 'Récompense déjà réclamée' };
  if (!missionProgress(state, m).done) return { ok: false, reason: 'Objectif non atteint' };
  c.done[id] ||= now;
  c.claimed[id] = now;
  gain(state, m.reward, computeMods(state, now));
  log(state, 'good', `✅ Mission accomplie : ${m.title}.`, now);
  campaignTick(state, now);
  return { ok: true, reward: m.reward };
}

export function claimChapter(state, n, now = Date.now()) {
  const c = campaignState(state);
  const info = chapterInfo(state, n);
  if (!info || !info.unlocked) return { ok: false, reason: 'Chapitre pas encore ouvert' };
  if (c.chapterClaimed[n]) return { ok: false, reason: 'Récompense déjà réclamée' };
  if (!info.complete) return { ok: false, reason: 'Missions principales non terminées' };
  c.chapterClaimed[n] = now;
  gain(state, info.reward, computeMods(state, now));
  log(state, 'good', `🏆 Chapitre ${n} « ${info.title} » terminé : récompense versée.`, now);
  return { ok: true, reward: info.reward };
}

// ---------- Exercice d'entraînement (chapitre 4) : aucune perte, rien n'est modifié hormis l'indicateur ----------
export function trainingBattle(state, now = Date.now()) {
  const units = Object.fromEntries(Object.entries(state.army).filter(([t, n]) => UNITS[t] && UNITS[t].class !== 'special' && n > 0).map(([t, n]) => [t, Math.min(n, 30)]));
  if (!Object.keys(units).length) return { ok: false, reason: 'Aucune unité de combat en ville (formez quelques lanciers à la caserne)' };
  const n = Object.values(units).reduce((a, b) => a + b, 0);
  const dummies = { militia: Math.max(3, Math.round(n * 0.6)) };
  const res = simulateBattle({ units, mods: computeMods(state, now), label: 'Vos recrues' }, { units: dummies, mods: {}, formation: 'balanced', label: 'Mannequins' }, { terrain: 'plain', weather: 'clear', deterministic: true });
  campaignState(state).flags.training = now;
  return { ok: true, res, units, dummies };
}

// ---------- Missions royales du jour ----------
const dayOf = (now) => Math.floor(now / DAY);
const statOf = (state, k) => (k === 'trades' ? (state.stats.trades || 0) : state.stats[k] || 0);

export function royalDaily(state, now = Date.now()) {
  const c = campaignState(state);
  const d = dayOf(now);
  if (c.daily?.day !== d) {
    // Les missions accomplies mais non réclamées la veille sont versées automatiquement (rien n'est perdu)
    if (c.daily) for (const m of royalDailyList(state)) if (m.done && !m.claimed) claimRoyalDaily(state, m.id, now);
    const pool = DAILY_POOL.filter((p) => !p.need || p.need(state, H));
    const r = mulberry32(((state.meta?.seed || 1) ^ (d * 2654435761)) >>> 0);
    const picks = [];
    while (picks.length < Math.min(3, pool.length)) picks.push(pool.splice(Math.floor(r() * pool.length), 1)[0]);
    const th = thLevel(state);
    c.daily = {
      day: d,
      list: picks.map((p) => {
        const n = p.n[0] + Math.floor(r() * (p.n[1] - p.n[0] + 1));
        return { id: `${d}_${p.id}`, key: p.id, stat: p.stat, target: n, base: statOf(state, p.stat), claimed: false, reward: { gold: 120 + th * 40, [['wood', 'stone', 'food', 'iron'][Math.floor(r() * 4)]]: 150 + th * 50 } };
      }),
    };
  }
  return c.daily;
}

export function royalDailyList(state) {
  const c = campaignState(state);
  if (!c.daily) return [];
  return c.daily.list.map((m) => {
    const p = DAILY_POOL.find((x) => x.id === m.key);
    const value = Math.max(0, statOf(state, m.stat) - m.base);
    return { ...m, title: p?.title || m.key, desc: (p?.desc || '').replace('{n}', m.target), view: p?.view, cur: Math.min(value, m.target), done: value >= m.target };
  });
}

export function claimRoyalDaily(state, id, now = Date.now()) {
  const c = campaignState(state);
  const m = royalDailyList(state).find((x) => x.id === id);
  if (!m) return { ok: false, reason: 'Mission expirée' };
  if (m.claimed) return { ok: false, reason: 'Récompense déjà réclamée' };
  if (!m.done) return { ok: false, reason: 'Objectif non atteint' };
  c.daily.list.find((x) => x.id === id).claimed = true;
  gain(state, m.reward, computeMods(state, now));
  return { ok: true, reward: m.reward };
}

// ---------- Tableau des objectifs ----------
export function objectives(state, now = Date.now()) {
  const c = campaignState(state);
  royalDaily(state, now);
  const ch = chapterInfo(state, c.chapter);
  const chapters = CHAPTERS.map((x) => chapterInfo(state, x.n));
  const main = ch.missions.filter((m) => !m.optional && !m.claimed);
  const secondary = chapters.filter((x) => x.unlocked).flatMap((x) => x.missions.filter((m) => m.optional && !m.claimed));
  // Missions principales de chapitres terminés mais non réclamées : on ne les perd pas
  const leftovers = chapters.filter((x) => x.unlocked && !x.current).flatMap((x) => x.missions.filter((m) => !m.optional && m.done && !m.claimed));
  const daily = royalDailyList(state);
  const event = dailyMissions(state).map((m, i) => ({ id: m.id, i, title: m.label, desc: 'Mission du jour de l’événement en cours', cur: m.value, target: m.target, done: m.done, claimed: m.claimed, rewardText: `${m.reward} monnaie d’événement`, view: 'event' }));
  const long = LONG_TERM.map((m) => ({ ...m, ...missionProgress(state, m) })).filter((m) => !m.claimed);
  return { chapter: ch, chapters, main: [...leftovers, ...main], secondary, daily, event, long };
}

export const objectivesBadge = (state) => {
  try {
    const o = objectives(state);
    return [...o.main, ...o.secondary, ...o.long].filter((m) => m.done && !m.claimed).length
      + o.daily.filter((m) => m.done && !m.claimed).length
      + (o.chapter.complete && !o.chapter.rewardClaimed ? 1 : 0)
      + o.chapters.filter((x) => x.unlocked && x.complete && !x.rewardClaimed && !x.current).length;
  } catch { return 0; }
};

export const rewardText = (r) => Object.entries(r || {}).map(([k, v]) => `${RESOURCES[k]?.icon || ''} ${v}`).join(' ');

// Migration : les anciennes quêtes réclamées gardent leur statut ; les nouvelles missions déjà accomplies sont
// marquées réclamées SANS récompense (pas d'aubaine rétroactive), et la partie reprend au bon chapitre.
export function initLegacyCampaign(state, now = Date.now()) {
  const c = campaignState(state);
  const oldDone = state.quests?.done || {};
  for (const id of Object.keys(oldDone)) if (MISSIONS[id]) { c.done[id] = oldDone[id] || now; c.claimed[id] = oldDone[id] || now; }
  // Avance jusqu'au chapitre réel du joueur
  for (let guard = 0; guard < CHAPTERS.length; guard++) {
    const ch = CHAPTERS[c.chapter - 1];
    for (const m of ch.missions) {
      if (c.claimed[m.id]) continue;
      if (missionProgress(state, m).done) {
        c.done[m.id] = now;
        if (!m.id.startsWith('q_')) c.claimed[m.id] = now; // nouvelle mission : pas de récompense rétroactive
      }
    }
    if (!mainDone(state, ch)) break;
    c.chapterClaimed[ch.n] = now; // chapitre déjà dépassé : pas de prime rétroactive
    if (c.chapter >= CHAPTERS.length) break;
    c.chapter++;
    c.unlockedAt[c.chapter] = now;
  }
  for (const m of LONG_TERM) if (oldDone[m.id]) { c.done[m.id] = now; c.claimed[m.id] = now; }
  c.legacy = now;
  return c;
}
