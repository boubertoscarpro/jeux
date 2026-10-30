import { speedupText } from '../../systems/speedups.js';
import { LIVE_EVENTS } from '../../data/liveEvents.js';
import { ALL_UNITS } from '../../data/units.js';
import { RESOURCES } from '../../data/resources.js';
import { fmt, fmtTime } from '../../core/util.js';
import {
  liveState, ensureCalendar, ACTIONS, TARGET_INFO, targetName, recallLive, liveTravel, eventMarches, eventTargetsByDistance, targetReward,
  objectives, claimObjective, passInfo, claimPass, leaderboard, lbRewardFor, guildInfo, claimGuild, coopProgress, claimCoop,
  lightFires, liveMarchNext, maxLiveMarches, liveTarget, setStance, dailyMissions, claimDaily, challengeInfo, claimChallenge,
} from '../../systems/liveEvents.js';
import { EVENT_STANCES } from '../../data/liveEvents.js';
import { marchMods } from '../../systems/marches.js';
import { dayKey } from '../../systems/shards.js';
import { worldShowRing, eventMarchDialog } from './world.js';
import { esc, countdown, progress, bar, resChips } from '../components.js';

const giveText = (g, cur) => {
  const def = LIVE_EVENTS[cur?.key];
  return Object.entries(g || {}).map(([k, v]) => {
    if (def && k === def.currency.key) return `${fmt(v)} ${def.currency.icon}`;
    if (k === 'res') return resChips(v);
    if (k === 'units') return Object.entries(v).map(([u, n]) => `${n} ${ALL_UNITS[u]?.icon || ''} ${esc(ALL_UNITS[u]?.name || u)}`).join(', ');
    if (k === 'chest') return `🧰 coffre ${v === 'epic' ? 'épique' : 'rare'}`;
    if (k === 'item') return `⚔️ objet ${v.min === 'legendary' ? 'légendaire' : 'épique'}+`;
    if (k === 'unique') return '✨ objet unique';
    if (k === 'specialHero') return '🦸 héros exclusif';
    if (k === 'mythicFragments') return v ? `🧩 ${v} frag. mythiques` : '';
    if (k === 'legendaryFragments') return `🧩 ${v} frag. légendaires`;
    if (k === 'relicFragments') return v ? `🧩 ${v} frag. de relique` : '';
    if (k === 'shards') return `💠 ${v} Éclat(s)`;
    if (k === 'buff') return `✨ ${esc(v.name)} (${v.h} h)`;
    if (k === 'exclusiveFromShop') return '🎁 objet exclusif de la boutique';
    if (k === 'deco') return '🗿 décoration';
    if (k === 'speedups') return speedupText(v);
    return '';
  }).filter(Boolean).join(' · ');
};
export { giveText };

function header(app, cur, def) {
  const lb = leaderboard(app.state);
  const pass = passInfo(app.state);
  return `<div class="card ev-head" style="--evc:${def.color}">
    <div class="ev-title"><span class="ev-icon">${def.icon}</span><div><h2>${esc(def.name)}</h2>
      <div class="muted small">${def.faction.icon} ${esc(def.faction.name)} — ${esc(def.faction.desc)}</div></div>
      <div class="ev-timer"><div class="muted small">Fin dans</div><b>${countdown(cur.end)}</b></div></div>
    <p class="story small">${esc(def.story)}</p>
    <div class="ev-strip">
      <div class="ev-stat"><span class="muted small">${esc(def.currency.name)}</span><b>${def.currency.icon} ${fmt(cur.wallet)}</b></div>
      <div class="ev-stat"><span class="muted small">Gagnées au total</span><b>${fmt(cur.earned)}</b></div>
      <div class="ev-stat"><span class="muted small">Classement</span><b>${lb.rank}<span class="muted small"> / ${lb.size}</span></b></div>
      <div class="ev-stat"><span class="muted small">Passe gratuite</span><b>niv. ${pass.level}/20</b>${bar(pass.progress, 1)}</div>
      <div class="ev-stat"><span class="muted small">Troupes engagées</span><b>${eventMarches(app.state).filter((m) => m.phase !== 'hold').length}/${maxLiveMarches(app.state)}</b></div>
    </div>
    <div class="small ev-special">✨ ${esc(def.special?.desc || '')}</div>
    <div class="small muted">À la fin : les ${esc(def.currency.name)} restantes sont converties (${def.currency.convert.per} → ${fmt(def.currency.convert.amount)} ${RESOURCES[def.currency.convert.res].icon}). Les objectifs et la passe non réclamés sont versés automatiquement.</div>
  </div>`;
}

