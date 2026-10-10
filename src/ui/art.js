// Illustrations vectorielles de la carte du royaume (bâtiments, terrains, routes, icônes d'état).
// Un seul jeu de symboles SVG (<symbol>) est injecté dans la page ; chaque case n'y fait que des références
// (<use>), ce qui garde le DOM léger même sur une grille de 40×24. Aucune donnée de jeu ici : uniquement le rendu.
import { BUILDINGS } from '../data/buildings.js';

// Palette commune (pierre, bois, toits) — cohérente avec l'interface (or, brun, vert sombre)
const P = {
  stone: '#b9b2a4', stoneD: '#8c857a', stoneL: '#d8d1c2',
  wood: '#8a5a33', woodD: '#5f3d22', woodL: '#b07a49',
  plaster: '#e8dcc0', plasterD: '#c9b994',
  red: '#a8432f', redD: '#7c2e20', slate: '#4d5b73', slateD: '#36425a', thatch: '#c9a24a', thatchD: '#9c7a2f',
  blue: '#3f6fa3', green: '#4e7d3a', gold: '#e2b84a', dark: '#2b2219', ink: '#1d1812', window: '#2c2a33', glow: '#f6d27a',
};

// Toit selon la catégorie (repérage rapide des familles de bâtiments)
const ROOF = { core: [P.slate, P.slateD], resource: [P.wood, P.woodD], food: [P.thatch, P.thatchD], industry: [P.slate, P.slateD], military: [P.red, P.redD], civic: [P.blue, '#2c4f78'], unique: ['#6b4fa0', '#4a3575'] };

const shadow = '<ellipse cx="32" cy="56" rx="25" ry="5" fill="rgba(0,0,0,.28)"/>';
const win = (x, y, w = 4, h = 5) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="1" fill="${P.window}"/><rect x="${x}" y="${y}" width="${w}" height="${h / 2}" rx="1" fill="${P.glow}" opacity=".35"/>`;
// Bâtiment générique « 3/4 » : façade, pignon, toit à deux pans, porte
function hall({ x = 12, w = 40, y = 30, h = 24, roof = [P.red, P.redD], wall = P.plaster, wallD = P.plasterD, door = true, beams = true } = {}) {
  const mid = x + w / 2;
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${wall}" stroke="${P.ink}" stroke-width="1.2"/>
    <rect x="${x + w - 7}" y="${y}" width="7" height="${h}" fill="${wallD}" opacity=".7"/>
    ${beams ? `<path d="M${x} ${y + h * 0.45}H${x + w}M${x + w * 0.33} ${y}V${y + h}M${x + w * 0.66} ${y}V${y + h}" stroke="${P.woodD}" stroke-width="1.4" opacity=".75"/>` : ''}
    <path d="M${x - 4} ${y + 1}L${mid} ${y - 17}L${x + w + 4} ${y + 1}Z" fill="${roof[0]}" stroke="${P.ink}" stroke-width="1.2" stroke-linejoin="round"/>
    <path d="M${mid} ${y - 17}L${x + w + 4} ${y + 1}H${mid + 4}Z" fill="${roof[1]}" opacity=".85"/>
    ${door ? `<path d="M${mid - 4} ${y + h}V${y + h - 9}a4 4 0 0 1 8 0V${y + h}Z" fill="${P.woodD}" stroke="${P.ink}" stroke-width="1"/>` : ''}`;
}
const tower = (x, y, w, h, roof = P.slate) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${P.stone}" stroke="${P.ink}" stroke-width="1.2"/><rect x="${x + w - 4}" y="${y}" width="4" height="${h}" fill="${P.stoneD}" opacity=".8"/>
  <path d="M${x - 2} ${y + 1}L${x + w / 2} ${y - 13}L${x + w + 2} ${y + 1}Z" fill="${roof}" stroke="${P.ink}" stroke-width="1.2" stroke-linejoin="round"/>`;
const crenel = (x, y, w) => { let s = ''; for (let i = x; i < x + w - 2; i += 5) s += `<rect x="${i}" y="${y - 4}" width="3" height="4" fill="${P.stone}" stroke="${P.ink}" stroke-width=".8"/>`; return s; };
const flag = (x, y) => `<path d="M${x} ${y}V${y - 16}" stroke="${P.ink}" stroke-width="1.4"/><path d="M${x} ${y - 16}h11l-3 4 3 4h-11Z" fill="var(--banner, ${P.gold})" stroke="${P.ink}" stroke-width=".8"/>`;
const log_ = (x, y, r = 4) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${P.woodL}" stroke="${P.woodD}" stroke-width="1.2"/><circle cx="${x}" cy="${y}" r="${r * 0.45}" fill="none" stroke="${P.woodD}" stroke-width=".7"/>`;
const crate = (x, y, s = 8) => `<rect x="${x}" y="${y}" width="${s}" height="${s}" fill="${P.woodL}" stroke="${P.woodD}" stroke-width="1"/><path d="M${x} ${y}L${x + s} ${y + s}M${x + s} ${y}L${x} ${y + s}" stroke="${P.woodD}" stroke-width=".8"/>`;
const barrel = (x, y) => `<rect x="${x}" y="${y}" width="6" height="8" rx="2" fill="${P.wood}" stroke="${P.ink}" stroke-width=".8"/><path d="M${x} ${y + 2.5}h6M${x} ${y + 5.5}h6" stroke="${P.dark}" stroke-width=".8"/>`;
const chimney = (x, y) => `<rect x="${x}" y="${y}" width="5" height="9" fill="${P.stoneD}" stroke="${P.ink}" stroke-width=".8"/><circle cx="${x + 3}" cy="${y - 4}" r="2.5" fill="#cfcac0" opacity=".55"/><circle cx="${x + 6}" cy="${y - 9}" r="3.2" fill="#cfcac0" opacity=".35"/>`;
const field = (x, y, w, h, c1 = '#d8b44a', c2 = '#a88a2e') => { let s = `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${c2}" stroke="${P.woodD}" stroke-width="1"/>`; for (let i = y + 2; i < y + h - 1; i += 4) s += `<rect x="${x + 1}" y="${i}" width="${w - 2}" height="2" fill="${c1}"/>`; return s; };

