# Audit v18 — « L'Armurerie »

**Point de départ** : la v17 « Clair comme le jour ». Les héros (Taverne) portent 7 pièces (arme, casque, armure, gants, bottes, anneau, amulette). Ils sont intendants d'un secteur ou commandants des marches. L'inventaire (Artisanat) est plafonné à 300 objets.

**Scénario de mesure** : `tests/fixtures/save-armurerie.json.gz`, fabriquée avec le code v17. C'est la vraie sauvegarde de fin de partie, jouée 24 h, complétée à 12 héros (6 intendants, 6 libres) et 300 objets de niveaux et raretés variés. La vraie sauvegarde v17 jouée est `tests/fixtures/save-v17.json.gz`.

**Captures « avant »** : `docs/v18/avant/` (`tools/v18shots.cjs --before`, version compilée v17 figée, 3 tailles : 1400 × 900, 1024 × 640, 390 × 844).

## 1. Mesures de départ

| Tâche (12 héros, 300 objets) | Outil | v17 |
|---|---|---|
| Équiper toute la troupe | `tools/v18clicks.cjs --before` | **181 clics**, 35 s de machine |
| Vider l'inventaire (tout ce qui n'est ni porté ni verrouillé) | idem | **889 clics**, 111 s de machine |
| Choix « au plus gros score » contre meilleur choix pour le rôle | `itemScore` contre `roleCoefs` | **68 sur 84** emplacements différents ; le score n'atteint que **32 %** de la valeur atteignable |

Lecture des chiffres :
- Le décompte suppose que le joueur sait déjà quelle pièce prendre : il ouvre le héros, filtre l'emplacement, puis clique « Équiper ». C'est une borne basse.
- Le temps mesuré est celui de la machine, rendu compris, sans le temps de réflexion.
- Pour vider l'inventaire, il faut trois gestes par objet : le choisir, cliquer « Recycler », confirmer.

## 2. Constats vérifiés

1. **Équipement pièce par pièce, sans comparaison** — confirmé. La fiche du héros liste l'inventaire non trié (les pièces portées à la fin) et n'indique jamais si une pièce est meilleure que celle portée.
2. **`itemScore` ignore le rôle** — confirmé et chiffré (tableau ci-dessus).
   - Il additionne des pourcentages et des valeurs brutes de toutes natures.
   - Exemple : la pièce de plus gros score de l'inventaire (Gantelets de mineur, Σ 156) ne rapporte que 6,8 points à l'intendante de l'Agriculture.
3. **Recyclage objet par objet, sans gemmes ni vente** — confirmé.
   - `salvageYield` rend de l'or, de l'acier et du cuir, jamais de gemmes, sans lien avec la recette de forge.
   - La vente d'équipement n'existe pas.
4. **Le plafond de 300 détruit en silence** — confirmé. `inventoryCapTick` recycle les objets les plus faibles selon `itemScore` (donc sans tenir compte du rôle), avec une seule ligne de journal. Un objet non verrouillé que le joueur gardait pour plus tard peut disparaître.
5. **Les gemmes n'ont aucun usage dans l'équipement** — confirmé : bijoux à la forge, recrutement, commandes, expérimentation.

**Constats ajoutés**
6. **Bonus en clés brutes** : la fiche d'un intendant affiche « prod.grain +10% » (capture `01-heros`).
7. **Aucune vocation pour un héros libre** : un général et un explorateur libres sont traités pareil. Rien ne dit s'ils servent à la guerre, à la récolte ou à l'exploration.
8. **Le joueur simulé n'équipe jamais ses héros** : avant la v18, la simulation ne mesurait donc pas l'équipement.

## 3. Ce qui existe déjà (étendu plutôt que dupliqué)

