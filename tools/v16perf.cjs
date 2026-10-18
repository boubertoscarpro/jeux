// Mesure du rendu de la carte du royaume (v16) : sauvegarde au domaine maximal (40 × 24 = 960 cases), 3 tailles.
//  - renderMs : rendu complet de l'écran du royaume (app.render), médiane de 6 ;
//  - mainZoom / mainPan : travail du fil principal par image pendant un zoom à la molette ou un glisser (script,
//    style, mise en page, enregistrement de la peinture ; la rastérisation et la composition, faites ailleurs, sont
//    exclues) : temps entre le début de l'image et la première tâche qui suit son rendu ;
//  - frameSaver : intervalle entre images pendant le zoom, animations figées (mode économie). Dans Chromium sans GPU
//    (cet environnement), la composition logicielle domine cet intervalle : il est donné à titre indicatif.
// Usage : node tools/v16perf.cjs <sauvegarde.json> [qualité]  (DIST=… pour une autre version compilée)
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require('/opt/node-tools/node_modules/playwright')); }
const fs = require('fs'), path = require('path');
const SV = fs.readFileSync(process.argv[2], 'utf8');
const Q = process.argv[3] || null;
const URL = 'file://' + path.resolve(process.env.DIST || path.resolve(__dirname, '../dist/cendrelande.html'));
(async () => {
  const b = await chromium.launch();
  const out = {};
  for (const [W, H, tag] of [[1400, 900, 'large'], [1024, 640, 'moyen'], [390, 844, 'mobile']]) {
    const ctx = await b.newContext({ viewport: { width: W, height: H } });
    await ctx.addInitScript((sv) => { if (!sessionStorage.getItem('p')) { localStorage.setItem('cendrelande_save', sv); sessionStorage.setItem('p', '1'); } }, SV);
    const p = await ctx.newPage();
    await p.goto(URL);
    await p.waitForTimeout(900);
    await p.evaluate((q) => { const a = window.cendrelande; a.state.meta.tipsOff = true; if (q) a.state.meta.gfx = q; a.closeModal(); a.go('city'); }, Q);
    await p.waitForTimeout(700);
    out[tag] = await p.evaluate(async () => {
      const a = window.cendrelande;
      const q = (arr, k) => { const s = [...arr].sort((x, y) => x - y); return Math.round(s[Math.min(s.length - 1, Math.floor(s.length * k))] * 10) / 10; };
      const rt = [];
      for (let i = 0; i < 6; i++) { const t0 = performance.now(); a.render(); rt.push(performance.now() - t0); }
      await new Promise((r) => setTimeout(r, 300));
      const v = document.getElementById('city-vp');
      const inner = v.querySelector('.mapvp-inner');
      const main = async (kind) => {
        const times = [];
        for (let i = 0; i < 40; i++) {
          await new Promise((res) => requestAnimationFrame(() => {
            const t0 = performance.now();
            if (kind === 'zoom') v.dispatchEvent(new WheelEvent('wheel', { deltaY: i % 20 < 10 ? -40 : 40, clientX: 300, clientY: 300, bubbles: true, cancelable: true }));
            else { const c = a.ui.cityCam; c.x += i % 20 < 10 ? -12 : 12; }
            v._apply();
            const ch = new MessageChannel();
            ch.port1.onmessage = () => { times.push(performance.now() - t0); res(); };
            ch.port2.postMessage(0);
          }));
        }
        return times;
      };
      const z = await main('zoom'), pn = await main('pan');
      document.documentElement.classList.add('saver', 'reduce-motion');
      const fr = []; let last = performance.now();
      for (let i = 0; i < 40; i++) { v.dispatchEvent(new WheelEvent('wheel', { deltaY: i % 20 < 10 ? -40 : 40, clientX: 300, clientY: 300, bubbles: true, cancelable: true })); await new Promise((r) => requestAnimationFrame(r)); const t = performance.now(); fr.push(t - last); last = t; }
      void inner;
      return { tiles: a.state.city.w * a.state.city.h, renderMs: q(rt, 0.5), mainZoom: q(z, 0.5), mainZoomP95: q(z, 0.95), mainPan: q(pn, 0.5), mainPanP95: q(pn, 0.95), frameSaver: q(fr, 0.5) };
    });
    await ctx.close();
  }
  await b.close();
  console.log(JSON.stringify(out, null, 1));
})();
