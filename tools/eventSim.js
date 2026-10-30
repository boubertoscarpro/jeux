// v25 — Joueur simulé pendant un événement (72 h) : vérifie qu'un joueur normal peut finir un événement sur la carte du
// monde (vrais trajets, départs de la capitale ou de l'avant-poste le plus proche).
// Lancer : node tools/eventSim.js [graines] [chemin des sources]   (par défaut : ../src, celles du dépôt)
// Profils : passif (2 passages par jour), moyen (toutes les 2 h de 8 h à 23 h), assidu (toutes les 30 min de 7 h à 24 h).
// À chaque passage : missions, objectifs et passe réclamés, puis chaque troupe d'événement libre part vers la cible
// utile la plus proche, avec le remplissage auto du jeu pour les combats. Mesure : palier de passe atteint (20 = fini),
// monnaie gagnée, camps vaincus. Un second chemin de sources permet de comparer avec une version antérieure.
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const seeds = +(process.argv[2] || 2);
const root = resolve(process.argv[3] || new URL('../src', import.meta.url).pathname);
const imp = (p) => import(pathToFileURL(resolve(root, p)).href);
const { importSave } = await imp('core/save.js');
const { advance } = await imp('core/engine.js');
const { rng, mulberry32 } = await imp('core/rng.js');
const LE = await imp('systems/liveEvents.js');
const { LIVE_EVENTS } = await imp('data/liveEvents.js');
const { autoFillLive } = await imp('systems/autofill.js');
const { resolveAny } = await imp('systems/pending.js');
const { planMarch, sendMarch } = await imp('systems/marches.js');

const H = 3600000;
const PROFILES = {
  passif: { name: 'Passif', at: [8, 20] },
  moyen: { name: 'Moyen', at: [8, 10, 12, 14, 16, 18, 20, 22] },
  assidu: { name: 'Assidu', at: Array.from({ length: 34 }, (_, i) => 7 + i * 0.5) },
};
const raw = gunzipSync(readFileSync(new URL('../tests/fixtures/save-milieu.json.gz', import.meta.url))).toString();

