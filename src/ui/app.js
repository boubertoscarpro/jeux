import { bus } from '../core/bus.js';
import { advance } from '../core/engine.js';
import { saveGame } from '../core/save.js';
import { fmtTime } from '../core/util.js';
import { renderTopbar, renderSide, sideActions } from './hud.js';
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
import convoysView from './views/convoys.js';
import talentsView from './views/talents.js';
import historyView from './views/history.js';
import statsView from './views/stats.js';
import treasuryView from './views/treasury.js';
import ecoReportView from './views/ecoReport.js';
import goalsView from './views/goals.js';
import territoriesView from './views/territories.js';
import eventView from './views/events.js';
import eventShopView from './views/eventShop.js';
import calendarView from './views/calendar.js';
import wheelView from './views/wheel.js';
import shardsView from './views/shards.js';
import adminView from './views/admin.js';
import { reportHtml } from './views/calendar.js';
import { notifications } from '../systems/liveEvents.js';
import { openAdvisor } from './advisor.js';
import { showTip } from './tips.js';

// Catégories de navigation → sous-onglets (débloqués progressivement)
export const GROUPS = [
  { id: 'g-kingdom', title: 'Royaume', icon: '🏰', tabs: [cityView, goalsView] },
  { id: 'g-world', title: 'Monde', icon: '🗺️', tabs: [worldView, territoriesView, factionsView] },
  { id: 'g-army', title: 'Armée', icon: '⚔️', tabs: [armyView] },
  { id: 'g-prod', title: 'Production', icon: '⛏️', tabs: [ecoReportView, stewardView, workersView, expeditionsView, chainsView] },
  { id: 'g-trade', title: 'Commerce', icon: '🚚', tabs: [marketView, convoysView] },
  { id: 'g-heroes', title: 'Héros', icon: '🧙', tabs: [heroesView, craftView] },
  { id: 'g-tech', title: 'Technologies', icon: '🔬', tabs: [researchView, talentsView] },
  { id: 'g-events', title: 'Événements', icon: '🎪', tabs: [eventView, eventShopView, calendarView, adminView] },
  { id: 'g-wheel', title: 'Roue', icon: '🎡', tabs: [wheelView, shardsView] },
  { id: 'g-guild', title: 'Guilde', icon: '🏛️', tabs: [guildView] },
  { id: 'g-chron', title: 'Chronique', icon: '📜', tabs: [journalView, historyView, statsView, treasuryView, kingdomView] },
];
export const VIEWS = GROUPS.flatMap((g) => g.tabs);
const groupOf = (viewId) => GROUPS.find((g) => g.tabs.some((t) => t.id === viewId));

export class App {
  constructor(root, state) {
    this.root = root;
    this.state = state;
    this.ui = { view: 'city', showAllRes: false, lastTab: {} };
    this.views = Object.fromEntries(VIEWS.map((v) => [v.id, v]));
    this.dirty = true;
    this.$ = (sel) => root.querySelector(sel);
  }

