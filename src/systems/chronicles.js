// Chroniques du monde (data/chronicles.js) : choix du contexte d'après l'état réel du monde, et effets sur le monde.
// Le moteur des sagas (systems/sagas.js) les déroule ; ce module ne fait que décider « où » et « avec qui ».
import { RIVALS, POI_TYPES } from '../data/world.js';
import { rng } from '../core/rng.js';
import { isRevealed, findFreeTile, spawnPoi, key } from './world.js';
import { remember, memoryScore, mainGrievance, nearestOutpostTo } from './rivalry.js';
import { chronicle } from './chronicle.js';
import { log } from './log.js';

const median = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : 0; };
const revealedTowns = (state) => Object.values(state.world?.pois || {}).filter((p) => p.type === 'town' && isRevealed(state.world, p.x, p.y));
const anyTown = (state) => { const t = revealedTowns(state); const all = t.length ? t : Object.values(state.world?.pois || {}).filter((p) => p.type === 'town'); return all.length ? rng.pick(all) : null; };
const townCtx = (t) => (t ? { town: key(t.x, t.y), townName: t.name } : {});

// Chaque sélecteur renvoie un contexte cohérent avec le monde, ou null si la situation n'existe pas
export const PICKERS = {
  overreach(state) {
    const fs = state.factions || [];
    if (fs.length < 3) return null;
    const med = median(fs.map((f) => f.territory.length));
    const strong = [...fs].sort((a, b) => b.territory.length - a.territory.length)[0];
    if (!strong || strong.territory.length < Math.max(12, med * 1.3)) return null;
    const weak = fs.filter((f) => f !== strong).sort((a, b) => a.army - b.army)[0];
    return { faction: strong.idx, faction2: weak.idx };
  },
  factionWar(state) {
    const f = (state.factions || []).find((x) => x.wars.length);
    return f ? { faction: f.idx, faction2: f.wars[0] } : null;
  },
  allianceStrain(state, now) {
    const f = (state.factions || []).filter((x) => (x.stance === 'trade' || x.stance === 'alliance')).sort((a, b) => a.relation - b.relation)[0];
    if (!f || (f.relation > 45 && memoryScore(f, now) > 10)) return null;
    return { faction: f.idx };
  },
  grudgeUltimatum(state, now) {
    const f = (state.factions || []).filter((x) => x.stance !== 'war' && memoryScore(x, now) <= -30).sort((a, b) => memoryScore(a, now) - memoryScore(b, now))[0];
    return f ? { faction: f.idx, grievance: mainGrievance(f, now) || 'vos affronts' } : null;
  },
  banditRoad(state) {
    const t = revealedTowns(state);
    if (!t.length) return null;
    return townCtx(rng.pick(t));
  },
  ruinRush(state) {
    const fs = (state.factions || []).filter((f) => f.stance !== 'alliance');
    if (fs.length < 2) return null;
    const a = rng.pick(fs); const b = rng.pick(fs.filter((f) => f !== a));
    return { faction: a.idx, faction2: b.idx };
  },
};

// Contexte par défaut des sagas classiques : cité connue de préférence, factions qui ne contredisent pas la diplomatie
export function defaultContext(state, sagaId) {
  const fs = state.factions || [];
  const notWar = fs.filter((f) => f.stance !== 'war');
  const f1 = (sagaId === 'treaty' ? (notWar.length ? rng.pick(notWar) : null) : rng.pick(fs)) || fs[0];
  const others = fs.filter((f) => f !== f1);
  const atWarWithF1 = others.filter((f) => f1?.wars.includes(f.idx));
  const f2 = (atWarWithF1.length ? rng.pick(atWarWithF1) : rng.pick(others)) || f1;
  return { ...townCtx(anyTown(state)), faction: f1?.idx ?? 0, faction2: f2?.idx ?? 1 };
}

