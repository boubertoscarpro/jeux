# Audit v27.1 — « Fluidité »

**Plan** : `docs/PLAN_V27_1.md`. **Détail** : `docs/V27_1.md`.

**Mesures** :
- jeu compilé non minifié ;
- Chromium **sans carte graphique** (rendu logiciel), écran 1280 × 800 ;
- profileur CPU de Chrome (`tools/profile.cjs`) ;
- parties de début, de milieu et de fin ;
- **avant** = v27 (PR #32) ; **après** = cette version.

**Attention au bruit.** D'un passage à l'autre, sur la même version, les tâches longues pendant les gestes et les fenêtres varient d'environ ±40 % dans cet environnement. Le garde-fou prend donc le meilleur de deux passages.

## 1. Avant / après par écran (scénarios de 10 s ou plus, un passage)

| Partie · scénario | CPU occupé | Tâches > 50 ms | Images/s | 95 % des images sous (ms) |
|---|---|---|---|---|
| début · château repos | 21 → 21 % | 0 → **0** | 60 → 60 | 17 → 17 |
| début · monde repos | 11 → 10 % | 0 → **0** | 59 → 58 | 17 → 17 |
| début · château geste | 59 → 50 % | 20 → **3** | 44 → **52** | 67 → **33** |
| début · monde geste | 64 → 59 % | 29 → **11** | 38 → **49** | 67 → **33** |
| début · fenêtres | 33 → 39 % | 6 → 10 | 38 → 42 | 50 → 67 |
| début · quêtes et sauvegarde | 22 → 20 % | 1 → 1 | 59 → 58 | 17 → 17 |
| début · ouverture du château | 17 → 20 % | 3 → 3 | 59 → 58 | 17 → 17 |
| milieu · château repos | 27 → 27 % | 0 → 1 | 59 → 60 | 17 → 17 |
| milieu · monde repos | 13 → 11 % | 0 → 0 | 56 → 58 | 17 → 17 |
| milieu · château geste | 65 → 50 % | 29 → **7** | 40 → **54** | 67 → **33** |
| milieu · monde geste | 73 → 64 % | 37 → **20** | 30 → **42** | 83 → **50** |
| milieu · fenêtres | 46 → 47 % | 11 → 16 | 34 → 38 | 67 → 67 |
| milieu · quêtes et sauvegarde | 37 → 24 % | 6 → **2** | 55 → 59 | 33 → **17** |
| milieu · ouverture du château | 37 → 29 % | 8 → **6** | 53 → 56 | 33 → **17** |
| fin · château repos | 38 → 31 % | 6 → 7 | 51 → **58** | 33 → **17** |
| fin · monde repos | 15 → 11 % | 5 → **0** | 56 → 58 | 17 → 17 |
| fin · château geste | 77 → 69 % | **58 → 22** | **25 → 41** | **150 → 50** |
| fin · monde geste | 74 → 64 % | 40 → **25** | 28 → **40** | 100 → **50** |
| fin · fenêtres | 52 → 53 % | 19 → 22 | 27 → 35 | 117 → 100 |
| fin · quêtes et sauvegarde | 46 → 27 % | 11 → **4** | 45 → **57** | 50 → **17** |
| fin · ouverture du château | 36 → 34 % | 13 → **10** | 49 → **55** | 33 → **17** |

### Garde-fou `npm run perf` (milieu et fin, repos de 5 s, meilleur de 2 passages) : tous les seuils tenus

| Scénario | CPU occupé | Tâches > 50 ms | p95 (ms) |
|---|---|---|---|
| milieu · château repos | 21 % | 1 | 17 |
| milieu · monde repos | 10 % | 0 | 17 |
| milieu · château geste | 49 % | 6 | 33 |
| milieu · monde geste | 59 % | 13 | 50 |
| milieu · fenêtres | 43 % | 17 | 67 |
| milieu · quêtes et sauvegarde | 20 % | 1 | 17 |
| fin · château repos | 27 % | 3 (seuil 3) | 17 |
| fin · monde repos | 10 % | 0 | 17 |
| fin · château geste | 56 % | 9 | 33 |
| fin · monde geste | 62 % | 16 | 50 |
| fin · fenêtres | 55 % | **24 (seuil 24)** | 83 |
| fin · quêtes et sauvegarde | 40 % | 1 | 17 |

### Mesures isolées
- **Château couvert par une fenêtre** (partie de fin) : 20 → **58 images/s**. Le flou d'arrière-plan est retiré, et les animations sont en pause sous la fenêtre.
- **Sauvegarde** : 52 à 59 ms synchrones toutes les 15 s **et après chaque action**. Désormais : 7 à 11 ms sur le fil principal (texte JSON), en temps mort, seulement si l'état a changé. La compression se fait dans un worker. L'écriture dans le stockage coûte 0,2 ms.
- **Affichage fixe** (fin de partie) : 40 à 60 ms chaque seconde → 10 à 20 ms. Seules les parties changées sont remplacées, et les comptes à rebours ne déclenchent plus de remplacement.
- **Première ouverture du monde** : jusqu'à 418 ms de cuisson d'un bloc → au plus environ 12 ms par image. Les lieux apparaissent sur une ou deux images.
- **Simulation** (`advance`) : 1 ms par seconde (10 ms au plus, au pas du monde). Rien à corriger.

## 2. Netteté (v27 conservée)

`npm run sharpness` : **aucune couche étirée au-delà de 1,25** (hors cas accepté du plan v27 : terrain du monde en DPR 3 au zoom maximum, 1,58).

**À savoir** : en DPR 3 sans carte graphique, la finesse 3 à 6 du château met plusieurs dizaines de secondes à se peindre entièrement (environ 100 tuiles, plus la cuisson des bâtiments à cette finesse). Pendant ce temps, la finesse précédente est affichée. L'outil attend désormais jusqu'à 60 s.

## 3. Mémoire

- **Budgets** : tuiles 160 → **96 Mo**, dessins 48 → **32 Mo** (qualité haute).
- **Correction d'un défaut d'éviction** : seules les tuiles de la dernière couche dessinée étaient protégées. Le sol pouvait donc être évincé pendant que la scène se dessinait, puis repeint en boucle.
- **Session de 30 minutes** (`tools/memsession.cjs`) : voir § 6.

## 4. Ce qui reste lent (honnêtement)

- **Ouverture des fenêtres** : pas d'amélioration nette en nombre de tâches longues (19 → 22 en fin de partie, dans le bruit de mesure). Ouvrir un écran coûte encore 25 à 60 ms de JavaScript (`renderWin` : HTML de l'écran, icônes), plus la mise en page native d'un contenu de 800 à 1 100 éléments (armée, recherche, marché).
  - Fait : l'affichage fixe passe à l'image suivante, et la fenêtre ouverte n'est plus reconstruite qu'au plus toutes les 3 s.
  - **À faire** : rendre les longues listes au fur et à mesure qu'elles défilent, et mettre en cache le HTML des écrans.
  - C'est le seuil le plus juste du garde-fou (24).
