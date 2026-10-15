// Armoiries de la dynastie : validation et enregistrement (cosmétique uniquement, aucun effet de jeu).
import { TINCTURES, FIELDS, CHARGES, BANNER_SHAPES, SEAL_SHAPES, DEFAULT_HERALDRY, MOTTO_MAX } from '../data/heraldry.js';
import { COSMETICS } from '../data/social.js';

// Émaux disponibles : les 10 de base + les couleurs des bannières possédées (boutique d'insignes, défis de maîtrise)
export function tinctures(state) {
  const out = { ...TINCTURES };
  for (const [k, c] of Object.entries(COSMETICS)) if (c.type === 'banner' && state?.meta?.owned?.[k]) out['cos_' + k] = { name: c.name.replace(/^Bannière\s*/i, ''), color: c.color };
  return out;
}
export const colorOf = (state, k) => tinctures(state)[k]?.color || TINCTURES.or.color;

// Armoiries normalisées (valeurs inconnues ou invalides → valeurs par défaut)
export function heraldryOf(state) {
  const raw = state?.meta?.heraldry && typeof state.meta.heraldry === 'object' ? state.meta.heraldry : {};
  const h = { ...DEFAULT_HERALDRY, ...raw };
  const T = tinctures(state);
  if (!FIELDS[h.field]) h.field = DEFAULT_HERALDRY.field;
  if (!T[h.t1]) h.t1 = DEFAULT_HERALDRY.t1;
  if (!T[h.t2]) h.t2 = DEFAULT_HERALDRY.t2;
  if (!CHARGES[h.charge]) h.charge = DEFAULT_HERALDRY.charge;
  if (!BANNER_SHAPES[h.banner]) h.banner = DEFAULT_HERALDRY.banner;
  if (!SEAL_SHAPES[h.seal]) h.seal = DEFAULT_HERALDRY.seal;
  h.motto = String(h.motto ?? '').replace(/[<>]/g, '').slice(0, MOTTO_MAX);
  return h;
}

// Modifie une partie des armoiries ; la couleur principale devient aussi celle de la bannière du royaume
// (carte du monde, avant-postes, barre du haut)
export function setHeraldry(state, patch) {
  const next = heraldryOf({ ...state, meta: { ...state.meta, heraldry: { ...heraldryOf(state), ...patch } } });
  for (const [k, v] of Object.entries(patch)) if (k !== 'motto' && next[k] !== v) return { ok: false, reason: 'Choix indisponible' };
  state.meta.heraldry = next;
  state.meta.banner = colorOf(state, next.t1);
  return { ok: true };
}
