// Monde évolutif : les régions gardent la trace des événements et des décisions, visiblement sur la carte et avec
// des effets concrets. Volontairement simple (aucune simulation écologique) :
//  - Terres ravagées (guerre, pillage) : production des avant-postes −25 %, régénération des sites −40 % autour,
//    pendant 36 à 48 h, puis la région se relève ;
//  - Hameau : un avant-poste stable (≥ 70) attire des habitants ; un hameau grandit (3 niveaux, +5 % de production
//    et d'impôts par niveau) et décline en cas de révolte ;
//  - Coupes rases : un bois surexploité (épuisement ≥ 1,5) se dégrade ; laissé en repos, il repousse et devient une
//    « forêt restaurée » (+25 % de régénération pendant 24 h) ;
//  - Route en ruine : une route impayée pendant 24 h perd un niveau ; la reconstruire efface la ruine ;
//  - Cité marchande : une cité libre souvent visitée par vos caravanes gagne en importance (3 rangs, +4 % de prix
//    par rang).
// Stockage : state.world.marks = { 'x,y': { kind, since, until?, level?, note? } } ; hameaux sur l'avant-poste
// (t.hamlet, t.calmSince) ; rang des cités sur la cité (poi.rank).
import { POI_TYPES } from '../data/world.js';
import { log } from './log.js';
import { chronicle } from './chronicle.js';
import { stabOf } from './stability.js';
import { outpostLabel } from './identity.js';

const H = 3600000;
export const MARKS = {
  scorched: { name: 'Terres ravagées', icon: '🔥', desc: 'Champs brûlés et villages vidés par la guerre : avant-postes −25 % de production, sites voisins −40 % de régénération.' },
  overcut: { name: 'Coupes rases', icon: '🪵', desc: 'Bois surexploité : il se régénère à peine. Laissez-le reposer.' },
  regrown: { name: 'Forêt restaurée', icon: '🌳', desc: 'Le bois a repoussé après le repos : régénération +25 % pendant 24 h.' },
  fortified: { name: 'Forteresse renforcée', icon: '🛡️', desc: 'Après des attaques répétées, la faction a renforcé sa capitale : garnison +20 %.' },
  ruinedRoad: { name: 'Route en ruine', icon: '🚧', desc: 'Faute d’entretien, la route a perdu un niveau. Reconstruisez-la (Logistique).' },
};
export const HAMLET_MAX = 3, HAMLET_HOURS = 24, HAMLET_STAB = 70;
export const TOWN_RANKS = [0, 5, 15, 40]; // voyages de caravanes vers la cité pour atteindre les rangs 1, 2, 3
const k = (x, y) => `${x},${y}`;

export const marksOf = (state) => (state.world.marks ||= {});
export function addMark(state, x, y, kind, now, hours = null, extra = {}) {
  const m = marksOf(state);
  m[k(x, y)] = { kind, since: now, until: hours ? now + hours * H : null, ...extra };
  return m[k(x, y)];
}
export const markAt = (state, x, y) => state.world?.marks?.[k(x, y)] || null;
export function marksNear(state, x, y, kind, r = 2, now = Date.now()) {
  const out = [];
  for (const [kk, m] of Object.entries(state.world?.marks || {})) {
    if (m.kind !== kind || (m.until && m.until <= now)) continue;
    const [mx, my] = kk.split(',').map(Number);
    if (Math.max(Math.abs(mx - x), Math.abs(my - y)) <= r) out.push(m);
  }
  return out;
}

// La guerre laisse des cicatrices (pillage d'avant-poste, capitale rivale mise à sac, opérations de campagne)
export function scar(state, x, y, now, hours = 48, note = '') {
  addMark(state, x, y, 'scorched', now, hours, { note });
}

// Multiplicateur de production d'un avant-poste selon sa région (ravages, hameau) et explication
export function regionEffect(state, t, now = Date.now()) {
  let mult = 1;
  const reasons = [];
  if (marksNear(state, t.x, t.y, 'scorched', 1, now).length) { mult *= 0.75; reasons.push('Terres ravagées par la guerre : production −25 %'); }
  if (t.hamlet) { mult *= 1 + 0.05 * t.hamlet; reasons.push(`Hameau de niveau ${t.hamlet} : production et impôts +${5 * t.hamlet} %`); }
  return { mult, reasons };
}

// Régénération des sites de récolte selon la région
export function regenMult(state, poi, now = Date.now()) {
  let m = 1;
  if (marksNear(state, poi.x, poi.y, 'scorched', 2, now).length) m *= 0.6;
  const own = markAt(state, poi.x, poi.y);
  if (own?.kind === 'regrown' && !(own.until <= now)) m *= 1.25;
  return m;
}

