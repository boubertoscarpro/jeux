// v16 « Le Château » — Défense (tour de garde) : raids en approche, flancs et outils, muraille, rapports de défense.
import { UNITS } from '../../data/units.js';
import { ENEMY_UNITS } from '../../data/units.js';
import { FLANKS } from '../../data/castle.js';
import { castleCard, castleActions } from '../castleUi.js';
import { esc, countdown } from '../components.js';
import { reportModal } from './journal.js';

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
      ${castleCard(app)}
      <div class="card"><h2>📜 Rapports de défense</h2>${reps.length ? reps.map((r) => `<button class="btn block ${r.win ? '' : 'warn'}" data-action="def-report" data-id="${r.id}">${r.win ? '🛡️' : '🔥'} ${esc(r.title)} <span class="muted small">${new Date(r.t).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}</span></button>`).join('') : '<p class="muted small">Aucun raid subi pour l’instant.</p>'}</div>`;
  },
  actions: {
    ...castleActions,
    'def-report': (app, el) => { const r = app.state.reports.find((x) => x.id === el.dataset.id); if (r) reportModal(app, r); },
  },
};
