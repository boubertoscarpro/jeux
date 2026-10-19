// v18 « L'Armurerie » : valeur par rôle, équipement automatique, vente et démantèlement, plafond de gemmes, règles de
// tri, plafond d'inventaire sans perte silencieuse, châsses et gemmes, ensembles, tenues, transmutation, réforge,
// confort (tout réclamer, compositions) et migration d'une vraie sauvegarde v17.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { deserialize, serialize } from '../src/core/save.js';
import { advance } from '../src/core/engine.js';
import { rng, mulberry32 } from '../src/core/rng.js';
import { generateItem, itemMods, salvageYield, upgradeCost } from '../src/systems/items.js';
import { createHero, heroMods } from '../src/systems/heroes.js';
import { assignGovernor } from '../src/systems/tavern.js';
import * as A from '../src/systems/armory.js';
import { GEM_DAILY, GEM_GOLD, SOCKETS, CUT_COST } from '../src/data/armory.js';
import { CRAFT_RECIPES } from '../src/data/items.js';
import { addOrder } from '../src/systems/automation.js';
import { saveArmyPreset, presetUnits, maintainArmy, claimAll, claimables } from '../src/systems/comfort.js';

const load = (f) => deserialize(gunzipSync(readFileSync(new URL(`./fixtures/${f}.json.gz`, import.meta.url))).toString());
const T = Date.UTC(2026, 5, 1, 12);
const mk = (o) => { const it = generateItem(o); it.got = 1; return it; };
// Petit royaume maîtrisé : 2 héros (un intendant agricole, un général), inventaire choisi
function lab() {
  rng.setSource(mulberry32(42));
  const s = load('save-v17');
  s.inventory.items = [];
  const g = createHero({ cls: 'general', rarity: 'rare', level: 10 });
  const f = createHero({ cls: 'farmer', rarity: 'rare', level: 10 });
  s.heroes = [g, f];
  assignGovernor(s, f.id, 'food');
  return { s, g, f };
}

test('Valeur par rôle : un objet de commandant ne sert à rien à un intendant, et inversement', () => {
  const { s, g, f } = lab();
  const sword = mk({ baseKey: 'generalSword', rarity: 'epic', ilvl: 10 });
  const smock = mk({ baseKey: 'farmerSmock', rarity: 'epic', ilvl: 10 });
  s.inventory.items.push(sword, smock);
  assert.ok(A.itemGain(s, g, sword) > 5, 'l’épée profite au général');
  assert.ok(A.itemGain(s, g, sword) > A.itemGain(s, f, sword) * 3, 'beaucoup plus qu’à l’intendant');
  assert.ok(A.itemGain(s, f, smock) > A.itemGain(s, g, smock), 'le tablier profite à l’intendant agricole');
  // Le gain est bien la différence de heroMods avec et sans l'objet
  const before = heroMods(s, g, 'commander')['combat.atk'] || 0;
  g.equipment.weapon = sword.id; sword.equippedBy = g.id;
  assert.ok((heroMods(s, g, 'commander')['combat.atk'] || 0) > before);
});

test('Équipement automatique : priorités, verrous, réservations, reprise et annulation', () => {
  const { s, g, f } = lab();
  const a = mk({ baseKey: 'generalSword', rarity: 'legendary', ilvl: 20 });
  const b = mk({ baseKey: 'generalSword', rarity: 'common', ilvl: 1 });
  const locked = mk({ baseKey: 'plateArmor', rarity: 'legendary', ilvl: 20 }); locked.locked = true;
  s.inventory.items.push(a, b, locked);
  // Le général en priorité (ordre personnalisé) reçoit la meilleure épée
  A.setPriority(s, 'custom', [g.id, f.id]);
  const plan = A.planAutoEquip(s);
  const wg = plan.changes.find((c) => c.heroId === g.id && c.slot === 'weapon');
  assert.equal(wg.to, a.id);
  assert.ok(!plan.changes.some((c) => c.to === locked.id), 'un objet verrouillé ne bouge jamais');
  assert.ok(plan.total > 0);
  const snap = JSON.stringify(s.heroes.map((h) => h.equipment));
  assert.ok(A.applyAutoEquip(s, plan, T).ok);
  assert.equal(g.equipment.weapon, a.id);
  assert.equal(A.planAutoEquip(s).changes.length, 0, 'idempotent');
  // Annuler rend l'équipement d'avant
  assert.ok(A.undoLast(s, T + 1000).ok);
  assert.equal(JSON.stringify(s.heroes.map((h) => h.equipment)), snap);
  // Réservation : la pièce réservée reste à son héros même si un autre, plus prioritaire, la voudrait
  A.applyAutoEquip(s, A.planAutoEquip(s), T);
  A.setPriority(s, 'custom', [f.id, g.id]);
  assert.ok(A.toggleReserve(s, a.id).reserved);
  assert.ok(!A.planAutoEquip(s).changes.some((c) => c.from === a.id || (c.to === a.id && c.heroId !== g.id)));
  // Sans reprise autorisée, aucune pièce portée ne change de héros
  A.toggleReserve(s, a.id);
  A.setArmoryOption(s, 'allowSteal', false);
  assert.ok(!A.planAutoEquip(s).changes.some((c) => c.to === a.id));
});

