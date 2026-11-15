// v27.1 « Fluidité » — Mesures en jeu : sections nommées (tick, rendu, affichage fixe, carte, tuiles, cuisson,
// sauvegarde, villageois…), tâches longues (> 50 ms) avec leur cause, images par seconde, mémoire des caches.
// Indicateur de performances : touche F3 (ou Réglages). Qualité automatique : mesure de la machine au premier lancement,
// proposition (jamais imposée) de baisser la qualité si les images par seconde restent basses.
import { addFrameJob, frameStats, mapCovered, wake } from './frame.js';
import { tileDebug, gestureActive } from './tiles.js';
import { spriteStats } from './paint/scene.js';
import { makeTerrainKit } from './terrainKit.js';
import { section, spans } from './sections.js';

const now = () => (typeof performance !== 'undefined' ? performance.now() : 0);
export const perf = { longs: [], frames: [], on: false, el: null, app: null };
export { section };

// Cause d'une tâche longue : la section la plus intérieure qui recouvre le plus de temps
function causeOf(t0, t1) {
  const by = new Map();
  for (const s of spans) {
    const o = Math.min(t1, s.t1) - Math.max(t0, s.t0);
    if (o > 0) by.set(s.path, Math.max(by.get(s.path) || 0, o));
  }
  if (!by.size) return 'navigateur (style, mise en page, peinture)';
  // la plus profonde parmi celles qui couvrent au moins la moitié du temps de la plus longue
  const best = Math.max(...by.values());
  return [...by.entries()].filter(([, o]) => o >= best * 0.5).sort((a, b) => b[0].split(' › ').length - a[0].split(' › ').length || b[1] - a[1])[0][0];
}
if (typeof PerformanceObserver !== 'undefined') {
  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        perf.longs.push({ at: Date.now(), ms: Math.round(e.duration), cause: causeOf(e.startTime, e.startTime + e.duration) });
        if (perf.longs.length > 50) perf.longs.shift();
      }
    }).observe({ type: 'longtask', buffered: false });
  } catch { /* navigateur sans « longtask » */ }
}

// ───────── Images par seconde (mesurées par la boucle centrale quand l'indicateur ou la surveillance tourne) ─────────
let watchOn = true;
addFrameJob('mesure', (t) => {
  if (frameStats.dt > 0 && frameStats.dt < 1000) { perf.frames.push(frameStats.dt); if (perf.frames.length > 240) perf.frames.shift(); }
  if (perf.on) drawHud();
  watchQuality(t);
}, { active: () => perf.on || watchOn, passive: true, alwaysOn: () => perf.on });

export function fpsStats() {
  const f = perf.frames.slice(-120);
  if (!f.length) return { fps: 0, avg: 0, p95: 0 };
  const s = f.slice().sort((a, b) => a - b), avg = f.reduce((a, b) => a + b, 0) / f.length;
  return { fps: Math.round(1000 / avg), avg: +avg.toFixed(1), p95: Math.round(s[Math.floor(s.length * 0.95)]) };
}

// ───────── Indicateur (F3) ─────────
let hudT = 0;
function drawHud() {
  const t = now();
  if (t - hudT < 250 || !perf.el) return;
  hudT = t;
  const f = fpsStats(), td = tileDebug(), sp = spriteStats();
  const heap = performance.memory ? `${Math.round(performance.memory.usedJSHeapSize / 1e6)} Mo` : '—';
  const longs = perf.longs.slice(-5).reverse();
  perf.el.innerHTML = `<b>${f.fps} img/s</b> · image ${f.avg} ms (95 % < ${f.p95} ms)<br>
    Tuiles ${Math.round(td.bytes / 1e6)} / ${Math.round(td.budget / 1e6)} Mo · ${td.queue} en attente · dessins ${Math.round(sp.bytes / 1e6)} / ${Math.round(sp.budget / 1e6)} Mo · JS ${heap}<br>
    <u>Tâches longues récentes</u> (${perf.longs.length})<br>${longs.length ? longs.map((l) => `${new Date(l.at).toLocaleTimeString('fr-FR')} · <b>${l.ms} ms</b> · ${l.cause}`).join('<br>') : 'aucune'}`;
}
export function togglePerfHud(app, on = !perf.on) {
  perf.app = app;
  perf.on = on;
  if (on && !perf.el) {
    perf.el = document.createElement('div');
    perf.el.id = 'perf-hud'; perf.el.setAttribute('role', 'status'); perf.el.setAttribute('aria-live', 'off');
    document.body.appendChild(perf.el);
  }
  if (perf.el) perf.el.hidden = !on;
  if (app?.state) app.state.meta.perfHud = on;
  wake();
}

// ───────── Qualité automatique ─────────
// Mesure de la machine : temps CPU pour peindre une tuile de terrain de 512 × 512 (le travail le plus lourd du jeu),
// plus la cadence d'images réelle pendant 2 s. Renvoie { quality, cpuMs, fps }.
export function measureMachine() {
  return new Promise((resolve) => {
    const K = makeTerrainKit();
    const ters = ['plain', 'forest', 'hills', 'river', 'mountain'];
    const pal = Object.fromEntries(ters.map((t, i) => [t, [90 + i * 30, 120, 70]]));
    const get = (x, y) => ters[((x * 7 + y * 3) >>> 0) % 5];
    // quart de tuile (256 × 256, ~12 ms) puis extrapolé à une tuile entière : pas de tâche longue au démarrage
    const d = new Uint8ClampedArray(256 * 256 * 4);
    const t0 = now();
    const P = K.prepare(0, 0, 4, 4, 64, get, pal, { seed: 7, jitter: 0.42 });
    K.rows(P, d, 0, 256);
    const cpuMs = (now() - t0) * 4;
    const frames = []; let last = now();
    const step = (t) => { frames.push(t - last); last = t; if (frames.length < 90) requestAnimationFrame(step); else done(); };
    requestAnimationFrame(step);
    function done() {
      const f = frames.slice(5).sort((a, b) => a - b), med = f[Math.floor(f.length / 2)] || 16.7;
      const fps = Math.round(1000 / med);
      const quality = cpuMs < 70 && fps >= 50 ? 'high' : cpuMs < 160 && fps >= 35 ? 'medium' : 'low';
      resolve({ quality, cpuMs: Math.round(cpuMs), fps });
    }
  });
}
// Surveillance : images par seconde basses pendant 20 s de jeu ordinaire (pas de geste, rien qui couvre la carte) →
// on propose une fois par session de baisser la qualité
let lowSince = 0, proposed = false;
function watchQuality(t) {
  const app = perf.app;
  if (!app?.state || proposed || app.state.meta.gfx === 'low' || document.hidden || mapCovered() || gestureActive() || app.state.meta.autoQualityOff) { lowSince = 0; return; }
  const f = fpsStats();
  if (perf.frames.length < 60 || f.fps >= 30) { lowSince = 0; return; }
  if (!lowSince) lowSince = t;
  if (t - lowSince > 20000) { proposed = true; app.proposeLowerQuality?.(f.fps); }
}
export function startPerf(app) {
  perf.app = app;
  watchOn = true;
  if (app.state?.meta.perfHud) togglePerfHud(app, true);
}
