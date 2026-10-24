import { paintedThumb } from '../paint/thumbs.js';
import { hospiceBlock, relicBlock, decoAuraBlock } from '../realmUi.js';
import { drawerHtml, drawerOpen, fitStage } from '../stage.js';
import { sceneState, groundKey } from '../../systems/scene.js';
import { paintCityGround, gfxOf } from '../atlas.js';
import { sceneLayersHtml, sceneClasses, updateSceneFx, localHour } from '../sceneFx.js';
import { fireRisk, riskBand, floodZone } from '../../systems/hazards.js';
import { speedupLine } from '../speedups.js';
import { BUILDINGS, BUILDING_CATEGORIES, levelProdFactor } from '../../data/buildings.js';
import { ORIENTS, MONUMENT_STAGES } from '../../data/monument.js';
import { setOrientation } from '../../systems/monument.js';
import { resIcon } from '../icons.js';
import { RESOURCES } from '../../data/resources.js';
import { COSMETICS } from '../../data/social.js';
import { fmt, fmtTime } from '../../core/util.js';
import { computeMods } from '../../systems/modifiers.js';
import { buildingRates, netRates, storageCap, protectedAmount, recipeOf, roadConnected, sectorOfBuilding, missing } from '../../systems/economy.js';
import { repairBuilding, repairCost, repairAll } from '../../systems/automation.js';
import { nextDomainStep, expandDomain, DOMAIN_GROW } from '../../systems/domain.js';
import { WORK_SECTORS } from '../../data/workers.js';
import { allBuildings, buildingAt, terrainAt, adjacencyBonus, placementCheck, thLevel, levelOf, proximityEffects } from '../../systems/city.js';
import { startBuild, startUpgrade, startClear, buildRequirement, getUpgradeInfo, moveBuilding, demolish, moveCost, CLEAR_COST, placeDeco, planConstruction, upgradeCheck, upgradeSummary } from '../../systems/construction.js';
import { castleName } from '../../systems/identity.js';
import { ERAS, eraOf, TH_MILESTONES, thRequirements } from '../../data/eras.js';
import { ensureArtDefs, buildingSvg, buildingIcon, terrainSvg, plainVariant, roadSvg, upIcon } from '../art.js';
import { openUpgradeList, openRenameCastle } from '../upgrades.js';
import { frameOf, placeStyle, hitClip, artHeight, raidColumnHtml, keepBox, diamondPath } from '../isoView.js';
import { trophyIso, isoInline } from '../isoArt.js';
import { tileCenter, depth, LAYER, tileAt as isoTileAt, toScreen } from '../../systems/iso.js';
import { FAMILY_OF, COUNTRY_ONLY } from '../../data/castle.js';
import { decoDef, placeTrophy, trophiesToPlace, nextTrophies } from '../../systems/trophies.js';
import { titleOf } from '../../systems/nobility.js';
import { readyHarvests, collectHarvest } from '../../systems/harvest.js';
import { heraldryOf, colorOf } from '../../systems/heraldry.js';
import { undoReorganize, enlargeCastle, enlargePreview, nextEncStage } from '../../systems/castle.js';
import { TROPHIES } from '../../data/trophies.js';
import { cityItems, groundOpts, attachPaint, paintRes, lifeData, paintFx } from '../paint/cityPaint.js';
import { mountLife, lifeRedraw } from '../paint/life.js';
import { flyGains } from '../juice.js';
import { lifeDensity } from '../../systems/life.js';
import { groundMatrix } from '../../systems/iso.js';
import { gateOf, alleeTiles, rectOf, fortLevel as fortLvl } from '../../systems/castle.js';
import { openPlans } from '../plansUi.js';
import { cityBubbles, heroPosts } from '../../systems/bubbles.js';
import { buildingSignals, SIGNAL_NAME, sizeTier, variantOf, quarterSides } from '../../systems/mapSignals.js';
import { SHORT_NAMES } from '../../data/labels.js';
import { LAYERS, layerValues } from '../../systems/layers.js';
import { ringHtml, lotPanel, zoneBlock, castleCard, castleActions, screenButtons, openPlaces } from '../castleUi.js';
import { ruleText } from '../../systems/castle.js';
import { vacantLots, zoneAt, castleStage, wallStyle, freeMoveActive as freeMove } from '../../systems/castle.js';
import { FLANKS, ZONES } from '../../data/castle.js';
import { armyTotals, pay } from '../../systems/economy.js';
import { ghosts, ghostAt, addGhost, removeGhost, clearGhosts, pruneGhosts, futureStages, ARCH } from '../../systems/architect.js';
import { filmPlan } from '../../systems/film.js';
import { savePhoto, PHOTO_HOURS, PHOTO_SEASONS } from '../photo.js';
import { autoPlaceTrophies } from '../../systems/trophies.js';

// v20 : scène affichée (heure et saison du mode photo si elles sont choisies)
function cityScene(app) {
  const ph = app.ui.photo;
  const sc = sceneState(app.state, Date.now(), ph?.hour ?? localHour());
  if (!ph?.season) return sc;
  return { ...sc, season: ph.season, winter: ph.season === 'winter', autumn: ph.season === 'autumn' };
}
const WIND = { clear: 1, rain: 2, fog: 0, storm: 3, snow: 1, heat: 0 };

// File pleine : le chantier est planifié et démarrera seul (ressources payées au démarrage)
const orPlan = (s, r, item) => (r.ok === false && /File de construction pleine/.test(r.reason || '') ? planConstruction(s, item) : r);
const planMsg = (label) => (r) => (r.planned ? '🗓️ File pleine : chantier planifié, il démarrera automatiquement' : label);
import { bindPanZoom, zoomAt, fitZoom } from '../panzoom.js';
import { esc, costList, resChips, countdown, progress, pct } from '../components.js';

const TERRAIN_NAME = { forest: 'Forêt', mountain: 'Montagne', river: 'Rivière', rubble: 'Décombres', plain: 'Terrain libre' };
const NEAR_NAME = { forest: 'forêt', mountain: 'montagne', river: 'rivière' };
// Taille réelle d'une case (px au zoom 1). Le zoom (molette, boutons) part de cette taille.
export const CITY_TILE = 64;
const RISK_NAME = { high: 'élevé', mid: 'moyen', low: 'faible', none: 'nul' };

const bName = (b) => (b.type === 'deco' ? COSMETICS[b.deco]?.name : BUILDINGS[b.type]?.name) || '';
const showUpgrades = (s) => s.meta.showUpgrades !== false;

// Données calculées une seule fois par rendu (et non une fois par case)
function cityCtx(app, mods) {
  const s = app.state;
  const at = new Map();
  for (const b of Object.values(s.city.buildings)) at.set(b.x + ',' + b.y, b);
  const q = new Map();
  for (const it of s.queues.build) q.set(it.kind === 'clear' ? `c:${it.x},${it.y}` : it.bid, it);
  const up = new Map();
  for (const u of upgradeSummary(s, mods).list) if (!u.fort) up.set(u.bid, u);
  const planned = new Set((s.queues.planned || []).map((p) => p.bid).filter(Boolean));
  // v14 : aperçu des risques (incendie selon le voisinage, zone inondable) — calculé seulement s'il est affiché
  const risk = app.ui.cityRisk ? new Map(Object.values(s.city.buildings).map((b) => [b.id, riskBand(fireRisk(s, b))])) : null;
  const flood = app.ui.cityRisk ? new Set(floodZone(s).map((b) => b.id)) : null;
  // v15 : ce que la carte doit montrer (feu, crue, sécheresse, saison, signes), d'après l'état réel
  const scene = cityScene(app);
  const burning = new Set(scene.burning), flooded = new Set(scene.floodIds), charred = new Set(scene.damaged);
  // v16 : terrains vagues (bâtiments « menu » à bâtir), forge au travail, foule du marché selon les caravanes
  const lots = new Map(vacantLots(s).map((l) => [l.x + ',' + l.y, l]));
  const crafting = (s.queues.craft || []).length > 0;
  const crowd = Math.min(5, (s.caravans || []).length * 2 + ((s.market?.trades || 0) > 0 ? 1 : 0));
  // v16 : bulles (ce qui attend le joueur) et héros à leur poste, sauf en mode Construire
  const quiet = app.ui.buildMode || app.ui.placeType || app.ui.moveId;
  const bubbles = new Map(quiet ? [] : cityBubbles(s, mods).map((b) => [b.bid, b]));
  const posts = quiet ? new Map() : heroPosts(s);
  // v17 : aperçu d'un plan de ville (cases d'arrivée en pointillé, bâtiments qui partent estompés)
  const pv = app.ui.planPreview;
  const planTo = new Map(), planFrom = new Set();
  if (pv) for (const [id, [px, py]] of Object.entries(pv)) { const b = s.city.buildings[id]; if (b && (b.x !== px || b.y !== py)) { planTo.set(px + ',' + py, b.type); planFrom.add(id); } }
  // v17 : calque d'information choisi (production, incendie, défense, placement, zones)
  const layer = app.ui.layer && LAYERS[app.ui.layer] ? layerValues(s, app.ui.layer, mods) : null;
  const signals = quiet ? new Map() : buildingSignals(s, { bubbles: [...bubbles.values()], upgrades: up, burning, flooded, showUpgrades: showUpgrades(s), mods });
  // v17 : une seule case de la carte dans l'ordre de tabulation (la dernière choisie au clavier, sinon l'hôtel de ville)
  const kf = app.ui.cityKeyFocus || app.ui.citySel || Object.values(s.city.buildings).find((b) => b.type === 'townhall');
  const rove = kf ? kf.x + ',' + kf.y : '';
  const glow = app.ui.glow && app.ui.glow.until > Date.now() ? new Set(app.ui.glow.ids) : null;
  // v20 : bâtiments au travail (fumée, ailes et roues qui tournent) : produisent, sans pause, manque ni entrepôt plein
  const active = new Set();
  for (const b of Object.values(s.city.buildings)) {
    if (b.level <= 0 || b.paused || b.starved || b.capped || b.damaged || burning.has(b.id) || flooded.has(b.id)) continue;
    if (['forge', 'armory'].includes(b.type) ? crafting : !signals.get(b.id) || signals.get(b.id).kind !== 'stopped') active.add(b.id);
  }
  const riverSide = (b) => [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => terrainAt(s, b.x + dx, b.y + dy) === 'river');
  return { f: frameOf(s), active, riverSide, glow, layer, rove, planTo, planFrom, s, mods, at, q, up, planned, risk, flood, scene, burning, flooded, charred, lots, crafting, crowd, bubbles, posts, signals, place: app.ui.placeType || (app.ui.moveId && s.city.buildings[app.ui.moveId]?.type), sel: app.ui.citySel };
}

function roadMask(ctx, x, y) {
  const link = (dx, dy) => { const o = ctx.at.get((x + dx) + ',' + (y + dy)); return !!o && o.type !== 'deco'; };
  return { n: link(0, -1), e: link(1, 0), s: link(0, 1), w: link(-1, 0) };
}

