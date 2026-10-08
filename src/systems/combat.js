import { ALL_UNITS, FORMATIONS, TERRAIN_COMBAT, WEATHER, UNIT_CLASSES } from '../data/units.js';
import { rng } from '../core/rng.js';
import { clamp } from '../core/util.js';

const MITIGATION_K = 40;

function buildStacks(units, hpOverride) {
  return Object.entries(units || {})
    .filter(([, n]) => n > 0)
    .map(([type, count]) => {
      const def = ALL_UNITS[type];
      const hp = hpOverride && def.class === 'boss' ? hpOverride : def.hp;
      return { type, def, cls: def.class, count, start: count, hp };
    });
}

function sideMults(side, enemy, ctx, notes, label) {
  const f = FORMATIONS[side.formation] || FORMATIONS.balanced;
  const fm = f.mods || {};
  const terrain = TERRAIN_COMBAT[ctx.terrain] || {};
  const weather = WEATHER[ctx.weather] || {};
  const mods = side.mods || {};
  const stacksTotal = side.stacks.reduce((s, x) => s + x.count, 0) || 1;
  const cavShare = side.stacks.filter((s) => s.cls === 'cavalry').reduce((s, x) => s + x.count, 0) / stacksTotal;

  // Retranchements des ingénieurs
  const engineers = side.stacks.find((s) => s.type === 'engineer')?.count || 0;
  const entrench = Math.min(0.2 * (1 + (mods['engineer.power'] || 0)), engineers * 0.005 * (1 + (mods['engineer.power'] || 0)));
  if (entrench > 0) notes.push(`${label} : retranchements des ingénieurs +${Math.round(entrench * 100)}% défense`);

  for (const st of side.stacks) {
    let a = 1 + (mods['combat.atk'] || 0) + (fm.atk || 0);
    a += terrain.classAtk?.[st.cls] || 0;
    a += weather.classAtk?.[st.cls] || 0;
    a += weather.unitAtk?.[st.type] || 0;
    a += mods[`class.${st.cls}.atk`] || 0;
    a += mods[`unit.${st.type}.atk`] || 0;
    a += fm.classAtk?.[st.cls] || 0;
    if (fm.pincer && st.cls === 'cavalry') a += cavShare >= 0.25 ? 0.3 : -0.1;
    if (fm.pincer && st.cls !== 'cavalry' && cavShare < 0.25) a -= 0.1;
    if (st.cls === 'siege') a += mods['siege.power'] || 0;
    let d = 1 + (mods['combat.def'] || 0) + (fm.def || 0) + entrench;
    d += fm.classDef?.[st.cls] || 0;
    d += terrain.classDef?.[st.cls] || 0;
    if (side.fort) d += side.fort;
    st.atkMult = Math.max(0.2, a);
    st.defMult = Math.max(0.2, d);
    st.protect = fm.protectRanged && st.cls === 'ranged' ? fm.protectRanged : 0;
  }
}

function initialMorale(side, enemy, notes, label) {
  const mods = side.mods || {};
  let m = 100 + (mods['combat.morale'] || 0);
  if (side.supply) { m += 15; notes.push(`${label} : rations de pain +15 moral`); }
  if (side.famine) { m -= 30; notes.push(`${label} : famine −30 moral`); }
  const assassins = enemy.stacks.find((s) => s.type === 'assassin')?.count || 0;
  if (assassins) {
    const hit = Math.min(25, assassins * 1.5);
    m -= hit;
    notes.push(`${label} : assassins ennemis −${Math.round(hit)} moral`);
  }
  if (side.isBoss) m = 1000;
  return m;
}

const moraleFactor = (m) => clamp(0.55 + 0.45 * (m / 100), 0.5, 1.25);

