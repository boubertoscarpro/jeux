# Audit v27 — « Netteté et vie » (lot 1 : netteté)

**Plan validé** : `docs/PLAN_V27.md`. Les quatre choix y sont confirmés :
- budget mémoire ;
- étirement de 1,6× accepté pour le terrain en DPR 3 au zoom maximum ;
- ancienne planche renommée ;
- fondu de 150 ms.

**Détail technique** : `docs/V27.md`.

**Conditions des mesures** :
- jeu compilé ;
- partie de fin (`tests/fixtures/save-fin.json.gz`) ;
- Chromium sans tête et **sans carte graphique** (rendu logiciel). Les images par seconde se comparent donc avant/après dans le même environnement, pas en valeur absolue.

**« Avant »** : version v26 (`e533810`), compilée à part.

## 1. Agrandissement réel par couche (`node tools/sharpness.cjs`)

L'agrandissement est l'étirement réellement dessiné à la dernière image, replis compris, après la fin de la peinture d'arrière-plan.

| Couche | Zoom | v26, DPR 1 | v26, DPR 2 | **v27, DPR 1** | **v27, DPR 2** | **v27, DPR 3** |
|---|---|---|---|---|---|---|
| Terrain du monde | minimum (0,15) | 0,97 | 1,95 | **0,49** | **0,98** | **0,73** |
| Terrain du monde | 0,45 (avant les blocs v26) | 3,2 | 6,4 | ≤ 1,25 | ≤ 1,25 | ≤ 1,25 |
| Terrain du monde | moyen (1) | 1,63 | 3,25 | **0,81** | **0,81** | **1,22** |
| Terrain du monde | maximum (2,6) | 4,2 | 8,5 | **1,06** | **1,06** | 1,58 (accepté, plan § 5.2) |
| Brouillard | maximum | 22,5 | 45 | **1** (vectoriel) | **1** | **1** |
| Lieux et cibles | maximum | 1 | 1,76 | **1,22** | **1,22** | **1,22** |
| Sol du château | maximum (2,4) | 2,31 | 4,61 | **1,2** | **1,2** | **1,2** |
| Scène du château | maximum | 2,31 | 4,61 | **1,2** | **1,2** | **1,2** |
| Villageois | maximum | 0,8 | 1,6 | **1,2** | **1,2** | **1,2** |

- **Résultat** : `Aucune couche étirée au-delà de 1.25 (hors cas accepté)`. L'outil sort avec le code 0.
- **Le tableau complet** (54 lignes) est produit par `node tools/sharpness.cjs`.
- **Une valeur seulement estimée** : la ligne « zoom 0,45 » n'est pas mesurée par l'outil, qui ne prend que les zooms minimum, moyen et maximum. Elle découle de la règle de choix du niveau, vérifiée pour tous les zooms par `tests/v27.test.js`.
- **Corrigé pendant la mesure** : les lieux du monde, en DPR 3 au zoom maximum, étaient étirés 1,5×. Un palier de cuisson 6 a été ajouté.

## 2. Captures avant / après (`docs/v27/`)

Les fichiers sont nommés `avant-` ou `apres-`, puis `monde-` ou `chateau-`, puis `min`, `moyen` ou `max`, puis `dpr1` ou `dpr2`. Ce sont **24 images**, montrant le centre de l'écran (700 × 440 px CSS) en pixels réels.

| Cas | Ce qui change |
|---|---|
| **Château, zoom maximum, DPR 2** (`*-chateau-max-dpr2.png`) | Tuiles des toits, bardeaux, colombages, pavés, fenêtres et bannières nets. En v26, toute la scène était étirée 4,6×. |
| **Monde, zoom maximum, DPR 2** | Prairie, berges et arbres nets. Les bords de terrain ne sont plus en escalier flou. |
| **Monde, dézoom maximum** | Vraie carte d'ensemble : massifs forestiers au lieu de points, montagnes en relief, frontières lissées, brouillard net au bord frangé. En v26, on voyait une image globale de 8 px par case avec des frontières en créneaux. |
| **Château et monde, zoom moyen** | Gain moindre en DPR 1 (la v26 était déjà proche de 1), net en DPR 2. |

## 3. Images par seconde et mémoire (`node tools/v27perf.cjs`)

**Scénario** : 12 crans de zoom avant, un glisser de 30 pas, puis 24 crans de zoom arrière. Écran 1280 × 800.

| Scène | Images/s v26 → v27 | 95 % des images sous (ms) | Pire image (ms) | Mémoire JS (Mo) | Canvas affichés (Mo) | Cache de tuiles v27 (Mo) | Dessins cuits v27 (Mo) |
|---|---|---|---|---|---|---|---|
| Monde, DPR 1 | 38 → 23 | 67 → **50** | 350 → **117** | 54 → 33 | 4 → 4 | 61 | 6 |
| Monde, DPR 2 | 17 → **21** | 200 → **83** | 900 → **150** | 48 → 21 | 17 → 17 | 137 | 43 |
| Château, DPR 1 | 14 → **19** | 67 → 67 | **7 366** → **117** | 17 → 30 | **181 → 12** | 32 | 5 |
| Château, DPR 2 | 18 → 15 | 83 → 133 | 333 → **183** | 26 → 17 | **208 → 49** | 84 | 41 |

