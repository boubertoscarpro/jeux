// Mystères archéologiques : chaque mystère commence par un indice (trouvé en explorant la carte ou en vidant des
// donjons). Trois fragments sont enfouis dans trois régions différentes ; l'indice ne donne qu'une zone, il faut
// explorer la carte pour localiser le site exact, puis y envoyer une équipe de fouille. Chaque fragment s'étudie
// (lecture rapide, étude approfondie ou cession à un collectionneur) ; une fois les trois réunis, une énigme se pose.
// La bonne réponse révèle un lieu unique (repère sur la carte), un bonus permanent et un plan de forge.
export const ARCHAEO_MIN_TH = 4;
export const CLUE_EVERY = { explored: 10, dungeons: 3 }; // premier indice : 10 lieux explorés ou 3 donjons vidés ; ×2, ×3… pour les suivants
export const CLUE_REST_H = 36; // délai minimal entre un mystère résolu et l'indice suivant
export const DIG = {
  cost: (th) => ({ gold: 80 + 30 * th, food: 120 + 20 * th }),
  minutes: (dist) => Math.round(20 + dist * 1.5),
  riskPerDanger: 0.2, maxRisk: 0.6, dangerRadius: 3,
};
export const STUDY = {
  quick: { name: 'Lecture rapide', icon: '📜', cost: { gold: 120 }, desc: 'Les érudits situent précisément le site suivant (la zone est révélée sur la carte).' },
  deep: { name: 'Étude approfondie', icon: '🔍', cost: { crystals: 2, gold: 80 }, desc: 'Écarte une mauvaise réponse de l’énigme finale.' },
  sell: { name: 'Céder au collectionneur', icon: '💎', cost: {}, gain: { gems: 6 }, desc: 'Un collectionneur vous offre 6 gemmes pour une copie. Aucune aide pour l’énigme.' },
};
export const RETRY_H = 4; // délai après une mauvaise réponse

export const MYSTERIES = {
  observatory: {
    name: 'L’Observatoire des Anciens', icon: '🔭', th: 4,
    clue: 'Une tablette de bronze couverte de cercles concentriques et de points évoque un lieu « où l’on lisait le ciel ».',
    fragments: [
      'Un anneau de bronze gradué, fendu en son centre : on y faisait passer la lumière des étoiles.',
      'Une inscription : « Le prêtre levait l’instrument à bout de bras et mesurait la hauteur de l’astre. »',
      'Un croquis : l’instrument tenait dans une main et pendait à un anneau de suspension.',
    ],
    riddle: 'Quel instrument les Anciens utilisaient-ils pour lire le ciel ?',
    answers: ['Un astrolabe', 'Un cadran solaire', 'Une longue-vue', 'Une clepsydre'], correct: 0,
    place: { name: 'Observatoire des Anciens', icon: '🔭' },
    reward: { mods: { 'research.speed': 0.05, vision: 1 }, res: { crystals: 15, gold: 800 }, plan: 'starAmulet', text: 'Recherche +5 %, portée des territoires +1' },
  },
  drownedForge: {
    name: 'La Forge engloutie', icon: '⚒️', th: 4,
    clue: 'Un marteau gravé d’une vague a été retrouvé dans des ruines : les récits parlent d’une forge « sous les eaux ».',
    fragments: [
      'Des scories vitrifiées : le feu brûlait au bord d’un lac, dans une salle à moitié inondée.',
      'Un registre de forgeron : « Ne jamais tremper la lame dans l’eau du lac, toujours dans l’eau froide de la source. »',
      'Une lame intacte après des siècles : son tranchant a été durci par un refroidissement brutal.',
    ],
    riddle: 'Quel secret faisait la solidité des lames de la Forge engloutie ?',
    answers: ['Le feu de dragon', 'La trempe à l’eau froide de source', 'Le bois ancien des soufflets', 'La poudre de cristal'], correct: 1,
    place: { name: 'Forge engloutie', icon: '⚒️' },
    reward: { mods: { 'craft.quality': 0.08 }, res: { steel: 120, rareOre: 8 }, plan: 'tidalBlade', text: 'Qualité de forge +8 %' },
  },
  firstGranary: {
    name: 'Le Grenier du premier roi', icon: '🌾', th: 5,
    clue: 'Une jarre scellée contient des grains vieux de plusieurs siècles, encore capables de germer.',
    fragments: [
      'Une fresque : des paysans versent le grain dans des silos creusés sous la colline.',
      'Un fragment de loi : « Chaque famille rendra au grenier le dixième de sa récolte, et le recevra au temps de la disette. »',
      'Des cendres mêlées au grain : on les y mêlait pour éloigner les charançons.',
    ],
    riddle: 'Comment le premier roi protégeait-il son peuple de la famine ?',
    answers: ['Par des razzias chez ses voisins', 'Par un impôt en or', 'Par un grenier commun alimenté par la dîme', 'Par la pêche en rivière'], correct: 2,
    place: { name: 'Grenier du premier roi', icon: '🌾' },
    reward: { mods: { 'prod.food': 0.06, 'prod.grain': 0.06 }, res: { food: 3000, grain: 400 }, plan: 'harvestSmock', text: 'Nourriture et grain +6 %' },
  },
  windShrine: {
    name: 'Le Sanctuaire des vents', icon: '🌬️', th: 6,
    clue: 'Un sifflet de pierre, percé de quatre trous, chante quand le vent souffle dessus.',
    fragments: [
      'Une stèle : quatre bornes, une par direction, guidaient les voyageurs vers le sanctuaire.',
      'Un récit de pèlerin : « J’ai suivi le chant des bornes et marché trois jours sans me perdre. »',
      'Une carte grossière : les bornes étaient reliées par des chemins pavés, entretenus par les prêtres.',
    ],
    riddle: 'Qu’offrait le Sanctuaire des vents aux voyageurs ?',
    answers: ['Un abri contre les tempêtes', 'Des chemins balisés par des bornes chantantes', 'Des chevaux frais', 'Une protection magique contre les loups'], correct: 1,
    place: { name: 'Sanctuaire des vents', icon: '🌬️' },
    reward: { mods: { 'march.speed': 0.08, 'caravan.speed': 0.08 }, res: { gold: 1500, silver: 20 }, plan: 'windBoots', text: 'Vitesse des marches et des caravanes +8 %' },
  },
  fractureArchive: {
    name: 'Les Archives de la Fracture', icon: '📚', th: 7,
    clue: 'Une page calcinée mentionne « le jour où la terre s’ouvrit » et un dépôt d’archives sauvé des flammes.',
    fragments: [
      'Un catalogue : les archives étaient rangées par siècles, dans des coffres de plomb.',
      'Un témoignage : « Les scribes ont emporté les coffres vers les trois tours avant que la terre ne s’ouvre. »',
      'Une clé de plomb portant trois tours gravées, et le mot « copies ».',
    ],
    riddle: 'Comment les archives ont-elles survécu à la Fracture ?',
    answers: ['Elles ont été enterrées sous le palais', 'Elles ont été recopiées et dispersées dans trois tours', 'Elles ont été confiées aux dragons', 'Elles n’ont pas survécu'], correct: 1,
    place: { name: 'Archives de la Fracture', icon: '📚' },
    reward: { mods: { 'research.speed': 0.06, 'hero.xp': 0.1 }, res: { crystals: 25, gold: 2000 }, plan: 'archivistCap', text: 'Recherche +6 %, expérience des héros +10 %' },
  },
};
export const MYSTERY_ORDER = Object.keys(MYSTERIES);
