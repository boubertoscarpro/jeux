// v14 — Présages : l'information imparfaite remplace les rumeurs toujours vraies.
// Les catastrophes et les tensions du marché sont annoncées 1 à 2 h à l'avance, avec une fiabilité qui dépend des
// sources du royaume (taverne, tour de garde, observatoire). Une partie des présages est fausse : la fiabilité affichée
// EST la probabilité qu'il se réalise. On peut recouper (astrologues contre de l'or, réponse immédiate ; ou un éclaireur,
// gratuit mais 30 min) et se préparer — préparation payée même si le présage se révèle faux.
// La fréquence réelle des catastrophes ne change pas : les présages sont émis au rythme chance / fiabilité, et chacun se
// réalise avec la probabilité « fiabilité ».
import { OMEN, MARKET_OMENS, CATASTROPHE_OMEN_TEXT, PREPARATIONS, reliabilityBand } from '../data/crises.js';
import { CATASTROPHES } from '../data/seasons.js';
import { RESOURCES } from '../data/resources.js';
import { rng } from '../core/rng.js';
import { uid, fmt } from '../core/util.js';
import { levelOf, thLevel } from './city.js';
import { pay, missing } from './economy.js';
import { log, toast } from './log.js';

const MIN = 60000, H = 3600000;
const th = (state) => Math.max(1, thLevel(state));
const scale = (o) => (state) => Object.fromEntries(Object.entries(o || {}).map(([r, v]) => [r, Math.round(v * th(state))]));

export function omensState(state) {
  const S = state.omens && typeof state.omens === 'object' && !Array.isArray(state.omens) ? state.omens : (state.omens = {});
  if (!Array.isArray(S.list)) S.list = [];
  if (!S.prep || typeof S.prep !== 'object' || Array.isArray(S.prep)) S.prep = {};
  S.stats ||= { announced: 0, happened: 0, false: 0, verified: 0, prepared: 0 };
  // Ancienne rumeur (avant v14) : elle devient un présage du marché, certain comme elle l'était
  if (state.rumor && typeof state.rumor === 'object') {
    const r = state.rumor;
    if (!r.done && RESOURCES[r.res]) S.list.push({ id: uid('om'), kind: 'market', key: r.res, text: r.text, heard: r.heard || r.at, at: r.at, q: 1, truth: true, resolved: false });
    state.rumor = null;
  }
  return S;
}

// Fiabilité des présages selon les sources du royaume
export function omenReliability(state) {
  let q = OMEN.baseReliability;
  q += OMEN.perTavern * Math.min(OMEN.maxTavern, levelOf(state, 'tavern'));
  q += OMEN.perWatch * Math.min(OMEN.maxWatch, levelOf(state, 'watchtower'));
  if (levelOf(state, 'observatory') > 0) q += OMEN.observatory;
  return Math.min(OMEN.maxReliability, Math.round(q * 100) / 100);
}
export const omenSources = (state) => [
  ['Base (bergers, voyageurs)', OMEN.baseReliability],
  [`Taverne (niv. ${levelOf(state, 'tavern')})`, OMEN.perTavern * Math.min(OMEN.maxTavern, levelOf(state, 'tavern'))],
  [`Tour de garde (niv. ${levelOf(state, 'watchtower')})`, OMEN.perWatch * Math.min(OMEN.maxWatch, levelOf(state, 'watchtower'))],
  ['Grand Observatoire', levelOf(state, 'observatory') > 0 ? OMEN.observatory : 0],
];

export const pendingOmens = (state, now = Date.now()) => omensState(state).list.filter((o) => !o.resolved && o.at > now - MIN);
export const omenText = (o) => o.text || (o.kind === 'catastrophe' ? CATASTROPHE_OMEN_TEXT[o.key] : MARKET_OMENS.find((m) => m.res === o.key)?.text) || 'Un présage obscur.';
export const omenTitle = (o) => (o.kind === 'catastrophe' ? `${CATASTROPHES[o.key]?.icon || '❔'} ${CATASTROPHES[o.key]?.name || o.key}` : `📈 ${RESOURCES[o.key]?.name || o.key} plus cher`);
// Ce que le joueur sait : fiabilité annoncée, ou vérité si le présage a été recoupé
export function omenView(o) {
  const band = reliabilityBand(o.q);
  if (o.checked === true) return { band, label: 'Confirmé', icon: '✅', sure: true };
  if (o.checked === false) return { band, label: 'Démenti', icon: '❌', sure: true };
  return { band, label: `Fiabilité ${band.name.toLowerCase()} (${Math.round(o.q * 100)} %)`, icon: band.icon, sure: false };
}

function announce(state, kind, key, now) {
  const S = omensState(state);
  const q = omenReliability(state);
  const o = { id: uid('om'), kind, key, heard: now, at: now + rng.int(OMEN.leadMin[0], OMEN.leadMin[1]) * MIN, q, truth: rng.chance(q), resolved: false };
  S.list.unshift(o);
  S.stats.announced++;
  if (kind === 'catastrophe') { log(state, 'event', `🔮 Présage : ${omenText(o)} (fiabilité ${reliabilityBand(q).name.toLowerCase()}, vers ${new Date(o.at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}).`, now); toast(`🔮 Présage : ${CATASTROPHES[key].name}`, 'info'); }
  return o;
}

