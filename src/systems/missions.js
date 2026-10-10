// Missions dynamiques du royaume : objectifs proposés d'après l'état RÉEL du royaume (bâtiments, ressources,
// fonctionnalités débloquées, menaces), au plus 3 à la fois, jamais deux fois de suite les mêmes, toujours
// réalisables au moment où elles sont proposées. Elles complètent le parcours guidé et les quêtes, sans les
// remplacer, et s'adaptent au style du joueur (agriculture, commerce, armée, exploration, savoir).
import { BUILDINGS } from '../data/buildings.js';
import { RESOURCES } from '../data/resources.js';
import { POI_TYPES } from '../data/world.js';
import { OUTPOST_MAX_LEVEL } from '../data/territories.js';
import { rng } from '../core/rng.js';
import { uid, fmt } from '../core/util.js';
import { allBuildings, countOf, levelOf, thLevel } from './city.js';
import { computeMods } from './modifiers.js';
import { netRates, storageCap, buildingRates } from './economy.js';
import { combatUnitCount } from './army.js';
import { upgradeCheck, buildRequirement } from './construction.js';
import { levelProdFactor } from '../data/buildings.js';
import { isRevealed, distCap } from './world.js';
import { outpostLabel } from './identity.js';
import { grantReward } from './rewards.js';
import { log, toast } from './log.js';

export const MISSION_MAX = 3;
export const MISSION_TTL = 24 * 3600000;
export const MISSION_EVERY = 20 * 60000;     // une nouvelle proposition au plus toutes les 20 min de jeu
export const REROLL_COOLDOWN = 30 * 60000;   // refuser une mission : une fois toutes les 30 min
const RECENT = 4;                            // un modèle n'est pas reproposé avant 4 autres missions

export const MISSION_TAGS = { agri: '🌾 Agriculture', indus: '⚒️ Industrie', mil: '⚔️ Armée', trade: '⚖️ Commerce', explore: '🧭 Exploration', know: '📚 Savoir', outpost: '🚩 Avant-postes', build: '🏗️ Construction' };

export function missionState(state) {
  const m = (state.missions && typeof state.missions === 'object' && !Array.isArray(state.missions)) ? state.missions : (state.missions = {});
  if (!Array.isArray(m.active)) m.active = [];
  if (!Array.isArray(m.recent)) m.recent = [];
  for (const k of ['nextAt', 'rerollAt', 'done']) if (!Number.isFinite(m[k])) m[k] = 0;
  return m;
}

// Les missions arrivent avec le chapitre 2 du parcours (le tout début reste guidé et léger)
export const missionsUnlocked = (state) => (state.campaign?.chapter || 1) >= 2 || !!state.campaign?.legacy || thLevel(state) >= 3;

// Style de jeu : spécialisation choisie + habitudes réelles (statistiques)
export function playStyle(state) {
  const st = state.stats || {};
  const t = state.kingdom?.type;
  const style = { agri: 0, indus: 0, mil: 0, trade: 0, explore: 0, know: 0, outpost: 0, build: 0 };
  const K = { harvest: 'agri', iron: 'indus', merchants: 'trade', scholars: 'know', pioneers: 'explore', bastions: 'mil', shadows: 'mil', ancients: 'know' };
  if (K[t]) style[K[t]] += 1;
  if ((st.trades || 0) + (st.contracts || 0) * 2 > 12) style.trade += 0.5;
  if ((st.battlesWon || 0) > 6) style.mil += 0.5;
  if ((st.explored || 0) > 25) style.explore += 0.5;
  if (Object.keys(state.techs || {}).length > 6) style.know += 0.5;
  if (Object.keys(state.territories || {}).length >= 2) style.outpost += 0.5;
  return style;
}

const rewardFor = (state, extra = {}, rep = null) => {
  const th = Math.max(1, thLevel(state));
  const r = { res: { gold: 80 + 40 * th, ...extra } };
  if (rep) r.rep = rep;
  if (th >= 3) r.xp = 20 * th;
  return r;
};
const resAmount = (state, k = 1) => Math.round((100 + 50 * Math.max(1, thLevel(state))) * k / 10) * 10;

