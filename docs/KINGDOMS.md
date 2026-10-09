# 👑 Spécialisations de royaume et parcours guidé

## Créer son royaume

Une **nouvelle partie** ouvre l'écran de création :

1. le nom du royaume et la graine du monde (facultative) ;
2. les **8 spécialisations**, sur des cartes comparables (style, difficulté, 2 bonus, 1 malus). Un clic ouvre la fiche complète : histoire, style, points forts, bonus, malus, départ, stratégie conseillée ;
3. en option : **origine** et **difficulté** (repliées par défaut) ;
4. une **confirmation** qui rappelle que le choix est définitif pour la partie.

La spécialisation est enregistrée dans la sauvegarde (`state.kingdom`). Elle est visible en permanence dans le bandeau du haut (badge cliquable → fiche) et dans *Chronique → Saison & boutique*.

- Elle ne change jamais en cours de partie : aucune fonction du jeu ne le permet.
- Pour en essayer une autre : *Saison & boutique → 🗑️ Nouvelle partie* (confirmation), qui rouvre l'écran de création.
- Fonder une dynastie conserve la spécialisation, l'origine, la difficulté et le parcours guidé déjà accompli.
- Les parties créées avant cette mise à jour deviennent un **« Royaume sans spécialisation »**, sans bonus ni malus : aucun avantage rétroactif.

## Comment les bonus s'appliquent (formules de cumul)

Tous les bonus sont des **modificateurs** ajoutés dans `computeMods` (`src/systems/kingdom.js → kingdomMods`), au même titre que les bâtiments, les technologies, les héros et les événements. Chaque clé est lue par une formule existante du jeu, et les tests (`tests/kingdoms.test.js`) le vérifient pour chaque spécialisation.

| Famille | Formule | Exemple |
|---|---|---|
| Production `prod.<res>`, `prod.all` | base × (1 + Σ prod.<res> + prod.all + bonus local) | Moissons (+15 %) + Charrue (+10 %) + Fête des moissons (+25 %) = ×1,50, et non ×1,15 × 1,10 × 1,25 |
| Coûts `cost.*` | coût × max(0,5 ; 1 + Σ des clés concernées) | formation d'un éclaireur chez les Pionniers : `cost.train` + `cost.train.special` + `cost.unit.scout` |
| Construction | coût × max(0,5 ; 1 + build.cost + cost.build + cost.build.<catégorie>) | Moissons : −15 % sur les bâtiments de la catégorie « food » |
| Stockage | (1 500 + storage) × (1 + storage.pct + storage.<res>) | Moissons : +10 % pour la nourriture seulement |
| Combat | multiplicateur d'attaque / défense d'une pile = 1 + combat.* + class.<classe>.atk/def + formation + terrain + … | Fer : +5 % de défense pour l'infanterie et la cavalerie |
| Autres | additionnés à la clé existante (research.speed, train.speed, upkeep, wall.pct, spy.power…) | Érudits : research.speed +12 % s'ajoute aux technologies |

Les réductions de coût ne descendent **jamais sous 50 %** du prix, quel que soit le cumul.

### Clés ajoutées pour les spécialisations

Chacune est branchée sur une vraie formule :

- `cost.build.<cat>` : construction (`construction.js`)
- `cost.train(.<classe>)`, `cost.unit.<type>` : formation (`army.js → unitCost`)
- `cost.research(.<branche>)` : recherche (`research.js → researchCost`)
- `cost.craft` : forge (`crafting.js → craftCost`)
- `cost.diplomacy` : ambassadeurs (`factions.js → ENVOY_COST`)
- `cost.repair` : réparations (`automation.js → repairCost`)
- `cost.territory` : avant-postes (`territory.js → territoryCost`)
- `cost.expedition` : vivres d'expédition (`expeditions.js`)
- `storage.<res>` : capacité par ressource (`economy.js → storageCap`)
- `famine.resist` : pénalité de moral en famine (`combat.js`)
- `class.<classe>.def` : défense par classe (`combat.js`)
- `expedition.speed` : vitesse des équipes (`expeditions.js`)
- `contract.reward` : récompense des contrats (`market.js`)
- `garrison.def` : garnisons d'avant-poste (`territory.js`)
- `artifact.chance` : artefacts de donjon (`dungeons.js`)
- `relic.find` : fragments de relique des fouilles (`territory.js`)
- `raid.reveal` : composition des raids connue (`rivals.js`)

