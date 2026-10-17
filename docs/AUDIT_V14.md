# Audit v14 — orienté innovation

Audit réalisé sur la v13.3 fusionnée (282 tests verts).

**Méthode**
- **Lecture du code** : `src/core`, `src/systems` (83 modules, 14 300 lignes), `src/data`, les 40 vues, les tests.
- **Lecture des documents** : `README`, `DESIGN`, `AUDIT_V10`, `V13`, `V13_3`, `BALANCE`, `ECONOMY`.
- **Simulation de référence** : `node tools/profileSim.js 7 2` lancée sur une copie figée du commit v13.3 (résultats au § 1 et dans `docs/V14.md`).

**Le constat de départ est confirmé.** Le jeu ne manque pas de contenu. Il manque de **liens de cause à effet** entre ses systèmes, et de **moments où le joueur sent venir quelque chose**.

## 1. Les boucles qui portent l'expérience, et les satellites

### Boucles porteuses

Elles sont exercées par tous les profils simulés et par la quasi-totalité des tests.

| # | Boucle | Systèmes | Preuve |
|---|---|---|---|
| B1 | **Bâtir et produire** : grille, adjacences, chaînes, plafond d'entrepôt | `city`, `construction`, `economy`, `workforce` | Cœur de la progression HdV et des niveaux de bâtiments, dans tous les profils. Les heures au plafond (45 à 99 h sur 168) en sont le principal défaut. |
| B2 | **Armée → marches → butin** contre les PNJ | `army`, `marches`, `combat`, `autofill`, `raidOrders` | De 1 à 180 victoires sur 7 jours selon le profil. C'est le principal puits de nourriture et de troupes. |
| B3 | **Rythme de progression** : parcours guidé, recherche, HdV | `campaign`, `research`, `quests` | Les chapitres finis séparent nettement l'occasionnel (2) des autres (7). |
| B4 | **Menace extérieure** : raids, factions, campagnes | `rivals`, `factions`, `reactions`, `warcampaign` | 5 à 9 raids subis sur 7 jours. C'est la seule source de tension récurrente. |
| B5 | **Événements en rotation** | `liveEvents` (1 393 lignes, le plus gros module) | Rendez-vous de rétention. Peu de liens avec le royaume, en dehors des conséquences ajoutées en v13. |

### Satellites

Ce sont des systèmes complets mais périphériques. Ils sont soit absents du joueur simulé, soit utilisés quelques fois par semaine, soit sans effet sur les boucles principales.

- **Peu ou pas exercés :**
  - sagas (`sagas.js`, en double avec les quêtes du royaume) ;
  - guilde (simulée) ;
  - roue et éclats (testés à part par `economySim`) ;
  - boutique quotidienne ;
  - recettes ;
  - codex ;
  - personnages de la carte ;
  - missions cartographiques ;
  - stats, trésor et accomplissements (affichage seulement).
- **Exercés, mais sans retour sur le cœur du jeu :**
  - fouilles et mystères ;
  - expéditions légendaires ;
  - défis de maîtrise ;
  - monument ;
  - commandes d'artisans.

  Ils donnent surtout des titres, des insignes ou des bonus plafonnés. **C'est voulu** (aucune inflation de puissance), mais ils ne créent pas de tension.

## 2. Recoupements et contradictions

| Domaine | Couches | Problème |
|---|---|---|
| **Objectifs et récits** | 10 couches : parcours guidé (chapitres + missions royales du jour), jalons, missions dynamiques, quêtes du royaume, sagas et chroniques du monde, défis de maîtrise, objectifs, missions du jour d'événement, défis d'événement, défis dynastiques | Trois listes « du jour » coexistent : missions royales, missions du jour d'événement et missions dynamiques. Sagas et quêtes du royaume sont deux moteurs de chaînes à étapes, non fusionnés (signalé en v13 § 11). |
| **Conseil** | 6 couches : conseiller (`advisor`), conseiller du tableau de bord (`guide`), tableau de bord, bilan (`ecoAdvice`), excédents (`surplus`), objectifs (`goals`) | Plusieurs conseils disent la même chose (« entrepôt plein », « réparer »). Aucune contradiction trouvée : le tableau de bord déduplique déjà. |
| **Monnaies** | Or, gemmes, éclats (et tickets), trois sortes de fragments, une monnaie par événement, insignes, points de saison, passe-temps | Chacune a une justification documentée (`ECONOMY.md`). **Aucune nouvelle monnaie en v14.** |
| **Boutiques** | Marché, boutique quotidienne, boutique d'événement, marchand mystère, colporteur (PNJ), dépenses d'éclats | Fonctions distinctes, mais lieux dispersés dans 4 onglets. |
| **Crises** | Catastrophes (`living`), pénuries aléatoires (`scarcity`), rumeurs (`rumor`), dilemmes (`decisions`), motions du conseil (`council`) | **Contradiction de fond.** Une motion « Distribuer le grain » parle d'une mauvaise récolte qui n'existe pas dans le jeu. À l'inverse, une vraie sécheresse ne fait monter ni le prix du pain ni la colère des villages. |

