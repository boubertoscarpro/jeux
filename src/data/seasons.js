// Calendrier : une saison dure 3 h réelles, une année 12 h.
export const SEASON_HOURS = 3;

export const SEASONS = [
  { key: 'spring', name: 'Printemps', icon: '🌱', desc: 'Les champs reverdissent : agriculture +15%, régénération des sites +30%.', mods: { 'prod.food': 0.15, 'prod.grain': 0.15, 'prod.herbs': 0.2, 'node.regen': 0.3 }, weather: { rain: 30, clear: 40, fog: 15, storm: 8 } },
  { key: 'summer', name: 'Été', icon: '☀️', desc: 'Production alimentaire +20%, laine +15%, risque de canicule et de sécheresse.', mods: { 'prod.food': 0.2, 'prod.wool': 0.15, 'march.speed': 0.05 }, weather: { clear: 50, heat: 25, storm: 10, rain: 10 } },
  { key: 'autumn', name: 'Automne', icon: '🍂', desc: 'Moissons : blé +35%, gibier et peaux +20%, foires d’automne (caravanes +10%).', mods: { 'prod.grain': 0.35, 'prod.hides': 0.2, 'prod.food': 0.05, 'caravan.gain': 0.1 }, weather: { rain: 30, fog: 25, clear: 30, storm: 10 } },
  { key: 'winter', name: 'Hiver', icon: '❄️', desc: 'Agriculture −35%, entretien +25%, déplacements −20%, charbon +20%.', mods: { 'prod.food': -0.35, 'prod.grain': -0.5, upkeep: 0.25, 'march.speed': -0.2, 'caravan.speed': -0.2, 'prod.coal': 0.2 }, weather: { snow: 50, clear: 25, fog: 15, storm: 10 } },
];

// Effets des saisons sur les campagnes militaires (durée des opérations, attaque) — annoncés dans l'onglet Campagnes
export const SEASON_WAR = {
  spring: { time: 1, atk: 0, text: 'Printemps : routes boueuses mais praticables, aucun effet.' },
  summer: { time: 0.9, atk: 0.05, text: 'Été : saison des campagnes, opérations 10 % plus rapides, attaque +5 %.' },
  autumn: { time: 1, atk: 0, text: 'Automne : aucun effet sur les campagnes ; foires d’automne (caravanes +10 %).' },
  winter: { time: 1.25, atk: -0.1, text: 'Hiver : opérations 25 % plus longues, attaque −10 %. Mieux vaut préparer le printemps.' },
};
// Adaptation à l'hiver : la clé « winter.resist » réduit les malus de nourriture et de grain de l'hiver (Moissons,
// Jardin royal, Intendance héréditaire)
export const WINTER_FOOD_KEYS = ['prod.food', 'prod.grain'];

// Catastrophes rares : saison(s) possible(s), probabilité par heure
export const CATASTROPHES = {
  blizzard: { name: 'Blizzard', icon: '🌨️', seasons: ['winter'], chance: 0.08, duration: 3600, mods: { 'march.speed': -0.4, 'prod.wood': -0.2 }, expInjury: 0.15, weather: 'snow', text: 'Un blizzard paralyse la région : marches ralenties, expéditions dangereuses.' },
  drought: { name: 'Sécheresse', icon: '🔥', seasons: ['summer'], chance: 0.07, duration: 5400, mods: { 'prod.food': -0.3, 'prod.grain': -0.4 }, fireRisk: 0.25, weather: 'heat', text: 'La sécheresse dessèche les champs. Les forêts risquent de brûler.' },
  eruption: { name: 'Éruption volcanique', icon: '🌋', seasons: ['spring', 'summer', 'autumn', 'winter'], chance: 0.012, duration: 3600, mods: { 'prod.food': -0.1 }, crystals: true, text: 'Un volcan des Terres de cendre se réveille ! Des cristaux affleurent dans les cendres.' },
  flood: { name: 'Inondation', icon: '🌊', seasons: ['spring', 'autumn'], chance: 0.06, duration: 3600, mods: { 'caravan.speed': -0.3 }, flood: true, weather: 'rain', text: 'La rivière déborde : les bâtiments au bord de l’eau sont touchés, mais les terres seront fertiles.' },
  tempest: { name: 'Tempête', icon: '🌪️', seasons: ['autumn', 'winter', 'spring'], chance: 0.06, duration: 2700, mods: { 'prod.wood': 0.1 }, convoyRisk: 0.25, weather: 'storm', text: 'Une tempête balaie le royaume : convois en danger, arbres abattus (bois +10%).' },
};
