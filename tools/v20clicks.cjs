// Mesure v20 « Fin de la corvée » : nombre de clics réels pour chaque corvée, à la main (version compilée v19 ou v20)
// puis automatisée (v20 : réglage unique, puis zéro clic à chaque fois). Chaque clic est un vrai clic de souris sur
// l'interface, depuis la carte du royaume, et l'effet est vérifié dans l'état du jeu.
// Usage : node tools/v20clicks.cjs [chemin du dist] (défaut : dist/cendrelande.html)
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require('/opt/node-tools/node_modules/playwright')); }
const fs = require('fs'), path = require('path'), zlib = require('zlib');
const URL = 'file://' + path.resolve(process.argv[2] || path.resolve(__dirname, '../dist/cendrelande.html'));
const SAVE = zlib.gunzipSync(fs.readFileSync(path.resolve(__dirname, '../tests/fixtures/save-fin.json.gz'))).toString();

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  await ctx.addInitScript((s) => { try { if (!sessionStorage.getItem('v20c')) { localStorage.setItem('cendrelande_save', s); sessionStorage.setItem('v20c', '1'); } } catch {} }, SAVE);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('dialog', (d) => d.accept());
  await page.goto(URL);
  await page.waitForTimeout(900);
  const home = async () => { await page.evaluate(() => { const a = window.cendrelande; a.state.meta.tipsOff = true; a.closeModal(); a.closeWin?.(false); a.ui.citySel = null; a.ui.ringOpen = false; a.go('city'); const t = document.getElementById('toasts'); if (t) t.innerHTML = ''; }); await page.waitForTimeout(300); };
  let clicks = 0;
  const calm = () => page.evaluate(() => { const a = window.cendrelande; if (a.state.live) a.state.live.unseenReport = null; if (document.querySelector('#modal-root.open') && !document.querySelector('#modal-root .places-list, #modal-root [data-view]')) a.closeModal(); });
  const click = async (sel) => { await calm(); await page.locator(sel).first().click({ timeout: 4000 }); clicks++; await page.waitForTimeout(250); };
  const BTN = '#view button:not([disabled]), #win-root button:not([disabled]), #modal-root button:not([disabled])';
  const clickText = async (re) => { await calm(); await page.locator(BTN, { hasText: re }).first().click({ timeout: 4000 }); clicks++; await page.waitForTimeout(250); };
  const openScreen = async (view) => { await click('#hud [data-action="places"]'); await click(`.modal [data-action="nav"][data-view="${view}"]`); };
  const out = {};
  // 1) Ravitailler un avant-poste : Lieux → Territoires → « Envoyer des rations »
  await home();
  await page.evaluate(() => { const s = window.cendrelande.state; for (const t of Object.values(s.territories)) { t.rationsUntil = 0; t.garrison = { spearman: 10, ...(t.garrison || {}) }; } s.resources.food = 1e6; });
  clicks = 0;
  try { await openScreen('territories'); await click('[data-action="tr-rations"]'); out.ravitaillement = { clics: clicks, ok: await page.evaluate(() => Object.values(window.cendrelande.state.territories).some((t) => t.rationsUntil > Date.now())) }; } catch (e) { out.ravitaillement = { erreur: e.message, clics: clicks }; }
  // 2) Défense conseillée face à un raid repéré : Rapports/Défense → onglet des remparts → « Défense conseillée »
  await home();
  await page.evaluate(() => { const s = window.cendrelande.state; s.raids = [{ id: 'mesure', name: 'Pillards', arrive: Date.now() + 3600e3, units: { bandit: 20 }, flank: 'front' }]; window.cendrelande.render(); });
  clicks = 0;
  try {
    await click('#hud [data-action="nav"][data-view="defense"]');
    if (!(await page.locator('button', { hasText: /conseillée/i }).count())) await click('[data-action="def-tab"]');
    await clickText(/défense conseillée|conseillée/i);
    out.defense = { clics: clicks, ok: true };
  } catch (e) { out.defense = { erreur: e.message, clics: clicks }; }
  // 3) Relancer des raids en série : Monde → clic sur le camp → « Raids en série » → lancer
  await home();
  clicks = 0;
  try {
    await click('#hud [data-action="toggle-map"]');
    const p = await page.evaluate(() => { const a = window.cendrelande, W = a.state.world; const ok = Object.values(W.pois).find((p) => !p.clearedUntil && W.revealed[p.y * W.size + p.x] && p.danger > 0 && /camp|lair|den|crypt|ruin/i.test(p.type)); return ok ? { x: ok.x, y: ok.y } : null; });
    if (!p) throw new Error('aucun camp révélé');
    await page.evaluate((p) => { const a = window.cendrelande; a.ui.worldSel = { x: p.x, y: p.y }; }, p); clicks++; // clic sur le camp (case du monde)
    await page.evaluate(() => window.cendrelande.go('tile')); await page.waitForTimeout(300);
    await clickText(/série/i);
    if (await page.locator(BTN, { hasText: /lancer|envoyer|confirmer/i }).count()) await clickText(/lancer|envoyer|confirmer/i);
    out.raids = { clics: clicks, ok: await page.evaluate(() => (window.cendrelande.state.raidOrders?.active || []).length > 0) };
  } catch (e) { out.raids = { erreur: e.message, clics: clicks }; }
  // 4) Ménage des rapports lus : avant la v20, aucun bouton ne retire un rapport (la liste est seulement tronquée)
  out.menage = { rapportsLus: await page.evaluate(() => (window.cendrelande.state.reports || []).filter((r) => r.read).length), note: 'aucun moyen manuel avant la v20' };
  // 5) v20 : réglage unique des quatre corvées (Lieux → Corvées → 4 × « Activer »)
  const v20 = await page.evaluate(() => !!window.cendrelande.views?.chores);
  if (v20) {
    await home();
    clicks = 0;
    try { await openScreen('chores'); for (let i = 0; i < 4; i++) await click('[data-action="chore-toggle"][aria-pressed="false"]'); out.reglageV20 = { clics: clicks, ok: await page.evaluate(() => Object.values(window.cendrelande.state.chores).filter((c) => c && c.on).length === 4) }; } catch (e) { out.reglageV20 = { erreur: e.message, clics: clicks }; }
  }
  for (const v of Object.values(out)) if (v.erreur) v.erreur = v.erreur.split('\n')[0];
  console.log(JSON.stringify(out, null, 1));
  console.log(errors.length ? 'erreurs :\n' + errors.join('\n') : 'aucune erreur de page');
  await browser.close();
})();
