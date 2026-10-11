// Rendu de la carte du monde (canvas) : textures de terrain mises en cache, frontières selon la relation,
// médaillons de lieux, étiquettes sans chevauchement, armées et raids animés. Aucune règle de jeu ici.
import { TERRAINS } from '../data/world.js';
import { STANCES } from '../data/world.js';

const EMOJI_FONT = '"Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif';

// Relation d'une faction avec le joueur → couleur de frontière (ennemi, allié, neutre)
export const RELATION_STYLE = {
  war: { color: '#ff4d4d', label: 'Ennemi (en guerre)', width: 3, dash: [] },
  alliance: { color: '#5cc98a', label: 'Allié', width: 2.5, dash: [] },
  trade: { color: '#7ad0a0', label: 'Pacte commercial', width: 2, dash: [6, 3] },
  tributary: { color: '#e2b84a', label: 'Vous paie tribut', width: 2, dash: [6, 3] },
  truce: { color: '#cfd6e0', label: 'Trêve', width: 2, dash: [3, 4] },
  neutral: { color: null, label: 'Neutre', width: 1.5, dash: [2, 3] },
};
export const relationOf = (f) => RELATION_STYLE[f?.stance] || RELATION_STYLE.neutral;
export const stanceName = (f) => STANCES[f?.stance]?.name || 'Neutre';

