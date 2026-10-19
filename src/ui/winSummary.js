// v17 — Ligne de résumé en haut des fenêtres : « qu'est-ce que je dois faire ici ? ». Une phrase, lue dans l'état.
import { TECHS } from '../data/techs.js';
import { techStatus, researchSlots } from '../systems/research.js';
import { objectivesBadge } from '../systems/campaign.js';
import { badges } from '../systems/notices.js';
import { RESOURCES, isCapped } from '../data/resources.js';
import { storageCap } from '../systems/economy.js';
import { computeMods } from '../systems/modifiers.js';
import { garrisonNeed } from '../systems/territory.js';

const pl = (n, one, many) => `${n} ${n > 1 ? many : one}`;
const SUMMARY = {
  goals: (app) => { const n = objectivesBadge(app.state); return n ? `👉 ${pl(n, 'récompense attend', 'récompenses attendent')} : réclamez-les.` : 'Suivez la quête mise en avant ; « Y aller » vous montre où agir.'; },
  research: (app) => { const s = app.state; const q = (s.queues.research || []).length; const slots = researchSlots(s); const av = Object.keys(TECHS).filter((t) => techStatus(s, t).status === 'available').length; return q < slots ? `👉 ${slots - q === 1 ? 'Une place de recherche est libre' : `${slots - q} places de recherche sont libres`} : ${pl(av, 'recherche disponible', 'recherches disponibles')}.` : 'Recherche en cours : rien à faire ici pour l’instant.'; },
  army: (app) => { const s = app.state; return (s.queues.train || []).length ? 'Formation en cours ; préparez la suivante ou envoyez vos troupes depuis la carte du monde.' : '👉 La caserne est au repos : choisissez une unité et une quantité, puis « Former ».'; },
  market: (app) => { const s = app.state, mods = computeMods(s); const full = Object.keys(RESOURCES).filter((r) => isCapped(r) && s.resources[r] >= storageCap(s, mods, r) * 0.95); return full.length ? `👉 Entrepôt presque plein (${full.slice(0, 3).map((r) => RESOURCES[r].name.toLowerCase()).join(', ')}) : vendez le surplus plutôt que de le perdre.` : 'Achetez ce qui vous manque, vendez vos surplus ; ▲ = prix en hausse, ▼ = en baisse.'; },
  defense: (app) => { const s = app.state; const r = (s.raids || []).length; const b = badges(s); return r ? `⚠️ ${pl(r, 'raid approche', 'raids approchent')} : répartissez la garnison sur les flancs ci-dessous.` : b.reports ? `👉 ${pl(b.reports, 'défaite à lire', 'défaites à lire')}.` : 'Aucune menace : renforcez la muraille et les douves à loisir.'; },
  heroes: (app) => { const idle = (app.state.heroes || []).filter((h) => !h.assignment && !h.marchId).length; return idle ? `👉 ${pl(idle, 'héros attend', 'héros attendent')} une affectation : gouverneur d’un secteur ou commandant.` : 'Vos héros sont tous affectés.'; },
  craft: (app) => ((app.state.queues.craft || []).length ? 'Un objet est en cours de forge.' : '👉 La forge est libre : choisissez un emplacement et un plan.'),
  territories: (app) => { const s = app.state; const weak = Object.values(s.territories || {}).filter((t) => (Object.values(t.garrison || {}).reduce((a, b) => a + b, 0)) < garrisonNeed(t)).length; return weak ? `⚠️ ${pl(weak, 'avant-poste manque', 'avant-postes manquent')} de garnison : « Garnison » envoie des troupes.` : 'Vos avant-postes sont gardés ; « Visiter » ouvre leur ville.'; },
  ecoReport: () => 'Ce qui entre et sort chaque heure ; les manques sont en tête, avec leurs gros consommateurs.',
  journal: () => 'Tous les rapports et la chronique ; les défaites non lues sont en tête du badge.',
  settings: () => 'Affichage, accessibilité et sauvegarde. Les réglages sont enregistrés avec la partie.',
};
export const winSummary = (app, id) => { try { return SUMMARY[id]?.(app) || ''; } catch { return ''; } };
