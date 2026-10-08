import { RIVALS, PERSONALITIES, STANCES } from '../../data/world.js';
import { RESOURCES } from '../../data/resources.js';
import { ALL_UNITS } from '../../data/units.js';
import { fmt, fmtTime } from '../../core/util.js';
import { diplomacy, spyMission, spyChance, SPY_OBJECTIVES, ENVOY_COST, factionPower, playerPower, raidWillingness } from '../../systems/factions.js';
import { REPUTATIONS, repTier } from '../../systems/reputation.js';
import { levelOf } from '../../systems/city.js';
import { esc, costList, bar } from '../components.js';

const ago = (t) => fmtTime(Date.now() - t);

function relationBar(v) {
  const pct = (v + 100) / 2;
  return `<div class="rel-bar"><div class="rel-fill ${v < -20 ? 'neg' : v > 20 ? 'pos' : ''}" style="width:${pct}%"></div><span>${Math.round(v)}</span></div>`;
}

function intelBlock(f) {
  const i = f.intel || {};
  const rows = [];
  if (i.army) rows.push(`⚔️ Puissance ${fmt(i.army.power)}${i.army.garrison ? ` — ${Object.entries(i.army.garrison).map(([u, n]) => `${n} ${ALL_UNITS[u].name}`).join(', ')}` : ''} <span class="muted">(il y a ${ago(i.army.t)})</span>`);
  if (i.resources) rows.push(`💰 Trésor ≈ ${fmt(i.resources.wealth)} or <span class="muted">(il y a ${ago(i.resources.t)})</span>`);
  if (i.production) rows.push(`🏭 Revenus ≈ ${fmt(i.production.perHour)}/h`);
  if (i.tech) rows.push(`🔬 Niveau technologique ${i.tech.tech}`);
  if (i.weakness) rows.push(`🎯 ${esc(i.weakness.text)}`);
  if (i.movements) rows.push(`🐎 ${esc(i.movements.text)} <span class="muted">(il y a ${ago(i.movements.t)})</span>`);
  return rows.length ? rows.map((r) => `<div class="small">${r}</div>`).join('') : '<div class="muted small">Aucun renseignement. Envoyez des espions.</div>';
}

export default {
  id: 'factions', title: 'Factions & diplomatie', icon: '🕊️',
  badge: (app) => (app.state.factions || []).filter((f) => f.stance === 'war').length,
  render(app) {
    const s = app.state;
    const pp = playerPower(s);
    const rep = s.reputation || {};
    const rumor = s.rumor && !s.rumor.done && levelOf(s, 'tavern') ? s.rumor : null;
    return `<div class="card"><h2>🕊️ Factions des Terres Brisées</h2>
      <p class="muted small">Cinq royaumes IA vivent leur vie : ils s’enrichissent, s’arment, s’étendent sur la carte et se font la guerre, même sans vous. Leur attitude dépend de leur personnalité et de votre réputation. Votre puissance : <b>${fmt(pp)}</b>.</p>
      <div class="rep-strip">${Object.entries(REPUTATIONS).map(([k, r]) => `<span class="chip" title="${esc(r.desc)}">${r.icon} ${esc(r.name)} : ${repTier(rep[k] || 0)} (${Math.round(rep[k] || 0)})</span>`).join('')}</div>
      ${rumor ? `<div class="rumor">🍺 À la taverne, on murmure : « ${esc(rumor.text)} »</div>` : ''}
      <div class="small muted">Contre-espionnage : tour de garde niv. ${levelOf(s, 'watchtower')} + ${s.army.spy || 0} espion(s) en ville.</div></div>
      <div class="faction-grid">${(s.factions || []).map((f) => {
        const rv = RIVALS[f.idx];
        const per = PERSONALITIES[rv.personality];
        const st = STANCES[f.stance];
        const known = f.intel?.army;
        const willing = raidWillingness(s, f.idx);
        return `<div class="card faction" style="--fc:${rv.color}">
          <div class="faction-head"><span class="f-icon">${rv.icon}</span><div><h3>${esc(rv.name)}</h3><div class="small">${esc(rv.lord)} · ${per.icon} ${esc(per.name)}</div></div><span class="chip stance-${f.stance}">${st.icon} ${esc(st.name)}</span></div>
          <div class="small muted">${esc(per.desc)}</div>
          <div class="small">Relation</div>${relationBar(f.relation)}
          <div class="small">Territoire : ${f.territory.length} régions · Puissance : ${known ? fmt(known.power) : `≈ ${fmt(factionPower(s, f) * 0.7)}–${fmt(factionPower(s, f) * 1.3)}`}${f.wars.length ? ` · ⚔️ en guerre contre ${f.wars.map((w) => esc(RIVALS[w].name)).join(', ')}` : ''}</div>
          ${willing > 0.08 ? '<div class="req small">⚠ Hostile : risque de raid</div>' : ''}
          <h4>Renseignements</h4>${intelBlock(f)}
          <h4>Diplomatie</h4><div class="row gap wrap">
            <button class="mini" data-action="dip" data-i="${f.idx}" data-a="envoy" title="Coût : ${ENVOY_COST(s).gold} or">🎩 Ambassadeur</button>
            ${f.stance === 'war' ? `<button class="mini good" data-action="dip" data-i="${f.idx}" data-a="peace">🏳️ Proposer la paix</button>` : `
            ${f.stance !== 'trade' && f.stance !== 'alliance' ? `<button class="mini" data-action="dip" data-i="${f.idx}" data-a="trade">🤝 Pacte commercial</button>` : ''}
            ${f.stance === 'trade' ? `<button class="mini" data-action="dip" data-i="${f.idx}" data-a="alliance">🛡️ Alliance</button>` : ''}
            <button class="mini" data-action="dip" data-i="${f.idx}" data-a="tribute">💰 Exiger un tribut</button>
            <button class="mini ghost danger" data-action="dip" data-i="${f.idx}" data-a="war">⚔️ Déclarer la guerre</button>`}
          </div>
          <h4>Espionnage</h4><div class="row gap wrap"><select id="spy-obj-${f.idx}">${Object.entries(SPY_OBJECTIVES).map(([k, o]) => `<option value="${k}">${o.icon} ${o.name}</option>`).join('')}</select>
            <input id="spy-n-${f.idx}" class="qty" type="number" min="1" value="2"> <button class="mini" data-action="spy" data-i="${f.idx}">🕵️ Envoyer</button>
            <span class="muted small">réussite ≈ ${Math.round(spyChance(s, f.idx, 2) * 100)}% (2 espions) · ${s.army.spy || 0} disponible(s)</span></div>
        </div>`;
      }).join('')}</div>`;
  },
  actions: {
    dip: (app, el) => {
      if (el.dataset.a === 'war' && !confirm('Déclarer la guerre ? Rompre un traité fera de vous un tyran aux yeux de tous.')) return;
      const r = diplomacy(app.state, +el.dataset.i, el.dataset.a);
      if (r.ok) app.toast(r.msg, 'good'); else app.toast(r.reason, 'bad');
      app.render(); app.save();
    },
    spy: (app, el) => {
      const i = +el.dataset.i;
      const r = spyMission(app.state, i, document.getElementById('spy-obj-' + i).value, +document.getElementById('spy-n-' + i).value);
      if (r.ok) app.toast(r.msg, 'good'); else app.toast(r.reason, 'bad');
      app.render(); app.save();
    },
  },
};
void RESOURCES; void costList; void bar;
