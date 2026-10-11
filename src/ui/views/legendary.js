// Expéditions légendaires : indices, préparation (provisions, escorte, chef), itinéraire, décisions en route,
// épreuve finale et sort de la découverte.
import { LEGENDS, PROVISIONS, ESCORTS, FATES, LEGEND_MIN_TH } from '../../data/legendary.js';
import { ALL_UNITS } from '../../data/units.js';
import { thLevel } from '../../systems/city.js';
import { legendState, canDepart, depart, decide, currentEvent, choiceAllowed, finalEnemies, chooseFate, abandonLegend, freeHeroes, prepCost, estimateFinal } from '../../systems/legendary.js';
import { esc, costList, countdown } from '../components.js';

function activeCard(app, a) {
  const s = app.state, def = LEGENDS[a.id], route = def.routes.find((r) => r.id === a.route);
  const hero = s.heroes.find((h) => h.id === a.heroId);
  const steps = [...route.events.map((_, i) => `Étape ${i + 1}`), 'Épreuve finale'];
  const soldiers = Object.values(a.team).reduce((x, y) => x + y, 0);
  const ev = currentEvent(a);
  let body;
  if (a.awaitingFate) body = `<h3>🏆 Victoire ! Que faire de la découverte ?</h3><div class="lx-route">${Object.entries(FATES).map(([k, f]) => `<div class="lx-opt"><b>${f.icon} ${esc(f.name)}</b><span class="small muted">${esc(f.desc)}</span><button class="mini primary" data-action="lx-fate" data-k="${k}">Choisir</button></div>`).join('')}</div>`;
  else if (ev) body = `<div class="parchment card"><h3>${esc(ev.title)}</h3><p>${esc(ev.text)}</p><div class="lx-route">${ev.choices.map((c, i) => { const ok = choiceAllowed(s, a, c); return `<div class="lx-opt"><b>${esc(c.label)}</b><span class="small muted">${esc(c.hint)}</span>${ok.ok ? `<button class="mini primary" data-action="lx-decide" data-i="${i}">Choisir</button>` : `<span class="req small">${esc(ok.reason)}</span>`}</div>`; }).join('')}</div></div>`;
  else body = `<div class="small">${a.step < route.events.length ? 'La colonne progresse vers la prochaine étape' : `La colonne approche de l’épreuve finale : <b>${esc(def.final.name)}</b> (${Object.entries(finalEnemies(s, a)).map(([u, n]) => `${n} ${esc(ALL_UNITS[u]?.name || u)}`).join(', ')})`} · ${countdown(a.at)}</div>`;
  return `<div class="card ch-card active"><h2>${def.icon} ${esc(def.name)} <span class="muted small">${esc(route.name)}</span></h2>
    <div class="lx-steps">${steps.map((n, i) => `<span class="${i < a.step ? 'done' : i === a.step ? 'now' : ''}">${n}</span>`).join('')}</div>
    <div class="small">Chef : <b>${esc(hero?.name || '—')}</b> · Escorte : ${soldiers} soldats · Provisions : ${'🍞'.repeat(a.supplies) || 'épuisées'} · Moral ${a.morale >= 0 ? '+' : ''}${a.morale} · Force ${a.power >= 0 ? '+' : ''}${a.power} %</div>
    ${a.log.length ? `<ul class="small">${a.log.map((l) => `<li><b>${esc(l.title)}</b> — « ${esc(l.choice)} »${l.text ? ` : ${esc(l.text)}` : ''}</li>`).join('')}</ul>` : ''}
    ${body}
    ${a.awaitingFate ? '' : '<button class="mini ghost danger" data-action="lx-abandon">Rebrousser chemin</button>'}</div>`;
}