## 3. Des systèmes qui devraient se répondre et ne le font pas

Vérifié dans le code :

- **Saisons et météo → carte du royaume : aucun effet spatial.**
  - L'inondation abîme 40 % au hasard des bâtiments au bord de la rivière (`living.js`, `startCatastrophe`), sans parade possible.
  - L'incendie frappe **un bâtiment au hasard** (`cityFire`). Le placement, pourtant central dans le jeu (adjacences), n'y joue aucun rôle.
- **Catastrophes → marché, conseil, provinces : aucun lien.**
  - La sécheresse baisse la nourriture de 30 %, mais `livingMarket` ignore la catastrophe.
  - `councilPressures` connaît la famine mais pas la sécheresse, le blizzard ni l'inondation.
  - `stabilityFactors` ignore les catastrophes.
- **Rumeurs : toujours vraies.** `rumorTick` les confirme systématiquement. Il n'y a ni incertitude ni recoupement, et seulement 5 textes sur le marché. Les catastrophes, elles, arrivent sans prévenir.
- **Pénuries de marché : tirées au hasard** (`scarcity`, 6 % par heure), sans cause dans le monde.
- **Factions ↔ provinces.** Le territoire des factions (`f.territory`) sert à dessiner les frontières et à l'option « céder un avant-poste ». Une province collée à une faction hostile n'en subit **aucun effet**.
- **Logistique, conseil, marché.** Ils se répondent déjà en partie (approvisionnement → stabilité ; famine → conseil). Il manque le chaînon « une crise passe d'un système à l'autre ».

## 4. Les moments sans émotion

1. **Les catastrophes sont un toast.** Elles arrivent sans prévenir, s'appliquent toutes seules et finissent seules. Il n'y a ni montée en tension, ni décision, ni récit.
2. **L'anticipation n'existe pas.** La rumeur annonce une certitude. On ne parie jamais sur l'avenir.
3. **Le grenier plein est un non-événement.** 45 à 99 h au plafond par semaine. L'excédent est écoulé à 15 % ou perdu. Il ne protège de rien.
4. **L'incendie est une loterie.** Aucun « j'aurais dû espacer mes bâtiments », aucun « on a sauvé le quartier ».
5. **Le joueur occasionnel découvre les dégâts après coup.** Rien ne lui permet de **préparer** son absence.

## 5. Les points partiels de V13 (§ 11)

| Point | État vérifié | Décision v14 |
|---|---|---|
| Fusion sagas / quêtes du royaume | Deux moteurs distincts (`sagas.js` et `questlines.js`), aucune donnée partagée | **Non traité en v14.** Fusionner deux moteurs avec des sauvegardes en cours est un coût L, sans lien avec le thème retenu. Reporté, avec la raison, dans V14.md. |
| Frontières contestées sans effet | Confirmé : seul le dessin des frontières existe | **Traité.** Effet réel sur la stabilité, cible des révoltes et des agitateurs (idée 5). |
| Greniers pleins chez l'occasionnel | 43,5 à 52,5 h au plafond en v13 ; 0 h de famine | **Traité.** Le surplus devient une réserve stratégique qui protège des crises (idée 3), sans ressource gratuite. |

## 6. Propositions

**Notation sur 5** :
- **Inno.** = originalité par rapport au genre ;
- **Impact** = effet ressenti par le joueur ;
- **Faisa.** = faisabilité dans l'architecture actuelle.

### Gameplay

