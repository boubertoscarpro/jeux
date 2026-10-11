// Tests de rendu automatiques (version compilée, Chromium) : chaque écran du jeu est ouvert à plusieurs tailles
// d'écran, du téléphone au grand écran, et l'on vérifie que la mise en page tient :
//  - aucun débordement horizontal de la page ni de la zone principale ;
//  - la barre du haut n'occupe pas plus d'un tiers de la hauteur ;
//  - la navigation reste visible et ses boutons ont une taille cliquable (≥ 32 px) ;
//  - aucune carte ni aucun bouton ne dépasse de la zone principale ;
//  - aucune erreur de console.
// Usage : npm run build && npm run layout
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require('/opt/node-tools/node_modules/playwright')); }
const path = require('path');

const SIZES = [[360, 740, 'téléphone'], [768, 1024, 'tablette'], [1024, 640, 'petit écran'], [1440, 900, 'grand écran']];

(async () => {
  const browser = await chromium.launch();
  const problems = [];
  let checks = 0;
  for (const [W, H, label] of SIZES) {
    const page = await browser.newPage({ viewport: { width: W, height: H } });
    let ctx = 'démarrage';
    page.on('pageerror', (e) => problems.push(`${label} ${W}×${H} · ${ctx} : erreur ${e.message}`));
    page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('fonts.g')) problems.push(`${label} · ${ctx} : console ${m.text()}`); });
    page.on('dialog', (d) => d.dismiss());
    await page.goto('file://' + path.resolve(__dirname, '../dist/cendrelande.html'));
    await page.click('[data-kt="merchants"]'); await page.click('#intro-review'); await page.click('#intro-start');
    await page.waitForTimeout(300);
    // Royaume avancé : tous les écrans ouverts, contenus nombreux (cas le plus chargé)
    await page.evaluate(() => {
      const a = window.cendrelande, s = a.state;
      for (const r in s.resources) s.resources[r] = 99999;
      Object.values(s.city.buildings).find((b) => b.type === 'townhall').level = 12;
      s.army = { spearman: 300, archer: 200, knight: 60, scout: 6 };
      s.meta.tipsOff = true; s.world.revealed.fill(1);
      a.closeModal(); a.render();
    });
    const views = await page.evaluate(() => Object.keys(window.cendrelande.views));
    for (const v of views) {
      ctx = v;
      await page.evaluate((v) => { const a = window.cendrelande; a.closeModal(); a.go(v); }, v);
      await page.waitForTimeout(60);
      const r = await page.evaluate(() => {
        const out = [];
        const doc = document.documentElement, view = document.getElementById('view'), top = document.getElementById('topbar'), nav = document.getElementById('nav');
        if (doc.scrollWidth > window.innerWidth + 1) out.push(`la page déborde horizontalement (${doc.scrollWidth} px pour ${window.innerWidth})`);
        if (view && view.scrollWidth > view.clientWidth + 2) {
          // Un tableau dans un conteneur défilant (.table-wrap) a le droit d'être plus large que l'écran
          const culprit = [...view.querySelectorAll('*')].find((el) => { const b = el.getBoundingClientRect(); const vb = view.getBoundingClientRect(); return b.right > vb.right + 2 && !el.closest('.table-wrap, .map-viewport, .world-viewport, .city-viewport, canvas, .tabs, .subnav'); });
          if (culprit) out.push(`la zone principale déborde (${view.scrollWidth} > ${view.clientWidth}) : ${culprit.tagName.toLowerCase()}.${String(culprit.className).split(' ').slice(0, 2).join('.')}`);
        }
        if (top && top.getBoundingClientRect().height > window.innerHeight / 3) out.push(`barre du haut trop haute (${Math.round(top.getBoundingClientRect().height)} px)`);
        if (!nav || nav.getBoundingClientRect().width === 0) out.push('navigation invisible');
        const small = [...document.querySelectorAll('#nav .nav-btn')].filter((b) => { const x = b.getBoundingClientRect(); return x.width && (x.width < 32 || x.height < 32); });
        if (small.length) out.push(`${small.length} bouton(s) de navigation trop petits`);
        return out;
      });
      checks++;
      for (const p of r) problems.push(`${label} ${W}×${H} · écran « ${v} » : ${p}`);
    }
    await page.close();
  }
  await browser.close();
  console.log(`rendu : ${SIZES.length} tailles × écrans = ${checks} vérifications`);
  if (problems.length) { console.log(problems.join('\n')); process.exit(1); }
  console.log('Aucun problème de mise en page.');
})();
