// v17 « Clair comme le jour » — Tri des notifications et des rapports (module pur).
// Un badge doit presque toujours signaler quelque chose d'utile :
//  - urgent (chiffre rouge « ! ») : défaite, ville pillée, avant-poste pillé, raid, crise, famine, révolte ;
//  - utile (chiffre doré) : ce qui demande une décision ou rapporte quelque chose à réclamer ;
//  - informatif (simple point, jamais un chiffre) : victoires, explorations, arrivées, annonces d'événements.
// Les messages semblables sont regroupés (« 12 récoltes terminées » au lieu de 12 lignes). Le badge est plafonné à « 9+ ».
// Ce qui a été vu à l'écran (fenêtre ouverte, message affiché pendant que le joueur est là) est marqué comme lu.

const URGENT_RE = /pillé|pillent|pillage|défaite|brèche|révolte|famine|en feu|incendie|\bcrise\b|\braid\b/i;
const ACTION_RE = /réclam|décision|choisi|à vous de|répond|propos|offre|disponible|prêt/i;

// Classe d'une notification : 'urgent' | 'action' | 'info'
export function noticeClass(n) {
  if (n.kind === 'bad' || URGENT_RE.test(n.text || '')) return 'urgent';
  if (ACTION_RE.test(n.text || '')) return 'action';
  return 'info';
}
// Classe d'un rapport : les défaites et défenses perdues sont urgentes ; les autres sont informatifs
export function reportClass(r) {
  if (r.kind === 'defense') return r.win ? 'info' : 'urgent';
  if (r.win === false) return 'urgent';
  return 'info';
}

// Clé de regroupement : icône + texte sans les nombres, noms propres entre guillemets et coordonnées
export const groupKey = (n) => `${n.icon || ''}|${(n.text || '').replace(/« [^»]*»/g, '«»').replace(/\([^)]*\)/g, '').replace(/[\d\s.,%+−-]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 48)}`;

// Groupes (les plus récents d'abord) : { key, cls, icon, text, count, unread, last, items }
export function groupNotices(list) {
  const map = new Map();
  for (const n of list || []) {
    const k = groupKey(n);
    let g = map.get(k);
    if (!g) { g = { key: k, cls: noticeClass(n), icon: n.icon, text: n.text, count: 0, unread: 0, last: n.t, items: [] }; map.set(k, g); }
    g.count++; if (!n.read) g.unread++; g.items.push(n); if (n.t > g.last) { g.last = n.t; g.text = n.text; }
  }
  const order = { urgent: 0, action: 1, info: 2 };
  return [...map.values()].sort((a, b) => order[a.cls] - order[b.cls] || b.last - a.last);
}
export function groupReports(list) {
  const map = new Map();
  for (const r of list || []) {
    const cls = reportClass(r);
    const k = `${r.kind || 'autre'}|${r.win ? 'v' : 'd'}`;
    let g = map.get(k);
    if (!g) { g = { key: k, cls, kind: r.kind, win: r.win, count: 0, unread: 0, last: r.t, items: [] }; map.set(k, g); }
    g.count++; if (!r.read) g.unread++; g.items.push(r); if (r.t > g.last) g.last = r.t;
  }
  return [...map.values()].sort((a, b) => (a.cls === 'urgent' ? 0 : 1) - (b.cls === 'urgent' ? 0 : 1) || b.last - a.last);
}

// Badges de l'affichage fixe
//  bell : nombre de groupes non lus urgents ou utiles ; bellDot : il reste de l'informatif non lu
//  reports : rapports non lus urgents (défaites) ; reportsDot : rapports informatifs non lus
//  urgent : il y a de l'urgent (badge « ! »)
export function badges(state) {
  const groups = groupNotices(state.notifications);
  const useful = groups.filter((g) => g.unread && g.cls !== 'info');
  const rep = (state.reports || []).filter((r) => !r.read);
  const repUrgent = rep.filter((r) => reportClass(r) === 'urgent').length;
  return {
    bell: useful.length,
    bellDot: groups.some((g) => g.unread && g.cls === 'info'),
    reports: repUrgent,
    reportsDot: rep.length > repUrgent,
    urgent: useful.filter((g) => g.cls === 'urgent').length + repUrgent,
  };
}
// Texte affiché d'un compte (« 9+ » au-delà de 9)
export const capCount = (n) => (n > 9 ? '9+' : String(n));

// Lu à l'écran : toutes les notifications (fenêtre ouverte), les rapports affichés, ou les informatifs seulement
export function markAllSeen(state) {
  for (const n of state.notifications || []) n.read = true;
  for (const r of state.reports || []) r.read = true;
}
export function markNoticesRead(state, cls = null) {
  for (const n of state.notifications || []) if (!cls || noticeClass(n) === cls) n.read = true;
}
export function markReportsRead(state, ids) {
  const set = new Set(ids);
  for (const r of state.reports || []) if (set.has(r.id)) r.read = true;
}
// Un message affiché pendant que le joueur regarde l'écran compte comme vu (les informatifs seulement : l'urgent
// reste signalé tant qu'on ne l'a pas ouvert)
export function seenOnScreen(state, text) {
  for (const n of state.notifications || []) if (!n.read && noticeClass(n) === 'info' && `${n.icon} ${n.text}` === text) { n.read = true; return true; }
  return false;
}
