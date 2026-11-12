// v21 « Couleurs du Royaume » — Lieux peints de la carte du monde : la capitale grandit avec l'hôtel de ville, les
// royaumes rivaux portent leur bannière, les cités gagnent des maisons avec leur rang, les camps de brigands s'étendent
// avec leur niveau. Même peinture cuite que la ville (contour, lumière), dessinée en petit au-dessus du terrain.
// Les colonnes en marche (soldats, bannière) remplacent les pions ronds ; le trajet pointillé et le compte à rebours
// restent dessinés par views/world.js.
import { sprite } from './scene.js';
import { PAINT, hamletRuin, scenery, TARGETS, FORT_STYLES, EVENT_TARGETS } from './art.js';
import { banner } from './paint.js';
import { RIVALS } from '../../data/world.js';

// Peintre d'un lieu (null : le médaillon reste)
export function poiPainter(state, p, def, { th = 1, rivalColor = null } = {}) {
  const kind = def.kind;
  if (kind === 'capital') { const tier = th >= 20 ? 5 : th >= 10 ? 3 : 1; return { key: `cap${tier}`, w: 1.9, draw: (pp) => PAINT.townhall(pp, tier, 0, { active: true }) }; }
  // v24 : chaque royaume rival a son architecture (FORT_STYLES) ; sa forteresse grandit avec sa puissance
  if (kind === 'kingdom') {
    // v26 : architecture et couleurs tirées de l'identité de la maison (data/world.js), plus du numéro de rival
    const id = RIVALS[p.rival]?.identity;
    const found = id ? FORT_STYLES.findIndex((f) => f.key === id.arch) : -1;
    const st = found >= 0 ? found : (p.rival ?? 0) % FORT_STYLES.length, t = Math.min(4, 2 + Math.floor((p.power || 1) / 1.2));
    const col = id?.colors?.[0] || rivalColor;
    return { key: `kg${st}|${t}|${col}`, w: 1.8, draw: (pp) => TARGETS.kingdom(pp, t, st, { style: st, color: col }) };
  }
  // v26 : Île de Cendre et métropole (cité fortifiée : murailles de son protecteur ou de son nouveau maître)
  if (p.type === 'ashIsle') return { key: `isle|${p.owner === 'me' ? 'me' : 'x'}`, w: 1.4, draw: (pp) => EVENT_TARGETS.isle(pp, 3, 0, { owner: p.owner }) };
  if (kind === 'town' && p.metro) { const id = p.metro.status === 'vassal' ? null : RIVALS[p.metro.protector]?.identity; const st = Math.max(0, FORT_STYLES.findIndex((f) => f.key === (id?.arch || 'ardoise'))); const col = p.metro.status === 'vassal' ? '#2f5fb0' : id?.colors?.[0] || '#e2b84a'; return { key: `metro${st}|${col}`, w: 2, draw: (pp) => EVENT_TARGETS.metro(pp, 4, 0, { style: st, color: col }) }; }
  if (kind === 'town') { const r = Math.min(3, p.rank || 0); return { key: `town${r}`, w: 1.5 + r * 0.1, draw: (pp) => PAINT.market(pp, 1 + r, 2, { active: true }) }; }
  if (kind === 'village') return { key: 'vil', w: 1.2, draw: (pp) => hamletRuin(pp) };
  // v25 : cible d'événement : dessin propre à l'événement et à sa phase (vaincue, levée → campement brûlé)
  if (p.type === 'evt') {
    const ruins = p.phase === 'cleared' || p.phase === 'ended';
    const k = ruins ? 'ruins' : EVENT_TARGETS[p.kind] ? p.kind : 'camp';
    const t = Math.min(4, Math.max(1, Math.ceil((p.tier || 1) / 2))), v = variantAt(p);
    const big = { boss: 1.7, lair: 1.6, fortress: 1.7, bastion: 1.7, herald: 1.5, horde: 1.4, ship: 1.2, caravan: 1.2, treasure: 1, trace: 1.1 }[k] || 1.35;
    return { key: `ev${k}|${t}|${v}|${p.eventKey}|${p.color || ''}`, w: big, draw: (pp) => EVENT_TARGETS[k](pp, t, v, { season: 'summer', active: true, style: p.eventKey, color: p.color }) };
  }
  // v24 : camps de brigands par palier (désordonnés, palissadés, tours de guet, double tour) et disposition variée
  if (p.type === 'banditCamp') { const t = Math.min(4, Math.max(1, Math.ceil((p.lvl || p.danger || 1) / 1.5))), v = variantAt(p); return { key: `camp${t}|${v}`, w: 1.4, draw: (pp) => TARGETS.banditCamp(pp, t, v, { season: 'summer' }) }; }
  if (p.type === 'ruinSite' || p.type === 'lostCity') return { key: `ruin${p.type}`, w: p.type === 'lostCity' ? 1.6 : 1.2, draw: (pp) => scenery(pp, 'rubble', p.type === 'lostCity' ? 3 : 1, 'summer') };
  if (p.type === 'abandonedMine') return { key: 'mine', w: 1.25, draw: (pp) => { PAINT.mine(pp, 1, 0, { active: false }); } };
  // v24 : toutes les autres catégories ont leur dessin (sites de ressources, cryptes, repaires, donjons, boss,
  // marchands, lieux d'événement) ; palier d'après le danger, disposition d'après la position
  const tk = def.npc ? 'npc' : p.type;
  if (TARGETS[tk]) {
    const t = Math.min(4, Math.max(1, Math.round(p.danger || (def.danger ? def.danger[0] : 1)) || 1)), v = variantAt(p);
    const big = { boss: 1.7, dungeon: 1.45, ancientGrove: 1.4, crypt: 1.3 }[tk] || 1.25;
    return { key: `tg${tk}|${t}|${v}`, w: big, draw: (pp) => TARGETS[tk](pp, t, v, { season: 'summer', active: true }) };
  }
  return null;
}
// Disposition d'un lieu (0 à 3), stable : d'après sa position sur la carte
const variantAt = (p) => (((p.x * 7 + p.y * 13) % 4) + 4) % 4;
// Résolution de cuisson selon la taille réelle du dessin à l'écran (densité de l'écran comprise), par paliers de 0,25 :
// net en gros plan (v24), léger en vue d'ensemble ; plafonnée pour la mémoire du cache
const bakeScale = (T, w = 1.25) => {
  const dpr = Math.min(2, (typeof window !== 'undefined' && window.devicePixelRatio) || 1);
  return Math.max(0.35, Math.min(1.5, Math.ceil(((T * w) / 128) * dpr * 4) / 4));
};
// Dessine un lieu peint centré sur (px, py) ; renvoie la demi-largeur occupée (pour les étiquettes)
export function drawPoiPainted(ctx, painter, px, py, T, alpha = 1) {
  const s = bakeScale(T, painter.w);
  const sp = sprite('w|' + painter.key, s, painter.draw);
  if (!sp.art) return 0;
  const k = (T * painter.w) / (128 * s);
  const topY = py - 32 * s * k; // sommet haut du losange de la case
  ctx.save(); ctx.globalAlpha = alpha;
  if (sp.shadow) ctx.drawImage(sp.shadow, px - sp.sx * k, topY - sp.sy * k, sp.shadow.width * k, sp.shadow.height * k);
  ctx.drawImage(sp.art, px - sp.ax * k, topY - sp.ay * k, sp.art.width * k, sp.art.height * k);
  // v26 : fumées des cheminées, feux de camp et forges (enregistrées à la cuisson, jamais dessinées sur le monde
  // jusqu'ici) : volutes qui montent ; fixes si les animations sont réduites, absentes en vue d'ensemble
  if (sp.fx?.length && T >= 18) worldSmoke(ctx, sp.fx, px, topY, k, s, alpha);
  ctx.restore();
  return (T * painter.w) / 2;
}
function worldSmoke(ctx, list, px, topY, k, s, alpha) {
  const reduce = typeof document !== 'undefined' && document.documentElement.classList.contains('reduce-motion');
  const now = typeof performance !== 'undefined' ? performance.now() : 0;
  for (const e of list) {
    const x0 = px + e.x * k, y0 = topY + e.y * k, sc = s * k;
    for (let i = 0; i < Math.min(5, e.n + 1); i++) {
      const ph = reduce ? i / 5 : ((now / 2600 + i / 5 + (e.x % 7) / 7) % 1);
      const x = x0 + (ph * 14 + Math.sin(ph * 6 + i) * 2) * sc, y = y0 - ph * 34 * sc, rr = (3 + ph * 9) * sc;
      const gr = ctx.createRadialGradient(x, y, 0, x, y, rr);
      gr.addColorStop(0, `rgba(238,232,222,${(0.55 * (1 - ph)) * alpha})`); gr.addColorStop(1, 'rgba(238,232,222,0)');
      ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(x, y, rr, 0, 7); ctx.fill();
    }
  }
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
