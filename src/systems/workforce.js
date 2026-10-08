import { PROFESSIONS, WORK_SECTORS, TRAITS, FOREMAN_TYPES, WORKER_NAMES, workerXpFor } from '../data/workers.js';
import { HERO_CLASSES } from '../data/heroes.js';
import { rng } from '../core/rng.js';
import { uid } from '../core/util.js';
import { buildingsOf, levelOf, allBuildings } from './city.js';
import { pay, missing } from './economy.js';
import { createHero } from './heroes.js';
import { log } from './log.js';
import { chronicle } from './chronicle.js';

export const automationLevel = (state) => state.automation?.level || 0;

export function housing(state) {
  const houses = buildingsOf(state, 'house').reduce((a, b) => a + b.level * 3, 0);
  return 6 + houses + levelOf(state, 'townhall') * 2;
}

export function createWorker(prof = null, opts = {}) {
  prof = prof || rng.pick(Object.keys(PROFESSIONS));
  const traits = [];
  const keys = Object.keys(TRAITS);
  traits.push(rng.pick(keys));
  if (rng.chance(0.35)) { const t = rng.pick(keys); if (!traits.includes(t)) traits.push(t); }
  return {
    id: uid('w'), name: `${rng.pick(WORKER_NAMES)}`, prof, traits, level: opts.level || 1, xp: 0,
    stamina: 100, morale: 70, job: null, foreman: null, injuredUntil: 0, stats: { expeditions: 0, gathered: 0 },
  };
}

export const recruitWorkerCost = (state) => {
  const n = (state.workers || []).length;
  return { food: Math.round(80 * (1 + n * 0.06)), gold: Math.round(30 * (1 + n * 0.08)) };
};

export function recruitWorker(state, prof, now = Date.now()) {
  if (automationLevel(state) < 1) return { ok: false, reason: 'Débloquez « Ouvriers » dans l’Intendance' };
  if (state.workers.length >= housing(state)) return { ok: false, reason: 'Plus de logement : construisez ou améliorez des Maisons' };
  const cost = recruitWorkerCost(state);
  if (!pay(state, cost)) return { ok: false, reason: 'Ressources insuffisantes', missing: missing(state, cost) };
  const w = createWorker(prof);
  state.workers.push(w);
  return { ok: true, worker: w };
}

export const isAvailable = (w, now) => !w.job && !(w.injuredUntil > now);
export const traitMod = (w, key) => (w.traits || []).reduce((a, t) => a + (TRAITS[t]?.mods[key] || 0), 0);

export function assignWorker(state, wid, sector) {
  const w = state.workers.find((x) => x.id === wid);
  if (!w) return { ok: false };
  if (w.job?.type === 'exp') return { ok: false, reason: 'En expédition' };
  if (sector && !WORK_SECTORS[sector]) return { ok: false };
  w.job = sector ? { type: 'sector', sector } : null;
  return { ok: true };
}

// Affecte n ouvriers disponibles à un secteur (spécialistes d'abord). Prend aussi dans les secteurs moins prioritaires.
export function assignMany(state, sector, n, now = Date.now(), steal = true) {
  let moved = 0;
  const pref = (w) => (PROFESSIONS[w.prof].sector === sector ? 0 : 1);
  const idle = state.workers.filter((w) => isAvailable(w, now) && !w.foreman).sort((a, b) => pref(a) - pref(b));
  for (const w of idle) { if (moved >= n) break; w.job = { type: 'sector', sector }; moved++; }
  if (moved < n && steal) {
    const order = state.priorities?.order || [];
    const rank = (s) => { const i = order.indexOf(s); return i < 0 ? 99 : i; };
    const donors = state.workers.filter((w) => w.job?.type === 'sector' && w.job.sector !== sector && !w.foreman && rank(w.job.sector) > rank(sector))
      .sort((a, b) => rank(b.job.sector) - rank(a.job.sector));
    for (const w of donors) { if (moved >= n) break; w.job = { type: 'sector', sector }; moved++; }
  }
  return moved;
}

// Capacité utile d'un secteur : 2 ouvriers par niveau de bâtiment concerné
export function sectorCapacity(state, sector) {
  const types = WORK_SECTORS[sector].buildings;
  return allBuildings(state).filter((b) => types.includes(b.type)).reduce((a, b) => a + b.level * 2, 0);
}

const moraleFactor = (m) => 0.5 + Math.min(1.1, m / 100) * 0.6; // 0,5 → 1,16

// Bonus de production par secteur (alimente les modificateurs 'work.<secteur>')
export function sectorBonuses(state, now = Date.now()) {
  const out = {};
  for (const sector of Object.keys(WORK_SECTORS)) {
    const ws = (state.workers || []).filter((w) => w.job?.type === 'sector' && w.job.sector === sector && !(w.injuredUntil > now));
    if (!ws.length) continue;
    const cap = sectorCapacity(state, sector);
    const contrib = ws.map((w) => 0.04 * (1 + 0.05 * (w.level - 1)) * (PROFESSIONS[w.prof].sector === sector ? 1.4 : 1) * moraleFactor(w.morale) * (1 + traitMod(w, 'yield')))
      .sort((a, b) => b - a);
    let total = 0;
    contrib.forEach((c, i) => { total += i < cap ? c : c * 0.25; }); // surpeuplement peu efficace
    out['work.' + sector] = total;
  }
  return out;
}

// Contremaîtres en poste : leurs modificateurs
export function foremanMods(state, now = Date.now()) {
  const out = {};
  for (const w of state.workers || []) {
    if (!w.foreman || w.injuredUntil > now || w.job?.type === 'exp') continue;
    const k = 1 + 0.04 * (w.level - 1);
    for (const [m, v] of Object.entries(FOREMAN_TYPES[w.foreman].mods)) out[m] = (out[m] || 0) + v * k;
  }
  return out;
}

