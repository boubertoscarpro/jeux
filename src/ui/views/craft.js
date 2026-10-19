import { SLOTS, SLOT_ORDER, CATALYSTS, CONSUMABLES, CRAFT_RECIPES, FORGE_ORDERS } from '../../data/items.js';
import { resIcon } from '../icons.js';
import { RARITIES, RARITY_ORDER, HERO_CLASSES } from '../../data/heroes.js';
import { RESOURCES, RES_ORDER } from '../../data/resources.js';
import { fmt, fmtTime } from '../../core/util.js';
import { computeMods } from '../../systems/modifiers.js';
import { levelOf } from '../../systems/city.js';
import { startCraft, craftCost, craftQuality, startBrew, usePotion, upgradeItem, salvageItem, toggleLock, INVENTORY_CAP, orderCost, orderDuration, orderStatus, startForgeOrder } from '../../systems/crafting.js';
import { armoryState, sellValue, sellItems, gemQuotaLeft, bestForMap, roleCoefs, linearGain, heroRole, transmuteCheck, transmute, reforgeable, reforgeQuote, reforge, socketGem, unsocketGem, cutGem, fuseGems, lootRules, addLootRule, resText, toggleReserve } from '../../systems/armory.js';
import { removeOrder, toggleOrder, moveOrder, describeOrder } from '../../systems/automation.js';
import { bestBadge, socketsHtml, setTag, openBulk, bulkSelection, undoButton, undoActions, gemsPanel, compareHtml, toolbarActions } from '../armoryUi.js';
import { GEM_DAILY, LOOT_RULES_MAX, SAVED_FILTERS_MAX } from '../../data/armory.js';
import { fmtMod } from '../../data/modLabels.js';
import { upgradeCost, salvageYield, MAX_PLUS, rarityOdds, itemScore, itemMods } from '../../systems/items.js';
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
  const A = armoryState(s);
  const owner = s.heroes.find((h) => h.id === it.equippedBy);
  const maxed = it.plus >= MAX_PLUS[it.rarity];
  const sv = sellValue(s, it);
  const blocked = it.equippedBy ? 'Objet porté : retirez-le d’abord' : it.locked ? 'Objet verrouillé : déverrouillez-le d’abord' : '';
  const sources = s.inventory.items.filter((x) => x.id !== it.id && x.slot === it.slot && (x.plus || 0) > (it.plus || 0) && !x.equippedBy && !x.locked);
  const tsrc = sources.find((x) => x.id === app.ui.tmFrom) || null;
  const tchk = tsrc ? transmuteCheck(s, tsrc.id, it.id) : null;
  const refo = reforgeable(it);
  const hero = s.heroes.find((h) => h.id === app.ui.invHero);
  return `<div class="card-sub item-detail">${itemCard(it)}${setTag(it)}
    <div class="small">${owner ? `Porté par <b>${esc(owner.name)}</b>` : 'Non porté'} · amélioration +${it.plus}/${MAX_PLUS[it.rarity]}${it.reservedFor ? ` · 📌 réservé à ${esc(s.heroes.find((h) => h.id === it.reservedFor)?.name || '?')}` : ''}</div>
    ${hero ? compareHtml(s, hero, it).replace('class="cmp"', 'class="cmp open"') : ''}
    <div class="panel-sub"><h4>Châsses</h4>${socketsHtml(it, true, A.gemBag) || '<span class="small muted">Aucune châsse (les objets rares en ont 1, épiques 2, légendaires et mythiques 3).</span>'}</div>
    ${maxed ? '<div class="small ok">Amélioration maximale.</div>' : `<div class="panel-sub"><h4>Améliorer → +${it.plus + 1} (+10 % à tous les affixes)</h4>${costList(upgradeCost(it, -(mods['upgrade.cost'] || 0)), s)} <button class="mini primary" data-action="upgrade-item" data-id="${it.id}">Améliorer</button></div>`}
    <div class="panel-sub"><h4>Vendre ou démanteler</h4>
      <div class="row gap wrap"><span class="small">💎 Joaillier : ${resChips({ gold: sv.gold, ...(sv.gems ? { gems: sv.gems } : {}) })}</span><button class="mini" data-action="sell-one" data-id="${it.id}" ${blocked ? 'disabled' : ''}>Vendre</button></div>
      <div class="row gap wrap"><span class="small">⚒️ Forge : ${resChips(salvageYield(it, mods['salvage.bonus'] || 0))}</span><button class="mini ghost danger" data-action="salvage" data-id="${it.id}" ${blocked ? 'disabled' : ''}>Démanteler</button></div>
      ${blocked ? `<div class="small muted">${esc(blocked)}</div>` : ''}${sv.gems ? `<div class="small muted">Le Joaillier rachète encore ${gemQuotaLeft(s)} gemme(s) aujourd’hui (au plus ${GEM_DAILY}), puis paie en or.</div>` : ''}
      <div class="row gap wrap"><button class="mini ghost" data-action="lock" data-id="${it.id}" aria-pressed="${!!it.locked}">${it.locked ? '🔓 Déverrouiller' : '🔒 Verrouiller'}</button>${it.equippedBy ? `<button class="mini ghost" data-action="reserve-item" data-id="${it.id}" aria-pressed="${!!it.reservedFor}">📌 ${it.reservedFor ? 'Lever la réservation' : 'Réserver à ce héros'}</button>` : ''}</div></div>
    <div class="panel-sub"><h4>🔁 Transmutation</h4><p class="small muted">Transfère 70 % du niveau +N d’une autre pièce du même emplacement vers celle-ci ; la pièce sacrifiée disparaît (ses gemmes reviennent à l’écrin).</p>
      ${sources.length ? `<label class="small">Pièce sacrifiée <select data-change="tm-from" aria-label="Pièce sacrifiée"><option value="">—</option>${sources.map((x) => `<option value="${x.id}" ${tsrc?.id === x.id ? 'selected' : ''}>${esc(x.name)} +${x.plus}</option>`).join('')}</select></label>
        ${tchk ? (tchk.ok ? `<div class="small">${esc(it.name)} passerait de +${it.plus} à <b>+${tchk.plus}</b> · ${costList(tchk.cost, s)} <button class="mini primary" data-action="tm-go" data-id="${it.id}">Transmuter</button></div>` : `<div class="small req">${esc(tchk.reason)}</div>`) : ''}` : '<div class="small muted">Aucune pièce du même emplacement avec un meilleur +N (ni portée, ni verrouillée).</div>'}</div>
    ${refo.length ? `<div class="panel-sub"><h4>🔨 Réforge</h4><p class="small muted">Retire un effet (pas la signature du modèle) et en tire un autre. Coût croissant à chaque réforge : ${costList(reforgeQuote(it), s)}${it.reforges ? ` (déjà ${it.reforges} fois)` : ''}.</p>
      <div class="row gap wrap">${refo.map((k) => `<button class="mini" data-action="reforge" data-id="${it.id}" data-k="${k}">Remplacer ${esc(fmtMod(k, itemMods(it)[k]))}</button>`).join('')}</div></div>` : ''}
    <button class="btn small" data-action="goto" data-view="heroes">Équiper un héros →</button></div>`;
}

