// Bus d'événements minimal : le moteur signale, l'UI écoute.
const listeners = {};

export const bus = {
  on(evt, fn) { (listeners[evt] ||= []).push(fn); return () => this.off(evt, fn); },
  off(evt, fn) { listeners[evt] = (listeners[evt] || []).filter((f) => f !== fn); },
  emit(evt, payload) { for (const fn of listeners[evt] || []) fn(payload); },
};
