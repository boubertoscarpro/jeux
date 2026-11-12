# Audit v26 — « Audit, finitions et nouvelles conquêtes »

**Point de départ** : la v25, lot 1 (les événements sur la carte du monde). **Plan** : `docs/PLAN_V26.md`.

**Méthode** : pour chaque bug,
1. un test qui le reproduit (il échouait avant la correction) ;
2. la correction ;
3. le test qui passe.

Les sondes ont tourné pour de vrai : horloge réelle décalée, pas à pas, sauvegarde sur 180 jours, écouteurs et mémoire dans le navigateur, cas limites des événements, migrations. Tous les tests sont dans `tests/v26.test.js`.

Captures :
- **avant** (v25) : `docs/v26/avant-*` ;
- **après** : `docs/v26/apres-*` ;
- **planche des bâtiments** : `docs/v26/apres-planche-batiments.png`.

## 1. Bugs trouvés et corrigés (lot A)

| # | Gravité | Bug | Cause | Correction | Test |
|---|---|---|---|---|---|
| A1 | Moyenne | On pouvait revendiquer la case d'une cible d'événement. La cible devenait alors invisible sur la carte, mais restait attaquable. | `canClaim` laissait passer le type de lieu `evt` (v25) et ignorait les cibles encore cachées sous le brouillard. | Une case qui porte une cible d'événement, visible ou cachée, est refusée (« Case occupée par une cible d'événement »). | `A1` |
| A2 | Moyenne | La v25 promettait des accélérateurs sur les marches d'événement, mais aucune marche n'en profitait : les passe-temps ne servaient qu'aux files. | `findJob` ne cherchait que dans `state.queues`. | Les ordres militaires (passe-temps de recrutement) pressent une marche, du monde ou d'événement, à l'aller comme au retour. Une marche arrivée est traitée aussitôt. Bouton ⏳ sur chaque marche (affichage fixe, écran de l'événement). `AUDIT_V25.md` est corrigé. | `A2` |
| A3 | Moyenne | Le résultat d'une bataille de raid ou d'événement dépendait de l'heure réelle de l'appareil. *Reproduit : 12 h simulées, horloge décalée d'un an → 8 contre 9 miliciens perdus.* | La graine des combats venait de l'identifiant (`uid()`, qui contient l'heure réelle et `Math.random`). | Graine tirée du générateur de la partie à la création du raid ou de la marche (`seed`), avec repli sur l'ancien calcul pour les sauvegardes existantes. | `A3` (horloge réelle quelconque → même état) |
| A4 | Moyenne | Les garnisons des lieux apparus en cours de partie, les donjons et certains scénarios n'étaient pas reproductibles. | `makeEnemies(…, r = Math.random)`, graine de donjon et placements de scénario tirés par `Math.random`. | Générateur à graine de la partie. | `A4` |
| A5 | Basse | Stockage presque plein : l'avertissement n'était jamais affiché. Stockage plein : un message renvoyait vers un menu. | `app.save()` ignorait `r.warning`, et le toast n'avait pas de bouton. | L'avertissement s'affiche une fois. Si le stockage est plein, une fenêtre explique la situation et propose « Télécharger la sauvegarde » ; la partie en mémoire continue. | `A5/A6` |
| A6 | Basse | La sauvegarde grossit avec le temps : **667 Ko au jour 30, 848 Ko au jour 90, 990 Ko au jour 180** (profil actif). La copie de secours double l'espace occupé, face à un quota d'environ 5 Mo. Les clés anti-doublon de l'historique grossissaient sans fin. | Lieux du monde, ouvriers, objets, historique ; `historyKeys` sans limite. | **Sauvegarde compressée** dans le navigateur (LZW, `src/core/lz.js`) : **≈ 20 % de la taille** (480 Ko → 97 Ko), 60 ms pour compresser et 21 ms pour relire. L'ancien format (JSON) se relit toujours, et l'export reste un JSON lisible. Champs par défaut des lieux omis. Clés anti-doublon bornées (2 000). Les nombres restent exacts : une partie rechargée continue exactement comme l'autre. | `A5/A6`, `A6` |
| A7 | Basse | Un événement lancé en retard (le précédent n'était pas fini) durait moins longtemps que prévu. | La fin prévue du créneau était gardée. | La fin est décalée du retard, sans empiéter sur le créneau suivant. | `A7` |
| A8 | Basse | Si l'avant-poste de départ disparaissait pendant la marche, le trait partait encore d'une case vide. | `m.from` figé. | Le trajet se rattache à la capitale. | sonde |
| A9 | Moyenne | Le joueur passif finissait la Guerre des Royaumes et le Siège. | Une partie des points arrivait sans visite (régions tenues, assauts repoussés), et le palier de passe était trop bas. | Une région ou la Citadelle laissée sans ordres depuis 6 h ne rapporte plus qu'un quart. Une région tenue peut être renforcée. Siège : `passScale` 0,20 → 0,23. Le joueur passif ne finit plus (palier 18 sur 20 dans les deux événements). | `A9`, `tools/eventSim.js` |
| A10 | Haute | (trouvé pendant le lot B) La carte du monde plantait dans la version compilée : variable utilisée avant sa déclaration, à cause de la mer du nouveau bord du monde. | Appel placé avant `const now`. | Corrigé. Le jeu compilé (smoke, mise en page) le vérifie désormais à chaque lot. | smoke, layout |
| A11 | Basse | (trouvé pendant le lot B) Sur la carte du monde, la fumée des cheminées, des feux de camp et des forges n'était jamais dessinée. | Les fumées étaient mises de côté pour un calque animé qui n'existe que dans le château. | Fumées animées sur le monde (fixes si les animations sont réduites, absentes en vue d'ensemble). | captures |
| A12 | Basse | Les tests v25 dépendaient du hasard non semé : un échec de temps en temps dans la suite complète. | `rng` non semé dans `fresh()`. | Graine fixe par test. | 5 passages sans échec |

### Tests permanents ajoutés
- **Horloge réelle quelconque → même état**, sur 12 h de la partie de référence (`A3`).
- **12 h d'un coup = 720 pas d'une minute**, état identique.
- **Chaîne de migration complète** : les 10 fixtures (formats v9 et v10, parties v13.3 à v24) migrent vers v11, se rechargent, tournent 24 h, et se relisent sans valeur NaN, infinie ou négative.
- **Sauvegarde compressée** : relue à l'identique, aucun caractère invalide, ancien format accepté, stockage plein → erreur claire sans rien perdre en mémoire.

### Pistes vérifiées sans bug
- **Horloge qui recule** : `shiftTimeline` décale toute la chronologie, données v25 comprises.
- **Changement d'heure** : aucun effet, tout est en millisecondes UTC.
- **Double clic** : déjà protégé (350 ms par bouton).
- **Événements v25** :
  - fin pendant une absence de 12 h avec une marche en route ;
  - rechargement en pleine transition ;
  - rappel d'une marche avec coût ;
  - deux événements qui se suivent (A7).
- **Ressources ou armée négatives, NaN** : aucune, ni dans les 10 fixtures après 24 h, ni dans la partie longue (180 jours, 0 erreur console).

### Fuites (session de 2 h dans le navigateur)
MESURE_FUITES

### Partie longue
- `profileSim`, profil actif sur 180 jours (code du lot A) : 0 erreur console, aucune valeur invalide, aucune ressource négative.
- 30 jours après les lots B et C : MESURE_30J

## 2. Mesures

| Mesure | v25 | v26 |
|---|---|---|
| `npm test` | 472 | **492 réussis, 0 échec** |
| `npm run smoke` | 52 vues, 0 erreur | **53 vues, 491 actions, 0 erreur** |
| `npm run layout` | 372 vérifications | **378 vérifications, aucun problème** |
| `npm run overlaps` | 0 (ville seulement) | **0, ville et carte du monde pendant un événement** (3 tailles × 3 zooms ; aucune étiquette importante masquée) |
| `npm run simulate` | sans erreur | MESURE_SIM |
| Taille du jeu | 2 270 Ko | 2 310 Ko |
| Sauvegarde dans le navigateur (fin de partie) | 480 Ko | **97 Ko** (compressée) |

## 3. Proximité avec GGE (élément par élément)

| Élément | Avant | Après | Reste à faire |
|---|---|---|---|
| Accélérer une marche | Impossible | Ordres militaires sur la marche (aller et retour) | Pas d'accélération « en gemmes » sur les marches (volontaire : les gemmes ne sont pas une monnaie à pousser) |
| Places fortes neutres à conquérir | Aucune | 3 métropoles à assiéger (flancs, vagues, engins), puis pillage, vassalité ou libération | Une seule vague de défenseurs ; pas encore de « niveau de métropole » qui monte avec les prises |
| Bord du monde | Noir | Mer, vagues, brume, falaise et écume | Pas d'îlots décoratifs fixes (seulement les Îles de Cendre, temporaires) |
| Identité des maisons | Style tiré du numéro de rival | Architecture, couleurs et blason dans les données, blason sur la carte | Pas encore de blason sur les marches et les raids |
| Guerres visibles | Seulement les raids vers vous | Fronts entre maisons en guerre, renforts alliés (vert), menaces (rouge) | Les armées de faction sont symboliques (pas d'issue de bataille visible) |
| Prisonniers | Aucun | Capture (seigneur, capitaine de raid, gouverneur, seigneur de la Brèche), 4 choix | Pas de cachot visible au château |
| Ruse défensive | Aucune | Fausses bannières (garnison gonflée ou dégarnie), éventables | — |
| Saison de compétition | Événements (72 h) | Saison de guerre de 21 jours, classement, titres de prestige | Classement simulé hors ligne (jeu solo) |
| Contenu temporaire au bord du monde | Aucun | Îles de Cendre, une semaine sur trois, disputées | Pas de traversée en bateau : on y marche comme ailleurs |
| Récompense de connexion | Aucune | Calendrier de fidélité, sans série à perdre | — |
| Bâtiments qui grandissent | 3 bâtiments par palier | + hôtel de ville, caserne, ferme, marché, forge (6 états chacun) | Différences encore discrètes entre certains paliers voisins (0 et 1) |
| Terrains à bâtir | Grands panneaux partout | Sol et piquets discrets ; le panneau et le nom apparaissent en mode Construire | — |

## 4. Ce qui reste partiel (honnêtement)

- **Calibrage de la Guerre des Royaumes** : le joueur passif ne finit plus (palier 18), mais le joueur moyen simulé non plus (18). Il est limité par la force de son armée de milieu de partie (régions trop fortes au-delà du palier II), pas par son rythme de visites ; un vrai joueur qui renforce son armée finira. À revoir après ton essai.
- **Cibles du monde (B1)** : elles passaient déjà par la même cuisson que le château (matières, contour, ombre portée). La v26 corrige le manque visible (fumées) et ajoute des dessins (île, métropole, blasons), mais ne repeint pas chaque cible à la main.
- **Métropoles** : la contre-attaque d'une maison protectrice se résout par une probabilité (loyauté de la vassale, colère), pas par une vraie bataille contre une garnison.
- **Îles de Cendre** : les maisons rivales prennent les îles par tirage quotidien ; aucune marche rivale n'est visible vers elles.
- **Saison de guerre** : classement contre des seigneurs simulés (jeu solo, hors ligne).
- **Bâtiments** : entre les paliers 0 et 1, la différence est faible pour la caserne, la ferme et le marché.
