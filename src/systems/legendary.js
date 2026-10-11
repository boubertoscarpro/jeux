// Expéditions légendaires (voir data/legendary.js) : déblocage par d'autres systèmes, préparation, itinéraire,
// événements avec décisions, épreuve finale (moteur de combat existant), sort de la découverte.
import { LEGENDS, LEGEND_EVENTS, PROVISIONS, ESCORTS, FATES, LEGEND_MIN_TH } from '../data/legendary.js';
import { UNITS } from '../data/units.js';
import { RIVALS } from '../data/world.js';
import { thLevel } from './city.js';
import { computeMods } from './modifiers.js';
import { pay, missing, gain } from './economy.js';
import { simulateBattle } from './combat.js';
import { heroStats, giveXp } from './heroes.js';
import { grantArtifact } from './collection.js';
import { shardState } from './shards.js';
import { remember, rivalryStatus } from './rivalry.js';
import { changeRelation } from './factions.js';
import { chronicle } from './chronicle.js';
import { feat, log, toast } from './log.js';

const MIN = 60000;

export function legendState(state) {
  const L = (state.legendary && typeof state.legendary === 'object' && !Array.isArray(state.legendary)) ? state.legendary : (state.legendary = {});
  L.unlocked ||= {};
  L.done ||= {};
  L.active ??= null;
  if (!Array.isArray(L.history)) L.history = [];
  return L;
}

// Indices : chaque expédition se débloque par un autre système du jeu
export function unlockCheck(state, id) {
  switch (LEGENDS[id]?.unlock) {
    case 'mystery': return Object.keys(state.archaeo?.solved || {}).length > 0;
    case 'boss': return (state.stats?.bossKills || 0) > 0;
    case 'faction': return (state.factions || []).some((f) => f.stance === 'alliance' || ['partner', 'ally'].includes(rivalryStatus(f)?.key));
    case 'dynasty': return (state.legacy?.archives || []).length > 0 || Object.values(state.city?.buildings || {}).some((b) => b.type === 'monument' && b.level >= 3);
    default: return false;
  }
}

const combatUnits = (army) => Object.entries(army || {}).filter(([u, n]) => n > 0 && UNITS[u] && UNITS[u].class !== 'special');
export const freeHeroes = (state) => state.heroes.filter((h) => !h.marchId && !h.assignment);

export function prepCost(provisions) { return { ...(PROVISIONS[provisions]?.cost || {}) }; }

export function canDepart(state, id, opts = {}, now = Date.now()) {
  const L = legendState(state);
  if (thLevel(state) < LEGEND_MIN_TH) return { ok: false, reason: `Hôtel de ville niveau ${LEGEND_MIN_TH} requis` };
  if (!LEGENDS[id]) return { ok: false, reason: 'Expédition inconnue' };
  if (!L.unlocked[id]) return { ok: false, reason: 'Aucun indice ne mène encore à ce lieu' };
  if (L.done[id]) return { ok: false, reason: 'Cette expédition a déjà été menée à son terme' };
  if (L.active) return { ok: false, reason: 'Une expédition légendaire est déjà en route' };
  if (!PROVISIONS[opts.provisions] || !ESCORTS[opts.escort]) return { ok: false, reason: 'Préparez les provisions et l’escorte' };
  if (!LEGENDS[id].routes.some((r) => r.id === opts.route)) return { ok: false, reason: 'Choisissez un itinéraire' };
  const hero = state.heroes.find((h) => h.id === opts.heroId && !h.marchId && !h.assignment);
  if (!hero) return { ok: false, reason: 'Un héros disponible doit mener l’expédition' };
  const units = combatUnits(state.army);
  const n = units.reduce((a, [, v]) => a + Math.floor(v * ESCORTS[opts.escort].share), 0);
  if (n < 5) return { ok: false, reason: 'Escorte trop maigre : formez des troupes (5 soldats au moins)' };
  return { ok: true, hero, cost: prepCost(opts.provisions), soldiers: n };
}

export function depart(state, id, opts = {}, now = Date.now()) {
  const c = canDepart(state, id, opts, now);
  if (!c.ok) return c;
  if (!pay(state, c.cost)) return { ok: false, reason: 'Provisions insuffisantes', missing: missing(state, c.cost) };
  const team = {};
  for (const [u, v] of combatUnits(state.army)) { const k = Math.floor(v * ESCORTS[opts.escort].share); if (k > 0) { team[u] = k; state.army[u] -= k; } }
  c.hero.marchId = 'legend';
  const route = LEGENDS[id].routes.find((r) => r.id === opts.route);
  legendState(state).active = { id, route: route.id, heroId: c.hero.id, team, supplies: PROVISIONS[opts.provisions].supplies, morale: 0, power: 0, step: 0, at: now + route.legMin * MIN, pending: null, log: [], start: now };
  log(state, 'info', `${LEGENDS[id].icon} L’expédition « ${LEGENDS[id].name} » quitte le château (${route.name.toLowerCase()}).`, now);
  return { ok: true };
}

