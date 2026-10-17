// Personnages itinérants (data/npcs.js) : apparition sur la carte, rencontre (marche « visit »), offres, primes.
// Toutes les offres passent par cette couche de règles : coût vérifié puis payé, effet réel, jamais de stock négatif.
import { NPCS, NPC_MIN_TH, npcCap, NPC_SPAWN_MIN, NPC_STAY_H, PEDDLER_GOODS } from '../data/npcs.js';
import { POI_TYPES } from '../data/world.js';
import { RESOURCES, isCapped } from '../data/resources.js';
import { PLANS } from '../data/recipes.js';
import { rng } from '../core/rng.js';
import { uid, fmt } from '../core/util.js';
import { thLevel } from './city.js';
import { computeMods } from './modifiers.js';
import { pay, missing, gain, storageCap } from './economy.js';
import { combatUnitCount } from './army.js';
import { key, poiAt, wTerrain, reveal, worldScale, isRevealed } from './world.js';
import { bumpRep } from './reputation.js';
import { recipesState, learnPlan } from './recipes.js';
import { log, toast } from './log.js';

const H = 3600000, MIN = 60000;
export const npcState = (state) => {
  const N = (state.npcs && typeof state.npcs === 'object' && !Array.isArray(state.npcs)) ? state.npcs : (state.npcs = {});
  if (!Array.isArray(N.bounties)) N.bounties = [];
  N.nextAt ??= 0;
  return N;
};
export const npcList = (state, now = Date.now()) => Object.values(state.world?.pois || {}).filter((p) => POI_TYPES[p.type]?.kind === 'npc' && !(p.until <= now));
export const npcOf = (poi) => (poi && POI_TYPES[poi.type]?.kind === 'npc' ? NPCS[POI_TYPES[poi.type].npc] : null);

// Case libre, sur la terre ferme, entre 4 cases de la capitale et ~45 % de l'échelle du monde ; 70 % du temps dans
// la zone déjà explorée (on les voit), sinon dans le brouillard (récompense l'exploration)
function freeSpot(state) {
  const w = state.world;
  const maxD = Math.max(8, worldScale(w) * 0.45);
  const wantSeen = rng.chance(0.7);
  for (let i = 0; i < 80; i++) {
    const a = rng.float(0, Math.PI * 2), d = rng.float(4, maxD);
    const x = Math.round(w.capital.x + Math.cos(a) * d), y = Math.round(w.capital.y + Math.sin(a) * d);
    if (x < 0 || y < 0 || x >= w.size || y >= w.size || poiAt(w, x, y)) continue;
    const ter = wTerrain(w, x, y);
    if (!ter || ['river', 'mountain', 'lake', 'sea'].includes(ter)) continue;
    if (i < 60 && isRevealed(w, x, y) !== wantSeen) continue;
    return { x, y };
  }
  return null;
}

export function spawnNpc(state, now = Date.now(), forceKey = null) {
  const k = forceKey || rng.weighted(Object.fromEntries(Object.entries(NPCS).map(([kk, n]) => [kk, n.weight])));
  const spot = freeSpot(state);
  if (!spot) return null;
  const th = Math.max(1, thLevel(state));
  const poi = { id: uid('npc'), type: 'npc_' + k, x: spot.x, y: spot.y, name: NPCS[k].name, danger: 0, since: now, until: now + rng.int(NPC_STAY_H.min, NPC_STAY_H.max) * H, temp: true };
  if (k === 'peddler') { const r = rng.pick(PEDDLER_GOODS); poi.offer = { res: r, qty: Math.round((250 + th * 200) / Math.sqrt(RESOURCES[r].price || 1) / 10) * 10 }; }
  state.world.pois[key(spot.x, spot.y)] = poi;
  if (isRevealed(state.world, spot.x, spot.y)) log(state, 'explore', `${NPCS[k].icon} ${NPCS[k].name} est arrivé près de (${spot.x}, ${spot.y}).`, now);
  return poi;
}

// Tick (moteur) : départs, arrivées, primes
export function npcTick(state, now = Date.now()) {
  if (!state.world?.pois) return;
  const N = npcState(state);
  for (const [k, p] of Object.entries(state.world.pois)) if (POI_TYPES[p.type]?.kind === 'npc' && p.until <= now) delete state.world.pois[k];
  checkBounties(state, now);
  // Rencontre sans réponse : le personnage n'attend pas indéfiniment (aucun coût, aucune perte)
  if (state.pending?.some((p) => p.kind === 'npc' && p.deadline <= now)) state.pending = state.pending.filter((p) => !(p.kind === 'npc' && p.deadline <= now));
  const th = thLevel(state);
  if (th < NPC_MIN_TH || now < N.nextAt) return;
  N.nextAt = now + rng.int(NPC_SPAWN_MIN[0], NPC_SPAWN_MIN[1]) * MIN;
  if (npcList(state, now).length < npcCap(th)) spawnNpc(state, now);
}

