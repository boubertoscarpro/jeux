# Audit v20 — « Ma forteresse »

**Point de départ** : la v19 « L'Art du siège ».

La vue du royaume (`src/ui/views/city.js`) est une grille orthogonale vue du dessus :
- **la grille** : un bouton DOM par case, soit 960 boutons au domaine maximal (40 × 24) ;
- **le sol** : un canvas peint une fois et mis en cache (`src/ui/atlas.js`), arbres et rochers vus du dessus compris ;
- **la muraille** : un SVG en deux couches (`src/ui/castleArt.js`).

Les règles de zones de la v16 (`src/data/castle.js`) cantonnent dans la cour 6 types de bâtiments seulement. Les autres vont partout, si bien que presque toute la ville est dehors.

**Référence** : une capture de Goodgame Empire (vue isométrique, forteresse dense, muraille à tours et douves, champs dehors, signaux « Zzz » et « ! », bulle de bonus, affichage à cinq zones). On s'inspire de l'esprit sans copier les dessins, les noms ni les mécaniques payantes.

**Captures « avant »** : `docs/v20/avant/`, prises avec `tools/v20shots.cjs --before` sur la version v19 compilée et figée, en 3 tailles (1400 × 900, 1024 × 640, 390 × 844) :
- `01` début de partie ;
- `02` milieu de partie ;
- `03` fin de partie ;
- `04` carte du monde ;
- `05` défense.

Les mesures sont dans `docs/v20/avant/mesures.json`.

## 1. Constats vérifiés

| # | Constat | Vérification |
|---|---|---|
| 1 | **La forteresse est vide, la ville est dehors.** Fin de partie : 99 bâtiments, dont **3** dans la cour de 5 × 5 (hôtel de ville, une maison, un entrepôt) et **96 dehors**. Parmi eux, **51 bâtiments de ville** (forge, bibliothèque, caserne, marché, lieux…) s'alignent dans l'herbe. | Comptage sur `save-fin` et `save-milieu` (milieu : 3 dedans, 57 dehors) |
| 2 | **Occupation de la cour** : 3 cases sur 25, soit **12 %**. | idem |
| 3 | **Part de l'écran occupée par la forteresse** au cadrage par défaut : **13,7 %** (1400 × 900), 26,4 % (1024 × 640), 33,6 % (390 × 844). | `tools/v20shots.cjs`, union des cases intra-muros dans la vue |
| 4 | **Vue plate et lointaine.** Cases de 83 px. Les arbres et les rochers sont vus du dessus et les bâtiments de face. La muraille est un trait vu d'en haut, avec des tours dessinées à plat. | Captures 01 à 03 |
| 5 | **Bruit visuel.** Une pastille de niveau (« ●●● » ou « ••••• ») sur chaque bâtiment, en plus du signal du bâtiment. | Capture 03 |
| 6 | **Pas d'état « à l'arrêt » distinct.** La pause, le manque de matière et l'entrepôt plein sont des « problèmes » parmi d'autres. L'entrepôt plein n'est signalé qu'une fois, sur un entrepôt, et rien n'apparaît sur la scierie qui ne produit plus. | `src/systems/mapSignals.js`, `economy.js` (`capped`, `starved`) |
| 7 | **Réactivité.** Un rendu complet du royaume prend **49 ms** (960 boutons recréés). Le délai perçu entre le clic et l'image suivante va de **86 à 223 ms** selon l'action et la taille d'écran (sélectionner un bâtiment : 189 ms en 1400 × 900). | `mesures.json` |
| 8 | **Images par seconde** (Chromium sans carte graphique, composition logicielle) : 17 au repos et 13 pendant un glisser en 1400 × 900 ; 59 sur téléphone. Les animations CSS (météo, gardes, drapeaux) se repeignent sur 960 éléments. | `mesures.json` (valeurs propres à cette machine, à comparer entre elles) |
| 9 | **Pas de titre de noblesse ni d'ordre public.** La stabilité ne concerne que les provinces (avant-postes). Les décorations n'agissent que sur le moral. | `src/systems/stability.js`, `castle.js` (`decoEffects`) |
| 10 | **Corvée.** Les raids en série existent (v13), mais il faut les relancer à la main à chaque fois. Le ravitaillement des avant-postes se fait province par province, et la défense conseillée n'est automatique qu'en mode simplifié (v19). Rien ne fait le ménage des rapports. | `raidOrders.js`, `logistics.js`, `siege.js`, `notices.js` |

