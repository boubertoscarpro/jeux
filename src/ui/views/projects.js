import { resIcon } from '../icons.js';
// Grands projets royaux : chantiers en plusieurs étapes, contributions, travaux, bonus permanents.
import { PROJECTS, PROJECT_MIN_TH } from '../../data/projects.js';
import { RESOURCES } from '../../data/resources.js';
import { fmt } from '../../core/util.js';
import { thLevel } from '../../systems/city.js';
import { projectState, projectInfo, startProject, contribute, startStageWorks, abandonProject } from '../../systems/projects.js';
import { esc, countdown, progress, bar } from '../components.js';
import { CROWN_FAMILIES, CROWN_PROJECTS, CROWN_MIN_TH, crownSlots } from '../../data/crown.js';
import { crownList, crownInfo, crownRunning, crownClaimable, crownRewardText, startCrown, claimCrown, cancelCrown } from '../../systems/crown.js';
import { fmtTime } from '../../core/util.js';

// ───────── Grands Projets du Royaume (projets de la Couronne) ─────────
const costHtml = (s, cost) => Object.entries(cost).map(([r, v]) => { const ok = (s.resources[r] || 0) >= v; return `<span class="${ok ? '' : 'req'}" title="${esc(RESOURCES[r]?.name || r)} : ${fmt(Math.floor(s.resources[r] || 0))} en stock">${resIcon(r, 15, RESOURCES[r]?.icon)} ${fmt(v)}</span>`; }).join(' ');
const STATUS = { available: ['Disponible', 'good'], running: ['En cours', ''], claimable: ['À récupérer', 'good'], done: ['Achevé', ''], cooldown: ['En repos', ''], locked: ['Verrouillé', ''], hidden: ['Secret', ''] };

function crownCard(s, i, full, now) {
  const d = i.def;
  if (i.status === 'hidden') return `<div class="card proj-card crown-card hidden-proj"><div class="row between"><h3>❔ ${d.event ? esc(d.name) : 'Projet rare'}</h3><span class="chip small">${d.event ? 'Événement' : 'Rare'}</span></div><p class="small muted">${esc(i.reason)}</p></div>`;
  const [label, cls] = STATUS[i.status];
  const rep = d.repeat ? `<span class="chip small" title="Répétable ${d.repeat.max} fois, ${d.repeat.cooldownH} h entre deux éditions, coût ×${String(d.repeat.growth).replace('.', ',')} à chaque fois">Répétable ${i.doneN}/${d.repeat.max}</span>` : d.event ? '<span class="chip small">Événement · 1 fois</span>' : '<span class="chip small">Unique</span>';
  let action = '';
  if (i.status === 'available') action = full ? '<div class="small muted">Tous les emplacements sont occupés.</div>' : i.affordable ? `<button class="btn primary" data-action="cr-start" data-id="${i.id}">Lancer (${d.hours} h)</button>` : `<div class="small req">Il manque : ${Object.entries(i.lack).map(([r, v]) => `${resIcon(r, 14, RESOURCES[r]?.icon)} ${fmt(v)}`).join(' ')}</div>`;
  else if (i.status === 'cooldown') action = `<div class="small muted">Prochaine édition dans ${fmtTime(Math.max(0, i.readyAt - now))}</div>`;
  else if (i.status === 'locked') action = `<div class="small req">${esc(i.reason)}</div>`;
  else if (i.status === 'done' && i.reason) action = `<div class="small muted">${esc(i.reason)}</div>`;
  return `<div class="card proj-card crown-card ${i.status}"><div class="row between"><h3>${d.icon} ${esc(d.name)}</h3><span class="chip small ${cls}">${label}</span></div>
    <p class="small muted">${esc(d.desc)}</p>
    <div class="small">${rep} <span class="muted">HdV ${Math.max(CROWN_MIN_TH, d.th)} · ${d.hours} h de travaux</span></div>
    ${i.status === 'done' && !d.repeat ? '' : `<div class="small crown-cost">Coût : ${costHtml(s, i.cost)}</div>`}
    ${i.reqs.length ? i.reqs.map((r) => `<div class="small ${r.ok ? 'ok' : 'req'}">${r.ok ? '✔' : '✗'} ${esc(r.text)}</div>`).join('') : ''}
    <div class="small">🏆 ${esc(crownRewardText(i.id))}</div>
    ${action}</div>`;
}

