// v16 « Le Château » — Carte d'un avant-poste : sa petite ville, son enceinte, ses bâtiments, son chantier.
// Ne fait que lire l'état ; toutes les règles sont dans systems/outposts.js et systems/territory.js.
import { OUTPOST_BUILDINGS, obCost, TOWN_FORT, VOCATIONS, TOWN_SIZES } from '../../data/outposts.js';
import { OUTPOST_MAX_LEVEL } from '../../data/territories.js';
import { RESOURCES } from '../../data/resources.js';
import {
  ensureTown, townBuildings, hallPos, tileFree, vocationOf, townFx, townSlots, townUsed, townBuildCheck, townBuild, townUpgradeCheck,
  townUpgrade, townFortCheck, townFort, townExpandCheck, townExpand, moveTownBuilding, demolishTownBuilding, catLevels, townThreatMult,
} from '../../systems/outposts.js';
import { specOf, outpostReport, upgradeOutpost, fillGarrison, outpostFort } from '../../systems/territory.js';
import { outpostLabel } from '../../systems/identity.js';
import { stabLevel, stabOf } from '../../systems/stability.js';
import { resIcon } from '../icons.js';
import { fmt, fmtTime } from '../../core/util.js';
import { esc, costList } from '../components.js';

const DECO_IC = { bush: '🌿', rock: '🪨', tree: '🌳', pine: '🌲', water: '💧', reed: '🌾', ruin: '🏚️', ash: '🌋' };
const CAT_NAME = { agricole: 'Agricole', industriel: 'Industrielle', militaire: 'Militaire', commercial: 'Commerciale', savoir: 'Savoir' };
const wallTier = (w) => (w <= 0 ? 0 : w <= 3 ? 1 : w <= 7 ? 2 : 3); // pieux, palissade, pierre, grande muraille
const WALL_NAME = ['Pieux plantés', 'Palissade', 'Muraille de pierre', 'Grande muraille'];

const cur = (app) => {
  const k = app.ui.outpost, t = app.state.territories?.[k];
  if (t) ensureTown(t);
  return { k, t };
};
const fxLine = (type, lvl) => {
  const d = OUTPOST_BUILDINGS[type].fx;
  const p = (v) => `${Math.round(v * lvl * 1000) / 10} %`;
  if (d.prodRes) return `${d.prodRes.slice(0, 3).map((r) => RESOURCES[r]?.name || r).join(', ')}${d.prodRes.length > 3 ? '…' : ''} +${p(d.prod)}`;
  if (d.prodAll) return `Production +${p(d.prodAll)}`;
  if (d.upkeepFood) return `Entretien en nourriture −${p(d.upkeepFood)}`;
  if (d.garrison) return `Soldat ×${(1 + d.garrison * lvl).toFixed(1)} · défense +${p(d.def)}`;
  if (d.cityDef) return `Défense de la ville +${p(d.cityDef)}`;
  if (d.gold) return `Or +${d.gold * lvl}/h · caravanes +${p(d.caravan)}`;
  if (d.stab) return `Stabilité cible +${d.stab * lvl}`;
  return '';
};

function tileHtml(app, t, x, y) {
  const T = t.town, s = app.state;
  const hp = hallPos(T.w, T.h);
  const sel = app.ui.opSel;
  const isSel = sel && sel.x === x && sel.y === y;
  const j = T.job;
  const b = townBuildings(t).find((q) => q.x === x && q.y === y);
  const working = j && ((j.kind === 'build' && j.x === x && j.y === y) || (j.kind === 'up' && b && j.id === b.id));
  const timer = working ? `<span class="op-job" data-end="${j.end}">🔨 ${fmtTime(j.end - Date.now())}</span>` : '';
  const moving = app.ui.opMove;
  if (hp.x === x && hp.y === y) {
    return `<button class="op-t hall ${isSel ? 'sel' : ''}" data-action="op-tile" data-x="${x}" data-y="${y}" aria-label="Hôtel de ville de l’avant-poste, niveau ${t.level || 1}" title="Hôtel de ville de l’avant-poste">
      <span class="op-ic">🏰</span><span class="op-lv" aria-hidden="true">${t.level || 1}</span><span class="op-n">Hôtel de ville</span>${j && (j.kind === 'fort' || j.kind === 'expand') ? `<span class="op-job" data-end="${j.end}">🔨 ${fmtTime(j.end - Date.now())}</span>` : ''}</button>`;
  }
  if (b) {
    const d = OUTPOST_BUILDINGS[b.type];
    return `<button class="op-t bld cat-${d.cat} ${isSel ? 'sel' : ''} ${moving === b.id ? 'moving' : ''}" data-action="op-tile" data-x="${x}" data-y="${y}" aria-label="${esc(d.name)}, niveau ${b.level}" title="${esc(d.name)} · ${esc(fxLine(b.type, b.level))}">
      <span class="op-ic">${d.icon}</span><span class="op-lv" aria-hidden="true">${b.level}</span><span class="op-n">${esc(d.name)}</span>${timer}</button>`;
  }
  const ter = T.terrain[y * T.w + x];
  if (ter !== 'plain') return `<span class="op-t deco" aria-hidden="true">${DECO_IC[ter] || ''}</span>`;
  const can = moving ? tileFree(t, x, y) : true;
  void s;
  return `<button class="op-t free ${isSel ? 'sel' : ''} ${moving && can ? 'target' : ''}" data-action="op-tile" data-x="${x}" data-y="${y}" aria-label="Case libre (${x + 1}, ${y + 1})${moving ? ' : déplacer ici' : ' : bâtir'}" title="${moving ? 'Déplacer ici' : 'Case libre : bâtir'}">${working ? `<span class="op-ic">🏗️</span>${timer}` : '<span class="op-plus" aria-hidden="true">+</span>'}</button>`;
}

