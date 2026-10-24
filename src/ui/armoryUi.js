// v18 « L'Armurerie » : morceaux d'interface partagés par la Taverne (héros) et l'Artisanat (inventaire) —
// aperçu de l'équipement automatique, priorités, comparaison à la pièce portée, châsses, vente et démantèlement en
// masse, annulation. Le visuel lit l'état ; toute modification passe par systems/armory.js.
import { SLOTS, SLOT_ORDER } from '../data/items.js';
import { RARITIES, RARITY_ORDER, HERO_CLASSES } from '../data/heroes.js';
import { GEM_TYPES, GEM_QUALITIES, ITEM_SETS, UNDO_MS, GEM_DAILY, CUT_COST, FUSE_N, fuseCost, unsetCost } from '../data/armory.js';
import { fmtMod } from '../data/modLabels.js';
import { fmtTime } from '../core/util.js';
import { computeMods } from '../systems/modifiers.js';
import {
  armoryState, planAutoEquip, applyAutoEquip, undoLast, undoAvailable, heroRole, roleLabel, compareItem, setPriority, moveHeroPriority, priorityOrder,
  setArmoryOption, bulkPreview, bulkApply, sellQuote, sellItems, dismantleItems, gemName, gemText, gemQuotaLeft, saveFilter, heroGainText, parseGemKey, autoSellRule, lootRules,
} from '../systems/armory.js';
import { esc, costList, resChips, rarityTag } from './components.js';

const pts = (v) => `${v >= 0 ? '+' : '−'}${(Math.round(Math.abs(v) * 10) / 10).toString().replace('.', ',')} pts`;
const heroName = (s, id) => s.heroes.find((h) => h.id === id)?.name || '?';
const itemName = (s, id) => { const it = s.inventory.items.find((i) => i.id === id); return it ? `${esc(it.name)}${it.plus ? ` +${it.plus}` : ''} <span class="muted small">(${esc(RARITIES[it.rarity].name.toLowerCase())})</span>` : '<span class="muted">vide</span>'; };

// ───────── Aperçu de l'équipement automatique ─────────
export function openAutoEquip(app, heroIds = null, title = null) {
  const plan = planAutoEquip(app.state, { heroIds });
  app.ui.aePlan = plan;
  const s = app.state;
  if (!plan.changes.length) {
    app.modal(`<h2>⚙️ ${esc(title || 'Équiper au mieux')}</h2><p>Rien à changer : ${heroIds?.length === 1 ? `${esc(heroName(s, heroIds[0]))} porte` : 'chacun porte'} déjà ce qui lui va le mieux pour son rôle.</p>
      <p class="small muted">Les objets verrouillés 🔒 et les pièces réservées 📌 ne bougent jamais. Les héros en marche gardent leur équipement.</p>
      <div class="row gap end"><button class="btn primary" data-action="close-modal">Fermer</button></div>`, {});
    return;
  }
  const rows = plan.perHero.map((p) => {
    const h = s.heroes.find((x) => x.id === p.heroId);
    const ch = plan.changes.filter((c) => c.heroId === p.heroId);
    const delta = Object.entries(p.delta).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])).slice(0, 4).map(([k, v]) => `<span class="ae-mod ${v >= 0 ? 'up' : 'down'}">${v >= 0 ? '▲' : '▼'} ${esc(fmtMod(k, v))}</span>`).join(' ');
    return `<tbody><tr class="ae-hero"><th colspan="3" scope="rowgroup">${HERO_CLASSES[h.cls].icon} ${esc(h.name)} <span class="muted small">${esc(roleLabel(heroRole(h)))}</span></th><td class="num"><b>${pts(p.gain)}</b></td></tr>
      ${ch.map((c) => `<tr><td>${SLOTS[c.slot].icon} ${esc(SLOTS[c.slot].name)}</td><td>${itemName(s, c.from)}</td><td>→ ${itemName(s, c.to)}</td><td class="num">${c.gain >= 0 ? '▲' : '▼'} ${pts(c.gain)}</td></tr>`).join('')}
      ${delta ? `<tr><td colspan="4" class="small">${delta}</td></tr>` : ''}</tbody>`;
  }).join('');
  app.modal(`<h2>⚙️ ${esc(title || (heroIds ? 'Équiper au mieux' : 'Équiper toute la troupe'))}</h2>
    <p class="small">${plan.changes.length} pièce${plan.changes.length > 1 ? 's' : ''} changée${plan.changes.length > 1 ? 's' : ''}, gain total <b>${pts(plan.total)}</b>. Un point vaut +1 % de l’effet principal du rôle (production du secteur pour un intendant ; attaque et défense pour la guerre ; récolte ; exploration et butin).</p>
    <div class="ae-table-wrap"><table class="ae-table"><thead><tr><th scope="col">Emplacement</th><th scope="col">Porté</th><th scope="col">Proposé</th><th scope="col">Gain</th></tr></thead>${rows}</table></div>
    <p class="small muted">Les objets verrouillés 🔒 et réservés 📌 ne bougent pas${armoryState(s).settings.allowSteal ? ' ; une pièce peut passer d’un héros moins prioritaire à un plus prioritaire' : ' ; aucune pièce n’est reprise à un autre héros'}. Annulable pendant ${Math.round(UNDO_MS / 60000)} min.</p>
    <div class="row gap end"><button class="btn ghost" data-action="close-modal">Annuler</button><button class="btn primary" data-action="ae-apply">Valider</button></div>`, aeActions, 'wide');
}
export const aeActions = {
  'ae-apply': (app) => {
    const plan = app.ui.aePlan;
    app.closeModal();
    app.act(() => applyAutoEquip(app.state, plan), (r) => `⚙️ ${r.n} pièce${r.n > 1 ? 's' : ''} équipée${r.n > 1 ? 's' : ''} (${pts(r.total)}) — « Annuler » reste possible ${Math.round(UNDO_MS / 60000)} min`);
    app.ui._aeLast = plan.total;
  },
};
export const undoButton = (app) => {
  const u = undoAvailable(app.state);
  if (!u) return '';
  const left = Math.max(0, u.t + UNDO_MS - Date.now());
  const what = u.kind === 'equip' ? 'le dernier équipement automatique' : u.kind2 === 'sell' ? `la vente de ${u.items.length} objet(s)` : `le démantèlement de ${u.items.length} objet(s)`;
  return `<button class="btn small ghost" data-action="armory-undo" title="Encore ${esc(fmtTime(left))}">↶ Annuler ${esc(what)}</button>`;
};
export const undoActions = {
  'armory-undo': (app) => app.act(() => undoLast(app.state), (r) => (r.kind === 'equip' ? 'Équipement d’avant rétabli' : 'Objets rendus à l’inventaire')),
};

