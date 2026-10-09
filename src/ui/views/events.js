import { LIVE_EVENTS } from '../../data/liveEvents.js';
import { TERRAINS } from '../../data/world.js';
import { ALL_UNITS, UNITS, FORMATIONS } from '../../data/units.js';
import { RESOURCES } from '../../data/resources.js';
import { fmt, fmtTime } from '../../core/util.js';
import {
  liveState, ensureCalendar, actionsFor, ACTIONS, TARGET_INFO, targetName, isVisible, sendLive, recallLive, planLive, actionCost,
  objectives, claimObjective, passInfo, claimPass, leaderboard, lbRewardFor, guildInfo, claimGuild, coopProgress, claimCoop,
  lightFires, liveMarchNext, maxLiveMarches, liveTarget, lavaNear, scaleEnemies,
} from '../../systems/liveEvents.js';
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
      <div class="ev-stat"><span class="muted small">Troupes engagées</span><b>${liveState(app.state).marches.filter((m) => m.phase !== 'hold').length}/${maxLiveMarches(app.state)}</b></div>
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
    parts.push(`<div class="ev-widget"><h4>🐉 ${esc(def.coop.name)} — boss du serveur</h4>${bar(1 - p, 1, 'bad')}<div class="small">${fmt(cur.coop.hp)} PV restants (${Math.round(p * 100)} % infligés par le serveur) · vos dégâts : ${fmt(cur.coop.mine)}</div>
      <div class="ev-tiers">${def.coop.tiers.map((t, i) => { const ok = p >= t; const done = cur.coopClaimed[i]; return `<button class="mini ${ok && !done ? 'good' : ''}" data-action="ev-coop" data-i="${i}" ${!ok || done || !cur.coop.mine ? 'disabled' : ''} title="${giveText(def.coop.rewards[i], cur).replace(/<[^>]+>/g, '')}">${Math.round(t * 100)} % ${done ? '✔' : ok ? '🎁' : '🔒'}</button>`; }).join('')}</div>
      ${def.special?.tracking ? `<div class="small">Traque : ${cur.trackStep}/3 pistes suivies${cur.trackStep >= 3 ? ' — l’antre est découvert !' : ''}</div>` : ''}</div>`);
  }
  if (def.special?.zones) { const held = cur.map.targets.filter((z) => z.type === 'zone' && z.owned).length; parts.push(`<div class="ev-widget"><h4>🚩 Régions tenues</h4><b>${held}</b><div class="small">Chaque région rapporte ${def.currency.icon} toutes les heures ; contre-attaque toutes les 2 h.</div></div>`); }
  if (def.mods) parts.push(`<div class="ev-widget"><h4>❄️ Conditions</h4><div class="small">${Object.entries(def.mods).map(([k, v]) => `${esc(k)} ${v > 0 ? '+' : ''}${Math.round(v * 100)} %`).join(' · ')}</div></div>`);
  return parts.length ? `<div class="ev-widgets">${parts.join('')}</div>` : '';
}

function mapView(app, cur) {
  const m = cur.map;
  const sel = app.ui.evSel || {};
  const L = liveState(app.state);
  const byCell = {};
  for (const t of m.targets) if (isVisible(cur, t)) byCell[t.y * m.w + t.x] = t;
  const troops = new Set(L.marches.map((x) => x.y * m.w + x.x));
  const cells = [];
  for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) {
    const i = y * m.w + x;
    const fog = m.revealed && !m.revealed[i];
    const lava = m.lava.includes(i);
    const t = byCell[i];
    const isBase = x === m.base.x && y === m.base.y;
    const selected = (t && sel.targetId === t.id) || (!t && sel.x === x && sel.y === y);
    const col = TERRAINS[m.tiles[i]]?.color || '#444';
    cells.push(`<button class="ev-cell ${fog ? 'fog' : ''} ${lava ? 'lava' : ''} ${selected ? 'sel' : ''} ${t ? 'has-t' : ''}" style="--tc:${col}" data-action="ev-sel" data-x="${x}" data-y="${y}" ${t ? `data-id="${t.id}"` : ''} title="(${x}, ${y})${t ? ' — ' + esc(targetName(cur, t)) : ''}">${isBase ? '🏕️' : t ? `${t.type === 'zone' && t.owned ? '🚩' : TARGET_INFO[t.type]?.icon || '❔'}${t.tier && t.tier <= 7 && !['caravan', 'ship', 'treasure', 'vein', 'vent', 'hearth', 'riddle', 'trace', 'village'].includes(t.type) ? `<i>${t.tier}</i>` : ''}` : lava ? '🔥' : ''}${troops.has(i) ? '<span class="ev-troop">⚑</span>' : ''}</button>`);
  }
  return `<div class="ev-map" style="grid-template-columns:repeat(${m.w}, 1fr)">${cells.join('')}</div>
    <div class="legend small muted">🏕️ votre camp de base · ⚑ vos troupes · chiffre = niveau du camp (I à VII)${m.revealed ? ' · cases sombres : brouillard (explorez-les)' : ''}${m.lava.length ? ' · 🔥 lave (se déplace chaque heure)' : ''}</div>`;
}

