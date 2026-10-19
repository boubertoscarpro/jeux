import { claimAll } from '../systems/comfort.js';
import { repActions } from './repercussions.js';
import { stageActions } from './stage.js';
import { iconize } from './glyphs.js';
import { openPlaces, castleActions } from './castleUi.js';
import { renderHud } from './hudFixed.js';
import { PLACES, SCREEN_PLACE, MAP_SCREENS } from '../data/places.js';
import { placeBuilding } from '../systems/places.js';
import { startUpgrade, upgradeCheck } from '../systems/construction.js';
import defenseView from './views/defense.js';
import omensView from './views/omens.js';
import { profileView, settingsView } from './views/kingdom.js';
import { bldgView } from './views/city.js';
import { tileView } from './views/world.js';
import outpostView from './views/outpost.js';
import { queuesHtml, queueActions } from './hud.js';
import { winSummary } from './winSummary.js';
import { a11yPrefs, setA11y } from '../systems/a11y.js';
import { nextBuilding } from '../systems/cityNav.js';
import { snapshotCity, homecoming } from '../systems/homecoming.js';
import { openKingdomText, kingdomTextActions, bindAnnouncer, openWhy } from './a11yUi.js';
import { A11Y_DEFAULTS, A11Y_SHOWCASE } from '../data/a11y.js';
import { BUILDINGS } from '../data/buildings.js';
import codexView from './views/codex.js';
import { bus } from '../core/bus.js';
import { RESOURCES } from '../data/resources.js';
import { ensureIconDefs, navIcon, gameIcon } from './icons.js';
// Sous-onglets des écrans les plus fréquentés : icônes dessinées
const SUBTAB_ICONS = { army: 's_atk', campaigns: 't_command', heroes: 'h_general', craft: 'b_craft', research: 't_lore', talents: 'b_magic' };
import { ensureArtDefs } from './art.js';
import { advance } from '../core/engine.js';
import { saveGame } from '../core/save.js';
import { fmtTime } from '../core/util.js';
import { sideActions, adviceBox } from './hud.js';
import { esc, resChips } from './components.js';
import cityView from './views/city.js';
import worldView from './views/world.js';
import heroesView from './views/heroes.js';
import armyView from './views/army.js';
import craftView from './views/craft.js';
import researchView from './views/research.js';
import marketView from './views/market.js';
import guildView from './views/guild.js';
import journalView from './views/journal.js';
import kingdomView from './views/kingdom.js';
import workersView from './views/workers.js';
import expeditionsView from './views/expeditions.js';
import chainsView from './views/chains.js';
import stewardView from './views/steward.js';
import factionsView from './views/factions.js';
import { kingdomInfoHtml } from './creation.js';
import convoysView from './views/convoys.js';
import talentsView from './views/talents.js';
import historyView from './views/history.js';
import statsView from './views/stats.js';
import treasuryView from './views/treasury.js';
import ecoReportView from './views/ecoReport.js';
import goalsView from './views/goals.js';
import policyView from './views/policy.js';
import projectsView from './views/projects.js';
import shopView from './views/shop.js';
import archaeoView from './views/archaeology.js';
import councilView from './views/council.js';
import legacyView from './views/legacy.js';
import challengesView from './views/challenges.js';
import legendView from './views/legendary.js';
import accomplishView from './views/accomplish.js';
import warView from './views/warcampaign.js';
import territoriesView from './views/territories.js';
import eventView from './views/events.js';
import eventShopView from './views/eventShop.js';
import calendarView from './views/calendar.js';
import wheelView from './views/wheel.js';
import shardsView from './views/shards.js';
import adminView from './views/admin.js';
import { reportHtml } from './views/calendar.js';
import { notifications } from '../systems/liveEvents.js';
import { groupNotices, seenOnScreen } from '../systems/notices.js';
import { openAdvisor } from './advisor.js';
import { openUpgradeList } from './upgrades.js';
import { helpFor, openHelp } from './help.js';
import { showTip } from './tips.js';
import { markVisited, campaignTick } from '../systems/campaign.js';
import { pruneAdvice, adviceList } from '../systems/guide.js';
import { questTick } from '../systems/questlines.js';
import { missionsTick } from '../systems/missions.js';

// Catégories de navigation → sous-onglets (débloqués progressivement)
export const GROUPS = [
  { id: 'g-kingdom', title: 'Royaume', icon: '🏰', tabs: [cityView, goalsView, challengesView, policyView, councilView, projectsView, omensView] },
  { id: 'g-world', title: 'Monde', icon: '🗺️', tabs: [worldView, territoriesView, factionsView, archaeoView, legendView] },
  { id: 'g-army', title: 'Armée', icon: '⚔️', tabs: [armyView, warView, defenseView] },
  { id: 'g-prod', title: 'Production', icon: '⛏️', tabs: [ecoReportView, stewardView, workersView, expeditionsView, chainsView] },
  { id: 'g-trade', title: 'Commerce', icon: '🚚', tabs: [marketView, convoysView, shopView] },
  { id: 'g-heroes', title: 'Héros', icon: '🧙', tabs: [heroesView, craftView] },
  { id: 'g-tech', title: 'Technologies', icon: '🔬', tabs: [researchView, talentsView, legacyView] },
  { id: 'g-events', title: 'Événements', icon: '🎪', tabs: [eventView, eventShopView, calendarView, adminView] },
  { id: 'g-wheel', title: 'Roue', icon: '🎡', tabs: [wheelView, shardsView] },
  { id: 'g-guild', title: 'Guilde', icon: '🏛️', tabs: [guildView] },
  { id: 'g-chron', title: 'Chronique', icon: '📜', tabs: [journalView, accomplishView, historyView, codexView, statsView, treasuryView, kingdomView, profileView, settingsView] },
];
export const VIEWS = GROUPS.flatMap((g) => g.tabs);
// v16 « Le Château » : plus de menu latéral. La carte (château, monde ou avant-poste) occupe tout l'écran ; chaque
// écran s'ouvre en fenêtre par-dessus, depuis son lieu (data/places.js), l'affichage fixe ou la liste des Lieux.
// Les fenêtres internes (fiche d'un bâtiment, case du monde) ne sont pas des écrans du jeu : elles n'ont pas de lieu.
export const MAP_VIEWS = [...MAP_SCREENS, 'outpost'];
const INTERNAL = [bldgView, tileView, outpostView];
const groupOf = (viewId) => GROUPS.find((g) => g.tabs.some((t) => t.id === viewId));
const placeName = (k) => { const p = PLACES[k]; return p ? (p.kind === 'building' ? BUILDINGS[p.type]?.name : p.name) : ''; };
const placeIcon = (k) => { const p = PLACES[k]; return p ? (p.kind === 'building' ? BUILDINGS[p.type]?.icon : p.icon) : ''; };

