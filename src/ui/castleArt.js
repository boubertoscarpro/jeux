// v16 — Le château dessiné sur la carte du royaume (SVG procédural, aucune image externe). Deux couches d'un seul SVG
// chacune, sans élément par case :
//  - sous la grille : douves (largeur selon leur niveau), limite des faubourgs, noms des zones ;
//  - sur la grille (sans capter les clics) : muraille selon son niveau (piquets, palissade, pierre, remparts à tours,
//    forteresse), tours, porte et pont-levis, bannières aux armoiries, gardes selon la garnison, torches la nuit,
//    brèches et échafaudages selon les dégâts, charrettes selon les convois, colonne ennemie d'un raid.
// Tout est lu dans l'état (systems/castle.js) : rien n'est modifié ici.
import { festiveDress } from '../systems/festive.js';
import { rectOf, wallStyle, castleStage, flankShare } from '../systems/castle.js';
import { FAUBOURG_DEPTH, FLANKS } from '../data/castle.js';
import { DEFENSE_ENGINES, ATTACK_ENGINES } from '../data/siege.js';
import { heraldryOf, colorOf } from '../systems/heraldry.js';
import { esc } from './components.js';

const T = 64; // taille d'une case (CITY_TILE)
const K = '#1d1812';
const WALL = {
  stakes: { th: 3, fill: 'none', stroke: '#c9a36a' },
  palisade: { th: 10, fill: '#8a5a33', stroke: '#4a2f17' },
  stone: { th: 12, fill: '#9a958c', stroke: '#3b3630' },
  towers: { th: 14, fill: '#8d877d', stroke: '#2f2a25' },
  fortress: { th: 18, fill: '#7a7268', stroke: '#26211c' },
};
const moatWidth = (lvl) => 6 + 2 * lvl;

// Géométrie partagée par les deux couches
export function castleGeom(state) {
  const r = rectOf(state);
  const X0 = r.x0 * T, Y0 = r.y0 * T, X1 = (r.x1 + 1) * T, Y1 = (r.y1 + 1) * T;
  const wl = state.city.fort.wall || 0, ml = state.city.fort.moat || 0;
  const style = wallStyle(wl);
  const w = WALL[style.key];
  const gateX = (Math.floor((r.x0 + r.x1) / 2) + 0.5) * T;
  return { r, X0, Y0, X1, Y1, wl, ml, style, w, gateX, mw: ml > 0 ? moatWidth(ml) : 0 };
}

const rectPath = (x0, y0, x1, y1) => `M${x0} ${y0}H${x1}V${y1}H${x0}Z`;

// ───────── Couche sous la grille ─────────
export function castleUnderSvg(state, { W, H }) {
  const g = castleGeom(state);
  const parts = [];
  // Limite des faubourgs (pointillé discret) et noms des zones : l'information ne passe pas que par la couleur
  const fd = FAUBOURG_DEPTH * T;
  const fx0 = Math.max(0, g.X0 - fd), fy0 = Math.max(0, g.Y0 - fd), fx1 = Math.min(W, g.X1 + fd), fy1 = Math.min(H, g.Y1 + fd);
  // v17 : les zones se reconnaissent à leur sol (pavés dans la cour, terre battue dans les faubourgs ; la campagne garde
  // ses prés et ses champs) ; leur nom n'apparaît qu'en vue d'ensemble
  parts.push(`<defs><pattern id="v17-pave" width="32" height="24" patternUnits="userSpaceOnUse"><rect width="32" height="24" fill="#a8977a"/><path d="M0 .5H32M0 12.5H32M8 0V12M24 0V12M0 12V24M16 12V24" stroke="#6f6250" stroke-width="1.2"/></pattern>`
    + `<pattern id="v17-terre" width="28" height="28" patternUnits="userSpaceOnUse"><rect width="28" height="28" fill="#9c8360"/><circle cx="6" cy="7" r="1.3" fill="#7b6446"/><circle cx="19" cy="17" r="1.1" fill="#7b6446"/><circle cx="23" cy="5" r="0.9" fill="#b49a72"/><path d="M2 22q6-3 11 0" stroke="#866d4c" fill="none" stroke-width="1"/></pattern></defs>`);
  parts.push(`<path class="zone-ground faubourg" d="${rectPath(fx0, fy0, fx1, fy1)} ${rectPath(g.X0, g.Y0, g.X1, g.Y1)}" fill="url(#v17-terre)" fill-rule="evenodd" opacity="0.42"/>`);
  parts.push(`<path class="zone-ground keep" d="${rectPath(g.X0, g.Y0, g.X1, g.Y1)}" fill="url(#v17-pave)" opacity="0.62"/>`);
  // Douves : alimentées par la rivière, plus larges à chaque niveau
  if (g.mw) {
    const o = g.w.th / 2 + 3 + g.mw / 2;
    const flood = (state.castle?.moatFlood || 0) > Date.now();
    parts.push(`<path class="moat ${flood ? 'moat-flood' : ''}" d="${rectPath(g.X0 - o, g.Y0 - o, g.X1 + o, g.Y1 + o)}" fill="none" stroke="${flood ? '#6aa0c8' : '#3f78a6'}" stroke-width="${g.mw + (flood ? 8 : 0)}" stroke-linejoin="round"/>`);
    parts.push(`<path d="${rectPath(g.X0 - o, g.Y0 - o, g.X1 + o, g.Y1 + o)}" fill="none" stroke="rgba(200,230,255,0.45)" stroke-width="1.5" stroke-dasharray="14 10"/>`);
  }
  const lab = (x, y, text) => `<text x="${x}" y="${y}" class="zone-label">${esc(text)}</text>`;
  parts.push(lab(g.X0 + g.w.th + 14, g.Y0 + g.w.th + 26, 'Cour du donjon'));
  if (fy0 < g.Y0 - 20) parts.push(lab(fx0 + 8, fy0 + 18, 'Faubourgs'));
  if (fx0 > 40) parts.push(lab(8, 18, 'Campagne'));
  return `<svg class="castle-under" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" aria-hidden="true">${parts.join('')}</svg>`;
}

