// v20 « Ma forteresse » — Fin de la corvée : quatre tâches répétitives réglées une fois (raids relancés,
// ravitaillement, alerte et défense, ménage des rapports). Hors quota d'ordres ; chaque passage est consigné ici et
// dans le journal des ordres. Tout se coupe d'un clic.
import { CHORES, CHORE_ORDER, CHORE_LIMITS, choreState, setChore, choresSummary, bestRaidTarget } from '../../systems/chores.js';
import { RAID, maxRaidOrders } from '../../systems/raidOrders.js';
import { thLevel } from '../../systems/city.js';
import { POI_TYPES } from '../../data/world.js';
import { fmt } from '../../core/util.js';
import { esc } from '../components.js';

function settings(app, k, c) {
  const s = app.state;
  if (k === 'raids') {
    const p = bestRaidTarget(s, c.maxDanger);
    return `<div class="row gap wrap small"><label>Attaques par série <select data-change="chore-set" data-k="raids" data-f="count">${CHORE_LIMITS.raidCounts.map((n) => `<option ${c.count === n ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
      <label>Danger au plus <select data-change="chore-set" data-k="raids" data-f="maxDanger">${[1, 2, 3, 4, 5].map((n) => `<option ${c.maxDanger === n ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
      <span>Réserve gardée : ${fmt(c.reserve.gold)} 🪙, ${fmt(c.reserve.food)} 🍖</span></div>
      <div class="small muted">${thLevel(s) < RAID.minTh ? `Raids en série à partir de l’hôtel de ville ${RAID.minTh}.` : `Places de raids en série : ${maxRaidOrders(thLevel(s))}. Meilleur camp connu : ${p ? `${esc(p.name || POI_TYPES[p.type]?.name || p.type)} (${p.x}, ${p.y}), danger ${p.danger || 0}` : 'aucun pour l’instant (explorez la carte)'}.`} Troupes choisies automatiquement à chaque attaque ; arrêt automatique après une défaite ou des pertes lourdes.</div>`;
  }
  if (k === 'supply') return `<div class="row gap wrap small"><label>Réserve de nourriture <input type="number" min="0" step="500" value="${c.reserve}" data-change="chore-set" data-k="supply" data-f="reserve" style="width:7em"></label><span class="muted">Jamais en dessous.</span></div>`;
  if (k === 'cleanup') return `<div class="row gap wrap small"><label>Rapports lus de plus de <select data-change="chore-set" data-k="cleanup" data-f="days">${CHORE_LIMITS.cleanupDays.map((n) => `<option value="${n}" ${c.days === n ? 'selected' : ''}>${n} jour${n > 1 ? 's' : ''}</option>`).join('')}</select></label><span class="muted">Défaites et urgences toujours gardées.</span></div>`;
  return '<div class="small muted">La défense conseillée (garnison par flanc, engins posés) est appliquée dès qu’un raid est repéré. Vous pouvez la modifier ensuite dans « Défense ».</div>';
}

export default {
  id: 'chores', title: 'Corvées', icon: '🧹',
  render(app) {
    const s = app.state, C = choreState(s), sum = choresSummary(s);
    return `<div class="card"><h2>🧹 Fin de la corvée</h2>
      <p class="small muted">Réglez une fois ce que vous refaisiez à la main. Ces corvées ne prennent aucune place d’ordre du royaume et respectent toujours les réserves et les limites existantes (nombre de raids en série, arrêt après une défaite).</p>
      <p class="small">${sum.on} corvée${sum.on > 1 ? 's' : ''} active${sum.on > 1 ? 's' : ''} · ${sum.runs} passage${sum.runs > 1 ? 's' : ''} · environ <b>${fmt(sum.clicks)} clics épargnés</b>.</p></div>
      <div class="chore-grid">${CHORE_ORDER.map((k) => { const d = CHORES[k], c = C[k]; return `<div class="card chore-card ${c.on ? 'on' : ''}">
        <div class="row gap"><h3>${d.icon} ${esc(d.name)}</h3><button class="btn ${c.on ? 'primary' : ''}" data-action="chore-toggle" data-k="${k}" aria-pressed="${c.on}">${c.on ? '✔ Activée' : 'Activer'}</button></div>
        <p class="small muted">${esc(d.desc)}</p>${settings(app, k, c)}
        <div class="small">${C.stats[k] ? `${C.stats[k]} passage${C.stats[k] > 1 ? 's' : ''}` : 'Pas encore de passage'}</div></div>`; }).join('')}</div>
      <div class="card"><h3>Journal des corvées</h3>${C.log.length ? `<ul class="small chore-log">${C.log.slice(0, 15).map((l) => `<li><span class="muted">${new Date(l.t).toLocaleString('fr-FR')}</span> ${CHORES[l.key]?.icon || ''} ${esc(l.msg)}</li>`).join('')}</ul>` : '<p class="small muted">Rien encore.</p>'}</div>`;
  },
  actions: {
    'chore-toggle': (app, el) => { const k = el.dataset.k; const on = !choreState(app.state)[k].on; app.act(() => setChore(app.state, k, { on }), `${CHORES[k].name} : ${on ? 'activée' : 'coupée'}`); },
    'chore-set': (app, el) => { const v = Number(el.value); app.act(() => setChore(app.state, el.dataset.k, { [el.dataset.f]: v })); },
  },
};
