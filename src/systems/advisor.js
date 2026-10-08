import { RESOURCES, isCapped } from '../data/resources.js';
import { BUILDINGS } from '../data/buildings.js';
import { POI_TYPES, TERRAINS, RIVALS } from '../data/world.js';
import { UNITS } from '../data/units.js';
import { WORK_SECTORS } from '../data/workers.js';
import { fmt, fmtTime } from '../core/util.js';
import { computeMods } from './modifiers.js';
import { netRates, storageCap, buildingRates, upkeepPerHour, armyUpkeep, armyTotals, recipeOf } from './economy.js';
import { allBuildings, thLevel } from './city.js';
import { armyPower } from './army.js';
import { previewBattle } from './combat.js';
import { isRevealed, distCap, wTerrain, key } from './world.js';
import { sectorCapacity, isAvailable, automationLevel } from './workforce.js';
import { nextAutomation } from './automation.js';
import { canAfford } from './economy.js';
import { factionPower, raidWillingness } from './factions.js';
import { quote } from './market.js';

const R = (r) => `${RESOURCES[r].icon} ${RESOURCES[r].name}`;

// Production / consommation détaillées d'une ressource
export function resourceBreakdown(state, res, mods) {
  const sources = [], sinks = [];
  for (const b of allBuildings(state)) {
    if (b.paused || b.level <= 0) continue;
    const r = buildingRates(state, b, mods);
    if (r.out[res]) sources.push({ label: `${BUILDINGS[b.type].icon} ${BUILDINGS[b.type].name} niv. ${b.level}`, v: r.out[res], b });
    if (r.in[res]) sinks.push({ label: `${BUILDINGS[b.type].icon} ${BUILDINGS[b.type].name} (chaîne)`, v: r.in[res], b });
  }
  if (res === 'food') {
    sinks.push({ label: '⚔️ Entretien de l’armée', v: armyUpkeep(state, mods) });
    sinks.push({ label: '👷 Nourriture des ouvriers', v: upkeepPerHour(state, mods) - armyUpkeep(state, mods) });
  }
  return { sources: sources.sort((a, b) => b.v - a.v), sinks: sinks.sort((a, b) => b.v - a.v), prod: sources.reduce((a, s) => a + s.v, 0), cons: sinks.reduce((a, s) => a + s.v, 0) };
}

