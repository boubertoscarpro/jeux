import { TERRITORY_SPECS, OUTPOST_MAX_LEVEL, outpostUpgradeCost, RESPEC_COST, OUTPOST_THREATS } from '../../data/territories.js';
import { TERRAINS } from '../../data/world.js';
import { UNITS } from '../../data/units.js';
import { RESOURCES } from '../../data/resources.js';
import { fmt } from '../../core/util.js';
import { computeMods } from '../../systems/modifiers.js';
import { territoryLimit } from '../../systems/world.js';
import { specOf, outpostStatus, setSpec, upgradeOutpost, setGarrison, outpostUpkeep, garrisonNeed } from '../../systems/territory.js';
import { esc, costList, countdown } from '../components.js';

const prodText = (sp, lvl) => Object.entries(sp.prod || {}).map(([r, v]) => `${RESOURCES[r].icon} ${fmt(v * lvl)}/h`).join(' ');
const modText = (sp, lvl) => Object.entries(sp.mods || {}).map(([k, v]) => `${k} +${Math.round(v * lvl * 1000) / 10} %`).join(', ');

function card(app, k, t) {
  const s = app.state;
  const st = outpostStatus(s, t);
  const sp = specOf(t);
  const lvl = t.level || 1;
  const opts = TERRITORY_SPECS[t.terrain] || [];
  const units = Object.entries(UNITS).filter(([u, d]) => d.class !== 'special' && ((s.army[u] || 0) + (t.garrison?.[u] || 0)) > 0);
  return `<div class="card-sub outpost">
    <div class="row between"><h3>${sp ? sp.icon : '🚩'} ${esc(sp ? sp.name : 'Avant-poste')} <span class="muted small">(${t.x}, ${t.y}) · ${esc(TERRAINS[t.terrain].name)} · niv. ${lvl}/${OUTPOST_MAX_LEVEL}</span></h3>
      <span class="small ${st.eff >= 1 ? 'ok' : 'bad'}">${st.eff >= 1 ? '✔ Pleinement actif' : `Efficacité ${Math.round(st.eff * 100)} %`}</span></div>
    ${st.reasons.map((r) => `<div class="small req">⚠️ ${esc(r)}</div>`).join('')}${t.pillagedUntil > Date.now() ? `<div class="small">Reprise dans ${countdown(t.pillagedUntil)}</div>` : ''}
    <div class="small">Bonus de terrain (si garnison complète) : ${Object.entries(TERRAINS[t.terrain].territory).map(([m, v]) => `${m} +${Math.round(v * 100)} %`).join(', ')}</div>
    ${sp ? `<div class="small">Production : ${prodText(sp, lvl) || '—'}${sp.mods ? ` · Bonus : ${modText(sp, lvl)}` : ''}${sp.relicChance ? ' · chance de fragments de relique' : ''}</div>` : ''}
    <div class="small">Entretien : ${Object.entries(outpostUpkeep(t)).map(([r, v]) => `${RESOURCES[r].icon} ${v}/h`).join(' ')} · Menace : ${esc(OUTPOST_THREATS[t.terrain]?.name || '')}${t.defended ? ` · ${t.defended} attaque(s) repoussée(s)` : ''}</div>
    <h4>Spécialisation ${t.spec ? `<span class="muted small">(reconversion : ${Object.entries(RESPEC_COST).map(([r, v]) => `${v} ${RESOURCES[r].icon}`).join(' ')}, retour au niveau 1)</span>` : ''}</h4>
    <div class="spec-grid">${opts.map((o) => `<button class="spec ${t.spec === o.id ? 'active' : ''}" data-action="tr-spec" data-k="${k}" data-s="${o.id}" ${t.spec === o.id ? 'disabled' : ''}><b>${o.icon} ${esc(o.name)}</b><span class="small muted">${esc(o.desc)}</span><span class="small">${prodText(o, 1)} ${o.mods ? modText(o, 1) : ''} <i>par niveau</i></span></button>`).join('')}</div>
    ${sp && lvl < OUTPOST_MAX_LEVEL ? `<div class="row gap">${costList(outpostUpgradeCost(lvl + 1), s)}<button class="btn small primary" data-action="tr-up" data-k="${k}">Améliorer → niv. ${lvl + 1}</button><span class="small muted">(garnison requise : ${garrisonNeed({ level: lvl + 1 })})</span></div>` : ''}
    <h4>Garnison <span class="muted small">${st.garrison}/${st.need} soldats requis</span></h4>
    <div class="row gap wrap">${units.map(([u, d]) => `<label class="small">${d.icon} ${esc(d.name)} <input class="qty" type="number" min="0" max="${(s.army[u] || 0) + (t.garrison?.[u] || 0)}" value="${t.garrison?.[u] || 0}" id="g-${k}-${u}" data-u="${u}"></label>`).join('') || '<span class="muted small">Aucune troupe disponible.</span>'}
      <button class="btn small" data-action="tr-garrison" data-k="${k}">Mettre à jour la garnison</button></div>
  </div>`;
}

export default {
  id: 'territories', title: 'Territoires', icon: '🚩',
  badge: (app) => Object.values(app.state.territories || {}).filter((t) => outpostStatus(app.state, t).eff < 1 || !t.spec).length,
  render(app) {
    const s = app.state;
    const list = Object.entries(s.territories || {});
    return `<div class="card"><h2>🚩 Territoires & avant-postes <span class="muted small">${list.length}/${territoryLimit(s, computeMods(s))}</span></h2>
      <p class="small muted">Un territoire se conquiert sur la Carte (case explorée, nettoyée, à portée). Il faut ensuite le <b>spécialiser</b>, l’<b>améliorer</b>, y laisser une <b>garnison</b> et payer son <b>entretien</b>. Une garnison insuffisante réduit la production de 70 % et double le risque d’attaque ; un avant-poste pillé ne produit plus pendant 3 h.</p>
      ${list.length ? '' : '<p>Aucun territoire pour l’instant. Sélectionnez une case sur la Carte pour établir un avant-poste.</p><button class="btn" data-action="nav" data-view="world">🗺️ Ouvrir la carte</button>'}</div>
      ${list.map(([k, t]) => card(app, k, t)).join('')}`;
  },
  actions: {
    'tr-spec': (app, el) => app.act(() => setSpec(app.state, el.dataset.k, el.dataset.s), 'Spécialisation choisie'),
    'tr-up': (app, el) => app.act(() => upgradeOutpost(app.state, el.dataset.k), 'Avant-poste amélioré'),
    'tr-garrison': (app, el) => {
      const k = el.dataset.k;
      const units = {};
      document.querySelectorAll(`[id^="g-${CSS.escape(k)}-"]`).forEach((i) => { units[i.dataset.u] = +i.value || 0; });
      app.act(() => setGarrison(app.state, k, units), 'Garnison mise à jour');
    },
  },
};
