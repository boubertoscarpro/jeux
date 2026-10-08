import { bus } from '../core/bus.js';

// Ajoute une entrée au journal. type: info | good | bad | story | event | combat | explore | trade
export function log(state, type, text, now = Date.now()) {
  state.log.unshift({ t: now, type, text });
  if (state.log.length > 250) state.log.length = 250;
  bus.emit('log', { type, text });
}

// Notification visuelle uniquement (toast)
export function toast(text, type = 'info') { bus.emit('toast', { text, type }); }
