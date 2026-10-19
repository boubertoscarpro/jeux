// v16 « Le Château » — Affichage fixe, dans les coins et sur les bords, partagé par le château, la carte du monde et
// la vue d'un avant-poste : le centre reste libre pour la carte. Mêmes positions partout ; seuls quelques boutons
// changent de sens (le globe devient « Retour au château »).
// Badges : un point = nouveauté, un chiffre = quantité, « ! » = urgence (toujours écrits, jamais la couleur seule).
import { LAYERS, layerValues, layerSummary } from '../systems/layers.js';
import { timeline, TIMELINE_HOURS } from '../systems/timeline.js';
import { inTime } from '../systems/wording.js';
import { badges, capCount } from '../systems/notices.js';
import { coatSvg } from './heraldry.js';
import { RESOURCES, RES_ORDER, isCapped } from '../data/resources.js';
import { WEATHER } from '../data/units.js';
import { LIVE_EVENTS } from '../data/liveEvents.js';
import { CASTLE_STAGES } from '../data/castle.js';
import { BUILDINGS } from '../data/buildings.js';
import { CRISES } from '../data/crises.js';
import { CATASTROPHES } from '../data/seasons.js';
import { resIcon } from './icons.js';
import { computeMods } from '../systems/modifiers.js';
import { storageCap, netRates, armyTotals } from '../systems/economy.js';
import { armyPower } from '../systems/army.js';
import { thLevel } from '../systems/city.js';
import { calendar } from '../systems/chronicle.js';
import { shardState } from '../systems/shards.js';
import { seasonInfo } from '../systems/quests.js';
import { objectives, objectivesBadge } from '../systems/campaign.js';
import { describePending } from '../systems/pending.js';
import { buildSlots } from '../systems/construction.js';
import { maxMarches } from '../systems/marches.js';
import { adviceList } from '../systems/guide.js';
import { castleName } from '../systems/identity.js';
import { fmt, fmtTime } from '../core/util.js';
import { esc, countdown, progress } from './components.js';

const MAIN = ['wood', 'stone', 'iron', 'food', 'gold'];
const PHONE_MAIN = ['wood', 'stone', 'food'];

// Badge normalisé : nombre, point (nouveauté) ou « ! » (urgence)
export function badge(v, label = '') {
  if (!v) return '';
  if (v === '!') return `<span class="hb hb-urgent" aria-label="Urgent${label ? ' : ' + esc(label) : ''}">!</span>`;
  if (v === '•') return `<span class="hb hb-dot" aria-label="Nouveau${label ? ' : ' + esc(label) : ''}">•</span>`;
  // v17 : plafonné à « 9+ » (au-delà, le nombre exact n'aide plus à décider)
  return `<span class="hb hb-num" aria-label="${v}${label ? ' ' + esc(label) : ''}">${capCount(v)}</span>`;
}
const btn = (action, icon, label, extra = '', attrs = '') => `<button class="hud-btn" data-action="${action}" ${attrs} title="${esc(label)}" aria-label="${esc(label)}">${icon}${extra}</button>`;

// ───────── Haut gauche : le seigneur et ses domaines ─────────
function topLeft(app) {
  const s = app.state, th = thLevel(s);
  const i = CASTLE_STAGES.reduce((k, st, j) => (th >= st.th ? j : k), 0);
  const cur = CASTLE_STAGES[i], next = CASTLE_STAGES[i + 1];
  const pct = next ? Math.round(((th - cur.th) / (next.th - cur.th)) * 100) : 100;
  const power = armyPower(armyTotals(s));
  const doms = Object.entries(s.territories || {});
  const cur0 = app.ui.map === 'outpost' && app.ui.outpost ? app.ui.outpost : '';
  return `<div class="hud-tl">
    <button class="hud-coat" data-action="nav" data-view="profile" title="Profil du seigneur : dynastie, titres, statistiques" aria-label="Profil du seigneur">${coatSvg(s, 40)}</button>
    <div class="hud-lord">
      <div class="hud-kname">${esc(s.meta.kingdomName)}</div>
      <div class="hud-th" title="${next ? `Prochain palier : ${esc(next.name)} (hôtel de ville ${next.th})` : 'Dernier palier atteint'}"><span>🏛️ HdV ${th} · ${esc(cur.name)}</span><span class="hud-thbar" role="progressbar" aria-label="Progression vers ${esc(next?.name || 'le dernier palier')}" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100"><i style="width:${pct}%"></i></span></div>
      <div class="hud-power" title="Puissance militaire totale">⚔️ ${fmt(power)}</div>
    </div>
    <label class="hud-domain"><span class="sr-only">Domaine affiché</span><select data-change="domain" aria-label="Choisir le domaine : château ou avant-poste">
      <option value="">🏰 ${esc(castleName(s))}</option>${doms.map(([k, t]) => `<option value="${k}" ${cur0 === k ? 'selected' : ''}>🚩 ${esc(t.name || k)} · niv. ${t.level || 1}</option>`).join('')}</select></label>
  </div>`;
}