**Lecture honnête** :
- **Château, mémoire des images** : environ **200 Mo → 60 à 130 Mo**, tout compris (canvas affichés, tuiles et dessins), pour une finesse 4 à 6 fois plus haute au zoom fort.
- **Château, à-coups** : la pire image passe de 7,4 s à 0,12 s en DPR 1. En v26, tout le domaine était repeint d'un coup à chaque changement de finesse.
- **Monde, DPR 2** : plus fluide (p95 de 200 à 83 ms), mais avec un cache de tuiles de 137 Mo, sous le budget de 160 Mo. La v26 gardait aussi jusqu'à 220 blocs (environ 58 Mo), non comptés dans la colonne « avant ».
- **Monde, DPR 1** : la moyenne baisse (38 → 23 images/s). Les fondus et l'arrivée des tuiles font redessiner la carte plus souvent pendant la peinture d'arrière-plan. Les à-coups, eux, baissent (pire image de 350 à 117 ms).
- **Château, DPR 2** : légèrement moins fluide pendant le geste (p95 de 83 à 133 ms). C'est le coût de la cuisson des dessins à la finesse 4, la première fois qu'un bâtiment est vu de près. Avec une carte graphique, ces cuissons (filtres, contours) sont bien plus rapides. Ici, rendu logiciel, c'est le pire cas.
- **Temps de peinture d'une tuile** (rendu logiciel) :

  | Tuile | Temps |
  |---|---|
  | Terrain du monde, dans un worker | environ 32 ms |
  | Sol du château | 8 à 90 ms |
  | Scène du château | 10 à 400 ms la première fois (cuisson des dessins), puis quelques ms |

## 4. Validation

| Contrôle | Résultat |
|---|---|
| `npm test` | voir § 7 |
| `npm run smoke` | voir § 7 |
| `npm run layout` | voir § 7 |
| `npm run overlaps` | voir § 7 |
| `npm run simulate` | voir § 7 |
| `npm run build` | 2 327 Ko (v26 : 2 310 Ko) |
| `node tools/sharpness.cjs` | aucune couche au-delà de 1,25 (hors cas accepté) |

## 5. Proximité avec GGE

| Élément | Avant (v26) | Après (v27) | Reste à faire |
|---|---|---|---|
| Netteté du château au zoom | Flou dès le zoom 1,2 en DPR 2 | Net à tous les zooms, DPR 1 à 3 | — |
| Netteté de la carte du monde | Terrain étiré jusqu'à 8,5× | Net, sauf DPR 3 au zoom maximum (1,58×, accepté) | Niveau 512 si besoin |
| Vue d'ensemble du monde | Image floue en gros pixels | Carte peinte : massifs, relief, frontières lissées | Pas de noms de régions peints sur la carte |
| Frontières | Créneaux case par case | Contours lissés, épaisseur constante | — |
| Brouillard | Image étirée 22 à 68× | Vectoriel, net, bord frangé | — |
| Zoom fluide (fondu entre niveaux) | Repeinture d'un coup (à-coup) | Ancien niveau gardé, nouveau en fondu | Le niveau fin arrive après 0,5 à 2 s au château en rendu logiciel |
| Remparts dans l'esprit GGE | Pièces posées | — | **Lot 2** (après la planche de style) |
| Villageois animés | 2 images de marche | Seulement nets au zoom | **Lot 3** (après la planche de style) |

## 6. Ce qui reste partiel (honnêtement)

- **DPR 3 au zoom maximum** : le terrain du monde est étiré 1,58×, comme prévu par le choix 2 du plan. Les autres couches restent sous 1,25.
- **Arrivée du niveau fin au château** : au gros plan, la première visite d'un quartier montre 0,5 à 2 s le niveau précédent (net à 2,4×, mais pas encore à la finesse finale), le temps de cuire les bâtiments à la finesse 4. Ensuite, c'est instantané (cache).
- **Monde en DPR 1** : moyenne d'images par seconde plus basse pendant la peinture d'arrière-plan (voir § 3).
- **Côtes** : le pourtour du monde était déjà vectoriel (v26). Les rivières le deviennent. Les bords des terrains (forêt, plaine…) restent peints au pixel, mais au niveau de l'écran, donc nets.
- **Mémoire sur téléphone** : budgets fixés par la qualité graphique. Aucun essai sur un vrai appareil (environnement sans téléphone).
- **Lots 2 et 3** : pas commencés. La planche de style `tools/artsheet.html` vient d'abord, pour ta validation.

## 7. Résultats de validation
