import { RESOURCES, RES_ORDER, isCapped } from '../data/resources.js';
import { BUILDINGS } from '../data/buildings.js';
import { UNITS, WEATHER } from '../data/units.js';
import { TECHS } from '../data/techs.js';
import { WORLD_EVENTS } from '../data/events.js';
import { EXPLORE_EVENTS } from '../data/exploration.js';
import { CONSUMABLES, SLOTS } from '../data/items.js';
import { POI_TYPES } from '../data/world.js';
import { fmt } from '../core/util.js';
import { kingdomBadge } from './creation.js';
import { trainingBattle, campaignTick } from '../systems/campaign.js';
import { reportModal } from './views/journal.js';
import { computeMods } from '../systems/modifiers.js';
import { storageCap, netRates } from '../systems/economy.js';
import { buildSlots, cancelBuild, cancelPlanned } from '../systems/construction.js';
import { cancelResearch } from '../systems/research.js';
import { cancelTrain } from '../systems/army.js';
import { cancelCraft } from '../systems/crafting.js';
import { MARCH_TYPES, recallMarch, maxMarches } from '../systems/marches.js';
import { describePending, resolveAny } from '../systems/pending.js';
import { calendar } from '../systems/chronicle.js';
import { CATASTROPHES } from '../data/seasons.js';
import { EXPEDITION_TYPES } from '../data/workers.js';
import { objectives, claimMission, claimChapter } from '../systems/campaign.js';
import { adviceList, snoozeAdvice, dismissAdvice } from '../systems/guide.js';
import { thLevel } from '../systems/city.js';
import { LIVE_EVENTS } from '../data/liveEvents.js';
import { SURPRISE_EVENTS } from '../data/liveEvents.js';
import { shardState } from '../systems/shards.js';
import { esc, countdown, progress, resChips } from './components.js';
import { upgradeCount } from './upgrades.js';
import { missionList, missionState, claimDynMission, missionsUnlocked } from '../systems/missions.js';
import { rewardText as rwText } from '../systems/rewards.js';
import { upIcon } from './art.js';
import { castleName } from '../systems/identity.js';

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
    const capR = storageCap(s, mods, r);
    const full = isCapped(r) && v >= capR * 0.98;
    const rate = net[r] || 0;
    return `<div class="res ${full ? 'full' : ''}" title="${esc(RESOURCES[r].name)} — ${esc(RESOURCES[r].uses)}${isCapped(r) ? `\nCapacité : ${fmt(capR)}` : ''}\n${rate >= 0 ? '+' : ''}${fmt(rate)}/h">
      <span class="res-icon">${RESOURCES[r].icon}</span><span class="res-val">${fmt(v)}</span>${rate ? `<span class="res-rate ${rate < 0 ? 'neg' : ''}">${rate > 0 ? '+' : ''}${fmt(rate)}/h</span>` : ''}</div>`;
  }).join('');
  const w = WEATHER[s.weather.type];
  const events = s.events.filter((e) => e.end > now).map((e) => `<span class="chip chip-event" title="${esc(WORLD_EVENTS[e.key].text)}">${WORLD_EVENTS[e.key].icon} ${esc(WORLD_EVENTS[e.key].name)} · ${countdown(e.end)}</span>`).join('');
  const buffs = s.buffs.filter((b) => b.until > now).map((b) => `<span class="chip chip-buff">✨ ${esc(b.name || 'Bonus')} · ${countdown(b.until)}</span>`).join('');
  return `
    <div class="brand" data-action="nav" data-view="kingdom" title="Royaume">
      <span class="banner" style="--banner:${s.meta.banner}"></span>
      <div><div class="brand-name">${esc(s.meta.kingdomName)}</div><div class="brand-castle" title="Château principal">🏰 ${esc(castleName(s))}</div><div class="brand-sub">${esc(s.meta.title || (s.meta.titles?.[0]) || 'Hôtel de ville niv. ' + thLevel(s))} ${kingdomBadge(s)}</div></div>
    </div>
    <div class="resbar">${res}<button class="res-more" data-action="toggle-res" title="Toutes les ressources">${app.ui.showAllRes ? '−' : '+'}</button>
      <div class="res cap" title="Capacité de l'entrepôt">📦 <span class="res-val">${fmt(cap)}</span></div></div>
    <div class="top-prestige">
      <button class="chip chip-shard" data-action="nav" data-view="g-wheel" title="Éclats Anciens (monnaie rare, jamais vendue) — ouvrir la Roue des Anciens">💠 ${fmt(shardState(s).count)}</button>
      <button class="chip chip-ticket" data-action="nav" data-view="g-wheel" title="Tickets de la Roue des Anciens">🎟️ ${shardState(s).tickets}</button>
      ${s.live?.current ? `<button class="chip chip-event" data-action="nav" data-view="event" style="--evc:${LIVE_EVENTS[s.live.current.key].color}" title="${esc(LIVE_EVENTS[s.live.current.key].name)} — ${esc(LIVE_EVENTS[s.live.current.key].currency.name)}">${LIVE_EVENTS[s.live.current.key].icon} ${LIVE_EVENTS[s.live.current.key].currency.icon} ${fmt(s.live.current.wallet)} · ${countdown(s.live.current.end)}</button>` : ''}
      ${(s.live?.surprises || []).filter((x) => x.end > now).map((x) => `<span class="chip chip-event" title="${esc(SURPRISE_EVENTS[x.key].desc)}">${SURPRISE_EVENTS[x.key].icon} ${countdown(x.end)}</span>`).join('')}
      ${(() => { const n = upgradeCount(s, mods); return `<button class="chip chip-up ${n ? 'on' : ''}" data-action="up-list" title="Améliorations réalisables maintenant (bâtiments, fortifications, avant-postes) — ouvrir la liste">${upIcon('ready')} ${n} amélioration${n > 1 ? 's' : ''}</button>`; })()}
      <button class="chip chip-bell ${(s.notifications || []).some((n) => !n.read) ? 'on' : ''}" data-action="notifs" title="Notifications">🔔${(s.notifications || []).filter((n) => !n.read).length || ''}</button>
    </div>
    <button class="res-more side-toggle" data-action="toggle-side" title="Files & objectifs">📋</button>
    <div class="top-status">
      <span class="chip" title="${esc(calendar(s, now).season.desc)}">${calendar(s, now).season.icon} An ${calendar(s, now).year} · ${esc(calendar(s, now).season.name)}</span>
      <span class="chip" title="${esc(w.note)}">${w.icon} ${esc(w.name)} · ${countdown(s.weather.until)}</span>
      ${s.catastrophe && s.catastrophe.until > now ? `<span class="chip chip-bad" title="${esc(CATASTROPHES[s.catastrophe.key].text)}">${CATASTROPHES[s.catastrophe.key].icon} ${esc(CATASTROPHES[s.catastrophe.key].name)} · ${countdown(s.catastrophe.until)}</span>` : ''}
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
    parts.push(`<section class="side-box attention"><h3>⚖️ Décisions (${s.pending.length})</h3>${s.pending.map((p) => { const d = describePending(s, p); return `<button class="btn block warn pending-btn" data-action="open-pending" data-id="${p.id}"><span>${d.icon} ${esc(d.title)}</span>${d.deadline ? countdown(d.deadline) : ''}</button>`; }).join('')}</section>`);
  }
  if (s.raids.length) {
    parts.push(`<section class="side-box danger"><h3>🚨 Raids en approche</h3>${s.raids.map((r) => `<div class="q-row"><div class="q-top"><span>${esc(r.name)}</span>${countdown(r.arrive)}</div>
      <div class="muted small">${r.seen ? Object.entries(r.army).map(([u, n]) => `${n} ${esc(UNITS[u]?.name || u)}`).join(', ') : 'Composition inconnue (Tour de garde niv. 3)'}</div></div>`).join('')}
      <div class="muted small">Gardez vos troupes en ville et renforcez la muraille.</div></section>`);
  }

  const bq = s.queues.build;
  parts.push(`<section class="side-box"><h3>🏗️ Chantiers <span class="muted">${bq.length}/${buildSlots(mods)}</span></h3>
    ${bq.map((q) => queueRow(q.kind === 'clear' ? '🧹' : BUILDINGS[q.type].icon, q.kind === 'clear' ? 'Déblaiement' : `${esc(BUILDINGS[q.type].name)} → ${q.level}`, q, 'cancel-build')).join('') || '<div class="muted small">Aucun chantier — vos ouvriers attendent !</div>'}
    ${(s.queues.planned || []).map((p) => { const type = p.type || s.city.buildings[p.bid]?.type || (p.bid || '').slice(5); return `<div class="q-row planned"><div class="q-top"><span>🗓️ ${esc(BUILDINGS[type]?.name || type)} ${p.kind === 'build' ? '(nouveau)' : '(amélioration)'}</span><button class="mini ghost" data-action="cancel-plan" data-id="${p.id}" title="Retirer du plan">✕</button></div>${p.waiting ? `<div class="muted small">En attente : ${esc(p.waiting)}</div>` : ''}</div>`; }).join('')}</section>`);

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

  const exps = (s.expeditions || []).filter((t) => t.status !== 'idle');
  if (exps.length) {
    parts.push(`<section class="side-box"><h3>🧭 Expéditions</h3>${exps.map((t) => {
      const end = t.status === 'out' ? t.arrive : t.status === 'work' ? t.workEnd : t.returnAt;
      const start = t.status === 'out' ? t.start : t.status === 'work' ? t.workStart : t.returnAt - t.travel;
      return `<div class="q-row"><div class="q-top"><span>${EXPEDITION_TYPES[t.type].icon} ${esc(t.name)}${t.repeat ? ' 🔁' : ''}</span>${countdown(end)}</div><div class="muted small">${{ out: 'En route', work: 'Au travail', back: 'Retour' }[t.status]}${t.status === 'work' && t.accum ? ` · ≈ ${Math.round(t.accum)}` : ''}</div>${progress(start, end)}</div>`;
    }).join('')}</section>`);
  }
  parts.push(adviceBox(s, now));
  parts.push(chapterBox(s, now));
  parts.push(missionBox(s, now));
  return parts.join('');
}

export function openPending(app, id) {
  const s = app.state;
  const p = s.pending.find((x) => x.id === id);
  if (!p) return;
  const d = describePending(s, p);
  app.modal(`<h2>${d.icon} ${esc(d.title)}</h2>${d.coords ? `<p class="muted">Case ${d.coords}</p>` : ''}<p class="story">${esc(d.text)}</p>
    ${d.deadline ? `<p class="muted small">Sans réponse dans ${countdown(d.deadline)}, le choix par défaut sera appliqué : « ${esc(d.choices[d.def]?.label || '')} ».</p>` : ''}
    <div class="choices">${d.choices.map((c, i) => `<button class="choice" data-action="choose" data-i="${i}"><b>${i + 1}. ${esc(c.label)}</b>${c.cost ? ` ${resChips(c.cost)}` : ''}<span class="muted small">${esc(c.hint || '')}</span></button>`).join('')}</div>`, {
    choose: (a, el) => {
      const r = resolveAny(s, id, +el.dataset.i);
      if (r.ok) {
        a.modal(`<h2>${d.icon} ${esc(d.title)}</h2><p class="story">${esc(r.text || '')}</p><button class="btn" data-action="close-modal">Continuer</button>`, {});
        a.render(); a.save();
      } else a.toast(r.reason || 'Impossible', 'bad');
    },
  });
}

export const sideActions = {
  'cancel-build': (app, el) => app.act(() => cancelBuild(app.state, el.dataset.id)),
  'cancel-plan': (app, el) => app.act(() => cancelPlanned(app.state, el.dataset.id), 'Chantier retiré du plan'),
  'cancel-research': (app, el) => app.act(() => cancelResearch(app.state, el.dataset.id)),
  'cancel-train': (app, el) => app.act(() => cancelTrain(app.state, el.dataset.id)),
  'cancel-craft': (app, el) => app.act(() => cancelCraft(app.state, el.dataset.id)),
  recall: (app, el) => app.act(() => recallMarch(app.state, el.dataset.id), 'Marche rappelée'),
  'claim-quest': (app, el) => app.act(() => claimMission(app.state, el.dataset.id), 'Récompense obtenue !'),
  'claim-chapter': (app, el) => app.act(() => claimChapter(app.state, +el.dataset.n), 'Chapitre terminé : récompense obtenue !'),
  'adv-snooze': (app, el) => app.act(() => snoozeAdvice(app.state, el.dataset.id), 'Conseil reporté de 4 h'),
  'adv-dismiss': (app, el) => app.act(() => dismissAdvice(app.state, el.dataset.id), 'Conseil ignoré'),
  'cp-training': (app) => runTraining(app),
  'dm-claim': (app, el) => app.act(() => claimDynMission(app.state, el.dataset.id), (r) => `Mission accomplie : ${r.text}`),
  // Ouvre l'écran d'une mission dynamique, avec la case ou le lieu concerné déjà sélectionné
  'dm-go': (app, el) => {
    const m = missionState(app.state).active.find((x) => x.id === el.dataset.id);
    if (!m) return;
    if (m.sel) { app.ui.citySel = m.sel; (app.ui.cityCam ||= { x: 0, y: 0, z: 1, init: false }).centerOn = m.sel; app.ui.focusUpgrade = m.kind === 'level'; }
    if (m.worldSel) { app.ui.worldSel = m.worldSel; const c = (app.ui.cam ||= { x: 0, y: 0, zoom: 1 }); c.x = m.worldSel.x + 0.5; c.y = m.worldSel.y + 0.5; c.zoom = Math.max(c.zoom, 1); }
    if (app.modalActions) app.closeModal();
    app.go(m.view || 'goals');
  },
  'open-pending': (app, el) => openPending(app, el.dataset.id),
};

// Conseiller du tableau de bord (niveau réglable : complet, réduit, désactivé)
const SEV_ICON = { bad: '🔴', warn: '🟠', next: '📖', info: '🔵', good: '🟢' };
export function adviceBox(s, now = Date.now()) {
  const level = s.meta.advice || 'full';
  if (level === 'off') return '';
  let list;
  try { list = adviceList(s, now); } catch (e) { console.error(e); list = []; }
  const shown = list.slice(0, level === 'reduced' ? 2 : 3);
  return `<section class="side-box advice-box"><h3>🧙‍♂️ Conseiller${list.length > shown.length ? ` <span class="muted small">+${list.length - shown.length}</span>` : ''}</h3>
    ${shown.map((r) => `<div class="advice sev-${r.sev}"><div class="small">${SEV_ICON[r.sev] || ''} ${esc(r.text)}</div>
      <div class="advice-foot">${r.action ? `<button class="mini" data-action="${r.action}">${r.action === 'up-list' ? 'Voir' : 'Lancer'}</button>` : r.goto ? `<button class="mini" data-action="goto" data-view="${r.goto}">Y aller</button>` : ''}
      <button class="mini ghost" data-action="adv-snooze" data-id="${esc(r.id)}" title="Masquer 4 h">⏰</button>${r.sev !== 'bad' ? `<button class="mini ghost" data-action="adv-dismiss" data-id="${esc(r.id)}" title="Ne plus afficher ce conseil">✕</button>` : ''}</div></div>`).join('') || '<div class="muted small">Rien d’urgent. Votre royaume tourne bien.</div>'}
    <button class="btn block ghost small" data-action="advisor">Analyse détaillée →</button></section>`;
}

// Chapitre en cours du parcours guidé
export function chapterBox(s, now = Date.now()) {
  const o = objectives(s, now);
  const ch = o.chapter;
  const list = o.main.slice(0, 3);
  const mission = (m) => `<div class="quest ${m.done ? 'done' : ''}">
      <div class="quest-title">${esc(m.title)} <span class="muted">${fmt(m.cur)}/${fmt(m.target)}</span></div>
      <div class="muted small">${esc(m.desc)}</div>
      <div class="quest-foot">${resChips(m.reward)}${m.done ? `<button class="mini good" data-action="claim-quest" data-id="${m.id}">Réclamer</button>` : m.action ? `<button class="mini" data-action="${m.action}">Lancer</button>` : m.view ? `<button class="mini ghost" data-action="goto" data-view="${m.view}">Y aller</button>` : ''}</div></div>`;
  return `<section class="side-box chapter-box"><h3>${ch.icon} Chapitre ${ch.n}/8 <span class="muted small">${ch.mainDone}/${ch.mainTotal}</span></h3>
    <div class="small gold-text">${esc(ch.title)}</div>
    ${list.map(mission).join('')}
    ${ch.complete && !ch.rewardClaimed ? `<div class="quest done"><div class="quest-title">🏆 Chapitre terminé</div><div class="quest-foot">${resChips(ch.reward)}<button class="mini good" data-action="claim-chapter" data-n="${ch.n}">Réclamer</button></div></div>` : ''}
    ${!list.length && !(ch.complete && !ch.rewardClaimed) ? '<div class="muted small">Parcours terminé ! Les objectifs à long terme continuent.</div>' : ''}
    <button class="btn block ghost small" data-action="nav" data-view="goals">Tous les objectifs →</button></section>`;
}

// Missions dynamiques du royaume (encart compact)
export function missionBox(s, now = Date.now()) {
  if (!missionsUnlocked(s)) return '';
  let list;
  try { list = missionList(s, now); } catch (e) { console.error(e); list = []; }
  if (!list.length) return '';
  return `<section class="side-box mission-box"><h3>🧭 Missions du royaume <span class="muted small">${list.length}/3</span></h3>
    ${list.map((m) => `<div class="quest ${m.done ? 'done' : ''}"><div class="quest-title">${m.icon} ${esc(m.title)} <span class="muted">${fmt(m.cur)}/${fmt(m.target)}</span></div>
      ${m.void ? `<div class="req small">⚠️ ${esc(m.void)}</div>` : ''}
      <div class="quest-foot"><span class="small muted">${esc(rwText(m.reward))}</span>${m.done ? `<button class="mini good" data-action="dm-claim" data-id="${m.id}">Réclamer</button>` : `<button class="mini ghost" data-action="dm-go" data-id="${m.id}">Y aller</button>`}</div></div>`).join('')}
    <button class="btn block ghost small" data-action="goto" data-view="goals" data-sel='{"goalCat":"missions"}'>Toutes les missions →</button></section>`;
}

export function runTraining(app) {
  const r = trainingBattle(app.state);
  if (!r.ok) { app.toast(r.reason, 'bad'); return; }
  campaignTick(app.state);
  reportModal(app, { t: Date.now(), title: 'Exercice d’entraînement (pertes simulées)', win: r.res.winner === 'attacker', result: r.res,
    text: `Vos recrues (${Object.values(r.units).reduce((a, b) => a + b, 0)} soldats) affrontent ${r.dummies.militia} mannequins de paille armés de bâtons. Les « pertes » ci-dessous sont simulées : vos soldats sont tous rentrés indemnes. Observez les phases (volée d’archers, mêlée), le moral et les facteurs qui ont compté.` });
  app.dirty = true;
}
