import { RESOURCES, TRADABLE } from '../../data/resources.js';
import { UNITS } from '../../data/units.js';
import { fmt, fmtTime } from '../../core/util.js';
import { computeMods } from '../../systems/modifiers.js';
import { levelOf } from '../../systems/city.js';
import { CONVOY_MODES, convoyRisk, sendCaravan, townPrice, caravanTime, caravanCargo, caravanSlots, fulfillContract, cancelRoute, tradeBlocked } from '../../systems/market.js';
import { isRevealed } from '../../systems/world.js';
import { esc, resChips, countdown, progress } from '../components.js';

export default {
  id: 'convoys', title: 'Convois & contrats', icon: '🐪',
  locked: (app) => (levelOf(app.state, 'market') ? null : 'Construisez un Marché pour organiser convois, routes commerciales et contrats.'),
  badge: (app) => (app.state.contracts || []).filter((c) => (app.state.resources[c.res] || 0) >= c.qty).length,
  render(app) {
    const s = app.state;
    const mods = computeMods(s);
    const towns = Object.values(s.world.pois).filter((p) => p.type === 'town' && isRevealed(s.world, p.x, p.y));
    const d = (app.ui.cv ||= { town: towns[0] ? `${towns[0].x},${towns[0].y}` : '', res: 'wood', qty: 500, mode: 'secure', guards: 0, repeat: false });
    const town = towns.find((t) => `${t.x},${t.y}` === d.town) || towns[0];
    let preview = '';
    if (town) {
      const md = CONVOY_MODES[d.mode];
      const guards = d.guards > 0 ? { spearman: d.guards } : {};
      const risk = convoyRisk(s, town, d.mode, guards, mods);
      const gold = townPrice(s, town, d.res, mods) * d.qty * md.profit;
      const dur = caravanTime(s, town, mods) * md.time * 2;
      const blocked = tradeBlocked(s, town);
      preview = `<div class="estimate small">Recette prévue : <b>${fmt(gold)} or</b> · aller-retour ${fmtTime(dur)} · risque d’attaque <b class="${risk > 0.25 ? 'bad' : risk > 0.1 ? 'warn-text' : 'ok'}">${Math.round(risk * 100)}%</b> · rentabilité ≈ ${fmt(gold * (1 - risk * 0.6) / (dur / 3600000))} or/h${town.wants.includes(d.res) ? ' · ★ ressource demandée (+60%)' : ''}</div>${blocked ? `<div class="req">${esc(blocked)}</div>` : ''}`;
    }
    const routes = Object.entries(s.routes || {});
    return `<div class="cols-2">
      <div class="card"><h2>🐪 Organiser un convoi <span class="muted small">${s.caravans.length}/${caravanSlots(mods)} caravanes</span></h2>
        ${!towns.length ? '<p class="req">Explorez la carte pour découvrir des cités libres 🏘️.</p>' : `
        <div class="form-row"><label>Destination</label><select id="cv-town" data-change="cv" data-k="town">${towns.map((t) => `<option value="${t.x},${t.y}" ${d.town === `${t.x},${t.y}` ? 'selected' : ''}>🏘️ ${esc(t.name)}${t.vassal ? ' (vassale)' : ''} — ★ ${t.wants.map((r) => RESOURCES[r].icon).join('')}</option>`).join('')}</select></div>
        <div class="form-row"><label>Marchandise</label><select id="cv-res2" data-change="cv" data-k="res">${TRADABLE.map((r) => `<option value="${r}" ${d.res === r ? 'selected' : ''}>${RESOURCES[r].icon} ${esc(RESOURCES[r].name)} (${fmt(s.resources[r] || 0)}) — ${town ? townPrice(s, town, r, mods).toFixed(2) : '?'} or/u</option>`).join('')}</select></div>
        <div class="form-row"><label>Quantité</label><input id="cv-qty2" type="number" min="1" max="${caravanCargo(s)}" value="${d.qty}" data-change="cv" data-k="qty"> <span class="muted small">max ${fmt(caravanCargo(s))}</span></div>
        <div class="form-row"><label>Mode</label><div class="row gap wrap">${Object.entries(CONVOY_MODES).map(([k, m]) => `<button class="mini ${d.mode === k ? 'primary' : ''}" data-action="cv-mode" data-k="${k}" title="${esc(m.desc)}">${m.icon} ${esc(m.name)}</button>`).join('')}</div></div>
        <div class="muted small">${esc(CONVOY_MODES[d.mode].desc)}</div>
        <div class="form-row"><label>Gardes (lanciers)</label><input id="cv-guards" type="number" min="0" max="${s.army.spearman || 0}" value="${d.guards}" data-change="cv" data-k="guards"> <span class="muted small">/ ${s.army.spearman || 0}</span></div>
        <label class="small"><input type="checkbox" data-change="cv" data-k="repeat" ${d.repeat ? 'checked' : ''}> 🔁 Route commerciale permanente</label>
        ${preview}
        <button class="btn primary" data-action="cv-send">Envoyer le convoi</button>`}
      </div>
      <div class="card"><h2>📜 Contrats des cités</h2>
        <p class="muted small">Les cités publient des commandes à échéance, payées bien au-dessus du marché. Farmez ce qu’on vous demande !</p>
        ${(s.contracts || []).map((c) => `<div class="objective ${(s.resources[c.res] || 0) >= c.qty ? 'done' : ''}"><div class="q-top"><b>🏘️ ${esc(c.town)} demande ${fmt(c.qty)} ${RESOURCES[c.res].icon} ${esc(RESOURCES[c.res].name)}</b>${countdown(c.until)}</div>
          <div class="quest-foot">${resChips(c.reward)}<span class="muted small">stock ${fmt(s.resources[c.res] || 0)}</span><button class="mini good" data-action="ct-do" data-id="${c.id}" ${(s.resources[c.res] || 0) >= c.qty ? '' : 'disabled'}>Livrer</button></div></div>`).join('') || '<div class="muted small">Aucun contrat pour l’instant (renouvellement toutes les 25 min).</div>'}
      </div></div>
      <div class="card"><h2>🛤️ Caravanes en route</h2>
        ${s.caravans.map((c) => `<div class="q-row"><div class="q-top"><span>${CONVOY_MODES[c.mode || 'secure'].icon} ${esc(c.town)} — ${fmt(c.qty)} ${RESOURCES[c.res].icon} → ${fmt(c.gold)} 🪙 · risque ${Math.round((c.risk || 0) * 100)}%${Object.keys(c.guards || {}).length ? ` · 🛡️ ${Object.entries(c.guards).map(([u, n]) => `${n} ${UNITS[u].name}`).join(', ')}` : ''}${c.repeat ? ' 🔁' : ''}</span>${countdown(c.end)}${c.repeat ? `<button class="mini ghost" data-action="cv-stop" data-id="${c.id}">Arrêter la route</button>` : ''}</div>${progress(c.start, c.end)}</div>`).join('') || '<div class="muted small">Aucune caravane.</div>'}
        <h3>📊 Rentabilité des routes</h3>
        ${routes.length ? `<table><thead><tr><th>Route</th><th>Voyages</th><th>Recette</th><th>Or / h</th><th>Attaques</th></tr></thead><tbody>${routes.map(([, r]) => `<tr><td>${esc(r.town)}</td><td class="num">${r.trips}</td><td class="num">${fmt(r.profit)}</td><td class="num ${r.profit / Math.max(0.1, r.hours) < 60 ? 'bad' : 'ok'}">${fmt(r.profit / Math.max(0.1, r.hours))}</td><td class="num">${r.attacks}</td></tr>`).join('')}</tbody></table>` : '<div class="muted small">Pas encore de statistiques.</div>'}
      </div>`;
  },
  actions: {
    cv: (app, el) => { const d = app.ui.cv; const k = el.dataset.k; d[k] = el.type === 'checkbox' ? el.checked : ['qty', 'guards'].includes(k) ? Math.max(0, +el.value || 0) : el.value; app.render(); },
    'cv-mode': (app, el) => { app.ui.cv.mode = el.dataset.k; app.render(); },
    'cv-send': (app) => {
      const d = app.ui.cv;
      const [x, y] = d.town.split(',').map(Number);
      app.act(() => sendCaravan(app.state, x, y, d.res, d.qty, d.repeat, Date.now(), d.mode, d.guards > 0 ? { spearman: d.guards } : {}), (r) => `🐪 Convoi parti (recette prévue ${fmt(r.gold)} or, risque ${Math.round(r.risk * 100)}%)`);
    },
    'cv-stop': (app, el) => { cancelRoute(app.state, el.dataset.id); app.render(); },
    'ct-do': (app, el) => app.act(() => fulfillContract(app.state, el.dataset.id), 'Contrat honoré !'),
  },
};
