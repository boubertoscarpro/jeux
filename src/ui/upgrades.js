// Liste des améliorations possibles (compteur de la barre du haut et de la carte du royaume) et fenêtres de
// renommage (château principal, avant-postes). Toute la logique (règles, validation) vit dans systems/.
import { fmtTime } from '../core/util.js';
import { computeMods } from '../systems/modifiers.js';
import { upgradeSummary, startUpgrade, planConstruction } from '../systems/construction.js';
import { outpostUpgradeCheck, upgradeOutpost } from '../systems/territory.js';
import { castleName, renameCastle, renameOutpost, defaultCastleName, findOutpost, defaultOutpostName, NAME_MAX } from '../systems/identity.js';
import { buildingIcon, ensureArtDefs } from './art.js';
import { esc, costList } from './components.js';

const STATUS = { ready: 'Possible maintenant', queue: 'File pleine (planifiable)', lack: 'Ressources insuffisantes', locked: 'Prérequis manquant' };

// Nombre d'améliorations réalisables à l'instant (bâtiments, fortifications et avant-postes)
export function upgradeCount(state, mods = computeMods(state)) {
  let n = upgradeSummary(state, mods).count;
  for (const k of Object.keys(state.territories || {})) if (outpostUpgradeCheck(state, k).status === 'ready') n++;
  return n;
}

export function openUpgradeList(app) {
  ensureArtDefs();
  const s = app.state;
  const mods = computeMods(s);
  const sum = upgradeSummary(s, mods);
  const order = { ready: 0, queue: 1, lack: 2, locked: 3 };
  const list = sum.list.filter((u) => order[u.status] !== undefined).sort((a, b) => order[a.status] - order[b.status] || a.level - b.level);
  const ops = Object.entries(s.territories || {}).map(([k, t]) => ({ k, t, u: outpostUpgradeCheck(s, k) })).filter((o) => order[o.u.status] !== undefined);
  const row = (u) => `<div class="up-row ${u.status}">
      <span class="up-ic">${u.fort ? `<span class="b-icon">${u.icon}</span>` : buildingIcon(u.type, 34)}</span>
      <div class="up-main"><b>${esc(u.name)}</b> <span class="muted small">niv. ${u.level} → ${u.next}</span>
        <div class="small">${costList(u.cost, s)} <span class="muted">⏱ ${fmtTime(u.time)}</span></div>
        ${u.status !== 'ready' ? `<div class="small req">${esc(u.reasons[0] || STATUS[u.status])}</div>` : ''}</div>
      <div class="up-act">${u.status === 'ready' ? `<button class="mini primary" data-action="ul-up" data-id="${esc(u.bid)}">⬆ Améliorer</button>` : u.status === 'queue' ? `<button class="mini" data-action="ul-plan" data-id="${esc(u.bid)}">🗓️ Planifier</button>` : ''}
        ${u.fort ? '' : `<button class="mini ghost" data-action="ul-see" data-x="${u.x}" data-y="${u.y}">Voir</button>`}</div></div>`;
  const opRow = ({ k, t, u }) => `<div class="up-row ${u.status}"><span class="up-ic">🚩</span>
      <div class="up-main"><b>${esc(t.name)}</b> <span class="muted small">avant-poste niv. ${u.level}${u.next ? ` → ${u.next}` : ''}</span>
        ${u.cost ? `<div class="small">${costList(u.cost, s)}</div>` : ''}${u.status !== 'ready' ? `<div class="small req">${esc(u.reasons[0] || '')}</div>` : ''}</div>
      <div class="up-act">${u.status === 'ready' ? `<button class="mini primary" data-action="ul-op" data-k="${esc(k)}">⬆ Améliorer</button>` : ''}<button class="mini ghost" data-action="goto" data-view="territories">Fiche</button></div></div>`;
  const ready = list.filter((u) => u.status === 'ready').length + ops.filter((o) => o.u.status === 'ready').length;
  app.modal(`<h2>⬆ Améliorations du royaume</h2>
    <p class="small muted">${ready} amélioration(s) réalisable(s) maintenant. Les autres sont listées avec la raison qui les bloque. Seules les améliorations vraiment possibles affichent l’icône verte sur la carte.</p>
    <div class="up-list">${list.map(row).join('') || '<p class="muted small">Aucun bâtiment à améliorer pour l’instant.</p>'}</div>
    ${ops.length ? `<h4>Avant-postes</h4><div class="up-list">${ops.map(opRow).join('')}</div>` : ''}
    <div class="row gap"><button class="btn ghost" data-action="close-modal">Fermer</button></div>`, {
    'ul-up': (a, el) => { a.act(() => startUpgrade(a.state, el.dataset.id), 'Amélioration lancée'); openUpgradeList(a); },
    'ul-plan': (a, el) => { a.act(() => planConstruction(a.state, { kind: 'upgrade', bid: el.dataset.id }), 'Amélioration planifiée'); openUpgradeList(a); },
    'ul-op': (a, el) => { a.act(() => upgradeOutpost(a.state, el.dataset.k), 'Avant-poste amélioré'); openUpgradeList(a); },
    'ul-see': (a, el) => {
      a.closeModal();
      const x = +el.dataset.x, y = +el.dataset.y;
      a.ui.citySel = { x, y }; a.ui.focusUpgrade = true;
      (a.ui.cityCam ||= { x: 0, y: 0, z: 1, init: false }).centerOn = { x, y };
      a.go('city');
    },
  }, 'wide');
}

