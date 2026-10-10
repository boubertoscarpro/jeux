// Aide contextuelle : un bouton « ❓ Aide » sur chaque écran principal. Explications simples des mécanismes,
// coûts, prérequis et conséquences, et des fonctionnalités encore verrouillées (avec la façon de les débloquer).
import { esc } from './components.js';

const H = {
  city: { title: '🏰 Le royaume', sections: [
    ['Construire et améliorer', 'Cliquez sur une case libre pour construire, sur un bâtiment pour voir sa fiche. Le niveau de l’<b>hôtel de ville</b> limite celui de tous les autres bâtiments et débloque de nouvelles constructions.'],
    ['Icônes de la carte', '<b>⬆ vert</b> : amélioration possible maintenant (ressources, prérequis et place dans la file réunis). <b>⬆ gris</b> : amélioration bloquée (ressources manquantes ou file pleine) — survolez pour la raison. <b>🔨</b> : chantier en cours. <b>!</b> : manque de matières premières. <b>🔥</b> : bâtiment endommagé. Le compteur « améliorations disponibles » ouvre la liste complète ; le bouton 👁 masque les icônes.'],
    ['Placement', 'Le bonus d’adjacence compte : scierie près d’une forêt +15 %, carrière ou mine près d’une montagne +15 %, ferme au bord de la rivière +10 %. En mode placement, chaque case affiche le bonus qu’y obtiendrait le bâtiment. Une route reliée à l’hôtel de ville donne +5 %.'],
    ['Coûts et file', 'Chaque niveau coûte environ 55 % de plus que le précédent ; à partir du niveau 6, du fer, puis de l’acier et du minerai rare sont demandés. La file de construction est limitée : si elle est pleine, l’amélioration peut être planifiée et démarrera seule.'],
    ['Navigation', 'Glisser pour déplacer, molette ou pincement pour zoomer (centré sur le curseur), ⤢ pour la vue d’ensemble, 🏛️ pour revenir au château. Les noms apparaissent en vue rapprochée.'],
    ['Château principal', 'Le nom du château se change depuis la fiche de l’hôtel de ville (✎ Renommer). Il apparaît sur les deux cartes et dans les rapports.'],
  ] },
  goals: { title: '🎯 Objectifs', sections: [
    ['Tableau de bord', 'En haut : la prochaine mission du parcours, les quêtes en cours, les missions du royaume et toutes les récompenses à récupérer.'],
    ['Quêtes du royaume', 'Des chaînes en plusieurs étapes (histoire, développement, exploration, militaire, commerce, diplomatie, avant-postes). Chaque étape compte ce que vous faites <b>après</b> son ouverture.'],
    ['Missions du royaume', 'Au plus 3 missions proposées d’après l’état réel du royaume, facultatives, sans pénalité si elles expirent. Une mission devenue impossible peut être remplacée gratuitement ; vous pouvez aussi en refuser une toutes les 30 min.'],
    ['Jouer librement', 'Rien n’est obligatoire : le conseiller se règle (complet, réduit, désactivé) et chaque conseil peut être reporté ou ignoré.'],
  ] },
  world: { title: '🗺️ La carte du monde', sections: [
    ['Explorer', 'Les cases sombres sont inexplorées : sélectionnez-en une et envoyez des éclaireurs. Les découvertes peuvent déclencher des choix.'],
    ['Lieux', 'Médaillon vert : ressource à récolter. Rouge : menace (camp, repaire). Violet : donjon ou ruine. Or : cité ou royaume. Les barres sous un lieu indiquent son danger ; plus il est dangereux, plus il rapporte. Espionnez avant d’attaquer pour connaître vos chances.'],
    ['Territoires', 'Teinte et contour aux couleurs de votre bannière : vos avant-postes. Contour rouge : faction ennemie (en guerre). Vert : alliée ou pacte. Pointillés : neutre. Le cercle doré pointillé marque la portée où vous pouvez établir un avant-poste.'],
    ['Armées', 'Chaque marche est un pion orienté vers sa destination, avec son chrono en vue rapprochée. Un trait rouge épais est un <b>raid</b> qui vient vers votre château.'],
    ['Navigation', 'Molette ou pincement pour zoomer, mini-carte et « Aller à… » pour se rendre à un lieu, survol pour une fiche rapide.'],
  ] },
  territories: { title: '🚩 Avant-postes', sections: [
    ['Établir', 'Sur la carte, une case explorée, nettoyée et à portée peut accueillir un avant-poste (coût croissant). Il reçoit un nom médiéval, modifiable à tout moment.'],
    ['Spécialités', 'Chaque terrain propose plusieurs voies : forestière, minière, agricole, commerciale, militaire ou du savoir. L’<b>affinité</b> (cases favorables dans un rayon de 2, gisements à 3 cases) augmente production et bonus jusqu’à +30 %. Une reconversion coûte de l’or et ramène au niveau 1.'],
    ['Entretien et garnison', '8 soldats par niveau sont nécessaires ; sans eux, la production chute de 70 % et les attaques sont deux fois plus probables. L’entretien (or, nourriture) impayé arrête la production.'],
    ['Menaces', 'Un événement peut annoncer une attaque 2 h à l’avance : engagez des mercenaires, envoyez des troupes ou évacuez les réserves.'],
  ] },
  factions: { title: '🕊️ Factions', sections: [
    ['Relations', 'Ambassadeurs, cadeaux, contrats et choix des événements font évoluer la relation. Un pacte commercial supprime les raids de cette faction ; la guerre les multiplie.'],
    ['Lisibilité', 'Sur la carte, la couleur du contour d’un territoire indique sa relation avec vous (rouge : ennemi, vert : allié, pointillé : neutre).'],
  ] },
  army: { title: '⚔️ Armée', sections: [
    ['Former', 'La caserne forme l’infanterie et les archers, l’écurie la cavalerie, l’atelier le siège. Chaque unité consomme de la nourriture : une armée trop grande provoque la famine.'],
    ['Combattre', 'Lanciers contre cavalerie, cavalerie contre archers, archers contre infanterie. Le terrain, la météo, le moral et la formation comptent. L’aperçu indique l’issue probable avant d’envoyer.'],
    ['Défendre', 'Les troupes restées au château défendent contre les raids avec le bonus de la muraille. La tour de garde niveau 3 révèle la composition des raids.'],
  ] },
  ecoReport: { title: '⛏️ Production', sections: [
    ['Bilan', 'Production et consommation par heure, pénuries prévues, chaînes bloquées et pertes. Un bilan négatif finit par vider le stock.'],
    ['Chaînes', 'Ferme → moulin → boulangerie ; mine + charbonnière → fonderie → armurerie. Un bâtiment de chaîne sans matière première tourne au ralenti (« ! » sur la carte).'],
    ['Automatisation', 'Intendance (paliers), ouvriers, expéditions, priorités et Ordres du royaume se débloquent avec l’hôtel de ville.'],
  ] },
  market: { title: '⚖️ Commerce', sections: [
    ['Marché', 'Achetez et vendez ; la taxe baisse avec le niveau du marché. Les prix varient avec les saisons, les guerres et les rumeurs.'],
    ['Caravanes et contrats', 'Les cités paient +60 % pour leurs ressources demandées. Les contrats exigent des marchandises produites par votre royaume.'],
    ['Débloquer', 'Le marché demande l’hôtel de ville 2.'],
  ] },
  research: { title: '🔬 Technologies', sections: [
    ['Recherche', 'La bibliothèque (hôtel de ville 2) ouvre l’arbre technologique. Chaque niveau de bibliothèque accélère les recherches de 5 %. Ne la laissez jamais inactive.'],
    ['Prérequis', 'Une technologie verrouillée indique les recherches qu’elle demande ; le conseiller suggère une branche adaptée à votre spécialisation.'],
  ] },
  heroes: { title: '🧙 Héros', sections: [
    ['Recruter', 'La taverne (hôtel de ville 2) recrute des héros ; son niveau augmente la rareté et le nombre de places.'],
    ['Utiliser', 'Un héros commande une marche, ou administre un secteur comme intendant. La forge et le laboratoire équipent vos héros.'],
  ] },
};
// Les sous-écrans partagent l'aide de leur catégorie
const ALIAS = { steward: 'ecoReport', workers: 'ecoReport', expeditions: 'ecoReport', chains: 'ecoReport', convoys: 'market', talents: 'research', craft: 'heroes' };
export const helpFor = (viewId) => H[viewId] || H[ALIAS[viewId]] || null;

export function openHelp(app, viewId, group) {
  const h = helpFor(viewId);
  if (!h) return;
  const locked = (group?.tabs || []).map((t) => ({ t, l: t.locked?.(app) })).filter((x) => x.l);
  app.modal(`<h2>❓ ${esc(h.title)}</h2>
    ${h.sections.map(([t, body]) => `<h4>${esc(t)}</h4><p class="small">${body}</p>`).join('')}
    ${locked.length ? `<h4>Encore verrouillé</h4>${locked.map(({ t, l }) => `<p class="small">🔒 <b>${esc(t.title)}</b> : ${esc(l)}</p>`).join('')}` : ''}
    <div class="row gap wrap"><button class="btn" data-action="goto" data-view="journal">📘 Revoir les fiches du tutoriel</button><button class="btn ghost" data-action="advisor">🧙‍♂️ Demander au conseiller</button><button class="btn ghost" data-action="close-modal">Fermer</button></div>`, {}, 'wide');
}
