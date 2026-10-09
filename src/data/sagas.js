// Sagas des Terres Brisées : chaînes de quêtes narratives à plusieurs étapes, avec choix politiques.
// Chaque étape réutilise le format des dilemmes (fx : res, rep, relation, relation2, townRel, workers, buff,
// fight/win, duel, gamble, relicFragments, reveal, research, chance). `next` : étape suivante et délai (minutes).
// {town}, {faction}, {faction2}, {food} sont remplacés à l'instanciation.
export const SAGAS = {
  famine: {
    title: 'La Longue Faim', icon: '🌾', minTH: 2,
    steps: {
      start: {
        title: 'La Longue Faim de {town}', text: 'Les récoltes de {town} ont pourri sur pied. Ses anciens viennent à genoux : « Seigneur, {food} nourriture sauverait nos enfants. »',
        choices: [
          { label: 'Donner la nourriture', hint: 'Bienfaiteur ; la cité s’en souviendra.', fx: { res: { food: -1 }, rep: { benefactor: 20 }, townRel: 6 }, next: ['gratitude', 60] },
          { label: 'La vendre au prix fort', hint: 'Or immédiat, mais rancœur.', fx: { res: { food: -1, gold: 2 }, rep: { merchant: 10, benefactor: -10 }, townRel: -3 }, next: ['anger', 60] },
          { label: 'Refuser', hint: 'Aucun coût… pour l’instant.', fx: {}, next: ['anger', 90] },
        ], default: 2,
      },
      gratitude: {
        title: 'La gratitude de {town}', text: 'Sauvée, {town} vous envoie une délégation. Que demandez-vous en retour ?',
        choices: [
          { label: 'Des bras pour vos ateliers', hint: '+3 ouvriers (si logement).', fx: { workers: 3 } },
          { label: 'La carte des anciens chemins', hint: 'Révèle une région lointaine.', fx: { reveal: true, rep: { explorer: 10 } } },
          { label: 'Un serment d’amitié', hint: 'Relation durable avec la cité.', fx: { townRel: 10, rep: { lord: 10 } } },
        ], default: 2,
      },
      anger: {
        title: 'La colère gronde à {town}', text: 'Des affamés de {town} se massent à vos portes, armés de fourches. Leurs meneurs exigent réparation.',
        choices: [
          { label: 'Verser des dédommagements (600 or)', hint: 'Le calme revient.', fx: { res: { gold: -600 }, townRel: 4, rep: { benefactor: 5 } } },
          { label: 'Disperser la foule', hint: 'Combat avec votre garnison ; réputation de tyran.', fx: { fight: { militia: 20, bandit: 6 }, win: { rep: { tyrant: 10 } }, townRel: -6 } },
          { label: 'Attendre que ça passe', hint: 'Troubles : −8 % de production pendant 4 h.', fx: { buff: { name: 'Troubles à la frontière', mods: { 'prod.all': -0.08 }, duration: 4 * 3600 } } },
        ], default: 2,
      },
    },
  },
  treaty: {
    title: 'Le traité douteux', icon: '📜', minTH: 3,
    steps: {
      start: {
        title: 'Un traité de {faction}', text: 'L’ambassadeur de {faction} propose un traité commercial très avantageux… un peu trop, peut-être.',
        choices: [
          { label: 'Signer sans discuter', hint: '+20 % de gains commerciaux 24 h, relation +12.', fx: { buff: { name: 'Traité de commerce', mods: { 'caravan.gain': 0.2 }, duration: 24 * 3600 }, relation: 12 }, next: ['clause', 120] },
          { label: 'Négocier chaque ligne (400 or)', hint: 'Traité sûr, gains modestes.', fx: { res: { gold: -400 }, relation: 6, rep: { diplomat: 12 }, buff: { name: 'Traité négocié', mods: { 'caravan.gain': 0.08 }, duration: 24 * 3600 } } },
          { label: 'Refuser', hint: 'Relation −8.', fx: { relation: -8 } },
        ], default: 2,
      },
      clause: {
        title: 'La clause cachée', text: 'Vos clercs découvrent une clause : {faction} peut installer des « observateurs » dans vos marchés. Ce sont des espions.',
        choices: [
          { label: 'Fermer les yeux', hint: 'La paix commerciale vaut bien quelques secrets (−800 or de fuites).', fx: { res: { gold: -800 }, relation: 5 } },
          { label: 'Expulser les espions', hint: 'Relation −20, mais votre autorité grandit.', fx: { relation: -20, rep: { lord: 12 } } },
          { label: 'Les retourner', hint: 'Chance selon votre réputation de diplomate : réseau d’informateurs… ou incident.', fx: { chance: { rep: 'diplomat', base: 0.35, per: 0.001, win: { rep: { diplomat: 15 }, buff: { name: 'Informateurs retournés', mods: { 'convoy.risk': -0.2, 'combat.atk': 0.03 }, duration: 24 * 3600 } }, lose: { relation: -25, rep: { diplomat: -10 } } } } },
        ], default: 0,
      },
    },
  },
  claimant: {
    title: 'Le noble revendicateur', icon: '⚜️', minTH: 4,
    steps: {
      start: {
        title: 'Sire Gondebaud réclame vos terres', text: 'Un noble déchu, Sire Gondebaud, brandit une charte jaunie : selon lui, vos terres de l’est lui reviennent. {faction} soutient sa cause.',
        choices: [
          { label: 'Le dédommager (1 500 or)', hint: 'Affaire close, mais vous paraissez faible.', fx: { res: { gold: -1500 }, rep: { lord: -5, diplomat: 5 } } },
          { label: 'Le défier en duel', hint: 'Votre meilleur héros affronte son champion.', fx: { duel: true } },
          { label: 'Porter l’affaire devant la cour', hint: 'Verdict dans 90 min ; dépend de votre réputation de seigneur.', fx: { rep: { lord: 5 } }, next: ['verdict', 90] },
        ], default: 2,
      },
      verdict: {
        title: 'Le verdict de la cour', text: 'Les juges ont délibéré sur la charte de Sire Gondebaud. Le royaume retient son souffle.',
        choices: [
          { label: 'Écouter le verdict', hint: 'Chance selon votre réputation de seigneur.', fx: { chance: { rep: 'lord', base: 0.45, per: 0.0015, win: { rep: { lord: 20 }, relation: 6, workers: 2 }, lose: { res: { gold: -2000 }, relation: -10, rep: { lord: -10 } } } } },
          { label: 'Acheter un juge (1 000 or)', hint: 'Victoire assurée… mais le bruit court.', fx: { res: { gold: -1000 }, rep: { tyrant: 15, lord: 10 } } },
        ], default: 0,
      },
    },
  },
  ruin: {
    title: 'La ruine oubliée', icon: '🏛️', minTH: 3,
    steps: {
      start: {
        title: 'Une ruine sous les racines', text: 'Vos bûcherons ont mis au jour une porte de pierre gravée aux armes de l’Empire de l’Aube, à demi enfouie.',
        choices: [
          { label: 'Forcer la porte', hint: '25 % : un artefact. Sinon, une malédiction.', fx: { gamble: { win: 0.25, curse: { name: 'Malédiction de l’Aube', mods: { 'prod.all': -0.1 }, duration: 6 * 3600 } } } },
          { label: 'Envoyer des érudits (500 or)', hint: 'Étude prudente ; résultats dans 2 h.', fx: { res: { gold: -500 } }, next: ['scholars', 120] },
          { label: 'Sceller la ruine', hint: 'Les anciens apprécieront votre respect.', fx: { rep: { benefactor: 8 } } },
        ], default: 2,
      },
      scholars: {
        title: 'Ce que les érudits ont trouvé', text: 'Les érudits reviennent, fébriles : la salle contenait une bibliothèque intacte et un reliquaire scellé.',
        choices: [
          { label: 'Publier leurs travaux', hint: '+15 % de vitesse de recherche 12 h et 30 min de recherche gagnées.', fx: { buff: { name: 'Savoirs de l’Aube', mods: { 'research.speed': 0.15 }, duration: 12 * 3600 }, research: 1800, rep: { lord: 5 } } },
          { label: 'Ouvrir le reliquaire', hint: '+1 fragment de relique (3 = un artefact au choix).', fx: { relicFragments: 1 } },
        ], default: 0,
      },
    },
  },
  general: {
    title: 'L’appel du général', icon: '🎖️', minTH: 4,
    steps: {
      start: {
        title: 'Un général de {faction} demande des renforts', text: 'Le général Aldebert de {faction} est encerclé par les hordes de {faction2}. Il implore votre aide avant l’assaut final.',
        choices: [
          { label: 'Envoyer vos soldats', hint: 'Combat contre l’avant-garde ; victoire : alliance renforcée et butin.', fx: { fight: { guard: 12, royalArcher: 10, royalKnight: 4 }, win: { relation: 18, relation2: -12, res: { gold: 1200, iron: 600 }, rep: { warrior: 15 } } }, next: ['aftermath', 60] },
          { label: 'Envoyer de l’or (1 000)', hint: 'Soutien discret : relation +8.', fx: { res: { gold: -1000 }, relation: 8, relation2: -4 } },
          { label: 'Rester neutre', hint: 'Relation −10 avec le demandeur.', fx: { relation: -10, relation2: 4 } },
        ], default: 2,
      },
      aftermath: {
        title: 'Après la bataille', text: 'Le général Aldebert vous rend visite, bras en écharpe. « Je vous dois la vie. Que puis-je vous offrir ? »',
        choices: [
          { label: 'Ses vétérans', hint: 'Des soldats aguerris rejoignent votre armée.', fx: { units: { swordsman: 25, crossbow: 15 } } },
          { label: 'Sa carte des forteresses', hint: 'Révèle une région et vos armées gagnent en assurance.', fx: { reveal: true, buff: { name: 'Plans de bataille', mods: { 'combat.atk': 0.08 }, duration: 12 * 3600 } } },
        ], default: 0,
      },
    },
  },
  relic: {
    title: 'La relique disputée', icon: '🏺', minTH: 5,
    steps: {
      start: {
        title: 'La Couronne d’Ambre', text: 'Vos éclaireurs ont trouvé la Couronne d’Ambre, relique sacrée que {faction} et {faction2} revendiquent toutes deux. Chacune promet sa reconnaissance… et sa colère.',
        choices: [
          { label: 'La remettre à {faction}', hint: 'Relation +20 avec elle, −15 avec {faction2}.', fx: { relation: 20, relation2: -15, rep: { diplomat: 8 } } },
          { label: 'La remettre à {faction2}', hint: 'Relation +20 avec elle, −15 avec {faction}.', fx: { relation: -15, relation2: 20, rep: { diplomat: 8 } } },
          { label: 'La garder', hint: '+2 fragments de relique, relations −8 avec les deux.', fx: { relicFragments: 2, relation: -8, relation2: -8, rep: { tyrant: 5 } } },
          { label: 'La détruire', hint: 'Personne ne l’aura : grande réputation de bienfaiteur.', fx: { rep: { benefactor: 20, lord: 5 } } },
        ], default: 2,
      },
    },
  },
};
