import { EXPEDITION_TYPES, EXPEDITION_DURATIONS, PROFESSIONS, FOREMAN_TYPES, TRAITS } from '../../data/workers.js';
import { POI_TYPES } from '../../data/world.js';
import { RESOURCES } from '../../data/resources.js';
import { UNITS } from '../../data/units.js';
import { fmt, fmtTime } from '../../core/util.js';
import { computeMods } from '../../systems/modifiers.js';
import { automationLevel } from '../../systems/workforce.js';
import { maxTeams, createTeam, deleteTeam, setTeam, startExpedition, recallExpedition, teamWorkers, teamForeman, teamRate, teamCapacity, autoTarget, policyName } from '../../systems/expeditions.js';
import { isRevealed, distCap } from '../../systems/world.js';
import { esc, resChips, countdown, progress } from '../components.js';

const STATUS = { idle: '🏠 Au repos', out: '🚶 En route', work: '⛏️ Au travail', back: '🎒 Retour' };

function targetOptions(state, t) {
  const def = EXPEDITION_TYPES[t.type];
  if (!def.nodes.length) return '<option value="auto">🎲 Zone inexplorée au hasard</option>';
  const nodes = Object.values(state.world.pois).filter((p) => def.nodes.includes(p.type) && isRevealed(state.world, p.x, p.y))
    .sort((a, b) => distCap(state.world, a.x, a.y) - distCap(state.world, b.x, b.y)).slice(0, 25);
  const cur = t.target === 'auto' ? 'auto' : `${t.target.x},${t.target.y}`;
  return `<option value="auto" ${cur === 'auto' ? 'selected' : ''}>🎯 Automatique (site le plus proche)</option>` + nodes.map((p) => {
    const k = `${p.x},${p.y}`;
    const d = POI_TYPES[p.type];
    return `<option value="${k}" ${cur === k ? 'selected' : ''}>${d.icon} ${esc(p.name || d.name)} (${p.x},${p.y}) — ${d.kind === 'gather' ? `${fmt(p.amount)} ${RESOURCES[d.res].icon}` : `danger ${p.danger}`}${p.danger ? ` ☠${p.danger}` : ''}${p.exhaust > 0.5 ? ' · sol épuisé' : ''}</option>`;
  }).join('');
}

