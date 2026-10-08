import { BUILDINGS } from '../data/buildings.js';

// Requêtes sur la ville
export const allBuildings = (s) => Object.values(s.city.buildings);
export const buildingsOf = (s, type) => allBuildings(s).filter((b) => b.type === type && b.level > 0);
export const countOf = (s, type) => {
  if (BUILDINGS[type]?.grid === false) return s.city.fort[type] > 0 ? 1 : 0;
  return allBuildings(s).filter((b) => b.type === type).length;
};
export function levelOf(s, type) {
  if (BUILDINGS[type]?.grid === false) return s.city.fort[type] || 0;
  return buildingsOf(s, type).reduce((m, b) => Math.max(m, b.level), 0);
}
export const thLevel = (s) => levelOf(s, 'townhall');
export const totalLevels = (s) => allBuildings(s).reduce((a, b) => a + (b.deco ? 0 : b.level), 0) + Object.values(s.city.fort).reduce((a, b) => a + b, 0);

export const terrainAt = (s, x, y) => (x < 0 || y < 0 || x >= s.city.w || y >= s.city.h ? null : s.city.terrain[y * s.city.w + x]);
export const buildingAt = (s, x, y) => allBuildings(s).find((b) => b.x === x && b.y === y) || null;

export function neighbors(s, x, y, range = 1) {
  const out = [];
  for (let dy = -range; dy <= range; dy++) for (let dx = -range; dx <= range; dx++) {
    if (!dx && !dy) continue;
    const t = terrainAt(s, x + dx, y + dy);
    if (t === null) continue;
    out.push({ x: x + dx, y: y + dy, terrain: t, building: buildingAt(s, x + dx, y + dy) });
  }
  return out;
}

// Bonus d'adjacence d'un bâtiment (ou d'un emplacement hypothétique) → { total, details[] }
export function adjacencyBonus(s, type, x, y, mods = {}) {
  const def = BUILDINGS[type];
  const res = { total: 0, details: [] };
  if (!def?.adj) return res;
  const nb = neighbors(s, x, y, 1);
  for (const rule of def.adj) {
    let matches = nb.filter((n) => n.terrain === rule.near || (n.building && n.building.level > 0 && n.building.type === rule.near)).length;
    if (!matches) continue;
    let mult = 1;
    if (rule.near === 'river' && mods['adj.river']) mult += mods['adj.river'];
    let bonus = rule.per ? rule.bonus * matches : rule.bonus;
    if (rule.max) bonus = Math.min(bonus, rule.max);
    bonus *= mult;
    res.total += bonus;
    res.details.push({ near: rule.near, bonus, matches });
  }
  return res;
}

// Effets spéciaux de proximité (caserne près du donjon, écurie près d'un élevage)
export function proximityEffects(s, b) {
  const def = BUILDINGS[b.type];
  const out = {};
  if (def.near) {
    const ok = allBuildings(s).some((o) => o.level > 0 && def.near.targets.includes(o.type) && Math.max(Math.abs(o.x - b.x), Math.abs(o.y - b.y)) <= def.near.range);
    if (ok) Object.assign(out, def.near.effects);
  }
  if (def.adjFx) {
    if (neighbors(s, b.x, b.y).some((n) => n.building?.type === def.adjFx.near && n.building.level > 0)) Object.assign(out, def.adjFx.effects);
  }
  return out;
}

export function placementCheck(s, type, x, y) {
  const def = BUILDINGS[type];
  const t = terrainAt(s, x, y);
  if (t !== 'plain') return { ok: false, reason: t === 'rubble' ? 'Déblayez d’abord les décombres.' : 'Terrain non constructible.' };
  if (buildingAt(s, x, y)) return { ok: false, reason: 'Case occupée.' };
  if (def.place === 'river' && !neighbors(s, x, y).some((n) => n.terrain === 'river')) return { ok: false, reason: 'Doit toucher la rivière.' };
  return { ok: true };
}
