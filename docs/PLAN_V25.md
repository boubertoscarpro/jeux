# Plan v25, lot 1 : les événements vivent uniquement sur la carte du monde

**Statut** : à valider. Je n'écris aucun code du lot avant ton feu vert.

## 1. Inventaire du code des événements (état v24)

### 1.1 Ce qui génère et utilise la carte d'événement

| Élément | Où | Rôle actuel |
|---|---|---|
| `generateMap(state, def, seed)` | `src/systems/liveEvents.js` | Grille `def.map.w × h` (16 × 10 ou 18 × 11), avec un terrain tiré au sort, une base en (0, h/2), un brouillard optionnel, de la lave et les cibles de `def.map.targets`. |
| `freeCell`, `addTarget` | idem | Place une cible sur une case libre de la grille. Forteresse et boss sont mis dans les 40 % les plus à droite. Gère le palier, l'armée ennemie (`scaleEnemies`), le chemin des caravanes et navires, la quantité des filons et l'énigme. |
| `revealAround`, `shuffleLava`, `lavaNear` | idem | Brouillard propre à l'événement (Ruines) et lave qui bouge chaque heure (Volcan). |
| `isVisible(cur, t)` | idem | Brouillard de l'événement, cible cachée (boss), cible vaincue. |
| `liveTravel(state, cur, x, y, …)` | idem | Durée = distance à `map.base` × 2,5 min ÷ vitesse, soit de 2 à 45 min. |
| `planLive`, `sendLive`, `recallLive`, `processLiveMarches`, `arriveLive`, `attackTarget`, `attackBoss`, `attackLair`, `finishLiveWork`, `homeLive` | idem | Marches propres à l'événement : liste `live.marches` séparée de `state.marches`, avec un plafond `maxLiveMarches`. |
| `currentTick`, `hourly` | idem | Apparition du boss après 6 h, réapparition des cibles, déplacement des caravanes et navires, contre-attaques des régions, filons revendiqués par des rivaux, lave. |
| `resolveWave`, `resolveAssault` | idem | Nuit des Morts : vague toutes les 6 h. Siège : assaut sur la Citadelle toutes les 4 h. Rien n'apparaît sur la carte. |
| `liveTarget(state, id)` | idem | Recherche dans `cur.map.targets`. |
| `def.map` (terrain, nombre de cibles, paliers) | `src/data/liveEvents.js` | 11 événements, chacun avec sa grille. |
| `mapView`, `selPanel`, `planCard`, `marchList` | `src/ui/views/events.js` | Onglet carte : une grille de boutons `ev-cell`, une fiche de sélection et une liste des marches. |
| `eventSites.js` (v24) | `src/systems/eventSites.js` | Un seul camp près de la capitale, qui renvoie vers les cibles de la carte d'événement. |
| `autoFillLive` | `src/systems/autofill.js` | Remplissage automatique, qui ne dépend pas de la carte. |
| Tests | `events`, `audit`, `autofill`, `mechanics`, `v24` | 30 lignes touchent `cur.map`, `planLive` ou `sendLive`. |

### 1.2 Ce qui existe déjà côté monde et sera réutilisé

- **Monde** : 128 × 128 cases, avec `wTerrain`, `isRevealed`, `reveal`, `poiAt`, `spawnPoi`, `findFreeTile`, `distCap`, et `travelTime` à 18 s par case à vitesse 1.
- **Marches du monde** : `planMarch` / `sendMarch` / `processMarch`, avec les types attack, scout, gather, visit, boss et dungeon, le siège par flancs de la v19 (`siegePlan`), les accélérateurs et le héros.
- **Avant-postes** : `state.territories`, chacun avec x, y et une ville.
- **Réseau logistique** : routes entre avant-postes et relais.
- **Raids des rivaux** : `state.raids`, déjà tracés en rouge sur la carte du monde avec un compte à rebours et le flanc visé (v19). Le lot 7 est donc déjà en grande partie fait ; il reste à l'étendre aux nouvelles menaces des événements.
- **Caravanes vers les cités libres** : `state.caravans`. Les cités, les royaumes et les factions ont des positions réelles.
- **Rendu** : `poiPainter`, les `TARGETS` de la v24, les étiquettes, le niveau de détail, les filtres de lieux (`POI_CAT`) et la mini-carte.

