import { GUILDS, GUILD_LEVELS, GUILD_OBJECTIVES, guildXpForLevel } from '../../data/social.js';
import { RESOURCES } from '../../data/resources.js';
import { fmt } from '../../core/util.js';
import { levelOf } from '../../systems/city.js';
import { joinGuild, leaveGuild, donate, claimObjective } from '../../systems/guild.js';
import { esc, resChips, bar } from '../components.js';

export default {
  id: 'guild', title: 'Guilde', icon: '🛡️',
  badge: (app) => app.state.guild?.objectives.filter((o) => o.done && !o.claimed).length || 0,
  render(app) {
    const s = app.state;
    const g = s.guild;
    const hall = levelOf(s, 'guildhall');
    if (!g) {
      return `<div class="card"><h2>🛡️ Guildes</h2>
        <p>Les guildes réunissent les seigneurs des Terres Brisées : bonus permanents, objectifs collectifs, boss mondiaux et territoires partagés.</p>
        <p class="muted small">Prototype solo : les autres membres sont simulés, mais leurs contributions sont réelles pour votre progression.</p>
        ${!hall ? '<p class="req">Construisez une Maison de guilde (Hôtel de ville niv. 4) pour rejoindre une guilde.</p>' : ''}
        <div class="cols-3">${Object.entries(GUILDS).map(([k, gd]) => `<div class="card-sub guild-card"><h3>${gd.icon} ${esc(gd.name)}</h3><div class="small">Spécialité : <b>${esc(gd.focus)}</b> · ${gd.members} membres</div>
          <p class="small muted">${esc(gd.desc)}</p><div class="small">Bonus : ${Object.entries(gd.perk).map(([m, v]) => `${m} +${Math.round(v * 100)}%`).join(', ')}</div>
          <button class="btn primary small" data-action="join" data-k="${k}" ${hall ? '' : 'disabled'}>Rejoindre</button></div>`).join('')}</div></div>`;
    }
    const gd = GUILDS[g.key];
    const amt = app.ui.donateAmt || 500;
    return `<div class="cols-2">
      <div class="card"><h2>${gd.icon} ${esc(gd.name)} <span class="muted small">niveau ${g.level}</span></h2>
        <div class="small">XP de guilde ${fmt(g.xp)} / ${fmt(guildXpForLevel(g.level))}</div>${bar(g.xp, guildXpForLevel(g.level))}
        <div class="small">Votre contribution totale : <b>${fmt(g.contributed)}</b> · ${gd.members + 1} membres</div>
        <h3>Bonus de guilde</h3><ul class="small">
          <li class="ok">✔ ${esc(gd.focus)} : ${Object.entries(gd.perk).map(([m, v]) => `${m} +${Math.round(v * 100)}%`).join(', ')}</li>
          ${GUILD_LEVELS.map((l) => `<li class="${g.level >= l.lvl ? 'ok' : 'off'}">${g.level >= l.lvl ? '✔' : '🔒'} Niv. ${l.lvl} — ${esc(l.name)} : ${Object.entries(l.mods).map(([m, v]) => `${m} ${v < 1 ? '+' + Math.round(v * 100) + '%' : '+' + v}`).join(', ')}</li>`).join('')}</ul>
        <h3>Dons</h3><p class="muted small">Les dons font monter la guilde de niveau (Maison de guilde niv. ${hall} : +${hall * 5}% d’efficacité).</p>
        <div class="form-row"><input type="number" id="donate-amt" min="1" value="${amt}" data-change="donate-amt"></div>
        <div class="row gap wrap">${['gold', 'wood', 'stone', 'iron', 'food', 'steel'].map((r) => `<button class="mini" data-action="donate" data-r="${r}">${RESOURCES[r].icon} Donner</button>`).join('')}</div>
        <button class="btn ghost danger small" data-action="leave">Quitter la guilde</button>
      </div>
      <div class="card"><h2>🎯 Objectifs collectifs <span class="muted small">cycle ${g.round + 1}</span></h2>
        ${g.objectives.map((o) => {
          const d = GUILD_OBJECTIVES.find((x) => x.id === o.id);
          const k = Math.pow(1.5, g.round);
          return `<div class="objective ${o.done ? 'done' : ''}"><div class="q-top"><b>${esc(d.title)}</b><span>${fmt(o.progress)} / ${fmt(o.target)}</span></div><div class="muted small">${esc(d.desc)}</div>${bar(o.progress, o.target)}
            <div class="quest-foot">${resChips(Object.fromEntries(Object.entries(d.reward).map(([r, v]) => [r, v * k])))}${o.done && !o.claimed ? `<button class="mini good" data-action="claim" data-id="${o.id}">Réclamer</button>` : o.claimed ? '<span class="ok small">✔ Réclamé</span>' : ''}</div></div>`;
        }).join('')}
        <h3>📰 Chronique</h3><div class="feed">${g.feed.map((f) => `<div class="small">• ${esc(f.text)}</div>`).join('') || '<div class="muted small">Calme plat…</div>'}</div>
      </div></div>`;
  },
  actions: {
    join: (app, el) => app.act(() => joinGuild(app.state, el.dataset.k), 'Bienvenue dans la guilde !'),
    leave: (app) => { if (confirm('Quitter la guilde ? Vous perdrez ses bonus.')) app.act(() => leaveGuild(app.state)); },
    'donate-amt': (app, el) => { app.ui.donateAmt = Math.max(1, +el.value || 1); },
    donate: (app, el) => app.act(() => donate(app.state, el.dataset.r, +document.getElementById('donate-amt').value), (r) => `+${fmt(r.xp)} XP de guilde`),
    claim: (app, el) => app.act(() => claimObjective(app.state, el.dataset.id), 'Récompense de guilde obtenue !'),
  },
};
