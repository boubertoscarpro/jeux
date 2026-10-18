// v15 — « Le monde montre son état » : ce que les cartes doivent montrer, déduit de l'état RÉEL du jeu (module pur,
// sans DOM, testable). Le rendu (src/ui/atlas.js, vues royaume et monde) se contente de dessiner ce résumé : rien de
// ce qui change à l'écran n'est inventé. La lumière suit l'heure réelle de l'appareil.
import { CATASTROPHES } from '../data/seasons.js';
import { SIGNS } from '../data/crises.js';
import { calendar } from './chronicle.js';
import { floodZone } from './hazards.js';
import { omenEstimate } from './omens.js';

// Lumière selon l'heure (0–24) : teinte et opacité d'un voile, bornée à 0,35 la nuit pour rester lisible
export function dayLight(hour) {
  const h = ((hour % 24) + 24) % 24;
  if (h >= 21 || h < 5) return { phase: 'night', name: 'Nuit', tint: [20, 32, 78], a: 0.35 };
  if (h < 7) return { phase: 'dawn', name: 'Aube', tint: [255, 170, 150], a: 0.16 * (1 - (h - 5) / 2) + 0.06 };
  if (h >= 18) return { phase: 'dusk', name: 'Crépuscule', tint: [255, 150, 60], a: 0.1 + 0.16 * ((h - 18) / 3) };
  return { phase: 'day', name: 'Jour', tint: [255, 255, 255], a: 0 };
}

// Particules de météo : pluie, neige, brume, orage ; la canicule ne montre qu'une chaleur (pas de particules)
export const WEATHER_FX = { rain: 'rain', storm: 'storm', snow: 'snow', fog: 'fog', heat: 'heat', clear: null };

const active = (state, type) => (state.crises?.active || []).filter((c) => c.type === type);

/**
 * Résumé visuel de l'état du royaume à l'instant `now`.
 * hour : heure locale réelle (0–24), passée par l'appelant (l'interface lit l'horloge de l'appareil).
 */
export function sceneState(state, now = Date.now(), hour = 12) {
  const cal = calendar(state, now);
  const cat = state.catastrophe?.until > now ? state.catastrophe.key : null;
  const fires = active(state, 'fire');
  const burning = new Set();
  // Bâtiments en feu : ceux de l'incendie en cours tant qu'il se propage (étapes « spread ») ; ensuite, des ruines fumantes
  for (const c of fires) for (const id of c.burnt || []) burning.add(id);
  const spreading = fires.some((c) => (c.stage ?? 0) <= 1);
  const drought = cat === 'drought' || active(state, 'drought').length > 0;
  const flood = cat === 'flood' || active(state, 'flood').some((c) => c.stage <= 1);
  const signs = [];
  for (const o of state.omens?.list || []) {
    if (o.resolved || o.kind !== 'catastrophe' || !SIGNS[o.key] || !(o.signs || []).length) continue;
    signs.push({ key: o.key, n: o.signs.length, est: omenEstimate(o), id: o.id });
  }
  return {
    season: cal.season.key,
    light: dayLight(hour),
    weather: WEATHER_FX[state.weather?.type] || null,
    catastrophe: cat,
    catastropheName: cat ? CATASTROPHES[cat].name : null,
    drought,
    flood,
    floodIds: flood ? floodZone(state).map((b) => b.id) : [],
    burning: [...burning],
    fireSpreading: spreading && burning.size > 0,
    damaged: Object.values(state.city?.buildings || {}).filter((b) => b.damaged && !burning.has(b.id)).map((b) => b.id),
    signs,
    winter: cal.season.key === 'winter',
    autumn: cal.season.key === 'autumn',
  };
}

// Signature du sol peint (le sol n'est repeint que si elle change) : terrain, saison, sécheresse, signes de sécheresse
export function groundKey(state, scene, quality = 'medium') {
  const t = state.city?.terrain || [];
  let h = 0;
  for (let i = 0; i < t.length; i++) h = (h * 31 + t[i].charCodeAt(0) + i) | 0;
  const dry = scene.drought ? 2 : scene.signs.some((x) => x.key === 'drought') ? 1 : 0;
  return `${state.city?.w}x${state.city?.h}:${h}:${scene.season}:${dry}:${quality}:${state.meta?.theme || ''}`;
}
