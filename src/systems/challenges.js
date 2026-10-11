// Défis de maîtrise (voir data/challenges.js) : une épreuve à la fois, contrainte vérifiée en continu, palier
// atteint calculé à la fin, récompenses de palier versées une seule fois par défi, historique des résultats.
import { CHALLENGES, TIERS, CHALLENGE_MIN_TH, CHALLENGE_RETRY_H, MASTERY_BANNERS } from '../data/challenges.js';
import { thLevel } from './city.js';
import { computeMods } from './modifiers.js';
import { netRates } from './economy.js';
import { stabOf } from './stability.js';
import { chronicle } from './chronicle.js';
import { feat, log } from './log.js';

const BASE = ['wood', 'stone', 'iron', 'food', 'gold'];
const H = 3600000;

export function challengeState(state) {
  const c = (state.challenges && typeof state.challenges === 'object' && !Array.isArray(state.challenges)) ? state.challenges : (state.challenges = {});
  c.active ??= null;
  c.best ||= {};
  c.claimed ||= {};
  if (!Array.isArray(c.history)) c.history = [];
  c.retryAt ||= {};
  return c;
}

const producedBase = (state) => BASE.reduce((a, r) => a + (state.stats?.produced?.[r] || 0), 0);
const campaignWins = (state, since) => {
  const res = [...(state.war?.active?.results || []), ...(state.war?.history || []).flatMap((h) => h.results || [])];
  return res.filter((r) => r.won && r.t >= since).length;
};
const avgStability = (state) => { const t = Object.values(state.territories || {}); return t.length ? t.reduce((a, x) => a + stabOf(x), 0) / t.length : 0; };

export function canStartChallenge(state, id, now = Date.now()) {
  const C = challengeState(state), def = CHALLENGES[id];
  if (!def) return { ok: false, reason: 'Défi inconnu' };
  if (thLevel(state) < Math.max(CHALLENGE_MIN_TH, def.minTH || 0)) return { ok: false, reason: `Hôtel de ville niveau ${Math.max(CHALLENGE_MIN_TH, def.minTH || 0)} requis` };
  if (C.active) return { ok: false, reason: 'Une épreuve est déjà en cours' };
  if (C.retryAt[id] > now) return { ok: false, reason: 'Ce défi pourra être retenté un peu plus tard' };
  if (def.minOutposts && Object.keys(state.territories || {}).length < def.minOutposts) return { ok: false, reason: `Au moins ${def.minOutposts} avant-postes requis` };
  if (id === 'lightHand' && Object.values(state.territories || {}).some((t) => t.tax !== 'low')) return { ok: false, reason: 'Placez d’abord toutes vos provinces en impôts légers' };
  if (id === 'scarcity' && state.famine) return { ok: false, reason: 'Impossible pendant une famine' };
  return { ok: true };
}

export function startChallenge(state, id, now = Date.now()) {
  const c = canStartChallenge(state, id, now);
  if (!c.ok) return c;
  const C = challengeState(state), def = CHALLENGES[id];
  const mods = computeMods(state, now), net = netRates(state, mods);
  const base = {
    produced: producedBase(state), rate: Math.max(1, BASE.reduce((a, r) => a + Math.max(0, net[r] || 0), 0)),
    trades: state.stats.trades || 0, caravans: state.stats.caravans || 0, trained: state.stats.trained || 0,
    hardClears: state.stats.hardClears || 0, missions: state.missions?.done || 0, policyN: (state.policy?.history || []).length,
    food: Math.max(1, state.resources.food || 0),
  };
  C.active = { id, start: now, end: now + def.hours * H, base };
  if (id === 'scarcity') state.buffs.push({ name: 'L’année maigre (défi)', mods: { 'prod.food': -0.5 }, until: now + def.hours * H, challenge: true });
  log(state, 'info', `${def.icon} Défi de maîtrise commencé : ${def.name} (${def.hours} h).`, now);
  return { ok: true };
}

// Mesure courante et palier atteint (–1 : aucun)
export function challengeProgress(state, a, now = Date.now()) {
  const def = CHALLENGES[a.id], b = a.base;
  let value = 0, label = '';
  switch (a.id) {
    case 'autarky': { const got = producedBase(state) - b.produced; value = got / (b.rate * def.hours); label = `${Math.round(value * 100)} % de la production attendue`; break; }
    case 'scarcity': value = (state.resources.food || 0) / b.food; label = `réserve à ${Math.round(value * 100)} % du départ`; break;
    case 'discipline': value = campaignWins(state, a.start); label = `${value} opération(s) remportée(s)`; break;
    case 'peril': value = (state.stats.hardClears || 0) - b.hardClears; label = `${value} lieu(x) nettoyé(s)`; break;
    case 'lightHand': value = avgStability(state); label = `stabilité moyenne ${Math.round(value)}`; break;
    case 'steadfast': value = (state.missions?.done || 0) - b.missions; label = `${value} mission(s)`; break;
    default: break;
  }
  let tier = -1;
  def.targets.forEach((t, i) => { if (value >= t) tier = i; });
  return { value, label, tier };
}

