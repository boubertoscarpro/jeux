// v20 « Ma forteresse » — Terres lointaines : trois comptoirs fortifiés, fondés depuis un avant-poste, qui produisent
// modestement une ressource rare existante. Les menaces arrivent à date connue ; une défaite suspend la production.
import { FARLANDS, FAR } from '../../data/farlands.js';
import { RESOURCES } from '../../data/resources.js';
import { UNITS } from '../../data/units.js';
import { farlandList, baseCamps, foundFarland, upgradeCheck, upgradeFarland, fillFarGarrison, recallFarGarrison, farProd, garrisonAdvice, threatUnits } from '../../systems/farlands.js';
import { fmt, fmtTime } from '../../core/util.js';
import { esc, costList, countdown } from '../components.js';

const unitSum = (u) => Object.values(u || {}).reduce((a, b) => a + b, 0);
const units = (u) => Object.entries(u).map(([k, n]) => `${UNITS[k]?.icon || ''} ${n} ${esc(UNITS[k]?.name || k)}`).join(', ');

function landCard(app, L) {
  const s = app.state, now = Date.now(), f = L.f, r = RESOURCES[L.res];
  if (!f) {
    const camps = baseCamps(s);
    return `<div class="card far-card ${L.open ? '' : 'locked'}"><h3>${L.icon} ${esc(L.name)}</h3>
      <p class="small muted">${esc(L.desc)}</p>
      <p class="small">Ressource : ${r.icon} ${esc(r.name)} · jusqu’à ${fmt(FAR.prodPerLevel * FAR.maxLevel)} par heure au niveau ${FAR.maxLevel}. Menace : ${esc(L.threat.name)}.</p>
      ${!L.open ? `<div class="req">Hôtel de ville niv. ${L.th} requis</div>`
        : L.check.ok ? `<div class="b-opt-foot">${costList(L.check.cost, s)}${camps.length > 1 ? `<label class="small">Camp de base <select id="far-base-${L.key}">${camps.map((c) => `<option value="${c.k}">${esc(c.t.name || c.k)} · niv. ${c.t.level || 1}</option>`).join('')}</select></label>` : `<span class="small muted">Camp de base : ${esc(camps[0].t.name || camps[0].k)}</span>`}<button class="mini primary" data-action="far-found" data-k="${L.key}">Fonder le comptoir</button></div>`
          : `<div class="req">${esc(L.check.reason)}</div>${L.check.cost ? `<div class="b-opt-foot">${costList(L.check.cost, s)}</div>` : ''}`}
    </div>`;
  }
  const up = upgradeCheck(s, L.key, 'level'), wall = upgradeCheck(s, L.key, 'wall');
  const halted = f.haltUntil > now;
  const g = unitSum(f.garrison), need = garrisonAdvice(f);
  return `<div class="card far-card"><h3>${L.icon} ${esc(L.name)} <span class="lvl">niv. ${f.level}/${FAR.maxLevel}</span></h3>
    <div class="small">${halted ? `⏸ Production suspendue encore ${countdown(f.haltUntil)} (menace perdue ; rien n’est détruit)` : `✔ Produit ${r.icon} ${fmt(farProd(f))} ${esc(r.name.toLowerCase())} par heure`} · ${fmt(f.produced)} au total</div>
    <div class="small">🛡️ Garnison : ${g ? units(f.garrison) : 'aucune'} <span class="${g >= need ? 'ok' : 'warn-text'}">(conseillé : ${need})</span> · palissade niv. ${f.wall}/${FAR.maxWall} (+${Math.round(FAR.wallDef * f.wall * 100)} % de défense)</div>
    <div class="small">⚔️ Prochaine menace : ${esc(L.threat.name)} (${units(threatUnits(L.key, f))}) dans ${countdown(f.nextAt)} · bilan ${f.won} repoussée${f.won > 1 ? 's' : ''}, ${f.lost} perdue${f.lost > 1 ? 's' : ''}</div>
    <div class="row gap wrap">
      <button class="mini" data-action="far-fill" data-k="${L.key}" ${g >= need ? 'disabled title="Garnison complète"' : ''}>Compléter la garnison</button>
      <button class="mini ghost" data-action="far-recall" data-k="${L.key}" ${g ? '' : 'disabled'}>Rappeler la garnison</button>
      ${up.ok ? `<span class="b-opt-foot">${costList(up.cost, s)}<button class="mini primary" data-action="far-up" data-k="${L.key}" data-w="level">Agrandir le comptoir</button></span>` : `<span class="small muted">Comptoir : ${esc(up.reason)}</span>`}
      ${wall.ok ? `<span class="b-opt-foot">${costList(wall.cost, s)}<button class="mini" data-action="far-up" data-k="${L.key}" data-w="wall">Renforcer la palissade</button></span>` : `<span class="small muted">Palissade : ${esc(wall.reason)}</span>`}
    </div></div>`;
}

export default {
  id: 'farlands', title: 'Terres lointaines', icon: '🏔️',
  render(app) {
    const list = farlandList(app.state);
    return `<div class="card"><h2>🏔️ Terres lointaines</h2>
      <p class="small muted">Trois contrées extrêmes, au-delà des cartes. Un comptoir fortifié s’y fonde depuis un avant-poste de niveau ${FAR.baseLevel} (le camp de base). Il produit peu, mais régulièrement, une ressource rare que vous connaissez déjà. Les menaces y sont plus dures et arrivent à date annoncée (toutes les ${FAR.threatEvery[0]} à ${FAR.threatEvery[1]} heures) ; une défaite suspend la production ${FAR.haltHours} h, sans rien détruire.</p></div>
      <div class="far-grid">${list.map((L) => landCard(app, L)).join('')}</div>`;
  },
  actions: {
    'far-found': (app, el) => { const sel = document.getElementById('far-base-' + el.dataset.k); app.act(() => foundFarland(app.state, el.dataset.k, sel?.value || null), `${FARLANDS[el.dataset.k].icon} Comptoir fondé`); },
    'far-up': (app, el) => app.act(() => upgradeFarland(app.state, el.dataset.k, el.dataset.w), el.dataset.w === 'wall' ? 'Palissade renforcée' : 'Comptoir agrandi'),
    'far-fill': (app, el) => app.act(() => fillFarGarrison(app.state, el.dataset.k), (r) => `${r.moved} soldat${r.moved > 1 ? 's' : ''} en route vers le comptoir`),
    'far-recall': (app, el) => app.act(() => recallFarGarrison(app.state, el.dataset.k), 'Garnison rappelée au château'),
  },
};
void fmtTime;
