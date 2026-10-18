// v16 — Interface du château : la ville devient le menu.
//  - Anneau autour d'un bâtiment (Ouvrir, Améliorer, Accélérer, Infos) ;
//  - terrains vagues : panneaux des bâtiments « menu » pas encore construits ;
//  - carte « Château » sous la carte : enceinte (agrandir, réduire), muraille et douves, flancs et outils de défense,
//    réparation, bâtiments mal placés (déménagement gratuit), décorations utiles ;
//  - fenêtre « Lieux » (touche / ou Ctrl + K) : tous les écrans et bâtiments, recherche, clavier, « Voir sur la carte ».
import { BUILDINGS } from '../data/buildings.js';
import { ZONES, FLANKS, ASSAULT_FLANKS, DEFENSE_TOOLS, BUILDING_SCREENS, DECO_FX, FLANK_RULES, CASTLE_STAGES } from '../data/castle.js';
import { COSMETICS } from '../data/social.js';
import {
  rectOf, rectW, rectH, perimeter, wallFactor, zoneAt, ruleText, zoneFx, enlargePreview, enlargeEnceinte, shrinkPreview, shrinkEnceinte,
  breachChance, setFlanks, flankBonus, setTool, castleState, repairCost, repairWall, misplaced, freeMoveActive, decoEffects, vacantLots,
  castleStage, wallStyle, maxDims,
} from '../systems/castle.js';
import { pay } from '../systems/economy.js';
import { buildRequirement, upgradeCheck } from '../systems/construction.js';
import { thLevel } from '../systems/city.js';
import { castleName } from '../systems/identity.js';
import { esc, costList, countdown } from './components.js';
import { fmtTime } from '../core/util.js';
import { PLACES, MAP_SCREENS } from '../data/places.js';
import { placeBuilding } from '../systems/places.js';

const SIDE_NAME = { n: 'nord', s: 'sud', e: 'est', w: 'ouest' };
const pctS = (v) => `${v > 0 ? '+' : ''}${Math.round(v * 100)} %`;

// ───────── Écrans d'un bâtiment ─────────
export const screensOf = (type) => BUILDING_SCREENS[type] || [];
export function screenButtons(app, type, cls = 'mini') {
  return screensOf(type).map((id) => {
    const v = app.views[id];
    if (!v) return '';
    const l = v.locked?.(app);
    return `<button class="${cls}" data-action="nav" data-view="${id}" ${l ? `disabled title="${esc(l)}"` : ''}>${v.icon} ${esc(v.title)}${l ? ' 🔒' : ''}</button>`;
  }).join('');
}
const firstOpen = (app, type) => screensOf(type).find((id) => app.views[id] && !app.views[id].locked?.(app)) || null;

