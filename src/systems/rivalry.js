// Rivalités persistantes : chaque faction garde la mémoire de vos actes (guerres, trahisons, traités, commerce,
// interventions). Chaque souvenir s'estompe lentement (demi-vie de 3 jours) et s'ajoute à la relation « de base »
// vers laquelle la relation dérive : une trahison pèse donc plusieurs jours, au lieu de quelques heures.
// Le joueur voit pourquoi une faction lui en veut, ce qu'elle cherche, et comment désamorcer le conflit.
import { RIVALS } from '../data/world.js';
import { thLevel } from './city.js';
import { pay, missing } from './economy.js';
import { bumpRep } from './reputation.js';
import { chronicle } from './chronicle.js';
import { log } from './log.js';

export const MEMORY = { halfLifeH: 72, cap: 60, maxEntries: 24, keepAbove: 1, deescalateCooldownH: 12, tradeEveryH: 24 };

const decay = (m, now) => m.v * Math.pow(0.5, Math.max(0, now - m.t) / (MEMORY.halfLifeH * 3600000));

export function remember(state, idx, kind, v, text, now = Date.now()) {
  const f = state.factions?.[idx];
  if (!f || !v) return;
  if (!Array.isArray(f.memory)) f.memory = [];
  f.memory.unshift({ kind, v, t: now, text });
  // Les souvenirs trop estompés sont oubliés ; la liste reste courte
  f.memory = f.memory.filter((m) => Math.abs(decay(m, now)) >= MEMORY.keepAbove).slice(0, MEMORY.maxEntries);
}

export function memoryScore(f, now = Date.now()) {
  const s = (f?.memory || []).reduce((a, m) => a + decay(m, now), 0);
  return Math.max(-MEMORY.cap, Math.min(MEMORY.cap, s));
}

// Souvenirs les plus marquants (affichés : « pourquoi elle vous en veut / vous apprécie »)
export function topMemories(f, now = Date.now(), n = 4) {
  return (f?.memory || []).map((m) => ({ ...m, now: decay(m, now) })).filter((m) => Math.abs(m.now) >= 1)
    .sort((a, b) => Math.abs(b.now) - Math.abs(a.now)).slice(0, n);
}
export function mainGrievance(f, now = Date.now()) {
  const g = topMemories(f, now, 10).filter((m) => m.now < 0)[0];
  return g ? g.text : null;
}

// Statut durable : rivale héréditaire, partenaire privilégié, allié de confiance
export function rivalryStatus(f, now = Date.now()) {
  const m = memoryScore(f, now);
  if (m <= -30 || (f.ancestral === 'grudge' && m <= -10)) return { key: 'rival', name: 'Rivale déclarée', icon: '⚔️' };
  if (f.stance === 'alliance' && m >= 25) return { key: 'ally', name: 'Allié de confiance', icon: '🛡️' };
  if ((f.stance === 'trade' || f.stance === 'alliance') && m >= 15) return { key: 'partner', name: 'Partenaire privilégié', icon: '⚖️' };
  return null;
}
// Effets modestes des relations privilégiées
export function rivalryMods(state, now = Date.now()) {
  const m = {};
  for (const f of state.factions || []) {
    const st = rivalryStatus(f, now)?.key;
    if (st === 'partner') m['caravan.gain'] = (m['caravan.gain'] || 0) + 0.03;
    if (st === 'ally') { m['caravan.gain'] = (m['caravan.gain'] || 0) + 0.03; m['city.def'] = (m['city.def'] || 0) + 0.03; }
  }
  return m;
}

// Ambition : ce que la faction cherche, selon sa personnalité
export const AMBITIONS = {
  aggressive: { want: 'territory', text: 'Étendre ses terres : vos avant-postes proches de ses frontières l’irritent.' },
  military: { want: 'territory', text: 'Imposer sa force : elle respecte une armée puissante et déteste reculer.' },
  commercial: { want: 'trade', text: 'Commercer à bon prix : pactes, caravanes et concessions la rapprochent.' },
  technological: { want: 'knowledge', text: 'Le savoir : cristaux et découvertes l’intéressent plus que l’or.' },
  isolationist: { want: 'peace', text: 'Être laissée en paix : aucune nouvelle installation près de ses terres.' },
};
export const ambitionOf = (f) => AMBITIONS[RIVALS[f.idx]?.personality] || AMBITIONS.commercial;

// Avant-poste du joueur le plus proche du territoire de la faction (pour l'option « céder un avant-poste »)
export function nearestOutpostTo(state, f) {
  let best = null;
  const terr = (f.territory || []).map((k) => k.split(',').map(Number));
  if (!terr.length) return null;
  for (const [k, t] of Object.entries(state.territories || {})) {
    const d = Math.min(...terr.map(([x, y]) => Math.hypot(x - t.x, y - t.y)));
    if (!best || d < best.d) best = { k, t, d };
  }
  return best && best.d <= 8 ? best : null;
}