export function analyze(state, now = Date.now()) {
  const mods = computeMods(state, now);
  const net = netRates(state, mods);
  const cap = storageCap(state, mods);
  const recs = [];
  const push = (sev, text, goto) => recs.push({ sev, text, goto });
  // Prévisions de pénurie
  const forecasts = [];
  for (const [r, v] of Object.entries(net)) {
    if (v < -0.5 && RESOURCES[r]) {
      const h = (state.resources[r] || 0) / -v;
      forecasts.push({ res: r, hours: h, rate: v });
      if (h < 6) push(h < 1 ? 'bad' : 'warn', `Votre stock de ${R(r)} sera épuisé dans ${fmtTime(h * 3600000)} (${fmt(v)}/h).`, r === 'food' ? 'production' : null);
    }
  }
  // Équilibre alimentaire
  const food = resourceBreakdown(state, 'food', mods);
  const ratio = food.cons > 0 ? food.prod / food.cons : 9;
  if (ratio >= 1.25) push('good', `Votre agriculture produit ${Math.round((ratio - 1) * 100)}% de nourriture de plus que nécessaire.`);
  else if (ratio < 1) push('bad', `Vous consommez plus de nourriture que vous n’en produisez (${Math.round(ratio * 100)}%).`, 'production');
  const army = armyUpkeep(state, mods);
  if (food.prod > 0 && army / food.prod > 0.6) push('warn', `Votre armée consomme ${Math.round((army / food.prod) * 100)}% de votre production de nourriture.`, 'army');
  // Stockage plein
  const full = Object.keys(state.resources).filter((r) => isCapped(r) && (state.resources[r] || 0) >= cap * 0.95 && net[r] > 0);
  if (full.length) {
    const best = full.map((r) => ({ r, gold: quote(state, r, Math.min(2000, state.resources[r]), -1, mods).total })).sort((a, b) => b.gold - a.gold)[0];
    push('warn', `Entrepôt plein pour ${full.map(R).join(', ')} : la production est perdue. Améliorez l’entrepôt ou vendez (ex. 2 000 ${RESOURCES[best.r].name} ≈ ${fmt(best.gold)} or).`, 'market');
  }
  // Chaînes
  for (const b of allBuildings(state)) {
    if (b.starved && !b.paused) {
      const rec = recipeOf(b);
      push('warn', `${BUILDINGS[b.type].icon} ${BUILDINGS[b.type].name} manque de matières premières (${Object.keys(rec?.in || {}).map(R).join(', ')}).`, 'production');
    }
    if (b.damaged) push('bad', `${BUILDINGS[b.type].icon} ${BUILDINGS[b.type].name} est endommagé : production réduite de moitié.`, 'city');
  }
  // Ouvriers
  if (state.workers?.length) {
    const idle = state.workers.filter((w) => isAvailable(w, now) && !w.foreman).length;
    if (idle) push('info', `${idle} ouvrier(s) inactif(s) : affectez-les à un secteur ou à une expédition.`, 'production');
    for (const [s, sec] of Object.entries(WORK_SECTORS)) {
      const n = state.workers.filter((w) => w.job?.type === 'sector' && w.job.sector === s).length;
      const c = sectorCapacity(state, s);
      if (n > c && n > 0) push('info', `Le secteur ${sec.name} est surpeuplé (${n} ouvriers pour ${c} postes utiles).`, 'production');
    }
    const tired = state.workers.filter((w) => w.stamina < 25).length;
    if (tired >= 3) push('warn', `${tired} ouvriers sont épuisés : laissez-les se reposer avant la prochaine expédition.`);
  }
  // Routes commerciales
  for (const [k, r] of Object.entries(state.routes || {})) {
    if (r.trips >= 2) {
      const perH = r.profit / Math.max(0.1, r.hours);
      if (perH < 60 || r.attacks / r.trips > 0.4) push('warn', `La route vers ${r.town} n’est pas rentable (${fmt(perH)} or/h, ${r.attacks}/${r.trips} attaques).`, 'trade');
    }
  }
  // Files inactives
  if (!state.queues.build.length) push('info', 'Aucun chantier en cours : vos ouvriers du bâtiment attendent.', 'city');
  if (!state.queues.research.length && allBuildings(state).some((b) => b.type === 'library' && b.level > 0)) push('info', 'Vos chercheurs sont inactifs.', 'research');
  const na = nextAutomation(state);
  if (na && thLevel(state) >= na.th && canAfford(state, na.cost)) push('good', `Vous pouvez débloquer l’Intendance « ${na.name} ».`, 'production');
  // Menaces
  for (const f of state.factions || []) {
    if (f.stance === 'war') push('bad', `Vous êtes en guerre contre ${RIVALS[f.idx].name} (puissance estimée ${fmt(factionPower(state, f))} contre ${fmt(armyPower(armyTotals(state)))} pour vous).`, 'world');
    else if (raidWillingness(state, f.idx) > 0.08 && thLevel(state) >= 4) push('warn', `${RIVALS[f.idx].name} vous est hostile (relation ${Math.round(f.relation)}) : un raid est probable.`, 'world');
  }
  if (state.rumor && !state.rumor.done && state.rumor.heard) push('info', `Rumeur : « ${state.rumor.text} » Acheter du ${RESOURCES[state.rumor.res].name} maintenant pourrait rapporter gros.`, 'market');
  const order = { bad: 0, warn: 1, info: 2, good: 3 };
  recs.sort((a, b) => order[a.sev] - order[b.sev]);
  return { net, forecasts, recs, foodRatio: ratio, mods };
}