| Idée | Existant | Décision |
|---|---|---|
| Ordres automatiques | `systems/automation.js` (conditions, actions, quotas par palier) | Les **règles de tri** deviennent des ordres (condition `loot`, actions `lootSell`, `lootDismantle`, `lootKeep`), hors quota et disponibles dès le début. **Équiper la troupe** et **maintenir l'armée** deviennent deux nouvelles actions. |
| Liste d'attente de construction | `planConstruction` (3 chantiers planifiés qui démarrent seuls) | Existe déjà : non refaite. |
| « Moitié », « Remplissage auto » | Fenêtre de marche | Les **compositions enregistrées** viennent s'y ajouter. |
| Maintien d'une garnison | Modèle d'ordre « Garnison minimale » (une seule unité) | Étendu en action « compléter l'armée jusqu'à la composition » (toutes ses unités). |
| Relancer les expéditions | Expéditions répétées, ordre « relancer les équipes au repos » | Existe déjà : « favoris » non refaits. |
| Verrouiller un objet | `toggleLock` | Gardé ; il s'y ajoute « Réserver à ce héros » (📌). |
| Réclamer | une dizaine de fonctions `claim*`, un bouton par récompense | « **Tout réclamer** » les appelle toutes. |
| Collections | `collection.js` (artefacts, trophées) | Les **ensembles** y prennent place (salle du trésor). |

## 4. Idées retenues, réduites ou écartées

| Idée | Retenue | Raison |
|---|---|---|
| Valeur par rôle et équipement automatique | **Oui** (prioritaire) | Gain réel, calculé comme la différence de `heroMods` avec et sans l'objet, dans le contexte du rôle. |
| Vente et démantèlement, à l'unité et en masse | **Oui** | Deux usages distincts : la forge rend métal et matériaux, le Joaillier rend or et gemmes. |
| Règles de tri et plafond sans perte | **Oui** | Branchées sur les ordres existants. |
| Gemmes serties (châsses, 5 types, 4 qualités, fusion) | **Oui** | Objets fabriqués à partir de la ressource `gems` existante ; aucune nouvelle ressource. |
| Ensembles | **Oui, 4** | Bonus bornés (au plus +6 %), un par rôle. |
| Tenues (3 par héros) | **Oui** | Revêtues d'office au changement de rôle si on le demande. |
| Transmutation | **Oui** | Améliorer une pièce n'est plus une perte. |
| Réforge | **Oui** | Coût croissant ; la signature du modèle ne se réforge pas. |
| Inventaire confortable (recherche, tri par gain, filtres enregistrés, sélection multiple) | **Oui** | — |
| Conseils de la taverne | **Oui** | Chiffrés, appliqués en un clic. |
| Tout réclamer | **Oui** | — |
| Compositions d'armée | **Oui** | Dans la fenêtre de marche. |
| Maintien automatique de l'armée | **Oui** | Ordre du royaume. |
| Liste d'attente de construction | **Déjà là** | Voir § 3. |
| Expéditions et marches favorites | **Écartée** | Les expéditions se relancent déjà (répétition, ordre « relancer ») ; les compositions couvrent le reste. Un second système ferait doublon. |
| Glisser-déposer d'équipement | **Écartée** | Pas accessible au clavier ni fiable au toucher. « Équiper » et l'équipement automatique suffisent. |

## 5. Règles visées (v18)

1. Une décision d'équipement se fonde sur le **gain pour le rôle**, jamais sur `itemScore`.
2. **Jamais** un objet verrouillé, porté, réservé ou « meilleur pour un héros » n'est vendu ou démantelé par l'équipement automatique, le tri ou le plafond.
3. Toute action en masse a un **aperçu** et s'**annule** juste après.
4. Les gemmes vendues sont **plafonnées par jour**. La vente ne doit pas devenir la première source de gemmes (vérifié en simulation).
5. L'équipement automatique de toute la troupe est **instantané** (300 objets, 12 héros).
6. Nouveaux écrans aux standards v17 : contrastes AA, clavier, cibles de 44 px, ▲ ▼ et des mots plutôt que la couleur seule.
7. Migration v17 **sans perte** ; réglages prudents (butin non équipé d'office, aucune règle de tri).
