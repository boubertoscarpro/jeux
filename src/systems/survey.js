// Missions cartographiques : des éclaireurs partent explorer la carte automatiquement pendant plusieurs heures.
// Très coûteuses (or, nourriture, et selon l'ampleur bois, tissu, cristaux), elles mobilisent des éclaireurs qui ne
// sont rendus qu'au retour (quelques-uns peuvent se perdre). À intervalles réguliers, une équipe révèle une zone
// encore dans le brouillard, au plus près de ce qui est déjà connu : on étend la carte sans y passer ses sessions.
// Ce qui est découvert compte comme une exploration normale (compteurs, réputation, objectifs), une fois par zone.
import { SEASON } from '../data/social.js';
import { POI_TYPES } from '../data/world.js';
import { RESOURCES } from '../data/resources.js';
import { rng } from '../core/rng.js';
import { fmt } from '../core/util.js';
import { thLevel } from './city.js';
import { pay, missing } from './economy.js';
import { reveal, isRevealed, worldScale } from './world.js';
import { bumpRep } from './reputation.js';
import { chronicle } from './chronicle.js';
import { log, toast } from './log.js';

const H = 3600000, MIN = 60000;
export const SURVEY_MIN_TH = 4;
// costPerTh : coût multiplié par le niveau d'hôtel de ville ; every : minutes entre deux zones révélées
export const SURVEYS = {
  patrol: { name: 'Patrouille cartographique', icon: '🧭', hours: 8, scouts: 4, every: 40, radius: 2, costPerTh: { gold: 500, food: 400 }, desc: 'Quatre éclaireurs, 8 h : une douzaine de zones autour des terres connues.' },
  survey: { name: 'Grand relevé', icon: '🗺️', hours: 24, scouts: 8, every: 30, radius: 2.5, costPerTh: { gold: 1200, food: 1000, wood: 600 }, desc: 'Huit éclaireurs, 24 h : une cinquantaine de zones, avec un rayon plus large.' },
  royal: { name: 'Expédition royale de cartographie', icon: '👑', hours: 48, scouts: 15, every: 20, radius: 3, costPerTh: { gold: 3000, food: 2500, wood: 1500, cloth: 40 }, extra: { crystals: 10 }, minTh: 8, desc: 'Quinze éclaireurs, 48 h : environ 140 zones, jusqu’aux confins de la carte.' },
};

export const surveyState = (state) => {
  const S = (state.survey && typeof state.survey === 'object' && !Array.isArray(state.survey)) ? state.survey : (state.survey = {});
  S.active ??= null;
  if (!Array.isArray(S.history)) S.history = [];
  return S;
};

export function surveyCost(state, key) {
  const d = SURVEYS[key];
  const th = Math.max(1, thLevel(state));
  const c = Object.fromEntries(Object.entries(d.costPerTh).map(([r, v]) => [r, v * th]));
  for (const [r, v] of Object.entries(d.extra || {})) c[r] = (c[r] || 0) + v;
  return c;
}

export function surveyStatus(state, key, now = Date.now()) {
  const d = SURVEYS[key];
  if (!d) return { ok: false, reason: 'Mission inconnue' };
  const th = thLevel(state);
  const cost = surveyCost(state, key);
  const miss = missing(state, cost);
  let reason = null;
  if (th < Math.max(SURVEY_MIN_TH, d.minTh || 0)) reason = `Hôtel de ville niv. ${Math.max(SURVEY_MIN_TH, d.minTh || 0)} requis`;
  else if (surveyState(state).active) reason = 'Une mission cartographique est déjà en cours';
  else if ((state.army.scout || 0) < d.scouts) reason = `Il faut ${d.scouts} éclaireurs en ville (vous en avez ${state.army.scout || 0})`;
  else if (Object.keys(miss).length) reason = 'Ressources insuffisantes';
  return { ok: !reason, reason, cost, missing: miss, zones: Math.floor((d.hours * 60) / d.every) };
}

export function startSurvey(state, key, now = Date.now()) {
  const st = surveyStatus(state, key, now);
  if (!st.ok) return { ok: false, reason: st.reason, missing: st.missing };
  if (!pay(state, st.cost)) return { ok: false, reason: 'Ressources insuffisantes', missing: missing(state, st.cost) };
  const d = SURVEYS[key];
  state.army.scout -= d.scouts;
  surveyState(state).active = { key, start: now, end: now + d.hours * H, nextAt: now + d.every * MIN, scouts: d.scouts, lost: 0, zones: 0, tiles: 0, found: [] };
  log(state, 'explore', `${d.icon} ${d.name} lancée : ${d.scouts} éclaireurs partent pour ${d.hours} h.`, now);
  return { ok: true, text: `${d.name} lancée` };
}

