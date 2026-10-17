// Plan d'excédents : pour une ressource au plafond (ou presque), les actions UTILES et RÉALISABLES maintenant,
// classées par intérêt. Aucune action automatique : le conseiller propose, le joueur décide.
// Types d'actions :
//  - chain   : une chaîne existante consomme cette ressource mais est en pause, limitée par un quota ou une réserve ;
//  - convert : construire (ou améliorer) un atelier qui transforme la ressource en produit plus précieux ;
//  - invest  : un chantier abordable maintenant qui emploie une bonne part de l'excédent ;
//  - prepare : préparer une expédition légendaire, une commande prestigieuse ou une armée (troupes) ;
//  - sell    : vendre au marché, SEULEMENT si le cours est correct (≥ 85 % du prix de référence) ;
//  - storage : agrandir l'entrepôt (si la ressource est vraiment structurelle : production nette élevée) ;
//  - reserve : verser à la réserve royale (v14) : sans rendement, mais une assurance contre les crises.
import { RESOURCES, isCapped, TRADABLE } from '../data/resources.js';
import { BUILDINGS, buildingCost } from '../data/buildings.js';
import { UNITS } from '../data/units.js';
import { COMMISSIONS } from '../data/commissions.js';
import { computeMods } from './modifiers.js';
import { storageCap, netRates, buildingRates, canAfford } from './economy.js';
import { levelOf, thLevel, allBuildings } from './city.js';
import { upgradeSummary, buildRequirement, getUpgradeInfo, startUpgrade } from './construction.js';
import { quote, sell } from './market.js';
import { commissionState, launchStage } from './commissions.js';
import { unitStatus, unitCost, train } from './army.js';
import { crownList, startCrown, crownRunning, crownRewardText } from './crown.js';
import { crownSlots } from '../data/crown.js';
import { RESERVE } from '../data/crises.js';
import { reserveRoom, depositReserve } from './reserve.js';

export const SELL_MIN_RATIO = 0.85; // en dessous, vendre détruit de la valeur : on ne le conseille pas
const val = (r) => RESOURCES[r]?.price || 0;
const valueOf = (obj) => Object.entries(obj || {}).reduce((a, [r, v]) => a + v * val(r), 0);

// Ressources stockables proches du plafond (≥ 90 %) avec une production nette positive, ou déjà au plafond
export function cappedResources(state, mods = computeMods(state)) {
  const net = netRates(state, mods);
  return Object.keys(state.resources).filter((r) => isCapped(r) && RESOURCES[r] && (state.resources[r] || 0) >= storageCap(state, mods, r) * 0.9 && ((net[r] || 0) > 0 || (state.resources[r] || 0) >= storageCap(state, mods, r) * 0.99))
    .map((r) => ({ r, have: Math.floor(state.resources[r]), cap: Math.floor(storageCap(state, mods, r)), net: Math.round(net[r] || 0) }));
}

