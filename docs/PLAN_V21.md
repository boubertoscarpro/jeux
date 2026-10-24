# Plan v21 — « Couleurs du Royaume »

Statut : **plan révisé après vos précisions** (le graphisme d'abord, la performance n'est plus bloquante). La planche de style est faite et attend votre avis (§ 0). Rien n'est encore appliqué au jeu.

## 0. Révision : technique de rendu et planche de style

**Priorités révisées**
- Le graphisme passe avant les mécaniques.
- Mesures avant/après pour information.
- Garde-fous :
  - environ 30 images par seconde sur un portable courant avec carte graphique ;
  - un réglage « Qualité graphique » dont le mode haut devient le défaut, et un mode bas pour les petites machines et le téléphone.

**Technique proposée : peinture procédurale cuite, puis scène en canvas**
1. Chaque bâtiment est **peint en Canvas 2D** à double résolution par des primitives isométriques (`src/ui/paint/paint.js`) :
   - matières : pierre de taille aux blocs irréguliers, enduit, colombages, planches, tuiles en écailles, ardoises, chaume en brins ;
   - lumière chaude venue du haut à gauche, occlusion au pied des murs, ombres portées floutées ;
   - tours rondes à assises, toits coniques, bannières, personnages.
2. Il est ensuite **« cuit »** (`src/ui/paint/bake.js`) en une image unique : lumière d'ambiance (chaude en haut à gauche, froide en bas à droite), saturation relevée, contour de silhouette brun régulier. C'est ce qui donne l'aspect « illustration lisible ».
3. La **carte** devient un canvas qui pose ces images dans l'ordre de profondeur. Par-dessus, une couche de boutons HTML invisibles garde le clavier, le focus, le lecteur d'écran et les tests (on garde la projection inverse de la v20).
4. La **vie** (gardes, paysans, charrettes, fumée, eau, drapeaux) va sur un canvas animé à part, qui ne redessine pas les bâtiments.

| | Avantages | Inconvénients |
|---|---|---|
| Canvas 2D cuit (proposé) | Rendu « peint » riche (dégradés, flous, textures). Aucune dépendance, tout reste hors ligne. Coût par image faible : on pose des images déjà cuites. Fonctionne partout, téléphone compris. | Temps de cuisson au chargement (à mesurer, mis en cache par bâtiment, palier et variante). Mémoire en images. Une réécriture de la vue isométrique. |
| SVG actuel enrichi | Peu de changements. | Plafond de qualité atteint : pas de flou ni de texture bon marché, des milliers de nœuds, lent sans carte graphique. |
| WebGL ou bibliothèque embarquée (par exemple Pixi) | Effets en temps réel (lumière, eau). | Grosse dépendance à embarquer. Accessibilité à reconstruire de toute façon. Le gain visuel tient surtout au dessin, que le canvas cuit donne déjà. |

**Planche de style** : `tools/artsheet21.html`, captures dans `docs/v21/planche/`.
- Hôtel de ville en 3 paliers : maison commune, donjon, citadelle.
- Ferme, caserne, muraille crénelée gardée avec sa tour et ses douves.
- Une scène à l'échelle du jeu.
- Une fenêtre d'interface (bois, ruban, parchemin, onglets en cuir, gros boutons ronds) et une barre de ressources sur une planche, avec des icônes riches.

**Après votre validation**, l'ordre de livraison devient :
1. le style appliqué à tous les bâtiments, leurs paliers et la muraille ;
2. la scène canvas avec sa couche de boutons accessible ;
3. la vie animée ;
4. les retours gratifiants ;
5. l'interface bois et parchemin ;
6. la carte du monde ;
7. puis les mécaniques B1 à B6 (§ 3, lot 7), ensuite C et la validation.


But : donner au premier coup d'œil la sensation d'un château de jeu de stratégie chaleureux, coloré et vivant, avec une interface généreuse, et ajouter des mécaniques emblématiques du genre. Chacune est branchée sur un système de Cendrelande et a sa subtilité propre. On ne copie ni noms, ni visuels, ni textes.

