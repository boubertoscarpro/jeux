// Découverte des plans de forge et spécialisation de l'atelier (voir data/recipes.js).
// La fabrication elle-même reste dans crafting.js : un plan fixe la base, ajoute un coût et un effet spécial choisi.
import { PLANS, EXPERIMENT, WORKSHOPS, WORKSHOP_FX, DUNGEON_PLAN_CHANCE } from '../data/recipes.js';
import { AFFIXES } from '../data/items.js';
import { RARITIES } from '../data/heroes.js';
import { rng } from '../core/rng.js';
import { levelOf } from './city.js';
import { pay, missing } from './economy.js';
import { chronicle } from './chronicle.js';
import { log, toast } from './log.js';

export function recipesState(state) {
  const r = (state.recipes && typeof state.recipes === 'object') ? state.recipes : (state.recipes = {});
  r.known ||= {};
  r.workshop ??= null;
  r.changedAt ||= 0;
  r.experiments ||= 0;
  if (!Number.isFinite(r.dungeonMark)) r.dungeonMark = state.stats?.dungeons || 0;
  return r;
}

export const knowsPlan = (state, id) => !!state.recipes?.known?.[id];

// Apprend un plan ; renvoie son nom (ou null s'il était déjà connu)
export function learnPlan(state, id, source = '', now = Date.now()) {
  const r = recipesState(state);
  const p = PLANS[id];
  if (!p || r.known[id]) return null;
  r.known[id] = { t: now, source };
  log(state, 'good', `📐 Nouveau plan de forge : ${p.icon} ${p.name}${source ? ` (${source})` : ''}.`, now);
  toast(`📐 Plan appris : ${p.name}`, 'good');
  return p.name;
}

// Plans enseignables par les héros présents
export function heroPlans(state) {
  return Object.entries(PLANS).filter(([id, p]) => p.src === 'hero' && !knowsPlan(state, id))
    .map(([id, p]) => ({ id, p, hero: state.heroes.find((h) => h.cls === p.heroClass && h.level >= p.heroLevel) || null }));
}

export function learnFromHero(state, id, now = Date.now()) {
  const p = PLANS[id];
  if (!p || p.src !== 'hero') return { ok: false, reason: 'Plan inconnu' };
  if (knowsPlan(state, id)) return { ok: false, reason: 'Plan déjà connu' };
  const h = state.heroes.find((x) => x.cls === p.heroClass && x.level >= p.heroLevel);
  if (!h) return { ok: false, reason: `Un héros de la bonne classe de niveau ${p.heroLevel} est requis` };
  learnPlan(state, id, `enseigné par ${h.name}`, now);
  return { ok: true, name: p.name };
}

// Factions qui acceptent de vendre leurs plans
export const planSellers = (state) => (state.factions || []).filter((f) => f.stance === 'trade' || f.stance === 'alliance');

export function buyFactionPlan(state, id, now = Date.now()) {
  const p = PLANS[id];
  if (!p || p.src !== 'faction') return { ok: false, reason: 'Plan inconnu' };
  if (knowsPlan(state, id)) return { ok: false, reason: 'Plan déjà connu' };
  if (!planSellers(state).length) return { ok: false, reason: 'Il faut un accord commercial ou une alliance avec une faction' };
  if (!pay(state, p.price)) return { ok: false, reason: 'Ressources insuffisantes', missing: missing(state, p.price) };
  learnPlan(state, id, 'acheté à une faction amie', now);
  return { ok: true, name: p.name };
}

