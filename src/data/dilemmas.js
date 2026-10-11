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

// ───────── Événements liés à la situation du royaume (v9) ─────────
// need(state, h) : l'événement n'est proposé que s'il a du sens maintenant (marché construit, avant-poste exposé…).
// prepare(state, now) : contexte concret ({res}, {qty}, {gold}, {outpost}, {threat}) enregistré sur la décision.
// Coûts, risques et bénéfices sont annoncés dans chaque choix ; aucune perte importante sans avertissement.
Object.assign(DILEMMAS, {
  caravanArrives: {
    title: 'Une caravane fait halte', icon: '🐪', minTH: 2, weight: 5,
    need: (s, h) => h.market > 0,
    text: 'Une caravane de {town} s’arrête devant {castle}. Son maître propose de racheter votre surplus de {resName}, de vous vendre des marchandises rares, ou de vous confier une escorte.',
    choices: [
      { label: 'Vendre {qty} {resName} (×1,6 le prix normal : {gold} or)', fx: { sell: true, rep: { merchant: 5 } }, hint: 'Or immédiat, sans taxe du marché.' },
      { label: 'Acheter planches et cuir (350 or)', fx: { res: { gold: -350, planks: 80, leather: 25 } }, hint: '80 planches et 25 cuirs, utiles aux chantiers avancés et à l’armurerie.' },
      { label: 'Escorter la caravane jusqu’à {town}', fx: { res: { gold: 150 }, townRel: 5, rep: { merchant: 8 } }, hint: 'Petit paiement, relation avec la cité +5 et réputation marchande.' },
      { label: 'La laisser repartir', fx: {}, hint: 'Aucun effet.' },
    ], default: 3,
  },
  woodShortage: {
    title: 'Pénurie de bois dans la région', icon: '🪵', minTH: 2, weight: 4,
    need: (s) => (s.resources.wood || 0) >= 300,
    text: 'Un incendie a ravagé les forêts voisines : les cités s’arrachent le bois. C’est une belle occasion de vente… mais vos propres chantiers dépendent de vos réserves.',
    choices: [
      { label: 'Vendre {qty} bois aux cités (×2 le prix : {gold} or)', fx: { sell: true, ifLow: { res: 'wood', below: 400, buff: { name: 'Chantiers à court de bois', mods: { 'build.speed': -0.15 }, duration: 2 * 3600 } } }, hint: 'Beaucoup d’or. Attention : s’il vous reste moins de 400 bois, vos chantiers sont ralentis de 15 % pendant 2 h.' },
      { label: 'Constituer des réserves (300 or contre 450 bois)', fx: { res: { gold: -300, wood: 450 } }, hint: 'Vous achetez avant la flambée des prix.' },
      { label: 'Ne rien faire', fx: { buff: { name: 'Bois hors de prix', mods: { 'build.cost': 0.08 }, duration: 3 * 3600 } }, hint: 'Les constructions coûtent 8 % de plus pendant 3 h.' },
    ], default: 2,
  },
  scoutsRuins: {
    title: 'Des éclaireurs signalent des ruines', icon: '🏛️', minTH: 2, weight: 4,
    need: (s) => (s.army.scout || 0) > 0 || (s.stats.explored || 0) > 0,
    text: 'Vos éclaireurs reviennent, couverts de poussière : des ruines de l’Aube affleurent à quelques lieues de {castle}. Des pillards… ou pire, pourraient s’y terrer.',
    choices: [
      { label: 'Financer des fouilles (300 nourriture)', fx: { res: { food: -300 }, spawnRuin: { threat: 0.3, loot: { stone: 300, gold: 150 } }, rep: { explorer: 6 } }, hint: 'Premières trouvailles immédiates et ruines révélées sur la carte. 30 % de risque : les fouilles réveillent des gardiens (une crypte apparaît, sans attaquer).' },
      { label: 'Noter l’emplacement', fx: { spawnRuin: { threat: 0 } }, hint: 'Les ruines sont révélées sur la carte ; à vous de les nettoyer plus tard.' },
      { label: 'Ignorer le rapport', fx: {}, hint: 'Aucun effet.' },
    ], default: 1,
  },
  factionOffer: {
    title: '{faction} propose un accord', icon: '🤝', minTH: 3, weight: 4, faction: true,
    need: (s, h, f) => f && f.stance !== 'war',
    text: 'Un envoyé de {faction} se présente à {castle} avec deux propositions : un présent immédiat contre votre neutralité, ou un accord de travail qui engagerait l’avenir.',
    choices: [
      { label: 'Accepter le présent (+600 or)', fx: { res: { gold: 600 }, relation: 2 }, hint: 'Récompense immédiate, relation presque inchangée.' },
      { label: 'Conclure un accord de travail', fx: { relation: 15, rep: { diplomat: 8 } }, hint: 'Relation +15 : pactes, alliances et moins de raids à terme.' },
      { label: 'Décliner poliment', fx: {}, hint: 'Aucun effet.' },
    ], default: 2,
  },
  outpostThreat: {
    title: 'Menace sur {outpost}', icon: '⚠️', minTH: 2, weight: 6,
    need: (s, h) => h.exposedOutpost !== null,
    text: 'Des sentinelles aperçoivent {threat} près de l’avant-poste « {outpost} » (garnison {garrison}/{need}). Ils attaqueront dans environ 2 heures. Comment organisez-vous la défense ?',
    choices: [
      { label: 'Engager des mercenaires ({gold} or)', fx: { outpostHire: true }, hint: 'Des lanciers rejoignent la garnison jusqu’au niveau requis.' },
      { label: 'Envoyer des troupes du château', fx: { outpostReinforce: true }, hint: 'Les lanciers, épéistes et archers disponibles en ville complètent la garnison.' },
      { label: 'Évacuer les réserves', fx: { outpostEvac: true }, hint: 'Production suspendue 3 h, mais aucun or ne peut être pillé.' },
      { label: 'Laisser la garnison se débrouiller', fx: {}, hint: 'Risque de pillage : production arrêtée 3 h et or volé en cas de défaite.' },
    ], default: 3,
  },
});

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