## 1. Inventaire : ce qui existe et ce qui sera relié

| Code du genre | Déjà dans Cendrelande | Ce que la v21 en fait |
|---|---|---|
| Muraille, porte, douves, tours | v16 enceinte, v19 protections, v20 dessin isométrique (`isoView.js`) | Redessin plus chaleureux (A1) ; gardes animés sur le chemin de ronde (A2) |
| Siège par flancs, vagues, cour ; engins | v19 `siege.js` (`siegeBattle`, `defendCastle`, `remember`) | Le **châtelain** (B3) s'y branche ; les blessés (B1) sortent du rapport de siège |
| Ennemis qui s'adaptent | v19 `remember()` (mémoire des engins posés par seigneur), v15 némésis (`nemesis.js`) | La mémoire apprend aussi le poste et la classe du châtelain (B3) |
| Ordre public, décorations | v20 `order.js`, `decoEffects` (moral de la garnison, des ouvriers près des maisons) | Auras par type de décoration et usure saisonnière (B6) |
| Titres, trophées, vitrine | v20 `nobility.js`, `trophies.js` | Nouvelles sortes de trophées : soins, ligue brisée, renforts (C) |
| Terres lointaines, avant-postes | v20 `farlands.js`, v13 `territory.js` | Inchangés ; la ligue des brigands (B4) peut viser un avant-poste |
| Seigneurs de la Brèche (forteresses à paliers) | `breach.js` (5 paliers, doctrine, némésis, butin avec relique) | **Pas de doublon** : les « châteaux de brigands » sont des camps de bandits existants qui gagnent des niveaux (B4), la Brèche reste la fin de partie |
| Raids en série, corvées | v13 `raidOrders.js`, v20 `chores.js` | Les séries répétées sur les mêmes camps nourrissent la ligue (B4) |
| Pertes et soins | `combat.losses`, potion de soin consommable (`CONSUMABLES.healPotion`, chaîne herbes → laboratoire) | Infirmerie et blessés (B1) : les soins consomment cette chaîne |
| Reliques | `ARTIFACTS` (bonus globaux, Salle du trésor), `relicFragments` (3 → relique), relique dans le butin de la Brèche, fouilles (`archaeology.js`) | Objets de bâtiment (B2) : de nouvelles **reliques de bâtiment**, venues des mêmes sources |
| Héros intendant et commandant | `heroes.js` (affectation `governor`, commandant de marche) | Troisième rôle : **châtelain** (B3) |
| Alliés, renforts | `factions.js` (traités, alliances, grief et faveur), cités libres (`town`), `reputation.js` | Renforts sur les murs (B5) |
| Conseil royal | `council.js`, groupe « Assemblée des villages » | Blessés abandonnés : faveur des villages en baisse (B1) |
| Présages | `omens.js` (catastrophes annoncées, signes) | Nouveaux présages : afflux de blessés, riposte de la ligue (C) |
| Événements de 72 h | `liveEvents.js` | Inchangés |
| Vie de la carte | v20 : moulins, roue, fumée de forge, foule du marché, torches, bannières au vent, herse | Couche de vie animée sur canvas, liée à l'état du royaume (A2) |
| Mode photo, film | v20 `photo.js`, `film.js` | Ils intègrent la couche de vie (C) |

## 2. Mesures « avant » (relevées le 23/10, v20 corrigée, sans carte graphique)

Fichiers : `docs/v21/avant/` (captures de 11 scènes × 3 tailles, `mesures.json`, `clics.json`, `chevauchements.json`, `layout.log`, `contrastes.txt`, `noeuds.txt`).

