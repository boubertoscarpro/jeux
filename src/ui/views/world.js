import { TERRAINS, POI_TYPES, RIVALS, BOSSES } from '../../data/world.js';
import { UNITS, ALL_UNITS, FORMATIONS, TERRAIN_COMBAT } from '../../data/units.js';
import { RESOURCES } from '../../data/resources.js';
import { CONSUMABLES } from '../../data/items.js';
import { HERO_CLASSES } from '../../data/heroes.js';
import { fmt, fmtTime } from '../../core/util.js';
import { computeMods } from '../../systems/modifiers.js';
import { wTerrain, isRevealed, poiAt, distCap, travelTime, key, territoryLimit, territoryRange, revealedCount } from '../../systems/world.js';
import { planMarch, sendMarch, carryCapacity, gatherRate, breadNeeded, MARCH_TYPES } from '../../systems/marches.js';
import { previewBattle } from '../../systems/combat.js';
import { armyPower } from '../../systems/army.js';
import { canClaim, claimTerritory, abandonTerritory, specOf, specCategory, specAffinity } from '../../systems/territory.js';
import { TERRITORY_SPECS } from '../../data/territories.js';
import { openRenameCastle, openRenameOutpost } from '../upgrades.js';
import { sendCaravan, townPrice, caravanTime, caravanCargo, caravanSlots } from '../../systems/market.js';
import { levelOf } from '../../systems/city.js';
import { ensureDungeon } from '../../systems/dungeons.js';
import { DUNGEON_THEMES, DUNGEON_AFFIXES, ROOM_TYPES } from '../../data/dungeons.js';
import { esc, costList, resChips, bar, countdown } from '../components.js';
import { terrainSprite, tileVariant, drawMedallion, drawBanner, drawToken, placeLabels, relationOf, RELATION_STYLE, stanceName } from '../worldArt.js';
import { castleName, outpostLabel } from '../../systems/identity.js';

// Taille réelle d'une case au zoom 1 (px) : 40 (au lieu de 26) pour des lieux immédiatement reconnaissables
export const BASE_TILE = 40;
const Z_MAX = 2.6;

function cam(app) {
  const w = app.state.world;
  if (!app.ui.cam) app.ui.cam = { x: w.capital.x + 0.5, y: w.capital.y + 0.5, zoom: 1 };
  return app.ui.cam;
}
// Zoom minimal : le monde entier tient dans la fenêtre (jamais moins de 0,15)
const zMinFor = (W, H, S) => Math.max(0.15, Math.min(1, Math.min(W, H) / (S * BASE_TILE)));
// La caméra ne sort jamais de la carte ; si la carte est plus petite que la fenêtre, elle est centrée
export function clampWorldCam(c, W, H, S) {
  c.zoom = Math.max(zMinFor(W, H, S), Math.min(Z_MAX, c.zoom));
  const T = BASE_TILE * c.zoom, hw = W / 2 / T, hh = H / 2 / T;
  c.x = S <= 2 * hw ? S / 2 : Math.max(hw, Math.min(S - hw, c.x));
  c.y = S <= 2 * hh ? S / 2 : Math.max(hh, Math.min(S - hh, c.y));
  return c;
}
// Zoom centré sur un point de l'écran (px, py relatifs au canvas) : la case sous le curseur reste en place
export function zoomWorldAt(c, factor, px, py, W, H, S) {
  const T1 = BASE_TILE * c.zoom;
  const wx = (px - W / 2) / T1 + c.x, wy = (py - H / 2) / T1 + c.y;
  c.zoom = Math.max(zMinFor(W, H, S), Math.min(Z_MAX, c.zoom * factor));
  const T2 = BASE_TILE * c.zoom;
  c.x = wx - (px - W / 2) / T2; c.y = wy - (py - H / 2) / T2;
  return clampWorldCam(c, W, H, S);
}
// Catégories de lieux (filtres de la carte)
const POI_CAT = (p) => {
  const def = POI_TYPES[p.type];
  if (!def) return 'other';
  if (def.kind === 'gather') return 'gather';
  if (def.dungeon || p.type === 'lostCity' || p.type === 'ruinSite') return 'dungeon';
  if (def.kind === 'danger') return 'danger';
  if (def.kind === 'town' || def.kind === 'kingdom' || def.kind === 'village') return 'social';
  return 'always';
};
export const MAP_FILTERS = { gather: '⛏️ Ressources', danger: '⚔️ Menaces', dungeon: '🏚️ Donjons & ruines', social: '🏘️ Cités & royaumes' };
const CAT_COLOR = { gather: '#9be37a', danger: '#ff7a5c', dungeon: '#c99cff', social: '#ffd56b', always: '#ffffff', other: '#cccccc' };
const filters = (app) => (app.ui.mapF ||= { gather: true, danger: true, dungeon: true, social: true });
let rafPending = false;
const redraw = (app) => { if (rafPending) return; rafPending = true; requestAnimationFrame(() => { rafPending = false; drawMap(app); }); };

function dangerStars(d) { return d > 0 ? '☠'.repeat(Math.min(6, d)) : '<span class="ok">Sûr</span>'; }

