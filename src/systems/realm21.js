// v21 « Couleurs du Royaume » — Mécaniques (module pur) : hospice et blessés (B1), reliques de bâtiment (B2), châtelain
// (B3), camps de brigands à niveaux et ligue (B4), garnisons alliées (B5), auras et usure des décorations (B6), et
// leurs explications (« Pourquoi ? »). Branchées sur l'existant : pertes des combats, défense du château (siege.js),
// conseil, factions, logistique, décorations, modificateurs. Données : data/realm21.js.
import { HOSPICE, RELIC_SLOTS, RELIC_MOVE_H, RELIC_RADIATE, RELIC_CAP, BUILDING_RELICS, RELIC_SOURCES, CASTELLAN, BRIGANDS, ALLY_GARRISON, DECO_AURA, DECO_AURA_CAP, DECO_WEAR } from '../data/realm21.js';
import { BUILDINGS } from '../data/buildings.js';
import { TROPHIES } from '../data/trophies.js';
import { COSMETICS } from '../data/social.js';
import { POI_TYPES, RIVALS } from '../data/world.js';
import { HERO_CLASSES } from '../data/heroes.js';
import { UNITS } from '../data/units.js';
import { log, toast, feat } from './log.js';
import { shiftFavor } from './council.js';
import { changeRelation } from './factions.js';
import { uid, fmt } from '../core/util.js';

const H = 3600000;
const sum = (o) => Object.values(o || {}).reduce((a, b) => a + (b > 0 ? b : 0), 0);
const blds = (state) => Object.values(state.city?.buildings || {});
const levelOfType = (state, type) => blds(state).reduce((m, b) => (b.type === type ? Math.max(m, b.level || 0) : m), 0);

// ───────── État ─────────
export function realm(state) {
  const r = (state.realm21 ||= {});
  r.wounded ||= []; r.veterans ||= {}; r.relics ||= [];
  r.castellanMem ||= {};
  r.brigands ||= { anger: 0, clears: {}, warned: false, angerAt: 0 };
  r.garrison ??= null;
  r.deco ||= {};
  r.stats ||= { healed: 0, abandoned: 0, leagueBroken: 0, alliesHonored: 0, relicsPlaced: 0 };
  return r;
}
// Migration (sauvegardes v20) : structures vides ; les décorations posées sont « entretenues » au chargement ; les camps
// existants partent du niveau 1 (posé au premier passage du temps, les sites du monde ne sont pas touchés ici)
export function ensureRealm21(state, now = Date.now()) {
  const r = realm(state);
  for (const b of blds(state)) if (b.type === 'deco' && !TROPHIES[b.deco] && !r.deco[b.id]) r.deco[b.id] = { care: now };
  return r;
}

