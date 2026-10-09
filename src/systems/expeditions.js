import { EXPEDITION_TYPES, EXPEDITION_EVENTS, PROFESSIONS, FOREMAN_TYPES, TRAITS } from '../data/workers.js';
import { POI_TYPES, SECONDS_PER_TILE } from '../data/world.js';
import { RESOURCES } from '../data/resources.js';
import { UNITS } from '../data/units.js';
import { rng } from '../core/rng.js';
import { uid, fmt, addInto } from '../core/util.js';
import { computeMods } from './modifiers.js';
import { gain } from './economy.js';
import { simulateBattle } from './combat.js';
import { generateItem } from './items.js';
import { poiAt, distCap, reveal, isRevealed, spawnPoi, findFreeTile, wTerrain, key } from './world.js';
import { automationLevel, isAvailable, traitMod, workerXp, createWorker, housing } from './workforce.js';
import { log, toast } from './log.js';
import { chronicle } from './chronicle.js';
import { grantArtifact } from './collection.js';
import { recordMax, bumpRep } from './reputation.js';
import { rollShards, addShards, shardState } from './shards.js';
import { shardCfg } from './config.js';
import { armyPower } from './army.js';
import { ANOMALY } from '../data/workers.js';

export const maxTeams = (state) => (automationLevel(state) >= 1 ? 1 + automationLevel(state) : 0);
const EVENT_EVERY = 20 * 60 * 1000;
const DECISION_DELAY = 20 * 60 * 1000;

export function teamWorkers(state, team) { return team.workerIds.map((id) => state.workers.find((w) => w.id === id)).filter(Boolean); }
export function teamForeman(state, team) { return state.workers.find((w) => w.id === team.foremanId) || null; }

export function createTeam(state, opts) {
  if (automationLevel(state) < 1) return { ok: false, reason: 'Débloquez « Ouvriers » dans l’Intendance' };
  if (state.expeditions.length >= maxTeams(state)) return { ok: false, reason: `Maximum ${maxTeams(state)} équipes (palier d’Intendance)` };
  const def = EXPEDITION_TYPES[opts.type];
  if (!def) return { ok: false };
  if (automationLevel(state) < def.automation) return { ok: false, reason: `Palier d’Intendance ${def.automation} requis` };
  const team = {
    id: uid('ex'), name: opts.name || def.name, type: opts.type, workerIds: [], foremanId: null, escort: {},
    target: opts.target || 'auto', hours: opts.hours || 2, maxQty: opts.maxQty || 0, repeat: false, policy: 'ask', rations: false,
    status: 'idle', runs: 0, totalYield: 0, history: [],
  };
  state.expeditions.push(team);
  return { ok: true, team };
}

export function deleteTeam(state, id) {
  const t = state.expeditions.find((x) => x.id === id);
  if (!t || t.status !== 'idle') return { ok: false, reason: 'L’équipe est en route' };
  state.expeditions = state.expeditions.filter((x) => x.id !== id);
  return { ok: true };
}

// Choisit automatiquement le site le plus proche
export function autoTarget(state, team) {
  const def = EXPEDITION_TYPES[team.type];
  const w = state.world;
  if (team.type === 'exploration' || def.forbidden) {
    for (let i = 0; i < 80; i++) {
      const ang = rng.float(0, Math.PI * 2), d = rng.float(7, 18);
      const x = Math.round(w.capital.x + Math.cos(ang) * d), y = Math.round(w.capital.y + Math.sin(ang) * d);
      if (x >= 0 && y >= 0 && x < w.size && y < w.size && !isRevealed(w, x, y)) return { x, y };
    }
    return { x: Math.min(w.size - 1, w.capital.x + 10), y: w.capital.y };
  }
  const busy = new Set(state.expeditions.filter((t) => t.status !== 'idle' && t.id !== team.id && t.at).map((t) => key(t.at.x, t.at.y)));
  const cands = Object.values(w.pois).filter((p) => def.nodes.includes(p.type) && isRevealed(w, p.x, p.y) && !busy.has(key(p.x, p.y))
    && (!team.focus || POI_TYPES[p.type].res === team.focus)
    && (POI_TYPES[p.type].kind === 'gather' ? p.amount > 50 : !(p.clearedUntil > Date.now())));
  cands.sort((a, b) => distCap(w, a.x, a.y) - distCap(w, b.x, b.y));
  return cands[0] ? { x: cands[0].x, y: cands[0].y } : null;
}

