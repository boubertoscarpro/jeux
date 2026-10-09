// Spécialisations de royaume, origines et difficultés de départ.
//
// Tous les bonus sont des MODIFICATEURS consommés par les formules existantes (computeMods → systèmes).
// Formules de cumul (documentées dans docs/KINGDOMS.md) :
//  • production : prod.<res> s'ADDITIONNE aux autres bonus de même clé (bâtiments, technologies, héros,
//    événements…) puis multiplie la production de base : base × (1 + prod.<res> + prod.all + bonus locaux) ;
//  • coûts : cost.* s'additionnent entre eux puis multiplient le coût : coût × max(0,5 ; 1 + Σ) — jamais
//    moins de la moitié du prix, quel que soit le cumul ;
//  • combat : class.<classe>.atk/def et combat.* s'ajoutent aux multiplicateurs d'attaque / défense d'une pile.
// Chaque bonus visible dans l'interface est donc réellement appliqué, et rien n'est compté deux fois.

export const KINGDOM_TYPES = {
  harvest: {
    name: 'Royaume des Moissons', icon: '🌾', color: '#c9a227', difficulty: 1,
    lore: 'Les vallées de la Haute-Brune n’ont jamais connu la disette. Leurs greniers ont nourri l’Empire de l’Aube ; ils nourriront votre royaume.',
    style: 'Économie stable, croissance régulière, commerce de vivres, population nombreuse.',
    excels: ['Agriculture', 'Stockage', 'Ouvriers et entretien'],
    strategy: 'Construisez fermes et moulins au bord de la rivière dès le début, vendez vos surplus de nourriture et entretenez une armée plus grande que vos voisins grâce à vos réserves.',
    mods: { 'prod.food': 0.15, 'prod.grain': 0.15, 'storage.food': 0.10, 'cost.build.food': -0.15, 'famine.resist': 0.5, 'prod.iron': -0.10, 'prod.stone': -0.05, 'cost.train': 0.10 },
    bonuses: ['+15 % de nourriture et de blé', '+10 % de capacité de stockage pour la nourriture', '−15 % sur le coût des bâtiments agricoles', 'Famine : pénalité de moral réduite de moitié'],
    maluses: ['−10 % de fer, −5 % de pierre', '+10 % sur le coût de formation des unités'],
    start: { res: { food: 800, grain: 120 } },
    startText: '+800 nourriture, +120 blé',
  },
  iron: {
    name: 'Royaume de Fer', icon: '⚒️', color: '#8b8f99', difficulty: 2,
    lore: 'Forgé dans les mines du Mont Cendreux, le Royaume de Fer a survécu à la Fracture à coups de marteau et de discipline.',
    style: 'Industrie lourde, équipements, armées solides et conquêtes.',
    excels: ['Fer et métallurgie', 'Forge', 'Défense des troupes'],
    strategy: 'Placez mines et fonderies près des montagnes, forgez tôt l’équipement de vos héros, puis conquérez les camps voisins avec une infanterie bien protégée. Surveillez la nourriture : vos soldats mangent davantage.',
    mods: { 'prod.iron': 0.15, 'prod.steel': 0.10, 'prod.weapons': 0.10, 'cost.craft': -0.15, 'class.infantry.def': 0.05, 'class.cavalry.def': 0.05, 'upkeep': 0.12, 'prod.gold': -0.08, 'prod.food': -0.05 },
    bonuses: ['+15 % de fer, +10 % d’acier et d’armes', '−15 % sur le coût de fabrication à la forge', '+5 % de défense pour l’infanterie et la cavalerie'],
    maluses: ['+12 % d’entretien (nourriture) de l’armée', '−8 % d’or, −5 % de nourriture'],
    start: { res: { iron: 300 }, units: { swordsman: 8 } },
    startText: '+300 fer, 8 épéistes',
  },
  merchants: {
    name: 'Royaume des Marchands', icon: '⚖️', color: '#3fa98e', difficulty: 2,
    lore: 'Port-Sel était un comptoir avant d’être un royaume. On y signe encore les traités sur des balances, et chaque caravane y est une fête.',
    style: 'Richesse, commerce, contrats, accumulation de ressources rares.',
    excels: ['Caravanes', 'Marché', 'Contrats des cités'],
    strategy: 'Bâtissez tôt un marché, remplissez les contrats des cités avec vos propres productions et ouvrez des routes vers les cités qui réclament vos marchandises. Escortez vos convois : ils sont plus exposés.',
    mods: { 'caravan.gain': 0.10, 'caravan.speed': 0.10, 'market.fee': -0.03, 'contract.reward': 0.10, 'cost.train': 0.08, 'convoy.risk': 0.20 },
    bonuses: ['+10 % de recettes des caravanes, caravanes 10 % plus rapides', 'Taxe du marché −3 points', '+10 % de récompense des contrats'],
    maluses: ['+8 % sur le coût de formation des unités', 'Convois 20 % plus exposés aux attaques'],
    start: { res: { gold: 500, silver: 10 } },
    startText: '+500 or, +10 argent',
  },
  scholars: {
    name: 'Royaume des Érudits', icon: '📜', color: '#6c7fd8', difficulty: 2,
    lore: 'Les archivistes d’Aubeclaire ont sauvé des cendres la bibliothèque de l’Empire. Leur royaume avance au rythme de leurs découvertes.',
    style: 'Optimisation, innovations, automatisation et développement à long terme.',
    excels: ['Recherche', 'Technologies économiques et artisanales', 'Découvertes d’exploration'],
    strategy: 'Construisez la bibliothèque au plus tôt et ne la laissez jamais inactive. Visez les technologies d’économie et d’artisanat, puis l’Intendance. Défendez-vous par la diplomatie le temps que l’armée suive.',
    mods: { 'research.speed': 0.12, 'cost.research': -0.10, 'cost.research.economy': -0.05, 'cost.research.craft': -0.05, 'loot.rare': 0.02, 'train.speed': -0.15, 'cost.build.military': 0.15 },
    bonuses: ['+12 % de vitesse de recherche', '−10 % sur le coût des recherches (−15 % en économie et artisanat)', '+2 % de butin rare (découvertes)'],
    maluses: ['−15 % de vitesse de formation des unités', '+15 % sur le coût des bâtiments militaires'],
    start: { res: { wood: 250, stone: 300 } },
    startText: '+250 bois, +300 pierre (pour une bibliothèque rapide)',
  },
  pioneers: {
    name: 'Royaume des Pionniers', icon: '🧭', color: '#4f9bd8', difficulty: 1,
    lore: 'Descendants des cartographes impériaux, les Pionniers ont appris à vivre en marge des cartes, là où les Terres Brisées cachent leurs trésors.',
    style: 'Découverte de régions, trésors, donjons, sites rares et reliques.',
    excels: ['Exploration', 'Expéditions', 'Éclaireurs'],
    strategy: 'Formez vite des éclaireurs (moins chers), explorez largement pour trouver les meilleurs gisements, puis lancez des expéditions de prospection. Complétez votre nourriture par la récolte sur la carte.',
    mods: { 'expedition.speed': 0.15, 'explore.speed': 0.20, 'explore.radius': 0.5, 'loot.rare': 0.02, 'cost.unit.scout': -0.30, 'cost.expedition': -0.20, 'prod.food': -0.10, 'prod.grain': -0.10 },
    bonuses: ['Expéditions 15 % plus rapides, éclaireurs 20 % plus rapides', 'Rayon d’exploration +0,5 case, +2 % de butin rare', 'Éclaireurs −30 % moins chers, vivres d’expédition −20 %'],
    maluses: ['−10 % de nourriture et de blé'],
    start: { units: { scout: 4 }, reveal: 3 },
    startText: '4 éclaireurs, carte révélée plus largement autour de la capitale',
  },
  bastions: {
    name: 'Royaume des Bastions', icon: '🏰', color: '#9a6b4f', difficulty: 1,
    lore: 'Haute-Garde n’est jamais tombée. Ses murailles ont arrêté les hordes de la Fracture, et ses bâtisseurs s’en souviennent.',
    style: 'Défense, sièges, protection des ressources, guerres d’usure.',
    excels: ['Murailles', 'Défense de la ville', 'Garnisons des avant-postes'],
    strategy: 'Montez la muraille et la tour de garde : vos raids seront rarement perdus. Tenez vos avant-postes avec de petites garnisons, laissez l’ennemi s’épuiser, puis contre-attaquez.',
    mods: { 'wall.pct': 0.30, 'city.def': 0.10, 'cost.repair': -0.30, 'garrison.def': 0.25, 'cost.territory': 0.25, 'cost.train.siege': 0.20, 'siege.power': -0.10 },
    bonuses: ['Murailles 30 % plus efficaces, +10 % de défense de la ville', '−30 % sur le coût des réparations', 'Garnisons des avant-postes +25 % de défense'],
    maluses: ['Territoires 25 % plus chers à établir', 'Engins de siège +20 % plus chers, puissance de siège −10 %'],
    start: { fort: { wall: 1 }, units: { spearman: 8 } },
    startText: 'Muraille niveau 1, 8 lanciers',
  },
  shadows: {
    name: 'Royaume des Ombres', icon: '🕯️', color: '#7a5aa6', difficulty: 3,
    lore: 'Brumeval règne par le murmure plus que par l’épée. Ses émissaires savent avant les rois ce que les rois décideront.',
    style: 'Renseignement, alliances, préparation des combats, résolution indirecte des conflits.',
    excels: ['Espionnage', 'Diplomatie', 'Anticipation des raids'],
    strategy: 'Envoyez tôt des émissaires (moins chers) pour signer des traités, espionnez les factions hostiles pour connaître leur armée, et ne livrez que les batailles déjà gagnées.',
    mods: { 'spy.power': 0.30, 'cost.diplomacy': -0.30, 'cost.unit.spy': -0.25, 'raid.warning': 0.5, 'raid.reveal': 1, 'prod.all': -0.05, 'class.infantry.atk': -0.05, 'class.cavalry.atk': -0.05 },
    bonuses: ['+30 % de puissance d’espionnage', 'Émissaires et diplomatie −30 % moins chers, espions −25 %', 'Raids annoncés 50 % plus tôt, composition toujours connue'],
    maluses: ['−5 % de toute production', '−5 % d’attaque pour l’infanterie et la cavalerie'],
    start: { res: { gold: 200 }, units: { spy: 2 } },
    startText: '2 espions, +200 or',
  },
  ancients: {
    name: 'Royaume des Anciens', icon: '🏛️', color: '#b07ad8', difficulty: 3,
    lore: 'Vos ancêtres gardaient les portes de l’Aube. La Fracture a tout emporté, sauf leurs carnets… et l’instinct de chercher ce qui dort sous les ruines.',
    style: 'Reliques, donjons, objets rares et contenu de haut niveau.',
    excels: ['Artefacts et collections', 'Donjons', 'Technologies anciennes'],
    strategy: 'Survivez à un début difficile en équilibrant l’économie, puis orientez-vous vers les donjons et les ruines : vos chances d’artefact et de fragments de relique y sont supérieures. N’espérez aucun Éclat gratuit.',
    mods: { 'loot.rare': 0.04, 'artifact.chance': 0.25, 'relic.find': 0.5, 'cost.research.magic': -0.15, 'prod.food': -0.07, 'prod.iron': -0.07, 'prod.wood': -0.05 },
    bonuses: ['+4 % de butin rare', '+25 % de chance d’artefact dans les donjons', '+50 % de fragments de relique trouvés dans les fouilles', '−15 % sur le coût des technologies anciennes (magie)'],
    maluses: ['−7 % de nourriture et de fer, −5 % de bois', 'Début de partie plus difficile : ressources de départ −25 %'],
    start: { resMult: 0.75, res: { crystals: 5 } },
    startText: 'Ressources de départ −25 %, +5 cristaux',
  },
};