// ───────── B1 : hospice et blessés ─────────
export const hospiceLevel = (state) => levelOfType(state, 'hospice');
export function hospiceBeds(state) {
  const lv = hospiceLevel(state);
  if (lv <= 0) return 0;
  const bonus = relicsIn(state, 'hospice').reduce((a, x) => a + (BUILDING_RELICS[x.key].beds || 0), 0);
  return Math.round((HOSPICE.bedsBase + HOSPICE.bedsPerLevel * lv) * (1 + bonus));
}
export const woundedCount = (state) => realm(state).wounded.reduce((a, g) => a + sum(g.units), 0);
// Une part des pertes devient des blessés (dans la limite des lits libres) ; renvoie le nombre recueilli
export function addWounded(state, losses, side, now = Date.now(), src = '') {
  if (globalThis.__noV21) return 0; // outil de simulation : comparaison avec et sans les blessés
  const free = hospiceBeds(state) - woundedCount(state);
  const lost = sum(losses);
  if (free <= 0 || lost <= 0) return 0;
  const want = Math.min(free, Math.floor(lost * (side === 'def' ? HOSPICE.defShare : HOSPICE.attShare)));
  if (want <= 0) return 0;
  const units = {};
  let got = 0;
  const list = Object.entries(losses).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);
  for (const [u, n] of list) { const k = Math.min(n, Math.round((want * n) / lost)); if (k > 0) { units[u] = k; got += k; } }
  if (!got) return 0;
  realm(state).wounded.push({ id: uid('wd'), units, at: now, src, healing: false, done: 0 });
  return got;
}
export const potionsFor = (n) => Math.ceil(n / HOSPICE.potionPer);
// Soigner un groupe (ou tous) : une potion pour 10 blessés ; ils reviennent 12 h plus tard
export function healWounded(state, id = null, now = Date.now()) {
  const R = realm(state);
  const inv = (state.inventory.consumables ||= {});
  const groups = R.wounded.filter((g) => !g.healing && (!id || g.id === id));
  if (!groups.length) return { ok: false, reason: 'Aucun blessé en attente de soins' };
  let healed = 0, used = 0;
  for (const g of groups) {
    const need = potionsFor(sum(g.units));
    if ((inv.healPotion || 0) < need) continue;
    inv.healPotion -= need; used += need;
    g.healing = true; g.done = now + HOSPICE.healH * H; g.early = now - g.at <= HOSPICE.earlyH * H;
    healed += sum(g.units);
  }
  if (!healed) return { ok: false, reason: `Pas assez de potions de soin (une pour ${HOSPICE.potionPer} blessés)` };
  return { ok: true, healed, potions: used };
}
export function hospiceTick(state, now = Date.now()) {
  const R = realm(state);
  const keep = [];
  for (const g of R.wounded) {
    if (g.healing && g.done <= now) {
      for (const [u, n] of Object.entries(g.units)) state.army[u] = (state.army[u] || 0) + n;
      R.stats.healed += sum(g.units);
      if (g.early) {
        // Soignés vite : une part revient aguerrie (vétérans, au plus 10 % de l'effectif de chaque unité)
        for (const [u, n] of Object.entries(g.units)) {
          const cap = Math.floor((state.army[u] || 0) * HOSPICE.vetCap);
          R.veterans[u] = Math.min(cap, (R.veterans[u] || 0) + Math.floor(n * HOSPICE.vetShare));
        }
      }
      log(state, 'good', `⛑️ ${sum(g.units)} blessés soignés rejoignent la garnison${g.early ? ' (certains reviennent vétérans)' : ''}.`, now);
      continue;
    }
    if (!g.healing && now - g.at > HOSPICE.waitH * H) {
      const n = sum(g.units);
      R.stats.abandoned += n;
      const v = -Math.min(HOSPICE.favorMax, Math.max(1, Math.round(n / HOSPICE.favorPer)));
      shiftFavor(state, 'peasants', v, `${n} blessés renvoyés sans soins`, now);
      log(state, 'bad', `⛑️ ${n} blessés n’ont pas été soignés à temps : ils rentrent au village (Assemblée des villages ${v}).`, now);
      continue;
    }
    keep.push(g);
  }
  R.wounded = keep;
  // les vétérans ne survivent pas à la disparition de leur unité
  for (const u of Object.keys(R.veterans)) R.veterans[u] = Math.min(R.veterans[u], Math.floor((state.army[u] || 0) * HOSPICE.vetCap));
}
// Vétérans : +5 % d'attaque pour leur type d'unité, au prorata (plein effet à 10 % de l'effectif)
export function veteranMods(state) {
  const m = {};
  for (const [u, v] of Object.entries(realm(state).veterans)) {
    const n = state.army?.[u] || 0;
    if (v > 0 && n > 0) m[`unit.${u}.atk`] = Math.round(HOSPICE.vetAtk * Math.min(1, v / Math.max(1, n * HOSPICE.vetCap)) * 1000) / 1000;
  }
  return m;
}