// Fenêtre de saisie d'un nom (validation identique à celle des systèmes, rappelée à l'écran)
function nameDialog(app, { title, intro, current, suggestion, onSave }) {
  app.modal(`<h2>${esc(title)}</h2><p class="small muted">${esc(intro)}</p>
    <div class="form-row"><input id="rename-input" maxlength="${NAME_MAX}" value="${esc(current)}" aria-label="Nouveau nom" autocomplete="off" spellcheck="false" style="width:100%"></div>
    <div class="small muted">2 à ${NAME_MAX} caractères. Les espaces superflus et les caractères spéciaux (&lt; &gt; …) sont retirés.</div>
    <div class="req small" id="rename-err"></div>
    <div class="row gap wrap"><button class="btn primary" data-action="rn-save">Valider</button>${suggestion ? `<button class="btn ghost" data-action="rn-default">Proposer : ${esc(suggestion)}</button>` : ''}<button class="btn ghost" data-action="close-modal">Annuler</button></div>`, {
    'rn-save': (a) => {
      const v = document.getElementById('rename-input').value;
      const r = onSave(v);
      if (!r.ok) { document.getElementById('rename-err').textContent = r.reason || 'Nom invalide'; return; }
      a.closeModal(); a.toast(`✎ Nouveau nom : ${r.name}`, 'good'); a.render(); a.save();
    },
    'rn-default': () => { document.getElementById('rename-input').value = suggestion; },
  });
  const input = document.getElementById('rename-input');
  input?.focus(); input?.select();
  input?.addEventListener('keydown', (e) => { if (e.key === 'Enter') document.querySelector('[data-action="rn-save"]')?.click(); });
}

export function openRenameCastle(app) {
  const s = app.state;
  nameDialog(app, {
    title: '🏰 Nommer le château principal',
    intro: `Le nom de votre château apparaît sur la carte du royaume, sur la carte du monde, dans les rapports et les événements. Vous pourrez le changer à tout moment.`,
    current: castleName(s), suggestion: defaultCastleName(s.meta.kingdomName) !== castleName(s) ? defaultCastleName(s.meta.kingdomName) : null,
    onSave: (v) => renameCastle(s, v),
  });
}

export function openRenameOutpost(app, ref) {
  const s = app.state;
  const f = findOutpost(s, ref);
  if (!f) return app.toast('Avant-poste introuvable', 'bad');
  const sug = defaultOutpostName(s, { ...f.t, name: null });
  nameDialog(app, {
    title: '🚩 Renommer l’avant-poste',
    intro: `Avant-poste en (${f.t.x}, ${f.t.y}). Chaque avant-poste porte son propre nom, visible sur la carte du monde, dans sa fiche et dans les rapports d’exploration, de défense et de combat.`,
    current: f.t.name, suggestion: sug !== f.t.name ? sug : null,
    onSave: (v) => renameOutpost(s, ref, v),
  });
}

