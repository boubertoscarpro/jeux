import { createNewState, SAVE_VERSION } from './state.js';

export const SAVE_KEY = 'cendrelande_save';

function storage() {
  try { return globalThis.localStorage || null; } catch { return null; }
}

export function serialize(state) { return JSON.stringify(state); }

// Complète une sauvegarde ancienne avec les champs manquants
export function migrate(data) {
  const fresh = createNewState({ seed: data?.meta?.seed || 1, now: data?.meta?.lastTick || Date.now() });
  const fill = (target, src) => {
    for (const [k, v] of Object.entries(src)) {
      if (target[k] === undefined) target[k] = v;
      else if (v && typeof v === 'object' && !Array.isArray(v) && typeof target[k] === 'object' && !Array.isArray(target[k]) && k !== 'buildings' && k !== 'pois' && k !== 'territories') fill(target[k], v);
    }
  };
  fill(data, fresh);
  data.version = SAVE_VERSION;
  return data;
}

export function deserialize(json) {
  const data = JSON.parse(json);
  if (!data || !data.meta || !data.city) throw new Error('Sauvegarde invalide');
  return migrate(data);
}

export function saveGame(state) {
  const s = storage();
  if (!s) return false;
  try { s.setItem(SAVE_KEY, serialize(state)); state.meta.lastSave = Date.now(); return true; } catch { return false; }
}

export function loadGame() {
  const s = storage();
  if (!s) return null;
  const raw = s.getItem(SAVE_KEY);
  if (!raw) return null;
  try { return deserialize(raw); } catch (e) { console.warn('Sauvegarde corrompue', e); return null; }
}

export function deleteSave() { storage()?.removeItem(SAVE_KEY); }

export function exportSave(state) {
  return btoa(unescape(encodeURIComponent(serialize(state))));
}
export function importSave(text) {
  return deserialize(decodeURIComponent(escape(atob(text.trim()))));
}
