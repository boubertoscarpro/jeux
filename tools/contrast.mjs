// Contrastes WCAG (v17) : lit une feuille de style, résout les variables CSS, et calcule le contraste de chaque
// règle qui définit une couleur de texte, contre le fond défini par la même règle (ou, à défaut, contre les fonds
// sombres de l'interface : le plus défavorable des deux). Les couleurs semi-transparentes sont fusionnées.
// Seuils : 4,5:1 pour le texte, 3:1 pour le grand texte (≥ 24 px, ou ≥ 18,66 px en gras) et les icônes utiles.
// Exemptés (WCAG 1.4.3) : contrôles désactivés, décor (::selection, ::placeholder), texte masqué.
// Usage en ligne de commande : node tools/contrast.mjs css/theme.css [mode]
import { readFileSync } from 'node:fs';

export function parseHex(v) {
  v = v.trim().toLowerCase();
  let m = v.match(/^#([0-9a-f]{3,8})$/);
  if (m) {
    let h = m[1];
    if (h.length === 3 || h.length === 4) h = [...h].map((c) => c + c).join('');
    return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16), a: h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1 };
  }
  m = v.match(/^rgba?\(\s*([\d.]+)[ ,]+([\d.]+)[ ,]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/);
  if (m) { let a = m[4] == null ? 1 : m[4].endsWith('%') ? parseFloat(m[4]) / 100 : +m[4]; return { r: +m[1], g: +m[2], b: +m[3], a }; }
  if (v === 'white' || v === '#fff') return { r: 255, g: 255, b: 255, a: 1 };
  if (v === 'black') return { r: 0, g: 0, b: 0, a: 1 };
  return null;
}
export const blend = (fg, bg) => ({ r: fg.r * fg.a + bg.r * (1 - fg.a), g: fg.g * fg.a + bg.g * (1 - fg.a), b: fg.b * fg.a + bg.b * (1 - fg.a), a: 1 });
const lin = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
export const luminance = (c) => 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);
export function ratio(fg, bg) {
  const f = fg.a < 1 ? blend(fg, bg) : fg;
  const a = luminance(f), b = luminance(bg);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

// Règles d'une feuille : { sel, decl:{prop:value} } ; les @media sont lus aussi (avec leur condition dans media)
export function parseRules(css) {
  css = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const rules = [];
  const walk = (src, media) => {
    let i = 0;
    while (i < src.length) {
      const open = src.indexOf('{', i);
      if (open < 0) break;
      const head = src.slice(i, open).trim();
      let depth = 1, j = open + 1;
      while (j < src.length && depth) { if (src[j] === '{') depth++; else if (src[j] === '}') depth--; j++; }
      const body = src.slice(open + 1, j - 1);
      if (head.startsWith('@media') || head.startsWith('@supports')) walk(body, head);
      else if (!head.startsWith('@')) {
        const decl = {};
        for (const d of body.split(';')) { const k = d.indexOf(':'); if (k > 0) decl[d.slice(0, k).trim().toLowerCase()] = d.slice(k + 1).replace(/!important/, '').trim(); }
        rules.push({ sel: head, decl, media });
      }
      i = j;
    }
  };
  walk(css, null);
  return rules;
}

// Variables : celles de :root, puis celles du mode demandé (sélecteurs html.<mode> / :root.<mode> / [data-a11y~=mode])
export function variables(rules, mode = null) {
  const vars = {};
  const take = (r) => { for (const [k, v] of Object.entries(r.decl)) if (k.startsWith('--')) vars[k] = v; };
  for (const r of rules) if (!r.media && r.sel.split(',').some((s) => s.trim() === ':root')) take(r);
  if (mode) for (const r of rules) if (!r.media && r.sel.split(',').some((s) => new RegExp(`(^|[^\\w-])${mode}($|[^\\w-])`).test(s) && /^(html|:root)/.test(s.trim()))) take(r);
  return vars;
}
export function resolve(v, vars, depth = 0) {
  if (!v || depth > 8) return v;
  return v.replace(/var\((--[\w-]+)(?:\s*,\s*([^)]+))?\)/g, (_, n, fb) => resolve(vars[n] ?? fb ?? '', vars, depth + 1));
}
// Premier jeton de couleur d'une valeur (fond) ; dégradé : la couleur la plus claire (cas le plus défavorable pour un
// texte clair) n'est pas connue à l'avance : on prend la première et la dernière, et l'on garde la pire.
export function colorTokens(v) {
  return (v.match(/#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)/g) || []).map(parseHex).filter(Boolean);
}

const bgDecl = (r) => r.decl['background-color'] || r.decl.background || '';
function bgOf(rules, sel) {
  const parts = sel.split(',').map((p) => p.trim());
  for (const p of parts) {
    const same = rules.find((x) => !x.media && x.sel.split(',').map((q) => q.trim()).includes(p) && colorTokens(bgDecl(x)).length);
    if (same) return bgDecl(same);
    const toks = p.split(/\s+|>/).filter(Boolean);
    for (let k = toks.length - 2; k >= 0; k--) {
      const anc = rules.find((x) => !x.media && x.sel.split(',').map((q) => q.trim()).includes(toks[k]) && colorTokens(bgDecl(x)).length);
      if (anc) return bgDecl(anc);
    }
  }
  return '';
}
const EXEMPT = /::selection|::placeholder|:disabled|\[disabled\]|\.locked|\.off\b|\.sr-only|\.muted-off|\.ghost-text|::-webkit|\.decor\b|scrollbar/;
// Audit d'une feuille ; fonds par défaut : les fonds sombres de l'interface (le plus défavorable des deux)
// Cascade : les déclarations d'un même sélecteur (hors @media) sont fusionnées dans l'ordre ; un sélecteur multiple
// « a, b » est éclaté en « a » et « b »
export function cascade(rules) {
  const map = new Map(), out = [];
  for (const r of rules) {
    if (r.media) { out.push(r); continue; }
    for (const part of r.sel.split(',').map((p) => p.trim()).filter(Boolean)) {
      let m = map.get(part);
      if (!m) { m = { sel: part, decl: {}, media: null }; map.set(part, m); out.push(m); }
      Object.assign(m.decl, r.decl);
    }
  }
  return out;
}
export function audit(css, { mode = null, defaults = ['--stone-900', '--stone-700'], extraVars = {} } = {}) {
  const raw = parseRules(css);
  const rules = cascade(raw);
  const vars = { ...variables(raw, mode), ...extraVars };
  const defBgs = defaults.map((n) => parseHex(resolve(vars[n] || n, vars))).filter(Boolean);
  const base = defBgs[0] || { r: 22, g: 19, b: 15, a: 1 };
  const out = [];
  for (const r of rules) {
    if (r.media && /print/.test(r.media)) continue;
    const cv = r.decl.color;
    if (!cv || EXEMPT.test(r.sel)) continue;
    const fgv = resolve(cv, vars);
    if (/transparent|inherit|currentcolor|initial|unset/i.test(fgv)) continue;
    const fg = parseHex(fgv);
    if (!fg) continue;
    // Fond réel annoncé par la règle (--contrast-bg) : pour les fonds semi-transparents posés sur une surface connue
    let bgv = resolve(r.decl['--contrast-bg'] || r.decl['background-color'] || r.decl.background || '', vars);
    // Sans fond propre : une autre règle au même sélecteur, sinon la règle de l'ancêtre nommé dans le sélecteur
    if (!colorTokens(bgv).length) bgv = resolve(bgOf(rules, r.sel), vars);
    let bgs = colorTokens(bgv).map((c) => (c.a < 1 ? blend(c, base) : c));
    if (!bgs.length) bgs = defBgs;
    const size = parseFloat(resolve(r.decl['font-size'] || '', vars)) || 0;
    const bold = /bold|[6-9]00/.test(r.decl['font-weight'] || '') || /bold|\b[6-9]00\b/.test(r.decl.font || '');
    const fsz = size || parseFloat((r.decl.font || '').match(/(\d+(?:\.\d+)?)px/)?.[1] || 0);
    const large = fsz >= 24 || (bold && fsz >= 18.66);
    const need = large ? 3 : 4.5;
    const worst = Math.min(...bgs.map((bg) => ratio(fg, bg)));
    out.push({ sel: r.sel.replace(/\s+/g, ' ').slice(0, 120), color: fgv, ratio: Math.round(worst * 100) / 100, need, ok: worst + 1e-9 >= need, media: r.media });
  }
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const css = readFileSync(process.argv[2], 'utf8');
  const res = audit(css, { mode: process.argv[3] || null });
  const bad = res.filter((x) => !x.ok);
  console.log(`${res.length} couleurs de texte, ${bad.length} sous le seuil`);
  for (const b of bad) console.log(`${b.ratio}:1 < ${b.need}  ${b.color}  ${b.sel}`);
}

// Toutes les feuilles du jeu, dans l'ordre de chargement de index.html (la cascade compte : variables et fonds)
export function gameCss(root = '.') {
  const html = readFileSync(`${root}/index.html`, 'utf8');
  const files = [...html.matchAll(/href="(css\/[^"]+\.css)"/g)].map((m) => m[1]).filter((f) => !/fonts\.css/.test(f));
  return files.map((f) => `/* ${f} */\n` + readFileSync(`${root}/${f}`, 'utf8')).join('\n');
}
