import { SEASONS, SEASON_HOURS } from '../data/seasons.js';
import { log } from './log.js';

// Calendrier du royaume (dérivé du temps écoulé depuis la fondation)
export function calendar(state, now = Date.now()) {
  const h = Math.max(0, (now - (state.meta.created || now)) / 3600000);
  const idx = Math.floor(h / SEASON_HOURS);
  return { year: 1 + Math.floor(idx / 4), seasonIdx: idx % 4, season: SEASONS[idx % 4], progress: (h % SEASON_HOURS) / SEASON_HOURS, nextAt: (state.meta.created || now) + (idx + 1) * SEASON_HOURS * 3600000 };
}

export const dateLabel = (state, t) => { const c = calendar(state, t); return `An ${c.year}, ${c.season.name.toLowerCase()}`; };

// Catégories de la chronique : le joueur retrouve les campagnes, traités, décisions du Conseil, projets, découvertes,
// changements de relations et grands succès de la dynastie sans lire chaque fait mineur.
export const CHRONICLE_CATS = {
  war: { name: 'Guerres et campagnes', icon: '⚔️', re: /guerre|campagne|bataille|assaut|siège|raid|conquiert|s’empare|forteresse|vaincu|défaite|victoire/i },
  treaty: { name: 'Traités et diplomatie', icon: '🕊️', re: /traité|pacte|alliance|paix|tribut|trêve|ambassad|accord|serment|main à/i },
  council: { name: 'Conseil et décrets', icon: '🏛️', re: /conseil|motion|décret|priorité royale|politique/i },
  project: { name: 'Grands chantiers', icon: '🏗️', re: /projet|chantier|monument|merveille|route royale|pont/i },
  discovery: { name: 'Découvertes', icon: '🏺', re: /mystère|fouille|découv|relique|artefact|ruine|expédition|carte|atlas|archéolog/i },
  faction: { name: 'Factions', icon: '🏴', re: /rivale|allié de confiance|partenaire|renforce|embargo|représailles|contre-offensive|fortifie|frontière/i },
  dynasty: { name: 'Dynastie et prestige', icon: '👑', re: /dynastie|tradition|héritage|titre|sacre|couronne|ère|souverain/i },
  event: { name: 'Événements', icon: '🎪', re: /événement|foire|invasion|hiver|dragon|volcan|morts/i },
  story: { name: 'Récits', icon: '📜', re: null },
};
export function chronicleCat(text, kind = 'story') {
  if (kind && kind !== 'story' && CHRONICLE_CATS[kind]) return kind;
  for (const [k, c] of Object.entries(CHRONICLE_CATS)) if (c.re && c.re.test(text)) return k;
  return 'story';
}

// Ajoute un fait marquant à l'histoire du royaume.
// key : identifiant unique du fait (ex. « war:won:3:1712 ») — un fait déjà inscrit n'est jamais réinscrit, même
// après rechargement ou nouvelle exécution du même code ; sans clé, un texte identique inscrit dans l'heure qui
// précède est ignoré (évite les doublons quand un même fait est signalé deux fois).
export function chronicle(state, text, now = Date.now(), kind = 'story', key = null) {
  const keys = (state.historyKeys ||= {});
  if (key) { if (keys[key]) return false; keys[key] = now; }
  const hist = (state.history ||= []);
  if (!key && hist.slice(-20).some((h) => h.text === text && now - h.t < 3600000)) return false;
  const c = calendar(state, now);
  hist.push({ t: now, year: c.year, season: c.season.key, text, kind, cat: chronicleCat(text, kind) });
  if (hist.length > 500) hist.splice(0, hist.length - 500);
  log(state, 'story', `📜 ${text}`, now);
  return true;
}
