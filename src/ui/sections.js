// v27.1 — Sections nommées pour attribuer les tâches longues (sans dépendance : importable partout)
export const spans = [];
const stack = [];
const now = () => (typeof performance !== 'undefined' ? performance.now() : 0);
export function section(name, fn) {
  const t0 = now();
  stack.push(name);
  try { return fn(); } finally {
    const path = stack.join(' › ');
    stack.pop();
    const t1 = now();
    if (t1 - t0 > 2) { spans.push({ path, t0, t1 }); if (spans.length > 400) spans.splice(0, 100); }
  }
}
if (typeof window !== 'undefined') window.__spans = spans; // outils de mesure
