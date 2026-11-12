# Plan v26 — « Audit, finitions et nouvelles conquêtes »

**Statut** : à valider. Rien n'est corrigé ni ajouté avant ton feu vert. Ce plan contient le premier passage d'audit (les sondes ont réellement tourné), puis le plan des lots A, B et C.

Sondes utilisées (hors dépôt, reproductibles) :
- même partie avancée de 12 h, avec une horloge réelle normale puis décalée d'un an ;
- même partie avancée d'un coup ou en 720 pas d'une minute ;
- taille de la sauvegarde sur 180 jours simulés ;
- écouteurs, minuteurs et mémoire pendant des ouvertures et fermetures en boucle dans le navigateur ;
- cas limites des événements v25 ;
- chaîne de migration de toutes les fixtures.

## 1. Premier passage d'audit : bugs trouvés

Gravité :
- **Haute** : perte de données ou de partie, blocage.
- **Moyenne** : règle du jeu faussée, résultat non reproductible, promesse non tenue.
- **Basse** : confort, affichage.

| # | Gravité | Piste | Bug constaté | Cause | Correction prévue (lot A) |
|---|---|---|---|---|---|
| A1 | Moyenne | 5 (v25) | On peut revendiquer la case d'une cible d'événement. La cible devient alors invisible sur la carte, mais reste attaquable depuis la liste. *Reproduit : cible à 5,7 cases, revendication acceptée, cible encore là, non affichée, attaquable.* | `canClaim` ne refuse que cité, royaume, chef et camp non nettoyé ; le type `evt` (v25) passe. | Refuser « Case occupée par l'événement » tant qu'une cible y est. Test. |
| A2 | Moyenne | 5 (v25) | **La doc v25 promet « mêmes accélérateurs » pour les marches d'événement : c'est faux.** Les accélérateurs ne s'appliquent qu'aux files (construction, recherche, recrutement, forge). Aucune marche, d'événement ou non, n'en profite. | `applySpeedup` / `findJob` ne connaissent que `state.queues`. | Rendre les accélérateurs existants utilisables sur une marche (aller ou retour), y compris d'événement, sans nouvel objet ni monnaie. Corriger `V25.md`. Test. |
| A3 | Moyenne | 1 (temps) | Une bataille de raid ou de siège ne donne pas le même résultat selon l'**heure réelle de l'appareil**. *Reproduit : 12 h simulées, horloge réelle normale contre décalée d'un an → pertes différentes d'un raid (8 contre 9 miliciens).* | La graine du combat vient de l'identifiant (`hashSeed(raid.id)`, `hashSeed(m.id + t)`), et `uid()` contient `Date.now()` et `Math.random()`. | Graine tirée du générateur de la partie à la création du raid ou de la marche (`seed`), avec repli sur l'ancien calcul pour les sauvegardes existantes. Test « horloge réelle quelconque → même état ». |
| A4 | Moyenne | 4 (aléa) | Les garnisons des lieux apparus en cours de partie ne sont pas reproductibles. *Reproduit sur la sauvegarde de fin : un antre à 19 loups contre 16 selon le passage.* | `makeEnemies(type, danger, r = Math.random)` et `spawnPoi` sans générateur ; `dungeons.js` (graine du donjon) et `scenarios.js` utilisent aussi `Math.random`. | Générateur à graine de la partie par défaut (`rng.random`). Le chargement n'est pas touché : rien ne dépend de ces valeurs à la relecture. Test de reproductibilité. |
| A5 | Basse | 2 (sauvegarde) | Quand le stockage est presque plein, la sauvegarde réussit en supprimant la copie de secours et renvoie un avertissement que l'interface **n'affiche jamais**. En cas d'échec, le message renvoie vers un menu au lieu d'ouvrir l'export. | `app.save()` ignore `r.warning` ; le toast d'erreur n'a pas de bouton. | Afficher l'avertissement une fois ; en cas d'échec, ouvrir une fenêtre qui explique et propose « Télécharger la sauvegarde ». La partie en mémoire n'est jamais perdue. Test avec un stockage factice plein. |
| A6 | Basse | 2 (sauvegarde) | Taille et croissance de la sauvegarde : **MESURE_SAVE** | voir mesure | Plafonner ce qui grossit sans fin ; compresser si nécessaire (voir § 2). |
| A7 | Basse | 5 (v25) | Si le calendrier lance un événement en retard (le précédent n'était pas fini), il garde sa date de fin prévue : il dure moins longtemps. *Reproduit : Ruée vers l'Or lancée 4 h en retard, finie à l'heure prévue.* | `startEvent(…, slot.end)` à la reprise d'un créneau en retard. | Décaler la fin du retard, sans dépasser le créneau suivant. Test. |
| A8 | Basse | 5 (v25) | Quand l'avant-poste de départ disparaît pendant la marche, la troupe rentre bien à l'armée, mais le trait part encore d'une case vide. | `m.from` figé. | Rattacher le trajet de retour à la capitale si l'avant-poste n'existe plus. |
| A9 | Moyenne | Équilibre | Le joueur passif (2 visites par jour) finit la passe de la Guerre des Royaumes et du Siège (AUDIT_V25 § 3). | `passScale` trop bas (0,3 et 0,2) ; une partie des points arrive sans visite (régions tenues, assauts). | Remonter `passScale`, et ne compter les points d'assaut que si une garnison est présente (déjà le cas) et les points de région que si la région a été (re)prise dans les dernières 24 h. Viser passif < 20 et moyen = 20 avec `tools/eventSim.js`. |

### Pistes vérifiées sans bug trouvé à ce stade (à confirmer pendant le lot A)

- **Pas à pas** (piste 1) : 12 h d'un coup ou 720 pas d'une minute donnent le même état, à la graine de raid près (A3). L'horloge qui recule est déjà gérée (`shiftTimeline` décale toute la chronologie, y compris les champs v25). Le passage à l'heure d'été ou d'hiver n'a pas d'effet : tout est en millisecondes UTC.
- **Fuites** (piste 3), 45 boucles d'ouvertures et fermetures de 11 vues en 1 min, puis 3 min :
  - écouteurs sur `window` et `document` stables (aucun ajout après le démarrage) ;
  - 2 minuteurs du début à la fin ;
  - nœuds DOM stables (≈ 1 580) ;
  - mémoire JS stable (≈ 11-13 Mo après ramasse-miettes).
  
  Les écouteurs sans `removeEventListener` sont posés sur des éléments remplacés à chaque rendu : ils disparaissent avec eux. Les caches de peinture sont bornés (700 dessins, 220 blocs de terrain, 40 portraits). **Reste à faire** : la session de 2 h demandée et la mesure à la fin.
- **Migrations** (piste 6) : les 10 fixtures (formats v9 et v10, parties v13.3 à v24) migrent vers v11, se rechargent et tournent 24 h, sans valeur NaN, négative ou infinie et sans erreur. À ajouter au lot A sous forme de test permanent.
- **Événements v25** (piste 5) :
  - fin d'événement pendant une absence de 12 h avec une marche en route : aucune erreur, troupes rentrées ;
  - rechargement en pleine transition : phase et date conservées ;
  - rappel d'une marche avec coût : coût rendu, troupes rentrées.
- **Double clic** : déjà protégé pour toutes les actions (350 ms, même bouton).

## 2. Lot A — Audit des bugs (à livrer en premier)

1. Corriger A1 à A9, chacun avec un test qui reproduit le bug avant la correction.
2. **Tests permanents** :
   - même partie, horloge réelle quelconque → même état ;
   - 12 h d'un coup = 720 pas ;
   - chaîne de migration complète de toutes les fixtures + 24 h sans NaN ni valeur négative ;
   - taille de sauvegarde bornée à 180 jours.
3. **Sauvegarde** : plafonner les listes qui grossissent sans fin (selon la mesure A6 : journaux, chroniques, rapports, historiques d'événements…), avec un test de taille. Si la taille reste grande, compresser la sauvegarde avec un format simple et rétrocompatible : la lecture accepte l'ancien JSON.
4. **Fuites** : session automatique de 2 h dans le navigateur (vues, fenêtres, anneau d'actions, envoi de marche, carte du monde zoomée et dézoomée). Mesures au début et à la fin : écouteurs, minuteurs, nœuds, mémoire. Correction de tout ce qui monte.
5. **Audit général** :
   - ressources ou stocks négatifs, NaN, plafonds non respectés (contrôle dans les simulations longues) ;
   - files bloquées ou doublées ;
   - actions possibles pendant une confirmation ;
   - textes qui débordent et fenêtres hors écran (téléphone, tablette) ;
   - **étiquettes de la carte du monde** : nouvelle mesure dans `npm run overlaps`. Les étiquettes entre elles ne se chevauchent pas par construction. La mesure ajoute les écussons, les comptes à rebours et l'anneau d'actions contre les étiquettes, et compte les étiquettes importantes masquées (capitale, chef, menace).
6. **Partie longue** : `profileSim` sur 30 jours sans erreur dans la console. La sonde des 180 jours tourne déjà.

## 3. Lot B — Finir ce qui est partiel (après validation du lot A)

Ordre proposé, du plus visible au moins visible :

1. **Cibles du monde peintes dans la chaîne de la v21** : matières, lumière, ombres portées et contour, comme le château. Dans l'ordre : camps, forteresses et chefs, puis lieux de ressource et d'événement. La lisibilité au dézoom est vérifiée.
2. **Bâtiments redessinés palier par palier** : hôtel de ville, caserne, ferme, marché, forge en premier.
3. **Forteresses d'événement en siège par flancs** : plan de la v19 (flancs, vagues, engins, cour) dans la fenêtre d'attaque, et combat `attackFortress` avec les mods d'événement.
4. **Marches visibles pour tout le monde** :
   - attaques ennemies en trait rouge avec alerte (déjà fait pour les raids ; étendre aux armées des factions en guerre) ;
   - renforts alliés et cités libres en vraies marches (dragon, siège) ;
   - combat de route entre une caravane et des corsaires (au lieu d'un simple risque).
5. **Panneaux « à bâtir »** remplacés par des emplacements discrets (pavés, piquets), visibles surtout en mode construction.
6. **Identité des factions dans les données** (`data/kingdoms.js` ou `factions`) : architecture, couleurs, blason. Appliquée aux forteresses et bannières de la carte, au lieu du numéro de rival.
7. **Bord du monde** : la mer et la brume au-delà de la dernière case, avec des falaises sur la côte, visibles au dézoom maximal.
8. **Ruines Anciennes reliées à l'archéologie** : les zones de fouilles en cours deviennent des endroits où les ruines cachées de l'événement apparaissent plus souvent, et un trésor trouvé compte pour la fouille.

## 4. Lot C — Innovations : ma sélection (4 sur 6)

| Rang | Proposition | Pourquoi elle est forte | Liens avec nos systèmes |
|---|---|---|---|
| 1 | **Métropoles à conquérir** | C'est la mécanique de conquête qui manque le plus pour retrouver la sensation du genre : une grande place forte visible sur la carte, à assiéger longuement. Elle donne un but aux armées de fin de partie. | Siège v19 (flancs, vagues, engins, cour), cités libres de la carte, conseil royal (choix piller / vassaliser / libérer), mémoire et rancune des factions, contre-attaques visibles (lot B4), avant-postes. |
| 2 | **Saison de guerre** | Un rythme sur plusieurs semaines, avec classement et territoires à tenir. Le prestige seulement, jamais de puissance permanente, comme le veut le projet. | Factions, frontières (v25), héritage de la dynastie, classement simulé des événements, titres et décorations existants. |
| 3 | **Prisonniers et rançons** | Simple à comprendre, et donne de la profondeur aux némésis et aux commandants. | Némésis (v15), héros, réputation, rancune des factions, diplomatie (échange), conseil royal. |
| 4 | **Fausses bannières** | Une ruse défensive originale, qui donne enfin un rôle actif à l'espionnage ennemi. | Espionnage, tour de guet, raids et flancs (v19), mémoire des factions (ceux qui se font berner s'en souviennent). |

**Non retenues pour l'instant** :
- **Îles de Cendre** : elles dépendent du bord du monde (B7). Je les propose en extension une fois le cadre du monde fait.
- **Calendrier de fidélité** : facile, mais c'est un code de jeu mobile qui apporte peu à un jeu solo hors ligne. Je peux le faire en petit bonus si tu le veux.

Ma recommandation pour la v26 : **1 et 3** en priorité. Les métropoles utilisent tout ce qui existe (siège, conseil, factions) et les prisonniers s'y branchent naturellement (le gouverneur d'une métropole capturé). Puis **4**. La **2** (saison de guerre) demande le plus de travail et gagne à venir après les métropoles.

## 5. Méthode

- Livraison dans l'ordre A, puis B, puis C, un lot à la fois ; tu essaies entre chaque.
- À chaque lot : `npm test`, `smoke`, `layout`, `overlaps`, `simulate` et `build` au vert ; captures avant/après ; `docs/V26.md` et `docs/AUDIT_V26.md`.
- L'audit classe chaque bug (gravité, cause, correction, test) et contient une section **« Proximité avec GGE »** : pour chaque élément, avant, après et ce qui reste à faire, ainsi que la liste honnête de ce qui reste partiel.

## 6. Questions

1. Lot C : d'accord avec **Métropoles + Prisonniers** d'abord, puis **Fausses bannières** ? Ou préfères-tu la **Saison de guerre** plus tôt ?
2. Sauvegarde : si le plafonnage ne suffit pas, acceptes-tu une **sauvegarde compressée** dans le navigateur ? L'export reste un JSON lisible.
3. Accélérateurs sur les marches (A2) : je propose d'utiliser **les mêmes objets d'accélération** que les files, sans en créer de nouveaux. D'accord ?
