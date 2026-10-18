// v16 « Le Château » — Villes des avant-postes (module pur) : carte, bâtiments, enceinte, vocation, chantier unique.
// Les effets (production, entretien, garnison, menaces, stabilité, bonus du royaume) sont lus par territory.js et
// stability.js ; rien ici ne produit de ressource par lui-même, sauf l'or du comptoir (borné, payé par l'avant-poste).
import { TOWN_SIZES, TOWN_EXPAND_LEVEL, townExpandCost, OUTPOST_BUILDINGS, obCost, obTime, TOWN_FORT, FORT_THREAT, VOCATIONS, VOCATION_MIN, VOCATION_BONUS, OUTPOST_LIMITS } from '../data/outposts.js';
import { pay, missing } from './economy.js';
import { log } from './log.js';

const DECO_OF = { plain: ['bush', 'rock'], forest: ['tree', 'tree', 'bush'], hills: ['rock', 'bush'], mountain: ['rock', 'rock', 'tree'], river: ['water', 'bush'], swamp: ['reed', 'water'], ruins: ['ruin', 'rock'], snow: ['pine', 'rock'], ash: ['ash', 'rock'] };
const hash = (str) => { let h = 2166136261; for (const c of String(str)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };

// Terrain de la ville : quelques ornements sur le pourtour selon le terrain du monde, jamais au centre
function townTerrain(t, w, h) {
  const deco = DECO_OF[t.terrain] || DECO_OF.plain;
  const seed = hash(`${t.id || ''}:${t.x},${t.y}`);
  const out = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const edge = x === 0 || y === 0 || x === w - 1 || y === h - 1;
    const r = hash(seed + ':' + x + ',' + y) % 100;
    out.push(edge && r < 22 ? deco[r % deco.length] : 'plain');
  }
  return out;
}
export const hallPos = (w, h) => ({ x: Math.floor((w - 1) / 2), y: Math.floor((h - 1) / 2) });

// Crée la ville d'un avant-poste s'il n'en a pas encore (nouvel avant-poste ou ancienne sauvegarde) : rien n'est retiré
export function ensureTown(t) {
  if (t.town?.terrain) return t.town;
  const [w, h] = TOWN_SIZES[0];
  t.town = { w, h, exp: 0, terrain: townTerrain(t, w, h), b: {}, fort: { wall: 0, moat: 0 }, job: null, seq: 0 };
  return t.town;
}
export const townBuildings = (t) => Object.values(t.town?.b || {});
export const townHall = (t) => ({ id: 'hall', type: 'hall', level: t.level || 1, ...hallPos(t.town?.w || TOWN_SIZES[0][0], t.town?.h || TOWN_SIZES[0][1]) });
export const tileFree = (t, x, y) => {
  const T = t.town;
  if (!T || x < 0 || y < 0 || x >= T.w || y >= T.h) return false;
  if (T.terrain[y * T.w + x] !== 'plain') return false;
  const hp = hallPos(T.w, T.h);
  if (hp.x === x && hp.y === y) return false;
  return !townBuildings(t).some((b) => b.x === x && b.y === y);
};

// Vocation : la catégorie qui cumule le plus de niveaux, à partir de 3 (égalité : aucune)
export function catLevels(t) {
  const c = {};
  for (const b of townBuildings(t)) { const cat = OUTPOST_BUILDINGS[b.type]?.cat; if (cat) c[cat] = (c[cat] || 0) + b.level; }
  return c;
}
export function vocationOf(t) {
  const c = Object.entries(catLevels(t)).sort((a, b) => b[1] - a[1]);
  if (!c.length || c[0][1] < VOCATION_MIN || (c[1] && c[1][1] === c[0][1])) return null;
  return c[0][0];
}
export const vocationInfo = (t) => { const v = vocationOf(t); return v ? { id: v, ...VOCATIONS[v] } : null; };

