// Fouilles : mystères archéologiques (indices, sites à localiser, fouilles, études, énigme).
import { MYSTERIES, MYSTERY_ORDER, ARCHAEO_MIN_TH, STUDY } from '../../data/archaeology.js';
import { PLANS } from '../../data/recipes.js';
import { thLevel } from '../../systems/city.js';
import { archaeoState, canDig, digPreview, startDig, studyFragment, answerRiddle, riddleReady, abandonMystery, clueProgress, nextMystery } from '../../systems/archaeology.js';
import { esc, costList, countdown, progress } from '../components.js';
import { fmtTime } from '../../core/util.js';

function activeCard(app, m) {
  const s = app.state, def = MYSTERIES[m.id], now = Date.now();
  const pending = m.sites.findIndex((x) => x.found && !x.studied);
  const sites = m.sites.map((site, i) => {
    let body;
    if (site.found) body = `<div class="small">📜 ${esc(def.fragments[i])}</div>${site.studied ? `<div class="small muted">Étudié : ${esc(STUDY[site.studied].name)}</div>` : `<div class="row gap wrap">${Object.entries(STUDY).map(([k, st]) => `<button class="mini ${k === 'deep' ? 'primary' : ''}" data-action="arch-study" data-i="${i}" data-id="${k}" title="${esc(st.desc)}">${st.icon} ${esc(st.name)} ${Object.keys(st.cost).length ? costList(st.cost, s) : ''}</button>`).join('')}</div><div class="small muted">${Object.values(STUDY).map((st) => `${st.icon} ${esc(st.desc)}`).join('<br>')}</div>`}`;
    else if (m.dig?.site === i) body = `<div class="small">⛏️ Fouille en cours… ${countdown(m.dig.end)}</div>${progress(m.dig.start, m.dig.end)}`;
    else if (!site.located) body = `<div class="small">🧭 Zone indiquée : autour de (${site.cx}, ${site.cy}), dans un rayon de ${site.r} cases. Explorez-la (éclaireurs, exploration, expéditions) pour localiser le site exact.</div><button class="mini" data-action="goto-map" data-x="${site.cx}" data-y="${site.cy}">Voir la zone sur la carte</button>`;
    else {
      const c = canDig(s, i), pv = digPreview(s, i);
      body = `<div class="small">📍 Site localisé en (${site.x}, ${site.y}) · ${Math.round(pv.dist)} cases · fouille ${fmtTime(pv.minutes * 60000)}${pv.risk ? ` · <span class="bad">risque d’embuscade ${Math.round(pv.risk * 100)} %</span> (nettoyez les lieux dangereux voisins)` : ' · aucun danger proche'}</div>
        <div class="row gap wrap">${costList(pv.cost, s)} ${c.ok ? `<button class="mini primary" data-action="arch-dig" data-i="${i}">Envoyer une équipe de fouille</button>` : `<span class="req small">${esc(c.reason)}</span>`}
        <button class="mini ghost" data-action="goto-map" data-x="${site.x}" data-y="${site.y}">Carte</button></div>`;
    }
    return `<div class="arch-site ${site.found ? 'found' : ''}"><b>Fragment ${i + 1}</b> ${site.found ? '✅' : site.located ? '📍' : '❔'}${body}</div>`;
  }).join('');
  const ready = riddleReady(m);
  const riddle = ready ? `<div class="arch-riddle"><h3>❓ ${esc(def.riddle)}</h3>
    ${m.retryAt > now ? `<p class="small muted">Les érudits réfléchissent encore… nouvel essai dans ${countdown(m.retryAt)}</p>` : ''}
    <div class="arch-answers">${def.answers.map((a, k) => m.eliminated.includes(k) ? `<button class="mini ghost" disabled><s>${esc(a)}</s></button>` : `<button class="mini primary" data-action="arch-answer" data-i="${k}" ${m.retryAt > now ? 'disabled' : ''}>${esc(a)}</button>`).join('')}</div>
    <p class="small muted">Relisez les trois fragments ci-dessus. Une mauvaise réponse est écartée et impose ${4} h de réflexion.</p></div>` : `<p class="small muted">Réunissez et étudiez les trois fragments pour poser l’énigme.${pending >= 0 ? ' Un fragment attend son étude.' : ''}</p>`;
  return `<div class="card"><h2>${def.icon} ${esc(def.name)}</h2><p class="small">🔎 ${esc(def.clue)}</p>
    <div class="arch-sites">${sites}</div>${riddle}
    <p class="small muted">Récompense : ${esc(def.place.name)} (repère sur la carte), ${esc(def.reward.text)}, plan « ${esc(PLANS[def.reward.plan]?.name || '')} ».</p>
    <button class="mini ghost danger" data-action="arch-abandon">Mettre ce mystère de côté</button></div>`;
}

