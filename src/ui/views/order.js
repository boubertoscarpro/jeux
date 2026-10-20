// v20 « Ma forteresse » — Ordre public et titre de noblesse : deux jauges de prestige du château, entièrement
// détaillées (« Pourquoi ? ») : chaque facteur, sa valeur, et le rendement décroissant appliqué.
import { publicOrder, orderLevel, orderBonus, ORDER } from '../../systems/order.js';
import { titleOf, honorOf, TITLES, HONOR, titlePerkText } from '../../systems/nobility.js';
import { earnedTrophies, trophiesToPlace, nextTrophies } from '../../systems/trophies.js';
import { fmt } from '../../core/util.js';
import { esc } from '../components.js';

const pct = (v) => `${v >= 0 ? '+' : '−'}${Math.abs(Math.round(v * 1000) / 10)} %`;

export function orderCard(s) {
  const o = publicOrder(s), lv = orderLevel(o.value);
  const nextGain = orderBonus(o.value + ORDER.deco) - o.bonus;
  return `<div class="card order-card"><h2>${lv.icon} Ordre public : ${fmt(o.value)} <span class="chip">${esc(lv.name)}</span></h2>
    <p class="small muted">L’ordre public du château principal agit sur toute la production et sur la vitesse de formation des troupes : <b>${pct(o.bonus)}</b> aujourd’hui (au plus +${ORDER.capUp * 100} %, au pire −${ORDER.capDown * 100} %).</p>
    <details class="why" open><summary>Pourquoi ce chiffre ?</summary>
      <table class="why-table"><caption class="sr-only">Facteurs de l’ordre public</caption><tbody>${o.parts.map(([n, v]) => `<tr><td>${esc(n)}</td><td class="num ${v < 0 ? 'bad' : 'ok'}">${v >= 0 ? '+' : '−'}${fmt(Math.abs(v))}</td></tr>`).join('')}
        <tr class="total"><td>Total</td><td class="num">${fmt(o.value)}</td></tr></tbody></table>
      <p class="small">Rendement décroissant : chaque point compte un peu moins que le précédent (bonus = ${ORDER.capUp * 100} % × (1 − exp(−ordre / ${ORDER.kUp}))). Une décoration de plus dans la cour rapporterait encore <b>${pct(nextGain)}</b>.</p>
      <p class="small muted">Ce qui le fait monter : décorations et trophées <b>dans la ville fortifiée</b>, lieux (sanctuaire, ambassade…), monument, muraille, niveau de l’hôtel de ville. Ce qui le fait baisser : les maisons (foule, ruelles), qui rapportent par ailleurs de l’or et des ouvriers.</p>
    </details></div>`;
}
export function titleCard(s) {
  const t = titleOf(s), h = honorOf(s);
  return `<div class="card title-card"><h2>👑 Titre : ${esc(t.name)}</h2>
    <div class="title-bar" role="progressbar" aria-label="Progression vers ${esc(t.next?.name || 'le dernier titre')}" aria-valuenow="${Math.round(t.progress * 100)}" aria-valuemin="0" aria-valuemax="100"><i style="width:${Math.round(t.progress * 100)}%"></i></div>
    <p class="small">${fmt(t.honorNow)} points d’honneur${t.next ? ` · ${esc(t.next.name)} à ${fmt(t.next.honor)}` : ' · titre le plus élevé'}. Avantage : ${esc(titlePerkText(t.rank))}${t.rank >= 5 ? ' · toits dorés sur les tours' : ''}.</p>
    <details class="why"><summary>Pourquoi ce chiffre ?</summary>
      <table class="why-table"><caption class="sr-only">Sources de l’honneur</caption><tbody>${h.parts.length ? h.parts.map(([n, v]) => `<tr><td>${esc(n)}</td><td class="num ok">+${fmt(v)}</td></tr>`).join('') : '<tr><td colspan="2" class="muted">Pas encore d’honneur : gagnez des batailles, repoussez des raids, prenez des places fortes.</td></tr>'}</tbody></table>
      <p class="small muted">L’honneur n’est pas une monnaie : rien ne se dépense, il se lit dans vos faits d’armes (victoire ${HONOR.battle}, raid repoussé ${HONOR.raid}, place forte ${HONOR.siege}, site difficile ${HONOR.hardClear}, campagne ${HONOR.campaign}, grand projet ${HONOR.project}).</p>
    </details>
    <ol class="title-ladder">${TITLES.map((x, i) => `<li class="${i <= t.rank ? 'done' : ''}"><b>${esc(x.name)}</b> <span class="small muted">${fmt(x.honor)}</span>${i <= t.rank ? ' <span aria-label="obtenu">✔</span>' : ''}</li>`).join('')}</ol></div>`;
}
function trophyCard(s) {
  const got = earnedTrophies(s), wait = trophiesToPlace(s), next = nextTrophies(s).slice(0, 4);
  return `<div class="card"><h2>🏆 Vitrine des trophées</h2>
    <p class="small muted">Chaque fait d’armes laisse un trophée (statue, bannière, obélisque…) à exposer dans la ville fortifiée : il compte pour l’ordre public. Rien ne s’achète.</p>
    <p>${got.length} trophée${got.length > 1 ? 's' : ''} gagné${got.length > 1 ? 's' : ''}${wait.length ? `, <b>${wait.length} à exposer</b> <button class="mini primary" data-action="trophy-open">Exposer</button>` : ''}.</p>
    ${next.length ? `<div class="small">Prochains : ${next.map((n) => `${esc(n.name)} (${fmt(n.count)}/${fmt(n.next)})`).join(' · ')}</div>` : ''}</div>`;
}

export default {
  id: 'order', title: 'Ordre et noblesse', icon: '⚖️',
  render(app) {
    const s = app.state;
    return `<div class="cols-2">${orderCard(s)}${titleCard(s)}</div>${trophyCard(s)}`;
  },
  actions: {
    'trophy-open': (app) => { app.closeWin?.(false); app.ui.buildMode = true; app.ui.buildTab = 'trophy'; app.go('city'); },
  },
};
