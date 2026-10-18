// Interface des Seigneurs de la Brèche : fiche d'une forteresse (carte du monde) et dessin évolutif sur la carte.
import { ALL_UNITS, FORMATIONS } from '../data/units.js';
import { BREACH_TIERS, tierOf, BREACH_MIN_MERIT, BREACH_DOCTRINES, BREACH_PROGRESS, BREACH_MAX_LEVEL } from '../data/breach.js';
import { SPEEDUPS } from '../data/speedups.js';
import { RARITIES } from '../data/heroes.js';
import { breachDefense, nextStep, rewardPreview, breachState } from '../systems/breach.js';
import { nemesisWarning, nemesisEpithet } from '../systems/nemesis.js';
import { NEMESIS, NEMESIS_SCARS } from '../data/nemesis.js';
import { lordFaceSvg } from './nemesisFace.js';
import { armyPower } from '../systems/army.js';
import { speedupText, combatRoom } from '../systems/speedups.js';
import { fmt, fmtTime } from '../core/util.js';
import { esc, bar, countdown, resChips } from './components.js';

const pct = (v) => `${Math.round(v * 100)} %`;
const unitsList = (u) => Object.entries(u).filter(([, n]) => n > 0).map(([k, n]) => `<span class="unit-chip" title="${esc(ALL_UNITS[k].name)} — ${esc(ALL_UNITS[k].class)}">${ALL_UNITS[k].icon} ${n} ${esc(ALL_UNITS[k].name)}</span>`).join('');
const chance = (c) => (Array.isArray(c) ? `${Math.round(c[0] * 100)} % : ${SPEEDUPS[c[1]].short}` : speedupText(c));

