import { drawSigil } from './sigils.js';
// Rendu du monde évolutif sur la carte du monde (canvas) et lignes d'explication de la fiche d'une case.
import { MARKS, marksNear, markAt, TOWN_RANKS, HAMLET_MAX, HAMLET_STAB, HAMLET_HOURS } from '../systems/worldmarks.js';
import { esc, countdown } from './components.js';

const reduce = () => typeof document !== 'undefined' && document.documentElement.classList.contains('reduce-motion');

export function drawWorldMarks(ctx, s, { ox, oy, T, x0, x1, y0, y1, now }) {
  const marks = s.world.marks || {};
  for (const [kk, m] of Object.entries(marks)) {
    if (m.until && m.until <= now) continue;
    const [x, y] = kk.split(',').map(Number);
    if (x < x0 - 2 || x > x1 + 2 || y < y0 - 2 || y > y1 + 2) continue;
    const px = ox + x * T, py = oy + y * T;
    if (m.kind === 'scorched') {
      // Halo de cendres sur 5×5 cases, plus sombre au centre ; braises discrètes en vue rapprochée
      const g = ctx.createRadialGradient(px + T / 2, py + T / 2, T * 0.3, px + T / 2, py + T / 2, T * 2.6);
      g.addColorStop(0, 'rgba(40,20,14,0.55)'); g.addColorStop(0.6, 'rgba(60,30,20,0.28)'); g.addColorStop(1, 'rgba(60,30,20,0)');
      ctx.fillStyle = g; ctx.fillRect(px - 2 * T, py - 2 * T, 5 * T, 5 * T);
      if (T >= 18) {
        const flick = reduce() ? 0.6 : 0.45 + 0.25 * Math.sin(now / 350 + x);
        ctx.fillStyle = `rgba(230,110,40,${flick})`;
        for (const [dx, dy] of [[0.2, 0.7], [0.75, 0.35], [0.5, 0.9], [-0.6, 0.4], [1.4, 1.1]]) ctx.fillRect(px + dx * T, py + dy * T, Math.max(2, T * 0.06), Math.max(2, T * 0.06));
      }
    } else if (m.kind === 'overcut' && T >= 10) {
      // Souches sur la case
      ctx.fillStyle = '#6b4a2e'; ctx.strokeStyle = '#2b1d12'; ctx.lineWidth = 1;
      for (const [dx, dy] of [[0.25, 0.65], [0.55, 0.45], [0.7, 0.75], [0.35, 0.3]]) { ctx.beginPath(); ctx.ellipse(px + dx * T, py + dy * T, T * 0.08, T * 0.05, 0, 0, 7); ctx.fill(); ctx.stroke(); }
    } else if (m.kind === 'fortified') {
      // Capitale renforcée : double anneau de pierre autour de la case (effet réel : garnison +20 %)
      ctx.strokeStyle = 'rgba(200,190,170,0.9)'; ctx.lineWidth = Math.max(2, T * 0.08);
      ctx.strokeRect(px - T * 0.12, py - T * 0.12, T * 1.24, T * 1.24);
      ctx.strokeStyle = 'rgba(60,50,40,0.9)'; ctx.lineWidth = Math.max(1, T * 0.03);
      ctx.strokeRect(px - T * 0.2, py - T * 0.2, T * 1.4, T * 1.4);
    } else if (m.kind === 'regrown') {
      ctx.strokeStyle = 'rgba(140,230,120,0.75)'; ctx.lineWidth = Math.max(1.5, T * 0.05);
      ctx.beginPath(); ctx.arc(px + T / 2, py + T / 2, T * 0.62, 0, 7); ctx.stroke();
    } else if (m.kind === 'ruinedRoad' && T >= 14) {
      drawSigil(ctx, '🚧', px + T * 0.82, py + T * 0.82, T * 0.38, '#f3c76a');
    }
  }
}

// Petites maisons autour d'un avant-poste (1 à 3 selon le niveau du hameau)
export function drawHamlet(ctx, x, y, T, level) {
  const w = Math.max(5, T * 0.16);
  for (let i = 0; i < Math.min(HAMLET_MAX, level) + 1; i++) {
    const hx = x + (i % 2) * w * 1.15 - (i > 1 ? w * 0.6 : 0), hy = y + Math.floor(i / 2) * w * 0.9;
    ctx.fillStyle = '#d8c39a'; ctx.strokeStyle = '#2b1d12'; ctx.lineWidth = 1;
    ctx.fillRect(hx, hy, w, w * 0.7); ctx.strokeRect(hx, hy, w, w * 0.7);
    ctx.fillStyle = '#a8432f';
    ctx.beginPath(); ctx.moveTo(hx - w * 0.15, hy); ctx.lineTo(hx + w / 2, hy - w * 0.55); ctx.lineTo(hx + w * 1.15, hy); ctx.closePath(); ctx.fill(); ctx.stroke();
  }
}

// Lignes de la fiche d'une case : traces, hameau, importance d'une cité
export function marksPanel(s, x, y, terr, poi, now = Date.now()) {
  const lines = [];
  const m = markAt(s, x, y);
  if (m && !(m.until <= now) && MARKS[m.kind]) lines.push(`${MARKS[m.kind].icon} <b>${esc(MARKS[m.kind].name)}</b> — ${esc(MARKS[m.kind].desc)}${m.until ? ` (encore ${countdown(m.until)})` : ''}`);
  else if (marksNear(s, x, y, 'scorched', 2, now).length) lines.push(`🔥 <b>${esc(MARKS.scorched.name)}</b> à proximité — ${esc(MARKS.scorched.desc)}`);
  if (terr) {
    if (terr.hamlet) lines.push(`🏡 <b>Hameau de niveau ${terr.hamlet}/${HAMLET_MAX}</b> : production et impôts +${5 * terr.hamlet} %.`);
    else lines.push(`<span class="muted">🏡 Gardez la stabilité ≥ ${HAMLET_STAB} pendant ${HAMLET_HOURS} h : un hameau naîtra près de l’avant-poste.</span>`);
  }
  if (poi?.type === 'town') {
    const trips = s.routes?.[`${x},${y}`]?.trips || 0;
    const next = TOWN_RANKS[(poi.rank || 0) + 1];
    lines.push(`🏘️ Importance : rang ${poi.rank || 0}/3${poi.rank ? ` (prix +${4 * poi.rank} %)` : ''} · ${trips} voyage(s) de vos caravanes${next ? ` — rang suivant à ${next}` : ''}.`);
  }
  return lines.length ? `<div class="panel-sub marks-sub small">${lines.map((l) => `<div>${l}</div>`).join('')}</div>` : '';
}
