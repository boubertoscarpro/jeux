import { LIVE_EVENTS, SURPRISE_EVENTS } from '../../data/liveEvents.js';
import { fmt } from '../../core/util.js';
import { liveState, ensureCalendar, activeSurprises, notifications } from '../../systems/liveEvents.js';
import { esc, countdown } from '../components.js';

const fmtDate = (t) => new Date(t).toLocaleString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

export function reportHtml(r) {
  return `<div class="ev-report"><h3>${r.icon} ${esc(r.name)}</h3><div class="ev-strip">
    <div class="ev-stat"><span class="muted small">Rang final</span><b>${r.rank}<span class="muted small"> / ${r.of}</span></b></div>
    <div class="ev-stat"><span class="muted small">Camps vaincus</span><b>${fmt(r.camps)}</b></div>
    <div class="ev-stat"><span class="muted small">Monnaie gagnée</span><b>${fmt(r.earned)}</b></div>
    <div class="ev-stat"><span class="muted small">Boss (rangs)</span><b>${r.bossTier}</b></div>
    <div class="ev-stat"><span class="muted small">Restant converti</span><b>${fmt(r.left)} → ${r.converted}</b></div></div>
    ${r.best ? `<div class="small">⭐ Meilleur gain : ${fmt(r.best.v)} (${esc(r.best.why)})</div>` : ''}
    ${r.rewards.length ? `<h4>Récompenses de fin</h4><ul class="small">${r.rewards.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}</div>`;
}

export default {
  id: 'calendar', title: 'Calendrier', icon: '📅',
  render(app) {
    const s = app.state;
    const L = liveState(s);
    ensureCalendar(s);
    const now = Date.now();
    const cur = L.current;
    const surprises = activeSurprises(s, now);
    const slot = (def, start, end, label, active) => `<div class="cal-slot ${active ? 'active' : ''}" style="--evc:${def.color}">
      <div class="cal-icon">${def.icon}</div><div class="cal-main"><b>${esc(def.name)}</b><div class="small muted">${label}</div>
      <div class="small">${fmtDate(start)} → ${fmtDate(end)}</div><div class="small muted">${def.tags.map((t) => `#${t}`).join(' ')} · monnaie : ${def.currency.icon} ${esc(def.currency.name)}</div></div>
      <div class="cal-cd">${active ? `fin dans<br><b>${countdown(end)}</b>` : `dans<br><b>${countdown(start)}</b>`}</div></div>`;
    return `<div class="card"><h2>📅 Calendrier des événements</h2>
      <p class="small muted">Un grand événement tous les ~3 jours. La rotation est semi-aléatoire : jamais deux fois le même ordre, pas de retour avant ${4} autres événements, et deux thèmes proches ne s’enchaînent pas. Participer n’est jamais obligatoire — mais les récompenses valent le détour.</p>
      ${cur ? slot(LIVE_EVENTS[cur.key], cur.start, cur.end, 'En cours', true) : ''}
      ${L.calendar.map((c, i) => slot(LIVE_EVENTS[c.key], c.start, c.end, i === 0 ? 'Prochain' : 'À venir', false)).join('')}
    </div>
    <div class="cols-2"><div class="card"><h3>✨ Événements surprises</h3>
      ${surprises.map((sp) => `<div class="cal-slot active"><div class="cal-icon">${SURPRISE_EVENTS[sp.key].icon}</div><div class="cal-main"><b>${esc(SURPRISE_EVENTS[sp.key].name)}</b><div class="small">${esc(SURPRISE_EVENTS[sp.key].desc)}</div>${sp.x !== undefined ? `<div class="small">Lieu : (${sp.x}, ${sp.y}) sur la carte du monde</div>` : ''}</div><div class="cal-cd">fin dans<br><b>${countdown(sp.end)}</b></div></div>`).join('') || '<p class="muted small">Aucun en ce moment.</p>'}
      <p class="small">🎪 Prochaine <b>Grande Foire</b> (annoncée) : ${L.nextFair > now ? countdown(L.nextFair) : 'en cours'}</p>
      <div class="small muted">${Object.values(SURPRISE_EVENTS).map((x) => `${x.icon} <b>${esc(x.name)}</b> (${x.hours} h) — ${esc(x.desc)}`).join('<br>')}</div></div>
      <div class="card"><h3>🔔 Notifications</h3>${notifications(s).slice(0, 20).map((n) => `<div class="log-line small ${n.read ? 'muted' : ''}">${n.icon} ${esc(n.text)} <span class="muted">· ${fmtDate(n.t)}</span></div>`).join('') || '<p class="muted small">Rien pour l’instant.</p>'}
      <button class="mini" data-action="notif-read">Tout marquer comme lu</button></div></div>
    <div class="card"><h3>📜 Bilans des événements passés</h3>${L.reports.map(reportHtml).join('<hr>') || '<p class="muted small">Aucun événement terminé pour l’instant.</p>'}
      ${L.totals?.events ? `<p class="small">Événements terminés : ${L.totals.events} · meilleur rang : ${L.totals.bestRank} · meilleur score : ${fmt(L.totals.bestScore)}</p>` : ''}</div>
    <p class="small muted center"><button class="mini ghost" data-action="dev-toggle">🛠️ ${s.admin?.dev ? 'Masquer' : 'Afficher'} les outils de développement</button></p>`;
  },
  actions: {
    'dev-toggle': (app) => { app.state.admin.dev = !app.state.admin.dev; app.render(); },
    'notif-read': (app) => { for (const n of notifications(app.state)) n.read = true; app.render(); },
  },
};