// ───────── Anneau autour d'un bâtiment ou d'un terrain vague ─────────
export function ringHtml(app, b, lot = null) {
  const s = app.state;
  if (lot) {
    const def = BUILDINGS[lot.type];
    const req = buildRequirement(s, lot.type);
    const open = firstOpen(app, lot.type);
    return `<div class="ring" role="menu" aria-label="${esc(def.name)} (à bâtir)">
      <button class="ring-btn r-top" role="menuitem" data-action="lot-build" data-type="${lot.type}" data-x="${lot.x}" data-y="${lot.y}" ${req ? `disabled title="${esc(req)}"` : `title="Bâtir ${esc(def.name)} ici"`}>🔨<span>Bâtir</span></button>
      <button class="ring-btn r-right" role="menuitem" data-action="${open ? 'nav' : 'ring-info'}" ${open ? `data-view="${open}"` : ''} title="${open ? 'Ouvrir' : 'Ce que ce bâtiment débloquera'}">${open ? '🚪' : 'ℹ'}<span>${open ? 'Ouvrir' : 'Infos'}</span></button>
      <button class="ring-btn r-left" role="menuitem" data-action="ring-info" title="Informations">📜<span>Infos</span></button>
      <button class="ring-btn r-bottom" role="menuitem" data-action="ring-close" title="Fermer (Échap)">✕<span>Fermer</span></button></div>`;
  }
  if (!b || b.type === 'road') return '';
  const isDeco = b.type === 'deco';
  const q = s.queues.build.find((qq) => qq.bid === b.id);
  const u = !isDeco && !q && b.level > 0 ? upgradeCheck(s, b.id) : null;
  const open = isDeco ? null : firstOpen(app, b.type);
  const upBtn = isDeco ? `<button class="ring-btn r-top" role="menuitem" data-action="move" data-id="${b.id}">↔<span>Déplacer</span></button>`
    : q ? `<button class="ring-btn r-top" role="menuitem" data-action="speedup-open" data-id="${q.id}" title="Accélérer le chantier (${fmtTime(q.end - Date.now())})">⏳<span>Accélérer</span></button>`
      : `<button class="ring-btn r-top" role="menuitem" data-action="upgrade" data-id="${b.id}" ${u && ['ready', 'queue'].includes(u.status) ? '' : `disabled title="${esc(u?.reasons?.[0] || 'Indisponible')}"`}>⬆<span>Améliorer</span></button>`;
  return `<div class="ring" role="menu" aria-label="${esc(isDeco ? COSMETICS[b.deco]?.name || '' : BUILDINGS[b.type]?.name || '')}">
    ${upBtn}
    <button class="ring-btn r-right" role="menuitem" data-action="${open ? 'nav' : 'ring-info'}" ${open ? `data-view="${open}"` : ''} ${!open && screensOf(b.type).length ? 'title="Écran encore verrouillé : voir Infos"' : ''}>${open ? '🚪' : 'ℹ'}<span>${open ? 'Ouvrir' : 'Infos'}</span></button>
    <button class="ring-btn r-left" role="menuitem" data-action="ring-info" title="Informations">📜<span>Infos</span></button>
    ${!isDeco && b.type !== 'townhall' && b.level > 0 && !q ? `<button class="ring-btn r-bl" role="menuitem" data-action="move" data-id="${b.id}" title="Déplacer">↔<span>Déplacer</span></button>` : ''}
    <button class="ring-btn r-br" role="menuitem" data-action="ring-close" title="Fermer (Échap)">✕<span>Fermer</span></button></div>`;
}

// Panneau d'un terrain vague (tiroir)
export function lotPanel(app, lot) {
  const s = app.state;
  const def = BUILDINGS[lot.type];
  const req = buildRequirement(s, lot.type);
  return `<h3>🪧 Terrain vague : ${def.icon} ${esc(def.name)}</h3>
    <p class="muted">${esc(def.desc)}</p>
    <div class="small">${ZONES[zoneAt(s, lot.x, lot.y)].icon} ${esc(ZONES[zoneAt(s, lot.x, lot.y)].name)} · ${esc(ruleText(lot.type))}</div>
    ${screensOf(lot.type).length ? `<div class="panel-sub"><h4>Ce lieu ouvrira</h4><div class="row gap wrap">${screenButtons(app, lot.type)}</div><div class="small muted">Les écrans déjà accessibles s’ouvrent dès maintenant ; le bâtiment les rendra visibles dans votre ville.</div></div>` : ''}
    ${req ? `<div class="req">${esc(req)}</div>` : `<button class="btn primary" data-action="lot-build" data-type="${lot.type}" data-x="${lot.x}" data-y="${lot.y}">🔨 Bâtir ici</button>`}`;
}

// Infos de zone d'un bâtiment (fiche)
export function zoneBlock(app, b) {
  const s = app.state;
  if (b.type === 'road') return '';
  const z = zoneAt(s, b.x, b.y);
  if (b.type === 'deco') {
    const d = decoEffects(s).list.find((x) => x.id === b.id);
    return `<div class="panel-sub zone-block"><b>${ZONES[z].icon} ${esc(ZONES[z].name)}</b> · ${d?.active ? `✔ ${esc(d.text)}` : `✗ ${esc(d?.text || '')}${DECO_FX[z] ? ' (inactive : trop de décorations ou rien autour)' : ''}`}</div>`;
  }
  const fx = zoneFx(s, b);
  const bad = misplaced(s).some((x) => x.id === b.id);
  return `<div class="panel-sub zone-block"><b>${ZONES[z].icon} ${esc(ZONES[z].name)}</b> · <span class="small">${esc(ruleText(b.type))}</span>
    ${fx ? `<div class="small ${fx.prod < 0 ? 'warn-text' : 'ok'}">${fx.prod < 0 ? '✗' : '✔'} ${esc(fx.text)}</div>` : ''}
    ${bad ? `<div class="small warn-text">⚠️ Mal placé au regard des nouvelles règles : il reste actif. ${freeMoveActive(s) ? `Déménagement gratuit encore ${countdown(s.castle.freeMoveUntil)}.` : ''}</div>` : ''}
    ${z !== 'keep' && s.city.fort.wall > 0 ? '<div class="small muted">Hors les murs : premier exposé aux pillards.</div>' : z === 'keep' ? '<div class="small muted">Intra-muros : à l’abri des pillards tant que la muraille tient.</div>' : ''}
    ${screensOf(b.type).length ? `<div class="row gap wrap">${screenButtons(app, b.type)}</div>` : ''}</div>`;
}