test('Équipement automatique instantané avec 300 objets et 12 héros', () => {
  const s = load('save-armurerie');
  const t0 = performance.now();
  const plan = A.planAutoEquip(s);
  const ms = performance.now() - t0;
  assert.ok(plan.changes.length > 20);
  assert.ok(ms < 400, `${ms.toFixed(0)} ms`);
  const t1 = performance.now();
  A.bestForMap(s);
  assert.ok(performance.now() - t1 < 200);
});

test('Démanteler : métal et matériaux cohérents avec la recette, sans or ; vendre : or et gemmes', () => {
  rng.setSource(mulberry32(7));
  const c = mk({ baseKey: 'generalSword', rarity: 'common', ilvl: 1 });
  const e = mk({ baseKey: 'generalSword', rarity: 'epic', ilvl: 10 }); e.plus = 4;
  const y = salvageYield(c);
  assert.ok(!y.gold);
  assert.ok(y.steel > 0 && y.steel < CRAFT_RECIPES.weapon.cost.steel, 'moins que la recette');
  const ye = salvageYield(e);
  assert.ok(ye.steel > y.steel && ye.crystals >= 1);
  // 30 % de l'acier d'amélioration investi revient
  let up = 0; for (let p = 0; p < 4; p++) up += upgradeCost({ ...e, plus: p }).steel;
  assert.ok(ye.steel >= Math.floor(up * 0.3));
  const { s } = lab();
  const ring = mk({ baseKey: 'goldRing', rarity: 'epic', ilvl: 5 });
  const v = A.sellValue(s, ring);
  assert.ok(v.gold > 0 && v.gems >= 2, 'un bijou épique rend des gemmes');
  assert.equal(A.sellValue(s, c).gems, 0);
});

test('Vente en masse : aperçu, plafond quotidien de gemmes, protections et annulation', () => {
  const { s, g } = lab();
  s.resources.gems = 0; s.resources.gold = 0;
  const rings = Array.from({ length: 6 }, () => mk({ baseKey: 'goldRing', rarity: 'legendary', ilvl: 3 }));
  const worn = mk({ baseKey: 'generalSword', rarity: 'rare', ilvl: 2 });
  const lk = mk({ baseKey: 'wolfRing', rarity: 'rare', ilvl: 2 }); lk.locked = true;
  s.inventory.items.push(...rings, worn, lk);
  g.equipment.weapon = worn.id; worn.equippedBy = g.id;
  const pv = A.bulkPreview(s, { slot: 'ring' }, 'sell', T);
  assert.ok(pv.kept.verrouillé >= 1);
  assert.ok(!pv.items.includes(lk) && !pv.items.includes(worn));
  const raw = pv.items.reduce((n, it) => n + A.sellValue(s, it).gems, 0);
  assert.equal(pv.res.gems || 0, Math.min(GEM_DAILY, raw), 'gemmes plafonnées par jour');
  assert.equal(pv.gemsToGold, raw - Math.min(GEM_DAILY, raw));
  const n0 = s.inventory.items.length;
  const r = A.bulkApply(s, { slot: 'ring' }, 'sell', T);
  assert.ok(r.ok && r.n === pv.n);
  assert.equal(Math.round(s.resources.gems), pv.res.gems || 0);
  assert.ok(s.inventory.items.includes(lk) && s.inventory.items.includes(worn));
  // Le quota du jour est épuisé : une seconde vente ne rend plus de gemmes
  assert.equal(A.gemQuotaLeft(s, T), Math.max(0, GEM_DAILY - (pv.res.gems || 0)));
  // Annulation
  assert.ok(A.undoLast(s, T + 60000).ok);
  assert.equal(s.inventory.items.length, n0);
  assert.equal(Math.round(s.resources.gems), 0);
  assert.equal(A.gemQuotaLeft(s, T), GEM_DAILY);
  void GEM_GOLD;
});

