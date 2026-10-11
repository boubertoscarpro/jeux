// Campagnes militaires à objectifs contre une faction rivale. Une campagne enchaîne trois opérations ; chaque succès
// modifie durablement la suite : col sécurisé (+10 % d'attaque, raids de la faction affaiblis), fort frontalier pris
// (la faction perd des territoires et des troupes, défenses suivantes −20 %), puis une opération finale au choix :
// assiéger sa capitale (tribut imposé) ou protéger une cité libre (trêve imposée, cité reconnaissante).
// Les troupes engagées quittent le château pendant l'opération ; le combat utilise le moteur de combat existant.
import { RIVALS } from '../data/world.js';
import { ENEMY_UNITS, UNITS } from '../data/units.js';
import { rng } from '../core/rng.js';
import { fmt } from '../core/util.js';
import { thLevel, levelOf } from './city.js';
import { computeMods } from './modifiers.js';
import { simulateBattle, previewBattle } from './combat.js';
import { factionPower, diplomacy, changeRelation } from './factions.js';
import { gain } from './economy.js';
import { bumpRep } from './reputation.js';
import { giveXp } from './heroes.js';
import { chronicle } from './chronicle.js';
import { log, toast } from './log.js';
import { isRevealed, distCap } from './world.js';

export const WAR_MIN_TH = 5;
export const WAR_COOLDOWN = 12 * 3600000;
export const OPS = {
  pass: { name: 'Sécuriser le col', icon: '⛰️', terrain: 'hills', share: 0.35, minutes: 40, desc: 'Prendre le contrôle des passages de montagne.', effect: 'Attaque +10 % pour la suite de la campagne ; raids de cette faction affaiblis de 25 % pendant 48 h.' },
  fort: { name: 'Prendre le fort frontalier', icon: '🏰', terrain: 'city', share: 0.5, fort: 0.25, minutes: 60, desc: 'Assaut d’une place forte protégée par des murailles.', effect: 'La faction perd 6 territoires et 15 % de son armée ; ses défenses suivantes −20 %.' },
  siege: { name: 'Assiéger leur capitale', icon: '🔥', terrain: 'city', share: 0.75, fort: 0.35, minutes: 90, final: true, desc: 'Frapper au cœur de la faction.', effect: 'Gros butin ; la faction devient tributaire (elle vous paie tribut, plus aucun raid).' },
  protect: { name: 'Protéger une cité libre', icon: '🛡️', terrain: 'plain', share: 0.55, minutes: 75, final: true, desc: 'Briser le siège qu’elle impose à une cité libre.', effect: 'Trêve imposée, la cité devient votre alliée (+15 relation, prix favorables) ; réputation de bienfaiteur.' },
};
export const SEQUENCE = ['pass', 'fort'];

export function warState(state) {
  const w = (state.war && typeof state.war === 'object' && !Array.isArray(state.war)) ? state.war : (state.war = {});
  w.active ??= null;
  if (!Array.isArray(w.history)) w.history = [];
  w.cooldownUntil ||= 0;
  return w;
}

const combatUnits = (army) => Object.fromEntries(Object.entries(army || {}).filter(([u, n]) => n > 0 && UNITS[u] && !['special'].includes(UNITS[u].class)));

export function campaignTargets(state) {
  return (state.factions || []).filter((f) => !['alliance', 'trade', 'tributary'].includes(f.stance)).map((f) => ({ f, name: RIVALS[f.idx].name, power: factionPower(state, f), atWar: f.stance === 'war' }));
}

export function canStartCampaign(state, idx, now = Date.now()) {
  const W = warState(state);
  if (thLevel(state) < WAR_MIN_TH) return { ok: false, reason: `Hôtel de ville niv. ${WAR_MIN_TH} requis` };
  if (!levelOf(state, 'barracks')) return { ok: false, reason: 'Une caserne est nécessaire' };
  if (W.active) return { ok: false, reason: 'Une campagne est déjà en cours' };
  if (W.cooldownUntil > now) return { ok: false, reason: `Vos troupes se remettent de la dernière campagne (${Math.ceil((W.cooldownUntil - now) / 60000)} min)` };
  const f = (state.factions || []).find((x) => x.idx === idx);
  if (!f) return { ok: false, reason: 'Faction inconnue' };
  if (['alliance', 'trade', 'tributary'].includes(f.stance)) return { ok: false, reason: 'Impossible contre un allié, un partenaire commercial ou un tributaire' };
  return { ok: true, declares: f.stance !== 'war' };
}