function teamCard(app, t) {
  const s = app.state;
  const def = EXPEDITION_TYPES[t.type];
  const ws = teamWorkers(s, t);
  const fm = teamForeman(s, t);
  const mods = computeMods(s);
  const editable = t.status === 'idle';
  const fmOk = fm && FOREMAN_TYPES[fm.foreman]?.exp.includes(t.type);
  // Estimation
  let estimate = '';
  if (def.per && editable) {
    const tgt = t.target === 'auto' ? autoTarget(s, t) : t.target;
    if (tgt) {
      const tmp = { ...t, at: tgt };
      const rate = teamRate(s, tmp, mods);
      const poi = s.world.pois[`${tgt.x},${tgt.y}`];
      estimate = `≈ ${fmt(rate)}/h · ${fmt(Math.min(rate * t.hours, poi?.amount || 0, t.maxQty || Infinity, teamCapacity(s, t) * 3))} ${RESOURCES[POI_TYPES[poi.type].res].icon} par sortie · trajet ${fmtTime((distCap(s.world, tgt.x, tgt.y) * 18000))}`;
    } else estimate = '<span class="req">Aucun site adapté découvert : explorez la carte.</span>';
  }
  const phaseEnd = t.status === 'out' ? t.arrive : t.status === 'work' ? t.workEnd : t.status === 'back' ? t.returnAt : 0;
  const phaseStart = t.status === 'out' ? t.start : t.status === 'work' ? t.workStart : t.status === 'back' ? t.returnAt - t.travel : 0;
  return `<div class="team card-sub">
    <div class="team-head"><span class="team-icon">${def.icon}</span><div><input class="team-name" value="${esc(t.name)}" data-change="t-name" data-id="${t.id}" ${editable ? '' : 'disabled'}><div class="small muted">${esc(def.name)} · ${STATUS[t.status]}${t.status !== 'idle' && t.at ? ` en (${t.at.x}, ${t.at.y})` : ''} · ${t.runs} sortie(s), ${fmt(t.totalYield)} ressources au total</div></div>
      <div class="team-ctl">${editable ? `<button class="btn primary small" data-action="t-start" data-id="${t.id}">▶ Lancer</button>` : t.status !== 'back' ? `<button class="btn ghost small" data-action="t-recall" data-id="${t.id}">↩ Rappeler</button>` : ''}</div></div>
    ${phaseEnd ? `<div class="small">${countdown(phaseEnd)} ${progress(phaseStart, phaseEnd)}${t.status === 'work' && def.per ? ` <span class="muted">Récolte en cours : ≈ ${fmt(t.accum || 0)}</span>` : ''}</div>` : ''}
    ${t.waitReason && t.repeat ? `<div class="req small">Relance en attente : ${esc(t.waitReason)}</div>` : ''}
    <div class="team-grid">
      <div><h4>Équipe (${ws.length})</h4><div class="chips">${ws.map((w) => `<span class="unit-chip ${w.prof === def.prof ? 'match' : ''} ${w.stamina < 25 ? 'tired' : ''}" title="${esc(w.traits.map((x) => TRAITS[x].name).join(', '))} · moral ${Math.round(w.morale)} · endurance ${Math.round(w.stamina)}">${PROFESSIONS[w.prof].icon} ${esc(w.name)} ${w.level}</span>`).join('') || '<span class="muted small">Aucun ouvrier</span>'}</div>
        ${editable ? `<button class="mini" data-action="t-pick" data-id="${t.id}">👷 Choisir les ouvriers</button>` : ''}
        <h4>Contremaître</h4>${editable ? `<select data-change="t-foreman" data-id="${t.id}"><option value="">— Aucun —</option>${s.workers.filter((w) => w.foreman && (!s.expeditions.some((o) => o.id !== t.id && o.foremanId === w.id))).map((w) => `<option value="${w.id}" ${t.foremanId === w.id ? 'selected' : ''}>${FOREMAN_TYPES[w.foreman].icon} ${esc(w.name)} (${FOREMAN_TYPES[w.foreman].name})</option>`).join('')}</select>` : `<span class="small">${fm ? esc(fm.name) : '—'}</span>`}
        <div class="small ${fmOk ? 'ok' : 'muted'}">${fmOk ? '✔ Spécialiste : +25% rendement' : 'Un contremaître adapté donne +25% et permet la relance automatique.'}</div>
        <h4>Escorte</h4>${editable ? `<div class="row gap wrap">${['spearman', 'swordsman', 'archer', 'lightcav'].filter((u) => (s.army[u] || 0) + (t.escort[u] || 0) > 0).map((u) => `<label class="small">${UNITS[u].icon}<input class="qty" type="number" min="0" max="${s.army[u] || 0}" value="${t.escort[u] || 0}" data-change="t-escort" data-id="${t.id}" data-u="${u}"></label>`).join('') || '<span class="muted small">Aucune troupe en ville</span>'}</div>` : `<span class="small">${Object.entries(t.escort).map(([u, n]) => `${n} ${UNITS[u].name}`).join(', ') || '—'}</span>`}
      </div>
      <div><h4>Paramètres</h4>
        <div class="form-row"><label>Destination</label><select data-change="t-target" data-id="${t.id}" ${editable ? '' : 'disabled'}>${targetOptions(s, t)}</select></div>
        ${t.type === 'mining' ? `<div class="form-row"><label>Minerai visé</label><select data-change="t-focus" data-id="${t.id}" ${editable ? '' : 'disabled'}><option value="">Tous</option>${['iron', 'stone', 'coal'].map((r) => `<option value="${r}" ${t.focus === r ? 'selected' : ''}>${RESOURCES[r].icon} ${RESOURCES[r].name}</option>`).join('')}</select></div>` : ''}
        <div class="form-row"><label>Durée de travail</label><select data-change="t-hours" data-id="${t.id}" ${editable ? '' : 'disabled'}>${EXPEDITION_DURATIONS.map((h) => `<option value="${h}" ${t.hours === h ? 'selected' : ''}>${h} h</option>`).join('')}</select></div>
        <div class="form-row"><label>Quantité max</label><input class="qty" type="number" min="0" value="${t.maxQty || 0}" data-change="t-max" data-id="${t.id}"> <span class="muted small">0 = illimité</span></div>
        <div class="form-row"><label>Consigne</label><select data-change="t-policy" data-id="${t.id}">${Object.entries(policyName).map(([k, n]) => `<option value="${k}" ${t.policy === k ? 'selected' : ''}>${n}</option>`).join('')}</select></div>
        <label class="small"><input type="checkbox" data-change="t-rations" data-id="${t.id}" ${t.rations ? 'checked' : ''}> 🥫 Emporter des rations (+15% rendement, stock ${fmt(s.resources.rations || 0)})</label><br>
        <label class="small ${automationLevel(s) >= 3 ? '' : 'muted'}"><input type="checkbox" data-change="t-repeat" data-id="${t.id}" ${t.repeat ? 'checked' : ''} ${automationLevel(s) >= 3 ? '' : 'disabled'}> 🔁 Relance automatique ${automationLevel(s) >= 3 ? '(contremaître requis)' : '(palier 3)'}</label>
        ${estimate ? `<div class="small estimate">${estimate}</div>` : ''}
      </div>
      <div><h4>Journal</h4><div class="team-log small">${(t.events || []).slice(-6).reverse().map((e) => `<div>${esc(e)}</div>`).join('') || '<span class="muted">—</span>'}</div>
        ${t.history?.length ? `<h4>Dernières sorties</h4>${t.history.slice(0, 3).map((h) => `<div class="small">${new Date(h.t).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })} ${resChips(h.yield)}${h.items ? ` +${h.items} objet(s)` : ''}</div>`).join('')}` : ''}
        ${editable ? `<button class="mini ghost danger" data-action="t-delete" data-id="${t.id}">Dissoudre l’équipe</button>` : ''}</div>
    </div></div>`;
}

