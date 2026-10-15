// Passe-temps et accélération des chantiers par les gemmes.
// Règles (voir data/speedups.js) :
//  - un passe-temps ou une accélération ne vise qu'UN chantier de la file de construction ;
//  - le chantier doit exister et ne pas être terminé ; rien n'est consommé si l'action échoue ;
//  - le temps retiré est plafonné au temps restant (jamais de temps négatif) ;
//  - si le chantier se termine, il est achevé tout de suite par le moteur (même chemin que hors ligne).
// Les passe-temps sont rangés dans state.inventory.consumables ; les gains et usages sont comptés dans
// state.speedups (statistiques, plafond quotidien des combats, garde contre les doubles récompenses).
import { SPEEDUPS, SPEEDUP_ORDER, ORDER_OF, RECRUIT_OF, SPEEDUP_MIN_LEFT_S, COMBAT_SPEEDUPS, gemCostForMinutes } from '../data/speedups.js';
import { UNITS } from '../data/units.js';
import { BUILDINGS } from '../data/buildings.js';
import { rng } from '../core/rng.js';
import { pay } from './economy.js';
import { advance, processDue } from '../core/engine.js';
import { log } from './log.js';
import { dayKey } from './shards.js';

const MIN = 60000;

export function speedupState(state) {
  const S = (state.speedups ||= { earned: {}, used: {}, gemsSpent: 0, minutesSaved: 0, combatDay: 0, combatToday: 0, granted: {} });
  S.earned ||= {}; S.used ||= {}; S.granted ||= {};
  return S;
}

export const speedupCount = (state, key) => Math.max(0, Math.floor(state.inventory?.consumables?.[key] || 0));
export const speedupStock = (state, kind = 'build') => ORDER_OF[kind].map((k) => ({ key: k, ...SPEEDUPS[k], n: speedupCount(state, k) }));
export const totalSpeedupMinutes = (state, kind = 'build') => ORDER_OF[kind].reduce((s, k) => s + speedupCount(state, k) * SPEEDUPS[k].min, 0);

// Une accélération vise un chantier (file « build ») ou une formation militaire (file « train »)
export function findJob(state, qid) {
  for (const kind of ['build', 'train']) { const q = (state.queues[kind] || []).find((x) => x.id === qid); if (q) return { q, kind }; }
  return null;
}
export const findBuildJob = (state, qid) => state.queues.build.find((q) => q.id === qid) || null;
export const jobLeft = (q, now) => Math.max(0, q.end - now);
export function jobLabel(q) {
  if (q.unit) return `Formation : ${q.count} × ${UNITS[q.unit]?.name || q.unit}`;
  if (q.kind === 'clear') return 'Déblaiement';
  const n = BUILDINGS[q.type]?.name || q.type;
  return q.level === 1 ? `${n} (construction)` : `${n} → niveau ${q.level}`;
}
const KIND_TEXT = { build: 'chantier', train: 'formation' };

// Ce que ferait un passe-temps ou une accélération : { ok, reason, removed, left, after, cost?, wasted }
export function previewSpeedup(state, qid, how, now = Date.now()) {
  const job = findJob(state, qid);
  if (!job) return { ok: false, reason: 'Chantier ou formation introuvable, ou déjà terminé' };
  const { q, kind } = job;
  const left = jobLeft(q, now);
  if (left <= 0) return { ok: false, reason: `${KIND_TEXT[kind] === 'chantier' ? 'Chantier' : 'Formation'} déjà terminé${kind === 'train' ? 'e' : ''}` };
  // File de formation séquentielle : seule la formation EN COURS de chaque bâtiment peut être accélérée
  if (kind === 'train' && q.start > now) return { ok: false, reason: 'Formation en attente : accélérez d’abord celle qui est en cours dans ce bâtiment' };
  if (how.item) {
    const def = SPEEDUPS[how.item];
    if (!def) return { ok: false, reason: 'Passe-temps inconnu' };
    if (def.target !== kind) return { ok: false, reason: kind === 'train' ? 'Ce passe-temps sert aux chantiers, pas aux formations militaires' : 'Ce passe-temps sert aux formations militaires, pas aux chantiers' };
    if (left < SPEEDUP_MIN_LEFT_S * 1000) return { ok: false, reason: `La ${KIND_TEXT[kind]} se termine dans quelques secondes` };
    if (speedupCount(state, how.item) < 1) return { ok: false, reason: `Aucun ${def.name.toLowerCase()} en réserve` };
    const removed = Math.min(left, def.min * MIN);
    return { ok: true, removed, left, after: left - removed, wasted: def.min * MIN - removed, kind };
  }
  if (how.gems) {
    // « hour » : −1 h (ou le reste s'il en reste moins) ; « finish » : terminer maintenant
    const removed = how.gems === 'finish' ? left : Math.min(left, 60 * MIN);
    const cost = gemCostForMinutes(Math.ceil(removed / MIN));
    const have = Math.floor(state.resources.gems || 0);
    if (have < cost) return { ok: false, reason: `Gemmes insuffisantes : ${cost} requises, ${have} en réserve`, cost, removed, left, after: left - removed, kind };
    return { ok: true, removed, left, after: left - removed, cost, wasted: 0, kind };
  }
  return { ok: false, reason: 'Accélération inconnue' };
}