test('Plafond de gemmes : vendre beaucoup chaque jour ne dépasse jamais le quota', () => {
  const { s } = lab();
  s.resources.gems = 0;
  let total = 0;
  for (let d = 0; d < 5; d++) {
    const now = T + d * 86400000;
    const lot = Array.from({ length: 20 }, () => mk({ baseKey: 'warAmulet', rarity: 'mythic', ilvl: 10 }));
    s.inventory.items.push(...lot);
    const r = A.sellItems(s, lot.map((i) => i.id), now, { manual: true });
    total += r.res.gems || 0;
  }
  assert.equal(total, 5 * GEM_DAILY);
});

test('Règles de tri : ordres « loot » hors quota, première règle qui correspond, protections', () => {
  const { s, g } = lab();
  s.orders = [];
  assert.ok(addOrder(s, { cond: { type: 'loot', rarityMax: 'common', useful: 'any' }, action: { type: 'lootDismantle' } }).ok, 'disponible dès le début');
  assert.ok(A.addLootRule(s, { rarityMax: 'rare', slot: 'ring', action: 'lootSell' }).ok);
  const junk = generateItem({ baseKey: 'minerSword', rarity: 'common', ilvl: 1 });
  const ring = generateItem({ baseKey: 'luckRing', rarity: 'rare', ilvl: 1 });
  const epic = generateItem({ baseKey: 'plateArmor', rarity: 'epic', ilvl: 5 });
  // Le général porte déjà mieux : l'épée commune n'est pas « meilleure pour un héros »
  const best = generateItem({ baseKey: 'generalSword', rarity: 'legendary', ilvl: 20 }); best.got = 1;
  s.inventory.items.push(best); g.equipment.weapon = best.id; best.equippedBy = g.id;
  const ring2 = generateItem({ baseKey: 'wolfRing', rarity: 'legendary', ilvl: 20 }); ring2.got = 1;
  s.inventory.items.push(ring2); g.equipment.ring = ring2.id; ring2.equippedBy = g.id;
  s.heroes[1].equipment.ring = null;
  const sc = generateItem({ baseKey: 'scepter', rarity: 'legendary', ilvl: 20 }); sc.got = 1;
  s.inventory.items.push(sc); s.heroes[1].equipment.weapon = sc.id; sc.equippedBy = s.heroes[1].id;
  s.inventory.items.push(junk, ring, epic);
  const gold0 = s.resources.gold;
  A.lootTick(s, T, {});
  const ids = new Set(s.inventory.items.map((i) => i.id));
  assert.ok(!ids.has(junk.id), 'commun démantelé');
  assert.ok(ids.has(epic.id), 'épique gardé (aucune règle)');
  // L'anneau rare (butin rare : inutile à un intendant, moins bon que l'anneau du général) est vendu par la 2e règle
  assert.ok(!ids.has(ring.id));
  assert.ok(s.resources.gold > gold0);
  assert.ok(A.armoryState(s).reports[0].kind === 'rules');
  // Une pièce qui améliore un héros n'est jamais touchée par une règle
  const useful = generateItem({ baseKey: 'goldRing', rarity: 'common', ilvl: 1 });
  s.inventory.items.push(useful);
  assert.ok(A.bestForMap(s).has(useful.id));
  A.lootTick(s, T + 1, {});
  assert.ok(s.inventory.items.includes(useful));
  // Les ordres « loot » ne prennent pas de place d'ordre du royaume
  assert.equal(s.orders.filter((o) => o.cond.type !== 'loot').length, 0);
});