export function breachPanel(app, poi) {
  const s = app.state, now = Date.now(), b = poi.breach;
  const D = breachDefense(s, poi, now);
  const t = D.tier;
  const step = nextStep(b);
  const rw = rewardPreview(b);
  const power = armyPower(D.enemies);
  const ruined = poi.clearedUntil > now;
  const tiers = `<div class="br-tiers">${BREACH_TIERS.map((x) => `<span class="br-tier ${x.n === t.n ? 'on' : x.n < t.n ? 'past' : ''}" style="--c:${x.color}" title="${esc(x.name)} : ${esc(x.desc)}">${x.n}</span>`).join('')}</div>`;
  const defense = poi.scouted
    ? `<div class="enemy-list">${unitsList(D.enemies)}</div>${D.wounded ? `<div class="small warn-text">Garnison affaiblie par votre dernier assaut : complète de nouveau dans ${countdown(b.restoreAt)}.</div>` : ''}`
    : `<div class="small">Composition <b>inconnue</b> : puissance estimée ${fmt(power * 0.75)} à ${fmt(power * 1.3)}. <span class="muted">Espionnez pour voir les unités exactes.</span></div>`;
  const hist = (b.history || []).slice(0, 5).map((h) => `<li class="${h.win ? 'ok' : 'bad'}">${h.win ? 'Victoire' : 'Défaite'} au niv. ${h.level} · ${h.sent} soldats, ${h.lost} perdus · mérite ${pct(h.merit)}${h.merit < BREACH_MIN_MERIT ? ' (indigne)' : ''}${h.evolved ? ` → <b>${esc(h.evolved)}</b>` : ''} <span class="muted">${new Date(h.t).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}</span></li>`).join('');
  const seen = Object.entries(b.seen || {}).filter(([, v]) => v >= 0.2).map(([c, v]) => `${c === 'cavalry' ? 'cavaliers' : c === 'ranged' ? 'tireurs' : c === 'infantry' ? 'fantassins' : c} (${pct(v)})`);
  const B = breachState(s);
  // v15 — Némésis : portrait, cicatrices, titres, ce qu'il prépare contre vous
  const nm = b.nem || { scars: [], titles: [], met: 0, revenges: 0 };
  const warn = nemesisWarning(b, now);
  const scarNames = nm.scars.map((k) => NEMESIS_SCARS.find((x) => x.key === k)?.name).filter(Boolean);
  const nemesis = `<div class="panel-sub nemesis">${lordFaceSvg({ name: b.lord, scars: nm.scars, titles: nm.titles, tier: t.n }, 64)}<div>
      <h4>${esc(nemesisEpithet(b))}</h4>
      <div class="small">${nm.met ? `${nm.met} assaut${nm.met > 1 ? 's' : ''} retenu${nm.met > 1 ? 's' : ''}` : 'Ne vous connaît pas encore'}${scarNames.length ? ` · cicatrices : ${esc(scarNames.join(', '))}` : ''}${nm.titles.length ? ` · titres : ${nm.titles.map((x) => `« ${esc(x)} »`).join(', ')}` : ''}</div>
      ${warn ? `<div class="small ${warn.pct > 0 ? 'warn-text' : 'muted'}">${esc(warn.text)}</div><div class="small muted">${esc(warn.hint)}</div>` : ''}
      ${nm.titles.length ? `<div class="small ok">Revanche possible : le vaincre lui arrache « ${esc(nm.titles[nm.titles.length - 1])} » et rapporte +${Math.round(NEMESIS.revengeLoot * 100)} % de butin.</div>` : ''}</div></div>`;
  return `${nemesis}<div class="panel-sub br-sheet" style="--c:${t.color}">
      <div class="row between"><h4>${esc(t.name)} · niveau ${b.level}/${BREACH_MAX_LEVEL}</h4>${tiers}</div>
      <div class="small">Seigneur : <b>${esc(b.lord)}</b>${D.commander ? ' (présent en personne : +10 % attaque, +10 moral)' : ''} · cycle ${(b.cycle || 0) + 1}</div>
      <div class="small">Puissance estimée : <b>${fmt(power)}</b> · murs +${pct(D.fort)} de défense · formation : ${FORMATIONS[D.formation].icon} ${esc(FORMATIONS[D.formation].name)}</div>
      <div class="small">Doctrine : ${D.doctrine.icon} <b>${esc(D.doctrine.name)}</b> — ${esc(D.doctrine.desc)}</div>
      ${seen.length ? `<div class="small warn-text">S’adapte à vos ${seen.join(', ')} : prochains renforts orientés contre eux.</div>` : ''}
    </div>
    ${ruined ? `<p class="ok">Forteresse en ruine après votre victoire : la garnison se reforme dans ${countdown(poi.clearedUntil)}.</p>` : ''}
    <div class="panel-sub"><h4>Défenseurs</h4>${defense}</div>
    <div class="panel-sub"><h4>Évolution</h4>${step.need ? `${bar(step.have, step.need)}<div class="small">${step.have}/${step.need} points · victoire méritée : +${BREACH_PROGRESS.win(1)} à +${BREACH_PROGRESS.win(0.3)} · défaite méritée : +${BREACH_PROGRESS.loss} (une fois par ${BREACH_PROGRESS.lossCooldownMin} min)</div>` : ''}
      <div class="small">Prochaine étape — ${esc(step.text)}</div>
      ${(b.changes || [])[0] ? `<div class="small muted">Dernier changement : ${esc(b.changes[0].text)}</div>` : ''}
      <div class="small muted">Une attaque n’est « méritante » que si la garnison pèse au moins ${pct(BREACH_MIN_MERIT)} de la puissance envoyée (et si vous n’envoyez pas une poignée de soldats au massacre).</div></div>
    <div class="panel-sub"><h4>Récompenses possibles (victoire méritée)</h4>${resChips(rw.res)}
      <div class="small">Objet : ${pct(rw.item[0])} (${esc(RARITIES[rw.item[1]]?.name || rw.item[1])}${rw.legendary ? `, dont ${pct(rw.legendary)} légendaire` : ''})${rw.relic ? ` · fragment de relique ${pct(rw.relic)}` : ''} · XP du commandant +${rw.xp}</div>
      <div class="small">Passe-temps : ${chance(rw.speedups)}${rw.rareSpeedup ? ` · rare ${chance(rw.rareSpeedup)}` : ''} <span class="muted">(encore ${combatRoom(s, now)} aujourd’hui)</span></div>
      ${B.firstTier[t.n] ? '' : `<div class="small ok">Première victoire contre ce palier : bonus unique (${speedupText(rw.first.speedups)}${rw.first.item ? `, objet ${esc(RARITIES[rw.first.item]?.name.toLowerCase() || '')}` : ''}${rw.first.relic ? ', relique' : ''}).</div>`}
      ${b.lastRewards ? `<div class="small muted">Dernier butin : ${resChips(b.lastRewards.res)}${b.lastRewards.items ? ` + ${b.lastRewards.items} objet(s)` : ''}${b.lastRewards.worthy ? '' : ' (victoire indigne : réduit)'}</div>` : ''}</div>
    <div class="panel-sub"><h4>Historique</h4><div class="small">${b.attacks} attaque(s) · ${b.wins} victoire(s) · ${b.losses} défaite(s)${b.ignored ? ` · ${b.ignored} ignorée(s)` : ''}</div>${hist ? `<ul class="small br-hist">${hist}</ul>` : '<div class="small muted">Aucun assaut pour l’instant.</div>'}</div>
    <div class="row gap">${ruined ? '' : '<button class="btn primary" data-action="march" data-type="attack">⚔️ Attaquer</button>'}<button class="btn" data-action="march" data-type="scout">👁️ Espionner</button></div>`;
}

