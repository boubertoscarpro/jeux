// Arbre technologique. tier 1..5. mastery: technologie de maîtrise (limitée).
// excl: groupe exclusif (une seule technologie par groupe).
export const BRANCHES = {
  economy:     { name: 'Économie', icon: '🪙', desc: 'Production et commerce' },
  agriculture: { name: 'Agriculture', icon: '🌾', desc: 'Nourriture et élevage' },
  military:    { name: 'Militaire', icon: '⚔️', desc: 'Armées et sièges' },
  exploration: { name: 'Exploration', icon: '🧭', desc: 'Carte et expéditions' },
  craft:       { name: 'Artisanat', icon: '⚒️', desc: 'Forge et équipement' },
  defense:     { name: 'Défense', icon: '🧱', desc: 'Murailles et bâtiments défensifs' },
  magic:       { name: 'Savoir ancien', icon: '🔮', desc: 'Secrets de la Fracture (endgame)' },
};

export const MAX_MASTERIES = 2;

const T = (branch, tier, name, desc, mods, req = [], extra = {}) => ({ branch, tier, name, desc, mods, req, ...extra });

export const TECHS = {
  // ÉCONOMIE
  eco_tools:       T('economy', 1, 'Outils affûtés', '+8% bois et pierre', { 'prod.wood': 0.08, 'prod.stone': 0.08 }),
  eco_taxes:       T('economy', 1, 'Registre des impôts', '+10% or', { 'prod.gold': 0.1 }),
  eco_storage:     T('economy', 2, 'Greniers voûtés', '+20% stockage', { 'storage.pct': 0.2 }, ['eco_tools']),
  eco_guilds:      T('economy', 2, 'Corporations', '−2% taxe du marché, +1 caravane', { 'market.fee': -0.02, caravans: 1 }, ['eco_taxes']),
  eco_masonry:     T('economy', 2, 'Maçonnerie', '−5% coût des bâtiments, +10% pierre', { 'prod.stone': 0.1, 'build.cost': -0.05 }, ['eco_tools']),
  eco_scaffold:    T('economy', 3, 'Échafaudages', '+15% vitesse de construction', { 'build.speed': 0.15 }, ['eco_masonry']),
  eco_queue:       T('economy', 3, 'Maîtres d’œuvre', '+1 file de construction', { buildQueue: 1 }, ['eco_scaffold']),
  eco_banking:     T('economy', 4, 'Banques lombardes', '+20% or, +20% gains de caravane', { 'prod.gold': 0.2, 'caravan.gain': 0.2 }, ['eco_guilds']),
  eco_mastery:     T('economy', 5, 'Maîtrise : Royaume marchand', '+12% toute production, −3% taxe', { 'prod.all': 0.12, 'market.fee': -0.03 }, ['eco_banking', 'eco_queue'], { mastery: true }),

  // AGRICULTURE
  agr_plough:      T('agriculture', 1, 'Charrue lourde', '+10% nourriture', { 'prod.food': 0.1 }),
  agr_rotation:    T('agriculture', 2, 'Assolement triennal', '+25% blé', { 'prod.grain': 0.25 }, ['agr_plough'], { excl: 'agr_focus' }),
  agr_pastures:    T('agriculture', 2, 'Grands pâturages', '+25% laine et peaux', { 'prod.wool': 0.25, 'prod.hides': 0.25 }, ['agr_plough'], { excl: 'agr_focus' }),
  agr_watermill:   T('agriculture', 2, 'Roue hydraulique', '+20% farine', { 'prod.flour': 0.2 }, ['agr_plough']),
  agr_ovens:       T('agriculture', 3, 'Fours communaux', '+25% pain', { 'prod.bread': 0.25 }, ['agr_watermill']),
  agr_rations:     T('agriculture', 3, 'Rations militaires', '−12% entretien de l’armée', { upkeep: -0.12 }, ['agr_watermill']),
  agr_herbs:       T('agriculture', 3, 'Jardins de simples', '+20% herbes', { 'prod.herbs': 0.2 }, ['agr_plough']),
  agr_irrigation:  T('agriculture', 4, 'Irrigation', '+20% nourriture, bonus rivière doublé', { 'prod.food': 0.2, 'adj.river': 1 }, ['agr_rotation', 'agr_ovens'], { reqAny: true }),
  agr_mastery:     T('agriculture', 5, 'Maîtrise : Grenier du monde', '+30% nourriture, −20% entretien', { 'prod.food': 0.3, upkeep: -0.2 }, ['agr_irrigation'], { mastery: true }),

  // MILITAIRE
  mil_drill:       T('military', 1, 'Exercices', '+10% vitesse de formation', { 'train.speed': 0.1 }),
  mil_weapons:     T('military', 1, 'Armes forgées', '+5% attaque', { 'combat.atk': 0.05 }),
  mil_crossbow:    T('military', 2, 'Arbalètes', 'Débloque l’arbalétrier', {}, ['mil_weapons'], { unlock: 'crossbow' }),
  mil_heavy:       T('military', 2, 'Cottes de mailles', 'Débloque le soldat lourd, +5% défense', { 'combat.def': 0.05 }, ['mil_drill'], { unlock: 'heavy' }),
  mil_cavalry:     T('military', 2, 'Dressage', 'Débloque le chevalier', {}, ['mil_drill'], { unlock: 'knight' }),
  mil_siege:       T('military', 3, 'Poliorcétique', 'Débloque catapulte, +20% efficacité de siège', { 'siege.power': 0.2 }, ['mil_weapons'], { unlock: 'catapult' }),
  mil_tactics:     T('military', 3, 'Traités de tactique', '+10 moral, +1 marche', { 'combat.morale': 10, marches: 1 }, ['mil_crossbow', 'mil_heavy']),
  mil_doctrine_a:  T('military', 3, 'Doctrine du choc', '+12% attaque cavalerie & infanterie lourde', { 'class.cavalry.atk': 0.12, 'unit.heavy.atk': 0.12 }, ['mil_cavalry'], { excl: 'mil_doctrine' }),
  mil_doctrine_b:  T('military', 3, 'Doctrine de la volée', '+15% attaque à distance', { 'class.ranged.atk': 0.15 }, ['mil_crossbow'], { excl: 'mil_doctrine' }),
  mil_heavycav:    T('military', 4, 'Destriers caparaçonnés', 'Débloque le cavalier lourd', {}, ['mil_cavalry', 'mil_tactics'], { unlock: 'heavycav' }),
  mil_assassins:   T('military', 4, 'Confrérie de l’ombre', 'Débloque l’assassin', {}, ['mil_tactics'], { unlock: 'assassin' }),
  mil_trebuchet:   T('military', 4, 'Contrepoids', 'Débloque le trébuchet', {}, ['mil_siege'], { unlock: 'trebuchet' }),
  mil_mastery:     T('military', 5, 'Maîtrise : Ost royal', '+15% attaque, +10% défense, +1 marche', { 'combat.atk': 0.15, 'combat.def': 0.1, marches: 1 }, ['mil_heavycav', 'mil_trebuchet'], { mastery: true, reqAny: true }),

  // EXPLORATION
  exp_maps:        T('exploration', 1, 'Cartes routières', '+10% vitesse de marche', { 'march.speed': 0.1 }),
  exp_cartography: T('exploration', 1, 'Cartographie', '+1 rayon de révélation', { 'explore.radius': 1 }),
  exp_scouting:    T('exploration', 2, 'Pistage', '−25% risque d’embuscade', { 'ambush.reduce': 0.25 }, ['exp_maps']),
  exp_carts:       T('exploration', 2, 'Charrettes', '+20% capacité de transport', { carry: 0.2 }, ['exp_maps']),
  exp_cartography2:T('exploration', 2, 'Atlas des Terres Brisées', '+15% vitesse d’exploration', { 'explore.speed': 0.15 }, ['exp_cartography']),
  exp_prospect:    T('exploration', 3, 'Prospection', '+15% récolte, +3% butin rare', { 'gather.all': 0.15, 'loot.rare': 0.03 }, ['exp_carts']),
  exp_outposts:    T('exploration', 3, 'Avant-postes', '+2 territoires', { territories: 2 }, ['exp_scouting']),
  exp_cartography3:T('exploration', 4, 'Astrolabe', '+1 rayon, +15% exploration', { 'explore.radius': 1, 'explore.speed': 0.15 }, ['exp_cartography2', 'exp_prospect']),
  exp_mastery:     T('exploration', 5, 'Maîtrise : Pionniers', '+25% récolte, +6% butin rare, +2 territoires', { 'gather.all': 0.25, 'loot.rare': 0.06, territories: 2 }, ['exp_cartography3', 'exp_outposts'], { mastery: true }),

  // ARTISANAT
  cra_bellows:     T('craft', 1, 'Soufflets', '+15% charbon', { 'prod.coal': 0.15 }),
  cra_tanning:     T('craft', 1, 'Tannage au tan', '+15% cuir et tissu', { 'prod.leather': 0.15, 'prod.cloth': 0.15 }),
  cra_steel:       T('craft', 2, 'Acier au creuset', '+20% acier', { 'prod.steel': 0.2 }, ['cra_bellows']),
  cra_quality:     T('craft', 2, 'Guilde des forgerons', '+15% qualité de forge', { 'craft.quality': 0.15 }, ['cra_steel']),
  cra_salvage:     T('craft', 3, 'Recyclage', '+30% matériaux recyclés', { 'salvage.bonus': 0.3 }, ['cra_quality']),
  cra_alchemy:     T('craft', 3, 'Alambics', 'Potions +30% durée, −20% temps de distillation', { 'potion.duration': 0.3, 'craft.speed': 0.2 }, ['cra_tanning']),
  cra_masterwork:  T('craft', 4, 'Chefs-d’œuvre', '+25% qualité de forge, améliorations −20%', { 'craft.quality': 0.25, 'upgrade.cost': -0.2 }, ['cra_quality', 'cra_salvage']),
  cra_mastery:     T('craft', 5, 'Maîtrise : Forge légendaire', '+40% qualité, +20% acier', { 'craft.quality': 0.4, 'prod.steel': 0.2 }, ['cra_masterwork'], { mastery: true }),

  // DÉFENSE
  def_palisade:    T('defense', 1, 'Palissades', '+10% défense de la ville', { 'city.def': 0.1 }),
  def_watch:       T('defense', 1, 'Guet', 'Alerte des raids +50% plus tôt', { 'raid.warning': 0.5 }),
  def_masonry:     T('defense', 2, 'Remparts maçonnés', 'Muraille +25% efficacité', { 'wall.pct': 0.25 }, ['def_palisade']),
  def_hidden:      T('defense', 2, 'Caches secrètes', '+15% ressources protégées', { protect: 0.15 }, ['def_watch']),
  def_oil:         T('defense', 3, 'Poix bouillante', '+15% défense de la ville', { 'city.def': 0.15 }, ['def_masonry']),
  def_militia:     T('defense', 3, 'Milice urbaine', 'Les habitants défendent la ville (milice gratuite)', { militia: 1 }, ['def_masonry', 'def_hidden']),
  def_engineering: T('defense', 4, 'Génie militaire', 'Ingénieurs +100% retranchements', { 'engineer.power': 1 }, ['def_oil']),
  def_mastery:     T('defense', 5, 'Maîtrise : Citadelle', '+40% défense de la ville, +25% ressources protégées', { 'city.def': 0.4, protect: 0.25 }, ['def_engineering', 'def_militia'], { mastery: true }),

  // SAVOIR ANCIEN (endgame)
  mag_runes:       T('magic', 3, 'Runes de la Fracture', '+10% recherche', { 'research.speed': 0.1 }, ['exp_cartography2'], { cost: { crystals: 5 } }),
  mag_attune:      T('magic', 4, 'Harmonisation', '+5% chance de cristaux en récolte', { 'loot.crystal': 0.05 }, ['mag_runes'], { cost: { crystals: 15 } }),
  mag_resonance:   T('magic', 4, 'Résonance cristalline', 'Débloque le Sanctuaire des Cristaux', {}, ['mag_attune'], { cost: { crystals: 30, gems: 10 } }),
  mag_ascension:   T('magic', 5, 'Ascension héroïque', 'Héros : +50% expérience, +10 niveaux max', { 'hero.xp': 0.5, 'hero.maxLevel': 10 }, ['mag_resonance'], { cost: { crystals: 60, rareOre: 30 } }),
  mag_mastery:     T('magic', 5, 'Maîtrise : Héritiers de l’Aube', '+10% tout, butin rare +10%', { 'prod.all': 0.1, 'combat.atk': 0.1, 'loot.rare': 0.1 }, ['mag_ascension'], { mastery: true, cost: { crystals: 120, rareOre: 60, ancientWood: 40 } }),
};

// Coût d'une technologie (or + ressources selon palier)
export function techCost(id) {
  const t = TECHS[id];
  const k = Math.pow(3, t.tier - 1);
  const base = { gold: Math.round(120 * k), wood: Math.round(150 * k), stone: Math.round(120 * k) };
  if (t.tier >= 2) base.iron = Math.round(60 * k);
  if (t.tier >= 3) base.steel = Math.round(10 * k / 3);
  if (t.tier >= 4) base.silver = Math.round(4 * k / 9);
  if (t.tier >= 5) base.rareOre = 15;
  return { ...base, ...(t.cost || {}) };
}
export function techTime(id) {
  return 45 * Math.pow(3.2, TECHS[id].tier - 1) * 1000;
}
// Niveau de bibliothèque requis
export const techLibraryReq = (id) => Math.max(1, (TECHS[id].tier - 1) * 3);