// ───────── B2 : reliques de bâtiment ─────────
export const relicSlots = (level) => RELIC_SLOTS.reduce((n, [lv, k]) => (level >= lv ? k : n), 0);
const placedIn = (state, bid, now = Date.now()) => realm(state).relics.filter((x) => x.bid === bid && !(x.movingUntil > now));
const relicsIn = (state, type, now = Date.now()) => blds(state).filter((b) => b.type === type).flatMap((b) => placedIn(state, b.id, now));
export const relicsOf = (state, bid) => realm(state).relics.filter((x) => x.bid === bid);
export const freeRelics = (state) => realm(state).relics.filter((x) => !x.bid);
// Nouvelle relique (sources existantes) ; clé tirée au sort si absente (déterministe par le nombre déjà reçu)
export function grantRelic(state, key = null, src = 'archaeo', now = Date.now()) {
  const R = realm(state);
  const keys = Object.keys(BUILDING_RELICS);
  const k = BUILDING_RELICS[key] ? key : keys[(R.relics.length * 7 + (state.meta?.seed || 1)) % keys.length];
  const r = { id: uid('rl'), key: k, bid: null, src, at: now };
  R.relics.push(r);
  log(state, 'good', `${BUILDING_RELICS[k].icon} Relique de bâtiment obtenue : ${BUILDING_RELICS[k].name} (${RELIC_SOURCES[src] || src}). ${BUILDING_RELICS[k].desc}`, now);
  return r;
}
// 3 fragments de relique (Brèche, éclats) → une relique de bâtiment
export function relicFromFragments(state, now = Date.now()) {
  const sh = state.shards;
  if (!sh || (sh.relicFragments || 0) < 3) return { ok: false, reason: '3 fragments de relique requis' };
  sh.relicFragments -= 3;
  return { ok: true, relic: grantRelic(state, null, 'fragments', now) };
}
// Poser (ou déplacer) une relique : 6 h de transport si elle quitte un bâtiment ; aucun coût
export function placeRelic(state, relicId, bid, now = Date.now()) {
  const R = realm(state);
  const r = R.relics.find((x) => x.id === relicId);
  if (!r) return { ok: false, reason: 'Relique introuvable' };
  if (bid === null) { r.bid = null; r.movingUntil = 0; return { ok: true }; }
  const b = state.city.buildings[bid];
  if (!b) return { ok: false, reason: 'Bâtiment introuvable' };
  const def = BUILDING_RELICS[r.key];
  if (!def.fits.includes(b.type)) return { ok: false, reason: `${def.name} ne convient pas à ce bâtiment (${def.fits.map((t) => BUILDINGS[t]?.name || t).join(', ')})` };
  const used = relicsOf(state, bid).filter((x) => x.id !== r.id).length;
  if (used >= relicSlots(b.level)) return { ok: false, reason: `Aucun emplacement libre (niveau ${b.level} : ${relicSlots(b.level)} emplacement${relicSlots(b.level) > 1 ? 's' : ''} ; 1 au niveau 5, 2 au 15, 3 au 25)` };
  const moving = !!r.bid && r.bid !== bid;
  r.bid = bid; r.movingUntil = moving ? now + RELIC_MOVE_H * H : 0;
  if (!moving) R.stats.relicsPlaced++;
  return { ok: true, moving };
}
// Bonus de production d'un bâtiment : ses reliques, puis le rayonnement des reliques voisines (8 cases, moitié de l'effet)
export function relicProdBonus(state, b, now = Date.now()) {
  if (!state.realm21?.relics?.length) return 0;
  let own = 0, rad = 0;
  for (const r of placedIn(state, b.id, now)) own += BUILDING_RELICS[r.key].prod || 0;
  for (const r of state.realm21.relics) {
    if (!r.bid || r.bid === b.id || r.movingUntil > now || !BUILDING_RELICS[r.key].radiate) continue;
    const o = state.city.buildings[r.bid];
    if (o && Math.max(Math.abs(o.x - b.x), Math.abs(o.y - b.y)) <= 1 && BUILDINGS[b.type]?.prod) rad += (BUILDING_RELICS[r.key].prod || 0) * RELIC_RADIATE;
  }
  return Math.min(RELIC_CAP.prod, own) + Math.min(RELIC_CAP.radiate, rad);
}
export function relicMods(state, now = Date.now()) {
  const m = {};
  for (const r of realm(state).relics) {
    if (!r.bid || r.movingUntil > now || !state.city.buildings[r.bid]) continue;
    for (const [k, v] of Object.entries(BUILDING_RELICS[r.key].mods || {})) m[k] = (m[k] || 0) + v;
  }
  return m;
}

