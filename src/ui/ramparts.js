// v17 — Les remparts vus de face : trois flancs et la cour, la garnison et ce qui est posé sur chacun.
// v19 « L'Art du siège » : protections par flanc (muraille, porte, douves), engins de défense posés (glisser-déposer
// depuis l'arsenal, ou − / + au clavier), renseignement de la tour de guet, défense conseillée et 3 plans enregistrés.
// Ne fait que lire l'état ; les règles sont dans systems/siege.js.
import { FLANKS, ASSAULT_FLANKS } from '../data/castle.js';
import { DEFENSE_ENGINES, ATTACK_ENGINES, SIEGE_RULES, INTEL, PLAN_SLOTS } from '../data/siege.js';
import { castleState, fortLevel } from '../systems/castle.js';
import { armyTotals } from '../systems/economy.js';
import { raidScheme } from '../systems/ramparts.js';
import {
  siegeState, castleProtections, flankEffects, postEngine, stepShare, defenseLimit, raidIntel, advisedDefense, applyDefense,
  savePlan, loadDefensePlan, engineUnlocked,
} from '../systems/siege.js';
import { a11yPrefs } from '../systems/a11y.js';
import { fmt } from '../core/util.js';
import { esc } from './components.js';
import { siegeReportHtml } from './siegeUi.js';

const SEC = { left: [16, 206], front: [226, 416], right: [436, 626] };
const pctP = (v) => `+${Math.round(v * 100)} %`;
const sumO = (o) => Object.values(o || {}).reduce((a, b) => a + b, 0);
const engLine = (e) => Object.entries(e || {}).filter(([, n]) => n > 0).map(([k, n]) => `${(DEFENSE_ENGINES[k] || ATTACK_ENGINES[k]).icon} ${n}`).join(' ');
const engText = (e) => Object.entries(e || {}).filter(([, n]) => n > 0).map(([k, n]) => `${n} ${(DEFENSE_ENGINES[k] || ATTACK_ENGINES[k]).name.toLowerCase()}`).join(', ');

export function firstRaid(s) { return (s.raids || []).slice().sort((a, b) => a.arrive - b.arrive)[0] || null; }

// Le renseignement de la tour de guet, par étapes : troupes (niv. 3) → engins (niv. 4) → flanc (niv. 5) → exact (niv. 8)
export function raidIntelHtml(s, raid) {
  if (!raid) return '';
  const I = raidIntel(s, raid);
  const row = (ok, need, label, val) => `<li class="${ok ? '' : 'muted'}"><b>${label}</b> : ${ok ? val : `inconnu (tour de garde niv. ${need})`}</li>`;
  return `<div class="panel-sub sg-intel"><h4>👁️ Ce que voit la tour de garde (niv. ${I.level})</h4><ul class="small">
    ${row(I.troops != null, INTEL.troops, 'Troupes', `${I.level >= INTEL.exact ? '' : 'environ '}${fmt(I.troops)} soldats`)}
    ${row(!!I.engines, INTEL.engines, 'Engins', I.engines ? (engText(I.engines) || 'aucun') : '')}
    ${row(!!I.flank, INTEL.flank, 'Flanc principal', I.flank ? `<b>${esc(FLANKS[I.flank].name)}</b>` : '')}
    ${I.adapt ? `<li class="warn-text"><b>Adaptation</b> : ${esc(I.adapt)}</li>` : ''}
    ${I.level < INTEL.exact ? `<li class="muted">Les chiffres sont arrondis ; une tour de garde niv. ${INTEL.exact} les donne exacts.</li>` : ''}
  </ul></div>`;
}

