// Simulation Monte-Carlo de l'économie des Éclats Anciens pour trois profils de joueurs.
// Utilise le VRAI code du jeu (rollShards, rendements décroissants, plafonds, Roue, pitié).
// Lancer : node tools/economySim.js [jours] [graines]
import { createNewState } from '../src/core/state.js';
import { rng, mulberry32 } from '../src/core/rng.js';
import { shardState, rollShards, addShards, spendShards, spin, claimFreeTicket, freeTicketAt, PROFILES } from '../src/systems/shards.js';
import { shardCfg } from '../src/systems/config.js';

const H = 3600000;

// Nombre d'occurrences par jour (fraction → tirage)
const times = (x) => Math.floor(x) + (rng.random() < x % 1 ? 1 : 0);

export function simulateProfile(profileKey, days = 90, seed = 1) {
  rng.setSource(mulberry32(seed * 7919 + profileKey.length));
  const p = PROFILES[profileKey];
  const t0 = Date.UTC(2026, 0, 5);
  const s = createNewState({ seed: 'eco' + seed, now: t0 });
  const sh = shardState(s);
  const fb = shardCfg(s).forbidden;
  const tiers = { common: 0, rare: 0, epic: 0, legendary: 0, mythic: 0 };
  let firstLegendary = null, firstMythic = null, jackpots = 0, forbiddenRuns = 0, lastForbidden = -Infinity;
  for (let d = 0; d < days; d++) {
    const day = t0 + d * 24 * H;
    // Les activités sont étalées sur la journée de jeu (16 h) : la « chaleur » a le temps de retomber
    const acts = [];
    const push = (n, fn) => { for (let i = 0; i < times(n); i++) acts.push(fn); };
    push(p.rareExpeditions, (t) => rollShards(s, 'expedition', t));
    push(p.expeditions * 0.02, (t) => { if (rng.random() < p.intervene && rng.random() < 0.6) rollShards(s, 'anomaly', t, { chance: 1 }); });
    push(p.deepDungeons, (t) => rollShards(s, 'dungeon', t, { chance: 0.18, amount: [1, 2] }));
    push(p.bosses, (t) => { rollShards(s, 'boss', t); if (p.bosses >= 4 && rng.random() < 0.3) rollShards(s, 'boss', t, { chance: 0.25, amount: [1, 1] }); });
    push(p.explorations, (t) => rollShards(s, 'exploration', t));
    push(p.eventShards, (t) => addShards(s, 1, 'event', t, 'boutique'));
    acts.sort(() => rng.random() - 0.5);
    acts.forEach((fn, i) => fn(day + 6 * H + (i / Math.max(1, acts.length)) * 16 * H));
    // Expédition interdite (une tentative tous les 3 jours au plus)
    if (p.forbidden && day - lastForbidden >= fb.cooldownHours * H && rng.random() < p.forbidden) {
      lastForbidden = day; forbiddenRuns++;
      const r = rng.random();
      if (r >= fb.outcomes.fail) {
        const [a, b] = r < fb.outcomes.fail + fb.outcomes.partial ? fb.partial : fb.success;
        addShards(s, rng.int(a, b), 'forbidden', day + 20 * H);
      }
    }
    // Ticket hebdomadaire gratuit
    const evening = day + 22 * H;
    if (evening >= freeTicketAt(s)) claimFreeTicket(s, evening);
    // Le joueur convertit ses Éclats en tickets et tourne la Roue
    while (sh.count >= shardCfg(s).ticketCost) spendShards(s, 'ticket', null, evening);
    while (sh.tickets > 0) {
      const r = spin(s, evening);
      tiers[r.tier]++;
      if (r.reward.id === 'jackpot') jackpots++;
      if ((r.tier === 'legendary' || r.tier === 'mythic') && firstLegendary === null) firstLegendary = d + 1;
      if (r.tier === 'mythic' && firstMythic === null) firstMythic = d + 1;
    }
  }
  const gen = s.stats.shardsFound || 0;
  const bySource = {};
  for (const L of Object.values(sh.ledger)) for (const [k2, v] of Object.entries(L.bySource)) bySource[k2] = (bySource[k2] || 0) + v;
  const spins = Object.values(tiers).reduce((a, b) => a + b, 0);
  rng.setSource(null);
  return { profile: p.name, days, generated: gen, bySource, perDay: gen / days, spins, daysPerTicket: spins ? days / spins : Infinity, tiers, firstLegendary, firstMythic, jackpots, forbiddenRuns, mythicFragments: sh.mythicFragments };
}

export function simulateAll(days = 90, seeds = 20) {
  const out = {};
  for (const k of Object.keys(PROFILES)) {
    const runs = Array.from({ length: seeds }, (_, i) => simulateProfile(k, days, i + 1));
    const avg = (f) => runs.reduce((a, r) => a + f(r), 0) / runs.length;
    const med = (f) => { const v = runs.map(f).filter((x) => x !== null).sort((a, b) => a - b); return v.length ? v[Math.floor(v.length / 2)] : null; };
    out[k] = {
      profile: runs[0].profile, perDay: avg((r) => r.perDay), spins: avg((r) => r.spins), daysPerTicket: avg((r) => r.daysPerTicket),
      legendaryPlus: avg((r) => r.tiers.legendary + r.tiers.mythic), mythic: avg((r) => r.tiers.mythic), jackpotRate: avg((r) => r.jackpots),
      medFirstLegendary: med((r) => r.firstLegendary), shareWithMythic: runs.filter((r) => r.tiers.mythic > 0).length / runs.length,
      mythicFragments: avg((r) => r.mythicFragments),
    };
  }
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const days = +(process.argv[2] || 90), seeds = +(process.argv[3] || 20);
  const res = simulateAll(days, seeds);
  console.log(`Simulation sur ${days} jours, ${seeds} joueurs par profil\n`);
  console.log('| Profil | Éclats/jour | Jours/ticket | Tours | Légendaire+ | Mythique | Joueurs avec ≥1 mythique | 1er légendaire+ (médiane) | Frag. mythiques |');
  console.log('|---|---|---|---|---|---|---|---|---|');
  for (const r of Object.values(res)) console.log(`| ${r.profile} | ${r.perDay.toFixed(2)} | ${r.daysPerTicket.toFixed(1)} | ${r.spins.toFixed(1)} | ${r.legendaryPlus.toFixed(2)} | ${r.mythic.toFixed(2)} | ${Math.round(r.shareWithMythic * 100)} % | ${r.medFirstLegendary ?? '—'} j | ${r.mythicFragments.toFixed(0)} |`);
}
