// Tableau des objectifs : prochaines étapes à court, moyen et long terme, calculées depuis l'état réel du jeu.
// Chaque objectif indique sa progression, ses prérequis, sa récompense et l'écran où agir.
import { BUILDINGS } from '../data/buildings.js';
import { TECHS, techCost } from '../data/techs.js';
import { RARITY_ORDER } from '../data/heroes.js';
import { FEATS } from '../data/shards.js';
import { LIVE_EVENTS } from '../data/liveEvents.js';
import { BOSSES } from '../data/world.js';
import { RESOURCES } from '../data/resources.js';
import { thLevel, levelOf } from './city.js';
import { computeMods } from './modifiers.js';
import { canAfford } from './economy.js';
import { getUpgradeInfo } from './construction.js';
import { techStatus } from './research.js';
import { activeQuests, milestoneList } from './quests.js';
import { collectionStatus } from './collection.js';
import { PRESTIGE_TH } from './talents.js';
import { territoryLimit } from './world.js';
import { shardState } from './shards.js';
import { wheelCfg } from './config.js';
import { objectives as eventObjectives } from './liveEvents.js';

const costText = (c) => Object.entries(c || {}).map(([r, v]) => `${Math.round(v)} ${RESOURCES[r]?.icon || r}`).join(' ');

export function goals(state, now = Date.now()) {
  const mods = computeMods(state, now);
  const th = thLevel(state);
  const short = [], mid = [], long = [];

  // ── Court terme ──
  for (const q of activeQuests(state)) short.push({ icon: '📌', title: q.title, desc: q.desc, cur: q.cur, max: q.target, done: q.done, reward: costText(q.reward), view: 'city', claim: q.done ? 'Réclamez-la dans le panneau Objectifs' : null });
  for (const c of (state.contracts || []).slice(0, 2)) {
    const have = state.resources[c.res] || 0;
    short.push({ icon: '📜', title: `Contrat : ${c.qty} ${RESOURCES[c.res].name} pour ${c.town}`, cur: Math.min(have, c.qty), max: c.qty, done: have >= c.qty, reward: costText(c.reward), until: c.until, view: 'convoys' });
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
    const daily = (cur.daily?.missions || []).filter((m) => !m.claimed);
    for (const m of daily.slice(0, 2)) short.push({ icon: '🗓️', title: `${def.icon} Mission du jour : ${m.label}`, cur: Math.min(m.value || 0, m.target), max: m.target, done: (m.value || 0) >= m.target, reward: `${m.reward} ${def.currency.icon}`, view: 'event' });
  }

  // ── Moyen terme ──
  const avail = Object.keys(TECHS).filter((id) => techStatus(state, id).status === 'available').sort((a, b) => Object.values(techCost(a)).reduce((x, y) => x + y, 0) - Object.values(techCost(b)).reduce((x, y) => x + y, 0));
  if (avail.length) mid.push({ icon: '🔬', title: `Recherche : ${TECHS[avail[0]].name}`, desc: TECHS[avail[0]].desc, prereq: `Coût : ${costText(techCost(avail[0]))}`, view: 'research', extra: avail.length > 1 ? `${avail.length - 1} autre(s) technologie(s) disponible(s)` : '' });
  else if (!levelOf(state, 'library')) mid.push({ icon: '🔬', title: 'Construire une Bibliothèque', desc: 'Ouvre l’arbre technologique.', view: 'city' });
  const tLimit = territoryLimit(state, mods), tCount = Object.keys(state.territories).length;
  if (tCount < tLimit) mid.push({ icon: '🚩', title: 'Établir un avant-poste', desc: 'Un territoire spécialisé rapporte un bonus local (et demande un entretien).', cur: tCount, max: tLimit, view: 'world' });
  for (const m of milestoneList(state).filter((x) => !x.done).sort((a, b) => b.value / b.target - a.value / a.target).slice(0, 2)) mid.push({ icon: '🏅', title: `Jalon : ${m.title} (palier ${m.tier + 1})`, cur: m.value, max: m.target, reward: `${costText(m.reward)} + 1 insigne`, view: 'kingdom' });
  if (cur) for (const o of eventObjectives(state).filter((x) => !x.claimed).sort((a, b) => b.value / b.target - a.value / a.target).slice(0, 2)) mid.push({ icon: LIVE_EVENTS[cur.key].icon, title: o.label, cur: o.value, max: o.target, done: o.done, view: 'event' });
  const best = Math.max(-1, ...state.inventory.items.map((i) => RARITY_ORDER.indexOf(i.rarity)));
  if (best < RARITY_ORDER.indexOf('legendary')) mid.push({ icon: '⚒️', title: `Obtenir un équipement ${best < 2 ? 'épique' : 'légendaire'}`, desc: 'Forge avec catalyseurs, boss de donjon, boss mondiaux, boutiques d’événement.', view: 'craft' });

  // ── Long terme ──
  const trophies = Object.keys(state.bossTrophies || {}).length, nb = Object.keys(BOSSES).length;
  long.push({ icon: '🐉', title: 'Vaincre tous les boss mondiaux', cur: trophies, max: nb, prereq: th < 3 ? 'Hôtel de ville 3 (les boss apparaissent ensuite)' : null, reward: 'Exploit des Anciens : 5 💎', view: 'world' });
  for (const c of collectionStatus(state).filter((x) => !x.done).sort((a, b) => b.cur / b.max - a.cur / a.max).slice(0, 2)) long.push({ icon: '🏺', title: `Collection : ${c.name}`, cur: c.cur, max: c.max, desc: c.desc, reward: `Bonus permanent : ${Object.entries(c.mods).map(([k, v]) => `${k} +${Math.round(v * 100)} %`).join(', ')}`, view: 'treasury' });
  long.push({ icon: '🏚️', title: 'Purger un donjon de niveau 15', cur: state.stats.maxDungeonLevel || 0, max: 15, reward: 'Exploit : 5 💎', done: (state.stats.maxDungeonLevel || 0) >= 15, view: 'world' });
  const sh = shardState(state);
  const left = FEATS.filter((f) => !sh.feats[f.id]).length;
  if (left) long.push({ icon: '💎', title: 'Exploits des Anciens', cur: FEATS.length - left, max: FEATS.length, reward: 'Éclats Anciens (une seule fois chacun)', view: 'shards' });
  const pity = wheelCfg(state).pity;
  long.push({ icon: '🎡', title: 'Garantie légendaire de la Roue', cur: sh.pity.legendary, max: pity.legendary, reward: 'Récompense légendaire garantie', view: 'wheel' });
  long.push({ icon: '👑', title: 'Fonder une nouvelle dynastie', cur: th, max: PRESTIGE_TH, desc: 'Recommencer avec des avantages permanents limités.', view: 'talents', done: th >= PRESTIGE_TH });
  return { short, mid, long };
}
