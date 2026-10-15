// Interface des passe-temps : bouton sur chaque chantier, fenêtre de choix (inventaire, temps retiré, temps restant
// après l'action, prix exact en gemmes), confirmation des dépenses en gemmes, résumé de l'inventaire.
import { SPEEDUPS, SPEEDUP_ORDER, RECRUIT_ORDER, ORDER_OF, SPEEDUP_MIN_LEFT_S, COMBAT_SPEEDUPS } from '../data/speedups.js';
import { UNITS } from '../data/units.js';
import { speedupStock, previewSpeedup, applySpeedup, findJob, jobLabel, suggestSpeedup, speedupState, totalSpeedupMinutes, combatRoom, finishCombo, applyCombo } from '../systems/speedups.js';
import { fmt, fmtTime } from '../core/util.js';
import { esc, countdown, progress } from './components.js';
import { gameIcon, resIcon, unitIcon } from './icons.js';

export const speedIcon = (k, size = 22) => gameIcon(k, size, '⏳');

const KIND = {
  build: { one: 'chantier', title: 'Accélérer un chantier', done: 'Chantier terminé !', gone: 'Ce chantier est déjà terminé', icon: 'speed5' },
  train: { one: 'formation', title: 'Accélérer une formation', done: 'Formation terminée : les soldats rejoignent la garnison !', gone: 'Cette formation est déjà terminée', icon: 'rspeed5' },
};
const kindOf = (q) => (q.unit ? 'train' : 'build');

// Petit bouton « accélérer » sur une ligne de chantier ou de formation ; il brille quand un passe-temps du bon type
// ou assez de gemmes permettent d'agir. Une formation en attente (derrière une autre) n'a pas de bouton.
export function speedupButton(s, q, now = Date.now()) {
  if (q.end - now < SPEEDUP_MIN_LEFT_S * 1000 || q.start > now) return '';
  const kind = kindOf(q);
  const items = ORDER_OF[kind].some((k) => (s.inventory.consumables[k] || 0) > 0);
  const gems = previewSpeedup(s, q.id, { gems: 'hour' }, now).ok;
  return `<button class="mini ${items || gems ? 'speed-ready' : 'ghost'}" data-action="speedup-open" data-id="${q.id}" title="Accélérer cette ${KIND[kind].one === 'chantier' ? 'construction' : 'formation'}${items ? ' (passe-temps disponibles)' : ''}" aria-label="Accélérer">${gameIcon(KIND[kind].icon, 14, '⏳')}</button>`;
}

// Ligne « accélérer » d'une fiche de chantier (ville) : stock disponible et bouton
export function speedupLine(s, q, now = Date.now()) {
  if (q.end - now < SPEEDUP_MIN_LEFT_S * 1000) return '';
  const n = SPEEDUP_ORDER.reduce((a, k) => a + (s.inventory.consumables[k] || 0), 0);
  return `<div class="row between small sp-line"><span>${n ? `${n} passe-temps en réserve` : 'Aucun passe-temps : gemmes possibles'}</span><button class="mini ${n ? 'primary' : 'ghost'}" data-action="speedup-open" data-id="${q.id}">${gameIcon('speed5', 14, '⏳')} Accélérer</button></div>`;
}

const remainLine = (p) => `−${fmtTime(p.removed)} → ${p.after > 0 ? `reste ${fmtTime(p.after)}` : '<b>terminé</b>'}`;

