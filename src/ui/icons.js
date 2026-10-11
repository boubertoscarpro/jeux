// Icônes d'interface en SVG, dessinées dans le style des bâtiments (aplats, contour encre, lumière en haut à gauche).
// Un seul jeu de <symbol> injecté dans la page ; chaque icône n'est qu'un <use>. Les emojis restent dans les textes
// narratifs (journal, notifications), mais les ressources et la navigation utilisent ces icônes.
const K = '#1d1812'; // encre
const S = `stroke="${K}" stroke-width="1.3" stroke-linejoin="round"`;

const RES = {
  wood: `<rect x="2.5" y="12" width="16" height="7" rx="3.5" fill="#9c6436" ${S}/><ellipse cx="18.5" cy="15.5" rx="2.6" ry="3.5" fill="#e0b57d" ${S}/><rect x="5" y="5" width="15" height="7" rx="3.5" fill="#b07a45" ${S}/><ellipse cx="19.5" cy="8.5" rx="2.6" ry="3.5" fill="#e8c18b" ${S}/><circle cx="19.5" cy="8.5" r="1.1" fill="none" stroke="#8a5a33" stroke-width=".8"/><path d="M8 8.5h7M6 15.5h8" stroke="#6e4423" stroke-width=".9"/>`,
  stone: `<path d="M3 17l3-8 6-3 7 2 2 9-6 3H7Z" fill="#a9a196" ${S}/><path d="M6 9l6-3 7 2-4 4-7-1Z" fill="#cdc6b8"/><path d="M12 12l3 8" stroke="#7d766b" stroke-width=".9"/>`,
  iron: `<path d="M4 15l4-6h10l2 6-3 4H7Z" fill="#7f8792" ${S}/><path d="M8 9h10l2 6H6Z" fill="#a8b0ba"/><circle cx="10" cy="14" r="1.2" fill="#c96f3e"/><circle cx="15" cy="15" r="1" fill="#c96f3e"/>`,
  food: `<path d="M14 4c4 0 6 3 6 6 0 4-4 7-8 7l-4 3-2-2 3-4c0-5 1-10 5-10Z" fill="#c4553a" ${S}/><path d="M14 6c2 0 4 2 4 4" stroke="#e8907a" stroke-width="1.4" fill="none" stroke-linecap="round"/><circle cx="5.5" cy="19" r="1.8" fill="#efe3c8" ${S}/>`,
  gold: `<ellipse cx="9" cy="16" rx="6" ry="3" fill="#b8892c" ${S}/><ellipse cx="9" cy="14.5" rx="6" ry="3" fill="#e2b84a" ${S}/><ellipse cx="15" cy="10" rx="6" ry="3" fill="#b8892c" ${S}/><ellipse cx="15" cy="8.5" rx="6" ry="3" fill="#f0cd6a" ${S}/><path d="M13 8.5h4" stroke="#9c7420" stroke-width="1"/>`,
  coal: `<path d="M4 16l3-6 5-2 6 3 2 6-5 3H8Z" fill="#3d3833" stroke="#8a7f72" stroke-width="1.3" stroke-linejoin="round"/><path d="M7 10l5-2 4 2-3 3Z" fill="#6b645c"/><circle cx="15" cy="15" r="1.2" fill="#e0703a"/>`,
  leather: `<path d="M5 5h14l-1 4 2 5-3 5H7l-3-5 2-5Z" fill="#8e5a33" ${S}/><path d="M8 8h8M7 12h10M8 16h8" stroke="#c48a55" stroke-width="1" stroke-dasharray="1.6 1.4"/>`,
  steel: `<path d="M3 15l4-6h12l2 6H3Z" fill="#9fb0c2" ${S}/><path d="M3 15h18v3H3Z" fill="#6f8296" ${S}/><path d="M8 10.5h9" stroke="#e6eef6" stroke-width="1.2"/>`,
  cloth: `<path d="M4 6h12a4 4 0 0 1 0 8H8a4 4 0 0 0 0 8" fill="none" stroke="${K}" stroke-width="5" stroke-linecap="round"/><path d="M4 6h12a4 4 0 0 1 0 8H8a4 4 0 0 0 0 8" fill="none" stroke="#5b7fb5" stroke-width="3" stroke-linecap="round"/>`,
  herbs: `<path d="M12 21V9" stroke="#3d6a2b" stroke-width="1.6"/><path d="M12 12C6 12 4 7 5 4c4 0 7 3 7 8ZM12 15c5 0 8-3 8-7-4 0-8 2-8 7Z" fill="#5e9a3f" ${S}/>`,
  silver: `<circle cx="12" cy="12" r="8" fill="#c6ccd4" ${S}/><circle cx="12" cy="12" r="5.2" fill="none" stroke="#8e97a3" stroke-width="1.2"/><path d="M9 9l2 1" stroke="#fff" stroke-width="1.4" stroke-linecap="round"/>`,
  gems: `<path d="M6 8l3-4h6l3 4-6 12Z" fill="#3fa7c9" ${S}/><path d="M6 8h12M9 4l3 4 3-4M12 8v12" stroke="#1f6f8c" stroke-width=".9"/><path d="M9 5.5l1.5 2" stroke="#d6f3ff" stroke-width="1.2"/>`,
  crystals: `<path d="M8 20l-2-9 3-6 3 6-1 9Z" fill="#9b72d6" ${S}/><path d="M13 20l1-12 3-4 3 5-2 11Z" fill="#b893ee" ${S}/><path d="M15 6l1 6" stroke="#efe4ff" stroke-width="1.1"/>`,
  rareOre: `<path d="M4 16l3-7 6-3 6 3 1 8-6 3H8Z" fill="#5b4b6e" ${S}/><path d="M9 10l3 2-2 3ZM14 9l3 3-3 1Z" fill="#ff9f43"/><path d="M12 15l3 2-3 1Z" fill="#ffd166"/>`,
  ancientWood: `<path d="M12 21V12" stroke="#5f3d22" stroke-width="2.4"/><circle cx="12" cy="9" r="6.5" fill="#3f7a5a" ${S}/><circle cx="9.5" cy="8" r="1.4" fill="#a8e6c3"/><circle cx="14" cy="11" r="1.1" fill="#a8e6c3"/><path d="M8 21h8" stroke="${K}" stroke-width="1.3"/>`,
  planks: `<path d="M3 7h18v4H3ZM3 13h18v4H3Z" fill="#c48d55" ${S}/><path d="M7 9h4M13 15h5" stroke="#8a5a33" stroke-width=".9"/>`,
  frames: `<path d="M4 20V8l8-5 8 5v12" fill="none" stroke="${K}" stroke-width="3.2"/><path d="M4 20V8l8-5 8 5v12M4 12h16M12 3v17" fill="none" stroke="#c48d55" stroke-width="1.8"/>`,
  weapons: `<path d="M5 19L17 7" stroke="${K}" stroke-width="3.4" stroke-linecap="round"/><path d="M5 19L17 7" stroke="#c9d1da" stroke-width="1.8" stroke-linecap="round"/><path d="M17 7l3-3" stroke="#e8eef3" stroke-width="2" stroke-linecap="round"/><path d="M4 14l6 6" stroke="#8a5a33" stroke-width="2.6" stroke-linecap="round"/>`,
  rations: `<rect x="5" y="6" width="14" height="13" rx="2" fill="#a8743f" ${S}/><path d="M5 10h14" stroke="${K}" stroke-width="1.1"/><rect x="9" y="12" width="6" height="4" fill="#efe3c8" stroke="${K}" stroke-width=".8"/>`,
  grain: `<path d="M12 21V6" stroke="#9c7a2f" stroke-width="1.5"/><path d="M12 6c-2-1-2-3 0-4 2 1 2 3 0 4ZM12 10c-3 0-4-2-4-3 2 0 4 1 4 3Zm0 0c3 0 4-2 4-3-2 0-4 1-4 3ZM12 14c-3 0-4-2-4-3 2 0 4 1 4 3Zm0 0c3 0 4-2 4-3-2 0-4 1-4 3Z" fill="#e2b84a" ${S}/>`,
  flour: `<path d="M7 7h10l2 13H5Z" fill="#efe6d3" ${S}/><path d="M7 7c0-2 2-3 5-3s5 1 5 3" fill="none" stroke="${K}" stroke-width="1.3"/><path d="M9 13h6" stroke="#b9a98a" stroke-width="1.2"/>`,
  bread: `<path d="M3 15c0-5 4-8 9-8s9 3 9 8v2H3Z" fill="#d49a4c" ${S}/><path d="M8 10l1.5 3M12 9v3.5M16 10l-1.5 3" stroke="#8a5a26" stroke-width="1.2" stroke-linecap="round"/>`,
  hides: `<path d="M6 5c2 1 4 1 6 0 2 1 4 1 6 0l1 5-2 3 1 6c-3 1-9 1-12 0l1-6-2-3Z" fill="#b78a5c" ${S}/><circle cx="12" cy="12" r="2" fill="#8e6239"/>`,
  wool: `<circle cx="9" cy="11" r="4" fill="#f2ede2" ${S}/><circle cx="15" cy="11" r="4" fill="#f2ede2" ${S}/><circle cx="12" cy="15" r="4.5" fill="#f2ede2" ${S}/><circle cx="12" cy="8" r="3.4" fill="#f2ede2" ${S}/>`,
};

