import { HERO_CLASSES, STATS, SECTORS, RARITIES, xpForLevel } from '../../data/heroes.js';
import { gameIcon } from '../icons.js';
import { SLOTS, SLOT_ORDER } from '../../data/items.js';
import { COMMAND_FOCUS, ITEM_SETS, OUTFITS_MAX } from '../../data/armory.js';
import { fmtMod } from '../../data/modLabels.js';
import { fmt } from '../../core/util.js';
import { computeMods } from '../../systems/modifiers.js';
import { heroStats, heroSkills, heroMods, heroPower, heroMaxLevel, equippedItems, setCounts } from '../../systems/heroes.js';
import { tavernCandidates, recruit, recruitCost, refreshTavern, REFRESH_COST, maxHeroes, assignGovernor, equipItem, unequip, dismissHero } from '../../systems/tavern.js';
import { levelOf } from '../../systems/city.js';
import {
  heroRole, roleLabel, roleCoefs, linearGain, setFocus, toggleReserve, saveOutfit, wearOutfit, deleteOutfit, setOutfitRole, onRoleChange, autoSocket, tavernAdvice, bestForMap,
} from '../../systems/armory.js';
import { esc, costList, rarityTag, itemCard, bar, empty, countdown } from '../components.js';
import { armoryToolbar, toolbarActions, aeActions, openAutoEquip, compareHtml, bestBadge, socketsHtml, setTag } from '../armoryUi.js';

function modsList(mods) {
  const entries = Object.entries(mods).filter(([, v]) => Math.abs(v) > 0.0001);
  if (!entries.length) return '<span class="muted small">—</span>';
  return entries.map(([k, v]) => `<div class="small">${esc(fmtMod(k, v))}</div>`).join('');
}

function heroCard(app, h) {
  const st = heroStats(app.state, h);
  const c = HERO_CLASSES[h.cls];
  const status = h.marchId ? '🐎 En marche' : roleLabel(heroRole(h));
  return `<button class="hero-card ${app.ui.heroSel === h.id ? 'selected' : ''}" data-action="hero-sel" data-id="${h.id}" style="--rc:${RARITIES[h.rarity].color}" aria-pressed="${app.ui.heroSel === h.id}">
    <div class="hero-portrait">${gameIcon('h_' + h.cls, 34, c.icon)}</div>
    <div class="hero-info"><b>${esc(h.name)}</b><div class="small">${esc(c.name)} · niv. ${h.level} · ${rarityTag(h.rarity)}</div>
    <div class="small muted">${esc(status)}</div>
    <div class="stat-row">${Object.entries(STATS).map(([k, s]) => `<span title="${s.name}">${gameIcon('t_' + k, 14, s.icon)}${st[k]}</span>`).join('')}</div></div></button>`;
}

function outfitsBlock(h) {
  const outs = h.outfits || [];
  return `<div class="card-sub outfits"><h4>👔 Tenues <span class="muted small">jusqu’à ${OUTFITS_MAX}, changées en un clic</span></h4>
    ${Array.from({ length: OUTFITS_MAX }, (_, i) => {
      const o = outs[i];
      if (!o) return `<div class="outfit"><span class="muted small">Tenue ${i + 1} : vide</span><button class="mini" data-action="of-save" data-id="${h.id}" data-i="${i}">Enregistrer la tenue portée</button></div>`;
      return `<div class="outfit"><b>${esc(o.name)}</b> <span class="muted small">${Object.values(o.items).filter(Boolean).length} pièce(s)${o.role ? ` · revêtue d’office quand il devient ${o.role === 'governor' ? 'intendant' : 'commandant'}` : ''}</span>
        <span class="row gap wrap"><button class="mini primary" data-action="of-wear" data-id="${h.id}" data-i="${i}" ${h.marchId ? 'disabled' : ''}>Revêtir</button><button class="mini" data-action="of-save" data-id="${h.id}" data-i="${i}">Remplacer</button>
        <select data-change="of-role" data-id="${h.id}" data-i="${i}" aria-label="Revêtir d’office au changement de rôle"><option value="">Pas d’automatisme</option><option value="governor" ${o.role === 'governor' ? 'selected' : ''}>quand il devient intendant</option><option value="commander" ${o.role === 'commander' ? 'selected' : ''}>quand il devient commandant</option></select>
        <button class="mini ghost danger" data-action="of-del" data-id="${h.id}" data-i="${i}" aria-label="Supprimer la tenue ${esc(o.name)}">✕</button></span></div>`;
    }).join('')}</div>`;
}

