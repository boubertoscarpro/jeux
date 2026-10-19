// v17 « Clair comme le jour » : contrastes WCAG AA mesurés sur toutes les feuilles du jeu (cascade comprise), dans
// chaque mode de couleurs (normal, contraste élevé, trois modes pour daltoniens), et sur les étiquettes dessinées
// sur les cartes (texte SVG du château, étiquettes du canevas du monde, marques du royaume).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { audit, gameCss, ratio, parseHex, blend } from '../tools/contrast.mjs';
import { MAP_PALETTES } from '../src/data/a11y.js';

const css = gameCss(new URL('..', import.meta.url).pathname);

for (const mode of [null, 'hc', 'cb-deut', 'cb-prot', 'cb-trit']) {
  test(`Contrastes : aucune couleur de texte sous WCAG AA (mode ${mode || 'normal'})`, () => {
    const res = audit(css, { mode });
    assert.ok(res.length > 200, `couleurs de texte trouvées : ${res.length}`);
    const bad = res.filter((r) => !r.ok);
    assert.deepEqual(bad.map((b) => `${b.ratio}:1 < ${b.need} ${b.color} ${b.sel}`), []);
  });
}

test('Contrastes : étiquettes et marques des cartes (texte 4,5:1, pictogrammes utiles 3:1)', () => {
  const H = (h) => parseHex(h);
  const over = (fg, bg) => (fg.a < 1 ? blend(fg, bg) : fg);
  const map = H('#5d7a3c'); // pré du royaume, la teinte la plus claire sous les étiquettes
  const pairs = [
    ['Nom de bâtiment', '#f6ecd2', over(H('rgba(20,16,10,0.82)'), map), 4.5],
    ['Écusson de niveau', '#f6e7bd', H('#2b2118'), 4.5],
    ['Signal (texte)', '#1d1812', H('#fff6dc'), 4.5],
    ['Signal : pastille claire sur le pré', '#fff6dc', map, 3],
    ['Signal danger : bord sur la pastille', '#a5261b', H('#ffe1da'), 3],
    ['Signal amélioration : bord', '#1f6b3c', H('#fff6dc'), 3],
    ['Étiquette de zone (contour sombre)', '#fff6dc', H('#140e08'), 4.5],
    ['Plaque « Enceinte projetée »', '#fff3d6', over(H('rgba(36,28,20,0.9)'), map), 4.5],
    ['Étiquette du monde', '#f3e6c4', H('#1b1610'), 4.5],
  ];
  for (const [name, fg, bg, need] of pairs) assert.ok(ratio(H(fg), bg) >= need, `${name} : ${ratio(H(fg), bg).toFixed(2)}:1`);
  // Couleurs de sens des cartes, dans chaque mode : lisibles comme pictogrammes (3:1) sur le fond sombre des panneaux
  for (const [mode, p] of Object.entries(MAP_PALETTES)) for (const k of ['good', 'bad', 'warn', 'info']) assert.ok(ratio(H(p[k]), H('#16130f')) >= 3, `${mode}.${k}`);
});