// Une passe d'attaque d'un côté sur l'autre ; renvoie dégâts par pile cible (index)
function attackPass(att, def, phase, deterministic) {
  const dmg = new Array(def.stacks.length).fill(0);
  const alive = def.stacks.filter((s) => s.count > 0.01);
  if (!alive.length) return dmg;
  const lossMult = Math.max(0.4, 1 + (def.mods?.['combat.losses'] || 0));
  const skirmish = FORMATIONS[att.formation]?.mods?.extraVolley;
  for (const a of att.stacks) {
    if (a.count <= 0.01) continue;
    const isVolley = a.cls === 'ranged' || a.def.volley;
    if (phase === 'volley' && !isVolley) continue;
    const variance = deterministic ? 1 : rng.float(0.88, 1.12);
    let raw = a.count * a.def.atk * a.atkMult * moraleFactor(att.morale) * variance;
    if (phase === 'volley' && skirmish) raw *= 1.5;
    if (a.cls === 'special' && a.type === 'scout') raw *= 0.5;
    // Exposition : les tireurs/siège sont protégés derrière la ligne (sauf contre la cavalerie)
    const weights = def.stacks.map((t) => {
      if (t.count <= 0.01) return 0;
      let w = t.count * t.hp;
      if ((t.cls === 'ranged' || t.cls === 'siege') && a.cls !== 'cavalry') w *= 0.5;
      return w;
    });
    const total = weights.reduce((s, w) => s + w, 0) || 1;
    def.stacks.forEach((t, i) => {
      if (!weights[i]) return;
      const share = weights[i] / total;
      const vs = a.def.vs?.[t.cls] || 1;
      const pierce = a.def.pierce || 0;
      const mit = MITIGATION_K / (MITIGATION_K + t.def.def * t.defMult * (1 - pierce));
      let d = raw * share * vs * mit;
      if (a.cls === 'ranged' || a.def.volley) d *= 1 - (t.def.rangedResist || 0) - (t.protect || 0);
      dmg[i] += Math.max(0, d) * lossMult;
    });
  }
  return dmg;
}

function applyDamage(side, dmg) {
  const lost = {};
  let hpLost = 0;
  side.stacks.forEach((s, i) => {
    if (!dmg[i]) return;
    const kills = Math.min(s.count, dmg[i] / s.hp);
    s.count -= kills;
    hpLost += kills * s.hp;
    lost[s.type] = (lost[s.type] || 0) + kills;
  });
  return { lost, hpLost };
}

const sideHp = (side) => side.stacks.reduce((s, x) => s + x.count * x.hp, 0);
const sidePower = (side) => side.stacks.reduce((s, x) => s + x.count * (x.def.atk * x.atkMult + x.def.def * x.defMult) * Math.sqrt(x.hp / 30), 0);
const roundUnits = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, Math.round(v)]).filter(([, v]) => v > 0));

/**
 * Simule une bataille.
 * attacker/defender : { units, mods, formation, supply, famine, fort, label }
 * ctx : { terrain, weather, maxRounds, deterministic, bossHp }
 */
