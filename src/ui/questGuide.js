// v22 « Le Livre des quêtes » — Guide pas à pas : « Montre-moi » accompagne le joueur jusqu'au bout d'une quête.
// La carte se centre sur le bon endroit, un anneau d'or entoure ce qu'il faut toucher, un gantelet le montre, et une
// bulle du conseiller dit quoi faire (« Étape 2 sur 4 »). Chaque étape a sa cible et sa condition : on avance en
// jouant pour de vrai (le guide ne clique jamais à la place du joueur) ; s'il s'écarte, le guide reprend à la bonne
// étape. Les étapes sont déduites de la quête (construire, améliorer, déblayer, explorer, récolter, combattre,
// former, rechercher, ouvrir un écran). Rien en mouvement réduit : l'anneau ne pulse pas.
import { HUBS, HUB_OF } from '../data/hubs.js';
import { BUILDINGS } from '../data/buildings.js';
import { SCREEN_PLACE, PLACES } from '../data/places.js';
import { POI_TYPES } from '../data/world.js';
import { allBuildings, buildingAt, terrainAt, placementCheck, adjacencyBonus } from '../systems/city.js';
import { buildRequirement, upgradeCheck } from '../systems/construction.js';
import { vacantLots } from '../systems/castle.js';
import { isRevealed } from '../systems/world.js';
import { placeBuilding } from '../systems/places.js';
import { computeMods } from '../systems/modifiers.js';
import { esc } from './components.js';
import { advisorSvg } from './isoArt.js';
import { worldFocus } from './views/world.js';

const Q = (sel) => { const el = document.querySelector(sel); return el && el.getClientRects().length ? el : null; };
// Partie basse d'un bouton de la carte (la case et le volume du bâtiment, pas la marge au-dessus du dessin)
const part = (el, y0) => { if (!el) return null; const r = el.getBoundingClientRect(); return { left: r.left + r.width * 0.12, top: r.top + r.height * y0, width: r.width * 0.76, height: r.height * (1 - y0), right: r.right, bottom: r.bottom }; };
const TAB_OF = { resource: 'prod', food: 'prod', industry: 'prod', military: 'mil', core: 'civ', civic: 'civ', place: 'places', unique: 'places' };
const TAB_NAME = { prod: 'Production', mil: 'Militaire', civ: 'Civil', places: 'Lieux' };
const norm = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’']/g, ' ');
const countType = (s, type) => allBuildings(s).filter((b) => b.type === type && b.level > 0).length;
const queuedType = (s, type) => s.queues.build.some((q) => q.kind === 'build' && (q.type === type || s.city.buildings[q.bid]?.type === type));

// Bâtiment nommé dans un texte (le nom le plus long gagne : « Hôtel de ville » avant « Ville »)
export function buildingInText(text) {
  const t = norm(text);
  let best = null;
  for (const [type, d] of Object.entries(BUILDINGS)) {
    if (d.grid === false || type === 'road') continue;
    const n = norm(d.name);
    if (n.length > 3 && t.includes(n) && (!best || n.length > best.n.length)) best = { type, n };
  }
  return best?.type || null;
}