function teamSpeed(state, team, mods) {
  const ws = teamWorkers(state, team);
  const swift = ws.length ? ws.reduce((a, w) => a + traitMod(w, 'speed'), 0) / ws.length : 0;
  let s = 1 + swift + (mods['march.speed'] || 0);
  const esc = Object.entries(team.escort).filter(([, n]) => n > 0);
  if (esc.length) s *= Math.min(1, ...esc.map(([u]) => UNITS[u].speed));
  const fm = teamForeman(state, team);
  if (fm?.foreman === 'explorer') s *= 1.2;
  return Math.max(0.3, s);
}

const hardnessOf = (res) => Object.values(POI_TYPES).find((d) => d.res === res)?.hardness || 1;

// Rendement horaire (unités de ressource principale)
export function teamRate(state, team, mods, now = Date.now()) {
  const def = EXPEDITION_TYPES[team.type];
  const poi = team.at && poiAt(state.world, team.at.x, team.at.y);
  const res = poi && POI_TYPES[poi.type].res;
  if (!res || !def.per) return 0;
  let r = 0;
  for (const w of teamWorkers(state, team)) {
    if (w.injuredUntil > now) continue;
    const match = w.prof === def.prof ? 1.5 : PROFESSIONS[w.prof].sector === PROFESSIONS[def.prof]?.sector ? 1 : 0.7;
    const stam = w.stamina < 20 ? 0.6 : 1;
    r += def.per * (1 + 0.06 * (w.level - 1)) * match * (0.55 + Math.min(1.1, w.morale / 100) * 0.55) * (1 + traitMod(w, 'yield')) * stam;
  }
  const fm = teamForeman(state, team);
  if (fm && FOREMAN_TYPES[fm.foreman]?.exp.includes(team.type)) r *= 1.25 + 0.03 * (fm.level - 1);
  r *= 1 + (mods['gather.all'] || 0) + (mods['gather.' + res] || 0) + (mods['expedition.yield'] || 0) + (team.rationsOn ? 0.15 : 0) + (team.bonus || 0);
  return r / hardnessOf(res);
}

export function teamCapacity(state, team) {
  let c = teamWorkers(state, team).length * 60;
  for (const [u, n] of Object.entries(team.escort || {})) c += (UNITS[u]?.carry || 0) * n;
  return c;
}

export function setTeam(state, id, patch) {
  const t = state.expeditions.find((x) => x.id === id);
  if (!t) return { ok: false };
  if (t.status !== 'idle' && ('workerIds' in patch || 'escort' in patch || 'type' in patch)) return { ok: false, reason: 'Équipe en route' };
  if ('repeat' in patch && patch.repeat && automationLevel(state) < 3) return { ok: false, reason: 'Palier d’Intendance 3 requis' };
  Object.assign(t, patch);
  return { ok: true };
}

