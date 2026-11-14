// v27 — Images par seconde et mémoire pendant un zoom avant, un glisser et un zoom arrière (monde et château, DPR 1 et 2).
// Usage : node tools/v27perf.cjs [DIST]   Chromium sans carte graphique : comparer avant/après, pas les valeurs absolues.
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require('/opt/node-tools/node_modules/playwright')); }
const fs = require('fs'), path = require('path'), zlib = require('zlib');
const DIST = path.resolve(process.argv[2] || path.resolve(__dirname, '../dist/cendrelande.html'));
const save = zlib.gunzipSync(fs.readFileSync(path.resolve(__dirname, '../tests/fixtures/save-fin.json.gz'))).toString();
(async () => {
  const b = await chromium.launch({ args: ['--enable-precise-memory-info'] }); const out = {};
  for (const dpr of [1, 2]) for (const view of ['world', 'city']) {
    const ctx = await b.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: dpr });
    await ctx.addInitScript((s) => { try { if (!sessionStorage.getItem('pf')) { localStorage.setItem('cendrelande_save', s); sessionStorage.setItem('pf', '1'); } } catch {} }, save);
    const p = await ctx.newPage(); await p.goto('file://' + DIST); await p.waitForTimeout(1200);
    await p.evaluate((v) => { const a = window.cendrelande; a.state.meta.tipsOff = true; if (a.state.live) a.state.live.unseenReport = null; a.closeModal(); a.ui.map = v; a.go(v); a.closeModal(); }, view);
    await p.waitForTimeout(2500);
    await p.evaluate(() => { window.__f = []; let l = performance.now(); const t = (n) => { window.__f.push(n - l); l = n; requestAnimationFrame(t); }; requestAnimationFrame(t); });
    await p.mouse.move(640, 400);
    for (let i = 0; i < 12; i++) { await p.mouse.wheel(0, -120); await p.waitForTimeout(60); }
    await p.mouse.down(); for (let i = 0; i < 30; i++) { await p.mouse.move(640 + i * 12, 400 + i * 6); await p.waitForTimeout(16); } await p.mouse.up();
    for (let i = 0; i < 24; i++) { await p.mouse.wheel(0, 120); await p.waitForTimeout(60); }
    await p.waitForTimeout(400);
    const r = await p.evaluate(() => {
      const f = window.__f.slice(2).sort((a, b) => a - b), avg = f.reduce((a, b) => a + b, 0) / f.length;
      let px = 0; document.querySelectorAll('canvas').forEach((c) => (px += c.width * c.height));
      const a = window.cendrelande, sh = a._sharp?.tiles ? a._sharp : a._citySharp?.();
      return { fps: Math.round(1000 / avg), p95ms: Math.round(f[Math.floor(f.length * 0.95)]), pireMs: Math.round(f[f.length - 1]),
        jsMo: +(performance.memory.usedJSHeapSize / 1e6).toFixed(1), canvasAffichesMo: +(px * 4 / 1e6).toFixed(1),
        tuilesMo: sh?.tiles ? +(sh.tiles.bytes / 1e6).toFixed(1) : null, picTuilesMo: sh?.tiles ? +(sh.tiles.peakBytes / 1e6).toFixed(1) : null, dessinsMo: sh?.sprites ? +(sh.sprites.bytes / 1e6).toFixed(1) : null };
    });
    out[`${view === 'world' ? 'monde' : 'château'} DPR ${dpr}`] = r; await ctx.close();
  }
  await b.close(); console.log(JSON.stringify(out, null, 1));
})();