export function simulateBattle(attacker, defender, ctx = {}) {
  const deterministic = !!ctx.deterministic;
  const maxRounds = ctx.maxRounds || 6;
  const notes = [];
  const A = { ...attacker, stacks: buildStacks(attacker.units) };
  const D = { ...defender, stacks: buildStacks(defender.units, ctx.bossHp), isBoss: !!ctx.bossHp };

  // Siège : réduction du bonus de muraille
  if (D.fort > 0) {
    const breakPow = A.stacks.reduce((s, x) => s + (x.def.wallBreak || 0) * x.count, 0) * (1 + (A.mods?.['siege.power'] || 0));
    const before = D.fort;
    D.fort = Math.max(0, D.fort - breakPow);
    notes.push(`Murailles : +${Math.round(before * 100)}% défense${breakPow > 0 ? ` (réduites à +${Math.round(D.fort * 100)}% par vos engins)` : ''}`);
  }
  const t = TERRAIN_COMBAT[ctx.terrain];
  if (t) notes.push(`Terrain — ${t.name} : ${t.note}`);
  const w = WEATHER[ctx.weather];
  if (w && ctx.weather !== 'clear') notes.push(`Météo — ${w.name} : ${w.note}`);
  if (attacker.formation) notes.push(`Votre formation : ${FORMATIONS[attacker.formation].name}`);

  sideMults(A, D, ctx, notes, attacker.label || 'Attaquant');
  sideMults(D, A, ctx, notes, defender.label || 'Défenseur');
  A.morale = initialMorale(A, D, notes, attacker.label || 'Attaquant');
  D.morale = initialMorale(D, A, notes, defender.label || 'Défenseur');

  const hpA0 = sideHp(A) || 1;
  const hpD0 = sideHp(D) || 1;
  const rounds = [];
  let routed = null;
  let bossDamage = 0;

  for (let r = 0; r <= maxRounds; r++) {
    const phase = r === 0 ? 'volley' : 'melee';
    const dmgToD = attackPass(A, D, phase, deterministic);
    const dmgToA = attackPass(D, A, phase, deterministic);
    const resD = applyDamage(D, dmgToD);
    const resA = applyDamage(A, dmgToA);
    if (D.isBoss) bossDamage += resD.hpLost;
    if (!A.isBoss) A.morale -= (resA.hpLost / hpA0) * 90;
    if (!D.isBoss) D.morale -= (resD.hpLost / hpD0) * 90;
    rounds.push({
      n: r, phase,
      attLost: roundUnits(resA.lost), defLost: roundUnits(resD.lost),
      attDmg: Math.round(resD.hpLost), defDmg: Math.round(resA.hpLost),
      moraleA: Math.round(A.morale), moraleD: Math.round(D.morale),
    });
    const aAlive = sideHp(A) > 1, dAlive = sideHp(D) > 1;
    if (!aAlive || !dAlive) break;
    if (A.morale < 20) { routed = 'attacker'; break; }
    if (D.morale < 20) { routed = 'defender'; break; }
  }

  // Déroute : poursuite (pertes supplémentaires)
  if (routed) {
    const side = routed === 'attacker' ? A : D;
    for (const s of side.stacks) s.count *= 0.9;
    notes.push(`${routed === 'attacker' ? 'Vos troupes' : 'L’ennemi'} cède${routed === 'attacker' ? 'nt' : ''} sous la pression (moral brisé) !`);
  }

  let winner;
  const aHp = sideHp(A), dHp = sideHp(D);
  if (D.isBoss) winner = dHp <= 1 ? 'attacker' : 'defender';
  else if (routed === 'defender' || (dHp <= 1 && aHp > 1)) winner = 'attacker';
  else if (routed === 'attacker' || aHp <= 1) winner = 'defender';
  else winner = sidePower(A) > sidePower(D) * 1.3 ? 'attacker' : 'defender';

  const remainA = {}, remainD = {}, lossA = {}, lossD = {};
  for (const s of A.stacks) {
    const keep = Math.max(0, Math.min(s.start, Math.round(s.count)));
    remainA[s.type] = keep; lossA[s.type] = s.start - keep;
  }
  for (const s of D.stacks) {
    if (s.cls === 'boss') continue;
    const keep = Math.max(0, Math.min(s.start, Math.round(s.count)));
    remainD[s.type] = keep; lossD[s.type] = s.start - keep;
  }
  return {
    winner, routed, rounds, notes,
    attRemaining: remainA, defRemaining: remainD, attLosses: lossA, defLosses: lossD,
    bossDamage: Math.round(bossDamage),
    moraleA: Math.round(A.morale), moraleD: Math.round(D.morale),
  };
}

// Estimation (déterministe) pour aider le joueur à décider
export function previewBattle(attacker, defender, ctx) {
  const res = simulateBattle(attacker, defender, { ...ctx, deterministic: true });
  const lost = Object.values(res.attLosses).reduce((s, v) => s + v, 0);
  const total = Object.values(attacker.units).reduce((s, v) => s + v, 0) || 1;
  let verdict;
  if (res.winner === 'attacker') verdict = lost / total < 0.25 ? 'Victoire probable' : 'Victoire coûteuse';
  else verdict = lost / total > 0.8 ? 'Défaite probable' : 'Issue incertaine';
  return { ...res, verdict, lossRatio: lost / total };
}

export const className = (c) => UNIT_CLASSES[c]?.name || c;
