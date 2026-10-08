import { BUILDINGS, BUILDING_CATEGORIES, levelProdFactor } from '../../data/buildings.js';
import { RESOURCES } from '../../data/resources.js';
import { COSMETICS } from '../../data/social.js';
import { fmt, fmtTime } from '../../core/util.js';
import { computeMods } from '../../systems/modifiers.js';
import { buildingRates, netRates, storageCap, protectedAmount } from '../../systems/economy.js';
import { allBuildings, buildingAt, terrainAt, adjacencyBonus, placementCheck, thLevel, proximityEffects } from '../../systems/city.js';
import { startBuild, startUpgrade, startClear, buildRequirement, getUpgradeInfo, moveBuilding, demolish, moveCost, CLEAR_COST, placeDeco } from '../../systems/construction.js';
import { esc, costList, resChips, countdown, progress, pct } from '../components.js';

const TERRAIN_ICON = { forest: '🌲', mountain: '⛰️', river: '', rubble: '🧱', plain: '' };
const TERRAIN_NAME = { forest: 'Forêt', mountain: 'Montagne', river: 'Rivière', rubble: 'Décombres', plain: 'Terrain libre' };
const NEAR_NAME = { forest: 'forêt', mountain: 'montagne', river: 'rivière' };

function tileHtml(app, x, y, mods) {
  const s = app.state;
  const t = terrainAt(s, x, y);
  const b = buildingAt(s, x, y);
  const sel = app.ui.citySel;
  const selected = sel && sel.x === x && sel.y === y;
  const q = b ? s.queues.build.find((qq) => qq.bid === b.id) : s.queues.build.find((qq) => qq.kind === 'clear' && qq.x === x && qq.y === y);
  let inner = '';
  let hint = '';
  if (b) {
    const icon = b.type === 'deco' ? COSMETICS[b.deco]?.icon : BUILDINGS[b.type].icon;
    inner = `<span class="t-icon">${icon}</span>${b.type !== 'deco' && b.level > 0 ? `<span class="t-lvl">${b.level}</span>` : ''}${b.starved ? '<span class="t-warn" title="Manque de matières premières">!</span>' : ''}`;
  } else inner = `<span class="t-icon terrain">${TERRAIN_ICON[t] || ''}</span>`;
  if (q) inner += `<span class="t-build">🔨</span>${progress(q.start, q.end)}`;
  // Mode placement : bonus potentiel
  const place = app.ui.placeType || (app.ui.moveId && s.city.buildings[app.ui.moveId]?.type);
  if (place && !b && t === 'plain') {
    const pc = placementCheck(s, place, x, y);
    if (pc.ok) {
      const adj = adjacencyBonus(s, place, x, y, mods).total;
      hint = `<span class="t-hint ${adj > 0 ? 'pos' : ''}">${adj > 0 ? '+' + Math.round(adj * 100) + '%' : '·'}</span>`;
    }
  }
  return `<button class="tile t-${t} ${selected ? 'sel' : ''} ${b ? 'has-b' : ''} ${hint ? 'placeable' : ''}" data-action="tile" data-x="${x}" data-y="${y}" title="${esc(b ? (b.type === 'deco' ? COSMETICS[b.deco].name : `${BUILDINGS[b.type].name} niv. ${b.level}`) : TERRAIN_NAME[t])}">${inner}${hint}</button>`;
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
          <div class="b-opt-head"><span class="b-icon">${def.icon}</span><b>${esc(def.name)}</b>${adj.total > 0 ? `<span class="bonus-tag">+${Math.round(adj.total * 100)}% ici</span>` : ''}</div>
          <div class="muted small">${esc(def.desc)}</div>
          ${disabled ? `<div class="req">${esc(req || p.reason)}</div>` : `<div class="b-opt-foot">${costList(cost, s)} <span class="muted small">⏱ ${fmtTime(time)}</span>
            <button class="mini primary" data-action="build" data-type="${type}" data-x="${x}" data-y="${y}">Construire</button></div>`}
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
  const capped = b.type !== 'townhall' && next > thLevel(s);
  const effects = def.effects ? def.effects(b.level || 1) : null;
  const prox = proximityEffects(s, b);
  const links = { tavern: ['heroes', 'Recruter des héros'], forge: ['craft', 'Ouvrir la forge'], laboratory: ['craft', 'Ouvrir le laboratoire'], market: ['market', 'Ouvrir le marché'],
    library: ['research', 'Recherches'], barracks: ['army', 'Former des troupes'], stable: ['army', 'Former des troupes'], workshop: ['army', 'Former des troupes'], guildhall: ['guild', 'Guilde'], castle: ['army', 'Armée'] };
  return `<h3>${def.icon} ${esc(def.name)} <span class="lvl">niv. ${b.level}</span></h3>
    <p class="muted">${esc(def.desc)}</p>
    ${q ? `<div class="panel-sub"><b>${q.kind === 'build' ? 'Construction' : 'Amélioration'} en cours</b> → niv. ${q.level} · ${countdown(q.end)}${progress(q.start, q.end)}</div>` : ''}
    ${b.level > 0 ? prodBlock(s, b, mods) : ''}
    ${effects ? `<div class="panel-sub"><h4>Effets</h4>${Object.entries(effects).map(([k, v]) => `<div class="small">${esc(effectName(k))} : <b>${k === 'storage' || k === 'marches' || k === 'heroSlots' || k === 'vision' || k === 'caravans' ? fmt(v) : pct(v)}</b></div>`).join('')}
      ${Object.keys(prox).length ? `<div class="small ok">✔ Bonus de proximité : ${Object.entries(prox).map(([k, v]) => `${esc(effectName(k))} ${pct(v)}`).join(', ')}</div>` : def.near || def.adjFx ? '<div class="small off">✗ Bonus de proximité inactif</div>' : ''}</div>` : ''}
    ${info && !q ? `<div class="panel-sub"><h4>Niveau ${next}</h4>${costList(info.cost, s)} <span class="muted small">⏱ ${fmtTime(info.time)}</span>
      ${def.prod ? `<div class="small muted">Production ×${(levelProdFactor(next) / levelProdFactor(b.level)).toFixed(2)}</div>` : ''}
      ${capped ? `<div class="req">Hôtel de ville niv. ${next} requis</div>` : `<button class="btn primary" data-action="upgrade" data-id="${b.id}">Améliorer</button>`}</div>` : ''}
    ${!info ? '<div class="panel-sub">Niveau maximum atteint.</div>' : ''}
    <div class="row gap">
      ${links[b.type] ? `<button class="btn" data-action="nav" data-view="${links[b.type][0]}">${links[b.type][1]} →</button>` : ''}
      ${b.level > 0 && b.type !== 'townhall' ? `<button class="btn ghost" data-action="move" data-id="${b.id}" title="Déplacer coûte ${moveCost(b).gold} or">Déplacer (${moveCost(b).gold} 🪙)</button>` : ''}
      ${b.type !== 'townhall' && !q ? `<button class="btn ghost danger" data-action="demolish" data-id="${b.id}">Démolir</button>` : ''}
      ${def.convert && b.level > 0 ? `<button class="btn ghost" data-action="pause" data-id="${b.id}">${b.paused ? '▶ Relancer' : '⏸ Mettre en pause'}</button>` : ''}
    </div>`;
}

