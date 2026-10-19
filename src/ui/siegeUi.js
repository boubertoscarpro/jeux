// v19 « L'Art du siège » — écrans du siège : arsenal et production, plan de siège d'une marche (vagues × flancs,
// répartition conseillée, plans enregistrés, conseil de guerre), rapport flanc par flanc puis la cour, avec un court
// rejeu animé (désactivé par « réduire les animations »). Les règles sont dans systems/siege.js.
import { FLANKS, ASSAULT_FLANKS } from '../data/castle.js';
import { ATTACK_ENGINES, DEFENSE_ENGINES, PLAN_SLOTS } from '../data/siege.js';
import { UNITS, ALL_UNITS } from '../data/units.js';
import {
  siegeState, arsenalCap, stockTotal, engineUnlocked, unlockText, engineCost, engineTime, startEngines, cancelEngines, setMinStock,
  attackWorkshop, defenseWorkshop, attackLimit, maxWaves, advisedAttackPlan, targetIntel, warCouncil, savePlan, hashSeed, planEngines,
} from '../systems/siege.js';
import { fmt, fmtTime } from '../core/util.js';
import { esc, costList, countdown } from './components.js';

const ENG = { ...ATTACK_ENGINES, ...DEFENSE_ENGINES };
const FL = ASSAULT_FLANKS;
const sumO = (o) => Object.values(o || {}).reduce((a, b) => a + b, 0);
const pct = (v) => `${Math.round(v * 100)} %`;
const pctP = (v) => `+${Math.round(v * 100)} %`;
const names = (o, int = true) => Object.entries(o || {}).filter(([, n]) => n >= (int ? 1 : 0.05)).map(([k, n]) => `${ENG[k]?.icon || ''} ${int ? Math.round(n) : n} ${esc((ENG[k]?.name || k).toLowerCase())}`).join(', ');
const counterText = (d) => {
  const c = d.effect.counter;
  const list = (x) => (Array.isArray(x) ? x : x ? [x] : []);
  const neut = d.effect.neutralize || [];
  return { counters: [...list(c), ...neut].map((k) => ENG[k].name).join(', ') || '—', by: list(d.counteredBy).map((k) => ENG[k].name).join(', ') || '—' };
};

