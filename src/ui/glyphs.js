import { sigilSvg, sigilKey } from './sigils.js';
// v15 — Une seule langue d'icônes dans l'interface : glyphes SVG monochromes (trait d'encre, couleur du texte) pour
// les emojis les plus fréquents des onglets, titres, boutons et puces. Une passe après chaque rendu remplace l'emoji
// de tête de ces éléments par son glyphe ; un emoji sans glyphe est harmonisé (taille, alignement, teinte adoucie).
// Les textes narratifs (journal, chronique, notifications) gardent leurs emojis.
const P = (d, extra = '') => `<path d="${d}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"${extra}/>`;
const F = (d, op = 1) => `<path d="${d}" fill="currentColor" opacity="${op}"/>`;

export const GLYPHS = {
  '📜': P('M6 4h11a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V4Zm0 0a2 2 0 0 0-2 2v2h2M9 9h7M9 12h7M9 15h5'),
  '🧭': P('M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Z') + F('M15.5 8.5l-2 5-5 2 2-5Z', 0.9),
  '✕': P('M6 6l12 12M18 6L6 18'),
  '⏳': P('M7 3h10M7 21h10M8 3c0 5 8 6 8 9s-8 4-8 9M16 3c0 5-8 6-8 9s8 4 8 9'),
  '⬆': P('M12 19V5M6 11l6-6 6 6'),
  '⚖️': P('M12 4v16M7 20h10M5 7h14M5 7l-3 6h6ZM19 7l-3 6h6Z'),
  '⚔️': P('M5 5l9 9M19 5l-9 9M3 17l4 4M21 17l-4 4M8 18l-2-2M16 18l2-2'),
  '💠': P('M12 3l7 9-7 9-7-9Z') + F('M12 7l4 5-4 5-4-5Z', 0.45),
  '🗓️': P('M4 6h16v14H4ZM4 10h16M8 3v4M16 3v4M8 14h2M12 14h2M8 17h2'),
  '📅': P('M4 6h16v14H4ZM4 10h16M8 3v4M16 3v4M8 14h2M12 14h2M8 17h2'),
  '✎': P('M4 20l4-1 11-11-3-3L5 16Z M14 6l3 3'),
  '👑': P('M3 8l4 4 5-7 5 7 4-4-2 11H5Z') + F('M5 19h14v2H5Z', 0.6),
  '🏆': P('M7 4h10v5a5 5 0 0 1-10 0ZM7 6H4a3 3 0 0 0 3 4M17 6h3a3 3 0 0 1-3 4M12 14v4M8 21h8M9 18h6'),
  '🛡️': P('M12 3l8 3v6c0 5-4 8-8 9-4-1-8-4-8-9V6Z'),
  '🚩': P('M5 21V4M5 4h11l-2 4 2 4H5'),
  '🗺️': P('M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2ZM9 4v14M15 6v14'),
  '👁️': P('M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z') + F('M12 9a3 3 0 1 1 0 6 3 3 0 0 1 0-6Z', 0.9),
  '💾': P('M5 4h11l3 3v13H5ZM8 4v5h7V4M8 20v-6h8v6'),
  '🎪': P('M3 20l9-15 9 15ZM12 5v15M7 20l5-8 5 8'),
  '❓': P('M9 9a3 3 0 1 1 4 2.8c-.8.4-1 1-1 2.2M12 18v.5'),
  '📘': P('M5 4h11a2 2 0 0 1 2 2v14H7a2 2 0 0 1-2-2ZM5 18a2 2 0 0 1 2-2h11'),
  '📖': P('M3 5c3-1 6-1 9 1 3-2 6-2 9-1v14c-3-1-6-1-9 1-3-2-6-2-9-1ZM12 6v14'),
  '🎟️': P('M3 7h18v3a2 2 0 0 0 0 4v3H3v-3a2 2 0 0 0 0-4ZM14 7v10', ' stroke-dasharray="0"'),
  '🔗': P('M10 14l4-4M8 12l-2 2a3 3 0 0 0 4 4l2-2M16 12l2-2a3 3 0 0 0-4-4l-2 2'),
  '📊': P('M4 20h16M7 20v-6M12 20V8M17 20v-10'),
  '↩': P('M9 7L4 12l5 5M4 12h11a5 5 0 0 0 0-10h-2'),
  '⚠️': P('M12 3l10 18H2ZM12 10v5M12 18v.5'),
  '🔮': P('M12 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14ZM7 21h10M9 17l-1 4M15 17l1 4') + F('M10 7a3 3 0 0 0-2 3', 0),
  '🏺': P('M9 3h6M10 3v3c-3 1-5 4-5 7 0 4 3 8 7 8s7-4 7-8c0-3-2-6-5-7V3M7 12h10'),
  '🏛️': P('M3 9l9-5 9 5ZM5 9v9M9 9v9M15 9v9M19 9v9M3 20h18'),
  '🔥': P('M12 21c-4 0-7-3-7-7 0-4 4-6 4-11 3 2 5 5 5 8 1-1 2-2 2-4 2 2 3 4 3 7 0 4-3 7-7 7Z'),
  '🔔': P('M6 17V11a6 6 0 0 1 12 0v6l2 2H4ZM10 21h4'),
  '🔒': P('M6 11h12v9H6ZM8 11V8a4 4 0 0 1 8 0v3'),
  '🔓': P('M6 11h12v9H6ZM8 11V8a4 4 0 0 1 7.5-2'),
  '📋': P('M7 5h10v16H7ZM9 3h6v4H9ZM10 11h4M10 15h4'),
  '🏗️': P('M4 21V5h14M4 5l4 4M18 5v4M15 9h6l-3 4ZM2 21h8'),
  '⏹': P('M7 7h10v10H7Z'),
  '🛠️': P('M14 6l4-2 2 2-2 4-3 0-8 8-2-2 8-8ZM5 5l4 4'),
  '🏅': P('M8 3l4 6 4-6M12 9a6 6 0 1 0 0 12 6 6 0 0 0 0-12ZM12 12v6'),
  '🔁': P('M4 10V9a4 4 0 0 1 4-4h11l-3-3M20 14v1a4 4 0 0 1-4 4H5l3 3'),
  '🪙': P('M12 4c5 0 8 2 8 4s-3 4-8 4-8-2-8-4 3-4 8-4ZM4 8v8c0 2 3 4 8 4s8-2 8-4V8'),
  '↺': P('M5 9a8 8 0 1 1 1 7M5 4v5h5'),
  '🎯': P('M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18ZM12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10Z') + F('M12 10.5a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3Z'),
  '📦': P('M3 8l9-4 9 4v9l-9 4-9-4ZM3 8l9 4 9-4M12 12v9'),
  '⏰': P('M12 7v5l3 2M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16ZM4 4l3-2M20 4l-3-2'),
  '✅': P('M4 12l5 5 11-11'),
  '🔭': P('M3 15l12-6 2 4-12 6ZM15 9l4-2 2 4-4 2M9 17l-2 4M11 16l2 5'),
  '🎁': P('M4 10h16v10H4ZM3 7h18v3H3ZM12 7v13M12 7c-2-4-6-4-6-1s6 1 6 1 6 2 6-1-4-3-6 1'),
  '🌟': P('M12 3l2.6 5.6 6 .7-4.5 4 1.3 6-5.4-3.1-5.4 3.1 1.3-6-4.5-4 6-.7Z'),
  '✨': P('M12 3v6M12 15v6M3 12h6M15 12h6M6 6l3 3M15 15l3 3M18 6l-3 3M6 18l3-3'),
  '🏰': P('M4 21V9l3-2V4h2v3l3-2 3 2V4h2v3l3 2v12ZM10 21v-4a2 2 0 0 1 4 0v4'),
  '⏸': P('M8 5v14M16 5v14'),
  '🌊': P('M2 9c3 0 3-2 5-2s2 2 5 2 3-2 5-2 2 2 5 2M2 15c3 0 3-2 5-2s2 2 5 2 3-2 5-2 2 2 5 2'),
  '🌾': P('M12 21V8M12 8c-2-1-2-4 0-5 2 1 2 4 0 5ZM12 13c-3 0-4-2-4-3 2 0 4 1 4 3Zm0 0c3 0 4-2 4-3-2 0-4 1-4 3ZM12 18c-3 0-4-2-4-3 2 0 4 1 4 3Zm0 0c3 0 4-2 4-3-2 0-4 1-4 3Z'),
  '❄️': P('M12 2v20M3.3 7l17.4 10M20.7 7L3.3 17M9 4l3 2 3-2M9 20l3-2 3 2'),
  '🔍': P('M10 4a6 6 0 1 0 0 12 6 6 0 0 0 0-12ZM15 15l6 6'),
  '🤝': P('M2 11l4-4 4 2 3-2 4 1 5 4-5 5-3-2-2 2-3-2-3 1Z'),
  '🎒': P('M7 8a5 5 0 0 1 10 0v12H7ZM9 4V3h6v1M7 13h10M10 13v3h4v-3'),
  '🗡️': P('M4 20l3-3M7 17l11-11 2-2-1 3-11 11ZM5 15l4 4'),
  '🏚️': P('M3 11l9-7 9 7M5 9v12h14V9M10 21v-5h4v5M14 9l2 3'),
  '👷': P('M6 13a6 6 0 0 1 12 0ZM4 13h16M9 13v-3M15 13v-3M8 17a4 4 0 0 0 8 0'),
  '🔨': P('M14 3l7 7-3 3-7-7ZM11 6l-8 8 3 3 8-8'),
  '🧙‍♂️': P('M12 2l4 9H8ZM6 11h12M8 14a4 4 0 0 0 8 0M10 18l2 4 2-4'),
  '🧙': P('M12 2l4 9H8ZM6 11h12M8 14a4 4 0 0 0 8 0M10 18l2 4 2-4'),
};
const ALIAS = { '⚔': '⚔️', '⚖': '⚖️', '🗓': '🗓️', '🛡': '🛡️', '🗺': '🗺️', '👁': '👁️', '🎟': '🎟️', '⚠': '⚠️', '🏛': '🏛️', '🏗': '🏗️', '🛠': '🛠️', '❄': '❄️', '🏚': '🏚️', '🗡': '🗡️' };

