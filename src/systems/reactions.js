// Réactions des factions (v13) : le monde répond aux actes du joueur, en réutilisant les mécanismes existants
// (relations, mémoire des rivalités, garnisons, raids, contrats, bonus temporaires, marques de la carte, chronique).
// Aucune nouvelle diplomatie, aucune nouvelle ressource. Chaque réaction a un délai de reprise, une durée et un
// plafond : pas de spirale de représailles, et les factions ne reçoivent jamais de ressources gratuites.
//
//   fortify   : attaquée 3 fois en 48 h → garnison de la capitale +20 % pendant 24 h (payé sur sa richesse)
//   counter   : en guerre, très hostile et frappée récemment → un raid de représailles (au plus 1 par 36 h),
//               jamais pendant une série de défaites du joueur ni pendant sa trêve
//   embargo   : relation ≤ −50 ou guerre → gains des caravanes −5 % pendant 24 h (levé dès que la relation remonte
//               au-dessus de −30 ; au plus −10 % au total)
//   aid       : un allié en guerre demande une aide logistique (contrat de livraison, relation +8 à la livraison)
//   favor     : partenaire marchand + routes sûres → contrats mieux payés (+10 %) pendant 12 h
//   weakened  : armée fortement réduite ou lassitude ≥ 60 → elle accepte de négocier (paix et pacte facilités 12 h)
import { RIVALS, PERSONALITIES } from '../data/world.js';
import { RESOURCES } from '../data/resources.js';
import { rng } from '../core/rng.js';
import { uid, fmt } from '../core/util.js';
import { thLevel } from './city.js';
import { chronicle } from './chronicle.js';
import { log, toast } from './log.js';
import { remember } from './rivalry.js';
import { addMark } from './worldmarks.js';

const H = 3600000;
export const REACT = {
  fortify: { hits: 3, windowH: 48, durH: 24, cooldownH: 48, garrison: 0.2, cost: 1500 },
  counter: { relation: -60, cooldownH: 36, windowH: 24 },
  embargo: { relation: -50, lift: -30, durH: 24, cooldownH: 72, caravan: -0.05, cap: -0.1 },
  aid: { cooldownH: 24, relation: 8 },
  favor: { cooldownH: 48, durH: 12, contract: 0.1 },
  weakened: { armyShare: 0.45, weariness: 60, durH: 12, cooldownH: 48, peace: 0.25 },
  wealthBase: 3000, wealthPerRegion: 600,
};
export const REACTION_TEXT = {
  fortify: { icon: '🛡️', name: 'Défenses renforcées' },
  counter: { icon: '🔥', name: 'Contre-offensive' },
  embargo: { icon: '⛔', name: 'Embargo' },
  aid: { icon: '🤝', name: 'Demande d’aide' },
  favor: { icon: '⚖️', name: 'Faveur marchande' },
  weakened: { icon: '🏳️', name: 'Prête à négocier' },
};

export function reactState(f) {
  const r = (f.react && typeof f.react === 'object' && !Array.isArray(f.react)) ? f.react : (f.react = {});
  if (!Array.isArray(r.hits)) r.hits = [];
  if (!r.last || typeof r.last !== 'object') r.last = {};
  return r;
}
const ready = (r, kind, now) => !(r.last[kind] > now - REACT[kind].cooldownH * H);
const name = (i) => RIVALS[i]?.name || 'une faction';
const kingdomPoi = (state, idx) => Object.values(state.world?.pois || {}).find((p) => p.type === 'kingdom' && p.rival === idx);

// Rapport court, conservé pour l'écran des factions (les 12 derniers)
function report(state, f, kind, text, now, important = false) {
  const r = reactState(f);
  r.last[kind] = now;
  (state.factionReports ||= []).unshift({ t: now, faction: f.idx, kind, text });
  if (state.factionReports.length > 12) state.factionReports.length = 12;
  log(state, kind === 'favor' || kind === 'weakened' || kind === 'aid' ? 'good' : 'bad', `${REACTION_TEXT[kind].icon} ${text}`, now);
  if (important) chronicle(state, text, now, 'faction', `react:${kind}:${f.idx}:${Math.floor(now / H)}`);
  toast(`${REACTION_TEXT[kind].icon} ${name(f.idx)} : ${REACTION_TEXT[kind].name}`, kind === 'favor' || kind === 'weakened' || kind === 'aid' ? 'good' : 'bad');
}