export function rampartsCard(app) {
  const s = app.state;
  const raid = firstRaid(s);
  const S = siegeState(s);
  const prot = castleProtections(s);
  const one = prot.oneFlank;
  const C = castleState(s);
  const sh = one ? { left: 0, front: 1, right: 0, yard: 0 } : { left: 0.25, front: 0.25, right: 0.25, yard: 0.25, ...C.flanks };
  const totSh = sumO(sh) || 1;
  const soldiers = Object.entries(armyTotals(s)).filter(([u]) => !['scout', 'spy'].includes(u)).reduce((a, [, n]) => a + n, 0);
  const wl = fortLevel(s, 'wall'), ml = fortLevel(s, 'moat');
  const I = raid ? raidIntel(s, raid) : null;
  const target = I?.flank || null;
  const lim = defenseLimit(s);
  const stone = wl >= 5, wood = wl > 0 && !stone;
  const wallFill = stone ? '#9a958c' : wood ? '#8a5a33' : 'rgba(230,207,154,0.35)';
  const flanks = one ? ['front'] : ASSAULT_FLANKS;
  const fx = Object.fromEntries(flanks.map((f) => [f, flankEffects({}, S.posted[f], prot, f)]));
  const sec = (f) => {
    const [x0, x1] = SEC[f], cx = (x0 + x1) / 2;
    const share = (sh[f] || 0) / totSh;
    const heads = Math.min(12, Math.round(share * 24));
    let men = '';
    for (let i = 0; i < heads; i++) men += `<circle cx="${(x0 + 14 + i * ((x1 - x0 - 28) / 11)).toFixed(1)}" cy="62" r="5" fill="#f3e6c4" stroke="#1d1812" stroke-width="1.2"/>`;
    const eng = engLine(S.posted[f]);
    const targeted = target === f || (one && raid);
    return `<g class="rp-sec ${targeted ? 'rp-target' : ''}">
      <rect x="${x0}" y="70" width="${x1 - x0}" height="70" rx="3" fill="${wallFill}" stroke="#2b2118" stroke-width="2"/>
      ${Array.from({ length: Math.floor((x1 - x0) / 20) }, (_, i) => `<rect x="${x0 + 3 + i * 20}" y="60" width="12" height="12" fill="${wallFill}" stroke="#2b2118" stroke-width="1.5"/>`).join('')}
      ${men}
      ${f === 'front' ? `<path d="M${cx - 26} 140V108q26-26 52 0V140z" fill="#3a2414" stroke="#1d1812" stroke-width="2"/>${fx.front.herse > 0 ? `<path d="M${cx - 20} 112V140M${cx - 10} 104V140M${cx} 101V140M${cx + 10} 104V140M${cx + 20} 112V140M${cx - 24} 120H${cx + 24}M${cx - 24} 130H${cx + 24}" stroke="#c9c3b6" stroke-width="2"/>` : ''}` : ''}
      <text x="${cx}" y="88" text-anchor="middle" class="rp-name">${esc(FLANKS[f].name)}</text>
      <text x="${cx}" y="106" text-anchor="middle" class="rp-val">${Math.round(share * 100)} % · ${fmt(Math.round(soldiers * share))} soldats</text>
      <text x="${cx}" y="124" text-anchor="middle" class="rp-val">protection ${pctP(fx[f].fort)}</text>
      ${eng ? `<text x="${cx}" y="160" text-anchor="middle" class="rp-eng">${esc(eng)}</text>` : ''}
      ${targeted ? `<rect x="${x0 - 4}" y="50" width="${x1 - x0 + 8}" height="96" rx="6" fill="none" stroke="#ff8a7a" stroke-width="3" stroke-dasharray="8 5"/><text x="${cx}" y="44" text-anchor="middle" class="rp-alert">⚠ flanc visé</text>` : ''}
    </g>`;
  };
  const yardShare = (sh.yard || 0) / totSh;
  const svg = `<svg class="rp-svg" viewBox="0 0 642 236" role="img" aria-labelledby="rp-t rp-d"><title id="rp-t">Les remparts vus de face</title>
    <desc id="rp-d">${esc(flanks.map((f) => `${FLANKS[f].name} : ${Math.round(((sh[f] || 0) / totSh) * 100)} % de la garnison, protection ${pctP(fx[f].fort)}${sumO(S.posted[f]) ? `, engins : ${engText(S.posted[f])}` : ', aucun engin'}${target === f ? ', flanc visé par le raid' : ''}`).join(' ; '))}${one ? '' : ` ; cour : ${Math.round(yardShare * 100)} % en réserve`}.</desc>
    <rect x="0" y="0" width="642" height="150" fill="#2c3a48"/>
    ${ml ? `<rect x="0" y="140" width="642" height="${10 + ml * 2}" fill="#3f78a6"/>` : ''}
    ${[0, 210, 430, 620].map((x) => `<rect x="${x}" y="50" width="22" height="96" fill="${wallFill}" stroke="#2b2118" stroke-width="2"/>`).join('')}
    ${flanks.map(sec).join('')}
    <rect x="0" y="${170 + ml * 2}" width="642" height="${66 - ml * 2}" fill="#6a5a3e"/>
    <text x="321" y="${200 + ml}" text-anchor="middle" class="rp-name">${one ? 'Un seul front : toute la garnison défend la porte' : `${esc(FLANKS.yard.name)} : ${Math.round(yardShare * 100)} % · ${fmt(Math.round(soldiers * yardShare))} soldats · accourt au flanc attaqué`}</text>
  </svg>`;
  // Arsenal de défense : jetons à glisser sur un flanc (le clavier passe par les − / + de chaque flanc)
  const free = (k) => (S.arsenal.defense[k] || 0) - ASSAULT_FLANKS.reduce((a, f) => a + (S.posted[f][k] || 0), 0);
  const unlocked = Object.keys(DEFENSE_ENGINES).filter((k) => engineUnlocked(s, k));
  const chips = unlocked.map((k) => { const d = DEFENSE_ENGINES[k], n = free(k); return `<span class="chip sg-chip ${n > 0 ? '' : 'empty'}" ${n > 0 ? `draggable="true" data-drag="${k}"` : ''} title="${esc(d.desc)} Glissez sur un flanc, ou utilisez les boutons + du flanc.">${d.icon} ${esc(d.name)} <b>${n}</b> libre${n > 1 ? 's' : ''}</span>`; }).join('');
  const ctrl = (f) => {
    const posted = S.posted[f] || {};
    const rows = unlocked.filter((k) => (!DEFENSE_ENGINES[k].flanks || DEFENSE_ENGINES[k].flanks.includes(f)) && ((posted[k] || 0) > 0 || free(k) > 0)).map((k) => {
      const d = DEFENSE_ENGINES[k], n = posted[k] || 0;
      return `<div class="sg-eng-row"><span title="${esc(d.desc)}">${d.icon} ${esc(d.name)}</span><span class="row gap"><button class="mini" data-action="sg-post" data-f="${f}" data-k="${k}" data-d="-1" ${n > 0 ? '' : 'disabled'} aria-label="Retirer : ${esc(d.name)}, ${esc(FLANKS[f].name)}">−</button><span class="num" aria-live="polite">${n}</span><button class="mini" data-action="sg-post" data-f="${f}" data-k="${k}" data-d="1" ${free(k) > 0 && sumO(posted) < lim ? '' : 'disabled'} aria-label="Poser : ${esc(d.name)}, ${esc(FLANKS[f].name)}">+</button></span></div>`;
    }).join('');
    const share = Math.round(((sh[f] || 0) / totSh) * 100);
    return `<div class="rp-ctrl sg-drop" data-drop="sg-drop" data-f="${f}" aria-label="${esc(FLANKS[f].name)}"><b>${FLANKS[f].icon} ${esc(FLANKS[f].name)}</b>
      <div class="small">${f === 'front' ? `Porte ${pctP(prot.gate + fx.front.herse)}` : `Muraille ${pctP(prot.wall)}`}${prot.moat ? ` · douves ${pctP(prot.moat)}` : ''}</div>
      ${one ? '' : `<div class="row gap"><button class="mini" data-action="flank-step" data-k="${f}" data-d="-0.05" aria-label="Moins de troupes : ${esc(FLANKS[f].name)}">−</button><span class="num">${share} %</span><button class="mini" data-action="flank-step" data-k="${f}" data-d="0.05" aria-label="Plus de troupes : ${esc(FLANKS[f].name)}">+</button></div>`}
      <div class="small muted">Engins : ${sumO(posted)} / ${lim}</div>
      ${rows || '<div class="small muted">Aucun engin disponible.</div>'}
    </div>`;
  };
  const yardCtrl = one ? '' : `<div class="rp-ctrl"><b>${FLANKS.yard.icon} ${esc(FLANKS.yard.name)}</b>
    <div class="row gap"><button class="mini" data-action="flank-step" data-k="yard" data-d="-0.05" aria-label="Moins de troupes : ${esc(FLANKS.yard.name)}">−</button><span class="num">${Math.round(yardShare * 100)} %</span><button class="mini" data-action="flank-step" data-k="yard" data-d="0.05" aria-label="Plus de troupes : ${esc(FLANKS.yard.name)}">+</button></div>
    <span class="small muted">Réserve : accourt aux flancs attaqués, puis tient la cour si un flanc cède.</span></div>`;
  const P = S.plans.defense;
  const plans = Array.from({ length: PLAN_SLOTS }, (_, i) => `<span class="sg-plan">${P[i] ? `<button class="mini" data-action="sg-dplan-load" data-i="${i}">${i + 1}. ${esc(P[i].name)}</button>` : `<span class="small muted">${i + 1}. vide</span>`}<button class="mini ghost" data-action="sg-dplan-save" data-i="${i}" aria-label="Enregistrer la défense actuelle dans le plan ${i + 1}">💾</button></span>`).join('');
  const simple = a11yPrefs(s).simple;
  return `<div class="card rp-card"><h2>🏰 Les remparts</h2>
    <p class="small">Muraille ${wl} · douves ${ml}${C.wallDmg ? ` · muraille abîmée à ${Math.round(C.wallDmg * 100)} %` : ''} · ${fmt(soldiers)} soldats. Protections : muraille ${pctP(prot.wall)} (flancs), porte ${pctP(prot.gate)} (front), douves ${pctP(prot.moat)} (partout).
      ${one ? `<br><b>Un seul front</b> tant que la muraille est sous le niveau ${SIEGE_RULES.flanksAtWall} : les assaillants frappent la porte, toute la garnison la défend.` : ''}</p>
    ${raidIntelHtml(s, raid)}
    ${svg}
    <div class="row gap wrap sg-tools"><button class="btn primary" data-action="sg-advise-def" title="Répartit la garnison et pose les engins de l’arsenal face à ce que la tour de garde annonce">🧭 Défense conseillée</button>${plans}</div>
    ${simple ? '<p class="small ok">Mode simplifié : la défense conseillée est appliquée d’elle-même dès qu’un raid est repéré.</p>' : ''}
    ${unlocked.length ? `<div class="sg-chips" aria-label="Engins de défense libres à l’arsenal">${chips}</div>` : `<p class="small muted">Les engins de défense se fabriquent à l’arsenal dès la muraille niv. 1.</p>`}
    <div class="rp-ctrls">${flanks.map(ctrl).join('')}${yardCtrl}</div>
    <p class="small muted">Chaque engin a un contre et un effet dégressif (le 10e apporte moins que le 2e) ; au plus ${lim} engins par flanc. Après un raid, les engins qui ont servi sont consommés (la moitié sur un flanc qui tient).</p>
  </div>`;
}

