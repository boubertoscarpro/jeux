// v17 — Accessibilité : le royaume en texte (alternative à la carte), annonces pour les lecteurs d'écran, « Pourquoi ? ».
import { cityOutline, citySummary } from '../systems/mapText.js';
import { buildingSignals } from '../systems/mapSignals.js';
import { notablePlaces } from './views/world.js';
import { whyProduction, whyDefense, whyStability } from '../systems/why.js';
import { RESOURCES } from '../data/resources.js';
import { esc } from './components.js';

export function openKingdomText(app) {
  const s = app.state;
  let sig = new Map(); try { sig = buildingSignals(s, {}); } catch { sig = new Map(); }
  const groups = cityOutline(s, { signals: sig });
  let places = []; try { places = notablePlaces(s).slice(0, 20); } catch { places = []; }
  const terr = Object.values(s.territories || {});
  app.modal(`<h2 id="kt-title">📃 Le royaume en texte</h2>
    <p>${esc(citySummary(s))}</p>
    <p class="small muted">Chaque bâtiment, zone par zone. « Voir » le montre sur la carte et ouvre ses actions ; « Ouvrir » ouvre son écran.</p>
    ${groups.map((g) => `<h3>${esc(g.name)} (${g.items.length})</h3><ul class="kt-list">${g.items.map((it) => `<li><b>${esc(it.name)}</b>, niveau ${it.level}${it.states.length ? ` — ${esc(it.states.join(', '))}` : ''}
      <button class="mini" data-action="kt-see" data-x="${it.x}" data-y="${it.y}" aria-label="Voir ${esc(it.name)} sur la carte">Voir</button>${it.screens.length && app.views[it.screens[0]] ? ` <button class="mini" data-action="nav" data-view="${it.screens[0]}" aria-label="Ouvrir ${esc(app.views[it.screens[0]].title)}">Ouvrir</button>` : ''}</li>`).join('')}</ul>`).join('')}
    <h3>Avant-postes (${terr.length})</h3>${terr.length ? `<ul class="kt-list">${terr.map((t) => `<li><b>${esc(t.name || '')}</b>, niveau ${t.level || 1}, en (${t.x}, ${t.y}) <button class="mini" data-action="visit-outpost" data-k="${t.x},${t.y}">Visiter</button></li>`).join('')}</ul>` : '<p class="small muted">Aucun.</p>'}
    <h3>Carte du monde : lieux connus</h3>${places.length ? `<ul class="kt-list">${places.map((p) => `<li>${esc(p.label)}, à ${Math.round(p.d)} cases</li>`).join('')}</ul>` : '<p class="small muted">Rien d’exploré pour l’instant.</p>'}`, kingdomTextActions, 'wide');
}
export const kingdomTextActions = {
  'kt-see': (app, el) => { const x = +el.dataset.x, y = +el.dataset.y; app.closeModal(); app.ui.citySel = { x, y }; app.ui.ringOpen = true; app.ui.cityFocus = { x, y }; app.ui.cityKeyFocus = { x, y }; app.go('city'); requestAnimationFrame(() => app.focusCityTile(x, y)); },
};

// Annonces : une région polie, regroupée (au plus une annonce toutes les 4 s, deux messages par annonce)
const IMPORTANT = /raid|crise|pill|brèche|terminé|achevé|bâti|construit|amélior|niveau|défaite|victoire|famine|révolte/i;
export function bindAnnouncer(app, bus) {
  let queue = [], timer = null;
  const flush = () => { timer = null; const el = document.getElementById('sr-live'); if (!el || !queue.length) return; el.textContent = queue.slice(0, 2).join(' — ') + (queue.length > 2 ? ` (et ${queue.length - 2} autres)` : ''); queue = []; };
  bus.on('log', ({ type, text }) => {
    if (!['good', 'bad', 'combat', 'event'].includes(type) || !IMPORTANT.test(text || '')) return;
    queue.push(String(text).replace(/[\u{1F300}-\u{1FAFF}☀-➿]️?/gu, '').trim());
    if (!timer) timer = setTimeout(flush, 4000);
  });
}

// « Pourquoi ? » : d'où vient un chiffre (production, défense, stabilité)
export function openWhy(app, what, arg) {
  const s = app.state;
  let title = '', lines = [], total = '';
  try {
    if (what === 'prod') { const r = whyProduction(s, arg); title = `${RESOURCES[arg]?.icon || ''} ${RESOURCES[arg]?.name || arg} : d’où vient ce chiffre ?`; lines = r.lines; total = r.total; }
    else if (what === 'def') { const r = whyDefense(s); title = '🛡️ Défense de la ville : d’où vient ce chiffre ?'; lines = r.lines; total = r.total; }
    else if (what === 'stab') { const r = whyStability(s, arg); title = `⚖️ Stabilité de ${r.name} : d’où vient ce chiffre ?`; lines = r.lines; total = r.total; }
  } catch (e) { lines = [['Calcul indisponible', String(e.message)]]; }
  app.modal(`<h2>${esc(title)}</h2><table class="tbl why"><tbody>${lines.map(([l, v]) => `<tr><th scope="row">${esc(l)}</th><td class="num">${esc(String(v))}</td></tr>`).join('')}</tbody>${total ? `<tfoot><tr><th scope="row">Total</th><td class="num"><b>${esc(String(total))}</b></td></tr></tfoot>` : ''}</table>`, {}, '');
}