// ───────── Arsenal : stocks, production, stocks minimaux ─────────
export function arsenalCard(app) {
  const s = app.state;
  const S = siegeState(s);
  const side = (kind) => {
    const defs = kind === 'attack' ? ATTACK_ENGINES : DEFENSE_ENGINES;
    const lvl = kind === 'attack' ? attackWorkshop(s) : defenseWorkshop(s);
    const cap = arsenalCap(s, kind);
    const used = stockTotal(s, kind);
    const rows = Object.entries(defs).map(([k, d]) => {
      const ok = engineUnlocked(s, k);
      const ct = counterText(d);
      const min = S.minStock[k] || 0;
      const posted = kind === 'defense' ? FL.reduce((a, f) => a + (S.posted[f][k] || 0), 0) : 0;
      return `<tr class="${ok ? '' : 'locked'}">
        <th scope="row"><span aria-hidden="true">${d.icon}</span> ${esc(d.name)}<div class="small muted">${esc(d.desc)}</div></th>
        <td class="num">${fmt(S.arsenal[kind][k] || 0)}${posted ? `<div class="small muted">${posted} posté${posted > 1 ? 's' : ''}</div>` : ''}</td>
        <td class="small">Contre : ${esc(ct.counters)}<br><span class="muted">Contré par : ${esc(ct.by)}</span></td>
        <td>${costList(engineCost(k), s)}<div class="small muted">${fmtTime(engineTime(s, k))} l’unité</div></td>
        <td>${ok ? `<div class="row gap"><button class="mini primary" data-action="sg-make" data-k="${k}" data-n="1">+1</button><button class="mini" data-action="sg-make" data-k="${k}" data-n="5">+5</button></div>
          <div class="row gap small sg-min"><span>Garder</span><button class="mini ghost" data-action="sg-min" data-k="${k}" data-d="-1" ${min ? '' : 'disabled'} aria-label="Stock minimal de ${esc(d.name)} : moins">−</button><span class="num">${min}</span><button class="mini ghost" data-action="sg-min" data-k="${k}" data-d="1" aria-label="Stock minimal de ${esc(d.name)} : plus">+</button></div>`
          : `<span class="small muted">🔒 ${esc(unlockText(k))}</span>`}</td>
      </tr>`;
    }).join('');
    const queue = S.queue[kind].map((q) => `<div class="q-row"><div class="q-top"><span>${ENG[q.type].icon} ${q.n} × ${esc(ENG[q.type].name)}</span>${countdown(q.end, q.start)}<button class="mini ghost" data-action="sg-cancel" data-side="${kind}" data-id="${q.id}" aria-label="Annuler : ${esc(ENG[q.type].name)} (80 % remboursés)">✖</button></div></div>`).join('');
    return `<div class="card sg-arsenal"><h2>${kind === 'attack' ? '⚙️ Engins d’attaque' : '🛡️ Engins de défense'}</h2>
      <p class="small">${kind === 'attack' ? `Atelier de siège niv. ${lvl}${lvl ? '' : ' (à construire)'} · au plus ${attackLimit(s)} engins par flanc et par vague` : `Atelier des remparts = muraille niv. ${lvl} · au plus ${5 + 2 * lvl} engins par flanc`} · arsenal <b>${used} / ${cap}</b> (production comprise).</p>
      <div class="table-wrap"><table class="sg-table"><thead><tr><th scope="col">Engin</th><th scope="col">Stock</th><th scope="col">Contres</th><th scope="col">Coût</th><th scope="col">Fabriquer</th></tr></thead><tbody>${rows}</tbody></table></div>
      ${queue ? `<h4>En fabrication</h4>${queue}` : ''}
    </div>`;
  };
  return `${side('attack')}${side('defense')}
    <div class="card"><h2>📦 Maintenir le stock</h2><p class="small">« Garder » fixe un stock minimal : l’intendant relance la fabrication dès qu’il passe dessous (ordre automatique « Maintenir l’arsenal » dans les Ordres de l’intendant). Les engins posés sur les remparts comptent dans le stock.</p></div>`;
}
export const arsenalActions = {
  'sg-make': (app, el) => app.act(() => startEngines(app.state, el.dataset.k, +el.dataset.n), (r) => `${ENG[el.dataset.k].icon} ${r.n} × ${ENG[el.dataset.k].name} en fabrication`),
  'sg-cancel': (app, el) => app.act(() => cancelEngines(app.state, el.dataset.side, el.dataset.id), 'Fabrication annulée (80 % remboursés)'),
  'sg-min': (app, el) => { const S = siegeState(app.state); const k = el.dataset.k; app.act(() => setMinStock(app.state, k, (S.minStock[k] || 0) + +el.dataset.d), null); },
};