export function startCampaign(state, idx, now = Date.now()) {
  const c = canStartCampaign(state, idx, now);
  if (!c.ok) return c;
  if (c.declares) { const r = diplomacy(state, idx, 'war', now); if (r && r.ok === false) return { ok: false, reason: r.reason || 'Déclaration de guerre impossible' }; }
  const W = warState(state);
  W.active = { faction: idx, stage: 0, final: null, fails: 0, bonus: 0, weaken: 0, op: null, startedAt: now, results: [] };
  chronicle(state, `⚔️ ${state.meta.kingdomName} lance une campagne contre ${RIVALS[idx].name}.`, now);
  return { ok: true, declared: c.declares };
}

// Opération en cours ou suivante
export function currentOpKey(state) {
  const a = warState(state).active;
  if (!a) return null;
  return a.stage < SEQUENCE.length ? SEQUENCE[a.stage] : a.final;
}

// Forces ennemies d'une opération : calibrées sur la puissance réelle de la faction
export function opEnemies(state, opKey) {
  const a = warState(state).active;
  const f = (state.factions || []).find((x) => x.idx === a.faction);
  const op = OPS[opKey];
  const style = RIVALS[a.faction].style;
  const mix = style === 'defensive' ? { militia: 0.35, guard: 0.3, royalArcher: 0.25, royalKnight: 0.1 } : style === 'raider' ? { militia: 0.3, guard: 0.1, royalArcher: 0.25, royalKnight: 0.35 } : { militia: 0.35, guard: 0.15, royalArcher: 0.3, royalKnight: 0.2 };
  const target = Math.max(250 * thLevel(state), factionPower(state, f) * op.share) * (1 - a.weaken);
  const out = {};
  for (const [u, share] of Object.entries(mix)) {
    const unit = ENEMY_UNITS[u];
    const per = (unit.atk + unit.def) * Math.sqrt(unit.hp / 30);
    out[u] = Math.max(1, Math.round((target * share) / per));
  }
  return out;
}

const opSides = (state, units, opKey, enemies, now) => {
  const a = warState(state).active, op = OPS[opKey];
  const mods = { ...computeMods(state, now) };
  mods['combat.atk'] = (mods['combat.atk'] || 0) + a.bonus;
  return [{ units, mods, formation: 'assault', label: state.meta.kingdomName }, { units: enemies, mods: {}, fort: op.fort || 0, formation: 'shieldwall', label: RIVALS[a.faction].name }, { terrain: op.terrain, weather: state.weather?.type || 'clear' }];
};

export function previewOp(state, units, now = Date.now()) {
  const key = currentOpKey(state);
  if (!key) return null;
  const en = opEnemies(state, key);
  return { key, enemies: en, pv: previewBattle(...opSides(state, units, key, en, now)) };
}

export function chooseFinal(state, key) {
  const a = warState(state).active;
  if (!a) return { ok: false, reason: 'Aucune campagne en cours' };
  if (a.stage < SEQUENCE.length) return { ok: false, reason: 'Terminez d’abord les opérations préparatoires' };
  if (!OPS[key]?.final) return { ok: false, reason: 'Objectif final inconnu' };
  if (a.op) return { ok: false, reason: 'Une opération est en cours' };
  if (key === 'protect' && !Object.values(state.world.pois).some((p) => p.type === 'town' && isRevealed(state.world, p.x, p.y))) return { ok: false, reason: 'Aucune cité libre découverte à protéger' };
  a.final = key;
  return { ok: true };
}

// Lance l'opération : les troupes choisies quittent le château jusqu'à la fin de l'opération
export function launchOp(state, units, heroId = null, now = Date.now()) {
  const a = warState(state).active;
  if (!a) return { ok: false, reason: 'Aucune campagne en cours' };
  if (a.op) return { ok: false, reason: 'Une opération est déjà en cours' };
  const key = currentOpKey(state);
  if (!key) return { ok: false, reason: 'Choisissez d’abord l’objectif final' };
  const sel = {};
  for (const [u, n] of Object.entries(units || {})) {
    const k = Math.min(Math.max(0, Math.floor(n) || 0), state.army[u] || 0);
    if (k > 0 && UNITS[u] && UNITS[u].class !== 'special') sel[u] = k;
  }
  if (!Object.keys(sel).length) return { ok: false, reason: 'Aucune troupe engagée' };
  for (const [u, n] of Object.entries(sel)) state.army[u] -= n;
  const hero = heroId ? state.heroes.find((h) => h.id === heroId && !h.marchId && !h.assignment) : null;
  if (hero) hero.marchId = 'war';
  a.op = { key, units: sel, heroId: hero?.id || null, enemies: opEnemies(state, key), start: now, end: now + OPS[key].minutes * 60000 };
  return { ok: true };
}