const PRODUCERS = { wood: ['sawmill', 'Développer l’industrie du bois', '🪓'], stone: ['quarry', 'Tailler la pierre', '⛏️'], food: ['farm', 'Nourrir le peuple', '🌾'], iron: ['mine', 'Le fer des montagnes', '⚒️'] };

// Modèles : offer(state, ctx) renvoie une mission concrète si elle est réalisable maintenant, sinon null
const TEMPLATES = [
  {
    id: 'producer', tag: 'indus', weight: 4,
    offer(s, c) {
      // Ressource sous tension : stock faible par rapport à la capacité, ou bilan horaire le plus faible
      const order = Object.keys(PRODUCERS).filter((r) => r !== 'iron' || levelOf(s, 'townhall') >= 2)
        .map((r) => ({ r, p: (s.resources[r] || 0) / Math.max(1, storageCap(s, c.mods, r)) + (c.net[r] || 0) / 2000 })).sort((a, b) => a.p - b.p);
      for (const { r } of order) {
        const [type, title, icon] = PRODUCERS[r];
        const b = allBuildings(s).filter((x) => x.type === type && x.level > 0).map((x) => ({ x, u: upgradeCheck(s, x.id, c.mods) }))
          .filter((o) => ['ready', 'lack', 'queue'].includes(o.u.status)).sort((p, q) => p.x.level - q.x.level)[0];
        const tag = r === 'food' ? 'agri' : 'indus';
        const other = r === 'wood' ? 'stone' : 'wood';
        if (b) {
          const cur = buildingRates(s, b.x, c.mods).out[r] || 0;
          const gainH = cur * (levelProdFactor(b.x.level + 1) / levelProdFactor(b.x.level) - 1);
          return { title, icon, tag, kind: 'level', params: { bid: b.x.id, name: BUILDINGS[type].name, x: b.x.x, y: b.x.y }, target: b.x.level + 1,
            desc: `Améliorez ${BUILDINGS[type].name} (${b.x.x}, ${b.x.y}) au niveau ${b.x.level + 1} : environ +${fmt(gainH)} ${RESOURCES[r].name.toLowerCase()}/h.`, view: 'city', sel: { x: b.x.x, y: b.x.y },
            reward: rewardFor(s, { [other]: resAmount(s) }) };
        }
        if (!buildRequirement(s, type)) return { title, icon, tag, kind: 'count', params: { type }, target: countOf(s, type) + 1, desc: `Construisez une ${BUILDINGS[type].name.toLowerCase()} supplémentaire (bonus d’adjacence : ${BUILDINGS[type].desc.split('. ').slice(1).join('. ') || 'voir la fiche'}).`, view: 'city', reward: rewardFor(s, { [other]: resAmount(s) }) };
      }
      return null;
    },
  },
  {
    id: 'winter', tag: 'agri', weight: 3,
    offer(s, c) {
      const net = c.net.food || 0, have = s.resources.food || 0, cap = storageCap(s, c.mods, 'food');
      if (net < 20) return null;
      const target = Math.min(Math.floor(cap * 0.9 / 100) * 100, Math.ceil((have + Math.max(500, net * 2)) / 100) * 100);
      if (target - have < 300) return null;
      return { title: 'Préparer les réserves d’hiver', icon: '🥫', tag: 'agri', kind: 'stock', params: { res: 'food' }, target,
        desc: `Constituez une réserve de ${fmt(target)} nourriture (vous en avez ${fmt(have)}, bilan ${net > 0 ? '+' : ''}${fmt(net)}/h). Les greniers pleins protègent de la famine et des raids.`, view: 'ecoReport', reward: rewardFor(s, { grain: resAmount(s, 0.6) }, { benefactor: 3 }) };
    },
  },
  {
    id: 'walls', tag: 'mil', weight: 2,
    offer(s, c) {
      const lvl = s.city.fort?.wall || 0;
      const u = upgradeCheck(s, 'fort:wall', c.mods);
      if (lvl === 0 && buildRequirement(s, 'wall')) return null;
      if (lvl > 0 && !['ready', 'lack', 'queue'].includes(u.status)) return null;
      const threat = c.threat ? ' Une faction vous est hostile : un raid est possible.' : '';
      return { title: 'Renforcer les défenses', icon: '🧱', tag: 'mil', kind: 'fort', params: { type: 'wall' }, target: lvl + 1, weightMul: c.threat ? 2.5 : 1,
        desc: `${lvl ? 'Montez' : 'Construisez'} la muraille au niveau ${lvl + 1} (+8 % de défense par niveau pour la garnison).${threat}`, view: 'city', reward: rewardFor(s, { stone: resAmount(s) }, { warrior: 3 }) };
    },
  },
  {
    id: 'garrison', tag: 'mil', weight: 2,
    offer(s, c) {
      if (!countOf(s, 'barracks')) return null;
      const n = Math.max(10, thLevel(s) * 5), cur = combatUnitCount(s.army);
      return { title: 'Renforcer la garnison', icon: '🛡️', tag: 'mil', kind: 'units', params: {}, target: cur + n, weightMul: c.threat ? 2 : 1,
        desc: `Formez ${n} soldats de plus (garnison : ${cur} → ${cur + n}). Les troupes en ville défendent le château contre les raids.`, view: 'army', reward: rewardFor(s, { food: resAmount(s) }, { warrior: 3 }) };
    },
  },
  {
    id: 'explore', tag: 'explore', weight: 3,
    offer(s) {
      if ((s.army.scout || 0) < 1) return null;
      const n = 3 + Math.floor(thLevel(s) / 3);
      return { title: 'Explorer les Terres Brisées', icon: '🧭', tag: 'explore', kind: 'stat', params: { stat: 'explored' }, target: n,
        desc: `Envoyez des éclaireurs révéler ${n} cases de brouillard (Carte → case sombre → Explorer). Ruines, gisements et cités attendent.`, view: 'world', reward: rewardFor(s, { food: resAmount(s, 0.8) }, { explorer: 4 }) };
    },
  },
  {
    id: 'expedition', tag: 'mil', weight: 2,
    offer(s, c) {
      if (!countOf(s, 'barracks') || combatUnitCount(s.army) < 10) return null;
      const w = s.world;
      const t = Object.values(w.pois).filter((p) => POI_TYPES[p.type]?.kind === 'danger' && !POI_TYPES[p.type].dungeon && isRevealed(w, p.x, p.y) && !(p.clearedUntil > c.now) && p.danger <= Math.max(1, Math.floor(thLevel(s) / 2)))
        .sort((a, b) => distCap(w, a.x, a.y) - distCap(w, b.x, b.y))[0];
      if (!t) return null;
      return { title: 'Préparer une expédition', icon: '⚔️', tag: 'mil', kind: 'stat', params: { stat: 'battlesWon' }, target: 1,
        desc: `Rassemblez vos troupes et remportez un combat — cible accessible : ${POI_TYPES[t.type].name} (${t.x}, ${t.y}), danger ${t.danger}. Espionnez d’abord pour voir vos chances.`, view: 'world', worldSel: { x: t.x, y: t.y }, reward: rewardFor(s, { iron: resAmount(s, 0.7) }, { warrior: 4 }) };
    },
  },
  {
    id: 'outpost', tag: 'outpost', weight: 3,
    offer(s) {
      const list = Object.values(s.territories || {});
      const noSpec = list.find((t) => !t.spec);
      if (noSpec) return { title: 'Donner une vocation à un avant-poste', icon: '🚩', tag: 'outpost', kind: 'outpostSpec', params: { opId: noSpec.id, name: outpostLabel(noSpec) }, target: 1,
        desc: `Choisissez une spécialité pour « ${outpostLabel(noSpec)} » (forestier, minier, agricole, commercial, militaire…). Sans elle, il ne produit rien.`, view: 'territories', reward: rewardFor(s, { wood: resAmount(s) }, { lord: 3 }) };
      const t = list.filter((x) => (x.level || 1) < OUTPOST_MAX_LEVEL).sort((a, b) => (a.level || 1) - (b.level || 1))[0];
      if (!t) return null;
      return { title: 'Développer un avant-poste', icon: '🚩', tag: 'outpost', kind: 'outpostLevel', params: { opId: t.id, name: outpostLabel(t) }, target: (t.level || 1) + 1,
        desc: `Améliorez « ${outpostLabel(t)} » au niveau ${(t.level || 1) + 1} : sa production et ses bonus augmentent (pensez à la garnison).`, view: 'territories', reward: rewardFor(s, { stone: resAmount(s) }, { lord: 3 }) };
    },
  },
  {
    id: 'trade', tag: 'trade', weight: 3,
    offer(s) {
      if (!levelOf(s, 'market')) return null;
      if ((s.contracts || []).length) return { title: 'Parole de marchand', icon: '📜', tag: 'trade', kind: 'stat', params: { stat: 'contracts' }, target: 1, desc: 'Remplissez un contrat d’une cité libre (Commerce → Marché) : les cités paient bien les marchandises de votre royaume.', view: 'market', reward: rewardFor(s, { food: resAmount(s, 0.6) }, { merchant: 4 }) };
      return { title: 'Relancer le commerce', icon: '⚖️', tag: 'trade', kind: 'stat', params: { stat: 'trades' }, target: 2, desc: 'Effectuez 2 échanges au marché : vendez un surplus ou achetez ce qui vous manque.', view: 'market', reward: rewardFor(s, {}, { merchant: 4 }) };
    },
  },
  {
    id: 'caravan', tag: 'trade', weight: 2,
    offer(s) {
      if (!levelOf(s, 'market')) return null;
      const town = Object.values(s.world.pois).filter((p) => p.type === 'town' && isRevealed(s.world, p.x, p.y)).sort((a, b) => distCap(s.world, a.x, a.y) - distCap(s.world, b.x, b.y))[0];
      if (!town) return null;
      return { title: `Une caravane pour ${town.name}`, icon: '🐪', tag: 'trade', kind: 'stat', params: { stat: 'caravans' }, target: 1, desc: `Envoyez une caravane vers ${town.name} (${town.x}, ${town.y}) — elle paie +60 % pour : ${(town.wants || []).map((r) => RESOURCES[r]?.name.toLowerCase()).join(', ')}.`, view: 'world', worldSel: { x: town.x, y: town.y }, reward: rewardFor(s, {}, { merchant: 4 }) };
    },
  },
  {
    id: 'research', tag: 'know', weight: 2,
    offer(s) {
      if (!levelOf(s, 'library')) return null;
      const n = Object.keys(s.techs || {}).length;
      return { title: 'Faire avancer le savoir', icon: '📚', tag: 'know', kind: 'techs', params: {}, target: n + 1, desc: 'Terminez une recherche à la bibliothèque. Une bibliothèque inactive est un savoir perdu.', view: 'research', reward: rewardFor(s, { stone: resAmount(s, 0.6) }) };
    },
  },
  {
    id: 'forge', tag: 'indus', weight: 1,
    offer(s) {
      if (!levelOf(s, 'forge')) return null;
      return { title: 'Commande de la forge', icon: '⚒️', tag: 'indus', kind: 'stat', params: { stat: 'crafted' }, target: 1, desc: 'Forgez un objet pour vos héros (Héros → Forge).', view: 'craft', reward: rewardFor(s, { iron: resAmount(s, 0.6) }) };
    },
  },
  {
    id: 'rubble', tag: 'build', weight: 2,
    offer(s) {
      const n = s.city.terrain.filter((t) => t === 'rubble').length;
      if (n < 2) return null;
      return { title: 'Déblayer le domaine', icon: '🧹', tag: 'build', kind: 'stat', params: { stat: 'cleared' }, target: 2, desc: `Déblayez 2 cases de décombres (il en reste ${n}) : place libérée, matériaux et parfois une trouvaille.`, view: 'city', reward: rewardFor(s, { wood: resAmount(s, 0.6) }) };
    },
  },
  {
    id: 'newbuild', tag: 'build', weight: 2,
    offer(s) {
      const cands = Object.entries(BUILDINGS).filter(([t, d]) => d.grid !== false && d.cat !== 'unique' && t !== 'road' && countOf(s, t) === 0 && !buildRequirement(s, t));
      if (!cands.length) return null;
      const [type, d] = cands[Math.floor(rng.random() * cands.length)];
      return { title: `Nouveau chantier : ${d.name}`, icon: d.icon, tag: 'build', kind: 'count', params: { type }, target: 1, desc: `Construisez votre premier(ère) ${d.name.toLowerCase()} : ${d.desc}`, view: 'city', reward: rewardFor(s, { wood: resAmount(s, 0.5), stone: resAmount(s, 0.5) }, { lord: 2 }) };
    },
  },
];
export const MISSION_TEMPLATES = TEMPLATES.map((t) => t.id);

