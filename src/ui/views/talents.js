import { TALENTS, TALENT_BRANCHES, BUILD_PRESETS, DYNASTY_PERKS } from '../../data/talents.js';
import { fmtTime } from '../../core/util.js';
import { talentRanks, talentPoints, freePoints, canLearn, learnTalent, resetTalents, saveBuild, loadBuild, applyPreset, canPrestige, foundDynasty, buyPerk, PRESTIGE_TH, prestigeGain, prestigePreview } from '../../systems/talents.js';
import { saveGame } from '../../core/save.js';
import { esc } from '../components.js';

export default {
  id: 'talents', title: 'Talents & dynastie', icon: '🌟',
  badge: (app) => (freePoints(app.state) > 0 ? freePoints(app.state) : 0),
  render(app) {
    const s = app.state;
    const ranks = talentRanks(s);
    const now = Date.now();
    const cd = s.talents.switchAt > now;
    const pr = canPrestige(s);
    const d = s.dynasty;
    return `<div class="card"><h2>🌟 Arbre de talents du royaume <span class="muted small">${freePoints(s)} point(s) libre(s) sur ${talentPoints(s)}</span></h2>
      <p class="muted small">Les talents sont <b>permanents</b> et survivent à la fondation d’une nouvelle dynastie. Points : 2 par niveau d’hôtel de ville, 1 par 20 niveaux de bâtiments, 1 par artefact, 1 par 500 points de saison. Choisissez une spécialisation : vous ne pourrez pas tout avoir.</p>
      <div class="row gap wrap"><span class="small">Builds conseillés :</span>${Object.entries(BUILD_PRESETS).map(([k, p]) => `<button class="mini" data-action="tl-preset" data-k="${k}" title="${esc(p.desc)}">${p.icon} ${esc(p.name)}</button>`).join('')}
        <button class="mini ghost" data-action="tl-reset">↺ Réinitialiser</button>${cd ? `<span class="muted small">changement de doctrine possible dans ${fmtTime(s.talents.switchAt - now)}</span>` : ''}</div>
      <div class="row gap wrap">${[0, 1, 2].map((i) => `<div class="build-slot"><b>${esc(s.talents.builds[i]?.name || `Doctrine ${i + 1}`)}</b> <button class="mini" data-action="tl-save" data-i="${i}">💾</button><button class="mini" data-action="tl-load" data-i="${i}" ${s.talents.builds[i] ? '' : 'disabled'}>📂</button></div>`).join('')}</div></div>
      <div class="talent-grid">${Object.entries(TALENT_BRANCHES).map(([bk, b]) => `<div class="branch"><h3>${b.icon} ${esc(b.name)}</h3>${Object.entries(TALENTS).filter(([, t]) => t.branch === bk).map(([id, t]) => {
        const r = ranks[id] || 0;
        const c = canLearn(s, id);
        return `<div class="talent ${r ? 'has' : ''} ${t.req && !(ranks[t.req] > 0) ? 'locked' : ''}"><div class="tech-head"><b>${esc(t.name)}</b><span class="dots">${'●'.repeat(r)}${'○'.repeat(t.ranks - r)}</span></div><div class="small">${esc(t.desc)}</div>${t.req ? `<div class="small muted">après ${esc(TALENTS[t.req].name)}</div>` : ''}
          <button class="mini ${c.ok ? 'primary' : ''}" data-action="tl-learn" data-id="${id}" ${c.ok ? '' : 'disabled'}>＋</button></div>`;
      }).join('')}</div>`).join('')}</div>
      <div class="card dynasty"><h2>👑 Dynastie ${d ? `<span class="muted small">${d.count} dynastie(s) passée(s) · ${d.points} point(s) d’héritage</span>` : ''}</h2>
        <p class="muted small">Arrivé au sommet, vous pouvez <b>fonder une nouvelle dynastie</b> : bâtiments, armée et ressources sont perdus, mais vous conservez talents, artefacts, collections, titres, records, réputation (moitié) et la chronique — et gagnez des points d’héritage pour des bonus permanents. Une progression quasi infinie.</p>
        <div>${pr.ok ? `<b class="ok">Prêt !</b> Gain : <b>${pr.gain}</b> points d’héritage. <button class="btn warn" data-action="prestige">Fonder une nouvelle dynastie</button>` : `<span class="req">${esc(pr.reason)}</span> <span class="muted small">(gain actuel estimé : ${prestigeGain(s)} points)</span>`}</div>
        ${d ? `<h3>Héritage</h3><div class="perk-grid">${Object.entries(DYNASTY_PERKS).map(([k, p]) => `<div class="card-sub"><b>${esc(p.name)}</b> <span class="dots">${'●'.repeat(d.perks[k] || 0)}${'○'.repeat(p.max - (d.perks[k] || 0))}</span><div class="small">${esc(p.desc)}</div><button class="mini" data-action="perk" data-k="${k}" ${d.points >= p.cost && (d.perks[k] || 0) < p.max ? '' : 'disabled'}>${p.cost} pt</button></div>`).join('')}</div>` : ''}
        <div class="muted small">Hôtel de ville niv. ${PRESTIGE_TH} requis.</div></div>`;
  },
  actions: {
    'tl-learn': (app, el) => app.act(() => learnTalent(app.state, el.dataset.id)),
    'tl-reset': (app) => { if (confirm('Réinitialiser vos talents ? (recharge de 2 h)')) app.act(() => resetTalents(app.state)); },
    'tl-preset': (app, el) => app.act(() => applyPreset(app.state, el.dataset.k), 'Build appliqué'),
    'tl-save': (app, el) => { const name = prompt('Nom de la doctrine :', app.state.talents.builds[+el.dataset.i]?.name || 'Ma doctrine'); if (name !== null) app.act(() => saveBuild(app.state, +el.dataset.i, name), 'Doctrine enregistrée'); },
    'tl-load': (app, el) => app.act(() => loadBuild(app.state, +el.dataset.i), 'Doctrine chargée'),
    perk: (app, el) => app.act(() => buyPerk(app.state, el.dataset.k), 'Héritage renforcé'),
    prestige: (app) => {
      const c = canPrestige(app.state);
      if (!c.ok) return app.toast(c.reason, 'bad');
      const p = prestigePreview(app.state);
      app.confirm(`<h2>👑 Fonder une nouvelle dynastie ?</h2><p>Vous recevrez <b>${p.gain} points d’héritage</b>. Cette action est <b>irréversible</b>.</p>
        <div class="cols-2"><div><h4>✔ Conservé</h4><ul class="small">${p.kept.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>
        <div><h4>✖ Réinitialisé</h4><ul class="small">${p.reset.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div></div>
        <p class="small muted">Conseil : exportez votre sauvegarde avant (Saison & boutique → Exporter).</p>`, 'Fonder la dynastie', () => {
        const r = foundDynasty(app.state);
        if (!r.ok) return app.toast(r.reason, 'bad');
        app.state = r.state; saveGame(r.state); location.reload();
      });
    },
  },
};
