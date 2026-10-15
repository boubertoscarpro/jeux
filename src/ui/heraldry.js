// Rendu SVG des armoiries (écu, bannière, sceau) à partir de state.meta.heraldry.
import { heraldryOf, colorOf } from '../systems/heraldry.js';
import { esc } from './components.js';

const K = '#1d1812';
let uid = 0;

// Zone du second émail (coordonnées 0..100)
function fieldPath(field) {
  switch (field) {
    case 'pale': return '<rect x="50" y="0" width="50" height="120"/>';
    case 'fess': return '<rect x="0" y="50" width="100" height="70"/>';
    case 'bend': return '<path d="M0 0H100V120Z"/>';
    case 'chevron': return '<path d="M0 95L50 45L100 95V70L50 20L0 70Z"/>';
    case 'quarter': return '<rect x="50" y="0" width="50" height="50"/><rect x="0" y="50" width="50" height="70"/>';
    case 'cross': return '<rect x="40" y="0" width="20" height="120"/><rect x="0" y="38" width="100" height="20"/>';
    case 'bordure': return '<path d="M0 0H100V120H0Z M10 10V58C10 82 28 98 50 108C72 98 90 82 90 58V10Z" fill-rule="evenodd"/>';
    default: return '';
  }
}

// Figure centrée (0..100), couleur `c`, contour encre
function chargePath(charge, c) {
  const S = `fill="${c}" stroke="${K}" stroke-width="2.4" stroke-linejoin="round"`;
  switch (charge) {
    case 'tower': return `<path d="M34 80V44H30V30H38V36H45V30H55V36H62V30H70V44H66V80Z" ${S}/><path d="M45 80V66A5 5 0 0 1 55 66V80" fill="${K}"/><rect x="47" y="46" width="6" height="9" fill="${K}"/>`;
    case 'stag': return `<path d="M38 80L40 62C34 58 33 50 38 46L44 48L48 40L52 48L58 46C63 50 62 58 56 62L58 80H52L50 68L46 68L44 80Z" ${S}/><path d="M42 44C36 36 34 28 38 22M40 34L32 30M58 44C64 36 66 28 62 22M60 34L68 30" fill="none" stroke="${c}" stroke-width="4" stroke-linecap="round"/><path d="M42 44C36 36 34 28 38 22M58 44C64 36 66 28 62 22" fill="none" stroke="${K}" stroke-width="1" stroke-linecap="round"/>`;
    case 'oak': return `<path d="M46 82V60H54V82Z" ${S}/><path d="M50 24C36 24 28 34 30 44C24 48 26 60 36 60H64C74 60 76 48 70 44C72 34 64 24 50 24Z" ${S}/>`;
    case 'anvil': return `<path d="M28 44H66C66 52 72 54 78 54V58H62L58 66H64V74H36V66H42L38 58H34C30 58 28 52 28 44Z" ${S}/>`;
    case 'wolf': return `<path d="M30 70L38 50L34 34L44 42H56L66 34L62 50L70 70L56 62H44Z" ${S}/><circle cx="45" cy="50" r="2" fill="${K}"/><circle cx="55" cy="50" r="2" fill="${K}"/>`;
    case 'sun': return `<circle cx="50" cy="52" r="14" ${S}/>${Array.from({ length: 12 }, (_, i) => { const a = (i * Math.PI) / 6; const x1 = 50 + Math.cos(a) * 18, y1 = 52 + Math.sin(a) * 18, x2 = 50 + Math.cos(a) * 27, y2 = 52 + Math.sin(a) * 27; return `<path d="M${x1.toFixed(1)} ${y1.toFixed(1)}L${x2.toFixed(1)} ${y2.toFixed(1)}" stroke="${c}" stroke-width="4" stroke-linecap="round"/>`; }).join('')}`;
    case 'key': return `<circle cx="50" cy="34" r="10" ${S}/><circle cx="50" cy="34" r="4" fill="${K}"/><path d="M47 44H53V80H47Z" ${S}/><path d="M53 66H62V72H53ZM53 74H59V80H53Z" ${S}/>`;
    case 'crescent': return `<path d="M60 28A26 26 0 1 0 60 78A20 20 0 1 1 60 28Z" ${S}/>`;
    case 'wheat': return `<path d="M50 84V36" stroke="${K}" stroke-width="4"/><path d="M50 84V36" stroke="${c}" stroke-width="2"/>${[40, 50, 60, 70].map((y) => `<ellipse cx="43" cy="${y}" rx="5" ry="8" transform="rotate(-30 43 ${y})" ${S}/><ellipse cx="57" cy="${y}" rx="5" ry="8" transform="rotate(30 57 ${y})" ${S}/>`).join('')}<ellipse cx="50" cy="30" rx="5" ry="8" ${S}/>`;
    case 'crown': return `<path d="M28 70L30 38L40 52L50 32L60 52L70 38L72 70Z" ${S}/><rect x="28" y="70" width="44" height="8" ${S}/>`;
    case 'flame': return `<path d="M50 82C34 82 28 70 32 58C36 48 44 46 42 32C54 38 58 48 56 56C60 52 62 48 62 42C70 52 72 62 68 70C64 78 58 82 50 82Z" ${S}/><path d="M50 78C44 76 42 70 46 64C48 68 52 68 52 62C56 66 58 74 50 78Z" fill="${K}" opacity=".35"/>`;
    case 'swords': return `<path d="M30 30L66 72M70 30L34 72" stroke="${K}" stroke-width="8" stroke-linecap="round"/><path d="M30 30L66 72M70 30L34 72" stroke="${c}" stroke-width="5" stroke-linecap="round"/><path d="M58 66L72 62M42 66L28 62" stroke="${K}" stroke-width="5" stroke-linecap="round"/>`;
    default: return '';
  }
}