const heroOf = (state, a) => state.heroes.find((h) => h.id === a.heroId) || null;
export function choiceAllowed(state, a, ch) {
  const n = ch.need;
  if (!n) return { ok: true };
  if (n.res && Object.entries(n.res).some(([r, v]) => (state.resources[r] || 0) < v)) return { ok: false, reason: 'Ressources insuffisantes' };
  if (n.stat) { const h = heroOf(state, a); const v = h ? heroStats(state, h)[n.stat[0]] || 0 : 0; if (v < n.stat[1]) return { ok: false, reason: `Le chef manque de ${{ cunning: 'ruse', lore: 'savoir', force: 'force', command: 'commandement' }[n.stat[0]]} (${Math.floor(v)}/${n.stat[1]})` }; }
  if (ch.fx?.supplies < 0 && a.supplies <= 0) return { ok: true };
  return { ok: true };
}

function applyFx(state, a, fx, now) {
  const parts = [];
  if (fx.res) { const neg = Object.fromEntries(Object.entries(fx.res).filter(([, v]) => v < 0).map(([r, v]) => [r, -v])); if (Object.keys(neg).length) pay(state, neg); const pos = Object.fromEntries(Object.entries(fx.res).filter(([, v]) => v > 0)); if (Object.keys(pos).length) gain(state, pos, computeMods(state, now)); }
  if (fx.supplies) {
    if (a.supplies + fx.supplies < 0) { a.morale -= 10; a.power -= 10; parts.push('plus de vivres : moral −10, force −10 %'); }
    a.supplies = Math.max(0, a.supplies + fx.supplies);
  }
  if (fx.morale) { a.morale += fx.morale; parts.push(`moral ${fx.morale > 0 ? '+' : ''}${fx.morale}`); }
  if (fx.power) { a.power += fx.power; parts.push(`force ${fx.power > 0 ? '+' : ''}${fx.power} %`); }
  if (fx.losses) { let lost = 0; for (const u of Object.keys(a.team)) { const k = Math.round(a.team[u] * fx.losses); a.team[u] -= k; lost += k; } parts.push(`${lost} soldat(s) perdu(s)`); }
  if (fx.delay) { a.at += fx.delay * MIN; parts.push(`+${fx.delay} min`); }
  if (fx.xp) { const h = heroOf(state, a); if (h) giveXp(state, h, fx.xp, computeMods(state, now)); }
  return parts.join(', ');
}

export function currentEvent(a) {
  const route = LEGENDS[a.id].routes.find((r) => r.id === a.route);
  return a.pending ? LEGEND_EVENTS[route.events[a.pending.i]] : null;
}

export function decide(state, idx, now = Date.now()) {
  const L = legendState(state), a = L.active;
  if (!a?.pending) return { ok: false, reason: 'Aucune décision en attente' };
  const ev = currentEvent(a), ch = ev?.choices[idx];
  if (!ch) return { ok: false, reason: 'Choix inconnu' };
  const al = choiceAllowed(state, a, ch);
  if (!al.ok) return al;
  const text = applyFx(state, a, ch.fx || {}, now);
  a.log.push({ title: ev.title, choice: ch.label, text });
  a.pending = null;
  a.step++;
  const route = LEGENDS[a.id].routes.find((r) => r.id === a.route);
  a.at = Math.max(a.at, now) + route.legMin * MIN;
  return { ok: true, text };
}

// Prévision de l'épreuve finale (pour l'interface)
export function finalEnemies(state, a) {
  const def = LEGENDS[a.id], route = def.routes.find((r) => r.id === a.route);
  const k = (0.6 + thLevel(state) * 0.08) * (route.guard || 1);
  return Object.fromEntries(Object.entries(def.final.enemies).map(([u, n]) => [u, Math.max(1, Math.round(n * k))]));
}

function finalBattle(state, a, now) {
  const def = LEGENDS[a.id];
  const mods = computeMods(state, now);
  const att = { units: a.team, mods: { ...mods, 'combat.atk': (mods['combat.atk'] || 0) + a.power / 100, 'combat.morale': (mods['combat.morale'] || 0) + a.morale }, formation: 'balanced', label: 'Expédition' };
  const res = simulateBattle(att, { units: finalEnemies(state, a), mods: {}, label: def.final.name }, { terrain: def.final.terrain, weather: state.weather?.type || 'clear' });
  a.team = Object.fromEntries(Object.entries(res.attRemaining || {}).filter(([, n]) => n > 0));
  return res.winner === 'attacker';
}

function returnHome(state, a) {
  for (const [u, n] of Object.entries(a.team)) state.army[u] = (state.army[u] || 0) + n;
  const h = heroOf(state, a);
  if (h) h.marchId = null;
}