function specialPanel(app, cur, def) {
  const parts = [];
  if (def.special?.hearth) parts.push(`<div class="ev-widget"><h4>🔥 Chaleur</h4>${bar(cur.warmth, 150)}<div class="small">${Math.round(cur.warmth)} / 150 — gains de monnaie ×${(1 + Math.min(150, cur.warmth) / 300).toFixed(2)}. La chaleur baisse de 2/h.</div></div>`);
  if (def.special?.waves) parts.push(`<div class="ev-widget"><h4>👻 Prochaine vague</h4><b>${countdown(cur.nextWave)}</b><div class="small">Affaiblie de ${Math.round(cur.wavesWeak * 100)} % (cryptes purgées). Vagues repoussées : ${cur.stats.waves || 0}.</div>
    <button class="btn small ${cur.fires ? 'ghost' : 'primary'}" data-action="ev-fires" ${cur.fires ? 'disabled' : ''}>${cur.fires ? '🔥 Feux sacrés allumés' : '🔥 Allumer les Feux sacrés (200 🌿)'}</button></div>`);
  if (def.special?.siege) parts.push(`<div class="ev-widget"><h4>🏰 Citadelle des Anciens</h4>${bar(cur.citadel, 100, cur.citadel < 30 ? 'bad' : '')}<div class="small">Intégrité ${cur.citadel} %. Prochain assaut : ${countdown(cur.nextAssault)}. Vos participations : ${cur.stats.assaults || 0}.</div></div>`);
  if (cur.coop) {
    const p = coopProgress(cur);
    parts.push(`<div class="ev-widget"><h4>🐉 ${esc(def.coop.name)} — boss commun</h4>${bar(1 - p, 1, 'bad')}<div class="small">${fmt(cur.coop.hp)} PV restants (${Math.round(p * 100)} % infligés au total, vous et les seigneurs rivaux IA) · vos dégâts : ${fmt(cur.coop.mine)}</div>
      <div class="ev-tiers">${def.coop.tiers.map((t, i) => { const ok = p >= t; const done = cur.coopClaimed[i]; return `<button class="mini ${ok && !done ? 'good' : ''}" data-action="ev-coop" data-i="${i}" ${!ok || done || !cur.coop.mine ? 'disabled' : ''} title="${giveText(def.coop.rewards[i], cur).replace(/<[^>]+>/g, '')}">${Math.round(t * 100)} % ${done ? '✔' : ok ? '🎁' : '🔒'}</button>`; }).join('')}</div>
      ${def.special?.tracking ? `<div class="small">Traque : ${cur.trackStep}/3 pistes suivies${cur.trackStep >= 3 ? ' — l’antre est découvert !' : ''}</div>` : ''}</div>`);
  }
  if (def.special?.zones) { const held = cur.map.targets.filter((z) => z.type === 'zone' && z.owned).length; parts.push(`<div class="ev-widget"><h4>🚩 Régions tenues</h4><b>${held}</b><div class="small">Chaque région rapporte ${def.currency.icon} toutes les heures ; contre-attaque toutes les 2 h.</div></div>`); }
  if (def.mods) parts.push(`<div class="ev-widget"><h4>❄️ Conditions</h4><div class="small">${Object.entries(def.mods).map(([k, v]) => `${esc(k)} ${v > 0 ? '+' : ''}${Math.round(v * 100)} %`).join(' · ')}</div></div>`);
  return parts.length ? `<div class="ev-widgets">${parts.join('')}</div>` : '';
}