// Règles de tri du butin (ordres du royaume de type « loot ») et rapports de l'armurerie
function rulesPanel(app) {
  const s = app.state, A = armoryState(s);
  const rules = lootRules(s);
  const d = (app.ui.ruleDraft ||= { rarityMax: 'common', slot: '', useful: 'useless', action: 'lootDismantle' });
  const sel = (k, opts) => `<select data-change="rule-f" data-k="${k}" aria-label="${esc({ rarityMax: 'Rareté maximale', slot: 'Emplacement', useful: 'Utilité', action: 'Action' }[k])}">${opts.map(([v, l]) => `<option value="${v}" ${d[k] === v ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
  return `<div class="card"><h2>🗂️ Règles de tri du butin <span class="muted small">${rules.length}/${LOOT_RULES_MAX}</span></h2>
    <p class="small">À l’arrivée de chaque objet, la première règle qui correspond décide : <b>vendre</b>, <b>démanteler</b> ou <b>garder</b>. Ces règles sont des ordres du royaume (hors quota, disponibles dès le début). Elles ne touchent jamais un objet porté, verrouillé, réservé ou meilleur pour un héros.</p>
    <label class="small chk"><input type="checkbox" data-change="ae-opt" data-k="autoLoot" ${A.settings.autoLoot ? 'checked' : ''}> D’abord, équiper automatiquement le butin meilleur (une ligne dans le fil du royaume)</label>
    <ol class="rules">${rules.map((o, i) => `<li class="order ${o.enabled ? '' : 'off'}"><div class="order-main"><b>${esc(o.name)}</b><div class="small">${esc(describeOrder(o))}</div><div class="small muted">Appliquée ${o.runs || 0} fois</div></div>
      <div class="order-ctl"><button class="mini ghost" data-action="rule-move" data-id="${o.id}" data-d="-1" ${i ? '' : 'disabled'} aria-label="Monter la règle">▲</button><button class="mini ghost" data-action="rule-move" data-id="${o.id}" data-d="1" ${i < rules.length - 1 ? '' : 'disabled'} aria-label="Descendre la règle">▼</button><button class="mini ${o.enabled ? 'good' : ''}" data-action="rule-toggle" data-id="${o.id}" aria-pressed="${o.enabled}">${o.enabled ? 'Active' : 'Inactive'}</button><button class="mini ghost danger" data-action="rule-del" data-id="${o.id}" aria-label="Supprimer la règle ${esc(o.name)}">✕</button></div></li>`).join('') || '<li class="muted small">Aucune règle : tout le butin est gardé. Au-delà de 300 objets, les moins utiles sont démantelés, avec un rapport ci-dessous.</li>'}</ol>
    <div class="rule-line small"><b class="kw">SI</b> un objet arrive : ${sel('slot', [['', 'tout emplacement'], ...SLOT_ORDER.map((k) => [k, SLOTS[k].name])])} de rareté ≤ ${sel('rarityMax', RARITY_ORDER.map((r) => [r, RARITIES[r].name]))} ${sel('useful', [['useless', 'utile à aucun héros'], ['any', 'utile ou non']])}
      <b class="kw">ALORS</b> ${sel('action', [['lootDismantle', 'le démanteler'], ['lootSell', 'le vendre'], ['lootKeep', 'le garder']])} <button class="mini primary" data-action="rule-add" ${rules.length >= LOOT_RULES_MAX ? 'disabled' : ''}>Ajouter</button></div>
    <div class="row gap wrap small">Modèles : <button class="mini" data-action="rule-tpl" data-k="a">Démanteler les communs inutiles</button><button class="mini" data-action="rule-tpl" data-k="b">Vendre les anneaux rares inutiles</button><button class="mini" data-action="rule-tpl" data-k="c">Garder tout épique ou mieux (à placer en premier)</button></div>
    <h3>Rapports de l’armurerie</h3>
    ${A.reports.length ? `<ul class="armory-reports small">${A.reports.slice(0, 10).map((r) => `<li><b>${new Date(r.t).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</b> — ${r.kind === 'cap' ? '🎒 Inventaire plein' : '🗂️ Règles de tri'} : ${esc(r.lines.join(' ; '))} → ${esc(resText(r.res))}</li>`).join('')}</ul>` : '<p class="small muted">Rien n’a encore été trié.</p>'}
    <p class="small muted">Depuis le début : ${A.stats.sold} vendu(s) (${fmt(A.stats.goldSold)} or, ${A.stats.gemsSold} gemme(s)), ${A.stats.dismantled} démantelé(s), ${A.stats.autoEquips} pièce(s) équipée(s) automatiquement.</p></div>`;
}

function inventoryCard(app, mods) {
  const s = app.state;
  const filt = app.ui.invFilter || '';
  const rar = app.ui.invRarity || '';
  const q = (app.ui.invSearch || '').trim().toLowerCase();
  const sortBy = app.ui.invSort || 'rarity';
  const hero = s.heroes.find((h) => h.id === app.ui.invHero) || null;
  const coefs = hero ? roleCoefs(hero, heroRole(hero)) : null;
  const best = bestForMap(s);
  const SORTS = { rarity: (a, b) => RARITY_ORDER.indexOf(b.rarity) - RARITY_ORDER.indexOf(a.rarity) || itemScore(b) - itemScore(a), score: (a, b) => itemScore(b) - itemScore(a), level: (a, b) => (b.ilvl || 0) - (a.ilvl || 0), plus: (a, b) => (b.plus || 0) - (a.plus || 0), slot: (a, b) => SLOT_ORDER.indexOf(a.slot) - SLOT_ORDER.indexOf(b.slot) || RARITY_ORDER.indexOf(b.rarity) - RARITY_ORDER.indexOf(a.rarity), gain: (a, b) => linearGain(b, coefs) - linearGain(a, coefs) };
  const text = (it) => `${it.name} ${Object.keys(itemMods(it)).map((k) => fmtMod(k, 1)).join(' ')} ${RARITIES[it.rarity].name}`.toLowerCase();
  const all = s.inventory.items.filter((i) => (!filt || i.slot === filt) && (!rar || i.rarity === rar) && (!q || text(i).includes(q))).sort(SORTS[sortBy === 'gain' && !coefs ? 'rarity' : sortBy] || SORTS.rarity);
  const limit = app.ui.invLimit || 60;
  const items = all.slice(0, limit);
  const sel = s.inventory.items.find((i) => i.id === app.ui.itemSel);
  const picked = new Set(app.ui.invSel || []);
  const A = armoryState(s);
  return `<div class="card"><h2>🎒 Inventaire <span class="muted small">${s.inventory.items.length}/${INVENTORY_CAP} objets</span></h2>
    <div class="row gap wrap"><button class="btn small primary" data-action="bulk-open">🧹 Vente et démantèlement en masse…</button>${undoButton(app)}</div>
    <div class="tabs">${['', ...SLOT_ORDER].map((k) => `<button class="tab ${filt === k ? 'active' : ''}" data-action="inv-filter" data-slot="${k}" aria-pressed="${filt === k}">${k ? SLOTS[k].icon + ' ' + SLOTS[k].name : 'Tous'}</button>`).join('')}</div>
    <div class="row gap wrap small inv-tools"><label>Rechercher <input type="search" id="inv-search" value="${esc(app.ui.invSearch || '')}" placeholder="nom, effet, rareté" data-change="inv-search"></label>
      <label>Rareté <select id="inv-rar" data-change="inv-rarity"><option value="">Toutes</option>${RARITY_ORDER.map((r) => `<option value="${r}" ${rar === r ? 'selected' : ''}>${esc(RARITIES[r].name)}</option>`).join('')}</select></label>
      <label>Trier par <select id="inv-sort" data-change="inv-sort">${[['rarity', 'Rareté'], ['gain', 'Gain pour un héros'], ['slot', 'Emplacement'], ['level', 'Niveau d’objet'], ['plus', 'Amélioration'], ['score', 'Somme des effets']].map(([k, l]) => `<option value="${k}" ${sortBy === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      <label>Héros <select id="inv-hero" data-change="inv-hero"><option value="">—</option>${s.heroes.map((h) => `<option value="${h.id}" ${app.ui.invHero === h.id ? 'selected' : ''}>${esc(h.name)}</option>`).join('')}</select></label>
      ${A.filters.map((f, i) => `<button class="mini ghost" data-action="inv-saved" data-i="${i}">★ ${esc(f.name)}</button>`).join('')}${A.filters.length < SAVED_FILTERS_MAX || true ? '<button class="mini ghost" data-action="inv-save-filter">★ Enregistrer ce filtre</button>' : ''}
      <span class="muted">${all.length} affiché(s)</span></div>
    ${picked.size ? `<div class="sel-bar" role="region" aria-label="Sélection"><b>${picked.size} sélectionné(s)</b><button class="mini" data-action="sel-sell">💎 Vendre…</button><button class="mini" data-action="sel-scrap">⚒️ Démanteler…</button><button class="mini ghost" data-action="sel-none">Tout désélectionner</button></div>` : '<p class="small muted">Cochez des objets (Espace au clavier) pour les vendre ou les démanteler ensemble ; Maj+clic sur une case coche un intervalle.</p>'}
    <div class="inv-layout">
      <div class="item-grid">${items.map((it) => `<div class="item-wrap ${picked.has(it.id) ? 'picked' : ''}"><label class="pick"><input type="checkbox" data-change="inv-check" data-id="${it.id}" ${picked.has(it.id) ? 'checked' : ''} aria-label="Sélectionner ${esc(it.name)}"></label>${itemCard(it, { action: 'item-sel', selected: it.id === app.ui.itemSel })}${setTag(it)}${bestBadge(s, best, it)}${(it.sockets || []).length ? `<span class="small muted">◇ ${it.sockets.filter(Boolean).length}/${it.sockets.length} châsse(s)</span>` : ''}</div>`).join('') || empty('Aucun objet. Explorez, nettoyez des sites dangereux, ou forgez !')}${all.length > limit ? `<button class="btn small" data-action="inv-more">Afficher ${Math.min(60, all.length - limit)} de plus</button>` : ''}</div>
      <div>${sel ? itemDetail(app, sel, mods) : '<div class="muted small">Sélectionnez un objet.</div>'}</div>
    </div></div>`;
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
    const forgeJob = s.queues.craft.find((q) => q.kind === 'item');
    const labJob = s.queues.craft.find((q) => q.kind === 'potion');
    const tab = app.ui.craftTab || 'inv';
    const TABS = [['inv', '🎒 Inventaire'], ['forge', '⚒️ Forge'], ['gems', '💎 Gemmes'], ['rules', '🗂️ Règles de tri'], ['lab', '⚗️ Laboratoire']];
    const forgeCard = `<div class="card"><h2>⚒️ Forge ${forge ? `<span class="muted small">niv. ${forge} · objets niv. ${1 + forge * 2}</span>` : ''}</h2>
          ${!forge ? '<p class="muted">Construisez une Forge (Hôtel de ville niv. 3) pour fabriquer de l’équipement.</p>' : `
          <div class="tabs">${SLOT_ORDER.map((k) => `<button class="tab ${slot === k ? 'active' : ''}" data-action="craft-slot" data-slot="${k}">${SLOTS[k].icon} ${SLOTS[k].name}</button>`).join('')}</div>
          <div class="form-row"><label>Catalyseur</label><select data-change="catalyst" id="catalyst">${Object.entries(CATALYSTS).map(([k, c]) => `<option value="${k}" ${cat === k ? 'selected' : ''}>${esc(c.name)}${c.desc ? ' — ' + esc(c.desc) : ''}</option>`).join('')}</select></div>
          ${plans.length ? `<div class="form-row"><label>Plan</label><select data-change="craft-plan" id="craft-plan"><option value="">Modèle au hasard</option>${plans.map(([id, p]) => `<option value="${id}" ${plan === id ? 'selected' : ''}>${p.icon} ${esc(p.name)}</option>`).join('')}</select></div>
          ${plan ? `<div class="form-row"><label>Effet spécial</label><select data-change="craft-variant" id="craft-variant">${Object.entries(PLANS[plan].variants).map(([k, v]) => `<option value="${k}" ${variant === k ? 'selected' : ''}>${esc(v.name)} — ${esc(variantText(v))}</option>`).join('')}</select></div>` : ''}` : '<div class="small muted">Aucun plan connu pour cet emplacement (voir « Plans de forge » plus bas).</div>'}
          ${workshopOf(s) ? `<div class="small muted">🏭 ${esc(WORKSHOPS[workshopOf(s)].name)} : ${WORKSHOPS[workshopOf(s)].slots.includes(slot) ? 'qualité et prix favorables pour cet emplacement' : 'surcoût pour cet emplacement'}.</div>` : ''}
          <div class="panel-sub"><h4>Coût</h4>${costList(craftCost(slot, cat, mods, s, plan || null), s)} <span class="muted small">⏱ ${fmtTime((CRAFT_RECIPES[slot].time * 1000) / (1 + (mods['craft.speed'] || 0)))}</span></div>
          <div class="panel-sub"><h4>Chances de rareté</h4><div class="odds">${RARITY_ORDER.map((r) => `<div><span style="color:${RARITIES[r].color}">${RARITIES[r].name}</span><b>${(odds[r] * 100).toFixed(1)}%</b></div>`).join('')}</div>
            <div class="muted small">Qualité : niveau de forge, héros intendant de la Forge (Forgeron ★), technologies d’Artisanat, catalyseur.</div></div>
          ${forgeJob ? `<div class="req">La forge est occupée${forgeJob.order ? ` par une ${esc(FORGE_ORDERS[forgeJob.order].name.toLowerCase())} (${forgeJob.n} objets)` : ''}.</div>` : `<button class="btn primary" data-action="craft">Forger</button>`}
          <div class="panel-sub forge-orders"><h4>📜 Grosses commandes aux forgerons</h4>
            <p class="small muted">Plusieurs ${esc(SLOTS[slot].name.toLowerCase())}s d’un coup, de meilleure qualité, contre beaucoup de ressources et plusieurs heures de forge. La forge reste occupée jusqu’à la livraison ; annulation possible (80 % rendus).</p>
            ${Object.entries(FORGE_ORDERS).map(([k, o]) => { const st = orderStatus(s, slot, k); const locked = forge < o.forge;
              return `<div class="forge-order ${locked ? 'locked' : ''}"><div><b>${o.icon} ${esc(o.name)}</b> <span class="chip small">${o.n} objets</span> <span class="muted small">forge ${o.forge}+</span></div>
                <div class="small muted">${esc(o.desc)}</div>
                ${locked ? `<div class="req small">Forge niveau ${o.forge} requise</div>` : `<div class="small">${costList(orderCost(s, slot, k, mods), s)} <span class="muted">⏱ ${fmtTime(orderDuration(s, slot, k, mods))}</span></div>
                <button class="mini ${st.ok ? 'primary' : 'ghost'}" data-action="forge-order" data-k="${k}" ${st.ok ? '' : 'disabled'}>${st.ok ? 'Passer commande' : esc(st.reason || 'Indisponible')}</button>`}</div>`; }).join('')}
          </div>`}
        </div>`;
    const labCard = `<div class="card"><h2>⚗️ Laboratoire ${lab ? `<span class="muted small">niv. ${lab}</span>` : ''}</h2>
          ${!lab ? '<p class="muted">Construisez un Laboratoire (Hôtel de ville niv. 4) pour distiller des potions à partir d’herbes.</p>' : ''}
          <div class="potion-list">${Object.entries(CONSUMABLES).map(([k, c]) => `<div class="potion ${lab >= c.lab ? '' : 'locked'}">
            <div><span class="p-icon">${c.icon}</span> <b>${esc(c.name)}</b> <span class="muted small">stock : ${s.inventory.consumables[k] || 0}</span></div>
            <div class="small muted">${esc(c.desc)}</div>
            <div class="b-opt-foot">${costList(c.cost, s)}
              ${lab >= c.lab ? (labJob ? '' : `<input type="number" class="qty" min="1" value="1" id="brew-${k}"><button class="mini primary" data-action="brew" data-key="${k}">Distiller</button>`) : `<span class="req">Labo niv. ${c.lab}</span>`}
              ${c.buff && s.inventory.consumables[k] ? `<button class="mini good" data-action="use-potion" data-key="${k}">Boire</button>` : ''}</div></div>`).join('')}</div>
        </div>`;
    const resCard = `<div class="card"><h2>📦 Ressources</h2><div class="res-table">${RES_ORDER.map((r) => `<div class="res-row"><span class="res-icon">${resIcon(r, 16, RESOURCES[r]?.icon)}</span><b>${esc(RESOURCES[r].name)}</b><span class="num">${fmt(s.resources[r] || 0)}</span><span class="muted small">${esc(RESOURCES[r].uses)}</span></div>`).join('')}</div></div>`;
    const body = { inv: () => inventoryCard(app, mods), forge: () => `${forgeCard}${forge ? plansPanel(app) : ''}${commissionsPanel(app)}`, gems: () => gemsPanel(app), rules: () => rulesPanel(app), lab: () => `${labCard}${resCard}` }[tab] || (() => inventoryCard(app, mods));
    return `<div class="craft-layout">
      <div class="tabs" role="tablist" aria-label="Artisanat">${TABS.map(([k, l]) => `<button class="tab ${tab === k ? 'active' : ''}" role="tab" aria-selected="${tab === k}" data-action="craft-tab" data-k="${k}">${l}</button>`).join('')}</div>
      ${body()}
    </div>`;
  },
  actions: {
    'cm-start': (app, el) => app.act(() => startCommission(app.state, el.dataset.id), 'Commande acceptée'),
    'cm-stage': (app) => app.act(() => launchStage(app.state), 'Étape lancée dans les ateliers'),
    'cm-claim': (app) => app.act(() => claimCommission(app.state), (r) => `Ouvrage livré : ${r.text}`),
    'cm-abandon': (app) => app.confirm('<h2>Abandonner la commande ?</h2><p>Les ressources déjà engagées dans les étapes payées sont perdues. Vous pourrez la reprendre plus tard depuis le début.</p>', 'Abandonner', () => app.act(() => abandonCommission(app.state), 'Commande abandonnée')),
    ...undoActions,
    'ae-opt': toolbarActions['ae-opt'],
    'craft-tab': (app, el) => { app.ui.craftTab = el.dataset.k; app.render(); },
    'bulk-open': (app) => openBulk(app),
    'inv-search': (app, el) => { app.ui.invSearch = el.value; app.ui.invLimit = 60; app.render(); const i = document.getElementById('inv-search'); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } },
    'inv-hero': (app, el) => { app.ui.invHero = el.value || null; if (el.value && !app.ui.invSort) app.ui.invSort = 'gain'; app.render(); },
    'inv-check': (app, el) => {
      const set = new Set(app.ui.invSel || []);
      const ids = [...document.querySelectorAll('[data-change="inv-check"]')].map((x) => x.dataset.id);
      // Maj : coche l'intervalle depuis la dernière case cochée
      if (window.event?.shiftKey && app.ui._lastPick && ids.includes(app.ui._lastPick)) { const [a, b] = [ids.indexOf(app.ui._lastPick), ids.indexOf(el.dataset.id)].sort((x, y) => x - y); for (const id of ids.slice(a, b + 1)) set.add(id); }
      else if (el.checked) set.add(el.dataset.id); else set.delete(el.dataset.id);
      app.ui._lastPick = el.dataset.id; app.ui.invSel = [...set]; app.render();
      document.querySelector(`[data-change="inv-check"][data-id="${el.dataset.id}"]`)?.focus();
    },
    'sel-none': (app) => { app.ui.invSel = []; app.render(); },
    'sel-sell': (app) => bulkSelection(app, 'sell'),
    'sel-scrap': (app) => bulkSelection(app, 'dismantle'),
    'inv-saved': (app, el) => { const f = armoryState(app.state).filters[+el.dataset.i]?.filter || {}; app.ui.invFilter = f.slot || ''; app.ui.invRarity = f.rarity || f.maxRarity || ''; app.ui.invSearch = f.q || ''; app.ui.invSort = f.sort || app.ui.invSort; app.render(); },
    'inv-save-filter': (app) => { const name = prompt('Nom du filtre', 'Mon filtre'); if (name === null) return; const A = armoryState(app.state); const f = { name: name.slice(0, 24) || 'Filtre', filter: { slot: app.ui.invFilter || '', rarity: app.ui.invRarity || '', q: app.ui.invSearch || '', sort: app.ui.invSort || 'rarity' } }; A.filters = [f, ...A.filters.filter((x) => x.name !== f.name)].slice(0, SAVED_FILTERS_MAX); app.save(); app.render(); },
    'sell-one': (app, el) => { const it = app.state.inventory.items.find((i) => i.id === el.dataset.id); if (!it) return; const v = sellValue(app.state, it); app.confirm(`<h2>Vendre ${esc(it.name)} ?</h2><p>Le Joaillier offre ${resChips({ gold: v.gold, ...(v.gems ? { gems: Math.min(v.gems, gemQuotaLeft(app.state)) } : {}) })}${v.gems > gemQuotaLeft(app.state) ? ' (quota de gemmes du jour atteint : le reste en or)' : ''}.</p><p class="small muted">Les gemmes serties reviennent à l’écrin. Annulable pendant 10 min.</p>`, 'Vendre', () => app.act(() => sellItems(app.state, [it.id], Date.now(), { manual: true }), '💎 Objet vendu'), false); },
    'reserve-item': (app, el) => app.act(() => toggleReserve(app.state, el.dataset.id), (r) => (r.reserved ? '📌 Réservé' : 'Réservation levée')),
    'gem-set': (app, el) => { if (!el.value) return; app.act(() => socketGem(app.state, el.dataset.id, +el.dataset.i, el.value), '💎 Gemme sertie'); },
    'gem-unset': (app, el) => app.act(() => unsocketGem(app.state, el.dataset.id, +el.dataset.i), '💎 Gemme rendue à l’écrin'),
    'gem-cut': (app, el) => app.act(() => cutGem(app.state, el.dataset.t), '💎 Éclat taillé'),
    'gem-fuse': (app, el) => app.act(() => fuseGems(app.state, el.dataset.t, +el.dataset.q), '💎 Gemmes fusionnées'),
    'tm-from': (app, el) => { app.ui.tmFrom = el.value || null; app.render(); },
    'tm-go': (app, el) => app.confirm('<h2>Transmuter ?</h2><p>La pièce sacrifiée disparaît ; ses gemmes reviennent à l’écrin. Ce n’est pas annulable.</p>', 'Transmuter', () => { app.act(() => transmute(app.state, app.ui.tmFrom, el.dataset.id), (r) => `🔁 ${r.name} passe à +${r.plus}`); app.ui.tmFrom = null; }),
    reforge: (app, el) => app.act(() => reforge(app.state, el.dataset.id, el.dataset.k), (r) => `🔨 ${fmtMod(r.from, 1).replace(/^[+−][\d,]+ %? ?/, '')} → ${fmtMod(r.to, 1).replace(/^[+−][\d,]+ %? ?/, '')}`),
    'rule-f': (app, el) => { app.ui.ruleDraft[el.dataset.k] = el.value; },
    'rule-add': (app) => app.act(() => addLootRule(app.state, app.ui.ruleDraft), 'Règle ajoutée'),
    'rule-tpl': (app, el) => app.act(() => addLootRule(app.state, { a: { rarityMax: 'common', useful: 'useless', action: 'lootDismantle' }, b: { rarityMax: 'rare', slot: 'ring', useful: 'useless', action: 'lootSell', name: 'Vendre les anneaux rares inutiles' }, c: { rarityMin: 'epic', useful: 'any', action: 'lootKeep', name: 'Garder tout épique ou mieux' } }[el.dataset.k]), 'Règle ajoutée'),
    'rule-toggle': (app, el) => app.act(() => toggleOrder(app.state, el.dataset.id)),
    'rule-del': (app, el) => app.act(() => removeOrder(app.state, el.dataset.id)),
    'rule-move': (app, el) => app.act(() => { const ids = lootRules(app.state).map((o) => o.id); const i = ids.indexOf(el.dataset.id), j = i + +el.dataset.d; if (j < 0 || j >= ids.length) return { ok: false }; const O = app.state.orders; const a = O.findIndex((o) => o.id === ids[i]), b = O.findIndex((o) => o.id === ids[j]); [O[a], O[b]] = [O[b], O[a]]; return { ok: true }; }),
    'inv-filter': (app, el) => { app.ui.invFilter = el.dataset.slot; app.render(); },
    'item-sel': (app, el) => { app.ui.itemSel = el.dataset.id; app.render(); },
    'craft-slot': (app, el) => { app.ui.craftSlot = el.dataset.slot; app.ui.craftPlan = ''; app.render(); },
    catalyst: (app, el) => { app.ui.catalyst = el.value; app.render(); },
    'forge-order': (app, el) => {
      const s = app.state, slot = app.ui.craftSlot || 'weapon', k = el.dataset.k, o = FORGE_ORDERS[k];
      const st = orderStatus(s, slot, k);
      if (!st.ok) { app.toast(st.reason, 'bad'); return; }
      app.confirm(`<h2>${o.icon} ${esc(o.name)} ?</h2><p>${o.n} × ${esc(SLOTS[slot].name)} — livraison dans ${fmtTime(st.time)}.</p><p>Coût payé maintenant : ${costList(st.cost, s)}</p><p class="small muted">La forge ne pourra rien fabriquer d’autre pendant la commande.</p>`, 'Passer commande', () => app.act(() => startForgeOrder(app.state, slot, k), (r) => `${o.icon} ${r.text}`));
    },
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
    salvage: (app, el) => { const it = app.state.inventory.items.find((i) => i.id === el.dataset.id); if (!it) return; app.confirm(`<h2>Démanteler ${esc(it.name)} ?</h2><p>La forge en tire ${resChips(salvageYield(it, computeMods(app.state)['salvage.bonus'] || 0))}. Les gemmes serties reviennent à l’écrin. Annulable pendant 10 min.</p>`, 'Démanteler', () => app.act(() => salvageItem(app.state, it.id), '⚒️ Objet démantelé')); },
    lock: (app, el) => { toggleLock(app.state, el.dataset.id); app.render(); },
  },
};
void rarityTag;