// Petite bannière aux couleurs du joueur (hampe + étoffe deux émaux)
function flag(x, y, c1, c2, s = 1) {
  return `<g transform="translate(${x} ${y}) scale(${s})"><path d="M0 0V-26" stroke="${K}" stroke-width="2"/><path d="M0 -26H16L12 -20L16 -14H0Z" fill="${c1}" stroke="${K}" stroke-width="1.2"/><path d="M0 -20H13" stroke="${c2}" stroke-width="2.4"/></g>`;
}
function tower(x, y, g, roof, round = false) {
  const s = g.w.th * 1.25;
  if (g.style.key === 'palisade') return `<rect x="${x - 9}" y="${y - 9}" width="18" height="18" fill="#7a4e2c" stroke="${K}" stroke-width="2"/><path d="M${x - 12} ${y - 9}L${x} ${y - 22}L${x + 12} ${y - 9}Z" fill="#5e3a1f" stroke="${K}" stroke-width="1.5"/>`;
  const body = round ? `<circle cx="${x}" cy="${y}" r="${s}" fill="${g.w.fill}" stroke="${K}" stroke-width="2.4"/>` : `<rect x="${x - s}" y="${y - s}" width="${s * 2}" height="${s * 2}" fill="${g.w.fill}" stroke="${K}" stroke-width="2.4"/>`;
  const top = roof ? `<path d="M${x - s * 1.05} ${y - s * 0.4}L${x} ${y - s * 2.1}L${x + s * 1.05} ${y - s * 0.4}Z" fill="${roof}" stroke="${K}" stroke-width="2"/>` : `<path d="M${x - s} ${y - s}h${s * 0.5}v-5h${s * 0.5}v5h${s * 0.5}v-5h${s * 0.5}v5" fill="none" stroke="${K}" stroke-width="2"/>`;
  return body + top;
}