// Archétypes dessinés à la main pour les bâtiments les plus fréquents ; les autres utilisent un atelier générique
// (toit selon la catégorie) avec une enseigne portant leur symbole, pour rester reconnaissables d'un coup d'œil.
const ART = {
  townhall: () => `${shadow}${hall({ x: 8, w: 48, y: 32, h: 22, roof: [P.slate, P.slateD], wall: P.stoneL, wallD: P.stone, beams: false })}
    ${tower(26, 14, 12, 22, P.slate)}<circle cx="32" cy="24" r="3.2" fill="${P.gold}" stroke="${P.ink}" stroke-width=".8"/>${win(14, 38)}${win(46, 38)}${flag(32, 2)}`,
  castle: () => `${shadow}<rect x="14" y="22" width="36" height="32" fill="${P.stone}" stroke="${P.ink}" stroke-width="1.2"/>${crenel(14, 22, 36)}
    ${tower(6, 16, 12, 38, P.slate)}${tower(46, 16, 12, 38, P.slate)}<path d="M28 54V44a4 4 0 0 1 8 0V54Z" fill="${P.woodD}" stroke="${P.ink}"/>${win(22, 30, 4, 6)}${win(38, 30, 4, 6)}${flag(32, 22)}`,
  sawmill: () => `${shadow}<path d="M10 32h34v22H10Z" fill="${P.woodL}" stroke="${P.ink}" stroke-width="1.2"/><path d="M10 38h34M10 46h34" stroke="${P.woodD}" stroke-width="1"/>
    <path d="M6 33L27 20L48 33Z" fill="${P.wood}" stroke="${P.ink}" stroke-width="1.2" stroke-linejoin="round"/>
    <circle cx="48" cy="40" r="10" fill="#cfd3d8" stroke="${P.ink}" stroke-width="1.2"/><circle cx="48" cy="40" r="3" fill="${P.stoneD}"/>
    <path d="M48 29l2 3h-4ZM59 40l-3 2v-4ZM48 51l-2-3h4ZM37 40l3-2v4ZM55.8 32.2l-.6 3.4-2.8-2.8ZM55.8 47.8l-3.4-.6 2.8-2.8ZM40.2 47.8l.6-3.4 2.8 2.8ZM40.2 32.2l3.4.6-2.8 2.8Z" fill="#9aa1aa"/>
    ${log_(12, 52, 4)}${log_(20, 52, 4)}${log_(16, 45.5, 4)}<path d="M26 47h16" stroke="${P.woodD}" stroke-width="5" stroke-linecap="round"/>`,
  quarry: () => `${shadow}<path d="M6 54L14 26L30 18L52 24L60 54Z" fill="${P.stoneD}" stroke="${P.ink}" stroke-width="1.2" stroke-linejoin="round"/>
    <path d="M14 26L30 18L52 24L46 34L22 34Z" fill="${P.stone}"/><path d="M18 42h30M16 48h38" stroke="${P.stoneL}" stroke-width="2"/>
    <rect x="10" y="44" width="10" height="7" fill="${P.stoneL}" stroke="${P.ink}" stroke-width=".9"/><rect x="40" y="46" width="12" height="7" fill="${P.stoneL}" stroke="${P.ink}" stroke-width=".9"/>
    <path d="M30 30l10 10" stroke="${P.woodD}" stroke-width="2.2" stroke-linecap="round"/><path d="M35 27l9 6" stroke="#9aa1aa" stroke-width="3" stroke-linecap="round"/>`,
  mine: () => `${shadow}<path d="M4 54Q10 22 32 16Q54 22 60 54Z" fill="${P.stoneD}" stroke="${P.ink}" stroke-width="1.2"/><path d="M14 30Q32 14 50 30" fill="none" stroke="${P.stone}" stroke-width="3"/>
    <path d="M22 54V38a10 10 0 0 1 20 0V54Z" fill="${P.ink}"/><path d="M20 54V36h3V54ZM41 54V36h3V54ZM19 34h26v4H19Z" fill="${P.wood}" stroke="${P.ink}" stroke-width=".8"/>
    <path d="M26 54l2-8h8l2 8" fill="none" stroke="#777" stroke-width="1.2"/><rect x="27" y="45" width="10" height="5" fill="${P.woodD}" stroke="${P.ink}" stroke-width=".8"/><circle cx="29" cy="45" r="1.6" fill="#8e9aa6"/><circle cx="33" cy="44.5" r="1.8" fill="#6d7b88"/>`,
  farm: () => `${shadow}${field(4, 34, 32, 20)}${field(30, 40, 28, 14, '#9cc35a', '#6f9a3c')}
    ${hall({ x: 34, w: 22, y: 24, h: 16, roof: [P.red, P.redD], wall: '#b9512f', wallD: '#8e3b22', beams: false })}<path d="M41 40V33h8v7" fill="${P.woodD}"/>`,
  house: () => `${shadow}${hall({ x: 6, w: 24, y: 32, h: 20, roof: [P.red, P.redD] })}${hall({ x: 32, w: 24, y: 28, h: 24, roof: [P.thatch, P.thatchD] })}${win(10, 36)}${win(48, 33)}${chimney(48, 12)}`,
  barracks: () => `${shadow}${hall({ x: 6, w: 44, y: 32, h: 22, roof: [P.red, P.redD], wall: P.stoneL, wallD: P.stone, beams: false })}
    <path d="M52 24L60 54M60 24L52 54" stroke="${P.woodD}" stroke-width="2"/><path d="M50 22l3 4M62 22l-3 4" stroke="#aab" stroke-width="2"/>
    <path d="M14 38h10v8q-5 5-10 0Z" fill="${P.red}" stroke="${P.ink}" stroke-width=".9"/><path d="M19 38v12" stroke="${P.gold}" stroke-width="1.2"/>${win(36, 38, 5, 6)}`,
  warehouse: () => `${shadow}${hall({ x: 8, w: 40, y: 28, h: 26, roof: [P.wood, P.woodD], wall: P.woodL, wallD: P.wood, door: false, beams: false })}
    <path d="M8 34h40M8 41h40M8 48h40" stroke="${P.woodD}" stroke-width="1"/><rect x="20" y="40" width="16" height="14" fill="${P.woodD}" stroke="${P.ink}"/><path d="M20 40l16 14M36 40L20 54" stroke="${P.wood}" stroke-width="1.2"/>
    ${crate(48, 44)}${crate(52, 36, 7)}${barrel(4, 46)}`,
  market: () => `${shadow}<rect x="6" y="36" width="24" height="16" fill="${P.woodL}" stroke="${P.ink}"/><rect x="34" y="34" width="24" height="18" fill="${P.woodL}" stroke="${P.ink}"/>
    <path d="M4 36L8 26H28L32 36Z" fill="#c33b30" stroke="${P.ink}" stroke-linejoin="round"/><path d="M12 26L10 36M18 26V36M24 26L26 36" stroke="#f3e6c4" stroke-width="2.4"/>
    <path d="M32 34L36 22H56L60 34Z" fill="#2f6aa3" stroke="${P.ink}" stroke-linejoin="round"/><path d="M40 22L38 34M46 22V34M52 22L54 34" stroke="#f3e6c4" stroke-width="2.4"/>
    <circle cx="12" cy="40" r="2.5" fill="#d64"/><circle cx="17" cy="40" r="2.5" fill="#e9a23b"/><circle cx="22" cy="40" r="2.5" fill="#8b4"/>${crate(40, 42, 7)}${barrel(50, 43)}`,
  mill: () => `${shadow}<path d="M22 54L25 26H39L42 54Z" fill="${P.plaster}" stroke="${P.ink}" stroke-width="1.2"/><path d="M23 26L32 16L41 26Z" fill="${P.thatch}" stroke="${P.ink}"/>
    <g transform="rotate(20 32 26)" stroke="${P.ink}" stroke-width=".9"><path d="M32 26L30 4h4Z" fill="${P.woodL}"/><path d="M32 26L54 24v4Z" fill="${P.plaster}"/><path d="M32 26L34 48h-4Z" fill="${P.woodL}"/><path d="M32 26L10 28v-4Z" fill="${P.plaster}"/></g>
    <circle cx="32" cy="26" r="2.5" fill="${P.woodD}"/><path d="M29 54v-7h6v7" fill="${P.woodD}"/>`,
  watchtower: () => `${shadow}<path d="M22 54L26 22H38L42 54" fill="none" stroke="${P.woodD}" stroke-width="3"/><path d="M24 44h16M25 34h14M23 50l17-16M41 50L24 34" stroke="${P.wood}" stroke-width="1.6"/>
    <rect x="20" y="16" width="24" height="8" fill="${P.woodL}" stroke="${P.ink}"/><path d="M18 17L32 4L46 17Z" fill="${P.red}" stroke="${P.ink}" stroke-linejoin="round"/>${flag(44, 18)}`,
  fishery: () => `${shadow}<rect x="4" y="40" width="40" height="5" fill="${P.woodL}" stroke="${P.ink}"/><path d="M8 45v9M20 45v9M32 45v9" stroke="${P.woodD}" stroke-width="2"/>
    ${hall({ x: 34, w: 22, y: 30, h: 22, roof: [P.thatch, P.thatchD], beams: false })}<path d="M8 32q8 6 16 0" fill="none" stroke="${P.ink}" stroke-width="1"/><path d="M6 30h20" stroke="${P.woodD}" stroke-width="1.2"/>
    <path d="M14 37q4-3 8 0q-4 3-8 0Zm8 0l3-2v4Z" fill="#9fc3df" stroke="${P.ink}" stroke-width=".6"/>`,
  port: () => `${shadow}<rect x="2" y="42" width="44" height="6" fill="${P.woodL}" stroke="${P.ink}"/><path d="M6 48v8M18 48v8M30 48v8M42 48v8" stroke="${P.woodD}" stroke-width="2"/>
    <path d="M10 40q12 8 26 0Z" fill="${P.wood}" stroke="${P.ink}"/><path d="M22 40V14" stroke="${P.woodD}" stroke-width="1.6"/><path d="M23 15q12 10 0 22Z" fill="${P.plaster}" stroke="${P.ink}" stroke-width=".8"/>
    ${crate(48, 44)}${barrel(52, 34)}`,
  pasture: () => `${shadow}<rect x="6" y="30" width="52" height="24" fill="#86b25a" stroke="${P.woodD}" stroke-width="1.5"/><path d="M6 30v24M19 30v24M32 30v24M45 30v24M58 30v24" stroke="${P.woodD}" stroke-width="1.4" opacity=".7"/>
    <ellipse cx="20" cy="42" rx="6" ry="4" fill="#f4f1e8" stroke="${P.ink}" stroke-width=".8"/><circle cx="26" cy="40" r="2" fill="${P.ink}"/><ellipse cx="40" cy="47" rx="6" ry="4" fill="#f4f1e8" stroke="${P.ink}" stroke-width=".8"/><circle cx="46" cy="45" r="2" fill="${P.ink}"/>
    ${hall({ x: 40, w: 16, y: 20, h: 10, roof: [P.thatch, P.thatchD], door: false, beams: false })}`,
  orchard: () => `${shadow}${[[14, 30], [32, 26], [50, 30], [22, 44], [42, 44]].map(([x, y]) => `<path d="M${x} ${y + 12}v-6" stroke="${P.woodD}" stroke-width="2"/><circle cx="${x}" cy="${y}" r="8" fill="#4f8a3a" stroke="${P.ink}" stroke-width=".9"/><circle cx="${x - 3}" cy="${y - 1}" r="1.6" fill="#d33"/><circle cx="${x + 3}" cy="${y + 2}" r="1.6" fill="#d33"/>`).join('')}`,
  library: () => `${shadow}${hall({ x: 10, w: 44, y: 30, h: 24, roof: [P.blue, '#2c4f78'], wall: P.stoneL, wallD: P.stone, beams: false })}
    <path d="M14 54V36M22 54V36M42 54V36M50 54V36" stroke="${P.stone}" stroke-width="3"/><circle cx="32" cy="22" r="3" fill="${P.gold}" stroke="${P.ink}" stroke-width=".8"/>`,
  tavern: () => `${shadow}${hall({ x: 8, w: 40, y: 30, h: 24, roof: [P.thatch, P.thatchD] })}${win(12, 34)}${win(38, 34)}${chimney(12, 14)}
    <path d="M48 32h10" stroke="${P.woodD}" stroke-width="1.6"/><path d="M52 32v4M58 32v4" stroke="${P.ink}" stroke-width=".8"/><rect x="50" y="36" width="10" height="9" rx="2" fill="#e9b13b" stroke="${P.ink}" stroke-width=".9"/><rect x="51" y="35" width="8" height="3" rx="1.5" fill="#fff"/>`,
};

