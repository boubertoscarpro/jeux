// v27.1 « Fluidité » — Garde-fou de performance : lancé à chaque version (npm run perf). Profil CPU (tools/profile.cjs,
// repos raccourcis) en milieu et fin de partie ; échec (code 1) si un seuil est dépassé. Une version qui échoue n'est
// pas livrée (règle permanente, README).
// Les seuils sont exprimés en temps CPU et en tâches longues, mesurés dans Chromium sans carte graphique (rendu
// logiciel) : ils sont plus durs à tenir ici que sur un portable avec carte graphique intégrée.
const { execFileSync } = require('child_process');
const fs = require('fs'), path = require('path'), os = require('os');
const DIST = path.resolve(process.argv[2] || path.resolve(__dirname, '../dist/cendrelande.html'));
const OUT = path.join(os.tmpdir(), `perfgate-${process.pid}.json`);
// Seuils par scénario : occupé (% du temps CPU du fil principal), tâches longues (> 50 ms), 95e centile des images (ms)
const LIMITS = {
  'château-repos': { busy: 40, longs: 3, p95: 34 },
  'monde-repos': { busy: 25, longs: 1, p95: 34 },
  'quêtes-sauvegarde': { busy: 45, longs: 3, p95: 50 },
  'château-geste': { busy: 70, longs: 16, p95: 67 },
  'monde-geste': { busy: 80, longs: 40, p95: 84 },
  'fenêtres': { busy: 60, longs: 24, p95: 100 }, // le point le plus lent qui reste (AUDIT_V27_1 § 4)
};
// Deux passages complets ; pour chaque scénario, le meilleur des deux (le rendu logiciel de cet environnement est
// bruité : une même version varie de 10 à 30 tâches longues d'un passage à l'autre pendant les gestes)
const runs = [];
for (let i = 0; i < 2; i++) {
  execFileSync(process.execPath, [path.join(__dirname, 'profile.cjs'), DIST, '--games', 'milieu,fin', '--short', '--only', Object.keys(LIMITS).join(','), '--json', OUT], { stdio: 'inherit' });
  runs.push(JSON.parse(fs.readFileSync(OUT, 'utf8')));
}
const res = {};
for (const k of Object.keys(runs[0])) {
  const a = runs[0][k], b = runs[1][k] || a;
  res[k] = { busyPct: Math.min(a.busyPct, b.busyPct), longCount: Math.min(a.longCount, b.longCount), p95: Math.min(a.p95, b.p95), errs: [...(a.errs || []), ...(b.errs || [])] };
}
let bad = 0;
console.log('\nScénario                         | occupé | tâches > 50 ms | p95 image | statut');
for (const [k, r] of Object.entries(res)) {
  const L = LIMITS[k.split(' · ')[1]];
  if (!L) continue;
  const fails = [];
  if (r.busyPct > L.busy) fails.push(`occupé ${r.busyPct} % > ${L.busy}`);
  if (r.longCount > L.longs) fails.push(`${r.longCount} tâches longues > ${L.longs}`);
  if (r.p95 > L.p95) fails.push(`p95 ${r.p95} ms > ${L.p95}`);
  if (r.errs?.length) fails.push(`erreur : ${r.errs[0]}`);
  if (fails.length) bad++;
  console.log(`${k.padEnd(32)} | ${String(r.busyPct).padStart(4)} % | ${String(r.longCount).padStart(14)} | ${String(r.p95).padStart(6)} ms | ${fails.length ? 'ÉCHEC : ' + fails.join(', ') : 'ok'}`);
}
fs.rmSync(OUT, { force: true });
console.log(bad ? `\n${bad} scénario(s) au-delà des seuils : version à ne pas livrer.` : '\nTous les seuils de performance sont tenus.');
process.exit(bad ? 1 : 0);