// Effets cumulés des bâtiments de l'avant-poste (bornés)
export function townFx(t) {
  const voc = vocationOf(t);
  const f = { prodRes: {}, prodAll: 0, upkeepFood: 0, garrison: 0, def: 0, cityDef: 0, gold: 0, caravan: 0, stab: 0 };
  for (const b of townBuildings(t)) {
    const d = OUTPOST_BUILDINGS[b.type];
    if (!d || b.level <= 0) continue;
    const k = b.level * (d.cat === voc ? 1 + VOCATION_BONUS : 1);
    const x = d.fx;
    if (x.prodRes) for (const r of x.prodRes) f.prodRes[r] = (f.prodRes[r] || 0) + x.prod * k;
    if (x.prodAll) f.prodAll += x.prodAll * k;
    if (x.upkeepFood) f.upkeepFood += x.upkeepFood * k;
    if (x.garrison) f.garrison += x.garrison * k;
    if (x.def) f.def += x.def * k;
    if (x.cityDef) f.cityDef += x.cityDef * k;
    if (x.gold) f.gold += x.gold * k;
    if (x.caravan) f.caravan += x.caravan * k;
    if (x.stab) f.stab += x.stab * k;
  }
  f.upkeepFood = Math.min(OUTPOST_LIMITS.upkeepFood, f.upkeepFood);
  f.voc = voc;
  return f;
}
// Multiplicateur de production d'une ressource (jamais plus de +50 %)
export const townProdMult = (t, r, fx = townFx(t)) => 1 + Math.min(OUTPOST_LIMITS.prod, fx.prodAll + (fx.prodRes[r] || 0));
// Production propre de la ville (le comptoir) : or par heure, avant l'efficacité de l'avant-poste
export const townOwnProd = (t, fx = townFx(t)) => (fx.gold ? { gold: fx.gold } : {});
// Soldats requis : le camp d'entraînement fait valoir chaque soldat davantage
export const townGarrisonDiv = (t) => 1 + townFx(t).garrison;
// Entretien ajusté (grenier, vocation commerciale)
export function townUpkeep(t, upkeep) {
  const fx = townFx(t);
  const out = { ...upkeep };
  if (out.food) out.food = out.food * (1 - fx.upkeepFood);
  if (out.gold && fx.voc === 'commercial') out.gold = out.gold * 0.5;
  return out;
}

const near = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y)) <= OUTPOST_LIMITS.neighbor;
// Chance qu'une menace frappe : enceinte de l'avant-poste, avant-poste militaire voisin
export function townThreatMult(state, t) {
  const F = t.town?.fort || {};
  let m = Math.max(FORT_THREAT.floor, 1 - FORT_THREAT.wall * (F.wall || 0) - FORT_THREAT.moat * (F.moat || 0));
  const cover = Object.values(state.territories || {}).some((o) => o !== t && near(o, t) && vocationOf(o) === 'militaire');
  if (cover) m *= 1 - OUTPOST_LIMITS.coverThreat;
  return m;
}
// Facteurs de stabilité apportés par la ville (affichés au joueur)
export function townStabFactors(state, t) {
  const f = [];
  const fx = townFx(t);
  if (fx.stab) f.push(['Chapelle de l’avant-poste', Math.round(fx.stab)]);
  if (Object.values(state.territories || {}).some((o) => near(o, t) && vocationOf(o) === 'savoir')) f.push(['Avant-poste du savoir voisin', OUTPOST_LIMITS.calmStab]);
  if (state.famine && fx.voc === 'agricole') f.push(['Grenier de la région (famine)', 5]);
  return f;
}
// Bonus du royaume apportés par les villes des avant-postes (bornés)
export function townGlobalMods(state, effOf = () => 1) {
  let def = 0, car = 0, ind = 0;
  for (const t of Object.values(state.territories || {})) {
    if (!t.town) continue;
    const e = effOf(t);
    if (e <= 0) continue;
    const fx = townFx(t);
    def += fx.cityDef * Math.min(1, e);
    car += fx.caravan * Math.min(1, e);
    if (fx.voc === 'industriel') ind += 0.01;
  }
  const m = {};
  if (def) m['city.def'] = Math.min(OUTPOST_LIMITS.cityDef, def);
  if (car) m['caravan.gain'] = car;
  if (ind) m['build.speed'] = Math.min(OUTPOST_LIMITS.buildSpeed, ind);
  return m;
}

