import { TALENTS, BUILD_PRESETS, DYNASTY_PERKS } from '../data/talents.js';
import { RESOURCES } from '../data/resources.js';
import { thLevel, totalLevels } from './city.js';
import { createNewState } from '../core/state.js';
import { chronicle } from './chronicle.js';

const BUILD_SWITCH_MS = 2 * 3600000;

export const talentRanks = (state) => (state.talents ||= { ranks: {}, builds: [], switchAt: 0 }).ranks;
export const spentPoints = (state) => Object.values(talentRanks(state)).reduce((a, b) => a + b, 0);
export function talentPoints(state) {
  return thLevel(state) * 2 + Math.floor(totalLevels(state) / 20) + Object.keys(state.artifacts || {}).length
    + (state.dynasty?.perks?.talents || 0) * 2 + Math.floor((state.season?.points || 0) / 500);
}
export const freePoints = (state) => talentPoints(state) - spentPoints(state);

export function canLearn(state, id) {
  const t = TALENTS[id];
  const r = talentRanks(state)[id] || 0;
  if (r >= t.ranks) return { ok: false, reason: 'Rang maximum' };
  if (t.req && !(talentRanks(state)[t.req] > 0)) return { ok: false, reason: `Requiert ${TALENTS[t.req].name}` };
  if (freePoints(state) <= 0) return { ok: false, reason: 'Aucun point disponible' };
  return { ok: true };
}

export function learnTalent(state, id) {
  const c = canLearn(state, id);
  if (!c.ok) return c;
  talentRanks(state)[id] = (talentRanks(state)[id] || 0) + 1;
  return { ok: true };
}

export function resetTalents(state, now = Date.now()) {
  const t = state.talents;
  if (t.switchAt > now) return { ok: false, reason: 'Changement de doctrine possible dans quelques heures' };
  t.ranks = {}; t.switchAt = now + BUILD_SWITCH_MS;
  return { ok: true };
}

export function saveBuild(state, slot, name) {
  const t = state.talents;
  t.builds[slot] = { name: name || `Doctrine ${slot + 1}`, ranks: { ...t.ranks } };
  return { ok: true };
}

export function loadBuild(state, slot, now = Date.now()) {
  const t = state.talents;
  const b = t.builds[slot];
  if (!b) return { ok: false, reason: 'Emplacement vide' };
  if (t.switchAt > now) return { ok: false, reason: 'Changement de doctrine en recharge' };
  t.ranks = {};
  for (const [id, r] of Object.entries(b.ranks)) for (let i = 0; i < r; i++) if (canLearn(state, id).ok) t.ranks[id] = (t.ranks[id] || 0) + 1;
  t.switchAt = now + BUILD_SWITCH_MS;
  return { ok: true };
}

export function applyPreset(state, key, now = Date.now()) {
  const p = BUILD_PRESETS[key];
  const t = state.talents;
  if (t.switchAt > now && spentPoints(state) > 0) return { ok: false, reason: 'Changement de doctrine en recharge' };
  t.ranks = {};
  let n = 0;
  for (let pass = 0; pass < 3; pass++) for (const id of p.picks) if (canLearn(state, id).ok) { t.ranks[id] = (t.ranks[id] || 0) + 1; n++; }
  t.switchAt = now + BUILD_SWITCH_MS;
  return { ok: true, n };
}

export function talentMods(state) {
  const m = {};
  for (const [id, r] of Object.entries(talentRanks(state))) for (const [k, v] of Object.entries(TALENTS[id]?.mods || {})) m[k] = (m[k] || 0) + v * r;
  if ((talentRanks(state).trd4 || 0) >= 3) m.caravans = (m.caravans || 0) + 1;
  // Héritage dynastique
  for (const [k, n] of Object.entries(state.dynasty?.perks || {})) for (const [mk, v] of Object.entries(DYNASTY_PERKS[k]?.mods || {})) m[mk] = (m[mk] || 0) + v * n;
  return m;
}

// ---------- Prestige : fonder une nouvelle dynastie ----------
export const PRESTIGE_TH = 15;
export function prestigeGain(state) {
  // Seuls les artefacts obtenus pendant cette dynastie comptent (les artefacts conservés ne repaient pas)
  const newArts = Object.values(state.artifacts || {}).filter((a) => (a?.t || 0) >= (state.meta.created || 0)).length;
  return Math.floor(totalLevels(state) / 40 + newArts * 2 + (state.stats.bossKills || 0) + (state.stats.dungeons || 0) / 2 + thLevel(state) / 3);
}
export function canPrestige(state) {
  if (thLevel(state) < PRESTIGE_TH) return { ok: false, reason: `Hôtel de ville niveau ${PRESTIGE_TH} requis` };
  return { ok: true, gain: prestigeGain(state) };
}

