// v17 « Clair comme le jour » — Réglages d'accessibilité : valeurs par défaut sûres, modes de couleur des cartes.
export const A11Y_DEFAULTS = {
  textScale: 1,        // 0,9 à 1,5
  contrast: false,     // contraste élevé
  colorVision: 'none', // none | deut (deutéranopie) | prot (protanopie) | trit (tritanopie)
  font: 'default',     // default | readable (police plus lisible, sans empattement, déjà présente sur le système)
  weather: true,       // météo dessinée sur les cartes
  night: true,         // lumière du jour et de la nuit
  toastSec: 4,         // durée d'affichage des messages, en secondes (3 à 12)
  showNames: false,    // noms des bâtiments toujours affichés (vue normale)
  simple: false,       // mode « Simplifié »
};
export const TEXT_SCALES = [0.9, 1, 1.15, 1.3, 1.5];
export const TOAST_SECS = [3, 4, 6, 8, 12];
export const COLOR_VISION = { none: 'Couleurs normales', deut: 'Deutéranopie (vert)', prot: 'Protanopie (rouge)', trit: 'Tritanopie (bleu)' };
// Couleurs de sens sur les cartes et les jauges, par mode : bon, mauvais, attention, information, à moi, ennemi
// (palettes d'Okabe et Ito, distinguables dans chaque forme de daltonisme ; les formes et libellés restent toujours)
export const MAP_PALETTES = {
  none: { good: '#6fbf73', bad: '#e2574a', warn: '#e3a33a', info: '#6f9fc7', mine: '#e6c25a', foe: '#d0503f' },
  deut: { good: '#56b4e9', bad: '#e69f00', warn: '#f0e442', info: '#cc79a7', mine: '#f0e442', foe: '#d55e00' },
  prot: { good: '#56b4e9', bad: '#e69f00', warn: '#f0e442', info: '#cc79a7', mine: '#f0e442', foe: '#d55e00' },
  trit: { good: '#009e73', bad: '#d55e00', warn: '#cc79a7', info: '#e69f00', mine: '#cc79a7', foe: '#d55e00' },
};
// Modes présentés dans les captures (outil v17shots) : nom → réglages
export const A11Y_SHOWCASE = {
  contraste: { contrast: true },
  deuteranopie: { colorVision: 'deut' },
  protanopie: { colorVision: 'prot' },
  tritanopie: { colorVision: 'trit' },
  'texte-150': { textScale: 1.5 },
  'police-lisible': { font: 'readable' },
  simplifie: { simple: true },
  noms: { showNames: true },
};
