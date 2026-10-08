import { TERRAINS, POI_TYPES, RIVALS, BOSSES } from '../../data/world.js';
import { UNITS, ALL_UNITS, FORMATIONS, TERRAIN_COMBAT } from '../../data/units.js';
import { RESOURCES } from '../../data/resources.js';
import { CONSUMABLES } from '../../data/items.js';
import { HERO_CLASSES } from '../../data/heroes.js';
import { fmt, fmtTime } from '../../core/util.js';
import { computeMods } from '../../systems/modifiers.js';
import { wTerrain, isRevealed, poiAt, distCap, travelTime, key, territoryLimit, territoryRange } from '../../systems/world.js';
import { planMarch, sendMarch, carryCapacity, gatherRate, breadNeeded, MARCH_TYPES } from '../../systems/marches.js';
import { previewBattle } from '../../systems/combat.js';
import { armyPower } from '../../systems/army.js';
import { canClaim, claimTerritory, abandonTerritory } from '../../systems/territory.js';
import { sendCaravan, townPrice, caravanTime, caravanCargo, caravanSlots } from '../../systems/market.js';
import { levelOf } from '../../systems/city.js';
import { esc, costList, resChips, bar, countdown } from '../components.js';

const BASE_TILE = 26;

function cam(app) {
  const w = app.state.world;
  if (!app.ui.cam) app.ui.cam = { x: w.capital.x + 0.5, y: w.capital.y + 0.5, zoom: 1 };
  return app.ui.cam;
}

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
  const T = BASE_TILE * c.zoom;
  const W = rect.width, H = rect.height;
  const ox = W / 2 - c.x * T, oy = H / 2 - c.y * T;
  ctx.fillStyle = '#0d0f14'; ctx.fillRect(0, 0, W, H);
  const x0 = Math.max(0, Math.floor(-ox / T)), y0 = Math.max(0, Math.floor(-oy / T));
  const x1 = Math.min(w.size - 1, Math.ceil((W - ox) / T)), y1 = Math.min(w.size - 1, Math.ceil((H - oy) / T));
  const now = Date.now();
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const px = ox + x * T, py = oy + y * T;
    if (!isRevealed(w, x, y)) {
      ctx.fillStyle = (x + y) % 2 ? '#1a1d26' : '#181a22';
      ctx.fillRect(px, py, T + 0.5, T + 0.5);
      continue;
    }
    const ter = wTerrain(w, x, y);
    ctx.fillStyle = TERRAINS[ter].color;
    ctx.fillRect(px, py, T + 0.5, T + 0.5);
    // Petite texture
    if (T > 14) {
      ctx.fillStyle = 'rgba(0,0,0,0.08)';
      if (ter === 'forest') { ctx.beginPath(); ctx.arc(px + T * 0.3, py + T * 0.35, T * 0.16, 0, 7); ctx.arc(px + T * 0.7, py + T * 0.65, T * 0.16, 0, 7); ctx.fill(); }
      if (ter === 'mountain') { ctx.beginPath(); ctx.moveTo(px + T * 0.2, py + T * 0.8); ctx.lineTo(px + T * 0.5, py + T * 0.25); ctx.lineTo(px + T * 0.8, py + T * 0.8); ctx.fill(); }
      if (ter === 'hills') { ctx.beginPath(); ctx.arc(px + T * 0.5, py + T * 0.85, T * 0.3, Math.PI, 0); ctx.fill(); }
      if (ter === 'river') { ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fillRect(px + T * 0.2, py + T * 0.45, T * 0.6, T * 0.08); }
    }
    if (s.territories[key(x, y)]) {
      ctx.strokeStyle = s.meta.banner || '#e2b84a'; ctx.lineWidth = 2; ctx.strokeRect(px + 2, py + 2, T - 4, T - 4);
      ctx.fillStyle = 'rgba(226,184,74,0.15)'; ctx.fillRect(px, py, T, T);
    }
  }
  // Grille légère
  if (T > 18) {
    ctx.strokeStyle = 'rgba(0,0,0,0.12)'; ctx.lineWidth = 1;
    for (let x = x0; x <= x1 + 1; x++) { ctx.beginPath(); ctx.moveTo(ox + x * T, oy + y0 * T); ctx.lineTo(ox + x * T, oy + (y1 + 1) * T); ctx.stroke(); }
    for (let y = y0; y <= y1 + 1; y++) { ctx.beginPath(); ctx.moveTo(ox + x0 * T, oy + y * T); ctx.lineTo(ox + (x1 + 1) * T, oy + y * T); ctx.stroke(); }
  }
  // Portée des territoires
  const mods = computeMods(s, now);
  ctx.strokeStyle = 'rgba(226,184,74,0.35)'; ctx.setLineDash([4, 6]); ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(ox + (w.capital.x + 0.5) * T, oy + (w.capital.y + 0.5) * T, territoryRange(s, mods) * T, 0, Math.PI * 2); ctx.stroke();
  ctx.setLineDash([]);
  // Sites
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (const p of Object.values(w.pois)) {
    if (p.x < x0 || p.x > x1 || p.y < y0 || p.y > y1) continue;
    if (!isRevealed(w, p.x, p.y)) continue;
    const def = POI_TYPES[p.type];
    const px = ox + (p.x + 0.5) * T, py = oy + (p.y + 0.5) * T;
    const cleared = p.clearedUntil > now || (def.kind === 'gather' && p.amount < 1);
    if (def.kind === 'capital' || def.kind === 'kingdom' || def.kind === 'boss') {
      ctx.fillStyle = def.kind === 'capital' ? (s.meta.banner || '#e2b84a') : def.kind === 'boss' ? '#c0392b' : '#7b2d8b';
      ctx.beginPath(); ctx.arc(px, py, T * 0.55, 0, 7); ctx.fill();
    }
    ctx.globalAlpha = cleared ? 0.35 : 1;
    const icon = p.type === 'kingdom' ? RIVALS[p.rival]?.icon || def.icon : p.type === 'boss' && s.boss ? ALL_UNITS[BOSSES[s.boss.key].unit].icon : def.icon;
    ctx.font = `${Math.round(T * (def.kind === 'boss' ? 0.95 : 0.7))}px "Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif`;
    ctx.fillText(icon, px, py + 1);
    ctx.globalAlpha = 1;
    if (p.danger > 0 && def.kind !== 'boss' && T > 16) {
      ctx.fillStyle = p.danger >= 4 ? '#ff4f4f' : p.danger >= 2 ? '#ffb03a' : '#ffe58a';
      for (let i = 0; i < Math.min(5, p.danger); i++) ctx.fillRect(px - T * 0.4 + i * T * 0.17, py + T * 0.36, T * 0.12, T * 0.1);
    }
    if (p.infested) { ctx.font = `${Math.round(T * 0.4)}px sans-serif`; ctx.fillText('🕷️', px + T * 0.33, py - T * 0.3); }
  }
  // Marches
  for (const m of s.marches) {
    const sx = ox + (w.capital.x + 0.5) * T, sy = oy + (w.capital.y + 0.5) * T;
    const tx = ox + (m.x + 0.5) * T, ty = oy + (m.y + 0.5) * T;
    ctx.strokeStyle = m.type === 'attack' || m.type === 'boss' ? 'rgba(255,90,90,0.8)' : m.type === 'explore' || m.type === 'scout' ? 'rgba(120,200,255,0.8)' : 'rgba(255,220,120,0.85)';
    ctx.lineWidth = 2; ctx.setLineDash([5, 4]);
    ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(tx, ty); ctx.stroke(); ctx.setLineDash([]);
    let f = 1;
    if (m.phase === 'out') f = (now - m.start) / (m.arrive - m.start);
    else if (m.phase === 'back') f = 1 - (now - (m.returnAt - m.travel)) / m.travel;
    f = Math.max(0, Math.min(1, f));
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(sx + (tx - sx) * f, sy + (ty - sy) * f, 4, 0, 7); ctx.fill();
  }
  for (const r of s.raids) {
    const sx = ox + (r.from.x + 0.5) * T, sy = oy + (r.from.y + 0.5) * T;
    const tx = ox + (w.capital.x + 0.5) * T, ty = oy + (w.capital.y + 0.5) * T;
    ctx.strokeStyle = 'rgba(255,40,40,0.9)'; ctx.lineWidth = 3; ctx.setLineDash([8, 5]);
    ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(tx, ty); ctx.stroke(); ctx.setLineDash([]);
  }
  const sel = app.ui.worldSel;
  if (sel) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 2.5; ctx.strokeRect(ox + sel.x * T + 1, oy + sel.y * T + 1, T - 2, T - 2); }
}

