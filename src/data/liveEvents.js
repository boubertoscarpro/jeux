// Événements temporaires récurrents — configuration déclarative.
// Ajouter un événement = ajouter une entrée à LIVE_EVENTS (le moteur générique s'occupe du reste).
//
// Event
// ├── id, name, icon, color, tags, weight, duration (h)
// ├── story, faction
// ├── currency { key, name, icon, convert { res, per, amount } }
// ├── enemies { <typeDeCible>: { unité: effectif de base } }
// ├── map { w, h, terrain { type: proportion }, fog, targets [{ type, count, tiers }] }
// ├── objectives [{ id, label, stat, target, reward }]
// ├── shop { merchant, fixed [], rotating [], picks }
// ├── rewards (passe d'événement), leaderboard, guild
// ├── bosses [{ id, name, unit, tiers [{ hp, reward }] }]
// └── special (mécaniques propres : caravanes, vagues, siège, lave…)

// --- Briques communes ---
export const rewardsPass = (cur) => ({
  per: 600, // points par niveau
  levels: {
    1: { res: { food: 3000 } }, 2: { res: { wood: 3000 } }, 3: { units: { spearman: 30 } }, 4: { [cur]: 150 },
    5: { chest: 'rare' }, 6: { res: { iron: 2500 } }, 7: { relicFragments: 0, mythicFragments: 3 }, 8: { units: { archer: 40 } },
    9: { res: { steel: 150, leather: 150 } }, 10: { item: { min: 'epic' } }, 12: { chest: 'epic' }, 14: { mythicFragments: 5 },
    16: { res: { crystals: 10, rareOre: 8 } }, 18: { legendaryFragments: 5 }, 20: { exclusiveFromShop: true },
  },
});

export const LB_REWARDS = {
  1: { title: '🥇 Champion', deco: true, res: { gold: 3000 } },
  2: { title: '🥈 Vice-champion', deco: true, res: { gold: 2000 } },
  3: { title: '🥉 Podium', deco: true, res: { gold: 1500 } },
  10: { insignia: 10, res: { gold: 1000 } },
  50: { insignia: 5 },
  100: { insignia: 2 },
};

// Boutique commune + objets propres à chaque événement
function shop(merchant, specific, rotating) {
  return {
    merchant,
    fixed: [
      { id: 'food', label: '5 000 nourriture', icon: '🍖', price: 100, give: { res: { food: 5000 } } },
      { id: 'iron', label: '2 000 fer', icon: '⛓️', price: 150, give: { res: { iron: 2000 } } },
      { id: 'soldiers', label: '50 épéistes', icon: '🗡️', price: 500, give: { units: { swordsman: 50 } } },
      { id: 'chestRare', label: 'Coffre rare', icon: '🧰', price: 1000, give: { chest: 'rare' } },
      { id: 'epicGear', label: 'Équipement épique', icon: '⚔️', price: 3000, give: { item: { min: 'epic' } } },
      { id: 'legFrag', label: 'Fragments légendaires ×10', icon: '🧩', price: 5000, give: { legendaryFragments: 10 }, stock: 2 },
      { id: 'shard', label: '1 Éclat Ancien', icon: '💠', price: 12000, give: { shards: 1 }, stock: 3, global: 5 },
      ...specific,
    ],
    rotating,
    picks: 4,
  };
}

