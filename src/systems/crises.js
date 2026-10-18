// v14 — Répercussions : crises en cascade avec points d'intervention (données : data/crises.js).
// Une catastrophe (sécheresse, crue, blizzard) ou un incendie en ville ouvre une crise à étapes. Chaque étape a une
// durée et des effets qui passent d'un système à l'autre : production (modifiers), prix du marché (livingMarket),
// faveur des groupes du conseil (councilPressures), stabilité des provinces (stabilityFactors), révolte, incendie.
// Le joueur choisit où couper la chaîne : tôt et bon marché, ou tard et cher, ou en puisant dans la réserve royale.
// Pendant une absence, le régent ne puise QUE dans la réserve (consigne facultative), jamais dans les stocks, et
// seulement quand la crise atteint sa 2e étape.
// Bornes : une crise du royaume à la fois (plus un incendie), délai de 8 h entre deux crises, effets tous temporaires.
import { CRISES, CRISIS } from '../data/crises.js';
import { GROUPS } from '../data/council.js';
import { BUILDINGS } from '../data/buildings.js';
import { RESOURCES } from '../data/resources.js';
import { uid, fmt } from '../core/util.js';
import { thLevel } from './city.js';
import { pay, missing } from './economy.js';
import { canDraw, drawReserve, reserveState, releaseFood } from './reserve.js';
import { shiftFavor } from './council.js';
import { spreadWave, guardNear, borderOf } from './hazards.js';
import { stabOf } from './stability.js';
import { chronicle } from './chronicle.js';
import { log, toast } from './log.js';

const H = 3600000;
const th = (state) => Math.max(1, thLevel(state));
const scaleTh = (state, o) => Object.fromEntries(Object.entries(o || {}).map(([r, v]) => [r, Math.round(v * th(state))]));

export function crisesState(state) {
  const C = state.crises && typeof state.crises === 'object' && !Array.isArray(state.crises) ? state.crises : (state.crises = {});
  if (!Array.isArray(C.active)) C.active = [];
  C.active = C.active.filter((c) => c && CRISES[c.type] && Number.isFinite(c.nextAt));
  if (!Array.isArray(C.history)) C.history = [];
  C.cooldownUntil = Number.isFinite(C.cooldownUntil) ? C.cooldownUntil : 0;
  C.stats ||= { opened: 0, resolved: 0, endured: 0, interventions: 0, regent: 0, revolts: 0, burnt: 0, maxStage: 0 };
  return C;
}

export const crisisDef = (c) => CRISES[c.type];
export const stageOf = (c) => CRISES[c.type].stages[c.stage];
export const activeCrises = (state) => crisesState(state).active;

// Coût réel d'une intervention (ressources du royaume ou de la réserve)
export function interventionCost(state, iv) {
  return { stock: scaleTh(state, iv.costPerTh), reserve: scaleTh(state, iv.reservePerTh) };
}
export function interventionStatus(state, c, iv) {
  if (!iv.stages.includes(c.stage)) return { ok: false, reason: 'Pas à cette étape' };
  if (iv.delayH && c.delayed) return { ok: false, reason: 'Déjà utilisé pour cette crise' };
  const cost = interventionCost(state, iv);
  if (Object.keys(cost.reserve).length && !canDraw(state, cost.reserve)) return { ok: false, reason: 'Réserve royale insuffisante', cost };
  if (Object.keys(cost.stock).length && !Object.entries(cost.stock).every(([r, v]) => (state.resources[r] || 0) >= v)) return { ok: false, reason: 'Ressources insuffisantes', cost, missing: missing(state, cost.stock) };
  return { ok: true, cost };
}

/** Ouvre une crise. extra.burnt (incendie) : bâtiments déjà en feu. Renvoie la crise ou null. */
export function openCrisis(state, type, now = Date.now(), extra = {}) {
  const def = CRISES[type];
  if (!def || thLevel(state) < CRISIS.minTh) return null;
  const C = crisesState(state);
  if (type === 'fire') { if (C.active.some((c) => c.type === 'fire')) return null; }
  else if (C.active.some((c) => c.type !== 'fire') || C.cooldownUntil > now) return null;
  const c = { id: uid('cr'), type, stage: 0, start: now, stageAt: now, nextAt: now + def.stages[0].hours * H, delayed: false, log: [], burnt: extra.burnt || [] };
  C.active.push(c);
  C.stats.opened++;
  note(c, now, `${def.stages[0].icon} ${def.stages[0].name}`);
  log(state, 'bad', `${def.icon} Crise : ${def.name} — ${def.stages[0].name}. ${def.stages[0].text}`, now);
  toast(`${def.icon} Crise : ${def.name}`, 'bad');
  if (type === 'fire' && extra.guarded) c.guarded = true;
  if (extra.contained) c.contained = true; // v15 : préparatifs partiels, la crise s'arrête après sa première étape
  regent(state, c, now);
  return c;
}

const note = (c, t, text) => { c.log.push({ t, text }); if (c.log.length > 12) c.log.shift(); };