export function startExpedition(state, id, now = Date.now()) {
  const t = state.expeditions.find((x) => x.id === id);
  if (!t) return { ok: false };
  if (t.status !== 'idle') return { ok: false, reason: 'Déjà en route' };
  const def = EXPEDITION_TYPES[t.type];
  const ws = teamWorkers(state, t);
  if (t.type !== 'mercenary' && !ws.length) return { ok: false, reason: 'Ajoutez des ouvriers à l’équipe' };
  if (t.type === 'mercenary' && !Object.values(t.escort).some((n) => n > 0)) return { ok: false, reason: 'Les mercenaires ont besoin d’une escorte armée' };
  for (const w of ws) {
    if (w.injuredUntil > now) return { ok: false, reason: `${w.name} est blessé` };
    if (w.job?.type === 'exp' && w.job.id !== t.id) return { ok: false, reason: `${w.name} est déjà dans une autre expédition` };
    if (w.job && w.job.type !== 'team') { /* retiré du secteur */ }
    if (w.stamina < 25) return { ok: false, reason: `${w.name} est épuisé (endurance ${Math.round(w.stamina)})` };
  }
  for (const [u, n] of Object.entries(t.escort)) if ((state.army[u] || 0) < n) return { ok: false, reason: `Pas assez de ${UNITS[u].name} pour l’escorte` };
  if (def.forbidden) {
    const fc = shardCfg(state).forbidden;
    const sh = shardState(state);
    if (now - (sh.forbiddenAt || 0) < fc.cooldownHours * 3600000) return { ok: false, reason: `Les chemins interdits se referment : réouverture dans ${Math.ceil((sh.forbiddenAt + fc.cooldownHours * 3600000 - now) / 3600000)} h` };
    if (armyPower(t.escort) < fc.minPower) return { ok: false, reason: `Escorte trop faible (puissance ${fc.minPower} requise)` };
    t.hours = fc.hours; t.repeat = false;
  }
  const target = t.target === 'auto' ? autoTarget(state, t) : t.target;
  if (!target) return { ok: false, reason: 'Aucun site adapté découvert : explorez la carte' };
  const poi = poiAt(state.world, target.x, target.y);
  if (def.nodes.length && (!poi || !def.nodes.includes(poi.type))) return { ok: false, reason: 'Destination invalide pour ce type d’expédition' };
  const mods = computeMods(state, now);
  // Ravitaillement : rations si disponibles (bonus), sinon nourriture
  const n = ws.length + Object.values(t.escort).reduce((a, b) => a + b, 0);
  const need = Math.ceil(n * t.hours * 0.5);
  t.rationsOn = false;
  if (t.rations && (state.resources.rations || 0) >= need) { state.resources.rations -= need; t.rationsOn = true; }
  else {
    const food = need * 4;
    if ((state.resources.food || 0) < food) return { ok: false, reason: `Vivres insuffisants (${food} nourriture)` };
    state.resources.food -= food;
  }
  for (const [u, k] of Object.entries(t.escort)) state.army[u] -= k;
  for (const w of ws) w.job = { type: 'exp', id: t.id };
  const fm = teamForeman(state, t);
  if (fm) fm.job = { type: 'exp', id: t.id };
  const travel = (Math.max(1, distCap(state.world, target.x, target.y)) * SECONDS_PER_TILE * 1000) / teamSpeed(state, t, mods);
  Object.assign(t, { status: 'out', at: target, start: now, arrive: now + travel, travel, yield: {}, items: [], events: [], accum: 0, bonus: 0, lastAcc: 0, workStart: 0, workEnd: 0, returnAt: 0 });
  return { ok: true };
}

export function recallExpedition(state, id, now = Date.now()) {
  const t = state.expeditions.find((x) => x.id === id);
  if (!t || t.status === 'idle' || t.status === 'back') return { ok: false };
  if (t.status === 'out') { t.status = 'back'; t.returnAt = now + (now - t.start); return { ok: true }; }
  finishWork(state, t, now);
  return { ok: true };
}

export function expNextTime(t) {
  if (t.status === 'out') return t.arrive;
  if (t.status === 'work') return Math.min(t.workEnd, t.nextEventAt || Infinity, t.decisionAt || Infinity);
  if (t.status === 'back') return t.returnAt;
  return Infinity;
}

function accrue(state, t, now) {
  if (t.status !== 'work') return;
  const from = Math.max(t.lastAcc, t.workStart), to = Math.min(now, t.workEnd);
  if (to <= from) { t.lastAcc = Math.max(t.lastAcc, to); return; }
  const mods = computeMods(state, now);
  t.accum += (teamRate(state, t, mods, now) * (to - from)) / 3600000;
  t.lastAcc = to;
}

function teamLog(t, text) { t.events.push(text); if (t.events.length > 20) t.events.shift(); }

export function processExpedition(state, t, now) {
  if (t.status === 'out' && now >= t.arrive) return arrive(state, t, t.arrive);
  if (t.status === 'work') {
    if (t.decisionAt && now >= t.decisionAt) {
      const p = state.pending.find((x) => x.expId === t.id);
      if (p) resolveExpeditionEvent(state, p.id, EXPEDITION_EVENTS[p.event].default, t.decisionAt, true);
      t.decisionAt = 0;
      return;
    }
    if (t.nextEventAt && now >= t.nextEventAt && t.nextEventAt < t.workEnd) { rollEvent(state, t, t.nextEventAt); return; }
    if (now >= t.workEnd) { finishWork(state, t, t.workEnd); return; }
  }
  if (t.status === 'back' && now >= t.returnAt) homecoming(state, t, t.returnAt);
}

