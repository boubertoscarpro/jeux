// Choix et conséquences. fx : res, rep {axe: n}, relation (faction aléatoire concernée), townRel, vassal, workers, hero, artifact, buff, spawn, fight
export const DILEMMAS = {
  famineTown: {
    title: 'La faim à {town}', icon: '🍞', minTH: 2, weight: 6,
    text: 'Les émissaires de {town} implorent votre aide : leurs greniers sont vides. Ils demandent {food} nourriture.',
    choices: [
      { label: 'Donner la nourriture', fx: { res: { food: -1 }, rep: { benefactor: 25, lord: 5 }, townRel: 6 }, hint: 'Réputation de bienfaiteur, la cité vous en sera reconnaissante.' },
      { label: 'Refuser poliment', fx: {}, hint: 'Aucune conséquence… pour l’instant.' },
      { label: 'Exiger un paiement', fx: { res: { food: -1, gold: 2 }, rep: { merchant: 15, benefactor: -10 }, townRel: -2 }, hint: 'Or contre nourriture : réputation marchande.' },
      { label: 'Envoyer l’armée', fx: { vassal: true, rep: { tyrant: 30, warrior: 10 }, townRel: -20, needArmy: 40 }, hint: 'La cité devient vassale (tribut en or), mais vous passez pour un tyran. 40 soldats requis.' },
    ], default: 1,
  },
  refugees: {
    title: 'Réfugiés aux portes', icon: '🧳', minTH: 2, weight: 6,
    text: 'Une colonne de réfugiés fuyant la guerre se présente à vos portes.',
    choices: [
      { label: 'Les accueillir', fx: { workers: 4, res: { food: -300 }, rep: { benefactor: 15 } }, hint: '+4 ouvriers (si logement).' },
      { label: 'Ne prendre que les artisans', fx: { workers: 2, rep: { lord: 3 } }, hint: '+2 ouvriers qualifiés.' },
      { label: 'Les chasser', fx: { rep: { tyrant: 10, benefactor: -10 } }, hint: '' },
    ], default: 2,
  },
  banditOffer: {
    title: 'L’offre du Roi des Bandits', icon: '🏴', minTH: 3, weight: 4,
    text: 'Un émissaire masqué propose : « Payez-nous et nos lames épargneront vos caravanes. »',
    choices: [
      { label: 'Payer 800 or', fx: { res: { gold: -800 }, buff: { name: 'Protection des bandits', mods: { 'convoy.risk': -0.6 }, duration: 6 * 3600 }, rep: { merchant: 5 } }, hint: 'Convois −60% de risque pendant 6 h.' },
      { label: 'Refuser', fx: {}, hint: '' },
      { label: 'Tendre un piège', fx: { fight: { bandit: 15, banditArcher: 8, banditRider: 5 }, win: { res: { gold: 1500 }, rep: { warrior: 15 } } }, hint: 'Combat avec votre garnison.' },
    ], default: 1,
  },
  plague: {
    title: 'Fièvre des marais', icon: '🦠', minTH: 3, weight: 4,
    text: 'Une fièvre se répand chez vos ouvriers. Les herboristes réclament des herbes.',
    choices: [
      { label: 'Fournir 150 herbes', fx: { res: { herbs: -150 }, rep: { benefactor: 8 } }, hint: 'L’épidémie est enrayée.' },
      { label: 'Mettre en quarantaine', fx: { buff: { name: 'Quarantaine', mods: { 'prod.all': -0.1 }, duration: 3600 } }, hint: '−10% production pendant 1 h.' },
      { label: 'Ne rien faire', fx: { injureWorkers: 3, buff: { name: 'Épidémie', mods: { 'worker.morale': -20 }, duration: 2 * 3600 } }, hint: 'Ouvriers malades, moral en berne.' },
    ], default: 1,
  },
  monopoly: {
    title: 'Monopole du sel', icon: '🧂', minTH: 4, weight: 3,
    text: 'La guilde des marchands de {town} propose un monopole : payez maintenant, encaissez ensuite.',
    choices: [
      { label: 'Investir 2 000 or', fx: { res: { gold: -2000 }, buff: { name: 'Monopole du sel', mods: { 'prod.gold': 0.35 }, duration: 8 * 3600 }, rep: { merchant: 20 } }, hint: '+35% or pendant 8 h.' },
      { label: 'Décliner', fx: {}, hint: '' },
    ], default: 1,
  },
  duel: {
    title: 'Un défi chevaleresque', icon: '🤺', minTH: 3, weight: 3,
    text: 'Un champion de {faction} défie votre meilleur héros en duel singulier.',
    choices: [
      { label: 'Accepter le duel', fx: { duel: true }, hint: 'Victoire : réputation et relations ; défaite : humiliation.' },
      { label: 'Refuser', fx: { rep: { warrior: -5 }, relation: -5 }, hint: '' },
    ], default: 1,
  },
  tributeDemand: {
    title: 'Ultimatum de {faction}', icon: '📜', minTH: 4, weight: 3, faction: true,
    text: '{faction} exige un tribut de 1 500 or, faute de quoi ses armées marcheront sur vous.',
    choices: [
      { label: 'Payer', fx: { res: { gold: -1500 }, relation: 15 }, hint: 'La paix est préservée.' },
      { label: 'Refuser', fx: { relation: -25, rep: { warrior: 5 } }, hint: 'La guerre devient probable.' },
      { label: 'Déclarer la guerre', fx: { war: true, rep: { warrior: 10 } }, hint: '' },
    ], default: 1,
  },
};

