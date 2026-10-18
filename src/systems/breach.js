// Les Seigneurs de la Brèche : forteresses PNJ évolutives (données et équilibrage : data/breach.js).
// Une forteresse est un lieu de la carte (type breachFort) qui porte son état dans poi.breach :
//   { id, level, xp, doctrine, cycle, lord, seen{classe: part}, attacks, wins, losses, ignored, history[],
//     lastRewards, garrison?, restoreAt?, lastLossAt?, changes[] }
// Le combat utilise le moteur commun (marches.js → simulateBattle) ; ce module calcule la défense, applique
// l'évolution et prépare les récompenses. Les statistiques globales sont dans state.breach.
import {
  BREACH_MAX_LEVEL, BREACH_MIN_MERIT, BREACH_MAX_LOSS_MERIT, BREACH_TIERS, tierOf, BREACH_PROGRESS, BREACH_POWER,
  BREACH_DOCTRINES, BREACH_ROLES, BREACH_COUNTERS, BREACH_ADAPT_MAX, breachFormation, BREACH_LORD, BREACH_REWARDS,
  BREACH_FIRST, BREACH_UNWORTHY_LOOT, BREACH_SITES, breachLordName,
} from '../data/breach.js';
import { ALL_UNITS } from '../data/units.js';
import { FORMATIONS } from '../data/units.js';
import { rng } from '../core/rng.js';
import { spawnPoi, findFreeTile, reveal, key } from './world.js';
import { log, feat } from './log.js';
import { chronicle } from './chronicle.js';
import { nemesisReinforcement, nemesisAfterBattle } from './nemesis.js';
import { NEMESIS } from '../data/nemesis.js';

const MIN = 60000;
const unitPower = (u) => { const d = ALL_UNITS[u]; return (d.atk + d.def) * Math.sqrt(d.hp / 30); };

export function breachState(state) {
  const B = (state.breach && typeof state.breach === 'object' && !Array.isArray(state.breach)) ? state.breach : (state.breach = {});
  B.placed ??= false;
  B.firstTier ||= {};
  B.defeated ||= {};
  B.stats ||= {};
  return B;
}
export const breachForts = (state) => Object.values(state.world?.pois || {}).filter((p) => p.type === 'breachFort' && p.breach);
export const breachTier = (b) => tierOf(b.level);

// ───────── Placement (nouvelle partie ou ancienne sauvegarde) ─────────
export function ensureBreach(state, now = Date.now()) {
  const B = breachState(state);
  if (B.placed || !state.world?.capital) return 0;
  const w = state.world, c = w.capital;
  let n = 0;
  const off = rng.int(0, 9); // noms de seigneurs tous différents
  BREACH_SITES.forEach((site, i) => {
    let pos = null;
    for (let k = 0; k < 40 && !pos; k++) {
      const a = rng.float(0, Math.PI * 2), d = rng.float(site.dist[0], site.dist[1]);
      const x = Math.round(c.x + Math.cos(a) * d), y = Math.round(c.y + Math.sin(a) * d);
      if (x < 1 || y < 1 || x >= w.size - 1 || y >= w.size - 1) continue;
      pos = findFreeTile(w, x, y, ['plain', 'hills', 'forest', 'ash', 'ruins', 'snow', 'mountain'], 2);
    }
    if (!pos) return;
    const p = spawnPoi(w, 'breachFort', pos.x, pos.y, { danger: 0 });
    const doctrines = Object.keys(BREACH_DOCTRINES);
    p.breach = { id: `br${i}`, level: site.level, xp: 0, doctrine: doctrines[(i + rng.int(0, 3)) % doctrines.length], cycle: 0, lord: breachLordName(off + i),
      seen: {}, attacks: 0, wins: 0, losses: 0, ignored: 0, history: [], changes: [], born: now };
    p.danger = Math.min(6, 1 + Math.floor((site.level - 1) / 3));
    p.name = fortName(p.breach);
    if (site.reveal) reveal(w, pos.x, pos.y, 1);
    n++;
  });
  B.placed = true;
  if (n) log(state, 'event', `🏴 Des forteresses se dressent dans les Terres Brisées : les Seigneurs de la Brèche défient votre royaume (${n} repérées). Plus vous les vaincrez, plus elles se renforceront.`, now);
  return n;
}
export const fortName = (b) => `${tierOf(b.level).short} de ${b.lord}`;

