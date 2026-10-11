// Campagnes militaires à objectifs (Armée → Campagnes).
import { RIVALS } from '../../data/world.js';
import { UNITS, ALL_UNITS } from '../../data/units.js';
import { fmt } from '../../core/util.js';
import { thLevel } from '../../systems/city.js';
import { armyPower } from '../../systems/army.js';
import { OPS, SEQUENCE, WAR_MIN_TH, warState, campaignTargets, canStartCampaign, startCampaign, currentOpKey, opEnemies, previewOp, chooseFinal, launchOp, abandonCampaign } from '../../systems/warcampaign.js';
import { esc, countdown, progress } from '../components.js';

const SHARES = { all: ['Toute l’armée', 1], two: ['Les deux tiers', 2 / 3], half: ['La moitié (garder une garnison)', 0.5] };
const pick = (s, share) => Object.fromEntries(Object.entries(s.army).filter(([u, n]) => n > 0 && UNITS[u] && UNITS[u].class !== 'special').map(([u, n]) => [u, Math.floor(n * share)]).filter(([, n]) => n > 0));
const unitsText = (o) => Object.entries(o).map(([u, n]) => `${ALL_UNITS[u]?.icon || ''} ${n} ${esc(ALL_UNITS[u]?.name || u)}`).join(', ');

function track(a) {
  const keys = [...SEQUENCE, a.final || 'final'];
  return `<ol class="war-track">${keys.map((k, i) => {
    const r = a.results.filter((x) => x.key === k).slice(-1)[0];
    const cls = i < a.stage || (r && r.won) ? 'done' : i === a.stage ? 'current' : 'locked';
    const op = OPS[k];
    return `<li class="${cls}"><b>${op ? `${op.icon} ${esc(op.name)}` : '🎯 Objectif final (au choix)'}</b>${op ? `<div class="small muted">${esc(op.desc)} — ${esc(op.effect)}</div>` : '<div class="small muted">Assiéger leur capitale, ou protéger une cité libre.</div>'}</li>`;
  }).join('')}</ol>`;
}