function context(state, now) {
  const mods = computeMods(state, now);
  const threat = (state.raids || []).length > 0 || (state.factions || []).some((f) => f.stance === 'war');
  return { now, mods, net: netRates(state, mods), threat };
}

// Progression courante ; une mission atteinte reste acquise
export function missionProgress(state, m) {
  if (m.done) return { cur: m.target, target: m.target, done: true };
  const p = m.params || {};
  let cur = 0;
  switch (m.kind) {
    case 'level': cur = state.city.buildings[p.bid]?.level || 0; break;
    case 'count': cur = countOf(state, p.type); break;
    case 'stock': cur = Math.floor(state.resources[p.res] || 0); break;
    case 'fort': cur = state.city.fort?.[p.type] || 0; break;
    case 'units': cur = combatUnitCount(state.army); break;
    case 'stat': cur = Math.max(0, (state.stats?.[p.stat] || 0) - (m.base || 0)); break;
    case 'techs': cur = Object.keys(state.techs || {}).length; break;
    case 'outpostSpec': cur = Object.values(state.territories || {}).some((t) => t.id === p.opId && t.spec) ? 1 : 0; break;
    case 'outpostLevel': cur = Object.values(state.territories || {}).find((t) => t.id === p.opId)?.level || 0; break;
    default: cur = 0;
  }
  return { cur: Math.min(cur, m.target), target: m.target, done: cur >= m.target };
}