// ───────── Priorités et options ─────────
export function armoryToolbar(app) {
  const S = armoryState(app.state).settings;
  return `<div class="armory-bar" role="group" aria-label="Équipement automatique">
    <button class="btn small primary" data-action="ae-team">⚙️ Équiper toute la troupe</button>
    <button class="btn small" data-action="ae-prio">Priorités…</button>
    <label class="small chk"><input type="checkbox" data-change="ae-opt" data-k="allowSteal" ${S.allowSteal ? 'checked' : ''}> Reprendre une pièce portée par un héros moins prioritaire</label>
    <label class="small chk"><input type="checkbox" data-change="ae-opt" data-k="autoLoot" ${S.autoLoot ? 'checked' : ''}> Équiper automatiquement le butin meilleur</label>
    ${undoButton(app)}</div>`;
}
export function openPriorities(app) {
  const s = app.state, S = armoryState(s).settings;
  const order = priorityOrder(s);
  app.modal(`<h2>Ordre de priorité des héros</h2>
    <p class="small">Le premier héros reçoit les meilleures pièces d’abord. Par défaut : les héros affectés (intendants) avant les héros libres, puis par niveau.</p>
    <div class="row gap wrap" role="radiogroup" aria-label="Règle">${[['assigned', 'Affectés d’abord'], ['level', 'Par niveau'], ['custom', 'Ordre personnalisé']].map(([k, l]) => `<button class="mini ${S.priority === k ? 'primary' : ''}" role="radio" aria-checked="${S.priority === k}" data-action="ae-prio-mode" data-k="${k}">${l}</button>`).join('')}</div>
    <ol class="prio-list">${order.map((h, i) => `<li><span>${HERO_CLASSES[h.cls].icon} ${esc(h.name)} <span class="muted small">niv. ${h.level} · ${esc(roleLabel(heroRole(h)))}</span></span>
      <span><button class="mini ghost" data-action="ae-prio-move" data-id="${h.id}" data-d="-1" ${i ? '' : 'disabled'} aria-label="Monter ${esc(h.name)}">▲</button><button class="mini ghost" data-action="ae-prio-move" data-id="${h.id}" data-d="1" ${i < order.length - 1 ? '' : 'disabled'} aria-label="Descendre ${esc(h.name)}">▼</button></span></li>`).join('')}</ol>
    <div class="row gap end"><button class="btn primary" data-action="close-modal">Fermer</button></div>`, prioActions);
}
const prioActions = {
  'ae-prio-mode': (app, el) => { setPriority(app.state, el.dataset.k); app.save(); openPriorities(app); },
  'ae-prio-move': (app, el) => { moveHeroPriority(app.state, el.dataset.id, +el.dataset.d); app.save(); openPriorities(app); },
};
export const toolbarActions = {
  'ae-team': (app) => openAutoEquip(app, null),
  'ae-prio': (app) => openPriorities(app),
  'ae-opt': (app, el) => { setArmoryOption(app.state, el.dataset.k, el.checked); app.save(); app.toast(el.dataset.k === 'autoLoot' ? (el.checked ? 'Le butin meilleur sera équipé d’office (une ligne dans le fil du royaume)' : 'Le butin reste à l’inventaire') : (el.checked ? 'Une pièce peut changer de héros selon les priorités' : 'Chaque héros garde ses pièces'), 'info'); },
  ...undoActions,
};

