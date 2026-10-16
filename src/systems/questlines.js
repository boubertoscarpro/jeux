// Quêtes du royaume : chaînes à étapes (voir data/questlines.js). Une quête s'ouvre quand sa condition est remplie ;
// chaque étape mesure la progression depuis son ouverture (instantané des statistiques), se valide toute seule et
// sa récompense se réclame une fois. Complète le parcours guidé (chapitres) sans le remplacer.
import { QUESTLINES, QUESTLINE_BY_ID } from '../data/questlines.js';
import { countOf, levelOf } from './city.js';
import { combatUnitCount } from './army.js';
import { computeMods } from './modifiers.js';
import { netRates, roadConnected } from './economy.js';
import { outpostStatus } from './territory.js';
import { grantReward } from './rewards.js';
import { chronicle } from './chronicle.js';
import { log, toast } from './log.js';
import { pay, missing } from './economy.js';
import { bumpRep } from './reputation.js';
import { remember } from './rivalry.js';
import { RIVALS } from '../data/world.js';
import { collectionStatus } from './collection.js';
import { RESOURCES } from '../data/resources.js';
import { fmt } from '../core/util.js';

export function qlState(state) {
  const q = (state.questlines && typeof state.questlines === 'object' && !Array.isArray(state.questlines)) ? state.questlines : (state.questlines = {});
  for (const k of ['active', 'done', 'claimed']) if (!q[k] || typeof q[k] !== 'object' || Array.isArray(q[k])) q[k] = {};
  return q;
}

// Texte d'une quête : {faction} est remplacé par la faction concernée (choisie à l'ouverture de la quête)
export function qlText(str, a) {
  return String(str || '').replace(/\{faction\}/g, RIVALS[a?.ctx?.faction]?.name || 'une faction rivale');
}
const scaleCost = (cost, state) => {
  const th = Math.max(1, Object.values(state.city.buildings).find((b) => b.type === 'townhall')?.level || 1);
  return Object.fromEntries(Object.entries(cost || {}).map(([r, v]) => [r, Math.round((v * th) / 10) * 10]));
};
export const choiceCost = (state, opt) => scaleCost(opt.costPerTh, state);

// Instantané des compteurs au moment où une étape s'ouvre
function snapshot(state) {
  const { produced, ...rest } = state.stats || {};
  const base = {};
  for (const [k, v] of Object.entries(rest)) if (typeof v === 'number') base[k] = v;
  base.produced = { ...(produced || {}) };
  return base;
}

function helpers(state, base, a = null) {
  const fac = state.factions?.[a?.ctx?.faction];
  return {
    // Faction concernée par la quête (contexte) : relation, posture, renseignements récents
    rel: () => fac?.relation ?? -100,
    stance: () => fac?.stance || 'neutral',
    intelSince: () => (fac && a?.stepAt ? Object.values(fac.intel || {}).filter((i) => i.t >= a.stepAt).length : 0),
    path: () => a?.path || null,
    collectionsDone: () => { try { return collectionStatus(state).filter((c) => c.done).length; } catch { return 0; } },
    count: countOf,
    level: levelOf,
    d: (k) => Math.max(0, (state.stats?.[k] || 0) - (base?.[k] || 0)),
    prod: (r) => Math.max(0, Math.floor((state.stats?.produced?.[r] || 0) - (base?.produced?.[r] || 0))),
    combatUnits: () => combatUnitCount(state.army),
    foodNet: () => netRates(state, computeMods(state)).food || 0,
    roadLinked: () => [...roadConnected(state)].filter((id) => state.city.buildings[id]?.type !== 'road').length,
    fullOutposts: () => Object.values(state.territories || {}).filter((t) => t.spec && outpostStatus(state, t).eff >= 1).length,
  };
}

function stepProgress(state, line, a, i) {
  const step = line.steps[i];
  if (!step) return { cur: 0, target: 1, done: false };
  if (a.done?.[i]) return { cur: 1, target: 1, done: true };
  let cur = 0, target = 1;
  if (step.choice) return a.choices?.[i] ? { cur: 1, target: 1, done: true } : { cur: 0, target: 1, done: false, choice: true };
  try { [cur, target] = step.check(state, helpers(state, a.base, a)); } catch { cur = 0; }
  return { cur: Math.min(cur, target), target, done: cur >= target };
}

