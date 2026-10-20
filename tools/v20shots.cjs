// Captures et mesures v20 « Ma forteresse » (avant = v19 compilée, après = v20), 3 tailles :
//  01 royaume en début de partie, 02 milieu, 03 fin, 04 carte du monde, 05 défense ; en v20 s'ajoutent les scènes
//  de la vitrine, du mode architecte, du mode photo et du panneau des activités.
// Mesures (fin de partie, 1400 × 900) : part de l'écran occupée par la forteresse au cadrage par défaut, images par
// seconde au repos et pendant un glisser, délai perçu des actions courantes (du clic à l'image suivante).
// Usage : node tools/v20shots.cjs <dossier> [--before]   (DIST=… pour une autre version compilée)
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require('/opt/node-tools/node_modules/playwright')); }
const fs = require('fs'), path = require('path'), zlib = require('zlib');
const OUT = process.argv[2];
const BEFORE = process.argv.includes('--before');
const URL = 'file://' + path.resolve(process.env.DIST || path.resolve(__dirname, '../dist/cendrelande.html'));
const raw = (f) => zlib.gunzipSync(fs.readFileSync(path.resolve(__dirname, `../tests/fixtures/${f}.json.gz`))).toString();
const SAVES = { milieu: raw('save-milieu'), fin: raw('save-fin') };
const SIZES = [[1400, 900, 'large'], [1024, 640, 'moyen'], [390, 844, 'mobile']];
fs.mkdirSync(OUT, { recursive: true });

const calm = (page) => page.evaluate(() => { const a = window.cendrelande; if (a) { a.ui.freezeUntil = 0; if (a.state.live) a.state.live.unseenReport = null; a.closeModal(); if (a.ui.win) a.closeWin?.(false); } const t = document.getElementById('toasts'); if (t) t.innerHTML = ''; });
const shot = async (page, file) => { await calm(page); await page.waitForTimeout(250); await page.screenshot({ path: file }); };
const openCity = (page) => page.evaluate(() => { const a = window.cendrelande; a.state.meta.tipsOff = true; a.closeModal(); a.ui.citySel = null; a.ui.ringOpen = false; a.go('city'); });

