import { SLOTS, SLOT_ORDER, CATALYSTS, CONSUMABLES, CRAFT_RECIPES } from '../../data/items.js';
import { RARITIES, RARITY_ORDER } from '../../data/heroes.js';
import { RESOURCES, RES_ORDER } from '../../data/resources.js';
import { fmt, fmtTime } from '../../core/util.js';
import { computeMods } from '../../systems/modifiers.js';
import { levelOf } from '../../systems/city.js';
import { startCraft, craftCost, craftQuality, startBrew, usePotion, upgradeItem, salvageItem, toggleLock } from '../../systems/crafting.js';
import { upgradeCost, salvageYield, MAX_PLUS, rarityOdds, itemScore } from '../../systems/items.js';
import { esc, costList, resChips, itemCard, empty, rarityTag } from '../components.js';

function itemDetail(app, it, mods) {
  const s = app.state;
  const owner = s.heroes.find((h) => h.id === it.equippedBy);
  const maxed = it.plus >= MAX_PLUS[it.rarity];
  return `<div class="card-sub">${itemCard(it)}
    <div class="small">${owner ? `Porté par <b>${esc(owner.name)}</b>` : 'Non équipé'} · amélioration +${it.plus}/${MAX_PLUS[it.rarity]}</div>
    ${maxed ? '<div class="small ok">Amélioration maximale.</div>' : `<div class="panel-sub"><h4>Améliorer → +${it.plus + 1} (+10% à tous les affixes)</h4>${costList(upgradeCost(it, -(mods['upgrade.cost'] || 0)), s)} <button class="mini primary" data-action="upgrade-item" data-id="${it.id}">Améliorer</button></div>`}
    <div class="panel-sub"><h4>Recycler</h4>${resChips(salvageYield(it, mods['salvage.bonus'] || 0))} <button class="mini ghost danger" data-action="salvage" data-id="${it.id}" ${it.equippedBy || it.locked ? 'disabled' : ''}>Recycler</button>
      <button class="mini ghost" data-action="lock" data-id="${it.id}">${it.locked ? '🔓 Déverrouiller' : '🔒 Verrouiller'}</button></div>
    <button class="btn small" data-action="goto" data-view="heroes">Équiper un héros →</button></div>`;
}