// Ouvre les quêtes débloquées et valide les étapes atteintes ; ne verse jamais de récompense
export function questTick(state, now = Date.now()) {
  const Q = qlState(state);
  const events = [];
  for (const line of QUESTLINES) {
    if (Q.done[line.id]) continue;
    let a = Q.active[line.id];
    if (!a) {
      let ok = false;
      try { ok = line.unlock(state, helpers(state, null)); } catch { ok = false; }
      if (!ok) continue;
      let ctx = null;
      try { ctx = line.ctx ? line.ctx(state) : null; } catch { ctx = null; }
      if (line.ctx && !ctx) continue;
      a = Q.active[line.id] = { step: 0, base: snapshot(state), at: now, stepAt: now, done: {}, claimed: {}, ...(ctx ? { ctx } : {}) };
      log(state, 'story', `${line.icon} Nouvelle quête : « ${qlText(line.title, a)} ». ${qlText(line.intro, a)}`, now);
      events.push({ kind: 'open', line });
    }
    // Plusieurs étapes peuvent se valider d'un coup (ex. retour d'absence) : chacune ouvre la suivante
    for (let guard = 0; guard < line.steps.length && a.step < line.steps.length; guard++) {
      // Étape d'un autre chemin que celui choisi : ignorée (ni progression ni récompense)
      const stp = line.steps[a.step];
      if (stp.path && stp.path !== a.path) { (a.skipped ||= {})[a.step] = now; a.done[a.step] = now; a.claimed[a.step] = now; a.step++; continue; }
      const p = stepProgress(state, line, a, a.step);
      if (!p.done) break;
      a.done[a.step] = now;
      events.push({ kind: 'step', line, i: a.step });
      a.step++;
      a.base = snapshot(state);
      a.stepAt = now;
    }
    if (a.step >= line.steps.length && !Q.done[line.id]) {
      Q.done[line.id] = now;
      const end = line.chronicleText ? line.chronicleText(a) : null;
      chronicle(state, end ? qlText(end, a) : `${line.icon} Quête accomplie : « ${qlText(line.title, a)} ».`, now, line.chronicleKind || 'story', `quest:${line.id}`);
      toast(`${line.icon} Quête accomplie : ${line.title}`, 'good');
      events.push({ kind: 'done', line });
    }
  }
  return events;
}

// Vue détaillée pour l'interface
export function questlineList(state) {
  const Q = qlState(state);
  return QUESTLINES.map((line) => {
    const a = Q.active[line.id];
    const finished = !!Q.done[line.id];
    let unlocked = !!a;
    if (!unlocked) { try { unlocked = !!line.unlock(state, helpers(state, null)); } catch { unlocked = false; } }
    const steps = line.steps.map((st, i) => {
      const done = !!a?.done?.[i];
      const current = !!a && !finished && a.step === i;
      const p = current ? stepProgress(state, line, a, i) : { cur: done ? 1 : 0, target: 1 };
      const skipped = !!a?.skipped?.[i] || (!!st.path && !!a?.path && st.path !== a.path);
      const offPath = !!st.path && !a?.path;
      return { ...st, title: qlText(st.title, a), desc: qlText(st.desc, a), i, done, current, skipped, offPath, chosen: a?.choices?.[i] || null, claimed: !!a?.claimed?.[i], cur: p.cur, target: p.target, locked: !a || (!done && !current),
        options: st.choice ? st.options.map((o) => ({ ...o, label: qlText(o.label, a), hint: qlText(o.hint, a), cost: choiceCost(state, o), missing: missing(state, choiceCost(state, o)), unmet: o.need ? (() => { try { return o.need(state) || null; } catch { return null; } })() : null })) : null };
    });
    const toClaim = steps.filter((s) => s.done && !s.claimed).length + (finished && !Q.claimed[line.id] ? 1 : 0);
    return { ...line, title: qlText(line.title, a), intro: qlText(line.intro, a), active: !!a, unlocked, finished, finalClaimed: !!Q.claimed[line.id], steps, current: steps.find((s) => s.current) || null, toClaim, stepIndex: a ? Math.min(a.step, line.steps.length) : 0, path: a?.path || null, final: finalOf(line, a) };
  });
}

export const questlinesBadge = (state) => { try { return questlineList(state).reduce((n, l) => n + l.toClaim, 0); } catch { return 0; } };

export function claimQuestStep(state, lineId, i, now = Date.now()) {
  const Q = qlState(state);
  const line = QUESTLINE_BY_ID[lineId];
  const a = Q.active[lineId];
  if (!line || !a) return { ok: false, reason: 'Quête inconnue ou pas encore ouverte' };
  const step = line.steps[i];
  if (!step) return { ok: false, reason: 'Étape inconnue' };
  if (!a.done[i]) return { ok: false, reason: 'Étape pas encore accomplie' };
  if (a.skipped?.[i]) return { ok: false, reason: 'Étape d’un autre chemin' };
  if (a.claimed[i]) return { ok: false, reason: 'Récompense déjà réclamée' };
  a.claimed[i] = now;
  const text = grantReward(state, step.reward, now, `quest:${lineId}:${i}`);
  log(state, 'good', `✅ ${line.title} — ${step.title} : ${text}.`, now);
  return { ok: true, text };
}

