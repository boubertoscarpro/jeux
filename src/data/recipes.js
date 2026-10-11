// Plans de forge : un plan fixe la base de l'objet et propose plusieurs variantes (effet spécial choisi au moment
// de la fabrication). Les plans se découvrent : donjons vidés, mystères archéologiques, factions amies, héros
// expérimentés, expérimentations de l'atelier (combinaison de matériaux rares). Valeurs « add » : multiplicateurs de
// la valeur de base de l'affixe (comme les affixes signature des bases d'objets).
export const PLAN_SOURCES = {
  dungeon: { name: 'Donjons', icon: '🕳️', desc: 'Chaque donjon vidé a une chance sur trois de contenir un plan.' },
  mystery: { name: 'Mystères', icon: '🏺', desc: 'Récompense d’un mystère archéologique résolu.' },
  faction: { name: 'Factions', icon: '🤝', desc: 'À acheter auprès d’une faction en accord commercial ou en alliance.' },
  hero: { name: 'Héros', icon: '🧙', desc: 'Enseigné par un héros de la bonne classe ayant atteint le niveau requis.' },
  experiment: { name: 'Expérimentation', icon: '⚗️', desc: 'Découvert en combinant des matériaux rares à l’atelier.' },
};

export const PLANS = {
  // ── Donjons ──
  cavalrySaber: { name: 'Sabre de cavalier', icon: '🗡️', slot: 'weapon', base: 'generalSword', src: 'dungeon', cost: { steel: 10, rareOre: 2 },
    variants: { charge: { name: 'Pour la charge', add: { 'class.cavalry.atk': 3 } }, guard: { name: 'Pour la défense', add: { 'combat.def': 2 } }, boss: { name: 'Contre les géants', add: { 'siege.power': 2 } } } },
  bulwarkPlate: { name: 'Plastron du rempart', icon: '🛡️', slot: 'armor', base: 'plateArmor', src: 'dungeon', cost: { steel: 12, stone: 60 },
    variants: { wall: { name: 'Pour la garnison', add: { 'city.def': 2 } }, endure: { name: 'Pour l’endurance', add: { 'combat.losses': 2 } }, morale: { name: 'Pour le moral', add: { 'combat.morale': 2 } } } },
  wardenHelm: { name: 'Heaume de veilleur', icon: '⛑️', slot: 'helmet', base: 'ironHelm', src: 'dungeon', cost: { steel: 8, crystals: 1 },
    variants: { command: { name: 'Pour le commandement', add: { 'stat.command': 2 } }, scout: { name: 'Pour l’éclaireur', add: { 'explore.speed': 2 } } } },
  stalkerGloves: { name: 'Gants du traqueur', icon: '🧤', slot: 'gloves', base: 'duelGloves', src: 'dungeon', cost: { leather: 10, gems: 1 },
    variants: { loot: { name: 'Pour le butin', add: { 'loot.rare': 2 } }, strike: { name: 'Pour la frappe', add: { 'combat.atk': 1.5 } } } },
  // ── Mystères archéologiques ──
  starAmulet: { name: 'Amulette stellaire', icon: '🔭', slot: 'amulet', base: 'crystalAmulet', src: 'mystery', cost: { crystals: 3, silver: 4 },
    variants: { lore: { name: 'Pour l’étude', add: { 'research.speed': 2.5 } }, sage: { name: 'Pour l’apprentissage', add: { 'hero.xp': 3 } } } },
  tidalBlade: { name: 'Lame de la Forge engloutie', icon: '🌊', slot: 'weapon', base: 'ancientBlade', src: 'mystery', cost: { steel: 15, rareOre: 3 },
    variants: { edge: { name: 'Tranchant trempé', add: { 'combat.atk': 2.5 } }, cav: { name: 'Pour la cavalerie', add: { 'class.cavalry.atk': 4 } }, siege: { name: 'Pour le siège', add: { 'siege.power': 3 } } } },
  harvestSmock: { name: 'Tablier du premier roi', icon: '🌾', slot: 'armor', base: 'farmerSmock', src: 'mystery', cost: { cloth: 12, grain: 40 },
    variants: { food: { name: 'Pour les moissons', add: { 'prod.food': 3 } }, all: { name: 'Pour l’intendance', add: { 'prod.all': 2 } } } },
  windBoots: { name: 'Bottes des vents', icon: '🌬️', slot: 'boots', base: 'roadBoots', src: 'mystery', cost: { leather: 12, silver: 3 },
    variants: { march: { name: 'Pour la marche', add: { 'march.speed': 3 } }, carry: { name: 'Pour le portage', add: { carry: 3 } } } },
  archivistCap: { name: 'Toque de l’archiviste', icon: '📚', slot: 'helmet', base: 'scholarCap', src: 'mystery', cost: { cloth: 8, crystals: 2 },
    variants: { research: { name: 'Pour la recherche', add: { 'research.speed': 3 } }, lore: { name: 'Pour le savoir', add: { 'stat.lore': 3 } } } },
  // ── Factions ──
  merchantSignet: { name: 'Chevalière de guilde', icon: '💍', slot: 'ring', base: 'goldRing', src: 'faction', price: { gold: 1500, silver: 10 }, cost: { silver: 3, gems: 1 },
    variants: { trade: { name: 'Pour le commerce', add: { 'caravan.gain': 3 } }, gold: { name: 'Pour le trésor', add: { 'prod.gold': 2 } }, cunning: { name: 'Pour la ruse', add: { 'stat.cunning': 2 } } } },
  envoyTalisman: { name: 'Talisman d’ambassadeur', icon: '📿', slot: 'amulet', base: 'warAmulet', src: 'faction', price: { gold: 2000, crystals: 4 }, cost: { silver: 4, crystals: 1 },
    variants: { morale: { name: 'Pour le moral', add: { 'combat.morale': 2 } }, command: { name: 'Pour le commandement', add: { 'stat.command': 2 } } } },
  // ── Héros ──
  smithHammer: { name: 'Marteau de maître forgeron', icon: '🔨', slot: 'weapon', base: 'forgeHammer', src: 'hero', heroClass: 'blacksmith', heroLevel: 8, cost: { steel: 12, coal: 20 },
    variants: { quality: { name: 'Pour la qualité', add: { 'craft.quality': 2.5 } }, iron: { name: 'Pour le minerai', add: { 'prod.iron': 3 } } } },
  marshalBoots: { name: 'Solerets du maréchal', icon: '🥾', slot: 'boots', base: 'warBoots', src: 'hero', heroClass: 'general', heroLevel: 8, cost: { steel: 8, leather: 8 },
    variants: { def: { name: 'Pour tenir la ligne', add: { 'combat.def': 2 } }, morale: { name: 'Pour le moral', add: { 'combat.morale': 2.5 } } } },
  pathfinderHood: { name: 'Capuche du pisteur', icon: '🧭', slot: 'helmet', base: 'scoutHood', src: 'hero', heroClass: 'explorer', heroLevel: 8, cost: { leather: 8, herbs: 30 },
    variants: { speed: { name: 'Pour la découverte', add: { 'explore.speed': 2.5 } }, loot: { name: 'Pour les trésors', add: { 'loot.rare': 2 } } } },
  // ── Expérimentation ──
  prismRing: { name: 'Anneau prismatique', icon: '🔮', slot: 'ring', base: 'luckRing', src: 'experiment', cost: { crystals: 2, gems: 2 },
    variants: { luck: { name: 'Pour la chance', add: { 'loot.rare': 2.5 } }, lore: { name: 'Pour le savoir', add: { 'stat.lore': 2 } } } },
  heartwoodBow: { name: 'Arc de cœur-de-bois', icon: '🏹', slot: 'weapon', base: 'huntBow', src: 'experiment', cost: { ancientWood: 4, leather: 6 },
    variants: { hunt: { name: 'Pour la chasse', add: { 'loot.rare': 2 } }, volley: { name: 'Pour la volée', add: { 'combat.atk': 2 } } } },
  runeGauntlets: { name: 'Gantelets runiques', icon: '🧤', slot: 'gloves', base: 'minerGloves', src: 'experiment', cost: { rareOre: 3, silver: 2 },
    variants: { mine: { name: 'Pour la mine', add: { 'gather.iron': 3 } }, all: { name: 'Pour la récolte', add: { 'gather.all': 2.5 } } } },
};

// Expérimentation : combiner des matériaux rares pour découvrir un plan « experiment » (ou affiner son savoir-faire)
export const EXPERIMENT = { cost: { gems: 3, crystals: 3, rareOre: 2, ancientWood: 2 }, minForge: 2, chance: 0.5, consolation: 0.05 };

// Spécialisation de l'atelier : qualité et coût sur une famille d'emplacements, surcoût sur les autres
export const WORKSHOPS = {
  arms: { name: 'Atelier d’armes', icon: '🗡️', slots: ['weapon', 'gloves'], desc: 'Armes et gants' },
  armor: { name: 'Atelier d’armures', icon: '🛡️', slots: ['helmet', 'armor', 'boots'], desc: 'Casques, armures et bottes' },
  jewels: { name: 'Atelier d’orfèvrerie', icon: '💍', slots: ['ring', 'amulet'], desc: 'Anneaux et amulettes' },
};
export const WORKSHOP_FX = { quality: 0.25, discount: 0.15, surcharge: 0.1, changeCost: { gold: 1000 }, cooldownH: 24 };
export const DUNGEON_PLAN_CHANCE = 1 / 3;
