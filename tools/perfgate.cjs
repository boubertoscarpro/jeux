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
  'château-repos': { busy: 40, longs: 1, p95: 34 },
  'monde-repos': { busy: 25, longs: 1, p95: 34 },
  'quêtes-sauvegarde': { busy: 45, longs: 2, p95: 50 },
  'château-geste': { busy: 75, longs: 20, p95: 67 },
  'monde-geste': { busy: 80, longs: 30, p95: 84 },
  'fenêtres': { busy: 55, longs: 16, p95: 84 },
};
execFileSync(process.execPath, [path.join(__dirname, 'profile.cjs'), DIST, '--games', 'milieu,fin', '--short', '--only', Object.keys(LIMITS).join(','), '--json', OUT], { stdio: 'inherit' });
const res = JSON.parse(fs.readFileSync(OUT, 'utf8'));
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
