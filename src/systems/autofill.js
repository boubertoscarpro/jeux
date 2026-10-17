// Composition d'attaque assistée, partout où l'on envoie des troupes combattre : « moitié de chaque unité » et
// « remplissage auto » (le minimum pour gagner). Contextes couverts : attaques de la carte (camps, repaires, royaumes
// rivaux, forteresses de la Brèche), récoltes sur site dangereux (embuscade possible + capacité pour vider le site),
// expéditions de donjon (toutes les salles restantes), boss mondial, actions de combat des événements en direct
// (attaque, escorte, garnison) et opérations des campagnes militaires.
// Le calcul utilise exactement l'estimation de combat du jeu (previewBattle, déterministe). On garde la proportion de
// chaque type d'unité disponible, on cherche la plus petite fraction qui gagne avec des pertes raisonnables, puis on
// ajoute une marge de sécurité (le vrai combat comporte une part de hasard) : +15 % si l'adversaire est connu,
// +35 % sinon (estimation prudente). Contre un boss il n'y a pas de victoire à atteindre : chaque soldat ajoute des
// dégâts, le remplissage propose donc toutes les unités de combat. Rien n'est envoyé : la fenêtre se remplit, le
// joueur valide.
import { POI_TYPES, BOSSES } from '../data/world.js';
import { UNITS } from '../data/units.js';
import { fmt } from '../core/util.js';
import { previewBattle } from './combat.js';
import { planMarch, carryCapacity } from './marches.js';
import { poiAt, wTerrain } from './world.js';
import { rivalGarrison } from './rivals.js';
import { breachDefense } from './breach.js';
import { previewDungeon, ensureDungeon } from './dungeons.js';
import { liveTarget, liveFoe, livePreview } from './liveEvents.js';
import { previewOp } from './warcampaign.js';

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

const count = (u) => Object.values(u).reduce((a, b) => a + b, 0);
const winsBattle = (pv) => !!pv && pv.winner === 'attacker' && pv.lossRatio <= AUTOFILL.maxLoss;

/**
 * Plus petite fraction de chaque type d'unité disponible pour laquelle wins(test(units)) est vrai, plus la marge.
 * Renvoie { ok, units, fraction, minimum, result } ou { ok: false, full } (même toute l'armée échoue).
 */
export function minimalForce(avail, test, wins, margin) {
  if (!count(avail)) return { ok: false, empty: true };
  const full = test(avail);
  if (!wins(full)) return { ok: false, full };
  let lo = 0, hi = 1;
  for (let i = 0; i < AUTOFILL.steps; i++) { const mid = (lo + hi) / 2; const u = scale(avail, mid); if (count(u) && wins(test(u))) hi = mid; else lo = mid; }
  const fraction = Math.min(1, hi * margin);
  const units = scale(avail, fraction);
  return { ok: true, units, fraction, minimum: hi, result: test(units) };
}

const failReason = (r, what = 'toute votre armée') => r.empty ? 'Aucune unité de combat en ville'
  : r.full?.winner === 'attacker' ? 'Victoire possible seulement au prix de lourdes pertes : renforcez l’armée'
  : `Même ${what} ne suffirait pas : renforcez-la ou choisissez une cible plus faible`;
const done = (r, scouted, extra = {}) => ({ ok: true, units: r.units, fraction: r.fraction, minimum: r.minimum, estimated: !scouted, verdict: r.result?.verdict, lossRatio: r.result?.lossRatio ?? 0, ...extra });