export function applySpeedup(state, qid, how, now = Date.now()) {
  const p = previewSpeedup(state, qid, how, now);
  if (!p.ok) return p;
  const { q, kind } = findJob(state, qid);
  // Paiement APRÈS toutes les vérifications : un échec ne consomme jamais rien
  if (how.item) state.inventory.consumables[how.item] = speedupCount(state, how.item) - 1;
  else if (!pay(state, { gems: p.cost })) return { ok: false, reason: 'Gemmes insuffisantes' };
  const oldEnd = q.end;
  q.end = Math.max(now, q.end - p.removed);
  q.sped = (q.sped || 0) + p.removed;
  // Formations en attente dans le même bâtiment : elles avancent d'autant (même durée, jamais de soldat en plus)
  if (kind === 'train') {
    let t = q.end;
    for (const o of state.queues.train.filter((x) => x !== q && x.building === q.building && x.start >= oldEnd - 1).sort((a, b) => a.start - b.start)) {
      const dur = o.end - o.start; o.start = t; o.end = t + dur; t = o.end;
    }
  }
  const S = speedupState(state);
  if (how.item) S.used[how.item] = (S.used[how.item] || 0) + 1;
  else S.gemsSpent += p.cost;
  S.minutesSaved += Math.round(p.removed / MIN);
  if (kind === 'train') S.trainMinutesSaved = (S.trainMinutesSaved || 0) + Math.round(p.removed / MIN);
  const label = jobLabel(q);
  const what = how.item ? SPEEDUPS[how.item].name : `${p.cost} gemme${p.cost > 1 ? 's' : ''}`;
  const done = q.end <= now;
  log(state, 'info', `⏳ ${what} : ${label} ${done ? (kind === 'train' ? 'terminée' : 'terminé') : `avance de ${Math.round(p.removed / MIN)} min`}.`, now);
  // Terminé : le moteur l'achève maintenant (soldats ajoutés par la fin de formation normale, chantier achevé
  // normalement), exactement comme hors ligne
  if (done) {
    advance(state, now);
    if (state.queues[kind].some((x) => x.id === q.id)) processDue(state, Math.max(now, state.meta.lastTick || now));
  }
  return { ...p, ok: true, done };
}

// Le plus petit passe-temps qui termine le chantier ou la formation, sinon le plus grand disponible
export function suggestSpeedup(state, qid, now = Date.now()) {
  const job = findJob(state, qid);
  if (!job) return null;
  const left = jobLeft(job.q, now) / MIN;
  const owned = ORDER_OF[job.kind].filter((k) => speedupCount(state, k) > 0);
  return owned.find((k) => SPEEDUPS[k].min >= left) || owned[owned.length - 1] || null;
}

// Combinaison de passe-temps qui TERMINE le travail en gaspillant le moins possible : les grands d'abord tant
// qu'ils tiennent dans le temps restant, puis le plus petit qui couvre le reste. null si le stock ne suffit pas.
export function finishCombo(state, qid, now = Date.now()) {
  const job = findJob(state, qid);
  if (!job) return null;
  let left = Math.ceil(jobLeft(job.q, now) / MIN);
  if (left * MIN < SPEEDUP_MIN_LEFT_S * 1000) return null;
  const order = [...ORDER_OF[job.kind]].reverse();
  const stock = Object.fromEntries(order.map((k) => [k, speedupCount(state, k)]));
  const use = {};
  for (const k of order) { const m = SPEEDUPS[k].min; const n = Math.min(stock[k], Math.floor(left / m)); if (n > 0) { use[k] = n; stock[k] -= n; left -= n * m; } }
  if (left > 0) { const k = [...order].reverse().find((x) => stock[x] > 0 && SPEEDUPS[x].min >= left); if (!k) return null; use[k] = (use[k] || 0) + 1; left = 0; }
  const minutes = Object.entries(use).reduce((a, [k, n]) => a + n * SPEEDUPS[k].min, 0);
  return { use, minutes, waste: Math.max(0, minutes - Math.ceil(jobLeft(job.q, now) / MIN)) };
}
export function applyCombo(state, qid, now = Date.now()) {
  const combo = finishCombo(state, qid, now);
  if (!combo) return { ok: false, reason: 'Pas assez de passe-temps pour terminer' };
  const order = Object.keys(combo.use).sort((a, b) => SPEEDUPS[b].min - SPEEDUPS[a].min);
  const used = {};
  for (const k of order) for (let i = 0; i < combo.use[k]; i++) {
    if (!findJob(state, qid)) break; // déjà terminé : on arrête AVANT de consommer
    const r = applySpeedup(state, qid, { item: k }, now);
    if (!r.ok) return { ...r, used };
    used[k] = (used[k] || 0) + 1;
  }
  return { ok: true, done: !findJob(state, qid), combo, used };
}

