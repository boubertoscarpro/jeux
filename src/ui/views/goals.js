import { fmt } from '../../core/util.js';
import { goals } from '../../systems/goals.js';
import { objectives, claimRoyalDaily, objectivesBadge } from '../../systems/campaign.js';
import { claimDaily } from '../../systems/liveEvents.js';
import { KINGDOM_HINTS } from '../../data/campaign.js';
import { ADVICE_LEVELS, setAdviceLevel } from '../../systems/guide.js';
import { resChips } from '../components.js';
import { SAGAS } from '../../data/sagas.js';
import { esc, bar, countdown } from '../components.js';

function card(g) {
  const prog = g.max ? `<div class="row between small"><span>${fmt(Math.min(g.cur || 0, g.max))} / ${fmt(g.max)}</span>${g.done ? '<span class="ok">✔ prêt</span>' : ''}</div>${bar(g.cur || 0, g.max)}` : '';
  return `<div class="goal ${g.done ? 'done' : ''} ${g.urgent ? 'urgent' : ''}">
    <div class="goal-head"><span class="goal-icon">${g.icon}</span><b>${esc(g.title)}</b></div>
    ${g.desc ? `<div class="small muted">${esc(g.desc)}</div>` : ''}${prog}
    ${g.prereq ? `<div class="small">🔑 ${esc(g.prereq)}</div>` : ''}${g.reward ? `<div class="small">🎁 ${esc(g.reward)}</div>` : ''}
    ${g.until ? `<div class="small muted">Expire dans ${countdown(g.until)}</div>` : ''}${g.extra ? `<div class="small muted">${esc(g.extra)}</div>` : ''}
    ${g.view ? `<button class="mini" data-action="goto" data-view="${g.view}">Y aller →</button>` : ''}</div>`;
}

function sagaCard(s) {
  const S = s.sagas || { done: {}, log: [] };
  const total = Object.keys(SAGAS).length, done = Object.keys(S.done || {}).length;
  const a = S.active;
  return `<div class="card"><h3>📖 Sagas des Terres Brisées <span class="muted small">${done}/${total} achevées</span></h3>
    <p class="small muted">Des chaînes d’événements narratifs se présentent de temps à autre (une à la fois). Vos choix ont des conséquences sur les étapes suivantes, vos relations et votre réputation. Aucune réponse n’est toujours la meilleure.</p>
    ${a ? `<div class="goal urgent"><b>${SAGAS[a.id].icon} ${esc(SAGAS[a.id].title)}</b><div class="small">${a.at > Date.now() ? `Prochaine étape dans ${countdown(a.at)}` : 'Une décision vous attend (panneau Décisions).'}</div></div>` : '<p class="small">Aucune saga en cours.</p>'}
    ${(S.log || []).slice(0, 8).map((l) => `<div class="small">• <b>${esc(l.title)}</b> — « ${esc(l.choice)} » : ${esc(l.text)}</div>`).join('')}</div>`;
}

// Carte de mission : titre, description, conditions, progression, récompense, « Y aller » et réclamation
function mission(m, claimAction = 'claim-quest') {
  const reward = m.rewardText ? `<span class="small">🎁 ${esc(m.rewardText)}</span>` : resChips(m.reward);
  const claim = m.done && !m.claimed ? `<button class="mini good" data-action="${claimAction}" data-id="${esc(String(m.id))}" data-i="${m.i ?? ''}">Réclamer</button>` : m.claimed ? '<span class="ok small">✔ Réclamée</span>' : '';
  const go = !m.done ? (m.action ? `<button class="mini" data-action="${m.action}">Lancer</button>` : m.view ? `<button class="mini ghost" data-action="goto" data-view="${m.view}">Y aller →</button>` : '') : '';
  return `<div class="goal ${m.done ? 'done' : ''}">
    <div class="goal-head"><b>${esc(m.title)}</b>${m.optional ? ' <span class="chip small">secondaire</span>' : ''}</div>
    <div class="small muted">${esc(m.desc || '')}</div>
    <div class="row between small"><span>${fmt(m.cur || 0)} / ${fmt(m.target)}</span>${m.done ? '<span class="ok">✔ atteint</span>' : ''}</div>${bar(m.cur || 0, m.target)}
    <div class="quest-foot">${reward}${claim}${go}</div></div>`;
}

const CATS = [
  ['main', '📖 Principales'], ['secondary', '✳️ Secondaires'], ['daily', '🗓️ Du jour'], ['event', '🎪 Événement'], ['long', '🏔️ Long terme'], ['suggest', '🧭 Suggestions'],
];

function chapterHeader(s, o) {
  const ch = o.chapter;
  const hint = KINGDOM_HINTS[s.kingdom?.type]?.[ch.n];
  return `<div class="card chapter-card"><div class="row between wrap"><h2>${ch.icon} Chapitre ${ch.n} — ${esc(ch.title)}</h2><span class="muted small">${ch.mainDone}/${ch.mainTotal} missions principales</span></div>
    <p class="story small">${esc(ch.intro)}</p>
    <p class="small">💡 ${esc(ch.tip)}</p>${hint ? `<p class="small">${esc(hint)}</p>` : ''}
    ${bar(ch.mainDone, ch.mainTotal)}
    <div class="quest-foot"><span class="small">Récompense du chapitre :</span> ${resChips(ch.reward)}${ch.complete && !ch.rewardClaimed ? `<button class="mini good" data-action="claim-chapter" data-n="${ch.n}">Réclamer</button>` : ch.rewardClaimed ? '<span class="ok small">✔ Réclamée</span>' : ''}</div>
    <div class="chapter-track">${o.chapters.map((c) => `<span class="chapter-pill ${c.current ? 'current' : c.unlocked ? (c.complete ? 'done' : 'open') : 'locked'}" title="${esc(c.unlocked ? c.title : 'Chapitre verrouillé : terminez les missions principales du précédent')}">${c.unlocked ? c.icon : '🔒'} ${c.n}. ${esc(c.unlocked ? c.title : '???')}${c.unlocked && c.complete && !c.rewardClaimed && !c.current ? ' 🎁' : ''}</span>`).join('')}</div>
    ${o.chapters.filter((c) => c.unlocked && !c.current && c.complete && !c.rewardClaimed).map((c) => `<div class="small">🏆 Chapitre ${c.n} terminé : <button class="mini good" data-action="claim-chapter" data-n="${c.n}">Réclamer ${esc(c.title)}</button></div>`).join('')}
  </div>`;
}