// Atelier générique (toit selon la catégorie, cheminée pour l'industrie) + enseigne au symbole du bâtiment
function generic(type) {
  const def = BUILDINGS[type];
  const roof = ROOF[def.cat] || ROOF.core;
  const wall = def.cat === 'military' || def.cat === 'unique' || def.cat === 'civic' ? [P.stoneL, P.stone] : [P.plaster, P.plasterD];
  return `${shadow}${hall({ x: 10, w: 40, y: 30, h: 24, roof, wall: wall[0], wallD: wall[1], beams: wall[0] === P.plaster })}${def.cat === 'industry' ? chimney(14, 12) : ''}`;
}
const SIGNED = new Set(Object.keys(BUILDINGS).filter((t) => !ART[t] && t !== 'road'));

// Échafaudage (chantier) et fondations
const SCAFFOLD = `<g opacity=".95"><path d="M10 54V24M54 54V24M10 26h44M10 38h44M10 50h44" stroke="${P.woodL}" stroke-width="2.2"/><path d="M10 50L54 26M10 26l44 24" stroke="${P.wood}" stroke-width="1.2" opacity=".8"/></g>`;
const SITE = `${shadow}<rect x="10" y="44" width="44" height="10" fill="${P.stoneD}" stroke="${P.ink}"/><path d="M14 44v-6M24 44v-10M40 44v-8M50 44v-5" stroke="${P.stone}" stroke-width="4"/>${crate(4, 46, 7)}${log_(56, 50, 3.5)}`;

