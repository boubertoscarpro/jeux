// v27.1 « Fluidité » — Une seule boucle d'animation pour tout le jeu.
// Chaque animation (villageois, guide des quêtes, indicateur de performances) s'inscrit comme une tâche avec sa cadence
// (every, en ms) et sa condition (active). La boucle s'arrête d'elle-même quand plus rien n'est animé, quand l'onglet est
// caché, et met en pause les tâches de la carte quand une fenêtre ou une boîte de dialogue la couvre.
const jobs = new Map();
let raf = 0;
export const frameStats = { frames: 0, last: 0, dt: 0 };

// La carte est-elle couverte (fenêtre de lieu ouverte ou boîte de dialogue) ?
let modalEl = null, appEl = null;
export function mapCovered() {
  if (typeof document === 'undefined') return false;
  if (!modalEl?.isConnected) modalEl = document.getElementById('modal-root');
  if (!appEl?.isConnected) appEl = document.getElementById('app');
  return !!(modalEl?.classList.contains('open') || appEl?.classList.contains('win-open'));
}

/**
 * name : identifiant unique ; fn(now, dt) ; every : cadence minimale en ms ; active() : la tâche a-t-elle du travail ?
 * map : true si c'est une animation de la carte (mise en pause quand une fenêtre la couvre).
 */
// passive : la tâche ne tourne (et ne garde la boucle en vie) que si une autre tâche est animée (mesure des images)
export function addFrameJob(name, fn, { every = 0, active = () => true, map = false, passive = false, alwaysOn = null } = {}) {
  jobs.set(name, { fn, every, active, map, passive, alwaysOn, last: 0 });
  wake();
}
export function removeFrameJob(name) { jobs.delete(name); }

export function wake() {
  if (raf || typeof requestAnimationFrame === 'undefined' || (typeof document !== 'undefined' && document.hidden)) return;
  raf = requestAnimationFrame(loop);
}
function loop(now) {
  raf = 0;
  frameStats.dt = now - (frameStats.last || now); frameStats.last = now; frameStats.frames++;
  const covered = mapCovered();
  let any = false;
  const on = new Map();
  for (const [name, j] of jobs) { let a = false; try { a = j.active(); } catch { a = false; } on.set(name, a); if (a && !j.passive && !(j.map && covered)) any = true; }
  for (const [name, j] of jobs) {
    if (!on.get(name) || (j.passive && !any && !j.alwaysOn?.())) continue;
    if (j.map && covered) continue;
    if (now - j.last < j.every) continue;
    const dt = j.last ? now - j.last : 16;
    j.last = now;
    try { j.fn(now, dt); } catch (e) { console.error(`animation ${name}`, e); }
  }
  const keep = any || [...jobs.values()].some((j) => j.alwaysOn?.());
  if (keep && !document.hidden) raf = requestAnimationFrame(loop);
}
if (typeof document !== 'undefined') document.addEventListener('visibilitychange', () => { if (!document.hidden) wake(); });