// ───────── Carte « Château » (sous la carte) ─────────
export function castleCard(app) {
  const s = app.state, C = castleState(s), r = rectOf(s);
  const st = castleStage(s), wl = s.city.fort.wall || 0, ml = s.city.fort.moat || 0;
  const nextSt = CASTLE_STAGES.find((x) => x.th > thLevel(s));
  const mx = maxDims(s);
  const sides = ['n', 's', 'w', 'e'].map((k) => {
    const p = enlargePreview(s, k), sh = shrinkPreview(s, k);
    return `<div class="enc-side"><b>${SIDE_NAME[k]}</b>
      ${p.ok ? `<button class="mini" data-action="enc-grow" data-side="${k}" title="Périmètre ${p.perimeter} → facteur de muraille ×${p.factor.toFixed(2)}${p.trapped.length ? ` — ${p.trapped.length} bâtiment(s) se retrouveraient dans la cour alors qu’ils n’y ont pas leur place` : ''}">＋ ${costList(p.cost, s)}</button>` : `<span class="small muted">${esc(p.reason)}</span>`}
      ${sh.ok ? `<button class="mini ghost" data-action="enc-shrink" data-side="${k}" title="Réduire (gratuit)">－</button>` : ''}</div>`;
  }).join('');
  const f = C.flanks;
  const flankRow = Object.entries(FLANKS).map(([k, d]) => `<label class="flank"><span>${d.icon} ${esc(d.name)}</span><input type="range" min="0" max="100" step="5" value="${Math.round((f[k] || 0) * 100)}" data-change="flank" data-k="${k}" aria-label="Part de la garnison : ${esc(d.name)}"><b>${Math.round((f[k] || 0) * 100)} %</b>${ASSAULT_FLANKS.includes(k) ? `<span class="small ${flankBonus(s, k) >= 0 ? 'ok' : 'warn-text'}">si attaqué : ${pctS(flankBonus(s, k))}</span>` : '<span class="small muted">renforce le flanc attaqué à moitié</span>'}</label>`).join('');
  const raid = (s.raids || [])[0];
  const tools = Object.entries(DEFENSE_TOOLS).map(([k, d]) => `<label class="tool"><span>${d.icon} ${esc(d.name)}</span>
    <select data-change="tool" data-k="${k}" ${wl < d.needWall ? `disabled title="Muraille niv. ${d.needWall} requise"` : ''} aria-label="${esc(d.name)} : flanc">
      <option value="">— en réserve —</option>${ASSAULT_FLANKS.map((fl) => `<option value="${fl}" ${C.tools[k] === fl ? 'selected' : ''}>${esc(FLANKS[fl].name)}</option>`).join('')}</select>
    <span class="small muted">${esc(d.text)} · ${costList(d.cost(Math.max(1, thLevel(s))), s)} par usage${wl < d.needWall ? ` · muraille niv. ${d.needWall}` : ''}</span></label>`).join('');
  const bad = misplaced(s);
  const deco = decoEffects(s);
  return `<div class="card castle-card"><h3>🏰 ${esc(castleName(s))} <span class="muted small">${esc(st.name)}${nextSt ? ` · prochain palier : ${esc(nextSt.name)} (HdV ${nextSt.th})` : ''}</span></h3>
    <div class="castle-cols">
      <div><h4>Enceinte</h4>
        <div class="small">${rectW(r)} × ${rectH(r)} cases · périmètre <b>${perimeter(r)}</b> segments · facteur de muraille <b>×${wallFactor(s).toFixed(2)}</b> <span class="muted">(maximum ${mx.w} × ${mx.h} pour ce domaine)</span></div>
        <div class="small muted">Compacte = mieux défendue ; étendue = plus de place dans la cour, mais une muraille plus longue à tenir. Agrandir coûte selon les segments ajoutés et le niveau de la muraille.</div>
        <div class="enc-sides">${sides}</div>
        <div class="small">Muraille : <b>${wl ? `${esc(wallStyle(wl).name)} niv. ${wl}` : 'aucune (enceinte projetée)'}</b>${ml ? ` · douves niv. ${ml}` : ''} · chance de brèche si un raid l’emporte : <b>${Math.round(breachChance(s) * 100)} %</b></div>
        ${C.wallDmg > 0 ? `<div class="panel-sub damaged small">🧱 Muraille abîmée à ${Math.round(C.wallDmg * 100)} % (bonus de muraille ${pctS(-0.25 * C.wallDmg)}) · les maçons réparent 10 % par heure. ${costList(repairCost(s), s)} <button class="mini primary" data-action="wall-repair">Réparer tout de suite</button></div>` : ''}
      </div>
      <div><h4>Défense par flancs</h4>
        <div class="small muted">Répartissez la garnison. Les assaillants choisissent un flanc (souvent le plus dégarni) ; une tour de garde niv. ${FLANK_RULES.revealWatchtower} révèle lequel à l’avance.</div>
        ${raid ? `<div class="small ${raid.flankSeen ? 'warn-text' : 'muted'}">🚨 ${esc(raid.name)} arrive dans ${countdown(raid.arrive)} · ${raid.flankSeen ? `flanc visé : <b>${esc(FLANKS[raid.flank]?.name || '?')}</b>` : 'flanc visé inconnu (tour de garde niv. 5)'}</div>` : ''}
        <div class="flanks">${flankRow}</div>
        <div class="row gap"><button class="mini ghost" data-action="flank-reset">Répartition égale</button></div>
        <h4>Outils de défense</h4><div class="tools">${tools}</div>
      </div>
    </div>
    ${bad.length ? `<div class="panel-sub small"><b>⚠️ ${bad.length} bâtiment(s) mal placé(s)</b> au regard des zones (ils restent actifs) : ${bad.slice(0, 8).map((b) => `<button class="mini ghost" data-action="goto-tile" data-x="${b.x}" data-y="${b.y}">${esc(BUILDINGS[b.type]?.name || b.type)}</button>`).join(' ')}${bad.length > 8 ? ' …' : ''} ${freeMoveActive(s) ? `<span class="ok">Déménagement gratuit encore ${countdown(C.freeMoveUntil)}.</span>` : ''}</div>` : ''}
    ${deco.list.length ? `<div class="small">🗿 Décorations : ${deco.count.faubourg} active(s) dans les faubourgs (moral des ouvriers +${deco.mods['worker.morale'] || 0}), ${deco.count.keep} dans la cour (moral de la garnison +${deco.mods['combat.morale'] || 0}).</div>` : ''}
  </div>`;
}

