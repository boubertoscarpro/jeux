// v25 « Le monde en fête et en guerre » — Les événements sur la carte du monde, comme dans les jeux de stratégie du
// genre : chaque cible est un petit dessin coloré avec son niveau dans un écusson, la bannière de l'événement et un
// compte à rebours quand elle réapparaît ou change de phase. Un clic ouvre un anneau d'actions autour du lieu
// (Attaquer, Espionner, actions de l'événement, Infos) ; « Infos » ouvre la fiche (niveau, défenseurs estimés ou
// connus, points d'événement, distance et temps de marche depuis la capitale et chaque avant-poste).
// Couches propres aux événements : front de neige, lave, cases brûlées par le dragon, menaces en marche (traits rouges
// ou orange avec compte à rebours). Les transitions de phase sont animées (feu, bannière qui tombe, campement levé),
// fixes si les animations sont réduites.
import { LIVE_EVENTS } from '../data/liveEvents.js';
import { ALL_UNITS } from '../data/units.js';
import { POI_TYPES } from '../data/world.js';
import { fmt, fmtTime } from '../core/util.js';
import { liveState, eventTargetOfPoi, actionsFor, ACTIONS, targetName, actionCost, liveTravel, targetReward, bossPhase, lavaNear, eventMarches, maxLiveMarches } from '../systems/liveEvents.js';
import { eventBases } from '../systems/eventWorld.js';
import { marchMods } from '../systems/marches.js';
import { esc, countdown, bar, resChips } from './components.js';
import { sigilByKey } from './sigils.js';

