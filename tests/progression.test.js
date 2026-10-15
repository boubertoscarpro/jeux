// Excédents et blocages : les actions proposées sont réalisables et économiquement cohérentes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createNewState } from '../src/core/state.js';
import { computeMods } from '../src/systems/modifiers.js';
import { storageCap, canAfford } from '../src/systems/economy.js';
import { surplusPlan, cappedResources, SELL_MIN_RATIO } from '../src/systems/surplus.js';
import { analyze } from '../src/systems/advisor.js';
import { nextBlocker } from '../src/systems/blockers.js';
import { BUILDINGS } from '../src/data/buildings.js';
import { RESOURCES } from '../src/data/resources.js';
import { MISSIONS } from '../src/systems/campaign.js';

const T0 = Date.UTC(2026, 6, 1, 8);
const th = (s) => Object.values(s.city.buildings).find((b) => b.type === 'townhall');
function full(seed, r = 'wood') {
  const s = createNewState({ seed, now: T0 });
  th(s).level = 6;
  s.city.buildings.mk = { id: 'mk', type: 'market', level: 3, x: 9, y: 4 };
  for (const k of ['stone', 'gold', 'iron', 'food']) s.resources[k] = 3000;
  s.resources[r] = storageCap(s, computeMods(s, T0), r);
  return s;
}

test('Excédents : une ressource pleine est détectée et chaque action réalisable est vraiment abordable', () => {
  const s = full('sp1');
  assert.ok(cappedResources(s).some((x) => x.r === 'wood'));
  const plan = surplusPlan(s, 'wood', T0);
  assert.ok(plan.length >= 2);
  // Toute action « réalisable » qui coûte quelque chose est payable avec les stocks actuels
  for (const a of plan.filter((x) => x.feasible && x.cost)) assert.ok(canAfford(s, a.cost), a.label);
  assert.ok(plan.some((a) => a.feasible && a.cost), 'au moins une action payante réalisable');
  // les actions réalisables sont classées avant les autres
  const firstBad = plan.findIndex((a) => !a.feasible);
  if (firstBad >= 0) assert.ok(plan.slice(firstBad).every((a) => !a.feasible));
});

test('Excédents : une chaîne en pause est proposée en priorité, et la transformation crée de la valeur', () => {
  const s = full('sp2');
  s.city.buildings.ch = { id: 'ch', type: 'charcoal', level: 2, x: 3, y: 3, paused: true };
  const plan = surplusPlan(s, 'wood', T0);
  const chain = plan.find((a) => a.kind === 'chain');
  assert.ok(chain && chain.feasible && /Relancer/.test(chain.label));
  // Toute suggestion de nouvel atelier transforme vers une valeur supérieure
  for (const a of plan.filter((x) => x.kind === 'convert')) {
    const c = BUILDINGS[a.type].convert;
    const v = (o) => Object.entries(o).reduce((t, [r, n]) => t + n * RESOURCES[r].price, 0);
    assert.ok(v(c.out) > v(c.in), a.label);
  }
});

test('Excédents : la vente n’est conseillée que si le cours est correct', () => {
  const s = full('sp3');
  s.market.prices.wood = RESOURCES.wood.price * 0.3;
  const low = surplusPlan(s, 'wood', T0).find((a) => a.kind === 'sell');
  assert.ok(low && !low.feasible && low.ratio < SELL_MIN_RATIO);
  s.market.prices.wood = RESOURCES.wood.price * 1.2;
  const ok = surplusPlan(s, 'wood', T0).find((a) => a.kind === 'sell');
  assert.ok(ok.feasible && ok.ratio >= SELL_MIN_RATIO);
});

test('Conseiller : un entrepôt plein donne une action utile et réalisable (pas seulement « vendez »)', () => {
  const s = full('sp4');
  s.city.buildings.ch = { id: 'ch', type: 'charcoal', level: 2, x: 3, y: 3, paused: true };
  const rec = analyze(s, T0).recs.find((r) => /Entrepôt plein pour/.test(r.text));
  assert.ok(rec, 'recommandation présente');
  assert.match(rec.text, /relancer/i);
});

test('Blocages : l’étape « Marché » explique le prérequis manquant et propose une action selon le style', () => {
  const s = createNewState({ seed: 'bl', now: T0, kingdomType: 'pioneers' });
  th(s).level = 1;
  const m = MISSIONS.q_market;
  const b = nextBlocker(s, m, T0);
  assert.equal(b.type, 'market');
  assert.equal(b.kind, 'blocked');
  assert.match(b.text, /Marché requis/);
  assert.ok(b.solutions.length >= 1);
  assert.equal(b.style, 'explore');
  th(s).level = 10;
  for (const r of Object.keys(s.resources)) s.resources[r] = 0;
  const b2 = nextBlocker(s, m, T0);
  assert.match(b2.text, /il manque/);
  for (const r of Object.keys(s.resources)) s.resources[r] = 99999;
  assert.equal(nextBlocker(s, m, T0).kind, 'ready');
});

// ───────── Conseil appliqué en un clic, trêve après défaites ─────────
import { applySurplus } from '../src/systems/surplus.js';
import { resolveRaid, RAID_TRUCE_H, RAID_LOST_GRACE_H } from '../src/systems/rivals.js';

test('Excédents : « Appliquer » exécute la meilleure action réalisable (et rien si aucune ne l’est)', () => {
  const s = full('ap1');
  s.city.buildings.ch = { id: 'ch', type: 'charcoal', level: 2, x: 3, y: 3, paused: true };
  const r = applySurplus(s, 'wood', T0);
  assert.ok(r.ok, r.reason);
  assert.equal(s.city.buildings.ch.paused, false);
  const rec = analyze(s, T0).recs.find((x) => x.apply === 'wood');
  assert.ok(!rec || rec.applyLabel, 'bouton nommé selon l’action');
  const empty = createNewState({ seed: 'ap2', now: T0 });
  for (const k of Object.keys(empty.resources)) empty.resources[k] = 0;
  assert.equal(applySurplus(empty, 'wood', T0).ok, false);
});

test('Raids : défaites d’affilée → trêve plus longue ; une victoire remet le compteur à zéro', () => {
  const s = createNewState({ seed: 'rd', now: T0 });
  s.army = {};
  const raid = (t) => ({ id: 'r' + t, rival: 0, name: 'Pillards', army: { royalKnight: 200, guard: 200 }, arrive: t });
  resolveRaid(s, raid(T0), T0);
  const c1 = s.raidCooldown - T0;
  resolveRaid(s, raid(T0 + 1), T0 + 1);
  const c2 = s.raidCooldown - (T0 + 1);
  resolveRaid(s, raid(T0 + 2), T0 + 2);
  const c3 = s.raidCooldown - (T0 + 2);
  assert.equal(c1, (RAID_TRUCE_H + RAID_LOST_GRACE_H) * 3600000);
  assert.ok(c2 > c1 && c3 > c2);
  assert.ok(!Object.values(s.world.pois).some((p) => p.type === 'kingdom' && p.anger > 0), 'un pillage réussi n’attise plus la colère du pillard');
  s.army = { knight: 3000 };
  resolveRaid(s, { id: 'w', rival: 0, name: 'P', army: { militia: 5 }, arrive: T0 + 3 }, T0 + 3);
  assert.equal(s.raidLossStreak, 0);
});