## Les 8 spécialisations (valeurs finales)

### 🌾 Royaume des Moissons — difficulté ★☆☆

*Les vallées de la Haute-Brune n’ont jamais connu la disette. Leurs greniers ont nourri l’Empire de l’Aube ; ils nourriront votre royaume.*

- **Style** : Économie stable, croissance régulière, commerce de vivres, population nombreuse.
- **Excelle dans** : Agriculture, Stockage, Ouvriers et entretien
- **Bonus** : +15 % de nourriture et de blé ; +10 % de capacité de stockage pour la nourriture ; −15 % sur le coût des bâtiments agricoles ; Famine : pénalité de moral réduite de moitié
- **Malus** : −10 % de fer, −5 % de pierre ; +10 % sur le coût de formation des unités
- **Départ** : +800 nourriture, +120 blé
- **Modificateurs exacts** : `prod.food` +0.15, `prod.grain` +0.15, `storage.food` +0.1, `cost.build.food` -0.15, `famine.resist` +0.5, `prod.iron` -0.1, `prod.stone` -0.05, `cost.train` +0.1
- **Stratégie** : Construisez fermes et moulins au bord de la rivière dès le début, vendez vos surplus de nourriture et entretenez une armée plus grande que vos voisins grâce à vos réserves.

### ⚒️ Royaume de Fer — difficulté ★★☆

*Forgé dans les mines du Mont Cendreux, le Royaume de Fer a survécu à la Fracture à coups de marteau et de discipline.*

- **Style** : Industrie lourde, équipements, armées solides et conquêtes.
- **Excelle dans** : Fer et métallurgie, Forge, Défense des troupes
- **Bonus** : +15 % de fer, +10 % d’acier et d’armes ; −15 % sur le coût de fabrication à la forge ; +5 % de défense pour l’infanterie et la cavalerie
- **Malus** : +12 % d’entretien (nourriture) de l’armée ; −8 % d’or, −5 % de nourriture
- **Départ** : +300 fer, 8 épéistes
- **Modificateurs exacts** : `prod.iron` +0.15, `prod.steel` +0.1, `prod.weapons` +0.1, `cost.craft` -0.15, `class.infantry.def` +0.05, `class.cavalry.def` +0.05, `upkeep` +0.12, `prod.gold` -0.08, `prod.food` -0.05
- **Stratégie** : Placez mines et fonderies près des montagnes, forgez tôt l’équipement de vos héros, puis conquérez les camps voisins avec une infanterie bien protégée. Surveillez la nourriture : vos soldats mangent davantage.

### ⚖️ Royaume des Marchands — difficulté ★★☆

*Port-Sel était un comptoir avant d’être un royaume. On y signe encore les traités sur des balances, et chaque caravane y est une fête.*

- **Style** : Richesse, commerce, contrats, accumulation de ressources rares.
- **Excelle dans** : Caravanes, Marché, Contrats des cités
- **Bonus** : +10 % de recettes des caravanes, caravanes 10 % plus rapides ; Taxe du marché −3 points ; +10 % de récompense des contrats
- **Malus** : +8 % sur le coût de formation des unités ; Convois 20 % plus exposés aux attaques
- **Départ** : +500 or, +10 argent
- **Modificateurs exacts** : `caravan.gain` +0.1, `caravan.speed` +0.1, `market.fee` -0.03, `contract.reward` +0.1, `cost.train` +0.08, `convoy.risk` +0.2
- **Stratégie** : Bâtissez tôt un marché, remplissez les contrats des cités avec vos propres productions et ouvrez des routes vers les cités qui réclament vos marchandises. Escortez vos convois : ils sont plus exposés.

### 📜 Royaume des Érudits — difficulté ★★☆

*Les archivistes d’Aubeclaire ont sauvé des cendres la bibliothèque de l’Empire. Leur royaume avance au rythme de leurs découvertes.*

