// Joueur simulé v18 « L'Armurerie » : toutes les 6 h de jeu, il équipe toute la troupe au mieux ; il pose deux règles
// de tri (démanteler les communs inutiles, vendre les rares inutiles) ; quand il a des gemmes brutes en réserve, il
// taille des éclats utiles et les sertit. Le profil Occasionnel ne touche à rien (il garde le comportement v17).
import { planAutoEquip, applyAutoEquip, lootRules, addLootRule, cutGem, autoSocket, heroRole, armoryState } from '../src/systems/armory.js';

const H = 3600000;
export function v18Bot(s, profileKey, t) {
  if (profileKey === 'casual') return;
  const A = armoryState(s);
  if (!lootRules(s).length) {
    addLootRule(s, { rarityMax: 'common', useful: 'useless', action: 'lootDismantle' });
    addLootRule(s, { rarityMax: 'rare', useful: 'useless', action: 'lootSell' });
  }
  if (t - (A._botEquip || 0) >= 6 * H) {
    A._botEquip = t;
    const plan = planAutoEquip(s);
    if (plan.changes.length) applyAutoEquip(s, plan, t);
  }
  if (t - (A._botGems || 0) >= 12 * H && (s.resources.gems || 0) >= 30 && (s.resources.crystals || 0) >= 10) {
    A._botGems = t;
    const h = [...s.heroes].filter((x) => !x.marchId).sort((a, b) => b.level - a.level)[0];
    if (!h) return;
    const role = heroRole(h);
    const type = role.kind === 'governor' ? 'emerald' : role.focus === 'war' ? 'ruby' : 'topaz';
    if (cutGem(s, type).ok) autoSocket(s, h.id);
  }
}
