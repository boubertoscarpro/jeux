import { TERRITORY_SPECS, OUTPOST_MAX_LEVEL, outpostUpgradeCost, RESPEC_COST, OUTPOST_THREATS } from '../../data/territories.js';
import { TERRAINS } from '../../data/world.js';
import { UNITS } from '../../data/units.js';
import { RESOURCES } from '../../data/resources.js';
import { fmt } from '../../core/util.js';
import { computeMods } from '../../systems/modifiers.js';
import { territoryLimit } from '../../systems/world.js';
import { specOf, outpostStatus, setSpec, upgradeOutpost, setGarrison, outpostUpkeep, garrisonNeed, outpostUpgradeCheck, specAffinity, specCategory } from '../../systems/territory.js';
import { outpostLabel } from '../../systems/identity.js';
import { openRenameOutpost } from '../upgrades.js';
import { upIcon } from '../art.js';
import { esc, costList, countdown } from '../components.js';

const prodText = (sp, lvl) => Object.entries(sp.prod || {}).map(([r, v]) => `${RESOURCES[r].icon} ${fmt(v * lvl)}/h`).join(' ');
const modText = (sp, lvl) => Object.entries(sp.mods || {}).map(([k, v]) => `${k} +${Math.round(v * lvl * 1000) / 10} %`).join(', ');

function card(app, k, t) {
  const s = app.state;
  const st = outpostStatus(s, t);
  const sp = specOf(t);
  const lvl = t.level || 1;
  const opts = TERRITORY_SPECS[t.terrain] || [];
  const cat = sp && specCategory(sp.id);
  const aff = specAffinity(s, t);
  const up = outpostUpgradeCheck(s, k);
  const units = Object.entries(UNITS).filter(([u, d]) => d.class !== 'special' && ((s.army[u] || 0) + (t.garrison?.[u] || 0)) > 0);
  return `<div class="card-sub outpost">
    <div class="row between wrap"><h3>🚩 ${esc(outpostLabel(t))} <button class="mini ghost" data-action="tr-rename" data-k="${esc(k)}" title="Renommer cet avant-poste">✎ Renommer</button></h3>
      <span class="small ${st.eff >= 1 ? 'ok' : 'bad'}">${st.eff >= 1 ? '✔ Pleinement actif' : `Efficacité ${Math.round(st.eff * 100)} %`}</span></div>
    <div class="small muted">${sp ? `${sp.icon} ${esc(sp.name)}` : 'Sans spécialité'}${cat ? ` · ${cat.icon} ${esc(cat.name)}` : ''} · (${t.x}, ${t.y}) · ${esc(TERRAINS[t.terrain].name)} · niv. ${lvl}/${OUTPOST_MAX_LEVEL}${up.status === 'ready' ? ` <span class="up-tag">${upIcon('ready')} améliorable</span>` : ''}</div>
    ${sp ? `<div class="small">Affinité avec les environs : <b class="${aff.bonus > 0 ? 'ok' : 'muted'}">+${Math.round(aff.bonus * 100)} %</b> <span class="muted">(${aff.tiles} case(s) favorable(s), ${aff.nodes} gisement(s) proche(s) ; production et bonus multipliés)</span></div>` : ''}
    ${st.reasons.map((r) => `<div class="small req">⚠️ ${esc(r)}</div>`).join('')}${t.pillagedUntil > Date.now() ? `<div class="small">Reprise dans ${countdown(t.pillagedUntil)}</div>` : ''}
    <div class="small">Bonus de terrain (si garnison complète) : ${Object.entries(TERRAINS[t.terrain].territory).map(([m, v]) => `${m} +${Math.round(v * 100)} %`).join(', ')}</div>
    ${sp ? `<div class="small">Production : ${prodText(sp, lvl) || '—'}${sp.mods ? ` · Bonus : ${modText(sp, lvl)}` : ''}${sp.relicChance ? ' · chance de fragments de relique' : ''}</div>` : ''}
    <div class="small">Entretien : ${Object.entries(outpostUpkeep(t)).map(([r, v]) => `${RESOURCES[r].icon} ${v}/h`).join(' ')} · Menace : ${esc(OUTPOST_THREATS[t.terrain]?.name || '')}${t.defended ? ` · ${t.defended} attaque(s) repoussée(s)` : ''}</div>
    <h4>Spécialisation ${t.spec ? `<span class="muted small">(reconversion : ${Object.entries(RESPEC_COST).map(([r, v]) => `${v} ${RESOURCES[r].icon}`).join(' ')}, retour au niveau 1)</span>` : ''}</h4>
    <div class="spec-grid">${opts.map((o) => { const a = specAffinity(s, t, o.id); const c2 = specCategory(o.id); return `<button class="spec ${t.spec === o.id ? 'active' : ''}" data-action="tr-spec" data-k="${k}" data-s="${o.id}" ${t.spec === o.id ? 'disabled' : ''}><b>${o.icon} ${esc(o.name)}</b>${c2 ? `<span class="small gold-text">${c2.icon} ${esc(c2.name)}</span>` : ''}<span class="small muted">${esc(o.desc)}</span><span class="small">${prodText(o, 1)} ${o.mods ? modText(o, 1) : ''} <i>par niveau</i></span><span class="small ${a.bonus > 0 ? 'ok' : 'muted'}">Affinité ici : +${Math.round(a.bonus * 100)} %</span></button>`; }).join('')}</div>
    ${sp && lvl < OUTPOST_MAX_LEVEL ? `<div class="panel-sub up-block ${up.status}"><h4>Amélioration → niveau ${lvl + 1}</h4><div class="row gap wrap">${costList(outpostUpgradeCost(lvl + 1), s)}<button class="btn small ${up.status === 'ready' ? 'primary' : ''}" data-action="tr-up" data-k="${k}" ${up.status === 'ready' ? '' : 'disabled'}>⬆ Améliorer → niv. ${lvl + 1}</button></div>
      <div class="small muted">Bénéfices : production et bonus de spécialité ×${((lvl + 1) / lvl).toFixed(2)} · garnison requise ${garrisonNeed({ level: lvl + 1 })} soldats · entretien ${Object.entries(outpostUpkeep({ level: lvl + 1 })).map(([r, v]) => `${RESOURCES[r].icon} ${v}/h`).join(' ')}</div>
      ${up.status !== 'ready' ? `<div class="req">⚠️ ${esc(up.reasons[0] || '')}${up.missing ? ' : ' + Object.entries(up.missing).map(([r, v]) => `${fmt(v)} ${RESOURCES[r].name.toLowerCase()}`).join(', ') : ''}</div>` : ''}</div>` : sp ? '<div class="small muted">Niveau maximal atteint.</div>' : ''}
    <h4>Garnison <span class="muted small">${st.garrison}/${st.need} soldats requis</span></h4>
    <div class="row gap wrap">${units.map(([u, d]) => `<label class="small">${d.icon} ${esc(d.name)} <input class="qty" type="number" min="0" max="${(s.army[u] || 0) + (t.garrison?.[u] || 0)}" value="${t.garrison?.[u] || 0}" id="g-${k}-${u}" data-u="${u}"></label>`).join('') || '<span class="muted small">Aucune troupe disponible.</span>'}
      <button class="btn small" data-action="tr-garrison" data-k="${k}">Mettre à jour la garnison</button></div>
  </div>`;
}