// ───────── Couche sur la grille ─────────
// opts : { night, raid (raid en approche ou null), garrison (soldats au château), carts (convois actifs), now }
export function castleOverSvg(state, { W, H, night = false, raid = null, garrison = 0, carts = 0, now = Date.now() }) {
  const g = castleGeom(state);
  const parts = [];
  const h = heraldryOf(state);
  const c1 = colorOf(state, h.t1), c2 = colorOf(state, h.t2);
  const wall = rectPath(g.X0, g.Y0, g.X1, g.Y1);
  const gw = T * 0.9; // largeur de la porte
  if (g.style.key === 'stakes') {
    // Enceinte projetée : piquets, porte marquée
    // v17 : tracé fantôme sur le sol, une seule plaque (au-dessus de la cour, loin des plaques « à bâtir » de la porte)
    parts.push(`<path d="${wall}" fill="none" stroke="rgba(240,224,180,0.75)" stroke-width="6" stroke-dasharray="2 12" stroke-linecap="round"/>`);
    const cx = (g.X0 + g.X1) / 2;
    parts.push(`<g class="castle-plate"><title>Enceinte projetée : bâtissez la muraille (onglet Militaire du panneau Construire)</title><rect x="${cx - 70}" y="${g.Y0 - 26}" width="140" height="20" rx="5" fill="rgba(36,28,20,0.9)" stroke="#c9a36a"/><text x="${cx}" y="${g.Y0 - 12}" class="wall-label" text-anchor="middle">Enceinte projetée</text></g>`);
  } else {
    // Ombre, corps, chemin de ronde (créneaux), porte
    parts.push(`<path d="${wall}" fill="none" stroke="rgba(0,0,0,0.35)" stroke-width="${g.w.th + 6}" transform="translate(3 4)"/>`);
    parts.push(`<path d="${wall}" fill="none" stroke="${g.w.stroke}" stroke-width="${g.w.th + 3}" stroke-linejoin="miter"/>`);
    parts.push(`<path d="${wall}" fill="none" stroke="${g.w.fill}" stroke-width="${g.w.th}" stroke-linejoin="miter"/>`);
    if (g.style.key === 'palisade') parts.push(`<path d="${wall}" fill="none" stroke="#5e3a1f" stroke-width="${g.w.th}" stroke-dasharray="2 5"/>`);
    else parts.push(`<path d="${rectPath(g.X0 - g.w.th / 2, g.Y0 - g.w.th / 2, g.X1 + g.w.th / 2, g.Y1 + g.w.th / 2)}" fill="none" stroke="${g.w.stroke}" stroke-width="4" stroke-dasharray="6 6"/>`);
    // Dégâts : brèches (encre) puis échafaudages de réparation
    const dmg = state.castle?.wallDmg || 0;
    if (dmg > 0) {
      const n = Math.ceil(dmg * 6);
      const L = 2 * (g.X1 - g.X0) + 2 * (g.Y1 - g.Y0);
      for (let i = 0; i < n; i++) {
        let d = ((i * 0.37 + 0.11) % 1) * L, x, y;
        const wd = g.X1 - g.X0, hd = g.Y1 - g.Y0;
        if (d < wd) { x = g.X0 + d; y = g.Y0; } else if ((d -= wd) < hd) { x = g.X1; y = g.Y0 + d; } else if ((d -= hd) < wd) { x = g.X1 - d; y = g.Y1; } else { d -= wd; x = g.X0; y = g.Y1 - d; }
        parts.push(`<path d="M${x - 7} ${y - 6}l5 4l-3 4l6 5" fill="none" stroke="${K}" stroke-width="3" stroke-linecap="round"/><path d="M${x + 8} ${y - 10}v20M${x + 14} ${y - 10}v20M${x + 6} ${y - 4}h10M${x + 6} ${y + 4}h10" stroke="#c9a36a" stroke-width="1.6"/>`);
      }
    }
    // Tours : coins, puis tous les 4 segments (remparts et forteresse) ; toits aux couleurs du blason
    const roof = ['towers', 'fortress'].includes(g.style.key) ? c1 : null;
    const round = g.style.key === 'fortress';
    const pts = [[g.X0, g.Y0], [g.X1, g.Y0], [g.X0, g.Y1], [g.X1, g.Y1]];
    if (['towers', 'fortress'].includes(g.style.key)) {
      for (let x = g.X0 + 4 * T; x < g.X1 - T; x += 4 * T) pts.push([x, g.Y0], [x, g.Y1]);
      for (let y = g.Y0 + 4 * T; y < g.Y1 - T; y += 4 * T) pts.push([g.X0, y], [g.X1, y]);
    }
    for (const [x, y] of pts) if (Math.abs(x - g.gateX) > gw) parts.push(tower(x, y, g, roof, round));
    // Bannières aux armoiries (mur de pierre et au-delà)
    if (g.wl >= 5) for (const [x, y] of pts.slice(0, g.style.key === 'fortress' ? pts.length : 4)) if (Math.abs(x - g.gateX) > gw) parts.push(flag(x, y - g.w.th * 1.6, c1, c2, g.style.key === 'fortress' ? 1.1 : 0.9));
    // Porte (côté sud, au milieu) et pont-levis au-dessus des douves
    const gh = g.w.th * 2.4;
    parts.push(`<rect x="${g.gateX - gw / 2}" y="${g.Y1 - gh / 2}" width="${gw}" height="${gh}" fill="${g.w.fill}" stroke="${K}" stroke-width="2.4"/>`);
    parts.push(`<path d="M${g.gateX - gw * 0.2} ${g.Y1 + gh / 2}V${g.Y1 - gh * 0.1}A${gw * 0.2} ${gw * 0.2} 0 0 1 ${g.gateX + gw * 0.2} ${g.Y1 - gh * 0.1}V${g.Y1 + gh / 2}Z" fill="${raid ? '#4a2f17' : '#2b1d12'}" stroke="${K}" stroke-width="1.5"/>`);
    if (raid) parts.push(`<path d="M${g.gateX - gw * 0.2} ${g.Y1}h${gw * 0.4}M${g.gateX - gw * 0.2} ${g.Y1 + gh * 0.25}h${gw * 0.4}M${g.gateX - gw * 0.1} ${g.Y1 - gh * 0.1}v${gh * 0.6}M${g.gateX + gw * 0.1} ${g.Y1 - gh * 0.1}v${gh * 0.6}" stroke="${K}" stroke-width="1.8"/>`);
    if (g.wl >= 10) parts.push(tower(g.gateX - gw / 2, g.Y1, g, roof, round) + tower(g.gateX + gw / 2, g.Y1, g, roof, round) + flag(g.gateX, g.Y1 - gh, c1, c2, 1.2));
    if (g.mw) {
      const o0 = g.Y1 + g.w.th / 2 + 2, o1 = o0 + g.mw + 4;
      if (raid) parts.push(`<path d="M${g.gateX - gw * 0.3} ${o0}h${gw * 0.6}" stroke="#6b4423" stroke-width="5"/><path d="M${g.gateX - gw * 0.3} ${o0}L${g.gateX - gw * 0.3} ${g.Y1 + g.w.th}M${g.gateX + gw * 0.3} ${o0}L${g.gateX + gw * 0.3} ${g.Y1 + g.w.th}" stroke="${K}" stroke-width="1.5"/><text x="${g.gateX + gw * 0.45}" y="${o1 + 12}" class="wall-label">Pont-levis levé</text>`);
      else parts.push(`<rect x="${g.gateX - gw * 0.3}" y="${o0}" width="${gw * 0.6}" height="${o1 - o0}" fill="#8a5a33" stroke="${K}" stroke-width="1.5"/><path d="M${g.gateX - gw * 0.3} ${(o0 + o1) / 2}h${gw * 0.6}" stroke="#5e3a1f" stroke-width="1" stroke-dasharray="3 3"/>`);
    }
    // Gardes sur le chemin de ronde : selon la garnison ; tous aux créneaux quand un raid approche
    const nG = Math.min(14, raid ? Math.max(8, Math.ceil(garrison / 30)) : Math.ceil(garrison / 40));
    const L = 2 * (g.X1 - g.X0) + 2 * (g.Y1 - g.Y0);
    for (let i = 0; i < nG; i++) {
      let d = ((i + 0.5) / nG) * L, x, y;
      const wd = g.X1 - g.X0, hd = g.Y1 - g.Y0;
      if (d < wd) { x = g.X0 + d; y = g.Y0; } else if ((d -= wd) < hd) { x = g.X1; y = g.Y0 + d; } else if ((d -= hd) < wd) { x = g.X1 - d; y = g.Y1; } else { d -= wd; x = g.X0; y = g.Y1 - d; }
      parts.push(`<g class="guard" style="--gd:${(i % 5) * 0.4}s"><circle cx="${x}" cy="${y - 6}" r="3.2" fill="#e8c9a0" stroke="${K}" stroke-width="1"/><path d="M${x - 3} ${y - 3}h6v7h-6Z" fill="${c1}" stroke="${K}" stroke-width="1"/><path d="M${x + 4} ${y - 12}v14" stroke="${K}" stroke-width="1.2"/></g>`);
    }
    // Torches la nuit (tours et porte)
    if (night) for (const [x, y] of [...pts.slice(0, 4), [g.gateX - gw / 2, g.Y1], [g.gateX + gw / 2, g.Y1]]) parts.push(`<g class="torch"><circle cx="${x}" cy="${y - g.w.th}" r="11" fill="rgba(255,170,60,0.28)"/><circle cx="${x}" cy="${y - g.w.th}" r="3.4" fill="#ffcf6a"/></g>`);
  }
  // v19 : engins de défense posés, dessinés sur leur flanc (gauche : mur ouest, front : porte, droite : mur est)
  if (g.style.key !== 'stakes') parts.push(postedEnginesSvg(state, g));
  // Charrettes à la porte : une par convoi actif (au plus 4)
  for (let i = 0; i < Math.min(4, carts); i++) {
    const x = g.gateX - 30 + i * 22, y = g.Y1 + g.mw + 30 + (i % 2) * 6;
    parts.push(`<g class="cart"><rect x="${x}" y="${y}" width="16" height="9" fill="#a2602c" stroke="${K}" stroke-width="1.2"/><circle cx="${x + 4}" cy="${y + 11}" r="3" fill="#3a2a1a"/><circle cx="${x + 12}" cy="${y + 11}" r="3" fill="#3a2a1a"/></g>`);
  }
  // Raid en approche : colonne ennemie au bord de la carte, du côté d'où elle vient ; flanc visé si connu
  if (raid) parts.push(raidColumn(state, raid, g, { W, H }));
  // v17 : tenues de fête, liées à l'état réel (saison, événement en cours, raid repoussé) — guirlande de fanions le
  // long du chemin de ronde nord et lanternes aux tours ; jamais sur les cases, purement décoratif
  if (g.style.key !== 'stakes') {
    const dress = festiveDress(state, now);
    const y = g.Y0 - g.w.th / 2 - 2, n = Math.max(6, Math.round((g.X1 - g.X0) / 26));
    let flags = '';
    for (let i = 0; i < n; i++) {
      const x = g.X0 + 14 + ((g.X1 - g.X0 - 28) * (i + 0.5)) / n;
      const sag = Math.sin(((i + 0.5) / n) * Math.PI) * 9;
      flags += `<path d="M${(x - 5).toFixed(1)} ${(y + sag).toFixed(1)}l5 9l5 -9z" fill="${dress.colors[i % dress.colors.length]}" stroke="rgba(20,14,8,0.7)" stroke-width="0.8"/>`;
    }
    parts.push(`<g class="festive festive-${dress.key}"><title>${esc(dress.name)} (${esc(dress.reason)})</title><path d="M${g.X0 + 14} ${y}Q${(g.X0 + g.X1) / 2} ${y + 20} ${g.X1 - 14} ${y}" fill="none" stroke="rgba(40,28,16,0.8)" stroke-width="1.4"/>${flags}</g>`);
    if (dress.key === 'winter' || dress.key === 'event' || night) for (const [x, yy] of [[g.X0, g.Y0], [g.X1, g.Y0], [g.X0, g.Y1], [g.X1, g.Y1]]) parts.push(`<circle class="festive-lamp" cx="${x}" cy="${yy - g.w.th}" r="4.5" fill="${dress.colors[0]}" stroke="#3a2a18" stroke-width="1"/>`);
  }
  return `<svg class="castle-over" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" aria-hidden="true">${parts.join('')}</svg>`;
}