export class App {
  constructor(root, state) {
    this.adviceBox = adviceBox; // liste rapide des conseils, affichée dans la fenêtre du conseiller
    this.root = root;
    this.state = state;
    this.ui = { view: 'city', map: 'city', win: null, winHistory: [], showAllRes: false, lastTab: {} };
    this.views = Object.fromEntries([...VIEWS, ...INTERNAL].map((v) => [v.id, v]));
    this.dirty = true;
    this.$ = (sel) => root.querySelector(sel);
  }

  // Préférences d'affichage : animations (auto = préférence du système), densité
  applyPrefs() {
    const m = this.state?.meta || {};
    const sysReduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    const reduce = m.motion === 'reduced' || (m.motion !== 'full' && sysReduce);
    document.documentElement.classList.toggle('reduce-motion', reduce);
    document.documentElement.classList.toggle('compact', m.density === 'compact');
    // v15 : mode économie d'énergie (aucune animation continue, carte redessinée seulement si elle change)
    document.documentElement.classList.toggle('saver', !!m.saver);
    // v16 : qualité graphique (faible : aucune animation de bâtiment sur la carte du royaume)
    for (const q of ['low', 'medium', 'high']) document.documentElement.classList.toggle('gfx-' + q, (m.gfx || 'medium') === q);
    // v17 : accessibilité (taille du texte, contraste élevé, daltonisme, police, météo et nuit, noms, mode simplifié)
    const a = a11yPrefs(this.state), h = document.documentElement;
    h.style.setProperty('--text-scale', String(a.textScale));
    h.classList.toggle('hc', a.contrast);
    for (const c of ['deut', 'prot', 'trit']) h.classList.toggle('cb-' + c, a.colorVision === c);
    h.classList.toggle('font-readable', a.font === 'readable');
    h.classList.toggle('no-weather', !a.weather);
    h.classList.toggle('no-night', !a.night);
    h.classList.toggle('show-names', a.showNames);
    h.classList.toggle('simple', a.simple);
    h.classList.toggle('hide-ups', m.showUpgrades === false);
  }
  // v17 : navigation au clavier sur la carte du royaume
  cityKeyNext(x, y, key) { return nextBuilding(this.state, x, y, key); }
  focusCityTile(x, y) {
    const grid = document.querySelector('#view .city-grid');
    const el = grid?.querySelector(`.tile[data-x="${x}"][data-y="${y}"]`);
    if (!el) return;
    for (const o of grid.querySelectorAll('.tile[tabindex="0"]')) o.setAttribute('tabindex', '-1');
    el.setAttribute('tabindex', '0');
    this.ui.cityKeyFocus = { x, y };
    el.focus({ preventScroll: true });
    // Le bâtiment choisi reste visible, dans la zone que l'affichage fixe ne couvre pas
    const vp = document.getElementById('city-vp'), r = el.getBoundingClientRect(), v = vp?.getBoundingClientRect();
    if (vp && v && (r.left < v.left + 260 || r.right > v.right - 90 || r.top < v.top + 110 || r.bottom > v.bottom - 130)) { this.ui.cityFocus = { x, y }; vp._center?.(x, y); }
  }
  // Captures et tests : modes d'accessibilité présentés (null : réglages par défaut)
  get a11yModes() { return Object.keys(A11Y_SHOWCASE); }
  applyA11yMode(mode) {
    this.state.meta.a11y = mode ? { ...A11Y_DEFAULTS, ...A11Y_SHOWCASE[mode] } : { ...A11Y_DEFAULTS };
    this.applyPrefs(); this.mapDirty = true; this.render();
  }

  start() {
    // v16 : la carte en plein écran, l'affichage fixe par-dessus, puis la fenêtre du lieu ouvert
    this.root.innerHTML = `
      <button class="skip-link" data-action="kingdom-text">Le royaume en texte (alternative à la carte) — touche T</button>
      <main id="view" aria-label="Carte"></main>
      <div id="sr-live" class="sr-only" aria-live="polite" aria-atomic="true"></div>
      <div id="hud" class="hud"></div>
      <div id="win-root"></div>`;
    ensureIconDefs(); ensureArtDefs();
    this.applyPrefs();
    this.bindEvents();
    bus.on('changed', () => { this.dirty = true; });
    bus.on('toast', ({ text, type }) => this.toast(text, type));
    bindAnnouncer(this, bus); // v17 : raids, crises, chantiers terminés annoncés aux lecteurs d'écran
    bus.on('feat', (f) => this.feat(f));
    this.booting = true;
    const away = Date.now() - (this.state.meta.lastTick || Date.now());
    const before = { ...this.state.resources };
    const logBefore = this.state.log.length;
    const cityBefore = snapshotCity(this.state);
    advance(this.state, Date.now());
    this.booting = false;
    // v17 : le retour du seigneur — ce qui a changé brille quelques secondes sur le château, avant le rapport
    if (away > 2 * 60 * 1000) {
      const hc = homecoming(cityBefore, this.state);
      if (hc.built.length) { this.ui.glow = { ids: hc.built, until: Date.now() + 9000 }; setTimeout(() => { if (this.ui.map === 'city' && !this.ui.win) { this.mapDirty = true; this.render(); } }, 9100); }
      if (hc.text) setTimeout(() => this.toast(`🏰 ${hc.text}`, 'info'), 300);
    }
    this.render();
    if (away > 2 * 60 * 1000) setTimeout(() => this.absenceReport(away, before, logBefore), this.ui.glow ? 2500 : 0);
    const m = this.state.meta;
    if (m.migratedFrom || m.repaired || m.restoredFromBackup) {
      this.modal(`<h2>💾 Sauvegarde mise à jour</h2>${m.migratedFrom ? `<p>Votre partie (format v${m.migratedFrom}) a été convertie au format actuel <b>v${this.state.version}</b>. Rien n’a été perdu : les nouveaux systèmes ont simplement été ajoutés.</p>` : ''}
        ${m.restoredFromBackup ? '<p>La copie de secours a été restaurée. Les dernières minutes de jeu peuvent manquer.</p>' : ''}
        ${m.repaired ? `<p class="small">Valeurs invalides corrigées : ${esc(m.repaired.join(', '))}.</p>` : ''}<button class="btn primary" data-action="close-modal">Continuer</button>`, {});
      delete m.migratedFrom; delete m.repaired; delete m.restoredFromBackup;
      this.save();
    }
    this.timer = setInterval(() => this.tick(), 1000);
    this.saveTimer = setInterval(() => this.save(), 15000);
    document.addEventListener('visibilitychange', () => { document.documentElement.classList.toggle('paused-anim', document.hidden); if (document.hidden) this.save(); else this.tick(); });
    window.addEventListener('beforeunload', () => this.save());
  }