// Ce qui est conservé / réinitialisé (affiché avant confirmation)
export function prestigePreview(state) {
  return {
    gain: prestigeGain(state),
    kept: [
      'Points d’héritage et bonus dynastiques achetés',
      'Doctrines de talents enregistrées (les rangs sont rendus et se regagnent en progressant)',
      'Artefacts, collections et trophées de boss',
      'Éclats Anciens, tickets, fragments, garanties de la Roue et exploits accomplis',
      'Cosmétiques, bannière, titres et insignes',
      'Records, chronique de l’histoire et bilans d’événements',
      'Réputation (divisée par deux)',
    ],
    reset: [
      'Ville, bâtiments et technologies',
      'Ressources (ressources de départ multipliées par « Trésor des ancêtres »)',
      'Armée, héros (y compris exclusifs), équipement (y compris uniques) et ouvriers',
      'Carte du monde, territoires, factions et diplomatie',
      'Quêtes, jalons, saison et guilde',
      'Événement en cours (sa monnaie et sa progression sont perdues)',
      'Intendance (sauf paliers « Intendance héréditaire »)',
    ],
  };
}

// Renvoie un NOUVEL état (la nouvelle dynastie)
export function foundDynasty(state, now = Date.now()) {
  const c = canPrestige(state);
  if (!c.ok) return c;
  const d = { ...(state.dynasty || { count: 0, points: 0, perks: {} }) };
  d.count++; d.points += c.gain;
  // La spécialisation, l'origine et la difficulté sont conservées (seule une nouvelle partie permet d'en changer)
  const k = state.kingdom || {};
  const ns = createNewState({ kingdomName: state.meta.kingdomName, lordName: state.meta.lordName, now, kingdomType: k.type, origin: k.origin, difficulty: k.difficulty });
  ns.dynasty = d;
  Object.assign(ns.meta, { banner: state.meta.banner, insignia: state.meta.insignia, owned: state.meta.owned, titles: [...(state.meta.titles || []), `Fondateur de la ${d.count + 1}e dynastie`], heroClassesSeen: state.meta.heroClassesSeen, tipsSeen: state.meta.tipsSeen, tipsOff: state.meta.tipsOff, advice: state.meta.advice });
  // Le parcours guidé n'est pas rejoué : récompenses déjà réclamées, chapitres déjà ouverts
  if (state.campaign) ns.campaign = state.campaign;
  ns.artifacts = state.artifacts;              // collections conservées
  ns.bossTrophies = state.bossTrophies;
  // Doctrines conservées ; les rangs sont rendus (les points se regagnent avec la progression)
  ns.talents = { ranks: {}, builds: state.talents?.builds || [], switchAt: 0 };
  ns.records = state.records;
  ns.history = [...(state.history || [])];
  // Éléments permanents du compte : Éclats Anciens (et exploits déjà accomplis, non rejouables),
  // historique des événements, notifications et réglages
  // Les objets et héros exclusifs ne sont pas conservés : leurs marques « possédé » sont effacées
  // pour qu'ils puissent être obtenus à nouveau (sinon ils se changeraient en fragments)
  if (state.shards) ns.shards = { ...state.shards, owned: {} };
  if (state.live) Object.assign(ns.live, { history: state.live.history || [], occ: state.live.occ || {}, reports: state.live.reports || [], totals: state.live.totals || {} });
  ns.admin = state.admin || {};
  ns.reputation = Object.fromEntries(Object.entries(state.reputation || {}).map(([k, v]) => [k, Math.floor(v / 2)]));
  ns.stats.previousDynasties = [...(state.stats.previousDynasties || []), { th: thLevel(state), levels: totalLevels(state), t: now }];
  // Bonus dynastiques appliqués au départ
  const bounty = 1 + (d.perks.bounty || 0);
  for (const r of Object.keys(ns.resources)) if (RESOURCES[r].cat === 'base') ns.resources[r] *= bounty;
  ns.automation.level = Math.min(3, d.perks.steward || 0);
  chronicle(ns, `Une nouvelle dynastie est fondée. ${c.gain} points d’héritage s’ajoutent au trésor des ancêtres.`, now);
  return { ok: true, state: ns, gain: c.gain };
}

export function buyPerk(state, key) {
  const p = DYNASTY_PERKS[key];
  const d = state.dynasty;
  if (!p || !d) return { ok: false, reason: 'Aucune dynastie' };
  const cur = d.perks[key] || 0;
  if (cur >= p.max) return { ok: false, reason: 'Rang maximum' };
  if (d.points < p.cost) return { ok: false, reason: 'Points d’héritage insuffisants' };
  d.points -= p.cost;
  d.perks[key] = cur + 1;
  return { ok: true };
}
