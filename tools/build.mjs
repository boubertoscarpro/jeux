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
const css = await readFile(root + 'css/style.css', 'utf8');
let html = await readFile(root + 'index.html', 'utf8');
html = html
  .replace('<link rel="stylesheet" href="css/style.css">', () => `<style>${css}</style>`)
  .replace('<script type="module" src="src/main.js"></script>', () => `<script>${js}</script>`);
await mkdir(root + 'dist', { recursive: true });
await writeFile(root + 'dist/cendrelande.html', html);
console.log(`dist/cendrelande.html — ${(html.length / 1024).toFixed(0)} Ko`);
