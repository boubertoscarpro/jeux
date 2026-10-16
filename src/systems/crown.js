// Grands Projets du Royaume (data/crown.js) : catalogue, coûts suivant l'économie réelle, lancement (paiement
// complet ou rien), travaux en parallèle, récupération unique de la récompense, répétitions limitées.
// Toutes les validations sont ici (jamais seulement dans l'interface).
import { CROWN_PROJECTS, CROWN_MIN_TH, CROWN_TH_STEP, CROWN_CAP_SHARE, CROWN_REFUND, crownSlots } from '../data/crown.js';
import { RESOURCES, isCapped } from '../data/resources.js';
import { COSMETICS } from '../data/social.js';
import { LIVE_EVENTS } from '../data/liveEvents.js';
import { computeMods } from './modifiers.js';
import { storageCap, canAfford, pay, missing } from './economy.js';
import { levelOf, countOf, thLevel } from './city.js';
import { grantReward } from './rewards.js';
import { liveState, grantGive } from './liveEvents.js';
import { breachState } from './breach.js';
import { chronicle } from './chronicle.js';
import { log, toast } from './log.js';
import { fmt } from '../core/util.js';

const H = 3600000;

export function crownState(state) {
  const C = (state.crown && typeof state.crown === 'object' && !Array.isArray(state.crown)) ? state.crown : (state.crown = {});
  for (const k of ['active', 'done', 'last', 'claimed']) if (!C[k] || typeof C[k] !== 'object' || Array.isArray(C[k])) C[k] = {};
  // Projets inconnus (données retirées) : ignorés sans planter
  for (const id of Object.keys(C.active)) if (!CROWN_PROJECTS[id] || !(C.active[id]?.end > 0)) delete C.active[id];
  return C;
}

const helpers = (s) => ({
  level: (t) => levelOf(s, t),
  count: (t) => countOf(s, t),
  outposts: () => Object.keys(s.territories || {}).length,
  breachDefeated: () => Object.keys(breachState(s).defeated || {}).length,
  // v13 : liens avec la diplomatie, l'archéologie et les campagnes
  pact: () => (s.factions || []).some((f) => f.stance === 'trade' || f.stance === 'alliance'),
  alliance: () => (s.factions || []).some((f) => f.stance === 'alliance'),
  mysteries: () => Object.keys(s.archaeo?.solved || {}).length,
  campaignsWon: () => s.stats?.campaignsWon || 0,
});
const check = (s, list) => (list || []).map(([text, fn]) => { let ok = false; try { ok = !!fn(s, helpers(s)); } catch { ok = false; } return { text, ok }; });

const currentEvent = (state, now) => { const cur = liveState(state).current; return cur && now < cur.end ? cur : null; };
// Clé de répétition d'un projet d'événement : une fois par occurrence d'événement
const eventKey = (cur) => `${cur.key}:${cur.start}`;

// Coût réel au moment présent (voir data/crown.js)
export function crownCost(state, id, mods = computeMods(state)) {
  const def = CROWN_PROJECTS[id];
  const C = crownState(state);
  const n = def.repeat ? (C.done[id] || 0) : 0;
  const k = (1 + CROWN_TH_STEP * Math.max(0, thLevel(state) - def.th)) * (def.repeat ? def.repeat.growth ** n : 1);
  const out = {};
  for (const [r, v] of Object.entries(def.cost)) {
    let c = Math.round((v * k) / 10) * 10;
    if (RESOURCES[r] && isCapped(r)) c = Math.min(c, Math.floor(storageCap(state, mods, r) * CROWN_CAP_SHARE));
    out[r] = Math.max(1, c);
  }
  return out;
}

