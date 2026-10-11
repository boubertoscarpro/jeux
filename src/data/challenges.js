// Défis de maîtrise : épreuves facultatives, à durée limitée, qui imposent une contrainte et récompensent la manière
// de jouer plutôt que la puissance. Trois paliers (bronze, argent, or) ; chaque palier ne rapporte qu'une fois par
// défi (insignes, titres, bannière), jamais de bonus permanent. Un défi peut être retenté pour améliorer son record.
export const CHALLENGE_MIN_TH = 4;
export const CHALLENGE_RETRY_H = 6;
export const TIERS = [
  { key: 'bronze', name: 'Bronze', icon: '🥉' },
  { key: 'silver', name: 'Argent', icon: '🥈' },
  { key: 'gold', name: 'Or', icon: '🥇' },
];

// metric : ce qui est mesuré (valeur, cibles par palier) ; rule : contrainte (une violation met fin à l'épreuve).
// scaled : la cible dépend du royaume au départ (production horaire, réserve de nourriture).
export const CHALLENGES = {
  autarky: {
    name: 'Autarcie', icon: '🏰', style: 'Économie', hours: 24,
    desc: 'Pendant 24 h, aucun échange extérieur : ni marché, ni caravane. Produisez autant que d’habitude… ou mieux.',
    rule: 'Aucun achat ni vente au marché, aucune caravane envoyée.',
    metric: 'Production de ressources de base pendant l’épreuve, comparée à votre production horaire au départ × 24.',
    targets: [1.0, 1.15, 1.3],
    rewards: [{ insignia: 2 }, { insignia: 4, title: 'Intendant autarcique' }, { insignia: 6, title: 'Seigneur qui ne doit rien à personne', banner: 'banner_mastery_stone' }],
  },
  scarcity: {
    name: 'L’année maigre', icon: '🌾', style: 'Survie', hours: 12,
    desc: 'Une maladie frappe les champs : production de nourriture −50 % pendant 12 h. Traversez la crise sans famine.',
    rule: 'Aucune famine pendant l’épreuve (sinon échec).',
    metric: 'Réserve de nourriture à la fin, comparée à celle du départ (au moins la moitié de la capacité du grenier).',
    targets: [0, 0.5, 1.0],
    rewards: [{ insignia: 2 }, { insignia: 4, title: 'Gardien des greniers' }, { insignia: 6, title: 'Celui qui nourrit le royaume', banner: 'banner_mastery_wheat' }],
  },
  discipline: {
    name: 'Campagne disciplinée', icon: '🎖️', style: 'Militaire', hours: 48, minTH: 5,
    desc: 'Remportez des opérations de campagne militaire sans former un seul nouveau soldat pendant 48 h.',
    rule: 'Aucune formation d’unité pendant l’épreuve.',
    metric: 'Opérations de campagne remportées.',
    targets: [1, 2, 3],
    rewards: [{ insignia: 2 }, { insignia: 4, title: 'Stratège économe' }, { insignia: 6, title: 'Maréchal de fer', banner: 'banner_mastery_steel' }],
  },
  peril: {
    name: 'Terres périlleuses', icon: '☠️', style: 'Exploration', hours: 24,
    desc: 'Nettoyez des lieux très dangereux (danger 3 ou plus) en 24 h.',
    rule: 'Aucune.',
    metric: 'Lieux dangereux (danger ≥ 3) nettoyés.',
    targets: [1, 3, 5], // un joueur actif en nettoie environ un par jour (simulation) : l'or demande un vrai effort
    rewards: [{ insignia: 2 }, { insignia: 4, title: 'Fléau des repaires' }, { insignia: 6, title: 'Pourfendeur des Terres Brisées', banner: 'banner_mastery_blood' }],
  },
  lightHand: {
    name: 'La main légère', icon: '🪶', style: 'Provinces', hours: 24, minOutposts: 2,
    desc: 'Toutes vos provinces sous impôts légers pendant 24 h : rendez-les prospères sans les pressurer.',
    rule: 'Toutes les provinces en impôts légers pendant l’épreuve ; aucune révolte.',
    metric: 'Stabilité moyenne des provinces à la fin.',
    targets: [65, 75, 85],
    rewards: [{ insignia: 2 }, { insignia: 4, title: 'Prince bienveillant' }, { insignia: 6, title: 'Père des provinces', banner: 'banner_mastery_ivory' }],
  },
  steadfast: {
    name: 'Cap tenu', icon: '🧭', style: 'Stratégie', hours: 24,
    desc: 'Accomplissez des missions du royaume sans changer de priorité royale pendant 24 h.',
    rule: 'Aucun changement de priorité royale pendant l’épreuve.',
    metric: 'Missions du royaume accomplies.',
    targets: [2, 4, 6],
    rewards: [{ insignia: 2 }, { insignia: 4, title: 'Souverain constant' }, { insignia: 6, title: 'Main de fer, cap de fer', banner: 'banner_mastery_bronze' }],
  },
};

// Bannières gagnées en maîtrise (cosmétiques, jamais achetables)
export const MASTERY_BANNERS = {
  banner_mastery_stone: { name: 'Bannière de Granit', color: '#7c7468' },
  banner_mastery_wheat: { name: 'Bannière des Moissons d’or', color: '#d1a93a' },
  banner_mastery_steel: { name: 'Bannière d’Acier', color: '#8fa2b6' },
  banner_mastery_blood: { name: 'Bannière Sang-de-Bœuf', color: '#7d1f1f' },
  banner_mastery_ivory: { name: 'Bannière d’Ivoire', color: '#e9dfc6' },
  banner_mastery_bronze: { name: 'Bannière de Bronze', color: '#a8723a' },
};
