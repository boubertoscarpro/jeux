// Conseiller du tableau de bord : recommandations déterministes, calculées depuis l'état réel, priorisées,
// regroupées, sans doublon. Le joueur peut les reporter (4 h), les ignorer, ou réduire / couper le conseiller.
import { TECHS } from '../data/techs.js';
import { RESOURCES } from '../data/resources.js';
import { KINGDOM_FOCUS } from '../data/campaign.js';
import { analyze } from './advisor.js';
import { levelOf, thLevel } from './city.js';
import { combatUnitCount } from './army.js';
import { techStatus } from './research.js';
import { campaignState, objectives } from './campaign.js';

// Écrans cibles des recommandations de l'analyse (clé courte → écran réel)
export const ADVICE_GOTO = { production: 'g-prod', city: 'city', market: 'market', trade: 'convoys', army: 'army', world: 'factions', research: 'research', territories: 'territories' };
const SEV = { bad: 0, warn: 1, next: 2, info: 3, good: 4 };
export const SNOOZE_MS = 4 * 3600000;
export const ADVICE_LEVELS = { full: 'Complet', reduced: 'Réduit (urgences et prochaine étape)', off: 'Désactivé' };

// Identifiant stable : même conseil = même id, même si les chiffres changent
const stableId = (r) => r.id || `${r.goto || '-'}:${r.text.replace(/<[^>]+>/g, '').replace(/[\d\s.,%()+−\-:]+/g, '').slice(0, 48)}`;

export function adviceList(state, now = Date.now()) {
  const level = state.meta.advice || 'full';
  if (level === 'off') return [];
  const c = campaignState(state);
  const out = [];
  const a = analyze(state, now);
  for (const r of a.recs) out.push({ ...r, goto: r.goto ? ADVICE_GOTO[r.goto] || r.goto : null });

  // Prochaine étape du parcours guidé
  const o = objectives(state, now);
  const next = o.main.find((m) => !m.done) || null;
  const ready = [...o.main, ...o.secondary].filter((m) => m.done && !m.claimed);
  if (ready.length) out.push({ id: 'claim', sev: 'next', text: `${ready.length} mission(s) accomplie(s) : réclamez la récompense dans Objectifs.`, goto: 'goals' });
  if (o.chapter.complete && !o.chapter.rewardClaimed) out.push({ id: 'chapter', sev: 'next', text: `Chapitre ${o.chapter.n} terminé : réclamez sa récompense.`, goto: 'goals' });
  if (next) out.push({ id: 'next:' + next.id, sev: 'next', text: `Prochaine étape — ${next.title} : ${next.desc}`, goto: next.view || 'goals', action: next.action });

  // Économie stable : orienter vers la spécialisation
  const th = thLevel(state);
  if (!a.forecasts.some((f) => f.hours < 12) && a.foodRatio >= 1.1 && th >= 3) {
    const focus = KINGDOM_FOCUS[state.kingdom?.type];
    const lib = levelOf(state, 'library');
    const tech = focus && lib && !state.queues.research.length && Object.keys(TECHS).find((id) => TECHS[id].branch === focus && techStatus(state, id).status === 'available');
    if (tech) out.push({ id: 'focus:' + tech, sev: 'info', text: `Économie stable : c’est le moment d’investir. Technologie conseillée pour votre spécialisation : ${TECHS[tech].name} (${TECHS[tech].desc}).`, goto: 'research' });
  }
  // Armée faible face aux raids (à partir de l'hôtel de ville 4, quand les raids commencent)
  const units = combatUnitCount(state.army);
  if (th >= 4 && units < th * 8 && !(state.factions || []).every((f) => ['alliance', 'trade', 'tributary', 'truce'].includes(f.stance))) {
    out.push({ id: 'weak-army', sev: 'warn', text: `Votre armée en ville (${units} soldats) est faible pour un hôtel de ville ${th} : les raids sont possibles. Formez des troupes, montez la muraille, ou signez des traités.`, goto: 'army' });
  }
  // Expédition revenue
  const back = (state.expeditions || []).find((t) => t.status === 'idle' && t.history?.[0] && now - t.history[0].t < 2 * 3600000 && !t.repeat);
  if (back) out.push({ id: 'exp-back:' + back.history[0].t, sev: 'info', text: `L’expédition « ${back.name} » est rentrée : consultez son butin et relancez-la.`, goto: 'expeditions' });
  // Ressources rares inutilisées
  if (levelOf(state, 'forge') && ((state.resources.crystals || 0) >= 6 || (state.resources.rareOre || 0) >= 9) && !state.queues.craft.some((q) => q.kind === 'item')) {
    const r = (state.resources.rareOre || 0) >= 9 ? 'rareOre' : 'crystals';
    out.push({ id: 'rare:' + r, sev: 'info', text: `Vous stockez ${Math.floor(state.resources[r])} ${RESOURCES[r].icon} ${RESOURCES[r].name} : utilisez-les comme catalyseur à la Forge pour un meilleur équipement.`, goto: 'craft' });
  }

  // Tri, dédoublonnage, filtres (ignoré / reporté) et niveau
  const seen = new Set();
  let list = out.map((r) => ({ ...r, id: stableId(r) }))
    .filter((r) => { if (seen.has(r.id)) return false; seen.add(r.id); return true; })
    .filter((r) => !c.dismissed[r.id] && !((c.snoozed[r.id] || 0) > now))
    .sort((x, y) => SEV[x.sev] - SEV[y.sev]);
  if (level === 'reduced') list = list.filter((r) => r.sev === 'bad' || r.sev === 'warn' || r.sev === 'next');
  // Regroupement : au plus 2 conseils par écran cible
  const per = {};
  list = list.filter((r) => { if (r.sev === 'next') return true; const g = r.goto || '-'; per[g] = (per[g] || 0) + 1; return per[g] <= 2; });
  return list;
}

export function snoozeAdvice(state, id, now = Date.now()) {
  campaignState(state).snoozed[id] = now + SNOOZE_MS;
  return { ok: true };
}
export function dismissAdvice(state, id, now = Date.now()) {
  // Les urgences (pénurie, bâtiment endommagé…) ne peuvent qu'être reportées
  campaignState(state).dismissed[id] = now;
  return { ok: true };
}
export function setAdviceLevel(state, level) {
  if (!ADVICE_LEVELS[level]) return { ok: false };
  state.meta.advice = level;
  return { ok: true };
}
// Nettoyage : les reports expirés sont retirés pour garder la sauvegarde légère
export function pruneAdvice(state, now = Date.now()) {
  const c = campaignState(state);
  for (const [k, t] of Object.entries(c.snoozed)) if (t <= now) delete c.snoozed[k];
  const keys = Object.keys(c.dismissed);
  if (keys.length > 200) for (const k of keys.sort((a, b) => c.dismissed[a] - c.dismissed[b]).slice(0, keys.length - 200)) delete c.dismissed[k];
}