- **Style** : Optimisation, innovations, automatisation et développement à long terme.
- **Excelle dans** : Recherche, Technologies économiques et artisanales, Découvertes d’exploration
- **Bonus** : +12 % de vitesse de recherche ; −10 % sur le coût des recherches (−15 % en économie et artisanat) ; +2 % de butin rare (découvertes)
- **Malus** : −15 % de vitesse de formation des unités ; +15 % sur le coût des bâtiments militaires
- **Départ** : +250 bois, +300 pierre (pour une bibliothèque rapide)
- **Modificateurs exacts** : `research.speed` +0.12, `cost.research` -0.1, `cost.research.economy` -0.05, `cost.research.craft` -0.05, `loot.rare` +0.02, `train.speed` -0.15, `cost.build.military` +0.15
- **Stratégie** : Construisez la bibliothèque au plus tôt et ne la laissez jamais inactive. Visez les technologies d’économie et d’artisanat, puis l’Intendance. Défendez-vous par la diplomatie le temps que l’armée suive.

### 🧭 Royaume des Pionniers — difficulté ★☆☆

*Descendants des cartographes impériaux, les Pionniers ont appris à vivre en marge des cartes, là où les Terres Brisées cachent leurs trésors.*

- **Style** : Découverte de régions, trésors, donjons, sites rares et reliques.
- **Excelle dans** : Exploration, Expéditions, Éclaireurs
- **Bonus** : Expéditions 15 % plus rapides, éclaireurs 20 % plus rapides ; Rayon d’exploration +0,5 case, +2 % de butin rare ; Éclaireurs −30 % moins chers, vivres d’expédition −20 %
- **Malus** : −10 % de nourriture et de blé
- **Départ** : 4 éclaireurs, carte révélée plus largement autour de la capitale
- **Modificateurs exacts** : `expedition.speed` +0.15, `explore.speed` +0.2, `explore.radius` +0.5, `loot.rare` +0.02, `cost.unit.scout` -0.3, `cost.expedition` -0.2, `prod.food` -0.1, `prod.grain` -0.1
- **Stratégie** : Formez vite des éclaireurs (moins chers), explorez largement pour trouver les meilleurs gisements, puis lancez des expéditions de prospection. Complétez votre nourriture par la récolte sur la carte.

### 🏰 Royaume des Bastions — difficulté ★☆☆

*Haute-Garde n’est jamais tombée. Ses murailles ont arrêté les hordes de la Fracture, et ses bâtisseurs s’en souviennent.*

- **Style** : Défense, sièges, protection des ressources, guerres d’usure.
- **Excelle dans** : Murailles, Défense de la ville, Garnisons des avant-postes
- **Bonus** : Murailles 30 % plus efficaces, +10 % de défense de la ville ; −30 % sur le coût des réparations ; Garnisons des avant-postes +25 % de défense
- **Malus** : Territoires 25 % plus chers à établir ; Engins de siège +20 % plus chers, puissance de siège −10 %
- **Départ** : Muraille niveau 1, 8 lanciers
- **Modificateurs exacts** : `wall.pct` +0.3, `city.def` +0.1, `cost.repair` -0.3, `garrison.def` +0.25, `cost.territory` +0.25, `cost.train.siege` +0.2, `siege.power` -0.1
- **Stratégie** : Montez la muraille et la tour de garde : vos raids seront rarement perdus. Tenez vos avant-postes avec de petites garnisons, laissez l’ennemi s’épuiser, puis contre-attaquez.

### 🕯️ Royaume des Ombres — difficulté ★★★

*Brumeval règne par le murmure plus que par l’épée. Ses émissaires savent avant les rois ce que les rois décideront.*

- **Style** : Renseignement, alliances, préparation des combats, résolution indirecte des conflits.
- **Excelle dans** : Espionnage, Diplomatie, Anticipation des raids
- **Bonus** : +30 % de puissance d’espionnage ; Émissaires et diplomatie −30 % moins chers, espions −25 % ; Raids annoncés 50 % plus tôt, composition toujours connue
- **Malus** : −5 % de toute production ; −5 % d’attaque pour l’infanterie et la cavalerie
- **Départ** : 2 espions, +200 or
- **Modificateurs exacts** : `spy.power` +0.3, `cost.diplomacy` -0.3, `cost.unit.spy` -0.25, `raid.warning` +0.5, `raid.reveal` +1, `prod.all` -0.05, `class.infantry.atk` -0.05, `class.cavalry.atk` -0.05
- **Stratégie** : Envoyez tôt des émissaires (moins chers) pour signer des traités, espionnez les factions hostiles pour connaître leur armée, et ne livrez que les batailles déjà gagnées.