// v20 « Ma forteresse » : un bâtiment (ou un terrain vague) posé en isométrique. Bouton à la silhouette du dessin
// (clip-path) ; le z-index suit la profondeur ; le niveau se lit sur la taille du dessin (plus de pastille).
function objHtml(app, b, ctx) {
  const s = ctx.s, f = ctx.f, x = b.x, y = b.y;
  const selected = ctx.sel && ctx.sel.x === x && ctx.sel.y === y;
  const q = ctx.q.get(b.id);
  const cls = ['tile', 'iso-b', 'has-b'];
  let inner = '', label;
  const tier = sizeTier(b.level || 1), v = variantOf(x, y);
  const fam = FAMILY_OF[b.type] || (COUNTRY_ONLY.includes(b.type) ? 'country' : 'places');
  cls.push('fam-' + fam);
  let hgt = artHeight(b.type, tier);
  if (b.type === 'road') { label = 'Route'; hgt = 6; cls.push('iso-flat'); }
  else if (b.type === 'deco') {
    const td = decoDef(b.deco);
    label = td?.name || 'Décoration';
    hgt = td?.trophy ? 90 : 50;
    cls.push(td?.trophy ? 'trophy' : 'deco');
  } else {
    const def = BUILDINGS[b.type];
    label = `${bName(b)} niveau ${b.level}`;
    const active = ctx.active.has(b.id);
    const river = b.type === 'mill' && ctx.riverSide(b);
    void river; void v;
    const major = b.type === 'townhall' || b.type === 'castle' || b.type === 'monument';
    if (major) cls.push('major');
    if (active) cls.push('active');
    const full = b.type === 'townhall' ? castleName(s) : bName(b);
    const post = ctx.posts.get(b.id);
    inner += `<span class="t-name ${major ? 'major' : ''}" title="${esc(full)}">${post ? '🧙 ' : ''}${esc(b.type === 'townhall' ? full : SHORT_NAMES[b.type] || full)}</span>`;
    if (post) label += ` — gouverneur : ${post.map((p) => p.name).join(', ')}`;
    void def;
    // Un seul signal par bâtiment, par priorité ; « Zzz » pour un bâtiment à l'arrêt
    const sg = !q ? ctx.signals.get(b.id) : null;
    if (sg) {
      label += ` — ${SIGNAL_NAME[sg.kind]} : ${sg.text}`;
      const act = sg.action === 'tile-up' ? `data-action="tile-up" data-x="${x}" data-y="${y}"` : sg.action === 'harvest' ? `data-action="harvest" data-id="${b.id}"` : sg.view ? `data-action="nav" data-view="${sg.view}"` : '';
      inner += sg.compact ? `<span class="t-sig sig-${sg.kind} sig-dot" title="${esc(`${sg.text} (comme ${sg.group - 1} autres)`)}" aria-hidden="true"></span>`
        : `<span class="t-sig sig-${sg.kind}${sg.action === 'harvest' ? ' sig-harvest' : ''}" ${act} title="${esc(sg.text)}" aria-hidden="true"><i>${sg.icon}</i>${sg.mark && sg.mark !== '•' && sg.mark !== '!' ? `<b>${esc(sg.mark)}</b>` : ''}</span>`;
      cls.push('has-sig');
    }
    if (ctx.planned.has(b.id)) label += ' — amélioration planifiée';
    const lv = ctx.layer?.get(b.id);
    if (lv) { cls.push('lay', 'lay-' + lv.band); label += ` — ${LAYERS[app.ui.layer].name} : ${lv.label}`; inner += `<span class="t-lay" aria-hidden="true" title="${esc(lv.label)}"></span>`; }
    if ((b.starved || b.damaged) && !sg?.compact) cls.push('st-alert');
    if (b.type === 'market' && ctx.crowd) inner += `<span class="fx-crowd" aria-hidden="true">${'<i></i>'.repeat(ctx.crowd)}</span>`;
    if (ctx.burning.has(b.id)) { cls.push('burning'); inner += `<span class="fx-fire" aria-hidden="true"><i></i><i></i><i></i></span><span class="fx-smoke" aria-hidden="true"></span>`; }
    else if (ctx.charred.has(b.id)) cls.push('charred');
    if (ctx.risk) {
      const rb = ctx.risk.get(b.id);
      if (rb && rb !== 'none') { cls.push('risk-' + rb); label += ` — risque d’incendie ${RISK_NAME[rb]}`; }
      if (ctx.flood.has(b.id)) { cls.push('risk-flood'); label += ' — zone inondable'; }
    }
  }
  if (q) {
    cls.push('st-build');
    inner += `<span class="t-build" title="${q.kind === 'build' ? 'Construction' : 'Amélioration'} en cours">🔨</span>${progress(q.start, q.end)}`;
  }
  if (ctx.glow?.has(b.id)) cls.push('glow-new');
  if (ctx.planFrom.has(b.id)) { cls.push('plan-from'); label += ' — part dans le plan'; }
  if (ctx.flooded.has(b.id)) { cls.push('flooded'); inner += '<span class="fx-water" aria-hidden="true"></span>'; }
  if (selected) cls.push('sel');
  const fl = app.ui.flashTile;
  if (fl && fl.x === x && fl.y === y && fl.until > Date.now()) cls.push('flash-good');
  const gd = app.ui.guide;
  if (gd && gd.x === x && gd.y === y && gd.until > Date.now()) { cls.push('guide'); label += ' — c’est ici'; }
  return `<button class="${cls.join(' ')}" data-action="tile" data-x="${x}" data-y="${y}" style="${placeStyle(f, x, y, b.type === 'road' ? LAYER.ground + 1 : LAYER.building)};--top:${Math.max(0, 168 - hgt)}px" tabindex="${ctx.rove === x + ',' + y ? '0" data-roving="1' : '-1'}" aria-label="${esc(label)} (${x}, ${y}, ${ZONES[zoneAt(s, x, y)].short})"><span class="t-hit" style="${hitClip(hgt)}"></span>${inner}</button>`;
}
// Terrain vague (bâtiment « menu » à bâtir) : panneau dans la cour
function lotHtml(app, lot, ctx) {
  const d = BUILDINGS[lot.type];
  const sel = ctx.sel && ctx.sel.x === lot.x && ctx.sel.y === lot.y;
  return `<button class="tile iso-b lot ${sel ? 'sel' : ''}" data-action="tile" data-x="${lot.x}" data-y="${lot.y}" style="${placeStyle(ctx.f, lot.x, lot.y, LAYER.building)};--top:108px" tabindex="${ctx.rove === lot.x + ',' + lot.y ? '0" data-roving="1' : '-1'}" aria-label="${esc(`Terrain vague : ${d.name} à bâtir (${lot.x}, ${lot.y}, intra-muros)`)}"><span class="t-hit" style="${hitClip(60)}"></span><span class="t-name lot-name">${esc(d.name)} · à bâtir</span></button>`;
}
// Mode Construire : cases où le bâtiment choisi peut aller (bonus de placement), cases interdites marquées d'une croix
function placeHints(app, ctx) {
  const s = ctx.s, f = ctx.f, out = [];
  if (!ctx.place) return '';
  for (let y = 0; y < s.city.h; y++) for (let x = 0; x < s.city.w; x++) {
    if (ctx.at.has(x + ',' + y) || terrainAt(s, x, y) !== 'plain') continue;
    const pc = placementCheck(s, ctx.place, x, y);
    const c = tileCenter(f, x, y);
    if (pc.ok) {
      const adj = adjacencyBonus(s, ctx.place, x, y, ctx.mods).total;
      out.push(`<span class="iso-hint ok ${adj > 0 ? 'pos' : ''}" data-x="${x}" data-y="${y}" style="left:${Math.round(c.sx)}px;top:${Math.round(c.sy)}px;z-index:${depth(x, y, LAYER.ground + 1)}" aria-hidden="true">${adj > 0 ? '+' + Math.round(adj * 100) + '%' : '·'}</span>`);
    } else if (pc.zone && ['keep', 'faubourg'].includes(pc.zone)) out.push(`<span class="iso-hint no" style="left:${Math.round(c.sx)}px;top:${Math.round(c.sy)}px;z-index:${depth(x, y, LAYER.ground + 1)}" title="${esc(pc.reason)}" aria-hidden="true">✕</span>`);
  }
  return out.join('');
}

// Infobulle de survol : nom, niveau, état, production, amélioration et actions possibles
function tipHtml(app, x, y) {
  const s = app.state;
  const mods = computeMods(s);
  const t = terrainAt(s, x, y);
  const b = buildingAt(s, x, y);
  if (!b) {
    const q = s.queues.build.find((qq) => qq.kind === 'clear' && qq.x === x && qq.y === y);
    const what = { plain: 'Clic : construire ici', rubble: q ? 'Déblaiement en cours' : `Clic : déblayer (${CLEAR_COST.food} 🍖, ${CLEAR_COST.gold} 🪙)`, forest: 'Bonus pour scieries, chasseurs, herboristes voisins', mountain: 'Bonus pour carrières et mines voisines', river: 'Bonus pour fermes, moulins, pêcheries voisins' }[t];
    return `<b>${esc(TERRAIN_NAME[t])}</b> <span class="muted">(${x}, ${y})</span><div class="small">${esc(what || '')}</div>`;
  }
  if (b.type === 'deco') return `<b>${COSMETICS[b.deco]?.icon || ''} ${esc(bName(b))}</b><div class="small muted">Décoration</div>`;
  const def = BUILDINGS[b.type];
  const q = s.queues.build.find((qq) => qq.bid === b.id);
  const r = b.level > 0 ? buildingRates(s, b, mods) : null;
  const state = q ? `${q.kind === 'build' ? 'En construction' : `Amélioration vers le niveau ${q.level}`} · ${fmtTime(q.end - Date.now())}`
    : b.damaged ? '🛠️ Endommagé (production −50 %)' : b.starved ? '⚠️ Manque de matières premières' : b.paused ? '⏸ En pause' : '✔ En activité';
  const u = b.type !== 'road' && !q ? upgradeCheck(s, b.id, mods) : null;
  const upLine = !u ? '' : u.status === 'ready' ? `<div class="small ok">⬆ Améliorable vers niv. ${u.next} : ${costList(u.cost, s)}</div>`
    : u.status === 'max' ? '<div class="small muted">Niveau maximum</div>'
      : `<div class="small warn-text">⬆ Niv. ${u.next} indisponible : ${esc(u.reasons[0] || '')}</div>`;
  return `<b>${def.icon} ${esc(b.type === 'townhall' ? castleName(s) : def.name)}</b> <span class="muted">niv. ${b.level}</span>${b.type === 'townhall' ? `<div class="small muted">${esc(def.name)}</div>` : ''}
    <div class="small">${esc(state)}</div>
    ${r && Object.keys(r.out).length ? `<div class="small">Production : ${resChips(r.out)}<span class="muted">/h</span></div>` : ''}${upLine}
    ${b.level > 0 && b.type !== 'road' ? `<div class="small muted">🔥 Risque d’incendie : ${RISK_NAME[riskBand(fireRisk(s, b))]}${floodZone(s).some((x) => x.id === b.id) ? ' · 🌊 zone inondable' : ''}</div>` : ''}
    <div class="small muted">Clic : fiche du bâtiment${u && u.status !== 'max' ? ' · ⬆ : amélioration' : ''}</div>`;
}