// ───────── Offres ─────────
const thOf = (s) => Math.max(1, thLevel(s));
const nearestDanger = (state, poi, n = 1, maxD = 14, now = Date.now()) => Object.values(state.world.pois)
  .filter((p) => POI_TYPES[p.type]?.kind === 'danger' && !POI_TYPES[p.type].dungeon && !(p.clearedUntil > now) && isRevealed(state.world, p.x, p.y) && Math.hypot(p.x - poi.x, p.y - poi.y) <= maxD)
  .sort((a, b) => Math.hypot(a.x - poi.x, a.y - poi.y) - Math.hypot(b.x - poi.x, b.y - poi.y)).slice(0, n);
const surplusRes = (state) => {
  const mods = computeMods(state);
  return ['wood', 'stone', 'iron', 'food'].filter((r) => isCapped(r)).sort((a, b) => (state.resources[b] || 0) / storageCap(state, mods, b) - (state.resources[a] || 0) / storageCap(state, mods, a))[0];
};
function farFog(state, n) {
  const w = state.world, out = [];
  for (let i = 0; i < 300 && out.length < n; i++) {
    const a = rng.float(0, Math.PI * 2), d = rng.float(worldScale(w) * 0.25, worldScale(w) * 0.55);
    const x = Math.round(w.capital.x + Math.cos(a) * d), y = Math.round(w.capital.y + Math.sin(a) * d);
    if (x >= 0 && y >= 0 && x < w.size && y < w.size && !isRevealed(w, x, y)) out.push({ x, y });
  }
  return out;
}