// ───────── Comparaison à la pièce portée (▲ / ▼ et des mots) ─────────
export function compareHtml(s, hero, item) {
  const c = compareItem(s, hero, item);
  const rows = c.rows.filter((r) => r.dir !== 'same').map((r) => `<li class="${r.dir}"><span aria-hidden="true">${r.dir === 'up' ? '▲' : '▼'}</span> ${r.dir === 'up' ? 'mieux' : 'moins bien'} : ${esc(fmtMod(r.key, r.delta))}</li>`).join('');
  return `<div class="cmp"><div class="small"><b>${c.gain > 0.05 ? '▲ Meilleur' : c.gain < -0.05 ? '▼ Moins bon' : '● Équivalent'} pour ${esc(hero.name)}</b> (${pts(c.gain)})${c.current ? ` · comparé à ${esc(c.current.name)}` : ' · emplacement vide'}</div>${rows ? `<ul class="cmp-rows small">${rows}</ul>` : ''}</div>`;
}
export const bestBadge = (s, best, it) => {
  const ids = best?.get(it.id);
  if (!ids?.length) return '';
  return `<span class="best-badge" title="Améliorerait ${esc(ids.map((id) => heroName(s, id)).join(', '))}">★ Meilleur pour ${esc(heroName(s, ids[0]))}${ids.length > 1 ? ` +${ids.length - 1}` : ''}</span>`;
};

// ───────── Châsses ─────────
export function socketsHtml(it, interactive = false, bag = {}) {
  if (!(it.sockets || []).length) return '';
  return `<div class="sockets" aria-label="Châsses">${it.sockets.map((g, i) => {
    if (g) { const p = parseGemKey(g); return `<span class="sock full gem-${p.type}" title="${esc(gemName(g))} : ${esc(gemText(g))}"><span aria-hidden="true">${GEM_TYPES[p.type].glyph}</span> ${esc(gemName(g))}${interactive ? ` <button class="mini ghost" data-action="gem-unset" data-id="${it.id}" data-i="${i}" aria-label="Dessertir ${esc(gemName(g))}">Dessertir ${costList(unsetCost(p.q))}</button>` : ''}</span>`; }
    const opts = Object.entries(bag).filter(([, n]) => n > 0);
    return `<span class="sock empty">◇ Châsse vide${interactive && opts.length ? ` <select data-change="gem-set" data-id="${it.id}" data-i="${i}" aria-label="Sertir une gemme dans la châsse ${i + 1}"><option value="">Sertir…</option>${opts.map(([k, n]) => `<option value="${k}">${esc(gemName(k))} ×${n} — ${esc(gemText(k))}</option>`).join('')}</select>` : ''}</span>`;
  }).join('')}</div>`;
}
export const setTag = (it) => (it.set && ITEM_SETS[it.set] ? `<span class="set-tag" title="Pièce d’ensemble">${ITEM_SETS[it.set].icon} ${esc(ITEM_SETS[it.set].name)}</span>` : '');

