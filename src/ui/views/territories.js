import { TERRITORY_SPECS, OUTPOST_MAX_LEVEL, outpostUpgradeCost, RESPEC_COST, OUTPOST_THREATS } from '../../data/territories.js';
import { TERRAINS } from '../../data/world.js';
import { UNITS } from '../../data/units.js';
import { RESOURCES } from '../../data/resources.js';
import { fmt } from '../../core/util.js';
import { computeMods } from '../../systems/modifiers.js';
import { territoryLimit } from '../../systems/world.js';
import { specOf, outpostStatus, setSpec, upgradeOutpost, setGarrison, outpostUpkeep, garrisonNeed, outpostUpgradeCheck, specAffinity, specCategory, outpostReport, fillGarrison } from '../../systems/territory.js';
import { outpostLabel } from '../../systems/identity.js';
import { stabilityFactors, stabilityTarget, stabOf, stabLevel, taxOf, TAXES, FESTIVAL, setTax, celebrate } from '../../systems/stability.js';
import { openRenameOutpost } from '../upgrades.js';
import { upIcon } from '../art.js';
import { esc, costList, countdown } from '../components.js';

const prodText = (sp, lvl) => Object.entries(sp.prod || {}).map(([r, v]) => `${RESOURCES[r].icon} ${fmt(v * lvl)}/h`).join(' ');
const modText = (sp, lvl) => Object.entries(sp.mods || {}).map(([k, v]) => `${k} +${Math.round(v * lvl * 1000) / 10} %`).join(', ');

// Vue comparative : tous les avant-postes sur une ligne chacun, ordres à distance et bilan total
function overview(app, list) {
  const s = app.state, now = Date.now();
  const reps = list.map(([k]) => outpostReport(s, k, now));
  const tot = {}, up = {};
  for (const r of reps) { for (const [res, v] of Object.entries(r.prod)) tot[res] = (tot[res] || 0) + v; for (const [res, v] of Object.entries(r.upkeep)) up[res] = (up[res] || 0) + v; }
  const chips = (o) => Object.entries(o).filter(([, v]) => v > 0.05).map(([r, v]) => `${RESOURCES[r].icon} ${fmt(v)}`).join(' ') || '—';
  return `<div class="card"><h3>📊 Vue d’ensemble <span class="muted small">production, garnison, entretien et menaces</span></h3>
    <div class="table-wrap"><table class="op-table"><thead><tr><th>Avant-poste</th><th>Spécialité</th><th>Niv.</th><th>Production /h</th><th>Garnison</th><th>Stabilité</th><th>Entretien /h</th><th>État</th><th>Ordres</th></tr></thead><tbody>
    ${reps.map((r) => `<tr class="${r.st.eff < 1 ? 'warn-row' : ''}">
      <td><b>${esc(outpostLabel(r.t))}</b><div class="small muted">${esc(TERRAINS[r.t.terrain].name)} (${r.t.x}, ${r.t.y})</div></td>
      <td>${r.sp ? `${r.sp.icon} ${esc(r.sp.name)}${r.cat ? `<div class="small muted">${esc(r.cat.name.replace('Avant-poste ', ''))} · affinité +${Math.round((r.aff - 1) * 100)} %</div>` : ''}` : '<span class="req small">à choisir</span>'}</td>
      <td>${r.t.level || 1}</td>
      <td class="small">${chips(r.prod)}${Object.keys(r.mods).length ? `<div class="muted">+ ${Object.entries(r.mods).map(([m, v]) => `${esc(m)} ${(v * 100).toFixed(1)} %`).join(', ')}</div>` : ''}</td>
      <td class="${r.st.garrison < r.st.need ? 'bad' : 'ok'}">${r.st.garrison}/${r.st.need}</td>
      <td class="small" title="${esc(r.stabLevel.name)} — ${esc(TAXES[r.tax].name)}">${r.stabLevel.icon} ${Math.round(r.stab)}${r.t.revolt ? '<div class="bad">révolte</div>' : ''}<div class="muted">${TAXES[r.tax].icon} ${esc(TAXES[r.tax].name.replace('Impôts ', ''))}</div></td>
      <td class="small">${chips(r.upkeep)}</td>
      <td class="small">${r.st.eff >= 1 ? '<span class="ok">✔ actif</span>' : `<span class="bad">${Math.round(r.st.eff * 100)} %</span>`}${r.t.threatAt > now ? `<div class="bad">⚠️ attaque dans ${countdown(r.t.threatAt)}</div>` : ''}${r.t.pillagedUntil > now ? '<div class="bad">pillé</div>' : ''}</td>
      <td><div class="row gap wrap">${r.st.garrison < r.st.need ? `<button class="mini" data-action="tr-fill" data-k="${esc(r.k)}" title="Envoyer des troupes du château pour compléter la garnison">🛡️ Garnison</button>` : ''}${r.up.status === 'ready' ? `<button class="mini primary" data-action="tr-up" data-k="${esc(r.k)}">⬆ Niv. ${r.up.next}</button>` : ''}<button class="mini ghost" data-action="tr-rename" data-k="${esc(r.k)}" title="Renommer">✎</button></div></td></tr>`).join('')}
    </tbody><tfoot><tr><td colspan="3"><b>Total</b></td><td class="small">${chips(tot)}</td><td></td><td></td><td class="small">${chips(up)}</td><td colspan="2">${reps.some((r) => r.st.garrison < r.st.need) ? '<button class="mini" data-action="tr-fill-all">🛡️ Compléter toutes les garnisons</button>' : ''}</td></tr></tfoot></table></div>
    <p class="small muted">Production effective (après garnison, état et affinité). Les ordres « Garnison » prélèvent des soldats au château : gardez-en assez pour défendre la capitale.</p></div>`;
}

