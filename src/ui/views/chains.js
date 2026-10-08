import { BUILDINGS } from '../../data/buildings.js';
import { RESOURCES } from '../../data/resources.js';
import { fmt } from '../../core/util.js';
import { computeMods } from '../../systems/modifiers.js';
import { netRates, buildingRates, recipeOf } from '../../systems/economy.js';
import { allBuildings } from '../../systems/city.js';
import { esc, resChips } from '../components.js';

// Chaînes affichées : étapes (ressources) et ateliers concernés
const CHAINS = [
  { name: 'Pain du soldat', steps: ['grain', 'flour', 'bread', 'rations'], shops: ['mill', 'bakery', 'quartermaster'], use: 'Rations : expéditions +15% de rendement ; pain : +15 moral au combat.' },
  { name: 'Acier & armes', steps: ['iron', 'steel', 'weapons'], extra: ['coal'], shops: ['charcoal', 'foundry', 'armory'], use: 'Les armes équipent les troupes d’élite (soldats lourds, chevaliers, arbalétriers, assassins).' },
  { name: 'Charpente & siège', steps: ['wood', 'planks', 'frames'], shops: ['carpentry'], use: 'La charpente construit béliers, catapultes, trébuchets et les grands paliers d’Intendance.' },
  { name: 'Cuir', steps: ['hides', 'leather'], shops: ['tannery'], use: 'Cavalerie, gants, bottes, armures légères.' },
  { name: 'Tissu', steps: ['wool', 'cloth'], shops: ['weaver'], use: 'Armures, espions, paliers d’Intendance.' },
];

function shopRow(app, b, mods) {
  const def = BUILDINGS[b.type];
  const r = buildingRates(app.state, b, mods);
  const rec = recipeOf(b);
  const status = b.paused ? '<span class="chip">⏸ En pause</span>' : b.damaged ? '<span class="chip chip-bad">🔥 Endommagé</span>' : b.capped ? '<span class="chip">✋ Sortie pleine (quota ou entrepôt)</span>' : b.starved ? '<span class="chip chip-bad">⚠ Manque d’intrants</span>' : '<span class="chip chip-buff">✔ Tourne</span>';
  return `<div class="shop-row"><div class="shop-name">${def.icon} <b>${esc(def.name)}</b> niv. ${b.level} ${status}</div>
    <div class="flow small">${resChips(Object.fromEntries(Object.entries(r.in).map(([k, v]) => [k, -v])), true)} <span class="arrow">➜</span> ${resChips(r.out, true)} <span class="muted">/h</span></div>
    <div class="row gap wrap small">
      ${def.recipes ? `<label>Recette <select data-change="c-recipe" data-id="${b.id}">${def.recipes.map((x, i) => `<option value="${i}" ${(b.recipe || 0) === i ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></label>` : `<span class="muted">${esc(rec?.name || '')}</span>`}
      <label title="La chaîne s’arrête quand le stock de sortie atteint ce quota (0 = aucun)">Quota <input class="qty" type="number" min="0" value="${b.quota || 0}" data-change="c-quota" data-id="${b.id}"></label>
      <label title="La chaîne ne puise pas dans les intrants sous ce seuil (0 = aucun)">Réserve <input class="qty" type="number" min="0" value="${b.reserve || 0}" data-change="c-reserve" data-id="${b.id}"></label>
      <button class="mini ${b.paused ? 'good' : 'ghost'}" data-action="c-pause" data-id="${b.id}">${b.paused ? '▶ Relancer' : '⏸ Pause'}</button>
    </div></div>`;
}

export default {
  id: 'chains', title: 'Chaînes', icon: '🏭',
  badge: (app) => allBuildings(app.state).filter((b) => b.starved && !b.paused).length,
  render(app) {
    const s = app.state;
    const mods = computeMods(s);
    const net = netRates(s, mods);
    const shops = allBuildings(s).filter((b) => b.level > 0 && recipeOf(b));
    return `<div class="card"><h2>🏭 Chaînes de production</h2>
      <p class="muted small">Chaque atelier transforme automatiquement ses intrants. Configurez la <b>recette</b>, un <b>quota</b> (stop quand le stock de sortie est atteint) et une <b>réserve</b> (ne jamais descendre l’intrant sous ce seuil) pour que vos chaînes ne se cannibalisent pas. Les Ordres du royaume peuvent aussi les mettre en pause.</p></div>
      ${CHAINS.map((c) => {
        const own = shops.filter((b) => c.shops.includes(b.type));
        return `<div class="card chain"><h3>${esc(c.name)}</h3>
          <div class="chain-steps">${[...(c.extra || []), ...c.steps].map((r, i, arr) => `<div class="chain-step"><div class="cs-icon">${RESOURCES[r].icon}</div><div class="small"><b>${esc(RESOURCES[r].name)}</b></div><div class="small">${fmt(s.resources[r] || 0)}</div><div class="small ${(net[r] || 0) < 0 ? 'bad' : 'ok'}">${(net[r] || 0) >= 0 ? '+' : ''}${fmt(net[r] || 0)}/h</div></div>${i < arr.length - 1 && !(c.extra && i < c.extra.length) ? '<div class="cs-arrow">➜</div>' : i < arr.length - 1 ? '<div class="cs-arrow">+</div>' : ''}`).join('')}</div>
          <div class="muted small">${esc(c.use)}</div>
          ${own.map((b) => shopRow(app, b, mods)).join('') || `<div class="req small">Aucun atelier : construisez ${c.shops.map((t) => BUILDINGS[t].icon + ' ' + BUILDINGS[t].name).join(', ')}.</div>`}
        </div>`;
      }).join('')}`;
  },
  actions: {
    'c-recipe': (app, el) => { const b = app.state.city.buildings[el.dataset.id]; b.recipe = +el.value; app.render(); app.save(); },
    'c-quota': (app, el) => { const b = app.state.city.buildings[el.dataset.id]; b.quota = Math.max(0, +el.value || 0); app.render(); },
    'c-reserve': (app, el) => { const b = app.state.city.buildings[el.dataset.id]; b.reserve = Math.max(0, +el.value || 0); app.render(); },
    'c-pause': (app, el) => { const b = app.state.city.buildings[el.dataset.id]; b.paused = !b.paused; app.render(); },
  },
};