// Navigation (catégories) : silhouettes simples en bronze
const NAV = {
  'g-kingdom': `<path d="M4 21V10l3-2v-3h2v3l3-2 3 2V5h2v3l3 2v11Z" fill="currentColor"/><path d="M10 21v-4a2 2 0 0 1 4 0v4" fill="#1d1812" opacity=".55"/>`,
  'g-world': `<path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2Z" fill="currentColor"/><path d="M9 4v14M15 6v14" stroke="#1d1812" stroke-width="1.2" opacity=".5"/>`,
  'g-army': `<path d="M5 19L17 5M19 19L7 5" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/><path d="M3 15l4 4M21 15l-4 4" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/>`,
  'g-prod': `<path d="M4 20l9-9" stroke="currentColor" stroke-width="2.8" stroke-linecap="round"/><path d="M10 5l5-2 6 6-2 5-3-3-2 2-4-4 2-2Z" fill="currentColor"/>`,
  'g-trade': `<path d="M12 3v18M5 21h14" stroke="currentColor" stroke-width="2"/><path d="M4 7h16" stroke="currentColor" stroke-width="2"/><path d="M4 7l-3 7h6ZM20 7l-3 7h6Z" fill="currentColor"/>`,
  'g-heroes': `<circle cx="12" cy="7" r="4" fill="currentColor"/><path d="M4 21c0-5 4-8 8-8s8 3 8 8Z" fill="currentColor"/>`,
  'g-tech': `<path d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-5-9V3" fill="none" stroke="currentColor" stroke-width="2"/><path d="M7 16h10l1.5 3H5.5Z" fill="currentColor"/>`,
  'g-events': `<path d="M12 2L3 9v12h18V9Z" fill="currentColor"/><path d="M12 2v7M8 21v-6h8v6" stroke="#1d1812" stroke-width="1.4" opacity=".55" fill="none"/>`,
  'g-wheel': `<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2.2"/><path d="M12 3v18M3 12h18M5.6 5.6l12.8 12.8M18.4 5.6L5.6 18.4" stroke="currentColor" stroke-width="1.3"/><circle cx="12" cy="12" r="2.4" fill="currentColor"/>`,
  'g-guild': `<path d="M12 2l8 4v6c0 5-4 8-8 10-4-2-8-5-8-10V6Z" fill="currentColor"/><path d="M12 7v10M8 11h8" stroke="#1d1812" stroke-width="1.6" opacity=".55"/>`,
  'g-chron': `<path d="M6 3h11a3 3 0 0 1 3 3v15H9a3 3 0 0 1-3-3Z" fill="currentColor"/><path d="M9 8h8M9 12h8M9 16h5" stroke="#1d1812" stroke-width="1.3" opacity=".55"/>`,
  advisor: `<path d="M12 2l5 9H7Z" fill="currentColor"/><circle cx="12" cy="13" r="3.2" fill="currentColor"/><path d="M6 22c0-4 3-6 6-6s6 2 6 6Z" fill="currentColor"/>`,
};

