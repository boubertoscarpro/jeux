// « Pourquoi suis-je bloqué ? » : pour la prochaine étape du parcours, détecte le bâtiment demandé, ce qui
// empêche de le construire (prérequis, ressources) et propose des solutions, dont la plus utile selon le style
// du royaume (spécialisation, priorité royale).
import { BUILDINGS } from '../data/buildings.js';
import { RESOURCES } from '../data/resources.js';
import { computeMods } from './modifiers.js';
import { builtCountOf, countOf } from './city.js';
import { buildRequirement, getUpgradeInfo } from './construction.js';
import { missing, netRates } from './economy.js';

// Style de jeu dominant : spécialisation d'abord, puis priorité royale
const STYLE_OF_TYPE = { harvest: 'eco', iron: 'war', merchants: 'trade', scholars: 'know', pioneers: 'explore', bastions: 'war', shadows: 'war', ancients: 'know' };
const STYLE_TIP = {
  trade: 'Vendez un petit surplus au marché ou remplissez un contrat de cité pour financer le chantier.',
  war: 'Nettoyez un camp de bandits ou une forteresse de la Brèche : le butin couvre souvent ce qui manque.',
  explore: 'Envoyez vos éclaireurs : les villages abandonnés et les sites de récolte proches (bois, pierre) comblent vite le manque.',
  know: 'Lancez une recherche d’économie (outils, greniers) pendant que la production remplit les réserves.',
  eco: 'Affectez des ouvriers au secteur de la ressource manquante (Production → Ouvriers) et patientez.',
};
export function playStyle(state) {
  return STYLE_OF_TYPE[state.kingdom?.type] || state.policy?.id || 'eco';
}

export function nextBlocker(state, mission, now = Date.now()) {
  if (!mission) return null;
  const text = `${mission.title} ${mission.desc}`;
  const type = Object.keys(BUILDINGS).filter((t) => t !== 'deco').sort((a, b) => BUILDINGS[b].name.length - BUILDINGS[a].name.length)
    .find((t) => new RegExp(`(^|[^\\p{L}])${BUILDINGS[t].name}([^\\p{L}]|$)`, 'iu').test(text)); // limites de mot compatibles avec les accents
  if (!type || builtCountOf(state, type) > 0) return null;
  if (countOf(state, type) > 0) return { type, kind: 'building', text: `${BUILDINGS[type].name} en construction : patientez ou utilisez un passe-temps sur le chantier.` };
  const mods = computeMods(state, now);
  const req = buildRequirement(state, type);
  const solutions = [];
  let why;
  if (req) {
    why = `il faut d’abord : ${req.toLowerCase()}`;
    if (/Hôtel de ville/.test(req)) solutions.push('Améliorez l’hôtel de ville (il débloque les nouveaux bâtiments).');
    if (/Technologie/.test(req)) solutions.push('Recherchez la technologie demandée (Technologies).');
  } else {
    const cost = getUpgradeInfo(state, type, 1, mods).cost;
    const miss = missing(state, cost);
    if (!Object.keys(miss).length) return { type, kind: 'ready', text: `Vous pouvez construire ${BUILDINGS[type].name.toLowerCase()} dès maintenant (Royaume → bouton de construction).` };
    const net = netRates(state, mods);
    why = `il manque ${Object.entries(miss).map(([r, v]) => `${Math.ceil(v)} ${RESOURCES[r].name.toLowerCase()}`).join(', ')}`;
    for (const [r, v] of Object.entries(miss)) {
      const n = net[r] || 0;
      solutions.push(n > 0 ? `${RESOURCES[r].name} : attendre ≈ ${Math.ceil((v / n) * 60)} min au rythme actuel (${Math.round(n)}/h).` : `${RESOURCES[r].name} : votre production nette est nulle — construisez ou améliorez un producteur.`);
    }
  }
  const style = playStyle(state);
  return { type, kind: 'blocked', text: `Étape « ${mission.title} » bloquée : ${BUILDINGS[type].name} requis, ${why}.`, solutions, best: STYLE_TIP[style] || STYLE_TIP.eco, style };
}
