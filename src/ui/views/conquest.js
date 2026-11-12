// v26 « Nouvelles conquêtes » — écran des métropoles, prisonniers, fausses bannières, saison de guerre, Îles de Cendre et
// calendrier de fidélité (règles : systems/conquest.js)
import { RIVALS } from '../../data/world.js';
import { fmt } from '../../core/util.js';
import { esc, countdown } from '../components.js';
import {
  conquestState, metropolises, ensureMetropolises, BANNER_MODES, bannerMode, setFalseBanner, seasonBoard, CONQUEST,
  loyaltyReady, loyaltyNext, claimLoyalty,
} from '../../systems/conquest.js';
import { describePending, resolveAny } from '../../systems/pending.js';
import { worldFocus } from './world.js';

const STATUS = { free: 'Indépendante', vassal: 'Votre vassale', pillaged: 'Pillée (se relève)', liberated: 'Libérée' };

function metroCard(app) {
  const s = app.state, now = Date.now();
  ensureMetropolises(s);
  const list = metropolises(s);
  return `<div class="card"><h3>🏰 Métropoles</h3><p class="small muted">Trois grandes cités libres sont devenues des places fortes. Assiégez-les (flancs, vagues, engins), puis choisissez : les piller, en faire des vassales (tribut, mais la maison protectrice contre-attaque) ou les libérer.</p>
    <div class="cq-list">${list.map((p) => `<div class="cq-row"><span><b>${esc(p.name)}</b> ${'★'.repeat(p.rank || 0)}</span><span class="small">${esc(STATUS[p.metro.status] || p.metro.status)}${p.metro.regrowAt > now ? ` · ${countdown(p.metro.regrowAt)}` : ''}</span><span class="small muted">${p.metro.protector != null ? esc(RIVALS[p.metro.protector]?.name || '') : '—'}</span><button class="mini ghost" data-action="cq-goto" data-x="${p.x}" data-y="${p.y}">Montre-moi</button></div>`).join('') || '<div class="muted">Aucune cité assez grande pour l’instant.</div>'}</div>
    ${conquestState(s).threats.length ? `<div class="small bad">${conquestState(s).threats.map((t) => `⚔️ ${esc(t.label)} — ${countdown(t.arrive)}`).join('<br>')}</div>` : ''}</div>`;
}
function prisonersCard(app) {
  const s = app.state, C = conquestState(s);
  const pend = s.pending.filter((p) => p.kind === 'prisoner' || p.kind === 'metro');
  return `<div class="card"><h3>⛓️ Prisonniers et décisions de conquête</h3>
    ${pend.length ? pend.map((p) => { const d = describePending(s, p); return `<div class="card-sub"><b>${esc(d.title)}</b><div class="small">${esc(d.text)}</div><div class="row gap wrap">${d.choices.map((c, i) => `<button class="mini ${i === 0 ? 'primary' : ''}" data-action="cq-decide" data-id="${p.id}" data-i="${i}" title="${esc(c.hint || '')}">${esc(c.label)}</button>`).join('')}</div></div>`; }).join('') : '<p class="small muted">Aucun prisonnier. Un seigneur vaincu (capitale rivale, forteresse de la Brèche, raid repoussé) ou le gouverneur d’une métropole prise peut être capturé.</p>'}
    ${C.prisoners.length ? `<div class="small muted">En cellule : ${C.prisoners.map((p) => esc(p.name)).join(', ')}</div>` : ''}</div>`;
}
function bannerCard(app) {
  const s = app.state, now = Date.now(), cur = bannerMode(s, now), B = conquestState(s).banner;
  return `<div class="card"><h3>🎭 Fausses bannières</h3><p class="small muted">Montrez aux espions ennemis une garnison plus forte ou plus faible que la vraie. Une ruse dure ${CONQUEST.bannerDays} jours et coûte ${fmt(CONQUEST.bannerCost.gold)} or. Les maisons savantes la percent plus souvent ; une maison bernée s’en souvient.</p>
    ${Object.entries(BANNER_MODES).map(([k, m]) => `<button class="spec ${cur === k ? 'active' : ''}" data-action="cq-banner" data-k="${k}" ${cur === k ? 'disabled' : ''}><b>${esc(m.name)}</b><span class="small muted">${esc(m.desc)}</span></button>`).join('')}
    ${cur !== 'none' ? `<div class="small">Ruse active encore ${countdown(B.until)}.</div>` : ''}</div>`;
}
function seasonCard(app) {
  const s = app.state, now = Date.now(), C = conquestState(s), b = seasonBoard(s, now);
  if (!b) return '<div class="card"><h3>🚩 Saison de guerre</h3><p class="small muted">La première saison s’ouvre à l’Hôtel de ville niveau 5.</p></div>';
  const S = b.S, open = now >= S.start && now < S.end;
  return `<div class="card"><h3>🚩 Saison de guerre ${S.n}</h3>
    <p class="small muted">Trois semaines de campagne : victoires sur les maisons et la Brèche, raids repoussés, métropoles prises, îles tenues, prisonniers. Récompenses de prestige seulement (titres) ; la dynastie garde son meilleur rang.</p>
    ${open ? `<div><b>${fmt(S.points)}</b> points · rang <b>${b.rank}</b> / ${b.size} · fin dans ${countdown(S.end)}</div>` : `<div class="small">Prochaine saison dans ${countdown(S.start)}.</div>`}
    <ol class="small">${b.top.map((x) => `<li>${x.me ? '<b>' : ''}${esc(x.name)}${x.me ? '</b>' : ''} — ${fmt(x.points)}</li>`).join('')}</ol>
    ${C.seasonsDone.length ? `<div class="small muted">Saisons passées : ${C.seasonsDone.map((d) => `n°${d.n} : ${d.rank}e${d.title ? ` (${esc(d.title)})` : ''}`).join(' · ')}</div>` : ''}</div>`;
}
function islesCard(app) {
  const s = app.state, now = Date.now(), I = conquestState(s).isles;
  const list = (I?.list || []).map((k) => s.world.pois[k]).filter(Boolean);
  return `<div class="card"><h3>🌋 Îles de Cendre</h3><p class="small muted">Une semaine sur trois, un archipel émerge au bord du monde. Une île conquise donne ${CONQUEST.isleCrystals} cristaux par jour tant qu’elle émerge ; les maisons rivales se les disputent aussi.</p>
    ${!I ? '<div class="small">L’archipel se révélera à l’Hôtel de ville niveau 6.</div>' : I.until ? `<div class="small">Émergées encore ${countdown(I.until)}.</div><div class="cq-list">${list.map((p) => `<div class="cq-row"><span>Île (${p.x}, ${p.y})</span><span class="small">${p.owner === 'me' ? '<span class="ok">à vous</span>' : p.owner != null ? esc(RIVALS[p.owner]?.name || '') : 'libre'}</span><button class="mini ghost" data-action="cq-goto" data-x="${p.x}" data-y="${p.y}">Montre-moi</button></div>`).join('')}</div>` : `<div class="small">Prochaine émergence dans ${countdown(I.next)}.</div>`}</div>`;
}
function loyaltyCard(app) {
  const s = app.state, L = conquestState(s).loyalty, ready = loyaltyReady(s);
  const g = loyaltyNext(s);
  const what = Object.entries(g).map(([k, v]) => (k === 'res' ? Object.entries(v).map(([r, n]) => `${fmt(n)} ${r}`).join(', ') : k === 'speedups' ? 'passe-temps' : k === 'consumable' ? 'potion' : k)).join(', ');
  return `<div class="card"><h3>📅 Calendrier de fidélité</h3><p class="small muted">Une récompense par jour de visite. Pas de série à perdre : un jour manqué ne coûte rien.</p>
    <div>Jours reçus : <b>${L.days}</b> · prochaine : ${esc(what)}</div>
    <button class="btn ${ready ? 'primary' : 'ghost'}" data-action="cq-loyalty" ${ready ? '' : 'disabled'}>${ready ? 'Recevoir la récompense du jour' : 'Déjà reçue aujourd’hui'}</button></div>`;
}

export default {
  id: 'conquest', title: 'Conquêtes', icon: '🏰',
  badge: (app) => (loyaltyReady(app.state) ? 1 : 0) + app.state.pending.filter((p) => p.kind === 'prisoner' || p.kind === 'metro').length,
  render(app) {
    return `<div class="cols-2">${metroCard(app)}${prisonersCard(app)}</div><div class="cols-2">${seasonCard(app)}${bannerCard(app)}</div><div class="cols-2">${islesCard(app)}${loyaltyCard(app)}</div>`;
  },
  actions: {
    'cq-goto': (app, el) => { app.ui.map = 'world'; app.go('world'); worldFocus(app, +el.dataset.x, +el.dataset.y, 1.1); },
    'cq-banner': (app, el) => app.act(() => setFalseBanner(app.state, el.dataset.k), 'Ruse en place'),
    'cq-loyalty': (app) => app.act(() => claimLoyalty(app.state), (r) => `📅 ${r.text}`),
    'cq-decide': (app, el) => app.act(() => resolveAny(app.state, el.dataset.id, +el.dataset.i), (r) => r?.text || 'Décision prise'),
  },
};
