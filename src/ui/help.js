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
    ['Acheminement', 'La production d’un avant-poste doit rejoindre le château : au-delà de 3 cases, 1,5 % se perd par case, plus 5 % par lieu dangereux non nettoyé près du trajet (et davantage à travers le territoire d’une faction en guerre). Les routes (chemin empierré, route royale, route pavée et gardée) réduisent ces pertes et augmentent la capacité, contre un entretien en or. Un avant-poste relié par une route sert de relais : les plus lointains y font transiter leurs marchandises. Sous 70 % d’acheminement, la garnison est mal ravitaillée (stabilité −8) ; un convoi de rations la nourrit 24 h.'],
    ['Stabilité', 'Chaque province a une stabilité (0 à 100) qui tend vers une cible : garnison complète +10 (sinon −15), royaume nourri +5 (famine −20), impôts légers +12 ou lourds −15, proximité du château +5 (éloignement −5), pillage −15, défenses réussies, festivités +15. Prospère : +10 % de production ; mécontente : −20 % ; en révolte : −50 %. Une province très agitée demande audience : concessions, répression ou révolte ouverte.'],
  ] },
  factions: { title: '🕊️ Factions', sections: [
    ['Mémoire', 'Chaque faction se souvient de vos actes : guerres, trahisons, pactes, commerce durable, pillages, interventions dans les chroniques. Un souvenir s’estompe de moitié en 3 jours et pèse sur la relation pendant ce temps. Une faction très rancunière devient rivale déclarée et peut lancer un ultimatum ; une faction alliée de longue date devient un allié de confiance (petits bonus).'],
    ['Désamorcer', 'Chaque faction affiche ce qu’elle cherche (territoire, commerce, savoir, tranquillité). Réparations, excuses publiques ou un geste qui répond à son ambition apaisent sa rancune (un geste toutes les 12 h).'],
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
    ['Plans de forge', 'Un plan fixe le modèle d’un objet et vous laisse choisir son effet spécial (pour la cavalerie, la défense, le siège…). Plans : donjons vidés (une chance sur trois), mystères archéologiques, factions en accord commercial ou alliées, héros de niveau 8 (forgeron, général, explorateur), expérimentation de matériaux rares à l’atelier.'],
    ['Atelier spécialisé', 'Armes, armures ou orfèvrerie : qualité +25 % et coût −15 % pour cette famille, +10 % de coût pour les autres. Premier choix gratuit, puis 1 000 or et 24 h entre deux réorganisations.'],
  ] },
};
H.policy = { title: '👑 Priorité royale', sections: [
  ['Principe', 'Une orientation générale du royaume : Prospérité (production), Défense (garnisons, fortifications), Expansion (exploration, avant-postes) ou Commerce (caravanes, contrats). Chacune a des avantages et un coût affichés ; aucune n’est meilleure en tout.'],
  ['Changer', 'Une réorganisation d’une heure suit chaque changement (aucun effet pendant ce temps), puis il faut attendre 4 h avant d’en changer à nouveau. Revenir à l’Équilibre est immédiat.'],
  ['Liens', 'La priorité oriente les missions du royaume proposées et peut aligner l’ordre des secteurs d’ouvriers (Intendance, palier 4).'],
] };

H.projects = { title: '🏗️ Grands projets royaux', sections: [
  ['Principe', 'Un chantier de longue haleine en 3 étapes (pont, aqueduc, forteresse, bibliothèque, route commerciale, sanctuaire). Un seul à la fois.'],
  ['Financer', 'Apportez les ressources en plusieurs fois (« Apporter », « Tout apporter » ou « la moitié de mes stocks » pour garder de quoi construire). Rien n’est perdu tant que le projet continue.'],
  ['Travaux', 'Une étape financée se lance si ses conditions sont remplies (bâtiment, avant-poste d’une spécialité, technologies, armée…). Les travaux durent quelques heures.'],
  ['Récompense', 'Des bonus permanents modestes et un repère sur la carte du monde. Abandonner rend la moitié des apports de l’étape en cours ; les étapes achevées sont perdues.'],
] };

H.campaigns = { title: '🎖️ Campagnes militaires', sections: [
  ['Principe', 'Trois opérations contre une faction : sécuriser le col, prendre le fort frontalier, puis un objectif final au choix. Chaque succès rend la suite plus facile et affaiblit durablement la faction.'],
  ['Engager ses troupes', 'Vous choisissez la part de l’armée engagée ; ces soldats quittent le château pendant l’opération (40 à 90 min). Gardez une garnison si un raid menace. Votre meilleur héros disponible accompagne l’opération et gagne de l’expérience.'],
  ['Risques', 'L’aperçu donne l’issue probable et les pertes estimées. Deux revers terminent la campagne (relation en baisse) ; il faut ensuite 12 h de repos.'],
] };
H.shop = { title: '💎 Comptoir du Joaillier', sections: [
  ['Monnaie', 'Uniquement des ressources rares gagnées en jeu : gemmes, cristaux, argent, minerai rare, bois ancien. Rien ne s’achète avec de l’argent réel.'],
  ['Limites', 'Chaque article a une quantité quotidienne, renouvelée à minuit, pour ne pas remplacer la forge, le laboratoire ou la production.'],
  ['Où trouver ces ressources', 'Donjons, grottes et gisements rares de la carte, avant-postes spécialisés (cristaux, mines profondes, bois de cœur), contrats, quêtes et événements.'],
] };