function crownSection(app, now) {
  const s = app.state, th = thLevel(s);
  if (th < CROWN_MIN_TH) return `<div class="card"><h2>👑 Grands Projets du Royaume</h2><p class="small muted">S’ouvrent à l’hôtel de ville niveau ${CROWN_MIN_TH} : infrastructures, préparation militaire, économie et prestige.</p></div>`;
  const list = crownList(s, now);
  const slots = crownSlots(th), used = crownRunning(s), full = used >= slots;
  const fam = app.ui.crownFam && CROWN_FAMILIES[app.ui.crownFam] ? app.ui.crownFam : 'all';
  const runs = list.filter((i) => i.run);
  const shown = list.filter((i) => !i.run && (fam === 'all' || i.def.family === fam));
  const order = { available: 0, cooldown: 1, locked: 2, hidden: 3, done: 4 };
  shown.sort((a, b) => (order[a.status] - order[b.status]) || (a.def.th - b.def.th));
  return `<div class="card"><div class="row between wrap"><h2>👑 Grands Projets du Royaume</h2><span class="muted small">Emplacements : <b>${used}/${slots}</b>${th < 20 ? ' (3 à l’HdV 20)' : ''}</span></div>
      <p class="small muted">Des dépenses <b>facultatives</b> pour employer vos excédents : le coût est payé en une fois au lancement (affiché avant, jamais de stock négatif), puis les travaux tournent seuls. À la fin, récupérez la récompense annoncée. Les projets uniques ne se refont pas ; les répétables ont une limite, un délai et un coût croissant.</p>
      ${runs.length ? `<div class="crown-runs">${runs.map((i) => `<div class="q-row"><div class="q-top"><span>${i.def.icon} <b>${esc(i.def.name)}</b></span>${i.status === 'claimable' ? `<button class="mini primary" data-action="cr-claim" data-id="${i.id}">Récupérer</button>` : `${countdown(i.run.end)}<button class="mini ghost" data-action="cr-cancel" data-id="${i.id}" title="Annuler (moitié du coût rendue)">✕</button>`}</div>${i.status === 'claimable' ? `<div class="small ok">Terminé : ${esc(crownRewardText(i.id))}</div>` : progress(i.run.start, i.run.end)}</div>`).join('')}</div>` : ''}
      <div class="seg wrap crown-fams">${[['all', 'Tous', '📋'], ...Object.entries(CROWN_FAMILIES).map(([k, f]) => [k, f.name, f.icon])].map(([k, n, ic]) => `<button class="mini ${fam === k ? 'selected' : ''}" data-action="cr-fam" data-k="${k}">${ic} ${esc(n)}</button>`).join('')}</div>
      ${fam !== 'all' ? `<p class="small muted">${esc(CROWN_FAMILIES[fam].desc)}</p>` : ''}</div>
    <div class="proj-grid">${shown.map((i) => crownCard(s, i, full, now)).join('')}</div>`;
}

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
  badge: (app) => { const c = crownClaimable(app.state); const a = projectState(app.state).active; if (!a || a.buildEnd) return c; const i = projectInfo(app.state, a.id); return c + (i.funded && i.reqsOk ? 1 : 0); },
  render(app) {
    const s = app.state, P = projectState(s);
    const infos = Object.keys(PROJECTS).map((id) => projectInfo(s, id));
    const act = infos.find((i) => i.active);
    return `${crownSection(app, Date.now())}<div class="card"><h2>🏗️ Grands projets royaux</h2>
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
    'cr-fam': (app, el) => { app.ui.crownFam = el.dataset.k; app.render(); },
    // Confirmation avec le coût exact et le stock restant, recalculés au clic ; la validation reste dans startCrown
    'cr-start': (app, el) => {
      const s = app.state, i = crownInfo(s, el.dataset.id);
      app.confirm(`<h2>${i.def.icon} Lancer « ${esc(i.def.name)} » ?</h2>
        <p>Coût payé maintenant : ${Object.entries(i.cost).map(([r, v]) => `${resIcon(r, 16, RESOURCES[r]?.icon)} ${fmt(v)} <span class="muted small">(reste ${fmt(Math.max(0, Math.floor(s.resources[r] || 0) - v))})</span>`).join(' · ')}</p>
        <p>Travaux : ${i.def.hours} h. Récompense : <b>${esc(crownRewardText(i.id))}</b>.</p>
        <p class="small muted">Annulation possible pendant les travaux : la moitié du coût est rendue.</p>`, 'Lancer', () => app.act(() => startCrown(app.state, i.id), (r) => r.text));
    },
    'cr-claim': (app, el) => app.act(() => claimCrown(app.state, el.dataset.id), (r) => `Récompense : ${r.text}`),
    'cr-cancel': (app, el) => app.confirm('<h2>Annuler ce Grand Projet ?</h2><p>La moitié du coût vous est rendue ; l’édition ne compte pas.</p>', 'Annuler le projet', () => app.act(() => cancelCrown(app.state, el.dataset.id), 'Projet annulé')),
    'pj-start': (app, el) => app.act(() => startProject(app.state, el.dataset.id), 'Grand projet lancé'),
    'pj-give': (app, el) => app.act(() => contribute(app.state, el.dataset.r), (r) => `Apport : ${r.text}`),
    'pj-give-all': (app) => app.act(() => contribute(app.state), (r) => `Apport : ${r.text}`),
    'pj-give-half': (app) => app.act(() => contribute(app.state, null, 0.5), (r) => `Apport : ${r.text}`),
    'pj-build': (app) => app.act(() => startStageWorks(app.state), 'Travaux lancés'),
    'pj-abandon': (app) => app.confirm('<h2>Abandonner le grand projet ?</h2><p>Les étapes déjà achevées sont perdues ; la moitié des apports de l’étape en cours vous est rendue.</p>', 'Abandonner', () => app.act(() => abandonProject(app.state), 'Projet abandonné')),
  },
};
