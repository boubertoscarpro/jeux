// Héritage dynastique (voir data/legacy.js) : traditions, archives, vestiges et défis ancestraux.
import { TRADITIONS, MAX_TRADITIONS, MILESTONES, REMNANTS, ANCESTRAL } from '../data/legacy.js';
import { PROJECTS } from '../data/projects.js';
import { RIVALS } from '../data/world.js';
import { rng } from '../core/rng.js';
import { uid } from '../core/util.js';
import { thLevel } from './city.js';
import { pay, missing, gain } from './economy.js';
import { computeMods } from './modifiers.js';
import { isRevealed, wTerrain, findFreeTile, key, distCap } from './world.js';
import { canClaim } from './territory.js';
import { changeRelation } from './factions.js';
import { castleName } from './identity.js';
import { chronicle } from './chronicle.js';
import { log, toast } from './log.js';

export const ordinal = (n) => (n === 1 ? '1re' : `${n}e`);

export function legacyState(state) {
  const l = (state.legacy && typeof state.legacy === 'object') ? state.legacy : (state.legacy = {});
  if (!Array.isArray(l.traditions)) l.traditions = [];
  l.traditions = l.traditions.filter((id) => TRADITIONS[id]);
  l.milestones ||= {};
  l.offer ??= null;
  if (!Array.isArray(l.archives)) l.archives = [];
  if (!Array.isArray(l.remnants)) l.remnants = [];
  if (!Array.isArray(l.challenges)) l.challenges = [];
  return l;
}

export function legacyMods(state) {
  const m = {};
  const add = (o) => { for (const [k, v] of Object.entries(o || {})) m[k] = (m[k] || 0) + v; };
  for (const id of state.legacy?.traditions || []) add(TRADITIONS[id]?.mods);
  for (const r of state.legacy?.remnants || []) if (r.kind === 'monument' && r.restored) add(REMNANTS.monument.mods);
  return m;
}

// ── Traditions ──
function milestoneMet(state, id) {
  const th = thLevel(state);
  if (id === 'th8') return th >= 8;
  if (id === 'th12') return th >= 12;
  if (id === 'feat') return Object.keys(state.projects?.done || {}).length > 0 || (state.war?.history || []).some((h) => h.won) || Object.keys(state.archaeo?.solved || {}).length > 0;
  return false;
}

export function makeOffer(state, milestone) {
  const l = legacyState(state);
  const pool = Object.keys(TRADITIONS).filter((id) => !l.traditions.includes(id));
  const choices = [];
  while (choices.length < 3 && pool.length) choices.push(pool.splice(Math.floor(rng.random() * pool.length), 1)[0]);
  l.offer = { milestone, choices };
  return l.offer;
}

export function chooseTradition(state, id, now = Date.now()) {
  const l = legacyState(state);
  if (!l.offer) return { ok: false, reason: 'Aucune tradition à choisir pour l’instant' };
  if (!l.offer.choices.includes(id)) return { ok: false, reason: 'Tradition non proposée' };
  if (l.traditions.length >= MAX_TRADITIONS) return { ok: false, reason: `${MAX_TRADITIONS} traditions au maximum` };
  l.traditions.push(id);
  l.milestones[l.offer.milestone] = now;
  l.offer = null;
  chronicle(state, `La dynastie adopte une tradition qui se transmettra aux générations futures : ${TRADITIONS[id].name}.`, now);
  return { ok: true, name: TRADITIONS[id].name };
}

// Remplace une tradition existante (quand les 5 emplacements sont pris) : l'étape est consommée
export function replaceTradition(state, oldId, newId, now = Date.now()) {
  const l = legacyState(state);
  if (!l.offer?.choices.includes(newId)) return { ok: false, reason: 'Tradition non proposée' };
  const i = l.traditions.indexOf(oldId);
  if (i < 0) return { ok: false, reason: 'Tradition inconnue' };
  l.traditions.splice(i, 1, newId);
  l.milestones[l.offer.milestone] = now;
  l.offer = null;
  return { ok: true, name: TRADITIONS[newId].name };
}