// Terrains : arbres, sommets, décombres, touffes d'herbe
const TREE = (x, y, s = 1, c = '#3d7a34') => `<g transform="translate(${x} ${y}) scale(${s})"><ellipse cx="0" cy="12" rx="8" ry="2.5" fill="rgba(0,0,0,.25)"/><path d="M0 12V6" stroke="${P.woodD}" stroke-width="2.4"/><path d="M0 -12L9 4H-9Z" fill="${c}" stroke="#1d3a19" stroke-width="1"/><path d="M0 -6L10 8H-10Z" fill="${c}" stroke="#1d3a19" stroke-width="1"/><path d="M0 -12L9 4H2Z" fill="#000" opacity=".15"/></g>`;
const DEFS = `
<symbol id="ter-forest" viewBox="0 0 64 64">${TREE(16, 22, 1, '#3d7a34')}${TREE(44, 18, 1.1, '#356c2e')}${TREE(30, 40, 1.15, '#41823a')}${TREE(52, 46, 0.85, '#3a7331')}</symbol>
<symbol id="ter-forest2" viewBox="0 0 64 64">${TREE(20, 16, 0.95, '#356c2e')}${TREE(46, 30, 1.15, '#3d7a34')}${TREE(18, 44, 1.05, '#41823a')}</symbol>
<symbol id="ter-mountain" viewBox="0 0 64 64"><path d="M2 58L22 14L34 34L42 22L62 58Z" fill="#7b746c" stroke="#3a352f" stroke-width="1.2" stroke-linejoin="round"/><path d="M22 14L34 34L28 30L24 38L18 28Z" fill="#5e5852"/><path d="M22 14L27 25L22 22L17 26Z" fill="#eef2f5"/><path d="M42 22L48 34L43 31L38 33Z" fill="#eef2f5"/><path d="M42 22L62 58H50Z" fill="#000" opacity=".15"/></symbol>
<symbol id="ter-rubble" viewBox="0 0 64 64"><ellipse cx="32" cy="50" rx="25" ry="6" fill="rgba(0,0,0,.25)"/><path d="M10 50V34l5-4 3 5 4-7 4 6V50Z" fill="#a39a8c" stroke="#3a3229" stroke-width="1.2" stroke-linejoin="round"/><path d="M10 40h16M10 45h16M15 34v6M20 40v5M17 45v5" stroke="#6e665c" stroke-width="1"/><path d="M30 50l4-7 7-1 5 3 6-2 5 7Z" fill="#8a8073" stroke="#3a3229" stroke-width="1.1" stroke-linejoin="round"/><rect x="38" y="30" width="9" height="6" transform="rotate(-20 42 33)" fill="#b3aa9b" stroke="#3a3229"/><path d="M26 30l12 10" stroke="#5f3d22" stroke-width="3" stroke-linecap="round"/><circle cx="50" cy="40" r="2.5" fill="#6e665c"/><circle cx="28" cy="52" r="2" fill="#6e665c"/></symbol>
<symbol id="ter-grass" viewBox="0 0 64 64"><path d="M14 44q1-6 3 0M17 44q1-5 3 0M44 22q1-5 3 0M47 22q1-6 3 0" stroke="#3f6e2c" stroke-width="1.3" fill="none"/><circle cx="50" cy="48" r="1.6" fill="#f3e07a"/><circle cx="12" cy="20" r="1.4" fill="#f0f0f0"/></symbol>
<symbol id="ter-bush" viewBox="0 0 64 64"><ellipse cx="24" cy="42" rx="9" ry="6" fill="#3e6f2d" stroke="#25451b"/><ellipse cx="30" cy="40" rx="7" ry="5" fill="#4a8236"/><circle cx="44" cy="20" r="1.6" fill="#e86a5a"/><circle cx="47" cy="23" r="1.4" fill="#f3e07a"/></symbol>
<symbol id="ter-river" viewBox="0 0 64 64"><path d="M8 20q6-4 12 0t12 0M30 44q6-4 12 0t12 0" stroke="#cfe7fa" stroke-width="1.6" fill="none" opacity=".6"/></symbol>
<symbol id="b-road" viewBox="0 0 64 64"><path d="M0 26h64v12H0Z" fill="#a08a66" stroke="#5f4c33"/><path d="M8 32h8M28 32h8M48 32h8" stroke="#c4b08a" stroke-width="2"/></symbol>
<symbol id="b-site" viewBox="0 0 64 64">${SITE}</symbol>
<symbol id="b-scaffold" viewBox="0 0 64 64">${SCAFFOLD}</symbol>
<symbol id="ov-flag" viewBox="0 0 64 64">${flag(54, 30)}</symbol>
<symbol id="ov-annex" viewBox="0 0 64 64"><rect x="2" y="42" width="12" height="12" fill="${P.plaster}" stroke="${P.ink}"/><path d="M0 43L8 35L16 43Z" fill="${P.red}" stroke="${P.ink}" stroke-linejoin="round"/></symbol>
<symbol id="ov-gold" viewBox="0 0 64 64"><path d="M6 57h52" stroke="${P.gold}" stroke-width="2.5" stroke-linecap="round"/><circle cx="6" cy="57" r="2.5" fill="${P.gold}"/><circle cx="58" cy="57" r="2.5" fill="${P.gold}"/></symbol>
<symbol id="ic-up" viewBox="0 0 24 24"><path d="M12 3L21 13H15.5V21H8.5V13H3Z" fill="currentColor" stroke="#1d1812" stroke-width="1.4" stroke-linejoin="round"/></symbol>
<symbol id="ic-hammer" viewBox="0 0 24 24"><path d="M4 20l9-9" stroke="#5f3d22" stroke-width="3" stroke-linecap="round"/><path d="M10 5l5-2 6 6-2 5-3-3-2 2-4-4 2-2Z" fill="#c9ced6" stroke="#1d1812" stroke-width="1.2" stroke-linejoin="round"/></symbol>
<symbol id="ic-lock" viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="10" rx="2" fill="currentColor" stroke="#1d1812"/><path d="M8 11V8a4 4 0 0 1 8 0v3" fill="none" stroke="currentColor" stroke-width="2.4"/></symbol>
${Object.keys(BUILDINGS).filter((t) => t !== 'road').map((t) => `<symbol id="b-${t}" viewBox="0 0 64 64">${ART[t] ? ART[t]() : generic(t)}</symbol>`).join('\n')}`;

