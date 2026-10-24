// v21 « Couleurs du Royaume » — Interfaces des mécaniques : hospice (blessés, soins), reliques de bâtiment
// (emplacements, pose, transport), châtelain (héros, poste), ligue des brigands et insécurité, garnison alliée, auras
// des décorations (entretien) et le « Pourquoi ? » d'ensemble. Logique : systems/realm21.js.
import { BUILDINGS } from '../data/buildings.js';
import { BUILDING_RELICS, HOSPICE, CASTELLAN, BRIGANDS, DECO_WEAR } from '../data/realm21.js';
import { HERO_CLASSES } from '../data/heroes.js';
import { RIVALS } from '../data/world.js';
import { realm, hospiceBeds, woundedCount, healWounded, potionsFor, relicSlots, relicsOf, freeRelics, placeRelic, relicFromFragments, castellanOf, castellanDefense, assignCastellan, dismissCastellan, insecurity, decoAuras, careDeco, realmWhy } from '../systems/realm21.js';
import { esc, countdown, costList } from './components.js';
import { fmt } from '../core/util.js';

const sum = (o) => Object.values(o || {}).reduce((a, b) => a + b, 0);
const unitList = (u) => Object.entries(u).map(([k, n]) => `${n} ${esc(k)}`).join(', ');