export function declineOffer(state, now = Date.now()) {
  const l = legacyState(state);
  if (!l.offer) return { ok: false, reason: 'Aucune tradition proposée' };
  l.milestones[l.offer.milestone] = now;
  l.offer = null;
  return { ok: true };
}

// ── Archives et vestiges ──
export function archiveOf(state, now = Date.now()) {
  const c = state.world?.capital || { x: 0, y: 0 };
  const outposts = Object.values(state.territories || {}).sort((a, b) => (b.level || 1) - (a.level || 1)).slice(0, ANCESTRAL.maxForts)
    .map((t) => ({ name: t.name, dx: t.x - c.x, dy: t.y - c.y, level: t.level || 1, spec: t.spec || null }));
  const allies = (state.factions || []).filter((f) => ['alliance', 'trade', 'tributary'].includes(f.stance)).map((f) => RIVALS[f.idx]?.name).filter(Boolean);
  const foes = (state.factions || []).filter((f) => f.stance === 'war' || f.relation <= -50).map((f) => RIVALS[f.idx]?.name).filter(Boolean);
  return {
    n: (state.dynasty?.count || 0) + 1, kingdom: state.meta.kingdomName, castle: castleName(state), lord: state.meta.lordName,
    from: state.meta.created, to: now, th: thLevel(state), outposts,
    projects: Object.keys(state.projects?.done || {}), mysteries: Object.keys(state.archaeo?.solved || {}),
    victories: (state.war?.history || []).filter((h) => h.won).length, allies, foes,
    battles: state.stats?.battlesWon || 0, bosses: state.stats?.bossKills || 0, traditions: [...(state.legacy?.traditions || [])],
  };
}

// Appelé par foundDynasty : transmet traditions et archives, place les vestiges et les liens ancestraux
export function applyLegacy(old, ns, now = Date.now()) {
  const ol = legacyState(old), nl = legacyState(ns);
  const arch = archiveOf(old, now);
  nl.traditions = [...ol.traditions];
  nl.archives = [arch, ...ol.archives].slice(0, 20);
  const w = ns.world, c = w.capital;
  // Forteresses abandonnées aux emplacements des anciens avant-postes (même position relative à la capitale)
  for (const o of arch.outposts) {
    const x = Math.max(0, Math.min(w.size - 1, c.x + o.dx)), y = Math.max(0, Math.min(w.size - 1, c.y + o.dy));
    const p = findFreeTile(w, x, y, null, 3) || { x, y };
    nl.remnants.push({ id: uid('rm'), kind: 'fort', name: `${REMNANTS.fort.name} « ${o.name} »`, oldName: o.name, level: Math.min(3, o.level), x: p.x, y: p.y, dynasty: arch.n, done: null });
  }
  // Monuments des grands projets achevés (non rebâtis automatiquement : à restaurer)
  arch.projects.slice(0, 3).forEach((id, i) => {
    const mk = PROJECTS[id]?.mark || { dx: 2, dy: 2 };
    const p = findFreeTile(w, c.x - mk.dx * 2 + i, c.y - mk.dy * 2, null, 3) || { x: c.x + 4 + i, y: c.y + 4 };
    nl.remnants.push({ id: uid('rm'), kind: 'monument', name: `Monument : ${PROJECTS[id]?.name || id}`, x: p.x, y: p.y, dynasty: arch.n, restored: false });
  });
  // Anciennes alliances et rancunes : une faction du nouveau monde s'en souvient
  const pool = [...(ns.factions || [])];
  const pickF = () => (pool.length ? pool.splice(Math.floor(rng.random() * pool.length), 1)[0] : null);
  if (arch.allies.length) {
    const f = pickF();
    if (f) { changeRelation(ns, f.idx, ANCESTRAL.allyRelation); f.ancestral = 'ally'; chronicle(ns, `${RIVALS[f.idx]?.name} se souvient de l’amitié de la dynastie passée (relation +${ANCESTRAL.allyRelation}).`, now); }
  }
  if (arch.foes.length) {
    const f = pickF();
    if (f) {
      changeRelation(ns, f.idx, ANCESTRAL.grudgeRelation); f.ancestral = 'grudge';
      nl.challenges.push({ id: 'grudge', faction: f.idx, text: `Laver l’affront : remporter une campagne militaire contre ${RIVALS[f.idx]?.name}, qui garde rancune à votre lignée`, points: ANCESTRAL.challengePoints, done: null });
    }
  }
  if (nl.traditions.includes('diplomats')) for (const f of ns.factions || []) changeRelation(ns, f.idx, TRADITIONS.diplomats.relation);
  nl.challenges.push({ id: 'surpass', th: arch.th, text: `Surpasser les ancêtres : atteindre l’hôtel de ville niveau ${arch.th}`, points: ANCESTRAL.surpassPoints, done: null });
  return nl;
}