// Vue complète d'un projet : état (locked / available / cooldown / running / claimable / done), coûts, manque
export function crownInfo(state, id, now = Date.now(), mods = computeMods(state, now)) {
  const def = CROWN_PROJECTS[id];
  const C = crownState(state);
  const th = thLevel(state);
  const run = C.active[id] || null;
  const doneN = C.done[id] || 0;
  const cost = crownCost(state, id, mods);
  const reqs = check(state, def.req);
  const rare = def.rare ? check(state, [def.rare])[0] : null;
  const cur = currentEvent(state, now);
  let status, reason = null;
  if (run) status = run.end <= now ? 'claimable' : 'running';
  else if (!def.repeat && !def.event && doneN > 0) status = 'done';
  else if (def.repeat && doneN >= def.repeat.max) { status = 'done'; reason = `Limite atteinte (${def.repeat.max})`; }
  else {
    status = 'available';
    if (th < Math.max(CROWN_MIN_TH, def.th)) { status = 'locked'; reason = `Hôtel de ville niv. ${Math.max(CROWN_MIN_TH, def.th)} requis`; }
    else if (rare && !rare.ok) { status = 'hidden'; reason = `Haut fait requis : ${rare.text}`; }
    else if (def.event && !cur) { status = 'hidden'; reason = 'Seulement pendant un événement'; }
    else if (def.event && C.last[id] === eventKey(cur)) { status = 'done'; reason = 'Déjà mené pendant cet événement'; }
    else if (def.repeat && C.last[id] && now < C.last[id] + def.repeat.cooldownH * H) { status = 'cooldown'; reason = 'Délai entre deux éditions'; }
    else if (reqs.some((r) => !r.ok)) { status = 'locked'; reason = `Condition : ${reqs.find((r) => !r.ok).text}`; }
  }
  const lack = missing(state, cost);
  return {
    id, def, status, reason, run, doneN, cost, reqs, rare, lack,
    affordable: canAfford(state, cost),
    readyAt: def.repeat && C.last[id] ? C.last[id] + def.repeat.cooldownH * H : 0,
    left: def.repeat ? def.repeat.max - doneN : def.event ? null : doneN ? 0 : 1,
  };
}

export function crownList(state, now = Date.now()) {
  const mods = computeMods(state, now);
  return Object.keys(CROWN_PROJECTS).map((id) => crownInfo(state, id, now, mods));
}
export const crownRunning = (state) => Object.keys(crownState(state).active).length;

// Lancement : toutes les vérifications, puis paiement complet (ou rien)
export function startCrown(state, id, now = Date.now()) {
  if (!CROWN_PROJECTS[id]) return { ok: false, reason: 'Projet inconnu' };
  const C = crownState(state);
  const info = crownInfo(state, id, now);
  if (info.status !== 'available') return { ok: false, reason: info.reason || (info.status === 'running' ? 'Déjà en cours' : info.status === 'claimable' ? 'Récompense à récupérer d’abord' : 'Projet indisponible') };
  const slots = crownSlots(thLevel(state));
  if (crownRunning(state) >= slots) return { ok: false, reason: `Déjà ${slots} projets en cours : attendez qu’un se termine` };
  if (!canAfford(state, info.cost)) return { ok: false, reason: 'Ressources insuffisantes', missing: info.lack };
  if (!pay(state, info.cost)) return { ok: false, reason: 'Ressources insuffisantes' };
  const def = CROWN_PROJECTS[id];
  const cur = currentEvent(state, now);
  C.active[id] = { start: now, end: now + def.hours * H, cost: info.cost, n: info.doneN, ...(def.event && cur ? { ev: eventKey(cur) } : {}) };
  log(state, 'info', `${def.icon} Grand Projet lancé : ${def.name} (${def.hours} h).`, now);
  return { ok: true, text: `${def.name} lancé` };
}

// Annulation pendant les travaux : la moitié du coût est rendue ; l'édition ne compte pas
export function cancelCrown(state, id, now = Date.now()) {
  const C = crownState(state);
  const run = C.active[id];
  if (!run) return { ok: false, reason: 'Aucun projet en cours' };
  if (run.end <= now) return { ok: false, reason: 'Travaux terminés : récupérez la récompense' };
  const back = {};
  for (const [r, v] of Object.entries(run.cost || {})) { back[r] = Math.floor(v * CROWN_REFUND); state.resources[r] = (state.resources[r] || 0) + back[r]; }
  delete C.active[id];
  return { ok: true, back };
}

