// Grosses commandes aux forgerons, personnages itinérants de la carte, missions cartographiques automatiques.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createNewState } from '../src/core/state.js';
import { advance } from '../src/core/engine.js';
import { serialize, deserialize } from '../src/core/save.js';
import { rng, mulberry32 } from '../src/core/rng.js';
import { FORGE_ORDERS } from '../src/data/items.js';
import { RARITY_ORDER } from '../src/data/heroes.js';
import { orderCost, orderStatus, startForgeOrder, startCraft, cancelCraft } from '../src/systems/crafting.js';
import { spawnNpc, npcTick, npcList, npcOffers, npcState, payBounty } from '../src/systems/npcs.js';
import { npcCap } from '../src/data/npcs.js';
import { sendMarch } from '../src/systems/marches.js';
import { resolveAny, describePending } from '../src/systems/pending.js';
import { SURVEYS, surveyStatus, startSurvey, surveyTick, recallSurvey, surveyCost } from '../src/systems/survey.js';
import { revealedCount, key } from '../src/systems/world.js';

const T0 = Date.UTC(2026, 6, 1, 8);
const H = 3600000;
const th = (s) => Object.values(s.city.buildings).find((b) => b.type === 'townhall');
const reload = (s) => deserialize(serialize(s));
function realm(seed, lvl = 10, forge = 10) {
  const s = createNewState({ seed, now: T0 });
  th(s).level = lvl;
  s.meta.lastTick = T0;
  if (forge) s.city.buildings.fg = { id: 'fg', type: 'forge', level: forge, x: 9, y: 9 };
  for (const r of Object.keys(s.resources)) s.resources[r] = 200000;
  return s;
}

test('Grosses commandes : coût et durée bien supérieurs, forge requise, paiement complet ou rien', () => {
  const s = realm('fo1');
  const small = orderCost(s, 'weapon', 'series'), big = orderCost(s, 'weapon', 'royal');
  assert.ok(big.gold > small.gold * 3 && big.steel > small.steel * 3);
  assert.ok(big.rareOre >= 6 && big.crystals >= 4);
  assert.ok(orderStatus(s, 'weapon', 'royal').time > 16 * H);
  // Forge trop basse
  const low = realm('fo1b', 10, 4);
  assert.match(orderStatus(low, 'weapon', 'large').reason, /Forge niv\. 6/);
  // Ressources insuffisantes : rien n'est payé
  const poor = realm('fo1c');
  poor.resources.steel = 10;
  const before = { ...poor.resources };
  assert.equal(startForgeOrder(poor, 'weapon', 'large', T0).ok, false);
  assert.deepEqual(poor.resources, before);
  // Commande passée : la forge est occupée (ni objet seul ni seconde commande)
  const gold = s.resources.gold;
  assert.ok(startForgeOrder(s, 'weapon', 'large', T0).ok);
  assert.equal(gold - s.resources.gold, orderCost(s, 'weapon', 'large').gold);
  assert.equal(startCraft(s, 'helmet', 'none', T0).ok, false);
  assert.equal(startForgeOrder(s, 'armor', 'series', T0).ok, false);
  // Annulation : 80 % rendus, comme une fabrication normale
  const q = s.queues.craft[0];
  const g1 = s.resources.gold;
  assert.ok(cancelCraft(s, q.id).ok);
  assert.equal(s.resources.gold - g1, Math.floor(q.cost.gold * 0.8));
});

test('Grosses commandes : livraison de tous les objets, rareté garantie, une seule fois', () => {
  rng.setSource(mulberry32(4));
  try {
    const s = realm('fo2');
    const n0 = s.inventory.items.length;
    assert.ok(startForgeOrder(s, 'armor', 'royal', T0).ok);
    const end = s.queues.craft[0].end;
    advance(s, end + 1000);
    const made = s.inventory.items.slice(n0);
    assert.equal(made.length, FORGE_ORDERS.royal.n);
    assert.ok(made.every((i) => i.slot === 'armor'));
    assert.ok(made.some((i) => RARITY_ORDER.indexOf(i.rarity) >= RARITY_ORDER.indexOf('epic')), 'au moins un épique');
    assert.equal(s.queues.craft.length, 0);
    advance(s, end + 2 * H);
    assert.equal(s.inventory.items.length, n0 + FORGE_ORDERS.royal.n, 'pas de seconde livraison');
  } finally { rng.setSource(null); }
});

test('Personnages : apparition plafonnée, départ à l’échéance, rien avant l’HdV 2', () => {
  rng.setSource(mulberry32(9));
  try {
    const s = realm('np1', 9);
    for (let i = 0; i < 40; i++) { npcState(s).nextAt = 0; npcTick(s, T0 + i * 1000); }
    const list = npcList(s, T0);
    assert.ok(list.length >= 3 && list.length <= npcCap(9), `${list.length}`);
    const last = Math.max(...list.map((p) => p.until));
    npcTick(s, last + 1);
    const ids = new Set(list.map((p) => p.id));
    assert.ok(!Object.values(s.world.pois).some((p) => ids.has(p.id)), 'tous repartis');
    const baby = realm('np1b', 1, 0);
    npcTick(baby, T0);
    assert.equal(npcList(baby, T0).length, 0);
  } finally { rng.setSource(null); }
});

