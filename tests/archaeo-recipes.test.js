// Mystères archéologiques et plans de forge.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createNewState } from '../src/core/state.js';
import { serialize, deserialize } from '../src/core/save.js';
import { rng } from '../src/core/rng.js';
import { MYSTERIES } from '../src/data/archaeology.js';
import { PLANS } from '../src/data/recipes.js';
import { archaeoState, archaeoTick, canDig, startDig, studyFragment, answerRiddle, riddleReady, digRisk } from '../src/systems/archaeology.js';
import { learnPlan, knowsPlan, setWorkshop, experiment, recipesTick, buyFactionPlan, learnFromHero } from '../src/systems/recipes.js';
import { startCraft, completeCraft, craftCost } from '../src/systems/crafting.js';
import { computeMods } from '../src/systems/modifiers.js';
import { isRevealed } from '../src/systems/world.js';

const T0 = Date.UTC(2026, 6, 1);
const H = 3600000;
const th = (s) => Object.values(s.city.buildings).find((b) => b.type === 'townhall');
const rich = (s) => { for (const r of Object.keys(s.resources)) s.resources[r] = 50000; };

test('Mystère archéologique : indice, localisation par l’exploration, fouilles, étude, énigme, récompense', (tc) => {
  rng.setSource(() => 0.99); // aucune embuscade
  tc.after(() => rng.setSource(null));
  const s = createNewState({ seed: 'arch', now: T0 });
  rich(s);
  archaeoTick(s, T0);
  assert.equal(archaeoState(s).active, null, 'pas avant l’hôtel de ville 4');
  th(s).level = 4;
  s.stats.explored += 6;
  archaeoTick(s, T0);
  const m = s.archaeo.active;
  assert.equal(m.id, 'observatory');
  assert.equal(m.sites.length, 3);
  for (const site of m.sites) assert.ok(Math.hypot(site.x - site.cx, site.y - site.cy) <= site.r, 'le site est dans la zone indiquée');
  // Non localisé tant que la case n'est pas explorée
  const i0 = m.sites.findIndex((x) => !isRevealed(s.world, x.x, x.y));
  if (i0 >= 0) assert.match(canDig(s, i0, T0).reason, /non localisé/);
  // Explorer révèle le site
  const site = m.sites[0];
  s.world.revealed[site.y * s.world.size + site.x] = 1;
  archaeoTick(s, T0);
  assert.ok(site.located);
  const gold = s.resources.gold;
  const r = startDig(s, 0, T0);
  assert.ok(r.ok, r.reason);
  assert.ok(s.resources.gold < gold, 'la fouille coûte');
  assert.match(canDig(s, 1, T0).reason, /déjà sur le terrain|non localisé/);
  archaeoTick(s, T0 + r.minutes * 60000);
  assert.ok(site.found, 'fragment trouvé');
  // Lecture rapide : localise le site suivant
  assert.ok(studyFragment(s, 0, 'quick', T0).ok);
  assert.ok(m.sites.filter((x) => x.located).length >= 2);
  // Les deux autres sites
  for (const i of [1, 2]) {
    m.sites[i].located = true;
    const d = startDig(s, i, T0);
    assert.ok(d.ok, d.reason);
    archaeoTick(s, T0 + d.minutes * 60000);
    assert.ok(studyFragment(s, i, 'deep', T0).ok);
  }
  assert.ok(riddleReady(m));
  assert.equal(m.eliminated.length, 2, 'deux mauvaises réponses écartées');
  const def = MYSTERIES.observatory;
  assert.ok(!m.eliminated.includes(def.correct), 'la bonne réponse n’est jamais écartée');
  // Mauvaise réponse : délai
  const wrong = def.answers.findIndex((_, k) => k !== def.correct && !m.eliminated.includes(k));
  assert.equal(answerRiddle(s, wrong, T0).correct, false);
  assert.match(answerRiddle(s, def.correct, T0 + H).reason, /réfléchissent/);
  const before = computeMods(s, T0)['research.speed'] || 0;
  const ok = answerRiddle(s, def.correct, T0 + 5 * H);
  assert.ok(ok.correct);
  assert.ok(s.archaeo.solved.observatory && s.archaeo.places.observatory, 'lieu unique retrouvé');
  assert.ok(Math.abs((computeMods(s, T0)['research.speed'] || 0) - before - 0.05) < 1e-9, 'bonus permanent');
  assert.ok(knowsPlan(s, 'starAmulet'), 'plan de forge appris');
  const back = deserialize(serialize(s));
  assert.ok(back.archaeo.solved.observatory && back.recipes.known.starAmulet, 'sauvegardé');
});

