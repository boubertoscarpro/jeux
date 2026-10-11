// Chroniques du monde : histoires à plusieurs étapes qui naissent de l'état RÉEL du monde (une faction trop
// puissante, une guerre en cours, un pacte qui se fissure, une rancune tenace, une route menacée, des ruines
// convoitées) et qui le modifient en retour (armées, territoires, guerres, pactes, souvenirs des factions).
// Format identique aux sagas (data/sagas.js) ; `world` décrit les effets sur le monde, `memory` les souvenirs.
// Les chroniques sont rejouables après un délai (cooldownH) si la situation se présente de nouveau.
// Placeholders : {town}, {faction}, {faction2}, {grievance}.
export const CHRONICLES = {
  overreach: {
    title: 'L’ombre de {faction}', icon: '🏴', minTH: 4, cooldownH: 48, chronicle: true,
    steps: {
      start: {
        title: '{faction} s’étend à marche forcée', text: '{faction} a doublé ses frontières en quelques saisons et ses colonnes longent maintenant les terres de {faction2}. Les chancelleries s’agitent : chacun attend de voir ce que fera votre royaume.',
        choices: [
          { label: 'Former une coalition avec {faction2}', hint: '{faction2} s’en souviendra ; {faction} beaucoup moins.', fx: { memory: { f2: 12, f: -10 }, world: { armyF2: 0.15 } }, next: ['coalition', 90] },
          { label: 'Négocier avec {faction} (600 or)', hint: 'Acheter la paix… pour l’instant.', fx: { res: { gold: -600 }, memory: { f: 10, f2: -8 } }, next: ['appeasement', 90] },
          { label: 'Rester à l’écart', hint: 'Laisser les puissants régler leurs affaires.', fx: {}, next: ['expansion', 120] },
        ], default: 2,
      },
      coalition: {
        title: 'La coalition contre {faction}', text: 'Vos émissaires et ceux de {faction2} ont tenu conseil. Faut-il frapper {faction} tant qu’elle est dispersée ?',
        choices: [
          { label: 'Lancer une offensive commune', hint: 'Combat ; en cas de victoire, {faction} perd des troupes et des régions au profit de {faction2}.', fx: { fight: { guard: 10, royalArcher: 6 }, win: { world: { armyF: -0.2, territoryToF2: 3 }, memory: { f: -12, f2: 10 }, rep: { warrior: 12 } } } },
          { label: 'Garder la coalition défensive', hint: 'Défense de la ville +10 % pendant 12 h ; personne n’est humilié.', fx: { buff: { name: 'Coalition défensive', mods: { 'city.def': 0.1 }, duration: 12 * 3600 }, memory: { f2: 4 } } },
        ], default: 1,
      },
      appeasement: {
        title: 'Les exigences de {faction}', text: '{faction} a accepté vos présents… et réclame maintenant un droit de passage pour ses armées à travers vos terres.',
        choices: [
          { label: 'Accorder le passage', hint: 'La paix avec {faction}, mais {faction2} se sent trahie.', fx: { world: { armyF: 0.1 }, memory: { f: 10, f2: -14 }, res: { gold: 300 } } },
          { label: 'Refuser fermement', hint: '{faction} ravale sa fierté… pour l’instant.', fx: { memory: { f: -10 }, rep: { lord: 8 } } },
        ], default: 1,
      },
      expansion: {
        title: '{faction2} recule', text: '{faction} a arraché des régions entières à {faction2}. Des colonnes de réfugiés approchent de vos frontières.',
        choices: [
          { label: 'Accueillir les réfugiés de {faction2}', hint: '+3 ouvriers (si logement), 400 nourriture ; {faction2} vous en sera reconnaissante.', fx: { world: { territoryToF: 2 }, res: { food: -400 }, workers: 3, memory: { f2: 10 }, rep: { benefactor: 10 } } },
          { label: 'Commercer avec le vainqueur', hint: 'Caravanes +10 % pendant 24 h.', fx: { world: { territoryToF: 2 }, memory: { f: 6, f2: -6 }, buff: { name: 'Marchés du vainqueur', mods: { 'caravan.gain': 0.1 }, duration: 24 * 3600 } } },
        ], default: 1,
      },
    },
  },
  factionWar: {
    title: 'La guerre de {faction} et de {faction2}', icon: '⚔️', minTH: 4, cooldownH: 36, chronicle: true,
    steps: {
      start: {
        title: 'Deux royaumes en guerre', text: 'La guerre fait rage entre {faction} et {faction2}. Les deux camps envoient des émissaires à votre cour : chacun réclame votre aide.',
        choices: [
          { label: 'Soutenir {faction} (300 fer, 300 or)', hint: '{faction} se renforce, {faction2} vous en voudra.', fx: { res: { iron: -300, gold: -300 }, world: { armyF: 0.15, armyF2: -0.1 }, memory: { f: 15, f2: -15 } }, next: ['victory', 120] },
          { label: 'Soutenir {faction2} (300 fer, 300 or)', hint: '{faction2} se renforce, {faction} vous en voudra.', fx: { res: { iron: -300, gold: -300 }, world: { armyF2: 0.15, armyF: -0.1, swap: true }, memory: { f2: 15, f: -15 } }, next: ['victory', 120] },
          { label: 'Proposer une médiation', hint: 'Fin de la guerre ; réputation de diplomate.', fx: { world: { warEnd: true }, memory: { f: 6, f2: 6 }, rep: { diplomat: 15 } } },
          { label: 'Vendre des armes aux deux camps', hint: '+800 or ; chacun vous méprise un peu.', fx: { res: { gold: 800 }, memory: { f: -5, f2: -5 }, rep: { merchant: 8 } } },
        ], default: 2,
      },
      victory: {
        title: 'Le soutien porte ses fruits', text: '{faction}, que vous avez soutenue, prend l’avantage. Son souverain vous propose de partager les fruits de la victoire.',
        choices: [
          { label: 'Réclamer une part du butin', hint: 'Or et fer.', fx: { world: { territoryToF: 3, warEnd: true }, res: { gold: 900, iron: 300 } } },
          { label: 'Demander un pacte durable', hint: 'Relation +15 et souvenir durable.', fx: { world: { territoryToF: 3, warEnd: true }, relation: 15, memory: { f: 12 } } },
        ], default: 1,
      },
    },
  },
  allianceStrain: {
    title: 'Un pacte qui se fissure', icon: '🪢', minTH: 3, cooldownH: 48, chronicle: true,
    steps: {
      start: {
        title: 'Les plaintes de {faction}', text: 'Les marchands de {faction} se plaignent de vos tarifs et de vos patrouilles. Leur conseil parle ouvertement de rompre le pacte.',
        choices: [
          { label: 'Concessions commerciales (500 or)', hint: 'Le pacte en sort renforcé.', fx: { res: { gold: -500 }, memory: { f: 15 } } },
          { label: 'Rappeler les accords signés', hint: 'Le conseil de {faction} votera bientôt.', fx: { memory: { f: 4 }, rep: { diplomat: 5 } }, next: ['vote', 90] },
          { label: 'Laisser le pacte s’éteindre', hint: 'Fin du pacte ; {faction} s’en souviendra.', fx: { world: { breakPact: true }, memory: { f: -10 } } },
        ], default: 1,
      },
      vote: {
        title: 'Le vote du conseil de {faction}', text: 'Le conseil de {faction} se réunit. Vos soutiens y attendent un geste visible.',
        choices: [
          { label: 'Envoyer un présent (5 gemmes)', hint: 'Le pacte est maintenu.', fx: { res: { gems: -5 }, memory: { f: 12 } } },
          { label: 'Ne rien faire', hint: 'Le pacte risque d’être rompu.', fx: { world: { breakPact: true }, memory: { f: -8 } } },
        ], default: 1,
      },
    },
  },
  grudgeUltimatum: {
    title: 'L’ultimatum de {faction}', icon: '📯', minTH: 3, cooldownH: 72, chronicle: true,
    steps: {
      start: {
        title: 'Le héraut de {faction}', text: '{faction} n’a pas oublié : « {grievance} ». Son héraut exige réparation devant toute votre cour, faute de quoi ce sera la guerre.',
        choices: [
          { label: 'Payer réparation (1 000 or)', hint: 'La rancune s’apaise nettement.', fx: { res: { gold: -1000 }, memory: { f: 25 } } },
          { label: 'Céder l’avant-poste le plus proche de ses terres', hint: 'Vous perdez un avant-poste ; la rancune s’efface presque.', fx: { world: { cedeOutpost: true }, memory: { f: 30 } } },
          { label: 'Proposer un duel des champions', hint: 'Votre meilleur héros affronte leur champion.', fx: { duel: true, memory: { f: 5 } } },
          { label: 'Refuser', hint: '{faction} vous déclare la guerre.', fx: { world: { declareWar: true }, memory: { f: -10 }, rep: { warrior: 5 } } },
        ], default: 3,
      },
    },
  },
  banditRoad: {
    title: 'Les coupe-jarrets de la route de {town}', icon: '🗡️', minTH: 3, cooldownH: 36, chronicle: true,
    steps: {
      start: {
        title: 'Une route menacée', text: 'Des bandits rançonnent les marchands sur la route qui mène à {town}. Les caravaniers refusent de partir sans protection.',
        choices: [
          { label: 'Envoyer la garnison les déloger', hint: 'Combat ; la route redevient sûre.', fx: { fight: { bandit: 10, banditArcher: 5 }, win: { townRel: 6, rep: { lord: 8 }, res: { gold: 300 } } } },
          { label: 'Payer une escorte de mercenaires (400 or)', hint: 'Risque des convois −30 % pendant 24 h.', fx: { res: { gold: -400 }, buff: { name: 'Escorte de mercenaires', mods: { 'convoy.risk': -0.3 }, duration: 24 * 3600 } } },
          { label: 'Ignorer', hint: 'Les bandits pourraient s’installer.', fx: { buff: { name: 'Route peu sûre', mods: { 'caravan.gain': -0.1 }, duration: 12 * 3600 } }, next: ['camp', 120] },
        ], default: 2,
      },
      camp: {
        title: 'Un repaire sur la route de {town}', text: 'Les bandits se sont installés : un camp fortifié est apparu sur la route de {town}. Il est visible sur votre carte.',
        choices: [
          { label: 'Mettre le camp à prix', hint: 'Le camp reste à nettoyer vous-même ; la cité apprécie l’intention.', fx: { world: { spawnBandits: true }, townRel: 3 } },
          { label: 'Négocier un péage avec les bandits', hint: '+300 or, réputation de tyran.', fx: { world: { spawnBandits: true }, res: { gold: 300 }, rep: { tyrant: 8 }, townRel: -5 } },
        ], default: 0,
      },
    },
  },
  ruinRush: {
    title: 'La course aux ruines', icon: '🏛️', minTH: 4, cooldownH: 48, chronicle: true,
    steps: {
      start: {
        title: 'Des ruines intactes', text: 'Des bergers ont découvert des ruines intactes. {faction} et {faction2} y envoient déjà des éclaireurs.',
        choices: [
          { label: 'Envoyer vos propres fouilleurs (300 or, 300 nourriture)', hint: 'Vous arriverez peut-être les premiers.', fx: { res: { gold: -300, food: -300 } }, next: ['race', 60] },
          { label: 'Vendre la position à {faction}', hint: '+700 or ; {faction2} l’apprendra.', fx: { res: { gold: 700 }, memory: { f: 10, f2: -8 }, world: { armyF: 0.05 } } },
          { label: 'Prévenir {faction2}', hint: '{faction2} vous en saura gré.', fx: { memory: { f2: 12, f: -6 } } },
        ], default: 2,
      },
      race: {
        title: 'Face à face dans les ruines', text: 'Vos fouilleurs arrivent en même temps que les éclaireurs de {faction}.',
        choices: [
          { label: 'Partager la découverte', hint: 'Un fragment de relique, et l’estime de {faction}.', fx: { relicFragments: 1, memory: { f: 8 } } },
          { label: 'Les chasser', hint: 'Combat ; chance d’artefact.', fx: { fight: { guard: 8, royalArcher: 4 }, win: { artifactChance: 0.35, memory: { f: -12 }, relicFragments: 1 } } },
        ], default: 0,
      },
    },
  },
};
