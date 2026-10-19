// v17 — Les remparts vus de face : trois flancs et la cour, la garnison et les outils posés sur chacun. On répartit
// les troupes (− / +) et on poste les outils flanc par flanc ; le rapport de raid reprend le même schéma.
// Ne fait que lire l'état ; les règles sont celles de la défense par flancs (systems/castle.js).
import { rampartView, raidScheme } from '../systems/ramparts.js';
import { setFlanks, setTool, castleState } from '../systems/castle.js';
import { FLANKS, DEFENSE_TOOLS, ASSAULT_FLANKS } from '../data/castle.js';
import { fmt } from '../core/util.js';
import { esc } from './components.js';

const SEC = { left: [16, 206], front: [226, 416], right: [436, 626] };
const pctS = (v) => `${v >= 0 ? '+' : ''}${Math.round(v * 100)} %`;

export function rampartsCard(app) {
  const s = app.state;
  const raid = (s.raids || []).slice().sort((a, b) => a.arrive - b.arrive)[0] || null;
  const v = rampartView(s, raid);
  const stone = v.wall >= 5, wood = v.wall > 0 && !stone;
  const wallFill = stone ? '#9a958c' : wood ? '#8a5a33' : 'rgba(230,207,154,0.35)';
  const sec = (f) => {
    const [x0, x1] = SEC[f.key], cx = (x0 + x1) / 2;
    const heads = Math.min(12, Math.round(f.share * 24));
    let men = '';
    for (let i = 0; i < heads; i++) men += `<circle cx="${(x0 + 14 + i * ((x1 - x0 - 28) / 11)).toFixed(1)}" cy="62" r="5" fill="#f3e6c4" stroke="#1d1812" stroke-width="1.2"/>`;
    return `<g class="rp-sec ${f.targeted ? 'rp-target' : ''}">
      <rect x="${x0}" y="70" width="${x1 - x0}" height="70" rx="3" fill="${wallFill}" stroke="#2b2118" stroke-width="2"/>
      ${Array.from({ length: Math.floor((x1 - x0) / 20) }, (_, i) => `<rect x="${x0 + 3 + i * 20}" y="60" width="12" height="12" fill="${wallFill}" stroke="#2b2118" stroke-width="1.5"/>`).join('')}
      ${men}
      ${f.key === 'front' ? `<path d="M${cx - 26} 140V108q26-26 52 0V140z" fill="#3a2414" stroke="#1d1812" stroke-width="2"/>` : ''}
      <text x="${cx}" y="94" text-anchor="middle" class="rp-name">${esc(f.name)}</text>
      <text x="${cx}" y="114" text-anchor="middle" class="rp-val">${Math.round(f.share * 100)} % · ${fmt(f.troops)} soldats</text>
      <text x="${cx}" y="132" text-anchor="middle" class="rp-val">si attaqué : ${pctS(f.bonus)}${f.tools.length ? ` · ${f.tools.map((t) => t.icon).join(' ')}` : ''}</text>
      ${f.targeted ? `<rect x="${x0 - 4}" y="50" width="${x1 - x0 + 8}" height="96" rx="6" fill="none" stroke="#ff8a7a" stroke-width="3" stroke-dasharray="8 5"/><text x="${cx}" y="44" text-anchor="middle" class="rp-alert">⚠ flanc visé</text>` : ''}
    </g>`;
  };
  const yard = v.flanks.find((f) => f.key === 'yard');
  const svg = `<svg class="rp-svg" viewBox="0 0 642 220" role="img" aria-labelledby="rp-t rp-d"><title id="rp-t">Les remparts vus de face</title>
    <desc id="rp-d">${esc(v.flanks.map((f) => `${f.name} : ${Math.round(f.share * 100)} % de la garnison${ASSAULT_FLANKS.includes(f.key) ? `, ${pctS(f.bonus)} si attaqué` : ''}${f.tools.length ? `, outils : ${f.tools.map((t) => t.name).join(', ')}` : ''}${f.targeted ? ', flanc visé par le raid' : ''}`).join(' ; '))}.</desc>
    <rect x="0" y="0" width="642" height="150" fill="#2c3a48"/>
    ${v.moat ? `<rect x="0" y="140" width="642" height="${10 + v.moat * 2}" fill="#3f78a6"/>` : ''}
    ${[0, 210, 430, 620].map((x) => `<rect x="${x}" y="50" width="22" height="96" fill="${wallFill}" stroke="#2b2118" stroke-width="2"/>`).join('')}
    ${v.flanks.filter((f) => ASSAULT_FLANKS.includes(f.key)).map(sec).join('')}
    <rect x="0" y="${162 + v.moat * 2}" width="642" height="${58 - v.moat * 2}" fill="#6a5a3e"/>
    <text x="321" y="${190 + v.moat}" text-anchor="middle" class="rp-name">${esc(yard.name)} : ${Math.round(yard.share * 100)} % · ${fmt(yard.troops)} soldats · renforce à moitié le flanc attaqué</text>
  </svg>`;
  const C = castleState(s);
  const tools = Object.entries(DEFENSE_TOOLS);
  const ctrl = (f) => `<div class="rp-ctrl"><b>${f.icon} ${esc(f.name)}</b>
    <div class="row gap"><button class="mini" data-action="flank-step" data-k="${f.key}" data-d="-0.05" aria-label="Moins de troupes : ${esc(f.name)}">−</button><span class="num">${Math.round(f.share * 100)} %</span><button class="mini" data-action="flank-step" data-k="${f.key}" data-d="0.05" aria-label="Plus de troupes : ${esc(f.name)}">+</button></div>
    ${ASSAULT_FLANKS.includes(f.key) ? `<label class="small">Outil posté <select data-change="tool-to" data-flank="${f.key}" aria-label="Outil posté sur ${esc(f.name)}"><option value="">— aucun —</option>${tools.map(([k, d]) => `<option value="${k}" ${C.tools[k] === f.key ? 'selected' : ''} ${v.wall < d.needWall ? 'disabled' : ''}>${d.icon} ${esc(d.name)}${v.wall < d.needWall ? ` (muraille ${d.needWall})` : ''}</option>`).join('')}</select></label>` : '<span class="small muted">Réserve</span>'}
  </div>`;
  return `<div class="card rp-card"><h2>🏰 Les remparts</h2>
    <p class="small">Muraille ${v.wall} · douves ${v.moat}${v.damage ? ` · muraille abîmée à ${Math.round(v.damage * 100)} %` : ''} · ${fmt(v.soldiers)} soldats à répartir. ${v.revealed ? 'Votre tour de garde révèle le flanc visé.' : 'Une tour de garde niv. 5 révélerait le flanc visé.'}</p>
    ${svg}
    <div class="rp-ctrls">${v.flanks.map(ctrl).join('')}</div>
    <p class="small muted">Bornes : ±15 % par flanc, outils +12 % au plus ; les outils ne sont payés que s’ils servent.</p>
  </div>`;
}

