// Équipement des héros
export const SLOTS = {
  weapon: { name: 'Arme', icon: '🗡️' },
  helmet: { name: 'Casque', icon: '⛑️' },
  armor:  { name: 'Armure', icon: '🥋' },
  gloves: { name: 'Gants', icon: '🧤' },
  boots:  { name: 'Bottes', icon: '🥾' },
  ring:   { name: 'Anneau', icon: '💍' },
  amulet: { name: 'Amulette', icon: '📿' },
};
export const SLOT_ORDER = Object.keys(SLOTS);

// Affixes : valeur de base (au niveau d'objet 1, rareté commune). pct: affiché en %.
// ctx: où l'affixe s'applique → commander (marche), governor (intendant), hero (stat du héros), global
export const AFFIXES = {
  'combat.atk':    { name: 'Attaque', base: 0.03, pct: true, ctx: 'commander' },
  'combat.def':    { name: 'Défense', base: 0.03, pct: true, ctx: 'commander' },
  'combat.morale': { name: 'Moral', base: 3, pct: false, ctx: 'commander' },
  'combat.losses': { name: 'Pertes', base: -0.02, pct: true, ctx: 'commander' },
  'gather.all':    { name: 'Récolte', base: 0.04, pct: true, ctx: 'commander' },
  'gather.iron':   { name: 'Récolte de minerai', base: 0.07, pct: true, ctx: 'commander' },
  'gather.wood':   { name: 'Récolte de bois', base: 0.07, pct: true, ctx: 'commander' },
  'gather.stone':  { name: 'Récolte de pierre', base: 0.07, pct: true, ctx: 'commander' },
  'explore.speed': { name: 'Vitesse d’exploration', base: 0.05, pct: true, ctx: 'commander' },
  'march.speed':   { name: 'Vitesse de marche', base: 0.03, pct: true, ctx: 'commander' },
  'loot.rare':     { name: 'Butin rare', base: 0.015, pct: true, ctx: 'commander' },
  'carry':         { name: 'Capacité de transport', base: 0.05, pct: true, ctx: 'commander' },
  'prod.food':     { name: 'Production de nourriture', base: 0.03, pct: true, ctx: 'governor' },
  'prod.wood':     { name: 'Production de bois', base: 0.03, pct: true, ctx: 'governor' },
  'prod.iron':     { name: 'Production de fer', base: 0.03, pct: true, ctx: 'governor' },
  'prod.gold':     { name: 'Production d’or', base: 0.03, pct: true, ctx: 'governor' },
  'prod.all':      { name: 'Toute production', base: 0.015, pct: true, ctx: 'governor' },
  'research.speed':{ name: 'Vitesse de recherche', base: 0.03, pct: true, ctx: 'governor' },
  'craft.quality': { name: 'Qualité de forge', base: 0.04, pct: true, ctx: 'governor' },
  'stat.force':    { name: 'Force', base: 2, pct: false, ctx: 'hero' },
  'stat.command':  { name: 'Commandement', base: 2, pct: false, ctx: 'hero' },
  'stat.cunning':  { name: 'Ruse', base: 2, pct: false, ctx: 'hero' },
  'stat.lore':     { name: 'Savoir', base: 2, pct: false, ctx: 'hero' },
  'hero.xp':       { name: 'Expérience', base: 0.05, pct: true, ctx: 'hero' },
};

