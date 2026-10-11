// Comptoir du Joaillier : boutique payée UNIQUEMENT en ressources rares (gemmes, cristaux, argent, minerai rare,
// bois ancien), jamais en argent réel. Chaque article a une limite quotidienne pour ne pas court-circuiter la forge,
// le laboratoire ou la production. Prix fixés d'après la valeur marchande des ressources (gemme ≈ 25 or, cristal ≈ 30).
// kind : item (équipement généré), buff (bonus temporaire), consumable (objets du laboratoire), speedup (chantiers),
//        xp (héros), relic (fragment de relique), worker (ouvrier).
export const SHOP_MIN_TH = 4;
export const SHOP_CATS = { equip: '🗡️ Équipement', boost: '✨ Faveurs royales', supply: '🧪 Fournitures', rare: '🏺 Raretés' };

export const SHOP_ITEMS = {
  rareGear:      { cat: 'equip', name: 'Pièce d’orfèvrerie', icon: '💍', desc: 'Un équipement rare au hasard, au niveau de votre hôtel de ville.', cost: { gems: 5, silver: 10 }, kind: 'item', rarity: 'rare', limit: 2 },
  epicGear:      { cat: 'equip', name: 'Chef-d’œuvre du joaillier', icon: '👑', desc: 'Un équipement épique au hasard.', cost: { gems: 14, silver: 20 }, kind: 'item', rarity: 'epic', limit: 1, th: 5 },
  ancientBow:    { cat: 'equip', name: 'Arme taillée dans le bois ancien', icon: '🏹', desc: 'Une arme épique, façonnée dans le bois des bosquets anciens.', cost: { ancientWood: 15, silver: 8 }, kind: 'item', rarity: 'epic', slot: 'weapon', limit: 1, th: 5 },
  legendGear:    { cat: 'equip', name: 'Relique d’orfèvre légendaire', icon: '🌟', desc: 'Un équipement légendaire au hasard. Une fois par jour.', cost: { gems: 30, rareOre: 15, crystals: 10 }, kind: 'item', rarity: 'legendary', limit: 1, th: 8 },
  guildCharter:  { cat: 'boost', name: 'Charte des guildes', icon: '📜', desc: 'Toute production +10 % pendant 12 h.', cost: { crystals: 8, silver: 10 }, kind: 'buff', buff: { name: 'Charte des guildes', mods: { 'prod.all': 0.1 }, hours: 12 }, limit: 1 },
  warBanners:    { cat: 'boost', name: 'Bannières brodées d’argent', icon: '🚩', desc: 'Attaque +8 % et moral +5 pendant 6 h.', cost: { silver: 15, gems: 3 }, kind: 'buff', buff: { name: 'Bannières d’argent', mods: { 'combat.atk': 0.08, 'combat.morale': 5 }, hours: 6 }, limit: 1 },
  merchantSeal:  { cat: 'boost', name: 'Sceau des marchands', icon: '🪙', desc: 'Gains des caravanes +20 % pendant 12 h.', cost: { silver: 12 }, kind: 'buff', buff: { name: 'Sceau des marchands', mods: { 'caravan.gain': 0.2 }, hours: 12 }, limit: 1 },
  architectPlans:{ cat: 'boost', name: 'Plans d’architecte', icon: '📐', desc: 'Tous les chantiers en cours avancent d’une heure.', cost: { gems: 4, crystals: 2 }, kind: 'speedup', hours: 1, limit: 3 },
  fervor:        { cat: 'supply', name: 'Coffret d’élixirs de ferveur', icon: '✨', desc: '3 élixirs de ferveur (production +20 % pendant 1 h chacun).', cost: { crystals: 4, gems: 1 }, kind: 'consumable', key: 'fervorElixir', n: 3, limit: 2 },
  luck:          { cat: 'supply', name: 'Philtres de chance', icon: '🍀', desc: '3 philtres de chance (butin rare +8 % pendant 1 h).', cost: { gems: 3 }, kind: 'consumable', key: 'luckPhilter', n: 3, limit: 2 },
  heal:          { cat: 'supply', name: 'Trousse de campagne', icon: '🧪', desc: '5 potions de soin (−30 % de pertes au prochain combat d’une marche).', cost: { silver: 5, ancientWood: 2 }, kind: 'consumable', key: 'healPotion', n: 5, limit: 2 },
  sageTome:      { cat: 'rare', name: 'Traité des anciens maîtres', icon: '📘', desc: 'Votre meilleur héros gagne 120 XP par niveau d’hôtel de ville.', cost: { crystals: 4, gems: 2 }, kind: 'xp', xpPerTh: 120, limit: 2 },
  relicMap:      { cat: 'rare', name: 'Carte des fouilles', icon: '🗺️', desc: 'Un fragment de relique (collections du Trésor).', cost: { crystals: 10, rareOre: 5 }, kind: 'relic', limit: 1, th: 6 },
  craftsmanGuild:{ cat: 'rare', name: 'Contrat d’artisan', icon: '👷', desc: 'Un ouvrier qualifié rejoint le royaume (s’il y a de la place pour le loger).', cost: { silver: 20 }, kind: 'worker', limit: 1 },
};