// Curseur clavier sur une case vide (les flèches avec Maj avancent case par case)
function cursorHtml(s, f, kf, roving) {
  const t = terrainAt(s, kf.x, kf.y);
  return `<button class="tile iso-cursor" data-action="tile" data-x="${kf.x}" data-y="${kf.y}" style="${placeStyle(f, kf.x, kf.y, LAYER.fx)};--top:160px" tabindex="${roving ? 0 : -1}" ${roving ? 'data-roving="1"' : ''} aria-label="${esc(`${TERRAIN_NAME[t]} (${kf.x}, ${kf.y}, ${ZONES[zoneAt(s, kf.x, kf.y)].short})`)}"><span class="t-hit" style="${hitClip(8)}"></span><svg class="iso-art" viewBox="0 0 128 200" width="128" height="200" aria-hidden="true"><path d="M64 136L128 168L64 200L0 168Z" fill="rgba(255,240,200,.25)" stroke="#ffe9a8" stroke-width="3"/></svg></button>`;
}
const bannerColor = (s) => { const h = heraldryOf(s); return colorOf(s, h.t1); };
// Bulle de récolte au-dessus du château (« Prêt à être collecté ») : un clic récolte tout
function harvestBubble(app) {
  const n = readyHarvests(app.state).length;
  if (!n || app.ui.photo || app.ui.film) return '';
  return `<button class="harvest-bubble" data-action="harvest-all" aria-label="Récolter les bonus de ${n} bâtiment${n > 1 ? 's' : ''}"><b>Ressources bonus</b><span>Prêt à être collecté · ${n}</span></button>`;
}
// Bandeau de la réorganisation (ancienne partie) : aperçu de l'ancienne disposition et annulation, 7 jours
function reorgBar(app) {
  const s = app.state, R = s.castle?.reorg;
  if (!R || !(R.until > Date.now()) || app.ui.reorgHide || app.ui.photo) return '';
  return `<div class="plan-bar reorg-bar" role="status">🏰 Votre ville est entrée dans les murs : ${R.moved} bâtiment${R.moved > 1 ? 's' : ''} déplacé${R.moved > 1 ? 's' : ''}, aucun détruit. Déménagement gratuit encore ${countdown(R.until)}.
    <button class="mini" data-action="reorg-preview" aria-pressed="${!!app.ui.planPreview}">${app.ui.planPreview ? 'Masquer l’ancienne disposition' : 'Voir l’ancienne disposition'}</button>
    <button class="mini ghost" data-action="reorg-undo">Annuler la réorganisation</button> <button class="mini ghost" data-action="reorg-hide" aria-label="Masquer ce bandeau">✕</button></div>`;
}

function buildMenu(app, x, y, mods) {
  const s = app.state;
  const cats = {};
  for (const [type, def] of Object.entries(BUILDINGS)) {
    if (def.grid === false) continue;
    (cats[def.cat] ||= []).push(type);
  }
  const pc = (type) => placementCheck(s, type, x, y);
  return `<h3>Construire en (${x}, ${y})</h3>
    <p class="muted small">Le bonus indiqué dépend des cases voisines (rivière, forêt, montagne, autres bâtiments).</p>
    ${Object.entries(cats).map(([cat, types]) => `<div class="b-cat"><h4>${BUILDING_CATEGORIES[cat]}</h4>
      ${types.map((type) => {
        const def = BUILDINGS[type];
        const req = buildRequirement(s, type);
        const p = pc(type);
        const { cost, time } = getUpgradeInfo(s, type, 1, mods);
        const adj = adjacencyBonus(s, type, x, y, mods);
        const disabled = req || !p.ok;
        return `<div class="b-option ${disabled ? 'disabled' : ''}">
          <div class="b-opt-head"><span class="b-icon">${buildingIcon(type, 34)}</span><b>${esc(def.name)}</b>${adj.total > 0 ? `<span class="bonus-tag">+${Math.round(adj.total * 100)}% ici</span>` : ''}</div>
          <div class="muted small">${esc(def.desc)}</div>
          ${disabled ? `<div class="req">${esc(req || p.reason)}</div>` : `<div class="b-opt-foot">${Object.keys(cost).length ? costList(cost, s) : '<span class="ok small" title="Vous n’en possédez aucun et ne pouvez pas le payer : le premier exemplaire est offert, pour ne jamais rester bloqué sans bois, pierre ou nourriture.">🎁 Offert (secours)</span>'} <span class="muted small">⏱ ${fmtTime(time)}</span>
            <button class="mini primary" data-action="build" data-type="${type}" data-x="${x}" data-y="${y}">Construire</button></div>${(() => { const m = missing(s, cost); return Object.keys(m).length ? `<div class="req small">Manque : ${Object.entries(m).map(([r, v]) => `${fmt(v)} ${resIcon(r, 16, RESOURCES[r]?.icon)} ${esc(RESOURCES[r].name.toLowerCase())}`).join(', ')}</div>` : ''; })()}`}
        </div>`;
      }).join('')}</div>`).join('')}
    ${decoMenu(app, x, y)}`;
}

function decoMenu(app, x, y) {
  const s = app.state;
  const owned = Object.keys(s.meta.owned).filter((k) => COSMETICS[k]?.type === 'deco' && !allBuildings(s).some((b) => b.deco === k));
  if (!owned.length) return '';
  return `<div class="b-cat"><h4>Décorations</h4>${owned.map((k) => `<button class="mini" data-action="deco" data-key="${k}" data-x="${x}" data-y="${y}">${COSMETICS[k].icon} ${esc(COSMETICS[k].name)}</button>`).join(' ')}</div>`;
}

function prodBlock(s, b, mods) {
  const r = buildingRates(s, b, mods);
  const def = BUILDINGS[b.type];
  if (!Object.keys(r.out).length && !Object.keys(r.in).length) return '';
  const adj = r.adj;
  return `<div class="panel-sub"><h4>Production / heure</h4>
    ${Object.keys(r.in).length ? `<div class="flow">${resChips(Object.fromEntries(Object.entries(r.in).map(([k, v]) => [k, -v])), true)} <span class="arrow">➜</span> ${resChips(r.out, true)}</div>` : `<div>${resChips(r.out, true)}</div>`}
    ${b.starved ? '<div class="req">⚠️ Matières premières insuffisantes : la chaîne tourne au ralenti.</div>' : ''}
    ${def.adj ? `<div class="adj-list">${def.adj.map((rule) => {
      const hit = adj.details.find((d) => d.near === rule.near);
      const name = NEAR_NAME[rule.near] || BUILDINGS[rule.near]?.name || rule.near;
      return `<div class="${hit ? 'ok' : 'off'}">${hit ? '✔' : '✗'} Près de ${esc(name)} : ${hit ? pct(hit.bonus) : pct(rule.bonus) + (rule.per ? ' / voisin' : '')}</div>`;
    }).join('')}</div>` : ''}
  </div>`;
}

function buildingPanel(app, b, mods) {
  const s = app.state;
  if (b.type === 'deco') {
    return `<h3>${COSMETICS[b.deco].icon} ${esc(COSMETICS[b.deco].name)}</h3><p class="muted">Décoration. Dans les faubourgs, près de maisons, d’un marché ou d’une taverne, elle remonte le moral des ouvriers ; dans la cour, celui de la garnison.</p>${zoneBlock(app, b)}${decoAuraBlock(app, b)}
      <button class="btn" data-action="move" data-id="${b.id}">Déplacer</button> <button class="btn ghost" data-action="demolish" data-id="${b.id}">Retirer</button>`;
  }
  const def = BUILDINGS[b.type];
  const q = s.queues.build.find((qq) => qq.bid === b.id);
  const next = b.level + 1;
  const info = next <= def.maxLevel ? getUpgradeInfo(s, b.type, next, mods) : null;
  const effects = def.effects ? def.effects(b.level || 1) : null;
  const prox = proximityEffects(s, b);
  const links = { tavern: ['heroes', 'Recruter des héros'], forge: ['craft', 'Ouvrir la forge'], laboratory: ['craft', 'Ouvrir le laboratoire'], market: ['market', 'Ouvrir le marché'],
    library: ['research', 'Recherches'], barracks: ['army', 'Former des troupes'], stable: ['army', 'Former des troupes'], workshop: ['army', 'Former des troupes'], guildhall: ['guild', 'Guilde'], castle: ['army', 'Armée'] };
  return `<div class="b-panel-head">${b.type === 'monument' ? buildingSvg(b.type, b.level, 'b-art b-art-panel', ORIENTS[b.orient]?.color) : paintedThumb(b.type, b.level, 96, buildingSvg(b.type, b.level, 'b-art b-art-panel'))}<div><h3>${def.icon} ${esc(def.name)} <span class="lvl">niv. ${b.level}/${def.maxLevel}</span></h3>
    ${b.type === 'townhall' ? `<div class="castle-name">🏰 <b>${esc(castleName(s))}</b> <button class="mini ghost" data-action="rename-castle" title="Renommer le château principal">✎ Renommer</button></div><div class="small muted">Château principal de ${esc(s.meta.kingdomName)}</div>` : ''}</div></div>
    <p class="muted">${esc(def.desc)}</p>
    ${zoneBlock(app, b)}
    ${b.type === 'monument' ? monumentBlock(s, b) : ''}
    ${b.type === 'townhall' ? eraBlock(s, b) : ''}
    ${b.damaged ? (() => { const dmg = Object.values(s.city.buildings).filter((o) => o.damaged).length; return `<div class="panel-sub damaged"><b>🛠️ Endommagé</b> : production réduite de moitié. ${costList(repairCost(b, mods), s)} <button class="mini primary" data-action="repair" data-id="${b.id}">Réparer</button>${dmg > 1 ? ` <button class="mini" data-action="repair-all" title="Répare tous les bâtiments endommagés tant que les ressources suffisent">Tout réparer (${dmg})</button>` : ''}</div>`; })() : ''}
    ${def.recipes && b.level > 0 ? `<div class="panel-sub"><h4>Recette</h4><select data-change="recipe" data-id="${b.id}">${def.recipes.map((r, i) => `<option value="${i}" ${(b.recipe || 0) === i ? 'selected' : ''}>${esc(r.name)}</option>`).join('')}</select></div>` : ''}
    ${b.level > 0 && sectorOfBuilding(b.type) && s.workers?.length ? `<div class="small muted">👷 Secteur ${esc(WORK_SECTORS[sectorOfBuilding(b.type)].name)} : ${s.workers.filter((w) => w.job?.sector === sectorOfBuilding(b.type)).length} ouvrier(s) (+${Math.round((mods['work.' + sectorOfBuilding(b.type)] || 0) * 100)}%)</div>` : ''}
    ${b.level > 0 && b.type !== 'road' ? `<div class="small ${roadConnected(s).has(b.id) ? 'ok' : 'muted'}">${roadConnected(s).has(b.id) ? '✔ Relié au réseau de routes (+5%)' : '🟫 Non relié aux routes : une route pavée jusqu’à l’hôtel de ville donne +5%'}</div>` : ''}
    ${q ? `<div class="panel-sub"><b>${q.kind === 'build' ? 'Construction' : 'Amélioration'} en cours</b> → niv. ${q.level} · ${countdown(q.end)}${progress(q.start, q.end)}${speedupLine(s, q)}</div>` : ''}
    ${b.level > 0 ? prodBlock(s, b, mods) : ''}
    ${b.type === 'hospice' && b.level > 0 ? hospiceBlock(app, b) : ''}${b.level > 0 ? relicBlock(app, b) : ''}
    ${effects ? `<div class="panel-sub"><h4>Effets</h4>${Object.entries(effects).map(([k, v]) => `<div class="small">${esc(effectName(k))} : <b>${fmtEffect(k, v)}</b></div>`).join('')}
      ${Object.keys(prox).length ? `<div class="small ok">✔ Bonus de proximité : ${Object.entries(prox).map(([k, v]) => `${esc(effectName(k))} ${pct(v)}`).join(', ')}</div>` : def.near || def.adjFx ? '<div class="small off">✗ Bonus de proximité inactif</div>' : ''}</div>` : ''}
    ${info && !q ? upgradeBlock(app, b, def, next, info, mods) : ''}
    ${!info ? '<div class="panel-sub">Niveau maximum atteint.</div>' : ''}
    <div class="row gap wrap">
      ${screenButtons(app, b.type, 'btn') || (links[b.type] ? `<button class="btn" data-action="nav" data-view="${links[b.type][0]}">${links[b.type][1]} →</button>` : '')}
      ${b.level > 0 && b.type !== 'townhall' ? (freeMove(s) ? `<button class="btn ghost" data-action="move" data-id="${b.id}" title="Déménagement gratuit (nouvelles zones du château)">Déplacer (gratuit)</button>` : `<button class="btn ghost" data-action="move" data-id="${b.id}" title="Déplacer coûte ${moveCost(b).gold} or">Déplacer (${moveCost(b).gold} 🪙)</button>`) : ''}
      ${b.type !== 'townhall' && !q ? `<button class="btn ghost danger" data-action="demolish" data-id="${b.id}">Démolir</button>` : ''}
      ${recipeOf(b) && b.level > 0 ? `<button class="btn ghost" data-action="pause" data-id="${b.id}">${b.paused ? '▶ Relancer' : '⏸ Mettre en pause'}</button><button class="btn ghost" data-action="nav" data-view="chains">⚙️ Configurer la chaîne</button>` : ''}
    </div>`;
}

