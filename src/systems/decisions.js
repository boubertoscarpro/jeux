import { DILEMMAS, SECRET_EVENTS } from '../data/dilemmas.js';
import { RIVALS } from '../data/world.js';
import { RESOURCES } from '../data/resources.js';
import { rng } from '../core/rng.js';
import { uid, fmt } from '../core/util.js';
import { thLevel } from './city.js';
import { gain, pay, armyTotals } from './economy.js';
import { computeMods } from './modifiers.js';
import { simulateBattle } from './combat.js';
import { bumpRep } from './reputation.js';
import { changeRelation, diplomacy } from './factions.js';
import { chronicle } from './chronicle.js';
import { grantArtifact } from './collection.js';
import { createHero } from './heroes.js';
import { createWorker, housing } from './workforce.js';
import { spawnPoi, findFreeTile, reveal, setTerrain, key, aroundCapital, worldScale } from './world.js';
import { maxHeroes } from './tavern.js';
import { log, toast } from './log.js';
import { shardState } from './shards.js';
import { castleName, outpostLabel } from './identity.js';
import { garrisonNeed } from './territory.js';
import { OUTPOST_THREATS } from '../data/territories.js';
import { levelOf } from './city.js';

const DECISION_TTL = 2 * 3600000;

function towns(state) { return Object.values(state.world.pois).filter((p) => p.type === 'town'); }

// Contexte des événements liés à la situation (avant-poste exposé, marché…)
function exposedOutpost(state, now = Date.now()) {
  const list = Object.entries(state.territories || {}).filter(([, t]) => !t.threatAt && !(t.pillagedUntil > now)
    && Object.values(t.garrison || {}).reduce((a, b) => a + b, 0) < garrisonNeed(t));
  return list.sort((a, b) => (b[1].level || 1) - (a[1].level || 1))[0] || null;
}
const needCtx = (state, now) => ({ market: levelOf(state, 'market'), exposedOutpost: exposedOutpost(state, now) });

// Préparations propres à certains événements (quantités, avant-poste visé…) ; null = événement annulé
const PREPARE = {
  caravanArrives: (state) => {
    const res = ['wood', 'stone', 'food', 'iron'].sort((a, b) => (state.resources[b] || 0) - (state.resources[a] || 0))[0];
    const qty = Math.max(100, Math.min(1500, Math.floor((state.resources[res] || 0) * 0.3 / 50) * 50));
    return { res, qty, gold: Math.round(qty * RESOURCES[res].price * 1.6) };
  },
  woodShortage: (state) => {
    const qty = Math.max(100, Math.min(1200, Math.floor((state.resources.wood || 0) * 0.5 / 50) * 50));
    return { res: 'wood', qty, gold: Math.round(qty * RESOURCES.wood.price * 2) };
  },
  factionOffer: (state, now, p) => {
    const ok = (state.factions || []).filter((f) => f.stance !== 'war');
    if (!ok.length) return null;
    p.faction = rng.pick(ok).idx;
    return {};
  },
  outpostThreat: (state, now) => {
    const e = exposedOutpost(state, now);
    if (!e) return null;
    const [k, t] = e;
    const g = Object.values(t.garrison || {}).reduce((a, b) => a + b, 0), need = garrisonNeed(t);
    t.threatAt = now + 2 * 3600000; // la menace est réelle : elle frappera à l'échéance, quel que soit le choix
    return { key: k, opId: t.id, outpost: outpostLabel(t), threat: (OUTPOST_THREATS[t.terrain] || OUTPOST_THREATS.plain).name.toLowerCase(), garrison: g, need, gold: (need - g) * 20 };
  },
};

export function fillDilemma(str, p) {
  const c = p.ctx || {};
  return String(str || '').replace(/\{(\w+)\}/g, (m, k) => {
    if (k === 'town') return p.townName || 'une cité libre';
    if (k === 'faction') return RIVALS[p.faction]?.name || 'une faction';
    if (k === 'food') return fmt(p.food);
    if (k === 'castle') return p.castle || 'votre château';
    if (k === 'resName') return RESOURCES[c.res]?.name.toLowerCase() || '';
    if (k in c) return typeof c[k] === 'number' ? fmt(c[k]) : String(c[k]);
    return m;
  });
}

