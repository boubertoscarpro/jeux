// Ères du royaume et paliers de l'hôtel de ville (niveaux 1 à 30).
// Chaque niveau d'HdV relève le plafond de niveau des autres bâtiments (un bâtiment ne dépasse jamais l'HdV) ;
// les paliers ci-dessous ajoutent une vraie évolution, espacée pour garder un objectif à chaque étape.
export const ERAS = [
  { from: 1,  to: 5,  key: 'foundation', name: 'Fondation',           icon: '🪵', desc: 'Bâtir les premières maisons, les champs et la palissade.' },
  { from: 6,  to: 10, key: 'expansion',  name: 'Expansion',           icon: '🧭', desc: 'Avant-postes, chaînes de production et premières grandes campagnes.' },
  { from: 11, to: 15, key: 'royal',      name: 'Puissance royale',    icon: '👑', desc: 'Grands Projets, armées de métier, fondation d’une dynastie.' },
  { from: 16, to: 20, key: 'great',      name: 'Grande puissance',    icon: '🏰', desc: 'Bâtiments emblématiques au-delà du niveau 20, logistique d’empire.' },
  { from: 21, to: 25, key: 'imperial',   name: 'Ère impériale',       icon: '🦅', desc: 'Matériaux rares, grands chantiers de plusieurs jours, armées d’élite.' },
  { from: 26, to: 30, key: 'legacy',     name: 'Héritage légendaire', icon: '🌟', desc: 'Les derniers niveaux : un héritage qui marque le monde.' },
];
export const eraOf = (th) => ERAS.find((e) => th >= e.from && th <= e.to) || ERAS[ERAS.length - 1];

// Paliers de l'HdV au-delà du niveau 15 : effets réels (agrégés dans les effets de l'hôtel de ville) et textes
// affichés avant d'investir. Les niveaux 1 à 15 gardent leurs déblocages existants (bâtiments, projets, etc.).
export const TH_MILESTONES = {
  16: { text: 'Bâtiments emblématiques jusqu’au niveau 25 (selon l’HdV) · production +3 %', effects: { 'prod.all': 0.03 } },
  18: { text: '+1 marche simultanée', effects: { marches: 1 } },
  20: { text: '+1 file de construction · 3ᵉ Grand Projet du Royaume en parallèle', effects: { buildQueue: 1 } },
  22: { text: 'Stockage +10 %', effects: { 'storage.pct': 0.1 } },
  24: { text: '+1 emplacement de héros · formation +5 %', effects: { heroSlots: 1, 'train.speed': 0.05 } },
  26: { text: 'Production +5 %', effects: { 'prod.all': 0.05 } },
  28: { text: '+1 avant-poste', effects: { territories: 1 } },
  30: { text: 'Titre « Souverain légendaire » · défense de la ville +5 %', effects: { 'city.def': 0.05 }, title: 'Souverain légendaire' },
};
export function thMilestoneEffects(lvl) {
  const out = {};
  for (const [l, m] of Object.entries(TH_MILESTONES)) if (lvl >= +l) for (const [k, v] of Object.entries(m.effects)) out[k] = (out[k] || 0) + v;
  return out;
}

// Prérequis de l'HdV au-delà du niveau 15 (affichés dans la fiche avant d'investir ; une seule chaîne courte) :
//  - entrepôt au moins au niveau (L − 3) : il faut pouvoir stocker les coûts ;
//  - à partir de 21, donjon au moins (L − 6) ; à partir de 26, bibliothèque au moins (L − 6).
export function thRequirements(level) {
  const out = [];
  if (level >= 16) out.push({ type: 'warehouse', level: Math.min(25, level - 3) });
  if (level >= 21) out.push({ type: 'castle', level: level - 6 });
  if (level >= 26) out.push({ type: 'library', level: level - 6 });
  return out;
}
