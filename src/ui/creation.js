import { sanitizeName, KINGDOM_NAME_MAX } from '../systems/identity.js';
// Écran de création : nom, spécialisation (8 cartes comparables), origine et difficulté optionnelles, confirmation.
// Affiché uniquement pour une nouvelle partie (aucune sauvegarde) ou après « Nouvelle partie » explicite.
import { KINGDOM_TYPES, ORIGINS, DIFFICULTIES, DIFFICULTY_STARS } from '../data/kingdoms.js';
import { createNewState } from '../core/state.js';
import { esc } from './components.js';
import { kingdomDef, originDef, difficultyDef } from '../systems/kingdom.js';

const DIFF_LABEL = ['', 'Accessible', 'Intermédiaire', 'Exigeant'];

// Soutien facultatif au développement : un simple lien externe. Le jeu ne contient aucun paiement, ne bloque
// aucun contenu et ne sait pas si un don a été fait.
export const SUPPORT_URL = 'https://paypal.me/Oscarwildrift';
export function supportHtml() {
  return `<aside class="support-box" aria-labelledby="support-title">
    <h3 id="support-title">Soutenez le développement de Cendrelande</h3>
    <p class="small">« Cendrelande est un projet en développement. Si vous appréciez le jeu et souhaitez soutenir son évolution, vous pouvez faire un don pour m'aider à continuer à l'améliorer et à ajouter de nouvelles fonctionnalités.</p>
    <p class="small">Chaque soutien est apprécié, mais reste entièrement facultatif. Merci de faire vivre Cendrelande ! »</p>
    <a class="btn support-btn" href="${SUPPORT_URL}" target="_blank" rel="noopener noreferrer">❤️ Soutenir le projet</a>
  </aside>`;
}

function card(key, k, sel) {
  return `<button type="button" class="kt-card ${sel ? 'sel' : ''}" data-kt="${key}" style="--kt:${k.color}" aria-pressed="${sel}">
    <div class="kt-head"><span class="kt-icon">${k.icon}</span><span class="kt-name">${esc(k.name)}</span></div>
    <div class="kt-diff" title="Difficulté">${DIFFICULTY_STARS(k.difficulty)} <span class="muted">${DIFF_LABEL[k.difficulty]}</span></div>
    <div class="kt-style small">${esc(k.style)}</div>
    <ul class="kt-list small good-list">${k.bonuses.slice(0, 2).map((b) => `<li>${esc(b)}</li>`).join('')}</ul>
    <ul class="kt-list small bad-list">${k.maluses.slice(0, 1).map((b) => `<li>${esc(b)}</li>`).join('')}</ul>
    <span class="kt-pick">${sel ? '✔ Choisi' : 'Choisir'}</span>
  </button>`;
}

export function detailHtml(k) {
  return `<div class="kt-detail" style="--kt:${k.color}">
    <h3>${k.icon} ${esc(k.name)} <span class="kt-diff small">${DIFFICULTY_STARS(k.difficulty)} ${DIFF_LABEL[k.difficulty]}</span></h3>
    <p class="story small">${esc(k.lore)}</p>
    <div class="kt-cols">
      <div><h4>Style de jeu</h4><p class="small">${esc(k.style)}</p>
        <h4>Excelle dans</h4><div class="row gap wrap">${k.excels.map((e) => `<span class="chip">${esc(e)}</span>`).join('')}</div>
        <h4>Départ</h4><p class="small">${esc(k.startText)}</p></div>
      <div><h4>✅ Bonus permanents</h4><ul class="small good-list">${k.bonuses.map((b) => `<li>${esc(b)}</li>`).join('')}</ul>
        <h4>⚠️ Malus</h4><ul class="small bad-list">${k.maluses.map((b) => `<li>${esc(b)}</li>`).join('')}</ul></div>
    </div>
    <h4>Stratégie conseillée</h4><p class="small">${esc(k.strategy)}</p>
  </div>`;
}

function optRadio(name, list, cur) {
  return Object.entries(list).map(([key, o]) => `<label class="kt-opt ${cur === key ? 'sel' : ''}"><input type="radio" name="${name}" value="${key}" ${cur === key ? 'checked' : ''}>
    <b>${o.icon} ${esc(o.name)}</b><span class="small muted">${esc(o.text)}</span></label>`).join('');
}