// Les parties créées avant les spécialisations n'ont pas de bonus ni de malus (aucun avantage rétroactif)
export const LEGACY_KINGDOM = { name: 'Royaume sans spécialisation', icon: '🛡️', color: '#c9a227', difficulty: 2, lore: 'Partie créée avant l’arrivée des spécialisations.', style: 'Équilibré.', excels: [], strategy: '', mods: {}, bonuses: ['Aucun bonus'], maluses: ['Aucun malus'], start: {}, startText: '—' };

export const ORIGINS = {
  none: { name: 'Sans origine particulière', icon: '·', desc: 'Départ standard.', mods: {}, start: {}, text: 'Aucun effet.' },
  imperial: { name: 'Ancienne province impériale', icon: '🏛️', desc: 'Les routes et les entrepôts de l’Empire tiennent encore debout… mais leur entretien coûte cher.', mods: { upkeep: 0.10 }, start: { buildings: { warehouse: 2, house: 2 } }, text: 'Entrepôt et maison niveau 2 dès le départ · entretien +10 %' },
  frontier: { name: 'Colonie frontalière', icon: '🌲', desc: 'Au bord du monde connu : la carte s’ouvre devant vous, mais vos défenses sont légères.', mods: { 'explore.radius': 0.5, 'city.def': -0.10 }, start: { units: { scout: 3 }, reveal: 2 }, text: '3 éclaireurs, carte plus révélée, rayon d’exploration +0,5 · défense de la ville −10 %' },
  rebuilt: { name: 'Communauté reconstruite', icon: '🔨', desc: 'Partis de presque rien, vos gens ont appris vite à rebâtir.', mods: { 'build.speed': 0.10, 'worker.xp': 0.20, 'hero.xp': 0.10 }, start: { resMult: 0.8 }, text: 'Ressources de départ −20 % · construction +10 % plus rapide, expérience des ouvriers +20 % et des héros +10 %' },
};

export const DIFFICULTIES = {
  guided: { name: 'Guidé', icon: '🕊️', desc: 'Plus d’explications, économie de départ indulgente, objectifs explicites.', mods: { upkeep: -0.10 }, start: { resMult: 1.3 }, raidGraceH: 24, tips: true, advice: 'full', text: 'Ressources de départ +30 %, entretien −10 %, 24 h de répit avant les premiers raids, tous les conseils.' },
  classic: { name: 'Classique', icon: '⚔️', desc: 'L’expérience équilibrée.', mods: {}, start: {}, raidGraceH: 0, tips: true, advice: 'full', text: 'Aucun ajustement.' },
  expert: { name: 'Expert', icon: '💀', desc: 'Moins d’aides, économie plus exigeante. Aucun bonus caché pour l’adversaire : tout est affiché ici.', mods: { upkeep: 0.10, 'prod.all': -0.05 }, start: { resMult: 0.8 }, raidGraceH: 0, tips: false, advice: 'reduced', text: 'Ressources de départ −20 %, entretien +10 %, production −5 %, conseils réduits (réactivables).' },
};

export const DIFFICULTY_STARS = (n) => '★'.repeat(n) + '☆'.repeat(3 - n);