// v25 : plus de carte d'événement : les cibles sont sur la carte du monde. Liste triée par distance à votre base la
// plus proche (capitale ou avant-poste), « Montre-moi » centre la carte du monde sur la cible et ouvre son anneau.
const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX'];
function targetsCard(app, cur, def) {
  const s = app.state, now = Date.now();
  const list = eventTargetsByDistance(s, now);
  const mods = marchMods(s, null, null, now);
  const f = app.ui.evListAll ? list : list.slice(0, 10);
  const threats = (cur.map.threats || []).filter((t) => t.kind !== 'rival');
  return `<div class="card ev-onmap"><div class="row between wrap"><h3>🗺️ Sur la carte du monde <span class="muted small">${list.length} cible(s) visibles</span></h3><button class="btn primary" data-action="ev-map">Voir sur la carte</button></div>
    <p class="small muted">Faibles près de vos terres, plus fortes et plus rentables au loin ; forteresses et chefs au plus loin. Partez de la capitale ou de l’avant-poste le plus proche.</p>
    ${threats.length ? `<div class="ev-threats">${threats.map((t) => `<div class="small bad">⚔️ ${esc(t.label)} — arrivée ${countdown(t.arrive)}</div>`).join('')}</div>` : ''}
    <table class="table ev-list"><tbody>${f.map(({ t, name, base, d, actions }) => {
      const rw = targetReward(s, t);
      const a0 = actions[0];
      return `<tr class="${t.type === 'boss' ? 'boss' : ''}"><td><span class="ev-lvl sm">${ROMAN[Math.min(9, t.tier)] || ''}</span> ${TARGET_INFO[t.type]?.icon || ''} <b>${esc(name)}</b></td>
        <td class="small muted">${esc(base.key === 'capital' ? 'capitale' : base.name)} · ${d.toFixed(0)} cases · ${fmtTime(liveTravel(s, cur, base, t.x, t.y, { spearman: 1 }, mods))}</td>
        <td class="small">${rw?.points != null ? `≈ ${fmt(rw.points)} ${def.currency.icon}` : ''}</td>
        <td class="row gap end"><button class="mini ghost" data-action="ev-show" data-x="${t.x}" data-y="${t.y}">Montre-moi</button>${a0 ? `<button class="mini ${a0 === 'attack' ? 'primary' : ''}" data-action="ev-send" data-act="${a0}" data-id="${t.id}">${esc(ACTIONS[a0].label)}</button>` : ''}</td></tr>`;
    }).join('') || '<tr><td class="muted">Aucune cible visible pour l’instant : elles réapparaissent au fil de l’événement (et les ruines cachées se découvrent en explorant).</td></tr>'}</tbody></table>
    ${list.length > 10 ? `<button class="mini ghost" data-action="ev-list-all">${app.ui.evListAll ? 'Moins' : `Toutes (${list.length})`}</button>` : ''}</div>`;
}

function marchList(app, cur) {
  const ms = eventMarches(app.state);
  if (!ms.length) return '';
  return `<div class="card"><h4>Vos troupes d’événement</h4>${ms.map((m) => {
    const t = liveTarget(app.state, m.targetId);
    const end = liveMarchNext(m);
    const phase = { out: 'En route', work: 'Au travail', back: 'Retour', hold: 'En garnison', wait: 'Attend vos ordres' }[m.phase];
    const start = m.phase === 'out' ? m.start : m.phase === 'work' ? m.workEnd - (m.workEnd - m.arrive) : m.returnAt - m.travel;
    return `<div class="q-row"><div class="q-top"><span>${ACTIONS[m.action]?.icon || '🚶'} ${t ? esc(targetName(cur, t)) : `(${m.x}, ${m.y})`} · ${phase}</span>${end < Infinity ? countdown(end) : ''}${m.phase !== 'back' ? `<button class="mini ghost" data-action="ev-recall" data-id="${m.id}">↩</button>` : ''}</div>
      <div class="muted small">${Object.values(m.units).reduce((a, b) => a + b, 0)} unités${Object.keys(m.loot).length ? ' · ' + resChips(m.loot) : ''}</div>${end < Infinity ? progress(start, end) : ''}</div>`;
  }).join('')}</div>`;
}