export default {
  id: 'territories', title: 'Territoires', icon: '🚩',
  badge: (app) => Object.entries(app.state.territories || {}).filter(([k, t]) => outpostStatus(app.state, t).eff < 1 || !t.spec || outpostUpgradeCheck(app.state, k).status === 'ready').length,
  render(app) {
    const s = app.state;
    const list = Object.entries(s.territories || {});
    return `<div class="card"><h2>🚩 Territoires & avant-postes <span class="muted small">${list.length}/${territoryLimit(s, computeMods(s))}</span></h2>
      <p class="small muted">Chaque avant-poste a son propre nom (✎ pour le changer) et une <b>spécialité</b> liée à son terrain : forestier, minier, agricole, commercial, militaire ou du savoir. L’<b>affinité</b> (cases favorables et gisements à proximité) augmente jusqu’à +30 % sa production et ses bonus : choisissez bien l’emplacement. Un territoire se conquiert sur la Carte (case explorée, nettoyée, à portée). Il faut ensuite le <b>spécialiser</b>, l’<b>améliorer</b>, y laisser une <b>garnison</b> et payer son <b>entretien</b>. Une garnison insuffisante réduit la production de 70 % et double le risque d’attaque ; un avant-poste pillé ne produit plus pendant 3 h.</p>
      ${list.length ? '' : '<p>Aucun territoire pour l’instant. Sélectionnez une case sur la Carte pour établir un avant-poste.</p><button class="btn" data-action="nav" data-view="world">🗺️ Ouvrir la carte</button>'}</div>
      ${list.map(([k, t]) => card(app, k, t)).join('')}`;
  },
  actions: {
    'tr-spec': (app, el) => app.act(() => setSpec(app.state, el.dataset.k, el.dataset.s), 'Spécialisation choisie'),
    'tr-up': (app, el) => app.act(() => upgradeOutpost(app.state, el.dataset.k), 'Avant-poste amélioré'),
    'tr-rename': (app, el) => openRenameOutpost(app, el.dataset.k),
    'tr-garrison': (app, el) => {
      const k = el.dataset.k;
      const units = {};
      document.querySelectorAll(`[id^="g-${CSS.escape(k)}-"]`).forEach((i) => { units[i.dataset.u] = +i.value || 0; });
      app.act(() => setGarrison(app.state, k, units), 'Garnison mise à jour');
    },
  },
};
