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
import { repairBuilding, repairCost } from '../../systems/automation.js';
import { nextDomainStep, expandDomain, DOMAIN_GROW } from '../../systems/domain.js';
import { WORK_SECTORS } from '../../data/workers.js';
import { allBuildings, buildingAt, terrainAt, adjacencyBonus, placementCheck, thLevel, levelOf, proximityEffects } from '../../systems/city.js';
import { startBuild, startUpgrade, startClear, buildRequirement, getUpgradeInfo, moveBuilding, demolish, moveCost, CLEAR_COST, placeDeco, planConstruction, upgradeCheck, upgradeSummary } from '../../systems/construction.js';
import { castleName } from '../../systems/identity.js';
import { ERAS, eraOf, TH_MILESTONES, thRequirements } from '../../data/eras.js';
import { ensureArtDefs, buildingSvg, buildingIcon, terrainSvg, plainVariant, roadSvg, upIcon } from '../art.js';
import { openUpgradeList, openRenameCastle } from '../upgrades.js';
import { castleUnderSvg, castleOverSvg } from '../castleArt.js';
import { ringHtml, lotPanel, zoneBlock, castleCard, castleActions, screenButtons, openPlaces } from '../castleUi.js';
import { ruleText } from '../../systems/castle.js';
import { vacantLots, zoneAt, castleStage, wallStyle, freeMoveActive as freeMove } from '../../systems/castle.js';
import { FLANKS, ZONES } from '../../data/castle.js';
import { armyTotals } from '../../systems/economy.js';

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
  if (showUpgrades(s)) for (const u of upgradeSummary(s, mods).list) if (!u.fort) up.set(u.bid, u);
  const planned = new Set((s.queues.planned || []).map((p) => p.bid).filter(Boolean));
  // v14 : aperçu des risques (incendie selon le voisinage, zone inondable) — calculé seulement s'il est affiché
  const risk = app.ui.cityRisk ? new Map(Object.values(s.city.buildings).map((b) => [b.id, riskBand(fireRisk(s, b))])) : null;
  const flood = app.ui.cityRisk ? new Set(floodZone(s).map((b) => b.id)) : null;
  // v15 : ce que la carte doit montrer (feu, crue, sécheresse, saison, signes), d'après l'état réel
  const scene = sceneState(s, Date.now(), localHour());
  const burning = new Set(scene.burning), flooded = new Set(scene.floodIds), charred = new Set(scene.damaged);
  // v16 : terrains vagues (bâtiments « menu » à bâtir), forge au travail, foule du marché selon les caravanes
  const lots = new Map(vacantLots(s).map((l) => [l.x + ',' + l.y, l]));
  const crafting = (s.queues.craft || []).length > 0;
  const crowd = Math.min(5, (s.caravans || []).length * 2 + ((s.market?.trades || 0) > 0 ? 1 : 0));
  return { s, mods, at, q, up, planned, risk, flood, scene, burning, flooded, charred, lots, crafting, crowd, place: app.ui.placeType || (app.ui.moveId && s.city.buildings[app.ui.moveId]?.type), sel: app.ui.citySel };
}

function roadMask(ctx, x, y) {
  const link = (dx, dy) => { const o = ctx.at.get((x + dx) + ',' + (y + dy)); return !!o && o.type !== 'deco'; };
  return { n: link(0, -1), e: link(1, 0), s: link(0, 1), w: link(-1, 0) };
}

