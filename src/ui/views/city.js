import { BUILDINGS, BUILDING_CATEGORIES, levelProdFactor } from '../../data/buildings.js';
import { RESOURCES } from '../../data/resources.js';
import { COSMETICS } from '../../data/social.js';
import { fmt, fmtTime } from '../../core/util.js';
import { computeMods } from '../../systems/modifiers.js';
import { buildingRates, netRates, storageCap, protectedAmount, recipeOf, roadConnected, sectorOfBuilding, missing } from '../../systems/economy.js';
import { repairBuilding, repairCost } from '../../systems/automation.js';
import { nextDomainStep, expandDomain, DOMAIN_GROW } from '../../systems/domain.js';
import { WORK_SECTORS } from '../../data/workers.js';
import { allBuildings, buildingAt, terrainAt, adjacencyBonus, placementCheck, thLevel, proximityEffects } from '../../systems/city.js';
import { startBuild, startUpgrade, startClear, buildRequirement, getUpgradeInfo, moveBuilding, demolish, moveCost, CLEAR_COST, placeDeco, planConstruction, upgradeCheck, upgradeSummary } from '../../systems/construction.js';
import { castleName } from '../../systems/identity.js';
import { ensureArtDefs, buildingSvg, buildingIcon, terrainSvg, plainVariant, roadSvg, upIcon } from '../art.js';
import { openUpgradeList, openRenameCastle } from '../upgrades.js';

// File pleine : le chantier est planifié et démarrera seul (ressources payées au démarrage)
const orPlan = (s, r, item) => (r.ok === false && /File de construction pleine/.test(r.reason || '') ? planConstruction(s, item) : r);
const planMsg = (label) => (r) => (r.planned ? '🗓️ File pleine : chantier planifié, il démarrera automatiquement' : label);
import { bindPanZoom, zoomAt, fitZoom } from '../panzoom.js';
import { esc, costList, resChips, countdown, progress, pct } from '../components.js';