function planCard(app, cur, def) {
  const st = cur.stance || 'balanced';
  const changed = cur.stanceDay === dayKey(Date.now());
  const ds = dailyMissions(app.state);
  const ch = challengeInfo(app.state);
  return `<div class="cols-3">
    <div class="card"><h3>🧭 Stratégie <span class="muted small">${changed ? 'déjà changée aujourd’hui' : '1 changement par jour'}</span></h3>
      ${Object.entries(EVENT_STANCES).map(([k, x]) => `<button class="spec ${st === k ? 'active' : ''}" data-action="ev-stance" data-k="${k}" ${st === k || changed ? 'disabled' : ''}><b>${x.icon} ${esc(x.name)}</b><span class="small muted">${esc(x.desc)}</span></button>`).join('')}</div>
    <div class="card"><h3>🗓️ Missions du jour <span class="muted small">renouvelées à minuit</span></h3>
      ${ds.map((m, i) => `<div class="objective ${m.done ? 'done' : ''}"><div class="row between"><span>${m.claimed ? '✔' : m.done ? '🎁' : '◻'} ${esc(m.label)}</span><span class="muted small">${fmt(Math.min(m.value, m.target))}/${fmt(m.target)}</span></div>${bar(m.value, m.target)}
        <div class="row between small"><span>${fmt(m.reward)} ${def.currency.icon}</span>${m.done && !m.claimed ? `<button class="mini good" data-action="ev-daily" data-i="${i}">Réclamer</button>` : ''}</div></div>`).join('') || '<p class="muted small">Les missions arrivent au prochain tick.</p>'}</div>
    <div class="card"><h3>🔥 Défi héroïque</h3>${ch ? `<div class="objective ${ch.done ? 'done' : ''}"><div>${esc(ch.label)}</div>${bar(ch.value, ch.target)}<div class="small muted">${fmt(Math.min(ch.value, ch.target))}/${fmt(ch.target)}</div>
      <div class="small">🎁 10 fragments légendaires, 1 fragment de relique, titre « ${esc(ch.reward.title)} »</div>${ch.done && !ch.claimed ? '<button class="mini good" data-action="ev-challenge">Réclamer</button>' : ch.claimed ? '<span class="ok small">✔ Relevé</span>' : ''}</div>` : ''}
      <p class="small muted">Réservé aux seigneurs préparés. Récompense de participation (coffre rare + 2 insignes) dès 500 de monnaie gagnée.</p></div></div>`;
}

function objectivesCard(app, cur) {
  const obs = objectives(app.state);
  const g = guildInfo(app.state);
  return `<div class="card"><h3>🎯 Objectifs de l’événement</h3>${obs.map((o) => `<div class="objective ${o.done ? 'done' : ''}">
      <div class="row between"><span>${o.claimed ? '✔' : o.done ? '🎁' : '◻'} ${esc(o.label)}</span><span class="muted small">${fmt(Math.min(o.value, o.target))}/${fmt(o.target)}</span></div>
      ${bar(o.value, o.target)}<div class="row between small"><span>${giveText(o.reward, cur)}</span>${o.done && !o.claimed ? `<button class="mini good" data-action="ev-claim" data-id="${o.id}">Réclamer</button>` : ''}</div></div>`).join('')}
    ${g ? `<h3>🏛️ Objectif de guilde</h3><div class="objective ${g.done ? 'done' : ''}"><div class="row between"><span>${esc(g.label)}</span><span class="muted small">${fmt(Math.min(g.value, g.target))}/${fmt(g.target)}</span></div>${bar(g.value, g.target)}
      <div class="row between small"><span>Votre part : ${fmt(g.mine)} · ${giveText(g.reward, cur)}</span>${g.done && !g.claimed ? `<button class="mini good" data-action="ev-guild">Réclamer</button>` : g.claimed ? '✔' : ''}</div></div>` : '<p class="small muted">Rejoignez une guilde pour participer aux objectifs collectifs.</p>'}
  </div>`;
}

function passCard(app, cur) {
  const p = passInfo(app.state);
  return `<div class="card"><h3>🎫 Passe d’événement (gratuite)</h3><p class="small muted">Chaque ${p.per} ${esc(LIVE_EVENTS[cur.key].currency.name)} gagnées = 1 niveau. Aucune option payante.</p>
    <div class="ev-pass">${p.levels.map((l) => `<div class="ev-pass-lvl ${l.ready ? 'ready' : ''} ${l.claimed ? 'claimed' : ''}"><b>${l.level}</b><div class="small">${giveText(l.reward, cur) || '—'}</div>${l.ready && !l.claimed ? `<button class="mini good" data-action="ev-pass" data-l="${l.level}">Prendre</button>` : l.claimed ? '<span class="ok">✔</span>' : ''}</div>`).join('')}</div></div>`;
}