export function claimQuestFinal(state, lineId, now = Date.now()) {
  const Q = qlState(state);
  const line = QUESTLINE_BY_ID[lineId];
  if (!line) return { ok: false, reason: 'Quête inconnue' };
  if (!Q.done[lineId]) return { ok: false, reason: 'Quête pas encore terminée' };
  if (Q.claimed[lineId]) return { ok: false, reason: 'Récompense déjà réclamée' };
  Q.claimed[lineId] = now;
  const text = grantReward(state, finalOf(line, Q.active[lineId]) || {}, now, `questFinal:${lineId}`);
  log(state, 'good', `🏆 Quête « ${line.title} » terminée : ${text}.`, now);
  return { ok: true, text };
}

// Récompense finale : peut dépendre du chemin choisi (finalByPath)
function finalOf(line, a) { return (a?.path && line.finalByPath?.[a.path]) || line.final || {}; }

// Choix d'une étape à embranchement : vérifie et paie AVANT d'appliquer ; un seul choix par étape, jamais annulable
export function chooseQuestPath(state, lineId, i, key, now = Date.now()) {
  const Q = qlState(state);
  const line = QUESTLINE_BY_ID[lineId];
  const a = Q.active[lineId];
  if (!line || !a) return { ok: false, reason: 'Quête inconnue ou pas encore ouverte' };
  const step = line.steps[i];
  if (!step?.choice) return { ok: false, reason: 'Cette étape n’est pas un choix' };
  if (a.step !== i) return { ok: false, reason: 'Ce n’est pas l’étape en cours' };
  if (a.choices?.[i]) return { ok: false, reason: 'Choix déjà fait' };
  const opt = step.options.find((o) => o.key === key);
  if (!opt) return { ok: false, reason: 'Option inconnue' };
  if (opt.need) { let why = null; try { why = opt.need(state); } catch { why = 'Condition indisponible'; } if (why) return { ok: false, reason: why }; }
  const cost = choiceCost(state, opt);
  if (Object.keys(cost).length && !pay(state, cost)) return { ok: false, reason: 'Ressources insuffisantes', missing: missing(state, cost) };
  (a.choices ||= {})[i] = key;
  a.claimed[i] = now; // une étape de choix n'a pas de récompense propre
  if (step.setsPath) a.path = key;
  const fx = opt.fx || {};
  const fi = a.ctx?.faction;
  const parts = [];
  if (fx.relation && state.factions?.[fi]) { const f = state.factions[fi]; f.relation = Math.max(-100, Math.min(100, f.relation + fx.relation)); remember(state, fi, 'quest', fx.relation, qlText(fx.memory || opt.label, a), now); parts.push(`relation ${fx.relation > 0 ? '+' : ''}${fx.relation} avec ${RIVALS[fi]?.name}`); }
  if (fx.rep) for (const [k, n] of Object.entries(fx.rep)) bumpRep(state, k, n);
  if (fx.buff) { state.buffs.push({ name: fx.buff.name, mods: fx.buff.mods, until: now + fx.buff.hours * 3600000 }); parts.push(`${fx.buff.name} (${fx.buff.hours} h)`); }
  if (fx.title && !(state.meta.titles || []).includes(fx.title)) { (state.meta.titles ||= []).push(fx.title); parts.push(`titre « ${fx.title} »`); }
  const text = [Object.keys(cost).length ? `payé ${Object.entries(cost).map(([r, v]) => `${fmt(v)} ${RESOURCES[r]?.icon || r}`).join(' ')}` : null, ...parts].filter(Boolean).join(', ');
  if (step.chronicle || opt.chronicle) chronicle(state, qlText(opt.chronicle || `${line.icon} ${line.title} : le souverain choisit « ${opt.label} ».`, a), now, line.chronicleKind || 'story', `questChoice:${lineId}:${i}`);
  log(state, 'story', `${line.icon} ${qlText(line.title, a)} — « ${qlText(opt.label, a)} »${text ? ` : ${text}` : ''}.`, now);
  questTick(state, now);
  return { ok: true, text };
}

// Effets durables d'une quête en cours (ex. route bloquée par une faction) : agrégés dans computeMods
export function questMods(state) {
  const out = {};
  const Q = state.questlines;
  if (!Q?.active) return out;
  for (const line of QUESTLINES) {
    if (!line.whileActive || !Q.active[line.id] || Q.done?.[line.id]) continue;
    for (const [k, v] of Object.entries(line.whileActive)) out[k] = (out[k] || 0) + v;
  }
  return out;
}
