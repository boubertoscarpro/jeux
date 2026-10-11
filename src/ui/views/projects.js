import { resIcon } from '../icons.js';
// Grands projets royaux : chantiers en plusieurs étapes, contributions, travaux, bonus permanents.
import { PROJECTS, PROJECT_MIN_TH } from '../../data/projects.js';
import { RESOURCES } from '../../data/resources.js';
import { fmt } from '../../core/util.js';
import { thLevel } from '../../systems/city.js';
import { projectState, projectInfo, startProject, contribute, startStageWorks, abandonProject } from '../../systems/projects.js';
import { esc, countdown, progress, bar } from '../components.js';

function stageList(info) {
  return `<ol class="proj-stages">${info.def.stages.map((st, i) => {
    const cls = i < info.stage ? 'done' : i === info.stage && info.active ? 'current' : 'locked';
    const label = cls === 'done' ? 'Terminée' : cls === 'current' ? (info.building ? 'Travaux en cours' : 'En cours') : 'Verrouillée';
    return `<li class="${cls}"><b>Étape ${i + 1} — ${esc(st.name)}</b> <span class="chip small">${label}</span><div class="small muted">${Object.entries(st.cost).map(([r, v]) => `${resIcon(r, 16, RESOURCES[r]?.icon)} ${fmt(v)}`).join(' ')} · travaux ${st.hours} h${st.req.length ? ` · ${st.req.map(([t]) => esc(t)).join(', ')}` : ''}</div></li>`;
  }).join('')}</ol>`;
}

function activeCard(app, info) {
  const s = app.state, st = info.st;
  const rows = Object.entries(st.cost).map(([r, need]) => {
    const paid = info.paid[r] || 0, done = paid >= need;
    return `<div class="proj-res ${done ? 'ok' : ''}"><span>${resIcon(r, 16, RESOURCES[r]?.icon)} ${esc(RESOURCES[r].name)}</span><span class="small">${fmt(paid)} / ${fmt(need)} <span class="muted">(stock ${fmt(s.resources[r] || 0)})</span></span>${bar(paid, need)}
      ${done || info.building ? '' : `<button class="mini" data-action="pj-give" data-r="${r}" ${(s.resources[r] || 0) < 1 ? 'disabled' : ''}>Apporter</button>`}</div>`;
  }).join('');
  return `<div class="card proj-card current"><div class="row between wrap"><h2>${info.def.icon} ${esc(info.def.name)}</h2><span class="muted small">Étape ${info.stage + 1}/${info.def.stages.length}</span></div>
    <p class="small story">${esc(info.def.desc)}</p>
    ${stageList(info)}
    <div class="panel-sub"><h4>Étape en cours : ${esc(st.name)}</h4>
      ${info.building ? `<div>🔨 Travaux en cours · ${countdown(info.buildEnd)}${progress(info.buildStart, info.buildEnd)}</div>` : `
      <div class="proj-res-grid">${rows}</div>
      ${info.funded ? '<div class="small ok">✔ Étape entièrement financée.</div>' : ''}<div class="row gap wrap" ${info.funded ? 'hidden' : ''}><button class="btn" data-action="pj-give-all" title="Apporte tout ce qui est disponible, dans la limite du besoin">Tout apporter</button><button class="btn ghost" data-action="pj-give-half" title="N’apporte que la moitié de vos stocks : vous gardez de quoi construire">Apporter la moitié de mes stocks</button></div>
      <h4>Conditions des travaux</h4>${info.reqs.map((r) => `<div class="small ${r.ok ? 'ok' : 'req'}">${r.ok ? '✔' : '✗'} ${esc(r.text)}</div>`).join('') || '<div class="small muted">Aucune.</div>'}
      <button class="btn primary" data-action="pj-build" ${info.funded && info.reqsOk ? '' : 'disabled'}>🔨 Lancer les travaux (${st.hours} h)</button>
      ${!info.funded ? '<div class="small muted">Les apports sont conservés : vous pouvez financer l’étape en plusieurs fois.</div>' : ''}`}
    </div>
    <div class="small">🏆 À l’achèvement : <b>${esc(info.def.reward.text.join(' · '))}</b> (permanent)</div>
    ${info.building ? '' : '<button class="mini ghost danger" data-action="pj-abandon">Abandonner le projet</button>'}</div>`;
}

export default {
  id: 'projects', title: 'Grands projets', icon: '🏗️',
  locked: (app) => (thLevel(app.state) < PROJECT_MIN_TH ? `Les grands projets royaux s’ouvrent à l’hôtel de ville niveau ${PROJECT_MIN_TH}.` : null),
  badge: (app) => { const a = projectState(app.state).active; if (!a || a.buildEnd) return 0; const i = projectInfo(app.state, a.id); return i.funded && i.reqsOk ? 1 : 0; },
  render(app) {
    const s = app.state, P = projectState(s);
    const infos = Object.keys(PROJECTS).map((id) => projectInfo(s, id));
    const act = infos.find((i) => i.active);
    return `<div class="card"><h2>🏗️ Grands projets royaux</h2>
      <p class="small muted">Des chantiers de longue haleine en plusieurs étapes, qui mobilisent vos chaînes de production, vos avant-postes et vos recherches. Un seul projet à la fois ; chaque étape se finance en plusieurs apports (rien n’est perdu), puis demande des travaux. À l’achèvement : des bonus <b>permanents</b> et un repère sur la carte du monde.</p></div>
      ${act ? activeCard(app, act) : ''}
      <div class="proj-grid">${infos.filter((i) => !i.active).map((i) => `<div class="card proj-card ${i.done ? 'done' : ''}">
        <div class="row between"><h3>${i.def.icon} ${esc(i.def.name)}</h3>${i.done ? '<span class="ok small">✔ Achevé</span>' : `<span class="muted small">HdV ${i.def.th}</span>`}</div>
        <p class="small muted">${esc(i.def.desc)}</p>
        ${stageList(i)}
        <div class="small">🏆 ${esc(i.def.reward.text.join(' · '))}</div>
        ${i.done ? '' : i.locked ? `<div class="req small">${esc(i.locked)}</div>` : act ? '<div class="small muted">Terminez ou abandonnez le projet en cours d’abord.</div>' : `<button class="btn primary" data-action="pj-start" data-id="${i.id}">Lancer ce projet</button>`}
      </div>`).join('')}</div>
      ${Object.keys(P.done).length ? `<div class="card"><h3>Projets achevés</h3>${Object.entries(P.done).map(([id, t]) => `<div class="small">${PROJECTS[id].icon} ${esc(PROJECTS[id].name)} — ${new Date(t).toLocaleDateString('fr-FR')}</div>`).join('')}</div>` : ''}`;
  },
  actions: {
    'pj-start': (app, el) => app.act(() => startProject(app.state, el.dataset.id), 'Grand projet lancé'),
    'pj-give': (app, el) => app.act(() => contribute(app.state, el.dataset.r), (r) => `Apport : ${r.text}`),
    'pj-give-all': (app) => app.act(() => contribute(app.state), (r) => `Apport : ${r.text}`),
    'pj-give-half': (app) => app.act(() => contribute(app.state, null, 0.5), (r) => `Apport : ${r.text}`),
    'pj-build': (app) => app.act(() => startStageWorks(app.state), 'Travaux lancés'),
    'pj-abandon': (app) => app.confirm('<h2>Abandonner le grand projet ?</h2><p>Les étapes déjà achevées sont perdues ; la moitié des apports de l’étape en cours vous est rendue.</p>', 'Abandonner', () => app.act(() => abandonProject(app.state), 'Projet abandonné')),
  },
};
