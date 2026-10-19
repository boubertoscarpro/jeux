// v18 « L'Armurerie » — clics et temps pour deux tâches, sur la sauvegarde « armurerie pleine » (12 héros, 300 objets) :
//  1) équiper toute la troupe au mieux ;
//  2) vider l'inventaire (tout ce qui n'est ni porté ni verrouillé).
// Mode v17 (avant) : le parcours manuel le plus court possible, en supposant que le joueur sait déjà quel objet choisir
//   (le meilleur selon la « puissance » affichée) : héros → emplacement → Équiper ; objet → Recycler → confirmer.
// Mode v18 (après) : « Équiper toute la troupe » → Valider ; « Vente et démantèlement » → filtres → Confirmer.
// Les clics sont réellement effectués dans la version compilée ; le temps mesuré est celui de la machine (rendu compris),
// pas le temps de réflexion d'un joueur, qui s'y ajoute.
// Usage : DIST=… node tools/v18clicks.cjs [--before] [sauvegarde]
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require('/opt/node-tools/node_modules/playwright')); }
const fs = require('fs'), path = require('path'), zlib = require('zlib');
const BEFORE = process.argv.includes('--before');
const SAVE = process.argv.slice(2).find((a) => !a.startsWith('--')) || path.resolve(__dirname, '../tests/fixtures/save-armurerie.json.gz');
const URL = 'file://' + path.resolve(process.env.DIST || path.resolve(__dirname, '../dist/cendrelande.html'));
const raw = SAVE.endsWith('.gz') ? zlib.gunzipSync(fs.readFileSync(SAVE)).toString() : fs.readFileSync(SAVE, 'utf8');

async function open(browser) {
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  await ctx.addInitScript((sv) => { try { if (!sessionStorage.getItem('v18c')) { localStorage.setItem('cendrelande_save', sv); sessionStorage.setItem('v18c', '1'); } } catch {} }, raw);
  const page = await ctx.newPage();
  page.on('dialog', (d) => d.accept());
  await page.goto(URL);
  await page.waitForTimeout(800);
  await page.evaluate(() => { const a = window.cendrelande; a.state.meta.tipsOff = true; if (a.state.live) a.state.live.unseenReport = null; a.closeModal(); });
  return { ctx, page };
}

async function beforeEquip(page) {
  let clicks = 0;
  const t0 = Date.now();
  await page.evaluate(() => window.cendrelande.go('heroes')); clicks++;
  const heroes = await page.evaluate(() => window.cendrelande.state.heroes.filter((h) => !h.marchId).map((h) => h.id));
  const slots = ['weapon', 'helmet', 'armor', 'gloves', 'boots', 'ring', 'amulet'];
  for (const hid of heroes) {
    await page.click(`[data-action="hero-sel"][data-id="${hid}"]`); clicks++;
    for (const slot of slots) {
      await page.click(`.equip-slot[data-slot="${slot}"]`); clicks++;
      // Le joueur prend l'objet le plus « puissant » affiché qui n'est porté par personne
      const id = await page.evaluate(([slot]) => {
        const s = window.cendrelande.state;
        const AFF = (k) => k; void AFF;
        const score = (it) => Object.values(it.affixes).reduce((a, v) => a + Math.abs(Math.abs(v) < 1 ? v * 100 : v) * (1 + 0.1 * (it.plus || 0)), 0);
        const c = s.inventory.items.filter((i) => i.slot === slot && !i.equippedBy).sort((a, b) => score(b) - score(a))[0];
        return c ? c.id : null;
      }, [slot]);
      if (!id) continue;
      const btn = await page.$(`[data-action="equip"][data-item="${id}"]`);
      if (btn) { await btn.click(); clicks++; }
    }
  }
  return { clicks, ms: Date.now() - t0 };
}

async function beforeEmpty(page) {
  let clicks = 0;
  const t0 = Date.now();
  await page.evaluate(() => window.cendrelande.go('craft')); clicks++;
  for (let guard = 0; guard < 400; guard++) {
    const id = await page.evaluate(() => { const s = window.cendrelande.state; return s.inventory.items.find((i) => !i.equippedBy && !i.locked && document.querySelector(`[data-action="item-sel"][data-id="${i.id}"]`))?.id || null; });
    if (!id) break;
    await page.click(`[data-action="item-sel"][data-id="${id}"]`); clicks++;
    await page.click(`[data-action="salvage"][data-id="${id}"]`); clicks += 2; // + la boîte de confirmation
  }
  const left = await page.evaluate(() => window.cendrelande.state.inventory.items.filter((i) => !i.equippedBy && !i.locked).length);
  return { clicks, ms: Date.now() - t0, left };
}

async function afterEquip(page) {
  let clicks = 0;
  const t0 = Date.now();
  await page.evaluate(() => window.cendrelande.go('heroes')); clicks++;
  await page.click('[data-action="ae-team"]'); clicks++;
  await page.click('[data-action="ae-apply"]'); clicks++;
  const gain = await page.evaluate(() => window.cendrelande.ui._aeLast || null);
  return { clicks, ms: Date.now() - t0, gain };
}

async function afterEmpty(page) {
  let clicks = 0;
  const t0 = Date.now();
  await page.evaluate(() => window.cendrelande.go('craft')); clicks++;
  await page.click('[data-action="bulk-open"]'); clicks++;
  await page.click('[data-action="bulk-preset"][data-k="all"]'); clicks++;
  await page.click('[data-action="bulk-confirm"]'); clicks++;
  const left = await page.evaluate(() => window.cendrelande.state.inventory.items.filter((i) => !i.equippedBy && !i.locked).length);
  return { clicks, ms: Date.now() - t0, left };
}

(async () => {
  const browser = await chromium.launch();
  const out = { mode: BEFORE ? 'v17 (avant)' : 'v18 (après)', save: path.basename(SAVE) };
  let r = await open(browser);
  out.equipTeam = BEFORE ? await beforeEquip(r.page) : await afterEquip(r.page);
  await r.ctx.close();
  r = await open(browser);
  out.emptyInventory = BEFORE ? await beforeEmpty(r.page) : await afterEmpty(r.page);
  await r.ctx.close();
  await browser.close();
  console.log(JSON.stringify(out, null, 1));
})();