export const EVENT_PHASE_LABEL = { upcoming: 'annoncé', active: 'actif', boss: 'chef', cleared: 'vaincu', ended: 'levé' };
const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX'];
export const hexA = (c, a) => { const n = parseInt(String(c || '#e2b84a').slice(1), 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`; };
const TRANS_MS = 90 * 1000; // durée de l'animation de défaite (campement en feu, bannière qui tombe)
const FADE_MS = 20 * 60 * 1000;

// ───────── Couches de la carte (sous les lieux) ─────────
export function drawEventLayers(ctx, s, view, now, reduce) {
  const cur = liveState(s).current;
  const tokens = [];
  if (!cur || !cur.map || now >= cur.end) return tokens;
  const { T, ox, oy } = view, S = s.world.size;
  const mark = (x, y) => ({ x: ox + (x + 0.5) * T, y: oy + (y + 0.5) * T });
  const m = cur.map;
  // Front de neige : disque givré qui avance pendant l'événement (ralentit les marches qui le traversent)
  if (m.frost) {
    const c = mark(m.frost.x, m.frost.y), R = m.frost.r * T;
    const gr = ctx.createRadialGradient(c.x, c.y, R * 0.2, c.x, c.y, R);
    gr.addColorStop(0, 'rgba(235,245,255,0.55)'); gr.addColorStop(0.8, 'rgba(210,230,250,0.4)'); gr.addColorStop(1, 'rgba(210,230,250,0)');
    ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(c.x, c.y, R, 0, 7); ctx.fill();
    ctx.strokeStyle = 'rgba(160,200,240,0.8)'; ctx.setLineDash([6, 5]); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(c.x, c.y, R, 0, 7); ctx.stroke(); ctx.setLineDash([]);
  }
  // Cases brûlées (piste du dragon) et lave (volcan)
  for (const i of m.burnt || []) { const x = i % S, y = Math.floor(i / S); ctx.fillStyle = 'rgba(30,18,12,0.55)'; ctx.fillRect(ox + x * T, oy + y * T, T + 0.5, T + 0.5); }
  const flick = reduce ? 0.8 : 0.7 + 0.3 * Math.sin(now / 300);
  // Lave : coulées arrondies, cœur jaune, bords sombres (une tache par case, qui se fondent entre voisines)
  for (const i of m.lava || []) {
    const x = i % S, y = Math.floor(i / S), cx = ox + (x + 0.5) * T, cy = oy + (y + 0.5) * T, R = T * 0.78;
    const gr = ctx.createRadialGradient(cx, cy, 0, cx, cy, R);
    gr.addColorStop(0, `rgba(255,${200 + Math.round(30 * flick)},90,0.95)`); gr.addColorStop(0.45, `rgba(255,${100 + Math.round(30 * flick)},20,0.85)`); gr.addColorStop(1, 'rgba(120,20,0,0)');
    ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(cx, cy, R, 0, 7); ctx.fill();
  }
  if (m.volcano) {
    const c = mark(m.volcano.x, m.volcano.y);
    const gr = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, T * 2.2); gr.addColorStop(0, `rgba(255,120,40,${0.6 * flick})`); gr.addColorStop(1, 'rgba(255,60,20,0)');
    ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(c.x, c.y, T * 2.2, 0, 7); ctx.fill();
  }
  // Menaces en marche : harcèlement, assaut (rouge, comme une attaque entrante) ; prospecteurs rivaux (orange)
  for (const th of m.threats || []) {
    const a = mark(th.from.x, th.from.y), b = mark(th.to.x, th.to.y);
    const hostile = th.kind !== 'rival';
    ctx.strokeStyle = hostile ? 'rgba(230,40,40,0.9)' : 'rgba(255,160,40,0.9)';
    ctx.lineWidth = Math.max(2, Math.min(4.5, T / 9)); ctx.setLineDash(hostile ? [10, 6] : [6, 6]);
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); ctx.setLineDash([]);
    const f = Math.max(0, Math.min(1, (now - th.start) / Math.max(1, th.arrive - th.start)));
    tokens.push({ army: hostile, raid: hostile, x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, col: hostile ? '#d62828' : '#e08a2a', icon: hostile ? '⚔️' : '⛏', angle: Math.atan2(b.y - a.y, b.x - a.x), end: th.arrive, label: th.label });
  }
  // Hordes : trait vers leur cible
  for (const t of m.targets) {
    if (t.type !== 'horde' || t.done || t.gone || !t.dest) continue;
    const a = mark(t.x, t.y), b = mark(t.dest.x, t.dest.y);
    ctx.strokeStyle = 'rgba(120,255,170,0.85)'; ctx.lineWidth = Math.max(2, Math.min(4, T / 10)); ctx.setLineDash([3, 6]);
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); ctx.setLineDash([]);
  }
  return tokens;
}

// ───────── Par-dessus le dessin d'une cible : niveau, compte à rebours, animations de phase ─────────
// Écusson de niveau (chiffre romain) dans la couleur de l'événement, en haut à gauche du lieu
function levelShield(ctx, x, y, sz, color, text) {
  ctx.save();
  ctx.beginPath(); ctx.moveTo(x - sz, y - sz); ctx.lineTo(x + sz, y - sz); ctx.lineTo(x + sz, y + sz * 0.2); ctx.quadraticCurveTo(x + sz, y + sz * 0.9, x, y + sz * 1.3); ctx.quadraticCurveTo(x - sz, y + sz * 0.9, x - sz, y + sz * 0.2); ctx.closePath();
  ctx.fillStyle = color; ctx.fill(); ctx.lineWidth = Math.max(1.2, sz * 0.16); ctx.strokeStyle = '#f1d36a'; ctx.stroke();
  ctx.fillStyle = '#fff8e6'; ctx.font = `700 ${Math.round(sz * 1.05)}px Georgia, serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.lineWidth = Math.max(1.5, sz * 0.2); ctx.strokeStyle = 'rgba(20,10,4,0.85)'; ctx.strokeText(text, x, y + sz * 0.1); ctx.fillText(text, x, y + sz * 0.1);
  ctx.restore();
}
// Bandeau de compte à rebours au-dessus du lieu
function timerTag(ctx, x, y, text, bg = 'rgba(20,12,6,0.88)', fg = '#ffe9a8') {
  ctx.save();
  ctx.font = `700 ${11}px system-ui, sans-serif`;
  const w = ctx.measureText(text).width + 12;
  ctx.fillStyle = bg; ctx.beginPath(); ctx.roundRect(x - w / 2, y - 9, w, 17, 8); ctx.fill();
  ctx.strokeStyle = 'rgba(241,211,106,0.8)'; ctx.lineWidth = 1; ctx.stroke();
  ctx.fillStyle = fg; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, x, y);
  ctx.restore();
}
// Bannière plantée qui tombe (angle 0 → 90°)
function fallingBanner(ctx, x, y, h, color, angle) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(angle);
  ctx.strokeStyle = '#2a1a10'; ctx.lineWidth = Math.max(1.5, h / 14); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -h); ctx.stroke();
  ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(0, -h); ctx.lineTo(h * 0.55, -h + h * 0.18); ctx.lineTo(0, -h + h * 0.36); ctx.closePath(); ctx.fill();
  ctx.restore();
}
// Alpha du dessin selon la phase (campement levé : il s'efface pendant 20 min)
export function eventPoiAlpha(p, now) {
  if (p.phase === 'ended') return Math.max(0.15, 1 - (now - (p.endAt || now)) / FADE_MS);
  return 1;
}
export function drawEventOverlay(ctx, p, px, py, T, now, reduce) {
  const col = p.color || '#e2b84a';
  const sz = Math.max(6, Math.min(12, T * 0.2));
  // Apparition : un cercle de poussière qui s'ouvre (60 s)
  const born = now - (p.born || 0);
  if (!reduce && p.phase !== 'cleared' && p.phase !== 'ended' && born >= 0 && born < 60000) {
    const f = born / 60000;
    ctx.strokeStyle = hexA(col, 0.8 * (1 - f)); ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(px, py + T * 0.15, T * (0.3 + f * 0.8), T * (0.15 + f * 0.4), 0, 0, 7); ctx.stroke();
  }
  // Défaite : flammes et bannière qui tombe, puis fumée (dessin « ruines » en dessous)
  if (p.phase === 'cleared' || p.phase === 'ended') {
    const age = now - (p.phase === 'ended' ? p.endAt || now : p.doneAt || now);
    if (age >= 0 && age < TRANS_MS && !reduce) {
      const k = 1 - age / TRANS_MS;
      for (let i = 0; i < 5; i++) {
        const fx = px + Math.sin(i * 2.1 + now / 180) * T * 0.25, fy = py - T * 0.05 - ((now / 6 + i * 37) % (T * 0.6));
        const gr = ctx.createRadialGradient(fx, fy, 0, fx, fy, T * 0.22 * k + 2);
        gr.addColorStop(0, `rgba(255,220,120,${0.9 * k})`); gr.addColorStop(0.5, `rgba(255,110,30,${0.7 * k})`); gr.addColorStop(1, 'rgba(255,60,20,0)');
        ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(fx, fy, T * 0.22 * k + 2, 0, 7); ctx.fill();
      }
    }
    const fall = reduce ? Math.PI / 2 : Math.min(Math.PI / 2, (Math.max(0, age) / 2500) * (Math.PI / 2));
    fallingBanner(ctx, px + T * 0.28, py + T * 0.1, Math.max(10, T * 0.5), col, fall);
    if (p.phase === 'cleared' && p.respawnAt > now && T >= 18) timerTag(ctx, px, py - T * 0.75, `réapparaît ${fmtTime(p.respawnAt - now)}`, 'rgba(30,30,30,0.85)', '#e8e2d2');
    return;
  }
  if (p.phase === 'upcoming') { if (T >= 12) timerTag(ctx, px, py - T * 0.8, `${p.name} · ${fmtTime(Math.max(0, p.until - now))}`); return; }
  // Chef / forteresse : halo pulsé
  if (p.phase === 'boss') {
    const k = reduce ? 0.5 : 0.5 + 0.5 * Math.sin(now / 320);
    ctx.strokeStyle = `rgba(255,70,40,${0.45 + 0.4 * k})`; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.ellipse(px, py + T * 0.12, T * 0.75, T * 0.38, 0, 0, 7); ctx.stroke();
  }
  // Camp nomade qui vient de se déplacer : trace de son ancien emplacement
  if (p.nomad && p.prev && now - (p.movedAt || 0) < 30 * 60000 && T >= 14) {
    ctx.strokeStyle = hexA(col, 0.6); ctx.setLineDash([2, 5]); ctx.lineWidth = 2; ctx.beginPath();
    ctx.moveTo(px + (p.prev.x - p.x) * T, py + (p.prev.y - p.y) * T); ctx.lineTo(px, py); ctx.stroke(); ctx.setLineDash([]);
  }
  if (T >= 12 && p.tier) levelShield(ctx, px - T * 0.42, py - T * 0.42, sz, col, ROMAN[Math.min(9, p.tier)] || String(p.tier));
}