// Monument dynastique : étapes, orientation (choisie une fois), bienfaits
function monumentBlock(s, b) {
  const o = ORIENTS[b.orient];
  return `<div class="panel-sub"><h4>Étapes du monument</h4><div class="monument-stage">${MONUMENT_STAGES.map((n, i) => `<span class="${i < b.level ? 'done' : ''}" title="${esc(n)}"></span>`).join('')}</div>
    <div class="small">${b.level ? `Étape ${b.level}/5 : ${esc(MONUMENT_STAGES[b.level - 1])}` : 'Chantier ouvert'}${b.level < 5 ? ` · prochaine : ${esc(MONUMENT_STAGES[b.level])}` : ' · monument achevé'}</div>
    ${o ? `<div class="small ok">${o.icon} <b>${esc(o.name)}</b> — ${esc(o.text)} (actuellement ×${b.level}).</div>`
      : `<div class="small">Choisissez l’orientation du monument (définitive) :</div><div class="ch-grid">${Object.entries(ORIENTS).map(([k, x]) => `<div class="lx-opt"><b>${x.icon} ${esc(x.name)}</b><span class="small muted">${esc(x.desc)}</span><span class="small">${esc(x.text)}</span><button class="mini primary" data-action="monument-orient" data-k="${k}">Consacrer</button></div>`).join('')}</div>`}
    <div class="small muted">Chaque étape achevée rapportera 1 point d’héritage à la fondation d’une dynastie ; la dynastie suivante retrouvera le monument parmi ses vestiges.</div></div>`;
}

// Bloc d'amélioration : coût, durée, prérequis, bénéfices attendus et raison exacte d'une impossibilité
function upgradeBlock(app, b, def, next, info, mods) {
  const s = app.state;
  const u = upgradeCheck(s, b.id, mods);
  const gains = [];
  if (b.level > 0) {
    const r = buildingRates(s, b, mods);
    const k = levelProdFactor(next) / levelProdFactor(b.level);
    const outs = Object.entries(r.out).map(([res, v]) => `${resIcon(res, 16, RESOURCES[res]?.icon)} ${fmt(v)} → <b>${fmt(v * k)}</b>/h`);
    if (outs.length) gains.push(`Production : ${outs.join(' · ')}`);
  }
  if (def.effects) {
    const cur = def.effects(b.level || 1), nx = def.effects(next);
    for (const [k, v] of Object.entries(nx)) if (v !== cur[k]) gains.push(`${esc(effectName(k))} : ${fmtEffect(k, cur[k] || 0)} → <b>${fmtEffect(k, v)}</b>`);
  }
  if (b.type === 'townhall') {
    const unlocks = Object.entries(BUILDINGS).filter(([, d]) => d.req?.townhall === next).map(([, d]) => `${d.icon} ${d.name}`);
    gains.push(`Niveau maximal des autres bâtiments : ${next}`);
    if (unlocks.length) gains.push(`Débloque : ${esc(unlocks.join(', '))}`);
  }
  const btn = u.status === 'ready' ? `<button class="btn primary" data-action="upgrade" data-id="${b.id}">⬆ Améliorer au niveau ${next}</button>`
    : u.status === 'queue' ? `<button class="btn" data-action="upgrade" data-id="${b.id}">🗓️ Planifier l’amélioration</button>`
      : u.status === 'lack' ? `<button class="btn" data-action="upgrade" data-id="${b.id}" disabled>⬆ Améliorer</button>` : '';
  return `<div class="panel-sub up-block ${u.status} ${app.ui.focusUpgrade ? 'focus' : ''}" id="up-block"><h4>Amélioration → niveau ${next}</h4>
    <div class="row gap wrap">${costList(info.cost, s)} <span class="muted small">⏱ ${fmtTime(info.time)}</span></div>
    ${gains.length ? `<ul class="up-gains small">${gains.map((g) => `<li>${g}</li>`).join('')}</ul>` : ''}
    ${u.reasons.map((r) => `<div class="req">⚠️ ${esc(r)}</div>`).join('')}
    ${u.status === 'locked' && /Hôtel de ville/.test(u.reasons[0] || '') ? '<div class="small muted">Améliorez d’abord l’hôtel de ville : son niveau limite celui des autres bâtiments.</div>' : ''}
    ${btn}</div>`;
}
const fmtEffect = (k, v) => (['storage', 'marches', 'heroSlots', 'vision', 'caravans', 'buildQueue', 'territories'].includes(k) ? fmt(v) : pct(v));

// Hôtel de ville : ère actuelle, prochains paliers et prérequis du niveau suivant (affichés avant d'investir)
function eraBlock(s, b) {
  const era = eraOf(b.level);
  const nextMs = Object.entries(TH_MILESTONES).filter(([l]) => +l > b.level).slice(0, 2);
  const reqs = b.level < BUILDINGS.townhall.maxLevel ? thRequirements(b.level + 1) : [];
  return `<div class="panel-sub era-block"><h4>${era.icon} ${esc(era.name)} <span class="muted small">(HdV ${era.from}–${era.to})</span></h4>
    <div class="era-track">${ERAS.map((e) => `<span class="${e === era ? 'cur' : b.level > e.to ? 'done' : ''}" title="${esc(e.name)} (HdV ${e.from}–${e.to})">${e.icon}</span>`).join('')}</div>
    <div class="small muted">${esc(era.desc)}</div>
    ${nextMs.length ? `<div class="small">Prochains paliers : ${nextMs.map(([l, m]) => `<b>HdV ${l}</b> — ${esc(m.text)}`).join(' · ')}</div>` : '<div class="small ok">Tous les paliers sont atteints.</div>'}
    ${reqs.length ? `<div class="small">Prérequis du niveau ${b.level + 1} : ${reqs.map((r) => { const ok = levelOf(s, r.type) >= r.level; return `<span class="${ok ? 'ok' : 'req'}">${ok ? '✔' : '✗'} ${esc(BUILDINGS[r.type].name)} niv. ${r.level}</span>`; }).join(' ')}</div>` : ''}</div>`;
}

const EFFECT_NAMES = { buildQueue: 'Files de construction en plus', territories: 'Avant-postes en plus', storage: 'Capacité de stockage', 'storage.pct': 'Stockage', 'city.def': 'Défense de la ville', marches: 'Marches simultanées', heroSlots: 'Places de héros', 'train.speed': 'Vitesse de formation', 'research.speed': 'Vitesse de recherche', 'market.fee': 'Taxe du marché', caravans: 'Caravanes', 'wall.bonus': 'Bonus de muraille', vision: 'Vision', protect: 'Ressources protégées', 'prod.all': 'Toute production', 'explore.speed': 'Vitesse d’exploration', 'loot.rare': 'Butin rare', 'caravan.speed': 'Vitesse des caravanes' };
const effectName = (k) => EFFECT_NAMES[k] || k;

function fortPanel(app, mods) {
  const s = app.state;
  return ['wall', 'moat'].map((type) => {
    const def = BUILDINGS[type];
    const lvl = s.city.fort[type] || 0;
    const q = s.queues.build.find((qq) => qq.bid === 'fort:' + type);
    const req = lvl === 0 ? buildRequirement(s, type) : null;
    const u = upgradeCheck(s, 'fort:' + type, mods);
    const ready = u.status === 'ready';
    return `<div class="fort-card ${ready && showUpgrades(s) ? 'st-ready' : ''}"><div class="b-opt-head"><span class="b-icon">${def.icon}</span><b>${esc(def.name)}</b> <span class="lvl">niv. ${lvl}</span>${ready && showUpgrades(s) ? `<span class="up-tag" title="Amélioration possible">${upIcon('ready')} améliorable</span>` : ''}</div>
      <div class="muted small">${esc(def.desc)}${lvl ? ` Actuel : ${pct(def.effects(lvl)['wall.bonus'])} muraille.` : ''}</div>
      ${q ? `<div>${countdown(q.end)}${progress(q.start, q.end)}${speedupLine(s, q)}</div>` : req ? `<div class="req">${esc(req)}</div>` : u.cost ? `<div class="b-opt-foot">${costList(u.cost, s)} <span class="muted small">⏱ ${fmtTime(u.time)}</span> ${u.status === 'locked' ? `<span class="req">${esc(u.reasons[0])}</span>` : `<button class="mini ${ready ? 'primary' : ''}" data-action="upgrade" data-id="fort:${type}" ${u.status === 'lack' ? `disabled title="${esc(u.reasons[0] || '')}"` : ''}>${lvl ? 'Améliorer' : 'Construire'}</button>`}</div>${u.status === 'lack' ? `<div class="req small">${esc(u.reasons[0])}</div>` : ''}` : u.status === 'max' ? '<div class="small muted">Niveau maximum</div>' : ''}
    </div>`;
  }).join('');
}

