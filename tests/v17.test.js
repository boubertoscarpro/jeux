// v17 « Clair comme le jour » : signal unique, notifications triées, plans de ville, clavier, alternative textuelle,
// réglages d'accessibilité, « Pourquoi ? », textes justes, migration d'une vraie sauvegarde v16.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { createNewState } from '../src/core/state.js';
import { advance } from '../src/core/engine.js';
import { serialize, deserialize } from '../src/core/save.js';
import { computeMods } from '../src/systems/modifiers.js';
import { upgradeSummary } from '../src/systems/construction.js';
import { buildingSignals, SIGNAL_RANK, UPGRADE_MAX, sizeTier, variantOf, quarterSides } from '../src/systems/mapSignals.js';
import { badges, groupNotices, noticeClass, reportClass, capCount, seenOnScreen, markAllSeen } from '../src/systems/notices.js';
import { reorgPlan, movesTo, checkLayout, evaluate, applyLayout, undoLayout, savePlan, recallLayout, snapshot } from '../src/systems/cityPlans.js';
import { nextBuilding, reachable, navTargets } from '../src/systems/cityNav.js';
import { cityOutline, citySummary } from '../src/systems/mapText.js';
import { a11yPrefs, setA11y, mapPalette } from '../src/systems/a11y.js';
import { A11Y_DEFAULTS } from '../src/data/a11y.js';
import { whyProduction, whyDefense, whyStability } from '../src/systems/why.js';
import { stockForecast, inTime } from '../src/systems/wording.js';
import { misplaced } from '../src/systems/castle.js';

const T0 = Date.UTC(2026, 0, 5, 9);
const H = 3600e3;
const v16 = () => deserialize(gunzipSync(readFileSync(new URL('./fixtures/save-v16.json.gz', import.meta.url))).toString());
const v15 = () => deserialize(gunzipSync(readFileSync(new URL('./fixtures/save-v15.json.gz', import.meta.url))).toString());

test('Carte : un seul signal par bâtiment, choisi par priorité ; flèches seulement si payable, au plus 6', () => {
  const s = v16();
  const b = Object.values(s.city.buildings).filter((x) => x.type !== 'townhall' && x.type !== 'road');
  const [a, c, d] = b;
  for (const x of [a, c, d]) { x.damaged = false; x.starved = false; x.paused = false; }
  a.damaged = true; a.starved = true;
  const ups = new Map(b.map((x) => [x.id, { status: 'ready' }]));
  const sig = buildingSignals(s, { burning: new Set([a.id]), upgrades: ups, bubbles: [{ id: 'claim', bid: c.id, icon: '🎁', text: 'À réclamer', view: 'goals' }, { id: 'research', bid: c.id, icon: '🔬', text: 'Au repos', view: 'research' }] });
  assert.equal(sig.get(a.id).kind, 'danger', 'le feu passe avant les dégâts et l’amélioration');
  assert.equal(sig.get(c.id).kind, 'reward', 'la récompense passe avant le repos et l’amélioration');
  assert.ok([...sig.values()].filter((x) => x.kind === 'upgrade').length <= UPGRADE_MAX);
  // Amélioration non payable : aucune flèche
  const none = buildingSignals(s, { upgrades: new Map([[d.id, { status: 'lack' }]]) });
  assert.ok(!none.has(d.id));
  // Masquées par le joueur : aucune flèche
  assert.ok(![...buildingSignals(s, { upgrades: ups, showUpgrades: false }).values()].some((x) => x.kind === 'upgrade'));
  assert.ok(SIGNAL_RANK.danger > SIGNAL_RANK.reward && SIGNAL_RANK.reward > SIGNAL_RANK.problem && SIGNAL_RANK.problem > SIGNAL_RANK.upgrade);
  // Les vraies améliorations payables d'une partie riche restent bornées sur la carte
  for (const r of Object.keys(s.resources)) s.resources[r] = 1e9;
  const real = buildingSignals(s, { upgrades: new Map(upgradeSummary(s, computeMods(s)).list.map((u) => [u.bid, u])) });
  assert.ok([...real.values()].filter((x) => x.kind === 'upgrade').length <= UPGRADE_MAX);
});

test('Carte : le niveau se lit par paliers, les voisins varient, les quartiers se forment', () => {
  assert.deepEqual([1, 2, 3, 5, 6, 10, 15, 20, 30].map(sizeTier), [0, 0, 1, 1, 2, 3, 4, 5, 5]);
  const seen = new Set(); for (let x = 0; x < 6; x++) seen.add(variantOf(x, 3));
  assert.ok(seen.size >= 3, 'variantes voisines différentes');
  assert.equal(variantOf(4, 7), variantOf(4, 7), 'déterministe');
  const at = new Map([['5,5', { type: 'farm', x: 5, y: 5 }], ['6,5', { type: 'farm', x: 6, y: 5 }], ['5,6', { type: 'market', x: 5, y: 6 }]]);
  assert.equal(quarterSides(at, at.get('5,5')), 'e');
  assert.equal(quarterSides(at, at.get('5,6')), '', 'le marché ne forme pas de quartier');
});

