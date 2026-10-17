// Stabilité des provinces (avant-postes) : chaque province a une satisfaction (0 à 100) qui tend vers une valeur cible
// calculée à partir de facteurs visibles : garnison, entretien, nourriture du royaume, impôts, éloignement, pillages,
// défenses réussies, priorité royale, grands projets, festivités. Les conséquences sont progressives et annoncées :
// prospère (+10 %), stable, mécontente (−20 %), en révolte (−50 %) ; une province en révolte ouverte ne produit plus.
import { GARRISON_PER_LEVEL } from '../data/territories.js';
import { distCap } from './world.js';
import { activePolicy } from './policy.js';
import { pay, missing } from './economy.js';
import { log } from './log.js';
import { councilStab } from './council.js';
import { supplyStab } from './logistics.js';
import { key } from './world.js';
import { borderOf } from './hazards.js';
import { crisisStab } from './crises.js';

export const STAB_DEFAULT = 70;
export const STAB_DRIFT = 5;              // points par heure vers la cible
export const TAXES = {
  low: { name: 'Impôts légers', icon: '🪶', stab: 12, gold: 0, desc: 'Aucun impôt prélevé : la population vous en sait gré.' },
  normal: { name: 'Impôts ordinaires', icon: '⚖️', stab: 0, gold: 6, desc: '6 or par heure et par niveau.' },
  high: { name: 'Impôts lourds', icon: '💰', stab: -15, gold: 15, desc: '15 or par heure et par niveau, mais la population gronde.' },
};
export const FESTIVAL = { hours: 12, stab: 15, cost: (lvl) => ({ food: 300 * lvl, gold: 150 * lvl }) };
export const STAB_LEVELS = [
  { min: 80, key: 'prosperous', name: 'Prospère', icon: '🌟', mult: 1.1 },
  { min: 50, key: 'stable', name: 'Stable', icon: '🙂', mult: 1 },
  { min: 30, key: 'unhappy', name: 'Mécontente', icon: '😠', mult: 0.8 },
  { min: 0, key: 'unrest', name: 'En révolte', icon: '🔥', mult: 0.5 },
];

export const stabOf = (t) => (Number.isFinite(t?.stability) ? Math.max(0, Math.min(100, t.stability)) : STAB_DEFAULT);
export const taxOf = (t) => (TAXES[t?.tax] ? t.tax : 'normal');
export const stabLevel = (v) => STAB_LEVELS.find((l) => v >= l.min) || STAB_LEVELS[STAB_LEVELS.length - 1];

// Facteurs détaillés (affichés au joueur) → cible
export function stabilityFactors(state, t, now = Date.now(), route = null) {
  const f = [['Base', 60]];
  const g = Object.values(t.garrison || {}).reduce((a, b) => a + b, 0);
  f.push(g >= GARRISON_PER_LEVEL * (t.level || 1) ? ['Garnison complète : sécurité', 10] : ['Garnison insuffisante : insécurité', -15]);
  if (t.unpaid) f.push(['Entretien impayé', -20]);
  f.push(state.famine ? ['Famine dans le royaume', -20] : ['Royaume nourri', 5]);
  const tx = TAXES[taxOf(t)];
  if (tx.stab) f.push([tx.name, tx.stab]);
  const d = state.world ? distCap(state.world, t.x, t.y) : 0;
  if (d <= 6) f.push(['Proche du château (routes sûres)', 5]);
  else if (d > 12) f.push(['Province éloignée', -5]);
  if (state.projects?.done?.tradeRoad) f.push(['Route commerciale royale', 5]);
  if (t.pillagedUntil > now) f.push(['Pillée récemment', -15]);
  if (t.defended) f.push([`${t.defended} attaque(s) repoussée(s)`, Math.min(10, t.defended * 2)]);
  const pol = activePolicy(state, now);
  if (pol === 'prosperity') f.push(['Priorité royale : Prospérité', 5]);
  if (pol === 'defense') f.push(['Priorité royale : Défense', 3]);
  if (t.festUntil > now) f.push(['Festivités royales', FESTIVAL.stab]);
  if (t.concededUntil > now) f.push(['Concessions accordées', 10]);
  const sup = state.world ? supplyStab(state, key(t.x, t.y), t, now, route) : null;
  if (sup) f.push(sup);
  const cs = councilStab(state);
  if (cs) f.push([cs > 0 ? 'Assemblée des villages loyale' : 'Assemblée des villages hostile', cs]);
  // v14 : frontières contestées ou amies, crises en cours
  const border = state.factions ? borderOf(state, t) : null;
  if (border?.stab) f.push([border.label, border.stab]);
  const cr = crisisStab(state);
  if (cr) f.push(cr);
  return f;
}
export const stabilityTarget = (state, t, now = Date.now(), route = null) => Math.max(0, Math.min(100, stabilityFactors(state, t, now, route).reduce((a, [, v]) => a + v, 0)));

