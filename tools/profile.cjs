// v27.1 « Fluidité » — Profilage réel du jeu compilé (de préférence non minifié : NOMIN=1 node tools/build.mjs).
// Pour chaque partie (début, milieu, fin) et chaque scénario (château et monde au repos, gestes, fenêtres, quêtes,
// sauvegarde), le profileur CPU de Chrome (échantillon toutes les 200 µs) enregistre tout. On en déduit :
//  - le temps CPU occupé (hors temps libre) par seconde ;
//  - les tâches longues (> 50 ms : suites d'échantillons occupés sans temps libre) et leur origine (la fonction du jeu la
//    plus extérieure de la pile, puis la plus coûteuse dedans) ;
//  - le temps total par fonction du jeu (coupables classés par temps perdu) ;
//  - les images : temps entre deux images (requestAnimationFrame).
// Usage : node tools/profile.cjs [jeu.html] [--json fichier] [--only scénario]
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require('/opt/node-tools/node_modules/playwright')); }
const fs = require('fs'), path = require('path'), zlib = require('zlib');
const args = process.argv.slice(2);
const DIST = path.resolve(args.find((a) => a.endsWith('.html')) || path.resolve(__dirname, '../dist/cendrelande.html'));
const JSON_OUT = args.includes('--json') ? args[args.indexOf('--json') + 1] : null;
const ONLY = args.includes('--only') ? args[args.indexOf('--only') + 1] : null;
const FIX = (n) => zlib.gunzipSync(fs.readFileSync(path.resolve(__dirname, `../tests/fixtures/save-${n}.json.gz`))).toString();
const GAMES = args.includes('--games') ? args[args.indexOf('--games') + 1].split(',') : ['debut', 'milieu', 'fin'];
const SHORT = args.includes('--short'); // repos de 5 s au lieu de 10 (garde-fou rapide)
const LONG = 50;

// Fonctions du jeu reconnues comme « origine » (de la plus extérieure à la plus intérieure)
const ORIGINS = ['tick', 'render', 'renderWin', 'renderHud', 'updateTimers', 'save', 'saveGame', 'advance', 'campaignTick', 'questTick', 'missionsTick', 'drawMap', 'drawCity', 'attachGround', 'attachPaint', 'loop', 'draw', 'pump', 'resumeJob', 'paintSceneTile', 'paintGroundTile', 'paintWorldTile', 'sprite', 'bake', 'cityItems', 'sortScene', 'sceneModel', 'mountLife', 'lifeData', 'iconize', 'after', 'go', 'act', 'showTip', 'serialize', 'compress'];

function analyse(profile, wallMs) {
  const nodes = new Map(profile.nodes.map((n) => [n.id, n]));
  const parent = new Map();
  for (const n of profile.nodes) for (const c of n.children || []) parent.set(c, n.id);
  const nameOf = (n) => n.callFrame.functionName || '(anonyme)';
  const isGame = (n) => /cendrelande|\.html/.test(n.callFrame.url || '');
  const stackCache = new Map();
  const stack = (id) => {
    if (stackCache.has(id)) return stackCache.get(id);
    const s = []; let cur = id;
    while (cur != null) { s.push(nodes.get(cur)); cur = parent.get(cur); }
    s.reverse(); stackCache.set(id, s); return s;
  };
  const samples = profile.samples, deltas = profile.timeDeltas;
  const fnTotal = new Map(), fnSelf = new Map();
  let busy = 0;
  const tasks = []; let cur = null;
  for (let i = 0; i < samples.length; i++) {
    const dt = (deltas[i + 1] ?? deltas[i] ?? 0) / 1000; // ms attribués à l'échantillon i
    const n = nodes.get(samples[i]), nm = nameOf(n);
    const idle = nm === '(idle)';
    if (idle) { if (cur) { tasks.push(cur); cur = null; } continue; }
    busy += dt;
    const st = stack(samples[i]);
    const seen = new Set();
    for (const f of st) if (isGame(f)) { const k = nameOf(f); if (!seen.has(k)) { seen.add(k); fnTotal.set(k, (fnTotal.get(k) || 0) + dt); } }
    const selfK = isGame(n) ? nm : nm.startsWith('(') ? nm : `${nm} [natif]`;
    fnSelf.set(selfK, (fnSelf.get(selfK) || 0) + dt);
    // origine : fonction connue la plus extérieure, puis la plus intérieure
    const known = st.filter((f) => isGame(f) && ORIGINS.includes(nameOf(f))).map(nameOf);
    const key = known.length ? (known.length > 1 ? `${known[0]} › ${known[known.length - 1]}` : known[0]) : (st.find(isGame) ? nameOf(st.find(isGame)) : nm);
    if (!cur) cur = { ms: 0, by: new Map() };
    cur.ms += dt; cur.by.set(key, (cur.by.get(key) || 0) + dt);
  }
  if (cur) tasks.push(cur);
  const longs = tasks.filter((t) => t.ms > LONG).map((t) => ({ ms: Math.round(t.ms), cause: [...t.by.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2).map(([k, v]) => `${k} (${Math.round(v)})`).join(' + ') }));
  const top = (m, n) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => [k, Math.round(v)]);
  return { busyPct: Math.round((busy / wallMs) * 100), busyMsPerS: Math.round(busy / (wallMs / 1000)), longs, longCount: longs.length, longMs: longs.reduce((a, t) => a + t.ms, 0), topTotal: top(fnTotal, 14), topSelf: top(fnSelf, 10) };
}