export default {
  id: 'legend', title: 'Légendes', icon: '🗺️',
  locked: (app) => (thLevel(app.state) < LEGEND_MIN_TH ? `Les expéditions légendaires demandent l’hôtel de ville niveau ${LEGEND_MIN_TH}.` : null),
  render(app) {
    const s = app.state, L = legendState(s), ui = (app.ui.lx ||= { provisions: 'normal', escort: 'medium', route: null, heroId: null });
    const heroes = freeHeroes(s);
    if (!heroes.some((h) => h.id === ui.heroId)) ui.heroId = [...heroes].sort((a, b) => b.level - a.level)[0]?.id || null;
    const cards = Object.entries(LEGENDS).map(([id, def]) => {
      const unlocked = !!L.unlocked[id], done = L.done[id];
      if (!unlocked) return `<div class="ch-card"><b>❔ Expédition inconnue</b><div class="small muted">Indice à découvrir : ${esc(def.unlockText)}</div></div>`;
      if (done) return `<div class="ch-card"><b>${def.icon} ${esc(def.name)}</b><div class="small ok">✔ Menée à bien — découverte ${esc(FATES[done.fate]?.name.toLowerCase() || '')}.</div></div>`;
      const route = def.routes.find((r) => r.id === ui.route) ? ui.route : def.routes[0].id;
      const c = canDepart(s, id, { ...ui, route }, Date.now());
      return `<div class="ch-card"><b>${def.icon} ${esc(def.name)}</b><div class="small">${esc(def.desc)}</div>
        <h4>Itinéraire</h4><div class="lx-route">${def.routes.map((r) => `<div class="lx-opt ${r.id === route ? 'sel' : ''}"><b>${esc(r.name)}</b><span class="small muted">${esc(r.desc)} · ${r.events.length} étapes de ${r.legMin} min${r.guard ? ' · gardien plus fort' : ''}</span><button class="mini ${r.id === route ? 'selected' : ''}" data-action="lx-route" data-k="${r.id}">${r.id === route ? 'Choisi' : 'Choisir'}</button></div>`).join('')}</div>
        <div class="small muted">Épreuve finale : ${esc(def.final.name)}. Récompense : ressources, fragments de relique, puis vous décidez du sort de la découverte.${L.fails?.[id] ? ` Le gardien est affaibli par vos ${L.fails[id]} tentative(s) précédente(s).` : ''}</div>
        ${(() => { const e = estimateFinal(s, id, { ...ui, route }); return e ? `<div class="small ${e.winner === 'attacker' ? 'ok' : 'bad'}">Estimation avec cette escorte, avant les événements de la route : <b>${esc(e.verdict)}</b> (pertes ≈ ${Math.round(e.lossRatio * 100)} %). Les bons choix en chemin renforcent l’escorte.</div>` : ''; })()}
        ${L.active ? '' : c.ok ? `<button class="btn primary small" data-action="lx-go" data-id="${id}" data-route="${route}">Partir</button> ${costList(prepCost(ui.provisions), s)}` : `<div class="req small">${esc(c.reason)}</div>`}</div>`;
    }).join('');
    const prep = `<div class="card"><h3>🎒 Préparatifs</h3>
      <div class="form-row"><label>Provisions</label><div class="seg">${Object.entries(PROVISIONS).map(([k, p]) => `<button class="mini ${ui.provisions === k ? 'selected' : ''}" data-action="lx-prov" data-k="${k}" title="${esc(p.desc)}">${esc(p.name)} (${p.supplies} 🍞)</button>`).join('')}</div></div>
      <div class="form-row"><label>Escorte</label><div class="seg">${Object.entries(ESCORTS).map(([k, e]) => `<button class="mini ${ui.escort === k ? 'selected' : ''}" data-action="lx-escort" data-k="${k}">${esc(e.name)} (${Math.round(e.share * 100)} % de l’armée)</button>`).join('')}</div></div>
      <div class="form-row"><label>Chef</label>${heroes.length ? `<select data-change="lx-hero" id="lx-hero">${heroes.map((h) => `<option value="${h.id}" ${ui.heroId === h.id ? 'selected' : ''}>${esc(h.name)} (niv. ${h.level})</option>`).join('')}</select>` : '<span class="req small">Aucun héros disponible</span>'}</div>
      <p class="small muted">Les provisions servent aux imprévus de la route ; sans vivres, le moral et la force chutent. Certains choix demandent un chef rusé ou savant. Les soldats de l’escorte quittent le château pendant l’expédition.</p></div>`;
    return `<div class="card"><h2>🗺️ Expéditions légendaires</h2>
      <p class="small muted">Des expéditions rares, préparées, qui demandent des décisions en route. Chacune se découvre par un autre pan du jeu : un mystère résolu, un boss abattu, une faction amie, l’histoire de votre lignée.</p></div>
      ${L.active ? activeCard(app, L.active) : prep}<div class="ch-grid">${cards}</div>
      ${L.history.length ? `<div class="card"><h3>📜 Récits d’expédition</h3><ul class="small">${L.history.slice(0, 8).map((h) => `<li>${LEGENDS[h.id]?.icon || ''} ${esc(LEGENDS[h.id]?.name || h.id)} : ${h.won ? `victoire (${esc(FATES[h.fate]?.name.toLowerCase() || '')})` : h.abandoned ? 'demi-tour' : '<span class="bad">échec</span>'}</li>`).join('')}</ul></div>` : ''}`;
  },
  actions: {
    'lx-prov': (app, el) => { app.ui.lx.provisions = el.dataset.k; app.render(); },
    'lx-escort': (app, el) => { app.ui.lx.escort = el.dataset.k; app.render(); },
    'lx-route': (app, el) => { app.ui.lx.route = el.dataset.k; app.render(); },
    'lx-hero': (app, el) => { app.ui.lx.heroId = el.value; app.render(); },
    'lx-go': (app, el) => { if (confirm('Lancer l’expédition ? Les provisions sont consommées et l’escorte quitte le château.')) app.act(() => depart(app.state, el.dataset.id, { ...app.ui.lx, route: el.dataset.route }), 'L’expédition se met en route'); },
    'lx-decide': (app, el) => app.act(() => decide(app.state, +el.dataset.i), (r) => `🗺️ ${r.text || 'La colonne reprend sa route'}`),
    'lx-fate': (app, el) => app.act(() => chooseFate(app.state, el.dataset.k), (r) => `🏆 Découverte ${r.text}`),
    'lx-abandon': (app) => { if (confirm('Rebrousser chemin ? Les provisions sont perdues, l’indice reste valable.')) app.act(() => abandonLegend(app.state), 'Demi-tour'); },
  },
};