export const maxForemen = (state) => Math.max(0, automationLevel(state) - 1) + 1;

export function promoteForeman(state, wid, type) {
  const w = state.workers.find((x) => x.id === wid);
  if (!w || !FOREMAN_TYPES[type]) return { ok: false };
  if (automationLevel(state) < 2) return { ok: false, reason: 'Débloquez « Contremaîtres » dans l’Intendance' };
  const need = w.traits.includes('leader') ? 3 : 5;
  if (w.level < need) return { ok: false, reason: `Niveau ${need} requis` };
  if (state.workers.filter((x) => x.foreman).length >= maxForemen(state)) return { ok: false, reason: `Maximum ${maxForemen(state)} contremaîtres (palier d’Intendance)` };
  if (FOREMAN_TYPES[type] && state.workers.some((x) => x.foreman === type)) return { ok: false, reason: 'Ce poste est déjà occupé' };
  const cost = { gold: 250 * w.level };
  if (!pay(state, cost)) return { ok: false, reason: `Il faut ${cost.gold} or`, missing: missing(state, cost) };
  w.foreman = type;
  if (w.job?.type !== 'exp') w.job = null;
  log(state, 'good', `🦺 ${w.name} devient ${FOREMAN_TYPES[type].name}.`);
  return { ok: true };
}

export function demoteForeman(state, wid) {
  const w = state.workers.find((x) => x.id === wid);
  if (w) w.foreman = null;
  return { ok: true };
}

export function dismissWorker(state, wid) {
  const w = state.workers.find((x) => x.id === wid);
  if (!w || w.job?.type === 'exp') return { ok: false, reason: 'En expédition' };
  state.workers = state.workers.filter((x) => x.id !== wid);
  return { ok: true };
}

export function retrain(state, wid, prof) {
  const w = state.workers.find((x) => x.id === wid);
  if (!w || !PROFESSIONS[prof]) return { ok: false };
  if (!pay(state, { gold: 60 })) return { ok: false, reason: 'Il faut 60 or' };
  w.prof = prof;
  w.level = Math.max(1, w.level - 1);
  w.xp = 0;
  return { ok: true };
}

export function workerXp(state, w, amount, now) {
  w.xp += amount;
  while (w.level < 30 && w.xp >= workerXpFor(w.level)) {
    w.xp -= workerXpFor(w.level);
    w.level++;
    if (w.level === 5 || w.level === 10 || w.level === 15) log(state, 'good', `👷 ${w.name} (${PROFESSIONS[w.prof].name}) atteint le niveau ${w.level}.`, now);
  }
}

// Ouvrier légendaire → héros
const PROF_TO_CLASS = { lumberjack: 'general', miner: 'blacksmith', quarryman: 'blacksmith', farmer: 'farmer', hunter: 'explorer', prospector: 'explorer', artisan: 'blacksmith', porter: 'merchant' };
export function ascendWorker(state, wid, maxHeroes) {
  const w = state.workers.find((x) => x.id === wid);
  if (!w || w.level < 15) return { ok: false, reason: 'Niveau 15 requis' };
  if (w.job?.type === 'exp') return { ok: false, reason: 'En expédition' };
  if (state.heroes.length >= maxHeroes) return { ok: false, reason: 'Plus de place pour un héros' };
  const h = createHero({ cls: PROF_TO_CLASS[w.prof], rarity: w.level >= 25 ? 'legendary' : 'epic', name: `${w.name} ${HERO_CLASSES[PROF_TO_CLASS[w.prof]].name === 'Fermier' ? 'des Sillons' : 'l’Ancien ouvrier'}` });
  state.heroes.push(h);
  state.workers = state.workers.filter((x) => x.id !== wid);
  chronicle(state, `${w.name}, simple ${PROFESSIONS[w.prof].name.toLowerCase()}, est élevé au rang de héros du royaume.`);
  return { ok: true, hero: h };
}

// Tick (chaque minute de jeu) : moral, endurance, expérience, immigration, guérison
export function workforceTick(state, dtSec, now, mods) {
  const ws = state.workers || [];
  const h = dtSec / 3600;
  const tavern = levelOf(state, 'tavern');
  const target = 65 + tavern * 2 + (mods['worker.morale'] || 0) - (state.famine ? 35 : 0) + (state.resources.bread > 100 ? 5 : 0);
  for (const w of ws) {
    const t = target + traitMod(w, 'teamMorale') * 0.5;
    w.morale += (t - w.morale) * Math.min(1, h * 0.8);
    w.morale = Math.max(5, Math.min(110, w.morale));
    if (w.job?.type !== 'exp') w.stamina = Math.min(100, w.stamina + (w.job ? 8 : 25) * h);
    if (w.job?.type === 'sector') workerXp(state, w, 60 * h * (1 + (mods['worker.xp'] || 0)), now);
  }
  // Immigration : nouvelles familles si logement, nourriture et bon moral
  const avgMorale = ws.length ? ws.reduce((a, w) => a + w.morale, 0) / ws.length : 70;
  if (automationLevel(state) >= 1 && ws.length < housing(state) && !state.famine && state.resources.food > 200 && avgMorale > 45 && rng.chance(0.04 * dtSec / 60 * (1 + (mods['worker.immigration'] || 0)))) {
    const w = createWorker();
    ws.push(w);
    log(state, 'info', `🧳 Une famille s’installe : ${w.name}, ${PROFESSIONS[w.prof].name.toLowerCase()}.`, now);
  }
}