// ───────── Haut centre : ressources ─────────
function resCell(s, r, mods, net) {
  const v = s.resources[r] || 0;
  const capped = isCapped(r);
  const capR = capped ? storageCap(s, mods, r) : 0;
  const fill = capped ? Math.min(1, v / Math.max(1, capR)) : 0;
  const rate = net[r] || 0;
  const hoursLeft = rate < 0 ? v / -rate : Infinity;
  const full = capped && fill >= 0.98, short = hoursLeft < 2;
  const toFull = capped && rate > 0 && !full ? (capR - v) / rate : null;
  const tip = `${RESOURCES[r].name} : ${fmt(v)}${capped ? ` / ${fmt(capR)}` : ''}\nProduction nette : ${rate >= 0 ? '+' : ''}${fmt(rate)} / h${toFull ? `\nEntrepôt plein dans ${fmtTime(toFull * 3600000)}` : ''}${full ? '\nEntrepôt plein : la production est perdue' : ''}${short ? (v >= 1 ? `\nVide ${inTime(hoursLeft * 3600000)}` : '\nStock déjà vide') : ''}`;
  const state = full ? `<span class="res-st" aria-label="plein">▲</span>` : short ? `<span class="res-st" aria-label="en déficit">▼</span>` : '';
  return `<div class="hres ${full ? 'full' : short ? 'short' : ''}" title="${esc(tip)}\nCliquez : pourquoi ce chiffre ?" tabindex="0" role="button" data-action="why" data-what="prod" data-arg="${r}" aria-label="${esc(tip.replace(/\n/g, ', '))}. Pourquoi ce chiffre ?">${resIcon(r, 18, RESOURCES[r].icon)}<span class="hres-v">${fmt(v)}</span>${state}${capped ? `<span class="hres-g" aria-hidden="true"><i style="width:${(fill * 100).toFixed(0)}%"></i></span>` : ''}</div>`;
}
function topCenter(app) {
  const s = app.state, mods = computeMods(s), net = netRates(s, mods);
  const more = app.ui.resMore;
  const rest = RES_ORDER.filter((r) => !MAIN.includes(r) && ((s.resources[r] || 0) >= 1 || (net[r] || 0) > 0));
  return `<div class="hud-tc">
    <div class="hres-row">${MAIN.map((r) => `<span class="${PHONE_MAIN.includes(r) ? '' : 'ph-hide'}">${resCell(s, r, mods, net)}</span>`).join('')}
      <button class="hud-more" data-action="res-more" aria-expanded="${!!more}" title="Autres ressources" aria-label="Autres ressources">${more ? '−' : '+'}</button></div>
    ${more ? `<div class="hres-pop" role="dialog" aria-label="Toutes les ressources">${[...MAIN.filter((r) => !PHONE_MAIN.includes(r)).map((r) => `<span class="ph-only">${resCell(s, r, mods, net)}</span>`), ...rest.map((r) => resCell(s, r, mods, net))].join('')}</div>` : ''}
  </div>`;
}

