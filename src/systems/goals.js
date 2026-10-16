// Tableau des objectifs : prochaines étapes à court, moyen et long terme, calculées depuis l'état réel du jeu.
// Chaque objectif indique sa progression, ses prérequis, sa récompense et l'écran où agir.
import { BUILDINGS } from '../data/buildings.js';
import { TECHS } from '../data/techs.js';
import { RARITY_ORDER } from '../data/heroes.js';
import { FEATS } from '../data/shards.js';
import { LIVE_EVENTS } from '../data/liveEvents.js';
import { BOSSES } from '../data/world.js';
import { RESOURCES } from '../data/resources.js';
import { thLevel, levelOf } from './city.js';
import { computeMods } from './modifiers.js';
import { canAfford } from './economy.js';
import { getUpgradeInfo } from './construction.js';
import { techStatus, researchCost } from './research.js';
import { milestoneList } from './quests.js';
import { objectives } from './campaign.js';
import { collectionStatus } from './collection.js';
import { PRESTIGE_TH } from './talents.js';
import { territoryLimit } from './world.js';
import { shardState } from './shards.js';
import { wheelCfg } from './config.js';
import { objectives as eventObjectives, dailyMissions } from './liveEvents.js';
import { contractProgress } from './market.js';
import { netRates, storageCap } from './economy.js';
import { isCapped } from '../data/resources.js';
import { RIVALS } from '../data/world.js';
import { factionPower, playerPower } from './factions.js';
import { canStartCampaign } from './warcampaign.js';
import { crownList } from './crown.js';
import { questlineList } from './questlines.js';
import { combatUnitCount } from './army.js';

const costText = (c) => Object.entries(c || {}).map(([r, v]) => `${Math.round(v)} ${RESOURCES[r]?.icon || r}`).join(' ');