// Règle enfreinte ? (renvoie la raison)
function violation(state, a) {
  const b = a.base;
  switch (a.id) {
    case 'autarky': if ((state.stats.trades || 0) > b.trades || (state.stats.caravans || 0) > b.caravans) return 'un échange extérieur a eu lieu'; break;
    case 'scarcity': if (state.famine) return 'la famine a frappé le royaume'; break;
    case 'discipline': if ((state.stats.trained || 0) > b.trained) return 'de nouveaux soldats ont été formés'; break;
    case 'lightHand': if (Object.values(state.territories || {}).some((t) => t.tax !== 'low' || t.revolt)) return 'une province n’est plus en impôts légers (ou s’est révoltée)'; break;
    case 'steadfast': if ((state.policy?.history || []).length > b.policyN) return 'la priorité royale a changé'; break;
    default: break;
  }
  return null;
}

function finish(state, failed, now) {
  const C = challengeState(state), a = C.active, def = CHALLENGES[a.id];
  const p = challengeProgress(state, a, now);
  // L'épreuve « année maigre » est réussie au bronze si aucune famine ; échec = aucun palier
  const tier = failed ? -1 : Math.max(p.tier, a.id === 'scarcity' ? 0 : -1);
  const granted = [];
  for (let i = 0; i <= tier; i++) {
    const k = TIERS[i].key;
    if (C.claimed[a.id]?.[k]) continue;
    (C.claimed[a.id] ||= {})[k] = now;
    const r = def.rewards[i];
    if (r.insignia) { state.meta.insignia = (state.meta.insignia || 0) + r.insignia; granted.push(`+${r.insignia} insignes`); }
    if (r.title && !(state.meta.titles || []).includes(r.title)) { (state.meta.titles ||= []).push(r.title); granted.push(`titre « ${r.title} »`); }
    if (r.banner) { (state.meta.owned ||= {})[r.banner] = true; granted.push(MASTERY_BANNERS[r.banner].name.toLowerCase()); }
  }
  if (tier > (C.best[a.id] ?? -1)) C.best[a.id] = tier;
  C.history.unshift({ id: a.id, t: now, tier, failed: failed || null, label: p.label });
  C.history.length = Math.min(C.history.length, 40);
  C.retryAt[a.id] = now + CHALLENGE_RETRY_H * H;
  state.buffs = state.buffs.filter((x) => !x.challenge);
  C.active = null;
  if (tier >= 0) {
    chronicle(state, `${def.icon} Défi « ${def.name} » relevé : palier ${TIERS[tier].name.toLowerCase()} (${p.label}).`, now);
    feat(TIERS[tier].icon, `Défi « ${def.name} » : ${TIERS[tier].name}`, granted.join(' · ') || 'Record amélioré ou égalé');
  } else log(state, 'bad', `${def.icon} Défi « ${def.name} » échoué : ${failed || p.label}.`, now);
  return { tier, granted };
}

export function abandonChallenge(state, now = Date.now()) {
  const C = challengeState(state);
  if (!C.active) return { ok: false, reason: 'Aucune épreuve en cours' };
  finish(state, 'abandonnée', now);
  return { ok: true };
}

export function challengesTick(state, now = Date.now()) {
  const C = challengeState(state), a = C.active;
  if (!a || !CHALLENGES[a.id]) { if (a) C.active = null; return; }
  const v = violation(state, a);
  if (v) { finish(state, v, now); return; }
  const def = CHALLENGES[a.id];
  // Fin anticipée quand le palier or est atteint (sauf épreuves mesurées à la fin)
  const early = ['discipline', 'peril', 'steadfast'].includes(a.id) && challengeProgress(state, a, now).tier >= TIERS.length - 1;
  if (early || now >= a.end) finish(state, null, Math.min(now, a.end));
  void def;
}

// Maîtrise : paliers obtenus (pour la vue de fin de partie)
export function masteryScore(state) {
  const C = challengeState(state);
  const got = Object.values(C.claimed).reduce((a, t) => a + Object.keys(t).length, 0);
  return { got, total: Object.keys(CHALLENGES).length * TIERS.length };
}

export function applyMasteryBanner(state, k) {
  const b = MASTERY_BANNERS[k];
  if (!b || !state.meta.owned?.[k]) return { ok: false, reason: 'Bannière non obtenue' };
  state.meta.banner = b.color;
  return { ok: true, name: b.name };
}
