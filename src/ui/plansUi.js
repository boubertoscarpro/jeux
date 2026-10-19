// v17 — Plans de ville et réorganisation : fenêtre de dialogue, aperçu sur la carte, application, annulation.
// Ne fait que lire l'état et appeler systems/cityPlans.js.
import { BUILDINGS } from '../data/buildings.js';
import { reorgPlan, movesTo, movesCost, evaluate, checkLayout, applyLayout, undoLayout, savePlan, recallLayout, PLAN_SLOTS } from '../systems/cityPlans.js';
import { computeMods } from '../systems/modifiers.js';
import { esc } from './components.js';

const cmp = (a, b, better) => `${a} → <b>${b}</b> ${a === b ? '' : (better(a, b) ? '<span class="trend up">▲ mieux</span>' : '<span class="trend down">▼ moins bien</span>')}`;
function previewHtml(app, layout, title) {
  const s = app.state, mods = computeMods(s);
  const moves = movesTo(s, layout);
  const chk = checkLayout(s, layout);
  const a = evaluate(s, null, mods), b = evaluate(s, layout, mods);
  const gold = movesCost(s, moves);
  return `<h3>${esc(title)}</h3>
    <p class="small">${moves.length ? `${moves.length} bâtiment${moves.length > 1 ? 's' : ''} à déplacer · coût : ${gold ? `${gold} or` : 'gratuit (déménagement gratuit)'}` : 'Rien à déplacer : votre ville suit déjà ce plan.'}</p>
    ${chk.ok ? '' : `<p class="req">${esc(chk.reason)}</p>`}
    <table class="tbl plan-eval"><thead><tr><th scope="col">Effet</th><th scope="col">Avant → après</th></tr></thead><tbody>
      <tr><td>Bâtiments mal placés</td><td>${cmp(a.misplaced, b.misplaced, (x, y) => y < x)}</td></tr>
      <tr><td>Effets de zone favorables</td><td>${cmp(a.zonePlus, b.zonePlus, (x, y) => y > x)}</td></tr>
      <tr><td>Effets de zone défavorables</td><td>${cmp(a.zoneMinus, b.zoneMinus, (x, y) => y < x)}</td></tr>
      <tr><td>Bonus de voisinage (total, %)</td><td>${cmp(a.adjacency, b.adjacency, (x, y) => y > x)}</td></tr>
      <tr><td>Bâtiments à risque d’incendie élevé</td><td>${cmp(a.fireHigh, b.fireHigh, (x, y) => y < x)}</td></tr>
    </tbody></table>
    ${moves.length ? `<details><summary class="small">Liste des déplacements</summary><ul class="small">${moves.slice(0, 40).map((m) => `<li>${BUILDINGS[m.type].icon} ${esc(BUILDINGS[m.type].name)} : (${m.from.join(', ')}) → (${m.to.join(', ')})</li>`).join('')}</ul></details>` : ''}
    <div class="row gap wrap">${moves.length && chk.ok ? `<button class="btn" data-action="plan-show">👁 Voir sur la carte</button><button class="btn primary" data-action="plan-apply">✔ Appliquer</button>` : ''}</div>`;
}

export function openPlans(app, layout = null, title = null) {
  const s = app.state;
  const P = s.cityPlans || { saved: [] };
  const lay = layout || reorgPlan(s);
  app.ui.planDraft = lay;
  app.modal(`<h2>📐 Plans de la ville</h2>
    <p class="small muted">Réorganisez votre château sans rien perdre : aperçu des effets, application, annulation. Les déplacements coûtent comme à la main (gratuits pendant le déménagement gratuit) ; l’annulation rembourse.</p>
    <div class="plan-prev">${previewHtml(app, lay, title || '🧭 Réorganisation proposée')}</div>
    ${s.cityPlans?.undo ? `<p><button class="btn" data-action="plan-undo">↶ Annuler le dernier changement (${esc(s.cityPlans.undo.label)})</button></p>` : ''}
    <h3>Plans enregistrés</h3>
    <ul class="plan-slots">${Array.from({ length: PLAN_SLOTS }, (_, i) => { const p = P.saved?.[i]; return `<li><b>${p ? esc(p.name) : `Emplacement ${i + 1} (vide)`}</b> <button class="mini" data-action="plan-save" data-slot="${i}">💾 Enregistrer la ville actuelle</button>${p ? ` <button class="mini" data-action="plan-recall" data-slot="${i}">📂 Rappeler (aperçu)</button>` : ''}</li>`; }).join('')}</ul>`, plansActions, 'wide');
}

export const plansActions = {
  'plan-show': (app) => { app.ui.planPreview = app.ui.planDraft; app.closeModal(); app.toast('Aperçu : les cases en pointillé montrent les nouvelles places. « Plans » pour appliquer ou fermer.', 'info'); app.mapDirty = true; app.go('city'); },
  'plan-apply': (app) => { const r = app.act(() => applyLayout(app.state, app.ui.planDraft, Date.now(), app.ui.planLabel || 'réorganisation'), (x) => `🧭 ${x.moved} bâtiment(s) déplacé(s)${x.gold ? ` pour ${x.gold} or` : ''} — « Annuler » dans Plans`); if (r?.ok) { app.ui.planPreview = null; app.closeModal(); app.mapDirty = true; app.render(); } },
  'plan-undo': (app) => { const r = app.act(() => undoLayout(app.state), (x) => `↶ Plan annulé${x.refunded ? ` (${x.refunded} or rendus)` : ''}`); if (r?.ok) { app.closeModal(); app.mapDirty = true; app.render(); } },
  'plan-save': (app, el) => { const slot = +el.dataset.slot; const name = `Plan du ${new Date().toLocaleDateString('fr-FR')}`; app.act(() => savePlan(app.state, slot, name), '💾 Plan enregistré'); openPlans(app); },
  'plan-recall': (app, el) => { const slot = +el.dataset.slot; const lay = recallLayout(app.state, slot); if (!lay) return; app.ui.planLabel = app.state.cityPlans.saved[slot].name; openPlans(app, lay, `📂 ${app.state.cityPlans.saved[slot].name}`); },
};
