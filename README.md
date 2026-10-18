# 🏰 Cendrelande — Royaumes des Terres Brisées

Jeu de stratégie médiévale par navigateur, orienté **farming, progression longue, automatisation,
exploration et personnalisation**. Inspiré des grands principes du genre (château, ressources, armée,
carte, alliances), avec ses propres mécaniques.

> **Construis ton royaume. Automatise-le. Optimise-le. Explore le monde. Écris son histoire.**

## Jouer

- **Le plus simple** : ouvrez `dist/cendrelande.html` dans votre navigateur (double-clic, aucun serveur).
- **Version développement** (modules ES) : `npm start` (ou `python3 -m http.server 8080`) puis
  ouvrez <http://localhost:8080>.

Au lancement d'une nouvelle partie, vous choisissez le **nom** et la **spécialisation** de votre royaume : 8 spécialisations avec bonus et malus réels, plus une origine et une difficulté facultatives. Un **parcours guidé en 8 chapitres** vous accompagne ensuite, avec un conseiller réglable et des fiches de tutoriel.

L'écran de démarrage contient un encart **facultatif** pour soutenir le développement du jeu (lien PayPal externe, rien n'est bloqué ni payant dans le jeu).

La partie est sauvegardée automatiquement dans le navigateur ; le royaume continue de vivre pendant
votre absence (12 h simulées au maximum) et un rapport vous attend à votre retour.

## Ce qu'on y fait

