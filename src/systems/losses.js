// Registre des pertes (sans dépendance, utilisable par tous les systèmes)
const DAY = 86400000;

// Enregistre une perte (pillage, vague, convoi attaqué, famine…) dans un registre glissant de 7 jours
export function recordLoss(state, cause, res, now = Date.now()) {
  const day = Math.floor(now / DAY);
  const L = (state.stats.losses ||= {});
  const d = (L[day] ||= {});
  const c = (d[cause] ||= {});
  for (const [r, v] of Object.entries(res || {})) if (v > 0) c[r] = (c[r] || 0) + v;
  for (const k of Object.keys(L)) if (+k < day - 6) delete L[k];
}

