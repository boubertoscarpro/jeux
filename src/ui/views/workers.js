import { PROFESSIONS, WORK_SECTORS, TRAITS, FOREMAN_TYPES, workerXpFor } from '../../data/workers.js';
import { fmt } from '../../core/util.js';
import { computeMods } from '../../systems/modifiers.js';
import { automationLevel, housing, recruitWorkerCost, recruitWorker, assignWorker, assignMany, sectorCapacity, sectorBonuses, promoteForeman, demoteForeman, dismissWorker, retrain, ascendWorker, maxForemen, isAvailable } from '../../systems/workforce.js';
import { maxHeroes } from '../../systems/tavern.js';
import { esc, costList, bar } from '../components.js';

const pct = (v) => `+${Math.round(v * 1000) / 10}%`;

function jobLabel(state, w, now) {
  if (w.injuredUntil > now) return '🩹 Blessé';
  if (w.job?.type === 'exp') { const t = state.expeditions.find((x) => x.id === w.job.id); return `🧭 ${t ? t.name : 'Expédition'}`; }
  if (w.job?.type === 'sector') return `${WORK_SECTORS[w.job.sector].icon} ${WORK_SECTORS[w.job.sector].name}`;
  return '💤 Inactif';
}

export default {
  id: 'workers', title: 'Ouvriers', icon: '👷',
  locked: (app) => (automationLevel(app.state) < 1 ? 'Débloquez le palier « Ouvriers » dans Production → Intendance (Hôtel de ville niv. 2).' : null),
  badge: (app) => (automationLevel(app.state) >= 1 ? app.state.workers.filter((w) => isAvailable(w, Date.now()) && !w.foreman).length : 0),
  render(app) {
    const s = app.state;
    const now = Date.now();
    const bonus = sectorBonuses(s, now);
    const filter = app.ui.wFilter || '';
    const list = s.workers.filter((w) => !filter || (filter === 'idle' ? isAvailable(w, now) && !w.foreman : filter === 'foreman' ? w.foreman : w.job?.sector === filter))
      .sort((a, b) => (b.foreman ? 1 : 0) - (a.foreman ? 1 : 0) || b.level - a.level);
    const foremen = s.workers.filter((w) => w.foreman);
    return `<div class="card"><h2>👷 Ouvriers <span class="muted small">${s.workers.length}/${housing(s)} logés · contremaîtres ${foremen.length}/${maxForemen(s)}</span></h2>
      <p class="muted small">Chaque ouvrier a une profession, des traits, un moral et une endurance. Affecté à un secteur, il augmente sa production (+50% s’il est du métier) ; en expédition, il récolte sur la carte. Les familles s’installent d’elles-mêmes si vous avez du logement, de la nourriture et un bon moral.</p>
      <div class="row gap wrap"><select id="w-prof">${Object.entries(PROFESSIONS).map(([k, p]) => `<option value="${k}">${p.icon} ${p.name}</option>`).join('')}<option value="">🎲 Au hasard</option></select>
        ${costList(recruitWorkerCost(s), s)}<button class="btn primary small" data-action="w-recruit">Recruter</button></div></div>

      <div class="card"><h3>Secteurs</h3><div class="sector-grid">${Object.entries(WORK_SECTORS).map(([k, sec]) => {
        const n = s.workers.filter((w) => w.job?.type === 'sector' && w.job.sector === k).length;
        const cap = sectorCapacity(s, k);
        const fm = foremen.find((w) => FOREMAN_TYPES[w.foreman] && Object.keys(FOREMAN_TYPES[w.foreman].mods).some((m) => sec.res.some((r) => m === 'prod.' + r)));
        return `<div class="sector ${n > cap ? 'over' : ''}"><div class="sector-head">${sec.icon} <b>${sec.name}</b><span class="bonus-tag">${pct(bonus['work.' + k] || 0)}</span></div>
          <div class="small">${n} / ${cap} postes utiles${fm ? ` · 🦺 ${esc(fm.name)}` : ''}</div>${bar(n, Math.max(1, cap))}
          <div class="row gap"><button class="mini" data-action="w-sector" data-sec="${k}" data-n="1">+1</button><button class="mini" data-action="w-sector" data-sec="${k}" data-n="5">+5</button><button class="mini ghost" data-action="w-unsector" data-sec="${k}">−1</button></div></div>`;
      }).join('')}</div></div>

      <div class="card"><div class="tabs">${[['', 'Tous'], ['idle', '💤 Inactifs'], ['foreman', '🦺 Contremaîtres'], ...Object.entries(WORK_SECTORS).map(([k, s2]) => [k, s2.icon + ' ' + s2.name])].map(([k, l]) => `<button class="tab ${filter === k ? 'active' : ''}" data-action="w-filter" data-k="${k}">${l}</button>`).join('')}</div>
      <div class="table-wrap"><table class="workers"><thead><tr><th>Ouvrier</th><th>Niv.</th><th>Traits</th><th>Moral</th><th>Endurance</th><th>Poste</th><th>Actions</th></tr></thead><tbody>
      ${list.map((w) => `<tr class="${w.foreman ? 'foreman' : ''}"><td>${PROFESSIONS[w.prof].icon} <b>${esc(w.name)}</b><div class="muted small">${PROFESSIONS[w.prof].name}${w.foreman ? ` · ${FOREMAN_TYPES[w.foreman].icon} ${FOREMAN_TYPES[w.foreman].name}` : ''}</div></td>
        <td>${w.level}<div class="mini-bar">${bar(w.xp, workerXpFor(w.level))}</div></td>
        <td>${w.traits.map((t) => `<span class="trait" title="${esc(TRAITS[t].desc)}">${esc(TRAITS[t].name)}</span>`).join(' ')}</td>
        <td class="num ${w.morale < 40 ? 'bad' : ''}">${Math.round(w.morale)}</td><td class="num ${w.stamina < 25 ? 'bad' : ''}">${Math.round(w.stamina)}</td>
        <td class="small">${jobLabel(s, w, now)}</td>
        <td class="w-actions">${w.job?.type === 'exp' ? '' : `<select data-change="w-assign" data-id="${w.id}"><option value="">— poste —</option>${Object.entries(WORK_SECTORS).map(([k, sec]) => `<option value="${k}" ${w.job?.sector === k ? 'selected' : ''}>${sec.icon} ${sec.name}</option>`).join('')}<option value="__none">💤 Repos</option></select>`}
          ${w.foreman ? `<button class="mini ghost" data-action="w-demote" data-id="${w.id}">Rétrograder</button>` : automationLevel(s) >= 2 && w.level >= (w.traits.includes('leader') ? 3 : 5) ? `<select data-change="w-promote" data-id="${w.id}"><option value="">🦺 Promouvoir…</option>${Object.entries(FOREMAN_TYPES).map(([k, f]) => `<option value="${k}">${f.icon} ${f.name}</option>`).join('')}</select>` : ''}
          ${w.level >= 15 ? `<button class="mini good" data-action="w-ascend" data-id="${w.id}" title="Un ouvrier légendaire peut devenir héros">⭐ Élever au rang de héros</button>` : ''}
          <select data-change="w-retrain" data-id="${w.id}"><option value="">Reconvertir (60 or)…</option>${Object.entries(PROFESSIONS).filter(([k]) => k !== w.prof).map(([k, p]) => `<option value="${k}">${p.icon} ${p.name}</option>`).join('')}</select>
          <button class="mini ghost danger" data-action="w-dismiss" data-id="${w.id}" title="Renvoyer">✕</button></td></tr>`).join('') || '<tr><td colspan="7" class="muted">Aucun ouvrier ici.</td></tr>'}
      </tbody></table></div></div>`;
  },
  actions: {
    'w-recruit': (app) => app.act(() => recruitWorker(app.state, document.getElementById('w-prof').value || null), (r) => `${r.worker.name} rejoint le royaume`),
    'w-sector': (app, el) => app.act(() => { const n = assignMany(app.state, el.dataset.sec, +el.dataset.n, Date.now(), false); return n ? { ok: true } : { ok: false, reason: 'Aucun ouvrier inactif' }; }),
    'w-unsector': (app, el) => { const w = app.state.workers.find((x) => x.job?.type === 'sector' && x.job.sector === el.dataset.sec && !x.foreman); if (w) w.job = null; app.render(); },
    'w-filter': (app, el) => { app.ui.wFilter = el.dataset.k; app.render(); },
    'w-assign': (app, el) => app.act(() => assignWorker(app.state, el.dataset.id, el.value === '__none' ? null : el.value || null)),
    'w-promote': (app, el) => el.value && app.act(() => promoteForeman(app.state, el.dataset.id, el.value), 'Nouveau contremaître !'),
    'w-demote': (app, el) => app.act(() => demoteForeman(app.state, el.dataset.id)),
    'w-retrain': (app, el) => el.value && app.act(() => retrain(app.state, el.dataset.id, el.value), 'Reconversion effectuée'),
    'w-dismiss': (app, el) => { if (confirm('Renvoyer cet ouvrier ?')) app.act(() => dismissWorker(app.state, el.dataset.id)); },
    'w-ascend': (app, el) => app.act(() => ascendWorker(app.state, el.dataset.id, maxHeroes(app.state) + 1), (r) => `⭐ ${r.hero.name} devient un héros !`),
  },
};
void fmt; void computeMods;
