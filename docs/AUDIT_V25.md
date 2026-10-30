# Audit v25 — « Le monde en fête et en guerre » (lot 1 : les événements sur la carte du monde)

**Point de départ** : la v24 « Carte du monde, cibles, événements et icônes ».

**Plan validé** : `docs/PLAN_V25.md`, avec trois choix confirmés :
- coefficient de trajet de 4 ;
- les avant-postes servent seulement de point de départ ;
- le harcèlement ne détruit rien.

**Référence** : la façon dont les jeux de stratégie du genre montrent leurs événements. Les camps sont posés sur la carte du monde autour de chez soi : faibles près, forts loin. On les attaque par un anneau d'actions, on lit leur niveau dans un écusson, et les menaces en marche sont visibles. Seuls les codes du genre sont repris : aucun nom, dessin ni texte n'est copié.

Captures :
- **avant**, version v24 : `docs/v25/avant-*` (écran de l'événement et carte du monde, pendant trois événements) ;
- **après** : `docs/v25/apres-*` ;
- **parcours complet** : `docs/v25/apres-anneau.png`, `apres-envoi.png` et `apres-fiche.png` ;
- **couches et menaces** : `docs/v25/apres-detail-*`.

## 1. Constats « avant » vérifiés

| # | Constat | Vérification |
|---|---|---|
| 1 | Chaque événement génère sa propre petite carte (16 × 10 ou 18 × 11 cases) : terrain tiré au hasard, base fictive en (0, h/2), brouillard et lave propres. Elle s'affiche comme une grille de boutons dans l'écran de l'événement. | `generateMap`, `freeCell`, `addTarget`, `mapView` ; `avant-ecran-*.png` |
| 2 | Sur la carte du monde, la v24 ne montre qu'un camp près de la capitale, qui renvoie vers les cibles de cette carte à part. | `eventSites.js` ; `avant-monde-*.png` |
| 3 | Les marches d'événement forment une liste séparée (`live.marches`). Elles ne sont ni tracées sur le monde, ni accélérables comme les autres, et leur trajet est fictif : 2,5 min par case, à partir de la base fictive. | `liveTravel`, `processLiveMarches` |
| 4 | Les avant-postes ne servent à rien pendant un événement. Toutes les cibles se valent, quelle que soit leur distance réelle. | Code v24 |
| 5 | Vagues (Nuit des Morts) et assauts (Siège) arrivent sans rien montrer sur la carte. Les prospecteurs rivaux « revendiquent » un filon d'un coup, sans marche visible. | `resolveWave`, `resolveAssault`, `hourly` |
| 6 | Aucun joueur simulé ne jouait les événements : la durée de 72 h n'était vérifiée nulle part. | `profileSim` ne touche pas `liveEvents` |
| 7 | **Mesure v24** (nouvel outil `tools/eventSim.js`, lancé sur les sources v24) : un joueur moyen finit 6 événements sur 11. Ruines, Guerre des Royaumes, Nuit des Morts et Siège restent bloqués aux paliers 0 et 1. | Tableau du § 3 |

## 2. Ce qui a changé (le détail est dans `docs/V25.md`)

- **Les cibles sur le monde** :
  - toutes les cibles (camps, trésors, chefs, forteresses, convois, dangers) sont posées sur la carte du monde 128 × 128 ;
  - elles sont en anneaux autour de la capitale et des avant-postes : palier I à 4-8 cases, palier VII à 22-24 cases, forteresses et chefs au plus loin ;
  - le placement est déterministe ; jamais sur une rivière ou une montagne (sauf si l'événement l'exige), ni sur un lieu ou un territoire ; les cibles sont espacées ;
  - 24 cibles visibles au plus.
- **Une seule liste de marches** : `state.marches`, avec le type `event`. Les marches d'événement ont les mêmes tracés, les mêmes accélérateurs et le même rappel que les autres, plus leur propre plafond.
  - **Départ** : la capitale ou l'avant-poste le plus proche, au choix.
  - **Trajets** : vrais trajets du monde × 4.
- **Les règles de chaque événement** utilisent le vrai monde :
  - camps nomades qui se déplacent, harcèlement visible ;
  - repaires au bord des rivières qui guettent les caravanes ;
  - front de neige qui avance et ralentit ;
  - ruines cachées sous le vrai brouillard ;
  - piste du dragon qui brûle les cases ;
  - régions disputées sur les frontières réelles ;
  - course visible contre les prospecteurs rivaux ;
  - volcan et lave qui menacent les avant-postes ;
  - hordes que l'on peut intercepter ;
  - assaut dont la direction donne le flanc ;
  - convois entre de vraies cités libres.
- **Interface** :
  - un clic sur un lieu ouvre un anneau d'actions (Attaquer, Espionner, actions de l'événement, Infos) ;
  - la fiche du camp montre niveau, défenseurs estimés (exacts après espionnage), points, et distance et temps depuis chaque base ;
  - l'écran d'attaque est celui du monde, avec le choix du départ ;
  - écusson de niveau, comptes à rebours et transitions animées (apparition, camp en feu, bannière qui tombe, camp levé) ;
  - filtre « Événement » et légende sur la carte ;
  - l'écran de l'événement perd sa carte et gagne la liste des cibles triée par distance, avec « Montre-moi ».
- **Migration** : sauvegardes v10 → v11 (fixture `tests/fixtures/save-v24.json.gz`). L'ancien code des cartes d'événement est supprimé.

## 3. Mesures

### Tests et outils

