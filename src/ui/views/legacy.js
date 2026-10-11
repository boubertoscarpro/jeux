// Héritage dynastique : traditions, vestiges des dynasties passées, défis ancestraux et archives.
import { TRADITIONS, MAX_TRADITIONS, MILESTONES, REMNANTS } from '../../data/legacy.js';
import { PROJECTS } from '../../data/projects.js';
import { MYSTERIES } from '../../data/archaeology.js';
import { legacyState, chooseTradition, replaceTradition, declineOffer, remnantCheck, useRemnant, remnantDist, ordinal } from '../../systems/legacy.js';
import { esc, costList, resChips } from '../components.js';
import { dateLabel } from '../../systems/chronicle.js';

function offerCard(app, l) {
  const o = l.offer;
  if (!o) return '';
  const full = l.traditions.length >= MAX_TRADITIONS;
  return `<div class="card legacy-offer"><h2>${MILESTONES[o.milestone].icon} Une étape importante : ${esc(MILESTONES[o.milestone].name)}</h2>
    <p class="small">Choisissez une tradition qui marquera votre lignée. Elle s’applique dès maintenant et sera conservée par toutes les dynasties futures${full ? ` ; vos ${MAX_TRADITIONS} emplacements sont pris : la nouvelle tradition en remplacera une` : ''}.</p>
    <div class="legacy-grid">${o.choices.map((id) => { const t = TRADITIONS[id]; return `<div class="legacy-trad"><b>${t.icon} ${esc(t.name)}</b><div class="small">${esc(t.desc)}</div>
      ${full ? `<select data-change="noop" id="rep-${id}">${l.traditions.map((x) => `<option value="${x}">Remplacer ${esc(TRADITIONS[x].name)}</option>`).join('')}</select><button class="mini primary" data-action="trad-replace" data-id="${id}">Adopter</button>` : `<button class="mini primary" data-action="trad-choose" data-id="${id}">Adopter</button>`}</div>`; }).join('')}</div>
    <button class="mini ghost" data-action="trad-decline">Renoncer à cette étape</button></div>`;
}

