// Fin de partie : trois axes de progression visibles dès le début — Maîtrise (démontrer sa stratégie), Découverte
// (secrets, artefacts, plans, histoires) et Héritage (ce qui passe aux dynasties suivantes). Chaque critère indique
// sa progression et comment avancer ; rien n'est réclamé ici (les récompenses viennent des systèmes eux-mêmes).
import { CHALLENGES, TIERS } from '../data/challenges.js';
import { MYSTERIES } from '../data/archaeology.js';
import { ARTIFACTS } from '../data/artifacts.js';
import { PLANS } from '../data/recipes.js';
import { LEGENDS } from '../data/legendary.js';
import { MAX_TRADITIONS } from '../data/legacy.js';
import { SAGAS } from './sagas.js';
import { questlineList } from './questlines.js';
import { revealedCount } from './world.js';

const item = (icon, name, cur, max, hint) => ({ icon, name, cur: Math.min(cur, max), max, hint, done: cur >= max });

export function endgameAxes(state) {
  const C = state.challenges || {};
  const tiers = Object.values(C.claimed || {}).reduce((a, t) => a + Object.keys(t).length, 0);
  const wins = (state.war?.history || []).filter((h) => h.won).length;
  let qDone = 0, qTotal = 0;
  try { const ql = questlineList(state); qTotal = ql.length; qDone = ql.filter((l) => l.finished).length; } catch { /* quêtes indisponibles */ }
  const chapters = Math.min(8, (state.campaign?.chapter || 1) - 1 + (state.campaign?.finished ? 1 : 0));
  const mastery = [
    item('📖', 'Parcours guidé achevé', chapters, 8, 'Terminez les 8 chapitres du parcours.'),
    item('🏅', 'Paliers de défis de maîtrise', tiers, Object.keys(CHALLENGES).length * TIERS.length, 'Relevez les défis (onglet Royaume → Défis) ; visez l’or.'),
    item('🎖️', 'Campagnes militaires victorieuses', wins, 5, 'Menez des campagnes jusqu’à leur opération finale.'),
    item('🗺️', 'Quêtes du royaume terminées', qDone, Math.max(1, qTotal), 'Chaque chaîne de quêtes, jusqu’à sa dernière étape.'),
  ];
  const w = state.world;
  const revealPct = w ? Math.round((revealedCount(w) / (w.size * w.size)) * 100) : 0;
  const seen = Object.keys(state.sagas?.done || {}).length;
  const discovery = [
    item('🏺', 'Mystères archéologiques résolus', Object.keys(state.archaeo?.solved || {}).length, Object.keys(MYSTERIES).length, 'Explorez et videz des donjons pour trouver des indices.'),
    item('🐉', 'Expéditions légendaires accomplies', Object.keys(state.legendary?.done || {}).length, Object.keys(LEGENDS).length, 'Chaque indice vient d’un autre système : fouilles, boss, factions, dynastie.'),
    item('💎', 'Artefacts rassemblés', Object.keys(state.artifacts || {}).length, Object.keys(ARTIFACTS).length, 'Donjons, boss, sagas, Roue, expéditions.'),
    item('📐', 'Plans de forge connus', Object.keys(state.recipes?.known || {}).length, Object.keys(PLANS).length, 'Donjons, fouilles, factions, héros, expérimentation.'),
    item('📜', 'Chroniques et sagas vécues', seen, Object.keys(SAGAS).length, 'Elles naissent de la situation du monde : faites-le bouger.'),
    item('🧭', 'Monde exploré (%)', revealPct, 60, 'Éclaireurs, expéditions, explorations.'),
  ];
  const mon = Object.values(state.city?.buildings || {}).find((b) => b.type === 'monument');
  const heritage = [
    item('👑', 'Traditions dynastiques', (state.legacy?.traditions || []).length, MAX_TRADITIONS, 'Choisies aux grandes étapes : HDV 8, premier haut fait, HDV 12.'),
    item('🗿', 'Monument dynastique', mon?.orient ? mon.level : 0, 5, 'Hôtel de ville 7 : placez le monument et choisissez son orientation.'),
    item('🏰', 'Dynasties fondées', state.dynasty?.count || 0, 3, 'Hôtel de ville 15 : fondez une nouvelle dynastie (onglet Talents).'),
    item('🏚️', 'Vestiges ancestraux exploités', (state.legacy?.remnants || []).filter((r) => r.done || r.restored).length, Math.max(1, (state.legacy?.remnants || []).length), 'Retrouvez les forteresses et monuments de vos ancêtres.'),
  ];
  const pct = (list) => Math.round((list.reduce((a, i) => a + i.cur / i.max, 0) / list.length) * 100);
  return {
    mastery: { name: 'Maîtrise', icon: '🏅', desc: 'Démontrer la qualité de votre stratégie.', items: mastery, pct: pct(mastery) },
    discovery: { name: 'Découverte', icon: '🔭', desc: 'Percer les secrets des Terres Brisées.', items: discovery, pct: pct(discovery) },
    heritage: { name: 'Héritage', icon: '👑', desc: 'Laisser une trace aux dynasties suivantes.', items: heritage, pct: pct(heritage) },
  };
}
