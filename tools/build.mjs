// Construit dist/cendrelande.html : un fichier unique jouable en double-cliquant (sans serveur).
// Usage : npm install && npm run build
import { build } from 'esbuild';
import { readFile, writeFile, mkdir } from 'node:fs/promises';

const root = new URL('..', import.meta.url).pathname;
const result = await build({
  entryPoints: [root + 'src/main.js'],
  bundle: true,
  format: 'iife',
  minify: true,
  write: false,
  target: ['es2020'],
  legalComments: 'none',
});
const js = result.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
// Polices embarquées en données (aucune requête externe : le fichier unique fonctionne hors ligne)
let fonts = await readFile(root + 'css/fonts.css', 'utf8');
for (const m of fonts.matchAll(/url\('fonts\/([^']+)'\)/g)) fonts = fonts.replace(m[0], `url(data:font/woff2;base64,${(await readFile(root + 'css/fonts/' + m[1])).toString('base64')})`);
const css = fonts + '\n' + (await readFile(root + 'css/style.css', 'utf8')) + '\n' + (await readFile(root + 'css/theme.css', 'utf8')) + '\n' + (await readFile(root + 'css/v15.css', 'utf8')) + '\n' + (await readFile(root + 'css/v16.css', 'utf8')) + '\n' + (await readFile(root + 'css/v16b.css', 'utf8')) + '\n' + (await readFile(root + 'css/v17.css', 'utf8')) + '\n' + (await readFile(root + 'css/v18.css', 'utf8'));
let html = await readFile(root + 'index.html', 'utf8');
html = html
  .replace('<link rel="stylesheet" href="css/fonts.css">', '')
  .replace('<link rel="stylesheet" href="css/style.css">', () => `<style>${css}</style>`)
  .replace('<link rel="stylesheet" href="css/theme.css">', '')
  .replace('<link rel="stylesheet" href="css/v15.css">', '')
  .replace('<link rel="stylesheet" href="css/v16.css">', '')
  .replace('<link rel="stylesheet" href="css/v16b.css">', '')
  .replace('<link rel="stylesheet" href="css/v17.css">', '')
  .replace('<link rel="stylesheet" href="css/v18.css">', '')
  .replace('<script type="module" src="src/main.js"></script>', () => `<script>${js}</script>`);
await mkdir(root + 'dist', { recursive: true });
await writeFile(root + 'dist/cendrelande.html', html);
console.log(`dist/cendrelande.html — ${(html.length / 1024).toFixed(0)} Ko`);