## 2. Comparaison point par point avec la référence

| Point | Goodgame Empire (référence) | Cendrelande v19 | Cible v20 |
|---|---|---|---|
| Vue | Isométrique, caméra proche : le château remplit l'écran | Vue du dessus, lointaine : 14 % de l'écran | Isométrique (losange 2:1), cadrage sur la forteresse : plus de 45 % de l'écran |
| Densité | Aucune case vide dans les murs | 12 % de la cour occupée ; 51 bâtiments de ville dehors | Plus de 80 % de la cour occupée en fin de partie ; aucun bâtiment de ville dehors |
| Muraille | Créneaux continus, tours régulières, bannières, porte, douves | Trait vu du dessus, tours aux coins, porte | Muraille en volume (créneaux, tours tous les 3 segments, bannières aux armoiries, porte et pont-levis), engins de la v19 posés sur leur flanc, dégâts visibles |
| Campagne | Champs en bandes, scieries, carrières en bordure de forêt | Tout est mêlé | Seuls les bâtiments productifs restent dehors, placés selon le terrain |
| Signaux | « Zzz », « ! », bulle « Prêt à être collecté » | Un signal par bâtiment (v17), plus la pastille de niveau | « Zzz » avec la cause au survol, « ! » pour une action, bulles de bonus, plus de pastille de niveau |
| Affichage | Portrait, niveau, titre, barre ; ressources et jauges ; panneau droit repliable ; gros boutons ronds ; sélecteur de royaume ; conseiller illustré | Coins de la v16, globe, fenêtres | Mêmes coins, plus de caractère : titre de noblesse et sa barre, jauges, panneau d'activités repliable à flèches, boutons plus grands, sélecteur de domaine près du globe, conseiller illustré |
| Réactivité | Lente (reproche fréquent des joueurs) | 86 à 223 ms | Moins de 100 ms pour chaque action courante |

## 3. La nouvelle vue

Maquettes : `docs/v20/maquettes/vue-ordinateur.svg` et `docs/v20/maquettes/vue-telephone.svg`.

### 3.1 Projection

- Losange de **128 × 64 px** au zoom 1.
- Projection : `sx = (x − y) · 64 + ox`, `sy = (x + y) · 32 + oy`.
- Projection inverse : `x = (u + v) / 2`, `y = (v − u) / 2`, avec `u = (sx − ox) / 64` et `v = (sy − oy) / 32`.
- La logique reste sur la grille (x, y). Seul l'affichage change (`src/systems/iso.js`, module pur et testé).

### 3.2 Rendu