**1. Répercussions : crises en cascade avec points d'intervention**
- **Principe.** Une catastrophe ouvre une **crise à étapes** qui traverse les systèmes. Par exemple :
  - sécheresse → récoltes compromises → le pain renchérit (marché) → grogne des villages (conseil) → révolte d'une province (stabilité).

  Chaque étape annonce la suivante et son échéance, avec 2 à 4 interventions chiffrées qui la désamorcent.
- **Originalité.** Frostpunk et Against the Storm font monter la pression sur une seule jauge. Ici, la crise **change de système** à chaque étape, et c'est le joueur qui choisit **à quel étage** il coupe la chaîne : tôt et cher, ou tard et risqué.
- **Systèmes reliés** : catastrophes, marché, conseil, stabilité, chronique.
- **Ce que l'idée remplace** :
  - les pénuries aléatoires sans cause (elles restent pour les seules ressources industrielles) ;
  - le texte contradictoire de la motion « grain ».
- **Décision créée.** Payer maintenant (cher, sûr), laisser monter (effets croissants), ou puiser dans les réserves.
- **Coût** : L.
- **Risques** :
  - spirale chez l'occasionnel ;
  - cumul avec la famine.

  Parades : une seule crise à la fois, des effets temporaires, une étape finale bornée, un délai entre deux crises.
- **Sauvegarde** : un champ `crises`.
- **Notes** : Inno. 5 · Impact 5 · Faisa. 4.

**2. Présages : information imparfaite et recoupement**
- **Principe.** Les catastrophes et les tensions du marché sont **annoncées à l'avance**, avec une fiabilité affichée (faible, moyenne, forte). Une partie des présages est fausse. On peut **recouper** en payant (astrologues) ou en envoyant un éclaireur.
- **Ce qui la rend originale** : une prévision chiffrée et falsifiable sur sa propre économie, rare dans le genre (Crusader Kings le fait pour les complots, pas pour les récoltes).
- **Systèmes reliés** :
  - fusion des rumeurs dans les présages ;
  - catastrophes ;
  - taverne, tour de garde et observatoire (fiabilité) ;
  - éclaireurs.
- **Décision créée.** Se préparer (réserves, réparations, achats) sur la foi d'un présage peut-être faux.
- **Coût** : S/M.
- **Risques** : présages trop fiables (plus de surprise) ou trop faux (on les ignore). Calibrés et mesurés en test.
- **Sauvegarde** : `omens` remplace `rumor` ; la rumeur en cours est migrée.
- **Notes** : Inno. 4 · Impact 4 · Faisa. 5.

**3. Réserves royales : le surplus devient une assurance**
- **Principe.**
  - On verse une partie de ses stocks (nourriture, bois, charbon, herbes) dans une **réserve scellée**. Elle est bornée par l'entrepôt et ne sert qu'aux crises (interventions) ou aux famines.
  - Une **consigne** facultative y verse automatiquement ce qui déborderait de l'entrepôt.
  - Une **consigne de crise** permet d'y puiser seule pendant une absence.
