# Plan v27.1 — « Fluidité »

**Point de départ** : v27, lot 1 « Netteté » (PR #32). Le jeu rame : ralentissements et à-coups, même sans rien toucher.

**Feu vert** : donné (« go ») avant la lecture de ce plan. Les corrections ont suivi l'ordre ci-dessous.

## 1. Méthode de mesure

**`tools/profile.cjs`** lance le jeu compilé non minifié (noms de fonctions lisibles) dans Chromium, en 1280 × 800.
- **Profileur CPU de Chrome** : un échantillon toutes les 200 µs.
- **Trois parties** : début (nouvelle partie), milieu et fin (fixtures du dépôt).
- **Sept scénarios** :
  - château au repos (10 s) ;
  - monde au repos (10 s) ;
  - geste au château : 12 crans de zoom avant, un glisser de 30 pas, 24 crans de zoom arrière ;
  - geste sur le monde (même suite) ;
  - fenêtres : 5 écrans ouverts puis fermés ;
  - quêtes et sauvegarde : 4 validations forcées ;
  - ouverture du château : 3 allers-retours entre le monde et le château.

**Ce qu'on en tire** :
- le temps CPU occupé ;
- les **tâches longues** (> 50 ms) : suites d'échantillons occupés, sans temps libre entre eux ;
- l'**origine** de chaque tâche longue : la fonction connue du jeu la plus extérieure de la pile, et la plus intérieure ;
- le temps par fonction ;
- les images par seconde et leur 95e centile.

**Pas de carte graphique ici.** Le dessin des canvas et la composition sont faits par le processeur, sur le fil principal. Ils apparaissent comme « (program) » (travail natif du navigateur). Les objectifs sont donc fixés en **temps CPU et en tâches longues** (§ 4). Sur un portable avec carte graphique intégrée, ce travail natif est bien plus léger.

**Piège trouvé pendant la mesure** : la fenêtre d'accueil (rapport d'absence) restait ouverte dans le premier profil. Son fond flouté faisait tomber le château à 18-20 images/s. L'outil ferme maintenant ces fenêtres avant de mesurer, et le fond flouté est lui-même devenu un coupable (n° 6).

## 2. Profil v27 (avant)

| Partie · scénario | CPU occupé | Tâches > 50 ms (total) | Images/s | 95 % des images sous (ms) |
|---|---|---|---|---|
| début · château repos | 21 % | 0 | 60 | 17 |
| début · monde repos | 11 % | 0 | 59 | 17 |
| début · château geste | 59 % | 20 (1 790 ms) | 44 | 67 |
| début · monde geste | 64 % | 29 (2 393 ms) | 38 | 67 |
| début · fenêtres | 33 % | 6 (552 ms) | 38 | 50 |
| milieu · château repos | 27 % | 0 | 59 | 17 |
| milieu · château geste | 65 % | 29 (2 590 ms) | 40 | 67 |
| milieu · monde geste | 73 % | 37 (4 161 ms) | 30 | 83 |
| milieu · fenêtres | 46 % | 11 (1 141 ms) | 34 | 67 |
| milieu · quêtes et sauvegarde | 37 % | 6 (362 ms) | 55 | 33 |
| fin · château repos | 38 % | **6 (427 ms)** | 51 | 33 |
| fin · monde repos | 15 % | **5 (293 ms)** | 56 | 17 |
| fin · château geste | 77 % | **58 (6 647 ms)** | **25** | **150** |
| fin · monde geste | 74 % | 40 (4 672 ms) | 28 | 100 |
| fin · fenêtres | 52 % | 19 (2 266 ms) | 27 | 117 |
| fin · quêtes et sauvegarde | 46 % | 11 (934 ms) | 45 | 50 |
| fin · ouverture du château | 36 % | 13 (1 018 ms) | 49 | 33 |

**Mesures annexes** (Node, partie de fin) :
- sauvegarde complète **52 à 59 ms** (dont 7 à 11 ms de texte JSON, le reste en compression) ;
- simulation `advance()` **1 ms** par seconde (10 ms au plus, au pas du monde). Elle ne coûte presque rien.

## 3. Les 10 plus gros coupables (temps perdu en tâches longues, toutes parties)

| # | Coupable | Temps en tâches longues | Où |
|---|---|---|---|
| 1 | **Dessin complet du monde à chaque image du geste** (`drawMap`) : terrain, rivières, territoires, brouillard (bord adouci en 3 traits), lieux, fumées, étiquettes | 5,8 s (69 tâches) | geste sur le monde, fenêtres |
| 2 | **Cuisson des lieux du monde pendant le geste** (`drawMap › bake`) : chaque nouveau palier de zoom recuit les dessins sur le fil principal | 5,4 s (32 tâches) | geste sur le monde |
| 3 | **Cuisson des bâtiments dans les tuiles du château** (`paintSceneTile › bake`) : jusqu'à 400 ms par tuile la première fois | 4,3 s (34 tâches) | geste au château |
| 4 | **Affichage fixe reconstruit chaque seconde** (`tick › renderHud`) : tout le HTML remplacé, conseils du royaume recalculés (`adviceList` → `analyze`, `surplusPlan`, `buildingRates`) | 3,4 s (42 tâches) + 1,8 s à l'ouverture des écrans | partout, surtout en fin de partie |
| 5 | **Peinture du sol en tuiles** (`paintGroundTile`) en arrière-plan et pendant le geste | 2,7 s (29 tâches) | geste au château |
| 6 | **Fond flouté des fenêtres** (`backdrop-filter`) et animations de la carte qui continuent sous une fenêtre | château de 58 à 20 images/s quand une fenêtre le couvre | fenêtres, rapport d'absence |
| 7 | **Rendu complet après chaque changement du moteur** : `render()` reconstruit toute la carte (`innerHTML`) dès qu'une file, une ressource ou une quête change, et la fenêtre ouverte chaque seconde | 1,2 s (`render › renderHud`) + reconstructions de fenêtre | fin de partie, fenêtres |
| 8 | **Sauvegarde synchrone** : 50 à 60 ms toutes les 15 s, **et après chaque action** (`save › compress`) | 0,8 s | quêtes, constructions |
| 9 | **Boucles concurrentes** : villageois (~30 images/s, même sous une fenêtre), guide des quêtes (`setInterval` à 160 ms), redessins des tuiles et fondus pendant les gestes | 0,7 s (`loop › draw`) | château |
| 10 | **Mémoire** : 160 Mo de tuiles et 48 Mo de dessins autorisés en qualité haute | pics de ramasse-miettes pendant les gestes | gestes |