function heroDetail(app, h) {
  const s = app.state;
  const st = heroStats(s, h);
  const c = HERO_CLASSES[h.cls];
  const mods = computeMods(s);
  const maxL = heroMaxLevel(mods);
  const slotFilter = app.ui.heroSlot;
  const role = heroRole(h);
  const coefs = roleCoefs(h, role);
  const worn = equippedItems(s, h);
  const sets = setCounts(worn);
  const best = bestForMap(s);
  // Inventaire trié par gain réel pour ce héros (dans son rôle), les pièces portées par lui à la fin
  const curGain = Object.fromEntries(SLOT_ORDER.map((sl) => { const it = worn.find((x) => x.slot === sl); return [sl, it ? linearGain(it, coefs) : 0]; }));
  const all = s.inventory.items.filter((i) => (!slotFilter || i.slot === slotFilter) && i.equippedBy !== h.id)
    .map((it) => ({ it, g: linearGain(it, coefs) - curGain[it.slot] })).sort((a, b) => b.g - a.g);
  const limit = app.ui.heroInvLimit || 24;
  return `<div class="hero-detail">
    <div class="hero-head"><div class="hero-portrait big" style="--rc:${RARITIES[h.rarity].color}">${gameIcon('h_' + h.cls, 52, c.icon)}</div>
      <div><h2>${esc(h.name)}</h2><div>${esc(c.name)} · ${rarityTag(h.rarity)} · puissance ${heroPower(s, h)}</div><div class="muted small">${esc(c.desc)}</div>
      <div class="small">Niveau ${h.level}/${maxL} — XP ${fmt(h.xp)} / ${fmt(xpForLevel(h.level))}</div>${bar(h.xp, xpForLevel(h.level))}</div></div>
    <div class="row gap wrap"><button class="btn small primary" data-action="ae-hero" data-id="${h.id}" ${h.marchId ? 'disabled' : ''}>⚙️ Équiper au mieux</button><button class="btn small" data-action="ae-socket" data-id="${h.id}" ${h.marchId ? 'disabled' : ''}>💎 Sertir au mieux</button><span class="small muted">Rôle évalué : <b>${esc(roleLabel(role))}</b></span></div>
    <div class="cols-3">
      <div class="card-sub"><h4>Caractéristiques</h4>${Object.entries(STATS).map(([k, sd]) => `<div class="stat-line"><span>${gameIcon('t_' + k, 16, sd.icon)} ${sd.name}</span><b>${st[k]}</b></div>`).join('')}
        <div class="muted small">Force → attaque · Commandement → défense & moral · Ruse → exploration & butin · Savoir → production (intendant)</div></div>
      <div class="card-sub"><h4>Compétences</h4>${heroSkills(h).map((sk) => `<div class="skill ${sk.unlocked ? '' : 'locked'}"><b>${esc(sk.name)}</b> <span class="muted small">niv. ${sk.lvl} · ${{ commander: 'en marche', governor: 'intendant', global: 'permanent' }[sk.ctx]}${sk.unlocked ? '' : ' · 🔒 pas encore'}</span><div class="small">${esc(sk.desc)}</div></div>`).join('')}</div>
      <div class="card-sub"><h4>Affectation</h4>
        ${h.marchId ? '<p class="small">En marche : revient bientôt.</p>' : `
        <p class="small muted">Un intendant applique son <b>Savoir</b> à un secteur (+50 % si c’est la spécialité de sa classe : ${SECTORS[c.sector].name}). Un héros libre commande les marches ; sa vocation dit ce qu’on attend de son équipement.</p>
        <label class="small">Affectation <select data-change="assign" data-id="${h.id}"><option value="">— Libre (commandant) —</option>${Object.entries(SECTORS).map(([k, sec]) => `<option value="${k}" ${h.assignment?.sector === k ? 'selected' : ''}>${sec.icon} ${sec.name}${k === c.sector ? ' ★' : ''}</option>`).join('')}</select></label>
        ${!h.assignment ? `<label class="small">Vocation <select data-change="focus" data-id="${h.id}">${Object.entries(COMMAND_FOCUS).map(([k, f]) => `<option value="${k}" ${role.focus === k ? 'selected' : ''}>${f.icon} ${esc(f.name)} — ${esc(f.desc)}</option>`).join('')}</select></label>` : ''}`}
        <h4>Bonus actuels</h4>
        <div class="small"><b>En marche :</b></div>${modsList(heroMods(s, h, 'commander'))}
        ${h.assignment ? `<div class="small"><b>Intendant :</b></div>${modsList(heroMods(s, h, 'governor'))}` : ''}
        ${Object.keys(sets).length ? `<h4>Ensembles</h4>${Object.entries(sets).map(([k, n]) => `<div class="small">${ITEM_SETS[k].icon} <b>${esc(ITEM_SETS[k].name)}</b> : ${n} pièce(s) — ${[2, 4].map((t) => `${n >= t ? '✔' : '·'} ${t} pièces : ${Object.entries(ITEM_SETS[k].bonus[t].mods).map(([mk, v]) => esc(fmtMod(mk, v))).join(', ')}`).join(' ; ')}</div>`).join('')}` : ''}
      </div>
    </div>
    <h3>Équipement</h3>
    <div class="equip-grid">${SLOT_ORDER.map((slot) => {
      const it = s.inventory.items.find((i) => i.id === h.equipment[slot]);
      return `<div class="equip-slot ${slotFilter === slot ? 'active' : ''}" data-slot="${slot}">
        <button class="mini ghost slot-btn" data-action="slot-filter" data-slot="${slot}" aria-pressed="${slotFilter === slot}">${SLOTS[slot].icon} ${SLOTS[slot].name}</button>
        ${it ? `${itemCard(it, { compact: true })}${setTag(it)}${socketsHtml(it)}<div class="row gap wrap"><button class="mini ghost" data-action="unequip" data-slot="${slot}" data-id="${h.id}" ${it.reservedFor === h.id || it.locked ? 'disabled' : ''}>Retirer</button>
          <button class="mini ${it.reservedFor === h.id ? 'primary' : 'ghost'}" data-action="reserve" data-item="${it.id}" aria-pressed="${it.reservedFor === h.id}" title="Une pièce réservée reste à ce héros : l’équipement automatique et le tri ne la touchent jamais">📌 ${it.reservedFor === h.id ? 'Réservée' : 'Réserver'}</button></div>` : '<div class="muted small">Vide</div>'}</div>`;
    }).join('')}</div>
    ${outfitsBlock(h)}
    <h3>Inventaire pour ${esc(h.name)} ${slotFilter ? `— ${SLOTS[slotFilter].name} <button class="mini ghost" data-action="slot-filter" data-slot="">tous</button>` : ''} <span class="muted small">trié par gain dans son rôle ; survol ou focus : comparaison à la pièce portée</span></h3>
    <div class="item-grid">${all.slice(0, limit).map(({ it, g }) => `<div class="item-wrap">${itemCard(it)}${setTag(it)}${bestBadge(s, best, it)}<span class="gain-tag ${g > 0.05 ? 'up' : g < -0.05 ? 'down' : ''}">${g > 0.05 ? '▲ meilleur' : g < -0.05 ? '▼ moins bon' : '● équivalent'}</span>
      ${compareHtml(s, h, it)}
      <button class="mini ${g > 0.05 ? 'primary' : ''}" data-action="equip" data-item="${it.id}" data-id="${h.id}" ${it.locked || h.marchId || (it.reservedFor && it.reservedFor !== h.id) ? 'disabled' : ''}>${it.equippedBy ? `Prendre à ${esc(s.heroes.find((x) => x.id === it.equippedBy)?.name || '?')}` : 'Équiper'}</button></div>`).join('') || empty('Aucun objet. Explorez, nettoyez des donjons ou forgez !')}
      ${all.length > limit ? `<button class="btn small" data-action="hero-inv-more">Afficher ${Math.min(24, all.length - limit)} de plus (${all.length - limit} restants)</button>` : ''}</div>
    ${s.heroes.length > 1 ? `<button class="btn ghost danger small" data-action="dismiss" data-id="${h.id}">Congédier ce héros</button>` : ''}
  </div>`;
}