// ───────── B3 : châtelain ─────────
export const castellanOf = (state) => (state.heroes || []).find((h) => h.assignment?.type === 'castellan') || null;
export function assignCastellan(state, heroId, post = 'gate') {
  const h = (state.heroes || []).find((x) => x.id === heroId);
  if (!h) return { ok: false, reason: 'Héros introuvable' };
  if (heroId && !CASTELLAN.posts[post]) return { ok: false, reason: 'Poste inconnu' };
  if (h.marchId) return { ok: false, reason: `${h.name} est en marche` };
  if (h.assignment && h.assignment.type !== 'castellan') return { ok: false, reason: `${h.name} est intendant : retirez-le d’abord` };
  const cur = castellanOf(state);
  if (cur && cur !== h) cur.assignment = null;
  h.assignment = { type: 'castellan', post };
  return { ok: true };
}
export function dismissCastellan(state) { const c = castellanOf(state); if (c) c.assignment = null; return { ok: !!c }; }
// Effets en défense : protection du poste (×), défense de la garnison (+)
export function castellanDefense(state) {
  const h = castellanOf(state);
  if (!h) return null;
  const post = h.assignment.post;
  const def = Math.min(CASTELLAN.defCap, CASTELLAN.def + CASTELLAN.perLevel * (h.level || 1) + (CASTELLAN.classDef[h.cls] || 0));
  return { hero: h, post, prot: CASTELLAN.posts[post].prot, protMult: 1 + CASTELLAN.postBonus[post], def: Math.round(def * 1000) / 1000, text: `${h.name} (${HERO_CLASSES[h.cls]?.name || 'héros'}, niv. ${h.level}) commande ${CASTELLAN.posts[post].name.toLowerCase()} : ${CASTELLAN.posts[post].text}, défense de la garnison +${Math.round(def * 100)} %` };
}
// Mémoire d'un seigneur : poste et classe du châtelain vus à chaque raid
export function learnCastellan(state, rival) {
  const c = castellanDefense(state);
  const R = realm(state);
  const m = R.castellanMem[rival] || { post: null, cls: null, streak: 0 };
  if (!c) { R.castellanMem[rival] = { post: null, cls: null, streak: 0 }; return; }
  m.streak = m.post === c.post ? m.streak + 1 : 1;
  m.post = c.post; m.cls = c.hero.cls;
  R.castellanMem[rival] = m;
}
// Adaptation : vu 2 fois de suite au même poste → il attaque ailleurs et apporte le contre-engin
export function castellanAdapt(state, rival) {
  const m = state.realm21?.castellanMem?.[rival];
  if (!m || m.streak < CASTELLAN.learnAfter || !m.post) return null;
  if (m.post === 'gate') return { avoid: 'front', main: 'left', engines: { ladders: 2, mantlets: 2 }, text: `votre châtelain les a reçus deux fois à la porte : ils escaladent le flanc gauche, sous des mantelets` };
  if (m.post === 'wall') return { avoid: 'flanks', main: 'front', engines: { ram: 2, mantlets: 1 }, text: `votre châtelain tenait les remparts deux fois de suite : ils frappent la porte avec plus de béliers` };
  return { avoid: 'moat', main: null, engines: { fascines: 3 }, text: `votre châtelain gardait les douves : ils apportent des fascines en plus` };
}

