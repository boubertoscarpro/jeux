import { bus } from '../core/bus.js';
import { advance } from '../core/engine.js';
import { saveGame } from '../core/save.js';
import { fmtTime } from '../core/util.js';
import { renderTopbar, renderSide, sideActions } from './hud.js';
import { esc } from './components.js';
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

export const VIEWS = [cityView, worldView, heroesView, armyView, craftView, researchView, marketView, guildView, journalView, kingdomView];

export class App {
  constructor(root, state) {
    this.root = root;
    this.state = state;
    this.ui = { view: 'city', showAllRes: false };
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
    advance(this.state, Date.now());
    this.render();
    this.timer = setInterval(() => this.tick(), 1000);
    this.saveTimer = setInterval(() => this.save(), 15000);
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.save(); else this.tick(); });
    window.addEventListener('beforeunload', () => this.save());
  }

  save() { if (this.state) saveGame(this.state); }

  tick() {
    const now = Date.now();
    advance(this.state, now);
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
    this.$('#nav').innerHTML = VIEWS.map((v) => `<button class="nav-btn ${v.id === this.ui.view ? 'active' : ''}" data-action="nav" data-view="${v.id}" title="${esc(v.title)}"><span class="nav-icon">${v.icon}</span><span class="nav-label">${esc(v.title)}</span><span class="nav-badge" data-badge="${v.id}"></span></button>`).join('');
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
    this.dirty = false;
    const view = this.views[this.ui.view];
    this.$('#topbar').innerHTML = renderTopbar(this);
    const main = this.$('#view');
    this.preserveInputs(main, () => { main.innerHTML = `<div class="view view-${view.id}">${view.render(this)}</div>`; });
    view.after?.(this);
    const side = this.$('#side');
    this.preserveInputs(side, () => { side.innerHTML = renderSide(this); });
    this.root.querySelectorAll('.nav-btn').forEach((b) => b.classList.toggle('active', b.dataset.view === this.ui.view));
    this.updateBadges();
  }

  updateBadges() {
    for (const v of VIEWS) {
      const el = this.root.querySelector(`[data-badge="${v.id}"]`);
      if (!el) continue;
      const n = v.badge?.(this) || 0;
      el.textContent = n ? n : '';
      el.classList.toggle('on', !!n);
    }
  }

  go(viewId, sel = {}) {
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
    const handle = (ev, attr) => {
      const el = ev.target.closest(`[${attr}]`);
      if (!el || !this.root.contains(el) && !document.getElementById('modal-root').contains(el)) return;
      const name = el.getAttribute(attr);
      const view = this.views[this.ui.view];
      const fn = (this.modalActions && this.modalActions[name]) || view.actions?.[name] || sideActions[name] || this.globalActions[name];
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
    goto: (app, el) => app.go(el.dataset.view, el.dataset.sel ? JSON.parse(el.dataset.sel) : {}),
  };

  modal(html, actions = {}, cls = '') {
    this.modalActions = actions;
    const root = document.getElementById('modal-root');
    root.innerHTML = `<div class="modal-backdrop" data-action="close-modal"></div><div class="modal ${cls}" role="dialog"><button class="modal-x" data-action="close-modal" aria-label="Fermer">✕</button>${html}</div>`;
    root.classList.add('open');
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