// Recouper un présage : « gold » (astrologues, immédiat) ou « scout » (un éclaireur, 30 min, gratuit)
export function verifyCost(state) { return { gold: OMEN.verifyGoldPerTh * th(state) }; }
export function verifyOmen(state, id, method = 'gold', now = Date.now()) {
  const o = omensState(state).list.find((x) => x.id === id);
  if (!o || o.resolved) return { ok: false, reason: 'Présage introuvable ou déjà échu' };
  if (o.checked !== undefined && o.checked !== null) return { ok: false, reason: 'Déjà recoupé' };
  if (o.checkAt) return { ok: false, reason: 'Un éclaireur est déjà parti vérifier' };
  if (method === 'scout') {
    if ((state.army.scout || 0) < 1) return { ok: false, reason: 'Aucun éclaireur au château' };
    state.army.scout -= 1;
    o.checkAt = Math.min(o.at, now + OMEN.scoutMin * MIN);
    return { ok: true, pending: true };
  }
  const cost = verifyCost(state);
  if (!pay(state, cost)) return { ok: false, reason: 'Or insuffisant', missing: missing(state, cost) };
  o.checked = o.truth;
  omensState(state).stats.verified++;
  return { ok: true, truth: o.truth };
}

// Préparation sur la foi d'un présage de catastrophe
export const prepCost = (state, key) => (PREPARATIONS[key] ? scale(PREPARATIONS[key].costPerTh)(state) : null);
export function prepareFor(state, id, now = Date.now()) {
  const S = omensState(state);
  const o = S.list.find((x) => x.id === id);
  if (!o || o.resolved || o.kind !== 'catastrophe') return { ok: false, reason: 'Présage introuvable' };
  const p = PREPARATIONS[o.key];
  if (!p) return { ok: false, reason: 'Aucune préparation possible contre ce fléau' };
  if (o.prepared) return { ok: false, reason: 'Déjà préparé' };
  const cost = prepCost(state, o.key);
  if (!pay(state, cost)) return { ok: false, reason: 'Ressources insuffisantes', missing: missing(state, cost) };
  o.prepared = true;
  S.prep[o.key] = Math.max(S.prep[o.key] || 0, o.at + 6 * H);
  S.stats.prepared++;
  log(state, 'info', `${p.icon} ${p.label} : ${p.text}`, now);
  return { ok: true };
}
export const isPrepared = (state, key, now = Date.now()) => (state.omens?.prep?.[key] || 0) > now;

/**
 * Tick des présages (appelé par le monde vivant chaque minute de jeu).
 * hooks.catastrophe(key, now) et hooks.market(res, now) déclenchent l'événement quand un présage vrai arrive à échéance.
 */
export function omenTick(state, now, hFrac, season, hooks) {
  const S = omensState(state);
  // 1) Échéances
  for (const o of S.list) {
    if (o.checkAt && o.checkAt <= now && (o.checked === undefined || o.checked === null)) {
      o.checked = o.truth; o.checkAt = null; S.stats.verified++;
      state.army.scout = (state.army.scout || 0) + 1;
      log(state, 'info', `🔭 L’éclaireur revient : le présage « ${omenTitle(o)} » est ${o.truth ? 'confirmé' : 'démenti'}.`, now);
    }
    if (o.resolved || o.at > now) continue;
    o.resolved = true;
    if (o.checkAt) { o.checkAt = null; state.army.scout = (state.army.scout || 0) + 1; }
    if (o.truth) {
      S.stats.happened++;
      o.happened = o.kind === 'catastrophe' ? !!hooks.catastrophe(o.key, now) : !!hooks.market(o.key, now);
    } else {
      S.stats.false++;
      o.happened = false;
      if (o.kind === 'catastrophe') log(state, 'info', `🔮 Le présage ne s’est pas réalisé : pas de ${CATASTROPHES[o.key].name.toLowerCase()}${o.prepared ? ' (préparatifs faits pour rien)' : ''}.`, now);
    }
  }
  // 2) Nouvelles annonces : une catastrophe annoncée à la fois ; pas d'annonce pendant une catastrophe
  const pend = S.list.filter((o) => !o.resolved);
  if (thLevel(state) >= 2 && !(state.catastrophe?.until > now) && !pend.some((o) => o.kind === 'catastrophe')) {
    const q = omenReliability(state);
    for (const [k, c] of Object.entries(CATASTROPHES)) {
      if (!c.seasons.includes(season.key)) continue;
      if (rng.chance((c.chance / q) * hFrac)) { announce(state, 'catastrophe', k, now); break; }
    }
  }
  if (!pend.some((o) => o.kind === 'market') && rng.chance(OMEN.marketPerHour * hFrac)) announce(state, 'market', rng.pick(MARKET_OMENS).res, now);
  // 3) Almanach borné
  if (S.list.length > OMEN.keep) S.list = [...S.list.filter((o) => !o.resolved), ...S.list.filter((o) => o.resolved)].slice(0, OMEN.keep);
  for (const [k, v] of Object.entries(S.prep)) if (v <= now) delete S.prep[k];
}

export const omenSummary = (state) => { const s = omensState(state).stats; return `${s.announced} présage(s), ${s.happened} réalisé(s), ${s.false} faux`; };
void fmt;