// Caméra de la carte du royaume (conservée entre deux rendus). v20 : vue isométrique, losange de 128 × 64 au zoom 1.
export const CITY_SCALE = 1;
const CITY_ZMIN = 0.2, CITY_ZMAX = 2.4;
// Niveaux de détail : vue globale (far), intermédiaire (mid), rapprochée (near)
export const cityZoomLevel = (z) => (z < 0.42 ? 'far' : z < 1.25 ? 'mid' : 'near');

function onCityCam(vp, cam, app = null) {
  const zl = cityZoomLevel(cam.z);
  if (vp.dataset.zl !== zl) vp.dataset.zl = zl;
  if (!vp.classList.contains('moving')) vp.classList.add('moving');
  clearTimeout(vp._mv); vp._mv = setTimeout(() => {
    vp.classList.remove('moving'); declutter(vp);
    // v22b : zoom posé → scène repeinte à la finesse voulue (plus de pixels flous en gros plan)
    const p = app?._paint;
    if (p && vp.isConnected) { const R2 = paintRes(p.f, gfxOf(app.state), cam.z); if (R2 !== p.R) { p.R = R2; attachGround(app); } }
  }, 280);
  vp.querySelector('#city-tip')?.classList.remove('on');
  placeRing(vp, cam);
  lifeRedraw();
}
// v20 : couches lourdes et rarement changées (décor de la campagne, muraille) : leurs nœuds sont gardés d'un rendu à
// l'autre tant que leur contenu ne change pas (le rendu ne pose qu'une place vide, remplie ou rattachée après)
const reused = new Map();
function reuse(cls, html) {
  const k = cls.split(' ')[0];
  const c = reused.get(k);
  if (!c || c.html !== html || c.cls !== cls) reused.set(k, { html, cls, node: null });
  return `<div class="${cls}" data-reuse="${k}"></div>`;
}
function attachReused(root) {
  for (const ph of root.querySelectorAll('[data-reuse]')) {
    const c = reused.get(ph.dataset.reuse);
    if (!c) continue;
    if (c.node && c.node !== ph) { ph.replaceWith(c.node); continue; }
    ph.innerHTML = c.html;
    c.node = ph;
  }
}
// v20 : en isométrique, le signal d'un bâtiment haut peut monter sur celui du voisin de derrière. Après chaque rendu et
// chaque mouvement de caméra, on garde le plus important (puis le plus en avant) et on masque l'autre (jamais deux
// signaux l'un sur l'autre ; le masqué reste dans la fiche, l'infobulle et la liste textuelle).
const SIG_ORDER = { danger: 4, reward: 3, problem: 2, stopped: 1.5, upgrade: 1, idle: 0 };
export function declutter(vp) {
  const sigs = [...vp.querySelectorAll('.tile.iso-b .t-sig')];
  for (const e of sigs) e.classList.remove('clash');
  const items = sigs.map((e) => ({ e, r: e.getBoundingClientRect(), k: SIG_ORDER[(/sig-(\w+)/.exec(e.className) || [])[1]] ?? 0, z: +e.parentElement.style.zIndex || 0 }))
    .filter((i) => i.r.width > 0).sort((a, b) => b.k - a.k || b.z - a.z);
  const kept = [];
  for (const i of items) {
    if (kept.some((o) => i.r.left < o.right + 1 && i.r.right > o.left - 1 && i.r.top < o.bottom + 1 && i.r.bottom > o.top - 1)) i.e.classList.add('clash');
    else kept.push(i.r);
  }
}
// L'anneau d'un bâtiment est posé hors de la carte transformée (taille constante), recentré à chaque mouvement
function placeRing(vp, cam) {
  const r = vp.querySelector('#city-ring');
  if (!r || r.dataset.x === '' || !r.firstElementChild) return;
  const f = vp._frame;
  if (!f) return;
  const c = tileCenter(f, +r.dataset.x, +r.dataset.y);
  const x = cam.x + c.sx * cam.z, y = cam.y + (c.sy - 40) * cam.z;
  const m = 70;
  if (vp._ringTop === undefined) { const st = vp.parentElement?.querySelector('.stage-top'); vp._ringTop = st ? Math.max(m, st.offsetTop + st.offsetHeight - vp.offsetTop + 66) : m; }
  const top = Math.min(vp._ringTop, vp.clientHeight - m);
  r.style.transform = `translate(${Math.max(m, Math.min(vp.clientWidth - m, x))}px, ${Math.max(top, Math.min(vp.clientHeight - m, y))}px)`;
}
// Zone de sécurité de la caméra : la carte moins les blocs de l'affichage fixe (colonne des quêtes, haut, bas)
export function safeZone(vp) {
  const r = vp.getBoundingClientRect();
  const box = (sel) => { const e = document.querySelector(sel); if (!e) return null; const b = e.getBoundingClientRect(); return b.width && b.height ? b : null; };
  let left = r.left, right = r.right, top = r.top, bottom = r.bottom;
  const tl = box('#hud .hud-top'); if (tl) top = Math.max(top, Math.min(tl.bottom, r.top + r.height * 0.3));
  const bt = box('#hud .hud-bottom'); if (bt) bottom = Math.min(bottom, Math.max(bt.top, r.bottom - r.height * 0.35));
  const lc = box('#hud .hud-l'); if (lc && lc.width < r.width * 0.4) left = Math.max(left, lc.right);
  const rc = box('#hud .hud-r'); if (rc && rc.width < r.width * 0.3) right = Math.min(right, rc.left);
  if (right - left < 120) { left = r.left; right = r.right; }
  return { cx: (left + right) / 2 - r.left, cy: (top + bottom) / 2 - r.top, left: left - r.left, right: right - r.left, top: top - r.top, bottom: bottom - r.top };
}
function cityCam(app) { return (app.ui.cityCam ||= { x: 0, y: 0, z: CITY_SCALE, init: false }); }
// Cadrage par défaut : la forteresse et ses douves remplissent la zone libre de l'affichage fixe ; sinon centré sur un
// bâtiment (at) sans dézoomer
function centerOnTown(app, vp, at = null) {
  const cam = cityCam(app), s = app.state, f = frameOf(s);
  const sz = safeZone(vp);
  if (!at) {
    const kb = keepBox(s, f);
    const w = Math.max(160, sz.right - sz.left), h = Math.max(160, sz.bottom - sz.top);
    cam.z = Math.max(0.35, Math.min(1.5, Math.min(w / (kb.right - kb.left), h / (kb.bottom - kb.top)) * 0.98));
    cam.x = sz.cx - ((kb.left + kb.right) / 2) * cam.z;
    cam.y = sz.cy - ((kb.top + kb.bottom) / 2) * cam.z;
  } else {
    cam.z = Math.max(cam.z, window.innerWidth < 700 ? 0.8 : 0.9);
    const c = tileCenter(f, at.x, at.y);
    cam.x = sz.cx - c.sx * cam.z; cam.y = sz.cy - (c.sy - 40) * cam.z;
  }
  cam.init = true;
}
// Case de la grille sous un point de l'écran (projection inverse), ou null
function tileUnder(app, vp, clientX, clientY) {
  const cam = cityCam(app), f = frameOf(app.state), r = vp.getBoundingClientRect();
  return isoTileAt(f, (clientX - r.left - cam.x) / cam.z, (clientY - r.top - cam.y) / cam.z, app.state.city.w, app.state.city.h);
}

// Infobulle et survol : la case sous le curseur (bouton d'un bâtiment, sinon projection inverse) ; losange de survol
function bindCityTip(app, vp) {
  if (vp.dataset.tip) return;
  vp.dataset.tip = '1';
  const tip = () => vp.querySelector('#city-tip');
  let cur = '';
  vp.addEventListener('pointermove', (e) => {
    const el = tip();
    if (!el) return;
    if (vp.classList.contains('dragging') || e.target.closest('.map-tools, .ring-wrap, .harvest-bubble')) { el.classList.remove('on'); cur = ''; return; }
    const t = e.target.closest('.tile');
    const p = t ? { x: +t.dataset.x, y: +t.dataset.y } : tileUnder(app, vp, e.clientX, e.clientY);
    const hl = vp.querySelector('#iso-hl');
    if (!p) { el.classList.remove('on'); cur = ''; hl?.setAttribute('d', ''); return; }
    const k = p.x + ',' + p.y;
    if (k !== cur) { cur = k; hl?.setAttribute('d', diamondPath(frameOf(app.state), p.x, p.y)); if (e.pointerType !== 'touch') { try { el.innerHTML = tipHtml(app, p.x, p.y); } catch (err) { console.error(err); } } }
    if (e.pointerType === 'touch') return;
    const r = vp.getBoundingClientRect();
    const px = e.clientX - r.left, py = e.clientY - r.top;
    const w = el.offsetWidth || 220, h = el.offsetHeight || 80;
    el.style.left = Math.max(6, Math.min(r.width - w - 6, px + 16)) + 'px';
    el.style.top = Math.max(6, py + 18 + h > r.height ? py - h - 12 : py + 18) + 'px';
    el.classList.add('on');
  });
  vp.addEventListener('pointerleave', () => { tip()?.classList.remove('on'); vp.querySelector('#iso-hl')?.setAttribute('d', ''); cur = ''; });
  // Clic sur une case vide (sol) : projection inverse, puis la même action qu'un clic sur une case
  vp.addEventListener('click', (e) => {
    if (e.defaultPrevented || e.target.closest('button, a, .ring-wrap, .map-tools, select, input')) return;
    const p = tileUnder(app, vp, e.clientX, e.clientY);
    if (!p) return;
    cityView.actions.tile(app, { dataset: { x: String(p.x), y: String(p.y) } });
  });
}

// v20 : sol projeté (canvas orthogonal en cache, matrice CSS) ; repeint seulement si terrain, saison, enceinte ou
// douves changent
function attachGround(app) {
  const vp = document.getElementById('city-vp'), p = app._paint;
  if (!vp || !p) return;
  attachPaint(vp.querySelector('.paint-slot.pg'), vp.querySelector('.paint-slot.ps'), p.state, p.f, p.R, p.items, p.gopts);
  if (app._life) mountLife(vp, app, { ...app._life, fx: paintFx() });
}