// Badges d'engins : icône et nombre, sur fond sombre (lisibles sur la pierre comme sur l'herbe)
function engineBadges(list, x, y, vertical) {
  return list.map(([k, n], i) => {
    const d = DEFENSE_ENGINES[k] || ATTACK_ENGINES[k];
    const bx = vertical ? x : x + i * 46, by = vertical ? y + i * 24 : y;
    return `<g class="eng-badge"><title>${esc(`${n} × ${d.name}`)}</title><rect x="${bx - 21}" y="${by - 10}" width="42" height="20" rx="6" fill="rgba(24,18,12,0.88)" stroke="#e6cf9a" stroke-width="1.2"/><text x="${bx - 9}" y="${by + 5}" text-anchor="middle" font-size="12">${d.icon}</text><text x="${bx + 10}" y="${by + 4}" text-anchor="middle" class="eng-n">${n}</text></g>`;
  }).join('');
}
function postedEnginesSvg(state, g) {
  const P = state.siege?.posted;
  if (!P) return '';
  const list = (f) => Object.entries(P[f] || {}).filter(([, n]) => n > 0).slice(0, 4);
  const midY = (g.Y0 + g.Y1) / 2;
  const L = list('left'), F = list('front'), R = list('right');
  return `<g class="castle-engines">${engineBadges(L, g.X0 - g.w.th - 28, midY - (L.length * 24) / 2, true)}${engineBadges(R, g.X1 + g.w.th + 28, midY - (R.length * 24) / 2, true)}${engineBadges(F, g.gateX - ((F.length - 1) * 46) / 2, g.Y1 - g.w.th * 2.4 - 18, false)}</g>`;
}

