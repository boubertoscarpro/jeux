# 💠 Éclats Anciens et 🎡 Roue des Anciens

> Une monnaie rare, prestigieuse, farmable… mais jamais banale. Elle n'est **jamais vendue contre de l'argent réel**.

## Sources (`src/data/shards.js` → `SHARD_CONFIG`)

| Source | Chance de base | Quantité | Plafond quotidien |
|---|---|---|---|
| Expéditions rares (danger 3+ ou prospection) | 1,5 % | 1–3 | 2 |
| Anomalie détectée (le joueur doit intervenir) | ~2 % des retours, 60 % de réussite | 1–2 | 3 |
| Boss de donjon niveau 6+ | 3 % par niveau au-delà de 5 (max 30 %) | 1–2 | 3 |
| Boss mondial (≥ 3 % des dégâts) | 25 % (+25 % pour ≥ 15 %) | 1 | 2 |
| Exploration : « fragment d'un ancien artefact » | 0,6 % | 1 | 2 |
| Expédition interdite (12 h, tous les 4 jours) | 55 % échec avec pertes, 35 % 2–5, 10 % 10–30 | — | — |
| Événements (boutique à stock limité, Citadelle, volcan, météorite) | — | 1–2 | 6 |
| Exploits uniques (donjon 15, confins du monde, merveille…) | une seule fois | 3–5 | — |

### Anti-abus

1. **Rendements décroissants** : chaque trouvaille ajoute de la « chaleur » à sa source. La chance est multipliée par `1 / (1 + chaleur)`, et la chaleur retombe de 1 toutes les 8 h.
2. **Plafond quotidien naturel** : au-delà du plafond, la chance est multipliée par 0,10.
3. **Rotation hebdomadaire** : une source est favorisée chaque semaine (×1,5), dans l'ordre donjons → expéditions → boss → exploration.
4. **Détection** : héros explorateur, observatoire, Œil de l'explorateur et Œil de l'Ancien. Le bonus est **plafonné à +10 %**.
5. **« Les Anciens veillent »** : sans trouvaille depuis 72 h, la chance est multipliée par 2,5. Seuls les joueurs irréguliers en profitent.
6. **Automatisation** : les expéditions automatiques trouvent rarement des Éclats. Une **anomalie** reste sans effet si le joueur n'intervient pas dans l'heure.

## Dépenses

| Option | Coût |
|---|---|
| 🎟️ Ticket de la Roue | 10 |
| 🧰 Coffre de ressources rares | 25 |
| 🧩 Fragment de relique (3 = artefact au choix) | 50 |
| 👑 Faveur des Anciens : récompense légendaire **au choix** | 100 |
| 🎁 Ticket gratuit | tous les 7 jours |

## Roue des Anciens

- **Probabilités affichées** : Commun 70 %, Rare 20 %, Épique 7 %, Légendaire 2,8 %, Mythique 0,2 %. Les secteurs de la roue ont **exactement** ces proportions. Le résultat est tiré avant l'animation, qui ne fait que le montrer : il n'y a pas de faux « presque gagné ».
- **Pitié visible** : un rare est garanti au tour 10, un épique au tour 25, un légendaire au tour 50 et un mythique au tour 100.
- **Doublons** convertis en fragments :
  - légendaire → 10 fragments légendaires (30 = légendaire au choix) ;
  - mythique → 40 fragments mythiques.
- Chaque tour donne aussi 1 ou 2 fragments mythiques. Avec 100 fragments, on fabrique l'objet mythique de son choix.
- **Saisons de 28 jours** : certaines exclusivités (Le Roi sans Couronne, Brise-Royaume en saison 1 ; la Reine des Cendres en saison 2) **ne reviennent jamais**.
- **Exclusivités de la Roue** :
  - le héros Le Roi sans Couronne (+5 % de production, +10 % d'exploration) ;
  - l'arme Brise-Royaume ;
  - la monture Destrier spectral ;
  - l'artefact Œil de l'Ancien ;
  - le Colosse de l'Ancien ;
  - des soldats d'élite à **utilité situationnelle**, et non à puissance brute :
    - Chevalier royal ;
    - Archer impérial (perçant) ;
    - Cavalier céleste (ignore les malus de terrain) ;
    - Gardien ancestral (résiste aux tirs).
- **Jackpot ancestral** (25 % des résultats mythiques) :
  - un trésor ;
  - 25 Cavaliers célestes ;
  - le titre « Élu des Anciens » ;
  - le Colosse de l'Ancien ;
  - un événement réel dans votre royaume : Fête ancestrale (+15 % de production pendant 24 h) et Grande Foire immédiate.
- Les sons (WebAudio) peuvent être coupés, et une animation courte est proposée.

## Profils testés (simulation Monte-Carlo)

`node tools/economySim.js 90 40` rejoue 90 jours pour 40 joueurs par profil. La simulation utilise **le vrai code du jeu** : rendements décroissants, plafonds, Roue et pitié.

Hypothèses d'activité quotidienne (`PROFILES` dans `src/systems/shards.js`) :

| Profil | Exp. rares | Donjons profonds | Boss | Explorations | Exp. interdite | Réagit aux anomalies |
|---|---|---|---|---|---|---|
| Occasionnel | 2 | 0 | 0,3 | 6 | jamais | 30 % |
| Actif | 10 | 1 | 2 | 25 | 1 fois sur 2 | 80 % |
| Hardcore | 30 | 4 | 5 | 60 | toujours | 100 % |

Résultats sur 90 jours :

| Profil | Éclats / jour | Jours / ticket (ticket gratuit inclus) | Tours | Légendaires ou mieux | Mythiques | Joueurs avec ≥ 1 mythique | 1er légendaire+ (médiane) |
|---|---|---|---|---|---|---|---|
| Occasionnel | 0,28 | 6,0 | 15 | 0,45 | 0,07 | 8 % | 43 j |
| Actif | 2,28 | 2,7 | 33 | 0,80 | 0,07 | 8 % | 53 j |
| Hardcore | 5,60 | 1,4 | 63 | 2,23 | 0,20 | 18 % | 43 j |

Origine des Éclats du hardcore, par jour :

| Source | Éclats / jour |
|---|---|
| Boss | 1,19 |
| Donjons | 1,08 |
| Expédition interdite | 1,04 |
| Expéditions | 0,84 |
| Anomalies | 0,68 |
| Événements | 0,65 |
| Exploration | 0,35 |

Aucune source ne domine.

**Lecture** :

- Un joueur occasionnel tourne la Roue environ **une fois par semaine**, grâce au ticket gratuit.
- Un hardcore joue environ **4 fois plus**, et non 20 fois : les rendements décroissants et les plafonds compressent l'écart.
- Même pour un hardcore, un mythique reste un événement (un peu moins d'une chance sur cinq en trois mois). La garantie mythique (100 tours) est à environ 4,5 mois.
- Les tests vérifient automatiquement ces fourchettes (`tests/shards.test.js`, test « Profils »). Toute modification de la configuration qui casserait l'économie fait échouer la suite.

Conformément au principe « mieux vaut trop rare au début », ces valeurs sont **volontairement prudentes**. On peut les assouplir depuis l'onglet Admin (multiplicateur global `shardMult`, chances, plafonds, coût du ticket), sans toucher au code.

## Suivi de l'économie

L'onglet **Admin** affiche sur 14 jours :

- les Éclats générés et dépensés ;
- les tickets ;
- les tours ;
- les légendaires, les mythiques et les jackpots ;
- la répartition par source.

Il affiche aussi la projection par profil, calculée avec la configuration en cours.