// Tick : événements en route, épreuve finale
export function legendTick(state, now = Date.now()) {
  const L = legendState(state);
  for (const id of Object.keys(LEGENDS)) if (!L.unlocked[id] && thLevel(state) >= LEGEND_MIN_TH && unlockCheck(state, id)) {
    L.unlocked[id] = now;
    log(state, 'good', `${LEGENDS[id].icon} Un indice mène à une expédition légendaire : ${LEGENDS[id].name}.`, now);
    toast(`${LEGENDS[id].icon} Expédition légendaire découverte : ${LEGENDS[id].name}`, 'good');
  }
  const a = L.active;
  if (!a || a.pending || a.awaitingFate || a.at > now) return;
  const def = LEGENDS[a.id], route = def.routes.find((r) => r.id === a.route);
  if (a.step < route.events.length) { a.pending = { i: a.step, at: now }; toast(`${def.icon} ${def.name} : une décision vous attend`, 'event'); return; }
  // Épreuve finale
  const won = finalBattle(state, a, now);
  const h = heroOf(state, a);
  if (h) giveXp(state, h, won ? 400 : 120, computeMods(state, now));
  if (!won) {
    returnHome(state, a);
    L.history.unshift({ id: a.id, t: now, won: false, log: a.log });
    L.active = null;
    log(state, 'bad', `${def.icon} L’expédition « ${def.name} » échoue face à ${def.final.name}. Les survivants rentrent ; l’indice reste valable.`, now);
    feat(def.icon, `${def.name} : échec`, 'Les survivants rentrent. Vous pourrez retenter l’aventure.', 'bad');
    return;
  }
  gain(state, def.reward.res, computeMods(state, now));
  if (def.reward.relic) shardState(state).relicFragments += def.reward.relic;
  a.awaitingFate = true;
  feat(def.icon, `${def.name} : victoire !`, 'Décidez du sort de la découverte (onglet Fouilles).');
}

export function chooseFate(state, fate, now = Date.now()) {
  const L = legendState(state), a = L.active;
  if (!a?.awaitingFate) return { ok: false, reason: 'Aucune découverte en attente' };
  const def = LEGENDS[a.id];
  let text = FATES[fate]?.name;
  if (!text) return { ok: false, reason: 'Choix inconnu' };
  if (fate === 'keep') { const n = grantArtifact(state, null, now, def.name); text = n ? `artefact : ${n}` : 'collections complètes : 3 fragments de relique'; if (!n) shardState(state).relicFragments += 3; }
  if (fate === 'give') {
    const f = [...(state.factions || [])].filter((x) => x.stance !== 'war').sort((x, y) => y.relation - x.relation)[0];
    if (f) { changeRelation(state, f.idx, 25); remember(state, f.idx, 'gift', 30, `Don de la découverte : ${def.name}`, now); text = `offerte à ${RIVALS[f.idx]?.name}`; }
  }
  if (fate === 'archive') {
    // Points ajoutés au gain de la prochaine fondation de dynastie (voir talents.prestigeGain)
    const lg = (state.legacy ||= {});
    lg.bonusHeritage = (lg.bonusHeritage || 0) + 2;
    lg.feats = [...(lg.feats || []), { t: now, text: `Expédition « ${def.name} » menée à bien` }];
    text = 'exposée aux archives (+2 points d’héritage à la prochaine fondation de dynastie)';
  }
  if (fate === 'sell') gain(state, { gems: 20, gold: 2500 }, computeMods(state, now));
  returnHome(state, a);
  L.done[a.id] = { t: now, fate };
  L.history.unshift({ id: a.id, t: now, won: true, fate, log: a.log });
  L.active = null;
  chronicle(state, `${def.icon} L’expédition « ${def.name} » revient victorieuse. La découverte est ${FATES[fate].name.toLowerCase().replace('la garder', 'gardée').replace('l’offrir', 'offerte').replace('l’exposer', 'exposée').replace('la vendre', 'vendue')}.`, now);
  return { ok: true, text };
}

export function abandonLegend(state, now = Date.now()) {
  const L = legendState(state), a = L.active;
  if (!a) return { ok: false, reason: 'Aucune expédition en route' };
  if (a.awaitingFate) return { ok: false, reason: 'Décidez d’abord du sort de la découverte' };
  returnHome(state, a);
  L.history.unshift({ id: a.id, t: now, won: false, abandoned: true, log: a.log });
  L.active = null;
  log(state, 'info', `${LEGENDS[a.id].icon} L’expédition « ${LEGENDS[a.id].name} » rebrousse chemin.`, now);
  return { ok: true };
}

export const legendProgress = (state) => ({ done: Object.keys(legendState(state).done).length, total: Object.keys(LEGENDS).length });
