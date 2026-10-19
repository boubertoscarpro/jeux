// v16 « Le Château » — Défense (tour de garde) : raids en approche, flancs et outils, muraille, rapports de défense.
import { UNITS } from '../../data/units.js';
import { ENEMY_UNITS } from '../../data/units.js';
import { FLANKS } from '../../data/castle.js';
import { castleCard, castleActions } from '../castleUi.js';
import { esc, countdown } from '../components.js';
import { reportModal } from './journal.js';
import { groupReports, reportClass } from '../../systems/notices.js';
import { rampartsCard, rampartActions } from '../ramparts.js';

// v17 : les rapports triés — les défaites d'abord, une à une ; le reste regroupé (« 35 victoires »), vu en passant
const KIND = { battle: ['⚔️', 'combat', 'combats'], explore: ['🧭', 'exploration', 'explorations'], scout: ['👁️', 'repérage', 'repérages'], boss: ['🐉', 'combat de boss', 'combats de boss'], defense: ['🛡️', 'défense', 'défenses'] };
function reportsCard(s) {
  const groups = groupReports(s.reports);
  const urgent = (s.reports || []).filter((r) => !r.read && reportClass(r) === 'urgent').slice(0, 6);
  const info = groups.filter((g) => g.cls === 'info');
  if (!groups.length) return '';
  return `<div class="card"><h2>✉️ Rapports</h2>
    ${urgent.length ? `<p class="small"><b>${urgent.length} défaite${urgent.length > 1 ? 's' : ''} à lire</b> : ce qui a mal tourné, et pourquoi.</p>${urgent.map((r) => `<button class="btn block warn" data-action="def-report" data-id="${r.id}">💀 ${esc(r.title)} <span class="muted small">${new Date(r.t).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}</span></button>`).join('')}` : '<p class="small">Aucune défaite à lire.</p>'}
    ${info.length ? `<p class="small muted">Pour information : ${info.map((g) => { const k = KIND[g.kind] || ['📜', 'rapport', 'rapports']; return `${k[0]} ${g.count} ${g.count > 1 ? k[2] : k[1]}${g.win ? ' réussi' + (g.count > 1 ? 's' : '') : ''}`; }).join(' · ')} — <button class="mini ghost" data-action="nav" data-view="journal">Tout lire au journal</button></p>` : ''}
  </div>`;
}

export default {
  id: 'defense', title: 'Défense', icon: '🛡️',
  badge: (app) => (app.state.raids || []).length,
  render(app) {
    const s = app.state;
    const raids = (s.raids || []).slice().sort((a, b) => a.arrive - b.arrive);
    const reps = (s.reports || []).filter((r) => r.kind === 'defense').slice(0, 8);
    return `<div class="card"><h2>🚨 Menaces</h2>${raids.length ? raids.map((r) => `<div class="q-row"><div class="q-top"><b>${esc(r.name)}</b>${countdown(r.arrive)}</div>
        <div class="small">${r.seen ? Object.entries(r.army).map(([u, n]) => `${n} ${esc(ENEMY_UNITS[u]?.name || UNITS[u]?.name || u)}`).join(', ') : 'Composition inconnue (tour de garde niv. 3)'}</div>
        <div class="small ${r.flankSeen ? 'warn-text' : 'muted'}">${r.flankSeen ? `Flanc visé : <b>${esc(FLANKS[r.flank]?.name || '?')}</b>` : 'Flanc visé inconnu (tour de garde niv. 5)'}</div></div>`).join('') : '<p class="muted">Aucun raid en approche. Les tours de garde donnent l’alerte plus tôt, révèlent la composition (niv. 3) puis le flanc visé (niv. 5).</p>'}</div>
      ${rampartsCard(app)}
      ${castleCard(app)}
      ${reportsCard(s)}
      <div class="card"><h2>📜 Rapports de défense</h2>${reps.length ? reps.map((r) => `<button class="btn block ${r.win ? '' : 'warn'}" data-action="def-report" data-id="${r.id}">${r.win ? '🛡️' : '🔥'} ${esc(r.title)} <span class="muted small">${new Date(r.t).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}</span></button>`).join('') : '<p class="muted small">Aucun raid subi pour l’instant.</p>'}</div>`;
  },
  // Ce qui est résumé à l'écran (l'informatif) est vu : il ne compte plus dans le badge
  after(app) { for (const r of app.state.reports || []) if (!r.read && reportClass(r) === 'info') r.read = true; },
  actions: {
    ...castleActions,
    ...rampartActions,
    'def-report': (app, el) => { const r = app.state.reports.find((x) => x.id === el.dataset.id); if (r) reportModal(app, r); },
  },
};
