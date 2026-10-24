// v21 « Couleurs du Royaume » : vie de la ville liée à l'état ; hospice et blessés ; reliques de bâtiment et leur
// rayonnement ; châtelain et adaptation des seigneurs ; camps de brigands à niveaux, ligue et insécurité des routes ;
// garnison alliée et ses exigences ; auras et usure des décorations ; migration d'une vraie sauvegarde v20.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { createNewState, SAVE_VERSION } from '../src/core/state.js';
import { deserialize, serialize } from '../src/core/save.js';
import { advance } from '../src/core/engine.js';
import { computeMods } from '../src/systems/modifiers.js';
import { buildingRates } from '../src/systems/economy.js';
import { publicOrder } from '../src/systems/order.js';
import { segmentDanger } from '../src/systems/logistics.js';
import { favorOf } from '../src/systems/council.js';
import { createHero } from '../src/systems/heroes.js';
import { assignGovernor } from '../src/systems/tavern.js';
import { raidEngines } from '../src/systems/siege.js';
import { resolveRaid } from '../src/systems/rivals.js';
import { describePending, resolveAny } from '../src/systems/pending.js';
import { trophyCount } from '../src/systems/trophies.js';
import { lifeDensity, LIFE } from '../src/systems/life.js';
import * as R from '../src/systems/realm21.js';
import { HOSPICE, BUILDING_RELICS, BRIGANDS, ALLY_GARRISON, DECO_WEAR, CASTELLAN } from '../src/data/realm21.js';
import { BUILDINGS } from '../src/data/buildings.js';
import { KEEP_ONLY, FAMILY_OF } from '../src/data/castle.js';

const T0 = Date.UTC(2026, 9, 20, 8);
const H = 3600000;
const th = (s) => Object.values(s.city.buildings).find((b) => b.type === 'townhall');
function realmState(seed = 'v21', lvl = 12) {
  const s = createNewState({ seed, now: T0 });
  th(s).level = lvl;
  s.meta.lastTick = T0;
  for (const r of Object.keys(s.resources)) s.resources[r] = 200000;
  s.city.terrain = s.city.terrain.map(() => 'plain');
  return s;
}
const put = (s, id, type, x, y, level = 1, extra = {}) => (s.city.buildings[id] = { id, type, x, y, level, ...extra });
const raw = (f) => gunzipSync(readFileSync(new URL(`./fixtures/${f}.json.gz`, import.meta.url))).toString();

// ───────── Migration ─────────
test('Migration v20 → v21 : la sauvegarde se charge, rien n’est perdu, les nouvelles structures sont prêtes', () => {
  const before = JSON.parse(raw('save-v20'));
  assert.equal(before.realm21, undefined, 'la fixture est bien une sauvegarde v20 (sans champs v21)');
  const s = deserialize(raw('save-v20'));
  assert.equal(s.version, SAVE_VERSION);
  assert.equal(Object.keys(s.city.buildings).length, Object.keys(before.city.buildings).length, 'aucun bâtiment perdu');
  for (const [id, b] of Object.entries(before.city.buildings)) assert.deepEqual([s.city.buildings[id].x, s.city.buildings[id].y, s.city.buildings[id].level], [b.x, b.y, b.level], id);
  assert.deepEqual(s.resources, before.resources, 'ressources intactes');
  assert.deepEqual(s.world.pois, before.world.pois, 'sites du monde intacts');
  assert.ok(s.realm21 && Array.isArray(s.realm21.wounded) && Array.isArray(s.realm21.relics));
  for (const b of Object.values(s.city.buildings)) if (b.type === 'deco' && !b.deco?.startsWith('tr_')) assert.ok(s.realm21.deco[b.id]?.care > 0, 'décoration entretenue au chargement');
  // aller-retour
  const again = deserialize(serialize(s));
  assert.deepEqual(again.realm21, s.realm21);
  // le jeu tourne une heure sans erreur
  advance(s, (s.meta.lastTick || T0) + H);
});