// ───────── Gains ─────────
// key : identifiant unique de la récompense (« quête x », « objectif y d'événement z »…). Une même clé n'est
// jamais payée deux fois, même si l'appelant est rappelé par erreur (double clic, double traitement).
export function grantSpeedups(state, items, source = '', now = Date.now(), key = null) {
  const S = speedupState(state);
  if (key) {
    if (S.granted[key]) return '';
    S.granted[key] = now;
    // La table des clés reste bornée : on oublie les plus anciennes (les récompenses concernées sont réclamées)
    const ks = Object.keys(S.granted);
    if (ks.length > 400) for (const k of ks.sort((a, b) => S.granted[a] - S.granted[b]).slice(0, ks.length - 400)) delete S.granted[k];
  }
  const parts = [];
  for (const [k, n0] of Object.entries(items || {})) {
    const n = Math.floor(n0);
    if (!SPEEDUPS[k] || !(n > 0)) continue;
    state.inventory.consumables[k] = speedupCount(state, k) + n;
    S.earned[k] = (S.earned[k] || 0) + n;
    parts.push(`${n} × ${SPEEDUPS[k].name} (${SPEEDUPS[k].short})`);
  }
  if (parts.length && source) log(state, 'good', `⏳ Passe-temps obtenu${parts.length > 1 ? 's' : ''} (${source}) : ${parts.join(', ')}.`, now);
  return parts.join(', ');
}
export const speedupText = (items) => Object.entries(items || {}).filter(([k, n]) => SPEEDUPS[k] && n > 0).map(([k, n]) => `⏳ ${n} × ${SPEEDUPS[k].short}`).join(' ');

// Plafond quotidien des passe-temps de combat (jour UTC, horloge du jeu)
export function combatRoom(state, now) {
  const S = speedupState(state);
  const d = dayKey(now);
  // Le compteur ne repart à zéro qu'en AVANÇANT d'un jour : reculer l'horloge ne rouvre pas le plafond
  if (d > (S.combatDay || 0)) { S.combatDay = d; S.combatToday = 0; }
  return Math.max(0, COMBAT_SPEEDUPS.dailyCap - S.combatToday);
}

// Mérite d'un combat : puissance ennemie / puissance engagée (0 si l'un des camps est vide)
export function combatMerit(sentPower, enemyPower) {
  if (!(sentPower > 0) || !(enemyPower > 0)) return 0;
  return enemyPower / sentPower;
}

// Récompense d'un combat gagné. ctx : { win, merit, table: [chance, objet] | { objet: n }, rare?: [chance, objet], source }
// Renvoie { items, reason } ; reason explique un refus (défaite, cible trop faible, plafond du jour).
export function rollCombatSpeedup(state, ctx, now = Date.now()) {
  if (!ctx.win) return { items: {}, reason: 'défaite' };
  if (!(ctx.merit >= COMBAT_SPEEDUPS.minMerit)) return { items: {}, reason: 'cible trop faible pour votre armée' };
  let room = combatRoom(state, now);
  if (room <= 0) return { items: {}, reason: 'plafond quotidien atteint' };
  const items = {};
  const add = (k, n = 1) => { const m = Math.min(n, room); if (m > 0) { items[k] = (items[k] || 0) + m; room -= m; } };
  const t = ctx.table;
  // Une partie des gains de combat est versée en passe-temps de recrutement (même valeur, même plafond)
  const pick = (k) => (RECRUIT_OF[k] && rng.chance(COMBAT_SPEEDUPS.recruitShare ?? 0) ? RECRUIT_OF[k] : k);
  if (Array.isArray(t)) { if (rng.chance(t[0])) add(pick(t[1])); } else for (const [k, n] of Object.entries(t || {})) for (let i = 0; i < n; i++) add(pick(k));
  if (ctx.rare && rng.chance(ctx.rare[0])) add(pick(ctx.rare[1]));
  const n = Object.values(items).reduce((a, b) => a + b, 0);
  if (n) { speedupState(state).combatToday += n; grantSpeedups(state, items, ctx.source || 'combat', now); }
  return { items, reason: n ? null : 'pas de passe-temps cette fois' };
}
