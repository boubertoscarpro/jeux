// Interface des passe-temps : bouton sur chaque chantier, fenêtre de choix (inventaire, temps retiré, temps restant
// après l'action, prix exact en gemmes), confirmation des dépenses en gemmes, résumé de l'inventaire.
import { SPEEDUPS, SPEEDUP_ORDER, SPEEDUP_MIN_LEFT_S, COMBAT_SPEEDUPS } from '../data/speedups.js';
import { speedupStock, previewSpeedup, applySpeedup, findBuildJob, jobLabel, suggestSpeedup, speedupState, totalSpeedupMinutes, combatRoom } from '../systems/speedups.js';
import { fmt, fmtTime } from '../core/util.js';
import { esc, countdown, progress } from './components.js';
import { gameIcon, resIcon } from './icons.js';

export const speedIcon = (k, size = 22) => gameIcon(k, size, '⏳');

// Petit bouton « accélérer » sur une ligne de chantier ; il brille quand un passe-temps ou assez de gemmes permettent d'agir
export function speedupButton(s, q, now = Date.now()) {
  if (q.end - now < SPEEDUP_MIN_LEFT_S * 1000) return '';
  const items = SPEEDUP_ORDER.some((k) => (s.inventory.consumables[k] || 0) > 0);
  const gems = previewSpeedup(s, q.id, { gems: 'hour' }, now).ok;
  return `<button class="mini ${items || gems ? 'speed-ready' : 'ghost'}" data-action="speedup-open" data-id="${q.id}" title="Accélérer ce chantier${items ? ' (passe-temps disponibles)' : ''}" aria-label="Accélérer">${gameIcon('speed5', 14, '⏳')}</button>`;
}

// Ligne « accélérer » d'une fiche de chantier (ville) : stock disponible et bouton
export function speedupLine(s, q, now = Date.now()) {
  if (q.end - now < SPEEDUP_MIN_LEFT_S * 1000) return '';
  const n = SPEEDUP_ORDER.reduce((a, k) => a + (s.inventory.consumables[k] || 0), 0);
  return `<div class="row between small sp-line"><span>${n ? `${n} passe-temps en réserve` : 'Aucun passe-temps : gemmes possibles'}</span><button class="mini ${n ? 'primary' : 'ghost'}" data-action="speedup-open" data-id="${q.id}">${gameIcon('speed5', 14, '⏳')} Accélérer</button></div>`;
}

const remainLine = (p) => `−${fmtTime(p.removed)} → ${p.after > 0 ? `reste ${fmtTime(p.after)}` : '<b>terminé</b>'}`;