export const LIVE_EVENTS = {
  // 1 ─────────────────────────────────────────────────────────────
  steppes: {
    name: 'Les Cavaliers des Steppes', icon: '🏹', color: '#c8913a', tags: ['nomads', 'cavalry'], weight: 10, duration: 72,
    story: 'Venus des plaines sans fin de l’est, les clans nomades du Khan Tokhtamir dressent leurs yourtes aux portes des Terres Brisées. Ils pillent, commercent et défient quiconque ose les affronter. Leurs Médailles des Steppes ne s’obtiennent qu’au combat… ou par l’audace.',
    faction: { name: 'Horde de Tokhtamir', icon: '🐎', desc: 'Cavaliers redoutables dans les plaines, vulnérables aux lanciers.' },
    currency: { key: 'steppeMedals', name: 'Médailles des Steppes', icon: '🐎', convert: { res: 'food', per: 100, amount: 250 } },
    enemies: { camp: { nomadRider: 6, horseArcher: 5, nomadGuard: 3 }, caravan: { nomadRider: 5, horseArcher: 3 }, fortress: { nomadRider: 40, horseArcher: 35, nomadGuard: 30 } },
    map: { w: 18, h: 11, terrain: { plain: 0.7, hills: 0.15, forest: 0.08, river: 0.07 }, targets: [{ type: 'camp', count: 12, tiers: [1, 7] }, { type: 'caravan', count: 3 }, { type: 'fortress', count: 1 }, { type: 'boss', count: 1 }, { type: 'treasure', count: 3 }, { type: 'village', count: 2 }] },
    objectives: [
      { id: 'c10', label: 'Vaincre 10 camps', stat: 'camps', target: 10, reward: { steppeMedals: 300, res: { food: 4000 } } },
      { id: 'c50', label: 'Vaincre 50 camps', stat: 'camps', target: 50, reward: { steppeMedals: 1500, chest: 'epic' } },
      { id: 'car3', label: 'Intercepter 3 caravanes', stat: 'caravans', target: 3, reward: { steppeMedals: 400, units: { steppeLancer: 10 } } },
      { id: 'khan', label: 'Vaincre le Khan (n’importe quel rang)', stat: 'bossKills', target: 1, reward: { steppeMedals: 800, mythicFragments: 5 } },
      { id: 'm5k', label: 'Obtenir 5 000 médailles', stat: 'earned', target: 5000, reward: { item: { min: 'epic' } } },
      { id: 'leg', label: 'Vaincre un camp légendaire (VII)', stat: 'tier7', target: 1, reward: { steppeMedals: 1000, legendaryFragments: 5 } },
    ],
    bosses: [{ id: 'khan', name: 'Khan des Steppes', unit: 'khan', tiers: [{ hp: 30000, reward: { steppeMedals: 1200 } }, { hp: 80000, reward: { steppeMedals: 2500, chest: 'epic' } }, { hp: 180000, reward: { steppeMedals: 4500, unique: 'khanSword' } }, { hp: 400000, reward: { steppeMedals: 8000, specialHero: 'khanSon' } }] }],
    shop: shop('Marchand nomade', [
      { id: 'lancers', label: '40 Lanciers des steppes', icon: '🐴', price: 2500, give: { units: { steppeLancer: 40 } } },
      { id: 'bow', label: 'Arc composite des steppes', icon: '🏹', price: 6000, give: { unique: 'steppeBow' }, stock: 1, exclusive: true },
      { id: 'sword', label: 'Épée du Khan', icon: '⚔️', price: 9000, give: { unique: 'khanSword' }, stock: 1, exclusive: true },
      { id: 'hero', label: 'Héros : Temür, fils du Khan', icon: '🤴', price: 15000, give: { specialHero: 'khanSon' }, stock: 1, exclusive: true },
      { id: 'yurt', label: 'Décoration : Yourte du Khan', icon: '⛺', price: 2000, give: { deco: 'deco_yurt' }, stock: 1, exclusive: true },
    ], [
      { id: 'horses', label: '25 Cavaliers légers', icon: '🐎', price: 700, give: { units: { lightcav: 25 } } },
      { id: 'leather', label: '400 cuir', icon: '🟫', price: 400, give: { res: { leather: 400 } } },
      { id: 'speed', label: 'Onguent de célérité ×3', icon: '💨', price: 500, give: { consumable: { swiftOil: 3 } } },
      { id: 'warbuff', label: 'Cri de la horde (+15 % attaque, 3 h)', icon: '📯', price: 800, give: { buff: { name: 'Cri de la horde', mods: { 'combat.atk': 0.15 }, h: 3 } } },
      { id: 'mythf', label: 'Fragments mythiques ×8', icon: '🧩', price: 2500, give: { mythicFragments: 8 }, stock: 2 },
      { id: 'knights', label: '20 Chevaliers', icon: '🏇', price: 1600, give: { units: { knight: 20 } } },
    ]),
    guild: { label: 'Votre guilde doit vaincre 2 000 camps', stat: 'camps', target: 2000, reward: { chest: 'epic', steppeMedals: 1000, buff: { name: 'Fierté de guilde', mods: { 'prod.all': 0.1 }, h: 12 } } },
    special: { caravans: true, desc: 'Les caravanes nomades sillonnent la carte : attaquez-les, escortez-les, commercez ou espionnez-les pour connaître leur destination.' },
  },

  // 2 ─────────────────────────────────────────────────────────────
  corsairs: {
    name: 'Les Corsaires du Sud', icon: '🏴‍☠️', color: '#2f7fa8', tags: ['sea', 'trade'], weight: 9, duration: 72,
    story: 'La Flotte du Sel remonte les fleuves des Terres Brisées. Ses corsaires pillent les ports… mais commercent aussi à prix d’or avec qui sait négocier. Leurs Pièces des Corsaires circulent de main en main.',
    faction: { name: 'Flotte du Sel', icon: '⚓', desc: 'Arquebusiers et abordeurs ; leurs navires fuient vite.' },
    currency: { key: 'corsairCoins', name: 'Pièces des Corsaires', icon: '⚓', convert: { res: 'gold', per: 100, amount: 100 } },
    enemies: { port: { corsair: 8, gunner: 5 }, ship: { corsair: 6, gunner: 4 }, fortress: { corsair: 45, gunner: 40 } },
    map: { w: 18, h: 11, terrain: { river: 0.35, plain: 0.45, forest: 0.1, hills: 0.1 }, targets: [{ type: 'port', count: 8, tiers: [1, 6] }, { type: 'ship', count: 4 }, { type: 'treasure', count: 4 }, { type: 'fortress', count: 1 }, { type: 'boss', count: 1 }] },
    objectives: [
      { id: 'p10', label: 'Piller 10 ports', stat: 'camps', target: 10, reward: { corsairCoins: 300, res: { gold: 2000 } } },
      { id: 'sh4', label: 'Aborder 4 navires', stat: 'ships', target: 4, reward: { corsairCoins: 600, chest: 'rare' } },
      { id: 'tr5', label: 'Déterrer 5 trésors', stat: 'treasures', target: 5, reward: { corsairCoins: 500, res: { gems: 6 } } },
      { id: 'trade', label: 'Conclure 8 échanges maritimes', stat: 'trades', target: 8, reward: { corsairCoins: 700 } },
      { id: 'cap', label: 'Vaincre le Capitaine', stat: 'bossKills', target: 1, reward: { corsairCoins: 1000, mythicFragments: 5 } },
    ],
    bosses: [{ id: 'captain', name: 'Capitaine Barbe-Noire', unit: 'seaCaptain', tiers: [{ hp: 25000, reward: { corsairCoins: 1000 } }, { hp: 70000, reward: { corsairCoins: 2200, chest: 'epic' } }, { hp: 160000, reward: { corsairCoins: 4000, unique: 'captainSabre' } }, { hp: 350000, reward: { corsairCoins: 7000, specialHero: 'saltCaptain' } }] }],
    shop: shop('Marchand corsaire', [
      { id: 'map', label: 'Carte au trésor (révèle un trésor)', icon: '🗺️', price: 600, give: { treasureMap: 1 } },
      { id: 'sabre', label: 'Sabre du capitaine', icon: '🗡️', price: 9000, give: { unique: 'captainSabre' }, stock: 1, exclusive: true },
      { id: 'hero', label: 'Héros : Capitaine Barbe-de-Sel', icon: '🦜', price: 15000, give: { specialHero: 'saltCaptain' }, stock: 1, exclusive: true },
      { id: 'ship', label: 'Décoration : Proue de navire', icon: '⛵', price: 2000, give: { deco: 'deco_ship' }, stock: 1, exclusive: true },
    ], [
      { id: 'silver', label: '30 argent', icon: '🥈', price: 900, give: { res: { silver: 30 } } },
      { id: 'gems', label: '12 gemmes', icon: '💎', price: 1400, give: { res: { gems: 12 } } },
      { id: 'cloth', label: '400 tissu', icon: '🧵', price: 450, give: { res: { cloth: 400 } } },
      { id: 'fortune', label: 'Vent favorable (+30 % caravanes, 6 h)', icon: '⛵', price: 900, give: { buff: { name: 'Vent favorable', mods: { 'caravan.gain': 0.3, 'caravan.speed': 0.3 }, h: 6 } } },
      { id: 'mythf', label: 'Fragments mythiques ×8', icon: '🧩', price: 2500, give: { mythicFragments: 8 }, stock: 2 },
      { id: 'crossbows', label: '40 Arbalétriers', icon: '🎯', price: 1500, give: { units: { crossbow: 40 } } },
    ]),
    guild: { label: 'Votre guilde doit piller 1 500 ports', stat: 'camps', target: 1500, reward: { chest: 'epic', corsairCoins: 1000 } },
    special: { ships: true, portTrade: true, desc: 'Les ports pillables acceptent aussi le commerce maritime (vos ressources contre des Pièces). Les navires se déplacent ; un Port fluvial dans votre ville donne +30 % aux abordages.' },
  },

  // 3 ─────────────────────────────────────────────────────────────
  giants: {
    name: 'L’Hiver des Géants', icon: '❄️', color: '#7fb8d8', tags: ['winter', 'survival'], weight: 8, duration: 72,
    story: 'Un froid surnaturel descend des montagnes : les Géants du givre se réveillent. Les vivres se font rares, les routes gèlent. Seuls les Brasiers tenus par vos dons de bois, de charbon et de nourriture repoussent l’hiver… et rapportent des Éclats de givre.',
    faction: { name: 'Géants du givre', icon: '🧊', desc: 'Lents et colossaux ; les arbalètes perforantes les font plier.' },
    currency: { key: 'frostShards', name: 'Éclats de givre', icon: '🧊', convert: { res: 'coal', per: 100, amount: 75 } },
    mods: { upkeep: 0.2, 'prod.food': -0.15, 'march.speed': -0.1 },
    enemies: { camp: { frostGiant: 1, iceWolf: 8 }, fortress: { frostGiant: 8, iceWolf: 40 }, pack: { iceWolf: 10 } },
    map: { w: 16, h: 10, terrain: { snow: 0.6, mountain: 0.15, forest: 0.15, plain: 0.1 }, targets: [{ type: 'camp', count: 9, tiers: [1, 7] }, { type: 'hearth', count: 3 }, { type: 'pack', count: 3 }, { type: 'fortress', count: 1 }, { type: 'boss', count: 1 }] },
    objectives: [
      { id: 'g8', label: 'Abattre 8 camps de géants', stat: 'camps', target: 8, reward: { frostShards: 300, res: { coal: 600 } } },
      { id: 'h10', label: 'Alimenter les Brasiers 10 fois', stat: 'deliveries', target: 10, reward: { frostShards: 600, chest: 'rare' } },
      { id: 'warm', label: 'Atteindre une chaleur de 100', stat: 'warmth', target: 100, reward: { frostShards: 800, res: { food: 8000 } } },
      { id: 'king', label: 'Vaincre le Roi des Géants', stat: 'bossKills', target: 1, reward: { frostShards: 1000, mythicFragments: 5 } },
    ],
    bosses: [{ id: 'king', name: 'Roi des Géants', unit: 'giantKing', tiers: [{ hp: 40000, reward: { frostShards: 1300 } }, { hp: 100000, reward: { frostShards: 2600, chest: 'epic' } }, { hp: 220000, reward: { frostShards: 4500, unique: 'giantMantle' } }, { hp: 450000, reward: { frostShards: 8000, specialHero: 'frostJarl' } }] }],
    shop: shop('Colporteur des neiges', [
      { id: 'mantle', label: 'Manteau du Roi des Géants', icon: '🧥', price: 9000, give: { unique: 'giantMantle' }, stock: 1, exclusive: true },
      { id: 'hero', label: 'Héros : Jarl Hivernal', icon: '🧔', price: 15000, give: { specialHero: 'frostJarl' }, stock: 1, exclusive: true },
      { id: 'ice', label: 'Décoration : Sculpture de glace', icon: '🧊', price: 2000, give: { deco: 'deco_ice' }, stock: 1, exclusive: true },
    ], [
      { id: 'bread', label: '600 pains', icon: '🍞', price: 500, give: { res: { bread: 600 } } },
      { id: 'rations', label: '400 rations', icon: '🥫', price: 600, give: { res: { rations: 400 } } },
      { id: 'coal', label: '1 500 charbon', icon: '🌑', price: 450, give: { res: { coal: 1500 } } },
      { id: 'guards', label: '12 Gardiens ancestraux', icon: '🛡️', price: 2800, give: { units: { ancestralGuardian: 12 } }, stock: 2 },
      { id: 'mythf', label: 'Fragments mythiques ×8', icon: '🧩', price: 2500, give: { mythicFragments: 8 }, stock: 2 },
      { id: 'heat', label: 'Feux de joie (+20 % nourriture, 6 h)', icon: '🔥', price: 700, give: { buff: { name: 'Feux de joie', mods: { 'prod.food': 0.2 }, h: 6 } } },
    ]),
    guild: { label: 'Votre guilde doit alimenter 600 brasiers', stat: 'deliveries', target: 600, reward: { chest: 'epic', frostShards: 1000 } },
    special: { hearth: true, desc: 'Survie : entretien +20 %, nourriture −15 %, marches −10 %. Alimentez les Brasiers pour gagner de la chaleur : chaque palier de chaleur augmente vos gains d’Éclats de givre.' },
  },

  // 4 ─────────────────────────────────────────────────────────────
  ruins: {
    name: 'Les Ruines Anciennes', icon: '🏛️', color: '#a08a5e', tags: ['explore', 'puzzle'], weight: 8, duration: 72,
    story: 'Un séisme a exhumé une cité de l’Empire de l’Aube. Ses salles scellées gardent énigmes, pièges et trésors. Les érudits paient en Fragments Anciens toute découverte.',
    faction: { name: 'Gardiens de l’Aube', icon: '🗿', desc: 'Golems patients : résistent aux tirs.' },
    currency: { key: 'ancientFragments', name: 'Fragments Anciens', icon: '🏺', convert: { res: 'stone', per: 100, amount: 300 } },
    enemies: { vault: { warden: 2, ancientSoldier: 8 }, fortress: { warden: 10, ancientSoldier: 50 } },
    map: { w: 16, h: 10, fog: true, terrain: { ruins: 0.55, plain: 0.25, forest: 0.1, hills: 0.1 }, targets: [{ type: 'riddle', count: 6 }, { type: 'vault', count: 7, tiers: [1, 7] }, { type: 'treasure', count: 5 }, { type: 'boss', count: 1 }] },
    objectives: [
      { id: 'r4', label: 'Résoudre 4 énigmes', stat: 'riddles', target: 4, reward: { ancientFragments: 600, res: { crystals: 6 } } },
      { id: 'v6', label: 'Ouvrir 6 chambres fortes', stat: 'camps', target: 6, reward: { ancientFragments: 500, chest: 'rare' } },
      { id: 'ex', label: 'Explorer 60 cases des ruines', stat: 'explored', target: 60, reward: { ancientFragments: 400 } },
      { id: 'keeper', label: 'Vaincre le Gardien éternel', stat: 'bossKills', target: 1, reward: { ancientFragments: 1000, mythicFragments: 5 } },
    ],
    bosses: [{ id: 'keeper', name: 'Gardien éternel', unit: 'ruinKeeper', tiers: [{ hp: 35000, reward: { ancientFragments: 1200 } }, { hp: 90000, reward: { ancientFragments: 2500, chest: 'epic' } }, { hp: 200000, reward: { ancientFragments: 4500, unique: 'ancientRing' } }, { hp: 420000, reward: { ancientFragments: 8000, specialHero: 'ruinScholar' } }] }],
    shop: shop('Marchand ancien', [
      { id: 'ring', label: 'Anneau de l’Ancien Roi', icon: '💍', price: 9000, give: { unique: 'ancientRing' }, stock: 1, exclusive: true },
      { id: 'hero', label: 'Héroïne : Érudite des Ruines', icon: '📜', price: 15000, give: { specialHero: 'ruinScholar' }, stock: 1, exclusive: true },
      { id: 'relic', label: 'Fragment de relique', icon: '🧩', price: 6000, give: { relicFragments: 1 }, stock: 1 },
      { id: 'obelisk', label: 'Décoration : Obélisque ancien', icon: '🗼', price: 2000, give: { deco: 'deco_obelisk' }, stock: 1, exclusive: true },
    ], [
      { id: 'crystals', label: '15 cristaux', icon: '🔮', price: 1200, give: { res: { crystals: 15 } } },
      { id: 'scroll', label: 'Parchemins (−1 h de recherche)', icon: '📜', price: 700, give: { research: 3600 } },
      { id: 'mythf', label: 'Fragments mythiques ×10', icon: '🧩', price: 2800, give: { mythicFragments: 10 }, stock: 2 },
      { id: 'rare', label: '10 minerais rares', icon: '☄️', price: 1500, give: { res: { rareOre: 10 } } },
      { id: 'wis', label: 'Sagesse antique (+20 % recherche, 6 h)', icon: '🧠', price: 900, give: { buff: { name: 'Sagesse antique', mods: { 'research.speed': 0.2 }, h: 6 } } },
    ]),
    guild: { label: 'Votre guilde doit résoudre 300 énigmes', stat: 'riddles', target: 300, reward: { chest: 'epic', ancientFragments: 1000 } },
    special: { riddles: true, fog: true, desc: 'La carte est dans le brouillard : explorez-la case par case. Les énigmes demandent réflexion (une mauvaise réponse scelle la salle 1 h).' },
  },

  // 5 ─────────────────────────────────────────────────────────────
  dragonHunt: {
    name: 'La Chasse au Dragon', icon: '🐉', color: '#b3402e', tags: ['dragon', 'coop'], weight: 7, duration: 72,
    story: 'Vorthak l’Ancien, dragon des premiers âges, s’est réveillé. Il faut suivre ses traces jusqu’à son antre — et toutes les guildes du monde unissent leurs forces pour l’abattre. Chaque coup porté rapporte des Écailles de Dragon.',
    faction: { name: 'Couvée de Vorthak', icon: '🦎', desc: 'Dragonnets rapides ; le dragon redoute les trébuchets.' },
    currency: { key: 'dragonScales', name: 'Écailles de Dragon', icon: '🐉', convert: { res: 'iron', per: 100, amount: 200 } },
    enemies: { camp: { dragonling: 6 }, fortress: { dragonling: 40 } },
    map: { w: 18, h: 11, terrain: { mountain: 0.3, ash: 0.25, hills: 0.25, plain: 0.2 }, targets: [{ type: 'camp', count: 8, tiers: [1, 7] }, { type: 'trace', count: 1 }, { type: 'treasure', count: 3 }] },
    coop: { name: 'Vorthak l’Ancien', unit: 'elderDragon', hp: 60000000, serverRate: 0.015, tiers: [0.25, 0.5, 0.75, 1], rewards: [{ dragonScales: 500 }, { dragonScales: 1000, chest: 'rare' }, { dragonScales: 1500, mythicFragments: 5 }, { dragonScales: 3000, unique: 'dragonScale' }] },
    objectives: [
      { id: 'tr3', label: 'Suivre 3 pistes du dragon', stat: 'traces', target: 3, reward: { dragonScales: 500 } },
      { id: 'n8', label: 'Détruire 8 nids de dragonnets', stat: 'camps', target: 8, reward: { dragonScales: 400, res: { crystals: 6 } } },
      { id: 'dmg', label: 'Infliger 50 000 dégâts au dragon', stat: 'coopDamage', target: 50000, reward: { dragonScales: 1200, chest: 'epic' } },
    ],
    bosses: [],
    shop: shop('Marchand du dragon', [
      { id: 'scale', label: 'Écaille du Dragon (armure mythique)', icon: '🛡️', price: 14000, give: { unique: 'dragonScale' }, stock: 1, exclusive: true },
      { id: 'hero', label: 'Héroïne : Sigrun Tue-Dragon', icon: '⚔️', price: 15000, give: { specialHero: 'dragonSlayer' }, stock: 1, exclusive: true },
      { id: 'skull', label: 'Décoration : Crâne de dragon', icon: '🐉', price: 2500, give: { deco: 'deco_dragon' }, stock: 1, exclusive: true },
    ], [
      { id: 'leg', label: 'Équipement légendaire', icon: '🌟', price: 9000, give: { item: { min: 'legendary' } }, stock: 1 },
      { id: 'treb', label: '6 Trébuchets', icon: '🏗️', price: 2500, give: { units: { trebuchet: 6 } } },
      { id: 'ore', label: '15 minerais rares', icon: '☄️', price: 2000, give: { res: { rareOre: 15 } } },
      { id: 'mythf', label: 'Fragments mythiques ×8', icon: '🧩', price: 2500, give: { mythicFragments: 8 }, stock: 2 },
      { id: 'fire', label: 'Sang de dragon (+20 % attaque, 3 h)', icon: '🩸', price: 1000, give: { buff: { name: 'Sang de dragon', mods: { 'combat.atk': 0.2 }, h: 3 } } },
    ]),
    guild: { label: 'Votre guilde doit infliger 5 000 000 de dégâts au dragon', stat: 'coopDamage', target: 5000000, reward: { chest: 'epic', dragonScales: 1500 } },
    special: { tracking: true, coop: true, desc: 'Traque : suivez les pistes (3 étapes) pour localiser l’antre. Coopératif : vous et les seigneurs rivaux (IA, simulés localement) frappez le même dragon ; plus il est entamé, meilleures sont les récompenses — à condition d’avoir participé.' },
  },

  // 6 ─────────────────────────────────────────────────────────────
  kingdomWar: {
    name: 'La Guerre des Royaumes', icon: '⚔️', color: '#8e3b46', tags: ['war', 'territory'], weight: 7, duration: 72,
    story: 'Les marches frontalières sont en feu. Pendant trois jours, chaque région conquise et tenue rapporte des Bannières de conquête — mais l’ennemi contre-attaque sans relâche.',
    faction: { name: 'Légions du Seigneur de guerre', icon: '🚩', desc: 'Armées régulières équilibrées.' },
    currency: { key: 'warBanners', name: 'Bannières de conquête', icon: '🚩', convert: { res: 'iron', per: 100, amount: 175 } },
    enemies: { zone: { guard: 10, royalArcher: 8, royalKnight: 4 }, fortress: { guard: 50, royalArcher: 45, royalKnight: 30 } },
    map: { w: 16, h: 10, terrain: { plain: 0.5, hills: 0.25, forest: 0.15, river: 0.1 }, targets: [{ type: 'zone', count: 7, tiers: [1, 7] }, { type: 'fortress', count: 1 }, { type: 'boss', count: 1 }] },
    objectives: [
      { id: 'z3', label: 'Tenir 3 régions en même temps', stat: 'heldMax', target: 3, reward: { warBanners: 800, chest: 'rare' } },
      { id: 'z10', label: 'Conquérir 10 régions', stat: 'camps', target: 10, reward: { warBanners: 600 } },
      { id: 'def', label: 'Repousser 5 contre-attaques', stat: 'defended', target: 5, reward: { warBanners: 700, units: { royalChampion: 10 } } },
      { id: 'lord', label: 'Vaincre le Seigneur de guerre', stat: 'bossKills', target: 1, reward: { warBanners: 1000, mythicFragments: 5 } },
    ],
    bosses: [{ id: 'warlord', name: 'Seigneur de guerre', unit: 'warlord', tiers: [{ hp: 30000, reward: { warBanners: 1200 } }, { hp: 80000, reward: { warBanners: 2500, chest: 'epic' } }, { hp: 180000, reward: { warBanners: 4500, unique: 'warBanner' } }, { hp: 400000, reward: { warBanners: 8000, units: { royalChampion: 40 } } }] }],
    shop: shop('Quartier-maître', [
      { id: 'banner', label: 'Étendard du conquérant', icon: '🚩', price: 9000, give: { unique: 'warBanner' }, stock: 1, exclusive: true },
      { id: 'champ', label: '25 Chevaliers royaux', icon: '🏇', price: 5000, give: { units: { royalChampion: 25 } }, stock: 2 },
      { id: 'deco', label: 'Décoration : Bannière de conquête', icon: '🚩', price: 2000, give: { deco: 'deco_banner' }, stock: 1, exclusive: true },
    ], [
      { id: 'weapons', label: '300 armes', icon: '⚔️', price: 1200, give: { res: { weapons: 300 } } },
      { id: 'heavy', label: '40 Soldats lourds', icon: '🛡️', price: 1600, give: { units: { heavy: 40 } } },
      { id: 'frames', label: '120 charpentes', icon: '🏗️', price: 900, give: { res: { frames: 120 } } },
      { id: 'mythf', label: 'Fragments mythiques ×8', icon: '🧩', price: 2500, give: { mythicFragments: 8 }, stock: 2 },
      { id: 'drill', label: 'Discipline (+20 % formation, 6 h)', icon: '🎖️', price: 800, give: { buff: { name: 'Discipline', mods: { 'train.speed': 0.2 }, h: 6 } } },
    ]),
    guild: { label: 'Votre guilde doit conquérir 800 régions', stat: 'camps', target: 800, reward: { chest: 'epic', warBanners: 1000 } },
    special: { zones: true, desc: 'Conquérez des régions : les survivants y restent en garnison. Chaque région tenue rapporte des Bannières toutes les heures, mais subit des contre-attaques toutes les 2 h.' },
  },

  // 7 ─────────────────────────────────────────────────────────────
  goldRush: {
    name: 'La Ruée vers l’Or', icon: '⛏️', color: '#d4a017', tags: ['resources', 'race'], weight: 7, duration: 72,
    story: 'Des filons d’or et de métaux précieux affleurent dans le Val des Pépites. Des prospecteurs de tout le continent accourent : premier arrivé, premier servi. Chaque pépite vaut ses Pépites de la Ruée.',
    faction: { name: 'Compagnie du Baron', icon: '💰', desc: 'Prospecteurs armés, peu disciplinés.' },
    currency: { key: 'nuggets', name: 'Pépites de la Ruée', icon: '🪙', convert: { res: 'gold', per: 100, amount: 125 } },
    enemies: { camp: { prospector: 10, banditArcher: 4 }, fortress: { prospector: 50, banditArcher: 30, banditRider: 20 } },
    map: { w: 16, h: 10, terrain: { hills: 0.4, mountain: 0.2, river: 0.15, plain: 0.25 }, targets: [{ type: 'vein', count: 10 }, { type: 'camp', count: 6, tiers: [1, 6] }, { type: 'boss', count: 1 }] },
    objectives: [
      { id: 'v5', label: 'Exploiter 5 filons', stat: 'veins', target: 5, reward: { nuggets: 500, res: { silver: 20 } } },
      { id: 'v15', label: 'Exploiter 15 filons', stat: 'veins', target: 15, reward: { nuggets: 1500, chest: 'epic' } },
      { id: 'c5', label: 'Chasser 5 bandes de prospecteurs', stat: 'camps', target: 5, reward: { nuggets: 400 } },
      { id: 'baron', label: 'Vaincre le Baron de l’Or', stat: 'bossKills', target: 1, reward: { nuggets: 1000, mythicFragments: 5 } },
    ],
    bosses: [{ id: 'baron', name: 'Baron de l’Or', unit: 'goldBaron', tiers: [{ hp: 25000, reward: { nuggets: 1000 } }, { hp: 70000, reward: { nuggets: 2200, chest: 'epic' } }, { hp: 160000, reward: { nuggets: 4000, unique: 'goldPick' } }, { hp: 350000, reward: { nuggets: 7000, res: { rareOre: 60 } } }] }],
    shop: shop('Comptoir de la Ruée', [
      { id: 'pick', label: 'Pic d’or massif', icon: '⛏️', price: 9000, give: { unique: 'goldPick' }, stock: 1, exclusive: true },
      { id: 'nugget', label: 'Décoration : Pépite géante', icon: '🪙', price: 2000, give: { deco: 'deco_gold' }, stock: 1, exclusive: true },
    ], [
      { id: 'silver', label: '40 argent', icon: '🥈', price: 1100, give: { res: { silver: 40 } } },
      { id: 'gems', label: '15 gemmes', icon: '💎', price: 1600, give: { res: { gems: 15 } } },
      { id: 'ore', label: '12 minerais rares', icon: '☄️', price: 1700, give: { res: { rareOre: 12 } } },
      { id: 'harvest', label: 'Élixir de récolte ×3', icon: '🌱', price: 700, give: { consumable: { harvestElixir: 3 } } },
      { id: 'mythf', label: 'Fragments mythiques ×8', icon: '🧩', price: 2500, give: { mythicFragments: 8 }, stock: 2 },
      { id: 'boom', label: 'Fièvre de l’or (+30 % or, 6 h)', icon: '💰', price: 900, give: { buff: { name: 'Fièvre de l’or', mods: { 'prod.gold': 0.3 }, h: 6 } } },
    ]),
    guild: { label: 'Votre guilde doit exploiter 1 200 filons', stat: 'veins', target: 1200, reward: { chest: 'epic', nuggets: 1000 } },
    special: { veins: true, desc: 'Course aux filons : chaque filon s’épuise, et des prospecteurs rivaux en revendiquent toutes les heures. Envoyez vos troupes y travailler avant qu’il ne soit trop tard.' },
  },

  // 8 ─────────────────────────────────────────────────────────────
  volcano: {
    name: 'La Colère du Volcan', icon: '🌋', color: '#d4542a', tags: ['danger', 'rare'], weight: 6, duration: 72,
    story: 'Le Mont Braise s’éveille. Ses flancs crachent obsidienne, cristaux et minerais introuvables ailleurs… et sa lave change de cours chaque heure. Les Braises volcaniques récompensent les plus téméraires.',
    faction: { name: 'Enfants du magma', icon: '🔥', desc: 'Élémentaires résistants aux tirs.' },
    currency: { key: 'embers', name: 'Braises volcaniques', icon: '🔥', convert: { res: 'coal', per: 100, amount: 100 } },
    enemies: { camp: { magmaling: 4 }, fortress: { magmaling: 30 } },
    map: { w: 16, h: 10, terrain: { ash: 0.55, mountain: 0.25, hills: 0.2 }, targets: [{ type: 'vent', count: 8 }, { type: 'camp', count: 7, tiers: [2, 7] }, { type: 'boss', count: 1 }] },
    objectives: [
      { id: 'v6', label: 'Récolter 6 évents d’obsidienne', stat: 'vents', target: 6, reward: { embers: 600, res: { crystals: 10 } } },
      { id: 'c6', label: 'Éteindre 6 foyers élémentaires', stat: 'camps', target: 6, reward: { embers: 500, chest: 'rare' } },
      { id: 'lord', label: 'Vaincre le Seigneur de magma', stat: 'bossKills', target: 1, reward: { embers: 1200, mythicFragments: 6 } },
    ],
    bosses: [{ id: 'magma', name: 'Seigneur de magma', unit: 'magmaLord', tiers: [{ hp: 45000, reward: { embers: 1500 } }, { hp: 110000, reward: { embers: 3000, chest: 'epic' } }, { hp: 240000, reward: { embers: 5000, unique: 'obsidianHelm' } }, { hp: 500000, reward: { embers: 9000, res: { crystals: 80, rareOre: 60 } } }] }],
    shop: shop('Forgeron des cendres', [
      { id: 'helm', label: 'Heaume d’obsidienne', icon: '⛑️', price: 9000, give: { unique: 'obsidianHelm' }, stock: 1, exclusive: true },
      { id: 'lava', label: 'Décoration : Brasier de lave', icon: '🌋', price: 2000, give: { deco: 'deco_lava' }, stock: 1, exclusive: true },
    ], [
      { id: 'crys', label: '25 cristaux', icon: '🔮', price: 1800, give: { res: { crystals: 25 } } },
      { id: 'ore', label: '20 minerais rares', icon: '☄️', price: 2600, give: { res: { rareOre: 20 } } },
      { id: 'leg', label: 'Équipement légendaire', icon: '🌟', price: 9000, give: { item: { min: 'legendary' } }, stock: 1 },
      { id: 'mythf', label: 'Fragments mythiques ×10', icon: '🧩', price: 2800, give: { mythicFragments: 10 }, stock: 2 },
      { id: 'forge', label: 'Feu sacré (+30 % qualité de forge, 6 h)', icon: '⚒️', price: 900, give: { buff: { name: 'Feu sacré', mods: { 'craft.quality': 0.3 }, h: 6 } } },
    ]),
    guild: { label: 'Votre guilde doit récolter 800 évents', stat: 'vents', target: 800, reward: { chest: 'epic', embers: 1000 } },
    special: { lava: true, desc: 'Zone extrêmement dangereuse : la lave se déplace chaque heure. Une troupe sur un évent cerné par la lave peut perdre une partie de ses hommes. Les évents contiennent des ressources introuvables ailleurs (et parfois un Éclat Ancien).' },
  },

  // 9 ─────────────────────────────────────────────────────────────
  deadNight: {
    name: 'La Nuit des Morts', icon: '👻', color: '#6b4f9e', tags: ['undead', 'defense'], weight: 6, duration: 72,
    story: 'La lune rouge se lève : les morts sortent des cryptes et marchent sur votre royaume, vague après vague. Chaque vague repoussée rapporte des Âmes errantes. Purgez les cryptes pour affaiblir la prochaine marée.',
    faction: { name: 'Légion du Roi des Os', icon: '💀', desc: 'Goules et chevaliers de la mort ; craignent les épéistes.' },
    currency: { key: 'souls', name: 'Âmes errantes', icon: '👻', convert: { res: 'herbs', per: 100, amount: 38 } },
    enemies: { crypt: { ghoul: 10, skeleton: 6, deathKnight: 1 }, wave: { ghoul: 14, skeleton: 10, deathKnight: 3, wraith: 4 } },
    map: { w: 16, h: 10, terrain: { swamp: 0.3, ruins: 0.3, forest: 0.25, plain: 0.15 }, targets: [{ type: 'crypt', count: 9, tiers: [1, 7] }, { type: 'boss', count: 1 }] },
    objectives: [
      { id: 'w3', label: 'Repousser 3 vagues', stat: 'waves', target: 3, reward: { souls: 600, chest: 'rare' } },
      { id: 'w8', label: 'Repousser 8 vagues', stat: 'waves', target: 8, reward: { souls: 1500, chest: 'epic' } },
      { id: 'c8', label: 'Purger 8 cryptes', stat: 'camps', target: 8, reward: { souls: 500 } },
      { id: 'king', label: 'Vaincre le Roi des Os', stat: 'bossKills', target: 1, reward: { souls: 1000, mythicFragments: 5 } },
    ],
    bosses: [{ id: 'bone', name: 'Roi des Os', unit: 'boneKing', tiers: [{ hp: 35000, reward: { souls: 1300 } }, { hp: 90000, reward: { souls: 2600, chest: 'epic' } }, { hp: 200000, reward: { souls: 4500, unique: 'boneCrown' } }, { hp: 420000, reward: { souls: 8000, units: { ancestralGuardian: 30 } } }] }],
    shop: shop('Fossoyeur errant', [
      { id: 'crown', label: 'Couronne d’os', icon: '👑', price: 9000, give: { unique: 'boneCrown' }, stock: 1, exclusive: true },
      { id: 'lantern', label: 'Décoration : Lanterne des morts', icon: '🏮', price: 2000, give: { deco: 'deco_lantern' }, stock: 1, exclusive: true },
    ], [
      { id: 'heal', label: 'Potions de soin ×6', icon: '🧪', price: 600, give: { consumable: { healPotion: 6 } } },
      { id: 'herbs', label: '600 herbes', icon: '🌿', price: 500, give: { res: { herbs: 600 } } },
      { id: 'swords', label: '60 Épéistes', icon: '🗡️', price: 800, give: { units: { swordsman: 60 } } },
      { id: 'guards', label: '12 Gardiens ancestraux', icon: '🛡️', price: 2800, give: { units: { ancestralGuardian: 12 } }, stock: 2 },
      { id: 'mythf', label: 'Fragments mythiques ×8', icon: '🧩', price: 2500, give: { mythicFragments: 8 }, stock: 2 },
      { id: 'holy', label: 'Eau bénite (+20 % défense de la ville, 6 h)', icon: '💧', price: 800, give: { buff: { name: 'Eau bénite', mods: { 'city.def': 0.2 }, h: 6 } } },
    ]),
    guild: { label: 'Votre guilde doit repousser 400 vagues', stat: 'waves', target: 400, reward: { chest: 'epic', souls: 1000 } },
    special: { waves: true, every: 6, desc: 'Toutes les 6 h, une vague de morts-vivants attaque votre ville (gardez des troupes à la maison !). Chaque crypte purgée affaiblit la prochaine vague de 4 %. Vous pouvez allumer les Feux sacrés (200 herbes) avant une vague : +20 % de défense.' },
  },

  // 10 ────────────────────────────────────────────────────────────
  siege: {
    name: 'Le Siège des Anciens', icon: '🏰', color: '#7a6a4f', tags: ['defense', 'coop'], weight: 5, duration: 72,
    story: 'La Citadelle des Anciens, dernier rempart de l’Empire de l’Aube, est assiégée par la Horde de cendre. Pendant trois jours, les seigneurs de tout le continent y envoient leurs soldats. Si elle tient, chacun recevra sa part de gloire en Sceaux de la Citadelle.',
    faction: { name: 'Horde de cendre', icon: '🏗️', desc: 'Engins de siège et soldats anciens.' },
    currency: { key: 'citadelSeals', name: 'Sceaux de la Citadelle', icon: '🏯', convert: { res: 'stone', per: 100, amount: 300 } },
    enemies: { camp: { ancientSoldier: 10, banditArcher: 6 }, assault: { ancientSoldier: 30, royalArcher: 20, royalKnight: 10 } },
    map: { w: 16, h: 10, terrain: { plain: 0.45, hills: 0.25, ruins: 0.2, forest: 0.1 }, targets: [{ type: 'bastion', count: 1 }, { type: 'camp', count: 8, tiers: [1, 7] }, { type: 'boss', count: 1 }] },
    objectives: [
      { id: 'a3', label: 'Participer à la défense de 3 assauts', stat: 'assaults', target: 3, reward: { citadelSeals: 600, chest: 'rare' } },
      { id: 'a8', label: 'Participer à la défense de 8 assauts', stat: 'assaults', target: 8, reward: { citadelSeals: 1500, chest: 'epic' } },
      { id: 'c6', label: 'Détruire 6 camps d’assiégeants', stat: 'camps', target: 6, reward: { citadelSeals: 500 } },
      { id: 'master', label: 'Vaincre le Maître de siège', stat: 'bossKills', target: 1, reward: { citadelSeals: 1000, mythicFragments: 5 } },
    ],
    bosses: [{ id: 'master', name: 'Maître de siège', unit: 'siegeMaster', tiers: [{ hp: 40000, reward: { citadelSeals: 1400 } }, { hp: 100000, reward: { citadelSeals: 2800, chest: 'epic' } }, { hp: 220000, reward: { citadelSeals: 4800, unique: 'bastionShield' } }, { hp: 450000, reward: { citadelSeals: 8500, units: { ancestralGuardian: 40 } } }] }],
    shop: shop('Intendant de la Citadelle', [
      { id: 'shield', label: 'Bouclier des Anciens', icon: '🛡️', price: 9000, give: { unique: 'bastionShield' }, stock: 1, exclusive: true },
      { id: 'tower', label: 'Décoration : Tour des Anciens', icon: '🏯', price: 2500, give: { deco: 'deco_tower' }, stock: 1, exclusive: true },
    ], [
      { id: 'stone', label: '8 000 pierre', icon: '🪨', price: 500, give: { res: { stone: 8000 } } },
      { id: 'guards', label: '15 Gardiens ancestraux', icon: '🛡️', price: 3200, give: { units: { ancestralGuardian: 15 } }, stock: 2 },
      { id: 'cats', label: '10 Catapultes', icon: '☄️', price: 1500, give: { units: { catapult: 10 } } },
      { id: 'mythf', label: 'Fragments mythiques ×8', icon: '🧩', price: 2500, give: { mythicFragments: 8 }, stock: 2 },
      { id: 'wall', label: 'Remparts renforcés (+25 % défense de la ville, 6 h)', icon: '🧱', price: 900, give: { buff: { name: 'Remparts renforcés', mods: { 'city.def': 0.25 }, h: 6 } } },
    ]),
    guild: { label: 'Votre guilde doit tenir 300 assauts', stat: 'assaults', target: 300, reward: { chest: 'epic', citadelSeals: 1000 } },
    special: { siege: true, every: 4, coop: true, desc: 'Envoyez des troupes en garnison dans la Citadelle. Toutes les 4 h, un assaut frappe : votre garnison combat aux côtés des seigneurs alliés (IA). L’intégrité de la Citadelle baisse à chaque assaut, moins si vous repoussez l’ennemi ; si elle tient jusqu’au bout, vous recevez une grande récompense.' },
  },
  // 11 ────────────────────────────────────────────────────────────
  sevenMerchants: {
    name: 'Le Convoi des Sept Marchands', icon: '🐫', color: '#b88a3a', tags: ['caravan', 'market'], weight: 7, duration: 72,
    story: 'Les Sept Maisons marchandes de Valbrume traversent les Terres Brisées avec leurs plus riches convois. Les brigands les guettent, les taxes s’envolent et chaque seigneur doit choisir : protéger, commercer… ou piller. Les Sceaux des Sept récompensent les uns comme les autres.',
    faction: { name: 'Compagnie des brigands', icon: '🗡️', desc: 'Pillards montés et archers ; les lanciers brisent leurs charges.' },
    currency: { key: 'merchantSeals', name: 'Sceaux des Sept', icon: '📜', convert: { res: 'gold', per: 100, amount: 110 } },
    mods: { 'market.fee': 0.04, 'caravan.gain': 0.25 },
    enemies: { camp: { bandit: 8, banditArcher: 5, banditRider: 3 }, caravan: { guard: 6, royalArcher: 4 }, fortress: { bandit: 40, banditArcher: 30, banditRider: 25 } },
    map: { w: 18, h: 11, terrain: { plain: 0.55, hills: 0.2, forest: 0.15, river: 0.1 }, targets: [{ type: 'caravan', count: 7 }, { type: 'camp', count: 8, tiers: [1, 6] }, { type: 'village', count: 3 }, { type: 'treasure', count: 2 }, { type: 'fortress', count: 1 }, { type: 'boss', count: 1 }] },
    objectives: [
      { id: 'esc5', label: 'Escorter 5 convois', stat: 'escorts', target: 5, reward: { merchantSeals: 700, res: { silver: 20 } } },
      { id: 'tr8', label: 'Conclure 8 échanges avec les marchands', stat: 'trades', target: 8, reward: { merchantSeals: 600, chest: 'rare' } },
      { id: 'b8', label: 'Démanteler 8 repaires de brigands', stat: 'camps', target: 8, reward: { merchantSeals: 500 } },
      { id: 'car10', label: 'Intercepter ou escorter 10 convois', stat: 'caravans', target: 10, reward: { merchantSeals: 1200, chest: 'epic' } },
      { id: 'king', label: 'Vaincre le Roi des Brigands', stat: 'bossKills', target: 1, reward: { merchantSeals: 1000, mythicFragments: 5 } },
    ],
    bosses: [{ id: 'brigand', name: 'Roi des Brigands', unit: 'banditKing', tiers: [{ hp: 25000, reward: { merchantSeals: 1000 } }, { hp: 70000, reward: { merchantSeals: 2200, chest: 'epic' } }, { hp: 160000, reward: { merchantSeals: 4000, unique: 'merchantSignet' } }, { hp: 350000, reward: { merchantSeals: 7000, res: { silver: 80, gems: 30 } } }] }],
    shop: shop('Comptoir des Sept', [
      { id: 'signet', label: 'Chevalière des Sept Marchands', icon: '💍', price: 9000, give: { unique: 'merchantSignet' }, stock: 1, exclusive: true },
      { id: 'deco', label: 'Décoration : Caravane des Sept', icon: '🐫', price: 2000, give: { deco: 'deco_caravan' }, stock: 1, exclusive: true },
      { id: 'cav', label: '30 Cavaliers légers', icon: '🐎', price: 1200, give: { units: { lightcav: 30 } } },
    ], [
      { id: 'silver', label: '35 argent', icon: '🥈', price: 1000, give: { res: { silver: 35 } } },
      { id: 'cloth', label: '500 tissu', icon: '🧵', price: 500, give: { res: { cloth: 500 } } },
      { id: 'leather', label: '500 cuir', icon: '🟫', price: 500, give: { res: { leather: 500 } } },
      { id: 'fortune', label: 'Lettre de crédit (+30 % caravanes, 6 h)', icon: '📜', price: 900, give: { buff: { name: 'Lettre de crédit', mods: { 'caravan.gain': 0.3 }, h: 6 } } },
      { id: 'mythf', label: 'Fragments mythiques ×8', icon: '🧩', price: 2500, give: { mythicFragments: 8 }, stock: 2 },
      { id: 'pikes', label: '60 Lanciers', icon: '🔱', price: 600, give: { units: { spearman: 60 } } },
    ]),
    guild: { label: 'Votre guilde doit escorter 500 convois', stat: 'escorts', target: 500, reward: { chest: 'epic', merchantSeals: 1000 } },
    special: { caravans: true, desc: 'Marché bouleversé : taxe du marché +4 %, caravanes vers les cités +25 %. Les convois des Sept traversent la carte : escortez-les (récompense sûre), commercez avec eux, ou pillez-les (plus lucratif, mais ce sont des gardes d’élite).' },
  },

};

