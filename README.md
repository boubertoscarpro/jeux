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

La partie est sauvegardée automatiquement dans le navigateur ; le royaume continue de vivre pendant
votre absence (12 h simulées au maximum) et un rapport vous attend à votre retour.

## Ce qu'on y fait

| Catégorie | Contenu |
|---|---|
| 👑 Spécialisations | Moissons, Fer, Marchands, Érudits, Pionniers, Bastions, Ombres, Anciens : bonus et malus permanents branchés sur les formules du jeu ; origines (province impériale, colonie frontalière, communauté reconstruite) ; difficultés (Guidé, Classique, Expert) — voir [`docs/KINGDOMS.md`](docs/KINGDOMS.md) |
| 📖 Parcours | 8 chapitres (du *Dernier hameau* au *Royaume prend son envol*), missions détectées automatiquement, récompenses uniques, exercice d'entraînement sans perte, missions royales du jour, objectifs à long terme, conseiller du tableau de bord (complet / réduit / désactivé), tutoriel relisible |
| 🏰 Royaume | Grille de construction avec bonus d'adjacence (rivière, forêt, montagne), routes, agrandissement du domaine, fortifications ; **tableau des objectifs** (court / moyen / long terme) et **sagas** narratives |
| 🗺️ Monde | Carte procédurale 48×48, brouillard, sites de farm à risque, donjons procéduraux, boss mondiaux, 5 factions IA, diplomatie, espionnage ; **territoires spécialisés** (avant-postes, garnison, entretien, menaces) |
| ⚔️ Armée | 15 unités, contres, formations, terrain, météo, moral, ravitaillement, siège |
| ⛏️ Production | Ouvriers & contremaîtres, expéditions automatiques, chaînes configurables, Intendance, priorités, **Ordres du royaume** (SI → ALORS), **bilan économique** (production/consommation par heure, pénuries, chaînes bloquées, pertes) |
| 🚚 Commerce | Marché dynamique (saisons, guerres, pénuries, rumeurs), convois sécurisés/rapides/clandestins, routes, contrats en 7 catégories (commerce, urgence, artisanat, exploration, militaire, diplomatie, guilde) |
| 🧙 Héros | 6 classes, raretés, compétences, intendants/commandants, équipement, forge, potions |
| 🔬 Technologies | Arbre technologique à maîtrises, recherche automatique, talents permanents, doctrines, prestige dynastique |
| 🎪 Événements | Un grand événement de 72 h tous les ~3 jours (11 événements en rotation : Cavaliers des Steppes, Corsaires, Hiver des Géants, Ruines, Chasse au Dragon, Guerre des Royaumes, Ruée vers l'Or, Volcan, Nuit des Morts, Siège des Anciens, Convoi des Sept Marchands), cartes dédiées, monnaies, stratégie et missions du jour, boutiques à stock limité, marchand mystère, passe gratuite, tableau d'honneur (rivaux IA locaux), boss en 3 phases, défi héroïque, surprises (météores, dragon errant, Grande Foire, éclipse) |
| 🎡 Roue | **Éclats Anciens** (monnaie rare, jamais vendue) et **Roue des Anciens** : probabilités affichées, pitié visible, fragments, saisons, exclusivités, jackpot ancestral, expédition interdite |
| 🏛️ Guilde | Dons, niveaux, objectifs collectifs, escortes et renforts (membres simulés localement) |
| 📜 Chronique | Journal, histoire datée du royaume, statistiques et records, salle du trésor (artefacts, collections, réputations), saison |

Et un **🧙‍♂️ Conseiller** qui analyse votre économie et répond à vos questions.

## Développement

```bash
npm test        # 111 tests (moteur, bot, événements, Roue, sauvegarde, non-régressions, mécaniques, spécialisations, parcours)
node tools/profileSim.js 7 2     # progression simulée de 6 profils de joueurs sur 7 jours
node tools/profileSim.js --kingdoms 7 2   # comparaison des 8 spécialisations (début / milieu / fin)
node tools/economySim.js 90 40   # simulation de l'économie des Éclats (occasionnel / actif / hardcore)
npm install && npm run build   # régénère dist/cendrelande.html (esbuild)
npm run smoke   # test de fumée de la version compilée dans Chromium (nécessite Playwright)
```

- `src/core` : état, moteur temporel, sauvegarde
- `src/data` : toutes les tables d'équilibrage
- `src/systems` : un module par système de jeu (pur, sans DOM, testable)
- `src/ui` : application, HUD, vues

Documentation : [`docs/DESIGN.md`](docs/DESIGN.md) (phase 1), [`docs/PHASE2.md`](docs/PHASE2.md) (phase 2 et mécaniques originales), [`docs/EVENTS.md`](docs/EVENTS.md) (événements temporaires), [`docs/ECONOMY.md`](docs/ECONOMY.md) (Éclats Anciens, Roue, équilibrage), [`docs/AUDIT.md`](docs/AUDIT.md) (audit, bugs corrigés), [`docs/BALANCE.md`](docs/BALANCE.md) (simulations par profil), [`docs/KINGDOMS.md`](docs/KINGDOMS.md) (spécialisations, formules de cumul, parcours guidé). Outils de réglage : ajoutez `?dev` à l'adresse pour l'onglet Admin.
