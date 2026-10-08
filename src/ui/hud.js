import { RESOURCES, RES_ORDER, isCapped } from '../data/resources.js';
import { BUILDINGS } from '../data/buildings.js';
import { UNITS, WEATHER } from '../data/units.js';
import { TECHS } from '../data/techs.js';
import { WORLD_EVENTS } from '../data/events.js';
import { EXPLORE_EVENTS } from '../data/exploration.js';
import { CONSUMABLES, SLOTS } from '../data/items.js';
import { POI_TYPES } from '../data/world.js';
import { fmt } from '../core/util.js';
import { computeMods } from '../systems/modifiers.js';
import { storageCap, netRates } from '../systems/economy.js';
import { buildSlots, cancelBuild } from '../systems/construction.js';
import { cancelResearch } from '../systems/research.js';
import { cancelTrain } from '../systems/army.js';
import { cancelCraft } from '../systems/crafting.js';
import { MARCH_TYPES, recallMarch, resolvePending, maxMarches } from '../systems/marches.js';
import { activeQuests, claimQuest } from '../systems/quests.js';
import { thLevel } from '../systems/city.js';
import { esc, countdown, progress, resChips } from './components.js';

const MAIN = ['wood', 'stone', 'iron', 'food', 'gold'];

export function renderTopbar(app) {
  const s = app.state;
  const now = Date.now();
  const mods = computeMods(s, now);
  const cap = storageCap(s, mods);
  const net = netRates(s, mods);
  const list = app.ui.showAllRes ? RES_ORDER : [...MAIN, 'bread', 'steel'];
  const res = list.map((r) => {
    const v = s.resources[r] || 0;
    const full = isCapped(r) && v >= cap * 0.98;
    const rate = net[r] || 0;
    return `<div class="res ${full ? 'full' : ''}" title="${esc(RESOURCES[r].name)} — ${esc(RESOURCES[r].uses)}${isCapped(r) ? `\nCapacité : ${fmt(cap)}` : ''}\n${rate >= 0 ? '+' : ''}${fmt(rate)}/h">
      <span class="res-icon">${RESOURCES[r].icon}</span><span class="res-val">${fmt(v)}</span>${rate ? `<span class="res-rate ${rate < 0 ? 'neg' : ''}">${rate > 0 ? '+' : ''}${fmt(rate)}/h</span>` : ''}</div>`;
  }).join('');
  const w = WEATHER[s.weather.type];
  const events = s.events.filter((e) => e.end > now).map((e) => `<span class="chip chip-event" title="${esc(WORLD_EVENTS[e.key].text)}">${WORLD_EVENTS[e.key].icon} ${esc(WORLD_EVENTS[e.key].name)} · ${countdown(e.end)}</span>`).join('');
  const buffs = s.buffs.filter((b) => b.until > now).map((b) => `<span class="chip chip-buff">✨ ${esc(b.name || 'Bonus')} · ${countdown(b.until)}</span>`).join('');
  return `
    <div class="brand" data-action="nav" data-view="kingdom" title="Royaume">
      <span class="banner" style="--banner:${s.meta.banner}"></span>
      <div><div class="brand-name">${esc(s.meta.kingdomName)}</div><div class="brand-sub">${esc(s.meta.title || (s.meta.titles?.[0]) || 'Hôtel de ville niv. ' + thLevel(s))}</div></div>
    </div>
    <div class="resbar">${res}<button class="res-more" data-action="toggle-res" title="Toutes les ressources">${app.ui.showAllRes ? '−' : '+'}</button>
      <div class="res cap" title="Capacité de l'entrepôt">📦 <span class="res-val">${fmt(cap)}</span></div></div>
    <button class="res-more side-toggle" data-action="toggle-side" title="Files & objectifs">📋</button>
    <div class="top-status">
      <span class="chip" title="${esc(w.note)}">${w.icon} ${esc(w.name)} · ${countdown(s.weather.until)}</span>
      ${s.famine ? '<span class="chip chip-bad" title="Plus de nourriture : moral −30, formation impossible">⚠️ Famine</span>' : ''}
      ${events}${buffs}
    </div>`;
}

function queueRow(icon, label, q, cancelAction) {
  return `<div class="q-row"><div class="q-top"><span>${icon} ${label}</span>${countdown(q.end)}${cancelAction ? `<button class="mini ghost" data-action="${cancelAction}" data-id="${q.id}" title="Annuler (80% remboursé)">✕</button>` : ''}</div>${progress(q.start, q.end)}</div>`;
}