export function drawMap(app) {
  const canvas = document.getElementById('world-canvas');
  if (!canvas) return;
  const s = app.state, w = s.world, c = cam(app);
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  if (canvas.width !== Math.round(rect.width * dpr) || canvas.height !== Math.round(rect.height * dpr)) {
    canvas.width = Math.round(rect.width * dpr); canvas.height = Math.round(rect.height * dpr);
  }
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const W = rect.width, H = rect.height;
  clampWorldCam(c, W, H, w.size);
  const T = BASE_TILE * c.zoom;
  const ox = W / 2 - c.x * T, oy = H / 2 - c.y * T;
  ctx.fillStyle = '#0d0f14'; ctx.fillRect(0, 0, W, H);
  const x0 = Math.max(0, Math.floor(-ox / T)), y0 = Math.max(0, Math.floor(-oy / T));
  const x1 = Math.min(w.size - 1, Math.ceil((W - ox) / T)), y1 = Math.min(w.size - 1, Math.ceil((H - oy) / T));
  const now = Date.now();
  const factionTiles = new Map();
  for (const f of s.factions || []) for (const k of f.territory) factionTiles.set(k, f);
  const banner = s.meta.banner || '#e2b84a';
  const detail = T >= 14;
  // Terrain (textures mises en cache) et brouillard
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const px = ox + x * T, py = oy + y * T;
    if (!isRevealed(w, x, y)) {
      ctx.fillStyle = (x + y) % 2 ? '#1a1d26' : '#181a22';
      ctx.fillRect(px, py, T + 0.5, T + 0.5);
      continue;
    }
    const ter = wTerrain(w, x, y);
    if (detail) ctx.drawImage(terrainSprite(ter, tileVariant(x, y), T, dpr), px, py, T + 0.5, T + 0.5);
    else { ctx.fillStyle = TERRAINS[ter].color; ctx.fillRect(px, py, T + 0.5, T + 0.5); }
  }
  // Territoires : teinte et frontières selon la relation (ennemi, allié, neutre) ; les vôtres en couleur de bannière
  const owner = (x, y) => { const k = key(x, y); if (s.territories[k]) return 'me'; const f = factionTiles.get(k); return f ? f : null; };
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    if (!isRevealed(w, x, y)) continue;
    const o = owner(x, y);
    if (!o) continue;
    const px = ox + x * T, py = oy + y * T;
    const col = o === 'me' ? banner : RIVALS[o.idx].color;
    ctx.fillStyle = col + (o === 'me' ? '38' : '33'); ctx.fillRect(px, py, T + 0.5, T + 0.5);
    const st = o === 'me' ? { color: banner, width: 2.5, dash: [] } : relationOf(o);
    ctx.strokeStyle = st.color || col; ctx.lineWidth = Math.max(1, Math.min(st.width, T / 8)); ctx.setLineDash(T > 10 ? st.dash : []);
    ctx.beginPath();
    for (const [dx, dy, ax, ay, bx, by] of [[0, -1, 0, 0, 1, 0], [1, 0, 1, 0, 1, 1], [0, 1, 0, 1, 1, 1], [-1, 0, 0, 0, 0, 1]]) {
      if (owner(x + dx, y + dy) === o) continue;
      ctx.moveTo(px + ax * T, py + ay * T); ctx.lineTo(px + bx * T, py + by * T);
    }
    ctx.stroke(); ctx.setLineDash([]);
  }
  // Grille légère (zoom rapproché)
  if (T > 22) {
    ctx.strokeStyle = 'rgba(0,0,0,0.1)'; ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = x0; x <= x1 + 1; x++) { ctx.moveTo(ox + x * T, oy + y0 * T); ctx.lineTo(ox + x * T, oy + (y1 + 1) * T); }
    for (let y = y0; y <= y1 + 1; y++) { ctx.moveTo(ox + x0 * T, oy + y * T); ctx.lineTo(ox + (x1 + 1) * T, oy + y * T); }
    ctx.stroke();
  }
  // Portée des territoires
  const mods = computeMods(s, now);
  const cpx = ox + (w.capital.x + 0.5) * T, cpy = oy + (w.capital.y + 0.5) * T;
  ctx.strokeStyle = 'rgba(226,184,74,0.4)'; ctx.setLineDash([6, 6]); ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(cpx, cpy, territoryRange(s, mods) * T, 0, Math.PI * 2); ctx.stroke();
  ctx.setLineDash([]);
  // Trajets (sous les lieux) : marches, expéditions, raids
  const tokens = [];
  const mark = (x, y) => ({ x: ox + (x + 0.5) * T, y: oy + (y + 0.5) * T });
  for (const m of s.marches) {
    const a = mark(w.capital.x, w.capital.y), b = mark(m.x, m.y);
    const col = m.type === 'attack' || m.type === 'boss' || m.type === 'dungeon' ? '#ff6b5a' : m.type === 'explore' || m.type === 'scout' ? '#6cc3ff' : '#ffd166';
    let f = 1, end = null, toward = b, from = a;
    if (m.phase === 'out') { f = (now - m.start) / (m.arrive - m.start); end = m.arrive; }
    else if (m.phase === 'back') { f = 1 - (now - (m.returnAt - m.travel)) / m.travel; end = m.returnAt; toward = a; from = b; }
    else if (m.phase === 'work') end = m.workEnd;
    f = Math.max(0, Math.min(1, f));
    ctx.strokeStyle = col; ctx.globalAlpha = 0.85; ctx.lineWidth = Math.max(2, Math.min(4, T / 10)); ctx.setLineDash([7, 5]);
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1;
    tokens.push({ x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, col, icon: MARCH_TYPES[m.type]?.icon || '⚑', angle: m.phase === 'work' ? null : Math.atan2(toward.y - from.y, toward.x - from.x), end, label: `${MARCH_TYPES[m.type]?.name || 'Marche'}${m.phase === 'back' ? ' (retour)' : m.phase === 'work' ? ' (sur place)' : ''}` });
  }
  for (const t of s.expeditions || []) {
    if (t.status === 'idle' || !t.at) continue;
    const a = mark(w.capital.x, w.capital.y), b = mark(t.at.x, t.at.y);
    ctx.strokeStyle = 'rgba(140,230,140,0.85)'; ctx.lineWidth = 2; ctx.setLineDash([2, 4]);
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); ctx.setLineDash([]);
    const due = { out: t.arrive, work: t.workEnd, back: t.returnAt }[t.status];
    const st = { out: t.start, work: t.workStart, back: t.returnAt - t.travel }[t.status];
    let f = t.status === 'work' ? 1 : Math.max(0, Math.min(1, (now - st) / Math.max(1, due - st)));
    if (t.status === 'back') f = 1 - f;
    tokens.push({ x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, col: '#4fae5e', icon: '⛺', angle: null, end: due, label: `Expédition ${t.name || ''}` });
  }
  for (const r of s.raids) {
    const a = mark(r.from.x, r.from.y), b = mark(w.capital.x, w.capital.y);
    ctx.strokeStyle = 'rgba(255,40,40,0.95)'; ctx.lineWidth = Math.max(3, Math.min(5, T / 8)); ctx.setLineDash([10, 6]);
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); ctx.setLineDash([]);
    const start = r.start || r.arrive - 10 * 60000;
    const f = Math.max(0, Math.min(1, (now - start) / Math.max(1, r.arrive - start)));
    tokens.push({ x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, col: '#d62828', icon: '⚔️', angle: Math.atan2(b.y - a.y, b.x - a.x), end: r.arrive, label: `Raid : ${r.name}`, raid: true });
  }
  // Lieux
  const F = filters(app);
  const labels = [];
  const blocked = [];
  const lsize = Math.round(Math.max(10, Math.min(14, T * 0.34)));
  for (const p of Object.values(w.pois)) {
    if (p.x < x0 || p.x > x1 || p.y < y0 || p.y > y1) continue;
    if (!isRevealed(w, p.x, p.y)) continue;
    const def = POI_TYPES[p.type];
    if (!def) continue;
    const cat = POI_CAT(p);
    if (F[cat] === false && def.kind !== 'capital') continue;
    const px = ox + (p.x + 0.5) * T, py = oy + (p.y + 0.5) * T;
    const cleared = p.clearedUntil > now || (def.kind === 'gather' && p.amount < 1);
    const major = def.kind === 'capital' || def.kind === 'kingdom' || def.kind === 'town' || def.kind === 'boss';
    // Vue d'ensemble : les sites mineurs deviennent des points colorés, les lieux majeurs gardent leur médaillon
    if (T < 13 && !major) {
      ctx.globalAlpha = cleared ? 0.35 : 0.95;
      ctx.fillStyle = CAT_COLOR[cat];
      ctx.beginPath(); ctx.arc(px, py, Math.max(1.6, T * 0.3), 0, 7); ctx.fill();
      ctx.globalAlpha = 1;
      continue;
    }
    const icon = p.type === 'kingdom' ? RIVALS[p.rival]?.icon || def.icon : p.type === 'boss' && s.boss ? ALL_UNITS[BOSSES[s.boss.key].unit].icon : def.icon;
    const r = major ? Math.max(9, Math.min(def.kind === 'capital' ? 30 : 26, T * (def.kind === 'capital' ? 0.62 : 0.52))) : Math.max(7, Math.min(20, T * 0.4));
    const ring = def.kind === 'capital' ? banner : def.kind === 'kingdom' ? RIVALS[p.rival]?.color || CAT_COLOR.social : def.kind === 'boss' ? '#ff3b3b' : CAT_COLOR[cat];
    const glow = def.kind === 'boss' ? `rgba(255,60,60,${0.5 + 0.4 * Math.sin(now / 300)})` : def.kind === 'capital' ? 'rgba(255,220,120,0.7)' : null;
    drawMedallion(ctx, px, py, r, ring, icon, { alpha: cleared ? 0.4 : 1, glow });
    if (major) blocked.push({ x: px - r, y: py - r, w: 2 * r, h: 2 * r });
    if (p.danger > 0 && def.kind !== 'boss' && T > 16) {
      const n = Math.min(5, p.danger), pw = Math.max(3, r * 0.28);
      ctx.fillStyle = p.danger >= 4 ? '#ff4f4f' : p.danger >= 2 ? '#ffb03a' : '#ffe58a';
      for (let i = 0; i < n; i++) ctx.fillRect(px - (n * pw * 1.3) / 2 + i * pw * 1.3, py + r + 1, pw, pw * 0.8);
    }
    if (p.infested && T > 16) { ctx.font = `${Math.round(r * 0.8)}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('🕷️', px + r * 0.85, py - r * 0.85); }
    // Étiquettes : capitale toujours, cités et royaumes en vue moyenne, autres lieux en vue rapprochée
    const name = def.kind === 'capital' ? castleName(s) : p.name || def.name;
    const prio = { capital: 100, kingdom: 80, boss: 75, town: 60 }[def.kind] ?? (def.dungeon ? 40 : 10);
    const minT = { capital: 6, kingdom: 14, boss: 14, town: 16 }[def.kind] ?? (def.dungeon || p.type === 'lostCity' ? 26 : 56);
    if (T >= minT) labels.push({ x: px, y: py, offset: r + (p.danger > 0 && T > 16 ? 6 : 2), text: name, prio, size: def.kind === 'capital' ? lsize + 1 : lsize, color: def.kind === 'capital' ? '#ffe9a8' : def.kind === 'kingdom' ? '#ffd9d0' : '#f3e6c4', border: def.kind === 'capital' ? banner : def.kind === 'kingdom' ? RIVALS[p.rival]?.color : null });
  }
  // Avant-postes du joueur : étendard + nom
  for (const t of Object.values(s.territories || {})) {
    if (t.x < x0 || t.x > x1 || t.y < y0 || t.y > y1) continue;
    const px = ox + (t.x + 0.5) * T, py = oy + (t.y + 0.5) * T;
    const sz = Math.max(8, Math.min(26, T * 0.55));
    const hasPoi = !!w.pois[key(t.x, t.y)];
    drawBanner(ctx, hasPoi ? px + T * 0.3 : px, hasPoi ? py - T * 0.3 : py, sz, banner);
    if (T >= 12) labels.push({ x: px, y: py, offset: sz * 0.6 + 2, text: `🚩 ${outpostLabel(t)}`, prio: 70, size: lsize, color: '#ffe9a8', border: banner });
  }
  // Pions d'armée (au-dessus des lieux) et leur chrono
  const tr = Math.max(7, Math.min(15, T * 0.34));
  for (const k of tokens) {
    drawToken(ctx, k.x, k.y, tr, k.col, k.icon, k.angle);
    if (T >= 18 && k.end) labels.push({ x: k.x, y: k.y, offset: tr + 4, text: `${k.label} · ${fmtTime(k.end - now)}`, prio: k.raid ? 90 : 50, size: Math.max(10, lsize - 1), color: k.raid ? '#ffd0d0' : '#e8f4ff', bg: k.raid ? 'rgba(90,10,10,0.85)' : 'rgba(10,20,35,0.8)' });
  }
  // Les commandes posées sur la carte (filtres, zoom, mini-carte) ne doivent pas masquer d'étiquette
  const cr = canvas.getBoundingClientRect();
  for (const el of canvas.parentElement.querySelectorAll('.map-filters > *, .map-tools, #world-mini:not([hidden]), .map-hint')) {
    const r = el.getBoundingClientRect();
    if (r.width) blocked.push({ x: r.left - cr.left - 4, y: r.top - cr.top - 4, w: r.width + 8, h: r.height + 8 });
  }
  placeLabels(ctx, labels, W, H, blocked);
  const sel = app.ui.worldSel;
  if (sel) {
    const pulse = 0.6 + 0.4 * Math.sin(now / 250);
    ctx.strokeStyle = `rgba(255,255,255,${pulse})`; ctx.lineWidth = 3;
    ctx.strokeRect(ox + sel.x * T + 1.5, oy + sel.y * T + 1.5, Math.max(3, T - 3), Math.max(3, T - 3));
  }
  drawMini(app, W, H);
}

// Mini-carte : terrain découvert, lieux majeurs, cadre de la vue ; cliquer ou glisser déplace la caméra
function drawMini(app, W, H) {
  const mini = document.getElementById('world-mini');
  if (!mini || mini.hidden) return;
  const s = app.state, w = s.world, c = cam(app), S = w.size;
  const dpr = window.devicePixelRatio || 1;
  const size = mini.clientWidth;
  if (mini.width !== Math.round(size * dpr)) { mini.width = Math.round(size * dpr); mini.height = Math.round(size * dpr); }
  const ctx = mini.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const k = size / S;
  // Le fond (terrain) est mis en cache tant que le brouillard ne change pas
  const sig = `${S}:${revealedCount(w)}:${Math.floor(Date.now() / 60000)}`;
  if (!app._miniBg || app._miniSig !== sig) {
    const bg = document.createElement('canvas');
    bg.width = S; bg.height = S;
    const b = bg.getContext('2d');
    const img = b.createImageData(S, S);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const i = (y * S + x) * 4;
      const hex = isRevealed(w, x, y) ? TERRAINS[wTerrain(w, x, y)].color : '#1c1f29';
      img.data[i] = parseInt(hex.slice(1, 3), 16); img.data[i + 1] = parseInt(hex.slice(3, 5), 16); img.data[i + 2] = parseInt(hex.slice(5, 7), 16); img.data[i + 3] = 255;
    }
    b.putImageData(img, 0, 0);
    app._miniBg = bg; app._miniSig = sig;
  }
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(app._miniBg, 0, 0, size, size);
  for (const p of Object.values(w.pois)) {
    const kind = POI_TYPES[p.type]?.kind;
    if (!['capital', 'kingdom', 'town', 'boss'].includes(kind) || !isRevealed(w, p.x, p.y)) continue;
    ctx.fillStyle = kind === 'capital' ? '#ffd24a' : kind === 'kingdom' ? RIVALS[p.rival]?.color || '#b04ad0' : kind === 'boss' ? '#ff3b3b' : '#ffe9a8';
    ctx.fillRect((p.x - 0.8) * k, (p.y - 0.8) * k, Math.max(3, 2.6 * k), Math.max(3, 2.6 * k));
  }
  for (const t of Object.values(s.territories || {})) { ctx.fillStyle = '#e2b84a'; ctx.fillRect(t.x * k, t.y * k, Math.max(2, k), Math.max(2, k)); }
  const T = BASE_TILE * c.zoom;
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5;
  ctx.strokeRect((c.x - W / 2 / T) * k, (c.y - H / 2 / T) * k, (W / T) * k, (H / T) * k);
}

// Accès rapide : lieux découverts notables, du plus proche au plus lointain
export function notablePlaces(state) {
  const w = state.world;
  const out = [];
  for (const p of Object.values(w.pois)) {
    if (!isRevealed(w, p.x, p.y)) continue;
    const def = POI_TYPES[p.type];
    if (!def) continue;
    if (['town', 'kingdom', 'boss'].includes(def.kind) || def.dungeon || p.type === 'lostCity') {
      const label = def.kind === 'kingdom' ? `${RIVALS[p.rival]?.icon || def.icon} ${p.name}` : def.kind === 'town' ? `${def.icon} ${p.name}` : `${def.icon} ${def.name}`;
      out.push({ x: p.x, y: p.y, label, d: distCap(w, p.x, p.y) });
    }
  }
  for (const t of Object.values(state.territories || {})) out.push({ x: t.x, y: t.y, label: `🚩 ${outpostLabel(t)}`, d: distCap(w, t.x, t.y) });
  return out.sort((a, b) => a.d - b.d);
}

function focusTile(app, x, y, zoom = null) {
  const c = cam(app);
  c.x = x + 0.5; c.y = y + 0.5;
  if (zoom) c.zoom = Math.max(c.zoom, zoom);
  app.ui.worldSel = { x, y };
  const panel = document.getElementById('world-panel');
  if (panel) panel.innerHTML = tilePanel(app);
  drawMap(app);
}

// Contenu de l'infobulle du monde
function ownerText(s, x, y) {
  const t = s.territories[key(x, y)];
  if (t) return `<span class="ok">🚩 Votre avant-poste « ${esc(outpostLabel(t))} »</span>`;
  const f = (s.factions || []).find((ff) => ff.territory.includes(key(x, y)));
  if (f) { const st = relationOf(f); return `<span style="color:${st.color || RIVALS[f.idx].color}">${RIVALS[f.idx].icon} ${esc(RIVALS[f.idx].name)} — ${esc(stanceName(f))}</span>`; }
  return '';
}
function worldTipHtml(app, x, y) {
  const s = app.state, w = s.world;
  if (!isRevealed(w, x, y)) return `<b>Région inexplorée</b> <span class="muted">(${x}, ${y})</span><div class="small muted">Clic : envoyer des éclaireurs</div>`;
  const poi = poiAt(w, x, y);
  const def = poi && POI_TYPES[poi.type];
  const own = ownerText(s, x, y);
  const name = def ? (def.kind === 'capital' ? castleName(s) : poi.name || def.name) : null;
  const res = def?.kind === 'gather' ? `${RESOURCES[def.res].icon} ${fmt(poi.amount)} / ${fmt(poi.max)}` : '';
  return `${name ? `<b>${def.kind === 'kingdom' ? RIVALS[poi.rival]?.icon || def.icon : def.icon} ${esc(name)}</b>` : `<b>${esc(TERRAINS[wTerrain(w, x, y)].name)}</b>`} <span class="muted">(${x}, ${y})</span>
    ${name ? `<div class="small muted">${esc(def.name !== name ? def.name + ' · ' : '')}${esc(TERRAINS[wTerrain(w, x, y)].name)}</div>` : ''}
    ${poi?.danger > 0 ? `<div class="small">Danger : ${'☠'.repeat(Math.min(6, poi.danger))}${poi.clearedUntil > Date.now() ? ' · nettoyé' : ''}</div>` : ''}${res ? `<div class="small">${res}</div>` : ''}
    ${own ? `<div class="small">${own}</div>` : ''}<div class="small muted">Clic : détails et actions</div>`;
}

function bindCanvas(app) {
  const canvas = document.getElementById('world-canvas');
  if (!canvas || canvas.dataset.bound) return;
  canvas.dataset.bound = '1';
  const pts = new Map();
  let drag = null, pinch = null;
  const size = () => { const r = canvas.getBoundingClientRect(); return { r, W: r.width, H: r.height, S: app.state.world.size }; };
  canvas.addEventListener('pointerdown', (e) => {
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.size === 1) drag = { x: e.clientX, y: e.clientY, moved: false, id: e.pointerId };
    if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), z: cam(app).zoom }; if (drag) drag.moved = true; }
    canvas.setPointerCapture(e.pointerId);
  });
  // Infobulle de survol (souris) : lieu, terrain, propriétaire
  const tipEl = () => document.getElementById('world-tip');
  let tipKey = '';
  canvas.addEventListener('pointermove', (e) => {
    if (pts.size || e.pointerType === 'touch') { tipEl()?.classList.remove('on'); return; }
    const { r, W, H, S } = size();
    const c = cam(app), T = BASE_TILE * c.zoom;
    const x = Math.floor((e.clientX - r.left - W / 2) / T + c.x), y = Math.floor((e.clientY - r.top - H / 2) / T + c.y);
    const el = tipEl();
    if (!el) return;
    if (x < 0 || y < 0 || x >= S || y >= S) { el.classList.remove('on'); tipKey = ''; return; }
    const k = x + ',' + y;
    if (k !== tipKey) { tipKey = k; el.innerHTML = worldTipHtml(app, x, y); }
    const px = e.clientX - r.left, py = e.clientY - r.top;
    const w = el.offsetWidth || 200, h = el.offsetHeight || 60;
    el.style.left = Math.max(6, Math.min(W - w - 6, px + 16)) + 'px';
    el.style.top = Math.max(6, py + 18 + h > H ? py - h - 12 : py + 18) + 'px';
    el.classList.add('on');
  });
  canvas.addEventListener('pointerleave', () => { tipEl()?.classList.remove('on'); tipKey = ''; });
  canvas.addEventListener('pointermove', (e) => {
    if (!pts.has(e.pointerId)) return;
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const c = cam(app), { r, W, H, S } = size();
    if (pinch && pts.size >= 2) {
      const [a, b] = [...pts.values()];
      const target = pinch.z * Math.hypot(a.x - b.x, a.y - b.y) / pinch.d;
      zoomWorldAt(c, target / c.zoom, (a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top, W, H, S);
      redraw(app);
      return;
    }
    if (!drag || drag.id !== e.pointerId) return;
    const T = BASE_TILE * c.zoom;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true;
    if (drag.moved) { c.x -= dx / T; c.y -= dy / T; clampWorldCam(c, W, H, S); drag.x = e.clientX; drag.y = e.clientY; redraw(app); }
  });
  const end = (e) => {
    pts.delete(e.pointerId);
    if (pts.size < 2) pinch = null;
    if (drag && drag.id === e.pointerId && !drag.moved && e.type === 'pointerup') {
      const { r, W, H, S } = size();
      const c = cam(app), T = BASE_TILE * c.zoom;
      const x = Math.floor((e.clientX - r.left - W / 2) / T + c.x);
      const y = Math.floor((e.clientY - r.top - H / 2) / T + c.y);
      if (x >= 0 && y >= 0 && x < S && y < S) {
        app.ui.worldSel = { x, y };
        const panel = document.getElementById('world-panel');
        if (panel) panel.innerHTML = tilePanel(app);
        drawMap(app);
      }
    }
    if (drag && drag.id === e.pointerId) drag = null;
  };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const { r, W, H, S } = size();
    zoomWorldAt(cam(app), Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.0015)), e.clientX - r.left, e.clientY - r.top, W, H, S);
    redraw(app);
  }, { passive: false });
  // Mini-carte : cliquer ou glisser recentre la vue
  const mini = document.getElementById('world-mini');
  if (mini) {
    let down = false;
    const go = (e) => { const r = mini.getBoundingClientRect(), S = app.state.world.size, c = cam(app); c.x = ((e.clientX - r.left) / r.width) * S; c.y = ((e.clientY - r.top) / r.height) * S; redraw(app); };
    mini.addEventListener('pointerdown', (e) => { down = true; mini.setPointerCapture(e.pointerId); go(e); e.stopPropagation(); });
    mini.addEventListener('pointermove', (e) => { if (down) go(e); });
    mini.addEventListener('pointerup', () => { down = false; });
    mini.addEventListener('wheel', (e) => e.preventDefault(), { passive: false });
  }
  if (!app._resizeBound) {
    app._resizeBound = true;
    window.addEventListener('resize', () => { if (app.ui.view === 'world') drawMap(app); });
  }
}

function enemyBlock(app, poi, enemies) {
  if (!enemies || !Object.keys(enemies).length) return '<div class="muted small">Aucune présence ennemie.</div>';
  if (!poi.scouted) {
    const p = armyPower(enemies) || Object.entries(enemies).reduce((s, [u, n]) => s + n * (ALL_UNITS[u].atk + ALL_UNITS[u].def), 0);
    return `<div class="small">Forces ennemies : <b>inconnues</b> — puissance estimée ${fmt(p * 0.7)} à ${fmt(p * 1.4)}.<br><span class="muted">Envoyez un éclaireur (Espionner) pour connaître la composition exacte.</span></div>`;
  }
  return `<div class="enemy-list">${Object.entries(enemies).map(([u, n]) => `<span class="unit-chip" title="${esc(ALL_UNITS[u].name)} — ${esc(ALL_UNITS[u].class)}">${ALL_UNITS[u].icon} ${n} ${esc(ALL_UNITS[u].name)}</span>`).join('')}</div>`;
}

function tilePanel(app) {
  const s = app.state;
  const sel = app.ui.worldSel;
  const now = Date.now();
  if (!sel) {
    return `<h3>🗺️ Les Terres Brisées</h3><p class="muted">Cliquez sur une case pour l’inspecter. Glissez pour vous déplacer, molette (ou pincement) pour zoomer, ⤢ pour la vue d’ensemble. La mini-carte et « Aller à… » mènent directement aux lieux découverts.</p>
      <ul class="small legend"><li>🌫️ Cases sombres : inexplorées — envoyez des <b>éclaireurs</b>.</li><li>☠ Barres de couleur : niveau de danger.</li><li>Cercle doré pointillé : portée de vos avant-postes.</li><li>Plus un site est dangereux, plus il rapporte.</li></ul>
      <h4>Territoires</h4><div class="map-legend small">
        <div><span class="lg-sw" style="--c:${esc(s.meta.banner || '#e2b84a')}"></span> Vos avant-postes</div>
        ${['war', 'alliance', 'trade', 'truce', 'neutral'].map((k) => `<div><span class="lg-sw ${k === 'neutral' ? 'dashed' : ''}" style="--c:${RELATION_STYLE[k].color || '#9aa0ad'}"></span> ${esc(RELATION_STYLE[k].label)}</div>`).join('')}</div>
      <h4>Lieux</h4><div class="map-legend small">${Object.entries(MAP_FILTERS).map(([k, l]) => `<div><span class="lg-dot" style="--c:${CAT_COLOR[k]}"></span> ${esc(l)}</div>`).join('')}<div><span class="lg-dot" style="--c:#ff3b3b"></span> 🐉 Boss mondial</div></div>
      <h4>Mouvements</h4><div class="map-legend small"><div>🧭 Bleu : exploration, espionnage</div><div>🧺 Jaune : récolte</div><div>⚔️ Rouge : attaque — trait rouge épais : <b>raid</b> vers votre château</div><div>⛺ Vert : expédition</div></div>`;
  }
  const { x, y } = sel;
  const w = s.world;
  const revealed = isRevealed(w, x, y);
  const d = distCap(w, x, y);
  const mods = computeMods(s, now);
  const scouts = { scout: 1 };
  let html = `<h3>(${x}, ${y}) · ${revealed ? esc(TERRAINS[wTerrain(w, x, y)].name) : 'Inexploré'}</h3>
    <div class="muted small">Distance : ${d.toFixed(1)} cases · éclaireur ≈ ${fmtTime(travelTime(w, x, y, scouts, mods, 'explore'))} · infanterie ≈ ${fmtTime(travelTime(w, x, y, { spearman: 1 }, mods))}</div>`;
  if (!revealed) {
    return html + `<p>Une région inconnue. Vos éclaireurs peuvent y découvrir des ressources, des ruines, des trésors… ou des dangers.</p>
      <button class="btn primary" data-action="march" data-type="explore">🧭 Explorer</button>`;
  }
  const ter = wTerrain(w, x, y);
  const tc = TERRAIN_COMBAT[ter === 'ash' ? 'ruins' : ter];
  if (tc) html += `<div class="small muted">⚔️ ${esc(tc.note)}</div>`;
  const terr = s.territories[key(x, y)];
  const poi = poiAt(w, x, y);
  const own = ownerText(s, x, y);
  if (own && !terr) html += `<div class="small">${own}</div>`;
  if (poi) {
    const def = POI_TYPES[poi.type];
    html += `<div class="poi-head"><span class="poi-icon">${poi.type === 'kingdom' ? RIVALS[poi.rival].icon : def.icon}</span><div><b>${esc(poi.name || def.name)}</b><div class="small">Danger : ${dangerStars(poi.danger)}${poi.infested ? ' · 🕷️ infesté' : ''}${poi.temp ? ' · ⏳ temporaire' : ''}</div></div></div>`;
    if (def.kind === 'capital') html += `<div class="castle-name">🏰 <b>${esc(castleName(s))}</b> <button class="mini ghost" data-action="rename-castle">✎ Renommer</button></div><p class="small">Capitale de ${esc(s.meta.kingdomName)}. Toutes les marches partent d’ici.</p>`;
    if (def.kind === 'gather') {
      const r = RESOURCES[def.res];
      html += `<div class="panel-sub"><div>${r.icon} <b>${esc(r.name)}</b> : ${fmt(poi.amount)} / ${fmt(poi.max)}</div>${bar(poi.amount, poi.max)}
        <div class="muted small">Régénération : ${fmt(def.regen)}/h${def.bonus ? ` · Bonus : ${Object.keys(def.bonus).map((b) => RESOURCES[b].icon).join(' ')}` : ''}${poi.danger ? ' · Risque d’embuscade : ' + Math.round(poi.danger * 14) + '%' : ''}${poi.danger >= 2 ? ' · Chance de ressources rares' : ''}</div></div>`;
      if (poi.danger > 0) html += `<div class="panel-sub"><h4>Menace</h4>${enemyBlock(app, poi, poi.enemies)}</div>`;
      html += `<div class="row gap"><button class="btn primary" data-action="march" data-type="gather">🧺 Récolter</button>${poi.danger ? '<button class="btn" data-action="march" data-type="scout">👁️ Espionner</button>' : ''}</div>`;
    }
    if (def.dungeon) {
      const d = ensureDungeon(poi);
      html += `<div class="panel-sub"><h4>${esc(DUNGEON_THEMES[d.theme].name)} — niveau ${d.level}</h4>
        <div class="chips">${d.affixes.map((a) => `<span class="chip" title="${esc(DUNGEON_AFFIXES[a].desc)}">${DUNGEON_AFFIXES[a].icon} ${esc(DUNGEON_AFFIXES[a].name)}</span>`).join('')}</div>
        <div class="rooms">${d.rooms.map((r) => `<span class="room ${r.done ? 'done' : ''}" title="${esc(ROOM_TYPES[r.type].name)}">${r.done ? '✔' : ROOM_TYPES[r.type].icon}</span>`).join('')}</div>
        <div class="small muted">${d.cleared}/${d.rooms.length} salles franchies · purgé ${d.runs} fois. La progression est conservée : vous pouvez revenir finir le travail. Une fois purgé, le donjon se reforme plus profond, avec de nouvelles salles et de nouveaux affixes.</div></div>
        <button class="btn primary" data-action="march" data-type="dungeon">🏚️ Lancer l’expédition de donjon</button>`;
    } else if (def.kind === 'danger') {
      if (poi.clearedUntil > now) html += `<p class="ok">Site nettoyé. Les ennemis reviendront dans ${countdown(poi.clearedUntil)}.</p>`;
      else {
        const k = 1 + poi.danger * 0.45;
        html += `<div class="panel-sub"><h4>Défenseurs</h4>${enemyBlock(app, poi, poi.enemies)}</div>
          <div class="panel-sub"><h4>Butin estimé</h4>${resChips(Object.fromEntries(Object.entries(def.loot).map(([r, v]) => [r, v * k])))}
          ${def.rare ? `<div class="small">Rares : ${Object.keys(def.rare).map((r) => RESOURCES[r].icon + ' ' + RESOURCES[r].name).join(', ')}</div>` : ''}
          ${def.item ? `<div class="small">Objet : ${Math.round(def.item * 100)}%${def.itemMin ? ' (≥ ' + def.itemMin + ')' : ''}</div>` : ''}
          ${def.becomes ? '<div class="small ok">Une fois nettoyée, la mine devient un riche site de fer exploitable.</div>' : ''}
          <div class="muted small">Le butin est limité par la capacité de transport de vos troupes.</div></div>
          <div class="row gap"><button class="btn primary" data-action="march" data-type="attack">⚔️ Attaquer</button><button class="btn" data-action="march" data-type="scout">👁️ Espionner</button></div>`;
      }
    }
    if (def.kind === 'kingdom') {
      const rv = RIVALS[poi.rival];
      html += `<p>${esc(rv.lord)} · style : ${{ raider: 'pillard', defensive: 'défensif', balanced: 'équilibré' }[rv.style]} · puissance ${poi.power.toFixed(2)}<br>Murailles : +${Math.round(poi.wall * 100)}% défense${poi.anger ? ` · <span class="bad">rancune ${poi.anger}</span>` : ''}</p>
        <div class="panel-sub"><h4>Garnison</h4>${poi.garrison ? enemyBlock(app, poi, poi.garrison) : '<div class="muted small">Inconnue — espionnez pour la découvrir.</div>'}</div>
        <p class="muted small">PvP simulé : attaquer un royaume rapporte un gros butin, mais attise sa rancune (raids en retour). Béliers et catapultes réduisent ses murailles.</p>
        <div class="row gap"><button class="btn primary" data-action="march" data-type="attack">⚔️ Attaquer</button><button class="btn" data-action="march" data-type="scout">👁️ Espionner</button></div>`;
    }
    if (def.kind === 'town') {
      html += townPanel(app, poi, mods);
    }
    if (def.kind === 'village') html += `<p>${poi.visited ? 'Vous avez déjà fouillé ce village.' : 'Un village abandonné. Envoyez des éclaireurs : des survivants s’y cachent peut-être.'}</p><button class="btn primary" data-action="march" data-type="explore">🧭 Explorer</button>`;
    if (def.kind === 'boss' && s.boss) {
      const b = BOSSES[s.boss.key];
      html += `<div class="panel-sub"><h4>${esc(b.name)}</h4>${bar(s.boss.hp, s.boss.maxHp, 'boss')}<div class="small">${fmt(s.boss.hp)} / ${fmt(s.boss.maxHp)} PV · fuit dans ${countdown(s.boss.until)}</div>
        <div class="small">Votre contribution : ${fmt(s.boss.contrib)} (${((s.boss.contrib / s.boss.maxHp) * 100).toFixed(1)}%)</div>
        <div class="muted small">Récompenses selon la contribution : ${resChips(b.reward)} + objet unique pour les meilleurs contributeurs (≥ 8%). Les trébuchets infligent +50% aux colosses.</div></div>
        <button class="btn primary" data-action="march" data-type="boss">🐉 Lancer l’assaut</button>`;
    }
  } else {
    html += '<p class="muted">Rien de notable ici… mais une exploration peut révéler des secrets.</p><button class="btn" data-action="march" data-type="explore">🧭 Explorer les environs</button>';
  }
  // Territoire
  if (terr) {
    const sp = specOf(terr), cat = sp && specCategory(sp.id);
    html += `<div class="panel-sub outpost-sub"><h4>🚩 Votre avant-poste ${terr.spec ? '' : '<span class="req small">à spécialiser</span>'}</h4>
      <div class="castle-name">${esc(outpostLabel(terr))} <button class="mini ghost" data-action="rename-outpost" data-k="${key(x, y)}">✎ Renommer</button></div>
      <div class="small">${cat ? `${cat.icon} ${esc(cat.name)} · ` : ''}${sp ? `${sp.icon} ${esc(sp.name)} · ` : ''}Niveau ${terr.level || 1} · garnison ${Object.values(terr.garrison || {}).reduce((a, b) => a + b, 0)} soldats</div>
      <button class="mini" data-action="nav" data-view="territories">Gérer →</button> <button class="mini ghost" data-action="abandon">Abandonner</button></div>`;
  } else if (!poi || !['capital', 'town', 'kingdom', 'boss'].includes(POI_TYPES[poi.type].kind)) {
    const c = canClaim(s, x, y, now);
    const bonus = TERRAINS[ter].territory;
    const specs = TERRITORY_SPECS[ter] || [];
    const probe = { x, y, terrain: ter };
    html += `<div class="panel-sub"><h4>🚩 Avant-poste</h4><div class="small">Bonus de terrain : ${Object.entries(bonus).map(([k, v]) => `${k} +${Math.round(v * 100)}%`).join(', ')} · ${Object.keys(s.territories).length}/${territoryLimit(s, mods)}</div><div class="small muted">Demande ensuite une spécialisation, une garnison et un entretien (or + nourriture).</div>
      ${specs.length ? `<div class="small"><b>Spécialités possibles ici</b> (affinité avec les environs) :</div><ul class="small spec-preview">${specs.map((o) => { const a = specAffinity(s, probe, o.id); const c2 = specCategory(o.id); return `<li>${o.icon} ${esc(o.name)}${c2 ? ` <span class="muted">(${esc(c2.name.replace('Avant-poste ', ''))})</span>` : ''} — <span class="${a.bonus > 0 ? 'ok' : 'muted'}">affinité +${Math.round(a.bonus * 100)} %</span></li>`; }).join('')}</ul>` : ''}
      ${c.ok ? `${costList(c.cost, s)} <button class="mini primary" data-action="claim">Établir</button>` : `<div class="req">${esc(c.reason)}</div>`}</div>`;
  }
  return html;
}

function townPanel(app, town, mods) {
  const s = app.state;
  if (!levelOf(s, 'market')) return `<p>Cité libre de ${esc(town.name)} : construisez un Marché pour y envoyer des caravanes.</p>`;
  const dur = caravanTime(s, town, mods) * 2;
  const opts = Object.keys(RESOURCES).filter((r) => RESOURCES[r].price > 0).map((r) => `<option value="${r}" ${app.ui.cvRes === r ? 'selected' : ''}>${RESOURCES[r].icon} ${esc(RESOURCES[r].name)} — ${townPrice(s, town, r, mods).toFixed(2)} or/u${town.wants.includes(r) ? ' ★' : ''}</option>`).join('');
  return `<p>Cité libre de <b>${esc(town.name)}</b> · relation ${town.relation || 0} (+${Math.min(20, town.relation || 0)}% prix)</p>
    <div class="small">Demande forte (★ +60%) : ${town.wants.map((r) => RESOURCES[r].icon + ' ' + RESOURCES[r].name).join(', ')}</div>
    <div class="panel-sub"><h4>🐪 Envoyer une caravane</h4>
      <div class="form-row"><select id="cv-res" data-change="cv-res">${opts}</select></div>
      <div class="form-row"><input id="cv-qty" type="number" min="1" max="${caravanCargo(s)}" value="${Math.min(caravanCargo(s), 500)}"> <span class="muted small">max ${fmt(caravanCargo(s))}</span></div>
      <label class="small"><input type="checkbox" id="cv-repeat"> Route commerciale (répéter automatiquement)</label>
      <div class="muted small">Aller-retour : ${fmtTime(dur)} · caravanes : ${s.caravans.length}/${caravanSlots(mods)}</div>
      <button class="btn primary" data-action="caravan">Envoyer (sécurisé)</button> <button class="btn ghost" data-action="goto-convoys">Convoi avancé (modes, gardes) →</button></div>`;
}

// ---------- Fenêtre d'envoi de marche ----------
function marchDialog(app, type) {
  const s = app.state;
  const { x, y } = app.ui.worldSel;
  const poi = poiAt(s.world, x, y);
  const md = app.ui.marchDraft = { type, x, y, units: {}, heroId: null, formation: 'balanced', supply: false, potion: '' };
  // Pré-sélection intelligente
  if (type === 'explore' || type === 'scout') md.units.scout = Math.min(s.army.scout || 0, type === 'scout' ? 2 : 1);
  else for (const [u, n] of Object.entries(s.army)) if (n > 0 && u !== 'scout' && u !== 'spy') md.units[u] = n;
  const idle = s.heroes.filter((h) => !h.marchId && !h.assignment);
  const best = idle.sort((a, b) => b.level - a.level)[0];
  if (best && type !== 'explore') md.heroId = best.id;
  if (type === 'explore') md.heroId = idle.find((h) => h.cls === 'explorer')?.id || null;
  const unitsAvail = Object.entries(s.army).filter(([, n]) => n > 0);
  const potions = Object.entries(s.inventory.consumables).filter(([k, n]) => n > 0 && CONSUMABLES[k].march);
  const fights = ['attack', 'boss', 'gather', 'dungeon'].includes(type);
  const title = `${MARCH_TYPES[type].icon} ${MARCH_TYPES[type].name} — ${esc(poi ? poi.name || POI_TYPES[poi.type].name : `(${x}, ${y})`)}`;
  app.modal(`<h2>${title}</h2>
    <div class="march-grid">
      <div>
        <h4>Unités</h4>
        ${unitsAvail.length ? unitsAvail.map(([u, n]) => `<div class="unit-pick"><span title="${esc(UNITS[u].desc)}">${UNITS[u].icon} ${esc(UNITS[u].name)}</span>
          <input type="number" min="0" max="${n}" value="${md.units[u] || 0}" data-input="mu" data-unit="${u}" id="mu-${u}"> <span class="muted small">/ ${n}</span>
          <button class="mini ghost" data-action="mu-max" data-unit="${u}">max</button></div>`).join('') : '<div class="req">Aucune unité disponible.</div>'}
        <h4>Commandant</h4>
        <select data-change="mh" id="mh"><option value="">— Aucun —</option>${idle.map((h) => `<option value="${h.id}" ${h.id === md.heroId ? 'selected' : ''}>${HERO_CLASSES[h.cls].icon} ${esc(h.name)} (niv. ${h.level})</option>`).join('')}</select>
        ${fights ? `<h4>Formation</h4><select data-change="mf" id="mf">${Object.entries(FORMATIONS).map(([k, f]) => `<option value="${k}">${f.icon} ${esc(f.name)}</option>`).join('')}</select><div class="muted small" id="mf-desc">${esc(FORMATIONS.balanced.desc)}</div>
        <label class="small"><input type="checkbox" data-change="ms" id="ms"> 🍞 Rations de pain (+15 moral) — <span id="ms-need"></span></label>
        ${type === 'dungeon' ? `<h4>Seuil de retraite</h4><select data-change="mr" id="mr">${[0.3, 0.5, 0.7, 0.9].map((v) => `<option value="${v}" ${v === 0.5 ? 'selected' : ''}>Se replier à ${Math.round(v * 100)}% de pertes</option>`).join('')}</select>` : ''}
        ${potions.length ? `<h4>Potion</h4><select data-change="mp" id="mp"><option value="">— Aucune —</option>${potions.map(([k, n]) => `<option value="${k}">${CONSUMABLES[k].icon} ${esc(CONSUMABLES[k].name)} (${n})</option>`).join('')}</select>` : ''}` : ''}
      </div>
      <div id="march-preview"></div>
    </div>
    <div class="row gap end"><button class="btn ghost" data-action="close-modal">Annuler</button><button class="btn primary" data-action="send-march">Envoyer</button></div>`, marchActions, 'wide');
  updateMarchPreview(app);
}

function updateMarchPreview(app) {
  const s = app.state, md = app.ui.marchDraft;
  const el = document.getElementById('march-preview');
  if (!el || !md) return;
  const plan = planMarch(s, md);
  const mods = plan.mods || computeMods(s);
  const units = Object.fromEntries(Object.entries(md.units).filter(([, n]) => n > 0));
  const poi = poiAt(s.world, md.x, md.y);
  const need = document.getElementById('ms-need');
  if (need) need.textContent = `${breadNeeded(units)} pains (stock ${fmt(s.resources.bread || 0)})`;
  let html = '<h4>Estimation</h4>';
  if (!plan.ok) html += `<div class="req">${esc(plan.reason)}</div>`;
  else html += `<div>⏱ Trajet : <b>${fmtTime(plan.travel)}</b> (aller)</div>`;
  html += `<div>🎒 Capacité : ${fmt(carryCapacity(units, mods))}</div><div>💪 Puissance : ${fmt(armyPower(units))}</div>`;
  if (md.type === 'gather' && poi) {
    const def = POI_TYPES[poi.type];
    const mult = 1 + (mods['gather.all'] || 0) + (mods['gather.' + def.res] || 0);
    const take = Math.min(poi.amount, carryCapacity(units, mods) / mult);
    const rate = gatherRate(units, mods, def.res) / mult;
    html += `<div>🧺 Rendement : <b>${fmt(take * mult)}</b> ${RESOURCES[def.res].icon} (bonus ${Math.round((mult - 1) * 100)}%)</div><div>⏳ Récolte : ${rate ? fmtTime((take / rate) * 60000) : '—'}</div>`;
  }
  let enemies = null, fort = 0, bossHp = null;
  if (poi && md.type === 'attack') { enemies = poi.type === 'kingdom' ? poi.garrison : poi.enemies; fort = poi.wall || 0; }
  if (poi && md.type === 'gather' && poi.danger > 0) enemies = poi.enemies;
  if (md.type === 'boss' && s.boss) { enemies = { [BOSSES[s.boss.key].unit]: 1 }; bossHp = s.boss.hp; }
  if (enemies && Object.keys(units).length) {
    if (poi.scouted || md.type === 'boss') {
      const ter = s.world && wTerrain(s.world, md.x, md.y);
      const pv = previewBattle(
        { units, mods, formation: md.formation, supply: md.supply, famine: s.famine },
        { units: enemies, mods: { 'combat.atk': 0.05 * (poi.danger || 0), 'combat.def': 0.05 * (poi.danger || 0) }, fort },
        { terrain: poi.type === 'kingdom' ? 'city' : ter === 'ash' ? 'ruins' : ter, weather: s.weather.type, bossHp },
      );
      const lost = Object.entries(pv.attLosses).filter(([, n]) => n > 0);
      html += md.type === 'boss'
        ? `<div class="verdict">🐉 Dégâts estimés : <b>${fmt(pv.bossDamage)}</b></div>`
        : `<div class="verdict ${pv.winner === 'attacker' ? 'good' : 'bad'}">${pv.winner === 'attacker' ? '✔' : '✖'} ${esc(pv.verdict)}</div>`;
      html += `<div class="small">Pertes estimées : ${lost.map(([u, n]) => `${n} ${esc(UNITS[u].name)}`).join(', ') || 'aucune'}</div>
        <ul class="notes small">${pv.notes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>`;
    } else html += '<div class="small muted">Ennemis non espionnés : impossible d’estimer l’issue. ' + (md.type === 'gather' ? 'Une embuscade est possible.' : 'Espionnez d’abord !') + '</div>';
  }
  if (md.type === 'dungeon' && poi) {
    const d = ensureDungeon(poi);
    html += `<div class="small">Donjon niveau ${d.level} : ${d.rooms.length - d.cleared} salle(s) restantes, dont un gardien et un boss. Affixes : ${d.affixes.map((a) => DUNGEON_AFFIXES[a].name + ' (' + DUNGEON_AFFIXES[a].desc + ')').join(', ')}.</div><div class="small muted">Chaque salle est différente : l’armée avance jusqu’au boss ou jusqu’au seuil de retraite. Ingénieurs et éclaireurs désamorcent les pièges.</div>`;
  }
  if (md.type === 'explore') html += '<div class="small muted">Les éclaireurs révèlent la zone et peuvent déclencher un événement (choix, trésor, embuscade…). Un héros Explorateur augmente la vitesse et les trouvailles.</div>';
  el.innerHTML = html;
}

const marchActions = {
  mu: (app, el) => { app.ui.marchDraft.units[el.dataset.unit] = Math.max(0, Math.min(app.state.army[el.dataset.unit] || 0, +el.value || 0)); updateMarchPreview(app); },
  'mu-max': (app, el) => { const u = el.dataset.unit; app.ui.marchDraft.units[u] = app.state.army[u]; document.getElementById('mu-' + u).value = app.state.army[u]; updateMarchPreview(app); },
  mh: (app, el) => { app.ui.marchDraft.heroId = el.value || null; updateMarchPreview(app); },
  mf: (app, el) => { app.ui.marchDraft.formation = el.value; document.getElementById('mf-desc').textContent = FORMATIONS[el.value].desc; updateMarchPreview(app); },
  ms: (app, el) => { app.ui.marchDraft.supply = el.checked; updateMarchPreview(app); },
  mp: (app, el) => { app.ui.marchDraft.potion = el.value || null; updateMarchPreview(app); },
  mr: (app, el) => { app.ui.marchDraft.retreat = +el.value; },
  'send-march': (app) => {
    const r = sendMarch(app.state, app.ui.marchDraft);
    if (!r.ok) return app.toast(r.reason, 'bad');
    app.closeModal();
    app.toast(`${MARCH_TYPES[r.march.type].icon} Marche envoyée`, 'good');
    app.render(); app.save();
  },
};

export default {
  id: 'world', title: 'Carte', icon: '🗺️',
  badge: (app) => app.state.pending.length,
  render(app) {
    cam(app);
    return `<div class="world-layout">
      <div class="world-canvas-wrap card">
        <canvas id="world-canvas" aria-label="Carte du monde : cliquez sur une case pour l’inspecter"></canvas>
        <div class="map-tip" id="world-tip" role="tooltip"></div>
        <div class="map-tools"><button class="mini" data-action="zoom" data-z="1.25" title="Zoomer">＋</button><button class="mini" data-action="zoom" data-z="0.8" title="Dézoomer">－</button><button class="mini" data-action="fit" title="Vue d’ensemble du monde">⤢</button><button class="mini" data-action="center" title="Recentrer sur la capitale (zoom par défaut)">🏰</button>${app.state.boss ? '<button class="mini warn" data-action="goto-boss" title="Boss mondial">🐉</button>' : ''}<button class="mini" data-action="mini-toggle" title="Afficher / masquer la mini-carte">🗺️</button></div>
        <div class="map-filters">${Object.entries(MAP_FILTERS).map(([k, l]) => `<button class="chip ${filters(app)[k] ? 'on' : 'off'}" data-action="map-filter" data-k="${k}" aria-pressed="${filters(app)[k]}">${l}</button>`).join('')}
          <select class="map-places" data-change="map-place" aria-label="Aller à un lieu découvert"><option value="">📍 Aller à…</option>${notablePlaces(app.state).map((p) => `<option value="${p.x},${p.y}">${esc(p.label)} · ${Math.round(p.d)} cases</option>`).join('')}</select></div>
        <canvas id="world-mini" class="world-mini" ${app.ui.miniOff ? 'hidden' : ''} title="Mini-carte : cliquez pour vous y rendre"></canvas>
        <div class="map-hint muted small">${app.state.world.size}×${app.state.world.size} · glisser · molette ou pincement pour zoomer</div>
      </div>
      <div class="world-panel card" id="world-panel">${tilePanel(app)}</div>
    </div>`;
  },
  after(app) { bindCanvas(app); requestAnimationFrame(() => drawMap(app)); },
  tick(app) { drawMap(app); },
  actions: {
    zoom: (app, el) => { const cv = document.getElementById('world-canvas'); if (!cv) return; const r = cv.getBoundingClientRect(); zoomWorldAt(cam(app), +el.dataset.z, r.width / 2, r.height / 2, r.width, r.height, app.state.world.size); drawMap(app); },
    fit: (app) => { const c = cam(app), S = app.state.world.size; c.zoom = 0; c.x = S / 2; c.y = S / 2; drawMap(app); },
    center: (app) => { const c = cam(app); c.x = app.state.world.capital.x + 0.5; c.y = app.state.world.capital.y + 0.5; c.zoom = 1; drawMap(app); },
    'mini-toggle': (app) => { app.ui.miniOff = !app.ui.miniOff; const m = document.getElementById('world-mini'); if (m) m.hidden = app.ui.miniOff; drawMap(app); },
    'map-filter': (app, el) => { const f = filters(app); f[el.dataset.k] = !f[el.dataset.k]; el.classList.toggle('on', f[el.dataset.k]); el.classList.toggle('off', !f[el.dataset.k]); el.setAttribute('aria-pressed', f[el.dataset.k]); drawMap(app); },
    'map-place': (app, el) => { if (!el.value) return; const [x, y] = el.value.split(',').map(Number); el.value = ''; focusTile(app, x, y, 1.2); },
    'goto-boss': (app) => { const b = app.state.boss; if (b) focusTile(app, b.x, b.y, 1); },
    march: (app, el) => marchDialog(app, el.dataset.type),
    claim: (app) => app.act(() => claimTerritory(app.state, app.ui.worldSel.x, app.ui.worldSel.y), (r) => `Avant-poste « ${r.name} » établi — vous pouvez le renommer`),
    'rename-castle': (app) => openRenameCastle(app),
    'rename-outpost': (app, el) => openRenameOutpost(app, el.dataset.k),
    abandon: (app) => app.confirm('<h2>Abandonner ce territoire ?</h2><p>Son bonus disparaît et le coût d’établissement n’est <b>pas remboursé</b>.</p>', 'Abandonner', () => app.act(() => abandonTerritory(app.state, app.ui.worldSel.x, app.ui.worldSel.y), 'Territoire abandonné')),
    'cv-res': (app, el) => { app.ui.cvRes = el.value; },
    'goto-convoys': (app) => { const t = app.ui.worldSel; app.ui.cv = { ...(app.ui.cv || { res: 'wood', qty: 500, mode: 'secure', guards: 0 }), town: `${t.x},${t.y}` }; app.go('convoys'); },
    caravan: (app) => {
      const res = document.getElementById('cv-res').value;
      const qty = +document.getElementById('cv-qty').value;
      const rep = document.getElementById('cv-repeat').checked;
      app.act(() => sendCaravan(app.state, app.ui.worldSel.x, app.ui.worldSel.y, res, qty, rep), (r) => `🐪 Caravane partie (gain prévu : ${fmt(r.gold)} or)`);
    },
  },
};