function enterStage(state, c, idx, t) {
  const def = CRISES[c.type];
  c.stage = idx; c.stageAt = t; c.nextAt = t + def.stages[idx].hours * H;
  const st = def.stages[idx];
  crisesState(state).stats.maxStage = Math.max(crisesState(state).stats.maxStage, idx);
  note(c, t, `${st.icon} ${st.name}`);
  log(state, 'bad', `${def.icon} ${def.name} : ${st.name}. ${st.text}`, t);
  if (st.revolt) revolt(state, c, t);
  regent(state, c, t);
}

// Jacquerie : une province instable bascule en révolte — de préférence une frontière contestée
function revolt(state, c, t) {
  const terr = Object.values(state.territories || {}).filter((x) => !x.revolt);
  const contested = terr.filter((x) => borderOf(state, x)?.kind === 'contested' && stabOf(x) < 60);
  const target = (contested.length ? contested : terr.filter((x) => stabOf(x) < 45)).sort((a, b) => stabOf(a) - stabOf(b))[0];
  if (!target) { note(c, t, 'Les provinces tiennent bon'); return; }
  target.revolt = true;
  target.stability = Math.min(stabOf(target), 30);
  crisesState(state).stats.revolts++;
  note(c, t, `Révolte : ${target.name}`);
  log(state, 'bad', `🔥 La jacquerie gagne la province « ${target.name} » : elle se soulève.`, t);
}

// Incendie : vague de propagation à l'échéance de chaque étape « spread »
function fireWave(state, c, t) {
  const burnt = spreadWave(state, c);
  crisesState(state).stats.burnt += burnt.length;
  if (burnt.length) { note(c, t, `Le feu gagne : ${burnt.map((b) => BUILDINGS[b.type]?.name || b.type).join(', ')}`); log(state, 'bad', `🔥 L’incendie se propage : ${burnt.map((b) => BUILDINGS[b.type]?.name || b.type).join(', ')}.`, t); }
  else note(c, t, 'Le feu ne trouve plus à se nourrir');
  return burnt.length;
}

function end(state, c, outcome, t) {
  const C = crisesState(state);
  const def = CRISES[c.type];
  C.active = C.active.filter((x) => x.id !== c.id);
  if (c.type !== 'fire') C.cooldownUntil = t + CRISIS.cooldownH * H;
  C.stats[outcome === 'resolved' ? 'resolved' : 'endured']++;
  const h = { id: c.id, type: c.type, outcome, stage: c.stage, start: c.start, end: t, how: c.how || null, burnt: c.burnt.length };
  C.history.unshift(h);
  C.history.length = Math.min(C.history.length, CRISIS.historyKeep);
  const st = def.stages[c.stage];
  const text = outcome === 'resolved'
    ? `${def.icon} ${def.name} surmontée à l’étape « ${st.name} »${c.how ? ` : ${c.how.toLowerCase()}` : ''}.`
    : `${def.icon} ${def.name} subie jusqu’au bout (${st.name}).`;
  log(state, outcome === 'resolved' ? 'good' : 'bad', text, t);
  if (c.type !== 'fire' || c.burnt.length >= 3) chronicle(state, text, t, 'event', `crisis:${c.id}`);
}

/** Intervention du joueur (ou du régent). */
export function intervene(state, crisisId, ivId, now = Date.now(), byRegent = false) {
  const C = crisesState(state);
  const c = C.active.find((x) => x.id === crisisId);
  if (!c) return { ok: false, reason: 'Crise terminée' };
  const iv = CRISES[c.type].interventions.find((x) => x.id === ivId);
  if (!iv) return { ok: false, reason: 'Intervention inconnue' };
  const st = interventionStatus(state, c, iv);
  if (!st.ok) return st;
  if (Object.keys(st.cost.stock).length && !pay(state, st.cost.stock)) return { ok: false, reason: 'Ressources insuffisantes' };
  if (Object.keys(st.cost.reserve).length) drawReserve(state, st.cost.reserve);
  for (const [g, v] of Object.entries(iv.favor || {})) shiftFavor(state, g, v, `${CRISES[c.type].name} : ${iv.label.toLowerCase()}`, now);
  if (iv.buff) state.buffs.push({ name: iv.buff.name, mods: iv.buff.mods, until: now + iv.buff.hours * H });
  if (iv.calm) for (const t of Object.values(state.territories || {})) { t.stability = Math.min(100, stabOf(t) + iv.calm); if (t.revolt && t.stability >= 45) t.revolt = false; }
  C.stats.interventions++;
  if (byRegent) C.stats.regent++;
  note(c, now, `${byRegent ? 'Le régent' : 'Vous'} : ${iv.label}`);
  log(state, 'good', `${iv.icon} ${byRegent ? 'En votre absence, le régent ordonne : ' : ''}${iv.label}.`, now);
  if (iv.resolve) { c.how = iv.label; end(state, c, 'resolved', now); return { ok: true, resolved: true }; }
  if (iv.toStage != null) { c.how = iv.label; enterStage(state, c, iv.toStage, now); return { ok: true }; }
  if (iv.delayH) { c.delayed = true; c.nextAt += iv.delayH * H; return { ok: true, delayed: true }; }
  return { ok: true };
}

