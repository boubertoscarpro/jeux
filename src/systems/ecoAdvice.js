// Bilan économique enrichi (v13) : rythme OBSERVÉ (relevés horaires des stocks), part du temps au plafond,
// dépenses prévues, risques à court terme et recommandations motivées. Rien n'est appliqué sans le joueur :
// chaque recommandation indique pourquoi, combien, et l'écran où agir (ou un bouton qui passe par les règles).
import { RESOURCES, RES_ORDER, isCapped } from '../data/resources.js';
import { BUILDINGS } from '../data/buildings.js';
import { computeMods } from './modifiers.js';
import { storageCap, buildingRates, recipeOf } from './economy.js';
import { allBuildings, levelOf } from './city.js';
import { getUpgradeInfo, upgradeCheck } from './construction.js';
import { surplusPlan, cappedResources } from './surplus.js';
import { quote } from './market.js';
import { fmt } from '../core/util.js';

const H = 3600000;
export const ECO_SAMPLES = 24;          // 24 relevés horaires
export const ECO_TRACKED = ['wood', 'stone', 'iron', 'food', 'gold', 'coal', 'planks', 'steel', 'cloth', 'rations', 'grain', 'bread', 'weapons', 'frames', 'leather', 'herbs'];

export function ecoLogOf(state) {
  const L = (state.ecoLog && typeof state.ecoLog === 'object' && !Array.isArray(state.ecoLog)) ? state.ecoLog : (state.ecoLog = {});
  if (!Array.isArray(L.s)) L.s = [];
  return L;
}

// Relevé horaire (appelé par le moteur) : stocks et plafonds des ressources suivies
export function ecoSampleTick(state, now = Date.now()) {
  const L = ecoLogOf(state);
  if (L.at && now - L.at < H) return false;
  L.at = now;
  const mods = computeMods(state, now);
  const v = {}, full = {};
  for (const r of ECO_TRACKED) {
    v[r] = Math.floor(state.resources[r] || 0);
    if (isCapped(r) && v[r] >= storageCap(state, mods, r) * 0.98) full[r] = 1;
  }
  L.s.push({ t: now, v, full });
  if (L.s.length > ECO_SAMPLES) L.s.splice(0, L.s.length - ECO_SAMPLES);
  return true;
}

// Rythme observé d'une ressource : fiable seulement avec au moins 3 relevés couvrant 2 h et plus
export function observed(state, r) {
  const s = ecoLogOf(state).s;
  if (s.length < 3) return { reliable: false };
  const a = s[0], b = s[s.length - 1];
  const hours = (b.t - a.t) / H;
  if (hours < 2) return { reliable: false };
  const capShare = s.filter((x) => x.full?.[r]).length / s.length;
  return { reliable: true, perH: ((b.v[r] || 0) - (a.v[r] || 0)) / hours, hours, capShare, samples: s.length };
}

// Dépenses déjà prévues : chantiers planifiés (ils partiront seuls) et grand projet royal en cours de financement
export function plannedSpending(state, mods = computeMods(state)) {
  const out = {};
  const add = (c) => { for (const [r, v] of Object.entries(c || {})) out[r] = (out[r] || 0) + v; };
  const items = [];
  for (const p of state.queues.planned || []) {
    const b = p.bid ? state.city.buildings[p.bid] : null;
    const type = p.type || b?.type;
    if (!type || !BUILDINGS[type]) continue;
    const lvl = p.kind === 'build' ? 1 : (b?.level || 0) + 1;
    if (lvl > BUILDINGS[type].maxLevel) continue;
    const c = getUpgradeInfo(state, type, lvl, mods).cost;
    add(c); items.push({ label: `${BUILDINGS[type].name} → ${lvl}`, cost: c });
  }
  return { total: out, items };
}

