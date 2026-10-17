// v14 — Interface « Répercussions » : fil des crises (cause → étape actuelle → suite, et où couper la chaîne),
// almanach des présages (fiabilité, recoupement, préparation) et réserves royales. Partagée par le tableau de bord
// (Objectifs), le Bilan et le panneau latéral ; les actions sont globales (data-action valable depuis tout écran).
import { CRISES, PREPARATIONS, RESERVE, reliabilityBand } from '../data/crises.js';
import { RESOURCES } from '../data/resources.js';
import { fmt } from '../core/util.js';
import { thLevel } from '../systems/city.js';
import { activeCrises, crisisThread, intervene, crisesState } from '../systems/crises.js';
import { omensState, omenView, omenText, omenTitle, omenReliability, omenSources, verifyOmen, prepareFor, prepCost, verifyCost } from '../systems/omens.js';
import { reserveState, reserveCap, reserveOf, depositReserve, setReserveRule, releaseFood } from '../systems/reserve.js';
import { computeMods } from '../systems/modifiers.js';
import { levelOf } from '../systems/city.js';
import { esc, countdown, resChips, bar } from './components.js';

const costLine = (c) => [Object.keys(c.stock).length ? resChips(c.stock) : '', Object.keys(c.reserve).length ? `🏺 réserve : ${resChips(c.reserve)}` : ''].filter(Boolean).join(' ') || 'gratuit';

// Fil d'une crise : chaque étape est un maillon ; l'étape en cours porte ses interventions
export function crisisThreadHtml(s, c) {
  const th = crisisThread(s, c);
  const links = th.stages.map((st, i) => `<li class="rep-link ${st.state}">
      <div class="rep-node"><span class="rep-ico">${st.icon}</span><b>${esc(st.name)}</b>${st.state === 'now' ? ` <span class="chip small">en cours · ${i < th.stages.length - 1 ? 'suite' : 'fin'} dans ${countdown(th.nextAt)}</span>` : st.state === 'past' ? ' <span class="muted small">passée</span>' : ''}</div>
      ${st.effects.length ? `<div class="small ${st.state === 'next' ? 'muted' : ''}">${st.effects.map(esc).join(' · ')}</div>` : ''}
      ${st.state === 'now' ? `<div class="small muted">${esc(st.text)}</div>` : ''}
    </li>`).join('');
  const ivs = th.interventions.map((iv) => `<div class="rep-iv ${iv.status.ok ? '' : 'off'}">
      <div><b>${iv.icon} ${esc(iv.label)}</b> <span class="small muted">${esc(iv.text || '')}</span></div>
      <div class="small">Coût : ${costLine(iv.cost)}${iv.resolve ? ' · <span class="ok">met fin à la crise</span>' : iv.toStage != null ? ' · <span class="ok">arrête la propagation</span>' : iv.delayH ? ` · repousse la suite de ${iv.delayH} h` : ''}</div>
      ${iv.status.ok ? `<button class="mini primary" data-action="crisis-iv" data-id="${th.id}" data-iv="${iv.id}">Agir</button>` : `<div class="req small">${esc(iv.status.reason)}</div>`}
    </div>`).join('');
  return `<div class="rep-thread"><div class="row between wrap"><h3>${th.icon} ${esc(th.name)}</h3>${th.guarded ? '<span class="small ok">🛡️ La garde est proche : le feu sera maîtrisé après la première vague</span>' : ''}</div>
    <ol class="rep-chain">${links}</ol>
    <h4>Couper la chaîne maintenant</h4><div class="rep-ivs">${ivs || '<span class="small muted">Aucune intervention possible à cette étape : la crise suivra son cours.</span>'}</div>
    ${th.log.length ? `<details class="small"><summary>Journal de la crise</summary>${th.log.map((l) => `<div>${esc(l.text)}</div>`).join('')}</details>` : ''}</div>`;
}