function arrive(state, t, now) {
  const def = EXPEDITION_TYPES[t.type];
  const poi = poiAt(state.world, t.at.x, t.at.y);
  if (t.type === 'mercenary') return mercenaryBattle(state, t, poi, now);
  if (def.nodes.length && (!poi || (POI_TYPES[poi.type].kind === 'gather' && poi.amount < 1))) {
    teamLog(t, 'Le site est épuisé ou a disparu : retour.');
    t.status = 'back'; t.returnAt = now + t.travel;
    return;
  }
  const fm = teamForeman(state, t);
  const tireless = teamWorkers(state, t).reduce((a, w) => a + traitMod(w, 'stamina'), 0) / Math.max(1, t.workerIds.length);
  const hours = t.hours * (1 + tireless);
  t.status = 'work'; t.workStart = now; t.lastAcc = now; t.workEnd = now + hours * 3600000;
  t.nextEventAt = now + EVENT_EVERY * rng.float(0.6, 1.2);
  teamLog(t, `Arrivée sur le site${fm ? ` sous la direction de ${fm.name}` : ''}.`);
  if (t.type === 'exploration') reveal(state.world, t.at.x, t.at.y, 2);
}

function dangerOf(state, t) {
  const poi = poiAt(state.world, t.at.x, t.at.y);
  return (poi?.danger || 0) + (poi?.infested ? 2 : 0) + (t.type === 'exploration' ? Math.floor(distCap(state.world, t.at.x, t.at.y) / 8) : 0);
}

function rollEvent(state, t, now) {
  accrue(state, t, now);
  t.nextEventAt = now + EVENT_EVERY * rng.float(0.7, 1.3);
  if (t.type === 'exploration') {
    const ang = rng.float(0, Math.PI * 2);
    const x = Math.max(0, Math.min(state.world.size - 1, Math.round(t.at.x + Math.cos(ang) * 3)));
    const y = Math.max(0, Math.min(state.world.size - 1, Math.round(t.at.y + Math.sin(ang) * 3)));
    const found = reveal(state.world, x, y, 2);
    if (found.length) teamLog(t, `Découvert : ${found.map((p) => POI_TYPES[p.type].name).join(', ')}.`);
    state.stats.explored++;
  }
  const ws = teamWorkers(state, t);
  const danger = dangerOf(state, t);
  const caution = ws.reduce((a, w) => a + traitMod(w, 'danger'), 0) / Math.max(1, ws.length) + (teamForeman(state, t)?.foreman === 'explorer' ? -0.2 : 0);
  const mods = computeMods(state, now);
  const p = (0.16 + danger * 0.05 + (mods['expedition.events'] || 0)) * Math.max(0.3, 1 + caution);
  if (!rng.chance(p) || state.pending.some((x) => x.expId === t.id)) return;
  const pool = Object.entries(EXPEDITION_EVENTS).filter(([, e]) => e.kinds.includes(t.type) && (!e.minDanger || danger >= e.minDanger))
    .map(([k, e]) => ({ k, weight: e.weight * (e.dangerous ? (1 + danger * 0.3) * Math.max(0.2, 1 + caution) : 1 + traitMod(ws[0] || {}, 'rare')) }));
  if (!pool.length) return;
  const evKey = rng.weighted(pool).k;
  const ev = EXPEDITION_EVENTS[evKey];
  if (!ev.choices) {
    const txt = applyFx(state, t, ev.fx, now);
    teamLog(t, `${ev.icon} ${ev.title} : ${ev.text} ${txt}`);
    return;
  }
  if (t.policy === 'safe' || t.policy === 'bold') {
    const idx = t.policy === 'safe' ? ev.default : 0;
    const txt = applyFx(state, t, ev.choices[idx].fx, now);
    teamLog(t, `${ev.icon} ${ev.title} — consigne « ${ev.choices[idx].label} » : ${txt}`);
    return;
  }
  state.pending.push({ id: uid('pd'), kind: 'exp', expId: t.id, event: evKey, x: t.at.x, y: t.at.y, t: now, deadline: now + DECISION_DELAY });
  t.decisionAt = now + DECISION_DELAY;
  teamLog(t, `${ev.icon} ${ev.title} : décision demandée.`);
  toast(`${ev.icon} ${t.name} : ${ev.title} — votre décision ?`, 'event');
}