// ───────── Haut droite : le temps et les réglages ─────────
function topRight(app) {
  const s = app.state, now = Date.now(), cal = calendar(s, now), w = WEATHER[s.weather.type];
  const d = new Date(now), hh = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  const sh = shardState(s);
  const B = badges(s); // v17 : urgent et utile comptés, informatif signalé par un point
  return `<div class="hud-tr">
    <span class="hud-time" title="${esc(cal.season.desc)} · ${esc(w.name)} : ${esc(w.note)}">${cal.season.icon} An ${cal.year} · ${esc(cal.season.name)} · ${w.icon} ${esc(w.name)} · 🕐 ${hh}</span>
    <button class="hud-cur" data-action="nav" data-view="wheel" title="Éclats Anciens et tickets de la Roue" aria-label="Éclats Anciens : ${sh.count}, tickets : ${sh.tickets}">💠 ${fmt(sh.count)} · 🎟️ ${sh.tickets}</button>
    ${btn('notifs', '🔔', 'Notifications', B.urgent && B.bell ? badge('!', `${B.bell} à voir, dont urgent`) : B.bell ? badge(B.bell, 'à voir') : B.bellDot ? badge('•', 'informations') : '')}
    ${btn('nav', '⚙️', 'Réglages', '', 'data-view="settings"')}
    ${btn('fullscreen', '⛶', 'Plein écran')}
  </div>`;
}

// ───────── Bord droit : activités limitées dans le temps ─────────
export function activities(app) {
  const s = app.state, now = Date.now(), out = [];
  const L = s.live?.current;
  if (L && LIVE_EVENTS[L.key]) out.push({ id: 'event', icon: LIVE_EVENTS[L.key].icon, label: LIVE_EVENTS[L.key].name, end: L.end, view: 'event', badge: app.views.event?.badge?.(app) || 0 });
  const sh = shardState(s);
  if (sh.tickets > 0) out.push({ id: 'wheel', icon: '🎡', label: 'Roue des Anciens', view: 'wheel', badge: sh.tickets });
  const si = seasonInfo(s, now);
  if (si) out.push({ id: 'season', icon: '🗓️', label: si.name, end: now + si.remaining, view: 'kingdom', badge: app.views.kingdom?.badge?.(app) || 0 });
  const ch = s.challenges?.active;
  if (ch) out.push({ id: 'challenge', icon: '🏅', label: 'Défi en cours', end: ch.end || null, view: 'challenges', badge: 0 });
  for (const c of s.crises?.active || []) out.push({ id: 'crisis-' + c.id, icon: CRISES[c.type]?.icon || '🔗', label: `Crise : ${CRISES[c.type]?.name || ''}`, end: c.nextAt, view: 'omens', badge: '!' });
  const o = (s.omens?.list || []).find((x) => !x.resolved && x.kind === 'catastrophe');
  if (o) out.push({ id: 'omen', icon: '🔮', label: `Présage : ${CATASTROPHES[o.key]?.name || ''}`, end: o.at, view: 'omens', badge: '•' });
  for (const x of (s.live?.surprises || []).filter((x) => x.end > now)) out.push({ id: 'surprise-' + x.key, icon: '✨', label: 'Surprise', end: x.end, view: 'event', badge: '•' });
  return out;
}
function rightCol(app) {
  const list = activities(app);
  const shown = app.ui.actMore ? list : list.slice(0, 6);
  return `<div class="hud-r" role="region" aria-label="Activités en cours">${shown.map((a) => `<button class="hud-act" data-action="nav" data-view="${a.view}" title="${esc(a.label)}" aria-label="${esc(a.label)}"><span class="act-ic">${a.icon}</span>${a.end ? `<span class="act-t" data-end="${a.end}">${fmtTime(a.end - Date.now())}</span>` : ''}${badge(a.badge, a.label)}</button>`).join('')}
    ${list.length > 6 ? `<button class="hud-act more" data-action="act-more" title="${app.ui.actMore ? 'Réduire' : `${list.length - 6} autres activités`}" aria-label="Autres activités">${app.ui.actMore ? '−' : `+${list.length - 6}`}</button>` : ''}</div>`;
}