// Options de désescalade proposées pour une faction (coût, effet) ; une action toutes les 12 h par faction
export function deescalationOptions(state, f, now = Date.now()) {
  const th = Math.max(1, thLevel(state));
  const amb = ambitionOf(f).want;
  const out = [
    { id: 'reparations', label: 'Verser des réparations', cost: { gold: 250 * th }, gain: 15, desc: 'Un dédommagement en or apaise les griefs.' },
    { id: 'apology', label: 'Présenter des excuses publiques', cost: {}, gain: 10, rep: { warrior: -8, diplomat: 6 }, desc: 'Coûte du prestige guerrier, mais touche les cœurs.' },
  ];
  if (amb === 'trade') out.push({ id: 'concession', label: 'Accorder des concessions commerciales', cost: { gold: 400 * th }, gain: 22, desc: 'Répond à son ambition : commercer.' });
  if (amb === 'knowledge') out.push({ id: 'knowledge', label: 'Offrir des cristaux et des traités savants', cost: { crystals: 5 }, gain: 20, desc: 'Répond à son ambition : le savoir.' });
  if (amb === 'territory') { const o = nearestOutpostTo(state, f); if (o) out.push({ id: 'cede', label: `Céder l’avant-poste « ${o.t.name} »`, cost: {}, gain: 28, outpost: o.k, desc: 'Répond à son ambition : ses frontières. L’avant-poste est perdu.' }); }
  if (amb === 'peace') out.push({ id: 'pledge', label: 'Promettre de ne pas s’étendre vers elle (48 h)', cost: {}, gain: 15, desc: 'Toute nouvelle installation à moins de 10 cases de ses terres romprait la promesse (grief −30).' });
  const ready = !(f.deescalatedAt > now - MEMORY.deescalateCooldownH * 3600000);
  return out.map((o) => ({ ...o, ready, missing: missing(state, o.cost) }));
}

export function deescalate(state, idx, id, now = Date.now()) {
  const f = state.factions?.[idx];
  if (!f) return { ok: false, reason: 'Faction inconnue' };
  const o = deescalationOptions(state, f, now).find((x) => x.id === id);
  if (!o) return { ok: false, reason: 'Option indisponible' };
  if (!o.ready) return { ok: false, reason: 'Un geste a déjà été fait récemment (12 h entre deux)' };
  if (Object.keys(o.cost).length && !pay(state, o.cost)) return { ok: false, reason: 'Ressources insuffisantes', missing: missing(state, o.cost) };
  if (o.rep) for (const [a, n] of Object.entries(o.rep)) bumpRep(state, a, n);
  if (o.id === 'cede') {
    const t = state.territories[o.outpost];
    if (t) { for (const [u, n] of Object.entries(t.garrison || {})) state.army[u] = (state.army[u] || 0) + n; delete state.territories[o.outpost]; f.territory.push(o.outpost); }
  }
  if (o.id === 'pledge') f.pledgeUntil = now + 48 * 3600000;
  f.deescalatedAt = now;
  remember(state, idx, 'deescalate', o.gain, o.label, now);
  f.relation = Math.min(100, f.relation + Math.round(o.gain / 2));
  chronicle(state, `${state.meta.kingdomName} tend la main à ${RIVALS[idx]?.name} : ${o.label.toLowerCase()}.`, now);
  return { ok: true, text: `${RIVALS[idx]?.name} s’en souviendra (+${o.gain}).` };
}

// Tick (toutes les 10 min, avec les factions) : commerce durable, promesses rompues
export function rivalryTick(state, now = Date.now()) {
  for (const f of state.factions || []) {
    if ((f.stance === 'trade' || f.stance === 'alliance') && !(f.tradeMemAt > now - MEMORY.tradeEveryH * 3600000)) {
      if (f.tradeMemAt) remember(state, f.idx, 'trade', 4, 'Des années de commerce prospère', now);
      f.tradeMemAt = now;
    }
    if (f.pledgeUntil > now) {
      const terr = (f.territory || []).map((k) => k.split(',').map(Number));
      const broken = Object.values(state.territories || {}).some((t) => t.since > (f.pledgeUntil - 48 * 3600000) && terr.some(([x, y]) => Math.hypot(x - t.x, y - t.y) < 10));
      if (broken) {
        f.pledgeUntil = 0;
        remember(state, f.idx, 'betrayal', -30, 'Promesse de non-ingérence rompue', now);
        log(state, 'bad', `⚠️ ${RIVALS[f.idx]?.name} vous accuse d’avoir rompu votre promesse.`, now);
      }
    }
  }
}