const EFFECT_NAMES = { storage: 'Capacité de stockage', 'city.def': 'Défense de la ville', marches: 'Marches simultanées', heroSlots: 'Places de héros', 'train.speed': 'Vitesse de formation', 'research.speed': 'Vitesse de recherche', 'market.fee': 'Taxe du marché', caravans: 'Caravanes', 'wall.bonus': 'Bonus de muraille', vision: 'Vision', protect: 'Ressources protégées', 'prod.all': 'Toute production', 'explore.speed': 'Vitesse d’exploration', 'loot.rare': 'Butin rare', 'caravan.speed': 'Vitesse des caravanes' };
const effectName = (k) => EFFECT_NAMES[k] || k;

function fortPanel(app, mods) {
  const s = app.state;
  return ['wall', 'moat'].map((type) => {
    const def = BUILDINGS[type];
    const lvl = s.city.fort[type] || 0;
    const q = s.queues.build.find((qq) => qq.bid === 'fort:' + type);
    const req = lvl === 0 ? buildRequirement(s, type) : null;
    const info = lvl < def.maxLevel ? getUpgradeInfo(s, type, lvl + 1, mods) : null;
    const capped = lvl + 1 > thLevel(s);
    return `<div class="fort-card"><div class="b-opt-head"><span class="b-icon">${def.icon}</span><b>${esc(def.name)}</b> <span class="lvl">niv. ${lvl}</span></div>
      <div class="muted small">${esc(def.desc)}${lvl ? ` Actuel : ${pct(def.effects(lvl)['wall.bonus'])} muraille.` : ''}</div>
      ${q ? `<div>${countdown(q.end)}${progress(q.start, q.end)}</div>` : req ? `<div class="req">${esc(req)}</div>` : info ? `<div class="b-opt-foot">${costList(info.cost, s)} ${capped ? '<span class="req">HdV requis</span>' : `<button class="mini primary" data-action="upgrade" data-id="fort:${type}">${lvl ? 'Améliorer' : 'Construire'}</button>`}</div>` : ''}
    </div>`;
  }).join('');
}