// Injecte les symboles une seule fois dans le document
export function ensureArtDefs() {
  if (typeof document === 'undefined' || document.getElementById('art-defs')) return;
  const holder = document.createElement('div');
  holder.innerHTML = `<svg id="art-defs" width="0" height="0" style="position:absolute;width:0;height:0;overflow:hidden" aria-hidden="true"><defs>${DEFS}</defs></svg>`;
  document.body.appendChild(holder.firstChild);
}

// Taille visuelle selon le niveau : le bâtiment grandit et s'orne (drapeau, annexe, liseré doré)
export const levelTier = (lvl) => (lvl >= 15 ? 3 : lvl >= 10 ? 2 : lvl >= 5 ? 1 : 0);
export function buildingSvg(type, level = 1, cls = 'b-art') {
  if (!BUILDINGS[type]) return '';
  if (level <= 0) return `<svg class="${cls}" viewBox="0 0 64 64" aria-hidden="true"><use href="#b-site"/><use href="#b-scaffold"/></svg>`;
  const tier = levelTier(level);
  const sign = SIGNED.has(type) ? `<g class="b-sign"><path d="M47 28v4" stroke="#1d1812" stroke-width="1.4"/><rect x="34" y="31" width="26" height="22" rx="4" fill="#f3e6c4" stroke="#1d1812" stroke-width="1.4"/><text x="47" y="47.5" text-anchor="middle" font-size="16">${BUILDINGS[type].icon}</text></g>` : '';
  const ov = `${tier >= 1 && !['townhall', 'castle', 'watchtower'].includes(type) ? '<use href="#ov-flag"/>' : ''}${tier >= 2 ? '<use href="#ov-annex"/>' : ''}${tier >= 3 ? '<use href="#ov-gold"/>' : ''}`;
  return `<svg class="${cls} tier-${tier}" viewBox="0 0 64 64" aria-hidden="true"><use href="#b-${type}"/>${sign}${ov}</svg>`;
}
// Petite icône de bâtiment (barre de construction, menus, listes)
export const buildingIcon = (type, size = 30) => `<svg class="b-mini" width="${size}" height="${size}" viewBox="4 6 56 54" aria-hidden="true"><use href="#b-${type}"/>${SIGNED.has(type) ? `<circle cx="45" cy="44" r="13" fill="#f3e6c4" stroke="#1d1812" stroke-width="1.4"/><text x="45" y="51" text-anchor="middle" font-size="19">${BUILDINGS[type].icon}</text>` : ''}</svg>`;

