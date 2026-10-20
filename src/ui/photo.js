// v20 « Ma forteresse » — Mode photo : l'affichage disparaît, le joueur choisit l'heure et la saison, puis enregistre
// une image PNG composée dans le navigateur. Le sol (canvas) devient une image intégrée ; chaque dessin (SVG) est
// recopié avec ses symboles, dans l'ordre de profondeur. Rien d'externe, aucun envoi : le fichier est téléchargé.
const NS = 'http://www.w3.org/2000/svg';
export const PHOTO_HOURS = { 8: 'Matin', 13: 'Midi', 19: 'Soir', 23: 'Nuit' };
export const PHOTO_SEASONS = { spring: 'Printemps', summer: 'Été', autumn: 'Automne', winter: 'Hiver' };
export const PHOTO_MAX = 4096;

const px = (v) => parseFloat(v) || 0;
// SVG complet de la scène (taille du monde au zoom 1)
export function sceneSvg(world, light = null) {
  const W = Math.round(px(world.style.width)), H = Math.round(px(world.style.height));
  const parts = [];
  const cv = world.querySelector('.iso-ground canvas');
  if (cv) {
    const m = /matrix\(([^)]+)\)/.exec(cv.style.transform || '');
    const mat = m ? m[1].split(',').map((x) => +x) : [1, 0, 0, 1, 0, 0];
    let href = '';
    try { href = cv.toDataURL('image/png'); } catch { href = ''; }
    if (href) parts.push(`<image href="${href}" width="${cv.width}" height="${cv.height}" transform="matrix(${mat.join(' ')})"/>`);
  }
  const items = [...world.querySelectorAll('.iso-s, .iso-w, .tile.iso-b, .iso-ghost')].map((el, i) => ({ el, i, z: +el.style.zIndex || 0 }));
  items.sort((a, b) => a.z - b.z || a.i - b.i);
  for (const { el } of items) {
    const x = px(el.style.left), y = px(el.style.top);
    const arts = [...el.querySelectorAll('svg.iso-art')].map((s) => s.outerHTML).join('');
    if (arts) parts.push(`<g transform="translate(${x} ${y})"${el.classList.contains('iso-ghost') ? ' opacity="0.45"' : ''}>${arts}</g>`);
  }
  const defs = document.querySelector('#iso-defs defs');
  const tint = light && light.a > 0.01 ? `<rect width="${W}" height="${H}" fill="rgb(${light.tint.join(',')})" opacity="${light.a.toFixed(3)}"/>` : '';
  return { W, H, svg: `<svg xmlns="${NS}" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="${W}" height="${H}" fill="#2f4723"/>${defs ? `<defs>${defs.innerHTML}</defs>` : ''}${parts.join('')}${tint}</svg>` };
}
// Image PNG (Blob) de la scène ; échelle bornée pour rester sous PHOTO_MAX pixels de côté
export function photoBlob(world, light) {
  return new Promise((resolve, reject) => {
    const { W, H, svg } = sceneSvg(world, light);
    const k = Math.min(1.5, PHOTO_MAX / Math.max(W, H));
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = Math.round(W * k); c.height = Math.round(H * k);
      const g = c.getContext('2d');
      g.scale(k, k);
      g.drawImage(img, 0, 0);
      c.toBlob((b) => (b ? resolve(b) : reject(new Error('Image vide'))), 'image/png');
    };
    img.onerror = () => reject(new Error('Composition impossible'));
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  });
}
export async function savePhoto(world, light, name = 'cendrelande') {
  const blob = await photoBlob(world, light);
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${name.replace(/[^a-zA-Z0-9À-ÿ_-]+/g, '-').toLowerCase()}.png`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  return { ok: true, size: blob.size };
}