const symbol = (id, body) => `<symbol id="${id}" viewBox="0 0 24 24">${body}</symbol>`;
const DEFS = Object.entries(RES).map(([k, b]) => symbol('r-' + k, b)).join('') + Object.entries(NAV).map(([k, b]) => symbol('n-' + k, b)).join('');

export function ensureIconDefs() {
  if (typeof document === 'undefined' || document.getElementById('icon-defs')) return;
  const holder = document.createElement('div');
  holder.innerHTML = `<svg id="icon-defs" width="0" height="0" style="position:absolute;width:0;height:0;overflow:hidden" aria-hidden="true"><defs>${DEFS}</defs></svg>`;
  document.body.appendChild(holder.firstChild);
}

export const hasResIcon = (r) => !!RES[r];
// Icône de ressource (repli : l'emoji de la donnée, si une ressource n'a pas encore d'icône dessinée)
export function resIcon(r, size = 16, fallback = '') {
  if (!RES[r]) return fallback;
  return `<svg class="ic ic-res" width="${size}" height="${size}" viewBox="2 2 20 20" aria-hidden="true"><use href="#r-${r}"/></svg>`;
}
export const navIcon = (id, size = 24) => (NAV[id] ? `<svg class="ic ic-nav" width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true"><use href="#n-${id}"/></svg>` : '');
export const RES_ICON_KEYS = Object.keys(RES);
// Balisage des symboles (planche d'icônes des outils de vérification)
export const iconDefsMarkup = () => `<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>${DEFS}</defs></svg>`;