// Événements secrets : extrêmement rares
export const SECRET_EVENTS = {
  meteorite: { title: 'Une étoile tombe', icon: '☄️', text: 'Une météorite s’écrase dans les Terres Brisées. Un cratère fumant contient un métal inconnu.', fx: { crater: true } },
  lostCity: { title: 'La cité perdue', icon: '🏯', text: 'Vos cartographes déchiffrent une carte ancienne : la cité perdue de l’Aube existe !', fx: { lostCity: true } },
  oldKing: { title: 'Le retour du vieux roi', icon: '👑', text: 'Un vieillard en haillons se présente : il affirme être le dernier roi de l’Aube et offre ses services.',
    choices: [
      { label: 'L’accueillir (20 gemmes)', fx: { res: { gems: -20 }, hero: 'mythic' }, hint: 'Héros mythique.' },
      { label: 'Le renvoyer', fx: { rep: { tyrant: 5 } }, hint: '' },
    ], default: 1 },
  door: { title: 'La porte mystérieuse', icon: '🚪', text: 'Une porte de pierre gravée est apparue au milieu d’un champ. Elle n’était pas là hier.',
    choices: [
      { label: 'L’ouvrir', fx: { gamble: { win: 0.55, artifact: true, curse: { name: 'Malédiction de la porte', mods: { 'prod.all': -0.2 }, duration: 6 * 3600 } } }, hint: 'Artefact… ou malédiction.' },
      { label: 'La murer', fx: { rep: { lord: 5 } }, hint: '' },
    ], default: 1 },
  wanderingMerchant: { title: 'Le marchand des étoiles', icon: '🌠', text: 'Un marchand venu « d’au-delà des cristaux » propose un unique objet.',
    choices: [
      { label: 'Acheter (6 000 or, 15 cristaux)', fx: { res: { gold: -6000, crystals: -15 }, artifact: true }, hint: 'Un artefact.' },
      { label: 'Décliner', fx: {}, hint: '' },
    ], default: 1 },
  villageHelp: { title: 'Le village des cendres', icon: '🔥', text: 'Un village assiégé par des créatures appelle à l’aide. Il n’a rien à offrir… sauf sa gratitude.',
    choices: [
      { label: 'Envoyer la garnison', fx: { fight: { wolf: 12, troll: 2 }, win: { rep: { benefactor: 40, warrior: 10 }, workers: 6, artifactChance: 0.2 } }, hint: 'Combat difficile.' },
      { label: 'Ignorer l’appel', fx: { rep: { benefactor: -10 } }, hint: '' },
    ], default: 1 },
};