  absenceReport(away, before, logBefore) {
    const s = this.state;
    const diff = {};
    for (const [r, v] of Object.entries(s.resources)) { const d = v - (before[r] || 0); if (Math.abs(d) >= 1) diff[r] = Math.round(d); }
    const events = s.log.slice(0, Math.max(0, s.log.length - logBefore));
    const count = (re) => events.filter((l) => re.test(l.text)).length;
    const lines = [
      [count(/rentre :/), '⛏️', 'expédition(s) terminée(s)'],
      [count(/Retour de marche/), '🐎', 'marche(s) revenue(s)'],
      [count(/(Objet|objet|ARTEFACT|Artefact)/), '🏆', 'trouvaille(s) rare(s)'],
      [count(/caravane a été attaquée/), '⚠️', 'caravane(s) attaquée(s)'],
      [count(/incendie/i), '🔥', 'incendie(s)'],
      [count(/(Découvert|découvert|site\(s\) révélé|Site découvert)/), '🗺️', 'découverte(s) sur la carte'],
      [count(/raid/i), '🚨', 'événement(s) de raid'],
      [count(/^📋|Priorités/), '📋', 'réaffectation(s) automatique(s)'],
      [count(/construit|amélioré au niveau/), '🏗️', 'chantier(s) achevé(s)'],
      [count(/Recherche terminée/), '📜', 'recherche(s) terminée(s)'],
    ].filter(([n]) => n > 0);
    const orders = (s.orderLog || []).filter((o) => o.t > Date.now() - away).length;
    this.modal(`<h2>🌅 Pendant votre absence</h2><p class="muted">Vous étiez absent ${fmtTime(away)}${away > 12 * 3600 * 1000 ? ' (12 h simulées au maximum)' : ''}. Votre royaume a continué de vivre.</p>
      <div class="cols-2"><div><h4>Ressources</h4><div class="chips">${resChips(Object.fromEntries(Object.entries(diff).sort((a, b) => b[1] - a[1])), true) || '<span class="muted small">Aucun changement.</span>'}</div></div>
      <div><h4>Faits marquants</h4>${lines.map(([n, i, l]) => `<div>${i} <b>${n}</b> ${l}</div>`).join('')}${orders ? `<div>📜 <b>${orders}</b> ordre(s) du royaume exécuté(s)</div>` : ''}${s.pending.length ? `<div class="req">⚖️ ${s.pending.length} décision(s) vous attendent</div>` : ''}${!lines.length && !orders ? '<span class="muted small">Calme plat.</span>' : ''}</div></div>
      ${events.length ? `<h4>Chronique</h4><div class="log">${events.slice(0, 14).map((l) => `<div class="log-line small">${esc(l.text)}</div>`).join('')}</div>` : ''}
      <button class="btn primary" data-action="close-modal">Au travail !</button>`, {}, 'wide');
  }

  save(manual = false) {
    if (!this.state) return false;
    const r = saveGame(this.state);
    // Records des scénarios : copiés hors de la sauvegarde pour survivre à une nouvelle partie
    try {
      const rec = this.state.meta.scenarioRecords;
      if (rec && Object.keys(rec).length) { const old = JSON.parse(localStorage.getItem('cendrelande_records') || '{}') || {}; for (const [k, v] of Object.entries(rec)) if (!(old[k] <= v)) old[k] = v; localStorage.setItem('cendrelande_records', JSON.stringify(old)); }
    } catch { /* stockage indisponible : les records restent dans la sauvegarde */ }
    if (!r.ok) {
      // Message affiché une fois toutes les 5 minutes au plus (pas de spam toutes les 15 s)
      if (manual || Date.now() - (this._saveErrAt || 0) > 300000) { this.toast(`💾 ${r.error}`, 'bad'); this._saveErrAt = Date.now(); }
      return false;
    }
    if (manual) this.toast('💾 Partie sauvegardée', 'good');
    return true;
  }

  // Bilan de fin d'événement (affiché une fois)
  showEventReport() {
    const L = this.state.live;
    if (!L?.unseenReport || document.getElementById('modal-root')?.classList.contains('open')) return;
    const r = L.unseenReport;
    L.unseenReport = null;
    this.modal(`<h2>📜 Bilan de l’événement</h2>${reportHtml(r)}<button class="btn primary" data-action="close-modal">Fermer</button>`, {}, 'wide');
  }