export function crisesCard(s) {
  const list = activeCrises(s);
  if (!list.length) return '';
  return `<div class="card rep-card"><h2>🔗 Fil des répercussions</h2>
    <p class="small muted">Une crise passe d’un système à l’autre tant qu’on ne l’arrête pas. Plus tôt on agit, moins c’est cher ; la réserve royale permet d’agir sans toucher aux stocks${s.reserve?.regent !== false ? ', et le régent y puise seul si la crise s’aggrave (dès sa 2e étape)' : ''}.</p>
    ${list.map((c) => crisisThreadHtml(s, c)).join('')}</div>`;
}

// Almanach : présages en cours, fiabilité, recoupement et préparation
export function almanacCard(s, now = Date.now()) {
  if (thLevel(s) < 2) return '';
  const S = omensState(s);
  const q = omenReliability(s), band = reliabilityBand(q);
  const tavern = levelOf(s, 'tavern') > 0;
  const shown = S.list.filter((o) => o.kind === 'catastrophe' || tavern).slice(0, 5);
  const vc = verifyCost(s);
  const row = (o) => {
    const v = omenView(o);
    const p = o.kind === 'catastrophe' ? PREPARATIONS[o.key] : null;
    const pc = p ? prepCost(s, o.key) : null;
    const outcome = o.resolved ? (o.happened ? '<span class="bad">s’est réalisé</span>' : o.truth ? '<span class="muted">éclipsé</span>' : '<span class="ok">ne s’est pas réalisé</span>') : `échéance ${countdown(o.at)}`;
    return `<div class="omen ${o.resolved ? 'past' : ''}"><div class="row between wrap"><b>${omenTitle(o)}</b><span class="small">${v.icon} ${esc(v.label)} · ${outcome}</span></div>
      <div class="small muted">« ${esc(omenText(o))} »</div>
      ${o.resolved ? '' : `<div class="row gap wrap">${v.sure || o.checkAt ? (o.checkAt ? `<span class="small muted">🔭 Un éclaireur vérifie (${countdown(o.checkAt)})</span>` : '') : `<button class="mini" data-action="omen-verify" data-id="${o.id}" data-m="gold">🔮 Astrologues (${resChips(vc)})</button><button class="mini ghost" data-action="omen-verify" data-id="${o.id}" data-m="scout" ${(s.army.scout || 0) < 1 ? 'disabled' : ''}>🔭 Envoyer un éclaireur (30 min)</button>`}
        ${p ? (o.prepared ? `<span class="small ok">✔ ${esc(p.label)}</span>` : o.checked === false ? '' : `<button class="mini primary" data-action="omen-prep" data-id="${o.id}">${p.icon} ${esc(p.label)} (${resChips(pc)})</button><span class="small muted">${esc(p.text)}</span>`) : ''}</div>`}</div>`;
  };
  return `<div class="card almanac"><div class="row between wrap"><h3>🔮 Almanach des présages</h3><span class="small">${band.icon} Fiabilité ${band.name.toLowerCase()} (${Math.round(q * 100)} %)</span></div>
    <p class="small muted">Les fléaux et les tensions du marché s’annoncent 1 à 2 h à l’avance. La fiabilité est la chance qu’un présage se réalise : un sur ${Math.max(2, Math.round(1 / Math.max(0.05, 1 - q)))} environ est faux. Recoupez-le, ou préparez-vous en pariant sur lui.</p>
    ${shown.map(row).join('') || '<div class="small muted">Aucun présage pour l’instant.</div>'}
    <details class="small"><summary>Sources de la fiabilité</summary>${omenSources(s).map(([l, v]) => `<div>${esc(l)} : +${Math.round(v * 100)} %</div>`).join('')}<div class="muted">Les présages du marché viennent de la taverne : ${tavern ? 'elle vous les rapporte.' : 'bâtissez-en une pour les entendre.'}</div></details></div>`;
}