// ---------- Questions au conseiller ----------
export const QUESTIONS = {
  resource: { label: 'Pourquoi je manque de… ?', needsRes: true },
  gold: { label: 'Comment gagner plus d’or ?' },
  improve: { label: 'Que dois-je améliorer ?' },
  conquer: { label: 'Quelle région devrais-je conquérir ?' },
  army: { label: 'Mon armée est-elle prête ?' },
  outpost: { label: 'Où établir un avant-poste ?' },
  automation: { label: 'Comment automatiser mon royaume ?' },
};

const KEYWORDS = [
  [/(fer|iron)/i, ['resource', 'iron']], [/(bois|wood)/i, ['resource', 'wood']], [/(pierre|stone)/i, ['resource', 'stone']],
  [/(nourriture|faim|manger|food)/i, ['resource', 'food']], [/(acier|steel)/i, ['resource', 'steel']], [/(pain|bread)/i, ['resource', 'bread']],
  [/(arme|weapons)/i, ['resource', 'weapons']], [/(planche|charpente)/i, ['resource', 'planks']], [/(cuir|leather)/i, ['resource', 'leather']],
  [/(or\b|argent facile|riche|gold|revenu)/i, ['gold']], [/(conqu|attaqu|cible|région)/i, ['conquer']], [/(armée|défense|raid|troupe)/i, ['army']],
  [/(avant-poste|territoire)/i, ['outpost']], [/(automati|ordre|intendan|ouvrier)/i, ['automation']], [/(amélior|priorit|faire|conseil)/i, ['improve']],
];

export function interpret(text) {
  for (const [re, ans] of KEYWORDS) if (re.test(text)) return { q: ans[0], res: ans[1] };
  return { q: 'improve' };
}