// Multiplicateur de production (utilisé par outpostStatus)
export function stabilityEffect(t) {
  if (t.revolt) return { mult: 0, reason: 'Révolte ouverte : la province ne produit plus (stabilité ≥ 45 pour la ramener au calme)' };
  const v = stabOf(t), l = stabLevel(v);
  if (l.mult === 1) return { mult: 1, reason: null };
  return { mult: l.mult, reason: `${l.icon} ${l.name} (stabilité ${Math.round(v)}) : production ${l.mult > 1 ? '+' : '−'}${Math.round(Math.abs(l.mult - 1) * 100)} %` };
}

// Tick : dérive vers la cible, impôts, fin de révolte. Appelé par territoryTick.
export function stabilityTick(state, t, h, now = Date.now(), route = null) {
  const cur = stabOf(t), target = stabilityTarget(state, t, now, route);
  const step = STAB_DRIFT * h;
  t.stability = cur < target ? Math.min(target, cur + step) : Math.max(target, cur - step);
  if (t.revolt && t.stability >= 45) { t.revolt = false; log(state, 'good', `🕊️ Le calme revient dans la province « ${t.name} ».`, now); }
  // Impôts : prélevés seulement si la province fonctionne
  const gold = TAXES[taxOf(t)].gold * (t.level || 1) * h * (1 + 0.05 * (t.hamlet || 0)); // un hameau paie aussi l'impôt
  if (gold > 0 && !t.revolt && !(t.pillagedUntil > now)) { state.resources.gold = (state.resources.gold || 0) + gold; state.stats.taxes = (state.stats.taxes || 0) + gold; }
}

export function setTax(state, k, tax) {
  const t = state.territories[k];
  if (!t) return { ok: false, reason: 'Territoire introuvable' };
  if (!TAXES[tax]) return { ok: false, reason: 'Niveau d’impôt inconnu' };
  t.tax = tax;
  return { ok: true };
}

export function celebrate(state, k, now = Date.now()) {
  const t = state.territories[k];
  if (!t) return { ok: false, reason: 'Territoire introuvable' };
  if (t.festUntil > now) return { ok: false, reason: 'Des festivités sont déjà en cours' };
  const cost = FESTIVAL.cost(t.level || 1);
  if (!pay(state, cost)) return { ok: false, reason: 'Ressources insuffisantes', missing: missing(state, cost) };
  t.festUntil = now + FESTIVAL.hours * 3600000;
  log(state, 'good', `🎉 Festivités royales dans la province « ${t.name} » : la population vous acclame.`, now);
  return { ok: true };
}

// Province la plus agitée (pour les événements et le conseiller)
export function unrestCandidate(state, now = Date.now()) {
  return Object.entries(state.territories || {}).filter(([, t]) => stabOf(t) < 30 && !t.revolt && !(t.unrestAt > now)).sort((a, b) => stabOf(a[1]) - stabOf(b[1]))[0] || null;
}
