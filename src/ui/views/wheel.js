import { WHEEL_REWARDS, WHEEL_TIERS, TIER_ORDER, PITY_ORDER } from '../../data/shards.js';
import { ARTIFACTS } from '../../data/artifacts.js';
import { fmt } from '../../core/util.js';
import { wheelCfg, shardCfg } from '../../systems/config.js';
import {
  shardState, spin, freeTicketAt, claimFreeTicket, spendShards, currentWheelSeason, tierPool, craftMythic, craftLegendary, craftRelic,
} from '../../systems/shards.js';
import { esc, countdown, bar } from '../components.js';

// ---------- Sons (WebAudio, coupables) ----------
let actx = null;
const muted = () => { try { return localStorage.getItem('cendrelande_mute') === '1'; } catch { return false; } };
function audio() {
  if (muted()) return null;
  try { actx ||= new (window.AudioContext || window.webkitAudioContext)(); return actx; } catch { return null; }
}
function note(freq, at, dur, type = 'triangle', vol = 0.06) {
  const a = audio();
  if (!a) return;
  const o = a.createOscillator(), g = a.createGain();
  o.type = type; o.frequency.value = freq;
  g.gain.setValueAtTime(vol, a.currentTime + at);
  g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + at + dur);
  o.connect(g).connect(a.destination);
  o.start(a.currentTime + at); o.stop(a.currentTime + at + dur + 0.05);
}
function spinSounds(T, ticks = 36) {
  // Cliquetis qui ralentit avec la roue (courbe « ease-out » cubique)
  for (let i = 1; i <= ticks; i++) note(900 + (i % 2) * 120, T * (1 - Math.cbrt(1 - i / ticks)), 0.03, 'square', 0.025);
}
const FANFARE = {
  common: [[523, 0]], rare: [[523, 0], [659, 0.12]], epic: [[523, 0], [659, 0.1], [784, 0.2]],
  legendary: [[523, 0], [659, 0.1], [784, 0.2], [1047, 0.32], [1319, 0.5]],
  mythic: [[392, 0], [523, 0.12], [659, 0.24], [784, 0.36], [1047, 0.5], [1319, 0.64], [1568, 0.8], [2093, 1.0]],
};
function fanfare(tier) { for (const [f, t] of FANFARE[tier]) note(f, t, tier === 'mythic' ? 0.9 : 0.5, 'triangle', 0.07); }

// ---------- Géométrie de la roue (proportions RÉELLES des probabilités) ----------
function segments(state) {
  const p = wheelCfg(state).probs;
  let acc = 0;
  return TIER_ORDER.map((t) => { const a = acc * 360; acc += p[t]; return { tier: t, from: a, to: acc * 360 }; });
}
function gradient(state) {
  return `conic-gradient(${segments(state).map((s) => `${WHEEL_TIERS[s.tier].color} ${s.from}deg ${s.to}deg`).join(', ')})`;
}

function rewardLine(r) { return `<div class="wh-rw">${r.icon} ${esc(r.label)}${r.exclusive ? ' <span class="tag-ex">Exclusif Roue</span>' : ''}${r.season ? ` <span class="muted small">(saison ${r.season})</span>` : ''}</div>`; }

