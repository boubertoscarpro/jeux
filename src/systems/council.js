// Conseil royal et conflits d'intérêts (voir data/council.js).
import { GROUPS, GROUP_ORDER, COUNCIL, COUNCIL_MIN_TH, POLICY_PRESSURE, MOTIONS } from '../data/council.js';
import { rng } from '../core/rng.js';
import { fmt } from '../core/util.js';
import { RESOURCES } from '../data/resources.js';
import { UNITS } from '../data/units.js';
import { thLevel } from './city.js';
import { activePolicy } from './policy.js';
import { pay, missing, gain } from './economy.js';
import { computeMods } from './modifiers.js';
import { chronicle } from './chronicle.js';
import { log, toast } from './log.js';
import { crisisCouncil } from './crises.js';

export function councilState(state) {
  const c = (state.council && typeof state.council === 'object') ? state.council : (state.council = {});
  c.favor ||= {};
  for (const g of GROUP_ORDER) if (!Number.isFinite(c.favor[g])) c.favor[g] = 50;
  if (!Array.isArray(c.memory)) c.memory = [];
  if (!Array.isArray(c.history)) c.history = [];
  c.motion ??= null;
  c.nextAt ||= 0;
  return c;
}

export const favorOf = (state, g) => Math.max(0, Math.min(100, state.council?.favor?.[g] ?? 50));
export function moodOf(v) {
  if (v >= COUNCIL.loyal) return { key: 'loyal', name: 'Loyal', icon: '😊' };
  if (v <= COUNCIL.hostile) return { key: 'hostile', name: 'Hostile', icon: '😠' };
  return { key: 'neutral', name: 'Réservé', icon: '😐' };
}

// Pressions visibles qui orientent la faveur de chaque groupe (affichées dans la vue)
export function councilPressures(state, now = Date.now()) {
  const out = Object.fromEntries(GROUP_ORDER.map((g) => [g, []]));
  const push = (g, label, v) => out[g].push([label, v]);
  const pol = activePolicy(state, now);
  for (const [g, v] of Object.entries(POLICY_PRESSURE[pol] || {})) push(g, `Priorité royale`, v);
  if (state.famine) push('peasants', 'Famine', -20);
  const terr = Object.values(state.territories || {});
  const high = terr.filter((t) => t.tax === 'high').length, low = terr.filter((t) => t.tax === 'low').length;
  if (high) push('peasants', `Impôts lourds (${high} province${high > 1 ? 's' : ''})`, -4 * high);
  if (low) { push('peasants', `Impôts légers (${low} province${low > 1 ? 's' : ''})`, 3 * low); push('nobles', 'Impôts légers', -2 * low); }
  if (state.war?.active) { push('army', 'Campagne militaire en cours', 10); push('merchants', 'Guerre (commerce perturbé)', -6); }
  if ((state.queues?.research || []).length) push('scholars', 'Recherche en cours', 5); else push('scholars', 'Aucune recherche', -8);
  if ((state.caravans || []).length) push('merchants', 'Caravanes sur les routes', 4);
  if (state.projects?.active) push('nobles', 'Grand projet en chantier', 5);
  for (const m of state.council?.memory || []) if (m.until > now) push(m.g, m.label, m.v);
  // v14 : les crises en cours pèsent sur les groupes (le pain cher fâche les villages, etc.)
  for (const [g, label, v] of crisisCouncil(state)) push(g, label, v);
  return out;
}

export function councilTarget(state, g, now = Date.now()) {
  return Math.max(0, Math.min(100, 50 + councilPressures(state, now)[g].reduce((a, [, v]) => a + v, 0)));
}

export function councilMods(state) {
  const m = {};
  if (!state.council || thLevel(state) < COUNCIL_MIN_TH) return m;
  for (const g of GROUP_ORDER) {
    const k = moodOf(favorOf(state, g)).key;
    if (k === 'neutral') continue;
    for (const [mk, v] of Object.entries(GROUPS[g][k].mods)) m[mk] = (m[mk] || 0) + v;
  }
  return m;
}
// Effet de l'Assemblée des villages sur la stabilité des provinces (utilisé par stabilityFactors)
export function councilStab(state) {
  if (!state.council || thLevel(state) < COUNCIL_MIN_TH) return 0;
  const k = moodOf(favorOf(state, 'peasants')).key;
  return k === 'neutral' ? 0 : GROUPS.peasants[k].stab || 0;
}

const th = (state) => Math.max(1, thLevel(state));
const scale = (o, k) => Object.fromEntries(Object.entries(o || {}).map(([r, v]) => [r, Math.round(v * k)]));
export function optionCost(state, opt) {
  const c = { ...(opt.cost || {}) };
  for (const [r, v] of Object.entries(scale(opt.costPerTh, th(state)))) c[r] = (c[r] || 0) + v;
  return c;
}
export function optionText(state, opt) {
  const parts = [];
  for (const [g, v] of Object.entries(opt.favor || {})) parts.push(`${GROUPS[g].icon} ${v > 0 ? '+' : ''}${v}`);
  if (opt.resPerTh) parts.push(Object.entries(scale(opt.resPerTh, th(state))).map(([r, v]) => `+${fmt(v)} ${RESOURCES[r]?.icon || r}`).join(' '));
  if (opt.units) parts.push(Object.entries(opt.units).map(([u, n]) => `+${n * th(state)} ${UNITS[u]?.name || u}`).join(', '));
  if (opt.buff) parts.push(`${opt.buff.name} (${opt.buff.hours} h)`);
  if (opt.stab) parts.push(`stabilité des provinces ${opt.stab > 0 ? '+' : ''}${opt.stab}`);
  return parts.join(' · ');
}

