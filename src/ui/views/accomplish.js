// Accomplissements : progression globale (ce qui est débloqué, ce qui reste à découvrir et à quelles conditions)
// et fin de partie sur trois axes (Maîtrise, Découverte, Héritage), visibles dès le début de la partie.
import { endgameAxes } from '../../systems/endgame.js';
import { esc, bar } from '../components.js';
import { GROUPS } from '../app.js';
import { navIcon } from '../icons.js';

export default {
  id: 'accomplish', title: 'Accomplissements', icon: '🏆',
  render(app) {
    const s = app.state, ax = endgameAxes(s);
    const axisCard = (a) => `<div class="axis"><h3>${a.icon} ${esc(a.name)} <span class="pct">${a.pct} %</span></h3><div class="small muted">${esc(a.desc)}</div>${bar(a.pct, 100)}
      ${a.items.map((i) => `<div class="prog-item ${i.done ? 'open' : ''}"><span class="pi-ic">${i.icon}</span><div style="flex:1;min-width:0"><div class="row between small"><b>${esc(i.name)}</b><span>${i.cur}/${i.max}</span></div>${bar(i.cur, i.max, i.done ? 'good' : '')}<div class="small muted">${esc(i.hint)}</div></div></div>`).join('')}</div>`;
    // Carte des systèmes : chaque onglet, débloqué ou non, avec la condition exacte
    const groups = GROUPS.map((g) => {
      const tabs = g.tabs.map((t) => { let l = null; try { l = t.locked ? t.locked(app) : null; } catch { l = null; } return { t, l }; });
      const open = tabs.filter((x) => !x.l).length;
      return `<div class="card-sub"><div class="row between"><b>${navIcon(g.id, 20) || g.icon} ${esc(g.title)}</b><span class="small muted">${open}/${tabs.length} ouverts</span></div>
        <div class="prog-list">${tabs.map(({ t, l }) => `<div class="prog-item ${l ? 'locked' : 'open'}"><span class="pi-ic">${l ? '🔒' : t.icon}</span><div><b class="small">${esc(t.title)}</b><div class="small ${l ? 'warn-text' : 'muted'}">${l ? esc(l) : 'Disponible'}</div>${l ? '' : `<button class="mini ghost" data-action="goto" data-view="${t.id}">Ouvrir</button>`}</div></div>`).join('')}</div></div>`;
    }).join('');
    return `<div class="card"><h2>🏆 Accomplissements</h2>
      <p class="small muted">Après la campagne principale, la partie continue sur trois axes : la <b>Maîtrise</b> (prouver la qualité de votre stratégie), la <b>Découverte</b> (les secrets encore inconnus) et l’<b>Héritage</b> (ce que votre lignée transmettra). Chaque critère indique comment progresser ; les récompenses viennent des systèmes eux-mêmes.</p></div>
      <div class="axis-grid">${axisCard(ax.mastery)}${axisCard(ax.discovery)}${axisCard(ax.heritage)}</div>
      <div class="card"><h2>🔓 Progression du royaume</h2><p class="small muted">Tous les écrans du jeu, ce qui est déjà ouvert et la condition exacte des autres.</p>${groups}</div>`;
  },
  actions: {},
};
