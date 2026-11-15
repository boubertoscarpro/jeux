# Plan v28 — « Une carte du monde peinte »

**Point de départ** :
- captures `docs/v27/apres-monde-*.png` ;
- code v27.1 (tuiles nettes, peinture du terrain dans des workers, garde-fou de performance).

**Règles inchangées** :
- rien de copié de Goodgame Empire (codes du genre seulement) ;
- pas d'avantage payant ;
- accessibilité v17 ;
- migration des sauvegardes ;
- jeu hors ligne ;
- netteté ≤ 1,25 ;
- `npm run perf` au vert.

**Ordre de livraison** :
1. ce plan, puis ton feu vert ;
2. la **planche de style** (`tools/mapsheet28.html` et captures), puis ta validation ;
3. le lot 1 sur tout le monde ;
4. le lot 2 (lieux) ;
5. le lot 3 (lisibilité et dézoom).

Tu essaies entre chaque lot.

## 1. Diagnostic confirmé (captures v27 et code)

| # | Constat | Cause dans le code | Confirmé |
|---|---|---|---|
| 1 | **Palette terne et voilée** | Palette `BASE` d'`atlas.js` désaturée (herbe `#86a35a` olive, marais `#5f7350` gris). En plus, la scène pose sa teinte d'heure et de saison (`fx-light` en *multiply*) sur toute la carte du monde : le soir et l'automne l'assombrissent nettement. | Oui |
| 2 | **Arbres en sucettes identiques** | `decorTile('forest')` pose 3 à 5 arbres par case (`tree`, `pine` : un rond sur un tronc), case par case, sans masse ni lisière. | Oui |
| 3 | **Rivières en bandes uniformes** | Les rivières sont des cases (marche aléatoire en 4 directions dans `worldgen`) : la peinture au pixel donne des angles en escalier. Le trait vectoriel v27 a une largeur constante, sans berge ni courant. | Oui |
| 4 | **Bords carrés entre terrains** | La peinture au pixel échantillonne la case voisine avec une déformation de ±0,42 case seulement : à l'échelle de plusieurs cases, les frontières suivent encore la grille. Il n'y a pas de bande de transition (sable, lisière, éboulis). | Oui |
| 5 | **Dézoom : île en tache sur un fond gris vide, avec des confettis** | Le bord du monde est une mer sombre unie. Au dézoom, les lieux deviennent des points de couleur (`dot` dans `views/world.js`) et le brouillard un aplat. | Oui |
| 6 | **Échelles incohérentes, lieux qui se chevauchent** | Chaque lieu est dessiné centré sur sa case avec sa largeur propre (`painter.w`) : la capitale déborde sur 2 à 3 cases et recouvre ses voisins (tour de guet, village). Il n'y a ni emprise réservée ni décalage. | Oui |
| 7 | **Pas de routes** | Le générateur de monde n'en crée aucune. La « route commerciale royale » est un lieu, et les liaisons sont des pointillés. | Oui |
| 8 | **Pas de lacs** | Le générateur n'a que des rivières. | Oui (ajout à discuter, § 5) |

## 2. Approche technique

### Principe : presque tout le terrain peint dans les workers, comme un « shader » au pixel

La v27 peint déjà les pixels du terrain dans des workers. La v28 y met **tout ce qui est du sol**, calculé pixel par pixel à la finesse de la tuile, donc net à tous les zooms et sans travail sur le fil principal :

- **Champs de terrain lissés, au lieu de la case la plus proche**
  - Pour chaque type de terrain, une **carte de présence** (1 dans la case, 0 ailleurs) est floutée sur environ une case, puis déformée par un bruit de domaine à deux octaves.
  - Chaque pixel prend le terrain de plus forte présence, avec une bande de transition d'environ 0,15 case où les couleurs se mélangent.
  - Résultat : des **bords ondulés et organiques**, sans escalier. Chaque case garde son terrain en son centre (lisibilité du jeu).
- **Bandes de transition** : la plage ou la berge naît entre l'eau et la terre, la lisière plus claire au bord des forêts, les éboulis au pied des montagnes, la vase autour des marais.
- **Relief ombré** (montagnes et collines)
  - Un champ de hauteur est tiré des cartes de présence et d'un bruit de crêtes.
  - Ombrage par la normale du relief et **une seule lumière venue du nord-ouest** : faces éclairées et faces ombrées, chaînes continues.
  - **Neige en altitude** (et partout en hiver), éboulis au pied.
