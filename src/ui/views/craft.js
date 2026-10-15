import { SLOTS, SLOT_ORDER, CATALYSTS, CONSUMABLES, CRAFT_RECIPES } from '../../data/items.js';
import { resIcon } from '../icons.js';
import { RARITIES, RARITY_ORDER, HERO_CLASSES } from '../../data/heroes.js';
import { RESOURCES, RES_ORDER } from '../../data/resources.js';
import { fmt, fmtTime } from '../../core/util.js';
import { computeMods } from '../../systems/modifiers.js';
import { levelOf } from '../../systems/city.js';
import { startCraft, craftCost, craftQuality, startBrew, usePotion, upgradeItem, salvageItem, toggleLock, INVENTORY_CAP } from '../../systems/crafting.js';
import { upgradeCost, salvageYield, MAX_PLUS, rarityOdds, itemScore } from '../../systems/items.js';
import { esc, costList, resChips, itemCard, empty, rarityTag, countdown, progress } from '../components.js';
import { commissionList, commissionState, stageCheck, startCommission, launchStage, claimCommission, abandonCommission } from '../../systems/commissions.js';
import { PLANS, PLAN_SOURCES, WORKSHOPS, WORKSHOP_FX, EXPERIMENT } from '../../data/recipes.js';
import { AFFIXES } from '../../data/items.js';
import { recipesState, knowsPlan, heroPlans, learnFromHero, planSellers, buyFactionPlan, experiment, setWorkshop, workshopOf } from '../../systems/recipes.js';
import { RIVALS } from '../../data/world.js';

const variantText = (v) => Object.keys(v.add).map((k) => AFFIXES[k]?.name || k).join(', ');

// Carnet des plans : connus, à découvrir et comment les obtenir ; spécialisation de l'atelier
function plansPanel(app) {
  const s = app.state, R = recipesState(s);
  const ws = workshopOf(s);
  const known = Object.entries(PLANS).filter(([id]) => knowsPlan(s, id));
  const sellers = planSellers(s);
  const heroP = heroPlans(s);
  const cdLeft = R.changedAt ? R.changedAt + WORKSHOP_FX.cooldownH * 3600000 - Date.now() : 0;
  return `<div class="card"><h2>📐 Plans de forge <span class="muted small">${known.length}/${Object.keys(PLANS).length} connus</span></h2>
    <p class="small muted">Un plan fixe le modèle de l’objet et vous laisse choisir son effet spécial au moment de forger. Les plans se trouvent dans les donjons, les mystères archéologiques, auprès des factions amies, des héros expérimentés, ou par l’expérimentation.</p>
    <div class="plan-grid">${Object.entries(PLANS).map(([id, p]) => {
      const k = knowsPlan(s, id), src = PLAN_SOURCES[p.src];
      let how = '';
      if (!k && p.src === 'faction') how = sellers.length ? `<div class="row gap wrap">${costList(p.price, s)} <button class="mini primary" data-action="plan-buy" data-id="${id}">Acheter</button></div>` : '<div class="req small">Nécessite un accord commercial ou une alliance</div>';
      if (!k && p.src === 'hero') { const h = heroP.find((x) => x.id === id)?.hero; how = h ? `<button class="mini primary" data-action="plan-hero" data-id="${id}">Apprendre de ${esc(h.name)}</button>` : `<div class="req small">Héros ${esc(HERO_CLASSES[p.heroClass]?.name || p.heroClass)} niveau ${p.heroLevel} requis</div>`; }
      return `<div class="plan ${k ? 'known' : 'unknown'}"><div><span class="p-icon">${p.icon}</span> <b>${k ? esc(p.name) : '???'}</b> <span class="muted small">${SLOTS[p.slot].icon} ${esc(SLOTS[p.slot].name)}</span></div>
        <div class="small muted">${src.icon} ${esc(src.name)}${k ? ' · ' + Object.values(p.variants).map((v) => `${esc(v.name)} (${esc(variantText(v))})`).join(' · ') : ' · ' + esc(src.desc)}</div>${how}</div>`;
    }).join('')}</div>
    <div class="cols-2">
      <div class="panel-sub"><h4>⚗️ Expérimentation</h4><p class="small muted">Combinez des matériaux rares pour découvrir un plan expérimental (${Math.round(Math.min(1, EXPERIMENT.chance + 0.15 * (R.failStreak || 0)) * 100)} % de réussite, +15 % après chaque échec). Forge niveau ${EXPERIMENT.minForge} requise.</p>
        <div class="row gap wrap">${costList(EXPERIMENT.cost, s)} <button class="mini primary" data-action="plan-experiment">Expérimenter</button></div></div>
      <div class="panel-sub"><h4>🏭 Spécialité de l’atelier</h4><p class="small muted">Qualité +${Math.round(WORKSHOP_FX.quality * 100)} % et coût −${Math.round(WORKSHOP_FX.discount * 100)} % sur la famille choisie, coût +${Math.round(WORKSHOP_FX.surcharge * 100)} % sur les autres. Premier choix gratuit, puis ${costList(WORKSHOP_FX.changeCost, s)} et ${WORKSHOP_FX.cooldownH} h entre deux réorganisations${cdLeft > 0 ? ` (encore ${fmtTime(cdLeft)})` : ''}.</p>
        <div class="row gap wrap">${Object.entries(WORKSHOPS).map(([k, w]) => `<button class="mini ${ws === k ? 'primary' : ''}" data-action="workshop" data-id="${k}" ${ws === k ? 'disabled' : ''}>${w.icon} ${esc(w.name)}<br><span class="small muted">${esc(w.desc)}</span></button>`).join('')}
          ${ws ? '<button class="mini ghost" data-action="workshop" data-id="">Polyvalent</button>' : ''}</div></div>
    </div>
    ${sellers.length ? `<div class="small muted">Factions prêtes à vendre leurs plans : ${sellers.map((f) => esc(RIVALS[f.idx]?.name || '?')).join(', ')}.</div>` : ''}</div>`;
}

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

