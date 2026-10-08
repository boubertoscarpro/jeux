import { RESOURCES, RES_ORDER } from '../../data/resources.js';
import { HERO_CLASSES, RARITIES } from '../../data/heroes.js';
import { fmt, fmtTime } from '../../core/util.js';
import { computeMods } from '../../systems/modifiers.js';
import { netRates, armyTotals } from '../../systems/economy.js';
import { totalLevels, thLevel } from '../../systems/city.js';
import { armyPower } from '../../systems/army.js';
import { heroPower } from '../../systems/heroes.js';
import { itemScore } from '../../systems/items.js';
import { revealedCount } from '../../systems/world.js';
import { esc } from '../components.js';

const REC = { biggestLoot: '🏆 Plus gros butin', bestExpedition: '🏆 Plus grande expédition', biggestVictory: '🏆 Plus grande victoire', bestCaravan: '🏆 Meilleure caravane', wealth: '🏆 Plus grande richesse' };

export default {
  id: 'stats', title: 'Statistiques', icon: '📊',
  render(app) {
    const s = app.state;
    const st = s.stats;
    const mods = computeMods(s);
    const net = netRates(s, mods);
    const wealth = Object.entries(s.resources).reduce((a, [r, v]) => a + v * (RESOURCES[r].price || 1), 0);
    if (!s.records.wealth || wealth > s.records.wealth.value) s.records.wealth = { value: wealth, label: `${fmt(wealth)} or de richesse totale`, t: Date.now() };
    const bestHero = [...s.heroes].sort((a, b) => heroPower(s, b) - heroPower(s, a))[0];
    const bestItem = [...s.inventory.items].sort((a, b) => itemScore(b) - itemScore(a))[0];
    const row = (l, v) => `<div><span>${l}</span><b>${v}</b></div>`;
    return `<div class="cols-2"><div class="card"><h2>📊 Statistiques</h2><div class="stats-grid">
      ${row('Temps de jeu actif', fmtTime(s.meta.playTime || 0))}${row('Âge du royaume', fmtTime(Date.now() - s.meta.created))}
      ${row('Hôtel de ville', thLevel(s))}${row('Niveaux de bâtiments', totalLevels(s))}
      ${row('Bâtiments construits/améliorés', st.built)}${row('Richesse totale', fmt(wealth) + ' or')}
      ${row('Expéditions', st.expeditions || 0)}${row('Distance parcourue', fmt(st.distance || 0) + ' lieues')}
      ${row('Explorations', st.explored)}${row('Cases connues', revealedCount(s.world))}
      ${row('Ressources récoltées', fmt(st.gathered))}${row('Ennemis vaincus', fmt(st.enemiesKilled || 0))}
      ${row('Victoires / défaites', `${st.battlesWon} / ${st.battlesLost}`)}${row('Donjons purgés', st.dungeons || 0)}
      ${row('Guerres déclarées', st.wars || 0)}${row('Raids repoussés / subis', `${st.raidsRepelled} / ${st.raidsLost || 0}`)}
      ${row('Territoires', Object.keys(s.territories).length)}${row('Boss vaincus', st.bossKills)}
      ${row('Échanges commerciaux', st.trades)}${row('Contrats honorés', st.contracts || 0)}
      ${row('Caravanes attaquées', st.caravansAttacked || 0)}${row('Incendies', st.fires || 0)}
      ${row('Ordres exécutés', st.ordersRun || 0)}${row('Objets forgés', st.crafted)}
      ${row('Ouvriers', s.workers.length)}${row('Puissance militaire', fmt(armyPower(armyTotals(s))))}
      ${row('Dynasties fondées', s.dynasty?.count || 0)}${row('Artefacts', Object.keys(s.artifacts || {}).length)}
      </div>
      <h3>Records personnels</h3>${Object.entries(REC).map(([k, l]) => `<div class="record">${l} : <b>${s.records[k] ? esc(s.records[k].label) : '—'}</b></div>`).join('')}
      <div class="record">🏆 Meilleur héros : <b>${bestHero ? `${HERO_CLASSES[bestHero.cls].icon} ${esc(bestHero.name)} (niv. ${bestHero.level}, puissance ${heroPower(s, bestHero)})` : '—'}</b></div>
      <div class="record">🏆 Meilleur équipement : <b>${bestItem ? `<span style="color:${RARITIES[bestItem.rarity].color}">${esc(bestItem.name)}${bestItem.plus ? ' +' + bestItem.plus : ''}</span> (score ${itemScore(bestItem)})` : '—'}</b></div>
      </div>
      <div class="card"><h2>📦 Ressources</h2><div class="table-wrap"><table><thead><tr><th>Ressource</th><th>Stock</th><th>/ heure</th><th>Produit</th><th>Dépensé</th></tr></thead><tbody>
      ${RES_ORDER.map((r) => `<tr><td>${RESOURCES[r].icon} ${esc(RESOURCES[r].name)}</td><td class="num">${fmt(s.resources[r] || 0)}</td><td class="num ${(net[r] || 0) < 0 ? 'bad' : ''}">${net[r] ? fmt(net[r]) : '—'}</td><td class="num">${fmt(st.produced?.[r] || 0)}</td><td class="num">${fmt(st.spent?.[r] || 0)}</td></tr>`).join('')}
      </tbody></table></div></div></div>`;
  },
};