// Décor de terrain, déterministe par case (variation sans scintillement d'un rendu à l'autre)
const hash2 = (x, y) => { let h = (x * 374761393 + y * 668265263) >>> 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return (h ^ (h >>> 16)) >>> 0; };
export function terrainSvg(t, x, y) {
  const h = hash2(x, y);
  if (t === 'forest') return `<svg class="ter-art" viewBox="0 0 64 64" aria-hidden="true"><use href="#ter-forest${h % 3 === 0 ? '2' : ''}"/></svg>`;
  if (t === 'mountain') return `<svg class="ter-art${h % 2 ? ' flip' : ''}" viewBox="0 0 64 64" aria-hidden="true"><use href="#ter-mountain"/></svg>`;
  if (t === 'rubble') return '<svg class="ter-art" viewBox="0 0 64 64" aria-hidden="true"><use href="#ter-rubble"/></svg>';
  if (t === 'river') return '<svg class="ter-art" viewBox="0 0 64 64" aria-hidden="true"><use href="#ter-river"/></svg>';
  if (t === 'plain' && h % 7 === 0) return `<svg class="ter-art" viewBox="0 0 64 64" aria-hidden="true"><use href="#ter-${h % 2 ? 'grass' : 'bush'}"/></svg>`;
  return '';
}
export const plainVariant = (x, y) => hash2(x, y) % 4;

