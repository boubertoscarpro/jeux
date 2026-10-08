// Donjons procéduraux : salles, affixes, gardiens.
export const ROOM_TYPES = {
  battle:   { name: 'Salle gardée', icon: '⚔️', weight: 10 },
  trap:     { name: 'Couloir piégé', icon: '🪤', weight: 4 },
  treasure: { name: 'Salle au trésor', icon: '💰', weight: 4 },
  shrine:   { name: 'Autel ancien', icon: '⛩️', weight: 2 },
  miniboss: { name: 'Antre d’un gardien', icon: '👹', weight: 0 },
  boss:     { name: 'Salle du trône', icon: '💀', weight: 0 },
};

export const DUNGEON_THEMES = {
  crypt:   { name: 'Nécropole', enemies: ['skeleton', 'wraith'], mini: 'wraith', boss: 'golem', loot: { gold: 1, silver: 0.02 } },
  caverns: { name: 'Cavernes', enemies: ['spider', 'wolf', 'troll'], mini: 'troll', boss: 'troll', loot: { iron: 3, crystals: 0.004 } },
  fortress:{ name: 'Forteresse oubliée', enemies: ['guard', 'royalArcher', 'royalKnight'], mini: 'royalKnight', boss: 'golem', loot: { gold: 1.5, steel: 0.05 } },
  forge:   { name: 'Forge des Anciens', enemies: ['golem', 'skeleton'], mini: 'golem', boss: 'golem', loot: { steel: 0.1, rareOre: 0.003 } },
};

// Affixes : rendent chaque donjon différent
export const DUNGEON_AFFIXES = {
  flooded:  { name: 'Inondé', icon: '🌊', desc: 'Cavalerie −50%', our: { 'class.cavalry.atk': -0.5 } },
  cursed:   { name: 'Maudit', icon: '🕯️', desc: 'Moral −20', our: { 'combat.morale': -20 } },
  rich:     { name: 'Riche', icon: '💎', desc: 'Butin +60%', loot: 0.6 },
  swarming: { name: 'Grouillant', icon: '🐜', desc: 'Ennemis +35%', enemies: 0.35 },
  trapped:  { name: 'Piégé', icon: '🪤', desc: 'Pièges deux fois plus fréquents', traps: 2 },
  dark:     { name: 'Ténébreux', icon: '🌑', desc: 'Tirs −35%', our: { 'class.ranged.atk': -0.35 } },
  holy:     { name: 'Sanctifié', icon: '✨', desc: 'Autels plus fréquents, morts-vivants affaiblis', shrines: 2, enemy: { 'combat.def': -0.15 } },
  narrow:   { name: 'Étroit', icon: '🧱', desc: 'Siège inutilisable, infanterie +15%', our: { 'class.siege.atk': -0.8, 'class.infantry.atk': 0.15 } },
};
