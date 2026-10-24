// v21 « Couleurs du Royaume » — Lieux peints de la carte du monde : la capitale grandit avec l'hôtel de ville, les
// royaumes rivaux portent leur bannière, les cités gagnent des maisons avec leur rang, les camps de brigands s'étendent
// avec leur niveau. Même peinture cuite que la ville (contour, lumière), dessinée en petit au-dessus du terrain.
// Les colonnes en marche (soldats, bannière) remplacent les pions ronds ; le trajet pointillé et le compte à rebours
// restent dessinés par views/world.js.
import { sprite } from './scene.js';
import { PAINT, camp, hamletRuin, scenery } from './art.js';
import { banner } from './paint.js';

// Peintre d'un lieu (null : le médaillon reste)
export function poiPainter(state, p, def, { th = 1, rivalColor = null } = {}) {
  const kind = def.kind;
  if (kind === 'capital') { const tier = th >= 20 ? 5 : th >= 10 ? 3 : 1; return { key: `cap${tier}`, w: 1.9, draw: (pp) => PAINT.townhall(pp, tier, 0, { active: true }) }; }
  if (kind === 'kingdom') return { key: `kg${rivalColor}`, w: 1.7, draw: (pp) => { PAINT.castle(pp, 4, 1, { active: true }); banner(pp, 0.5, 0.5, 120, [rivalColor || '#7a2a20', '#f1d36a'], 30); } };
  if (kind === 'town') { const r = Math.min(3, p.rank || 0); return { key: `town${r}`, w: 1.5 + r * 0.1, draw: (pp) => PAINT.market(pp, 1 + r, 2, { active: true }) }; }
  if (kind === 'village') return { key: 'vil', w: 1.2, draw: (pp) => hamletRuin(pp) };
  if (p.type === 'banditCamp') { const lv = Math.max(1, p.level || p.danger || 1); return { key: `camp${Math.min(5, lv)}`, w: 1.35, draw: (pp) => camp(pp, lv) }; }
  if (p.type === 'ruinSite' || p.type === 'lostCity') return { key: `ruin${p.type}`, w: p.type === 'lostCity' ? 1.6 : 1.2, draw: (pp) => scenery(pp, 'rubble', p.type === 'lostCity' ? 3 : 1, 'summer') };
  if (p.type === 'abandonedMine') return { key: 'mine', w: 1.25, draw: (pp) => PAINT.mine(pp, 1, 0, { active: false }) };
  return null;
}
// Résolution de cuisson selon la taille d'une case à l'écran
const bakeScale = (T) => (T >= 44 ? 0.75 : T >= 22 ? 0.5 : 0.35);
// Dessine un lieu peint centré sur (px, py) ; renvoie la demi-largeur occupée (pour les étiquettes)
export function drawPoiPainted(ctx, painter, px, py, T, alpha = 1) {
  const s = bakeScale(T);
  const sp = sprite('w|' + painter.key, s, painter.draw);
  if (!sp.art) return 0;
  const k = (T * painter.w) / (128 * s);
  const topY = py - 32 * s * k; // sommet haut du losange de la case
  ctx.save(); ctx.globalAlpha = alpha;
  if (sp.shadow) ctx.drawImage(sp.shadow, px - sp.sx * k, topY - sp.sy * k, sp.shadow.width * k, sp.shadow.height * k);
  ctx.drawImage(sp.art, px - sp.ax * k, topY - sp.ay * k, sp.art.width * k, sp.art.height * k);
  ctx.restore();
  return (T * painter.w) / 2;
}
// Avant-poste du joueur : tour de guet à sa bannière
export const outpostPainter = (color) => ({ key: `op${color}`, w: 1.15, draw: (pp) => { PAINT.watchtower(pp, 1, 0, { active: true }); banner(pp, 0.5, 0.5, 96, [color, '#f1d36a'], 24); } });

// ───────── Colonnes en marche ─────────
const COL = new Map();
function soldier(g, x, y, tunic, step) {
  g.save(); g.translate(x, y);
  g.fillStyle = 'rgba(20,28,10,0.3)'; g.beginPath(); g.ellipse(0.8, 0, 4, 1.4, 0, 0, 7); g.fill();
  g.fillStyle = '#2a1a10'; g.fillRect(-1.8 + step, -4, 1.4, 4); g.fillRect(0.5 - step, -4, 1.4, 4);
  g.strokeStyle = '#2a1a10'; g.lineWidth = 0.7;
  g.fillStyle = tunic; g.beginPath(); g.moveTo(-3, -3.6); g.lineTo(3, -3.6); g.lineTo(2.2, -9.6); g.lineTo(-2.2, -9.6); g.closePath(); g.fill(); g.stroke();
  g.fillStyle = '#f1c79a'; g.beginPath(); g.arc(0, -11.4, 2.2, 0, 7); g.fill(); g.stroke();
  g.fillStyle = '#9aa3ad'; g.beginPath(); g.arc(0, -12, 2.4, Math.PI, 0); g.fill(); g.stroke();
  g.strokeStyle = '#6b4a2a'; g.lineWidth = 0.8; g.beginPath(); g.moveTo(3.4, -2); g.lineTo(3.4, -18); g.stroke();
  g.fillStyle = '#d8dee6'; g.beginPath(); g.moveTo(3.4, -20.5); g.lineTo(2.4, -17.6); g.lineTo(4.4, -17.6); g.closePath(); g.fill();
  g.restore();
}
// Colonne : 3 à 5 soldats et un porte-étendard, tournée vers la destination ; frame alterne le pas
function columnCanvas(color, tunic, n, frame) {
  const k = `${color}|${tunic}|${n}|${frame}`;
  if (COL.has(k)) return COL.get(k);
  const S = 3, c = document.createElement('canvas'); c.width = 64 * S; c.height = 44 * S;
  const g = c.getContext('2d'); g.scale(S, S); g.translate(32, 36);
  const spots = [[-10, -2], [-2, 2], [6, -3], [-14, 5], [12, 4]].slice(0, n);
  for (const [x, y] of spots.sort((a, b) => a[1] - b[1])) soldier(g, x, y, tunic, frame ? 0.8 : -0.8);
  // étendard
  g.strokeStyle = '#2a1a10'; g.lineWidth = 1.6; g.beginPath(); g.moveTo(16, 2); g.lineTo(16, -30); g.stroke();
  g.strokeStyle = '#8a5a30'; g.lineWidth = 0.9; g.stroke();
  const wave = frame ? 1.5 : -1.5;
  g.fillStyle = color; g.beginPath(); g.moveTo(16, -30); g.quadraticCurveTo(22, -30 + wave, 28, -28); g.lineTo(26, -23); g.lineTo(28, -18); g.quadraticCurveTo(22, -20 - wave, 16, -20); g.closePath(); g.fill();
  g.strokeStyle = '#2a1a10'; g.lineWidth = 0.8; g.stroke();
  g.fillStyle = 'rgba(255,240,190,.75)'; g.beginPath(); g.arc(21, -25, 1.8, 0, 7); g.fill();
  COL.set(k, c);
  return c;
}
// size : hauteur souhaitée à l'écran ; angle : direction (rad) ; frame : 0/1
export function drawColumn(ctx, x, y, size, { color = '#2f5fb0', tunic = '#2f5fb0', n = 4, angle = 0, frame = 0 } = {}) {
  const c = columnCanvas(color, tunic, n, frame), k = size / 44;
  ctx.save(); ctx.translate(x, y);
  if (Math.cos(angle) < 0) ctx.scale(-1, 1);
  ctx.drawImage(c, -32 * k, -36 * k, 64 * k, 44 * k);
  ctx.restore();
}