function adviceBlock(app) {
  const s = app.state;
  const adv = tavernAdvice(s);
  return `<div class="card"><h2>💡 Conseils de la taverne</h2>
    <p class="small muted">Pour chaque héros, la meilleure place d’intendant (un héros par secteur, autant d’intendants qu’aujourd’hui), chiffrée par l’effet principal du secteur. Rien n’est changé sans votre accord.</p>
    ${adv.length ? `<ul class="advice-list">${adv.map((a, i) => `<li><span>${esc(a.text)}</span><button class="mini primary" data-action="adv-apply" data-i="${i}">Appliquer</button></li>`).join('')}</ul><button class="btn small" data-action="adv-all">Tout appliquer</button>` : '<p class="small">Vos intendants sont déjà aux meilleures places.</p>'}</div>`;
}

function tavernBlock(app) {
  const s = app.state;
  const lvl = levelOf(s, 'tavern');
  if (!lvl) return `<div class="card"><h3>🍺 Taverne</h3><p class="muted">Construisez une Taverne pour recruter des héros. Son niveau améliore la rareté des recrues.</p></div>`;
  const cands = tavernCandidates(s);
  const max = maxHeroes(s);
  return `<div class="card"><h3>🍺 Taverne (niv. ${lvl}) <span class="muted small">— héros ${s.heroes.length}/${max} · nouveaux candidats dans ${countdown(s.tavern.next)}</span></h3>
    <div class="cand-grid">${cands.map((h) => {
      const st = heroStats(s, h);
      const c = HERO_CLASSES[h.cls];
      return `<div class="cand" style="--rc:${RARITIES[h.rarity].color}"><div class="hero-portrait">${gameIcon('h_' + h.cls, 34, c.icon)}</div><b>${esc(h.name)}</b><div class="small">${esc(c.name)} · ${rarityTag(h.rarity)}</div>
        <div class="stat-row">${Object.entries(STATS).map(([k, sd]) => `<span title="${sd.name}">${gameIcon('t_' + k, 14, sd.icon)}${st[k]}</span>`).join('')}</div>
        <div class="muted small">${esc(c.desc)}</div>${costList(recruitCost(s, h), s)}<button class="btn primary small" data-action="recruit" data-id="${h.id}">Recruter</button></div>`;
    }).join('') || empty('Plus de candidats pour le moment.')}</div>
    <button class="btn ghost small" data-action="refresh-tavern">🔄 Nouveaux candidats ${costList(REFRESH_COST, s)}</button></div>`;
}