// Bases d'objets : chaque base a un affixe signature (fixe) et des affixes possibles.
export const ITEM_BASES = {
  // Armes
  minerSword:   { slot: 'weapon', name: 'Épée du Mineur', sig: { 'gather.iron': 2.2 }, pool: ['gather.all', 'gather.stone', 'carry', 'stat.force'] },
  generalSword: { slot: 'weapon', name: 'Épée du Général', sig: { 'combat.atk': 3.3 }, pool: ['combat.def', 'combat.morale', 'stat.force', 'stat.command'] },
  ancientBlade: { slot: 'weapon', name: 'Lame ancienne', sig: { 'combat.atk': 1.6, 'explore.speed': 1, 'loot.rare': 2 }, pool: ['loot.rare', 'stat.cunning', 'combat.atk'], minRarity: 'rare' },
  woodAxe:      { slot: 'weapon', name: 'Hache de bûcheron', sig: { 'gather.wood': 2.2 }, pool: ['gather.all', 'carry', 'prod.wood'] },
  huntBow:      { slot: 'weapon', name: 'Arc de chasse', sig: { 'loot.rare': 1.2, 'gather.all': 1 }, pool: ['explore.speed', 'stat.cunning', 'march.speed'] },
  scepter:      { slot: 'weapon', name: 'Sceptre d’intendant', sig: { 'prod.all': 1.5 }, pool: ['prod.gold', 'prod.food', 'research.speed', 'stat.lore'] },
  forgeHammer:  { slot: 'weapon', name: 'Marteau de forge', sig: { 'craft.quality': 2 }, pool: ['prod.iron', 'stat.lore', 'stat.force'] },
  // Casques
  ironHelm:     { slot: 'helmet', name: 'Heaume de fer', sig: { 'combat.def': 1.5 }, pool: ['combat.morale', 'stat.command', 'combat.losses'] },
  scoutHood:    { slot: 'helmet', name: 'Capuche d’éclaireur', sig: { 'explore.speed': 1.5 }, pool: ['loot.rare', 'stat.cunning', 'march.speed'] },
  scholarCap:   { slot: 'helmet', name: 'Toque d’érudit', sig: { 'research.speed': 1.5 }, pool: ['stat.lore', 'prod.all', 'hero.xp'] },
  // Armures
  plateArmor:   { slot: 'armor', name: 'Armure de plates', sig: { 'combat.def': 2.5 }, pool: ['combat.losses', 'stat.command', 'combat.morale'] },
  leatherVest:  { slot: 'armor', name: 'Brigandine de cuir', sig: { 'march.speed': 1.5 }, pool: ['carry', 'gather.all', 'explore.speed'] },
  farmerSmock:  { slot: 'armor', name: 'Tablier de fermier', sig: { 'prod.food': 2.5 }, pool: ['prod.all', 'stat.lore', 'prod.wood'] },
  // Gants
  minerGloves:  { slot: 'gloves', name: 'Gantelets de mineur', sig: { 'gather.stone': 1.5, 'gather.iron': 1 }, pool: ['carry', 'gather.all', 'prod.iron'] },
  duelGloves:   { slot: 'gloves', name: 'Gants de duelliste', sig: { 'combat.atk': 1.2 }, pool: ['stat.force', 'combat.morale', 'loot.rare'] },
  // Bottes
  roadBoots:    { slot: 'boots', name: 'Bottes de route', sig: { 'march.speed': 2 }, pool: ['explore.speed', 'carry', 'gather.all'] },
  warBoots:     { slot: 'boots', name: 'Solerets de guerre', sig: { 'combat.def': 1.2 }, pool: ['combat.morale', 'stat.command', 'combat.atk'] },
  // Anneaux
  goldRing:     { slot: 'ring', name: 'Chevalière marchande', sig: { 'prod.gold': 2.5 }, pool: ['prod.all', 'stat.cunning', 'hero.xp'] },
  wolfRing:     { slot: 'ring', name: 'Anneau du loup', sig: { 'combat.atk': 1.2, 'stat.force': 1 }, pool: ['combat.morale', 'loot.rare', 'stat.force'] },
  luckRing:     { slot: 'ring', name: 'Anneau de fortune', sig: { 'loot.rare': 2 }, pool: ['gather.all', 'stat.cunning', 'explore.speed'] },
  // Amulettes
  crystalAmulet:{ slot: 'amulet', name: 'Amulette de cristal', sig: { 'research.speed': 1.5, 'prod.all': 1 }, pool: ['stat.lore', 'hero.xp', 'loot.rare'] },
  warAmulet:    { slot: 'amulet', name: 'Talisman du guerrier', sig: { 'combat.morale': 2 }, pool: ['combat.atk', 'combat.def', 'stat.command'] },
  sageAmulet:   { slot: 'amulet', name: 'Médaillon du sage', sig: { 'hero.xp': 3 }, pool: ['stat.lore', 'stat.cunning', 'research.speed'] },
};

