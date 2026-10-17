// Personnages itinérants de la carte du monde (PNJ). Ils apparaissent d'eux-mêmes autour du royaume (plus nombreux
// à mesure que l'hôtel de ville grandit), restent un à trois jours, puis repartent. Pour traiter avec l'un d'eux, on
// envoie une petite troupe « Rencontrer » (un éclaireur suffit) : à son arrivée, une décision propose ses offres.
// Chaque offre a un coût vérifié au moment du choix (jamais de stock négatif) et un effet réel sur le jeu.
// Les montants suivent le niveau d'hôtel de ville (th) pour rester intéressants du début à la fin de partie.
export const NPC_MIN_TH = 2;
export const npcCap = (th) => Math.min(10, 4 + Math.floor(th / 3));
export const NPC_SPAWN_MIN = [60, 150];   // minutes entre deux apparitions
export const NPC_STAY_H = { min: 36, max: 72 };

export const NPCS = {
  peddler: { name: 'Marchand ambulant', icon: '🧳', weight: 4, desc: 'Une carriole chargée de marchandises : il vend à bon prix et rachète vos surplus mieux que le marché.' },
  hermit: { name: 'Ermite savant', icon: '🧙', weight: 2, desc: 'Un vieil érudit retiré du monde : leçons, vieilles routes et sagesse.' },
  mercenary: { name: 'Capitaine mercenaire', icon: '🗡️', weight: 3, desc: 'Une compagnie libre cherche un employeur. Ses soldats coûtent cher, mais arrivent aussitôt.' },
  pilgrims: { name: 'Pèlerins', icon: '🙏', weight: 2, desc: 'Une colonne de pèlerins en route vers un sanctuaire : ils se souviendront de votre hospitalité.' },
  bountyHunter: { name: 'Chasseur de primes', icon: '🎯', weight: 2, desc: 'Il paie bien qui nettoie les repaires de la région, et vend ce qu’il sait.' },
  smith: { name: 'Forgeron itinérant', icon: '🔨', weight: 2, desc: 'Un maître forgeron de passage : il affûte vos lames et vend parfois un plan.' },
  cartographer: { name: 'Cartographe errant', icon: '🗺️', weight: 2, desc: 'Ses cartes couvrent des régions que vos éclaireurs n’ont jamais vues.' },
};
// Lots du marchand ambulant
export const PEDDLER_GOODS = ['wood', 'stone', 'iron', 'food', 'planks', 'cloth', 'leather', 'coal'];