function modalHtml(s, qid, now = Date.now()) {
  const job = findJob(s, qid);
  if (!job) return null;
  const { q, kind } = job;
  const left = Math.max(0, q.end - now);
  const best = suggestSpeedup(s, qid, now);
  const combo = finishCombo(s, qid, now);
  const comboHtml = combo ? `<div class="sp-row best">${speedIcon(KIND[kind].icon, 28)}<div class="sp-txt"><b>Terminer avec une combinaison</b> <span class="pill good">${fmtTime(combo.minutes * 60000)}</span>
      <div class="small muted">${Object.entries(combo.use).map(([k, n]) => `${n} × ${esc(SPEEDUPS[k].name)} (${SPEEDUPS[k].short})`).join(' + ')}${combo.waste > 1 ? ` · <span class="warn-text">${combo.waste} min perdues</span>` : ''}</div>
      <div class="small muted">Stock après : ${ORDER_OF[kind].map((k) => `${SPEEDUPS[k].short} × ${Math.max(0, (s.inventory.consumables[k] || 0) - (combo.use[k] || 0))}`).join(' · ')}</div></div>
      <button class="mini primary" data-action="speedup-combo" data-id="${q.id}">Terminer</button></div>` : '';
  const head = kind === 'train'
    ? `<div class="row between"><b>${unitIcon(q.unit, 22, UNITS[q.unit]?.icon)} ${q.count} × ${esc(UNITS[q.unit]?.name || q.unit)}</b>${countdown(q.end)}</div>`
    : `<div class="row between"><b>${esc(jobLabel(q))}</b>${countdown(q.end)}</div>`;
  const rows = speedupStock(s, kind).map((it) => {
    const p = previewSpeedup(s, qid, { item: it.key }, now);
    const why = p.ok ? `${remainLine(p)}${p.wasted > 60000 ? ` <span class="warn-text">(${fmtTime(p.wasted)} perdues)</span>` : ''} · stock après : ${it.n - 1}` : esc(p.reason);
    return `<div class="sp-row ${it.n ? '' : 'empty'} ${it.key === best ? 'best' : ''}">${speedIcon(it.key, 28)}
      <div class="sp-txt"><b>${esc(it.name)}</b> <span class="pill">${it.short}</span> <span class="muted small">× ${it.n}</span>${it.key === best ? ' <span class="pill good">conseillé</span>' : ''}<div class="small muted">${why}</div></div>
      <button class="mini ${p.ok ? 'primary' : 'ghost'}" data-action="speedup-item" data-id="${q.id}" data-key="${it.key}" ${p.ok ? '' : 'disabled'}>Utiliser</button></div>`;
  }).join('');
  const gem = (how, label) => {
    const p = previewSpeedup(s, qid, { gems: how }, now);
    if (!p.removed) return '';
    return `<div class="sp-row">${resIcon('gems', 26, '💎')}<div class="sp-txt"><b>${label}</b> <span class="pill">${p.cost} gemme${p.cost > 1 ? 's' : ''}</span><div class="small muted">${p.ok ? remainLine(p) : esc(p.reason)}</div></div>
      <button class="mini ${p.ok ? 'warn' : 'ghost'}" data-action="speedup-gems" data-id="${q.id}" data-how="${how}" ${p.ok ? '' : 'disabled'}>Payer</button></div>`;
  };
  return `<h2>${gameIcon(kind === 'train' ? 'rspeed15' : 'speed15', 22, '⏳')} ${KIND[kind].title}</h2>
    <div class="card-sub">${head}${progress(q.start, q.end)}
      <div class="small muted">Temps restant : ${fmtTime(left)}${q.sped ? ` · déjà accéléré de ${fmtTime(q.sped)}` : ''}</div></div>
    <h3 class="small">${kind === 'train' ? 'Passe-temps de recrutement' : 'Passe-temps de construction'}</h3><div class="sp-list">${comboHtml}${rows}</div>
    <p class="small muted">${kind === 'train' ? 'Seuls les passe-temps de recrutement servent ici ; ceux de construction restent réservés aux chantiers. Les soldats sont ajoutés par la fin normale de la formation, jamais en double.' : 'Seuls les passe-temps de construction servent ici ; ceux de recrutement restent réservés aux formations.'}</p>
    <h3 class="small">Gemmes <span class="muted">(${fmt(Math.floor(s.resources.gems || 0))} en réserve)</span></h3>
    <div class="sp-list">${gem('hour', left > 3600000 ? 'Avancer d’une heure' : 'Terminer (moins d’une heure)')}${left > 3600000 ? gem('finish', 'Terminer maintenant') : ''}</div>
    <p class="small muted">Les gemmes coûtent 1 par tranche de 15 min pour la première heure, puis 1 par tranche de 30 min. Elles ne sont jamais obligatoires : les passe-temps se gagnent en jouant (voir le Trésor).</p>`;
}

export function openSpeedup(app, qid) {
  const html = modalHtml(app.state, qid);
  if (!html) { app.closeModal(); app.toast('Cette tâche est déjà terminée', 'bad'); return; }
  app.modal(html, speedupModalActions, 'wide');
}