// Événements surprises (hors rotation)
export const SURPRISE_EVENTS = {
  meteor: { name: 'La Pluie de Météores', icon: '☄️', hours: 6, chancePerDay: 0.25, incompatible: [], desc: 'Une météorite s’écrase sur la carte du monde : minerai rare, Éclats Anciens, artefacts… Des seigneurs rivaux viennent aussi l’exploiter — faites vite !' },
  wanderingDragon: { name: 'Le Dragon Errant', icon: '🐲', hours: 2, chancePerDay: 0.18, incompatible: ['dragon'], desc: 'Un dragon erre sur une région aléatoire. Tous les seigneurs peuvent tenter de l’abattre (boss mondial).' },
  fair: { name: 'La Grande Foire', icon: '🎪', hours: 24, announced: true, everyDays: 7, incompatible: [], desc: 'Pendant 24 h : taxe du marché divisée par deux et marchands proposant des échanges exceptionnels.' },
  eclipse: { name: 'L’Éclipse', icon: '🌑', hours: 4, chancePerDay: 0.15, incompatible: ['undead'], desc: 'Pendant quelques heures, des donjons de l’éclipse apparaissent : butin doublé, chance d’Éclats accrue.' },
};

// Offres de la Grande Foire (échanges avantageux)
export const FAIR_OFFERS = [
  { id: 'f1', label: '3 000 bois → 1 200 fer', pay: { wood: 3000 }, get: { iron: 1200 } },
  { id: 'f2', label: '4 000 nourriture → 150 acier', pay: { food: 4000 }, get: { steel: 150 } },
  { id: 'f3', label: '2 000 or → 12 cristaux', pay: { gold: 2000 }, get: { crystals: 12 } },
  { id: 'f4', label: '500 cuir → 10 gemmes', pay: { leather: 500 }, get: { gems: 10 } },
  { id: 'f5', label: '5 000 pierre → 300 charpente', pay: { stone: 5000 }, get: { frames: 300 } },
  { id: 'f6', label: '3 000 or → coffre rare', pay: { gold: 3000 }, get: { chest: 'rare' } },
];