// ───────── Défense ─────────
const powerOf = (b) => BREACH_POWER.base * Math.pow(BREACH_POWER.growth, b.level - 1) * (1 + BREACH_POWER.cycleBonus * Math.min(BREACH_POWER.cycleMax, b.cycle || 0));

// Parts de chaque rôle : doctrine, puis adaptation aux classes qui ont battu la forteresse
export function roleShares(b) {
  const t = tierOf(b.level).n;
  const base = { ...BREACH_DOCTRINES[b.doctrine]?.shares };
  const adapt = {};
  for (const [cls, share] of Object.entries(b.seen || {})) { const r = BREACH_COUNTERS[cls]; if (r) adapt[r] = (adapt[r] || 0) + share * BREACH_ADAPT_MAX; }
  const out = {};
  for (const [r, def] of Object.entries(BREACH_ROLES)) if (def.tier <= t) out[r] = (base[r] || 0) + (adapt[r] || 0);
  const tot = Object.values(out).reduce((a, v) => a + v, 0) || 1;
  for (const r of Object.keys(out)) out[r] /= tot;
  return out;
}

// Composition complète (sans pertes) au niveau courant
export function breachComposition(b) {
  const target = powerOf(b);
  const t = tierOf(b.level).n;
  const units = {};
  let left = target;
  if (t >= 4) { units[BREACH_LORD.unit] = 1 + Math.floor((b.level - 16) / 2); left -= unitPower(BREACH_LORD.unit) * units[BREACH_LORD.unit]; }
  for (const [r, share] of Object.entries(roleShares(b))) {
    const u = BREACH_ROLES[r].unit;
    const n = Math.max(share > 0 ? 1 : 0, Math.round((left * share) / unitPower(u)));
    if (n > 0) units[u] = n;
  }
  return units;
}

// Tout ce que le moteur de combat doit savoir sur la défense de la forteresse
export function breachDefense(state, poi, now = Date.now()) {
  const b = poi.breach;
  const tier = tierOf(b.level);
  const doc = BREACH_DOCTRINES[b.doctrine];
  const full = breachComposition(b);
  const wounded = b.garrison && b.restoreAt > now;
  // v15 — Némésis : contre-unités recrutées contre votre classe dominante (au plus +20 % de puissance)
  const nem = nemesisReinforcement(b, powerOf(b), now);
  if (!wounded) for (const [u, n] of Object.entries(nem.units)) full[u] = (full[u] || 0) + n;
  const enemies = wounded ? b.garrison : full;
  const fort = Math.round(fortOf(b) * 100) / 100;
  const enemyMods = { 'combat.atk': 0.02 * b.level, 'combat.def': 0.02 * b.level };
  if (tier.n >= 4) for (const [k, v] of Object.entries(BREACH_LORD.aura)) enemyMods[k] = (enemyMods[k] || 0) + v;
  return { enemies, full, wounded, fort, enemyMods, formation: breachFormation(tier.n, b.doctrine), tier, doctrine: doc, commander: tier.n >= 4 ? b.lord : null, nemesis: nem };
}

export const breachRuined = (poi, now) => poi.clearedUntil > now;

// ───────── Évolution ─────────
const classShares = (units) => {
  const out = {}; let tot = 0;
  for (const [u, n] of Object.entries(units || {})) { const c = ALL_UNITS[u]?.class; if (!c || c === 'special') continue; out[c] = (out[c] || 0) + n; tot += n; }
  for (const c of Object.keys(out)) out[c] /= tot || 1;
  return out;
};

// Explique ce qui change entre deux états de la forteresse (affiché au joueur)
function describeChange(before, after, b) {
  const lines = [];
  for (const [u, n] of Object.entries(after.units)) { const d = n - (before.units[u] || 0); if (d > 0) lines.push(`+${d} × ${ALL_UNITS[u].name}`); }
  if (after.fort > before.fort) lines.push(`murs +${Math.round((after.fort - before.fort) * 100)} % de défense`);
  if (after.formation !== before.formation) lines.push(`nouvelle formation : ${FORMATIONS[after.formation].name}`);
  if (after.tier.n > before.tier.n) lines.push(`devient ${after.tier.name.toLowerCase()}`);
  if (after.tier.n >= 4 && before.tier.n < 4) lines.push(`${b.lord} prend le commandement en personne`);
  return lines;
}
// Bonus des murs : palier + 2 % par niveau dans le palier + doctrine « fortifications » (à partir du palier 2)
export const fortOf = (b) => { const t = tierOf(b.level); return t.fort + (b.level - t.from) * 0.02 + (t.n >= 2 ? BREACH_DOCTRINES[b.doctrine]?.fort || 0 : 0); };
const snap = (b) => { const t = tierOf(b.level); return { units: breachComposition(b), fort: fortOf(b), formation: breachFormation(t.n, b.doctrine), tier: t }; };

