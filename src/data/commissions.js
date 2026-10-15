// Commandes prestigieuses d'artisans : ouvrages rares, en plusieurs étapes, qui donnent un usage aux ressources
// avancées et rares (acier, argent, gemmes, cristaux, minerai rare, bois ancien…).
// Chaque commande ne se réalise qu'UNE fois par dynastie : pas de récompense répétable à l'infini.
// Une seule commande à la fois. Chaque étape se paie au lancement puis demande un délai d'atelier ; certaines
// étapes exigent un exploit (« cond ») : battre un bastion de la Brèche, résoudre un mystère…
//
// commission : { name, icon, client, desc, req(s) → texte de blocage ou null, stages: [{ name, cost, hours, cond? }],
//                reward: { unique?, insignia?, relic?, relation?, rep?, speedups? }, rewardText }

const th = (s) => Object.values(s.city.buildings).find((b) => b.type === 'townhall')?.level || 0;
const lvl = (s, type) => Object.values(s.city.buildings).filter((b) => b.type === type).reduce((m, b) => Math.max(m, b.level), 0);
const friend = (s) => (s.factions || []).find((f) => f.stance === 'alliance' || f.stance === 'trade');

export const COMMISSIONS = {
  heroBlade: {
    name: 'Une lame pour le champion', icon: '🗡️', client: 'Votre héros le plus valeureux',
    desc: 'Le maître forgeron propose une lame d’apparat digne de votre meilleur commandant : acier trempé, garde incrustée d’argent, fil de minerai rare.',
    req: (s) => (lvl(s, 'forge') < 5 ? 'Forge niveau 5' : th(s) < 8 ? 'Hôtel de ville niveau 8' : null),
    stages: [
      { name: 'Cœur d’acier', cost: { steel: 300, coal: 400 }, hours: 2 },
      { name: 'Garde incrustée', cost: { silver: 30, gems: 10 }, hours: 2 },
      { name: 'Trempe au minerai rare', cost: { rareOre: 10, herbs: 80 }, hours: 1 },
    ],
    reward: { unique: 'championBlade', insignia: 2 }, rewardText: 'Lame d’apparat du champion (légendaire) + 2 insignes',
  },
  aegisRestore: {
    name: 'Restaurer l’Égide de l’Aube', icon: '🛡️', client: 'Le Collège des érudits',
    desc: 'Un bouclier brisé de l’ancien royaume a été retrouvé lors des fouilles. Le restaurer demande des cristaux, du bois ancien et une relique.',
    req: (s) => (!Object.keys(s.archaeo?.solved || {}).length ? 'Résolvez un mystère archéologique' : lvl(s, 'forge') < 4 ? 'Forge niveau 4' : null),
    stages: [
      { name: 'Étude des fragments', cost: { crystals: 20, gold: 3000 }, hours: 3 },
      { name: 'Âme de bois ancien', cost: { ancientWood: 15, cloth: 120 }, hours: 2 },
      { name: 'Consécration', cost: { gold: 2000 }, hours: 1, relic: 1 },
    ],
    reward: { unique: 'dawnAegis', insignia: 2 }, rewardText: 'Égide restaurée de l’Aube (légendaire) + 2 insignes',
  },
  championArmor: {
    name: 'Le harnois du vainqueur', icon: '🏴', client: 'Les vétérans de vos campagnes',
    desc: 'Une armure forgée dans l’acier des forteresses de la Brèche. Les armuriers attendent une preuve : la chute d’un bastion d’élite.',
    req: (s) => ((s.stats?.breachTierMax || 0) < 2 ? 'Battez une forteresse renforcée de la Brèche (palier 2)' : null),
    stages: [
      { name: 'Plates d’acier', cost: { steel: 500, leather: 200 }, hours: 3 },
      { name: 'Rivets d’argent', cost: { silver: 40, iron: 2000 }, hours: 2 },
      { name: 'Le trophée du bastion', cost: { gold: 4000 }, hours: 1, cond: (s) => ((s.stats?.breachTierMax || 0) >= 3 ? null : 'Battez un bastion d’élite de la Brèche (palier 3)') },
    ],
    reward: { unique: 'breachPlate', insignia: 3 }, rewardText: 'Harnois du vainqueur de la Brèche (légendaire) + 3 insignes',
  },
  allyChalice: {
    name: 'Un calice pour un allié', icon: '🏆', client: 'Une faction amie (pacte commercial ou alliance)',
    desc: 'Offrir un objet cérémoniel scelle durablement l’amitié entre deux couronnes. Les orfèvres demandent argent, gemmes et étoffes fines.',
    req: (s) => (friend(s) ? null : 'Un pacte commercial ou une alliance avec une faction'),
    stages: [
      { name: 'Coupe d’argent', cost: { silver: 50, gems: 15 }, hours: 2 },
      { name: 'Étoffes et cortège', cost: { cloth: 200, gold: 3000 }, hours: 1 },
    ],
    reward: { relation: 25, rep: { diplomat: 20 }, insignia: 3 }, rewardText: 'Relation +25 et souvenir durable avec la faction, réputation de diplomate +20, 3 insignes',
  },
  guildMasterpiece: {
    name: 'Le chef-d’œuvre de la guilde', icon: '⚒️', client: 'La guilde des maîtres artisans',
    desc: 'Les ateliers du royaume veulent prouver leur savoir-faire : armes de qualité, charpentes de siège et un sceau d’or.',
    req: (s) => (lvl(s, 'market') < 6 ? 'Marché niveau 6' : th(s) < 7 ? 'Hôtel de ville niveau 7' : null),
    stages: [
      { name: 'Armes de démonstration', cost: { weapons: 120, planks: 400 }, hours: 2 },
      { name: 'Charpentes de maître', cost: { frames: 40 }, hours: 2 },
      { name: 'Le sceau', cost: { gold: 5000, silver: 15 }, hours: 1 },
    ],
    reward: { unique: 'guildSeal', insignia: 2 }, rewardText: 'Sceau des maîtres artisans (épique) + 2 insignes',
  },
  explorerAstrolabe: {
    name: 'L’astrolabe des Terres Brisées', icon: '🧭', client: 'Vos cartographes',
    desc: 'Un instrument capable de lire les étoiles au-dessus des terres de cendre. Il faut avoir beaucoup voyagé pour en régler les cercles.',
    req: (s) => ((s.stats?.explored || 0) < 60 ? `Explorez 60 zones (actuellement ${s.stats?.explored || 0})` : null),
    stages: [
      { name: 'Cercles d’argent', cost: { silver: 20, crystals: 12 }, hours: 2 },
      { name: 'Alidade de bois ancien', cost: { ancientWood: 10, gold: 2000 }, hours: 1 },
    ],
    reward: { unique: 'astrolabe', insignia: 2 }, rewardText: 'Astrolabe des Terres Brisées (légendaire) + 2 insignes',
  },
  lineageCrown: {
    name: 'La couronne de la lignée', icon: '👑', client: 'La cour et les nobles',
    desc: 'Une couronne transmise d’une dynastie à l’autre. Les joailliers exigent un trésor considérable et un monument dynastique pour l’abriter.',
    req: (s) => (th(s) < 12 ? 'Hôtel de ville niveau 12' : !Object.values(s.city.buildings).some((b) => b.type === 'monument' && b.level >= 1) ? 'Un monument dynastique construit' : null),
    stages: [
      { name: 'Le trésor', cost: { gold: 20000, gems: 25 }, hours: 4 },
      { name: 'Les gemmes de la lignée', cost: { rareOre: 20, crystals: 20 }, hours: 4 },
    ],
    reward: { unique: 'lineageCrown', insignia: 5 }, rewardText: 'Couronne de la lignée (légendaire) + 5 insignes',
  },
  reliquary: {
    name: 'Le reliquaire des anciens', icon: '🏺', client: 'Les gardiens des archives',
    desc: 'Un coffret ouvragé pour conserver les trouvailles des expéditions légendaires. Il attire d’autres fragments de reliques.',
    req: (s) => (!Object.keys(s.legendary?.done || {}).length ? 'Terminez une expédition légendaire' : null),
    stages: [
      { name: 'Coffret d’argent', cost: { silver: 60, ancientWood: 8 }, hours: 3 },
      { name: 'Sceaux de cristal', cost: { crystals: 15, gold: 3000 }, hours: 2 },
    ],
    reward: { relic: 2, insignia: 3, speedups: { speed60: 1 } }, rewardText: '2 fragments de relique, 3 insignes, un sceau d’une heure',
  },
};
export const COMMISSION_ORDER = Object.keys(COMMISSIONS);
