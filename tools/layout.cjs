// Tests de rendu automatiques (version compilée, Chromium) : chaque écran du jeu est ouvert à plusieurs tailles
// d'écran, du téléphone au très grand écran, et l'on vérifie que la mise en page tient (v16 « Le Château ») :
//  - aucun débordement horizontal de la page, ni du corps de la fenêtre ouverte ;
//  - l'affichage fixe : les blocs d'une même rangée (haut, bas) ne se chevauchent pas, les colonnes latérales ne
//    recouvrent ni le haut ni le bas, et tout reste dans l'écran ;
//  - la fenêtre d'un lieu reste dans l'écran et ne recouvre pas l'affichage fixe du haut ni du bas (sauf téléphone,
//    où elle occupe tout l'écran) ;
//  - les boutons de l'affichage fixe ont une taille cliquable (≥ 32 px) ;
//  - aucune erreur de console.
// Usage : npm run build && npm run layout
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require('/opt/node-tools/node_modules/playwright')); }
const path = require('path');

const SIZES = [[360, 740, 'téléphone'], [768, 1024, 'tablette'], [1024, 640, 'petit écran'], [1440, 900, 'grand écran'], [390, 844, 'téléphone 390'], [1920, 1080, 'très grand écran']];

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
    await page.goto('file://' + (process.env.DIST ? path.resolve(process.env.DIST) : path.resolve(__dirname, '../dist/cendrelande.html')));
    await page.click('[data-kt="merchants"]'); await page.click('#intro-review'); await page.click('#intro-start');
    await page.waitForTimeout(300);
    // Royaume avancé : tous les écrans ouverts, contenus nombreux (cas le plus chargé), un avant-poste à visiter
    await page.evaluate(() => {
      const a = window.cendrelande, s = a.state;
      for (const r in s.resources) s.resources[r] = 99999;
      Object.values(s.city.buildings).find((b) => b.type === 'townhall').level = 12;
      s.army = { spearman: 300, archer: 200, knight: 60, scout: 6 };
      s.meta.tipsOff = true; s.world.revealed.fill(1);
      s.raids = [{ id: 'lr', rival: 0, name: 'Clan des Crocs-Gris', from: { x: 0, y: 0 }, army: { militia: 30 }, start: Date.now(), arrive: Date.now() + 9e5, seen: true }];
      a.closeModal(); a.render();
    });
    await page.evaluate(() => {
      const s = window.cendrelande.state, c = s.world.capital;
      if (!Object.keys(s.territories).length) s.territories[`${c.x + 3},${c.y}`] = { id: 'opL', name: 'Fort-Témoin', x: c.x + 3, y: c.y, terrain: 'plain', since: Date.now(), spec: null, level: 2, garrison: {} };
    });
    const views = await page.evaluate(() => Object.keys(window.cendrelande.views));
    for (const v of views) {
      ctx = v;
      const ok = await page.evaluate((v) => {
        const a = window.cendrelande;
        a.closeModal();
        if (v === 'outpost') { const k = Object.keys(a.state.territories)[0]; if (!k) return false; a.ui.outpost = k; }
        if (v === 'bldg') a.ui.citySel = (() => { const b = Object.values(a.state.city.buildings).find((x) => x.type === 'townhall'); return { x: b.x, y: b.y }; })();
        if (v === 'tile') a.ui.worldSel = { ...a.state.world.capital };
        a.go(v);
        return true;
      }, v);
      if (!ok) continue;
      await page.waitForTimeout(60);
      const r = await page.evaluate((phone) => {
        const out = [];
        const vw = window.innerWidth, vh = window.innerHeight;
        const doc = document.documentElement;
        if (doc.scrollWidth > vw + 1) out.push(`la page déborde horizontalement (${doc.scrollWidth} px pour ${vw})`);
        const rect = (el) => { if (!el) return null; const b = el.getBoundingClientRect(); return b.width && b.height && getComputedStyle(el).display !== 'none' && getComputedStyle(el).visibility !== 'hidden' ? b : null; };
        const hit = (a, b) => a && b && a.right > b.left + 1 && a.left < b.right - 1 && a.bottom > b.top + 1 && a.top < b.bottom - 1;
        const q = (sel) => rect(document.querySelector(sel));
        const name = { '.hud-tl': 'profil', '.hud-tc .hres-row': 'ressources', '.hud-tr': 'heure et réglages', '.hud-bl': 'fil', '.hud-bc': 'files d’attente', '.hud-br': 'actions', '.hud-l': 'colonne des quêtes', '.hud-r': 'activités' };
        const top = ['.hud-tl', '.hud-tc .hres-row', '.hud-tr'], bot = ['.hud-bl', '.hud-bc', '.hud-br'];
        for (const row of [top, bot]) for (let i = 0; i < row.length; i++) for (let j = i + 1; j < row.length; j++) if (hit(q(row[i]), q(row[j]))) out.push(`affichage fixe : « ${name[row[i]]} » recouvre « ${name[row[j]]} »`);
        for (const col of ['.hud-l', '.hud-r']) for (const s of [...top, ...bot]) if (hit(q(col), q(s))) out.push(`affichage fixe : « ${name[col]} » recouvre « ${name[s]} »`);
        if (hit(q('.hud-l'), q('.hud-r'))) out.push('affichage fixe : les deux colonnes se recouvrent');
        for (const s of [...top, ...bot, '.hud-l', '.hud-r']) { const b = q(s); if (b && (b.left < -1 || b.right > vw + 1 || b.top < -1 || b.bottom > vh + 1)) out.push(`affichage fixe : « ${name[s]} » sort de l’écran`); }
        const small = [...document.querySelectorAll('.hud-a, .hud-globe, .hud-btn, .hud-act, .hud-fab')].filter((b) => { const x = rect(b); return x && (x.width < 32 || x.height < 32); });
        if (small.length) out.push(`${small.length} bouton(s) de l’affichage fixe trop petits`);
        const win = q('#win-root.open .win');
        if (win) {
          if (win.left < -1 || win.right > vw + 1 || win.top < -1 || win.bottom > vh + 1) out.push('la fenêtre sort de l’écran');
          if (!phone) for (const s of [...top, '.hud-bc', '.hud-br']) if (hit(win, q(s))) out.push(`la fenêtre recouvre « ${name[s]} »`);
          const body = document.querySelector('#win-root .win-body');
          if (body && body.scrollWidth > body.clientWidth + 2) {
            const vb = body.getBoundingClientRect();
            const culprit = [...body.querySelectorAll('*')].find((el) => { const b = el.getBoundingClientRect(); return b.right > vb.right + 2 && !el.closest('.table-wrap, canvas, .tabs, .subnav, .bp-items, .hres-row'); });
            if (culprit) out.push(`le corps de la fenêtre déborde (${body.scrollWidth} > ${body.clientWidth}) : ${culprit.tagName.toLowerCase()}.${String(culprit.className).split(' ').slice(0, 2).join('.')}`);
          }
          const tabs = q('#win-root .win-tabs');
          if (tabs && tabs.height < 24) out.push('les onglets de la fenêtre sont écrasés');
        }
        const bp = q('#view .build-panel');
        if (bp && (bp.left < -1 || bp.right > vw + 1)) out.push('le panneau du bas sort de l’écran');
        return out;
      }, W <= 700);
      checks++;
      for (const p of r) problems.push(`${label} ${W}×${H} · écran « ${v} » : ${p}`);
    }
    await page.close();
  }
  await browser.close();
  console.log(`rendu : ${SIZES.length} tailles × écrans = ${checks} vérifications`);
  if (problems.length) { console.log([...new Set(problems)].join('\n')); process.exit(1); }
  console.log('Aucun problème de mise en page.');
})();