const post = (app, f, k, d) => {
  const S = siegeState(app.state);
  app.act(() => postEngine(app.state, f, k, (S.posted[f][k] || 0) + d), null);
};
export const rampartActions = {
  'flank-step': (app, el) => app.act(() => stepShare(app.state, el.dataset.k, +el.dataset.d), null),
  'sg-post': (app, el) => post(app, el.dataset.f, el.dataset.k, +el.dataset.d),
  // Glisser-déposer : un jeton d'engin lâché sur un flanc y pose jusqu'à 5 engins de ce type
  'sg-drop': (app, el) => { const k = el.dataset.payload; if (DEFENSE_ENGINES[k]) post(app, el.dataset.f, k, 5); },
  'sg-advise-def': (app) => {
    const d = advisedDefense(app.state, firstRaid(app.state));
    app.act(() => applyDefense(app.state, d), `Défense conseillée appliquée${d.why.length ? ' : ' + d.why.join(' ; ') : ''}`);
  },
  'sg-dplan-load': (app, el) => app.act(() => loadDefensePlan(app.state, +el.dataset.i), (r) => `Plan « ${r.name} » chargé`),
  'sg-dplan-save': (app, el) => {
    const i = +el.dataset.i;
    const old = siegeState(app.state).plans.defense[i];
    const name = prompt('Nom du plan de défense', old?.name || ['Porte', 'Flancs', 'Équilibré'][i]);
    if (name === null) return;
    app.act(() => savePlan(app.state, 'defense', i, name), `Plan de défense « ${name} » enregistré`);
  },
};