function enemyList(units) {
  return Object.entries(units || {}).map(([u, n]) => `<span class="unit-chip">${ALL_UNITS[u]?.icon || ''} ${n} ${esc(ALL_UNITS[u]?.name || u)}</span>`).join('');
}

function selPanel(app, cur, def) {
  const s = app.state;
  const sel = app.ui.evSel;
  if (!sel) return '<div class="card-sub"><p class="muted">Sélectionnez une cible sur la carte : camp, caravane, trésor, boss…</p></div>';
  if (!sel.targetId) {
    const m = cur.map;
    const fog = m.revealed && !m.revealed[sel.y * m.w + sel.x];
    return `<div class="card-sub"><h3>Case (${sel.x}, ${sel.y})</h3><p class="small muted">${esc(TERRAINS[m.tiles[sel.y * m.w + sel.x]]?.name || '')}</p>${fog ? `<button class="btn primary" data-action="ev-send" data-act="explore" data-x="${sel.x}" data-y="${sel.y}">🧭 Explorer (éclaireur requis)</button>` : '<p class="small muted">Rien d’intéressant ici.</p>'}</div>`;
  }
  const t = liveTarget(s, sel.targetId);
  if (!t || !isVisible(cur, t)) return '<div class="card-sub"><p class="muted">Cette cible a disparu.</p></div>';
  const acts = actionsFor(s, t);
  const info = [];
  if (t.enemies) info.push(`<h4>Défenseurs</h4><div class="chips">${enemyList(t.enemies)}</div>`);
  if (t.type === 'caravan' || t.type === 'ship') info.push(t.spied ? `<div class="small">👁️ Cargaison : <b>${esc(t.cargo)}</b> · destination (${t.dest.x}, ${t.dest.y}) · gardes : ${enemyList(scaleEnemies(s, def, t.type, t.tier))}</div>` : `<div class="small muted">En mouvement vers l’est. Espionnez-la pour connaître sa cargaison (+50 % de butin).</div>`);
  if (t.type === 'boss') { const b = def.bosses[0]; const tier = b.tiers[cur.bossIdx]; if (tier) info.push(`<div class="small">PV : ${fmt(cur.bossHp)} / ${fmt(Math.round(tier.hp))}</div>${bar(cur.bossHp, tier.hp, 'bad')}<div class="small">Récompense du rang ${cur.bossIdx + 1} : ${giveText(tier.reward, cur)}</div><div class="small muted">Rangs : ${b.tiers.map((x, i) => `${i < cur.bossIdx ? '✔' : i === cur.bossIdx ? '▶' : '·'} ${['I', 'II', 'III', 'IV'][i]}`).join(' ')}</div>`); }
  if (t.type === 'vein') info.push(`<div class="small">Poches restantes : ${t.amount}/${t.max}. Des prospecteurs rivaux revendiquent les filons libres.</div>`);
  if (t.type === 'vent') info.push(`<div class="small">${lavaNear(cur.map, t.x, t.y) ? '<span class="bad">⚠️ La lave cerne cet évent : pertes probables.</span>' : 'Accès dégagé pour l’instant.'}${t.cooldown > Date.now() ? ` Se recharge : ${countdown(t.cooldown)}` : ''}</div>`);
  if (t.type === 'riddle' && t.sealedUntil > Date.now()) info.push(`<div class="small bad">Salle scellée encore ${countdown(t.sealedUntil)}.</div>`);
  if (t.type === 'hearth' && t.cooldown > Date.now()) info.push(`<div class="small">Le brasier brûle encore ${countdown(t.cooldown)}.</div>`);
  if (t.type === 'zone' && t.owned) info.push(`<div class="small ok">Région tenue. Prochaine contre-attaque : ${countdown(t.nextCounter)}.</div>`);
  const est = { camp: 1, port: 1, vault: 1, crypt: 1, pack: 1, zone: 1 }[t.type] ? `≈ ${fmt(50 * t.tier + 15 * t.tier * t.tier)} ${def.currency.icon}` : '';
  return `<div class="card-sub ev-sel"><h3>${TARGET_INFO[t.type]?.icon || ''} ${esc(targetName(cur, t))}</h3><div class="small muted">(${t.x}, ${t.y}) · ${esc(TERRAINS[cur.map.tiles[t.y * cur.map.w + t.x]]?.name || '')} ${est ? '· ' + est : ''}</div>
    ${info.join('')}
    <div class="ev-actions">${acts.map((a) => { const c = actionCost(t, a); return `<button class="btn ${a === 'attack' ? 'primary' : ''}" data-action="ev-send" data-act="${a}" data-id="${t.id}" title="${esc(ACTIONS[a].hint || '')}">${ACTIONS[a].icon} ${esc(ACTIONS[a].label)}${c ? ' ' + resChips(c) : ''}</button>`; }).join('') || '<span class="muted small">Aucune action possible pour le moment.</span>'}</div></div>`;
}