// Fiche de l'hospice
export function hospiceBlock(app, b) {
  const s = app.state, R = realm(s), now = Date.now();
  const beds = hospiceBeds(s), w = woundedCount(s), pots = s.inventory.consumables?.healPotion || 0;
  const waiting = R.wounded.filter((g) => !g.healing), healing = R.wounded.filter((g) => g.healing);
  const need = waiting.reduce((a, g) => a + potionsFor(sum(g.units)), 0);
  return `<div class="panel-sub r21-hospice"><h4>⛑️ Blessés <span class="muted small">${w}/${beds} lits</span></h4>
    <p class="small muted">En défense, 30 % des pertes survivent blessées ; en campagne, 20 %. Une potion de soin (🧪 ${pots} en réserve) pour ${HOSPICE.potionPer} blessés, 12 h de soins. Soignés dans les 6 h : certains reviennent vétérans. Sans soins sous 24 h, ils rentrent au village.</p>
    ${waiting.map((g) => `<div class="r21-row"><span>${sum(g.units)} blessés (${unitList(g.units)})${g.src ? ` · ${esc(g.src)}` : ''}</span><span class="small ${now - g.at > (HOSPICE.waitH - 6) * 3600000 ? 'warn-text' : 'muted'}">repartent ${countdown(g.at + HOSPICE.waitH * 3600000)}</span><button class="mini primary" data-action="r21-heal" data-id="${g.id}" ${pots < potionsFor(sum(g.units)) ? 'disabled' : ''}>Soigner (🧪 ${potionsFor(sum(g.units))})</button></div>`).join('')}
    ${healing.map((g) => `<div class="r21-row"><span>${sum(g.units)} en soins${g.early ? ' (à temps : vétérans possibles)' : ''}</span><span class="small muted">guéris ${countdown(g.done)}</span></div>`).join('')}
    ${!R.wounded.length ? '<div class="small muted">Aucun blessé pour l’instant.</div>' : ''}
    ${waiting.length > 1 ? `<button class="mini" data-action="r21-heal" ${pots < need ? 'disabled' : ''}>Tout soigner (🧪 ${need})</button>` : ''}
    ${Object.values(R.veterans).some((n) => n > 0) ? `<div class="small ok">🎖️ Vétérans : ${Object.entries(R.veterans).filter(([, n]) => n > 0).map(([u, n]) => `${n} ${esc(u)}`).join(', ')} (attaque de leur unité jusqu’à +5 %)</div>` : ''}</div>`;
}
// Reliques d'un bâtiment (et celles du trésor qui lui conviennent)
export function relicBlock(app, b) {
  const s = app.state, now = Date.now();
  const slots = relicSlots(b.level);
  const here = relicsOf(s, b.id);
  const fit = freeRelics(s).filter((r) => BUILDING_RELICS[r.key].fits.includes(b.type));
  const elsewhere = realm(s).relics.filter((r) => r.bid && r.bid !== b.id && BUILDING_RELICS[r.key].fits.includes(b.type));
  const anyFits = Object.values(BUILDING_RELICS).some((d) => d.fits.includes(b.type));
  if (!anyFits) return '';
  return `<div class="panel-sub r21-relics"><h4>🏺 Reliques <span class="muted small">${here.length}/${slots} emplacement${slots > 1 ? 's' : ''}</span></h4>
    ${slots ? '' : '<div class="small muted">Un emplacement au niveau 5, deux au 15, trois au 25.</div>'}
    ${here.map((r) => { const d = BUILDING_RELICS[r.key]; return `<div class="r21-row"><span>${d.icon} <b>${esc(d.name)}</b> — ${esc(d.desc)}${r.movingUntil > now ? ` <span class="muted small">(en transport, arrive ${countdown(r.movingUntil)})</span>` : ''}</span><button class="mini ghost" data-action="r21-relic" data-id="${r.id}" data-bid="">Retirer</button></div>`; }).join('')}
    ${here.length < slots ? fit.map((r) => { const d = BUILDING_RELICS[r.key]; return `<div class="r21-row"><span>${d.icon} ${esc(d.name)} <span class="small muted">(au trésor)</span></span><button class="mini primary" data-action="r21-relic" data-id="${r.id}" data-bid="${b.id}">Poser ici</button></div>`; }).join('') + elsewhere.map((r) => { const d = BUILDING_RELICS[r.key], o = s.city.buildings[r.bid]; return `<div class="r21-row"><span>${d.icon} ${esc(d.name)} <span class="small muted">(dans ${esc(BUILDINGS[o?.type]?.name || '?')})</span></span><button class="mini" data-action="r21-relic" data-id="${r.id}" data-bid="${b.id}" title="Transport de 6 h, sans coût">Faire venir (6 h)</button></div>`; }).join('') : ''}
    ${(s.shards?.relicFragments || 0) >= 3 ? `<button class="mini" data-action="r21-fragments">🧩 3 fragments → une relique</button>` : ''}</div>`;
}
// Fiche d'une décoration : aura et usure
export function decoAuraBlock(app, b) {
  const s = app.state, a = decoAuras(s).list.find((x) => x.id === b.id);
  if (!a) return '';
  return `<div class="panel-sub r21-aura"><h4>✨ Aura</h4><div class="small ${a.near ? 'ok' : 'muted'}">${esc(a.text)}</div>${a.worn ? `<div class="small warn-text">Usée : un quart de l’aura perdue. ${costList(DECO_WEAR.cost, s)} <button class="mini" data-action="r21-care" data-id="${b.id}">Entretenir</button></div>` : '<div class="small muted">Entretenue (l’usure vient après 48 h).</div>'}</div>`;
}
// Défense : châtelain, ligue, garnison alliée
export function defenseRealmBlock(app) {
  const s = app.state, R = realm(s), c = castellanDefense(s), cur = castellanOf(s);
  const free = (s.heroes || []).filter((h) => !h.marchId && (!h.assignment || h.assignment.type === 'castellan'));
  const B = R.brigands;
  return `<div class="panel-sub r21-castellan"><h4>🏰 Châtelain</h4>
    <p class="small muted">Un héros commande la défense du château depuis un poste. Il ne marche ni ne gouverne en même temps. Un seigneur qui le voit deux raids de suite au même poste attaque ailleurs, avec le contre-engin.</p>
    ${c ? `<div class="small ok">${esc(c.text)}</div>` : '<div class="small muted">Aucun châtelain.</div>'}
    <div class="row gap wrap"><label class="small">Héros <select data-change="r21-castellan-hero">${['<option value="">—</option>', ...free.map((h) => `<option value="${h.id}" ${cur?.id === h.id ? 'selected' : ''}>${esc(h.name)} (${esc(HERO_CLASSES[h.cls]?.name || '')}, niv. ${h.level})</option>`)].join('')}</select></label>
    <span class="seg">${Object.entries(CASTELLAN.posts).map(([k, p]) => `<button class="mini ${cur?.assignment?.post === k ? 'selected' : ''}" data-action="r21-post" data-k="${k}" ${cur ? '' : 'disabled'} title="${esc(p.text)}">${p.icon} ${esc(p.name)}</button>`).join('')}</span>
    ${cur ? '<button class="mini ghost" data-action="r21-castellan-off">Relever</button>' : ''}</div></div>
    <div class="panel-sub r21-league"><h4>🗡️ Ligue des brigands</h4>
    <div class="small">Colère : <b>${B.anger}/${BRIGANDS.anger.strike}</b>${B.warned ? ' — <span class="warn-text">la ligue s’agite</span>' : ''}. Insécurité des routes : <b>+${insecurity(s)}</b> de danger.</div>
    <div class="small muted">Nettoyer toujours les mêmes camps irrite la ligue (riposte commune à ${BRIGANDS.anger.strike}) ; les laisser grandir (niveau 5+, 3 jours) rend les routes dangereuses pour les convois.</div></div>
    ${R.garrison ? `<div class="panel-sub r21-garrison"><h4>🤝 Garnison alliée</h4><div class="small">${sum(R.garrison.units)} soldats de ${esc(RIVALS[R.garrison.faction]?.name || 'votre allié')} ; ${fmt(15)} pains par heure, aucune sortie tant qu’ils sont là. Départ ${countdown(R.garrison.until)}.</div></div>` : ''}`;
}
// « Pourquoi ? » d'ensemble (fenêtre)
export function realmWhyHtml(app) {
  return `<h2>Pourquoi ? — le royaume vivant</h2>${realmWhy(app.state).map((x) => `<div class="panel-sub"><h4>${esc(x.title)}</h4>${x.lines.map((l) => `<div class="small">${esc(l)}</div>`).join('')}${x.note ? `<div class="small muted">${esc(x.note)}</div>` : ''}</div>`).join('')}`;
}
export const realmActions = {
  'r21-heal': (app, el) => app.act(() => healWounded(app.state, el.dataset.id || null), (r) => `⛑️ ${r.healed} blessés en soins (🧪 ${r.potions})`),
  'r21-relic': (app, el) => app.act(() => placeRelic(app.state, el.dataset.id, el.dataset.bid || null), (r) => (r.moving ? '🏺 Relique en route (6 h)' : '🏺 Relique posée')),
  'r21-fragments': (app) => app.act(() => relicFromFragments(app.state), (r) => `🏺 Nouvelle relique : ${BUILDING_RELICS[r.relic.key].name}`),
  'r21-care': (app, el) => app.act(() => careDeco(app.state, el.dataset.id || null), (r) => `✨ ${r.n} décoration${r.n > 1 ? 's' : ''} entretenue${r.n > 1 ? 's' : ''}`),
  'r21-post': (app, el) => { const c = castellanOf(app.state); if (c) app.act(() => assignCastellan(app.state, c.id, el.dataset.k), `🏰 Châtelain posté : ${CASTELLAN.posts[el.dataset.k].name}`); },
  'r21-castellan-off': (app) => app.act(() => dismissCastellan(app.state), 'Châtelain relevé'),
  'r21-why': (app) => app.modal(realmWhyHtml(app), {}, 'wide'),
};
export const realmChanges = {
  'r21-castellan-hero': (app, el) => { if (!el.value) app.act(() => dismissCastellan(app.state), 'Châtelain relevé'); else app.act(() => assignCastellan(app.state, el.value, castellanOf(app.state)?.assignment?.post || 'gate'), '🏰 Nouveau châtelain'); },
};