### 🏛️ Royaume des Anciens — difficulté ★★★

*Vos ancêtres gardaient les portes de l’Aube. La Fracture a tout emporté, sauf leurs carnets… et l’instinct de chercher ce qui dort sous les ruines.*

- **Style** : Reliques, donjons, objets rares et contenu de haut niveau.
- **Excelle dans** : Artefacts et collections, Donjons, Technologies anciennes
- **Bonus** : +4 % de butin rare ; +25 % de chance d’artefact dans les donjons ; +50 % de fragments de relique trouvés dans les fouilles ; −15 % sur le coût des technologies anciennes (magie)
- **Malus** : −7 % de nourriture et de fer, −5 % de bois ; Début de partie plus difficile : ressources de départ −25 %
- **Départ** : Ressources de départ −25 %, +5 cristaux
- **Modificateurs exacts** : `loot.rare` +0.04, `artifact.chance` +0.25, `relic.find` +0.5, `cost.research.magic` -0.15, `prod.food` -0.07, `prod.iron` -0.07, `prod.wood` -0.05
- **Stratégie** : Survivez à un début difficile en équilibrant l’économie, puis orientez-vous vers les donjons et les ruines : vos chances d’artefact et de fragments de relique y sont supérieures. N’espérez aucun Éclat gratuit.

## Origines

| Origine | Effet |
|---|---|
| · Sans origine particulière | Aucun effet. |
| 🏛️ Ancienne province impériale | Entrepôt et maison niveau 2 dès le départ · entretien +10 % |
| 🌲 Colonie frontalière | 3 éclaireurs, carte plus révélée, rayon d’exploration +0,5 · défense de la ville −10 % |
| 🔨 Communauté reconstruite | Ressources de départ −20 % · construction +10 % plus rapide, expérience des ouvriers +20 % et des héros +10 % |

## Difficultés

| Difficulté | Effet |
|---|---|
| 🕊️ Guidé | Ressources de départ +30 %, entretien −10 %, 24 h de répit avant les premiers raids, tous les conseils. |
| ⚔️ Classique | Aucun ajustement. |
| 💀 Expert | Ressources de départ −20 %, entretien +10 %, production −5 %, conseils réduits (réactivables). |

### Garde-fous des Anciens

- Aucune clé de modificateur ne touche aux Éclats, à la Roue, à la pitié ou aux légendaires (vérifié par un test).
- `artifact.chance` multiplie seulement la chance d'artefact de donjon (liste fermée, hors exclusivités de la Roue).
- `relic.find` augmente seulement les fragments de relique trouvés par les fouilles d'avant-postes. 3 fragments = 1 artefact de collection, jamais des Éclats.

# 📖 Parcours guidé

8 chapitres. Chaque mission est **détectée automatiquement** depuis l'état réel du jeu (bâtiments, statistiques, armée, technologies…).

- Une mission atteinte reste acquise, même si la condition redescend ensuite.
- Sa récompense se réclame **une seule fois** et la réclamation est enregistrée dans la sauvegarde.
- Un chapitre s'ouvre quand toutes les missions principales du précédent sont atteintes. Il propose alors sa propre récompense, elle aussi unique.
- Les missions secondaires (✳️) ne bloquent jamais la progression.
- Aucune mission ne demande une action impossible : chaque chapitre ne s'ouvre qu'après ceux qui débloquent les bâtiments nécessaires.
- Le chapitre 4 propose un **exercice d'entraînement** contre des mannequins. Aucune perte réelle, aucune ressource dépensée.

### 🏚️ Chapitre 1 — Le dernier hameau

*Les décombres de la Fracture encombrent encore les rues. Avant de rêver de royaume, il faut du bois, de la pierre… et de la place.*

| Mission | Condition | Récompense |
|---|---|---|
| Déblayer le hameau | Cliquez sur une case de décombres dans le royaume et déblayez-la. | 150 bois, 100 pierre |
| Le bruit des haches | Construisez une Scierie à côté d’une forêt (+15 %). | 200 bois, 100 pierre |
| Pierre sur pierre | Construisez une Carrière à côté d’une montagne (+15 %). | 200 pierre, 50 or |
| Un vrai village | Améliorez l’Hôtel de ville au niveau 2. | 300 bois, 300 pierre, 100 or |
| ✳️ Des toits pour tous | Améliorez les Maisons au niveau 2 : plus d’habitants, plus d’or. | 150 bois, 80 or |

