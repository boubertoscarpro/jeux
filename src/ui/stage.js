// v15 — « Scène » des écrans carte (royaume, monde) : la carte occupe toute la hauteur disponible de la zone
// principale, le panneau de détail devient un tiroir repliable posé sur la carte (à droite sur grand écran, en bas
// sur téléphone). Le tiroir s'ouvre de lui-même quand on sélectionne une case ou qu'on entre en mode placement.
import { esc } from './components.js';

// Hauteur de la scène : tout l'espace visible de la zone principale sous la scène (indépendant du défilement)
export function fitStage() {
  const st = document.querySelector('#view .stage');
  const view = document.getElementById('view');
  if (!st || !view) return;
  const top = st.getBoundingClientRect().top - view.getBoundingClientRect().top + view.scrollTop;
  const pad = parseFloat(getComputedStyle(view).paddingBottom) || 10;
  const h = Math.max(window.innerWidth < 700 ? 360 : 420, Math.round(view.clientHeight - top - pad));
  if (st.style.height !== h + 'px') st.style.height = h + 'px';
}

export const drawerOpen = (app, key) => (app.ui.drawer ||= {})[key] === true;

// Tiroir : onglet (toujours visible) + contenu
export function drawerHtml(app, key, label, body, { auto = false } = {}) {
  // Fermé par défaut (la carte d'abord) ; une nouvelle sélection l'ouvre, une sélection annulée le referme
  const d = (app.ui.drawer ||= {});
  const prev = d[key + ':auto'] || '';
  if ((auto || '') !== prev) { d[key] = !!auto; d[key + ':auto'] = auto || ''; }
  const open = d[key] === true;
  return `<aside class="drawer ${open ? 'open' : ''}" data-drawer="${key}">
    <button class="drawer-tab" data-action="drawer" data-k="${key}" aria-expanded="${open}" title="${open ? 'Replier' : 'Déplier'} le panneau « ${esc(label)} »">${open ? '›' : '‹'} <span>${esc(label)}</span></button>
    <div class="drawer-body card" id="${key}-panel">${body}</div></aside>`;
}

export const stageActions = {
  drawer: (app, el) => { const d = (app.ui.drawer ||= {}); d[el.dataset.k] = !drawerOpen(app, el.dataset.k); app.render(); },
};