export function surplusPlan(state, r, now = Date.now(), mods = computeMods(state, now)) {
  const have = state.resources[r] || 0, cap = storageCap(state, mods, r);
  const excess = Math.max(0, have - cap * 0.6); // ce qu'on peut employer sans vider les réserves
  const out = [];
  // 1) Chaînes existantes freinées
  for (const b of allBuildings(state)) {
    if (!BUILDINGS[b.type]?.convert || b.level <= 0) continue;
    const rates = buildingRates(state, b, mods);
    if (!(rates.in?.[r] > 0)) continue;
    const name = BUILDINGS[b.type].name;
    if (b.paused) out.push({ kind: 'chain', label: `Relancer ${name} (en pause)`, detail: `Elle consomme ${Math.round(rates.in[r])} ${RESOURCES[r].name.toLowerCase()}/h pour produire ${Object.entries(rates.out).map(([k, v]) => `${Math.round(v)} ${RESOURCES[k].name.toLowerCase()}`).join(', ')}/h.`, gain: valueOf(rates.out) - valueOf(rates.in), feasible: true, view: 'chains', bid: b.id });
    else if (b.reserve && b.reserve >= cap * 0.5) out.push({ kind: 'chain', label: `Baisser la réserve de ${name}`, detail: `La réserve (${b.reserve}) bloque la transformation alors que l’entrepôt déborde.`, gain: valueOf(rates.out) - valueOf(rates.in), feasible: true, view: 'chains', bid: b.id });
    else if (b.capped) out.push({ kind: 'chain', label: `${name} : produit au plafond`, detail: `Son produit (${Object.keys(rates.out).map((k) => RESOURCES[k].name.toLowerCase()).join(', ')}) est lui-même plein : employez-le ou relevez son quota.`, gain: 0, feasible: true, view: 'chains', bid: b.id });
  }
  // 2) Construire un atelier de transformation (la sortie vaut plus que l'entrée)
  for (const [type, d] of Object.entries(BUILDINGS)) {
    if (!d.convert?.in?.[r] || d.grid === false) continue;
    const gain = valueOf(d.convert.out) - valueOf(d.convert.in);
    if (gain <= 0) continue;
    const owned = levelOf(state, type);
    // Les autres matières premières de l'atelier doivent déjà exister (stock ou production), sinon il resterait à l'arrêt
    const net0 = netRates(state, mods);
    const othersOk = Object.keys(d.convert.in).every((k) => k === r || (state.resources[k] || 0) > 100 || (net0[k] || 0) > 0);
    if (!owned && othersOk) {
      const req = buildRequirement(state, type);
      const cost = getUpgradeInfo(state, type, 1, mods).cost;
      out.push({ kind: 'convert', label: `Construire ${d.name}`, detail: `${Object.entries(d.convert.in).map(([k, v]) => `${v} ${RESOURCES[k].name.toLowerCase()}`).join(' + ')} → ${Object.entries(d.convert.out).map(([k, v]) => `${v} ${RESOURCES[k].name.toLowerCase()}`).join(', ')} par heure (niv. 1), valeur +${Math.round(gain)} or/h.`, gain, feasible: !req && canAfford(state, cost), reason: req || (canAfford(state, cost) ? null : 'Ressources insuffisantes'), view: 'city', type, cost });
    }
  }
  // 3) Investir : chantiers abordables qui emploient une bonne part de l'excédent
  const ups = upgradeSummary(state, mods).ready.filter((u) => (u.cost?.[r] || 0) >= Math.max(100, excess * 0.15)).sort((a, b) => (b.cost[r] || 0) - (a.cost[r] || 0)).slice(0, 2);
  for (const u of ups) out.push({ kind: 'invest', label: `Améliorer ${u.name} (niv. ${u.next})`, detail: `Emploie ${Math.round(u.cost[r])} ${RESOURCES[r].name.toLowerCase()} de l’excédent.`, gain: u.cost[r] * val(r), feasible: true, view: 'city', bid: u.bid, cost: u.cost });
  // 4) Préparer : commande prestigieuse en cours, troupes (nourriture, bois, fer), expédition légendaire (nourriture)
  const a = commissionState(state).active;
  if (a && !a.ready && !(a.stageEnd > now)) {
    const st = COMMISSIONS[a.id].stages[a.stage];
    if (st?.cost?.[r]) out.push({ kind: 'prepare', label: `Commande « ${COMMISSIONS[a.id].name} »`, detail: `L’étape « ${st.name} » demande ${st.cost[r]} ${RESOURCES[r].name.toLowerCase()}.`, gain: st.cost[r] * val(r), feasible: canAfford(state, st.cost), reason: canAfford(state, st.cost) ? null : 'Autres ressources de l’étape manquantes', view: 'craft', cost: st.cost });
  }
  const unit = Object.keys(UNITS).find((u) => UNITS[u].class !== 'special' && unitStatus(state, u).ok && (unitCost(u, mods)[r] || 0) > 0);
  if (unit) {
    const c = unitCost(unit, mods);
    const n = Math.max(1, Math.floor(Math.min(excess / Math.max(1, c[r]), 200)));
    const all = Object.fromEntries(Object.entries(c).map(([k, v]) => [k, v * n]));
    out.push({ kind: 'prepare', label: `Former ${n} ${UNITS[unit].name.toLowerCase()}${n > 1 ? 's' : ''}`, detail: `Pour la garnison, la Brèche ou une campagne : coût ${Object.entries(all).map(([k, v]) => `${Math.round(v)} ${RESOURCES[k].name.toLowerCase()}`).join(', ')}.`, gain: all[r] * val(r) * 0.8, feasible: canAfford(state, all), reason: canAfford(state, all) ? null : 'Autres ressources manquantes', view: 'army', unit, n, cost: all });
  }
  // Grand Projet du Royaume disponible et abordable qui emploie cette ressource (dépense facultative, récompense connue)
  if (crownRunning(state) < crownSlots(thLevel(state))) {
    const cp = crownList(state, now).filter((i) => i.status === 'available' && i.affordable && (i.cost[r] || 0) >= Math.max(100, excess * 0.1)).sort((x, y) => (y.cost[r] || 0) - (x.cost[r] || 0))[0];
    if (cp) out.push({ kind: 'prepare', label: `Grand Projet : ${cp.def.name}`, detail: `Emploie ${Math.round(cp.cost[r])} ${RESOURCES[r].name.toLowerCase()} ; récompense : ${crownRewardText(cp.id)}.`, gain: cp.cost[r] * val(r) * 0.7, feasible: true, view: 'projects', crown: cp.id, cost: cp.cost });
  }
  if (r === 'food' && thLevel(state) >= 6 && !state.legendary?.active) out.push({ kind: 'prepare', label: 'Préparer une expédition légendaire', detail: 'Des provisions abondantes (nourriture) améliorent le moral et les chances face au gardien.', gain: Math.min(excess, 3000) * val(r), feasible: true, view: 'legendary' });
  // 5) Vendre, seulement si le cours est correct
  if (TRADABLE.includes(r) && levelOf(state, 'market') && excess > 0) {
    const qty = Math.floor(Math.min(excess, cap * 0.3));
    const q = quote(state, r, qty, -1, mods);
    const ratio = q.unit / Math.max(0.0001, val(r));
    out.push({ kind: 'sell', label: `Vendre ${qty} ${RESOURCES[r].name.toLowerCase()}`, detail: `≈ ${q.total} or (${Math.round(ratio * 100)} % du prix de référence).${ratio < SELL_MIN_RATIO ? ' Cours trop bas : seulement en dernier recours.' : ''}`, gain: ratio >= SELL_MIN_RATIO ? q.total * 0.6 : 0, feasible: ratio >= SELL_MIN_RATIO, reason: ratio >= SELL_MIN_RATIO ? null : 'Cours trop bas', view: 'market', qty, ratio });
  }
  // 5 bis) v14 : mettre en réserve royale (assurance contre les crises, sans rendement)
  if (RESERVE.res.includes(r)) {
    const room = reserveRoom(state, r, mods);
    const qty = Math.floor(Math.min(room, have * RESERVE.depositShare));
    if (qty > 0) out.push({ kind: 'reserve', label: `Verser ${qty} ${RESOURCES[r].name.toLowerCase()} à la réserve royale`, detail: 'Sans rendement, mais elle coupe une crise (greniers, remèdes, bois de chauffe) sans toucher aux stocks, et nourrit le royaume en cas de famine.', gain: qty * val(r) * 0.5, feasible: true, qty });
  }
  // 6) Agrandir l'entrepôt quand l'excédent est structurel (forte production nette)
  const net = netRates(state, mods)[r] || 0;
  if (net > cap * 0.05) {
    const wh = allBuildings(state).find((b) => b.type === 'warehouse');
    const u = wh && upgradeSummary(state, mods).list.find((x) => x.bid === wh.id);
    if (u && u.status === 'ready') out.push({ kind: 'storage', label: `Agrandir l’entrepôt (niv. ${u.next})`, detail: `Production nette ${Math.round(net)}/h : l’excédent revient chaque heure.`, gain: net * val(r) * 2, feasible: true, view: 'city', bid: wh.id });
  }
  // Classement : réalisables d'abord ; puis relancer une chaîne existante (gratuit), puis employer ou transformer
  // l'excédent (valeur créée), la vente et l'agrandissement de l'entrepôt en dernier recours
  const tier = { chain: 3, invest: 2, convert: 2, prepare: 2, storage: 1, reserve: 1, sell: 0 };
  return out.sort((x, y) => (y.feasible - x.feasible) || (tier[y.kind] - tier[x.kind]) || (y.gain - x.gain));
}

