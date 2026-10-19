// v19 « L'Art du siège » : protections, engins d'attaque et de défense, contres, limites, règles de la bataille par
// flancs, vagues et cour. La logique est dans systems/siege.js ; le moteur de chaque combat reste simulateBattle.

// ───────── Protections d'une place forte ─────────
// Muraille : gêne l'assaut des flancs ; porte : gêne l'assaut du front ; douves : gênent l'approche de tous les flancs.
// Pour le château du joueur, elles découlent des niveaux existants : la porte suit la muraille (même niveau), la herse
// renforcée l'améliore. Les valeurs sont des bonus de défense (0,3 = +30 %), comme l'ancien bonus de muraille.
export const PROTECTIONS = {
  wall: { name: 'Muraille', icon: '🧱', short: 'muraille' },
  gate: { name: 'Porte', icon: '🚪', short: 'porte' },
  moat: { name: 'Douves', icon: '🌊', short: 'douves' },
};
export const MOAT_PER_LEVEL = 0.04;
// Villes d'avant-poste (v16b) : leur muraille réduisait déjà la fréquence des menaces ; en v19 elle protège aussi au
// combat, modestement (une petite place a un seul front) : +3 % par niveau de muraille, +2 % par niveau de douves
export const OUTPOST_FORT = { wall: 0.03, moat: 0.02 }; // part de l'ancien bonus apportée par les douves (buildings.js : 0,04 par niveau)

// ───────── Engins ─────────
// Chaque engin agit sur un flanc ; son effet est dégressif : cap × (1 − e^(−n / k)) (le 50e rapporte bien moins que le
// 5e) et toujours borné. « counter » : ce qu'il contre ; « counteredBy » : ce qui le contre (il annule jusqu'à 80 %
// de son effet). Les coûts viennent des ressources existantes ; les durées sont par engin, en secondes.
export const ATTACK_ENGINES = {
  ladders: {
    name: 'Échelles', icon: '🪜', glyph: '⫼', workshop: 1, cost: { wood: 60, leather: 4 }, time: 40, flanks: ['left', 'right'],
    effect: { prot: 'wall', cap: 0.5, k: 10 }, counteredBy: 'stones',
    desc: 'Réduisent la protection de la muraille sur un flanc.',
  },
  ram: {
    name: 'Bélier', icon: '🐏', glyph: '⊳', workshop: 1, cost: { wood: 120, iron: 30, frames: 2 }, time: 80, flanks: ['front'],
    effect: { prot: 'gate', cap: 0.5, k: 8 }, counteredBy: 'pitch',
    desc: 'Réduit la protection de la porte, au front seulement (herse comprise).',
  },
  mantlets: {
    name: 'Mantelets', icon: '🛡️', glyph: '⌂', workshop: 3, cost: { wood: 80, leather: 10 }, time: 50, flanks: ['left', 'front', 'right'],
    effect: { neutralize: ['stones', 'pitch', 'hooks'], cap: 0.6, k: 8, defAtk: -0.1 }, counteredBy: 'archers',
    desc: 'Abritent les assaillants de ce qui tombe des remparts (pierres, poix, crochets) et du tir des défenseurs.',
  },
  fascines: {
    name: 'Fascines', icon: '🪵', glyph: '≋', workshop: 5, cost: { wood: 90, food: 30 }, time: 45, flanks: ['left', 'front', 'right'],
    effect: { prot: 'moat', cap: 0.6, k: 8 }, counteredBy: 'stakes',
    desc: 'Comblent les douves : réduisent leur protection sur un flanc.',
  },
  fireArrows: {
    name: 'Flèches incendiaires', icon: '🔥', glyph: '⇝', workshop: 7, cost: { wood: 30, coal: 20, cloth: 5 }, time: 35, flanks: ['left', 'front', 'right'],
    effect: { neutralize: ['stakes', 'portcullis'], cap: 0.6, k: 8 }, counteredBy: 'archers',
    desc: 'Incendient les défenses de bois : pieux et herse.',
  },
  tower: {
    name: 'Tour de siège', icon: '🗼', glyph: '▲', workshop: 10, cost: { wood: 400, steel: 40, leather: 30, frames: 6 }, time: 300, flanks: ['left', 'right'],
    effect: { prot: 'all', cap: 0.18, k: 2, neutralize: ['archers'], ncap: 0.5, atk: 0.02 }, counteredBy: 'hooks',
    desc: 'Ouvre une brèche partielle : réduit toutes les protections du flanc et domine les archères.',
  },
};
export const DEFENSE_ENGINES = {
  stones: {
    name: 'Pierres et rochers', icon: '🪨', glyph: '●', wall: 1, cost: { stone: 80 }, time: 25,
    effect: { counter: 'ladders', cap: 0.8, k: 8, def: 0.03 }, counteredBy: 'mantlets',
    desc: 'Contre les échelles ; un peu de défense en plus.',
  },
  pitch: {
    name: 'Poix bouillante', icon: '🫕', glyph: '◉', wall: 1, cost: { coal: 25, wood: 40 }, time: 35,
    effect: { counter: 'ram', cap: 0.8, k: 6, infantry: -0.1 }, counteredBy: 'mantlets',
    desc: 'Contre le bélier ; gêne l’infanterie au pied du mur.',
  },
  archers: {
    name: 'Archères renforcées', icon: '🏹', glyph: '✚', wall: 3, cost: { wood: 60, stone: 40 }, time: 40,
    effect: { counter: ['mantlets', 'fireArrows'], cap: 0.8, k: 8, atk: 0.05 }, counteredBy: 'tower',
    desc: 'Contrent les mantelets et les flèches incendiaires ; attaque des défenseurs en plus.',
  },
  stakes: {
    name: 'Pieux et chausse-trapes', icon: '🔱', glyph: '⋀', wall: 5, cost: { wood: 50, iron: 10 }, time: 30,
    effect: { counter: 'fascines', cap: 0.8, k: 8, cavalry: -0.2 }, counteredBy: 'fireArrows',
    desc: 'Contrent les fascines ; brisent les charges de cavalerie.',
  },
  portcullis: {
    name: 'Herse renforcée', icon: '⛓️', glyph: '#', wall: 8, cost: { iron: 120, steel: 15 }, time: 120, flanks: ['front'],
    effect: { gate: 0.25, k: 3 }, counteredBy: ['ram', 'fireArrows'],
    desc: 'Renforce la porte (au front) ; le bélier et le feu en viennent à bout.',
  },
  hooks: {
    name: 'Crochets et filets', icon: '🪝', glyph: '∫', wall: 10, cost: { iron: 40, cloth: 10 }, time: 45,
    effect: { counter: 'tower', cap: 0.8, k: 1.2 }, counteredBy: 'mantlets',
    desc: 'Contrent la tour de siège.',
  },
};
export const COUNTER_CAP = 0.8; // un contre annule au plus 80 % de l'effet d'un engin
export const NEUTRALIZE_CAP = 0.6;

