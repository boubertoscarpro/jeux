// Toutes les ressources du jeu. `cat` : base | advanced | inter (intermédiaire) | rare
// `price` : prix de référence en or sur le marché (0 = non échangeable)
export const RESOURCES = {
  wood:        { name: 'Bois',          icon: '🪵', cat: 'base',     price: 1.0,  uses: 'Bâtiments, armes, fortifications, bateaux, charbon' },
  stone:       { name: 'Pierre',        icon: '🪨', cat: 'base',     price: 1.1,  uses: 'Bâtiments, murailles, tours' },
  iron:        { name: 'Fer',           icon: '⛓️', cat: 'base',     price: 2.0,  uses: 'Armes, armures, machines de siège, acier' },
  food:        { name: 'Nourriture',    icon: '🍖', cat: 'base',     price: 0.8,  uses: 'Entretien de l’armée, formation des troupes' },
  gold:        { name: 'Or',            icon: '🪙', cat: 'base',     price: 0,    uses: 'Héros, commerce, recherches, améliorations' },

  coal:        { name: 'Charbon',       icon: '🌑', cat: 'advanced', price: 3.0,  uses: 'Fonderie (acier), forge' },
  leather:     { name: 'Cuir',          icon: '🟫', cat: 'advanced', price: 4.0,  uses: 'Armures légères, cavalerie, bottes, gants' },
  steel:       { name: 'Acier',         icon: '🔩', cat: 'advanced', price: 7.0,  uses: 'Armes, armures lourdes, unités d’élite' },
  cloth:       { name: 'Tissu',         icon: '🧵', cat: 'advanced', price: 4.5,  uses: 'Armures, voiles, bannières, caravanes' },
  herbs:       { name: 'Herbes',        icon: '🌿', cat: 'advanced', price: 2.5,  uses: 'Potions, soins, buffs temporaires' },
  silver:      { name: 'Argent',        icon: '🥈', cat: 'rare',     price: 12,   uses: 'Anneaux, amulettes, commerce de luxe' },
  gems:        { name: 'Gemmes',        icon: '💎', cat: 'rare',     price: 25,   uses: 'Bijoux, enchantements, recrutement de héros rares' },
  crystals:    { name: 'Cristaux',      icon: '🔮', cat: 'rare',     price: 30,   uses: 'Recherches anciennes, élixirs, bâtiments uniques' },
  rareOre:     { name: 'Minerai rare',  icon: '☄️', cat: 'rare',     price: 40,   uses: 'Équipements légendaires, bâtiments spéciaux, ascension des héros' },
  ancientWood: { name: 'Bois ancien',   icon: '🌳', cat: 'rare',     price: 22,   uses: 'Arcs d’élite, trébuchets, bâtiments uniques' },

  planks:      { name: 'Planches',      icon: '🪚', cat: 'advanced', price: 2.2,  uses: 'Charpente, armes, caravanes, bâtiments avancés' },
  frames:      { name: 'Charpente',     icon: '🏗️', cat: 'advanced', price: 9,    uses: 'Machines de siège, automatisation, grands bâtiments' },
  weapons:     { name: 'Armes',         icon: '⚔️', cat: 'advanced', price: 14,   uses: 'Troupes d’élite (soldats lourds, chevaliers, arbalétriers…)' },
  rations:     { name: 'Rations',       icon: '🥫', cat: 'advanced', price: 5,    uses: 'Ravitaillement des expéditions et des armées (+moral, +rendement)' },
  grain:       { name: 'Blé',           icon: '🌾', cat: 'inter',    price: 0.6,  uses: 'Moulin → farine' },
  flour:       { name: 'Farine',        icon: '🥣', cat: 'inter',    price: 1.5,  uses: 'Boulangerie → pain' },
  bread:       { name: 'Pain',          icon: '🍞', cat: 'inter',    price: 3.0,  uses: 'Ravitaillement des armées (+moral au combat)' },
  hides:       { name: 'Peaux',         icon: '🐾', cat: 'inter',    price: 1.5,  uses: 'Tannerie → cuir' },
  wool:        { name: 'Laine',         icon: '🐑', cat: 'inter',    price: 1.5,  uses: 'Tisserand → tissu' },
};

export const RES_ORDER = Object.keys(RESOURCES);
export const BASE_RES = RES_ORDER.filter((r) => RESOURCES[r].cat === 'base');
export const RARE_RES = RES_ORDER.filter((r) => RESOURCES[r].cat === 'rare');
export const TRADABLE = RES_ORDER.filter((r) => RESOURCES[r].price > 0);

// Les ressources rares et l'or ne sont pas limitées par l'entrepôt.
export const isCapped = (r) => RESOURCES[r].cat !== 'rare' && r !== 'gold';
