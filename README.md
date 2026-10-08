# 🏰 Cendrelande — Royaumes des Terres Brisées

Jeu de stratégie médiévale par navigateur, orienté **farming, progression longue, automatisation,
exploration et personnalisation**. Inspiré des grands principes du genre (château, ressources, armée,
carte, alliances), avec ses propres mécaniques.

> **Construis ton royaume. Automatise-le. Optimise-le. Explore le monde. Écris son histoire.**

## Jouer

- **Le plus simple** : ouvrez `dist/cendrelande.html` dans votre navigateur (double-clic, aucun serveur).
- **Version développement** (modules ES) : `npm start` (ou `python3 -m http.server 8080`) puis
  ouvrez <http://localhost:8080>.

La partie est sauvegardée automatiquement dans le navigateur ; le royaume continue de vivre pendant
votre absence (12 h simulées au maximum) et un rapport vous attend à votre retour.

## Ce qu'on y fait

| Catégorie | Contenu |
|---|---|
| 🏰 Royaume | Grille de construction avec bonus d'adjacence (rivière, forêt, montagne), routes, agrandissement du domaine, fortifications |
| 🗺️ Monde | Carte procédurale 48×48, brouillard, sites de farm à risque, donjons procéduraux, boss mondiaux, 5 factions IA, diplomatie, espionnage |
| ⚔️ Armée | 15 unités, contres, formations, terrain, météo, moral, ravitaillement, siège |
| ⛏️ Production | Ouvriers & contremaîtres, expéditions automatiques, chaînes configurables, Intendance, priorités, **Ordres du royaume** (SI → ALORS) |
| 🚚 Commerce | Marché dynamique (saisons, guerres, pénuries, rumeurs), convois sécurisés/rapides/clandestins, routes, contrats |
| 🧙 Héros | 6 classes, raretés, compétences, intendants/commandants, équipement, forge, potions |
| 🔬 Technologies | Arbre technologique à maîtrises, recherche automatique, talents permanents, doctrines, prestige dynastique |
| 🏛️ Guilde | Dons, niveaux, objectifs collectifs, escortes et renforts |
| 📜 Chronique | Journal, histoire datée du royaume, statistiques et records, salle du trésor (artefacts, collections, réputations), saison |

Et un **🧙‍♂️ Conseiller** qui analyse votre économie et répond à vos questions.

## Développement

```bash
npm test        # 31 tests (moteur, systèmes de la phase 2, bot qui joue 3 jours)
npm install && npm run build   # régénère dist/cendrelande.html (esbuild)
```

- `src/core` : état, moteur temporel, sauvegarde
- `src/data` : toutes les tables d'équilibrage
- `src/systems` : un module par système de jeu (pur, sans DOM, testable)
- `src/ui` : application, HUD, vues

Documentation : [`docs/DESIGN.md`](docs/DESIGN.md) (phase 1), [`docs/PHASE2.md`](docs/PHASE2.md) (phase 2 et mécaniques originales).