export function goals(state, now = Date.now()) {
  const mods = computeMods(state, now);
  const th = thLevel(state);
  const short = [], mid = [], long = [];

  // ── Court terme ──
  for (const m of objectives(state, now).main.slice(0, 2)) short.push({ icon: '📖', title: m.title, desc: m.desc, cur: m.cur, max: m.target, done: m.done, reward: costText(m.reward), view: m.done ? 'goals' : m.view || 'goals' });
  for (const c of (state.contracts || []).slice(0, 2)) {
    const p = contractProgress(state, c);
    short.push({ icon: '📜', title: c.title || `Contrat : ${c.qty} ${RESOURCES[c.res].name} pour ${c.town}`, cur: p.cur, max: p.max, done: p.done, reward: costText(c.reward), until: c.until, view: 'convoys' });
  }
  if (state.pending.length) short.push({ icon: '⚖️', title: `${state.pending.length} décision(s) en attente`, desc: 'Sans réponse, le choix par défaut s’applique à l’échéance.', view: null, urgent: true });
  const thUp = getUpgradeInfo(state, 'townhall', th + 1, mods);
  if (th < BUILDINGS.townhall.maxLevel) {
    const unlocks = Object.entries(BUILDINGS).filter(([, d]) => d.req?.townhall === th + 1).map(([, d]) => `${d.icon} ${d.name}`);
    (canAfford(state, thUp.cost) ? short : mid).push({ icon: '🏛️', title: `Hôtel de ville niveau ${th + 1}`, desc: unlocks.length ? `Débloque : ${unlocks.join(', ')}` : 'Augmente le niveau maximal des bâtiments et la capacité.', prereq: canAfford(state, thUp.cost) ? 'Ressources disponibles' : `Coût : ${costText(thUp.cost)}`, view: 'city' });
  }
  const cur = state.live?.current;
  if (cur) {
    const def = LIVE_EVENTS[cur.key];
    const daily = dailyMissions(state).filter((m) => !m.claimed);
    for (const m of daily.slice(0, 2)) short.push({ icon: '🗓️', title: `${def.icon} Mission du jour : ${m.label}`, cur: Math.min(m.value || 0, m.target), max: m.target, done: (m.value || 0) >= m.target, reward: `${m.reward} ${def.currency.icon}`, view: 'event' });
  }

  // ── Objectifs adaptés à la situation (v13) : stocks, pénuries, armée, factions, projets, quêtes ──
  for (const g of situationalGoals(state, mods, now)) ({ short, mid, long })[g.term].push(g);

  // ── Moyen terme ──
  const avail = Object.keys(TECHS).filter((id) => techStatus(state, id).status === 'available').sort((a, b) => Object.values(researchCost(a, mods)).reduce((x, y) => x + y, 0) - Object.values(researchCost(b, mods)).reduce((x, y) => x + y, 0));
  if (avail.length) mid.push({ icon: '🔬', title: `Recherche : ${TECHS[avail[0]].name}`, desc: TECHS[avail[0]].desc, prereq: `Coût : ${costText(researchCost(avail[0], mods))}`, view: 'research', extra: avail.length > 1 ? `${avail.length - 1} autre(s) technologie(s) disponible(s)` : '' });
  else if (!levelOf(state, 'library')) mid.push({ icon: '🔬', title: 'Construire une Bibliothèque', desc: 'Ouvre l’arbre technologique.', view: 'city' });
  const tLimit = territoryLimit(state, mods), tCount = Object.keys(state.territories).length;
  if (tCount < tLimit) mid.push({ icon: '🚩', title: 'Établir un avant-poste', desc: 'Un territoire spécialisé rapporte un bonus local (et demande un entretien).', cur: tCount, max: tLimit, view: 'world' });
  for (const m of milestoneList(state).filter((x) => !x.done).sort((a, b) => b.value / b.target - a.value / a.target).slice(0, 2)) mid.push({ icon: '🏅', title: `Jalon : ${m.title} (palier ${m.tier + 1})`, cur: m.value, max: m.target, reward: `${costText(m.reward)} + 1 insigne`, view: 'kingdom' });
  if (cur) for (const o of eventObjectives(state).filter((x) => !x.claimed).sort((a, b) => b.value / b.target - a.value / a.target).slice(0, 2)) mid.push({ icon: LIVE_EVENTS[cur.key].icon, title: o.label, cur: o.value, max: o.target, done: o.done, view: 'event' });
  const best = Math.max(-1, ...state.inventory.items.map((i) => RARITY_ORDER.indexOf(i.rarity)));
  if (best < RARITY_ORDER.indexOf('legendary')) mid.push({ icon: '⚒️', title: `Obtenir un équipement ${best < 2 ? 'épique' : 'légendaire'}`, desc: 'Forge avec catalyseurs, boss de donjon, boss mondiaux, boutiques d’événement.', view: 'craft' });

  // ── Long terme ──
  const trophies = Object.keys(state.bossTrophies || {}).length, nb = Object.keys(BOSSES).length;
  long.push({ icon: '🐉', title: 'Vaincre tous les boss mondiaux', cur: trophies, max: nb, prereq: th < 3 ? 'Hôtel de ville 3 (les boss apparaissent ensuite)' : null, reward: 'Exploit des Anciens : 5 💠', view: 'world' });
  for (const c of collectionStatus(state).filter((x) => !x.done).sort((a, b) => b.cur / b.max - a.cur / a.max).slice(0, 2)) long.push({ icon: '🏺', title: `Collection : ${c.name}`, cur: c.cur, max: c.max, desc: c.desc, reward: `Bonus permanent : ${Object.entries(c.mods).map(([k, v]) => `${k} +${Math.round(v * 100)} %`).join(', ')}`, view: 'treasury' });
  long.push({ icon: '🏚️', title: 'Purger un donjon de niveau 15', cur: state.stats.maxDungeonLevel || 0, max: 15, reward: 'Exploit : 5 💠', done: (state.stats.maxDungeonLevel || 0) >= 15, view: 'world' });
  const sh = shardState(state);
  const left = FEATS.filter((f) => !sh.feats[f.id]).length;
  if (left) long.push({ icon: '💠', title: 'Exploits des Anciens', cur: FEATS.length - left, max: FEATS.length, reward: 'Éclats Anciens (une seule fois chacun)', view: 'shards' });
  const pity = wheelCfg(state).pity;
  long.push({ icon: '🎡', title: 'Garantie légendaire de la Roue', cur: sh.pity.legendary, max: pity.legendary, reward: 'Récompense légendaire garantie', view: 'wheel' });
  long.push({ icon: '👑', title: 'Fonder une nouvelle dynastie', cur: th, max: PRESTIGE_TH, desc: 'Recommencer avec des avantages permanents limités.', view: 'talents', done: th >= PRESTIGE_TH });
  return { short, mid, long };
}

