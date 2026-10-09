import { fmt } from '../../core/util.js';
import { goals } from '../../systems/goals.js';
import { esc, bar, countdown } from '../components.js';

function card(g) {
  const prog = g.max ? `<div class="row between small"><span>${fmt(Math.min(g.cur || 0, g.max))} / ${fmt(g.max)}</span>${g.done ? '<span class="ok">✔ prêt</span>' : ''}</div>${bar(g.cur || 0, g.max)}` : '';
  return `<div class="goal ${g.done ? 'done' : ''} ${g.urgent ? 'urgent' : ''}">
    <div class="goal-head"><span class="goal-icon">${g.icon}</span><b>${esc(g.title)}</b></div>
    ${g.desc ? `<div class="small muted">${esc(g.desc)}</div>` : ''}${prog}
    ${g.prereq ? `<div class="small">🔑 ${esc(g.prereq)}</div>` : ''}${g.reward ? `<div class="small">🎁 ${esc(g.reward)}</div>` : ''}
    ${g.until ? `<div class="small muted">Expire dans ${countdown(g.until)}</div>` : ''}${g.extra ? `<div class="small muted">${esc(g.extra)}</div>` : ''}
    ${g.view ? `<button class="mini" data-action="goto" data-view="${g.view}">Y aller →</button>` : ''}</div>`;
}

export default {
  id: 'goals', title: 'Objectifs', icon: '🎯',
  render(app) {
    const g = goals(app.state);
    const col = (title, sub, list) => `<div class="card"><h3>${title}</h3><p class="small muted">${sub}</p>${list.map(card).join('') || '<p class="muted small">Rien pour l’instant.</p>'}</div>`;
    return `<div class="card"><h2>🎯 Tableau des objectifs</h2><p class="small muted">Vos prochaines étapes, calculées à partir de l’état réel du royaume. Chaque carte mène à l’écran où agir.</p></div>
      <div class="cols-3">${col('⏱️ Court terme', 'Quelques minutes à une heure', g.short)}${col('📅 Moyen terme', 'Quelques heures à quelques jours', g.mid)}${col('🏔️ Long terme', 'Les grands accomplissements', g.long)}</div>`;
  },
};
