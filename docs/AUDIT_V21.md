# Audit v21 — « Couleurs du Royaume »

**Point de départ** : la v20 « Ma forteresse », avec ses corrections (menu des domaines, barre du titre).

**Référence** : l'allure d'un grand jeu de château du genre : chaud, coloré, vivant, avec une interface de bois, de parchemin et d'or. On s'inspire de l'esprit sans copier les dessins, les noms ni les mécaniques payantes.

Captures et mesures :
- **avant** : `docs/v21/avant` ;
- **planche de style** : `docs/v21/planche` ;
- **après** : `docs/v21/apres`.

## 1. Constats « avant » vérifiés

| # | Constat | Vérification |
|---|---|---|
| 1 | Les bâtiments sont des aplats SVG simples (deux faces, un toit) : peu de matière, pas d'ombre portée, et une croissance par palier peu lisible. | Captures `avant/01` à `03` |
| 2 | La scène est lourde en DOM : 4 810 nœuds en fin de partie, dont 2 007 dans la vue, 200 dessins de décor et 43 morceaux de muraille, et 15 éléments animés en CSS. | `avant/noeuds.txt` |
| 3 | La fluidité est faible en grand écran sans carte graphique : 16 images/s au repos, 13 pendant un glisser (1400 × 900), avec un rendu complet de 52 ms. | `avant/mesures.json` |
| 4 | La vie de la carte se limite à quelques animations CSS (moulins, fumée, foule du marché), sans lien avec la population, l'ordre ou un raid. | Code v20 (`city.js`, `v20.css`) |
| 5 | L'interface est sombre et plate : panneaux brun-noir à liseré, boutons plats, icônes de ressources simples. | Captures |
| 6 | La carte du monde est faite de médaillons ronds. Les armées sont des pions ronds avec un émoji. | `avant/04` |
| 7 | Les contrastes sont bons (295 couleurs, 0 sous AA, minimum 4,61:1), comme la mise en page (360 vérifications) et les chevauchements (0). | `avant/*.txt`, `*.json` |

## 2. Ce qui a changé (résumé ; le détail est dans `docs/V21.md`)

- **Rendu** :
  - peinture procédurale cuite en Canvas 2D, un cache de dessins, un sol peint, une scène triée par profondeur ;
  - boutons invisibles gardés pour l'accessibilité ;
  - miniatures peintes dans la fiche et le panneau Construire ;
  - photo composée depuis les canvas.
- **Vie** : passants, gardes, charrettes, oiseaux, nuages, fumées et reflets, liés à l'état (`systems/life.js`). Image fixe en mouvement réduit, en mode économie et en qualité basse.
- **Retours** : fin de chantier (poussière, rebond, étincelles), gains qui volent vers la jauge, boutons qui s'enfoncent.
- **Interface** : bois à rivets d'or, ruban, signets de cuir, parchemin, planche des ressources, icônes en relief. Le contraste élevé reste noir et or.
- **Monde** : lieux peints (capitale par palier, royaumes à bannière, cités, camps à niveaux, ruines, mines, avant-postes) et colonnes en marche.
- **Mécaniques** : hospice et blessés, reliques de bâtiment, châtelain, camps à niveaux et ligue, garnison alliée, auras et usure des décorations.
- **« Pourquoi ? »** : sur chaque élément nouveau.
- **Nouveaux trophées et présage** : quatre sortes de trophées et le présage « la ligue s'agite ».
- **Qualité graphique** : haute par défaut, avec les modes moyen et bas.

## 3. Mesures « après »

| Mesure (1400 × 900 sauf mention) | Avant | Après |
|---|---|---|
| Images/s au repos / glisser | 16 / 13 | 36 / 35 |
| Rendu complet | 52,5 ms | 40,5 ms |
| Délais des actions courantes | 87 à 349 ms | 95 à 271 ms |
| Nœuds du DOM (total / vue) | 4 810 / 2 007 | ≈ 2 000 / ≈ 550 |
| Contrastes (5 modes) | 0 sous AA | 0 sous AA (302 couleurs) |
| Mise en page, chevauchements | 360 vérifications sans problème, 0 | 360 vérifications sans problème, 0 |

Toutes les mesures sont prises sans carte graphique (navigateur sans affichage). Sur un portable avec carte graphique, la fluidité est au moins celle-ci.

## 4. Liste honnête : ce qui n'est pas fait, ou fait autrement que prévu

**Rendu et vie** :
- **Ailes de moulin, roue à aubes et drapeaux de la ville** : ils sont peints, mais immobiles. Seules la fumée, les personnages, les charrettes, les oiseaux, les nuages et les reflets bougent. Les étendards des colonnes du monde, eux, ondulent.
- **Occlusion des passants** : elle reste simple. Ils ne marchent jamais juste derrière un bâtiment, mais un bâtiment très haut placé deux cases devant peut encore être recouvert par un personnage.
- **Hiver** : la neige est au sol, pas sur les toits.
- **Vue des avant-postes** : elle garde ses dessins v16b. Seuls le royaume et la carte du monde sont repeints.
- **Ancien SVG** : `isoArt.js` et `isoView.js` sont gardés pour la colonne de raid, les icônes de la vitrine et les anciens outils. Les icônes de la vitrine montrent une statue pour les nouvelles formes de trophées ; la cour, elle, les peint bien.
- **Première cuisson** : sur une grande ville, elle prend environ une seconde sans carte graphique, avant que le cache ne serve.

**Mécaniques** :
- **Présage « afflux de blessés »** : il n'est pas fait. Seul « la ligue s'agite » existe, et c'est un bandeau et une ligne du journal, pas une entrée du système de présages v14.
- **Garnisons alliées** : elles viennent des factions seulement. Les cités libres n'en proposent pas.
- **Calque « Placement »** : il ne montre pas le rayonnement des reliques. Le rayonnement est expliqué dans la fiche et le « Pourquoi ? ».
- **Entretien des décorations** : il passe par un bouton dans la fiche, pas par la corvée « Ménage ».
- **Mémoire du châtelain** : elle retient sa classe, mais l'adaptation ne dépend que du poste.
- **Usure des décorations** : 48 h au lieu d'« une saison », car une saison du calendrier ne dure que 3 h.

**Équilibre** :
- **Sources** : les bots ne fabriquent pas de potions. Le gain de l'hospice est donc mesuré en borne haute (soins parfaits), voir `docs/V21.md` § 9.
- **Simulations par profil** : elles restent très bruitées d'un lancer à l'autre, comme en v20.

## 5. Règles respectées

- **Rien de copié** : dessins procéduraux originaux, noms propres à Cendrelande.
- **Aucune monnaie nouvelle, aucun avantage payant** : les coûts sont en ressources du jeu (test).
- **Accessibilité** : les boutons de la carte sont conservés ; le focus reste visible (hachures) ; les contrastes passent dans les 5 modes ; le mouvement est réduit (image fixe, fondu sans déplacement) ; le texte reste en DOM.
- **Migration** : une vraie sauvegarde v20 se charge (`tests/fixtures/save-v20.json.gz`, test).
- **Tests et contrôles** : tests, smoke, mise en page, chevauchements, simulation et compilation sont verts.
