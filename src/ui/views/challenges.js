// Défis de maîtrise : épreuves facultatives à paliers, contrainte affichée, progression, historique, récompenses.
import { CHALLENGES, TIERS, CHALLENGE_MIN_TH, MASTERY_BANNERS } from '../../data/challenges.js';
import { thLevel } from '../../systems/city.js';
import { challengeState, canStartChallenge, startChallenge, challengeProgress, abandonChallenge, applyMasteryBanner, masteryScore } from '../../systems/challenges.js';
import { esc, countdown, progress } from '../components.js';
import { dateLabel } from '../../systems/chronicle.js';

const rewardText = (r) => [r.insignia ? `${r.insignia} insignes` : '', r.title ? `titre « ${r.title} »` : '', r.banner ? MASTERY_BANNERS[r.banner].name : ''].filter(Boolean).join(' · ');

export default {
  id: 'challenges', title: 'Défis', icon: '🏅',
  locked: (app) => (thLevel(app.state) < CHALLENGE_MIN_TH ? `Les défis de maîtrise s’ouvrent à l’hôtel de ville niveau ${CHALLENGE_MIN_TH}.` : null),
  render(app) {
    const s = app.state, C = challengeState(s), now = Date.now(), ms = masteryScore(s);
    const a = C.active;
    const act = a ? (() => { const def = CHALLENGES[a.id], p = challengeProgress(s, a, now); return `<div class="card ch-card active"><h2>${def.icon} Épreuve en cours : ${esc(def.name)}</h2>
      <div class="small">⛓️ Contrainte : <b>${esc(def.rule)}</b></div><div class="small">📏 Mesure : ${esc(def.metric)}</div>
      <div class="row between small"><span>Actuellement : <b>${esc(p.label)}</b> → palier visé : ${p.tier >= 0 ? `${TIERS[p.tier].icon} ${TIERS[p.tier].name}` : 'aucun pour l’instant'}</span><span>Fin dans ${countdown(a.end)}</span></div>${progress(a.start, a.end)}
      <div class="tiers">${TIERS.map((t, i) => `<span class="tier ${t.key} ${p.tier >= i ? 'won' : 'off'}">${t.icon} ${t.name} : ${esc(fmtTarget(a.id, def.targets[i]))}</span>`).join('')}</div>
      <button class="mini ghost danger" data-action="ch-abandon">Abandonner l’épreuve</button></div>`; })() : '';
    const cards = Object.entries(CHALLENGES).map(([id, def]) => {
      const c = canStartChallenge(s, id, now), best = C.best[id] ?? -1, cl = C.claimed[id] || {};
      return `<div class="ch-card ${a?.id === id ? 'active' : ''}"><div class="row between"><b>${def.icon} ${esc(def.name)}</b><span class="chip small">${esc(def.style)} · ${def.hours} h</span></div>
        <div class="small">${esc(def.desc)}</div><div class="small muted">⛓️ ${esc(def.rule)}</div>
        <div class="tiers">${TIERS.map((t, i) => `<span class="tier ${t.key} ${cl[t.key] ? 'won' : best >= i ? '' : 'off'}" title="${esc(rewardText(def.rewards[i]))}">${t.icon} ${esc(fmtTarget(id, def.targets[i]))}${cl[t.key] ? ' ✔' : ''}</span>`).join('')}</div>
        <div class="small muted">Récompenses (une fois chacune) : ${TIERS.map((t, i) => `${t.icon} ${esc(rewardText(def.rewards[i]))}`).join(' · ')}</div>
        ${c.ok ? `<button class="btn small primary" data-action="ch-start" data-id="${id}">Relever le défi</button>` : `<div class="req small">${esc(c.reason)}</div>`}</div>`;
    }).join('');
    const banners = Object.entries(MASTERY_BANNERS).filter(([k]) => s.meta.owned?.[k]);
    const hist = C.history.slice(0, 10).map((h) => `<li>${esc(dateLabel(s, h.t))} · ${CHALLENGES[h.id]?.icon || ''} ${esc(CHALLENGES[h.id]?.name || h.id)} : ${h.tier >= 0 ? `${TIERS[h.tier].icon} ${TIERS[h.tier].name}` : `<span class="bad">échec${h.failed ? ` (${esc(h.failed)})` : ''}</span>`} — ${esc(h.label)}</li>`).join('');
    return `<div class="card"><h2>🏅 Défis de maîtrise <span class="muted small">${ms.got}/${ms.total} paliers</span></h2>
      <p class="small muted">Des épreuves facultatives qui imposent une contrainte (pas de commerce, pas de recrutement, impôts légers…) et récompensent la manière de jouer. Chaque palier (bronze, argent, or) rapporte une fois des insignes, un titre ou une bannière — jamais de bonus permanent. Une épreuve à la fois ; un défi se retente 6 h après la précédente tentative pour battre son record.</p></div>
      ${act}<div class="ch-grid">${cards}</div>
      ${banners.length ? `<div class="card"><h3>🚩 Bannières de maîtrise</h3><div class="row gap wrap">${banners.map(([k, b]) => `<button class="mini" data-action="ch-banner" data-k="${k}"><span class="banner" style="--banner:${b.color};width:14px;height:20px"></span> ${esc(b.name)}</button>`).join('')}</div></div>` : ''}
      ${hist ? `<div class="card"><h3>📜 Historique</h3><ul class="small">${hist}</ul></div>` : ''}`;
  },
  actions: {
    'ch-start': (app, el) => { const d = CHALLENGES[el.dataset.id]; if (confirm(`Relever le défi « ${d.name} » pendant ${d.hours} h ?\nContrainte : ${d.rule}`)) app.act(() => startChallenge(app.state, el.dataset.id), `${d.icon} Épreuve commencée`); },
    'ch-abandon': (app) => { if (confirm('Abandonner l’épreuve ? Elle comptera comme un échec.')) app.act(() => abandonChallenge(app.state), 'Épreuve abandonnée'); },
    'ch-banner': (app, el) => app.act(() => applyMasteryBanner(app.state, el.dataset.k), (r) => `🚩 ${r.name}`),
  },
};

function fmtTarget(id, v) {
  if (id === 'autarky') return `${Math.round(v * 100)} %`;
  if (id === 'scarcity') return v === 0 ? 'sans famine' : `réserve ${Math.round(v * 100)} %`;
  if (id === 'lightHand') return `stabilité ${v}`;
  return String(v);
}
