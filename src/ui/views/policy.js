// Priorité royale : l'orientation stratégique du royaume (prospérité, défense, expansion, commerce).
import { POLICIES, POLICY_TRANSITION, POLICY_LOCK, POLICY_MIN_TH } from '../../data/policies.js';
import { policyState, activePolicy, canChangePolicy, setPolicy, alignPriorities } from '../../systems/policy.js';
import { thLevel } from '../../systems/city.js';
import { automationLevel } from '../../systems/workforce.js';
import { fmtTime } from '../../core/util.js';
import { esc, countdown } from '../components.js';

export default {
  id: 'policy', title: 'Priorité royale', icon: '👑',
  locked: (app) => (thLevel(app.state) < POLICY_MIN_TH ? `Le conseil royal se réunit à partir de l’hôtel de ville niveau ${POLICY_MIN_TH}.` : null),
  render(app) {
    const s = app.state, now = Date.now();
    const p = policyState(s);
    const act = activePolicy(s, now);
    const target = p.pending || p.id;
    const card = (id, d) => {
      const c = canChangePolicy(s, id, now);
      const cur = target === id;
      return `<div class="policy-card ${cur ? 'current' : ''}">
        <div class="policy-head"><span class="policy-icon">${d.icon}</span><b>${esc(d.name)}</b>${cur ? `<span class="chip small">${act === id ? 'en vigueur' : 'en préparation'}</span>` : ''}</div>
        <p class="small muted">${esc(d.desc)}</p>
        ${d.pros.length ? `<ul class="small policy-list ok">${d.pros.map((x) => `<li>＋ ${esc(x)}</li>`).join('')}</ul>` : ''}
        ${d.cons.length ? `<ul class="small policy-list bad">${d.cons.map((x) => `<li>－ ${esc(x)}</li>`).join('')}</ul>` : ''}
        ${cur ? '' : c.ok ? `<button class="btn ${id === 'balanced' ? 'ghost' : 'primary'}" data-action="policy-set" data-id="${id}">Adopter</button>` : `<div class="req small">${esc(c.reason)}</div>`}
      </div>`;
    };
    return `<div class="card"><h2>👑 Priorité royale</h2>
      <p class="small muted">Donnez une orientation à tout le royaume plutôt que des ordres bâtiment par bâtiment. Chaque priorité a des avantages <b>et</b> un prix. En changer impose une réorganisation de ${fmtTime(POLICY_TRANSITION)} (ni bonus ni malus), puis ${fmtTime(POLICY_LOCK)} avant le changement suivant. Elle oriente aussi les missions du royaume proposées.</p>
      <div class="policy-now">${act ? `${POLICIES[act].icon} En vigueur : <b>${esc(POLICIES[act].name)}</b>` : `⏳ Réorganisation vers « ${esc(POLICIES[p.pending].name)} » : effective dans ${countdown(p.activeAt)}`}${p.lockUntil > now ? ` · prochain changement possible dans ${countdown(p.lockUntil)}` : ''}</div>
      ${automationLevel(s) >= 4 ? `<div class="row gap wrap small"><span>Intendance : ordre des secteurs d’ouvriers ${esc((s.priorities?.order || []).join(' › '))}</span><button class="mini" data-action="policy-align">Aligner sur la priorité royale</button></div>` : '<div class="small muted">À partir du palier 4 de l’Intendance, vous pourrez aligner automatiquement les priorités des ouvriers sur cette orientation.</div>'}
      </div>
      <div class="policy-grid">${Object.entries(POLICIES).map(([id, d]) => card(id, d)).join('')}</div>
      ${p.history.length ? `<div class="card"><h3>Historique</h3>${p.history.slice(0, 8).map((h) => `<div class="small">${new Date(h.t).toLocaleString('fr-FR')} — ${POLICIES[h.id]?.icon || ''} ${esc(POLICIES[h.id]?.name || h.id)}</div>`).join('')}</div>` : ''}`;
  },
  actions: {
    'policy-set': (app, el) => app.act(() => setPolicy(app.state, el.dataset.id), `Nouvelle orientation : ${POLICIES[el.dataset.id].name}`),
    'policy-align': (app) => app.act(() => alignPriorities(app.state), 'Priorités des ouvriers alignées'),
  },
};