function panel(app, t, k) {
  const s = app.state;
  const sel = app.ui.opSel;
  const T = t.town;
  if (!sel) {
    const voc = vocationOf(t);
    return `<div class="build-panel op-panel compact" role="region" aria-label="Avant-poste">
      <div class="op-sum"><b>${esc(outpostLabel(t))}</b> · niveau ${t.level || 1} · ${voc ? `${VOCATIONS[voc].icon} ${esc(VOCATIONS[voc].name)}` : 'aucune vocation'} · ${townUsed(t)}/${townSlots(t)} emplacements · ${T.job ? `chantier ${fmtTime(T.job.end - Date.now())}` : 'aucun chantier'}</div>
      <div class="small muted">Touchez l’hôtel de ville pour gérer l’avant-poste, une case libre pour bâtir, un bâtiment pour l’améliorer.</div></div>`;
  }
  const hp = hallPos(T.w, T.h);
  const close = '<button class="mini ghost" data-action="op-close" aria-label="Fermer">✕</button>';
  // Hôtel de ville : l'avant-poste entier
  if (sel.x === hp.x && sel.y === hp.y) {
    const rep = outpostReport(s, k);
    const sp = specOf(t);
    const voc = vocationOf(t);
    const cl = catLevels(t);
    const fortBtn = (w) => { const c = townFortCheck(s, t, w); const F = TOWN_FORT[w]; return `<div class="op-row"><span>${F.icon} ${F.name} ${T.fort[w] || 0}/${Math.min(F.max, F.maxPerLevel * (t.level || 1))}</span>${c.ok ? costList(c.cost, s) : ''}<button class="mini ${c.ok ? 'primary' : ''}" data-action="op-fort" data-w="${w}" ${c.ok ? '' : `disabled title="${esc(c.reason)}"`}>⬆ ${c.ok ? `Niv. ${c.next} · ${fmtTime(c.time * 1000)}` : esc(c.reason)}</button></div>`; };
    const ex = townExpandCheck(s, t);
    return `<div class="build-panel op-panel" role="region" aria-label="Hôtel de ville de l’avant-poste">
      <div class="bp-head"><b>🏰 ${esc(outpostLabel(t))} · niveau ${t.level || 1}/${OUTPOST_MAX_LEVEL}</b><div class="bp-tools"><button class="mini" data-action="nav" data-view="territories">📋 Fiche complète</button>${close}</div></div>
      <div class="op-cols">
        <div>
          <div class="small">${sp ? `${sp.icon} ${esc(sp.name)}` : '<span class="req">Spécialisation à choisir (fiche complète)</span>'} · ${stabLevel(stabOf(t)).icon} stabilité ${Math.round(stabOf(t))} · garnison ${rep.st.garrison}/${rep.st.need} ${rep.st.garrison < rep.st.need ? `<button class="mini" data-action="op-garrison">Compléter</button>` : ''}</div>
          <div class="small">Production : ${Object.entries(rep.prod).filter(([, v]) => v > 0).map(([r, v]) => `${resIcon(r, 14, RESOURCES[r]?.icon)} ${fmt(v)}/h`).join(' ') || '—'} · entretien ${Object.entries(rep.upkeep).map(([r, v]) => `${resIcon(r, 14, RESOURCES[r]?.icon)} ${fmt(v)}/h`).join(' ')}</div>
          <div class="small">Vocation : ${voc ? `<b>${VOCATIONS[voc].icon} ${esc(VOCATIONS[voc].name)}</b> — ${esc(VOCATIONS[voc].role)}` : `aucune (${Object.entries(cl).map(([c, n]) => `${CAT_NAME[c]} ${n}`).join(', ') || 'aucun bâtiment'} ; il en faut 3 niveaux, sans égalité)`}</div>
          <div class="small muted">Menaces : ×${townThreatMult(s, t).toFixed(2)} · ${esc(WALL_NAME[wallTier(T.fort.wall || 0)])}${outpostFort(t) > 0 ? ` · protection au combat +${Math.round(outpostFort(t) * 100)} % (un seul front)` : ''}</div>
        </div>
        <div>
          ${rep.up.status !== 'max' ? `<div class="op-row"><span>⬆ Avant-poste → ${(t.level || 1) + 1}</span>${rep.up.cost ? costList(rep.up.cost, s) : ''}<button class="mini ${rep.up.status === 'ready' ? 'primary' : ''}" data-action="op-up" ${rep.up.status === 'ready' ? '' : `disabled title="${esc(rep.up.reasons[0] || '')}"`}>Améliorer</button></div>` : '<div class="small">Niveau maximal.</div>'}
          ${fortBtn('wall')}${fortBtn('moat')}
          <div class="op-row"><span>↔ Agrandir ${ex.ok ? `→ ${ex.size[0]} × ${ex.size[1]}` : ''}</span>${ex.ok ? costList(ex.cost, s) : ''}<button class="mini ${ex.ok ? 'primary' : ''}" data-action="op-expand" ${ex.ok ? '' : `disabled title="${esc(ex.reason)}"`}>${ex.ok ? fmtTime(ex.time * 1000) : esc(ex.reason)}</button></div>
        </div>
      </div></div>`;
  }
  const b = townBuildings(t).find((q) => q.x === sel.x && q.y === sel.y);
  if (b) {
    const d = OUTPOST_BUILDINGS[b.type];
    const u = townUpgradeCheck(s, t, b.id);
    const voc = vocationOf(t);
    return `<div class="build-panel op-panel" role="region" aria-label="${esc(d.name)}">
      <div class="bp-head"><b>${d.icon} ${esc(d.name)} · niveau ${b.level}</b><div class="bp-tools"><button class="mini" data-action="op-move" data-id="${b.id}">✥ Déplacer</button><button class="mini ghost" data-action="op-demolish" data-id="${b.id}">🧨 Démolir</button>${close}</div></div>
      <div class="small">${esc(d.desc)} Catégorie : ${CAT_NAME[d.cat]}${voc === d.cat ? ' (vocation : +25 %)' : ''}.</div>
      <div class="small">Maintenant : ${esc(fxLine(b.type, b.level))}${u.ok ? ` · niveau ${u.next} : ${esc(fxLine(b.type, u.next))}` : ''}</div>
      <div class="op-row">${u.ok ? costList(u.cost, s) : ''}<button class="mini ${u.ok ? 'primary' : ''}" data-action="op-upgrade" data-id="${b.id}" ${u.ok ? '' : `disabled title="${esc(u.reason)}"`}>⬆ ${u.ok ? `Améliorer · ${fmtTime(u.time * 1000)}` : esc(u.reason)}</button></div></div>`;
  }
  // Case libre : que bâtir ?
  return `<div class="build-panel op-panel" role="region" aria-label="Bâtir dans l’avant-poste">
    <div class="bp-head"><b>Bâtir ici · ${townUsed(t)}/${townSlots(t)} emplacements</b><div class="bp-tools">${close}</div></div>
    <div class="bp-items">${Object.entries(OUTPOST_BUILDINGS).map(([type, d]) => { const c = townBuildCheck(s, t, type, sel.x, sel.y); return `<button class="bp-item op-item cat-${d.cat}" data-action="op-build" data-type="${type}" ${c.ok ? '' : `disabled`} title="${esc(d.desc)}${c.ok ? '' : ' — ' + esc(c.reason)}"><span class="bp-ic">${d.icon}</span><span class="bp-n">${esc(d.name)}</span><span class="bp-c">${esc(CAT_NAME[d.cat])}</span><span class="bp-c">${Object.entries(obCost(type, 1)).map(([r, v]) => `${resIcon(r, 12, RESOURCES[r]?.icon)}${fmt(v)}`).join(' ')}</span></button>`; }).join('')}</div>
    <div class="small muted">Un chantier à la fois par avant-poste. La catégorie qui cumule 3 niveaux devient la vocation de l’avant-poste.</div></div>`;
}