// ───────── Textures de terrain (une petite image par terrain et variante, régénérée si la taille change) ─────────
const spriteCache = { size: 0, map: new Map() };
const shade = (hex, k) => {
  const n = parseInt(hex.slice(1), 16);
  const f = (c) => Math.max(0, Math.min(255, Math.round(c * k)));
  return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
};
function drawTerrainSprite(c, ter, v, S) {
  const base = TERRAINS[ter]?.color || '#777';
  c.fillStyle = base; c.fillRect(0, 0, S, S);
  // Léger dégradé : relief, lumière venant du nord-ouest
  const g = c.createLinearGradient(0, 0, S, S);
  g.addColorStop(0, 'rgba(255,255,255,0.07)'); g.addColorStop(1, 'rgba(0,0,0,0.10)');
  c.fillStyle = g; c.fillRect(0, 0, S, S);
  const r = (a) => ((v * 7 + a * 13) % 10) / 10; // variation déterministe
  const tree = (x, y, h, col) => {
    c.fillStyle = 'rgba(0,0,0,0.22)'; c.beginPath(); c.ellipse(x, y + h * 0.5, h * 0.35, h * 0.12, 0, 0, 7); c.fill();
    c.fillStyle = '#4a3020'; c.fillRect(x - h * 0.05, y + h * 0.15, h * 0.1, h * 0.3);
    c.fillStyle = col; c.beginPath(); c.moveTo(x, y - h * 0.55); c.lineTo(x + h * 0.33, y + h * 0.25); c.lineTo(x - h * 0.33, y + h * 0.25); c.closePath(); c.fill();
    c.fillStyle = 'rgba(0,0,0,0.18)'; c.beginPath(); c.moveTo(x, y - h * 0.55); c.lineTo(x + h * 0.33, y + h * 0.25); c.lineTo(x + h * 0.05, y + h * 0.25); c.closePath(); c.fill();
  };
  if (S < 14) return;
  switch (ter) {
    case 'plain':
      c.strokeStyle = shade(base, 0.75); c.lineWidth = Math.max(1, S / 28);
      for (let i = 0; i < 3; i++) { const x = S * (0.15 + 0.3 * i + r(i) * 0.1), y = S * (0.3 + r(i + 3) * 0.5); c.beginPath(); c.moveTo(x, y); c.lineTo(x - S * 0.03, y - S * 0.08); c.moveTo(x, y); c.lineTo(x + S * 0.03, y - S * 0.08); c.stroke(); }
      if (v % 3 === 0) { c.fillStyle = '#f3e07a'; c.beginPath(); c.arc(S * 0.7, S * 0.75, S * 0.035, 0, 7); c.fill(); }
      break;
    case 'forest':
      tree(S * 0.3, S * 0.4, S * 0.5, '#2f5d2a'); tree(S * 0.72, S * 0.32, S * 0.45, '#356a2f'); tree(S * 0.55, S * 0.72, S * 0.5, '#2b5426');
      if (v % 2) tree(S * 0.18, S * 0.8, S * 0.36, '#3a7333');
      break;
    case 'hills':
      for (const [x, y, w] of [[0.32, 0.62, 0.3], [0.7, 0.75, 0.24]]) {
        c.fillStyle = shade(base, 0.85); c.beginPath(); c.ellipse(S * x, S * y, S * w, S * w * 0.6, 0, Math.PI, 0); c.fill();
        c.fillStyle = shade(base, 1.12); c.beginPath(); c.ellipse(S * (x - 0.05), S * (y - 0.03), S * w * 0.55, S * w * 0.3, 0, Math.PI, 0); c.fill();
      }
      break;
    case 'mountain': {
      const peak = (x, h, w) => {
        c.fillStyle = '#6a625b'; c.beginPath(); c.moveTo(S * (x - w), S * 0.92); c.lineTo(S * x, S * (0.92 - h)); c.lineTo(S * (x + w), S * 0.92); c.closePath(); c.fill();
        c.fillStyle = 'rgba(0,0,0,0.2)'; c.beginPath(); c.moveTo(S * x, S * (0.92 - h)); c.lineTo(S * (x + w), S * 0.92); c.lineTo(S * (x + w * 0.2), S * 0.92); c.closePath(); c.fill();
        c.fillStyle = '#eef2f5'; c.beginPath(); c.moveTo(S * x, S * (0.92 - h)); c.lineTo(S * (x + w * 0.32), S * (0.92 - h * 0.66)); c.lineTo(S * (x - w * 0.32), S * (0.92 - h * 0.66)); c.closePath(); c.fill();
      };
      peak(0.38, 0.72, 0.36); peak(0.72, 0.5, 0.26);
      break;
    }
    case 'river':
      c.strokeStyle = 'rgba(220,240,255,0.45)'; c.lineWidth = Math.max(1, S / 24);
      for (const y of [0.3, 0.68]) { c.beginPath(); c.moveTo(S * 0.12, S * y); c.quadraticCurveTo(S * 0.3, S * (y - 0.08), S * 0.48, S * y); c.quadraticCurveTo(S * 0.66, S * (y + 0.08), S * 0.86, S * y); c.stroke(); }
      break;
    case 'swamp':
      c.fillStyle = 'rgba(40,70,60,0.75)'; c.beginPath(); c.ellipse(S * 0.4, S * 0.55, S * 0.24, S * 0.12, 0, 0, 7); c.fill();
      c.strokeStyle = '#a7b46a'; c.lineWidth = Math.max(1, S / 30);
      for (const x of [0.66, 0.74, 0.8]) { c.beginPath(); c.moveTo(S * x, S * 0.8); c.lineTo(S * (x - 0.02), S * 0.5); c.stroke(); }
      break;
    case 'ruins':
      c.fillStyle = '#c9bfcf'; c.fillRect(S * 0.25, S * 0.32, S * 0.12, S * 0.5); c.fillRect(S * 0.58, S * 0.48, S * 0.12, S * 0.34);
      c.fillRect(S * 0.2, S * 0.28, S * 0.22, S * 0.06);
      c.fillStyle = 'rgba(0,0,0,0.25)'; c.fillRect(S * 0.33, S * 0.32, S * 0.04, S * 0.5); c.fillRect(S * 0.66, S * 0.48, S * 0.04, S * 0.34);
      c.fillStyle = '#a99fb0'; c.beginPath(); c.arc(S * 0.48, S * 0.82, S * 0.06, 0, 7); c.fill();
      break;
    case 'snow':
      c.fillStyle = '#ffffff'; for (const [x, y] of [[0.3, 0.4], [0.7, 0.3], [0.55, 0.72]]) { c.beginPath(); c.arc(S * x, S * y, S * 0.035, 0, 7); c.fill(); }
      c.fillStyle = 'rgba(150,175,200,0.5)'; c.beginPath(); c.ellipse(S * 0.4, S * 0.8, S * 0.28, S * 0.08, 0, Math.PI, 0); c.fill();
      break;
    case 'ash':
      c.strokeStyle = '#ff7a3a'; c.globalAlpha = 0.65; c.lineWidth = Math.max(1, S / 26);
      c.beginPath(); c.moveTo(S * 0.15, S * 0.3); c.lineTo(S * 0.4, S * 0.45); c.lineTo(S * 0.35, S * 0.7); c.moveTo(S * 0.4, S * 0.45); c.lineTo(S * 0.75, S * 0.5); c.lineTo(S * 0.85, S * 0.8); c.stroke();
      c.globalAlpha = 1;
      break;
    default: break;
  }
}
export function terrainSprite(ter, v, T, dpr) {
  const S = Math.max(4, Math.round(T * dpr / 2) * 2); // quantifiée : pas de régénération à chaque cran de zoom
  if (spriteCache.size !== S) { spriteCache.size = S; spriteCache.map.clear(); }
  const k = ter + ':' + v;
  let cv = spriteCache.map.get(k);
  if (!cv) {
    cv = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(S, S) : Object.assign(document.createElement('canvas'), { width: S, height: S });
    drawTerrainSprite(cv.getContext('2d'), ter, v, S);
    spriteCache.map.set(k, cv);
  }
  return cv;
}
export const tileVariant = (x, y) => ((x * 73856093) ^ (y * 19349663)) >>> 0 & 3;