// Nature d'une quête, déduite de ce qu'elle demande (champ guide explicite, sinon son texte et son écran)
export function questKind(q) {
  if (q.guide) return q.guide;
  const text = `${q.title || ''}. ${q.desc || ''}`, t = norm(text);
  if (q.sel) return { kind: 'tile', x: q.sel.x, y: q.sel.y, upgrade: /amelior|niveau/.test(t) };
  if (q.worldSel) return { kind: 'world', op: /explor|brouillard/.test(t) ? 'explore' : /recolt/.test(t) ? 'gather' : /attaqu|combat|nettoy|camp|vainc|bataille/.test(t) ? 'attack' : null, x: q.worldSel.x, y: q.worldSel.y, view: q.view };
  const type = buildingInText(text);
  if (type && (/amelior/.test(t) || (/niveau \d|niv\. ?\d/.test(t) && !/construis|batiss/.test(t)))) return { kind: 'upgrade', type, level: q.target || 0 };
  if (type && /construis|batiss|construire|batir|etablissez/.test(t)) return { kind: 'build', type };
  if (/decombre|deblay/.test(t)) return { kind: 'clear' };
  if (/explor|brouillard/.test(t)) return { kind: 'world', op: 'explore' };
  if (/recolt/.test(t)) return { kind: 'world', op: 'gather' };
  if (/unites|soldats|formez|forme |eclaireur|lancier|archer/.test(t) && !/remportez|nettoy|vainqu/.test(t)) return { kind: 'train' };
  if (/combat|camp |nettoy|bataille|danger \d|vainqu/.test(t)) return { kind: 'world', op: 'attack', danger: +(/danger (\d)/.exec(t)?.[1] || 1) };
  if (/recherch/.test(t)) return { kind: 'research' };
  if (q.view) return { kind: 'screen', view: q.view };
  return { kind: 'none' };
}

// ───────── Étapes ─────────
// step : { text, target() → élément ou null, done() → vrai quand l'étape est franchie, enter() au premier passage,
//          blocked() → raison si le joueur ne peut pas avancer (ressources, prérequis) }
function cityPrep(app, x, y) {
  if (app.ui.win) app.closeWin(false);
  if (app.ui.map !== 'city') app.ui.map = 'city';
  app.ui.buildMode = false; app.ui.placeType = null;
  if (x !== undefined) app.ui.cityFocus = { x, y };
  app.mapDirty = true; app.render();
}
const tileSel = (x, y) => `#city-vp .tile[data-x="${x}"][data-y="${y}"]`;
const selAt = (app, x, y) => app.ui.citySel?.x === x && app.ui.citySel?.y === y;
function clickTile(app, b, label) {
  return { text: `Touchez « ${label} » dans votre château.`, target: () => part(Q(tileSel(b.x, b.y)), 0.42), done: () => selAt(app, b.x, b.y) && (app.ui.ringOpen || app.ui.win === 'bldg'), enter: () => cityPrep(app, b.x, b.y) };
}
function openScreenSteps(app, view, title) {
  const pk = SCREEN_PLACE[view], p = PLACES[pk];
  const b = p?.kind === 'building' ? placeBuilding(app.state, pk) : null;
  if (b) return [
    clickTile(app, b, BUILDINGS[b.type].name),
    { text: `Choisissez « Ouvrir » pour l’écran « ${title} ».`, target: () => Q(`#city-ring [data-action="nav"][data-view="${view}"]`) || Q('#city-ring [data-action="nav"]'), done: () => app.ui.win === view },
  ];
  // v22b : sinon par son pôle (Économie, Armée, Royaume, Savoir), à côté du globe
  const hk = HUB_OF[view];
  if (hk && typeof document !== 'undefined') return [
    { text: `Ouvrez le pôle « ${HUBS[hk].name} », en bas à droite.`, target: () => Q(`.hud-actions [data-action="hub"][data-k="${hk}"]`), done: () => app.ui.win === view || !!document.querySelector(`#modal-root.open .hub[data-hub="${hk}"]`) },
    { text: `Choisissez « ${title} ».`, target: () => Q(`#modal-root .hub [data-action="nav"][data-view="${view}"]`), done: () => app.ui.win === view },
  ];
  return [{ text: `Ouvrez l’écran « ${title} ».`, target: () => null, done: () => app.ui.win === view, enter: () => app.go(view) }];
}
function bestTile(app, type) {
  const s = app.state, mods = computeMods(s);
  let best = null;
  for (let y = 0; y < s.city.h; y++) for (let x = 0; x < s.city.w; x++) {
    if (buildingAt(s, x, y) || terrainAt(s, x, y) !== 'plain') continue;
    if (!placementCheck(s, type, x, y).ok) continue;
    const v = adjacencyBonus(s, type, x, y, mods).total;
    if (!best || v > best.v) best = { x, y, v };
  }
  return best;
}
function nearestBy(list, from) { return list.sort((a, b) => Math.hypot(a.x - from.x, a.y - from.y) - Math.hypot(b.x - from.x, b.y - from.y))[0] || null; }

