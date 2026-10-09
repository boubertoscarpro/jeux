import { SHARD_SHOP, WHEEL_REWARDS, FEATS } from '../../data/shards.js';
import { fmt } from '../../core/util.js';
import { shardCfg, wheelCfg } from '../../systems/config.js';
import { shardState, sourceMultiplier, weeklyFavored, detectionBonus, spendShards, expectedDaily, PROFILES, dayKey } from '../../systems/shards.js';
import { esc, countdown } from '../components.js';

// Projection d'un profil : Éclats/jour, temps par ticket, temps jusqu'aux garanties
export function profileProjection(state, key) {
  const e = expectedDaily(state, PROFILES[key]);
  const c = shardCfg(state);
  const w = wheelCfg(state);
  const perDay = e.total;
  const ticketDays = c.ticketCost / perDay;
  return { name: PROFILES[key].name, perDay, ticketDays, legendaryDays: ticketDays * w.pity.legendary, mythicDays: ticketDays * w.pity.mythic, expectedLegendaryDays: ticketDays / (w.probs.legendary + w.probs.mythic), e };
}

export function ledgerRows(state, days = 7, now = Date.now()) {
  const L = shardState(state).ledger;
  const today = dayKey(now);
  const rows = [];
  for (let d = today; d > today - days; d--) rows.push({ day: d, ...(L[d] || { gen: 0, spent: 0, tickets: 0, spins: 0, legendary: 0, mythic: 0, jackpot: 0, bySource: {} }) });
  return rows;
}

export default {
  id: 'shards', title: 'Éclats Anciens', icon: '💎',
  render(app) {
    const s = app.state;
    const sh = shardState(s);
    const c = shardCfg(s);
    const fav = weeklyFavored(s);
    const now = Date.now();
    const fb = c.forbidden;
    const fbReady = (sh.forbiddenAt || 0) + fb.cooldownHours * 3600000;
    return `<div class="card"><h2>💎 Éclats Anciens</h2>
      <p class="small">Fragments d’une civilisation disparue. Rares, prestigieux, <b>jamais vendus contre de l’argent réel</b> : ils se méritent par l’exploration, le combat et l’audace. Vous en possédez <b>💎 ${fmt(sh.count)}</b> et <b>🎟️ ${sh.tickets}</b> ticket(s).</p>
      <div class="shop-grid">${SHARD_SHOP.map((o) => {
        const cost = o.id === 'ticket' ? c.ticketCost : o.cost;
        return `<div class="shop-item"><div class="shop-icon">${o.icon}</div><div class="shop-name">${esc(o.label)}</div><div class="small muted">${esc(o.desc)}</div>
          ${o.id === 'guaranteed' ? `<select id="sh-choice">${WHEEL_REWARDS.legendary.map((r) => `<option value="${r.id}">${r.icon} ${esc(r.label)}</option>`).join('')}</select>` : ''}
          <button class="btn small ${sh.count >= cost ? 'primary' : ''}" data-action="sh-spend" data-id="${o.id}" ${sh.count < cost ? 'disabled' : ''}>💎 ${cost}</button></div>`;
      }).join('')}</div></div>
    <div class="cols-2"><div class="card"><h3>🧭 Sources</h3>
      <p class="small muted">Plus une source donne, moins elle donne ensuite (la « chaleur » retombe en quelques heures). Au-delà du plafond quotidien, les chances chutent fortement. Chaque semaine, une source est favorisée (×${c.rotationBonus}).</p>
      <table class="table"><thead><tr><th>Source</th><th>Chance actuelle</th><th>Aujourd’hui</th></tr></thead><tbody>
      ${Object.entries(c.sources).map(([k, src]) => { const d = sh.daily[k]; const n = d && d.day === dayKey(now) ? d.n : 0; const m = sourceMultiplier(s, k, now); return `<tr title="${esc(src.desc)}"><td>${esc(src.name)}${fav === k ? ' <span class="tag-rot">Favorisée</span>' : ''}<div class="muted small">${esc(src.desc)}</div></td><td class="num">${['forbidden', 'event', 'feat', 'free'].includes(k) ? '—' : `×${m.toFixed(2)}`}</td><td class="num">${n}/${c.dailyCap[k] ?? '∞'}</td></tr>`; }).join('')}
      </tbody></table>
      <p class="small">Bonus de détection : <b>+${Math.round(detectionBonus(s, now) * 100)} %</b> (héros explorateur, observatoire, artefacts — plafonné à +${Math.round(c.detectionCap * 100)} %).</p></div>
      <div class="card"><h3>⛔ Expédition interdite</h3>
        <p class="small">Une expédition de ${fb.hours} h au-delà des frontières connues. Escorte d’une puissance ≥ ${fmt(fb.minPower)} requise. Issues : ${Math.round(fb.outcomes.fail * 100)} % échec (pertes d’escorte et de vivres), ${Math.round(fb.outcomes.partial * 100)} % ${fb.partial[0]}–${fb.partial[1]} Éclats, ${Math.round(fb.outcomes.success * 100)} % ${fb.success[0]}–${fb.success[1]} Éclats (+ chance d’artefact).</p>
        <p class="small">${now >= fbReady ? '<span class="ok">Disponible.</span>' : `Prochaine tentative dans ${countdown(fbReady)}.`} Créez une équipe « Expédition interdite » dans Production → Expéditions (palier d’automatisation 3).</p>
        <button class="mini" data-action="nav" data-view="expeditions">⛏️ Aller aux expéditions</button>
        <h3>🏅 Exploits (une seule fois)</h3>${FEATS.map((f) => `<div class="small ${sh.feats[f.id] ? 'ok' : ''}">${sh.feats[f.id] ? '✔' : '◻'} ${esc(f.label)} — 💎 ${f.shards}</div>`).join('')}
      </div></div>
    <div class="cols-2"><div class="card"><h3>📊 Vos 7 derniers jours</h3><table class="table"><thead><tr><th>Jour</th><th>Gagnés</th><th>Dépensés</th><th>Tickets</th><th>Tours</th></tr></thead><tbody>
      ${ledgerRows(s).map((r) => `<tr><td>${new Date(r.day * 86400000).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric' })}</td><td class="num">${r.gen}</td><td class="num">${r.spent}</td><td class="num">${r.tickets}</td><td class="num">${r.spins}</td></tr>`).join('')}</tbody></table></div>
      <div class="card"><h3>⚖️ Rythmes attendus</h3><p class="small muted">Estimation à partir de la configuration actuelle (voir docs/ECONOMY.md).</p>
        <table class="table"><thead><tr><th>Profil</th><th>💎/jour</th><th>Jours/ticket</th><th>Légendaire garanti</th><th>Mythique garanti</th></tr></thead><tbody>
        ${Object.keys(PROFILES).map((k) => { const p = profileProjection(s, k); return `<tr><td>${esc(p.name)}</td><td class="num">${p.perDay.toFixed(2)}</td><td class="num">${p.ticketDays.toFixed(1)}</td><td class="num">${Math.round(p.legendaryDays)} j</td><td class="num">${Math.round(p.mythicDays)} j</td></tr>`; }).join('')}</tbody></table></div></div>`;
  },
  actions: {
    'sh-spend': (app, el) => app.act(() => spendShards(app.state, el.dataset.id, el.dataset.id === 'guaranteed' ? document.getElementById('sh-choice').value : null), (r) => `💎 ${r.text}`),
  },
};
