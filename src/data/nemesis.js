// v15 — Némésis de la Brèche : chaque seigneur se souvient de vos assauts (données d'équilibrage).
// Logique : systems/nemesis.js. Rendu du portrait : ui/nemesisFace.js.
export const NEMESIS = {
  memoryWeight: 0.35, // poids d'un assaut mérité dans la mémoire (moyenne glissante des classes envoyées)
  halfLifeH: 24, // oubli : la mémoire perd la moitié de sa force en 24 h sans assaut
  focusFrom: 0.45, // une classe qui dépasse 45 % de vos troupes envoyées est « remarquée »
  bonusMax: 0.2, // renfort de contre-unités : au plus +20 % de la puissance de la garnison
  rampMeetings: 3, // pleine adaptation après 3 assauts mérités
  revengeLoot: 0.15, // vaincre un seigneur qui vous a déjà battu : +15 % de butin courant, il perd un titre
  maxScars: 4,
  maxTitles: 3,
};

// Cicatrices gagnées quand vous le battez (dans l'ordre, une par victoire méritée)
export const NEMESIS_SCARS = [
  { key: 'cheek', name: 'balafre à la joue' },
  { key: 'eye', name: 'œil crevé (bandeau)' },
  { key: 'ear', name: 'oreille tranchée' },
  { key: 'burn', name: 'brûlure au front' },
];

// Titres gagnés quand il vous bat : selon la classe dominante de l'armée vaincue
export const NEMESIS_TITLES = {
  cavalry: 'Brise-Cheval',
  ranged: 'Fléau des Archers',
  infantry: 'Faucheur de Fantassins',
  siege: 'Brûleur de Béliers',
  mixed: 'l’Invaincu',
};

// Classe de vos troupes → unité de la Brèche qui la contre (même table que l'adaptation existante, BREACH_COUNTERS)
export const NEMESIS_COUNTER_UNIT = { cavalry: 'breachWarden', ranged: 'breachLancer', infantry: 'breachArbalist', siege: 'breachLancer' };
export const COUNTER_PLURAL = { breachWarden: 'gardiens cuirassés', breachLancer: 'lanciers montés', breachArbalist: 'arbalétriers' };
export const CLASS_NAMES = { cavalry: 'cavaliers', ranged: 'tireurs', infantry: 'fantassins', siege: 'engins de siège' };