  openNotifications() {
    const list = notifications(this.state);
    // v17 : regroupées (« ×12 »), l'urgent d'abord, puis ce qui demande une action, puis l'informatif
    const groups = groupNotices(list);
    const sect = (cls, title) => { const g = groups.filter((x) => x.cls === cls); return g.length ? `<h3 class="notif-h ${cls}">${title}</h3><ul class="notif-list">${g.map((x) => `<li class="${x.unread ? 'unread' : 'muted'}"><span aria-hidden="true">${x.icon}</span> ${esc(x.text)}${x.count > 1 ? ` <b class="notif-n" aria-label="${x.count} fois">×${x.count}</b>` : ''} <span class="muted small">· ${new Date(x.last).toLocaleString('fr-FR')}</span>${x.unread ? ' <span class="sr-only">(non lu)</span>' : ''}</li>`).join('')}</ul>` : ''; };
    this.modal(`<h2>🔔 Notifications</h2><p class="small muted">${groups.filter((g) => g.unread && g.cls !== 'info').length ? 'À voir en premier : l’urgent, puis ce qui demande une action.' : 'Rien d’urgent : seulement des informations.'}</p>
      ${sect('urgent', '⚠️ Urgent')}${sect('action', '👉 À faire')}${sect('info', 'ℹ️ Pour information')}${list.length ? '' : '<p class="muted">Rien pour l’instant.</p>'}
      <div class="row gap"><button class="btn" data-action="goto" data-view="event">🎪 Événement</button><button class="btn" data-action="goto" data-view="calendar">📅 Calendrier</button><button class="btn ghost" data-action="close-modal">Fermer</button></div>`, {}, 'wide');
    for (const n of list) n.read = true;
  }

  tick() {
    if (!this.state) return;
    const now = Date.now();
    if (!document.hidden) this.state.meta.playTime = (this.state.meta.playTime || 0) + 1000;
    advance(this.state, now);
    this.state.meta.bootOk = true;
    // Parcours guidé : détection automatique des missions (toutes les 3 s)
    if (!(this.cpTick > now - 3000)) {
      this.cpTick = now;
      try { if (campaignTick(this.state, now).length) this.dirty = true; pruneAdvice(this.state, now); } catch (e) { console.error(e); }
      // Quêtes du royaume et missions dynamiques (détection, nouvelles propositions)
      try { if (questTick(this.state, now).length) this.dirty = true; } catch (e) { console.error(e); }
      try { if (missionsTick(this.state, now).length) this.dirty = true; } catch (e) { console.error(e); }
    }
    this.showEventReport();
    showTip(this);
    if (this.dirty) this.render();
    else {
      this.renderHud();
      this.updateTimers();
      // Une carte figée derrière une fenêtre n'a pas besoin de ses animations de seconde en seconde
      if (!this.ui.win) this.views[this.ui.map]?.tick?.(this);
      else this.views[this.ui.win]?.tick?.(this);
    }
  }

  updateTimers() {
    const now = Date.now();
    this.root.querySelectorAll('[data-end]').forEach((el) => { el.textContent = fmtTime(+el.dataset.end - now); });
    this.root.querySelectorAll('[data-pend]').forEach((el) => {
      const s = +el.dataset.pstart, e = +el.dataset.pend;
      el.style.width = `${Math.min(100, Math.max(0, ((now - s) / (e - s)) * 100))}%`;
    });
  }

  // Tutoriel : met en évidence le menu qui mène à un écran
  // v16 : le guidage désigne un bâtiment du château (centré, mis en évidence) ou un bouton de l'affichage fixe
  highlight(viewId) {
    this.ui.highlight = viewId;
    const pk = SCREEN_PLACE[viewId];
    const p = PLACES[pk];
    const b = p?.kind === 'building' ? placeBuilding(this.state, pk) : null;
    if (this.ui.win) this.closeWin(false);
    if (viewId === 'city') { this.ui.map = 'city'; this.ui.hudHl = 'build-mode'; this.toast('Bâtissez depuis le bouton « Construire » en bas à droite (touche B).', 'info'); }
    else if (b) {
      this.ui.map = 'city'; this.ui.citySel = { x: b.x, y: b.y }; this.ui.ringOpen = true; this.ui.cityFocus = { x: b.x, y: b.y };
      this.ui.flashTile = { x: b.x, y: b.y, until: Date.now() + 4000 };
      this.ui.guide = { x: b.x, y: b.y, until: Date.now() + 9000 }; // v17 : flèche qui pulse au-dessus du lieu
      setTimeout(() => { if (this.ui.guide?.until <= Date.now() && this.ui.map === 'city' && !this.ui.win) { this.mapDirty = true; this.render(); } }, 9100);
      this.toast(`Ouvrez « ${BUILDINGS[b.type].name} » dans votre château : bouton « Ouvrir ».`, 'info');
    } else if (p?.kind === 'map') { this.ui.hudHl = 'toggle-map'; this.toast('Ouvrez la carte du monde : bouton « Monde » en bas à droite (touche M).', 'info'); }
    else if (p?.kind === 'hud') { this.ui.hudHl = pk === 'profile' ? 'profile' : 'settings'; this.toast(pk === 'profile' ? 'Ouvrez votre profil : médaillon en haut à gauche.' : 'Ouvrez les réglages : engrenage en haut à droite.', 'info'); }
    else { this.ui.hudHl = 'places'; this.toast(`Ce lieu n’est pas encore bâti : ouvrez « Lieux » (touche L) ou cliquez son panneau dans le château.`, 'info'); }
    this.render();
  }

  renderNav() { /* v16 : plus de menu latéral (affichage fixe : renderHud) */ }

  // Préserve la valeur/le focus des champs lors d'un re-rendu
  preserveInputs(container, fn) {
    const saved = {};
    const active = document.activeElement;
    container.querySelectorAll('input[id], select[id], textarea[id]').forEach((el) => { saved[el.id] = el.type === 'checkbox' ? el.checked : el.value; });
    const scroll = container.scrollTop;
    const activeId = active && container.contains(active) ? active.id : null;
    fn();
    for (const [id, v] of Object.entries(saved)) {
      const el = container.querySelector('#' + CSS.escape(id));
      if (!el) continue;
      if (el.type === 'checkbox') el.checked = v; else el.value = v;
    }
    container.scrollTop = scroll;
    if (activeId) { const el = container.querySelector('#' + CSS.escape(activeId)); if (el) el.focus(); }
  }

