import { HERO_CLASSES, STATS, SECTORS, RARITIES, xpForLevel } from '../../data/heroes.js';
import { SLOTS, SLOT_ORDER, AFFIXES } from '../../data/items.js';
import { fmt, fmtTime } from '../../core/util.js';
import { computeMods } from '../../systems/modifiers.js';
import { heroStats, heroSkills, heroMods, heroPower, equippedItems, heroMaxLevel } from '../../systems/heroes.js';
import { tavernCandidates, recruit, recruitCost, refreshTavern, REFRESH_COST, maxHeroes, assignGovernor, equipItem, unequip, dismissHero } from '../../systems/tavern.js';
import { itemMods, fmtAffix } from '../../systems/items.js';
import { levelOf } from '../../systems/city.js';
import { esc, costList, rarityTag, itemCard, bar, empty, countdown } from '../components.js';

function modsList(mods) {
  const entries = Object.entries(mods).filter(([, v]) => Math.abs(v) > 0.0001);
  if (!entries.length) return '<span class="muted small">—</span>';
  return entries.map(([k, v]) => `<div class="small">${esc(AFFIXES[k] ? fmtAffix(k, v) : `${k} ${v > 0 ? '+' : ''}${Math.abs(v) < 1 ? Math.round(v * 1000) / 10 + '%' : Math.round(v)}`)}</div>`).join('');
}

function heroCard(app, h) {
  const st = heroStats(app.state, h);
  const c = HERO_CLASSES[h.cls];
  const status = h.marchId ? '🐎 En marche' : h.assignment ? `${SECTORS[h.assignment.sector].icon} Intendant : ${SECTORS[h.assignment.sector].name}` : '🏰 Disponible';
  return `<button class="hero-card ${app.ui.heroSel === h.id ? 'selected' : ''}" data-action="hero-sel" data-id="${h.id}" style="--rc:${RARITIES[h.rarity].color}">
    <div class="hero-portrait">${c.icon}</div>
    <div class="hero-info"><b>${esc(h.name)}</b><div class="small">${esc(c.name)} · niv. ${h.level} · ${rarityTag(h.rarity)}</div>
    <div class="small muted">${status}</div>
    <div class="stat-row">${Object.entries(STATS).map(([k, s]) => `<span title="${s.name}">${s.icon}${st[k]}</span>`).join('')}</div></div></button>`;
}

