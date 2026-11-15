// v27 « Netteté et vie » — Mesure automatique de l'agrandissement réel de chaque couche peinte, sur le jeu compilé.
// Pour chaque densité d'écran (DPR 1, 2, 3) et chaque zoom (minimum, moyen, maximum), monde puis château : on attend la
// fin de la peinture d'arrière-plan, puis on lit ce que le jeu a réellement dessiné à la dernière image
// (app._sharp pour le monde, app._citySharp() pour le château) : niveau utilisé, taille réelle voulue, agrandissement.
// Échec (code 1) si une couche dépasse 1,25, sauf le cas accepté du plan (§ 5.2) : terrain du monde au-delà du niveau
// le plus fin (DPR 3 au zoom maximum).
// Usage : node tools/sharpness.cjs [--json]   DIST=… pour une autre version compilée ; GFX=medium pour une autre qualité.
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require('/opt/node-tools/node_modules/playwright')); }
const fs = require('fs'), path = require('path'), zlib = require('zlib');
const DIST = process.env.DIST || path.resolve(__dirname, '../dist/cendrelande.html');
const save = zlib.gunzipSync(fs.readFileSync(path.resolve(__dirname, '../tests/fixtures/save-fin.json.gz'))).toString();
const LIMIT = 1.25;
const GFX = process.env.GFX || 'high';

async function settle(p, read) {
  // v27.1 : jusqu'à 60 s (la mesure porte sur l'état final ; en DPR 3 sans carte graphique, la finesse 3 à 6 du château
  // met plusieurs dizaines de secondes à se peindre entièrement)
  for (let i = 0; i < 240; i++) {
    await p.waitForTimeout(250);
    const r = await p.evaluate(read);
    if (r && r.tiles && Object.values(r).every((v) => !v || typeof v !== 'object' || !('missing' in v) || v.missing === 0)) return r;
  }
  return p.evaluate(read);
}

(async () => {
  const b = await chromium.launch();
  const rows = [];
  for (const dpr of [1, 2, 3]) {
    const ctx = await b.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: dpr });
    await ctx.addInitScript(([s, g]) => { try { if (!sessionStorage.getItem('sh')) { const o = JSON.parse(s); o.meta = o.meta || {}; o.meta.gfx = g; localStorage.setItem('cendrelande_save', JSON.stringify(o)); sessionStorage.setItem('sh', '1'); } } catch {} }, [save, GFX]);
    const p = await ctx.newPage();
    const errs = [];
    p.on('pageerror', (e) => errs.push(e.message));
    await p.goto('file://' + DIST);
    await p.waitForTimeout(1200);
    await p.evaluate(() => { const a = window.cendrelande; a.state.meta.tipsOff = true; if (a.state.live) a.state.live.unseenReport = null; a.closeModal(); });
    // Monde
    for (const [tag, z] of [['min', 0], ['moyen', 1], ['max', 2.6]]) {
      await p.evaluate((z) => { const a = window.cendrelande; a.ui.map = 'world'; const w = a.state.world; a.ui.cam = { x: w.capital.x + 0.5, y: w.capital.y + 0.5, zoom: z || 0.01 }; a.go('world'); a.closeModal(); }, z);
      const r = await settle(p, () => window.cendrelande._sharp);
      for (const layer of ['terrain', 'fog', 'lieux']) {
        const m = r[layer] || {};
        rows.push({ dpr, vue: 'monde', zoom: tag, z: +r.zoom.toFixed(2), couche: layer, niveau: m.lv ?? m.s, voulu: m.need, agrandissement: m.mag });
      }
    }
    // Château
    await p.evaluate(() => { const a = window.cendrelande; a.ui.map = 'city'; a.go('city'); a.closeModal(); });
    await p.waitForTimeout(800);
    for (const [tag, z] of [['min', 0.2], ['moyen', 1], ['max', 2.4]]) {
      await p.evaluate((z) => {
        const a = window.cendrelande, vp = document.getElementById('city-vp');
        const th = Object.values(a.state.city.buildings).find((x) => x.type === 'townhall');
        vp._center(th.x, th.y);
        const c = a.ui.cityCam, cx = vp.clientWidth / 2, cy = vp.clientHeight / 2, k = z / c.z;
        c.x = cx - (cx - c.x) * k; c.y = cy - (cy - c.y) * k; c.z = z; vp._apply(); a.closeModal();
      }, z);
      await p.waitForTimeout(300);
      const r = await settle(p, () => window.cendrelande._citySharp?.());
      for (const layer of ['ground', 'scene', 'life']) {
        const m = r[layer] || {};
        rows.push({ dpr, vue: 'château', zoom: tag, z, couche: { ground: 'sol', scene: 'scène', life: 'villageois' }[layer], niveau: m.lv, voulu: m.need, agrandissement: m.mag });
      }
    }
    if (errs.length) rows.push({ dpr, erreur: errs.slice(0, 3).join(' | ') });
    await ctx.close();
  }
  await b.close();
  let bad = 0;
  for (const r of rows) {
    if (r.erreur) { bad++; continue; }
    const accepted = r.vue === 'monde' && r.couche === 'terrain' && r.niveau === 256 && r.voulu > 256 * LIMIT;
    r.statut = r.agrandissement == null ? 'absent' : r.agrandissement <= LIMIT + 1e-6 ? 'ok' : accepted ? 'accepté (§ 5.2)' : 'TROP ÉTIRÉ';
    if (r.statut === 'TROP ÉTIRÉ' || r.statut === 'absent') bad++;
  }
  if (process.argv.includes('--json')) console.log(JSON.stringify(rows, null, 1));
  else {
    console.log('DPR | vue     | zoom  | couche      | niveau | voulu  | agrandissement | statut');
    for (const r of rows) console.log(r.erreur ? `${r.dpr} | ERREUR ${r.erreur}` : `${r.dpr}   | ${r.vue.padEnd(7)} | ${r.zoom.padEnd(5)} | ${String(r.couche).padEnd(11)} | ${String(r.niveau).padEnd(6)} | ${String(r.voulu).padEnd(6)} | ${String(r.agrandissement).padEnd(14)} | ${r.statut}`);
  }
  console.log(bad ? `${bad} couche(s) au-delà de ${LIMIT}` : `Aucune couche étirée au-delà de ${LIMIT} (hors cas accepté).`);
  process.exit(bad ? 1 : 0);
})();