const after = (app, r, qid, kind = 'build') => {
  if (!r?.ok) { app.toast(r?.reason || 'Accélération impossible', 'bad'); app.render(); openSpeedup(app, qid); return; }
  app.toast(r.done ? KIND[kind].done : `${kind === 'train' ? 'Formation' : 'Chantier'} avancé${kind === 'train' ? 'e' : ''} de ${fmtTime(r.removed)}`, 'good');
  app.render(); app.save();
  if (r.done) app.closeModal(); else openSpeedup(app, qid);
};
const speedupModalActions = {
  'speedup-item': (app, el) => { const k = findJob(app.state, el.dataset.id)?.kind; after(app, applySpeedup(app.state, el.dataset.id, { item: el.dataset.key }, Date.now()), el.dataset.id, k); },
  // Combinaison : recalculée au clic ; on s'arrête dès que la tâche est finie (rien n'est consommé de trop)
  'speedup-combo': (app, el) => { const k = findJob(app.state, el.dataset.id)?.kind; after(app, applyCombo(app.state, el.dataset.id, Date.now()), el.dataset.id, k); },
  // Gemmes : confirmation avec les conséquences exactes, recalculées au moment du clic
  'speedup-gems': (app, el) => {
    const qid = el.dataset.id, how = el.dataset.how;
    const p = previewSpeedup(app.state, qid, { gems: how });
    if (!p.ok) { app.toast(p.reason, 'bad'); return openSpeedup(app, qid); }
    const job = findJob(app.state, qid), q = job.q;
    app.confirm(`<h2>Dépenser ${p.cost} gemme${p.cost > 1 ? 's' : ''} ?</h2><p><b>${esc(jobLabel(q))}</b> : ${remainLine(p)}.</p><p class="small muted">Gemmes après l’achat : ${fmt(Math.floor(app.state.resources.gems || 0) - p.cost)}.</p>`,
      `Payer ${p.cost} gemme${p.cost > 1 ? 's' : ''}`, () => after(app, applySpeedup(app.state, qid, { gems: how }, Date.now()), qid, job.kind), false);
  },
};
export const speedupActions = { 'speedup-open': (app, el) => openSpeedup(app, el.dataset.id) };

// Résumé de l'inventaire et des sources (Trésor)
export function speedupPanel(s, now = Date.now()) {
  const S = speedupState(s);
  const grid = (kind) => `<div class="sp-grid">${speedupStock(s, kind).map((it) => `<div class="sp-card ${it.n ? '' : 'empty'}">${speedIcon(it.key, 34)}<b>${it.short}</b><span class="small">${esc(it.name)}</span><span class="sp-n">× ${it.n}</span></div>`).join('')}</div>`;
  const ok = (q) => q.end - now >= SPEEDUP_MIN_LEFT_S * 1000 && q.start <= now;
  const jobs = [...s.queues.build.filter(ok), ...s.queues.train.filter(ok)];
  return `<div class="card"><h2>${gameIcon('speed15', 22, '⏳')} Passe-temps</h2>
    <p class="small muted">Chaque passe-temps retire du temps à UNE tâche de son type (bouton sablier à côté du chantier ou de la formation, dans la colonne des files).</p>
    <h3 class="small">Construction <span class="muted">— ${fmtTime(totalSpeedupMinutes(s, 'build') * 60000)} en réserve</span></h3>${grid('build')}
    <h3 class="small">Recrutement <span class="muted">— ${fmtTime(totalSpeedupMinutes(s, 'train') * 60000)} en réserve</span></h3>${grid('train')}
    ${jobs.length ? `<div class="small">Tâches accélérables : ${jobs.map((q) => `<button class="mini ghost" data-action="speedup-open" data-id="${q.id}">${esc(jobLabel(q))} · ${fmtTime(q.end - now)}</button>`).join(' ')}</div>` : '<div class="small muted">Aucun chantier ni formation en cours.</div>'}
    <details class="small"><summary>Comment en obtenir ?</summary><ul>
      <li>Combats gagnés sur la carte contre une cible à votre mesure (camps, repaires, cryptes, capitales rivales) : de 5 min à 1 h selon le danger. Une cible beaucoup plus faible que votre armée ne donne rien. Plafond : ${COMBAT_SPEEDUPS.dailyCap} par jour (encore ${combatRoom(s, now)} aujourd’hui).</li>
      <li>Donjons purgés (1 h), boss mondiaux (deux sceaux d’1 h, parfois un parchemin de 8 h).</li>
      <li>Forteresses des Seigneurs de la Brèche : selon le palier.</li>
      <li>Événements : objectifs et paliers du passe (jusqu’au parchemin de 8 h au palier 20).</li>
      <li>Défis de maîtrise (bronze, argent, or), grandes quêtes, mystères résolus, expéditions légendaires, une mission du royaume sur trois.</li>
      <li>Recrutement : la moitié des gains de combat, les objectifs militaires d’événement, la boutique d’événement (sabliers du capitaine), les quêtes militaires, les défis de discipline et de péril, les Grands Projets militaires.</li>
    </ul></details>
    <div class="small muted">Gagnés : ${SPEEDUP_ORDER.map((k) => `${SPEEDUPS[k].short} × ${S.earned[k] || 0}`).join(' · ')} · recrutement : ${RECRUIT_ORDER.map((k) => `${SPEEDUPS[k].short} × ${S.earned[k] || 0}`).join(' · ')} · Temps gagné : ${fmtTime((S.minutesSaved || 0) * 60000)}${S.trainMinutesSaved ? ` (dont formations ${fmtTime(S.trainMinutesSaved * 60000)})` : ''} · Gemmes dépensées : ${S.gemsSpent || 0}</div></div>`;
}