// Une mission peut devenir impossible : la raison est expliquée et le joueur peut la remplacer gratuitement
export function missionVoidReason(state, m, mods = computeMods(state)) {
  const p = m.params || {};
  if (m.kind === 'level' && !state.city.buildings[p.bid]) return `${p.name || 'Le bâtiment'} (${p.x}, ${p.y}) n’existe plus (démoli ou déplacé).`;
  if ((m.kind === 'outpostSpec' || m.kind === 'outpostLevel') && !Object.values(state.territories || {}).some((t) => t.id === p.opId)) return `L’avant-poste « ${p.name} » a été perdu ou abandonné.`;
  if (m.kind === 'stock' && m.target > storageCap(state, mods, p.res)) return 'L’entrepôt ne peut plus contenir une telle réserve (capacité réduite).';
  if (m.kind === 'level' && state.city.buildings[p.bid] && upgradeCheck(state, p.bid, mods).status === 'max' && missionProgress(state, m).cur < m.target) return 'Ce bâtiment a atteint son niveau maximal.';
  return null;
}

function offer(state, now, ctx = context(state, now)) {
  const M = missionState(state);
  const style = playStyle(state);
  const busy = new Set([...M.active.map((m) => m.tpl), ...M.recent.slice(0, RECENT)]);
  const cands = [];
  for (const t of TEMPLATES) {
    if (busy.has(t.id)) continue;
    let m = null;
    try { m = t.offer(state, ctx); } catch (e) { m = null; }
    if (!m) continue;
    const w = t.weight * (m.weightMul || 1) * (1 + 0.6 * (style[m.tag] || 0));
    cands.push({ t, m, weight: w });
  }
  if (!cands.length) return null;
  const pick = rng.weighted(cands);
  const m = pick.m;
  const mission = { id: uid('ms'), tpl: pick.t.id, title: m.title, icon: m.icon, tag: m.tag, kind: m.kind, params: m.params, target: m.target, desc: m.desc, view: m.view, sel: m.sel || null, worldSel: m.worldSel || null, reward: m.reward, at: now, expires: now + MISSION_TTL };
  if (m.kind === 'stat') mission.base = state.stats?.[m.params.stat] || 0;
  // Déjà accomplie au moment de la proposition (rare) : on n'offre pas une récompense gratuite
  if (missionProgress(state, mission).done) return null;
  M.active.push(mission);
  return mission;
}

