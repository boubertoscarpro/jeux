// Armoiries de la dynastie (personnalisation purement cosmétique, gratuite : aucun bonus de puissance).
// Un blason = une partition de l'écu + deux couleurs (émaux) + une figure ; la bannière et le sceau en dérivent.
// Les bannières achetées avec des insignes (boutique cosmétique) ajoutent leur couleur aux émaux disponibles.

export const TINCTURES = {
  or:      { name: 'Or', color: '#d9b25a' },
  argent:  { name: 'Argent', color: '#e6e1d6' },
  gueules: { name: 'Gueules', color: '#a8322a' },
  azur:    { name: 'Azur', color: '#2f5f9e' },
  sinople: { name: 'Sinople', color: '#3f7a3a' },
  sable:   { name: 'Sable', color: '#26211c' },
  pourpre: { name: 'Pourpre', color: '#6d3b74' },
  tanne:   { name: 'Tanné', color: '#a2602c' },
  cendre:  { name: 'Cendre', color: '#7d7a76' },
  braise:  { name: 'Braise', color: '#d06a2a' },
};

// Partitions de l'écu (le second émail remplit la zone décrite)
export const FIELDS = {
  plain:    { name: 'Plein' },
  pale:     { name: 'Parti' },
  fess:     { name: 'Coupé' },
  bend:     { name: 'Tranché' },
  chevron:  { name: 'Chevron' },
  quarter:  { name: 'Écartelé' },
  cross:    { name: 'Croix' },
  bordure:  { name: 'Bordure' },
};

// Figures (dessins originaux, simples et lisibles à petite taille)
export const CHARGES = {
  none:     { name: 'Aucune' },
  tower:    { name: 'Tour' },
  stag:     { name: 'Cerf' },
  oak:      { name: 'Chêne' },
  anvil:    { name: 'Enclume' },
  wolf:     { name: 'Loup' },
  sun:      { name: 'Soleil' },
  key:      { name: 'Clé' },
  crescent: { name: 'Croissant' },
  wheat:    { name: 'Gerbe' },
  crown:    { name: 'Couronne' },
  flame:    { name: 'Flamme de la Fracture' },
  swords:   { name: 'Épées croisées' },
};

export const BANNER_SHAPES = { pennon: 'Pennon à pointe', swallow: 'Queue d’aronde', square: 'Gonfanon carré' };
export const SEAL_SHAPES = { round: 'Sceau rond', mandorla: 'Sceau en navette', shield: 'Sceau en écu' };

export const DEFAULT_HERALDRY = { field: 'pale', t1: 'or', t2: 'azur', charge: 'tower', banner: 'pennon', seal: 'round', motto: '' };
export const MOTTO_MAX = 40;
