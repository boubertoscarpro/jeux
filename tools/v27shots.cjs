// v27 — Captures « avant / après » de la netteté : monde et château, zooms minimum, moyen et maximum, DPR 1 et 2.
// Usage : node tools/v27shots.cjs <préfixe> [DIST]   (ex. : avant ../v26.html ; après : dist/cendrelande.html)
// Les captures montrent le centre de l'écran (sans l'affichage fixe) en pixels réels.
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require('/opt/node-tools/node_modules/playwright')); }
const fs = require('fs'), path = require('path'), zlib = require('zlib');
const PREFIX = process.argv[2] || 'apres';
const DIST = path.resolve(process.argv[3] || path.resolve(__dirname, '../dist/cendrelande.html'));
const OUT = path.resolve(__dirname, '../docs/v27');
fs.mkdirSync(OUT, { recursive: true });
const save = zlib.gunzipSync(fs.readFileSync(path.resolve(__dirname, '../tests/fixtures/save-fin.json.gz'))).toString();
const CLIP = { x: 290, y: 170, width: 700, height: 440 };
async function settle(p) {
  for (let i = 0; i < 60; i++) {
    await p.waitForTimeout(250);
    const q = await p.evaluate(() => { const a = window.cendrelande; const t = a._sharp?.tiles || a._citySharp?.()?.tiles; return t ? t.queue : -1; });
    if (q === 0 && i > 3) return;
    if (q === -1 && i >= 16) return; // version sans tuiles (avant) : 4 s
  }
}
(async () => {
  const b = await chromium.launch();
  for (const dpr of [1, 2]) {
    const ctx = await b.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: dpr });
    await ctx.addInitScript((s) => { try { if (!sessionStorage.getItem('v27')) { localStorage.setItem('cendrelande_save', s); sessionStorage.setItem('v27', '1'); } } catch {} }, save);
    const p = await ctx.newPage();
    await p.goto('file://' + DIST);
    await p.waitForTimeout(1200);
    await p.evaluate(() => { const a = window.cendrelande; a.state.meta.tipsOff = true; if (a.state.live) a.state.live.unseenReport = null; a.closeModal(); });
    for (const [tag, z] of [['min', 0], ['moyen', 1], ['max', 2.6]]) {
      await p.evaluate((z) => { const a = window.cendrelande; a.ui.map = 'world'; const w = a.state.world; a.ui.cam = { x: w.capital.x + 0.5, y: w.capital.y + 0.5, zoom: z || 0.01 }; a.go('world'); a.closeModal(); }, z);
      await settle(p);
      await p.evaluate(() => window.cendrelande.closeModal());
      await p.screenshot({ path: path.join(OUT, `${PREFIX}-monde-${tag}-dpr${dpr}.png`), clip: CLIP });
    }
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
      await p.waitForTimeout(400);
      await settle(p);
      await p.evaluate(() => window.cendrelande.closeModal());
      await p.screenshot({ path: path.join(OUT, `${PREFIX}-chateau-${tag}-dpr${dpr}.png`), clip: CLIP });
    }
    await ctx.close();
  }
  await b.close();
  console.log('captures :', PREFIX);
})();