**Récompense du chapitre** : 400 bois, 400 pierre, 150 or

### 🌾 Chapitre 2 — Nourrir le peuple

*Un royaume affamé ne tient pas une saison. Vos gens comptent sur vous pour remplir les greniers.*

| Mission | Condition | Récompense |
|---|---|---|
| Nourrir le peuple | Construisez une Ferme (idéalement au bord de la rivière : +10 %). | 200 nourriture, 100 bois |
| Des champs à perte de vue | Ayez 2 fermes, ou une ferme de niveau 3. | 250 nourriture, 150 bois |
| Les comptes du royaume | Consultez le Bilan économique (Production → Bilan) pour voir production, consommation et pertes. | 100 or |
| Greniers pleins | Atteignez un bilan de nourriture positif et 1 000 nourriture en réserve. | 150 or, 100 blé |
| ✳️ Du blé au pain | Construisez un Moulin (près de la rivière : +20 %) pour transformer le blé. | 200 blé, 200 bois |
| ✳️ Le pain des braves | Produisez 100 pains (Ferme → Moulin → Boulangerie). | 400 or, 50 herbes |

**Récompense du chapitre** : 600 nourriture, 300 bois, 200 or

### 🧭 Chapitre 3 — Les routes des Terres Brisées

*Au-delà des collines, le brouillard cache des gisements, des ruines… et des dangers. Il est temps d’ouvrir les routes.*

| Mission | Condition | Récompense |
|---|---|---|
| Des yeux sur le monde | Ayez 3 Éclaireurs (formés à la caserne, ou ceux de départ). | 150 nourriture, 80 or |
| Au-delà des collines | Sur la Carte, envoyez des éclaireurs explorer une case dans le brouillard. | 150 or, 30 herbes |
| Cartographier la vallée | Explorez 5 cases. | 200 or, 200 nourriture |
| Exploiter les terres | Envoyez des troupes récolter un site de ressources sur la carte. | 300 bois, 100 fer |
| ✳️ Paver la route | Construisez une Route reliée à l’Hôtel de ville (les bâtiments reliés produisent davantage). | 200 pierre |

**Récompense du chapitre** : 300 or, 400 nourriture, 30 herbes

### 🛡️ Chapitre 4 — La première garnison

*Des bandits rôdent près des ruines. Avant de les affronter, vos recrues doivent apprendre à tenir la ligne.*

| Mission | Condition | Récompense |
|---|---|---|
| Lever une milice | Construisez une Caserne (près de l’Hôtel de ville : bonus). | 300 nourriture, 100 fer |
| Exercice d’entraînement | Lancez un combat d’entraînement contre des mannequins (aucune perte possible) pour voir comment se déroule une bataille. | 100 fer, 200 nourriture |
| Connaître ses troupes | Consultez l’écran Armée : attaque, défense, vitesse et entretien de chaque unité. | 80 or |
| Premiers soldats | Ayez 20 unités de combat (lanciers, épéistes, archers…). | 400 nourriture, 150 fer |
| Baptême du feu | Remportez un combat contre un camp faible (danger 1) — inutile d’y envoyer toute l’armée. | 300 or, 200 fer |
| ✳️ Compagnons d’armes | Construisez une Taverne et recrutez un second héros. | 200 or |

**Récompense du chapitre** : 300 fer, 500 nourriture, 300 or

### 📚 Chapitre 5 — La connaissance est une arme

*Les archives de l’Empire de l’Aube dorment sous la poussière. Celui qui les rouvrira prendra une génération d’avance.*

| Mission | Condition | Récompense |
|---|---|---|
| Le savoir perdu | Construisez une Bibliothèque et terminez une recherche. | 250 or, 200 bois |
| Trois découvertes | Terminez 3 recherches. | 300 or, 200 pierre |
| Bourg fortifié | Hôtel de ville niveau 3. | 600 bois, 600 pierre, 300 or |
| Déléguer le labeur | Production → Intendance : débloquez le palier « Ouvriers ». | 400 nourriture, 150 or |
| ✳️ Des bras pour le royaume | Ayez 4 ouvriers et affectez-en à un secteur (Production → Ouvriers). | 300 nourriture, 300 bois |
| ✳️ L’enclume chante | Forgez un objet à la Forge. | 30 acier, 20 cuir |
| ✳️ Armé jusqu’aux dents | Équipez un objet sur un héros. | 200 or, 20 cuir |