// Dessin de la forteresse sur la carte : la silhouette grandit avec le palier (palissade → tours → remparts → citadelle)
export function drawBreachFort(ctx, px, py, r, b, { cleared = false } = {}) {
  const t = tierOf(b.level), c = t.color;
  ctx.save();
  ctx.globalAlpha = cleared ? 0.45 : 1;
  const w = r * 1.9, h = r * 1.25, x0 = px - w / 2, base = py + r * 0.6;
  // Socle (ombre)
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.beginPath(); ctx.ellipse(px, base + 1, w * 0.55, r * 0.22, 0, 0, 7); ctx.fill();
  ctx.lineWidth = Math.max(1, r * 0.08); ctx.strokeStyle = '#1d1812';
  if (t.n === 1) {
    // Palissade de pieux + tente
    ctx.fillStyle = '#8a5a33';
    const n = 6;
    for (let i = 0; i < n; i++) { const x = x0 + (i + 0.5) * (w / n); ctx.beginPath(); ctx.moveTo(x - w / n * 0.4, base); ctx.lineTo(x - w / n * 0.4, base - h * 0.55); ctx.lineTo(x, base - h * 0.75); ctx.lineTo(x + w / n * 0.4, base - h * 0.55); ctx.lineTo(x + w / n * 0.4, base); ctx.closePath(); ctx.fill(); ctx.stroke(); }
    ctx.fillStyle = '#c9a36a';
    ctx.beginPath(); ctx.moveTo(px - r * 0.35, base - h * 0.5); ctx.lineTo(px, base - h * 1.05); ctx.lineTo(px + r * 0.35, base - h * 0.5); ctx.closePath(); ctx.fill(); ctx.stroke();
  } else {
    // Murs de pierre, créneaux ; tours aux angles (palier 2+), donjon central (3+), flèches et couronne (4)
    const stone = t.n >= 4 ? '#5a4d63' : t.n === 3 ? '#7c6f62' : '#8d8a84';
    ctx.fillStyle = stone;
    const wallH = h * (0.45 + 0.08 * t.n);
    ctx.fillRect(x0, base - wallH, w, wallH); ctx.strokeRect(x0, base - wallH, w, wallH);
    const cren = 5 + t.n, cw = w / (cren * 2 - 1);
    for (let i = 0; i < cren; i++) { ctx.fillRect(x0 + i * 2 * cw, base - wallH - cw * 0.8, cw, cw * 0.8); ctx.strokeRect(x0 + i * 2 * cw, base - wallH - cw * 0.8, cw, cw * 0.8); }
    const tower = (x, th, tw) => { ctx.fillStyle = stone; ctx.fillRect(x - tw / 2, base - th, tw, th); ctx.strokeRect(x - tw / 2, base - th, tw, th); ctx.fillStyle = c; ctx.beginPath(); ctx.moveTo(x - tw * 0.65, base - th); ctx.lineTo(x, base - th - tw * (t.n >= 4 ? 1.3 : 0.9)); ctx.lineTo(x + tw * 0.65, base - th); ctx.closePath(); ctx.fill(); ctx.stroke(); };
    tower(x0, wallH * 1.4, r * 0.42); tower(x0 + w, wallH * 1.4, r * 0.42);
    if (t.n >= 3) tower(px, wallH * (t.n >= 4 ? 2.1 : 1.75), r * 0.55);
    // Porte
    ctx.fillStyle = '#2b1d12';
    ctx.beginPath(); ctx.moveTo(px - r * 0.18, base); ctx.lineTo(px - r * 0.18, base - wallH * 0.55); ctx.arc(px, base - wallH * 0.55, r * 0.18, Math.PI, 0); ctx.lineTo(px + r * 0.18, base); ctx.closePath(); ctx.fill();
  }
  // Bannière du seigneur (couleur du palier)
  const fx = px + w * 0.38, fy = base - h * (t.n >= 3 ? 1.55 : 1.2);
  ctx.strokeStyle = '#1d1812'; ctx.lineWidth = Math.max(1, r * 0.06);
  ctx.beginPath(); ctx.moveTo(fx, fy); ctx.lineTo(fx, fy + h * 0.6); ctx.stroke();
  ctx.fillStyle = cleared ? '#6d6d6d' : '#a8432f';
  ctx.beginPath(); ctx.moveTo(fx, fy); ctx.lineTo(fx + r * 0.6, fy + r * 0.12); ctx.lineTo(fx, fy + r * 0.3); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.restore();
  // Niveau
  if (r >= 9) {
    ctx.font = `bold ${Math.round(Math.max(9, r * 0.55))}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineWidth = 3; ctx.strokeStyle = '#1d1812'; ctx.strokeText(String(b.level), px - w * 0.42, py - r * 0.75);
    ctx.fillStyle = t.color; ctx.fillText(String(b.level), px - w * 0.42, py - r * 0.75);
  }
}

export { fmtTime };