// Texte de la récompense (sans l'accorder)
export function crownRewardText(id) {
  const r = CROWN_PROJECTS[id].reward;
  const parts = [];
  if (r.mods) parts.push(`permanent : ${modsText(r.mods)}`);
  if (r.buff) parts.push(`${r.buff.name} (${modsText(r.buff.mods)}, ${r.buff.hours} h)`);
  if (r.speedups) parts.push(Object.entries(r.speedups).map(([k, n]) => `⏳ ${n} × ${SPEEDUP_NAMES[k] || k}`).join(', '));
  if (r.res) parts.push(Object.entries(r.res).map(([k, n]) => `${RESOURCES[k]?.icon || ''} ${fmt(n)} ${RESOURCES[k]?.name.toLowerCase() || k}`).join(', '));
  if (r.eventCurrency) parts.push(`${r.eventCurrency} monnaie d’événement`);
  if (r.relic) parts.push(`${r.relic} fragments de relique`);
  if (r.title) parts.push(`titre « ${r.title} »`);
  if (r.deco) parts.push(`décoration « ${COSMETICS[r.deco]?.name || r.deco} »`);
  if (r.insignia) parts.push(`🎖️ ${r.insignia} insignes`);
  return parts.join(' · ');
}
const SPEEDUP_NAMES = { speed5: 'chantier 5 min', speed15: 'chantier 15 min', speed60: 'chantier 1 h', speed480: 'chantier 8 h', rspeed5: 'recrutement 5 min', rspeed15: 'recrutement 15 min', rspeed60: 'recrutement 1 h', rspeed480: 'recrutement 8 h' };
const MOD_NAMES = {
  'march.speed': 'marches', 'caravan.speed': 'vitesse des caravanes', 'storage.pct': 'stockage', 'convoy.risk': 'risque des convois', 'caravan.gain': 'gains des caravanes',
  'prod.all': 'production', 'train.speed': 'vitesse de formation', 'contract.reward': 'contrats', 'craft.speed': 'vitesse d’artisanat', 'market.fee': 'taxe du marché',
  'combat.morale': 'moral', 'explore.speed': 'exploration',
};
function modsText(m) {
  return Object.entries(m).map(([k, v]) => k === 'combat.morale' ? `moral +${v}` : k === 'market.fee' ? `taxe du marché ${v * 100 > 0 ? '+' : ''}${(v * 100).toFixed(1).replace('.', ',')} pt` : `${MOD_NAMES[k] || k} ${v > 0 ? '+' : ''}${Math.round(v * 100)} %`).join(', ');
}

// Récupération : une seule fois par édition (clé unique), même après rechargement
export function claimCrown(state, id, now = Date.now()) {
  const C = crownState(state);
  const run = C.active[id];
  const def = CROWN_PROJECTS[id];
  if (!def || !run) return { ok: false, reason: 'Rien à récupérer' };
  if (run.end > now) return { ok: false, reason: 'Travaux en cours' };
  const n = (C.done[id] || 0) + 1;
  const key = `crown:${id}:${def.event ? run.ev || n : n}`;
  delete C.active[id];
  if (C.claimed[key]) return { ok: false, reason: 'Récompense déjà reçue' };
  C.claimed[key] = now;
  C.done[id] = n;
  C.last[id] = def.event ? (run.ev || 'x') : now;
  const r = def.reward;
  const parts = [];
  // Les bonus permanents (mods) sont lus dans crownMods à partir de C.done : rien à faire ici
  if (r.mods) parts.push(`bonus permanent : ${modsText(r.mods)}`);
  const g = grantReward(state, { res: r.res, buff: r.buff, speedups: r.speedups, relic: r.relic }, now, key);
  if (g) parts.push(g);
  if (r.eventCurrency) {
    const cur = currentEvent(state, now);
    if (cur && LIVE_EVENTS[cur.key]) parts.push(grantGive(state, { [LIVE_EVENTS[cur.key].currency.key]: r.eventCurrency }, now, def.name));
    else { state.resources.gold = (state.resources.gold || 0) + r.eventCurrency * 5; parts.push(`${fmt(r.eventCurrency * 5)} or (événement terminé)`); }
  }
  if (r.title && !(state.meta.titles || []).includes(r.title)) { (state.meta.titles ||= []).push(r.title); parts.push(`titre « ${r.title} »`); }
  if (r.deco && !state.meta.owned[r.deco]) { state.meta.owned[r.deco] = true; parts.push(`décoration « ${COSMETICS[r.deco]?.name} »`); }
  if (r.insignia) { state.meta.insignia = (state.meta.insignia || 0) + r.insignia; parts.push(`${r.insignia} insignes`); }
  state.stats.crownProjects = (state.stats.crownProjects || 0) + 1;
  const text = parts.filter(Boolean).join(', ');
  if (!def.repeat && !def.event) chronicle(state, `${def.icon} Grand Projet du Royaume achevé : ${def.name}.`, now);
  log(state, 'good', `${def.icon} ${def.name} : ${text}.`, now);
  toast(`${def.icon} ${def.name} : récompense reçue`, 'good');
  return { ok: true, text };
}

// Bonus permanents des projets uniques achevés (agrégés dans computeMods)
export function crownMods(state) {
  const out = {};
  const done = state.crown?.done || {};
  for (const [id, n] of Object.entries(done)) {
    const def = CROWN_PROJECTS[id];
    if (!def || !(n > 0) || def.repeat || def.event) continue;
    for (const [k, v] of Object.entries(def.reward.mods || {})) out[k] = (out[k] || 0) + v;
  }
  return out;
}

// Nombre de projets à récupérer (badge de l'onglet)
export const crownClaimable = (state, now = Date.now()) => Object.values(crownState(state).active).filter((r) => r.end <= now).length;
