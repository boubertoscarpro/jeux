import { ARTIFACTS, ARTIFACT_CATS } from '../../data/artifacts.js';
import { BOSSES } from '../../data/world.js';
import { REPUTATIONS, repTier } from '../../systems/reputation.js';
import { collectionStatus } from '../../systems/collection.js';
import { esc, bar } from '../components.js';

export default {
  id: 'treasury', title: 'Salle du trésor', icon: '🏺',
  badge: () => 0,
  render(app) {
    const s = app.state;
    const owned = s.artifacts || {};
    const sets = collectionStatus(s);
    return `<div class="card"><h2>🏺 Salle du trésor <span class="muted small">${Object.keys(owned).length}/${Object.keys(ARTIFACTS).length} artefacts</span></h2>
      <p class="muted small">Les artefacts sont uniques et extrêmement rares : boss, donjons profonds, expéditions lointaines, événements secrets… Ils donnent des bonus permanents et traversent les dynasties.</p>
      <p class="small">🧩 Progression alternative : <b>${s.shards?.relicFragments || 0}/3 fragments de relique</b> (donjons déjà pillés, fouilles d’avant-postes en ruines, sagas, Roue, boutiques d’événement). 3 fragments = l’artefact de votre choix (Roue des Anciens → Fragments), pour ne jamais rester bloqué par le hasard.</p>
      ${Object.entries(ARTIFACT_CATS).map(([ck, cat]) => `<h3>${cat.icon} ${esc(cat.name)}</h3><div class="artifact-grid">${Object.entries(ARTIFACTS).filter(([, a]) => a.cat === ck).map(([k, a]) => owned[k]
        ? `<div class="artifact owned"><div class="a-icon">${a.icon}</div><b>${esc(a.name)}</b><div class="small">${esc(a.desc)}</div><div class="muted small">Obtenu : ${esc(owned[k].source || '')}</div></div>`
        : `<div class="artifact"><div class="a-icon">❔</div><b>???</b><div class="muted small">Indice : ${esc(a.source)}</div></div>`).join('')}</div>`).join('')}</div>
      <div class="cols-2"><div class="card"><h2>🗃️ Collections</h2>${sets.map((c) => `<div class="objective ${c.done ? 'done' : ''}"><div class="q-top"><b>${esc(c.name)}</b><span>${c.cur}/${c.max}</span></div><div class="small muted">${esc(c.desc)}</div>${bar(c.cur, c.max)}<div class="small">${c.done ? '✔ ' : ''}Bonus : ${Object.entries(c.mods).map(([k, v]) => `${k} ${v < 1 ? '+' + Math.round(v * 100) + '%' : '+' + v}`).join(', ')}</div></div>`).join('')}
        <h3>🏆 Trophées de boss</h3><div class="chips">${Object.entries(BOSSES).map(([k, b]) => `<span class="chip ${s.bossTrophies?.[k] ? 'chip-buff' : ''}">${s.bossTrophies?.[k] ? '🏆' : '·'} ${esc(b.name)}</span>`).join('')}</div>
        <h3>🎖️ Titres</h3><div class="chips">${(s.meta.titles || []).map((t) => `<span class="chip">${esc(t)}</span>`).join('') || '<span class="muted small">Aucun titre.</span>'}</div></div>
      <div class="card"><h2>⚖️ Réputations</h2><p class="muted small">Vos actes façonnent votre réputation. Les factions et les cités réagissent : un tyran se voit refuser le commerce, un bienfaiteur attire les familles, un marchand paie moins de taxes…</p>
        ${Object.entries(REPUTATIONS).map(([k, r]) => { const v = s.reputation?.[k] || 0; return `<div class="rep-row"><span>${r.icon} <b>${esc(r.name)}</b> <span class="muted small">${esc(r.desc)}</span></span><span>${repTier(v)} · ${Math.round(v)}</span></div>${bar(v, 600)}`; }).join('')}
      </div></div>`;
  },
};