export function missionsTick(state, now = Date.now()) {
  if (!missionsUnlocked(state)) return [];
  const M = missionState(state);
  const events = [];
  const mods = computeMods(state, now);
  for (const m of M.active) {
    if (!m.done && missionProgress(state, m).done) { m.done = now; events.push({ kind: 'done', m }); toast(`${m.icon} Mission accomplie : ${m.title}`, 'good'); }
    if (!m.done) m.void = missionVoidReason(state, m, mods);
  }
  // Expiration : sans pénalité (une mission accomplie mais non réclamée est conservée)
  const before = M.active.length;
  M.active = M.active.filter((m) => m.done || m.expires > now);
  if (M.active.length < before) M.nextAt = Math.min(M.nextAt || now, now + 60000);
  if (M.active.length < MISSION_MAX && now >= (M.nextAt || 0)) {
    const m = offer(state, now);
    M.nextAt = now + (M.active.length < 2 ? MISSION_EVERY / 2 : MISSION_EVERY);
    if (m) { events.push({ kind: 'new', m }); log(state, 'info', `${m.icon} Nouvelle mission du royaume : ${m.title}.`, now); }
  }
  return events;
}

export function missionList(state, now = Date.now()) {
  const M = missionState(state);
  return M.active.map((m) => ({ ...m, ...missionProgress(state, m), claimed: false, void: m.done ? null : m.void || null, left: m.expires - now }));
}