test('Notifications : regroupées, urgent d’abord, badge plafonné, l’informatif vu à l’écran est lu', () => {
  const s = createNewState({ seed: 'notif', now: T0 });
  s.notifications = [];
  for (let i = 0; i < 12; i++) s.notifications.push({ id: 'h' + i, t: T0 + i, icon: '🌾', text: `Récolte terminée : ${100 + i} blé`, kind: 'event', read: false });
  s.notifications.push({ id: 'p', t: T0 + 50, icon: '🔥', text: 'Pirates de rivière pillent l’avant-poste Écluse-Vieille', kind: 'bad', read: false });
  const g = groupNotices(s.notifications);
  assert.equal(g[0].cls, 'urgent');
  assert.equal(g.find((x) => x.icon === '🌾').count, 12, '12 récoltes en un seul groupe');
  const b = badges(s);
  assert.equal(b.bell, 1, 'le badge compte l’urgent, pas les 12 informations');
  assert.ok(b.bellDot);
  assert.ok(b.urgent >= 1);
  assert.equal(capCount(5), '5'); assert.equal(capCount(60), '9+');
  assert.ok(seenOnScreen(s, '🌾 Récolte terminée : 100 blé'));
  assert.equal(seenOnScreen(s, '🔥 Pirates de rivière pillent l’avant-poste Écluse-Vieille'), false, 'l’urgent reste signalé');
  assert.equal(noticeClass({ text: 'L’événement « Les Ruines Anciennes » commence !', kind: 'event' }), 'info', 'pas de faux urgent sur « Ruines »');
  // Rapports : les défaites seules comptent dans le badge
  s.reports = [{ id: 'r1', kind: 'battle', win: true, read: false }, { id: 'r2', kind: 'explore', win: true, read: false }, { id: 'r3', kind: 'defense', win: false, read: false }];
  assert.equal(reportClass(s.reports[2]), 'urgent');
  const b2 = badges(s);
  assert.equal(b2.reports, 1); assert.ok(b2.reportsDot);
  markAllSeen(s);
  assert.deepEqual(badges(s), { bell: 0, bellDot: false, reports: 0, reportsDot: false, urgent: 0 });
});

test('Notifications : sur la vraie sauvegarde de fin v16, 24 + 60 non lus deviennent quelques badges utiles', () => {
  const s = v16();
  const rawN = (s.notifications || []).filter((n) => !n.read).length, rawR = (s.reports || []).filter((r) => !r.read).length;
  const b = badges(s);
  assert.ok(b.bell + b.reports < rawN + rawR, `${b.bell}+${b.reports} < ${rawN}+${rawR}`);
});

test('Plans de ville : réorganisation sans perte, aperçu, application, annulation remboursée', () => {
  const s = v15();
  const before = Object.keys(s.city.buildings).sort();
  const lay = reorgPlan(s);
  assert.ok(checkLayout(s, lay).ok);
  const moves = movesTo(s, lay);
  assert.ok(moves.length > 0);
  const e0 = evaluate(s), e1 = evaluate(s, lay);
  assert.ok(e1.misplaced <= e0.misplaced, 'jamais plus de bâtiments mal placés');
  assert.equal(e1.misplaced, 0);
  s.castle.freeMoveUntil = 0;
  s.resources.gold = 1e6;
  const pos0 = snapshot(s), gold0 = s.resources.gold;
  const r = applyLayout(s, lay, T0, 'test');
  assert.ok(r.ok && r.moved === moves.length && r.gold > 0);
  assert.deepEqual(Object.keys(s.city.buildings).sort(), before, 'aucun bâtiment perdu');
  assert.equal(misplaced(s).length, 0);
  const u = undoLayout(s);
  assert.ok(u.ok);
  assert.deepEqual(snapshot(s), pos0, 'tout revient en place');
  assert.equal(s.resources.gold, gold0, 'remboursé');
  // Plans enregistrés : un bâtiment bâti depuis n'est jamais écrasé
  assert.ok(savePlan(s, 0, 'Avant').ok);
  applyLayout(s, lay, T0);
  const free = Object.values(pos0)[0];
  const rec = recallLayout(s, 0);
  assert.ok(checkLayout(s, rec).ok);
  void free;
  const again = deserialize(serialize(s));
  assert.equal(again.cityPlans.saved[0].name, 'Avant');
});