// ───────── Vie de la ville ─────────
test('Vie : la foule suit l’état (ordre, famine, raid, nuit) et la garde n’est jamais sacrifiée au plafond', () => {
  const s = realmState();
  for (let i = 0; i < 8; i++) put(s, 'h' + i, 'house', 2 + i, 2, 3);
  const day = lifeDensity(s, { phase: 'day', gfx: 'high' });
  assert.ok(day.peasants > 8 && day.guards >= LIFE.guards, JSON.stringify(day));
  s.famine = true;
  const fam = lifeDensity(s, { phase: 'day', gfx: 'high' });
  assert.ok(fam.peasants <= day.peasants * 0.55 && fam.mood === 'grim');
  s.famine = false;
  s.raids = [{ id: 'r', arrive: T0 + H }];
  const raid = lifeDensity(s, { phase: 'day', gfx: 'high' });
  assert.ok(raid.guards >= day.guards * 2 - 1 && raid.peasants < day.peasants && raid.carts === 0 && raid.mood === 'alarm');
  s.raids = [];
  const night = lifeDensity(s, { phase: 'night', gfx: 'high' });
  assert.ok(night.peasants < day.peasants * 0.4 && night.birds === 0 && night.night);
  const low = lifeDensity(s, { phase: 'day', gfx: 'low' });
  assert.ok(low.peasants + low.guards + low.carts <= LIFE.cap.low && low.guards >= 2);
  assert.ok(day.why.length >= 1 && day.why.every((w) => typeof w === 'string'), 'chaque facteur est expliqué');
});

// ───────── B1 : hospice ─────────
test('Hospice : sans lits pas de blessés ; 15 % des pertes en défense, 8 % en campagne, plafonnés aux lits', () => {
  const s = realmState();
  assert.equal(R.addWounded(s, { spearman: 100 }, 'def', T0), 0, 'sans hospice, les tombés sont perdus');
  put(s, 'hs', 'hospice', 5, 5, 2);
  assert.equal(R.hospiceBeds(s), HOSPICE.bedsBase + 2 * HOSPICE.bedsPerLevel);
  assert.equal(R.addWounded(s, { spearman: 100 }, 'def', T0), 15);
  assert.equal(R.addWounded(s, { archer: 100 }, 'att', T0), 8);
  assert.equal(R.addWounded(s, { archer: 1000 }, 'def', T0), R.hospiceBeds(s) - 23, 'plafond des lits');
  assert.equal(R.woundedCount(s), R.hospiceBeds(s));
});
test('Hospice : soins (une potion pour 10), retour à la garnison, vétérans si soignés vite, abandon puni', () => {
  const s = realmState();
  put(s, 'hs', 'hospice', 5, 5, 4);
  s.army = { spearman: 400 };
  s.inventory.consumables.healPotion = 0;
  R.addWounded(s, { spearman: 200 }, 'def', T0);
  assert.equal(R.healWounded(s, null, T0 + H).ok, false, 'pas de potion, pas de soin');
  s.inventory.consumables.healPotion = 10;
  const h = R.healWounded(s, null, T0 + H);
  assert.ok(h.ok && h.healed === 30 && h.potions === 3);
  assert.equal(s.inventory.consumables.healPotion, 7);
  R.hospiceTick(s, T0 + 12 * H);
  assert.equal(s.army.spearman, 400, 'pas encore guéris');
  R.hospiceTick(s, T0 + 14 * H);
  assert.equal(s.army.spearman, 430, 'les blessés soignés reviennent');
  const vet = s.realm21.veterans.spearman;
  assert.ok(vet > 0 && vet <= Math.floor(430 * HOSPICE.vetCap), `vétérans ${vet}`);
  assert.ok(computeMods(s, T0 + 14 * H)['unit.spearman.atk'] > 0 && computeMods(s, T0 + 14 * H)['unit.spearman.atk'] <= HOSPICE.vetAtk + 1e-9);
  // Abandon
  const f0 = favorOf(s, 'peasants');
  R.addWounded(s, { spearman: 200 }, 'def', T0 + 20 * H);
  R.hospiceTick(s, T0 + 20 * H + 25 * H);
  assert.equal(R.woundedCount(s), 0);
  assert.ok(favorOf(s, 'peasants') < f0, 'l’Assemblée des villages s’en souvient');
  assert.equal(s.realm21.stats.abandoned, 30);
});
test('Hospice : un raid repoussé ou perdu envoie des blessés à l’hospice (défense réelle)', () => {
  const s = realmState();
  put(s, 'hs', 'hospice', 5, 5, 6);
  s.army = { spearman: 300, archer: 200 };
  const raid = { id: 'raid_t', rival: 0, name: 'Pillards de test', from: { x: 0, y: 0 }, army: { militia: 400, royalKnight: 60 }, start: T0, arrive: T0 + H, flank: 'front', mainFlank: 'front' };
  s.raids = [raid];
  resolveRaid(s, raid, T0 + H);
  assert.ok(R.woundedCount(s) > 0, 'des blessés sont recueillis');
  assert.match(s.reports[0].text, /hospice/);
});

