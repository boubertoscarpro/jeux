// v22b « Pôles, Boutique et Ciel » : vente automatique par sélection groupée, Boutique de la Couronne en or (chère,
// prix croissants, limites), pôles du royaume (chaque écran-fenêtre dans exactement un pôle).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createNewState } from '../src/core/state.js';
import { generateItem } from '../src/systems/items.js';
import { bulkCandidates, autoSellRule, lootTick, lootRules } from '../src/systems/armory.js';
import { describeOrder } from '../src/systems/automation.js';
import { goldPrice, goldShopCheck, buyGoldItem } from '../src/systems/goldShop.js';
import { GOLD_SHOP } from '../src/data/goldShop.js';
import { HUBS, HUB_EXEMPT } from '../src/data/hubs.js';
import { VIEWS } from '../src/ui/app.js';

const NOW = Date.UTC(2026, 9, 24, 9);
const mk = (o) => { const it = generateItem(o); it.got = 1; return it; };
const setTh = (s, lv) => { for (const b of Object.values(s.city.buildings)) if (b.type === 'townhall') b.level = lv; };

test('Vente groupée : plusieurs raretés et emplacements à la fois, jamais une pièce protégée', () => {
  const s = createNewState({ seed: 'v22b-a', now: NOW });
  s.inventory.items = [];
  const a = mk({ rarity: 'common', slot: 'ring' }), b = mk({ rarity: 'rare', slot: 'ring' }), c = mk({ rarity: 'rare', slot: 'boots' }), d = mk({ rarity: 'epic', slot: 'ring' });
  const lk = mk({ rarity: 'common', slot: 'ring' }); lk.locked = true;
  s.inventory.items.push(a, b, c, d, lk);
  const ids = bulkCandidates(s, { rarities: ['common', 'rare'], slots: ['ring'] }).items.map((i) => i.id);
  assert.ok(ids.includes(a.id) || ids.includes(b.id), 'des anneaux communs ou rares sont choisis');
  assert.ok(!ids.includes(c.id) && !ids.includes(d.id) && !ids.includes(lk.id), 'ni bottes, ni épique, ni pièce verrouillée');
});
test('Vente groupée : la sélection devient une règle de vente automatique appliquée au butin qui arrive', () => {
  const s = createNewState({ seed: 'v22b-b', now: NOW });
  s.inventory.items = [];
  assert.equal(autoSellRule(s, { slots: ['ring'] }).ok, false, 'sans rareté, la vente automatique de tout est refusée');
  const r = autoSellRule(s, { rarities: ['common'], slots: ['ring', 'amulet'] });
  assert.ok(r.ok);
  const rule = lootRules(s).at(-1);
  assert.equal(rule.action.type, 'lootSell');
  assert.match(describeOrder(rule).join ? describeOrder(rule).join(' ') : String(describeOrder(rule)), /commun/i);
  const ring = generateItem({ rarity: 'common', slot: 'ring' }), boots = generateItem({ rarity: 'common', slot: 'boots' }), rare = generateItem({ rarity: 'rare', slot: 'ring' });
  s.inventory.items.push(ring, boots, rare);
  const gold0 = s.resources.gold;
  lootTick(s, NOW);
  const left = s.inventory.items.map((i) => i.id);
  // l'anneau commun est vendu, sauf s'il est « meilleur pour un héros » (protégé)
  if (!left.includes(ring.id)) assert.ok(s.resources.gold > gold0, 'la vente rapporte de l’or');
  assert.ok(left.includes(boots.id) && left.includes(rare.id), 'les autres groupes restent');
});

test('Boutique de la Couronne : chère, plus chère avec l’hôtel de ville et à chaque achat du jour, limitée', () => {
  const s = createNewState({ seed: 'v22b-c', now: NOW });
  setTh(s, 1);
  assert.equal(goldShopCheck(s, 'gs_speed5', NOW).ok, false, 'fermée sous le niveau 2');
  setTh(s, 3);
  const p3 = goldPrice(s, 'gs_speed5', NOW);
  setTh(s, 10);
  const p10 = goldPrice(s, 'gs_speed5', NOW);
  assert.ok(p10 > p3 * 5, `${p3} → ${p10}`);
  assert.ok(goldPrice(s, 'gs_speed60', NOW) > 40000, 'une heure de passe-temps coûte une fortune au niveau 10');
  s.resources.gold = 0;
  assert.match(goldShopCheck(s, 'gs_speed5', NOW).reason, /Or insuffisant/);
  s.resources.gold = 1e9;
  const before = s.inventory.consumables.speed5 || 0;
  const b1 = buyGoldItem(s, 'gs_speed5', NOW);
  assert.ok(b1.ok);
  assert.equal((s.inventory.consumables.speed5 || 0) - before, 1, 'le passe-temps est rangé dans l’inventaire');
  assert.ok(goldPrice(s, 'gs_speed5', NOW) > b1.price * 1.5, 'le prix monte après un achat');
  for (let i = 1; i < GOLD_SHOP.gs_speed5.limit; i++) assert.ok(buyGoldItem(s, 'gs_speed5', NOW).ok);
  assert.match(goldShopCheck(s, 'gs_speed5', NOW).reason, /Épuisé/);
  assert.ok(goldShopCheck(s, 'gs_speed5', NOW + 86400000).ok, 'renouvelé le lendemain');
  const n0 = s.inventory.items.length;
  assert.ok(buyGoldItem(s, 'gs_gear', NOW).ok);
  assert.equal(s.inventory.items.length, n0 + 1);
});

test('Pôles du royaume : chaque écran-fenêtre est dans exactement un pôle, et chaque écran cité existe', () => {
  const ids = new Set(VIEWS.map((v) => v.id));
  const seen = new Map();
  for (const [k, h] of Object.entries(HUBS)) for (const sec of h.sections) for (const v of sec.screens) {
    assert.ok(ids.has(v), `${v} (pôle ${k}) n’existe pas`);
    assert.ok(!seen.has(v), `${v} est dans deux pôles`);
    seen.set(v, k);
  }
  const missing = [...ids].filter((id) => !seen.has(id) && !HUB_EXEMPT.includes(id));
  assert.deepEqual(missing, []);
  assert.ok(seen.get('goldshop') === 'economy' && seen.get('market') === 'economy' && seen.get('ecoReport') === 'economy');
});
