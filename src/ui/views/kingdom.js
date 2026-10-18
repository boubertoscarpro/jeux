import { coatSvg, bannerSvg, sealSvg } from '../heraldry.js';
import { heraldryOf, tinctures, setHeraldry } from '../../systems/heraldry.js';
import { FIELDS, CHARGES, BANNER_SHAPES, SEAL_SHAPES, MOTTO_MAX } from '../../data/heraldry.js';
import { COSMETICS, SEASON } from '../../data/social.js';
import { TERRAINS } from '../../data/world.js';
import { fmt, fmtTime } from '../../core/util.js';
import { computeMods } from '../../systems/modifiers.js';
import { thLevel, totalLevels } from '../../systems/city.js';
import { eraOf } from '../../data/eras.js';
import { armyPower } from '../../systems/army.js';
import { armyTotals } from '../../systems/economy.js';
import { revealedCount, territoryLimit } from '../../systems/world.js';
import { milestoneList, claimMilestone, seasonInfo, claimSeasonTier, buyCosmetic, applyCosmetic } from '../../systems/quests.js';
import { exportSave, importSave, deleteSave, saveGame } from '../../core/save.js';
import { esc, resChips, bar } from '../components.js';
import { kingdomBadge } from '../creation.js';
import { kingdomDef, originDef, difficultyDef } from '../../systems/kingdom.js';
import { castleName, outpostLabel, renameKingdom } from '../../systems/identity.js';
import { openRenameCastle, openRenameOutpost } from '../upgrades.js';

const MOD_NAMES = {
  'prod.all': 'Toute production', 'prod.food': 'Nourriture', 'prod.wood': 'Bois', 'prod.stone': 'Pierre', 'prod.iron': 'Fer', 'prod.gold': 'Or', 'prod.steel': 'Acier',
  'combat.atk': 'Attaque', 'combat.def': 'Défense', 'combat.morale': 'Moral', 'gather.all': 'Récolte', 'loot.rare': 'Butin rare', 'march.speed': 'Vitesse de marche',
  'explore.speed': 'Exploration', 'build.speed': 'Construction', 'research.speed': 'Recherche', 'train.speed': 'Formation', 'city.def': 'Défense de la ville', upkeep: 'Entretien',
  'craft.quality': 'Qualité de forge', 'market.fee': 'Taxe', carry: 'Transport',
};

// Armoiries : écu, bannière et sceau, gratuits et purement cosmétiques (affichés en haut de l'écran, sur la carte,
// dans les rapports, la chronique et les archives dynastiques)
function heraldryCard(s) {
  const h = heraldryOf(s), T = tinctures(s);
  const sel = (k, opts, label) => `<div class="form-row"><label>${label}</label><select data-change="her" data-k="${k}">${Object.entries(opts).map(([v, o]) => `<option value="${v}" ${h[k] === v ? 'selected' : ''}>${esc(typeof o === 'string' ? o : o.name)}</option>`).join('')}</select></div>`;
  return `<div class="card heraldry-card"><h2>🛡️ Armoiries de la dynastie</h2>
    <p class="muted small">Gratuites et purement décoratives. Les bannières gagnées (insignes, défis de maîtrise) ajoutent leurs couleurs à la palette.</p>
    <div class="her-grid"><div class="her-preview">${coatSvg(s, 96)}${bannerSvg(s, 72)}${sealSvg(s, 64)}</div>
      <div class="her-form">${sel('field', FIELDS, 'Partition')}${sel('t1', T, 'Émail principal')}${sel('t2', T, 'Second émail')}${sel('charge', CHARGES, 'Figure')}${sel('banner', BANNER_SHAPES, 'Bannière')}${sel('seal', SEAL_SHAPES, 'Sceau')}
        <div class="form-row"><label>Devise</label><input type="text" maxlength="${MOTTO_MAX}" value="${esc(h.motto)}" data-change="her" data-k="motto" placeholder="Ex. : Par la pierre et la cendre"></div></div></div></div>`;
}

