// v15 — Némésis de la Brèche (module pur). Le seigneur d'une forteresse se souvient de vos assauts :
//  - mémoire : moyenne glissante des classes que vous envoyez, qui s'efface avec le temps (demi-vie 24 h) ;
//  - adaptation : si une classe domine (> 45 %), il recrute des contre-unités, au plus +20 % de sa puissance, et
//    seulement après quelques rencontres ; varier son armée ou espacer ses assauts l'annule ;
//  - cicatrices quand vous le battez, titres quand il vous bat ; le battre quand il porte un titre est une revanche
//    (+15 % de butin courant, il perd ce titre).
// L'état vit dans poi.breach.nem ; les lectures (défense, fiche, carte) ne le créent ni ne le modifient.
import { NEMESIS, NEMESIS_SCARS, NEMESIS_TITLES, NEMESIS_COUNTER_UNIT, CLASS_NAMES, COUNTER_PLURAL } from '../data/nemesis.js';
import { ALL_UNITS } from '../data/units.js';

const H = 3600000;
const unitPower = (u) => { const d = ALL_UNITS[u]; return (d.atk + d.def) * Math.sqrt(d.hp / 30); };
const EMPTY = { mem: {}, met: 0, at: 0, scars: [], titles: [], revenges: 0 };

// État Némésis (création et réparation, à n'appeler qu'en écriture)
export function nemesisOf(b) {
  const n = (b.nem && typeof b.nem === 'object') ? b.nem : (b.nem = {});
  if (!n.mem || typeof n.mem !== 'object') n.mem = {};
  n.met = Number.isFinite(n.met) ? n.met : 0;
  n.at = Number.isFinite(n.at) ? n.at : 0;
  if (!Array.isArray(n.scars)) n.scars = [];
  if (!Array.isArray(n.titles)) n.titles = [];
  n.revenges = Number.isFinite(n.revenges) ? n.revenges : 0;
  return n;
}
const read = (b) => b?.nem || EMPTY;

// Mémoire affaiblie par le temps écoulé depuis le dernier assaut
export function nemesisMemory(b, now = Date.now()) {
  const n = read(b);
  const f = n.at ? Math.pow(0.5, Math.max(0, now - n.at) / (NEMESIS.halfLifeH * H)) : 0;
  const out = {};
  for (const [c, v] of Object.entries(n.mem)) out[c] = v * f;
  return out;
}

// Classe remarquée et force de l'adaptation (0–1)
export function nemesisFocus(b, now = Date.now()) {
  const mem = nemesisMemory(b, now);
  let cls = null, share = 0;
  for (const [c, v] of Object.entries(mem)) if (NEMESIS_COUNTER_UNIT[c] && v > share) { cls = c; share = v; }
  const ramp = Math.min(1, read(b).met / NEMESIS.rampMeetings);
  const strength = cls ? Math.max(0, Math.min(1, (share - NEMESIS.focusFrom) / (1 - NEMESIS.focusFrom))) * ramp : 0;
  return { cls, share, strength };
}

// Renforts de contre-unités à ajouter à une garnison dont la puissance est `power`
export function nemesisReinforcement(b, power, now = Date.now()) {
  const f = nemesisFocus(b, now);
  if (!f.cls || f.strength <= 0) return { units: {}, pct: 0, cls: null };
  const pct = NEMESIS.bonusMax * f.strength;
  const u = NEMESIS_COUNTER_UNIT[f.cls];
  const n = Math.round((power * pct) / unitPower(u));
  return n > 0 ? { units: { [u]: n }, pct, cls: f.cls } : { units: {}, pct: 0, cls: null };
}

const classShares = (units) => {
  const out = {}; let tot = 0;
  for (const [u, k] of Object.entries(units || {})) { const c = ALL_UNITS[u]?.class; if (!c || !NEMESIS_COUNTER_UNIT[c]) continue; out[c] = (out[c] || 0) + k; tot += k; }
  for (const c of Object.keys(out)) out[c] /= tot || 1;
  return out;
};
const dominant = (sh) => { let c = 'mixed', v = 0; for (const [k, x] of Object.entries(sh)) if (x > v) { c = k; v = x; } return v >= 0.5 ? c : 'mixed'; };

/**
 * Après un assaut mérité. win : victoire du joueur ; units : troupes envoyées.
 * Renvoie { scar, title, revenge, lines[] } (textes pour le rapport et la chronique).
 */
export function nemesisAfterBattle(b, { win, units }, now = Date.now()) {
  const n = nemesisOf(b);
  const mem = nemesisMemory(b, now), sh = classShares(units), w = NEMESIS.memoryWeight;
  const next = {};
  for (const c of new Set([...Object.keys(mem), ...Object.keys(sh)])) { const v = (mem[c] || 0) * (1 - w) + (sh[c] || 0) * w; if (v >= 0.01) next[c] = Math.round(v * 1000) / 1000; }
  n.mem = next; n.at = now; n.met++;
  const out = { scar: null, title: null, revenge: null, lines: [] };
  if (win) {
    if (n.titles.length) { out.revenge = n.titles.pop(); n.revenges++; out.lines.push(`revanche : ${b.lord} perd son titre « ${out.revenge} »`); }
    if (n.scars.length < NEMESIS.maxScars) { const s = NEMESIS_SCARS[n.scars.length]; n.scars.push(s.key); out.scar = s.name; out.lines.push(`${b.lord} en garde une cicatrice : ${s.name}`); }
  } else {
    const t = NEMESIS_TITLES[dominant(sh)];
    if (!n.titles.includes(t)) { n.titles.push(t); if (n.titles.length > NEMESIS.maxTitles) n.titles.shift(); out.title = t; out.lines.push(`${b.lord} se fait désormais appeler « ${t} »`); }
  }
  return out;
}

// Nom complet avec le dernier titre
export const nemesisEpithet = (b) => { const t = read(b).titles; return t.length ? `${b.lord}, ${t[t.length - 1]}` : b.lord; };

// Ce que le seigneur prépare (affiché avant l'attaque) : null s'il ne s'adapte pas
export function nemesisWarning(b, now = Date.now()) {
  const f = nemesisFocus(b, now);
  if (!f.cls) return null;
  const uk = NEMESIS_COUNTER_UNIT[f.cls], u = ALL_UNITS[uk];
  const pct = Math.round(NEMESIS.bonusMax * f.strength * 100);
  return {
    cls: f.cls, pct, share: Math.round(f.share * 100), unit: u.name,
    text: pct > 0
      ? `Il vous attend : il a remarqué vos ${CLASS_NAMES[f.cls]} (${Math.round(f.share * 100)} % de vos assauts) et a recruté des ${COUNTER_PLURAL[uk]} (+${pct} % de puissance).`
      : `Il se souvient de vos ${CLASS_NAMES[f.cls]} (${Math.round(f.share * 100)} %) mais ne s’y est pas encore adapté.`,
    hint: 'Variez votre armée ou espacez vos assauts : sa mémoire s’efface de moitié en 24 h.',
  };
}