export function resolveExpeditionEvent(state, pid, idx, now = Date.now(), auto = false) {
  const p = state.pending.find((x) => x.id === pid);
  if (!p) return { ok: false };
  const t = state.expeditions.find((x) => x.id === p.expId);
  state.pending = state.pending.filter((x) => x.id !== pid);
  if (!t || t.status !== 'work') return { ok: true, text: 'L’équipe n’est plus sur place.' };
  t.decisionAt = 0;
  accrue(state, t, now);
  const ev = EXPEDITION_EVENTS[p.event];
  const ch = ev.choices[idx] || ev.choices[ev.default];
  const txt = applyFx(state, t, ch.fx, now);
  teamLog(t, `${ev.icon} ${ev.title} — ${auto ? 'sans réponse, le contremaître décide' : 'vous décidez'} : « ${ch.label} ». ${txt}`);
  if (auto) log(state, 'explore', `${ev.icon} ${t.name} : ${ev.title} — décision par défaut « ${ch.label} ». ${txt}`, now);
  return { ok: true, text: txt };
}

function injure(state, t, n, now) {
  const ws = teamWorkers(state, t).filter((w) => !(w.injuredUntil > now));
  const out = [];
  for (let i = 0; i < n && ws.length; i++) {
    const w = ws.splice(rng.int(0, ws.length - 1), 1)[0];
    if (rng.chance(Math.max(0, -traitMod(w, 'injury')))) { out.push(`${w.name} s’en sort indemne (robuste)`); continue; }
    w.injuredUntil = now + 2 * 3600000;
    w.morale -= 10;
    out.push(`${w.name} est blessé`);
  }
  return out.join(', ');
}

function expFight(state, t, enemies, now) {
  const danger = dangerOf(state, t);
  const scaled = Object.fromEntries(Object.entries(enemies).map(([u, n]) => [u, Math.max(1, Math.round(n * (1 + danger * 0.4)))]));
  const escort = Object.fromEntries(Object.entries(t.escort).filter(([, n]) => n > 0));
  // Sans escorte, les ouvriers se défendent comme une milice
  const units = Object.keys(escort).length ? escort : { spearman: Math.ceil(teamWorkers(state, t).length * 0.6) };
  const mods = computeMods(state, now);
  const res = simulateBattle({ units, mods, formation: 'shieldwall', supply: t.rationsOn, label: 'Expédition' }, { units: scaled, mods: { 'combat.atk': 0.05 * danger } },
    { terrain: wTerrain(state.world, t.at.x, t.at.y) === 'ash' ? 'ruins' : wTerrain(state.world, t.at.x, t.at.y), weather: state.weather.type });
  if (Object.keys(escort).length) t.escort = Object.fromEntries(Object.entries(res.attRemaining).filter(([, n]) => n > 0));
  return res;
}

