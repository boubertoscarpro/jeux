// v22b « Boutique de la Couronne » : objets de base payés en or, très chers, prix croissants dans la journée.
import { GOLD_SHOP, GOLD_SHOP_CATS, GOLD_SHOP_MIN_TH, GOLD_SHOP_RISE } from '../../data/goldShop.js';
import { SPEEDUPS } from '../../data/speedups.js';
import { fmt } from '../../core/util.js';
import { thLevel } from '../../systems/city.js';
import { goldShopState, goldShopCheck, goldPrice, goldShopName, buyGoldItem } from '../../systems/goldShop.js';
import { speedupCount } from '../../systems/speedups.js';
import { resIcon } from '../icons.js';
import { sigilByKey } from '../sigils.js';
import { esc } from '../components.js';

const owned = (s, it) => (it.kind === 'speedup' ? speedupCount(s, it.key) : it.kind === 'consumable' ? Math.floor(s.inventory.consumables?.[it.key] || 0) : null);

export default {
  id: 'goldshop', title: 'Boutique de la Couronne', icon: '🛒',
  locked: (app) => (thLevel(app.state) < GOLD_SHOP_MIN_TH ? `La Boutique de la Couronne ouvre à l’hôtel de ville niveau ${GOLD_SHOP_MIN_TH}.` : null),
  render(app) {
    const s = app.state, G = goldShopState(s);
    const byCat = {};
    for (const [id, it] of Object.entries(GOLD_SHOP)) (byCat[it.cat] ||= []).push([id, it]);
    return `<div class="card gshop-head"><h2>Boutique de la Couronne</h2>
      <p class="small">L’intendant royal vend quelques objets de base contre des <b>pièces d’or</b>. Ils sont <b>très chers</b> : le prix suit le niveau de votre hôtel de ville et monte de ${Math.round((GOLD_SHOP_RISE - 1) * 100)} % à chaque achat du même article dans la journée. Quantités limitées, renouvelées à minuit. Seulement de l’or gagné en jeu.</p>
      <div class="gshop-purse"><span class="res-chip">${resIcon('gold', 18)} <b>${fmt(s.resources.gold || 0)}</b> or</span>${G.spent ? `<span class="small muted">Dépensé ici depuis le début : ${fmt(G.spent)} or</span>` : ''}</div></div>
      ${Object.entries(byCat).map(([cat, list]) => `<div class="card"><h3>${esc(GOLD_SHOP_CATS[cat])}</h3><div class="gshop-grid">${list.map(([id, it]) => {
        const c = goldShopCheck(s, id);
        const price = goldPrice(s, id);
        const left = it.limit - (G.bought[id] || 0);
        const have = owned(s, it);
        return `<article class="gshop-item ${c.ok ? 'avail' : ''} ${left <= 0 ? 'out' : ''}">
          <div class="gshop-ico" aria-hidden="true">${sigilByKey(it.kind === 'speedup' ? 'hourglass' : it.kind === 'consumable' ? 'flask' : 'swords')}${it.kind === 'speedup' ? `<b>${esc(SPEEDUPS[it.key].short)}</b>` : ''}</div>
          <div class="gshop-txt"><b>${esc(goldShopName(id))}</b><div class="small">${esc(it.desc)}</div>${have !== null ? `<div class="small muted">En réserve : ${have}</div>` : ''}</div>
          <div class="gshop-buy"><div class="gshop-price">${resIcon('gold', 16)} <b>${fmt(price)}</b></div><div class="small muted">${Math.max(0, left)}/${it.limit} aujourd’hui</div>
          ${c.ok ? `<button class="btn primary small" data-action="gshop-buy" data-id="${id}">Acheter</button>` : `<div class="req small">${esc(c.reason)}</div>`}</div></article>`;
      }).join('')}</div></div>`).join('')}`;
  },
  actions: { 'gshop-buy': (app, el) => app.act(() => buyGoldItem(app.state, el.dataset.id), (r) => `Acheté : ${r.text} (${fmt(r.price)} or)`) },
};