export default {
  id: 'craft', title: 'Artisanat', icon: '⚒️',
  render(app) {
    const s = app.state;
    const mods = computeMods(s);
    const forge = levelOf(s, 'forge');
    const lab = levelOf(s, 'laboratory');
    const slot = app.ui.craftSlot || 'weapon';
    const cat = app.ui.catalyst || 'none';
    const odds = rarityOdds(craftQuality(s, cat, mods), CATALYSTS[cat].minRarity || 'common');
    const filt = app.ui.invFilter || '';
    const items = s.inventory.items.filter((i) => !filt || i.slot === filt).sort((a, b) => RARITY_ORDER.indexOf(b.rarity) - RARITY_ORDER.indexOf(a.rarity) || itemScore(b) - itemScore(a));
    const sel = s.inventory.items.find((i) => i.id === app.ui.itemSel);
    const forgeJob = s.queues.craft.find((q) => q.kind === 'item');
    const labJob = s.queues.craft.find((q) => q.kind === 'potion');
    return `<div class="craft-layout">
      <div class="card"><h2>🎒 Inventaire <span class="muted small">${s.inventory.items.length} objets</span></h2>
        <div class="tabs">${['', ...SLOT_ORDER].map((k) => `<button class="tab ${filt === k ? 'active' : ''}" data-action="inv-filter" data-slot="${k}">${k ? SLOTS[k].icon + ' ' + SLOTS[k].name : 'Tous'}</button>`).join('')}</div>
        <div class="inv-layout">
          <div class="item-grid">${items.map((it) => itemCard(it, { action: 'item-sel', selected: it.id === app.ui.itemSel })).join('') || empty('Aucun objet. Explorez, nettoyez des sites dangereux, ou forgez !')}</div>
          <div>${sel ? itemDetail(app, sel, mods) : '<div class="muted small">Sélectionnez un objet.</div>'}</div>
        </div></div>

      <div class="cols-2">
        <div class="card"><h2>⚒️ Forge ${forge ? `<span class="muted small">niv. ${forge} · objets niv. ${1 + forge * 2}</span>` : ''}</h2>
          ${!forge ? '<p class="muted">Construisez une Forge (Hôtel de ville niv. 3) pour fabriquer de l’équipement.</p>' : `
          <div class="tabs">${SLOT_ORDER.map((k) => `<button class="tab ${slot === k ? 'active' : ''}" data-action="craft-slot" data-slot="${k}">${SLOTS[k].icon} ${SLOTS[k].name}</button>`).join('')}</div>
          <div class="form-row"><label>Catalyseur</label><select data-change="catalyst" id="catalyst">${Object.entries(CATALYSTS).map(([k, c]) => `<option value="${k}" ${cat === k ? 'selected' : ''}>${esc(c.name)}${c.desc ? ' — ' + esc(c.desc) : ''}</option>`).join('')}</select></div>
          <div class="panel-sub"><h4>Coût</h4>${costList(craftCost(slot, cat), s)} <span class="muted small">⏱ ${fmtTime((CRAFT_RECIPES[slot].time * 1000) / (1 + (mods['craft.speed'] || 0)))}</span></div>
          <div class="panel-sub"><h4>Chances de rareté</h4><div class="odds">${RARITY_ORDER.map((r) => `<div><span style="color:${RARITIES[r].color}">${RARITIES[r].name}</span><b>${(odds[r] * 100).toFixed(1)}%</b></div>`).join('')}</div>
            <div class="muted small">Qualité : niveau de forge, héros intendant de la Forge (Forgeron ★), technologies d’Artisanat, catalyseur.</div></div>
          ${forgeJob ? '<div class="req">La forge est occupée.</div>' : `<button class="btn primary" data-action="craft">Forger</button>`}`}
        </div>
        <div class="card"><h2>⚗️ Laboratoire ${lab ? `<span class="muted small">niv. ${lab}</span>` : ''}</h2>
          ${!lab ? '<p class="muted">Construisez un Laboratoire (Hôtel de ville niv. 4) pour distiller des potions à partir d’herbes.</p>' : ''}
          <div class="potion-list">${Object.entries(CONSUMABLES).map(([k, c]) => `<div class="potion ${lab >= c.lab ? '' : 'locked'}">
            <div><span class="p-icon">${c.icon}</span> <b>${esc(c.name)}</b> <span class="muted small">stock : ${s.inventory.consumables[k] || 0}</span></div>
            <div class="small muted">${esc(c.desc)}</div>
            <div class="b-opt-foot">${costList(c.cost, s)}
              ${lab >= c.lab ? (labJob ? '' : `<input type="number" class="qty" min="1" value="1" id="brew-${k}"><button class="mini primary" data-action="brew" data-key="${k}">Distiller</button>`) : `<span class="req">Labo niv. ${c.lab}</span>`}
              ${c.buff && s.inventory.consumables[k] ? `<button class="mini good" data-action="use-potion" data-key="${k}">Boire</button>` : ''}</div></div>`).join('')}</div>
        </div>
      </div>

      <div class="card"><h2>📦 Ressources</h2><div class="res-table">${RES_ORDER.map((r) => `<div class="res-row"><span class="res-icon">${RESOURCES[r].icon}</span><b>${esc(RESOURCES[r].name)}</b><span class="num">${fmt(s.resources[r] || 0)}</span><span class="muted small">${esc(RESOURCES[r].uses)}</span></div>`).join('')}</div></div>
    </div>`;
  },
  actions: {
    'inv-filter': (app, el) => { app.ui.invFilter = el.dataset.slot; app.render(); },
    'item-sel': (app, el) => { app.ui.itemSel = el.dataset.id; app.render(); },
    'craft-slot': (app, el) => { app.ui.craftSlot = el.dataset.slot; app.render(); },
    catalyst: (app, el) => { app.ui.catalyst = el.value; app.render(); },
    craft: (app) => app.act(() => startCraft(app.state, app.ui.craftSlot || 'weapon', app.ui.catalyst || 'none'), 'Le marteau résonne…'),
    brew: (app, el) => app.act(() => startBrew(app.state, el.dataset.key, +document.getElementById('brew-' + el.dataset.key).value), 'Distillation lancée'),
    'use-potion': (app, el) => app.act(() => usePotion(app.state, el.dataset.key), 'Effet actif !'),
    'upgrade-item': (app, el) => app.act(() => upgradeItem(app.state, el.dataset.id), 'Objet amélioré'),
    salvage: (app, el) => { if (confirm('Recycler cet objet ?')) app.act(() => salvageItem(app.state, el.dataset.id), 'Objet recyclé'); },
    lock: (app, el) => { toggleLock(app.state, el.dataset.id); app.render(); },
  },
};
void rarityTag;
