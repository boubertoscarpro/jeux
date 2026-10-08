import { rng } from '../core/rng.js';
import { thLevel } from './city.js';
import { pay, missing } from './economy.js';
import { chronicle } from './chronicle.js';

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
  const { w, h, terrain } = state.city;
  const nw = w + 2, nh = h + 1;
  const t = new Array(nw * nh);
  for (let y = 0; y < nh; y++) for (let x = 0; x < nw; x++) {
    if (x < w && y < h) { t[y * nw + x] = terrain[y * w + x]; continue; }
    let ter = 'plain';
    const r = rng.random();
    if (y < 3 && x >= w && r < 0.55) ter = 'mountain';
    else if (y === nh - 1 && r < 0.45) ter = 'forest';
    else if (r < 0.12) ter = 'rubble';
    else if (r < 0.22) ter = 'forest';
    // La rivière continue vers le sud
    if (y >= h && x < w && terrain[(h - 1) * w + x] === 'river') ter = 'river';
    t[y * nw + x] = ter;
  }
  Object.assign(state.city, { w: nw, h: nh, terrain: t });
  state.domain = (state.domain || 0) + 1;
  chronicle(state, `Le domaine s’agrandit : ${step.name}.`, now);
  return { ok: true };
}
