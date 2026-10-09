import { createNewState, SAVE_VERSION } from './state.js';

export const SAVE_KEY = 'cendrelande_save';
export const BACKUP_KEY = 'cendrelande_save_backup';     // dernière sauvegarde saine (rotation toutes les 10 min)
export const CORRUPT_KEY = 'cendrelande_save_corrupt';   // copie d'une sauvegarde illisible (jamais écrasée silencieusement)
const BACKUP_EVERY = 10 * 60 * 1000;

function storage() {
  try { return globalThis.localStorage || null; } catch { return null; }
}

export function serialize(state) { return JSON.stringify(state); }

// ───────── Migrations versionnées ─────────
// Chaque entrée transforme une sauvegarde de la version N vers N+1. Le remplissage des champs
// manquants (fill) s'applique ensuite pour tout ce qui est purement additif.
export const MIGRATIONS = {
  // v1–v3 → v4 : systèmes de la phase 2 (ajouts purs, gérés par fill)
  1: (d) => d, 2: (d) => d, 3: (d) => d,
  // v4 → v5 : événements temporaires, Éclats Anciens, notifications
  4: (d) => d,
  // v5 → v6 : suppression du fil « serveur » factice, registre des pertes, territoires spécialisés
  5: (d) => {
    d.serverFeed = [];
    for (const t of Object.values(d.territories || {})) { t.spec ??= null; t.level ??= 1; }
    return d;
  },
};

// Complète une sauvegarde ancienne avec les champs manquants (récursif, sans écraser l'existant)
function fill(target, src) {
  for (const [k, v] of Object.entries(src)) {
    if (target[k] === undefined || target[k] === null && v !== null && typeof v === 'object') target[k] = v;
    else if (v && typeof v === 'object' && !Array.isArray(v) && target[k] && typeof target[k] === 'object' && !Array.isArray(target[k]) && !['buildings', 'pois', 'territories', 'techs', 'army', 'owned', 'artifacts', 'ledger', 'losses'].includes(k)) fill(target[k], v);
  }
}

// Corrige les valeurs numériques invalides (NaN, Infinity, négatives) qui bloqueraient la partie
function sanitize(d) {
  const fixes = [];
  for (const [r, v] of Object.entries(d.resources || {})) if (!Number.isFinite(v) || v < 0) { fixes.push(r); d.resources[r] = Number.isFinite(v) ? 0 : 0; }
  for (const [u, n] of Object.entries(d.army || {})) if (!Number.isFinite(n) || n < 0) { fixes.push(u); d.army[u] = 0; }
  for (const q of ['build', 'train', 'research', 'craft']) d.queues[q] = (d.queues[q] || []).filter((x) => x && Number.isFinite(x.end));
  if (d.shards) for (const k of ['count', 'tickets', 'mythicFragments', 'legendaryFragments', 'relicFragments']) if (!Number.isFinite(d.shards[k]) || d.shards[k] < 0) d.shards[k] = 0;
  // Références orphelines : héros marquant une marche disparue
  const marchIds = new Set([...(d.marches || []).map((m) => m.id), ...(d.live?.marches || []).map((m) => m.id)]);
  for (const h of d.heroes || []) if (h.marchId && !marchIds.has(h.marchId)) h.marchId = null;
  return fixes;
}

// Vérifie la forme minimale d'une sauvegarde ; lève une erreur explicite sinon
export function validateShape(data) {
  const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
  if (!isObj(data)) throw new Error('le contenu n’est pas une sauvegarde de Cendrelande');
  if (!isObj(data.meta) || !isObj(data.city) || !isObj(data.city.buildings) || !isObj(data.resources)) throw new Error('sauvegarde incomplète (royaume, ville ou ressources manquants)');
  if (!Array.isArray(data.city.terrain)) throw new Error('terrain de la ville manquant');
  if (data.version !== undefined && (typeof data.version !== 'number' || data.version > SAVE_VERSION)) throw new Error(`version ${data.version} plus récente que ce jeu (${SAVE_VERSION}) : mettez le jeu à jour`);
  for (const k of ['heroes', 'marches', 'log']) if (data[k] !== undefined && !Array.isArray(data[k])) throw new Error(`champ « ${k} » invalide`);
  if (!Object.values(data.city.buildings).some((b) => b?.type === 'townhall')) throw new Error('aucun hôtel de ville');
}

export function migrate(data) {
  const from = typeof data.version === 'number' ? data.version : 1;
  for (let v = from; v < SAVE_VERSION; v++) if (MIGRATIONS[v]) data = MIGRATIONS[v](data) || data;
  const fresh = createNewState({ seed: data?.meta?.seed || 1, now: data?.meta?.lastTick || Date.now() });
  fill(data, fresh);
  const fixes = sanitize(data);
  data.version = SAVE_VERSION;
  if (from < SAVE_VERSION) data.meta.migratedFrom = from;
  if (fixes.length) data.meta.repaired = fixes;
  return data;
}

export function deserialize(json) {
  let data;
  try { data = JSON.parse(json); } catch { throw new Error('données illisibles (JSON invalide)'); }
  validateShape(data);
  return migrate(data);
}

// Sauvegarde ; renvoie { ok, error }. Une erreur (quota plein…) n'efface jamais la sauvegarde précédente.
export function saveGame(state, now = Date.now()) {
  const s = storage();
  if (!s) return { ok: false, error: 'Stockage du navigateur indisponible' };
  try {
    const json = serialize(state);
    const prev = s.getItem(SAVE_KEY);
    // Rotation de la copie de secours : la précédente sauvegarde saine est conservée
    if (prev && now - (state.meta.lastBackup || 0) > BACKUP_EVERY) {
      try { JSON.parse(prev); s.setItem(BACKUP_KEY, prev); state.meta.lastBackup = now; } catch { /* précédente illisible : on ne la copie pas */ }
    }
    s.setItem(SAVE_KEY, json);
    state.meta.lastSave = now;
    return { ok: true };
  } catch (e) {
    return { ok: false, error: /quota/i.test(e?.name + e?.message) ? 'Stockage plein : exportez votre sauvegarde' : `Échec de la sauvegarde (${e?.message || e})` };
  }
}

// Chargement : { state } si tout va bien, { error, raw, backup } si la sauvegarde est illisible, null s'il n'y en a pas
export function loadGame() {
  const s = storage();
  if (!s) return null;
  const raw = s.getItem(SAVE_KEY);
  if (!raw) return null;
  try { return { state: deserialize(raw) }; } catch (e) {
    try { s.setItem(CORRUPT_KEY, raw); } catch { /* stockage plein : la sauvegarde d'origine reste en place */ }
    let backup = null;
    const b = s.getItem(BACKUP_KEY);
    if (b) { try { backup = deserialize(b); } catch { backup = null; } }
    return { error: e.message, raw, backup };
  }
}

export function deleteSave() { const s = storage(); s?.removeItem(SAVE_KEY); }

export function exportSave(state) {
  return btoa(unescape(encodeURIComponent(serialize(state))));
}
export function importSave(text) {
  const t = String(text || '').trim();
  if (!t) throw new Error('collez d’abord un code de sauvegarde');
  let json;
  if (t.startsWith('{')) json = t; // fichier JSON brut (téléchargement)
  else { try { json = decodeURIComponent(escape(atob(t))); } catch { throw new Error('code de sauvegarde mal formé'); } }
  return deserialize(json);
}
