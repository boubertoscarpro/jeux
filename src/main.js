import { createNewState } from './core/state.js';
import { loadGame, saveGame, deserialize, CORRUPT_KEY, SAVE_KEY, BACKUP_KEY } from './core/save.js';
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
    if (state.meta.bootOk === undefined) saveGame(state);
    const app = new App(root, state);
    window.cendrelande = app; // accès console pour le débogage
    try { app.start(); } catch (e) {
      // Une sauvegarde chargée mais impossible à faire tourner ne doit pas laisser un écran vide
      console.error(e);
      clearInterval(app.timer); clearInterval(app.saveTimer);
      app.state = null;
      let backup = null;
      try { const b = localStorage.getItem(BACKUP_KEY); if (b) backup = deserialize(b); } catch { backup = null; }
      recovery({ error: `la partie ne démarre pas (${e.message})`, raw: localStorage.getItem(SAVE_KEY), backup }, start);
    }
  };
  let res = null;
  try { res = loadGame(); } catch (e) { console.error(e); res = { error: e.message }; }
  if (res?.state) start(res.state);
  else if (res?.error) recovery(res, start);
  else intro(start);
}

// Sauvegarde illisible : on ne l'écrase JAMAIS sans l'accord du joueur
function recovery(res, start) {
  const root = document.getElementById('modal-root');
  root.classList.add('open');
  const b = res.backup;
  root.innerHTML = `<div class="modal-backdrop"></div><div class="modal intro" role="dialog">
    <h2>⚠️ Sauvegarde illisible</h2>
    <p>Votre sauvegarde n’a pas pu être chargée : <b>${esc(res.error)}</b>.</p>
    <p class="small">Elle n’a pas été effacée : une copie est conservée dans le navigateur, et vous pouvez la télécharger pour la réparer ou la faire analyser.</p>
    ${b ? `<button class="btn primary big" id="rec-backup">Restaurer la copie de secours (${new Date(b.meta.lastSave || b.meta.lastTick).toLocaleString('fr-FR')})</button>` : '<p class="small muted">Aucune copie de secours disponible.</p>'}
    <div class="row gap wrap"><button class="btn" id="rec-dl">⬇️ Télécharger la sauvegarde endommagée</button><button class="btn ghost" id="rec-new">Commencer une nouvelle partie</button></div>
  </div>`;
  document.getElementById('rec-dl').onclick = () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([res.raw || ''], { type: 'application/json' }));
    a.download = `cendrelande-sauvegarde-endommagee-${Date.now()}.json`;
    a.click();
  };
  if (b) document.getElementById('rec-backup').onclick = () => { root.classList.remove('open'); root.innerHTML = ''; b.meta.restoredFromBackup = Date.now(); start(b); };
  document.getElementById('rec-new').onclick = () => {
    if (!confirm('Commencer une nouvelle partie ? La sauvegarde endommagée reste conservée dans le navigateur (clé « ' + CORRUPT_KEY + ' »), mais ne sera plus chargée.')) return;
    intro(start);
  };
}

boot();
void esc;