// v22 : tous les symboles passent par les sceaux de Cendrelande (sigils.js), un seul jeu de dessins
export const glyphSvg = (e, cls = 'gl') => (sigilKey(e) ? sigilSvg(e, cls) : null);

// Emoji de tête d'un texte (y compris les séquences avec sélecteur de variante ou liant ZWJ)
const LEAD = /^(\s*)((?:\p{Extended_Pictographic}|[←-⇿⌀-⏿⬀-⯿✀-➿])(?:️|‍(?:\p{Extended_Pictographic}|[♀♂])️?)*)\s?/u;

// Éléments d'interface concernés (les textes narratifs ne le sont pas)
const CHROME = '.subtab, .drawer-tab, .card > h2, .card > h3, .card > h4, .side-box > h3, .btn, button.mini, .chip, .sl, .tab, .modal h2, .rep-thread h3, .almanac h3';

export function iconize(root) {
  if (!root?.querySelectorAll) return;
  for (const el of root.querySelectorAll(CHROME)) {
    if (el.dataset.gl) continue;
    el.dataset.gl = '1';
    const tn = [...el.childNodes].find((n) => n.nodeType === 3 && n.textContent.trim());
    if (!tn || tn !== [...el.childNodes].find((n) => (n.nodeType === 3 && n.textContent.trim()) || n.nodeType === 1)) continue; // l'emoji doit ouvrir l'élément
    const m = tn.textContent.match(LEAD);
    if (!m) continue;
    const svg = glyphSvg(m[2]);
    const span = document.createElement('span');
    span.className = svg ? 'gl-wrap' : 'emo';
    if (svg) { span.innerHTML = svg; span.setAttribute('aria-hidden', 'true'); } else span.textContent = m[2];
    tn.textContent = tn.textContent.slice(m[0].length);
    el.insertBefore(span, tn);
    if (tn.textContent && !/^\s/.test(tn.textContent)) el.insertBefore(document.createTextNode(' '), tn);
  }
}