- **Forêts en masse de canopée** vues de haut
  - Un bruit cellulaire (cellules de Worley) donne des houppiers serrés, éclairés au nord-ouest et ombrés au sud-est, avec une ombre portée douce.
  - Feuillus et conifères sont mélangés selon un bruit (plus de conifères au nord et en altitude).
  - Une lisière plus claire, des **clairières** (trous de bruit) et quelques **arbres isolés** autour.
- **Marais** : flaques d'eau sombre (seuil de bruit), roseaux et nénuphars en touches, vase.
- **Eau**
  - **Rivières** : distance au pixel jusqu'au tracé lissé. Leur largeur grandit vers l'aval (de 0,35 à 0,8 case), avec une berge de terre ou de sable, de l'eau turquoise près du bord vers un bleu profond au centre, et des reflets.
  - **Lacs et mer** : dégradé du bord vers le large, plages ou falaises selon le relief voisin.
- **Routes**
  - Distance au pixel jusqu'aux tracés : terre battue à bords sombres, pavée près de la capitale et des cités.
  - **Ponts** de bois ou de pierre là où une route croise une rivière.
- **Champs et prairies près des lieux habités** (capitale, avant-postes, villages, cités libres)
  - Parcelles en damier légèrement tournées : blé, vert, labour.
  - Haies sombres et meules.
- **Biomes à signature** :
  - toundra : neige blanche à ombres bleues, sapins enneigés ;
  - terres de cendre : sol gris-noir fendu, fissures rougeoyantes ;
  - ruines : dalles et colonnes ;
  - abords de la Brèche : cristaux violets et sol craquelé.

### Ce qui reste dessiné sur le fil principal (vectoriel ou dessins cuits)

- les lieux (dessins cuits, lot 2) ;
- les marches ;
- les étiquettes ;
- les frontières de territoire (lot 3) ;
- l'animation légère de l'eau : courant et écume, une couche transparente redessinée au rythme de la carte, figée si les animations sont réduites ;
- la **vie dispersée** : moulins, fermes isolées, pêcheurs, troupeaux, oiseaux, fumées. Ce sont de petits dessins cuits, posés de façon déterministe et avec parcimonie sur des cases adaptées. Ils sont peints dans la tuile (décor statique), sauf les oiseaux et les charrettes, qui sont animés.

### Données nouvelles (calculées, pas sauvegardées)

- **Routes** (`src/systems/roads.js`)
  - Chemins de moindre coût (A* sur la grille) entre la capitale, les avant-postes, les cités libres et les lieux de commerce. Coût : plaine 1, colline 2, forêt 2,5, marais 4, montagne 8, gué 3.
  - Tronçons fusionnés (arbre couvrant), puis lissés.
  - **Recalculées** quand l'ensemble des lieux reliés change. Aucune donnée dans la sauvegarde.
- **Tracé et débit des rivières** : chaînes de cases (v27), sens d'écoulement tiré du générateur (vers le sud), largeur proportionnelle au nombre de cases en amont.
- **Lieux habités → parcelles de champs** : rayon de 2 à 3 cases, sur la plaine seulement.

### Mer du bord du monde (lot 1) et carte ancienne (lot 3)

- **Mer peinte** au-delà du bord :
  - dégradé du turquoise au bleu profond ;
  - îlots, récifs et rochers, tirés de façon déterministe ;
  - vagues lentes, écume animée le long des côtes.
- **Cadre de carte ancienne** tout au bout : brume, bord de parchemin, rose des vents.

### Teinte d'heure et de saison

- Elle n'est plus posée en *multiply* sur la carte du monde. La saison change seulement la palette du terrain (feuillage, neige), et la météo pose un voile très léger.
- **Nuit** : teinte bleutée légère qui garde les contrastes, avec des lumières aux fenêtres des lieux et aux feux de camp.
- **Lisibilité** : contrôle par la mesure de contraste v17 (`tools/contrast.mjs`).

### Cache et invalidation

- La clé d'une tuile de terrain contient la signature des **routes** et des **champs** (lieux habités). Une nouvelle route ou un nouvel avant-poste ne repeint que les tuiles touchées (boîte de la modification).
- Les budgets mémoire restent ceux de la v27.1.

## 3. Lots 2 et 3 (rappel de l'approche)