// Offres d'un PNJ : { label, hint, cost, need?, apply(state, now) → texte }. Dernière option : passer son chemin.
export function npcOffers(state, poi) {
  const k = POI_TYPES[poi.type]?.npc;
  const th = thOf(state);
  const leave = { label: 'Passer votre chemin', hint: 'Il reste sur la carte jusqu’à son départ.', cost: {}, keep: true, apply: () => 'Vous le saluez et repartez.' };
  switch (k) {
    case 'peddler': {
      const { res, qty } = poi.offer || { res: 'wood', qty: 500 };
      const price = Math.round(qty * (RESOURCES[res].price || 1) * 0.75);
      const sr = surplusRes(state);
      const sq = Math.floor(Math.min((state.resources[sr] || 0) * 0.3, 600 * th));
      return [
        { label: `Acheter ${fmt(qty)} ${RESOURCES[res].name.toLowerCase()}`, hint: `Pour ${fmt(price)} or (25 % sous le prix de référence).`, cost: { gold: price }, apply: (s) => { gain(s, { [res]: qty }, computeMods(s)); return `+${fmt(qty)} ${RESOURCES[res].icon}`; } },
        ...(sq >= 50 ? [{ label: `Lui vendre ${fmt(sq)} ${RESOURCES[sr].name.toLowerCase()}`, hint: `Il paie ${fmt(Math.round(sq * RESOURCES[sr].price * 0.9))} or (90 % du prix de référence, sans taxe de marché).`, cost: { [sr]: sq }, apply: (s) => { s.resources.gold = (s.resources.gold || 0) + Math.round(sq * RESOURCES[sr].price * 0.9); return `+${fmt(Math.round(sq * RESOURCES[sr].price * 0.9))} or`; } }] : []),
        leave,
      ];
    }
    case 'hermit': return [
      { label: 'Écouter ses leçons', hint: 'Recherche en cours avancée de 45 min (sinon recherche +15 % pendant 12 h).', cost: { gold: 120 * th, herbs: 30 }, apply: (s, now) => {
        const q = s.queues.research[0];
        if (q && q.end - now > 60000) { q.end = Math.max(now + 1000, q.end - 45 * MIN); return 'Recherche avancée de 45 min'; }
        s.buffs.push({ name: 'Leçons de l’ermite', mods: { 'research.speed': 0.15 }, until: now + 12 * H }); return 'Recherche +15 % pendant 12 h';
      } },
      { label: 'Lui demander les vieilles routes', hint: 'Il révèle une région lointaine encore dans le brouillard.', cost: { gold: 200 * th }, apply: (s) => { const [p] = farFog(s, 1); if (!p) return 'Il ne connaît rien que vous ignoriez.'; const f = reveal(s.world, p.x, p.y, 4); return `Région (${p.x}, ${p.y}) révélée : ${f.newTiles} cases`; } },
      { label: 'Lui laisser des vivres', hint: 'Réputation de bienfaiteur et d’explorateur.', cost: { food: 150 * th }, apply: (s) => { bumpRep(s, 'benefactor', 8); bumpRep(s, 'explorer', 5); return 'L’ermite vous bénit'; } },
      leave,
    ];
    case 'mercenary': return [
      { label: `Engager une compagnie (${4 * th} épéistes, ${3 * th} arbalétriers)`, hint: 'Soldats aguerris disponibles aussitôt ; ils mangent comme les autres.', cost: { gold: 260 * th, food: 100 * th }, apply: (s) => { s.army.swordsman = (s.army.swordsman || 0) + 4 * th; s.army.crossbow = (s.army.crossbow || 0) + 3 * th; return `+${4 * th} épéistes, +${3 * th} arbalétriers`; } },
      { label: 'Engager ses éclaireurs (4)', hint: 'Quatre éclaireurs rejoignent votre armée.', cost: { gold: 80 * th }, apply: (s) => { s.army.scout = (s.army.scout || 0) + 4; return '+4 éclaireurs'; } },
      leave,
    ];
    case 'pilgrims': return [
      { label: 'Leur offrir le gîte', hint: 'Bienfaiteur +12 et production +5 % pendant 12 h (leur bénédiction).', cost: { food: 150 * th }, apply: (s, now) => { bumpRep(s, 'benefactor', 12); s.buffs.push({ name: 'Bénédiction des pèlerins', mods: { 'prod.all': 0.05 }, until: now + 12 * H }); return 'Bénédiction : production +5 % (12 h)'; } },
      { label: 'Les escorter jusqu’au col', hint: 'Il faut 15 soldats en ville. Seigneur +8, 2 insignes.', cost: {}, need: (s) => (combatUnitCount(s.army) >= 15 ? null : 'Il faut au moins 15 soldats en ville'), apply: (s) => { bumpRep(s, 'lord', 8); s.meta.insignia = (s.meta.insignia || 0) + 2; return 'Escorte réussie : +2 insignes'; } },
      leave,
    ];
    case 'bountyHunter': {
      const [target] = nearestDanger(state, poi, 1);
      return [
        ...(target ? [{ label: `Accepter la prime sur ${POI_TYPES[target.type].name} (${target.x}, ${target.y})`, hint: `Nettoyez-le dans les 24 h : ${fmt(350 * th)} or et ${fmt(120 * th)} fer.`, cost: {}, apply: (s, now) => {
          const N = npcState(s);
          if (N.bounties.some((b) => b.x === target.x && b.y === target.y)) return 'Une prime court déjà sur ce lieu';
          N.bounties.push({ id: uid('bty'), x: target.x, y: target.y, name: POI_TYPES[target.type].name, at: now, until: now + 24 * H, reward: { gold: 350 * th, iron: 120 * th } });
          return `Prime acceptée : ${POI_TYPES[target.type].name} (${target.x}, ${target.y})`;
        } }] : []),
        { label: 'Acheter ses renseignements', hint: 'Les 3 repaires les plus proches sont espionnés (ennemis connus).', cost: { gold: 90 * th }, apply: (s) => { const t = nearestDanger(s, poi, 3, 20); for (const p of t) p.scouted = true; return `${t.length} lieu(x) espionné(s)`; } },
        leave,
      ];
    }
    case 'smith': {
      const known = recipesState(state).known || {};
      const unknown = Object.keys(PLANS).filter((id) => !known[id]);
      return [
        { label: 'Affûter les armes de l’armée', hint: 'Attaque +8 % pendant 12 h.', cost: { gold: 150 * th, steel: 8 * th }, apply: (s, now) => { s.buffs.push({ name: 'Lames affûtées', mods: { 'combat.atk': 0.08 }, until: now + 12 * H }); return 'Attaque +8 % (12 h)'; } },
        ...(unknown.length ? [{ label: 'Acheter un plan de forge', hint: 'Un plan que vous ne connaissez pas encore.', cost: { gold: 500 * th, steel: 15 * th }, apply: (s, now) => { const id = rng.pick(Object.keys(PLANS).filter((x) => !recipesState(s).known?.[x])); return id ? `Plan appris : ${learnPlan(s, id, 'Forgeron itinérant', now)}` : 'Aucun plan nouveau'; } }] : []),
        leave,
      ];
    }
    case 'cartographer': return [
      { label: 'Acheter ses cartes', hint: 'Deux régions lointaines révélées.', cost: { gold: 300 * th, cloth: 20 }, apply: (s) => { const pts = farFog(s, 2); let n = 0; for (const p of pts) n += reveal(s.world, p.x, p.y, 3).newTiles; return `${n} cases révélées`; } },
      leave,
    ];
    default: return [leave];
  }
}

