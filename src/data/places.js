// v16 « Le Château » — Table des lieux : chaque écran du jeu a un lieu dans le royaume (ou dans l'affichage fixe).
// kind : 'building' (un bâtiment de la ville, existant ou nouveau lieu), 'map' (le globe : carte du monde),
// 'hud' (médaillon du profil, réglages). screens : identifiants des écrans (src/ui/views), le premier s'ouvre d'abord.
// Les lieux « nouveaux » (place: true dans buildings.js) sont de simples points d'accès : aucune production, aucun
// effet, posés gratuitement quand leur fonction s'ouvre (systems/places.js).
export const PLACES = {
  townhall: { kind: 'building', type: 'townhall', screens: ['goals', 'policy', 'council', 'projects'] },
  castle: { kind: 'building', type: 'castle', screens: ['treasury', 'talents', 'legacy'] },
  barracks: { kind: 'building', type: 'barracks', screens: ['army'] },
  stable: { kind: 'building', type: 'stable', screens: ['army'] },
  quartermaster: { kind: 'building', type: 'quartermaster', screens: ['campaigns'] },
  watchtower: { kind: 'building', type: 'watchtower', screens: ['defense'] },
  tavern: { kind: 'building', type: 'tavern', screens: ['heroes'] },
  forge: { kind: 'building', type: 'forge', screens: ['craft'] },
  armory: { kind: 'building', type: 'armory', screens: ['craft'] },
  library: { kind: 'building', type: 'library', screens: ['research', 'codex'] },
  market: { kind: 'building', type: 'market', screens: ['market', 'convoys', 'shop'] },
  port: { kind: 'building', type: 'port', screens: ['convoys'] },
  warehouse: { kind: 'building', type: 'warehouse', screens: ['ecoReport', 'chains', 'workers', 'steward'] },
  guildhall: { kind: 'building', type: 'guildhall', screens: ['guild'] },
  sanctuary: { kind: 'building', type: 'sanctuary', screens: ['wheel', 'shards'] },
  observatory: { kind: 'building', type: 'observatory', screens: ['omens', 'calendar'] },
  monument: { kind: 'building', type: 'monument', screens: ['legacy'] },
  embassy: { kind: 'building', type: 'embassy', screens: ['factions'] },
  cartographer: { kind: 'building', type: 'cartographer', screens: ['expeditions', 'archaeo', 'legend'] },
  herald: { kind: 'building', type: 'herald', screens: ['event', 'eventShop', 'kingdom'] },
  lists: { kind: 'building', type: 'lists', screens: ['challenges'] },
  scriptorium: { kind: 'building', type: 'scriptorium', screens: ['journal', 'accomplish', 'history', 'stats'] },
  world: { kind: 'map', name: 'Carte du monde', icon: '🌍', screens: ['world', 'territories'] },
  profile: { kind: 'hud', name: 'Profil du seigneur', icon: '🛡️', screens: ['profile'] },
  settings: { kind: 'hud', name: 'Réglages', icon: '⚙️', screens: ['settings', 'admin'] },
};
// Écran → lieu principal (le premier lieu qui le cite), pour les fenêtres, les liens et le tutoriel
export const SCREEN_PLACE = {};
for (const [k, p] of Object.entries(PLACES)) for (const v of p.screens) SCREEN_PLACE[v] ??= k;
// Écrans qui ne sont pas des fenêtres : le château lui-même et la carte du monde
export const MAP_SCREENS = ['city', 'world'];

// Nouveaux lieux : quand ils sont posés (fonction ouverte)
// cond : { th } niveau d'hôtel de ville, { automation } palier d'intendance, { any: [...] } l'une des conditions
export const NEW_PLACES = {
  scriptorium: { cond: {} },
  herald: { cond: {} },
  embassy: { cond: {} },
  cartographer: { cond: { any: [{ automation: 1 }, { th: 4 }] } },
  lists: { cond: { th: 4 } },
};
