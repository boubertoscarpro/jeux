import { fmt } from '../../core/util.js';
import { goals } from '../../systems/goals.js';
import { objectives, claimRoyalDaily, objectivesBadge } from '../../systems/campaign.js';
import { claimDaily } from '../../systems/liveEvents.js';
import { KINGDOM_HINTS } from '../../data/campaign.js';
import { ADVICE_LEVELS, setAdviceLevel } from '../../systems/guide.js';
import { resChips } from '../components.js';
import { SAGAS } from '../../data/sagas.js';
import { esc, bar, countdown } from '../components.js';
import { questlineList, questlinesBadge, claimQuestStep, claimQuestFinal } from '../../systems/questlines.js';
import { QUEST_CATS } from '../../data/questlines.js';
import { missionList, claimDynMission, dropMission, missionState, missionsUnlocked, MISSION_MAX, MISSION_TAGS, playStyle } from '../../systems/missions.js';
import { rewardText as rwText } from '../../systems/rewards.js';
import { computeMods } from '../../systems/modifiers.js';
import { upgradeSummary } from '../../systems/construction.js';
import { fmtTime } from '../../core/util.js';

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
  ['main', '📖 Principales'], ['quests', '🗺️ Quêtes du royaume'], ['missions', '🧭 Missions du royaume'], ['secondary', '✳️ Secondaires'], ['daily', '🗓️ Du jour'], ['event', '🎪 Événement'], ['long', '🏔️ Long terme'], ['suggest', '💡 Suggestions'],
];

// Quêtes du royaume : une carte par quête, étapes visibles, progression et récompenses
function questCard(l) {
  const cat = QUEST_CATS[l.cat];
  if (!l.unlocked) return `<div class="goal locked"><div class="goal-head"><span class="goal-icon">🔒</span><b>${esc(l.title)}</b> <span class="chip small">${cat.icon} ${esc(cat.name)}</span></div><div class="small muted">Débloquée : ${esc(l.unlockText)}</div></div>`;
  const doneN = l.steps.filter((s) => s.done).length;
  return `<div class="goal quest-line ${l.finished ? 'done' : ''}">
    <div class="goal-head"><span class="goal-icon">${l.icon}</span><b>${esc(l.title)}</b> <span class="chip small">${cat.icon} ${esc(cat.name)}</span><span class="muted small">${doneN}/${l.steps.length}</span></div>
    <div class="small story">${esc(l.intro)}</div>
    <ol class="ql-steps">${l.steps.map((st) => `<li class="${st.done ? 'done' : st.current ? 'current' : 'locked'}">
      <div><b>${st.done ? '✔ ' : ''}${esc(st.title)}</b>${st.current ? ` <span class="muted small">${fmt(st.cur)}/${fmt(st.target)}</span>` : ''}</div>
      ${st.current || st.done ? `<div class="small muted">${esc(st.desc)}</div>` : '<div class="small muted">Étape suivante…</div>'}
      ${st.current ? bar(st.cur, st.target) : ''}
      <div class="quest-foot"><span class="small">🎁 ${esc(rwText(st.reward))}</span>${st.done && !st.claimed ? `<button class="mini good" data-action="ql-claim" data-id="${l.id}" data-i="${st.i}">Réclamer</button>` : st.claimed ? '<span class="ok small">✔ Réclamée</span>' : st.current && st.view ? `<button class="mini ghost" data-action="goto" data-view="${st.view}">Y aller →</button>` : ''}</div></li>`).join('')}</ol>
    <div class="quest-foot"><span class="small">🏆 Fin de quête : ${esc(rwText(l.final))}</span>${l.finished && !l.finalClaimed ? `<button class="mini good" data-action="ql-final" data-id="${l.id}">Réclamer</button>` : l.finalClaimed ? '<span class="ok small">✔ Réclamée</span>' : ''}</div></div>`;
}

