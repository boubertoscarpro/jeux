// v27.1 — Session de jeu automatique (30 min par défaut) : château, monde, gestes, fenêtres, en boucle, sur la partie de
// fin. Relève la mémoire JS (après ramasse-miettes), les caches de tuiles et de dessins, et les nœuds DOM : la mémoire
// doit rester stable (aucune croissance continue).  Usage : node tools/memsession.cjs [minutes] [jeu.html]
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require('/opt/node-tools/node_modules/playwright')); }
const fs = require('fs'), path = require('path'), zlib = require('zlib');
const MIN = +(process.argv[2] || 30);
const DIST = path.resolve(process.argv[3] || path.resolve(__dirname, '../dist/cendrelande.html'));
const save = zlib.gunzipSync(fs.readFileSync(path.resolve(__dirname, '../tests/fixtures/save-fin.json.gz'))).toString();
(async () => {
  const b = await chromium.launch({ args: ['--enable-precise-memory-info', '--js-flags=--expose-gc'] });
  const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } });
  await ctx.addInitScript((s) => { try { if (!sessionStorage.getItem('ms')) { localStorage.setItem('cendrelande_save', s); sessionStorage.setItem('ms', '1'); } } catch {} }, save);
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.goto('file://' + DIST); await p.waitForTimeout(1500);
  await p.evaluate(() => { const a = window.cendrelande; a.state.meta.tipsOff = true; a.state.meta.gfxChosen = true; if (a.state.live) a.state.live.unseenReport = null; a.closeModal(); });
  const sample = () => p.evaluate(() => { window.gc?.(); const a = window.cendrelande; const sh = a._citySharp?.() || a._sharp || {}; return { js: +(performance.memory.usedJSHeapSize / 1e6).toFixed(1), tuiles: +((sh.tiles?.bytes || 0) / 1e6).toFixed(1), dessins: +((sh.sprites?.bytes || 0) / 1e6).toFixed(1), dom: document.getElementsByTagName('*').length }; });
  const rows = []; const t0 = Date.now(); let loops = 0;
  while (Date.now() - t0 < MIN * 60000) {
    for (const v of ['city', 'world']) {
      await p.evaluate((v) => { const a = window.cendrelande; a.closeModal(); a.ui.map = v; a.go(v); }, v);
      await p.waitForTimeout(1500);
      await p.mouse.move(640, 400);
      for (let i = 0; i < 6; i++) { await p.mouse.wheel(0, i < 3 ? -240 : 240); await p.waitForTimeout(80); }
      await p.mouse.down(); for (let i = 0; i < 12; i++) { await p.mouse.move(640 + ((loops * 37 + i * 15) % 300), 400 + i * 8); await p.waitForTimeout(16); } await p.mouse.up();
    }
    for (const w of ['army', 'economy', 'questbook']) { await p.evaluate((w) => { const a = window.cendrelande; if (a.views[w]) a.go(w); }, w); await p.waitForTimeout(500); await p.evaluate(() => window.cendrelande.closeWin?.()); }
    loops++;
    if (loops % 5 === 1) { const s = await sample(); s.min = +((Date.now() - t0) / 60000).toFixed(1); rows.push(s); console.log(JSON.stringify(s)); }
  }
  const s = await sample(); s.min = +((Date.now() - t0) / 60000).toFixed(1); rows.push(s);
  console.log(JSON.stringify({ fin: s, boucles: loops, erreurs: errs.slice(0, 3) }));
  await b.close();
})();