function applyFx(state, t, fx, now) {
  const parts = [];
  if (!fx) return '';
  if (fx.loseYield) { t.accum *= 1 - fx.loseYield; parts.push(`${Math.round(fx.loseYield * 100)}% de la récolte perdue`); }
  if (fx.delay) { t.workEnd += fx.delay * 60000; parts.push(`${fx.delay} min perdues`); }
  if (fx.injure) { const s = injure(state, t, fx.injure, now); if (s) parts.push(s); }
  if (fx.bonusYield) { t.bonus += fx.bonusYield; parts.push(`rendement +${Math.round(fx.bonusYield * 100)}%`); }
  if (fx.morale) { for (const w of teamWorkers(state, t)) w.morale = Math.min(110, w.morale + fx.morale); parts.push('moral en hausse'); }
  const roll = (o) => Object.fromEntries(Object.entries(o).map(([r, [a, b]]) => [r, rng.int(a, b)]));
  if (fx.rare) { const l = roll(fx.rare); addInto(t.yield, l); parts.push(Object.entries(l).map(([r, v]) => `+${v} ${RESOURCES[r].icon}`).join(' ')); }
  if (fx.loot) { const l = roll(fx.loot); addInto(t.yield, l); parts.push(Object.entries(l).map(([r, v]) => `+${v} ${RESOURCES[r].icon}`).join(' ')); }
  if (fx.recruits) {
    const n = rng.int(fx.recruits[0], fx.recruits[1]);
    let k = 0;
    for (let i = 0; i < n && state.workers.length < housing(state); i++) { state.workers.push(createWorker()); k++; }
    parts.push(k ? `${k} nouvel(le)s ouvrier(e)s` : 'pas de logement pour les accueillir');
    if (k) bumpRep(state, 'benefactor', 2);
  }
  if (fx.reveal) { const f = reveal(state.world, t.at.x, t.at.y, fx.reveal); parts.push(`${f.length} site(s) révélé(s)`); }
  if (fx.spawnDungeon) {
    const pos = findFreeTile(state.world, t.at.x, t.at.y, null, 3);
    if (pos) { spawnPoi(state.world, 'dungeon', pos.x, pos.y); reveal(state.world, pos.x, pos.y, 0.5); parts.push(`donjon marqué en (${pos.x}, ${pos.y})`); }
  }
  if (fx.gamble) {
    const g = fx.gamble;
    if (rng.chance(g.win + traitMod(teamWorkers(state, t)[0] || {}, 'rare'))) {
      const l = roll(g.loot); addInto(t.yield, l);
      parts.push(`trésor : ${Object.entries(l).map(([r, v]) => `${v} ${RESOURCES[r].icon}`).join(' ')}`);
      if (rng.chance(g.item)) { const it = generateItem({ ilvl: 6, boost: 0.6, min: 'rare' }); t.items.push(it); parts.push(`objet : ${it.name}`); }
    } else parts.push(`un piège ! ${injure(state, t, g.injure, now)}`);
  }
  if (fx.fight) {
    const enemies = fx.fight === true ? { bandit: 4, banditArcher: 2 } : fx.fight;
    const res = expFight(state, t, enemies, now);
    if (res.winner === 'attacker') {
      parts.push('victoire !');
      state.stats.battlesWon++;
      if (fx.winLoot) { const l = roll(fx.winLoot); addInto(t.yield, l); parts.push(Object.entries(l).map(([r, v]) => `+${v} ${RESOURCES[r].icon}`).join(' ')); }
      if (fx.artifact && rng.chance(fx.artifact)) { const a = grantArtifact(state, null, now, 'expedition'); if (a) parts.push(`ARTEFACT : ${a}`); }
    } else {
      t.accum *= 0.5;
      parts.push(`défaite : moitié de la récolte perdue, ${injure(state, t, 2, now) || 'personne de blessé'}`);
    }
  }
  if (fx.abort) { finishWork(state, t, now); parts.push('retour anticipé'); }
  return parts.join(', ') + (parts.length ? '.' : '');
}

function mercenaryBattle(state, t, poi, now) {
  const def = poi && POI_TYPES[poi.type];
  if (!poi || def.kind !== 'danger' || poi.clearedUntil > now) {
    teamLog(t, 'Cible déjà nettoyée : retour.');
    t.status = 'back'; t.returnAt = now + t.travel; return;
  }
  const res = expFight(state, t, poi.enemies || {}, now);
  if (res.winner === 'attacker') {
    const k = 1 + poi.danger * 0.45;
    const loot = Object.fromEntries(Object.entries(def.loot || {}).map(([r, v]) => [r, Math.round(v * k * 0.85)]));
    addInto(t.yield, loot);
    poi.clearedUntil = now + (def.respawn || 3600) * 1000;
    poi.enemies = {};
    state.stats.battlesWon++;
    if (def.item && rng.chance(def.item * 0.7)) t.items.push(generateItem({ ilvl: 1 + poi.danger * 2, boost: 0.15 * poi.danger }));
    teamLog(t, `⚔️ ${def.name} nettoyé.`);
    bumpRep(state, 'warrior', 1);
  } else {
    poi.enemies = { ...res.defRemaining };
    state.stats.battlesLost++;
    teamLog(t, `⚔️ Échec contre ${def.name}.`);
  }
  t.status = 'back'; t.returnAt = now + t.travel;
}

function forbiddenOutcome(state, t, now) {
  const fc = shardCfg(state).forbidden;
  shardState(state).forbiddenAt = t.start;
  const power = armyPower(t.escort);
  const fm = teamForeman(state, t);
  const o = { ...fc.outcomes };
  const boost = Math.max(0, Math.min(0.15, (power / fc.minPower - 1) * 0.05)) + (fm?.foreman === 'explorer' ? 0.05 : 0);
  o.fail = Math.max(0.15, o.fail - boost); o.success += boost / 2; o.partial = Math.max(0, 1 - o.fail - o.success);
  const r = rng.weighted(o);
  if (r === 'fail') {
    for (const u of Object.keys(t.escort)) t.escort[u] = Math.floor(t.escort[u] * 0.6);
    for (const k of ['food', 'gold']) state.resources[k] = Math.floor((state.resources[k] || 0) * 0.92);
    teamLog(t, '⛔ L’expédition interdite tourne au désastre : 40 % de l’escorte perdue, vivres et or entamés.');
    log(state, 'bad', `⛔ ${t.name} : échec de l’expédition interdite.`, now);
  } else {
    const [a, b] = r === 'success' ? fc.success : fc.partial;
    const n = addShards(state, rng.int(a, b), 'forbidden', now, 'Expédition interdite');
    teamLog(t, `⛔ ${r === 'success' ? 'Triomphe' : 'Succès partiel'} : ${n} Éclats Anciens rapportés des terres interdites.`);
    if (r === 'success' && rng.chance(0.2)) grantArtifact(state, null, now, 'Terres interdites');
    for (const u of Object.keys(t.escort)) t.escort[u] = Math.floor(t.escort[u] * 0.85);
  }
}

