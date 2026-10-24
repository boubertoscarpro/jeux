// v22 « Sceaux et Livre des quêtes » : chaque symbole du jeu a son sceau dessiné (aucun emoji affiché), les textes sans
// emoji, et le guide « Montre-moi » sait accompagner chaque quête du parcours (étapes déduites, cibles, conditions).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { createNewState } from '../src/core/state.js';
import { SIGILS, EMOJI_RE, sigilKey, sigilSvg, stripEmoji, hasEmoji, sigilizeHtml } from '../src/ui/sigils.js';
import { questKind, guideSteps, buildingInText } from '../src/ui/questGuide.js';
import { MISSIONS } from '../src/systems/campaign.js';
import { bookEntries } from '../src/ui/views/questbook.js';

const root = new URL('..', import.meta.url).pathname;
const walk = (d) => readdirSync(d).flatMap((f) => { const p = d + '/' + f; return statSync(p).isDirectory() ? walk(p) : /\.(js|css|html)$/.test(f) ? [p] : []; });

test('Sceaux : chaque symbole présent dans le code a son sceau dessiné', () => {
  const missing = new Set();
  for (const f of walk(root + 'src')) {
    if (f.endsWith('sigils.js')) continue;
    for (const m of readFileSync(f, 'utf8').matchAll(EMOJI_RE)) if (!SIGILS[sigilKey(m[0])]) missing.add(m[0]);
  }
  assert.deepEqual([...missing], []);
  assert.ok(Object.keys(SIGILS).length >= 200, `${Object.keys(SIGILS).length} sceaux`);
});
test('Sceaux : les feuilles de style et la page n’affichent aucun emoji', () => {
  const re = /\p{Extended_Pictographic}/u;
  for (const f of [...readdirSync(root + 'css').filter((x) => x.endsWith('.css')).map((x) => root + 'css/' + x), root + 'index.html']) {
    const bad = readFileSync(f, 'utf8').split('\n').filter((l) => re.test(l));
    assert.deepEqual(bad, [], f);
  }
});
test('Sceaux : rendu SVG, texte nettoyé, séquences liées et pastilles colorées', () => {
  assert.match(sigilSvg('⚔️'), /<svg[^>]*viewBox="0 0 24 24"/);
  assert.match(sigilSvg('🪵'), /#r-wood/, 'les ressources gardent leur icône en couleur');
  assert.equal(sigilKey('🧙‍♂️'), 'mage');
  assert.equal(sigilKey('🏴‍☠️'), 'pirate');
  assert.match(sigilSvg('🟢'), /#5fae5a/);
  assert.equal(stripEmoji('🏰 Château  de 🌾 blé'), 'Château de blé');
  assert.equal(hasEmoji('Rien ici'), false);
  const html = sigilizeHtml('Butin : 120 🪙 et 🔥');
  assert.ok(!hasEmoji(html) && (html.match(/<svg/g) || []).length === 2);
});

test('Livre des quêtes : chaque mission du parcours a un guide (« Montre-moi ») ou un écran où agir', () => {
  const none = [];
  for (const m of Object.values(MISSIONS)) { const k = questKind(m); if (k.kind === 'none') none.push(m.id); }
  assert.deepEqual(none, []);
  // Les grandes familles sont bien reconnues
  assert.deepEqual(questKind(MISSIONS.q_saw), { kind: 'build', type: 'sawmill' });
  assert.equal(questKind(MISSIONS.q_th2).kind, 'upgrade');
  assert.equal(questKind(MISSIONS.q_th2).type, 'townhall');
  assert.equal(questKind(MISSIONS.q_clear).kind, 'clear');
  assert.equal(questKind(MISSIONS.q_explore).op, 'explore');
  assert.equal(questKind(MISSIONS.q_gather).op, 'gather');
  assert.equal(questKind(MISSIONS.q_battle).op, 'attack');
  assert.equal(questKind(MISSIONS.q_army).kind, 'train');
  assert.equal(buildingInText('Améliorez l’Hôtel de ville au niveau 2'), 'townhall');
});
test('Livre des quêtes : étapes du guide pour construire, améliorer, déblayer (cible et condition à chaque étape)', () => {
  const s = createNewState({ seed: 'v22', now: Date.UTC(2026, 9, 24, 8) });
  const app = { state: s, ui: { map: 'city' }, views: {}, render() {}, closeWin() {}, go() {}, mapDirty: false };
  for (const id of ['q_saw', 'q_th2', 'q_clear']) {
    const plan = guideSteps(app, MISSIONS[id]);
    assert.ok(plan.steps.length >= 2, `${id} : ${plan.steps.length} étapes`);
    for (const st of plan.steps) { assert.equal(typeof st.text, 'string'); assert.equal(typeof st.done, 'function'); assert.equal(typeof st.target, 'function'); }
    assert.equal(plan.finished(), false, `${id} pas encore fait`);
  }
  // Construire : l'étape « panneau Construire » est franchie dès que le panneau est ouvert
  const b = guideSteps(app, MISSIONS.q_saw);
  assert.equal(b.steps[0].done(), false);
  app.ui.buildMode = true;
  assert.equal(b.steps[0].done(), true);
  app.ui.placeType = 'sawmill';
  assert.equal(b.steps.findIndex((st) => !st.done()), b.steps.length - 1, 'il ne reste qu’à poser le bâtiment');
});
test('Livre des quêtes : toutes les quêtes réunies (histoire, annexes, ordres du jour, chroniques, missions, grands desseins)', () => {
  const s = createNewState({ seed: 'v22b', now: Date.UTC(2026, 9, 24, 8) });
  const { list } = bookEntries(s);
  assert.ok(list.some((e) => e.cat === 'story') && list.some((e) => e.cat === 'royal') && list.some((e) => e.cat === 'grand'));
  for (const e of list) { assert.ok(e.uid && e.title, 'chaque entrée a un identifiant et un titre'); if (e.claim) assert.match(e.claim, /data-action="[a-z-]+"/); }
});
