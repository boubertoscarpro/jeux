import { coatSvg, sealSvg } from '../heraldry.js';
import { heraldryOf } from '../../systems/heraldry.js';
import { SEASONS } from '../../data/seasons.js';
import { calendar, CHRONICLE_CATS, chronicleCat } from '../../systems/chronicle.js';
import { esc } from '../components.js';

export default {
  id: 'history', title: 'Histoire', icon: '📜',
  render(app) {
    const s = app.state;
    const cal = calendar(s);
    const cat = CHRONICLE_CATS[app.ui.histCat] ? app.ui.histCat : 'all';
    const counts = {};
    for (const h of s.history || []) { const c = h.cat || chronicleCat(h.text, h.kind); counts[c] = (counts[c] || 0) + 1; }
    const byYear = {};
    for (const h of s.history || []) if (cat === 'all' || (h.cat || chronicleCat(h.text, h.kind)) === cat) (byYear[h.year] ||= []).push(h);
    const years = Object.keys(byYear).map(Number).sort((a, b) => b - a);
    return `<div class="card"><div class="archive-head">${coatSvg(s, 44)}<div><h2>📜 Chronique de ${esc(s.meta.kingdomName)}</h2>${heraldryOf(s).motto ? `<div class="small muted"><i>« ${esc(heraldryOf(s).motto)} »</i></div>` : ''}</div>${sealSvg(s, 40)}</div>
      <p class="muted small">Nous sommes en l’an ${cal.year}, ${cal.season.icon} ${cal.season.name.toLowerCase()}. Chaque saison dure 3 heures. Les grands faits du royaume s’inscrivent ici : découvertes, guerres, traités, catastrophes, artefacts… C’est l’histoire que vous écrivez.</p>
      <div class="seg wrap hist-cats"><button class="mini ${cat === 'all' ? 'selected' : ''}" data-action="hist-cat" data-k="all">📜 Tout (${(s.history || []).length})</button>${Object.entries(CHRONICLE_CATS).filter(([k]) => counts[k]).map(([k, c]) => `<button class="mini ${cat === k ? 'selected' : ''}" data-action="hist-cat" data-k="${k}">${c.icon} ${esc(c.name)} (${counts[k]})</button>`).join('')}</div></div>
      ${years.map((y) => `<div class="card year"><h3>An ${y}</h3>${byYear[y].slice().reverse().map((h) => `<div class="hist"><span class="hist-season">${SEASONS.find((x) => x.key === h.season)?.icon || ''}</span> <span class="hist-cat" title="${esc(CHRONICLE_CATS[h.cat || chronicleCat(h.text, h.kind)]?.name || '')}">${CHRONICLE_CATS[h.cat || chronicleCat(h.text, h.kind)]?.icon || ''}</span> ${esc(h.text)}</div>`).join('')}</div>`).join('') || '<div class="empty">L’histoire de votre royaume reste à écrire.</div>'}`;
  },
  actions: { 'hist-cat': (app, el) => { app.ui.histCat = el.dataset.k; app.render(); } },
};
