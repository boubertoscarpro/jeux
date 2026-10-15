// Commandes prestigieuses d'artisans (données : data/commissions.js).
// state.commissions = { active: { id, stage, stageEnd, started, faction?, ready? } | null, done: { id: date } }
// Une commande à la fois ; chaque étape se paie au lancement (jamais remboursée) ; récompense versée une seule fois.
import { COMMISSIONS, COMMISSION_ORDER } from '../data/commissions.js';
import { UNIQUE_ITEMS } from '../data/items.js';
import { pay, missing } from './economy.js';
import { createUniqueItem } from './items.js';
import { shardState } from './shards.js';
import { changeRelation } from './factions.js';
import { remember } from './rivalry.js';
import { bumpRep } from './reputation.js';
import { grantSpeedups } from './speedups.js';
import { chronicle } from './chronicle.js';
import { log, feat } from './log.js';

const H = 3600000;

export function commissionState(state) {
  const C = (state.commissions && typeof state.commissions === 'object' && !Array.isArray(state.commissions)) ? state.commissions : (state.commissions = {});
  C.done ||= {};
  C.active ??= null;
  if (C.active && !COMMISSIONS[C.active.id]) C.active = null; // commande inconnue (sauvegarde modifiée)
  return C;
}

export function commissionStatus(state, id) {
  const C = commissionState(state), def = COMMISSIONS[id];
  if (!def) return { status: 'none', reason: 'Commande inconnue' };
  if (C.done[id]) return { status: 'done', reason: 'Déjà réalisée pour cette dynastie' };
  if (C.active?.id === id) return { status: C.active.ready ? 'ready' : 'active' };
  const r = def.req(state);
  if (r) return { status: 'locked', reason: r };
  if (C.active) return { status: 'busy', reason: 'Un autre ouvrage occupe déjà les ateliers' };
  return { status: 'available' };
}

export function startCommission(state, id, now = Date.now()) {
  const st = commissionStatus(state, id);
  if (st.status !== 'available') return { ok: false, reason: st.reason || 'Indisponible' };
  const a = { id, stage: 0, stageEnd: 0, started: now };
  if (id === 'allyChalice') a.faction = (state.factions || []).find((f) => f.stance === 'alliance' || f.stance === 'trade')?.idx ?? null;
  commissionState(state).active = a;
  log(state, 'info', `${COMMISSIONS[id].icon} Commande acceptée : « ${COMMISSIONS[id].name} ».`, now);
  return { ok: true };
}

// Ce qu'il faut pour lancer l'étape en cours : { ok, reason, stage, cost }
export function stageCheck(state, now = Date.now()) {
  const a = commissionState(state).active;
  if (!a) return { ok: false, reason: 'Aucune commande en cours' };
  const def = COMMISSIONS[a.id], stage = def.stages[a.stage];
  if (a.ready || !stage) return { ok: false, reason: 'Ouvrage terminé : réclamez-le' };
  if (a.stageEnd > now) return { ok: false, reason: 'Étape en cours dans les ateliers', stage };
  const c = stage.cond?.(state);
  if (c) return { ok: false, reason: c, stage };
  if (stage.relic && (shardState(state).relicFragments || 0) < stage.relic) return { ok: false, reason: `${stage.relic} fragment(s) de relique requis`, stage };
  const miss = missing(state, stage.cost);
  if (Object.keys(miss).length) return { ok: false, reason: 'Ressources insuffisantes', missing: miss, stage };
  return { ok: true, stage, cost: stage.cost };
}

export function launchStage(state, now = Date.now()) {
  const chk = stageCheck(state, now);
  if (!chk.ok) return chk;
  const a = commissionState(state).active;
  if (!pay(state, chk.cost)) return { ok: false, reason: 'Ressources insuffisantes' };
  if (chk.stage.relic) shardState(state).relicFragments -= chk.stage.relic;
  a.stageEnd = now + chk.stage.hours * H;
  return { ok: true };
}

// Moteur : fin des étapes
export function commissionsTick(state, now) {
  const a = commissionState(state).active;
  if (!a || !a.stageEnd || a.stageEnd > now) return;
  const def = COMMISSIONS[a.id];
  a.stageEnd = 0;
  a.stage++;
  if (a.stage >= def.stages.length) {
    a.ready = true;
    feat(def.icon, `Commande terminée : ${def.name}`, 'L’ouvrage vous attend à la forge.');
  } else log(state, 'good', `${def.icon} « ${def.name} » : étape ${a.stage}/${def.stages.length} achevée. Étape suivante : ${def.stages[a.stage].name}.`, now);
}

export function claimCommission(state, now = Date.now()) {
  const C = commissionState(state), a = C.active;
  if (!a?.ready) return { ok: false, reason: 'Ouvrage pas encore terminé' };
  const def = COMMISSIONS[a.id];
  if (C.done[a.id]) { C.active = null; return { ok: false, reason: 'Déjà réalisée' }; }
  // Marqué AVANT de verser : un second appel ne peut jamais redonner la récompense
  C.done[a.id] = now; C.active = null;
  const r = def.reward, parts = [];
  if (r.unique && UNIQUE_ITEMS[r.unique]) { state.inventory.items.push(createUniqueItem(r.unique)); parts.push(UNIQUE_ITEMS[r.unique].name); }
  if (r.insignia) { state.meta.insignia = (state.meta.insignia || 0) + r.insignia; parts.push(`${r.insignia} insignes`); }
  if (r.relic) { shardState(state).relicFragments += r.relic; parts.push(`${r.relic} fragments de relique`); }
  if (r.relation && a.faction !== null && a.faction !== undefined) { changeRelation(state, a.faction, r.relation); remember(state, a.faction, 'gift', 20, 'Calice cérémoniel offert par votre royaume', now); parts.push(`relation +${r.relation}`); }
  if (r.rep) for (const [k, v] of Object.entries(r.rep)) bumpRep(state, k, v);
  if (r.speedups) { const t = grantSpeedups(state, r.speedups, '', now, `commission:${a.id}`); if (t) parts.push(t); }
  state.stats.commissions = (state.stats.commissions || 0) + 1;
  chronicle(state, `${def.icon} Les artisans du royaume achèvent « ${def.name} ».`, now);
  return { ok: true, text: parts.join(', ') };
}

export function abandonCommission(state, now = Date.now()) {
  const C = commissionState(state);
  if (!C.active) return { ok: false, reason: 'Aucune commande en cours' };
  if (C.active.stageEnd > now) return { ok: false, reason: 'Attendez la fin de l’étape en cours' };
  log(state, 'info', `${COMMISSIONS[C.active.id].icon} Commande « ${COMMISSIONS[C.active.id].name} » abandonnée (les étapes payées sont perdues).`, now);
  C.active = null;
  return { ok: true };
}

export const commissionList = (state) => COMMISSION_ORDER.map((id) => ({ id, ...COMMISSIONS[id], ...commissionStatus(state, id) }));