// Prix payé par une cité selon son importance
export const townRankMult = (town) => 1 + 0.04 * (town?.rank || 0);

// Tic du monde (chaque minute de jeu)
export function worldMarksTick(state, now) {
  const w = state.world;
  if (!w) return;
  const M = marksOf(state);
  // Fin des marques temporaires
  for (const [kk, m] of Object.entries(M)) {
    if (m.until && m.until <= now) {
      delete M[kk];
      if (m.kind === 'scorched') log(state, 'info', `🌱 Les terres ravagées autour de (${kk}) se relèvent : les paysans reviennent.`, now);
    }
  }
  // Bois surexploités → coupes rases → forêt restaurée
  for (const p of Object.values(w.pois)) {
    if (POI_TYPES[p.type]?.kind !== 'gather' || !['wood', 'ancientWood'].includes(POI_TYPES[p.type].res)) continue;
    const m = M[k(p.x, p.y)];
    if ((p.exhaust || 0) >= 1.5 && !m) { addMark(state, p.x, p.y, 'overcut', now); log(state, 'bad', `🪵 ${POI_TYPES[p.type].name} (${p.x}, ${p.y}) est surexploité : coupes rases, il se régénère à peine.`, now); }
    else if (m?.kind === 'overcut' && (p.exhaust || 0) < 0.3) { addMark(state, p.x, p.y, 'regrown', now, 24); log(state, 'good', `🌳 Laissé au repos, le ${POI_TYPES[p.type].name.toLowerCase()} (${p.x}, ${p.y}) a repoussé : forêt restaurée.`, now); }
  }
  // Hameaux autour des avant-postes stables
  for (const t of Object.values(state.territories || {})) {
    const calm = !t.revolt && stabOf(t) >= HAMLET_STAB && !(t.pillagedUntil > now);
    if (!calm) {
      t.calmSince = null;
      if (t.revolt && t.hamlet && !(t.hamletLossAt > now - 12 * H)) { t.hamlet--; t.hamletLossAt = now; log(state, 'bad', `🏚️ La révolte vide le hameau de ${outpostLabel(t)} (niveau ${t.hamlet}).`, now); }
      continue;
    }
    t.calmSince ||= now;
    const lvl = t.hamlet || 0;
    if (lvl < HAMLET_MAX && now - t.calmSince >= HAMLET_HOURS * (lvl + 1) * H) {
      t.hamlet = lvl + 1; t.calmSince = now;
      log(state, 'good', `🏡 Un hameau ${lvl ? 'grandit' : 'naît'} près de ${outpostLabel(t)} (niveau ${t.hamlet}) : production et impôts +${5 * t.hamlet} %.`, now);
      if (t.hamlet === HAMLET_MAX) chronicle(state, `Le hameau de ${outpostLabel(t)} devient un bourg prospère.`, now);
    }
  }
  // Routes impayées : un niveau perdu après 24 h ; reconstruites, la ruine disparaît
  for (const t of Object.values(state.territories || {})) {
    const ruin = M[k(t.x, t.y)]?.kind === 'ruinedRoad' ? M[k(t.x, t.y)] : null;
    if (ruin && (t.road || 0) >= ruin.level) { delete M[k(t.x, t.y)]; log(state, 'good', `🛣️ La route de ${outpostLabel(t)} est reconstruite.`, now); }
    if (!t.roadUnpaid) { t.unpaidSince = null; continue; }
    t.unpaidSince ||= now;
    if ((t.road || 0) > 0 && now - t.unpaidSince >= 24 * H) {
      const before = t.road;
      t.road = before - 1; t.unpaidSince = now;
      if (!M[k(t.x, t.y)]) addMark(state, t.x, t.y, 'ruinedRoad', now, null, { level: before });
      log(state, 'bad', `🚧 Faute d’entretien, la route de ${outpostLabel(t)} se dégrade (niveau ${t.road}).`, now);
    }
  }
  // Cités libres : importance selon vos voyages de caravanes
  for (const p of Object.values(w.pois)) {
    if (p.type !== 'town') continue;
    const trips = state.routes?.[k(p.x, p.y)]?.trips || 0;
    const rank = TOWN_RANKS.filter((n) => trips >= n).length - 1;
    if (rank > (p.rank || 0)) {
      p.rank = rank;
      log(state, 'good', `🏘️ ${p.name || 'Une cité libre'} prospère grâce à vos caravanes : cité marchande de rang ${rank} (prix +${4 * rank} %).`, now);
      if (rank === 3) chronicle(state, `${p.name || 'Une cité libre'} devient un grand comptoir des Terres Brisées.`, now);
    }
  }
}
