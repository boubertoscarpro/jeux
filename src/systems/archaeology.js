// Mystères archéologiques persistants (voir data/archaeology.js).
// Cycle : indice → 3 sites à localiser (zone indiquée, il faut explorer) → fouilles → étude de chaque fragment →
// énigme → lieu unique, bonus permanent, plan de forge. Un seul mystère actif à la fois.
import { MYSTERIES, MYSTERY_ORDER, ARCHAEO_MIN_TH, CLUE_EVERY, CLUE_REST_H, DIG, STUDY, RETRY_H } from '../data/archaeology.js';
import { POI_TYPES } from '../data/world.js';
import { rng } from '../core/rng.js';
import { thLevel } from './city.js';
import { computeMods } from './modifiers.js';
import { pay, missing, gain } from './economy.js';
import { isRevealed, reveal, distCap, poiAt } from './world.js';
import { chronicle } from './chronicle.js';
import { learnPlan } from './recipes.js';
import { bumpRep } from './reputation.js';
import { log, toast, feat } from './log.js';

export function archaeoState(state) {
  const a = (state.archaeo && typeof state.archaeo === 'object') ? state.archaeo : (state.archaeo = {});
  a.active ??= null;
  a.solved ||= {};
  a.places ||= {};
  if (!Number.isFinite(a.exploredMark)) a.exploredMark = 0;
  if (!Number.isFinite(a.dungeonMark)) a.dungeonMark = 0;
  return a;
}

// Bonus permanents des mystères résolus
export function archaeoMods(state) {
  const m = {};
  for (const id of Object.keys(state.archaeo?.solved || {})) for (const [k, v] of Object.entries(MYSTERIES[id]?.reward.mods || {})) m[k] = (m[k] || 0) + v;
  return m;
}

export const nextMystery = (state) => MYSTERY_ORDER.find((id) => !state.archaeo?.solved?.[id]) || null;

// Place trois sites dans trois directions différentes ; la zone annoncée est décalée du site réel
function placeSites(state) {
  const w = state.world, c = w.capital;
  const base = rng.float(0, Math.PI * 2);
  const sites = [];
  for (let i = 0; i < 3; i++) {
    let x, y, k = 0;
    do {
      const ang = base + (i * 2 * Math.PI) / 3 + rng.float(-0.5, 0.5), d = rng.float(9, 18);
      x = Math.max(1, Math.min(w.size - 2, Math.round(c.x + Math.cos(ang) * d)));
      y = Math.max(1, Math.min(w.size - 2, Math.round(c.y + Math.sin(ang) * d)));
      k++;
    } while (k < 30 && (poiAt(w, x, y) || sites.some((s) => s.x === x && s.y === y)));
    const ox = rng.int(-3, 3), oy = rng.int(-3, 3);
    sites.push({ x, y, cx: x + ox, cy: y + oy, r: 5, located: false, found: false, studied: null });
  }
  return sites;
}

export function startMystery(state, id, now = Date.now()) {
  const a = archaeoState(state);
  const def = MYSTERIES[id];
  if (!def || a.active || a.solved[id]) return null;
  a.active = { id, since: now, sites: placeSites(state), dig: null, eliminated: [], attempts: 0, retryAt: 0 };
  refreshLocated(state);
  chronicle(state, `Un indice intrigue les érudits : ${def.clue} Le mystère « ${def.name} » commence.`, now);
  log(state, 'good', `🏺 Nouvel indice : ${def.name}. Trois sites sont à retrouver (onglet Fouilles).`, now);
  toast(`🏺 Mystère : ${def.name}`, 'good');
  return a.active;
}

// Un site est localisé dès que sa case est explorée (exploration, éclaireurs, expéditions…)
function refreshLocated(state) {
  const m = state.archaeo?.active;
  if (!m || !state.world) return;
  for (const s of m.sites) if (!s.located && isRevealed(state.world, s.x, s.y)) s.located = true;
}

// Risque d'embuscade : lieux dangereux non nettoyés autour du site
export function digRisk(state, site, now = Date.now()) {
  const w = state.world, R = DIG.dangerRadius;
  let n = 0;
  for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
    const p = poiAt(w, site.x + dx, site.y + dy);
    if (p && POI_TYPES[p.type]?.kind === 'danger' && !(p.clearedUntil > now)) n++;
  }
  return Math.min(DIG.maxRisk, n * DIG.riskPerDanger);
}