export default {
  id: 'legacy', title: 'Héritage', icon: '👑',
  badge: (app) => (app.state.legacy?.offer ? 1 : 0),
  render(app) {
    const s = app.state, l = legacyState(s);
    const trads = `<div class="card"><h2>👑 Traditions dynastiques <span class="muted small">${l.traditions.length}/${MAX_TRADITIONS}</span></h2>
      <p class="small muted">Après chaque grande étape (${Object.values(MILESTONES).map((m) => esc(m.name.split(' :')[0])).join(', ')}), choisissez une tradition. Les traditions sont permanentes et se transmettent d’une dynastie à l’autre.</p>
      ${l.traditions.length ? `<div class="legacy-grid">${l.traditions.map((id) => `<div class="legacy-trad owned"><b>${TRADITIONS[id].icon} ${esc(TRADITIONS[id].name)}</b><div class="small">${esc(TRADITIONS[id].desc)}</div></div>`).join('')}</div>` : '<p class="small muted">Aucune tradition pour l’instant.</p>'}
      <div class="small muted">Étapes de cette dynastie : ${Object.entries(MILESTONES).map(([k, m]) => `${l.milestones[k] ? '✅' : '⬜'} ${esc(m.name.split(' :')[0])}`).join(' · ')}</div></div>`;
    const rem = l.remnants.length ? `<div class="card"><h2>🏚️ Vestiges des dynasties passées</h2>
      <p class="small muted">Les avant-postes et les monuments de vos ancêtres subsistent dans ce nouveau monde. Explorez les environs pour les retrouver, puis relevez une forteresse (elle redevient un avant-poste, au niveau qu’elle avait), démontez-la pour ses matériaux, ou restaurez un monument (production +2 %, permanent).</p>
      ${l.remnants.map((r, i) => {
        const def = REMNANTS[r.kind];
        const done = r.done || r.restored;
        const ck = remnantCheck(s, i, 'restore');
        const lk = r.kind === 'fort' ? remnantCheck(s, i, 'loot') : null;
        return `<div class="legacy-remnant ${done ? 'done' : ''}"><div class="row between wrap"><b>${def.icon} ${esc(r.name)}</b><span class="small muted">${ordinal(r.dynasty)} dynastie · (${r.x}, ${r.y}) · ${Math.round(remnantDist(s, r))} cases</span></div>
          ${done ? `<div class="small ok">${r.done === 'loot' ? 'Ruines démontées' : r.kind === 'fort' ? 'Forteresse relevée' : 'Monument restauré'}.</div>`
            : `<div class="row gap wrap">${ck.ok ? `${costList(ck.cost, s)}<button class="mini primary" data-action="remnant" data-i="${i}" data-id="restore">${r.kind === 'fort' ? `Relever (avant-poste niv. ${r.level})` : 'Restaurer'}</button>` : `<span class="req small">${esc(ck.reason)}</span>`}
              ${lk?.ok ? `<button class="mini" data-action="remnant" data-i="${i}" data-id="loot">Démonter : ${resChips(lk.gain)}</button>` : ''}</div>`}</div>`;
      }).join('')}</div>` : '';
    const ch = l.challenges.length ? `<div class="card"><h3>⚜️ Défis ancestraux</h3>${l.challenges.map((c) => `<div class="small">${c.done ? '✅' : '⬜'} ${esc(c.text)} <span class="gold-text">+${c.points} points d’héritage</span></div>`).join('')}</div>` : '';
    const arch = `<div class="card"><h3>📚 Archives des dynasties</h3>${l.archives.length ? l.archives.map((a) => `<div class="legacy-archive"><b>${ordinal(a.n)} dynastie — ${esc(a.kingdom)}</b> <span class="small muted">${esc(a.castle)} · ${esc(dateLabel(s, a.from))} → ${esc(dateLabel(s, a.to))}</span>
      <div class="small">Hôtel de ville ${a.th} · ${a.outposts.length} avant-poste(s) principal(aux)${a.outposts.length ? ` (${a.outposts.map((o) => esc(o.name)).join(', ')})` : ''} · ${a.battles} batailles gagnées · ${a.bosses} boss · ${a.victories} campagne(s) victorieuse(s)</div>
      ${a.projects.length ? `<div class="small">Grands projets : ${a.projects.map((id) => esc(PROJECTS[id]?.name || id)).join(', ')}</div>` : ''}
      ${a.mysteries.length ? `<div class="small">Mystères résolus : ${a.mysteries.map((id) => esc(MYSTERIES[id]?.place.name || id)).join(', ')}</div>` : ''}
      ${a.allies.length || a.foes.length ? `<div class="small muted">Alliés : ${esc(a.allies.join(', ') || '—')} · Ennemis : ${esc(a.foes.join(', ') || '—')}</div>` : ''}</div>`).join('') : '<p class="small muted">Les exploits de votre dynastie seront archivés lorsque vous fonderez une nouvelle dynastie (onglet Talents, hôtel de ville 15). Vos avant-postes et grands projets deviendront alors des vestiges à retrouver.</p>'}</div>`;
    return offerCard(app, l) + trads + rem + ch + arch;
  },
  actions: {
    'trad-choose': (app, el) => app.act(() => chooseTradition(app.state, el.dataset.id), (r) => `👑 Tradition adoptée : ${r.name}`),
    'trad-replace': (app, el) => app.act(() => replaceTradition(app.state, document.getElementById('rep-' + el.dataset.id)?.value, el.dataset.id), (r) => `👑 Tradition adoptée : ${r.name}`),
    'trad-decline': (app) => app.act(() => declineOffer(app.state), 'Étape passée'),
    remnant: (app, el) => app.act(() => useRemnant(app.state, +el.dataset.i, el.dataset.id), (r) => `🏚️ ${r.text}`),
    noop: () => {},
  },
};