// ───────── Bord gauche : quêtes, conseiller, alertes ─────────
function leftCol(app) {
  const s = app.state, now = Date.now();
  let o = null; try { o = objectives(s, now); } catch { o = null; }
  const tracked = o ? [...o.main, ...o.secondary].filter((m) => !m.claimed).slice(0, 3) : [];
  const qb = objectivesBadge(s);
  let adv = 0, top = null; try { if ((s.meta.advice || 'full') !== 'off') { const l = adviceList(s, now); adv = l.filter((r) => r.sev === 'bad' || r.sev === 'warn').length; top = l.find((r) => r.sev === 'bad') || l.find((r) => r.sev === 'warn') || l[0] || null; } } catch { adv = 0; }
  const alerts = [];
  for (const r of s.raids || []) alerts.push(`<button class="hud-alert bad" data-action="nav" data-view="defense"><b>🚨 Raid : ${esc(r.name)}</b><span>arrive dans ${countdown(r.arrive)}</span></button>`);
  for (const c of s.crises?.active || []) alerts.push(`<button class="hud-alert warn" data-action="nav" data-view="omens"><b>${CRISES[c.type]?.icon || '🔗'} Crise : ${esc(CRISES[c.type]?.name || '')}</b><span>étape suivante ${countdown(c.nextAt)}</span></button>`);
  if (s.pending.length) { const d = describePending(s, s.pending[0]); alerts.push(`<button class="hud-alert" data-action="open-pending" data-id="${s.pending[0].id}"><b>⚖️ ${s.pending.length} décision${s.pending.length > 1 ? 's' : ''}</b><span>${esc(d.title)}</span></button>`); }
  // v17 : repliée par défaut sur les écrans moyens (≤ 1200 px), tant que le joueur ne l'a pas dépliée
  const collapsed = app.ui.leftCollapsed ?? (typeof innerWidth === 'number' && innerWidth <= 1200);
  return `<div class="hud-l ${collapsed ? 'collapsed' : ''}" role="region" aria-label="Quêtes et conseiller">
    <div class="hud-l-head">${btn('nav', '📜', 'Quêtes (touche Q)', badge(qb, 'à réclamer'), 'data-view="goals"')}<button class="hud-fold" data-action="left-fold" aria-expanded="${!collapsed}" title="${collapsed ? 'Déplier' : 'Replier'} la colonne" aria-label="${collapsed ? 'Déplier' : 'Replier'} la colonne">${collapsed ? '»' : '«'}</button></div>
    ${collapsed ? '' : tracked.map((m, i) => `${i === 1 ? `<details class="hud-more-q"><summary class="small">${tracked.length - 1} autre${tracked.length > 2 ? 's' : ''} quête${tracked.length > 2 ? 's' : ''}</summary>` : ''}<details class="hud-q ${m.done ? 'done' : ''} ${i === 0 ? 'lead' : ''}" ${i === 0 ? 'open' : ''}><summary><span title="${esc(m.title)}">${m.done ? '✔ ' : ''}${esc(m.title)}</span><span class="small">${m.target ? `${fmt(Math.min(m.cur || 0, m.target))}/${fmt(m.target)}` : ''}</span></summary>
      <div class="small">${esc(m.desc || '')}</div>${m.target ? `<span class="hud-qbar" role="progressbar" aria-label="Progression" aria-valuenow="${Math.min(100, Math.round(((m.cur || 0) / m.target) * 100))}" aria-valuemin="0" aria-valuemax="100"><i style="width:${Math.min(100, Math.round(((m.cur || 0) / m.target) * 100))}%"></i></span>` : ''}
      <div class="row gap">${m.done ? `<button class="mini primary" data-action="claim-quest" data-id="${esc(String(m.id))}">Réclamer</button>` : m.action ? `<button class="mini" data-action="${m.action}">Lancer</button>` : `<button class="mini" data-action="go-place" data-view="${esc(m.view || 'goals')}">Y aller</button>`}</div></details>${i === tracked.length - 1 && i >= 1 ? '</details>' : ''}`).join('')}
    ${!collapsed && o?.chapter?.complete && !o.chapter.rewardClaimed ? `<button class="hud-alert good" data-action="claim-chapter" data-n="${o.chapter.n}"><b>🏆 Chapitre terminé</b><span>Réclamer la récompense</span></button>` : ''}
    ${collapsed ? btn('advisor', '🧙', 'Conseiller du royaume', badge(adv ? '!' : 0, 'conseils importants')) : `<button class="hud-adv" data-action="advisor" title="Conseiller du royaume : tous les conseils" aria-label="Conseiller du royaume${adv ? ` : ${adv} conseils importants` : ''}"><span class="adv-pt" aria-hidden="true">🧙</span><span class="adv-tx"><b>Conseiller</b><small>${esc(top ? (top.text.length > 70 ? top.text.slice(0, 68) + '…' : top.text) : 'Le royaume se porte bien.')}</small></span>${badge(adv ? '!' : 0, 'conseils importants')}</button>`}
    ${collapsed ? (alerts.length ? `<span class="hb hb-urgent" aria-label="${alerts.length} alertes">!</span>` : '') : alerts.join('')}
  </div>`;
}