### 1.3 Ce qui n'existe pas

- **Aucun joueur simulé ne joue les événements** : `profileSim` ne touche pas `liveEvents`. Il faut écrire ce bot pour vérifier la règle des 72 h.
- Pas d'anneau d'actions autour d'un lieu de la carte du monde : on passe aujourd'hui par une fiche latérale.
- Pas de marche partant d'un avant-poste : toutes partent de la capitale (`distCap`).

## 2. Nouvelle architecture

```
             LIVE_EVENTS (données)
   def.world = { rings, spawn, special }   ← remplace def.map
                     │
     startEvent ─────┼──► eventWorld.js (nouveau)
                     │      placeTargets(state, def, occ)    placement déterministe en anneaux
                     │      respawn(state, cur, now)         rythme, plafond, palier croissant
                     │      moveTargets(...)                 camps nomades, caravanes, dragon, hordes, front de neige, lave
                     │      syncPois(state)                  1 lieu du monde par cible visible
                     ▼
  state.world.pois["x,y"] = { type:'evt', evId, eventKey, kind, tier, phase, … }   ← vrais lieux
                     │
   clic sur la carte du monde → anneau d'actions → planEvent / sendEvent
                     │                (validation dans le moteur)
                     ▼
  state.marches (liste UNIQUE) : { type:'event', action, targetId, from:{x,y}, … }
     processMarch → arrive → resolveEventAction(state, m, t)   ← la logique actuelle d'arriveLive / attackTarget / finishLiveWork
```

### Décisions

1. **Une seule liste de marches.** Les marches d'événement rejoignent `state.marches`, avec `type: 'event'` et une `action`. `live.marches` disparaît. On récupère ainsi gratuitement :
   - le tracé sur la carte ;
   - les accélérateurs ;
   - le rappel ;
   - les rapports ;
   - le plafond de marches ;
   - le remplissage automatique.

   Le plafond propre aux événements, `maxLiveMarches`, devient un bonus de marches actif pendant l'événement. Le total reste à peu près le même qu'aujourd'hui (marches du monde + marches d'événement), pour ne pas réduire ce qu'on peut faire.

2. **Départ choisi.** Chaque marche a un `from`. Par défaut, c'est la capitale ou l'avant-poste le plus proche de la cible. On peut aussi choisir le point de départ dans la fiche. `travelTime` accepte une origine. Les troupes partent de l'armée centrale comme aujourd'hui : pas de garnison par avant-poste, donc pas de nouveau stock d'unités.

3. **Les cibles sont de vrais lieux du monde.** Elles sont stockées dans `cur.targets`, avec leur état (palier, PV, vaincue, trésor révélé, filon restant), et reflétées dans `world.pois` sous le type `evt`. Ce reflet n'est qu'une projection, refaite à chaque pas du monde : la vérité reste dans `cur.targets`. `eventSites.js` disparaît et `evt` le remplace.

4. **Placement en anneaux, comme les camps nomades.** Pour chaque base (capitale et avant-postes) :

   | Anneau | Distance | Paliers |
   |---|---|---|
   | proche | 4 à 9 cases | I à III |
   | moyen | 9 à 16 cases | III à V |
   | lointain | 16 à 24 cases (`EVENT_REACH`) | VI et VII, forteresse, boss |

   Le placement est déterministe : hachage de (seed, occurrence, index, tentative). Il évite les rivières, les montagnes (sauf si l'événement l'exige), les lieux existants et les territoires. Les cibles restent hors du brouillard, sauf pour les Ruines.

