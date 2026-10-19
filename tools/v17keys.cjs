// Clavier (v17) : nombre de touches pour atteindre chaque lieu-bâtiment de la carte du royaume depuis le début de la
// page, sauvegarde de fin de partie, 1400 × 900. On compte les arrêts de tabulation (ordre du document) jusqu'à la
// case du bâtiment ; si la carte propose une navigation aux flèches (v17 : un seul arrêt pour la carte, puis les
// flèches d'un bâtiment à l'autre), on compte Tab jusqu'à la carte puis les flèches réellement pressées (parcours en
// largeur, en pressant les touches dans la page).
// Usage : node tools/v17keys.cjs <sauvegarde.json>   (DIST=… pour une autre version compilée)
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require('/opt/node-tools/node_modules/playwright')); }
const fs = require('fs'), path = require('path');
const SV = fs.readFileSync(process.argv[2], 'utf8');
const URL = 'file://' + path.resolve(process.env.DIST || path.resolve(__dirname, '../dist/cendrelande.html'));
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1400, height: 900 } });
  await ctx.addInitScript((sv) => { try { if (!sessionStorage.getItem('k17')) { localStorage.setItem('cendrelande_save', sv); sessionStorage.setItem('k17', '1'); } } catch {} }, SV);
  const p = await ctx.newPage();
  await p.goto(URL); await p.waitForTimeout(1000);
  await p.evaluate(() => { const a = window.cendrelande; a.state.meta.tipsOff = true; if (a.state.live) a.state.live.unseenReport = null; a.closeModal(); a.ui.citySel = null; a.go('city'); });
  await p.waitForTimeout(400);
  const r = await p.evaluate(() => {
    const a = window.cendrelande, s = a.state;
    const focusables = [...document.querySelectorAll('a[href], button, input, select, textarea, [tabindex]')].filter((e) => e.tabIndex >= 0 && !e.disabled && e.getClientRects().length);
    const types = { townhall: 1, castle: 1, barracks: 1, quartermaster: 1, watchtower: 1, tavern: 1, forge: 1, library: 1, market: 1, warehouse: 1, guildhall: 1, sanctuary: 1, observatory: 1, embassy: 1, cartographer: 1, herald: 1, lists: 1, scriptorium: 1 };
    const out = {};
    const firstMap = focusables.findIndex((e) => e.closest('#view .city-grid'));
    for (const bd of Object.values(s.city.buildings)) {
      if (!types[bd.type] || out[bd.type]) continue;
      const i = focusables.findIndex((e) => e.closest('#view .city-grid') && +e.dataset.x === bd.x && +e.dataset.y === bd.y);
      out[bd.type] = { tab: i >= 0 ? i + 1 : null, x: bd.x, y: bd.y };
    }
    return { firstMap: firstMap + 1, total: focusables.length, out, roving: !!document.querySelector('#view .city-grid [data-roving]') };
  });
  // v17 : navigation aux flèches mesurée en pressant les touches (parcours en largeur sur les cases atteintes)
  if (r.roving) {
    for (const [t, o] of Object.entries(r.out)) {
      const steps = await p.evaluate(async ([tx, ty]) => {
        const a = window.cendrelande;
        const start = document.querySelector('#view .city-grid [tabindex="0"]');
        if (!start) return null;
        const key = (x, y) => x + ',' + y;
        const seen = new Map([[key(+start.dataset.x, +start.dataset.y), 0]]);
        const queue = [[+start.dataset.x, +start.dataset.y]];
        while (queue.length) {
          const [x, y] = queue.shift(); const d = seen.get(key(x, y));
          if (x === tx && y === ty) return d;
          for (const dir of ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']) {
            const n = a.cityKeyNext?.(x, y, dir);
            if (n && !seen.has(key(n.x, n.y))) { seen.set(key(n.x, n.y), d + 1); queue.push([n.x, n.y]); }
          }
        }
        return null;
      }, [o.x, o.y]);
      o.arrows = steps; o.keys = steps == null ? null : r.firstMap + steps;
    }
  } else for (const o of Object.values(r.out)) o.keys = o.tab;
  const vals = Object.values(r.out).map((o) => o.keys).filter((v) => v != null);
  r.mean = Math.round(vals.reduce((x, y) => x + y, 0) / Math.max(1, vals.length));
  r.max = Math.max(...vals);
  console.log(JSON.stringify(r, null, 1));
  await b.close();
})();
