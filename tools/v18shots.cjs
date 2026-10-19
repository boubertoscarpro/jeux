// Captures v18 « L'Armurerie » : héros, inventaire, Joaillier, sur la sauvegarde « armurerie pleine » (12 héros,
// 300 objets), à 3 tailles. En v18 s'y ajoutent l'aperçu de l'équipement automatique, la vente en masse, les gemmes et
// les règles de tri. Usage : DIST=… node tools/v18shots.cjs <dossier> [--before]
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require('/opt/node-tools/node_modules/playwright')); }
const fs = require('fs'), path = require('path'), zlib = require('zlib');
const OUT = process.argv[2];
const BEFORE = process.argv.includes('--before');
const URL = 'file://' + path.resolve(process.env.DIST || path.resolve(__dirname, '../dist/cendrelande.html'));
const raw = zlib.gunzipSync(fs.readFileSync(path.resolve(__dirname, '../tests/fixtures/save-armurerie.json.gz'))).toString();
const SIZES = [[1400, 900, 'large'], [1024, 640, 'moyen'], [390, 844, 'mobile']];

const SCENES = [
  ['01-heros', (a) => { a.ui.heroSel = a.state.heroes[2].id; a.go('heroes'); }],
  ['02-heros-commandant', (a) => { a.ui.heroSel = a.state.heroes[0].id; a.go('heroes'); }],
  ['03-inventaire', (a) => { a.go('craft'); }],
  ['04-objet', (a) => { a.ui.itemSel = a.state.inventory.items.find((i) => i.rarity === 'legendary').id; a.go('craft'); }],
];
const AFTER = [
  ['05-apercu-troupe', (a) => { a.go('heroes'); }, '[data-action="ae-team"]'],
  ['06-vente-masse', (a) => { a.go('craft'); }, '[data-action="bulk-open"]'],
  ['07-gemmes', (a) => { a.ui.craftTab = 'gems'; a.go('craft'); }],
  ['08-regles-tri', (a) => { a.ui.craftTab = 'rules'; a.go('craft'); }],
  ['09-conseils-taverne', (a) => { a.ui.heroTab = 'advice'; a.go('heroes'); }],
];

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const errors = [];
  for (const [W, H, tag] of SIZES) {
    const ctx = await browser.newContext({ viewport: { width: W, height: H } });
    await ctx.addInitScript((sv) => { try { if (!sessionStorage.getItem('v18s')) { localStorage.setItem('cendrelande_save', sv); sessionStorage.setItem('v18s', '1'); } } catch {} }, raw);
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(`${tag}: ${e.message}`));
    page.on('dialog', (d) => d.dismiss());
    await page.goto(URL);
    await page.waitForTimeout(800);
    for (const [name, fn, click] of [...SCENES, ...(BEFORE ? [] : AFTER)]) {
      await page.evaluate((src) => { const a = window.cendrelande; a.state.meta.tipsOff = true; if (a.state.live) a.state.live.unseenReport = null; a.closeModal(); if (a.ui.win) a.closeWin?.(false); (0, eval)(`(${src})`)(a); }, fn.toString());
      await page.waitForTimeout(400);
      if (click) { await page.click(click).catch((e) => errors.push(`${tag} ${name}: ${e.message.split('\n')[0]}`)); await page.waitForTimeout(400); }
      await page.evaluate(() => { const t = document.getElementById('toasts'); if (t) t.innerHTML = ''; });
      await page.screenshot({ path: path.join(OUT, `${name}-${tag}.png`) });
    }
    await ctx.close();
  }
  await browser.close();
  console.log(errors.length ? 'erreurs :\n' + errors.join('\n') : 'aucune erreur de page');
})();