export default {
  id: 'city', title: 'Royaume', icon: '🏰',
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
    let grid = '';
    for (let y = 0; y < s.city.h; y++) for (let x = 0; x < s.city.w; x++) grid += tileHtml(app, x, y, mods);
    return `<div class="city-layout">
      <div class="city-main">
        <div class="build-bar card"><span class="muted small">Construire :</span>${Object.entries(BUILDINGS).filter(([, d]) => d.grid !== false && d.cat !== 'unique').map(([t, d]) => {
          const req = buildRequirement(s, t);
          return `<button class="bb-btn ${app.ui.placeType === t ? 'active' : ''}" data-action="place-mode" data-type="${t}" ${req ? 'disabled' : ''} title="${esc(d.name)}${req ? ' — ' + esc(req) : ' — ' + esc(d.desc)}">${d.icon}</button>`;
        }).join('')}${app.ui.citySel || app.ui.placeType || app.ui.moveId ? '<button class="mini ghost" data-action="cancel-mode">✕ Annuler</button>' : ''}</div>
        <div class="city-grid ${s.meta.theme || ''}" style="--cw:${s.city.w}">${grid}</div>
        <div class="card"><h3>🧱 Fortifications</h3><div class="fort-row">${fortPanel(app, mods)}</div></div>
        <div class="card"><h3>📊 Bilan horaire</h3><div class="net-grid">${Object.entries(net).filter(([, v]) => Math.abs(v) > 0.05).sort((a, b) => b[1] - a[1]).map(([r, v]) => `<div class="net ${v < 0 ? 'neg' : ''}">${RESOURCES[r].icon} ${esc(RESOURCES[r].name)} <b>${v > 0 ? '+' : ''}${fmt(v)}</b></div>`).join('')}</div>
          <p class="muted small">Capacité : ${fmt(cap)} · Protégé des pillages : ${fmt(protectedAmount(s, mods))} par ressource. Les ressources rares et l’or ne sont pas plafonnés.</p></div>
      </div>
      <div class="city-panel card">${panel}</div>
    </div>`;
  },
  actions: {
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
        const r = app.act(() => startBuild(s, type, x, y), 'Construction lancée');
        if (r?.ok) { app.ui.placeType = null; app.ui.citySel = { x, y }; app.render(); }
        return;
      }
      app.ui.citySel = { x, y };
      app.render();
    },
    build: (app, el) => app.act(() => startBuild(app.state, el.dataset.type, +el.dataset.x, +el.dataset.y), 'Construction lancée'),
    upgrade: (app, el) => app.act(() => startUpgrade(app.state, el.dataset.id), 'Amélioration lancée'),
    clear: (app, el) => app.act(() => startClear(app.state, +el.dataset.x, +el.dataset.y), 'Déblaiement lancé'),
    move: (app, el) => { app.ui.moveId = el.dataset.id; app.ui.placeType = null; app.render(); },
    'place-mode': (app, el) => { app.ui.placeType = el.dataset.type; app.ui.moveId = null; app.render(); },
    'cancel-mode': (app) => { app.ui.moveId = null; app.ui.placeType = null; app.ui.citySel = null; app.render(); },
    demolish: (app, el) => {
      if (!confirm('Démolir ce bâtiment ? Aucun remboursement.')) return;
      app.act(() => demolish(app.state, el.dataset.id), 'Bâtiment démoli');
      app.ui.citySel = null; app.render();
    },
    pause: (app, el) => { const b = app.state.city.buildings[el.dataset.id]; b.paused = !b.paused; app.render(); },
    deco: (app, el) => app.act(() => placeDeco(app.state, el.dataset.key, +el.dataset.x, +el.dataset.y), 'Décoration placée'),
  },
};