export function digPreview(state, i, now = Date.now()) {
  const m = state.archaeo?.active;
  const s = m?.sites[i];
  if (!s) return null;
  const dist = distCap(state.world, s.x, s.y);
  return { cost: DIG.cost(thLevel(state)), minutes: DIG.minutes(dist), risk: digRisk(state, s, now), dist };
}

export function canDig(state, i, now = Date.now()) {
  const m = state.archaeo?.active;
  if (!m) return { ok: false, reason: 'Aucun mystère en cours' };
  const s = m.sites[i];
  if (!s) return { ok: false, reason: 'Site inconnu' };
  if (s.found) return { ok: false, reason: 'Site déjà fouillé' };
  if (!s.located) return { ok: false, reason: 'Site non localisé : explorez la zone indiquée' };
  if (m.dig) return { ok: false, reason: 'Une équipe de fouille est déjà sur le terrain' };
  if (m.sites.some((x) => x.found && !x.studied)) return { ok: false, reason: 'Étudiez d’abord le fragment rapporté' };
  return { ok: true, ...digPreview(state, i, now) };
}

export function startDig(state, i, now = Date.now()) {
  const c = canDig(state, i, now);
  if (!c.ok) return c;
  if (!pay(state, c.cost)) return { ok: false, reason: 'Ressources insuffisantes', missing: missing(state, c.cost) };
  state.archaeo.active.dig = { site: i, start: now, end: now + c.minutes * 60000, risk: c.risk };
  return { ok: true, minutes: c.minutes };
}

function resolveDig(state, now) {
  const a = state.archaeo, m = a.active, d = m.dig;
  m.dig = null;
  const s = m.sites[d.site];
  const def = MYSTERIES[m.id];
  if (rng.chance(d.risk)) {
    log(state, 'bad', `⛏️ L’équipe de fouille a été chassée par les occupants des environs. Nettoyez les lieux dangereux proches du site pour fouiller sans risque.`, now);
    toast('⛏️ Fouille interrompue par une embuscade', 'bad');
    return;
  }
  s.found = true;
  const n = m.sites.filter((x) => x.found).length;
  bumpRep(state, 'explorer', 2);
  log(state, 'good', `🏺 Fragment ${n}/3 de « ${def.name} » mis au jour : ${def.fragments[d.site]}`, now);
  toast(`🏺 Fragment ${n}/3 trouvé : étudiez-le (onglet Fouilles)`, 'good');
}

export function studyFragment(state, i, how, now = Date.now()) {
  const m = state.archaeo?.active;
  const s = m?.sites[i];
  const st = STUDY[how];
  if (!s || !st) return { ok: false, reason: 'Étude impossible' };
  if (!s.found || s.studied) return { ok: false, reason: 'Aucun fragment à étudier ici' };
  const def = MYSTERIES[m.id];
  if (how === 'deep' && m.eliminated.length >= def.answers.length - 1) return { ok: false, reason: 'Toutes les mauvaises réponses sont déjà écartées' };
  if (!pay(state, st.cost)) return { ok: false, reason: 'Ressources insuffisantes', missing: missing(state, st.cost) };
  s.studied = how;
  let text = '';
  if (how === 'quick') {
    const next = m.sites.find((x) => !x.located);
    if (next) { reveal(state.world, next.x, next.y, 1); next.located = true; text = `Site suivant localisé en (${next.x}, ${next.y}).`; }
    else text = 'Tous les sites sont déjà localisés.';
  } else if (how === 'deep') {
    const wrong = def.answers.map((_, k) => k).filter((k) => k !== def.correct && !m.eliminated.includes(k));
    const k = rng.pick(wrong);
    m.eliminated.push(k);
    text = `Réponse écartée : « ${def.answers[k]} ».`;
  } else {
    gain(state, st.gain, computeMods(state, now));
    text = 'Le collectionneur paie 6 gemmes.';
  }
  return { ok: true, text };
}

export const riddleReady = (m) => !!m && m.sites.every((s) => s.found && s.studied);