// Mission dynamique
function dynCard(m) {
  return `<div class="goal dyn ${m.done ? 'done' : ''} ${m.void ? 'void' : ''}">
    <div class="goal-head"><span class="goal-icon">${m.icon}</span><b>${esc(m.title)}</b> <span class="chip small">${esc(MISSION_TAGS[m.tag] || '')}</span></div>
    <div class="small muted">${esc(m.desc)}</div>
    <div class="row between small"><span>${fmt(m.cur)} / ${fmt(m.target)}</span>${m.done ? '<span class="ok">✔ atteint</span>' : `<span class="muted">expire dans ${fmtTime(m.left)}</span>`}</div>${bar(m.cur, m.target)}
    ${m.void ? `<div class="req">⚠️ Mission devenue impossible : ${esc(m.void)}</div>` : ''}
    <div class="quest-foot"><span class="small">🎁 ${esc(rwText(m.reward))}</span>
      ${m.done ? `<button class="mini good" data-action="dm-claim" data-id="${m.id}">Réclamer</button>` : `${m.view ? `<button class="mini ghost" data-action="dm-go" data-id="${m.id}">Y aller →</button>` : ''}<button class="mini ghost" data-action="dm-drop" data-id="${m.id}" title="${m.void ? 'Retirer sans pénalité' : 'Refuser (une fois toutes les 30 min) : une autre mission sera proposée'}">${m.void ? 'Remplacer' : 'Refuser'}</button>`}</div></div>`;
}