function finishCampaign(state, won, now) {
  const W = warState(state), a = W.active;
  const f = (state.factions || []).find((x) => x.idx === a.faction);
  W.history.unshift({ t: now, faction: a.faction, won, final: a.final, results: a.results });
  W.history.length = Math.min(W.history.length, 10);
  W.active = null;
  W.cooldownUntil = now + WAR_COOLDOWN;
  if (won) {
    state.stats.campaignsWon = (state.stats.campaignsWon || 0) + 1;
    bumpRep(state, 'warrior', 20);
    chronicle(state, `🏆 La campagne contre ${RIVALS[a.faction].name} est un triomphe.`, now);
  } else {
    if (f) changeRelation(state, a.faction, -10);
    chronicle(state, `🩸 La campagne contre ${RIVALS[a.faction].name} échoue après deux revers.`, now);
  }
}

// Fin des opérations (moteur) : combat, conséquences, retour des survivants
export function warTick(state, now = Date.now()) {
  const W = warState(state), a = W.active;
  if (!a?.op || a.op.end > now) return false;
  const op = a.op, def = OPS[op.key];
  const res = simulateBattle(...opSides(state, op.units, op.key, op.enemies, op.end));
  for (const [u, n] of Object.entries(op.units)) state.army[u] = (state.army[u] || 0) + Math.max(0, n - (res.attLosses[u] || 0));
  const hero = op.heroId && state.heroes.find((h) => h.id === op.heroId);
  if (hero) { hero.marchId = null; giveXp(state, hero, res.winner === 'attacker' ? 200 : 60, computeMods(state, now)); }
  const lost = Object.values(res.attLosses).reduce((x, y) => x + y, 0);
  const f = (state.factions || []).find((x) => x.idx === a.faction);
  a.op = null;
  if (res.winner === 'attacker') {
    state.stats.battlesWon++;
    const parts = [];
    if (op.key === 'pass') { a.bonus += 0.1; if (f) f.passSecuredUntil = now + 48 * 3600000; parts.push('attaque +10 % pour la suite, raids affaiblis'); }
    if (op.key === 'fort') {
      a.weaken = 0.2;
      if (f) { const n = Math.min(6, Math.max(0, f.territory.length - 6)); f.territory.splice(-n, n); f.army = Math.max(0.5, Math.round(f.army * 0.85 * 100) / 100); parts.push(`${n} territoires repris, armée ennemie −15 %`); }
    }
    if (op.key === 'siege') {
      const k = 1 + thLevel(state) * 0.4;
      const loot = { gold: Math.round(1500 * k), steel: Math.round(30 * k), weapons: Math.round(10 * k) };
      gain(state, loot, computeMods(state, now));
      if (f) { f.stance = 'tributary'; f.treatyAt = now; f.army = Math.max(0.5, Math.round(f.army * 0.8 * 100) / 100); }
      parts.push(`butin ${Object.entries(loot).map(([r, v]) => `${fmt(v)} ${r}`).join(', ')}, la faction devient tributaire`);
    }
    if (op.key === 'protect') {
      const town = Object.values(state.world.pois).filter((p) => p.type === 'town' && isRevealed(state.world, p.x, p.y)).sort((x, y) => distCap(state.world, x.x, x.y) - distCap(state.world, y.x, y.y))[0];
      if (town) { town.relation = (town.relation || 0) + 15; parts.push(`${town.name} vous est reconnaissante`); }
      gain(state, { gold: Math.round(800 * (1 + thLevel(state) * 0.3)) }, computeMods(state, now));
      if (f) { f.stance = 'truce'; f.treatyAt = now; }
      bumpRep(state, 'benefactor', 15);
      parts.push('trêve imposée');
    }
    a.results.push({ key: op.key, won: true, lost, t: now });
    log(state, 'good', `${def.icon} ${def.name} : victoire (${lost} pertes). ${parts.join(' ; ')}.`, now);
    toast(`${def.icon} ${def.name} : victoire !`, 'good');
    if (def.final) finishCampaign(state, true, now); else a.stage++;
  } else {
    state.stats.battlesLost++;
    a.fails++;
    a.results.push({ key: op.key, won: false, lost, t: now });
    log(state, 'bad', `${def.icon} ${def.name} : échec (${lost} pertes). ${a.fails >= 2 ? 'La campagne est perdue.' : 'Un second échec mettrait fin à la campagne.'}`, now);
    toast(`${def.icon} ${def.name} : échec`, 'bad');
    if (a.fails >= 2) finishCampaign(state, false, now);
  }
  return true;
}

export function abandonCampaign(state, now = Date.now()) {
  const a = warState(state).active;
  if (!a) return { ok: false, reason: 'Aucune campagne en cours' };
  if (a.op) return { ok: false, reason: 'Attendez le retour des troupes engagées' };
  finishCampaign(state, false, now);
  return { ok: true };
}

// Raids d'une faction dont le col a été sécurisé : armée réduite de 25 %
export const raidPenalty = (state, rivalIdx, now = Date.now()) => ((state.factions || []).find((f) => f.idx === rivalIdx)?.passSecuredUntil > now ? 0.75 : 1);
