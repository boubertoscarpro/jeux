// Mesures de lisibilité de la carte du royaume (v17 « Clair comme le jour »), sur la version compilée :
//  - texts : nombre d'éléments textuels visibles sur la carte (dans l'écran, hors affichage fixe) ;
//  - overlaps : paires de marques de la carte (noms, écussons de niveau, flèches, bulles, signaux, étiquettes de zone,
//    plaques) dont les rectangles affichés se recouvrent ;
//  - hidden : marques de la carte recouvertes par un bloc de l'affichage fixe ;
//  - useful : part de l'écran que l'affichage fixe ne couvre pas (échantillonnage tous les 8 px).
// Scènes : début (nouvelle partie), milieu et fin (sauvegardes), vue normale (cadrage par défaut), 3 tailles.
// Usage : node tools/v17measure.cjs [sauvegarde-milieu] [sauvegarde-fin] [--strict]   (npm run overlaps : --strict)
//   DIST=… pour une autre version compilée. --strict : code de sortie 1 s'il reste un chevauchement (test).
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require('/opt/node-tools/node_modules/playwright')); }
const fs = require('fs'), path = require('path');
const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
// Par défaut : les sauvegardes du dépôt (milieu : partie « Actif » de 3 jours ; fin : « Très optimisé », 7 jours)
const MIDF = args[0] || path.resolve(__dirname, '../tests/fixtures/save-milieu.json.gz');
const LATEF = args[1] || path.resolve(__dirname, '../tests/fixtures/save-fin.json.gz');
const read = (f) => (f.endsWith('.gz') ? require('zlib').gunzipSync(fs.readFileSync(f)).toString() : fs.readFileSync(f, 'utf8'));
const STRICT = process.argv.includes('--strict');
const URL = 'file://' + path.resolve(process.env.DIST || path.resolve(__dirname, '../dist/cendrelande.html'));
const SIZES = [[1400, 900, 'large'], [1024, 640, 'moyen'], [390, 844, 'mobile']];
const MARKS = '.t-name, .t-lvl, .t-up, .t-bubble, .t-flag, .t-hero, .t-risk, .t-build, .t-sig, .t-crest, .zone-label, .lot-name, .lot-plate, .castle-plate';
const HUD = '.hud-tl, .hud-tc .hres-row, .hud-tr, .hud-l, .hud-r, .hud-bl > *, .hud-bc, .hud-actions, .hud-globe, .hud-zoom, .hud-fab, .hud-timeline, .layer-bar';

async function measure(page) {
  return page.evaluate(([MARKS, HUD]) => {
    const vw = innerWidth, vh = innerHeight;
    const vis = (el) => { const cs = getComputedStyle(el); if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity === 0) return false; let p = el.parentElement; while (p) { const c = getComputedStyle(p); if (c.display === 'none' || c.visibility === 'hidden' || +c.opacity === 0) return false; p = p.parentElement; } return true; };
    const inView = (r) => r.width > 0 && r.height > 0 && r.right > 0 && r.bottom > 0 && r.left < vw && r.top < vh;
    const view = document.getElementById('view');
    // Éléments textuels : nœuds de texte non vides, visibles, dans l'écran
    let texts = 0;
    const tw = document.createTreeWalker(view, NodeFilter.SHOW_TEXT);
    const seen = new Set();
    for (let n = tw.nextNode(); n; n = tw.nextNode()) {
      if (!n.nodeValue.trim()) continue;
      const el = n.parentElement;
      if (!el || seen.has(el) || el.closest('.build-panel, .ring-wrap, .map-tip, [aria-hidden="true"] .sr-only, .sr-only, .map-filters')) continue;
      seen.add(el);
      const r = el.getBoundingClientRect();
      if (inView(r) && vis(el)) texts++;
    }
    const hud = [...document.querySelectorAll(HUD)].filter(vis).map((e) => e.getBoundingClientRect()).filter(inView);
    const marks = [...view.querySelectorAll(MARKS)].filter(vis).map((e) => ({ e, r: e.getBoundingClientRect() })).filter((m) => inView(m.r));
    const hit = (a, b) => Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
    let overlaps = 0; const ex = [];
    for (let i = 0; i < marks.length; i++) for (let j = i + 1; j < marks.length; j++) {
      const a = marks[i], b = marks[j];
      if (a.e.contains(b.e) || b.e.contains(a.e)) continue;
      if (hit(a.r, b.r) > 4) { overlaps++; if (ex.length < 6) ex.push(`${a.e.className.baseVal ?? a.e.className}|${(a.e.textContent || '').trim().slice(0, 18)} × ${b.e.className.baseVal ?? b.e.className}|${(b.e.textContent || '').trim().slice(0, 18)}`); }
    }
    let hidden = 0;
    for (const m of marks) if (hud.some((h) => hit(m.r, h) > 4)) hidden++;
    let tot = 0, free = 0;
    for (let y = 4; y < vh; y += 8) for (let x = 4; x < vw; x += 8) { tot++; if (!hud.some((h) => x >= h.left && x <= h.right && y >= h.top && y <= h.bottom)) free++; }
    return { texts, marks: marks.length, overlaps, hidden, useful: Math.round((free / tot) * 1000) / 10, examples: ex };
  }, [MARKS, HUD]);
}

(async () => {
  const browser = await chromium.launch();
  const out = {};
  const saves = { milieu: read(MIDF), fin: read(LATEF) };
  for (const [W, H, tag] of SIZES) {
    for (const scene of ['debut', 'milieu', 'fin']) {
      const ctx = await browser.newContext({ viewport: { width: W, height: H } });
      if (scene !== 'debut') await ctx.addInitScript((sv) => { try { if (!sessionStorage.getItem('m17')) { localStorage.setItem('cendrelande_save', sv); sessionStorage.setItem('m17', '1'); } } catch {} }, saves[scene]);
      const page = await ctx.newPage();
      await page.goto(URL);
      await page.waitForTimeout(scene === 'debut' ? 400 : 1000);
      if (scene === 'debut') { await page.click('[data-kt="merchants"]'); await page.click('#intro-review'); await page.click('#intro-start'); await page.waitForTimeout(400); }
      await page.evaluate(() => { const a = window.cendrelande; a.state.meta.tipsOff = true; if (a.state.live) a.state.live.unseenReport = null; a.closeModal(); a.ui.citySel = null; a.go('city'); });
      await page.waitForTimeout(500);
      await page.evaluate(() => { const t = document.getElementById('toasts'); if (t) t.innerHTML = ''; });
      out[`${scene}-${tag}`] = await measure(page);
      await ctx.close();
    }
  }
  await browser.close();
  console.log(JSON.stringify(out, null, 1));
  const bad = Object.entries(out).filter(([, m]) => m.overlaps > 0);
  if (STRICT && bad.length) { console.error('Chevauchements : ' + bad.map(([k, m]) => `${k} ${m.overlaps} (${m.examples.join(' ; ')})`).join('\n')); process.exit(1); }
})();
