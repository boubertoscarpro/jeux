// v17 — Formulations sûres (module pur) : jamais de durée nulle ou négative, jamais « bientôt épuisé » pour un stock
// déjà vide. Utilisé par le conseiller, le bilan économique et leurs fenêtres.
import { fmt, fmtTime } from '../core/util.js';

// Prévision d'un stock qui baisse : texte court et juste
export function stockForecast(name, stock, ratePerH) {
  const need = fmt(Math.abs(ratePerH));
  if (!(stock >= 1)) return `Plus de ${name} en stock : il en manque ${need} par heure.`;
  if (!(ratePerH < 0)) return `${name} : stock stable.`;
  const ms = (stock / -ratePerH) * 3600e3;
  if (ms < 60e3) return `Le stock de ${name} sera vide dans moins d’une minute (${fmt(ratePerH)}/h).`;
  return `Le stock de ${name} sera vide dans ${fmtTime(ms)} (${fmt(ratePerH)}/h).`;
}
// Durée « dans … » sans jamais afficher 0 s ni une durée négative
export const inTime = (ms) => (ms > 60e3 ? `dans ${fmtTime(ms)}` : ms > 0 ? 'dans moins d’une minute' : 'maintenant');