// v16 « Le Château » — Fiche de la case sélectionnée (fenêtre « Informations ») : bâtiment, terrain vague, décombres,
// case libre (menu de construction) ou terrain
export function selPanel(app, mods = computeMods(app.state)) {
  const s = app.state, sel = app.ui.citySel;
  if (!sel) return '<p class="muted">Choisissez une case du château.</p>';
  const b = buildingAt(s, sel.x, sel.y);
  const t = terrainAt(s, sel.x, sel.y);
  const lot = !b ? vacantLots(s).find((l) => l.x === sel.x && l.y === sel.y) : null;
  if (b) return buildingPanel(app, b, mods) + (b.type === 'townhall' ? domainCard(app) : '');
  if (lot) return lotPanel(app, lot);
  if (t === 'rubble') {
    const q = s.queues.build.find((qq) => qq.kind === 'clear' && qq.x === sel.x && qq.y === sel.y);
    return `<h3>🧱 Décombres</h3><p class="muted">Les ruines de la Fracture encombrent cette case. Déblayer libère de la place et rapporte des matériaux… et parfois une trouvaille.</p>
      ${q ? `${countdown(q.end)}${progress(q.start, q.end)}${speedupLine(s, q)}` : `<div class="b-opt-foot">${costList(CLEAR_COST, s)} <span class="muted small">⏱ 8s</span> <button class="btn primary" data-action="clear" data-x="${sel.x}" data-y="${sel.y}">Déblayer</button></div>`}`;
  }
  if (t === 'plain') return buildMenu(app, sel.x, sel.y, mods);
  return `<h3>${TERRAIN_NAME[t]}</h3><p class="muted">${t === 'river' ? 'La rivière irrigue les fermes, moulins, vergers et tanneries voisins. Pêcherie et port doivent la toucher.' : t === 'forest' ? 'La forêt profite aux scieries, chasseurs, herboristes et charbonnières voisins.' : 'La montagne profite aux carrières et mines voisines.'}</p>`;
}
// Agrandissement du domaine (fiche de l'hôtel de ville et panneau Construire)
function domainCard(app) {
  const s = app.state, st = nextDomainStep(s);
  if (!st) return '';
  return `<div class="panel-sub domain-card"><h4>🗺️ Agrandir le domaine <span class="muted small">${s.city.w}×${s.city.h} cases</span></h4><div class="small muted">Étape « ${esc(st.name)} » : +${DOMAIN_GROW.w} colonnes à l’est et +${DOMAIN_GROW.h} rangées au sud.</div><div class="b-opt-foot">${costList(st.cost, s)} <span class="small ${thLevel(s) >= st.th ? 'ok' : 'req'}">HdV ${st.th}</span><button class="mini primary" data-action="expand">Agrandir</button></div></div>`;
}
export const bldgView = {
  id: 'bldg', title: 'Fiche',
  title_(app) { const s = app.state, sel = app.ui.citySel; const b = sel && buildingAt(s, sel.x, sel.y); return b ? (b.type === 'deco' ? COSMETICS[b.deco]?.name || 'Décoration' : b.type === 'townhall' ? castleName(s) : BUILDINGS[b.type]?.name) : sel ? `Case (${sel.x}, ${sel.y})` : 'Fiche'; },
  render: (app) => selPanel(app),
};

// Panneau Construire (bas de l'écran) : catégories, aperçu des zones, des bonus et des risques
const BUILD_TABS = {
  prod: { name: 'Production', icon: '⛏️', cats: ['resource', 'food', 'industry'] },
  mil: { name: 'Militaire', icon: '⚔️', cats: ['military'] },
  civ: { name: 'Civil', icon: '🏛️', cats: ['core', 'civic'] },
  deco: { name: 'Décorations', icon: '🗿', cats: [] },
  places: { name: 'Lieux', icon: '▦', cats: ['place', 'unique'] },
  trophy: { name: 'Vitrine', icon: '🏆', cats: [] },
};
function buildPanel(app, mods, ups) {
  const s = app.state, tab = app.ui.buildTab || 'prod';
  let items = '';
  if (tab === 'trophy') {
    // v20 : vitrine — les trophées gagnés s'exposent dans la ville fortifiée (statues, bannières, obélisques…)
    const wait = trophiesToPlace(s);
    items = wait.map((k) => { const t = TROPHIES[k]; return `<button class="bp-item trophy-item ${app.ui.placeTrophy === k ? 'active' : ''}" data-action="trophy-mode" data-key="${k}" title="${esc(`${t.name} — ${t.what}`)}"><span class="bp-ic">${isoInline(trophyIso(t.shape, t.color))}</span><span class="bp-n">${esc(t.name)}</span></button>`; }).join('')
      + (wait.length > 1 ? `<button class="bp-item" data-action="trophy-auto" title="Placer tous les trophées autour de la place de l’hôtel de ville"><span class="bp-ic">✨</span><span class="bp-n">Tout exposer</span></button>` : '')
      || `<span class="muted small">Aucun trophée à exposer. ${esc(nextTrophies(s).filter((n) => n.next).slice(0, 2).map((n) => `${n.name} : ${n.count}/${n.next}`).join(' · '))}</span>`;
  } else if (tab === 'deco') {
    const owned = Object.keys(s.meta.owned || {}).filter((k) => COSMETICS[k]?.type === 'deco' && !allBuildings(s).some((b) => b.deco === k));
    items = owned.map((k) => `<button class="bp-item ${app.ui.placeDeco === k ? 'active' : ''}" data-action="deco-mode" data-key="${k}" title="Placer : ${esc(COSMETICS[k].name)} (faubourgs : moral des ouvriers ; cour : moral de la garnison)"><span class="bp-ic">${COSMETICS[k].icon}</span><span class="bp-n">${esc(COSMETICS[k].name)}</span></button>`).join('') || '<span class="muted small">Aucune décoration à placer. Elles se gagnent (jalons, saison, événements).</span>';
  } else {
    items = Object.entries(BUILDINGS).filter(([t, d]) => d.grid !== false && t !== 'road' && BUILD_TABS[tab].cats.includes(d.cat)).map(([t, d]) => {
      if (d.isPlace) { const b = allBuildings(s).find((x) => x.type === t); return `<button class="bp-item" ${b ? `data-action="goto-tile" data-x="${b.x}" data-y="${b.y}"` : 'disabled'} title="${esc(d.desc)} ${b ? 'Posé d’office : cliquez pour le voir.' : 'Se pose de lui-même quand sa fonction s’ouvre.'}">${paintedThumb(t, 1, 44, buildingIcon(t, 30))}<span class="bp-n">${esc(d.name)}</span><span class="bp-c small muted">${b ? 'posé' : 'à venir'}</span></button>`; }
      const req = buildRequirement(s, t);
      const { cost } = getUpgradeInfo(s, t, 1, mods);
      return `<button class="bp-item ${app.ui.placeType === t ? 'active' : ''}" data-action="place-mode" data-type="${t}" ${req ? `disabled title="${esc(d.name)} — ${esc(req)}"` : `title="${esc(d.name)} — ${esc(d.desc)} · ${esc(ruleText(t))}"`} aria-label="${esc(d.name)}">${paintedThumb(t, 1, 44, buildingIcon(t, 30))}<span class="bp-n">${esc(d.name)}</span><span class="bp-c small">${req ? esc(req) : Object.entries(cost).slice(0, 2).map(([r, v]) => `${fmt(v)} ${RESOURCES[r]?.icon || ''}`).join(' ')}</span></button>`;
    }).join('');
    if (tab === 'mil') items += ['wall', 'moat'].map((type) => { const u = upgradeCheck(s, 'fort:' + type, mods); const lvl = s.city.fort[type] || 0; return `<button class="bp-item" data-action="upgrade" data-id="fort:${type}" ${['ready', 'queue'].includes(u.status) ? '' : `disabled title="${esc(u.reasons?.[0] || '')}"`}>${BUILDINGS[type].icon}<span class="bp-n">${esc(BUILDINGS[type].name)} → ${lvl + 1}</span><span class="bp-c small">${u.cost ? Object.entries(u.cost).slice(0, 2).map(([r, v]) => `${fmt(v)} ${RESOURCES[r]?.icon || ''}`).join(' ') : esc(u.reasons?.[0] || '')}</span></button>`; }).join('');
  }
  const mode = app.ui.moveId ? `Déplacer : cliquez une case libre${freeMove(s) ? ' (gratuit)' : ''}.` : app.ui.placeType ? `Placer ${esc(BUILDINGS[app.ui.placeType].name)} : cliquez une case. Les % sont le bonus de placement ; ✕ = zone interdite (${esc(ruleText(app.ui.placeType))}).` : app.ui.placeDeco ? 'Placer la décoration : cliquez une case libre.' : 'Choisissez un bâtiment. La grille et les zones sont affichées.';
  return `<div class="build-panel" role="region" aria-label="Construire">
    <div class="bp-head"><nav class="bp-tabs" role="tablist">${Object.entries(BUILD_TABS).map(([k, t]) => `<button class="bp-tab ${tab === k ? 'active' : ''}" role="tab" aria-selected="${tab === k}" data-action="build-tab" data-k="${k}">${t.icon} ${t.name}</button>`).join('')}</nav>
      <div class="bp-tools"><button class="mini ${app.ui.cityRisk ? 'primary' : ''}" data-action="city-risk" aria-pressed="${!!app.ui.cityRisk}" title="Aperçu des risques : incendie et zone inondable">🔥 Risques</button><button class="mini" data-action="up-list" title="Améliorations possibles">⬆ ${ups.count}</button><button class="mini" data-action="plans" title="Réorganiser la ville, plans enregistrés (aperçu et annulation)">📐 Plans</button><button class="mini" data-action="up-toggle" aria-pressed="${showUpgrades(s)}" title="${showUpgrades(s) ? 'Masquer' : 'Afficher'} les icônes d’amélioration sur la carte">${showUpgrades(s) ? '👁' : '🚫'} ⬆</button>${enlargePreview(s).ok ? `<button class="mini primary" data-action="enlarge" title="Agrandir la ville fortifiée${enlargePreview(s).free ? ' (offert par l’agrandissement du domaine)' : ''}">🏰 Enceinte${enlargePreview(s).free ? ' 🎁' : ''}</button>` : ''}${nextDomainStep(s) ? '<button class="mini" data-action="expand" title="Agrandir le domaine (voir la fiche de l’hôtel de ville)">🗺️ Domaine</button>' : ''}<button class="mini ghost" data-action="build-mode" title="Fermer (Échap)">✕</button></div></div>
    <div class="small bp-hint" role="status">${mode}</div>
    <div class="bp-items">${items}</div>
  </div>`;
}

