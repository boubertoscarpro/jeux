// Priorités royales : une orientation stratégique du royaume entier (et non des ordres bâtiment par bâtiment).
// Chaque priorité a des avantages ET un coût : aucune n'est supérieure en tout. Changer de priorité impose une
// période de réorganisation (aucun bonus ni malus pendant 1 h) et un délai de 4 h avant le changement suivant.
// order : ordre conseillé des secteurs d'ouvriers (Intendance → Priorités) pour aligner l'automatisation.
// tags : catégories de missions dynamiques favorisées.
export const POLICY_TRANSITION = 3600000;
export const POLICY_LOCK = 4 * 3600000;
export const POLICY_MIN_TH = 3;

export const POLICIES = {
  balanced: {
    name: 'Équilibre', icon: '⚖️', desc: 'Aucune orientation particulière : ni bonus ni malus.',
    mods: {}, pros: [], cons: [], order: ['food', 'wood', 'stone', 'iron', 'industry', 'gold'], tags: [],
  },
  prosperity: {
    name: 'Prospérité', icon: '🌾', desc: 'Le royaume privilégie la production, la construction et le confort des habitants.',
    mods: { 'prod.all': 0.08, 'build.cost': -0.05, 'train.speed': -0.12, 'combat.def': -0.04 },
    pros: ['Toute production +8 %', 'Constructions −5 %'], cons: ['Formation des troupes −12 %', 'Défense des troupes −4 %'],
    order: ['food', 'wood', 'stone', 'industry', 'iron', 'gold'], tags: ['agri', 'indus', 'build'],
  },
  defense: {
    name: 'Défense', icon: '🛡️', desc: 'Garnisons, réserves et fortifications passent avant tout.',
    mods: { 'city.def': 0.1, 'garrison.def': 0.15, 'combat.def': 0.05, upkeep: -0.08, 'prod.gold': -0.1, 'caravan.gain': -0.1 },
    pros: ['Défense de la ville +10 %', 'Garnisons d’avant-postes +15 %', 'Défense des troupes +5 %', 'Entretien de l’armée −8 %'], cons: ['Or produit −10 %', 'Gains des caravanes −10 %'],
    order: ['food', 'iron', 'stone', 'industry', 'wood', 'gold'], tags: ['mil'],
  },
  expansion: {
    name: 'Expansion', icon: '🧭', desc: 'Exploration, expéditions, ressources lointaines et avant-postes.',
    mods: { 'explore.speed': 0.2, 'march.speed': 0.1, 'gather.all': 0.1, 'cost.territory': -0.15, 'prod.all': -0.04, 'city.def': -0.05 },
    pros: ['Exploration +20 %', 'Marches +10 % plus rapides', 'Récolte sur la carte +10 %', 'Avant-postes −15 %'], cons: ['Toute production −4 %', 'Défense de la ville −5 %'],
    order: ['food', 'wood', 'iron', 'stone', 'gold', 'industry'], tags: ['explore', 'outpost'],
  },
  commerce: {
    name: 'Commerce', icon: '🐪', desc: 'Caravanes, contrats et bonnes relations avec les cités libres.',
    mods: { 'caravan.gain': 0.15, 'contract.reward': 0.1, 'market.fee': -0.01, 'prod.gold': 0.08, 'train.speed': -0.1, 'combat.atk': -0.04 },
    pros: ['Gains des caravanes +15 %', 'Récompenses des contrats +10 %', 'Taxe du marché −1 point', 'Or produit +8 %'], cons: ['Formation des troupes −10 %', 'Attaque des troupes −4 %'],
    order: ['gold', 'industry', 'food', 'wood', 'stone', 'iron'], tags: ['trade'],
  },
};