// ───────── B4 : camps de brigands à niveaux, ligue, insécurité ─────────
export const campLevel = (poi) => Math.max(1, Math.min(BRIGANDS.maxLevel, poi?.lvl || 1));
export const campScale = (poi) => 1 + BRIGANDS.perLevel * (campLevel(poi) - 1);
export const scaleEnemies = (en, k) => Object.fromEntries(Object.entries(en || {}).map(([u, n]) => [u, Math.max(1, Math.round(n * k))]));
const camps = (state) => Object.values(state.world?.pois || {}).filter((p) => p.type === 'banditCamp');
export function brigandTick(state, now = Date.now()) {
  const B = realm(state).brigands;
  for (const p of camps(state)) {
    if (!Number.isFinite(p.lvl)) { p.lvl = 1; p.lvlAt = now; }
    if (p.clearedUntil > now) { p.lvlAt = now; continue; }
    if (p.lvl < BRIGANDS.maxLevel && now - (p.lvlAt || now) >= BRIGANDS.growH * H) {
      const before = campScale(p);
      p.lvl++; p.lvlAt = now;
      if (p.enemies && Object.keys(p.enemies).length) p.enemies = scaleEnemies(p.enemies, campScale(p) / before);
    }
  }
  // la colère retombe d'un point par jour
  if (B.anger > 0 && now - (B.angerAt || now) >= 24 * H) { B.anger = Math.max(0, B.anger - BRIGANDS.anger.decayPerDay); B.angerAt = now; if (B.anger < BRIGANDS.anger.warn) B.warned = false; }
}
// Un camp nettoyé : la ligue s'irrite (davantage si on revient sur le même camp en moins de 48 h)
export function onCampCleared(state, poi, now = Date.now()) {
  const B = realm(state).brigands;
  const k = `${poi.x},${poi.y}`;
  const again = B.clears[k] && now - B.clears[k] < BRIGANDS.anger.sameCampH * H;
  B.clears[k] = now;
  B.anger += again ? BRIGANDS.anger.sameCamp : BRIGANDS.anger.perClear;
  B.angerAt = now;
  poi.lvl = Math.max(1, campLevel(poi) - 3); poi.lvlAt = now;
  for (const [kk, t] of Object.entries(B.clears)) if (now - t > 7 * 24 * H) delete B.clears[kk];
  if (B.anger >= BRIGANDS.anger.warn && !B.warned) {
    B.warned = true;
    feat('🗡️', 'Présage : la ligue s’agite', 'Les camps de brigands se parlent. Encore quelques camps nettoyés et ils riposteront ensemble.', 'bad');
    log(state, 'bad', '🗡️ Présage : la ligue des brigands s’agite (colère ' + B.anger + '/' + BRIGANDS.anger.strike + ').', now);
  }
  return { anger: B.anger, again };
}
// Riposte de la ligue : un raid unique contre le château, à la place d'un raid de rival (même machinerie que la v19)
export function leagueStrike(state, now = Date.now(), th = 1) {
  const B = realm(state).brigands;
  if (B.anger < BRIGANDS.anger.strike || (state.raids || []).length) return null;
  const k = 1 + BRIGANDS.perTh * th;
  const army = scaleEnemies(BRIGANDS.leagueArmy, k);
  const from = camps(state).sort((a, b) => campLevel(b) - campLevel(a))[0] || state.world.capital;
  const raid = { id: uid('raid'), rival: 'league', league: true, name: 'Ligue des brigands', from: { x: from.x, y: from.y }, army, start: now, arrive: now + 45 * 60000, seen: true, flank: 'front', flankSeen: true, mainFlank: 'front', engines: {}, style: 'gate', styleText: 'par la porte' };
  state.raids.push(raid);
  B.anger = 0; B.warned = false;
  feat('🗡️', 'La ligue des brigands riposte', `Les camps marchent ensemble sur le château : arrivée dans 45 min.`, 'bad');
  log(state, 'bad', '🗡️ La ligue des brigands riposte : leurs bandes réunies marchent sur le château (45 min).', now);
  toast('🗡️ La ligue des brigands riposte !', 'bad');
  return raid;
}
// Issue d'un raid de la ligue
export function leagueOutcome(state, win, now = Date.now()) {
  const R = realm(state);
  if (win) {
    R.stats.leagueBroken++;
    if (R.stats.leagueBroken === 1 || R.stats.leagueBroken % 3 === 0) grantRelic(state, null, 'league', now);
    log(state, 'good', '🗡️ La ligue des brigands est brisée : ses chefs se dispersent.', now);
  } else R.brigands.anger = 3;
}
// Insécurité des routes : camps forts (niv. 5+) laissés tranquilles 3 jours → danger +1 chacun (≤ 3)
export function insecurity(state, now = Date.now()) {
  const B = state.realm21?.brigands;
  let n = 0;
  for (const p of camps(state)) {
    if (campLevel(p) < BRIGANDS.insecurityLevel || p.clearedUntil > now) continue;
    const last = B?.clears?.[`${p.x},${p.y}`] || 0;
    if (now - last >= BRIGANDS.insecurityDays * 24 * H && now - (p.lvlAt || now) >= 0) n++;
  }
  return Math.min(BRIGANDS.insecurityMax, n);
}

