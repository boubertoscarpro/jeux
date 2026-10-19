// v18 : libellés lisibles de tous les modificateurs (héros, objets, gemmes, ensembles) — jamais une clé brute à l'écran.
import { RESOURCES } from './resources.js';

const FIXED = {
  'prod.all': 'Toute production', 'combat.atk': 'Attaque', 'combat.def': 'Défense', 'combat.morale': 'Moral', 'combat.losses': 'Pertes',
  'gather.all': 'Récolte', 'gather.iron': 'Récolte de minerai', 'gather.wood': 'Récolte de bois', 'gather.stone': 'Récolte de pierre',
  'loot.rare': 'Butin rare', 'loot.crystal': 'Cristaux en récolte', 'march.speed': 'Vitesse de marche', 'explore.speed': 'Vitesse d’exploration',
  'explore.radius': 'Rayon de révélation', 'ambush.reduce': 'Risque d’embuscade', carry: 'Capacité de transport', 'build.speed': 'Vitesse de construction',
  'research.speed': 'Vitesse de recherche', 'train.speed': 'Vitesse de formation', 'city.def': 'Défense de la ville', upkeep: 'Entretien de l’armée',
  'craft.quality': 'Qualité de forge', 'craft.speed': 'Vitesse de forge', 'market.fee': 'Taxe du marché', 'caravan.gain': 'Gains des caravanes',
  caravans: 'Caravanes', 'salvage.bonus': 'Matériaux du démantèlement', 'potion.duration': 'Durée des potions', 'hero.xp': 'Expérience',
  'siege.power': 'Puissance de siège', 'class.cavalry.atk': 'Attaque de la cavalerie', 'class.infantry.atk': 'Attaque de l’infanterie',
  'class.ranged.atk': 'Attaque des tireurs', 'class.siege.atk': 'Attaque des engins', 'class.infantry.def': 'Défense de l’infanterie',
  'class.cavalry.def': 'Défense de la cavalerie', 'stat.force': 'Force', 'stat.command': 'Commandement', 'stat.cunning': 'Ruse', 'stat.lore': 'Savoir',
  'storage.pct': 'Stockage', 'hero.maxLevel': 'Niveau maximal des héros', 'hero.discount': 'Coût de recrutement',
};
// Valeurs brutes (pas des pourcentages)
const RAW = new Set(['combat.morale', 'stat.force', 'stat.command', 'stat.cunning', 'stat.lore', 'explore.radius', 'caravans', 'hero.maxLevel']);

export function modLabel(key) {
  if (FIXED[key]) return FIXED[key];
  const m = /^prod\.(.+)$/.exec(key);
  if (m && RESOURCES[m[1]]) return `Production : ${RESOURCES[m[1]].name.toLowerCase()}`;
  return key;
}
export const isRawMod = (key) => RAW.has(key);
const num = (v, d = 1) => (Math.round(v * 10 ** d) / 10 ** d).toString().replace('.', ',');
// « +3,2 % Attaque », « +6 Moral », « −2 % Taxe du marché »
export function fmtMod(key, v) {
  const sign = v >= 0 ? '+' : '−';
  const a = Math.abs(v);
  return isRawMod(key) ? `${sign}${num(a, a < 10 ? 1 : 0)} ${modLabel(key)}` : `${sign}${num(a * 100)} % ${modLabel(key)}`;
}