test('Fouilles : risque d’embuscade près des lieux dangereux, échec sans fragment', (tc) => {
  rng.setSource(() => 0);
  tc.after(() => rng.setSource(null));
  const s = createNewState({ seed: 'arch2', now: T0 });
  rich(s); th(s).level = 4; s.stats.explored = 10;
  archaeoTick(s, T0);
  const site = s.archaeo.active.sites[0];
  site.located = true;
  s.world.pois[`${site.x + 1},${site.y}`] = { id: 'x', type: 'banditCamp', x: site.x + 1, y: site.y, danger: 2 };
  assert.ok(digRisk(s, site, T0) > 0);
  const d = startDig(s, 0, T0);
  archaeoTick(s, T0 + d.minutes * 60000);
  assert.equal(site.found, false, 'équipe chassée');
  assert.equal(s.archaeo.active.dig, null);
});

test('Plans de forge : base et effet spécial choisis, atelier spécialisé, sources', (tc) => {
  rng.setSource(() => 0.2);
  tc.after(() => rng.setSource(null));
  const s = createNewState({ seed: 'plans', now: T0 });
  rich(s);
  s.city.buildings.forge = { id: 'forge', type: 'forge', level: 3, x: 1, y: 1 };
  assert.match(startCraft(s, 'weapon', 'none', T0, 'cavalrySaber', 'charge').reason, /Plan inconnu/);
  learnPlan(s, 'cavalrySaber', 'test', T0);
  const plain = craftCost('weapon', 'none', computeMods(s, T0), s);
  const withPlan = craftCost('weapon', 'none', computeMods(s, T0), s, 'cavalrySaber');
  assert.ok(withPlan.rareOre >= 2 && withPlan.steel > plain.steel, 'le plan ajoute son coût');
  assert.ok(startCraft(s, 'weapon', 'none', T0, 'cavalrySaber', 'charge').ok);
  const q = s.queues.craft.at(-1);
  completeCraft(s, q, q.end);
  const it = s.inventory.items.at(-1);
  assert.equal(it.base, 'generalSword');
  assert.equal(it.plan, 'cavalrySaber');
  assert.ok(it.affixes['class.cavalry.atk'] > 0, 'effet spécial appliqué');
  assert.match(it.name, /Sabre de cavalier/);
  // Atelier : premier choix gratuit, puis délai
  const gold = s.resources.gold;
  assert.ok(setWorkshop(s, 'arms', T0).ok);
  assert.equal(s.resources.gold, gold);
  const cheap = craftCost('weapon', 'none', computeMods(s, T0), s);
  const dear = craftCost('ring', 'none', computeMods(s, T0), s);
  assert.ok(cheap.steel < plain.steel, 'armes moins chères');
  assert.ok(dear.gold > 120, 'autres emplacements plus chers');
  assert.match(setWorkshop(s, 'armor', T0 + H).reason, /24 h/);
  assert.ok(setWorkshop(s, 'armor', T0 + 25 * H).ok);
  // Donjons : chance d'un plan (rng 0.2 < 1/3)
  s.stats.dungeons = (s.stats.dungeons || 0) + 1;
  recipesTick(s, T0);
  assert.ok(Object.keys(s.recipes.known).filter((id) => PLANS[id].src === 'dungeon').length >= 2);
  // Factions : achat seulement avec un accord
  assert.match(buyFactionPlan(s, 'merchantSignet', T0).reason, /accord commercial/);
  s.factions[0].stance = 'trade';
  assert.ok(buyFactionPlan(s, 'merchantSignet', T0).ok);
  // Héros : niveau requis
  assert.match(learnFromHero(s, 'marshalBoots', T0).reason, /niveau 8/);
  s.heroes[0].level = 8;
  assert.ok(learnFromHero(s, 'marshalBoots', T0).ok, 'le général de départ enseigne son plan');
  // Expérimentation
  const e = experiment(s, T0);
  assert.ok(e.ok && e.found);
});