// ───────── Plan de siège d'une marche (fenêtre d'attaque) ─────────
const emptyWave = () => ({ left: { share: 0, engines: {} }, front: { share: 0, engines: {} }, right: { share: 0, engines: {} } });
export const frontalPlan = () => { const w = emptyWave(); w.front.share = 1; return { waves: [w] }; };
// Contexte du siège : place, protection connue, renseignement, ennemis (pour le conseil de guerre)
export function siegeTarget(s, poi, D) {
  if (!poi) return null;
  const fort = D ? D.fort : poi.wall || 0;
  if (!(fort > 0)) return null;
  const scouted = !!(D || poi.scouted);
  const intel = targetIntel(fort, poi, scouted, hashSeed(poi.id || `${poi.x},${poi.y}`));
  return { fort, intel, scouted, enemies: D ? D.enemies : poi.garrison || null, enemyMods: D ? D.enemyMods : null, enemyFormation: D ? D.formation : undefined };
}
export function siegePlanHtml(app, md, tg, ctx) {
  const s = app.state;
  if (!tg) return '';
  const S = siegeState(s);
  const plan = md.siegePlan ||= frontalPlan();
  const one = tg.intel.prot.oneFlank;
  const flanks = one ? ['front'] : FL;
  const hero = s.heroes.find((h) => h.id === md.heroId) || null;
  const nMax = maxWaves(s, hero);
  const lim = attackLimit(s);
  const used = planEngines(plan);
  const total = plan.waves.reduce((a, w) => a + FL.reduce((b, f) => b + (w[f]?.share || 0), 0), 0) || 1;
  const avail = Object.keys(ATTACK_ENGINES).filter((k) => (S.arsenal.attack[k] || 0) > 0);
  const P = S.plans.attack;
  const cell = (w, wi, f) => {
    const c = w[f] || { share: 0, engines: {} };
    const engs = avail.filter((k) => one || ATTACK_ENGINES[k].flanks.includes(f)).map((k) => {
      const n = c.engines[k] || 0;
      const room = (S.arsenal.attack[k] || 0) - (used[k] || 0);
      return `<div class="sg-eng-row"><span title="${esc(ATTACK_ENGINES[k].desc)}">${ATTACK_ENGINES[k].icon} ${esc(ATTACK_ENGINES[k].name)}</span><span class="row gap"><button class="mini" data-action="sp-eng" data-w="${wi}" data-f="${f}" data-k="${k}" data-d="-1" ${n ? '' : 'disabled'} aria-label="Moins de ${esc(ATTACK_ENGINES[k].name)} : vague ${wi + 1}, ${esc(FLANKS[f].name)}">−</button><span class="num">${n}</span><button class="mini" data-action="sp-eng" data-w="${wi}" data-f="${f}" data-k="${k}" data-d="1" ${room > 0 && sumO(c.engines) < lim ? '' : 'disabled'} aria-label="Plus de ${esc(ATTACK_ENGINES[k].name)} : vague ${wi + 1}, ${esc(FLANKS[f].name)}">+</button></span></div>`;
    }).join('');
    const kD = tg.intel.engines?.[f] || {};
    return `<div class="sg-cell"><b>${FLANKS[f].icon} ${esc(FLANKS[f].name)}</b>
      <div class="small muted">${f === 'front' ? `porte ${pctP(tg.intel.prot.gate)}` : `muraille ${pctP(tg.intel.prot.wall)}`}${tg.intel.prot.moat ? ` · douves ${pctP(tg.intel.prot.moat)}` : ''}${sumO(kD) ? `<br>en face : ${names(kD)}` : ''}</div>
      ${one ? '' : `<div class="row gap"><button class="mini" data-action="sp-share" data-w="${wi}" data-f="${f}" data-d="-0.1" aria-label="Moins de troupes : vague ${wi + 1}, ${esc(FLANKS[f].name)}">−</button><span class="num">${pct((c.share || 0) / total)}</span><button class="mini" data-action="sp-share" data-w="${wi}" data-f="${f}" data-d="0.1" aria-label="Plus de troupes : vague ${wi + 1}, ${esc(FLANKS[f].name)}">+</button></div>`}
      ${engs || '<div class="small muted">Aucun engin à l’arsenal.</div>'}</div>`;
  };
  const waves = plan.waves.map((w, wi) => `<div class="sg-wave"><h5>Vague ${wi + 1}${wi === 0 ? '' : ' (ses engins frappent une protection déjà entamée)'}</h5><div class="sg-cells ${one ? 'one' : ''}">${flanks.map((f) => cell(w, wi, f)).join('')}</div></div>`).join('');
  const units = Object.fromEntries(Object.entries(md.units).filter(([, n]) => n > 0));
  let council = '';
  if (!tg.enemies) council = '<p class="small muted">Garnison inconnue : espionnez la place pour obtenir l’avis du conseil de guerre.</p>';
  else if (!sumO(units)) council = '<p class="small muted">Choisissez des troupes pour consulter le conseil de guerre.</p>';
  else {
    const C = warCouncil({ units, mods: ctx.mods, formation: md.formation, supply: md.supply, famine: s.famine, label: 'Vous' }, tg.enemies, tg.fort, ctx.poi, { terrain: ctx.terrain, weather: s.weather.type, enemyMods: ctx.enemyMods, enemyFormation: tg.enemyFormation, enemyLabel: 'Ennemi' }, plan);
    const fl = Object.entries(C.flanks).filter(([, x]) => x.waves || x.from != null);
    council = `<div class="verdict ${C.wins >= 4 ? 'good' : C.wins >= 2 ? '' : 'bad'}">${C.wins >= 4 ? '✔' : C.wins >= 2 ? '≈' : '✖'} ${esc(C.verdict)} — ${C.wins} victoire${C.wins > 1 ? 's' : ''} sur ${C.of} essais</div>
      <div class="small">Pertes attendues : <b>${pct(C.lossRange[0])} à ${pct(C.lossRange[1])}</b> de l’armée.</div>
      <ul class="small sg-council">${fl.map(([f, x]) => `<li>${FLANKS[f].icon} ${esc(FLANKS[f].name)} : protection ${pctP(x.from ?? 0)} → ${pctP(x.to ?? 0)}, ${x.breached ? '<b>percé</b>' : 'tient'}</li>`).join('')}
      ${C.yard ? `<li>${FLANKS.yard.icon} Cour : ${C.yard.win ? '<b>prise</b>' : 'tenue'}${C.yard.bonus ? ` (vos troupes +${pct(C.yard.bonus)})` : ''}</li>` : ''}</ul>
      <p class="small sg-key">🗝️ ${esc(C.key)}</p>
      ${C.missingCounters.length ? `<p class="small warn-text">Sans contre dans votre plan : ${C.missingCounters.map(esc).join(' ; ')}.</p>` : ''}
      ${tg.scouted ? '' : '<p class="small muted">Renseignement approximatif (±20 % sur les engins) : espionnez pour le préciser.</p>'}`;
  }
  return `<div class="sg-plan-box"><h4>🏰 Plan de siège <span class="small muted">place fortifiée : muraille, porte${tg.intel.prot.moat ? ', douves' : ''}</span></h4>
    <p class="small">${one ? 'Petite place : un seul front, la porte.' : 'Trois flancs et une cour. Les troupes de chaque flanc donnent l’assaut ensemble ; ce qui passe un flanc se bat ensuite dans la cour.'} Au plus ${lim} engins par flanc et par vague ; ${nMax} vague${nMax > 1 ? 's' : ''} possible${nMax > 1 ? 's' : ''}.</p>
    <div class="row gap wrap"><label class="small">Vagues <select data-change="sp-waves" aria-label="Nombre de vagues">${Array.from({ length: nMax }, (_, i) => `<option value="${i + 1}" ${plan.waves.length === i + 1 ? 'selected' : ''}>${i + 1}</option>`).join('')}</select></label>
      <button class="mini primary" data-action="sp-advise" title="Effort principal sur le flanc le moins protégé, contres face aux engins annoncés">🧭 Répartition conseillée</button>
      <button class="mini ghost" data-action="sp-clear">Assaut frontal sans engin</button>
      ${Array.from({ length: PLAN_SLOTS }, (_, i) => `<span class="sg-plan">${P[i] ? `<button class="mini" data-action="sp-load" data-i="${i}">${i + 1}. ${esc(P[i].name)}</button>` : `<span class="small muted">${i + 1}. vide</span>`}<button class="mini ghost" data-action="sp-save" data-i="${i}" aria-label="Enregistrer ce plan d’attaque dans l’emplacement ${i + 1}">💾</button></span>`).join('')}</div>
    ${tg.intel.adapt && tg.scouted ? `<p class="small warn-text">⚠ Adaptation : ${esc(tg.intel.adapt)}.</p>` : ''}
    <div class="small" id="sp-why"></div>
    ${waves}
    <h4>⚖️ Conseil de guerre</h4>${council}
  </div>`;
}
export function campNoteHtml() {
  return '<div class="sg-plan-box small"><b>🏕️ Camp sans enceinte</b> : pas de muraille ni de porte, donc pas de siège. Vos engins restent à l’arsenal ; seules les troupes comptent.</div>';
}
// Actions du plan (la fenêtre d'attaque appelle refresh pour redessiner l'aperçu)
export function siegePlanActions(refresh0) {
  // Le plan est redessiné à chaque clic : le focus revient sur le même bouton (usage au clavier)
  const refresh = (app) => {
    const a = document.activeElement;
    const key = a?.dataset?.action ? JSON.stringify(a.dataset) : null;
    refresh0(app);
    if (key) [...document.querySelectorAll('#siege-plan [data-action]')].find((e) => JSON.stringify(e.dataset) === key && !e.disabled)?.focus({ preventScroll: true });
  };
  const plan = (app) => (app.ui.marchDraft.siegePlan ||= frontalPlan());
  return {
    'sp-share': (app, el) => { const p = plan(app); const c = p.waves[+el.dataset.w][el.dataset.f]; c.share = Math.max(0, Math.round(((c.share || 0) + +el.dataset.d) * 100) / 100); if (!p.waves.some((w) => FL.some((f) => w[f].share > 0))) c.share = 0.1; refresh(app); },
    'sp-eng': (app, el) => {
      const p = plan(app); const c = p.waves[+el.dataset.w][el.dataset.f]; const k = el.dataset.k;
      const S = siegeState(app.state);
      const v = (c.engines[k] || 0) + +el.dataset.d;
      if (v > 0 && (planEngines(p)[k] || 0) + 1 > (S.arsenal.attack[k] || 0) && +el.dataset.d > 0) return;
      if (v > 0) c.engines[k] = v; else delete c.engines[k];
      if (+el.dataset.d > 0 && !(c.share > 0)) c.share = 0.1;
      refresh(app);
    },
    'sp-waves': (app, el) => {
      const p = plan(app); const n = Math.max(1, +el.value || 1);
      while (p.waves.length < n) { const last = p.waves[p.waves.length - 1]; const w = emptyWave(); for (const f of FL) w[f].share = last[f].share; p.waves.push(w); }
      p.waves.length = n;
      refresh(app);
    },
    'sp-advise': (app) => {
      const md = app.ui.marchDraft;
      const tg = app.ui.siegeTarget;
      if (!tg) return;
      const hero = app.state.heroes.find((h) => h.id === md.heroId) || null;
      const r = advisedAttackPlan(app.state, tg.intel, { waves: md.siegePlan?.waves.length || 1, hero });
      md.siegePlan = r.plan;
      refresh(app);
      const w = document.getElementById('sp-why'); if (w) w.textContent = r.why.length ? `Conseil : ${r.why.join(' ; ')}.` : '';
    },
    'sp-clear': (app) => { app.ui.marchDraft.siegePlan = frontalPlan(); refresh(app); },
    'sp-load': (app, el) => { const p = siegeState(app.state).plans.attack[+el.dataset.i]; if (!p) return; app.ui.marchDraft.siegePlan = JSON.parse(JSON.stringify(p.plan)); refresh(app); app.toast(`Plan « ${p.name} » chargé (engins selon l’arsenal)`, 'good'); },
    'sp-save': (app, el) => {
      const i = +el.dataset.i; const old = siegeState(app.state).plans.attack[i];
      const name = prompt('Nom du plan d’attaque', old?.name || ['Porte', 'Échelles', 'Tour'][i]);
      if (name === null) return;
      savePlan(app.state, 'attack', i, name, plan(app)); app.save(); refresh(app); app.toast(`💾 Plan « ${name} » enregistré`, 'good');
    },
  };
}