// ───────── Chantiers (un à la fois par avant-poste) ─────────
export const townSlots = (t) => 2 + (t.level || 1) + (t.town?.exp || 0);
export const townUsed = (t) => townBuildings(t).length + (t.town?.job?.kind === 'build' ? 1 : 0);
const busy = (t) => (t.town?.job ? 'Un chantier est déjà en cours dans cet avant-poste' : null);
function payOr(state, cost) {
  if (!pay(state, cost)) return { ok: false, reason: 'Ressources insuffisantes', missing: missing(state, cost) };
  return null;
}
export function townBuildCheck(state, t, type, x, y) {
  ensureTown(t);
  if (!OUTPOST_BUILDINGS[type]) return { ok: false, reason: 'Bâtiment inconnu' };
  const b = busy(t); if (b) return { ok: false, reason: b };
  if (townUsed(t) >= townSlots(t)) return { ok: false, reason: `Emplacements pleins (${townSlots(t)}) : agrandissez ou améliorez l’avant-poste` };
  if (x != null && !tileFree(t, x, y)) return { ok: false, reason: 'Case occupée' };
  return { ok: true, cost: obCost(type, 1), time: obTime(1) };
}
export function townBuild(state, k, type, x, y, now = Date.now()) {
  const t = state.territories[k];
  if (!t) return { ok: false, reason: 'Avant-poste introuvable' };
  const c = townBuildCheck(state, t, type, x, y);
  if (!c.ok) return c;
  const e = payOr(state, c.cost); if (e) return e;
  t.town.job = { kind: 'build', type, x, y, level: 1, start: now, end: now + c.time * 1000 };
  return { ok: true };
}
export function townUpgradeCheck(state, t, id) {
  ensureTown(t);
  const b = t.town.b[id];
  if (!b) return { ok: false, reason: 'Bâtiment introuvable' };
  if (b.level >= (t.level || 1)) return { ok: false, reason: `Niveau maximal pour un avant-poste de niveau ${t.level || 1}` };
  const bz = busy(t); if (bz) return { ok: false, reason: bz };
  return { ok: true, cost: obCost(b.type, b.level + 1), time: obTime(b.level + 1), next: b.level + 1 };
}
export function townUpgrade(state, k, id, now = Date.now()) {
  const t = state.territories[k];
  if (!t) return { ok: false, reason: 'Avant-poste introuvable' };
  const c = townUpgradeCheck(state, t, id);
  if (!c.ok) return c;
  const e = payOr(state, c.cost); if (e) return e;
  t.town.job = { kind: 'up', id, level: c.next, start: now, end: now + c.time * 1000 };
  return { ok: true };
}
export function townFortCheck(state, t, which) {
  ensureTown(t);
  const F = TOWN_FORT[which];
  if (!F) return { ok: false, reason: 'Inconnu' };
  const cur = t.town.fort[which] || 0;
  const max = Math.min(F.max, F.maxPerLevel * (t.level || 1));
  if (cur >= max) return { ok: false, reason: cur >= F.max ? 'Niveau maximal' : `Améliorez l’avant-poste (niveau ${t.level || 1}) pour aller plus loin` };
  const bz = busy(t); if (bz) return { ok: false, reason: bz };
  return { ok: true, cost: F.cost(cur + 1), time: obTime(Math.ceil((cur + 1) / F.maxPerLevel)), next: cur + 1 };
}
export function townFort(state, k, which, now = Date.now()) {
  const t = state.territories[k];
  if (!t) return { ok: false, reason: 'Avant-poste introuvable' };
  const c = townFortCheck(state, t, which);
  if (!c.ok) return c;
  const e = payOr(state, c.cost); if (e) return e;
  t.town.job = { kind: 'fort', which, level: c.next, start: now, end: now + c.time * 1000 };
  return { ok: true };
}
export function townExpandCheck(state, t) {
  ensureTown(t);
  const e = t.town.exp || 0;
  if (e >= TOWN_EXPAND_LEVEL.length) return { ok: false, reason: 'Taille maximale' };
  if ((t.level || 1) < TOWN_EXPAND_LEVEL[e]) return { ok: false, reason: `Avant-poste de niveau ${TOWN_EXPAND_LEVEL[e]} requis` };
  const bz = busy(t); if (bz) return { ok: false, reason: bz };
  return { ok: true, cost: townExpandCost(e), time: obTime(e + 2), size: TOWN_SIZES[e + 1] };
}
export function townExpand(state, k, now = Date.now()) {
  const t = state.territories[k];
  if (!t) return { ok: false, reason: 'Avant-poste introuvable' };
  const c = townExpandCheck(state, t);
  if (!c.ok) return c;
  const e = payOr(state, c.cost); if (e) return e;
  t.town.job = { kind: 'expand', start: now, end: now + c.time * 1000 };
  return { ok: true };
}
// Agrandit la carte d'une colonne et d'une rangée (à droite et en bas) : rien ne bouge, le terrain existant est gardé
function grow(t) {
  const T = t.town;
  const [w, h] = TOWN_SIZES[Math.min(TOWN_SIZES.length - 1, T.exp + 1)];
  const fresh = townTerrain(t, w, h);
  const ter = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) ter.push(x < T.w && y < T.h ? (T.terrain[y * T.w + x] === 'plain' || x === T.w - 1 || y === T.h - 1 ? 'plain' : T.terrain[y * T.w + x]) : fresh[y * w + x]);
  // L'hôtel de ville secondaire change de case avec le centre : on libère sa nouvelle case si besoin
  const hp = hallPos(w, h);
  ter[hp.y * w + hp.x] = 'plain';
  for (const b of Object.values(T.b)) if (b.x === hp.x && b.y === hp.y) { const old = hallPos(T.w, T.h); b.x = old.x; b.y = old.y; }
  T.w = w; T.h = h; T.terrain = ter; T.exp++;
}
export function moveTownBuilding(state, k, id, x, y) {
  const t = state.territories[k];
  const b = t?.town?.b[id];
  if (!b) return { ok: false, reason: 'Bâtiment introuvable' };
  if (t.town.job?.kind === 'up' && t.town.job.id === id) return { ok: false, reason: 'Chantier en cours sur ce bâtiment' };
  if (!tileFree(t, x, y)) return { ok: false, reason: 'Case occupée' };
  b.x = x; b.y = y;
  return { ok: true };
}
export function demolishTownBuilding(state, k, id) {
  const t = state.territories[k];
  const b = t?.town?.b[id];
  if (!b) return { ok: false, reason: 'Bâtiment introuvable' };
  if (t.town.job?.kind === 'up' && t.town.job.id === id) return { ok: false, reason: 'Chantier en cours sur ce bâtiment' };
  delete t.town.b[id];
  return { ok: true };
}
// Fin des chantiers (appelé par territoryTick)
export function townTick(state, t, now) {
  const T = t.town, j = T?.job;
  if (!j || j.end > now) return null;
  T.job = null;
  const name = t.name || 'l’avant-poste';
  if (j.kind === 'build') {
    if (!tileFree(t, j.x, j.y)) { const f = firstFree(t); if (!f) return null; j.x = f.x; j.y = f.y; }
    const id = 'ob' + (++T.seq);
    T.b[id] = { id, type: j.type, level: 1, x: j.x, y: j.y };
    log(state, 'good', `🏗️ ${OUTPOST_BUILDINGS[j.type].icon} ${OUTPOST_BUILDINGS[j.type].name} bâti à ${name}.`, now);
  } else if (j.kind === 'up' && T.b[j.id]) {
    T.b[j.id].level = j.level;
    log(state, 'good', `🏗️ ${OUTPOST_BUILDINGS[T.b[j.id].type].name} de ${name} : niveau ${j.level}.`, now);
  } else if (j.kind === 'fort') {
    T.fort[j.which] = j.level;
    log(state, 'good', `🏗️ ${TOWN_FORT[j.which].name} de ${name} : niveau ${j.level}.`, now);
  } else if (j.kind === 'expand') {
    grow(t);
    log(state, 'good', `🏗️ ${name} s’agrandit : ${T.w} × ${T.h} cases.`, now);
  }
  return j;
}
export function firstFree(t) {
  const T = t.town;
  const hp = hallPos(T.w, T.h);
  let best = null, bd = Infinity;
  for (let y = 0; y < T.h; y++) for (let x = 0; x < T.w; x++) if (tileFree(t, x, y)) { const d = Math.hypot(x - hp.x, y - hp.y); if (d < bd) { bd = d; best = { x, y }; } }
  return best;
}