// ───────── Vente et démantèlement en masse ─────────
const BULK_PRESETS = {
  all: { label: 'Tout ce qui n’est pas protégé', filter: {} },
  commons: { label: 'Communs', filter: { maxRarity: 'common' } },
  useless: { label: 'Inutiles à tous les héros', filter: { useless: true } },
  dupes: { label: 'Doublons', filter: { duplicates: true } },
};
export function openBulk(app) {
  const s = app.state;
  const d = (app.ui.bulk ||= { kind: 'dismantle', filter: { maxRarity: 'rare' } });
  const f = d.filter;
  const mods = computeMods(s);
  const pv = bulkPreview(s, f, d.kind, Date.now(), mods);
  const kept = Object.entries(pv.kept).filter(([, n]) => n).map(([k, n]) => `${n} ${k}${n > 1 && !k.includes(' ') ? 's' : ''}`).join(', ');
  const A = armoryState(s);
  app.modal(`<h2>🧹 Vente et démantèlement en masse</h2>
    <div class="row gap wrap" role="radiogroup" aria-label="Action"><button class="mini ${d.kind === 'dismantle' ? 'primary' : ''}" role="radio" aria-checked="${d.kind === 'dismantle'}" data-action="bulk-kind" data-k="dismantle">⚒️ Démanteler à la forge (métal et matériaux)</button><button class="mini ${d.kind === 'sell' ? 'primary' : ''}" role="radio" aria-checked="${d.kind === 'sell'}" data-action="bulk-kind" data-k="sell">💎 Vendre au Joaillier (or et gemmes)</button></div>
    <div class="row gap wrap small">Préréglages : ${Object.entries(BULK_PRESETS).map(([k, p]) => `<button class="mini" data-action="bulk-preset" data-k="${k}">${esc(p.label)}</button>`).join('')}${A.filters.map((x, i) => `<button class="mini ghost" data-action="bulk-saved" data-i="${i}">★ ${esc(x.name)}</button>`).join('')}</div>
    <fieldset class="bulk-groups"><legend>Sélection groupée</legend>
      <div class="bg-row" role="group" aria-label="Raretés choisies"><span class="small">Raretés</span>${RARITY_ORDER.map((r) => `<button class="chip-t r-${r} ${(f.rarities || []).includes(r) ? 'on' : ''}" aria-pressed="${(f.rarities || []).includes(r)}" data-action="bulk-grp" data-g="rarities" data-v="${r}">${esc(RARITIES[r].name)} <i>${groupCount(s, 'rarity', r)}</i></button>`).join('')}</div>
      <div class="bg-row" role="group" aria-label="Emplacements choisis"><span class="small">Emplacements</span>${SLOT_ORDER.map((k) => `<button class="chip-t ${(f.slots || []).includes(k) ? 'on' : ''}" aria-pressed="${(f.slots || []).includes(k)}" data-action="bulk-grp" data-g="slots" data-v="${k}">${esc(SLOTS[k].name)} <i>${groupCount(s, 'slot', k)}</i></button>`).join('')}</div>
      <p class="small muted">Cochez plusieurs groupes : la sélection réunit toutes les pièces de ces raretés et de ces emplacements, sans jamais toucher aux pièces portées, verrouillées, réservées ou meilleures pour un héros.</p>
      <div class="row gap wrap"><button class="btn small" data-action="bulk-auto" ${(f.rarities || []).length || f.maxRarity ? '' : 'disabled title="Choisissez au moins une rareté"'}>Vendre automatiquement ce groupe à chaque butin</button>${autoRules(s)}</div>
    </fieldset>
    <div class="bulk-filters">
      <label>Rareté maximale <select data-change="bulk-f" data-k="maxRarity"><option value="">Toutes</option>${RARITY_ORDER.map((r) => `<option value="${r}" ${f.maxRarity === r ? 'selected' : ''}>${esc(RARITIES[r].name)}</option>`).join('')}</select></label>
      <label>Emplacement <select data-change="bulk-f" data-k="slot"><option value="">Tous</option>${SLOT_ORDER.map((k) => `<option value="${k}" ${f.slot === k ? 'selected' : ''}>${esc(SLOTS[k].name)}</option>`).join('')}</select></label>
      <label>Niveau d’objet au plus <input type="number" min="0" class="qty" value="${f.maxIlvl || ''}" placeholder="—" data-change="bulk-f" data-k="maxIlvl"></label>
      <label class="chk"><input type="checkbox" data-change="bulk-f" data-k="useless" ${f.useless ? 'checked' : ''}> Inutiles à tous les héros</label>
      <label class="chk"><input type="checkbox" data-change="bulk-f" data-k="duplicates" ${f.duplicates ? 'checked' : ''}> Doublons seulement</label>
    </div>
    <div class="bulk-sum" role="status"><b>${pv.n} objet${pv.n > 1 ? 's' : ''}</b> → ${pv.n ? resChips(pv.res) : '—'}${pv.gemsToGold ? `<div class="small">Quota du Joaillier atteint : ${pv.gemsToGold} gemme(s) payée(s) en or (${gemQuotaLeft(s)} sur ${GEM_DAILY} encore aujourd’hui).</div>` : d.kind === 'sell' ? `<div class="small muted">Gemmes : ${gemQuotaLeft(s)} sur ${GEM_DAILY} encore achetées aujourd’hui ; au-delà, payées en or.</div>` : ''}${pv.gemsBack ? `<div class="small">${pv.gemsBack} gemme(s) serties retournent à l’écrin.</div>` : ''}
      <div class="small muted">Jamais touchés : ${esc(kept || 'aucun objet protégé dans ce filtre')} (portés, verrouillés, réservés, meilleurs pour un héros).</div></div>
    ${pv.n ? `<details class="small"><summary>Voir la liste (${pv.n})</summary><ul class="bulk-list">${pv.items.slice(0, 80).map((it) => `<li>${SLOTS[it.slot].icon} ${esc(it.name)}${it.plus ? ` +${it.plus}` : ''} · ${esc(RARITIES[it.rarity].name.toLowerCase())} · niv. ${it.ilvl}</li>`).join('')}${pv.n > 80 ? `<li>… et ${pv.n - 80} autres</li>` : ''}</ul></details>` : ''}
    <div class="row gap wrap end"><button class="btn ghost small" data-action="bulk-save">★ Enregistrer ce filtre</button><button class="btn ghost" data-action="close-modal">Annuler</button><button class="btn ${d.kind === 'sell' ? 'primary' : 'danger'}" data-action="bulk-confirm" ${pv.n ? '' : 'disabled'}>${d.kind === 'sell' ? 'Vendre' : 'Démanteler'} ${pv.n} objet${pv.n > 1 ? 's' : ''}</button></div>
    <p class="small muted">Annulable pendant ${Math.round(UNDO_MS / 60000)} min, tant que ce qui a été obtenu n’est pas dépensé.</p>`, bulkActions, 'wide');
}
const groupCount = (s, k, v) => s.inventory.items.filter((it) => it[k] === v && !it.equippedBy && !it.locked).length;
const autoRules = (s) => { const n = lootRules(s).filter((o) => o.enabled && o.action.type === 'lootSell').length; return n ? `<span class="small muted">${n} règle${n > 1 ? 's' : ''} de vente automatique active${n > 1 ? 's' : ''} (Armurerie › Règles de tri)</span>` : ''; };
const bulkActions = {
  'bulk-grp': (app, el) => {
    const f = app.ui.bulk.filter, g = el.dataset.g, v = el.dataset.v;
    const set = new Set(f[g] || []);
    if (set.has(v)) set.delete(v); else set.add(v);
    f[g] = [...set];
    if (!f[g].length) delete f[g];
    if (g === 'rarities' && f.rarities) delete f.maxRarity;
    if (g === 'slots' && f.slots) delete f.slot;
    openBulk(app);
  },
  'bulk-auto': (app) => {
    const r = autoSellRule(app.state, app.ui.bulk.filter);
    if (!r.ok) return app.toast(r.reason, 'warn');
    app.save();
    app.toast(`Vente automatique : « ${r.label} ». Chaque butin de ce groupe sera vendu à son arrivée.`, 'good');
    openBulk(app);
  },
  'bulk-kind': (app, el) => { app.ui.bulk.kind = el.dataset.k; openBulk(app); },
  'bulk-preset': (app, el) => { app.ui.bulk.filter = { ...BULK_PRESETS[el.dataset.k].filter }; openBulk(app); },
  'bulk-saved': (app, el) => { app.ui.bulk.filter = { ...armoryState(app.state).filters[+el.dataset.i].filter }; openBulk(app); },
  'bulk-f': (app, el) => { const f = app.ui.bulk.filter; const k = el.dataset.k; f[k] = el.type === 'checkbox' ? el.checked : el.type === 'number' ? (+el.value || 0) : el.value; if (!f[k]) delete f[k]; openBulk(app); },
  'bulk-save': (app) => { const name = prompt('Nom du filtre', 'Mon tri'); if (name === null) return; saveFilter(app.state, name, app.ui.bulk.filter); app.save(); openBulk(app); },
  'bulk-confirm': (app) => {
    const { kind, filter } = app.ui.bulk;
    app.closeModal();
    app.act(() => bulkApply(app.state, filter, kind, Date.now(), computeMods(app.state)), (r) => `${kind === 'sell' ? '💎 Vendu' : '⚒️ Démantelé'} : ${r.n} objet${r.n > 1 ? 's' : ''} — « Annuler » possible ${Math.round(UNDO_MS / 60000)} min`);
  },
};
export function bulkSelection(app, kind) {
  const s = app.state;
  const ids = [...(app.ui.invSel || [])];
  const items = s.inventory.items.filter((it) => ids.includes(it.id));
  const ok = items.filter((it) => !it.equippedBy && !it.locked);
  const res = kind === 'sell' ? (() => { const q = sellQuote(s, ok); return { gold: q.gold, ...(q.gems ? { gems: q.gems } : {}) }; })() : null;
  app.confirm(`<h2>${kind === 'sell' ? '💎 Vendre' : '⚒️ Démanteler'} la sélection ?</h2><p>${ok.length} objet(s)${items.length > ok.length ? ` (${items.length - ok.length} porté(s) ou verrouillé(s) laissé(s) de côté)` : ''}.</p>${res ? `<p>Vous recevez : ${resChips(res)}</p>` : ''}<p class="small muted">Annulable pendant ${Math.round(UNDO_MS / 60000)} min.</p>`, kind === 'sell' ? 'Vendre' : 'Démanteler', () => {
    app.act(() => (kind === 'sell' ? sellItems : dismantleItems)(app.state, ok.map((i) => i.id), Date.now(), { manual: true, mods: computeMods(app.state) }), (r) => `${r.n} objet(s) ${kind === 'sell' ? 'vendu(s)' : 'démantelé(s)'}`);
    app.ui.invSel = [];
  }, kind !== 'sell');
}

