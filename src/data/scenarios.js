// Scénarios rejouables : des conditions de départ et des règles différentes, avec leurs propres objectifs et un
// record (temps pour tout accomplir). Ils réutilisent la partie normale (même carte, mêmes systèmes, même campagne) :
// pas de campagne dupliquée. Récompenses volontairement mesurées : insignes, titre, couleur d'armoiries.
//
// scenario : { name, icon, desc, rules (texte), mods, start (comme une origine), setup(state) facultatif,
//              objectives: [{ id, label, check(s) → [actuel, cible] }], reward: { insignia, title } }

const th = (s) => Object.values(s.city.buildings).find((b) => b.type === 'townhall')?.level || 0;
const facs = (s, st) => (s.factions || []).filter((f) => st.includes(f.stance)).length;

export const SCENARIOS = {
  none: { name: 'Partie libre', icon: '·', desc: 'La campagne habituelle, sans règle particulière.', rules: 'Aucune règle supplémentaire.', mods: {}, start: {}, objectives: [], reward: null },
  frontier: {
    name: 'La marche menacée', icon: '🛡️',
    desc: 'Votre royaume garde la frontière : deux couronnes rivales lorgnent déjà vos terres. Tenir, puis frapper.',
    rules: 'Muraille niveau 1 et 40 lanciers au départ · deux rivaux en colère (raids plus fréquents dès l’hôtel de ville 3) · défense de la ville +10 %, production −5 %.',
    mods: { 'city.def': 0.1, 'prod.all': -0.05 }, start: { fort: { wall: 1 }, units: { spearman: 40 } },
    setup: 'angry',
    objectives: [
      { id: 'raids', label: 'Repousser 3 raids', check: (s) => [s.stats.raidsRepelled || 0, 3] },
      { id: 'wall', label: 'Muraille niveau 6', check: (s) => [s.city.fort.wall || 0, 6] },
      { id: 'breach', label: 'Battre une forteresse renforcée de la Brèche', check: (s) => [Math.min(1, Math.floor((s.stats.breachTierMax || 0) / 2)), 1] },
      { id: 'th', label: 'Hôtel de ville niveau 8', check: (s) => [th(s), 8] },
    ],
    reward: { insignia: 6, title: 'Gardien de la marche' },
  },
  isolated: {
    name: 'La vallée isolée', icon: '🏔️',
    desc: 'Coupés du monde par les montagnes : peu de ressources de départ, mais des filons rares tout proches.',
    rules: 'Ressources de départ −40 % · gisements de cristaux et d’argent près du château · caravanes −20 % de gains · récolte +15 %.',
    mods: { 'caravan.gain': -0.2, 'gather.all': 0.15 }, start: { resMult: 0.6 },
    setup: 'rareNodes',
    objectives: [
      { id: 'crystals', label: 'Réunir 150 cristaux', check: (s) => [Math.floor(s.resources.crystals || 0), 150] },
      { id: 'outposts', label: 'Tenir 3 avant-postes', check: (s) => [Object.keys(s.territories || {}).length, 3] },
      { id: 'mystery', label: 'Résoudre un mystère archéologique', check: (s) => [Object.keys(s.archaeo?.solved || {}).length, 1] },
      { id: 'th', label: 'Hôtel de ville niveau 8', check: (s) => [th(s), 8] },
    ],
    reward: { insignia: 6, title: 'Seigneur des cimes' },
  },
  merchant: {
    name: 'La cité des comptoirs', icon: '⚖️',
    desc: 'Une riche cité marchande… entourée de rivaux jaloux. Ici, l’or se gagne sur les routes, pas sur les champs de bataille.',
    rules: 'Marché niveau 2 et 3 000 or au départ · toutes les factions commencent méfiantes (relation −20) · caravanes +15 %, armée −10 % d’attaque.',
    mods: { 'caravan.gain': 0.15, 'combat.atk': -0.1 }, start: { res: { gold: 3000 } },
    setup: 'merchant',
    objectives: [
      { id: 'caravans', label: '25 caravanes livrées', check: (s) => [s.stats.caravans || 0, 25] },
      { id: 'pacts', label: '2 pactes commerciaux ou alliances', check: (s) => [facs(s, ['trade', 'alliance']), 2] },
      { id: 'contracts', label: '10 contrats de cités remplis', check: (s) => [s.stats.contracts || 0, 10] },
      { id: 'town', label: 'Une cité marchande de rang 2', check: (s) => [Math.max(0, ...Object.values(s.world.pois).filter((p) => p.type === 'town').map((p) => p.rank || 0)), 2] },
    ],
    reward: { insignia: 6, title: 'Prince des comptoirs' },
  },
  poor: {
    name: 'Le royaume des moissons', icon: '🌾',
    desc: 'Un petit royaume pauvre, sans armée digne de ce nom. Survivre par les champs et la parole donnée.',
    rules: 'Nourriture +20 %, entretien des troupes +25 % · aucune déclaration de guerre possible sans perdre le scénario (il échoue) · les traités durent plus longtemps.',
    mods: { 'prod.food': 0.2, upkeep: 0.25 }, start: { resMult: 0.85 },
    noWar: true,
    objectives: [
      { id: 'food', label: 'Produire 60 000 nourriture au total', check: (s) => [Math.floor(s.stats.produced?.food || 0), 60000] },
      { id: 'allies', label: '2 alliances', check: (s) => [facs(s, ['alliance']), 2] },
      { id: 'stability', label: '2 avant-postes prospères (stabilité ≥ 80)', check: (s) => [Object.values(s.territories || {}).filter((t) => (t.stability ?? 0) >= 80).length, 2] },
      { id: 'th', label: 'Hôtel de ville niveau 8', check: (s) => [th(s), 8] },
    ],
    reward: { insignia: 6, title: 'Père des moissons' },
  },
};