// Applique en un clic la meilleure action réalisable pour une ressource pleine (recalculée au moment du clic).
// Renvoie { ok, text } ; pour un atelier à construire, { ok: true, place: type } : l'interface ouvre le mode de
// placement (le joueur choisit la case) ; pour une expédition, { ok: true, goto }.
export function applySurplus(state, r, now = Date.now(), mods = computeMods(state, now)) {
  const act = surplusPlan(state, r, now, mods).find((a) => a.feasible);
  if (!act) return { ok: false, reason: 'Aucune action réalisable pour l’instant' };
  let res = { ok: true };
  switch (act.kind) {
    case 'chain': { const b = state.city.buildings[act.bid]; if (!b) return { ok: false, reason: 'Bâtiment introuvable' }; b.paused = false; if (b.reserve >= storageCap(state, mods, r) * 0.5) b.reserve = 0; break; }
    case 'invest': case 'storage': res = startUpgrade(state, act.bid, now); break;
    case 'prepare': res = act.crown ? startCrown(state, act.crown, now) : act.unit ? train(state, act.unit, act.n, now) : act.view === 'craft' ? launchStage(state, now) : { ok: true, goto: act.view }; break;
    case 'convert': res = { ok: true, place: act.type }; break;
    case 'sell': res = sell(state, r, act.qty, now); break;
    case 'reserve': res = depositReserve(state, r, act.qty, now); break;
    default: return { ok: false, reason: 'Action inconnue' };
  }
  return res.ok === false ? res : { ...res, ok: true, text: act.label };
}

export { buildingCost };