### Lot 2 — Lieux
- **Hiérarchie de tailles fixée dans les données** : capitale (emprise de 2 × 2 cases) > cités libres et métropoles (1,6) > avant-postes et forteresses (1,2) > camps (1) > ressources (0,85).
- **Aucun chevauchement** :
  - les cases de l'emprise de la capitale n'acceptent aucun autre dessin ;
  - un lieu voisin est décalé dans sa case (jusqu'à 0,3 case) ou réduit ;
  - un test vérifie qu'aucun rectangle de dessin ne recouvre un autre au zoom moyen.
- **Socle peint sous chaque lieu** : herbe tondue, terre battue, palissade, champs. Il est peint dans la tuile du terrain, donc ancré dans le paysage.
- **Ressources dans le style du château** : scierie avec troncs empilés, carrière avec blocs taillés, mine avec wagonnet et minerai, champs avec gerbes.
- **Maisons** : architecture, couleurs et blason (v26, données), appliqués à tous leurs lieux.
- **Écussons de niveau, bannières et comptes à rebours** : au-dessus du dessin, sans le masquer. Placement mesuré par `overlaps`.

### Lot 3 — Lisibilité et dézoom
- **Étiquettes en ruban de parchemin** :
  - seules les importantes au zoom moyen, toutes au zoom fort ;
  - aucun chevauchement entre étiquettes, ni avec les dessins ;
  - la carte du monde est déjà dans `overlaps` depuis la v26 : on y ajoute les dessins.
- **Territoires** : trait peint de la couleur de la bannière, avec un halo intérieur, sans remplissage.
- **Vue d'ensemble en carte ancienne** :
  - côtes, massifs, chaînes ;
  - **noms des régions en grand** ;
  - **blasons des maisons** sur leurs terres ;
  - seulement les lieux importants, en icônes claires ;
  - plus de confettis.
- **Brouillard en nuages ou parchemin** qui s'effiloche à la limite du connu.

## 4. Risques mémoire et performance

| Risque | Parade |
|---|---|
| **Peinture d'une tuile plus chère** dans le worker : champs lissés, relief, canopée, distances aux routes et rivières. Estimation : 32 → 60 à 100 ms. | C'est hors du fil principal : les workers restent parallèles et l'ancien niveau reste affiché. Les distances aux tracés sont calculées par seau spatial (seuls les segments proches de la tuile). Un budget par tuile est mesuré dans `tools/profile.cjs`. |
| **Premier affichage** du monde plus long à devenir fin. | La vue d'ensemble (niveau 16) est épinglée et peinte en premier. Elle sert de repli. |
| **Routes** : A* sur 128 × 128 cases, une dizaine de liaisons. | Calcul en temps mort au chargement (moins de 30 ms estimés), puis mise en cache. Il n'est relancé que si les lieux reliés changent. |
| **Animation de l'eau** : courant et écume | Une couche fine redessinée au rythme existant de la carte (1 s), coupée pendant les gestes et figée si les animations sont réduites. |
| **Vie dispersée animée** (oiseaux, charrettes) | 10 à 20 éléments au plus à l'écran, sur la boucle centrale ; rien sous une fenêtre ; nombre limité selon la qualité. |
| **Contrastes et daltonisme** avec une palette plus vive | Mesure v17 (`tools/contrast.mjs`). Les frontières et les menaces gardent forme et motif, pas seulement la couleur. |
| **Garde-fou de performance** | `npm run perf` à chaque lot. On ajoutera un scénario « monde dézoomé » si le lot 3 alourdit la vue d'ensemble. |

## 5. Choix à confirmer avec ton feu vert

1. **Lacs** : le monde actuel n'en a pas. Je propose de les **peindre** là où le terrain s'y prête (élargissements de rivière, cuvettes de marais), comme un décor de terrain « eau » en plus. Les règles de jeu ne changent pas : la case garde son terrain (marais ou rivière). L'autre choix, ajouter un vrai terrain « lac » au générateur, ne servirait qu'aux nouvelles parties.
2. **Routes calculées, pas sauvegardées** : elles suivent les lieux et le terrain. Proposition : **purement visuelles** dans cette version, sans changement de vitesse de marche, pour ne pas toucher l'équilibre. Les rendre utiles (marche plus rapide sur route) serait un choix de jeu pour plus tard.
3. **Teinte d'heure** : sur le monde, plus de voile assombrissant. La nuit reste reconnaissable (bleuté léger, lumières), mais la carte reste lisible.
4. **Planche de style** : une page autonome (`tools/mapsheet28.html`) qui peint, avec le code du jeu, un morceau de carte de 16 × 12 cases fait à la main, au zoom moyen et au zoom fort, en DPR 1 et 2. Elle contient prairie, forêt, rivière, lac, côte, montagnes, marais, champs, route, ton château, un camp de brigands, une ressource et une cité libre. Je t'envoie les captures et **j'attends ta validation** avant de généraliser.
