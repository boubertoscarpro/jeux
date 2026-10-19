// v17 « Clair comme le jour » — Les remparts vus de face (module pur) : trois flancs et la cour, la garnison et les
// outils posés sur chacun, le bonus qu'ils donneraient s'ils étaient attaqués. Le rapport de raid reprend ce schéma.
// Aucune règle nouvelle : tout vient de la défense par flancs de la v16.
import { FLANKS, ASSAULT_FLANKS, DEFENSE_TOOLS } from '../data/castle.js';
import { castleState, flankBonus, flankShare, fortLevel, flankRevealed } from './castle.js';
import { armyTotals } from './economy.js';

export function rampartView(state, raid = null) {
  const C = castleState(state);
  const soldiers = Object.entries(armyTotals(state)).filter(([u]) => !['scout', 'spy'].includes(u)).reduce((a, [, n]) => a + n, 0);
  const flanks = Object.keys(FLANKS).map((k) => ({
    key: k, name: FLANKS[k].name, icon: FLANKS[k].icon,
    share: C.flanks[k] || 0,
    troops: Math.round(soldiers * (C.flanks[k] || 0)),
    effective: ASSAULT_FLANKS.includes(k) ? flankShare(state, k) : null,
    bonus: ASSAULT_FLANKS.includes(k) ? flankBonus(state, k) : 0,
    tools: Object.entries(C.tools || {}).filter(([, f]) => f === k).map(([t]) => ({ key: t, name: DEFENSE_TOOLS[t].name, icon: DEFENSE_TOOLS[t].icon, text: DEFENSE_TOOLS[t].text })),
    targeted: !!(raid && raid.flankSeen && raid.flank === k),
  }));
  return { wall: fortLevel(state, 'wall'), moat: fortLevel(state, 'moat'), damage: C.wallDmg || 0, soldiers, flanks, revealed: flankRevealed(state) };
}
// Schéma d'un rapport de défense : flanc attaqué, brèche, pertes des deux camps (en têtes de soldats, 1 tête = 1/10)
export function raidScheme(report) {
  const sum = (o) => Object.values(o || {}).reduce((a, b) => a + b, 0);
  const r = report.result || {};
  const mine = sum(r.defLosses), theirs = sum(r.attLosses);
  const heads = (n, total) => Math.max(n > 0 ? 1 : 0, Math.min(10, Math.round((n / Math.max(1, total)) * 10)));
  const total = Math.max(mine, theirs, 1);
  return { flank: report.flank || null, breached: !!report.breached, win: !!report.win, mine, theirs, mineHeads: heads(mine, total), theirsHeads: heads(theirs, total) };
}
