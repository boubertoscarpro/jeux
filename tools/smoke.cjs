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
  // Encart de soutien : facultatif, lien externe exact, nouvel onglet sécurisé
  const sup = await page.$eval('.support-btn', (el) => ({ href: el.getAttribute('href'), target: el.target, rel: el.rel }));
  if (sup.href !== 'https://paypal.me/Oscarwildrift' || sup.target !== '_blank' || !/noopener/.test(sup.rel)) errors.push('soutien : lien incorrect ' + JSON.stringify(sup));
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
  // Parcours guidé : fiche de chapitre, mise en évidence, conseiller, entraînement, réclamation
  ctx = 'parcours';
  const guide = await page.evaluate(async () => {
    const a = window.cendrelande, s = a.state, out = [];
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    a.closeModal();
    s.meta.tipsOff = false; s.meta.tipsSeen = {};
    a.tick(); await wait(50);
    if (!document.querySelector('[data-action="tip-go"]')) out.push('fiche de chapitre absente');
    document.querySelector('[data-action="tip-go"]')?.click(); await wait(50);
    s.campaign.chapter = 4; s.meta.tipsSeen.chapter4 = 1; s.campaign.flags.training = 0;
    for (const id of ['q_clear', 'q_saw', 'q_quarry', 'q_th2', 'c1_house', 'q_farm', 'c2_farm2', 'c2_report', 'c2_surplus', 'q_mill', 'q_chain', 'q_scouts', 'q_explore', 'c3_explore5', 'q_gather', 'c3_road', 'q_barracks', 'q_army']) s.campaign.claimed[id] = 1;
    a.closeModal(); a.render();
    const tr = document.querySelector('#side [data-action="cp-training"]');
    if (!tr) out.push('bouton entraînement absent'); else { const army = JSON.stringify(s.army); tr.click(); await wait(50); if (JSON.stringify(s.army) !== army) out.push('entraînement : pertes réelles'); if (!s.campaign.flags.training) out.push('entraînement non validé'); }
    a.closeModal(); a.render();
    const n0 = document.querySelectorAll('#side .advice').length;
    document.querySelector('#side [data-action="adv-snooze"]')?.click(); await wait(400);
    document.querySelector('#side [data-action="adv-dismiss"]')?.click(); await wait(400);
    if (!n0) out.push('conseiller vide');
    const cl = document.querySelector('#side [data-action="claim-quest"]');
    if (cl) { const id = cl.dataset.id; cl.click(); await wait(400); if (!s.campaign.claimed[id]) out.push('réclamation échouée ' + id); }
    s.meta.tipsOff = true;
    return out;
  });
  errors.push(...guide.map((e) => 'parcours : ' + e));
  // Cartes : zoom, vue d'ensemble, sélection exacte d'une case après zoom, mini-carte, accès rapide
  ctx = 'cartes';
  await page.evaluate(() => { const a = window.cendrelande; a.closeModal(); a.go('city'); });
  await page.waitForTimeout(100);
  for (const act of ['city-zoom', 'city-fit', 'city-center']) await page.click(`#city-vp [data-action="${act}"]`);
  const vpBox = await (await page.$('#city-vp')).boundingBox();
  await page.mouse.move(vpBox.x + vpBox.width / 2, vpBox.y + vpBox.height / 2);
  await page.mouse.wheel(0, 400);
  const tileEl = await page.$('.tile[data-x="12"][data-y="7"]');
  const tb = await tileEl.boundingBox();
  await page.mouse.click(tb.x + tb.width / 2, tb.y + tb.height / 2);
  const cs = await page.evaluate(() => window.cendrelande.ui.citySel);
  if (!cs || cs.x !== 12 || cs.y !== 7) errors.push('ville : sélection décalée après zoom ' + JSON.stringify(cs));
  await page.evaluate(() => { const a = window.cendrelande; a.ui.citySel = null; a.state.world.revealed.fill(1); a.go('world'); });
  await page.waitForTimeout(150);
  for (const act of ['zoom', 'fit', 'center', 'mini-toggle', 'mini-toggle']) { await page.click(`.world-canvas-wrap [data-action="${act}"]`); await page.waitForTimeout(400); }
  await page.selectOption('.map-places', { index: 1 });
  const ws = await page.evaluate(() => window.cendrelande.ui.worldSel);
  if (!ws) errors.push('monde : « Aller à… » ne sélectionne rien');
  const mb = await (await page.$('#world-mini')).boundingBox();
  await page.mouse.click(mb.x + 10, mb.y + 10);
  const wc = await page.evaluate(() => window.cendrelande.ui.cam);
  if (!(wc.x < 48 && wc.y < 48)) errors.push('mini-carte : la caméra ne suit pas ' + JSON.stringify(wc));
  // v9 : renommage du château et d'un avant-poste, icônes et compteur d'amélioration, aide, survol, temps de rendu
  ctx = 'v9';
  const v9 = await page.evaluate(async () => {
    const a = window.cendrelande, s = a.state, out = [];
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const click = (sel) => { const el = document.querySelector(sel); if (!el) { out.push('absent : ' + sel); return false; } el.click(); return true; };
    a.closeModal(); a.go('city'); await wait(100);
    const th = Object.values(s.city.buildings).find((b) => b.type === 'townhall');
    a.ui.citySel = { x: th.x, y: th.y }; a.render(); await wait(50);
    if (click('[data-action="rename-castle"]')) {
      document.getElementById('rename-input').value = '  <b>Fort</b>   Lumière ';
      click('[data-action="rn-save"]'); await wait(50);
      if (a.state.identity.castleName !== 'bFort/b Lumière' && /[<>]/.test(a.state.identity.castleName)) out.push('nom du château non nettoyé');
      if (!document.querySelector('.t-name.major')?.textContent.includes('Lumière')) out.push('nom du château absent de la carte');
    }
    // Icône d'amélioration : clic → fiche avec bloc d'amélioration
    const ready = document.querySelector('.t-up.ready');
    if (!ready) out.push('aucune icône « améliorable » malgré des ressources abondantes');
    else { ready.click(); await wait(80); if (!document.getElementById('up-block')) out.push('icône ⬆ : panneau d’amélioration absent'); }
    const n0 = document.querySelectorAll('.t-up.ready').length;
    document.querySelector('[data-action="upgrade"]:not([disabled])')?.click(); await wait(80);
    if (document.querySelectorAll('.t-up.ready').length > n0) out.push('compteur/icônes non mis à jour après amélioration');
    click('#topbar [data-action="up-list"]'); await wait(50);
    if (!document.querySelector('.up-list')) out.push('liste des améliorations absente'); a.closeModal();
    click('[data-action="up-toggle"]'); await wait(50);
    if (document.querySelector('.t-up')) out.push('icônes encore visibles après masquage');
    click('[data-action="up-toggle"]'); await wait(50);
    click('[data-action="help"]'); await wait(50);
    if (!document.querySelector('.modal h2')?.textContent.includes('Aide') && !document.querySelector('.modal')?.textContent.includes('❓')) out.push('aide absente'); a.closeModal();
    // Temps de rendu de la carte du royaume (agrandie au maximum)
    const t0 = performance.now(); for (let i = 0; i < 5; i++) a.render(); const ms = (performance.now() - t0) / 5;
    if (ms > 250) out.push(`rendu du royaume lent : ${ms.toFixed(0)} ms`);
    // Avant-poste : établissement, nom, renommage
    s.world.revealed.fill(1);
    const cx = s.world.capital.x, cy = s.world.capital.y;
    let k = null;
    for (const [dx, dy] of [[3, 0], [0, 3], [-3, 0], [2, 2], [-2, 2]]) { a.ui.worldSel = { x: cx + dx, y: cy + dy }; a.go('world'); await wait(50); const c = document.querySelector('#world-panel [data-action="claim"]'); if (c) { c.click(); await wait(50); k = `${cx + dx},${cy + dy}`; break; } }
    if (!k || !s.territories[k]?.name) out.push('avant-poste sans nom');
    else {
      a.go('territories'); await wait(50);
      click(`[data-action="tr-rename"][data-k="${k}"]`); await wait(30);
      document.getElementById('rename-input').value = 'Tour du Guet';
      click('[data-action="rn-save"]'); await wait(50);
      if (s.territories[k].name !== 'Tour du Guet') out.push('renommage de l’avant-poste échoué');
    }
    // Survol de la carte du monde
    a.go('world'); await wait(100);
    const cv = document.getElementById('world-canvas').getBoundingClientRect();
    document.getElementById('world-canvas').dispatchEvent(new PointerEvent('pointermove', { clientX: cv.left + cv.width / 2, clientY: cv.top + cv.height / 2, pointerType: 'mouse', bubbles: true }));
    await wait(30);
    if (!document.getElementById('world-tip')?.classList.contains('on')) out.push('infobulle du monde absente');
    const t1 = performance.now(); for (let i = 0; i < 10; i++) a.views.world.tick(a); const wms = (performance.now() - t1) / 10;
    if (wms > 120) out.push(`rendu du monde lent : ${wms.toFixed(0)} ms`);
    // Objectifs : quêtes et missions
    a.go('goals'); a.ui.goalCat = 'quests'; a.render(); await wait(30);
    if (!document.querySelector('.quest-line, .goal.locked')) out.push('onglet des quêtes vide');
    a.ui.goalCat = 'missions'; a.render(); await wait(30);
    out.push(`PERF royaume ${ms.toFixed(0)} ms, monde ${wms.toFixed(0)} ms`);
    return out;
  });
  const perf = v9.filter((e) => e.startsWith('PERF'));
  errors.push(...v9.filter((e) => !e.startsWith('PERF')).map((e) => 'v9 : ' + e));
  console.log(perf.join(' '));
  const views = await page.evaluate(() => Object.keys(window.cendrelande.views));
  const SKIP = /reset|delete|import|adm-reset|wh-spin|leave|dismiss|prestige|rename|dm-drop/;
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