// ───────── B2 : reliques ─────────
test('Reliques : emplacements par niveau, bâtiment adapté, effet borné, rayonnement aux voisins, transport de 6 h', () => {
  const s = realmState();
  assert.deepEqual([R.relicSlots(4), R.relicSlots(5), R.relicSlots(15), R.relicSlots(25)], [0, 1, 2, 3]);
  put(s, 'f1', 'farm', 10, 10, 6); put(s, 'f2', 'farm', 11, 10, 6); put(s, 'f3', 'farm', 14, 14, 6); put(s, 'q', 'quarry', 10, 11, 6);
  const r = R.grantRelic(s, 'meule', 'archaeo', T0);
  assert.equal(R.placeRelic(s, r.id, 'q', T0).ok, false, 'pas sur une carrière');
  const ok = R.placeRelic(s, r.id, 'f1', T0);
  assert.ok(ok.ok && !ok.moving);
  const r2 = R.grantRelic(s, 'meule', 'archaeo', T0);
  assert.equal(R.placeRelic(s, r2.id, 'f1', T0).ok, false, 'un seul emplacement au niveau 6');
  assert.equal(R.relicProdBonus(s, s.city.buildings.f1, T0), BUILDING_RELICS.meule.prod);
  assert.equal(R.relicProdBonus(s, s.city.buildings.f2, T0), BUILDING_RELICS.meule.prod * 0.5, 'voisin : moitié');
  assert.equal(R.relicProdBonus(s, s.city.buildings.f3, T0), 0, 'trop loin');
  const mods = computeMods(s, T0);
  const with_ = buildingRates(s, s.city.buildings.f1, mods).out.food;
  const mv = R.placeRelic(s, r.id, 'f3', T0);
  assert.ok(mv.ok && mv.moving);
  assert.equal(R.relicProdBonus(s, s.city.buildings.f3, T0 + H), 0, 'en transport : aucun effet');
  assert.ok(buildingRates(s, s.city.buildings.f1, computeMods(s, T0 + H)).out.food < with_);
  assert.equal(R.relicProdBonus(s, s.city.buildings.f3, T0 + 7 * H), BUILDING_RELICS.meule.prod, 'arrivée après 6 h');
  // Étendard : effet global de formation
  put(s, 'bk', 'barracks', 3, 3, 5);
  const e = R.grantRelic(s, 'etendard', 'archaeo', T0);
  const t0 = computeMods(s, T0)['train.speed'] || 0;
  R.placeRelic(s, e.id, 'bk', T0);
  assert.ok(Math.abs((computeMods(s, T0)['train.speed'] || 0) - t0 - 0.08) < 1e-9);
  // 3 fragments → une relique
  s.shards.relicFragments = 3;
  assert.ok(R.relicFromFragments(s, T0).ok);
  assert.equal(s.shards.relicFragments, 0);
  assert.equal(R.relicFromFragments(s, T0).ok, false);
});

// ───────── B3 : châtelain ─────────
test('Châtelain : un seul, exclusif avec intendant et marche ; renforce son poste ; les seigneurs apprennent son poste', () => {
  const s = realmState();
  const a = createHero({ cls: 'general', level: 10 }), b = createHero({ cls: 'farmer', level: 5 });
  s.heroes = [a, b];
  assignGovernor(s, b.id, 'food');
  assert.equal(R.assignCastellan(s, b.id, 'gate').ok, false, 'un intendant ne peut pas être châtelain');
  assert.ok(R.assignCastellan(s, a.id, 'gate').ok);
  const c = R.castellanDefense(s);
  assert.ok(c.protMult > 1 && c.def > 0 && c.def <= CASTELLAN.defCap);
  assert.ok(R.assignCastellan(s, b.id, 'wall').ok === false);
  // Adaptation : vu deux fois de suite à la porte
  s.city.fort.wall = 8; s.city.fort.moat = 3;
  const before = raidEngines(s, { rival: 1 }, { militia: 300 }, T0, 'front');
  R.learnCastellan(s, 1); R.learnCastellan(s, 1);
  const ad = R.castellanAdapt(s, 1);
  assert.ok(ad && /porte/.test(ad.text));
  const after = raidEngines(s, { rival: 1 }, { militia: 300 }, T0, 'front');
  assert.notEqual(after.mainFlank, 'front', 'ils attaquent ailleurs');
  assert.match(after.adapt, /châtelain/);
  assert.ok(before.mainFlank === 'front');
  // Changer de poste remet la mémoire à un
  R.assignCastellan(s, a.id, 'moat'); R.learnCastellan(s, 1);
  assert.equal(R.castellanAdapt(s, 1), null);
});