const PEACE = ['dig', 'mine', 'deliver', 'trade', 'harvest', 'track', 'solve', 'escort'];
function marchesOf(s) { return LE.eventMarches ? LE.eventMarches(s) : s.live.marches; }
function targets(s, now) {
  if (LE.eventTargetsByDistance) return LE.eventTargetsByDistance(s, now).map((x) => x.t);
  const cur = s.live.current;
  return cur.map.targets.filter((t) => LE.isVisible(cur, t)).sort((a, b) => a.x - b.x);
}
function session(s, now) {
  const cur = s.live.current;
  if (!cur) return;
  for (const o of LE.objectives(s)) if (o.done && !o.claimed) LE.claimObjective(s, o.id, now);
  LE.dailyMissions(s).forEach((d, i) => { if (d.done && !d.claimed) LE.claimDaily(s, i, now); });
  for (const l of LE.passInfo(s).levels) if (l.ready && !l.claimed) LE.claimPass(s, l.level, now);
  for (const p of s.pending.filter((x) => x.kind === 'riddle')) resolveAny(s, p.id, 0, now);
  // Ruines cachées : le joueur envoie ses éclaireurs explorer le brouillard autour de ses terres (marche du monde)
  const hidden = (cur.map.targets || []).filter((t) => t.fog && !t.done && !s.world.revealed[t.y * s.world.size + t.x]);
  if (hidden.length && planMarch && (s.army.scout || 0) > 0) {
    const c = s.world.capital, h = hidden.sort((a, b) => Math.hypot(a.x - c.x, a.y - c.y) - Math.hypot(b.x - c.x, b.y - c.y))[0];
    planMarch(s, { type: 'explore', x: h.x, y: h.y, units: { scout: 1 } }, now).ok && sendMarch(s, { type: 'explore', x: h.x, y: h.y, units: { scout: 1 } }, now);
  }
  const busy = new Set(marchesOf(s).map((m) => m.targetId));
  for (const t of targets(s, now).slice(0, 10)) {
    if (marchesOf(s).filter((m) => m.phase !== 'hold').length >= LE.maxLiveMarches(s)) break;
    if (busy.has(t.id)) continue;
    const acts = LE.actionsFor(s, t, now);
    const act = acts.find((a) => PEACE.includes(a) && LE.planLive(s, { action: a, targetId: t.id, units: { _p: 0 } }, now).reason !== 'Il faut au moins un éclaireur') || (acts.includes('attack') ? 'attack' : acts.find((a) => a === 'garrison'));
    if (!act) continue;
    let units;
    if (act === 'attack' || act === 'garrison' || act === 'escort') {
      const r = autoFillLive(s, { action: act, targetId: t.id }, now);
      if (!r.ok || (r.boss && (r.damage || 0) < 50)) continue;
      units = r.units;
    } else if (act === 'track' || act === 'spy') units = { scout: 1 };
    else { const u = Object.entries(s.army).filter(([k, n]) => n > 0 && k !== 'scout' && k !== 'spy').sort((a, b) => b[1] - a[1])[0]; if (!u) continue; units = { [u[0]]: Math.min(u[1], 40) }; }
    const r = LE.sendLive(s, { action: act, targetId: t.id, units }, now);
    if (r.ok) busy.add(t.id);
  }
}
function run(key, prof, seed) {
  rng.setSource(mulberry32(seed * 977 + key.length));
  const r = importSave(raw); const s = r.state || r;
  const t0 = Math.ceil((s.meta.lastTick || Date.UTC(2026, 9, 1)) / (24 * H)) * 24 * H;
  advance(s, t0);
  s.live.current = null; s.live.calendar = [];
  // Armée d'un joueur de milieu de partie (HdV 7) : la sauvegarde de référence n'a presque plus de troupes ; chaque
  // matin, le joueur reforme ce qu'il a perdu la veille (caserne), sans dépasser son armée de départ
  const ARMY = { spearman: 70, swordsman: 50, archer: 50, lightcav: 15, scout: 6 };
  for (const [u, n] of Object.entries(ARMY)) s.army[u] = Math.max(s.army[u] || 0, n);
  LE.startEvent(s, key, t0, t0 + 72 * H);
  const cur = s.live.current;
  const times = [];
  for (let d = 0; d < 3; d++) for (const h of PROFILES[prof].at) times.push(t0 + d * 24 * H + h * H);
  let day = -1;
  for (const t of times) {
    if (t >= cur.end) break;
    advance(s, t);
    const d = Math.floor((t - t0) / (24 * H));
    if (d !== day) { day = d; for (const [u, n] of Object.entries(ARMY)) { const out = marchesOf(s).reduce((a, m) => a + (m.units?.[u] || 0), 0); s.army[u] = Math.max(s.army[u] || 0, n - out); } }
    session(s, t);
  }
  advance(s, cur.end - 60000); session(s, cur.end - 60000);
  const out = { level: LE.passInfo(s).level, earned: Math.round(cur.earned), camps: cur.stats.camps || 0 };
  advance(s, cur.end + 60000);
  rng.setSource(null);
  return out;
}

const keys = process.env.EVENTS ? process.env.EVENTS.split(',') : Object.keys(LIVE_EVENTS);
const rows = [];
for (const key of keys) {
  const row = { key };
  for (const p of Object.keys(PROFILES)) {
    let lv = 0, earned = 0, done = 0;
    for (let sd = 1; sd <= seeds; sd++) { const r = run(key, p, sd); lv += r.level; earned += r.earned; if (r.level >= 20) done++; }
    row[p] = { level: +(lv / seeds).toFixed(1), earned: Math.round(earned / seeds), done: `${done}/${seeds}` };
  }
  rows.push(row);
  console.log(`${key.padEnd(15)} ${Object.keys(PROFILES).map((p) => `${p} : palier ${String(row[p].level).padStart(4)} (${row[p].done} finis, ${row[p].earned} gagnés)`).join(' · ')}`);
}
const avg = (p) => (rows.reduce((a, r) => a + r[p].level, 0) / rows.length).toFixed(1);
console.log(`\nMoyenne du palier de passe atteint en 72 h : ${Object.keys(PROFILES).map((p) => `${PROFILES[p].name} ${avg(p)}/20`).join(' · ')}`);