export function guideSteps(app, q) {
  const s = app.state, k = questKind(q);
  const th = allBuildings(s).find((b) => b.type === 'townhall');
  if (k.kind === 'build') {
    const def = BUILDINGS[k.type], start = countType(s, k.type);
    const why = () => buildRequirement(s, k.type);
    const built = () => countType(s, k.type) > start || queuedType(s, k.type);
    const lot = vacantLots(s).find((l) => l.type === k.type);
    if (lot) return { kind: k, finished: built, steps: [
      { text: `Le terrain de « ${def.name} » est prêt : touchez son panneau « à bâtir ».`, target: () => part(Q(`#city-vp .tile.lot[data-x="${lot.x}"][data-y="${lot.y}"]`), 0.5), done: () => selAt(app, lot.x, lot.y) && app.ui.ringOpen, enter: () => cityPrep(app, lot.x, lot.y), blocked: why },
      { text: 'Choisissez « Bâtir ».', target: () => Q('#city-ring [data-action="lot-build"]'), done: built, blocked: why },
    ] };
    const tab = TAB_OF[def.cat] || 'prod';
    let spot = null;
    return { kind: k, finished: built, steps: [
      { text: 'Ouvrez le panneau « Construire ».', target: () => Q('.hud-a[data-action="build-mode"]') || Q('[data-action="build-mode"]'), done: () => app.ui.buildMode || app.ui.placeType === k.type, enter: () => cityPrep(app), blocked: why },
      { text: `Choisissez l’onglet « ${TAB_NAME[tab]} ».`, target: () => Q(`.bp-tab[data-k="${tab}"]`), done: () => (app.ui.buildTab || 'prod') === tab || app.ui.placeType === k.type },
      { text: `Choisissez « ${def.name} ».`, target: () => Q(`.bp-item[data-type="${k.type}"]`), done: () => app.ui.placeType === k.type, blocked: why },
      { text: `Touchez la case conseillée (meilleur bonus de voisinage) pour poser « ${def.name} ».`, target: () => (spot ? Q(`.iso-hint[data-x="${spot.x}"][data-y="${spot.y}"]`) : null), done: built,
        enter: () => { spot = bestTile(app, k.type); if (spot) { app.ui.cityFocus = { x: spot.x, y: spot.y }; app.render(); } } },
    ] };
  }
  if (k.kind === 'upgrade' || (k.kind === 'tile' && k.upgrade)) {
    const b = k.kind === 'tile' ? buildingAt(s, k.x, k.y) : allBuildings(s).filter((x) => x.type === k.type && x.level > 0).sort((a, c) => (k.type === 'townhall' ? 0 : a.level - c.level))[0];
    if (!b) return k.kind === 'upgrade' ? guideSteps(app, { ...q, guide: { kind: 'build', type: k.type } }) : { kind: k, steps: [] };
    const lv0 = b.level;
    const going = () => b.level > lv0 || s.queues.build.some((x) => x.bid === b.id);
    const why = () => { const u = upgradeCheck(s, b.id); return u && !['ready', 'queue'].includes(u.status) && !going() ? u.reasons?.[0] || 'Amélioration indisponible' : null; };
    return { kind: k, finished: going, steps: [
      clickTile(app, b, BUILDINGS[b.type].name),
      { text: 'Choisissez « Améliorer ».', target: () => Q(`#city-ring [data-action="upgrade"][data-id="${b.id}"]`) || Q(`#win-root [data-action="upgrade"][data-id="${b.id}"]`), done: going, blocked: why },
    ] };
  }
  if (k.kind === 'tile') {
    const b = buildingAt(s, k.x, k.y);
    return { kind: k, steps: b ? [clickTile(app, b, BUILDINGS[b.type]?.name || 'ce bâtiment')] : [] };
  }
  if (k.kind === 'clear') {
    const rubble = [];
    for (let y = 0; y < s.city.h; y++) for (let x = 0; x < s.city.w; x++) if (terrainAt(s, x, y) === 'rubble' && !s.queues.build.some((qq) => qq.kind === 'clear' && qq.x === x && qq.y === y)) rubble.push({ x, y });
    const r = nearestBy(rubble, th || { x: 0, y: 0 });
    if (!r) return { kind: k, steps: [] };
    const cleared = () => s.queues.build.some((qq) => qq.kind === 'clear' && qq.x === r.x && qq.y === r.y) || terrainAt(s, r.x, r.y) !== 'rubble';
    return { kind: k, finished: cleared, steps: [
      { text: 'Touchez ces décombres.', target: () => part(Q('#city-vp .tile.iso-cursor'), 0.68), done: () => selAt(app, r.x, r.y), enter: () => { cityPrep(app, r.x, r.y); app.ui.cityKeyFocus = { x: r.x, y: r.y }; app.render(); } },
      { text: 'Choisissez « Déblayer ».', target: () => Q(`[data-action="clear"][data-x="${r.x}"][data-y="${r.y}"]`), done: cleared },
    ] };
  }
  if (k.kind === 'world') {
    const w = s.world, cap = w.capital;
    let spot = k.x !== undefined ? { x: k.x, y: k.y } : null;
    if (!spot && k.op === 'explore') {
      const fog = [];
      for (let y = Math.max(0, cap.y - 14); y < Math.min(w.size, cap.y + 15); y++) for (let x = Math.max(0, cap.x - 14); x < Math.min(w.size, cap.x + 15); x++) {
        if (isRevealed(w, x, y)) continue;
        if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([a, c]) => isRevealed(w, x + a, y + c))) fog.push({ x, y });
      }
      spot = nearestBy(fog, cap);
    }
    if (!spot && (k.op === 'gather' || k.op === 'attack')) {
      const pois = Object.values(w.pois).filter((p) => isRevealed(w, p.x, p.y) && !(p.clearedUntil > Date.now())).filter((p) => {
        const d = POI_TYPES[p.type];
        if (!d) return false;
        if (k.op === 'gather') return d.kind === 'gather' && p.amount >= 1 && !s.marches.some((m) => m.x === p.x && m.y === p.y);
        return d.kind === 'danger' && !d.dungeon && (p.danger || 1) >= (k.danger || 1) && (p.danger || 1) <= Math.max(k.danger || 1, 2);
      });
      spot = nearestBy(pois, cap);
    }
    if (!k.op || !spot) return guideSteps(app, { ...q, guide: { kind: 'screen', view: k.view || 'world' } });
    const m0 = s.marches.length + (s.stats.explored || 0) * 0;
    const sent = () => s.marches.some((m) => m.x === spot.x && m.y === spot.y && m.start >= startAt);
    const startAt = Date.now();
    const label = { explore: 'Explorer', gather: 'Récolter', attack: 'Attaquer' }[k.op];
    void m0;
    return { kind: k, finished: sent, steps: [
      { text: 'Ouvrez la carte du monde.', target: () => Q('[data-action="toggle-map"]'), done: () => app.ui.map === 'world', enter: () => { if (app.ui.win) app.closeWin(false); app.render(); } },
      { text: `Voici le lieu conseillé (${spot.x}, ${spot.y}). Choisissez « ${label} ».`, target: () => Q(`#win-root [data-action="march"][data-type="${k.op}"]`), done: () => !!Q('[data-action="send-march"]') || sent(), enter: () => worldFocus(app, spot.x, spot.y) },
      { text: 'Choisissez vos troupes : « Remplissage auto » prend le nécessaire.', blocked: () => (k.op !== 'explore' && !Object.entries(s.army || {}).some(([u, n]) => n > 0 && u !== 'scout' && u !== 'spy') ? 'vous n’avez aucune unité de combat au château ; formez-en d’abord à la caserne' : null), target: () => Q('[data-action="mu-auto"]'), done: () => sent() || !Q('[data-action="mu-auto"]') || Object.values(app.ui.marchDraft?.units || {}).some((n) => n > 0) },
      { text: 'Vérifiez la troupe, puis « Envoyer ».', target: () => Q('[data-action="send-march"]'), done: sent },
    ] };
  }
  if (k.kind === 'train') {
    const t0 = (s.queues.train || []).length, a0 = Object.values(s.army || {}).reduce((a, b) => a + b, 0);
    const trained = () => (s.queues.train || []).length > t0 || Object.values(s.army || {}).reduce((a, b) => a + b, 0) > a0;
    return { kind: k, finished: trained, steps: [...openScreenSteps(app, 'army', 'Armée'),
      { text: 'Choisissez une unité et « Former » (la quantité se règle à côté).', target: () => Q('#win-root [data-action="train"]:not([disabled])'), done: trained }] };
  }
  if (k.kind === 'research') {
    const r0 = (s.queues.research || []).length;
    const started = () => (s.queues.research || []).length > r0;
    return { kind: k, finished: started, steps: [...openScreenSteps(app, 'research', 'Recherche'),
      { text: 'Choisissez une recherche disponible : « Rechercher ».', target: () => Q('#win-root [data-action="research"]:not([disabled])'), done: started }] };
  }
  if (k.kind === 'screen') {
    const v = app.views[k.view];
    if (!v) return { kind: k, steps: [] };
    return { kind: k, steps: openScreenSteps(app, k.view, v.title), info: true };
  }
  return { kind: k, steps: [] };
}