function pickModal(app, id) {
  const s = app.state;
  const t = s.expeditions.find((x) => x.id === id);
  const def = EXPEDITION_TYPES[t.type];
  const other = new Set(s.expeditions.filter((o) => o.id !== id).flatMap((o) => o.workerIds));
  const cands = s.workers.filter((w) => !w.foreman && !other.has(w.id) && w.job?.type !== 'exp')
    .sort((a, b) => (b.prof === def.prof) - (a.prof === def.prof) || b.level - a.level);
  const sel = new Set(t.workerIds);
  app.modal(`<h2>👷 Composer « ${esc(t.name)} »</h2><p class="muted small">Idéal : ${PROFESSIONS[def.prof]?.icon || ''} ${PROFESSIONS[def.prof]?.name || 'toute profession'} (+50%). Les ouvriers en secteur quitteront leur poste pendant l’expédition.</p>
    <div class="pick-list">${cands.map((w) => `<label class="pick ${w.prof === def.prof ? 'match' : ''}"><input type="checkbox" class="pick-cb" value="${w.id}" ${sel.has(w.id) ? 'checked' : ''}> ${PROFESSIONS[w.prof].icon} <b>${esc(w.name)}</b> niv. ${w.level} <span class="muted small">${w.traits.map((x) => TRAITS[x].name).join(', ')} · moral ${Math.round(w.morale)} · endurance ${Math.round(w.stamina)}${w.injuredUntil > Date.now() ? ' · 🩹 blessé' : ''}</span></label>`).join('') || '<div class="muted">Aucun ouvrier disponible.</div>'}</div>
    <div class="row gap end"><button class="btn ghost" data-action="pick-best">Les meilleurs (10)</button><button class="btn primary" data-action="pick-ok">Valider</button></div>`, {
    'pick-best': () => { document.querySelectorAll('.pick-cb').forEach((cb, i) => { cb.checked = i < 10; }); },
    'pick-ok': (a) => {
      const ids = [...document.querySelectorAll('.pick-cb')].filter((cb) => cb.checked).map((cb) => cb.value);
      setTeam(a.state, id, { workerIds: ids });
      a.closeModal(); a.render(); a.save();
    },
  }, 'wide');
}