// ───────── Gemmes : écrin, taille, fusion ─────────
export function gemsPanel(app) {
  const s = app.state, A = armoryState(s);
  return `<div class="card gems-card"><h2>💎 Écrin et taille des gemmes</h2>
    <p class="small">La boucle : <b>vendre ou démanteler</b> → minerais et <b>gemmes brutes</b> → <b>tailler et sertir</b> → héros plus forts. Les objets rares en ont 1 châsse, épiques 2, légendaires et mythiques 3. Une gemme taillée est un objet fabriqué : elle ne se produit pas en masse.</p>
    <p class="small">Tailler un éclat : ${costList(CUT_COST, s)} · Fusion : ${FUSE_N} gemmes d’une qualité → 1 de la suivante, contre de l’or. Dessertir rend la gemme intacte, contre de l’or. Vendre ou démanteler un objet serti rend toujours ses gemmes à l’écrin.</p>
    <div class="ae-table-wrap"><table class="gem-table"><caption class="sr-only">Gemmes dans l’écrin par type et qualité</caption><thead><tr><th scope="col">Gemme</th>${GEM_QUALITIES.map((q) => `<th scope="col">${esc(q.name)}</th>`).join('')}<th scope="col">Tailler</th></tr></thead><tbody>
    ${Object.entries(GEM_TYPES).map(([t, g]) => `<tr><th scope="row"><span class="gem-${t}" aria-hidden="true">${g.glyph}</span> ${esc(g.name)} <span class="muted small">${esc(g.family)}</span></th>
      ${GEM_QUALITIES.map((q, i) => { const n = A.gemBag[`${t}:${i}`] || 0; return `<td><div><b>×${n}</b><span class="small muted"> · ${t === 'amethyst' ? `+${g.mods(i)['stat.force']} à chaque caractéristique` : esc(Object.entries(g.mods(i)).map(([k, v]) => fmtMod(k, v)).join(', '))}</span></div>${i < 3 && n >= FUSE_N ? `<button class="mini" data-action="gem-fuse" data-t="${t}" data-q="${i}" aria-label="Fusionner ${FUSE_N} ${esc(g.name)} ${esc(q.name.toLowerCase())}">Fusionner ${costList(fuseCost(i))}</button>` : ''}</td>`; }).join('')}
      <td><button class="mini primary" data-action="gem-cut" data-t="${t}" aria-label="Tailler un ${esc(g.name)}">Tailler</button></td></tr>`).join('')}</tbody></table></div>
    <p class="small muted">Gemmes brutes : ${Math.floor(s.resources.gems || 0)} · le Joaillier en rachète encore ${gemQuotaLeft(s)} aujourd’hui (au plus ${GEM_DAILY} par jour, puis en or).</p></div>`;
}