export default {
  id: 'outpost',
  title: 'Avant-poste',
  icon: '🚩',
  render(app) {
    const { k, t } = cur(app);
    if (!t) return '<div class="empty-state"><p>Cet avant-poste n’existe plus.</p><button class="btn" data-action="toggle-map">🏰 Retour au château</button></div>';
    const T = t.town;
    const voc = vocationOf(t);
    const rows = [];
    for (let y = 0; y < T.h; y++) for (let x = 0; x < T.w; x++) rows.push(tileHtml(app, t, x, y));
    const w = T.fort.wall || 0, m = T.fort.moat || 0, tier = wallTier(w);
    const grow = T.job?.kind === 'expand' ? TOWN_SIZES[Math.min(3, T.exp + 1)] : null;
    return `<div class="outpost-layout"><div class="stage op-stage ter-${esc(t.terrain)} ${voc ? 'voc-' + voc : ''} ${app.ui.opSel ? 'has-panel' : ''}" style="--voc:${voc ? VOCATIONS[voc].color : '#8a7a5a'}">
      <div class="op-title"><span class="op-ban" aria-hidden="true">${voc ? VOCATIONS[voc].icon : '🚩'}</span><b>${esc(outpostLabel(t))}</b> <span class="small">${voc ? esc(VOCATIONS[voc].name) : 'Avant-poste'} · ${T.w} × ${T.h}</span></div>
      <div class="op-board" style="--w:${T.w};--h:${T.h}">
        <div class="op-moat ${m ? 'on' : ''}" style="--m:${m}">
          <div class="op-wall t${tier}" aria-label="${esc(WALL_NAME[tier])} niveau ${w}">
            ${tier >= 2 ? '<i class="op-tow tl"></i><i class="op-tow tr"></i><i class="op-tow bl"></i><i class="op-tow br"></i>' : ''}
            <div class="op-grid" role="grid" aria-label="Ville de l’avant-poste">${rows.join('')}</div>
            <i class="op-gate" aria-hidden="true"></i>
            ${grow ? `<span class="op-grow small">Agrandissement → ${grow[0]} × ${grow[1]}</span>` : ''}
          </div>
        </div>
      </div>
      ${panel(app, t, k)}
    </div></div>`;
  },
  tick(app) {
    const { t } = cur(app);
    if (!t) return;
    for (const el of document.querySelectorAll('#view .op-job[data-end]')) {
      const left = +el.dataset.end - Date.now();
      if (left <= 0) { app.mapDirty = true; app.dirty = true; return; }
      el.textContent = '🔨 ' + fmtTime(left);
    }
  },
  actions: {
    'op-tile': (app, el) => {
      const { k, t } = cur(app);
      const x = +el.dataset.x, y = +el.dataset.y;
      if (app.ui.opMove) {
        const r = moveTownBuilding(app.state, k, app.ui.opMove, x, y);
        app.ui.opMove = null;
        if (!r.ok) app.toast(r.reason, 'bad'); else { app.ui.opSel = { x, y }; app.toast('Bâtiment déplacé', 'good'); }
      } else app.ui.opSel = app.ui.opSel && app.ui.opSel.x === x && app.ui.opSel.y === y ? null : { x, y };
      void t;
      app.mapDirty = true; app.render();
    },
    'op-close': (app) => { app.ui.opSel = null; app.ui.opMove = null; app.mapDirty = true; app.render(); },
    'op-build': (app, el) => { const { k } = cur(app); const s = app.ui.opSel; app.act(() => townBuild(app.state, k, el.dataset.type, s.x, s.y), `Chantier lancé : ${OUTPOST_BUILDINGS[el.dataset.type].name}`); app.mapDirty = true; },
    'op-upgrade': (app, el) => { const { k } = cur(app); app.act(() => townUpgrade(app.state, k, el.dataset.id), 'Amélioration lancée'); app.mapDirty = true; },
    'op-fort': (app, el) => { const { k } = cur(app); app.act(() => townFort(app.state, k, el.dataset.w), `${TOWN_FORT[el.dataset.w].name} : chantier lancé`); app.mapDirty = true; },
    'op-expand': (app) => { const { k } = cur(app); app.act(() => townExpand(app.state, k), 'Agrandissement lancé'); app.mapDirty = true; },
    'op-up': (app) => { const { k } = cur(app); app.act(() => upgradeOutpost(app.state, k), 'Avant-poste amélioré'); app.mapDirty = true; },
    'op-garrison': (app) => { const { k } = cur(app); app.act(() => fillGarrison(app.state, k), (r) => `${r.moved} soldats envoyés`); app.mapDirty = true; },
    'op-move': (app, el) => { app.ui.opMove = el.dataset.id; app.ui.opSel = null; app.toast('Choisissez une case libre', 'good'); app.mapDirty = true; app.render(); },
    'op-demolish': (app, el) => {
      const { k, t } = cur(app);
      const b = t.town.b[el.dataset.id];
      if (!b) return;
      app.confirm(`<h2>Démolir ${esc(OUTPOST_BUILDINGS[b.type].name)} ?</h2><p>Le bâtiment disparaît, ses effets aussi. Rien n’est remboursé.</p>`, 'Démolir', () => { app.act(() => demolishTownBuilding(app.state, k, b.id), 'Bâtiment démoli'); app.ui.opSel = null; app.mapDirty = true; app.render(); });
    },
  },
};