// ───────── Médaillons de lieux ─────────
export function drawMedallion(ctx, px, py, r, ring, icon, opts = {}) {
  ctx.save();
  if (opts.alpha !== undefined) ctx.globalAlpha = opts.alpha;
  if (opts.glow) { ctx.shadowColor = opts.glow; ctx.shadowBlur = r * 0.9; }
  ctx.fillStyle = opts.fill || 'rgba(22,18,12,0.86)';
  ctx.beginPath(); ctx.arc(px, py, r, 0, Math.PI * 2); ctx.fill();
  ctx.shadowBlur = 0;
  ctx.lineWidth = Math.max(1.5, r * 0.16); ctx.strokeStyle = ring;
  ctx.beginPath(); ctx.arc(px, py, r - ctx.lineWidth / 2, 0, Math.PI * 2); ctx.stroke();
  ctx.font = `${Math.round(r * 1.18)}px ${EMOJI_FONT}`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(icon, px, py + r * 0.06);
  ctx.restore();
}

// Petit étendard (avant-poste du joueur)
export function drawBanner(ctx, px, py, s, color) {
  ctx.save();
  ctx.strokeStyle = '#1d1812'; ctx.lineWidth = Math.max(1, s * 0.08);
  ctx.beginPath(); ctx.moveTo(px - s * 0.3, py + s * 0.55); ctx.lineTo(px - s * 0.3, py - s * 0.55); ctx.stroke();
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.moveTo(px - s * 0.3, py - s * 0.55); ctx.lineTo(px + s * 0.45, py - s * 0.55); ctx.lineTo(px + s * 0.3, py - s * 0.3); ctx.lineTo(px + s * 0.45, py - s * 0.05); ctx.lineTo(px - s * 0.3, py - s * 0.05); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.restore();
}

// ───────── Étiquettes sans chevauchement ─────────
// labels : [{ x, y, text, prio, size, color, bg, border, offset }] ; les plus prioritaires sont placées d'abord,
// une étiquette qui chevaucherait une autre essaie au-dessus puis à droite, sinon elle est masquée.
export function placeLabels(ctx, labels, W, H, blocked = []) {
  const placed = [...blocked];
  const out = [];
  const hit = (a) => placed.some((b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y);
  for (const l of [...labels].sort((a, b) => b.prio - a.prio)) {
    ctx.font = `600 ${l.size}px Inter, system-ui, sans-serif`;
    const w = ctx.measureText(l.text).width + 10, h = l.size + 6, off = l.offset || 0;
    const cands = [
      { x: l.x - w / 2, y: l.y + off },
      { x: l.x - w / 2, y: l.y - off - h },
      { x: l.x + off, y: l.y - h / 2 },
      { x: l.x - off - w, y: l.y - h / 2 },
    ];
    const c = cands.find((r) => r.x >= 0 && r.y >= 0 && r.x + w <= W && r.y + h <= H && !hit({ ...r, w, h }));
    if (!c) continue;
    const rect = { ...c, w, h };
    placed.push(rect);
    out.push({ ...l, rect });
  }
  for (const l of out) {
    const { x, y, w, h } = l.rect;
    ctx.fillStyle = l.bg || 'rgba(16,13,9,0.8)';
    ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x, y, w, h, 5) : ctx.rect(x, y, w, h); ctx.fill();
    if (l.border) { ctx.strokeStyle = l.border; ctx.lineWidth = 1; ctx.stroke(); }
    ctx.font = `600 ${l.size}px Inter, system-ui, sans-serif`;
    ctx.fillStyle = l.color || '#f3e6c4'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(l.text, x + w / 2, y + h / 2 + 0.5);
  }
  return out;
}

// Pion d'armée en mouvement, orienté vers sa destination
export function drawToken(ctx, x, y, r, color, icon, angle) {
  ctx.save();
  ctx.translate(x, y);
  if (angle !== null && angle !== undefined) {
    ctx.save(); ctx.rotate(angle);
    ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(r * 1.65, 0); ctx.lineTo(r * 0.7, -r * 0.6); ctx.lineTo(r * 0.7, r * 0.6); ctx.closePath(); ctx.fill();
    ctx.restore();
  }
  ctx.fillStyle = color; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.font = `${Math.round(r * 1.15)}px ${EMOJI_FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(icon, 0, r * 0.06);
  ctx.restore();
}