// Commandes prestigieuses : registre des ouvrages, étapes, conditions et récompenses (une fois par dynastie)
function commissionsPanel(app) {
  const s = app.state, now = Date.now(), list = commissionList(s);
  const a = commissionState(s).active;
  const chk = a ? stageCheck(s, now) : null;
  const row = (c) => {
    const st = c.status;
    const stages = c.stages.map((g, i) => {
      const done = st === 'done' || (a?.id === c.id && (i < a.stage || a.ready));
      const cur = a?.id === c.id && !a.ready && i === a.stage;
      return `<li class="${done ? 'ok' : cur ? 'cur' : ''}">${done ? '✔' : cur ? '▶' : '·'} <b>${esc(g.name)}</b> — ${costList(g.cost, s)}${g.relic ? ` + ${g.relic} fragment de relique` : ''} · ${g.hours} h${g.cond ? ` · <span class="${g.cond(s) ? 'warn-text' : 'ok'}">${esc(g.cond(s) || 'exploit accompli')}</span>` : ''}</li>`;
    }).join('');
    let foot = '';
    if (st === 'available') foot = `<button class="mini primary" data-action="cm-start" data-id="${c.id}">Accepter la commande</button>`;
    else if (st === 'locked' || st === 'busy') foot = `<span class="req small">${esc(c.reason)}</span>`;
    else if (st === 'done') foot = '<span class="ok small">✔ Réalisée pour cette dynastie</span>';
    else if (st === 'ready') foot = '<button class="mini good" data-action="cm-claim">Recevoir l’ouvrage</button>';
    else if (a.stageEnd > now) foot = `<span class="small">Aux ateliers : ${countdown(a.stageEnd)}</span>${progress(a.stageEnd - c.stages[a.stage].hours * 3600000, a.stageEnd)}`;
    else foot = `${chk.ok ? '<button class="mini primary" data-action="cm-stage">Lancer l’étape</button>' : `<span class="req small">${esc(chk.reason)}</span>`} <button class="mini ghost" data-action="cm-abandon">Abandonner</button>`;
    return `<div class="commission ${st}"><div class="row between wrap"><b>${c.icon} ${esc(c.name)}</b><span class="small muted">${esc(c.client)}</span></div>
      <div class="small">${esc(c.desc)}</div><ul class="small cm-stages">${stages}</ul>
      <div class="small">🎁 ${esc(c.rewardText)}</div><div class="row gap wrap">${foot}</div></div>`;
  };
  const done = list.filter((c) => c.status === 'done').length;
  return `<div class="card"><h2>📜 Commandes prestigieuses <span class="muted small">${done}/${list.length} réalisées</span></h2>
    <p class="small muted">Des ouvrages d’exception, en plusieurs étapes, qui emploient vos ressources avancées et rares. Une seule commande à la fois, chacune une seule fois par dynastie ; certaines étapes exigent un exploit.</p>
    <div class="commission-list">${[...list].sort((x, y) => ['ready', 'active', 'available', 'busy', 'locked', 'done'].indexOf(x.status) - ['ready', 'active', 'available', 'busy', 'locked', 'done'].indexOf(y.status)).map(row).join('')}</div></div>`;
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
    const plans = Object.entries(PLANS).filter(([id, p]) => p.slot === slot && knowsPlan(s, id));
    const plan = plans.some(([id]) => id === app.ui.craftPlan) ? app.ui.craftPlan : '';
    const variant = plan && PLANS[plan].variants[app.ui.craftVariant] ? app.ui.craftVariant : plan ? Object.keys(PLANS[plan].variants)[0] : '';
    const odds = rarityOdds(craftQuality(s, cat, mods, slot), CATALYSTS[cat].minRarity || 'common');
    const filt = app.ui.invFilter || '';
    const rar = app.ui.invRarity || '';
    const sortBy = app.ui.invSort || 'rarity';
    const SORTS = { rarity: (a, b) => RARITY_ORDER.indexOf(b.rarity) - RARITY_ORDER.indexOf(a.rarity) || itemScore(b) - itemScore(a), score: (a, b) => itemScore(b) - itemScore(a), level: (a, b) => (b.ilvl || 0) - (a.ilvl || 0), plus: (a, b) => (b.plus || 0) - (a.plus || 0) };
    const all = s.inventory.items.filter((i) => (!filt || i.slot === filt) && (!rar || i.rarity === rar)).sort(SORTS[sortBy] || SORTS.rarity);
    const limit = app.ui.invLimit || 60;
    const items = all.slice(0, limit);
    const sel = s.inventory.items.find((i) => i.id === app.ui.itemSel);
    const forgeJob = s.queues.craft.find((q) => q.kind === 'item');
    const labJob = s.queues.craft.find((q) => q.kind === 'potion');
    return `<div class="craft-layout">
      <div class="card"><h2>🎒 Inventaire <span class="muted small">${s.inventory.items.length} objets</span></h2>
        <div class="tabs">${['', ...SLOT_ORDER].map((k) => `<button class="tab ${filt === k ? 'active' : ''}" data-action="inv-filter" data-slot="${k}">${k ? SLOTS[k].icon + ' ' + SLOTS[k].name : 'Tous'}</button>`).join('')}</div>
        <div class="row gap wrap small"><label>Rareté <select id="inv-rar" data-change="inv-rarity"><option value="">Toutes</option>${RARITY_ORDER.map((r) => `<option value="${r}" ${rar === r ? 'selected' : ''}>${esc(RARITIES[r].name)}</option>`).join('')}</select></label>
          <label>Trier par <select id="inv-sort" data-change="inv-sort">${[['rarity', 'Rareté'], ['score', 'Puissance'], ['level', 'Niveau'], ['plus', 'Amélioration']].map(([k, l]) => `<option value="${k}" ${sortBy === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
          <span class="muted">${all.length} affiché(s) sur ${s.inventory.items.length} · capacité ${INVENTORY_CAP} (au-delà, les plus faibles non verrouillés sont recyclés)</span></div>
        <div class="inv-layout">
          <div class="item-grid">${items.map((it) => itemCard(it, { action: 'item-sel', selected: it.id === app.ui.itemSel })).join('') || empty('Aucun objet. Explorez, nettoyez des sites dangereux, ou forgez !')}${all.length > limit ? `<button class="btn small" data-action="inv-more">Afficher ${Math.min(60, all.length - limit)} de plus</button>` : ''}</div>
          <div>${sel ? itemDetail(app, sel, mods) : '<div class="muted small">Sélectionnez un objet.</div>'}</div>
        </div></div>

      <div class="cols-2">
        <div class="card"><h2>⚒️ Forge ${forge ? `<span class="muted small">niv. ${forge} · objets niv. ${1 + forge * 2}</span>` : ''}</h2>
          ${!forge ? '<p class="muted">Construisez une Forge (Hôtel de ville niv. 3) pour fabriquer de l’équipement.</p>' : `
          <div class="tabs">${SLOT_ORDER.map((k) => `<button class="tab ${slot === k ? 'active' : ''}" data-action="craft-slot" data-slot="${k}">${SLOTS[k].icon} ${SLOTS[k].name}</button>`).join('')}</div>
          <div class="form-row"><label>Catalyseur</label><select data-change="catalyst" id="catalyst">${Object.entries(CATALYSTS).map(([k, c]) => `<option value="${k}" ${cat === k ? 'selected' : ''}>${esc(c.name)}${c.desc ? ' — ' + esc(c.desc) : ''}</option>`).join('')}</select></div>
          ${plans.length ? `<div class="form-row"><label>Plan</label><select data-change="craft-plan" id="craft-plan"><option value="">Modèle au hasard</option>${plans.map(([id, p]) => `<option value="${id}" ${plan === id ? 'selected' : ''}>${p.icon} ${esc(p.name)}</option>`).join('')}</select></div>
          ${plan ? `<div class="form-row"><label>Effet spécial</label><select data-change="craft-variant" id="craft-variant">${Object.entries(PLANS[plan].variants).map(([k, v]) => `<option value="${k}" ${variant === k ? 'selected' : ''}>${esc(v.name)} — ${esc(variantText(v))}</option>`).join('')}</select></div>` : ''}` : '<div class="small muted">Aucun plan connu pour cet emplacement (voir « Plans de forge » plus bas).</div>'}
          ${workshopOf(s) ? `<div class="small muted">🏭 ${esc(WORKSHOPS[workshopOf(s)].name)} : ${WORKSHOPS[workshopOf(s)].slots.includes(slot) ? 'qualité et prix favorables pour cet emplacement' : 'surcoût pour cet emplacement'}.</div>` : ''}
          <div class="panel-sub"><h4>Coût</h4>${costList(craftCost(slot, cat, mods, s, plan || null), s)} <span class="muted small">⏱ ${fmtTime((CRAFT_RECIPES[slot].time * 1000) / (1 + (mods['craft.speed'] || 0)))}</span></div>
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

      ${forge ? plansPanel(app) : ''}
      ${commissionsPanel(app)}
      <div class="card"><h2>📦 Ressources</h2><div class="res-table">${RES_ORDER.map((r) => `<div class="res-row"><span class="res-icon">${resIcon(r, 16, RESOURCES[r]?.icon)}</span><b>${esc(RESOURCES[r].name)}</b><span class="num">${fmt(s.resources[r] || 0)}</span><span class="muted small">${esc(RESOURCES[r].uses)}</span></div>`).join('')}</div></div>
    </div>`;
  },
  actions: {
    'cm-start': (app, el) => app.act(() => startCommission(app.state, el.dataset.id), 'Commande acceptée'),
    'cm-stage': (app) => app.act(() => launchStage(app.state), 'Étape lancée dans les ateliers'),
    'cm-claim': (app) => app.act(() => claimCommission(app.state), (r) => `Ouvrage livré : ${r.text}`),
    'cm-abandon': (app) => app.confirm('<h2>Abandonner la commande ?</h2><p>Les ressources déjà engagées dans les étapes payées sont perdues. Vous pourrez la reprendre plus tard depuis le début.</p>', 'Abandonner', () => app.act(() => abandonCommission(app.state), 'Commande abandonnée')),
    'inv-filter': (app, el) => { app.ui.invFilter = el.dataset.slot; app.render(); },
    'item-sel': (app, el) => { app.ui.itemSel = el.dataset.id; app.render(); },
    'craft-slot': (app, el) => { app.ui.craftSlot = el.dataset.slot; app.ui.craftPlan = ''; app.render(); },
    catalyst: (app, el) => { app.ui.catalyst = el.value; app.render(); },
    craft: (app) => app.act(() => startCraft(app.state, app.ui.craftSlot || 'weapon', app.ui.catalyst || 'none', Date.now(), app.ui.craftPlan || null, app.ui.craftVariant || null), 'Le marteau résonne…'),
    'craft-plan': (app, el) => { app.ui.craftPlan = el.value; app.ui.craftVariant = ''; app.render(); },
    'craft-variant': (app, el) => { app.ui.craftVariant = el.value; app.render(); },
    'plan-buy': (app, el) => app.act(() => buyFactionPlan(app.state, el.dataset.id), (r) => `📐 Plan acheté : ${r.name}`),
    'plan-hero': (app, el) => app.act(() => learnFromHero(app.state, el.dataset.id), (r) => `📐 Plan appris : ${r.name}`),
    'plan-experiment': (app) => app.act(() => experiment(app.state), (r) => (r.found ? `⚗️ Découverte : ${r.name} !` : `⚗️ ${r.text}`)),
    workshop: (app, el) => app.act(() => setWorkshop(app.state, el.dataset.id || null), (r) => `🏭 ${r.name}`),
    brew: (app, el) => app.act(() => startBrew(app.state, el.dataset.key, +document.getElementById('brew-' + el.dataset.key).value), 'Distillation lancée'),
    'use-potion': (app, el) => app.act(() => usePotion(app.state, el.dataset.key), 'Effet actif !'),
    'upgrade-item': (app, el) => app.act(() => upgradeItem(app.state, el.dataset.id), 'Objet amélioré'),
    'inv-rarity': (app, el) => { app.ui.invRarity = el.value; app.ui.invLimit = 60; app.render(); },
    'inv-sort': (app, el) => { app.ui.invSort = el.value; app.render(); },
    'inv-more': (app) => { app.ui.invLimit = (app.ui.invLimit || 60) + 60; app.render(); },
    salvage: (app, el) => { if (confirm('Recycler cet objet ?')) app.act(() => salvageItem(app.state, el.dataset.id), 'Objet recyclé'); },
    lock: (app, el) => { toggleLock(app.state, el.dataset.id); app.render(); },
  },
};
void rarityTag;