function finishWork(state, t, now) {
  accrue(state, t, now);
  if (EXPEDITION_TYPES[t.type].forbidden) { forbiddenOutcome(state, t, now); t.status = 'back'; t.returnAt = now + t.travel; t.nextEventAt = 0; state.pending = state.pending.filter((p) => p.expId !== t.id); return; }
  const def = EXPEDITION_TYPES[t.type];
  const poi = poiAt(state.world, t.at.x, t.at.y);
  if (poi && POI_TYPES[poi.type].kind === 'gather') {
    const res = POI_TYPES[poi.type].res;
    let amount = Math.min(t.accum, poi.amount);
    if (t.maxQty) amount = Math.min(amount, t.maxQty);
    amount = Math.floor(Math.min(amount, teamCapacity(state, t) * 3));
    poi.amount -= amount;
    poi.exhaust = (poi.exhaust || 0) + amount / Math.max(1, poi.max); // épuisement des sols
    addInto(t.yield, { [res]: amount });
    for (const [r, p] of Object.entries(POI_TYPES[poi.type].bonus || {})) { const v = Math.floor(amount * p); if (v) addInto(t.yield, { [r]: v }); }
    if (t.type === 'hunting') addInto(t.yield, { hides: Math.floor(amount * 0.2) });
    // Ressources rares selon le danger et la chance
    const luck = teamWorkers(state, t).reduce((a, w) => a + traitMod(w, 'rare'), 0);
    if (poi.danger >= 2 && rng.chance(0.15 * poi.danger + luck)) addInto(t.yield, { rareOre: rng.int(1, poi.danger) });
    if (poi.meteor && t.type === 'prospecting' && rng.chance(0.25 + luck)) { const a = grantArtifact(state, 'starIron', now, 'Météorite'); if (a) teamLog(t, `☄️ Dans le cratère : ${a} !`); }
    if (t.type === 'lumber' && poi.type === 'ancientGrove' && rng.chance(0.03 + luck)) grantArtifact(state, 'seedOfAges', now, 'Bosquet ancien');
    if (t.type === 'mining' && rng.chance(0.004 + luck * 0.1)) grantArtifact(state, 'mountainHeart', now, 'Mines');
  }
  if (def.nodes.length === 0) {
    addInto(t.yield, { gold: Math.round(40 * t.hours * teamWorkers(state, t).length) });
    if (distCap(state.world, t.at.x, t.at.y) > 14 && rng.chance(0.04)) grantArtifact(state, rng.chance(0.5) ? 'explorerEye' : 'kingsLedger', now, 'Exploration lointaine');
  }
  // Chapardage (trait cupide)
  for (const w of teamWorkers(state, t)) if (rng.chance(traitMod(w, 'theft'))) { for (const r of Object.keys(t.yield)) t.yield[r] = Math.floor(t.yield[r] * 0.9); teamLog(t, `${w.name} a chapardé une part du butin…`); }
  t.status = 'back'; t.returnAt = now + t.travel; t.nextEventAt = 0;
  state.pending = state.pending.filter((p) => p.expId !== t.id);
}

