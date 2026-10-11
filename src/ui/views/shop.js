import { resIcon } from '../icons.js';
// Comptoir du Joaillier : boutique en ressources rares.
import { SHOP_ITEMS, SHOP_CATS, SHOP_MIN_TH } from '../../data/shop.js';
import { RESOURCES } from '../../data/resources.js';
import { fmt } from '../../core/util.js';
import { thLevel } from '../../systems/city.js';
import { shopState, shopCheck, buyShopItem } from '../../systems/shop.js';
import { esc, costList } from '../components.js';

const RARE = ['gems', 'crystals', 'silver', 'rareOre', 'ancientWood'];

export default {
  id: 'shop', title: 'Joaillier', icon: '💎',
  locked: (app) => (thLevel(app.state) < SHOP_MIN_TH ? `Le Comptoir du Joaillier ouvre à l’hôtel de ville niveau ${SHOP_MIN_TH}.` : null),
  render(app) {
    const s = app.state, S = shopState(s);
    const byCat = {};
    for (const [id, it] of Object.entries(SHOP_ITEMS)) (byCat[it.cat] ||= []).push([id, it]);
    return `<div class="card"><h2>💎 Comptoir du Joaillier</h2>
      <p class="small muted">Échangez vos ressources rares (trouvées dans les donjons, les grottes, les avant-postes, les contrats et les événements) contre des équipements, des faveurs et des raretés. Aucun argent réel : uniquement des ressources gagnées en jeu. Les quantités sont limitées et se renouvellent chaque jour à minuit.</p>
      <div class="shop-wallet">${RARE.map((r) => `<span class="res-chip" title="${esc(RESOURCES[r].uses)}">${resIcon(r, 16, RESOURCES[r]?.icon)} ${esc(RESOURCES[r].name)} <b>${fmt(s.resources[r] || 0)}</b></span>`).join('')}</div></div>
      ${Object.entries(byCat).map(([cat, list]) => `<div class="card"><h3>${SHOP_CATS[cat]}</h3><div class="shop-grid">${list.map(([id, it]) => {
        const c = shopCheck(s, id);
        const left = it.limit - (S.bought[id] || 0);
        return `<div class="shop-item ${c.ok ? 'avail' : ''}"><div class="shop-head"><span class="shop-icon">${it.icon}</span><div><b>${esc(it.name)}</b><div class="small muted">${esc(it.desc)}</div></div></div>
          <div class="row between wrap">${costList(it.cost, s)}<span class="small muted">${left}/${it.limit} aujourd’hui</span></div>
          ${c.ok ? `<button class="btn primary small" data-action="shop-buy" data-id="${id}">Acheter</button>` : `<div class="req small">${esc(c.reason)}${c.missing ? ' : ' + Object.entries(c.missing).map(([r, v]) => `${fmt(v)} ${resIcon(r, 16, RESOURCES[r]?.icon)}`).join(' ') : ''}</div>`}</div>`;
      }).join('')}</div></div>`).join('')}`;
  },
  actions: { 'shop-buy': (app, el) => app.act(() => buyShopItem(app.state, el.dataset.id), (r) => `💎 Acheté : ${r.text}`) },
};
