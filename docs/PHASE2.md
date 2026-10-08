# Cendrelande — Phase 2 : « Construis. Automatise. Optimise. Explore. Écris ton histoire. »

## 1. Analyse du prototype (phase 1)

Points forts conservés : moteur à horodatages (progression hors-ligne exacte), système central de
modificateurs, données déclaratives, combat tactique, carte procédurale.

Faiblesses identifiées et traitées :

| Constat | Réponse phase 2 |
|---|---|
| Le farm actif = clics répétitifs sur la carte | **Expéditions** d'équipes persistantes, relance automatique |
| Production purement passive, aucun levier de gestion | **Ouvriers** affectés aux secteurs, **contremaîtres**, **priorités** |
| Chaînes figées | Recettes au choix, **quotas**, **réserves**, nouvelles chaînes (planches → charpente → engins, acier → armes, pain → rations) |
| Monde « décor » | **Saisons**, **catastrophes**, terrain dynamique, **factions IA** autonomes |
| Rivaux = simples générateurs de raids | Factions avec économie, armée, territoire, personnalité, **diplomatie**, **espionnage** |
| Commerce sans risque | **Convois** (sécurisé / rapide / clandestin), gardes, attaques, rentabilité par route, **contrats** |
| Donjons statiques | **Donjons procéduraux** à salles, gardiens, affixes, profondeur infinie |
| Pas de mémoire du royaume | **Chronique** datée (an / saison), **records**, **statistiques détaillées** |
| Fin de partie limitée | **Talents permanents**, **doctrines**, **artefacts**, **collections**, **prestige dynastique** |
| Interface à plat (10 onglets) | 9 catégories, sous-onglets **débloqués progressivement** |

## 2. Systèmes livrés

| # | Système | Fichiers moteur | Écran |
|---|---|---|---|
| 1 | Ouvriers (compétence, vitesse, endurance, spécialité, XP, moral, traits) | `systems/workforce.js` | Production → Ouvriers |
| 2 | Contremaîtres (7 spécialités) | `systems/workforce.js` | Production → Ouvriers |
| 3 | Expéditions automatiques (7 types, 10 événements, décisions, consignes) | `systems/expeditions.js` | Production → Expéditions |
| 4 | Arbre d'Intendance (8 paliers, de « manuel » à « Intendance royale ») | `systems/automation.js` | Production → Intendance |
| 5 | Priorités (seuils min/max, réaffectation automatique) | `systems/automation.js` | Production → Intendance |
| 6 | **Ordres du royaume** (SI condition → ALORS action, 9 conditions, 12 actions) | `systems/automation.js` | Production → Intendance |
| 7 | Chaînes configurables (recette, quota, réserve, pause) | `systems/economy.js` | Production → Chaînes |
| 8 | Conseiller (analyse, prévisions, recommandations, questions en langage naturel) | `systems/advisor.js` | 🧙‍♂️ Conseiller |
| 9 | Marché dynamique (saisons, pénuries, guerres, rumeurs) | `systems/market.js`, `living.js` | Commerce |
| 10 | Convois & routes commerciales (modes, gardes, attaques, rentabilité) + contrats | `systems/market.js` | Commerce → Convois |
| 11 | Monde vivant (saisons, catastrophes, incendies, inondations, migrations…) | `systems/living.js` | partout |
| 12 | Factions IA (5 personnalités) + diplomatie + espionnage / contre-espionnage | `systems/factions.js` | Monde → Factions |
| 13 | Donjons procéduraux | `systems/dungeons.js` | Monde → Carte |
| 14 | Talents du royaume, doctrines (builds), prestige dynastique | `systems/talents.js` | Technologies → Talents |
| 15 | Artefacts, collections, trophées | `systems/collection.js` | Chronique → Salle du trésor |
| 16 | Réputations (7 axes) | `systems/reputation.js` | Chronique → Salle du trésor |
| 17 | Choix & conséquences, événements secrets | `systems/decisions.js` | Décisions (panneau latéral) |
| 18 | Chronique procédurale, statistiques, records | `systems/chronicle.js` | Chronique |
| 19 | Recherche automatique (missions des chercheurs) | `systems/automation.js` | Production → Intendance |
| 20 | Rapport « Pendant votre absence » catégorisé | `ui/app.js` | au retour |
| 21 | Agrandissement du domaine + routes pavées | `systems/domain.js`, `economy.js` | Royaume |

