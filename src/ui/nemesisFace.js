// v15 — Portrait d'un seigneur de la Brèche, en SVG généré (aucune image externe). Les traits viennent du nom
// (stables d'une partie à l'autre) ; les cicatrices et les titres viennent de son histoire avec vous.
const hash = (str) => { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
const SKIN = ['#e6c2a0', '#c99a74', '#a8764f', '#7d5537', '#d9b48f'];
const HAIR = ['#2b1e14', '#5a3b22', '#8a8a86', '#a5552c', '#d8cfc0'];
const TIER = ['#9c7a4a', '#8d8a84', '#7c6f62', '#5a4d63'];

/**
 * lord : { name, scars[], titles[], tier } ; size : côté en pixels.
 * Renvoie une chaîne SVG (avec un titre accessible).
 */
export function lordFaceSvg(lord, size = 56) {
  const h = hash(lord.name || '?');
  const skin = SKIN[h % SKIN.length], hair = HAIR[(h >>> 3) % HAIR.length], metal = TIER[Math.max(0, Math.min(3, (lord.tier || 1) - 1))];
  const wide = 15 + ((h >>> 6) % 4), jaw = 20 + ((h >>> 9) % 4);
  const helm = (h >>> 12) % 3, beard = (h >>> 15) % 3, brow = (h >>> 18) % 2;
  const scars = new Set(lord.scars || []);
  const titles = (lord.titles || []).length;
  const p = [];
  p.push(`<rect width="64" height="64" rx="10" fill="#1d1812"/>`);
  p.push(`<path d="M10 64 Q32 44 54 64Z" fill="${metal}" stroke="#0d0a07" stroke-width="1.5"/>`); // épaules
  p.push(`<ellipse cx="32" cy="34" rx="${wide}" ry="${jaw}" fill="${skin}" stroke="#0d0a07" stroke-width="1.5"/>`);
  if (beard === 1) p.push(`<path d="M${32 - wide + 2} 36 Q32 ${58 + (h % 3)} ${32 + wide - 2} 36 Q32 46 ${32 - wide + 2} 36Z" fill="${hair}" stroke="#0d0a07" stroke-width="1"/>`);
  if (beard === 2) p.push(`<path d="M24 44 Q32 50 40 44 Q32 47 24 44Z" fill="${hair}" stroke="#0d0a07" stroke-width="1"/>`);
  // Yeux et sourcils (un œil couvert d'un bandeau si cicatrice « eye »)
  p.push(`<circle cx="26" cy="33" r="1.8" fill="#14100c"/>`);
  if (scars.has('eye')) p.push(`<path d="M18 26 L46 36" stroke="#14100c" stroke-width="1.6"/><ellipse cx="38" cy="33" rx="4" ry="3.2" fill="#14100c"/>`);
  else p.push(`<circle cx="38" cy="33" r="1.8" fill="#14100c"/>`);
  p.push(`<path d="M22 ${28 + brow} L29 ${29 - brow} M35 ${29 - brow} L42 ${28 + brow}" stroke="${hair}" stroke-width="2.2" stroke-linecap="round"/>`);
  p.push(`<path d="M32 34 L30 40 L33 40" fill="none" stroke="#0d0a07" stroke-width="1.2" stroke-linejoin="round"/>`);
  p.push(`<path d="M27 45 Q32 ${titles ? 47 : 43} 37 45" fill="none" stroke="#0d0a07" stroke-width="1.4" stroke-linecap="round"/>`);
  // Casque (palier : couleur du métal)
  if (helm === 0) p.push(`<path d="M${32 - wide - 1} 30 Q32 6 ${32 + wide + 1} 30 L${32 + wide + 1} 26 Q32 10 ${32 - wide - 1} 26Z" fill="${metal}" stroke="#0d0a07" stroke-width="1.5"/><path d="M32 12 L32 37" stroke="#0d0a07" stroke-width="2.6"/>`);
  if (helm === 1) p.push(`<path d="M${32 - wide - 1} 28 Q32 4 ${32 + wide + 1} 28Z" fill="${metal}" stroke="#0d0a07" stroke-width="1.5"/><path d="M${32 - wide} 25 L${15 - wide / 4} 10 L${32 - wide + 6} 22Z M${32 + wide} 25 L${49 + wide / 4} 10 L${32 + wide - 6} 22Z" fill="#e8dcc4" stroke="#0d0a07" stroke-width="1.2"/>`);
  if (helm === 2) p.push(`<path d="M${32 - wide} 27 Q32 12 ${32 + wide} 27 Q32 20 ${32 - wide} 27Z" fill="${hair}" stroke="#0d0a07" stroke-width="1.2"/><rect x="${32 - wide}" y="23" width="${wide * 2}" height="4" fill="${metal}" stroke="#0d0a07" stroke-width="1"/>`);
  // Cicatrices
  if (scars.has('cheek')) p.push(`<path d="M20 36 L28 44 M21 39 L23 38 M24 42 L26 41" stroke="#8c2a1e" stroke-width="1.6" stroke-linecap="round"/>`);
  if (scars.has('ear')) p.push(`<path d="M${32 + wide - 1} 31 l4 2 l-3 4" fill="none" stroke="#8c2a1e" stroke-width="1.8"/>`);
  if (scars.has('burn')) p.push(`<ellipse cx="25" cy="27" rx="5" ry="2.6" fill="#a9573f" opacity="0.8"/>`);
  // Titres : une pointe de couronne par titre (rouge sang)
  for (let i = 0; i < titles; i++) { const x = 24 + i * 8; p.push(`<path d="M${x} 9 L${x + 3} 2 L${x + 6} 9Z" fill="#b8402e" stroke="#0d0a07" stroke-width="1"/>`); }
  const label = `Portrait de ${lord.name}${scars.size ? `, ${scars.size} cicatrice${scars.size > 1 ? 's' : ''}` : ''}${titles ? `, ${titles} titre${titles > 1 ? 's' : ''}` : ''}`;
  return `<svg class="lord-face" viewBox="0 0 64 64" width="${size}" height="${size}" role="img" aria-label="${label}"><title>${label}</title>${p.join('')}</svg>`;
}

// Image (pour la carte du monde), mise en cache par signature
const cache = new Map();
export function lordFaceImage(lord) {
  const key = `${lord.name}|${(lord.scars || []).join(',')}|${(lord.titles || []).length}|${lord.tier}`;
  let img = cache.get(key);
  if (!img) {
    if (typeof Image === 'undefined') return null;
    img = new Image();
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(lordFaceSvg(lord, 64).replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" '));
    cache.set(key, img);
    if (cache.size > 40) cache.delete(cache.keys().next().value);
  }
  return img.complete && img.naturalWidth ? img : null;
}