export function answer(state, q, res = 'iron', now = Date.now()) {
  const mods = computeMods(state, now);
  const net = netRates(state, mods);
  const lines = [];
  if (q === 'resource') {
    const bd = resourceBreakdown(state, res, mods);
    const n = net[res] || 0;
    lines.push(`${R(res)} : production ${fmt(bd.prod)}/h, consommation ${fmt(bd.cons)}/h → bilan ${n >= 0 ? '+' : ''}${fmt(n)}/h. Stock : ${fmt(state.resources[res] || 0)}.`);
    if (bd.sources.length) lines.push(`Sources principales : ${bd.sources.slice(0, 3).map((s) => `${s.label} (${fmt(s.v)}/h)`).join(', ')}.`);
    else lines.push(`Aucun bâtiment ne produit de ${RESOURCES[res].name}.`);
    if (bd.sinks.length) lines.push(`Consommateurs : ${bd.sinks.slice(0, 3).map((s) => `${s.label} (${fmt(s.v)}/h)`).join(', ')}.`);
    const weak = bd.sources.filter((s) => s.b && buildingRates(state, s.b, mods).adj.total === 0);
    if (weak.length) lines.push(`Conseil : ${weak.length} bâtiment(s) producteur(s) n’ont aucun bonus d’adjacence. Déplacez-les près de leur terrain favori.`);
    const sector = Object.entries(WORK_SECTORS).find(([, s]) => s.res.includes(res));
    if (sector && automationLevel(state) >= 1) {
      const nw = (state.workers || []).filter((w) => w.job?.sector === sector[0]).length;
      lines.push(`${nw} ouvrier(s) travaillent dans le secteur ${sector[1].name}${nw < sectorCapacity(state, sector[0]) ? ` (jusqu’à ${sectorCapacity(state, sector[0])} postes utiles)` : ''}.`);
    }
    const nodes = Object.values(state.world.pois).filter((p) => POI_TYPES[p.type]?.res === res && isRevealed(state.world, p.x, p.y) && p.amount > 100).sort((a, b) => distCap(state.world, a.x, a.y) - distCap(state.world, b.x, b.y));
    if (nodes.length) lines.push(`Sur la carte : ${nodes.length} site(s) de ${RESOURCES[res].name} connus, le plus proche en (${nodes[0].x}, ${nodes[0].y}) avec ${fmt(nodes[0].amount)} unités — idéal pour une expédition.`);
    if (res === 'steel' || res === 'weapons') lines.push('Les chaînes d’acier et d’armes dépendent du fer et du charbon : vérifiez la Fonderie et la Charbonnière.');
  }
  if (q === 'gold') {
    const houses = allBuildings(state).filter((b) => b.type === 'house');
    lines.push(`Votre or : ${fmt(net.gold || 0)}/h. ${houses.length} maison(s) paient l’impôt (+5% par marché ou taverne voisin).`);
    const surplus = Object.keys(state.resources).filter((r) => RESOURCES[r].price > 0 && (net[r] || 0) > 0 && state.resources[r] > 3000)
      .map((r) => ({ r, ratio: state.market.prices[r] / RESOURCES[r].price })).sort((a, b) => b.ratio - a.ratio);
    if (surplus.length) lines.push(`Vendez votre surplus de ${surplus.slice(0, 2).map((s) => `${RESOURCES[s.r].name} (cours ${Math.round(s.ratio * 100)}% de la normale)`).join(' et ')}.`);
    const towns = Object.values(state.world.pois).filter((p) => p.type === 'town' && isRevealed(state.world, p.x, p.y));
    const match = towns.flatMap((t) => t.wants.filter((r) => (state.resources[r] || 0) > 1000).map((r) => `${RESOURCES[r].name} → ${t.name}`));
    if (match.length) lines.push(`Caravanes rentables : ${match.slice(0, 3).join(', ')} (+60% sur les ressources demandées).`);
    if (state.contracts?.length) lines.push(`${state.contracts.length} contrat(s) disponible(s) au comptoir.`);
    lines.push('Un héros Marchand intendant du Trésor augmente l’or ; un pacte commercial avec une faction réduit la taxe.');
  }
  if (q === 'improve') {
    const a = analyze(state, now);
    lines.push(...a.recs.slice(0, 5).map((r) => `• ${r.text}`));
    if (!a.recs.length) lines.push('Votre royaume tourne rond. Pensez à monter l’Hôtel de ville pour débloquer de nouveaux systèmes.');
  }
  if (q === 'conquer') {
    const units = Object.fromEntries(Object.entries(state.army).filter(([u, n]) => n > 0 && UNITS[u]?.class !== 'special'));
    if (!Object.keys(units).length) lines.push('Vous n’avez aucune troupe de combat en ville.');
    else {
      const targets = Object.values(state.world.pois).filter((p) => ['danger', 'kingdom'].includes(POI_TYPES[p.type]?.kind) && isRevealed(state.world, p.x, p.y) && !(p.clearedUntil > now) && (p.enemies || p.garrison));
      const scored = targets.map((p) => {
        const enemies = p.type === 'kingdom' ? p.garrison : p.enemies;
        if (!enemies || !Object.keys(enemies).length) return null;
        const ter = wTerrain(state.world, p.x, p.y);
        const pv = previewBattle({ units, mods }, { units: enemies, mods: { 'combat.atk': 0.05 * p.danger, 'combat.def': 0.05 * p.danger }, fort: p.wall || 0 }, { terrain: p.type === 'kingdom' ? 'city' : ter === 'ash' ? 'ruins' : ter, weather: state.weather.type });
        const loot = Object.values(POI_TYPES[p.type].loot || {}).reduce((a, b) => a + b, 0) * (1 + p.danger * 0.45);
        return { p, pv, score: pv.winner === 'attacker' ? loot * (1 - pv.lossRatio) / (1 + distCap(state.world, p.x, p.y) / 10) : -1 };
      }).filter(Boolean).sort((a, b) => b.score - a.score);
      const best = scored.filter((s) => s.score > 0).slice(0, 3);
      if (best.length) lines.push(...best.map((s) => `• ${s.p.name || POI_TYPES[s.p.type].name} (${s.p.x}, ${s.p.y}) — danger ${s.p.danger}, ${s.pv.verdict.toLowerCase()}, pertes ≈ ${Math.round(s.pv.lossRatio * 100)}%${s.p.scouted ? '' : ' (estimation non espionnée)'}.`));
      else lines.push('Aucune cible connue n’est à votre portée. Renforcez votre armée ou espionnez d’autres sites.');
    }
  }
  if (q === 'army') {
    const tot = armyTotals(state);
    const p = armyPower(tot);
    lines.push(`Puissance totale : ${fmt(p)} — entretien ${fmt(armyUpkeep(state, mods))} nourriture/h.`);
    const cls = {};
    for (const [u, n] of Object.entries(tot)) if (UNITS[u]) cls[UNITS[u].class] = (cls[UNITS[u].class] || 0) + n;
    const totalN = Object.values(cls).reduce((a, b) => a + b, 0) || 1;
    if ((cls.infantry || 0) / totalN < 0.3) lines.push('Peu d’infanterie : vos lignes céderont face à la cavalerie (les lanciers la contrent ×2,8).');
    if (!(cls.ranged > 0)) lines.push('Aucun tireur : vous perdez la volée initiale et l’avantage des collines.');
    if (!(cls.cavalry > 0) && thLevel(state) >= 4) lines.push('Pas de cavalerie : impossible de punir les archers ennemis.');
    const threats = (state.factions || []).filter((f) => f.stance === 'war' || raidWillingness(state, f.idx) > 0.08);
    for (const f of threats) lines.push(`Menace : ${RIVALS[f.idx].name} — puissance estimée ${fmt(factionPower(state, f))}.`);
    lines.push(`Muraille niv. ${state.city.fort.wall || 0} : chaque niveau donne +8% de défense à la garnison.`);
  }
  if (q === 'outpost') {
    const weak = Object.entries(net).filter(([r, v]) => ['food', 'wood', 'stone', 'iron', 'gold'].includes(r)).sort((a, b) => a[1] - b[1])[0]?.[0] || 'iron';
    const wantTerrain = Object.entries(TERRAINS).filter(([, t]) => t.territory['prod.' + weak]).map(([k]) => k);
    const w = state.world;
    const cands = [];
    for (let y = 0; y < w.size; y++) for (let x = 0; x < w.size; x++) if (isRevealed(w, x, y) && wantTerrain.includes(wTerrain(w, x, y)) && !state.territories[key(x, y)] && !w.pois[key(x, y)]) cands.push({ x, y, d: distCap(w, x, y) });
    cands.sort((a, b) => a.d - b.d);
    lines.push(`Votre ressource la plus faible est ${R(weak)}. Les terrains ${wantTerrain.map((t) => TERRAINS[t].name.toLowerCase()).join(', ')} la renforcent.`);
    if (cands.length) lines.push(`Emplacements proches : ${cands.slice(0, 3).map((c) => `(${c.x}, ${c.y})`).join(', ')}.`);
  }
  if (q === 'automation') {
    const lvl = automationLevel(state);
    const na = nextAutomation(state);
    lines.push(`Palier d’Intendance actuel : ${lvl}/7.${na ? ` Prochain : « ${na.name} » (Hôtel de ville ${na.th}).` : ''}`);
    if (lvl < 1) lines.push('Commencez par débloquer les Ouvriers : ils augmentent la production des secteurs et partent en expédition.');
    else if (lvl < 3) lines.push('Formez des équipes d’expédition et faites monter des ouvriers « Meneurs » pour en faire des contremaîtres.');
    else if (lvl < 4) lines.push('Donnez un contremaître à chaque équipe et cochez « relance automatique ».');
    else lines.push('Configurez vos Priorités (seuils min/max) et créez des Ordres : « SI nourriture < X → affecter des ouvriers », « SI bois > X → vendre le surplus ».');
  }
  return lines;
}
