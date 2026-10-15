// Codex illustré : retrouver en un seul endroit ce que le royaume connaît (bâtiments, unités, ennemis, lieux,
// factions, technologies, artefacts, découvertes), avec dessins, descriptions et informations utiles.
import { BUILDINGS, BUILDING_CATEGORIES, buildingCost, buildingTime } from '../../data/buildings.js';
import { UNITS, ENEMY_UNITS, UNIT_CLASSES } from '../../data/units.js';
import { POI_TYPES, RIVALS } from '../../data/world.js';
import { TECHS, BRANCHES } from '../../data/techs.js';
import { ARTIFACTS } from '../../data/artifacts.js';
import { MYSTERIES } from '../../data/archaeology.js';
import { CODEX_CATS, codexState, codexEntries, codexProgress } from '../../systems/codex.js';
import { buildingSvg } from '../art.js';
import { unitIcon, gameIcon } from '../icons.js';
import { fmtTime } from '../../core/util.js';
import { esc, resChips, bar } from '../components.js';

const PERSO = { aggressive: 'agressive', isolationist: 'isolationniste', military: 'militaire', commercial: 'commerçante', technological: 'savante' };
const KIND = { gather: 'site de récolte', danger: 'lieu dangereux', town: 'cité libre', kingdom: 'royaume rival', village: 'village', breach: 'forteresse de la Brèche', boss: 'colosse' };
const vsText = (vs) => Object.entries(vs || {}).map(([c, m]) => `×${m} contre ${(UNIT_CLASSES[c]?.name || c).toLowerCase()}`).join(', ');

function entry(cat, k) {
  switch (cat) {
    case 'building': { const d = BUILDINGS[k]; return { name: d.name, art: buildingSvg(k, 3, 'b-art codex-art'), sub: BUILDING_CATEGORIES[d.cat] || '', body: d.desc, facts: [`Coût niv. 1 : ${resChips(buildingCost(k, 1))}`, `Construction niv. 1 : ${fmtTime(buildingTime(k, 1))}`, `Niveau max : ${d.maxLevel}`, d.req?.townhall ? `Hôtel de ville ${d.req.townhall} requis` : ''] }; }
    case 'unit': { const u = UNITS[k]; return { name: u.name, art: unitIcon(k, 46, u.icon), sub: UNIT_CLASSES[u.class]?.name || u.class, body: u.desc || '', facts: [`Attaque ${u.atk} · défense ${u.def} · PV ${u.hp}`, u.vs ? `Avantages : ${vsText(u.vs)}` : '', u.cost ? `Coût : ${resChips(u.cost)}` : '', `Transport ${u.carry || 0} · récolte ${u.gather || 0}/min`] }; }
    case 'enemy': { const u = ENEMY_UNITS[k]; return { name: u.name, art: `<span class="codex-emoji">${u.icon}</span>`, sub: UNIT_CLASSES[u.class]?.name || u.class, body: '', facts: [`Attaque ${u.atk} · défense ${u.def} · PV ${u.hp}`, u.vs ? `Avantages : ${vsText(u.vs)}` : '', u.rangedResist ? `Résiste aux tirs (−${Math.round(u.rangedResist * 100)} %)` : '', u.pierce ? `Perce les armures (${Math.round(u.pierce * 100)} %)` : ''] }; }
    case 'place': { const p = POI_TYPES[k]; return { name: p.name, art: `<span class="codex-emoji">${p.icon}</span>`, sub: KIND[p.kind] || p.kind, body: p.kind === 'breach' ? 'Forteresse PNJ qui évolue avec vos attaques : 4 paliers, de camp de pillards à citadelle légendaire.' : '', facts: [p.res ? `Ressource : ${p.res}` : '', p.loot ? `Butin : ${resChips(p.loot)}` : '', p.respawn ? `Réapparition : ${fmtTime(p.respawn * 1000)}` : '', p.terrain?.length ? `Terrains : ${p.terrain.join(', ')}` : ''] }; }
    case 'faction': { const f = RIVALS[+k]; return { name: f.name, art: `<span class="codex-emoji" style="color:${f.color}">${f.icon}</span>`, sub: `Seigneur : ${f.lord}`, body: `Personnalité ${PERSO[f.personality] || f.personality} ; style ${f.style === 'raider' ? 'pillard' : f.style === 'defensive' ? 'défensif' : f.style}.`, facts: [] }; }
    case 'tech': { const t = TECHS[k]; return { name: t.name, art: gameIcon('b_' + t.branch, 40, BRANCHES[t.branch]?.icon || '📜'), sub: `${BRANCHES[t.branch]?.name || t.branch} · rang ${t.tier}`, body: t.desc, facts: [t.req?.length ? `Prérequis : ${t.req.map((r) => TECHS[r]?.name || r).join(', ')}` : ''] }; }
    case 'artifact': { const a = ARTIFACTS[k]; return { name: a.name, art: `<span class="codex-emoji">${a.icon}</span>`, sub: a.cat, body: a.desc, facts: [`Origine : ${a.source}`] }; }
    case 'mystery': { const m = MYSTERIES[k]; return { name: m.name, art: `<span class="codex-emoji">${m.icon}</span>`, sub: m.place?.name || '', body: m.clue, facts: [m.reward?.text ? `Récompense : ${m.reward.text}` : ''] }; }
    default: return null;
  }
}