function bindCanvas(app) {
  const canvas = document.getElementById('world-canvas');
  if (!canvas || canvas.dataset.bound) return;
  canvas.dataset.bound = '1';
  let drag = null;
  canvas.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY, moved: false }; canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const c = cam(app), T = BASE_TILE * c.zoom;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true;
    if (drag.moved) { c.x -= dx / T; c.y -= dy / T; drag.x = e.clientX; drag.y = e.clientY; drawMap(app); }
  });
  canvas.addEventListener('pointerup', (e) => {
    if (drag && !drag.moved) {
      const rect = canvas.getBoundingClientRect();
      const c = cam(app), T = BASE_TILE * c.zoom;
      const x = Math.floor((e.clientX - rect.left - rect.width / 2) / T + c.x);
      const y = Math.floor((e.clientY - rect.top - rect.height / 2) / T + c.y);
      const S = app.state.world.size;
      if (x >= 0 && y >= 0 && x < S && y < S) {
        app.ui.worldSel = { x, y };
        const panel = document.getElementById('world-panel');
        if (panel) panel.innerHTML = tilePanel(app);
        drawMap(app);
      }
    }
    drag = null;
  });
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const c = cam(app);
    c.zoom = Math.max(0.5, Math.min(2.4, c.zoom * (e.deltaY < 0 ? 1.12 : 0.89)));
    drawMap(app);
  }, { passive: false });
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
    return `<h3>🗺️ Les Terres Brisées</h3><p class="muted">Cliquez sur une case pour l’inspecter. Glissez pour vous déplacer, molette pour zoomer.</p>
      <ul class="small legend"><li>🌫️ Cases sombres : inexplorées — envoyez des <b>éclaireurs</b>.</li><li>☠ Barres de couleur : niveau de danger.</li><li>Cercle doré : portée de vos avant-postes.</li><li>Plus un site est dangereux, plus il rapporte.</li></ul>`;
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
  if (poi) {
    const def = POI_TYPES[poi.type];
    html += `<div class="poi-head"><span class="poi-icon">${poi.type === 'kingdom' ? RIVALS[poi.rival].icon : def.icon}</span><div><b>${esc(poi.name || def.name)}</b><div class="small">Danger : ${dangerStars(poi.danger)}${poi.infested ? ' · 🕷️ infesté' : ''}${poi.temp ? ' · ⏳ temporaire' : ''}</div></div></div>`;
    if (def.kind === 'capital') html += '<p>Votre capitale. Toutes les marches partent d’ici.</p>';
    if (def.kind === 'gather') {
      const r = RESOURCES[def.res];
      html += `<div class="panel-sub"><div>${r.icon} <b>${esc(r.name)}</b> : ${fmt(poi.amount)} / ${fmt(poi.max)}</div>${bar(poi.amount, poi.max)}
        <div class="muted small">Régénération : ${fmt(def.regen)}/h${def.bonus ? ` · Bonus : ${Object.keys(def.bonus).map((b) => RESOURCES[b].icon).join(' ')}` : ''}${poi.danger ? ' · Risque d’embuscade : ' + Math.round(poi.danger * 14) + '%' : ''}${poi.danger >= 2 ? ' · Chance de ressources rares' : ''}</div></div>`;
      if (poi.danger > 0) html += `<div class="panel-sub"><h4>Menace</h4>${enemyBlock(app, poi, poi.enemies)}</div>`;
      html += `<div class="row gap"><button class="btn primary" data-action="march" data-type="gather">🧺 Récolter</button>${poi.danger ? '<button class="btn" data-action="march" data-type="scout">👁️ Espionner</button>' : ''}</div>`;
    }
    if (def.kind === 'danger') {
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
    html += `<div class="panel-sub"><h4>🚩 Votre avant-poste</h4><div class="small">Bonus : ${Object.entries(TERRAINS[terr.terrain].territory).map(([k, v]) => `${k} +${Math.round(v * 100)}%`).join(', ')}</div><button class="mini ghost" data-action="abandon">Abandonner</button></div>`;
  } else if (!poi || !['capital', 'town', 'kingdom', 'boss'].includes(POI_TYPES[poi.type].kind)) {
    const c = canClaim(s, x, y, now);
    const bonus = TERRAINS[ter].territory;
    html += `<div class="panel-sub"><h4>🚩 Avant-poste</h4><div class="small">Bonus de terrain : ${Object.entries(bonus).map(([k, v]) => `${k} +${Math.round(v * 100)}%`).join(', ')} · ${Object.keys(s.territories).length}/${territoryLimit(s, mods)}</div>
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
      <button class="btn primary" data-action="caravan">Envoyer</button></div>`;
}

// ---------- Fenêtre d'envoi de marche ----------
function marchDialog(app, type) {
  const s = app.state;
  const { x, y } = app.ui.worldSel;
  const poi = poiAt(s.world, x, y);
  const md = app.ui.marchDraft = { type, x, y, units: {}, heroId: null, formation: 'balanced', supply: false, potion: '' };
  // Pré-sélection intelligente
  if (type === 'explore' || type === 'scout') md.units.scout = Math.min(s.army.scout || 0, type === 'scout' ? 2 : 1);
  else for (const [u, n] of Object.entries(s.army)) if (n > 0 && u !== 'scout') md.units[u] = n;
  const idle = s.heroes.filter((h) => !h.marchId && !h.assignment);
  const best = idle.sort((a, b) => b.level - a.level)[0];
  if (best && type !== 'explore') md.heroId = best.id;
  if (type === 'explore') md.heroId = idle.find((h) => h.cls === 'explorer')?.id || null;
  const unitsAvail = Object.entries(s.army).filter(([, n]) => n > 0);
  const potions = Object.entries(s.inventory.consumables).filter(([k, n]) => n > 0 && CONSUMABLES[k].march);
  const fights = ['attack', 'boss', 'gather'].includes(type);
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
        <canvas id="world-canvas"></canvas>
        <div class="map-tools"><button class="mini" data-action="zoom" data-z="1.2">＋</button><button class="mini" data-action="zoom" data-z="0.83">－</button><button class="mini" data-action="center" title="Centrer sur la capitale">🏰</button>${app.state.boss ? '<button class="mini warn" data-action="goto-boss" title="Boss mondial">🐉</button>' : ''}</div>
      </div>
      <div class="world-panel card" id="world-panel">${tilePanel(app)}</div>
    </div>`;
  },
  after(app) { bindCanvas(app); requestAnimationFrame(() => drawMap(app)); },
  tick(app) { drawMap(app); },
  actions: {
    zoom: (app, el) => { const c = cam(app); c.zoom = Math.max(0.5, Math.min(2.4, c.zoom * +el.dataset.z)); drawMap(app); },
    center: (app) => { const c = cam(app); c.x = app.state.world.capital.x + 0.5; c.y = app.state.world.capital.y + 0.5; drawMap(app); },
    'goto-boss': (app) => { const c = cam(app), b = app.state.boss; if (!b) return; c.x = b.x + 0.5; c.y = b.y + 0.5; app.ui.worldSel = { x: b.x, y: b.y }; app.render(); },
    march: (app, el) => marchDialog(app, el.dataset.type),
    claim: (app) => app.act(() => claimTerritory(app.state, app.ui.worldSel.x, app.ui.worldSel.y), 'Avant-poste établi'),
    abandon: (app) => app.act(() => abandonTerritory(app.state, app.ui.worldSel.x, app.ui.worldSel.y)),
    'cv-res': (app, el) => { app.ui.cvRes = el.value; },
    caravan: (app) => {
      const res = document.getElementById('cv-res').value;
      const qty = +document.getElementById('cv-qty').value;
      const rep = document.getElementById('cv-repeat').checked;
      app.act(() => sendCaravan(app.state, app.ui.worldSel.x, app.ui.worldSel.y, res, qty, rep), (r) => `🐪 Caravane partie (gain prévu : ${fmt(r.gold)} or)`);
    },
  },
};
