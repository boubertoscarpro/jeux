// Tableau de bord stratégique : une synthèse courte de la situation réelle du royaume (sans DOM, testable).
// Objectif principal, 3 actions recommandées au plus, pénuries et excédents, menaces et décisions, prochaine
// récompense, annonce de la saison suivante, progression des trois axes de fin de partie.
import { RESOURCES, isCapped } from '../data/resources.js';
import { SEASONS, SEASON_WAR } from '../data/seasons.js';
import { CHALLENGES } from '../data/challenges.js';
import { LEGENDS } from '../data/legendary.js';
import { MOTIONS } from '../data/council.js';
import { computeMods } from './modifiers.js';
import { netRates, storageCap } from './economy.js';
import { objectives } from './campaign.js';
import { adviceList } from './guide.js';
import { upgradeSummary } from './construction.js';
import { calendar } from './chronicle.js';
import { endgameAxes } from './endgame.js';
import { describePending } from './pending.js';

const SEV = { bad: 0, warn: 1, next: 2, info: 3 };

export function strategicSummary(state, now = Date.now()) {
  const mods = computeMods(state, now);
  const net = netRates(state, mods);
  const o = objectives(state, now);
  const next = o.main.find((m) => !m.done) || null;

  // Recommandations : issues du conseiller (fondées sur l'état réel), triées par urgence, sans doublon
  const recs = [];
  const seen = new Set();
  for (const a of [...adviceList(state, now)].sort((x, y) => (SEV[x.sev] ?? 4) - (SEV[y.sev] ?? 4))) {
    const k = a.text.slice(0, 40);
    if (seen.has(k)) continue;
    seen.add(k);
    recs.push({ sev: a.sev, text: a.text, goto: a.goto || null });
    if (recs.length >= 3) break;
  }
  const ups = upgradeSummary(state, mods).count;
  if (recs.length < 3 && ups) recs.push({ sev: 'info', text: `${ups} amélioration(s) réalisable(s) maintenant.`, goto: 'up-list' });

  // Pénuries (épuisement en moins de 6 h) et excédents (stock ≥ 90 % de la capacité)
  const shortages = [], surplus = [];
  for (const [r, v] of Object.entries(net)) {
    if (!RESOURCES[r]) continue;
    if (v < -0.5) { const h = (state.resources[r] || 0) / -v; if (h < 6) shortages.push({ res: r, hours: h, rate: v }); }
  }
  for (const r of Object.keys(RESOURCES)) {
    if (!isCapped(r)) continue;
    const cap = storageCap(state, mods, r);
    if ((state.resources[r] || 0) >= cap * 0.9) surplus.push({ res: r, pct: Math.round(((state.resources[r] || 0) / cap) * 100) });
  }
  shortages.sort((a, b) => a.hours - b.hours);

  // Menaces et décisions en attente
  const alerts = [];
  for (const r of state.raids || []) alerts.push({ sev: 'bad', icon: '⚔️', text: `Raid de ${r.name} en approche`, until: r.arrive, goto: 'army' });
  for (const t of Object.values(state.territories || {})) if (t.threatAt > now) alerts.push({ sev: 'bad', icon: '🚩', text: `Attaque annoncée contre ${t.name}`, until: t.threatAt, goto: 'territories' });
  for (const p of state.pending || []) {
    let d = null; try { d = describePending(state, p); } catch { d = null; }
    alerts.push({ sev: 'warn', icon: d?.icon || '❓', text: `Décision : ${d?.title || 'événement'}`, until: p.deadline, goto: 'decide', pid: p.id });
  }
  if (state.council?.motion && MOTIONS[state.council.motion.id]) alerts.push({ sev: 'warn', icon: '🏛️', text: `Motion au conseil : ${MOTIONS[state.council.motion.id].title}`, until: state.council.motion.deadline, goto: 'council' });
  const la = state.legendary?.active;
  if (la && (la.pending || la.awaitingFate)) alerts.push({ sev: 'warn', icon: LEGENDS[la.id]?.icon || '🗺️', text: la.awaitingFate ? 'Expédition légendaire : décidez du sort de la découverte' : 'Expédition légendaire : une décision vous attend', goto: 'legend' });
  // Réactions des factions (v13) : seulement celles qui demandent une décision
  // Les contre-offensives restent toujours signalées (menace) ; les autres réactions sont informatives et désactivables
  for (const r of (state.factionReports || []).filter((x) => now - x.t < 6 * 3600000 && ['counter', 'embargo', 'aid', 'weakened'].includes(x.kind) && (x.kind === 'counter' || state.meta.factionAlerts !== false)).slice(0, 2)) alerts.push({ sev: r.kind === 'counter' ? 'bad' : r.kind === 'embargo' ? 'warn' : 'good', icon: { counter: '🔥', embargo: '⛔', aid: '🤝', weakened: '🏳️' }[r.kind], text: r.text, goto: r.kind === 'aid' ? 'convoys' : 'factions' });
  if (state.legacy?.offer) alerts.push({ sev: 'good', icon: '👑', text: 'Une tradition dynastique peut être choisie', goto: 'legacy' });
  if (state.famine) alerts.unshift({ sev: 'bad', icon: '🍞', text: 'Famine : plus de nourriture, le moral s’effondre', goto: 'g-prod' });
  // Aucune production de nourriture alors que l'entretien en consomme : alerte dès maintenant, pas 6 h avant la famine
  else if ((net.food || 0) < 0 && !Object.values(state.city.buildings).some((b) => ['farm', 'fishery', 'orchard', 'hunter', 'pasture'].includes(b.type) && b.level > 0)) {
    const h = (state.resources.food || 0) / -(net.food || -1);
    alerts.unshift({ sev: h < 12 ? 'bad' : 'warn', icon: '🌾', text: `Aucune ferme : la nourriture s’épuisera dans ${Math.max(1, Math.round(h))} h`, goto: 'ecoReport' });
  }

  // Saison suivante (annoncée à l'avance)
  const cal = calendar(state, now);
  const nextSeason = SEASONS[(cal.seasonIdx + 1) % 4];
  const season = { now: cal.season, next: nextSeason, inMs: cal.nextAt - now, war: SEASON_WAR[nextSeason.key] };
  if (nextSeason.key === 'winter' && season.inMs < 3600000) alerts.push({ sev: 'warn', icon: '❄️', text: `L’hiver arrive : ${nextSeason.desc} Constituez des réserves de nourriture.`, until: cal.nextAt, goto: 'g-prod' });

  // Prochaine récompense : à réclamer maintenant, sinon la récompense du chapitre, sinon le palier de défi visé
  const claimable = [...o.main, ...o.secondary, ...o.daily].filter((m) => m.done && !m.claimed).length;
  let reward = null;
  if (claimable) reward = { icon: '🎁', text: `${claimable} récompense(s) à réclamer`, goto: 'goals' };
  else if (o.chapter && !o.chapter.complete) reward = { icon: o.chapter.icon || '📖', text: `Récompense du chapitre ${o.chapter.n} : terminer ses missions principales`, goto: 'goals' };
  else if (state.challenges?.active) reward = { icon: CHALLENGES[state.challenges.active.id]?.icon || '🏅', text: `Défi en cours : ${CHALLENGES[state.challenges.active.id]?.name}`, goto: 'challenges' };

  const axes = endgameAxes(state);
  return { objective: next ? { title: next.title, desc: next.desc, cur: next.cur, target: next.target, view: next.view, action: next.action, chapter: o.chapter } : null, recs, shortages: shortages.slice(0, 4), surplus: surplus.slice(0, 4), alerts: alerts.slice(0, 6), reward, season, axes };
}
