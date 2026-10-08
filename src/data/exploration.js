// Événements d'exploration. Un événement peut être immédiat (outcomes) ou proposer des choix.
// Effets possibles : res {r:[min,max]}, item {min}, lose (fraction d'unités perdues),
// fight {enemies, danger}, spawn (type de POI créé sur la case), xp, units {type: n}, reveal (rayon), mark (site marqué)
// danger: multiplicateur de difficulté selon la distance (géré par le système)

export const EXPLORE_EVENTS = {
  cache: {
    weight: 14, title: 'Cache de contrebandiers',
    text: 'Sous une souche creuse, vos éclaireurs trouvent une cache oubliée.',
    outcomes: [{ weight: 1, text: 'Vous rapportez son contenu.', effects: { res: { gold: [80, 250], iron: [40, 150], wood: [100, 300] } } }],
  },
  herbs: {
    weight: 10, title: 'Clairière aux simples',
    text: 'Une clairière couverte d’herbes médicinales rares.',
    outcomes: [{ weight: 1, text: 'Vos éclaireurs remplissent leurs besaces.', effects: { res: { herbs: [30, 90] } } }],
  },
  crypt: {
    weight: 8, title: 'Une ancienne crypte',
    text: 'Vous trouvez une ancienne crypte. Des murmures montent des profondeurs…',
    choices: [
      { label: 'Entrer immédiatement', hint: 'Risqué mais rapide',
        outcomes: [
          { weight: 45, text: 'Un trésor funéraire intact !', effects: { res: { gold: [300, 800], silver: [3, 10] }, item: { min: 'common' } } },
          { weight: 35, text: 'Des squelettes se lèvent. Vos éclaireurs fuient en laissant des leurs.', effects: { lose: 0.5, res: { gold: [50, 150] } } },
          { weight: 20, text: 'Un piège ! Le plafond s’effondre.', effects: { lose: 0.8 } },
        ] },
      { label: 'Envoyer des éclaireurs', hint: 'Plus long, révèle les dangers',
        outcomes: [
          { weight: 60, text: 'Les éclaireurs cartographient la crypte : elle est gardée. Vous pourrez y revenir avec une armée.', effects: { spawn: 'crypt', scouted: true, xp: 40 } },
          { weight: 40, text: 'Les éclaireurs trouvent un passage secret vers une salle au trésor.', effects: { res: { gold: [200, 500], gems: [1, 2] }, xp: 60 } },
        ] },
      { label: 'Revenir plus tard avec une armée', hint: 'Marque le site sur la carte',
        outcomes: [{ weight: 1, text: 'Le site est marqué sur votre carte.', effects: { spawn: 'crypt' } }] },
    ],
  },
  village: {
    weight: 9, title: 'Hameau en ruine',
    text: 'Un hameau abandonné. Quelques survivants se cachent dans une grange.',
    choices: [
      { label: 'Les accueillir dans votre royaume', hint: 'Recrues gratuites',
        outcomes: [
          { weight: 70, text: 'Les survivants rejoignent vos rangs.', effects: { units: { spearman: [3, 8], archer: [0, 4] } } },
          { weight: 30, text: 'Ce sont des brigands déguisés ! Ils volent vos provisions.', effects: { lose: 0.3, res: { food: [-200, -80] } } },
        ] },
      { label: 'Fouiller les maisons', hint: 'Ressources',
        outcomes: [{ weight: 1, text: 'Vous récupérez outils et provisions.', effects: { res: { wood: [150, 400], food: [100, 300], iron: [30, 100] } } }] },
    ],
  },
  ambush: {
    weight: 7, title: 'Embuscade !',
    text: 'Des bandits surgissent des fourrés !',
    choices: [
      { label: 'Combattre', hint: 'Combat contre des bandits',
        outcomes: [{ weight: 1, text: 'Le combat s’engage.', effects: { fight: { bandit: 4, banditArcher: 2 } } }] },
      { label: 'Fuir', hint: 'Perdre une partie des éclaireurs',
        outcomes: [
          { weight: 60, text: 'Vous semez vos poursuivants.', effects: { lose: 0.15 } },
          { weight: 40, text: 'La fuite tourne mal.', effects: { lose: 0.45 } },
        ] },
      { label: 'Négocier (100 or)', hint: 'Payer pour passer', cost: { gold: 100 },
        outcomes: [{ weight: 1, text: 'Les bandits empochent l’or et vous laissent passer. L’un d’eux vous indique leur camp…', effects: { spawn: 'banditCamp', scouted: true } }] },
    ],
  },
  merchant: {
    weight: 6, title: 'Marchand ambulant',
    text: 'Un marchand ambulant vous propose une babiole « ayant appartenu à un roi ».',
    choices: [
      { label: 'Acheter (250 or)', hint: 'Objet aléatoire', cost: { gold: 250 },
        outcomes: [
          { weight: 70, text: 'L’objet est authentique !', effects: { item: { min: 'rare' } } },
          { weight: 30, text: 'C’est du toc. Le marchand a disparu.', effects: {} },
        ] },
      { label: 'Ignorer', hint: '', outcomes: [{ weight: 1, text: 'Vous poursuivez votre route.', effects: {} }] },
    ],
  },
  shrine: {
    weight: 5, title: 'Autel de cristal',
    text: 'Un autel de l’ancien Empire pulse d’une lumière bleutée.',
    choices: [
      { label: 'Prier', hint: 'Bénédiction ?',
        outcomes: [
          { weight: 60, text: 'Une douce chaleur envahit vos troupes. (+15% production pendant 1 h)', effects: { buff: { mods: { 'prod.all': 0.15 }, duration: 3600, name: 'Bénédiction de l’Aube' } } },
          { weight: 40, text: 'Rien ne se passe.', effects: { xp: 20 } },
        ] },
      { label: 'Extraire les cristaux', hint: 'Cristaux, mais risque',
        outcomes: [
          { weight: 65, text: 'Vous détachez quelques éclats.', effects: { res: { crystals: [2, 6] } } },
          { weight: 35, text: 'L’autel explose en une gerbe d’énergie.', effects: { lose: 0.4, res: { crystals: [1, 2] } } },
        ] },
    ],
  },
  ruins: {
    weight: 6, title: 'Vestiges de l’Aube',
    text: 'Les restes d’une bibliothèque impériale. Des parchemins jonchent le sol.',
    outcomes: [
      { weight: 60, text: 'Vous récupérez des parchemins précieux (recherche en cours accélérée de 10 min).', effects: { research: 600, xp: 50 } },
      { weight: 40, text: 'Un artefact repose sur un piédestal.', effects: { item: { min: 'rare' }, xp: 50 } },
    ],
  },
  wolves: {
    weight: 6, title: 'Meute affamée',
    text: 'Une meute de loups vous encercle.',
    outcomes: [{ weight: 1, text: 'Il faut se battre !', effects: { fight: { wolf: 5 } } }],
  },
  deposit: {
    weight: 7, title: 'Gisement inconnu',
    text: 'Vos éclaireurs repèrent un gisement prometteur.',
    outcomes: [
      { weight: 50, text: 'Un filon de fer affleure.', effects: { spawn: 'ironNode' } },
      { weight: 30, text: 'Une veine d’argent scintille.', effects: { spawn: 'silverNode' } },
      { weight: 20, text: 'Une grotte de cristaux !', effects: { spawn: 'crystalNode' } },
    ],
  },
  nothing: {
    weight: 10, title: 'Terres silencieuses',
    text: 'Le vent siffle sur une lande déserte.',
    outcomes: [{ weight: 1, text: 'Vos éclaireurs cartographient la zone.', effects: { xp: 15, reveal: 1 } }],
  },
  wanderer: {
    weight: 3, title: 'Voyageur blessé',
    text: 'Un voyageur blessé gît au bord du chemin. Il porte un blason inconnu.',
    choices: [
      { label: 'Le soigner (30 herbes)', hint: 'Il pourrait vous rejoindre', cost: { herbs: 30 },
        outcomes: [
          { weight: 55, text: 'Reconnaissant, il vous jure fidélité : un nouveau héros !', effects: { hero: true } },
          { weight: 45, text: 'Il vous remet une carte avant de partir.', effects: { reveal: 3, spawn: 'gemNode' } },
        ] },
      { label: 'Le détrousser', hint: 'Honte…', outcomes: [{ weight: 1, text: 'Vous trouvez quelques pièces.', effects: { res: { gold: [40, 120] } } }] },
    ],
  },
};