export function renderSide(app) {
  const s = app.state;
  const now = Date.now();
  const mods = computeMods(s, now);
  const parts = [];

  if (s.pending.length) {
    parts.push(`<section class="side-box attention"><h3>🧭 Décisions (${s.pending.length})</h3>${s.pending.map((p) => `<button class="btn block warn" data-action="open-pending" data-id="${p.id}">${esc(EXPLORE_EVENTS[p.event].title)} (${p.x},${p.y})</button>`).join('')}</section>`);
  }
  if (s.raids.length) {
    parts.push(`<section class="side-box danger"><h3>🚨 Raids en approche</h3>${s.raids.map((r) => `<div class="q-row"><div class="q-top"><span>${esc(r.name)}</span>${countdown(r.arrive)}</div>
      <div class="muted small">${r.seen ? Object.entries(r.army).map(([u, n]) => `${n} ${esc(UNITS[u]?.name || u)}`).join(', ') : 'Composition inconnue (Tour de garde niv. 3)'}</div></div>`).join('')}
      <div class="muted small">Gardez vos troupes en ville et renforcez la muraille.</div></section>`);
  }

  const bq = s.queues.build;
  parts.push(`<section class="side-box"><h3>🏗️ Chantiers <span class="muted">${bq.length}/${buildSlots(mods)}</span></h3>
    ${bq.map((q) => queueRow(q.kind === 'clear' ? '🧹' : BUILDINGS[q.type].icon, q.kind === 'clear' ? 'Déblaiement' : `${esc(BUILDINGS[q.type].name)} → ${q.level}`, q, 'cancel-build')).join('') || '<div class="muted small">Aucun chantier — vos ouvriers attendent !</div>'}</section>`);

  const rq = s.queues.research;
  const tq = s.queues.train;
  const cq = s.queues.craft;
  if (rq.length || tq.length || cq.length) {
    parts.push(`<section class="side-box"><h3>⏳ Files</h3>
      ${rq.map((q) => queueRow('📜', esc(TECHS[q.tech].name), q, 'cancel-research')).join('')}
      ${tq.map((q) => queueRow(UNITS[q.unit].icon, `${q.count} ${esc(UNITS[q.unit].name)}`, q, 'cancel-train')).join('')}
      ${cq.map((q) => queueRow(q.kind === 'item' ? '⚒️' : '⚗️', q.kind === 'item' ? `Forge : ${esc(SLOTS[q.slot].name)}` : `${q.n} × ${esc(CONSUMABLES[q.key].name)}`, q, 'cancel-craft')).join('')}
    </section>`);
  }

  parts.push(`<section class="side-box"><h3>🐎 Marches <span class="muted">${s.marches.length}/${maxMarches(mods)}</span></h3>
    ${s.marches.map((m) => {
      const poi = s.world.pois[`${m.x},${m.y}`];
      const target = poi ? (poi.name || POI_TYPES[poi.type]?.name) : `(${m.x},${m.y})`;
      const phase = { out: 'Aller', work: 'Récolte', wait: 'En attente', back: 'Retour' }[m.phase];
      const end = m.phase === 'out' ? m.arrive : m.phase === 'work' ? m.workEnd : m.phase === 'back' ? m.returnAt : null;
      const start = m.phase === 'out' ? m.start : m.phase === 'work' ? m.workStart : m.phase === 'back' ? m.returnAt - m.travel : null;
      return `<div class="q-row"><div class="q-top"><span>${MARCH_TYPES[m.type].icon} ${esc(target)}</span>${end ? countdown(end) : '⏸'}${m.phase !== 'back' ? `<button class="mini ghost" data-action="recall" data-id="${m.id}" title="Rappeler">↩</button>` : ''}</div>
        <div class="muted small">${phase} · ${Object.values(m.units).reduce((a, b) => a + b, 0)} unités${Object.keys(m.loot).length ? ' · ' + resChips(m.loot) : ''}</div>${end ? progress(start, end) : ''}</div>`;
    }).join('') || '<div class="muted small">Aucune marche. Explorez ou récoltez depuis la Carte.</div>'}
    ${s.caravans.map((c) => `<div class="q-row"><div class="q-top"><span>🐪 ${esc(c.town)}${c.repeat ? ' 🔁' : ''}</span>${countdown(c.end)}</div>${progress(c.start, c.end)}</div>`).join('')}
  </section>`);

  const quests = activeQuests(s);
  parts.push(`<section class="side-box"><h3>📌 Objectifs</h3>${quests.map((q) => `<div class="quest ${q.done ? 'done' : ''}">
      <div class="quest-title">${esc(q.title)} <span class="muted">${fmt(q.cur)}/${fmt(q.target)}</span></div>
      <div class="muted small">${esc(q.desc)}</div>
      <div class="quest-foot">${resChips(q.reward)}${q.done ? `<button class="mini good" data-action="claim-quest" data-id="${q.id}">Réclamer</button>` : ''}</div></div>`).join('') || '<div class="muted small">Chapitre terminé ! Consultez les jalons dans Royaume.</div>'}
    <button class="btn block ghost small" data-action="nav" data-view="kingdom">Jalons & saison →</button></section>`);
  return parts.join('');
}

export function openPending(app, id) {
  const s = app.state;
  const p = s.pending.find((x) => x.id === id);
  if (!p) return;
  const ev = EXPLORE_EVENTS[p.event];
  app.modal(`<h2>🧭 ${esc(ev.title)}</h2><p class="muted">Case (${p.x}, ${p.y})</p><p class="story">${esc(ev.text)}</p>
    <div class="choices">${ev.choices.map((c, i) => `<button class="choice" data-action="choose" data-i="${i}"><b>${i + 1}. ${esc(c.label)}</b>${c.cost ? ` ${resChips(c.cost)}` : ''}<span class="muted small">${esc(c.hint || '')}</span></button>`).join('')}</div>`, {
    choose: (a, el) => {
      const r = resolvePending(s, id, +el.dataset.i);
      if (r.ok) {
        a.modal(`<h2>🧭 ${esc(ev.title)}</h2><p class="story">${esc(r.text)}</p><button class="btn" data-action="close-modal">Continuer</button>`, {});
        a.render(); a.save();
      } else a.toast(r.reason || 'Impossible', 'bad');
    },
  });
}

export const sideActions = {
  'cancel-build': (app, el) => app.act(() => cancelBuild(app.state, el.dataset.id)),
  'cancel-research': (app, el) => app.act(() => cancelResearch(app.state, el.dataset.id)),
  'cancel-train': (app, el) => app.act(() => cancelTrain(app.state, el.dataset.id)),
  'cancel-craft': (app, el) => app.act(() => cancelCraft(app.state, el.dataset.id)),
  recall: (app, el) => app.act(() => recallMarch(app.state, el.dataset.id), 'Marche rappelée'),
  'claim-quest': (app, el) => app.act(() => claimQuest(app.state, el.dataset.id), 'Récompense obtenue !'),
  'open-pending': (app, el) => openPending(app, el.dataset.id),
};