const TERRAIN_NAME = { forest: 'Forêt', mountain: 'Montagne', river: 'Rivière', rubble: 'Décombres', plain: 'Terrain libre' };
const NEAR_NAME = { forest: 'forêt', mountain: 'montagne', river: 'rivière' };
// Taille réelle d'une case (px au zoom 1). Le zoom (molette, boutons) part de cette taille.
export const CITY_TILE = 64;

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
  return { s, mods, at, q, up, planned, place: app.ui.placeType || (app.ui.moveId && s.city.buildings[app.ui.moveId]?.type), sel: app.ui.citySel };
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
  let inner = terrainSvg(b ? (t === 'plain' ? '' : t) : t, x, y);
  let hint = '';
  let label = TERRAIN_NAME[t];
  if (b) {
    cls.push('has-b');
    label = b.type === 'deco' ? bName(b) : `${bName(b)} niveau ${b.level}`;
    if (b.type === 'road') inner += roadSvg(roadMask(ctx, x, y));
    else if (b.type === 'deco') inner += `<span class="t-deco">${COSMETICS[b.deco]?.icon || ''}</span>`;
    else {
      inner += buildingSvg(b.type, b.level);
      const major = b.type === 'townhall' || b.type === 'castle';
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
    }
  }
  if (q) {
    cls.push('st-build');
    if (b && b.level > 0) inner += '<svg class="b-art scaffold" viewBox="0 0 64 64" aria-hidden="true"><use href="#b-scaffold"/></svg>';
    inner += `<span class="t-build" title="${q.kind === 'clear' ? 'Déblaiement' : q.kind === 'build' ? 'Construction' : 'Amélioration'} en cours">🔨</span>${progress(q.start, q.end)}`;
  }
  if (ctx.place && !b && t === 'plain') {
    const pc = placementCheck(s, ctx.place, x, y);
    if (pc.ok) {
      const adj = adjacencyBonus(s, ctx.place, x, y, ctx.mods).total;
      hint = `<span class="t-hint ${adj > 0 ? 'pos' : ''}">${adj > 0 ? '+' + Math.round(adj * 100) + '%' : '·'}</span>`;
      cls.push('placeable');
    }
  }
  if (selected) cls.push('sel');
  return `<button class="${cls.join(' ')}" data-action="tile" data-x="${x}" data-y="${y}" aria-label="${esc(label)} (${x}, ${y})">${inner}${hint}</button>`;
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
            <button class="mini primary" data-action="build" data-type="${type}" data-x="${x}" data-y="${y}">Construire</button></div>${(() => { const m = missing(s, cost); return Object.keys(m).length ? `<div class="req small">Manque : ${Object.entries(m).map(([r, v]) => `${fmt(v)} ${RESOURCES[r].icon} ${esc(RESOURCES[r].name.toLowerCase())}`).join(', ')}</div>` : ''; })()}`}
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
    return `<h3>${COSMETICS[b.deco].icon} ${esc(COSMETICS[b.deco].name)}</h3><p class="muted">Décoration cosmétique.</p>
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
  return `<div class="b-panel-head">${buildingSvg(b.type, b.level, 'b-art b-art-panel')}<div><h3>${def.icon} ${esc(def.name)} <span class="lvl">niv. ${b.level}/${def.maxLevel}</span></h3>
    ${b.type === 'townhall' ? `<div class="castle-name">🏰 <b>${esc(castleName(s))}</b> <button class="mini ghost" data-action="rename-castle" title="Renommer le château principal">✎ Renommer</button></div><div class="small muted">Château principal de ${esc(s.meta.kingdomName)}</div>` : ''}</div></div>
    <p class="muted">${esc(def.desc)}</p>
    ${b.damaged ? `<div class="panel-sub damaged"><b>🔥 Endommagé</b> : production réduite de moitié. ${costList(repairCost(b, mods), s)} <button class="mini primary" data-action="repair" data-id="${b.id}">Réparer</button></div>` : ''}
    ${def.recipes && b.level > 0 ? `<div class="panel-sub"><h4>Recette</h4><select data-change="recipe" data-id="${b.id}">${def.recipes.map((r, i) => `<option value="${i}" ${(b.recipe || 0) === i ? 'selected' : ''}>${esc(r.name)}</option>`).join('')}</select></div>` : ''}
    ${b.level > 0 && sectorOfBuilding(b.type) && s.workers?.length ? `<div class="small muted">👷 Secteur ${esc(WORK_SECTORS[sectorOfBuilding(b.type)].name)} : ${s.workers.filter((w) => w.job?.sector === sectorOfBuilding(b.type)).length} ouvrier(s) (+${Math.round((mods['work.' + sectorOfBuilding(b.type)] || 0) * 100)}%)</div>` : ''}
    ${b.level > 0 && b.type !== 'road' ? `<div class="small ${roadConnected(s).has(b.id) ? 'ok' : 'muted'}">${roadConnected(s).has(b.id) ? '✔ Relié au réseau de routes (+5%)' : '🟫 Non relié aux routes : une route pavée jusqu’à l’hôtel de ville donne +5%'}</div>` : ''}
    ${q ? `<div class="panel-sub"><b>${q.kind === 'build' ? 'Construction' : 'Amélioration'} en cours</b> → niv. ${q.level} · ${countdown(q.end)}${progress(q.start, q.end)}</div>` : ''}
    ${b.level > 0 ? prodBlock(s, b, mods) : ''}
    ${effects ? `<div class="panel-sub"><h4>Effets</h4>${Object.entries(effects).map(([k, v]) => `<div class="small">${esc(effectName(k))} : <b>${k === 'storage' || k === 'marches' || k === 'heroSlots' || k === 'vision' || k === 'caravans' ? fmt(v) : pct(v)}</b></div>`).join('')}
      ${Object.keys(prox).length ? `<div class="small ok">✔ Bonus de proximité : ${Object.entries(prox).map(([k, v]) => `${esc(effectName(k))} ${pct(v)}`).join(', ')}</div>` : def.near || def.adjFx ? '<div class="small off">✗ Bonus de proximité inactif</div>' : ''}</div>` : ''}
    ${info && !q ? upgradeBlock(app, b, def, next, info, mods) : ''}
    ${!info ? '<div class="panel-sub">Niveau maximum atteint.</div>' : ''}
    <div class="row gap">
      ${links[b.type] ? `<button class="btn" data-action="nav" data-view="${links[b.type][0]}">${links[b.type][1]} →</button>` : ''}
      ${b.level > 0 && b.type !== 'townhall' ? `<button class="btn ghost" data-action="move" data-id="${b.id}" title="Déplacer coûte ${moveCost(b).gold} or">Déplacer (${moveCost(b).gold} 🪙)</button>` : ''}
      ${b.type !== 'townhall' && !q ? `<button class="btn ghost danger" data-action="demolish" data-id="${b.id}">Démolir</button>` : ''}
      ${recipeOf(b) && b.level > 0 ? `<button class="btn ghost" data-action="pause" data-id="${b.id}">${b.paused ? '▶ Relancer' : '⏸ Mettre en pause'}</button><button class="btn ghost" data-action="nav" data-view="chains">⚙️ Configurer la chaîne</button>` : ''}
    </div>`;
}