function heroDetail(app, h) {
  const s = app.state;
  const st = heroStats(s, h);
  const c = HERO_CLASSES[h.cls];
  const mods = computeMods(s);
  const maxL = heroMaxLevel(mods);
  const slotFilter = app.ui.heroSlot;
  const items = s.inventory.items.filter((i) => !slotFilter || i.slot === slotFilter).sort((a, b) => (a.equippedBy ? 1 : 0) - (b.equippedBy ? 1 : 0));
  return `<div class="hero-detail">
    <div class="hero-head"><div class="hero-portrait big" style="--rc:${RARITIES[h.rarity].color}">${c.icon}</div>
      <div><h2>${esc(h.name)}</h2><div>${esc(c.name)} · ${rarityTag(h.rarity)} · puissance ${heroPower(s, h)}</div><div class="muted small">${esc(c.desc)}</div>
      <div class="small">Niveau ${h.level}/${maxL} — XP ${fmt(h.xp)} / ${fmt(xpForLevel(h.level))}</div>${bar(h.xp, xpForLevel(h.level))}</div></div>
    <div class="cols-3">
      <div class="card-sub"><h4>Caractéristiques</h4>${Object.entries(STATS).map(([k, sd]) => `<div class="stat-line"><span>${sd.icon} ${sd.name}</span><b>${st[k]}</b></div>`).join('')}
        <div class="muted small">Force → attaque · Commandement → défense & moral · Ruse → exploration & butin · Savoir → production (intendant)</div></div>
      <div class="card-sub"><h4>Compétences</h4>${heroSkills(h).map((sk) => `<div class="skill ${sk.unlocked ? '' : 'locked'}"><b>${esc(sk.name)}</b> <span class="muted small">niv. ${sk.lvl} · ${{ commander: 'en marche', governor: 'intendant', global: 'permanent' }[sk.ctx]}</span><div class="small">${esc(sk.desc)}</div></div>`).join('')}</div>
      <div class="card-sub"><h4>Affectation</h4>
        ${h.marchId ? '<p class="small">En marche : revient bientôt.</p>' : `
        <p class="small muted">Un intendant applique son <b>Savoir</b> à un secteur (+50% si c’est la spécialité de sa classe : ${SECTORS[c.sector].name}). Un héros libre peut commander une marche.</p>
        <select data-change="assign" data-id="${h.id}"><option value="">— Libre (commandant) —</option>${Object.entries(SECTORS).map(([k, sec]) => `<option value="${k}" ${h.assignment?.sector === k ? 'selected' : ''}>${sec.icon} ${sec.name}${k === c.sector ? ' ★' : ''}</option>`).join('')}</select>`}
        <h4>Bonus actuels</h4>
        <div class="small"><b>En marche :</b></div>${modsList(heroMods(s, h, 'commander'))}
        ${h.assignment ? `<div class="small"><b>Intendant :</b></div>${modsList(heroMods(s, h, 'governor'))}` : ''}
      </div>
    </div>
    <h3>Équipement</h3>
    <div class="equip-grid">${SLOT_ORDER.map((slot) => {
      const it = s.inventory.items.find((i) => i.id === h.equipment[slot]);
      return `<div class="equip-slot ${slotFilter === slot ? 'active' : ''}" data-action="slot-filter" data-slot="${slot}">
        <div class="muted small">${SLOTS[slot].icon} ${SLOTS[slot].name}</div>
        ${it ? `${itemCard(it, { compact: true })}<button class="mini ghost" data-action="unequip" data-slot="${slot}" data-id="${h.id}">Retirer</button>` : '<div class="muted small">Vide</div>'}</div>`;
    }).join('')}</div>
    <h3>Inventaire ${slotFilter ? `— ${SLOTS[slotFilter].name} <button class="mini ghost" data-action="slot-filter" data-slot="">tous</button>` : ''}</h3>
    <div class="item-grid">${items.map((it) => `<div class="item-wrap">${itemCard(it)}<button class="mini ${it.equippedBy === h.id ? 'ghost' : 'primary'}" data-action="equip" data-item="${it.id}" data-id="${h.id}" ${it.equippedBy === h.id ? 'disabled' : ''}>${it.equippedBy === h.id ? 'Équipé' : it.equippedBy ? 'Prendre' : 'Équiper'}</button></div>`).join('') || empty('Aucun objet. Explorez, nettoyez des donjons ou forgez !')}</div>
    ${s.heroes.length > 1 ? `<button class="btn ghost danger small" data-action="dismiss" data-id="${h.id}">Congédier ce héros</button>` : ''}
  </div>`;
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
      return `<div class="cand" style="--rc:${RARITIES[h.rarity].color}"><div class="hero-portrait">${c.icon}</div><b>${esc(h.name)}</b><div class="small">${esc(c.name)} · ${rarityTag(h.rarity)}</div>
        <div class="stat-row">${Object.entries(STATS).map(([k, sd]) => `<span title="${sd.name}">${sd.icon}${st[k]}</span>`).join('')}</div>
        <div class="muted small">${esc(c.desc)}</div>${costList(recruitCost(s, h), s)}<button class="btn primary small" data-action="recruit" data-id="${h.id}">Recruter</button></div>`;
    }).join('') || empty('Plus de candidats pour le moment.')}</div>
    <button class="btn ghost small" data-action="refresh-tavern">🔄 Nouveaux candidats ${costList(REFRESH_COST, s)}</button></div>`;
}

export default {
  id: 'heroes', title: 'Héros', icon: '🦸',
  render(app) {
    const s = app.state;
    if (!app.ui.heroSel || !s.heroes.find((h) => h.id === app.ui.heroSel)) app.ui.heroSel = s.heroes[0]?.id;
    const h = s.heroes.find((x) => x.id === app.ui.heroSel);
    return `<div class="heroes-layout">
      <div class="hero-list">${s.heroes.map((x) => heroCard(app, x)).join('')}</div>
      <div class="card">${h ? heroDetail(app, h) : empty('Aucun héros')}</div>
    </div>${tavernBlock(app)}`;
  },
  actions: {
    'hero-sel': (app, el) => { app.ui.heroSel = el.dataset.id; app.render(); },
    assign: (app, el) => app.act(() => assignGovernor(app.state, el.dataset.id, el.value || null), 'Affectation mise à jour'),
    'slot-filter': (app, el) => { app.ui.heroSlot = el.dataset.slot || null; app.render(); },
    equip: (app, el) => app.act(() => equipItem(app.state, el.dataset.id, el.dataset.item)),
    unequip: (app, el) => app.act(() => unequip(app.state, el.dataset.id, el.dataset.slot)),
    recruit: (app, el) => app.act(() => recruit(app.state, el.dataset.id), 'Nouveau héros recruté !'),
    'refresh-tavern': (app) => app.act(() => refreshTavern(app.state)),
    dismiss: (app, el) => { if (confirm('Congédier ce héros ? Son équipement retourne à l’inventaire.')) app.act(() => dismissHero(app.state, el.dataset.id)); },
  },
};
void fmtTime; void itemMods; void equippedItems;