// ───────── Limites, arsenal, vagues ─────────
export const SIEGE_RULES = {
  flanksAtWall: 5,               // muraille ≥ 5 : trois flancs et la cour ; avant : le front seul
  attackPerFlank: (workshop, mods) => 5 + 2 * workshop + (mods['siege.engines'] || 0),
  defensePerFlank: (wall) => 5 + 2 * wall,
  arsenal: { attack: (workshop) => 20 + 10 * workshop, defense: (wall) => 20 + 10 * wall },
  // Vagues : 1, +1 atelier niv. 5, +1 recherche « Ingénierie de siège », +1 commandant niv. 15 ou recherche « Trébuchet »
  maxWaves: 4,
  yardReinforce: 1,              // la réserve de la cour accourt aux flancs attaqués avant l'assaut
  idleShift: 0.8,                // les flancs qui ne sont pas attaqués envoient 80 % de leurs troupes aux flancs attaqués
  fallback: 1,                   // les défenseurs d'un flanc tenu se replient dans la cour (100 %)
  yardBonus: [0, 0.05, 0.12, 0.2], // attaque des assaillants dans la cour selon le nombre de flancs percés
  recoverWin: 0.4,               // engins d'attaque récupérés après un flanc percé
  defenseUsedHeld: 0.5,          // engins de défense consommés sur un flanc tenu (le reste est récupéré)
  artillery: { catapult: 0.05, trebuchet: 0.1 }, // engins de défense détruits par pièce d'artillerie
};
// Renseignement de la tour de guet (niveau requis)
export const INTEL = { troops: 3, engines: 4, flank: 5, exact: 8 };
// Raids : part de la puissance consacrée aux engins (les troupes diminuent d'autant) et vagues selon l'hôtel de ville
// Calibré pour qu'un joueur qui ne s'occupe de rien garde les taux de victoire d'avant (tools/siegeSim.mjs)
export const RAID_ENGINES = { budget: 0.13, perTh: 1.1, waves: () => 1 }; // une seule vague : des vagues successives les affaibliraient
export const PLAN_SLOTS = 3;
