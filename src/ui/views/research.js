import { TECHS, BRANCHES, MAX_MASTERIES, techCost, techLibraryReq } from '../../data/techs.js';
import { fmtTime } from '../../core/util.js';
import { computeMods } from '../../systems/modifiers.js';
import { techStatus, startResearch, researchTime, masteriesTaken } from '../../systems/research.js';
import { levelOf } from '../../systems/city.js';
import { esc, costList, countdown, progress } from '../components.js';

export default {
  id: 'research', title: 'Recherche', icon: '📜',
  render(app) {
    const s = app.state;
    const mods = computeMods(s);
    const lib = levelOf(s, 'library');
    const active = s.queues.research[0];
    const branch = app.ui.branch || null;
    const branches = Object.entries(BRANCHES).filter(([k]) => !branch || k === branch);
    return `<div class="card"><h2>📜 Arbre technologique</h2>
      <p class="muted small">${lib ? `Bibliothèque niv. ${lib} · vitesse de recherche +${Math.round((mods['research.speed'] || 0) * 100)}%` : '⚠️ Construisez une Bibliothèque pour rechercher.'}
       · Maîtrises : <b>${masteriesTaken(s)}/${MAX_MASTERIES}</b> — vous ne pourrez pas tout maîtriser : spécialisez votre royaume. Certaines doctrines sont <b>exclusives</b>.</p>
      ${active ? `<div class="panel-sub">En cours : <b>${esc(TECHS[active.tech].name)}</b> · ${countdown(active.end)}${progress(active.start, active.end)}</div>` : ''}
      <div class="tabs"><button class="tab ${!branch ? 'active' : ''}" data-action="branch" data-b="">Toutes</button>${Object.entries(BRANCHES).map(([k, b]) => `<button class="tab ${branch === k ? 'active' : ''}" data-action="branch" data-b="${k}">${b.icon} ${esc(b.name)}</button>`).join('')}</div>
    </div>
    <div class="tech-tree">${branches.map(([bk, b]) => {
      const techs = Object.entries(TECHS).filter(([, t]) => t.branch === bk).sort((a, c) => a[1].tier - c[1].tier);
      const done = techs.filter(([id]) => s.techs[id]).length;
      return `<div class="branch"><h3>${b.icon} ${esc(b.name)} <span class="muted small">${done}/${techs.length}</span></h3><div class="muted small">${esc(b.desc)}</div>
        ${techs.map(([id, t]) => {
          const st = techStatus(s, id);
          return `<div class="tech tech-${st.status} ${t.mastery ? 'mastery' : ''}">
            <div class="tech-head"><b>${esc(t.name)}</b><span class="tier">T${t.tier}</span></div>
            <div class="small">${esc(t.desc)}</div>
            ${t.excl ? '<div class="small warn-text">⚖ Choix exclusif</div>' : ''}${t.mastery ? '<div class="small gold-text">★ Maîtrise</div>' : ''}
            ${st.status === 'done' ? '<div class="small ok">✔ Acquise</div>' : st.status === 'active' ? '<div class="small">⏳ En cours</div>' : `
              <div class="tech-cost">${costList(techCost(id), s)} <span class="muted small">⏱ ${fmtTime(researchTime(id, mods))}${techLibraryReq(id) > 1 ? ` · Bibl. ${techLibraryReq(id)}` : ''}</span></div>
              ${st.status === 'available' ? `<button class="mini primary" data-action="research" data-id="${id}" ${active ? 'disabled' : ''}>Rechercher</button>` : `<div class="req small">${esc(st.reason)}</div>`}`}
          </div>`;
        }).join('')}</div>`;
    }).join('')}</div>`;
  },
  actions: {
    branch: (app, el) => { app.ui.branch = el.dataset.b || null; app.render(); },
    research: (app, el) => app.act(() => startResearch(app.state, el.dataset.id), 'Recherche lancée'),
  },
};