**Récompense du chapitre** : 500 or, 500 bois, 500 pierre

### ⚖️ Chapitre 6 — Les marchés et les alliances

*Les cités libres commercent avec qui sait tenir parole. Et les royaumes voisins préfèrent souvent un traité à une guerre.*

| Mission | Condition | Récompense |
|---|---|---|
| Le goût de l’or | Construisez un Marché et effectuez une transaction. | 200 or |
| Parole de marchand | Remplissez un contrat d’une cité (Commerce → Marché). | 250 or |
| La première caravane | Envoyez une caravane vers une cité découverte (Commerce → Convois). | 200 or, 200 nourriture |
| L’art de la parole | Envoyez un ambassadeur auprès d’une faction (Monde → Factions). | 200 or |
| ✳️ La plume plutôt que l’épée | Signez un pacte commercial avec une faction. | 800 or, 5 argent |
| ✳️ Frères d’armes | Rejoignez une guilde (Maison de guilde requise). | 500 or |

**Récompense du chapitre** : 800 or, 5 argent

### 💠 Chapitre 7 — Les secrets de la Fracture

*Les cristaux tombés du ciel ont réveillé des lieux oubliés. Les ruines gardent des reliques… et ceux qui les gardent.*

| Mission | Condition | Récompense |
|---|---|---|
| Planter le drapeau | Établissez un avant-poste sur la carte. | 500 or, 400 pierre |
| Un avant-poste utile | Spécialisez un avant-poste et donnez-lui une garnison. | 300 or, 200 fer |
| Là où personne ne va | Nettoyez un site de danger 3 ou plus. | 600 or, 40 acier |
| La première expédition | Formez une équipe et ramenez une expédition (Production → Expéditions). | 300 or, 30 rations |
| ✳️ Dans les profondeurs | Purgez entièrement un donjon. | 2000 or, 5 cristaux |
| ✳️ Le premier artefact | Obtenez un artefact (donjons, ruines, fouilles d’avant-postes, contrats…). | 500 or |

**Récompense du chapitre** : 1000 or, 5 cristaux, 40 acier

### 👑 Chapitre 8 — Le royaume prend son envol

*Le hameau est devenu une puissance. Il reste à l’administrer, à le défendre et à écrire son nom dans la chronique.*

| Mission | Condition | Récompense |
|---|---|---|
| Vers le royaume | Hôtel de ville niveau 5. | 1000 or, 50 acier, 5 argent |
| Des remparts dignes de ce nom | Repoussez un raid, ou montez la Muraille au niveau 3. | 800 pierre, 300 fer |
| Déléguer | Nommez un héros intendant d’un secteur (écran Héros). | 150 or, 200 nourriture |
| ✳️ Le royaume s’administre | Créez votre premier Ordre du royaume (Intendance, palier 4). | 1500 or, 30 charpente |
| ✳️ Le contremaître | Promouvez un ouvrier expérimenté contremaître. | 500 or, 100 planches |
| ✳️ Tueur de légendes | Participez à la chute d’un boss mondial. | 2000 or, 10 cristaux |

**Récompense du chapitre** : 2000 or, 80 acier, 10 argent

### Long terme

| Objectif | Condition | Récompense |
|---|---|---|
| Royaume de Cendrelande | Hôtel de ville niveau 10. | 5000 or, 20 minerai rare, 20 cristaux |
| Bibliothèque de l’Aube | Terminez 20 recherches. | 3000 or, 10 cristaux |
| Marches du royaume | Tenez 4 avant-postes. | 3000 or, 2000 pierre |
| Plus bas que les racines | Purgez un donjon de niveau 5 ou plus. | 4000 or, 15 cristaux |
| Le cabinet des merveilles | Réunissez 5 artefacts. | 5000 or, 5 gemmes |

### Missions royales du jour (3 tirées parmi)

