// v20 « Ma forteresse » — Le film du château (module pur). Les identifiants des bâtiments portent leur date de
// création (base 36) et l'enceinte garde l'historique de ses agrandissements : la croissance se rejoue sans rien
// enregistrer de plus. Les bâtiments d'origine (identifiants fixes) apparaissent dès la première image.
import { rectOf, squareRect } from './castle.js';
import { ENC_STAGES } from '../data/castle.js';

const T_MIN = Date.UTC(2015, 0, 1), T_MAX = Date.UTC(2100, 0, 1);
export function buildTime(id) {
  const m = /^b_([0-9a-z]{8})[0-9a-z]*$/.exec(String(id || '')); // b_townhall_11_7 (bâtiments d'origine) : date inconnue
  if (!m) return 0;
  const t = parseInt(m[1], 36);
  return t > T_MIN && t < T_MAX ? t : 0;
}
// Images du film : { t, ids (Set), rect, label } — au plus `steps` images, la dernière montre la ville d'aujourd'hui
export function filmPlan(state, steps = 40) {
  const list = Object.values(state.city.buildings).map((b) => ({ id: b.id, t: buildTime(b.id) })).sort((a, b) => a.t - b.t);
  if (!list.length) return [];
  const hist = (state.castle?.history || []).slice().sort((a, b) => a.t - b.t);
  const t0 = list.find((x) => x.t)?.t || Date.now();
  const t1 = Math.max(list[list.length - 1].t, ...hist.map((h) => h.t), t0 + 1);
  const n = Math.max(2, Math.min(steps, list.length + hist.length));
  const first = squareRect(state, ENC_STAGES[0].size);
  const frames = [];
  for (let i = 0; i < n; i++) {
    const t = i === n - 1 ? Infinity : t0 + ((t1 - t0) * i) / (n - 1);
    const ids = new Set(list.filter((x) => x.t <= t).map((x) => x.id));
    const h = [...hist].reverse().find((x) => x.t <= t);
    const rect = i === n - 1 ? rectOf(state) : h?.rect || first;
    frames.push({ t: Number.isFinite(t) ? t : Date.now(), ids, rect, n: ids.size });
  }
  return frames;
}