test('Plafond d’inventaire : rien ne disparaît sans rapport, jamais une pièce protégée', () => {
  const s = load('save-armurerie');
  const n = s.inventory.items.length;
  const best = A.bestForMap(s);
  const protectedIds = new Set(s.inventory.items.filter((i) => i.equippedBy || i.locked || best.has(i.id)).map((i) => i.id));
  for (let i = 0; i < 40; i++) s.inventory.items.push(generateItem({ rarity: 'common', ilvl: 1 }));
  const rep = A.lootTick(s, T, {});
  assert.equal(s.inventory.items.length, A.INVENTORY_CAP);
  assert.equal(rep.kind, 'cap');
  assert.equal(rep.n, n + 40 - A.INVENTORY_CAP);
  assert.ok(Object.keys(rep.res).length, 'ce que cela a rapporté');
  const left = new Set(s.inventory.items.map((i) => i.id));
  for (const id of protectedIds) assert.ok(left.has(id), 'pièce protégée conservée');
  assert.ok(s.log.some((l) => /Inventaire plein/.test(l.text)));
});

test('Châsses et gemmes : tailler, fusionner, sertir, dessertir, rendues à la vente', () => {
  const { s, g } = lab();
  s.resources.gems = 100; s.resources.crystals = 100; s.resources.gold = 1e6;
  const it = mk({ baseKey: 'generalSword', rarity: 'epic', ilvl: 5 });
  assert.equal(it.sockets.length, SOCKETS.epic);
  assert.equal(mk({ baseKey: 'generalSword', rarity: 'common', ilvl: 5 }).sockets.length, 0);
  s.inventory.items.push(it);
  for (let i = 0; i < 3; i++) assert.ok(A.cutGem(s, 'ruby').ok);
  assert.equal(s.resources.gems, 100 - 3 * CUT_COST.gems);
  assert.ok(A.fuseGems(s, 'ruby', 0).ok);
  assert.equal(A.armoryState(s).gemBag['ruby:1'], 1);
  const before = itemMods(it)['combat.atk'];
  assert.ok(A.socketGem(s, it.id, 0, 'ruby:1').ok);
  assert.ok(Math.abs(itemMods(it)['combat.atk'] - before - 0.04) < 1e-9);
  // L'équipement automatique tient compte des gemmes : l'objet serti vaut plus
  assert.ok(A.itemGain(s, g, it) > 0);
  assert.ok(A.unsocketGem(s, it.id, 0).ok);
  assert.equal(A.armoryState(s).gemBag['ruby:1'], 1);
  A.socketGem(s, it.id, 0, 'ruby:1');
  A.sellItems(s, [it.id], T, { manual: true });
  assert.equal(A.armoryState(s).gemBag['ruby:1'], 1, 'gemme rendue à l’écrin à la vente');
});

test('Ensembles : bonus à 2 et 4 pièces, comptés par l’équipement automatique, entrée dans la collection', () => {
  const { s, g } = lab();
  const pieces = ['generalSword', 'ironHelm', 'plateArmor', 'warBoots'].map((b) => { const it = mk({ baseKey: b, rarity: 'rare', ilvl: 5 }); it.set = 'warlord'; return it; });
  s.inventory.items.push(...pieces);
  const base = heroMods(s, g, 'commander')['combat.def'] || 0;
  for (const it of pieces) { g.equipment[it.slot] = it.id; it.equippedBy = g.id; }
  const withSet = heroMods(s, g, 'commander');
  const raw = pieces.reduce((a, it) => a + (itemMods(it)['combat.def'] || 0), 0);
  assert.ok(withSet['combat.def'] >= base + raw + 0.05 - 1e-9, 'bonus 4 pièces');
  A.noteSets(s, T);
  assert.ok(A.armoryState(s).setsDone.warlord);
});

test('Tenues : enregistrer, revêtir, revêtue d’office au changement de rôle', () => {
  const { s, g } = lab();
  const war = mk({ baseKey: 'generalSword', rarity: 'rare', ilvl: 5 });
  const gov = mk({ baseKey: 'scepter', rarity: 'rare', ilvl: 5 });
  s.inventory.items.push(war, gov);
  g.equipment.weapon = war.id; war.equippedBy = g.id;
  A.saveOutfit(s, g.id, 0, 'Guerre', 'commander');
  g.equipment.weapon = gov.id; gov.equippedBy = g.id; war.equippedBy = null;
  A.saveOutfit(s, g.id, 1, 'Intendance', 'governor');
  assert.ok(A.wearOutfit(s, g.id, 0).ok);
  assert.equal(g.equipment.weapon, war.id);
  assignGovernor(s, g.id, 'science');
  const r = A.onRoleChange(s, g.id);
  assert.equal(r.outfit, 'Intendance');
  assert.equal(g.equipment.weapon, gov.id);
});