// Tableau de bord : quête principale, objectifs secondaires, missions, récompenses à récupérer
function dashboard(s, o) {
  const ql = questlineList(s);
  const ms = missionList(s);
  const next = o.main.find((m) => !m.done);
  const qCur = ql.filter((l) => l.active && !l.finished && l.current).slice(0, 3);
  const claims = [
    ...o.main.filter((m) => m.done && !m.claimed).map((m) => ({ t: m.title, a: `<button class="mini good" data-action="claim-quest" data-id="${m.id}">Réclamer</button>` })),
    ...(o.chapter.complete && !o.chapter.rewardClaimed ? [{ t: `Chapitre ${o.chapter.n}`, a: `<button class="mini good" data-action="claim-chapter" data-n="${o.chapter.n}">Réclamer</button>` }] : []),
    ...o.secondary.filter((m) => m.done && !m.claimed).map((m) => ({ t: m.title, a: `<button class="mini good" data-action="claim-quest" data-id="${m.id}">Réclamer</button>` })),
    ...ql.flatMap((l) => l.steps.filter((st) => st.done && !st.claimed).map((st) => ({ t: `${l.title} — ${st.title}`, a: `<button class="mini good" data-action="ql-claim" data-id="${l.id}" data-i="${st.i}">Réclamer</button>` }))),
    ...ql.filter((l) => l.finished && !l.finalClaimed).map((l) => ({ t: `🏆 ${l.title}`, a: `<button class="mini good" data-action="ql-final" data-id="${l.id}">Réclamer</button>` })),
    ...ms.filter((m) => m.done).map((m) => ({ t: m.title, a: `<button class="mini good" data-action="dm-claim" data-id="${m.id}">Réclamer</button>` })),
    ...o.daily.filter((m) => m.done && !m.claimed).map((m) => ({ t: m.title, a: `<button class="mini good" data-action="claim-royal" data-id="${esc(String(m.id))}">Réclamer</button>` })),
  ];
  const ups = upgradeSummary(s, computeMods(s)).count;
  const finishedQ = ql.filter((l) => l.finished).length;
  const box = (title, body) => `<div class="dash-col"><h4>${title}</h4>${body}</div>`;
  const line = (icon, title, sub, btn = '') => `<div class="dash-item"><span class="dash-ic">${icon}</span><div><b>${esc(title)}</b>${sub ? `<div class="small muted">${sub}</div>` : ''}</div>${btn}</div>`;
  return `<div class="card dash"><h3>🧭 Tableau de bord — que faire maintenant ?</h3>
    <div class="dash-grid">
      ${box('📖 Quête principale', next ? line(o.chapter.icon, next.title, `${esc(next.desc)} <b>${fmt(next.cur)}/${fmt(next.target)}</b>`, next.action ? `<button class="mini" data-action="${next.action}">Lancer</button>` : next.view ? `<button class="mini ghost" data-action="goto" data-view="${next.view}">Y aller</button>` : '') : '<div class="small muted">Chapitre terminé : réclamez sa récompense, puis place aux quêtes du royaume.</div>')}
      ${box('🗺️ Objectifs secondaires', qCur.map((l) => line(l.icon, `${l.title} : ${l.current.title}`, `${esc(l.current.desc)} <b>${fmt(l.current.cur)}/${fmt(l.current.target)}</b>`, l.current.view ? `<button class="mini ghost" data-action="goto" data-view="${l.current.view}">Y aller</button>` : '')).join('') || '<div class="small muted">Les quêtes du royaume s’ouvrent au fil de votre progression (voir l’onglet Quêtes).</div>')}
      ${box(`🧭 Missions du royaume <span class="muted">${ms.length}/${MISSION_MAX}</span>`, ms.map((m) => line(m.icon, m.title, `<b>${fmt(m.cur)}/${fmt(m.target)}</b>${m.void ? ' · <span class="req">impossible</span>' : ''}`, m.done ? '' : `<button class="mini ghost" data-action="dm-go" data-id="${m.id}">Y aller</button>`)).join('') || `<div class="small muted">${missionsUnlocked(s) ? 'Une mission adaptée à votre royaume arrivera bientôt.' : 'Les missions du royaume arrivent au chapitre 2.'}</div>`)}
      ${box(`🎁 Récompenses à récupérer <span class="muted">${claims.length}</span>`, claims.slice(0, 6).map((c) => `<div class="dash-item"><span class="dash-ic">✅</span><div class="small">${esc(c.t)}</div>${c.a}</div>`).join('') + (claims.length > 6 ? `<div class="small muted">… et ${claims.length - 6} autre(s).</div>` : '') || '<div class="small muted">Rien à réclamer pour l’instant.</div>')}
    </div>
    <div class="small muted dash-foot">${ups ? `<button class="mini" data-action="up-list">⬆ ${ups} amélioration(s) possible(s)</button> · ` : ''}Terminé : ${Object.keys(s.campaign?.claimed || {}).length} mission(s) du parcours, ${finishedQ} quête(s) du royaume, ${missionState(s).done || 0} mission(s) dynamique(s). Rien n’est obligatoire : jouez librement, ces objectifs ne sont que des propositions.</div></div>`;
}

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
  badge: (app) => objectivesBadge(app.state) + questlinesBadge(app.state) + (() => { try { return missionList(app.state).filter((m) => m.done).length; } catch { return 0; } })(),
  render(app) {
    const s = app.state;
    const o = objectives(s);
    const cat = app.ui.goalCat || 'main';
    const count = { quests: questlineList(s).filter((l) => l.active && !l.finished).length, missions: missionList(s).length, main: o.main.length, secondary: o.secondary.length, daily: o.daily.filter((m) => !m.claimed).length, event: o.event.filter((m) => !m.claimed).length, long: o.long.length };
    const ready = (k) => (k === 'quests' ? questlinesBadge(s) : k === 'missions' ? missionList(s).filter((m) => m.done).length : (o[k] || []).filter((m) => m.done && !m.claimed).length);
    let body;
    if (cat === 'quests') {
      const ql = questlineList(s);
      const order = (l) => (l.toClaim ? 0 : l.active && !l.finished ? 1 : l.finished ? 3 : 2);
      body = `<p class="small muted">Chaînes de quêtes en plusieurs étapes, par catégorie. Chaque étape mesure ce que vous accomplissez <b>après</b> son ouverture ; la suivante s’ouvre aussitôt. Elles prolongent le parcours guidé et la campagne des Terres Brisées.</p>
        <div class="goal-grid">${[...ql].sort((a, b) => order(a) - order(b)).map(questCard).join('')}</div>`;
    } else if (cat === 'missions') {
      const ms = missionList(s);
      const st = playStyle(s);
      const fav = Object.entries(st).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).map(([k]) => MISSION_TAGS[k]);
      body = `<p class="small muted">Missions proposées d’après l’état réel de votre royaume (au plus ${MISSION_MAX}, une nouvelle toutes les 20 min environ, jamais deux fois de suite la même). Elles restent facultatives, expirent sans pénalité au bout de 24 h et s’adaptent à votre façon de jouer${fav.length ? ` (actuellement : ${fav.map(esc).join(', ')})` : ''}. Une mission devenue impossible peut être remplacée gratuitement.</p>
        ${missionsUnlocked(s) ? '' : '<p class="req small">Les missions du royaume se débloquent au chapitre 2 du parcours guidé.</p>'}
        <div class="goal-grid">${ms.map(dynCard).join('') || '<p class="muted small">Aucune mission pour l’instant : la prochaine arrivera bientôt.</p>'}</div>`;
    } else if (cat === 'suggest') {
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
    return `${dashboard(s, o)}${chapterHeader(s, o)}
      <div class="card"><div class="tabs wrap">${CATS.map(([k, l]) => `<button class="tab ${cat === k ? 'active' : ''}" data-action="goal-cat" data-k="${k}">${l}${count[k] ? ` <span class="muted">${count[k]}</span>` : ''}${ready(k) ? ` <span class="sub-badge">${ready(k)}</span>` : ''}</button>`).join('')}</div>
      ${body}</div>
      <div class="card"><h3>🧙‍♂️ Conseiller et tutoriel</h3>
        <div class="row gap wrap"><span class="small">Conseiller du tableau de bord :</span>${Object.entries(ADVICE_LEVELS).map(([k, l]) => `<button class="mini ${(s.meta.advice || 'full') === k ? 'primary' : ''}" data-action="advice-level" data-k="${k}">${esc(l)}</button>`).join('')}</div>
        <div class="row gap wrap"><span class="small">Fiches du tutoriel :</span><button class="mini" data-action="tips-toggle">${s.meta.tipsOff ? '📘 Réactiver' : '📘 Désactiver'}</button><button class="mini ghost" data-action="nav" data-view="journal">Revoir les fiches (Journal) →</button>${Object.keys(s.campaign?.dismissed || {}).length ? '<button class="mini ghost" data-action="advice-reset">↺ Réafficher les conseils ignorés</button>' : ''}</div></div>
      ${sagaCard(s)}`;
  },
  actions: {
    'goal-cat': (app, el) => { app.ui.goalCat = el.dataset.k; app.render(); },
    'ql-claim': (app, el) => app.act(() => claimQuestStep(app.state, el.dataset.id, +el.dataset.i), (r) => `Étape accomplie : ${r.text}`),
    'ql-final': (app, el) => app.act(() => claimQuestFinal(app.state, el.dataset.id), (r) => `🏆 Quête terminée : ${r.text}`),
    'dm-claim': (app, el) => app.act(() => claimDynMission(app.state, el.dataset.id), (r) => `Mission accomplie : ${r.text}`),
    'dm-drop': (app, el) => app.act(() => dropMission(app.state, el.dataset.id), (r) => (r.void ? 'Mission retirée sans pénalité' : 'Mission refusée : une autre sera proposée')),
    'claim-royal': (app, el) => app.act(() => claimRoyalDaily(app.state, el.dataset.id), 'Mission royale accomplie !'),
    'claim-event-daily': (app, el) => app.act(() => claimDaily(app.state, +el.dataset.i), 'Mission du jour accomplie !'),
    'advice-level': (app, el) => app.act(() => setAdviceLevel(app.state, el.dataset.k), 'Conseiller réglé'),
    'advice-reset': (app) => app.act(() => { app.state.campaign.dismissed = {}; app.state.campaign.snoozed = {}; return { ok: true }; }, 'Conseils réaffichés'),
    'tips-toggle': (app) => { app.state.meta.tipsOff = !app.state.meta.tipsOff; app.render(); },
  },
};