// ───────── Bas gauche : le fil du royaume (ou la mini-carte sur le monde) ─────────
function bottomLeft(app) {
  const s = app.state, now = Date.now();
  if (app.ui.map === 'world') return `<div class="hud-bl world">${btn('nav', '📜', 'Fil du royaume : ouvrir le journal', '', 'data-view="journal"')}</div>`;
  // v17 : deux lignes au plus, des 5 dernières minutes ; elles s'effacent vite
  const feed = (s.log || []).filter((l) => ['good', 'bad', 'event', 'combat'].includes(l.type) && now - (l.t || 0) < 5 * 60000).slice(0, 2);
  return `<div class="hud-bl" role="log" aria-label="Fil du royaume">${feed.map((l) => `<button class="feed-line ${l.type}" data-action="nav" data-view="journal" title="Ouvrir le journal">${esc(l.text.length > 90 ? l.text.slice(0, 88) + '…' : l.text)}</button>`).join('')}</div>`;
}

// ───────── Bas centre : files d'attente ─────────
function bottomCenter(app) {
  const s = app.state, mods = computeMods(s), now = Date.now();
  const bq = s.queues.build, slots = buildSlots(mods);
  const ms = s.marches, mm = maxMarches(mods);
  const b0 = bq[0], m0 = ms[0];
  const bname = (q) => (q.kind === 'clear' ? '🧹 Déblaiement' : `${BUILDINGS[q.type]?.icon || ''} ${BUILDINGS[q.type]?.name || ''} → ${q.level}`);
  const mEnd = (m) => (m.phase === 'out' ? m.arrive : m.phase === 'work' ? m.workEnd : m.phase === 'back' ? m.returnAt : null);
  const other = s.queues.research.length + s.queues.train.length + s.queues.craft.length;
  return `<div class="hud-bc" role="region" aria-label="Files d'attente">
    <button class="hq ${b0 ? '' : 'free'}" data-action="${b0 ? 'queues' : 'build-mode'}" title="${b0 ? 'Voir les chantiers' : 'Chantier libre : construire'}"><span class="hq-l">🔨 Chantiers ${bq.length}/${slots}</span>${b0 ? `<span class="hq-n">${esc(bname(b0))}</span><span class="hq-t" data-end="${b0.end}">${fmtTime(b0.end - now)}</span>${progress(b0.start, b0.end)}` : '<span class="hq-n">Libre : construire</span>'}</button>
    ${b0 ? `<button class="hq-sp" data-action="speedup-open" data-id="${b0.id}" title="Accélérer le chantier" aria-label="Accélérer le chantier">⏳</button>` : ''}
    <button class="hq ${m0 ? '' : 'free'}" data-action="${m0 ? 'queues' : 'nav'}" ${m0 ? '' : 'data-view="army"'} title="${m0 ? 'Voir les marches' : 'Marche libre : armée'}"><span class="hq-l">🐎 Marches ${ms.length}/${mm}</span>${m0 ? `<span class="hq-n">${esc({ out: 'Aller', work: 'Récolte', wait: 'En attente', back: 'Retour' }[m0.phase] || '')}</span>${mEnd(m0) ? `<span class="hq-t" data-end="${mEnd(m0)}">${fmtTime(mEnd(m0) - now)}</span>` : ''}` : '<span class="hq-n">Libre : armée</span>'}</button>
    ${other ? `<button class="hq small-q" data-action="queues" title="Recherches, formations et artisanat en cours">⏳ ${other}</button>` : ''}
  </div>`;
}