**Principe directeur : l'automatisation réduit le travail répétitif, elle ne remplace pas le gameplay.**
Les ordres ne peuvent ni déclarer la guerre, ni signer un traité, ni choisir une technologie de maîtrise,
ni lancer une expédition de donjon : guerres, diplomatie, grandes expéditions, choix technologiques et
décisions politiques restent au joueur.

## 3. Mécaniques originales proposées (et implémentées)

### 1. L'épuisement des sols et la jachère
- **Mécanique** : chaque récolte sur un site augmente son « épuisement » ; un site épuisé se régénère
  plus lentement (÷ (1 + épuisement)). Laissé en jachère, il récupère lentement.
- **Pourquoi** : casse la boucle « toujours le même site le plus proche » — le farming devient une
  rotation à planifier.
- **Intégration** : `worldUpkeep` (régénération) et `finishWork` (expéditions). Le sélecteur de
  destination signale « sol épuisé ».

### 2. Consignes d'expédition (prudente / audacieuse / me demander)
- **Mécanique** : chaque équipe a une consigne. Un événement à choix (effondrement, salle secrète,
  colosse…) est soit tranché automatiquement selon la consigne, soit soumis au joueur ; sans réponse
  en 20 min, le contremaître applique le choix par défaut.
- **Pourquoi** : rend l'automatisation *amusante* et pilotable — le joueur règle un tempérament
  plutôt que de cliquer. Les audacieux gagnent plus et perdent plus.
- **Intégration** : `rollEvent` / `resolveExpeditionEvent`, décisions unifiées dans le panneau latéral.

### 3. Le réseau de routes pavées
- **Mécanique** : une route reliée à l'hôtel de ville donne +5 % aux bâtiments voisins (talents
  « Routes royales » pour l'augmenter).
- **Pourquoi** : l'aménagement du royaume devient un vrai puzzle (bonus d'adjacence + logistique) et
  donne une raison d'agrandir le domaine.
- **Intégration** : `roadConnected()` (parcours en largeur mis en cache) dans `buildingRates`.

### 4. Quotas et réserves de chaînes
- **Mécanique** : chaque atelier peut s'arrêter à un stock cible (quota) et ne jamais puiser un intrant
  sous un seuil (réserve). Les recettes sont interchangeables (planches ↔ charpente, armes ↔ armes de
  chasse, rations ↔ salaisons).