function homecoming(state, t, now) {
  const mods = computeMods(state, now);
  const got = gain(state, t.yield, mods);
  for (const it of t.items) state.inventory.items.push(it);
  const total = Object.values(t.yield).reduce((a, b) => a + b, 0);
  const ws = teamWorkers(state, t);
  for (const w of ws) {
    workerXp(state, w, 40 + total / Math.max(1, ws.length * 25), now);
    w.stamina = Math.max(0, w.stamina - t.hours * 11 * (1 - traitMod(w, 'stamina')));
    w.stats.expeditions++; w.stats.gathered += total / ws.length;
    w.job = null;
  }
  const fm = teamForeman(state, t);
  if (fm) { fm.job = null; workerXp(state, fm, 60, now); }
  for (const [u, n] of Object.entries(t.escort)) state.army[u] = (state.army[u] || 0) + n;
  t.runs++; t.totalYield += total;
  // Éclats : expéditions rares (site dangereux ou prospection) ; anomalies nécessitant le joueur
  if (!EXPEDITION_TYPES[t.type].forbidden && t.at) {
    const poi = poiAt(state.world, t.at.x, t.at.y);
    if ((poi?.danger || 0) >= 3 || t.type === 'prospecting') rollShards(state, 'expedition', now);
    if (rng.chance(0.02 * (1 + (poi?.danger || 0) * 0.3)) && !state.pending.some((p) => p.kind === 'anomaly')) {
      state.pending.push({ id: uid('pd'), kind: 'anomaly', expId: t.id, t: now, deadline: now + 3600000, x: t.at.x, y: t.at.y });
      toast('⚠️ Une concentration d’énergie ancienne vient d’être détectée !', 'event');
    }
  }
  state.stats.expeditions = (state.stats.expeditions || 0) + 1;
  state.stats.gathered += total;
  state.stats.distance = (state.stats.distance || 0) + 2 * distCap(state.world, t.at.x, t.at.y);
  recordMax(state, 'bestExpedition', total, `${t.name} (${fmt(total)} ressources)`, now);
  t.history.unshift({ t: now, yield: { ...got }, items: t.items.length, events: t.events.slice(-4) });
  if (t.history.length > 8) t.history.length = 8;
  log(state, 'good', `${EXPEDITION_TYPES[t.type].icon} ${t.name} rentre : ${Object.entries(got).filter(([, v]) => v > 0).map(([r, v]) => `${fmt(v)} ${RESOURCES[r].icon}`).join(' ') || 'rien'}${t.items.length ? ` + ${t.items.length} objet(s)` : ''}.`, now);
  if (total > 20000) chronicle(state, `L’expédition « ${t.name} » revient chargée de ${fmt(total)} ressources.`, now);
  t.status = 'idle';
  t.at = t.target === 'auto' ? null : t.at;
  t.lastReturn = now;
  // Relance automatique (contremaître + palier 3)
  if (t.repeat && automationLevel(state) >= 3 && fm) {
    const r = startExpedition(state, t.id, now);
    if (!r.ok) { t.waitReason = r.reason; } else t.waitReason = null;
  }
}

// Relance les équipes au repos dont l'automatisation est active (appelé par le tick)
export function relaunchIdle(state, now, force = false) {
  let n = 0;
  for (const t of state.expeditions) {
    if (t.status !== 'idle') continue;
    if (!force && !(t.repeat && automationLevel(state) >= 3 && teamForeman(state, t))) continue;
    const r = startExpedition(state, t.id, now);
    if (r.ok) { n++; t.waitReason = null; } else t.waitReason = r.reason;
  }
  return n;
}

export const policyName = { ask: 'Me demander', safe: 'Prudente', bold: 'Audacieuse' };
export { TRAITS };

// Anomalie : résolue uniquement par le joueur (le défaut — ignorer — ne rapporte rien)
export function resolveAnomaly(state, pid, idx, now = Date.now()) {
  const p = state.pending.find((x) => x.id === pid);
  if (!p) return { ok: false };
  if (idx === 0) {
    if ((state.resources.food || 0) < 300 || (state.resources.rations || 0) < 40) return { ok: false, reason: '300 nourriture et 40 rations requises' };
    state.resources.food -= 300; state.resources.rations -= 40;
    state.pending = state.pending.filter((x) => x.id !== pid);
    if (rng.chance(0.6)) { const n = rollShards(state, 'anomaly', now, { chance: 1 }); return { ok: true, text: n ? `Vos hommes reviennent avec ${n} Éclat(s) Ancien(s) !` : 'L’énergie s’est dissipée…' }; }
    return { ok: true, text: 'L’énergie s’est évanouie avant leur arrivée.' };
  }
  state.pending = state.pending.filter((x) => x.id !== pid);
  return { ok: true, text: 'Vous laissez l’énergie se dissiper.' };
}
export { ANOMALY };