// ───────── v17 : calques d'information (au-dessus du zoom, sur la carte du royaume) ─────────
function layerBar(app) {
  const cur = app.ui.layer;
  if (!app.ui.layerBar && !cur) return `<div class="layer-bar closed">${btn('layer-bar', '🗺️', 'Calques d’information (production, incendie, défense, placement, zones)', '', 'aria-expanded="false"')}</div>`;
  let legend = '';
  if (cur && LAYERS[cur]) {
    let n = [0, 0, 0, 0]; try { n = layerSummary(layerValues(app.state, cur, computeMods(app.state))); } catch { /* légende sans comptes */ }
    legend = `<div class="layer-legend" role="note"><b>${LAYERS[cur].icon} ${esc(LAYERS[cur].name)}</b><span class="small">${esc(LAYERS[cur].desc)}</span><ul>${LAYERS[cur].legend.map((l, i) => `<li><i class="lay-sw lay-${i}" aria-hidden="true"></i>${esc(l)} <span class="muted">(${n[i]})</span></li>`).join('')}</ul></div>`;
  }
  return `<div class="layer-bar" role="toolbar" aria-label="Calques d’information">${legend}<div class="layer-btns">${Object.entries(LAYERS).map(([k, l]) => `<button class="hud-btn ${cur === k ? 'on' : ''}" data-action="layer" data-k="${k}" aria-pressed="${cur === k}" title="${esc(l.name)}" aria-label="Calque : ${esc(l.name)}">${l.icon}</button>`).join('')}${btn('layer', '✕', 'Fermer les calques', '', 'data-k=""')}</div></div>`;
}

// ───────── v17 : la frise du temps (sous les ressources, repliable) ─────────
function timelineBar(app) {
  const s = app.state, now = Date.now();
  if (app.ui.map === 'outpost') return '';
  let items = []; try { items = timeline(s, now); } catch { items = []; }
  const open = app.ui.timelineOpen ?? (typeof innerWidth === 'number' && innerWidth > 700);
  if (!open) return `<div class="hud-timeline closed">${btn('timeline', '⏱️', `Frise du temps : ${items.length} à venir dans les ${TIMELINE_HOURS} h`, items.length ? badge(items.length, 'à venir') : '', 'aria-expanded="false"')}</div>`;
  const span = TIMELINE_HOURS * 3600e3;
  let last = -100;
  const pts = items.slice(0, 10).map((e) => { let p = ((e.t - now) / span) * 100; if (p - last < 7) p = last + 7; last = p; return { ...e, p: Math.min(97, p) }; });
  return `<div class="hud-timeline" role="region" aria-label="Frise du temps : les ${TIMELINE_HOURS} prochaines heures">
    ${btn('timeline', '⏱️', 'Replier la frise du temps', '', 'aria-expanded="true"')}
    <div class="tl-axis"><span class="tl-now" aria-hidden="true">maintenant</span><span class="tl-end" aria-hidden="true">+${TIMELINE_HOURS} h</span>
      ${pts.length ? pts.map((e) => `<button class="tl-pt tl-${e.kind}" style="left:${e.p.toFixed(1)}%" ${e.view ? `data-action="nav" data-view="${e.view}"` : 'data-action="queues"'} title="${esc(`${inTime(e.t - now)} : ${e.text}${e.more ? ` (et ${e.more} autres)` : ''}`)}" aria-label="${esc(`${inTime(e.t - now)} : ${e.text}${e.more ? `, et ${e.more} autres` : ''}`)}"><span aria-hidden="true">${e.icon}</span></button>`).join('') : `<span class="tl-empty small">Rien dans les ${TIMELINE_HOURS} prochaines heures.</span>`}</div>
  </div>`;
}

