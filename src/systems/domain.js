import { rng } from '../core/rng.js';
import { thLevel } from './city.js';
import { pay, missing } from './economy.js';
import { chronicle } from './chronicle.js';
import { extendCity } from '../core/state.js';

// Chaque étape ajoute 4 colonnes (est) et 2 rangées (sud) : de 24×16 à 40×24 cases
export const DOMAIN_GROW = { w: 4, h: 2 };

// Agrandissement du domaine : la grille de la ville s'étend (vers l'est et le sud)
export const DOMAIN_STEPS = [
  { th: 4, cost: { wood: 2000, stone: 2000, gold: 800 }, name: 'Faubourgs' },
  { th: 6, cost: { wood: 6000, stone: 6000, gold: 3000, planks: 400 }, name: 'Bourg fortifié' },
  { th: 8, cost: { wood: 15000, stone: 15000, gold: 9000, frames: 200 }, name: 'Cité' },
  { th: 11, cost: { wood: 40000, stone: 40000, gold: 25000, frames: 600, crystals: 20 }, name: 'Capitale royale' },
];

export const nextDomainStep = (state) => DOMAIN_STEPS[state.domain || 0] || null;

export function expandDomain(state, now = Date.now()) {
  const step = nextDomainStep(state);
  if (!step) return { ok: false, reason: 'Domaine à sa taille maximale' };
  if (thLevel(state) < step.th) return { ok: false, reason: `Hôtel de ville niv. ${step.th} requis` };
  if (!pay(state, step.cost)) return { ok: false, reason: 'Ressources insuffisantes', missing: missing(state, step.cost) };
  extendCity(state, state.city.w + DOMAIN_GROW.w, state.city.h + DOMAIN_GROW.h, () => rng.random(), 0.04);
  state.domain = (state.domain || 0) + 1;
  chronicle(state, `Le domaine s’agrandit : ${step.name}.`, now);
  return { ok: true };
}