export default {
  id: 'wheel', title: 'Roue des Anciens', icon: '🎡',
  badge: (app) => (Date.now() >= freeTicketAt(app.state) ? 1 : 0) + (shardState(app.state).tickets > 0 ? 1 : 0),
  render(app) {
    const s = app.state;
    const sh = shardState(s);
    const wc = wheelCfg(s);
    const sc = shardCfg(s);
    const season = currentWheelSeason(s);
    const seasonEnd = (s.meta.created || Date.now()) + season * wc.seasonDays * 86400000;
    const free = freeTicketAt(s);
    const angle = app.ui.wheelAngle || 0;
    const fast = app.ui.wheelFast;
    return `<div class="wh-layout">
      <div class="card wh-main">
        <div class="wh-top"><div class="wh-count"><span title="Éclats Anciens">💠 <b>${fmt(sh.count)}</b> Éclats</span><span title="Tickets">🎟️ <b>${sh.tickets}</b> ticket(s)</span></div>
          <div class="row gap"><button class="mini" data-action="wh-mute">${muted() ? '🔇 Son coupé' : '🔊 Son'}</button><button class="mini" data-action="wh-fast">${fast ? '⏩ Animation courte' : '🎞️ Animation complète'}</button></div></div>
        <div class="wh-stage"><div class="wh-pointer">▼</div>
          <div class="wh-disc" style="background:${gradient(s)}; transform: rotate(${angle}deg)"><div class="wh-hub">🎡</div></div></div>
        <div class="row gap center"><button class="btn primary big" data-action="wh-spin" ${sh.tickets < 1 || app.ui.spinning ? 'disabled' : ''}>🎟️ Tourner la Roue (1 ticket)</button>
          <button class="btn" data-action="wh-ticket" ${sh.count < sc.ticketCost ? 'disabled' : ''}>💠 ${sc.ticketCost} → 🎟️ 1 ticket</button></div>
        <div class="small center">${Date.now() >= free ? '<button class="btn good small" data-action="wh-free">🎁 Ticket hebdomadaire gratuit disponible !</button>' : `Prochain ticket gratuit dans ${countdown(free)}`}</div>
        <p class="small muted center">La taille des secteurs correspond exactement aux probabilités. Aucun « presque gagné » truqué : le résultat est tiré avant l’animation, qui ne fait que le montrer.</p>
      </div>
      <div class="card wh-info"><h3>🎲 Probabilités (transparentes)</h3>
        <table class="table"><tbody>${TIER_ORDER.map((t) => `<tr><td><span class="dot" style="background:${WHEEL_TIERS[t].color}"></span> ${WHEEL_TIERS[t].name}</td><td class="num">${(wc.probs[t] * 100).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} %</td></tr>`).join('')}</tbody></table>
        <h3>🛡️ Garanties (pitié)</h3>
        ${PITY_ORDER.map((t) => `<div class="small"><span class="dot" style="background:${WHEEL_TIERS[t].color}"></span> ${WHEEL_TIERS[t].name} garanti au plus tard au tour ${wc.pity[t]} — <b>${sh.pity[t]}/${wc.pity[t]}</b> (encore ${Math.max(1, wc.pity[t] - sh.pity[t])})</div>${bar(sh.pity[t], wc.pity[t])}`).join('')}
        <p class="small muted">Chaque tour donne aussi ${wc.fragmentsPerSpin[0]}–${wc.fragmentsPerSpin[1]} fragment(s) mythique(s). Doublons convertis en fragments.</p>
      </div></div>
    <div class="cols-2">
      <div class="card"><h3>🧩 Fragments & fabrication</h3>
        <div class="small">Fragments mythiques : <b>${sh.mythicFragments}/${wc.mythicCraft}</b></div>${bar(sh.mythicFragments, wc.mythicCraft)}
        <div class="row gap wrap">${tierPool(s, 'mythic').map((r) => `<button class="mini ${sh.mythicFragments >= wc.mythicCraft ? 'good' : ''}" data-action="wh-craft-m" data-id="${r.id}" ${sh.mythicFragments < wc.mythicCraft ? 'disabled' : ''}>${r.icon} ${esc(r.label)}</button>`).join('')}</div>
        <div class="small">Fragments légendaires : <b>${sh.legendaryFragments}/${wc.legendaryCraft}</b></div>${bar(sh.legendaryFragments, wc.legendaryCraft)}
        <div class="row gap wrap">${WHEEL_REWARDS.legendary.map((r) => `<button class="mini" data-action="wh-craft-l" data-id="${r.id}" ${sh.legendaryFragments < wc.legendaryCraft ? 'disabled' : ''}>${r.icon} ${esc(r.label)}</button>`).join('')}</div>
        <div class="small">Fragments de relique : <b>${sh.relicFragments}/3</b></div>
        <div class="row gap"><select id="wh-relic">${Object.entries(ARTIFACTS).filter(([k]) => !s.artifacts?.[k] && k !== 'ancientEye').map(([k, a]) => `<option value="${k}">${a.icon || '🏺'} ${esc(a.name)}</option>`).join('')}</select><button class="mini" data-action="wh-relic" ${sh.relicFragments < 3 ? 'disabled' : ''}>Reconstituer</button></div>
      </div>
      <div class="card"><h3>🗓️ Saison ${season} de la Roue</h3><p class="small">Fin de saison dans ${countdown(seasonEnd)}. Certaines exclusivités ne reviendront <b>jamais</b> après leur saison.</p>
        ${TIER_ORDER.slice().reverse().map((t) => `<details ${t === 'mythic' ? 'open' : ''}><summary style="color:${WHEEL_TIERS[t].color}">${WHEEL_TIERS[t].name}</summary>${tierPool(s, t).map(rewardLine).join('')}${t === 'mythic' ? `<div class="wh-rw">👑 JACKPOT ANCESTRAL <span class="muted small">(${Math.round(wc.jackpotShare * 100)} % des résultats mythiques — déclenche une Fête ancestrale et une Grande Foire)</span></div>` : ''}</details>`).join('')}
      </div></div>
    <div class="cols-2"><div class="card"><h3>📜 Historique</h3>${sh.history.slice(0, 20).map((h) => `<div class="small"><span class="dot" style="background:${WHEEL_TIERS[h.tier].color}"></span> ${esc(h.text)} <span class="muted">· ${new Date(h.t).toLocaleString('fr-FR')}</span></div>`).join('') || '<p class="muted small">Aucun tour pour l’instant.</p>'}
      <p class="small muted">Tours joués : ${sh.spins} · Jackpots : ${sh.jackpots}</p></div>
      <div class="card"><h3>🌟 Vos grands moments</h3>${sh.history.filter((h) => ['epic', 'legendary', 'mythic'].includes(h.tier)).slice(0, 12).map((h) => `<div class="small"><span class="dot" style="background:${WHEEL_TIERS[h.tier].color}"></span> ${esc(h.text)}</div>`).join('') || '<p class="muted small">Aucune récompense épique ou mieux pour l’instant. Cendrelande est un jeu solo : aucun faux gain d’autres joueurs n’est affiché ici.</p>'}</div></div>`;
  },
  actions: {
    'wh-mute': (app) => { try { localStorage.setItem('cendrelande_mute', muted() ? '0' : '1'); } catch { /* stockage indisponible */ } app.render(); },
    'wh-fast': (app) => { app.ui.wheelFast = !app.ui.wheelFast; app.render(); },
    'wh-free': (app) => app.act(() => claimFreeTicket(app.state), '🎟️ Ticket gratuit obtenu'),
    'wh-ticket': (app) => app.act(() => spendShards(app.state, 'ticket'), '🎟️ +1 ticket'),
    'wh-craft-m': (app, el) => app.act(() => craftMythic(app.state, el.dataset.id), (r) => `✨ ${r.text}`),
    'wh-craft-l': (app, el) => app.act(() => craftLegendary(app.state, el.dataset.id), (r) => `✨ ${r.text}`),
    'wh-relic': (app) => app.act(() => craftRelic(app.state, document.getElementById('wh-relic').value), '🏺 Artefact reconstitué !'),
    'wh-spin': (app) => {
      if (app.ui.spinning) return;
      const s = app.state;
      const r = spin(s);
      if (!r.ok) return app.toast(r.reason, 'bad');
      app.save();
      const seg = segments(s).find((x) => x.tier === r.tier);
      const width = seg.to - seg.from;
      const target = seg.from + width * (0.2 + Math.random() * 0.6);
      const cur = app.ui.wheelAngle || 0;
      const T = app.ui.wheelFast ? 1.2 : 4.2;
      const base = cur - (cur % 360) + 360 * (app.ui.wheelFast ? 2 : 6);
      const next = base + ((360 - target) % 360);
      app.ui.wheelAngle = next;
      app.ui.spinning = true;
      app.ui.freezeUntil = Date.now() + T * 1000 + 300;
      const disc = document.querySelector('.wh-disc');
      if (disc) { disc.style.transition = `transform ${T}s cubic-bezier(0.33, 1, 0.68, 1)`; requestAnimationFrame(() => { disc.style.transform = `rotate(${next}deg)`; }); }
      spinSounds(T, app.ui.wheelFast ? 12 : 36);
      setTimeout(() => {
        app.ui.spinning = false;
        app.ui.freezeUntil = 0;
        fanfare(r.tier);
        const t = WHEEL_TIERS[r.tier];
        app.modal(`<div class="wh-result tier-${r.tier}" style="--tc:${t.color}"><div class="wh-result-tier">${t.name}</div><div class="wh-result-icon">${r.reward.icon}</div><h2>${esc(r.text)}</h2>
          <p class="small">+${r.fragments} fragment(s) mythique(s)</p><button class="btn primary" data-action="close-modal">Continuer</button></div>`, {});
        app.render();
      }, T * 1000 + 150);
    },
  },
};