// Le régent n'emploie que la réserve, seulement si la consigne est active, et seulement quand la crise s'aggrave
// (à partir de la 2e étape) : la première étape reste toujours la décision du joueur présent.
function regent(state, c, t) {
  const R = state.reserve;
  if (!R || R.regent === false || c.stage < 1) return;
  reserveState(state);
  for (const iv of CRISES[c.type].interventions) {
    if (!iv.reservePerTh || iv.costPerTh) continue;
    if (interventionStatus(state, c, iv).ok) { intervene(state, c.id, iv.id, t, true); return; }
  }
}

/** Tick : fait avancer les étapes échues (rattrapage hors ligne compris). */
export function crisisTick(state, now = Date.now()) {
  if (!state.crises) return;
  const C = crisesState(state);
  for (const c of [...C.active]) {
    let guard = 0;
    while (C.active.includes(c) && c.nextAt <= now && guard++ < 10) {
      const t = c.nextAt;
      const def = CRISES[c.type], st = def.stages[c.stage];
      if (st.spread) {
        fireWave(state, c, t);
        // La garde accourt : maîtrisé après la première vague (sans frais)
        if (c.guarded && def.stages[c.stage + 1]?.spread) { c.how = 'La garde a maîtrisé le feu'; enterStage(state, c, def.stages.findIndex((s) => !s.spread), t); continue; }
      }
      if (c.contained && c.stage === 0) { c.how = 'Préparatifs partiels : crise contenue'; const st0 = crisesState(state).stats; st0.contained = (st0.contained || 0) + 1; end(state, c, 'resolved', t); continue; }
      if (c.stage >= def.stages.length - 1) end(state, c, 'endured', t);
      else enterStage(state, c, c.stage + 1, t);
    }
  }
}

// Famine : si la consigne du régent est active, la nourriture de la réserve est rendue au royaume
export function famineRelief(state, now = Date.now()) {
  if (!state.famine || state.reserve?.regent === false || !(state.reserve?.stock?.food > 0)) return null;
  const r = releaseFood(state, now);
  if (r.ok) crisesState(state).stats.regent++;
  return r;
}

// ───────── Effets des étapes en cours (lus par les autres systèmes) ─────────
export function crisisMods(state) {
  const m = {};
  for (const c of state.crises?.active || []) for (const [k, v] of Object.entries(stageOf(c)?.mods || {})) m[k] = (m[k] || 0) + v;
  return m;
}
export function crisisPrice(state, r) {
  let k = 1;
  for (const c of state.crises?.active || []) k *= stageOf(c)?.price?.[r] || 1;
  return k;
}
export function crisisCouncil(state) {
  const out = [];
  for (const c of state.crises?.active || []) for (const [g, v] of Object.entries(stageOf(c)?.council || {})) out.push([g, `${CRISES[c.type].name} : ${stageOf(c).name.toLowerCase()}`, v]);
  return out;
}
export function crisisStab(state) {
  let v = 0, label = null;
  for (const c of state.crises?.active || []) { const s = stageOf(c)?.stab || 0; if (s < v) { v = s; label = `${CRISES[c.type].name} : ${stageOf(c).name.toLowerCase()}`; } }
  return v ? [label, v] : null;
}

// Fil des répercussions : la chaîne lisible pour l'interface (cause → étapes, interventions avec leur coût)
export function crisisThread(state, c) {
  const def = CRISES[c.type];
  return {
    id: c.id, name: def.name, icon: def.icon, nextAt: c.nextAt, stage: c.stage, guarded: !!c.guarded,
    stages: def.stages.map((s, i) => ({ ...s, state: i < c.stage ? 'past' : i === c.stage ? 'now' : 'next', effects: stageEffects(s) })),
    interventions: def.interventions.filter((iv) => iv.stages.includes(c.stage)).map((iv) => ({ ...iv, status: interventionStatus(state, c, iv), cost: interventionCost(state, iv) })),
    log: c.log,
  };
}
export function stageEffects(s) {
  const out = [];
  for (const [k, v] of Object.entries(s.mods || {})) out.push(`${modLabel(k)} ${v > 0 ? '+' : '−'}${Math.round(Math.abs(v) * 100)} %`);
  for (const [r, v] of Object.entries(s.price || {})) out.push(`prix ${RESOURCES[r]?.name.toLowerCase() || r} +${Math.round((v - 1) * 100)} %`);
  for (const [g, v] of Object.entries(s.council || {})) out.push(`${GROUPS[g].icon} ${v}`);
  if (s.stab) out.push(`stabilité des provinces ${s.stab}`);
  if (s.revolt) out.push('une province instable se soulève');
  if (s.spread) out.push('propagation aux voisins');
  return out;
}
const MOD_LABELS = { 'prod.all': 'production', 'prod.food': 'nourriture', 'prod.steel': 'acier', 'caravan.speed': 'vitesse des caravanes', 'march.speed': 'vitesse des marches', 'train.speed': 'entraînement', upkeep: 'entretien' };
const modLabel = (k) => MOD_LABELS[k] || k;
void fmt;