export function remnantCheck(state, i, mode, now = Date.now()) {
  const r = legacyState(state).remnants[i];
  if (!r) return { ok: false, reason: 'Vestige introuvable' };
  if (r.done || r.restored) return { ok: false, reason: 'Vestige déjà exploité' };
  if (!isRevealed(state.world, r.x, r.y)) return { ok: false, reason: 'Vestige non découvert : explorez les environs' };
  if (r.kind === 'monument') return { ok: true, cost: REMNANTS.monument.restore() };
  if (mode === 'loot') return { ok: true, cost: {}, gain: REMNANTS.fort.loot(r.level) };
  const c = canClaim(state, r.x, r.y, now);
  if (!c.ok) return { ok: false, reason: c.reason };
  return { ok: true, cost: REMNANTS.fort.restore(r.level) };
}

export function useRemnant(state, i, mode = 'restore', now = Date.now()) {
  const c = remnantCheck(state, i, mode, now);
  if (!c.ok) return c;
  const r = state.legacy.remnants[i];
  if (Object.keys(c.cost).length && !pay(state, c.cost)) return { ok: false, reason: 'Ressources insuffisantes', missing: missing(state, c.cost) };
  if (r.kind === 'monument') {
    r.restored = now;
    chronicle(state, `Un monument de la ${ordinal(r.dynasty)} dynastie est restauré : ${r.name.replace('Monument : ', '')}.`, now);
    return { ok: true, text: 'Production +2 % (permanent)' };
  }
  if (mode === 'loot') {
    gain(state, c.gain, computeMods(state, now));
    r.done = 'loot';
    return { ok: true, text: 'Les ruines sont démontées et leurs matériaux rapportés' };
  }
  const t = { id: uid('op'), name: r.oldName, x: r.x, y: r.y, terrain: wTerrain(state.world, r.x, r.y), since: now, spec: null, level: r.level, garrison: {}, heritage: r.dynasty };
  state.territories[key(r.x, r.y)] = t;
  r.done = 'restore';
  chronicle(state, `La forteresse « ${r.oldName} », bâtie par la ${ordinal(r.dynasty)} dynastie, est relevée et redevient un avant-poste.`, now);
  return { ok: true, text: `Avant-poste « ${r.oldName} » relevé au niveau ${r.level}` };
}

// Tick : étapes, défis ancestraux
export function legacyTick(state, now = Date.now()) {
  const l = legacyState(state);
  if (!l.offer) {
    for (const id of Object.keys(MILESTONES)) {
      if (l.milestones[id] || !milestoneMet(state, id)) continue;
      makeOffer(state, id);
      log(state, 'good', `👑 ${MILESTONES[id].name} : choisissez une tradition dynastique (onglet Héritage).`, now);
      toast('👑 Une tradition dynastique peut être choisie', 'good');
      break;
    }
  }
  for (const ch of l.challenges) {
    if (ch.done) continue;
    const ok = ch.id === 'surpass' ? thLevel(state) >= ch.th : ch.id === 'grudge' ? (state.war?.history || []).some((h) => h.won && h.faction === ch.faction) : false;
    if (!ok) continue;
    ch.done = now;
    if (state.dynasty) state.dynasty.points = (state.dynasty.points || 0) + ch.points;
    chronicle(state, `Défi ancestral accompli : ${ch.text}. +${ch.points} points d’héritage.`, now);
    toast(`👑 Défi ancestral accompli (+${ch.points} points d’héritage)`, 'good');
  }
}

export const remnantDist = (state, r) => (state.world ? distCap(state.world, r.x, r.y) : 0);
