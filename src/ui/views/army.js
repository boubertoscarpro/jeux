import { UNITS, UNIT_CLASSES, FORMATIONS, TERRAIN_COMBAT, WEATHER } from '../../data/units.js';
import { BUILDINGS } from '../../data/buildings.js';
import { fmt, fmtTime, scaleObj } from '../../core/util.js';
import { computeMods } from '../../systems/modifiers.js';
import { unitStatus, unitCost, train, trainTime, dismiss, armyPower } from '../../systems/army.js';
import { upkeepPerHour, armyTotals } from '../../systems/economy.js';
import { esc, costList } from '../components.js';

const pctTxt = (v) => `${v > 0 ? '+' : ''}${Math.round(v * 100)}%`;

function unitRow(app, type, mods) {
  const s = app.state;
  const u = UNITS[type];
  const st = unitStatus(s, type);
  const have = s.army[type] || 0;
  const vs = Object.entries(u.vs || {}).map(([c, m]) => `<span class="vs" title="Dégâts ×${m} contre ${UNIT_CLASSES[c].name}">${UNIT_CLASSES[c].icon}×${m}</span>`).join(' ');
  return `<tr class="${st.ok ? '' : 'locked'}">
    <td><span class="u-icon">${u.icon}</span> <b>${esc(u.name)}</b><div class="muted small">${UNIT_CLASSES[u.class].name}</div></td>
    <td class="num">${u.atk}</td><td class="num">${u.def}</td><td class="num">${u.hp}</td><td class="num">${u.speed}</td><td class="num">${u.carry}</td><td class="num">${u.upkeep}</td>
    <td>${vs}${u.pierce ? ' <span class="vs" title="Perforant">🎯</span>' : ''}${u.rangedResist ? ` <span class="vs" title="Résiste aux tirs">🛡️${Math.round(u.rangedResist * 100)}%</span>` : ''}${u.wallBreak ? ' <span class="vs" title="Brise les murailles">🧱</span>' : ''}</td>
    <td class="num"><b>${fmt(have)}</b></td>
    <td>${st.ok ? `<div class="train-ctl">${costList(unitCost(type, mods), s)}<div class="row gap"><input type="number" min="1" value="5" id="tr-${type}" class="qty"><button class="mini primary" data-action="train" data-type="${type}">Former</button></div><div class="muted small">⏱ ${fmtTime(trainTime(type, 1, mods))} / u</div></div>` : `<span class="req">${esc(st.reason)}</span>`}</td>
  </tr>`;
}

export default {
  id: 'army', title: 'Armée', icon: '⚔️',
  render(app) {
    const s = app.state;
    const mods = computeMods(s);
    const tot = armyTotals(s);
    const byBuilding = {};
    for (const type of Object.keys(UNITS)) (byBuilding[UNITS[type].building] ||= []).push(type);
    return `<div class="card"><h2>⚔️ Armée</h2>
      <div class="stats-strip"><div><span class="muted">Puissance</span><b>${fmt(armyPower(tot))}</b></div><div><span class="muted">Unités</span><b>${fmt(Object.values(tot).reduce((a, b) => a + b, 0))}</b></div>
      <div><span class="muted">Entretien</span><b>${fmt(upkeepPerHour(s, mods))} 🍖/h</b></div><div><span class="muted">Vitesse de formation</span><b>${pctTxt(mods['train.speed'] || 0)}</b></div>
      <div><span class="muted">Attaque / Défense</span><b>${pctTxt(mods['combat.atk'] || 0)} / ${pctTxt(mods['combat.def'] || 0)}</b></div></div>
      ${s.famine ? '<div class="req">⚠️ Famine : vos réserves de nourriture sont vides. Formation impossible et moral −30.</div>' : ''}
      </div>
      ${Object.entries(byBuilding).map(([b, types]) => `<div class="card"><h3>${BUILDINGS[b].icon} ${esc(BUILDINGS[b].name)}</h3>
        <div class="table-wrap"><table class="units"><thead><tr><th>Unité</th><th title="Attaque">⚔️</th><th title="Défense">🛡️</th><th title="Points de vie">❤️</th><th title="Vitesse">💨</th><th title="Transport">🎒</th><th title="Entretien nourriture/h">🍖</th><th>Contres</th><th>En ville</th><th>Formation</th></tr></thead>
        <tbody>${types.map((t) => unitRow(app, t, mods)).join('')}</tbody></table></div></div>`).join('')}
      <div class="card"><h3>📖 Manuel tactique</h3>
        <div class="cols-3">
          <div><h4>Contres</h4><ul class="small">
            <li>🔱 Lanciers ×2 contre la <b>cavalerie</b></li><li>🐎 Cavalerie ×1,6–2 contre les <b>tireurs</b> et le siège</li><li>🏹 Tireurs ×1,3–1,5 contre l’<b>infanterie</b></li>
            <li>🛡️ Soldats lourds : −35% dégâts à distance</li><li>🥷 Assassins : brisent le moral adverse</li><li>🔧 Ingénieurs : retranchements (+défense)</li><li>🪵 Béliers & catapultes : réduisent les murailles</li></ul>
            <h4>Moral</h4><p class="small">Le moral baisse avec les pertes. Sous 20, l’armée fuit. Pain (+15), commandant, tonique et compétences l’augmentent ; la famine le réduit (−30).</p></div>
          <div><h4>Terrain</h4><ul class="small">${Object.values(TERRAIN_COMBAT).map((t) => `<li><b>${esc(t.name)}</b> : ${esc(t.note)}</li>`).join('')}</ul></div>
          <div><h4>Formations</h4><ul class="small">${Object.values(FORMATIONS).map((f) => `<li>${f.icon} <b>${esc(f.name)}</b> : ${esc(f.desc)}</li>`).join('')}</ul>
            <h4>Météo</h4><ul class="small">${Object.values(WEATHER).map((w) => `<li>${w.icon} <b>${esc(w.name)}</b> : ${esc(w.note)}</li>`).join('')}</ul></div>
        </div></div>
      <div class="card"><h3>Renvoyer des troupes</h3><p class="muted small">Réduit l’entretien en nourriture. Aucun remboursement.</p>
        <div class="row gap wrap">${Object.entries(s.army).filter(([, n]) => n > 0).map(([u, n]) => `<button class="mini ghost" data-action="dismiss" data-type="${u}">${UNITS[u].icon} −10 ${esc(UNITS[u].name)} (${n})</button>`).join('')}</div></div>`;
  },
  actions: {
    train: (app, el) => {
      const type = el.dataset.type;
      const n = +document.getElementById('tr-' + type).value;
      app.act(() => train(app.state, type, n), `Formation lancée : ${n} ${UNITS[type].name}`);
    },
    dismiss: (app, el) => { if (confirm('Renvoyer 10 unités ?')) app.act(() => dismiss(app.state, el.dataset.type, 10)); },
  },
};
void scaleObj;