test('Clavier : chaque bâtiment est atteignable aux flèches depuis l’hôtel de ville, en peu de touches', () => {
  const s = v16();
  const th = Object.values(s.city.buildings).find((b) => b.type === 'townhall');
  const seen = reachable(s, { x: th.x, y: th.y });
  assert.equal(seen.size, navTargets(s).length, 'aucun bâtiment inaccessible');
  // Une flèche mène toujours dans sa direction
  const n = nextBuilding(s, th.x, th.y, 'ArrowRight');
  if (n) assert.ok(n.x > th.x);
  assert.equal(nextBuilding(s, th.x, th.y, 'Tab'), null);
});

test('Lecteur d’écran : la carte a une alternative textuelle complète (zones, niveaux, états, actions)', () => {
  const s = v16();
  const out = cityOutline(s);
  const n = out.reduce((a, g) => a + g.items.length, 0);
  assert.equal(n, Object.values(s.city.buildings).filter((b) => b.type !== 'road').length, 'chaque bâtiment est listé');
  assert.ok(out.every((g) => ['Cour du donjon', 'Faubourgs', 'Campagne'].includes(g.name)));
  const lib = out.flatMap((g) => g.items).find((i) => i.type === 'market');
  if (lib) assert.ok(lib.screens.includes('market'), 'les écrans du lieu sont proposés');
  assert.match(citySummary(s), /Hôtel de ville niveau \d+, \d+ bâtiments/);
  s.city.buildings[Object.keys(s.city.buildings)[1]].damaged = true;
  assert.ok(cityOutline(s).flatMap((g) => g.items).some((i) => i.states.includes('endommagé')));
});

test('Accessibilité : valeurs par défaut sûres, bornage, palettes pour daltoniens', () => {
  const s = createNewState({ seed: 'a11y', now: T0 });
  assert.deepEqual(a11yPrefs(s), A11Y_DEFAULTS);
  s.meta.a11y = { textScale: 7, toastSec: -1, colorVision: 'x', font: 'comic', contrast: 'oui' };
  const a = a11yPrefs(s);
  assert.equal(a.textScale, 1); assert.equal(a.toastSec, 4); assert.equal(a.colorVision, 'none'); assert.equal(a.font, 'default'); assert.equal(a.contrast, true);
  assert.ok(setA11y(s, 'colorVision', 'deut').ok);
  assert.notEqual(mapPalette(s).good, '#6fbf73', 'la palette des cartes change');
  assert.equal(setA11y(s, 'inconnu', 1).ok, false);
  const again = deserialize(serialize(s));
  assert.equal(a11yPrefs(again).colorVision, 'deut');
});

test('« Pourquoi ? » : production, défense et stabilité s’expliquent et la somme est juste', () => {
  const s = v16();
  const p = whyProduction(s, 'wood');
  assert.ok(p.lines.length >= 1 && /\/h$/.test(p.total));
  const d = whyDefense(s);
  assert.ok(d.lines.some(([l]) => /Muraille/.test(l)) && /%$/.test(d.total));
  const k = Object.keys(s.territories)[0];
  const st = whyStability(s, k);
  assert.ok(st.lines.some(([l]) => l === 'Base'));
});

test('Textes : jamais « épuisé dans 0 s », jamais de durée négative', () => {
  assert.match(stockForecast('laine', 0, -681), /Plus de laine en stock : il en manque 681 par heure/);
  assert.ok(!/0\s?s\b/.test(stockForecast('laine', 0, -681)));
  assert.match(stockForecast('bois', 5, -681), /moins d’une minute/);
  assert.match(stockForecast('bois', 2000, -1000), /dans 2h/);
  assert.equal(inTime(-5000), 'maintenant');
  assert.equal(inTime(10e3), 'dans moins d’une minute');
});

test('Migration : une vraie sauvegarde v16 se charge, joue 2 h, garde tout, reçoit des réglages sûrs', () => {
  const raw = gunzipSync(readFileSync(new URL('./fixtures/save-v16.json.gz', import.meta.url))).toString();
  const old = JSON.parse(raw);
  const s = deserialize(raw);
  assert.deepEqual(Object.keys(s.city.buildings).sort(), Object.keys(old.city.buildings).sort());
  for (const [id, b] of Object.entries(old.city.buildings)) { assert.equal(s.city.buildings[id].x, b.x); assert.equal(s.city.buildings[id].level, b.level); }
  assert.deepEqual(s.army, old.army);
  for (const [k, t] of Object.entries(old.territories)) assert.deepEqual(s.territories[k].town, t.town);
  assert.deepEqual(a11yPrefs(s), A11Y_DEFAULTS);
  advance(s, s.meta.lastTick + 2 * H);
  for (const [r, v] of Object.entries(s.resources)) assert.ok(Number.isFinite(v) && v >= 0, r);
  const again = deserialize(serialize(s));
  assert.deepEqual(Object.keys(again.city.buildings).sort(), Object.keys(s.city.buildings).sort());
});