// Objectifs adaptés à l'état réel du royaume. Chaque objectif est atteignable maintenant ou explique ce qui manque ;
// rien n'est obligatoire. term : short (immédiat), mid (moyen terme), long (long terme).
export function situationalGoals(state, mods = computeMods(state), now = Date.now()) {
  const out = [];
  const th = thLevel(state);
  const net = netRates(state, mods);
  // Économie : la nourriture d'abord
  const foodNet = net.food || 0;
  if (foodNet < 0) {
    const h = (state.resources.food || 0) / -foodNet;
    out.push({ term: 'short', icon: '🌾', title: 'Stabiliser la nourriture', desc: `Bilan ${Math.round(foodNet)}/h${h < 48 ? ` : réserves vides dans ${Math.max(1, Math.round(h))} h` : ''}. Ferme, moulin, pause d’une chaîne gourmande ou achat au marché : le Bilan détaille les options.`, cur: 0, max: 1, view: 'ecoReport', urgent: h < 12, tag: 'eco' });
  }
  // Excédent → investissement utile (Grand Projet abordable qui emploie la ressource pleine)
  const full = Object.keys(state.resources).filter((r) => RESOURCES[r] && isCapped(r) && (state.resources[r] || 0) >= storageCap(state, mods, r) * 0.95);
  if (full.length) {
    let crown = [];
    try { crown = crownList(state, now).filter((i) => i.status === 'available' && i.affordable && full.some((r) => i.cost[r])); } catch { crown = []; }
    if (crown.length) out.push({ term: 'mid', icon: crown[0].def.icon, title: `Investir l’excédent : ${crown[0].def.name}`, desc: `${full.map((r) => RESOURCES[r].name).join(', ')} au plafond : ce Grand Projet l’emploie et rapporte une récompense connue d’avance.`, view: 'projects', tag: 'eco' });
    else out.push({ term: 'short', icon: '📦', title: `${full.map((r) => RESOURCES[r].name).join(', ')} au plafond`, desc: 'La production est perdue : transformez, investissez ou vendez à bon prix (Bilan → recommandations).', view: 'ecoReport', tag: 'eco' });
  }
  // Militaire : seulement si les réserves suivent (nourriture positive) et qu'une cible est à la mesure de l'armée
  if (th >= 5 && foodNet >= 0 && combatUnitCount(state.army) >= 30) {
    const targets = (state.factions || []).filter((f) => canStartCampaign(state, f.idx, now).ok && playerPower(state) >= factionPower(state, f) * 0.9);
    if (targets.length) { const f = targets.sort((a, b) => a.relation - b.relation)[0]; out.push({ term: 'mid', icon: '⚔️', title: `Campagne possible contre ${RIVALS[f.idx]?.name}`, desc: 'Vos réserves sont saines et votre armée fait jeu égal. Facultatif : la diplomatie ou le commerce restent possibles.', view: 'warcampaign', tag: 'mil' }); }
  }
  // Factions : occasions et sanctions
  for (const f of state.factions || []) {
    if (f.negotiableUntil > now && f.stance === 'war') out.push({ term: 'short', icon: '🏳️', title: `${RIVALS[f.idx]?.name} est prête à négocier`, desc: 'Affaiblie, elle accepterait plus facilement la paix (et un pacte) pour quelques heures.', view: 'factions', until: f.negotiableUntil, tag: 'diplo' });
    if (f.embargoUntil > now) out.push({ term: 'mid', icon: '⛔', title: `Lever l’embargo de ${RIVALS[f.idx]?.name}`, desc: 'Ramenez la relation au-dessus de −30 (ambassade, geste d’apaisement) : vos caravanes retrouvent leurs gains.', cur: Math.max(0, Math.round(f.relation + 100)), max: 70, view: 'factions', tag: 'diplo' });
  }
  // Quêtes : un choix en attente passe devant
  try {
    for (const l of questlineList(state).filter((x) => x.active && !x.finished && x.current?.choice)) out.push({ term: 'short', icon: '⚖️', title: `${l.title} : un choix vous attend`, desc: l.current.desc, view: 'goals', tag: 'quest' });
    const legacy = questlineList(state).find((x) => x.id === 'legacy_mastery' && x.active && !x.finished);
    if (legacy?.current) out.push({ term: 'long', icon: legacy.icon, title: `Héritage : ${legacy.current.title}`, desc: legacy.current.desc, cur: legacy.current.cur, max: legacy.current.target, view: legacy.current.view || 'goals', tag: 'legacy' });
  } catch { /* quêtes indisponibles : objectifs ignorés */ }
  return out;
}
