import { LIVE_EVENTS } from '../../data/liveEvents.js';
import { fmt } from '../../core/util.js';
import { liveState, shopItems, buyShopItem, buyMystery, fairOffers, buyFair, activeSurprises, liveCfg } from '../../systems/liveEvents.js';
import { esc, countdown, resChips } from '../components.js';
import { giveText } from './events.js';

function fairCard(app) {
  const offers = fairOffers(app.state);
  if (!offers) return '';
  const sp = activeSurprises(app.state).find((x) => x.key === 'fair');
  return `<div class="card ev-fair"><h3>🎪 La Grande Foire <span class="muted small">se termine dans ${countdown(sp.end)}</span></h3>
    <p class="small muted">Taxe du marché réduite de moitié. Chaque échange n’est possible qu’une fois par foire.</p>
    <div class="shop-grid">${offers.map((o) => `<div class="shop-item ${o.used ? 'sold' : ''}"><div class="shop-name">${esc(o.label)}</div><div class="small">${resChips(o.pay)} → ${o.get.chest ? '🧰 coffre rare' : resChips(o.get)}</div>
      <button class="mini ${o.used ? '' : 'good'}" data-action="fair-buy" data-id="${o.id}" ${o.used ? 'disabled' : ''}>${o.used ? 'Échangé' : 'Échanger'}</button></div>`).join('')}</div></div>`;
}

export default {
  id: 'eventShop', title: 'Boutique', icon: '🛒',
  locked: (app) => (!app.state.live?.current && !fairOffers(app.state) ? 'La boutique ouvre pendant un événement (ou une Grande Foire).' : null),
  render(app) {
    const s = app.state;
    const cur = liveState(s).current;
    if (!cur) return fairCard(app);
    const def = LIVE_EVENTS[cur.key];
    const items = shopItems(s);
    const card = (i) => {
      const sold = (i.left !== null && i.left <= 0) || (i.globalLeft !== null && i.globalLeft <= 0) || (i.owned && i.exclusive);
      return `<div class="shop-item ${i.exclusive ? 'exclusive' : ''} ${sold ? 'sold' : ''}">
        <div class="shop-icon">${i.icon}</div><div class="shop-name">${esc(i.label)}</div>
        <div class="small">${i.exclusive ? '<span class="tag-ex">Exclusif</span> ' : ''}${i.rotating ? '<span class="tag-rot">Rotation</span> ' : ''}${i.left !== null ? `Stock : ${i.left}/${i.stock}` : ''}${i.globalLeft !== null ? ` · <b class="${i.globalLeft <= 2 ? 'bad' : ''}" title="Stock partagé avec les seigneurs rivaux IA">Marchand : ${i.globalLeft}/${i.global}</b>` : ''}${i.owned ? ' · <span class="ok">possédé</span>' : ''}</div>
        <button class="btn small ${cur.wallet >= i.price && !sold ? 'primary' : ''}" data-action="shop-buy" data-id="${i.id}" ${sold ? 'disabled' : ''}>${def.currency.icon} ${fmt(i.price)}</button></div>`;
    };
    const myst = cur.mystery;
    const midnight = (Math.floor(Date.now() / 86400000) + 1) * 86400000;
    return `<div class="card" style="--evc:${def.color}"><h2>🛒 ${esc(def.shop.merchant)}</h2>
      <p class="small">Vous avez <b>${def.currency.icon} ${fmt(cur.wallet)} ${esc(def.currency.name)}</b> — boutique ouverte encore ${countdown(cur.end)}. La monnaie restante sera convertie à la fin : dépensez-la !</p>
      <p class="small muted">Les objets « Rotation » changent à chaque retour de l’événement. Le stock « Marchand » est partagé avec les seigneurs rivaux (IA, simulés localement) qui achètent eux aussi au fil des heures : ne tardez pas.</p>
      <div class="shop-grid">${items.map(card).join('')}</div></div>
      ${myst ? `<div class="card ev-mystery"><h3>🎩 Marchand mystère <span class="muted small">repart dans ${countdown(midnight)}</span></h3><p class="small muted">Chaque jour, 3 à 5 objets différents. Parfois, un objet rare…</p>
        <div class="shop-grid">${myst.items.map((it, idx) => `<div class="shop-item ${it.rare ? 'exclusive' : ''} ${it.bought ? 'sold' : ''}"><div class="shop-icon">${it.icon}</div><div class="shop-name">${esc(it.label)}</div>${it.rare ? '<div class="small"><span class="tag-ex">Rare</span></div>' : ''}
          <button class="btn small" data-action="myst-buy" data-i="${idx}" ${it.bought ? 'disabled' : ''}>${it.bought ? 'Acheté' : `${def.currency.icon} ${fmt(Math.round(it.price * liveCfg(s).priceMult))}`}</button></div>`).join('')}</div></div>` : ''}
      ${fairCard(app)}`;
  },
  actions: {
    'shop-buy': (app, el) => app.act(() => buyShopItem(app.state, el.dataset.id), (r) => `🛒 ${r.text}`),
    'myst-buy': (app, el) => app.act(() => buyMystery(app.state, +el.dataset.i), (r) => `🎩 ${r.text}`),
    'fair-buy': (app, el) => app.act(() => buyFair(app.state, el.dataset.id), (r) => `🎪 ${r.text}`),
  },
};
void giveText;