// Stabilité : jauge, facteurs détaillés, impôts et festivités
function stabBlock(s, k, t) {
  const now = Date.now(), v = stabOf(t), lv = stabLevel(v), target = stabilityTarget(s, t, now);
  const f = stabilityFactors(s, t, now);
  const fc = FESTIVAL.cost(t.level || 1);
  return `<div class="panel-sub stab-block stab-${lv.key}"><h4>Stabilité de la province : ${lv.icon} ${esc(lv.name)} <span class="muted">${Math.round(v)}/100 → cible ${Math.round(target)}</span></h4>
    <div class="stab-bar"><div style="width:${v}%"></div><span style="left:${target}%" title="Cible"></span></div>
    ${t.revolt ? '<div class="req">🔥 Révolte ouverte : plus aucune production tant que la stabilité n’est pas remontée à 45.</div>' : ''}
    <div class="stab-factors small">${f.map(([l, x]) => `<span class="${x > 0 ? 'ok' : x < 0 ? 'bad' : 'muted'}">${x > 0 ? '+' : ''}${x} ${esc(l)}</span>`).join('')}</div>
    <div class="small muted">La stabilité évolue de 5 points par heure vers sa cible. Prospère (≥ 80) : production +10 % · Mécontente (< 50) : −20 % · En révolte (< 30) : −50 % et risque de soulèvement.</div>
    <div class="row gap wrap"><span class="small">Impôts :</span>${Object.entries(TAXES).map(([key, tx]) => `<button class="mini ${taxOf(t) === key ? 'primary' : ''}" data-action="tr-tax" data-k="${esc(k)}" data-t="${key}" title="${esc(tx.desc)}">${tx.icon} ${esc(tx.name)} ${tx.stab ? `(${tx.stab > 0 ? '+' : ''}${tx.stab})` : ''}${tx.gold ? ` · ${tx.gold * (t.level || 1)} or/h` : ''}</button>`).join('')}</div>
    <div class="row gap wrap">${t.festUntil > now ? `<span class="small ok">🎉 Festivités en cours (+${FESTIVAL.stab}) · ${countdown(t.festUntil)}</span>` : `<button class="mini" data-action="tr-fest" data-k="${esc(k)}">🎉 Organiser des festivités (+${FESTIVAL.stab} pendant ${FESTIVAL.hours} h)</button> ${costList(fc, s)}`}</div></div>`;
}

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
    ${stabBlock(s, k, t)}
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
      ${list.length ? overview(app, list) : ''}
      ${list.map(([k, t]) => card(app, k, t)).join('')}`;
  },
  actions: {
    'tr-spec': (app, el) => app.act(() => setSpec(app.state, el.dataset.k, el.dataset.s), 'Spécialisation choisie'),
    'tr-up': (app, el) => app.act(() => upgradeOutpost(app.state, el.dataset.k), 'Avant-poste amélioré'),
    'tr-rename': (app, el) => openRenameOutpost(app, el.dataset.k),
    'tr-tax': (app, el) => app.act(() => setTax(app.state, el.dataset.k, el.dataset.t), `Impôts : ${TAXES[el.dataset.t].name}`),
    'tr-fest': (app, el) => app.act(() => celebrate(app.state, el.dataset.k), 'Festivités organisées'),
    'tr-fill': (app, el) => app.act(() => fillGarrison(app.state, el.dataset.k), (r) => `${r.moved} soldat(s) envoyé(s)${r.missing ? ` (il en manque encore ${r.missing})` : ''}`),
    'tr-fill-all': (app) => app.act(() => { let n = 0; for (const k of Object.keys(app.state.territories)) { const r = fillGarrison(app.state, k); if (r.ok) n += r.moved; } return n ? { ok: true, n } : { ok: false, reason: 'Aucune troupe disponible au château, ou garnisons déjà complètes' }; }, (r) => `${r.n} soldat(s) envoyé(s) dans les avant-postes`),
    'tr-garrison': (app, el) => {
      const k = el.dataset.k;
      const units = {};
      document.querySelectorAll(`[id^="g-${CSS.escape(k)}-"]`).forEach((i) => { units[i.dataset.u] = +i.value || 0; });
      app.act(() => setGarrison(app.state, k, units), 'Garnison mise à jour');
    },
  },
};