- Chantiers du jour : Terminez 3–5 constructions ou améliorations.
- Éclaireurs du jour : Explorez 2–4 cases.
- Récoltes du jour : Ramenez 1–3 récoltes de la carte.
- Ordre de bataille : Remportez 1–2 combats.
- Jour de marché : Effectuez 2–4 transactions ou caravanes.
- Livraison promise : Remplissez 1–1 contrat.
- Commande de la forge : Forgez 1–2 objet.
- Expédition du jour : Ramenez 1–1 expédition.


## Tableau des objectifs (Royaume → Objectifs)

| Catégorie | Contenu |
|---|---|
| 📖 Principales | Missions du chapitre en cours, plus celles des chapitres précédents encore à réclamer |
| ✳️ Secondaires | Missions facultatives des chapitres ouverts |
| 🗓️ Du jour | 3 missions royales par jour, mesurées depuis le début de la journée. Une mission accomplie mais oubliée est versée le lendemain |
| 🎪 Événement | Missions du jour de l'événement en cours (monnaie d'événement) |
| 🏔️ Long terme | Grands objectifs du royaume |
| 🧭 Suggestions | Prochaines étapes calculées (sans récompense) |

Chaque carte affiche le titre, la description (condition), la progression, la récompense, un bouton **Y aller** (ou **Lancer**) et **Réclamer** quand c'est possible. Le panneau latéral montre le chapitre en cours.

## Conseiller du tableau de bord

Panneau latéral « 🧙‍♂️ Conseiller ». Ses recommandations sont **déterministes**, calculées depuis les données réelles :

- les pénuries prévues et le déficit alimentaire ;
- l'entrepôt plein, les chaînes en manque, les bâtiments endommagés ;
- les ouvriers inactifs, les routes non rentables, les menaces ;
- la prochaine mission du parcours et les récompenses à réclamer ;
- l'économie stable : la technologie conseillée pour votre spécialisation ;
- l'armée trop faible face aux raids, une expédition rentrée, des ressources rares inutilisées.

Comportement :

- Les conseils sont triés par urgence, sans doublon, et limités à 2 par écran cible.
- **⏰** reporte un conseil de 4 h.
- **✕** l'ignore définitivement. Les urgences 🔴 ne peuvent être que reportées.
- Niveaux : **Complet**, **Réduit** (urgences et prochaine étape) ou **Désactivé** (Objectifs → Conseiller et tutoriel).
- Les difficultés Guidé et Classique démarrent en Complet, Expert en Réduit.

## Tutoriel

- Une **fiche par chapitre** s'affiche à son ouverture. Elle reprend l'introduction, le conseil, l'astuce propre à la spécialisation et la première mission.
- Ensuite viennent les fiches contextuelles (famine, raid, ouvriers, marché, événement, avant-poste, saga, Éclats, dynastie).
- Le bouton « Me montrer » **met en évidence** le menu concerné jusqu'à ce que le joueur l'ouvre.
- Chaque fiche ne s'affiche qu'une fois (enregistré dans la sauvegarde) et reste consultable dans *Chronique → Journal → Tutoriel*.
- Les fiches se désactivent (et se réactivent) dans Objectifs. Elles sont désactivées par défaut en difficulté Expert.
- Les parties migrées ne reçoivent pas les fiches de chapitre déjà dépassées.

## Sauvegarde et migration (version 7)

- `state.kingdom = { type, origin, difficulty, chosenAt }`.
- `state.campaign = { chapter, done, claimed, chapterClaimed, unlockedAt, flags, snoozed, dismissed, daily }`.
- Une valeur inconnue (sauvegarde modifiée à la main) est neutralisée : le royaume devient sans spécialisation, et le chapitre est borné entre 1 et 8.

Migration v6 → v7 :

- Spécialisation : royaume sans spécialisation.
- Anciennes quêtes réclamées : marquées réclamées.
- Anciennes quêtes atteintes mais non réclamées : restent réclamables.
- Nouvelles missions déjà accomplies : marquées réclamées **sans récompense**.
- Chapitres déjà dépassés : sautés, sans prime.
- Aucune ressource n'est versée et la partie n'est jamais réinitialisée.

La progression hors ligne fait avancer le monde, mais ne réclame rien. Les missions ne sont validées que sur l'état réellement atteint (testé).
