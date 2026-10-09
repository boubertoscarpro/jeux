import { LIVE_EVENTS, SURPRISE_EVENTS } from '../../data/liveEvents.js';
import { LIVE_CONFIG } from '../../data/liveConfig.js';
import { TIER_ORDER, PITY_ORDER } from '../../data/shards.js';
import { shardCfg, wheelCfg } from '../../systems/config.js';
import { liveCfg, adminStart, adminEnd, adminCurrency, adminReroll, startSurprise, liveState } from '../../systems/liveEvents.js';
import { shardState, addShards } from '../../systems/shards.js';
import { esc } from '../components.js';
import { ledgerRows, profileProjection } from './shards.js';

// Outil de réglage (développement) : toutes les valeurs surchargent la configuration par défaut via state.admin
const num = (path, value, step = 'any') => `<label class="adm-field"><span>${esc(path.split('.').slice(1).join('.'))}</span><input type="number" step="${step}" value="${value}" data-change="adm-set" data-path="${path}"></label>`;

function setPath(obj, path, v) {
  const keys = path.split('.');
  let o = obj;
  for (const k of keys.slice(0, -1)) o = (o[k] ||= {});
  o[keys[keys.length - 1]] = v;
}

export default {
  id: 'admin', title: 'Admin', icon: '🛠️',
  locked: (app) => (app.state.admin?.dev || /[?&]dev\b/.test(globalThis.location?.search || '') ? null : 'Outils de développement : activez-les depuis le Calendrier (bas de page) ou avec ?dev dans l’adresse.'),
  render(app) {
    const s = app.state;
    const lc = liveCfg(s);
    const sc = shardCfg(s);
    const wc = wheelCfg(s);
    const cur = liveState(s).current;
    const rows = ledgerRows(s, 14);
    const tot = rows.reduce((a, r) => { for (const k of ['gen', 'spent', 'tickets', 'spins', 'legendary', 'mythic', 'jackpot']) a[k] = (a[k] || 0) + r[k]; return a; }, {});
    return `<div class="card"><h2>🛠️ Administration & équilibrage</h2><p class="small muted">Réglages enregistrés dans la sauvegarde (state.admin). « Réinitialiser » rétablit les valeurs par défaut des fichiers de données.</p>
      <div class="row gap wrap"><select id="adm-ev">${Object.entries(LIVE_EVENTS).map(([k, d]) => `<option value="${k}">${d.icon} ${esc(d.name)}</option>`).join('')}</select>
        <button class="btn small primary" data-action="adm-start">▶ Lancer maintenant</button><button class="btn small" data-action="adm-end" ${cur ? '' : 'disabled'}>⏹ Terminer l’événement</button>
        <button class="btn small" data-action="adm-reroll">🔀 Nouveau calendrier</button><button class="btn small" data-action="adm-cur" ${cur ? '' : 'disabled'}>+1 000 monnaie</button></div>
      <div class="row gap wrap">${Object.entries(SURPRISE_EVENTS).map(([k, x]) => `<button class="mini" data-action="adm-surprise" data-k="${k}">${x.icon} ${esc(x.name)}</button>`).join('')}</div>
      <div class="row gap wrap"><button class="mini" data-action="adm-shards" data-n="10">+10 💎</button><button class="mini" data-action="adm-shards" data-n="100">+100 💎</button><button class="mini" data-action="adm-ticket">+1 🎟️</button><button class="btn small ghost" data-action="adm-reset">↺ Réinitialiser les réglages</button></div></div>
    <div class="cols-2"><div class="card"><h3>🎪 Événements</h3><div class="adm-grid">
      ${Object.keys(LIVE_CONFIG).filter((k) => typeof LIVE_CONFIG[k] === 'number').map((k) => num('events.' + k, lc[k])).join('')}</div>
      <h4>Poids de rotation / activation</h4><div class="adm-grid">${Object.entries(LIVE_EVENTS).map(([k, d]) => `<label class="adm-field"><span>${d.icon} ${esc(k)}</span><input type="number" min="0" value="${lc.weights[k] ?? d.weight}" data-change="adm-set" data-path="events.weights.${k}"><input type="checkbox" ${lc.disabled.includes(k) ? '' : 'checked'} data-change="adm-toggle-ev" data-k="${k}" title="Dans la rotation"></label>`).join('')}</div></div>
      <div class="card"><h3>💎 Éclats</h3><div class="adm-grid">
        ${['ticketCost', 'freeTicketDays', 'detectionCap', 'heatPerDrop', 'heatDecayPerHour', 'heatFactor', 'overCapFactor', 'rotationBonus'].map((k) => num('shards.' + k, sc[k])).join('')}
        ${num('shardMultX.shardMult', s.admin?.shardMult ?? 1)}
        ${Object.keys(sc.dailyCap).map((k) => num('shards.dailyCap.' + k, sc.dailyCap[k], 1)).join('')}
        ${Object.entries(sc.sources).filter(([, v]) => v.chance < 1).map(([k, v]) => num(`shards.sources.${k}.chance`, v.chance)).join('')}
        ${num('shards.forbidden.cooldownHours', sc.forbidden.cooldownHours, 1)}${num('shards.forbidden.minPower', sc.forbidden.minPower, 1)}</div>
        <h3>🎡 Roue</h3><div class="adm-grid">${TIER_ORDER.map((t) => num('wheel.probs.' + t, wc.probs[t])).join('')}${PITY_ORDER.map((t) => num('wheel.pity.' + t, wc.pity[t], 1)).join('')}
        ${['jackpotShare', 'mythicCraft', 'legendaryCraft', 'legendaryDupe', 'mythicDupe', 'seasonDays'].map((k) => num('wheel.' + k, wc[k])).join('')}</div>
        <p class="small ${Math.abs(TIER_ORDER.reduce((a, t) => a + wc.probs[t], 0) - 1) > 0.001 ? 'bad' : 'muted'}">Somme des probabilités : ${(TIER_ORDER.reduce((a, t) => a + wc.probs[t], 0) * 100).toFixed(2)} %</p></div></div>
    <div class="card"><h3>📈 Suivi de l’économie (14 jours)</h3><table class="table"><thead><tr><th>Jour</th><th>Générés</th><th>Dépensés</th><th>Tickets</th><th>Tours</th><th>Légendaires</th><th>Mythiques</th><th>Jackpots</th><th>Par source</th></tr></thead><tbody>
      ${rows.map((r) => `<tr><td>${new Date(r.day * 86400000).toLocaleDateString('fr-FR')}</td><td class="num">${r.gen}</td><td class="num">${r.spent}</td><td class="num">${r.tickets}</td><td class="num">${r.spins}</td><td class="num">${r.legendary}</td><td class="num">${r.mythic}</td><td class="num">${r.jackpot}</td><td class="small">${Object.entries(r.bySource || {}).map(([k, v]) => `${esc(k)} ${v}`).join(', ')}</td></tr>`).join('')}
      <tr><td><b>Total</b></td><td class="num">${tot.gen}</td><td class="num">${tot.spent}</td><td class="num">${tot.tickets}</td><td class="num">${tot.spins}</td><td class="num">${tot.legendary}</td><td class="num">${tot.mythic}</td><td class="num">${tot.jackpot}</td><td></td></tr></tbody></table>
      <p class="small">Possédés : 💎 ${shardState(s).count} · 🎟️ ${shardState(s).tickets} · tours ${shardState(s).spins} · jackpots ${shardState(s).jackpots}</p>
      <h4>Projection par profil</h4><table class="table"><thead><tr><th>Profil</th><th>💎/jour</th><th>Jours/ticket</th><th>Délai moyen 1er légendaire+</th><th>Légendaire garanti</th><th>Mythique garanti</th></tr></thead><tbody>
      ${['casual', 'active', 'hardcore'].map((k) => { const p = profileProjection(s, k); return `<tr><td>${esc(p.name)}</td><td class="num">${p.perDay.toFixed(2)}</td><td class="num">${p.ticketDays.toFixed(1)}</td><td class="num">${Math.round(p.expectedLegendaryDays)} j</td><td class="num">${Math.round(p.legendaryDays)} j</td><td class="num">${Math.round(p.mythicDays)} j</td></tr>`; }).join('')}</tbody></table></div>`;
  },
  actions: {
    'adm-set': (app, el) => {
      const v = +el.value;
      if (!Number.isFinite(v)) return;
      const path = el.dataset.path;
      if (path.startsWith('shardMultX.')) app.state.admin.shardMult = v;
      else setPath(app.state.admin, path, v);
      app.save(); app.render();
    },
    'adm-toggle-ev': (app, el) => {
      const ev = (app.state.admin.events ||= {});
      const dis = new Set(ev.disabled || []);
      if (el.checked) dis.delete(el.dataset.k); else dis.add(el.dataset.k);
      ev.disabled = [...dis];
      app.save(); app.render();
    },
    'adm-start': (app) => app.act(() => adminStart(app.state, document.getElementById('adm-ev').value), 'Événement lancé'),
    'adm-end': (app) => app.act(() => adminEnd(app.state), 'Événement terminé'),
    'adm-reroll': (app) => app.act(() => adminReroll(app.state), 'Calendrier régénéré'),
    'adm-cur': (app) => app.act(() => adminCurrency(app.state, 1000), '+1 000'),
    'adm-surprise': (app, el) => app.act(() => (startSurprise(app.state, el.dataset.k) ? { ok: true } : { ok: false, reason: 'Impossible maintenant' }), 'Surprise déclenchée'),
    'adm-shards': (app, el) => app.act(() => { addShards(app.state, +el.dataset.n, 'admin', Date.now(), 'outil d’administration'); return { ok: true }; }),
    'adm-ticket': (app) => app.act(() => { shardState(app.state).tickets++; return { ok: true }; }, '+1 ticket'),
    'adm-reset': (app) => app.act(() => { const dev = app.state.admin.dev; app.state.admin = { dev }; return { ok: true }; }, 'Réglages par défaut rétablis'),
  },
};