const kingdomView = {
  id: 'kingdom', title: 'Saison & boutique', icon: '👑',
  badge: (app) => SEASON.tiers.filter((t, i) => !app.state.season.claimed[i] && app.state.season.points >= t.pts).length,
  render(app) {
    const s = app.state;
    const mods = computeMods(s);
    const season = seasonInfo(s);
    const st = s.stats;
    const ms = milestoneList(s);
    const keyMods = Object.entries(MOD_NAMES).filter(([k]) => Math.abs(mods[k] || 0) > 0.001);
    const part = this._part || 'season';
    if (part === 'profile') return `<div class="cols-2">
      <div class="card"><h2>👑 ${esc(s.meta.kingdomName)}</h2>
        <div class="form-row"><label>Nom du royaume</label><input id="k-name" value="${esc(s.meta.kingdomName)}" maxlength="28" aria-label="Nom du royaume"><button class="mini" data-action="rename">OK</button></div>
        ${s.meta.titles?.length ? `<div class="form-row"><label>Titre</label><select data-change="title" id="k-title"><option value="">— Aucun —</option>${s.meta.titles.map((t) => `<option ${s.meta.title === t ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></div>` : ''}
        <div class="stats-grid">
          <div><span>Hôtel de ville</span><b>${thLevel(s)}</b></div><div><span>Ère</span><b>${eraOf(thLevel(s)).icon} ${esc(eraOf(thLevel(s)).name)}</b></div><div><span>Niveaux de bâtiments</span><b>${totalLevels(s)}</b></div>
          <div><span>Puissance militaire</span><b>${fmt(armyPower(armyTotals(s)))}</b></div><div><span>Héros</span><b>${s.heroes.length}</b></div>
          <div><span>Technologies</span><b>${Object.keys(s.techs).length}</b></div><div><span>Cases explorées</span><b>${fmt(revealedCount(s.world))}</b></div>
          <div><span>Victoires / défaites</span><b>${st.battlesWon} / ${st.battlesLost}</b></div><div><span>Raids repoussés</span><b>${st.raidsRepelled}</b></div>
          <div><span>Ressources récoltées</span><b>${fmt(st.gathered)}</b></div><div><span>Objets forgés</span><b>${st.crafted}</b></div>
          <div><span>Territoires</span><b>${Object.keys(s.territories).length}/${territoryLimit(s, mods)}</b></div><div><span>Boss vaincus</span><b>${st.bossKills}</b></div>
          <div><span>Royaume fondé il y a</span><b>${fmtTime(Date.now() - s.meta.created)}</b></div><div><span>Insignes</span><b>🎖️ ${s.meta.insignia || 0}</b></div>
        </div>
        <h3>Spécialisation</h3><div class="row gap wrap">${kingdomBadge(s)}<span class="small muted">${esc(originDef(s).icon + ' ' + originDef(s).name)} · ${esc(difficultyDef(s).icon + ' ' + difficultyDef(s).name)}</span></div>
        <div class="small"><span class="ok">${kingdomDef(s).bonuses.map(esc).join(' · ')}</span><br><span class="bad">${kingdomDef(s).maluses.map(esc).join(' · ')}</span></div>
        <h3>Bonus actifs</h3><div class="mods-grid">${keyMods.map(([k, n]) => `<div class="small">${esc(n)} <b class="${(k === 'upkeep' || k === 'market.fee') === (mods[k] < 0) ? 'ok' : (mods[k] < 0 ? 'bad' : 'ok')}">${['combat.morale'].includes(k) ? (mods[k] > 0 ? '+' : '') + Math.round(mods[k]) : (mods[k] > 0 ? '+' : '') + Math.round(mods[k] * 1000) / 10 + '%'}</b></div>`).join('') || '<span class="muted small">Aucun pour l’instant.</span>'}</div>
        <h3>Identité du royaume</h3>
        <div class="identity-list">
          <div class="id-row"><span>👑 Royaume</span><b>${esc(s.meta.kingdomName)}</b></div>
          <div class="id-row"><span>🏰 Capitale (château principal)</span><b>${esc(castleName(s))}</b><button class="mini ghost" data-action="rename-castle">✎ Renommer</button></div>
          ${Object.entries(s.territories).map(([k, t]) => `<div class="id-row"><span>🚩 Avant-poste · ${esc(TERRAINS[t.terrain].name)} (${t.x}, ${t.y})</span><b>${esc(outpostLabel(t))}</b><button class="mini ghost" data-action="rename-outpost" data-k="${esc(k)}">✎ Renommer</button></div>`).join('')}
        </div>
        <details class="small muted"><summary>Identifiants techniques</summary>Joueur ${esc(s.identity?.playerId || '')} · royaume ${esc(s.identity?.kingdomId || '')} · château ${esc(s.identity?.castleId || '')}. Ils identifient vos données indépendamment des noms (préparation d’un éventuel mode multijoueur ; le jeu reste entièrement solo).</details>
      </div>

      <div class="card"><h2>🏅 Jalons</h2><p class="muted small">Objectifs infinis : chaque palier rapporte des ressources et un insigne.</p>
        ${ms.map((m) => `<div class="objective ${m.done ? 'done' : ''}"><div class="q-top"><b>${esc(m.title)} — palier ${m.tier + 1}</b><span>${fmt(m.value)} / ${fmt(m.target)} ${esc(m.unit)}</span></div>${bar(m.value, m.target)}
          <div class="quest-foot">${resChips(m.reward)} +🎖️1 ${m.done ? `<button class="mini good" data-action="milestone" data-id="${m.id}">Réclamer</button>` : ''}</div></div>`).join('')}
      </div></div>

      ${heraldryCard(s)}
`;
    if (part === 'settings') return `      <div class="cols-2">
        <div class="card"><h2>🖥️ Affichage et confort</h2>
          <p class="muted small">Ces réglages sont enregistrés avec la partie. « Auto » suit la préférence de votre système (réduction des animations).</p>
          <div class="form-row"><label>Animations</label><div class="seg">${[['auto', 'Auto'], ['reduced', 'Réduites'], ['full', 'Complètes']].map(([k, l]) => `<button class="mini ${(s.meta.motion || 'auto') === k ? 'selected' : ''}" data-action="pref-motion" data-k="${k}">${l}</button>`).join('')}</div></div>
          <div class="form-row"><label>Qualité graphique</label><div class="seg">${[['low', 'Basse'], ['medium', 'Moyenne'], ['high', 'Élevée']].map(([k, l]) => `<button class="mini ${(s.meta.gfx || 'medium') === k ? 'selected' : ''}" data-action="pref-gfx" data-k="${k}">${l}</button>`).join('')}</div></div>
          <p class="small muted">Basse : cartes moins détaillées (pas d’arbres ni de montagnes dessinés), idéale pour un appareil ancien. Élevée : terrain plus fin et transitions adoucies.</p>
          <div class="form-row"><label>Économie d’énergie</label><div class="seg">${[[false, 'Non'], [true, 'Oui']].map(([k, l]) => `<button class="mini ${!!s.meta.saver === k ? 'selected' : ''}" data-action="pref-saver" data-k="${k}">${l}</button>`).join('')}</div></div>
          <p class="small muted">Aucune animation continue (météo, flammes, eau) et carte du monde redessinée seulement quand elle change : utile sur batterie.</p>
          <div class="form-row"><label>Densité</label><div class="seg">${[['normal', 'Confortable'], ['compact', 'Compacte']].map(([k, l]) => `<button class="mini ${(s.meta.density || 'normal') === k ? 'selected' : ''}" data-action="pref-density" data-k="${k}">${l}</button>`).join('')}</div></div>
          <div class="form-row"><label>Aides</label><div class="seg"><button class="mini ${s.meta.tipsOff ? '' : 'selected'}" data-action="tips-toggle">${s.meta.tipsOff ? 'Fiches désactivées' : 'Fiches de tutoriel actives'}</button></div></div>
        </div>
        <div class="card"><h2>💾 Sauvegarde</h2>
          <p class="muted small">Sauvegarde automatique toutes les 15 s dans votre navigateur (avec une copie de secours toutes les 10 min). Format de sauvegarde v${s.version}. Progression hors-ligne : jusqu’à 12 h.</p>
          <div class="row gap wrap"><button class="btn" data-action="tips-toggle">${s.meta.tipsOff ? '📘 Réactiver les conseils' : '📘 Désactiver les conseils'}</button><button class="btn" data-action="save-now">💾 Sauvegarder</button><button class="btn" data-action="save-file">⬇️ Télécharger (.json)</button><button class="btn" data-action="export">📤 Code texte</button><label class="btn">📂 Charger un fichier<input type="file" accept=".json,application/json,text/plain" data-change="import-file" hidden></label><button class="btn" data-action="import">📥 Importer le code</button><button class="btn ghost danger" data-action="reset">🗑️ Nouvelle partie</button></div>
          <textarea id="save-box" class="save-box" placeholder="Code de sauvegarde…"></textarea>
          <h3>Comment jouer</h3><ul class="small">
            <li>Déblayez, construisez et placez intelligemment (bonus d’adjacence).</li>
            <li>Montez les chaînes : blé → farine → pain ; fer + charbon → acier ; peaux → cuir ; laine → tissu.</li>
            <li>Explorez avec des éclaireurs, récoltez les sites, nettoyez les zones dangereuses (plus de risque = plus de butin).</li>
            <li>Équipez et spécialisez vos héros : intendants ou commandants.</li>
            <li>Espionnez avant d’attaquer : terrain, météo, formation et composition décident des batailles.</li>
          </ul></div>
      </div>`;
    return `      <div class="card"><h2>🗓️ ${esc(season.name)}</h2><p class="muted small">${esc(season.desc)} Fin dans ${fmtTime(season.remaining)}. Votre royaume conserve sa progression ; la saison apporte classements, titres et cosmétiques.</p>
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
              ${owned ? (c.type === 'deco' ? '<span class="ok small">Possédée</span>' : `<button class="mini ${active ? 'good' : ''}" data-action="apply-cos" data-k="${k}">${active ? 'Actif' : 'Appliquer'}</button>`) : c.seasonal ? '<span class="muted small">Saison</span>' : c.exclusive ? '<span class="tag-ex" title="Roue des Anciens ou événements uniquement">Exclusif</span>' : `<button class="mini" data-action="buy-cos" data-k="${k}">🎖️ ${c.cost}</button>`}</div>`;
          }).join('')}</div></div>
      </div>`;
  },
  actions: {
    her: (app, el) => app.act(() => setHeraldry(app.state, { [el.dataset.k]: el.value })),
    rename: (app) => app.act(() => renameKingdom(app.state, document.getElementById('k-name').value), (r) => `👑 Royaume renommé : ${r.name}`),
    'rename-castle': (app) => openRenameCastle(app),
    'rename-outpost': (app, el) => openRenameOutpost(app, el.dataset.k),
    title: (app, el) => { app.state.meta.title = el.value || null; app.render(); },
    milestone: (app, el) => app.act(() => claimMilestone(app.state, el.dataset.id), 'Jalon atteint !'),
    season: (app, el) => app.act(() => claimSeasonTier(app.state, +el.dataset.i), 'Récompense de saison !'),
    'buy-cos': (app, el) => app.act(() => buyCosmetic(app.state, el.dataset.k), 'Cosmétique acquis !'),
    'apply-cos': (app, el) => app.act(() => applyCosmetic(app.state, el.dataset.k)),
    'save-now': (app) => app.save(true),
    'pref-motion': (app, el) => { app.state.meta.motion = el.dataset.k; app.applyPrefs(); app.render(); app.save(); },
    'pref-gfx': (app, el) => { app.state.meta.gfx = el.dataset.k; app.applyPrefs(); app.render(); app.save(); },
    'pref-saver': (app, el) => { app.state.meta.saver = el.dataset.k === 'true'; app.applyPrefs(); app.render(); app.save(); },
    'pref-density': (app, el) => { app.state.meta.density = el.dataset.k; app.applyPrefs(); app.render(); app.save(); },
    'tips-toggle': (app) => { app.state.meta.tipsOff = !app.state.meta.tipsOff; if (!app.state.meta.tipsOff) app.state.meta.tipsSeen = {}; app.render(); },
    'import-file': (app, el) => {
      const f = el.files?.[0];
      if (!f) return;
      if (f.size > 20 * 1024 * 1024) return app.toast('Fichier trop volumineux pour une sauvegarde', 'bad');
      f.text().then((t) => { document.getElementById('save-box').value = t; app.toast('Fichier chargé : cliquez sur « Importer le code »', 'good'); });
    },
    'save-file': (app) => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([JSON.stringify(app.state)], { type: 'application/json' }));
      a.download = `cendrelande-${app.state.meta.kingdomName.replace(/[^\w-]+/g, '_')}-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      app.toast('Fichier de sauvegarde téléchargé', 'good');
    },
    export: (app) => { const box = document.getElementById('save-box'); box.value = exportSave(app.state); box.select(); app.toast('Code copié dans la zone de texte', 'good'); },
    import: (app) => {
      try {
        const st = importSave(document.getElementById('save-box').value);
        if (!confirm(`Remplacer la partie actuelle par « ${st.meta.kingdomName} » ? Pensez à exporter la partie actuelle d’abord.`)) return;
        const r = saveGame(st);
        if (!r.ok) return app.toast(r.error, 'bad');
        app.state = null; location.reload();
      } catch (e) { app.toast('Code invalide : ' + e.message, 'bad'); }
    },
    reset: (app) => app.confirm('<h3>🗑️ Nouvelle partie</h3><p>Effacer définitivement ce royaume et en fonder un nouveau ? Vous pourrez choisir une autre spécialisation, origine et difficulté.</p><p class="small muted">Conseil : téléchargez d’abord votre sauvegarde (.json) si vous voulez pouvoir y revenir.</p>', 'Effacer et recommencer', () => { deleteSave(); app.state = null; location.reload(); }),
  },
};
export default kingdomView;
// v16 « Le Château » : le profil (médaillon aux armoiries) et les réglages (engrenage) reprennent les cartes de cet
// écran ; mêmes actions
export const profileView = { ...kingdomView, id: 'profile', title: 'Profil', icon: '🛡️', _part: 'profile', badge: (app) => milestoneList(app.state).filter((m) => m.done).length };
export const settingsView = { ...kingdomView, id: 'settings', title: 'Réglages', icon: '⚙️', _part: 'settings', badge: null };