// Bloc d'amélioration : coût, durée, prérequis, bénéfices attendus et raison exacte d'une impossibilité
function upgradeBlock(app, b, def, next, info, mods) {
  const s = app.state;
  const u = upgradeCheck(s, b.id, mods);
  const gains = [];
  if (b.level > 0) {
    const r = buildingRates(s, b, mods);
    const k = levelProdFactor(next) / levelProdFactor(b.level);
    const outs = Object.entries(r.out).map(([res, v]) => `${RESOURCES[res].icon} ${fmt(v)} → <b>${fmt(v * k)}</b>/h`);
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
const fmtEffect = (k, v) => (['storage', 'marches', 'heroSlots', 'vision', 'caravans'].includes(k) ? fmt(v) : pct(v));

const EFFECT_NAMES = { storage: 'Capacité de stockage', 'city.def': 'Défense de la ville', marches: 'Marches simultanées', heroSlots: 'Places de héros', 'train.speed': 'Vitesse de formation', 'research.speed': 'Vitesse de recherche', 'market.fee': 'Taxe du marché', caravans: 'Caravanes', 'wall.bonus': 'Bonus de muraille', vision: 'Vision', protect: 'Ressources protégées', 'prod.all': 'Toute production', 'explore.speed': 'Vitesse d’exploration', 'loot.rare': 'Butin rare', 'caravan.speed': 'Vitesse des caravanes' };
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
      ${q ? `<div>${countdown(q.end)}${progress(q.start, q.end)}</div>` : req ? `<div class="req">${esc(req)}</div>` : u.cost ? `<div class="b-opt-foot">${costList(u.cost, s)} <span class="muted small">⏱ ${fmtTime(u.time)}</span> ${u.status === 'locked' ? `<span class="req">${esc(u.reasons[0])}</span>` : `<button class="mini ${ready ? 'primary' : ''}" data-action="upgrade" data-id="fort:${type}" ${u.status === 'lack' ? `disabled title="${esc(u.reasons[0] || '')}"` : ''}>${lvl ? 'Améliorer' : 'Construire'}</button>`}</div>${u.status === 'lack' ? `<div class="req small">${esc(u.reasons[0])}</div>` : ''}` : u.status === 'max' ? '<div class="small muted">Niveau maximum</div>' : ''}
    </div>`;
  }).join('');
}

// Caméra de la carte du royaume (conservée entre deux rendus)
const CITY_ZMIN = 0.25, CITY_ZMAX = 2.2;
// Niveaux de détail : vue globale (far), intermédiaire (mid), rapprochée (near). Les pastilles d'état gardent une
// taille lisible quel que soit le zoom (--bz compense l'échelle), les noms n'apparaissent qu'en vue rapprochée.
export const cityZoomLevel = (z) => (z < 0.55 ? 'far' : z < 1.05 ? 'mid' : 'near');
function onCityCam(vp, cam) {
  const zl = cityZoomLevel(cam.z);
  if (vp.dataset.zl !== zl) vp.dataset.zl = zl;
  vp.style.setProperty('--bz', String(Math.min(2.2, Math.max(1, 0.95 / cam.z))));
  vp.querySelector('#city-tip')?.classList.remove('on');
}
function cityCam(app) { return (app.ui.cityCam ||= { x: 0, y: 0, z: 1, init: false }); }
function centerOnTown(app, vp, at = null) {
  const cam = cityCam(app);
  const th = at || Object.values(app.state.city.buildings).find((b) => b.type === 'townhall');
  if (!at) cam.z = window.innerWidth < 700 ? 0.8 : 1;
  else cam.z = Math.max(cam.z, 0.9);
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

export default {
  id: 'city', title: 'Royaume', icon: '🏰',
  after(app) {
    const vp = document.getElementById('city-vp');
    if (!vp) return;
    const cam0 = cityCam(app);
    if (!cam0.init) centerOnTown(app, vp);
    if (cam0.centerOn) { centerOnTown(app, vp, cam0.centerOn); cam0.centerOn = null; }
    bindPanZoom(vp, { getCam: () => cityCam(app), zMin: CITY_ZMIN, zMax: CITY_ZMAX, onChange: (cam) => onCityCam(vp, cam) });
    bindCityTip(app, vp);
    if (app.ui.focusUpgrade) { document.getElementById('up-block')?.scrollIntoView({ block: 'nearest' }); app.ui.focusUpgrade = false; }
    if (!app._cityResize) { app._cityResize = true; window.addEventListener('resize', () => document.getElementById('city-vp')?._apply?.()); }
  },
  render(app) {
    const s = app.state;
    const mods = computeMods(s);
    const sel = app.ui.citySel;
    let panel = '';
    if (app.ui.moveId) {
      const b = s.city.buildings[app.ui.moveId];
      panel = `<h3>Déplacer ${esc(b ? BUILDINGS[b.type]?.name || 'décoration' : '')}</h3><p>Cliquez sur une case libre. Les pourcentages indiquent le bonus d’adjacence de chaque emplacement.</p><button class="btn" data-action="cancel-mode">Annuler</button>`;
    } else if (app.ui.placeType) {
      const def = BUILDINGS[app.ui.placeType];
      panel = `<h3>Placer : ${def.icon} ${esc(def.name)}</h3><p>Cliquez sur une case libre. Les pourcentages indiquent le bonus de chaque emplacement.</p><button class="btn" data-action="cancel-mode">Annuler</button>`;
    } else if (sel) {
      const b = buildingAt(s, sel.x, sel.y);
      const t = terrainAt(s, sel.x, sel.y);
      if (b) panel = buildingPanel(app, b, mods);
      else if (t === 'rubble') {
        const q = s.queues.build.find((qq) => qq.kind === 'clear' && qq.x === sel.x && qq.y === sel.y);
        panel = `<h3>🧱 Décombres</h3><p class="muted">Les ruines de la Fracture encombrent cette case. Déblayer libère de la place et rapporte des matériaux… et parfois une trouvaille.</p>
          ${q ? `${countdown(q.end)}${progress(q.start, q.end)}` : `<div class="b-opt-foot">${costList(CLEAR_COST, s)} <span class="muted small">⏱ 8s</span> <button class="btn primary" data-action="clear" data-x="${sel.x}" data-y="${sel.y}">Déblayer</button></div>`}`;
      } else if (t === 'plain') panel = buildMenu(app, sel.x, sel.y, mods);
      else panel = `<h3>${TERRAIN_NAME[t]}</h3><p class="muted">${t === 'river' ? 'La rivière irrigue les fermes, moulins, vergers et tanneries voisins. Pêcherie et port doivent la toucher.' : t === 'forest' ? 'La forêt profite aux scieries, chasseurs, herboristes et charbonnières voisins.' : 'La montagne profite aux carrières et mines voisines.'}</p>`;
    } else {
      panel = `<h3>Votre royaume</h3><p class="muted">Cliquez sur une case : décombres à déblayer, terrain libre pour construire, ou bâtiment pour l’améliorer.</p>
        <p class="small">💡 Le <b>placement compte</b> : une ferme au bord de la rivière produit +10%, une mine près des montagnes +15%, une caserne près de l’hôtel de ville forme plus vite…</p>
        <p class="small">Utilisez la barre <b>Construire</b> au-dessus de la ville : chaque case affiche alors le bonus qu’y obtiendrait le bâtiment.</p>`;
    }
    const net = netRates(s, mods);
    const cap = storageCap(s, mods);
    ensureArtDefs();
    const ctx = cityCtx(app, mods);
    const parts = [];
    for (let y = 0; y < s.city.h; y++) for (let x = 0; x < s.city.w; x++) parts.push(tileHtml(app, x, y, ctx));
    const grid = parts.join('');
    const ups = upgradeSummary(s, mods);
    const cam = cityCam(app);
    return `<div class="city-layout">
      <div class="city-main">
        <div class="build-bar card"><span class="muted small">Construire :</span>${Object.entries(BUILDINGS).filter(([, d]) => d.grid !== false && d.cat !== 'unique').map(([t, d]) => {
          const req = buildRequirement(s, t);
          return `<button class="bb-btn ${app.ui.placeType === t ? 'active' : ''}" data-action="place-mode" data-type="${t}" ${req ? 'disabled' : ''} title="${esc(d.name)}${req ? ' — ' + esc(req) : ' — ' + esc(d.desc)}" aria-label="${esc(d.name)}">${buildingIcon(t, 30)}</button>`;
        }).join('')}${app.ui.citySel || app.ui.placeType || app.ui.moveId ? '<button class="mini ghost" data-action="cancel-mode">✕ Annuler</button>' : ''}</div>
        <div class="city-toolbar">
          <button class="up-counter ${ups.count ? 'on' : ''}" data-action="up-list" title="Liste des améliorations possibles">${upIcon('ready')} <b>${ups.count}</b> amélioration${ups.count > 1 ? 's' : ''} disponible${ups.count > 1 ? 's' : ''}</button>
          <button class="mini ghost" data-action="up-toggle" aria-pressed="${showUpgrades(s)}" title="Afficher ou masquer les icônes d’amélioration sur la carte">${showUpgrades(s) ? '👁 Icônes affichées' : '🚫 Icônes masquées'}</button>
          <span class="muted small legend-inline"><span class="lg lg-ready"></span> améliorable <span class="lg lg-blocked"></span> bloquée <span class="lg lg-build"></span> chantier <span class="lg lg-alert"></span> action requise</span>
        </div>
        <div class="mapvp city-vp" id="city-vp" data-zl="${cityZoomLevel(cam.z)}" style="--bz:${Math.min(2.2, Math.max(1, 0.95 / cam.z))}">
          <div class="mapvp-inner" style="transform: translate(${cam.x}px, ${cam.y}px) scale(${cam.z})"><div class="city-grid ${s.meta.theme || ''}" style="--cw:${s.city.w}">${grid}</div></div>
          <div class="map-tip" id="city-tip" role="tooltip"></div>
          <div class="map-tools"><button class="mini" data-action="city-zoom" data-z="1.25" title="Zoomer">＋</button><button class="mini" data-action="city-zoom" data-z="0.8" title="Dézoomer">－</button><button class="mini" data-action="city-fit" title="Vue d’ensemble du royaume">⤢</button><button class="mini" data-action="city-center" title="Recentrer sur l’hôtel de ville (zoom par défaut)">🏛️</button></div>
          <div class="map-hint muted small">${s.city.w}×${s.city.h} · glisser pour déplacer · molette pour zoomer · survol : détails</div>
        </div>
        ${(() => { const st = nextDomainStep(s); return st ? `<div class="card domain-card"><h3>🗺️ Agrandir le domaine <span class="muted small">${s.city.w}×${s.city.h} cases</span></h3><div class="small muted">Étape « ${esc(st.name)} » : +${DOMAIN_GROW.w} colonnes à l’est et +${DOMAIN_GROW.h} rangées au sud de terrain vierge à aménager (forêts, montagnes, quelques décombres, rivière).</div><div class="b-opt-foot">${costList(st.cost, s)} <span class="small ${thLevel(s) >= st.th ? 'ok' : 'req'}">HdV ${st.th}</span><button class="mini primary" data-action="expand">Agrandir</button></div></div>` : ''; })()}
        <div class="card"><h3>🧱 Fortifications</h3><div class="fort-row">${fortPanel(app, mods)}</div></div>
        <div class="card"><h3>📊 Bilan horaire</h3><div class="net-grid">${Object.entries(net).filter(([, v]) => Math.abs(v) > 0.05).sort((a, b) => b[1] - a[1]).map(([r, v]) => `<div class="net ${v < 0 ? 'neg' : ''}">${RESOURCES[r].icon} ${esc(RESOURCES[r].name)} <b>${v > 0 ? '+' : ''}${fmt(v)}</b></div>`).join('')}</div>
          <p class="muted small">Capacité : ${fmt(cap)} · Protégé des pillages : ${fmt(protectedAmount(s, mods))} par ressource. Les ressources rares et l’or ne sont pas plafonnés.</p></div>
      </div>
      <div class="city-panel card">${panel}</div>
    </div>`;
  },
  actions: {
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
      app.ui.citySel = { x, y };
      app.render();
    },
    build: (app, el) => app.act(() => orPlan(app.state, startBuild(app.state, el.dataset.type, +el.dataset.x, +el.dataset.y), { kind: 'build', type: el.dataset.type, x: +el.dataset.x, y: +el.dataset.y }), planMsg('Construction lancée')),
    upgrade: (app, el) => app.act(() => orPlan(app.state, startUpgrade(app.state, el.dataset.id), { kind: 'upgrade', bid: el.dataset.id }), planMsg('Amélioration lancée')),
    clear: (app, el) => app.act(() => startClear(app.state, +el.dataset.x, +el.dataset.y), 'Déblaiement lancé'),
    move: (app, el) => { app.ui.moveId = el.dataset.id; app.ui.placeType = null; app.render(); },
    'place-mode': (app, el) => { app.ui.placeType = el.dataset.type; app.ui.moveId = null; app.render(); },
    'cancel-mode': (app) => { app.ui.moveId = null; app.ui.placeType = null; app.ui.citySel = null; app.render(); },
    demolish: (app, el) => {
      if (!confirm('Démolir ce bâtiment ? Aucun remboursement.')) return;
      app.act(() => demolish(app.state, el.dataset.id), 'Bâtiment démoli');
      app.ui.citySel = null; app.render();
    },
    repair: (app, el) => app.act(() => repairBuilding(app.state, el.dataset.id), 'Bâtiment réparé'),
    recipe: (app, el) => { app.state.city.buildings[el.dataset.id].recipe = +el.value; app.render(); app.save(); },
    expand: (app) => app.act(() => expandDomain(app.state), 'Le domaine s’agrandit !'),
    'city-zoom': (app, el) => { const vp = document.getElementById('city-vp'); if (!vp) return; zoomAt(cityCam(app), +el.dataset.z, vp.clientWidth / 2, vp.clientHeight / 2, CITY_ZMIN, CITY_ZMAX); vp._apply(); },
    'city-fit': (app) => { const vp = document.getElementById('city-vp'); if (!vp) return; const c = vp.querySelector('.mapvp-inner'); const cam = cityCam(app); cam.z = Math.max(CITY_ZMIN, Math.min(1, fitZoom(vp.clientWidth, vp.clientHeight, c.offsetWidth, c.offsetHeight))); vp._apply(); },
    'city-center': (app) => { const vp = document.getElementById('city-vp'); if (!vp) return; centerOnTown(app, vp); vp._apply(); },
    pause: (app, el) => { const b = app.state.city.buildings[el.dataset.id]; b.paused = !b.paused; app.render(); },
    deco: (app, el) => app.act(() => placeDeco(app.state, el.dataset.key, +el.dataset.x, +el.dataset.y), 'Décoration placée'),
  },
};
