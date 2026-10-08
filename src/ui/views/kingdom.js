import { COSMETICS, SEASON } from '../../data/social.js';
import { TERRAINS } from '../../data/world.js';
import { fmt, fmtTime } from '../../core/util.js';
import { computeMods } from '../../systems/modifiers.js';
import { thLevel, totalLevels } from '../../systems/city.js';
import { armyPower } from '../../systems/army.js';
import { armyTotals } from '../../systems/economy.js';
import { revealedCount, territoryLimit } from '../../systems/world.js';
import { milestoneList, claimMilestone, seasonInfo, claimSeasonTier, buyCosmetic, applyCosmetic } from '../../systems/quests.js';
import { exportSave, importSave, deleteSave, saveGame } from '../../core/save.js';
import { esc, resChips, bar } from '../components.js';

const MOD_NAMES = {
  'prod.all': 'Toute production', 'prod.food': 'Nourriture', 'prod.wood': 'Bois', 'prod.stone': 'Pierre', 'prod.iron': 'Fer', 'prod.gold': 'Or', 'prod.steel': 'Acier',
  'combat.atk': 'Attaque', 'combat.def': 'Défense', 'combat.morale': 'Moral', 'gather.all': 'Récolte', 'loot.rare': 'Butin rare', 'march.speed': 'Vitesse de marche',
  'explore.speed': 'Exploration', 'build.speed': 'Construction', 'research.speed': 'Recherche', 'train.speed': 'Formation', 'city.def': 'Défense de la ville', upkeep: 'Entretien',
  'craft.quality': 'Qualité de forge', 'market.fee': 'Taxe', carry: 'Transport',
};