// Variation de faveur réutilisée par les interventions de crise (v14)
export const shiftFavor = (state, g, v, label, now = Date.now()) => changeFavor(state, g, v, label, now);
function changeFavor(state, g, v, label, now) {
  const c = councilState(state);
  c.favor[g] = Math.max(0, Math.min(100, c.favor[g] + v));
  // La moitié de l'effet reste en mémoire (48 h) : la décision pèse durablement sur la cible
  c.memory.push({ g, v: Math.round(v / 2), label, until: now + COUNCIL.memoryH * 3600000 });
}

// Choisit la prochaine motion : de préférence celle d'un groupe mécontent, jamais la même deux fois de suite
export function pickMotion(state) {
  const c = councilState(state);
  const last = c.history[0]?.id;
  // « Distribuer le grain » parle d'une mauvaise récolte : proposée seulement quand la nourriture manque vraiment
  const hungry = state.famine || (state.crises?.active || []).some((c) => c.type === 'drought');
  const ids = Object.keys(MOTIONS).filter((id) => id !== last && (id !== 'grain' || hungry));
  return rng.weighted(Object.fromEntries(ids.map((id) => [id, 1 + Math.max(0, 50 - favorOf(state, MOTIONS[id].group)) / 10])));
}

export function openMotion(state, id = null, now = Date.now()) {
  const c = councilState(state);
  id = id || pickMotion(state);
  if (!MOTIONS[id]) return null;
  c.motion = { id, at: now, deadline: now + COUNCIL.deadlineH * 3600000 };
  const mo = MOTIONS[id];
  log(state, 'info', `🏛️ Le conseil royal est réuni : ${GROUPS[mo.group].leader} (${GROUPS[mo.group].name}) présente « ${mo.title} ».`, now);
  toast(`🏛️ Motion au conseil : ${mo.title}`, 'info');
  return c.motion;
}

export function decideMotion(state, i, now = Date.now()) {
  const c = councilState(state);
  const mo = c.motion && MOTIONS[c.motion.id];
  if (!mo) return { ok: false, reason: 'Aucune motion en cours' };
  const opt = mo.options[i];
  if (!opt) return { ok: false, reason: 'Option inconnue' };
  const cost = optionCost(state, opt);
  if (Object.keys(cost).length && !pay(state, cost)) return { ok: false, reason: 'Ressources insuffisantes', missing: missing(state, cost) };
  for (const [g, v] of Object.entries(opt.favor || {})) changeFavor(state, g, v, `« ${mo.title} » : ${opt.label.toLowerCase()}`, now);
  if (opt.resPerTh) gain(state, scale(opt.resPerTh, th(state)), computeMods(state, now));
  if (opt.units) for (const [u, n] of Object.entries(opt.units)) state.army[u] = (state.army[u] || 0) + n * th(state);
  if (opt.buff) state.buffs.push({ name: opt.buff.name, mods: opt.buff.mods, until: now + opt.buff.hours * 3600000 });
  if (opt.stab) for (const t of Object.values(state.territories || {})) t.stability = Math.max(0, Math.min(100, (Number.isFinite(t.stability) ? t.stability : 70) + opt.stab));
  c.history.unshift({ id: c.motion.id, choice: i, t: now });
  c.history.length = Math.min(c.history.length, 30);
  c.motion = null;
  c.nextAt = now + COUNCIL.sessionH * 3600000;
  chronicle(state, `Le conseil royal tranche « ${mo.title} » : ${opt.label.toLowerCase()}.`, now);
  return { ok: true, text: optionText(state, opt) };
}

// Tick : dérive des faveurs, motions, motion ignorée
export function councilTick(state, now = Date.now()) {
  const c = councilState(state);
  if (thLevel(state) < COUNCIL_MIN_TH) { c.nextAt = 0; return; }
  const last = c.tickAt || now;
  const h = Math.max(0, Math.min(12, (now - last) / 3600000));
  c.tickAt = now;
  c.memory = c.memory.filter((m) => m.until > now);
  for (const g of GROUP_ORDER) {
    const target = councilTarget(state, g, now), cur = c.favor[g], step = COUNCIL.drift * h;
    c.favor[g] = cur < target ? Math.min(target, cur + step) : Math.max(target, cur - step);
  }
  if (c.motion && c.motion.deadline <= now) {
    const mo = MOTIONS[c.motion.id];
    changeFavor(state, mo.group, COUNCIL.ignorePenalty, `« ${mo.title} » ignorée`, now);
    log(state, 'bad', `🏛️ Le conseil n’a pas tranché « ${mo.title} » : ${GROUPS[mo.group].name} se sent méprisé(e).`, now);
    c.history.unshift({ id: c.motion.id, choice: -1, t: now });
    c.motion = null;
    c.nextAt = now + COUNCIL.sessionH * 3600000;
  }
  if (!c.motion) {
    if (!c.nextAt) c.nextAt = now + 30 * 60000; // première session peu après l'ouverture du conseil
    else if (c.nextAt <= now) openMotion(state, null, now);
  }
}