// Côté de la carte d'où vient un raid (d'après la position de son repaire sur la carte du monde)
export function raidSide(state, raid) {
  const c = state.world?.capital;
  if (!c || !raid?.from) return 'w';
  const dx = raid.from.x - c.x, dy = raid.from.y - c.y;
  return Math.abs(dx) >= Math.abs(dy) ? (dx >= 0 ? 'e' : 'w') : (dy >= 0 ? 's' : 'n');
}
export function raidAnchor(state, raid, { W, H }) {
  const side = raidSide(state, raid);
  return { side, x: side === 'w' ? 40 : side === 'e' ? W - 40 : W / 2, y: side === 'n' ? 40 : side === 's' ? H - 40 : H / 2 };
}
function raidColumn(state, raid, g, dim) {
  const a = raidAnchor(state, raid, dim);
  const out = [];
  const n = Math.min(12, 4 + Math.ceil(Object.values(raid.army || {}).reduce((s, v) => s + v, 0) / 25));
  for (let i = 0; i < n; i++) {
    const along = (i - n / 2) * 14, back = (i % 3) * 12;
    const x = a.side === 'w' ? a.x - back : a.side === 'e' ? a.x + back : a.x + along;
    const y = a.side === 'n' ? a.y - back : a.side === 's' ? a.y + back : a.y + along;
    out.push(`<g class="foe"><circle cx="${x}" cy="${y - 5}" r="3.4" fill="#d9b48f" stroke="${K}" stroke-width="1"/><path d="M${x - 3.5} ${y - 2}h7v8h-7Z" fill="#7d1d16" stroke="${K}" stroke-width="1"/></g>`);
  }
  // v19 : engins d'attaque de la colonne (s'ils sont connus : tour de garde niv. 4)
  const eng = Object.entries(raid.engines || {}).filter(([, n]) => n > 0).slice(0, 4);
  if (eng.length && (state.city?.buildings && Object.values(state.city.buildings).some((b) => b.type === 'watchtower' && b.level >= 4))) out.push(engineBadges(eng, a.side === 'e' ? a.x - 60 : a.x + 60, a.y + 36, a.side === 'w' || a.side === 'e'));
  out.push(`<g class="foe-banner"><path d="M${a.x} ${a.y - 18}v-24" stroke="${K}" stroke-width="2"/><path d="M${a.x} ${a.y - 42}h20l-6 7l6 7h-20Z" fill="#7d1d16" stroke="${K}" stroke-width="1.4"/></g>`);
  // Flèche vers le flanc visé (si la tour de garde l'a repéré)
  if (raid.flankSeen && FLANKS[raid.flank]) {
    const tgt = raid.flank === 'left' ? [g.X0, (g.Y0 + g.Y1) / 2] : raid.flank === 'right' ? [g.X1, (g.Y0 + g.Y1) / 2] : [g.gateX, g.Y1];
    out.push(`<path d="M${a.x} ${a.y}L${tgt[0]} ${tgt[1]}" stroke="#c0392b" stroke-width="4" stroke-dasharray="14 10" fill="none" class="raid-path"/><circle cx="${tgt[0]}" cy="${tgt[1]}" r="14" fill="none" stroke="#c0392b" stroke-width="3"/>`);
  }
  return out.join('');
}

// Résumé lisible du château (légende de la carte)
export function castleSummary(state) {
  const g = castleGeom(state);
  const st = castleStage(state);
  return { stage: st.name, wall: g.wl ? `${g.style.name} (niv. ${g.wl})` : 'Pas encore de muraille', moat: g.ml ? `Douves niv. ${g.ml}` : '', w: g.r.x1 - g.r.x0 + 1, h: g.r.y1 - g.r.y0 + 1, flanks: Object.fromEntries(['left', 'front', 'right'].map((f) => [f, flankShare(state, f)])) };
}