// Fenêtre d'envoi de la carte du monde : attaque, récolte, donjon, boss mondial
export function autoFillAttack(state, md, now = Date.now()) {
  const type = md.type || 'attack';
  const poi = poiAt(state.world, md.x, md.y);
  const avail = fightingUnits(state);
  if (!count(avail)) return { ok: false, reason: 'Aucune unité de combat en ville' };
  const mods = planMarch(state, { ...md, units: avail }, now).mods;
  const ter = wTerrain(state.world, md.x, md.y);
  const terrain = poi?.type === 'kingdom' ? 'city' : ter === 'ash' ? 'ruins' : ter;
  const me = (units) => ({ units, mods, formation: md.formation || 'balanced', supply: md.supply, famine: state.famine });
  const ctx = { terrain, weather: state.weather?.type };

  if (type === 'boss') {
    if (!state.boss) return { ok: false, reason: 'Aucun boss mondial en ce moment' };
    const pv = previewBattle(me(avail), { units: { [BOSSES[state.boss.key].unit]: 1 } }, { ...ctx, bossHp: state.boss.hp });
    return { ok: true, boss: true, units: avail, fraction: 1, damage: pv.bossDamage, lossRatio: pv.lossRatio };
  }
  if (type === 'dungeon') {
    if (!poi || !POI_TYPES[poi.type]?.dungeon) return { ok: false, reason: 'Pas de donjon ici' };
    ensureDungeon(poi);
    const test = (units) => previewDungeon(state, units, mods, poi, { retreat: md.retreat ?? 0.5, formation: md.formation, supply: md.supply });
    const r = minimalForce(avail, test, (p) => p.ok && p.lossRatio <= AUTOFILL.maxLoss, AUTOFILL.marginScouted);
    if (!r.ok) return { ok: false, reason: r.full?.ok ? 'Le donjon peut être purgé, mais au prix de lourdes pertes : renforcez l’armée' : `Même toute votre armée ne franchirait que ${r.full?.cleared ?? 0}/${r.full?.total ?? 0} salle(s) : renforcez-la`, units: avail };
    return done(r, true, { verdict: `${r.result.total} salle(s) franchies`, rooms: r.result.total });
  }
  if (type === 'gather') {
    const def = poi && POI_TYPES[poi.type];
    if (!def || def.kind !== 'gather') return { ok: false, reason: 'Pas de site de récolte' };
    // Embuscade possible (comme à l'arrivée) et capacité pour vider le site (autant que toute l'armée le peut)
    let enemies = null;
    if (poi.danger > 0) { enemies = poi.enemies ? { ...poi.enemies } : { bandit: 3 + poi.danger * 2 }; if (poi.infested) enemies.spider = (enemies.spider || 0) + 4 + poi.danger * 2; }
    const mult = 1 + (mods['gather.all'] || 0) + (mods['gather.' + def.res] || 0);
    const need = Math.min(poi.amount * mult, carryCapacity(avail, mods));
    const test = (units) => ({ cap: carryCapacity(units, mods), pv: enemies ? previewBattle(me(units), { units: enemies, mods: { 'combat.atk': 0.05 * poi.danger, 'combat.def': 0.05 * poi.danger } }, ctx) : null });
    const wins = (x) => x.cap >= need && (!x.pv || winsBattle(x.pv));
    const scouted = !enemies || !!poi.scouted;
    const r = minimalForce(avail, test, wins, enemies ? (scouted ? AUTOFILL.marginScouted : AUTOFILL.marginBlind) : 1);
    if (!r.ok) return { ok: false, reason: 'Même toute votre armée ne repousserait pas une embuscade sur ce site : renforcez-la', units: avail };
    return done(r, scouted, { verdict: r.result.pv?.verdict || 'Capacité suffisante', lossRatio: r.result.pv?.lossRatio ?? 0, gather: true });
  }
  const D = targetDefense(state, poi, now);
  if (!D || !D.enemies) return { ok: false, reason: 'Le remplissage auto ne sert qu’à attaquer un lieu tenu par des ennemis' };
  const test = (units) => previewBattle(me(units), { units: D.enemies, mods: D.enemyMods, fort: D.fort, formation: D.formation }, ctx);
  const r = minimalForce(avail, test, winsBattle, D.scouted ? AUTOFILL.marginScouted : AUTOFILL.marginBlind);
  if (!r.ok) return { ok: false, reason: failReason(r), units: avail };
  return done(r, D.scouted);
}

// Événements en direct : attaque (camps, caravanes, navires, ports, régions…), escorte (embuscade), garnison
export function autoFillLive(state, opts, now = Date.now()) {
  const tg = liveTarget(state, opts.targetId);
  const foe = liveFoe(state, opts.action, tg);
  if (!foe) return { ok: false, reason: 'Pas de combat prévu pour cette action' };
  const avail = fightingUnits(state);
  if (!count(avail)) return { ok: false, reason: 'Aucune unité de combat en ville' };
  const test = (units) => livePreview(state, { ...opts, units }, now)?.pv;
  if (foe.kind === 'boss') { const pv = test(avail); return { ok: true, boss: true, units: avail, fraction: 1, damage: pv?.bossDamage || 0, lossRatio: pv?.lossRatio ?? 0 }; }
  const r = minimalForce(avail, test, winsBattle, AUTOFILL.marginScouted);
  if (!r.ok) return { ok: false, reason: failReason(r), units: avail };
  return done(r, true, { ambush: !!foe.ambush, hold: !!foe.hold });
}

// Campagnes militaires : prochaine opération (les unités spéciales ne partent pas en campagne)
export function autoFillWarOp(state, heroId, now = Date.now()) {
  const avail = Object.fromEntries(Object.entries(fightingUnits(state)).filter(([u]) => UNITS[u].class !== 'special'));
  if (!count(avail)) return { ok: false, reason: 'Aucune troupe disponible au château' };
  if (!previewOp(state, avail, now, heroId)) return { ok: false, reason: 'Aucune opération à préparer' };
  const r = minimalForce(avail, (units) => previewOp(state, units, now, heroId).pv, winsBattle, AUTOFILL.marginScouted);
  if (!r.ok) return { ok: false, reason: failReason(r), units: avail };
  return done(r, true);
}

// Texte affiché sous les boutons après un remplissage auto (commun à toutes les fenêtres d'envoi)
export function autoFillNote(state, r) {
  if (!r.ok) return `⚠️ ${r.reason}`;
  const n = count(r.units), all = count(fightingUnits(state));
  if (r.boss) return `⚖️ Contre un boss, il n’y a pas de victoire à atteindre : chaque soldat ajoute des dégâts. Toutes vos unités de combat (${fmt(n)}) — dégâts estimés ${fmt(r.damage)}.`;
  const why = r.gather ? (r.verdict === 'Capacité suffisante' ? 'le minimum pour tout rapporter du site' : 'le minimum pour repousser une embuscade et tout rapporter du site')
    : r.rooms ? `le minimum qui franchit les ${r.rooms} salle(s) restantes`
    : r.ambush ? 'le minimum qui repousse une embuscade' : r.hold ? 'le minimum qui tient face à l’attaque attendue' : 'le minimum qui gagne';
  return `⚖️ ${fmt(n)} soldats sur ${fmt(all)} disponibles : ${why} d’après l’aperçu, plus une marge ${r.estimated ? 'prudente (adversaire non espionné)' : 'de sécurité'}. Aperçu : ${r.verdict}${r.lossRatio ? `, pertes ≈ ${Math.round(r.lossRatio * 100)} %` : ''}.`;
}