function lbCard(app, cur) {
  const lb = leaderboard(app.state);
  const myReward = lbRewardFor(lb.rank);
  const rw = (r) => [r.title ? `🏅 ${esc(r.title)}` : '', r.deco ? '🗿 déco exclusive' : '', r.insignia ? `${r.insignia} insignes` : '', r.res ? resChips(r.res) : ''].filter(Boolean).join(' · ');
  const row = (x) => `<tr class="${x.me ? 'me' : ''}"><td>${x.rank || lb.top.indexOf(x) + 1}</td><td>${esc(x.name)}</td><td class="num">${fmt(x.score)}</td></tr>`;
  return `<div class="card"><h3>🏆 Tableau d’honneur</h3><p class="small muted">Cendrelande est un jeu <b>solo et hors ligne</b> : les autres seigneurs de ce tableau sont des <b>rivaux IA simulés localement</b> (leur rythme est fixé au début de l’événement). Récompenses surtout cosmétiques : titres, décorations, insignes.</p>
    <table class="table ev-lb"><tbody>${lb.top.map((x, i) => row({ ...x, rank: i + 1 })).join('')}${lb.rank > 10 ? `<tr><td colspan="3" class="muted">…</td></tr>${lb.around.map(row).join('')}` : ''}</tbody></table>
    <div class="small">Votre rang actuel : <b>${lb.rank}</b>${myReward ? ` → ${rw(myReward)}` : ' → pas de récompense (top 100)'}</div>
    <details class="small"><summary>Paliers de récompense</summary>${Object.entries(lb.rewards).map(([k, r]) => `<div>Top ${k} : ${rw(r)}</div>`).join('')}</details></div>`;
}

function logCard(cur) {
  return `<div class="card"><h3>📜 Rapports</h3><div class="log">${(cur.log || []).map((l) => `<div class="log-line small ${l.win ? '' : 'log-bad'}">${esc(l.text)}</div>`).join('') || '<span class="muted small">Aucune action pour l’instant.</span>'}</div></div>`;
}

function noEvent(app) {
  const L = liveState(app.state);
  ensureCalendar(app.state);
  const next = L.calendar[0];
  const def = next && LIVE_EVENTS[next.key];
  return `<div class="card"><h2>🎪 Aucun événement en cours</h2>${def ? `<p>Prochain événement : <b>${def.icon} ${esc(def.name)}</b> ${next.start <= Date.now() ? 'commence dans quelques instants' : `dans ${countdown(next.start)}`}.</p><p class="story small">${esc(def.story)}</p>` : ''}
    <button class="btn" data-action="nav" data-view="calendar">📅 Voir le calendrier</button></div>`;
}

export default {
  id: 'event', title: 'Événement', icon: '🎪',
  badge: (app) => {
    const cur = app.state.live?.current;
    if (!cur) return 0;
    return objectives(app.state).filter((o) => o.done && !o.claimed).length + passInfo(app.state).levels.filter((l) => l.ready && !l.claimed).length + dailyMissions(app.state).filter((m) => m.done && !m.claimed).length;
  },
  render(app) {
    const s = app.state;
    const cur = liveState(s).current;
    if (!cur) return noEvent(app);
    const def = LIVE_EVENTS[cur.key];
    return `${header(app, cur, def)}${specialPanel(app, cur, def)}
      ${targetsCard(app, cur, def)}${marchList(app, cur)}
      ${planCard(app, cur, def)}
      <div class="cols-2">${objectivesCard(app, cur)}${lbCard(app, cur)}</div>
      ${passCard(app, cur)}${logCard(cur)}`;
  },
  actions: {
    'ev-send': (app, el) => eventMarchDialog(app, el.dataset.act, el.dataset.id),
    'ev-show': (app, el) => worldShowRing(app, +el.dataset.x, +el.dataset.y),
    'ev-map': (app) => { const c = app.state.world.capital; worldShowRing(app, c.x, c.y); app.ui.ring = null; },
    'ev-list-all': (app) => { app.ui.evListAll = !app.ui.evListAll; app.render(); },
    'ev-recall': (app, el) => app.act(() => recallLive(app.state, el.dataset.id), 'Troupes rappelées'),
    'ev-claim': (app, el) => app.act(() => claimObjective(app.state, el.dataset.id), (r) => `🎁 ${r.text}`),
    'ev-pass': (app, el) => app.act(() => claimPass(app.state, el.dataset.l), (r) => `🎫 ${r.text}`),
    'ev-guild': (app) => app.act(() => claimGuild(app.state), (r) => `🏛️ ${r.text}`),
    'ev-coop': (app, el) => app.act(() => claimCoop(app.state, +el.dataset.i), (r) => `🐉 ${r.text}`),
    'ev-stance': (app, el) => app.act(() => setStance(app.state, el.dataset.k), 'Stratégie adoptée pour aujourd’hui'),
    'ev-daily': (app, el) => app.act(() => claimDaily(app.state, +el.dataset.i), (r) => `🗓️ ${r.text}`),
    'ev-challenge': (app) => app.act(() => claimChallenge(app.state), (r) => `🔥 ${r.text}`),
    'ev-fires': (app) => app.act(() => lightFires(app.state), '🔥 Les Feux sacrés protègent la ville jusqu’à la prochaine vague'),
  },
};