// Changement d'affectation : tenue marquée revêtue d'office, sinon proposition d'équipement adapté au nouveau rôle
function afterRoleChange(app, heroId) {
  const r = onRoleChange(app.state, heroId);
  if (!r) return;
  if (r.outfit) { app.toast(`👔 Tenue « ${r.outfit} » revêtue pour le nouveau rôle${r.skipped?.length ? ` (manquent : ${r.skipped.join(', ')})` : ''}`, 'good'); app.render(); return; }
  if (r.plan) openAutoEquip(app, [heroId], 'Équipement adapté au nouveau rôle');
}

export default {
  id: 'heroes', title: 'Héros', icon: '🦸',
  render(app) {
    const s = app.state;
    if (!app.ui.heroSel || !s.heroes.find((h) => h.id === app.ui.heroSel)) app.ui.heroSel = s.heroes[0]?.id;
    const h = s.heroes.find((x) => x.id === app.ui.heroSel);
    const tab = app.ui.heroTab || 'heroes';
    return `${armoryToolbar(app)}
      <div class="tabs" role="tablist"><button class="tab ${tab === 'heroes' ? 'active' : ''}" role="tab" aria-selected="${tab === 'heroes'}" data-action="hero-tab" data-k="heroes">🦸 Héros</button><button class="tab ${tab === 'advice' ? 'active' : ''}" role="tab" aria-selected="${tab === 'advice'}" data-action="hero-tab" data-k="advice">💡 Conseils</button></div>
      ${tab === 'advice' ? adviceBlock(app) : `<div class="heroes-layout">
      <div class="hero-list">${s.heroes.map((x) => heroCard(app, x)).join('')}</div>
      <div class="card">${h ? heroDetail(app, h) : empty('Aucun héros')}</div>
    </div>`}${tavernBlock(app)}`;
  },
  actions: {
    ...toolbarActions,
    ...aeActions,
    'hero-tab': (app, el) => { app.ui.heroTab = el.dataset.k; app.render(); },
    'hero-sel': (app, el) => { app.ui.heroSel = el.dataset.id; app.ui.heroInvLimit = 24; app.render(); },
    'hero-inv-more': (app) => { app.ui.heroInvLimit = (app.ui.heroInvLimit || 24) + 24; app.render(); },
    assign: (app, el) => { const r = app.act(() => assignGovernor(app.state, el.dataset.id, el.value || null), 'Affectation mise à jour'); if (r?.ok) afterRoleChange(app, el.dataset.id); },
    focus: (app, el) => { const r = app.act(() => setFocus(app.state, el.dataset.id, el.value), 'Vocation mise à jour'); if (r?.ok) afterRoleChange(app, el.dataset.id); },
    'slot-filter': (app, el) => { app.ui.heroSlot = el.dataset.slot || null; app.render(); },
    equip: (app, el) => app.act(() => equipItem(app.state, el.dataset.id, el.dataset.item)),
    unequip: (app, el) => app.act(() => unequip(app.state, el.dataset.id, el.dataset.slot)),
    reserve: (app, el) => app.act(() => toggleReserve(app.state, el.dataset.item), (r) => (r.reserved ? '📌 Pièce réservée à ce héros' : 'Réservation levée')),
    'ae-hero': (app, el) => openAutoEquip(app, [el.dataset.id]),
    'ae-socket': (app, el) => app.act(() => autoSocket(app.state, el.dataset.id), (r) => `💎 ${r.n} gemme(s) sertie(s)`),
    'of-save': (app, el) => { const h = app.state.heroes.find((x) => x.id === el.dataset.id); const cur = h?.outfits?.[+el.dataset.i]; const name = prompt('Nom de la tenue', cur?.name || ['Guerre', 'Intendance', 'Exploration'][+el.dataset.i] || 'Tenue'); if (name === null) return; app.act(() => saveOutfit(app.state, el.dataset.id, +el.dataset.i, name, cur?.role || null), '👔 Tenue enregistrée'); },
    'of-wear': (app, el) => app.act(() => wearOutfit(app.state, el.dataset.id, +el.dataset.i), (r) => `👔 Tenue revêtue${r.skipped.length ? ` (manquent : ${r.skipped.join(', ')})` : ''}`),
    'of-role': (app, el) => app.act(() => setOutfitRole(app.state, el.dataset.id, +el.dataset.i, el.value || null), 'Tenue mise à jour'),
    'of-del': (app, el) => app.act(() => deleteOutfit(app.state, el.dataset.id, +el.dataset.i), 'Tenue supprimée'),
    'adv-apply': (app, el) => { const a = tavernAdvice(app.state)[+el.dataset.i]; if (!a) return; const r = app.act(() => assignGovernor(app.state, a.heroId, a.to), 'Affectation appliquée'); if (r?.ok) afterRoleChange(app, a.heroId); },
    'adv-all': (app) => app.act(() => { const list = tavernAdvice(app.state); for (const a of list) assignGovernor(app.state, a.heroId, a.to); return { ok: true, n: list.length }; }, (r) => `${r.n} affectation(s) appliquée(s) — pensez à « Équiper toute la troupe »`),
    recruit: (app, el) => app.act(() => recruit(app.state, el.dataset.id), 'Nouveau héros recruté !'),
    'refresh-tavern': (app) => app.act(() => refreshTavern(app.state)),
    dismiss: (app, el) => { if (confirm('Congédier ce héros ? Son équipement retourne à l’inventaire.')) app.act(() => dismissHero(app.state, el.dataset.id)); },
  },
};