> **v16 — Le Château et ses Faubourgs** : on entre dans son propre château.
> - **Zones** : la cour du donjon (intra-muros), la muraille et les douves, les faubourgs, la campagne. Certains bâtiments ne se bâtissent que dedans (bibliothèque, forge…) ou que dehors (fermes, mines…) ; d'autres gagnent ou perdent selon leur place.
> - **Muraille et douves dessinées** : de la palissade à la forteresse selon son niveau, avec tours, porte, pont-levis et bannières à vos armoiries. L'enceinte s'agrandit au prix de sa longueur : compacte, elle défend mieux.
> - **Raids par zone** : les pillards frappent d'abord les faubourgs et la campagne ; la cour reste à l'abri tant que la muraille tient. Le feu ne traverse pas les douves, la crue peut les faire déborder.
> - **La ville devient le menu** : cliquez un bâtiment (anneau Ouvrir · Améliorer · Accélérer · Infos), les lieux à bâtir portent un panneau, le menu de gauche n'a plus que 5 entrées, et **Lieux** (touche / ou Ctrl + K) liste tous les écrans au clavier.
> - **Défense par flancs, raid qu'on voit venir, silhouette du château selon l'hôtel de ville, décorations utiles.**
>
> Aucune nouvelle monnaie, aucune ressource produite. Voir [`docs/AUDIT_V16.md`](docs/AUDIT_V16.md) et [`docs/V16.md`](docs/V16.md).
>
> **v15 — L'Atlas vivant** : la carte devient l'instrument principal du royaume.
> - **Cartes en grand** : royaume et monde occupent tout l'écran ; les détails s'ouvrent dans un tiroir (panneau du bas sur téléphone).
> - **Cartes peintes** : sol du royaume et terrain du monde peints sans aucune image externe, brouillard à l'encre, mini-carte cadrée sur la zone connue. Réglages « Qualité graphique » et « Économie d'énergie ».
> - **Le monde montre son état** : météo, lumière de l'heure réelle, incendies, crues, sécheresse, signes des présages, frontières en guerre, toujours nommés dans une légende.
> - **Signes des présages** : un relevé toutes les 20 min affine la fiabilité ; une **demi-mesure** (moitié du prix) contient la crise à sa première étape.
> - **Némésis de la Brèche** : chaque seigneur a un visage, des cicatrices, des titres, et s'adapte (au plus +20 %) à votre armée habituelle. Prenez votre revanche.
> - Polices et icônes embarquées : le jeu fonctionne entièrement hors ligne.
>
> Aucune nouvelle monnaie, aucune ressource produite. Voir [`docs/AUDIT_V15.md`](docs/AUDIT_V15.md) et [`docs/V15.md`](docs/V15.md).
>
> **v14 — Répercussions** : le royaume voit venir ses fléaux et choisit où couper la chaîne.
> - **Présages** : sécheresse, crue, blizzard et tensions du marché sont annoncés 1 à 2 h à l'avance, avec une fiabilité affichée (une part est fausse). On peut les recouper ou se préparer.
> - **Crises en cascade** : une sécheresse renchérit le pain, fâche les villages au conseil, puis soulève une province. Chaque étape propose des interventions chiffrées.
> - **Réserves royales** : le surplus devient une assurance, et le régent peut y puiser.
> - **Feu et eau sur la carte du royaume** : l'incendie se propage selon le placement, la crue frappe la zone inondable, avec un aperçu des risques.
> - **Frontières contestées** : la stabilité des provinces suit les relations avec la faction voisine.
>
> Aucune nouvelle monnaie, aucune ressource produite. Voir [`docs/AUDIT_V14.md`](docs/AUDIT_V14.md) et [`docs/V14.md`](docs/V14.md).
>
> **v13.3** : raids en série — jusqu'à 10 attaques automatiques sur un camp, avec intendance, repos, réapparition
> du camp et butin décroissant — voir [`docs/V13_3.md`](docs/V13_3.md).
>
> **v13.2** : boutons « Moitié de chaque unité » et « Remplissage auto » (minimum pour gagner) dans toutes les
> fenêtres de combat (attaque, récolte, donjon, boss, événements en direct, campagnes), monde agrandi à 128 × 128, cases plus grandes dans le royaume et sur la carte — voir
> [`docs/V13_2.md`](docs/V13_2.md).
>
> **v13.1** : grosses commandes aux forgerons (3, 6 ou 10 objets, longues et coûteuses, rareté garantie),
> personnages itinérants sur la carte (marchand, ermite, mercenaires, pèlerins, chasseur de primes, forgeron,
> cartographe), missions cartographiques automatiques d'éclaireurs — voir [`docs/V13_1.md`](docs/V13_1.md).
>
> **v13 — Le Royaume en mouvement** : les factions réagissent à vos actes (défenses renforcées, embargo, demandes
> d’aide, faveurs marchandes, contre-offensives bornées, négociation après affaiblissement), quêtes transversales à
> embranchements (Les Héritiers de la Fracture, La Route coupée, L’Héritage du royaume), chronique classée sans
> doublons, conséquences après chaque événement, bilan économique avec relevés et recommandations motivées, objectifs
> adaptés à la situation, Grands Projets liés à la diplomatie et aux fouilles, famine du début de partie corrigée —
> voir [`docs/V13.md`](docs/V13.md).
>
> **v12** : passe-temps de recrutement (Sablier du sergent → Décret royal de mobilisation), Grands Projets du
> Royaume (infrastructures, préparation militaire, économie, prestige ; projets d’événement et rares), hôtel de ville
> jusqu’au niveau 30 et bâtiments emblématiques jusqu’au niveau 25, six ères, paliers et prérequis affichés —
> voir [`docs/V12.md`](docs/V12.md).
>
> **v11** : passe-temps pour accélérer les chantiers (gagnés en jouant ou payés en gemmes), Seigneurs de la Brèche
> (forteresses PNJ qui évoluent avec vos attaques), armoiries de la dynastie, commandes prestigieuses d’artisans,
> monde évolutif, codex illustré, scénarios rejouables, épreuves de tradition, conseiller des excédents, audit et
> correction de 22 bugs — voir [`docs/V11.md`](docs/V11.md).
>
> **v10** : refonte visuelle « pierre, ivoire et bronze », icônes SVG, tableau de bord stratégique, chroniques du
> monde, mémoire des factions, défis de maîtrise, monument dynastique, expéditions légendaires, saisons plus
> marquantes, fin de partie sur trois axes — voir [`docs/V10.md`](docs/V10.md) et l’audit [`docs/AUDIT_V10.md`](docs/AUDIT_V10.md).