// ───────── Anneau d'actions (GGE : clic sur un lieu → boutons autour de lui) ─────────
const RING_ICON = { attack: 'swords', spy: 'eye', escort: 'shield', trade: 'handshake', dig: 'pick', deliver: 'crate', solve: 'question', track: 'paws', garrison: 'castle', withdraw: 'back', mine: 'pick', harvest: 'volcano', info: 'info', scout: 'eye', gather: 'basket', explore: 'compass', dungeon: 'ruin', boss: 'dragon', visit: 'handshake', claim: 'flag' };
const ACT_SHORT = { attack: 'Attaquer', spy: 'Espionner', escort: 'Escorter', trade: 'Commercer', dig: 'Déterrer', deliver: 'Livrer', solve: 'Énigme', track: 'Pister', garrison: 'Renforcer', withdraw: 'Rappeler', mine: 'Exploiter', harvest: 'Récolter', info: 'Infos', scout: 'Espionner', gather: 'Récolter', explore: 'Explorer', dungeon: 'Explorer', boss: 'Assaut', visit: 'Rencontrer' };
// Actions proposées autour d'un lieu : [{ act, kind: 'ev' | 'march' | 'info', type? }]
export function ringActions(state, poi, now = Date.now()) {
  if (!poi) return [];
  const def = POI_TYPES[poi.type];
  if (poi.type === 'evt') {
    const t = eventTargetOfPoi(state, poi);
    const acts = t && poi.phase !== 'cleared' && poi.phase !== 'ended' ? actionsFor(state, t, now) : [];
    return [...acts.slice(0, 5).map((a) => ({ act: a, kind: 'ev', id: t.id })), { act: 'info', kind: 'info' }];
  }
  const out = [];
  if (def.kind === 'danger' && !def.dungeon && !(poi.clearedUntil > now)) out.push({ act: 'attack', kind: 'march', type: 'attack' }, { act: 'scout', kind: 'march', type: 'scout' });
  if (def.dungeon) out.push({ act: 'dungeon', kind: 'march', type: 'dungeon' });
  if (def.kind === 'kingdom') out.push({ act: 'attack', kind: 'march', type: 'attack' }, { act: 'scout', kind: 'march', type: 'scout' });
  if (def.kind === 'gather' && poi.amount >= 1) { out.push({ act: 'gather', kind: 'march', type: 'gather' }); if (poi.danger) out.push({ act: 'scout', kind: 'march', type: 'scout' }); }
  if (def.kind === 'boss' && state.boss) out.push({ act: 'boss', kind: 'march', type: 'boss' });
  if (!out.length) return [];
  out.push({ act: 'info', kind: 'info' });
  return out;
}
export function ringHtml(state, poi, now = Date.now()) {
  const acts = ringActions(state, poi, now);
  if (!acts.length) return '';
  const n = acts.length;
  return acts.map((a, i) => {
    const ang = -Math.PI / 2 + (i / n) * Math.PI * 2;
    const style = `--rx:${Math.cos(ang).toFixed(3)};--ry:${Math.sin(ang).toFixed(3)}`;
    const data = a.kind === 'ev' ? `data-action="ev-send" data-act="${a.act}" data-id="${a.id}"` : a.kind === 'march' ? `data-action="ring-march" data-type="${a.type}"` : 'data-action="ring-info"';
    const label = ACT_SHORT[a.act] || ACTIONS[a.act]?.label || a.act;
    return `<button class="ring-btn ${a.act === 'attack' ? 'primary' : ''}" style="${style}" ${data} title="${esc(ACTIONS[a.act]?.hint || label)}">${sigilByKey(RING_ICON[a.act] || 'star', 'sg ring-ic')}<span>${esc(label)}</span></button>`;
  }).join('');
}