// Acte hostile du joueur contre une faction (attaque de sa capitale, campagne, espion démasqué, guerre déclarée)
export function noteHostile(state, idx, kind, now = Date.now()) {
  const f = state.factions?.[idx];
  if (!f) return;
  const r = reactState(f);
  r.hits.push(now);
  r.hits = r.hits.filter((t) => t > now - 72 * H).slice(-10);
  r.lastHit = now;
  r.lastHitKind = kind;
}

// Richesse bornée par le territoire : une faction ne thésaurise pas à l'infini
export const wealthCap = (f) => REACT.wealthBase + REACT.wealthPerRegion * (f.territory?.length || 0);

export function reactionsTick(state, now = Date.now()) {
  if (!state.factions || thLevel(state) < 2) return;
  for (const f of state.factions) {
    const r = reactState(f);
    f.wealth = Math.min(f.wealth, wealthCap(f));
    f.peakArmy = Math.max(f.peakArmy || 0, f.army);
    const hits = r.hits.filter((t) => t > now - REACT.fortify.windowH * H).length;
    const per = RIVALS[f.idx]?.personality;
    // Défenses renforcées : payées sur la richesse de la faction (pas de renfort gratuit)
    if (hits >= REACT.fortify.hits && ready(r, 'fortify', now) && f.wealth >= REACT.fortify.cost) {
      f.wealth -= REACT.fortify.cost;
      f.fortifiedUntil = now + REACT.fortify.durH * H;
      const poi = kingdomPoi(state, f.idx);
      if (poi) { poi.garrison = null; addMark(state, poi.x, poi.y, 'fortified', now, REACT.fortify.durH, { faction: f.idx }); }
      report(state, f, 'fortify', `${name(f.idx)} renforce les défenses de sa capitale après des attaques répétées (garnison +20 % pendant 24 h).`, now, true);
    }
    // Contre-offensive : bornée (délai, trêve du joueur, série de défaites du joueur)
    const hostile = f.stance === 'war' && f.relation <= REACT.counter.relation;
    const recentHit = r.lastHit > now - REACT.counter.windowH * H;
    const recovering = (state.raidLossStreak || 0) >= 2 || (state.raidCooldown || 0) > now || (state.raids || []).length > 0;
    if (hostile && recentHit && !recovering && ready(r, 'counter', now)) {
      const poi = kingdomPoi(state, f.idx);
      if (poi) {
        poi.anger = Math.min(2, (poi.anger || 0) + 1);
        report(state, f, 'counter', `${name(f.idx)} prépare une contre-offensive : un raid de représailles est probable.`, now, true);
      }
    }
    // Embargo : sanction commerciale temporaire, levée par la négociation
    if (f.embargoUntil > now && f.relation > REACT.embargo.lift && f.stance !== 'war') {
      f.embargoUntil = 0;
      log(state, 'good', `⚖️ ${name(f.idx)} lève son embargo : les échanges reprennent.`, now);
    } else if ((f.relation <= REACT.embargo.relation || f.stance === 'war') && !(f.embargoUntil > now) && ready(r, 'embargo', now) && per !== 'isolationist') {
      f.embargoUntil = now + REACT.embargo.durH * H;
      report(state, f, 'embargo', `${name(f.idx)} décrète un embargo : vos caravanes rapportent moins (−5 %) pendant 24 h, ou jusqu’à ce que la relation remonte au-dessus de −30.`, now, true);
    }
    // Allié en guerre : demande d'aide logistique (contrat ; jamais plus d'une à la fois)
    if (f.stance === 'alliance' && f.wars.length && ready(r, 'aid', now) && !(state.contracts || []).some((c) => c.kind === 'aid')) {
      const c = aidContract(state, f, now);
      if (c) { state.contracts.push(c); report(state, f, 'aid', `${name(f.idx)}, en guerre contre ${f.wars.map(name).join(', ')}, vous demande ${c.title.replace(/^.*— /, '')}.`, now); }
    }
    // Partenaire marchand et routes sûres : contrats mieux payés
    if ((f.stance === 'trade' || f.stance === 'alliance') && per === 'commercial' && routesSafe(state, now) && ready(r, 'favor', now)) {
      state.buffs.push({ name: `Faveur de ${name(f.idx)}`, mods: { 'contract.reward': REACT.favor.contract }, until: now + REACT.favor.durH * H, react: f.idx });
      report(state, f, 'favor', `${name(f.idx)} salue la sûreté de vos routes : vos contrats rapportent 10 % de plus pendant 12 h.`, now);
    }
    // Faction affaiblie : prête à négocier (paix et pacte facilités)
    const weak = f.army < (f.peakArmy || f.army) * REACT.weakened.armyShare || f.weariness >= REACT.weakened.weariness;
    if (weak && f.relation < 20 && ready(r, 'weakened', now)) {
      f.negotiableUntil = now + REACT.weakened.durH * H;
      report(state, f, 'weakened', `${name(f.idx)}, affaiblie, se dit prête à négocier : paix et pacte commercial plus faciles pendant 12 h.`, now, true);
    }
  }
}