// ───────── Rapport : flanc par flanc, puis la cour ─────────
const unitsTxt = (o) => Object.entries(o || {}).filter(([, n]) => n > 0).map(([u, n]) => `${fmt(n)} ${esc((ALL_UNITS[u] || UNITS[u])?.name || u)}`).join(', ') || 'aucun';
export function siegeReportHtml(rep) {
  const r = rep.result;
  const R = r?.report;
  if (!R?.flanks) return '';
  const defense = !!rep.defense;
  const E = r.engines || { attack: {}, defense: {} };
  const flanks = Object.keys(R.flanks);
  let step = 0;
  const cell = (f) => {
    const x = R.flanks[f];
    const fought = !!x.fight;
    const counters = x.waves.flatMap((w) => w.notes.filter((n) => n.kind === 'counter' && n.pct > 0.1));
    const neut = x.waves.flatMap((w) => w.notes.filter((n) => n.kind === 'neutralize' && n.pct > 0.1));
    const state = !fought ? 'calme' : x.breached ? 'percé' : 'tenu';
    const icon = !fought ? '·' : x.breached ? '💥' : '🛡️';
    return `<div class="sg-rf sg-step ${fought ? (x.breached ? 'breach' : 'held') : 'calm'}" style="--i:${fought ? step++ : 0}">
      <b>${FLANKS[f].icon} ${esc(FLANKS[f].name)}</b> <span class="sg-state">${icon} ${state}</span>
      ${fought ? `<div class="small">Protection ${pctP(x.protBase || 0)} → <b>${pctP(x.protFinal || 0)}</b></div>
        ${x.waves.filter((w) => sumO(w.engines)).map((w) => `<div class="small">Vague ${w.w + 1} : ${names(w.engines)}</div>`).join('')}
        ${counters.map((n) => `<div class="small">↯ ${esc(ENG[n.by].name)} contre ${esc(ENG[n.target].name)} : ${pct(n.pct)} de son effet annulé</div>`).join('')}
        ${neut.map((n) => `<div class="small">⛨ ${esc(ENG[n.by].name)} contre ${esc(ENG[n.target].name)} : ${pct(n.pct)} neutralisé</div>`).join('')}
        <div class="small muted">${defense ? 'Assaillants' : 'Vous'} : ${unitsTxt(x.fight.units)} · ${defense ? 'défenseurs' : 'garnison'} : ${unitsTxt(x.fight.defenders)}</div>` : ''}
    </div>`;
  };
  const yard = R.yard ? `<div class="sg-rf sg-step sg-yard ${R.yard.win ? 'breach' : 'held'}" style="--i:${step++}"><b>${FLANKS.yard.icon} Cour</b> <span class="sg-state">${R.yard.win ? '💥 prise' : '🛡️ tenue'}</span>
    <div class="small">${unitsTxt(R.yard.attackers)} contre ${unitsTxt(R.yard.defenders)}${R.yard.bonus ? ` · assaillants +${pct(R.yard.bonus)} (${r.breached.length} flanc${r.breached.length > 1 ? 's' : ''} percé${r.breached.length > 1 ? 's' : ''})` : ''}</div></div>`
    : `<div class="sg-rf sg-yard calm"><b>${FLANKS.yard.icon} Cour</b> <span class="sg-state">· non atteinte</span></div>`;
  const engLine = (label, o) => (sumO(o) >= 0.5 ? `<li><b>${label}</b> : ${names(o)}</li>` : '');
  const mine = defense ? E.defense : E.attack, theirs = defense ? E.attack : E.defense;
  const aria = `${flanks.map((f) => { const x = R.flanks[f]; return `${FLANKS[f].name} : ${!x.fight ? 'calme' : x.breached ? 'percé' : 'tenu'}`; }).join(', ')}. Cour : ${R.yard ? (R.yard.win ? 'prise' : 'tenue') : 'non atteinte'}.`;
  return `<div class="sg-report" aria-label="${esc(aria)}">
    <div class="row gap"><h4>🏰 Le siège, flanc par flanc</h4><button class="mini ghost sg-replay-btn" data-action="sg-replay" aria-label="Revoir l’assaut (animation courte)">▶ Revoir l’assaut</button></div>
    <p class="sg-key">🗝️ ${esc(r.key || rep.siege?.key || '')}</p>
    <div class="sg-rflanks ${R.oneFlank ? 'one' : ''}">${flanks.map(cell).join('')}</div>
    ${yard}
    <ul class="small sg-engines">
      ${engLine(defense ? 'Vos engins engagés' : 'Vos engins engagés', defense ? mine.used : mine.used)}
      ${engLine(defense ? 'Vos engins détruits ou consommés' : 'Vos engins détruits', mine.lost)}
      ${defense ? engLine('Vos engins intacts', mine.kept) : engLine('Vos engins récupérés', mine.recovered)}
      ${engLine(defense ? 'Engins ennemis engagés' : 'Engins ennemis détruits', defense ? theirs.used : theirs.lost)}
      ${rep.siege?.adapt ? `<li class="warn-text"><b>Adaptation ennemie</b> : ${esc(rep.siege.adapt)}</li>` : ''}
    </ul>
  </div>`;
}
export const siegeReportActions = {
  'sg-replay': () => {
    if (document.documentElement.classList.contains('reduce-motion')) return;
    const box = document.querySelector('#modal-root .sg-report');
    if (!box) return;
    box.classList.remove('sg-play'); void box.offsetWidth; box.classList.add('sg-play');
  },
};