export default {
  id: 'campaigns', title: 'Campagnes', icon: '🎖️',
  locked: (app) => (thLevel(app.state) < WAR_MIN_TH ? `Les campagnes militaires s’ouvrent à l’hôtel de ville niveau ${WAR_MIN_TH} (avec une caserne).` : null),
  render(app) {
    const s = app.state, W = warState(s), a = W.active, now = Date.now();
    const share = app.ui.warShare || 'two';
    let body = '';
    if (!a) {
      body = `<div class="card"><h3>Choisir une cible</h3>${W.cooldownUntil > now ? `<p class="req small">Vos troupes se remettent de la dernière campagne : ${countdown(W.cooldownUntil)}.</p>` : ''}
        <div class="war-targets">${campaignTargets(s).map((t) => { const c = canStartCampaign(s, t.f.idx, now); return `<div class="war-target"><b>${RIVALS[t.f.idx].icon} ${esc(t.name)}</b><div class="small">Puissance estimée ${fmt(t.power)} · votre armée ${fmt(armyPower(s.army))}${t.atWar ? ' · <span class="bad">en guerre</span>' : ''}</div>
          ${c.ok ? `<button class="btn ${c.declares ? 'danger' : 'primary'} small" data-action="war-start" data-i="${t.f.idx}">${c.declares ? 'Déclarer la guerre et lancer' : 'Lancer la campagne'}</button>` : `<div class="req small">${esc(c.reason)}</div>`}</div>`; }).join('') || '<p class="muted small">Aucune faction ne peut être visée (alliances, pactes ou tributs).</p>'}</div></div>`;
    } else {
      const key = currentOpKey(s);
      const sel = pick(s, SHARES[share][1]);
      let opHtml = '';
      if (a.op) opHtml = `<div class="panel-sub"><h4>${OPS[a.op.key].icon} ${esc(OPS[a.op.key].name)} — en cours</h4><div class="small">Troupes engagées : ${unitsText(a.op.units)}</div>${countdown(a.op.end)}${progress(a.op.start, a.op.end)}</div>`;
      else if (!key) opHtml = `<div class="panel-sub"><h4>🎯 Choisissez l’objectif final</h4><div class="row gap wrap">${['siege', 'protect'].map((k) => `<button class="btn" data-action="war-final" data-k="${k}">${OPS[k].icon} ${esc(OPS[k].name)}</button>`).join('')}</div><div class="small muted">${esc(OPS.siege.effect)}<br>${esc(OPS.protect.effect)}</div></div>`;
      else {
        const pv = Object.keys(sel).length ? previewOp(s, sel, now) : null;
        opHtml = `<div class="panel-sub"><h4>Prochaine opération : ${OPS[key].icon} ${esc(OPS[key].name)}</h4>
          <div class="small">Forces ennemies attendues : ${unitsText(opEnemies(s, key))}${a.weaken ? ' <span class="ok">(affaiblies)</span>' : ''}</div>
          <div class="row gap wrap small">Engager : ${Object.entries(SHARES).map(([k, [l]]) => `<button class="mini ${share === k ? 'primary' : ''}" data-action="war-share" data-k="${k}">${esc(l)}</button>`).join('')}</div>
          <div class="small">${Object.keys(sel).length ? unitsText(sel) : '<span class="req">Aucune troupe disponible au château</span>'}</div>
          ${pv ? `<div class="verdict ${pv.pv.winner === 'attacker' ? 'good' : 'bad'}">${pv.pv.winner === 'attacker' ? '✔' : '✖'} ${esc(pv.pv.verdict)} · pertes estimées ${Math.round(pv.pv.lossRatio * 100)} %</div><ul class="notes small">${pv.pv.notes.slice(0, 4).map((n) => `<li>${esc(n)}</li>`).join('')}</ul>` : ''}
          <div class="small muted">Durée : ${OPS[key].minutes} min. Les troupes engagées quittent le château (moins de défenseurs en cas de raid).${a.bonus ? ` Bonus de campagne : attaque +${Math.round(a.bonus * 100)} %.` : ''}</div>
          <button class="btn primary" data-action="war-launch" ${Object.keys(sel).length ? '' : 'disabled'}>⚔️ Lancer l’opération</button></div>`;
      }
      body = `<div class="card"><div class="row between wrap"><h3>Campagne contre ${RIVALS[a.faction].icon} ${esc(RIVALS[a.faction].name)}</h3><span class="small ${a.fails ? 'bad' : 'muted'}">Revers : ${a.fails}/2</span></div>${track(a)}${opHtml}
        ${a.op ? '' : '<button class="mini ghost danger" data-action="war-abandon">Abandonner la campagne</button>'}</div>`;
    }
    return `<div class="card"><h2>🎖️ Campagnes militaires</h2><p class="small muted">Une campagne enchaîne trois opérations contre une faction : <b>sécuriser le col</b> (attaque +10 % pour la suite, raids de la faction affaiblis), <b>prendre le fort frontalier</b> (la faction perd territoires et troupes) puis un <b>objectif final</b> au choix (tribut imposé, ou cité libre protégée et trêve). Deux revers mettent fin à la campagne. L’aperçu indique vos chances avant chaque opération.</p></div>${body}
      ${W.history.length ? `<div class="card"><h3>Campagnes passées</h3>${W.history.map((h) => `<div class="small">${h.won ? '🏆' : '🩸'} ${esc(RIVALS[h.faction].name)} — ${h.results.map((r) => `${OPS[r.key].icon}${r.won ? '✔' : '✖'}`).join(' ')} · ${new Date(h.t).toLocaleDateString('fr-FR')}</div>`).join('')}</div>` : ''}`;
  },
  actions: {
    'war-start': (app, el) => { const i = +el.dataset.i; const c = canStartCampaign(app.state, i); const go = () => app.act(() => startCampaign(app.state, i), 'Campagne lancée'); if (c.declares) app.confirm(`<h2>Déclarer la guerre à ${esc(RIVALS[i].name)} ?</h2><p>La relation chute et la faction peut lancer des raids plus fréquents tant que dure la guerre.</p>`, 'Déclarer la guerre', go); else go(); },
    'war-share': (app, el) => { app.ui.warShare = el.dataset.k; app.render(); },
    'war-final': (app, el) => app.act(() => chooseFinal(app.state, el.dataset.k), 'Objectif final choisi'),
    'war-launch': (app) => app.act(() => launchOp(app.state, pick(app.state, SHARES[app.ui.warShare || 'two'][1]), [...app.state.heroes].filter((h) => !h.marchId && !h.assignment).sort((x, y) => y.level - x.level)[0]?.id), 'Opération lancée'),
    'war-abandon': (app) => app.confirm('<h2>Abandonner la campagne ?</h2><p>La relation avec la faction baisse et vos troupes devront se reposer 12 h avant une nouvelle campagne.</p>', 'Abandonner', () => app.act(() => abandonCampaign(app.state), 'Campagne abandonnée')),
  },
};