const SCENARIOS = {
  'château-repos': { view: 'city', run: async (p) => { await p.waitForTimeout(SHORT ? 5000 : 10000); } },
  'monde-repos': { view: 'world', run: async (p) => { await p.waitForTimeout(SHORT ? 5000 : 10000); } },
  'château-geste': { view: 'city', run: gesture },
  'monde-geste': { view: 'world', run: gesture },
  'fenêtres': { view: 'city', run: async (p) => { for (const v of ['army', 'economy', 'questbook', 'research', 'world']) { await p.evaluate((v) => { const a = window.cendrelande; if (a.views[v]) a.go(v); }, v); await p.waitForTimeout(700); await p.evaluate(() => { const a = window.cendrelande; a.closeWin?.(); if (a.ui.map !== 'city') { a.ui.map = 'city'; a.go('city'); } }); await p.waitForTimeout(500); } } },
  'quêtes-sauvegarde': { view: 'city', run: async (p) => { for (let i = 0; i < 4; i++) { await p.evaluate(() => { const a = window.cendrelande; a.dirty = true; a.cpTick = 0; a.save(); }); await p.waitForTimeout(1500); } } },
  'ouverture-château': { view: 'world', run: async (p) => { for (let i = 0; i < 3; i++) { await p.evaluate(() => { const a = window.cendrelande; a.ui.map = 'city'; a.go('city'); }); await p.waitForTimeout(1500); await p.evaluate(() => { const a = window.cendrelande; a.ui.map = 'world'; a.go('world'); }); await p.waitForTimeout(1000); } } },
};
async function gesture(p) {
  await p.mouse.move(640, 400);
  for (let i = 0; i < 12; i++) { await p.mouse.wheel(0, -120); await p.waitForTimeout(60); }
  await p.mouse.down(); for (let i = 0; i < 30; i++) { await p.mouse.move(640 + i * 12, 400 + i * 6); await p.waitForTimeout(16); } await p.mouse.up();
  for (let i = 0; i < 24; i++) { await p.mouse.wheel(0, 120); await p.waitForTimeout(60); }
  await p.waitForTimeout(500);
}

(async () => {
  const b = await chromium.launch({ args: ['--enable-precise-memory-info'] });
  const out = {};
  for (const game of GAMES) {
    for (const [name, sc] of Object.entries(SCENARIOS)) {
      if (ONLY && !ONLY.split(',').some((o) => name.startsWith(o))) continue;
      const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } });
      if (game !== 'debut') await ctx.addInitScript((s) => { try { if (!sessionStorage.getItem('pr')) { localStorage.setItem('cendrelande_save', s); sessionStorage.setItem('pr', '1'); } } catch {} }, FIX(game));
      const p = await ctx.newPage();
      const errs = []; p.on('pageerror', (e) => errs.push(e.message));
      await p.goto('file://' + DIST); await p.waitForTimeout(1200);
      if (game === 'debut') { await p.click('[data-kt="merchants"]'); await p.click('#intro-review'); await p.click('#intro-start'); await p.waitForTimeout(500); }
      await p.evaluate((v) => { const a = window.cendrelande; a.state.meta.tipsOff = true; a.state.meta.gfx = a.state.meta.gfx || 'high'; a.state.meta.gfxChosen = true; if (a.state.live) a.state.live.unseenReport = null; a.closeModal(); a.ui.map = v; a.go(v); a.closeModal(); }, sc.view);
      await p.waitForTimeout(2500); // peinture initiale terminée
      // les fenêtres d'accueil (rapport d'absence, bilan) s'ouvrent avec un délai : on les ferme jusqu'à ce qu'il n'y en ait plus
      for (let i = 0; i < 6; i++) { const open = await p.evaluate(() => { const a = window.cendrelande; const o = document.getElementById('modal-root')?.classList.contains('open'); a.closeModal(); return o; }); if (!open && i > 1) break; await p.waitForTimeout(400); }
      const cdp = await ctx.newCDPSession(p);
      await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 200 });
      await p.evaluate(() => { window.__f = []; let l = performance.now(); const t = (n) => { window.__f.push(n - l); l = n; requestAnimationFrame(t); }; requestAnimationFrame(t); window.__heap0 = performance.memory.usedJSHeapSize; });
      const t0 = Date.now();
      await cdp.send('Profiler.start');
      await sc.run(p);
      const { profile } = await cdp.send('Profiler.stop');
      const wall = Date.now() - t0;
      const fr = await p.evaluate(() => { const f = window.__f.slice(2).sort((a, b) => a - b); const avg = f.reduce((a, b) => a + b, 0) / Math.max(1, f.length); return { fps: Math.round(1000 / avg), p95: Math.round(f[Math.floor(f.length * 0.95)] || 0), pire: Math.round(f[f.length - 1] || 0), heapMo: +(performance.memory.usedJSHeapSize / 1e6).toFixed(1) }; });
      const r = { ...analyse(profile, wall), ...fr, errs: errs.slice(0, 2) };
      out[`${game} · ${name}`] = r;
      console.log(`${game.padEnd(6)} ${name.padEnd(18)} occupé ${String(r.busyPct).padStart(3)} % · ${r.longCount} tâches > 50 ms (${r.longMs} ms) · ${r.fps} img/s, p95 ${r.p95} ms · ${r.longs.slice(0, 2).map((l) => `${l.ms} ms ${l.cause}`).join(' | ')}`);
      await ctx.close();
    }
  }
  await b.close();
  if (JSON_OUT) fs.writeFileSync(JSON_OUT, JSON.stringify(out, null, 1));
  return out;
})().then((out) => { module.exports.last = out; });