export function answerRiddle(state, k, now = Date.now()) {
  const a = archaeoState(state), m = a.active;
  if (!riddleReady(m)) return { ok: false, reason: 'Réunissez et étudiez d’abord les trois fragments' };
  if (m.retryAt > now) return { ok: false, reason: 'Les érudits réfléchissent encore' };
  const def = MYSTERIES[m.id];
  if (!(k >= 0 && k < def.answers.length) || m.eliminated.includes(k)) return { ok: false, reason: 'Réponse invalide' };
  if (k !== def.correct) {
    m.attempts++;
    m.eliminated.push(k);
    m.retryAt = now + RETRY_H * 3600000;
    log(state, 'bad', `❌ « ${def.answers[k]} » : les érudits se sont trompés. Nouvel essai possible dans ${RETRY_H} h.`, now);
    return { ok: true, correct: false };
  }
  // Résolu : lieu unique (repère sur la carte, au dernier site), bonus permanent, ressources, plan de forge
  const last = m.sites[m.sites.length - 1];
  a.solved[m.id] = now;
  a.places[m.id] = { x: last.x, y: last.y };
  a.active = null;
  gain(state, def.reward.res, computeMods(state, now));
  const plan = def.reward.plan ? learnPlan(state, def.reward.plan, `mystère « ${def.name} »`, now) : null;
  bumpRep(state, 'explorer', 10);
  chronicle(state, `Le mystère « ${def.name} » est résolu : ${def.place.name} est retrouvé. ${def.reward.text}.`, now);
  feat(def.place.icon, `${def.place.name} retrouvé`, def.reward.text);
  return { ok: true, correct: true, text: `${def.reward.text}${plan ? ` · plan « ${plan} »` : ''}` };
}

export function abandonMystery(state, now = Date.now()) {
  const a = archaeoState(state);
  if (!a.active) return { ok: false, reason: 'Aucun mystère en cours' };
  log(state, 'info', `🏺 Le mystère « ${MYSTERIES[a.active.id].name} » est mis de côté. Un nouvel indice le relancera.`, now);
  a.active = null;
  a.exploredMark = state.stats.explored || 0;
  a.dungeonMark = state.stats.dungeons || 0;
  return { ok: true };
}

// Tick du monde : localisation, fin des fouilles, nouveaux indices
export function archaeoTick(state, now = Date.now()) {
  const a = archaeoState(state);
  if (a.active) {
    refreshLocated(state);
    if (a.active.dig && a.active.dig.end <= now) resolveDig(state, now);
    return;
  }
  if (thLevel(state) < ARCHAEO_MIN_TH) { a.exploredMark = state.stats.explored || 0; a.dungeonMark = state.stats.dungeons || 0; return; }
  const id = nextMystery(state);
  if (!id || thLevel(state) < MYSTERIES[id].th) return;
  const ex = (state.stats.explored || 0) - a.exploredMark, dg = (state.stats.dungeons || 0) - a.dungeonMark;
  // Les mystères s'espacent : chaque mystère résolu double l'effort du suivant, et 24 h passent entre deux
  const n = 1 + Object.keys(a.solved).length;
  const lastSolved = Math.max(0, ...Object.values(a.solved));
  if (now - lastSolved < CLUE_REST_H * 3600000) return;
  if (ex >= CLUE_EVERY.explored * n || dg >= CLUE_EVERY.dungeons * n) {
    a.exploredMark = state.stats.explored || 0;
    a.dungeonMark = state.stats.dungeons || 0;
    startMystery(state, id, now);
  }
}

// Progrès vers le prochain indice (affiché dans la vue)
export function clueProgress(state) {
  const a = archaeoState(state);
  const n = 1 + Object.keys(a.solved).length;
  const rest = Math.max(0, ...Object.values(a.solved)) + CLUE_REST_H * 3600000;
  return { explored: Math.max(0, (state.stats.explored || 0) - a.exploredMark), dungeons: Math.max(0, (state.stats.dungeons || 0) - a.dungeonMark), need: { explored: CLUE_EVERY.explored * n, dungeons: CLUE_EVERY.dungeons * n }, restUntil: rest };
}
