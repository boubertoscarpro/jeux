// v20 « Ma forteresse » — Mode photo : l'affichage disparaît, le joueur choisit l'heure et la saison, puis enregistre
// une image PNG composée dans le navigateur. v21 : la scène étant peinte en canvas, l'image recopie le sol, la scène et
// une image de la vie (passants, gardes, fumées), puis la teinte de l'heure. Rien d'externe : le fichier est téléchargé.
import { sceneCanvases } from './paint/cityPaint.js';
import { lifeInto } from './paint/life.js';

export const PHOTO_HOURS = { 8: 'Matin', 13: 'Midi', 19: 'Soir', 23: 'Nuit' };
export const PHOTO_SEASONS = { spring: 'Printemps', summer: 'Été', autumn: 'Automne', winter: 'Hiver' };
export const PHOTO_MAX = 4096;

const px = (v) => parseFloat(v) || 0;
// Canvas de la scène entière (taille du monde × k)
export function sceneCanvas(world, light = null, kMax = 1.5) {
  const W = Math.round(px(world.style.width)), H = Math.round(px(world.style.height));
  const k = Math.min(kMax, PHOTO_MAX / Math.max(W, H));
  const c = document.createElement('canvas');
  c.width = Math.round(W * k); c.height = Math.round(H * k);
  const g = c.getContext('2d');
  g.fillStyle = '#4f7a2c'; g.fillRect(0, 0, c.width, c.height);
  const { ground, scene } = sceneCanvases();
  if (ground) g.drawImage(ground, 0, 0, c.width, c.height);
  if (scene) g.drawImage(scene, 0, 0, c.width, c.height);
  g.save(); g.scale(k, k); lifeInto(g); g.restore();
  if (light && light.a > 0.01) { g.globalAlpha = light.a; g.fillStyle = `rgb(${light.tint.join(',')})`; g.fillRect(0, 0, c.width, c.height); g.globalAlpha = 1; }
  return c;
}
// Image PNG (Blob) de la scène ; échelle bornée pour rester sous PHOTO_MAX pixels de côté
export function photoBlob(world, light) {
  return new Promise((resolve, reject) => {
    const c = sceneCanvas(world, light);
    c.toBlob((b) => (b ? resolve(b) : reject(new Error('Image vide'))), 'image/png');
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