test('Transmutation et réforge', () => {
  const { s } = lab();
  s.resources.gold = 1e6; s.resources.crystals = 500; s.resources.gems = 500;
  const old = mk({ baseKey: 'generalSword', rarity: 'rare', ilvl: 5 }); old.plus = 6;
  const neu = mk({ baseKey: 'generalSword', rarity: 'epic', ilvl: 10 });
  s.inventory.items.push(old, neu);
  const c = A.transmuteCheck(s, old.id, neu.id);
  assert.ok(c.ok && c.plus === 4);
  assert.ok(A.transmute(s, old.id, neu.id).ok);
  assert.equal(neu.plus, 4);
  assert.ok(!s.inventory.items.includes(old));
  // Réforge : la signature ne se réforge pas, un autre effet oui ; coût croissant
  const ks = A.reforgeable(neu);
  assert.ok(!ks.includes('combat.atk'));
  assert.ok(ks.length >= 1);
  const c0 = A.reforgeQuote(neu).crystals;
  const r = A.reforge(s, neu.id, ks[0]);
  assert.ok(r.ok && !(ks[0] in neu.affixes) && r.to in neu.affixes);
  assert.ok(A.reforgeQuote(neu).crystals > c0);
  assert.equal(A.reforge(s, neu.id, 'combat.atk').ok, false);
});

test('Conseils de la taverne : un héros par secteur, chiffré, appliqué en un clic', () => {
  const s = load('save-armurerie');
  const adv = A.tavernAdvice(s);
  assert.ok(adv.length >= 1);
  for (const a of adv) assert.match(a.text, /%|commandant/);
  for (const a of adv) assignGovernor(s, a.heroId, a.to);
  const sectors = s.heroes.filter((h) => h.assignment).map((h) => h.assignment.sector);
  assert.equal(new Set(sectors).size, sectors.length);
});

test('Confort : compositions d’armée, maintien de l’armée, tout réclamer', () => {
  const s = load('save-v17');
  s.army.spearman = 10;
  assert.ok(saveArmyPreset(s, 0, 'Garnison', { spearman: 30 }).ok);
  assert.deepEqual(presetUnits(s, 0).units, { spearman: 10 });
  s.resources.food = 1e6; s.resources.wood = 1e6; s.resources.iron = 1e6; s.resources.gold = 1e6;
  const r = maintainArmy(s, 0, T);
  assert.ok(r.ok, r.reason);
  assert.equal(maintainArmy(s, 0, T).ok, false, 'déjà en formation : rien de plus');
  const n = claimables(s, s.meta.lastTick).length;
  const c = claimAll(s, s.meta.lastTick);
  assert.equal(c.ok, n > 0);
});

test('Migration d’une vraie sauvegarde v17 : rien de perdu, châsses selon la rareté, réglages prudents', () => {
  const raw = gunzipSync(readFileSync(new URL('./fixtures/save-v17.json.gz', import.meta.url))).toString();
  const old = JSON.parse(raw);
  const s = deserialize(raw);
  assert.equal(s.inventory.items.length, old.inventory.items.length);
  for (const it of s.inventory.items) {
    const o = old.inventory.items.find((x) => x.id === it.id);
    assert.deepEqual(it.affixes, o.affixes);
    assert.equal(it.equippedBy, o.equippedBy);
    assert.equal(!!it.locked, !!o.locked);
    assert.equal(it.sockets.length, SOCKETS[it.rarity]);
    assert.ok(it.got);
  }
  for (const h of s.heroes) assert.deepEqual(h.equipment, old.heroes.find((x) => x.id === h.id).equipment);
  const S = A.armoryState(s).settings;
  assert.equal(S.autoLoot, false);
  assert.equal(A.lootRules(s).length, 0);
  // Les objets déjà possédés ne passent pas dans les règles ; 2 h de jeu sans erreur ni perte
  const n = s.inventory.items.length;
  advance(s, s.meta.lastTick + 2 * 3600e3);
  assert.ok(s.inventory.items.length >= n);
  assert.equal(serialize(deserialize(serialize(s))).length > 0, true);
});