  renderHud() {
    const hud = this.$('#hud');
    if (!hud) return;
    this.preserveInputs(hud, () => { hud.innerHTML = renderHud(this); });
    hud.dataset.map = this.ui.map;
    if (this.ui.hudHl) hud.querySelector(this.ui.hudHl === 'profile' ? '.hud-coat' : this.ui.hudHl === 'settings' ? '[data-view="settings"]' : `[data-action="${this.ui.hudHl}"]`)?.classList.add('tut-hl');
    iconize(hud);
  }

  // Rendu : la carte (château, monde, avant-poste) derrière ; l'affichage fixe ; la fenêtre du lieu ouvert. Tant qu'une
  // fenêtre est ouverte, la carte n'est pas redessinée (elle est floutée derrière) : ouvrir un écran ne coûte que
  // l'écran lui-même.
  render() {
    // Pendant l'animation de la Roue, seul l'affichage fixe est rafraîchi
    if (this.ui.freezeUntil > Date.now()) { this.renderHud(); this.dirty = true; return; }
    this.dirty = false;
    const map = this.views[this.ui.map] || this.views.city;
    this.ui.view = this.ui.win || map.id;
    const main = this.$('#view');
    this.root.classList.add('mapmode');
    this.root.classList.toggle('win-open', !!this.ui.win);
    // v17 : l'affichage fixe d'abord, pour que le cadrage de la carte connaisse sa zone de sécurité
    this.renderHud();
    // Sans fenêtre : la carte est redessinée comme avant. Avec une fenêtre : seulement si on l'a demandé (changement de
    // carte, action sur la carte) ; ouvrir un écran par-dessus une carte à jour ne la redessine pas.
    if (!this.ui.win || this.mapDirty || main.dataset.screen !== map.id) {
      main.dataset.screen = map.id;
      this.preserveInputs(main, () => { main.innerHTML = `<div class="view view-${map.id}">${map.render(this)}</div>`; });
      map.after?.(this);
      iconize(main);
      this.mapDirty = false;
    }
    this.renderWin();
  }