5. **Plafond de lisibilité.** Au plus 24 cibles d'événement visibles à la fois, et pas deux cibles à moins de 2 cases l'une de l'autre. Le niveau de détail de la v24 s'applique, avec un écusson de niveau qui reste lisible au dézoom. `npm run overlaps` doit rester à 0.

6. **Réapparition.** Une cible vaincue renaît selon `def.world.spawn`, avec un délai, un plafond et un palier qui monte de 1 tous les N passages, borné à VII. Elle renaît dans le même anneau mais sur une autre case.

7. **Phases et transitions.** Les phases sont : annoncé → actif → boss → vaincu → retiré. La phase « vaincu » dure 20 minutes de jeu, avec un campement qui fume puis une bannière qui tombe. L'animation est en canvas et indexée sur le temps. Un test de rendu vérifie chaque phase. Avec le réglage « mouvement réduit », la phase change sans animation.

8. **Interface façon GGE.**
   - **Clic sur une cible : anneau d'actions** autour d'elle (Attaquer, Espionner, Soutenir, Infos, et les actions propres à l'événement : Escorter, Déterrer, Exploiter, Livrer, Résoudre…). Il réutilise le composant d'anneau du château (v16, `ring`) en version carte.
   - **Fiche de camp** : niveau, défenseurs estimés (fourchette, précise après espionnage), récompenses et points d'événement, distance et temps depuis la capitale ou chaque avant-poste, puis bouton Attaquer.
   - **Écran d'attaque** : celui de la v19, avec flancs, cour, vagues, engins, commandant et « Remplissage auto ». Les camps n'ont pas d'enceinte : comme pour les camps du monde, les engins y sont refusés, mais forteresses et bastions les acceptent.
   - **Écran de l'événement** : l'onglet carte disparaît. On garde la boutique, les missions, le tableau d'honneur et la passe. On ajoute « Voir sur la carte » et une liste des cibles triée par distance, avec « Montre-moi » pour centrer la carte dessus.
   - **Filtres de lieux** : un filtre « Événement » et une ligne dans la légende.

### Adaptation de chaque événement

| Événement | Sur le vrai monde |
|---|---|
| Cavaliers des Steppes | Camps en anneaux. Un tiers sont « nomades » : ils changent de case toutes les 4 h dans leur anneau. Un camp nomade à moins de 6 cases d'un avant-poste mal gardé peut le harceler : c'est un raid d'événement visible en rouge, qui vole des ressources mais ne détruit rien. |
| Corsaires du Sud | Repaires placés sur une case de rivière ou de côte, ou à côté. Les navires suivent les rivières. Interception : un repaire à moins de 3 cases d'une route de caravane vers une cité libre peut attaquer cette caravane. On peut le nettoyer avant ou escorter la caravane. |
| Hiver des Géants | Un front de neige : un disque dont le rayon grandit chaque heure, centré sur une région à 10–20 cases. Le terrain affiché passe à la neige pendant l'événement, en couche visuelle seulement. Les marches qui le traversent sont ralenties de 25 %. Géants, meutes et brasiers sont dans la zone gelée. |
| Ruines Anciennes | Les ruines sont placées dans des cases du vrai brouillard, à 8–24 cases. Elles deviennent visibles quand la case est révélée (éclaireurs, exploration, archéologie). Une carte au trésor donne de vraies coordonnées et révèle la case. Les énigmes restent les mêmes. |
| Chasse au Dragon | Le dragon a 3 antres successifs. Chaque piste suivie révèle l'antre suivant, et le dragon laisse 3 à 5 cases brûlées (couche visuelle) sur son passage. L'antre final porte le boss coopératif. Les cités libres et les alliés contribuent comme aujourd'hui (simulés). |
| Guerre des Royaumes | Les régions disputées sont placées sur les frontières réelles : entre mes territoires et le royaume rival le plus proche, en pondérant par la mémoire et la relation des factions. Les garnisons tenues donnent des points et subissent des contre-attaques (même logique qu'aujourd'hui). |
| Ruée vers l'Or | Les filons apparaissent sur des cases de collines, montagnes ou rivières. Chaque heure, un rival IA envoie une marche visible (trait orange) vers un filon libre. S'il arrive avant toi, le filon est perdu. C'est une vraie course. |
| Colère du Volcan | Un volcan apparaît sur une case de montagne à 10–20 cases. La lave se déplace chaque heure sur les cases voisines (couche visuelle et danger). Un avant-poste à moins de 4 cases reçoit un avertissement et peut perdre de la production pendant le passage de la lave. |
| Nuit des Morts | Les cryptes sont placées dans le monde. Toutes les 6 h, une horde part de la crypte non purgée la plus proche et marche vers la capitale ou un avant-poste. Elle est visible en rouge, avec un compte à rebours. On peut l'intercepter en attaquant la horde en route (cible mobile). Sinon la vague se résout comme aujourd'hui. |
| Siège des Anciens | La Citadelle des Anciens est un lieu du monde où l'on envoie une garnison. Les assauts arrivent d'une direction visible : un camp ennemi et une marche rouge vers la capitale. Cette direction donne le flanc visé selon la logique de la v19 (`pickRaidFlank`), et les assauts sur la capitale utilisent `defendCastle`. |
| Convoi des Sept Marchands | 7 caravanes suivent de vraies routes entre deux cités libres, case par case, en évitant les montagnes. Des camps de pillards apparaissent près des routes. On peut escorter (aller avec le convoi), commercer ou nettoyer les pillards. |

## 3. Équilibre

- **Les temps de marche changent d'échelle.**
  - Aujourd'hui : 2,5 min par case de carte d'événement, sur 1 à 18 cases, soit 2 à 45 min.
  - Sur le monde : 18 s par case, sur 4 à 24 cases, soit 1 à 7 min à vitesse 1 et environ 10 min pour les unités lentes.
  - **Proposition : un multiplicateur unique `EVENT_TRAVEL = 4` sur les marches d'événement**, pour retrouver à peu près le rythme actuel (5 à 40 min). Ce sont les temps qui conviennent à GGE pour enchaîner les camps proches. Ce coefficient se règle dans le panneau d'administration (`liveConfig`).
- **Points, réapparitions et plafonds** : je les recalibre avec un nouveau bot dans `profileSim`, qui joue l'événement en continu. Pour chaque événement et chaque profil (passif, moyen, assidu), la simulation mesure le palier de passe atteint en 72 h. Objectif : le profil moyen termine l'événement en 72 h, le passif atteint au moins la moitié de la passe.
- **Pas de nouvelle monnaie, pas de nouvelle ressource.** Les récompenses et la boutique ne changent pas.

## 4. Migration (sauvegarde v10 → v11)

- **Événement en cours** : les cibles restantes (non `gone`) sont transposées dans le monde avec le placement en anneaux. L'anneau est choisi d'après leur ancienne colonne : colonne / largeur détermine l'anneau proche, moyen ou lointain. Leur état est conservé : palier, PV du boss, vaincue (`done` et `respawnAt`), trésor révélé, filon restant, région tenue.
- **Marches d'événement en cours** (`live.marches`) : elles rentrent immédiatement. Les troupes sont rendues à l'armée, les coûts payés remboursés, les héros libérés. Un message l'explique au joueur.
- **Champs supprimés** : `cur.map.tiles`, `revealed`, `lava` et `base`.
- **Lieux v24** : les lieux `eventSite` sont retirés.
- **Fixture** : je crée `tests/fixtures/save-v24.json.gz` à partir d'une partie v24 réelle, avec un événement en cours, des marches en route, un boss blessé et un trésor révélé. Le test de migration vérifie chaque point ci-dessus.

## 5. Code supprimé une fois la migration faite

- **Dans `liveEvents.js`** : `generateMap`, `freeCell`, l'ancien `addTarget`, `revealAround` sur la grille, `shuffleLava` sur la grille, `liveTravel`, `live.marches`, `planLive`, `sendLive`, `recallLive` et `processLiveMarches`. Ces quatre dernières sont fondues dans les marches du monde. `liveTarget` et `isVisible` sont réécrits.
- **Dans `events.js`** : `mapView`, l'onglet carte, les styles `ev-map` et `ev-cell`, et `openSend` devenu inutile (l'envoi passe par l'écran d'attaque du monde).
- **`src/systems/eventSites.js`** et son panneau `eventSitePanel` dans `world.js`.
- **`def.map`** de chaque événement, remplacé par `def.world`.