- **Gestes sur le monde** : encore 16 à 25 tâches longues. Presque tout est le **dessin natif** du canvas en rendu logiciel (30 à 60 ms par image en 1280 × 800). Le JavaScript de `drawMap` ne prend qu'environ 13 ms par image. Avec une carte graphique, ce dessin natif est bien plus léger : à vérifier chez toi avec l'indicateur F3.
- **Château au repos, fin de partie** : 0 à 7 tâches longues selon les passages. Ce sont des tâches d'environ 50 à 70 ms où la mise en page native domine, avec l'affichage fixe ou la reconstruction de la carte quand un chantier, une flèche ou un raid change.
- **Premier affichage du château** : jusqu'à environ 700 ms à la toute première ouverture, pour peindre le sol et la scène visibles avant de montrer le château. Ensuite, les tuiles sont en cache : moins de 100 ms dans les allers-retours mesurés.
- **Objectifs « portable courant »** (60 images/s au repos, 45 au minimum en geste) : non vérifiables ici sans carte graphique. Les équivalents CPU du plan sont tenus (§ 1).

## 5. Validation

| Contrôle | Résultat |
|---|---|
| `npm test` | réussi |
| `npm run smoke` | aucune erreur |
| `npm run layout` | aucun problème |
| `npm run overlaps` | 0 |
| `npm run simulate` | sans erreur |
| `npm run sharpness` | ≤ 1,25 (hors cas accepté) |
| `npm run perf` | tous les seuils tenus |

## 6. Session de 30 minutes
