// v20 « Ma forteresse » — Terres lointaines : trois contrées extrêmes, chacune tenue par un comptoir fortifié bâti à
// partir d'un avant-poste existant. Elles produisent modestement une ressource rare qui existe déjà (aucune monnaie
// nouvelle, aucune production de masse) et subissent des menaces plus dures que les avant-postes ordinaires.
export const FARLANDS = {
  glacier: {
    name: 'Les Neiges Hautes', icon: '🏔️', th: 15, res: 'crystals', terrain: 'snow',
    desc: 'Des champs de glace bleue où affleurent des cristaux. Le froid use les garnisons.',
    threat: { name: 'Meute des glaces', units: { wolf: 10, troll: 1 } },
  },
  desert: {
    name: 'Les Dunes Rousses', icon: '🏜️', th: 20, res: 'gems', terrain: 'plain',
    desc: 'Un désert de sable rouge où les caravanes perdues ont laissé des gemmes.',
    threat: { name: 'Pillards des sables', units: { bandit: 10, banditRider: 6, banditArcher: 4 } },
  },
  volcano: {
    name: 'Le Mont Ardent', icon: '🌋', th: 25, res: 'rareOre', terrain: 'ash',
    desc: 'Les pentes d’un volcan endormi, riches en minerai rare.',
    threat: { name: 'Golems de lave', units: { golem: 2, skeleton: 6 } },
  },
};
export const FARLAND_ORDER = ['glacier', 'desert', 'volcano'];

export const FAR = {
  baseLevel: 3,          // niveau minimal de l'avant-poste qui sert de camp de base
  maxLevel: 5,           // niveau du comptoir
  maxWall: 5,            // niveau de la palissade du comptoir
  prodPerLevel: 0.6,     // ressource rare par heure et par niveau (soit 3/h au plus : modeste)
  garrisonPerLevel: 12,  // garnison conseillée
  threatEvery: [20, 32], // heures entre deux menaces (déterministe)
  threatScale: 0.18,     // force de la menace par niveau du comptoir
  wallDef: 0.12,         // défense par niveau de palissade
  haltHours: 6,          // production suspendue après une menace perdue (rien n'est détruit)
  catchUp: 4,            // menaces rattrapées au plus pendant une absence
  found: (i) => ({ gold: 15000 * (i + 1), stone: 6000 * (i + 1), food: 6000 * (i + 1) }),
  up: (lvl) => ({ gold: 6000 * lvl, stone: 4000 * lvl, iron: 1500 * lvl }),
  wall: (lvl) => ({ stone: 5000 * (lvl + 1), wood: 3000 * (lvl + 1) }),
};
