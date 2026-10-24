// v22b « Pôles du royaume » : boutons Économie, Armée, Royaume, Savoir à côté du globe ; chacun ouvre un panneau
// de tuiles rangées par rubriques (data/hubs.js). Remplace le bouton « Lieux » ; la recherche de tous les écrans reste.
import { HUBS, HUB_ORDER } from '../data/hubs.js';
import { esc } from './components.js';
import { sigilByKey } from './sigils.js';
import { openPlaces } from './castleUi.js';

const tile = (app, id) => {
  const v = app.views[id];
  if (!v) return '';
  const lock = v.locked?.(app) || null;
  let b = 0;
  try { b = v.badge?.(app) || 0; } catch { b = 0; }
  return `<button class="hub-tile ${lock ? 'locked' : ''}" data-action="nav" data-view="${id}" ${lock ? `title="${esc(lock)}"` : ''}>
    <span class="hub-ico" aria-hidden="true">${esc(v.icon || '')}</span><span class="hub-tt">${esc(v.title)}${lock ? '<small class="hub-lock">Pas encore ouvert</small>' : ''}</span>${b ? `<b class="hub-badge" aria-label="${b} à voir">${b}</b>` : ''}</button>`;
};
export function openHub(app, key) {
  const h = HUBS[key];
  if (!h) return;
  app.ui.hub = key;
  app.modal(`<div class="hub" data-hub="${key}">
    <header class="hub-head"><span class="hub-crest" aria-hidden="true">${sigilByKey(h.sig)}</span><div><h2>${esc(h.name)}</h2><p class="small muted">${esc(h.blurb)}</p></div></header>
    <nav class="hub-tabs" aria-label="Pôles">${HUB_ORDER.map((k) => `<button class="hub-tab ${k === key ? 'on' : ''}" aria-pressed="${k === key}" data-action="hub" data-k="${k}">${sigilByKey(HUBS[k].sig)}<span>${esc(HUBS[k].name)}</span></button>`).join('')}</nav>
    ${h.sections.map((sec) => `<section class="hub-sec"><h3>${esc(sec.name)}</h3><div class="hub-grid">${sec.screens.map((id) => tile(app, id)).join('')}</div></section>`).join('')}
    <div class="row end"><button class="btn ghost small" data-action="hub-search">Rechercher un écran (touche L)</button></div>
  </div>`, hubActions, 'wide hub-modal');
}
export const hubActions = {
  hub: (app, el) => openHub(app, el.dataset.k),
  'hub-search': (app) => { app.closeModal(); openPlaces(app); },
};
export const hubButtons = (app, badge) => HUB_ORDER.map((k) => {
  const h = HUBS[k];
  let n = 0;
  for (const sec of h.sections) for (const id of sec.screens) { try { n += +(app.views[id]?.badge?.(app) || 0) || 0; } catch { /* écran sans pastille */ } }
  return `<button class="hud-a hub-btn" data-action="hub" data-k="${k}" title="${esc(h.name)} : ${esc(h.blurb.toLowerCase())}${h.key ? ` (touche ${h.key})` : ''}" aria-label="${esc(h.name)}"><span>${h.icon}</span><small>${esc(h.name)}</small>${badge(n > 99 ? '99+' : n, 'à voir')}</button>`;
}).join('');
