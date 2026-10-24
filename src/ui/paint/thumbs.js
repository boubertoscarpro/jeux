// v21 « Couleurs du Royaume » — Miniatures peintes des bâtiments (fiche, panneau Construire) : le même dessin cuit que
// sur la carte, réduit et mis en cache sous forme d'image. Repli sur l'ancienne icône SVG hors navigateur.
import { buildingSprite } from './scene.js';
import { sizeTier } from '../../systems/mapSignals.js';

const cache = new Map();
export function paintedThumb(type, level = 1, size = 44, fallback = '') {
  if (typeof document === 'undefined') return fallback;
  const tier = sizeTier(Math.max(1, level));
  // v22b : dessin cuit assez grand pour la taille affichée et la densité de l'écran (plus de miniature pixelisée)
  const dpr = Math.min(2, (typeof window !== 'undefined' && window.devicePixelRatio) || 1);
  const r = Math.min(2.5, Math.max(0.75, Math.ceil((size * dpr) / 64) * 0.5));
  const k = `${type}|${tier}|${r}`;
  let url = cache.get(k);
  if (!url) {
    try {
      const sp = buildingSprite(type, tier, 0, { active: false, season: 'summer', level }, r);
      if (!sp.art) return fallback;
      const c = document.createElement('canvas');
      c.width = sp.art.width; c.height = sp.art.height;
      c.getContext('2d').drawImage(sp.art, 0, 0);
      url = c.toDataURL('image/png');
      cache.set(k, url);
    } catch { return fallback; }
  }
  return `<img class="b-thumb" src="${url}" width="${size}" height="${size}" alt="" aria-hidden="true">`;
}