// Marchand mystère (pendant les événements) : 3 à 5 objets, renouvelés chaque jour
export const MYSTERY_POOL = [
  { label: 'Équipement légendaire', icon: '🌟', price: 7000, give: { item: { min: 'legendary' } } },
  { label: 'Fragment de relique', icon: '🧩', price: 6500, give: { relicFragments: 1 } },
  { label: 'Fragments mythiques ×12', icon: '🧩', price: 3200, give: { mythicFragments: 12 } },
  { label: '30 cristaux', icon: '🔮', price: 2200, give: { res: { crystals: 30 } } },
  { label: '25 minerais rares', icon: '☄️', price: 3000, give: { res: { rareOre: 25 } } },
  { label: '20 Cavaliers célestes', icon: '🐎', price: 4500, give: { units: { celestialRider: 20 } } },
  { label: 'Décoration : Fontaine', icon: '⛲', price: 1200, give: { deco: 'deco_fountain' } },
  { label: 'Coffre épique', icon: '🎁', price: 2600, give: { chest: 'epic' } },
  { label: '1 Éclat Ancien', icon: '💠', price: 14000, give: { shards: 1 }, rare: true },
];

// Énigmes des Ruines Anciennes (une bonne réponse sur trois)
export const RIDDLES = [
  { q: 'Plus on m’enlève, plus je deviens grand. Que suis-je ?', a: ['Un trou', 'Une tour', 'Une ombre'], ok: 0 },
  { q: 'Je parle sans bouche et j’entends sans oreilles ; je vis dans les montagnes. Que suis-je ?', a: ['Le vent', 'L’écho', 'Un corbeau'], ok: 1 },
  { q: 'Le roi de l’Aube avait trois fils. Le premier régna dix ans, le second deux fois moins, le troisième autant que ses deux frères réunis. Combien d’années régnèrent-ils en tout ?', a: ['25 ans', '30 ans', '20 ans'], ok: 1 },
  { q: 'Je dévore tout : arbres, fleurs, rois et cités. Les montagnes même finissent par me céder. Que suis-je ?', a: ['Le feu', 'La guerre', 'Le temps'], ok: 2 },
  { q: 'Sur la porte : « Celui qui me fabrique ne s’en sert pas ; celui qui s’en sert ne le voit pas. »', a: ['Un cercueil', 'Une couronne', 'Une clé'], ok: 0 },
  { q: 'Quatre leviers : le premier est d’or, le second d’argent, le troisième de fer. Le gardien a écrit : « Le plus humble ouvre la voie. » Lequel tirer ?', a: ['L’or', 'Le fer', 'L’argent'], ok: 1 },
  { q: 'J’ai des villes sans maisons, des forêts sans arbres et des fleuves sans eau. Que suis-je ?', a: ['Un rêve', 'Une carte', 'Un tableau'], ok: 1 },
  { q: 'Plus je sèche, plus je suis mouillée. Que suis-je ?', a: ['Une serviette', 'Une éponge', 'La pluie'], ok: 0 },
  { q: 'Une salle contient 3 statues. Celle de gauche ment toujours, celle du centre dit toujours vrai. Celle de droite dit : « La statue du centre ment. » Que fait celle de droite ?', a: ['Elle dit vrai', 'Elle ment', 'Impossible à savoir'], ok: 1 },
  { q: 'On me prend avant de me donner. Que suis-je ?', a: ['Une promesse', 'Un coup', 'La parole'], ok: 0 },
];

