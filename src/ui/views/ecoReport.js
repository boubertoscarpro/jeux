import { fmt, fmtTime } from '../../core/util.js';
import { economicReport } from '../../systems/report.js';
import { esc, resChips } from '../components.js';

const rate = (v) => `${v > 0.05 ? '+' : ''}${fmt(Math.abs(v) < 0.05 ? 0 : v)}/h`;
const top = (o, n = 3) => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => `${esc(k)} ${fmt(v)}`).join(', ');

export default {
  id: 'ecoReport', title: 'Bilan', icon: '⚖️',
  badge: (app) => { const r = economicReport(app.state); return r.shortages.length + (r.famine ? 1 : 0); },
  render(app) {
    const s = app.state;
    const r = economicReport(s);
    const alerts = [];
    if (r.famine) alerts.push('<div class="req">⚠️ <b>Famine</b> : l’entretien n’est plus payé. Moral −30 et formation d’unités impossible. Produisez de la nourriture ou réduisez l’armée.</div>');
    for (const x of r.shortages) alerts.push(`<div class="req">${x.icon} <b>${esc(x.name)}</b> : stock épuisé dans ${fmtTime(x.hoursLeft * 3600000)} (${rate(x.net)}). Gros consommateurs : ${top(x.users) || '—'}.</div>`);
    for (const x of r.list.filter((l) => l.full && l.prod > 0)) alerts.push(`<div class="small warn-text">📦 ${x.icon} ${esc(x.name)} : entrepôt plein, la production est perdue. Vendez, consommez ou agrandissez l’entrepôt.</div>`);
    return `<div class="card"><h2>⚖️ Bilan économique</h2>
      <p class="small muted">Valeurs <b>réelles par heure</b>, calculées avec les mêmes formules que la simulation : bonus de terrain, d’adjacence, de route, d’ouvriers, de technologies, de saison et d’événement compris. Une chaîne bloquée est comptée comme arrêtée.</p>
      ${alerts.join('') || '<div class="ok small">✔ Aucune pénurie prévue dans les 6 prochaines heures.</div>'}</div>
    <div class="card"><h3>📈 Production et consommation</h3><div class="table-wrap"><table class="table eco-table"><thead><tr><th>Ressource</th><th class="num">Stock</th><th class="num">Production</th><th class="num">Consommation</th><th class="num">Net</th><th>Prévision</th><th>Principales sources</th><th>Principaux usages</th></tr></thead><tbody>
      ${r.list.map((x) => `<tr class="${x.shortage ? 'row-bad' : ''}"><td>${x.icon} ${esc(x.name)}</td><td class="num">${fmt(x.stock)}${x.cap ? `<span class="muted small"> / ${fmt(x.cap)}</span>` : ''}</td>
        <td class="num ok">${x.prod ? '+' + fmt(x.prod) : '—'}</td><td class="num bad">${x.use ? '−' + fmt(x.use) : '—'}</td><td class="num ${x.net < 0 ? 'bad' : x.net > 0 ? 'ok' : ''}"><b>${rate(x.net)}</b></td>
        <td class="small">${x.hoursLeft < Infinity ? `vide dans ${fmtTime(x.hoursLeft * 3600000)}` : x.full ? 'plein' : x.hoursFull < Infinity ? `plein dans ${fmtTime(x.hoursFull * 3600000)}` : '—'}</td>
        <td class="small muted">${top(x.sources) || '—'}</td><td class="small muted">${top(x.users) || '—'}</td></tr>`).join('')}
      </tbody></table></div></div>
    <div class="cols-2"><div class="card"><h3>🔗 Chaînes de production</h3>
      ${r.chains.map((c) => `<div class="small">${c.icon} ${esc(c.name)} niv. ${c.b.level} — ${c.status === 'ok' ? '<span class="ok">en marche</span>' : c.status === 'paused' ? '<span class="muted">en pause</span>' : `<span class="bad">${c.status === 'capped' ? 'arrêtée' : 'ralentie'}</span> : ${esc(c.reason)}`}${c.damaged ? ' · <span class="bad">endommagée</span>' : ''}</div>`).join('') || '<p class="muted small">Aucune chaîne de transformation construite.</p>'}
      ${r.idle.length ? `<h4>Bâtiments diminués</h4>${r.idle.map((i) => `<div class="small">${i.icon} ${esc(i.name)} : ${esc(i.reason)}</div>`).join('')}` : ''}</div>
      <div class="card"><h3>🍖 Entretien</h3><div class="small">Armée : <b>${fmt(r.upkeep.army)}</b>/h · Ouvriers : <b>${fmt(r.upkeep.workers)}</b>/h · Total : <b>${fmt(r.upkeep.total)}</b> nourriture/h</div>
        ${r.upkeep.byUnit.slice(0, 8).map((u) => `<div class="small">${u.icon} ${u.n} ${esc(u.name)} — ${fmt(u.food)}/h</div>`).join('')}
        <h3>💸 Pertes (7 derniers jours)</h3>${r.losses.map((l) => `<div class="small">${esc(l.label)} : ${resChips(l.res)}</div>`).join('') || '<p class="muted small">Aucune perte enregistrée.</p>'}</div></div>`;
  },
};
