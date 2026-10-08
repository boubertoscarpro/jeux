// Événements mondiaux dynamiques
// mods: modificateurs globaux actifs pendant l'événement ; market: multiplicateurs de prix
// spawn: sites générés à l'apparition ; minTH: niveau d'hôtel de ville requis
export const WORLD_EVENTS = {
  banditHorde: {
    name: 'Horde de bandits', icon: '🏴', duration: 3600, weight: 10,
    text: 'Une horde de bandits envahit la région ! Des camps apparaissent près de votre capitale.',
    market: { food: 1.25, iron: 1.2 }, spawn: { type: 'banditCamp', count: 3, near: 8 },
  },
  legendaryMine: {
    name: 'Filon légendaire', icon: '☄️', duration: 5400, weight: 5, minTH: 4,
    text: 'Une mine légendaire vient d’être découverte dans les Terres Brisées !',
    spawn: { type: 'rareVein', count: 1, far: true },
  },
  harshWinter: {
    name: 'Hiver rude', icon: '❄️', duration: 3600, weight: 7,
    text: 'Un hiver particulièrement violent commence. Les récoltes souffrent, les fourrures valent de l’or.',
    weather: 'snow', mods: { 'prod.food': -0.15, upkeep: 0.15 }, market: { food: 1.4, leather: 1.5, coal: 1.4, cloth: 1.3 },
  },
  mysteriousMerchant: {
    name: 'Marchand mystérieux', icon: '🧙', duration: 1800, weight: 6,
    text: 'Un marchand mystérieux est apparu au marché avec des marchandises venues d’ailleurs.',
    merchant: true,
  },
  dragonAttack: {
    name: 'Attaque du dragon', icon: '🐉', duration: 1800, weight: 3, minTH: 5,
    text: 'Un dragon attaque plusieurs royaumes ! Le boss mondial apparaît.',
    boss: 'dragon', market: { food: 1.15 },
  },
  factionWar: {
    name: 'Guerre des factions', icon: '⚔️', duration: 3600, weight: 6, minTH: 3,
    text: 'Une guerre éclate entre deux royaumes rivaux ! Fer et nourriture flambent, les belligérants sont affaiblis.',
    market: { iron: 1.5, food: 1.35, steel: 1.4 }, rivalsWeaken: 0.25,
  },
  infestation: {
    name: 'Infestation', icon: '🕷️', duration: 5400, weight: 6,
    text: 'Des créatures ont infesté une forêt proche : danger accru, mais ressources doublées.',
    infest: true,
  },
  harvestFestival: {
    name: 'Fête des moissons', icon: '🎉', duration: 2700, weight: 6,
    text: 'La fête des moissons réjouit le peuple : +25% nourriture et recrutement de héros moins cher.',
    mods: { 'prod.food': 0.25, 'hero.discount': 0.3 }, market: { food: 0.8 },
  },
  crystalRain: {
    name: 'Pluie de cristaux', icon: '🌠', duration: 3600, weight: 4, minTH: 3,
    text: 'Des éclats de cristal tombent du ciel. Des grottes de cristaux se forment.',
    spawn: { type: 'crystalNode', count: 3, near: 14 },
  },
  newRegion: {
    name: 'Terres nouvelles', icon: '🗺️', duration: 600, weight: 3, minTH: 4,
    text: 'Un séisme a ouvert une passe vers une région inexplorée !',
    revealRegion: true,
  },
  goldRush: {
    name: 'Ruée vers l’argent', icon: '🥈', duration: 2700, weight: 4, minTH: 3,
    text: 'Des prospecteurs affluent : les veines d’argent se multiplient et l’argent se vend cher.',
    spawn: { type: 'silverNode', count: 2, near: 12 }, market: { silver: 1.4 },
  },
};

export const WEATHER_CYCLE = { clear: 40, rain: 20, fog: 12, storm: 8, heat: 8, snow: 6 };
export const WEATHER_DURATION = [8 * 60, 15 * 60]; // secondes
