import { AUTOMATION_LEVELS, ORDER_CONDITIONS, ORDER_ACTIONS, ORDER_TEMPLATES } from '../../data/automation.js';
import { WORK_SECTORS } from '../../data/workers.js';
import { RESOURCES, RES_ORDER } from '../../data/resources.js';
import { UNITS } from '../../data/units.js';
import { BUILDINGS } from '../../data/buildings.js';
import { SEASONS } from '../../data/seasons.js';
import { fmt } from '../../core/util.js';
import { automationLevel, unlockAutomation, orderSlots, addOrder, removeOrder, toggleOrder, moveOrder, describeOrder, RESEARCH_FOCUS, SECTOR_RES, hasUnlock } from '../../systems/automation.js';
import { thLevel } from '../../systems/city.js';
import { esc, costList } from '../components.js';

const CHAIN_BUILDINGS = ['mill', 'bakery', 'charcoal', 'foundry', 'tannery', 'weaver', 'carpentry', 'armory', 'quartermaster'];
const opt = (pairs, sel) => pairs.map(([v, l]) => `<option value="${v}" ${String(v) === String(sel) ? 'selected' : ''}>${esc(l)}</option>`).join('');
const resOpts = (sel) => opt(RES_ORDER.map((r) => [r, `${RESOURCES[r].icon} ${RESOURCES[r].name}`]), sel);

function paramField(name, draft, prefix) {
  const v = draft[name] ?? '';
  const id = `${prefix}-${name}`;
  switch (name) {
    case 'res': return `<select id="${id}" data-change="od-field" data-k="${prefix}.${name}">${resOpts(v || 'food')}</select>`;
    case 'sector': return `<select id="${id}" data-change="od-field" data-k="${prefix}.${name}">${opt(Object.entries(WORK_SECTORS).map(([k, s]) => [k, `${s.icon} ${s.name}`]), v || 'food')}</select>`;
    case 'unit': return `<select id="${id}" data-change="od-field" data-k="${prefix}.${name}">${opt(Object.entries(UNITS).map(([k, u]) => [k, `${u.icon} ${u.name}`]), v || 'spearman')}</select>`;
    case 'building': return `<select id="${id}" data-change="od-field" data-k="${prefix}.${name}">${opt(CHAIN_BUILDINGS.map((b) => [b, `${BUILDINGS[b].icon} ${BUILDINGS[b].name}`]), v || 'foundry')}</select>`;
    case 'season': return `<select id="${id}" data-change="od-field" data-k="${prefix}.${name}">${opt(SEASONS.map((s) => [s.key, `${s.icon} ${s.name}`]), v || 'winter')}</select>`;
    default: return `<input id="${id}" type="number" min="0" value="${v || (name === 'minutes' ? 30 : name === 'count' ? 5 : 1000)}" data-change="od-field" data-k="${prefix}.${name}" class="qty">`;
  }
}

function orderBuilder(app) {
  const d = (app.ui.orderDraft ||= { name: 'Nouvel ordre', cond: { type: 'resBelow', res: 'food', value: 2000 }, action: { type: 'assign', sector: 'food', count: 3 }, cooldown: 10 });
  const lvl = automationLevel(app.state);
  const cdef = ORDER_CONDITIONS[d.cond.type], adef = ORDER_ACTIONS[d.action.type];
  return `<div class="order-builder">
    <div class="form-row"><label>Nom</label><input id="od-name" value="${esc(d.name)}" data-change="od-field" data-k="name"></div>
    <div class="rule-line"><b class="kw">SI</b>
      <select data-change="od-ctype">${opt(Object.entries(ORDER_CONDITIONS).filter(([, c]) => !c.min || c.min <= lvl).map(([k, c]) => [k, c.label.replace(/^SI |^TOUTES LES N minutes/, (m) => (m.startsWith('SI') ? '' : 'Toutes les N minutes'))]), d.cond.type)}</select>
      ${cdef.params.map((p) => paramField(p, d.cond, 'cond')).join(' ')}</div>
    <div class="rule-line"><b class="kw">ALORS</b>
      <select data-change="od-atype">${opt(Object.entries(ORDER_ACTIONS).filter(([, a]) => a.min <= lvl).map(([k, a]) => [k, a.label]), d.action.type)}</select>
      ${adef.params.map((p) => paramField(p, d.action, 'action')).join(' ')}</div>
    <div class="form-row"><label>Délai minimal entre deux exécutions</label><input id="od-cd" type="number" min="0" value="${d.cooldown}" data-change="od-field" data-k="cooldown" class="qty"> min</div>
    <div class="muted small">Aperçu : <b>${esc(describeOrder(d))}</b></div>
    <button class="btn primary" data-action="order-add">Ajouter l’ordre</button>
  </div>`;
}