export default {
  id: 'kingdom', title: 'Royaume & Saison', icon: '👑',
  badge: (app) => milestoneList(app.state).filter((m) => m.done).length + SEASON.tiers.filter((t, i) => !app.state.season.claimed[i] && app.state.season.points >= t.pts).length,
  render(app) {
    const s = app.state;
    const mods = computeMods(s);
    const season = seasonInfo(s);
    const st = s.stats;
    const ms = milestoneList(s);
    const keyMods = Object.entries(MOD_NAMES).filter(([k]) => Math.abs(mods[k] || 0) > 0.001);
    return `<div class="cols-2">
      <div class="card"><h2>👑 ${esc(s.meta.kingdomName)}</h2>
        <div class="form-row"><label>Nom du royaume</label><input id="k-name" value="${esc(s.meta.kingdomName)}" maxlength="28"><button class="mini" data-action="rename">OK</button></div>
        ${s.meta.titles?.length ? `<div class="form-row"><label>Titre</label><select data-change="title" id="k-title"><option value="">— Aucun —</option>${s.meta.titles.map((t) => `<option ${s.meta.title === t ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></div>` : ''}
        <div class="stats-grid">
          <div><span>Hôtel de ville</span><b>${thLevel(s)}</b></div><div><span>Niveaux de bâtiments</span><b>${totalLevels(s)}</b></div>
          <div><span>Puissance militaire</span><b>${fmt(armyPower(armyTotals(s)))}</b></div><div><span>Héros</span><b>${s.heroes.length}</b></div>
          <div><span>Technologies</span><b>${Object.keys(s.techs).length}</b></div><div><span>Cases explorées</span><b>${fmt(revealedCount(s.world))}</b></div>
          <div><span>Victoires / défaites</span><b>${st.battlesWon} / ${st.battlesLost}</b></div><div><span>Raids repoussés</span><b>${st.raidsRepelled}</b></div>
          <div><span>Ressources récoltées</span><b>${fmt(st.gathered)}</b></div><div><span>Objets forgés</span><b>${st.crafted}</b></div>
          <div><span>Territoires</span><b>${Object.keys(s.territories).length}/${territoryLimit(s, mods)}</b></div><div><span>Boss vaincus</span><b>${st.bossKills}</b></div>
          <div><span>Royaume fondé il y a</span><b>${fmtTime(Date.now() - s.meta.created)}</b></div><div><span>Insignes</span><b>🎖️ ${s.meta.insignia || 0}</b></div>
        </div>
        <h3>Bonus actifs</h3><div class="mods-grid">${keyMods.map(([k, n]) => `<div class="small">${esc(n)} <b class="${(k === 'upkeep' || k === 'market.fee') === (mods[k] < 0) ? 'ok' : (mods[k] < 0 ? 'bad' : 'ok')}">${['combat.morale'].includes(k) ? (mods[k] > 0 ? '+' : '') + Math.round(mods[k]) : (mods[k] > 0 ? '+' : '') + Math.round(mods[k] * 1000) / 10 + '%'}</b></div>`).join('') || '<span class="muted small">Aucun pour l’instant.</span>'}</div>
        ${Object.keys(s.territories).length ? `<h3>Territoires</h3><div class="small">${Object.values(s.territories).map((t) => `🚩 (${t.x},${t.y}) ${esc(TERRAINS[t.terrain].name)}`).join(' · ')}</div>` : ''}
      </div>

      <div class="card"><h2>🏅 Jalons</h2><p class="muted small">Objectifs infinis : chaque palier rapporte des ressources et un insigne.</p>
        ${ms.map((m) => `<div class="objective ${m.done ? 'done' : ''}"><div class="q-top"><b>${esc(m.title)} — palier ${m.tier + 1}</b><span>${fmt(m.value)} / ${fmt(m.target)} ${esc(m.unit)}</span></div>${bar(m.value, m.target)}
          <div class="quest-foot">${resChips(m.reward)} +🎖️1 ${m.done ? `<button class="mini good" data-action="milestone" data-id="${m.id}">Réclamer</button>` : ''}</div></div>`).join('')}
      </div></div>

      <div class="card"><h2>🗓️ ${esc(season.name)}</h2><p class="muted small">${esc(season.desc)} Fin dans ${fmtTime(season.remaining)}. Votre royaume conserve sa progression ; la saison apporte classements, titres et cosmétiques.</p>
        <div class="small">Points de saison : <b>${fmt(season.points)}</b> — gagnés en construisant, recherchant, combattant, explorant, forgeant et contre les boss.</div>
        <div class="season-track">${SEASON.tiers.map((t, i) => {
          const ok = season.points >= t.pts;
          return `<div class="season-tier ${ok ? 'reached' : ''} ${s.season.claimed[i] ? 'claimed' : ''}"><div class="pts">${t.pts}</div><div class="small">${esc(t.label)}</div>${ok && !s.season.claimed[i] ? `<button class="mini good" data-action="season" data-i="${i}">Réclamer</button>` : s.season.claimed[i] ? '<span class="ok small">✔</span>' : ''}</div>`;
        }).join('')}</div>
      </div>

      <div class="cols-2">
        <div class="card"><h2>🎨 Boutique cosmétique</h2>
          <p class="muted small">Aucune puissance à vendre : uniquement de la personnalisation, achetable avec des <b>insignes</b> gagnés en jouant (jalons, saison). Vous avez 🎖️ ${s.meta.insignia || 0}.</p>
          <div class="shop">${Object.entries(COSMETICS).map(([k, c]) => {
            const owned = s.meta.owned[k];
            const active = (c.type === 'banner' && s.meta.banner === c.color) || (c.type === 'theme' && s.meta.theme === k);
            return `<div class="shop-item ${owned ? 'owned' : ''}">${c.type === 'banner' ? `<span class="banner" style="--banner:${c.color}"></span>` : `<span class="shop-icon">${c.icon || '🎨'}</span>`}
              <div><b>${esc(c.name)}</b><div class="muted small">${{ banner: 'Bannière', theme: 'Thème de la ville', deco: 'Décoration (à placer sur une case libre)' }[c.type]}</div></div>
              ${owned ? (c.type === 'deco' ? '<span class="ok small">Possédée</span>' : `<button class="mini ${active ? 'good' : ''}" data-action="apply-cos" data-k="${k}">${active ? 'Actif' : 'Appliquer'}</button>`) : c.seasonal ? '<span class="muted small">Saison</span>' : `<button class="mini" data-action="buy-cos" data-k="${k}">🎖️ ${c.cost}</button>`}</div>`;
          }).join('')}</div></div>
        <div class="card"><h2>💾 Sauvegarde</h2>
          <p class="muted small">Sauvegarde automatique toutes les 15 s dans votre navigateur. Progression hors-ligne : jusqu’à 12 h.</p>
          <div class="row gap wrap"><button class="btn" data-action="save-now">💾 Sauvegarder</button><button class="btn" data-action="export">📤 Exporter</button><button class="btn" data-action="import">📥 Importer</button><button class="btn ghost danger" data-action="reset">🗑️ Nouvelle partie</button></div>
          <textarea id="save-box" class="save-box" placeholder="Code de sauvegarde…"></textarea>
          <h3>Comment jouer</h3><ul class="small">
            <li>Déblayez, construisez et placez intelligemment (bonus d’adjacence).</li>
            <li>Montez les chaînes : blé → farine → pain ; fer + charbon → acier ; peaux → cuir ; laine → tissu.</li>
            <li>Explorez avec des éclaireurs, récoltez les sites, nettoyez les zones dangereuses (plus de risque = plus de butin).</li>
            <li>Équipez et spécialisez vos héros : intendants ou commandants.</li>
            <li>Espionnez avant d’attaquer : terrain, météo, formation et composition décident des batailles.</li>
          </ul></div>
      </div>`;
  },
  actions: {
    rename: (app) => { const v = document.getElementById('k-name').value.trim(); if (v) { app.state.meta.kingdomName = v.slice(0, 28); app.render(); app.save(); } },
    title: (app, el) => { app.state.meta.title = el.value || null; app.render(); },
    milestone: (app, el) => app.act(() => claimMilestone(app.state, el.dataset.id), 'Jalon atteint !'),
    season: (app, el) => app.act(() => claimSeasonTier(app.state, +el.dataset.i), 'Récompense de saison !'),
    'buy-cos': (app, el) => app.act(() => buyCosmetic(app.state, el.dataset.k), 'Cosmétique acquis !'),
    'apply-cos': (app, el) => app.act(() => applyCosmetic(app.state, el.dataset.k)),
    'save-now': (app) => { saveGame(app.state); app.toast('Partie sauvegardée', 'good'); },
    export: (app) => { const box = document.getElementById('save-box'); box.value = exportSave(app.state); box.select(); app.toast('Code copié dans la zone de texte', 'good'); },
    import: (app) => {
      try {
        const st = importSave(document.getElementById('save-box').value);
        app.state = st; saveGame(st); app.toast('Sauvegarde importée', 'good'); location.reload();
      } catch (e) { app.toast('Code invalide : ' + e.message, 'bad'); }
    },
    reset: (app) => { if (confirm('Effacer définitivement votre royaume et recommencer ?')) { deleteSave(); app.state = null; location.reload(); } },
  },
};