| Mesure | 1400 × 900 | 1024 × 640 | 390 × 844 |
|---|---|---|---|
| Images par seconde au repos / pendant un glisser | 16 / 13 | 32 / 31 | 53 / 48 |
| Rendu complet de la vue | 52,5 ms | 49,8 ms | 51,1 ms |
| Délais des actions courantes | 87 à 349 ms | 101 à 167 ms | 81 à 147 ms |
| Nœuds du DOM (total / vue / affichage fixe) | 4 810 / 2 007 / 223 | 4 784 / 2 011 / 193 | 4 770 / 2 007 / 183 |
| Éléments animés en CSS dans la vue | 15 | 15 | 15 |

Autres relevés :
- **Contrastes** : 295 couleurs de texte, 0 sous AA dans les 5 modes, minimum 4,61:1.
- **Chevauchements** : 0 (9 scènes).
- **Mise en page** : 360 vérifications, aucun problème.
- **Clics** : défense conseillée 2, réglage des corvées 6. Le ravitaillement et les raids ne sont pas rejoués de façon stable par l'outil (déjà noté en v20).

**Règle de la v21** : aucune de ces mesures ne doit se dégrader au-delà du bruit (±50 ms sur les délais, ±3 images par seconde). Toute couche nouvelle est mesurée seule avant d'être gardée.

## 3. Lots, dans l'ordre de livraison

Chaque lot se termine par `npm test`, smoke, layout et chevauchements verts, puis un commit.

### Lot 0 — Outillage de non-régression (petit, d'abord)
- `tools/v21diff.cjs` : compare deux captures pixel par pixel dans le navigateur (canvas) et produit une image des écarts et un pourcentage. Il sert à la consolidation CSS (A1) : « sans régression visuelle » devient un chiffre.
- Extension de `v20shots.cjs` : nombre de nœuds, éléments animés, entités vivantes, images par seconde avec la couche de vie.
- Nouvelle fixture `tests/fixtures/save-v20.json.gz`, à partir de `save-fin` migrée et jouée en v20.