export function creationScreen(onStart, prev = {}) {
  const root = document.getElementById('modal-root');
  root.classList.add('open');
  const st = { name: prev.name || 'Cendrelande', seed: prev.seed || '', type: prev.type || null, origin: 'none', difficulty: 'classic', step: 'pick' };

  const render = () => {
    const k = st.type && KINGDOM_TYPES[st.type];
    if (st.step === 'confirm' && k) {
      const o = ORIGINS[st.origin], d = DIFFICULTIES[st.difficulty];
      root.innerHTML = `<div class="modal-backdrop"></div><div class="modal creation confirm" role="dialog" aria-label="Confirmation">
        <h2>Fonder ${esc(st.name)} ?</h2>
        ${detailHtml(k)}
        <p class="small"><b>Origine :</b> ${o.icon} ${esc(o.name)} — ${esc(o.text)}<br><b>Difficulté :</b> ${d.icon} ${esc(d.name)} — ${esc(d.text)}</p>
        <p class="small warn-text">⚠️ La spécialisation est définitive pour cette partie. Pour en essayer une autre, il faudra commencer une nouvelle partie (Royaume → Nouvelle partie).</p>
        <div class="row gap wrap center"><button class="btn ghost" id="intro-back">← Revenir aux choix</button><button class="btn primary big" id="intro-start">${k.icon} Prendre possession du hameau</button></div>
      </div>`;
      root.querySelector('#intro-back').onclick = () => { st.step = 'pick'; render(); };
      root.querySelector('#intro-start').onclick = () => {
        root.classList.remove('open'); root.innerHTML = '';
        onStart(createNewState({ kingdomName: st.name, seed: st.seed || undefined, kingdomType: st.type, origin: st.origin, difficulty: st.difficulty }));
      };
      return;
    }
    root.innerHTML = `<div class="modal-backdrop"></div><div class="modal creation" role="dialog" aria-label="Création du royaume">
      <div class="creation-top">
        <div class="intro-crest">🏰</div>
        <h1>Cendrelande</h1>
        <p class="story small">Il y a trois générations, <b>la Fracture</b> a brisé l’Empire de l’Aube. Vous héritez d’un hameau presque abandonné au bord d’une rivière : déblayez les ruines, nourrissez votre peuple, explorez les Terres Brisées… et bâtissez un royaume.</p>
        <div class="row gap wrap center">
          <div class="form-row"><label for="intro-name">Nom du royaume</label><input id="intro-name" value="${esc(st.name)}" maxlength="28"></div>
          <div class="form-row"><label for="intro-seed">Graine du monde (optionnel)</label><input id="intro-seed" value="${esc(st.seed)}" placeholder="aléatoire"></div>
        </div>
      </div>
      <h2>1. Choisissez la spécialisation de votre royaume</h2>
      <p class="muted small">Chaque spécialisation donne des bonus permanents réels et des malus gérables. Aucune n’est obligatoire pour réussir : choisissez celle qui correspond à votre façon de jouer.</p>
      <div class="kt-grid">${Object.entries(KINGDOM_TYPES).map(([key, t]) => card(key, t, key === st.type)).join('')}</div>
      <div id="kt-detail-box">${k ? detailHtml(k) : '<p class="muted small center">Sélectionnez une carte pour voir le détail complet.</p>'}</div>
      <details class="kt-options" ${st.optsOpen ? 'open' : ''}>
        <summary><b>2. Options (facultatif)</b> : origine et difficulté — ${ORIGINS[st.origin].icon} ${esc(ORIGINS[st.origin].name)} · ${DIFFICULTIES[st.difficulty].icon} ${esc(DIFFICULTIES[st.difficulty].name)}</summary>
        <h4>Origine</h4><div class="kt-opts">${optRadio('kt-origin', ORIGINS, st.origin)}</div>
        <h4>Difficulté</h4><div class="kt-opts">${optRadio('kt-diff', DIFFICULTIES, st.difficulty)}</div>
      </details>
      ${supportHtml()}
      <div class="creation-foot"><button class="btn primary big" id="intro-review" ${k ? '' : 'disabled'}>${k ? `Continuer avec ${k.icon} ${esc(k.name)} →` : 'Choisissez une spécialisation'}</button></div>
    </div>`;
    const keep = () => { const n = sanitizeName(root.querySelector('#intro-name').value, { max: KINGDOM_NAME_MAX }); st.name = n.ok ? n.value : 'Cendrelande'; st.seed = root.querySelector('#intro-seed').value.trim(); };
    root.querySelectorAll('[data-kt]').forEach((b) => { b.onclick = () => { keep(); st.type = b.dataset.kt; render(); root.querySelector('#kt-detail-box')?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' }); }; });
    root.querySelectorAll('input[name="kt-origin"]').forEach((i) => { i.onchange = () => { keep(); st.origin = i.value; render(); }; });
    root.querySelectorAll('input[name="kt-diff"]').forEach((i) => { i.onchange = () => { keep(); st.difficulty = i.value; render(); }; });
    const det = root.querySelector('.kt-options');
    det.ontoggle = () => { st.optsOpen = det.open; };
    root.querySelector('#intro-review').onclick = () => { keep(); if (st.type) { st.step = 'confirm'; render(); } };
  };
  render();
}

// Fiche de la spécialisation en cours (bandeau du haut, vue Royaume)
export function kingdomInfoHtml(state) {
  const k = kingdomDef(state), o = originDef(state), d = difficultyDef(state);
  const legacy = !state.kingdom?.type;
  return `${detailHtml(k)}
    <p class="small"><b>Origine :</b> ${o.icon} ${esc(o.name)} — ${esc(o.text)}<br><b>Difficulté :</b> ${d.icon} ${esc(d.name)} — ${esc(d.text)}</p>
    <p class="muted small">${legacy ? 'Cette partie a été créée avant l’arrivée des spécialisations : elle n’a ni bonus ni malus. ' : ''}La spécialisation ne peut pas changer en cours de partie (la fondation d’une dynastie la conserve). Pour en essayer une autre : Royaume → 🗑️ Nouvelle partie.</p>
    <p class="muted small">Cumul : les bonus de production s’additionnent aux autres sources (bâtiments, technologies, héros, événements) avant de multiplier la production ; les réductions de coût s’additionnent entre elles, sans jamais descendre sous 50 % du prix.</p>`;
}
export function kingdomBadge(state) {
  const k = kingdomDef(state);
  return `<button class="kingdom-badge" data-action="kingdom-info" style="--kt:${k.color}" title="${esc(k.name)} — voir les bonus et malus">${k.icon} ${esc(k.name.replace(/^Royaume (des |de )?/, ''))}</button>`;
}
