// Comportement du joueur simulé pour les systèmes récents (étapes 6 et v10) : conseil royal, fouilles, défis de
// maîtrise, monument dynastique, expéditions légendaires, apaisement des factions rivales.
// Le joueur simulé agit comme un joueur raisonnable mais non omniscient : il ne connaît pas la réponse des
// énigmes (il élimine les mauvaises réponses), il choisit la première option abordable au conseil, etc.
import { rng } from '../src/core/rng.js';
import { commissionList, claimCommission, startCommission, stageCheck, launchStage, abandonCommission } from '../src/systems/commissions.js';
import { MOTIONS } from '../src/data/council.js';
import { MYSTERIES } from '../src/data/archaeology.js';
import { LEGENDS } from '../src/data/legendary.js';
import { councilState, optionCost, decideMotion } from '../src/systems/council.js';
import { archaeoState, canDig, startDig, studyFragment, riddleReady, answerRiddle } from '../src/systems/archaeology.js';
import { challengeState, canStartChallenge, startChallenge } from '../src/systems/challenges.js';
import { monumentOf, setOrientation } from '../src/systems/monument.js';
import { legendState, canDepart, depart, currentEvent, choiceAllowed, decide, chooseFate, freeHeroes, estimateFinal } from '../src/systems/legendary.js';
import { rivalryStatus, deescalate } from '../src/systems/rivalry.js';
import { startBuild } from '../src/systems/construction.js';
import { sendMarch } from '../src/systems/marches.js';
import { thLevel } from '../src/systems/city.js';
import { missionList, claimDynMission, missionsTick } from '../src/systems/missions.js';
import { breachForts, breachDefense } from '../src/systems/breach.js';
import { armyPower } from '../src/systems/army.js';
import { previewBattle } from '../src/systems/combat.js';
import { maxMarches } from '../src/systems/marches.js';
import { isRevealed } from '../src/systems/world.js';
import { applySpeedup, previewSpeedup } from '../src/systems/speedups.js';
import { SPEEDUP_ORDER, RECRUIT_ORDER, SPEEDUPS } from '../src/data/speedups.js';
import { crownList, startCrown, claimCrown, crownRunning } from '../src/systems/crown.js';
import { crownSlots } from '../src/data/crown.js';
import { thLevel as thLvl } from '../src/systems/city.js';

// Défi préféré selon le style de jeu (les autres sont tentés à tour de rôle ensuite)
const CHALLENGE_PREF = { active: ['steadfast', 'peril', 'scarcity'], optimized: ['steadfast', 'scarcity', 'peril', 'lightHand'], economy: ['autarky', 'scarcity'], military: ['discipline', 'peril'], explorer: ['peril', 'steadfast'], casual: ['scarcity'] };
const ORIENT_PREF = { active: 'garden', optimized: 'archives', economy: 'garden', military: 'memorial', explorer: 'archives', casual: 'garden' };
// Seigneurs de la Brèche : appétit selon le style, et marge de puissance visée (armée envoyée / garnison)
const BREACH_PREF = { casual: [0.2, 2.4], active: [0.35, 2], optimized: [0.5, 1.7], economy: [0.1, 2.6], military: [0.7, 1.6], explorer: [0.2, 2.2], diplomat: [0.1, 2.6] };
const affordable = (s, cost) => Object.entries(cost).every(([r, v]) => (s.resources[r] || 0) >= v * 1.5);