export const rampartActions = {
  'flank-step': (app, el) => {
    const f = { ...castleState(app.state).flanks };
    f[el.dataset.k] = Math.max(0, Math.min(1, (f[el.dataset.k] || 0) + +el.dataset.d));
    app.act(() => setFlanks(app.state, f), null);
  },
  'tool-to': (app, el) => {
    const C = castleState(app.state), flank = el.dataset.flank;
    // L'outil choisi va sur ce flanc ; l'ancien outil du flanc retourne en réserve
    for (const [t, fl] of Object.entries(C.tools)) if (fl === flank && t !== el.value) setTool(app.state, t, null);
    app.act(() => (el.value ? setTool(app.state, el.value, flank) : { ok: true }), el.value ? 'Outil posté' : 'Flanc sans outil');
  },
};

// Schéma du rapport de raid : flanc attaqué, brèche, pertes en têtes de soldats
export function raidSchemeHtml(rep) {
  const r = raidScheme(rep);
  const cell = (k) => `<div class="rs-sec ${r.flank === k ? 'hit' : ''}"><b>${FLANKS[k].icon} ${esc(FLANKS[k].name)}</b>${r.flank === k ? `<span>${r.breached ? '💥 brèche' : r.win ? '🛡️ tenu' : '🔥 enfoncé'}</span>` : '<span class="muted">calme</span>'}</div>`;
  return `<div class="raid-scheme" role="img" aria-label="${esc(`Flanc attaqué : ${r.flank ? FLANKS[r.flank].name : 'inconnu'}${r.breached ? ', brèche' : ''}. Vos pertes : ${r.mine}. Pertes ennemies : ${r.theirs}.`)}">
    <div class="rs-wall">${ASSAULT_FLANKS.map(cell).join('')}</div>
    <div class="rs-losses"><div><b>Vos pertes</b> <span class="rs-dots mine" aria-hidden="true">${'●'.repeat(r.mineHeads)}</span> ${fmt(r.mine)}</div><div><b>Pertes ennemies</b> <span class="rs-dots theirs" aria-hidden="true">${'●'.repeat(r.theirsHeads)}</span> ${fmt(r.theirs)}</div></div>
  </div>`;
}