### Lot 1 — Jetons de thème et consolidation CSS (A1, A4)
- La cascade actuelle charge, dans l'ordre : `style`, `theme`, `v15`, `v16`, `v16b`, `v17`, `v18`, `v19`, `v20`. Ajouter `v15` à `v20` **à la fin de `theme.css`, dans le même ordre**, donne exactement la même cascade.
- Une fois la consolidation faite, je retire les règles écrasées plus loin, une par une : chaque retrait est vérifié par `v21diff` (0 pixel d'écart sur les 33 captures) et par le test de contraste.
- Jetons : palette (herbe, toits par famille, ardoise, pierre claire, bois, parchemin, or), lumière (teinte de fin d'après-midi), contours, ombres. Les 5 modes (normal, contraste élevé, 3 daltoniens) redéfinissent les jetons, pas les règles.
- Fichiers : `css/theme.css` (grossit), `css/v15…v20.css` (supprimés), `index.html`, `tools/build.mjs`, `src/ui/isoArt.js` (les couleurs du dessin lisent une table de jetons commune).

### Lot 2 — Direction artistique des bâtiments (A1)
- `isoArt.js` : palette plus saturée et chaude, contours sombres réguliers (épaisseur fixe), ombres portées douces au sol (une ellipse floutée partagée en `<symbol>`).
- Détails qui racontent la fonction : tonneaux à la taverne, linge chez le tisserand, enclume, étals, roue à aubes, cheminées.
- **Croissance par paliers** : chaque archétype reçoit des ajouts par palier de taille (0 à 5) : étage, tourelle, ornement, bannière. Ce sont des ajouts au dessin, pas un agrandissement.
- Le coût en nœuds reste nul : tout passe par les mêmes `<symbol>`, dont la clé inclut déjà le palier.
- Fichiers : `src/ui/isoArt.js`, `src/ui/isoView.js` (murs), `src/ui/atlas.js` (herbe plus vive, douves).

### Lot 3 — Un château vivant (A2)
- **Une seule couche canvas** de particules et de figurants, posée au-dessus du sol et sous les bâtiments : paysans et charrettes sur l'allée et les routes, gardes sur le chemin de ronde, oiseaux, ombres de nuages, reflets des douves.
  - Les figurants sont des sprites dessinés une fois dans un canvas hors écran : aucun nœud DOM.
  - Pas de tri de profondeur à chaque image : chaque figurant a une ligne de profondeur fixe (allée, chemin de ronde), et les gardes passent sur un canvas au-dessus des murs du fond, sous ceux de devant.
- **Densité liée à l'état** (une fonction pure, `systems/life.js`, testée) :
  - ordre public haut : plus de passants ;
  - famine ou crise : rues presque vides et charrettes arrêtées ;
  - raid annoncé : gardes doublés ;
  - nuit : torches et peu de monde.
  - Le « Pourquoi ? » de la vie dit ce qui la fait varier.
- **Plafond** :
  - qualité haute : 40 entités ;
  - moyenne : 16 ;
  - basse, économie d'énergie ou mouvement réduit : 0 (seules restent les images fixes de v20).
  - La boucle s'arrête quand l'onglet est caché, quand la carte est hors écran (fenêtre ouverte par-dessus) et pendant un glisser. Elle est bornée à 30 images par seconde.
- Fichiers : `src/systems/life.js` (nouveau, pur), `src/ui/lifeLayer.js` (nouveau), `src/ui/views/city.js`.

### Lot 4 — Retours gratifiants (A3)
- **Chantier** : échafaudage déjà présent ; un ouvrier animé (même couche canvas). À la fin, un nuage de poussière et un petit rebond (CSS `transform` sur le bouton) ; à la montée de niveau, un éclat doré (une seule `<use>` en opacité).
- **Récolte** : chiffres flottants (« +120 bois »), au plus 6 à la fois, en DOM temporaire retiré à la fin. Les pièces volent vers la jauge de la ressource, qui pulse.
- **Interface** : boutons qui s'enfoncent (`:active` en `transform`), relief au survol, fenêtres qui s'ouvrent avec un léger zoom.
- En mouvement réduit : pas de mouvement ; un texte (« +120 bois » dans le fil) et une surbrillance fixe de 1 s sur la jauge.
- Fichiers : `src/ui/juice.js` (nouveau), CSS.

### Lot 5 — Interface bois, parchemin et or (A4)
- **Habillage seulement**, même disposition que v16/v17 :
  - cadres en bois sculpté avec rivets ;
  - fonds parchemin ;
  - titre de fenêtre sur un ruban ;
  - onglets en signets de cuir ;
  - gros boutons ronds en relief (en partie faits en v20) ;
  - barre de ressources sur une planche ;
  - icônes de ressources plus grosses et brillantes (SVG procédural) ;
  - jauges de stockage intégrées.
- Tout est en CSS (dégradés, `box-shadow`, `border-image` en SVG en ligne) et en SVG procédural.
- **Risque principal : le contraste.** Un texte sombre sur le parchemin clair est un nouveau couple : les jetons sont choisis pour passer l'outil de contraste avant d'être appliqués, dans les 5 modes.
- Fichiers : `css/theme.css`, `src/ui/icons.js`, `src/ui/hudFixed.js` (balisage minimal), `src/ui/app.js` (ruban de fenêtre).

### Lot 6 — Carte du monde (A5)
- Châteaux et camps en miniatures isométriques selon le niveau et la faction : les mêmes primitives `isoArt`, rendues une fois dans des canvas hors écran (le monde est déjà un canvas).
- Armées en marche avec bannière et trace en pointillés ; compte à rebours au-dessus.
- Règles de calme v17 : détails selon le zoom, pas de chevauchement (l'outil de chevauchement mesure le monde).
- Fichiers : `src/ui/worldArt.js`, `src/ui/views/world.js`.

### Lot 7 — Mécaniques (partie B), une par une, chacune avec ses tests et sa simulation

**B1. Infirmerie et blessés**
- **Lien** : nouveau bâtiment « Hospice » (dans les murs, famille Lieux) ; chaîne herbes → potion de soin (consommable existant) ; pertes de `siegeBattle`, `simulateBattle` et des marches.
- **Règle** :
  - une part des pertes devient des blessés : 30 % en défense, 20 % en attaque, plafonnée par la capacité de l'hospice ;
  - les blessés se soignent en 12 h, au prix d'une potion pour 10 blessés ;
  - sans soin à temps, ils rentrent au village.
- **Subtilités** :
  - un blessé soigné dans les 6 premières heures a une chance de revenir **vétéran** : +5 % d'attaque pour ce type d'unité, plafonné à 10 % de l'effectif ;
  - les blessés abandonnés font baisser la faveur de l'Assemblée des villages au conseil.
- **Contre-choix** : garder les herbes pour les buffs de production ou de marche, ou pour les soins.
- **Simulation** : `siegeSim`, `profileSim`. Le gain de survie doit rester sous +10 % de l'armée finale du profil « Armée ».

**B2. Reliques de bâtiment**
- **Lien** : sources existantes (fouilles, butin de la Brèche, expéditions, fragments de relique). Elles ne remplacent pas les artefacts globaux de la Salle du trésor.
- **Règle** :
  - emplacements par niveau du bâtiment : 1 au niveau 5, 2 au niveau 15, 3 au niveau 25 ;
  - chaque relique a un effet borné sur son bâtiment, par exemple +6 % de production ou −8 % de temps de formation.
- **Subtilités** :
  - certaines reliques **rayonnent** sur les cases voisines, par le même calcul que l'adjacence, et apparaissent dans le calque « Placement » ;
  - déplacer une relique prend 6 h de transport, sans aucun coût en gemmes.
- **Contre-choix** : regrouper les bâtiments autour d'une relique qui rayonne, ou suivre le placement idéal des chaînes.

**B3. Châtelain**
- **Lien** : troisième affectation de héros (`castellan`) ; `defendCastle` ; postes muraille (flancs), porte (front) ou douves (contre les fascines et les tours).
- **Règle** : un seul châtelain ; un bonus de défense selon sa classe et son poste, avec des traits par flanc. Il ne marche pas et ne gouverne pas en même temps.
- **Subtilité** : `remember()` retient aussi le poste et la classe du châtelain. Un seigneur qui l'a vu deux fois de suite au même poste attaque ailleurs et apporte le contre-engin. Le rapport le dit, et changer de poste devient un vrai choix.
- **Contre-choix** : héros intendant, commandant ou châtelain, qui sont exclusifs.

**B4. Camps de brigands à niveaux et ligue des brigands**
- **Lien** : camps de bandits existants (`banditCamp`), raids en série, `segmentDanger` de la logistique, raids des rivaux contre le château. **Pas de nouveau type de forteresse**, pour ne pas doubler la Brèche.
- **Règle** : les camps gagnent un niveau de 1 à 10, dessiné en miniature de bastion (A5). Il monte quand le camp n'est pas nettoyé et il fixe les ennemis et le butin.
- **Subtilités** :
  - **Ligue des brigands** : farmer toujours les mêmes camps fait monter une jauge de colère. Au-delà d'un seuil, plusieurs camps ripostent ensemble par un raid unique, annoncé par un présage, et le trophée « Ligue brisée » récompense la victoire.
  - À l'inverse, laisser les camps tranquilles fait monter l'insécurité des routes : `segmentDanger` augmente, et donc les pertes des caravanes et de la logistique.
- **Contre-choix** : farmer large ou ciblé ; tolérer une insécurité contre la paix.

**B5. Renforts alliés**
- **Lien** : alliances et traités (`factions.js`), cités libres (`reputation.js`), annonce de raid (`raidIntel`).
- **Règle** : quand un raid est annoncé et que la relation est assez haute, un allié propose une garnison (décision en attente, refusable). La garnison se joint à la défense, sur un flanc.
- **Subtilités** :
  - les renforts ont leurs exigences : rations par heure (pain) et « ne pas sortir », c'est-à-dire pas d'attaque lancée depuis le château tant qu'ils sont là ;
  - les décevoir coûte de la relation, et les nourrir bien en rapporte.
- **Contre-choix** : accepter, c'est être plus fort mais lié ; refuser, c'est rester libre.

**B6. Décorations : auras et usure**
- **Lien** : `decoEffects`, ordre public v20, saisons (`seasonInfo`).
- **Règle** : chaque décoration reçoit une aura de placement. Par exemple, une fontaine près des maisons donne +ordre et du moral aux ouvriers, une statue près de la caserne +3 % de vitesse de formation, un jardin près de la taverne du moral. L'aura est bornée et visible dans le calque « Placement ».
- **Subtilité** : une usure saisonnière légère : −25 % d'effet après une saison sans entretien. L'entretien est un petit coût en pierre ou en bois, faisable par la corvée « Ménage ». Les trophées ne s'usent pas.
- **Contre-choix** : placer près de quoi, et entretenir ou pas.

**Mécanique proposée en plus, si vous le souhaitez, à la place de B6** : les **« équipements de garnison » saisonniers**, des bonus de défense à usage limité. Je **ne la recommande pas** : elle recoupe les engins de la v19. Je garde donc B6, qui donne enfin un rôle de placement aux décorations.

### Lot 8 — Subtilités transversales (C)
- « Pourquoi ? » sur chaque nouvel élément : blessés, reliques et rayonnement, châtelain, ligue, insécurité, renforts, auras, vie du château.
- Présages : « afflux de blessés » (une saison de raids) et « la ligue s'agite ».
- Trophées : soigneur (blessés soignés), ligue brisée, frères d'armes (renforts honorés), reliquaire (reliques posées).
- Mode photo et film : la couche de vie est dessinée dans l'image et le film, avec sa graine, donc reproductible.

### Lot 9 — Validation, migration, documentation
- **Migration** : champs nouveaux par défaut (aucun blessé, aucune relique, pas de châtelain, ligue à 0, camps au niveau dérivé de leur danger). Test sur `save-v20` et sur les anciennes fixtures.
- **Tests** : `tests/v21.test.js` (mécaniques, plafonds, migration, fonction de densité de vie).
- **Contrôles** : `npm run simulate` et `siegeSim`, captures et mesures « après », puis `docs/AUDIT_V21.md`, `docs/V21.md` et le README.

## 4. Risques et parades

| Risque | Parade |
|---|---|
| Performance déjà au-delà de 100 ms sans carte graphique | Vie et figurants sur **un seul canvas** borné à 30 images par seconde et arrêté hors écran. Aucun nœud ajouté par bâtiment (palier dans la clé du `<symbol>`). Mesure à chaque lot, et retour arrière si une mesure se dégrade au-delà du bruit. |
| Consolidation CSS qui change l'apparence | Concaténation dans l'ordre (cascade identique), puis retraits vérifiés au pixel avec `v21diff`. |
| Contraste du parchemin et du bois | Jetons validés par l'outil de contraste dans les 5 modes avant usage ; texte sombre sur clair. |
| Information portée par la seule couleur (toits par famille, auras) | Chaque information colorée a aussi une icône ou un texte. |
| Figurants qui gênent la lecture | Ils passent sous les signaux et les noms. Densité basse par défaut en qualité moyenne. Aucun figurant dans les zones de l'affichage fixe. |
| Équilibre (blessés, reliques, renforts) | Bornes dans `src/data`, simulations avant et après, contre-choix documentés. |
| Taille de la sauvegarde | Blessés comptés par type d'unité ; reliques par identifiant ; mémoire bornée (déjà le cas en v19). |
| Volume de travail | Livraison par lots, chaque lot vert et commité. Si un lot dérape en performance, il passe en « partiel » et le reste continue. |

## 5. Ce que j'attends de vous

Votre feu vert sur ce plan, ou vos changements :
- l'ordre des lots ;
- B6 ou la mécanique alternative ;
- les noms proposés (« Hospice », « Ligue des brigands », « châtelain ») ;
- les bornes chiffrées de B1 à B6.