// Gagne des points de progression ; renvoie le texte des évolutions (montées de niveau)
function addProgress(b, pts) {
  const out = [];
  if (b.level >= BREACH_MAX_LEVEL) return out;
  b.xp += pts;
  while (b.level < BREACH_MAX_LEVEL && b.xp >= BREACH_PROGRESS.need(b.level)) {
    const before = snap(b);
    b.xp -= BREACH_PROGRESS.need(b.level);
    b.level++;
    const ch = describeChange(before, snap(b), b);
    out.push(`niveau ${b.level}${ch.length ? ` (${ch.join(', ')})` : ''}`);
  }
  if (b.level >= BREACH_MAX_LEVEL) b.xp = 0;
  return out;
}

export const nextStep = (b) => {
  if (b.level >= BREACH_MAX_LEVEL) return { text: 'Niveau maximal : une victoire la forcera à se réorganiser (nouvelle doctrine, niveau 16, cycle suivant plus fort).', pct: 100 };
  const need = BREACH_PROGRESS.need(b.level);
  const after = { ...b, level: b.level + 1 };
  const ch = describeChange(snap(b), snap(after), after);
  return { need, have: b.xp, pct: Math.round((b.xp / need) * 100), text: `Niveau ${b.level + 1} : ${ch.join(', ') || 'garnison renforcée'}.` };
};

// Applique le résultat d'un combat. Renvoie { worthy, merit, evolved[], rewards, text } — les récompenses sont
// calculées ici mais versées par l'appelant (marches.js), dans le butin de la marche.
export function onBreachBattle(state, poi, res, ctx, now = Date.now()) {
  const B = breachState(state), b = poi.breach;
  const win = res.winner === 'attacker';
  const merit = ctx.merit;
  const tier = tierOf(b.level);
  b.attacks++;
  const entry = { t: now, win, level: b.level, merit: Math.round(merit * 100) / 100, sent: ctx.sentCount, lost: ctx.lost, formation: ctx.formation };
  let evolved = [];
  let worthy;
  let rewards = null;
  if (win) {
    worthy = merit >= BREACH_MIN_MERIT;
    b.wins++;
    // La garnison retient les armes qui l'ont battue (moyenne glissante) → contre-unités au prochain niveau
    if (worthy) { const sh = classShares(ctx.units); for (const c of new Set([...Object.keys(b.seen), ...Object.keys(sh)])) b.seen[c] = Math.round(((b.seen[c] || 0) * 0.6 + (sh[c] || 0) * 0.4) * 100) / 100; }
    rewards = breachRewards(state, b, tier, worthy, now);
    if (worthy) {
      evolved = addProgress(b, BREACH_PROGRESS.win(merit));
      if (!B.firstTier[tier.n]) { B.firstTier[tier.n] = now; rewards.first = BREACH_FIRST[tier.n - 1]; }
      B.defeated[b.id] = (B.defeated[b.id] || 0) + 1;
      const st = state.stats;
      st.breachWins = (st.breachWins || 0) + 1;
      st.breachTierMax = Math.max(st.breachTierMax || 0, tier.n);
      if ((ctx.lostRatio || 0) <= 0.1) st.breachCleanWins = (st.breachCleanWins || 0) + 1;
      const shares = classShares(ctx.units);
      if (Object.values(shares).some((v) => v >= 0.7)) st.breachSpecialWins = (st.breachSpecialWins || 0) + 1;
    } else b.ignored++;
    // Ruines : la garnison se reforme après un délai (pas de boucle immédiate sur la même cible)
    poi.clearedUntil = now + tier.ruinsMin * MIN;
    b.garrison = null; b.restoreAt = 0;
    // Niveau maximal battu : réorganisation contrôlée (nouvelle doctrine, niveau 16, cycle suivant, longue reconstruction)
    if (worthy && b.level >= BREACH_MAX_LEVEL && !evolved.length) {
      const others = Object.keys(BREACH_DOCTRINES).filter((d) => d !== b.doctrine);
      b.doctrine = rng.pick(others); b.cycle = (b.cycle || 0) + 1; b.level = 16; b.xp = 0; b.seen = {};
      poi.clearedUntil = now + 12 * 60 * MIN;
      evolved.push(`réorganisation : doctrine « ${BREACH_DOCTRINES[b.doctrine].name} », niveau 16, cycle ${b.cycle + 1}`);
      chronicle(state, `🏴 ${poi.name} tombe au sommet de sa puissance ; ${b.lord} se replie et reconstruit autrement.`, now);
    }
  } else {
    b.losses++;
    // Les pertes de la garnison restent visibles 20 min, puis elle est de nouveau au complet
    b.garrison = { ...res.defRemaining }; b.restoreAt = now + 20 * MIN;
    worthy = merit >= BREACH_MIN_MERIT && merit <= BREACH_MAX_LOSS_MERIT;
    if (worthy && !(b.lastLossAt > now - BREACH_PROGRESS.lossCooldownMin * MIN)) { evolved = addProgress(b, BREACH_PROGRESS.loss); b.lastLossAt = now; }
    else if (!worthy) b.ignored++;
  }
  // v15 — Némésis : le seigneur retient les assauts méritants (cicatrices, titres, mémoire de votre armée)
  let nem = null;
  if (worthy) {
    nem = nemesisAfterBattle(b, { win, units: ctx.units }, now);
    if (nem.revenge && rewards) for (const r of Object.keys(rewards.res)) rewards.res[r] = Math.round(rewards.res[r] * (1 + NEMESIS.revengeLoot));
    if (nem.title) chronicle(state, `🏴 ${b.lord} repousse votre assaut et se fait désormais appeler « ${nem.title} ».`, now);
    if (nem.revenge) chronicle(state, `⚔️ Revanche sur ${b.lord} : le titre « ${nem.revenge} » lui est arraché.`, now);
  }
  poi.danger = Math.min(6, 1 + Math.floor((b.level - 1) / 3));
  poi.name = fortName(b);
  if (evolved.length) b.changes.unshift({ t: now, text: evolved.join(' ; ') });
  b.changes.length = Math.min(b.changes.length, 8);
  entry.evolved = evolved.join(' ; ');
  b.history.unshift(entry);
  b.history.length = Math.min(b.history.length, 12);
  if (evolved.length && tierOf(b.level).n > tier.n) feat('🏴', `${poi.name}`, `La forteresse devient ${tierOf(b.level).name.toLowerCase()}.`, 'bad');
  return { worthy, merit, evolved, rewards, win, nem };
}

