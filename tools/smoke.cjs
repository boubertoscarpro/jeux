// Test de fumée de la version compilée (dist/cendrelande.html) dans un vrai navigateur.
// Parcourt tous les menus et sous-onglets, clique chaque action non destructrice, vérifie la récupération
// d'une sauvegarde corrompue. Nécessite Playwright (non inclus dans les dépendances du jeu).
// Usage : npm run build && npm run smoke
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require('/opt/node-tools/node_modules/playwright')); }
const path = require('path');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  const errors = [];
  let ctx = 'boot';
  page.on('pageerror', (e) => errors.push(`${ctx}: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('fonts.g')) errors.push(`${ctx}: ${m.text()}`); });
  page.on('dialog', (d) => d.dismiss());
  await page.goto('file://' + path.resolve(__dirname, '../dist/cendrelande.html'));
  // Écran de création : la confirmation n'est possible qu'après avoir choisi une spécialisation
  if (!(await page.isDisabled('#intro-review'))) errors.push('création : bouton actif sans spécialisation');
  await page.click('[data-kt="merchants"]');
  await page.click('[data-kt="bastions"]');
  await page.click('.kt-options summary');
  await page.check('input[name="kt-diff"][value="guided"]', { force: true });
  await page.click('#intro-review');
  await page.click('#intro-back');
  await page.click('#intro-review');
  await page.click('#intro-start');
  await page.waitForTimeout(500);
  const k = await page.evaluate(() => window.cendrelande.state.kingdom);
  if (k.type !== 'bastions' || k.difficulty !== 'guided') errors.push('création : choix non enregistré ' + JSON.stringify(k));
  await page.evaluate(() => {
    const a = window.cendrelande, s = a.state;
    for (const r in s.resources) s.resources[r] = 50000;
    Object.values(s.city.buildings).find((b) => b.type === 'townhall').level = 10;
    s.army = { spearman: 300, swordsman: 200, archer: 200, knight: 60, scout: 10 };
    s.automation.level = 6; s.meta.tipsOff = true;
    a.render();
  });
  const views = await page.evaluate(() => Object.keys(window.cendrelande.views));
  const SKIP = /reset|delete|import|adm-reset|wh-spin|leave|dismiss|prestige/;
  let clicks = 0;
  for (const v of views) {
    ctx = v;
    await page.evaluate((v) => { window.cendrelande.closeModal(); window.cendrelande.go(v); }, v);
    const n = await page.evaluate(() => document.querySelectorAll('#view [data-action]').length);
    for (let i = 0; i < Math.min(n, 40); i++) {
      const a = await page.evaluate((i) => { const el = document.querySelectorAll('#view [data-action]')[i]; return el && !el.disabled ? el.dataset.action : null; }, i);
      if (!a || SKIP.test(a) || a === 'nav') continue;
      ctx = `${v}:${a}`;
      await page.evaluate((i) => document.querySelectorAll('#view [data-action]')[i]?.click(), i);
      clicks++;
      await page.evaluate((v) => { window.cendrelande.closeModal(); if (window.cendrelande.ui.view !== v) window.cendrelande.go(v); }, v);
    }
  }
  // Sauvegarde corrompue → écran de récupération → restauration de la copie de secours
  ctx = 'recovery';
  await page.evaluate(() => { const a = window.cendrelande; a.state.meta.bootOk = true; a.state.meta.lastBackup = 0; a.save(); a.state = null; localStorage.setItem('cendrelande_save', '{corrompu'); });
  await page.reload();
  await page.waitForTimeout(500);
  const recovery = await page.evaluate(() => document.body.innerText.includes('Sauvegarde illisible'));
  if (await page.$('#rec-backup')) await page.click('#rec-backup');
  await page.waitForTimeout(500);
  const restored = await page.evaluate(() => !!window.cendrelande?.state);
  await browser.close();
  console.log(`vues : ${views.length} · actions cliquées : ${clicks} · récupération : ${recovery ? 'ok' : 'ÉCHEC'} · restauration : ${restored ? 'ok' : 'ÉCHEC'}`);
  if (errors.length || !recovery || !restored) { console.error(errors.join('\n')); process.exit(1); }
  console.log('Aucune erreur.');
})();