// ───────── B5 : garnison alliée ─────────
export function garrisonOffer(state, raid) {
  if (raid.league) return null;
  const f = (state.factions || []).filter((x) => x.stance !== 'war' && x.stance !== 'alliance' && x.relation >= ALLY_GARRISON.minRelation && x.idx !== raid.rival).sort((a, b) => b.relation - a.relation)[0];
  if (!f) return null;
  const n = Math.round(ALLY_GARRISON.base + ALLY_GARRISON.perRelation * f.relation);
  return { faction: f.idx, name: RIVALS[f.idx]?.name || 'Allié', units: { guard: n, royalArcher: Math.round(n * 0.6) } };
}
export function offerGarrison(state, raid, now = Date.now()) {
  const o = garrisonOffer(state, raid);
  if (!o || state.pending.some((p) => p.kind === 'ally')) return null;
  const p = { id: uid('pd'), kind: 'ally', raidId: raid.id, faction: o.faction, units: o.units, deadline: raid.arrive - 60000, t: now };
  state.pending.push(p);
  return p;
}
export function describeAlly(state, p) {
  const n = sum(p.units), name = RIVALS[p.faction]?.name || 'Un allié';
  return {
    icon: '🤝', title: `${name} propose une garnison`,
    text: `${n} soldats (gardes et archers) viendraient tenir vos murs contre le raid. Leurs exigences : ${ALLY_GARRISON.breadPerH} pains par heure tant qu’ils sont là, et aucune attaque lancée depuis le château. Les honorer : relation +${ALLY_GARRISON.honor} ; les décevoir : ${ALLY_GARRISON.betray}.`,
    choices: [{ label: 'Accepter la garnison', hint: `+${n} défenseurs, ${ALLY_GARRISON.breadPerH} 🍞/h, pas de sortie` }, { label: 'Refuser poliment', hint: 'Vous restez libre ; aucune relation perdue' }],
    deadline: p.deadline, def: 1,
  };
}
export function resolveAlly(state, pid, idx, now = Date.now()) {
  const i = state.pending.findIndex((x) => x.id === pid);
  if (i < 0) return { ok: false, reason: 'Décision introuvable' };
  const p = state.pending[i];
  state.pending.splice(i, 1);
  if (idx !== 0) return { ok: true, text: 'Vous remerciez l’envoyé et gardez vos murs pour vous.' };
  const raid = (state.raids || []).find((r) => r.id === p.raidId);
  if (!raid) return { ok: true, text: 'Le raid est déjà passé : la garnison repart.' };
  realm(state).garrison = { faction: p.faction, units: p.units, raidId: raid.id, since: now, until: raid.arrive + ALLY_GARRISON.stayH * H, fedAt: now, broken: null };
  log(state, 'good', `🤝 ${RIVALS[p.faction]?.name || 'Votre allié'} envoie ${sum(p.units)} soldats tenir vos murs.`, now);
  return { ok: true, text: 'La garnison alliée prend position sur les remparts.' };
}
export const garrisonUnits = (state, raid) => { const g = state.realm21?.garrison; return g && g.raidId === raid.id && !g.broken ? g.units : null; };
// Exigence « ne pas sortir » : une attaque lancée pendant leur présence les déçoit
export function onAttackLaunched(state, now = Date.now()) {
  const g = state.realm21?.garrison;
  if (!g || g.broken) return;
  g.broken = 'sortie';
  changeRelation(state, g.faction, ALLY_GARRISON.betray);
  log(state, 'bad', `🤝 Vous avez lancé une attaque malgré la garnison alliée : ${RIVALS[g.faction]?.name || 'l’allié'} rappelle ses soldats (relation ${ALLY_GARRISON.betray}).`, now);
}
export function garrisonTick(state, now = Date.now()) {
  const R = realm(state), g = R.garrison;
  // une offre sans réponse avant l'arrivée du raid vaut refus
  if (state.pending?.some((p) => p.kind === 'ally' && p.deadline <= now)) state.pending = state.pending.filter((p) => !(p.kind === 'ally' && p.deadline <= now));
  if (!g) return;
  // rations : un pain manqué les déçoit
  const h = (now - g.fedAt) / H;
  if (h >= 1 && !g.broken) {
    const need = Math.floor(h) * ALLY_GARRISON.breadPerH;
    if ((state.resources.bread || 0) >= need) { state.resources.bread -= need; g.fedAt += Math.floor(h) * H; }
    else { g.broken = 'faim'; changeRelation(state, g.faction, ALLY_GARRISON.betray); log(state, 'bad', `🤝 La garnison alliée manque de pain : elle repart, déçue (relation ${ALLY_GARRISON.betray}).`, now); }
  }
  if (now >= g.until || g.broken) {
    if (!g.broken) { changeRelation(state, g.faction, ALLY_GARRISON.honor); R.stats.alliesHonored++; log(state, 'good', `🤝 La garnison de ${RIVALS[g.faction]?.name || 'votre allié'} repart, bien traitée (relation +${ALLY_GARRISON.honor}).`, now); }
    R.garrison = null;
  }
}