// Effets d'une chronique sur le monde et sur la mémoire des factions
export function applyChronicleFx(state, p, fx, now = Date.now()) {
  const parts = [];
  const w = fx.world || {};
  const F = state.factions?.[p.faction], F2 = state.factions?.[p.faction2];
  const name = (f) => RIVALS[f?.idx]?.name || 'la faction';
  if (w.armyF && F) { F.army = Math.max(0.5, F.army * (1 + w.armyF)); parts.push(`armée de ${name(F)} ${w.armyF > 0 ? 'renforcée' : 'affaiblie'}`); }
  if (w.armyF2 && F2) { F2.army = Math.max(0.5, F2.army * (1 + w.armyF2)); parts.push(`armée de ${name(F2)} ${w.armyF2 > 0 ? 'renforcée' : 'affaiblie'}`); }
  const transfer = (from, to, n) => {
    if (!from || !to) return 0;
    const k = Math.min(n, Math.max(0, from.territory.length - 9));
    const moved = k > 0 ? from.territory.splice(-k) : [];
    to.territory.push(...moved);
    return moved.length;
  };
  if (w.territoryToF2) { const n = transfer(F, F2, w.territoryToF2); if (n) parts.push(`${name(F2)} prend ${n} région(s) à ${name(F)}`); }
  if (w.territoryToF) { const n = transfer(F2, F, w.territoryToF); if (n) parts.push(`${name(F)} prend ${n} région(s) à ${name(F2)}`); }
  if (w.warEnd && F && F2) { F.wars = F.wars.filter((x) => x !== F2.idx); F2.wars = F2.wars.filter((x) => x !== F.idx); parts.push(`paix entre ${name(F)} et ${name(F2)}`); chronicle(state, `La guerre entre ${name(F)} et ${name(F2)} prend fin.`, now); }
  if (w.breakPact && F && (F.stance === 'trade' || F.stance === 'alliance')) { F.stance = 'neutral'; F.treatyAt = now; parts.push(`le pacte avec ${name(F)} est rompu`); chronicle(state, `${name(F)} rompt son pacte avec ${state.meta.kingdomName}.`, now); }
  if (w.declareWar && F && F.stance !== 'war') { F.stance = 'war'; F.treatyAt = now; F.relation = Math.min(F.relation, -50); parts.push(`${name(F)} vous déclare la guerre`); chronicle(state, `${name(F)} déclare la guerre à ${state.meta.kingdomName}.`, now); }
  if (w.cedeOutpost && F) {
    const o = nearestOutpostTo(state, F);
    if (o) { for (const [u, n] of Object.entries(o.t.garrison || {})) state.army[u] = (state.army[u] || 0) + n; delete state.territories[o.k]; F.territory.push(o.k); parts.push(`avant-poste « ${o.t.name} » cédé`); }
    else parts.push('aucun avant-poste à céder : un tribut symbolique est versé');
  }
  if (w.spawnBandits && p.town && state.world) {
    const [tx, ty] = p.town.split(',').map(Number), c = state.world.capital;
    const spot = findFreeTile(state.world, Math.round((tx + c.x) / 2), Math.round((ty + c.y) / 2), ['plain', 'forest', 'hills'], 4);
    if (spot && POI_TYPES.banditCamp) { spawnPoi(state.world, 'banditCamp', spot.x, spot.y, { danger: 3 }); parts.push(`camp de bandits en (${spot.x}, ${spot.y})`); log(state, 'bad', `⛺ Un camp de bandits s’installe en (${spot.x}, ${spot.y}).`, now); }
  }
  if (fx.memory) {
    const title = p.title || 'une chronique';
    if (fx.memory.f) remember(state, p.faction, 'chronicle', fx.memory.f, `Votre choix : ${title}`, now);
    if (fx.memory.f2) remember(state, p.faction2, 'chronicle', fx.memory.f2, `Votre choix : ${title}`, now);
  }
  if (w.swap) { const t = p.faction; p.faction = p.faction2; p.faction2 = t; if (state.sagas?.active) { state.sagas.active.faction = p.faction; state.sagas.active.faction2 = p.faction2; } }
  return parts.join(', ');
}