// ───────── B4 : brigands ─────────
function campWorld(s) {
  const camps = Object.values(s.world.pois).filter((p) => p.type === 'banditCamp');
  assert.ok(camps.length >= 2, 'le monde a des camps de bandits');
  return camps;
}
test('Camps de brigands : un niveau par jour sans nettoyage, ennemis et butin plus forts, −3 niveaux une fois nettoyés', () => {
  const s = realmState();
  const [c] = campWorld(s);
  c.clearedUntil = 0;
  R.brigandTick(s, T0);
  const e0 = Object.values(c.enemies).reduce((a, b) => a + b, 0);
  for (let d = 1; d <= 4; d++) R.brigandTick(s, T0 + d * 24 * H + 1);
  assert.equal(R.campLevel(c), 5);
  assert.ok(Object.values(c.enemies).reduce((a, b) => a + b, 0) > e0 * 1.4, 'ennemis renforcés');
  assert.ok(Math.abs(R.campScale(c) - (1 + 4 * BRIGANDS.perLevel)) < 1e-9);
  R.onCampCleared(s, c, T0 + 5 * 24 * H);
  assert.equal(R.campLevel(c), 2);
});
test('Ligue des brigands : la colère monte (double sur le même camp), présage, riposte commune, trophée et relique', () => {
  const s = realmState();
  const [a, b] = campWorld(s);
  let t = T0;
  R.onCampCleared(s, a, t); assert.equal(s.realm21.brigands.anger, 1);
  t += H; R.onCampCleared(s, a, t); assert.equal(s.realm21.brigands.anger, 3, 'même camp en moins de 48 h : +2');
  t += H; R.onCampCleared(s, b, t); t += H; R.onCampCleared(s, b, t);
  assert.ok(s.realm21.brigands.anger >= BRIGANDS.anger.warn && s.realm21.brigands.warned, 'présage');
  t += H; R.onCampCleared(s, a, t);
  assert.ok(s.realm21.brigands.anger >= BRIGANDS.anger.strike);
  s.raids = [];
  const raid = R.leagueStrike(s, t, 12);
  assert.ok(raid && raid.league && s.raids.length === 1 && s.realm21.brigands.anger === 0);
  // Défaite de la ligue (on la défend avec une grosse garnison)
  s.army = { spearman: 4000, archer: 3000, swordsman: 2000 };
  const relics0 = s.realm21.relics.length;
  resolveRaid(s, raid, raid.arrive);
  assert.equal(s.realm21.stats.leagueBroken, 1);
  assert.equal(trophyCount(s, 'league'), 1);
  assert.equal(s.realm21.relics.length, relics0 + 1, 'la première ligue brisée donne une relique');
});
test('Insécurité : des camps forts laissés tranquilles rendent les routes dangereuses (logistique)', () => {
  const s = realmState();
  const camps = campWorld(s);
  const a = { x: s.world.capital.x, y: s.world.capital.y }, b = { x: a.x + 6, y: a.y };
  const d0 = segmentDanger(s, a, b, T0).danger;
  for (const c of camps.slice(0, 2)) { c.lvl = 6; c.lvlAt = T0 - 4 * 24 * H; c.clearedUntil = 0; }
  assert.equal(R.insecurity(s, T0), 2);
  assert.equal(segmentDanger(s, a, b, T0).danger, d0 + 2);
  R.onCampCleared(s, camps[0], T0);
  assert.equal(R.insecurity(s, T0 + H), 1, 'un camp nettoyé ne compte plus');
});