// Schéma du rapport de raid : v19, flanc par flanc puis la cour ; les anciens rapports gardent le schéma v17
export function raidSchemeHtml(rep) {
  if (rep.result?.report?.flanks) return siegeReportHtml(rep);
  const r = raidScheme(rep);
  const cell = (k) => `<div class="rs-sec ${r.flank === k ? 'hit' : ''}"><b>${FLANKS[k].icon} ${esc(FLANKS[k].name)}</b>${r.flank === k ? `<span>${r.breached ? '💥 brèche' : r.win ? '🛡️ tenu' : '🔥 enfoncé'}</span>` : '<span class="muted">calme</span>'}</div>`;
  return `<div class="raid-scheme" role="img" aria-label="${esc(`Flanc attaqué : ${r.flank ? FLANKS[r.flank].name : 'inconnu'}${r.breached ? ', brèche' : ''}. Vos pertes : ${r.mine}. Pertes ennemies : ${r.theirs}.`)}">
    <div class="rs-wall">${ASSAULT_FLANKS.map(cell).join('')}</div>
    <div class="rs-losses"><div><b>Vos pertes</b> <span class="rs-dots mine" aria-hidden="true">${'●'.repeat(r.mineHeads)}</span> ${fmt(r.mine)}</div><div><b>Pertes ennemies</b> <span class="rs-dots theirs" aria-hidden="true">${'●'.repeat(r.theirsHeads)}</span> ${fmt(r.theirs)}</div></div>
  </div>`;
}
