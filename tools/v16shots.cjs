// Captures comparables v16 (avant / après) : royaume en début, milieu et fin de partie, vue d'ensemble, raid en
// approche, et mesure du rendu de la carte du royaume au niveau maximal d'agrandissement.
// Usage : npm run build && node tools/v16shots.cjs <dossier> <sauvegarde-milieu.json> <sauvegarde-fin.json>
// (DIST=chemin/vers/cendrelande.html pour capturer une autre version)
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require('/opt/node-tools/node_modules/playwright')); }
const path = require('path');
const fs = require('fs');
const [OUT, MIDF, LATEF] = process.argv.slice(2);
const SAVES = { milieu: fs.readFileSync(MIDF, 'utf8'), fin: fs.readFileSync(LATEF, 'utf8') };
const SIZES = [[1400, 900, 'large'], [1024, 640, 'moyen'], [390, 844, 'mobile']];
const URL = 'file://' + path.resolve(process.env.DIST || path.resolve(__dirname, '../dist/cendrelande.html'));
fs.mkdirSync(OUT, { recursive: true });
const calm = (page) => page.evaluate(() => { const a = window.cendrelande; if (a) { a.ui.freezeUntil = 0; if (a.state.live) a.state.live.unseenReport = null; a.closeModal(); } const t = document.getElementById('toasts'); if (t) t.innerHTML = ''; });
const shot = async (page, file) => { await calm(page); await page.waitForTimeout(200); await page.screenshot({ path: file }); };
const openCity = (page) => page.evaluate(() => { const a = window.cendrelande; a.state.meta.tipsOff = true; a.closeModal(); a.ui.citySel = null; a.go('city'); });

async function loadSave(browser, W, H, raw, errors, tag) {
  const ctx = await browser.newContext({ viewport: { width: W, height: H } });
  await ctx.addInitScript((sv) => { try { if (!sessionStorage.getItem('v16shot')) { localStorage.setItem('cendrelande_save', sv); sessionStorage.setItem('v16shot', '1'); } } catch {} }, raw);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${tag} : ${e.message}`));
  await page.goto(URL);
  await page.waitForTimeout(900);
  await openCity(page);
  await page.waitForTimeout(500);
  return { ctx, page };
}

(async () => {
  const browser = await chromium.launch();
  const errors = [];
  const perf = {};
  for (const [W, H, tag] of SIZES) {
    // 1) Début de partie
    let page = await browser.newPage({ viewport: { width: W, height: H } });
    page.on('pageerror', (e) => errors.push(`${tag} : ${e.message}`));
    await page.goto(URL);
    await page.waitForTimeout(400);
    await page.click('[data-kt="merchants"]'); await page.click('#intro-review'); await page.click('#intro-start');
    await page.waitForTimeout(500);
    await openCity(page);
    await page.waitForTimeout(400);
    await shot(page, `${OUT}/01-royaume-debut-${tag}.png`);
    await page.close();
    // 2) Milieu de partie, 3) raid en approche
    let r = await loadSave(browser, W, H, SAVES.milieu, errors, tag);
    await shot(r.page, `${OUT}/02-royaume-milieu-${tag}.png`);
    await r.page.evaluate(() => {
      const a = window.cendrelande, s = a.state, now = Date.now();
      s.raids = [{ id: 'raidshot', rival: 0, name: 'Clan des Crocs-Gris', from: { x: 0, y: 0 }, army: { militia: 30, royalArcher: 20, royalKnight: 8 }, start: now - 60000, arrive: now + 7 * 60000, seen: true }];
      a.go('city');
    });
    await r.page.waitForTimeout(500);
    await shot(r.page, `${OUT}/03-raid-approche-${tag}.png`);
    await r.ctx.close();
    // 4) Fin de partie, 5) vue d'ensemble (+ mesure)
    r = await loadSave(browser, W, H, SAVES.fin, errors, tag);
    await shot(r.page, `${OUT}/04-royaume-fin-${tag}.png`);
    await r.page.evaluate(() => document.querySelector('[data-action="city-fit"]')?.click());
    await r.page.waitForTimeout(500);
    await shot(r.page, `${OUT}/05-royaume-fin-ensemble-${tag}.png`);
    perf[tag] = await r.page.evaluate(async () => {
      const a = window.cendrelande, vp = document.getElementById('city-vp');
      if (!vp) return null;
      // Coût d'un rendu complet de l'écran du royaume
      const rt = [];
      for (let i = 0; i < 6; i++) { const t0 = performance.now(); a.render(); rt.push(performance.now() - t0); }
      rt.sort((x, y) => x - y);
      // Déplacement et zoom simulés : intervalle entre images
      const v = document.getElementById('city-vp');
      const times = [];
      let last = performance.now();
      for (let i = 0; i < 60; i++) {
        v.dispatchEvent(new WheelEvent('wheel', { deltaY: i % 20 < 10 ? -40 : 40, clientX: 300, clientY: 300, bubbles: true, cancelable: true }));
        await new Promise((res) => requestAnimationFrame(res));
        const t = performance.now(); times.push(t - last); last = t;
      }
      times.sort((x, y) => x - y);
      return { renderMs: Math.round(rt[3] * 10) / 10, frameMedian: Math.round(times[30] * 10) / 10, frameP95: Math.round(times[57] * 10) / 10, tiles: a.state.city.w * a.state.city.h };
    });
    await r.ctx.close();
  }
  await browser.close();
  fs.writeFileSync(`${OUT}/perf-royaume.json`, JSON.stringify(perf, null, 2));
  console.log('perf royaume :', JSON.stringify(perf));
  console.log(errors.length ? errors.join('\n') : 'aucune erreur de page');
})();
