// Passe-temps et accélération des chantiers par les gemmes.
// Règles (voir data/speedups.js) :
//  - un passe-temps ou une accélération ne vise qu'UN chantier de la file de construction ;
//  - le chantier doit exister et ne pas être terminé ; rien n'est consommé si l'action échoue ;
//  - le temps retiré est plafonné au temps restant (jamais de temps négatif) ;
//  - si le chantier se termine, il est achevé tout de suite par le moteur (même chemin que hors ligne).
// Les passe-temps sont rangés dans state.inventory.consumables ; les gains et usages sont comptés dans
// state.speedups (statistiques, plafond quotidien des combats, garde contre les doubles récompenses).
import { SPEEDUPS, SPEEDUP_ORDER, SPEEDUP_MIN_LEFT_S, COMBAT_SPEEDUPS, gemCostForMinutes } from '../data/speedups.js';
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
export const speedupStock = (state) => SPEEDUP_ORDER.map((k) => ({ key: k, ...SPEEDUPS[k], n: speedupCount(state, k) }));
export const totalSpeedupMinutes = (state) => SPEEDUP_ORDER.reduce((s, k) => s + speedupCount(state, k) * SPEEDUPS[k].min, 0);

export const findBuildJob = (state, qid) => state.queues.build.find((q) => q.id === qid) || null;
export const jobLeft = (q, now) => Math.max(0, q.end - now);
export function jobLabel(q) {
  if (q.kind === 'clear') return 'Déblaiement';
  const n = BUILDINGS[q.type]?.name || q.type;
  return q.level === 1 ? `${n} (construction)` : `${n} → niveau ${q.level}`;
}

// Ce que ferait un passe-temps ou une accélération : { ok, reason, removed, left, after, cost?, wasted }
export function previewSpeedup(state, qid, how, now = Date.now()) {
  const q = findBuildJob(state, qid);
  if (!q) return { ok: false, reason: 'Chantier introuvable ou déjà terminé' };
  const left = jobLeft(q, now);
  if (left <= 0) return { ok: false, reason: 'Chantier déjà terminé' };
  if (how.item) {
    const def = SPEEDUPS[how.item];
    if (!def) return { ok: false, reason: 'Passe-temps inconnu' };
    if (left < SPEEDUP_MIN_LEFT_S * 1000) return { ok: false, reason: 'Le chantier se termine dans quelques secondes' };
    if (speedupCount(state, how.item) < 1) return { ok: false, reason: `Aucun ${def.name.toLowerCase()} en réserve` };
    const removed = Math.min(left, def.min * MIN);
    return { ok: true, removed, left, after: left - removed, wasted: def.min * MIN - removed };
  }
  if (how.gems) {
    // « hour » : −1 h (ou le reste s'il en reste moins) ; « finish » : terminer maintenant
    const removed = how.gems === 'finish' ? left : Math.min(left, 60 * MIN);
    const cost = gemCostForMinutes(Math.ceil(removed / MIN));
    const have = Math.floor(state.resources.gems || 0);
    if (have < cost) return { ok: false, reason: `Gemmes insuffisantes : ${cost} requises, ${have} en réserve`, cost, removed, left, after: left - removed };
    return { ok: true, removed, left, after: left - removed, cost, wasted: 0 };
  }
  return { ok: false, reason: 'Accélération inconnue' };
}

export function applySpeedup(state, qid, how, now = Date.now()) {
  const p = previewSpeedup(state, qid, how, now);
  if (!p.ok) return p;
  const q = findBuildJob(state, qid);
  // Paiement APRÈS toutes les vérifications : un échec ne consomme jamais rien
  if (how.item) state.inventory.consumables[how.item] = speedupCount(state, how.item) - 1;
  else if (!pay(state, { gems: p.cost })) return { ok: false, reason: 'Gemmes insuffisantes' };
  q.end = Math.max(now, q.end - p.removed);
  q.sped = (q.sped || 0) + p.removed;
  const S = speedupState(state);
  if (how.item) S.used[how.item] = (S.used[how.item] || 0) + 1;
  else S.gemsSpent += p.cost;
  S.minutesSaved += Math.round(p.removed / MIN);
  const label = jobLabel(q);
  const what = how.item ? SPEEDUPS[how.item].name : `${p.cost} gemme${p.cost > 1 ? 's' : ''}`;
  const done = q.end <= now;
  log(state, 'info', `⏳ ${what} : ${label} ${done ? 'terminé' : `avance de ${Math.round(p.removed / MIN)} min`}.`, now);
  // Chantier achevé : le moteur le termine maintenant (production, file planifiée, journal), comme hors ligne
  if (done) {
    advance(state, now);
    // Horloge déjà à jour (lastTick = maintenant) : le moteur n'avance pas, on traite l'échéance directement
    if (state.queues.build.some((x) => x.id === q.id)) processDue(state, Math.max(now, state.meta.lastTick || now));
  }
  return { ...p, ok: true, done };
}

// Le plus petit passe-temps qui termine le chantier, sinon le plus grand disponible (aide au choix)
export function suggestSpeedup(state, qid, now = Date.now()) {
  const q = findBuildJob(state, qid);
  if (!q) return null;
  const left = jobLeft(q, now) / MIN;
  const owned = SPEEDUP_ORDER.filter((k) => speedupCount(state, k) > 0);
  return owned.find((k) => SPEEDUPS[k].min >= left) || owned[owned.length - 1] || null;
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
  if (Array.isArray(t)) { if (rng.chance(t[0])) add(t[1]); } else for (const [k, n] of Object.entries(t || {})) add(k, n);
  if (ctx.rare && rng.chance(ctx.rare[0])) add(ctx.rare[1]);
  const n = Object.values(items).reduce((a, b) => a + b, 0);
  if (n) { speedupState(state).combatToday += n; grantSpeedups(state, items, ctx.source || 'combat', now); }
  return { items, reason: n ? null : 'pas de passe-temps cette fois' };
}
