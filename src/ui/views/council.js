// Conseil royal : faveur des cinq groupes d'influence, pressions, motion en cours, décisions passées.
import { GROUPS, GROUP_ORDER, COUNCIL, COUNCIL_MIN_TH, MOTIONS } from '../../data/council.js';
import { thLevel } from '../../systems/city.js';
import { councilState, favorOf, moodOf, councilPressures, councilTarget, optionCost, optionText, decideMotion } from '../../systems/council.js';
import { esc, costList, countdown, bar } from '../components.js';
import { dateLabel } from '../../systems/chronicle.js';

export default {
  id: 'council', title: 'Conseil', icon: '🏛️',
  locked: (app) => (thLevel(app.state) < COUNCIL_MIN_TH ? `Le conseil royal se réunit à partir de l’hôtel de ville niveau ${COUNCIL_MIN_TH}.` : null),
  render(app) {
    const s = app.state, c = councilState(s), now = Date.now();
    const pr = councilPressures(s, now);
    const mo = c.motion && MOTIONS[c.motion.id];
    const motion = mo ? `<div class="card council-motion"><h2>📜 Motion : ${esc(mo.title)}</h2>
      <p>${GROUPS[mo.group].icon} <b>${esc(GROUPS[mo.group].leader)}</b> (${esc(GROUPS[mo.group].name)}) : « ${esc(mo.text)} »</p>
      <p class="small muted">Décision attendue avant ${countdown(c.motion.deadline)}. Sans réponse, ${esc(GROUPS[mo.group].name)} perd ${-COUNCIL.ignorePenalty} points de faveur.</p>
      <div class="council-options">${mo.options.map((o, i) => { const cost = optionCost(s, o); return `<div class="council-opt"><b>${esc(o.label)}</b><div class="small">${esc(optionText(s, o))}</div>${Object.keys(cost).length ? costList(cost, s) : ''}<button class="btn small primary" data-action="council-decide" data-i="${i}">Choisir</button></div>`; }).join('')}</div></div>`
      : `<div class="card"><p class="small muted">Aucune motion pour l’instant. Prochaine session du conseil ${c.nextAt > now ? `dans ${countdown(c.nextAt)}` : 'bientôt'}.</p></div>`;
    const groups = GROUP_ORDER.map((g) => {
      const G = GROUPS[g], v = favorOf(s, g), mood = moodOf(v), tgt = councilTarget(s, g, now);
      const fx = mood.key === 'neutral' ? 'Aucun effet' : G[mood.key].text;
      return `<div class="council-group ${mood.key}"><div class="row between"><b>${G.icon} ${esc(G.name)}</b><span>${mood.icon} ${mood.name}</span></div>
        <div class="small muted">${esc(G.leader)}</div>
        ${bar(v, 100, mood.key === 'loyal' ? 'good' : mood.key === 'hostile' ? 'bad' : '')}
        <div class="small">Faveur <b>${Math.round(v)}</b> → tend vers ${Math.round(tgt)} · <span class="${mood.key === 'loyal' ? 'ok' : mood.key === 'hostile' ? 'bad' : 'muted'}">${esc(fx)}</span></div>
        <div class="small muted">Loyal (≥ ${COUNCIL.loyal}) : ${esc(G.loyal.text)} · Hostile (≤ ${COUNCIL.hostile}) : ${esc(G.hostile.text)}</div>
        ${pr[g].length ? `<ul class="small council-press">${pr[g].map(([l, n]) => `<li>${esc(l)} <b class="${n >= 0 ? 'ok' : 'bad'}">${n > 0 ? '+' : ''}${n}</b></li>`).join('')}</ul>` : ''}</div>`;
    }).join('');
    const hist = c.history.slice(0, 8).map((h) => { const m = MOTIONS[h.id]; return m ? `<li>${esc(dateLabel(s, h.t))} · ${esc(m.title)} : <b>${h.choice < 0 ? 'ignorée' : esc(m.options[h.choice].label)}</b></li>` : ''; }).join('');
    return `<div class="card"><h2>🏛️ Conseil royal</h2>
      <p class="small muted">Cinq groupes d’influence défendent des intérêts opposés. Leur faveur tend vers 50, déplacée par votre priorité royale, la famine, les impôts des provinces, les campagnes militaires, la recherche, et par vos décisions (la moitié de leur effet dure 48 h). Un groupe loyal accorde un bonus, un groupe hostile impose un malus.</p></div>
      ${motion}<div class="council-grid">${groups}</div>
      ${hist ? `<div class="card"><h3>Décisions récentes</h3><ul class="small">${hist}</ul></div>` : ''}`;
  },
  actions: {
    'council-decide': (app, el) => app.act(() => decideMotion(app.state, +el.dataset.i), (r) => `🏛️ Décision prise : ${r.text}`),
  },
};
