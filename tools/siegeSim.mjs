// Simulation des sièges (v19 « L'Art du siège ») — taux de victoire des raids contre le château du joueur, et
// stratégies d'attaque et de défense d'une place forte.
// Usage : node tools/siegeSim.mjs [racine du jeu] [--n 150] [--attack]
//   - Défense « sans s'en occuper » : le joueur ne règle rien (répartition neutre, aucun engin posé) ;
//   - v19 seulement : défense « préparée » (répartition conseillée et engins de défense en stock) ;
//   - v19 seulement (--attack) : grille de stratégies d'attaque contre des défenses variées (aucune ne doit dominer).
// Trois places : un bourg sans muraille (sauvegarde de milieu), le même bourg avec une muraille niv. 6, une capitale
// (sauvegarde de fin, muraille 14, douves 6) ; garnisons à 60 %, 100 % et 140 % de l'effectif réel.
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const args = process.argv.slice(2);
const root = path.resolve(args.find((a) => !a.startsWith('--') && !/^\d+$/.test(a)) || path.resolve(path.dirname(new URL(import.meta.url).pathname), '..'));
const N = +(args[args.indexOf('--n') + 1] || 0) || 150;
const imp = (p) => import(pathToFileURL(path.join(root, p)).href);
const { deserialize, serialize } = await imp('src/core/save.js');
const { rng, mulberry32 } = await imp('src/core/rng.js');
const R = await imp('src/systems/rivals.js');
const C = await imp('src/systems/castle.js');
let SG = null;
try { SG = await imp('src/systems/siege.js'); } catch { SG = null; }

const load = (f) => deserialize(gunzipSync(readFileSync(path.join(root, `tests/fixtures/${f}.json.gz`))).toString());
const base = {
  bourg: load('save-milieu'),
  fortifie: (() => { const s = load('save-milieu'); s.city.fort.wall = 6; return s; })(),
  capitale: load('save-fin'),
};
// Garnison exprimée en multiple du plancher de puissance des raids (250 × hôtel de ville) : 0,8 (trop faible),
// 1,2 (à sa portée), 1,8 (confortable), et 0,5 (marginal : là où la préparation se voit). Infanterie et archers à parts égales de puissance.
const MULTS = [0.5, 0.8, 1.2, 1.8];
const { armyPower } = await imp('src/systems/army.js');
const thOf = (s) => Object.values(s.city.buildings).find((b) => b.type === 'townhall').level;
function garrison(s, mult) {
  const target = 250 * thOf(s) * mult;
  const one = { spearman: armyPower({ spearman: 1 }), archer: armyPower({ archer: 1 }) };
  return { scout: s.army.scout || 0, spearman: Math.round(target / 2 / one.spearman), archer: Math.round(target / 2 / one.archer) };
}
const T = Date.UTC(2026, 6, 1, 12);

function raidOn(s, seed) {
  rng.setSource(mulberry32(seed));
  const p = Object.values(s.world.pois).find((x) => x.type === 'kingdom');
  const army = R.raidArmy(s, p, T);
  const raid = { id: 'sim' + seed, rival: p.rival, name: p.name, from: { x: p.x, y: p.y }, army, start: T - 3600e3, arrive: T, seen: true, flank: C.pickRaidFlank(s, () => rng.random()), flankSeen: true };
  if (SG?.raidEngines) Object.assign(raid, SG.raidEngines(s, p, army, T));
  return raid;
}
function defend(name, mult, mode) {
  const json = serialize(base[name]);
  let win = 0, breach = 0;
  for (let i = 0; i < N; i++) {
    const s = deserialize(json);
    s.army = garrison(s, mult);
    const raid = raidOn(s, 1000 + i);
    // Préparé : le raid est repéré par la tour de garde, le joueur applique la défense conseillée avec son arsenal
    if (mode === 'prepared' && SG) { s.raids = [raid]; SG.prepareDefense(s, T); s.raids = []; }
    R.resolveRaid(s, raid, T);
    const rep = s.reports[0];
    if (rep.win) win++;
    if (rep.breached) breach++;
  }
  return { win: Math.round((win / N) * 100), breach: Math.round((breach / N) * 100) };
}

const out = { version: SG ? 'v19' : 'avant v19', n: N, defense: {} };
for (const name of Object.keys(base)) for (const m of MULTS) {
  const k = `${name} ×${m}`;
  out.defense[k] = { idle: defend(name, m, 'idle') };
  if (SG) out.defense[k].prepared = defend(name, m, 'prepared');
}
if (SG && args.includes('--attack')) out.attack = SG.strategyGrid ? SG.strategyGrid(base.capitale, { n: Math.max(42, Math.round(N / 2)) }) : null;
console.log(JSON.stringify(out, null, 1));