export function v10Bot(s, profileKey, t, bestTile, mods) {
  const st = (s.botStats ||= { motions: 0, digs: 0, answers: 0, challenges: 0, legends: 0, deesc: 0 });
  // Conseil : la première option qu'il peut payer sans se ruiner, sinon la dernière (généralement gratuite)
  const C = councilState(s);
  if (C.motion && MOTIONS[C.motion.id]) {
    const opts = MOTIONS[C.motion.id].options;
    const i = opts.findIndex((o) => affordable(s, optionCost(s, o)));
    if (decideMotion(s, i >= 0 ? i : opts.length - 1, t).ok) st.motions++;
  }
  // Fouilles : explorer la zone indiquée, fouiller, étudier, puis éliminer les réponses une à une
  const A = archaeoState(s), m = A.active;
  if (m) {
    const pending = m.sites.findIndex((x) => x.found && !x.studied);
    if (pending >= 0) studyFragment(s, pending, (s.resources.crystals || 0) >= 4 ? 'deep' : 'quick', t);
    const i = m.sites.findIndex((x, k) => canDig(s, k, t).ok);
    if (i >= 0 && startDig(s, i, t).ok) st.digs++;
    const lost = m.sites.find((x) => !x.located);
    if (lost && (s.army.scout || 0) > 0 && s.marches.length < 3) sendMarch(s, { type: 'explore', x: lost.cx + rng.int(-2, 2), y: lost.cy + rng.int(-2, 2), units: { scout: 1 } }, t);
    if (riddleReady(m) && !(m.retryAt > t)) {
      const def = MYSTERIES[m.id];
      const left = def.answers.map((_, k) => k).filter((k) => !m.eliminated.includes(k));
      if (answerRiddle(s, rng.pick(left), t).ok) st.answers++;
    }
  }
  // Missions du royaume accomplies : réclamées (comme le ferait un joueur)
  // (l'interface appelle missionsTick toutes les 3 s ; la simulation le fait à chaque session)
  try { missionsTick(s, t); for (const mi of missionList(s)) if (mi.done) claimDynMission(s, mi.id, t); } catch { /* missions indisponibles */ }
  // Défis de maîtrise : un à la fois, selon le style de jeu ; le moins tenté d'abord
  const CH = challengeState(s);
  if (!CH.active) {
    const tries = (k) => CH.history.filter((h) => h.id === k).length;
    const prefs = [...(CHALLENGE_PREF[profileKey] || [])].sort((a, b) => tries(a) - tries(b));
    const id = prefs.find((k) => canStartChallenge(s, k, t).ok);
    if (id && startChallenge(s, id, t).ok) st.challenges++;
  }
  // Monument : placé dès l'hôtel de ville 7, consacré selon le style ; ses étapes suivent les améliorations habituelles
  const mon = monumentOf(s);
  if (!mon && thLevel(s) >= 7) { const tile = bestTile(s, 'monument', mods); if (tile) startBuild(s, 'monument', tile.x, tile.y, t); }
  if (mon && !mon.orient && mon.level >= 1) setOrientation(s, ORIENT_PREF[profileKey] || 'garden', t);
  // Expéditions légendaires : départ dès qu'un indice existe ; décisions qui renforcent l'escorte si possible
  const L = legendState(s);
  if (L.active?.pending) {
    const ev = currentEvent(L.active);
    const scored = ev.choices.map((c, k) => ({ k, ok: choiceAllowed(s, L.active, c).ok, score: (c.fx?.power || 0) + (c.fx?.morale || 0) - (c.fx?.losses || 0) * 100 - (c.fx?.supplies < 0 && L.active.supplies <= 0 ? 15 : 0) })).filter((x) => x.ok);
    const best = scored.sort((a, b) => b.score - a.score)[0];
    if (best) decide(s, best.k, t);
  } else if (L.active?.awaitingFate) {
    chooseFate(s, rng.pick(['keep', 'archive', 'give']), t);
  } else if (!L.active) {
    const hero = [...freeHeroes(s)].sort((a, b) => b.level - a.level)[0];
    for (const id of Object.keys(LEGENDS)) {
      // Comme un joueur prudent : il consulte l'estimation et renforce l'escorte si besoin, sinon il attend
      let opts = { provisions: 'normal', escort: 'medium', route: LEGENDS[id].routes[0].id, heroId: hero?.id };
      if (estimateFinal(s, id, opts, t)?.winner !== 'attacker') opts = { ...opts, escort: 'large', provisions: 'abundant' };
      if (estimateFinal(s, id, opts, t)?.verdict === 'Défaite probable') continue;
      if (canDepart(s, id, opts, t).ok && affordable(s, { food: 1600 }) && depart(s, id, opts, t).ok) { st.legends++; break; }
    }
  }
  // Passe-temps : le plus petit qui ne gaspille pas plus de la moitié de sa durée ; le joueur très optimisé
  // dépense aussi des gemmes quand il en a beaucoup (les gemmes ne sont jamais indispensables)
  for (const q of [...s.queues.build]) {
    const left = (q.end - t) / 60000;
    if (left < 8) continue;
    const k = SPEEDUP_ORDER.filter((x) => (s.inventory.consumables[x] || 0) > 0 && SPEEDUPS[x].min <= left * 2).pop();
    if (k) { if (applySpeedup(s, q.id, { item: k }, t).ok) st.speedUsed = (st.speedUsed || 0) + 1; }
    else if (profileKey === 'optimized' && (s.resources.gems || 0) > 60 && previewSpeedup(s, q.id, { gems: 'hour' }, t).ok) applySpeedup(s, q.id, { gems: 'hour' }, t);
  }
  // Passe-temps de recrutement : même règle, seulement sur la formation EN COURS de chaque bâtiment
  for (const q of [...s.queues.train]) {
    const left = (q.end - t) / 60000;
    if (left < 8 || q.start > t) continue;
    const k = RECRUIT_ORDER.filter((x) => (s.inventory.consumables[x] || 0) > 0 && SPEEDUPS[x].min <= left * 2).pop();
    if (k && applySpeedup(s, q.id, { item: k }, t).ok) st.rspeedUsed = (st.rspeedUsed || 0) + 1;
  }
  // Grands Projets du Royaume : récupérer ce qui est fini ; lancer un projet seulement s'il laisse au moins la
  // moitié de chaque stock (dépense facultative d'excédent, jamais au détriment des chantiers)
  for (const i of crownList(s, t)) if (i.status === 'claimable' && claimCrown(s, i.id, t).ok) st.crown = (st.crown || 0) + 1;
  if (crownRunning(s) < crownSlots(thLvl(s)) && rng.chance(0.3)) {
    const c = crownList(s, t).find((i) => i.status === 'available' && Object.entries(i.cost).every(([r, v]) => (s.resources[r] || 0) >= 2 * v));
    if (c) startCrown(s, c.id, t);
  }
  // Seigneurs de la Brèche : espionner, puis attaquer avec une armée à la mesure de la garnison (jamais écrasante :
  // le joueur voit le seuil de mérite dans la fenêtre d'attaque) si l'estimation annonce une victoire
  const [appetite, margin] = BREACH_PREF[profileKey] || [0.3, 2];
  if (s.marches.length < maxMarches(mods) && rng.chance(appetite)) {
    const forts = breachForts(s).filter((p) => isRevealed(s.world, p.x, p.y) && !(p.clearedUntil > t)).sort((a, b) => b.breach.level - a.breach.level);
    for (const p of forts) {
      if (!p.scouted && (s.army.scout || 0) > 0) { sendMarch(s, { type: 'scout', x: p.x, y: p.y, units: { scout: 1 } }, t); break; }
      if (!p.scouted) continue;
      const D = breachDefense(s, p, t);
      const want = armyPower(D.enemies) * (1 + D.fort) * margin;
      const avail = Object.fromEntries(Object.entries(s.army).filter(([u, n]) => n > 0 && u !== 'scout' && u !== 'spy'));
      const have = armyPower(avail);
      if (have < want * 0.95) continue;
      const f = want / have;
      const units = Object.fromEntries(Object.entries(avail).map(([u, n]) => [u, Math.floor(n * f)]).filter(([, n]) => n > 0));
      const pv = previewBattle({ units, mods, formation: 'balanced' }, { units: D.enemies, mods: D.enemyMods, fort: D.fort, formation: D.formation }, { terrain: 'plain', weather: 'clear', deterministic: true });
      if (pv.winner !== 'attacker' || pv.lossRatio > 0.35) continue;
      if (sendMarch(s, { type: 'attack', x: p.x, y: p.y, units }, t).ok) { st.breachSent = (st.breachSent || 0) + 1; break; }
    }
  }
  // Commandes prestigieuses : accepter la première disponible, lancer les étapes, recevoir l'ouvrage
  const cm = commissionList(s);
  if (cm.some((c) => c.status === 'ready')) claimCommission(s, t);
  else if (!cm.some((c) => c.status === 'active')) {
    // Comme un joueur qui lit les coûts : seulement une commande dont il a déjà les matériaux rares
    const RARE = ['silver', 'gems', 'crystals', 'rareOre', 'ancientWood'];
    const c = cm.find((x) => x.status === 'available' && x.stages.every((g) => Object.entries(g.cost).every(([r, v]) => !RARE.includes(r) || (s.resources[r] || 0) >= v)));
    if (c && rng.chance(0.3)) startCommission(s, c.id, t);
  } else if (stageCheck(s, t).ok && rng.chance(0.5)) launchStage(s, t);
  else if (s.commissions.active && t - s.commissions.active.started > 48 * 3600000 && !(s.commissions.active.stageEnd > t)) abandonCommission(s, t);
  // Factions rivales : réparations quand le trésor le permet
  for (const f of s.factions || []) if (rivalryStatus(f, t)?.key === 'rival' && (s.resources.gold || 0) > 5000 && deescalate(s, f.idx, 'reparations', t).ok) st.deesc++;
}