- **Ce qui la rend originale.** Le surplus n'est ni vendu ni perdu : c'est un **pari sur l'avenir**, lié aux présages. Dans les jeux du genre, les greniers ne font qu'augmenter un plafond.
- **Systèmes reliés** : entrepôt, conseiller des excédents, marché (le débordement vendu reste possible), crises, famine.
- **Décision créée** : vendre à 15 %, transformer, ou garder en réserve (sans rendement).
- **Coût** : M.
- **Risques** : servir d'entrepôt gratuit. Parades : plafond lié à l'entrepôt ; on ne peut pas retirer librement, seulement pendant une crise ou une famine.
- **Sauvegarde** : un champ `reserve`.
- **Notes** : Inno. 4 · Impact 5 (en particulier pour l'occasionnel) · Faisa. 5.

**4. Le feu et l'eau sur la carte du royaume**
- **Principe.**
  - Un incendie **se propage** de bâtiment en bâtiment selon les matériaux (le bois brûle, la pierre résiste) et les coupe-feu (routes, cases libres, rivière).
  - Une chaîne de seaux près de la rivière ou de la caserne l'arrête plus vite.
  - La crue de printemps n'abîme que les bâtiments **en zone inondable** (bord de rivière), selon un risque connu à l'avance.
  - Un **aperçu des risques** sur la carte du royaume montre les îlots inflammables et la zone inondable.
- **Ce qui la rend originale.** Le placement, central depuis la v0.1, gagne un **coût caché** à mettre en face des bonus d'adjacence. Le bord de rivière, par exemple, donne un bonus mais expose à la crue. Les jeux du genre traitent l'incendie comme un jet de dé.
- **Systèmes reliés** : grille et adjacences, catastrophes, réparations, crises (« Incendie »), caserne, routes.
- **Décision créée.** Densifier pour les bonus ou espacer pour le risque ; profiter du bord de rivière ou s'en méfier.
- **Coût** : M.
- **Risques** : incendies géants. Parade : propagation bornée (4 bâtiments au plus), intervention automatique si une caserne ou un puits (bord de rivière) est voisin.
- **Sauvegarde** : rien (les bâtiments ont déjà `damaged`).
- **Notes** : Inno. 4 · Impact 4 · Faisa. 4.

**5. Frontières contestées avec effet réel**
- **Principe.** Une province à moins de 3 cases du territoire d'une faction est **frontalière**. Son effet sur la stabilité suit la relation avec cette faction :
  - faction hostile : « Frontière contestée », stabilité −8, et la province est la cible prioritaire des révoltes de crise ;
  - faction alliée : « Frontière amie », stabilité +4.
- **Ce qui la rend originale** : la diplomatie se lit **sur la carte de ses provinces**.
- **Systèmes reliés** : territoires, stabilité, factions et relations, crises, carte du monde (la frontière dessinée devient une information).
- **Décision créée** : où fonder un avant-poste ; quand apaiser une faction voisine.
- **Coût** : S.
- **Risques** : malus permanents. Parade : borné, réversible par la diplomatie.
- **Sauvegarde** : rien (calculé).
- **Notes** : Inno. 3 · Impact 3 · Faisa. 5.

**6. Ennemis mémorables (logique « Nemesis »)**
- **Principe.** Les Seigneurs de la Brèche et les chefs de faction gardent la trace de leurs victoires et défaites. Ils s'adaptent à la composition dominante de l'armée du joueur et gagnent des titres et des cicatrices.
- **Systèmes reliés** : Brèche, factions, combat, chronique.
- **Coût** : L.
- **Risques** : contre-mesure qui punit toujours la même stratégie ; l'équilibrage du combat est fragile (voir `AUDIT.md`).
- **Notes** : Inno. 4 · Impact 4 · Faisa. 3.

**7. Château fantôme et défi du jour à graine commune**
- **Principe.** Un royaume s'exporte en code partageable : un ami l'attaque contre une défense IA. Une variante propose une graine commune par jour, avec un score comparable.
- **Systèmes reliés** : sauvegarde, combat, événements.
- **Coût** : L.
- **Risques** : triche par édition du code (aucun serveur pour valider), compatibilité des versions.
- **Notes** : Inno. 4 · Impact 3 · Faisa. 3.

**8. Lignées nommées et livre de la dynastie**
- **Principe.** Des habitants nommés (contremaîtres, héros, gouverneurs) dont la chronique suit les destins. La chronique s'exporte en livre illustré.
- **Systèmes reliés** : ouvriers, héros, chronique, dynastie.
- **Coût** : M.
- **Risques** : effet surtout narratif ; l'export ne change rien au jeu.
- **Notes** : Inno. 3 · Impact 3 · Faisa. 4.

### Design et interface

**9. Fil des répercussions (lisibilité causale)**
- **Principe.** La crise s'affiche comme une **chaîne** : cause → étape actuelle → étape suivante, avec un compte à rebours, et une intervention sous chaque maillon. Le même fil apparaît :
  - en tête du tableau de bord ;
  - dans un encart de la vue Royaume ;
  - dans le panneau latéral.

  Les présages forment l'« almanach » : prévision, fiabilité, bouton « Recouper ».
- **Systèmes reliés** : tableau de bord, conseiller, crises, présages.
- **Coût** : S/M.
- **Notes** : Inno. 4 · Impact 4 · Faisa. 5.

**10. Interface diégétique (6 lieux du château au lieu de 11 onglets)**
- **Principe.** Les 40 vues sont regroupées en Salle du trône, Table de guerre, Atelier, Archives, Comptoir et Remparts.
- **Coût** : L.
- **Risques** :
  - casse la navigation existante, les tests de mise en page et les habitudes ;
  - rien n'est gagné en jouabilité tant que les systèmes eux-mêmes restent dispersés.
- **Notes** : Inno. 3 · Impact 3 · Faisa. 2.

**11. Carte du monde façon parchemin**
- **Principe.** Brouillard à l'encre, routes dessinées à la main, taches et plis qui racontent la partie.
- **Coût** : M.
- **Risques** : élément surtout décoratif (exclu par la consigne si sans information) ; performances du canvas en 128 × 128.
- **Notes** : Inno. 3 · Impact 3 · Faisa. 3.

**12. Économie lue par ses flux**
- **Principe.** Des flux animés entre les bâtiments d'une chaîne, à la place des tableaux.
- **Coût** : M.
- **Risques** : coût de rendu sur une grande ville ; redondance avec le Bilan.
- **Notes** : Inno. 3 · Impact 3 · Faisa. 3.

### Synthèse

| # | Idée | Inno. | Impact | Faisa. | Coût |
|---|---|---|---|---|---|
| 1 | Crises en cascade | 5 | 5 | 4 | L |
| 2 | Présages | 4 | 4 | 5 | S/M |
| 3 | Réserves royales | 4 | 5 | 5 | M |
| 4 | Feu et eau sur la carte du royaume | 4 | 4 | 4 | M |
| 5 | Frontières contestées | 3 | 3 | 5 | S |
| 6 | Ennemis mémorables | 4 | 4 | 3 | L |
| 7 | Château fantôme | 4 | 3 | 3 | L |
| 8 | Lignées nommées | 3 | 3 | 4 | M |
| 9 | Fil des répercussions (interface) | 4 | 4 | 5 | S/M |
| 10 | Interface diégétique | 3 | 3 | 2 | L |
| 11 | Carte-parchemin | 3 | 3 | 3 | M |
| 12 | Flux économiques | 3 | 3 | 3 | M |

## 7. Lot retenu pour la v14 : « Répercussions »

**Thème.** Le royaume cesse de subir des événements isolés :
- **il voit venir** les présages ;
- **il se prépare** avec les réserves ;
- **il choisit où couper la chaîne** des crises ;
- **son espace compte** : le feu et l'eau, les frontières.

**Les idées retenues** : 1, 2, 3, 4 et 5, avec l'interface 9 (le fil des répercussions et l'aperçu des risques).