- **Sol plat** : le canvas orthogonal en cache est projeté par une seule matrice CSS (`matrix(1, 0.5, −1, 0.5, ox, oy)` à l'échelle de la case). Le sol, les douves, la cour pavée et les allées sont peints une fois.
- **Volumes** : bâtiments, arbres, rochers et morceaux de muraille sont des dessins SVG debout (symboles réutilisés par `<use>`). Ils sont placés à la projection de leur case, avec un z-index de profondeur `10 · (x + y)` plus un décalage par couche.
- **Clics** : seuls les bâtiments sont des boutons. Une case vide se retrouve par la projection inverse, au clic, au survol et en mode construction. On passe ainsi de 960 boutons à environ 150.
- **Clavier** : un curseur de case focalisable. Les flèches suivent l'écran (haut = nord-ouest, droite = nord-est…) et vont de bâtiment en bâtiment ; Maj + flèches avancent case par case ; Entrée choisit.
- **Cache** : le sol ne se repeint que si le terrain, la saison ou l'enceinte changent, et le décor (arbres, rochers, muraille) se reconstruit sur la même clé. Les animations s'arrêtent pendant un glisser ou un zoom, et en mode économie d'énergie.

### 3.3 Tout à l'intérieur des murs

| Règle | Bâtiments |
|---|---|
| **Ville, intra-muros seulement** | hôtel de ville, château, entrepôt, maison, marché, taverne, bibliothèque, guilde, laboratoire, boulangerie, fonderie, tisserand, charpentier, armurerie, intendance, forge, caserne, écurie, atelier de siège, lieux (ambassade, cartographe, héraut, lices, scriptorium), sanctuaire, observatoire, monument |
| **Campagne, hors les murs** | ferme, pâturage, verger, scierie, carrière, mine, chasseur, herboriste, charbonnière, pêcherie, port |
| **Partout** | moulin (au bord de l'eau ou dans la cour), tannerie, tour de guet (au-delà des murs, elle voit plus loin), routes, décorations, trophées |

Les malus de zone des maisons, du marché, de la taverne et de la guilde dans la cour (−10 %) disparaissent : la cour est désormais la ville. Le bonus de l'entrepôt à l'abri des murs reste.

### 3.4 Enceinte et agrandissements

L'enceinte reste un carré centré sur l'hôtel de ville. Elle grandit par **agrandissements successifs**, un par palier de l'hôtel de ville. Chaque palier contient au moins le nombre maximal de bâtiments de ville permis au niveau de l'hôtel de ville où il s'ouvre :

| Palier | Taille | Cases | Hôtel de ville | Bâtiments de ville max. à ce niveau |
|---|---|---|---|---|
| 0 | 6 × 6 | 36 | 1 | 21 (HdV 3) |
| 1 | 7 × 7 | 49 | 4 | 40 (HdV 7) |
| 2 | 8 × 8 | 64 | 8 | 49 (HdV 11) |
| 3 | 9 × 9 | 81 | 12 | 63 (HdV 17) |
| 4 | 10 × 10 | 100 | 18 | 74 (HdV 23) |
| 5 | 11 × 11 | 121 | 24 | 96 (HdV 30) |

- **Lien avec le domaine** : agrandir le domaine (v13) offre l'agrandissement d'enceinte suivant s'il est déjà ouvert, sans coût. Je n'ai pas rendu le domaine obligatoire, car un joueur bloqué par le coût du domaine ne pourrait plus bâtir sa ville.
- **Terrain** : les cases de forêt, de montagne et de décombres prises dans l'enceinte sont aplanies par le chantier, car la cour est pavée.
- **Mise en scène** : la muraille se redessine, avec une animation courte (sauf « réduire les animations ») et un message.

### 3.5 Réorganisation et migration d'une sauvegarde v19

- **Taille** : l'enceinte prend le plus petit palier qui contient les bâtiments de ville existants, avec une marge de 10 %, dans la limite du palier permis par l'hôtel de ville. Elle est recentrée sur l'hôtel de ville et gardée dans le domaine.
- **Placement** : les bâtiments de ville entrent dans la cour, par quartiers : militaire vers la porte, économie à l'est, savoir au nord, lieux et vitrine autour de la place. Les bâtiments de campagne pris dans les murs ressortent vers la case libre la plus proche.
- **Rien n'est détruit** : niveaux, files, recettes et gouverneurs suivent leur bâtiment.
- **Aperçu et annulation** : l'ancien emplacement de chaque bâtiment, l'ancienne enceinte et le terrain sont gardés, et un bandeau propose « Voir l'aperçu » et « Annuler ». Le déménagement est gratuit pendant 7 jours.
- **Plans de ville (v17)** : les positions enregistrées sont converties par la même règle.

## 4. Signaux et vitrine

- **« Zzz »** (à l'arrêt) sur tout bâtiment de production bloqué, avec la cause au survol : en pause, manque de matière, ou entrepôt plein, pour une chaîne comme pour une scierie dont la ressource est au plafond.
- **« ! »** pour ce qui demande une action.
- **Plus de pastille de niveau** : le niveau se lit sur la taille du dessin et dans l'écusson de l'infobulle.
- **Vitrine** : les trophées gagnés deviennent des statues, monuments et bannières à placer dans la cour. On les gagne en repoussant des raids, en vainquant une Némésis, avec des accomplissements, des sagas terminées ou des sièges remportés. Rien n'est achetable.

## 5. Règles chiffrées des innovations

### 5.1 Ordre public (château principal)

**Points** :

| Source | Points |
|---|---|
| Base | +20 |
| Hôtel de ville | +3 par niveau |
| Muraille | +1 par niveau |
| Décoration intra-muros | +12 chacune |
| Trophée posé | +15 chacun |
| Lieu, sanctuaire, observatoire | +8 chacun |
| Monument | +4 par étape |
| Maison | −(2 + niveau / 4) chacune |

**Effet** sur la production et la vitesse de formation :
- au-dessus de 0 : `+12 % × (1 − e^(−OP / 150))`, un rendement décroissant ;
- en dessous de 0 : `−20 % × (1 − e^(OP / 80))`.

Tout est détaillé dans « Pourquoi ? ».

### 5.2 Titres de noblesse

**Honneur** : une somme, pas une monnaie, calculée d'après les statistiques existantes.

| Source | Honneur |
|---|---|
| Victoire | 2 |
| Raid repoussé | 10 |
| Siège gagné (royaume, forteresse de la Brèche) | 20 |
| Site difficile nettoyé | 5 |
| Campagne gagnée | 40 |
| Grand projet achevé | 50 |

**Titres** :

| Titre | Honneur requis |
|---|---|
| Écuyer | 0 |
| Chevalier | 100 |
| Baronnet | 300 |
| Baron | 700 |
| Vicomte | 1 400 |
| Comte | 2 500 |
| Marquis | 4 000 |
| Duc | 6 000 |

**Avantages** : chaque titre ajoute +1 % de production et +2 de moral au combat, soit au plus +7 % et +14 au rang de Duc. Chaque titre change aussi l'apparence du château : bannières, nombre de tours, toits dorés.

### 5.3 Terres lointaines

| Terre | Hôtel de ville | Ressource |
|---|---|---|
| Glacier | 15 | cristaux |
| Désert | 20 | gemmes |
| Volcan | 25 | minerai rare |

- Ce sont des ressources rares qui existent déjà : il n'y a ni monnaie nouvelle ni production de masse.
- Chaque terre est un avant-poste (v13), avec sa petite ville fortifiée (v16b), plus de menaces et une production modeste de sa ressource.

### 5.4 Fin de la corvée

Quatre corvées sont réglées une fois. Elles sont branchées sur les ordres automatiques, hors quota comme les règles de tri de la v18 :
- **raids en série relancés** sur le meilleur camp, avec une composition enregistrée ;
- **ravitaillement** des provinces, sans jamais descendre sous une réserve de nourriture ;
- **défense conseillée** appliquée dès qu'un raid est repéré ;
- **ménage** des rapports d'information lus.

Chaque passage est consigné dans le journal des ordres et sur l'écran « Corvées ».

### 5.5 Récoltes de bonus

- **Combien** : toutes les 4 heures de production, un bâtiment de production met de côté 5 % de ce qu'il a produit.
- **Comment** : on récolte d'un clic, par bâtiment ou tout d'un coup avec la bulle « Prêt à être collecté ».
- **Sans pression** : le bonus s'accumule sans jamais expirer.

## 6. Choix des innovations et raisons

| Innovation | Retenue | Raison |
|---|---|---|
| Ordre public | Oui | Donne enfin un rôle aux décorations et aux trophées dans la cour, et un vrai choix aux maisons (or contre ordre). Il s'appuie sur la stabilité et les décorations existantes. |
| Titres de noblesse | Oui | Une vitrine de progression qui manque. Elle s'appuie sur les statistiques existantes, sans nouvelle monnaie. |
| Terres lointaines | Oui | Un objectif de fin de partie qui s'appuie sur les avant-postes, sans ressource nouvelle. |
| Fin de la corvée | Oui | C'est ce que les joueurs de GGE confient à des outils tiers. Un jeu solo peut l'offrir proprement. |
| Récoltes de bonus | Oui, sans expiration | C'est le plaisir du clic, sans la peur de rater. |
| Mode architecte | Oui | Les plans de ville de la v17 ne déplaçaient que des bâtiments existants. On peut maintenant planifier ceux à bâtir et voir les agrandissements futurs. |
| Film du château | Oui | Les identifiants des bâtiments portent leur date de création : la croissance se rejoue sans rien enregistrer de plus. |
| Mode photo | Oui | Toute la vue est en SVG et en canvas : l'image se compose dans le navigateur, sans rien d'externe. |
| Transparence (« Pourquoi ? ») | Oui | Elle est étendue à l'ordre public, aux titres et aux bonus. |