export default {
  id: 'codex', title: 'Codex', icon: '📖',
  render(app) {
    const s = app.state, C = codexState(s), P = codexProgress(s);
    const cat = CODEX_CATS[app.ui.codexCat] ? app.ui.codexCat : 'building';
    const q = (app.ui.codexQ || '').toLowerCase();
    const all = codexEntries(cat);
    const items = all.map((k) => ({ k, seen: !!C.seen[cat][k], e: entry(cat, k) })).filter((x) => x.e && (!q || (x.seen && x.e.name.toLowerCase().includes(q))));
    const sel = app.ui.codexSel && C.seen[cat][app.ui.codexSel] ? entry(cat, app.ui.codexSel) : null;
    return `<div class="card codex-head"><div class="row between wrap"><h2>📖 Codex des Terres Brisées</h2><span class="small muted">${P.have}/${P.total} entrées</span></div>
        ${bar(P.have, P.total)}
        <p class="small muted">Tout ce que votre royaume a construit, formé, affronté et découvert. Les entrées encore inconnues indiquent comment les révéler.</p>
        <div class="tabs codex-tabs">${Object.entries(CODEX_CATS).map(([k, c]) => `<button class="tab ${k === cat ? 'active' : ''}" data-action="cx-cat" data-k="${k}">${c.icon} ${esc(c.name)} <span class="muted small">${P.cats[k].have}/${P.cats[k].total}</span></button>`).join('')}</div>
        <div class="form-row"><input type="search" placeholder="Rechercher dans ${esc(CODEX_CATS[cat].name.toLowerCase())}…" value="${esc(app.ui.codexQ || '')}" data-change="cx-q"></div></div>
      ${sel ? `<div class="card codex-detail"><div class="codex-detail-art">${sel.art}</div><div><h3>${esc(sel.name)}</h3><div class="small muted">${esc(sel.sub)}</div>${sel.body ? `<p>${esc(sel.body)}</p>` : ''}<ul class="small">${sel.facts.filter(Boolean).map((f) => `<li>${f}</li>`).join('')}</ul><button class="mini ghost" data-action="cx-sel" data-k="">Fermer</button></div></div>` : ''}
      <div class="codex-grid">${items.map(({ k, seen, e }) => seen
        ? `<button class="codex-item" data-action="cx-sel" data-k="${esc(k)}"><span class="codex-thumb">${e.art}</span><b>${esc(e.name)}</b><span class="small muted">${esc(e.sub)}</span></button>`
        : `<div class="codex-item locked"><span class="codex-thumb">❔</span><b>???</b><span class="small muted">${esc(CODEX_CATS[cat].hint)}</span></div>`).join('') || '<p class="muted">Aucune entrée ne correspond.</p>'}</div>`;
  },
  actions: {
    'cx-cat': (app, el) => { app.ui.codexCat = el.dataset.k; app.ui.codexSel = null; app.render(); },
    'cx-sel': (app, el) => { app.ui.codexSel = el.dataset.k || null; app.render(); },
    'cx-q': (app, el) => { app.ui.codexQ = el.value; app.render(); },
  },
};
