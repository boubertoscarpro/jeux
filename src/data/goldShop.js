// v22b « Boutique de la Couronne » — objets de base payés en pièces d'or, volontairement très chers : c'est un
// exutoire pour l'or en trop, jamais un raccourci. Le prix suit le niveau de l'hôtel de ville et grimpe à chaque achat
// du jour (×1,6) ; quantités limitées, renouvelées à minuit UTC. Aucune monnaie nouvelle, aucun argent réel.
// kind : 'speedup' (passe-temps rangé dans l'inventaire), 'consumable' (potion ou élixir), 'item' (pièce d'équipement).
// perMin : or par minute retirée, au niveau 1 de l'hôtel de ville (passe-temps) ; base : prix au niveau 1 (le reste).
export const GOLD_SHOP_MIN_TH = 2;
export const GOLD_SHOP_RISE = 1.6;
export const GOLD_SHOP_GROWTH = 1.32; // prix ×1,32 par niveau d'hôtel de ville
export const GOLD_SHOP_CATS = { speed: 'Passe-temps', potion: 'Potions et élixirs', gear: 'Armurier de la Couronne' };
export const GOLD_SHOP = {
  gs_speed5:   { cat: 'speed', kind: 'speedup', key: 'speed5', sig: 'hourglass', perMin: 60, limit: 3, desc: 'Retire 5 minutes à un chantier.' },
  gs_speed15:  { cat: 'speed', kind: 'speedup', key: 'speed15', sig: 'hourglass', perMin: 70, limit: 2, desc: 'Retire 15 minutes à un chantier.' },
  gs_speed60:  { cat: 'speed', kind: 'speedup', key: 'speed60', sig: 'hourglass', perMin: 85, limit: 1, th: 5, desc: 'Retire 1 heure à un chantier.' },
  gs_rspeed5:  { cat: 'speed', kind: 'speedup', key: 'rspeed5', sig: 'hourglass', perMin: 60, limit: 3, desc: 'Retire 5 minutes à une formation militaire.' },
  gs_rspeed15: { cat: 'speed', kind: 'speedup', key: 'rspeed15', sig: 'hourglass', perMin: 70, limit: 2, desc: 'Retire 15 minutes à une formation militaire.' },
  gs_rspeed60: { cat: 'speed', kind: 'speedup', key: 'rspeed60', sig: 'hourglass', perMin: 85, limit: 1, th: 5, desc: 'Retire 1 heure à une formation militaire.' },
  gs_heal:     { cat: 'potion', kind: 'consumable', key: 'healPotion', n: 2, base: 900, limit: 3, desc: '2 potions de soin : −30 % de pertes au prochain combat de la marche.' },
  gs_tonic:    { cat: 'potion', kind: 'consumable', key: 'warTonic', n: 1, base: 1400, limit: 2, desc: 'Un tonique de guerre : +12 % d’attaque, +10 de moral.' },
  gs_swift:    { cat: 'potion', kind: 'consumable', key: 'swiftOil', n: 1, base: 1200, limit: 2, desc: 'Un onguent de célérité : +30 % de vitesse de marche pendant 1 h.' },
  gs_fervor:   { cat: 'potion', kind: 'consumable', key: 'fervorElixir', n: 1, base: 3200, limit: 1, th: 4, desc: 'Un élixir de ferveur : +20 % de production pendant 1 h.' },
  gs_gear:     { cat: 'gear', kind: 'item', rarity: 'rare', base: 4000, limit: 2, desc: 'Une pièce d’équipement rare au niveau de votre hôtel de ville, emplacement au hasard.' },
  gs_gear2:    { cat: 'gear', kind: 'item', rarity: 'epic', base: 15000, limit: 1, th: 6, desc: 'Une pièce d’équipement épique au niveau de votre hôtel de ville, emplacement au hasard.' },
};