// ───────── B5 : garnison alliée ─────────
test('Garnison alliée : proposée si la relation est bonne, refusable ; exigences (pain, aucune sortie) et relation', () => {
  const s = realmState();
  assert.ok(s.factions.length >= 2);
  s.factions[0].relation = 10; s.factions[1].relation = 10;
  const raid = { id: 'raid_a', rival: 0, name: 'Raid', arrive: T0 + H, army: { militia: 10 } };
  s.raids = [raid];
  assert.equal(R.garrisonOffer(s, raid), null, 'relation trop basse');
  s.factions[1].relation = 60; s.factions[1].stance = 'neutral';
  const p = R.offerGarrison(s, raid, T0);
  assert.ok(p && p.kind === 'ally');
  const d = describePending(s, p);
  assert.match(d.text, /pains par heure/);
  // Refus : rien ne change
  const rel0 = s.factions[1].relation;
  assert.ok(resolveAny(s, p.id, 1, T0).ok);
  assert.equal(s.realm21.garrison, null);
  assert.equal(s.factions[1].relation, rel0);
  // Accepter, puis la décevoir par une sortie
  const p2 = R.offerGarrison(s, raid, T0);
  resolveAny(s, p2.id, 0, T0);
  assert.ok(R.garrisonUnits(s, raid));
  R.onAttackLaunched(s, T0 + 60000);
  assert.equal(R.garrisonUnits(s, raid), null);
  assert.equal(s.factions[1].relation, rel0 + ALLY_GARRISON.betray);
  // Honorer : nourrie, aucune sortie → relation en hausse et trophée
  s.realm21.garrison = null;
  const p3 = R.offerGarrison(s, raid, T0);
  resolveAny(s, p3.id, 0, T0);
  s.resources.bread = 1000;
  const rel1 = s.factions[1].relation;
  R.garrisonTick(s, T0 + 2 * H);
  assert.equal(s.resources.bread, 1000 - 2 * ALLY_GARRISON.breadPerH);
  R.garrisonTick(s, raid.arrive + ALLY_GARRISON.stayH * H + 1);
  assert.equal(s.realm21.garrison, null);
  assert.equal(s.factions[1].relation, rel1 + ALLY_GARRISON.honor);
  assert.equal(trophyCount(s, 'allies'), 1);
});

// ───────── B6 : décorations ─────────
test('Décorations : aura selon le voisin (fontaine et maisons), bornée, usée après 48 h, entretien payé en pierre et bois', () => {
  const s = realmState();
  const r = s.castle?.rect || { x0: 6, y0: 4 };
  const x = r.x0 + 1, y = r.y0 + 1;
  put(s, 'h1', 'house', x + 1, y, 2);
  put(s, 'd1', 'deco', x, y, 1, { deco: 'deco_fountain' });
  R.realmTick(s, T0);
  const a = R.decoAuras(s, T0);
  assert.equal(a.order, 4);
  assert.equal(a.mods['worker.morale'], 1);
  assert.ok(publicOrder(s).parts.some(([n]) => /Auras/.test(n)));
  const worn = R.decoAuras(s, T0 + (DECO_WEAR.h + 1) * H);
  assert.equal(worn.order, 3, 'usée : ×0,75');
  const st0 = s.resources.stone;
  assert.ok(R.careDeco(s, null, T0 + (DECO_WEAR.h + 1) * H).ok);
  assert.equal(s.resources.stone, st0 - DECO_WEAR.cost.stone);
  assert.equal(R.decoAuras(s, T0 + (DECO_WEAR.h + 2) * H).order, 4, 'entretenue');
  // Sans voisin utile : aucune aura
  delete s.city.buildings.h1;
  assert.equal(R.decoAuras(s, T0).order, 0);
});

// ───────── Ensemble ─────────
test('v21 : l’hospice est un bâtiment de la ville (famille militaire), sans coût en gemmes ni monnaie nouvelle', () => {
  assert.ok(BUILDINGS.hospice && KEEP_ONLY.includes('hospice') && FAMILY_OF.hospice === 'military');
  assert.ok(!Object.keys(BUILDINGS.hospice.cost).some((k) => ['gems', 'crystals', 'shards'].includes(k)));
  const s = realmState();
  const why = R.realmWhy(s, T0);
  for (const k of ['hospice', 'relics', 'castellan', 'league', 'allies', 'deco']) assert.ok(why.some((w) => w.k === k), k);
  assert.ok(why.every((w) => w.lines.every((l) => typeof l === 'string' && l.length > 10)));
});
