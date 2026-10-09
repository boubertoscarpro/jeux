// Tutoriel contextuel : chaque conseil s'affiche une seule fois, au moment où la mécanique devient utile.
// Les quêtes du royaume guident les premiers pas ; ces conseils expliquent les systèmes plus avancés.
import { levelOf } from '../systems/city.js';
import { esc } from './components.js';
import { CHAPTERS, KINGDOM_HINTS } from '../data/campaign.js';

export const TIPS = [
  { id: 'famine', when: (s) => s.famine, title: '🍖 Votre peuple a faim', view: 'ecoReport',
    text: 'L’armée et les ouvriers consomment de la nourriture chaque heure. En famine, le moral chute et la formation d’unités s’arrête. L’onglet <b>Production → Bilan</b> montre exactement qui produit et qui consomme.' },
  { id: 'raid', when: (s) => s.raids.length > 0, title: '🚨 Un raid approche', view: 'army',
    text: 'Les troupes restées en ville défendent avec le bonus de la muraille. Rappelez vos marches si besoin, renforcez la muraille (Royaume → fortifications) et gardez des lanciers contre la cavalerie.' },
  { id: 'workers', when: (s) => (s.automation?.level || 0) >= 1, title: '👷 Vos premiers ouvriers', view: 'workers',
    text: 'Les ouvriers donnent un bonus aux secteurs où vous les affectez et partent en expédition. Plus tard, les <b>Ordres du royaume</b> (SI… ALORS…) automatiseront les tâches répétitives.' },
  { id: 'market', when: (s) => levelOf(s, 'market') > 0, title: '⚖️ Le marché et les contrats', view: 'convoys',
    text: 'Vendez vos surplus, envoyez des caravanes vers les cités et remplissez leurs contrats. Les cités exigent des marchandises <b>produites par votre royaume</b> : revendre ce qu’on vient d’acheter ne rapporte pas de prime.' },
  { id: 'event', when: (s) => !!s.live?.current, title: '🎪 Un événement a commencé', view: 'event',
    text: 'Pendant 3 jours, une carte dédiée, une monnaie propre, une boutique, des missions du jour et un boss à plusieurs phases. Rien n’est obligatoire, mais la monnaie restante est convertie à faible taux à la fin : dépensez-la.' },
  { id: 'territory', when: (s) => Object.keys(s.territories || {}).length > 0, title: '🚩 Votre premier avant-poste', view: 'territories',
    text: 'Un territoire doit être <b>spécialisé</b>, protégé par une <b>garnison</b> (8 soldats par niveau) et <b>entretenu</b> (or et nourriture). Sans garnison suffisante, il produit 70 % de moins et attire les pillards.' },
  { id: 'saga', when: (s) => s.pending.some((p) => p.kind === 'saga'), title: '📖 Une saga commence', view: 'goals',
    text: 'Les sagas sont des histoires en plusieurs étapes. Vos choix modifient la suite, vos relations avec les factions et votre réputation. Sans réponse, un choix par défaut s’applique à l’échéance.' },
  { id: 'shards', when: (s) => (s.shards?.count || 0) > 0 || (s.shards?.tickets || 0) > 0, title: '💠 Un Éclat Ancien !', view: 'wheel',
    text: 'Monnaie rare, jamais vendue contre de l’argent réel. 10 Éclats = 1 ticket pour la Roue des Anciens, dont les probabilités et les garanties sont affichées. Vous pouvez aussi viser une récompense garantie (100 Éclats).' },
  { id: 'dynasty', when: (s) => levelOf(s, 'townhall') >= 13, title: '👑 La dynastie approche', view: 'talents',
    text: 'À l’Hôtel de ville 15, vous pourrez fonder une nouvelle dynastie : recommencer avec des points d’héritage. La liste exacte de ce qui est conservé et réinitialisé s’affiche avant toute confirmation.' },
];

// Fiches de chapitre : une par chapitre du parcours guidé, adaptée à la spécialisation du royaume
export function chapterTip(state, n) {
  const ch = CHAPTERS[n - 1];
  if (!ch) return null;
  const first = ch.missions.find((m) => !m.optional);
  const hint = KINGDOM_HINTS[state.kingdom?.type]?.[n];
  return { id: 'chapter' + n, title: `${ch.icon} Chapitre ${n} — ${ch.title}`, view: first?.view || 'goals',
    text: `<span class="story">${esc(ch.intro)}</span><br><br>💡 ${esc(ch.tip)}${hint ? `<br><br>${esc(hint)}` : ''}<br><br>Première mission : <b>${esc(first?.title || '')}</b> — ${esc(first?.desc || '')}` };
}

export function nextTip(state) {
  if (state.meta.tipsOff) return null;
  const seen = (state.meta.tipsSeen ||= {});
  const n = state.campaign?.chapter || 1;
  if (!seen['chapter' + n] && !state.campaign?.legacy) return chapterTip(state, n);
  return TIPS.find((t) => !seen[t.id] && t.when(state)) || null;
}

// Fiches déjà vues (Journal → Tutoriel), pour les relire à tout moment
export function seenTips(state) {
  const seen = state.meta.tipsSeen || {};
  const out = [];
  for (let n = 1; n <= (state.campaign?.chapter || 1); n++) out.push(chapterTip(state, n));
  for (const t of TIPS) if (seen[t.id]) out.push(t);
  return out;
}

export function openTip(app, tip, first = false) {
  app.modal(`<h2>${esc(tip.title)}</h2><p>${tip.text}</p>
    <div class="row gap wrap">${tip.view ? `<button class="btn primary" data-action="tip-go" data-view="${tip.view}">Me montrer</button>` : ''}<button class="btn" data-action="close-modal">Compris</button>${first ? '<button class="btn ghost small" data-action="tips-off">Ne plus afficher les fiches</button>' : ''}</div>
    ${first ? '<p class="muted small">Cette fiche reste consultable dans Chronique → Journal → Tutoriel.</p>' : ''}`, {
    'tips-off': (a) => { a.state.meta.tipsOff = true; a.closeModal(); a.toast('Fiches désactivées (réactivables dans Objectifs ou Saison & boutique)', 'info'); },
    // Met en évidence le bouton de menu concerné jusqu'à ce que le joueur l'ouvre
    'tip-go': (a, el) => { a.closeModal(); a.highlight(el.dataset.view); },
  });
}

export function showTip(app) {
  const s = app.state;
  if (!s || document.getElementById('modal-root')?.classList.contains('open')) return;
  const tip = nextTip(s);
  if (!tip) return;
  s.meta.tipsSeen[tip.id] = Date.now();
  openTip(app, tip, true);
}