  // Fenêtre du lieu : titre (lieu et niveau), onglets des écrans du lieu, Améliorer, Retour, Aide, fermeture
  renderWin() {
    const root = this.$('#win-root');
    if (!root) return;
    const id = this.ui.win;
    if (!id) { root.innerHTML = ''; root.classList.remove('open'); return; }
    const view = this.views[id];
    if (!view) { this.ui.win = null; root.innerHTML = ''; return; }
    const pk = SCREEN_PLACE[id];
    const p = PLACES[pk];
    const b = p?.kind === 'building' ? placeBuilding(this.state, pk) : null;
    const internal = INTERNAL.includes(view);
    const title = internal ? (view.title_?.(this) || view.title) : b ? `${BUILDINGS[b.type].name}` : p ? placeName(pk) : view.title;
    const icon = internal ? '' : b ? BUILDINGS[b.type].icon : p ? placeIcon(pk) : view.icon;
    const lvl = b && BUILDINGS[b.type].maxLevel > 1 ? `<span class="lvl">niv. ${b.level}</span>` : '';
    const u = b && BUILDINGS[b.type].maxLevel > 1 ? upgradeCheck(this.state, b.id) : null;
    const tabs = !internal && p ? p.screens.filter((v) => this.views[v] && (v === id || !this.views[v].locked?.(this))) : [];
    const locked = view.locked?.(this);
    const help = helpFor(id) ? `<button class="win-ic" data-action="help" title="Aide sur cet écran" aria-label="Aide">❓</button>` : '';
    root.classList.add('open');
    const body = locked ? `<div class="card locked-card"><h2>${esc(view.title)}</h2><p>${esc(locked)}</p><p class="muted small">Ce lieu s’ouvrira de lui-même : son panneau dans le château indique la condition.</p></div>` : view.render(this);
    const html = `<div class="win-backdrop" data-action="win-close"></div>
      <section class="win" role="dialog" aria-modal="true" aria-labelledby="win-title" data-screen="${id}">
        <header class="win-head">
          ${this.ui.winHistory.length ? `<button class="win-ic" data-action="win-back" title="Retour" aria-label="Retour">←</button>` : ''}
          <h2 id="win-title">${icon} ${esc(title)} ${lvl}</h2>
          ${u && ['ready', 'queue', 'lack'].includes(u.status) ? `<button class="mini ${u.status === 'ready' ? 'primary' : ''}" data-action="upgrade-place" data-id="${b.id}" ${u.status === 'lack' ? `disabled title="${esc(u.reasons[0] || '')}"` : ''}>⬆ Améliorer</button>` : ''}
          ${help}<button class="win-ic win-x" data-action="win-close" title="Fermer (Échap)" aria-label="Fermer">✕</button>
        </header>
        ${tabs.length > 1 ? `<nav class="win-tabs" role="tablist">${tabs.map((v) => { const t = this.views[v]; const n = t.badge?.(this) || 0; return `<button class="win-tab ${v === id ? 'active' : ''}" role="tab" aria-selected="${v === id}" data-action="nav" data-view="${v}">${t.icon} ${esc(t.title)}${n ? ` <span class="hb hb-num">${n}</span>` : ''}</button>`; }).join('')}</nav>` : ''}
        ${!locked && winSummary(this, id) ? `<p class="win-sum" role="note">${esc(winSummary(this, id))}</p>` : ''}
        <div class="win-body view view-${id}" id="win-body">${body}</div>
      </section>`;
    const prev = root.querySelector('#win-body');
    const keepScroll = prev && root.querySelector('.win')?.dataset.screen === id ? prev.scrollTop : 0;
    this.preserveInputs(root, () => { root.innerHTML = html; });
    const nb = root.querySelector('#win-body'); if (nb) nb.scrollTop = keepScroll;
    // v17 : un seul titre — le premier titre du contenu, s'il répète celui de la fenêtre, n'est plus lu que par les
    // lecteurs d'écran
    const h = nb?.querySelector('.card > h2:first-child');
    const norm = (t) => (t || '').replace(/niv\.?\s*\d+/gi, '').replace(/[^\p{L}\s']/gu, '').trim().toLowerCase();
    if (h && norm(h.textContent) && norm(h.textContent) === norm(title)) h.classList.add('sr-only');
    if (!locked) view.after?.(this);
    iconize(root);
    if (this._focusWin) { this._focusWin = false; root.querySelector('.win-x')?.focus(); }
  }

  closeWin(render = true) {
    this.ui.win = null; this.ui.winHistory = [];
    this.mapDirty = true;
    if (render) { this.render(); this.restoreFocus('_winReturn'); }
  }

  updateBadges() { /* v16 : badges dans l'affichage fixe */ }

  // Ouvre un écran : la carte (château, monde) ou une fenêtre par-dessus. Un lien vers un autre lieu remplace la
  // fenêtre et garde un bouton Retour.
  go(viewId, sel = {}) {
    const g = GROUPS.find((x) => x.id === viewId);
    if (g) viewId = this.ui.lastTab[g.id] || g.tabs[0].id;
    if (viewId === 'g-kingdom') viewId = 'city';
    if (!this.views[viewId]) viewId = 'city';
    markVisited(this.state, viewId); // missions « consulter … » du parcours guidé
    if (this.ui.highlight === viewId) { this.ui.highlight = null; this.ui.hudHl = null; }
    Object.assign(this.ui, sel);
    if (MAP_VIEWS.includes(viewId)) {
      this.ui.map = viewId; this.ui.win = null; this.ui.winHistory = []; this.mapDirty = true;
      if (viewId !== 'city') this.ui.buildMode = false;
    } else {
      const same = this.ui.win && SCREEN_PLACE[this.ui.win] === SCREEN_PLACE[viewId];
      if (this.ui.win && !same && this.ui.win !== viewId) this.ui.winHistory.push(this.ui.win);
      if (this.ui.winHistory.length > 8) this.ui.winHistory.shift();
      if (!this.ui.win) { this._focusWin = true; const ae = document.activeElement; if (ae && !ae.closest?.('#win-root')) this._winReturn = ae; }
      this.ui.win = viewId;
      const gg = groupOf(viewId); if (gg) this.ui.lastTab[gg.id] = viewId;
    }
    this.ui.phoneDrawer = null;
    this.render();
  }

  // Dépense importante (≥ 60 % du stock d'une ressource) : demande confirmation avant de lancer l'action
  confirmSpend(cost, what = 'cette action') {
    const big = Object.entries(cost || {}).filter(([r, v]) => v > 0 && v >= 0.6 * (this.state.resources[r] || 0) && (this.state.resources[r] || 0) >= v);
    if (!big.length) return true;
    return confirm(`${what[0].toUpperCase() + what.slice(1)} utilise une grande partie de vos réserves (${big.map(([r, v]) => `${Math.round((v / this.state.resources[r]) * 100)} % de ${RESOURCES[r]?.name?.toLowerCase() || r}`).join(', ')}). Continuer ?`);
  }

  // Exécute une action de jeu ; affiche l'erreur éventuelle
  act(fn, okMsg) {
    let r;
    try { r = fn(); } catch (e) { console.error(e); this.toast('Erreur : ' + e.message, 'bad'); return null; }
    if (r && r.ok === false) {
      this.toast(r.reason || 'Action impossible : l’élément visé n’existe plus ou la situation a changé (actualisation de l’écran).', 'bad');
    } else if (okMsg) this.toast(typeof okMsg === 'function' ? okMsg(r) : okMsg, 'good');
    this.render();
    if (!r || r.ok !== false) this.save();
    return r;
  }

  bindEvents() {
    let last = { key: '', t: 0 };
    const handle = (ev, attr) => {
      const el = ev.target.closest(`[${attr}]`);
      if (!el || !this.root.contains(el) && !document.getElementById('modal-root').contains(el)) return;
      const name = el.getAttribute(attr);
      if (el.disabled) return;
      // Protection contre les doubles clics : même action sur le même élément en moins de 350 ms ignorée
      if (attr === 'data-action') {
        // Toutes les données du bouton font partie de la clé : deux boutons différents de la même action restent distincts
        const key = `${name}|${JSON.stringify(el.dataset)}`;
        const now = performance.now();
        if (key === last.key && now - last.t < 350) return;
        last = { key, t: now };
      }
      const winV = this.ui.win ? this.views[this.ui.win] : null;
      const mapV = this.views[this.ui.map];
      const inWin = !!el.closest('#win-root');
      const fn = (this.modalActions && this.modalActions[name]) || (inWin && winV?.actions?.[name]) || mapV?.actions?.[name] || winV?.actions?.[name] || sideActions[name] || this.globalActions[name];
      if ((name === 'goto' || name === 'nav') && this.modalActions) this.closeModal();
      if (fn) { ev.preventDefault?.(); fn(this, el, ev); }
    };
    document.addEventListener('click', (ev) => handle(ev, 'data-action'));
    document.addEventListener('change', (ev) => handle(ev, 'data-change'));
    document.addEventListener('input', (ev) => handle(ev, 'data-input'));
    document.addEventListener('keydown', (ev) => {
      const open = document.getElementById('modal-root')?.classList.contains('open');
      // v17 : le focus reste dans la fenêtre de dialogue ou la fenêtre de lieu ouverte (Tab et Maj+Tab bouclent)
      if (ev.key === 'Tab') {
        const box = open ? document.querySelector('#modal-root .modal') : this.ui.win ? document.querySelector('#win-root .win') : null;
        if (box) {
          const f = [...box.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])')].filter((e) => e.getClientRects().length);
          if (f.length) {
            const i = f.indexOf(document.activeElement);
            if (!box.contains(document.activeElement) || (ev.shiftKey && i <= 0) || (!ev.shiftKey && i === f.length - 1)) { ev.preventDefault(); (ev.shiftKey ? f[f.length - 1] : f[0]).focus(); }
          }
        }
        return;
      }
      if (ev.key === 'Escape') {
        if (open) { this.closeModal(); return; }
        if (this.ui.phoneDrawer) { this.ui.phoneDrawer = null; this.renderHud(); return; }
        if (this.ui.win) { this.closeWin(); return; }
        if (this.ui.ringOpen) { this.ui.ringOpen = false; this.render(); return; }
        if (this.ui.buildMode) { this.ui.buildMode = false; this.ui.placeType = null; this.ui.moveId = null; this.render(); }
        return;
      }
      // v16 : raccourcis (hors saisie) : M monde/château, B construire, A armée, Q quêtes, R rapports, L lieux
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(ev.target?.tagName || '') || ev.target?.isContentEditable;
      if (typing || open || ev.altKey || ev.metaKey || (ev.ctrlKey && ev.key.toLowerCase() !== 'k')) return;
      const k = ev.key.toLowerCase();
      const map = { m: () => this.globalActions['toggle-map'](this), b: () => this.globalActions['build-mode'](this), a: () => this.go('army'), q: () => this.go('goals'), r: () => this.go('defense'), l: () => openPlaces(this), '/': () => openPlaces(this), t: () => openKingdomText(this) };
      if (ev.ctrlKey && k === 'k') { ev.preventDefault(); openPlaces(this); return; }
      if (map[k]) { ev.preventDefault(); map[k](); }
    });
    // v17 : carte du royaume au clavier — un seul arrêt de tabulation, les flèches vont de bâtiment en bâtiment,
    // Entrée ouvre l'anneau d'actions, Origine revient à l'hôtel de ville
    document.addEventListener('keydown', (ev) => {
      const t = ev.target?.closest?.('#view .city-grid .tile');
      if (!t || this.ui.win || ev.altKey || ev.ctrlKey || ev.metaKey) return;
      let n = null;
      if (ev.key === 'Home') { const th = Object.values(this.state.city.buildings).find((b) => b.type === 'townhall'); if (th) n = { x: th.x, y: th.y }; }
      else n = this.cityKeyNext(+t.dataset.x, +t.dataset.y, ev.key);
      if (!n) return;
      ev.preventDefault();
      this.focusCityTile(n.x, n.y);
    });
  }

  globalActions = {
    nav: (app, el) => app.go(el.dataset.view),
    'close-modal': (app) => app.closeModal(),
    advisor: (app) => openAdvisor(app),
    'up-list': (app) => openUpgradeList(app),
    help: (app) => openHelp(app, app.ui.win || app.ui.map, groupOf(app.ui.win || app.ui.map)),
    'kingdom-info': (app) => app.modal(`<h2>Votre royaume</h2>${kingdomInfoHtml(app.state)}`, {}, 'wide'),
    notifs: (app) => { app.openNotifications(); app.renderHud(); },
    'win-close': (app) => app.closeWin(),
    'win-back': (app) => { const prev = app.ui.winHistory.pop(); if (prev) { app.ui.win = prev; app.render(); } else app.closeWin(); },
    'upgrade-place': (app, el) => app.act(() => startUpgrade(app.state, el.dataset.id), 'Amélioration lancée'),
    'toggle-map': (app) => app.go(app.ui.map === 'city' ? 'world' : 'city'),
    'build-mode': (app) => { if (app.ui.map !== 'city' || app.ui.win) { app.ui.win = null; app.ui.winHistory = []; app.ui.map = 'city'; } app.ui.buildMode = !app.ui.buildMode; if (!app.ui.buildMode) { app.ui.placeType = null; app.ui.moveId = null; } app.ui.ringOpen = false; app.mapDirty = true; app.render(); },
    queues: (app) => app.modal(`<h2>⏳ Files du royaume</h2>${queuesHtml(app)}`, {}, 'wide'),
    'res-more': (app) => { app.ui.resMore = !app.ui.resMore; app.renderHud(); },
    'act-more': (app) => { app.ui.actMore = !app.ui.actMore; app.renderHud(); },
    'left-fold': (app) => { app.ui.leftCollapsed = !(app.ui.leftCollapsed ?? innerWidth <= 1200); app.renderHud(); },
    'drawer-q': (app) => { app.ui.phoneDrawer = app.ui.phoneDrawer === 'q' ? null : 'q'; app.renderHud(); },
    'drawer-a': (app) => { app.ui.phoneDrawer = app.ui.phoneDrawer === 'a' ? null : 'a'; app.renderHud(); },
    'drawer-close': (app) => { app.ui.phoneDrawer = null; app.renderHud(); },
    fullscreen: () => { try { if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen?.(); } catch { /* refusé par le navigateur */ } },
    'hud-zoom': (app, el) => { const mv = app.views[app.ui.map]; (mv?.actions?.['city-zoom'] || mv?.actions?.zoom)?.(app, el); },
    'kingdom-text': (app) => openKingdomText(app),
    // v18 : « Tout réclamer » (tableau de bord, colonne des quêtes)
    'claim-all': (app) => app.act(() => claimAll(app.state), (r) => `🎁 ${r.n} récompense${r.n > 1 ? 's' : ''} réclamée${r.n > 1 ? 's' : ''}${r.text ? ` : ${r.text}` : ''}`),
    'layer-bar': (app) => { app.ui.layerBar = !app.ui.layerBar; app.renderHud(); },
    layer: (app, el) => { const k = el.dataset.k || null; app.ui.layer = k && app.ui.layer !== k ? k : null; if (!k) app.ui.layerBar = false; app.mapDirty = true; if (app.ui.map !== 'city') app.go('city'); else app.render(); },
    timeline: (app) => { app.ui.timelineOpen = !document.querySelector('.hud-timeline:not(.closed)') ? true : false; app.renderHud(); },
    why: (app, el) => openWhy(app, el.dataset.what, el.dataset.arg),
    'kt-see': (app, el) => kingdomTextActions['kt-see'](app, el),
    a11y: (app, el) => { const k = el.dataset.k, v = el.dataset.v; const val = v === 'true' ? true : v === 'false' ? false : /^[\d.]+$/.test(v) ? +v : v; setA11y(app.state, k, val); app.applyPrefs(); app.mapDirty = true; app.render(); app.save(); },
    'hud-fit': (app, el) => { const mv = app.views[app.ui.map]; (mv?.actions?.['city-fit'] || mv?.actions?.fit)?.(app, el); },
    'hud-center': (app, el) => { const mv = app.views[app.ui.map]; (mv?.actions?.['city-center'] || mv?.actions?.center)?.(app, el); },
    domain: (app, el) => { if (el.value) { app.ui.map = 'outpost'; app.ui.outpost = el.value; } else app.ui.map = 'city'; app.ui.win = null; app.ui.winHistory = []; app.ui.opSel = null; app.ui.opMove = null; app.ui.buildMode = false; app.mapDirty = true; app.render(); },
    // Visiter un avant-poste (carte du monde, fiche des territoires)
    'visit-outpost': (app, el) => { if (!app.state.territories[el.dataset.k]) return; app.closeModal?.(); app.ui.outpost = el.dataset.k; app.ui.opSel = null; app.ui.opMove = null; app.go('outpost'); },
    // « Y aller » : centre le château sur le lieu de l'objectif (ou ouvre l'écran s'il n'a pas de bâtiment)
    'go-place': (app, el) => { const v = el.dataset.view; const pk = SCREEN_PLACE[v]; const b = pk && PLACES[pk].kind === 'building' ? placeBuilding(app.state, pk) : null; if (b) app.highlight(v); else app.go(v); },
    ...queueActions,
    goto: (app, el) => app.go(el.dataset.view, el.dataset.sel ? JSON.parse(el.dataset.sel) : {}),
    places: (app) => openPlaces(app),
    'goto-tile': castleActions['goto-tile'],
    ...repActions,
    ...stageActions,
  };

  modal(html, actions = {}, cls = '') {
    this.modalActions = actions;
    const root = document.getElementById('modal-root');
    if (!root.classList.contains('open') && document.activeElement && !root.contains(document.activeElement)) this._modalReturn = document.activeElement;
    root.innerHTML = `<div class="modal-backdrop" data-action="close-modal"></div><div class="modal ${cls}" role="dialog"><button class="modal-x" data-action="close-modal" aria-label="Fermer">✕</button>${html}</div>`;
    root.classList.add('open');
    iconize(root);
    root.querySelector('.modal')?.setAttribute('aria-modal', 'true');
    if (!root.contains(document.activeElement)) root.querySelector('.modal input, .modal button:not(.modal-x), .modal-x')?.focus({ preventScroll: true });
  }
  // Fenêtre de confirmation (actions destructrices ou irréversibles)
  confirm(html, okLabel, onOk, danger = true) {
    this.modal(`${html}<div class="row gap"><button class="btn ${danger ? 'danger' : 'primary'}" data-action="confirm-ok">${esc(okLabel)}</button><button class="btn ghost" data-action="close-modal">Annuler</button></div>`, {
      'confirm-ok': (app) => { app.closeModal(); onOk(); },
    }, 'wide');
  }

  closeModal() {
    const root = document.getElementById('modal-root');
    const was = root.classList.contains('open');
    root.classList.remove('open');
    root.innerHTML = '';
    this.modalActions = null;
    // v17 : le focus revient à l'élément qui a ouvert le dialogue
    if (was) this.restoreFocus('_modalReturn');
  }
  restoreFocus(slot) {
    const el = this[slot];
    this[slot] = null;
    if (el && el.isConnected && el.getClientRects().length) { el.focus({ preventScroll: true }); return; }
    const k = this.ui.cityKeyFocus;
    if (k && this.ui.map === 'city') document.querySelector(`#view .city-grid .tile[data-x="${k.x}"][data-y="${k.y}"]`)?.focus({ preventScroll: true });
  }

  // Grandes réussites : bandeau (un à la fois, 3 en attente au plus) ; fin de chantier : la case s'illumine.
  // Rien pendant le rattrapage hors-ligne (le rapport d'absence le résume déjà).
  feat(f) {
    if (this.booting || typeof document === 'undefined') return;
    if (f.at) { this.ui.flashTile = { x: f.at.x, y: f.at.y, until: Date.now() + 1500 }; this.dirty = true; }
    if (!f.title) return;
    (this.featQueue ||= []).push(f);
    if (this.featQueue.length > 3) this.featQueue.splice(0, this.featQueue.length - 3);
    if (!this.featBusy) this.nextFeat();
  }
  nextFeat() {
    const f = this.featQueue?.shift();
    if (!f) { this.featBusy = false; return; }
    this.featBusy = true;
    const el = document.createElement('div');
    el.className = `fx-banner ${f.tone === 'bad' ? 'bad' : ''}`;
    el.setAttribute('role', 'status');
    el.innerHTML = `<span class="fx-icon">${esc(f.icon || '✨')}</span><div>${esc(f.title)}${f.sub ? `<small>${esc(f.sub)}</small>` : ''}</div>`;
    document.body.appendChild(el);
    const reduce = document.documentElement.classList.contains('reduce-motion');
    setTimeout(() => { el.remove(); this.nextFeat(); }, reduce ? 2600 : 3300);
  }

  toast(text, type = 'info') {
    const box = document.getElementById('toasts');
    if (!box) return;
    // Pas de doublon visible : un message identique déjà affiché n'est pas répété
    if ([...box.children].some((c) => c.textContent === text)) return;
    // v17 : un message informatif affiché pendant que le joueur regarde compte comme lu (l'urgent reste signalé)
    if (this.state && !document.hidden) seenOnScreen(this.state, text);
    const el = document.createElement('div');
    el.className = `toast toast-${type}`;
    el.textContent = text;
    box.appendChild(el);
    setTimeout(() => el.classList.add('show'), 10);
    setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 400); }, a11yPrefs(this.state).toastSec * 1000 - 200); // v17 : durée réglable
    while (box.children.length > 3) box.firstChild.remove();
  }
}