// Routes sûres : aucun raid en cours, aucun convoi attaqué ni avant-poste pillé depuis 24 h
export function routesSafe(state, now = Date.now()) {
  if ((state.raids || []).length) return false;
  const day = Math.floor(now / 86400000);
  const L = state.stats?.losses || {};
  for (const d of [day, day - 1]) if (L[d]?.caravan || L[d]?.outpost || L[d]?.raid) return false;
  return true;
}

function aidContract(state, f, now) {
  const towns = Object.values(state.world.pois).filter((p) => p.type === 'town' && state.world.revealed[p.y * state.world.size + p.x]);
  const res = rng.pick(['food', 'iron', 'wood']);
  const th = thLevel(state);
  const qty = Math.round(((300 + th * 250) * 1.2) / Math.max(0.6, Math.sqrt(RESOURCES[res].price)) / 10) * 10;
  const town = towns[0] || { name: name(f.idx), x: 0, y: 0 };
  return {
    id: uid('ct'), kind: 'aid', diff: 2, town: name(f.idx), tx: town.x, ty: town.y, posted: now, until: now + 12 * H,
    res, qty, faction: f.idx, relation: REACT.aid.relation, rep: 'diplomat',
    reward: { gold: Math.round(qty * RESOURCES[res].price * 0.8) },
    title: `🤝 Aide à un allié — ${fmt(qty)} ${RESOURCES[res].name} pour ${name(f.idx)}`,
  };
}

// Effets des réactions sur le royaume (agrégés dans computeMods) : embargo seulement, plafonné
export function reactionMods(state, now = Date.now()) {
  let em = 0;
  for (const f of state.factions || []) if (f.embargoUntil > now) em += REACT.embargo.caravan;
  return em ? { 'caravan.gain': Math.max(REACT.embargo.cap, em) } : {};
}

// Garnison des capitales renforcées
export const fortifyFactor = (state, idx, now = Date.now()) => (state.factions?.[idx]?.fortifiedUntil > now ? 1 + REACT.fortify.garrison : 1);
// Bonus de négociation d'une faction affaiblie
export const negotiationBonus = (f, now = Date.now()) => (f?.negotiableUntil > now ? REACT.weakened.peace : 0);

// Vue pour l'interface : état actuel de chaque faction
export function factionStatus(state, f, now = Date.now()) {
  const out = [];
  if (f.fortifiedUntil > now) out.push({ kind: 'fortify', until: f.fortifiedUntil });
  if (f.embargoUntil > now) out.push({ kind: 'embargo', until: f.embargoUntil });
  if (f.negotiableUntil > now) out.push({ kind: 'weakened', until: f.negotiableUntil });
  return out.map((x) => ({ ...x, ...REACTION_TEXT[x.kind] }));
}

void PERSONALITIES; void remember;
