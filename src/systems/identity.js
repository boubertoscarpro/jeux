// Identité du joueur, du royaume, du château principal et des avant-postes.
// Chaque entité possède un identifiant stable et unique (jamais déduit du nom affiché : deux joueurs peuvent
// nommer leur château de la même façon). Les noms sont validés ici, en un seul endroit, pour toutes les vues.
// Rien ici ne simule un serveur : ces identifiants préparent simplement une éventuelle évolution multijoueur.
import { uid } from '../core/util.js';
import { hashString } from '../core/rng.js';
import { log } from './log.js';

export const NAME_MIN = 2;
export const NAME_MAX = 32;
export const IDENTITY_SCHEMA = 1;

// Validation commune à tous les noms saisis par le joueur.
// Espaces superflus supprimés, caractères de contrôle et chevrons retirés (aucun HTML possible), longueur bornée.
export function sanitizeName(raw, { min = NAME_MIN, max = NAME_MAX } = {}) {
  if (typeof raw !== 'string') return { ok: false, reason: 'Nom invalide' };
  // eslint-disable-next-line no-control-regex
  const value = raw.normalize('NFC').replace(/[\u0000-\u001f\u007f-\u009f<>`{}\\]/g, '').replace(/\s+/g, ' ').trim();
  if (!value) return { ok: false, reason: 'Le nom ne peut pas être vide' };
  if ([...value].length < min) return { ok: false, reason: `Au moins ${min} caractères` };
  if ([...value].length > max) return { ok: false, reason: `Au plus ${max} caractères` };
  if (!/[\p{L}\p{N}]/u.test(value)) return { ok: false, reason: 'Le nom doit contenir au moins une lettre ou un chiffre' };
  return { ok: true, value };
}

export const defaultCastleName = (kingdomName) => {
  const k = sanitizeName(String(kingdomName || ''), { min: 1, max: NAME_MAX - 11 });
  return `Château de ${k.ok ? k.value : 'Cendrelande'}`;
};

// Noms médiévaux proposés pour les avant-postes, selon le terrain (grammaire déjà correcte, pas d'assemblage)
export const OUTPOST_NAMES = {
  forest: ['Bois-Sombre', 'Orée-aux-Loups', 'Futaie du Cerf', 'Sylve-Moussue', 'Clairière des Chênes', 'Bois-Joli', 'Fort des Fougères', 'Hallier-Vert'],
  mountain: ['Roc-de-Fer', 'Pic-Aigle', 'Crête des Brumes', 'Mont-Gris', 'Forteresse du Givre', 'Roche-Haute', 'Col du Corbeau', 'Aiguille-Noire'],
  hills: ['Butte-Venteuse', 'Tertre du Guet', 'Haut-Vignoble', 'Puy-Doré', 'Colline des Bergers', 'Mottes-Rousses', 'Tour du Coteau', 'Val-Pierreux'],
  plain: ['Champ-Doré', 'Val-Clair', 'Prairie des Blés', 'Bourg-Paisible', 'Ferme du Moulin', 'Pré-aux-Alouettes', 'Fort-Épi', 'Plaine-Haute'],
  river: ['Gué-aux-Saules', 'Port des Bateliers', 'Rive-Claire', 'Pont du Héron', 'Bief-Vert', 'Moulin-sur-Eau', 'Écluse-Vieille', 'Anse-Grise'],
  swamp: ['Marais-Noir', 'Tourbière des Feux-Follets', 'Fange-aux-Crapauds', 'Roselière-Brumeuse', 'Palud-Sombre', 'Saulaie des Brumes'],
  ruins: ['Vestiges de l’Aube', 'Colonnes Oubliées', 'Sanctuaire du Roi Perdu', 'Ruines des Échos', 'Arches-Brisées', 'Porte des Anciens'],
  snow: ['Givre-Blanc', 'Bastion des Neiges', 'Combe du Nord', 'Toundra-Glacée', 'Fort-Frimas', 'Col-Blanc'],
  ash: ['Cendres-Ardentes', 'Faille de la Fracture', 'Brasier-Noir', 'Cratère des Braises', 'Forge-Cendre', 'Tertre-Calciné'],
};
const ROMAN = ['II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];

// Nom par défaut, déterministe (graine + position) et unique parmi les avant-postes du royaume
export function defaultOutpostName(state, t) {
  const list = OUTPOST_NAMES[t.terrain] || OUTPOST_NAMES.plain;
  const taken = new Set(Object.values(state.territories || {}).filter((o) => o !== t && o.name).map((o) => o.name));
  const start = hashString(`${state.meta?.seed || 1}:${t.x}:${t.y}`) % list.length;
  for (let i = 0; i < list.length; i++) { const n = list[(start + i) % list.length]; if (!taken.has(n)) return n; }
  for (const r of ROMAN) for (let i = 0; i < list.length; i++) { const n = `${list[(start + i) % list.length]} ${r}`; if (!taken.has(n)) return n; }
  return `Avant-poste ${t.x}-${t.y}`;
}

export const outpostLabel = (t) => (t?.name ? t.name : t ? `Avant-poste (${t.x}, ${t.y})` : 'Avant-poste');

// Complète (sans rien écraser) l'identité d'une partie : nouvelle partie, migration ou import incomplet.
export function ensureIdentity(state) {
  const id = (state.identity && typeof state.identity === 'object' && !Array.isArray(state.identity)) ? state.identity : (state.identity = {});
  id.schema = IDENTITY_SCHEMA;
  if (typeof id.playerId !== 'string' || !id.playerId) id.playerId = uid('pl');
  if (typeof id.kingdomId !== 'string' || !id.kingdomId) id.kingdomId = uid('kd');
  if (typeof id.castleId !== 'string' || !id.castleId) id.castleId = uid('cs');
  const cn = sanitizeName(id.castleName);
  id.castleName = cn.ok ? cn.value : defaultCastleName(state.meta?.kingdomName);
  const usedIds = new Set();
  for (const t of Object.values(state.territories || {})) {
    if (!t || typeof t !== 'object') continue;
    if (typeof t.id !== 'string' || !t.id || usedIds.has(t.id)) t.id = uid('op');
    usedIds.add(t.id);
    const n = sanitizeName(t.name);
    t.name = n.ok ? n.value : null;
  }
  // Les noms par défaut sont attribués après coup pour garantir leur unicité
  for (const t of Object.values(state.territories || {})) if (t && typeof t === 'object' && !t.name) t.name = defaultOutpostName(state, t);
  return id;
}

export const KINGDOM_NAME_MAX = 28;
export function renameKingdom(state, raw, now = Date.now()) {
  const v = sanitizeName(raw, { max: KINGDOM_NAME_MAX });
  if (!v.ok) return v;
  if (state.meta.kingdomName === v.value) return { ok: false, reason: 'C’est déjà son nom' };
  const old = state.meta.kingdomName;
  state.meta.kingdomName = v.value;
  // Le château qui portait le nom par défaut suit le nouveau nom du royaume ; un nom choisi n'est jamais écrasé
  ensureIdentity(state);
  if (state.identity.castleName === defaultCastleName(old)) state.identity.castleName = defaultCastleName(v.value);
  log(state, 'info', `👑 Le royaume prend le nom de « ${v.value} ».`, now);
  return { ok: true, name: v.value };
}

export const castleName = (state) => state.identity?.castleName || defaultCastleName(state.meta?.kingdomName);

export function renameCastle(state, raw, now = Date.now()) {
  const v = sanitizeName(raw);
  if (!v.ok) return v;
  ensureIdentity(state);
  const old = state.identity.castleName;
  if (old === v.value) return { ok: false, reason: 'C’est déjà son nom' };
  state.identity.castleName = v.value;
  state.identity.castleRenamed = now;
  log(state, 'info', `🏰 Le château principal s’appelle désormais « ${v.value} ».`, now);
  return { ok: true, name: v.value };
}

// Avant-poste identifié par sa position (clé « x,y ») ou par son identifiant stable
export function findOutpost(state, ref) {
  const terr = state.territories || {};
  if (terr[ref]) return { key: ref, t: terr[ref] };
  for (const [k, t] of Object.entries(terr)) if (t?.id === ref) return { key: k, t };
  return null;
}

export function renameOutpost(state, ref, raw, now = Date.now()) {
  const f = findOutpost(state, ref);
  if (!f) return { ok: false, reason: 'Avant-poste introuvable' };
  const v = sanitizeName(raw);
  if (!v.ok) return v;
  if (f.t.name === v.value) return { ok: false, reason: 'C’est déjà son nom' };
  if (Object.values(state.territories).some((o) => o !== f.t && o.name === v.value)) return { ok: false, reason: 'Un autre avant-poste porte déjà ce nom' };
  const old = outpostLabel(f.t);
  f.t.name = v.value;
  f.t.renamed = now;
  log(state, 'info', `🚩 L’avant-poste « ${old} » est rebaptisé « ${v.value} ».`, now);
  return { ok: true, name: v.value };
}
