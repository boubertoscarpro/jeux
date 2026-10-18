# Audit v15 — visuel et gameplay

Audit réalisé sur la v14 fusionnée (299 tests verts).

**Méthode**
- **Version testée** : la version compilée, lancée dans Chromium (Playwright).
- **Captures** : 8 écrans (9 images), à 3 tailles (1400 × 900, 1024 × 640, 390 × 844), soit 27 captures rangées dans [`v15/avant/`](v15/avant/). Script : `tools/v15shots.cjs`.
- **Sauvegarde** : les écrans de milieu de partie utilisent une **vraie partie v14**, produite par le joueur simulé (profil Actif, 3 jours, HdV 8, 98 niveaux de bâtiments, 3 provinces). La même sauvegarde sert au test de migration (`tests/fixtures/save-v14.json.gz`).
- **Performances** : le coût de rendu de la carte du monde a été chronométré dans `drawMap`, carte entièrement révélée, à 3 zoom (`tools/v15perf.cjs`, résultats dans `v15/avant/perf-monde.json`).

## 1. Constats vérifiés sur les captures

| # | Constat | Vérification | Gravité |
|---|---|---|---|
| 1 | **Les cartes n'occupent qu'environ 40 % de la largeur** en 1400 px. Elles sont serrées entre un panneau de texte central (« Votre royaume », missions cartographiques) et la colonne de droite. | Confirmé : la carte du royaume va de 100 à 710 px sur 1400 (44 %), et la carte du monde de même. En 1024 px, la carte du royaume commence sous le pli (y = 495 sur 640). | 🔴 |
| 2 | **Le conseiller apparaît deux fois** : boîte « Conseiller » de la colonne de droite et bouton « Conseiller » de la navigation. | Confirmé. Les deux affichent les mêmes recommandations, et le panneau « Votre royaume » répète les conseils de placement. | 🟠 |
| 3 | **Le royaume est une grille de carrés verts plats aux bordures dures.** Les bâtiments sont petits, et les décombres identiques se répètent. | Confirmé : tuiles de 64 px avec un contour par case, 4 variantes de vert seulement, décombres au même dessin. En milieu de partie, la vue centrée montre surtout de l'herbe vide. | 🟠 |
| 4 | **Carte du monde.** | Confirmé : | 🟠 |
| | — biomes en rectangles juxtaposés, sans transition | tuiles-sprites de 4 variantes | |
| | — rivière en blocs | | |
| | — arbres tamponnés à l'identique | | |
| | — brouillard en cercle pointillé et damier | | |
| | — mini-carte quasi vide | la mini-carte affiche toute la carte de 128 × 128 alors que la zone connue en occupe 10 % | |
| 5 | **Dans le royaume, la barre de sous-onglets chevauche la barre « Construire ».** | Confirmé : `.subnav` est `position: sticky; top: -14px; z-index: 4`. Au défilement, elle glisse au-dessus de « Construire ». Sur téléphone, elle fait 3 lignes et cache la moitié de la barre. | 🔴 bug |
| 6 | **Les emojis sont mêlés aux icônes SVG** dans les onglets, les titres et les boutons. | Confirmé : la navigation principale est en SVG, mais les sous-onglets (🏰 🎯 🏅 👑 🏛️), les titres de cartes et les boutons sont en emojis, dont le rendu change selon le système. | 🟠 |
| 7 | **La barre de ressources tient sur deux lignes, avec des icônes minuscules.** Les effets actifs s'empilent sous elle. | Confirmé, et c'est **pire que prévu sur téléphone** : la barre du haut fait **430 px sur 844** (ressources sur 3 lignes + 10 puces d'effets). La carte du royaume n'est pas visible sans faire défiler. En 1024 px, la barre fait 200 px sur 640. | 🔴 |
| 8 | **Les présages, crises, incendies et crues de la v14 se lisent surtout dans du texte.** | Confirmé : pendant une sécheresse avec un incendie, la carte du royaume est identique à une journée calme. Seul un petit 🔥 apparaît sur le bâtiment endommagé, et seulement s'il est à l'écran. | 🟠 |
| 9 | **Rapport de combat** | Un tableau de chiffres (dégâts et moral par phase), sans image du combat. | 🟡 |
| 10 | **Polices chargées depuis Google Fonts** (`index.html`), alors que le jeu doit fonctionner hors ligne. | Constat nouveau. Hors ligne, Cinzel et Inter ne se chargent pas et les titres retombent sur une police par défaut. L'icône de l'onglet est un emoji. | 🟠 |
| 11 | **Textes denses** dans les panneaux (conseil, missions cartographiques, bilan) : paragraphes de 4 à 6 lignes en 13 px. | Confirmé. | 🟡 |

**Performances de la carte du monde (v14).** Mesures dans Chromium sans écran, à relativiser sur un portable réel :

| Taille | Zoom rapproché | Zoom normal | Vue d'ensemble |
|---|---|---|---|
| 1400 × 900 | 2,4 ms (95e centile 6,6) | 2,5 ms (4,4) | 4,2 ms (8,2) |
| 390 × 844 | 1,8 ms (2,7) | 1,9 ms (3,2) | 3,0 ms (5,1) |

Le rendu v14 est léger parce qu'il est **pauvre** : des aplats et des sprites de 4 variantes, redessinés en entier à chaque image. Une carte peinte coûterait beaucoup plus. Il faut donc **mettre le terrain en cache par blocs** avant d'enrichir le dessin.

## 2. Direction artistique : « L'Atlas vivant »

Le jeu garde son cadre **pierre, ivoire et bronze**, c'est-à-dire le pupitre, les panneaux et les boutons. **Les cartes deviennent un atlas enluminé**, celui que le seigneur consulte sur ce pupitre : un parchemin peint à la main, qui **change à vue** quand le royaume change.

| Domaine | Règle |
|---|---|
| **Palette des cartes** | Encre sépia `#2c2216` pour les contours et le brouillard ; verts de sauge (`#7d9a55` à `#4e7238`) ; ocres de prairie sèche (`#b49a55`) ; bleus d'encre délavée pour l'eau (`#4f7fa8` à `#86b0c8`, berges `#3a5f80`) ; gris-violet des montagnes (`#8a8478`, ombre `#5a5248`) ; neige `#e8eef2` ; automne `#b0662a`. Saturation modérée : rien de fluo, l'interface reste plus vive que la carte. |
| **Palette d'état** | Le rouge braise (`--bad`) est réservé aux dangers (feu, raid, crise) ; l'or (`--gold`), à ce qui est à vous ; le bleu (`--blue`), à l'eau et aux présages. **Toujours doublé d'une forme** : flammes, vagues, icône, motif hachuré. La couleur n'est jamais seule. |
| **Typographie** | **Cinzel** pour les titres et les noms de lieux, **Inter** pour le texte. Les deux sont **embarquées** dans le fichier (licence OFL), donc identiques hors ligne. Repli : Palatino ou Georgia, puis la police système. |
| **Matières** | Parchemin (grain fin, variations lentes de teinte), aquarelle (aplats qui débordent légèrement aux transitions), encre (contours irréguliers, brouillard à bords déchiquetés), pierre et bronze pour le cadre. |
| **Lumière** | Venue du nord-ouest : chaque arbre, montagne et bâtiment porte une ombre courte vers le sud-est. Un **cycle jour et nuit** suit l'heure réelle : aube rosée, journée neutre, crépuscule ambré, nuit bleutée à 35 % au plus, pour que tout reste lisible. |
| **Animation** | Lente et porteuse de sens : la pluie tombe s'il pleut, les flammes dansent s'il y a un feu, une frontière contestée vacille. **Rien ne bouge sans raison.** « Réduire les animations » ou `prefers-reduced-motion` figent tout ; il reste alors un état statique lisible (flammes immobiles, voile de pluie fixe). Le **mode économie** n'anime pas du tout la météo et limite la carte du monde aux redessins nécessaires. |

## 3. Idées (12), notées sur 5

**Notes** :
- **Inno.** = originalité par rapport au genre ;
- **Impact** = effet ressenti par le joueur ;
- **Faisa.** = faisabilité dans l'architecture actuelle.

### Visuel

**V1. Mise en page centrée sur les cartes**
- **Principe**
  - Sur les écrans Royaume et Carte, la carte prend toute la largeur.
  - Le panneau de détail devient un tiroir flottant repliable.
  - La colonne de droite devient un tiroir, ouvert à la demande.
  - Le conseiller n'apparaît plus qu'une fois.
  - La barre du haut tient sur une ligne : les effets actifs sont regroupés dans une puce dépliable.
  - La barre de sous-onglets cesse d'être collante et ne chevauche plus rien.
- **Originalité** : faible en soi, mais condition de tout le reste.
- **Réutilise** : `app.js`, `hud.js`, CSS.
- **Coût** : M.
- **Risques** : régression de mise en page sur 40 écrans. Parade : `npm run layout`, plus un test dédié au chevauchement.
- **Notes** : Inno. 2 · Impact 5 · Faisa. 4.

**V2. Royaume peint**
- **Principe**
  - Un sol continu est peint sur un canvas sous la grille : herbe en aquarelle, variations de bruit, berges qui se fondent dans la rivière, sous-bois, rochers, décombres variés.
  - Le quadrillage ne s'affiche qu'en mode construction.
  - Les bâtiments sont plus grands (débord de 12 %).
- **Originalité** : on garde la grille de jeu (lisible, cliquable), mais elle n'est plus vue.
- **Réutilise** : la grille DOM de `city.js`, les terrains, les saisons.
- **Coût** : M.
- **Risques** : coût du canvas sur une ville de 40 × 24 cases. Parade : une seule peinture, mise en cache par signature (terrain, saison, état).
- **Notes** : Inno. 3 · Impact 5 · Faisa. 4.

**V3. Monde peint, mis en cache par blocs**
- **Principe**
  - Le terrain est peint par blocs de 8 × 8 cases, mis en cache.
  - Transitions de biomes par déformation au bruit : les frontières deviennent organiques, la rivière serpente.
  - Arbres, collines et montagnes varient d'une case à l'autre, avec une ombre portée.
  - Brouillard à l'encre, aux bords déchiquetés.
  - Mini-carte cadrée sur la zone connue.
- **Originalité** : rendu « atlas » procédural, sans aucune image.
- **Réutilise** : `world.js`, `worldArt.js`, les terrains.
- **Coût** : L.
- **Risques** : performance. Parade : cache par blocs, niveaux de détail, réglage de qualité, mesure avant et après.
- **Notes** : Inno. 3 · Impact 5 · Faisa. 3.

**V4. Le monde montre son état** (rend visible la v14)

**Principe.** Chaque effet se superpose à la carte et suit l'état réel du royaume :

| Situation | Ce que montre la carte |
|---|---|
| Hiver | Neige |
| Automne | Couleurs d'automne |
| Sécheresse | Champs jaunis, avec des craquelures |
| Crue | L'eau déborde sur la zone inondable, avec des vaguelettes |
| Incendie | Flammes et fumée sur les bâtiments en feu |
| Pluie, neige, brume, tempête | Météo animée |
| Heure réelle | Jour et nuit |
| Frontière contestée | Bordure qui vacille, avec des hachures (lisible sans la couleur) |

- **Originalité** : un tableau de bord sans texte. On lit la crise sur la carte avant de lire le panneau.
- **Réutilise** : `crises`, `catastrophe`, `weather`, `calendar`, `hazards.floodZone`, `borderOf`.
- **Coût** : M.
- **Risques** : surcharge visuelle et mouvement. Parade : intensité bornée, et tout se coupe avec « réduire les animations ».
- **Notes** : Inno. 4 · Impact 5 · Faisa. 4.

**V5. Une seule langue d'icônes, et des polices hors ligne**
- **Principe**
  - Les emojis de l'interface (onglets, titres, boutons, puces) sont remplacés par des icônes SVG du même trait que celles des ressources.
  - Les emojis non couverts sont harmonisés (même taille, même alignement, teinte sépia) au lieu de jurer.
  - Les polices sont embarquées.
- **Originalité** : faible, mais nécessaire.
- **Réutilise** : `icons.js`.
- **Coût** : M.
- **Risques** : un emoji manqué. Parade : le remplacement est centralisé et appliqué à chaque rendu.
- **Notes** : Inno. 2 · Impact 4 · Faisa. 4.

**V6. Qualité graphique et économie d'énergie**
- **Principe**
  - Réglage bas, moyen ou élevé : résolution des blocs, ombres, météo, transitions.
  - Mode économie : aucune animation continue, redessins seulement quand l'état change.
  - Détection de la préférence du système.
- **Réutilise** : `meta`, les réglages existants (`reduce-motion`).
- **Coût** : S.
- **Risques** : aucun.
- **Notes** : Inno. 2 · Impact 3 · Faisa. 5.

**V7. Vie ambiante (villageois et charrettes qui suivent les vrais flux)**
- **Principe** : des passants et des charrettes circulent sur les routes, et leur densité suit la production.
- **Coût** : M/L.
- **Risques** : une boucle d'animation permanente sur une grille DOM de 960 cases, pour une information que le Bilan donne déjà.
- **Notes** : Inno. 3 · Impact 3 · Faisa. 2.

**V8. Rapport de combat animé**
- **Principe** : le combat est rejoué sur un petit champ de bataille, phase par phase (volée, mêlées), à partir des pertes déjà calculées.
- **Coût** : M.
- **Risques** : faible, sans effet sur le jeu.
- **Notes** : Inno. 3 · Impact 3 · Faisa. 4.

**V9. Paysage sonore procédural (WebAudio)**
- **Principe** : une ambiance qui suit la saison, la météo et les crises, coupée par défaut.
- **Coût** : M.
- **Risques** : impossible à vérifier par capture ou par test automatique, et désactivée par défaut, donc peu vue.
- **Notes** : Inno. 3 · Impact 2 · Faisa. 3.

### Gameplay

**G1. Les signes des présages (information progressive, préparation partielle)**
- **Constat de V14 (§ 7)** : à 55 % de fiabilité, se préparer est rarement rentable, et le joueur simulé ne s'est préparé que 0 à 6 fois par semaine.
- **Principe**
  - Entre l'annonce et l'échéance, des **signes** apparaissent : puits qui baissent, champs qui jaunissent, rivière qui gonfle, givre précoce, ciel lourd.
  - Ils sont **visibles sur la carte du royaume** et notés dans l'almanach.
  - Un présage **vrai** produit des signes plus souvent qu'un faux. Chaque signe observé, ou chaque délai sans signe, **met à jour la fiabilité affichée** (règle de Bayes, expliquée en clair).
  - Le joueur attentif qui « lit » sa carte en sait donc plus que l'almanach du début.
  - **Préparation partielle** : une demi-mesure, à moitié prix, qui raccourcit et adoucit la crise (elle commence à l'étape 2 au lieu de ne pas exister).
- **Originalité** : l'information imparfaite se **voit** et se **raffine** dans le temps. Le pari devient un choix de *moment* (« je me prépare maintenant à moitié prix, ou j'attends un 2e signe ? »).
- **Réutilise** : `omens.js`, `crises.js`, la carte du royaume, l'almanach.
- **Coût** : M.
- **Risques**
  - Sauvegarde : champs `signs` et `qShown` sur les présages, avec valeurs par défaut.
  - Équilibre : la fréquence des catastrophes ne doit pas changer (testé).
- **Notes** : Inno. 5 · Impact 4 · Faisa. 4.

**G2. Némésis de la Brèche (ennemis mémorables)**
- **Principe**
  - Chaque forteresse de la Brèche est tenue par un **seigneur nommé**, avec un **visage généré** en SVG (seed), des **cicatrices** gagnées à chaque défaite et des **titres** gagnés à chaque victoire.
  - Il **se souvient** de vos combats : victoires, défaites, armée la plus fréquente.
  - Il **adapte sa garnison** à votre composition habituelle (des piquiers si vous venez à cheval, des boucliers contre les archers), dans une limite de +20 %.
  - On le voit sur la carte (portrait), dans la fiche de la forteresse et dans le rapport de combat.
- **Originalité** : la logique « Nemesis » appliquée à un jeu de gestion. L'ennemi récurrent a une identité et une mémoire, et sa réponse est lisible avant l'attaque (« Il vous attend : il a recruté des piquiers »).
- **Réutilise** : `breach.js`, `combat.js` (contres de classes), la chronique, `marches.js`.
- **Coût** : M.
- **Risques** : punir toujours la même stratégie. Parade : adaptation bornée et annoncée, et l'oubli progressif récompense la variété.
- **Notes** : Inno. 4 · Impact 4 · Faisa. 4.

**G3. Quartiers, vues et nuisances**
- **Principe** : un quartier se forme quand plusieurs bâtiments d'un même type se touchent. Une tannerie ou une charbonnière gêne les maisons voisines. Une place embellie améliore le moral.
- **Coût** : M.
- **Risques** : recoupe les bonus d'adjacence existants et le risque d'incendie de la v14 ; l'équilibre de la production serait à refaire.
- **Notes** : Inno. 3 · Impact 3 · Faisa. 3.

### Écartées d'emblée (déjà évaluées dans AUDIT_V14)

- **Château fantôme, défi du jour** : coût L, et triche impossible à contrôler sans serveur.
- **Lignées et livre de la dynastie** : effet narratif seulement.
- **Fusion sagas / quêtes** : coût L, sans lien avec le thème. Reportée une troisième fois, avec la même raison.
- **Royaume en isométrie** : il faudrait réécrire la grille de clics, le placement et les tests de mise en page. V2 obtient l'effet recherché (relief, continuité) sans casser la grille.

### Synthèse

| # | Idée | Inno. | Impact | Faisa. | Coût |
|---|---|---|---|---|---|
| V1 | Mise en page centrée sur les cartes | 2 | 5 | 4 | M |
| V2 | Royaume peint | 3 | 5 | 4 | M |
| V3 | Monde peint, cache par blocs | 3 | 5 | 3 | L |
| V4 | Le monde montre son état | 4 | 5 | 4 | M |
| V5 | Icônes et polices hors ligne | 2 | 4 | 4 | M |
| V6 | Qualité graphique, économie | 2 | 3 | 5 | S |
| V7 | Vie ambiante | 3 | 3 | 2 | M/L |
| V8 | Combat animé | 3 | 3 | 4 | M |
| V9 | Paysage sonore | 3 | 2 | 3 | M |
| G1 | Signes des présages | 5 | 4 | 4 | M |
| G2 | Némésis de la Brèche | 4 | 4 | 4 | M |
| G3 | Quartiers et nuisances | 3 | 3 | 3 | M |

## 4. Lot retenu : « L'Atlas vivant »

**Thème.** La carte devient le principal instrument de lecture du royaume. On y voit ce qui arrive (V4), ce qui va arriver (G1) et qui vous attend (G2). Elle est assez grande (V1) et assez belle (V2, V3) pour qu'on ait envie de la regarder.

**Lot :**
- 6 idées visuelles : **V1, V2, V3, V4, V5, V6** ;
- 2 idées de gameplay : **G1** (elle rend visibles les systèmes de la v14) et **G2**.

**Pourquoi ce lot**
- **Il corrige les trois défauts majeurs constatés.** Avec V1 : cartes à 44 % de la largeur, barre du haut à 430 px sur téléphone, chevauchement des barres. Avec V4 et G1 : la v14 invisible sur la carte.
- **Il traite le point « à surveiller » de V14** (préparations peu rentables) **par la mécanique** : de l'information qui s'affine et une demi-mesure. Pas par un simple ajustement de chiffre.
- **G2 relie trois systèmes** (Brèche, combat, chronique), en suivant l'idée 6 de l'audit V14.
- **V6 est la condition de V3 et V4**, pour tenir les performances sur un portable ordinaire.

**Pourquoi pas les autres**
- **V7 (vie ambiante)** : une animation permanente sur une grille DOM de 960 cases, pour une information que le Bilan donne déjà. Le coût de performance est disproportionné. V4 rend visible ce qui compte (crises, saisons) sans boucle continue.
- **V8 (combat animé)** et **V9 (son)** : bons candidats pour une v15.x. Ils ne touchent ni la lisibilité générale ni la v14.
- **G3 (quartiers)** : recoupe les adjacences et le feu de la v14, et l'équilibrage de la production serait à refaire entièrement.

La mise en œuvre, les mesures et les décisions prises en autonomie sont dans [`V15.md`](V15.md).