// Stratégies d'événement : un choix par jour qui oriente la progression (aucune n'est meilleure en tout)
export const EVENT_STANCES = {
  balanced: { name: 'Équilibre', icon: '⚖️', desc: 'Aucun bonus ni malus.', combat: 1, peace: 1 },
  raid: { name: 'Razzia', icon: '⚔️', desc: '+25 % de monnaie au combat, −20 % pour le commerce, les escortes et les fouilles.', combat: 1.25, peace: 0.8 },
  trade: { name: 'Diplomatie marchande', icon: '🤝', desc: '+30 % de monnaie pour les activités pacifiques, −20 % au combat.', combat: 0.8, peace: 1.3 },
  caution: { name: 'Prudence', icon: '🛡️', desc: 'Pertes au combat −25 %, mais −10 % de monnaie partout.', combat: 0.9, peace: 0.9, losses: -0.25 },
};

// Missions quotidiennes : trois par jour, tirées parmi les activités propres à l'événement
export const DAILY_TEMPLATES = {
  camps: { label: (n) => `Vaincre ${n} cibles ennemies`, per: 4, reward: 300 },
  caravans: { label: (n) => `Intercepter ou escorter ${n} convois`, per: 2, reward: 350 },
  escorts: { label: (n) => `Escorter ${n} convois`, per: 2, reward: 350 },
  trades: { label: (n) => `Conclure ${n} échanges`, per: 3, reward: 300 },
  treasures: { label: (n) => `Déterrer ${n} trésors`, per: 2, reward: 300 },
  ships: { label: (n) => `Aborder ${n} navire(s)`, per: 1, reward: 350 },
  deliveries: { label: (n) => `Effectuer ${n} livraisons`, per: 3, reward: 300 },
  riddles: { label: (n) => `Résoudre ${n} énigme(s)`, per: 1, reward: 400 },
  explored: { label: (n) => `Explorer ${n} cases`, per: 15, reward: 250 },
  veins: { label: (n) => `Exploiter ${n} filons`, per: 3, reward: 300 },
  vents: { label: (n) => `Récolter ${n} évents`, per: 2, reward: 300 },
  waves: { label: (n) => `Repousser ${n} vague(s)`, per: 1, reward: 400 },
  assaults: { label: (n) => `Défendre la Citadelle lors de ${n} assauts`, per: 2, reward: 400 },
  defended: { label: (n) => `Repousser ${n} contre-attaque(s)`, per: 1, reward: 350 },
  traces: { label: (n) => `Suivre ${n} piste(s)`, per: 1, reward: 300 },
  coopDamage: { label: (n) => `Infliger ${n} dégâts au colosse`, per: 15000, reward: 400 },
  bossDamage: { label: (n) => `Infliger ${n} dégâts au boss`, per: 20000, reward: 400 },
  earned: { label: (n) => `Gagner ${n} de monnaie`, per: 2000, reward: 250 },
};
