// Captures comparables v15 (avant / après) : 8 écrans × 3 tailles, et mesure du coût de rendu de la carte du monde.
// Usage : npm run build && node tools/v15shots.cjs <dossier> <sauvegarde-milieu.json>
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require('/opt/node-tools/node_modules/playwright')); }
const path = require('path');
const fs = require('fs');
const OUT = process.argv[2];
const MID = fs.readFileSync(process.argv[3], 'utf8');
const SIZES = [[1400, 900, 'large'], [1024, 640, 'moyen'], [390, 844, 'mobile']];
const URL = 'file://' + path.resolve(process.env.DIST || path.resolve(__dirname, '../dist/cendrelande.html'));
// Avant chaque capture : fenêtres et notifications fermées (le hasard du moment ne doit pas fausser la comparaison)
const calm = (page) => page.evaluate(() => { const a = window.cendrelande; if (a) { a.ui.freezeUntil = 0; if (a.state.live) a.state.live.unseenReport = null; a.closeModal(); } const t = document.getElementById('toasts'); if (t) t.innerHTML = ''; });
const shot = async (page, file) => { await calm(page); await page.waitForTimeout(150); await page.screenshot({ path: file }); };

(async () => {
  const browser = await chromium.launch();
  const errors = [];
  const perf = {};
  for (const [W, H, tag] of SIZES) {
    // 1) Démarrage (nouvelle partie, écran de création)
    let page = await browser.newPage({ viewport: { width: W, height: H } });
    page.on('pageerror', (e) => errors.push(`${tag} : ${e.message}`));
    await page.goto(URL);
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${OUT}/01-demarrage-${tag}.png` });
    // 2) Royaume en début de partie
    await page.click('[data-kt="merchants"]'); await page.click('#intro-review'); await page.click('#intro-start');
    await page.waitForTimeout(500);
    await page.evaluate(() => { const a = window.cendrelande; a.state.meta.tipsOff = true; a.closeModal(); a.go('city'); });
    await page.waitForTimeout(400);
    await shot(page, `${OUT}/02-royaume-debut-${tag}.png`);
    await page.close();
    // Partie avancée (vraie sauvegarde v14 produite par le joueur simulé, profil Actif, 3 jours)
    const ctx = await browser.newContext({ viewport: { width: W, height: H } });
    await ctx.addInitScript((mid) => { try { if (!sessionStorage.getItem('v15shot')) { localStorage.setItem('cendrelande_save', mid); sessionStorage.setItem('v15shot', '1'); } } catch {} }, MID);
    page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(`${tag} : ${e.message}`));
    await page.goto(URL);
    await page.waitForTimeout(800);
    await page.evaluate(() => { const a = window.cendrelande; a.state.meta.tipsOff = true; a.closeModal(); a.go('city'); });
    await page.waitForTimeout(500);
    await shot(page, `${OUT}/03-royaume-milieu-${tag}.png`);
    // 4) Carte du monde + mesure du rendu
    await page.evaluate(() => window.cendrelande.go('world'));
    await page.waitForTimeout(700);
    await shot(page, `${OUT}/04-monde-${tag}.png`);
    perf[tag] = await page.evaluate(async () => {
      const cv = document.querySelector('#view canvas');
      if (!cv) return null;
      // Déplacement simulé de la caméra : 60 images, on mesure l'intervalle entre images
      const times = [];
      let last = performance.now();
      for (let i = 0; i < 60; i++) {
        cv.dispatchEvent(new WheelEvent('wheel', { deltaY: i % 20 < 10 ? -40 : 40, clientX: 200, clientY: 200, bubbles: true }));
        await new Promise((r) => requestAnimationFrame(r));
        const t = performance.now(); times.push(t - last); last = t;
      }
      times.sort((a, b) => a - b);
      return { median: Math.round(times[30] * 10) / 10, p95: Math.round(times[57] * 10) / 10 };
    });
    // 5) Crise active : sécheresse à l'étape 2, incendie, présage
    await page.evaluate(() => {
      const a = window.cendrelande, s = a.state, now = Date.now();
      s.crises.active = [{ id: 'cr1', type: 'drought', stage: 1, start: now - 3 * 3600000, stageAt: now - 600000, nextAt: now + 3 * 3600000, delayed: false, log: [{ t: now - 3 * 3600000, text: '🌾 Récoltes compromises' }, { t: now - 600000, text: '🥖 Le pain renchérit' }], burnt: [] }];
      s.catastrophe = { key: 'drought', start: now - 3 * 3600000, until: now + 2 * 3600000 };
      const b = Object.values(s.city.buildings).find((x) => x.type === 'house' && x.level > 0);
      if (b) { b.damaged = true; s.crises.active.push({ id: 'cr2', type: 'fire', stage: 0, start: now, stageAt: now, nextAt: now + 1500000, delayed: false, log: [], burnt: [b.id] }); }
      s.omens.list.unshift({ id: 'o1', kind: 'catastrophe', key: 'flood', heard: now, at: now + 80 * 60000, q: 0.64, truth: true, resolved: false });
      a.go('city');
    });
    await page.waitForTimeout(500);
    await shot(page, `${OUT}/05a-crise-royaume-${tag}.png`);
    await page.evaluate(() => window.cendrelande.go('goals'));
    await page.waitForTimeout(400);
    await shot(page, `${OUT}/05b-crise-fil-${tag}.png`);
    // 6) Combat : dernier rapport de bataille
    await page.evaluate(() => { const a = window.cendrelande; a.go('journal'); });
    await page.waitForTimeout(300);
    await page.evaluate(() => { const a = window.cendrelande; const rep = a.state.reports.find((r) => r.kind === 'battle' && r.result); const btn = rep && document.querySelector(`[data-action="report"][data-id="${rep.id}"]`); if (btn) btn.click(); });
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${OUT}/06-combat-${tag}.png` });
    // 7) Forge  8) Conseil
    await page.evaluate(() => { const a = window.cendrelande; a.closeModal(); a.go('craft'); });
    await page.waitForTimeout(400);
    await shot(page, `${OUT}/07-forge-${tag}.png`);
    await page.evaluate(() => window.cendrelande.go('council'));
    await page.waitForTimeout(400);
    await shot(page, `${OUT}/08-conseil-${tag}.png`);
    await ctx.close();
  }
  await browser.close();
  fs.writeFileSync(`${OUT}/perf.json`, JSON.stringify(perf, null, 2));
  console.log('perf carte du monde (ms par image, médiane / 95e centile) :', JSON.stringify(perf));
  console.log(errors.length ? errors.join('\n') : 'aucune erreur de page');
})();