// Récompenses d'une victoire (butin courant, rares, objets, XP, passe-temps)
function breachRewards(state, b, tier, worthy, now) {
  const R = BREACH_REWARDS[tier.n - 1];
  const k = (1 + 0.12 * (b.level - 1)) * (worthy ? 1 : BREACH_UNWORTHY_LOOT);
  const res = {};
  for (const [r, v] of Object.entries(R.res)) res[r] = Math.round(v * k * rng.float(0.9, 1.1));
  const out = { res, items: [], xp: worthy ? R.xp : 0, speedTable: worthy ? R.speedups : null, rareSpeedup: worthy ? R.rareSpeedup : null, relic: 0 };
  if (worthy) {
    if (rng.chance(R.item[0])) out.items.push(rng.chance(R.legendary || 0) ? 'legendary' : R.item[1]);
    if (R.relic && rng.chance(R.relic)) out.relic = 1;
  }
  b.lastRewards = { t: now, res, items: out.items.length, worthy };
  return out;
}

// Ce que le joueur peut espérer (fiche) : par palier courant
export function rewardPreview(b) {
  const t = tierOf(b.level), R = BREACH_REWARDS[t.n - 1];
  const k = 1 + 0.12 * (b.level - 1);
  return { res: Object.fromEntries(Object.entries(R.res).map(([r, v]) => [r, Math.round(v * k)])), item: R.item, legendary: R.legendary || 0, relic: R.relic || 0, xp: R.xp, speedups: R.speedups, rareSpeedup: R.rareSpeedup || null, first: BREACH_FIRST[t.n - 1] };
}

// Moteur : place les forteresses si besoin (nouvelle partie, ancienne sauvegarde)
export function breachTick(state, now) {
  if (!breachState(state).placed) ensureBreach(state, now);
}

export { BREACH_TIERS, key };
