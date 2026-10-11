import { initLegacyCampaign } from '../systems/campaign.js';
import { KINGDOM_TYPES, ORIGINS, DIFFICULTIES } from '../data/kingdoms.js';
import { createNewState, SAVE_VERSION, extendCity, CITY_W, CITY_H } from './state.js';
import { extendWorld } from '../systems/worldgen.js';
import { mulberry32 } from './rng.js';
import { ensureIdentity } from '../systems/identity.js';

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
  // v6 → v7 : spécialisations de royaume et parcours guidé.
  // Les parties existantes reçoivent le « royaume sans spécialisation » (aucun bonus ni malus rétroactif) ;
  // le parcours est initialisé après complétion des champs (voir migrate → initLegacyCampaign).
  6: (d) => {
    d.kingdom = { type: null, origin: 'none', difficulty: 'classic', chosenAt: d.meta?.created || 0, legacy: true };
    d.campaign = null;
    d.meta.advice ??= 'full';
    // Les fiches de chapitre ne sont pas imposées à un joueur déjà avancé
    return d;
  },
  // v7 → v8 : cartes agrandies. Rien n'est déplacé : la ville et le monde s'étendent vers l'est et le sud.
  // Ville : au moins 24×16 (+4 colonnes / +2 rangées par agrandissement déjà acheté), sans décombres ajoutés.
  // Monde : 48×48 → 96×96, nouvelles régions explorables (brouillard), capitale et sites existants inchangés.
  7: (d) => {
    const seed = Number(d.meta?.seed) || 1;
    const dom = Math.max(0, Math.floor(d.domain || 0));
    if (Array.isArray(d.city?.terrain) && d.city.w > 0 && d.city.h > 0 && d.city.terrain.length === d.city.w * d.city.h) {
      extendCity(d, CITY_W + 4 * dom, CITY_H + 2 * dom, mulberry32(seed ^ 0x77), 0);
    }
    const w = d.world;
    if (w && typeof w.terrain === 'string' && Array.isArray(w.revealed) && w.size > 0 && w.terrain.length === w.size * w.size && w.capital && w.pois) extendWorld(w, seed);
    return d;
  },
  // v8 → v9 : identité stable (joueur, royaume, château), nom du château principal, identifiant et nom de chaque
  // avant-poste (un nom médiéval par défaut est attribué aux avant-postes qui n'en ont pas), quêtes du royaume
  // et missions dynamiques (ajouts purs, complétés par fill). Rien n'est retiré ni déplacé.
  8: (d) => {
    ensureIdentity(d);
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

// Remplace tout champ dont le TYPE ne correspond pas à un état neuf (tableau attendu mais objet reçu, etc.)
const DYNAMIC = new Set(['buildings', 'pois', 'territories', 'techs', 'army', 'owned', 'artifacts', 'ledger', 'losses', 'resources', 'records', 'reputation', 'bossTrophies', 'occ', 'heat', 'daily', 'feats', 'perks', 'ranks', 'claimed', 'done', 'milestones', 'routes', 'consumables', 'prices', 'history', 'admin', 'thresholds', 'sat', 'bought', 'produced', 'spent', 'flags', 'snoozed', 'dismissed', 'chapterClaimed', 'unlockedAt']);
function conform(target, fresh, path, fixes) {
  for (const [k, v] of Object.entries(fresh)) {
    const cur = target[k];
    if (cur === undefined) continue;
    if (Array.isArray(v) && !Array.isArray(cur)) { target[k] = v; fixes.push(path + k); continue; }
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      if (cur === null) continue;
      if (typeof cur !== 'object' || Array.isArray(cur)) { target[k] = v; fixes.push(path + k); continue; }
      if (!DYNAMIC.has(k)) conform(cur, v, path + k + '.', fixes);
    } else if (typeof v === 'number' && typeof cur !== 'number') {
      const n = Number(cur);
      target[k] = Number.isFinite(n) ? n : v; fixes.push(path + k);
    }
  }
}