export function experiment(state, now = Date.now()) {
  const r = recipesState(state);
  if (levelOf(state, 'forge') < EXPERIMENT.minForge) return { ok: false, reason: `Forge niveau ${EXPERIMENT.minForge} requise` };
  const left = Object.keys(PLANS).filter((id) => PLANS[id].src === 'experiment' && !r.known[id]);
  if (!left.length) return { ok: false, reason: 'Tous les plans d’expérimentation sont connus' };
  if (!pay(state, EXPERIMENT.cost)) return { ok: false, reason: 'Ressources insuffisantes', missing: missing(state, EXPERIMENT.cost) };
  r.experiments++;
  // Chaque échec rend la suivante plus sûre (+15 %)
  const p = Math.min(1, EXPERIMENT.chance + 0.15 * (r.failStreak || 0));
  if (rng.chance(p)) {
    r.failStreak = 0;
    const id = rng.pick(left);
    learnPlan(state, id, 'expérimentation de l’atelier', now);
    return { ok: true, found: true, name: PLANS[id].name };
  }
  r.failStreak = (r.failStreak || 0) + 1;
  return { ok: true, found: false, text: `L’alliage se fissure… Prochaine tentative : ${Math.round(Math.min(1, EXPERIMENT.chance + 0.15 * r.failStreak) * 100)} % de réussite.` };
}

// Atelier spécialisé
export function workshopOf(state) { return WORKSHOPS[state.recipes?.workshop] ? state.recipes.workshop : null; }
export function workshopEffect(state, slot) {
  const w = workshopOf(state);
  if (!w) return { quality: 0, costMult: 1 };
  return WORKSHOPS[w].slots.includes(slot) ? { quality: WORKSHOP_FX.quality, costMult: 1 - WORKSHOP_FX.discount } : { quality: 0, costMult: 1 + WORKSHOP_FX.surcharge };
}
export function setWorkshop(state, key, now = Date.now()) {
  const r = recipesState(state);
  if (key !== null && !WORKSHOPS[key]) return { ok: false, reason: 'Atelier inconnu' };
  if (!levelOf(state, 'forge')) return { ok: false, reason: 'Forge requise' };
  if (r.workshop === key) return { ok: false, reason: 'Déjà la spécialité de l’atelier' };
  const first = !r.workshop && !r.changedAt;
  if (!first && r.changedAt + WORKSHOP_FX.cooldownH * 3600000 > now) return { ok: false, reason: `Réorganisation possible ${WORKSHOP_FX.cooldownH} h après la précédente` };
  if (!first && !pay(state, WORKSHOP_FX.changeCost)) return { ok: false, reason: 'Ressources insuffisantes', missing: missing(state, WORKSHOP_FX.changeCost) };
  r.workshop = key; r.changedAt = now;
  return { ok: true, name: key ? WORKSHOPS[key].name : 'Atelier polyvalent' };
}

// Application d'un plan à un objet généré (base déjà forcée par crafting.js)
export function applyPlan(item, planId, variantKey) {
  const p = PLANS[planId];
  const v = p?.variants[variantKey];
  if (!v) return item;
  const rm = RARITIES[item.rarity]?.mult || 1;
  const lvlMult = 1 + ((item.ilvl || 1) - 1) * 0.06;
  for (const [stat, k] of Object.entries(v.add)) {
    const a = AFFIXES[stat];
    if (!a) continue;
    const val = a.base * k * rm * lvlMult;
    item.affixes[stat] = a.pct ? Math.round(((item.affixes[stat] || 0) + val) * 1000) / 1000 : Math.round(((item.affixes[stat] || 0) + val) * 10) / 10;
  }
  item.name = `${p.name} (${v.name.toLowerCase()})`;
  item.plan = planId; item.variant = variantKey;
  return item;
}

// Tick : les donjons vidés peuvent livrer un plan
export function recipesTick(state, now = Date.now()) {
  const r = recipesState(state);
  const d = state.stats?.dungeons || 0;
  while (r.dungeonMark < d) {
    r.dungeonMark++;
    const left = Object.keys(PLANS).filter((id) => PLANS[id].src === 'dungeon' && !r.known[id]);
    if (left.length && rng.chance(DUNGEON_PLAN_CHANCE)) {
      const id = rng.pick(left);
      learnPlan(state, id, 'trouvé dans un donjon', now);
      chronicle(state, `Un plan de forge oublié est rapporté d’un donjon : ${PLANS[id].name}.`, now);
    }
  }
}