// Objets uniques (boss, événements)
export const UNIQUE_ITEMS = {
  dragonFang:   { slot: 'weapon', name: 'Croc du Dragon de Cendre', rarity: 'mythic', affixes: { 'combat.atk': 0.25, 'combat.morale': 15, 'loot.rare': 0.06 } },
  giantCrown:   { slot: 'helmet', name: 'Couronne du Géant', rarity: 'legendary', affixes: { 'combat.def': 0.18, 'stat.command': 12 } },
  banditCloak:  { slot: 'armor', name: 'Manteau du Roi des Bandits', rarity: 'legendary', affixes: { 'march.speed': 0.2, 'carry': 0.3, 'loot.rare': 0.05 } },
  golemHeart:   { slot: 'amulet', name: 'Cœur de Golem', rarity: 'legendary', affixes: { 'prod.all': 0.1, 'stat.lore': 10 } },
  lichRing:     { slot: 'ring', name: 'Anneau du Liche', rarity: 'mythic', affixes: { 'combat.losses': -0.2, 'stat.cunning': 15, 'hero.xp': 0.3 } },
  kingdomBreaker:{ slot: 'weapon', name: 'Brise-Royaume', rarity: 'mythic', affixes: { 'combat.atk': 0.22, 'siege.power': 0.25, 'stat.force': 12 } },
  spectralSteed:{ slot: 'boots', name: 'Destrier spectral', rarity: 'legendary', affixes: { 'march.speed': 0.3, 'explore.speed': 0.2 } },
  khanSword:    { slot: 'weapon', name: 'Épée du Khan', rarity: 'legendary', affixes: { 'combat.atk': 0.14, 'class.cavalry.atk': 0.1, 'march.speed': 0.1 } },
  steppeBow:    { slot: 'gloves', name: 'Arc composite des steppes', rarity: 'epic', affixes: { 'combat.atk': 0.07, 'loot.rare': 0.03 } },
  captainSabre: { slot: 'weapon', name: 'Sabre du capitaine', rarity: 'legendary', affixes: { 'combat.atk': 0.1, 'carry': 0.3, 'caravan.gain': 0.08 } },
  giantMantle:  { slot: 'armor', name: 'Manteau du Roi des Géants', rarity: 'legendary', affixes: { 'combat.def': 0.16, 'stat.command': 10 } },
  ancientRing:  { slot: 'ring', name: 'Anneau de l’Ancien Roi', rarity: 'legendary', affixes: { 'research.speed': 0.1, 'prod.all': 0.06, 'stat.lore': 10 } },
  dragonScale:  { slot: 'armor', name: 'Écaille du Dragon', rarity: 'mythic', affixes: { 'combat.def': 0.2, 'combat.losses': -0.15 } },
  warBanner:    { slot: 'amulet', name: 'Étendard du conquérant', rarity: 'legendary', affixes: { 'combat.morale': 15, 'combat.atk': 0.06 } },
  goldPick:     { slot: 'gloves', name: 'Pic d’or massif', rarity: 'legendary', affixes: { 'gather.all': 0.2, 'loot.rare': 0.03 } },
  obsidianHelm: { slot: 'helmet', name: 'Heaume d’obsidienne', rarity: 'legendary', affixes: { 'combat.def': 0.12, 'combat.losses': -0.08 } },
  boneCrown:    { slot: 'helmet', name: 'Couronne d’os', rarity: 'legendary', affixes: { 'combat.morale': 12, 'city.def': 0.1 } },
  bastionShield:{ slot: 'armor', name: 'Bouclier des Anciens', rarity: 'legendary', affixes: { 'city.def': 0.15, 'combat.def': 0.1 } },
  emberCompass: { slot: 'amulet', name: 'Boussole des Braises', rarity: 'epic', affixes: { 'explore.speed': 0.25, 'loot.rare': 0.04 } },
};

// Recettes de forge par emplacement
export const CRAFT_RECIPES = {
  weapon: { cost: { steel: 20, wood: 40, coal: 15 }, time: 240 },
  helmet: { cost: { steel: 12, leather: 8 }, time: 180 },
  armor:  { cost: { steel: 18, leather: 12, cloth: 10 }, time: 300 },
  gloves: { cost: { leather: 12, cloth: 6 }, time: 160 },
  boots:  { cost: { leather: 14, iron: 20 }, time: 160 },
  ring:   { cost: { silver: 4, gems: 1, gold: 120 }, time: 360 },
  amulet: { cost: { silver: 4, crystals: 1, gold: 120 }, time: 360 },
};
// Catalyseurs optionnels
export const CATALYSTS = {
  none:    { name: 'Aucun', cost: {}, boost: 0 },
  crystal: { name: 'Éclat de cristal', cost: { crystals: 2 }, boost: 0.6, desc: 'Rareté nettement meilleure' },
  rareOre: { name: 'Minerai rare', cost: { rareOre: 3 }, boost: 1.4, minRarity: 'rare', desc: 'Au moins Rare, chances épiques/légendaires accrues' },
};

// Consommables (laboratoire)
export const CONSUMABLES = {
  healPotion:   { name: 'Potion de soin', icon: '🧪', cost: { herbs: 30 }, time: 30, lab: 1, desc: 'Attachée à une marche : −30% pertes au prochain combat.', march: { 'combat.losses': -0.3 } },
  warTonic:     { name: 'Tonique de guerre', icon: '🍷', cost: { herbs: 40, bread: 10 }, time: 45, lab: 2, desc: 'Attaché à une marche : +12% attaque, +10 moral.', march: { 'combat.atk': 0.12, 'combat.morale': 10 } },
  harvestElixir:{ name: 'Élixir de récolte', icon: '🌱', cost: { herbs: 50, crystals: 1 }, time: 60, lab: 3, desc: 'Buff 1 h : +25% récolte des marches.', buff: { mods: { 'gather.all': 0.25 }, duration: 3600 } },
  fervorElixir: { name: 'Élixir de ferveur', icon: '✨', cost: { herbs: 60, crystals: 2 }, time: 90, lab: 4, desc: 'Buff 1 h : +20% production.', buff: { mods: { 'prod.all': 0.2 }, duration: 3600 } },
  luckPhilter:  { name: 'Philtre de chance', icon: '🍀', cost: { herbs: 40, gems: 1 }, time: 60, lab: 5, desc: 'Buff 1 h : +8% butin rare.', buff: { mods: { 'loot.rare': 0.08 }, duration: 3600 } },
  swiftOil:     { name: 'Onguent de célérité', icon: '💨', cost: { herbs: 30, leather: 5 }, time: 40, lab: 2, desc: 'Buff 1 h : +30% vitesse de marche.', buff: { mods: { 'march.speed': 0.3 }, duration: 3600 } },
};
