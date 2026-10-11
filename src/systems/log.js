import { bus } from '../core/bus.js';

// Ajoute une entrée au journal. type: info | good | bad | story | event | combat | explore | trade
export function log(state, type, text, now = Date.now()) {
  state.log.unshift({ t: now, type, text });
  if (state.log.length > 250) state.log.length = 250;
  bus.emit('log', { type, text });
}

// Notification visuelle uniquement (toast)
export function toast(text, type = 'info') { bus.emit('toast', { text, type }); }

// Grande réussite ou alerte majeure : bandeau de célébration dans l'interface (ignoré hors interface et pendant
// le rattrapage hors-ligne). tone : good | bad ; at : case de la carte du royaume à illuminer
export function feat(icon, title, sub = '', tone = 'good', at = null) { bus.emit('feat', { icon, title, sub, tone, at }); }