// Arrivée d'une troupe « Rencontrer » : la décision est créée (le PNJ attend 6 h la réponse)
export function npcMeet(state, poi, now = Date.now()) {
  const n = npcOf(poi);
  if (!n) return null;
  state.pending = state.pending.filter((p) => !(p.kind === 'npc' && p.poiId === poi.id));
  const p = { id: uid('np'), kind: 'npc', poiId: poi.id, x: poi.x, y: poi.y, npc: POI_TYPES[poi.type].npc, t: now, deadline: Math.min(poi.until, now + 6 * H) };
  state.pending.push(p);
  toast(`${n.icon} ${n.name} vous reçoit`, 'event');
  return p;
}

const poiById = (state, id) => Object.values(state.world.pois).find((p) => p.id === id) || null;

export function describeNpc(state, p) {
  const n = NPCS[p.npc];
  const poi = poiById(state, p.poiId);
  const offers = poi ? npcOffers(state, poi) : [];
  return { icon: n.icon, title: `${n.name} (${p.x}, ${p.y})`, text: poi ? n.desc : 'Il est déjà reparti.', choices: offers.map((o) => ({ label: o.label, hint: `${o.hint}${Object.keys(o.cost).length ? ` — coût : ${Object.entries(o.cost).map(([r, v]) => `${fmt(v)} ${RESOURCES[r]?.icon || r}`).join(' ')}` : ''}` })), deadline: p.deadline, def: offers.length - 1, coords: `(${p.x}, ${p.y})` };
}

export function resolveNpc(state, pid, idx, now = Date.now()) {
  const p = state.pending.find((x) => x.id === pid && x.kind === 'npc');
  if (!p) return { ok: false, reason: 'Décision introuvable' };
  const poi = poiById(state, p.poiId);
  if (!poi || poi.until <= now) { state.pending = state.pending.filter((x) => x.id !== pid); return { ok: true, text: 'Il est déjà reparti.' }; }
  const offers = npcOffers(state, poi);
  const o = offers[idx];
  if (!o) return { ok: false, reason: 'Offre inconnue' };
  if (o.need) { const why = o.need(state); if (why) return { ok: false, reason: why }; }
  if (Object.keys(o.cost).length && !pay(state, o.cost)) return { ok: false, reason: 'Ressources insuffisantes', missing: missing(state, o.cost) };
  state.pending = state.pending.filter((x) => x.id !== pid);
  const text = o.apply(state, now);
  // Marché conclu : le personnage repart (une seule affaire par rencontre)
  if (!o.keep) { delete state.world.pois[key(poi.x, poi.y)]; state.stats.npcDeals = (state.stats.npcDeals || 0) + 1; }
  log(state, 'good', `${NPCS[p.npc].icon} ${NPCS[p.npc].name} : ${o.label} — ${text}.`, now);
  return { ok: true, text };
}

// Primes : payées à la victoire sur le lieu visé, avant l'échéance, une seule fois (la prime est retirée)
export function payBounty(state, x, y, now = Date.now()) {
  const N = npcState(state);
  const b = N.bounties.find((v) => v.x === x && v.y === y && v.until > now);
  if (!b) return null;
  N.bounties = N.bounties.filter((v) => v !== b);
  gain(state, b.reward, computeMods(state, now));
  const text = Object.entries(b.reward).map(([r, v]) => `${fmt(v)} ${RESOURCES[r]?.icon || r}`).join(' ');
  log(state, 'good', `🎯 Prime touchée pour ${b.name} : ${text}.`, now);
  toast('🎯 Prime touchée !', 'good');
  return text;
}
function checkBounties(state, now) {
  const N = npcState(state);
  N.bounties = N.bounties.filter((b) => {
    if (b.until > now) return true;
    log(state, 'info', `🎯 La prime sur ${b.name} a expiré.`, now);
    return false;
  });
}