function modalHtml(s, qid, now = Date.now()) {
  const q = findBuildJob(s, qid);
  if (!q) return null;
  const left = Math.max(0, q.end - now);
  const best = suggestSpeedup(s, qid, now);
  const rows = speedupStock(s).map((it) => {
    const p = previewSpeedup(s, qid, { item: it.key }, now);
    const why = p.ok ? `${remainLine(p)}${p.wasted > 60000 ? ` <span class="warn-text">(${fmtTime(p.wasted)} perdues)</span>` : ''}` : esc(p.reason);
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
  return `<h2>${gameIcon('speed15', 22, '⏳')} Accélérer un chantier</h2>
    <div class="card-sub"><div class="row between"><b>${esc(jobLabel(q))}</b>${countdown(q.end)}</div>${progress(q.start, q.end)}
      <div class="small muted">Temps restant : ${fmtTime(left)}${q.sped ? ` · déjà accéléré de ${fmtTime(q.sped)}` : ''}</div></div>
    <h3 class="small">Passe-temps</h3><div class="sp-list">${rows}</div>
    <h3 class="small">Gemmes <span class="muted">(${fmt(Math.floor(s.resources.gems || 0))} en réserve)</span></h3>
    <div class="sp-list">${gem('hour', left > 3600000 ? 'Avancer d’une heure' : 'Terminer (moins d’une heure)')}${left > 3600000 ? gem('finish', 'Terminer maintenant') : ''}</div>
    <p class="small muted">Les gemmes coûtent 1 par tranche de 15 min pour la première heure, puis 1 par tranche de 30 min. Elles ne sont jamais obligatoires : les passe-temps se gagnent en jouant (voir le Trésor).</p>`;
}

export function openSpeedup(app, qid) {
  const html = modalHtml(app.state, qid);
  if (!html) { app.closeModal(); app.toast('Ce chantier est déjà terminé', 'bad'); return; }
  app.modal(html, speedupModalActions, 'wide');
}

const after = (app, r, qid) => {
  if (!r?.ok) { app.toast(r?.reason || 'Accélération impossible', 'bad'); openSpeedup(app, qid); return; }
  app.toast(r.done ? 'Chantier terminé !' : `Chantier avancé de ${fmtTime(r.removed)}`, 'good');
  app.render(); app.save();
  if (r.done) app.closeModal(); else openSpeedup(app, qid);
};
const speedupModalActions = {
  'speedup-item': (app, el) => after(app, applySpeedup(app.state, el.dataset.id, { item: el.dataset.key }, Date.now()), el.dataset.id),
  // Gemmes : confirmation avec les conséquences exactes, recalculées au moment du clic
  'speedup-gems': (app, el) => {
    const qid = el.dataset.id, how = el.dataset.how;
    const p = previewSpeedup(app.state, qid, { gems: how });
    if (!p.ok) { app.toast(p.reason, 'bad'); return openSpeedup(app, qid); }
    const q = findBuildJob(app.state, qid);
    app.confirm(`<h2>Dépenser ${p.cost} gemme${p.cost > 1 ? 's' : ''} ?</h2><p><b>${esc(jobLabel(q))}</b> : ${remainLine(p)}.</p><p class="small muted">Gemmes après l’achat : ${fmt(Math.floor(app.state.resources.gems || 0) - p.cost)}.</p>`,
      `Payer ${p.cost} gemme${p.cost > 1 ? 's' : ''}`, () => after(app, applySpeedup(app.state, qid, { gems: how }, Date.now()), qid), false);
  },
};
export const speedupActions = { 'speedup-open': (app, el) => openSpeedup(app, el.dataset.id) };

// Résumé de l'inventaire et des sources (Trésor)
export function speedupPanel(s, now = Date.now()) {
  const S = speedupState(s);
  const stock = speedupStock(s);
  const jobs = s.queues.build.filter((q) => q.end - now >= SPEEDUP_MIN_LEFT_S * 1000);
  return `<div class="card"><h2>${gameIcon('speed15', 22, '⏳')} Passe-temps</h2>
    <p class="small muted">Chaque passe-temps retire du temps à un chantier (bouton sablier à côté du chantier, dans la colonne des files). Total en réserve : <b>${fmtTime(totalSpeedupMinutes(s) * 60000)}</b>.</p>
    <div class="sp-grid">${stock.map((it) => `<div class="sp-card ${it.n ? '' : 'empty'}">${speedIcon(it.key, 34)}<b>${it.short}</b><span class="small">${esc(it.name)}</span><span class="sp-n">× ${it.n}</span></div>`).join('')}</div>
    ${jobs.length ? `<div class="small">Chantiers accélérables : ${jobs.map((q) => `<button class="mini ghost" data-action="speedup-open" data-id="${q.id}">${esc(jobLabel(q))} · ${fmtTime(q.end - now)}</button>`).join(' ')}</div>` : '<div class="small muted">Aucun chantier en cours.</div>'}
    <details class="small"><summary>Comment en obtenir ?</summary><ul>
      <li>Combats gagnés sur la carte contre une cible à votre mesure (camps, repaires, cryptes, capitales rivales) : de 5 min à 1 h selon le danger. Une cible beaucoup plus faible que votre armée ne donne rien. Plafond : ${COMBAT_SPEEDUPS.dailyCap} par jour (encore ${combatRoom(s, now)} aujourd’hui).</li>
      <li>Donjons purgés (1 h), boss mondiaux (deux sceaux d’1 h, parfois un parchemin de 8 h).</li>
      <li>Forteresses des Seigneurs de la Brèche : selon le palier.</li>
      <li>Événements : objectifs et paliers du passe (jusqu’au parchemin de 8 h au palier 20).</li>
      <li>Défis de maîtrise (bronze, argent, or), grandes quêtes, mystères résolus, expéditions légendaires, une mission du royaume sur trois.</li>
    </ul></details>
    <div class="small muted">Gagnés : ${SPEEDUP_ORDER.map((k) => `${SPEEDUPS[k].short} × ${S.earned[k] || 0}`).join(' · ')} · Temps gagné : ${fmtTime((S.minutesSaved || 0) * 60000)} · Gemmes dépensées : ${S.gemsSpent || 0}</div></div>`;
}