| Mesure | v24 | v25 |
|---|---|---|
| `npm test` | 457 réussis | **472 réussis**, 0 échec (dont 18 tests v25) |
| `npm run smoke` | aucune erreur | aucune erreur (52 vues, 482 actions) |
| `npm run layout` | 372 vérifications | 372 vérifications, aucun problème |
| `npm run overlaps` | 0 | 0 |
| Taille du jeu | 2 227 Ko | 2 270 Ko |
| Rendu de la carte du monde (smoke) | 4 ms | 4 ms |

### Événements en 72 h (`node tools/eventSim.js 2`)

Le joueur simulé :
- part de la sauvegarde de milieu de partie (HdV 7), avec une armée de 185 soldats reformée chaque matin ;
- utilise le remplissage auto du jeu ;
- envoie chaque troupe d'événement libre vers la cible utile la plus proche.

Palier de passe atteint en 72 h (20 = événement fini) :

| Événement | v24 (ancienne carte) passif / moyen / assidu | v25 (monde, calibré) passif / moyen / assidu |
|---|---|---|
| Cavaliers des Steppes | 6 / 20 / 20 | 9 / 20 / 20 |
| Corsaires du Sud | 19 / 20 / 20 | 20 / 20 / 20 |
| Hiver des Géants | 5 / 12 / 11 | 7 / 20 / 20 |
| Ruines Anciennes | 0 / 0 / 0 | 7 / 20 / 20 |
| Chasse au Dragon | 10 / 20 / 20 | 16 / 20 / 20 |
| Guerre des Royaumes | 0 / 0 / 0 | 20 / 20 / 20 |
| Ruée vers l’Or | 10 / 20 / 20 | 10 / 20 / 20 |
| Colère du Volcan | 9 / 20 / 19 | 9 / 20 / 20 |
| Nuit des Morts | 1 / 1 / 1 | 16 / 20 / 20 |
| Siège des Anciens | 1 / 1 / 0 | 20 / 20 / 20 |
| Convoi des Sept Marchands | 10 / 20 / 20 | 15 / 20 / 20 |
| **Moyenne** | **6,5 / 12,2 / 11,9** | **13,5 / 20 / 20** |

Le joueur moyen (une visite toutes les 2 h en journée) finit **les 11 événements en 72 h** (6 sur 11 en v24). Points par palier de passe (`passScale`) : Steppes 0,8 ; Géants 0,55 ; Ruines 0,35 ; Dragon 0,7 ; Guerre des Royaumes 0,3 ; Volcan 0,9 ; Nuit des Morts 0,15 ; Siège 0,2 ; Sept Marchands 0,9 ; Corsaires et Ruée vers l’Or inchangés. `npm run simulate` (profils et économie) : sans erreur.

À surveiller : avec ce calibrage, le joueur passif finit aussi la Guerre des Royaumes et le Siège (les points y viennent surtout des régions tenues et des assauts, qui arrivent sans visite). Le joueur simulé ne tient pas compte de tout ce qu’un vrai joueur fait ; les réglages sont dans les données (`passScale`) et se retouchent facilement après ton essai.

## 4. Ce qui reste partiel (honnêtement)

- **Écran d'attaque** : celui du monde (unités, compositions, remplissage auto, commandant, formation, départ). Mais les forteresses d'événement se combattent encore en bataille simple : le plan de siège par flancs et engins de la v19 n'y est pas branché.
- **Calibrage** : la passe est réglée par événement (`passScale`) à partir du joueur simulé. La Nuit des Morts et le Siège rapportent surtout par les vagues et les assauts (un toutes les 4 à 6 h) ; leur palier par passe est donc bien plus bas. Le joueur simulé ne tient pas de garnison et ne garde pas d'armée à la maison : les chiffres d'un vrai joueur peuvent être meilleurs.
- **Ruines Anciennes** : la découverte passe par l'exploration du monde (éclaireurs). Le lien avec le système d'archéologie (zones de fouilles) n'est pas fait.
- **Cités libres et alliés** : contre le dragon et pendant le siège, leur contribution reste simulée (rythme des seigneurs IA). Elle n'apparaît pas comme des marches visibles.
- **Harcèlement nomade** : il frappe l'avant-poste par un combat contre sa garnison. Pas de flancs.
- **Interception des convois par les corsaires** : elle augmente le risque d'abordage de la caravane (règle existante des caravanes). Il n'y a pas de combat sur la route.
- **`npm run overlaps`** : l'outil mesure les étiquettes et bulles de la ville. Sur la carte du monde, les étiquettes passent par le placeur anti-collision existant, et les cibles sont espacées d'au moins 2 cases (vérifié par les tests v25). Aucune mesure automatique des étiquettes du monde n'a été ajoutée.
- **Peinture** : les dessins des cibles d'événement suivent la peinture vectorielle de la v24. Leur passage dans la chaîne de peinture de la v21 est le lot 2.

## 5. Ce qui rapproche du genre / ce qui s'en écarte

- **Rapproche** :
  - camps posés autour de chez soi, faibles près et forts loin ;
  - écusson de niveau et bannière de l'événement ;
  - anneau d'actions au clic ;
  - fiche avec défenseurs estimés, exacts après espionnage ;
  - temps de marche depuis chaque base ;
  - menaces en trait rouge avec compte à rebours ;
  - course visible aux filons ;
  - avant-postes utiles comme points de départ.
- **S'écarte (voulu)** :
  - pas de monnaie premium ni d'accélération payante ;
  - pas de seigneurs réels : rivaux et alliés sont simulés hors ligne ;
  - les noms, dessins et textes sont propres à Cendrelande.
- **S'écarte (pas encore fait)** : les forteresses d'événement ne s'assiègent pas encore par flancs (voir § 4).