export default {
  id: 'steward', title: 'Intendance', icon: '🧾',
  badge: (app) => { const n = AUTOMATION_LEVELS[automationLevel(app.state) + 1]; return n && thLevel(app.state) >= n.th ? 1 : 0; },
  render(app) {
    const s = app.state;
    const lvl = automationLevel(s);
    const slots = orderSlots(s);
    const p = s.priorities;
    return `<div class="card"><h2>🧾 Intendance du royaume <span class="muted small">palier ${lvl}/7</span></h2>
      <p class="muted small">L’automatisation se mérite : chaque palier délègue une part du travail répétitif à vos gens. Les décisions stratégiques — guerres, diplomatie, grandes expéditions, choix technologiques — restent les vôtres.</p>
      <div class="auto-ladder">${AUTOMATION_LEVELS.map((L) => {
        const done = L.lvl <= lvl, next = L.lvl === lvl + 1;
        return `<div class="auto-step ${done ? 'done' : ''} ${next ? 'next' : ''}"><div class="auto-icon">${done ? '✅' : L.icon}</div><div><b>${L.lvl}. ${esc(L.name)}</b><div class="small muted">${esc(L.desc)}</div>
          ${next ? `<div class="b-opt-foot">${costList(L.cost, s)} <span class="small ${thLevel(s) >= L.th ? 'ok' : 'req'}">HdV ${L.th}</span><button class="mini primary" data-action="auto-unlock">Débloquer</button></div>` : ''}</div></div>`;
      }).join('')}</div></div>

      <div class="cols-2">
      <div class="card"><h2>📋 Priorités ${lvl < 4 ? '<span class="muted small">🔒 palier 4</span>' : ''}</h2>
        <p class="muted small">« Voici ce qui est important pour moi. » Toutes les 5 min, l’intendant réaffecte les ouvriers : sous le <b>minimum</b>, il renforce le secteur ; au-dessus du <b>maximum</b>, il libère ses ouvriers vers le secteur suivant.</p>
        ${lvl >= 4 ? `<label class="small"><input type="checkbox" data-change="prio-toggle" ${p.enabled ? 'checked' : ''}> Activer la gestion par priorités</label>
        <table class="prio"><thead><tr><th>#</th><th>Secteur</th><th>Stock</th><th>Min</th><th>Max</th><th></th></tr></thead><tbody>
        ${p.order.map((sec, i) => { const r = SECTOR_RES[sec]; const th = p.thresholds[sec] || {}; return `<tr><td>${i + 1}</td><td>${WORK_SECTORS[sec].icon} ${WORK_SECTORS[sec].name}</td><td class="num">${RESOURCES[r].icon} ${fmt(s.resources[r] || 0)}</td>
          <td><input class="qty" type="number" min="0" value="${th.min || 0}" data-change="prio-th" data-sec="${sec}" data-k="min"></td><td><input class="qty" type="number" min="0" value="${th.max || 0}" data-change="prio-th" data-sec="${sec}" data-k="max"></td>
          <td><button class="mini ghost" data-action="prio-move" data-i="${i}" data-d="-1">▲</button><button class="mini ghost" data-action="prio-move" data-i="${i}" data-d="1">▼</button></td></tr>`; }).join('')}</tbody></table>
        ${p.lastMoves ? `<div class="small muted">Dernières réaffectations : ${esc(p.lastMoves.moves.join(' ; '))}</div>` : ''}` : '<p class="req">Débloquez le palier « Gestionnaire ».</p>'}
      </div>
      <div class="card"><h2>🔬 Recherche automatique ${lvl < 5 ? '<span class="muted small">🔒 palier 5</span>' : ''}</h2>
        <p class="muted small">Donnez une mission permanente à vos chercheurs : dès que la bibliothèque est libre, ils lancent la technologie la plus utile à cet objectif.</p>
        ${lvl >= 5 ? `<label class="small"><input type="checkbox" data-change="ar-toggle" ${s.autoResearch.enabled ? 'checked' : ''}> Activer</label>
          <div class="form-row"><label>Mission</label><select data-change="ar-focus">${opt(Object.entries(RESEARCH_FOCUS).map(([k, f]) => [k, f.name]), s.autoResearch.focus)}</select></div>` : '<p class="req">Débloquez le palier « Intendant ».</p>'}
        <h2>🛠️ Réparations & défense ${lvl < 7 ? '<span class="muted small">🔒 palier 7</span>' : ''}</h2>
        ${hasUnlock(s, 'autoRepair') ? `<label class="small"><input type="checkbox" data-change="auto-repair" ${s.automation.autoRepair ? 'checked' : ''}> Réparer automatiquement les bâtiments endommagés</label>` : '<p class="muted small">Au palier 7, vos conseillers réparent les bâtiments et rappellent les troupes en cas de raid.</p>'}
      </div></div>

      <div class="card"><h2>📜 Ordres du royaume <span class="muted small">${s.orders.length}/${slots} ordres</span></h2>
        <p class="muted small">Programmez votre royaume sans écrire une ligne de code : <b>SI</b> une condition est vraie <b>ALORS</b> une action s’exécute. Les ordres sont évalués chaque minute, même pendant votre absence, dans l’ordre de la liste.</p>
        ${lvl < 4 ? '<p class="req">Les Ordres du royaume se débloquent au palier 4 (Gestionnaire).</p>' : `
        <div class="orders">${s.orders.map((o, i) => `<div class="order ${o.enabled ? '' : 'off'} ${i >= slots ? 'over' : ''}">
          <div class="order-main"><b>${esc(o.name)}</b><div class="small">${esc(describeOrder(o))}</div><div class="small muted">Exécuté ${o.runs} fois${o.lastMsg ? ` · ${esc(o.lastMsg)}` : ''}</div></div>
          <div class="order-ctl"><button class="mini ghost" data-action="order-move" data-id="${o.id}" data-d="-1">▲</button><button class="mini ghost" data-action="order-move" data-id="${o.id}" data-d="1">▼</button>
          <button class="mini ${o.enabled ? 'good' : ''}" data-action="order-toggle" data-id="${o.id}">${o.enabled ? 'Actif' : 'Inactif'}</button><button class="mini ghost danger" data-action="order-del" data-id="${o.id}">✕</button></div></div>`).join('') || '<div class="muted small">Aucun ordre. Partez d’un modèle ci-dessous ou composez le vôtre.</div>'}</div>
        <h4>Modèles</h4><div class="row gap wrap">${ORDER_TEMPLATES.map((t, i) => `<button class="mini" data-action="order-tpl" data-i="${i}" ${ORDER_ACTIONS[t.action.type].min > lvl || (ORDER_CONDITIONS[t.cond.type].min || 0) > lvl ? 'disabled' : ''}>${esc(t.name)}</button>`).join('')}</div>
        <h4>Composer un ordre</h4>${orderBuilder(app)}
        ${s.orderLog?.length ? `<h4>Journal des ordres</h4><div class="log small">${s.orderLog.slice(0, 12).map((l) => `<div class="log-line">${new Date(l.t).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })} — <b>${esc(l.name)}</b> : ${esc(l.msg)}</div>`).join('')}</div>` : ''}`}
      </div>`;
  },
  actions: {
    'auto-unlock': (app) => app.act(() => unlockAutomation(app.state), (r) => `Intendance : « ${r.level.name} » débloquée !`),
    'prio-toggle': (app, el) => { app.state.priorities.enabled = el.checked; app.render(); },
    'prio-th': (app, el) => { const t = (app.state.priorities.thresholds[el.dataset.sec] ||= {}); t[el.dataset.k] = Math.max(0, +el.value || 0); },
    'prio-move': (app, el) => { const o = app.state.priorities.order, i = +el.dataset.i, j = i + +el.dataset.d; if (j < 0 || j >= o.length) return; [o[i], o[j]] = [o[j], o[i]]; app.render(); },
    'ar-toggle': (app, el) => { app.state.autoResearch.enabled = el.checked; app.render(); },
    'ar-focus': (app, el) => { app.state.autoResearch.focus = el.value; },
    'auto-repair': (app, el) => { app.state.automation.autoRepair = el.checked; },
    'od-ctype': (app, el) => { app.ui.orderDraft.cond = { type: el.value }; app.render(); },
    'od-atype': (app, el) => { app.ui.orderDraft.action = { type: el.value }; app.render(); },
    'od-field': (app, el) => {
      const d = app.ui.orderDraft;
      const [a, b] = el.dataset.k.split('.');
      const v = el.type === 'number' ? +el.value : el.value;
      if (b) d[a][b] = v; else d[a] = v;
      app.render();
    },
    'order-add': (app) => {
      const d = JSON.parse(JSON.stringify(app.ui.orderDraft));
      // Valeurs par défaut des paramètres non modifiés
      for (const [part, def] of [['cond', ORDER_CONDITIONS[d.cond.type]], ['action', ORDER_ACTIONS[d.action.type]]]) {
        for (const p of def.params) if (d[part][p] === undefined) d[part][p] = { res: 'food', sector: 'food', unit: 'spearman', building: 'foundry', season: 'winter', minutes: 30, count: 5, value: 1000 }[p];
      }
      app.act(() => addOrder(app.state, d), 'Ordre ajouté');
    },
    'order-tpl': (app, el) => app.act(() => addOrder(app.state, { ...ORDER_TEMPLATES[+el.dataset.i], cooldown: 10 }), 'Ordre ajouté'),
    'order-toggle': (app, el) => app.act(() => toggleOrder(app.state, el.dataset.id)),
    'order-del': (app, el) => app.act(() => removeOrder(app.state, el.dataset.id)),
    'order-move': (app, el) => app.act(() => moveOrder(app.state, el.dataset.id, +el.dataset.d)),
  },
};
