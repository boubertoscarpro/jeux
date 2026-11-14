# Plan v27 — « Netteté et vie »

**Point de départ** : v26 (PR #31 fusionnée).
**Ordre de livraison** :
1. lot 1, la netteté, livré seul avec captures et mesures ; tu l'essaies ;
2. la planche de style `tools/artsheet.html` (remparts et villageois), que tu valides ;
3. lot 2, les remparts ;
4. lot 3, les villageois.

Chaque lot passe `npm test`, `smoke`, `layout`, `overlaps`, `simulate` et `build`, et a sa partie dans `docs/V27.md` et `docs/AUDIT_V27.md`.

---

## 1. Causes du flou : confirmées et mesurées

**Méthode** :
- sonde Playwright sur le jeu compilé v26, partie de fin (`save-fin`), écran 1400 × 900, densité d'écran (DPR) 1, 2 et 3 ;
- facteur d'agrandissement = pixels réels à l'écran ÷ pixels peints dans la source. Au-dessus de 1, l'image est étirée ; au-dessus d'environ 1,25, l'œil voit le flou ou les gros pixels.

### Carte du monde (128 × 128 cases, `BASE_TILE` 52, zoom de 0,15 à 2,6)

Le terrain a deux niveaux :
- `lodA`, l'image globale à 8 px par case, utilisée seule tant qu'une case fait moins de 26 px, soit sous le zoom 0,5 ;
- au-dessus, des blocs de 8 × 8 cases peints à 32 px par case en qualité « haute » (24 en « moyenne »).

Le brouillard est peint à 6 px par case.

| Zoom | Case à l'écran (DPR 1 / 2) | Couche affichée | **Agrandissement DPR 1** | **DPR 2** | **DPR 3** |
|---|---|---|---|---|---|
| 0,15 (minimum) | 7,8 / 15,6 px | `lodA` 8 px | 0,97 | **1,95** | **2,9** |
| 0,49 (juste avant les blocs) | 25,5 / 51 px | `lodA` 8 px | **3,2** | **6,4** | **9,6** |
| 0,5 | 26 / 52 px | blocs 32 px | 0,81 | **1,63** | **2,4** |
| 1 | 52 / 104 px | blocs 32 px | **1,63** | **3,25** | **4,9** |
| 2,6 (maximum) | 135 / 270 px | blocs 32 px | **4,2** | **8,5** | **12,7** |
| 2,6 | — | brouillard 6 px | **22,5** | **45** | **68** |
| 2,6 | — | lieux peints (cuisson plafonnée à 1,5 et DPR 2) | 1 | **1,76** | **2,64** |

**Confirmé** :
- les blocs du monde sont étirés jusqu'à 4,2× (DPR 1) et 8,5× (DPR 2) ;
- la vue d'ensemble pixelise surtout entre les zooms 0,3 et 0,5 (`lodA` étiré 3 à 6×) ;
- le brouillard est le plus étiré, mais c'est un dégradé : le flou s'y voit peu, ses bords déchiquetés si ;
- **cause en plus, non citée** : la cuisson des lieux est plafonnée à 1,5 et à DPR 2. Au zoom maximum en DPR 2, elle est étirée 1,76×.

### Château (vue isométrique, losange de 128 × 64 au zoom 1, zoom de 0,2 à 2,4)

**Correction de l'hypothèse de départ.** Le sol du château **n'est plus** peint à `q.city` (32 px par case) puis tordu par la matrice CSS. Ce chemin (`paintIsoGround`, `groundMatrix`) est du code mort depuis la v22b.

Aujourd'hui :
- le sol (`groundCanvas`) et la scène (`drawScene`) sont peints **directement en losanges**, dans **deux grands canvas de la taille du domaine entier** ;
- ces canvas sont mis à l'échelle en CSS (`scale(cam.z)`) ;
- leur finesse `R` est choisie par `paintRes`, avec un DPR plafonné à 2. Elle est surtout plafonnée par la mémoire : `min(8192 / largeur, √(24 Mpx / surface))`.

Pour la partie de fin, le domaine fait **6528 × 3392 px CSS**. Le plafond mémoire impose donc **R = 1,04**, quel que soit le zoom.

| Zoom | **Agrandissement scène et sol, DPR 1** | **DPR 2** | **DPR 3** | Villageois (cuits ×3), DPR 2 |
|---|---|---|---|---|
| 0,2 | 0,2 | 0,38 | 0,58 | 0,13 |
| 0,6 | 0,6 | **1,15** | **1,73** | 0,4 |
| 1 | 0,96 | **1,92** | **2,88** | 0,67 |
| 1,6 | **1,54** | **3,07** | **4,61** | 1,07 |
| 2,4 (maximum) | **2,31** | **4,61** | **6,92** | **1,6** |

**Confirmé** : la vraie cause du flou au château est le **canvas unique de tout le domaine**. Le plafond mémoire fige sa finesse à environ 1 px par px CSS. Dès qu'on zoome, tout est étiré, jusqu'à 4,6× en DPR 2.

### Coût actuel

Mesures sans carte graphique : Chromium sans tête, rendu logiciel. Les valeurs sont relatives, et serviront de référence « avant » pour le lot 1.

| Scène (zoom avant, glisser, zoom arrière) | Images/s | 95 % des images sous | Pire image | Mémoire JS | Mémoire des canvas affichés |
|---|---|---|---|---|---|
| Monde, DPR 1 | 17 | 83 ms | 150 ms | 36 Mo | 5 Mo |
| Monde, DPR 2 | 14 | 167 ms | 267 ms | 45 Mo | 20 Mo |
| Château, DPR 1 | 15 | 83 ms | 183 ms | 26 Mo | **182 Mo** |
| Château, DPR 2 | 14 | 117 ms | 167 ms | 29 Mo | **212 Mo** |

Le château garde donc déjà **environ 200 Mo** de canvas, pour une finesse d'environ 1. On ne peut pas monter la finesse sans changer de méthode : à R = 4, il faudrait plus de 3 Go.

Ces chiffres ne comptent pas le cache des blocs du monde (jusqu'à 220 blocs de 256 × 256 px, soit 58 Mo).

---

## 2. Solution choisie (lot 1)

### Principe commun : des tuiles peintes à la taille d'affichage

Le monde et le château passent tous deux à des **tuiles** :
- chaque tuile est peinte **au niveau de détail (LOD) supérieur ou égal à la taille réelle à l'écran** ;
- seules les tuiles visibles (plus une marge) sont en mémoire.

Règles :
- **Niveaux** :
  - monde : 16, 32, 64, 128 et 256 px par case. Le 256 n'est utilisé qu'au zoom fort sur un écran dense : à DPR 2 et zoom 2,6, une case fait 270 px réels ;
  - château : finesse R de 0,5, 1, 2, 3, 4 et 6 px source par px CSS.
- **Choix du niveau** : le plus petit niveau ≥ taille réelle ÷ 1,25. Un niveau n'est donc **jamais étiré plus de 1,25×**. Au-delà du plus grand niveau, l'écran affiche le niveau maximum, et cela est mesuré et signalé.
- **Taille d'une tuile** : environ 512 px source au plus. Elle couvre donc 32 × 32 cases au niveau 16, et 2 × 2 cases au niveau 256. Une tuile pèse donc au plus 1 Mo.
- **Dessin** : toujours dans un seul canvas de la taille de l'écran (× DPR), redessiné à chaque image de caméra. Le château perd ses deux canvas géants et utilise le même canvas d'écran que le calque de vie.

### Transitions de zoom sans à-coup

- Pendant le geste (molette, pincement, boutons), on garde les tuiles du niveau en cours, étirées ou réduites : un étirement bref est acceptable pendant le mouvement.
- Le nouveau niveau se peint **en arrière-plan** :
  - avec `requestIdleCallback` (ou `setTimeout` en repli), sous un budget d'environ 6 ms par image ;
  - en commençant par les tuiles du centre ;
  - en `OffscreenCanvas` dans un worker pour le terrain du monde, si le navigateur le permet (voir les risques), et sinon sur le fil principal par petites tranches.
- Quand une tuile du nouveau niveau est prête, elle **apparaît en fondu** (150 ms) par-dessus l'ancienne. L'ancienne est libérée après le fondu.
- Avec les animations réduites, on passe d'un niveau à l'autre sans fondu.

### Réduction de qualité

- `imageSmoothingQuality = 'high'` sur tous les tracés de tuiles et de sprites.
- Pour descendre de niveau, on **divise par deux successivement** (une tuile 128 réduite en 64 puis en 32), plutôt que de repeindre les niveaux bas. Le moiré disparaît et le coût baisse.

### Monde

1. **Pyramide des niveaux** 16, 32, 64, 128 et 256 px par case, avec les mêmes règles de terrain (`paintTerrain`, `decorTile`) qu'aujourd'hui.
2. **Vraie carte d'ensemble au dézoom maximum** (au lieu de `lodA` étiré), peinte une fois à 16 px par case, en 1 à 4 tuiles :
   - régions teintées ;
   - côtes lissées ;
   - forêts regroupées en massifs ;
   - montagnes en relief ombré ;
   - routes et frontières.

   Elle remplace `lodA` sous le zoom 0,5. La mini-carte la réutilise.
3. **Côtes, rivières et frontières vectorielles**, tracées par-dessus le terrain à chaque image :
   - les contours sont calculés une fois par carrés marchants sur la grille, puis lissés (Chaikin) ;
   - ils sont mis en cache en coordonnées de cases ;
   - les frontières ont une **épaisseur constante à l'écran** (trait en px CSS, pas en cases) ;
   - côtes et rivières sont tracées à l'échelle.
4. **Brouillard** :
   - lisse, en remplissage vectoriel du contour du connu, flouté ;
   - bords déchiquetés : un motif de franges peint une fois, posé le long du contour ;
   - il remplace l'image à 6 px par case.
5. **Lieux et cibles** :
   - le plafond de cuisson passe de 1,5 à **4** et le DPR de 2 à **3** ;
   - une « version gros plan » est cuite au-dessus du zoom 1,6, par paliers de 0,5.

### Château

1. **Sol et scène en tuiles losanges** :
   - le domaine est découpé en tuiles de 512 × 512 px CSS. Les éléments (`cityItems`) sont rangés par tuile qu'ils touchent ;
   - chaque tuile se peint à la finesse R choisie, avec découpe et ordre de profondeur inchangé : `drawScene` est appelé avec la zone de la tuile ;
   - le sol est peint directement dans la tuile (losanges et dégradés de `groundCanvas`, découpés à la tuile) ;
   - les boutons (zones de clic) restent en DOM comme aujourd'hui : la composition (tests v23) ne change pas.
2. **Repeinture partielle** : un bâtiment qui change ne fait repeindre que les tuiles qu'il touche (clé par tuile, au lieu d'une clé pour toute la scène).
3. **Fumées et calque de vie** inchangés en principe : ils suivent déjà la caméra dans le canvas d'écran.

### Sprites

- Cuits au **DPR réel, plafonné à 3** au lieu de 2 : `sprite()`, `bakeScale`, `paintRes`, `thumbs` et `life`.
- Une **variante gros plan** (finesse ×2) quand le zoom dépasse 1,6.
- Le cache de sprites passe d'un plafond en nombre (700) à un **plafond en mégaoctets**.

### Cache borné en mégaoctets

Un gestionnaire commun (`src/ui/tilecache.js`) :
- tient le **compte exact des octets** (largeur × hauteur × 4) ;
- budget par qualité graphique :

  | Qualité | Monde et château ensemble | Sprites |
  |---|---|---|
  | haute | 160 Mo | 48 Mo |
  | moyenne | 96 Mo | 32 Mo |
  | basse | 48 Mo | 16 Mo |

- quand il déborde, il **évince d'abord les tuiles les plus éloignées de la vue**, puis celles des autres niveaux ;
- les tuiles visibles ne sont jamais évincées ;
- en qualité basse, le niveau le plus fin est plafonné à 64 px par case (monde) et R = 2 (château).

À titre de comparaison, le château seul occupe aujourd'hui environ 200 Mo.

### Preuves (livrées avec le lot 1)

1. **Mesure automatique de l'agrandissement** (`tools/sharpness.cjs`, ajoutée à `npm run overlaps` ou lancée seule) :
   - le jeu publie, à chaque image, l'agrandissement maximum réel par couche : terrain, carte d'ensemble, brouillard, lieux, sol du château, scène du château, sprites, villageois (`app._sharp`) ;
   - l'outil parcourt monde et château, zooms minimum, moyen et maximum, DPR 1, 2 et 3, après fin de la peinture d'arrière-plan ;
   - il **échoue si une couche dépasse 1,25**.
2. **Captures avant et après** (`docs/v27/`) : monde et château, zooms minimum, moyen et maximum, DPR 1 et 2. Les captures « avant » sont prises sur la version v26 compilée.
3. **Images par seconde et mémoire** avant et après, avec le même scénario que ci-dessus (zoom avant, glisser, zoom arrière) :
   - temps d'image moyen, 95e centile et pire image ;
   - mémoire JS ;
   - **mémoire des canvas, comptée par le cache** (pas seulement les canvas affichés).
4. **Tests** (`tests/v27.test.js`) :
   - choix du niveau (jamais plus de 1,25) ;
   - éviction par distance et respect du budget ;
   - découpage du château en tuiles : chaque élément est dans toutes les tuiles qu'il touche ;
   - composition v23 inchangée.

---

## 3. Risques mémoire et performance

| Risque | Gravité | Parade |
|---|---|---|
| **Coût de peinture** des niveaux fins : une tuile 512 × 512 peinte pixel par pixel (`paintTerrain`) coûte environ 15 à 40 ms (extrapolé d'un bloc actuel de 256²) | Haute | Peinture en arrière-plan par tranches. Niveaux bas obtenus par réduction. Au zoom fort, seules 6 à 12 tuiles sont visibles. Le niveau en cours reste affiché tant que le nouveau n'est pas prêt. |
| **Mémoire sur téléphone** : budget de 160 Mo trop haut pour un vieux téléphone | Moyenne | Budget lié à la qualité graphique, et qualité « moyenne » choisie d'office sur petit écran tactile, comme aujourd'hui. Un essai de création qui échoue fait baisser le budget. |
| **Worker indisponible** : `OffscreenCanvas` (Safari ancien) ou fichier HTML unique hors ligne (un worker doit venir d'un `Blob`) | Moyenne | Worker créé depuis un `Blob` du code de peinture du terrain (pur, sans DOM), avec repli automatique sur le fil principal par tranches. Le jeu reste jouable hors ligne. |
| **Scintillement** au fondu, ou trous entre tuiles (joints d'un pixel) | Moyenne | Tuiles avec une marge d'un pixel source, positions arrondies au pixel réel, fondu seulement sur les tuiles nouvelles. Contrôle par captures à zoom fractionnaire. |
| **Repeinture du château** quand un bâtiment change : aujourd'hui une seule clé de scène | Moyenne | Clé par tuile : seules les tuiles touchées sont repeintes. |
| **Débordement des grands sprites** (tours, fumées) sur les tuiles voisines | Moyenne | Chaque élément est rangé dans toutes les tuiles que touche son rectangle de dessin (test dédié). |
| **Cache de sprites plus lourd** (DPR 3, gros plan) | Basse | Plafond en mégaoctets. Les variantes gros plan sont évincées en premier au dézoom. |
| **Tests v23 de composition** : profondeur, chevauchements | Basse | L'ordre de dessin ne change pas dans une tuile, et les tests v23 sont relancés tels quels. |
| **Navigateur sans carte graphique** (outils de mesure) : chiffres d'images par seconde bas en absolu | — | Les mesures sont comparées avant et après dans le même environnement, pas en valeur absolue. |

**Ce que je ne promets pas** :
- un rendu 60 images/s pendant le zoom sur un téléphone d'entrée de gamme ;
- au-delà du niveau 256 (DPR 3 et zoom 2,6, soit 405 px réels par case), le terrain du monde sera étiré au plus 1,6×. La mesure le dira, ou j'ajoute un niveau 512 limité à quelques tuiles. **À toi de choisir** (voir § 5).

---

## 4. Lots 2 et 3 (après ton essai du lot 1)

### Planche de style d'abord : `tools/artsheet.html`

**L'actuelle `tools/artsheet.html`** est une ancienne planche de bâtiments en SVG. Elle sera renommée `tools/artsheet20.html`.

La nouvelle planche montre, **avant toute généralisation** :
- une section de mur avec tour et porte, à chaque palier :
  - palissade ;
  - muret de pierre ;
  - haute muraille à tours ;
  - double enceinte ;
- les états du rempart : jour, nuit avec torches, alerte (pont levé), dégâts (fissures, brèche, échafaudage) ;
- 5 villageois (bûcheron, paysanne, porteur, forgeron, garde) qui marchent et travaillent, dans les 4 directions, animés.

Tu la valides, puis je généralise.

### Lot 2 : remparts dans l'esprit GGE

- **Murs continus** sans joints : la section est peinte comme un ruban le long du tracé, au lieu de pièces posées bout à bout (`wallPiece`). Pierre en assises, joints, mousse, ombre intérieure.
- **Crénelage régulier**, chemin de ronde et parapet intérieur.
- **Tours** :
  - rondes ou carrées selon le palier, plus hautes que le mur ;
  - toits coniques ou terrasses crénelées, meurtrières, drapeaux ;
  - grandes tours d'angle.
- **Porterie massive** : herse visible, pont-levis animé, abaissé ou levé (alerte, siège, nuit), torches la nuit.
- **Paliers** : palissade, puis muret, puis haute muraille à tours, puis double enceinte.
- **Dégâts** : fissures puis brèches, échafaudages pendant les réparations.
- **Siège** : engins v19 sur leur flanc ; archers aux créneaux pendant l'alerte.
- **Profondeur** : tests v23 gardés, et nouveaux tests (tour devant ou derrière un bâtiment voisin, porte et pont).

### Lot 3 : villageois animés (`src/ui/paint/life.js`)

- **Figures** plus grandes et détaillées, cuites au DPR réel.
- **Marche** en 6 à 8 images, 4 directions isométriques (2 dessinées, 2 en miroir), bras qui balancent, rebond.
- **Métiers** : bûcheron, paysan, porteur (sac, brouette), forgeron, marchand, garde en ronde, enfants, chien, poules.
- **Trajets** :
  - le long des chaînes de production (forêt → scierie → entrepôt…), sur les routes ;
  - jamais à travers murs ni bâtiments : graphe des routes et des cases libres, recherche A* précalculée.
- **Occlusion** derrière les bâtiments (ordre de profondeur partagé avec la scène).
- **Réactions** :
  - ordre public ;
  - crise ou famine (moins de monde, pas lents) ;
  - mise à l'abri pendant un raid ;
  - foule de fête ;
  - lanternes la nuit.
- **Clic ou survol** : bulle courte (métier, charge, humeur).
- **Nombre** plafonné par la qualité graphique. Image fixe si les animations sont réduites.

Chaque lot a ses captures, ses tests et sa partie « Proximité avec GGE » dans `AUDIT_V27.md`, avec la liste honnête de ce qui reste partiel.

---

## 5. Choix à confirmer avec ton feu vert

1. **Budget mémoire** (160 / 96 / 48 Mo pour les tuiles, plus 48 / 32 / 16 Mo pour les sprites, selon la qualité). C'est moins que les 200 Mo actuels du château seul.
2. **Niveau 512 px par case** au zoom maximum sur un écran DPR 3 : à ajouter (plus de mémoire), ou étirement de 1,6× accepté dans ce seul cas. **Je propose de l'accepter**, documenté et mesuré.
3. **Renommer** l'ancienne `tools/artsheet.html` en `tools/artsheet20.html`.
4. **Fondu de 150 ms** entre niveaux (rien si les animations sont réduites).