// ───────── Bas droite : barre d'actions et globe ─────────
function bottomRight(app) {
  const s = app.state;
  const onWorld = app.ui.map === 'world' || app.ui.map === 'outpost';
  const B = badges(s);
  const guildB = app.views.guild?.badge?.(app) || 0;
  const building = app.ui.buildMode;
  return `<div class="hud-br">
    ${app.ui.map === 'city' ? layerBar(app) : ''}
    <div class="hud-zoom">${app.ui.map === 'outpost' ? '' : `${btn('hud-fit', '⤢', 'Vue d’ensemble')}${btn('hud-center', '⌖', 'Recentrer sur le château')}${btn('hud-zoom', '＋', 'Zoomer', '', 'data-z="1.25"')}${btn('hud-zoom', '－', 'Dézoomer', '', 'data-z="0.8"')}`}</div>
    <div class="hud-actions" role="toolbar" aria-label="Actions">
      <button class="hud-a ${building ? 'on' : ''}" data-action="build-mode" aria-pressed="${!!building}" title="Construire (touche B)" aria-label="Construire"><span>🔨</span><small>Construire</small></button>
      <button class="hud-a" data-action="nav" data-view="army" title="Armée (touche A)" aria-label="Armée"><span>⚔️</span><small>Armée</small></button>
      <button class="hud-a ph-hide" data-action="nav" data-view="guild" title="Guilde" aria-label="Guilde"><span>🛡️</span><small>Guilde</small>${badge(guildB, 'guilde')}</button>
      <button class="hud-a" data-action="nav" data-view="defense" title="Rapports et défense (touche R)" aria-label="Rapports"><span>✉️</span><small>Rapports</small>${B.reports ? badge(B.reports, 'défaites non lues') : B.reportsDot ? badge('•', 'rapports non lus') : ''}</button>
      <button class="hud-a" data-action="places" title="Tous les lieux (touche L)" aria-label="Lieux"><span>▦</span><small>Lieux</small></button>
      <button class="hud-globe" data-action="toggle-map" title="${onWorld ? 'Retour au château (touche M)' : 'Carte du monde (touche M)'}" aria-label="${onWorld ? 'Retour au château' : 'Monde'}"><span>${onWorld ? '🏰' : '🌍'}</span><small>${onWorld ? 'Château' : 'Monde'}</small></button>
    </div>
  </div>`;
}

// ───────── Téléphone : boutons flottants Quêtes / Activités et leurs tiroirs ─────────
function phoneFabs(app) {
  const qb = objectivesBadge(app.state);
  const n = activities(app).length;
  return `<button class="hud-fab left" data-action="drawer-q" aria-expanded="${app.ui.phoneDrawer === 'q'}" title="Quêtes et conseiller" aria-label="Quêtes et conseiller">📜${badge(qb, 'à réclamer')}</button>
    <button class="hud-fab right" data-action="drawer-a" aria-expanded="${app.ui.phoneDrawer === 'a'}" title="Activités, temps et réglages" aria-label="Activités, temps et réglages">✨${badge(n, 'activités')}</button>`;
}

export function renderHud(app) {
  const pd = app.ui.phoneDrawer;
  return `<div class="hud-top">${topLeft(app)}${topCenter(app)}${topRight(app)}</div>
    ${timelineBar(app)}
    ${leftCol(app)}${rightCol(app)}
    <div class="hud-bottom">${bottomLeft(app)}${bottomCenter(app)}${bottomRight(app)}</div>
    ${phoneFabs(app)}
    ${pd ? `<div class="hud-drawer ${pd === 'q' ? 'left' : 'right'}" role="dialog" aria-label="${pd === 'q' ? 'Quêtes' : 'Activités'}">${pd === 'q' ? leftCol({ ...app, ui: { ...app.ui, leftCollapsed: false } }) : `${topRight(app)}${rightCol({ ...app, ui: { ...app.ui, actMore: true } })}`}<button class="mini" data-action="drawer-close">Fermer</button></div>` : ''}`;
}