export function claimDynMission(state, id, now = Date.now()) {
  const M = missionState(state);
  const m = M.active.find((x) => x.id === id);
  if (!m) return { ok: false, reason: 'Mission introuvable ou expirée' };
  if (!missionProgress(state, m).done) return { ok: false, reason: 'Objectif non atteint' };
  M.active = M.active.filter((x) => x.id !== id);
  M.recent.unshift(m.tpl); M.recent.length = Math.min(M.recent.length, 8);
  M.done = (M.done || 0) + 1;
  state.stats.missions = (state.stats.missions || 0) + 1;
  const text = grantReward(state, m.reward, now);
  log(state, 'good', `${m.icon} Mission « ${m.title} » accomplie : ${text}.`, now);
  M.nextAt = Math.min(M.nextAt || now, now + 2 * 60000);
  return { ok: true, text };
}

// Refuser (une fois toutes les 30 min) ou retirer gratuitement une mission devenue impossible
export function dropMission(state, id, now = Date.now()) {
  const M = missionState(state);
  const m = M.active.find((x) => x.id === id);
  if (!m) return { ok: false, reason: 'Mission introuvable' };
  if (m.done) return { ok: false, reason: 'Mission accomplie : réclamez plutôt sa récompense' };
  const isVoid = !!missionVoidReason(state, m);
  if (!isVoid && (M.rerollAt || 0) > now) return { ok: false, reason: `Vous pourrez refuser une autre mission dans ${Math.ceil((M.rerollAt - now) / 60000)} min` };
  M.active = M.active.filter((x) => x.id !== id);
  M.recent.unshift(m.tpl); M.recent.length = Math.min(M.recent.length, 8);
  if (!isVoid) M.rerollAt = now + REROLL_COOLDOWN;
  M.nextAt = now; // une nouvelle proposition arrive au prochain passage
  return { ok: true, void: isVoid };
}