H.archaeo = { title: '🏺 Mystères archéologiques', sections: [
  ['Indices', 'À partir de l’hôtel de ville 4, explorer 6 lieux ou vider 2 donjons livre un indice. Un seul mystère à la fois ; cinq mystères au total.'],
  ['Retrouver les sites', 'Chaque mystère cache trois fragments dans trois régions. L’indice ne donne qu’une zone (cercle pointillé sur la carte) : explorez-la (éclaireurs, exploration, expéditions) pour localiser le site exact, puis envoyez une équipe de fouille. Les lieux dangereux non nettoyés autour d’un site peuvent la chasser.'],
  ['Étudier et résoudre', 'Chaque fragment s’étudie : lecture rapide (localise le site suivant), étude approfondie (écarte une mauvaise réponse) ou cession à un collectionneur (6 gemmes). Les trois fragments réunis, une énigme se pose ; la réponse se déduit de leurs textes. Une erreur impose 4 h de réflexion.'],
  ['Récompense', 'Un lieu oublié apparaît sur la carte, avec un bonus permanent, des ressources et un plan de forge unique.'],
] };
H.council = { title: '🏛️ Conseil royal', sections: [
  ['Groupes d’influence', 'Marchands, armée, villages, érudits et nobles ont chacun une faveur de 0 à 100. Loyal (≥ 70) : bonus ; hostile (≤ 30) : malus. Une Assemblée des villages loyale ou hostile modifie aussi la stabilité des provinces.'],
  ['Pressions', 'La faveur tend vers 50, déplacée par la priorité royale, la famine, les impôts des provinces, les campagnes militaires, la recherche en cours, les caravanes et les grands projets. Chaque pression est affichée.'],
  ['Motions', 'Toutes les 5 h environ, un groupe présente une motion. Chaque option contente un groupe et en froisse souvent un autre ; la moitié de l’effet reste en mémoire 48 h. Une motion ignorée 3 h vexe le groupe qui l’a présentée.'],
] };
H.legacy = { title: '👑 Héritage dynastique', sections: [
  ['Traditions', 'Hôtel de ville 8, premier haut fait (grand projet, campagne victorieuse ou mystère résolu), hôtel de ville 12 : à chaque étape, choisissez une tradition parmi trois. Elles s’appliquent tout de suite et se conservent dans toutes les dynasties suivantes (5 au maximum).'],
  ['Vestiges', 'Quand vous fondez une nouvelle dynastie, vos principaux avant-postes deviennent des forteresses abandonnées à la même place autour de la capitale, et vos grands projets des monuments. Explorez pour les retrouver : relevez une forteresse (avant-poste à son ancien niveau), démontez-la, ou restaurez un monument (+2 % de production).'],
  ['Mémoire du monde', 'Une faction du nouveau monde se souvient de vos alliances (relation +20), une autre de vos guerres (−20) : la vaincre en campagne est un défi ancestral. Atteindre l’hôtel de ville de la dynastie précédente rapporte aussi des points d’héritage. Les archives retracent les exploits de chaque dynastie.'],
] };

H.challenges = { title: '🏅 Défis de maîtrise', sections: [
  ['Principe', 'Des épreuves facultatives, à durée limitée, qui imposent une contrainte (pas de commerce, pas de recrutement, impôts légers…). Une seule à la fois. Exemple : « Autarcie » — 24 h sans marché ni caravane ; produisez au moins autant que d’habitude pour le bronze, 15 % de plus pour l’argent, 30 % pour l’or.'],
  ['Récompenses', 'Insignes (boutique cosmétique), titres et bannières de maîtrise, une seule fois par palier. Jamais de bonus permanent : un royaume qui réussit tous les défis n’est pas plus fort, il est reconnu.'],
  ['Échec et record', 'Enfreindre la règle met fin à l’épreuve sans palier. On peut retenter un défi 6 h plus tard pour améliorer son record ; l’historique garde chaque tentative.'],
] };
H.legend = { title: '🗺️ Expéditions légendaires', sections: [
  ['Indices', 'Chaque expédition se découvre par un autre système : un mystère archéologique résolu, un boss mondial vaincu, une faction alliée ou partenaire, l’histoire de votre lignée (archives ou monument à l’étape 3).'],
  ['Préparation', 'Provisions (elles servent aux imprévus ; sans vivres, moral et force chutent), escorte (part de l’armée qui quitte le château) et chef (sa ruse ou son savoir ouvrent certains choix). Choisissez l’itinéraire : plus court peut vouloir dire plus dangereux.'],
  ['En route', 'Deux événements demandent une décision (gué en crue, embuscade, sanctuaire…). Puis vient l’épreuve finale, résolue par le moteur de combat avec le moral et la force accumulés.'],
  ['La découverte', 'Après la victoire : la garder (artefact), l’offrir à une faction (souvenir durable), l’exposer aux archives (+2 points d’héritage) ou la vendre.'],
] };
H.accomplish = { title: '🏆 Accomplissements', sections: [
  ['Trois axes', 'Maîtrise (défis, campagnes, quêtes), Découverte (mystères, expéditions, artefacts, plans, chroniques, exploration) et Héritage (traditions, monument, dynasties, vestiges). Les critères sont visibles dès le début de la partie.'],
  ['Progression du royaume', 'La carte des écrans indique ce qui est ouvert et la condition exacte de ce qui ne l’est pas encore.'],
] };

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
