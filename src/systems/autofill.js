// Composition d'attaque assistée : « moitié de chaque unité » et « remplissage auto » (le minimum pour gagner contre
// un lieu tenu par des PNJ : camps, repaires, cryptes, ruines, royaumes rivaux, forteresses de la Brèche).
// Le calcul utilise exactement l'aperçu de combat du jeu (previewBattle, déterministe). On garde la proportion de
// chaque type d'unité disponible, on cherche la plus petite fraction qui gagne avec des pertes raisonnables, puis on
// ajoute une marge de sécurité (le vrai combat comporte une part de hasard) : +15 % si le lieu a été espionné,
// +35 % sinon (estimation prudente). Rien n'est envoyé : la fenêtre d'envoi se remplit, le joueur valide.
import { POI_TYPES } from '../data/world.js';
import { UNITS } from '../data/units.js';
import { previewBattle } from './combat.js';
import { planMarch } from './marches.js';
import { poiAt, wTerrain } from './world.js';
import { rivalGarrison } from './rivals.js';
import { breachDefense } from './breach.js';

export const AUTOFILL = { maxLoss: 0.4, marginScouted: 1.15, marginBlind: 1.35, steps: 14 };
const EXCLUDED = new Set(['scout', 'spy']);

// Unités disponibles pour combattre (les éclaireurs et espions restent en ville)
export function fightingUnits(state) {
  return Object.fromEntries(Object.entries(state.army || {}).filter(([u, n]) => n > 0 && !EXCLUDED.has(u) && UNITS[u] && (UNITS[u].atk || 0) > 0));
}
export const halfOfEach = (state) => Object.fromEntries(Object.entries(fightingUnits(state)).map(([u, n]) => [u, Math.floor(n / 2)]).filter(([, n]) => n > 0));

// Adversaire d'un lieu, comme dans l'aperçu de la fenêtre d'envoi
export function targetDefense(state, poi, now = Date.now()) {
  const def = POI_TYPES[poi?.type];
  if (!def || !['danger', 'kingdom', 'breach'].includes(def.kind)) return null;
  if (def.kind === 'breach') { const D = breachDefense(state, poi, now); return { enemies: D.enemies, fort: D.fort, enemyMods: D.enemyMods, formation: D.formation, scouted: !!poi.scouted }; }
  const enemies = def.kind === 'kingdom' ? (poi.garrison || rivalGarrison(state, poi, now)) : poi.enemies;
  return { enemies, fort: poi.wall || 0, enemyMods: { 'combat.atk': 0.05 * (poi.danger || 0), 'combat.def': 0.05 * (poi.danger || 0) }, scouted: !!poi.scouted && (def.kind !== 'kingdom' || !!poi.garrison) };
}

const scale = (units, f) => {
  const out = {};
  for (const [u, n] of Object.entries(units)) { const k = Math.min(n, Math.round(n * f)); if (k > 0) out[u] = k; }
  return out;
};

export function autoFillAttack(state, md, now = Date.now()) {
  const poi = poiAt(state.world, md.x, md.y);
  const D = targetDefense(state, poi, now);
  if (!D || !D.enemies) return { ok: false, reason: 'Le remplissage auto ne sert qu’à attaquer un lieu tenu par des ennemis' };
  const avail = fightingUnits(state);
  if (!Object.keys(avail).length) return { ok: false, reason: 'Aucune unité de combat en ville' };
  const plan = planMarch(state, { ...md, units: avail }, now);
  const mods = plan.mods;
  const ter = wTerrain(state.world, md.x, md.y);
  const terrain = poi.type === 'kingdom' ? 'city' : ter === 'ash' ? 'ruins' : ter;
  const test = (units) => {
    if (!Object.keys(units).length) return null;
    return previewBattle({ units, mods, formation: md.formation || 'balanced', supply: md.supply, famine: state.famine },
      { units: D.enemies, mods: D.enemyMods, fort: D.fort, formation: D.formation }, { terrain, weather: state.weather?.type });
  };
  const wins = (pv) => pv && pv.winner === 'attacker' && pv.lossRatio <= AUTOFILL.maxLoss;
  const full = test(avail);
  if (!wins(full)) return { ok: false, reason: full?.winner === 'attacker' ? 'Victoire possible seulement au prix de lourdes pertes : renforcez l’armée' : 'Même toute votre armée ne suffirait pas : renforcez-la ou choisissez une cible plus faible', units: avail };
  let lo = 0, hi = 1;
  for (let i = 0; i < AUTOFILL.steps; i++) { const mid = (lo + hi) / 2; if (wins(test(scale(avail, mid)))) hi = mid; else lo = mid; }
  const margin = D.scouted ? AUTOFILL.marginScouted : AUTOFILL.marginBlind;
  const f = Math.min(1, hi * margin);
  const units = scale(avail, f);
  const pv = test(units);
  return { ok: true, units, fraction: f, minimum: hi, estimated: !D.scouted, verdict: pv?.verdict, lossRatio: pv?.lossRatio ?? 0 };
}