test('Personnages : rencontre par une troupe, offre payée puis appliquée, offre impossible sans perte', () => {
  rng.setSource(mulberry32(12));
  try {
    const s = realm('np2', 8);
    s.army = { scout: 3, spearman: 10 };
    const poi = spawnNpc(s, T0, 'mercenary');
    assert.ok(poi);
    const r = sendMarch(s, { type: 'visit', x: poi.x, y: poi.y, units: { scout: 1 } }, T0);
    assert.ok(r.ok, r.reason);
    advance(s, r.march.arrive + 1000);
    const p = s.pending.find((x) => x.kind === 'npc');
    assert.ok(p, 'décision ouverte à l’arrivée');
    const d = describePending(s, p);
    assert.ok(d.choices.length >= 2);
    // Offre trop chère : rien n'est payé, la décision reste ouverte
    const gold = s.resources.gold;
    s.resources.gold = 10;
    assert.equal(resolveAny(s, p.id, 0, r.march.arrive + 2000).ok, false);
    assert.equal(s.resources.gold, 10);
    assert.ok(s.pending.some((x) => x.id === p.id));
    s.resources.gold = gold;
    const sw = s.army.swordsman || 0;
    assert.ok(resolveAny(s, p.id, 0, r.march.arrive + 3000).ok);
    assert.ok((s.army.swordsman || 0) > sw, 'mercenaires engagés');
    assert.ok(!s.world.pois[key(poi.x, poi.y)], 'marché conclu : il repart');
    assert.ok(!s.pending.some((x) => x.id === p.id));
  } finally { rng.setSource(null); }
});

test('Personnages : chaque type propose des offres valides ; prime payée une seule fois', () => {
  const s = realm('np3', 10);
  for (const k of ['peddler', 'hermit', 'mercenary', 'pilgrims', 'bountyHunter', 'smith', 'cartographer']) {
    const poi = spawnNpc(s, T0, k);
    assert.ok(poi, k);
    const offers = npcOffers(s, poi);
    assert.ok(offers.length >= 2, k);
    for (const o of offers) for (const v of Object.values(o.cost)) assert.ok(v > 0, `${k} : coût positif`);
  }
  npcState(s).bounties.push({ id: 'b1', x: 5, y: 5, name: 'Camp', at: T0, until: T0 + 24 * H, reward: { gold: 1000 } });
  const g = s.resources.gold;
  assert.ok(payBounty(s, 5, 5, T0 + H));
  assert.equal(payBounty(s, 5, 5, T0 + H), null);
  assert.ok(s.resources.gold > g);
});

test('Missions cartographiques : conditions, coût élevé, éclaireurs mobilisés puis rendus', () => {
  const s = realm('sv1', 3, 0);
  assert.match(surveyStatus(s, 'patrol').reason, /Hôtel de ville/);
  th(s).level = 8;
  s.army = { scout: 2 };
  assert.match(surveyStatus(s, 'patrol').reason, /éclaireurs/);
  s.army.scout = 20;
  const c = surveyCost(s, 'royal');
  assert.ok(c.gold >= 3000 * 8 && c.crystals >= 10, 'très coûteux');
  const gold = s.resources.gold;
  assert.ok(startSurvey(s, 'survey', T0).ok);
  assert.equal(s.army.scout, 20 - SURVEYS.survey.scouts);
  assert.equal(gold - s.resources.gold, surveyCost(s, 'survey').gold);
  assert.equal(startSurvey(s, 'patrol', T0).ok, false, 'une mission à la fois');
});

test('Missions cartographiques : révèlent la carte au fil des heures, y compris hors ligne, et comptent l’exploration', () => {
  rng.setSource(mulberry32(21));
  try {
    const s = realm('sv2', 8, 0);
    s.army = { scout: 20 };
    const r0 = revealedCount(s.world), e0 = s.stats.explored || 0;
    assert.ok(startSurvey(s, 'patrol', T0).ok);
    surveyTick(s, T0 + 2 * H);
    const mid = revealedCount(s.world);
    assert.ok(mid > r0, 'déjà des zones après 2 h');
    const b = reload(s);
    // Retour d'absence : tout est rattrapé d'un coup, puis les éclaireurs rentrent
    surveyTick(b, T0 + 9 * H);
    assert.ok(revealedCount(b.world) > mid);
    assert.equal(b.survey.active, null);
    assert.ok((b.stats.explored || 0) > e0);
    const h = b.survey.history[0];
    assert.ok(h.zones >= 10, `${h.zones} zones`);
    assert.equal(b.army.scout, 20 - SURVEYS.patrol.scouts + (SURVEYS.patrol.scouts - h.lost));
    assert.ok(h.lost <= Math.floor(SURVEYS.patrol.scouts / 3));
    // Rappel anticipé : éclaireurs rendus, zones acquises
    assert.ok(startSurvey(b, 'patrol', T0 + 10 * H).ok);
    surveyTick(b, T0 + 11 * H);
    assert.ok(recallSurvey(b, T0 + 11 * H).ok);
    assert.equal(b.survey.active, null);
  } finally { rng.setSource(null); }
});

test('Sauvegardes : anciennes parties sans personnages ni missions cartographiques', () => {
  const s = realm('sv3', 8);
  const raw = JSON.parse(serialize(s));
  const st = raw.state || raw;
  delete st.npcs; delete st.survey;
  const b = deserialize(JSON.stringify(raw));
  npcTick(b, T0 + H); surveyTick(b, T0 + H);
  advance(b, T0 + 2 * H);
  assert.ok(Array.isArray(b.npcs.bounties));
  assert.equal(b.survey.active, null);
});