// ───────── Le guide affiché ─────────
const G = { app: null, q: null, plan: null, i: -1, timer: 0, entered: new Set(), el: null, doneAt: 0 };
const calm = () => document.documentElement.classList.contains('reduce-motion') || matchMedia('(prefers-reduced-motion: reduce)').matches;
const HAND = '<svg viewBox="0 0 48 48" width="46" height="46" aria-hidden="true"><path d="M20 4h8v20l6-4c3-2 6 1 4 4l-10 14c-2 3-5 5-9 5h-2c-6 0-9-4-9-9V22c0-2 3-3 5-1l3 3V4Z" fill="#f3d27a" stroke="#2a1a10" stroke-width="2.4" stroke-linejoin="round"/><path d="M20 30h10M20 35h8" stroke="#a87a20" stroke-width="2" stroke-linecap="round"/><path d="M20 4h8v6h-8Z" fill="#c9a54a" stroke="#2a1a10" stroke-width="2"/></svg>';

export const guideActive = () => !!G.plan;
export function startGuide(app, q) {
  stopGuide();
  const plan = guideSteps(app, q);
  G.app = app; G.q = q; G.plan = plan; G.i = -1; G.entered = new Set(); G.doneAt = 0;
  if (!G.el || !G.el.isConnected) {
    // au-dessus de tout (fenêtres et dialogues compris) : le guide gère lui-même ses deux boutons
    G.el = document.createElement('div'); G.el.id = 'qguide'; document.body.appendChild(G.el);
    G.el.addEventListener('click', (ev) => { const b = ev.target.closest('[data-qg]'); if (!b) return; ev.preventDefault(); if (b.dataset.qg === 'book') { stopGuide(); G.app?.go('questbook'); } else stopGuide(); });
  }
  G.el.hidden = false;
  if (app.ui.win) app.closeWin(false);
  if (!plan.steps.length) { bubble(`Pour « ${q.title} » : ${q.desc || ''}`, null, true); return; }
  tick();
  G.timer = setInterval(tick, 160);
}
export function stopGuide() {
  clearInterval(G.timer); G.timer = 0; G.plan = null;
  if (G.el) { G.el.hidden = true; G.el.innerHTML = ''; }
}
function tick() {
  const { app, plan } = G;
  if (!plan || !app) return;
  const finished = plan.finished?.() || false;
  if (finished) {
    if (!G.doneAt) G.doneAt = Date.now();
    bubble(`C’est fait ! « ${G.q.title} » avance. Quand l’objectif est atteint, réclamez la récompense dans le Livre des quêtes.`, null, true, true);
    if (Date.now() - G.doneAt > 7000) stopGuide();
    return;
  }
  // étape courante : la première non franchie (le joueur peut sauter ou revenir en arrière)
  let i = plan.steps.findIndex((st) => !st.done());
  if (i < 0) {
    if (plan.info) { bubble(`Voici l’écran à utiliser pour « ${G.q.title} » : ${G.q.desc || ''}`, null, true, true); if (!G.doneAt) G.doneAt = Date.now(); if (Date.now() - G.doneAt > 9000) stopGuide(); return; }
    i = plan.steps.length - 1;
  }
  const st = plan.steps[i];
  if (!G.entered.has(i)) { G.entered.add(i); try { st.enter?.(); } catch (e) { console.error(e); } }
  G.i = i;
  const why = st.blocked?.();
  bubble(why ? `${st.text} Pour l’instant ce n’est pas possible : ${why}.` : st.text, st.target?.(), false, false, `Étape ${i + 1} sur ${plan.steps.length}`);
}
function bubble(text, target, end = false, good = false, stepTxt = '') {
  const el = G.el;
  if (!el) return;
  const r = target ? (target.getBoundingClientRect ? target.getBoundingClientRect() : target) : null;
  const key = `${text}|${stepTxt}|${r ? [r.left, r.top, r.width, r.height].map(Math.round).join(',') : ''}|${end}`;
  if (el.dataset.k === key) return;
  el.dataset.k = key;
  const vw = innerWidth, vh = innerHeight;
  let ring = '', hand = '', pos = `left:${Math.max(8, vw / 2 - 180)}px;bottom:120px`;
  if (r && r.width) {
    const pad = 6;
    ring = `<div class="qg-ring ${calm() ? '' : 'pulse'}" style="left:${r.left - pad}px;top:${r.top - pad}px;width:${r.width + pad * 2}px;height:${r.height + pad * 2}px"></div>`;
    const above = r.top > 90;
    const hx = r.left + r.width / 2 - 23, hy = above ? r.top - 52 : r.bottom + 6;
    hand = `<div class="qg-hand ${above ? '' : 'up'} ${calm() ? '' : 'bob'}" style="left:${hx}px;top:${hy}px">${HAND}</div>`;
    // la bulle se place à l'opposé de la cible, sans la couvrir
    const bx = Math.min(vw - 372, Math.max(8, r.left + r.width / 2 - 180));
    pos = r.top > vh / 2 ? `left:${bx}px;top:${Math.max(70, r.top - 210)}px` : `left:${bx}px;top:${Math.min(vh - 170, r.bottom + 64)}px`;
  }
  el.innerHTML = `${ring}${hand}<div class="qg-bubble ${good ? 'good' : ''}" role="status" aria-live="polite" style="${pos}">
    <div class="qg-adv">${advisorSvg(44)}</div><div class="qg-txt">${stepTxt ? `<div class="qg-step">${esc(stepTxt)} · ${esc(G.q?.title || '')}</div>` : ''}<div>${esc(text)}</div>
    <div class="qg-btns">${end ? '<button class="mini primary" data-qg="book">Livre des quêtes</button>' : ''}<button class="mini ghost" data-qg="stop">${end ? 'Fermer' : 'Arrêter le guide'}</button></div></div></div>`;
}
export const guideActions = {
  'qguide-stop': () => stopGuide(),
  'qguide-book': (app) => { stopGuide(); app.go('questbook'); },
};
