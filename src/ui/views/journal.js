import { ALL_UNITS, TERRAIN_COMBAT, WEATHER } from '../../data/units.js';
import { fmt } from '../../core/util.js';
import { esc, resChips } from '../components.js';

const TYPE_ICON = { good: '✅', bad: '❌', story: '📖', event: '🌍', combat: '⚔️', explore: '🧭', trade: '🪙', info: 'ℹ️' };
const time = (t) => new Date(t).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

function unitsLine(units) {
  const e = Object.entries(units || {}).filter(([, n]) => n > 0);
  return e.map(([u, n]) => `<span class="unit-chip">${ALL_UNITS[u]?.icon || ''} ${fmt(n)} ${esc(ALL_UNITS[u]?.name || u)}</span>`).join('') || '<span class="muted small">aucune</span>';
}

export function reportModal(app, rep) {
  const r = rep.result;
  rep.read = true;
  const def = rep.defense;
  const myLoss = r ? (def ? r.defLosses : r.attLosses) : null;
  const theirLoss = r ? (def ? r.attLosses : r.defLosses) : null;
  app.modal(`<h2>${rep.win ? '🏆' : '💀'} ${esc(rep.title)}</h2>
    <div class="muted small">${new Date(rep.t).toLocaleString('fr-FR')}${rep.x !== undefined ? ` · (${rep.x}, ${rep.y})` : ''}${rep.terrain ? ` · ${esc(TERRAIN_COMBAT[rep.terrain]?.name || rep.terrain)}` : ''}${rep.weather ? ` · ${WEATHER[rep.weather]?.icon} ${esc(WEATHER[rep.weather]?.name)}` : ''}</div>
    ${rep.text ? `<p class="story">${esc(rep.text)}</p>` : ''}
    ${r ? `<div class="cols-2"><div class="card-sub"><h4>Vos pertes</h4>${unitsLine(myLoss)}</div><div class="card-sub"><h4>Pertes ennemies</h4>${unitsLine(theirLoss)}${r.bossDamage ? `<div>Dégâts au boss : <b>${fmt(r.bossDamage)}</b></div>` : ''}</div></div>
      <h4>Facteurs</h4><ul class="notes small">${r.notes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>
      <h4>Déroulement</h4><div class="table-wrap"><table class="rounds"><thead><tr><th>Phase</th><th>Dégâts infligés</th><th>Dégâts subis</th><th>Moral (vous / eux)</th></tr></thead><tbody>
      ${r.rounds.map((rd) => `<tr><td>${rd.phase === 'volley' ? '🏹 Volée' : `⚔️ Mêlée ${rd.n}`}</td><td class="num">${fmt(def ? rd.defDmg : rd.attDmg)}</td><td class="num">${fmt(def ? rd.attDmg : rd.defDmg)}</td><td class="num">${def ? `${Math.max(0, rd.moraleD)} / ${Math.max(0, rd.moraleA)}` : `${Math.max(0, rd.moraleA)} / ${Math.max(0, rd.moraleD)}`}</td></tr>`).join('')}
      </tbody></table></div>` : ''}
    ${rep.enemies && !r ? `<h4>Forces observées</h4>${unitsLine(rep.enemies)}` : ''}
    ${rep.loot && Object.keys(rep.loot).length ? `<h4>Butin</h4>${resChips(rep.loot)}` : ''}`, {}, 'wide');
  app.render();
}

export default {
  id: 'journal', title: 'Journal', icon: '📖',
  badge: (app) => app.state.reports.filter((r) => !r.read).length,
  render(app) {
    const s = app.state;
    const filter = app.ui.logFilter || '';
    const logs = s.log.filter((l) => !filter || l.type === filter);
    return `<div class="cols-2">
      <div class="card"><h2>📜 Rapports</h2>
        ${s.reports.map((rep) => `<button class="report ${rep.read ? '' : 'unread'} ${rep.win ? 'win' : 'loss'}" data-action="report" data-id="${rep.id}">
          <span>${{ battle: '⚔️', explore: '🧭', scout: '👁️', boss: '🐉', defense: '🛡️' }[rep.kind] || '📜'} ${esc(rep.title)}</span><span class="muted small">${time(rep.t)}</span></button>`).join('') || '<div class="muted small">Aucun rapport pour l’instant.</div>'}
        ${s.reports.length ? '<button class="mini ghost" data-action="read-all">Tout marquer comme lu</button>' : ''}
      </div>
      <div class="card"><h2>📖 Chronique du royaume</h2>
        <div class="tabs">${[['', 'Tout'], ['good', '✅'], ['bad', '❌'], ['event', '🌍'], ['explore', '🧭'], ['trade', '🪙'], ['story', '📖']].map(([k, l]) => `<button class="tab ${filter === k ? 'active' : ''}" data-action="log-filter" data-k="${k}">${l}</button>`).join('')}</div>
        <div class="log">${logs.slice(0, 150).map((l) => `<div class="log-line log-${l.type}"><span class="muted small">${time(l.t)}</span> ${TYPE_ICON[l.type] || ''} ${esc(l.text)}</div>`).join('')}</div>
      </div></div>`;
  },
  actions: {
    report: (app, el) => { const rep = app.state.reports.find((r) => r.id === el.dataset.id); if (rep) reportModal(app, rep); },
    'read-all': (app) => { app.state.reports.forEach((r) => { r.read = true; }); app.render(); },
    'log-filter': (app, el) => { app.ui.logFilter = el.dataset.k; app.render(); },
  },
};