// ───────── B6 : auras et usure des décorations ─────────
const auraKind = (b) => {
  const icon = COSMETICS[b.deco]?.icon;
  for (const [k, a] of Object.entries(DECO_AURA)) if (k !== 'any' && (a.keys.includes(b.deco) || a.icons.includes(icon))) return k;
  return 'any';
};
export const decoWorn = (state, b, now = Date.now()) => !TROPHIES[b.deco] && now - (state.realm21?.deco?.[b.id]?.care ?? now) > DECO_WEAR.h * H;
export function decoAuras(state, now = Date.now()) {
  const mods = {}, list = [];
  let order = 0;
  for (const b of blds(state)) {
    if (b.type !== 'deco') continue;
    const k = auraKind(b), a = DECO_AURA[k];
    const near = blds(state).some((o) => o !== b && o.level > 0 && a.near.includes(o.type) && Math.max(Math.abs(o.x - b.x), Math.abs(o.y - b.y)) <= 1);
    const worn = decoWorn(state, b, now), f = worn ? DECO_WEAR.k : 1;
    if (near) {
      for (const [m, v] of Object.entries(a.mods || {})) mods[m] = Math.min(DECO_AURA_CAP[m] ?? Infinity, (mods[m] || 0) + v * f);
      order = Math.min(DECO_AURA_CAP.order, order + (a.order || 0) * f);
    }
    list.push({ id: b.id, kind: k, near, worn, text: near ? `${a.text}${worn ? ' (usée : ×0,75, à entretenir)' : ''}` : `aucune aura : ${a.text.split(' : ')[0]}` });
  }
  for (const k of Object.keys(mods)) mods[k] = Math.round(mods[k] * 1000) / 1000;
  return { mods, order: Math.round(order * 10) / 10, list };
}
// Entretien : petit coût en pierre et bois, remet l'aura à neuf pour une saison
export function careDeco(state, id = null, now = Date.now()) {
  const R = realm(state);
  const list = blds(state).filter((b) => b.type === 'deco' && !TROPHIES[b.deco] && (!id || b.id === id) && (id || decoWorn(state, b, now)));
  if (!list.length) return { ok: false, reason: 'Aucune décoration à entretenir' };
  const cost = Object.fromEntries(Object.entries(DECO_WEAR.cost).map(([r, v]) => [r, v * list.length]));
  for (const [r, v] of Object.entries(cost)) if ((state.resources[r] || 0) < v) return { ok: false, reason: `Il faut ${fmt(v)} ${r === 'stone' ? 'pierre' : 'bois'}` };
  for (const [r, v] of Object.entries(cost)) state.resources[r] -= v;
  for (const b of list) R.deco[b.id] = { care: now };
  return { ok: true, n: list.length, cost };
}