// ───────── Fiche d'une cible d'événement (Infos) ─────────
const units = (u) => Object.entries(u || {}).filter(([, n]) => n > 0);
function enemyRange(e, exact) {
  return units(e).map(([u, n]) => `<span class="unit-chip">${ALL_UNITS[u]?.icon || ''} ${exact ? n : `${Math.max(1, Math.round(n * 0.75))}–${Math.round(n * 1.3)}`} ${esc(ALL_UNITS[u]?.name || u)}</span>`).join('');
}
export function eventCardHtml(app, poi, now = Date.now()) {
  const s = app.state;
  const L = liveState(s);
  if (poi.phase === 'upcoming') {
    const def = LIVE_EVENTS[poi.eventKey];
    return `<div class="panel-sub ev-site" style="--ev:${poi.color}"><h4>${esc(def?.name || poi.name)} <span class="small muted">· annoncé</span></h4><p>Les éclaireurs signalent un campement qui se dresse : l’événement commence dans <b>${countdown(poi.until)}</b>. Ses cibles apparaîtront tout autour de vos terres : faibles près de chez vous, plus fortes au loin.</p><button class="btn ghost small" data-action="nav" data-view="calendar">Voir le calendrier</button></div>`;
  }
  if (poi.phase === 'ended') return `<div class="panel-sub ev-site"><h4>${esc(poi.name)}</h4><p class="muted">L’événement est terminé : le campement est levé.</p></div>`;
  const cur = L.current;
  const t = eventTargetOfPoi(s, poi);
  if (!cur || !t) return '<div class="panel-sub"><p class="muted">Cette cible a disparu.</p></div>';
  const def = LIVE_EVENTS[cur.key];
  const name = targetName(cur, t);
  const rw = targetReward(s, t);
  const mods = marchMods(s, null, null, now);
  const probe = { spearman: 1 };
  const bases = eventBases(s).map((b) => ({ b, d: Math.hypot(b.x - t.x, b.y - t.y), ms: liveTravel(s, cur, b, t.x, t.y, probe, mods) })).sort((a, b) => a.d - b.d);
  const acts = poi.phase === 'cleared' ? [] : actionsFor(s, t, now);
  const info = [];
  if (t.enemies && t.type !== 'boss') info.push(`<h5>Défenseurs ${t.spied ? '<span class="ok small">(espionnés)</span>' : '<span class="muted small">(estimation)</span>'}</h5><div class="chips">${enemyRange(t.enemies, t.spied)}</div>`);
  if (t.type === 'boss') { const b = def.bosses[0], tier = b.tiers[cur.bossIdx]; const ph = bossPhase(s, cur, def); if (tier) info.push(`<div class="small boss-phase"><b>${esc(ph.name)}</b> — ${esc(ph.desc || '')}</div><div class="small">PV : ${fmt(cur.bossHp)} / ${fmt(Math.round(tier.hp))}</div>${bar(cur.bossHp, tier.hp, 'bad')}`); }
  if (t.type === 'caravan' || t.type === 'ship') info.push(t.spied ? `<div class="small">Cargaison : <b>${esc(t.cargo)}</b> · vers (${t.dest.x}, ${t.dest.y})${t.dest.name ? ` — ${esc(t.dest.name)}` : ''}</div>` : '<div class="small muted">En route. Espionnez-la pour connaître sa cargaison et sa destination (+50 % de points).</div>');
  if (t.type === 'horde') info.push(`<div class="small bad">Marche sur ${esc(t.dest?.name || 'vos terres')} : arrivée dans <b>${countdown(t.arrive)}</b>. Interceptez-la pour annuler la vague.</div>`);
  if (t.type === 'vent' && lavaNear(s, cur.map, t.x, t.y)) info.push('<div class="small bad">La lave cerne cet évent : pertes probables.</div>');
  if (t.type === 'zone' && t.border) info.push(`<div class="small">Frontière disputée avec ${esc(t.border)}.</div>`);
  if (t.nomad) info.push('<div class="small muted">Camp nomade : il change de place toutes les 4 h et peut harceler un avant-poste mal gardé.</div>');
  if (t.fog) info.push('<div class="small muted">Ruine retrouvée sous le brouillard.</div>');
  if (poi.phase === 'cleared') info.push(`<div class="small muted">Vaincu${t.respawnAt > now ? ` — un nouveau camp se dressera dans ${countdown(t.respawnAt)}` : ''}.</div>`);
  const busy = eventMarches(s).filter((m) => m.phase !== 'hold').length;
  return `<div class="panel-sub ev-card ${poi.phase === 'boss' ? 'is-boss' : ''}" style="--ev:${def.color}">
    <div class="ev-card-head"><span class="ev-lvl">${ROMAN[Math.min(9, t.tier)] || ''}</span><div><h4>${esc(name)}</h4><div class="small muted">${esc(def.name)} · ${esc(EVENT_PHASE_LABEL[poi.phase] || '')} · (${t.x}, ${t.y})</div></div></div>
    ${info.join('')}
    ${rw ? `<div class="ev-reward small"><b>${rw.points != null ? `≈ ${fmt(rw.points)} ${esc(def.currency.name)}` : 'Points d’événement'}</b>${rw.loot ? ` · ${esc(rw.loot)}` : ''}</div>` : ''}
    <h5>Distance et temps de marche <span class="muted small">(infanterie)</span></h5>
    <ul class="ev-dist small">${bases.slice(0, 4).map((x, i) => `<li>${i === 0 ? '<b>' : ''}${esc(x.b.key === 'capital' ? 'Capitale' : x.b.name)}${i === 0 ? '</b>' : ''} · ${x.d.toFixed(1)} cases · ${fmtTime(x.ms)}</li>`).join('')}</ul>
    <div class="ev-actions">${acts.map((a) => { const c = actionCost(t, a); return `<button class="btn ${a === 'attack' ? 'primary' : ''}" data-action="ev-send" data-act="${a}" data-id="${t.id}" title="${esc(ACTIONS[a].hint || '')}">${ACTIONS[a].icon} ${esc(ACTIONS[a].label)}${c ? ' ' + resChips(c) : ''}</button>`; }).join('') || (poi.phase === 'cleared' ? '' : '<span class="muted small">Aucune action possible pour le moment.</span>')}</div>
    <div class="small muted">Troupes d’événement en route : ${busy}/${maxLiveMarches(s)}</div>
    <button class="btn ghost small" data-action="nav" data-view="event">Ouvrir l’événement (boutique, missions, classement)</button></div>`;
}