// Recommandations motivées, classées par urgence. Jamais appliquées automatiquement.
export function economyAdvice(state, report, now = Date.now()) {
  const mods = computeMods(state, now);
  const out = [];
  const food = report.list.find((x) => x.res === 'food');
  const foodProd = food?.prod || 0, foodUse = food?.use || 0;
  // 1) Nourriture : la ressource vitale
  if (food && (food.net < 0 || foodProd <= 0)) {
    const left = food.hoursLeft;
    const why = foodProd <= 0 ? `Aucune production de nourriture alors que l’entretien en consomme ${fmt(foodUse)}/h` : `Bilan de nourriture ${fmt(food.net)}/h${left < Infinity ? `, réserves vides dans ${Math.max(1, Math.round(left))} h` : ''}`;
    const farms = allBuildings(state).filter((b) => b.type === 'farm' && b.level > 0);
    if (!farms.length) out.push({ sev: 'bad', icon: '🌾', text: 'Construire une ferme', why, view: 'city' });
    else {
      const f = farms.map((b) => ({ b, u: upgradeCheck(state, b.id, mods) })).filter((x) => x.u.status === 'ready' || x.u.status === 'lack').sort((a, b) => a.b.level - b.b.level)[0];
      if (f) out.push({ sev: food.net < 0 ? 'bad' : 'warn', icon: '🌾', text: `Améliorer la ferme (niv. ${f.b.level} → ${f.b.level + 1})${f.u.status === 'lack' ? ' — ressources à réunir' : ''}`, why, view: 'city' });
    }
    // Consommation évitable : chaînes qui mangent de la nourriture (rations, salaisons)
    for (const b of allBuildings(state)) {
      if (b.level <= 0 || b.paused) continue;
      const rec = recipeOf(b);
      if (!rec?.in?.food) continue;
      const rates = buildingRates(state, b, mods);
      if ((rates.in.food || 0) > 0) out.push({ sev: 'warn', icon: '⏸️', text: `Mettre en pause ${BUILDINGS[b.type].name} (${rec.name})`, why: `Elle consomme ${fmt(rates.in.food)} nourriture/h ; à relancer quand les greniers remontent.`, view: 'chains' });
    }
    if (levelOf(state, 'market')) {
      const q = quote(state, 'food', 1000, 1, mods);
      out.push({ sev: 'info', icon: '⚖️', text: 'Acheter de la nourriture au marché (dépannage)', why: `1 000 nourriture ≈ ${fmt(q.total)} or : utile pour passer un cap, pas pour durer.`, view: 'market' });
    }
    if (report.upkeep.army > foodProd * 0.6 && report.upkeep.army > 50) out.push({ sev: 'info', icon: '🛡️', text: 'Alléger l’armée en ville', why: `L’armée mange ${fmt(report.upkeep.army)}/h, soit ${Math.round((report.upkeep.army / Math.max(1, foodProd)) * 100)} % de la production : garnisons d’avant-postes, campagne ou renvoi des unités les moins utiles.`, view: 'army' });
  }
  // 2) Autres ressources en baisse rapide
  for (const x of report.list) {
    if (x.res === 'food' || !(x.hoursLeft < 12) || x.net >= 0) continue;
    const users = Object.entries(x.users).sort((a, b) => b[1] - a[1])[0];
    out.push({ sev: 'warn', icon: x.icon, text: x.hoursLeft > 0.05 ? `${x.name} : réserves vides dans ${Math.max(1, Math.round(x.hoursLeft))} h` : `${x.name} : réserves déjà vides`, why: users ? `Principal usage : ${users[0]} (${fmt(users[1])}/h). Augmentez la production ou réduisez cet usage.` : 'Augmentez la production.', view: 'ecoReport' });
  }
  // 3) Chaînes bloquées
  for (const c of report.blocked.filter((c) => c.status !== 'paused').slice(0, 3)) out.push({ sev: 'info', icon: c.icon, text: `${c.name} : ${c.status === 'capped' ? 'arrêtée' : 'ralentie'}`, why: c.reason, view: 'chains' });
  // 4) Surplus : la meilleure action réalisable du conseiller des excédents (bouton « Appliquer » existant)
  for (const c of cappedResources(state, mods).slice(0, 2)) {
    const best = surplusPlan(state, c.r, now, mods).find((a) => a.feasible);
    const obs = observed(state, c.r);
    const often = obs.reliable && obs.capShare >= 0.5;
    if (best) out.push({ sev: 'info', icon: RESOURCES[c.r].icon, text: `${RESOURCES[c.r].name} ${often ? 'souvent' : ''} au plafond : ${best.label}`, why: `${best.detail}${often ? ` Plein ${Math.round(obs.capShare * 100)} % du temps sur ${Math.round(obs.hours)} h.` : ''}`, apply: c.r, view: best.view });
  }
  const order = { bad: 0, warn: 1, info: 2 };
  return out.sort((a, b) => order[a.sev] - order[b.sev]).slice(0, 6);
}

// Risque de pénurie à court terme : quantitatif si fiable, sinon qualitatif
export function shortageRisk(state, x) {
  const obs = observed(state, x.res);
  if (x.hoursLeft < 6) return { level: 'high', text: x.hoursLeft > 0.05 ? `vide dans ${Math.max(1, Math.round(x.hoursLeft))} h` : 'déjà vide' };
  if (x.hoursLeft < 24) return { level: 'mid', text: `vide dans ${Math.round(x.hoursLeft)} h` };
  if (obs.reliable && obs.perH < -1 && x.stock / -obs.perH < 24) return { level: 'mid', text: 'en baisse selon les relevés' };
  if (x.net < 0) return { level: 'low', text: 'en légère baisse' };
  return null;
}
void RES_ORDER;