const finite = Number.isFinite;
// Corrige les valeurs invalides (NaN, Infinity, négatives, échéances absentes) qui bloqueraient la partie
function sanitize(d, fresh) {
  const fixes = [];
  conform(d, fresh, '', fixes);
  for (const [r, v] of Object.entries(d.resources || {})) { const n = Number(v); if (!finite(n) || n < 0) { fixes.push(r); d.resources[r] = 0; } else d.resources[r] = n; }
  for (const [u, n] of Object.entries(d.army || {})) if (!Number.isFinite(n) || n < 0) { fixes.push(u); d.army[u] = 0; }
  for (const q of ['build', 'train', 'research', 'craft']) d.queues[q] = (Array.isArray(d.queues[q]) ? d.queues[q] : []).filter((x) => x && finite(x.end));
  // Échéances absentes ou invalides : l'entrée est retirée (ou remise au repos) plutôt que de figer le temps
  const before = (d.marches.length + d.caravans.length + d.raids.length);
  const marchOk = (m) => m && m.units && ({ out: finite(m.arrive), work: finite(m.workEnd), back: finite(m.returnAt), wait: true, hold: true })[m.phase];
  d.marches = d.marches.filter(marchOk);
  d.caravans = d.caravans.filter((c) => c && finite(c.end));
  d.raids = d.raids.filter((r) => r && finite(r.arrive) && r.army);
  if (d.live) d.live.marches = (Array.isArray(d.live.marches) ? d.live.marches : []).filter(marchOk);
  for (const t of d.expeditions || []) {
    const due = { out: t.arrive, work: t.workEnd, back: t.returnAt }[t.status];
    if (t.status !== 'idle' && !finite(due)) { t.status = 'idle'; fixes.push('expédition ' + (t.name || t.id)); }
  }
  if (d.marches.length + d.caravans.length + d.raids.length < before) fixes.push('trajets invalides');
  d.pending = d.pending.filter((p) => p && p.id);
  // Spécialisation inconnue (sauvegarde modifiée à la main) → royaume sans spécialisation, jamais de bonus inventé
  if (d.kingdom && d.kingdom.type !== null && !KINGDOM_TYPES[d.kingdom.type]) { fixes.push('spécialisation'); d.kingdom.type = null; }
  if (d.kingdom && !ORIGINS[d.kingdom.origin]) d.kingdom.origin = 'none';
  if (d.kingdom && !DIFFICULTIES[d.kingdom.difficulty]) d.kingdom.difficulty = 'classic';
  if (d.campaign && !(d.campaign.chapter >= 1 && d.campaign.chapter <= 8)) { fixes.push('chapitre'); d.campaign.chapter = Math.min(8, Math.max(1, Math.floor(+d.campaign.chapter) || 1)); }
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
  // Identité (ids stables, noms) complétée AVANT fill : une partie importée ne reçoit jamais le nom par défaut
  // d'un autre royaume ; les avant-postes sans nom reçoivent un nom par défaut
  if (data.meta && typeof data.meta === 'object') ensureIdentity(data);
  const needCampaign = !data.campaign || typeof data.campaign !== 'object';
  const fresh = createNewState({ seed: data?.meta?.seed || 1, now: data?.meta?.lastTick || Date.now() });
  fill(data, fresh);
  if (needCampaign) { data.campaign = fresh.campaign; initLegacyCampaign(data, data.meta.lastTick || Date.now()); }
  const fixes = sanitize(data, createNewState({ seed: 1, now: Date.now() }));
  ensureIdentity(data); // noms invalides (modifiés à la main) → noms par défaut
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
  const isQuota = (e) => /quota/i.test(`${e?.name} ${e?.message}`);
  try {
    // La copie de secours est faite depuis l'état EN MÉMOIRE, seulement si la partie a tourné sans erreur
    // (une sauvegarde importée ou réparée qui planterait ne remplace jamais la copie saine)
    const rotate = state.meta.bootOk && now - (state.meta.lastBackup || 0) > BACKUP_EVERY;
    state.meta.lastSave = now;
    if (rotate) state.meta.lastBackup = now;
    const json = serialize(state);
    try {
      if (rotate) s.setItem(BACKUP_KEY, json);
      s.setItem(SAVE_KEY, json);
    } catch (e) {
      if (!isQuota(e)) throw e;
      // Stockage plein : on libère la copie de secours et la copie endommagée, puis on réessaie
      s.removeItem(BACKUP_KEY); s.removeItem(CORRUPT_KEY);
      s.setItem(SAVE_KEY, json);
      return { ok: true, warning: 'Stockage presque plein : la copie de secours a été supprimée. Exportez votre sauvegarde.' };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: isQuota(e) ? 'Stockage plein : exportez votre sauvegarde (Saison & boutique → Télécharger)' : `Échec de la sauvegarde (${e?.message || e})` };
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

export function deleteSave() { const s = storage(); for (const k of [SAVE_KEY, BACKUP_KEY, CORRUPT_KEY]) s?.removeItem(k); }

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