  start() {
    this.root.innerHTML = `
      <header id="topbar"></header>
      <nav id="nav"></nav>
      <main id="view"></main>
      <aside id="side"></aside>`;
    this.renderNav();
    this.bindEvents();
    bus.on('changed', () => { this.dirty = true; });
    bus.on('toast', ({ text, type }) => this.toast(text, type));
    const away = Date.now() - (this.state.meta.lastTick || Date.now());
    const before = { ...this.state.resources };
    const logBefore = this.state.log.length;
    advance(this.state, Date.now());
    this.render();
    if (away > 2 * 60 * 1000) this.absenceReport(away, before, logBefore);
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
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.save(); else this.tick(); });
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
    this.modal(`<h2>🔔 Notifications</h2><div class="log">${list.map((n) => `<div class="log-line small ${n.read ? 'muted' : ''}">${n.icon} ${esc(n.text)} <span class="muted">· ${new Date(n.t).toLocaleString('fr-FR')}</span></div>`).join('') || '<p class="muted">Rien pour l’instant.</p>'}</div>
      <div class="row gap"><button class="btn" data-action="goto" data-view="event">🎪 Événement</button><button class="btn" data-action="goto" data-view="calendar">📅 Calendrier</button><button class="btn ghost" data-action="close-modal">Fermer</button></div>`, {}, 'wide');
    for (const n of list) n.read = true;
  }

  tick() {
    if (!this.state) return;
    const now = Date.now();
    if (!document.hidden) this.state.meta.playTime = (this.state.meta.playTime || 0) + 1000;
    advance(this.state, now);
    this.state.meta.bootOk = true;
    this.showEventReport();
    showTip(this);
    if (this.dirty) this.render();
    else {
      this.$('#topbar').innerHTML = renderTopbar(this);
      this.updateTimers();
      this.views[this.ui.view].tick?.(this);
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

  renderNav() {
    this.$('#nav').innerHTML = GROUPS.map((g) => `<button class="nav-btn" data-action="nav" data-view="${g.id}" title="${esc(g.title)}"><span class="nav-icon">${g.icon}</span><span class="nav-label">${esc(g.title)}</span><span class="nav-badge" data-badge="${g.id}"></span></button>`).join('')
      + `<button class="nav-btn advisor-btn" data-action="advisor" title="Conseiller du royaume"><span class="nav-icon">🧙‍♂️</span><span class="nav-label">Conseiller</span></button>`;
  }

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

  render() {
    // Pendant l'animation de la Roue, seul le bandeau est rafraîchi
    if (this.ui.freezeUntil > Date.now()) { this.$('#topbar').innerHTML = renderTopbar(this); this.dirty = true; return; }
    this.dirty = false;
    const view = this.views[this.ui.view];
    const group = groupOf(view.id);
    this.ui.lastTab[group.id] = view.id;
    this.$('#topbar').innerHTML = renderTopbar(this);
    const main = this.$('#view');
    const locked = view.locked?.(this);
    const tabs = group.tabs.length > 1 ? `<div class="subnav">${group.tabs.map((t) => {
      const l = t.locked?.(this);
      const n = t.badge?.(this) || 0;
      return `<button class="subtab ${t.id === view.id ? 'active' : ''} ${l ? 'locked' : ''}" data-action="nav" data-view="${t.id}" title="${esc(l || t.title)}">${t.icon} ${esc(t.title)}${l ? ' 🔒' : ''}${n ? ` <span class="sub-badge">${n}</span>` : ''}</button>`;
    }).join('')}</div>` : '';
    this.preserveInputs(main, () => {
      main.innerHTML = `${tabs}<div class="view view-${view.id}">${locked ? `<div class="card locked-card"><h2>🔒 ${esc(view.title)}</h2><p>${esc(locked)}</p><p class="muted small">Les systèmes avancés se débloquent au fil de votre progression : ils n’encombrent pas l’interface tant que vous n’en avez pas besoin.</p></div>` : view.render(this)}</div>`;
    });
    if (!locked) view.after?.(this);
    const side = this.$('#side');
    this.preserveInputs(side, () => { side.innerHTML = renderSide(this); });
    this.root.querySelectorAll('.nav-btn').forEach((b) => b.classList.toggle('active', b.dataset.view === group.id));
    this.updateBadges();
  }

  updateBadges() {
    for (const g of GROUPS) {
      const el = this.root.querySelector(`[data-badge="${g.id}"]`);
      if (!el) continue;
      const n = g.tabs.reduce((a, t) => a + (t.locked?.(this) ? 0 : t.badge?.(this) || 0), 0);
      el.textContent = n ? n : '';
      el.classList.toggle('on', !!n);
    }
  }

  go(viewId, sel = {}) {
    const g = GROUPS.find((x) => x.id === viewId);
    if (g) viewId = this.ui.lastTab[g.id] || g.tabs[0].id;
    if (!this.views[viewId]) viewId = 'city';
    this.ui.view = viewId;
    Object.assign(this.ui, sel);
    this.render();
    this.$('#view').scrollTop = 0;
  }

  // Exécute une action de jeu ; affiche l'erreur éventuelle
  act(fn, okMsg) {
    let r;
    try { r = fn(); } catch (e) { console.error(e); this.toast('Erreur : ' + e.message, 'bad'); return null; }
    if (r && r.ok === false) {
      if (r.reason) this.toast(r.reason, 'bad');
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
        const key = `${name}|${el.dataset.id || ''}|${el.dataset.view || ''}|${el.dataset.i || ''}`;
        const now = performance.now();
        if (key === last.key && now - last.t < 350) return;
        last = { key, t: now };
      }
      const view = this.views[this.ui.view];
      const fn = (this.modalActions && this.modalActions[name]) || view.actions?.[name] || sideActions[name] || this.globalActions[name];
      if (name === 'goto' && this.modalActions) this.closeModal();
      if (fn) { ev.preventDefault?.(); fn(this, el, ev); }
    };
    document.addEventListener('click', (ev) => handle(ev, 'data-action'));
    document.addEventListener('change', (ev) => handle(ev, 'data-change'));
    document.addEventListener('input', (ev) => handle(ev, 'data-input'));
    document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') this.closeModal(); });
  }

  globalActions = {
    nav: (app, el) => app.go(el.dataset.view),
    'close-modal': (app) => app.closeModal(),
    'toggle-res': (app) => { app.ui.showAllRes = !app.ui.showAllRes; app.render(); },
    'toggle-side': (app) => { app.root.classList.toggle('show-side'); },
    advisor: (app) => openAdvisor(app),
    notifs: (app) => { app.openNotifications(); app.$('#topbar').innerHTML = renderTopbar(app); },
    goto: (app, el) => app.go(el.dataset.view, el.dataset.sel ? JSON.parse(el.dataset.sel) : {}),
  };

  modal(html, actions = {}, cls = '') {
    this.modalActions = actions;
    const root = document.getElementById('modal-root');
    root.innerHTML = `<div class="modal-backdrop" data-action="close-modal"></div><div class="modal ${cls}" role="dialog"><button class="modal-x" data-action="close-modal" aria-label="Fermer">✕</button>${html}</div>`;
    root.classList.add('open');
  }
  // Fenêtre de confirmation (actions destructrices ou irréversibles)
  confirm(html, okLabel, onOk, danger = true) {
    this.modal(`${html}<div class="row gap"><button class="btn ${danger ? 'danger' : 'primary'}" data-action="confirm-ok">${esc(okLabel)}</button><button class="btn ghost" data-action="close-modal">Annuler</button></div>`, {
      'confirm-ok': (app) => { app.closeModal(); onOk(); },
    }, 'wide');
  }

  closeModal() {
    const root = document.getElementById('modal-root');
    root.classList.remove('open');
    root.innerHTML = '';
    this.modalActions = null;
  }

  toast(text, type = 'info') {
    const box = document.getElementById('toasts');
    if (!box) return;
    const el = document.createElement('div');
    el.className = `toast toast-${type}`;
    el.textContent = text;
    box.appendChild(el);
    setTimeout(() => el.classList.add('show'), 10);
    setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 400); }, 3800);
    while (box.children.length > 5) box.firstChild.remove();
  }
}