export const castleActions = {
  'enc-grow': (app, el) => app.act(() => enlargeEnceinte(app.state, el.dataset.side, (c) => pay(app.state, c)), (r) => `L’enceinte s’agrandit vers le ${SIDE_NAME[el.dataset.side]}${r.trapped ? ` (${r.trapped} bâtiment(s) mal placé(s) dans la cour)` : ''}`),
  'enc-shrink': (app, el) => app.act(() => shrinkEnceinte(app.state, el.dataset.side), 'Enceinte resserrée'),
  'wall-repair': (app) => app.act(() => repairWall(app.state, (c) => pay(app.state, c)), 'Muraille réparée'),
  'flank-reset': (app) => app.act(() => setFlanks(app.state, { left: 1, front: 1, right: 1, yard: 1 }), 'Répartition égale'),
  flank: (app, el) => {
    const f = { ...castleState(app.state).flanks };
    const k = el.dataset.k, v = Math.max(0, Math.min(1, +el.value / 100));
    // Le curseur fixe la part du flanc ; les autres se partagent le reste au prorata
    const others = Object.keys(f).filter((x) => x !== k), rest = others.reduce((a, x) => a + f[x], 0);
    for (const x of others) f[x] = rest > 0 ? (f[x] / rest) * (1 - v) : (1 - v) / others.length;
    f[k] = v;
    app.act(() => setFlanks(app.state, f), null);
  },
  tool: (app, el) => app.act(() => setTool(app.state, el.dataset.k, el.value || null), el.value ? 'Outil posté' : 'Outil remis en réserve'),
  // Voir sur la carte : zoom automatique sur le bâtiment (utile sur téléphone), anneau ouvert
  'goto-tile': (app, el) => { app.closeModal(); app.ui.citySel = { x: +el.dataset.x, y: +el.dataset.y }; app.ui.ringOpen = true; app.ui.cityFocus = { x: +el.dataset.x, y: +el.dataset.y }; app.go('city'); },
};