const cityView = {
  id: 'city', title: 'Royaume', icon: '🏰',
  tick(app) { const st = document.querySelector('.city-stage'); if (st) { updateSceneFx(st, cityScene(app), 'city'); attachGround(app); } },
  after(app) {
    const vp = document.getElementById('city-vp');
    if (!vp) return;
    attachReused(vp);
    fitStage();
    vp._frame = frameOf(app.state);
    attachGround(app);
    const cam0 = cityCam(app);
    if (!cam0.init) centerOnTown(app, vp);
    if (cam0.centerOn) { centerOnTown(app, vp, cam0.centerOn); cam0.centerOn = null; }
    if (app.ui.cityFocus) { centerOnTown(app, vp, app.ui.cityFocus); app.ui.cityFocus = null; }
    vp._center = (x, y) => { centerOnTown(app, vp, { x, y }); app.ui.cityFocus = null; vp._apply?.(); };
    bindPanZoom(vp, { getCam: () => cityCam(app), zMin: CITY_ZMIN, zMax: CITY_ZMAX, onChange: (cam) => onCityCam(vp, cam, app) });
    bindCityTip(app, vp);
    declutter(vp);
    if (app.ui.focusUpgrade) { document.getElementById('up-block')?.scrollIntoView({ block: 'nearest' }); app.ui.focusUpgrade = false; }
    if (!app._cityResize) { app._cityResize = true; window.addEventListener('resize', () => { fitStage(); document.getElementById('city-vp')?._apply?.(); }); }
  },
  render(app) {
    const s = app.state;
    const mods = computeMods(s);
    const sel = app.ui.citySel;
    const ctx = cityCtx(app, mods);
    const f = ctx.f;
    // Objets de la scène : bâtiments (boutons triés par profondeur), terrains vagues, curseur clavier des cases vides
    const parts = [];
    const film = app.ui.film;
    for (const b of Object.values(s.city.buildings)) { if (film && !film.ids.has(b.id)) continue; parts.push(objHtml(app, b, ctx)); }
    if (!ctx.place && !film) for (const lot of ctx.lots.values()) parts.push(lotHtml(app, lot, ctx));
    const kf = app.ui.cityKeyFocus;
    if (kf && !ctx.at.has(kf.x + ',' + kf.y) && !ctx.lots.has(kf.x + ',' + kf.y)) parts.push(cursorHtml(s, f, kf, ctx.rove === kf.x + ',' + kf.y));
    const ups = upgradeSummary(s, mods);
    const cam = cityCam(app);
    const selB = sel ? buildingAt(s, sel.x, sel.y) : null;
    const selLot = sel && !selB ? ctx.lots.get(sel.x + ',' + sel.y) : null;
    const ring = !app.ui.placeType && !app.ui.moveId && app.ui.ringOpen && (selB || selLot) ? ringHtml(app, selB, selLot) : '';
    const raid = (s.raids || []).slice().sort((a, b) => a.arrive - b.arrive)[0] || null;
    const night = ['night', 'dusk'].includes(ctx.scene.light.phase);
    const building = app.ui.buildMode || app.ui.placeType || app.ui.moveId;
    const rank = titleOf(s).rank;
    // v21 : scène peinte (canvas) ; les boutons ci-dessous ne gardent que la zone cliquable, le nom et les signaux
    app._paint = { state: s, f, R: paintRes(f, gfxOf(s), cityCam(app).z), items: cityItems(app, ctx, { film, night, raid, rank }), gopts: groundOpts(app, ctx, film) };
    app._life = lifeData(app, ctx, film, lifeDensity(film ? { ...s, raids: [] } : s, { phase: ctx.scene.light.phase, season: ctx.scene.season, gfx: gfxOf(s) }));
    const selPath = sel ? `<path class="iso-selpath" d="${diamondPath(f, sel.x, sel.y)}"/>` : '';
    const rectPath = (r) => { const a = toScreen(f, r.x0, r.y0), b = toScreen(f, r.x1 + 1, r.y0), c = toScreen(f, r.x1 + 1, r.y1 + 1), d = toScreen(f, r.x0, r.y1 + 1); return `M${a.sx} ${a.sy}L${b.sx} ${b.sy}L${c.sx} ${c.sy}L${d.sx} ${d.sy}Z`; };
    const future = app.ui.architect ? futureStages(s).map((st) => `<path class="iso-future" d="${rectPath(st.rect)}"/><text class="iso-future-t" x="${Math.round(toScreen(f, st.rect.x1 + 1, st.rect.y0).sx)}" y="${Math.round(toScreen(f, st.rect.x1 + 1, st.rect.y0).sy)}">${st.size}×${st.size} · HdV ${st.th}</text>`).join('') : '';
    const growing = app.ui.wallGrow && Date.now() - app.ui.wallGrow < 2500;
    const ph = app.ui.photo;
    return `<div class="city-layout">
      <div class="stage city-stage iso-stage ${app.ui.layer ? 'layer-on' : ''} ${building ? 'building' : ''} ${app.ui.photo ? 'photo' : ''} ${app.ui.architect ? 'architect' : ''} wind-${WIND[s.weather?.type] ?? 1} ${sceneClasses(ctx.scene)}" style="--banner:${bannerColor(s)}">
        ${sceneLayersHtml(ctx.scene, 'city')}
        <div class="mapvp city-vp iso" id="city-vp" data-zl="${cityZoomLevel(cam.z)}">
          <div class="mapvp-inner iso-world" style="width:${Math.round(f.width)}px;height:${Math.round(f.height)}px;transform: translate(${cam.x}px, ${cam.y}px) scale(${cam.z})">
            <div class="paint-slot pg" aria-hidden="true"></div>
            <svg class="iso-overlay" width="${Math.round(f.width)}" height="${Math.round(f.height)}" aria-hidden="true">${future}${selPath}<path id="iso-hl" class="iso-hl" d=""/></svg>
            <div class="paint-slot ps ${growing ? 'grow' : ''}" aria-hidden="true"></div>
            ${raid && !film ? reuse('iso-walls', raidColumnHtml(s, f, raid)) : ''}
            <div class="city-grid iso-objs ${s.meta.theme || ''} ${ups.count > 12 ? 'calm-ups' : ''}">${parts.join('')}${placeHints(app, ctx)}</div>
            <div class="castle-slot wx-slot" style="width:${Math.round(f.width)}px;height:${Math.round(f.height)}px" aria-hidden="true"><div class="scene-fx in-map"><div class="fx-light" style="--lt: rgba(${ctx.scene.light.tint.join(',')},${ctx.scene.light.a.toFixed(3)})"></div><div class="fx-clouds" style="animation-delay:-${Math.round((Date.now() / 1000) % 140)}s"></div><div class="fx-wx"></div><div class="fx-sign"></div></div></div>
          </div>
          <div class="ring-wrap" id="city-ring" data-x="${sel ? sel.x : ''}" data-y="${sel ? sel.y : ''}">${ring}</div>
          <div class="map-tip" id="city-tip" role="tooltip"></div>
          ${harvestBubble(app)}
        </div>
        ${building ? buildPanel(app, mods, ups) : ''}
        <div class="plan-bars">
        ${app.ui.planPreview ? `<div class="plan-bar" role="status">📐 Aperçu du plan : les silhouettes pâles montrent les nouvelles places. <button class="mini primary" data-action="plans">Appliquer ou modifier</button> <button class="mini ghost" data-action="plan-close">Fermer l’aperçu</button></div>` : ''}
        ${app.ui.architect && !ph ? `<div class="plan-bar arch-bar" role="status">📐 Mode architecte : choisissez un bâtiment dans « Construire », puis cliquez une case pour poser sa silhouette (rien n’est payé). Cliquez une silhouette pour la retirer. Les pointillés montrent les agrandissements à venir. <span class="small">${ghosts(s).length}/${ARCH.max}</span> <button class="mini" data-action="build-mode">🔨 Choisir</button> ${ghosts(s).length ? '<button class="mini ghost" data-action="arch-clear">Tout effacer</button>' : ''} <button class="mini primary" data-action="architect">Terminer</button></div>` : ''}
        ${ph ? `<div class="plan-bar photo-bar" role="toolbar" aria-label="Mode photo">📷 <label>Heure <select data-change="photo-set" data-k="hour">${Object.entries(PHOTO_HOURS).map(([h, n]) => `<option value="${h}" ${+ph.hour === +h ? 'selected' : ''}>${n}</option>`).join('')}</select></label> <label>Saison <select data-change="photo-set" data-k="season">${Object.entries(PHOTO_SEASONS).map(([k, n]) => `<option value="${k}" ${ph.season === k ? 'selected' : ''}>${n}</option>`).join('')}</select></label> <button class="btn primary" data-action="photo-shot">Enregistrer l’image</button> <button class="btn ghost" data-action="photo-exit">Quitter</button></div>` : ''}
        ${reorgBar(app)}${film ? `<div class="plan-bar film-bar" role="status">🎞️ Le film du château : ${esc(film.label)} <button class="mini ghost" data-action="film-stop">Arrêter</button></div>` : ''}
        </div>
      </div>
    </div>`;
  },
  actions: {
    harvest: (app, el) => { const at = el.getBoundingClientRect(); const r = app.act(() => collectHarvest(app.state, el.dataset.id, computeMods(app.state)), (r) => `🪙 Bonus récolté : ${Object.entries(r.got).map(([k, v]) => `${fmt(v)} ${RESOURCES[k]?.icon || k}`).join(' ')}`); if (r?.got) flyGains({ x: at.left + at.width / 2, y: at.top }, r.got); },
    'harvest-all': (app, el) => { const at = el.getBoundingClientRect(); const r = app.act(() => collectHarvest(app.state, null, computeMods(app.state)), (r) => `🪙 Ressources bonus récoltées : ${Object.entries(r.got).map(([k, v]) => `${fmt(v)} ${RESOURCES[k]?.icon || k}`).join(' ')}`); if (r?.got) flyGains({ x: at.left + at.width / 2, y: at.top }, r.got); },
    'reorg-preview': (app) => {
      const R = app.state.castle?.reorg;
      if (app.ui.planPreview || !R) { app.ui.planPreview = null; app.render(); return; }
      app.ui.planPreview = Object.fromEntries(Object.entries(R.positions).filter(([id]) => app.state.city.buildings[id]));
      app.render();
    },
    'reorg-undo': (app) => { if (!confirm('Revenir à l’ancienne disposition (bâtiments hors les murs) ? Ils restent actifs, mais mal placés au regard des nouvelles règles.')) return; app.ui.planPreview = null; app.act(() => undoReorganize(app.state), (r) => `Ancienne disposition rétablie (${r.back} bâtiment${r.back > 1 ? 's' : ''})`); },
    'reorg-hide': (app) => { app.ui.reorgHide = true; app.render(); },
    'film-stop': (app) => { app.ui.film = null; if (app._filmTimer) { clearInterval(app._filmTimer); app._filmTimer = null; } app.render(); },
    enlarge: (app) => {
      const p = enlargePreview(app.state);
      if (!p.ok) return app.toast(p.reason, 'bad');
      if (!p.free && !app.confirmSpend(p.cost, 'l’agrandissement de l’enceinte')) return;
      const r = app.act(() => enlargeCastle(app.state, (c) => pay(app.state, c)), (x) => `🏰 L’enceinte s’agrandit : ${x.size} × ${x.size}${x.moved ? ` (${x.moved} bâtiment${x.moved > 1 ? 's' : ''} de campagne déplacé${x.moved > 1 ? 's' : ''} hors des murs)` : ''}`);
      if (r?.ok) { app.ui.wallGrow = Date.now(); const vp = document.getElementById('city-vp'); if (vp) { centerOnTown(app, vp); vp._apply?.(); } }
    },
    architect: (app) => { app.ui.architect = !app.ui.architect; app.ui.photo = null; if (!app.ui.architect) { app.ui.placeType = null; } app.render(); },
    'arch-clear': (app) => { if (confirm('Effacer toutes les silhouettes planifiées ?')) app.act(() => clearGhosts(app.state), 'Plan de l’architecte effacé'); },
    'film-start': (app) => {
      const frames = filmPlan(app.state, 40);
      if (frames.length < 2) return app.toast('Le château est trop jeune pour un film : revenez quand il aura grandi.', 'info');
      if (app._filmTimer) clearInterval(app._filmTimer);
      let i = 0;
      const show = () => { const fr = frames[i]; app.ui.film = { ids: fr.ids, rect: fr.rect, label: `${new Date(fr.t).toLocaleDateString('fr-FR')} · ${fr.n} bâtiment${fr.n > 1 ? 's' : ''}` }; app.render(); };
      app.ui.ringOpen = false; app.ui.citySel = null;
      show();
      const reduce = document.documentElement.classList.contains('reduce-motion');
      app._filmTimer = setInterval(() => { i++; if (i >= frames.length) { clearInterval(app._filmTimer); app._filmTimer = null; setTimeout(() => { if (!app._filmTimer) { app.ui.film = null; app.render(); } }, 1800); return; } show(); }, reduce ? 900 : 380);
    },
    'photo-mode': (app) => { app.ui.photo = { hour: [8, 13, 19, 23].reduce((a, h) => (Math.abs(h - localHour()) < Math.abs(a - localHour()) ? h : a), 13), season: cityScene({ state: app.state, ui: {} }).season }; app.ui.architect = false; app.ui.ringOpen = false; app.ui.citySel = null; app.ui.buildMode = false; document.body.classList.add('photo-mode'); app.render(); },
    'photo-set': (app, el) => { const ph = app.ui.photo; if (!ph) return; ph[el.dataset.k] = el.dataset.k === 'hour' ? +el.value : el.value; app.mapDirty = true; app.render(); },
    'photo-exit': (app) => { app.ui.photo = null; document.body.classList.remove('photo-mode'); app.mapDirty = true; app.render(); },
    'photo-shot': (app) => {
      const world = document.querySelector('#city-vp .iso-world');
      if (!world) return;
      const t0 = performance.now();
      savePhoto(world, cityScene(app).light, castleName(app.state)).then((r) => app.toast(`📷 Image enregistrée (${Math.round(r.size / 1024)} Ko, ${Math.round(performance.now() - t0)} ms)`, 'good')).catch((e) => app.toast('Image impossible : ' + e.message, 'bad'));
    },
    'trophy-auto': (app) => app.act(() => { const n = autoPlaceTrophies(app.state).length; return n ? { ok: true, n } : { ok: false, reason: 'Aucune place libre dans la ville fortifiée (agrandissez-la) ou aucun trophée à exposer' }; }, (r) => `🏆 ${r.n} trophée${r.n > 1 ? 's' : ''} exposé${r.n > 1 ? 's' : ''} dans la cour`),
    'trophy-mode': (app, el) => { app.ui.placeTrophy = el.dataset.key; app.ui.placeType = null; app.ui.placeDeco = null; app.ui.moveId = null; app.render(); },
    'monument-orient': (app, el) => { if (confirm('Cette orientation est définitive. Confirmer ?')) app.act(() => setOrientation(app.state, el.dataset.k), (r) => `🗿 Monument consacré : ${r.name}`); },
    'tile-up': (app, el) => { app.ui.citySel = { x: +el.dataset.x, y: +el.dataset.y }; app.ui.placeType = null; app.ui.moveId = null; app.ui.focusUpgrade = true; app.ui.ringOpen = false; app.go('bldg'); },
    plans: (app) => openPlans(app, app.ui.planPreview || null),
    'plan-close': (app) => { app.ui.planPreview = null; app.mapDirty = true; app.render(); },
    'up-toggle': (app) => { app.state.meta.showUpgrades = !showUpgrades(app.state); app.render(); app.save(); },
    'up-list': (app) => openUpgradeList(app),
    'rename-castle': (app) => openRenameCastle(app),
    tile: (app, el) => {
      const x = +el.dataset.x, y = +el.dataset.y;
      const s = app.state;
      if (app.ui.moveId) {
        const id = app.ui.moveId;
        const b = s.city.buildings[id];
        const r = app.act(() => moveBuilding(s, id, x, y), 'Bâtiment déplacé');
        if (r?.ok) { app.ui.moveId = null; app.ui.citySel = { x, y }; app.render(); }
        void b;
        return;
      }
      // v20 : mode architecte (silhouettes gratuites) ; hors de ce mode, un clic sur une silhouette la fait bâtir
      if (app.ui.architect) {
        if (ghostAt(s, x, y)) { app.act(() => removeGhost(s, x, y), 'Silhouette retirée'); return; }
        if (app.ui.placeType) { app.act(() => addGhost(s, app.ui.placeType, x, y), 'Silhouette posée'); return; }
      }
      if (!app.ui.placeType && !app.ui.moveId && !buildingAt(s, x, y) && ghostAt(s, x, y)) {
        const g = ghostAt(s, x, y);
        if (!app.confirmSpend(getUpgradeInfo(s, g.type, 1).cost, 'cette construction prévue')) return;
        const r = app.act(() => orPlan(s, startBuild(s, g.type, x, y), { kind: 'build', type: g.type, x, y }), planMsg(`${BUILDINGS[g.type].name} : construction lancée (plan de l’architecte)`));
        if (r?.ok !== false) { pruneGhosts(s); app.render(); }
        return;
      }
      if (app.ui.placeType) {
        const type = app.ui.placeType;
        const r = app.act(() => orPlan(s, startBuild(s, type, x, y), { kind: 'build', type, x, y }), planMsg('Construction lancée'));
        if (r?.ok) { app.ui.placeType = null; app.ui.citySel = { x, y }; app.render(); }
        return;
      }
      if (app.ui.placeTrophy) {
        const key = app.ui.placeTrophy;
        const r = app.act(() => placeTrophy(s, key, x, y), 'Trophée exposé dans la cour');
        if (r?.ok) { app.ui.placeTrophy = null; app.render(); }
        return;
      }
      if (app.ui.placeDeco) {
        const key = app.ui.placeDeco;
        const r = app.act(() => placeDeco(s, key, x, y), 'Décoration placée');
        if (r?.ok) { app.ui.placeDeco = null; app.render(); }
        return;
      }
      // v16 « Le Château » : un bâtiment ou un terrain vague → anneau ; une autre case → sa fiche, en fenêtre
      app.ui.citySel = { x, y };
      if (buildingAt(s, x, y) || vacantLots(s).some((l) => l.x === x && l.y === y)) { app.ui.ringOpen = true; app.render(); }
      else { app.ui.ringOpen = false; app.go('bldg'); }
    },
    'build-tab': (app, el) => { app.ui.buildTab = el.dataset.k; app.ui.placeType = null; app.ui.placeDeco = null; app.render(); },
    'deco-mode': (app, el) => { app.ui.placeDeco = el.dataset.key; app.ui.placeType = null; app.ui.moveId = null; app.render(); },
    'ring-close': (app) => { app.ui.ringOpen = false; app.ui.citySel = null; app.render(); },
    'ring-info': (app) => { app.ui.ringOpen = false; app.go('bldg'); },
    'lot-build': (app, el) => {
      const s = app.state, type = el.dataset.type, x = +el.dataset.x, y = +el.dataset.y;
      if (!app.confirmSpend(getUpgradeInfo(s, type, 1).cost, 'cette construction')) return;
      const r = app.act(() => orPlan(s, startBuild(s, type, x, y), { kind: 'build', type, x, y }), planMsg('Construction lancée'));
      if (r?.ok !== false) { app.ui.ringOpen = false; if (app.ui.win) app.closeWin(); else app.render(); }
    },
    places: (app) => openPlaces(app),
    'castle-defense': (app) => { document.querySelector('.castle-card')?.scrollIntoView({ block: 'start', behavior: 'smooth' }); },
    ...castleActions,
    build: (app, el) => { if (!app.confirmSpend(getUpgradeInfo(app.state, el.dataset.type, 1).cost, 'cette construction')) return; app.act(() => orPlan(app.state, startBuild(app.state, el.dataset.type, +el.dataset.x, +el.dataset.y), { kind: 'build', type: el.dataset.type, x: +el.dataset.x, y: +el.dataset.y }), planMsg('Construction lancée')); },
    upgrade: (app, el) => { const b = app.state.city.buildings[el.dataset.id]; if (b && !app.confirmSpend(getUpgradeInfo(app.state, b.type, b.level + 1).cost, 'cette amélioration')) return; app.act(() => orPlan(app.state, startUpgrade(app.state, el.dataset.id), { kind: 'upgrade', bid: el.dataset.id }), planMsg('Amélioration lancée')); },
    clear: (app, el) => app.act(() => startClear(app.state, +el.dataset.x, +el.dataset.y), 'Déblaiement lancé'),
    move: (app, el) => { app.ui.moveId = el.dataset.id; app.ui.placeType = null; app.ui.ringOpen = false; app.ui.buildMode = true; if (app.ui.win) app.closeWin(false); app.mapDirty = true; app.render(); },
    'place-mode': (app, el) => { app.ui.placeType = el.dataset.type; app.ui.moveId = null; app.ui.placeDeco = null; app.ui.buildMode = true; if (app.ui.win) app.closeWin(false); app.mapDirty = true; app.render(); },
    'city-risk': (app) => { app.ui.cityRisk = !app.ui.cityRisk; app.render(); },
    'cancel-mode': (app) => { app.ui.moveId = null; app.ui.placeType = null; app.ui.placeDeco = null; app.ui.placeTrophy = null; app.ui.citySel = null; app.render(); },
    demolish: (app, el) => {
      if (!confirm('Démolir ce bâtiment ? Aucun remboursement.')) return;
      app.act(() => demolish(app.state, el.dataset.id), 'Bâtiment démoli');
      app.ui.citySel = null; app.render();
    },
    repair: (app, el) => app.act(() => repairBuilding(app.state, el.dataset.id), 'Bâtiment réparé'),
    'repair-all': (app) => { app.mapDirty = true; app.act(() => { const n = repairAll(app.state); return n ? { ok: true, n } : { ok: false, reason: 'Ressources insuffisantes pour réparer' }; }, (r) => `${r.n} bâtiment${r.n > 1 ? 's' : ''} réparé${r.n > 1 ? 's' : ''}`); },
    recipe: (app, el) => { app.state.city.buildings[el.dataset.id].recipe = +el.value; app.render(); app.save(); },
    expand: (app) => app.act(() => expandDomain(app.state), 'Le domaine s’agrandit ! Le prochain agrandissement de la ville fortifiée est offert.'),
    'city-zoom': (app, el) => { const vp = document.getElementById('city-vp'); if (!vp) return; zoomAt(cityCam(app), +el.dataset.z, vp.clientWidth / 2, vp.clientHeight / 2, CITY_ZMIN, CITY_ZMAX); vp._apply(); },
    'city-fit': (app) => { const vp = document.getElementById('city-vp'); if (!vp) return; const c = vp.querySelector('.mapvp-inner'); const cam = cityCam(app); cam.z = Math.max(CITY_ZMIN, Math.min(CITY_SCALE, fitZoom(vp.clientWidth, vp.clientHeight, c.offsetWidth, c.offsetHeight))); vp._apply(); },
    'city-center': (app) => { const vp = document.getElementById('city-vp'); if (!vp) return; centerOnTown(app, vp); vp._apply(); },
    pause: (app, el) => { const b = app.state.city.buildings[el.dataset.id]; b.paused = !b.paused; app.render(); },
    deco: (app, el) => app.act(() => placeDeco(app.state, el.dataset.key, +el.dataset.x, +el.dataset.y), 'Décoration placée'),
  },
};
// v16 : la fiche d'un bâtiment agit comme la carte du royaume, même ouverte depuis un autre écran
bldgView.actions = cityView.actions;
export default cityView;