- **Pourquoi** : sans cela, les chaînes se cannibalisent (la boulangerie vide le blé de l'armée…) ;
  avec, l'optimisation devient un jeu en soi.
- **Intégration** : `advanceEconomy`, écran Chaînes, actions d'ordres « pause/relance chaîne ».

### 5. Les ouvriers légendaires
- **Mécanique** : un ouvrier qui atteint le niveau 15 peut être **élevé au rang de héros** (classe
  dérivée de sa profession, rareté épique ou légendaire). La chronique s'en souvient.
- **Pourquoi** : attachement aux individus, « devenir des personnages importants du royaume ».
- **Intégration** : `ascendWorker`, écran Ouvriers.

### 6. Rumeurs de taverne et spéculation
- **Mécanique** : la taverne entend des rumeurs (« le fer va manquer ») 40 à 90 min avant qu'une pénurie
  frappe le marché (prix ×1,8). Le conseiller les signale.
- **Pourquoi** : le commerce récompense l'information et l'anticipation — stocker au bon moment peut
  rendre très riche.
- **Intégration** : `rumorTick` (monde vivant) → `livingMarket` → prix du marché.

### 7. Les contrats des cités
- **Mécanique** : les cités libres publient des commandes à échéance (ex. 600 cuir en 5 h) payées
  ~2× le marché, parfois en argent ou en gemmes. 25 contrats honorés → artefact « Couronne du marchand ».
- **Pourquoi** : donne des objectifs de farm variés et changeants ; valorise les ressources de niche.
- **Intégration** : `contractsTick` / `fulfillContract`, écran Convois & contrats.

### 8. Donjons à affixes et profondeur infinie
- **Mécanique** : chaque donjon est généré (thème, 4 à 9 salles, gardien, boss, 1 à 3 affixes :
  inondé, maudit, ténébreux, étroit…). La progression est conservée entre deux expéditions ; purgé, il se
  reforme plus profond (niveau +1). Seuil de retraite réglable.
- **Pourquoi** : farm endgame sans répétition stricte — les affixes forcent à adapter la composition.
- **Intégration** : `ensureDungeon` / `runDungeon`, marche de type `dungeon`.

### 9. Les doctrines (builds interchangeables)
- **Mécanique** : arbre de talents en 8 branches, 4 builds conseillés (fermier, guerrier, marchand,
  explorateur), 3 emplacements de doctrines sauvegardées ; changer de doctrine a une recharge de 2 h.
- **Pourquoi** : des stratégies réellement différentes entre joueurs, et un choix à assumer.
- **Intégration** : `talentMods` dans `computeMods`.

### 10. L'héritage dynastique (prestige)
- **Mécanique** : à l'hôtel de ville 15, fonder une nouvelle dynastie réinitialise le royaume mais
  conserve talents, artefacts, collections, titres, records, chronique, la moitié des réputations, et
  octroie des points d'héritage (production, garde dynastique, palier d'Intendance de départ…).
- **Pourquoi** : endgame quasi infini, chaque dynastie va plus vite et plus loin.
- **Intégration** : `foundDynasty` crée un nouvel état à partir de l'ancien.

### 11. Les factions vivent sans vous (mais ne vous dépossèdent pas)
- **Mécanique** : les factions s'enrichissent, s'arment, s'étendent (territoires teintés sur la
  carte), se déclarent la guerre entre elles (impact sur le marché, chronique). Elles ne peuvent
  prendre vos avant-postes **que si vous êtes en guerre** avec elles.
- **Pourquoi** : le monde évolue sans que le joueur ait l'impression de perdre le contrôle.
- **Intégration** : `factionsTick`, `raidWillingness` remplace l'ancien déclenchement des raids.

### 12. Le conseiller qui raisonne sur vos données
- **Mécanique** : analyse du bilan horaire, prévisions d'épuisement, équilibre alimentaire, chaînes
  en manque, routes non rentables, menaces ; questions prédéfinies ou libres (« Pourquoi je manque de
  fer ? », « Quelle région conquérir ? » — qui simule réellement les combats possibles).
- **Pourquoi** : transforme le jeu en jeu de gestion lisible, et guide les nouveaux joueurs.
- **Intégration** : `analyze` / `answer` / `interpret` (`systems/advisor.js`).

### 13. Convois clandestins et réputation
- **Mécanique** : le mode clandestin évite la taxe (gains ×1,6) mais triple le risque ; se faire
  prendre nourrit la réputation de tyran. Au-delà d'un seuil de tyrannie, les cités refusent de
  commercer.
- **Pourquoi** : le commerce devient un choix moral et stratégique.

### 14. La guilde comme filet de sécurité
- **Mécanique** : au niveau 4, la guilde escorte vos convois (−25 % de risque) ; au niveau 5, elle
  envoie des renforts lors des raids. Les objectifs de guilde intègrent dégâts de boss, avant-postes et
  sites nettoyés.
- **Pourquoi** : rend la guilde utile au quotidien, pas seulement cosmétique.

## 4. Tests

- `tests/engine.test.js` : moteur de la phase 1 (14 tests).
- `tests/phase2.test.js` : un test par système de la phase 2 (16 tests).
- `tests/bot.test.js` : un bot joue 3 jours simulés en utilisant **tous** les systèmes
  (expéditions, ordres, diplomatie, espionnage, contrats, talents, domaine…), avec sauvegarde/chargement
  réguliers, et vérifie l'absence d'erreur et la cohérence des ressources.