// ───────── Ensemble ─────────
export function realmTick(state, now = Date.now()) {
  if (!state.city) return;
  realm(state);
  hospiceTick(state, now);
  brigandTick(state, now);
  garrisonTick(state, now);
  // nouvelles décorations : entretenues à la pose
  for (const b of blds(state)) if (b.type === 'deco' && !TROPHIES[b.deco] && !state.realm21.deco[b.id]) state.realm21.deco[b.id] = { care: now };
}
export function realmMods(state, now = Date.now()) {
  if (!state.realm21) return {};
  const m = {};
  const add = (o) => { for (const [k, v] of Object.entries(o)) m[k] = (m[k] || 0) + v; };
  add(veteranMods(state));
  add(relicMods(state, now));
  add(decoAuras(state, now).mods);
  return m;
}
// « Pourquoi ? » : chaque élément nouveau, en phrases
export function realmWhy(state, now = Date.now()) {
  const R = realm(state), out = [];
  const beds = hospiceBeds(state), w = woundedCount(state);
  out.push({ k: 'hospice', title: 'Hospice et blessés', lines: beds ? [`${beds} lits (40 + 25 par niveau${relicsIn(state, 'hospice').length ? ', relique +25 %' : ''}) ; ${w} blessés en ce moment.`, `En défense, 15 % des pertes survivent blessées ; en campagne, 8 %. Une potion de soin pour ${HOSPICE.potionPer} blessés, 12 h de soins.`, `Soignés dans les 6 h : 35 % reviennent vétérans (au plus 10 % de l’effectif, +5 % d’attaque). Sans soins sous 24 h, ils rentrent au village (faveur de l’Assemblée en baisse).`] : ['Pas d’hospice : les soldats tombés sont perdus. Bâtissez l’Hospice (HdV 5) pour recueillir des blessés.'] });
  const vet = Object.entries(R.veterans).filter(([, n]) => n > 0);
  if (vet.length) out.push({ k: 'veterans', title: 'Vétérans', lines: vet.map(([u, n]) => `${n} vétérans (${UNITS[u]?.name || u}) : attaque de l’unité +${Math.round((veteranMods(state)[`unit.${u}.atk`] || 0) * 1000) / 10} %`) });
  const placed = R.relics.filter((x) => x.bid);
  out.push({ k: 'relics', title: 'Reliques de bâtiment', lines: R.relics.length ? R.relics.map((x) => { const d = BUILDING_RELICS[x.key], b = x.bid && state.city.buildings[x.bid]; return `${d.icon} ${d.name} : ${b ? `${BUILDINGS[b.type]?.name} (${b.x}, ${b.y})${x.movingUntil > now ? ' — en transport' : ''}` : 'au trésor, à poser'} — ${d.desc}`; }) : ['Aucune relique. Elles viennent des fouilles, de 3 fragments de relique et de la ligue brisée.'], note: placed.length ? 'Les reliques qui rayonnent donnent la moitié de leur effet aux bâtiments voisins (8 cases).' : null });
  const c = castellanDefense(state);
  out.push({ k: 'castellan', title: 'Châtelain', lines: [c ? c.text : 'Aucun châtelain : choisissez un héros libre et un poste (porte, remparts, douves).', 'Un seigneur qui voit le châtelain deux raids de suite au même poste attaque ailleurs et apporte le contre-engin.'] });
  const B = R.brigands;
  out.push({ k: 'league', title: 'Ligue des brigands', lines: [`Colère : ${B.anger}/${BRIGANDS.anger.strike} (+1 par camp nettoyé, +2 si c’est le même en moins de 48 h ; −1 par jour). À ${BRIGANDS.anger.warn}, un présage ; à ${BRIGANDS.anger.strike}, riposte commune.`, `Insécurité des routes : +${insecurity(state, now)} de danger (camps de niveau 5+ laissés tranquilles 3 jours).`] });
  const g = R.garrison;
  out.push({ k: 'allies', title: 'Garnison alliée', lines: [g ? `${sum(g.units)} soldats de ${RIVALS[g.faction]?.name} sur vos murs${g.broken ? ' (déçus, ils repartent)' : ''} ; ${ALLY_GARRISON.breadPerH} pains par heure, aucune sortie.` : `À l’annonce d’un raid, un voisin en bons termes (relation ${ALLY_GARRISON.minRelation}+) peut proposer une garnison.`] });
  const au = decoAuras(state, now);
  out.push({ k: 'deco', title: 'Auras des décorations', lines: au.list.length ? au.list.map((x) => `${COSMETICS[state.city.buildings[x.id]?.deco]?.name || 'Décoration'} : ${x.text}`) : ['Aucune décoration posée.'], note: `Une décoration non entretenue depuis ${DECO_WEAR.h} h (deux jours, soit seize saisons du calendrier) perd un quart de son aura ; les trophées ne s’usent pas.` });
  return out;
}
void POI_TYPES;