// Fabrique une décision concrète (substitue ville, faction, quantités)
function instantiate(state, kind, evKey, now) {
  const src = kind === 'secret' ? SECRET_EVENTS[evKey] : DILEMMAS[evKey];
  const town = rng.pick(towns(state));
  const faction = rng.int(0, RIVALS.length - 1);
  const food = Math.round(1500 + thLevel(state) * 600);
  const p = { id: uid('dl'), kind, event: evKey, t: now, deadline: now + DECISION_TTL, town: town ? key(town.x, town.y) : null, townName: town?.name, faction, food, castle: castleName(state) };
  if (PREPARE[evKey]) { const c = PREPARE[evKey](state, now, p); if (!c) return null; p.ctx = c; }
  p.title = fillDilemma(src.title, p);
  p.text = fillDilemma(src.text, p);
  return p;
}

export function decisionsTick(state, now) {
  const th = thLevel(state);
  // Dilemmes : environ un par heure, s'il n'y en a pas déjà deux en attente
  if (th >= 2 && state.pending.filter((p) => p.kind === 'dilemma').length < 2 && now >= (state.nextDilemma || 0)) {
    // Événements adaptés à la situation (need) ; jamais deux fois de suite le même
    const h = needCtx(state, now);
    const pool = Object.entries(DILEMMAS).filter(([k, d]) => (d.minTH || 1) <= th && k !== state.lastDilemma && (!d.need || safeNeed(d, state, h))).map(([k, d]) => ({ k, weight: d.weight }));
    const pick = pool.length ? rng.weighted(pool).k : null;
    const p = pick && instantiate(state, 'dilemma', pick, now);
    if (p) {
      state.pending.push(p);
      state.lastDilemma = pick;
      toast(`${DILEMMAS[pick].icon} Une décision royale vous attend`, 'event');
    }
    state.nextDilemma = now + rng.int(45, 110) * 60000;
  }
  // Événements secrets : extrêmement rares (~1 toutes les 15 h de jeu)
  if (th >= 3 && rng.chance(1 / 900)) {
    const left = Object.keys(SECRET_EVENTS).filter((k) => !(state.secretsSeen || {})[k] || k === 'wanderingMerchant');
    if (left.length) {
      const k = rng.pick(left);
      (state.secretsSeen ||= {})[k] = now;
      const ev = SECRET_EVENTS[k];
      if (ev.choices) { state.pending.push(instantiate(state, 'secret', k, now)); toast(`${ev.icon} Événement extraordinaire !`, 'event'); }
      else applySecret(state, k, ev.fx, now);
      chronicle(state, `${ev.icon} ${ev.title} — ${ev.text}`, now);
    }
  }
  // Décisions expirées : choix par défaut
  for (const p of [...state.pending]) {
    if ((p.kind === 'dilemma' || p.kind === 'secret') && p.deadline <= now) {
      const src = p.kind === 'secret' ? SECRET_EVENTS[p.event] : DILEMMAS[p.event];
      resolveDecision(state, p.id, src.default, now, true);
    }
  }
}

function safeNeed(d, state, h) { try { return !!d.need(state, h, (state.factions || []).find((f) => f.stance !== 'war')); } catch { return false; } }

export function decisionSource(p) { return p.kind === 'secret' ? SECRET_EVENTS[p.event] : DILEMMAS[p.event]; }

export function resolveDecision(state, pid, idx, now = Date.now(), auto = false) {
  const p = state.pending.find((x) => x.id === pid);
  if (!p) return { ok: false };
  const src = decisionSource(p);
  const ch = src.choices[idx];
  if (!ch) return { ok: false };
  const fx = ch.fx || {};
  // Vérifie les coûts
  const cost = {};
  for (const [r, v] of Object.entries(fx.res || {})) if (v < 0) cost[r] = r === 'food' && v === -1 ? p.food : -v;
  if (!auto && Object.entries(cost).some(([r, v]) => (state.resources[r] || 0) < v)) return { ok: false, reason: 'Ressources insuffisantes' };
  if (!auto && fx.sell && (state.resources[p.ctx?.res] || 0) < (p.ctx?.qty || 0)) return { ok: false, reason: `Il vous faut ${fmt(p.ctx.qty)} ${RESOURCES[p.ctx.res]?.name.toLowerCase()}` };
  if (!auto && fx.outpostHire && (state.resources.gold || 0) < (p.ctx?.gold || 0)) return { ok: false, reason: `Il vous faut ${fmt(p.ctx.gold)} or` };
  if (fx.needArmy && Object.entries(armyTotals(state)).reduce((a, [u, n]) => a + (u === 'scout' || u === 'spy' ? 0 : n), 0) < fx.needArmy) return { ok: false, reason: `${fx.needArmy} soldats requis` };
  state.pending = state.pending.filter((x) => x.id !== pid);
  const text = applyDecisionFx(state, p, fx, now);
  const msg = `${src.icon} ${p.title} — ${auto ? 'faute de réponse : ' : ''}« ${ch.label} ». ${text}`;
  log(state, auto ? 'info' : 'event', msg, now);
  if (!auto && p.kind === 'dilemma' && (fx.vassal || fx.war)) chronicle(state, `${p.title} : le souverain choisit « ${ch.label} ».`, now);
  return { ok: true, text };
}

