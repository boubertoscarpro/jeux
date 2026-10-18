// v16 « Le Château » — Bulles au-dessus des bâtiments (module pur) : ce qui attend le joueur, là où cela se trouve.
// Peu nombreuses (BUBBLE_MAX), triées par importance, une seule par bâtiment ; chacune ouvre l'écran concerné.
// Les héros gouverneurs se montrent sur le bâtiment de leur secteur, les héros libres à la taverne.
import { BUILDINGS } from '../data/buildings.js';
import { RESOURCES, isCapped } from '../data/resources.js';
import { storageCap } from './economy.js';
import { objectivesBadge } from './campaign.js';

export const BUBBLE_MAX = 5;
const blds = (s) => Object.values(s.city?.buildings || {});
const best = (s, type) => blds(s).filter((b) => b.type === type && b.level > 0).sort((a, b) => b.level - a.level)[0] || null;

// Bâtiment représentant chaque secteur de gouverneur
export const SECTOR_BUILDING = { food: 'farm', wood: 'sawmill', stone: 'quarry', iron: 'mine', industry: 'foundry', treasury: 'castle', forge: 'forge', science: 'library' };

export function cityBubbles(state, mods, now = Date.now()) {
  const s = state, out = [];
  const add = (type, b) => { const at = best(s, type); if (at) out.push({ ...b, bid: at.id, x: at.x, y: at.y }); };
  if ((s.raids || []).length) add('watchtower', { id: 'raid', prio: 9, icon: '🚨', mark: '!', text: 'Raid en approche', view: 'defense' });
  const claim = objectivesBadge(s);
  if (claim) add('townhall', { id: 'claim', prio: 8, icon: '🎁', mark: String(claim), text: `${claim} récompense${claim > 1 ? 's' : ''} à réclamer`, view: 'goals' });
  // Stock plein (la ressource qui déborde le plus)
  let full = null;
  for (const r of Object.keys(RESOURCES)) {
    if (!isCapped(r) || !(s.resources[r] > 0)) continue;
    const cap = storageCap(s, mods, r);
    if (cap > 0 && s.resources[r] >= cap * 0.98 && (!full || s.resources[r] / cap > full.f)) full = { r, f: s.resources[r] / cap };
  }
  if (full) add('warehouse', { id: 'full', prio: 6, icon: RESOURCES[full.r].icon, mark: '!', text: `Entrepôt plein : ${RESOURCES[full.r].name}`, view: 'ecoReport' });
  if (s.merchant && s.merchant.until > now) add('market', { id: 'merchant', prio: 5, icon: '🧳', mark: '•', text: 'Un marchand ambulant propose ses offres', view: 'market' });
  if (!(s.queues?.research || []).length) add('library', { id: 'research', prio: 4, icon: '🔬', mark: '•', text: 'Aucune recherche en cours', view: 'research' });
  if (!(s.queues?.train || []).length) add('barracks', { id: 'train', prio: 3, icon: '⚔️', mark: '•', text: 'Caserne au repos : former des troupes', view: 'army' });
  if (!(s.queues?.craft || []).length && (s.heroes || []).length) add('forge', { id: 'craft', prio: 2, icon: '⚒️', mark: '•', text: 'Forge libre : forger un objet', view: 'craft' });
  const idle = (s.heroes || []).filter((h) => !h.assignment && !h.marchId).length;
  if (idle) add('tavern', { id: 'heroes', prio: 2, icon: '🧙', mark: String(idle), text: `${idle} héros sans affectation`, view: 'heroes' });
  // Une bulle par bâtiment, les plus importantes d'abord
  const seen = new Set();
  return out.sort((a, b) => b.prio - a.prio).filter((b) => (seen.has(b.bid) ? false : seen.add(b.bid))).slice(0, BUBBLE_MAX);
}

// Héros à leur poste : gouverneur sur le bâtiment de son secteur
export function heroPosts(state) {
  const m = new Map();
  for (const h of state.heroes || []) {
    const sec = h.assignment?.type === 'governor' ? h.assignment.sector : null;
    const type = sec && SECTOR_BUILDING[sec];
    const b = type && (best(state, type) || (sec === 'treasury' ? best(state, 'townhall') : null));
    if (!b || !BUILDINGS[b.type]) continue;
    if (!m.has(b.id)) m.set(b.id, []);
    m.get(b.id).push({ name: h.name, sector: sec });
  }
  return m;
}