// Écu complet
export function coatSvg(state, size = 48, h0 = null) {
  const h = h0 || heraldryOf(state);
  const id = `cl${++uid}`;
  const c1 = colorOf(state, h.t1), c2 = colorOf(state, h.t2);
  // Figure dans l'émail contrastant : le second émail si l'écu est plein, sinon le premier sur le second
  const fc = h.field === 'plain' ? c2 : h.field === 'bordure' ? c2 : c1 === c2 ? '#efe3c8' : (['pale', 'fess', 'bend', 'quarter'].includes(h.field) ? '#efe3c8' : c2);
  const shield = 'M4 4H96V56C96 86 74 104 50 116C26 104 4 86 4 56Z';
  return `<svg class="coat" width="${size}" height="${Math.round(size * 1.2)}" viewBox="0 0 100 120" role="img" aria-label="Blason">
    <defs><clipPath id="${id}"><path d="${shield}"/></clipPath><linearGradient id="${id}g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".22"/><stop offset=".6" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".25"/></linearGradient></defs>
    <g clip-path="url(#${id})"><rect width="100" height="120" fill="${c1}"/><g fill="${c2}">${fieldPath(h.field)}</g>${chargePath(h.charge, fc)}<rect width="100" height="120" fill="url(#${id}g)"/></g>
    <path d="${shield}" fill="none" stroke="${K}" stroke-width="4"/><path d="${shield}" fill="none" stroke="#d9b25a" stroke-width="1.5" opacity=".7"/></svg>`;
}

// Bannière (hampe + étoffe) : forme choisie, émaux et figure
export function bannerSvg(state, size = 40, h0 = null) {
  const h = h0 || heraldryOf(state);
  const id = `bn${++uid}`;
  const c1 = colorOf(state, h.t1), c2 = colorOf(state, h.t2);
  const cloth = { pennon: 'M12 8H92L72 40L92 72H12Z', swallow: 'M12 8H92V92L72 70L52 92V8Z', square: 'M12 8H88V88H12Z' }[h.banner] || 'M12 8H92L72 40L92 72H12Z';
  return `<svg class="banner-svg" width="${size}" height="${size}" viewBox="0 0 100 100" role="img" aria-label="Bannière">
    <defs><clipPath id="${id}"><path d="${cloth}"/></clipPath></defs>
    <path d="M8 4V98" stroke="${K}" stroke-width="5"/><path d="M8 4V98" stroke="#8a5a33" stroke-width="2.5"/>
    <g clip-path="url(#${id})"><rect width="100" height="100" fill="${c1}"/><g fill="${c2}" transform="translate(12 0) scale(0.8)">${fieldPath(h.field)}</g><g transform="translate(18 2) scale(0.62)">${chargePath(h.charge, h.field === 'plain' ? c2 : '#efe3c8')}</g></g>
    <path d="${cloth}" fill="none" stroke="${K}" stroke-width="3"/></svg>`;
}

// Sceau de cire (actes, rapports, archives)
export function sealSvg(state, size = 44, h0 = null) {
  const h = h0 || heraldryOf(state);
  const c1 = colorOf(state, h.t1);
  const outline = { round: '<circle cx="50" cy="50" r="46"/>', mandorla: '<path d="M50 4C80 24 80 76 50 96C20 76 20 24 50 4Z"/>', shield: '<path d="M8 8H92V50C92 78 72 92 50 98C28 92 8 78 8 50Z"/>' }[h.seal] || '<circle cx="50" cy="50" r="46"/>';
  return `<svg class="seal" width="${size}" height="${size}" viewBox="0 0 100 100" role="img" aria-label="Sceau dynastique">
    <g fill="#8e2a22" stroke="${K}" stroke-width="3">${outline}</g>
    <g fill="none" stroke="#c4554a" stroke-width="2" opacity=".8" transform="translate(50 50) scale(.84) translate(-50 -50)">${outline}</g>
    <g transform="translate(27 26) scale(.46)">${chargePath(h.charge === 'none' ? 'crown' : h.charge, c1 === '#26211c' ? '#c4554a' : '#b8473d')}</g></svg>`;
}

// Petit en-tête d'acte : sceau + nom + devise (rapports, chronique, archives)
export function sealLine(state) {
  const h = heraldryOf(state);
  return `<span class="seal-line">${sealSvg(state, 26, h)}<span><b>${esc(state.meta.kingdomName || '')}</b>${h.motto ? ` <i class="muted">« ${esc(h.motto)} »</i>` : ''}</span></span>`;
}