export default {
  id: 'goals', title: 'Objectifs', icon: '🎯',
  badge: (app) => objectivesBadge(app.state),
  render(app) {
    const s = app.state;
    const o = objectives(s);
    const cat = app.ui.goalCat || 'main';
    const count = { main: o.main.length, secondary: o.secondary.length, daily: o.daily.filter((m) => !m.claimed).length, event: o.event.filter((m) => !m.claimed).length, long: o.long.length };
    const ready = (k) => (o[k] || []).filter((m) => m.done && !m.claimed).length;
    let body;
    if (cat === 'suggest') {
      const g = goals(s);
      const col = (title, sub, list) => `<div class="card"><h3>${title}</h3><p class="small muted">${sub}</p>${list.map(card).join('') || '<p class="muted small">Rien pour l’instant.</p>'}</div>`;
      body = `<p class="small muted">Prochaines étapes calculées à partir de l’état réel du royaume (sans récompense : ce sont des conseils).</p><div class="cols-3">${col('⏱️ Court terme', 'Quelques minutes à une heure', g.short)}${col('📅 Moyen terme', 'Quelques heures à quelques jours', g.mid)}${col('🏔️ Long terme', 'Les grands accomplissements', g.long)}</div>`;
    } else {
      const list = o[cat] || [];
      const sub = {
        main: 'Les missions du chapitre en cours. Le chapitre suivant s’ouvre quand toutes sont atteintes.',
        secondary: 'Missions facultatives des chapitres ouverts : elles ne bloquent jamais la progression.',
        daily: 'Trois missions royales renouvelées chaque jour (minuit UTC), mesurées depuis le début de la journée. Une mission accomplie mais oubliée est versée automatiquement le lendemain.',
        event: s.live?.current ? 'Missions du jour de l’événement en cours (récompense en monnaie d’événement).' : 'Aucun événement en cours : consultez le calendrier.',
        long: 'Grands objectifs du royaume, à atteindre sur plusieurs jours ou semaines.',
      }[cat];
      const claim = { daily: 'claim-royal', event: 'claim-event-daily' }[cat] || 'claim-quest';
      body = `<p class="small muted">${sub}</p><div class="goal-grid">${list.map((m) => mission(m, claim)).join('') || '<p class="muted small">Rien dans cette catégorie pour l’instant.</p>'}</div>`;
    }
    return `${chapterHeader(s, o)}
      <div class="card"><div class="tabs wrap">${CATS.map(([k, l]) => `<button class="tab ${cat === k ? 'active' : ''}" data-action="goal-cat" data-k="${k}">${l}${count[k] ? ` <span class="muted">${count[k]}</span>` : ''}${ready(k) ? ` <span class="sub-badge">${ready(k)}</span>` : ''}</button>`).join('')}</div>
      ${body}</div>
      <div class="card"><h3>🧙‍♂️ Conseiller et tutoriel</h3>
        <div class="row gap wrap"><span class="small">Conseiller du tableau de bord :</span>${Object.entries(ADVICE_LEVELS).map(([k, l]) => `<button class="mini ${(s.meta.advice || 'full') === k ? 'primary' : ''}" data-action="advice-level" data-k="${k}">${esc(l)}</button>`).join('')}</div>
        <div class="row gap wrap"><span class="small">Fiches du tutoriel :</span><button class="mini" data-action="tips-toggle">${s.meta.tipsOff ? '📘 Réactiver' : '📘 Désactiver'}</button><button class="mini ghost" data-action="nav" data-view="journal">Revoir les fiches (Journal) →</button>${Object.keys(s.campaign?.dismissed || {}).length ? '<button class="mini ghost" data-action="advice-reset">↺ Réafficher les conseils ignorés</button>' : ''}</div></div>
      ${sagaCard(s)}`;
  },
  actions: {
    'goal-cat': (app, el) => { app.ui.goalCat = el.dataset.k; app.render(); },
    'claim-royal': (app, el) => app.act(() => claimRoyalDaily(app.state, el.dataset.id), 'Mission royale accomplie !'),
    'claim-event-daily': (app, el) => app.act(() => claimDaily(app.state, +el.dataset.i), 'Mission du jour accomplie !'),
    'advice-level': (app, el) => app.act(() => setAdviceLevel(app.state, el.dataset.k), 'Conseiller réglé'),
    'advice-reset': (app) => app.act(() => { app.state.campaign.dismissed = {}; app.state.campaign.snoozed = {}; return { ok: true }; }, 'Conseils réaffichés'),
    'tips-toggle': (app) => { app.state.meta.tipsOff = !app.state.meta.tipsOff; app.render(); },
  },
};