function marchList(app, cur) {
  const L = liveState(app.state);
  if (!L.marches.length) return '';
  return `<div class="card-sub"><h4>Vos troupes sur la carte</h4>${L.marches.map((m) => {
    const t = liveTarget(app.state, m.targetId);
    const end = liveMarchNext(m);
    const phase = { out: 'En route', work: 'Au travail', back: 'Retour', hold: 'En garnison', wait: 'Attend vos ordres' }[m.phase];
    const start = m.phase === 'out' ? m.start : m.phase === 'work' ? m.workEnd - (m.workEnd - m.arrive) : m.returnAt - m.travel;
    return `<div class="q-row"><div class="q-top"><span>${ACTIONS[m.action]?.icon || '🚶'} ${t ? esc(targetName(cur, t)) : `(${m.x}, ${m.y})`} · ${phase}</span>${end < Infinity ? countdown(end) : ''}${m.phase !== 'back' ? `<button class="mini ghost" data-action="ev-recall" data-id="${m.id}">↩</button>` : ''}</div>
      <div class="muted small">${Object.values(m.units).reduce((a, b) => a + b, 0)} unités${Object.keys(m.loot).length ? ' · ' + resChips(m.loot) : ''}</div>${end < Infinity ? progress(start, end) : ''}</div>`;
  }).join('')}</div>`;
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
  return `<div class="card"><h3>🏆 Classement</h3><p class="small muted">Récompenses surtout cosmétiques : titres, décorations, insignes. Aucune puissance n’est réservée au sommet.</p>
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

function openSend(app, opts) {
  const s = app.state;
  const cur = liveState(s).current;
  const avail = Object.entries(s.army).filter(([u, n]) => n > 0 && UNITS[u]);
  const t = opts.id ? liveTarget(s, opts.id) : null;
  const title = t ? `${ACTIONS[opts.act].icon} ${ACTIONS[opts.act].label} — ${targetName(cur, t)}` : `🧭 Explorer (${opts.x}, ${opts.y})`;
  const heroes = s.heroes.filter((h) => !h.marchId && !h.assignment);
  const peaceful = ['trade', 'deliver', 'solve', 'spy', 'track', 'explore', 'dig', 'mine', 'harvest'].includes(opts.act);
  app.modal(`<h2>${esc(title)}</h2>
    ${t?.enemies && opts.act === 'attack' ? `<h4>Défenseurs</h4><div class="chips">${enemyList(t.enemies)}</div>` : ''}
    <p class="small muted">${esc(ACTIONS[opts.act].hint || (peaceful ? 'Mission sans combat prévu.' : 'Combat : choisissez une armée adaptée (contre la cavalerie, des lanciers !).'))}</p>
    <div class="ev-pick">${avail.map(([u, n]) => `<label class="pick">${UNITS[u].icon} ${esc(UNITS[u].name)} <span class="muted small">(${n})</span><input class="qty" type="number" min="0" max="${n}" value="0" data-u="${u}" id="evq-${u}"><button class="mini" data-action="ev-all" data-u="${u}" data-n="${n}">max</button></label>`).join('') || '<p class="muted">Aucune troupe en ville.</p>'}</div>
    <div class="row gap wrap"><label>Héros <select id="ev-hero"><option value="">— Aucun —</option>${heroes.map((h) => `<option value="${h.id}">${esc(h.name)} (niv. ${h.level})</option>`).join('')}</select></label>
      <label>Formation <select id="ev-form">${Object.entries(FORMATIONS).map(([k, f]) => `<option value="${k}">${esc(f.name)}</option>`).join('')}</select></label></div>
    <div class="row gap"><button class="btn primary" data-action="ev-go">Envoyer</button><button class="btn ghost" data-action="close-modal">Annuler</button></div>`, {
    'ev-all': (a, el) => { document.getElementById('evq-' + el.dataset.u).value = el.dataset.n; },
    'ev-go': (a) => {
      const units = {};
      document.querySelectorAll('#modal-root .qty').forEach((i) => { const v = +i.value; if (v > 0) units[i.dataset.u] = v; });
      const r = sendLive(s, { action: opts.act, targetId: opts.id, x: +opts.x, y: +opts.y, units, heroId: document.getElementById('ev-hero').value || null, formation: document.getElementById('ev-form').value }, Date.now());
      if (!r.ok) return a.toast(r.reason, 'bad');
      a.closeModal();
      a.toast(`Troupes en route (${fmtTime(r.march.travel)})`, 'good');
      a.render(); a.save();
    },
  }, 'wide');
}

export default {
  id: 'event', title: 'Événement', icon: '🎪',
  badge: (app) => {
    const cur = app.state.live?.current;
    if (!cur) return 0;
    return objectives(app.state).filter((o) => o.done && !o.claimed).length + passInfo(app.state).levels.filter((l) => l.ready && !l.claimed).length;
  },
  render(app) {
    const s = app.state;
    const cur = liveState(s).current;
    if (!cur) return noEvent(app);
    const def = LIVE_EVENTS[cur.key];
    return `${header(app, cur, def)}${specialPanel(app, cur, def)}
      <div class="ev-layout"><div class="card">${mapView(app, cur)}</div><div class="ev-side">${selPanel(app, cur, def)}${marchList(app, cur)}</div></div>
      <div class="cols-2">${objectivesCard(app, cur)}${lbCard(app, cur)}</div>
      ${passCard(app, cur)}${logCard(cur)}`;
  },
  actions: {
    'ev-sel': (app, el) => { app.ui.evSel = el.dataset.id ? { targetId: el.dataset.id } : { x: +el.dataset.x, y: +el.dataset.y }; app.render(); },
    'ev-send': (app, el) => {
      if (el.dataset.act === 'withdraw') return app.act(() => sendLive(app.state, { action: 'withdraw', targetId: el.dataset.id, units: {} }), 'Garnison rappelée');
      const plan = planLive(app.state, { action: el.dataset.act, targetId: el.dataset.id, x: +el.dataset.x, y: +el.dataset.y, units: { _probe: 0 } });
      if (!plan.ok && !/Sélectionnez|éclaireur/.test(plan.reason)) return app.toast(plan.reason, 'bad');
      openSend(app, { act: el.dataset.act, id: el.dataset.id, x: el.dataset.x, y: el.dataset.y });
    },
    'ev-recall': (app, el) => app.act(() => recallLive(app.state, el.dataset.id), 'Troupes rappelées'),
    'ev-claim': (app, el) => app.act(() => claimObjective(app.state, el.dataset.id), (r) => `🎁 ${r.text}`),
    'ev-pass': (app, el) => app.act(() => claimPass(app.state, el.dataset.l), (r) => `🎫 ${r.text}`),
    'ev-guild': (app) => app.act(() => claimGuild(app.state), (r) => `🏛️ ${r.text}`),
    'ev-coop': (app, el) => app.act(() => claimCoop(app.state, +el.dataset.i), (r) => `🐉 ${r.text}`),
    'ev-fires': (app) => app.act(() => lightFires(app.state), '🔥 Les Feux sacrés protègent la ville jusqu’à la prochaine vague'),
  },
};
