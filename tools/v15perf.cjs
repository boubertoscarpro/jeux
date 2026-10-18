// Mesure du coût de rendu de la carte du monde (ms par image dessinée, médiane et 95e centile) sur une vraie partie
// avancée, carte entièrement révélée (cas le plus chargé), à trois niveaux de zoom.
// Usage : npm run build && node tools/v15perf.cjs <sauvegarde.json> [qualité]
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require('/opt/node-tools/node_modules/playwright')); }
const path = require('path');
const fs = require('fs');
const MID = fs.readFileSync(process.argv[2], 'utf8');
const QUALITY = process.argv[3] || null;
(async () => {
  const browser = await chromium.launch();
  const out = {};
  for (const [W, H] of [[1400, 900], [390, 844]]) {
    const ctx = await browser.newContext({ viewport: { width: W, height: H } });
    await ctx.addInitScript((mid) => { try { if (!sessionStorage.getItem('p')) { localStorage.setItem('cendrelande_save', mid); sessionStorage.setItem('p', '1'); } } catch {} }, MID);
    const page = await ctx.newPage();
    await page.goto('file://' + path.resolve(__dirname, '../dist/cendrelande.html'));
    await page.waitForTimeout(800);
    await page.evaluate((q) => { const a = window.cendrelande; a.state.meta.tipsOff = true; a.state.world.revealed.fill(1); if (q) a.state.meta.gfx = q; a.closeModal(); a.go('world'); }, QUALITY);
    await page.waitForTimeout(600);
    for (const [label, zoom] of [['rapproché', 1.6], ['normal', 1], ['vue d’ensemble', 0.15]]) {
      const r = await page.evaluate(async (zoom) => {
        const a = window.cendrelande, c = a.ui.cam;
        c.zoom = zoom; a.perfWorld = [];
        const cv = document.getElementById('world-canvas');
        for (let i = 0; i < 40; i++) {
          c.x += i % 2 ? 0.7 : -0.6; c.y += i % 3 ? 0.4 : -0.5;
          cv.dispatchEvent(new WheelEvent('wheel', { deltaY: i % 2 ? 1 : -1, clientX: 100, clientY: 100, bubbles: true, cancelable: true }));
          await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
        }
        const t = [...(a.perfWorld || [])].sort((x, y) => x - y);
        return t.length ? { n: t.length, median: +t[Math.floor(t.length / 2)].toFixed(1), p95: +t[Math.floor(t.length * 0.95)].toFixed(1) } : null;
      }, zoom);
      out[`${W}×${H} · ${label}`] = r;
    }
    await ctx.close();
  }
  await browser.close();
  console.log(JSON.stringify(out, null, 1));
})();