## 4. Objectifs

**Pour un portable courant** (carte graphique intégrée, qualité haute) :
- 60 images/s au repos ;
- 45 au minimum pendant un geste ;
- aucune tâche de plus de 50 ms en jeu normal ;
- château affiché en moins d'1 s ;
- mémoire stable sur 30 minutes.

**Équivalents mesurables ici** (sans carte graphique, rendu logiciel), contrôlés par le garde-fou `npm run perf` (`tools/perfgate.cjs`, milieu et fin de partie) :

| Scénario | CPU occupé au plus | Tâches > 50 ms au plus | 95 % des images sous |
|---|---|---|---|
| Château au repos (5 s) | 40 % | 2 | 34 ms (≈ 30 images/s au pire, 60 en moyenne) |
| Monde au repos (5 s) | 25 % | 1 | 34 ms |
| Quêtes et sauvegarde | 45 % | 3 | 50 ms |
| Geste au château | 70 % | 16 | 67 ms |
| Geste sur le monde | 80 % | 40 | 84 ms |
| Fenêtres (5 écrans) | 60 % | 18 | 100 ms |

- **Gestes** : les seuils sont plus larges, parce que le dessin des canvas reste sur le processeur ici. Ce dessin est mesuré à part (« (program) »).
- **Mémoire** : session automatique de 30 minutes (`tools/memsession.cjs`). La mémoire JS, les caches et le nombre de nœuds DOM doivent rester stables.

## 5. Corrections, dans l'ordre du gain

1. **Affichage fixe**
   - Seules les parties qui ont changé sont remplacées. Un HTML identique ne coûte rien.
   - Conseils et objectifs sont mis en cache 2 à 5 s, puis recalculés pendant un temps mort.
2. **Cuisson bornée**
   - Lieux du monde : au plus 8 ms de cuisson par image, aucune pendant un geste. La version déjà cuite la plus proche est montrée en attendant.
   - Tuiles du château : les dessins sont cuits un par un, par tranches de 8 ms.
3. **Gestes**
   - Pas de fondu ni de peinture d'arrière-plan sur le fil principal pendant le geste ; tout reprend 200 ms après.
   - Pas de peinture immédiate pendant le geste.
   - Monde dessiné en mode allégé pendant le geste (sans fumées ni hachures, bord du brouillard en un seul trait), puis en qualité complète à la fin.
4. **Rendu après un changement du moteur**
   - La carte n'est reconstruite que si ce qu'elle montre de structurel a changé (signature de la vue), et au plus toutes les 5 s sinon.
   - Une fenêtre ouverte est reconstruite par le moteur au plus toutes les 3 s.
   - Les actions du joueur restent immédiates.
5. **Fenêtres** : plus de flou d'arrière-plan. Les animations de la carte sont en pause sous une fenêtre ou une boîte de dialogue.
6. **Sauvegarde**
   - Après une action : asynchrone, dans les 2 s.
   - Périodique : pendant un temps mort, seulement si l'état a changé (sinon toutes les 60 s), compressée dans un worker.
   - Immédiate à la fermeture, quand l'onglet est caché, et sur le bouton « Sauvegarder ».
7. **Une seule boucle d'animation** (`src/ui/frame.js`) : villageois, guide des quêtes, indicateur de performances. Elle s'arrête quand rien n'est animé, quand l'onglet est caché, et elle met la carte en pause sous une fenêtre.
8. **Mémoire** : budgets ramenés à 96 / 64 / 32 Mo pour les tuiles et 32 / 24 / 12 Mo pour les dessins.
9. **Qualité automatique**
   - Au premier lancement, et sur demande dans les Réglages : mesure de la machine (temps CPU d'une tuile de terrain, cadence d'images), puis choix de la qualité.
   - Si les images par seconde restent sous 30 pendant 20 s de jeu ordinaire, le jeu **propose** une fois de baisser la qualité. Il ne l'impose jamais, et le joueur peut refuser pour de bon.
10. **Indicateur de performances** (F3, ou Réglages) : images par seconde, temps par image, tâches longues récentes avec leur cause (sections nommées), mémoire des caches et mémoire JS.
11. **Garde-fou** : `npm run perf` avec les seuils du § 4. Il devient une règle permanente du README.

## 6. Risques

- **Sauvegarde asynchrone** : une fermeture brutale entre une action et la sauvegarde (2 s) est rattrapée par la sauvegarde à la fermeture. Un plantage du navigateur peut perdre ces 2 secondes. Le hors-ligne recalcule de toute façon la production d'après l'heure.
- **Carte non reconstruite chaque seconde** : une flèche « améliorable » peut apparaître jusqu'à 5 s après que les ressources sont suffisantes.
- **Version périmée d'un dessin pendant la cuisson** : le lieu est étiré un court instant, puis net dès la fin de la cuisson. La mesure de netteté se fait après stabilisation et reste ≤ 1,25.