export function applyDecisionFx(state, p, fx, now) {
  const mods = computeMods(state, now);
  const parts = [];
  if (fx.res) {
    const d = {};
    for (const [r, v] of Object.entries(fx.res)) {
      if (r === 'food' && v === -1) d.food = -p.food;
      else if (r === 'gold' && v === 2 && fx.res.food === -1) d.gold = Math.round(p.food * 1.2);
      else d[r] = v;
    }
    for (const [r, v] of Object.entries(d)) if (v < 0) d[r] = -Math.min(-v, state.resources[r] || 0);
    gain(state, d, mods);
    parts.push(Object.entries(d).map(([r, v]) => `${v > 0 ? '+' : ''}${fmt(v)} ${RESOURCES[r].icon}`).join(' '));
  }
  const REP = { benefactor: 'bienfaiteur', merchant: 'marchand', tyrant: 'tyran', warrior: 'guerrier', lord: 'seigneur', diplomat: 'diplomate', explorer: 'explorateur' };
  if (fx.rep) for (const [a, n] of Object.entries(fx.rep)) { bumpRep(state, a, n); parts.push(`réputation de ${REP[a] || a} ${n > 0 ? '+' : ''}${n}`); }
  if (fx.relation) { changeRelation(state, p.faction, fx.relation); parts.push(`relation avec ${RIVALS[p.faction]?.name || 'la faction'} ${fx.relation > 0 ? '+' : ''}${fx.relation}`); }
  if (fx.townRel && p.town) { const t = state.world.pois[p.town]; if (t) t.relation = (t.relation || 0) + fx.townRel; }
  if (fx.vassal && p.town) { const t = state.world.pois[p.town]; if (t) { t.vassal = true; parts.push(`${t.name} devient votre vassale`); chronicle(state, `${t.name} passe sous la bannière de ${state.meta.kingdomName}.`, now); } }
  if (fx.war) { const r = diplomacy(state, p.faction, 'war', now); if (r.ok) parts.push(r.msg); }
  if (fx.workers) { let k = 0; for (let i = 0; i < fx.workers && state.workers.length < housing(state); i++) { state.workers.push(createWorker()); k++; } parts.push(`+${k} ouvrier(s)`); }
  if (fx.injureWorkers) { const ws = state.workers.filter((w) => !w.job || w.job.type === 'sector').slice(0, fx.injureWorkers); ws.forEach((w) => { w.injuredUntil = now + 3 * 3600000; }); parts.push(`${ws.length} ouvrier(s) malade(s)`); }
  if (fx.buff) { state.buffs.push({ name: fx.buff.name, mods: fx.buff.mods, until: now + fx.buff.duration * 1000 }); parts.push(fx.buff.name); }
  if (fx.hero) {
    if (state.heroes.length < maxHeroes(state) + 1) { const h = createHero({ rarity: fx.hero, name: 'Aurélien, Dernier Roi de l’Aube', cls: 'general' }); state.heroes.push(h); parts.push(`${h.name} rejoint votre cour`); }
  }
  if (fx.artifact) { const a = grantArtifact(state, null, now, p.title); parts.push(a ? `artefact : ${a}` : 'rien de nouveau'); }
  if (fx.gamble) {
    if (rng.chance(fx.gamble.win)) { const a = grantArtifact(state, null, now, p.title); parts.push(a ? `artefact : ${a}` : 'la porte était vide'); }
    else { state.buffs.push({ name: fx.gamble.curse.name, mods: fx.gamble.curse.mods, until: now + fx.gamble.curse.duration * 1000 }); parts.push(fx.gamble.curse.name); }
  }
  if (fx.duel) {
    const h = [...state.heroes].sort((a, b) => b.level - a.level)[0];
    const win = rng.chance(Math.min(0.85, 0.35 + (h?.level || 1) * 0.03));
    if (win) { bumpRep(state, 'warrior', 20); changeRelation(state, p.faction, 10); parts.push(`${h.name} triomphe !`); }
    else { bumpRep(state, 'warrior', -10); changeRelation(state, p.faction, -5); parts.push(`${h?.name || 'Votre champion'} est vaincu…`); }
  }
  if (fx.fight) {
    const units = Object.fromEntries(Object.entries(state.army).filter(([u, n]) => n > 0 && u !== 'scout' && u !== 'spy'));
    if (!Object.keys(units).length) parts.push('aucune troupe disponible : l’occasion est manquée');
    else {
      const res = simulateBattle({ units, mods, formation: 'balanced', label: 'Garnison' }, { units: Object.fromEntries(Object.entries(fx.fight).map(([u, n]) => [u, Math.round(n * (1 + thLevel(state) * 0.15))])), mods: {} }, { terrain: 'plain', weather: state.weather.type });
      for (const [u, n] of Object.entries(res.attLosses)) state.army[u] = Math.max(0, (state.army[u] || 0) - n);
      if (res.winner === 'attacker') {
        state.stats.battlesWon++;
        parts.push('victoire');
        const wfx = fx.win || {};
        parts.push(applyDecisionFx(state, p, { ...wfx, fight: null, artifact: wfx.artifactChance && rng.chance(wfx.artifactChance) }, now));
      } else { state.stats.battlesLost++; parts.push('défaite'); }
    }
  }
  if (fx.crater || fx.lostCity) applySecret(state, fx.crater ? 'meteorite' : 'lostCity', fx, now);
  // ── Effets des événements de situation (v9) ──
  const c = p.ctx || {};
  if (fx.sell && c.res) {
    const q = Math.min(c.qty, Math.floor(state.resources[c.res] || 0));
    const g = Math.round(c.gold * (q / Math.max(1, c.qty)));
    state.resources[c.res] -= q; gain(state, { gold: g }, mods);
    state.stats.trades = (state.stats.trades || 0) + 1;
    parts.push(`−${fmt(q)} ${RESOURCES[c.res].icon}, +${fmt(g)} 🪙`);
  }
  if (fx.ifLow && (state.resources[fx.ifLow.res] || 0) < fx.ifLow.below) {
    const b = fx.ifLow.buff;
    state.buffs.push({ name: b.name, mods: b.mods, until: now + b.duration * 1000 });
    parts.push(`${b.name} (réserves trop basses)`);
  }
  if (fx.spawnRuin) {
    const w = state.world;
    const c0 = aroundCapital(w, 4, 9);
    const pos = findFreeTile(w, c0.x, c0.y, null, 4);
    if (pos) {
      const poi = spawnPoi(w, 'ruinSite', pos.x, pos.y, { danger: rng.int(1, 2) });
      reveal(w, pos.x, pos.y, 1.5);
      parts.push(`ruines révélées en (${pos.x}, ${pos.y})`);
      if (fx.spawnRuin.loot) { gain(state, fx.spawnRuin.loot, mods); parts.push(Object.entries(fx.spawnRuin.loot).map(([r, v]) => `+${fmt(v)} ${RESOURCES[r].icon}`).join(' ')); }
      if (fx.spawnRuin.threat && rng.chance(fx.spawnRuin.threat)) {
        const pos2 = findFreeTile(w, pos.x, pos.y, null, 3);
        if (pos2) { spawnPoi(w, 'crypt', pos2.x, pos2.y, { danger: 3 }); reveal(w, pos2.x, pos2.y, 1); parts.push(`les fouilles réveillent des gardiens : une crypte apparaît en (${pos2.x}, ${pos2.y})`); }
      }
      void poi;
    } else parts.push('aucun emplacement trouvé');
  }
  if (fx.outpostHire || fx.outpostReinforce || fx.outpostEvac) {
    const t = state.territories[c.key];
    if (!t || t.id !== c.opId) parts.push('l’avant-poste n’existe plus');
    else {
      const have = Object.values(t.garrison || {}).reduce((a, b) => a + b, 0);
      const missingN = Math.max(0, garrisonNeed(t) - have);
      t.garrison ||= {};
      if (fx.outpostHire) {
        const cost = Math.min(state.resources.gold || 0, missingN * 20);
        state.resources.gold -= cost;
        const n = Math.floor(cost / 20);
        if (n) t.garrison.spearman = (t.garrison.spearman || 0) + n;
        parts.push(`${n} lanciers engagés pour « ${outpostLabel(t)} » (−${fmt(cost)} 🪙)`);
      }
      if (fx.outpostReinforce) {
        let left = missingN, moved = 0;
        for (const u of ['spearman', 'swordsman', 'archer', 'crossbow', 'knight']) {
          if (left <= 0) break;
          const n = Math.min(left, state.army[u] || 0);
          if (n > 0) { state.army[u] -= n; t.garrison[u] = (t.garrison[u] || 0) + n; left -= n; moved += n; }
        }
        parts.push(moved ? `${moved} soldat(s) envoyés à « ${outpostLabel(t)} »` : 'aucune troupe disponible au château');
      }
      if (fx.outpostEvac) { t.evacUntil = now + 3 * 3600000; parts.push(`réserves de « ${outpostLabel(t)} » évacuées (production suspendue 3 h)`); }
    }
  }
  // Effets supplémentaires des sagas
  if (fx.relation2 && p.faction2 !== undefined) { changeRelation(state, p.faction2, fx.relation2); parts.push(`relation avec ${RIVALS[p.faction2]?.name || 'la faction'} ${fx.relation2 > 0 ? '+' : ''}${fx.relation2}`); }
  if (fx.relicFragments) { shardState(state).relicFragments += fx.relicFragments; parts.push(`+${fx.relicFragments} fragment(s) de relique`); }
  if (fx.units) { for (const [u, n] of Object.entries(fx.units)) state.army[u] = (state.army[u] || 0) + n; parts.push(Object.entries(fx.units).map(([u, n]) => `+${n} ${u}`).join(', ')); }
  if (fx.research) { const q = state.queues.research[0]; if (q) { q.end -= fx.research * 1000; q.start -= fx.research * 1000; parts.push('recherche accélérée'); } }
  if (fx.reveal) {
    const w = state.world;
    const { x, y } = aroundCapital(w, worldScale(w) * 0.35, worldScale(w) * 0.35);
    reveal(w, x, y, 4);
    parts.push(`région révélée vers (${x}, ${y})`);
  }
  if (fx.chance) {
    const c = fx.chance;
    const p0 = Math.min(0.9, c.base + (c.rep ? (state.reputation?.[c.rep] || 0) * c.per : 0));
    const win = rng.chance(p0);
    parts.push(`${win ? 'succès' : 'échec'} (${Math.round(p0 * 100)} % de chances)`);
    parts.push(applyDecisionFx(state, p, (win ? c.win : c.lose) || {}, now));
  }
  return parts.filter(Boolean).join(', ') + '.';
}

