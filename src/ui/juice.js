// v21 « Couleurs du Royaume » — Petits effets de récompense (« juice ») : nombres qui montent, pièces qui volent vers
// la jauge de la ressource, qui pulse à l'arrivée. Purement décoratif (aria-hidden) : le gain est déjà annoncé par la
// notification. Rien en mouvement réduit ni en mode économie (la jauge pulse seulement).
import { resIcon } from './icons.js';
import { fmt } from '../core/util.js';

const calm = () => { const h = document.documentElement; return h.classList.contains('reduce-motion') || h.classList.contains('saver') || matchMedia('(prefers-reduced-motion: reduce)').matches; };
// from : élément ou point { x, y } (px de la fenêtre) ; got : { ressource: quantité }
export function flyGains(from, got) {
  if (typeof document === 'undefined' || !got) return;
  const r = from instanceof Element ? from.getBoundingClientRect() : null;
  const x0 = r ? r.left + r.width / 2 : from?.x ?? innerWidth / 2, y0 = r ? r.top + r.height / 3 : from?.y ?? innerHeight / 2;
  const list = Object.entries(got).filter(([, v]) => v > 0).slice(0, 5);
  list.forEach(([k, v], i) => {
    const target = document.querySelector(`.hres[data-arg="${k}"]`);
    const pulse = () => { if (!target) return; target.classList.remove('w21-pulse'); void target.offsetWidth; target.classList.add('w21-pulse'); };
    if (calm()) { pulse(); return; }
    const num = document.createElement('div');
    num.className = 'w21-num'; num.setAttribute('aria-hidden', 'true');
    num.innerHTML = `+${fmt(Math.round(v))} ${resIcon(k, 20, '')}`;
    num.style.left = x0 + 'px'; num.style.top = (y0 - i * 26) + 'px';
    document.body.appendChild(num);
    setTimeout(() => num.remove(), 1400);
    if (!target) return;
    const t = target.getBoundingClientRect(), tx = t.left + 14, ty = t.top + t.height / 2;
    const n = Math.min(6, 2 + Math.floor(Math.log10(v + 1)));
    for (let j = 0; j < n; j++) {
      const c = document.createElement('div');
      c.className = 'w21-coin'; c.setAttribute('aria-hidden', 'true'); c.innerHTML = resIcon(k, 22, '');
      const sx = x0 + (Math.random() - 0.5) * 40, sy = y0 + (Math.random() - 0.5) * 30;
      c.style.left = sx + 'px'; c.style.top = sy + 'px';
      document.body.appendChild(c);
      const delay = 120 + i * 90 + j * 70;
      c.animate([
        { transform: 'translate(-50%, -50%) scale(.6)', opacity: 0 },
        { transform: `translate(calc(-50% + ${(Math.random() - 0.5) * 60}px), calc(-50% - 40px)) scale(1.1)`, opacity: 1, offset: 0.3 },
        { transform: `translate(calc(-50% + ${tx - sx}px), calc(-50% + ${ty - sy}px)) scale(.7)`, opacity: 1 },
      ], { duration: 760, delay, easing: 'cubic-bezier(.5,0,.7,1)', fill: 'both' }).onfinish = () => { c.remove(); if (j === n - 1) pulse(); };
    }
  });
}
