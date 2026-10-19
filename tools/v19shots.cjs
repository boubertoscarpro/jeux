// Captures v19 « L'Art du siège » : défense des remparts, raid en approche, fenêtre d'attaque d'une place fortifiée,
// rapport de raid. Sauvegarde de fin (muraille 14, douves 6), à 3 tailles. En v19 s'y ajoutent l'arsenal et la
// production, le conseil de guerre et le rapport flanc par flanc.
// Usage : DIST=… node tools/v19shots.cjs <dossier> [--before]
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require('/opt/node-tools/node_modules/playwright')); }
const fs = require('fs'), path = require('path'), zlib = require('zlib');
const OUT = process.argv[2];
const BEFORE = process.argv.includes('--before');
const URL = 'file://' + path.resolve(process.env.DIST || path.resolve(__dirname, '../dist/cendrelande.html'));
const raw = zlib.gunzipSync(fs.readFileSync(path.resolve(__dirname, '../tests/fixtures/save-fin.json.gz'))).toString();
const SIZES = [[1400, 900, 'large'], [1024, 640, 'moyen'], [390, 844, 'mobile']];

// Un raid en approche, visible (tour de garde 6), et un rapport de défense récent
const setup = (a) => {
  const s = a.state;
  s.meta.tipsOff = true;
  const p = Object.values(s.world.pois).find((x) => x.type === 'kingdom');
  if (!s.raids.length) s.raids.push({ id: 'shot0', rival: p.rival, name: p.name, from: { x: p.x, y: p.y }, army: { militia: 300, guard: 80, royalArcher: 200, royalKnight: 90 }, start: Date.now() - 60000, arrive: Date.now() + 1500, seen: true, flank: 'front', flankSeen: true });
  return p;
};
// Un raid en approche (après la résolution du premier)
const setup2 = (a) => {
  const s = a.state;
  const p = Object.values(s.world.pois).find((x) => x.type === 'kingdom');
  s.raidCooldown = Date.now() + 864e5;
  if (!s.raids.length) s.raids.push({ id: 'shot', rival: p.rival, name: p.name, from: { x: p.x, y: p.y }, army: { militia: 400, guard: 120, royalArcher: 300, royalKnight: 150 }, start: Date.now(), arrive: Date.now() + 20 * 60000, seen: true, flank: 'left', flankSeen: true, engines: { ladders: 8, mantlets: 3, fascines: 3 }, mainFlank: 'left', adapt: 'ils ont vu vos pierres sur le flanc gauche : ils apportent des mantelets', plan: { waves: [{ left: { share: 1, engines: { ladders: 8, mantlets: 3, fascines: 3 } }, front: { share: 0, engines: {} }, right: { share: 0, engines: {} } }] } });
  return p;
};
const SCENES = [
  ['01-defense', (a) => { a.go('defense'); }],
  ['02-remparts', (a) => { a.go('defense'); setTimeout(() => document.querySelector('.rp-card')?.scrollIntoView(), 0); }],
  ['03-attaque-place', (a) => { const p = Object.values(a.state.world.pois).find((x) => x.type === 'kingdom'); const w = a.state.world; w.revealed[p.y * w.size + p.x] = 1; a.ui.worldSel = { x: p.x, y: p.y }; a.go('tile'); }, '[data-action="march"][data-type="attack"]'],
  ['04-rapport-raid', (a) => { a.go('defense'); }, '[data-action="def-report"]'],
];
const AFTER = [
  ['05-arsenal', (a) => { a.ui.defTab = 'arsenal'; a.go('defense'); }],
  ['06-conseil-de-guerre', (a) => { const p = Object.values(a.state.world.pois).find((x) => x.type === 'kingdom'); const w = a.state.world; w.revealed[p.y * w.size + p.x] = 1; a.ui.worldSel = { x: p.x, y: p.y }; a.go('tile'); }, '[data-action="march"][data-type="attack"]', '[data-action="sg-advise"]'],
];

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const errors = [];
  for (const [W, H, tag] of SIZES) {
    const ctx = await browser.newContext({ viewport: { width: W, height: H } });
    await ctx.addInitScript((sv) => { try { if (!sessionStorage.getItem('v19s')) { localStorage.setItem('cendrelande_save', sv); sessionStorage.setItem('v19s', '1'); } } catch {} }, raw);
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(`${tag}: ${e.message}`));
    page.on('dialog', (d) => d.dismiss());
    await page.goto(URL);
    await page.waitForTimeout(800);
    await page.evaluate((src) => { (0, eval)(`(${src})`)(window.cendrelande); }, setup.toString());
    await page.waitForTimeout(4000); // le premier raid arrive et se résout (rapport de défense)
    await page.evaluate((src) => { (0, eval)(`(${src})`)(window.cendrelande); }, setup2.toString());
    for (const [name, fn, click, click2] of [...SCENES, ...(BEFORE ? [] : AFTER)]) {
      await page.evaluate((src) => { const a = window.cendrelande; if (a.state.live) a.state.live.unseenReport = null; a.closeModal(); if (a.ui.win) a.closeWin?.(false); (0, eval)(`(${src})`)(a); }, fn.toString());
      await page.waitForTimeout(500);
      for (const c of [click, click2].filter(Boolean)) { await page.click(c).catch((e) => errors.push(`${tag} ${name}: ${e.message.split('\n')[0]}`)); await page.waitForTimeout(500); }
      await page.evaluate(() => { const t = document.getElementById('toasts'); if (t) t.innerHTML = ''; });
      await page.screenshot({ path: path.join(OUT, `${name}-${tag}.png`) });
    }
    await ctx.close();
  }
  await browser.close();
  console.log(errors.length ? 'erreurs :\n' + errors.join('\n') : 'aucune erreur de page');
})();
