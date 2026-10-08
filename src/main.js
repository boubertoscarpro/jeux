import { createNewState } from './core/state.js';
import { loadGame, saveGame } from './core/save.js';
import { App } from './ui/app.js';
import { esc } from './ui/components.js';

function intro(onStart) {
  const root = document.getElementById('modal-root');
  root.classList.add('open');
  root.innerHTML = `<div class="modal-backdrop"></div><div class="modal intro" role="dialog">
    <div class="intro-crest">🏰</div>
    <h1>Cendrelande</h1>
    <p class="story">Il y a trois générations, <b>la Fracture</b> a brisé l’Empire de l’Aube. Des cristaux sont tombés du ciel, les forêts se sont ensauvagées, les mines se sont peuplées de créatures.</p>
    <p class="story">Vous héritez d’un hameau presque abandonné au bord d’une rivière. Déblayez les ruines, nourrissez votre peuple, explorez les Terres Brisées… et bâtissez un royaume.</p>
    <div class="form-row"><label for="intro-name">Nom de votre royaume</label><input id="intro-name" value="Cendrelande" maxlength="28"></div>
    <div class="form-row"><label for="intro-seed">Graine du monde (optionnel)</label><input id="intro-seed" placeholder="aléatoire"></div>
    <button class="btn primary big" id="intro-start">Prendre possession du hameau</button>
  </div>`;
  document.getElementById('intro-start').addEventListener('click', () => {
    const name = document.getElementById('intro-name').value.trim() || 'Cendrelande';
    const seed = document.getElementById('intro-seed').value.trim();
    root.classList.remove('open');
    root.innerHTML = '';
    onStart(createNewState({ kingdomName: name, seed: seed || undefined }));
  });
}

function boot() {
  const root = document.getElementById('app');
  const start = (state) => {
    saveGame(state);
    const app = new App(root, state);
    window.cendrelande = app; // accès console pour le débogage
    app.start();
  };
  let state = null;
  try { state = loadGame(); } catch (e) { console.error(e); }
  if (state) start(state);
  else intro(start);
}

boot();
void esc;
