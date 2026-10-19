// v17 — Préférences d'accessibilité (module pur) : lecture avec valeurs par défaut sûres, et bornage des valeurs.
import { A11Y_DEFAULTS, TEXT_SCALES, TOAST_SECS, COLOR_VISION, MAP_PALETTES } from '../data/a11y.js';

export function a11yPrefs(state) {
  const a = { ...A11Y_DEFAULTS, ...(state?.meta?.a11y || {}) };
  a.textScale = TEXT_SCALES.includes(+a.textScale) ? +a.textScale : 1;
  a.toastSec = TOAST_SECS.includes(+a.toastSec) ? +a.toastSec : 4;
  if (!COLOR_VISION[a.colorVision]) a.colorVision = 'none';
  if (!['default', 'readable'].includes(a.font)) a.font = 'default';
  for (const k of ['contrast', 'weather', 'night', 'showNames', 'simple']) a[k] = !!a[k];
  return a;
}
export function setA11y(state, key, value) {
  if (!(key in A11Y_DEFAULTS)) return { ok: false, reason: 'Réglage inconnu' };
  state.meta.a11y = { ...a11yPrefs(state), [key]: value };
  state.meta.a11y = a11yPrefs(state);
  return { ok: true };
}
export const mapPalette = (state) => MAP_PALETTES[a11yPrefs(state).colorVision] || MAP_PALETTES.none;