// Route : segments vers les voisins reliés (routes, bâtiments) — dessin calculé à partir du réseau réel
export function roadSvg(mask) {
  const seg = { n: 'M28 0h8v32h-8Z', e: 'M32 28h32v8H32Z', s: 'M28 32h8v32h-8Z', w: 'M0 28h32v8H0Z' };
  const parts = Object.entries(seg).filter(([k]) => mask[k]).map(([, d]) => d).join('');
  return `<svg class="road-art" viewBox="0 0 64 64" aria-hidden="true"><g fill="#a08a66" stroke="#5f4c33" stroke-width="1"><path d="${parts}"/><rect x="24" y="24" width="16" height="16" rx="5"/></g><g fill="#c4b08a" opacity=".55"><circle cx="30" cy="30" r="1.6"/><circle cx="35" cy="35" r="1.4"/></g></svg>`;
}

// Icônes d'état (amélioration possible, bloquée, verrouillée)
export const upIcon = (kind) => (kind === 'ready'
  ? '<svg viewBox="0 0 24 24" aria-hidden="true"><use href="#ic-up"/></svg>'
  : kind === 'locked' ? '<svg viewBox="0 0 24 24" aria-hidden="true"><use href="#ic-lock"/></svg>'
    : '<svg viewBox="0 0 24 24" aria-hidden="true"><use href="#ic-up"/></svg>');