// ───────── Fenêtre « Lieux » : tous les écrans et bâtiments, au clavier ─────────
export function placesList(app) {
  // v16 : la table des lieux (data/places.js) fait foi ; chaque écran apparaît une fois, sous son lieu principal
  const s = app.state;
  const items = [];
  const seen = new Set();
  const lots = vacantLots(s);
  for (const [key, p] of Object.entries(PLACES)) {
    const def = p.kind === 'building' ? BUILDINGS[p.type] : null;
    if (p.kind === 'building' && !def) continue;
    const b = def ? placeBuilding(s, key) || Object.values(s.city.buildings).find((x) => x.type === p.type) : null;
    const lot = def ? lots.find((l) => l.type === p.type) : null;
    for (const id of p.screens) {
      const v = app.views[id];
      if (!v || seen.has(id) || MAP_SCREENS.includes(id) && id === 'city') continue;
      items.push({ key: `${key}:${id}`, view: id, title: v.title, icon: v.icon, place: def ? def.name : p.name, placeIcon: def ? def.icon : p.icon, built: def ? !!b : true, at: b || lot || null, locked: v.locked?.(app) || null });
      seen.add(id);
    }
  }
  return items;
}
export function openPlaces(app) {
  const all = placesList(app);
  app.modal(`<h2>📍 Lieux du royaume</h2>
    <p class="small muted">Tous les écrans du jeu, par bâtiment. Tapez pour filtrer · ↑ ↓ pour choisir · Entrée pour ouvrir · « Voir » centre la carte sur le bâtiment.</p>
    <input id="places-q" class="places-q" type="search" placeholder="Rechercher : marché, armée, recherche…" aria-label="Rechercher un lieu" autocomplete="off">
    <ul class="places" id="places-list" role="listbox">${all.map((it, i) => `<li role="option" class="place ${it.locked ? 'locked' : ''}" data-i="${i}" data-q="${esc(`${it.title} ${it.place || ''}`.toLowerCase())}">
      <button class="place-open" data-action="nav" data-view="${it.view}" ${it.locked ? `title="${esc(it.locked)}"` : ''}>${it.icon} <b>${esc(it.title)}</b>${it.place ? ` <span class="muted small">· ${it.placeIcon} ${esc(it.place)}${it.built ? '' : ' (à bâtir)'}</span>` : ''}${it.locked ? ' <span class="small muted">🔒</span>' : ''}</button>
      ${it.at ? `<button class="mini ghost" data-action="goto-tile" data-x="${it.at.x}" data-y="${it.at.y}" title="Voir sur la carte">🔎 Voir</button>` : ''}</li>`).join('')}</ul>`, {}, 'wide');
  const q = document.getElementById('places-q'), list = document.getElementById('places-list');
  if (!q || !list) return;
  let cur = -1;
  const visible = () => [...list.querySelectorAll('li.place')].filter((li) => !li.hidden);
  const mark = () => { visible().forEach((li, i) => li.classList.toggle('cur', i === cur)); visible()[cur]?.scrollIntoView({ block: 'nearest' }); };
  q.addEventListener('input', () => { const t = q.value.trim().toLowerCase(); list.querySelectorAll('li.place').forEach((li) => { li.hidden = !!t && !li.dataset.q.includes(t); }); cur = visible().length ? 0 : -1; mark(); });
  q.addEventListener('keydown', (e) => {
    const n = visible().length;
    if (e.key === 'ArrowDown') { cur = Math.min(n - 1, cur + 1); mark(); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { cur = Math.max(0, cur - 1); mark(); e.preventDefault(); }
    else if (e.key === 'Enter' && cur >= 0) { visible()[cur]?.querySelector('.place-open')?.click(); e.preventDefault(); }
  });
  q.focus();
}
