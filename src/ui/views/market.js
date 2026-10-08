import { RESOURCES, TRADABLE } from '../../data/resources.js';
import { WORLD_EVENTS } from '../../data/events.js';
import { fmt } from '../../core/util.js';
import { computeMods } from '../../systems/modifiers.js';
import { levelOf } from '../../systems/city.js';
import { quote, sell, buy, marketFee, caravanSlots, cancelRoute, buyFromMerchant } from '../../systems/market.js';
import { esc, costList, itemCard, countdown, progress } from '../components.js';

function spark(hist, base) {
  if (!hist || hist.length < 2) return '';
  const w = 90, h = 26;
  const min = Math.min(...hist, base * 0.8), max = Math.max(...hist, base * 1.2);
  const pts = hist.map((v, i) => `${(i / (hist.length - 1)) * w},${h - ((v - min) / (max - min || 1)) * h}`).join(' ');
  const by = h - ((base - min) / (max - min || 1)) * h;
  const up = hist[hist.length - 1] >= hist[0];
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}"><line x1="0" x2="${w}" y1="${by}" y2="${by}" class="spark-base"/><polyline points="${pts}" class="${up ? 'up' : 'down'}"/></svg>`;
}

export default {
  id: 'market', title: 'Marché', icon: '⚖️',
  render(app) {
    const s = app.state;
    const mods = computeMods(s);
    const lvl = levelOf(s, 'market');
    const qty = Math.max(1, +(app.ui.tradeQty || 100));
    const now = Date.now();
    const evs = s.events.filter((e) => e.end > now && WORLD_EVENTS[e.key].market);
    const mer = s.merchant && s.merchant.until > now ? s.merchant : null;
    return `<div class="card"><h2>⚖️ Marché ${lvl ? `<span class="muted small">niv. ${lvl}</span>` : ''}</h2>
      ${!lvl ? '<p class="req">Construisez un Marché (Hôtel de ville niv. 2) pour commercer.</p>' : ''}
      <p class="muted small">Les prix évoluent selon l’offre et la demande : vos ventes font baisser le prix, vos achats le font monter. Les événements (guerre, hiver…) bousculent les cours. Taxe : <b>${Math.round(marketFee(mods) * 100)}%</b>.</p>
      ${evs.length ? `<div class="chips">${evs.map((e) => `<span class="chip chip-event">${WORLD_EVENTS[e.key].icon} ${esc(WORLD_EVENTS[e.key].name)} : ${Object.entries(WORLD_EVENTS[e.key].market).map(([r, k]) => `${RESOURCES[r].icon} ${k > 1 ? '+' : ''}${Math.round((k - 1) * 100)}%`).join(' ')}</span>`).join('')}</div>` : ''}
      <div class="form-row"><label>Quantité</label><input type="number" id="trade-qty" min="1" value="${qty}" data-change="qty"><div class="row gap">${[100, 500, 1000, 5000].map((q) => `<button class="mini ghost" data-action="set-qty" data-q="${q}">${q}</button>`).join('')}</div></div>
      <div class="table-wrap"><table class="market"><thead><tr><th>Ressource</th><th>Stock</th><th>Cours</th><th>Tendance</th><th>Vendre ×${fmt(qty)}</th><th>Acheter ×${fmt(qty)}</th></tr></thead><tbody>
      ${TRADABLE.map((r) => {
        const p = s.market.prices[r];
        const base = RESOURCES[r].price;
        const ratio = p / base;
        const sq = quote(s, r, qty, -1, mods), bq = quote(s, r, qty, 1, mods);
        return `<tr><td>${RESOURCES[r].icon} ${esc(RESOURCES[r].name)}</td><td class="num">${fmt(s.resources[r] || 0)}</td>
          <td class="num"><b>${p.toFixed(2)}</b> <span class="${ratio > 1.05 ? 'up' : ratio < 0.95 ? 'down' : 'muted'} small">${ratio > 1 ? '+' : ''}${Math.round((ratio - 1) * 100)}%</span></td>
          <td>${spark(s.market.history[r], base)}</td>
          <td><button class="mini" data-action="sell" data-r="${r}" ${!lvl || (s.resources[r] || 0) < qty ? 'disabled' : ''}>+${fmt(sq.total)} 🪙</button></td>
          <td><button class="mini" data-action="buy" data-r="${r}" ${!lvl || s.resources.gold < bq.total ? 'disabled' : ''}>−${fmt(bq.total)} 🪙</button></td></tr>`;
      }).join('')}</tbody></table></div></div>

      <div class="card"><h2>🐪 Caravanes & routes commerciales</h2>
        <p class="muted small">Les cités libres paient plus cher (★ +60% pour les ressources demandées). Sélectionnez une cité 🏘️ sur la Carte pour y envoyer une caravane. Caravanes : ${s.caravans.length}/${caravanSlots(mods)}.</p>
        ${s.caravans.map((c) => `<div class="q-row"><div class="q-top"><span>🐪 ${esc(c.town)} — ${fmt(c.qty)} ${RESOURCES[c.res].icon} → ${fmt(c.gold)} 🪙 ${c.repeat ? '🔁' : ''}</span>${countdown(c.end)}${c.repeat ? `<button class="mini ghost" data-action="stop-route" data-id="${c.id}">Arrêter la route</button>` : ''}</div>${progress(c.start, c.end)}</div>`).join('') || '<div class="muted small">Aucune caravane en route.</div>'}
        <div class="town-list">${Object.values(s.world.pois).filter((p) => p.type === 'town' && s.world.revealed[p.y * s.world.size + p.x]).map((t) => `<button class="btn ghost small" data-action="goto-town" data-x="${t.x}" data-y="${t.y}">🏘️ ${esc(t.name)} — ★ ${t.wants.map((r) => RESOURCES[r].icon).join('')}</button>`).join('') || '<div class="muted small">Explorez pour découvrir des cités libres.</div>'}</div>
      </div>

      ${mer ? `<div class="card merchant"><h2>🧙 Marchand mystérieux <span class="muted small">part dans ${countdown(mer.until)}</span></h2><div class="item-grid">${mer.offers.map((o, i) => `<div class="item-wrap">${o.item ? itemCard(o.item) : `<div class="item-card"><b>${RESOURCES[o.res].icon} ${o.qty} ${esc(RESOURCES[o.res].name)}</b></div>`}${costList(o.cost, s)}<button class="mini primary" data-action="merchant" data-i="${i}" ${o.sold ? 'disabled' : ''}>${o.sold ? 'Vendu' : 'Acheter'}</button></div>`).join('')}</div></div>` : ''}`;
  },
  actions: {
    qty: (app, el) => { app.ui.tradeQty = Math.max(1, +el.value || 1); app.render(); },
    'set-qty': (app, el) => { app.ui.tradeQty = +el.dataset.q; const i = document.getElementById('trade-qty'); if (i) i.value = el.dataset.q; app.render(); },
    sell: (app, el) => app.act(() => sell(app.state, el.dataset.r, app.ui.tradeQty || 100), (r) => `Vente : +${fmt(r.gold)} or`),
    buy: (app, el) => app.act(() => buy(app.state, el.dataset.r, app.ui.tradeQty || 100), (r) => `Achat : −${fmt(r.gold)} or`),
    'stop-route': (app, el) => { cancelRoute(app.state, el.dataset.id); app.render(); },
    'goto-town': (app, el) => { const x = +el.dataset.x, y = +el.dataset.y; app.ui.worldSel = { x, y }; app.ui.cam = { x: x + 0.5, y: y + 0.5, zoom: app.ui.cam?.zoom || 1 }; app.go('world'); },
    merchant: (app, el) => app.act(() => buyFromMerchant(app.state, +el.dataset.i), 'Marché conclu !'),
  },
};