export default {
  id: 'expeditions', title: 'Expéditions', icon: '🧭',
  locked: (app) => (automationLevel(app.state) < 1 ? 'Les Expéditions se débloquent avec le palier « Ouvriers » de l’Intendance.' : null),
  badge: (app) => app.state.pending.filter((p) => p.kind === 'exp').length,
  render(app) {
    const s = app.state;
    const lvl = automationLevel(s);
    return `<div class="card"><h2>🧭 Expéditions <span class="muted small">${s.expeditions.length}/${maxTeams(s)} équipes</span></h2>
      <p class="muted small">Formez des équipes spécialisées qui partent farmer seules : choisissez destination, durée, quantité maximale et composition. Des événements surviennent en route — vous pouvez intervenir, ou laisser la consigne décider (prudente / audacieuse). Avec un contremaître et le palier 3, elles repartent toutes seules.</p>
      <div class="row gap wrap">${Object.entries(EXPEDITION_TYPES).map(([k, d]) => `<button class="mini" data-action="t-create" data-type="${k}" ${d.automation > lvl ? 'disabled title="Palier ' + d.automation + ' requis"' : ''}>${d.icon} ${esc(d.name)}</button>`).join('')}</div></div>
      ${s.expeditions.map((t) => teamCard(app, t)).join('') || '<div class="empty">Aucune équipe. Créez-en une ci-dessus.</div>'}`;
  },
  actions: {
    't-create': (app, el) => app.act(() => createTeam(app.state, { type: el.dataset.type }), 'Équipe créée'),
    't-delete': (app, el) => app.act(() => deleteTeam(app.state, el.dataset.id)),
    't-start': (app, el) => app.act(() => startExpedition(app.state, el.dataset.id), 'Expédition en route !'),
    't-recall': (app, el) => app.act(() => recallExpedition(app.state, el.dataset.id), 'Rappel ordonné'),
    't-pick': (app, el) => pickModal(app, el.dataset.id),
    't-name': (app, el) => app.act(() => setTeam(app.state, el.dataset.id, { name: el.value.slice(0, 40) })),
    't-foreman': (app, el) => app.act(() => setTeam(app.state, el.dataset.id, { foremanId: el.value || null })),
    't-target': (app, el) => app.act(() => setTeam(app.state, el.dataset.id, { target: el.value === 'auto' ? 'auto' : { x: +el.value.split(',')[0], y: +el.value.split(',')[1] } })),
    't-focus': (app, el) => app.act(() => setTeam(app.state, el.dataset.id, { focus: el.value || null })),
    't-hours': (app, el) => app.act(() => setTeam(app.state, el.dataset.id, { hours: +el.value })),
    't-max': (app, el) => app.act(() => setTeam(app.state, el.dataset.id, { maxQty: Math.max(0, +el.value || 0) })),
    't-policy': (app, el) => app.act(() => setTeam(app.state, el.dataset.id, { policy: el.value })),
    't-rations': (app, el) => app.act(() => setTeam(app.state, el.dataset.id, { rations: el.checked })),
    't-repeat': (app, el) => app.act(() => setTeam(app.state, el.dataset.id, { repeat: el.checked })),
    't-escort': (app, el) => { const t = app.state.expeditions.find((x) => x.id === el.dataset.id); const v = Math.max(0, Math.min(app.state.army[el.dataset.u] || 0, +el.value || 0)); app.act(() => setTeam(app.state, t.id, { escort: { ...t.escort, [el.dataset.u]: v } })); },
  },
};