function tileHtml(app, x, y, ctx) {
  const s = ctx.s;
  const t = terrainAt(s, x, y);
  const b = ctx.at.get(x + ',' + y) || null;
  const selected = ctx.sel && ctx.sel.x === x && ctx.sel.y === y;
  const q = b ? ctx.q.get(b.id) : ctx.q.get(`c:${x},${y}`);
  const cls = ['tile', 't-' + t];
  if (t === 'plain') cls.push('v' + plainVariant(x, y));
  // v15 : le terrain est peint d'un seul tenant sous la grille (src/ui/atlas.js) ; la case ne porte que le bâtiment
  let inner = '';
  let hint = '';
  let label = TERRAIN_NAME[t];
  if (b) {
    cls.push('has-b');
    label = b.type === 'deco' ? bName(b) : `${bName(b)} niveau ${b.level}`;
    if (b.type === 'road') inner += roadSvg(roadMask(ctx, x, y));
    else if (b.type === 'deco') inner += `<span class="t-deco">${COSMETICS[b.deco]?.icon || ''}</span>`;
    else {
      inner += buildingSvg(b.type, b.level, 'b-art', b.type === 'monument' ? ORIENTS[b.orient]?.color : null);
      const major = b.type === 'townhall' || b.type === 'castle' || b.type === 'monument';
      if (major) cls.push('major');
      inner += `<span class="t-name ${major ? 'major' : ''}">${esc(b.type === 'townhall' ? castleName(s) : bName(b))}</span>`;
      if (b.level > 0) inner += `<span class="t-lvl" aria-hidden="true">${b.level}</span>`;
      const u = ctx.up.get(b.id);
      if (u && !q) {
        if (u.status === 'ready') { cls.push('st-ready'); inner += `<span class="t-up ready" data-action="tile-up" data-x="${x}" data-y="${y}" title="Amélioration possible : cliquez pour voir le coût">${upIcon('ready')}</span>`; }
        else if (u.status === 'lack' || u.status === 'queue') inner += `<span class="t-up blocked" data-action="tile-up" data-x="${x}" data-y="${y}" title="${esc(u.reasons[0] || 'Amélioration bloquée')}">${upIcon('lack')}</span>`;
      }
      if (ctx.planned.has(b.id)) inner += '<span class="t-flag plan" title="Amélioration planifiée">🗓</span>';
      if (b.starved) { cls.push('st-alert'); inner += '<span class="t-flag warn" title="Manque de matières premières">!</span>'; }
      if (b.damaged) { cls.push('st-alert'); inner += '<span class="t-flag fire" title="Endommagé : production −50 %">🔥</span>'; }
      if (b.paused) inner += '<span class="t-flag pause" title="Chaîne en pause">⏸</span>';
      // v15 : état visible : bâtiment en feu (flammes, fumée), sous l'eau (crue), ruines fumantes (endommagé)
      // v16 : vie du château liée à l'état : fumée de la forge quand elle travaille, foule au marché selon les caravanes
      if (ctx.crafting && (b.type === 'forge' || b.type === 'armory') && !ctx.burning.has(b.id)) { cls.push('working'); inner += '<span class="fx-smoke work" aria-hidden="true"></span>'; }
      if (b.type === 'market' && ctx.crowd) inner += `<span class="fx-crowd" aria-hidden="true">${'<i></i>'.repeat(ctx.crowd)}</span>`;
      if (ctx.burning.has(b.id)) { cls.push('burning'); inner += `<span class="fx-fire" aria-hidden="true"><i></i><i></i><i></i></span><span class="fx-smoke" aria-hidden="true"></span>`; }
      else if (ctx.charred.has(b.id)) cls.push('charred');
      if (ctx.risk) {
        const rb = ctx.risk.get(b.id);
        if (rb && rb !== 'none') { cls.push('risk-' + rb); inner += `<span class="t-risk ${rb}" title="Risque d’incendie ${RISK_NAME[rb]}">🔥</span>`; }
        if (ctx.flood.has(b.id)) { cls.push('risk-flood'); inner += '<span class="t-risk flood" title="Zone inondable : une crue peut l’endommager">🌊</span>'; }
      }
    }
  }
  if (q) {
    cls.push('st-build');
    if (b && b.level > 0) inner += '<svg class="b-art scaffold" viewBox="0 0 64 64" aria-hidden="true"><use href="#b-scaffold"/></svg>';
    inner += `<span class="t-build" title="${q.kind === 'clear' ? 'Déblaiement' : q.kind === 'build' ? 'Construction' : 'Amélioration'} en cours">🔨</span>${progress(q.start, q.end)}`;
  }
  const lot = !b && !ctx.place ? ctx.lots.get(x + ',' + y) : null;
  if (lot && !q) {
    const d = BUILDINGS[lot.type];
    cls.push('lot');
    label = `Terrain vague : ${d.name} à bâtir`;
    inner += `<span class="t-lot" aria-hidden="true"><svg viewBox="0 0 64 64" width="64" height="64"><path d="M30 60V26" stroke="#4a2f17" stroke-width="4"/><rect x="12" y="12" width="40" height="20" rx="2" fill="#c9a36a" stroke="#4a2f17" stroke-width="2.5"/><path d="M8 58h48" stroke="rgba(60,40,20,.5)" stroke-width="3" stroke-dasharray="3 4"/></svg><b>${d.icon}</b></span><span class="t-name lot-name">${esc(d.name)} · à bâtir</span>`;
  }
  if (ctx.place && !b && t === 'plain') {
    const pc = placementCheck(s, ctx.place, x, y);
    if (pc.ok) {
      const adj = adjacencyBonus(s, ctx.place, x, y, ctx.mods).total;
      hint = `<span class="t-hint ${adj > 0 ? 'pos' : ''}">${adj > 0 ? '+' + Math.round(adj * 100) + '%' : '·'}</span>`;
      cls.push('placeable');
    } else if (pc.zone) {
      // v16 : zone interdite pour ce bâtiment (croix + raison au survol : l'information ne passe pas que par la couleur)
      cls.push('zone-no');
      hint = `<span class="t-hint no" title="${esc(pc.reason)}">✕</span>`;
      label += ` — ${pc.reason}`;
    }
  }
  if (b && ctx.flooded.has(b.id)) { cls.push('flooded'); inner += '<span class="fx-water" aria-hidden="true"></span>'; }
  if (selected) cls.push('sel');
  const fl = app.ui.flashTile;
  if (fl && fl.x === x && fl.y === y && fl.until > Date.now()) cls.push('flash-good');
  return `<button class="${cls.join(' ')}" data-action="tile" data-x="${x}" data-y="${y}" aria-label="${esc(label)} (${x}, ${y}, ${ZONES[zoneAt(s, x, y)].short})">${inner}${hint}</button>`;
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
    : b.damaged ? '🔥 Endommagé (production −50 %)' : b.starved ? '⚠️ Manque de matières premières' : b.paused ? '⏸ En pause' : '✔ En activité';
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
    return `<h3>${COSMETICS[b.deco].icon} ${esc(COSMETICS[b.deco].name)}</h3><p class="muted">Décoration. Dans les faubourgs, près de maisons, d’un marché ou d’une taverne, elle remonte le moral des ouvriers ; dans la cour, celui de la garnison.</p>${zoneBlock(app, b)}
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
  return `<div class="b-panel-head">${buildingSvg(b.type, b.level, 'b-art b-art-panel', b.type === 'monument' ? ORIENTS[b.orient]?.color : null)}<div><h3>${def.icon} ${esc(def.name)} <span class="lvl">niv. ${b.level}/${def.maxLevel}</span></h3>
    ${b.type === 'townhall' ? `<div class="castle-name">🏰 <b>${esc(castleName(s))}</b> <button class="mini ghost" data-action="rename-castle" title="Renommer le château principal">✎ Renommer</button></div><div class="small muted">Château principal de ${esc(s.meta.kingdomName)}</div>` : ''}</div></div>
    <p class="muted">${esc(def.desc)}</p>
    ${zoneBlock(app, b)}
    ${b.type === 'monument' ? monumentBlock(s, b) : ''}
    ${b.type === 'townhall' ? eraBlock(s, b) : ''}
    ${b.damaged ? `<div class="panel-sub damaged"><b>🔥 Endommagé</b> : production réduite de moitié. ${costList(repairCost(b, mods), s)} <button class="mini primary" data-action="repair" data-id="${b.id}">Réparer</button></div>` : ''}
    ${def.recipes && b.level > 0 ? `<div class="panel-sub"><h4>Recette</h4><select data-change="recipe" data-id="${b.id}">${def.recipes.map((r, i) => `<option value="${i}" ${(b.recipe || 0) === i ? 'selected' : ''}>${esc(r.name)}</option>`).join('')}</select></div>` : ''}
    ${b.level > 0 && sectorOfBuilding(b.type) && s.workers?.length ? `<div class="small muted">👷 Secteur ${esc(WORK_SECTORS[sectorOfBuilding(b.type)].name)} : ${s.workers.filter((w) => w.job?.sector === sectorOfBuilding(b.type)).length} ouvrier(s) (+${Math.round((mods['work.' + sectorOfBuilding(b.type)] || 0) * 100)}%)</div>` : ''}
    ${b.level > 0 && b.type !== 'road' ? `<div class="small ${roadConnected(s).has(b.id) ? 'ok' : 'muted'}">${roadConnected(s).has(b.id) ? '✔ Relié au réseau de routes (+5%)' : '🟫 Non relié aux routes : une route pavée jusqu’à l’hôtel de ville donne +5%'}</div>` : ''}
    ${q ? `<div class="panel-sub"><b>${q.kind === 'build' ? 'Construction' : 'Amélioration'} en cours</b> → niv. ${q.level} · ${countdown(q.end)}${progress(q.start, q.end)}${speedupLine(s, q)}</div>` : ''}
    ${b.level > 0 ? prodBlock(s, b, mods) : ''}
    ${effects ? `<div class="panel-sub"><h4>Effets</h4>${Object.entries(effects).map(([k, v]) => `<div class="small">${esc(effectName(k))} : <b>${fmtEffect(k, v)}</b></div>`).join('')}
      ${Object.keys(prox).length ? `<div class="small ok">✔ Bonus de proximité : ${Object.entries(prox).map(([k, v]) => `${esc(effectName(k))} ${pct(v)}`).join(', ')}</div>` : def.near || def.adjFx ? '<div class="small off">✗ Bonus de proximité inactif</div>' : ''}</div>` : ''}
    ${info && !q ? upgradeBlock(app, b, def, next, info, mods) : ''}
    ${!info ? '<div class="panel-sub">Niveau maximum atteint.</div>' : ''}
    <div class="row gap">
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

// Caméra de la carte du royaume (conservée entre deux rendus)
// v13.2 : vue du royaume plus grande par défaut (échelle 1,3) ; tout le dessin suit (bâtiments, pastilles, textes)
export const CITY_SCALE = 1.3;
const CITY_ZMIN = 0.25, CITY_ZMAX = 2.8;
// Niveaux de détail : vue globale (far), intermédiaire (mid), rapprochée (near). Les pastilles d'état gardent une
// taille lisible quel que soit le zoom (--bz compense l'échelle), les noms n'apparaissent qu'en vue rapprochée.
export const cityZoomLevel = (z) => (z < 0.55 ? 'far' : z < 1.05 ? 'mid' : 'near');

function onCityCam(vp, cam) {
  const zl = cityZoomLevel(cam.z);
  if (vp.dataset.zl !== zl) vp.dataset.zl = zl;
  // v16 : --bz réécrit seulement par paliers de 0,1 (chaque réécriture recalcule le style de toutes les cases)
  const bz = (Math.round(Math.min(2.2, Math.max(1, 0.95 / cam.z)) * 10) / 10).toFixed(1);
  if (vp._bz !== bz) { vp._bz = bz; vp.style.setProperty('--bz', bz); }
  // v16 : animations des bâtiments en pause pendant que la caméra bouge (chaque image resterait à repeindre sinon)
  if (!vp.classList.contains('moving')) vp.classList.add('moving');
  clearTimeout(vp._mv); vp._mv = setTimeout(() => vp.classList.remove('moving'), 280);
  vp.querySelector('#city-tip')?.classList.remove('on');
  placeRing(vp, cam);
}
// v16 : l'anneau d'un bâtiment est posé hors de la carte transformée (taille constante quel que soit le zoom),
// recentré à chaque mouvement de caméra et gardé dans l'écran (téléphone)
function placeRing(vp, cam) {
  const r = vp.querySelector('#city-ring');
  if (!r || r.dataset.x === '' || !r.firstElementChild) return;
  const x = cam.x + (+r.dataset.x + 0.5) * CITY_TILE * cam.z, y = cam.y + (+r.dataset.y + 0.5) * CITY_TILE * cam.z;
  const m = 70;
  // Jamais sous la barre « Construire » posée sur la carte (mesurée une fois par rendu)
  if (vp._ringTop === undefined) { const st = vp.parentElement?.querySelector('.stage-top'); vp._ringTop = st ? Math.max(m, st.offsetTop + st.offsetHeight - vp.offsetTop + 66) : m; }
  const top = Math.min(vp._ringTop, vp.clientHeight - m);
  r.style.transform = `translate(${Math.max(m, Math.min(vp.clientWidth - m, x))}px, ${Math.max(top, Math.min(vp.clientHeight - m, y))}px)`;
}
function cityCam(app) { return (app.ui.cityCam ||= { x: 0, y: 0, z: CITY_SCALE, init: false }); }
function centerOnTown(app, vp, at = null) {
  const cam = cityCam(app);
  const th = at || Object.values(app.state.city.buildings).find((b) => b.type === 'townhall');
  if (!at) cam.z = (window.innerWidth < 700 ? 0.8 : 1) * CITY_SCALE;
  else cam.z = Math.max(cam.z, 0.9 * CITY_SCALE);
  if (th) { cam.x = vp.clientWidth / 2 - (th.x + 0.5) * CITY_TILE * cam.z; cam.y = vp.clientHeight / 2 - (th.y + 0.5) * CITY_TILE * cam.z; }
  cam.init = true;
}

// Infobulle : suit le curseur, jamais pendant un glisser, recalculée seulement quand la case change
function bindCityTip(app, vp) {
  if (vp.dataset.tip) return;
  vp.dataset.tip = '1';
  const tip = () => vp.querySelector('#city-tip');
  let cur = '';
  vp.addEventListener('pointermove', (e) => {
    const el = tip();
    if (!el) return;
    if (e.pointerType === 'touch' || vp.classList.contains('dragging') || e.target.closest('.map-tools')) { el.classList.remove('on'); cur = ''; return; }
    const t = e.target.closest('.tile');
    if (!t) { el.classList.remove('on'); cur = ''; return; }
    const k = t.dataset.x + ',' + t.dataset.y;
    if (k !== cur) { cur = k; try { el.innerHTML = tipHtml(app, +t.dataset.x, +t.dataset.y); } catch (err) { console.error(err); } }
    const r = vp.getBoundingClientRect();
    const px = e.clientX - r.left, py = e.clientY - r.top;
    const w = el.offsetWidth || 220, h = el.offsetHeight || 80;
    el.style.left = Math.max(6, Math.min(r.width - w - 6, px + 16)) + 'px';
    el.style.top = Math.max(6, py + 18 + h > r.height ? py - h - 12 : py + 18) + 'px';
    el.classList.add('on');
  });
  vp.addEventListener('pointerleave', () => { tip()?.classList.remove('on'); cur = ''; });
}

// v15 : sol peint (mis en cache tant que terrain, saison et sécheresse ne changent pas)
function attachGround(app) {
  const slot = document.querySelector('#city-vp .ground-slot');
  if (!slot) return;
  const s = app.state, scene = sceneState(s, Date.now(), localHour()), q = gfxOf(s);
  const cv = paintCityGround(s, scene, groundKey(s, scene, q), q);
  if (cv.parentElement !== slot) { slot.innerHTML = ''; slot.appendChild(cv); }
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
};
function buildPanel(app, mods, ups) {
  const s = app.state, tab = app.ui.buildTab || 'prod';
  let items = '';
  if (tab === 'deco') {
    const owned = Object.keys(s.meta.owned || {}).filter((k) => COSMETICS[k]?.type === 'deco' && !allBuildings(s).some((b) => b.deco === k));
    items = owned.map((k) => `<button class="bp-item ${app.ui.placeDeco === k ? 'active' : ''}" data-action="deco-mode" data-key="${k}" title="Placer : ${esc(COSMETICS[k].name)} (faubourgs : moral des ouvriers ; cour : moral de la garnison)"><span class="bp-ic">${COSMETICS[k].icon}</span><span class="bp-n">${esc(COSMETICS[k].name)}</span></button>`).join('') || '<span class="muted small">Aucune décoration à placer. Elles se gagnent (jalons, saison, événements).</span>';
  } else {
    items = Object.entries(BUILDINGS).filter(([t, d]) => d.grid !== false && t !== 'road' && BUILD_TABS[tab].cats.includes(d.cat)).map(([t, d]) => {
      if (d.isPlace) { const b = allBuildings(s).find((x) => x.type === t); return `<button class="bp-item" ${b ? `data-action="goto-tile" data-x="${b.x}" data-y="${b.y}"` : 'disabled'} title="${esc(d.desc)} ${b ? 'Posé d’office : cliquez pour le voir.' : 'Se pose de lui-même quand sa fonction s’ouvre.'}">${buildingIcon(t, 30)}<span class="bp-n">${esc(d.name)}</span><span class="bp-c small muted">${b ? 'posé' : 'à venir'}</span></button>`; }
      const req = buildRequirement(s, t);
      const { cost } = getUpgradeInfo(s, t, 1, mods);
      return `<button class="bp-item ${app.ui.placeType === t ? 'active' : ''}" data-action="place-mode" data-type="${t}" ${req ? `disabled title="${esc(d.name)} — ${esc(req)}"` : `title="${esc(d.name)} — ${esc(d.desc)} · ${esc(ruleText(t))}"`} aria-label="${esc(d.name)}">${buildingIcon(t, 30)}<span class="bp-n">${esc(d.name)}</span><span class="bp-c small">${req ? esc(req) : Object.entries(cost).slice(0, 2).map(([r, v]) => `${fmt(v)} ${RESOURCES[r]?.icon || ''}`).join(' ')}</span></button>`;
    }).join('');
    if (tab === 'mil') items += ['wall', 'moat'].map((type) => { const u = upgradeCheck(s, 'fort:' + type, mods); const lvl = s.city.fort[type] || 0; return `<button class="bp-item" data-action="upgrade" data-id="fort:${type}" ${['ready', 'queue'].includes(u.status) ? '' : `disabled title="${esc(u.reasons?.[0] || '')}"`}>${BUILDINGS[type].icon}<span class="bp-n">${esc(BUILDINGS[type].name)} → ${lvl + 1}</span><span class="bp-c small">${u.cost ? Object.entries(u.cost).slice(0, 2).map(([r, v]) => `${fmt(v)} ${RESOURCES[r]?.icon || ''}`).join(' ') : esc(u.reasons?.[0] || '')}</span></button>`; }).join('');
  }
  const mode = app.ui.moveId ? `Déplacer : cliquez une case libre${freeMove(s) ? ' (gratuit)' : ''}.` : app.ui.placeType ? `Placer ${esc(BUILDINGS[app.ui.placeType].name)} : cliquez une case. Les % sont le bonus de placement ; ✕ = zone interdite (${esc(ruleText(app.ui.placeType))}).` : app.ui.placeDeco ? 'Placer la décoration : cliquez une case libre.' : 'Choisissez un bâtiment. La grille et les zones sont affichées.';
  return `<div class="build-panel" role="region" aria-label="Construire">
    <div class="bp-head"><nav class="bp-tabs" role="tablist">${Object.entries(BUILD_TABS).map(([k, t]) => `<button class="bp-tab ${tab === k ? 'active' : ''}" role="tab" aria-selected="${tab === k}" data-action="build-tab" data-k="${k}">${t.icon} ${t.name}</button>`).join('')}</nav>
      <div class="bp-tools"><button class="mini ${app.ui.cityRisk ? 'primary' : ''}" data-action="city-risk" aria-pressed="${!!app.ui.cityRisk}" title="Aperçu des risques : incendie et zone inondable">🔥 Risques</button><button class="mini" data-action="up-list" title="Améliorations possibles">⬆ ${ups.count}</button>${nextDomainStep(s) ? '<button class="mini" data-action="expand" title="Agrandir le domaine (voir la fiche de l’hôtel de ville)">🗺️ Domaine</button>' : ''}<button class="mini ghost" data-action="build-mode" title="Fermer (Échap)">✕</button></div></div>
    <div class="small bp-hint" role="status">${mode}</div>
    <div class="bp-items">${items}</div>
  </div>`;
}

export default {
  id: 'city', title: 'Royaume', icon: '🏰',
  tick(app) { const st = document.querySelector('.city-stage'); if (st) { updateSceneFx(st, sceneState(app.state, Date.now(), localHour()), 'city'); attachGround(app); } },
  after(app) {
    const vp = document.getElementById('city-vp');
    if (!vp) return;
    fitStage();
    attachGround(app);
    const cam0 = cityCam(app);
    if (!cam0.init) centerOnTown(app, vp);
    if (cam0.centerOn) { centerOnTown(app, vp, cam0.centerOn); cam0.centerOn = null; }
    if (app.ui.cityFocus) { centerOnTown(app, vp, app.ui.cityFocus); app.ui.cityFocus = null; }
    bindPanZoom(vp, { getCam: () => cityCam(app), zMin: CITY_ZMIN, zMax: CITY_ZMAX, onChange: (cam) => onCityCam(vp, cam) });
    bindCityTip(app, vp);
    if (app.ui.focusUpgrade) { document.getElementById('up-block')?.scrollIntoView({ block: 'nearest' }); app.ui.focusUpgrade = false; }
    if (!app._cityResize) { app._cityResize = true; window.addEventListener('resize', () => { fitStage(); document.getElementById('city-vp')?._apply?.(); }); }
  },
  render(app) {
    const s = app.state;
    const mods = computeMods(s);
    const sel = app.ui.citySel;
    ensureArtDefs();
    const ctx = cityCtx(app, mods);
    const parts = [];
    for (let y = 0; y < s.city.h; y++) for (let x = 0; x < s.city.w; x++) parts.push(tileHtml(app, x, y, ctx));
    const grid = parts.join('');
    const ups = upgradeSummary(s, mods);
    const cam = cityCam(app);
    // v16 « Le Château » : la carte seule, en plein écran. Un bâtiment ou un terrain vague sélectionné ouvre l'anneau ;
    // la fiche s'ouvre en fenêtre (« Informations ») ; Construire ouvre le panneau du bas.
    const selB = sel ? buildingAt(s, sel.x, sel.y) : null;
    const selLot = sel && !selB ? ctx.lots.get(sel.x + ',' + sel.y) : null;
    const ring = !app.ui.placeType && !app.ui.moveId && app.ui.ringOpen && (selB || selLot) ? ringHtml(app, selB, selLot) : '';
    const W = s.city.w * CITY_TILE, Hh = s.city.h * CITY_TILE;
    const raid = (s.raids || []).slice().sort((a, b) => a.arrive - b.arrive)[0] || null;
    const garrison = Object.entries(s.army || {}).filter(([u]) => !['scout', 'spy'].includes(u)).reduce((a, [, n]) => a + n, 0);
    const night = ['night', 'dusk'].includes(ctx.scene.light.phase);
    const carts = (s.caravans || []).length;
    const building = app.ui.buildMode || app.ui.placeType || app.ui.moveId;
    return `<div class="city-layout">
      <div class="stage city-stage ${building ? 'building' : ''} ${sceneClasses(ctx.scene)}">
        ${sceneLayersHtml(ctx.scene, 'city')}
        <div class="mapvp city-vp" id="city-vp" data-zl="${cityZoomLevel(cam.z)}" style="--bz:${(Math.round(Math.min(2.2, Math.max(1, 0.95 / cam.z)) * 10) / 10).toFixed(1)}">
          <div class="mapvp-inner" style="transform: translate(${cam.x}px, ${cam.y}px) scale(${cam.z})"><div class="ground-slot" style="width:${W}px;height:${Hh}px"></div><div class="castle-slot under">${castleUnderSvg(s, { W, H: Hh })}</div><div class="city-grid painted ${s.meta.theme || ''} ${ups.count > 12 ? 'calm-ups' : ''}" style="--cw:${s.city.w}">${grid}</div><div class="castle-slot over">${castleOverSvg(s, { W, H: Hh, night, raid, garrison, carts })}</div></div>
          <div class="ring-wrap" id="city-ring" data-x="${sel ? sel.x : ''}" data-y="${sel ? sel.y : ''}">${ring}</div>
          <div class="map-tip" id="city-tip" role="tooltip"></div>
        </div>
        ${building ? buildPanel(app, mods, ups) : ''}
      </div>
    </div>`;
  },
  actions: {
    'monument-orient': (app, el) => { if (confirm('Cette orientation est définitive. Confirmer ?')) app.act(() => setOrientation(app.state, el.dataset.k), (r) => `🗿 Monument consacré : ${r.name}`); },
    'tile-up': (app, el) => { app.ui.citySel = { x: +el.dataset.x, y: +el.dataset.y }; app.ui.placeType = null; app.ui.moveId = null; app.ui.focusUpgrade = true; app.render(); },
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
      if (app.ui.placeType) {
        const type = app.ui.placeType;
        const r = app.act(() => orPlan(s, startBuild(s, type, x, y), { kind: 'build', type, x, y }), planMsg('Construction lancée'));
        if (r?.ok) { app.ui.placeType = null; app.ui.citySel = { x, y }; app.render(); }
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
    'cancel-mode': (app) => { app.ui.moveId = null; app.ui.placeType = null; app.ui.placeDeco = null; app.ui.citySel = null; app.render(); },
    demolish: (app, el) => {
      if (!confirm('Démolir ce bâtiment ? Aucun remboursement.')) return;
      app.act(() => demolish(app.state, el.dataset.id), 'Bâtiment démoli');
      app.ui.citySel = null; app.render();
    },
    repair: (app, el) => app.act(() => repairBuilding(app.state, el.dataset.id), 'Bâtiment réparé'),
    recipe: (app, el) => { app.state.city.buildings[el.dataset.id].recipe = +el.value; app.render(); app.save(); },
    expand: (app) => app.act(() => expandDomain(app.state), 'Le domaine s’agrandit !'),
    'city-zoom': (app, el) => { const vp = document.getElementById('city-vp'); if (!vp) return; zoomAt(cityCam(app), +el.dataset.z, vp.clientWidth / 2, vp.clientHeight / 2, CITY_ZMIN, CITY_ZMAX); vp._apply(); },
    'city-fit': (app) => { const vp = document.getElementById('city-vp'); if (!vp) return; const c = vp.querySelector('.mapvp-inner'); const cam = cityCam(app); cam.z = Math.max(CITY_ZMIN, Math.min(CITY_SCALE, fitZoom(vp.clientWidth, vp.clientHeight, c.offsetWidth, c.offsetHeight))); vp._apply(); },
    'city-center': (app) => { const vp = document.getElementById('city-vp'); if (!vp) return; centerOnTown(app, vp); vp._apply(); },
    pause: (app, el) => { const b = app.state.city.buildings[el.dataset.id]; b.paused = !b.paused; app.render(); },
    deco: (app, el) => app.act(() => placeDeco(app.state, el.dataset.key, +el.dataset.x, +el.dataset.y), 'Décoration placée'),
  },
};
