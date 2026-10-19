// Notifications (v17) : badges affichés après 1 h de jeu, en partant d'un royaume dont tout a été lu.
// Sauvegardes de milieu et de fin de partie ; 1 h jouée par le moteur (sans joueur) avec 4 graines, moyenne.
// v16 : badge cloche = notifications non lues, badge Rapports = rapports non lus.
// v17 : badges calculés par systems/notices.js (regroupement, urgent ou informatif, vu à l'écran, plafond 9+).
// Usage : node tools/v17notifs.mjs <racine du dépôt> <sauvegarde.json>...
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
const [root, ...files] = process.argv.slice(2);
const imp = (p) => import(pathToFileURL(root + p).href);
const { deserialize } = await imp('/src/core/save.js');
const { advance } = await imp('/src/core/engine.js');
const { rng, mulberry32 } = await imp('/src/core/rng.js');
let notices = null; try { notices = await imp('/src/systems/notices.js'); } catch {}
const out = {};
for (const f of files) {
  const res = [];
  for (const seed of [1, 2, 3, 4]) {
    rng.setSource(mulberry32(seed));
    const s = deserialize(readFileSync(f, 'utf8'));
    const t0 = s.meta.lastTick;
    for (const n of s.notifications || []) n.read = true;
    for (const r of s.reports || []) r.read = true;
    if (notices) notices.markAllSeen?.(s, t0);
    advance(s, t0 + 3600e3);
    const rawNotif = (s.notifications || []).filter((n) => !n.read).length;
    const rawRep = (s.reports || []).filter((r) => !r.read).length;
    const b = notices ? notices.badges(s, t0 + 3600e3) : { bell: rawNotif, reports: rawRep, urgent: null };
    res.push({ rawNotif, rawRep, bell: b.bell, reports: b.reports, urgent: b.urgent });
  }
  rng.setSource(Math.random);
  const avg = (k) => Math.round((res.reduce((a, r) => a + (r[k] || 0), 0) / res.length) * 10) / 10;
  out[f.split('/').pop()] = { rawNotif: avg('rawNotif'), rawRep: avg('rawRep'), bell: avg('bell'), reports: avg('reports'), shownTotal: Math.round((avg('bell') + avg('reports')) * 10) / 10, urgent: notices ? avg('urgent') : null };
}
console.log(JSON.stringify(out, null, 1));