// Réserves royales (Bilan)
export function reserveCard(s, mods = computeMods(s)) {
  const R = reserveState(s);
  const rows = RESERVE.res.map((r) => {
    const cap = reserveCap(s, r, mods), v = reserveOf(s, r);
    return `<div class="res-row"><span>${RESOURCES[r].icon} ${esc(RESOURCES[r].name)}</span><span class="small">${fmt(v)} / ${fmt(cap)}</span>${bar(v, Math.max(1, cap))}
      <button class="mini" data-action="res-dep" data-r="${r}" ${v >= cap || (s.resources[r] || 0) < 1 ? 'disabled' : ''}>Verser ¼ du stock</button></div>`;
  }).join('');
  const C = crisesState(s);
  return `<div class="card reserve-card"><h3>🏺 Réserves royales</h3>
    <p class="small muted">Mettez de côté une part de vos stocks, hors entrepôt. Elle ne rapporte rien et ne se reprend pas librement : elle sert à couper une crise sans toucher aux stocks (greniers, remèdes, bois de chauffe…), et la nourriture revient au royaume en cas de famine. Plafond : une part de la capacité de l’entrepôt.</p>
    <div class="reserve-grid">${rows}</div>
    <div class="row gap wrap"><label class="small"><input type="checkbox" data-change="res-rule" data-rule="overflow" ${R.overflow ? 'checked' : ''}> Verser à la réserve ce qui déborde de l’entrepôt (au lieu de l’écouler à 15 % au marché)</label></div>
    <div class="row gap wrap"><label class="small"><input type="checkbox" data-change="res-rule" data-rule="regent" ${R.regent ? 'checked' : ''}> Le régent puise dans la réserve pour couper une crise qui s’aggrave (dès sa 2e étape) ou une famine, même en votre absence (jamais dans les stocks)</label></div>
    ${s.famine && reserveOf(s, 'food') > 0 ? '<button class="btn primary" data-action="res-release">🍖 Famine : ouvrir la réserve de nourriture</button>' : ''}
    <div class="small muted">Crises : ${C.stats.opened} ouverte(s), ${C.stats.resolved} surmontée(s), ${C.stats.endured} subie(s) ; le régent a agi ${C.stats.regent} fois.</div></div>`;
}

// Ligne compacte du panneau latéral
export function sideRepercussions(s, now = Date.now()) {
  const parts = [];
  for (const c of activeCrises(s)) {
    const d = CRISES[c.type], st = d.stages[c.stage];
    parts.push(`<div class="q-row rep-side"><div class="q-top"><span>${d.icon} ${esc(d.name)} : ${esc(st.name)}</span>${countdown(c.nextAt)}</div><div class="small"><button class="mini primary" data-action="goto" data-view="goals">Couper la chaîne →</button></div></div>`);
  }
  const o = (s.omens?.list || []).find((x) => !x.resolved && x.kind === 'catastrophe');
  if (o) { const v = omenView(o); parts.push(`<div class="q-row"><div class="q-top"><span>🔮 ${omenTitle(o)} ?</span>${countdown(o.at)}</div><div class="small muted">${v.icon} ${esc(v.label)}${o.prepared ? ' · préparé' : ''}</div></div>`); }
  return parts.length ? `<section class="side-box"><h3>🔗 Répercussions</h3>${parts.join('')}</section>` : '';
}

export const repActions = {
  'crisis-iv': (app, el) => app.act(() => intervene(app.state, el.dataset.id, el.dataset.iv), (r) => (r.resolved ? 'Crise surmontée' : r.delayed ? 'La suite est repoussée' : 'Intervention faite')),
  'omen-verify': (app, el) => app.act(() => verifyOmen(app.state, el.dataset.id, el.dataset.m), (r) => (r.pending ? 'Un éclaireur part vérifier' : r.truth ? '✅ Les astrologues confirment le présage' : '❌ Les astrologues démentent le présage')),
  'omen-prep': (app, el) => app.act(() => prepareFor(app.state, el.dataset.id), 'Préparatifs faits'),
  'res-dep': (app, el) => app.act(() => depositReserve(app.state, el.dataset.r), (r) => `${fmt(r.n)} ${RESOURCES[el.dataset.r].icon} versés à la réserve`),
  'res-rule': (app, el) => app.act(() => setReserveRule(app.state, el.dataset.rule, el.checked), 'Consigne enregistrée'),
  'res-release': (app) => app.act(() => releaseFood(app.state), (r) => `${fmt(r.n)} 🍖 rendus au royaume`),
};