**Pourquoi ce lot**
- **Il répond aux cinq questions de l'audit.** Il relie catastrophes, marché, conseil, stabilité, carte du royaume et factions (§ 3). Il crée de l'anticipation et de la tension (§ 4). Il traite deux des trois points partiels de V13 (§ 5).
- **Chaque idée réutilise au moins deux systèmes et en remplace une partie** : rumeurs → présages, pénuries aléatoires → crises qui ont une cause, incendie aléatoire → propagation.
- **Aucune nouvelle monnaie, aucune ressource produite.** La réserve stocke des ressources existantes. Les interventions coûtent des ressources existantes.
- **Le lot sert l'occasionnel au lieu de le pénaliser.** Présages et consignes de réserve lui permettent de préparer son absence, et son surplus chronique devient utile.
- **Le lot forme un tout.** Les présages annoncent les crises, les réserves les absorbent, la carte du royaume et les frontières décident où elles frappent. Pris seuls, les présages ou les réserves seraient faibles. Ensemble, ils forment une boucle.

**Pourquoi pas les autres**
- **6 (Nemesis) et 7 (château fantôme)** sont de bonnes idées, mais de coût L. Elles touchent l'équilibre du combat, ou demandent une validation qu'aucun serveur ne peut garantir. Elles mériteraient une version à part entière.
- **10 (interface diégétique)** ne corrigerait pas la dispersion des systèmes eux-mêmes. Le lot retenu réduit plutôt la dispersion par la fusion : rumeurs dans les présages, pénuries dans les crises, motion « grain » dans les crises.
- **11 et 12** sont surtout visuelles. La consigne exclut tout élément sans information utile, et l'aperçu des risques du lot couvre le besoin de « voir » son royaume autrement.
- **8** est reportée : effet narratif seulement.

La mise en œuvre, les chiffres et les décisions prises en autonomie sont dans [`V14.md`](V14.md).