export default {
  id: 'archaeo', title: 'Fouilles', icon: '🏺',
  locked: (app) => (thLevel(app.state) < ARCHAEO_MIN_TH ? `Les érudits s’intéressent aux ruines à partir de l’hôtel de ville niveau ${ARCHAEO_MIN_TH}.` : null),
  render(app) {
    const s = app.state, a = archaeoState(s);
    const cp = clueProgress(s), nx = nextMystery(s);
    const head = `<div class="card"><h2>🏺 Mystères archéologiques</h2>
      <p class="small muted">Certaines découvertes ne livrent pas un trésor mais un indice. Chaque mystère cache trois fragments dans trois régions : explorez la zone indiquée pour localiser chaque site, envoyez une équipe de fouille, étudiez les fragments, puis résolvez l’énigme pour retrouver un lieu oublié.</p>
      ${a.active ? '' : nx ? `<p class="small">Prochain indice : explorez encore ${Math.max(0, cp.need.explored - cp.explored)} lieu(x) ou videz ${Math.max(0, cp.need.dungeons - cp.dungeons)} donjon(s)${thLevel(s) < MYSTERIES[nx].th ? ` (hôtel de ville ${MYSTERIES[nx].th} requis)` : ''}.</p>` : '<p class="small good">Tous les mystères connus sont résolus.</p>'}</div>`;
    const solved = MYSTERY_ORDER.filter((id) => a.solved[id]);
    return `${head}${a.active ? activeCard(app, a.active) : ''}
      <div class="card"><h3>🏛️ Lieux retrouvés <span class="muted small">${solved.length}/${MYSTERY_ORDER.length}</span></h3>
        ${MYSTERY_ORDER.map((id) => { const d = MYSTERIES[id], p = a.places[id]; return `<div class="row between small"><span>${a.solved[id] ? `${d.place.icon} <b>${esc(d.place.name)}</b>${p ? ` (${p.x}, ${p.y})` : ''}` : '❔ <span class="muted">Mystère non résolu</span>'}</span><span class="muted">${a.solved[id] ? esc(d.reward.text) : ''}</span></div>`; }).join('')}</div>`;
  },
  actions: {
    'arch-dig': (app, el) => app.act(() => startDig(app.state, +el.dataset.i), (r) => `⛏️ Équipe envoyée (${r.minutes} min)`),
    'arch-study': (app, el) => app.act(() => studyFragment(app.state, +el.dataset.i, el.dataset.id), (r) => `📜 ${r.text}`),
    'arch-answer': (app, el) => app.act(() => answerRiddle(app.state, +el.dataset.i), (r) => (r.correct ? `🏛️ Énigme résolue ! ${r.text}` : '❌ Mauvaise réponse')),
    'arch-abandon': (app) => { if (confirm('Mettre ce mystère de côté ? Les fragments trouvés seront perdus.')) app.act(() => abandonMystery(app.state), 'Mystère mis de côté'); },
    'goto-map': (app, el) => {
      const x = +el.dataset.x, y = +el.dataset.y;
      app.ui.cam = { x: x + 0.5, y: y + 0.5, zoom: Math.max(app.ui.cam?.zoom || 1, 1) };
      app.ui.worldSel = { x, y };
      app.go('world');
    },
  },
};