| Catégorie | Contenu |
|---|---|
| 👑 Spécialisations | Moissons, Fer, Marchands, Érudits, Pionniers, Bastions, Ombres, Anciens : bonus et malus permanents branchés sur les formules du jeu ; origines (province impériale, colonie frontalière, communauté reconstruite) ; difficultés (Guidé, Classique, Expert) — voir [`docs/KINGDOMS.md`](docs/KINGDOMS.md) |
| 🏗️ Grands projets | Pont, aqueduc, forteresse, bibliothèque, route commerciale, sanctuaire : 3 étapes financées en plusieurs apports, conditions liées aux bâtiments et avant-postes, bonus permanents et repère sur la carte |
| 🏅 Défis de maîtrise | Six épreuves facultatives à paliers (bronze, argent, or) qui imposent une contrainte ; titres, insignes et bannières, jamais de bonus permanent |
| 🗿 Monument dynastique | Édifice en 5 étapes sur la carte du royaume, orientation au choix, dessin qui évolue, points d’héritage |
| 🏛️ Conseil royal | Cinq groupes d’influence (marchands, armée, villages, érudits, nobles) : faveur, pressions visibles, motions qui contentent un groupe et en froissent un autre, bonus des groupes loyaux et malus des groupes hostiles |
| 👑 Priorité royale | Orientation stratégique du royaume (Prospérité, Défense, Expansion, Commerce) avec bonus et malus, réorganisation, lien avec les missions et l’Intendance |
| 📖 Parcours | **Quêtes du royaume** (11 chaînes en 7 catégories), **missions dynamiques** adaptées au royaume, tableau de bord, aide ❓ sur chaque écran ; 8 chapitres (du *Dernier hameau* au *Royaume prend son envol*), missions détectées automatiquement, récompenses uniques, exercice d'entraînement sans perte, missions royales du jour, objectifs à long terme, conseiller du tableau de bord (complet / réduit / désactivé), tutoriel relisible |
| 🏰 Royaume | Grille de construction **24×16 dès le départ** (jusqu'à 40×24), **cases de 64 px et bâtiments illustrés**, icônes ⬆ des améliorations possibles et compteur, infobulles, **château principal nommé par le joueur**, zoom et déplacement, bonus d'adjacence (rivière, forêt, montagne), routes, agrandissement du domaine, fortifications ; **tableau des objectifs** (court / moyen / long terme) et **sagas** narratives |
| 🗺️ Monde | Carte procédurale **96×96** (cases de 40 px, terrains texturés, frontières ennemies/alliées/neutres, étiquettes sans chevauchement, armées animées, **avant-postes nommés** avec spécialités et affinité) (plus de 600 lieux, 12 cités libres), zoom à la molette ou au pincement centré sur le curseur, mini-carte, filtres de lieux, accès rapide aux lieux découverts, brouillard, sites de farm à risque, donjons procéduraux, boss mondiaux, 5 factions IA, diplomatie, espionnage ; **territoires spécialisés** (avant-postes, garnison, entretien, menaces) et **réseau logistique** (pertes d’acheminement, routes, relais, rations des garnisons) |
| 🗺️ Légendes | **Expéditions légendaires** : indice venu d’un autre système, préparation, itinéraire, décisions en route, épreuve finale, sort de la découverte |
| 🏺 Fouilles | **Mystères archéologiques** : indices, trois sites à localiser en explorant, équipes de fouille, étude des fragments, énigme, lieux oubliés avec bonus permanent et plan de forge |
| ⚔️ Armée | 15 unités, contres, formations, terrain, météo, moral, ravitaillement, siège ; **campagnes militaires** contre une faction (col, forteresse frontalière, puis siège de la capitale ou protection d’une cité libre) avec effets durables |
| ⛏️ Production | Ouvriers & contremaîtres, expéditions automatiques, chaînes configurables, Intendance, priorités, **Ordres du royaume** (SI → ALORS), **bilan économique** (production/consommation par heure, pénuries, chaînes bloquées, pertes) |
| 🚚 Commerce | Marché dynamique (saisons, guerres, pénuries, rumeurs), convois sécurisés/rapides/clandestins, routes, contrats en 7 catégories (commerce, urgence, artisanat, exploration, militaire, diplomatie, guilde) |
| 💎 Joaillier | **Comptoir du Joaillier** : équipements, faveurs temporaires, élixirs, plans d’architecte, traités, cartes de fouilles et artisans, payés uniquement en gemmes, cristaux, argent, minerai rare et bois ancien (limites quotidiennes) |
| 🧙 Héros | 6 classes, raretés, compétences, intendants/commandants, équipement, forge, potions ; **plans de forge** (modèle et effet spécial au choix, découverts dans les donjons, les fouilles, auprès des factions et des héros, ou par expérimentation) et **atelier spécialisé** |
| 🔬 Technologies | Arbre technologique à maîtrises, recherche automatique, talents permanents, doctrines, prestige dynastique ; **héritage** : traditions conservées d’une dynastie à l’autre, archives, vestiges des dynasties passées à retrouver sur la carte, alliances et rancunes ancestrales |
| 🎪 Événements | Un grand événement de 72 h tous les ~3 jours (11 événements en rotation : Cavaliers des Steppes, Corsaires, Hiver des Géants, Ruines, Chasse au Dragon, Guerre des Royaumes, Ruée vers l'Or, Volcan, Nuit des Morts, Siège des Anciens, Convoi des Sept Marchands), cartes dédiées, monnaies, stratégie et missions du jour, boutiques à stock limité, marchand mystère, passe gratuite, tableau d'honneur (rivaux IA locaux), boss en 3 phases, défi héroïque, surprises (météores, dragon errant, Grande Foire, éclipse) |
| 🎡 Roue | **Éclats Anciens** (monnaie rare, jamais vendue) et **Roue des Anciens** : probabilités affichées, pitié visible, fragments, saisons, exclusivités, jackpot ancestral, expédition interdite |
| 🏛️ Guilde | Dons, niveaux, objectifs collectifs, escortes et renforts (membres simulés localement) |
| 📜 Chronique | Journal, histoire datée du royaume, statistiques et records, salle du trésor (artefacts, collections, réputations), saison |

Et un **🧙‍♂️ Conseiller** qui analyse votre économie et répond à vos questions.

## Développement

```bash
npm test        # tests du moteur, des systèmes, de la sauvegarde et non-régressions (dont passe-temps, Brèche, audit v11, recrutement, Grands Projets, niveaux étendus, v13)
node tools/profileSim.js 7 2     # progression simulée de 6 profils de joueurs sur 7 jours
node tools/profileSim.js --kingdoms 7 2   # comparaison des 8 spécialisations (début / milieu / fin)
node tools/profileSim.js --policies 7 3   # comparaison des priorités royales
node tools/profileSim.js --projects 7 3   # effet des grands projets sur l’économie
node tools/economySim.js 90 40   # simulation de l'économie des Éclats (occasionnel / actif / hardcore)
npm install && npm run build   # régénère dist/cendrelande.html (esbuild)
npm run smoke   # test de fumée de la version compilée dans Chromium (nécessite Playwright)
npm run layout  # tests de rendu : les 40 écrans à 4 tailles (téléphone → grand écran), nécessite Playwright
```

- `src/core` : état, moteur temporel, sauvegarde
- `src/data` : toutes les tables d'équilibrage
- `src/systems` : un module par système de jeu (pur, sans DOM, testable)
- `src/ui` : application, HUD, vues

Documentation : [`docs/DESIGN.md`](docs/DESIGN.md) (phase 1), [`docs/PHASE2.md`](docs/PHASE2.md) (phase 2 et mécaniques originales), [`docs/EVENTS.md`](docs/EVENTS.md) (événements temporaires), [`docs/ECONOMY.md`](docs/ECONOMY.md) (Éclats Anciens, Roue, équilibrage), [`docs/AUDIT.md`](docs/AUDIT.md) (audit, bugs corrigés), [`docs/BALANCE.md`](docs/BALANCE.md) (simulations par profil), [`docs/KINGDOMS.md`](docs/KINGDOMS.md) (spécialisations, formules de cumul, parcours guidé), [`docs/MAPS.md`](docs/MAPS.md) (cartes agrandies, navigation, migration, soutien au projet), [`docs/V9.md`](docs/V9.md) (cartes illustrées, améliorations, noms, quêtes, missions, événements), [`docs/MULTIPLAYER.md`](docs/MULTIPLAYER.md) (fondations d’un éventuel multijoueur — le jeu reste solo). Outils de réglage : ajoutez `?dev` à l'adresse pour l'onglet Admin.