## 6. Tests prévus

- **Placement** : déterministe ; respecte les anneaux ; jamais sur rivière, montagne (sauf exception), lieu ou territoire ; pas de doublon ; 24 cibles visibles au plus ; aucune paire à moins de 2 cases.
- **Validation dans le moteur** : actions autorisées selon le type de cible ; cible vaincue refusée ; marche depuis un avant-poste plus rapide qu'une marche depuis la capitale quand l'avant-poste est plus proche.
- **Cycle de vie** : annoncé → actif → boss → vaincu → retiré, puis réapparition avec un palier croissant et un plafond respecté.
- **Un test par événement** pour sa règle propre : nomades qui se déplacent, interception, front de neige qui ralentit, ruine sous le brouillard, piste du dragon, frontière, course aux filons, lave, horde interceptée, direction du siège donnant le flanc, convois sur les routes.
- **Migration** depuis `save-v24`.
- **Validation complète** : `npm test`, `smoke`, `layout`, `overlaps`, `simulate` et `build`.
- **Captures avant/après** de la carte du monde pendant au moins 3 événements (Steppes, Nuit des Morts, Ruée vers l'Or), avec une note « ce qui rapproche de GGE / ce qui s'en écarte ».

## 7. Risques

| Risque | Mesure |
|---|---|
| Le lot est très gros (la moitié de `liveEvents.js`, 1 400 lignes, est réécrite) et peut casser des comportements cachés. | J'avance par étapes, en gardant les tests au vert à chaque étape : d'abord les cibles et le placement, puis les marches unifiées, puis l'interface, puis chaque événement, puis la suppression. |
| La carte du monde est encombrée près de la capitale (lieux existants + 24 cibles). | Le plafond de 24, l'écart minimal de 2 cases, les étiquettes réservées aux cibles proches ou survolées, et le filtre « Événement ». |
| Des avant-postes lointains font apparaître des cibles hors de la zone connue. | Les cibles autour d'un avant-poste ne sont placées que sur des cases révélées (sauf les Ruines). |
| Fusionner les marches change le plafond de marches. | Bonus de marches pendant l'événement, et test qui vérifie que le total disponible ne baisse pas. |
| Les cibles mobiles (nomades, convois, hordes, dragon) coûtent en performance. | Elles bougent seulement au pas du monde, et les sprites sont en cache par phase. |
| Rythme : 72 h sur des distances réelles. | Coefficient `EVENT_TRAVEL` réglable et bot `profileSim` dédié. Les chiffres seront dans `V25.md`. |
| Corsaires et Convoi dépendent de rivières ou de cités libres à portée. Certains mondes en ont peu. | Repli : on place la cible sur la case libre la plus proche qui convient, et sinon sur une plaine (noté dans les limites). |

## 8. Points à trancher avec toi

1. **Temps de marche** : `EVENT_TRAVEL = 4`, qui garde à peu près le rythme actuel, ou le temps réel du monde, qui est 4 fois plus rapide et rend les événements plus nerveux ?
2. **Avant-postes** : est-ce qu'ils servent seulement de point de départ, les troupes partant de l'armée centrale (ma proposition, sans nouveau stock), ou est-ce que tu veux une vraie garnison par avant-poste ? Ce serait un gros changement, que je ferais plutôt dans un autre lot.
3. **Harcèlement des avant-postes** (Steppes, Volcan) : seulement des pertes de ressources ou de production temporaires (ma proposition), sans destruction ?