async function loadSave(browser, W, H, sv, errors, tag) {
  const ctx = await browser.newContext({ viewport: { width: W, height: H } });
  await ctx.addInitScript((s) => { try { if (!sessionStorage.getItem('v20shot')) { localStorage.setItem('cendrelande_save', s); sessionStorage.setItem('v20shot', '1'); } } catch {} }, sv);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${tag} : ${e.message}`));
  await page.goto(URL);
  await page.waitForTimeout(900);
  await openCity(page);
  await page.waitForTimeout(700);
  return { ctx, page };
}

// Mesures dans la page (fin de partie)
async function measure(page) {
  return page.evaluate(async () => {
    const a = window.cendrelande;
    const vp = document.getElementById('city-vp');
    const vr = vp.getBoundingClientRect();
    // Forteresse : union des cases intra-muros visibles (étiquette « intra-muros »), bornée à la vue
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const t of vp.querySelectorAll('.tile')) {
      if (!/intra-muros/.test(t.getAttribute('aria-label') || '')) continue;
      const r = (t.querySelector('.t-hit') || t).getBoundingClientRect();
      x0 = Math.min(x0, r.left); y0 = Math.min(y0, r.top); x1 = Math.max(x1, r.right); y1 = Math.max(y1, r.bottom);
    }
    const cx0 = Math.max(x0, vr.left), cy0 = Math.max(y0, vr.top), cx1 = Math.min(x1, vr.right), cy1 = Math.min(y1, vr.bottom);
    const share = cx1 > cx0 && cy1 > cy0 ? ((cx1 - cx0) * (cy1 - cy0)) / (vr.width * vr.height) : 0;
    const raf = () => new Promise((r) => requestAnimationFrame(r));
    const fps = async (ms, step) => { let n = 0; const t0 = performance.now(); while (performance.now() - t0 < ms) { if (step) step(n); await raf(); n++; } return Math.round((n * 1000) / (performance.now() - t0)); };
    const idle = await fps(1500);
    const cam = a.ui.cityCam;
    const pan = await fps(1500, (n) => { cam.x += n % 60 < 30 ? -6 : 6; vp._apply?.(); });
    // Délai perçu : du clic à l'image suivante peinte
    const delay = async (fn) => { const t0 = performance.now(); fn(); await raf(); await raf(); return Math.round(performance.now() - t0); };
    const th = Object.values(a.state.city.buildings).find((b) => b.type === 'townhall');
    const tile = () => vp.querySelector(`.tile[data-x="${th.x}"][data-y="${th.y}"]`);
    const out = {};
    out.choisirBatiment = await delay(() => tile()?.click());
    out.fermerAnneau = await delay(() => { a.ui.ringOpen = false; a.ui.citySel = null; a.render(); });
    out.ouvrirConstruire = await delay(() => document.querySelector('[data-action="build-mode"]')?.click());
    out.fermerConstruire = await delay(() => { a.ui.buildMode = false; a.ui.placeType = null; a.render(); });
    out.ouvrirArmee = await delay(() => a.go('army'));
    out.retourRoyaume = await delay(() => a.go('city'));
    const rt = [];
    for (let i = 0; i < 5; i++) { const t0 = performance.now(); a.render(); rt.push(performance.now() - t0); }
    rt.sort((x, y) => x - y);
    return { fortressShare: Math.round(share * 1000) / 10, fpsIdle: idle, fpsPan: pan, renderMs: Math.round(rt[2] * 10) / 10, delays: out };
  });
}

(async () => {
  const browser = await chromium.launch();
  const errors = [];
  const metrics = {};
  for (const [W, H, tag] of SIZES) {
    // 1) Début de partie
    const page = await browser.newPage({ viewport: { width: W, height: H } });
    page.on('pageerror', (e) => errors.push(`${tag} : ${e.message}`));
    await page.goto(URL);
    await page.waitForTimeout(400);
    await page.click('[data-kt="merchants"]'); await page.click('#intro-review'); await page.click('#intro-start');
    await page.waitForTimeout(600);
    await openCity(page);
    await page.waitForTimeout(500);
    await shot(page, `${OUT}/01-royaume-debut-${tag}.png`);
    await page.close();
    // 2) Milieu
    let r = await loadSave(browser, W, H, SAVES.milieu, errors, tag);
    await shot(r.page, `${OUT}/02-royaume-milieu-${tag}.png`);
    await r.ctx.close();
    // 3) Fin, 4) monde, 5) défense (+ mesures)
    r = await loadSave(browser, W, H, SAVES.fin, errors, tag);
    await shot(r.page, `${OUT}/03-royaume-fin-${tag}.png`);
    metrics[tag] = await measure(r.page);
    await openCity(r.page); await r.page.waitForTimeout(400);
    await r.page.evaluate(() => window.cendrelande.go('world'));
    await r.page.waitForTimeout(700);
    await shot(r.page, `${OUT}/04-monde-${tag}.png`);
    await r.page.evaluate(() => { const a = window.cendrelande; a.go('city'); a.go('defense'); });
    await r.page.waitForTimeout(500);
    await shot(r.page, `${OUT}/05-defense-${tag}.png`);
    if (!BEFORE) {
      const scenes = [
        ['06-vitrine', () => { const a = window.cendrelande; a.closeWin?.(false); a.ui.buildMode = true; a.ui.buildTab = 'trophy'; a.go('city'); }],
        ['07-architecte', () => { const a = window.cendrelande; a.closeWin?.(false); a.ui.buildMode = false; a.ui.architect = true; a.go('city'); }],
        ['08-photo', () => { const a = window.cendrelande; a.ui.architect = false; a.closeWin?.(false); a.go('city'); document.querySelector('[data-action="photo-mode"]')?.click(); }],
        ['09-ordre-public', () => { const a = window.cendrelande; a.ui.photo = null; a.go('city'); a.go('order'); }],
        ['10-terres-lointaines', () => { const a = window.cendrelande; a.go('city'); a.go('farlands'); }],
        ['11-corvee', () => { const a = window.cendrelande; a.go('city'); a.go('chores'); }],
      ];
      for (const [name, fn] of scenes) {
        await r.page.evaluate((src) => { try { (0, eval)(`(${src})`)(); } catch (e) { console.error(e); } }, fn.toString());
        await r.page.waitForTimeout(600);
        await r.page.screenshot({ path: `${OUT}/${name}-${tag}.png` });
      }
    }
    await r.ctx.close();
  }
  fs.writeFileSync(path.join(OUT, 'mesures.json'), JSON.stringify(metrics, null, 1));
  await browser.close();
  console.log(JSON.stringify(metrics, null, 1));
  console.log(errors.length ? 'erreurs :\n' + errors.join('\n') : 'aucune erreur de page');
})();