function applySecret(state, k, fx, now) {
  const w = state.world;
  if (fx.crater || k === 'meteorite') {
    const c0 = aroundCapital(w, 6, worldScale(w) * 0.45);
    const pos = findFreeTile(w, c0.x, c0.y, null, 5);
    if (!pos) return;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const x = pos.x + dx, y = pos.y + dy; if (x >= 0 && y >= 0 && x < w.size && y < w.size && !w.pois[key(x, y)]) setTerrain(w, x, y, 'ash'); }
    const p = spawnPoi(w, 'rareVein', pos.x, pos.y, { danger: 3 });
    p.name = 'Cratère de la météorite'; p.meteor = true;
    reveal(w, pos.x, pos.y, 1.5);
    log(state, 'event', `☄️ Un cratère fumant en (${pos.x}, ${pos.y}) : minerai rare… et peut-être du fer étoilé pour une expédition de prospection.`, now);
  }
  if (fx.lostCity || k === 'lostCity') {
    const c1 = aroundCapital(w, 8, worldScale(w) * 0.45);
    const pos = findFreeTile(w, c1.x, c1.y, null, 5);
    if (!pos) return;
    const p = spawnPoi(w, 'lostCity', pos.x, pos.y, { danger: 6 });
    reveal(w, pos.x, pos.y, 1);
    log(state, 'event', `🏯 La cité perdue de l’Aube se dresse en (${pos.x}, ${pos.y}). Ses gardiens sont redoutables.`, now);
    void p;
  }
}