// Zone suivante : une case du brouillard, tirée parmi les plus proches des terres déjà connues (la carte s'étend
// comme une tache d'huile, sans revenir sur ce qui est déjà révélé)
function nextTarget(state) {
  const w = state.world;
  const cands = [];
  const R = Math.max(10, worldScale(w) * 0.7);
  for (let i = 0; i < 400 && cands.length < 25; i++) {
    const a = rng.float(0, Math.PI * 2), d = rng.float(3, R);
    const x = Math.round(w.capital.x + Math.cos(a) * d), y = Math.round(w.capital.y + Math.sin(a) * d);
    if (x < 0 || y < 0 || x >= w.size || y >= w.size || isRevealed(w, x, y)) continue;
    // Proche d'une case connue : priorité à la lisière du brouillard
    let edge = false;
    for (const [dx, dy] of [[2, 0], [-2, 0], [0, 2], [0, -2]]) if (isRevealed(w, x + dx, y + dy)) edge = true;
    cands.push({ x, y, d: Math.hypot(x - w.capital.x, y - w.capital.y) - (edge ? 6 : 0) });
  }
  if (!cands.length) return null;
  cands.sort((a, b) => a.d - b.d);
  return rng.pick(cands.slice(0, 6));
}

function finishSurvey(state, now, early = false) {
  const S = surveyState(state);
  const a = S.active;
  if (!a) return;
  const d = SURVEYS[a.key];
  const back = Math.max(0, a.scouts - a.lost);
  state.army.scout = (state.army.scout || 0) + back;
  S.history.unshift({ key: a.key, start: a.start, end: now, zones: a.zones, tiles: a.tiles, lost: a.lost, found: a.found.slice(0, 12), early });
  S.history.length = Math.min(S.history.length, 8);
  S.active = null;
  const text = `${d.icon} ${d.name} ${early ? 'rappelée' : 'terminée'} : ${a.zones} zones, ${fmt(a.tiles)} cases révélées${a.found.length ? `, ${a.found.length} lieux découverts` : ''} ; ${back} éclaireur(s) de retour${a.lost ? `, ${a.lost} perdu(s)` : ''}.`;
  log(state, 'explore', text, now);
  toast(`${d.icon} Mission cartographique ${early ? 'rappelée' : 'terminée'}`, 'good');
  if (!early && a.key !== 'patrol') chronicle(state, `${d.icon} ${d.name} : ${fmt(a.tiles)} cases de la carte relevées par les éclaireurs du royaume.`, now, 'discovery', `survey:${a.start}`);
}

// Tick (moteur) : rattrape toutes les zones dues (retour d'absence), puis rentre à l'échéance
export function surveyTick(state, now = Date.now()) {
  const a = state.survey?.active;
  if (!a) return;
  const d = SURVEYS[a.key];
  if (!d) { surveyState(state).active = null; return; }
  for (let guard = 0; guard < 400 && a.nextAt <= Math.min(now, a.end) && a.scouts - a.lost > 0; guard++) {
    const t = a.nextAt;
    a.nextAt += d.every * MIN;
    const target = nextTarget(state);
    if (!target) { a.end = t; break; }
    const found = reveal(state.world, target.x, target.y, d.radius);
    a.zones++;
    a.tiles += found.newTiles;
    if (found.newTiles > 0) {
      state.stats.explored = (state.stats.explored || 0) + 1;
      bumpRep(state, 'explorer', 1);
      state.season.points += SEASON.points.explore;
    }
    for (const p of found) if (POI_TYPES[p.type] && p.type !== 'capital') a.found.push(`${POI_TYPES[p.type].icon} ${p.name || POI_TYPES[p.type].name}`);
    // Les zones dangereuses coûtent parfois un éclaireur (pas plus d'un tiers de l'équipe)
    const danger = found.reduce((m, p) => Math.max(m, p.danger || 0), 0);
    if (danger >= 3 && a.lost < Math.floor(a.scouts / 3) && rng.chance(0.08 * (danger - 2))) a.lost++;
  }
  if (now >= a.end || a.scouts - a.lost <= 0) finishSurvey(state, Math.min(now, a.end));
}

export function recallSurvey(state, now = Date.now()) {
  if (!surveyState(state).active) return { ok: false, reason: 'Aucune mission en cours' };
  finishSurvey(state, now, true);
  return { ok: true };
}
void RESOURCES;
