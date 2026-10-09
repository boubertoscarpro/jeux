// Éclats Anciens & Roue des Anciens : pitié, doublons, rendements décroissants, plafonds, profils de joueurs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createNewState } from '../src/core/state.js';
import { rng, mulberry32 } from '../src/core/rng.js';
import { WHEEL_CONFIG, TIER_ORDER } from '../src/data/shards.js';
import {
  shardState, addShards, rollShards, sourceMultiplier, spin, spendShards, claimFreeTicket, freeTicketAt, grantReward, craftMythic,
} from '../src/systems/shards.js';
import { simulateAll } from '../tools/economySim.js';

const T0 = Date.UTC(2026, 0, 5);
const fresh = () => createNewState({ seed: 'shards', now: T0 });

test('Roue : probabilités cohérentes (somme = 100 %)', () => {
  const sum = TIER_ORDER.reduce((a, t) => a + WHEEL_CONFIG.probs[t], 0);
  assert.ok(Math.abs(sum - 1) < 1e-9);
});

test('Roue : la pitié garantit un rare en 10 tours et un légendaire en 50', () => {
  rng.setSource(() => 0.01); // toujours « Commun » sans pitié
  const s = fresh();
  const sh = shardState(s);
  sh.tickets = 100;
  const tiers = [];
  for (let i = 0; i < 100; i++) tiers.push(spin(s, T0).tier);
  rng.setSource(null);
  assert.equal(tiers[9], 'rare');
  assert.ok(['legendary', 'mythic'].includes(tiers[49]), `tour 50 : ${tiers[49]}`);
  assert.equal(tiers[99], 'mythic');
  // Jamais plus de 9 tours d'affilée sans au moins un rare
  let run = 0;
  for (const t of tiers) { run = t === 'common' ? run + 1 : 0; assert.ok(run < 10); }
});

test('Roue : un tour coûte un ticket et donne des fragments ; sans ticket, refus', () => {
  const s = fresh();
  assert.equal(spin(s, T0).ok, false);
  shardState(s).tickets = 1;
  const r = spin(s, T0);
  assert.ok(r.ok);
  assert.equal(shardState(s).tickets, 0);
  assert.ok(shardState(s).mythicFragments >= 1);
  assert.equal(shardState(s).history.length, 1);
});

test('Doublons : un objet exclusif déjà possédé devient des fragments', () => {
  const s = fresh();
  const rw = { id: 'm_blade', label: 'Brise-Royaume', give: { unique: 'kingdomBreaker' } };
  grantReward(s, rw, 'mythic', T0);
  const items = s.inventory.items.length;
  const before = shardState(s).mythicFragments;
  const r = grantReward(s, rw, 'mythic', T0);
  assert.equal(s.inventory.items.length, items, 'pas de second exemplaire');
  assert.ok(shardState(s).mythicFragments > before);
  assert.match(r.text, /doublon/);
});

test('Fragments : 100 fragments mythiques permettent de choisir un objet mythique', () => {
  const s = fresh();
  shardState(s).mythicFragments = 99;
  assert.equal(craftMythic(s, 'm_king', T0).ok, false);
  shardState(s).mythicFragments = 100;
  assert.ok(craftMythic(s, 'm_king', T0).ok);
  assert.ok(s.heroes.some((h) => h.special?.key === 'crownlessKing'));
});

test('Dépenses : 10 Éclats = 1 ticket ; options alternatives', () => {
  const s = fresh();
  addShards(s, 135, 'admin', T0);
  assert.ok(spendShards(s, 'ticket', null, T0).ok);
  assert.equal(shardState(s).tickets, 1);
  assert.ok(spendShards(s, 'chest', null, T0).ok);
  assert.ok(spendShards(s, 'relic', null, T0).ok);
  assert.equal(spendShards(s, 'guaranteed', null, T0).ok, false, 'choix obligatoire');
  assert.equal(shardState(s).count, 135 - 10 - 25 - 50);
  assert.equal(spendShards(s, 'guaranteed', 'l_item', T0).ok, false, 'pas assez');
});

test('Ticket gratuit : un tous les 7 jours', () => {
  const s = fresh();
  assert.ok(claimFreeTicket(s, T0).ok);
  assert.equal(claimFreeTicket(s, T0 + 3 * 86400000).ok, false);
  assert.ok(freeTicketAt(s) === T0 + 7 * 86400000);
  assert.ok(claimFreeTicket(s, T0 + 7 * 86400000).ok);
});

test('Rendements décroissants et plafond quotidien', () => {
  const s = fresh();
  const t = T0 + 4 * 86400000; // hors période de « sécheresse » initiale
  addShards(s, 1, 'boss', t - 3600000); // trouvaille récente : pas de bonus de sécheresse
  const m0 = sourceMultiplier(s, 'exploration', t);
  addShards(s, 1, 'exploration', t);
  const m1 = sourceMultiplier(s, 'exploration', t);
  assert.ok(m1 < m0, 'la chaleur réduit la chance');
  addShards(s, 2, 'exploration', t);
  const m2 = sourceMultiplier(s, 'exploration', t);
  assert.ok(m2 < m1 * 0.3, 'au-delà du plafond, chute forte');
  // La chaleur retombe avec le temps
  assert.ok(sourceMultiplier(s, 'exploration', t + 30 * 3600000) > m2);
});

test('Une source rare reste rare : 1 000 tentatives d’exploration donnent peu d’Éclats', () => {
  rng.setSource(mulberry32(42));
  const s = fresh();
  for (let i = 0; i < 1000; i++) rollShards(s, 'exploration', T0 + i * 600000);
  rng.setSource(null);
  assert.ok(shardState(s).count <= 25, `${shardState(s).count} Éclats`);
});

test('Profils occasionnel / actif / hardcore : aucun ne casse l’économie', () => {
  const r = simulateAll(60, 8);
  const { casual, active, hardcore } = r;
  // Ordres de grandeur visés (Éclats par jour)
  assert.ok(casual.perDay > 0.1 && casual.perDay < 1, `occasionnel ${casual.perDay}`);
  assert.ok(active.perDay > 1 && active.perDay < 3.5, `actif ${active.perDay}`);
  assert.ok(hardcore.perDay > 3 && hardcore.perDay < 8, `hardcore ${hardcore.perDay}`);
  // L'écart reste raisonnable grâce aux rendements décroissants et au ticket gratuit
  assert.ok(hardcore.spins / casual.spins < 7, `écart de tours ${hardcore.spins / casual.spins}`);
  // Un mythique reste exceptionnel, même pour un hardcore, sur deux mois
  assert.ok(hardcore.mythic < 1.5);
  assert.ok(casual.spins >= 8, 'même un joueur occasionnel tourne la Roue chaque semaine');
});
