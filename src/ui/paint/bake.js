// v21 « Couleurs du Royaume » — Cuisson des dessins : un bâtiment est peint une fois sur un canvas hors écran, puis
// reçoit les passes qui lui donnent son aspect « illustration » :
//  1. lumière d'ambiance : chaude en haut à gauche, plus froide et plus sombre en bas à droite (sur ses seuls pixels) ;
//  2. saturation légèrement relevée ;
//  3. contour de silhouette sombre et régulier (style « cartoon lisible »).
// Le résultat est une image (canvas) réutilisée telle quelle à chaque rendu de la carte.
import { INK } from './paint.js';

const mk = (w, h) => {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas'); c.width = w; c.height = h; return c;
};

export function bake(w, h, draw, { outline = 1.6, light = 0.3, shade = 0.22, saturate = 1.12, s = 2 } = {}) {
  const art = mk(w, h), g = art.getContext('2d');
  draw(g);
  // 1. lumière d'ambiance, uniquement sur les pixels déjà peints
  if (light || shade) {
    g.save();
    g.globalCompositeOperation = 'source-atop';
    const lg = g.createLinearGradient(0, 0, w, h);
    lg.addColorStop(0, `rgba(255,214,140,${light})`); lg.addColorStop(0.45, 'rgba(255,214,140,0)');
    lg.addColorStop(0.62, 'rgba(40,30,90,0)'); lg.addColorStop(1, `rgba(40,30,90,${shade})`);
    g.fillStyle = lg; g.fillRect(0, 0, w, h);
    g.restore();
  }
  // 2 et 3. composition finale : silhouette sombre élargie, puis le dessin saturé par-dessus
  const out = mk(w, h), o = out.getContext('2d');
  if (outline > 0) {
    const r = outline * s;
    const sil = mk(w, h), sg = sil.getContext('2d');
    for (let a = 0; a < 12; a++) sg.drawImage(art, Math.cos((a / 12) * Math.PI * 2) * r, Math.sin((a / 12) * Math.PI * 2) * r);
    sg.globalCompositeOperation = 'source-in'; sg.fillStyle = INK; sg.fillRect(0, 0, w, h);
    o.drawImage(sil, 0, 0);
  }
  o.filter = `saturate(${saturate})`;
  o.drawImage(art, 0, 0);
  o.filter = 'none';
  return out;
}
